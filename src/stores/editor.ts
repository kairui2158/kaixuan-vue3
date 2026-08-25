import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

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
  const tabUndoStacks = ref<Record<string, string[]>>({})
  const tabRedoStacks = ref<Record<string, string[]>>({})

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
  }

  function updateContent(id: string, content: string) {
    const tab = tabs.value.find(t => t.id === id)
    if (tab) {
      tab.content = content
      tab.isDirty = true
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
    if (!tabUndoStacks.value[tabId]) tabUndoStacks.value[tabId] = []
    const stack = tabUndoStacks.value[tabId]
    if (stack.length === 0 || stack[stack.length - 1] !== content) {
      stack.push(content)
      if (stack.length > 50) stack.shift()
    }
    tabRedoStacks.value[tabId] = []
  }

  function undoTab(tabId: string): string | null {
    const undoStack = tabUndoStacks.value[tabId]
    if (!undoStack || undoStack.length === 0) return null
    const content = undoStack.pop()!
    if (!tabRedoStacks.value[tabId]) tabRedoStacks.value[tabId] = []
    tabRedoStacks.value[tabId].push(content)
    return content
  }

  function redoTab(tabId: string): string | null {
    const redoStack = tabRedoStacks.value[tabId]
    if (!redoStack || redoStack.length === 0) return null
    const content = redoStack.pop()!
    if (!tabUndoStacks.value[tabId]) tabUndoStacks.value[tabId] = []
    tabUndoStacks.value[tabId].push(content)
    return content
  }

  function canUndoTab(tabId: string): boolean {
    return !!tabUndoStacks.value[tabId] && tabUndoStacks.value[tabId].length > 0
  }

  function canRedoTab(tabId: string): boolean {
    return !!tabRedoStacks.value[tabId] && tabRedoStacks.value[tabId].length > 0
  }

 return {
   tabs, activeTabId, findVisible, findQuery, replaceQuery,
   activeTab, tabCount,
   openTab, closeTab, updateContent, markSaved,
    setAutoSaveTimer, clearAutoSaveTimer, toggleFind,
    tabUndoStacks, tabRedoStacks,
    pushUndoState, undoTab, redoTab, canUndoTab, canRedoTab
 }
})

