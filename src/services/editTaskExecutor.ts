import type { EditorTargetSnapshot } from './editorTarget'
import type { ToolResult } from './editorTools'
import {
  applyEditTaskEvent,
  createEditTask,
  verifyEditTaskCheckpoint,
  type EditTask,
} from './editTaskService'
import { normalizeToolIterations, type ToolLoopScenario } from './toolLoopPolicy'

export interface EditTaskBatchInput {
  batchId: string
  run: () => Promise<EditTaskBatchRunResult>
}

export interface EditTaskBatchRunResult {
  ok: boolean
  documentVersion: number
  contentHash: string
  error?: string
  failedIndexes?: number[]
}

export interface EditTaskExecutorSnapshotInput {
  getSnapshot: () => EditorTargetSnapshot | null
  hashContent: (content: string) => string
}

export interface EditTaskExecutorCallbacks {
  onEvent?: (task: EditTask) => void
  onStatus?: (status: string) => void
}

export interface EditTaskExecuteOptions {
  sessionId: string
  source: EditTask['source']
  workspace: 'outline' | 'editor' | 'pipeline'
  targetId: string
  goal: string
  batches: EditTaskBatchInput[]
  scenario: ToolLoopScenario
  getSnapshot: EditTaskExecutorSnapshotInput['getSnapshot']
  hashContent: EditTaskExecutorSnapshotInput['hashContent']
  callbacks?: EditTaskExecutorCallbacks
  signal?: AbortSignal
}

export interface EditTaskExecuteResult {
  task: EditTask
  lastResult?: ToolResult
}

export function createTaskFromSnapshot(input: {
  sessionId: string
  source: EditTask['source']
  target: EditTask['target']
  goal: string
  snapshot: EditorTargetSnapshot | null
  hashContent: (content: string) => string
  now?: number
}): EditTask | null {
  if (!input.snapshot) return null
  const now = input.now ?? Date.now()
  return createEditTask({
    sessionId: input.sessionId,
    source: input.source,
    target: input.target,
    goal: input.goal,
    documentVersion: input.snapshot.contentVersion,
    contentHash: input.hashContent(input.snapshot.content),
    now,
  })
}

export async function executeEditTask(
  options: EditTaskExecuteOptions,
): Promise<EditTaskExecuteResult | null> {
  const now = () => Date.now()
  const snapshot = options.getSnapshot()
  if (!snapshot) return null

  let task = createTaskFromSnapshot({
    sessionId: options.sessionId,
    source: options.source,
    target: { workspace: options.workspace, targetId: options.targetId },
    goal: options.goal,
    snapshot,
    hashContent: options.hashContent,
    now: now(),
  })
  if (!task) return null

  task = applyEditTaskEvent(task, {
    type: 'plan_ready',
    batches: options.batches.map(batch => batch.batchId),
    now: now(),
  })
  task = applyEditTaskEvent(task, { type: 'task_started', now: now() })
  options.callbacks?.onStatus?.(`任务已创建：${task.goal}`)

  const maxBatchAttempts = normalizeToolIterations(options.scenario)
  const batchAttempts = new Map<string, number>()
  let lastResult: ToolResult | undefined

  while (task.pendingBatches.length > 0 || task.activeBatchId) {
    if (options.signal?.aborted) {
      task = applyEditTaskEvent(task, { type: 'task_canceled', now: now() })
      options.callbacks?.onStatus?.('任务已取消')
      break
    }

    const nextBatchId = task.activeBatchId || task.pendingBatches[0]
    const batch = options.batches.find(item => item.batchId === nextBatchId)
    if (!batch) {
      task = applyEditTaskEvent(task, { type: 'task_paused', now: now() })
      options.callbacks?.onEvent?.(task)
      return { task, lastResult: { ok: false, error: { code: 'batch_not_found', message: `批次不存在：${nextBatchId}` } } }
    }

    const currentSnapshot = options.getSnapshot()
    if (!currentSnapshot) {
      task = applyEditTaskEvent(task, { type: 'task_failed', now: now() })
      options.callbacks?.onEvent?.(task)
      return { task, lastResult: { ok: false, error: { code: 'target_missing', message: '编辑目标不存在' } } }
    }

    const baselineCheckpoint = task.checkpoints[task.checkpoints.length - 1]
    const checkpointState = verifyEditTaskCheckpoint(task, baselineCheckpoint.id, {
      documentVersion: currentSnapshot.contentVersion,
      contentHash: options.hashContent(currentSnapshot.content),
    })
    if (!checkpointState.valid) {
      task = applyEditTaskEvent(task, {
        type: 'task_paused',
        now: now(),
      })
      options.callbacks?.onStatus?.('文档与任务检查点不一致，任务已暂停，等待用户决定')
      options.callbacks?.onEvent?.(task)
      return { task, lastResult: { ok: false, error: { code: checkpointState.reason || 'checkpoint_mismatch', message: '文档状态与任务检查点不匹配' } } }
    }

    task = applyEditTaskEvent(task, {
      type: 'batch_started',
      batchId: batch.batchId,
      now: now(),
    })
    options.callbacks?.onStatus?.(`开始执行批次：${batch.batchId}`)
    options.callbacks?.onEvent?.(task)

    const result = await batch.run()
    lastResult = result.ok
      ? { ok: true, data: { batchId: batch.batchId } }
      : {
        ok: false,
        error: {
          code: result.error || 'batch_failed',
          message: `批次 ${batch.batchId} 执行失败`,
          retryable: true,
        },
      }

    if (result.ok) {
      task = applyEditTaskEvent(task, {
        type: 'batch_succeeded',
        batchId: batch.batchId,
        documentVersion: result.documentVersion,
        contentHash: result.contentHash,
        now: now(),
      })
      options.callbacks?.onStatus?.(`批次完成：${batch.batchId}`)
      options.callbacks?.onEvent?.(task)
      continue
    }

    task = applyEditTaskEvent(task, {
      type: 'batch_failed',
      batchId: batch.batchId,
      failedIndexes: result.failedIndexes || [],
      error: result.error || 'batch_failed',
      documentVersion: result.documentVersion,
      contentHash: result.contentHash,
      now: now(),
    })
    options.callbacks?.onStatus?.(`批次失败：${batch.batchId}（${result.error || 'batch_failed'}）`)
    options.callbacks?.onEvent?.(task)

    const attempts = (batchAttempts.get(batch.batchId) || 0) + 1
    batchAttempts.set(batch.batchId, attempts)
    if (attempts < maxBatchAttempts) {
      options.callbacks?.onStatus?.(`批次失败，准备第 ${attempts + 1} 次恢复（上限 ${maxBatchAttempts}）：只重试当前批次，不重放历史批次`)
      task = applyEditTaskEvent(task, {
        type: 'batch_retry_requested',
        batchId: batch.batchId,
        now: now(),
      })
      options.callbacks?.onEvent?.(task)
      continue
    }

    options.callbacks?.onStatus?.('批次失败已暂停；恢复时只会重试当前批次，不会重放已完成批次')
    task = applyEditTaskEvent(task, { type: 'task_paused', now: now() })
    options.callbacks?.onStatus?.('任务已暂停，等待用户决定继续、回滚或放弃')
    options.callbacks?.onEvent?.(task)
    return { task, lastResult }
  }

  task = applyEditTaskEvent(task, { type: 'task_succeeded', now: now() })
  options.callbacks?.onStatus?.('任务完成')
  options.callbacks?.onEvent?.(task)
  return { task, lastResult }
}
