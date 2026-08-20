<template>
  <section id="editor-panel" class="editor-panel">
    <div class="editor-header">
      <span v-if="activeTab?.mode" id="editor-mode-badge" class="editor-mode-badge" :class="'mode-' + activeTab.mode">{{ modeLabel }}</span>
      <span id="editor-title" class="editor-title">{{ activeTab ? activeTab.title : '选择章节开始写作' }}</span>
      <div class="editor-toolbar">
        <div class="editor-toolbar-group">
          <button id="btn-undo" class="btn-sm btn-secondary" title="Ctrl+Z" @click="undo"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg></button>
          <button id="btn-redo" class="btn-sm btn-secondary" title="Ctrl+Y" @click="redo"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg></button>
        </div>
        <span class="sep"></span>
       <div class="editor-toolbar-group">
          <button id="btn-generate-content" class="btn-sm btn-secondary" @click="generateContent">生成</button>
          <button id="btn-save-editor" class="btn-sm btn-secondary" title="Ctrl+S" @click="save">保存</button>
        </div>
       <span class="sep"></span>
       <div class="editor-toolbar-group" style="position:relative">
          <button id="btn-find" class="btn-sm btn-secondary" title="查找替换 (Ctrl+F)" @click="editorStore.toggleFind()">查找</button>
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
       </div>
       <div class="editor-toolbar-group">
          <button id="btn-ai-names" class="btn-sm btn-secondary" title="AI命名" @click="aiNames">AI命名</button>
          <button id="btn-writing-rules" class="btn-sm btn-secondary" title="写作规则" @click="writingRules">写作规则</button>
          <button id="btn-timeline" class="btn-sm btn-secondary" title="时间线" @click="timeline">时间线</button>
          <button id="btn-batch-review" class="btn-sm btn-secondary" title="批量审阅" @click="batchReview">批量审阅</button>
          <button id="btn-revise" class="btn-sm btn-secondary" title="修订" @click="revise">修订</button>
          <button class="btn-sm btn-secondary" title="变量" @click="insertVar">变量</button>
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
        @click="editorStore.activeTabId = tab.id"
      >
        <span>{{ tab.title }}</span>
        <span v-if="tab.isDirty" class="dot">*</span>
        <button class="tab-close" @click.stop="editorStore.closeTab(tab.id)">x</button>
      </div>
    </div>

    <div id="find-replace-bar" class="find-bar" v-if="editorStore.findVisible">
      <span id="find-count" class="find-count" v-if="findMatchCount > 0">{{ findMatchIndex + 1 }}/{{ findMatchCount }}</span>
      <input id="find-input" v-model="editorStore.findQuery" placeholder="查找..." class="find-input" @keydown.enter.exact.prevent="findNext" @keydown.enter.shift.prevent="findPrev" />
      <input id="replace-input" v-model="editorStore.replaceQuery" placeholder="替换为..." class="find-input" />
          <button id="btn-find-prev" class="btn-sm btn-secondary" @click="findPrev">上一个</button>
      <button id="btn-find-next" class="btn-sm btn-secondary" @click="findNext">下一个</button>
          <button id="btn-replace-one" class="btn-sm btn-secondary" @click="replaceOne">替换</button>
          <button id="btn-replace-all" class="btn-sm btn-secondary" @click="replaceAll">全部替换</button>
      <button id="btn-find-close" class="find-close" @click="editorStore.toggleFind()">x</button>
    </div>

    <textarea id="editor-content"
      ref="editorTextarea"
      class="editor-content"
      :value="activeTab ? activeTab.content : ''"
      @input="onInput"
      placeholder="请先创建或打开项目，然后选择左侧章节开始写作..."
      :disabled="!activeTab"
      @keydown="onKeydown"
      @mouseup="checkInlineMenu"
      @blur="hideInlineMenu"
    ></textarea>
   <div v-if="inlineMenuVisible" class="inline-menu" :style="{ left: inlineMenuPos.x + 'px', top: inlineMenuPos.y + 'px' }">
     <button v-for="a in inlineActions" :key="a.key" class="inline-menu-btn" @mousedown.prevent="applyInlineAction(a.key, a.label)">{{ a.label }}</button>
   </div>
    <!-- 变量输入弹窗 -->
    <div v-if="varDialogVisible" class="var-dialog-overlay" @click.self="varDialogVisible = false">
      <div class="var-dialog">
        <div class="var-dialog-header">插入变量</div>
        <div class="var-dialog-body">
          <input ref="varDialogInput" v-model="varNameInput" class="var-dialog-input" placeholder="输入变量名，如 character.name" @keydown.enter="confirmVar" @keydown.escape="varDialogVisible = false" />
        </div>
        <div class="var-dialog-footer">
          <button class="btn-sm btn-secondary" @click="varDialogVisible = false">取消</button>
          <button class="btn-sm btn-primary" @click="confirmVar">确定</button>
        </div>
      </div>
    </div>
 </section>

