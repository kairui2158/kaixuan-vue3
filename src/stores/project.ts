import { defineStore } from 'pinia'
import { ref, computed, triggerRef } from 'vue'
import type { AiNamingData, NamingResult, NamingHistoryRecord } from '../types/aiNaming'
import { createDefaultAiNamingData, normalizeAiNaming, MAX_HISTORY, MAX_FAVORITES } from '../types/aiNaming'
import { storageKey } from '../utils/storage-key'
import type {
  MemoryData,
  MemoryEntity,
  MemoryRelation,
  MemoryEvent,
  WorldEntry,
  Foreshadowing,
  MemoryItem,
  MemoryMeta,
  MemoryChangeRecord
} from '../types/memory'
import { getChangeHistory, rollbackByChapter, rollbackTo, saveChangeRecord } from '../services/memoryVersion'

function toPlain(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value))
}

function createDefaultMemoryMeta(): MemoryMeta {
  return {
    extractionCount: 0,
    lastExtractedAt: null,
    lastFullRebuildAt: null,
    pendingCount: 0,
    totals: { entities: 0, relations: 0, events: 0, world: 0, foreshadowing: 0 }
  }
}

function createDefaultMemories(): MemoryData {
  return {
    version: 1,
    entities: [],
    relations: [],
    events: [],
    world: [],
    foreshadowing: [],
    meta: createDefaultMemoryMeta(),
    history: [],
    categories: ['情节', '人物', '世界观', '伏笔'],
    items: []
  }
}

/** 兼容旧数据：将旧 { categories, items } 结构补齐为完整 MemoryData */
function normalizeMemories(raw: any): MemoryData {
  const base = createDefaultMemories()
  if (!raw || typeof raw !== 'object') return base
  const out: MemoryData = {
    version: 1,
    entities: Array.isArray(raw.entities) ? raw.entities : [],
    relations: Array.isArray(raw.relations) ? raw.relations : [],
    events: Array.isArray(raw.events) ? raw.events : [],
    world: Array.isArray(raw.world) ? raw.world : [],
    foreshadowing: Array.isArray(raw.foreshadowing) ? raw.foreshadowing : [],
    meta: { ...base.meta, ...(raw.meta || {}) },
    history: Array.isArray(raw.history) ? raw.history : [],
    categories: Array.isArray(raw.categories) && raw.categories.length > 0
      ? raw.categories
      : base.categories,
    items: Array.isArray(raw.items) ? raw.items : []
  }
  // 未写入 totals 时重新计算，保证 meta 恒准
  out.meta.totals = {
    entities: out.entities.length,
    relations: out.relations.length,
    events: out.events.length,
    world: out.world.length,
    foreshadowing: out.foreshadowing.length
  }
  return out
}

