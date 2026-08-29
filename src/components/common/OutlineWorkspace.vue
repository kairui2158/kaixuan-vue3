<template>
  <div id="outline-workspace" class="ow-overlay" @click.self="$emit('close')">
    <div class="ow-content" :class="{ 'ows-fullscreen': isFullscreen }">
      <div class="ow-header">
        <span>大纲工作台</span>
        <div class="ow-header-right">
          <button
            id="btn-ow-zoom"
            class="ow-icon-btn"
            :title="isFullscreen ? '缩小' : '放大'"
            @click="isFullscreen = !isFullscreen"
          >
            <svg
              v-if="!isFullscreen"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M8 3H5a2 2 0 0 0-2 2v3"></path>
              <path d="M21 8V5a2 2 0 0 0-2-2h-3"></path>
              <path d="M3 16v3a2 2 0 0 0 2 2h3"></path>
              <path d="M16 21h3a2 2 0 0 0 2-2v-3"></path>
            </svg>
            <svg
              v-else
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M8 3H5a2 2 0 0 0-2 2v3"></path>
              <path d="M13 3h6a2 2 0 0 1 2 2v6"></path>
              <path d="M3 13v6a2 2 0 0 0 2 2h6"></path>
              <path d="M13 13h8v8h-8z"></path>
            </svg>
          </button>
          <button id="btn-ai-co-create" class="ow-chat-toggle" @click="chatAreaOpen = !chatAreaOpen">
            AI 共创大纲
          </button>
          <button id="btn-close-outline-workspace" class="modal-close" @click="$emit('close')">x</button>
        </div>
      </div>
      <div class="ow-body">
        <div class="ow-editor">
          <div class="ow-editor-header">
            <span>大纲编辑器</span>
            <div class="editor-toolbar">
              <div class="editor-toolbar-group">
                <button id="btn-ow-undo" class="btn-sm btn-secondary" title="撤销" @click="editCommand('undo')">撤销</button>
                <button id="btn-ow-redo" class="btn-sm btn-secondary" title="重做" @click="editCommand('redo')">重做</button>
                <button id="btn-ow-copy" class="btn-sm btn-secondary" title="复制选中文本" @click="copySelection">复制</button>
                <button id="btn-ow-cut" class="btn-sm btn-secondary" title="剪切选中文本" @click="editCommand('cut')">剪切</button>
                <button id="btn-ow-paste" class="btn-sm btn-secondary" title="粘贴剪贴板文本" @click="pasteText">粘贴</button>
                <button id="btn-ow-find" class="btn-sm btn-secondary" title="查找正文" @click="findOpen = !findOpen">查找</button>
                <button id="btn-export-outline-md" class="btn-sm btn-secondary ow-export-btn" @click="exportMd">.md</button>
                <button id="btn-export-outline-txt" class="btn-sm btn-secondary ow-export-btn" @click="exportTxt">.txt</button>
              </div>
            </div>
            <span id="ow-word-count" class="word-count">{{ (projectStore.outlineText || '').length }} 字</span>
          </div>
          <div v-if="findOpen" id="ow-find-bar" class="ow-find-bar">
            <input id="ow-find-input" ref="findRef" v-model="findQuery" class="ow-find-input" placeholder="查找正文..." @keydown.enter="findNext" />
            <span id="ow-find-result" class="ow-find-result">{{ findResult }}</span>
            <button id="btn-ow-find-prev" class="btn-sm btn-secondary" title="上一个匹配" @click="findPrevious">上一个</button>
            <button id="btn-ow-find-next" class="btn-sm btn-secondary" title="下一个匹配" @click="findNext">下一个</button>
            <button id="btn-ow-find-close" class="btn-sm btn-secondary" title="关闭查找" @click="closeFind">关闭</button>
          </div>
          <textarea
            id="outline-editor"
            ref="editorRef"
            v-model="projectStore.outlineText"
            class="ow-textarea"
            placeholder="在此输入或编辑你的小说大纲..."
            :readonly="projectStore.outlineLocked"
            :class="{ 'ow-readonly': projectStore.outlineLocked }"
          ></textarea>
        </div>
        <div v-show="chatAreaOpen" class="ow-chat">
          <div id="ow-chat-messages" ref="msgContainer" class="ow-messages">
            <div v-for="(msg, i) in messages" :key="i" class="ow-msg" :class="msg.role">
              <div class="ow-msg-bubble" v-html="renderMarkdown(msg.content)"></div>
              <div v-if="msg.role === 'assistant' && msg.outlineEdit" class="ow-edit-command" title="已识别为待确认的大纲编辑指令">
                已识别编辑指令：{{ msg.outlineEdit.operation }}<span v-if="msg.outlineEdit.target"> · {{ msg.outlineEdit.target }}</span>
                <button class="msg-btn" @click="previewCommand(msg.outlineEdit)">预览修改</button>
              </div>
              <div v-if="msg.role === 'assistant'" class="ow-msg-actions">
                <button class="msg-btn" title="复制" @click="copyMsg(msg.content)">复制</button>
                <button class="msg-btn" title="替换整个大纲" @click="replaceOutline(msg.content)">替换</button>
                <button class="msg-btn" title="重新生成该回复" @click="regenerateMsg(i)">重生成</button>
                <button class="msg-btn" title="插入到光标处" @click="insertAtCursor(msg.content)">插入</button>
              </div>
            </div>
            <div v-if="isGenerating" id="ow-streaming-message" class="ow-msg assistant ow-msg-streaming">
              <div class="ow-streaming-status">{{ generationStatus }}<span v-if="streamingContent"> · {{ streamingContent.length }} 字</span></div>
              <div class="ow-msg-bubble" v-html="renderMarkdown(streamingContent || '正在等待 API 返回...')"></div>
            </div>
          </div>
          <div v-if="pendingEdit" id="ow-edit-preview" class="ow-edit-preview">
            <div class="ow-edit-preview-title">待确认的大纲修改</div>
            <div class="ow-edit-preview-meta">{{ pendingEdit.operation }}<span v-if="pendingEdit.target"> · 目标：{{ pendingEdit.target }}</span></div>
            <pre class="ow-edit-preview-content">{{ previewText }}</pre>
            <div class="ow-edit-preview-actions">
              <button id="btn-ow-apply-edit" class="btn-sm btn-primary" @click="applyPendingEdit">确认修改</button>
              <button id="btn-ow-cancel-edit" class="btn-sm btn-secondary" @click="pendingEdit = null">取消</button>
            </div>
          </div>
          <div class="ow-input-row">
            <input
              id="ow-chat-input"
              v-model="inputText"
              class="ow-input"
              placeholder="和AI讨论大纲..."
              @keydown.enter="sendMessage"
            />
            <button
              v-if="isGenerating"
              id="btn-ow-cancel-generation"
              class="btn-send btn-cancel"
              title="取消当前生成"
              @click="cancelGeneration"
            >取消生成</button>
            <button v-else id="btn-ow-send" class="btn-send" @click="sendMessage">发送</button>
          </div>
        </div>
      </div>
      <div class="ow-footer">
        <button id="btn-import-outline" class="btn-secondary btn-import" @click="triggerImport">
          从文件导入(.txt/.md/.rtf/.docx)
        </button>
        <input
          ref="fileInput"
          type="file"
          accept=".txt,.md,.text,.rtf,.docx"
          style="display:none"
          @change="handleImport"
        />
        <button id="btn-save-outline" class="btn-primary" @click="saveOutline">保存大纲到本地</button>
        <span v-if="saveFeedback" class="save-feedback">{{ saveFeedback }}</span>
        <button
          id="btn-lock-outline"
          class="btn-primary"
          :disabled="!projectStore.hasOutline"
          @click="handleLockOutline()"
        >
          {{ projectStore.outlineLocked ? '已锁定大纲' : '确认大纲，锁定并进入创作' }}
        </button>
        <button
          v-if="projectStore.outlineLocked"
          id="btn-unlock-outline"
          class="btn-secondary"
          title="解锁后可继续编辑，修改内容需要重新确认才能进入流水线"
          @click="handleUnlockOutline"
        >
          解锁编辑
        </button>
      </div>
      <div class="ow-resize-handle"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { marked } from 'marked'
