<template>
  <section id="editor-panel" class="editor-panel">
    <div v-if="flashClass" :class="flashClass" class="tool-flash-overlay"></div>
    <div class="editor-header">
      <span v-if="activeTab?.mode" id="editor-mode-badge" class="editor-mode-badge" :class="'mode-' + activeTab.mode">{{ modeLabel }}</span>
      <span id="editor-title" class="editor-title">{{ activeTab ? activeTab.title : '选择章节开始写作' }}</span>
      <div class="editor-toolbar">
        <div class="editor-toolbar-group">
          <button id="btn-undo" class="btn-sm btn-secondary" type="button" data-tooltip="Ctrl+Z" @click="undo"><AppIcon name="undo" /></button>
          <button id="btn-redo" class="btn-sm btn-secondary" type="button" data-tooltip="Ctrl+Y" @click="redo"><AppIcon name="redo" /></button>
        </div>
        <span class="sep"></span>
       <div class="editor-toolbar-group">
          <button id="btn-generate-content" class="btn-sm btn-secondary" @click="generateContent">生成</button>
          <button id="btn-save-editor" class="btn-sm btn-secondary" data-tooltip="Ctrl+S" @click="save">保存</button>
          <button v-if="isBodyMode" id="btn-extract-memory" class="btn-sm btn-secondary" :disabled="memoryExtraction.loading || !activeTab?.content?.trim()" @click="extractCurrentMemory">
            {{ memoryExtraction.loading ? '抽取中...' : '提取记忆' }}
          </button>
        </div>
       <span class="sep"></span>
       <div class="editor-toolbar-group" style="position:relative">
          <button id="btn-find" class="btn-sm btn-secondary" data-tooltip="查找替换 (Ctrl+F)" @click="editorStore.toggleFind()">查找</button>
          <button id="btn-fold" class="btn-sm btn-secondary" :disabled="!canFold" data-tooltip="折叠当前标题" @click="toggleCurrentFold">折叠</button>
          <button id="btn-outline" class="btn-sm btn-secondary" type="button" :disabled="!activeTab" data-tooltip="大纲导航" @click="outlineVisible = !outlineVisible">大纲</button>
          <button id="btn-bookmark" class="btn-sm btn-secondary" type="button" :disabled="!activeTab" data-tooltip="书签列表" @click="bookmarkVisible = !bookmarkVisible"><AppIcon name="bookmark" /></button>
          <button id="btn-export" class="btn-sm btn-secondary" @click="exportMenu = !exportMenu">导出</button>
          <div v-if="exportMenu" id="export-dropdown" class="export-dropdown">
            <button id="btn-export-md" data-format="md" @click="exportChapter('md')">Markdown (.md)</button>
            <button id="btn-export-txt" data-format="txt" @click="exportChapter('txt')">纯文本 (.txt)</button>
            <button id="btn-export-epub" data-format="epub" @click="exportChapter('epub')">EPUB (.epub)</button>
          </div>
        </div>
        <span class="sep"></span>
       <div class="editor-toolbar-group">
          <button id="btn-de-ai" class="btn-sm btn-secondary" @click="triggerDeAi" :disabled="deAiStore.isProcessing">{{ deAiStore.isProcessing ? '处理中 ' + deAiStore.progress + '%' : '去AI味' }}</button>
          <button
            v-if="deAiStore.hardruleEnabled && deAiStore.hardRuleMode !== 'legacy-auto'"
            id="btn-deai-report"
            class="btn-sm btn-secondary"
            data-tooltip="查看最近一次降AI检测报告"
            :disabled="!deAiStore.lastDetectReport"
            @click="showDeAiReport"
          >检测报告</button>
          <button id="btn-ai-names" class="btn-sm btn-secondary" data-tooltip="AI命名" @click="aiNames">AI命名</button>
          <button id="btn-editor-run-trace" class="btn-sm btn-secondary" data-tooltip="查看主页编辑器运行记录" @click="showRunTrace = true">运行记录</button>
       </div>
        <span id="word-count" class="word-count">{{ wordCount }} 字</span>
      </div>
    </div>

    <div class="chapter-tabs" v-if="editorStore.tabs.length > 0">
      <div
        v-for="tab in editorStore.tabs"
        :key="tab.id"
        class="tab"
        :class="{ active: tab.id === editorStore.activeTabId }"
        @click="switchEditorTab(tab.id)"
      >
        <span>{{ tab.title }}</span>
        <span v-if="tab.isDirty" class="dot">*</span>
        <button class="tab-close" type="button" aria-label="关闭章节标签" @click.stop="editorStore.closeTab(tab.id)"><AppIcon name="x" /></button>
      </div>
    </div>

    <div id="find-replace-bar" class="find-bar" v-if="editorStore.findVisible">
      <span id="find-count" class="find-count" v-if="findMatchCount > 0">{{ findMatchIndex + 1 }}/{{ findMatchCount }}</span>
      <span id="find-error" class="find-error" v-if="searchError">{{ searchError }}</span>
      <span id="find-feedback" class="find-feedback" v-if="searchFeedback">{{ searchFeedback }}</span>
      <input id="find-input" v-model="editorStore.findQuery" placeholder="查找..." class="find-input" @keydown.enter.exact.prevent="findNext" @keydown.enter.shift.prevent="findPrev" />
      <input id="replace-input" v-model="editorStore.replaceQuery" placeholder="替换为..." class="find-input" />
      <label class="find-option"><input id="find-case-sensitive" v-model="searchCaseSensitive" type="checkbox">区分大小写</label>
      <label class="find-option"><input id="find-whole-word" v-model="searchWholeWord" type="checkbox">全词匹配</label>
      <label class="find-option"><input id="find-use-regex" v-model="searchUseRegex" type="checkbox">正则</label>
      <button id="btn-find-prev" class="btn-sm btn-secondary" @click="findPrev">上一个</button>
      <button id="btn-find-next" class="btn-sm btn-secondary" @click="findNext">下一个</button>
      <button id="btn-find-all" class="btn-sm btn-secondary" :disabled="folded" @click="selectAllMatches">全部选中</button>
      <button id="btn-replace-one" class="btn-sm btn-secondary" @click="replaceOne">替换</button>
          <button id="btn-replace-all" class="btn-sm btn-secondary" @click="replaceAll">全部替换</button>
      <button id="btn-find-close" class="find-close" type="button" aria-label="关闭查找替换" @click="editorStore.toggleFind()"><AppIcon name="x" /></button>
    </div>

    <div v-if="bookmarkVisible" id="editor-bookmark-bar" class="bookmark-bar">
      <button id="btn-bookmark-add" class="btn-sm btn-secondary" type="button" :disabled="!activeTab" @click="addBookmarkAtCursor">添加当前光标书签</button>
      <div v-if="activeBookmarks.length === 0" id="bookmark-empty" class="bookmark-empty">当前页签暂无书签</div>
      <div v-else id="bookmark-list" class="bookmark-list">
        <button
          v-for="bookmark in activeBookmarks"
          :id="'bookmark-item-' + bookmark.id"
          :key="bookmark.id"
          class="bookmark-item"
          type="button"
          @click="goToBookmark(bookmark)"
        >
          <span class="bookmark-label">{{ bookmark.label || ('第 ' + (bookmark.line + 1) + ' 行') }}</span>
          <span class="bookmark-line">第 {{ bookmark.line + 1 }} 行</span>
          <span class="bookmark-remove" role="button" tabindex="0" :data-bookmark-id="bookmark.id" @click.stop="removeBookmark(bookmark.id)">删除</span>
        </button>
      </div>
    </div>

    <div class="editor-main-area">
    <div class="editor-viewport-wrap">
    <div v-if="folded" class="editor-fold-banner">
      <span>折叠视图只读</span>
      <button id="btn-fold-expand" class="btn-sm btn-secondary" type="button" @click="unfoldAll">展开</button>
    </div>
    <textarea id="editor-content"
      ref="editorTextarea"
      class="editor-content"
      :value="displayedContent"
      @input="onInput"
      placeholder="请先创建或打开项目，然后选择左侧章节开始写作..."
      :disabled="!activeTab"
      @keydown="onKeydown"
      @compositionstart="multiCursorComposing = true"
      @compositionend="multiCursorComposing = false"
      @select="captureSelectionSnapshot(activeTab?.content || '')"
      @mouseup="checkInlineMenu"
      @blur="hideInlineMenu"
    ></textarea>
    <div ref="editorViewportMirror" class="editor-viewport-mirror" aria-hidden="true"></div>
    <div ref="editorViewportHighlight" class="editor-viewport-highlight-layer" aria-hidden="true"></div>
    <div ref="editorSearchHighlightLayer" class="editor-search-highlight-layer" aria-hidden="true"></div>
    <div ref="editorMultiCursorLayer" class="editor-multi-cursor-layer" aria-hidden="true"></div>
    </div>
    <EditorOutlinePanel
      :visible="outlineVisible"
      :content="activeTab?.content || ''"
      @close="outlineVisible = false"
      @locate="goToOutlineHeading"
    />
    </div>
   <div v-if="inlineMenuVisible" class="inline-menu" :style="{ left: inlineMenuPos.x + 'px', top: inlineMenuPos.y + 'px' }">
     <button v-for="a in inlineActions" :key="a.key" class="inline-menu-btn" @mousedown.prevent="applyInlineAction(a.key, a.label)">{{ a.label }}</button>
   </div>
    <div v-if="memoryExtraction.previewVisible" data-modal-id="editor-memory-preview" class="modal-overlay modal-nested" :style="{ zIndex: modalQueue.getZIndex('editor-memory-preview') }" @click.self="closeMemoryPreview">
      <section class="editor-memory-modal" role="dialog" aria-modal="true" aria-labelledby="editor-memory-title">
        <header class="editor-memory-header"><strong id="editor-memory-title">记忆变更预览</strong><button class="modal-close" type="button" aria-label="关闭记忆变更预览" @click.stop="closeMemoryPreview"><AppIcon name="x" /></button></header>
        <div class="editor-memory-body">
          <p class="editor-memory-hint">正文已经保存。确认后才会写入记忆库，可逐条拒绝或锁定。</p>
          <p v-if="memoryExtraction.loading">正在提取正文中的人物、事件、关系和世界观...</p>
          <p v-else-if="memoryExtraction.error" class="editor-memory-error">{{ memoryExtraction.error }}</p>
          <p v-else-if="memoryExtraction.changes.length === 0">本章没有检测到新的记忆变更。</p>
          <ul v-else class="editor-memory-list">
            <li v-for="(change, index) in memoryExtraction.changes" :key="index" :class="{ rejected: change.review === 'rejected', locked: change.review === 'locked' }">
              <span>{{ change.kind }} · {{ change.name || change.id || '未命名条目' }} · {{ change.action }}</span>
              <span class="editor-memory-actions"><button class="btn-sm btn-secondary" @click="memoryExtraction.toggleReview(index)">{{ change.review === 'rejected' ? '恢复' : '拒绝' }}</button><button class="btn-sm btn-secondary" @click="memoryExtraction.toggleLock(index)">{{ change.review === 'locked' ? '解锁' : '锁定' }}</button></span>
            </li>
          </ul>
        </div>
        <footer class="editor-memory-footer"><button class="btn-sm btn-secondary" type="button" @click="closeMemoryPreview">取消</button><button class="btn-sm btn-primary" type="button" :disabled="memoryExtraction.loading || memoryExtraction.saving || !!memoryExtraction.error" @click="confirmMemoryPreview">确认写入记忆</button></footer>
      </section>
    </div>
 </section>
 <RunTracePanel :visible="showRunTrace" default-source="home" @close="showRunTrace = false" />

