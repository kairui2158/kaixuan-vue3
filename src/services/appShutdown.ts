import type { usePipelineStore } from '../stores/pipeline'
import type { useProjectStore } from '../stores/project'
import type { useRunTraceStore } from '../stores/runTrace'

type PipelineStore = ReturnType<typeof usePipelineStore>
type ProjectStore = ReturnType<typeof useProjectStore>
type RunTraceStore = ReturnType<typeof useRunTraceStore>

export interface AppShutdownResult {
  canceledPipelineRunIds: string[]
  canceledTraceRunIds: string[]
  flushErrors: string[]
  projectSaveOk: boolean
  projectFailedKeys: string[]
}

export async function shutdownApplication(
  stores: {
    pipelineStore: PipelineStore
    runTraceStore: RunTraceStore
    projectStore: ProjectStore
  },
  options: { reason?: string; flushTimeoutMs?: number } = {},
): Promise<AppShutdownResult> {
  const reason = options.reason || '应用关闭，任务已取消'
  const pipelineResult = stores.pipelineStore.cancelAllActiveRuns(reason)
  const traceResult = await stores.runTraceStore.shutdownAndFlush({
    reason,
    timeoutMs: options.flushTimeoutMs,
  })
  let projectSaveOk = true
  let projectFailedKeys: string[] = []
  try {
    const saveResult = await stores.projectStore.saveProject()
    projectSaveOk = saveResult.ok
    projectFailedKeys = saveResult.failedKeys
  } catch (error) {
    projectSaveOk = false
    projectFailedKeys = ['project-save-exception']
    traceResult.errors.push(error instanceof Error ? error.message : String(error))
  }
  return {
    canceledPipelineRunIds: pipelineResult.canceledRunIds,
    canceledTraceRunIds: traceResult.canceledRunIds,
    flushErrors: traceResult.errors,
    projectSaveOk,
    projectFailedKeys,
  }
}
