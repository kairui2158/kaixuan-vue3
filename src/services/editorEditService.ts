import type { EditorEditCommand, EditorEditFailureReason } from './editorEditProtocol'
import { locateEditorFragment } from './editorEditLocator'
import { validateEditorTarget, type EditorTargetSnapshot } from './editorTarget'

const HEADING_LINE_PATTERN = /^#{1,6}[ \t]+[^\n]*$/

function findHeadingSectionEnd(content: string, headingEnd: number, level: number): number {
  let cursor = headingEnd
  while (cursor < content.length) {
    const lineEnd = content.indexOf('\n', cursor)
    const lineEndIndex = lineEnd === -1 ? content.length : lineEnd
    const heading = /^(#{1,6})[ \t]+/.exec(content.slice(cursor, lineEndIndex))
    if (heading && heading[1].length <= level) return cursor
    cursor = lineEndIndex
    while (cursor < content.length && (content[cursor] === '\n' || content[cursor] === '\r')) {
      cursor += 1
    }
  }
  return cursor
}

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

  if (command.operation === 'replace_document') {
    return {
      ok: true,
      operation: 'replace_document',
      original: content,
      next: replacement,
      range: { start: 0, end: content.length },
      reason: command.reason
    }
  }

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

  if (command.operation === 'move') {
    const targetText = command.target || ''
    const destinationText = command.destination || ''
    if (!targetText || !destinationText) {
      return failed(command, target, 'invalid_command')
    }
    const locatedTarget = locateEditorFragment({ content, fragment: targetText, exactOnly: true })
    if (!locatedTarget.ok) {
      return failed(
        command,
        target,
        locatedTarget.reason === 'ambiguous_target' ? 'ambiguous_target' : 'target_not_found'
      )
    }
    const targetAtLineStart = locatedTarget.start === 0 || content[locatedTarget.start - 1] === '\n'
    let cutStart = locatedTarget.start
    let cutEnd = locatedTarget.end
    let movedSourceText = content.slice(cutStart, cutEnd)
    let movedWholeHeading = false
    const targetFirstLine = content.slice(locatedTarget.start, locatedTarget.end).split(/\r?\n/, 1)[0] || ''
    if (targetAtLineStart && HEADING_LINE_PATTERN.test(targetFirstLine)) {
      // Moving a heading without its section body would leave orphan text behind.
      const level = /^#{1,6}/.exec(targetFirstLine)?.[0].length ?? 1
      cutEnd = findHeadingSectionEnd(content, locatedTarget.end, level)
      movedSourceText = content.slice(cutStart, cutEnd)
      movedWholeHeading = true
    } else {
      // Keep paragraph boundaries stable when a model omits the trailing newline.
      const targetAtLineEnd = locatedTarget.end === content.length || content[locatedTarget.end] === '\n'
      if (targetAtLineStart && targetAtLineEnd) {
        if (content[locatedTarget.end] === '\n') {
          cutEnd += 1
        } else if (cutStart > 0 && content[cutStart - 1] === '\n') {
          cutStart -= 1
        }
      }
    }
    const contentWithoutTarget = content.slice(0, cutStart) + content.slice(cutEnd)
    const locatedDestination = locateEditorFragment({ content: contentWithoutTarget, fragment: destinationText, exactOnly: true })
    if (!locatedDestination.ok) {
      return failed(
        command,
        target,
        locatedDestination.reason === 'ambiguous_target' ? 'ambiguous_target' : 'target_not_found'
      )
    }
    const movedText = movedSourceText + (command.content || '')
    let insertionIndex = command.destinationPosition === 'before'
      ? locatedDestination.start
      : locatedDestination.end
    let insertionText = movedText
    if (movedWholeHeading) {
      // `destination` may be either a bare heading or a heading-plus-body
      // section copied from the document. Treating a heading destination as
      // "after the heading line" splits that section from its body, which is
      // never a valid section reorder.
      const destinationSlice = contentWithoutTarget.slice(
        locatedDestination.start,
        locatedDestination.end,
      )
      const destinationHeadingLevel = /^#{1,6}/.exec(destinationSlice)?.[0].length
        ?? (HEADING_LINE_PATTERN.test(destinationSlice.split(/\r?\n/, 1)[0] || '')
          ? /^#{1,6}/.exec(destinationSlice.split(/\r?\n/, 1)[0])?.[0].length ?? 1
          : 1)
      if (command.destinationPosition === 'after') {
        insertionIndex = findHeadingSectionEnd(
          contentWithoutTarget,
          locatedDestination.end,
          destinationHeadingLevel,
        )
      }
      // Normalize a moved heading section to one trailing newline, then keep
      // one blank line between adjacent heading sections in either direction.
      insertionText = movedText.replace(/(?:\r?\n)+$/, '') + '\n'
      const hasTextBefore = insertionIndex > 0 && contentWithoutTarget.slice(0, insertionIndex).trim() !== ''
      const needsLeadingBlankLine = hasTextBefore
        && !contentWithoutTarget.slice(0, insertionIndex).endsWith('\n\n')
      if (needsLeadingBlankLine) insertionText = '\n' + insertionText
      const charAfterInsertion = contentWithoutTarget[insertionIndex]
      if (insertionIndex < contentWithoutTarget.length
        && charAfterInsertion !== '\n'
        && charAfterInsertion !== '\r') insertionText += '\n'
    } else if (movedText) {
      const destinationAtLineStart = locatedDestination.start === 0
        || contentWithoutTarget[locatedDestination.start - 1] === '\n'
      const destinationAtLineEnd = locatedDestination.end < contentWithoutTarget.length
        && contentWithoutTarget[locatedDestination.end] === '\n'
      if (command.destinationPosition === 'before' && destinationAtLineStart && !movedText.endsWith('\n')) {
        insertionText += '\n'
      } else if (command.destinationPosition === 'after' && destinationAtLineEnd) {
        insertionIndex = locatedDestination.end + 1
        if (!movedText.endsWith('\n')) insertionText += '\n'
      }
    }
    const next = contentWithoutTarget.slice(0, insertionIndex)
      + insertionText
      + contentWithoutTarget.slice(insertionIndex)
    const finalStart = next.indexOf(insertionText)
    return {
      ok: true,
      operation: 'move',
      original: content,
      next,
      range: { start: finalStart, end: finalStart + insertionText.length },
      reason: command.reason
    }
  }

  const targetText = command.target || ''
  const located = targetText
    ? locateEditorFragment({
      content,
      fragment: targetText,
      exactOnly: true,
      anchor: {
        ...(command.volumeTitle ? { volumeTitle: command.volumeTitle } : {}),
        ...(command.chapterTitle ? { chapterTitle: command.chapterTitle } : {}),
        ...(command.sectionTitle ? { sectionTitle: command.sectionTitle } : {})
      }
    })
    : null
  if (!located || !located.ok) {
    return failed(command, target, located?.reason === 'ambiguous_target' ? 'ambiguous_target' : 'target_not_found')
  }
  const index = located.start

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
