import { describe, expect, it } from 'vitest'
import {
  buildMultiCursorEditPlan,
  buildSelectionSet,
  buildSelectionSetFromMatches,
  normalizeSelectionSet,
  selectionSetAfterExternalWrite,
  selectionSetFromBlock,
} from './editorSelectionModel'

describe('buildSelectionSet', () => {
  it('normalizes invalid ranges against the current document', () => {
    const selection = buildSelectionSet({
      contentLength: 5,
      cursors: [
        { anchor: 6, focus: 9 },
        { anchor: 2, focus: 1 },
      ],
    })

    expect(selection).toEqual({
      cursors: [
        { anchor: 2, focus: 1 },
        { anchor: 5, focus: 5 },
      ],
      primaryIndex: 0,
      block: null,
    })
  })

  it('rejects overlapping cursors and keeps the first cursor', () => {
    const selection = buildSelectionSet({
      contentLength: 20,
      cursors: [
        { anchor: 2, focus: 8 },
        { anchor: 4, focus: 10 },
        { anchor: 12, focus: 14 },
      ],
    })

    expect(selection.cursors).toEqual([
      { anchor: 2, focus: 8 },
      { anchor: 12, focus: 14 },
    ])
  })
})

describe('buildSelectionSetFromMatches', () => {
  it('turns find-all matches into ordered cursors', () => {
    const selection = buildSelectionSetFromMatches({
      matches: [
        { start: 5, end: 7 },
        { start: 1, end: 3 },
      ],
      contentLength: 20,
      primaryIndex: 1,
    })

    expect(selection.cursors).toEqual([
      { anchor: 1, focus: 3 },
      { anchor: 5, focus: 7 },
    ])
    expect(selection.primaryIndex).toBe(1)
  })

  it('clips matches outside the document', () => {
    const selection = buildSelectionSetFromMatches({
      matches: [{ start: 4, end: 9 }],
      contentLength: 6,
      primaryIndex: 0,
    })

    expect(selection.cursors).toEqual([{ anchor: 4, focus: 6 }])
  })
})

describe('normalizeSelectionSet', () => {
  it('returns a stable empty selection for invalid input', () => {
    expect(normalizeSelectionSet(null, 10)).toEqual({
      cursors: [{ anchor: 0, focus: 0 }],
      primaryIndex: 0,
      block: null,
    })
  })
})

describe('buildMultiCursorEditPlan', () => {
  it('inserts text at every cursor in one undo transaction', () => {
    const plan = buildMultiCursorEditPlan({
      content: 'foo\nfoo\nfoo',
      selection: buildSelectionSet({
        contentLength: 12,
        cursors: [
          { anchor: 0, focus: 3 },
          { anchor: 4, focus: 7 },
          { anchor: 8, focus: 11 },
        ],
      }),
      command: { type: 'insert', text: 'x' },
    })

    expect(plan.status).toBe('applied')
    expect(plan.next).toBe('x\nx\nx')
    expect(plan.selection.cursors).toEqual([
      { anchor: 1, focus: 1 },
      { anchor: 3, focus: 3 },
      { anchor: 5, focus: 5 },
    ])
  })

  it('deletes selected ranges and keeps caret deltas stable', () => {
    const plan = buildMultiCursorEditPlan({
      content: 'abc-def-abc',
      selection: buildSelectionSet({
        contentLength: 11,
        cursors: [
          { anchor: 0, focus: 3 },
          { anchor: 4, focus: 8 },
        ],
      }),
      command: { type: 'delete_forward' },
    })

    expect(plan.status).toBe('applied')
    expect(plan.next).toBe('-abc')
    expect(plan.selection.cursors).toEqual([
      { anchor: 0, focus: 0 },
      { anchor: 1, focus: 1 },
    ])
  })

  it('deletes the next character for collapsed cursors', () => {
    const plan = buildMultiCursorEditPlan({
      content: 'ab\ncd',
      selection: buildSelectionSet({
        contentLength: 5,
        cursors: [{ anchor: 1, focus: 1 }, { anchor: 3, focus: 3 }],
      }),
      command: { type: 'delete_forward' },
    })

    expect(plan.next).toBe('a\nd')
  })

  it('deletes back to the previous character for collapsed cursors', () => {
    const plan = buildMultiCursorEditPlan({
      content: 'ab\ncd',
      selection: buildSelectionSet({
        contentLength: 5,
        cursors: [{ anchor: 1, focus: 1 }, { anchor: 3, focus: 3 }],
      }),
      command: { type: 'delete_backward' },
    })

    expect(plan.next).toBe('bcd')
  })

  it('rejects stale selections instead of corrupting the document', () => {
    const plan = buildMultiCursorEditPlan({
      content: 'abc',
      selection: {
        cursors: [{ anchor: 0, focus: 10 }],
        block: null,
      },
      command: { type: 'insert', text: 'x' },
    })

    expect(plan.status).toBe('version_changed')
    expect(plan.next).toBe('abc')
  })

  it('applies a newline to every cursor', () => {
    const plan = buildMultiCursorEditPlan({
      content: 'abc',
      selection: buildSelectionSet({
        contentLength: 3,
        cursors: [{ anchor: 1, focus: 1 }, { anchor: 3, focus: 3 }],
      }),
      command: { type: 'newline' },
    })

    expect(plan.next).toBe('a\nbc\n')
  })
})

describe('selectionSetAfterExternalWrite', () => {
  it('keeps all cursors after an earlier external insert', () => {
    const selection = selectionSetAfterExternalWrite({
      selection: buildSelectionSet({
        contentLength: 6,
        cursors: [{ anchor: 2, focus: 2 }, { anchor: 5, focus: 5 }],
      }),
      nextContent: 'xx abcdef',
      previousContent: 'abcdef',
    })

    expect(selection.cursors).toEqual([{ anchor: 5, focus: 5 }, { anchor: 8, focus: 8 }])
  })

  it('resets when an external write overlaps any cursor', () => {
    const selection = selectionSetAfterExternalWrite({
      selection: buildSelectionSet({
        contentLength: 6,
        cursors: [{ anchor: 2, focus: 2 }, { anchor: 5, focus: 5 }],
      }),
      nextContent: 'ab',
      previousContent: 'abcdef',
    })

    expect(selection.cursors).toEqual([{ anchor: 0, focus: 0 }])
  })
})

describe('selectionSetFromBlock', () => {
  it('builds a block selection and exposes selected text', () => {
    const content = 'abcd\nef\nghij'
    const selection = selectionSetFromBlock({
      content,
      startLine: 0,
      endLine: 2,
      startColumn: 1,
      endColumn: 3,
    })

    expect(selection.block).toEqual({ startLine: 0, endLine: 2, startColumn: 1, endColumn: 3 })
    expect(selection.cursors).toEqual([
      { anchor: 1, focus: 3 },
      { anchor: 6, focus: 7 },
      { anchor: 9, focus: 11 },
    ])
    expect(getBlockText(content, selection)).toBe('bc\nf\nhi')
  })
})

function getBlockText(content: string, selection: { block: { startLine: number; endLine: number; startColumn: number; endColumn: number } | null }): string {
  if (!selection.block) return ''
  const lines = content.split('\n')
  return lines
    .slice(selection.block.startLine, selection.block.endLine + 1)
    .map(line => line.slice(selection.block!.startColumn, selection.block!.endColumn))
    .join('\n')
}
