import { describe, expect, it } from 'vitest'
import {
  applyEditTaskEvent,
  appendEditTaskPlanBatch,
  createEditTask,
  EDIT_TASK_TRANSITIONS,
  verifyEditTaskCheckpoint,
  type EditTask,
} from './editTaskService'

function taskWithStatus(status: EditTask['status']): EditTask {
  const task = createEditTask({
    sessionId: 'session-1',
    source: 'outline',
    target: { workspace: 'outline', targetId: 'outline' },
    goal: '整理整篇大纲',
    documentVersion: 1,
    contentHash: 'hash-1',
    now: 1000,
  })
  return { ...task, status }
}

describe('EditTask state machine', () => {
  it('creates a task with planning state and a stable task_start checkpoint', () => {
    const task = createEditTask({
      sessionId: 'session-1',
      source: 'outline',
      target: { workspace: 'outline', targetId: 'outline' },
      goal: '整理整篇大纲',
      documentVersion: 1,
      contentHash: 'hash-1',
      now: 1000,
    })

    expect(task.status).toBe('planning')
    expect(task.plan).toEqual({ goal: '整理整篇大纲', batches: [], batchDetails: {} })
    expect(task.checkpoints).toHaveLength(1)
    expect(task.checkpoints[0].reason).toBe('task_start')
  })

  it('binds planner segment metadata to each batch in the plan', () => {
    const task = createEditTask({
      sessionId: 'session-1',
      source: 'outline',
      target: { workspace: 'outline', targetId: 'outline' },
      goal: '整理整篇大纲',
      documentVersion: 1,
      contentHash: 'hash-1',
      now: 1000,
    })
    const planned = applyEditTaskEvent(task, {
      type: 'plan_ready',
      batches: ['batch-1'],
      batchDetails: {
        'batch-1': {
          segmentId: 'segment-0002',
          expectedChange: 'reorder-only',
          invariantResult: 'structure-preserved',
        },
      },
      now: 1200,
    })
    const started = applyEditTaskEvent(planned, {
      type: 'task_started',
      now: 1100,
    })
    const appended = appendEditTaskPlanBatch(planned, 'batch-2', 1300, {
      segmentId: 'segment-0003',
      expectedChange: 'punctuation-only',
      invariantResult: 'content-unchanged',
    })
    const duplicate = appendEditTaskPlanBatch(appended, 'batch-2', 1400, {
      segmentId: 'segment-9999',
      expectedChange: 'should-not-replace',
    })

    expect(appended.plan.batches).toEqual(['batch-1', 'batch-2'])
    expect(appended.plan.batchDetails).toEqual({
      'batch-1': {
        segmentId: 'segment-0002',
        expectedChange: 'reorder-only',
        invariantResult: 'structure-preserved',
      },
      'batch-2': {
        segmentId: 'segment-0003',
        expectedChange: 'punctuation-only',
        invariantResult: 'content-unchanged',
      },
    })
    expect(duplicate).toBe(appended)
  })

  it('allows the planning-to-execution lifecycle', () => {
    const started = applyEditTaskEvent(taskWithStatus('planning'), {
      type: 'task_started',
      now: 1100,
    })
    const batch = applyEditTaskEvent(started, {
      type: 'batch_started',
      batchId: 'batch-1',
      now: 1200,
    })
    const finishedBatch = applyEditTaskEvent(batch, {
      type: 'batch_succeeded',
      batchId: 'batch-1',
      documentVersion: 2,
      contentHash: 'hash-2',
      now: 1300,
    })
    const finished = applyEditTaskEvent(finishedBatch, {
      type: 'task_succeeded',
      now: 1400,
    })

    expect(started.status).toBe('awaiting_batch')
    expect(batch.status).toBe('running_batch')
    expect(batch.activeBatchId).toBe('batch-1')
    expect(finishedBatch.status).toBe('awaiting_batch')
    expect(finishedBatch.executedBatches).toEqual(['batch-1'])
    expect(finishedBatch.checkpoints.at(-1)?.reason).toBe('after_batch')
    expect(finished.status).toBe('completed')
  })

  it('records partial application instead of collapsing it into a generic failure', () => {
    const running = taskWithStatus('running_batch')
    const partial = applyEditTaskEvent(running, {
      type: 'batch_failed',
      batchId: 'batch-2',
      failedIndexes: [4],
      error: 'target_not_found',
      documentVersion: 3,
      contentHash: 'hash-3',
      now: 1500,
    })

    expect(partial.status).toBe('partially_applied')
    expect(partial.failedBatchIds).toEqual(['batch-2'])
    expect(partial.activeBatchId).toBe('batch-2')
    expect(partial.checkpoints.at(-1)?.documentVersion).toBe(3)
  })

  it('records a no-write batch failure as failed_before_write', () => {
    const running = taskWithStatus('running_batch')
    const failed = applyEditTaskEvent(running, {
      type: 'batch_failed',
      batchId: 'batch-3',
      failedIndexes: [0],
      error: 'integrity_failed',
      documentVersion: 3,
      contentHash: 'hash-3',
      applied: false,
      now: 1500,
    })

    expect(failed.status).toBe('failed_before_write')
    expect(failed.failedBatchIds).toEqual(['batch-3'])
    expect(failed.activeBatchId).toBe('batch-3')
    expect(failed.checkpoints.at(-1)?.reason).toBe('task_start')
  })

  it('moves a partially applied task to waiting_user and resumes it', () => {
    const waiting = applyEditTaskEvent(taskWithStatus('partially_applied'), {
      type: 'task_paused',
      now: 1600,
    })
    const resumed = applyEditTaskEvent(waiting, {
      type: 'task_resumed',
      now: 1700,
    })

    expect(waiting.status).toBe('waiting_user')
    expect(resumed.status).toBe('awaiting_batch')
  })

  it('keeps write failure semantics separate from pre-write failure', () => {
    const afterWrite = applyEditTaskEvent(taskWithStatus('partially_applied'), {
      type: 'task_failed',
      now: 1800,
    })
    const beforeWrite = applyEditTaskEvent(taskWithStatus('planning'), {
      type: 'task_failed',
      now: 1900,
    })

    expect(afterWrite.status).toBe('failed_after_write')
    expect(beforeWrite.status).toBe('failed_before_write')
  })

  it('rejects invalid transitions and returns the task unchanged', () => {
    const task = taskWithStatus('completed')
    const result = applyEditTaskEvent(task, {
      type: 'task_resumed',
      now: 2000,
    })

    expect(result).toBe(task)
    expect(EDIT_TASK_TRANSITIONS.completed).not.toContain('awaiting_batch')
  })

  it('verifies checkpoint identity before a resume can write', () => {
    const task = createEditTask({
      sessionId: 'session-1',
      source: 'outline',
      target: { workspace: 'outline', targetId: 'outline' },
      goal: '整理整篇大纲',
      documentVersion: 1,
      contentHash: 'hash-1',
      now: 1000,
    })
    const checkpointId = task.checkpoints[0].id

    const valid = verifyEditTaskCheckpoint(task, checkpointId, {
      documentVersion: 1,
      contentHash: 'hash-1',
    })
    const versionMismatch = verifyEditTaskCheckpoint(task, checkpointId, {
      documentVersion: 2,
      contentHash: 'hash-1',
    })
    const hashMismatch = verifyEditTaskCheckpoint(task, checkpointId, {
      documentVersion: 1,
      contentHash: 'hash-2',
    })
    const missing = verifyEditTaskCheckpoint(task, 'missing-checkpoint', {
      documentVersion: 1,
      contentHash: 'hash-1',
    })

    expect(valid.valid).toBe(true)
    expect(valid.checkpoint?.id).toBe(checkpointId)
    expect(versionMismatch).toMatchObject({ valid: false, reason: 'document_version_mismatch' })
    expect(hashMismatch).toMatchObject({ valid: false, reason: 'content_hash_mismatch' })
    expect(missing).toMatchObject({ valid: false, reason: 'checkpoint_not_found' })
  })
})
