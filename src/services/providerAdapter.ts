/**
 * Provider Adapter — normalizes baseUrl, auth headers, model defaults,
 * stream/non-stream differences, and response field extraction.
 * Consolidates the 3 scattered baseUrl-mangling patterns found in:
 *   useDeAi.ts L24, OutlineWorkspace.vue L446, provider.ts L180
 */

export interface NormalizedRequest {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

export interface ProviderLike {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  selectedModel: string
  temperature: number
  maxTokens: number
  timeoutMs?: number
  streamMode?: boolean
  systemPrompt?: string
}

/**
 * Ensures baseUrl ends with /v1 (or keeps /vN if already present).
 * Handles 3 known input shapes:
 *   https://api.example.com        -> .../v1/chat/completions
 *   https://api.example.com/v1     -> .../v1/chat/completions
 *   https://api.example.com/v1/     -> .../v1/chat/completions  (trim trailing slash)
 */
export function buildChatUrl(baseUrl: string): string {
  let base = baseUrl.replace(/\/+$/, '')
  if (!/\/v\d+$/.test(base)) base += '/v1'
  return base + '/chat/completions'
}

/**
 * Builds the models list URL (for GET /models or equivalent).
 */
export function buildModelsUrl(baseUrl: string): string {
  let base = baseUrl.replace(/\/+$/, '')
  if (!/\/v\d+$/.test(base)) base += '/v1'
  return base + '/models'
}

/**
 * Creates auth headers for a provider.
 */
export function buildAuthHeaders(provider: ProviderLike): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + provider.apiKey,
  }
}

/**
 * Resolves the effective model, falling back to provider default then a sane default.
 */
export function resolveModel(provider: ProviderLike, modelOverride?: string): string {
  return modelOverride || provider.selectedModel || 'gpt-4o'
}

/**
 * Resolves temperature with optional override.
 */
export function resolveTemperature(provider: ProviderLike, tempOverride?: number): number {
  if (tempOverride != null) return tempOverride
  return provider.temperature ?? 0.7
}

/**
 * Resolves maxTokens, capped at 16384 to prevent 400 errors.
 */
export function resolveMaxTokens(provider: ProviderLike, maxOverride?: number): number {
  const raw = maxOverride ?? provider.maxTokens ?? 8192
  return Math.min(raw, 16384)
}

/**
 * Extracts text content from a non-streaming JSON response.
 * Handles: choices[0].message.content, reasoning_content fallback.
 */
export function extractNonStreamText(data: any): { text: string; reasoning: string; usage?: any; finishReason?: string } {
  const msg = data?.choices?.[0]?.message || {}
  let text = msg.content || ''
  const reasoning = msg.reasoning_content || ''
  if (!text && reasoning) text = reasoning
  return { text, reasoning, usage: data?.usage, finishReason: data?.choices?.[0]?.finish_reason }
}

/**
 * Extracts delta from a single SSE JSON chunk.
 * Returns { content, reasoning } — either may be null.
 */
export function extractStreamDelta(json: any): { content: string | null; reasoning: string | null; finishReason?: string } {
  const delta = json?.choices?.[0]?.delta || {}
  return {
    content: delta.content ?? null,
    reasoning: delta.reasoning_content ?? null,
  }
}

/**
 * Checks if a line is an SSE data line.
 */
export function isSSEDataLine(line: string): boolean {
  return line.startsWith('data: ')
}

/**
 * Checks if an SSE data payload marks end-of-stream.
 */
export function extractFinishReason(json: any): string | undefined {
  return json?.choices?.[0]?.finish_reason ?? json?.finish_reason
}

/**
 * Normalizes provider-specific finish reasons to the app's protocol values.
 * Examples: max_tokens -> length, end_turn/stop_sequence -> stop.
 */
export function normalizeFinishReason(reason?: string): string | undefined {
  if (reason == null) return undefined
  const key = String(reason).trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (!key) return undefined
  if (['length', 'max_tokens', 'max_output_tokens'].includes(key)) return 'length'
  if (['stop', 'end_turn', 'stop_sequence', 'eos', 'endoftext', 'complete', 'finished'].includes(key)) return 'stop'
  if (key === 'function_call') return 'tool_calls'
  return key
}

function readCompletionTokens(usage: any): number | undefined {
  if (!usage || typeof usage !== 'object') return undefined
  const raw = usage.completion_tokens ?? usage.completionTokens ?? usage.output_tokens ?? usage.outputTokens ?? usage.completionTokenCount
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

/**
 * Cross-provider truncation gate. Explicit length markers win; otherwise a
 * completion-token count at/above 95% of max_tokens is treated as truncation.
 */
export function resolveFinishReason(
  finishReason: string | undefined,
  usage: any,
  maxTokens: number,
  hasText: boolean
): string {
  const normalized = normalizeFinishReason(finishReason)
  if (normalized) return normalized
  if (!hasText) return 'stop'
  const completionTokens = readCompletionTokens(usage)
  if (completionTokens == null || completionTokens <= 0 || maxTokens <= 0) return 'stop'
  return completionTokens / maxTokens >= 0.95 ? 'length' : 'stop'
}

export function isSSEDone(payload: string): boolean {
  return payload === '[DONE]'
}