import { useProjectStore } from '../../stores/project'
import { useProviderStore } from '../../stores/provider'
import { usePipelineStore } from '../../stores/pipeline'
import { importFile } from '../../services/file-import'
import { useAiTools } from '../../composables/useAiTools'
import { getAiService } from '../../services/aiService'

const emit = defineEmits<{ close: []; navigate: [target: string] }>()

const projectStore = useProjectStore()
const providerStore = useProviderStore()
const pipelineStore = usePipelineStore()
const { callAi } = useAiTools()

const messages = computed(() => projectStore.outlineChat)
const inputText = ref('')
const msgContainer = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const editorRef = ref<HTMLTextAreaElement | null>(null)
const chatAreaOpen = ref(false)
const isFullscreen = ref(false)
const saveFeedback = ref('')
const lastUserRequest = ref('')
const findOpen = ref(false)
const findQuery = ref('')
const findIndex = ref(-1)
const findRef = ref<HTMLInputElement | null>(null)
const pendingEdit = ref<OutlineEditCommand | null>(null)
const undoStack = ref<string[]>([])
const redoStack = ref<string[]>([])
const isGenerating = ref(false)
const generationStatus = ref('')
const streamingContent = ref('')
let generationController: AbortController | null = null

type OutlineEditOperation = 'insert' | 'replace_selection' | 'replace_section' | 'append' | 'delete' | 'rewrite'
interface OutlineEditCommand {
  type: 'outline_edit'
  operation: OutlineEditOperation
  content?: string
  target?: string
  position?: string
  reason?: string
}

