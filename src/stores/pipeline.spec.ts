import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePipelineStore } from './pipeline'
import { createChainFailureBreakpoint } from '../services/chainBreakpoint'

describe('pipeline breakpoint storage isolation', () => {
  const storage = new Map<string, unknown>()
  const chainBreakpoint = createChainFailureBreakpoint({
    step: 2,
    projectId: 'project-1',
    ownerKey: 'pipeline:project-1:step-2',
    skillIndex: 1,
    skillId: 'fill',
    skillSequence: ['parse', 'fill'],
    lastSuccessChainIndex: 0,
    lastOutput: 'parse output',
    inputPrompt: '生成卷纲',
    agentId: '',
    retryCount: 1,
    error: 'network',
  })
  const chapterBreakpoint = {
    kind: 'chapters',
    step: 3,
    projectId: 'project-1',
    volumeId: 'vol-1',
    volumeIndex: 0,
    chapterCount: 3,
    nextChapterIndex: 3,
    total: 20,
    phase: 'paused',
  }

  beforeEach(() => {
    storage.clear()
    setActivePinia(createPinia())
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
  })

  it('keeps chain owner breakpoints in separate slots', async () => {
    const store = usePipelineStore()
    await store.saveBreakpoint(chainBreakpoint)
    await store.saveBreakpoint({ ...chainBreakpoint, ownerKey: 'pipeline:project-1:step-4' })

    expect(storage.has('wa_pipeline_breakpoint')).toBe(false)
    expect(await store.refreshBreakpoint('pipeline:project-1:step-2')).toMatchObject({
      ownerKey: 'pipeline:project-1:step-2',
    })
    expect(await store.refreshBreakpoint('pipeline:project-1:step-4')).toMatchObject({
      ownerKey: 'pipeline:project-1:step-4',
    })
  })

  it('keeps chapter batch breakpoints in the shared pipeline slot', async () => {
    const store = usePipelineStore()
    await store.saveBreakpoint(chapterBreakpoint)
    await store.saveBreakpoint(chainBreakpoint)

    expect(await store.refreshBreakpoint()).toMatchObject({
      kind: 'chapters',
      chapterCount: 3,
    })
    expect(await store.refreshBreakpoint('pipeline:project-1:step-2')).toMatchObject({
      skillId: 'fill',
    })
  })

  it('clears an owner breakpoint without deleting the chapter slot', async () => {
    const store = usePipelineStore()
    await store.saveBreakpoint(chapterBreakpoint)
    await store.saveBreakpoint(chainBreakpoint)
    await store.clearBreakpoint('pipeline:project-1:step-2')

    expect(await store.refreshBreakpoint('pipeline:project-1:step-2')).toBeNull()
    expect(await store.refreshBreakpoint()).toMatchObject({ kind: 'chapters' })
  })

  it('fails and keeps the checkpoint when storage removal reports failure', async () => {
    const store = usePipelineStore()
    await store.saveBreakpoint(chainBreakpoint)
    const storageRemove = window.electronAPI.storageRemove as ReturnType<typeof vi.fn>
    storageRemove.mockResolvedValueOnce(false)

    await expect(store.clearBreakpoint('pipeline:project-1:step-2'))
      .rejects.toThrow('pipeline breakpoint remove failed: wa_pipeline_breakpoint_owner_pipeline:project-1:step-2')
    expect(store.breakpoint).toMatchObject({ ownerKey: 'pipeline:project-1:step-2' })
    expect(storage.get('wa_pipeline_breakpoint_owner_pipeline:project-1:step-2')).toMatchObject({
      ownerKey: 'pipeline:project-1:step-2',
    })
  })
})
