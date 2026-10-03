export type EditTaskStatus =
  | 'planning'
  | 'awaiting_batch'
  | 'running_batch'
  | 'partially_applied'
  | 'waiting_user'
  | 'completed'
  | 'completed_with_warnings'
  | 'failed_before_write'
  | 'failed_after_write'
  | 'canceled'

export interface EditTaskPlan {
  goal: string
  batches: string[]
  batchDetails?: Record<string, EditTaskBatchDetail>
}

export interface EditTaskBatchDetail {
  segmentId: string
  expectedChange: string
  invariantResult?: string
  range?: { startLine: number; endLine: number }
  writeStrategy?: string
}

export interface EditTaskBatchCommandSnapshot {
  batchId: string
  operation: string
  target?: string
  content?: string
  order?: string[]
  destination?: string
  reason?: string
  batchDetail?: EditTaskBatchDetail
}

export interface EditTaskCheckpoint {
  id: string
  documentVersion: number
  contentHash: string
  createdAt: number
  reason: 'task_start' | 'before_batch' | 'after_batch'
}

export interface EditTask {
  id: string
  sessionId: string
  source: 'outline' | 'editor' | 'pipeline'
  target: { workspace: string; targetId: string }
  goal: string
  plan: EditTaskPlan
  activeBatchId?: string
  executedBatches: string[]
  pendingBatches: string[]
  failedBatchIds: string[]
  batchCommandSnapshots?: Record<string, EditTaskBatchCommandSnapshot[]>
  checkpoints: EditTaskCheckpoint[]
  status: EditTaskStatus
  createdAt: number
  updatedAt: number
}

export type EditTaskEvent =
  | { type: 'task_started'; now: number }
  | {
      type: 'plan_ready'
      batches: string[]
      batchDetails?: Record<string, EditTaskBatchDetail>
      now: number
    }
  | { type: 'batch_started'; batchId: string; now: number }
  | {
      type: 'batch_succeeded'
      batchId: string
      documentVersion: number
      contentHash: string
      now: number
    }
  | {
      type: 'batch_failed'
      batchId: string
      failedIndexes: number[]
      error: string
      documentVersion: number
      contentHash: string
      applied?: boolean
      now: number
    }
  | { type: 'task_paused'; now: number }
  | { type: 'task_resumed'; now: number }
  | {
      type: 'batch_retry_requested'
      batchId: string
      now: number
    }
  | { type: 'task_succeeded'; now: number }
  | { type: 'task_succeeded_with_warnings'; now: number }
  | { type: 'task_failed'; now: number }
  | { type: 'task_canceled'; now: number }

export const EDIT_TASK_TRANSITIONS: Record<EditTaskStatus, EditTaskStatus[]> = {
  planning: ['awaiting_batch', 'waiting_user', 'failed_before_write', 'canceled'],
  awaiting_batch: ['running_batch', 'partially_applied', 'waiting_user', 'completed', 'completed_with_warnings', 'failed_before_write', 'failed_after_write', 'canceled'],
  running_batch: ['awaiting_batch', 'partially_applied', 'waiting_user', 'failed_before_write', 'failed_after_write', 'canceled'],
  partially_applied: ['awaiting_batch', 'waiting_user', 'completed', 'completed_with_warnings', 'failed_after_write', 'canceled'],
  waiting_user: ['awaiting_batch', 'running_batch', 'partially_applied', 'failed_after_write', 'canceled'],
  completed: [],
  completed_with_warnings: [],
  failed_before_write: [],
  failed_after_write: [],
  canceled: [],
}

let taskCounter = 0
let checkpointCounter = 0

export function createEditTask(input: {
  sessionId: string
  source: EditTask['source']
  target: EditTask['target']
  goal: string
  documentVersion: number
  contentHash: string
  now: number
}): EditTask {
  taskCounter += 1
  checkpointCounter += 1
  return {
    id: `edit-task-${input.now}-${taskCounter}`,
    sessionId: input.sessionId,
    source: input.source,
    target: input.target,
    goal: input.goal,
    plan: { goal: input.goal, batches: [], batchDetails: {} },
    executedBatches: [],
    pendingBatches: [],
    failedBatchIds: [],
    batchCommandSnapshots: {},
    checkpoints: [
      {
        id: `checkpoint-${input.now}-${checkpointCounter}`,
        documentVersion: input.documentVersion,
        contentHash: input.contentHash,
        createdAt: input.now,
        reason: 'task_start',
      },
    ],
    status: 'planning',
    createdAt: input.now,
    updatedAt: input.now,
  }
}

export function applyEditTaskEvent(task: EditTask, event: EditTaskEvent): EditTask {
  const next = reduceEditTask(task, event)
  if (next === task) return next
  return { ...next, updatedAt: event.now }
}

export function appendEditTaskPlanBatch(
  task: EditTask,
  batchId: string,
  now: number,
  detail?: EditTaskBatchDetail,
): EditTask {
  if (task.plan.batches.includes(batchId) || task.executedBatches.includes(batchId)) {
    return task
  }
  return {
    ...task,
    plan: {
      ...task.plan,
      batches: [...task.plan.batches, batchId],
      ...(detail ? { batchDetails: { ...(task.plan.batchDetails || {}), [batchId]: detail } } : {}),
    },
    pendingBatches: task.pendingBatches.includes(batchId)
      ? task.pendingBatches
      : [...task.pendingBatches, batchId],
    updatedAt: now,
  }
}

export function recordEditTaskBatchCommands(
  task: EditTask,
  batchId: string,
  commands: EditTaskBatchCommandSnapshot[],
): EditTask {
  if (!commands.length) return task
  return {
    ...task,
    batchCommandSnapshots: {
      ...(task.batchCommandSnapshots || {}),
      [batchId]: commands,
    },
  }
}

