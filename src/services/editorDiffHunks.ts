import type { EditorEditBatchPlan } from './editorEditBatch'
import { applyAcceptedItems } from './editorEditBatch'

export type EditorDiffHunkKind = 'insert' | 'remove' | 'replace'
export type EditorDiffHunkStatus = 'active' | 'stale'

export interface EditorDiffHunk {
  index: number
  operation: string
  kind: EditorDiffHunkKind
  beforeText: string
  afterText: string
  range: { start: number; end: number }
  contextBefore: string
  contextAfter: string
  status: EditorDiffHunkStatus
}

export interface EditorDiffRebaseEvent {
  type: 'rejected' | 'range_rebased'
  index: number
}

export interface EditorDiffHunkRebaseResult {
  hunks: EditorDiffHunk[]
  rebaseEvents: EditorDiffRebaseEvent[]
}

export interface EditorDiffHunkView {
  hunks: EditorDiffHunk[]
  stale: boolean
  staleIndexes: number[]
  canRollbackSingleCommand: boolean
  reason?: string
}

const contextSize = 48

export type EditorEditBatchPlanLike = Pick<EditorEditBatchPlan, 'ok' | 'original' | 'next' | 'items'> & {
  batchId?: string
}

export function normalizeEditorDiffHunks(raw: unknown): EditorDiffHunk[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item): EditorDiffHunk[] => {
    if (!item || typeof item !== 'object') return []
    const value = item as Partial<EditorDiffHunk>
    const start = Number(value.range?.start)
    const end = Number(value.range?.end)
    if (
      typeof value.index !== 'number'
      || typeof value.operation !== 'string'
      || !['insert', 'remove', 'replace'].includes(value.kind || '')
      || typeof value.beforeText !== 'string'
      || typeof value.afterText !== 'string'
      || !Number.isFinite(start)
      || !Number.isFinite(end)
    ) return []
    return [{
      index: value.index,
      operation: value.operation,
      kind: value.kind as EditorDiffHunkKind,
      beforeText: value.beforeText,
      afterText: value.afterText,
      range: { start, end },
      contextBefore: typeof value.contextBefore === 'string' ? value.contextBefore : '',
      contextAfter: typeof value.contextAfter === 'string' ? value.contextAfter : '',
      status: value.status === 'stale' ? 'stale' : 'active',
    }]
  })
}

function changedSegment(before: string, after: string): { start: number; beforeText: string; afterText: string } {
  let prefix = 0
  const limit = Math.min(before.length, after.length)
  while (prefix < limit && before[prefix] === after[prefix]) prefix += 1

  let suffix = 0
  while (
    suffix < Math.min(limit - prefix, before.length - prefix)
    && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) suffix += 1

  return {
    start: prefix,
    beforeText: before.slice(prefix, before.length - suffix),
    afterText: after.slice(prefix, after.length - suffix),
  }
}

function hunkKind(beforeText: string, afterText: string): EditorDiffHunkKind {
  if (!beforeText) return 'insert'
  if (!afterText) return 'remove'
  return 'replace'
}

export function buildEditHunks(
  batchPlan: EditorEditBatchPlanLike,
  options: { sourceIndexes?: number[] } = {}
): EditorDiffHunk[] {
  if (!batchPlan.ok) return []
  const items = batchPlan.items
  return items
    .map((item, position) => {
      const command = item.command
      let beforeText: string
      let afterText: string
      let start: number

      if (command.target && (command.operation === 'replace_match' || command.operation === 'delete' || command.operation === 'rewrite')) {
        beforeText = command.target
        afterText = command.content || ''
        start = item.plan.range.start
      } else if (command.operation === 'insert' || command.operation === 'append' || command.operation === 'replace_selection') {
        beforeText = command.operation === 'replace_selection' ? item.plan.original.slice(item.plan.range.start, item.plan.range.end) : ''
        afterText = command.content || ''
        start = item.plan.range.start
      } else {
        const segment = changedSegment(item.plan.original, item.plan.next)
        beforeText = segment.beforeText
        afterText = segment.afterText
        start = segment.start
      }

      if (!beforeText && !afterText) return null

      // Later commands can still move this hunk. Shift it through each edit
      // that ends before the hunk; overlapping edits keep the hunk at the
      // boundary instead of claiming a misleading final range.
      let rangeStart = start
      for (let later = position + 1; later < items.length; later++) {
        const laterPlan = items[later].plan
        const delta = laterPlan.next.length - laterPlan.original.length
        if (laterPlan.range.end <= rangeStart) rangeStart += delta
      }
      const rangeEnd = rangeStart + afterText.length

      const hunk: EditorDiffHunk = {
        index: options.sourceIndexes?.[position] ?? item.index,
        operation: command.operation,
        kind: hunkKind(beforeText, afterText),
        beforeText,
        afterText,
        range: { start: rangeStart, end: rangeEnd },
        contextBefore: batchPlan.next.slice(Math.max(0, rangeStart - contextSize), rangeStart),
        contextAfter: batchPlan.next.slice(rangeEnd, rangeEnd + contextSize),
        status: 'active',
      }
      return hunk
    })
    .filter((hunk): hunk is EditorDiffHunk => hunk !== null)
}

export function rebaseHunksAfterReject(
  batchPlan: EditorEditBatchPlan,
  rejectedIndexes: number[]
): EditorDiffHunkRebaseResult {
  if (!batchPlan.ok) return { hunks: [], rebaseEvents: [] }

  const rejected = new Set(rejectedIndexes)
  const sourceIndexes = batchPlan.items.map(item => item.index).filter(index => !rejected.has(index))
  const replanned = applyAcceptedItems(batchPlan, sourceIndexes)
  if (!replanned.ok) return { hunks: [], rebaseEvents: [] }

  const previous = new Map(buildEditHunks(batchPlan).map(hunk => [hunk.index, hunk]))
  const hunks = buildEditHunks(replanned, { sourceIndexes })
  const rebaseEvents: EditorDiffRebaseEvent[] = rejectedIndexes
    .filter(index => Number.isInteger(index))
    .sort((a, b) => a - b)
    .map(index => ({ type: 'rejected' as const, index }))

  hunks.forEach(hunk => {
    const oldHunk = previous.get(hunk.index)
    if (oldHunk && (oldHunk.range.start !== hunk.range.start || oldHunk.range.end !== hunk.range.end)) {
      rebaseEvents.push({ type: 'range_rebased', index: hunk.index })
    }
  })

  return { hunks, rebaseEvents }
}

export function resolveEditorDiffHunkView(
  batchPlan: EditorEditBatchPlanLike,
  current: { currentContent: string; storedHunks?: EditorDiffHunk[] }
): EditorDiffHunkView {
  const hunks = current.storedHunks?.length ? current.storedHunks : buildEditHunks(batchPlan)
  const stale = !batchPlan.ok || current.currentContent !== batchPlan.next
  const staleIndexes = stale ? hunks.map(hunk => hunk.index) : []
  return {
    hunks: stale ? hunks.map(hunk => ({ ...hunk, status: 'stale' as const })) : hunks,
    stale,
    staleIndexes,
    canRollbackSingleCommand: !stale && hunks.length > 0,
    reason: stale ? '编辑器版本已变化，单命令回滚已禁用；可回滚整批或重新读取当前文档。' : undefined,
  }
}