</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useUndoRedo } from '../../composables/useUndoRedo'
import { useDeAi } from '../../composables/useDeAi'
import { useEditorStore } from '../../stores/editor'
import { useProjectStore } from '../../stores/project'
import { useDeAiStore } from '../../stores/deai'
import { useSettingsStore } from '../../stores/settings'

const editorStore = useEditorStore()
const projectStore = useProjectStore()
const deAiStore = useDeAiStore()
const settingsStore = useSettingsStore()
const { process: deAiProcess } = useDeAi()
const editorTextarea = ref<HTMLTextAreaElement | null>(null)
const exportMenu = ref(false)
const undoRedo = useUndoRedo(50)
let autoSaveTimer: ReturnType<typeof setInterval> | null = null

const findMatchCount = ref(0)
const findMatchIndex = ref(-1)

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
 const inlineMenuPos = ref({ x: 0, y: 0 })
 const varDialogVisible = ref(false)
 const varNameInput = ref('')
 const varDialogInput = ref<HTMLInputElement | null>(null)

 const activeTab = computed(() => editorStore.activeTab)
const modeLabel = computed(() => {
  const m = activeTab.value?.mode
  if (m === 'vol-outline') return '卷纲层'
  if (m === 'ch-plot') return '章节层'
  if (m === 'ch-body') return '正文层'
  return ''
})
const isBodyMode = computed(() => !activeTab.value?.mode || activeTab.value.mode === 'ch-body')
const wordCount = computed(() => {
  if (!activeTab.value) return 0
  return (activeTab.value.content || '').length
})

function onInput(e: Event) {
  const target = e.target as HTMLTextAreaElement
  if (activeTab.value) {
    undoRedo.pushState(target.value)
    editorStore.updateContent(activeTab.value.id, target.value)
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault()
    save()
  }
  if (e.ctrlKey && e.key === 'f') {
    e.preventDefault()
    editorStore.toggleFind()
  }
}

function save() {
  if (!activeTab.value) {
    alert('请先选择或创建一个章节');
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
        projectStore.saveProject()
        projectStore.refreshTree()
        break
      }
    }
  }
  if (activeTab.value) {
    editorStore.markSaved(activeTab.value.id)
  }
}

function undo() {
  const prev = undoRedo.undo()
  if (prev !== null && activeTab.value) {
    editorStore.updateContent(activeTab.value.id, prev)
    if (editorTextarea.value) editorTextarea.value.value = prev
  }
}

function redo() {
  const next = undoRedo.redo()
  if (next !== null && activeTab.value) {
    editorStore.updateContent(activeTab.value.id, next)
    if (editorTextarea.value) editorTextarea.value.value = next
  }
}

function generateContent() {
  if (!activeTab.value || !activeTab.value.chapterId) {
    alert('请先选择一个章节');
    return;
  }
  // Emit event to parent to open pipeline at body step
  const event = new CustomEvent('generate-body', { detail: { chapterId: activeTab.value.chapterId } });
  window.dispatchEvent(event);
}

async function triggerDeAi() {
  if (!activeTab.value) return
  if (deAiStore.skillIds.length === 0) {
    alert('请先在设置-去AI味页面配置技能')
    return
  }
  try {
    const text = activeTab.value.content
    const result = await deAiProcess(text)
    if (result) {
      editorStore.updateContent(activeTab.value.id, result)
    }
  } catch (e: any) {
    alert('去AI味处理失败: ' + (e.message || String(e)))
  }
}

