import type { FoldedDocument } from './editorFolding'

export interface EditorSelectionSnapshot {
  documentId: string
  content: string
  start: number
  end: number
}

export interface SelectionRestorePlan {
  mode: 'auto' | 'reset' | 'none'
  start?: number
  end?: number
  reason: string
}

interface DiffRange {
  start: number
  originalEnd: number
  nextEnd: number
}

function isValidSnapshot(snapshot: EditorSelectionSnapshot): boolean {
  return snapshot.start >= 0
    && snapshot.end >= snapshot.start
    && snapshot.end <= snapshot.content.length
}

function computeDiff(original: string, next: string): DiffRange | null {
  if (original === next) return null

  let start = 0
  while (start < original.length && start < next.length && original[start] === next[start]) {
    start++
  }

  let suffixLength = 0
  while (
    suffixLength < original.length - start
    && suffixLength < next.length - start
    && original[original.length - 1 - suffixLength] === next[next.length - 1 - suffixLength]
  ) {
    suffixLength++
  }

  return {
    start,
    originalEnd: original.length - suffixLength,
    nextEnd: next.length - suffixLength,
  }
}

export function planExternalWriteSelectionRestore(input: {
  snapshot?: EditorSelectionSnapshot
  documentId: string
  nextContent: string
}): SelectionRestorePlan {
  if (!input.snapshot) return { mode: 'none', reason: 'no-snapshot' }
  if (!isValidSnapshot(input.snapshot)) {
    return { mode: 'reset', start: 0, end: 0, reason: 'invalid-snapshot' }
  }
  if (input.snapshot.documentId !== input.documentId) {
    return { mode: 'none', reason: 'document-mismatch' }
  }

  const diff = computeDiff(input.snapshot.content, input.nextContent)
  if (!diff) return { mode: 'none', reason: 'content-unchanged' }

  if (diff.originalEnd <= input.snapshot.start) {
    const delta = diff.nextEnd - diff.originalEnd
    return {
      mode: 'auto',
      start: input.snapshot.start + delta,
      end: input.snapshot.end + delta,
      reason: 'write-before-selection',
    }
  }

  if (diff.start >= input.snapshot.end) {
    return {
      mode: 'auto',
      start: input.snapshot.start,
      end: input.snapshot.end,
      reason: 'write-after-selection',
    }
  }

  return { mode: 'reset', start: 0, end: 0, reason: 'write-overlaps-selection' }
}

export function advanceSnapshotAfterExternalWrite(input: {
  snapshot?: EditorSelectionSnapshot
  documentId: string
  nextContent: string
  plan: SelectionRestorePlan
}): EditorSelectionSnapshot | null {
  if (!input.snapshot || input.snapshot.documentId !== input.documentId) return input.snapshot ?? null
  if (input.plan.mode === 'none') return null
  if (input.plan.mode === 'reset') {
    return {
      documentId: input.documentId,
      content: input.nextContent,
      start: 0,
      end: 0,
    }
  }
  if (typeof input.plan.start !== 'number' || typeof input.plan.end !== 'number') return null
  return {
    documentId: input.documentId,
    content: input.nextContent,
    start: input.plan.start,
    end: input.plan.end,
  }
}

export function planFoldSelectionRestore(input: {
  snapshot?: EditorSelectionSnapshot
  foldedDocument?: FoldedDocument | null
}): SelectionRestorePlan {
  if (!input.snapshot) return { mode: 'none', reason: 'no-snapshot' }
  if (!isValidSnapshot(input.snapshot)) {
    return { mode: 'none', reason: 'invalid-snapshot' }
  }

  if (!input.foldedDocument) {
    return {
      mode: 'auto',
      start: input.snapshot.start,
      end: input.snapshot.end,
      reason: 'unfold-restores-selection',
    }
  }

  if (!input.foldedDocument.isOriginalRangeVisible(input.snapshot.start, input.snapshot.end)) {
    return { mode: 'reset', start: 0, end: 0, reason: 'fold-hides-selection' }
  }

  return {
    mode: 'auto',
    start: input.foldedDocument.fromOriginalOffset(input.snapshot.start),
    end: input.foldedDocument.fromOriginalOffset(input.snapshot.end),
    reason: 'fold-visible-selection',
  }
}

export function planTabSwitchSelectionRestore(
  snapshot?: EditorSelectionSnapshot,
): SelectionRestorePlan {
  if (!snapshot) return { mode: 'none', reason: 'no-snapshot' }
  return { mode: 'reset', start: 0, end: 0, reason: 'tab-switch' }
}
