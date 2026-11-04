import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProviderStore } from '../stores/provider'
import { usePipelineStore } from '../stores/pipeline'
import { resolveProvider } from './providerRouter'
import type { PipelineProviderChannelSnapshot } from './pipelineProviderChannels'

type StorageMap = Map<string, unknown>

function createProvider(id: string) {
  return {
    id,
    name: id,
    provider: 'openai-compatible',
    apiKey: `key-${id}`,
    baseUrl: 'https://example.test/v1',
    models: ['model-a'],
    selectedModel: 'model-a',
    temperature: 0.7,
    maxTokens: 4096,
    purpose: 'generate' as const,
  }
}

function installStorage(storage: StorageMap) {
  vi.stubGlobal('window', {
    electronAPI: {
      storageRead: vi.fn(async (key: string) => storage.get(key) ?? null),
      storageWrite: vi.fn(async (key: string, value: unknown) => {
        storage.set(key, value)
        return true
      }),
      storageRemove: vi.fn(async (key: string) => {
        storage.delete(key)
        return true
      }),
      providerNetRequest: vi.fn(async () => ({ ok: false })),
    },
  })
}

describe('pipeline provider channel routing integration', () => {
  let storage: StorageMap

  beforeEach(() => {
    storage = new Map<string, unknown>()
    setActivePinia(createPinia())
    installStorage(storage)
    vi.stubGlobal('navigator', { userAgent: 'vitest' })
  })

  it('passes an explicit frozen channel provider into provider routing', () => {
    const providerStore = useProviderStore()
    providerStore.providers = [
      createProvider('provider-layer'),
      createProvider('provider-global'),
    ] as any
    const snapshot: PipelineProviderChannelSnapshot = {
      layer: 'volumes',
      layerProviderId: 'provider-layer',
      agentProviderId: null,
      globalProviderId: 'provider-global',
      providerId: 'provider-layer',
      source: 'layer',
      providerMissing: false,
    }
    const pipelineStore = usePipelineStore()
    const runId = pipelineStore.startGeneration('volumes', 'volume-1', {
      configSnapshot: { pipelineProviderChannel: snapshot },
    })

    const frozen = pipelineStore.getFrozenProviderChannel<PipelineProviderChannelSnapshot>(runId)
    expect(frozen?.providerId).toBe('provider-layer')

    // Changing the persisted layer binding after run start must not alter the frozen channel.
    providerStore.pipelineLayerProviders = {
      ...providerStore.pipelineLayerProviders,
      volumes: 'provider-global',
    }
    const stillFrozen = pipelineStore.getFrozenProviderChannel<PipelineProviderChannelSnapshot>(runId)
    expect(stillFrozen?.providerId).toBe('provider-layer')

    expect(resolveProvider(providerStore, 'generate', stillFrozen?.providerId))
      .toEqual({ provider: expect.objectContaining({ id: 'provider-layer' }), providerId: 'provider-layer' })
  })

  it('fails before a request when a frozen layer provider is missing', () => {
    const providerStore = useProviderStore()
    providerStore.providers = [createProvider('provider-global')] as any
    const snapshot: PipelineProviderChannelSnapshot = {
      layer: 'body',
      layerProviderId: 'provider-deleted',
      agentProviderId: null,
      globalProviderId: 'provider-global',
      providerId: 'provider-deleted',
      source: 'layer',
      providerMissing: true,
    }
    const pipelineStore = usePipelineStore()
    const runId = pipelineStore.startGeneration('body', 'chapter-1', {
      configSnapshot: { pipelineProviderChannel: snapshot },
    })
    const frozen = pipelineStore.getFrozenProviderChannel<PipelineProviderChannelSnapshot>(runId)

    expect(frozen?.providerMissing).toBe(true)
    expect(() => resolveProvider(providerStore, 'generate', frozen?.providerId))
      .toThrow('未找到指定供应商：provider-deleted')
  })
})
