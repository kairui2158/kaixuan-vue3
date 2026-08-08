import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
  const activeTab = ref<'api' | 'skill' | 'agent' | 'appearance' | 'deai'>('api')
  const fontSize = ref(14)
  const theme = ref<'dark'>('dark')
  const editorFont = ref('serif')
  const autoSaveInterval = ref(30)
  const maxTabs = ref(20)
  const cdpPort = ref(9223)

  function loadSettings() {
    const data = window.electronAPI.storageRead('appSettings')
    if (data) {
      fontSize.value = data.fontSize || 14
      editorFont.value = data.editorFont || 'serif'
      autoSaveInterval.value = data.autoSaveInterval || 30
      maxTabs.value = data.maxTabs || 20
      cdpPort.value = data.cdpPort || 9223
    }
  }

  function saveSettings() {
    window.electronAPI.storageWrite('appSettings', {
      fontSize: fontSize.value,
      editorFont: editorFont.value,
      autoSaveInterval: autoSaveInterval.value,
      maxTabs: maxTabs.value,
      cdpPort: cdpPort.value
    })
  }

  function setActiveTab(tab: 'api' | 'skill' | 'agent' | 'appearance' | 'deai') {
    activeTab.value = tab
  }

  return {
    activeTab, fontSize, theme, editorFont, autoSaveInterval, maxTabs, cdpPort,
    loadSettings, saveSettings, setActiveTab
  }
})
