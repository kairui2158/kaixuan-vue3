export type GenerationValidityKind =
  | 'usable'
  | 'truncated'
  | 'reasoning_exhausted'
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

function consumedOutputBudget(input: GenerationValidityInput): boolean {
  const completionTokens = readCompletionTokens(input.usage)
  const maxTokens = Number(input.maxTokens)
  return completionTokens != null
    && completionTokens > 0
    && Number.isFinite(maxTokens)
    && maxTokens > 0
    && completionTokens >= maxTokens
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

  if (text.trim().length > 0) {
    if (lengthFinish || consumedOutputBudget(input)) {
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