const outlineEditOperations = new Set<OutlineEditOperation>([
  'insert', 'replace_selection', 'replace_section', 'append', 'delete', 'rewrite'
])

const findResult = computed(() => {
  if (!findQuery.value) return ''
  return findIndex.value >= 0 ? '已定位' : '未找到'
})

let saveTimer: ReturnType<typeof setTimeout> | null = null
watch(
  () => projectStore.outlineText,
  () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (projectStore.currentProjectId) projectStore.setOutline(projectStore.outlineText)
    }, 400)
  }
)

function triggerImport() {
  fileInput.value?.click()
}

function editCommand(command: 'undo' | 'redo' | 'cut') {
  const ta = editorRef.value
  if (!ta || projectStore.outlineLocked) return
  if (command === 'undo') {
    if (undoStack.value.length === 0) return
    redoStack.value.push(projectStore.outlineText)
    const previous = undoStack.value.pop() || ''
    projectStore.outlineText = previous
    projectStore.setOutline(previous)
    return
  }
  if (command === 'redo') {
    if (redoStack.value.length === 0) return
    undoStack.value.push(projectStore.outlineText)
    const next = redoStack.value.pop() || ''
    projectStore.outlineText = next
    projectStore.setOutline(next)
    return
  }
  ta.focus()
  document.execCommand(command)
}

function commitOutlineChange(next: string) {
  const current = projectStore.outlineText || ''
  if (next === current || projectStore.outlineLocked) return false
  undoStack.value.push(current)
  if (undoStack.value.length > 50) undoStack.value.shift()
  redoStack.value = []
  projectStore.outlineText = next
  projectStore.setOutline(next)
  return true
}

async function copySelection() {
  const ta = editorRef.value
  if (!ta || ta.selectionStart === ta.selectionEnd) return
  const selected = ta.value.slice(ta.selectionStart, ta.selectionEnd)
  try {
    if (window.electronAPI && typeof window.electronAPI.clipboardWrite === 'function') {
      await window.electronAPI.clipboardWrite(selected)
    } else {
      await navigator.clipboard.writeText(selected)
    }
    saveFeedback.value = '[OK] 已复制选中文本'
  } catch {
    saveFeedback.value = '[失败] 无法写入剪贴板'
  }
  setTimeout(() => { saveFeedback.value = '' }, 2000)
}

async function pasteText() {
  const ta = editorRef.value
  if (!ta || projectStore.outlineLocked) return
  try {
    const text = await navigator.clipboard.readText()
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const next = ta.value.slice(0, start) + text + ta.value.slice(end)
    commitOutlineChange(next)
    await nextTick()
    ta.focus()
    ta.selectionStart = ta.selectionEnd = start + text.length
  } catch {
    saveFeedback.value = '[提示] 请使用系统粘贴快捷键或授予剪贴板权限'
    setTimeout(() => { saveFeedback.value = '' }, 2500)
  }
}

