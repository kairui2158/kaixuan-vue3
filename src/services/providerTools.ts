import type { AgentToolDefinition } from './editorTools'
import { normalizeToolCallId } from './traceFieldNormalizer'

export type ToolCapableProviderType =
  | 'openai-compatible'
  | 'deepseek'
  | 'anthropic'
  | 'gemini'
  | 'azure-openai'

export interface NormalizedToolCall {
  id: string
  name: string
  input: unknown
  /** Raw provider arguments when the wire value could not be normalized to an object. */
  argumentsRaw?: string
  /** Set when the model emitted recoverable malformed JSON arguments. */
  argumentsRepaired?: boolean
  /** Provider diagnostics when arguments cannot be converted into a tool input object. */
  argumentsError?: {
    code: 'arguments_invalid_json'
    message: string
    repairable: boolean
  }
}

export interface ProviderToolMessage {
  role: string
  content?: string
  toolCallId?: string
  toolName?: string
  toolCalls?: unknown[]
  anthropicContent?: unknown[]
  geminiParts?: unknown[]
}

export interface ProviderToolRequest {
  tools?: unknown
  messages: Array<Record<string, unknown>>
}

export type StreamingToolCallStatus = 'implemented' | 'unverified'

export type ToolResultWireFormat =
  | 'openai-tool-role'
  | 'anthropic-tool-result'
  | 'gemini-function-response'

export interface ProviderToolCapability {
  nativeTools: boolean
  streamingToolCalls: StreamingToolCallStatus | null
  strictSchema: boolean
  toolResultWireFormat: ToolResultWireFormat
  inheritsToolProtocolFrom?: ToolCapableProviderType
}

export const providerToolCapabilities: Record<ToolCapableProviderType, ProviderToolCapability> = {
  'openai-compatible': {
    nativeTools: true,
    streamingToolCalls: 'implemented',
    strictSchema: false,
    toolResultWireFormat: 'openai-tool-role',
  },
  deepseek: {
    nativeTools: true,
    streamingToolCalls: 'implemented',
    strictSchema: false,
    toolResultWireFormat: 'openai-tool-role',
    inheritsToolProtocolFrom: 'openai-compatible',
  },
  'azure-openai': {
    nativeTools: true,
    streamingToolCalls: 'implemented',
    strictSchema: false,
    toolResultWireFormat: 'openai-tool-role',
    inheritsToolProtocolFrom: 'openai-compatible',
  },
  anthropic: {
    nativeTools: true,
    streamingToolCalls: 'implemented',
    strictSchema: false,
    toolResultWireFormat: 'anthropic-tool-result',
  },
  gemini: {
    nativeTools: true,
    streamingToolCalls: 'implemented',
    strictSchema: false,
    toolResultWireFormat: 'gemini-function-response',
  },
}

export function getProviderToolCapability(providerType: string): ProviderToolCapability | null {
  return (providerToolCapabilities as Record<string, ProviderToolCapability | undefined>)[providerType] || null
}

export function supportsNativeTools(providerType: string): boolean {
  return getProviderToolCapability(providerType)?.nativeTools === true
}

function encodeGeminiToolName(name: string): string {
  return name.replace(/\./g, '_')
}

function decodeGeminiToolName(name: string): string {
  return name.replace(/_(?=[^.]*$)/, '.')
}

export function buildProviderTools(
  providerType: string,
  tools: AgentToolDefinition[]
): unknown | undefined {
  if (!supportsNativeTools(providerType) || tools.length === 0) return undefined

  if (providerType === 'anthropic') {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }))
  }

  if (providerType === 'gemini') {
    return tools.map(tool => ({
      name: encodeGeminiToolName(tool.name),
      description: tool.description,
      parameters: tool.inputSchema,
    }))
  }

  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }))
}

export function extractProviderToolCalls(
  providerType: string,
  data: any
): NormalizedToolCall[] {
  if (!supportsNativeTools(providerType)) return []

  if (providerType === 'anthropic') {
    const content = Array.isArray(data?.content) ? data.content : []
    return content
      .filter((item: any) => item?.type === 'tool_use')
      .map((item: any, index: number) => ({
        id: normalizeToolCallId(providerType, item.id, `anthropic-${index}`).id,
        name: String(item.name || ''),
        input: item.input ?? {},
      }))
  }

  if (providerType === 'gemini') {
    const parts = data?.candidates?.[0]?.content?.parts
    if (!Array.isArray(parts)) return []
    return parts
      .filter((part: any) => part?.functionCall)
      .map((part: any, index: number) => {
        const call = part.functionCall
        return {
          id: normalizeToolCallId(providerType, call?.name, `gemini-${index}`).id,
          name: decodeGeminiToolName(String(call?.name || '')),
          input: call?.args ?? {},
        }
      })
  }

  const calls = data?.choices?.[0]?.message?.tool_calls
  if (!Array.isArray(calls)) return []
  return calls.map((call: any, index: number) => {
    const rawArguments = call?.function?.arguments
    let input: unknown = {}
    let argumentsRaw: string | undefined
    let argumentsRepaired: boolean | undefined
    let argumentsError: NormalizedToolCall['argumentsError'] | undefined
    if (typeof rawArguments === 'string' && rawArguments !== '') {
      const normalized = normalizeOpenAiToolArguments(rawArguments)
      if (normalized.ok) {
        input = normalized.input
        argumentsRaw = normalized.repaired ? rawArguments : undefined
        argumentsRepaired = normalized.repaired || undefined
      } else {
        input = {}
        argumentsRaw = rawArguments
        argumentsError = normalized.error
      }
    } else if (typeof rawArguments === 'string') {
      argumentsRaw = rawArguments
    } else if (rawArguments && typeof rawArguments === 'object') {
      input = rawArguments
    }
    return {
      id: normalizeToolCallId(providerType, call?.id, `openai-${index}`).id,
      name: String(call?.function?.name || ''),
      input,
      ...(argumentsRaw === undefined ? {} : { argumentsRaw }),
      ...(argumentsRepaired === undefined ? {} : { argumentsRepaired }),
      ...(argumentsError === undefined ? {} : { argumentsError }),
    }
  })
}

