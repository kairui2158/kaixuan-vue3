import {
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
  const text = hasBody ? String(protocol.extractText(raw) || '') : ''
  const reasoning = hasBody ? String(protocol.extractReasoning(raw) || '') : ''
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