</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'
import { useDeAi } from '../../composables/useDeAi'
import { useAppConfirm } from '../../composables/useAppConfirm'
import { useEditorStore } from '../../stores/editor'
import { useProjectStore } from '../../stores/project'
import { useDeAiStore } from '../../stores/deai'
import { useSettingsStore } from '../../stores/settings'
import { useMemoryExtraction } from '../../composables/useMemoryExtraction'
import { useModalQueue } from '../../composables/useModalQueue'
import { unifiedMemoryAiCall } from '../../services/memoryExtractor'
import { useProviderStore } from '../../stores/provider'
import RunTracePanel from '../common/RunTracePanel.vue'
import EditorOutlinePanel from './EditorOutlinePanel.vue'
import { useRunTraceStore } from '../../stores/runTrace'
import { useAiCallTrace } from '../../composables/useAiCallTrace'
import { createTextareaViewport, type EditorViewport } from '../../services/editorViewport'
import { applyFold, computeFoldRanges, toggleFoldForSelection, type FoldRange } from '../../services/editorFolding'
import { buildEditorReplacementPlan, computeEditorMatches, type SearchOptions } from '../../services/editorReplace'
import { buildSearchHighlightPlan, computeSearchMatches } from '../../services/editorSearch'
import {
  advanceSnapshotAfterExternalWrite,
  planExternalWriteSelectionRestore,
  planFoldSelectionRestore,
  planTabSwitchSelectionRestore,
  type EditorSelectionSnapshot,
} from '../../services/editorSelectionRestore'
import {
  buildMultiCursorEditPlan,
  buildSelectionSetFromMatches,
  type MultiCursorCommand,
  type NormalizedSelection,
} from '../../services/editorSelectionModel'

const editorStore = useEditorStore()
const projectStore = useProjectStore()
const appConfirm = useAppConfirm()
const deAiStore = useDeAiStore()
const settingsStore = useSettingsStore()
const providerStore = useProviderStore()
const runTraceStore = useRunTraceStore()
const showRunTrace = ref(false)
const { process: deAiProcess } = useDeAi()
const memoryExtraction = reactive(useMemoryExtraction(unifiedMemoryAiCall))
const modalQueue = useModalQueue()

watch(() => memoryExtraction.previewVisible, visible => {
  if (visible) modalQueue.open('editor-memory-preview')
  else modalQueue.close('editor-memory-preview')
}, { immediate: true })

// Verification bridge for responsive E2E; no runtime behavior depends on it.
;(globalThis as any).__editorMemoryState = {
  get previewVisible() { return memoryExtraction.previewVisible },
  set previewVisible(value: boolean) { memoryExtraction.previewVisible = value },
  get loading() { return memoryExtraction.loading },
  set loading(value: boolean) { memoryExtraction.loading = value },
  get error() { return memoryExtraction.error },
  set error(value: string) { memoryExtraction.error = value },
  get changes() { return memoryExtraction.changes },
  set changes(value: any[]) { memoryExtraction.changes = value }
}
const editorTextarea = ref<HTMLTextAreaElement | null>(null)
const editorViewportMirror = ref<HTMLDivElement | null>(null)
const editorViewportHighlight = ref<HTMLDivElement | null>(null)
const editorSearchHighlightLayer = ref<HTMLDivElement | null>(null)
const editorMultiCursorLayer = ref<HTMLDivElement | null>(null)
let editorViewport: EditorViewport | null = null
const exportMenu = ref(false)
let autoSaveTimer: ReturnType<typeof setInterval> | null = null

const findMatchCount = ref(0)
const findMatchIndex = ref(-1)
const searchCaseSensitive = ref(true)
const searchWholeWord = ref(false)
const searchUseRegex = ref(false)
const searchFeedback = ref('')
const multiCursorSelection = ref<NormalizedSelection | null>(null)
const multiCursorBaseContent = ref('')
const multiCursorComposing = ref(false)
const bookmarkVisible = ref(false)
const outlineVisible = ref(false)

const inlineActions = [
  {key:'rewrite',label:'改写'},{key:'expand',label:'扩写'},
  {key:'polish',label:'润色'},{key:'regenerate',label:'重写'},
  {key:'translate',label:'翻译'},{key:'style',label:'风格'},
  {key:'scene',label:'场景描写'},{key:'dialogue',label:'对话生成'},
  {key:'plot',label:'情节推演'},{key:'inject',label:'上下文注入'},
  {key:'continue',label:'续写'},{key:'condense',label:'精简'},{key:'modify',label:'修改'},
  {key:'summary',label:'概括'},{key:'character',label:'角色描写'},
  {key:'environment',label:'环境描写'},{key:'psychology',label:'心理描写'},
  {key:'pacing',label:'节奏调整'},{key:'foreshadow',label:'伏笔铺垫'},
  {key:'conflict',label:'冲突强化'},{key:'emotion',label:'情感强化'}
]
const inlineMenuVisible = ref(false)
const collapsedFoldIds = ref<string[]>([])
const inlineMenuPos = ref({ x: 0, y: 0 })
let selectionSnapshot: EditorSelectionSnapshot | null = null

function captureSelectionSnapshot(originalContent: string) {
  if (!activeTab.value || !editorTextarea.value) return
  selectionSnapshot = {
    documentId: activeTab.value.id,
    content: originalContent,
    start: folded.value
      ? foldedDocument.value?.toOriginalOffset(editorTextarea.value.selectionStart) ?? 0
      : editorTextarea.value.selectionStart,
    end: folded.value
      ? foldedDocument.value?.toOriginalOffset(editorTextarea.value.selectionEnd) ?? 0
      : editorTextarea.value.selectionEnd,
  }
}

