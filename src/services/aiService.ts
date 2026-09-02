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
  extractFinishReason,
  resolveFinishReason,
  isSSEDataLine,
  isSSEDone,
  type ProviderLike,
} from './providerAdapter'
import {
  buildProviderChatUrl,
  buildProviderHeaders,
  buildProviderModelsUrl,
  buildProviderModelsHeaders,
  getProviderProtocol,
  httpErrorMessage,
  extractProviderErrorSummary,
  readErrorBody,
  sanitizeUrlForLog,
  normalizeProviderType,
} from './providerProtocols'
import { resolveProvider, type ProviderStoreLike } from './providerRouter'

// ── Types (carried from Step 2 interface) ──────────────────────────

export type ProviderPurpose = 'generate' | 'rewrite' | 'verify' | 'detect' | 'image' | 'video'

export interface AiServiceError {
  kind: 'network' | 'timeout' | 'http' | 'json' | 'auth' | 'canceled'
  message: string
  providerId?: string
  purpose?: ProviderPurpose
  statusCode?: number
  providerErrorSummary?: string
}

export class AiServiceErrorImpl extends Error implements AiServiceError {
  kind: AiServiceError['kind']
  providerId?: string
  purpose?: ProviderPurpose
  statusCode?: number
  providerErrorSummary?: string
  constructor(params: AiServiceError) {
    super(params.message)
    this.name = 'AiServiceError'
    this.kind = params.kind
    this.providerId = params.providerId
    this.purpose = params.purpose
    this.statusCode = params.statusCode
    this.providerErrorSummary = params.providerErrorSummary
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
    ctxTurns?: number
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
  finishReason?: string
}

export interface AiService {
  callAi(params: CallAiParams): Promise<CallAiResult>
  fetchModels(providerId: string): Promise<string[]>
  fetchModelsForProvider(provider: ProviderLike): Promise<string[]>
  testConnection(providerId: string): Promise<{ connected: boolean; error?: string; note?: string }>
  testConnectionForProvider(provider: ProviderLike): Promise<{ connected: boolean; error?: string; note?: string }>
}

// ── Constants ──────────────────────────────────────────────────────

const DEFAULT_NON_STREAM_TIMEOUT = 300_000
const DEFAULT_STREAM_TIMEOUT = 600_000
const RETRY_DELAYS = [1000, 2000, 3000]
const MAX_RETRIES = 3
const IDLE_THRESHOLD = 15_000
const IDLE_THRESHOLD_LOW = 10_000
const HEARTBEAT_INTERVAL = 60_000
const MAX_HEARTBEAT_ATTEMPTS = 3

const TABLE_OUTPUT_GUIDELINE = [
  '如果本次回答需要展示表格，必须使用 GFM 标准表格：',
  '首行为表头；第二行只使用半角 |、短横线和冒号作为分隔行；',
  '每个单元格使用半角 | 分隔，单元格内不换行。',
  '如果没有表格内容，不要输出空表或伪造表格。'
].join('\n')

function withTableOutputGuideline(
  messages: CallAiParams['messages'],
  jsonMode: boolean
): CallAiParams['messages'] {
  if (jsonMode) return messages
  const hasSystem = messages.some(message => message.role === 'system')
  if (hasSystem) {
    return messages.map(message => message.role === 'system'
      ? { ...message, content: `${message.content}\n\n${TABLE_OUTPUT_GUIDELINE}` }
      : message
    )
  }
  return [{ role: 'system', content: TABLE_OUTPUT_GUIDELINE }, ...messages]
}


// ── Thinking-tag filter ─────────────────────────────────────────────

const THINKING_PATTERNS = [
  /<thinking>[\s\S]*?<\/thinking>/gi,
  /<reasoning>[\s\S]*?<\/reasoning>/gi,
  /<think>[\s\S]*?<\/think>/gi,
]

export function filterThinkingTags(text: string): string {
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
  cb: StreamCallbacks,
  protocolName: string = 'openai-compatible'
): Promise<{ text: string; reasoning: string; finishReason?: string }> {
  const decoder = new TextDecoder()
  let fullText = ''
  let reasoningText = ''
  let finishReason: string | undefined
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
        if (protocolName === 'gemini') {
          const text = (json?.candidates?.[0]?.content?.parts || []).map((part: any) => part?.text || '').join('')
          if (text) {
            fullText += text
            cb.onChunk?.(filterThinkingTags(fullText))
          }
          finishReason = json?.candidates?.[0]?.finishReason || finishReason
          if (json?.usageMetadata && cb.onUsage) cb.onUsage(json.usageMetadata)
        } else if (protocolName === 'anthropic') {
          if (json?.type === 'content_block_delta') {
            const text = json?.delta?.text || ''
            const thinking = json?.delta?.thinking || ''
            if (thinking) {
              reasoningText += thinking
              cb.onReasoning?.(filterThinkingTags(reasoningText))
            }
            if (text) {
              fullText += text
              cb.onChunk?.(filterThinkingTags(fullText))
            }
          }
          if (json?.type === 'message_delta') {
            finishReason = json?.delta?.stop_reason || finishReason
            if (json?.usage && cb.onUsage) cb.onUsage(json.usage)
          }
        } else {
          const delta = extractStreamDelta(json)
          finishReason = extractFinishReason(json) || finishReason
          if (delta.reasoning) {
            reasoningText += delta.reasoning
            cb.onReasoning?.(filterThinkingTags(reasoningText))
          }
          if (delta.content) {
            fullText += delta.content
            cb.onChunk?.(filterThinkingTags(fullText))
          }
          if (json.usage && cb.onUsage) cb.onUsage(json.usage)
        }
      } catch { /* skip non-JSON lines */ }
    }
  }
  if (!fullText && reasoningText) fullText = reasoningText
  return { text: fullText, reasoning: reasoningText, finishReason }
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
    agentId?: string
    providerId?: string
    model?: string
    prompt: string
    result: string
    duration: number
    status: 'success' | 'failed'
    usage?: any
    providerType?: string
    transport?: 'main-process' | 'renderer-fetch'
    finalUrl?: string
    statusCode?: number
    providerErrorSummary?: string
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
    agentId?: string
    ctxTurns?: number
    usage?: any
    providerType?: string
    transport?: 'main-process' | 'renderer-fetch'
    finalUrl?: string
    statusCode?: number
    providerErrorSummary?: string
  }
) {
  if (logger) {
    logger.addLog({
      step: params.step ?? -1,
      stepName: params.purpose,
      mode: params.skillId || 'default',
      skillNames: params.skillId ? [params.skillId] : [],
      agentId: params.agentId || '',
      providerId: params.providerId || '',
      model: params.model || '',
      prompt: params.prompt.slice(0, 500),
      result: params.result.slice(0, 500),
      duration: params.durationMs,
      status: params.success ? 'success' : 'failed',
      usage: params.usage,
      providerType: params.providerType,
      transport: params.transport,
      finalUrl: params.finalUrl,
      statusCode: params.statusCode,
      providerErrorSummary: params.providerErrorSummary,
    })
  }
  // Push to DiagLogger for real-time DiagLogPanel display.
  // Must run even when the caller passes no pipeline logger:
  // diagnostics are a cross-cutting concern of the unified AI entry.
  const _diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
  if (_diag && typeof _diag.log === 'function') {
    _diag.log(params.success ? 'info' : 'error', 'ai-service',
      'AI call: purpose=' + params.purpose + ' provider=' + (params.providerId || '?') + ' model=' + (params.model || '?') + ' ' + params.durationMs + 'ms ' + (params.success ? 'OK' : 'FAIL'),
      {
        providerId: params.providerId,
        purpose: params.purpose,
        model: params.model,
        durationMs: params.durationMs,
        skillId: params.skillId,
        agentId: params.agentId,
        ctxTurns: params.ctxTurns,
        result: params.result.slice(0, 300),
        usage: params.usage || undefined,
        providerType: params.providerType,
        transport: params.transport,
        finalUrl: params.finalUrl,
        statusCode: params.statusCode,
        providerErrorSummary: params.providerErrorSummary,
      }
    )
    if (typeof _diag.trackApiCall === 'function') {
      const totalTokens = params.usage ? (params.usage.total_tokens ?? params.usage.totalTokens ?? 0) : 0
      _diag.trackApiCall(params.model || '?', totalTokens, params.durationMs, params.success ? 'ok' : 'error', params.success ? '' : params.result.slice(0, 200))
    }
  }
}

