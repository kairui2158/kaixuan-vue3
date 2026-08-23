/**
 * Unified AI Service Layer — single entry point for all AI API calls.
 * Routes by purpose, handles stream/non-stream, timeout, retry,
 * JSON repair, thinking-tag filter, diagnostics logging.
 *
 * Step 3: full implementation.
 */

import {
  buildChatUrl,
  buildModelsUrl,
  buildAuthHeaders,
  resolveModel,
  resolveTemperature,
  resolveMaxTokens,
  extractNonStreamText,
  extractStreamDelta,
  isSSEDataLine,
  isSSEDone,
  type ProviderLike,
} from './providerAdapter'
import { resolveProvider, type ProviderStoreLike } from './providerRouter'

// ── Types (carried from Step 2 interface) ──────────────────────────

export type ProviderPurpose = 'generate' | 'rewrite' | 'verify' | 'detect' | 'image' | 'video'

export interface AiServiceError {
  kind: 'network' | 'timeout' | 'http' | 'json' | 'auth' | 'canceled'
  message: string
  providerId?: string
  purpose?: ProviderPurpose
  statusCode?: number
}

export class AiServiceErrorImpl extends Error implements AiServiceError {
  kind: AiServiceError['kind']
  providerId?: string
  purpose?: ProviderPurpose
  statusCode?: number
  constructor(params: AiServiceError) {
    super(params.message)
    this.name = 'AiServiceError'
    this.kind = params.kind
    this.providerId = params.providerId
    this.purpose = params.purpose
    this.statusCode = params.statusCode
  }
}

export interface CallAiParams {
  purpose: ProviderPurpose
  messages: Array<{ role: string; content: string }>
  model?: string
  temperature?: number
  maxTokens?: number
  jsonMode?: boolean
  stream?: boolean
  signal?: AbortSignal
  timeoutMs?: number
  retry?: boolean
  meta?: {
    source?: string
    step?: number
    skillId?: string
    agentId?: string
  }
  onChunk?: (text: string) => void
  onReasoning?: (text: string) => void
  onUsage?: (usage: any) => void
  onProgress?: (percent: number, label: string) => void
}

export interface CallAiResult {
  text: string
  reasoning: string
  providerId?: string
  model?: string
  durationMs?: number
  usage?: any
}

export interface AiService {
  callAi(params: CallAiParams): Promise<CallAiResult>
  fetchModels(providerId: string): Promise<string[]>
  testConnection(providerId: string): Promise<{ connected: boolean; error?: string }>
}

// ── Constants ──────────────────────────────────────────────────────

const DEFAULT_NON_STREAM_TIMEOUT = 60_000
const DEFAULT_STREAM_TIMEOUT = 600_000
const RETRY_DELAYS = [2000, 4000, 6000, 8000, 10000, 12000, 15000, 20000]
const MAX_RETRIES = 8
const IDLE_THRESHOLD = 15_000
const IDLE_THRESHOLD_LOW = 10_000
const HEARTBEAT_INTERVAL = 60_000
const MAX_HEARTBEAT_ATTEMPTS = 3

// ── Thinking-tag filter ─────────────────────────────────────────────

const THINKING_PATTERNS = [
  /<thinking>[\s\S]*?<\/thinking>/gi,
  /<reasoning>[\s\S]*?<\/reasoning>/gi,
  /<think>[\s\S]*?<\/think>/gi,
]

function filterThinkingTags(text: string): string {
  let out = text
  for (const re of THINKING_PATTERNS) out = out.replace(re, '')
  return out
}

// ── SSE Stream Parser ──────────────────────────────────────────────

interface StreamCallbacks {
  onChunk?: (text: string) => void
  onReasoning?: (text: string) => void
  onUsage?: (usage: any) => void
}

/**
 * Unified SSE stream parser. Handles data: prefix, [DONE],
 * reasoning_content, and thinking-tag filtering.
 */
