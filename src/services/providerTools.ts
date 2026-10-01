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
    let input: unknown = {}
    if (typeof call?.function?.arguments === 'string') {
      try {
        input = JSON.parse(call.function.arguments)
      } catch {
        input = {}
      }
    } else if (call?.function?.arguments && typeof call.function.arguments === 'object') {
      input = call.function.arguments
    }
    return {
      id: normalizeToolCallId(providerType, call?.id, `openai-${index}`).id,
      name: String(call?.function?.name || ''),
      input,
    }
  })
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
