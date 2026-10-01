import { describe, expect, it } from 'vitest'
import { applyFold, computeFoldRanges } from './editorFolding'
import {
  planExternalWriteSelectionRestore,
  planFoldSelectionRestore,
  planTabSwitchSelectionRestore,
  advanceSnapshotAfterExternalWrite,
  type EditorSelectionSnapshot,
} from './editorSelectionRestore'

const content = [
  '# 第一卷',
  '起点文字。',
  '## 第一节',
  '第一节正文。',
  '## 第二节',
  '第二节正文。',
  '# 第二卷',
  '结尾文字。',
].join('\n')

function snapshot(start: number, end: number, text = content): EditorSelectionSnapshot {
  return {
    documentId: 'doc-main',
    content: text,
    start,
    end,
  }
}

describe('planExternalWriteSelectionRestore', () => {
  it('keeps the selection unchanged when the API writes after it', () => {
    const start = content.indexOf('起点')
    const plan = planExternalWriteSelectionRestore({
      snapshot: snapshot(start, start + 2),
      documentId: 'doc-main',
      nextContent: content.replace('结尾文字。', '结尾已经被改写。'),
    })
    expect(plan).toEqual({
      mode: 'auto',
      start,
      end: start + 2,
      reason: 'write-after-selection',
    })
  })

  it('shifts the selection when the API writes before it', () => {
    const start = content.indexOf('结尾')
    const plan = planExternalWriteSelectionRestore({
      snapshot: snapshot(start, start + 2),
      documentId: 'doc-main',
      nextContent: content.replace('起点文字。', '起点被扩充成一段更长的文字。'),
    })
    const delta = '起点被扩充成一段更长的文字。'.length - '起点文字。'.length
    expect(plan.mode).toBe('auto')
    expect(plan.start).toBe(start + delta)
    expect(plan.end).toBe(start + 2 + delta)
    expect(plan.reason).toBe('write-before-selection')
  })

  it('resets the selection when the API write overlaps it', () => {
    const start = content.indexOf('第一节正文')
    const plan = planExternalWriteSelectionRestore({
      snapshot: snapshot(start, start + 5),
      documentId: 'doc-main',
      nextContent: content.replace('第一节正文。', '完全不同的内容。'),
    })
    expect(plan).toEqual({
      mode: 'reset',
      start: 0,
      end: 0,
      reason: 'write-overlaps-selection',
    })
  })

  it('returns none when content and snapshot are unchanged', () => {
    const start = content.indexOf('起点')
    const plan = planExternalWriteSelectionRestore({
      snapshot: snapshot(start, start + 2),
      documentId: 'doc-main',
      nextContent: content,
    })
    expect(plan).toEqual({
      mode: 'none',
      reason: 'content-unchanged',
    })
  })

  it('returns none for another document and reset for invalid offsets', () => {
    const start = content.indexOf('起点')
    expect(planExternalWriteSelectionRestore({
      snapshot: snapshot(start, start + 2),
      documentId: 'doc-other',
      nextContent: content + '追加',
    })).toEqual({ mode: 'none', reason: 'document-mismatch' })
    expect(planExternalWriteSelectionRestore({
      snapshot: snapshot(99, 3, 'short'),
      documentId: 'doc-main',
      nextContent: 'short2',
    })).toEqual({ mode: 'reset', start: 0, end: 0, reason: 'invalid-snapshot' })
  })

  it('handles empty content without throwing', () => {
    expect(planExternalWriteSelectionRestore({
      snapshot: undefined,
      documentId: 'doc-main',
      nextContent: '',
    })).toEqual({ mode: 'none', reason: 'no-snapshot' })
  })

  it('advances the baseline so consecutive external writes keep using the latest document', () => {
    const start = content.indexOf('结尾')
    const firstNext = content.replace('结尾文字。', '结尾已经被改写。')
    const original = snapshot(start, start + 2)
    const firstPlan = planExternalWriteSelectionRestore({
      snapshot: original,
      documentId: 'doc-main',
      nextContent: firstNext,
    })
    const advanced = advanceSnapshotAfterExternalWrite({
      snapshot: original,
      documentId: 'doc-main',
      nextContent: firstNext,
      plan: firstPlan,
    })

    const secondNext = firstNext.replace('起点文字。', '起点被扩充成一段更长的文字。')
    const secondPlan = planExternalWriteSelectionRestore({
      snapshot: advanced ?? undefined,
      documentId: 'doc-main',
      nextContent: secondNext,
    })
    const delta = '起点被扩充成一段更长的文字。'.length - '起点文字。'.length
    expect(secondPlan).toEqual({
      mode: 'auto',
      start: start + delta,
      end: start + 2 + delta,
      reason: 'write-before-selection',
    })
  })

  it('refreshes the reset baseline after an overlapping external write', () => {
    const start = content.indexOf('第一节正文')
    const nextContent = content.replace('第一节正文。', '完全不同的内容。')
    const plan = planExternalWriteSelectionRestore({
      snapshot: snapshot(start, start + 5),
      documentId: 'doc-main',
      nextContent,
    })
    expect(advanceSnapshotAfterExternalWrite({
      snapshot: snapshot(start, start + 5),
      documentId: 'doc-main',
      nextContent,
      plan,
    })).toEqual({
      documentId: 'doc-main',
      content: nextContent,
      start: 0,
      end: 0,
    })
  })
})

