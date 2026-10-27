import {
  extractStreamDelta,
  extractFinishReason,
  isSSEDataLine,
  isSSEDone,
} from './providerAdapter'
import { getProviderProtocol, type ProviderType } from './providerProtocols'

export type StreamTransportEvent =
  | 'start'
  | 'chunk'
  | 'end'
  | 'error'
  | 'canceled'
  | 'queued'
  | 'started'

export interface StreamFrame {
  streamId: string
  cursor: number
  transportEvent: StreamTransportEvent
  text?: string
  timestamp: number
  checksum?: string
}

export interface ParsedStreamEvent {
  type: 'delta'
  content: string | null
  reasoning: string | null
  finishReason?: string
  usage?: any
  raw: any
}

export interface StreamParseState {
  cursor: number
  buffer: string
  duplicateFrames: number
  invalidFrames: number
  pendingFrames: StreamFrame[]
}

export interface ParseStreamFramesOptions {
  maxDurationMs?: number
}

export interface ParseStreamFramesResult {
  events: ParsedStreamEvent[]
  state: StreamParseState
}

export function checksumStreamText(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export function createStreamFrame(
  streamId: string,
  cursor: number,
  text: string,
  transportEvent: StreamTransportEvent = 'chunk'
): StreamFrame {
  return {
    streamId,
    cursor,
    transportEvent,
    text,
    timestamp: Date.now(),
    checksum: checksumStreamText(text),
  }
}

function protocolStreamDelta(json: any, protocolName: ProviderType) {
  const openAIDelta = extractStreamDelta(json)
  if (json?.choices) {
    return {
      ...openAIDelta,
      finishReason: extractFinishReason(json),
    }
  }
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
    const protocol = getProviderProtocol(protocolName)
    return {
      content: protocol.extractText(json),
      reasoning: null,
      finishReason: protocol.extractFinishReason(json),
    }
  }
  return {
    content: null,
    reasoning: null,
    finishReason: getProviderProtocol(protocolName).extractFinishReason(json),
  }
}

export function parseStreamFrames(
  frames: Array<StreamFrame | undefined | null>,
  protocolName: ProviderType,
  initialState?: StreamParseState,
  options: ParseStreamFramesOptions = {}
): ParseStreamFramesResult {
  const state: StreamParseState = {
    cursor: initialState?.cursor ?? 0,
    buffer: initialState?.buffer ?? '',
    duplicateFrames: initialState?.duplicateFrames ?? 0,
    invalidFrames: initialState?.invalidFrames ?? 0,
    pendingFrames: [...(initialState?.pendingFrames ?? [])],
  }
  const events: ParsedStreamEvent[] = []
  const protocol = getProviderProtocol(protocolName)
  const startedAt = performance.now()
  const maxDurationMs = options.maxDurationMs ?? Number.POSITIVE_INFINITY
  const queue = [...state.pendingFrames, ...frames.filter(Boolean)] as StreamFrame[]
  state.pendingFrames = []

  while (queue.length > 0) {
    if (events.length > 0 && performance.now() - startedAt >= maxDurationMs) {
      state.pendingFrames = queue
      break
    }
    const current = queue.shift()!
    if (current.cursor <= state.cursor) {
      state.duplicateFrames += 1
      continue
    }
    if (current.checksum != null && current.text != null && current.checksum !== checksumStreamText(current.text)) {
      state.invalidFrames += 1
      continue
    }
    state.cursor = current.cursor
    if (typeof current.text !== 'string' || current.text.length === 0) continue
    state.buffer += current.text
    const lines = state.buffer.split('\n')
    state.buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !isSSEDataLine(trimmed)) continue
      const payload = trimmed.slice(5)
      if (isSSEDone(payload)) continue
      try {
        const json = JSON.parse(payload)
        const delta = protocolStreamDelta(json, protocolName)
        events.push({
          type: 'delta',
          content: delta.content ?? null,
          reasoning: delta.reasoning ?? null,
          finishReason: delta.finishReason,
          usage: protocol.extractUsage(json) ?? undefined,
          raw: json,
        })
      } catch {
        // A malformed SSE line is transport noise; the caller keeps the
        // terminal error semantics from the transport event.
      }
    }
  }
  return { events, state }
}
