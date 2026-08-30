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
export function extractNonStreamText(data: any): { text: string; reasoning: string; usage?: any } {
  const msg = data?.choices?.[0]?.message || {}
  let text = msg.content || ''
  const reasoning = msg.reasoning_content || ''
  if (!text && reasoning) text = reasoning
  return { text, reasoning, usage: data?.usage }
}

/**
 * Extracts delta from a single SSE JSON chunk.
 * Returns { content, reasoning } — either may be null.
 */
export function extractStreamDelta(json: any): { content: string | null; reasoning: string | null } {
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
export function isSSEDone(payload: string): boolean {
  return payload === '[DONE]'
}