function closeFind() {
  findOpen.value = false
  findQuery.value = ''
  findIndex.value = -1
  editorRef.value?.focus()
}

function findNext() {
  const ta = editorRef.value
  const query = findQuery.value
  if (!ta || !query) return
  const text = ta.value
  const from = ta.selectionEnd > ta.selectionStart ? ta.selectionEnd : ta.selectionStart
  const found = text.indexOf(query, from >= text.length ? 0 : from)
  findIndex.value = found
  if (found >= 0) {
    ta.focus()
    ta.selectionStart = found
    ta.selectionEnd = found + query.length
  }
}

function findPrevious() {
  const ta = editorRef.value
  const query = findQuery.value
  if (!ta || !query) return
  const from = Math.max(0, ta.selectionStart - 1)
  const found = ta.value.lastIndexOf(query, from)
  findIndex.value = found
  if (found >= 0) {
    ta.focus()
    ta.selectionStart = found
    ta.selectionEnd = found + query.length
  }
}

async function handleImport(e: Event) {
  const target = e.target as HTMLInputElement
  if (!target.files || target.files.length === 0) return
  try {
    const text = await importFile(target.files[0])
    if (text && text.length > 0) {
      if (!projectStore.currentProjectId) {
        projectStore.currentProjectId = 'proj-' + Date.now()
      }
      projectStore.projectName =
        target.files[0].name.replace(/\.(txt|md|rtf|docx)$/i, '').substring(0, 20) ||
        projectStore.projectName ||
        '新小说'
      projectStore.outlineText = text
      projectStore.setOutline(text)
    }
  } catch (err: any) {
    alert('导入失败: ' + (err.message || String(err)))
  }
  target.value = ''
}

function renderMarkdown(text: string): string {
  return marked.parse(text || '', { breaks: true }) as string
}

function parseOutlineEditCommand(raw: string): OutlineEditCommand | null {
  if (!raw || raw.length > 20000) return null
  let candidate = raw.trim()
  const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) candidate = fence[1].trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as Partial<OutlineEditCommand>
    if (parsed.type !== 'outline_edit' || !outlineEditOperations.has(parsed.operation as OutlineEditOperation)) return null
    const needsContent = parsed.operation !== 'delete'
    if ((needsContent && typeof parsed.content !== 'string') || (typeof parsed.content === 'string' && parsed.content.length > 20000)) return null
    if (['replace_section', 'delete'].includes(parsed.operation as string) && !parsed.target?.trim()) return null
    return {
      type: 'outline_edit',
      operation: parsed.operation as OutlineEditOperation,
      content: typeof parsed.content === 'string' ? parsed.content : undefined,
      target: typeof parsed.target === 'string' ? parsed.target.trim() : undefined,
      position: typeof parsed.position === 'string' ? parsed.position : undefined,
      reason: typeof parsed.reason === 'string' ? parsed.reason : undefined
    }
  } catch {
    return null
  }
}

const previewText = computed(() => {
  if (!pendingEdit.value) return ''
  const command = pendingEdit.value
  if (command.operation === 'delete') return `删除目标：${command.target}`
  return command.content || ''
})

function previewCommand(command: OutlineEditCommand) {
  pendingEdit.value = command
}

function applyPendingEdit() {
  const command = pendingEdit.value
  const current = projectStore.outlineText || ''
  if (!command || projectStore.outlineLocked) return
  let next = current
  if (command.operation === 'append') {
    next = current + (current ? '\n' : '') + (command.content || '')
  } else if (command.operation === 'insert') {
    insertAtCursor(command.content || '')
    pendingEdit.value = null
    return
  } else if (command.operation === 'replace_selection') {
    const ta = editorRef.value
    if (!ta || ta.selectionStart === ta.selectionEnd) {
      saveFeedback.value = '[提示] 请先在编辑器中框选要替换的内容'
      setTimeout(() => { saveFeedback.value = '' }, 2500)
      return
    }
    next = current.slice(0, ta.selectionStart) + (command.content || '') + current.slice(ta.selectionEnd)
  } else if (command.operation === 'replace_section' || command.operation === 'rewrite') {
    if (!command.target) return
    if (!current.includes(command.target)) {
      saveFeedback.value = '[提示] 未找到目标内容，未执行修改'
      setTimeout(() => { saveFeedback.value = '' }, 2500)
      return
    }
    next = current.replace(command.target, command.content || '')
  } else if (command.operation === 'delete') {
    if (!command.target || !current.includes(command.target)) {
      saveFeedback.value = '[提示] 未找到删除目标，未执行修改'
      setTimeout(() => { saveFeedback.value = '' }, 2500)
      return
    }
    next = current.replace(command.target, '')
  }
  if (!commitOutlineChange(next)) return
  pendingEdit.value = null
  saveFeedback.value = '[OK] 已应用大纲修改'
  setTimeout(() => { saveFeedback.value = '' }, 2500)
}

