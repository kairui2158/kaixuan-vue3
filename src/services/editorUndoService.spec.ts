import { beforeEach, describe, expect, it } from 'vitest'
import {
  canRedo,
  canUndo,
  clearUndoHistory,
  listUndoContents,
  pushUndoTransaction,
  redo,
  resetUndoService,
  undo,
} from './editorUndoService'

describe('editor undo service', () => {
  beforeEach(() => {
    resetUndoService()
  })

  it('keeps one timeline for manual, api, and import transactions', () => {
    pushUndoTransaction('doc-1', { before: '第一版', origin: 'manual', label: '手动输入' })
    pushUndoTransaction('doc-1', { before: '第二版', origin: 'api', label: 'API 写入' })
    pushUndoTransaction('doc-1', { before: '第三版', origin: 'import', label: '导入文档' })

    expect(undo('doc-1')).toBe('第三版')
    expect(undo('doc-1')).toBe('第二版')
    expect(redo('doc-1')).toBe('第二版')
    expect(redo('doc-1')).toBe('第三版')
    expect(undo('doc-1')).toBe('第三版')
  })

  it('clears redo history when a new transaction is pushed', () => {
    pushUndoTransaction('doc-1', { before: '第一版', origin: 'manual' })
    undo('doc-1')
    expect(canRedo('doc-1')).toBe(true)

    pushUndoTransaction('doc-1', { before: '第二版', origin: 'api' })

    expect(canRedo('doc-1')).toBe(false)
  })

  it('does not push duplicate stack-top content and keeps the 50-item limit', () => {
    pushUndoTransaction('doc-1', { before: '第一版', origin: 'manual' })
    pushUndoTransaction('doc-1', { before: '第一版', origin: 'manual' })
    expect(listUndoContents('doc-1')).toEqual(['第一版'])

    for (let i = 0; i < 55; i += 1) {
      pushUndoTransaction('doc-1', { before: `内容-${i}`, origin: 'manual' })
    }

    expect(listUndoContents('doc-1')).toHaveLength(50)
    expect(listUndoContents('doc-1')[0]).toBe('内容-5')
  })

  it('supports the AI batch lookup with consumed history count', () => {
    pushUndoTransaction('doc-1', { before: '第一版', origin: 'manual' })
    pushUndoTransaction('doc-1', { before: '第二版', origin: 'manual' })
    pushUndoTransaction('doc-1', { before: '第三版', origin: 'api' })

    const contents = listUndoContents('doc-1')
    expect(contents).toEqual(['第一版', '第二版', '第三版'])
  })

  it('isolates documents and clears all history on session reset', () => {
    pushUndoTransaction('doc-1', { before: '第一版', origin: 'manual' })
    pushUndoTransaction('doc-2', { before: '另一版', origin: 'import' })

    clearUndoHistory('doc-1')
    expect(canUndo('doc-1')).toBe(false)
    expect(canUndo('doc-2')).toBe(true)

    resetUndoService()
    expect(canUndo('doc-2')).toBe(false)
    expect(listUndoContents('doc-2')).toEqual([])
  })
})