export const useProjectStore = defineStore('project', () => {
  const currentProjectId = ref<string | null>(null)
  const lastSaveError = ref<{ time: string; keys: string[] } | null>(null)
  const projectName = ref('')
  const outlineText = ref('')
  const outlineLocked = ref(false)
  const outlineLockedText = ref('')
  const bookWordCountChars = ref(0)
  const settingsGenerated = ref(false)
  const volumesConfirmed = ref(false)
  const chaptersConfirmed = ref(false)
  const settings = ref<any[]>([])
  const volumes = ref<any[]>([])
  const chapters = ref<Record<string, any[]>>({})
  const projectList = ref<any[]>([])
  const settingsCollection = ref<{ categories: string[]; items: Record<string, any[]> }>({ categories: [], items: {} })
  const settingBindings = ref<Record<string, string[]>>({})
  const memories = ref<MemoryData>(createDefaultMemories())
  const aiNaming = ref<AiNamingData>(createDefaultAiNamingData())
  const outlineChat = ref<any[]>([])

  function nameFromOutline(text: string): string {
    const raw = text || ''
    return raw.split('\n')[0].replace(/^#+\s*/, '').replace(/\s+/g, ' ').trim().substring(0, 20) || '未命名'
  }

  function readProjectName(data: any): string {
    if (data && data.projectName) return data.projectName
    return nameFromOutline(data && data.outlineText)
  }

  async function loadProjectList() {
    projectList.value = []
    const data = await window.electronAPI.storageList()
    if (data) {
      const seen = new Set<string>()
      const list: Array<{ id: string; name: string }> = []
      for (const key of data) {
        if (!(key.startsWith(storageKey('project_')) || key.startsWith('wa_project-'))) continue
        const proj = await window.electronAPI.storageRead(key)
        if (!proj) continue
        const id = key.replace(/^wa_project[-_]/, '')
        if (seen.has(id)) continue
        seen.add(id)
        list.push({ id, name: readProjectName(proj) })
      }
      projectList.value = list
    }
  }

  const hasOutline = computed(() => outlineText.value.trim().length > 0)
  const volumeCount = computed(() => volumes.value.length)
  const totalChapters = computed(() => {
    return Object.values(chapters.value).reduce((sum, chs) => sum + chs.length, 0)
  })

  async function loadProject(id: string) {
    currentProjectId.value = id
    let data = await window.electronAPI.storageRead(storageKey('project_' + id))
    if (!data) data = await window.electronAPI.storageRead(storageKey('project-' + id))
    if (data) {
      projectName.value = readProjectName(data)
      outlineText.value = data.outlineText || ''
      outlineLocked.value = data.outlineLocked || false
      outlineLockedText.value = data.outlineLockedText || (outlineLocked.value ? outlineText.value : '')
      bookWordCountChars.value = Number(data.bookWordCount) || 0
      volumesConfirmed.value = data.volumesConfirmed || false
      chaptersConfirmed.value = data.chaptersConfirmed || false
      settingsGenerated.value = data.settingsGenerated || false
      settings.value = data.settings || []
      volumes.value = (data.volumes || []).map((vol: any) => {
        // 旧格式无 isBound：已锁定卷自动视为已绑定，保持升级前行为等价
        const isBound = vol.isBound === undefined ? !!vol.confirmed : !!vol.isBound
        const boundTo = Array.isArray(vol.boundTo) && vol.boundTo.length > 0 ? vol.boundTo : (isBound ? ['chapter-layer'] : [])
        return { ...vol, isBound, boundTo }
      })
      chapters.value = data.chapters || {}
      settingsCollection.value = data.settingsCollection || { categories: [], items: {} }
      settingBindings.value = data.settingBindings || {}
      memories.value = normalizeMemories(data.memories)
      memoryBlacklist.value = Array.isArray(data.memoryBlacklist) ? data.memoryBlacklist : []
      aiNaming.value = normalizeAiNaming(data.aiNaming)
      outlineChat.value = data.outlineChat || []
      if (volumes.value.length === 0 && outlineText.value.trim()) {
        ensureVolumesFromOutline()
        saveProject()
      }
      if (!data.projectName && projectName.value) {
        saveProject()
      }
    }
  }

  async function saveProject(): Promise<{ ok: boolean; failedKeys: string[] }> {
    if (!currentProjectId.value) {
      currentProjectId.value = 'default'
    }
    const data = {
      projectName: projectName.value,
      outlineText: outlineText.value,
      outlineLocked: outlineLocked.value,
      outlineLockedText: outlineLockedText.value,
      bookWordCount: Number(bookWordCountChars.value) || 0,
      volumesConfirmed: volumesConfirmed.value,
      chaptersConfirmed: chaptersConfirmed.value,
      settingsGenerated: settingsGenerated.value,
      settings: toPlain(settings.value),
      volumes: toPlain(volumes.value),
      chapters: toPlain(chapters.value),
      settingBindings: toPlain(settingBindings.value),
      settingsCollection: toPlain(settingsCollection.value),
      memories: toPlain(memories.value),
      memoryBlacklist: toPlain(memoryBlacklist.value),
      aiNaming: toPlain(aiNaming.value),
      outlineChat: toPlain(outlineChat.value)
    }
    const failedKeys: string[] = []
    const lastProjectOk = await window.electronAPI.storageWrite(storageKey('lastProjectId'), currentProjectId.value)
    if (!lastProjectOk) failedKeys.push('lastProjectId')
    const projectOk = await window.electronAPI.storageWrite(storageKey('project_' + currentProjectId.value), data)
    if (!projectOk) failedKeys.push('project')
    if (failedKeys.length > 0) {
      lastSaveError.value = { time: new Date().toISOString(), keys: failedKeys }
      try {
        const diag = (window as any).DiagLogger
        if (diag && typeof diag.log === 'function') {
          diag.log('error', 'storage', '项目写盘失败: ' + failedKeys.join(', '))
        }
      } catch (e) { /* diag is optional */ }
      return { ok: false, failedKeys }
    }
    lastSaveError.value = null
    return { ok: true, failedKeys: [] }
  }

  function appendOutlineChat(msg: any) {
    outlineChat.value.push(msg)
    saveProject()
  }

  function removeOutlineChatAt(index: number) {
    if (index >= 0 && index < outlineChat.value.length) {
      outlineChat.value.splice(index, 1)
      saveProject()
    }
  }

  function addNamingFavorite(item: NamingResult) {
    aiNaming.value.favorites.push(item)
    if (aiNaming.value.favorites.length > MAX_FAVORITES) {
      aiNaming.value.favorites.shift()
    }
    saveProject()
  }

  function removeNamingFavorite(id: string) {
    aiNaming.value.favorites = aiNaming.value.favorites.filter(f => f.id !== id)
    saveProject()
  }

  function addNamingHistory(record: NamingHistoryRecord) {
    aiNaming.value.history.unshift(record)
    if (aiNaming.value.history.length > MAX_HISTORY) {
      aiNaming.value.history.length = MAX_HISTORY
    }
    saveProject()
  }

  function clearNamingHistory() {
    aiNaming.value.history = []
    saveProject()
  }

  function setOutline(text: string) {
    outlineText.value = text
    saveProject()
  }

  function lockOutline() {
    outlineLockedText.value = outlineText.value
    outlineLocked.value = true
    ensureVolumesFromOutline()
    saveProject()
  }

  function unlockOutline() {
    outlineLocked.value = false
    saveProject()
  }

  const pipelineOutlineText = computed(() => {
    return outlineLocked.value && outlineLockedText.value
      ? outlineLockedText.value
      : outlineText.value
  })

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

  // ===== 实体操作 =====
  function addEntity(entity: Omit<MemoryEntity, 'id' | 'createdAt' | 'updatedAt'>) {
    const now = new Date().toISOString()
    const newEntity: MemoryEntity = {
      ...entity,
      id: 'ent_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      createdAt: now,
      updatedAt: now
    }
    memories.value.entities.push(newEntity)
    memories.value.meta.totals.entities++
    saveProject()
    return newEntity.id
  }
  function updateEntity(id: string, patch: Partial<MemoryEntity>) {
    const idx = memories.value.entities.findIndex(e => e.id === id)
    if (idx === -1) return
    const existing = memories.value.entities[idx]
    // 锁定字段保护
    for (const field of existing.lockedFields) {
      if (field in patch) delete (patch as any)[field]
    }
    memories.value.entities[idx] = { ...existing, ...patch, updatedAt: new Date().toISOString() }
    saveProject()
  }
  function deleteEntity(id: string) {
    const idx = memories.value.entities.findIndex(e => e.id === id)
    if (idx === -1) return
    memories.value.entities.splice(idx, 1)
    memories.value.meta.totals.entities--
    // 清理关联的关系
    memories.value.relations = memories.value.relations.filter(r => r.sourceId !== id && r.targetId !== id)
    saveProject()
  }
  function lockEntityField(entityId: string, field: string) {
    const ent = memories.value.entities.find(e => e.id === entityId)
    if (!ent) return
    if (!ent.lockedFields.includes(field)) ent.lockedFields.push(field)
    ent.updatedAt = new Date().toISOString()
    saveProject()
  }
  function unlockEntityField(entityId: string, field: string) {
    const ent = memories.value.entities.find(e => e.id === entityId)
    if (!ent) return
    ent.lockedFields = ent.lockedFields.filter(f => f !== field)
    ent.updatedAt = new Date().toISOString()
    saveProject()
  }

  // ===== 关系操作 =====
  function addRelation(rel: Omit<MemoryRelation, 'id' | 'createdAt' | 'updatedAt'>) {
    const now = new Date().toISOString()
    const newRel: MemoryRelation = {
      ...rel,
      id: 'rel_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      createdAt: now,
      updatedAt: now
    }
    memories.value.relations.push(newRel)
    saveProject()
    return newRel.id
  }
  function updateRelation(id: string, patch: Partial<MemoryRelation>) {
    const idx = memories.value.relations.findIndex(r => r.id === id)
    if (idx === -1) return
    if (memories.value.relations[idx].locked) return
    memories.value.relations[idx] = { ...memories.value.relations[idx], ...patch, updatedAt: new Date().toISOString() }
    saveProject()
  }
  function deleteRelation(id: string) {
    const idx = memories.value.relations.findIndex(r => r.id === id)
    if (idx === -1) return
    memories.value.relations.splice(idx, 1)
    saveProject()
  }
  function lockRelation(id: string) {
    const r = memories.value.relations.find(rel => rel.id === id)
    if (r) { r.locked = true; r.updatedAt = new Date().toISOString(); saveProject() }
  }

  // ===== 事件操作 =====
  function addEvent(evt: Omit<MemoryEvent, 'id' | 'createdAt'>) {
    const newEvent: MemoryEvent = {
      ...evt,
      id: 'evt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      createdAt: new Date().toISOString()
    }
    memories.value.events.push(newEvent)
    saveProject()
    return newEvent.id
  }
  function updateEvent(id: string, patch: Partial<MemoryEvent>) {
    const idx = memories.value.events.findIndex(e => e.id === id)
    if (idx === -1) return
    if (memories.value.events[idx].locked) return
    memories.value.events[idx] = { ...memories.value.events[idx], ...patch }
    saveProject()
  }
  function deleteEvent(id: string) {
    const idx = memories.value.events.findIndex(e => e.id === id)
    if (idx === -1) return
    memories.value.events.splice(idx, 1)
    saveProject()
  }

  // ===== 世界观操作 =====
  function addWorldEntry(entry: Omit<WorldEntry, 'id' | 'createdAt'>) {
    const newEntry: WorldEntry = {
      ...entry,
      id: 'wld_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      createdAt: new Date().toISOString()
    }
    memories.value.world.push(newEntry)
    saveProject()
    return newEntry.id
  }
  function updateWorldEntry(id: string, patch: Partial<WorldEntry>) {
    const idx = memories.value.world.findIndex(w => w.id === id)
    if (idx === -1) return
    if (memories.value.world[idx].locked) return
    memories.value.world[idx] = { ...memories.value.world[idx], ...patch }
    saveProject()
  }
  function deleteWorldEntry(id: string) {
    const idx = memories.value.world.findIndex(w => w.id === id)
    if (idx === -1) return
    memories.value.world.splice(idx, 1)
    saveProject()
  }

  // ===== 伏笔操作 =====
  function addForeshadowing(fs: Omit<Foreshadowing, 'id' | 'createdAt'>) {
    const newFs: Foreshadowing = {
      ...fs,
      id: 'fsh_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      createdAt: new Date().toISOString()
    }
    memories.value.foreshadowing.push(newFs)
    saveProject()
    return newFs.id
  }
  function updateForeshadowing(id: string, patch: Partial<Foreshadowing>) {
    const idx = memories.value.foreshadowing.findIndex(f => f.id === id)
    if (idx === -1) return
    if (memories.value.foreshadowing[idx].locked) return
    memories.value.foreshadowing[idx] = { ...memories.value.foreshadowing[idx], ...patch }
    saveProject()
  }
  function deleteForeshadowing(id: string) {
    const idx = memories.value.foreshadowing.findIndex(f => f.id === id)
    if (idx === -1) return
    memories.value.foreshadowing.splice(idx, 1)
    saveProject()
  }

  // ===== 黑名单操作 =====
  const memoryBlacklist = ref<string[]>([])
  function addToBlacklist(entityId: string) {
    if (!memoryBlacklist.value.includes(entityId)) {
      memoryBlacklist.value.push(entityId)
      saveProject()
    }
  }
  function removeFromBlacklist(entityId: string) {
    memoryBlacklist.value = memoryBlacklist.value.filter(id => id !== entityId)
    saveProject()
  }
  function isBlacklisted(entityId: string): boolean {
    return memoryBlacklist.value.includes(entityId)
  }

  // ===== 元数据操作 =====
  function updateMemoryMeta(patch: Partial<MemoryMeta>) {
    memories.value.meta = { ...memories.value.meta, ...patch }
    saveProject()
  }
  function recalculateMemoryTotals() {
    memories.value.meta.totals = {
      entities: memories.value.entities.length,
      relations: memories.value.relations.length,
      events: memories.value.events.length,
      world: memories.value.world.length,
      foreshadowing: memories.value.foreshadowing.length
    }
    saveProject()
  }

  async function recordMemoryChange(nextData: MemoryData, options: { chapterId: string; chapterIndex?: number; reason?: string; timestamp?: string }) {
    const before = memories.value
    const next = normalizeMemories(nextData)
    const record = saveChangeRecord(before.history, before, next, options)
    next.history = [...(before.history || []), record]
    memories.value = next
    await saveProject()
    return record.id
  }

  function getMemoryChangeHistory(): MemoryChangeRecord[] {
    return getChangeHistory(memories.value.history)
  }

  function rollbackMemoryTo(versionId: string, reason?: string) {
    const result = rollbackTo(memories.value, memories.value.history, versionId, { chapterId: 'rollback', reason })
    if (!result) return false
    memories.value = result.data
    saveProject()
    return true
  }

  function rollbackMemoryByChapter(chapterId: string, chapterIndex?: number, reason?: string) {
    const result = rollbackByChapter(memories.value, memories.value.history, chapterId, chapterIndex, { chapterId: 'rollback', reason })
    if (!result) return false
    memories.value = result.data
    saveProject()
    return true
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

  
  function migrateSettingsToCollection() {
    if (settings.value.length > 0 && Object.keys(settingsCollection.value.items).length === 0) {
      for (const s of settings.value) {
        const cat = s.category || '\u5176\u4ed6'
        if (!settingsCollection.value.categories.includes(cat)) {
          settingsCollection.value.categories.push(cat)
        }
        if (!settingsCollection.value.items[cat]) {
          settingsCollection.value.items[cat] = []
        }
        const attrsMig = (s.attrs && typeof s.attrs === 'object' && !Array.isArray(s.attrs)) ? s.attrs : {}
        const contentMig = s.attrsText || (Object.keys(attrsMig).length > 0 ? JSON.stringify(attrsMig) : '')
        if (Object.keys(attrsMig).length === 0 && contentMig) {
          attrsMig['\u63cf\u8ff0'] = contentMig
        }
        settingsCollection.value.items[cat].push({
          id: 'set_' + Date.now() + '_' + Math.random().toString(36).substr(2,6),
          name: s.name || '\u672a\u547d\u540d',
          category: cat,
          content: contentMig,
          attrs: attrsMig,
          isBound: !!s.isBound || (s.settingBindings && s.settingBindings.length > 0) || false,
          boundTo: (s.boundTo && s.boundTo.length) ? s.boundTo : (s.isBound ? ['pipeline'] : []),
          createdAt: Date.now(),
          updatedAt: Date.now()
        })
      }
      settings.value = []
      saveProject()
    }
  }

  function ensureSettingsCollection() {
    if (!settingsCollection.value.categories) settingsCollection.value.categories = []
    if (!settingsCollection.value.items) settingsCollection.value.items = {}
    for (const cat of settingsCollection.value.categories) {
      const arr = settingsCollection.value.items[cat] || []
      for (const it of arr) {
        if (it.category !== cat) it.category = cat
        if (it.isBound === undefined) it.isBound = false
        if (!it.boundTo) it.boundTo = []
      }
    }
    migrateSettingsToCollection()
  }

  function getSettingsCollection() {
    ensureSettingsCollection()
    return settingsCollection.value
  }

  function appendSettingsToCollection(items: any[]) {
    ensureSettingsCollection()
    let count = 0
    for (const item of items) {
      if (!item || !item.name) continue
      const cat = (item.category || '其他').toString()
      const name = item.name.toString()
      const existing = settingsCollection.value.items[cat] || []
      if (existing.some((e: any) => e.name === name)) continue
      if (!settingsCollection.value.categories.includes(cat)) {
        settingsCollection.value.categories.push(cat)
      }
      if (!settingsCollection.value.items[cat]) settingsCollection.value.items[cat] = []
      settingsCollection.value.items[cat].push({
        id: 'set_' + Date.now() + '_' + Math.random().toString(36).substr(2,6),
        name: name,
        category: cat,
        content: item.attrsText || item.content || '',
        attrs: item.attrs && typeof item.attrs === 'object' && !Array.isArray(item.attrs)
          ? item.attrs
          : { '描述': item.attrsText || item.content || '' },
        isBound: false,
        boundTo: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      })
      count++
    }
    if (count > 0) {
      settingsGenerated.value = true
      saveProject()
    }
  }

  function clearCurrent() {
    currentProjectId.value = null
    projectName.value = ''
    outlineText.value = ''
    outlineLocked.value = false
    outlineLockedText.value = ''
    bookWordCountChars.value = 0
    settingsGenerated.value = false
    volumesConfirmed.value = false
    chaptersConfirmed.value = false
    settings.value = []
    volumes.value = []
    chapters.value = {}
    settingsCollection.value = { categories: [], items: {} }
    settingBindings.value = {}
    memories.value = createDefaultMemories()
    memoryBlacklist.value = []
    aiNaming.value = createDefaultAiNamingData()
    outlineChat.value = []
  }

  function createProject(name: string, outline: string) {
    const id = 'p' + Date.now()
    clearCurrent()
    currentProjectId.value = id
    projectName.value = name || nameFromOutline(outline) || '未命名'
    outlineText.value = outline || ''
    ensureVolumesFromOutline()
    saveProject()
    loadProjectList()
    return id
  }
  async function deleteProject(id: string) {
    // Remove both storage formats used by current and legacy project records.
    await window.electronAPI.storageRemove('wa_project_' + id)
    await window.electronAPI.storageRemove(storageKey('project_' + id))
    await window.electronAPI.storageRemove('wa_project-' + id)
    // Also remove old ProjectManager formats that could trigger recovery
    await window.electronAPI.storageRemove('project-' + id)
    await window.electronAPI.storageRemove('wa_projects')
    if (currentProjectId.value === id) {
      clearCurrent()
      await window.electronAPI.storageRemove(storageKey('lastProjectId'))
    }
    await loadProjectList()
    if (projectList.value.length === 0) {
      await window.electronAPI.storageRemove(storageKey('lastProjectId'))
      // Force clean all legacy project keys to prevent ghost projects
      const allKeys = await window.electronAPI.storageList()
      if (allKeys) {
        for (const k of allKeys) {
          if (k.startsWith('wa_project-') || k.startsWith('wa_project_')) {
            await window.electronAPI.storageRemove(k)
          }
        }
      }
      await window.electronAPI.storageRemove('wa_projects')
      await loadProjectList()
    }
  }


  function selectProject(id: string) {
    loadProject(id)
  }

  return {
    currentProjectId, projectName, outlineText, outlineLocked, outlineLockedText, pipelineOutlineText, bookWordCountChars,
    lastSaveError,
    settingsGenerated, settings, volumes, chapters, projectList,
    hasOutline, volumeCount, totalChapters,
    volumesConfirmed, chaptersConfirmed,
    loadProject, loadProjectList, saveProject, setOutline, lockOutline, unlockOutline,
    clearCurrent, createProject, deleteProject, selectProject,
    syncTreeToPipeline, refreshTree, setVolumes, setChapters, updateVolume,
    confirmVolumes() { volumesConfirmed.value = true; saveProject() },
    confirmChapters() { chaptersConfirmed.value = true; saveProject() },
    settingsCollection, getSettingsCollection, ensureSettingsCollection, appendSettingsToCollection, settingBindings,
    memories, addMemoryCategory, addMemory, updateMemory, deleteMemory,
    addEntity, updateEntity, deleteEntity, lockEntityField, unlockEntityField,
    addRelation, updateRelation, deleteRelation, lockRelation,
    addEvent, updateEvent, deleteEvent,
    addWorldEntry, updateWorldEntry, deleteWorldEntry,
    addForeshadowing, updateForeshadowing, deleteForeshadowing,
    memoryBlacklist, addToBlacklist, removeFromBlacklist, isBlacklisted,
    updateMemoryMeta, recalculateMemoryTotals, recordMemoryChange, getMemoryChangeHistory,
    rollbackMemoryTo, rollbackMemoryByChapter,
    outlineChat, appendOutlineChat, removeOutlineChatAt,
    aiNaming, addNamingFavorite, removeNamingFavorite, addNamingHistory, clearNamingHistory
  }
})