async function handleLockOutline() {
  if (projectStore.outlineLocked) {
    saveFeedback.value = '[提示] 大纲已锁定，如需修改请先解锁编辑'
    setTimeout(function() { saveFeedback.value = '' }, 3000)
    return
  }
  const outline = projectStore.outlineText.trim()
  if (!outline) {
    saveFeedback.value = '[WARN] 大纲为空，请先输入内容'
    setTimeout(function() { saveFeedback.value = '' }, 3000)
    return
  }

  try {
    if (!projectStore.currentProjectId) {
      projectStore.currentProjectId = 'proj-' + Date.now()
    }
    projectStore.projectName =
      projectStore.projectName ||
      outline.split('\n')[0].replace(/^#+\s*/, '').replace(/\s+/g, ' ').trim().substring(0, 20) ||
      '新小说'

    projectStore.setOutline(outline)
    projectStore.lockOutline()
    projectStore.syncTreeToPipeline()
    pipelineStore.setStep(0)

    saveFeedback.value = '[OK] 大纲已锁定，正在同步到流水线...'
    setTimeout(function() { saveFeedback.value = '' }, 3000)

    emit('navigate', 'pipeline')

    autoDecompose(outline)
  } catch (e: any) {
    saveFeedback.value = '[锁定失败] ' + (e.message || String(e))
    setTimeout(function() { saveFeedback.value = '' }, 3000)
  }
}

async function autoDecompose(outline: string) {
  if (!outline || outline.trim().length < 50) return
  const provider = providerStore.activeGenerateProvider
  if (!provider || !provider.apiKey) return

  try {
    const decomposePrompt =
      '请从以下小说大纲中提取设定信息，根据大纲内容自行决定需要哪些分类（如角色、世界观、物种、物品、势力、地理、魔法体系、技术、组织等），不要限定在固定分类里。\n返回JSON数组，每项包含 category、name、content 字段。只返回JSON数组，不要其他文字。\n\n大纲：\n' +
      outline
    const decomposeResult = await callAi(
      decomposePrompt,
      '你是专业的小说设定编辑，擅长从大纲中提取各类设定信息，能根据大纲内容灵活判断需要哪些分类。'
    )
    parseDecomposedSettings(decomposeResult)
  } catch (e) {
    console.warn('[OutlineWorkspace] 设定自动拆解失败:', e)
  }

  try {
    const foreshadowPrompt =
      '请从以下小说大纲中识别所有的伏笔（铺垫、暗示、悬念、未解之谜等）。\n返回JSON数组，每项包含 name、content 字段。只返回JSON数组，不要其他文字。\n\n大纲：\n' +
      outline
    const foreshadowResult = await callAi(
      foreshadowPrompt,
      '你是专业的小说结构分析师，擅长识别伏笔和铺垫。'
    )
    parseForeshadows(foreshadowResult)
  } catch (e) {
    console.warn('[OutlineWorkspace] 伏笔提取失败:', e)
  }
}

function parseDecomposedSettings(raw: string | null) {
  if (!raw) return
  const items = extractJsonArray(raw)
  if (!items || items.length === 0) return

  const sc = projectStore.getSettingsCollection()
  let count = 0
  for (const item of items) {
    if (!item.name) continue
    const cat = (item.category || '其他').toString()
    if (!sc.categories.includes(cat)) sc.categories.push(cat)
    if (!sc.items[cat]) sc.items[cat] = []
    sc.items[cat].push({
      id: 'set_' + Date.now() + '_' + count,
      name: item.name,
      category: cat,
      content: item.content || '',
      attrs: item.attrs || { 描述: item.content || '' },
      isBound: false,
      boundTo: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    })
    count++
  }
  if (count > 0) {
    projectStore.saveProject()
  }
}

function parseForeshadows(raw: string | null) {
  if (!raw) return
  const items = extractJsonArray(raw)
  if (!items || items.length === 0) return

  const category = '伏笔'
  const currentCats = projectStore.memories.categories.includes(category)
    ? projectStore.memories.categories
    : [...projectStore.memories.categories, category]
  const currentItems = [...projectStore.memories.items]
  for (const item of items) {
    if (!item.name) continue
    currentItems.push({
      key: item.name,
      category,
      content: item.content || ''
    })
  }
  projectStore.memories.categories = currentCats
  projectStore.memories.items = currentItems
  projectStore.saveProject()
}

function extractJsonArray(text: string): any[] | null {
  if (!text) return null
  let cleaned = text.trim()
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) cleaned = fenceMatch[1].trim()
  try {
    const d = JSON.parse(cleaned)
    if (Array.isArray(d)) return d
    if (d && typeof d === 'object') return [d]
  } catch {}
  const firstBracket = cleaned.indexOf('[')
  const lastBracket = cleaned.lastIndexOf(']')
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    const sub = cleaned.substring(firstBracket, lastBracket + 1)
    try {
      const v = JSON.parse(sub)
      if (Array.isArray(v)) return v
    } catch {}
  }
  return null
}

