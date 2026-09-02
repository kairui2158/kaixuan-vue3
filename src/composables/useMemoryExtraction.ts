import { ref } from 'vue'
import { useProjectStore } from '../stores/project'
import { extractMemory, type ExtractedMemoryData, type MemoryAiCall } from '../services/memoryExtractor'
import { mergeMemory, type MemoryChange } from '../services/memoryMerger'

export interface ExtractionLog {
  timestamp: string
  phase: 'start' | 'request' | 'parse' | 'complete' | 'failed'
  status: 'started' | 'success' | 'failed'
  errorKind?: 'timeout' | 'network' | 'invalid_json' | 'canceled' | 'unknown'
  durationMs: number
  projectId: string
  chapterId: string
}

export interface MemoryExtractionChapter {
  id: string
  index: number
  title: string
  content: string
  sourceVersionId?: string
}

export function useMemoryExtraction(callAi: MemoryAiCall) {
  const projectStore = useProjectStore()
  const loading = ref(false)
  const saving = ref(false)
  const previewVisible = ref(false)
  const error = ref('')
  const changes = ref<Array<MemoryChange & { review: 'pending' | 'rejected' | 'locked' }>>([])
  const extracted = ref<ExtractedMemoryData | null>(null)
  const chapter = ref<MemoryExtractionChapter | null>(null)
  const logs = ref<ExtractionLog[]>([])

  function changeKey(change: MemoryChange): string {
    return `${change.kind}:${change.id || change.name || change.reason || ''}`
  }

  function toggleReview(index: number) {
    const item = changes.value[index]
    if (item && item.action !== 'skipped') item.review = item.review === 'rejected' ? 'pending' : 'rejected'
  }

  function toggleLock(index: number) {
    const item = changes.value[index]
    if (item && item.action !== 'skipped') item.review = item.review === 'locked' ? 'pending' : 'locked'
  }

  function filterReviewed(data: ExtractedMemoryData): ExtractedMemoryData {
    const rejected = new Set(changes.value.filter(item => item.review === 'rejected').map(changeKey))
    const locked = new Set(changes.value.filter(item => item.review === 'locked').map(changeKey))
    const filter = (kind: MemoryChange['kind'], values: any[]) => values.filter(value => {
      const match = changes.value.find(item => item.kind === kind &&
        ((item.id && item.id === value.id) || (item.name && item.name === value.name)))
      if (!match) return true
      return !rejected.has(changeKey(match))
    })
    const lock = (kind: MemoryChange['kind'], values: any[]) => values.map(value => {
      const match = changes.value.find(item => item.kind === kind &&
        ((item.id && item.id === value.id) || (item.name && item.name === value.name)))
      if (!match || !locked.has(changeKey(match))) return value
      const next = JSON.parse(JSON.stringify(value))
      if (kind === 'entity') next.lockedFields = Array.from(new Set([...(next.lockedFields || []), 'description', 'status', 'notes']))
      else next.locked = true
      return next
    })
    return {
      entities: lock('entity', filter('entity', data.entities || [])),
      relations: lock('relation', filter('relation', data.relations || [])),
      events: lock('event', filter('event', data.events || [])),
      world: lock('world', filter('world', data.world || [])),
      foreshadowing: lock('foreshadowing', filter('foreshadowing', data.foreshadowing || []))
    }
  }

  async function start(target: MemoryExtractionChapter) {
    if (!target.id.trim() || !target.content.trim() || loading.value) return false
    const projectIdAtCall = projectStore.currentProjectId || ''
    chapter.value = target
    loading.value = true
    const startedAt = Date.now()
    const log = (phase: ExtractionLog['phase'], status: ExtractionLog['status'], errorKind?: ExtractionLog['errorKind']) => logs.value.push({ timestamp: new Date().toISOString(), phase, status, errorKind, durationMs: Date.now() - startedAt, projectId: projectStore.currentProjectId || '', chapterId: target.id })
    log('start', 'started')
    error.value = ''
    changes.value = []
    extracted.value = null
    previewVisible.value = true
    try {
      const result = await extractMemory({
        chapterId: target.id,
        chapterIndex: target.index,
        sourceVersionId: target.sourceVersionId,
        chapterTitle: target.title,
        content: target.content
      }, callAi)
      if ((projectStore.currentProjectId || '') !== projectIdAtCall) {
        error.value = '项目已切换，已丢弃旧项目抽取结果'
        return false
      }
      if (!result.success) {
        log('failed', 'failed', result.error?.includes('超时') ? 'timeout' : 'invalid_json')
        error.value = `记忆抽取失败：${result.error || '未知错误'}。正文已保存。`
        return false
      }
      const sourceVersionId = target.sourceVersionId || ''
      const injectSource = (items: any[]) => items.map(item => ({
        ...item,
        factSource: item.factSource || { sourceVersionId, chapterId: target.id, chapterIndex: target.index, snippet: item.evidence?.[0]?.snippet || '', verified: item.evidence?.[0]?.verified ?? false },
        factStatus: item.factStatus || 'pending'
      }))
      result.data = { entities: injectSource(result.data.entities), relations: injectSource(result.data.relations), events: injectSource(result.data.events), world: injectSource(result.data.world), foreshadowing: injectSource(result.data.foreshadowing) }
      log('complete', 'success')
      extracted.value = result.data
      const merged = mergeMemory(projectStore.memories, result.data, {
        chapterId: target.id,
        chapterIndex: target.index,
        blacklist: projectStore.memoryBlacklist
      })
      changes.value = merged.changes.map(change => ({ ...change, review: 'pending' as const }))
      return true
    } catch (cause: any) {
      log('failed', 'failed', cause?.name === 'AbortError' ? 'canceled' : 'unknown')
      error.value = `记忆抽取失败：${cause?.message || '未知错误'}。正文已保存。`
      return false
    } finally {
      loading.value = false
    }
  }

  function close() {
    previewVisible.value = false
    error.value = ''
    changes.value = []
    extracted.value = null
    chapter.value = null
  }

  async function confirm() {
    if (!chapter.value || !extracted.value || saving.value) return false
    const projectIdAtCall = projectStore.currentProjectId || ''
    saving.value = true
    try {
      if ((projectStore.currentProjectId || '') !== projectIdAtCall) return false
      const reviewed = filterReviewed(extracted.value)
      const confirmed = Object.fromEntries(Object.entries(reviewed).map(([kind, values]) => [kind, (values as any[]).map(item => ({ ...item, factStatus: 'confirmed' }))])) as any
      const merged = mergeMemory(projectStore.memories, confirmed, {
        chapterId: chapter.value.id,
        chapterIndex: chapter.value.index,
        blacklist: projectStore.memoryBlacklist
      })
      await projectStore.recordMemoryChange(merged.data, {
        chapterId: chapter.value.id,
        chapterIndex: chapter.value.index,
        reason: `确认正文后写入记忆：${chapter.value.title}`
      })
      previewVisible.value = false
      error.value = ''
      changes.value = []
      extracted.value = null
      chapter.value = null
      return true
    } catch (cause: any) {
      error.value = `记忆写入失败：${cause?.message || '未知错误'}`
      return false
    } finally {
      saving.value = false
    }
  }

  return { loading, saving, previewVisible, error, changes, chapter, extracted, logs, start, close, confirm, toggleReview, toggleLock }
}