type OpenAiToolArgumentsNormalization =
  | { ok: true; input: Record<string, unknown>; repaired: boolean }
  | { ok: false; error: NonNullable<NormalizedToolCall['argumentsError']> }

function normalizeOpenAiToolArguments(rawArguments: string): OpenAiToolArgumentsNormalization {
  try {
    const parsed = JSON.parse(rawArguments)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ok: true, input: parsed as Record<string, unknown>, repaired: false }
    }
  } catch (error) {
    const repaired = repairUnescapedDoubleQuotes(rawArguments)
    let repairSucceeded = false
    if (repaired !== null) {
      try {
        const parsed = JSON.parse(repaired)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          repairSucceeded = true
          return { ok: true, input: parsed as Record<string, unknown>, repaired: true }
        }
      } catch {}
    }
    return {
      ok: false,
      error: {
        code: 'arguments_invalid_json',
        message: `供应商返回的工具参数不是合法 JSON${error instanceof Error ? `：${error.message}` : ''}。请重新提交 editor.write 参数，JSON 字符串值内的双引号必须转义。`,
        repairable: repairSucceeded,
      },
    }
  }
  return {
    ok: false,
    error: {
      code: 'arguments_invalid_json',
      message: '供应商返回的工具参数不是 JSON object。',
      repairable: false,
    },
  }
}

function repairUnescapedDoubleQuotes(source: string): string | null {
  let repaired = ''
  let inString = false
  let escaped = false
  for (let index = 0; index < source.length; index++) {
    const char = source[index]
    if (escaped) {
      repaired += char
      escaped = false
      continue
    }
    if (char === '\\') {
      repaired += char
      escaped = true
      continue
    }
    if (char === '"') {
      if (!inString) {
        inString = true
        repaired += char
        continue
      }
      const next = source[index + 1]
      if (next === undefined || next === ',' || next === '}' || next === ']') {
        inString = false
      } else if (next === ':') {
        inString = false
      } else if (next === ' ' && (source[index + 2] === ':' || source[index + 2] === ',' || source[index + 2] === '}' || source[index + 2] === ']')) {
        inString = false
      } else {
        repaired += '\\"'
        continue
      }
      repaired += char
      continue
    }
    repaired += char
  }
  return repaired
}

export function buildToolResultMessage(
  providerType: string,
  call: NormalizedToolCall,
  result: unknown
): ProviderToolMessage {
  return {
    role: 'tool',
    content: JSON.stringify(result),
    toolCallId: call.id,
  }
}

export function buildToolResultChatMessages(
  providerType: string,
  messages: Array<ProviderToolMessage>,
  assistantPayload: any,
  toolResults: Array<{ call: NormalizedToolCall; result: unknown }>
): Array<ProviderToolMessage> {
  if (providerType === 'anthropic') {
    const next = messages.map(message => ({ ...message }))
    next.push({
      role: 'assistant',
      anthropicContent: Array.isArray(assistantPayload?.content)
        ? assistantPayload.content
        : [{ type: 'text', text: '' }],
    })
    next.push({
      role: 'user',
      anthropicContent: toolResults.map(item => ({
        type: 'tool_result',
        tool_use_id: item.call.id,
        content: JSON.stringify(item.result),
      })),
    })
    return next
  }

  if (providerType === 'gemini') {
    const next = messages.map(message => ({ ...message }))
    const assistantParts: Array<Record<string, unknown>> = []
    const calls = extractProviderToolCalls(providerType, assistantPayload)
    for (const call of calls) assistantParts.push({ functionCall: { name: encodeGeminiToolName(call.name), args: call.input } })
    next.push({ role: 'assistant', geminiParts: assistantParts })
    next.push({
      role: 'user',
      geminiParts: toolResults.map(item => ({
        functionResponse: {
          name: encodeGeminiToolName(item.call.name),
          response: item.result,
        },
      })),
    })
    return next
  }

  const next = messages.map(message => ({ ...message }))
  next.push({
    role: 'assistant',
    content: assistantPayload?.choices?.[0]?.message?.content || '',
    toolCalls: assistantPayload?.choices?.[0]?.message?.tool_calls || [],
  })
  for (const item of toolResults) {
    next.push({
      ...buildToolResultMessage(providerType, item.call, item.result),
    })
  }
  return next
}