// ── Main-process network transport ──────────────────────────────────

interface MainNetResult {
  ok: boolean
  kind?: 'network' | 'timeout' | 'http' | 'json' | 'auth' | 'canceled'
  message?: string
  statusCode?: number
  providerErrorSummary?: string
  data?: any
  text?: string
}

function mainNetError(
  result: MainNetResult,
  provider: ProviderLike,
  purpose: ProviderPurpose
): AiServiceErrorImpl {
  const kind = result.kind === 'auth'
    ? 'auth'
    : result.kind === 'timeout'
      ? 'timeout'
      : result.kind === 'network'
        ? 'network'
        : 'http'
  return new AiServiceErrorImpl({
    kind,
    message: result.message || httpErrorMessage(result.statusCode || 0),
    providerId: provider.id,
    purpose,
    statusCode: result.statusCode,
    providerErrorSummary: result.providerErrorSummary,
  })
}

function hasMainNet(): boolean {
  return typeof window !== 'undefined' &&
    typeof (window as any).electronAPI?.providerNetRequest === 'function' &&
    typeof (window as any).electronAPI?.providerNetStream === 'function'
}

function isMainNetCanceled(result: MainNetResult): boolean {
  return result.kind === 'canceled'
}

async function mainNetRequest(request: {
  url: string
  method?: string
  headers: Record<string, string>
  body?: unknown
}, externalSignal?: AbortSignal): Promise<Response | { __mainNetError: true; result: MainNetResult }> {
  const signalId = 'provider-net-request-' + Date.now() + '-' + Math.random().toString(36).slice(2)
  const abortHandler = () => {
    ;(window as any).electronAPI.providerNetAbort(signalId).catch(() => {})
  }
  externalSignal?.addEventListener('abort', abortHandler, { once: true })
  let result: MainNetResult
  try {
    result = await (window as any).electronAPI.providerNetRequest({
      ...request,
      method: request.method || 'GET',
      signalId,
    })
  } finally {
    externalSignal?.removeEventListener('abort', abortHandler)
  }
  if (!result.ok) return { __mainNetError: true, result }
  return new Response(result.text || '', {
    status: result.statusCode || 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function extractProtocolStreamDelta(json: any, protocol: ReturnType<typeof getProviderProtocol>) {
  const openAIDelta = extractStreamDelta(json)
  if (openAIDelta.content || openAIDelta.reasoning) return openAIDelta
  if (json?.type === 'content_block_delta') {
    return {
      content: json.delta?.text ?? null,
      reasoning: json.delta?.thinking ?? null,
      finishReason: undefined,
    }
  }
  if (json?.type === 'message_delta') {
    return { content: null, reasoning: null, finishReason: json.delta?.stop_reason }
  }
  if (Array.isArray(json?.candidates?.[0]?.content?.parts)) {
    return {
      content: protocol.extractText(json),
      reasoning: null,
      finishReason: protocol.extractFinishReason(json),
    }
  }
  return { content: null, reasoning: null, finishReason: protocol.extractFinishReason(json) }
}

async function mainNetStream(
  request: { url: string; headers: Record<string, string>; body: Record<string, unknown> },
  callbacks: StreamCallbacks,
  protocolName: string,
  externalSignal?: AbortSignal
): Promise<{ text: string; reasoning: string; finishReason?: string }> {
  const signalId = 'provider-net-' + Date.now() + '-' + Math.random().toString(36).slice(2)
  const chunkQueue: string[] = []
  let resolveChunk: (() => void) | null = null
  let ended = false
  let streamError: string | null = null
  let canceled = false

  const offChunk = (window as any).electronAPI.onProviderNetStreamChunk((payload: any) => {
    if (payload.signalId !== signalId) return
    if (payload.event === 'chunk' && payload.text) chunkQueue.push(payload.text)
    if (payload.event === 'end') ended = true
    if (payload.event === 'canceled') {
      canceled = true
      ended = true
    }
    if (payload.event === 'error') {
      streamError = payload.message || '主进程流式请求失败'
      ended = true
    }
    if (resolveChunk) {
      const resolve = resolveChunk
      resolveChunk = null
      resolve()
    }
  })

  const invoke = (window as any).electronAPI.providerNetStream({
    ...request,
    signalId,
  })

  const abortHandler = () => {
    ;(window as any).electronAPI.providerNetAbort(signalId)
  }
  externalSignal?.addEventListener('abort', abortHandler, { once: true })

  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''
  let reasoningText = ''
  let finishReason: string | undefined
  let sawFirstByte = false
  const protocol = getProviderProtocol(protocolName)

  try {
    while (!ended || chunkQueue.length > 0) {
      if (chunkQueue.length === 0 && !ended) {
        await new Promise<void>(resolve => {
          resolveChunk = resolve
          setTimeout(resolve, 100)
        })
        continue
      }
      const text = chunkQueue.shift()
      if (text == null) continue
      if (!sawFirstByte) {
        sawFirstByte = true
      }
      buffer += text
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !isSSEDataLine(trimmed)) continue
        const payload = trimmed.slice(6)
        if (isSSEDone(payload)) continue
        try {
          const json = JSON.parse(payload)
          const delta = extractProtocolStreamDelta(json, protocol)
          finishReason = delta.finishReason || finishReason
          if (delta.reasoning) {
            reasoningText += delta.reasoning
            callbacks.onReasoning?.(filterThinkingTags(reasoningText))
          }
          if (delta.content) {
            fullText += delta.content
            callbacks.onChunk?.(filterThinkingTags(fullText))
          }
          const usage = protocol.extractUsage(json)
          if (usage && callbacks.onUsage) callbacks.onUsage(usage)
        } catch { /* skip non-JSON lines */ }
      }
    }
    const invokeResult = await invoke
    if (!invokeResult.ok) {
      if (invokeResult.kind === 'canceled') {
        throw new DOMException('The operation was aborted', 'AbortError')
      }
      throw new AiServiceErrorImpl({
        message: invokeResult.message || '主进程网络请求失败',
        kind: invokeResult.kind === 'auth' ? 'auth' : invokeResult.kind === 'timeout' ? 'timeout' : 'http',
        statusCode: invokeResult.statusCode,
        providerErrorSummary: invokeResult.providerErrorSummary,
      })
    }
    return { text: fullText, reasoning: reasoningText, finishReason }
  } finally {
    externalSignal?.removeEventListener('abort', abortHandler)
    if (typeof offChunk === 'function') offChunk()
    ;(window as any).electronAPI.providerNetAbort(signalId).catch(() => {})
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
  ): Promise<{ text: string; reasoning: string; usage?: any; finishReason?: string }> {
    const model = resolveModel(provider, params.model)
    const providerType = normalizeProviderType(provider.providerType)
    const url = buildProviderChatUrl({
      baseUrl: provider.baseUrl,
      providerType,
      endpointMode: provider.endpointMode,
      chatPath: provider.chatPath,
      deployment: provider.deployment,
      apiVersion: provider.apiVersion,
      model,
    })
    const headers = buildProviderHeaders(providerType, provider.apiKey)
    const temperature = resolveTemperature(provider, params.temperature)
    const maxTokens = resolveMaxTokens(provider, params.maxTokens)
    const wantStream = params.stream ?? (params.purpose === 'generate' || params.purpose === 'rewrite')
    const signal = combineSignals(params.signal, makeTimeoutSignal(timeoutMs))
    const protocol = getProviderProtocol(providerType)
    const body = protocol.buildRequestBody({
      model,
      messages: withTableOutputGuideline(params.messages, params.jsonMode === true),
      stream: wantStream,
      temperature,
      maxTokens,
    })
    const useMainNet = hasMainNet()
    let resp: Response | null = null
    if (useMainNet && !wantStream) {
      const mainResult = await mainNetRequest({ url, method: 'POST', headers, body }, signal)
      if ('__mainNetError' in mainResult) {
        const result = mainResult.result
        if (isMainNetCanceled(result) || params.signal?.aborted) {
          throw new DOMException('The operation was aborted', 'AbortError')
        }
        throw mainNetError(result, provider, params.purpose)
      }
      resp = mainResult
    } else if (!useMainNet) {
      resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal })
    }
    if (resp && !resp.ok) throw resp
    if (!wantStream && !resp) throw new Error('网络传输初始化失败')
    if (wantStream) {
      let result: { text: string; reasoning: string; finishReason?: string }
      let streamUsage: any
      if (useMainNet) {
        result = await mainNetStream(
          { url, headers, body },
          {
            onChunk: params.onChunk,
            onReasoning: params.onReasoning,
            onUsage: (u: any) => {
              streamUsage = u
              if (params.onUsage) params.onUsage(u)
            },
          },
          providerType,
          signal
        )
      } else {
        const reader = resp!.body!.getReader()
        result = await parseSSEStream(
          reader,
          {
            onChunk: params.onChunk,
            onReasoning: params.onReasoning,
            onUsage: (u: any) => {
              streamUsage = u
              if (params.onUsage) params.onUsage(u)
            },
          },
          providerType
        )
      }
      const finishReason = resolveFinishReason(result.finishReason, streamUsage, maxTokens, Boolean(result.text))
      return { ...result, usage: streamUsage, finishReason }
    } else {
      const data = await resp!.json()
      const text = protocol.extractText(data)
      const reasoning = protocol.extractReasoning(data)
      const usage = protocol.extractUsage(data)
      const rawFinishReason = protocol.extractFinishReason(data)
      if (usage && params.onUsage) params.onUsage(usage)
      const finishReason = resolveFinishReason(rawFinishReason, usage, maxTokens, Boolean(text))
      return { text, reasoning, usage, finishReason }
    }
  }

  /**
   * The unified callAi entry point.
   */
  async function callAi(params: CallAiParams): Promise<CallAiResult> {
    const startTime = Date.now()
    const { provider, providerId } = resolveProvider(providerStore, params.purpose)
    // Default stream: true for generate/rewrite (long text), false for others (short/JSON)
    const defaultStream = (params.purpose === 'generate' || params.purpose === 'rewrite')
    const wantStream = params.stream ?? defaultStream
    const timeoutMs = params.timeoutMs ?? provider.timeoutMs ?? (wantStream ? DEFAULT_STREAM_TIMEOUT : DEFAULT_NON_STREAM_TIMEOUT)
    const doRetry = params.retry !== false
    const maxRetries = doRetry ? MAX_RETRIES : 0
    const providerType = normalizeProviderType(provider.providerType)
    const finalUrl = (() => {
      try {
        return sanitizeUrlForLog(buildProviderChatUrl({
          baseUrl: provider.baseUrl,
          providerType,
          endpointMode: provider.endpointMode,
          chatPath: provider.chatPath,
          deployment: provider.deployment,
          apiVersion: provider.apiVersion,
          model: resolveModel(provider, params.model),
        }))
      } catch {
        return '[invalid-url]'
      }
    })()
    const transport: 'main-process' | 'renderer-fetch' = hasMainNet() ? 'main-process' : 'renderer-fetch'
    let lastErr: any = null
    let lastResp: { text: string; reasoning: string; usage?: any } | null = null
    const promptPreview = params.messages.map(m => m.content).join(' ').slice(0, 200)
    const throwCanceled = (): never => {
      const durationMs = Date.now() - startTime
      logRequest(log, { step: params.meta?.step, purpose: params.purpose, providerId, model: resolveModel(provider, params.model), prompt: promptPreview, result: '用户取消', durationMs, success: false, skillId: params.meta?.skillId, agentId: params.meta?.agentId, providerType, transport, finalUrl })
      throw new AiServiceErrorImpl({ kind: 'canceled', message: '用户取消', providerId, purpose: params.purpose })
    }

    // Do not even open a network request when the caller has already canceled.
    if (params.signal?.aborted) return throwCanceled()

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
        logRequest(log, { step: params.meta?.step, purpose: params.purpose, providerId, model: _model, prompt: promptPreview, result: finalText.slice(0, 200), durationMs, success: true, skillId: params.meta?.skillId, agentId: params.meta?.agentId, usage: result.usage, providerType, transport, finalUrl })
        return { text: finalText, reasoning: result.reasoning, providerId, model: _model, durationMs, usage: result.usage, finishReason: result.finishReason }
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
        // HTTP error. Renderer fetch throws a Response; the Electron main
        // bridge throws an already-classified AiServiceError.
        const httpError = e instanceof Response
          ? {
              status: e.status,
              providerSummary: e.clone().text().then((text: string) => {
                try { return extractProviderErrorSummary(JSON.parse(text)) }
                catch { return String(text || '').slice(0, 500) }
              }),
            }
          : (e?.kind === 'http' || e?.kind === 'auth')
            ? { status: e.statusCode, providerSummary: Promise.resolve(e.providerErrorSummary || '') }
            : null
        if (httpError) {
          const status = httpError.status
          const providerMessage = await httpError.providerSummary
          if (doRetry && (status === 429 || status === 502 || status === 503) && attempt < maxRetries) {
            lastErr = new AiServiceErrorImpl({ kind: 'http', message: httpErrorMessage(status, providerMessage), providerId, purpose: params.purpose, statusCode: status })
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
            throw new AiServiceErrorImpl({ kind: 'auth', message: httpErrorMessage(status, providerMessage), providerId, purpose: params.purpose, statusCode: status })
          }
          lastErr = new AiServiceErrorImpl({ kind: 'http', message: httpErrorMessage(status, providerMessage), providerId, purpose: params.purpose, statusCode: status })
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
          logRequest(log, { step: params.meta?.step, purpose: params.purpose, providerId, model: _hbModel, prompt: promptPreview, result: finalText.slice(0, 200), durationMs, success: true, skillId: params.meta?.skillId, agentId: params.meta?.agentId, usage: result.usage })
          return { text: finalText, reasoning: result.reasoning, providerId, model: resolveModel(provider, params.model), durationMs, usage: result.usage }
        } catch (hbErr: any) {
          if (params.signal?.aborted) {
            return throwCanceled()
          }
          console.warn('[HEARTBEAT] Probe ' + hbAttempt + ' failed: ' + ((hbErr && (hbErr.message || String(hbErr))) || 'unknown'))
        }
      }
    }

    const durationMs = Date.now() - startTime
    logRequest(log, { step: params.meta?.step, purpose: params.purpose, providerId, model: resolveModel(provider, params.model), prompt: promptPreview, result: lastErr?.message || 'unknown', durationMs, success: false, skillId: params.meta?.skillId, agentId: params.meta?.agentId, providerType, transport, finalUrl, statusCode: lastErr?.statusCode, providerErrorSummary: lastErr?.providerErrorSummary })
    throw lastErr || new AiServiceErrorImpl({ kind: 'network', message: 'unknown error', providerId, purpose: params.purpose })
  }

  async function fetchModelsForProvider(p: ProviderLike): Promise<string[]> {
    const startTime = Date.now()
    const providerId = p.id
    const providerType = normalizeProviderType(p.providerType)
    const transport: 'main-process' | 'renderer-fetch' = hasMainNet() ? 'main-process' : 'renderer-fetch'
    const url = buildProviderModelsUrl({
      baseUrl: p.baseUrl,
      providerType,
      endpointMode: p.endpointMode,
      modelsPath: p.modelsPath,
    })
        const headers = buildProviderModelsHeaders(providerType, p.apiKey)
    try {
      let resp: Response
      if (hasMainNet()) {
        const mainResult = await mainNetRequest({ url, method: 'GET', headers }, makeTimeoutSignal(30_000))
        if ('__mainNetError' in mainResult) {
          const result = mainResult.result
          throw new AiServiceErrorImpl({
            kind: result.kind === 'auth' ? 'auth' : result.kind === 'timeout' ? 'timeout' : 'http',
            message: '获取模型列表失败：' + (result.message || httpErrorMessage(result.statusCode || 0)),
            providerId,
            purpose: 'generate',
            statusCode: result.statusCode,
          })
        }
        resp = mainResult
      } else {
        resp = await fetch(url, { method: 'GET', headers, signal: makeTimeoutSignal(30_000) })
      }
      if (!resp.ok) {
        const status = resp.status
        const errorBody = await readErrorBody(resp)
        const providerMessage = extractProviderErrorSummary(errorBody)
        const kind = status === 401 || status === 403 ? 'auth' : 'http'
        throw new AiServiceErrorImpl({
          kind,
          message: (kind === 'auth' ? '模型列表鉴权失败：' + providerMessage : '获取模型列表失败：' + httpErrorMessage(status, providerMessage)),
          providerId,
          purpose: 'generate',
          statusCode: status,
        })
      }
      const data = await resp.json()
      const models = getProviderProtocol(p.providerType).extractModels(data)
      logRequest(log, {
        purpose: 'generate', providerId, model: p.selectedModel,
        prompt: '获取模型列表', result: models.join(', '),
        durationMs: Date.now() - startTime, success: true,
        providerType, transport, finalUrl: sanitizeUrlForLog(url),
      })
      return models
    } catch (e: any) {
      const error = e?.kind ? e : new AiServiceErrorImpl({
        kind: e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'timeout' : 'network',
        message: e?.name === 'TimeoutError' || e?.name === 'AbortError' ? '获取模型列表超时' : (e?.message || '获取模型列表失败'),
        providerId,
        purpose: 'generate',
      })
      logRequest(log, {
        purpose: 'generate', providerId, model: p.selectedModel,
        prompt: '获取模型列表', result: error.message,
        durationMs: Date.now() - startTime, success: false,
        providerType, transport, finalUrl: sanitizeUrlForLog(url),
        statusCode: error.statusCode, providerErrorSummary: error.providerErrorSummary,
      })
      throw error
    }
  }

  async function fetchModels(providerId: string): Promise<string[]> {
    const p = providerStore.providers.find(x => x.id === providerId)
    if (!p) {
      const error = new AiServiceErrorImpl({ kind: 'http', message: '未找到供应商：' + providerId, providerId, purpose: 'generate' })
      logRequest(log, { purpose: 'generate', providerId, prompt: '获取模型列表', result: error.message, durationMs: 0, success: false })
      throw error
    }
    return fetchModelsForProvider(p)
  }

  async function testConnection(providerId: string): Promise<{ connected: boolean; error?: string; note?: string }> {
    try {
      await fetchModels(providerId)
      return { connected: true }
    } catch (e: any) {
      return { connected: false, error: e.message }
    }
  }

  async function testConnectionForProvider(provider: ProviderLike): Promise<{ connected: boolean; error?: string; note?: string }> {
    try {
      await fetchModelsForProvider(provider)
      return { connected: true }
    } catch (e: any) {
      const status = e?.statusCode
      const modelsEndpointUnsupported = status === 404 || status === 405
      if (modelsEndpointUnsupported) {
        try {
          await _rawCall(provider, {
            purpose: 'generate',
            messages: [{ role: 'user', content: '连接测试' }],
            stream: false,
            retry: false,
            timeoutMs: 30_000,
            maxTokens: 1,
          }, 30_000)
          return {
            connected: true,
            note: '该供应商未提供模型列表接口，已用最小对话请求验证连接（会消耗极小 token）',
          }
        } catch (chatError: any) {
          return { connected: false, error: chatError?.message || '连接失败' }
        }
      }
      return { connected: false, error: e?.message || '连接失败' }
    }
  }

  return { callAi, fetchModels, fetchModelsForProvider, testConnection, testConnectionForProvider }
}

// ── Singleton ───────────────────────────────────────────────────────

let _aiServiceInstance: AiService | null = null

/**
 * Returns the singleton AiService instance.
 * Lazily created on first call using dynamic imports to avoid circular deps.
 * All callers should use this instead of createAiService() directly.
 */
export async function getAiService(): Promise<AiService> {
  if (!_aiServiceInstance) {
    const { useProviderStore } = await import('../stores/provider')
    const { useExecutionLogStore } = await import('../stores/executionLog')
    _aiServiceInstance = createAiService(
      useProviderStore() as any,
      useExecutionLogStore() as any
    )
  }
  return _aiServiceInstance
}
