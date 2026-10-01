import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { hashEditorContent } from '../services/editorTarget'
import {
  canRedo as canRedoUndoService,
  canUndo as canUndoUndoService,
  clearUndoHistory,
  listUndoContents as listUndoContentsFromService,
  listUndoTransactions as listUndoTransactionsFromService,
  pushUndoTransaction,
  redo as redoUndoService,
  resetUndoService,
  undo as undoUndoService,
  type EditorUndoOrigin,
  type EditorUndoTransaction,
} from '../services/editorUndoService'
import {
  createBookmark,
  deleteBookmark as deleteBookmarkFromList,
  listBookmarks as listBookmarksForDocument,
  normalizeBookmarks,
  type EditorBookmark,
} from '../services/editorBookmarks'

export interface EditorTab {
  id: string
  title: string
  content: string
  chapterId: string
  isDirty: boolean
  mode?: 'ch-body' | 'vol-outline' | 'ch-plot'
}

export const useEditorStore = defineStore('editor', () => {
  const tabs = ref<EditorTab[]>([])
  const activeTabId = ref<string | null>(null)
  const autoSaveTimer = ref<number | null>(null)
 const findVisible = ref(false)
 const findQuery = ref('')
 const replaceQuery = ref('')
 const bookmarks = ref<EditorBookmark[]>([])

 const MAX_TABS = 20
  const activeTab = computed(() => tabs.value.find(t => t.id === activeTabId.value) || null)
  const tabCount = computed(() => tabs.value.length)

  function openTab(tab: EditorTab) {
    if (tabs.value.length >= MAX_TABS) {
      closeTab(tabs.value[0].id)
    }
    const existing = tabs.value.find(t => t.chapterId === tab.chapterId && t.mode === tab.mode)
    if (existing) {
      activeTabId.value = existing.id
    } else {
      tabs.value.push(tab)
      activeTabId.value = tab.id
    }
  }

  function closeTab(id: string) {
    clearAutoSaveTimer()
    const idx = tabs.value.findIndex(t => t.id === id)
    if (idx >= 0) {
      tabs.value.splice(idx, 1)
      if (activeTabId.value === id) {
        activeTabId.value = tabs.value[Math.max(0, idx - 1)]?.id || null
      }
    }
    bookmarks.value = bookmarks.value.filter(bookmark => bookmark.documentId !== id)
  }

  function updateContent(id: string, content: string) {
    const tab = tabs.value.find(t => t.id === id)
    if (tab) {
      const previousContent = tab.content
      tab.content = content
      tab.isDirty = true
      const previousHash = hashEditorContent(previousContent)
      const currentHash = hashEditorContent(content)
      if (previousHash !== currentHash) {
        const nextContent = content
        const keptForDocument = bookmarks.value
          .filter(bookmark => bookmark.documentId === id)
          .filter(bookmark => bookmark.offset <= nextContent.length)
          .map(bookmark => ({ ...bookmark, contentHash: currentHash }))
        bookmarks.value = bookmarks.value
          .filter(bookmark => bookmark.documentId !== id)
          .concat(keptForDocument)
      }
    }
  }

  function markSaved(id: string) {
    const tab = tabs.value.find(t => t.id === id)
    if (tab) tab.isDirty = false
  }

  function setAutoSaveTimer(timer: number) {
    clearAutoSaveTimer()
    autoSaveTimer.value = timer
  }

  function clearAutoSaveTimer() {
    if (autoSaveTimer.value !== null) {
      clearInterval(autoSaveTimer.value)
      autoSaveTimer.value = null
    }
  }

 function toggleFind() {
   findVisible.value = !findVisible.value
 }

 function pushUndoState(tabId: string, content: string) {
   pushUndoTransaction(tabId, { before: content, label: 'manual', origin: 'manual' })
  }

  function pushUndoTransactionForTab(
    tabId: string,
    content: string,
    origin: EditorUndoOrigin = 'manual',
    label?: string,
  ) {
    pushUndoTransaction(tabId, { before: content, origin, label: label || origin })
  }

  // API writes push the current content before applying the batch. The
  // current content is the undo target consumed by undoTab and batch rollback.
 function pushAiBatchCheckpoint(tabId: string, currentContent: string, _batchId: string) {
   pushUndoTransaction(tabId, { before: currentContent, origin: 'api', label: 'API batch' })
  }

  function listUndoContentsForTab(tabId: string): string[] {
    return listUndoContentsFromService(tabId)
  }

  function listUndoTransactionsForTab(tabId: string): EditorUndoTransaction[] {
    return listUndoTransactionsFromService(tabId)
  }

  function clearUndoHistoryForTab(tabId: string): void {
    clearUndoHistory(tabId)
  }

  function undoTab(tabId: string): string | null {
    return undoUndoService(tabId)
  }

  function redoTab(tabId: string): string | null {
    return redoUndoService(tabId)
  }

  function canUndoTab(tabId: string): boolean {
    return canUndoUndoService(tabId)
  }

  function canRedoTab(tabId: string): boolean {
    return canRedoUndoService(tabId)
  }

  function addBookmark(tabId: string, content: string, offset: number, label: string): EditorBookmark {
    const bookmark = createBookmark(tabId, content, offset, label)
    bookmarks.value.push(bookmark)
    return bookmark
  }

  function listBookmarks(tabId: string): EditorBookmark[] {
    return listBookmarksForDocument(bookmarks.value, tabId)
  }

  function deleteBookmark(bookmarkId: string) {
    bookmarks.value = deleteBookmarkFromList(bookmarks.value, bookmarkId)
  }

  function setBookmarks(persisted: unknown) {
    bookmarks.value = tabs.value.flatMap(tab => normalizeBookmarks(persisted, tab.content)
      .filter(bookmark => bookmark.documentId === tab.id))
  }

  function resetEditorSession() {
    clearAutoSaveTimer()
    tabs.value = []
    activeTabId.value = null
    bookmarks.value = []
    resetUndoService()
    findVisible.value = false
    findQuery.value = ''
    replaceQuery.value = ''
  }

 return {
   tabs, activeTabId, findVisible, findQuery, replaceQuery,
   activeTab, tabCount,
   openTab, closeTab, updateContent, markSaved,
    setAutoSaveTimer, clearAutoSaveTimer, toggleFind,
   pushUndoState,
   pushUndoTransactionForTab,
   pushAiBatchCheckpoint,
   undoTab, redoTab, canUndoTab, canRedoTab,
   listUndoContentsForTab, listUndoTransactionsForTab, clearUndoHistoryForTab
   , bookmarks, addBookmark, listBookmarks, deleteBookmark, setBookmarks
   , resetEditorSession
 }
})