async function saveOutline() {
  const text = projectStore.outlineText || ''
  if (!text.trim()) {
    saveFeedback.value = '[WARN] 大纲为空，无法保存'
    setTimeout(function() { saveFeedback.value = '' }, 3000)
    return
  }
  projectStore.setOutline(text)
  const defaultName = (projectStore.projectName || '大纲') + '.md'
  const filePath = await window.electronAPI.dialogSaveFile(defaultName)
  if (!filePath) {
    saveFeedback.value = '已取消保存'
    setTimeout(function() { saveFeedback.value = '' }, 2000)
    return
  }
  const ok = await window.electronAPI.dialogWriteFile(filePath, text)
  saveFeedback.value = ok ? '[OK] 已保存到本地' : '[失败] 无法写入文件'
  setTimeout(function() { saveFeedback.value = '' }, 3000)
}

function exportMd() {
  const text = projectStore.outlineText || ''
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = (projectStore.projectName || '大纲') + '.md'
  a.click()
}

function exportTxt() {
  const text = projectStore.outlineText || ''
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = (projectStore.projectName || '大纲') + '.txt'
  a.click()
}

async function copyMsg(text: string) {
  try {
    if (window.electronAPI && typeof window.electronAPI.clipboardWrite === 'function') {
      await window.electronAPI.clipboardWrite(text)
      return
    }
  } catch {}
  navigator.clipboard.writeText(text).catch(() => {
    const tmp = document.createElement('textarea')
    tmp.value = text
    document.body.appendChild(tmp)
    tmp.select()
    document.execCommand('copy')
    document.body.removeChild(tmp)
  })
}

function replaceOutline(text: string) {
  commitOutlineChange(text)
  saveFeedback.value = '[OK] 大纲已替换'
  setTimeout(function() { saveFeedback.value = '' }, 3000)
}

function insertAtCursor(text: string) {
  const ta = editorRef.value
  const current = projectStore.outlineText || ''
  if (!ta) {
    projectStore.outlineText = current + (current ? '\n' : '') + text
    projectStore.setOutline(projectStore.outlineText)
    return
  }
  const start = ta.selectionStart ?? current.length
  const end = ta.selectionEnd ?? current.length
  commitOutlineChange(current.slice(0, start) + text + current.slice(end))
  requestAnimationFrame(() => {
    ta.focus()
    const pos = start + text.length
    ta.selectionStart = ta.selectionEnd = pos
  })
}

async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || isGenerating.value) return
  projectStore.appendOutlineChat({ role: 'user', content: text })
  inputText.value = ''
  lastUserRequest.value = text
  await scrollToBottom()
  await askAi(text)
}

async function regenerateMsg(index: number) {
  if (isGenerating.value) return
  const target = messages.value[index]
  if (!target || target.role !== 'assistant') return
  projectStore.removeOutlineChatAt(index)
  const requestText = lastUserRequest.value ||
    [...messages.value].reverse().find(function(m) { return m.role === 'user' })?.content || ''
  if (!requestText) return
  await scrollToBottom()
  await askAi(requestText)
}

