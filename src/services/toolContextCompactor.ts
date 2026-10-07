import type { ProviderToolMessage } from './providerTools'

export interface ToolContextCompactionResult {
  messages: ProviderToolMessage[]
  compactedMessageCount: number
}

const MAX_RECENT_TOOL_ROUNDS = 2
const COMPACTED_RESULT_CHARS = 400

interface MessageWindow {
  start: number
  end: number
}

interface ToolExchangeInfo {
  name: string
  resultContent: string
}

function isToolExchange(message: ProviderToolMessage): boolean {
  return message.role === 'tool'
    || Boolean(message.toolCalls?.length)
    || Boolean(message.anthropicContent?.some(part =>
      part && typeof part === 'object' && 'tool_use' in part))
    || Boolean(message.geminiParts?.some(part =>
      part && typeof part === 'object' && ('functionCall' in part || 'functionResponse' in part)))
}

function findToolWindows(messages: ProviderToolMessage[]): MessageWindow[] {
  const windows: MessageWindow[] = []
  let start = -1
  for (let index = 0; index < messages.length; index++) {
    if (!isToolCallMessage(messages[index])) continue
    start = index
    index += 1
    while (index < messages.length && !isToolCallMessage(messages[index])) index += 1
    windows.push({ start, end: index })
    index -= 1
  }
  return windows
}

function isToolCallMessage(message: ProviderToolMessage | undefined): boolean {
  if (!message) return false
  return Boolean(message.toolCalls?.length)
    || Boolean(message.anthropicContent?.some(part =>
      isRecord(part) && part.type === 'tool_use'))
    || Boolean(message.geminiParts?.some(part =>
      isRecord(part) && 'functionCall' in part))
}

function isToolResultMessage(message: ProviderToolMessage): boolean {
  return message.role === 'tool'
    || Boolean(message.anthropicContent?.some(part =>
      isRecord(part) && part.type === 'tool_result'))
    || Boolean(message.geminiParts?.some(part =>
      isRecord(part) && 'functionResponse' in part))
}

function describeToolExchanges(
  messages: ProviderToolMessage[],
  window: MessageWindow,
): ToolExchangeInfo[] {
  const callMessage = messages[window.start]
  const calls = readToolCalls(callMessage)
  if (calls.length) {
    return calls.map(call => ({ name: call, resultContent: '' }))
  }
  return messages
    .slice(window.start + 1, window.end)
    .filter(isToolResultMessage)
    .map(message => ({ name: message.toolName || '', resultContent: message.content || '' }))
}

function readToolCalls(message: ProviderToolMessage): string[] {
  if (Array.isArray(message.toolCalls)) {
    return message.toolCalls.map(call =>
      isRecord(call) && isRecord(call.function) && typeof call.function.name === 'string'
        ? call.function.name
        : '')
  }
  const anthropicCalls = message.anthropicContent?.map(part =>
    isRecord(part) && part.type === 'tool_use' && typeof part.name === 'string'
      ? part.name
      : '')
  if (anthropicCalls?.length) return anthropicCalls
  const geminiCalls = message.geminiParts?.map(part =>
    isRecord(part) && isRecord(part.functionCall) && typeof part.functionCall.name === 'string'
      ? part.functionCall.name
      : '')
  if (geminiCalls?.length) return geminiCalls
  return []
}

function isCompactableToolResult(
  message: ProviderToolMessage,
  exchanges: ToolExchangeInfo[],
): boolean {
  if (!isToolResultMessage(message)) return false
  if (exchanges.some(exchange => isWriteToolName(exchange.name))) return false
  const resultContent = message.content || ''
  if (!resultContent) return false
  const parsed = safeJsonParse(resultContent)
  if (parsed && isRecord(parsed) && parsed.ok === false) return false
  return true
}

function isWriteToolName(name: string): boolean {
  if (name === 'editor.write') return true
  return /\.(write|apply|update|delete|create|move|reorder|rename|edit)(_|$)/.test(name)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function compactResultContent(content: string): string {
  const parsed = safeJsonParse(content)
  if (!isRecord(parsed)) {
    return content.length <= COMPACTED_RESULT_CHARS
      ? content
      : `${content.slice(0, COMPACTED_RESULT_CHARS)}…[compacted ${content.length - COMPACTED_RESULT_CHARS} chars]`
  }
  const compacted = {
    _compacted: true,
    _summary: `Older tool result compacted by the application; original call is retained in run trace.`,
    _keys: Object.keys(parsed).slice(0, 20),
    _preview: JSON.stringify(parsed).slice(0, 240),
  }
  const serialized = JSON.stringify(compacted)
  if (serialized.length < content.length) return serialized
  return `_compacted: original ${content.length} chars; keys=${Object.keys(parsed).slice(0, 8).join(',')}`
}

function safeJsonParse(content: string): unknown {
  try {
    return JSON.parse(content)
  } catch {
    return null
  }
}

/**
 * Keeps recent tool evidence intact while compacting older successful read
 * results. Failed results and write results are never compacted, and tool
 * protocol shapes are preserved for provider wire compatibility.
 */
export function compactToolContextMessages(
  messages: ProviderToolMessage[],
): ToolContextCompactionResult {
  const windows = findToolWindows(messages)
  if (windows.length <= MAX_RECENT_TOOL_ROUNDS) {
    return { messages, compactedMessageCount: 0 }
  }

  const olderWindows = windows.slice(0, windows.length - MAX_RECENT_TOOL_ROUNDS)
  const compactableRanges = olderWindows.map(window => ({
    start: window.start,
    end: window.end,
  }))
  let compactedMessageCount = 0
  const output = messages.map((message, index) => {
    const inOlderWindow = compactableRanges.some(range =>
      index >= range.start && index < range.end)
    const olderWindow = olderWindows.find(window =>
      index >= window.start && index < window.end)
    if (!inOlderWindow || !olderWindow) return message
    if (!isCompactableToolResult(message, describeToolExchanges(messages, olderWindow))) {
      return message
    }
    const content = message.content || ''
    if (content.length <= COMPACTED_RESULT_CHARS) return message
    compactedMessageCount += 1
    return {
      ...message,
      content: compactResultContent(content),
    }
  })
  return { messages: output, compactedMessageCount }
}