function exportChapter(format: string) {
  if (!activeTab.value) return
  exportMenu.value = false
  const content = activeTab.value.content || ''
  const title = activeTab.value.title || 'untitled'
  let mime = 'text/plain'
  let ext = 'txt'
  let body = content
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

onMounted(() => { startAutoSave() })
onUnmounted(() => {
  if (autoSaveTimer) clearInterval(autoSaveTimer)
  window.removeEventListener('editor-undo', handleUndoEvent)
  window.removeEventListener('editor-redo', handleRedoEvent)
  window.removeEventListener('editor-save', handleSaveEvent)
  window.removeEventListener('toggle-find', handleToggleFindEvent)
})
function handleUndoEvent() { undo() }
function handleRedoEvent() { redo() }
function handleSaveEvent() { save() }
function handleToggleFindEvent() { editorStore.toggleFind() }
onMounted(() => {
  startAutoSave()
  window.addEventListener('editor-undo', handleUndoEvent)
  window.addEventListener('editor-redo', handleRedoEvent)
  window.addEventListener('editor-save', handleSaveEvent)
  window.addEventListener('toggle-find', handleToggleFindEvent)
})
watch(activeTab, (newTab) => {
  if (newTab) undoRedo.reset(newTab.content)
})

function findNext() {
  if (!editorTextarea.value || !editorStore.findQuery) return
  const text = editorTextarea.value.value
  // P7: count all matches
  findMatchCount.value = 0
  findMatchIndex.value = -1
  const matches = []
  let si = 0
  while ((si = text.indexOf(editorStore.findQuery, si)) !== -1) {
    matches.push(si)
    si += editorStore.findQuery.length
  }
  findMatchCount.value = matches.length
  if (matches.length === 0) return
  // find current position
 let curPos = editorTextarea.value.selectionEnd
  let nextIdx = matches.findIndex(m => m >= curPos)
  if (nextIdx < 0) nextIdx = 0
  findMatchIndex.value = nextIdx
  const idx = matches[nextIdx]
  editorTextarea.value.setSelectionRange(idx, idx + editorStore.findQuery.length)
  // P7: scroll to match
  const lineHeight = 20
  const linesBefore = text.substring(0, idx).split('\n').length
  editorTextarea.value.scrollTop = Math.max(0, (linesBefore - 3) * lineHeight)
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
  if (!activeTab.value) return
  window.dispatchEvent(new CustomEvent('editor-action', { detail: { action: 'ai-names', chapterId: activeTab.value.chapterId } }))
}

function writingRules() {
  if (!activeTab.value) return
  window.dispatchEvent(new CustomEvent('editor-action', { detail: { action: 'writing-rules' } }))
}

function timeline() {
  if (!activeTab.value) return
  window.dispatchEvent(new CustomEvent('editor-action', { detail: { action: 'timeline', chapterId: activeTab.value.chapterId } }))
}

function batchReview() {
  if (!activeTab.value) return
  window.dispatchEvent(new CustomEvent('editor-action', { detail: { action: 'batch-review' } }))
}

function revise() {
  if (!activeTab.value) return
  window.dispatchEvent(new CustomEvent('editor-action', { detail: { action: 'revise', chapterId: activeTab.value.chapterId } }))
}

function insertVar() {
  if (!activeTab.value || !editorTextarea.value) return
  varNameInput.value = 'character.name'
  varDialogVisible.value = true
  setTimeout(() => { if (varDialogInput.value) varDialogInput.value.focus() }, 50)
 }
 
 function confirmVar() {
  if (!varNameInput.value || !activeTab.value || !editorTextarea.value) return
  const ta = editorTextarea.value
  const start = ta.selectionStart
  const end = ta.selectionEnd
  const insert = '{{' + varNameInput.value + '}}'
  const newContent = activeTab.value.content.substring(0, start) + insert + activeTab.value.content.substring(end)
  editorStore.updateContent(activeTab.value.id, newContent)
  setTimeout(() => ta.setSelectionRange(start + insert.length, start + insert.length), 0)
  varDialogVisible.value = false
}

function findPrev() {
  if (!editorTextarea.value || !editorStore.findQuery) return
  const text = editorTextarea.value.value
  // P7: count all matches
  const matches = []
  let si = 0
  while ((si = text.indexOf(editorStore.findQuery, si)) !== -1) {
    matches.push(si)
    si += editorStore.findQuery.length
  }
  findMatchCount.value = matches.length
  if (matches.length === 0) return
  let curPos = editorTextarea.value.selectionStart
  let prevIdx = matches.length - 1
  for (let i = matches.length - 1; i >= 0; i--) {
    if (matches[i] < curPos) { prevIdx = i; break }
  }
  findMatchIndex.value = prevIdx
  const idx = matches[prevIdx]
  editorTextarea.value.setSelectionRange(idx, idx + editorStore.findQuery.length)
  const lineHeight = 20
  const linesBefore = text.substring(0, idx).split('\n').length
  editorTextarea.value.scrollTop = Math.max(0, (linesBefore - 3) * lineHeight)
}

function replaceOne() {
  if (!activeTab.value || !editorStore.findQuery) return
  const text = activeTab.value.content
  const selStart = editorTextarea.value?.selectionStart || 0
  const selEnd = editorTextarea.value?.selectionEnd || 0
  const selectedText = text.substring(selStart, selEnd)
  if (selectedText === editorStore.findQuery) {
    const newContent = text.substring(0, selStart) + editorStore.replaceQuery + text.substring(selEnd)
    editorStore.updateContent(activeTab.value.id, newContent)
    editorTextarea.value?.setSelectionRange(selStart, selStart + editorStore.replaceQuery.length)
  } else {
    findNext()
  }
}

function replaceAll() {
  if (!activeTab.value || !editorStore.findQuery) return
  const content = activeTab.value.content
  const newContent = content.split(editorStore.findQuery).join(editorStore.replaceQuery)
  editorStore.updateContent(activeTab.value.id, newContent)
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
.editor-header {
  height: 56px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.editor-mode-badge {
  height: 22px;
  padding: 0 10px;
  border-radius: 11px;
  background: var(--accent);
  color: #fff;
  font-size: var(--font-size-xs);
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
  gap: 6px;
  flex: 1 1 auto;
  overflow-x: auto;
  overflow-y: hidden;
  min-width: 0;
}
.editor-toolbar-group {
  display: flex;
  gap: 6px;
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
}
.chapter-tabs {
  display: flex;
  gap: 2px;
  padding: 0 8px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  overflow-x: auto;
  flex-shrink: 0;
}
.tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
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
  padding: 0 2px;
}
.tab-close:hover {
  color: var(--danger);
}
.find-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}
.find-input {
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xs);
  padding: 2px 8px;
  font-size: var(--font-size-sm);
  height: 24px;
  outline: none;
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
  outline: none;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--editor-font, serif);
  font-size: var(--font-size-lg);
  line-height: 1.8;
  padding: 24px 32px;
  resize: none;
  overflow-y: auto;
}
.editor-content:disabled {
  opacity: 0.5;
}
.export-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 4px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.export-dropdown button {
  background: none;
  border: none;
  color: var(--text-secondary);
  text-align: left;
  padding: 4px 12px;
  font-size: var(--font-size-sm);
  border-radius: var(--radius-xs);
  cursor: pointer;
}
.export-dropdown button:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

