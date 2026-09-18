import type { EditorEditBatchCommand, EditorEditCommand, EditorEditFailureReason } from './editorEditProtocol'
import { buildEditPlan, type EditPlan } from './editorEditService'
import { createEditorTargetSnapshot, validateEditorTarget, type EditorTargetSnapshot } from './editorTarget'
import {
  diagnoseEditorEditBatch,
  remapEditorEditDiagnostics,
  type EditorEditBatchDiagnostics
} from './editorEditDiagnostics'

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
  diagnostics?: EditorEditBatchDiagnostics
}

function batchDiagnostics(
  batch: EditorEditBatchCommand,
  target: EditorTargetSnapshot,
  reason: EditorEditFailureReason
): EditorEditBatchDiagnostics {
  return diagnoseEditorEditBatch({
    commands: batch.commands,
    content: target.content,
    selectedText: target.selectedText,
    failureReason: reason === 'version_changed' || reason === 'locked'
      ? reason
      : reason === 'selection_missing'
        ? 'selection_missing'
        : undefined
  })
}

function diagnoseCommandFailure(
  command: EditorEditCommand,
  target: EditorTargetSnapshot,
  reason: EditorEditFailureReason
): EditorEditBatchDiagnostics {
  return diagnoseEditorEditBatch({
    commands: [command],
    content: target.content,
    selectedText: target.selectedText,
    failureReason: reason === 'selection_missing' ? 'selection_missing' : reason === 'content_too_large' ? 'content_too_large' : undefined
  })
}

export function planEditorEditBatch(
  batch: EditorEditBatchCommand,
  target: EditorTargetSnapshot,
  current: { content: string; locked?: boolean },
  options: { batchId?: string } = {}
): EditorEditBatchPlan {
  const failed = (reason: EditorEditFailureReason): EditorEditBatchPlan => ({
    ok: false,
    batchId: options.batchId || createBatchId(),
    snapshot: target,
    original: target.content,
    next: target.content,
    items: [],
    failureReason: reason,
    reason: batch.reason,
    diagnostics: batchDiagnostics(batch, target, reason),
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
    if (!plan.ok) {
      const commandFailure = plan.failureReason || 'invalid_command'
      const diagnostics = remapEditorEditDiagnostics({
        diagnostics: diagnoseCommandFailure(command, workingTarget, commandFailure),
        commandIndex: index,
        succeededIndexes: items.map(item => item.index),
        commandCount: batch.commands.length
      })
      return {
        ...failed(commandFailure),
        diagnostics
      }
    }
    working = plan.next
    items.push({ index, command, plan })
  }

  return {
    ok: true,
    batchId: options.batchId || createBatchId(),
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
  }, { batchId: batchPlan.batchId })
}

/**
 * Rebuilds a failed proposal by keeping commands that passed locating and
 * replacing failed slots with model-repaired commands. The merged batch is
 * fully revalidated; repairs never bypass uniqueness or version checks.
 */
export function mergeRetriedCommands(
  originalBatch: EditorEditBatchCommand,
  succeededIndexes: number[],
  retriedCommands: EditorEditCommand[],
  target: EditorTargetSnapshot,
  current: { content: string; locked?: boolean },
  options: { batchId?: string } = {}
): EditorEditBatchPlan {
  const originalCommands = originalBatch.commands || []
  const kept = new Set(succeededIndexes)
  const failedIndexes = originalCommands
    .map((_, index) => index)
    .filter(index => !kept.has(index))

  if (
    kept.size > originalCommands.length ||
    [...kept].some(index => index < 0 || index >= originalCommands.length) ||
    retriedCommands.length !== failedIndexes.length
  ) {
    const diagnostics = diagnoseEditorEditBatch({
      commands: originalCommands,
      content: target.content,
      selectedText: target.selectedText,
      failureReason: 'invalid_command'
    })
    return {
      ok: false,
      batchId: options.batchId || createBatchId(),
      snapshot: target,
      original: target.content,
      next: target.content,
      items: [],
      failureReason: 'invalid_command',
      reason: originalBatch.reason,
      diagnostics: {
        ...diagnostics,
        summary: `重提命令数量不匹配：原批次 ${originalCommands.length} 条，保留 ${kept.size} 条，重提 ${retriedCommands.length} 条，需重提 ${failedIndexes.length} 条。`
      }
    }
  }

  let retryCursor = 0
  const commands = originalCommands.map((command, index) => {
    if (kept.has(index)) return command
    return retriedCommands[retryCursor++]
  })

  return planEditorEditBatch({
    ...originalBatch,
    commands,
    reason: originalBatch.reason
      ? `${originalBatch.reason}（已修正失败条目并重新校验）`
      : '已修正失败条目并重新校验'
  }, target, current, options)
}

let batchSequence = 0

export function createBatchId(): string {
  batchSequence += 1
  return `ai-edit-${Date.now().toString(36)}-${batchSequence.toString(36)}`
}
