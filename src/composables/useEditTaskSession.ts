import type { Ref } from 'vue'
import { ref } from 'vue'
import {
  buildEditTaskControlHandlers,
  createEditTaskManager,
} from '../services/editTaskManager'
import {
  appendEditTaskPlanBatch,
  applyEditTaskEvent,
  createEditTask,
  type EditTask,
  type EditTaskBatchDetail,
} from '../services/editTaskService'
import type { ToolResult } from '../services/editorTools'

export interface EditTaskSessionBatchInput {
  target: {
    workspace: 'outline' | 'editor'
    targetId: string
  }
  goal: string
  batchId: string
  snapshot: {
    contentVersion: number
    contentHash: string
  }
  batchDetail?: EditTaskBatchDetail
}

export interface EditTaskSessionBatchResult {
  ok: boolean
  code?: string
  message?: string
  documentVersion?: number
  contentHash?: string
  applied?: boolean
}

export interface EditTaskSessionLifecycleEvent {
  type:
    | 'task_started'
    | 'batch_started'
    | 'batch_succeeded'
    | 'batch_failed'
    | 'task_paused'
    | 'task_resumed'
    | 'batch_retry_requested'
    | 'task_canceled'
    | 'task_finished'
    | 'task_succeeded_with_warnings'
    | 'task_failed'
  task: EditTask
}

export interface UseEditTaskSessionInput {
  sessionId: string
  source: EditTask['source']
  hashContent: (content: string) => string
  onLifecycle?: (event: EditTaskSessionLifecycleEvent) => void
}

export interface EditTaskSession {
  activeTask: () => EditTask | null
  activeTaskRef: () => Ref<EditTask | null>
  busy: () => boolean
  resumeEditTask: (taskId: string) => Promise<ToolResult>
  onResumeEditTask: (taskId: string) => Promise<ToolResult>
  onCancelEditTask: (taskId: string) => Promise<ToolResult>
  startOrContinueBatch: (
    input: EditTaskSessionBatchInput,
    run: () => Promise<EditTaskSessionBatchResult>,
    options?: { multiBatch?: boolean },
  ) => Promise<EditTaskSessionBatchResult>
  reset: () => void
  beginTask: (input: EditTaskSessionBatchInput) => EditTask
  finishActiveTask: (options?: { succeeded?: boolean; summaryFailed?: boolean }) => EditTask | null
}