async function scrollToBottom() {
  await nextTick()
  if (msgContainer.value) msgContainer.value.scrollTop = msgContainer.value.scrollHeight
}

async function askAi(requestText: string) {
  if (isGenerating.value) return
  const provider = providerStore.activeGenerateProvider
  if (!provider) {
    projectStore.appendOutlineChat({ role: 'assistant', content: '请先配置API供应商' })
    await scrollToBottom()
    return
  }
  const model = provider.selectedModel || provider.models?.[0] || 'gpt-4o'
  const systemPrompt = '你是小说大纲创作助手。用户正在编辑大纲，请给出建议和修改意见。'
  const aiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.value.filter(function(m) { return m.content }).map(function(m) { return { role: m.role, content: m.content } }),
    { role: 'user', content: '当前大纲:\n' + projectStore.outlineText + '\n\n用户请求: ' + requestText }
  ]
  generationController = new AbortController()
  isGenerating.value = true
  generationStatus.value = '正在连接 API...'
  streamingContent.value = ''
  const startedAt = performance.now()
  let firstChunkSeen = false
  try {
    const aiService = await getAiService()
    const result = await aiService.callAi({
      purpose: 'generate',
      messages: aiMessages,
      model,
      maxTokens: provider.maxTokens || 8192,
      signal: generationController.signal,
      onChunk: (text: string) => {
        if (!firstChunkSeen) {
          firstChunkSeen = true
          generationStatus.value = `已收到内容 · 首字节 ${Math.round(performance.now() - startedAt)}ms`
        } else {
          generationStatus.value = '正在生成...'
        }
        // aiService sends cumulative filtered text, so replace rather than append.
        streamingContent.value = text
        void scrollToBottom()
      },
      retry: true,
      meta: { source: 'OutlineWorkspace.askAi' }
    })
    const responseText = result.text || ''
    if (!responseText.trim()) throw new Error('API 返回为空')
    const editCommand = parseOutlineEditCommand(responseText)
    projectStore.appendOutlineChat({
      role: 'assistant',
      content: responseText,
      ...(editCommand ? { outlineEdit: editCommand } : {})
    })
  } catch (e: any) {
    if (generationController?.signal.aborted || e?.name === 'AbortError' || e?.code === 'canceled') {
      generationStatus.value = '已取消生成'
    } else {
      projectStore.appendOutlineChat({ role: 'assistant', content: '生成失败：' + (e.message || '未知错误') })
    }
  } finally {
    generationController = null
    isGenerating.value = false
    if (generationStatus.value !== '已取消生成') generationStatus.value = ''
    streamingContent.value = ''
  }
  await scrollToBottom()
}

function cancelGeneration() {
  if (!generationController) return
  generationStatus.value = '正在取消...'
  generationController.abort()
}

function handleUnlockOutline() {
  projectStore.unlockOutline()
  saveFeedback.value = '[OK] 已解锁，现在可以编辑大纲；修改后需重新确认才能进入流水线'
  nextTick(() => editorRef.value?.focus())
  setTimeout(function() { saveFeedback.value = '' }, 3000)
}
</script>

