import { describe, expect, it } from 'vitest'
import { getProviderProtocol, httpErrorMessage } from './providerProtocols'
import { judgeConvergenceText } from './aiService'
import {
  buildProviderTools,
  buildToolResultChatMessages,
  extractProviderToolCalls,
  getProviderToolCapability,
  providerToolCapabilities,
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
  const writeTool: AgentToolDefinition = {
    ...tool,
    name: 'editor.write',
    description: '写入编辑目标',
    policy: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        commands: {
          type: 'array',
          items: { type: 'object' },
        },
      },
      required: ['commands'],
    },
    async execute() {
      return { ok: true }
    },
  }

  it('declares a complete provider capability matrix as the single source', () => {
    expect(Object.keys(providerToolCapabilities).sort()).toEqual([
      'anthropic',
      'azure-openai',
      'deepseek',
      'gemini',
      'openai-compatible',
    ])
    expect(providerToolCapabilities['openai-compatible']).toMatchObject({
      nativeTools: true,
      streamingToolCalls: 'implemented',
      toolResultWireFormat: 'openai-tool-role',
    })
    expect(providerToolCapabilities.deepseek.inheritsToolProtocolFrom).toBe('openai-compatible')
    expect(providerToolCapabilities['azure-openai'].inheritsToolProtocolFrom).toBe('openai-compatible')
    expect(providerToolCapabilities.anthropic.toolResultWireFormat).toBe('anthropic-tool-result')
    expect(providerToolCapabilities.gemini).toMatchObject({
      streamingToolCalls: 'implemented',
      toolResultWireFormat: 'gemini-function-response',
    })
    expect(getProviderToolCapability('custom')).toBeNull()
  })

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

  it('keeps Gemini single-dot tool names reversible', () => {
    const multiDotTool: AgentToolDefinition = {
      ...tool,
      name: 'editor.outline.chapter.read',
    }
    const body = requestBody('gemini', true)
    const geminiTools = buildProviderTools('gemini', [multiDotTool]) as any[]
    expect(body.tools).toBeDefined()
    expect(geminiTools[0].name).toBe('editor_outline_chapter_read')
    const calls = extractProviderToolCalls('gemini', {
      candidates: [{ content: { parts: [{ functionCall: { name: 'editor_outline_chapter_read', args: {} } }] } }],
    })
    expect(calls[0].name).toBe('editor.outline_chapter_read')
  })

  it('parses multiple OpenAI tool calls and preserves their order', () => {
    const calls = extractProviderToolCalls('openai-compatible', {
      choices: [{
        message: {
          tool_calls: [
            { id: 'call_1', type: 'function', function: { name: 'editor.search', arguments: '{"query":"a"}' } },
            { id: 'call_2', type: 'function', function: { name: 'editor.write', arguments: '{"commands":[]}' } },
          ],
        },
      }],
    })
    expect(calls.map(call => call.id)).toEqual(['call_1', 'call_2'])
    expect(calls.map(call => call.name)).toEqual(['editor.search', 'editor.write'])
    expect(calls[1].input).toEqual({ commands: [] })
  })

  it('downgrades invalid JSON tool arguments while preserving the raw string', () => {
    const calls = extractProviderToolCalls('deepseek', {
      choices: [{
        message: {
          tool_calls: [{ id: 'call_bad', type: 'function', function: { name: 'editor.write', arguments: '{"commands":' } }],
        },
      }],
    })
    expect(calls).toEqual([{
      id: 'call_bad',
      name: 'editor.write',
      input: {},
      argumentsRaw: '{"commands":',
      argumentsError: {
        code: 'arguments_invalid_json',
        message: expect.stringContaining('供应商返回的工具参数不是合法 JSON'),
        repairable: false,
      },
    }])
  })

  it('repairs unescaped quotes in string values and keeps the original raw arguments', () => {
    const argumentsRaw = '{"commands":[{"operation":"replace_match","target":"广播"无生命有机质"声明","content":""}],"reason":"去重"}'
    const calls = extractProviderToolCalls('deepseek', {
      choices: [{
        message: {
          tool_calls: [{ id: 'call_repair', type: 'function', function: { name: 'editor.write', arguments: argumentsRaw } }],
        },
      }],
    })
    expect(calls).toEqual([{
      id: 'call_repair',
      name: 'editor.write',
      input: {
        commands: [{ operation: 'replace_match', target: '广播"无生命有机质"声明', content: '' }],
        reason: '去重',
      },
      argumentsRaw,
      argumentsRepaired: true,
    }])
  })

  it('marks irreparable JSON with a provider diagnostics field instead of a silent empty input', () => {
    const calls = extractProviderToolCalls('deepseek', {
      choices: [{
        message: {
          tool_calls: [{ id: 'call_bad', type: 'function', function: { name: 'editor.write', arguments: '{"commands":' } }],
        },
      }],
    })
    expect(calls[0].argumentsError).toMatchObject({
      code: 'arguments_invalid_json',
      repairable: false,
    })
    expect(calls[0].input).toEqual({})
  })

  it('marks repaired arguments without a provider error', () => {
    const argumentsRaw = '{"target":"他说"你好"，然后离开"}'
    const calls = extractProviderToolCalls('openai-compatible', {
      choices: [{
        message: {
          tool_calls: [{ id: 'call_repaired', type: 'function', function: { name: 'editor.write', arguments: argumentsRaw } }],
        },
      }],
    })
    expect(calls[0]).toMatchObject({
      input: { target: '他说"你好"，然后离开' },
      argumentsRaw,
      argumentsRepaired: true,
    })
    expect(calls[0].argumentsError).toBeUndefined()
  })

  it('preserves raw arguments for empty and non-object tool arguments', () => {
    const calls = extractProviderToolCalls('openai-compatible', {
      choices: [{
        message: {
          tool_calls: [
            { id: 'call_empty', type: 'function', function: { name: 'editor.write', arguments: '' } },
            { id: 'call_array', type: 'function', function: { name: 'editor.write', arguments: '[1,2]' } },
          ],
        },
      }],
    })
    expect(calls[0]).toMatchObject({ input: {}, argumentsRaw: '' })
    expect(calls[1]).toMatchObject({ input: {}, argumentsRaw: '[1,2]' })
  })

  it('does not emit a tools field when the tool list is empty', () => {
    for (const providerType of ['openai-compatible', 'deepseek', 'anthropic', 'gemini', 'azure-openai']) {
      expect(buildProviderTools(providerType, [])).toBeUndefined()
    }
  })

  it('does not send tools when provider is not capable', () => {
    expect(supportsNativeTools('custom')).toBe(false)
    expect(buildProviderTools('custom', [tool])).toBeUndefined()
    const body = requestBody('openai-compatible', false)
    expect('tools' in body).toBe(false)
  })

  it('omits an undeclared output limit for OpenAI-compatible providers', () => {
    const body = getProviderProtocol('openai-compatible').buildRequestBody({
      model: 'test-model',
      messages: [{ role: 'user', content: '你好' }],
      stream: false,
      temperature: 0.7,
      maxTokens: null,
    })

    expect('max_tokens' in body).toBe(false)
  })

  it('keeps an explicit output override on the wire', () => {
    const body = getProviderProtocol('openai-compatible').buildRequestBody({
      model: 'test-model',
      messages: [{ role: 'user', content: '你好' }],
      stream: false,
      temperature: 0.7,
      maxTokens: 20_000,
    })

    expect(body.max_tokens).toBe(20_000)
  })

  it('uses the protocol-required output limit for Anthropic when capability is unknown', () => {
    const body = getProviderProtocol('anthropic').buildRequestBody({
      model: 'claude-3-5-sonnet',
      messages: [{ role: 'user', content: '你好' }],
      stream: false,
      temperature: 0.7,
      maxTokens: null,
    })

    expect(body.max_tokens).toBe(32_768)
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

  it('runs a six-step native tool loop for every supported provider', () => {
    const providers = [
      'openai-compatible',
      'deepseek',
      'azure-openai',
      'anthropic',
      'gemini',
    ] as const

    for (const providerType of providers) {
      const capability = getProviderToolCapability(providerType)
      expect(capability?.nativeTools).toBe(true)

      // 1. tool declaration uses the provider wire shape
      const firstBody = requestBody(providerType, true)
      const declaredName = providerType === 'anthropic'
        ? (firstBody.tools as any[])[0].name
        : providerType === 'gemini'
          ? (firstBody.tools as any[])[0].functionDeclarations[0].name
          : (firstBody.tools as any[])[0].function.name
      expect(declaredName).toContain('editor')

      // 2. provider returns a native editor.write call
      const assistantPayloads: Record<string, any> = {
        'openai-compatible': {
          choices: [{ message: { content: '', tool_calls: [{ id: 'call_openai', type: 'function', function: { name: 'editor.write', arguments: '{"commands":[{"operation":"append","content":"x"}]}' } }] } }],
        },
        deepseek: {
          choices: [{ message: { content: '', tool_calls: [{ id: 'call_deepseek', type: 'function', function: { name: 'editor.write', arguments: '{"commands":[]}' } }] } }],
        },
        'azure-openai': {
          choices: [{ message: { content: '', tool_calls: [{ id: 'call_azure', type: 'function', function: { name: 'editor.write', arguments: '{"commands":[]}' } }] } }],
        },
        anthropic: {
          content: [{ type: 'tool_use', id: 'toolu_anthropic', name: 'editor.write', input: { commands: [] } }],
        },
        gemini: {
          candidates: [{ content: { parts: [{ functionCall: { name: 'editor_write', args: { commands: [] } } }] } }],
        },
      }
      const assistantPayload = assistantPayloads[providerType]
      const calls = extractProviderToolCalls(providerType, assistantPayload)
      expect(calls).toHaveLength(1)
      expect(calls[0].name).toBe('editor.write')

      // 3-4. tool result follows the provider's native wire format
      const resultMessages = buildToolResultChatMessages(
        providerType,
        [{ role: 'user', content: '请写入第 3 节' }],
        assistantPayload,
        calls.map(call => ({ call, result: { ok: true, data: { status: 'written' } } }))
      )
      const body = getProviderProtocol(providerType).buildRequestBody({
        model: 'test-model',
        messages: resultMessages,
        stream: false,
        temperature: 0.7,
        maxTokens: 1024,
        tools: buildProviderTools(providerType, [writeTool]),
      })
      const wire = providerType === 'gemini'
        ? (body.contents as any[]).at(-1)
        : providerType === 'anthropic'
          ? (body.messages as any[]).at(-1)
          : (body.messages as any[]).at(-1)
      if (providerType === 'gemini') {
        expect(wire.parts.at(-1).functionResponse.name).toBe('editor_write')
        expect(wire.parts.at(-1).functionResponse.response).toMatchObject({ ok: true })
      } else if (providerType === 'anthropic') {
        expect(wire.content[0].type).toBe('tool_result')
        expect(wire.content[0].tool_use_id).toBe('toolu_anthropic')
      } else {
        expect(wire.role).toBe('tool')
        expect(wire.tool_call_id).toBe(calls[0].id)
        expect(JSON.parse(wire.content)).toMatchObject({ ok: true })
      }

      // 5. declaration is still attached for the next iteration
      expect(body.tools).toBeDefined()

      // 6. convergence no longer carries tools
      const convergenceMessages = providerType === 'gemini'
        ? [
            { role: 'user', content: '请写入第 3 节' },
            { role: 'user', geminiParts: [{ functionResponse: { name: 'editor_write', response: { ok: true } } }] },
          ]
        : resultMessages
      const convergenceBody = getProviderProtocol(providerType).buildRequestBody({
        model: 'test-model',
        messages: convergenceMessages,
        stream: false,
        temperature: 0.7,
        maxTokens: 1024,
      })
      expect(convergenceBody.tools).toBeUndefined()
    }
  })

  it('keeps the provider error matrix explicit', () => {
    const httpCases: Array<[string, number, string]> = [
      ['auth', 401, 'API Key 无效或未授权'],
      ['timeout', 408, '供应商响应超时'],
      ['rate-limit', 429, '请求过于频繁，已被供应商限流'],
      ['server', 500, '供应商服务异常'],
    ]
    for (const [name, status, message] of httpCases) {
      expect(httpErrorMessage(status, '')).toContain(message)
      expect(name).toBeTruthy()
    }

    expect(judgeConvergenceText({ text: '{"name":"editor.write","arguments":{"commands":[]}}' }).kind).toBe('pseudo_tool_call')
    expect(judgeConvergenceText({ text: '已完成写入。' }).kind).toBe('usable')
    expect(judgeConvergenceText({ text: '' }).kind).toBe('empty_or_failed')
  })
})
