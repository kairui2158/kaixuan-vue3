import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useProjectStore = defineStore('project', () => {
  const currentProjectId = ref<string | null>(null)
  const projectName = ref('')
  const outlineText = ref('')
  const outlineLocked = ref(false)
  const settingsGenerated = ref(false)
  const settings = ref<any[]>([])
  const volumes = ref<any[]>([])
  const chapters = ref<Record<string, any[]>>({})
  const projectList = ref<any[]>([])
  const settingBindings = ref<Record<string, string[]>>({})
  const memories = ref<{ categories: string[]; items: any[] }>({ categories: ['情节', '人物', '世界观', '伏笔'], items: [] })
 function loadProjectList() {
   const data = window.electronAPI.storageList()
   if (data) {
     projectList.value = data
        .filter((key: string) => key.startsWith('project_') || key.startsWith('project-'))
       .map((key: string) => {
         const proj = window.electronAPI.storageRead(key)
          return { id: key.replace(/^project[-_]/, ''), name: proj?.projectName || '未命名' }
       })
   }
 }

  const hasOutline = computed(() => outlineText.value.trim().length > 0)
  const volumeCount = computed(() => volumes.value.length)
  const totalChapters = computed(() => {
    return Object.values(chapters.value).reduce((sum, chs) => sum + chs.length, 0)
  })

 function loadProject(id: string) {
   currentProjectId.value = id
    let data = window.electronAPI.storageRead('project_' + id)
    if (!data) data = window.electronAPI.storageRead('project-' + id)
   if (data) {
      projectName.value = data.projectName || ''
      outlineText.value = data.outlineText || ''
      outlineLocked.value = data.outlineLocked || false
      settingsGenerated.value = data.settingsGenerated || false
      settings.value = data.settings || []
      volumes.value = data.volumes || []
      chapters.value = data.chapters || {}
      settingBindings.value = data.settingBindings || {}
      memories.value = data.memories || { categories: ['情节', '人物', '世界观', '伏笔'], items: [] }
    }
  }

 function saveProject() {
    if (!currentProjectId.value) {
      currentProjectId.value = 'default'
    }
   const data = {
      projectName: projectName.value,
      outlineText: outlineText.value,
      outlineLocked: outlineLocked.value,
      settingsGenerated: settingsGenerated.value,
      settings: settings.value,
      volumes: volumes.value,
      chapters: chapters.value
      ,settingBindings: settingBindings.value
      ,memories: memories.value
    }
    window.electronAPI.storageWrite('project_' + currentProjectId.value, data)
  }

  function setOutline(text: string) {
    outlineText.value = text
    saveProject()
  }

  function lockOutline() {
    outlineLocked.value = true
    if (volumes.value.length === 0) {
      volumes.value.push({
        id: 'vol-' + Date.now(),
        name: '第一卷',
        outline: outlineText.value.slice(0, 500),
        summary: '',
        suggestedWords: 500000
      })
    }
    saveProject()
  }

  function setSettings(newSettings: any[]) {
    settings.value = newSettings
    settingsGenerated.value = true
    saveProject()
  }

  function setVolumes(newVolumes: any[]) {
    volumes.value = newVolumes
    saveProject()
  }

  function setChapters(volumeId: string, newChapters: any[]) {
    chapters.value[volumeId] = newChapters
    saveProject()
  }

  function updateVolume(index: number, data: Partial<any>) {
    if (volumes.value[index]) {
      volumes.value[index] = { ...volumes.value[index], ...data }
      saveProject()
    }
  }

  function addMemoryCategory(name: string) {
    memories.value.categories.push(name)
    saveProject()
  }
  function addMemory(item: any) {
    memories.value.items.push({ ...item, created: new Date().toISOString().slice(0, 10) })
    saveProject()
  }
  function updateMemory(index: number, item: any) {
    if (memories.value.items[index]) {
      memories.value.items[index] = { ...item, created: memories.value.items[index].created || new Date().toISOString().slice(0, 10) }
      saveProject()
    }
  }
  function deleteMemory(index: number) {
    memories.value.items.splice(index, 1)
    saveProject()
  }

  return {
    currentProjectId, projectName, outlineText, outlineLocked,
    settingsGenerated, settings, volumes, chapters, projectList,
    hasOutline, volumeCount, totalChapters,
    loadProject, loadProjectList, saveProject, setOutline, lockOutline,
    setSettings, setVolumes, setChapters, updateVolume
    , settingBindings
    , memories, addMemoryCategory, addMemory, updateMemory, deleteMemory
  }
})
