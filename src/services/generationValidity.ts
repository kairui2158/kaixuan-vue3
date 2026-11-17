import { detectVisiblePlanningRatio, VISIBLE_PLANNING_RATIO_THRESHOLD } from './visiblePlanningText'

export type GenerationValidityKind =
  | 'usable'
  | 'truncated'
  | 'reasoning_exhausted'
  | 'visible_planning'
  | 'empty'
  | 'canceled'
  | 'error'

export interface GenerationValidity {
  kind: GenerationValidityKind
  usable: boolean
  message: string
}

export interface GenerationValidityInput {
  text?: string | null
  reasoning?: string | null
  toolCalls?: Array<{ name?: string | null } | null> | null
  finishReason?: string | null
  usage?: Record<string, unknown> | null
  maxTokens?: number | null
  canceled?: boolean
  blocked?: boolean
  blockedReason?: string | null
  error?: string | null
}

const LENGTH_FINISH_REASONS = new Set(['length', 'max_tokens', 'max_output_tokens'])
const VISIBLE_PLANNING_BUDGET_MESSAGE = '模型把规划文本写进了可见输出通道而不是正文，未生成有效内容'

function normalizeFinishReason(reason?: string | null): string | undefined {
  if (reason == null) return undefined
  const key = String(reason).trim().toLowerCase().replace(/[\s-]+/g, '_')
  return key || undefined
}

function readCompletionTokens(usage?: Record<string, unknown> | null): number | undefined {
  if (!usage) return undefined
  const raw = usage.completion_tokens ?? usage.completionTokens ?? usage.output_tokens
    ?? usage.outputTokens ?? usage.completionTokenCount
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

function readTotalTokens(usage?: Record<string, unknown> | null): number | undefined {
  if (!usage) return undefined
  const raw = usage.totalTokens ?? usage.total_tokens ?? usage.totalTokenCount
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

function readReasoningOutputTokens(usage?: Record<string, unknown> | null): number | undefined {
  if (!usage) return undefined
  const raw = usage.reasoningOutputTokens ?? usage.reasoning_output_tokens
    ?? usage.reasoningTokens ?? usage.reasoning_tokens
    ?? usage.thoughtsTokenCount
    ?? (usage.completionTokensDetails as Record<string, unknown> | undefined)?.reasoning_tokens
    ?? (usage.completion_tokens_details as Record<string, unknown> | undefined)?.reasoning_tokens
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

function consumedOutputBudget(input: GenerationValidityInput): boolean {
  const completionTokens = readCompletionTokens(input.usage)
  const reasoningTokens = readReasoningOutputTokens(input.usage) ?? 0
  const bodyTokens = completionTokens != null && reasoningTokens > 0
    ? Math.max(0, completionTokens - reasoningTokens)
    : completionTokens
  const maxTokens = Number(input.maxTokens)
  return bodyTokens != null
    && bodyTokens > 0
    && Number.isFinite(maxTokens)
    && maxTokens > 0
    && bodyTokens >= maxTokens
}

const DEFINITIVE_NON_LENGTH_FINISH = new Set([
  'stop',
  'end_turn',
  'tool_calls',
  'tool_use',
  'content_filter',
])

function isDefinitiveNonLengthFinish(input: GenerationValidityInput): boolean {
  const reason = normalizeFinishReason(input.finishReason)
  return reason != null && DEFINITIVE_NON_LENGTH_FINISH.has(reason)
}

function isLengthFinish(input: GenerationValidityInput): boolean {
  const reason = normalizeFinishReason(input.finishReason)
  return reason != null && LENGTH_FINISH_REASONS.has(reason)
}

export function classifyGenerationValidity(input: GenerationValidityInput): GenerationValidity {
  if (input.canceled) {
    return { kind: 'canceled', usable: false, message: '用户取消了本次生成' }
  }

  if (input.error) {
    return { kind: 'error', usable: false, message: String(input.error) }
  }

  const text = typeof input.text === 'string' ? input.text : ''
  const reasoning = typeof input.reasoning === 'string' ? input.reasoning : ''
  const lengthFinish = isLengthFinish(input)
  const hasToolCall = input.toolCalls?.some(call =>
    typeof call?.name === 'string' && call.name.trim().length > 0
  ) === true

  if (hasToolCall) {
    return {
      kind: 'usable',
      usable: true,
      message: '工具调用有效'
    }
  }

  // Some gateways return short fallback prose while reporting zero output
  // tokens against a non-zero total. The prose is not model work; treating it
  // as usable lets placeholder text pollute candidate selection.
  const outputTokens = readCompletionTokens(input.usage)
  const totalTokens = readTotalTokens(input.usage)
  if (text.trim().length > 0 && outputTokens === 0 && totalTokens != null && totalTokens > 0) {
    return {
      kind: 'empty',
      usable: false,
      message: '供应商返回占位文本且输出 usage 为零，判定为假成功'
    }
  }

  if (text.trim().length > 0) {
    if (
      detectVisiblePlanningRatio(text) >= VISIBLE_PLANNING_RATIO_THRESHOLD
      && (lengthFinish || consumedOutputBudget(input))
    ) {
      return {
        kind: 'visible_planning',
        usable: false,
        message: VISIBLE_PLANNING_BUDGET_MESSAGE
      }
    }
    if (lengthFinish || (!isDefinitiveNonLengthFinish(input) && consumedOutputBudget(input))) {
      return {
        kind: 'truncated',
        usable: true,
        message: '输出达到输出上限，正文不完整'
      }
    }
    return { kind: 'usable', usable: true, message: '产物有效' }
  }

  if (lengthFinish || consumedOutputBudget(input)) {
    if (reasoning.trim().length > 0) {
      return {
        kind: 'reasoning_exhausted',
        usable: false,
        message: '模型思考耗尽输出预算，未生成正文'
      }
    }
    return { kind: 'empty', usable: false, message: '模型没有返回正文' }
  }

  return { kind: 'empty', usable: false, message: '模型没有返回正文' }
}

export const GENERATION_VALIDITY_MESSAGES: Record<GenerationValidityKind, string> = {
  usable: '产物有效',
  truncated: '输出被截断，已自动续写合并；如仍不完整，请减少单步任务量或提高 maxTokens',
  reasoning_exhausted: '模型思考耗尽输出预算，未生成正文；已重试 1 次仍失败',
  visible_planning: '模型把规划文本写进了可见输出通道而不是正文，未生成有效内容；已重试 1 次仍失败',
  empty: '模型没有返回正文，请检查模型/供应商配置',
  canceled: '用户取消了本次生成',
  error: '生成失败，请查看运行记录中的原始错误'
}

export type RunOutcomeStatus = 'success' | 'degraded' | 'failed' | 'canceled' | 'blocked'

export interface RunOutcome {
  status: RunOutcomeStatus
  error?: string
}

export function classifyRunOutcome(input: GenerationValidityInput): RunOutcome {
  if (input.blocked) return { status: 'blocked', error: input.blockedReason || '生成已被阻断，等待恢复条件' }
  const validity = classifyGenerationValidity(input)
  if (validity.kind === 'canceled') return { status: 'canceled', error: validity.message }
  if (!validity.usable) return { status: 'failed', error: validity.message }
  if (validity.kind === 'truncated') return { status: 'degraded', error: validity.message }
  return { status: 'success' }
}