function recordSelectionRestore(
  source: 'external-write' | 'fold' | 'tab-switch',
  plan: ReturnType<typeof planExternalWriteSelectionRestore>,
) {
  const diag = (window as any).DiagLogger
  const detail = {
    source,
    mode: plan.mode,
    reason: plan.reason,
    start: plan.start,
    end: plan.end,
  }
  runTraceStore.addSourceEvent('home', {
    type: 'selection-restore',
    level: plan.mode === 'reset' ? 'warn' : 'info',
    label: `编辑器选区恢复：${plan.mode}`,
    detail: JSON.stringify(detail),
    selectionRestoreMode: plan.mode,
  })
  diag?.log?.(plan.mode === 'reset' ? 'warn' : 'info', 'editor-selection', '编辑器选区恢复', detail)
}

function applySelectionRestorePlan(
  source: 'external-write' | 'fold' | 'tab-switch',
  plan: ReturnType<typeof planExternalWriteSelectionRestore>,
) {
  if (plan.mode === 'auto' && typeof plan.start === 'number' && typeof plan.end === 'number') {
    const textarea = editorTextarea.value
    if (textarea) {
      textarea.setSelectionRange(plan.start, plan.end)
    }
  } else if (plan.mode === 'reset') {
    const textarea = editorTextarea.value
    if (textarea) {
      textarea.setSelectionRange(0, 0)
    }
    if (source !== 'fold') selectionSnapshot = null
  }
  recordSelectionRestore(source, plan)
}

type HomeToolTrace = ReturnType<typeof useAiCallTrace>

async function runTracedHomeTool(
  operation: string,
  run: (trace: HomeToolTrace) => Promise<void> | void,
  _successLabel: string
) {
  const provider = providerStore.activeGenerateProvider
  const previousRunId = runTraceStore.getRunId('home')
  if (previousRunId) {
    runTraceStore.cancelRunningApiCalls(previousRunId, '新的主页工具运行开始，上一条运行已取消')
    runTraceStore.finishRun(previousRunId, 'canceled', '新的主页工具运行开始，上一条运行已取消')
  }
  const trace = useAiCallTrace({
    source: 'home',
    stepName: operation,
    mode: 'editor-tool',
    projectId: projectStore.currentProjectId || 'default',
    projectName: projectStore.projectName,
    providerId: provider?.id,
    providerName: provider?.name,
    model: provider?.selectedModel || provider?.models?.[0],
    target: {
      type: activeTab.value?.mode || 'main',
      id: activeTab.value?.id || 'main',
      name: activeTab.value?.title || '主页编辑器',
      activeTab: activeTab.value?.title || '未打开页签'
    }
  })
  trace.begin()
  trace.addEvent({
    type: 'tool-entry',
    label: operation + '入口',
    level: 'info',
    detail: activeTab.value ? `${activeTab.value.title}（${activeTab.value.mode || '正文'}）` : '未打开页签'
  })
  try {
    await run(trace)
    trace.finish('success')
  } catch (error: any) {
    trace.fail(error)
  }
}

 const activeTab = computed(() => editorStore.activeTab)
const foldRanges = computed<FoldRange[]>(() => activeTab.value ? computeFoldRanges(activeTab.value.content || '') : [])
const foldedDocument = computed(() => collapsedFoldIds.value.length > 0
  ? applyFold(activeTab.value?.content || '', collapsedFoldIds.value)
  : null)
const folded = computed(() => !!foldedDocument.value)
const displayedContent = computed(() => foldedDocument.value?.content ?? activeTab.value?.content ?? '')
const canFold = computed(() => foldRanges.value.length > 0)
const searchOptions = computed<SearchOptions>(() => ({
  caseSensitive: searchCaseSensitive.value,
  wholeWord: searchWholeWord.value,
  useRegex: searchUseRegex.value,
}))
const searchModel = computed(() => computeEditorMatches(
  activeTab.value?.content || '',
  editorStore.findVisible ? editorStore.findQuery : '',
  searchOptions.value,
))
const searchError = computed(() => searchModel.value.error)
const searchMatches = computed(() => computeSearchMatches(
  folded.value ? '' : activeTab.value?.content || '',
  editorStore.findVisible ? editorStore.findQuery : '',
  searchOptions.value,
))

function renderSearchHighlights() {
  const layer = editorSearchHighlightLayer.value
  if (!layer) return
  if (!editorStore.findVisible || folded.value || !editorStore.findQuery.trim()) {
    layer.replaceChildren()
    return
  }
  const textarea = editorTextarea.value
  if (!textarea || !editorViewport) {
    layer.replaceChildren()
    return
  }
  const plan = buildSearchHighlightPlan({
    matches: searchMatches.value,
    activeIndex: findMatchIndex.value,
    measureOffset: offset => editorViewport!.measureOffset(offset),
    viewportWidth: textarea.clientWidth,
    lineWindow: editorViewport.getLineWindow(),
    getLine: offset => editorViewport!.getLine(offset),
  })
  layer.replaceChildren(...plan.map(rectangle => {
    const item = document.createElement('div')
    item.className = rectangle.active
      ? 'editor-search-highlight editor-search-highlight-active'
      : 'editor-search-highlight'
    item.style.left = `${rectangle.left}px`
    item.style.top = `${rectangle.top}px`
    item.style.width = `${rectangle.width}px`
    item.style.height = `${rectangle.height}px`
    return item
  }))
}

function recordMultiCursorEvent(
  type: 'find-all' | 'multi-cursor-edit' | 'multi-cursor-conflict' | 'multi-cursor-downgrade',
  level: 'info' | 'warn',
  detail: Record<string, unknown>,
) {
  const labels = {
    'find-all': '查找全部选中',
    'multi-cursor-edit': '多光标编辑',
    'multi-cursor-conflict': '多光标版本冲突',
    'multi-cursor-downgrade': '多光标降级',
  } as const
  const payload = { documentId: activeTab.value?.id, ...detail }
  runTraceStore.addSourceEvent('home', {
    type,
    level,
    label: labels[type],
    detail: JSON.stringify(payload),
  })
  ;(typeof window !== 'undefined' ? (window as any).DiagLogger : null)?.log?.(
    level,
    type,
    labels[type],
    payload,
  )
}

function renderMultiCursors() {
  const layer = editorMultiCursorLayer.value
  if (!layer) return
  const selection = multiCursorSelection.value
  if (!selection || folded.value) {
    layer.replaceChildren()
    return
  }
  const textarea = editorTextarea.value
  if (!textarea || !editorViewport) {
    layer.replaceChildren()
    return
  }
  const lineWindow = editorViewport.getLineWindow()
  const primary = selection.cursors[selection.primaryIndex ?? 0]
  layer.replaceChildren(...selection.cursors.map((cursor, index) => {
    const offset = Math.min(cursor.anchor, cursor.focus)
    const item = document.createElement('div')
    item.className = index === (selection.primaryIndex ?? 0)
      ? 'editor-multi-cursor editor-multi-cursor-primary'
      : 'editor-multi-cursor'
    if (editorViewport!.getLine(offset) >= lineWindow.startLine
      && editorViewport!.getLine(offset) <= lineWindow.endLine) {
      const rect = editorViewport!.measureOffset(offset)
      item.style.left = `${rect.left}px`
      item.style.top = `${rect.top}px`
      item.style.height = `${rect.height}px`
    } else {
      item.style.display = 'none'
    }
    return item
  }))
  if (primary) {
    const primaryOffset = Math.min(primary.anchor, primary.focus)
    textarea.setSelectionRange(primaryOffset, primaryOffset)
  }
}

function scheduleMultiCursorRepaint() {
  requestAnimationFrame(renderMultiCursors)
}

function clearMultiCursorSelection(reason: string, level: 'info' | 'warn' = 'info') {
  if (!multiCursorSelection.value) return
  multiCursorSelection.value = null
  multiCursorBaseContent.value = ''
  const type = level === 'warn' ? 'multi-cursor-conflict' : 'multi-cursor-downgrade'
  recordMultiCursorEvent(type, level, { reason, cursorCount: 0 })
  scheduleMultiCursorRepaint()
}

