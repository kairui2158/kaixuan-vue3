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
import type { AgentToolDefinition, ToolResult } from './editorTools'
import {
  buildProviderTools,
  buildToolResultChatMessages,
  extractProviderToolCalls,
  supportsNativeTools,
  type NormalizedToolCall,
  type ProviderToolMessage,
} from './providerTools'

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
  messages: Array<ProviderToolMessage>
  model?: string
  temperature?: number
  maxTokens?: number
  jsonMode?: boolean
  stream?: boolean
  signal?: AbortSignal
  tools?: AgentToolDefinition[]
  toolPolicy?: {
    maxToolIterations?: number
    maxWriteProposals?: number
    onCompatibilityMode?: (reason: string) => void
    onToolStart?: (event: {
      toolName: string
      policy: 'read' | 'write'
      iteration: number
      input: unknown
    }) => void
    onToolCall?: (event: {
      toolName: string
      policy: 'read' | 'write'
      iteration: number
      input: unknown
      result: ToolResult
      durationMs: number
    }) => void
  }
  timeoutMs?: number
  retry?: boolean
  meta?: {
    source?: string
    targetId?: string
    step?: number
    skillId?: string
    agentId?: string
    ctxTurns?: number
  }
  onChunk?: (text: string) => void
  onReasoning?: (text: string) => void
  onUsage?: (usage: any) => void
  onProgress?: (percent: number, label: string) => void
  /** @internal Keep the legacy public path clean; P6 callers receive a typed helper instead. */
}

export interface CallAiResult {
  text: string
  reasoning: string
  providerId?: string
  model?: string
  durationMs?: number
  usage?: any
  finishReason?: string
  toolCalls?: NormalizedToolCall[]
  toolResults?: Array<{ call: NormalizedToolCall; result: ToolResult }>
  /** Present when the provider does not support native tools and the JSON protocol path was used. */
  compatibilityMode?: 'json-protocol'
  /** Present when a provider with declared native-tool support rejected tools at request time. */
  toolsDowngraded?: 'json-protocol'
  /** @internal Raw provider payload; needed to continue native tool-call loops. */
  raw?: any
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
    toolCapability?: 'native_tools' | 'json_protocol'
    downgradeReason?: string
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
    toolCapability?: 'native_tools' | 'json_protocol'
    downgradeReason?: string
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
      toolCapability: params.toolCapability,
      downgradeReason: params.downgradeReason,
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
        toolCapability: params.toolCapability,
        downgradeReason: params.downgradeReason,
      }
    )
    if (typeof _diag.trackApiCall === 'function') {
      const totalTokens = params.usage ? (params.usage.total_tokens ?? params.usage.totalTokens ?? 0) : 0
      _diag.trackApiCall(params.model || '?', totalTokens, params.durationMs, params.success ? 'ok' : 'error', params.success ? '' : params.result.slice(0, 200))
    }
  }
}

