import type { EditorEditBatchCommand, EditorEditCommand, EditorEditFailureReason } from './editorEditProtocol'
import { buildEditPlan, type EditPlan } from './editorEditService'
import { createEditorTargetSnapshot, validateEditorTarget, type EditorTargetSnapshot } from './editorTarget'

export interface StagedEditItem {
  index: number
  command: EditorEditCommand
  plan: EditPlan
}

export interface EditorEditBatchPlan {
  ok: boolean
  batchId: string
  snapshot: EditorTargetSnapshot
  original: string
  next: string
  items: StagedEditItem[]
  failureReason?: EditorEditFailureReason
  reason?: string
}

export function planEditorEditBatch(
  batch: EditorEditBatchCommand,
  target: EditorTargetSnapshot,
  current: { content: string; locked?: boolean }
): EditorEditBatchPlan {
  const failed = (reason: EditorEditFailureReason): EditorEditBatchPlan => ({
    ok: false,
    batchId: createBatchId(),
    snapshot: target,
    original: target.content,
    next: target.content,
    items: [],
    failureReason: reason,
    reason: batch.reason,
  })

  const validation = validateEditorTarget(target, current)
  if (!validation.valid) return failed(validation.reason)

  if (batch.target) {
    if (batch.target.workspace !== target.workspace || batch.target.targetId !== target.targetId) {
      return failed('invalid_command')
    }
    if (batch.target.contentVersion !== target.contentVersion) return failed('version_changed')
  }

  let working = target.content
  const items: StagedEditItem[] = []
  for (let index = 0; index < batch.commands.length; index++) {
    const command = batch.commands[index]
    const workingTarget = createEditorTargetSnapshot({
      workspace: target.workspace,
      targetId: target.targetId,
      label: target.label,
      chapterId: target.chapterId,
      mode: target.mode,
      content: working,
      selectionStart: target.selectionStart,
      selectionEnd: target.selectionEnd,
    })
    const plan = buildEditPlan(workingTarget, command, { content: working, locked: current.locked })
    if (!plan.ok) return failed(plan.failureReason || 'invalid_command')
    working = plan.next
    items.push({ index, command, plan })
  }

  return {
    ok: true,
    batchId: createBatchId(),
    snapshot: target,
    original: target.content,
    next: working,
    items,
    reason: batch.reason,
  }
}

/**
 * Replans from the original snapshot with only accepted commands. Ranges then
 * describe the final document, so UI navigation and undo stay coherent after a
 * user rejects individual items.
 */
export function applyAcceptedItems(
  batchPlan: EditorEditBatchPlan,
  acceptedIndexes: number[]
): EditorEditBatchPlan {
  const accepted = new Set(acceptedIndexes)
  const commands = batchPlan.items
    .filter(item => accepted.has(item.index))
    .map(item => item.command)
  const batch: EditorEditBatchCommand = {
    type: 'editor_edit_batch',
    version: 1,
    commands,
    reason: batchPlan.reason,
  }
  return planEditorEditBatch(batch, batchPlan.snapshot, {
    content: batchPlan.snapshot.content,
  })
}

let batchSequence = 0

function createBatchId(): string {
  batchSequence += 1
  return `ai-edit-${Date.now().toString(36)}-${batchSequence.toString(36)}`
}
