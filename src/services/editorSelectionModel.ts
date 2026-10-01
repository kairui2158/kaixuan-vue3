export interface EditorCursor {
  anchor: number
  focus: number
}

export interface EditorBlockSelection {
  startLine: number
  endLine: number
  startColumn: number
  endColumn: number
}

export interface EditorSelectionSet {
  cursors: EditorCursor[]
  primaryIndex?: number
  block?: EditorBlockSelection | null
}

export type NormalizedSelection = Required<EditorSelectionSet>

export type MultiCursorCommand =
  | { type: 'insert'; text: string }
  | { type: 'newline' }
  | { type: 'delete_forward' }
  | { type: 'delete_backward' }

export type MultiCursorEditPlan =
  | {
      status: 'applied'
      next: string
      selection: NormalizedSelection
      changedCursors: number
    }
  | {
      status: 'version_changed' | 'invalid_selection'
      next: string
      selection: NormalizedSelection
      changedCursors: 0
    }

function clampOffset(value: number, contentLength: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(Math.trunc(value), contentLength))
}

function cursorStart(cursor: EditorCursor): number {
  return Math.min(cursor.anchor, cursor.focus)
}

function cursorEnd(cursor: EditorCursor): number {
  return Math.max(cursor.anchor, cursor.focus)
}

function overlaps(previous: EditorCursor, next: EditorCursor): boolean {
  return cursorStart(next) <= cursorEnd(previous)
}

export function normalizeSelectionSet(
  selection: EditorSelectionSet | null | undefined,
  contentLength: number,
): NormalizedSelection {
  const safeLength = Math.max(0, Number.isFinite(contentLength) ? Math.trunc(contentLength) : 0)
  const source = Array.isArray(selection?.cursors) ? selection.cursors : []
  const sorted = source
    .map(cursor => ({
      anchor: clampOffset(cursor?.anchor, safeLength),
      focus: clampOffset(cursor?.focus, safeLength),
    }))
    .sort((left, right) => cursorStart(left) - cursorStart(right))

  const cursors: EditorCursor[] = []
  sorted.forEach(cursor => {
    const previous = cursors[cursors.length - 1]
    if (previous && overlaps(previous, cursor)) return
    cursors.push(cursor)
  })

  const requestedPrimary = selection?.primaryIndex
  return {
    cursors: cursors.length > 0 ? cursors : [{ anchor: 0, focus: 0 }],
    primaryIndex: Number.isInteger(requestedPrimary)
      ? Math.max(0, Math.min(requestedPrimary as number, cursors.length - 1))
      : 0,
    block: selection?.block ?? null,
  }
}

export function buildSelectionSet(input: {
  contentLength: number
  cursors: EditorCursor[]
  primaryIndex?: number
  block?: EditorBlockSelection | null
}): NormalizedSelection {
  return normalizeSelectionSet(input, input.contentLength)
}

export function buildSelectionSetFromMatches(input: {
  matches: Array<{ start: number; end: number }>
  contentLength: number
  primaryIndex?: number
}): NormalizedSelection {
  const cursors = input.matches
    .filter(match => Number.isFinite(match?.start) && Number.isFinite(match?.end) && match.end > match.start)
    .map(match => ({
      anchor: clampOffset(match.start, input.contentLength),
      focus: clampOffset(match.end, input.contentLength),
    }))
    .sort((left, right) => cursorStart(left) - cursorStart(right))

  return normalizeSelectionSet({ cursors, primaryIndex: input.primaryIndex }, input.contentLength)
}

export function selectionSetFromBlock(input: {
  content: string
  startLine: number
  endLine: number
  startColumn: number
  endColumn: number
}): NormalizedSelection {
  const lines = input.content.split('\n')
  const startLine = Math.max(0, Math.min(Math.trunc(input.startLine), lines.length - 1))
  const endLine = Math.max(startLine, Math.min(Math.trunc(input.endLine), lines.length - 1))
  const startColumn = Math.max(0, Math.trunc(input.startColumn))
  const endColumn = Math.max(startColumn, Math.trunc(input.endColumn))
  const offsets: number[] = [0]
  input.content.split('').forEach((char, index) => {
    if (char === '\n') offsets.push(index + 1)
  })

  const cursors = lines.slice(startLine, endLine + 1).map((line, index) => {
    const lineStart = offsets[startLine + index]
    const from = Math.min(startColumn, line.length)
    const to = Math.min(endColumn, line.length)
    return { anchor: lineStart + from, focus: lineStart + to }
  })

  return {
    cursors,
    primaryIndex: 0,
    block: { startLine, endLine, startColumn, endColumn },
  }
}

export function getBlockSelectionText(content: string, selection: EditorSelectionSet): string {
  if (!selection.block) return ''
  const lines = content.split('\n')
  return lines
    .slice(selection.block.startLine, selection.block.endLine + 1)
    .map(line => line.slice(selection.block!.startColumn, selection.block!.endColumn))
    .join('\n')
}

