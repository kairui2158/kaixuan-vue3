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

  const hasOutline = computed(() => outlineText.value.trim().length > 0)
  const volumeCount = computed(() => volumes.value.length)
  const totalChapters = computed(() => {
    return Object.values(chapters.value).reduce((sum, chs) => sum + chs.length, 0)
  })

  function loadProject(id: string) {
    currentProjectId.value = id
    const data = window.electronAPI.storageRead('project_' + id)
    if (data) {
      projectName.value = data.projectName || ''
      outlineText.value = data.outlineText || ''
      outlineLocked.value = data.outlineLocked || false
      settingsGenerated.value = data.settingsGenerated || false
      settings.value = data.settings || []
      volumes.value = data.volumes || []
      chapters.value = data.chapters || {}
    }
  }

  function saveProject() {
    if (!currentProjectId.value) return
    const data = {
      projectName: projectName.value,
      outlineText: outlineText.value,
      outlineLocked: outlineLocked.value,
      settingsGenerated: settingsGenerated.value,
      settings: settings.value,
      volumes: volumes.value,
      chapters: chapters.value
    }
    window.electronAPI.storageWrite('project_' + currentProjectId.value, data)
  }

  function setOutline(text: string) {
    outlineText.value = text
    saveProject()
  }

  function lockOutline() {
    outlineLocked.value = true
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

  return {
    currentProjectId, projectName, outlineText, outlineLocked,
    settingsGenerated, settings, volumes, chapters, projectList,
    hasOutline, volumeCount, totalChapters,
    loadProject, saveProject, setOutline, lockOutline,
    setSettings, setVolumes, setChapters, updateVolume
  }
})