function selectAllMatches() {
  if (folded.value || !activeTab.value) return
  const content = activeTab.value.content || ''
  if (searchError.value || searchMatches.value.length === 0) return
  multiCursorSelection.value = buildSelectionSetFromMatches({
    matches: searchMatches.value,
    contentLength: content.length,
    primaryIndex: 0,
  })
  multiCursorBaseContent.value = content
  recordMultiCursorEvent('find-all', 'info', {
    cursorCount: multiCursorSelection.value.cursors.length,
    matchCount: searchMatches.value.length,
  })
  editorTextarea.value?.focus()
  scheduleMultiCursorRepaint()
}

function runMultiCursorCommand(command: MultiCursorCommand) {
  const selection = multiCursorSelection.value
  const textarea = editorTextarea.value
  const content = activeTab.value?.content || ''
  if (!selection || !textarea || !activeTab.value) return false
  if (multiCursorComposing.value || folded.value) return false
  if (multiCursorBaseContent.value !== content) {
    clearMultiCursorSelection('document-version-changed', 'warn')
    return false
  }
  const plan = buildMultiCursorEditPlan({ content, selection, command })
  if (plan.status !== 'applied') {
    clearMultiCursorSelection('version-conflict', 'warn')
    return false
  }
  editorStore.pushUndoTransactionForTab(activeTab.value.id, content, 'manual', '多光标编辑')
  editorStore.updateContent(activeTab.value.id, plan.next)
  multiCursorSelection.value = plan.selection
  multiCursorBaseContent.value = plan.next
  recordMultiCursorEvent('multi-cursor-edit', 'info', {
    command: command.type,
    cursorCount: plan.selection.cursors.length,
    changedCursors: plan.changedCursors,
    beforeLength: content.length,
    afterLength: plan.next.length,
  })
  scheduleMultiCursorRepaint()
  return true
}

function syncTextareaContent() {
  if (editorTextarea.value && activeTab.value) {
    if (editorTextarea.value.value !== displayedContent.value) {
      editorTextarea.value.value = displayedContent.value
    }
  }
}

function unfoldAll() {
  const snapshot = selectionSnapshot
  collapsedFoldIds.value = []
  requestAnimationFrame(() => {
    syncTextareaContent()
    if (snapshot) {
      applySelectionRestorePlan('fold', planFoldSelectionRestore({ snapshot, foldedDocument: null }))
    }
  })
}

function toggleCurrentFold() {
  if (!editorTextarea.value || !activeTab.value) return
  const snapshot = folded.value
    ? selectionSnapshot
    : {
        documentId: activeTab.value.id,
        content: activeTab.value.content || '',
        start: foldedDocument.value?.toOriginalOffset(editorTextarea.value.selectionStart)
          ?? editorTextarea.value.selectionStart,
        end: foldedDocument.value?.toOriginalOffset(editorTextarea.value.selectionEnd)
          ?? editorTextarea.value.selectionEnd,
      }
  if (snapshot) selectionSnapshot = snapshot
  const selectionStart = folded.value
    ? foldedDocument.value?.toOriginalOffset(editorTextarea.value.selectionStart)
      ?? editorTextarea.value.selectionStart
    : editorTextarea.value.selectionStart
  const selectionEnd = folded.value
    ? foldedDocument.value?.toOriginalOffset(editorTextarea.value.selectionEnd)
      ?? editorTextarea.value.selectionEnd
    : editorTextarea.value.selectionEnd
  collapsedFoldIds.value = toggleFoldForSelection(
    collapsedFoldIds.value,
    foldRanges.value,
    selectionStart,
    selectionEnd,
  )
  requestAnimationFrame(() => {
    syncTextareaContent()
    if (snapshot) {
      applySelectionRestorePlan('fold', planFoldSelectionRestore({
        snapshot,
        foldedDocument: foldedDocument.value,
      }))
    }
  })
}

function switchEditorTab(tabId: string) {
  if (editorStore.activeTabId === tabId) return
  const snapshot = selectionSnapshot
  editorStore.activeTabId = tabId
  requestAnimationFrame(() => {
    if (snapshot) {
      applySelectionRestorePlan('tab-switch', planTabSwitchSelectionRestore(snapshot))
    }
  })
}

watch(displayedContent, () => {
  requestAnimationFrame(() => syncTextareaContent())
  requestAnimationFrame(renderSearchHighlights)
  scheduleMultiCursorRepaint()
})
watch([
  () => editorStore.findVisible,
  () => editorStore.findQuery,
  () => editorStore.activeTabId,
  searchOptions,
  searchMatches,
  findMatchIndex,
  findMatchCount,
], () => {
  requestAnimationFrame(renderSearchHighlights)
  scheduleMultiCursorRepaint()
})
const modeLabel = computed(() => {
  const m = activeTab.value?.mode
  if (m === 'vol-outline') return '卷纲层'
  if (m === 'ch-plot') return '剧情/概要'
  if (m === 'ch-body') return '正文层'
  return ''
})
const isBodyMode = computed(() => !activeTab.value?.mode || activeTab.value.mode === 'ch-body')
const wordCount = computed(() => {
  if (!activeTab.value) return 0
  return (activeTab.value.content || '').length
})
const activeBookmarks = computed(() => activeTab.value ? editorStore.listBookmarks(activeTab.value.id) : [])

function goToOutlineHeading(heading: { startOffset: number }) {
  if (!activeTab.value) return
  if (folded.value) unfoldAll()
  const offset = Math.max(0, Math.min(activeTab.value.content.length, heading.startOffset))
  requestAnimationFrame(() => {
    if (!editorTextarea.value || !activeTab.value) return
    editorTextarea.value.focus()
    editorViewport?.revealTarget({ start: offset, end: offset, focus: 'center' })
  })
}

function addBookmarkAtCursor() {
  if (!activeTab.value || !editorTextarea.value) return
  const offset = folded.value
    ? Math.max(0, Math.min(activeTab.value.content.length, foldedDocument.value?.toOriginalOffset(editorTextarea.value.selectionStart) ?? 0))
    : editorTextarea.value.selectionStart
  editorStore.addBookmark(activeTab.value.id, activeTab.value.content || '', offset, '')
  projectStore.setEditorBookmarks(editorStore.bookmarks)
  projectStore.saveProject()
}

function goToBookmark(bookmark: { id: string; documentId: string; offset: number }) {
  if (!activeTab.value || activeTab.value.id !== bookmark.documentId) return
  if (folded.value) unfoldAll()
  const offset = Math.max(0, Math.min(activeTab.value.content.length, bookmark.offset))
  requestAnimationFrame(() => {
    if (!editorTextarea.value || !activeTab.value) return
    editorTextarea.value.focus()
    editorTextarea.value.setSelectionRange(offset, offset)
    editorViewport?.revealTarget({ start: offset, end: offset, focus: 'center' })
  })
}

function removeBookmark(bookmarkId: string) {
  editorStore.deleteBookmark(bookmarkId)
  projectStore.setEditorBookmarks(editorStore.bookmarks)
  projectStore.saveProject()
}

function sameBookmarks(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? [])
}

watch(() => editorStore.bookmarks, () => {
  if (!sameBookmarks(projectStore.editorBookmarks, editorStore.bookmarks)) {
    projectStore.setEditorBookmarks(editorStore.bookmarks)
    projectStore.saveProject()
  }
}, { deep: true })

watch(() => projectStore.editorBookmarks, (persisted) => {
  if (!sameBookmarks(persisted, editorStore.bookmarks)) {
    editorStore.setBookmarks(persisted)
  }
}, { deep: true })

function onInput(e: Event) {
  if (folded.value) {
    unfoldAll()
    return
  }
  const target = e.target as HTMLTextAreaElement
  if (activeTab.value) {
    editorStore.updateContent(activeTab.value.id, target.value)
  }
}

function onKeydown(e: KeyboardEvent) {
  const key = e.key.toLowerCase()
  if (multiCursorSelection.value && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (e.key === 'Enter') {
      e.preventDefault()
      runMultiCursorCommand({ type: 'newline' })
      return
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      runMultiCursorCommand({ type: e.key === 'Delete' ? 'delete_forward' : 'delete_backward' })
      return
    }
    if (e.key.length === 1 && !multiCursorComposing.value) {
      e.preventDefault()
      runMultiCursorCommand({ type: 'insert', text: e.key })
      return
    }
  }
  if (e.ctrlKey && key === 's') {
    e.preventDefault()
    save()
  }
  if (e.ctrlKey && key === 'f') {
    e.preventDefault()
    editorStore.toggleFind()
  }
}

