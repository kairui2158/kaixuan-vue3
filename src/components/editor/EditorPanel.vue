<template>
  <section class="editor-panel">
    <div class="editor-header">
      <span class="editor-mode-badge"></span>
      <span class="editor-title">{{ activeTab ? activeTab.title : '选择章节开始写作' }}</span>
      <div class="editor-toolbar">
        <div class="editor-toolbar-group">
          <button class="btn-sm btn-secondary" title="Ctrl+Z" @click="undo">undo</button>
          <button class="btn-sm btn-secondary" title="Ctrl+Y" @click="redo">redo</button>
        </div>
        <span class="sep"></span>
        <div class="editor-toolbar-group">
          <button class="btn-sm btn-secondary" @click="generateContent">生成</button>
          <button class="btn-sm btn-secondary" title="Ctrl+S" @click="save">保存</button>
        </div>
        <span class="sep"></span>
        <div class="editor-toolbar-group">
          <button class="btn-sm btn-secondary" @click="exportMenu = !exportMenu">导出</button>
        </div>
        <span class="sep"></span>
        <div class="editor-toolbar-group">
          <button class="btn-sm btn-secondary" @click="deAiStore.startProcessing">去AI味</button>
        </div>
      </div>
      <span class="word-count">{{ wordCount }} 字</span>
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

    <div class="find-bar" v-if="editorStore.findVisible">
      <input v-model="editorStore.findQuery" placeholder="查找..." class="find-input" />
      <input v-model="editorStore.replaceQuery" placeholder="替换为..." class="find-input" />
      <button class="btn-sm btn-secondary" @click="findNext">下一个</button>
      <button class="btn-sm btn-secondary" @click="replaceAll">全部替换</button>
      <button class="find-close" @click="editorStore.toggleFind()">x</button>
    </div>

    <textarea
      ref="editorTextarea"
      class="editor-content"
      :value="activeTab ? activeTab.content : ''"
      @input="onInput"
      placeholder="请先创建或打开项目，然后选择左侧章节开始写作..."
      :disabled="!activeTab"
      @keydown="onKeydown"
    ></textarea>
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useEditorStore } from '../../stores/editor'
import { useDeAiStore } from '../../stores/deai'

const editorStore = useEditorStore()
const deAiStore = useDeAiStore()
const editorTextarea = ref<HTMLTextAreaElement | null>(null)
const exportMenu = ref(false)

const activeTab = computed(() => editorStore.activeTab)
const wordCount = computed(() => {
  if (!activeTab.value) return 0
  return (activeTab.value.content || '').length
})

function onInput(e: Event) {
  const target = e.target as HTMLTextAreaElement
  if (activeTab.value) {
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
  if (activeTab.value) {
    editorStore.markSaved(activeTab.value.id)
  }
}

function undo() {
  document.execCommand('undo')
}

function redo() {
  document.execCommand('redo')
}

function generateContent() {
  // will be wired to pipeline generate
}

function findNext() {
  if (!editorTextarea.value || !editorStore.findQuery) return
  const text = editorTextarea.value.value
  const idx = text.indexOf(editorStore.findQuery, editorTextarea.value.selectionEnd)
  if (idx >= 0) {
    editorTextarea.value.setSelectionRange(idx, idx + editorStore.findQuery.length)
  }
}

function replaceAll() {
  if (!activeTab.value || !editorStore.findQuery) return
  const content = activeTab.value.content
  const newContent = content.split(editorStore.findQuery).join(editorStore.replaceQuery)
  editorStore.updateContent(activeTab.value.id, newContent)
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
  height: 40px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.editor-mode-badge {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
}
.editor-title {
  font-size: 13px;
  color: var(--text-secondary);
  flex-shrink: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}
.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  overflow-x: auto;
}
.editor-toolbar-group {
  display: flex;
  gap: 4px;
}
.sep {
  width: 1px;
  height: 16px;
  background: var(--border-color);
}
.btn-sm {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
  height: 24px;
  cursor: pointer;
}
.btn-secondary {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}
.btn-secondary:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.word-count {
  font-size: 11px;
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
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 6px 6px 0 0;
  border: 1px solid transparent;
  border-bottom: none;
  white-space: nowrap;
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
  font-size: 10px;
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
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 12px;
  height: 24px;
  outline: none;
}
.find-close {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 16px;
}
.editor-content {
  flex: 1;
  width: 100%;
  border: none;
  outline: none;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--editor-font, serif);
  font-size: clamp(13px, 1vw, 18px);
  line-height: 1.8;
  padding: 24px 32px;
  resize: none;
  overflow-y: auto;
}
.editor-content:disabled {
  opacity: 0.5;
}
</style>
