import type { EditorEditBatchCommand } from './editorEditProtocol'
import { hashEditorContent } from './editorTarget'
import type { DialogueBatchEvent, DialogueBatchEventName } from './dialogueFoundation'

export type EditorBatchStatus =
  | 'pending'
  | 'applied'
  | 'expired'
  | 'rejected'
  | 'version_changed'
  | 'locked'
  | 'rolled_back'

export interface EditorBatchRecord {
  version: 1
  batchId: string
  workspace: 'main' | 'outline'
  targetId: string
  status: EditorBatchStatus
  commandCount: number
  reason?: string
  createdAt: number
  updatedAt: number
  sourceContentHash: string
  appliedContentHash?: string
  acceptedIndexes?: number[]
  rejectedIndexes?: number[]
  appliedAt?: number
  rolledBackAt?: number
  undoAvailable?: boolean
  statusHistory?: Array<{
    fromStatus: EditorBatchStatus
    toStatus: EditorBatchStatus
    reason?: string
    recordedAt: number
  }>
}

export interface CreateEditorBatchRecordInput {
  workspace: 'main' | 'outline'
  targetId: string
  batch: EditorEditBatchCommand
  sourceContent: string
  batchId?: string
}

const statuses = new Set<EditorBatchStatus>([
  'pending',
  'applied',
  'expired',
  'rejected',
  'version_changed',
  'locked',
  'rolled_back'
])

const terminalStatuses = new Set<EditorBatchStatus>([
  'applied',
  'expired',
  'rejected',
  'version_changed',
  'locked',
  'rolled_back'
])

/**
 * Batch confirmation state machine. A terminal state is immutable, so a second
 * apply/cancel event can never flip an already decided batch.
 */
export function transitionEditorBatchRecord(
  record: EditorBatchRecord,
  status: Extract<EditorBatchStatus, 'applied' | 'expired' | 'rejected'>
): EditorBatchRecord {
  if (record.status !== 'pending') return record
  return updateEditorBatchRecord(record, { status })
}

export function createEditorBatchRecord(input: CreateEditorBatchRecordInput): EditorBatchRecord {
  const now = Date.now()
  return {
    version: 1,
    batchId: input.batchId || createRecordBatchId(),
    workspace: input.workspace,
    targetId: input.targetId,
    status: 'pending',
    commandCount: input.batch.commands.length,
    reason: input.batch.reason,
    createdAt: now,
    updatedAt: now,
    sourceContentHash: hashEditorContent(input.sourceContent)
  }
}

export function updateEditorBatchRecord(
  record: EditorBatchRecord,
  patch: Partial<Omit<EditorBatchRecord, 'version' | 'batchId' | 'workspace' | 'targetId' | 'createdAt'>>
): EditorBatchRecord {
  const statusHistory = patch.status && patch.status !== record.status
    ? [...(record.statusHistory || []), {
        fromStatus: record.status,
        toStatus: patch.status,
        reason: patch.reason || record.reason,
        recordedAt: Date.now()
      }]
    : record.statusHistory
  return {
    ...record,
    ...patch,
    statusHistory,
    version: 1,
    batchId: record.batchId,
    workspace: record.workspace,
    targetId: record.targetId,
    createdAt: record.createdAt,
    updatedAt: Date.now()
  }
}

export function normalizeEditorBatchRecord(raw: unknown): EditorBatchRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const value = raw as Partial<EditorBatchRecord>
  if (value.version !== 1) return null
  if (typeof value.batchId !== 'string' || !value.batchId) return null
  if (value.workspace !== 'main' && value.workspace !== 'outline') return null
  if (typeof value.targetId !== 'string' || !value.targetId) return null
  if (!statuses.has(value.status as EditorBatchStatus)) return null
  if (typeof value.commandCount !== 'number' || value.commandCount < 1) return null
  if (typeof value.sourceContentHash !== 'string' || !value.sourceContentHash) return null

  return {
    version: 1,
    batchId: value.batchId,
    workspace: value.workspace,
    targetId: value.targetId,
    status: value.status as EditorBatchStatus,
    commandCount: value.commandCount,
    reason: typeof value.reason === 'string' ? value.reason : undefined,
    createdAt: Number(value.createdAt) || Date.now(),
    updatedAt: Number(value.updatedAt) || Date.now(),
    sourceContentHash: value.sourceContentHash,
    appliedContentHash: typeof value.appliedContentHash === 'string' ? value.appliedContentHash : undefined,
    acceptedIndexes: Array.isArray(value.acceptedIndexes) ? value.acceptedIndexes.filter(index => Number.isInteger(index)) : undefined,
    rejectedIndexes: Array.isArray(value.rejectedIndexes) ? value.rejectedIndexes.filter(index => Number.isInteger(index)) : undefined,
    appliedAt: Number(value.appliedAt) || undefined,
    rolledBackAt: Number(value.rolledBackAt) || undefined,
    undoAvailable: value.undoAvailable === true,
    statusHistory: Array.isArray(value.statusHistory)
      ? value.statusHistory.filter(item => item && statuses.has(item.fromStatus as EditorBatchStatus) && statuses.has(item.toStatus as EditorBatchStatus) && typeof item.recordedAt === 'number')
      : undefined
  }
}

export function canRollbackEditorBatch(record: EditorBatchRecord, currentContent: string): boolean {
  return record.status === 'applied'
    && record.undoAvailable === true
    && !!record.appliedContentHash
    && record.appliedContentHash === hashEditorContent(currentContent)
}

export function findEditorBatchUndoContent(
  undoStack: string[],
  record: EditorBatchRecord
): { content: string; consumed: number } | null {
  for (let index = undoStack.length - 1; index >= 0; index--) {
    if (hashEditorContent(undoStack[index]) === record.sourceContentHash) {
      return { content: undoStack[index], consumed: undoStack.length - index }
    }
  }
  return null
}

/**
 * 转成统一对话批次事件。UI 与存储继续保留完整批次记录；
 * 运行记录和跨入口消费者只消费这里的标准事件。
 */
export function toDialogueBatchEvent(
  record: EditorBatchRecord,
  status: DialogueBatchEventName,
  reason?: string,
): DialogueBatchEvent {
  return {
    version: 1,
    batchId: record.batchId,
    workspace: record.workspace,
    targetId: record.targetId,
    status,
    commandCount: record.commandCount,
    reason: reason || record.reason,
    occurredAt: Date.now(),
  }
}

let recordSequence = 0

function createRecordBatchId(): string {
  recordSequence += 1
  return `ai-batch-${Date.now().toString(36)}-${recordSequence.toString(36)}`
}