async function save() {
  if (folded.value) unfoldAll()
  if (!activeTab.value) {
    void appConfirm.alert('请先选择或创建一个章节');
    return;
  }
  // P3-FIX: Save to different fields based on editor mode (old framework saveEditorContent)
  const mode = activeTab.value.mode || 'ch-body'
  if (mode === 'vol-outline' && activeTab.value.chapterId === '') {
    // Save volume outline
    for (const vol of projectStore.volumes) {
      const volId = vol.id || vol.name
      if (('vol-outline-' + volId) === activeTab.value.id) {
        vol.outline = activeTab.value.content
        projectStore.saveProject()
        break
      }
    }
    editorStore.markSaved(activeTab.value.id)
    return
  }
  if (mode === 'ch-plot' && activeTab.value.chapterId) {
    // Save chapter plot
    for (const volId of Object.keys(projectStore.chapters)) {
      const chs = projectStore.chapters[volId]
      const ch = chs.find((c: any) => c.id === activeTab.value!.chapterId)
      if (ch) {
        ch.plot = activeTab.value.content
        projectStore.saveProject()
        break
      }
    }
    editorStore.markSaved(activeTab.value.id)
    return
  }
  // ch-body mode: save body
  if (activeTab.value && activeTab.value.chapterId) {
    for (const volId of Object.keys(projectStore.chapters)) {
      const chs = projectStore.chapters[volId]
      const ch = chs.find((c: any) => c.id === activeTab.value!.chapterId)
      if (ch) {
        ch.body = activeTab.value.content
        const chapterIndex = ch.index ?? Object.values(projectStore.chapters).flat().findIndex((item: any) => item.id === ch.id)
        await projectStore.recordSourceVersion(ch.id, Math.max(0, chapterIndex), activeTab.value.content)
        await projectStore.saveProject()
        projectStore.refreshTree()
        break
      }
    }
  }
  if (activeTab.value) {
    editorStore.markSaved(activeTab.value.id)
  }
}

async function extractCurrentMemory() {
  const tab = activeTab.value
  if (!tab || !tab.chapterId || !tab.content.trim()) return
  await runTracedHomeTool('提取记忆', async (trace) => {
    save()
    const index = Object.values(projectStore.chapters).flat().findIndex((item: any) => item.id === tab.chapterId)
    const sourceVersionId = await projectStore.recordSourceVersion(tab.chapterId, Math.max(0, index), tab.content)
    await memoryExtraction.startWithTrace(
      { id: tab.chapterId, index: Math.max(0, index), title: tab.title, content: tab.content, sourceVersionId },
      (prompt, systemPrompt) => unifiedMemoryAiCall(prompt, systemPrompt, trace)
    )
  }, '记忆预览已生成')
}

function closeMemoryPreview() {
  memoryExtraction.close()
}

async function confirmMemoryPreview() {
  const tab = activeTab.value
  await runTracedHomeTool('记忆事务', async (trace) => {
    const committed = await memoryExtraction.confirm()
    if (committed) return
    trace.addEvent({
      type: 'tracking_commit',
      level: 'error',
      label: '记忆事务提交被拒绝',
      detail: JSON.stringify({
        chapterId: memoryExtraction.chapter?.id || tab?.chapterId || null,
        code: memoryExtraction.lastCommitCode || 'unknown',
        message: memoryExtraction.lastCommitError || memoryExtraction.error || '未知事务错误',
        rebuilt: memoryExtraction.lastCommitCode === 'stale_state'
      })
    })
    throw new Error(memoryExtraction.lastCommitError || '记忆事务提交被拒绝')
  }, '记忆事务已提交')
}

function undo() {
  if (folded.value) unfoldAll()
  const prev = activeTab.value ? editorStore.undoTab(activeTab.value.id) : null
  if (prev !== null && activeTab.value) {
    editorStore.updateContent(activeTab.value.id, prev)
    if (editorTextarea.value) editorTextarea.value.value = prev
    recordUndoAction('undo', prev)
  }
}

function redo() {
  if (folded.value) unfoldAll()
  const next = activeTab.value ? editorStore.redoTab(activeTab.value.id) : null
  if (next !== null && activeTab.value) {
    editorStore.updateContent(activeTab.value.id, next)
    if (editorTextarea.value) editorTextarea.value.value = next
    recordUndoAction('redo', next)
  }
}

function recordUndoAction(action: 'undo' | 'redo', content: string) {
  const detail = {
    documentId: activeTab.value?.id,
    action,
    origin: 'manual',
    contentLength: content.length,
  }
  runTraceStore.addSourceEvent('home', {
    type: 'editor-undo',
    level: 'info',
    label: `主页编辑器${action === 'undo' ? '撤销' : '重做'}：manual`,
    detail: JSON.stringify(detail),
  })
  ;(typeof window !== 'undefined' ? (window as any).DiagLogger : null)?.log?.(
    'info',
    'editor-undo',
    `主页编辑器${action === 'undo' ? '撤销' : '重做'}`,
    detail,
  )
}

function generateContent() {
  void runTracedHomeTool('生成正文', async () => {
    if (!activeTab.value || !activeTab.value.chapterId) {
      void appConfirm.alert('请先选择一个章节');
      throw new Error('未选择章节，未进入正文生成')
    }
    const event = new CustomEvent('generate-body', { detail: { chapterId: activeTab.value.chapterId } });
    window.dispatchEvent(event);
  }, '已打开正文生成')
}

async function triggerDeAi() {
  if (!activeTab.value) return
  if (deAiStore.skillIds.length === 0) {
    void appConfirm.alert('请先在设置-去AI味页面配置技能')
    return
  }
  try {
    const text = activeTab.value.content
    const result = await deAiProcess(text)
    if (result) {
      editorStore.updateContent(activeTab.value.id, result)
    }
  } catch (e: any) {
    void appConfirm.alert('去AI味处理失败: ' + (e.message || String(e)))
  }
}