function logToolRequest(
  logger: DiagnosticLogLike | null,
  params: {
    purpose: ProviderPurpose
    providerId?: string
    model?: string
    toolName: string
    iteration: number
    input: unknown
    result: ToolResult
    durationMs: number
  }
) {
  const resultPreview = JSON.stringify(params.result).slice(0, 500)
  if (logger) {
    logger.addLog({
      step: -1,
      stepName: 'tool-call',
      mode: params.toolName,
      skillNames: [],
      agentId: '',
      providerId: params.providerId || '',
      model: params.model || '',
      prompt: JSON.stringify(params.input).slice(0, 500),
      result: resultPreview,
      duration: params.durationMs,
      status: params.result.ok ? 'success' : 'failed',
    })
  }
  const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
  if (diag && typeof diag.log === 'function') {
    diag.log(params.result.ok ? 'info' : 'error', 'ai-service/tool-call',
      `Tool call: ${params.toolName} iteration=${params.iteration} ${params.durationMs}ms ${params.result.ok ? 'OK' : 'FAIL'}`,
      {
        providerId: params.providerId,
        purpose: params.purpose,
        model: params.model,
        toolName: params.toolName,
        toolCapability: 'native_tools',
        iteration: params.iteration,
        durationMs: params.durationMs,
        input: params.input,
        result: params.result,
      }
    )
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
  ): Promise<{ text: string; reasoning: string; usage?: any; finishReason?: string; raw?: any }> {
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
    const signal = combineSignals(params.signal, makeTimeoutSignal(timeoutMs))
    const protocol = getProviderProtocol(providerType)
      const nativeTools = params.tools && params.tools.length > 0 && supportsNativeTools(providerType)
      ? buildProviderTools(providerType, params.tools)
      : undefined
    const requestParams = nativeTools ? { ...params, stream: false } : params
    const wantStream = requestParams.stream ?? (params.purpose === 'generate' || params.purpose === 'rewrite')
    const body = protocol.buildRequestBody({
      model,
      messages: withTableOutputGuideline(params.messages, params.jsonMode === true),
      stream: wantStream,
      temperature,
      maxTokens,
      tools: nativeTools,
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
            onChunk: requestParams.onChunk,
            onReasoning: requestParams.onReasoning,
            onUsage: (u: any) => {
              streamUsage = u
              if (requestParams.onUsage) requestParams.onUsage(u)
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
            onChunk: requestParams.onChunk,
            onReasoning: requestParams.onReasoning,
            onUsage: (u: any) => {
              streamUsage = u
              if (requestParams.onUsage) requestParams.onUsage(u)
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
      if (usage && requestParams.onUsage) requestParams.onUsage(usage)
      const finishReason = resolveFinishReason(rawFinishReason, usage, maxTokens, Boolean(text))
      return { text, reasoning, usage, finishReason, raw: data }
    }
  }

  /**
   * The unified callAi entry point.
   */
  async function callAi(params: CallAiParams): Promise<CallAiResult> {
    if (!params.tools || params.tools.length === 0) return callAiWithoutTools(params)
    return callAiWithToolFallback(params)
  }

  async function callAiWithTools(params: CallAiParams): Promise<CallAiResult> {
    const startTime = Date.now()
    const { provider, providerId } = resolveProvider(providerStore, params.purpose)
    const providerType = normalizeProviderType(provider.providerType)
    const compatibleMode = !supportsNativeTools(providerType)
    const maxWriteProposals = Math.max(1, params.toolPolicy?.maxWriteProposals ?? 1)
    const model = resolveModel(provider, params.model)
    const maxIterations = Math.max(1, params.toolPolicy?.maxToolIterations ?? 6)
    let messages: CallAiParams['messages'] = params.messages.map(message => ({ ...message }))
    const allToolCalls: NormalizedToolCall[] = []
    const allToolResults: Array<{ call: NormalizedToolCall; result: ToolResult }> = []
    let writeProposals = 0
    let lastResult: CallAiResult | null = null
    let lastRawResponse: any = null
    let hitToolLoopLimit = false

    if (compatibleMode) {
      const compatibility: CallAiResult['compatibilityMode'] = 'json-protocol'
      params.toolPolicy?.onCompatibilityMode?.('provider_not_supported')
      logRequest(log, {
        purpose: params.purpose,
        providerId,
        model,
        prompt: params.messages.map(message => message.content).join(' ').slice(0, 200),
        result: '当前供应商未启用原生工具调用，已使用兼容模式',
        durationMs: 0,
        success: true,
        providerType,
        toolCapability: 'json_protocol',
        downgradeReason: 'provider_not_supported',
      })
      const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
      if (diag && typeof diag.log === 'function') {
        diag.log('info', 'ai-service/tool-capability',
          `Tool capability: provider=${providerId || '?'} type=${providerType} capability=json_protocol reason=provider_not_supported`,
          {
            providerId,
            purpose: params.purpose,
            model,
            toolCapability: 'json_protocol',
            downgradeReason: 'provider_not_supported',
          })
      }
      const response = await callAiWithoutTools({
        ...params,
        tools: undefined,
        toolPolicy: undefined,
      })
      const compatibilityResponse: CallAiResult = {
        ...response,
        compatibilityMode: compatibility,
        text: response.text || '',
        reasoning: response.reasoning || '',
      }
      return compatibilityResponse
    }

    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      const response = await callAiWithoutTools({
        ...params,
        stream: false,
        messages,
        retry: params.retry,
        jsonMode: false,
      })
      lastResult = response
      lastRawResponse = response.raw ?? null

      const calls = extractProviderToolCallsFromResponse(providerType, response)
      if (calls.length === 0) {
        return {
          ...response,
          toolCalls: allToolCalls,
          toolResults: allToolResults,
        }
      }
      const toolResults: Array<{ call: NormalizedToolCall; result: ToolResult }> = []
      for (const call of calls) {
        allToolCalls.push(call)
        const tool = params.tools?.find(item => item.name === call.name)
        if (!tool) {
          const result: ToolResult = { ok: false, error: { code: 'tool_not_found', message: `工具不存在：${call.name}` } }
          toolResults.push({ call, result })
          allToolResults.push({ call, result })
          params.toolPolicy?.onToolStart?.({ toolName: call.name, policy: 'read', iteration, input: call.input })
          params.toolPolicy?.onToolCall?.({ toolName: call.name, policy: 'read', iteration, input: call.input, result, durationMs: 0 })
          continue
        }
        if (tool.policy === 'write' && writeProposals >= maxWriteProposals) {
          const result: ToolResult = {
            ok: false,
            error: {
              code: 'write_proposal_limit',
              message: `本次任务只允许 ${maxWriteProposals} 个写入提案，请直接结束请求`,
            },
          }
          toolResults.push({ call, result })
          allToolResults.push({ call, result })
          params.toolPolicy?.onToolStart?.({ toolName: tool.name, policy: tool.policy, iteration, input: call.input })
          params.toolPolicy?.onToolCall?.({ toolName: tool.name, policy: tool.policy, iteration, input: call.input, result, durationMs: 0 })
          continue
        }
        const started = Date.now()
        params.toolPolicy?.onToolStart?.({ toolName: tool.name, policy: tool.policy, iteration, input: call.input })
        const result = await tool.execute(call.input, {
          projectId: params.meta?.source || 'unknown-project',
          workspace: 'main',
          targetId: params.meta?.targetId || params.meta?.source || 'unknown-target',
          readableTargets: [],
          writableTarget: params.meta?.targetId || params.meta?.source || 'unknown-target',
          sessionId: params.meta?.source || 'unknown-session',
          iteration,
          abortSignal: params.signal,
        })
        const durationMs = Date.now() - started
        toolResults.push({ call, result })
        allToolResults.push({ call, result })
        if (tool.policy === 'write' && result.ok) writeProposals += 1
        params.toolPolicy?.onToolCall?.({ toolName: tool.name, policy: tool.policy, iteration, input: call.input, result, durationMs })
        logToolRequest(log, {
          purpose: params.purpose,
          providerId,
          model,
          toolName: tool.name,
          iteration,
          input: call.input,
          result,
          durationMs,
        })
      }

      messages = buildToolResultChatMessages(
        providerType,
        messages,
        lastRawResponse,
        toolResults
      )
      if (iteration === maxIterations) hitToolLoopLimit = true
    }

    return {
      text: lastResult?.text || '',
      reasoning: lastResult?.reasoning || '',
      usage: lastResult?.usage,
      providerId,
      model,
      durationMs: Date.now() - startTime,
      toolCalls: allToolCalls,
      toolResults: allToolResults,
      finishReason: hitToolLoopLimit ? 'tool_loop_limit' : (lastResult?.finishReason || 'tool_loop_limit'),
    }
  }

  /**
   * One-request degradation: retry once without tools when a provider with
   * declared native-tool support rejects the tools request with a client error.
   */
  async function callAiWithToolFallback(params: CallAiParams): Promise<CallAiResult> {
    try {
      return await callAiWithTools(params)
    } catch (error: any) {
      const isClientError = error?.statusCode === 400 || error?.statusCode === 422
      const requestedTools = Boolean(params.tools?.length)
      const toolsRejected = requestedTools && (Boolean(error?.providerErrorSummary?.includes('tools unsupported')) || error?.message?.includes('tools unsupported'))
      if (!isClientError || !requestedTools || params.signal?.aborted || !toolsRejected) throw error

      const downgradeParams: CallAiParams = {
        ...params,
        tools: undefined,
        toolPolicy: undefined,
      }
      const { provider: downgradeProvider, providerId: downgradeProviderId } = resolveProvider(providerStore, params.purpose)
      const downgradeProviderType = normalizeProviderType(downgradeProvider.providerType)
      const downgradeModel = resolveModel(downgradeProvider, params.model)
      const response = await callAiWithoutTools(downgradeParams)
      logRequest(log, {
        purpose: params.purpose,
        providerId: downgradeProviderId,
        model: downgradeModel,
        prompt: params.messages.map(message => message.content).join(' ').slice(0, 200),
        result: '供应商拒绝原生工具调用，已降级为 JSON 协议模式',
        durationMs: 0,
        success: true,
        providerType: downgradeProviderType,
        toolCapability: 'json_protocol',
        downgradeReason: `http_${error?.statusCode || 'client_error'}`,
      })
      const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
      if (diag && typeof diag.log === 'function') {
        diag.log('warn', 'ai-service/tool-capability',
          `Tool capability: provider=${downgradeProviderId || '?'} type=${downgradeProviderType} capability=json_protocol reason=http_${error?.statusCode || 'client_error'}`,
          {
            providerId: downgradeProviderId,
            purpose: params.purpose,
            model: downgradeModel,
            toolCapability: 'json_protocol',
            downgradeReason: `http_${error?.statusCode || 'client_error'}`,
          })
      }
      const downgradeReason = `http_${error?.statusCode || 'client_error'}`
      params.toolPolicy?.onCompatibilityMode?.(downgradeReason)
      const downgradedResponse: CallAiResult = {
        ...response,
        toolsDowngraded: 'json-protocol',
        text: response.text || '',
        reasoning: response.reasoning || '',
      }
      return downgradedResponse
    }
  }

  function extractProviderToolCallsFromResponse(
    providerType: string,
    response: CallAiResult
  ): NormalizedToolCall[] {
    if (!supportsNativeTools(providerType)) return []
    if (response.toolCalls && response.toolCalls.length > 0) return response.toolCalls
    if (!response.raw) return []
    return extractProviderToolCalls(providerType, response.raw)
  }

  async function callAiWithoutTools(params: CallAiParams): Promise<CallAiResult> {
    const startTime = Date.now()
    const { provider, providerId } = resolveProvider(providerStore, params.purpose)
    // Default stream: true for generate/rewrite (long text), false for others (short/JSON)
    const defaultStream = (params.purpose === 'generate' || params.purpose === 'rewrite')
    const wantStream = params.stream ?? defaultStream
    const timeoutMs = params.timeoutMs ?? provider.timeoutMs ?? (wantStream ? DEFAULT_STREAM_TIMEOUT : DEFAULT_NON_STREAM_TIMEOUT)
    const doRetry = params.retry !== false
    const maxRetries = doRetry ? MAX_RETRIES : 0
    const requestedTools = Boolean(params.tools?.length)
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
        return { text: finalText, reasoning: result.reasoning, providerId, model: _model, durationMs, usage: result.usage, finishReason: result.finishReason, raw: result.raw }
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
            lastErr = new AiServiceErrorImpl({ kind: 'http', message: httpErrorMessage(status, providerMessage), providerId, purpose: params.purpose, statusCode: status, providerErrorSummary: providerMessage })
            try { await waitWithSignal(RETRY_DELAYS[attempt], params.signal) }
            catch (ce: any) {
              if (params.signal?.aborted) return throwCanceled()
              throw ce
            }
            continue
          }
          const toolsRejected = status === 400 && requestedTools &&
            providerMessage.toLowerCase().includes('tools unsupported')
          if (toolsRejected) {
            // A rejected tools request must reach the tool fallback immediately;
            // halving max_tokens cannot fix an unsupported tools parameter.
            throw new AiServiceErrorImpl({
              kind: 'http',
              message: httpErrorMessage(status, providerMessage),
              providerId,
              purpose: params.purpose,
              statusCode: status,
              providerErrorSummary: providerMessage,
            })
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
 * Lazily created on first call. Imports stay local to defer store creation until first use.
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
