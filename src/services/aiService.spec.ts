import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildChatUrl, buildModelsUrl, extractNonStreamText, extractStreamDelta, isSSEDataLine, isSSEDone, normalizeFinishReason, resolveFinishReason, resolveModel, resolveTemperature, resolveMaxTokens } from './providerAdapter';
import { buildProviderChatUrl, buildProviderModelsUrl, buildProviderHeaders, buildProviderModelsHeaders, getProviderProtocol, httpErrorMessage, sanitizeUrlForLog } from './providerProtocols';
import { resolveProvider, tryResolveProvider } from './providerRouter';
import { createAiService, createThinkingTagStreamFilter, filterThinkingTags, resolveRequestTimeout, AiServiceErrorImpl, classifyToolRejection } from './aiService';
import { buildLongDocumentExecutionPlan } from './longDocumentExecutionPlanner';

// ── providerAdapter tests ──────────────────────────────────────────

describe('buildChatUrl', () => {
  it('appends /v1/chat/completions when baseUrl has no version', () => {
    expect(buildChatUrl('https://api.example.com')).toBe('https://api.example.com/v1/chat/completions');
  }, 30_000);
  it('appends /chat/completions when baseUrl already ends with /v1', () => {
    expect(buildChatUrl('https://api.example.com/v1')).toBe('https://api.example.com/v1/chat/completions');
  });
  it('strips trailing slash and appends', () => {
    expect(buildChatUrl('https://api.example.com/v1/')).toBe('https://api.example.com/v1/chat/completions');
  });
  it('preserves /v2 version prefix', () => {
    expect(buildChatUrl('https://api.example.com/v2')).toBe('https://api.example.com/v2/chat/completions');
  });
});

describe('buildModelsUrl', () => {
  it('appends /v1/models', () => {
    expect(buildModelsUrl('https://api.example.com')).toBe('https://api.example.com/v1/models');
  });
  it('preserves existing version', () => {
    expect(buildModelsUrl('https://api.example.com/v1')).toBe('https://api.example.com/v1/models');
  });
});

describe('provider protocol endpoints', () => {
  it('does not double-append a full chat endpoint', () => {
    expect(buildProviderChatUrl({ baseUrl: 'https://api.example.com/v1/chat/completions' }))
      .toBe('https://api.example.com/v1/chat/completions');
  });

  it('derives the models endpoint from a full chat endpoint without double paths', () => {
    expect(buildProviderModelsUrl({ baseUrl: 'https://api.example.com/v1/chat/completions' }))
      .toBe('https://api.example.com/v1/models');
  });

  it('keeps versioned base URLs for OpenAI-compatible providers', () => {
    expect(buildProviderChatUrl({ baseUrl: 'https://api.example.com/v2' }))
      .toBe('https://api.example.com/v2/chat/completions');
  });

  it('uses DeepSeek official non-v1 chat path', () => {
    expect(buildProviderChatUrl({ baseUrl: 'https://api.deepseek.com', providerType: 'deepseek' }))
      .toBe('https://api.deepseek.com/chat/completions');
  });

  it('builds Anthropic message and auth headers', () => {
    expect(buildProviderChatUrl({ baseUrl: 'https://api.anthropic.com', providerType: 'anthropic' }))
      .toBe('https://api.anthropic.com/v1/messages');
    expect(buildProviderHeaders('anthropic', 'test-key')['x-api-key']).toBe('test-key');
    expect(buildProviderModelsHeaders('gemini', 'test-key')['x-goog-api-key']).toBe('test-key');
  });

  it('builds Gemini endpoints and sanitizes keys in logs', () => {
    expect(buildProviderChatUrl({ baseUrl: 'https://generativelanguage.googleapis.com', providerType: 'gemini', model: 'gemini-2.0-flash' }))
      .toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent');
    expect(sanitizeUrlForLog('https://example.com/v1beta/models?key=secret'))
      .not.toContain('secret');
  });

  it('builds Azure deployment URLs', () => {
    expect(buildProviderChatUrl({ baseUrl: 'https://example.openai.azure.com', providerType: 'azure-openai', deployment: 'dep', apiVersion: '2024-02-01' }))
      .toBe('https://example.openai.azure.com/openai/deployments/dep/chat/completions?api-version=2024-02-01');
  });

  it('returns Chinese error messages for provider failures', () => {
    expect(httpErrorMessage(402, 'Insufficient Balance')).toContain('余额不足');
  });
});

describe('extractNonStreamText', () => {
  it('extracts from choices[0].message.content', () => {
    const data = { choices: [{ message: { content: 'Hello' } }] };
    expect(extractNonStreamText(data).text).toBe('Hello');
  });
  it('keeps reasoning_content separate from body text', () => {
    const data = { choices: [{ message: { reasoning_content: 'Reasoning' } }] };
    expect(extractNonStreamText(data).text).toBe('');
    expect(extractNonStreamText(data).reasoning).toBe('Reasoning');
  });
  it('returns empty string when no content', () => {
    expect(extractNonStreamText({}).text).toBe('');
  });
  it('extracts usage', () => {
    const data = { choices: [{ message: { content: 'Hi' } }], usage: { total_tokens: 100 } };
    expect(extractNonStreamText(data).usage).toEqual({ total_tokens: 100 });
  });
});

describe('classifyToolRejection', () => {
  it('maps protocol capability rejection codes to a normalized category', () => {
    expect(classifyToolRejection({ ok: false, error: { code: 'unsupported_protocol_version', message: '不支持' } })).toBe('invalid_protocol')
  })
  it('maps tool surface and schema failures without changing tool behavior', () => {
    expect(classifyToolRejection({ ok: false, error: { code: 'tool_not_found', message: '工具不存在' } })).toBe('unknown_tool')
    expect(classifyToolRejection({ ok: false, error: { code: 'missing_field', message: '缺少参数' } })).toBe('schema_invalid')
    expect(classifyToolRejection({ ok: false, error: { code: 'invalid_input', message: '参数错误' } })).toBe('schema_invalid')
    expect(classifyToolRejection({ ok: false, error: { code: 'permission_denied', message: '无写入权限' } })).toBe('permission_denied')
    expect(classifyToolRejection({ ok: false, error: { code: 'invalid_range', message: '区间错误' } })).toBe('range_invalid')
    expect(classifyToolRejection({ ok: false, error: { code: 'range_too_large', message: '区间过大' } })).toBe('range_invalid')
    expect(classifyToolRejection({ ok: false, error: { code: 'section_not_found', message: '节不存在' } })).toBe('range_invalid')
    expect(classifyToolRejection({ ok: false, error: { code: 'duplicate_write_blocked', message: '重复写入' } })).toBe('other')
    expect(classifyToolRejection({ ok: true, data: {} })).toBeUndefined()
  })
})

describe('extractStreamDelta', () => {
  it('extracts content from delta', () => {
    const json = { choices: [{ delta: { content: 'Hello' } }] };
    expect(extractStreamDelta(json).content).toBe('Hello');
  });
  it('extracts reasoning_content', () => {
    const json = { choices: [{ delta: { reasoning_content: 'Think' } }] };
    expect(extractStreamDelta(json).reasoning).toBe('Think');
  });
  it('returns null for missing delta', () => {
    const json = { choices: [{}] };
    expect(extractStreamDelta(json).content).toBeNull();
  });
});

describe('cross-provider finish reason resolution', () => {
  it('normalizes provider-specific length markers', () => {
    expect(normalizeFinishReason('max_tokens')).toBe('length');
    expect(normalizeFinishReason('END_TURN')).toBe('stop');
    expect(normalizeFinishReason(undefined)).toBeUndefined();
  });
  it('treats completion tokens near max_tokens as truncation', () => {
    expect(resolveFinishReason(undefined, { completion_tokens: 979 }, 1000, true)).toBe('length');
  });
  it('does not invent truncation without token evidence', () => {
    expect(resolveFinishReason(undefined, { completion_tokens: 500 }, 1000, true)).toBe('stop');
    expect(resolveFinishReason(undefined, undefined, 1000, true)).toBe('stop');
  });
  it('detects output budget exhaustion even when the body is empty', () => {
    expect(resolveFinishReason(undefined, { completion_tokens: 1000 }, 1000, false)).toBe('length');
  });
  it('keeps an empty body without token evidence as stop', () => {
    expect(resolveFinishReason(undefined, { completion_tokens: 500 }, 1000, false)).toBe('stop');
  });
});

describe('isSSEDataLine', () => {
  it('matches data: prefix', () => { expect(isSSEDataLine('data: {\"key\":\"val\"}')).toBe(true); });
  it('rejects plain text', () => { expect(isSSEDataLine('plain text')).toBe(false); });
  it('rejects event: line', () => { expect(isSSEDataLine('event: done')).toBe(false); });
});

describe('isSSEDone', () => {
  it('matches [DONE]', () => { expect(isSSEDone('[DONE]')).toBe(true); });
  it('rejects other values', () => { expect(isSSEDone('data: [DONE]')).toBe(false); });
});

describe('resolveModel', () => {
  const provider = { id: 'p1', name: 'P1', baseUrl: '', apiKey: '', selectedModel: 'gpt-4', temperature: 0.7, maxTokens: 8192, streamMode: false, systemPrompt: '' };
  it('uses override when provided', () => { expect(resolveModel(provider, 'claude-3')).toBe('claude-3'); });
  it('falls back to provider selectedModel', () => { expect(resolveModel(provider)).toBe('gpt-4'); });
  it('defaults to gpt-4o when nothing is set', () => { expect(resolveModel({ ...provider, selectedModel: '' })).toBe('gpt-4o'); });
});

describe('resolveTemperature', () => {
  const provider = { id: 'p1', name: 'P1', baseUrl: '', apiKey: '', selectedModel: '', temperature: 0.5, maxTokens: 8192, streamMode: false, systemPrompt: '' };
  it('uses override when provided', () => { expect(resolveTemperature(provider, 0.3)).toBe(0.3); });
  it('falls back to provider temperature', () => { expect(resolveTemperature(provider)).toBe(0.5); });
  it('defaults to 0.7', () => { expect(resolveTemperature({ ...provider, temperature: undefined as any })).toBe(0.7); });
});

describe('resolveMaxTokens', () => {
  const provider = { id: 'p1', name: 'P1', baseUrl: '', apiKey: '', selectedModel: '', temperature: 0.7, maxTokens: 4096, streamMode: false, systemPrompt: '' };
  it('uses override when provided', () => { expect(resolveMaxTokens(provider, 8192)).toBe(8192); });
  it('passes large overrides through without an app-imposed cap', () => { expect(resolveMaxTokens(provider, 99999)).toBe(99999); });
  it('falls back to provider maxTokens', () => { expect(resolveMaxTokens(provider)).toBe(4096); });
  it('returns null when no override or provider cap is declared', () => {
    expect(resolveMaxTokens({ ...provider, maxTokens: 0 })).toBeNull();
  });
  it('uses the protocol-required value for Anthropic when capability is unknown', () => {
    const anthropic = { ...provider, maxTokens: 0, providerType: 'anthropic' };
    expect(resolveMaxTokens(anthropic)).toBe(32768);
  });
});

// ── providerRouter tests ──────────────────────────────────────────

describe('resolveProvider', () => {
  const mockStore = {
    providers: [
      { id: 'gen1', name: 'Gen1', selectedModel: 'gpt-4', temperature: 0.7, maxTokens: 8192, baseUrl: '', apiKey: '', streamMode: false, systemPrompt: '' },
      { id: 'ver1', name: 'Ver1', selectedModel: 'gpt-4', temperature: 0.7, maxTokens: 8192, baseUrl: '', apiKey: '', streamMode: false, systemPrompt: '' },
    ],
    generateProvider: 'gen1',
    verifyProvider: 'ver1',
    detectProvider: null,
    getGenerateProvider() { return this.providers.find(p => p.id === this.generateProvider); },
    getVerifyProvider() { return this.providers.find(p => p.id === this.verifyProvider); },
    getDetectProvider() { return this.providers.find(p => p.id === this.detectProvider); },
  };
  it('resolves generate provider', () => { const r = resolveProvider(mockStore as any, 'generate'); expect(r.providerId).toBe('gen1'); });
  it('resolves verify provider', () => { const r = resolveProvider(mockStore as any, 'verify'); expect(r.providerId).toBe('ver1'); });
  it('rewrite falls back to generate provider', () => { const r = resolveProvider(mockStore as any, 'rewrite'); expect(r.providerId).toBe('gen1'); });
  it('throws when no provider for purpose', () => { expect(() => resolveProvider(mockStore as any, 'detect')).toThrow(/未配置/); });
});

describe('tryResolveProvider', () => {
  const mockStore = {
    providers: [], generateProvider: null, verifyProvider: null, detectProvider: null,
    getGenerateProvider() { return undefined; },
    getVerifyProvider() { return runtimeProvider; },
    getDetectProvider() { return undefined; },
  };
  it('returns null when no provider', () => { expect(tryResolveProvider(mockStore as any, 'generate')).toBeNull(); });
});

// ── aiService tests ────────────────────────────────────────────────

describe('filterThinkingTags', () => {
  it('removes <thinking> tags', () => { expect(filterThinkingTags('Hello <thinking>internal</thinking> World')).toBe('Hello  World'); });
  it('removes <reasoning> tags', () => { expect(filterThinkingTags('A<reasoning>deep</reasoning>B')).toBe('AB'); });
  it('returns original text when no tags', () => { expect(filterThinkingTags('Hello World')).toBe('Hello World'); });
});

describe('createThinkingTagStreamFilter', () => {
  it('emits deltas incrementally and removes complete thinking tags', () => {
    const filter = createThinkingTagStreamFilter();
    expect(filter.push('He')).toBe('He');
    expect(filter.push('llo <t')).toBe('llo ');
    expect(filter.push('hinking>hidden</t')).toBe('');
    expect(filter.push('hinking> World')).toBe(' World');
  });

  it('flushes an unterminated tag so the final text is not truncated', () => {
    const filter = createThinkingTagStreamFilter();
    expect(filter.push('A<reasoning>still thinking')).toBe('A');
    expect(filter.flush()).toBe('still thinking');
  });
});

