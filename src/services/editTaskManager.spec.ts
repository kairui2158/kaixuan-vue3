import { describe, expect, it, vi } from 'vitest'
import { createEditTask } from './editTaskService'
import { applyEditTaskEvent } from './editTaskService'
import {
  buildEditTaskControlHandlers,
  createEditTaskManager,
  getEditTaskManagerState,
} from './editTaskManager'

function task(now = 1000) {
  return createEditTask({
    sessionId: 'session-1',
    source: 'outline',
    target: { workspace: 'outline', targetId: 'outline' },
    goal: '整理大纲',
    documentVersion: 1,
    contentHash: 'hash-1',
    now,
  })
}

function activeTask(now = 1000) {
  return applyEditTaskEvent(
    applyEditTaskEvent(task(now), { type: 'task_started', now: now + 1 }),
    { type: 'plan_ready', batches: ['batch-1'], now: now + 2 },
  )
}

describe('editTaskManager', () => {
  it('tracks one active task per manager and exposes manager state', () => {
    const manager = createEditTaskManager()
    const active = task(1000)
    manager.startTask(active)

    expect(manager.getActiveTask()?.id).toBe(active.id)
    expect(getEditTaskManagerState(manager)).toMatchObject({
      status: 'active',
      task: { id: active.id },
    })
  })

  it('pauses, resumes, and cancels the active task', () => {
    const manager = createEditTaskManager()
    const active = manager.startTask(activeTask(1000))
    manager.pauseTask(active.id)

    expect(manager.getActiveTask()?.status).toBe('waiting_user')
    expect(getEditTaskManagerState(manager).status).toBe('paused')

    manager.resumeTask(active.id)
    expect(manager.getActiveTask()?.status).toBe('awaiting_batch')

    manager.cancelTask(active.id)
    expect(manager.getActiveTask()).toBeNull()
    expect(manager.getTask(active.id)?.status).toBe('canceled')
    expect(getEditTaskManagerState(manager)).toMatchObject({ status: 'canceled', task: { id: active.id } })
  })

  it('builds task control handlers used by the dialogue tool surface', async () => {
    const manager = createEditTaskManager()
    const active = manager.startTask(activeTask(1000))
    const onResume = vi.fn()
    const onCancel = vi.fn()
    const handlers = buildEditTaskControlHandlers(manager, { onResume, onCancel })

    const missing = await handlers.onResumeEditTask('missing-task')
    expect(missing.ok).toBe(false)
    expect(manager.getActiveTask()?.status).toBe('awaiting_batch')

    const resumed = await handlers.onResumeEditTask(active.id)
    expect(resumed).toMatchObject({ ok: true, data: { taskId: active.id, status: 'awaiting_batch' } })
    expect(onResume).toHaveBeenCalledWith(expect.objectContaining({ id: active.id }))

    const canceled = await handlers.onCancelEditTask(active.id)
    expect(canceled).toMatchObject({ ok: true, data: { taskId: active.id, status: 'canceled' } })
    expect(onCancel).toHaveBeenCalledWith(expect.objectContaining({ id: active.id }))

    const canceledResume = await handlers.onResumeEditTask(active.id)
    expect(canceledResume).toMatchObject({
      ok: false,
      error: { code: 'task_not_resumable' },
    })
    expect(manager.getTask(active.id)?.status).toBe('canceled')
  })

  it('moves a failed batch back to pending for a legal retry', () => {
    const manager = createEditTaskManager()
    const task = manager.startTask(activeTask(1000))
    const failed = applyEditTaskEvent(applyEditTaskEvent(task, {
      type: 'batch_started',
      batchId: 'batch-1',
      now: 1003,
    }), {
      type: 'batch_failed',
      batchId: 'batch-1',
      failedIndexes: [0],
      error: 'write_failed',
      documentVersion: 1,
      contentHash: 'hash-1',
      now: 1004,
    })
    manager.updateTask(failed)

    const retry = applyEditTaskEvent(manager.getTask(failed.id)!, {
      type: 'batch_retry_requested',
      batchId: 'batch-1',
      now: 1005,
    })

    expect(retry.status).toBe('awaiting_batch')
    expect(retry.pendingBatches).toEqual(['batch-1'])
    expect(retry.failedBatchIds).toEqual([])
  })
})
