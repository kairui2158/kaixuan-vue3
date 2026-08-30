/**
 * AI 命名 composable
 * 管理生成状态、取消、重试、结果列表、收藏与历史交互
 */

import { ref, computed, onBeforeUnmount } from 'vue'
import { useProviderStore } from '../stores/provider'
import { useAgentStore } from '../stores/agent'
import { useProjectStore } from '../stores/project'
import { generateNames, regenerateSingleName, isNamingError, isCanceledError } from '../services/namingService'
import type { NamingGenerateError } from '../services/namingService'
import type {
  NamingOptions,
  NamingResult,
  NamingType,
  NamingStatus,
  NamingInsertTarget,
} from '../types/aiNaming'
import { NAMING_TYPE_LABELS, MAX_COUNT, MIN_COUNT, MAX_HISTORY, MAX_FAVORITES } from '../types/aiNaming'

export interface OpenNamingOptions {
  /** 来源：editor / pipeline */
  source: 'editor' | 'pipeline'
  /** 编辑器目标快照（source === 'editor'） */
  target?: NamingInsertTarget
  /** 大纲上下文（source === 'pipeline'） */
  pipelineContext?: string
  /** 默认命名类型 */
  defaultType?: NamingType
}

export function useAiNaming() {
  const providerStore = useProviderStore()
  const agentStore = useAgentStore()
  const projectStore = useProjectStore()

  // 弹窗状态
  const visible = ref(false)
  const openOptions = ref<OpenNamingOptions | null>(null)

  // 当前选择的命名类型
  const currentType = ref<NamingType>('character')
  const customType = ref('')
  const context = ref('')
  const style = ref('')
  const gender = ref('')
  const species = ref('')
  const length = ref('')
  const count = ref(6)

  // 生成状态
  const status = ref<NamingStatus>('idle')
  const statusMessage = ref('')
  const progressLabel = ref('')
  const currentResults = ref<NamingResult[]>([])
  const lastRequestOptions = ref<NamingOptions | null>(null)
  const currentError = ref<NamingGenerateError | null>(null)

  // 取消控制器
  let abortController: AbortController | null = null

  // ── 弹窗控制 ───────────────────────────
  function openNaming(options: OpenNamingOptions) {
    openOptions.value = options
    visible.value = true
    if (options.defaultType) currentType.value = options.defaultType
    if (options.target) {
      // 如果有选中文本，可以作为上下文
      if (options.target.selectedText) {
        context.value = options.target.selectedText.slice(0, 500)
      }
    } else if (options.pipelineContext) {
      context.value = options.pipelineContext.slice(0, 500)
    }
    status.value = 'idle'
    statusMessage.value = ''
    currentResults.value = []
    currentError.value = null
  }

  function closeNaming() {
    cancelGeneration()
    visible.value = false
    openOptions.value = null
    currentResults.value = []
    status.value = 'idle'
    statusMessage.value = ''
    currentError.value = null
  }

  // ── 生成 ───────────────────────────────
  function buildOptions(): NamingOptions {
    return {
      type: currentType.value,
      customType: currentType.value === 'custom' ? customType.value : undefined,
      context: context.value,
      style: style.value,
      gender: currentType.value === 'character' ? gender.value : undefined,
      species: currentType.value === 'character' ? species.value : undefined,
      length: length.value || undefined,
      count: Math.max(MIN_COUNT, Math.min(MAX_COUNT, count.value)),
    }
  }

  async function doGenerate() {
    if (status.value === 'loading') return
    cancelGeneration()
    abortController = new AbortController()
    status.value = 'loading'
    statusMessage.value = '正在生成…'
    progressLabel.value = ''
    currentError.value = null
    currentResults.value = []

    const options = buildOptions()
    lastRequestOptions.value = options

    try {
      const result = await generateNames(options, { providerStore, agentStore }, abortController.signal, (label) => {
        progressLabel.value = label
      })
      currentResults.value = result.results
      if (result.filteredCount > 0 && result.validCount < options.count) {
        status.value = 'partial'
        statusMessage.value = `已生成 ${result.validCount} 个，过滤 ${result.filteredCount} 个无效项`
      } else {
        status.value = 'success'
        statusMessage.value = `已生成 ${result.validCount} 个`
      }
      // 添加到历史
      addHistory(options, result.results)
    } catch (e: any) {
      if (isCanceledError(e)) {
        status.value = 'canceled'
        statusMessage.value = '已取消'
      } else if (isNamingError(e)) {
        status.value = 'error'
        statusMessage.value = e.message
        currentError.value = e
      } else {
        status.value = 'error'
        statusMessage.value = e?.message || '未知错误'
        currentError.value = { kind: 'network', message: e?.message || '未知错误' }
      }
    } finally {
      abortController = null
      progressLabel.value = ''
    }
  }

  async function doRegenerateSingle(index: number) {
    if (status.value === 'loading') return
    if (index < 0 || index >= currentResults.value.length) return
    cancelGeneration()
    abortController = new AbortController()
    status.value = 'loading'
    statusMessage.value = `正在重新生成第 ${index + 1} 个…`
    progressLabel.value = ''
    currentError.value = null

    const options = { ...buildOptions(), count: 1 }
    lastRequestOptions.value = options

    try {
      const result = await regenerateSingleName(options, { providerStore, agentStore }, abortController.signal, (label) => {
        progressLabel.value = label
      })
      if (result) {
        currentResults.value[index] = result
        status.value = 'success'
        statusMessage.value = `已重新生成`
        addHistory(options, [result])
      } else {
        status.value = 'error'
        statusMessage.value = '重新生成未返回有效结果'
        currentError.value = { kind: 'empty', message: '重新生成未返回有效结果' }
      }
    } catch (e: any) {
      if (isCanceledError(e)) {
        status.value = 'canceled'
        statusMessage.value = '已取消'
      } else if (isNamingError(e)) {
        status.value = 'error'
        statusMessage.value = e.message
        currentError.value = e
      } else {
        status.value = 'error'
        statusMessage.value = e?.message || '未知错误'
      }
    } finally {
      abortController = null
      progressLabel.value = ''
    }
  }

  function cancelGeneration() {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
    if (status.value === 'loading') {
      status.value = 'canceled'
      statusMessage.value = '已取消'
      progressLabel.value = ''
    }
  }

  function retry() {
    if (lastRequestOptions.value) {
      doGenerate()
    }
  }

  // ── 结果编辑 ───────────────────────────
  function updateResult(index: number, patch: Partial<NamingResult>) {
    if (index >= 0 && index < currentResults.value.length) {
      currentResults.value[index] = { ...currentResults.value[index], ...patch, edited: true }
    }
  }

  // ── 收藏 ───────────────────────────────
  function isFavorited(result: NamingResult): boolean {
    return projectStore.aiNaming.favorites.some(f => f.name === result.name && f.type === result.type)
  }

  function toggleFavorite(result: NamingResult) {
    const existing = projectStore.aiNaming.favorites.find(f => f.name === result.name && f.type === result.type)
    if (existing) {
      projectStore.removeNamingFavorite(existing.id)
    } else {
      if (projectStore.aiNaming.favorites.length >= MAX_FAVORITES) {
        projectStore.removeNamingFavorite(projectStore.aiNaming.favorites[0].id)
      }
      projectStore.addNamingFavorite(result)
    }
  }

  // ── 历史 ───────────────────────────────
  function addHistory(request: NamingOptions, results: NamingResult[]) {
    projectStore.addNamingHistory({
      id: 'hist_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      request,
      results,
      createdAt: new Date().toISOString(),
    })
  }

  function restoreFromHistory(historyId: string) {
    const record = projectStore.aiNaming.history.find(h => h.id === historyId)
    if (!record) return
    currentType.value = record.request.type
    customType.value = record.request.customType || ''
    context.value = record.request.context
    style.value = record.request.style
    gender.value = record.request.gender || ''
    species.value = record.request.species || ''
    length.value = record.request.length || ''
    count.value = record.request.count
    currentResults.value = [...record.results]
    lastRequestOptions.value = record.request
    status.value = 'idle'
    statusMessage.value = '已从历史恢复'
  }

  function clearHistory() {
    projectStore.clearNamingHistory()
  }

  // ── 复制 ───────────────────────────────
  async function copyToClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Electron 降级：使用 textarea + execCommand
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(ta)
        return ok
      } catch {
        return false
      }
    }
  }

  // ── 插入编辑器 ─────────────────────────
  function insertToEditor(result: NamingResult) {
    const target = openOptions.value?.target
    if (!target) {
      // 无编辑器目标（如从流水线打开），派发通用插入事件
      window.dispatchEvent(new CustomEvent('insert-text', { detail: { text: result.name } }))
      return
    }
    window.dispatchEvent(new CustomEvent('ai-naming-insert', {
      detail: { target, text: result.name, mode: 'insert' },
    }))
  }

  function replaceSelection(result: NamingResult) {
    const target = openOptions.value?.target
    if (!target || target.selectionStart === target.selectionEnd) {
      insertToEditor(result)
      return
    }
    window.dispatchEvent(new CustomEvent('ai-naming-insert', {
      detail: { target, text: result.name, mode: 'replace' },
    }))
  }

  // ── 计算属性 ───────────────────────────
  const typeLabel = computed(() => NAMING_TYPE_LABELS[currentType.value])
  const isLoading = computed(() => status.value === 'loading')
  const hasResults = computed(() => currentResults.value.length > 0)
  const hasError = computed(() => status.value === 'error')
  const favorites = computed(() => projectStore.aiNaming.favorites)
  const history = computed(() => projectStore.aiNaming.history)
  const historyCount = computed(() => projectStore.aiNaming.history.length)
  const favoritesCount = computed(() => projectStore.aiNaming.favorites.length)
  const hasUnsavedChanges = computed(() => {
    // 有未使用的结果或正在请求中
    return status.value === 'loading' || (currentResults.value.length > 0 && status.value !== 'canceled')
  })

  onBeforeUnmount(() => {
    cancelGeneration()
  })

  return {
    // 弹窗
    visible, openOptions,
    // 参数
    currentType, customType, context, style, gender, species, length, count,
    typeLabel,
    // 生成
    status, statusMessage, progressLabel, currentResults, currentError,
    isLoading, hasResults, hasError,
    doGenerate, doRegenerateSingle, cancelGeneration, retry,
    // 结果编辑
    updateResult,
    // 收藏
    isFavorited, toggleFavorite, favorites, favoritesCount,
    // 历史
    history, historyCount, restoreFromHistory, clearHistory,
    // 复制
    copyToClipboard,
    // 插入
    insertToEditor, replaceSelection,
    // 弹窗控制
    openNaming, closeNaming,
    hasUnsavedChanges,
  }
}