<style scoped>
.ow-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--bg-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
}
.ow-content {
  width: min(1000px, 92vw);
  height: min(700px, 88vh);
  max-width: 1000px;
  max-height: 88vh;
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  transition: width 0.18s ease, height 0.18s ease, border-radius 0.18s ease;
}
.ow-content.ows-fullscreen {
  width: 100vw;
  height: 100vh;
  max-width: none;
  max-height: none;
  border-radius: 0;
  border: none;
}
.ow-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 24px;
  border-bottom: 1px solid var(--border-color);
  font-size: var(--font-size-lg);
  font-weight: 600;
  flex-shrink: 0;
  gap: 12px;
}
.ow-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ow-icon-btn {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
}
.ow-icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.ow-chat-toggle {
  padding: 6px 14px;
  font-size: var(--font-size-md);
  font-weight: 500;
  border: 1px solid var(--accent-color);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--accent-color);
  cursor: pointer;
  white-space: nowrap;
}
.ow-chat-toggle:hover {
  background: var(--accent-color);
  color: var(--text-on-accent);
}
.ow-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}
.ow-editor {
  flex: 1.2;
  min-width: 0;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ow-editor-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: var(--font-size-md);
  font-weight: 600;
  color: var(--text-primary);
  flex-shrink: 0;
}
.ow-editor-header .word-count {
  margin-left: auto;
  font-size: var(--font-size-sm);
  font-weight: 400;
  color: var(--text-secondary);
  white-space: nowrap;
}
.ow-textarea {
  flex: 1;
  min-height: 0;
  width: 100%;
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 16px;
  font-size: var(--font-size-md);
  line-height: 1.8;
  resize: none;
  outline: none;
}
.ow-textarea.ow-readonly {
  background: var(--bg-panel);
  color: var(--text-secondary);
  cursor: not-allowed;
}
.editor-toolbar {
  display: flex;
  align-items: center;
  min-width: 0;
  margin-left: auto;
}
.editor-toolbar-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}
.ow-find-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 0;
  flex-shrink: 0;
}
.ow-find-input {
  width: min(260px, 35%);
  min-width: 120px;
  height: 30px;
  padding: 4px 8px;
  color: var(--text-primary);
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
}
.ow-find-result {
  min-width: 48px;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}
.ow-chat {
  flex: 1;
  min-width: 340px;
  border-left: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.ow-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  min-height: 0;
}
.ow-msg {
  margin-bottom: 12px;
}
.ow-msg.user {
  text-align: right;
}
.ow-msg-bubble {
  display: inline-block;
  max-width: 85%;
  padding: var(--space-4) var(--space-6);
  border-radius: var(--radius-lg);
  font-size: var(--font-size-md);
  line-height: 1.6;
  text-align: left;
  word-break: break-word;
}
.ow-msg.user .ow-msg-bubble {
  background: var(--user-bubble);
}
.ow-msg.assistant .ow-msg-bubble {
  background: var(--ai-bubble);
  border: 1px solid var(--border-color);
}
.ow-msg-streaming .ow-streaming-status {
  margin: 0 0 4px 2px;
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}
.ow-msg-streaming .ow-msg-bubble {
  min-height: 24px;
}
.ow-msg-actions {
  display: flex;
  gap: 4px;
  margin-top: 6px;
  padding-left: 2px;
}
.ow-edit-command {
  display: inline-block;
  margin-top: 6px;
  padding: 4px 8px;
  color: var(--accent-color);
  background: var(--accent-dim);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
}
.ow-msg.user .ow-msg-actions {
  justify-content: flex-end;
}
.msg-btn {
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  border-radius: var(--radius-xs);
  padding: 2px 8px;
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: var(--transition-fast);
}
.msg-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.ow-input-row {
  display: flex;
  gap: 6px;
  padding: 10px 12px;
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
}
.ow-input {
  flex: 1;
  min-width: 0;
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 4px 10px;
  font-size: var(--font-size-md);
  height: 28px;
  outline: none;
}
.btn-send {
  background: var(--accent);
  color: var(--text-on-accent);
  border: none;
  border-radius: var(--radius-sm);
  padding: 0 12px;
  height: 28px;
  cursor: pointer;
  font-size: var(--font-size-xs);
}
.btn-send:disabled,
.btn-cancel {
  opacity: 0.9;
}
.btn-cancel {
  background: var(--danger);
}
.ow-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border-top: 1px solid var(--border-color);
  justify-content: flex-end;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.save-feedback {
  font-size: var(--font-size-sm);
  color: var(--success);
  padding: 0 8px;
}
.ow-resize-handle {
  height: 6px;
  cursor: ns-resize;
  background: var(--border-color);
  border-radius: 0 0 12px 12px;
  flex-shrink: 0;
}
.ow-content.ows-fullscreen .ow-resize-handle {
  border-radius: 0;
}
.editor-toolbar-group {
  display: flex;
  gap: 4px;
}
.btn-import { background: var(--accent-dim); color: var(--accent); border: 1px solid var(--accent); font-weight: 500; padding: 6px 16px; border-radius: var(--radius-sm); cursor: pointer; transition: all 0.15s ease; } .btn-import:hover { background: var(--accent); color: var(--text-on-accent); } .btn-import:active { transform: scale(0.97); } </style>

