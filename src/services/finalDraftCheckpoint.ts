import type { FinalDraftTask, FinalDraftTaskView } from './finalDraftService'
import { hashContent } from './finalDraftService'

export const FINAL_DRAFT_CHECKPOINT_SCHEMA_VERSION = 1

export interface FinalDraftCheckpointPayload {
  schemaVersion: number
  taskId: string
  destination: FinalDraftTask['destination']
  targetId: string
  sourceContent: string
  sourceContentHash: string
  instruction: string
  operation?: FinalDraftTask['operation']
  constraints: string[]
  protectedRanges: FinalDraftTask['protectedRanges']
  sourceSegments: FinalDraftTask['sourceSegments']
  segmentOrder: string[]
  activeSegmentIndex: number
  completedText: string
  accumulatedText: string
  continuationCount: number
  status: FinalDraftTask['status']
  lastTelemetry?: FinalDraftTask['lastTelemetry']
  lastStreamActivityAt?: number
  savedAt: number
}

export interface FinalDraftCheckpointStore {
  saveCheckpoint(payload: {
    checkpointId: string
    taskId: string
    payload: FinalDraftCheckpointPayload
    savedAt?: number
  }): Promise<{ ok: true; checkpointId: string; taskId: string; savedAt: number } | { ok: false; reason: string }>
  loadCheckpoint(checkpointId: string): Promise<{
    ok: true
    checkpoint: {
      checkpointId: string
      taskId: string
      payload: FinalDraftCheckpointPayload
      savedAt: number
    }
  } | { ok: false; reason: string }>
  listCheckpoints(): Promise<Array<{ checkpointId: string; taskId: string; savedAt: number }>>
}

const RESUMABLE_STATUSES = new Set<FinalDraftTask['status']>([
  'planning',
  'generating',
  'awaiting_continuation',
  'interrupted',
])

export function finalDraftCheckpointId(taskId: string): string {
  return `final-draft-${taskId}`
}

export function canResumeFinalDraftTask(task: FinalDraftTask): boolean {
  return task.status === 'awaiting_continuation'
    || (task.status === 'generating' && task.activeSegmentIndex > 0)
}

export function isFinalDraftTask(value: FinalDraftTask | FinalDraftTaskView | undefined | null): value is FinalDraftTask {
  return Boolean(
    value
    && typeof (value as FinalDraftTask).sourceContent === 'string'
    && Array.isArray((value as FinalDraftTask).sourceSegments)
    && typeof (value as FinalDraftTask).segmentOrder !== 'undefined'
  )
}

/**
 * Chat persistence stores only a slim task view. Continuation entry points use
 * this helper to recover the authoritative full task, preferring a legacy full
 * task for old sessions and checkpoint data for current sessions.
 */
export async function resolveFinalDraftTaskFromView(
  view: FinalDraftTask | FinalDraftTaskView | undefined | null,
  sourceContent: string,
  store: FinalDraftCheckpointStore,
): Promise<{ ok: true; task: FinalDraftTask } | { ok: false; reason: string }> {
  if (!view) return { ok: false, reason: 'checkpoint_not_found' }
  if (isFinalDraftTask(view)) return { ok: true, task: view }
  const loaded = await loadFinalDraftCheckpoint(finalDraftCheckpointId(view.taskId), store)
  if (!loaded.ok) return loaded
  return restoreFinalDraftTaskFromCheckpoint(loaded.checkpoint, sourceContent)
}

export function createInMemoryFinalDraftCheckpointStore(): FinalDraftCheckpointStore {
  const checkpoints = new Map<string, {
    checkpointId: string
    taskId: string
    payload: FinalDraftCheckpointPayload
    savedAt: number
  }>()
  return {
    async saveCheckpoint(request) {
      const savedAt = request.savedAt ?? Date.now()
      const record = {
        checkpointId: request.checkpointId,
        taskId: request.taskId,
        payload: request.payload,
        savedAt,
      }
      checkpoints.set(request.checkpointId, record)
      return { ok: true, checkpointId: request.checkpointId, taskId: request.taskId, savedAt }
    },
    async loadCheckpoint(checkpointId) {
      const record = checkpoints.get(checkpointId)
      if (!record) return { ok: false, reason: 'checkpoint_not_found' }
      return { ok: true, checkpoint: record }
    },
    async listCheckpoints() {
      return [...checkpoints.values()]
        .map(({ checkpointId, taskId, savedAt }) => ({ checkpointId, taskId, savedAt }))
        .sort((left, right) => right.savedAt - left.savedAt)
    },
  }
}