function isSelectionCurrent(selection: EditorSelectionSet, contentLength: number): boolean {
  if (!Array.isArray(selection?.cursors) || selection.cursors.length === 0) return false
  return selection.cursors.every(cursor =>
    Number.isInteger(cursor?.anchor)
    && Number.isInteger(cursor?.focus)
    && cursor.anchor >= 0
    && cursor.focus >= 0
    && cursor.anchor <= contentLength
    && cursor.focus <= contentLength
  )
}

function emptySelection(): NormalizedSelection {
  return { cursors: [{ anchor: 0, focus: 0 }], primaryIndex: 0, block: null }
}

export function buildMultiCursorEditPlan(input: {
  content: string
  selection: EditorSelectionSet
  command: MultiCursorCommand
}): MultiCursorEditPlan {
  if (!isSelectionCurrent(input.selection, input.content.length)) {
    const status = Array.isArray(input.selection?.cursors) && input.selection.cursors.length > 0
      ? 'version_changed'
      : 'invalid_selection'
    return {
      status,
      next: input.content,
      selection: emptySelection(),
      changedCursors: 0,
    }
  }

  const cursors = [...input.selection.cursors].sort((left, right) => cursorStart(left) - cursorStart(right))
  let next = input.content
  let delta = 0
  let changedCursors = 0
  const nextCursors: EditorCursor[] = []

  for (const cursor of cursors) {
    const start = cursorStart(cursor)
    const end = cursorEnd(cursor)
    const mappedStart = start + delta
    const mappedEnd = end + delta

    if (input.command.type === 'insert') {
      const text = input.command.text || ''
      next = next.slice(0, mappedStart) + text + next.slice(mappedEnd)
      nextCursors.push({ anchor: mappedStart + text.length, focus: mappedStart + text.length })
      delta += text.length - (mappedEnd - mappedStart)
      changedCursors += 1
      continue
    }

    if (input.command.type === 'newline') {
      next = next.slice(0, mappedStart) + '\n' + next.slice(mappedEnd)
      nextCursors.push({ anchor: mappedStart + 1, focus: mappedStart + 1 })
      delta += 1 - (mappedEnd - mappedStart)
      changedCursors += 1
      continue
    }

    if (input.command.type === 'delete_forward') {
      const deleteEnd = start === end ? Math.min(mappedStart + 1, next.length) : mappedEnd
      if (deleteEnd > mappedStart) {
        next = next.slice(0, mappedStart) + next.slice(deleteEnd)
        delta -= deleteEnd - mappedStart
        changedCursors += 1
      }
      nextCursors.push({ anchor: mappedStart, focus: mappedStart })
      continue
    }

    const deleteStart = start === end ? Math.max(0, mappedStart - 1) : mappedStart
    if (mappedEnd > deleteStart) {
      next = next.slice(0, deleteStart) + next.slice(mappedEnd)
      if (start === end) delta -= 1
      else delta -= mappedEnd - mappedStart
      changedCursors += 1
    }
    nextCursors.push({ anchor: deleteStart, focus: deleteStart })
  }

  return {
    status: 'applied',
    next,
    selection: {
      cursors: nextCursors,
      primaryIndex: 0,
      block: null,
    },
    changedCursors,
  }
}

export function selectionSetAfterExternalWrite(input: {
  selection: EditorSelectionSet
  previousContent: string
  nextContent: string
}): NormalizedSelection {
  const normalized = normalizeSelectionSet(input.selection, input.previousContent.length)
  if (input.previousContent === input.nextContent) return normalized

  let commonPrefix = 0
  while (
    commonPrefix < input.previousContent.length
    && commonPrefix < input.nextContent.length
    && input.previousContent[commonPrefix] === input.nextContent[commonPrefix]
  ) commonPrefix++

  let commonSuffix = 0
  while (
    commonSuffix < input.previousContent.length - commonPrefix
    && commonSuffix < input.nextContent.length - commonPrefix
    && input.previousContent[input.previousContent.length - 1 - commonSuffix]
      === input.nextContent[input.nextContent.length - 1 - commonSuffix]
  ) commonSuffix++

  const changedEnd = input.previousContent.length - commonSuffix
  const delta = input.nextContent.length - input.previousContent.length
  const cursors: EditorCursor[] = []

  for (const cursor of normalized.cursors) {
    const start = cursorStart(cursor)
    const end = cursorEnd(cursor)
    if (end <= commonPrefix) {
      cursors.push({ anchor: start, focus: end })
    } else if (start >= changedEnd) {
      cursors.push({ anchor: start + delta, focus: end + delta })
    } else {
      return emptySelection()
    }
  }

  return normalizeSelectionSet({ cursors, primaryIndex: normalized.primaryIndex, block: normalized.block }, input.nextContent.length)
}