describe('planFoldSelectionRestore', () => {
  it('keeps a visible selection aligned after folding', () => {
    const ranges = computeFoldRanges(content)
    const section = ranges.find(range => range.title === '第一节')!
    const folded = applyFold(content, [section.id])
    const start = content.indexOf('结尾文字')
    const plan = planFoldSelectionRestore({
      snapshot: snapshot(start, start + 2),
      foldedDocument: folded,
    })
    expect(plan.mode).toBe('auto')
    expect(plan.start).toBe(folded.content.indexOf('结尾文字'))
    expect(plan.end).toBe(folded.content.indexOf('结尾文字') + 2)
    expect(plan.reason).toBe('fold-visible-selection')
  })

  it('resets a selection hidden by the folded range and restores it after unfold', () => {
    const ranges = computeFoldRanges(content)
    const section = ranges.find(range => range.title === '第一节')!
    const folded = applyFold(content, [section.id])
    const start = content.indexOf('第一节正文')
    const foldedPlan = planFoldSelectionRestore({
      snapshot: snapshot(start, start + 5),
      foldedDocument: folded,
    })
    expect(foldedPlan).toEqual({
      mode: 'reset',
      start: 0,
      end: 0,
      reason: 'fold-hides-selection',
    })

    const unfoldPlan = planFoldSelectionRestore({
      snapshot: snapshot(start, start + 5),
      foldedDocument: null,
    })
    expect(unfoldPlan).toEqual({
      mode: 'auto',
      start,
      end: start + 5,
      reason: 'unfold-restores-selection',
    })
  })

  it('returns none when there is no snapshot or the snapshot is invalid', () => {
    const ranges = computeFoldRanges(content)
    const section = ranges.find(range => range.title === '第一节')!
    const folded = applyFold(content, [section.id])
    expect(planFoldSelectionRestore({ snapshot: undefined, foldedDocument: folded })).toEqual({
      mode: 'none',
      reason: 'no-snapshot',
    })
    expect(planFoldSelectionRestore({ snapshot: snapshot(999, 2, 'short'), foldedDocument: folded })).toEqual({
      mode: 'none',
      reason: 'invalid-snapshot',
    })
  })
})

describe('planTabSwitchSelectionRestore', () => {
  it('always resets explicitly', () => {
    const start = content.indexOf('起点')
    expect(planTabSwitchSelectionRestore(snapshot(start, start + 2))).toEqual({
      mode: 'reset',
      start: 0,
      end: 0,
      reason: 'tab-switch',
    })
    expect(planTabSwitchSelectionRestore(undefined)).toEqual({ mode: 'none', reason: 'no-snapshot' })
  })
})
