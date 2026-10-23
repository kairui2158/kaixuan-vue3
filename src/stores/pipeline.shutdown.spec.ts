import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePipelineStore } from './pipeline'

describe('pipeline store shutdown cancellation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('window', {
      electronAPI: {
        storageRead: vi.fn(async () => null),
        storageWrite: vi.fn(async () => true),
        storageRemove: vi.fn(async () => true),
      },
    })
  })

  it('cancels all active queued and running runs across layers and targets', () => {
    const store = usePipelineStore()
    const volumesRunId = store.startGeneration('volumes', 'volume-1')
    const queuedVolumesRunId = store.startGeneration('volumes', 'volume-1')
    const chaptersRunId = store.startGeneration('chapters', 'volume-2')
    const bodyRunId = store.startGeneration('body', 'chapter-1')

    const result = store.cancelAllActiveRuns('应用关闭，任务已取消')

    expect(result.reason).toBe('应用关闭，任务已取消')
    expect(result.canceledRunIds).toEqual([
      volumesRunId,
      queuedVolumesRunId,
      chaptersRunId,
      bodyRunId,
    ])
    for (const runId of result.canceledRunIds) {
      expect(store.getRunStatus(runId)).toBe('canceled')
      expect(store.getGenerationSignal(runId)?.aborted).toBe(true)
    }
    expect(store.isGenerating).toBe(false)
  })
})
