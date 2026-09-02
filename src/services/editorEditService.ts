import type { EditorEditCommand, EditorEditFailureReason } from './editorEditProtocol'
import { validateEditorTarget, type EditorTargetSnapshot } from './editorTarget'

export interface EditPlan {
  ok: boolean
  operation: EditorEditCommand['operation']
  original: string
  next: string
  range: { start: number; end: number }
  failureReason?: EditorEditFailureReason
  reason?: string
}

function failed(
  command: EditorEditCommand,
  target: EditorTargetSnapshot,
  reason: EditorEditFailureReason
): EditPlan {
  return {
    ok: false,
    operation: command.operation,
    original: target.content,
    next: target.content,
    range: { start: 0, end: 0 },
    failureReason: reason,
    reason: command.reason
  }
}

/**
 * Pure planning layer. It never touches DOM or Pinia; callers own the store,
 * undo stack, save semantics, and user confirmation.
 */
export function buildEditPlan(
  target: EditorTargetSnapshot,
  command: EditorEditCommand,
  current: { content: string; locked?: boolean }
): EditPlan {
  const validation = validateEditorTarget(target, current)
  if (!validation.valid) {
    return failed(command, target, validation.reason)
  }

  const content = target.content
  const replacement = command.content || ''

  if (command.operation === 'append') {
    return {
      ok: true,
      operation: 'append',
      original: content,
      next: content + (content ? '\n' : '') + replacement,
      range: { start: content.length, end: content.length },
      reason: command.reason
    }
  }

  if (command.operation === 'replace_selection') {
    if (!target.selectedText) {
      return failed(command, target, 'selection_missing')
    }
    const next = content.slice(0, target.selectionStart) + replacement + content.slice(target.selectionEnd)
    return {
      ok: true,
      operation: 'replace_selection',
      original: content,
      next,
      range: { start: target.selectionStart, end: target.selectionEnd },
      reason: command.reason
    }
  }

  if (command.operation === 'insert') {
    const anchor = command.position === 'selection_end'
      ? target.selectionEnd
      : command.position === 'selection_start'
        ? target.selectionStart
        : command.position === 'end'
          ? content.length
          : target.selectionStart
    const next = content.slice(0, anchor) + replacement + content.slice(anchor)
    return {
      ok: true,
      operation: 'insert',
      original: content,
      next,
      range: { start: anchor, end: anchor },
      reason: command.reason
    }
  }

  const targetText = command.target || ''
  const index = content.indexOf(targetText)
  if (!targetText || index < 0) {
    return failed(command, target, 'target_not_found')
  }

  if (command.operation === 'delete') {
    return {
      ok: true,
      operation: 'delete',
      original: content,
      next: content.slice(0, index) + content.slice(index + targetText.length),
      range: { start: index, end: index + targetText.length },
      reason: command.reason
    }
  }

  const next = content.slice(0, index) + replacement + content.slice(index + targetText.length)
  return {
    ok: true,
    operation: command.operation === 'rewrite' ? 'rewrite' : 'replace_match',
    original: content,
    next,
    range: { start: index, end: index + targetText.length },
    reason: command.reason
  }
}
