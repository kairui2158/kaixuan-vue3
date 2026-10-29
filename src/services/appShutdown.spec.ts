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
    projectStore.currentProjectId = 'shutdown-disk-full-project'
    projectStore.projectName = '关闭前未保存项目'
    projectStore.markProjectDirty()
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

  it('does not write an unchanged project during shutdown', async () => {
    const pipelineStore = usePipelineStore()
    const runTraceStore = useRunTraceStore()
    const projectStore = useProjectStore()
    const saveProject = vi.spyOn(projectStore, 'saveProject')

    const result = await shutdownApplication({
      pipelineStore,
      runTraceStore,
      projectStore,
    })

    expect(saveProject).not.toHaveBeenCalled()
    expect(result.projectSaveOk).toBe(true)
    expect(result.projectFailedKeys).toEqual([])
    expect(window.electronAPI.storageWrite).not.toHaveBeenCalled()
  })

  it('does not write a loaded but unchanged project during shutdown', async () => {
    const pipelineStore = usePipelineStore()
    const runTraceStore = useRunTraceStore()
    const projectStore = useProjectStore()
    projectStore.currentProjectId = 'shutdown-loaded-project'
    projectStore.projectName = '已加载但未修改'
    const saveProject = vi.spyOn(projectStore, 'saveProject')

    const result = await shutdownApplication({
      pipelineStore,
      runTraceStore,
      projectStore,
    })

    expect(saveProject).not.toHaveBeenCalled()
    expect(result.projectSaveOk).toBe(true)
    expect(result.projectFailedKeys).toEqual([])
    expect(window.electronAPI.storageWrite).not.toHaveBeenCalled()
  })

  it('saves a dirty project during shutdown and reports a write failure', async () => {
    const pipelineStore = usePipelineStore()
    const runTraceStore = useRunTraceStore()
    const projectStore = useProjectStore()
    projectStore.currentProjectId = 'shutdown-dirty-project'
    projectStore.projectName = '关闭前未保存项目'
    projectStore.markProjectDirty()
    vi.mocked(window.electronAPI.storageWrite).mockResolvedValueOnce(false)

    const result = await shutdownApplication({
      pipelineStore,
      runTraceStore,
      projectStore,
    })

    expect(result.projectSaveOk).toBe(false)
    expect(result.projectFailedKeys).toEqual(['project'])
    expect(window.electronAPI.storageWrite).toHaveBeenCalled()
  })
})