// ── callAi runtime error boundaries ────────────────────────────────

const runtimeProvider = {
  id: 'runtime', name: 'Runtime', baseUrl: 'https://api.example.com', apiKey: 'key',
  selectedModel: 'test-model', temperature: 0.2, maxTokens: 1024,
  providerType: 'openai-compatible',
  streamMode: false, systemPrompt: '',
  contextWindowTokens: 0,
};

function runtimeStore(provider = runtimeProvider) {
  return {
    providers: [provider],
    generateProvider: 'runtime', verifyProvider: 'runtime', detectProvider: null,
    getGenerateProvider() { return provider; },
    getVerifyProvider() { return provider; },
    getDetectProvider() { return undefined; },
  } as any;
}

describe('createAiService.callAi', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('propagates finish_reason from a non-streaming response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'partial' }, finish_reason: 'length' }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    await expect(service.callAi({
      purpose: 'generate', messages: [{ role: 'user', content: 'test' }],
      stream: false, retry: false,
    })).resolves.toMatchObject({ text: 'partial', finishReason: 'length' });
    vi.unstubAllGlobals();
  });

  it('returns context budget and usage reconciliation for a no-tool call', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'budgeted' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 240, completion_tokens: 10, total_tokens: 250 },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore({
      ...runtimeProvider,
      contextWindowTokens: 5_000,
      maxTokens: 0,
    }));
    await expect(service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '中'.repeat(1700) }],
      stream: false,
    })).resolves.toMatchObject({
      contextBudget: {
        decision: 'needs_segmentation',
        providerContextWindowTokens: 5_000,
        estimatedInputTokens: 1000,
      },
      usageReconciliation: {
        status: 'available',
        actualInputTokens: 240,
        driftRatio: -0.76,
      },
    });
    vi.unstubAllGlobals();
  });

  it('defaults a normal SSE EOF to finish_reason=stop and preserves length', async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"first"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"second"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    const makeResponse = () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sse));
        controller.close();
      },
    }), { status: 200 });
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(makeResponse()));
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    await expect(service.callAi({
      purpose: 'generate', messages: [{ role: 'user', content: 'test' }],
    })).resolves.toMatchObject({ text: 'firstsecond', finishReason: 'length' });
    vi.unstubAllGlobals();
  });

  it('aggregates non-delta SSE message tool_calls into a native tool loop', async () => {
    const toolSse = [
      'data: {"choices":[{"message":{"role":"assistant","content":null,"tool_calls":[{"id":"call_message_1","type":"function","function":{"name":"editor.get_state","arguments":"{\\"query\\":\\"第3节\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    const finalSse = [
      'data: {"choices":[{"delta":{"content":"已完成读取"},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    const makeStream = (payload: string) => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(payload));
        controller.close();
      },
    }), { status: 200 });
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => Promise.resolve(makeStream(toolSse)))
      .mockImplementationOnce(() => Promise.resolve(makeStream(finalSse)));
    vi.stubGlobal('fetch', fetchMock);
    const tool = {
      name: 'editor.get_state',
      description: '读取编辑器状态',
      policy: 'read' as const,
      inputSchema: { type: 'object' as const, properties: { query: { type: 'string' } } },
      async execute() { return { ok: true, data: { length: 12 } } },
    };
    const service = createAiService(runtimeStore());
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '读取第3节' }],
      tools: [tool],
      stream: true,
    });
    expect(result.text).toBe('已完成读取');
    expect(result.toolCalls).toEqual([{ id: 'call_message_1', name: 'editor.get_state', input: { query: '第3节' } }]);
    expect(result.toolResults?.[0].result.data).toEqual({ length: 12 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(secondBody.messages.at(-2).tool_calls[0].id).toBe('call_message_1');
    expect(secondBody.messages.at(-1).tool_call_id).toBe('call_message_1');
    vi.unstubAllGlobals();
  });

  it('aggregates Gemini SSE function calls into a native tool loop', async () => {
    const sse = [
      'data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"editor_get_state","args":{"query":"第3节"}}}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":5,"totalTokenCount":15}}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    const toolStream = () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sse));
        controller.close();
      },
    }), { status: 200 });
    const finalStream = () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode([
          'data: {"candidates":[{"content":{"parts":[{"text":"已完成读取"}]},"finishReason":"STOP"}]}\n\n',
          'data: [DONE]\n\n',
        ].join('')));
        controller.close();
      },
    }), { status: 200 });
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => Promise.resolve(toolStream()))
      .mockImplementationOnce(() => Promise.resolve(finalStream()));
    vi.stubGlobal('fetch', fetchMock);
    const tool = {
      name: 'editor.get_state',
      description: '读取编辑器状态',
      policy: 'read' as const,
      inputSchema: { type: 'object' as const, properties: { query: { type: 'string' } }, required: ['query'] },
      async execute() { return { ok: true, data: { length: 12 } } },
    };
    const service = createAiService(runtimeStore({
      ...runtimeProvider,
      providerType: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com',
    }));
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '读取第3节' }],
      tools: [tool],
      stream: true,
      retry: false,
    });
    expect(result.text).toBe('已完成读取');
    expect(result.toolCalls).toEqual([{ id: 'editor_get_state', name: 'editor.get_state', input: { query: '第3节' } }]);
    expect(result.toolResults?.[0].result.data).toEqual({ length: 12 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const secondBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(firstBody.tools[0].functionDeclarations[0].name).toBe('editor_get_state');
    expect(fetchMock.mock.calls[0][0]).toContain(':streamGenerateContent');
    expect(secondBody.tools[0].functionDeclarations[0].name).toBe('editor_get_state');
    expect(secondBody.contents.at(-1).role).toBe('user');
    expect(secondBody.contents.at(-1).parts[0].functionResponse.name).toBe('editor_get_state');
    expect(result.usage).toBeUndefined();
    expect(result.usageUnavailable).toBe(true);
    vi.unstubAllGlobals();
  });

  it('aggregates Anthropic SSE tool_use blocks into a native tool loop', async () => {
    const toolSse = [
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_1","name":"editor.get_state","input":{}}}\n\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"query\\":"}}\n\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\\"第3节\\"}"}}\n\n',
      'data: {"type":"content_block_stop","index":0}\n\n',
      'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":12}}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    const finalSse = [
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"已完成读取"}}\n\n',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    const response = (payload: string) => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(payload));
        controller.close();
      },
    }), { status: 200 });
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => Promise.resolve(response(toolSse)))
      .mockImplementationOnce(() => Promise.resolve(response(finalSse)));
    vi.stubGlobal('fetch', fetchMock);
    const tool = {
      name: 'editor.get_state',
      description: '读取编辑器状态',
      policy: 'read' as const,
      inputSchema: { type: 'object' as const, properties: { query: { type: 'string' } }, required: ['query'] },
      async execute() { return { ok: true, data: { length: 12 } } },
    };
    const service = createAiService(runtimeStore({
      ...runtimeProvider,
      providerType: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
    }));
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '读取第3节' }],
      tools: [tool],
      stream: true,
      retry: false,
    });
    expect(result.text).toBe('已完成读取');
    expect(result.toolCalls).toEqual([{ id: 'toolu_1', name: 'editor.get_state', input: { query: '第3节' } }]);
    expect(result.toolResults?.[0].result.data).toEqual({ length: 12 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const secondBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(firstBody.tools[0].name).toBe('editor.get_state');
    expect(firstBody.stream).toBe(true);
    expect(secondBody.tools[0].name).toBe('editor.get_state');
    expect(secondBody.messages.at(-1).content[0]).toMatchObject({
      type: 'tool_result',
      tool_use_id: 'toolu_1',
    });
    expect(result.usage).toBeUndefined();
    expect(result.usageUnavailable).toBe(true);
    vi.unstubAllGlobals();
  });

  it('classifies a main-process 408 as timeout with status diagnostics', async () => {
    const requestMock = vi.fn().mockResolvedValue({
      ok: false,
      kind: 'timeout',
      statusCode: 408,
      message: '供应商响应超时',
    });
    vi.stubGlobal('window', {
      electronAPI: {
        providerNetRequest: requestMock,
        providerNetStream: vi.fn(),
        providerNetAbort: vi.fn(() => Promise.resolve()),
        onProviderNetStreamChunk: vi.fn(() => () => {}),
      },
    });
    const service = createAiService(runtimeStore());
    await expect(service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: 'test' }],
      stream: false,
      retry: false,
    })).rejects.toMatchObject({ kind: 'timeout', statusCode: 408 });
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it('emits only newly received SSE text and filters tags split across chunks', async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"He"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"llo <t"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"hinking>secret</thinking>!"}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    const makeResponse = () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sse));
        controller.close();
      },
    }), { status: 200 });
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(makeResponse()));
    vi.stubGlobal('fetch', fetchMock);
    const chunks: string[] = [];
    const service = createAiService(runtimeStore());
    const request = service.callAi({
      purpose: 'generate', messages: [{ role: 'user', content: 'test' }],
      retry: false,
      stream: true,
      onChunk: text => chunks.push(text),
    });
    await expect(request).resolves.toMatchObject({ text: 'Hello !', finishReason: 'stop' });
    expect(chunks.join('')).toBe('Hello !');
    expect(chunks).toEqual(['He', 'llo ', '!']);
    vi.unstubAllGlobals();
  });

  it('preserves main-process network classification and physically reconnects direct tool rounds', async () => {
    let emitMainNetEvent: ((payload: any) => void) | null = null;
    const emitCurrentStream = (events: any[]) => {
      const signalId = streamMock.mock.calls.at(-1)?.[0]?.signalId;
      for (const event of events) emitMainNetEvent?.({ ...event, signalId });
    };
    const streamMock = vi.fn()
      .mockImplementationOnce(() => Promise.resolve({
        ok: false,
        kind: 'network',
        message: 'socket hang up',
      }))
      .mockImplementationOnce(() => {
        emitCurrentStream([
          { event: 'chunk', text: 'data: {"choices":[{"delta":{"content":"reconnected"}}]}\n\n' },
          { event: 'chunk', text: 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' },
          { event: 'chunk', text: 'data: [DONE]\n\n' },
          { event: 'end' },
        ]);
        return Promise.resolve({ ok: true, statusCode: 200 });
      });
    vi.stubGlobal('window', {
      electronAPI: {
        providerNetRequest: vi.fn(() => Promise.resolve({ ok: true, statusCode: 200, text: '' })),
        providerNetStream: streamMock,
        providerNetAbort: vi.fn(() => Promise.resolve()),
        onProviderNetStreamChunk: (listener: (payload: any) => void) => {
          emitMainNetEvent = listener;
          return () => { emitMainNetEvent = null; };
        },
      },
    });
    const physicalEvents: any[] = [];
    const service = createAiService(runtimeStore());
    const request = service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: 'test' }],
      stream: true,
      retry: false,
      timeoutMs: 120_000,
      onPhysicalCall: event => physicalEvents.push(event),
    });
    const startedAt = Date.now();
    const result = await request;
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(1000);
    expect(result.text).toBe('reconnected');
    expect(streamMock).toHaveBeenCalledTimes(2);
    expect(physicalEvents.filter(event => event.status === 'failed').map(event => event.error)).toEqual(['socket hang up']);
    expect(physicalEvents.filter(event => event.status === 'success')).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it('does not physically reconnect a slow-stream-tolerant request after output has started', async () => {
    let emitMainNetEvent: ((payload: any) => void) | null = null;
    let currentSignalId = '';
    const emitCurrentStream = (events: any[]) => {
      for (const event of events) emitMainNetEvent?.({ ...event, signalId: currentSignalId });
    };
    const streamMock = vi.fn()
      .mockImplementationOnce((request: any) => {
        currentSignalId = request.signalId;
        emitCurrentStream([
          { event: 'chunk', text: 'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n' },
          { event: 'error', message: 'network dropped' },
        ]);
        return Promise.resolve({ ok: true, statusCode: 200, text: '' });
      });
    vi.stubGlobal('window', {
      electronAPI: {
        providerNetRequest: vi.fn(() => Promise.resolve({ ok: true, statusCode: 200, text: '' })),
        providerNetStream: streamMock,
        providerNetAbort: vi.fn(() => Promise.resolve()),
        onProviderNetStreamChunk: (listener: (payload: any) => void) => {
          emitMainNetEvent = listener;
          return () => { emitMainNetEvent = null; };
        },
      },
    });
    const physicalEvents: any[] = [];
    const service = createAiService(runtimeStore());
    const request = service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: 'test' }],
      stream: true,
      retry: false,
      timeoutMs: null,
      slowStreamTolerant: true,
      onPhysicalCall: event => physicalEvents.push(event),
    });
    await Promise.resolve();
    await Promise.resolve();
    await expect(request).rejects.toMatchObject({ code: 'slow_stream_interrupted' });
    expect(streamMock).toHaveBeenCalledTimes(1);
    expect(physicalEvents.filter(event => event.status === 'failed')).toHaveLength(1);
    expect(physicalEvents.find(event => event.status === 'failed')?.interruptionCode).toBe('slow_stream_interrupted');
    vi.unstubAllGlobals();
  });

  it('keeps filtered reasoning deltas and the flushed tail in the final result', async () => {
    const sse = [
      'data: {"choices":[{"delta":{"reasoning_content":"<reasoning>open"}}]}\n\n',
      'data: {"choices":[{"delta":{"reasoning_content":" tail"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"body"}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    const makeResponse = () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sse));
        controller.close();
      },
    }), { status: 200 });
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(makeResponse()));
    vi.stubGlobal('fetch', fetchMock);
    const reasoningDeltas: string[] = [];
    const service = createAiService(runtimeStore());
    await expect(service.callAi({
      purpose: 'generate', messages: [{ role: 'user', content: 'test' }],
      retry: false, stream: true,
      onReasoning: text => reasoningDeltas.push(text),
    })).resolves.toMatchObject({ text: 'body', reasoning: 'open tail' });
    expect(reasoningDeltas.join('')).toBe('open tail');
    vi.unstubAllGlobals();
  });

  it('keeps an unterminated reasoning tag out of the body but in the final result', async () => {
    const sse = [
      'data: {"choices":[{"delta":{"reasoning_content":"<reasoning>still thinking"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"正文"}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    const makeResponse = () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sse));
        controller.close();
      },
    }), { status: 200 });
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(makeResponse()));
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    await expect(service.callAi({
      purpose: 'generate', messages: [{ role: 'user', content: 'test' }],
      retry: false, stream: true,
      onReasoning: () => {},
    })).resolves.toMatchObject({ text: '正文', reasoning: 'still thinking' });
    vi.unstubAllGlobals();
  });

  it('defaults a normal SSE EOF without finish_reason to stop', async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"complete"}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sse));
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    await expect(service.callAi({
      purpose: 'generate', messages: [{ role: 'user', content: 'test' }],
      retry: false,
    })).resolves.toMatchObject({ text: 'complete', finishReason: 'stop' });
    vi.unstubAllGlobals();
  });

  it('infers streaming truncation from usage when finish_reason is missing', async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"long"}}]}\n\n',
      'data: {"choices":[{"delta":{}}],"usage":{"completion_tokens":1023}}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sse));
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService({ ...runtimeStore(), providers: [{ ...runtimeProvider, maxTokens: 1024 }] });
    await expect(service.callAi({
      purpose: 'generate', messages: [{ role: 'user', content: 'test' }],
      retry: false,
    })).resolves.toMatchObject({ text: 'long', finishReason: 'length', usage: { outputTokens: 1023, totalTokens: 1023 } });
    vi.unstubAllGlobals();
  });

  it('physically retries one transient network failure even when retry is disabled', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('网络不可用'))
      .mockRejectedValueOnce(new TypeError('网络不可用'));
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    await expect(service.callAi({
      purpose: 'generate', messages: [{ role: 'user', content: 'test' }],
      stream: false, retry: false,
    })).rejects.toMatchObject({ kind: 'network', message: '网络不可用', providerId: 'runtime' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it('does not silently fall back when the requested purpose has no provider', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const store = runtimeStore();
    store.getVerifyProvider = () => undefined;
    store.verifyProvider = null;
    const service = createAiService(store);
    await expect(service.callAi({
      purpose: 'verify', messages: [{ role: 'user', content: 'test' }],
      stream: false, retry: false,
    })).rejects.toThrow('未配置验证用途供应商');
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it('classifies HTTP auth failures without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    await expect(service.callAi({
      purpose: 'generate', messages: [{ role: 'user', content: 'test' }],
      stream: false, retry: false,
    })).rejects.toMatchObject({ kind: 'auth', statusCode: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('rejects an HTTP 200 provider quota error body as terminal auth failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: 'Insufficient balance, please recharge your quota.' },
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 1 },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    await expect(service.callAi({
      purpose: 'generate', messages: [{ role: 'user', content: '整理大纲' }],
      stream: false, retry: true,
    })).rejects.toMatchObject({
      kind: 'auth',
      statusCode: 402,
      message: expect.stringContaining('quota_exhausted'),
      providerErrorSummary: expect.stringContaining('Insufficient balance'),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('rejects an HTTP 200 streaming soft error with abnormal usage', async () => {
    const sse = [
      'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":0,"completion_tokens":0,"total_tokens":1}}\n\n',
      'data: {"error":{"message":"当前套餐额度已耗尽，请充值"}}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sse));
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    await expect(service.callAi({
      purpose: 'generate', messages: [{ role: 'user', content: '整理大纲' }],
      stream: true, retry: true,
    })).rejects.toMatchObject({
      kind: 'auth',
      statusCode: 402,
      message: expect.stringContaining('quota_exhausted'),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('keeps normal novel prose mentioning quota and recharge as valid content', async () => {
    const content = '他看着终端上的提示：“额度已耗尽，请充值后继续。”然后转身离开。';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    await expect(service.callAi({
      purpose: 'generate', messages: [{ role: 'user', content: '续写这一段' }],
      stream: false, retry: false,
    })).resolves.toMatchObject({ text: content });
    vi.unstubAllGlobals();
  });

  it('classifies main-process HTTP auth failures without retrying', async () => {
    const requestMock = vi.fn().mockResolvedValue({
      ok: false,
      kind: 'auth',
      statusCode: 401,
      message: 'API Key 无效或未授权：invalid key',
    });
    vi.stubGlobal('window', {
      electronAPI: {
        providerNetRequest: requestMock,
        providerNetStream: vi.fn(),
        providerNetAbort: vi.fn(() => Promise.resolve()),
        onProviderNetStreamChunk: vi.fn(() => () => {}),
      },
    });
    const service = createAiService(runtimeStore());
    await expect(service.callAi({
      purpose: 'generate', messages: [{ role: 'user', content: 'test' }],
      stream: false, retry: false,
    })).rejects.toMatchObject({ kind: 'auth', statusCode: 401, providerId: 'runtime' });
    expect(requestMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('retries main-process HTTP 429 failures and preserves status diagnostics', async () => {
    const requestMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        kind: 'http',
        statusCode: 429,
        message: '请求过于频繁，已被供应商限流：rate limited',
        providerErrorSummary: 'rate limited',
      })
      .mockResolvedValueOnce({
        ok: true,
        statusCode: 200,
        text: JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
      });
    vi.stubGlobal('window', {
      electronAPI: {
        providerNetRequest: requestMock,
        providerNetStream: vi.fn(),
        providerNetAbort: vi.fn(),
        onProviderNetStreamChunk: vi.fn(() => () => {}),
      },
    });
    const entries: any[] = [];
    const service = createAiService(runtimeStore(), { addLog: (entry) => entries.push(entry) });
    await expect(service.callAi({
      purpose: 'generate', messages: [{ role: 'user', content: 'test' }],
      stream: false, timeoutMs: 100,
    })).resolves.toMatchObject({ text: 'ok' });
    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(entries.at(-1)).toMatchObject({ status: 'success' });
    vi.unstubAllGlobals();
  });

  it('downgrades max_tokens once to the provider-declared limit and retries', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { message: 'max_tokens must be less than or equal to 4096' },
      }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        usage: { completion_tokens: 20 },
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const entries: any[] = [];
    const service = createAiService(runtimeStore(), { addLog: entry => entries.push(entry) });
    await expect(service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: 'test' }],
      stream: false,
      maxTokens: 99999,
    })).resolves.toMatchObject({ text: 'ok', maxTokens: 4096 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls.map(call => JSON.parse(String(call[1]?.body)));
    expect(bodies[0]).toMatchObject({ max_tokens: 99999 });
    expect(bodies[1]).toMatchObject({ max_tokens: 4096 });
    expect(entries.some(entry => entry.result.includes('max-tokens-downgraded: 99999 -> 4096'))).toBe(true);
    vi.unstubAllGlobals();
  });

  it('does not blind-retry a 400 without a parseable max_tokens suggestion', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: 'invalid model' },
    }), { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    await expect(service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: 'test' }],
      stream: false,
      maxTokens: 99999,
    })).rejects.toMatchObject({ kind: 'http', statusCode: 400 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('classifies an already-aborted request as canceled', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    controller.abort();
    const service = createAiService(runtimeStore());
    await expect(service.callAi({
      purpose: 'generate', messages: [{ role: 'user', content: 'test' }],
      signal: controller.signal, stream: false, retry: false,
    })).rejects.toMatchObject({ kind: 'canceled' });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('aborts an in-flight request and classifies the timeout separately', async () => {
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('The operation timed out', 'AbortError')), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    await expect(service.callAi({
      purpose: 'generate', messages: [{ role: 'user', content: 'test' }],
      stream: false, retry: false, timeoutMs: 10,
    })).rejects.toMatchObject({ kind: 'timeout' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
    vi.unstubAllGlobals();
  });

  it('fails a connection-level error after fast retries without entering heartbeat', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    const service = createAiService(runtimeStore());
    const request = service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: 'test' }],
      stream: true,
      timeoutMs: 100,
    });
    // Advance only through the fast retry delays; a heartbeat entry would
    // need another 60s and make the promise stay pending here.
    const assertion = expect(request).rejects.toMatchObject({ kind: 'http', statusCode: 503 });
    await vi.advanceTimersByTimeAsync(6100);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('breaks a main-process stream that never produces bytes, retries it, and keeps no total timeout', async () => {
    const abortCalls: string[] = [];
    const streamMock = vi.fn()
      .mockImplementationOnce(() => Promise.resolve({ ok: true, statusCode: 200, text: '' }))
      .mockImplementationOnce((request: any) => {
        const signalId = request.signalId;
        for (const event of [
          { event: 'chunk', text: 'data: {"choices":[{"delta":{"content":"recovered"}}]}\n\n' },
          { event: 'chunk', text: 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' },
          { event: 'chunk', text: 'data: [DONE]\n\n' },
          { event: 'end' },
        ]) emitMainNetEvent?.({ ...event, signalId });
        return Promise.resolve({ ok: true, statusCode: 200, text: '' });
      });
    let emitMainNetEvent: ((payload: any) => void) | null = null;
    vi.stubGlobal('window', {
      electronAPI: {
        providerNetRequest: vi.fn(() => Promise.resolve({ ok: true, statusCode: 200, text: '' })),
        providerNetStream: streamMock,
        providerNetAbort: vi.fn((signalId: string) => {
          abortCalls.push(signalId);
          return Promise.resolve();
        }),
        onProviderNetStreamChunk: (listener: (payload: any) => void) => {
          emitMainNetEvent = listener;
          return () => { emitMainNetEvent = null; };
        },
      },
    });
    vi.useFakeTimers();
    const service = createAiService(runtimeStore());
    const request = service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: 'test' }],
      stream: true,
      timeoutMs: null,
      onChunk: () => {},
    });
    const assertion = expect(request).resolves.toMatchObject({ text: 'recovered' });
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await assertion;
    expect(streamMock).toHaveBeenCalledTimes(2);
    expect(abortCalls).toHaveLength(1);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }, 30_000);

  it('breaks a main-process stream that stays connected but stops producing content', async () => {
    const abortCalls: string[] = [];
    let emitMainNetEvent: ((payload: any) => void) | null = null;
    let currentSignalId = '';
    const streamMock = vi.fn()
      .mockImplementationOnce((request: any) => {
        currentSignalId = request.signalId;
        emitMainNetEvent?.({
          event: 'chunk',
          text: 'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n',
          signalId: currentSignalId,
        });
        return Promise.resolve({ ok: true, statusCode: 200, text: '' });
      })
      .mockImplementationOnce((request: any) => {
        currentSignalId = request.signalId;
        for (const event of [
          { event: 'chunk', text: 'data: {"choices":[{"delta":{"content":"recovered"}}]}\n\n' },
          { event: 'chunk', text: 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' },
          { event: 'chunk', text: 'data: [DONE]\n\n' },
          { event: 'end' },
        ]) emitMainNetEvent?.({ ...event, signalId: currentSignalId });
        return Promise.resolve({ ok: true, statusCode: 200, text: '' });
      });
    vi.stubGlobal('window', {
      electronAPI: {
        providerNetRequest: vi.fn(() => Promise.resolve({ ok: true, statusCode: 200, text: '' })),
        providerNetStream: streamMock,
        providerNetAbort: vi.fn((signalId: string) => {
          abortCalls.push(signalId);
          return Promise.resolve();
        }),
        onProviderNetStreamChunk: (listener: (payload: any) => void) => {
          emitMainNetEvent = listener;
          return () => { emitMainNetEvent = null; };
        },
      },
    });
    vi.useFakeTimers();
    const service = createAiService(runtimeStore());
    const physicalEvents: any[] = [];
    const request = service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: 'test' }],
      stream: true,
      timeoutMs: null,
      onChunk: () => {},
      onPhysicalCall: (event: any) => physicalEvents.push(event),
    });
    const assertion = expect(request).resolves.toMatchObject({ text: 'recovered' });
    expect(emitMainNetEvent).toBeTruthy();
    const emit = emitMainNetEvent!;
    // Protocol-only frames keep the byte-level watchdog alive but must not
    // reset the content progress watchdog.
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    emit({
      event: 'chunk',
      text: 'data: {"choices":[{"delta":{}}]}\n\n',
      signalId: currentSignalId,
    });
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    emit({
      event: 'chunk',
      text: 'data: {"usage":{"total_tokens":10}}\n\n',
      signalId: currentSignalId,
    });
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await assertion;
    expect(streamMock).toHaveBeenCalledTimes(2);
    expect(abortCalls).toHaveLength(1);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }, 30_000);

  it('keeps a no-total-timeout main-process stream alive while output keeps arriving', async () => {
    let emitMainNetEvent: ((payload: any) => void) | null = null;
    let currentSignalId = '';
    const emitCurrentStream = (events: any[]) => {
      for (const event of events) emitMainNetEvent?.({ ...event, signalId: currentSignalId });
    };
    const streamMock = vi.fn()
      .mockImplementationOnce((request: any) => {
        currentSignalId = request.signalId;
        emitCurrentStream([
          { event: 'chunk', text: 'data: {"choices":[{"delta":{"content":"first"}}]}\n\n' },
        ]);
        return Promise.resolve({ ok: true, statusCode: 200, text: '' });
      });
    vi.stubGlobal('window', {
      electronAPI: {
        providerNetRequest: vi.fn(),
        providerNetStream: streamMock,
        providerNetAbort: vi.fn(() => Promise.resolve()),
        onProviderNetStreamChunk: (listener: (payload: any) => void) => {
          emitMainNetEvent = listener;
          return () => { emitMainNetEvent = null; };
        },
      },
    });
    vi.useFakeTimers();
    const service = createAiService(runtimeStore());
    const request = service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: 'test' }],
      stream: true,
      timeoutMs: null,
      onChunk: () => {},
    });
    await vi.advanceTimersByTimeAsync(14 * 60_000);
    emitCurrentStream([
      { event: 'chunk', text: 'data: {"choices":[{"delta":{"content":"-second"}}]}\n\n' },
    ]);
    await vi.advanceTimersByTimeAsync(14 * 60_000);
    emitCurrentStream([
      { event: 'chunk', text: 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' },
      { event: 'chunk', text: 'data: [DONE]\n\n' },
      { event: 'end' },
    ]);
    await expect(request).resolves.toMatchObject({ text: 'first-second' });
    expect(streamMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }, 30_000);

  it('keeps heartbeat recovery for a stream that produced output then dropped', async () => {
    let emitMainNetEvent: ((payload: any) => void) | null = null;
    const emitMainNetStream = (events: any[]) => {
      const signalId = streamMock.mock.calls.at(-1)?.[0]?.signalId;
      for (const event of events) emitMainNetEvent?.({ ...event, signalId });
    };
    const streamMock = vi.fn()
      .mockImplementationOnce(() => {
        emitMainNetStream([
          { event: 'chunk', text: 'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n' },
          { event: 'error', message: 'network dropped' },
        ]);
        return Promise.resolve({ ok: true, statusCode: 200, text: '' });
      })
      .mockImplementation(() => {
        emitMainNetStream([
          { event: 'error', message: 'network dropped' },
        ]);
        return Promise.resolve({ ok: true, statusCode: 200, text: '' });
      });
    let recovered = false;
    vi.stubGlobal('window', {
      electronAPI: {
        providerNetRequest: vi.fn(),
        providerNetStream: streamMock,
        providerNetAbort: vi.fn(() => Promise.resolve()),
        onProviderNetStreamChunk: (listener: (payload: any) => void) => {
          emitMainNetEvent = listener;
          return () => { emitMainNetEvent = null; };
        },
      },
    });
    vi.useFakeTimers();
    const service = createAiService(runtimeStore());
    const physicalEvents: any[] = [];
    const request = service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: 'test' }],
      stream: true,
      timeoutMs: 120_000,
      onChunk: () => {},
      onPhysicalCall: (event: any) => physicalEvents.push(event),
    });
    const assertion = expect(request).resolves.toMatchObject({ text: 'recovered' });
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(6100);
    expect(physicalEvents.map(event => event.phase)).toEqual(['normal', 'normal', 'retry', 'retry', 'retry', 'retry', 'retry', 'retry']);
    expect(streamMock).toHaveBeenCalledTimes(4);
    streamMock.mockImplementation(() => {
      recovered = true;
      emitMainNetStream([
        { event: 'chunk', text: 'data: {"choices":[{"delta":{"content":"recovered"}}]}\n\n' },
        { event: 'chunk', text: 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' },
        { event: 'chunk', text: 'data: [DONE]\n\n' },
        { event: 'end' },
      ]);
      return Promise.resolve({ ok: true, statusCode: 200, text: '' });
    });
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
    expect(recovered).toBe(true);
    expect(streamMock).toHaveBeenCalledTimes(5);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('rejects malformed JSON after one structured retry', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: 'not json' } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    await expect(service.callAi({
      purpose: 'verify', messages: [{ role: 'user', content: 'test' }],
      stream: false, retry: false, jsonMode: true,
    })).resolves.toMatchObject({ text: '{"ok":true}' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it('reports a running physical call before the network request resolves', async () => {
    let releaseRequest: ((value: Response) => void) | undefined;
    const heldResponse = new Promise<Response>(resolve => { releaseRequest = resolve; });
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(heldResponse));
    const service = createAiService(runtimeStore());
    const physicalEvents: any[] = [];
    const request = service.callAi({
      purpose: 'verify',
      messages: [{ role: 'user', content: 'test' }],
      stream: false,
      retry: false,
      onPhysicalCall: (event: any) => physicalEvents.push(event),
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(physicalEvents.map(event => event.status)).toEqual(['running']);
    expect(physicalEvents[0].physicalCallId).toBeTruthy();
    releaseRequest?.(new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 }));
    await expect(request).resolves.toMatchObject({ text: 'ok' });
    expect(physicalEvents.map(event => event.status)).toEqual(['running', 'success']);
    expect(physicalEvents[0].physicalCallId).toBe(physicalEvents[1].physicalCallId);
    vi.unstubAllGlobals();
  });

  it('emits physical heartbeat progress while a silent request is in flight', async () => {
    vi.useFakeTimers();
    let releaseRequest: ((value: Response) => void) | undefined;
    const heldResponse = new Promise<Response>(resolve => { releaseRequest = resolve; });
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(heldResponse));
    const service = createAiService(runtimeStore());
    const physicalEvents: any[] = [];
    const request = service.callAi({
      purpose: 'verify',
      messages: [{ role: 'user', content: 'test' }],
      stream: false,
      retry: false,
      onPhysicalCall: (event: any) => physicalEvents.push(event),
    });
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(physicalEvents.map(event => event.status)).toEqual(['running', 'running', 'running']);
    expect(physicalEvents.slice(1).every(event => event.heartbeat === true)).toBe(true);
    expect(physicalEvents.slice(1).every(event => event.physicalCallId === physicalEvents[0].physicalCallId)).toBe(true);
    releaseRequest?.(new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 }));
    await expect(request).resolves.toMatchObject({ text: 'ok' });
    expect(physicalEvents.map(event => event.status)).toEqual(['running', 'running', 'running', 'success']);
    expect(physicalEvents.at(-1)?.heartbeat).toBeUndefined();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('closes the running physical call as canceled when the request is aborted in flight', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('The operation was canceled', 'AbortError')), { once: true });
    })));
    const service = createAiService(runtimeStore());
    const physicalEvents: any[] = [];
    const request = service.callAi({
      purpose: 'verify',
      messages: [{ role: 'user', content: 'test' }],
      stream: false,
      retry: false,
      signal: controller.signal,
      onPhysicalCall: (event: any) => physicalEvents.push(event),
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(physicalEvents.map(event => event.status)).toEqual(['running']);
    controller.abort();
    await expect(request).rejects.toMatchObject({ kind: 'canceled' });
    expect(physicalEvents.map(event => event.status)).toEqual(['running', 'canceled']);
    expect(physicalEvents[0].physicalCallId).toBe(physicalEvents[1].physicalCallId);
    vi.unstubAllGlobals();
  });

  it('injects the table output guideline once for normal calls but not JSON mode', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    await service.callAi({
      purpose: 'verify',
      messages: [{ role: 'system', content: '你是写作助手' }, { role: 'user', content: 'test' }],
      stream: false,
      retry: false
    });
    let body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain('GFM 标准表格');
    expect(body.messages[0].content.match(/GFM 标准表格/g)).toHaveLength(1);

    await service.callAi({
      purpose: 'verify',
      messages: [{ role: 'system', content: '{"ok":true}' }, { role: 'user', content: 'test' }],
      stream: false,
      retry: false,
      jsonMode: true
    });
    body = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(body.messages).toEqual([
      { role: 'system', content: '{"ok":true}' },
      { role: 'user', content: 'test' }
    ]);
    vi.unstubAllGlobals();
  });
});

