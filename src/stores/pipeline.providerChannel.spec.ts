import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePipelineStore } from './pipeline'
import type { PipelineProviderChannelSnapshot } from '../services/pipelineProviderChannels'

type StorageMap = Map<string, unknown>

const storageSnapshot: PipelineProviderChannelSnapshot = {
  layer: 'volumes',
  layerProviderId: 'provider-a',
  agentProviderId: null,
  globalProviderId: 'provider-global',
  providerId: 'provider-a',
  source: 'layer',
  providerMissing: false,
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
    },
  })
}

describe('pipeline provider channel snapshots', () => {
  let storage: StorageMap

  beforeEach(() => {
    storage = new Map<string, unknown>()
    setActivePinia(createPinia())
    installStorage(storage)
  })

  it('freezes a provider channel snapshot inside its own run', () => {
    const pipeline = usePipelineStore()
    const runId = pipeline.startGeneration('volumes', 'volume-1', {
      configSnapshot: { pipelineProviderChannel: storageSnapshot },
    })

    expect(pipeline.getFrozenProviderChannel<PipelineProviderChannelSnapshot>(runId))
      .toEqual(storageSnapshot)
  })

  it('does not leak a snapshot into runs created without provider channels', () => {
    const pipeline = usePipelineStore()
    const frozenRunId = pipeline.startGeneration('volumes', 'volume-1', {
      configSnapshot: { pipelineProviderChannel: storageSnapshot },
    })
    const unboundRunId = pipeline.startGeneration('volumes', 'volume-2')

    expect(pipeline.getFrozenProviderChannel<PipelineProviderChannelSnapshot>(frozenRunId))
      .toEqual(storageSnapshot)
    expect(pipeline.getFrozenProviderChannel<PipelineProviderChannelSnapshot>(unboundRunId))
      .toBeUndefined()
  })

  it('keeps queued run snapshots isolated until each run activates', async () => {
    const pipeline = usePipelineStore()
    const firstChannel: PipelineProviderChannelSnapshot = {
      ...storageSnapshot,
      providerId: 'provider-first',
      layerProviderId: 'provider-first',
    }
    const queuedChannel: PipelineProviderChannelSnapshot = {
      ...storageSnapshot,
      providerId: 'provider-queued',
      layerProviderId: 'provider-queued',
    }
    const firstRunId = pipeline.startGeneration('volumes', 'volume-1', {
      configSnapshot: { pipelineProviderChannel: firstChannel },
    })
    const queuedRunId = pipeline.startGeneration('volumes', 'volume-1', {
      configSnapshot: { pipelineProviderChannel: queuedChannel },
    })

    expect(pipeline.getRunStatus(queuedRunId)).toBe('queued')
    expect(pipeline.getFrozenProviderChannel<PipelineProviderChannelSnapshot>(queuedRunId))
      .toEqual(queuedChannel)

    const activation = pipeline.waitForRunActivation(queuedRunId)
    pipeline.finishGeneration(firstRunId)
    await expect(activation).resolves.toMatchObject({ runId: queuedRunId })
    expect(pipeline.getFrozenProviderChannel<PipelineProviderChannelSnapshot>(queuedRunId))
      .toEqual(queuedChannel)
    expect(pipeline.getFrozenProviderChannel<PipelineProviderChannelSnapshot>(firstRunId))
      .toEqual(firstChannel)
  })
})