function exportChapter(format: string) {
  if (!activeTab.value) return
  exportMenu.value = false
  const content = activeTab.value.content || ''
  const title = activeTab.value.title || 'untitled'
  let mime = 'text/plain'
  let ext = 'txt'
  let body: string | Uint8Array = content
  if (format === 'md') { mime = 'text/markdown'; ext = 'md' }
  else if (format === 'txt') { mime = 'text/plain'; ext = 'txt' }
 else if (format === 'epub') { mime = 'application/epub+zip'; ext = 'epub' }
  if (format === 'epub') {
    // Build a minimal valid EPUB (XHTML wrapped in a simple structure)
    var escapedTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    var escapedContent = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>')
    var xhtml = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml"><head><title>' + escapedTitle + '</title></head><body><h1>' + escapedTitle + '</h1><p>' + escapedContent + '</p></body></html>'
    var containerXml = '<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'
    var contentOpf = '<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-id="bookid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>' + escapedTitle + '</dc:title><dc:identifier id="bookid">urn:uuid:' + Date.now() + '</dc:identifier><dc:language>zh</dc:language></metadata><manifest><item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/></manifest><spine toc="ncx"><itemref idref="chapter1"/></spine></package>'
    var tocNcx = '<?xml version="1.0" encoding="UTF-8"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="urn:uuid:' + Date.now() + '"/></head><docTitle><text>' + escapedTitle + '</text></docTitle><navMap><navPoint id="np1" playOrder="1"><navLabel><text>' + escapedTitle + '</text></navLabel><content src="chapter1.xhtml"/></navPoint></navMap></ncx>'
    // Build a minimal ZIP file containing the EPUB structure
    // Using a simple ZIP builder since we cannot use external libraries
    var files = [
      { name: 'mimetype', content: 'application/epub+zip', store: true },
      { name: 'META-INF/container.xml', content: containerXml, store: false },
      { name: 'OEBPS/content.opf', content: contentOpf, store: false },
      { name: 'OEBPS/toc.ncx', content: tocNcx, store: false },
      { name: 'OEBPS/chapter1.xhtml', content: xhtml, store: false }
    ]
    body = buildEpubZip(files)
  }
 const blob = new Blob([body], { type: mime + ';charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = title + '.' + ext
  a.click()
  URL.revokeObjectURL(url)
}

function startAutoSave() {
  if (autoSaveTimer) clearInterval(autoSaveTimer)
  const interval = (settingsStore.autoSaveInterval || 30) * 1000
  autoSaveTimer = setInterval(() => {
    if (activeTab.value && activeTab.value.isDirty) {
      save()
    }
  }, interval)
}

onMounted(() => {
  startAutoSave()
  if (editorTextarea.value) {
    editorViewport = createTextareaViewport({
      textarea: editorTextarea.value,
      mirror: editorViewportMirror.value || document.createElement('div'),
      highlightLayer: editorViewportHighlight.value || undefined,
    })
    unsubscribeSearchHighlightScroll = editorViewport.onViewportScroll(scheduleSearchHighlightRepaint)
  }
  requestAnimationFrame(renderSearchHighlights)
})
projectStore.startProjectAutoSave(settingsStore.autoSaveInterval || 30)
onUnmounted(() => {
  unsubscribeSearchHighlightScroll?.()
  unsubscribeSearchHighlightScroll = null
  if (searchHighlightScrollFrame !== null) {
    cancelAnimationFrame(searchHighlightScrollFrame)
    searchHighlightScrollFrame = null
  }
  editorViewport?.dispose()
  editorViewport = null
  if (autoSaveTimer) clearInterval(autoSaveTimer)
  projectStore.stopProjectAutoSave()
  window.removeEventListener('editor-undo', handleUndoEvent)
  window.removeEventListener('editor-redo', handleRedoEvent)
  window.removeEventListener('editor-external-change', handleExternalChangeEvent)
  window.removeEventListener('editor-save', handleSaveEvent)
  window.removeEventListener('toggle-find', handleToggleFindEvent)
  window.removeEventListener('diff-locate', handleDiffLocate)
  window.removeEventListener('editor-follow-progress', handleEditorFollowProgress)
  window.removeEventListener('editor-stop-follow', handleEditorStopFollow)
  window.removeEventListener('tool-activity', handleToolActivity)
  window.removeEventListener('restore-session', handleRestoreSession)
})
function handleUndoEvent() { undo() }
function handleRedoEvent() { redo() }
function handleExternalChangeEvent(event: Event) {
  const detail = (event as CustomEvent).detail
  if (!activeTab.value || detail?.tabId !== activeTab.value.id || typeof detail?.content !== 'string') return
  clearMultiCursorSelection('external-write', 'info')
  const snapshotBeforeWrite = selectionSnapshot
    ?? (editorTextarea.value
      ? {
          documentId: activeTab.value.id,
          content: editorTextarea.value.value,
          start: folded.value
            ? foldedDocument.value?.toOriginalOffset(editorTextarea.value.selectionStart) ?? 0
            : editorTextarea.value.selectionStart,
          end: folded.value
            ? foldedDocument.value?.toOriginalOffset(editorTextarea.value.selectionEnd) ?? 0
            : editorTextarea.value.selectionEnd,
        }
      : null)
  selectionSnapshot = snapshotBeforeWrite
  if (folded.value) unfoldAll()
  if (editorTextarea.value && editorTextarea.value.value !== detail.content) {
    editorTextarea.value.value = detail.content
  }
  if (snapshotBeforeWrite) {
    const plan = planExternalWriteSelectionRestore({
      snapshot: snapshotBeforeWrite,
      documentId: activeTab.value.id,
      nextContent: detail.content,
    })
    applySelectionRestorePlan('external-write', plan)
    selectionSnapshot = advanceSnapshotAfterExternalWrite({
      snapshot: snapshotBeforeWrite,
      documentId: activeTab.value.id,
      nextContent: detail.content,
      plan,
    })
  } else {
    selectionSnapshot = null
    recordSelectionRestore('external-write', { mode: 'none', reason: 'no-snapshot' })
  }
}
function handleSaveEvent() {
  // 退出前的最终保存走此事件：无打开标签时静默跳过，避免弹窗阻断退出
  if (activeTab.value) save()
}
function handleRestoreSession(event: Event) {
  const detail = (event as CustomEvent).detail
  if (!detail || !detail.cid) return
  for (const volId of Object.keys(projectStore.chapters)) {
    const chs = projectStore.chapters[volId]
    const ch = chs.find((c: any) => c.id === detail.cid)
    if (ch) {
      editorStore.openTab({
        id: 'ch-body-' + ch.id,
        title: ch.title || '未命名',
        content: ch.body || '',
        chapterId: ch.id,
        isDirty: false,
        mode: 'ch-body'
      })
      break
    }
  }
}
function handleToggleFindEvent() { editorStore.toggleFind() }
onMounted(() => {
  startAutoSave()
  window.addEventListener('editor-undo', handleUndoEvent)
  window.addEventListener('editor-redo', handleRedoEvent)
  window.addEventListener('editor-external-change', handleExternalChangeEvent)
  window.addEventListener('editor-save', handleSaveEvent)
  window.addEventListener('toggle-find', handleToggleFindEvent)
  window.addEventListener('diff-locate', handleDiffLocate)
  window.addEventListener('editor-follow-progress', handleEditorFollowProgress)
  window.addEventListener('editor-stop-follow', handleEditorStopFollow)
  window.addEventListener('tool-activity', handleToolActivity)
  window.addEventListener('restore-session', handleRestoreSession)
})

// P7: 编辑器实时反馈 — AI 读写时高亮/闪烁/滚动
// 经验引用: §1 M4（隐藏状态保护）闪烁标记是临时状态，不改 tab.isDirty
let flashTimer: ReturnType<typeof setTimeout> | null = null
function handleToolActivity(event: Event) {
  const detail = (event as CustomEvent).detail as {
    type: 'tool_start' | 'tool_result' | 'tool_error'
    toolName: string
    targetId?: string
    policy: 'read' | 'write'
  }
  if (!detail) return
  // 如果指定了 targetId 且不是当前 tab，切换到该 tab
  if (detail.targetId && detail.targetId !== editorStore.activeTabId) {
    editorStore.activeTabId = detail.targetId
  }
  // 清除之前的闪烁
  if (flashTimer) { clearTimeout(flashTimer); flashTimer = null }
  // 设置闪烁标记
  flashClass.value = 'tool-flash-' + detail.policy
  // 1.5 秒后自动移除
  flashTimer = setTimeout(() => { flashClass.value = '' }, 1500)
}

const flashClass = ref('')
let searchHighlightScrollFrame: number | null = null
let unsubscribeSearchHighlightScroll: (() => void) | null = null

function scheduleSearchHighlightRepaint() {
  if (searchHighlightScrollFrame !== null) return
  searchHighlightScrollFrame = requestAnimationFrame(() => {
    searchHighlightScrollFrame = null
    renderSearchHighlights()
    renderMultiCursors()
  })
}

function handleDiffLocate(event: Event) {
  const detail = (event as CustomEvent).detail
  if (!detail || detail.workspace !== 'main' || !editorTextarea.value) return
  if (folded.value) unfoldAll()
  if (detail.targetId && editorStore.activeTabId !== detail.targetId) {
    editorStore.activeTabId = detail.targetId
  }
  const start = Math.max(0, Number(detail.range?.start) || 0)
  const end = Math.max(start, Number(detail.range?.end) || start)
  editorTextarea.value.focus()
  if (editorViewport) {
    editorViewport.revealTarget({ start, end, focus: 'center' })
  } else {
    editorTextarea.value.setSelectionRange(start, end)
  }
}
function handleEditorFollowProgress(event: Event) {
  const detail = (event as CustomEvent).detail
  if (!detail || detail.workspace !== 'main' || !editorTextarea.value) return
  if (folded.value) unfoldAll()
  if (detail.targetId && editorStore.activeTabId !== detail.targetId) {
    editorStore.activeTabId = detail.targetId
  }
  const start = Math.max(0, Number(detail.start) || 0)
  const end = Math.max(start, Number(detail.end) || start)
  if (editorViewport) editorViewport.followWriteProgress(start, end)
}
function handleEditorStopFollow() {
  editorViewport?.stopFollow()
}
function findNext() {
  if (folded.value) unfoldAll()
  if (!editorTextarea.value || !editorStore.findQuery) return
  if (searchError.value) {
    showSearchFeedback(searchError.value)
    return
  }
  const text = editorTextarea.value.value
  const matches = searchMatches.value
  findMatchCount.value = matches.length
  if (matches.length === 0) {
    findMatchIndex.value = -1
    return
  }
  // find current position
 let curPos = editorTextarea.value.selectionEnd
  let nextIdx = matches.findIndex(match => match.start >= curPos)
  if (nextIdx < 0) nextIdx = 0
  findMatchIndex.value = nextIdx
  const idx = matches[nextIdx].start
  editorTextarea.value.setSelectionRange(idx, idx + editorStore.findQuery.length)
  editorViewport?.revealTarget({ start: idx, end: idx + editorStore.findQuery.length, focus: 'center' })
  requestAnimationFrame(renderSearchHighlights)
}

function showSearchFeedback(message: string) {
  searchFeedback.value = message
  setTimeout(() => {
    if (searchFeedback.value === message) searchFeedback.value = ''
  }, 2500)
}

function buildEpubZip(files: any[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const contentBytes = enc.encode(f.content);
    const lh = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(lh.buffer);
    dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0, true);
    dv.setUint16(8, 0, true); dv.setUint16(10, 0, true); dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true); lh.set(nameBytes, 30);
    chunks.push(lh, contentBytes);
    const cd = new Uint8Array(46 + nameBytes.length);
    const cdv = new DataView(cd.buffer);
    cdv.setUint32(0, 0x02014b50, true); cdv.setUint16(4, 20, true); cdv.setUint16(6, 20, true);
    cdv.setUint16(8, 0, true); cdv.setUint16(10, 0, true); cdv.setUint16(12, 0, true);
    cdv.setUint16(16, 0, true); cdv.setUint16(18, 0, true); cdv.setUint16(20, 0, true);
    cdv.setUint16(24, nameBytes.length, true); cdv.setUint16(26, 0, true); cdv.setUint16(28, 0, true);
    cdv.setUint16(32, 0, true); cdv.setUint16(34, 0, true); cdv.setUint32(38, 0, true);
    cdv.setUint32(42, offset, true); cd.set(nameBytes, 46);
    central.push(cd);
    offset += lh.length + contentBytes.length;
  }
  let cdSize = 0; for (const c2 of central) cdSize += c2.length;
  const cdOffset = offset;
  const eocd = new Uint8Array(22);
  const edv = new DataView(eocd.buffer);
  edv.setUint32(0, 0x06054b50, true); edv.setUint16(8, central.length, true);
  edv.setUint16(10, central.length, true); edv.setUint32(12, cdSize, true);
  edv.setUint32(16, cdOffset, true);
  const all: Uint8Array[] = [...chunks, ...central, eocd];
  let total = 0; for (const a of all) total += a.length;
  const result = new Uint8Array(total);
  let pos = 0; for (const a of all) { result.set(a, pos); pos += a.length; }
  return result;
}


