import { normalizeProviderType, type ProviderType } from './providerProtocols'

export interface NormalizedUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  cacheReadInputTokens?: number
  cacheWriteInputTokens?: number
  reasoningOutputTokens?: number
}

export type NormalizedFinishReason =
  | 'length'
  | 'stop'
  | 'tool_calls'
  | 'content_filter'
  | 'other'

export interface NormalizedToolCallId {
  id: string
  fallback: boolean
}

const USAGE_KEYS: Record<keyof NormalizedUsage, string[]> = {
  inputTokens: ['inputTokens', 'input_tokens', 'promptTokens', 'prompt_tokens', 'promptTokenCount'],
  outputTokens: ['outputTokens', 'output_tokens', 'completionTokens', 'completion_tokens', 'candidatesTokenCount'],
  totalTokens: ['totalTokens', 'total_tokens', 'totalTokenCount'],
  cacheReadInputTokens: [
    'cacheReadInputTokens',
    'cache_read_input_tokens',
    'promptTokensDetails.cacheReadTokenCount',
    'cachedTokens',
    'cached_tokens',
    'cachedContentTokenCount',
  ],
  cacheWriteInputTokens: ['cacheWriteInputTokens', 'cache_write_input_tokens', 'cache_creation_input_tokens'],
  reasoningOutputTokens: [
    'reasoningOutputTokens',
    'reasoning_output_tokens',
    'reasoningTokens',
    'reasoning_tokens',
    'thoughtsTokenCount',
    'completionTokensDetails.reasoning_tokens',
    'completion_tokens_details.reasoning_tokens',
  ],
}

function readFiniteNumber(source: Record<string, unknown>, key: string): number | undefined {
  if (!key.includes('.')) {
    const raw = source[key]
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined
  }
  const [head, tail] = key.split('.')
  const nested = source[head]
  if (!nested || typeof nested !== 'object') return undefined
  const raw = (nested as Record<string, unknown>)[tail]
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined
}

/**
 * Single source for provider usage -> app usage normalization.
 * Raw responses stay untouched; all consumers read this shape.
 */
export function normalizeUsage(providerType: string | undefined, rawUsage: unknown): NormalizedUsage | undefined {
  if (!rawUsage || typeof rawUsage !== 'object') return undefined
  const source = rawUsage as Record<string, unknown>
  const normalized: NormalizedUsage = {}

  for (const [target, keys] of Object.entries(USAGE_KEYS) as Array<[keyof NormalizedUsage, string[]]>) {
    for (const key of keys) {
      const value = readFiniteNumber(source, key)
      if (value != null) {
        normalized[target] = value
        break
      }
    }
  }

  if (normalized.totalTokens == null) {
    const sum = (normalized.inputTokens ?? 0) + (normalized.outputTokens ?? 0)
    if (sum > 0) normalized.totalTokens = sum
  }

  return Object.keys(normalized).length ? normalized : undefined
}

const FINISH_REASON_MAP: Record<string, NormalizedFinishReason> = {
  length: 'length',
  max_tokens: 'length',
  max_output_tokens: 'length',
  stop: 'stop',
  end_turn: 'stop',
  stop_sequence: 'stop',
  eos: 'stop',
  endoftext: 'stop',
  complete: 'stop',
  finished: 'stop',
  tool_calls: 'tool_calls',
  function_call: 'tool_calls',
  tool_use: 'tool_calls',
  content_filter: 'content_filter',
}

/** Provider-specific finish reason values collapse to one protocol vocabulary. */
export function normalizeFinishReason(
  providerType: string | undefined,
  rawReason?: string | null
): NormalizedFinishReason | undefined {
  if (rawReason == null) return undefined
  const key = String(rawReason).trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (!key) return undefined
  return FINISH_REASON_MAP[key] || 'other'
}

function stableFallbackId(providerType: ProviderType, context: string): string {
  const safeContext = String(context || '').replace(/[^a-zA-Z0-9_.:-]+/g, '-')
  return `${providerType}-tool-${safeContext || 'unknown'}`
}

/**
 * Normalizes only the trace-facing tool call id. Native provider ids must be
 * preserved because follow-up wire requests reference them unchanged.
 */
export function normalizeToolCallId(
  providerType: string | undefined,
  rawId: string | number | null | undefined,
  context: string | number
): NormalizedToolCallId {
  const type = normalizeProviderType(providerType)
  const id = rawId == null ? '' : String(rawId).trim()
  if (id) return { id, fallback: false }
  return { id: stableFallbackId(type, String(context)), fallback: true }
}
