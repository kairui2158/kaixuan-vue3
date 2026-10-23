import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePipelineStore } from '../stores/pipeline'
import { useProjectStore } from '../stores/project'
import { useRunTraceStore } from '../stores/runTrace'
import { shutdownApplication } from './appShutdown'

describe('app shutdown', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('window', {
      electronAPI: {
        storageRead: vi.fn(async () => null),
        storageWrite: vi.fn(async () => true),
        storageRemove: vi.fn(async () => true),
        runTraceSave: vi.fn(async () => ({ success: true, dirName: 'shutdown-run' })),
      },
    })
  })

  it('cancels queued and running pipeline runs, closes trace runs, and saves the project', async () => {
    const pipelineStore = usePipelineStore()
    const runTraceStore = useRunTraceStore()
    const projectStore = useProjectStore()
    const runningRunId = pipelineStore.startGeneration('volumes', 'volume-1')
    const queuedRunId = pipelineStore.startGeneration('volumes', 'volume-1')
    const traceRunId = runTraceStore.startRun({ stepName: '卷纲层', mode: 'single', skillNames: [] })
    const traceCallId = runTraceStore.startApiCall(traceRunId, {
      requestMessages: [{ role: 'user', content: '生成卷纲' }],
    })

    const result = await shutdownApplication({
      pipelineStore,
      runTraceStore,
      projectStore,
    })

    expect(result.canceledPipelineRunIds).toEqual([runningRunId, queuedRunId])
    expect(pipelineStore.getRunStatus(runningRunId)).toBe('canceled')
    expect(pipelineStore.getRunStatus(queuedRunId)).toBe('canceled')
    expect(result.canceledTraceRunIds).toEqual([traceRunId])
    expect(runTraceStore.getRun(traceRunId)?.status).toBe('canceled')
    expect(runTraceStore.getRun(traceRunId)?.apiCalls[0]?.status).toBe('canceled')
    expect(traceCallId).toBeTruthy()
    expect(result.flushErrors).toEqual([])
    expect(result.projectSaveOk).toBe(true)
    expect(window.electronAPI.runTraceSave).toHaveBeenCalled()
  })

  it('keeps trace cancellation and project save independent failures observable', async () => {
    const pipelineStore = usePipelineStore()
    const runTraceStore = useRunTraceStore()
    const projectStore = useProjectStore()
    const traceRunId = runTraceStore.startRun({ stepName: '正文层', mode: 'single', skillNames: [] })
    const saveProject = vi.spyOn(projectStore, 'saveProject')
      .mockRejectedValueOnce(new Error('disk full'))

    const result = await shutdownApplication({
      pipelineStore,
      runTraceStore,
      projectStore,
    })

    expect(saveProject).toHaveBeenCalled()
    expect(runTraceStore.getRun(traceRunId)?.status).toBe('canceled')
    expect(result.projectSaveOk).toBe(false)
    expect(result.projectFailedKeys).toEqual(['project-save-exception'])
    expect(result.flushErrors).toEqual(['disk full'])
  })
})