function aiNames() {
  void runTracedHomeTool('AI命名', async () => {
    const tab = activeTab.value
    const ta = editorTextarea.value
    const selectionStart = ta ? ta.selectionStart : 0
    const selectionEnd = ta ? ta.selectionEnd : 0
    const content = tab ? (tab.content || '') : ''
    const selectedText = content.substring(selectionStart, selectionEnd)
    window.dispatchEvent(new CustomEvent('open-ai-naming', {
      detail: {
        source: 'editor',
        target: tab ? {
          tabId: tab.id,
          chapterId: tab.chapterId,
          mode: tab.mode,
          selectionStart,
          selectionEnd,
          selectedText,
          contentSnapshot: content,
        } : undefined,
      },
    }))
  }, 'AI命名窗口已打开')
}

async function showDeAiReport() {
  const report = deAiStore.lastDetectReport
  if (!report) return
  const blocking = report.findings.filter(item => item.severity === 'blocking')
  const advisory = report.findings.filter(item => item.severity === 'advisory')
  const render = (list: typeof report.findings) => list.map(item =>
    `${item.type}：${item.count} 处（每千字 ${item.perKilo}）\n${item.samples.join('；')}\n建议：${item.suggestion}`
  ).join('\n\n')
  const content = [
    `句长变异：${report.metrics.sentenceLengthCV}`,
    `连接词密度：${report.metrics.connectorDensity}`,
    `保护片段：${report.metrics.protectedSpans.hit}/${report.metrics.protectedSpans.total}`,
    '',
    blocking.length > 0 ? `【需处理】\n${render(blocking)}` : '【需处理】无',
    '',
    advisory.length > 0 ? `【建议】\n${render(advisory)}` : '【建议】无'
  ].join('\n')
  await appConfirm.alert({ title: '降AI检测报告', message: content, confirmText: '知道了' })
}

function findPrev() {
  if (folded.value) unfoldAll()
  if (!editorTextarea.value || !editorStore.findQuery) return
  if (searchError.value) {
    showSearchFeedback(searchError.value)
    return
  }
  const text = editorTextarea.value.value
  const matches = searchMatches.value
  findMatchCount.value = matches.length
  if (matches.length === 0) {
    findMatchIndex.value = -1
    return
  }
  let curPos = editorTextarea.value.selectionStart
  let prevIdx = matches.length - 1
  for (let i = matches.length - 1; i >= 0; i--) {
    if (matches[i].start < curPos) { prevIdx = i; break }
  }
  findMatchIndex.value = prevIdx
  const idx = matches[prevIdx].start
  editorTextarea.value.setSelectionRange(idx, idx + editorStore.findQuery.length)
  editorViewport?.revealTarget({ start: idx, end: idx + editorStore.findQuery.length, focus: 'center' })
  requestAnimationFrame(renderSearchHighlights)
}

function replaceOne() {
  if (!activeTab.value || !editorStore.findQuery) return
  if (searchError.value) {
    showSearchFeedback(searchError.value)
    return
  }
  const text = activeTab.value.content
  const selStart = editorTextarea.value?.selectionStart || 0
  const selEnd = editorTextarea.value?.selectionEnd || 0
  const plan = buildEditorReplacementPlan(text, editorStore.findQuery, editorStore.replaceQuery, searchOptions.value)
  if (plan.status === 'invalid-pattern') {
    showSearchFeedback(plan.error || '查找内容无效')
    return
  }
  const item = plan.items.find(candidate => candidate.start === selStart && candidate.end === selEnd)
  if (!item) {
    findNext()
    return
  }
  const newContent = text.substring(0, item.start) + item.after + text.substring(item.end)
  recordEditorReplace('one', item.before, item.after, plan.matches.length)
  editorStore.updateContent(activeTab.value.id, newContent)
  editorTextarea.value?.setSelectionRange(item.start, item.start + item.after.length)
}

function replaceAll() {
  if (!activeTab.value || !editorStore.findQuery) return
  const content = activeTab.value.content
  const plan = buildEditorReplacementPlan(content, editorStore.findQuery, editorStore.replaceQuery, searchOptions.value)
  if (plan.status === 'invalid-pattern') {
    showSearchFeedback(plan.error || '查找内容无效')
    return
  }
  if (plan.status !== 'ready' || !plan.next) {
    showSearchFeedback(plan.status === 'no-match' ? '未找到匹配' : '替换结果与原文相同')
    return
  }
  recordEditorReplace('all', content, plan.next, plan.matches.length)
  editorStore.updateContent(activeTab.value.id, plan.next)
  requestAnimationFrame(renderSearchHighlights)
}

function recordEditorReplace(mode: 'one' | 'all', before: string, after: string, matchCount: number) {
  const detail = {
    documentId: activeTab.value?.id,
    mode,
    options: searchOptions.value,
    matchCount,
    beforeLength: before.length,
    afterLength: after.length,
  }
  runTraceStore.addSourceEvent('home', {
    type: 'editor-replace',
    level: 'info',
    label: `主页编辑器替换${mode === 'one' ? '当前匹配' : '全部匹配'}：${matchCount} 处`,
    detail: JSON.stringify(detail),
  })
  ;(typeof window !== 'undefined' ? (window as any).DiagLogger : null)?.log?.(
    'info',
    'editor-replace',
    `主页编辑器替换${mode === 'one' ? '当前匹配' : '全部匹配'}`,
    detail,
  )
}

function checkInlineMenu() {
  if (!editorTextarea.value) return
  const ta = editorTextarea.value
  const start = ta.selectionStart
  const end = ta.selectionEnd
  const text = ta.value.substring(start, end)
  if (!text || text.length < 2) {
    inlineMenuVisible.value = false
    return
  }
  const rect = ta.getBoundingClientRect()
  inlineMenuPos.value = {
    x: rect.left + 20,
    y: rect.top + 30
  }
  inlineMenuVisible.value = true
}

function hideInlineMenu() {
  setTimeout(() => { inlineMenuVisible.value = false }, 200)
}

function applyInlineAction(action: string, label: string) {
  inlineMenuVisible.value = false
  if (!editorTextarea.value) return
  const ta = editorTextarea.value
  const selectedText = ta.value.substring(ta.selectionStart, ta.selectionEnd)
  if (!selectedText) return
  let prompt: string
  if (action === 'inject') {
    prompt = '请基于以下上下文继续写作：\n\n' + selectedText
  } else {
    prompt = '【' + label + '】请对以下选中文本进行' + label + '操作：\n\n' + selectedText
  }
  window.dispatchEvent(new CustomEvent('editor-action', {
    detail: {
      action: 'inline-ai',
      prompt,
      tabId: activeTab.value?.id || '',
      selectionStart: ta.selectionStart,
      selectionEnd: ta.selectionEnd,
      selectedText
    }
  }))
}
</script>

