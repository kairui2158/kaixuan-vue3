import { defineStore } from 'pinia'
import { ref } from 'vue'
import { storageKey } from '../utils/storage-key'

export const useSettingsStore = defineStore('settings', () => {
  const activeTab = ref<'api' | 'skill' | 'agent' | 'appearance' | 'deai' | 'diag' | 'mcp'>('api')
  const fontSize = ref(14)
  const theme = ref<'dark'>('dark')
  const editorFont = ref('serif')
  const autoSaveInterval = ref(30)
  const maxTabs = ref(20)
  const cdpPort = ref(9223)
  const githubToken = ref('')

 async function loadSettings() {
    let data = await window.electronAPI.storageRead(storageKey('appSettings'))
    if (!data) data = await window.electronAPI.storageRead(storageKey('app-settings'))
   if (data) {
     fontSize.value = data.fontSize || 14
      editorFont.value = data.editorFont || data.editorFontSize || 'serif'
     autoSaveInterval.value = data.autoSaveInterval || 30
      maxTabs.value = data.maxTabs || 20
      cdpPort.value = data.cdpPort || 9223
      if (data.githubToken) githubToken.value = data.githubToken
    }
  }

  async function saveSettings() {
    await window.electronAPI.storageWrite(storageKey('appSettings'), {
      fontSize: fontSize.value,
      editorFont: editorFont.value,
      autoSaveInterval: autoSaveInterval.value,
      maxTabs: maxTabs.value,
      cdpPort: cdpPort.value,
      githubToken: githubToken.value
    })
  }

  function updateSettings(data: Record<string, any>) {
    if (data.githubToken !== undefined) githubToken.value = data.githubToken
    if (data.fontSize !== undefined) fontSize.value = data.fontSize
    if (data.editorFont !== undefined) editorFont.value = data.editorFont
    if (data.autoSaveInterval !== undefined) autoSaveInterval.value = data.autoSaveInterval
    if (data.maxTabs !== undefined) maxTabs.value = data.maxTabs
    if (data.cdpPort !== undefined) cdpPort.value = data.cdpPort
    saveSettings()
  }

  function setActiveTab(tab: 'api' | 'skill' | 'agent' | 'appearance' | 'deai' | 'diag' | 'mcp') {
    activeTab.value = tab
  }

  return {
    activeTab, fontSize, theme, editorFont, autoSaveInterval, maxTabs, cdpPort, githubToken,
    loadSettings, saveSettings, updateSettings, setActiveTab
  }
})


