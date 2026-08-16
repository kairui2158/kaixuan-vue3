import { defineStore } from 'pinia'
import { ref, computed, triggerRef } from 'vue'
import { storageKey } from '../utils/storage-key'

function toPlain(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value))
}

export const useProjectStore = defineStore('project', () => {
  const currentProjectId = ref<string | null>(null)
  const projectName = ref('')
  const outlineText = ref('')
  const outlineLocked = ref(false)
  const settingsGenerated = ref(false)
  const volumesConfirmed = ref(false)
  const chaptersConfirmed = ref(false)
  const settings = ref<any[]>([])
  const volumes = ref<any[]>([])
  const chapters = ref<Record<string, any[]>>({})
  const projectList = ref<any[]>([])
  const settingBindings = ref<Record<string, string[]>>({})
  const memories = ref<{ categories: string[]; items: any[] }>({ categories: ['情节', '人物', '世界观', '伏笔'], items: [] })

  function nameFromOutline(text: string): string {
    const raw = text || ''
    return raw.split('\n')[0].replace(/^#+\s*/, '').replace(/\s+/g, ' ').trim().substring(0, 20) || '未命名'
  }

  function readProjectName(data: any): string {
    if (data && data.projectName) return data.projectName
    return nameFromOutline(data && data.outlineText)
  }

  function loadProjectList() {
    const data = window.electronAPI.storageList()
    if (data) {
      projectList.value = data
        .filter((key: string) => key.startsWith(storageKey('project_')) || key.startsWith('wa_project-'))
        .map((key: string) => {
          const proj = window.electronAPI.storageRead(key)
          return { id: key.replace(/^wa_project[-_]/, ''), name: readProjectName(proj) }
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
    let data = window.electronAPI.storageRead(storageKey('project_' + id))
    if (!data) data = window.electronAPI.storageRead(storageKey('project-' + id))
    if (data) {
      projectName.value = readProjectName(data)
      outlineText.value = data.outlineText || ''
      outlineLocked.value = data.outlineLocked || false
      volumesConfirmed.value = data.volumesConfirmed || false
      chaptersConfirmed.value = data.chaptersConfirmed || false
      settingsGenerated.value = data.settingsGenerated || false
      settings.value = data.settings || []
      volumes.value = data.volumes || []
      chapters.value = data.chapters || {}
      settingBindings.value = data.settingBindings || {}
      memories.value = data.memories || { categories: ['情节', '人物', '世界观', '伏笔'], items: [] }
      if (!data.projectName && projectName.value) {
        saveProject()
      }
    }
  }

  function saveProject() {
    if (!currentProjectId.value) {
      currentProjectId.value = 'default'
    }
    window.electronAPI.storageWrite(storageKey('lastProjectId'), currentProjectId.value)
    const data = {
      projectName: projectName.value,
      outlineText: outlineText.value,
      outlineLocked: outlineLocked.value,
      volumesConfirmed: volumesConfirmed.value,
      chaptersConfirmed: chaptersConfirmed.value,
      settingsGenerated: settingsGenerated.value,
      settings: toPlain(settings.value),
      volumes: toPlain(volumes.value),
      chapters: toPlain(chapters.value),
      settingBindings: toPlain(settingBindings.value),
      memories: toPlain(memories.value)
    }
    window.electronAPI.storageWrite(storageKey('project_' + currentProjectId.value), data)
  }

  function setOutline(text: string) {
    outlineText.value = text
    saveProject()
  }

  function lockOutline() {
    outlineLocked.value = true
    ensureVolumesFromOutline()
    saveProject()
  }

  function ensureVolumesFromOutline() {
    if (!outlineText.value.trim()) return
    if (volumes.value.length > 0) return

    const parsedVols: any[] = []
    const parsedChapters: Record<string, any[]> = {}
    const lines = outlineText.value.split('\n')
    let curVol: any = null
    let volNo = 0

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line) continue

      if ((line.startsWith('# ') && !line.startsWith('## ')) || /^第[一二三四五六七八九十\d]+卷/.test(line)) {
        const vname = line
          .replace(/^# /, '')
          .replace(/^第[一二三四五六七八九十\d]+卷[：:]?\s*/, '')
          .substring(0, 30) || ('卷' + (parsedVols.length + 1))
        volNo++
        curVol = {
          id: 'vol_' + Date.now() + '_' + volNo,
          name: vname,
          outline: '',
          summary: '',
          suggestedWords: 0,
          confirmed: false,
          locked: false
        }
        parsedVols.push(curVol)
        parsedChapters[curVol.id] = []
      } else if ((line.startsWith('## ') && !line.startsWith('### ')) || /^第[一二三四五六七八九十\d]+章/.test(line)) {
        if (!curVol) {
          volNo++
          curVol = { id: 'vol_' + Date.now() + '_' + volNo, name: '第一卷', outline: '', summary: '', suggestedWords: 0, confirmed: false, locked: false }
          parsedVols.push(curVol)
          parsedChapters[curVol.id] = []
        }
        const cname = line
          .replace(/^## /, '')
          .replace(/^第[一二三四五六七八九十\d]+章[：:]?\s*/, '')
          .substring(0, 30) || ('第' + (parsedChapters[curVol.id].length + 1) + '章')
        parsedChapters[curVol.id].push({
          id: 'ch_' + Date.now() + '_' + parsedChapters[curVol.id].length + '_' + volNo,
          title: cname,
          plot: '',
          wordCount: 0,
          confirm: false,
          body: '',
          bodyGenerated: false
        })
      }
    }

    if (parsedVols.length === 0) {
      curVol = { id: 'vol_' + Date.now() + '_1', name: '第一卷', outline: '', summary: '', suggestedWords: 0, confirmed: false, locked: false }
      parsedVols.push(curVol)
      parsedChapters[curVol.id] = []
    }

    const firstVol = parsedVols[0]
    if (!parsedChapters[firstVol.id] || parsedChapters[firstVol.id].length === 0) {
      parsedChapters[firstVol.id] = [{
        id: 'ch_' + Date.now() + '_0',
        title: '第1章',
        plot: '',
        wordCount: 0,
        confirm: false,
        body: '',
        bodyGenerated: false
      }]
    }

    volumes.value = parsedVols
    chapters.value = parsedChapters
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

  function syncTreeToPipeline() {
    const chaptersByVol = chapters.value || {}
    const vols = volumes.value || []
    for (const vol of vols) {
      const volId = vol.id || vol.name
      if (!chaptersByVol[volId]) chaptersByVol[volId] = []
    }
    chapters.value = chaptersByVol
    saveProject()
  }

  function refreshTree() {
    triggerRef(chapters)
  }

  function clearCurrent() {
    currentProjectId.value = null
    projectName.value = ''
    outlineText.value = ''
    outlineLocked.value = false
    settingsGenerated.value = false
    volumesConfirmed.value = false
    chaptersConfirmed.value = false
    settings.value = []
    volumes.value = []
    chapters.value = {}
    settingBindings.value = {}
    memories.value = { categories: ['情节', '人物', '世界观', '伏笔'], items: [] }
  }

  function createProject(name: string, outline: string) {
    const id = 'p' + Date.now()
    clearCurrent()
    currentProjectId.value = id
    projectName.value = name || nameFromOutline(outline) || '未命名'
    outlineText.value = outline || ''
    saveProject()
    loadProjectList()
    return id
  }

  function deleteProject(id: string) {
    window.electronAPI.storageRemove(storageKey('project_' + id))
    if (currentProjectId.value === id) {
      clearCurrent()
      window.electronAPI.storageRemove(storageKey('lastProjectId'))
    }
    loadProjectList()
  }

  function selectProject(id: string) {
    loadProject(id)
  }

  return {
    currentProjectId, projectName, outlineText, outlineLocked,
    settingsGenerated, settings, volumes, chapters, projectList,
    hasOutline, volumeCount, totalChapters,
    volumesConfirmed, chaptersConfirmed,
    loadProject, loadProjectList, saveProject, setOutline, lockOutline,
    clearCurrent, createProject, deleteProject, selectProject,
    syncTreeToPipeline, refreshTree, setSettings, setVolumes, setChapters, updateVolume,
    confirmVolumes() { volumesConfirmed.value = true; saveProject() },
    confirmChapters() { chaptersConfirmed.value = true; saveProject() },
    settingBindings,
    memories, addMemoryCategory, addMemory, updateMemory, deleteMemory
  }
})