<style scoped>
.editor-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  overflow: hidden;
  min-width: 0;
}
.bookmark-bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 42px;
  padding: var(--space-2) var(--space-6);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  overflow-x: auto;
}
.bookmark-empty {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  white-space: nowrap;
}
.bookmark-list {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.bookmark-item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  height: 28px;
  padding: 0 var(--space-3);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  white-space: nowrap;
  flex: 0 0 auto;
}
.bookmark-item:hover {
  border-color: var(--accent);
}
.bookmark-label {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bookmark-line,
.bookmark-remove {
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}
.bookmark-remove:hover {
  color: var(--accent);
}
.editor-header {
  min-height: 56px;
  height: auto;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-5);
  padding: 0 var(--space-6);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.editor-mode-badge {
  height: 22px;
  padding: 0 var(--space-5);
  border-radius: var(--radius-lg);
  background: var(--accent);
  color: var(--text-on-accent);
  font-size: var(--font-size-sm);
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  flex-shrink: 0;
}
.editor-title {
  font-size: var(--font-size-md);
  color: var(--text-secondary);
  flex: 0 1 auto;
  max-width: 200px;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.editor-toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex: 1 1 auto;
 flex-wrap: wrap;
  overflow: hidden;
 overflow-y: hidden;
 min-width: 0;
  min-height: 46px;
  padding: var(--space-2) 0;
}
.editor-toolbar-group {
  display: flex;
  gap: var(--space-3);
  flex-shrink: 0;
}
.sep {
  width: 1px;
  height: 20px;
  background: var(--border-color);
  flex-shrink: 0;
}
.word-count {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  flex-shrink: 0;
  margin-left: auto;
  white-space: nowrap;
}

@media (max-width: 1279px) {
  .editor-header { align-items: flex-start; gap: var(--space-3) var(--space-5); padding: var(--space-3) var(--space-5); }
  .editor-title { flex: 1 1 180px; max-width: none; }
  .editor-toolbar { flex: 1 1 100%; width: 100%; overflow: hidden; }
  .editor-toolbar-group { flex: 1 1 auto; min-width: 0; max-width: 100%; flex-wrap: wrap; gap: var(--space-3); }
  .editor-toolbar .sep { display: none; }
  .word-count { margin-left: auto; }
}

@media (max-width: 760px) {
  .editor-toolbar { gap: var(--space-2); }
  .editor-toolbar-group { gap: var(--space-2); }
  .word-count { flex-basis: 100%; margin-left: 0; }
}
.chapter-tabs {
  display: flex;
  gap: var(--space-1);
  padding: 0 var(--space-4);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  overflow-x: auto;
  flex-shrink: 0;
}
.tab {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-5);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: var(--radius-sm) 6px 0 0;
  border: 1px solid transparent;
  border-bottom: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px;
}
.tab > span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.tab.active {
  background: var(--bg-primary);
  color: var(--text-primary);
  border-color: var(--border-color);
}
.tab .dot {
  color: var(--warning);
}
.tab-close {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: var(--font-size-xxs);
  padding: 0 var(--space-1);
}
.tab-close:hover {
  color: var(--danger);
}
.find-bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-5);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}
.find-input {
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xs);
  padding: var(--space-1) var(--space-4);
  font-size: var(--font-size-sm);
  height: var(--density-form-height);
}
.find-error,
.find-feedback {
  color: var(--danger);
  font-size: var(--font-size-xs);
  white-space: nowrap;
}
.find-option {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  white-space: nowrap;
  user-select: none;
}
.find-option input {
  accent-color: var(--primary);
  margin: 0;
}
.find-close {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: var(--font-size-lg);
}
.editor-content {
  flex: 1;
  width: 100%;
  border: none;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--editor-font);
  font-size: var(--font-size-editor);
  line-height: var(--line-height-editor);
  padding: var(--space-8) var(--space-10);
  resize: none;
  overflow-y: auto;
}
.editor-content:disabled {
  opacity: 0.5;
}
.editor-viewport-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.editor-main-area {
  flex: 1;
  min-height: 0;
  display: flex;
}
.editor-fold-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  min-height: 30px;
  padding: var(--space-2) var(--space-6);
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  flex-shrink: 0;
}
.editor-viewport-wrap .editor-content {
  flex: 1;
  min-height: 0;
}
.editor-viewport-mirror {
  position: absolute;
  left: 0;
  top: 0;
  visibility: hidden;
  pointer-events: none;
}
.editor-viewport-highlight-layer {
  position: absolute;
  pointer-events: none;
  border-radius: var(--radius-xs);
}
.editor-viewport-highlight-layer.editor-viewport-highlight {
  background: color-mix(in srgb, var(--accent) 22%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 50%, transparent);
}
.editor-viewport-highlight-layer.editor-viewport-active-line {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 38%, transparent);
}
.editor-multi-cursor-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 5;
}

.editor-multi-cursor {
  position: absolute;
  width: 2px;
  background: var(--accent, #2563eb);
}

.editor-multi-cursor-primary {
  box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.35);
}

.editor-search-highlight-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
}
.editor-search-highlight {
  position: absolute;
  pointer-events: none;
  border-radius: var(--radius-xs);
  background: color-mix(in srgb, var(--warning, var(--accent)) 24%, transparent);
}
.editor-search-highlight-active {
  background: color-mix(in srgb, var(--accent) 42%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 62%, transparent);
}
.export-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: var(--space-2);
  z-index: var(--z-dropdown);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.export-dropdown button {
  background: none;
  border: none;
  color: var(--text-secondary);
  text-align: left;
  padding: var(--space-2) var(--space-5);
  font-size: var(--font-size-sm);
  border-radius: var(--radius-xs);
  cursor: pointer;
}
.export-dropdown button:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

#btn-de-ai { color: var(--warning); font-weight: 600; }
#btn-de-ai:hover { background: var(--warning-dim); }
#btn-de-ai:disabled { color: var(--text-muted); font-weight: 400; }

.inline-menu {
  position: fixed;
  z-index: var(--z-tooltip);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: var(--space-2);
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  max-width: 360px;
  box-shadow: var(--shadow-md);
}
.inline-menu-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  text-align: left;
  padding: var(--space-2) var(--space-5);
  font-size: var(--font-size-sm);
  border-radius: var(--radius-xs);
  cursor: pointer;
  white-space: nowrap;
}
.inline-menu-btn:hover {
  background: var(--bg-hover);
  color: var(--accent);
 }
 .editor-memory-modal {
   width: min(720px, 100%);
   max-height: min(720px, calc(100vh - 48px));
   display: flex;
   flex-direction: column;
   overflow: hidden;
   background: var(--bg-secondary);
   border: 1px solid var(--border-color);
   border-radius: var(--radius-md);
   box-shadow: var(--shadow-lg);
 }
 .editor-memory-header,
 .editor-memory-footer {
   display: flex;
   align-items: center;
   justify-content: space-between;
   gap: var(--space-6);
   padding: var(--space-6) var(--space-7);
 }
 .editor-memory-header { border-bottom: 1px solid var(--border-color); }
 .editor-memory-body { min-height: 140px; overflow: auto; padding: var(--space-6) var(--space-7); color: var(--text-primary); }
 .editor-memory-hint { color: var(--text-secondary); }
 .editor-memory-error { color: var(--danger); }
 .editor-memory-list { display: flex; flex-direction: column; gap: var(--space-4); padding: 0; margin: var(--space-5) 0 0; list-style: none; }
 .editor-memory-list li { display: flex; align-items: center; justify-content: space-between; gap: var(--space-5); padding: var(--space-5) var(--space-5); border: 1px solid var(--border-color); border-radius: var(--radius-sm); }
 .editor-memory-list li.rejected { opacity: .55; text-decoration: line-through; }
 .editor-memory-list li.locked { border-color: var(--accent); }
 .editor-memory-actions { display: flex; flex: 0 0 auto; gap: var(--space-3); }
 .editor-memory-footer { justify-content: flex-end; border-top: 1px solid var(--border-color); }
</style>
<style>
.tool-flash-overlay { position: absolute; top: 0; left: 0; right: 0; height: 3px; z-index: var(--z-sticky); pointer-events: none; }
.tool-flash-read { background: var(--accent); animation: flash-fade var(--duration-flash) var(--ease-standard); }
.tool-flash-write { background: var(--chat-status-error); animation: flash-fade var(--duration-flash) var(--ease-standard); }
@keyframes flash-fade { 0% { opacity: 1; } 100% { opacity: 0; } }
</style>



