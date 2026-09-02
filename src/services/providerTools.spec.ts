import { describe, expect, it } from 'vitest'
import { getProviderProtocol } from './providerProtocols'
import {
  buildProviderTools,
  buildToolResultChatMessages,
  extractProviderToolCalls,
  supportsNativeTools,
} from './providerTools'
import type { AgentToolDefinition } from './editorTools'

const tool: AgentToolDefinition = {
  name: 'editor.get_state',
  description: '读取编辑目标摘要',
  policy: 'read',
  inputSchema: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
  },
  async execute() {
    return { ok: true }
  },
}

function requestBody(providerType: string, withTools: boolean) {
  return getProviderProtocol(providerType).buildRequestBody({
    model: 'test-model',
    messages: [{ role: 'user', content: '你好' }],
    stream: false,
    temperature: 0.7,
    maxTokens: 1024,
    tools: withTools ? buildProviderTools(providerType, [tool]) : undefined,
  })
}

describe('providerTools', () => {
  it('builds OpenAI-compatible native tools request body', () => {
    const body = requestBody('openai-compatible', true)
    expect((body.tools as any[])[0].type).toBe('function')
    expect((body.tools as any[])[0].function.name).toBe('editor.get_state')
  })

  it('builds DeepSeek and Azure with the same OpenAI tools shape', () => {
    for (const providerType of ['deepseek', 'azure-openai']) {
      const body = requestBody(providerType, true)
      expect((body.tools as any[])[0].function.parameters.required).toEqual(['query'])
    }
  })

  it('maps Anthropic tools and tool_use responses', () => {
    const body = requestBody('anthropic', true)
    expect((body.tools as any[])[0]).toMatchObject({
      name: 'editor.get_state',
      input_schema: tool.inputSchema,
    })
    const calls = extractProviderToolCalls('anthropic', {
      content: [{ type: 'tool_use', id: 'toolu_1', name: 'editor.get_state', input: { query: 'x' } }],
    })
    expect(calls).toEqual([{ id: 'toolu_1', name: 'editor.get_state', input: { query: 'x' } }])
  })

  it('maps Gemini function declarations and function calls', () => {
    const body = requestBody('gemini', true)
    expect((body.tools as any[])[0].functionDeclarations[0].name).toBe('editor_get_state')
    const calls = extractProviderToolCalls('gemini', {
      candidates: [{ content: { parts: [{ functionCall: { name: 'editor_get_state', args: { query: 'x' } } }] } }],
    })
    expect(calls).toEqual([{ id: 'editor_get_state', name: 'editor.get_state', input: { query: 'x' } }])
  })

  it('does not send tools when provider is not capable', () => {
    expect(supportsNativeTools('custom')).toBe(false)
    expect(buildProviderTools('custom', [tool])).toBeUndefined()
    const body = requestBody('openai-compatible', false)
    expect('tools' in body).toBe(false)
  })

  it('builds tool result follow-up messages for each protocol family', () => {
    const call = { id: 'call_1', name: 'editor.get_state', input: { query: 'x' } }
    const openaiPayload = {
      choices: [{ message: { content: '', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'editor.get_state', arguments: '{}' } }] } }],
    }
    const openaiMessages = buildToolResultChatMessages('openai-compatible', [{ role: 'user', content: '你好' }], openaiPayload, [
      { call, result: { ok: true } },
    ])
    const openaiBody = getProviderProtocol('openai-compatible').buildRequestBody({
      model: 'test-model',
      messages: openaiMessages,
      stream: false,
      temperature: 0.7,
      maxTokens: 1024,
    })
    const wireAssistant = (openaiBody.messages as any[]).at(-2)
    const wireTool = (openaiBody.messages as any[]).at(-1)
    expect(wireAssistant.tool_calls[0].id).toBe('call_1')
    expect(openaiMessages.at(-1)?.role).toBe('tool')
    expect(wireTool.tool_call_id).toBe('call_1')
    expect(JSON.parse(wireTool.content)).toEqual({ ok: true })

    const anthropicMessages = buildToolResultChatMessages('anthropic', [{ role: 'user', content: '你好' }], {
      content: [{ type: 'tool_use', id: 'toolu_1', name: 'editor.get_state', input: {} }],
    }, [{ call: { ...call, id: 'toolu_1' }, result: { ok: true } }])
    const anthropicBody = getProviderProtocol('anthropic').buildRequestBody({
      model: 'test-model',
      messages: anthropicMessages,
      stream: false,
      temperature: 0.7,
      maxTokens: 1024,
    })
    const anthropicWire = (anthropicBody.messages as any[]).at(-1)
    expect(anthropicWire.content[0].type).toBe('tool_result')
    expect(anthropicWire.content[0].tool_use_id).toBe('toolu_1')

    const geminiMessages = buildToolResultChatMessages('gemini', [{ role: 'user', content: '你好' }], {
      candidates: [{ content: { parts: [{ functionCall: { name: 'editor_get_state', args: {} } }] } }],
    }, [{ call, result: { ok: true } }])
    const geminiBody = getProviderProtocol('gemini').buildRequestBody({
      model: 'test-model',
      messages: geminiMessages,
      stream: false,
      temperature: 0.7,
      maxTokens: 1024,
    })
    const geminiWire = (geminiBody.contents as any[]).at(-1)
    expect(geminiWire.role).toBe('user')
    expect(geminiWire.parts[0].functionResponse.name).toBe('editor_get_state')
  })
})