describe('createAiService.callAi tools', () => {
  const tool = {
    name: 'editor.get_state',
    description: '读取编辑目标摘要',
    policy: 'read' as const,
    inputSchema: { type: 'object' as const, properties: {} },
    async execute() {
      return { ok: true, data: { contentLength: 10 } }
    },
  }

  it('executes native tool calls and returns the final answer', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: '', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'editor.get_state', arguments: '{}' } }] } }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: '已完成' } }],
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    const toolEvents: Array<{ toolName: string; protocolVersion?: number }> = [];
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '读取编辑区' }],
      tools: [tool],
      stream: false,
      retry: false,
      toolPolicy: {
        onToolCall: event => toolEvents.push({ toolName: event.toolName, protocolVersion: event.protocolVersion }),
      },
    });
    expect(result.text).toBe('已完成');
    expect(result.toolCalls).toEqual([{ id: 'call_1', name: 'editor.get_state', input: {} }]);
    expect(result.toolResults?.[0].result.data).toEqual({ contentLength: 10 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(firstBody.tools[0].function.name).toBe('editor.get_state');
    expect(firstBody.stream).toBe(false);
    expect(toolEvents).toEqual([
      { toolName: 'editor.get_state', protocolVersion: undefined },
    ]);
    vi.unstubAllGlobals();
  });

  it('preserves a long-document null timeout across tool iterations', async () => {
    const userController = new AbortController()
    const userSignal = userController.signal
    const fetchMock = vi.fn()
      .mockImplementationOnce(async (_url: string, init?: RequestInit) => {
        expect(init?.signal).toBe(userSignal)
        return new Response(JSON.stringify({
          choices: [{ message: { content: '', tool_calls: [{ id: 'call_long_doc', type: 'function', function: { name: 'editor.get_state', arguments: '{}' } }] } }],
        }), { status: 200 })
      })
      .mockImplementationOnce(async (_url: string, init?: RequestInit) => {
        expect(init?.signal).toBe(userSignal)
        return new Response(JSON.stringify({
          choices: [{ message: { content: '已完成' } }],
        }), { status: 200 })
      });
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    const toolCallEvents: any[] = [];
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '读取编辑区' }],
      tools: [tool],
      stream: false,
      retry: false,
      signal: userSignal,
      timeoutMs: null,
    });
    expect(result.text).toBe('已完成');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(resolveRequestTimeout(null, {}, false)).toBeNull();
    vi.unstubAllGlobals();
  });

  it('uses the default timeout when timeoutMs is undefined', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => new Response(JSON.stringify({
        choices: [{ message: { content: '已完成' } }],
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '读取编辑区' }],
      stream: false,
      retry: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resolveRequestTimeout(undefined, {}, false)).toBe(300_000);
    expect(resolveRequestTimeout(undefined, {}, true)).toBe(600_000);
    expect(resolveRequestTimeout(undefined, { timeoutMs: 42_000 }, false)).toBe(42_000);
    expect(resolveRequestTimeout(0, {}, false)).toBe(0);
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
    vi.unstubAllGlobals();
  });

  it('reports unavailable write tools as tool_not_found, not permission_denied', async () => {
    const response = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'call_missing_write', type: 'function', function: { name: 'editor.write', arguments: '{"commands":[{"operation":"append","content":"x"}]}' } }],
        },
      }],
    }), { status: 200 });
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => response())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '已完成' } }],
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    const toolCallEvents: any[] = [];
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '请修改大纲' }],
      tools: [tool],
      stream: false,
      retry: false,
      toolPolicy: {
        intent: 'edit',
        onToolCall: event => toolCallEvents.push(event),
      },
    });
    expect(result.toolResults?.[0].result.ok).toBe(false);
    expect(result.toolResults?.[0].result.error?.code).toBe('tool_not_found');
    expect(result.toolResults?.[0].result.error?.message).toContain('工具不存在');
    expect(result.toolResults?.[0].result.error?.message).toContain('可用同类工具');
    expect(result.toolResults?.[0].result.error?.message).toContain('editor.get_state');
    expect(toolCallEvents[0]).toMatchObject({
      toolName: 'editor.write',
      toolCapability: 'native_tools',
      rejectionCategory: 'unknown_tool',
    });
    vi.unstubAllGlobals();
  });

  it('suggests same-namespace tools and keeps tools correctable after a phantom tool call', async () => {
    const writeTool = {
      ...tool,
      name: 'editor.write',
      description: '写入编辑目标',
      policy: 'write' as const,
      inputSchema: {
        type: 'object' as const,
        properties: {
          commands: { type: 'array' as const },
        },
        required: ['commands'],
      },
      async execute() {
        return { ok: true, data: { status: 'written' } }
      },
    }
    const phantomToolResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: 'call_phantom_locate',
            type: 'function',
            function: { name: 'outline.locate', arguments: '{"query":"时间线"}' },
          }],
        },
      }],
    }), { status: 200 });
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => phantomToolResponse())
      .mockImplementationOnce(async () => phantomToolResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '已定位并完成写入。' } }],
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    const warnings: string[] = [];
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '修改第 3 节' }],
      tools: [tool, writeTool],
      stream: false,
      retry: false,
      toolPolicy: {
        maxToolIterations: 6,
        onToolWarning: message => warnings.push(message),
      },
    });
    expect(result.toolResults?.every(item => item.result.ok === false)).toBe(true);
    expect(result.toolResults?.[0].result.error?.code).toBe('tool_not_found');
    expect(result.toolResults?.[0].result.error?.message).toContain('可用同类工具');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const bodies = fetchMock.mock.calls.map(call => JSON.parse((call[1] as RequestInit).body as string));
    expect(bodies[0].tools.map((item: { function: { name: string } }) => item.function.name))
      .toEqual(['editor.get_state', 'editor.write']);
    expect(bodies[1].tools.map((item: { function: { name: string } }) => item.function.name))
      .toEqual(['editor.get_state', 'editor.write']);
    expect(result.text).toBe('已定位并完成写入。');
    vi.unstubAllGlobals();
  });

  it('keeps tools available when a read-only tool returns tool_not_found', async () => {
    const readonlyTool = {
      ...tool,
      name: 'editor.locate',
      async execute() {
        return {
          ok: false,
          error: {
            code: 'tool_not_found',
            message: '工具不存在：outline.locate',
          },
        }
      },
    }
    const writeTool = {
      ...tool,
      name: 'editor.write',
      policy: 'write' as const,
      inputSchema: {
        type: 'object' as const,
        properties: {
          commands: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              properties: {
                operation: { type: 'string' as const },
                content: { type: 'string' as const },
              },
              required: ['operation'],
              additionalProperties: false,
            },
          },
        },
        required: ['commands'],
        additionalProperties: false,
      },
      async execute() {
        return { ok: true, data: { status: 'written' } }
      },
    }
    const toolBody = JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'call_stream_guard', type: 'function', function: { name: 'editor.write', arguments: '{"commands":[{"operation":"append","content":"x"}]}' } }]
        }
      }]
    });
    const toolResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: 'call_not_found',
            type: 'function',
            function: { name: 'editor.locate', arguments: '{}' },
          }],
        },
      }],
    }), { status: 200 });
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => toolResponse())
      .mockImplementationOnce(async () => toolResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '已按正确工具完成写入。' } }],
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    const warnings: string[] = [];
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '修改第 3 节' }],
      tools: [readonlyTool, writeTool],
      stream: false,
      retry: false,
      toolPolicy: {
        maxToolIterations: 6,
        onToolWarning: message => warnings.push(message),
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(warnings.join('\n')).toContain('保留工具面供其修正目标后重试');
    expect(result.text).toBe('已按正确工具完成写入。');
    for (const requestInit of fetchMock.mock.calls.map(call => call[1] as RequestInit)) {
      expect(JSON.parse(requestInit.body as string).tools).toEqual(expect.any(Array));
    }
    vi.unstubAllGlobals();
  });

  it('records tool requests as deltas instead of repeated full snapshots', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => new Response(JSON.stringify({
        choices: [{
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'editor.get_state', arguments: '{}' } }]
          }
        }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockImplementationOnce(async () => new Response(JSON.stringify({
        choices: [{
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [{ id: 'call_2', type: 'function', function: { name: 'editor.get_state', arguments: '{}' } }]
          }
        }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValue(new Response(JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '已完成' } }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    const toolCallEvents: any[] = [];
    const result = await service.callAi({
      purpose: 'generate',
      messages: [
        { role: 'system', content: '系统提示' },
        { role: 'user', content: '读取编辑区' },
      ],
      tools: [tool],
      stream: false,
      retry: false,
    });
    expect(result.text).toBe('已完成');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.toolRequestDeltas).toHaveLength(6);
    expect(result.toolRequestDeltas?.[0]).toEqual({ role: 'system', content: '系统提示' });
    expect(result.toolRequestDeltas?.[1]).toEqual({ role: 'user', content: '读取编辑区' });
    expect(result.toolRequestDeltas?.[2]).toMatchObject({ role: 'assistant', toolCalls: [{ id: 'call_1' }] });
    expect(result.toolRequestDeltas?.[3]).toMatchObject({ role: 'tool', toolCallId: 'call_1' });
    expect(result.toolRequestDeltas?.[4]).toMatchObject({ role: 'assistant', toolCalls: [{ id: 'call_2' }] });
    expect(result.toolRequestDeltas?.[5]).toMatchObject({ role: 'tool', toolCallId: 'call_2' });
    expect(JSON.stringify(result.toolRequestDeltas?.[2])).not.toContain('系统提示');
    expect(result.toolAudit?.entries.map(entry => entry.toolCallId)).toEqual(['call_1', 'call_2']);
    expect(result.toolAudit?.entries.every(entry => entry.toolName === 'editor.get_state')).toBe(true);
    expect(result.toolAudit?.orphanToolCallIds).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('converges to a final answer at the tool iteration limit', async () => {
    const loopTool = {
      ...tool,
      name: 'editor.search',
      async execute() {
        return { ok: true, data: { total: 1 } }
      },
    }
    const toolResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'call_loop', type: 'function', function: { name: 'editor.search', arguments: '{"query":"x"}' } }]
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const finalResponse = new Response(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        message: { role: 'assistant', content: '基于现有工具结果的最终回答' }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => toolResponse())
      .mockImplementationOnce(async () => toolResponse())
      .mockResolvedValue(finalResponse);
    const exhaustedDeadlineController = new AbortController();
    setTimeout(() => exhaustedDeadlineController.abort(), 1);
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    const userCancelController = new AbortController();
    let onConvergenceStartCount = 0;
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '搜索' }],
      tools: [loopTool],
      toolPolicy: {
        maxToolIterations: 2,
        onConvergenceStart: () => { onConvergenceStartCount += 1; },
      },
      signal: exhaustedDeadlineController.signal,
      cancelSignal: userCancelController.signal,
      retry: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.text).toBe('基于现有工具结果的最终回答');
    expect(result.finishReason).toBe('tool_converged');
    expect(result.toolCalls).toHaveLength(2);
    const convergenceBody = JSON.parse((fetchMock.mock.calls[2][1] as RequestInit).body as string);
    expect(convergenceBody.tools).toBeUndefined();
    expect(convergenceBody.messages.some((message: { role: string; content?: string }) =>
      message.role === 'system' && message.content?.includes('当前请求不携带任何工具'))).toBe(true);
    // The rescue request must not inherit the exhausted logical deadline.
    // Otherwise an outer supervisor can abort it mid-flight and recreate the
    // original no-body failure.
    const convergenceRequestInit = fetchMock.mock.calls[2][1] as RequestInit;
    const convergenceSignal = convergenceRequestInit.signal as AbortSignal;
    expect(convergenceSignal.aborted).toBe(false);
    expect(onConvergenceStartCount).toBe(1);
    vi.unstubAllGlobals();
  });

  it('steers once after repeated read-only rounds and keeps tools available for the write', async () => {
    const readonlyTool = {
      ...tool,
      name: 'outline.read_range',
      async execute() {
        return { ok: true, data: { text: '一段正文' } }
      },
    }
    const writeTool = {
      ...tool,
      name: 'editor.write',
      policy: 'write' as const,
      inputSchema: {
        type: 'object' as const,
        properties: {
          commands: {
            type: 'array' as const,
            items: { type: 'object' as const, additionalProperties: false },
          },
        },
        required: ['commands'],
        additionalProperties: false,
      },
      async execute() {
        return { ok: true, data: { status: 'written' } }
      },
    }
    const toolResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: 'call_read',
            type: 'function',
            function: { name: 'outline.read_range', arguments: '{"nodeId":"section-1"}' }
          }]
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const writeResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: 'call_write',
            type: 'function',
            function: { name: 'editor.write', arguments: '{"commands":[]}' }
          }]
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const finalResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        message: { role: 'assistant', content: '已完成整理并写入。' }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => toolResponse())
      .mockImplementationOnce(async () => toolResponse())
      .mockImplementationOnce(async () => writeResponse())
      .mockImplementationOnce(async () => finalResponse());
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    const warnings: string[] = [];
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '整理整篇文档' }],
      tools: [readonlyTool, writeTool],
      stream: false,
      retry: false,
      toolPolicy: {
        maxToolIterations: 6,
        onToolWarning: message => warnings.push(message),
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(warnings.join('\n')).toContain('连续 2 轮只调用读取工具');
    expect(result.finishReason).not.toBe('tool_converged_local');
    expect(result.text).toBe('已完成整理并写入。');
    expect(result.toolCalls?.map(call => call.name)).toContain('editor.write');
    const steeringBody = JSON.parse((fetchMock.mock.calls[2][1] as RequestInit).body as string);
    expect(steeringBody.tools).toBeDefined();
    expect(steeringBody.messages.some((message: { role: string; content?: string }) =>
      message.role === 'system' && message.content?.includes('下一轮必须直接提交 editor.write 写入'))).toBe(true);
    vi.unstubAllGlobals();
  });

  it('counts narrated read-only tool rounds and still steers toward the write', async () => {
    const readonlyTool = {
      ...tool,
      name: 'outline.read_range',
      async execute() {
        return { ok: true, data: { text: '一段正文' } }
      },
    }
    const writeTool = {
      ...tool,
      name: 'editor.write',
      policy: 'write' as const,
      inputSchema: {
        type: 'object' as const,
        properties: {
          commands: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              properties: {
                operation: { type: 'string' as const },
                content: { type: 'string' as const },
              },
              required: ['operation'],
              additionalProperties: false,
            },
          },
        },
        required: ['commands'],
        additionalProperties: false,
      },
      async execute() {
        return { ok: true, data: { status: 'written' } }
      },
    }
    const narratedReadResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '我先读取目标节的边界，再提交写入。',
          tool_calls: [{
            id: 'call_read',
            type: 'function',
            function: { name: 'outline.read_range', arguments: '{"nodeId":"section-1"}' }
          }]
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const writeResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: 'call_write',
            type: 'function',
            function: { name: 'editor.write', arguments: '{"commands":[]}' }
          }]
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const finalResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        message: { role: 'assistant', content: '已完成移动并写入。' }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => narratedReadResponse())
      .mockImplementationOnce(async () => narratedReadResponse())
      .mockImplementationOnce(async () => writeResponse())
      .mockImplementationOnce(async () => finalResponse());
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    const warnings: string[] = [];
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '把第 15 节移动到第 5 节前面' }],
      tools: [readonlyTool, writeTool],
      stream: false,
      retry: false,
      toolPolicy: {
        maxToolIterations: 6,
        onToolWarning: message => warnings.push(message),
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(warnings.join('\n')).toContain('连续 2 轮只调用读取工具');
    expect(result.text).toBe('已完成移动并写入。');
    expect(result.toolCalls?.map(call => call.name)).toContain('editor.write');
    vi.unstubAllGlobals();
  });

  it('does not accumulate read-only convergence after a round containing a write call', async () => {
    const readonlyTool = {
      ...tool,
      name: 'outline.read_range',
      async execute() {
        return { ok: true, data: { text: '一段正文' } }
      },
    }
    const writeTool = {
      ...tool,
      name: 'editor.write',
      policy: 'write' as const,
      inputSchema: {
        type: 'object' as const,
        properties: {
          commands: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              properties: {
                operation: { type: 'string' as const },
                content: { type: 'string' as const },
              },
              required: ['operation'],
              additionalProperties: false,
            },
          },
        },
        required: ['commands'],
        additionalProperties: false,
      },
      async execute() {
        return { ok: true, data: { status: 'written' } }
      },
    }
    const readResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: 'call_read',
            type: 'function',
            function: { name: 'outline.read_range', arguments: '{"nodeId":"section-1"}' }
          }]
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const mixedResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_read_mixed',
              type: 'function',
              function: { name: 'outline.read_range', arguments: '{"nodeId":"section-2"}' }
            },
            {
              id: 'call_write_mixed',
              type: 'function',
              function: { name: 'editor.write', arguments: '{"commands":[]}' }
            },
          ]
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const finalResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        message: { role: 'assistant', content: '已完成写入。' }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => readResponse())
      .mockImplementationOnce(async () => mixedResponse())
      .mockImplementationOnce(async () => readResponse())
      .mockImplementationOnce(async () => finalResponse());
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    const warnings: string[] = [];
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '修改第 3 节' }],
      tools: [readonlyTool, writeTool],
      stream: false,
      retry: false,
      toolPolicy: {
        maxToolIterations: 6,
        onToolWarning: message => warnings.push(message),
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(warnings).toEqual([]);
    expect(result.text).toBe('已完成写入。');
    vi.unstubAllGlobals();
  });

    it('removes write tools and steers final-draft generation toward plain text', async () => {
    const readonlyTool = {
      ...tool,
      name: 'outline.read_range',
      async execute() {
        return { ok: true, data: { text: '一段正文' } }
      },
    }
    const writeTool = {
      ...tool,
      name: 'editor.write',
      policy: 'write' as const,
      inputSchema: {
        type: 'object' as const,
        properties: {
          commands: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              properties: {
                operation: { type: 'string' as const },
                content: { type: 'string' as const },
              },
              required: ['operation'],
              additionalProperties: false,
            },
          },
        },
        required: ['commands'],
        additionalProperties: false,
      },
      async execute() {
        return { ok: true, data: { status: 'written' } }
      },
    }
    const readResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: 'call_read',
            type: 'function',
            function: { name: 'outline.read_range', arguments: '{"nodeId":"section-1"}' }
          }]
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    const finalResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        message: { role: 'assistant', content: '已完成结构重排。' }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => readResponse())
      .mockImplementationOnce(async () => readResponse())
      .mockImplementationOnce(async () => finalResponse())
    vi.stubGlobal('fetch', fetchMock)
    const service = createAiService(runtimeStore())
    const executionPlan = buildLongDocumentExecutionPlan({
      requestText: '全文重写整篇大纲',
      content: '第一卷\n第一章\n第二卷'.repeat(1000),
      contextWindowTokens: 120_000,
      maxOutputTokens: 8_000,
    })
    expect(executionPlan.mode).toBe('final-draft')
    expect(executionPlan.operation).toBe('rewrite_segments')
    await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '重新整理排序整篇大纲' }],
      tools: [readonlyTool, writeTool],
      stream: false,
      retry: false,
      toolPolicy: {
        maxToolIterations: 6,
        executionPlan,
      },
    })
    const firstBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(firstBody.tools.map((item: { function: { name: string } }) => item.function.name))
      .toEqual(['outline.read_range'])
    const finalBody = JSON.parse((fetchMock.mock.calls.at(-1)?.[1] as RequestInit).body as string)
    const steeringText = finalBody.messages
      .filter((message: { role: string }) => message.role === 'system')
      .map((message: { content?: string }) => message.content ?? '')
      .join('\n')
    const finalUserText = finalBody.messages
      .filter((message: { role: string }) => message.role === 'user')
      .map((message: { content?: string }) => message.content ?? '')
      .join('\n')
    const finalDraftSteeringText = `${steeringText}\n${finalUserText}`
    expect(finalDraftSteeringText).toContain('终稿生成模式')
    expect(finalDraftSteeringText).not.toContain('必须直接提交 editor.write')
    vi.unstubAllGlobals()
  })

  it('steers read-only convergence without permanently closing read tools', async () => {
    const readonlyTool = {
      ...tool,
      name: 'outline.read_range',
      async execute() {
        return { ok: true, data: { text: '一段正文' } }
      },
    }
    const writeTool = {
      ...tool,
      name: 'editor.write',
      policy: 'write' as const,
      async execute() {
        return { ok: true, data: { status: 'written' } }
      },
    }
    const toolResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: 'call_read',
            type: 'function',
            function: { name: 'outline.read_range', arguments: '{"nodeId":"section-1"}' }
          }]
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const writeResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: 'call_write',
            type: 'function',
            function: { name: 'editor.write', arguments: '{"commands":[]}' }
          }]
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const finalResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        message: { role: 'assistant', content: '已按读取结果完成写入。' }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => toolResponse())
      .mockImplementationOnce(async () => toolResponse())
      .mockImplementationOnce(async () => toolResponse())
      .mockImplementationOnce(async () => writeResponse())
      .mockImplementationOnce(async () => finalResponse());
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    const warnings: string[] = [];
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '整理整篇文档' }],
      tools: [readonlyTool, writeTool],
      stream: false,
      retry: false,
      toolPolicy: {
        maxToolIterations: 6,
        onToolWarning: message => warnings.push(message),
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(warnings.join('\n')).toContain('只调用读取工具');
    expect(result.finishReason).toBe('stop');
    expect(result.text).toBe('已按读取结果完成写入。');
    expect(result.toolCalls?.map(call => call.name)).toContain('editor.write');
    const writeOnlyBody = JSON.parse((fetchMock.mock.calls[3][1] as RequestInit).body as string);
    expect(writeOnlyBody.tools.map((tool: { function: { name: string } }) => tool.function.name))
      .toEqual(['outline.read_range', 'editor.write']);
    const steeringMessages = writeOnlyBody.messages.filter((message: { role: string; content?: string }) =>
      message.role === 'system' && message.content?.includes('禁止继续无计划读取'));
    expect(steeringMessages.length).toBeGreaterThanOrEqual(1);
    const steeringText = steeringMessages
      .map((message: { role: string; content?: string }) => message.content ?? '')
      .join('\n');
    expect(steeringText).toContain('editor.write');
    expect(steeringText).toContain('编辑请提交受限编辑命令');
    const finalBody = JSON.parse((fetchMock.mock.calls[4][1] as RequestInit).body as string);
    expect(finalBody.tools.map((tool: { function: { name: string } }) => tool.function.name))
      .toEqual(['outline.read_range', 'editor.write']);
    expect(finalBody.messages.some((message: { role: string; content?: string }) =>
      message.role === 'system' && message.content?.includes('禁止继续无计划读取'))).toBe(false);
    vi.unstubAllGlobals();
  });

  it('keeps the full tool surface correctable when integrity validation fails', async () => {
    const readonlyTool = {
      ...tool,
      name: 'outline.read_range',
      async execute() {
        return { ok: true, data: { text: '一段正文' } }
      },
    }
    const writeTool = {
      ...tool,
      name: 'editor.write',
      policy: 'write' as const,
      async execute() {
        return {
          ok: false,
          error: {
            code: 'integrity_failed',
            message: '结构完整性校验未通过：标题数量从 204 降到 202。请按具体问题调整后整批重试。',
          },
        }
      },
    }
    const integrityFailedResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: 'call_write_integrity',
            type: 'function',
            function: { name: 'editor.write', arguments: '{"commands":[{"operation":"delete","target":"## 第3节"}]}' }
          }]
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const finalResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        message: { role: 'assistant', content: '本轮未写入：删除标题需要用户确认。' }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const readonlyToolResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: 'call_read',
            type: 'function',
            function: { name: 'outline.read_range', arguments: '{"nodeId":"section-3"}' }
          }]
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => readonlyToolResponse())
      .mockImplementationOnce(async () => readonlyToolResponse())
      .mockImplementationOnce(async () => integrityFailedResponse())
      .mockImplementationOnce(async () => finalResponse());
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '删除第 3 节' }],
      tools: [readonlyTool, writeTool],
      stream: false,
      retry: false,
      toolPolicy: { maxToolIterations: 8 },
    });
    expect(result.text).toBe('本轮未写入：删除标题需要用户确认。');
    const followUpBody = JSON.parse((fetchMock.mock.calls[3][1] as RequestInit).body as string);
    expect(followUpBody.tools.map((item: { function: { name: string } }) => item.function.name))
      .toEqual(['outline.read_range', 'editor.write']);
    expect(followUpBody.messages.some((message: { role: string; content?: string }) =>
      message.role === 'system' && message.content?.includes('禁止继续无计划读取'))).toBe(false);
    vi.unstubAllGlobals();
  });

  it('keeps tools available when the last read-only round returned a correctable target error', async () => {
    const readonlyTool = {
      ...tool,
      name: 'editor.locate',
      async execute() {
        return {
          ok: false,
          error: {
            code: 'ambiguous_target',
            message: '目标片段出现多次：候选章节为第 3 节、第 11 节。请扩展片段或使用结构锚点后重试。',
          },
        }
      },
    }
    const writeTool = {
      ...tool,
      name: 'editor.write',
      policy: 'write' as const,
      async execute() {
        return { ok: true, data: { status: 'written' } }
      },
    }
    const ambiguousToolResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: 'call_locate_ambiguous',
            type: 'function',
            function: { name: 'editor.locate', arguments: '{"fragment":"船工喊号的声音被雨压低"}' }
          }]
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const finalResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        message: { role: 'assistant', content: '已删除目标句并完成写入。' }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => ambiguousToolResponse())
      .mockImplementationOnce(async () => ambiguousToolResponse())
      .mockImplementationOnce(async () => finalResponse());
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    const warnings: string[] = [];
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '删除第 11 节里的那一句' }],
      tools: [readonlyTool, writeTool],
      stream: false,
      retry: false,
      toolPolicy: {
        maxToolIterations: 6,
        onToolWarning: message => warnings.push(message),
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(warnings.join('\n')).toContain('保留工具面供其修正目标后重试');
    expect(result.finishReason).toBe('stop');
    expect(result.text).toBe('已删除目标句并完成写入。');
    for (const requestInit of fetchMock.mock.calls.map(call => call[1] as RequestInit)) {
      const body = JSON.parse(requestInit.body as string);
      expect(body.tools).toEqual(expect.any(Array));
    }
    vi.unstubAllGlobals();
  });

  it('rejects a pseudo tool-call convergence answer and succeeds after one correction', async () => {
    const loopTool = {
      ...tool,
      name: 'editor.search',
      async execute() {
        return { ok: true, data: { total: 1 } }
      },
    }
    const toolResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'call_loop', type: 'function', function: { name: 'editor.search', arguments: '{"query":"x"}' } }]
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const pseudoResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        message: { role: 'assistant', content: '{"name":"editor.write","arguments":{"content":"x"}}' }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const correctedResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        message: { role: 'assistant', content: '本轮未写入。已确认目标位置，但工具轮次已达上限。' }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => toolResponse())
      .mockImplementationOnce(async () => toolResponse())
      .mockImplementationOnce(async () => pseudoResponse())
      .mockImplementationOnce(async () => correctedResponse());
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    const events: string[] = [];
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '搜索' }],
      tools: [loopTool],
      toolPolicy: {
        maxToolIterations: 2,
        onConvergencePseudoCall: () => events.push('pseudo'),
        onConvergenceCorrected: () => events.push('corrected'),
        onConvergenceLocalFallback: () => events.push('fallback'),
      },
      retry: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.finishReason).toBe('tool_converged');
    expect(result.text).toContain('本轮未写入');
    expect(events).toEqual(['pseudo', 'corrected']);
    const correctionBody = JSON.parse((fetchMock.mock.calls[3][1] as RequestInit).body as string);
    expect(correctionBody.tools).toBeUndefined();
    expect(correctionBody.messages.some((message: { role: string; content?: string }) =>
      message.role === 'system' && message.content?.includes('不要再输出工具调用'))).toBe(true);
    vi.unstubAllGlobals();
  });

  it('falls back locally when the corrected convergence answer is still a pseudo tool call', async () => {
    const loopTool = {
      ...tool,
      name: 'editor.search',
      async execute() {
        return { ok: true, data: { total: 1 } }
      },
    }
    const toolResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'call_loop', type: 'function', function: { name: 'editor.search', arguments: '{"query":"x"}' } }]
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const pseudoResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        message: { role: 'assistant', content: '<tool_call>{"name":"editor.write","arguments":{}}</tool_call>' }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => toolResponse())
      .mockImplementationOnce(async () => toolResponse())
      .mockImplementationOnce(async () => pseudoResponse())
      .mockImplementationOnce(async () => pseudoResponse());
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    const events: string[] = [];
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '搜索' }],
      tools: [loopTool],
      toolPolicy: {
        maxToolIterations: 2,
        onConvergencePseudoCall: () => events.push('pseudo'),
        onConvergenceCorrected: () => events.push('corrected'),
        onConvergenceLocalFallback: () => events.push('fallback'),
      },
      retry: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.finishReason).toBe('tool_converged_local');
    expect(result.text).toContain('本轮未完成写入');
    expect(events).toEqual(['pseudo', 'fallback']);
    vi.unstubAllGlobals();
  });

  it('corrects a pseudo tool-call final answer after a successful tool execution', async () => {
    const toolResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'call_state', type: 'function', function: { name: 'editor.get_state', arguments: '{}' } }]
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const pseudoResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        message: { role: 'assistant', content: '{"name":"editor.write","arguments":{"commands":[]}}' }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const correctedResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        message: { role: 'assistant', content: '已写入第 3 节，并保持后文衔接不变。' }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => toolResponse())
      .mockImplementationOnce(async () => pseudoResponse())
      .mockImplementationOnce(async () => correctedResponse());
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    const events: string[] = [];
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '请写入编辑器' }],
      tools: [tool],
      toolPolicy: {
        onConvergencePseudoCall: () => events.push('pseudo'),
        onConvergenceCorrected: () => events.push('corrected'),
        onConvergenceLocalFallback: () => events.push('fallback'),
      },
      retry: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.finishReason).toBe('tool_converged');
    expect(result.text).toBe('已写入第 3 节，并保持后文衔接不变。');
    expect(result.toolCalls).toEqual([{ id: 'call_state', name: 'editor.get_state', input: {} }]);
    expect(events).toEqual(['pseudo', 'corrected']);
    const convergenceBody = JSON.parse((fetchMock.mock.calls[2][1] as RequestInit).body as string);
    expect(convergenceBody.tools).toBeUndefined();
    expect(convergenceBody.messages.some((message: { role: string; content?: string }) =>
      message.role === 'system' && message.content?.includes('当前请求不携带任何工具'))).toBe(true);
    vi.unstubAllGlobals();
  });

  it('does not expose a pseudo tool-call final answer as assistant text after tool execution', async () => {
    const toolResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'call_state', type: 'function', function: { name: 'editor.get_state', arguments: '{}' } }]
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const pseudoResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        message: { role: 'assistant', content: '{"name":"editor.write","arguments":{"commands":[]}}' }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => toolResponse())
      .mockImplementationOnce(async () => pseudoResponse())
      .mockImplementationOnce(async () => pseudoResponse())
      .mockImplementationOnce(async () => pseudoResponse());
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    const events: string[] = [];
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '请写入编辑器' }],
      tools: [tool],
      toolPolicy: {
        onConvergencePseudoCall: () => events.push('pseudo'),
        onConvergenceCorrected: () => events.push('corrected'),
        onConvergenceLocalFallback: () => events.push('fallback'),
      },
      retry: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.finishReason).toBe('tool_converged_local');
    expect(result.text).toContain('本轮未完成写入');
    expect(result.text).not.toContain('"arguments"');
    expect(result.toolCalls).toEqual([{ id: 'call_state', name: 'editor.get_state', input: {} }]);
    expect(events).toEqual(['pseudo', 'pseudo', 'fallback']);
    vi.unstubAllGlobals();
  });

  it('cancels the convergence request when the user cancels mid-flight', async () => {
    const loopTool = {
      ...tool,
      name: 'editor.search',
      async execute() {
        return { ok: true, data: { total: 1 } }
      },
    }
    const toolResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'call_loop', type: 'function', function: { name: 'editor.search', arguments: '{"query":"x"}' } }]
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const userCancelController = new AbortController();
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => toolResponse())
      .mockImplementationOnce(async () => toolResponse())
      .mockImplementationOnce(() => new Promise<Response>((_resolve, reject) => {
        userCancelController.signal.addEventListener('abort', () =>
          reject(new DOMException('The operation was canceled', 'AbortError')), { once: true });
      }));
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    const request = service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '搜索' }],
      tools: [loopTool],
      toolPolicy: { maxToolIterations: 2 },
      cancelSignal: userCancelController.signal,
      retry: false,
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    userCancelController.abort();
    await expect(request).rejects.toMatchObject({ kind: 'canceled' });
    vi.unstubAllGlobals();
  });

  it('does not issue the convergence request when user cancellation is already active', async () => {
    const loopTool = {
      ...tool,
      name: 'editor.search',
      async execute() {
        return { ok: true, data: { total: 1 } }
      },
    }
    const toolResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'call_loop', type: 'function', function: { name: 'editor.search', arguments: '{"query":"x"}' } }]
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const logicalDeadlineController = new AbortController();
    const userCancelController = new AbortController();
    userCancelController.abort();
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => toolResponse())
      .mockImplementationOnce(async () => toolResponse());
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    await expect(service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '搜索' }],
      tools: [loopTool],
      toolPolicy: { maxToolIterations: 2 },
      signal: logicalDeadlineController.signal,
      cancelSignal: userCancelController.signal,
      retry: false,
    })).rejects.toMatchObject({ kind: 'canceled' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it('cancels convergence through the fallback user signal when no dedicated cancel signal is provided', async () => {
    const loopTool = {
      ...tool,
      name: 'editor.search',
      async execute() {
        return { ok: true, data: { total: 1 } }
      },
    }
    const toolResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'call_loop', type: 'function', function: { name: 'editor.search', arguments: '{"query":"x"}' } }]
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const userCancelController = new AbortController();
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => toolResponse())
      .mockImplementationOnce(async () => toolResponse())
      .mockImplementationOnce(() => new Promise<Response>((_resolve, reject) => {
        userCancelController.signal.addEventListener('abort', () =>
          reject(new DOMException('The operation was canceled', 'AbortError')), { once: true });
      }));
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    const request = service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '搜索' }],
      tools: [loopTool],
      toolPolicy: { maxToolIterations: 2 },
      signal: userCancelController.signal,
      retry: false,
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    userCancelController.abort();
    await expect(request).rejects.toMatchObject({ kind: 'canceled' });
    vi.unstubAllGlobals();
  });

  it('returns a local convergence digest when the convergence request fails', async () => {
    const loopTool = {
      ...tool,
      name: 'editor.search',
      async execute() {
        return { ok: true, data: { total: 1 } }
      },
    }
    const toolResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'call_loop', type: 'function', function: { name: 'editor.search', arguments: '{"query":"x"}' } }]
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => toolResponse())
      .mockImplementationOnce(async () => toolResponse())
      .mockImplementationOnce(async () => new Response(JSON.stringify({ error: 'provider down' }), { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '搜索' }],
      tools: [loopTool],
      toolPolicy: { maxToolIterations: 2 },
      retry: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.text).toContain('本轮未完成写入');
    expect(result.text).not.toContain('editor.search');
    expect(result.finishReason).toBe('tool_converged_local');
    expect(result.toolCalls).toHaveLength(2);
    const convergenceBody = JSON.parse((fetchMock.mock.calls[2][1] as RequestInit).body as string);
    expect(convergenceBody.tools).toBeUndefined();
    expect(convergenceBody.messages.some((message: { role: string; content?: string }) =>
      message.role === 'system' && message.content?.includes('当前请求不携带任何工具'))).toBe(true);
    vi.unstubAllGlobals();
  });

  it('still requests convergence when tool-loop rounds emitted procedural short text', async () => {
    const loopTool = {
      ...tool,
      name: 'editor.search',
      async execute() {
        return { ok: true, data: { total: 1 } }
      },
    }
    const toolResponseWithText = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '我先读取相关章节。',
          tool_calls: [{ id: 'call_loop', type: 'function', function: { name: 'editor.search', arguments: '{"query":"x"}' } }]
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const convergenceResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        message: { role: 'assistant', content: '工具轮次已达上限。本轮未写入，已确认读取到 1 条结果。' }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => toolResponseWithText())
      .mockImplementationOnce(async () => toolResponseWithText())
      .mockImplementationOnce(async () => convergenceResponse());
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '搜索' }],
      tools: [loopTool],
      toolPolicy: { maxToolIterations: 2 },
      retry: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.finishReason).toBe('tool_converged');
    expect(result.text).toContain('本轮未写入');
    const convergenceBody = JSON.parse((fetchMock.mock.calls[2][1] as RequestInit).body as string);
    expect(convergenceBody.tools).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it('converges after repeated identical schema invalid inputs instead of looping', async () => {
    const invalidReadTool = {
      ...tool,
      name: 'editor.read_range',
      inputSchema: {
        type: 'object' as const,
        properties: {
          cursor: { type: 'string' },
          sectionId: { type: 'string' },
        },
        additionalProperties: false,
      },
      async execute() { return { ok: true, data: { content: 'ok' } } },
    }
    const toolResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: 'call_invalid_pagination',
            type: 'function',
            function: { name: 'editor.read_range', arguments: '{"sectionId":"section-0","limit":10}' },
          }],
        },
      }],
    }), { status: 200 });
    const convergenceResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        message: { role: 'assistant', content: '工具连续参数错误，本轮未完成读取。' },
      }],
    }), { status: 200 });
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => toolResponse())
      .mockImplementationOnce(async () => toolResponse())
      .mockImplementationOnce(async () => toolResponse())
      .mockImplementationOnce(async () => convergenceResponse());
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    const warnings: string[] = [];
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '读取第一节' }],
      tools: [invalidReadTool],
      toolPolicy: {
        maxToolIterations: 8,
        onToolWarning: warning => warnings.push(warning),
      },
      retry: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.toolResults ?? []).toHaveLength(3);
    expect(result.toolResults?.map(item => item.result.error?.code)).toEqual([
      'invalid_input',
      'invalid_input',
      'invalid_input',
    ]);
    expect(result.finishReason).toBe('tool_converged');
    expect(result.text).toContain('本轮未完成读取');
    expect(warnings.join('\n')).toContain('连续 3 轮相同参数校验失败');
    const convergenceBody = JSON.parse((fetchMock.mock.calls[3][1] as RequestInit).body as string);
    expect(convergenceBody.tools).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it('continues the tool loop after one direct editor write', async () => {
    const writeTool = {
      ...tool,
      name: 'editor.write',
      policy: 'write' as const,
      async execute() {
        return { ok: true, data: { status: 'written' } }
      },
    }
    const toolResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'call_write', type: 'function', function: { name: 'editor.write', arguments: '{"commands":[{"operation":"append","content":"x"}]}' } }]
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const finalResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        message: { role: 'assistant', content: '写入完成' }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => toolResponse())
      .mockImplementationOnce(async () => finalResponse());
    vi.stubGlobal('fetch', fetchMock);
    const compatibilityEvents: string[] = [];
    const service = createAiService(runtimeStore());
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '提交两个写入提案' }],
      tools: [writeTool],
      toolPolicy: {
        maxToolIterations: 2,
        intent: 'edit',
        onCompatibilityMode: reason => compatibilityEvents.push(reason),
      },
      retry: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.toolResults?.[0].result.ok).toBe(true);
    expect(result.text).toBe('写入完成');
    expect(result.finishReason).toBe('stop');
    expect(compatibilityEvents).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('still executes plain-JSON tool_calls returned while a native tool request asked for streaming', async () => {
    const toolBody = JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'call_stream_guard', type: 'function', function: { name: 'editor.write', arguments: '{"commands":[{"operation":"append","content":"x"}]}' } }]
        }
      }]
    });
    const writeTool = {
      ...tool,
      name: 'editor.write',
      policy: 'write' as const,
      async execute() {
        return { ok: true, data: { status: 'written' } }
      },
    }
    const toolResponse = () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(toolBody));
        controller.close();
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const finalResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        message: { role: 'assistant', content: '写入完成' }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => toolResponse())
      .mockImplementationOnce(async () => finalResponse());
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '整理全文并写入' }],
      tools: [writeTool],
      stream: true,
      retry: false,
      toolPolicy: { maxToolIterations: 2, intent: 'edit' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).stream)
      .toBe(true);
    expect(result.toolResults?.[0].result.ok).toBe(true);
    expect(result.text).toBe('写入完成');
    expect(result.finishReason).toBe('stop');
    vi.unstubAllGlobals();
  });

  it('rejects a native editor.write call with unknown top-level fields before execution', async () => {
    const executed: unknown[] = [];
    const writeTool = {
      ...tool,
      name: 'editor.write',
      policy: 'write' as const,
      inputSchema: {
        type: 'object' as const,
        properties: {
          commands: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                operation: { type: 'string' },
                content: { type: 'string' },
              },
              required: ['operation'],
            },
          },
        },
        required: ['commands'],
        additionalProperties: false,
      },
      async execute(input: unknown) {
        executed.push(input);
        return { ok: true, data: { status: 'written' } };
      },
    };
    const toolResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: 'call_unknown_field',
            type: 'function',
            function: {
              name: 'editor.write',
              arguments: '{"commands":[{"operation":"append","content":"x"}],"insertAfter":true}',
            },
          }],
        },
      }],
    }), { status: 200, headers: { 'Content-Type': 'text/plain' } });
    const finalResponse = () => new Response(JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '已拒绝非法参数' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => toolResponse())
      .mockImplementationOnce(async () => finalResponse());
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '写入未知字段' }],
      tools: [writeTool],
      toolPolicy: { maxToolIterations: 2, intent: 'edit' },
      retry: false,
    });
    expect(executed).toEqual([]);
    expect(result.toolResults?.[0].result.ok).toBe(false);
    expect(result.toolResults?.[0].result.error?.code).toBe('invalid_input');
    expect(result.toolResults?.[0].result.error?.message).toContain('insertAfter 不是允许的字段');
    vi.unstubAllGlobals();
  });

  it('allows multiple direct editor writes with different inputs', async () => {
    const writeTool = {
      ...tool,
      name: 'editor.write',
      policy: 'write' as const,
      async execute() {
        return { ok: true, data: { status: 'written' } }
      },
    }
    const response = (content: string) => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'call_write', type: 'function', function: { name: 'editor.write', arguments: `{"commands":[{"operation":"append","content":"${content}"}]}` } }]
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const finalResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        message: { role: 'assistant', content: '全部写入完成' }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => response('x'))
      .mockImplementationOnce(async () => response('y'))
      .mockImplementationOnce(async () => response('z'))
      .mockImplementationOnce(async () => finalResponse());
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '直写两次' }],
      tools: [writeTool],
      toolPolicy: {
        maxToolIterations: 4,
        intent: 'edit',
      },
      retry: false,
    });
    expect(result.toolResults ?? []).toHaveLength(3);
    expect(result.toolResults?.map(item => item.result.ok)).toEqual([true, true, true]);
    expect(result.text).toBe('全部写入完成');
    vi.unstubAllGlobals();
  });

  it('blocks the third identical direct editor write and then resets the guard', async () => {
    const writeTool = {
      ...tool,
      name: 'editor.write',
      policy: 'write' as const,
      async execute() {
        return { ok: true, data: { status: 'written' } }
      },
    }
    const response = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'call_write', type: 'function', function: { name: 'editor.write', arguments: '{"commands":[{"operation":"append","content":"x"}]}' } }]
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const finalResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        message: { role: 'assistant', content: '重复写入已处理' }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => response())
      .mockImplementationOnce(async () => response())
      .mockImplementationOnce(async () => response())
      .mockImplementationOnce(async () => response())
      .mockImplementationOnce(async () => finalResponse());
    vi.stubGlobal('fetch', fetchMock);
    const blockedEvents: Array<{ repeatCount: number }> = [];
    const service = createAiService(runtimeStore());
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '重复提交同一批修改' }],
      tools: [writeTool],
      toolPolicy: {
        maxToolIterations: 5,
        intent: 'edit',
        onRepeatedWriteBlocked: event => blockedEvents.push({ repeatCount: event.repeatCount }),
      },
      retry: false,
    });
    expect(result.toolResults ?? []).toHaveLength(4);
    expect(result.toolResults?.map(item => item.result.ok)).toEqual([true, true, false, true]);
    expect(result.toolResults?.[2].result.error?.code).toBe('duplicate_write_blocked');
    expect(blockedEvents).toEqual([{ repeatCount: 3 }]);
    expect(result.text).toBe('重复写入已处理');
    vi.unstubAllGlobals();
  });

  it('does not count failed direct editor writes toward repeat blocking', async () => {
    const writeTool = {
      ...tool,
      name: 'editor.write',
      policy: 'write' as const,
      async execute() {
        return { ok: false, error: { code: 'batch_failed', message: '写入失败' } }
      },
    }
    const response = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'call_write', type: 'function', function: { name: 'editor.write', arguments: '{"commands":[{"operation":"append","content":"x"}]}' } }]
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const finalResponse = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        message: { role: 'assistant', content: '写入失败已报告' }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => response())
      .mockImplementationOnce(async () => response())
      .mockImplementationOnce(async () => response())
      .mockImplementationOnce(async () => finalResponse());
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '重试同一批修改' }],
      tools: [writeTool],
      toolPolicy: {
        maxToolIterations: 4,
        intent: 'edit',
      },
      retry: false,
    });
    expect(result.toolResults ?? []).toHaveLength(3);
    expect(result.toolResults?.map(item => item.result.ok)).toEqual([false, false, false]);
    expect(result.toolResults?.map(item => item.result.error?.code)).toEqual(['batch_failed', 'batch_failed', 'batch_failed']);
    expect(result.text).toBe('写入失败已报告');
    vi.unstubAllGlobals();
  });

  it('rejects write tools without intent metadata', async () => {
    const writeTool = {
      ...tool,
      name: 'editor.write',
      policy: 'write' as const,
      async execute() {
        return { ok: true, data: { status: 'written' } }
      },
    }
    const response = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'call_write', type: 'function', function: { name: 'editor.write', arguments: '{"commands":[{"operation":"append","content":"x"}]}' } }]
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn().mockImplementation(async () => response());
    vi.stubGlobal('fetch', fetchMock);
    const permissionEvents: any[] = [];
    const toolCallEvents: any[] = [];
    const service = createAiService(runtimeStore());
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '直写正文' }],
      tools: [writeTool],
      toolPolicy: {
        onPermissionDenied: event => permissionEvents.push(event),
        onToolCall: event => toolCallEvents.push(event),
      },
      retry: false,
    });
    expect(result.toolResults?.[0].result.ok).toBe(false);
    expect(result.toolResults?.[0].result.error?.code).toBe('permission_denied');
    expect(permissionEvents.length).toBeGreaterThan(0);
    expect(permissionEvents[0]).toMatchObject({ toolName: 'editor.write', reason: expect.stringContaining('缺少意图上下文') });
    expect(toolCallEvents[0]).toMatchObject({
      toolCapability: 'native_tools',
      rejectionCategory: 'permission_denied',
    });
    vi.unstubAllGlobals();
  });

  it('propagates static tool policy metadata on native tool call events', async () => {
    const writeTool = {
      ...tool,
      name: 'editor.write',
      policy: 'write' as const,
      defaultToolPolicy: 'allowedWithPermission' as const,
      riskLevel: 'medium' as const,
      async execute() {
        return { ok: true, data: { status: 'written' } }
      },
    }
    const response = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'call_write', type: 'function', function: { name: 'editor.write', arguments: '{"commands":[{"operation":"append","content":"x"}]}' } }]
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn().mockImplementation(async () => response());
    vi.stubGlobal('fetch', fetchMock);
    const toolCallEvents: any[] = [];
    const service = createAiService(runtimeStore());
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '直写正文' }],
      tools: [writeTool],
      toolPolicy: {
        onToolCall: event => toolCallEvents.push(event),
      },
      retry: false,
    });
    expect(result.toolResults?.[0].result.ok).toBe(false);
    expect(toolCallEvents[0]).toMatchObject({
      toolName: 'editor.write',
      toolCapability: 'native_tools',
      rejectionCategory: 'permission_denied',
      defaultToolPolicy: 'allowedWithPermission',
      riskLevel: 'medium',
    });
    vi.unstubAllGlobals();
  });

  it('rejects discuss-intent write tools even in direct mode', async () => {
    const writeTool = {
      ...tool,
      name: 'editor.write',
      policy: 'write' as const,
      async execute() {
        return { ok: true, data: { status: 'written' } }
      },
    }
    const response = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'call_write', type: 'function', function: { name: 'editor.write', arguments: '{"commands":[{"operation":"append","content":"x"}]}' } }]
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn().mockImplementation(async () => response());
    vi.stubGlobal('fetch', fetchMock);
    const toolCallEvents: any[] = [];
    const service = createAiService(runtimeStore());
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '看一下这里' }],
      tools: [writeTool],
      toolPolicy: {
        intent: 'discuss',
        onToolCall: event => toolCallEvents.push(event),
      },
      retry: false,
    });
    expect(result.toolResults?.[0].result.ok).toBe(false);
    expect(result.toolResults?.[0].result.error?.code).toBe('permission_denied');
    expect(result.toolResults?.[0].result.error?.message).toContain('discuss');
    expect(toolCallEvents[0]).toMatchObject({
      toolCapability: 'native_tools',
      rejectionCategory: 'permission_denied',
    });
    vi.unstubAllGlobals();
  });

  it('rejects a workflow write marker when the routed intent is discuss', async () => {
    const writeTool = {
      ...tool,
      name: 'editor.write',
      policy: 'write' as const,
      async execute() {
        return { ok: true, data: { status: 'written' } }
      },
    }
    const finalResponse = () => new Response(JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '已读取并准备好分批修改' } }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const response = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'call_write', type: 'function', function: { name: 'editor.write', arguments: '{"commands":[{"operation":"append","content":"x"}]}' } }]
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => response())
      .mockImplementationOnce(async () => finalResponse());
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '请先读取第20000节附近的地图，再读取首尾两节' }],
      tools: [writeTool],
      toolPolicy: {
        intent: 'discuss',
        permissionDecision: {
          source: 'dialogue-intent',
          decision: 'read-only',
          intent: 'discuss',
          operation: 'discussion',
          mode: 'direct',
          reason: 'discuss/analyze intents are always read-only',
        },
      },
      retry: false,
  });
    expect(result.toolResults?.[0].result.ok).toBe(false);
    expect(result.toolResults?.[0].result.error?.code).toBe('permission_denied');
    expect(result.text).toBe('已读取并准备好分批修改');
    vi.unstubAllGlobals();
  });

  it('degrades a rejected native-tools request to the JSON protocol', async () => {
    const writeTool = {
      ...tool,
      name: 'editor.write',
      policy: 'write' as const,
      async execute() {
        return { ok: true, data: { status: 'written' } }
      },
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'tools unsupported' } }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: '```json\n{"type":"editor_edit","version":1,"operation":"append","content":"尾声"}\n```' } }],
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    const toolCallEvents: any[] = [];
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '修改正文' }],
      tools: [writeTool],
      toolPolicy: {
        intent: 'edit',
        onToolCall: event => toolCallEvents.push(event),
      },
      stream: false,
      retry: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.toolsDowngraded).toBe('json-protocol');
    // Legacy editor_edit payloads are not editor.write protocol requests;
    // they stay as ordinary chat text and are never executed as writes.
    expect(result.text).toContain('editor_edit');
    expect(result.toolCalls ?? []).toHaveLength(0);
    expect(toolCallEvents).toHaveLength(0);
    const firstBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const secondBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(firstBody.tools).toBeDefined();
    expect(secondBody.tools).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it('executes editor.write through the unified tool after a native-tools downgrade', async () => {
    const writeTool = {
      ...tool,
      name: 'editor.write',
      policy: 'write' as const,
      defaultToolPolicy: 'allowedWithPermission' as const,
      riskLevel: 'medium' as const,
      async execute(input: unknown) {
        const params = input as { commands?: unknown[] }
        return { ok: true, data: { status: 'written', commandCount: params.commands?.length || 0 } }
      },
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'tools unsupported' } }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: '```json\n{"tool":"editor.write","commands":[{"operation":"append","content":"尾声"}],"reveal":{"mode":"instant"},"reason":"追加尾声"}\n```' } }],
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const toolEvents: any[] = [];
    const service = createAiService(runtimeStore());
    const protocolEvents: Array<{ protocolVersion?: number; protocolVersionDefaulted?: boolean }> = [];
    const staticPolicyEvents: Array<{ defaultToolPolicy?: string; riskLevel?: string }> = [];
    const rejectionCategories: Array<string | undefined> = [];
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '把尾声写进编辑器' }],
      tools: [writeTool],
      stream: false,
      retry: false,
      toolPolicy: {
        intent: 'edit',
        onToolStart: event => toolEvents.push(['start', event.toolName, event.input]),
        onToolCall: event => {
          toolEvents.push(['call', event.toolName, event.result.ok])
          protocolEvents.push({
            protocolVersion: event.protocolVersion,
            protocolVersionDefaulted: event.protocolVersionDefaulted,
          })
          staticPolicyEvents.push({
            defaultToolPolicy: event.defaultToolPolicy,
            riskLevel: event.riskLevel,
          })
          rejectionCategories.push(event.rejectionCategory)
        },
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(secondBody.tools).toBeUndefined();
    expect(secondBody.messages.some((message: { role: string; content?: string }) =>
      message.role === 'system' && message.content?.includes('"tool":"editor.write"'))).toBe(true);
    expect(result.toolsDowngraded).toBe('json-protocol');
    expect(result.compatibilityWrite).toBe(true);
    expect(result.text).toBe('已通过兼容模式直写编辑器：1 条修改已执行。');
    expect(result.text).not.toContain('"tool":"editor.write"');
    expect(result.toolCalls ?? []).toHaveLength(1);
    expect(result.toolCalls?.[0]).toMatchObject({ name: 'editor.write' });
    expect(result.toolResults?.[0].result.ok).toBe(true);
    expect(toolEvents).toEqual([
      ['start', 'editor.write', expect.any(Object)],
      ['call', 'editor.write', true],
    ]);
    expect(protocolEvents).toEqual([
      { protocolVersion: 1, protocolVersionDefaulted: true },
    ]);
    expect(staticPolicyEvents).toEqual([
      { defaultToolPolicy: 'allowedWithPermission', riskLevel: 'medium' },
    ]);
    expect(rejectionCategories).toEqual([undefined]);
    vi.unstubAllGlobals();
  });

  it('injects the plan-aware JSON protocol after a native-tools downgrade', async () => {
    const writeTool = {
      ...tool,
      name: 'editor.write',
      policy: 'write' as const,
      async execute() {
        return { ok: true, data: { status: 'written' } }
      },
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'tools unsupported' } }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { role: 'assistant', content: '本轮未写入。' } }],
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    const executionPlan = buildLongDocumentExecutionPlan({
      requestText: '重新整理排序整篇大纲',
      content: '第一卷\n第一章\n第二卷'.repeat(1000),
      contextWindowTokens: 120_000,
      maxOutputTokens: 8_000,
    });
    await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '重新整理排序整篇大纲' }],
      tools: [writeTool],
      stream: false,
      retry: false,
      toolPolicy: {
        intent: 'edit',
        executionPlan,
      },
    });
    const downgradeBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    const downgradeText = downgradeBody.messages
      .filter((message: { role: string }) => message.role === 'system')
      .map((message: { content?: string }) => message.content ?? '')
      .join('\n');
    expect(downgradeText).toContain('当前允许的写入操作：reorder_sections');
    expect(downgradeText).toContain('结构重排只允许提交单条 reorder_sections 命令');
    expect(downgradeText).not.toContain('必须使用单条 replace_document');
    vi.unstubAllGlobals();
  });

  it('blocks the third identical compatibility editor write across separate calls', async () => {
    const writeTool = {
      ...tool,
      name: 'editor.write',
      policy: 'write' as const,
      async execute() {
        return { ok: true, data: { status: 'written' } }
      },
    }
    const rejectedResponse = () => new Response(JSON.stringify({
      error: { message: 'tools unsupported' },
    }), { status: 400 });
    const protocolResponse = () => new Response(JSON.stringify({
      choices: [{ message: { content: ['```json', '{"tool":"editor.write","commands":[{"operation":"append","content":"尾声"}],"reveal":{"mode":"instant"},"reason":"追加尾声"}', '```'].join('\n') } }],
    }), { status: 200 });
    const fetchMock = vi.fn();
    for (let requestIndex = 0; requestIndex < 4; requestIndex += 1) {
      fetchMock
        .mockImplementationOnce(async () => rejectedResponse())
        .mockImplementationOnce(async () => protocolResponse());
    }
    vi.stubGlobal('fetch', fetchMock);
    const blockedEvents: Array<{ repeatCount: number }> = [];
    const physicalStatuses: string[] = [];
    const service = createAiService(runtimeStore());
    const request = async () => service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '追加尾声' }],
      tools: [writeTool],
      stream: false,
      retry: false,
      toolPolicy: {
        intent: 'edit',
        onRepeatedWriteBlocked: event => blockedEvents.push({ repeatCount: event.repeatCount }),
      },
      meta: {
        projectId: 'project-a',
        workspace: 'outline',
        targetId: 'outline',
        sessionId: 'session-1',
      },
      onPhysicalCall: event => {
        if (event.downgradeReason === 'compatibility_write') physicalStatuses.push(event.status)
      },
    });
    await request();
    await request();
    const blocked = await request();
    expect(blocked.toolResults?.[0].result.error?.code).toBe('duplicate_write_blocked');
    expect(blockedEvents).toEqual([{ repeatCount: 3 }]);
    expect(physicalStatuses).toEqual(['success', 'success']);
    const afterReset = await request();
    expect(afterReset.toolResults?.[0].result.ok).toBe(true);
    expect(physicalStatuses).toEqual(['success', 'success', 'success']);
    vi.unstubAllGlobals();
  });

  it('evicts the oldest compatibility write guard scope after 100 sessions', async () => {
    const writeTool = {
      ...tool,
      name: 'editor.write',
      policy: 'write' as const,
      async execute() {
        return { ok: true, data: { status: 'written' } }
      },
    }
    const rejectedResponse = () => new Response(JSON.stringify({
      error: { message: 'tools unsupported' },
    }), { status: 400 });
    const protocolResponse = () => new Response(JSON.stringify({
      choices: [{ message: { content: ['```json', '{"tool":"editor.write","commands":[{"operation":"append","content":"尾声"}],"reveal":{"mode":"instant"},"reason":"追加尾声"}', '```'].join('\n') } }],
    }), { status: 200 });
    const fetchMock = vi.fn();
    for (let requestIndex = 0; requestIndex < 103; requestIndex += 1) {
      fetchMock
        .mockImplementationOnce(async () => rejectedResponse())
        .mockImplementationOnce(async () => protocolResponse());
    }
    vi.stubGlobal('fetch', fetchMock);
    const service = createAiService(runtimeStore());
    const request = (sessionIndex: number) => service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '追加尾声' }],
      tools: [writeTool],
      stream: false,
      retry: false,
      toolPolicy: { intent: 'edit' },
      meta: {
        projectId: 'project-a',
        workspace: 'outline',
        targetId: 'outline',
        sessionId: `session-${sessionIndex}`,
      },
    });

    await request(0);
    await request(0);
    for (let sessionIndex = 1; sessionIndex <= 100; sessionIndex += 1) {
      await request(sessionIndex);
    }
    const firstSessionAgain = await request(0);
    expect(firstSessionAgain.toolResults?.[0].result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(206);
    vi.unstubAllGlobals();
  });

  it('records a failed compatibility editor write as failed in physical trace', async () => {
    const writeTool = {
      ...tool,
      name: 'editor.write',
      policy: 'write' as const,
      async execute() {
        return { ok: false, error: { code: 'version_changed', message: '编辑目标已变化' } }
      },
    }
    const rejectedResponse = () => new Response(JSON.stringify({
      error: { message: 'tools unsupported' },
    }), { status: 400 });
    const protocolResponse = () => new Response(JSON.stringify({
      choices: [{ message: { content: ['```json', '{"tool":"editor.write","commands":[{"operation":"append","content":"尾声"}],"reveal":{"mode":"instant"},"reason":"追加尾声"}', '```'].join('\n') } }],
    }), { status: 200 });
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => rejectedResponse())
      .mockImplementationOnce(async () => protocolResponse());
    vi.stubGlobal('fetch', fetchMock);
    const physicalEvents: any[] = [];
    const service = createAiService(runtimeStore());
    const result = await service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '追加尾声' }],
      tools: [writeTool],
      stream: false,
      retry: false,
      toolPolicy: { intent: 'edit' },
      onPhysicalCall: event => {
        if (event.downgradeReason === 'compatibility_write') physicalEvents.push(event)
      },
    });
    expect(result.toolResults?.[0].result.ok).toBe(false);
    expect(physicalEvents).toHaveLength(1);
    expect(physicalEvents[0].status).toBe('failed');
    expect(physicalEvents[0].error).toContain('编辑目标已变化');
    vi.unstubAllGlobals();
  });
});

describe('createAiService.fetchModels', () => {
  it('returns models and records a diagnostic entry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'model-a' }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const entries: any[] = []
    const service = createAiService(runtimeStore(), { addLog: (entry) => entries.push(entry) })
    await expect(service.fetchModels('runtime')).resolves.toEqual(['model-a'])
    expect(entries.at(-1)).toMatchObject({ providerId: 'runtime', status: 'success' })
    vi.unstubAllGlobals()
  })

  it('classifies model-list auth failures', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    const service = createAiService(runtimeStore())
    await expect(service.fetchModels('runtime')).rejects.toMatchObject({ kind: 'auth', statusCode: 401 })
    vi.unstubAllGlobals()
  })
})
