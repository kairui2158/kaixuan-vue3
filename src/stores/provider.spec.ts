import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProviderStore } from './provider'

function installStorage(storage: Map<string, unknown>) {
  vi.stubGlobal('window', {
    electronAPI: {
      storageRead: vi.fn(async (key: string) => storage.get(key) ?? null),
      storageWrite: vi.fn(async (key: string, value: unknown) => {
        storage.set(key, value)
        return true
      }),
      decrypt: vi.fn(async (value: string) => value),
      encrypt: vi.fn(async (value: string) => value),
    },
  })
}

describe('provider store pipeline layer channels', () => {
  let storage: Map<string, unknown>

  beforeEach(() => {
    storage = new Map()
    setActivePinia(createPinia())
    installStorage(storage)
  })

  it('persists layer provider bindings', async () => {
    const store = useProviderStore()
    store.setPipelineLayerProvider('volumes', 'provider-volume')
    store.setPipelineLayerProvider('body', 'provider-body')

    await store.loadProviders()

    expect(store.pipelineLayerProviders).toEqual({
      volumes: 'provider-volume',
      body: 'provider-body',
    })
  })

  it('clears a layer binding when its provider is removed', async () => {
    const store = useProviderStore()
    store.addProvider({
      id: 'provider-volume',
      name: 'Volume Provider',
      baseUrl: 'https://example.test',
      apiKey: 'key',
      models: ['model'],
      selectedModel: 'model',
      temperature: 0.7,
      maxTokens: 0,
      purpose: ['generate'],
      providerType: 'openai-compatible',
    })
    store.setPipelineLayerProvider('volumes', 'provider-volume')
    store.setPipelineLayerProvider('chapters', 'provider-other')

    store.removeProvider('provider-volume')

    expect(store.pipelineLayerProviders).toEqual({
      volumes: null,
      chapters: 'provider-other',
    })
  })

  it('keeps externally persisted missing bindings visible so settings can warn', async () => {
    storage.set('wa_providers', {
      providers: [],
      generateProvider: null,
      verifyProvider: null,
      detectProvider: null,
      pipelineLayerProviders: { body: 'provider-deleted' },
    })
    const store = useProviderStore()

    await store.loadProviders()

    expect(store.pipelineLayerProviders).toEqual({ body: 'provider-deleted' })
  })
})