async function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  cb: StreamCallbacks
): Promise<{ text: string; reasoning: string }> {
  const decoder = new TextDecoder()
  let fullText = ''
  let reasoningText = ''
  let buffer = ''

  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    buffer += decoder.decode(chunk.value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !isSSEDataLine(trimmed)) continue
      const payload = trimmed.slice(6)
      if (isSSEDone(payload)) continue
      try {
        const json = JSON.parse(payload)
        const delta = extractStreamDelta(json)
        if (delta.reasoning) {
          reasoningText += delta.reasoning
          cb.onReasoning?.(filterThinkingTags(reasoningText))
        }
        if (delta.content) {
          fullText += delta.content
          cb.onChunk?.(filterThinkingTags(fullText))
        }
        if (json.usage && cb.onUsage) cb.onUsage(json.usage)
      } catch { /* skip non-JSON lines */ }
    }
  }
  if (!fullText && reasoningText) fullText = reasoningText
  return { text: fullText, reasoning: reasoningText }
}

// ── JSON Repair ─────────────────────────────────────────────────────

/**
 * Attempts JSON.parse with a single retry: if it fails, sends a
 * follow-up prompt asking for valid JSON and tries again.
 * Only used when params.jsonMode === true.
 */
async function tryJsonParse(
  text: string,
  rawCall: () => Promise<string>
): Promise<string> {
  try {
    JSON.parse(text)
    return text // already valid JSON
  } catch {
    // retry once with explicit instruction
    const repaired = await rawCall()
    try {
      JSON.parse(repaired)
      return repaired
    } catch {
      throw new AiServiceErrorImpl({
        kind: 'json',
        message: 'JSON 解析失败，已重试一次仍无法解析',
      })
    }
  }
}

// ── Timeout helper ──────────────────────────────────────────────────

function makeTimeoutSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs)
}

function combineSignals(...signals: (AbortSignal | undefined)[]): AbortSignal {
  const valid = signals.filter(Boolean) as AbortSignal[]
  if (valid.length === 0) throw new Error('no signals')
  if (valid.length === 1) return valid[0]
  return AbortSignal.any(valid)
}

function waitWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('The operation was aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(new DOMException('The operation was aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

// ── Diagnostic Logger ───────────────────────────────────────────────

export interface DiagnosticLogLike {
  addLog(entry: {
    step: number
    stepName: string
    mode: string
    skillNames: string[]
    providerId?: string
    model?: string
    prompt: string
    result: string
    duration: number
    status: 'success' | 'failed'
  }): void
}

function logRequest(
  logger: DiagnosticLogLike | null,
  params: {
    step?: number
    purpose: ProviderPurpose
    providerId?: string
    model?: string
    prompt: string
    result: string
    durationMs: number
    success: boolean
    skillId?: string
  }
) {
  if (!logger) return

  logger.addLog({
    step: params.step ?? -1,
    stepName: params.purpose,
    mode: params.skillId || 'default',
    skillNames: params.skillId ? [params.skillId] : [],
    providerId: params.providerId || '',
    model: params.model || '',
    prompt: params.prompt.slice(0, 500),
    result: params.result.slice(0, 500),
    duration: params.durationMs,
    status: params.success ? 'success' : 'failed',
  })
 // Push to DiagLogger for real-time DiagLogPanel display (single write path)
  const _diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
  if (_diag && typeof _diag.log === 'function') {
    _diag.log(params.success ? 'info' : 'error', 'ai-service',
      'AI call: purpose=' + params.purpose + ' provider=' + (params.providerId || '?') + ' model=' + (params.model || '?') + ' ' + params.durationMs + 'ms ' + (params.success ? 'OK' : 'FAIL'),
      { providerId: params.providerId, purpose: params.purpose, model: params.model, durationMs: params.durationMs, skillId: params.skillId, result: params.result.slice(0, 300) }
    )
    if (typeof _diag.trackApiCall === 'function') {
      _diag.trackApiCall(params.model || '?', 0, params.durationMs, params.success ? 'ok' : 'error', params.success ? '' : params.result.slice(0, 200))
    }
  }
}

// ── Main: createAiService ───────────────────────────────────────────

/**
 * Factory: creates the singleton AiService instance.
 */
export function createAiService(
  providerStore: ProviderStoreLike,
  logger?: DiagnosticLogLike | null
): AiService {
  const log = logger || null

  async function _rawCall(
    provider: ProviderLike,
    params: CallAiParams,
    timeoutMs: number
  ): Promise<{ text: string; reasoning: string; usage?: any }> {
    const url = buildChatUrl(provider.baseUrl)
    const headers = buildAuthHeaders(provider)
    const model = resolveModel(provider, params.model)
    const temperature = resolveTemperature(provider, params.temperature)
    const maxTokens = resolveMaxTokens(provider, params.maxTokens)
    const wantStream = params.stream !== false
    const signal = combineSignals(params.signal, makeTimeoutSignal(timeoutMs))
    const body: Record<string, unknown> = { model, messages: params.messages, stream: wantStream, temperature, max_tokens: maxTokens }
    const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal })
    if (!resp.ok) throw resp
    if (wantStream) {
      const reader = resp.body!.getReader()
      const result = await parseSSEStream(reader, { onChunk: params.onChunk, onReasoning: params.onReasoning, onUsage: params.onUsage })
      return { ...result, usage: undefined }
    } else {
      const data = await resp.json()
      const extracted = extractNonStreamText(data)
      if (extracted.usage && params.onUsage) params.onUsage(extracted.usage)
      return extracted
    }
  }

  /**
   * The unified callAi entry point.
   */
  async function callAi(params: CallAiParams): Promise<CallAiResult> {
    const startTime = Date.now()
    const { provider, providerId } = resolveProvider(providerStore, params.purpose)
    const wantStream = params.stream !== false
    const timeoutMs = params.timeoutMs ?? (wantStream ? DEFAULT_STREAM_TIMEOUT : DEFAULT_NON_STREAM_TIMEOUT)
    const doRetry = params.retry !== false
    const maxRetries = doRetry ? MAX_RETRIES : 0
    let lastErr: any = null
    let lastResp: { text: string; reasoning: string; usage?: any } | null = null
    const promptPreview = params.messages.map(m => m.content).join(' ').slice(0, 200)
    const throwCanceled = (): never => {
      const durationMs = Date.now() - startTime
      logRequest(log, { step: params.meta?.step, purpose: params.purpose, providerId, model: resolveModel(provider, params.model), prompt: promptPreview, result: '用户取消', durationMs, success: false, skillId: params.meta?.skillId })
      throw new AiServiceErrorImpl({ kind: 'canceled', message: '用户取消', providerId, purpose: params.purpose })
    }

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await _rawCall(provider, params, timeoutMs)
        lastResp = result
        let finalText = filterThinkingTags(result.text)
        if (params.jsonMode) {
          finalText = await tryJsonParse(finalText, () => _rawCall(provider, { ...params, jsonMode: false }, timeoutMs).then(r => r.text))
        }
        const durationMs = Date.now() - startTime
        const _model = resolveModel(provider, params.model)
        logRequest(log, { step: params.meta?.step, purpose: params.purpose, providerId, model: _model, prompt: promptPreview, result: finalText.slice(0, 200), durationMs, success: true, skillId: params.meta?.skillId })
        return { text: finalText, reasoning: result.reasoning, providerId, model: _model, durationMs, usage: result.usage }
      } catch (e: any) {
        // Canceled by user?
        if (params.signal?.aborted) {
          return throwCanceled()
        }
        // A malformed structured response is an application-level terminal
        // error, not a transient network failure. Do not send it through the
        // long network retry and heartbeat recovery path.
        if (e?.kind === 'json') {
          lastErr = e
          break
        }
        // Timeout?
        if (e.name === 'TimeoutError' || e.name === 'AbortError') {
          lastErr = new AiServiceErrorImpl({ kind: 'timeout', message: '请求超时', providerId, purpose: params.purpose })
          if (doRetry && attempt < maxRetries) {
            try { await waitWithSignal(RETRY_DELAYS[attempt], params.signal) }
            catch (ce: any) {
              if (params.signal?.aborted) return throwCanceled()
              throw ce
            }
            continue
          }
          break
        }
        // HTTP error (resp object thrown)
        if (e instanceof Response) {
          const status = e.status
          if (doRetry && (status === 429 || status === 502 || status === 503) && attempt < maxRetries) {
            lastErr = new AiServiceErrorImpl({ kind: 'http', message: 'HTTP ' + status, providerId, purpose: params.purpose, statusCode: status })
            try { await waitWithSignal(RETRY_DELAYS[attempt], params.signal) }
            catch (ce: any) {
              if (params.signal?.aborted) return throwCanceled()
              throw ce
            }
            continue
          }
          if (status === 400 && doRetry && attempt < maxRetries) {
            // 400 adaptive: halve max_tokens
            params = { ...params, maxTokens: Math.floor((params.maxTokens ?? 8192) / 2) }
            lastErr = new AiServiceErrorImpl({ kind: 'http', message: 'HTTP 400, max_tokens halved', providerId, purpose: params.purpose, statusCode: 400 })
            continue
          }
          if (status === 401 || status === 403) {
            throw new AiServiceErrorImpl({ kind: 'auth', message: status === 401 ? 'API Key 无效' : '访问被禁止', providerId, purpose: params.purpose, statusCode: status })
          }
          lastErr = new AiServiceErrorImpl({ kind: 'http', message: 'HTTP ' + status, providerId, purpose: params.purpose, statusCode: status })
          if (doRetry && attempt < maxRetries) {
            try { await waitWithSignal(RETRY_DELAYS[attempt], params.signal) }
            catch (ce: any) {
              if (params.signal?.aborted) return throwCanceled()
              throw ce
            }
            continue
          }
          break
        }
        // Network error
        lastErr = new AiServiceErrorImpl({ kind: 'network', message: e.message || '网络错误', providerId, purpose: params.purpose })
        const noRetry = e.message?.includes('API Key') || e.message?.includes('访问被禁止') || e.message?.includes('接口不存在')
        if (doRetry && attempt < maxRetries && !noRetry) {
          try { await waitWithSignal(RETRY_DELAYS[attempt], params.signal) }
          catch (ce: any) {
            if (params.signal?.aborted) return throwCanceled()
            throw ce
          }
          continue
        }
        break
      }
    }

    // Heartbeat reconnection (from useAiRequest Layer 5)
    if (doRetry && lastErr && lastErr.kind !== 'json') {
      let hbAttempt = 0
      while (hbAttempt < MAX_HEARTBEAT_ATTEMPTS) {
        hbAttempt++
        try {
          await waitWithSignal(HEARTBEAT_INTERVAL, params.signal)
        } catch (e: any) {
          if (params.signal?.aborted || e.name === 'AbortError') {
            return throwCanceled()
          }
          throw e
        }
        try {
          const hbSignal = combineSignals(params.signal, makeTimeoutSignal(timeoutMs))
          const hbParams = { ...params, signal: hbSignal }
          const result = await _rawCall(provider, hbParams, timeoutMs)
          let finalText = filterThinkingTags(result.text)
          if (params.jsonMode) {
            finalText = await tryJsonParse(finalText, () => _rawCall(provider, { ...params, jsonMode: false }, timeoutMs).then(r => r.text))
          }
          const durationMs = Date.now() - startTime
          const _hbModel = resolveModel(provider, params.model)
          logRequest(log, { step: params.meta?.step, purpose: params.purpose, providerId, model: _hbModel, prompt: promptPreview, result: finalText.slice(0, 200), durationMs, success: true, skillId: params.meta?.skillId })
          return { text: finalText, reasoning: result.reasoning, providerId, model: resolveModel(provider, params.model), durationMs, usage: result.usage }
        } catch (hbErr: any) {
          if (params.signal?.aborted) {
            return throwCanceled()
          }
          console.warn('[HEARTBEAT] Probe ' + hbAttempt + ' failed: ' + hbErr.message)
        }
      }
    }

    const durationMs = Date.now() - startTime
    logRequest(log, { step: params.meta?.step, purpose: params.purpose, providerId, model: resolveModel(provider, params.model), prompt: promptPreview, result: lastErr?.message || 'unknown', durationMs, success: false, skillId: params.meta?.skillId })
    throw lastErr || new AiServiceErrorImpl({ kind: 'network', message: 'unknown error', providerId, purpose: params.purpose })
  }

  async function fetchModels(providerId: string): Promise<string[]> {
    const p = providerStore.providers.find(x => x.id === providerId)
    if (!p) throw new Error('Provider not found: ' + providerId)
    const url = buildModelsUrl(p.baseUrl)
    const headers = buildAuthHeaders(p)
    const resp = await fetch(url, { method: 'GET', headers, signal: makeTimeoutSignal(30_000) })
    if (!resp.ok) throw new Error('Failed to fetch models: HTTP ' + resp.status)
    const data = await resp.json()
    const models = Array.isArray(data) ? data.map((m: any) => m.id || m.name).filter(Boolean) : (data.data?.map((m: any) => m.id).filter(Boolean) || [])
    return models
  }

  async function testConnection(providerId: string): Promise<{ connected: boolean; error?: string }> {
    try {
      await fetchModels(providerId)
      return { connected: true }
    } catch (e: any) {
      return { connected: false, error: e.message }
    }
  }

  return { callAi, fetchModels, testConnection }
}