export function useEditTaskSession(
  input: UseEditTaskSessionInput,
): EditTaskSession {
  const manager = createEditTaskManager()
  const activeTask = ref<EditTask | null>(null)
  const busy = ref(false)

  const emit = (
    type: EditTaskSessionLifecycleEvent['type'],
    task: EditTask,
  ) => {
    activeTask.value = manager.getActiveTask()
      || (isActiveTask(task) ? task : null)
    input.onLifecycle?.({ type, task })
  }

  const resumeEditTask = (taskId: string): Promise<ToolResult> => {
    const current = manager.getActiveTask()
    if (!current || current.id !== taskId) {
      return Promise.resolve({
        ok: false,
        error: { code: 'task_not_found', message: '没有找到要恢复的编辑任务' },
      })
    }
    if (current.status === 'waiting_user') {
      const resumed = applyEditTaskEvent(current, {
        type: 'task_resumed',
        now: Date.now(),
      })
      const next = manager.updateTask(resumed)
      emit('task_resumed', next)
      return Promise.resolve({ ok: true, data: { taskId: next.id, status: next.status } })
    }
    if (current.status === 'partially_applied') {
      const batchId = current.activeBatchId
        || current.failedBatchIds[0]
        || current.pendingBatches[0]
      if (!batchId) {
        return Promise.resolve({
          ok: false,
          error: { code: 'batch_not_found', message: '失败任务没有可恢复的批次' },
        })
      }
      const retrying = applyEditTaskEvent(current, {
        type: 'batch_retry_requested',
        batchId,
        now: Date.now(),
      })
      if (retrying.status !== 'awaiting_batch') {
        return Promise.resolve({
          ok: false,
          error: { code: 'task_resume_failed', message: '编辑任务无法恢复到待执行状态' },
        })
      }
      const next = manager.updateTask(retrying)
      emit('batch_retry_requested', next)
      return Promise.resolve({
        ok: true,
        data: {
          taskId: next.id,
          status: next.status,
          batchId,
          retryProtocol: 'batch_atomic_full_retry',
        },
      })
    }
    return Promise.resolve({
      ok: false,
      error: { code: 'task_not_resumable', message: `当前任务状态不支持恢复：${current.status}` },
    })
  }

  const startBatch = (batchInput: EditTaskSessionBatchInput): EditTask => {
    const current = manager.getActiveTask()
    if (current && current.target.targetId === batchInput.target.targetId) {
      let base = current
      if (base.status === 'waiting_user') {
        base = applyEditTaskEvent(base, {
          type: 'task_resumed',
          now: Date.now(),
        })
      }
      if (base.status === 'partially_applied') {
        const retryBatchId = base.activeBatchId
          || base.failedBatchIds[0]
          || base.pendingBatches[0]
        if (retryBatchId) {
          base = applyEditTaskEvent(base, {
            type: 'batch_retry_requested',
            batchId: retryBatchId,
            now: Date.now(),
          })
        }
      }
      const resumed = applyEditTaskEvent(base, {
        type: 'batch_started',
        batchId: batchInput.batchId,
        now: Date.now(),
      })
      const next = manager.updateTask(resumed)
      emit('batch_started', next)
      return next
    }
    const task = createEditTask({
      sessionId: input.sessionId,
      source: input.source,
      target: batchInput.target,
      goal: batchInput.goal,
      documentVersion: batchInput.snapshot.contentVersion,
      contentHash: batchInput.snapshot.contentHash,
      now: Date.now(),
    })
    const planned = applyEditTaskEvent(task, {
      type: 'plan_ready',
      batches: [batchInput.batchId],
      ...(batchInput.batchDetail
        ? { batchDetails: { [batchInput.batchId]: batchInput.batchDetail } }
        : {}),
      now: Date.now(),
    })
    const started = applyEditTaskEvent(planned, {
      type: 'task_started',
      now: Date.now(),
    })
    const running = applyEditTaskEvent(started, {
      type: 'batch_started',
      batchId: batchInput.batchId,
      now: Date.now(),
    })
    const next = manager.startTask(running)
    activeTask.value = next
    emit('task_started', next)
    emit('batch_started', next)
    return next
  }

  const appendRunningBatch = (batchInput: EditTaskSessionBatchInput): EditTask | null => {
    const current = manager.getActiveTask()
    if (!current || current.target.targetId !== batchInput.target.targetId) return null
    let base = current
    if (base.status === 'waiting_user') {
      base = applyEditTaskEvent(base, { type: 'task_resumed', now: Date.now() })
    }
    if (base.status === 'partially_applied') {
      const retryBatchId = base.activeBatchId
        || base.failedBatchIds[0]
        || base.pendingBatches[0]
      if (retryBatchId && retryBatchId !== batchInput.batchId) {
        base = applyEditTaskEvent(base, {
          type: 'batch_retry_requested',
          batchId: retryBatchId,
          now: Date.now(),
        })
      }
    }
    if (base.status === 'completed' || base.status === 'failed_before_write' || base.status === 'failed_after_write' || base.status === 'canceled') {
      return null
    }
    const planned = appendEditTaskPlanBatch(base, batchInput.batchId, Date.now(), batchInput.batchDetail)
    const started = applyEditTaskEvent(planned, {
      type: 'batch_started',
      batchId: batchInput.batchId,
      now: Date.now(),
    })
    const next = manager.updateTask(started)
    emit('batch_started', next)
    return next
  }

  const beginTask = (batchInput: EditTaskSessionBatchInput): EditTask => startBatch(batchInput)

  return {
    activeTask: () => activeTask.value,
    activeTaskRef: () => activeTask,
    busy: () => busy.value,
    resumeEditTask,
    ...buildEditTaskControlHandlers(manager, {
      onResume: task => emit('task_resumed', task),
      onCancel: task => emit('task_canceled', task),
    }),
    async startOrContinueBatch(batchInput, run, options) {
      if (busy.value) {
        return { ok: false, code: 'task_busy', message: '当前编辑任务正在执行批次' }
      }
      busy.value = true
      try {
        const activeTaskBefore = manager.getActiveTask()
        const canAppendToActiveTask = options?.multiBatch
          && activeTaskBefore
          && activeTaskBefore.target.targetId === batchInput.target.targetId
          && activeTaskBefore.status !== 'planning'
        const task = canAppendToActiveTask
          ? appendRunningBatch(batchInput)
          : startBatch(batchInput)
        if (!task) {
          return { ok: false, code: 'task_not_appendable', message: '当前编辑任务无法追加批次' }
        }
        const result = await run()
        // A batch that was canceled while awaiting its write result must not
        // be rewritten into a success lifecycle.
        const currentTask = manager.getTask(task.id)
        if (currentTask?.status === 'canceled') {
          activeTask.value = null
          return { ...result, ok: false, code: 'task_canceled', message: '编辑任务已取消' }
        }
        const updated = result.ok
          ? applyEditTaskEvent(task, {
            type: 'batch_succeeded',
            batchId: batchInput.batchId,
            documentVersion: result.documentVersion ?? batchInput.snapshot.contentVersion,
            contentHash: result.contentHash ?? batchInput.snapshot.contentHash,
            now: Date.now(),
          })
          : applyEditTaskEvent(task, {
            type: 'batch_failed',
            batchId: batchInput.batchId,
            failedIndexes: [],
            error: result.code || 'batch_failed',
            documentVersion: result.documentVersion ?? batchInput.snapshot.contentVersion,
            contentHash: result.contentHash ?? batchInput.snapshot.contentHash,
            applied: result.applied === true,
            now: Date.now(),
          })
        manager.updateTask(updated)
        const finalTask = options?.multiBatch
          ? updated
          : result.ok
            ? manager.finishTask(updated.id) || updated
            : updated
        emit(result.ok ? 'batch_succeeded' : 'batch_failed', finalTask)
        if (result.ok && !options?.multiBatch) emit('task_finished', finalTask)
        activeTask.value = manager.getActiveTask() || (isActiveTask(finalTask) ? finalTask : null)
        return result
      } finally {
        busy.value = false
      }
    },
    reset() {
      const current = manager.getActiveTask()
      if (current) {
        const canceled = manager.cancelTask(current.id)
        if (canceled) emit('task_canceled', canceled)
      } else {
        activeTask.value = null
      }
      busy.value = false
    },
    beginTask,
    finishActiveTask(options = {}) {
      const current = manager.getActiveTask()
      if (!current) return null
      if (!isActiveTask(current)) return null
      if (options.succeeded === false && options.summaryFailed) {
        const withWarnings = applyEditTaskEvent(current, {
          type: 'task_succeeded_with_warnings',
          now: Date.now(),
        })
        const next = manager.finishTaskWithWarnings(withWarnings.id) || withWarnings
        emit('task_succeeded_with_warnings', next)
        activeTask.value = manager.getActiveTask() || (isActiveTask(next) ? next : null)
        return next
      }
      const succeeded = options.succeeded !== false
      const finished = applyEditTaskEvent(current, {
        type: succeeded ? 'task_succeeded' : 'task_failed',
        now: Date.now(),
      })
      const next = succeeded
        ? manager.finishTask(finished.id) || finished
        : manager.finishTaskWithFailure(finished.id) || finished
      emit(succeeded ? 'task_finished' : 'task_failed', next)
      activeTask.value = manager.getActiveTask() || (isActiveTask(next) ? next : null)
      return next
    },
  }
}

export function editTaskSessionProgress(task: EditTask | null): string {
  if (!task) return ''
  const done = task.executedBatches.length
  const total = done + task.pendingBatches.length + task.failedBatchIds.length
  return total ? `${done}/${total}` : `${done}/${done}`
}

export function editTaskSessionBusy(session: EditTaskSession): boolean {
  return session.busy()
}

function isActiveTask(task: EditTask): boolean {
  return task.status === 'planning'
    || task.status === 'awaiting_batch'
    || task.status === 'running_batch'
    || task.status === 'partially_applied'
    || task.status === 'waiting_user'
}
