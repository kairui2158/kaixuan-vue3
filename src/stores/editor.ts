import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface EditorTab {
  id: string
  title: string
  content: string
  chapterId: string
  isDirty: boolean
}

export const useEditorStore = defineStore('editor', () => {
  const tabs = ref<EditorTab[]>([])
  const activeTabId = ref<string | null>(null)
  const autoSaveTimer = ref<number | null>(null)
  const findVisible = ref(false)
  const findQuery = ref('')
  const replaceQuery = ref('')

  const MAX_TABS = 20
  const activeTab = computed(() => tabs.value.find(t => t.id === activeTabId.value) || null)
  const tabCount = computed(() => tabs.value.length)

  function openTab(tab: EditorTab) {
    if (tabs.value.length >= MAX_TABS) {
      closeTab(tabs.value[0].id)
    }
    const existing = tabs.value.find(t => t.chapterId === tab.chapterId)
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

  return {
    tabs, activeTabId, findVisible, findQuery, replaceQuery,
    activeTab, tabCount,
    openTab, closeTab, updateContent, markSaved,
    setAutoSaveTimer, clearAutoSaveTimer, toggleFind
  }
})