export function verifyEditTaskCheckpoint(
  task: EditTask,
  checkpointId: string,
  expected: { documentVersion: number; contentHash: string },
): { valid: boolean; checkpoint?: EditTaskCheckpoint; reason?: string } {
  const checkpoint = task.checkpoints.find(item => item.id === checkpointId)
  if (!checkpoint) {
    return { valid: false, reason: 'checkpoint_not_found' }
  }
  if (checkpoint.documentVersion !== expected.documentVersion) {
    return { valid: false, checkpoint, reason: 'document_version_mismatch' }
  }
  if (checkpoint.contentHash !== expected.contentHash) {
    return { valid: false, checkpoint, reason: 'content_hash_mismatch' }
  }
  return { valid: true, checkpoint }
}

function reduceEditTask(task: EditTask, event: EditTaskEvent): EditTask {
  switch (event.type) {
    case 'plan_ready':
      if (task.status !== 'planning') return task
      return {
        ...task,
        plan: {
          goal: task.goal,
          batches: event.batches,
          batchDetails: {
            ...(task.plan.batchDetails || {}),
            ...(event.batchDetails || {}),
          },
        },
        pendingBatches: event.batches,
        updatedAt: event.now,
      }
    case 'task_started':
      return transition(task, 'planning', 'awaiting_batch', event.now)
    case 'batch_started': {
      const started = transition(task, 'awaiting_batch', 'running_batch', event.now, {
        activeBatchId: event.batchId,
      })
      return {
        ...started,
        pendingBatches: started.pendingBatches.filter(batchId => batchId !== event.batchId),
      }
    }
    case 'batch_succeeded': {
      const finished = transition(task, 'running_batch', 'awaiting_batch', event.now, {
        activeBatchId: undefined,
      })
      return appendCheckpointAfterBatch({
        ...finished,
        executedBatches: [...finished.executedBatches, event.batchId],
      }, event)
    }
    case 'batch_failed': {
      if (event.applied === false) {
        const failed = transition(task, 'running_batch', 'failed_before_write', event.now)
        return {
          ...failed,
          activeBatchId: event.batchId,
          failedBatchIds: [...failed.failedBatchIds, event.batchId],
        }
      }
      const partiallyApplied = transition(task, 'running_batch', 'partially_applied', event.now)
      return appendCheckpointAfterBatch({
        ...partiallyApplied,
        activeBatchId: event.batchId,
        failedBatchIds: [...partiallyApplied.failedBatchIds, event.batchId],
      }, event)
    }
    case 'task_paused':
      return transition(task, ['partially_applied', 'awaiting_batch'], 'waiting_user', event.now)
    case 'task_resumed':
      return transition(task, 'waiting_user', 'awaiting_batch', event.now)
    case 'batch_retry_requested': {
      const retrying = transition(task, 'partially_applied', 'awaiting_batch', event.now, {
        activeBatchId: event.batchId,
        failedBatchIds: task.failedBatchIds.filter(batchId => batchId !== event.batchId),
      })
      return {
        ...retrying,
        pendingBatches: retrying.pendingBatches.includes(event.batchId)
          ? retrying.pendingBatches
          : [event.batchId, ...retrying.pendingBatches],
      }
    }
    case 'task_succeeded':
      return transition(
        task,
        ['awaiting_batch', 'partially_applied', 'running_batch', 'waiting_user'],
        'completed',
        event.now,
        { activeBatchId: undefined },
      )
    case 'task_succeeded_with_warnings':
      return transition(
        task,
        ['awaiting_batch', 'partially_applied', 'running_batch', 'waiting_user'],
        'completed_with_warnings',
        event.now,
        { activeBatchId: undefined },
      )
    case 'task_failed': {
      const nextStatus = taskHasWrites(task) ? 'failed_after_write' : 'failed_before_write'
      return transition(task, task.status, nextStatus, event.now)
    }
    case 'task_canceled':
      return transition(task, task.status, 'canceled', event.now)
    default:
      return task
  }
}

function transition(
  task: EditTask,
  from: EditTaskStatus | EditTaskStatus[],
  to: EditTaskStatus,
  now: number,
  patch: Partial<EditTask> = {},
): EditTask {
  const allowedFrom = Array.isArray(from) ? from : [from]
  const transitionAllowed = EDIT_TASK_TRANSITIONS[task.status].includes(to)
  if (!allowedFrom.includes(task.status) || !transitionAllowed) {
    return task
  }
  return { ...task, ...patch, status: to, updatedAt: now }
}

function appendCheckpointAfterBatch(
  task: EditTask,
  event: { documentVersion: number; contentHash: string; now: number },
): EditTask {
  const lastCheckpoint = task.checkpoints[task.checkpoints.length - 1]
  const isSameDocumentState = lastCheckpoint
    && lastCheckpoint.documentVersion === event.documentVersion
    && lastCheckpoint.contentHash === event.contentHash
  if (isSameDocumentState) return task
  checkpointCounter += 1
  return {
    ...task,
    checkpoints: [
      ...task.checkpoints,
      {
        id: `checkpoint-${event.now}-${checkpointCounter}`,
        documentVersion: event.documentVersion,
        contentHash: event.contentHash,
        createdAt: event.now,
        reason: 'after_batch',
      },
    ],
  }
}

function taskHasWrites(task: EditTask): boolean {
  return (
    task.status === 'partially_applied' ||
    task.executedBatches.length > 0 ||
    task.failedBatchIds.length > 0 ||
    task.activeBatchId !== undefined
  )
}
