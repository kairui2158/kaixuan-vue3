import { describe, expect, it } from 'vitest'
import { resolveProvider } from './providerRouter'

function createStore(providers: Array<{ id: string; apiKey?: string; purpose?: string[] }>) {
  const normalized = providers.map(provider => ({
    name: provider.id,
    baseUrl: 'https://example.test',
    selectedModel: 'model',
    temperature: 0.7,
    maxTokens: 0,
    purpose: provider.purpose ?? ['generate'],
    ...provider,
    apiKey: provider.apiKey ?? 'key',
  }))
  return {
    providers: normalized,
    generateProvider: 'p-global',
    verifyProvider: null,
    detectProvider: null,
    getGenerateProvider: () => normalized.find(provider => provider.id === 'p-global'),
    getVerifyProvider: () => undefined,
    getDetectProvider: () => undefined,
  }
}

describe('providerRouter explicit provider semantics', () => {
  it('uses the explicit provider when it exists', () => {
    const store = createStore([{ id: 'p-layer' }, { id: 'p-global' }])
    expect(resolveProvider(store, 'generate', 'p-layer')).toEqual({
      provider: expect.objectContaining({ id: 'p-layer' }),
      providerId: 'p-layer',
    })
  })

  it('fails explicitly when the requested provider id no longer exists', () => {
    const store = createStore([{ id: 'p-global' }])
    expect(() => resolveProvider(store, 'generate', 'deleted-provider'))
      .toThrow('未找到指定供应商：deleted-provider')
  })

  it('keeps purpose routing when no explicit provider id is supplied', () => {
    const store = createStore([{ id: 'p-global' }])
    expect(resolveProvider(store, 'generate')).toEqual({
      provider: expect.objectContaining({ id: 'p-global' }),
      providerId: 'p-global',
    })
  })
})
