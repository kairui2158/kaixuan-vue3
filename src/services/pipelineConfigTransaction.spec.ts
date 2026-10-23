import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePipelineStore } from '../stores/pipeline'

type StorageMap = Map<string, unknown>

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

describe('pipeline step config transactions', () => {
  let storage: StorageMap

  beforeEach(() => {
    storage = new Map<string, unknown>()
    setActivePinia(createPinia())
    installStorage(storage)
  })

  it('serializes concurrent step config writes without losing either write', async () => {
    const pipeline = usePipelineStore()
    await pipeline.updateStepConfig(2, { agentId: 'volume-agent' })

    await Promise.all([
      pipeline.updateStepConfig(3, { agentId: 'chapter-agent' }),
      pipeline.updateStepConfig(4, { agentId: 'body-agent' }),
    ])

    expect(await pipeline.getStepAgents(2)).toBe('volume-agent')
    expect(await pipeline.getStepAgents(3)).toBe('chapter-agent')
    expect(await pipeline.getStepAgents(4)).toBe('body-agent')
  })

  it('rejects a failed config write and keeps the queue usable', async () => {
    const pipeline = usePipelineStore()
    const originalWrite = window.electronAPI.storageWrite
    window.electronAPI.storageWrite = vi.fn(async (key: string, value: unknown) => {
      if (String(key).endsWith('pipeline_step_config')) return false
      storage.set(key, value)
      return true
    })

    await expect(pipeline.updateStepConfig(2, { agentId: 'volume-agent' }))
      .rejects.toThrow(/pipeline step config write failed/i)

    window.electronAPI.storageWrite = originalWrite
    await pipeline.updateStepConfig(2, { agentId: 'recovered-agent' })
    expect(await pipeline.getStepAgents(2)).toBe('recovered-agent')
  })

  it('exposes a transactional whole-config write for component callers', async () => {
    const pipeline = usePipelineStore()
    await pipeline.updateStepConfig(2, { agentId: 'volume-agent' })

    await pipeline.writeStepConfig({
      agents: { 3: 'chapter-agent' },
      skills: { 3: ['chapter-skill'] },
      bookWordCount: 2000000,
    })

    expect(await pipeline.getStepAgents(2)).toBe('volume-agent')
    expect(await pipeline.getStepAgents(3)).toBe('chapter-agent')
    expect(await pipeline.getStepSkills(3)).toEqual(['chapter-skill'])
    expect((storage.get('wa_pipeline_step_config') as any)?.bookWordCount).toBe(2000000)
  })

  it('freezes the config snapshot passed to a new run', async () => {
    const pipeline = usePipelineStore()
    await pipeline.updateStepConfig(2, { agentId: 'volume-agent' })
    const snapshot = await pipeline.readStepConfigSnapshot()

    const runId = pipeline.startGeneration('volumes', 'volume-4', { configSnapshot: snapshot })
    snapshot.agents = { 2: 'mutated-after-start' }

    expect(pipeline.getRun(runId)?.configSnapshot).toEqual({
      agents: { 2: 'volume-agent' },
      skills: { 2: [] },
      modes: { 2: 'compose' },
      skillAgents: {},
    })
  })
})