export async function saveFinalDraftCheckpoint(
  task: FinalDraftTask,
  store: FinalDraftCheckpointStore,
  now = Date.now(),
): Promise<{ ok: true; checkpointId: string; savedAt: number } | { ok: false; reason: string }> {
  const payload: FinalDraftCheckpointPayload = {
    schemaVersion: FINAL_DRAFT_CHECKPOINT_SCHEMA_VERSION,
    taskId: task.taskId,
    destination: task.destination,
    targetId: task.targetId,
    sourceContent: task.sourceContent,
    sourceContentHash: task.sourceContentHash,
    instruction: task.instruction,
    operation: task.operation,
    constraints: task.constraints,
    protectedRanges: task.protectedRanges,
    sourceSegments: task.sourceSegments,
    segmentOrder: task.segmentOrder,
    activeSegmentIndex: task.activeSegmentIndex,
    completedText: task.completedText,
    accumulatedText: task.accumulatedText,
    continuationCount: task.continuationCount,
    status: task.status,
    lastTelemetry: task.lastTelemetry,
    lastStreamActivityAt: task.lastStreamActivityAt,
    savedAt: now,
  }
  const result = await store.saveCheckpoint({
    checkpointId: finalDraftCheckpointId(task.taskId),
    taskId: task.taskId,
    payload,
    savedAt: now,
  })
  return result.ok
    ? { ok: true, checkpointId: result.checkpointId, savedAt: result.savedAt }
    : result
}

export async function loadFinalDraftCheckpoint(
  checkpointId: string,
  store: FinalDraftCheckpointStore,
): Promise<
  | {
      ok: true
      checkpoint: {
        checkpointId: string
        taskId: string
        payload: FinalDraftCheckpointPayload
        savedAt: number
      }
    }
  | { ok: false; reason: string }
> {
  return store.loadCheckpoint(checkpointId)
}

export function restoreFinalDraftTaskFromCheckpoint(
  checkpoint: { payload: FinalDraftCheckpointPayload } | null | undefined,
  sourceContent: string,
): { ok: true; task: FinalDraftTask } | { ok: false; reason: string } {
  const payload = checkpoint?.payload
  if (!payload) return { ok: false, reason: 'checkpoint_not_found' }
  if (payload.schemaVersion !== FINAL_DRAFT_CHECKPOINT_SCHEMA_VERSION) {
    return { ok: false, reason: 'schema_version_mismatch' }
  }
  if (!RESUMABLE_STATUSES.has(payload.status)) return { ok: false, reason: 'task_not_resumable' }
  if (hashContent(payload.sourceContent) !== payload.sourceContentHash) {
    return { ok: false, reason: 'checkpoint_corrupted' }
  }
  if (hashContent(sourceContent) !== payload.sourceContentHash) {
    return { ok: false, reason: 'source_content_mismatch' }
  }
  return {
    ok: true,
    task: {
      taskId: payload.taskId,
      destination: payload.destination,
      targetId: payload.targetId,
      instruction: payload.instruction,
      operation: payload.operation,
      constraints: payload.constraints,
      protectedRanges: payload.protectedRanges,
      sourceContent: payload.sourceContent,
      sourceSegments: payload.sourceSegments,
      segmentOrder: payload.segmentOrder,
      activeSegmentIndex: payload.activeSegmentIndex,
      completedText: payload.completedText,
      accumulatedText: payload.accumulatedText,
      continuationCount: payload.continuationCount,
      status: payload.status,
      lastTelemetry: payload.lastTelemetry,
      lastStreamActivityAt: payload.lastStreamActivityAt,
      sourceContentHash: payload.sourceContentHash,
      createdAt: payload.savedAt,
      updatedAt: payload.savedAt,
    },
  }
}
