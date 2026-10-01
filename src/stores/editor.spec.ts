import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useEditorStore } from './editor'
import { resetUndoService } from '../services/editorUndoService'

const bookmarkContent = '# 第一卷\n少年在雪原行走。\n# 第二卷\n旧城位于河湾。'

describe('editor store undo stacks', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetUndoService()
  })

  it('keeps manual edits and AI batch checkpoints in one undo timeline', () => {
    const store = useEditorStore()
    store.openTab({ id: 'tab-1', title: '第一章', content: '第一版', chapterId: '', isDirty: false })

    store.pushUndoState('tab-1', '第一版')
    store.updateContent('tab-1', '第二版')
    store.pushAiBatchCheckpoint('tab-1', '第二版', 'batch-1')
    store.updateContent('tab-1', '第三版')

    expect(store.undoTab('tab-1')).toBe('第二版')
    expect(store.undoTab('tab-1')).toBe('第一版')
    expect(store.redoTab('tab-1')).toBe('第一版')
    expect(store.redoTab('tab-1')).toBe('第二版')
  })

  it('clears redo history when a new checkpoint is pushed', () => {
    const store = useEditorStore()
    store.openTab({ id: 'tab-1', title: '第一章', content: '第一版', chapterId: '', isDirty: false })

    store.pushUndoState('tab-1', '第一版')
    store.updateContent('tab-1', '第二版')
    expect(store.undoTab('tab-1')).toBe('第一版')
    store.pushAiBatchCheckpoint('tab-1', '第三版', 'batch-1')

    expect(store.canRedoTab('tab-1')).toBe(false)
    expect(store.listUndoContentsForTab('tab-1')).toEqual(['第三版'])
  })

  it('delegates the undo timeline to the shared undo service', () => {
    const store = useEditorStore()
    store.openTab({ id: 'tab-1', title: '第一章', content: '第一版', chapterId: '', isDirty: false })

    store.pushUndoState('tab-1', '第一版')
    store.updateContent('tab-1', '第二版')
    store.pushAiBatchCheckpoint('tab-1', '第二版', 'batch-1')
    store.updateContent('tab-1', '第三版')
    store.pushUndoTransactionForTab('tab-1', '第三版', 'import', '导入文档')

    expect(store.listUndoTransactionsForTab('tab-1').map(transaction => ({
      origin: transaction.origin,
      label: transaction.label,
      before: transaction.before,
    }))).toEqual([
      { origin: 'manual', label: 'manual', before: '第一版' },
      { origin: 'api', label: 'API batch', before: '第二版' },
      { origin: 'import', label: '导入文档', before: '第三版' },
    ])
    expect(store.listUndoContentsForTab('tab-1')).toEqual(['第一版', '第二版', '第三版'])
  })

  it('adds, lists, and deletes bookmarks per document', () => {
    const store = useEditorStore()
    store.openTab({ id: 'tab-1', title: '第一章', content: bookmarkContent, chapterId: '', isDirty: false })
    store.openTab({ id: 'tab-2', title: '第二章', content: '另一份文档', chapterId: '', isDirty: false })

    const first = store.addBookmark('tab-1', bookmarkContent, bookmarkContent.indexOf('旧城'), '南方')
    const second = store.addBookmark('tab-1', bookmarkContent, bookmarkContent.indexOf('少年'), '北境')
    store.addBookmark('tab-2', '另一份文档', 0, '')

    expect(store.listBookmarks('tab-1')).toEqual([second, first])

    store.deleteBookmark(first.id)
    expect(store.listBookmarks('tab-1')).toEqual([second])
    expect(store.listBookmarks('tab-2')).toHaveLength(1)
  })

  it('invalidates bookmarks when document content changes', () => {
    const store = useEditorStore()
    store.openTab({ id: 'tab-1', title: '第一章', content: bookmarkContent, chapterId: '', isDirty: false })
    const first = store.addBookmark('tab-1', bookmarkContent, bookmarkContent.indexOf('少年'), '北境')
    const second = store.addBookmark('tab-1', bookmarkContent, bookmarkContent.length, '结尾')

    store.updateContent('tab-1', bookmarkContent + '\n新增一行。')

    const remaining = store.listBookmarks('tab-1')
    expect(remaining).toHaveLength(2)
    expect(remaining.map(bookmark => bookmark.id)).toContain(second.id)
    expect(remaining.find(bookmark => bookmark.id === second.id)?.offset).toBe(bookmarkContent.length)
  })

  it('removes bookmarks when their tab closes', () => {
    const store = useEditorStore()
    store.openTab({ id: 'tab-1', title: '第一章', content: bookmarkContent, chapterId: '', isDirty: false })
    store.openTab({ id: 'tab-2', title: '第二章', content: '另一份文档', chapterId: '', isDirty: false })
    store.addBookmark('tab-1', bookmarkContent, 0, '')
    const kept = store.addBookmark('tab-2', '另一份文档', 0, '')

    store.closeTab('tab-1')

    expect(store.listBookmarks('tab-1')).toEqual([])
    expect(store.listBookmarks('tab-2')).toEqual([kept])
  })

  it('restores persisted bookmarks and normalizes them against open documents', () => {
    const store = useEditorStore()
    store.openTab({ id: 'tab-1', title: '第一章', content: bookmarkContent, chapterId: '', isDirty: false })
    const valid = store.addBookmark('tab-1', bookmarkContent, 0, '开头')

    const persisted = [
      valid,
      { ...valid, id: 'stale', contentHash: 'stale' },
      { ...valid, id: 'other-doc', documentId: 'missing' },
    ]

    store.setBookmarks(persisted)

    expect(store.listBookmarks('tab-1')).toEqual([valid])
  })

  it('resets the whole editor session across project switches', () => {
    const store = useEditorStore()
    store.openTab({ id: 'tab-1', title: '第一章', content: bookmarkContent, chapterId: '', isDirty: false })
    store.pushUndoState('tab-1', bookmarkContent)
    store.updateContent('tab-1', bookmarkContent + '\n追加。')
    store.undoTab('tab-1')
    store.addBookmark('tab-1', bookmarkContent, 0, '北境')
    store.toggleFind()
    store.findQuery = '旧城'
    store.activeTabId = 'tab-1'

    store.resetEditorSession()

    expect(store.tabs).toEqual([])
    expect(store.activeTabId).toBeNull()
    expect(store.bookmarks).toEqual([])
    expect(store.canUndoTab('tab-1')).toBe(false)
    expect(store.canRedoTab('tab-1')).toBe(false)
    expect(store.listUndoContentsForTab('tab-1')).toEqual([])
    expect(store.findVisible).toBe(false)
    expect(store.findQuery).toBe('')
    expect(store.replaceQuery).toBe('')
  })
})
