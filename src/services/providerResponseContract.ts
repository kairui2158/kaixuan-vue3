import {
  extractProviderErrorSummary,
  getProviderProtocol,
  type ProviderType,
} from './providerProtocols'

export type ProviderResponseKind =
  | 'ok'
  | 'network'
  | 'timeout'
  | 'http'
  | 'json'
  | 'auth'
  | 'canceled'

export interface ProviderResponseContractInput {
  ok: boolean
  kind?: ProviderResponseKind
  statusCode?: number
  message?: string
  providerErrorSummary?: string
  data?: any
  text?: string
  stream?: boolean
  canceled?: boolean
}

export interface ProviderResponseContract {
  ok: boolean
  kind: ProviderResponseKind
  transportKind: 'stream' | 'non-stream'
  statusCode?: number
  message?: string
  providerErrorSummary?: string
  text: string
  reasoning: string
  usage?: any
  finishReason?: string
  raw?: any
  canceled: boolean
}

const PROVIDER_SOFT_ERROR_PATTERNS = [
  /quota[_\s-]?(?:exhaust|exceeded|limit)/i,
  /insufficient[_\s-]?(?:balance|credit|quota)/i,
  /(?:balance|credit)[_\s-]?(?:exhaust|insufficient)/i,
  /(?:plan|subscription)[_\s-]?(?:limit|exhaust|expired)/i,
  /(?:额度|余额|配额|套餐|订阅)(?:已)?(?:耗尽|不足|到期|用完|超限)/,
  /请(?:充值|续费|升级|购买).{0,24}(?:额度|余额|套餐|配额)?/,
]

export interface ProviderSoftFailureClassification {
  softError: boolean
  quota: boolean
  abnormalZeroUsage: boolean
}

export function extractSoftProviderErrorBody(raw: any): { error?: any; message?: string } | null {
  if (!raw || typeof raw !== 'object') return null
  if (raw.error || raw.message || raw.msg) return raw
  if (Array.isArray(raw.choices) && raw.choices.length === 0 && (raw.usage || raw.prompt_tokens || raw.completion_tokens)) {
    return { message: JSON.stringify(raw).slice(0, 500) }
  }
  return null
}

function hasProviderSoftQuotaError(text: string): boolean {
  return PROVIDER_SOFT_ERROR_PATTERNS.some(pattern => pattern.test(text))
}

function hasAbnormalZeroUsage(usage: any): boolean {
  if (!usage || typeof usage !== 'object') return false
  const inputTokens = Number(usage.inputTokens ?? usage.promptTokens ?? usage.prompt_tokens ?? usage.input_tokens)
  const outputTokens = Number(usage.outputTokens ?? usage.completion_tokens ?? usage.completionTokens ?? usage.output_tokens)
  const totalTokens = Number(usage.totalTokens ?? usage.total_tokens ?? usage.totalTokenCount)
  const allNumbers = [inputTokens, outputTokens, totalTokens].filter(value => Number.isFinite(value))
  if (allNumbers.length === 0) return false
  // A non-empty placeholder body plus zero completion usage is still a fake
  // success: some gateways return short fallback prose while claiming that
  // the model produced no output tokens.
  return Number.isFinite(totalTokens) && totalTokens > 0
    && inputTokens === 0
    && outputTokens === 0
}

/**
 * Trust a durable content contract over a provider usage field. A complete
 * novel envelope has explicit body and handoff metadata and must not be killed
 * by transport-layer usage anomalies; downstream acceptance owns quality.
 */
function hasStructuredZeroUsageArtifact(text: string): boolean {
  try {
    const parsed = JSON.parse(String(text || '').trim())
    return Boolean(parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      && typeof parsed.body === 'string' && parsed.body.trim().length > 0
      && parsed.metadata?.extractedMeta?.length > 0)
  } catch {
    return false
  }
}

export function classifyProviderSoftFailure(
  contract: ProviderResponseContract,
): ProviderSoftFailureClassification {
  const body = contract.ok
    ? extractSoftProviderErrorBody(contract.raw)
    : null
  const hasContent = Boolean(contract.text || contract.reasoning)
  const abnormalZeroUsage = contract.transportKind === 'stream'
    && hasAbnormalZeroUsage(contract.usage)
  return {
    softError: Boolean(body) && !hasContent,
    quota: Boolean(body && hasProviderSoftQuotaError(extractProviderErrorSummary(body))),
    abnormalZeroUsage: abnormalZeroUsage && !hasStructuredZeroUsageArtifact(contract.text),
  }
}

export function normalizeProviderResponse(
  response: ProviderResponseContractInput,
  options: { protocolName: ProviderType | string; providerId?: string; purpose?: string }
): ProviderResponseContract {
  const protocol = getProviderProtocol(options.protocolName as ProviderType)
  const canceled = response.kind === 'canceled' || response.canceled === true
  let raw = response.data
  if (raw == null && typeof response.text === 'string' && response.text.trim() !== '') {
    // The main-process bridge returns both parsed data and the raw body. Some
    // tests and future transports provide only text; parse it here so all
    // transports converge on one response contract.
    try { raw = JSON.parse(response.text) } catch { raw = undefined }
  }
  const hasBody = Boolean(response.ok && raw && typeof raw === 'object')
  // OpenAI-compatible stream frames put the accumulated payload in delta
  // fields, while some gateways still put it on message. Aggregate both so
  // transport classification sees the same content contract as the renderer.
  const streamDeltas: Array<{ content: string; reasoning: string }> = hasBody && Array.isArray(raw?.choices)
    ? raw.choices.map((choice: any) => ({
      content: String(choice?.delta?.content ?? ''),
      reasoning: String(choice?.delta?.reasoning_content ?? ''),
    }))
    : []
  const messageText = hasBody ? String(protocol.extractText(raw) || '') : ''
  const streamText = streamDeltas.map(delta => delta.content).join('')
  const messageReasoning = hasBody ? String(protocol.extractReasoning(raw) || '') : ''
  const streamReasoning = streamDeltas.map(delta => delta.reasoning).join('')
  const text = messageText || streamText
  const reasoning = messageReasoning || streamReasoning
  return {
    ok: response.ok === true,
    kind: response.ok ? 'ok' : (response.kind || 'network'),
    transportKind: response.stream === true ? 'stream' : 'non-stream',
    statusCode: response.statusCode,
    message: response.message,
    providerErrorSummary: response.providerErrorSummary,
    text,
    reasoning,
    usage: hasBody ? protocol.extractUsage(raw) : undefined,
    finishReason: hasBody ? protocol.extractFinishReason(raw) : undefined,
    raw,
    canceled,
  }
}
