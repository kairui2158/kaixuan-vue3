import type { ProviderLike } from './providerAdapter'
import { normalizeUsage } from './traceFieldNormalizer'

export type ThinkingProbeVerdict =
  | 'effective'
  | 'rejected'
  | 'no_effect'
  | 'not_applicable'
  | 'undecidable'
  | 'probe_error'

export interface ThinkingProbeCandidate {
  /** Provider request-body field name, e.g. "thinking". */
  param: string
  /** JSON string or literal value sent verbatim when not valid JSON. */
  value: string
  label: string
}

export interface ThinkingProbeCallResult {
  ok: boolean
  statusCode?: number
  text?: string
  reasoning?: string
  usage?: unknown
  error?: string
}

export type ThinkingProbeCaller = (
  provider: ProviderLike,
  params: { thinkingDisableParam?: string; thinkingDisableValue?: string }
) => Promise<ThinkingProbeCallResult>

export interface ThinkingProbeCandidateAttempt {
  param: string
  label: string
  statusCode?: number
  reasoningChars: number
  textChars: number
  outcome: 'effective' | 'rejected_400' | 'no_effect' | 'unverifiable_response' | 'error'
  note?: string
}

export interface ThinkingProbeResult {
  verdict: ThinkingProbeVerdict
  /** Present only when verdict is effective. */
  param?: string
  value?: string
  baselineReasoningChars: number
  baselineTextChars: number
  requestsUsed: number
  error?: string
  attempts: ThinkingProbeCandidateAttempt[]
  /** ISO 8601 timestamp recorded at persist time by the settings UI. */
  probedAt?: string
}

/**
 * Candidate order follows public provider documentation; the first
 * effective declaration wins and stops the probe. These are convenience
 * presets only — request layers still consume provider-declared fields.
 */
export const THINKING_PROBE_CANDIDATES: ThinkingProbeCandidate[] = [
  { param: 'thinking', value: '{"type":"disabled"}', label: 'GLM / 豆包系' },
  { param: 'enable_thinking', value: 'false', label: 'Qwen3 兼容' },
  { param: 'reasoning_effort', value: '"none"', label: 'OpenAI o 系' },
  { param: 'chat_template_kwargs', value: '{"enable_thinking":false}', label: 'vLLM 自托管' },
]

const EFFECTIVE_REASONING_RATIO = 0.2

function extractReasoningChars(result: ThinkingProbeCallResult): number {
  let chars = typeof result.reasoning === 'string' ? result.reasoning.trim().length : 0
  const usage = normalizeUsage(undefined, result.usage)
  if (usage?.reasoningOutputTokens != null && usage.reasoningOutputTokens > 0) {
    chars = Math.max(chars, usage.reasoningOutputTokens)
  }
  return chars
}

function extractTextChars(result: ThinkingProbeCallResult): number {
  return typeof result.text === 'string' ? result.text.trim().length : 0
}

function effectiveCall(
  provider: ProviderLike,
  caller: ThinkingProbeCaller,
  override: { thinkingDisableParam?: string; thinkingDisableValue?: string }
): Promise<ThinkingProbeCallResult> {
  const probeProvider: ProviderLike = { ...provider, ...override }
  return caller(probeProvider, override)
}

