import { describe, it, expect, vi } from 'vitest';
import { buildChatUrl, buildModelsUrl, extractNonStreamText, extractStreamDelta, isSSEDataLine, isSSEDone, resolveModel, resolveTemperature, resolveMaxTokens } from './providerAdapter';
import { resolveProvider, tryResolveProvider } from './providerRouter';
import { createAiService, filterThinkingTags, AiServiceErrorImpl } from './aiService';

// ── providerAdapter tests ──────────────────────────────────────────

describe('buildChatUrl', () => {
  it('appends /v1/chat/completions when baseUrl has no version', () => {
    expect(buildChatUrl('https://api.example.com')).toBe('https://api.example.com/v1/chat/completions');
  });
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

describe('extractNonStreamText', () => {
  it('extracts from choices[0].message.content', () => {
    const data = { choices: [{ message: { content: 'Hello' } }] };
    expect(extractNonStreamText(data).text).toBe('Hello');
  });
  it('falls back to reasoning_content', () => {
    const data = { choices: [{ message: { reasoning_content: 'Reasoning' } }] };
    expect(extractNonStreamText(data).text).toBe('Reasoning');
  });
  it('returns empty string when no content', () => {
    expect(extractNonStreamText({}).text).toBe('');
  });
  it('extracts usage', () => {
    const data = { choices: [{ message: { content: 'Hi' } }], usage: { total_tokens: 100 } };
    expect(extractNonStreamText(data).usage).toEqual({ total_tokens: 100 });
  });
});

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
  it('caps at 16384', () => { expect(resolveMaxTokens(provider, 99999)).toBe(16384); });
  it('falls back to provider maxTokens', () => { expect(resolveMaxTokens(provider)).toBe(4096); });
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

// ── callAi runtime error boundaries ────────────────────────────────

const runtimeProvider = {
  id: 'runtime', name: 'Runtime', baseUrl: 'https://api.example.com', apiKey: 'key',
  selectedModel: 'test-model', temperature: 0.2, maxTokens: 1024,
  streamMode: false, systemPrompt: '',
};

function runtimeStore() {
  return {
    providers: [runtimeProvider],
    generateProvider: 'runtime', verifyProvider: 'runtime', detectProvider: null,
    getGenerateProvider() { return runtimeProvider; },
    getVerifyProvider() { return runtimeProvider; },
    getDetectProvider() { return undefined; },
  } as any;
}

describe('createAiService.callAi', () => {
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