#btn-de-ai { color: var(--warning); font-weight: 600; }
#btn-de-ai:hover { background: var(--warning-dim, rgba(255,193,7,0.15)); }
#btn-de-ai:disabled { color: var(--text-tertiary); font-weight: 400; }

.inline-menu {
  position: fixed;
  z-index: 10000;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  max-width: 360px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}
.inline-menu-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  text-align: left;
  padding: 4px 10px;
  font-size: var(--font-size-sm);
  border-radius: var(--radius-xs);
  cursor: pointer;
  white-space: nowrap;
}
.inline-menu-btn:hover {
  background: var(--bg-hover);
  color: var(--accent);
 }
 /* 变量输入弹窗 */
 .var-dialog-overlay {
   position: fixed; top: 0; left: 0; right: 0; bottom: 0;
   background: rgba(0,0,0,0.5);
   display: flex; align-items: center; justify-content: center;
   z-index: 20000;
 }
 .var-dialog {
   background: var(--bg-secondary);
   border: 1px solid var(--border-color);
   border-radius: var(--radius-md); padding: 16px;
   min-width: 320px;
   box-shadow: 0 8px 24px rgba(0,0,0,0.4);
 }
 .var-dialog-header {
   font-size: var(--font-size-md); font-weight: 600;
   margin-bottom: 12px;
   color: var(--text-primary);
 }
 .var-dialog-body {
   margin-bottom: 12px;
 }
 .var-dialog-input {
   width: 100%; padding: 8px 10px;
   background: var(--bg-primary);
   border: 1px solid var(--border-color);
   border-radius: var(--radius-xs);
   color: var(--text-primary);
   font-size: var(--font-size-md);
   box-sizing: border-box;
 }
 .var-dialog-input:focus {
   outline: none;
   border-color: var(--accent);
 }
 .var-dialog-footer {
   display: flex; justify-content: flex-end; gap: 8px;
 }
</style>