export async function runThinkingProbe(
  provider: ProviderLike,
  caller: ThinkingProbeCaller,
  options?: { candidates?: ThinkingProbeCandidate[] }
): Promise<ThinkingProbeResult> {
  const attempts: ThinkingProbeCandidateAttempt[] = []
  let requestsUsed = 0

  let baseline: ThinkingProbeCallResult
  try {
    // '' explicitly suppresses the provider-level declaration so the baseline
    // measures the model's undisturbed reasoning signal.
    baseline = await effectiveCall(provider, caller, {
      thinkingDisableParam: '',
      thinkingDisableValue: '',
    })
    requestsUsed += 1
  } catch (error: any) {
    return {
      verdict: 'probe_error',
      baselineReasoningChars: 0,
      baselineTextChars: 0,
      requestsUsed: 1,
      error: error?.message || '基线请求失败',
      attempts,
    }
  }

  const baselineReasoningChars = extractReasoningChars(baseline)
  const baselineTextChars = extractTextChars(baseline)
  if (baselineTextChars === 0 && baselineReasoningChars === 0) {
    return {
      verdict: 'undecidable',
      baselineReasoningChars,
      baselineTextChars,
      requestsUsed,
      error: '基线响应无可用文本，无法判定',
      attempts,
    }
  }
  if (baselineReasoningChars === 0) {
    return {
      verdict: 'not_applicable',
      baselineReasoningChars,
      baselineTextChars,
      requestsUsed,
      attempts,
    }
  }

  const candidates = options?.candidates ??
    (provider.thinkingDisableParam
      ? [{
          param: provider.thinkingDisableParam,
          value: provider.thinkingDisableValue ?? '',
          label: '手动声明',
        }]
      : THINKING_PROBE_CANDIDATES)

  let sawNoEffectCandidate = false
  let sawUnverifiableCandidate = false
  let rejectedCount = 0

  for (const candidate of candidates) {
    let result: ThinkingProbeCallResult
    try {
      result = await effectiveCall(provider, caller, {
        thinkingDisableParam: candidate.param,
        thinkingDisableValue: candidate.value,
      })
      requestsUsed += 1
    } catch (error: any) {
      requestsUsed += 1
      const statusCode = Number(error?.statusCode)
      if (statusCode === 400) {
        rejectedCount += 1
        attempts.push({
          param: candidate.param,
          label: candidate.label,
          statusCode: 400,
          reasoningChars: 0,
          textChars: 0,
          outcome: 'rejected_400',
          note: error?.message,
        })
        continue
      }
      attempts.push({
        param: candidate.param,
        label: candidate.label,
        statusCode: Number.isFinite(statusCode) ? statusCode : undefined,
        reasoningChars: 0,
        textChars: 0,
        outcome: 'error',
        note: error?.message || '探测请求失败',
      })
      return {
        verdict: 'probe_error',
        baselineReasoningChars,
        baselineTextChars,
        requestsUsed,
        error: error?.message || '探测请求失败',
        attempts,
      }
    }

    const reasoningChars = extractReasoningChars(result)
    const textChars = extractTextChars(result)
    if (!result.ok) {
      if (result.statusCode === 400) {
        rejectedCount += 1
        attempts.push({
          param: candidate.param,
          label: candidate.label,
          statusCode: 400,
          reasoningChars,
          textChars,
          outcome: 'rejected_400',
          note: result.error,
        })
        continue
      }
      attempts.push({
        param: candidate.param,
        label: candidate.label,
        statusCode: result.statusCode,
        reasoningChars,
        textChars,
        outcome: 'error',
        note: result.error || '探测请求失败',
      })
      return {
        verdict: 'probe_error',
        baselineReasoningChars,
        baselineTextChars,
        requestsUsed,
        error: result.error || '探测请求失败',
        attempts,
      }
    }

    if (textChars === 0) {
      if (reasoningChars > baselineReasoningChars * EFFECTIVE_REASONING_RATIO) {
        sawNoEffectCandidate = true
        attempts.push({
          param: candidate.param,
          label: candidate.label,
          statusCode: result.statusCode,
          reasoningChars,
          textChars,
          outcome: 'no_effect',
          note: '响应无正文且思考信号未收敛',
        })
        continue
      }
      sawUnverifiableCandidate = true
      attempts.push({
        param: candidate.param,
        label: candidate.label,
        statusCode: result.statusCode,
        reasoningChars,
        textChars,
        outcome: 'unverifiable_response',
        note: '响应无正文，无法核对',
      })
      continue
    }

    if (reasoningChars <= baselineReasoningChars * EFFECTIVE_REASONING_RATIO) {
      attempts.push({
        param: candidate.param,
        label: candidate.label,
        statusCode: result.statusCode,
        reasoningChars,
        textChars,
        outcome: 'effective',
      })
      return {
        verdict: 'effective',
        param: candidate.param,
        value: candidate.value,
        baselineReasoningChars,
        baselineTextChars,
        requestsUsed,
        attempts,
      }
    }
    sawNoEffectCandidate = true
    attempts.push({
      param: candidate.param,
      label: candidate.label,
      statusCode: result.statusCode,
      reasoningChars,
      textChars,
      outcome: 'no_effect',
    })
  }

  const verdict: ThinkingProbeVerdict = rejectedCount === candidates.length
    ? 'rejected'
    : sawNoEffectCandidate
      ? 'no_effect'
      : 'undecidable'
  return {
    verdict,
    baselineReasoningChars,
    baselineTextChars,
    requestsUsed,
    attempts,
    error: verdict === 'undecidable' ? '候选响应均无可核对正文' : undefined,
  }
}

export function describeThinkingProbeVerdict(result: ThinkingProbeResult): string {
  switch (result.verdict) {
    case 'effective':
      return `禁思考已生效 · 参数: ${result.param}`
    case 'rejected':
      return '禁思考参数被供应商拒绝，请手动声明'
    case 'no_effect':
      return '禁思考参数未生效'
    case 'not_applicable':
      return '基线无思考输出，无需配置'
    case 'undecidable':
      return '无法判定，需手动声明'
    case 'probe_error':
      return `探测失败: ${result.error || '未知错误'}`
  }
}
