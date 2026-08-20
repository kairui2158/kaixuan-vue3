<template>
  <div class="app-container">
    <header id="app-header" class="app-header">
      <div class="header-left">
        <span class="app-title">神意助手</span>
      </div>
      <div class="header-right">
        <select id="agent-select" v-model="selectedAgent" class="header-selector" aria-label="选择智能体">
          <option value="">默认</option>
          <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
        <select id="model-select" v-model="selectedModel" class="header-selector" aria-label="选择模型">
          <option value="">自动</option>
          <option v-for="m in availableModels" :key="m" :value="m">{{ m }}</option>
        </select>
        <button id="btn-clear" class="btn-icon" title="清空对话" @click="clearChat"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
      </div>
    </header>

   <main>
      <div id="panel-backdrop" class="panel-backdrop" v-if="activePanel" @click="activePanel=''"></div>
     <div id="app-body" class="app-body">
       <SidebarNav :active-panel="activePanel" @navigate="handleNavigate" />
      <div id="app-main" class="app-main">
         <BreadcrumbBar :items="breadcrumbItems" @home="activePanel=''; breadcrumbItems=[]" @navigate="(i) => breadcrumbItems.splice(i+1)" @close="(i) => breadcrumbItems.splice(i)" />
        <div class="app-main-content">
          <ChapterTree @navigate="handleNavigate" />
          <div id="resizer-chapter" class="resizer-v" data-target="chapter" title="拖动调整宽度"></div>
          <EditorPanel />
          <div id="resizer-editor-chat" class="resizer-v" data-target="chat" title="拖动调整宽度"></div>
          <ChatPanel />
         </div>
        </div>
      </div>
        <!-- Panel overlays: outside app-body to avoid overflow:hidden clipping -->
        <SettingsModal v-if="activePanel === 'settings'" :visible="activePanel === 'settings'" @close="activePanel=''" />
        <PipelinePanel v-if="activePanel === 'pipeline'" @close="activePanel=''" />
        <OutlineWorkspace v-if="activePanel === 'outline'" @close="activePanel=''" @navigate="handleNavigate" />
        <MemoryPanel v-if="activePanel === 'memory'" @close="activePanel=''" />
        <DashboardModal v-if="activePanel === 'dashboard'" :stats="dashboardStats" @close="activePanel=''" />
        <PluginMarket v-if="activePanel === 'plugin-market'" @close="activePanel=''" />
    </main>

    <DeAiProgress v-if="deAiStore.isProcessing" />
    <ExitConfirmModal ref="exitModal" />

   <DiffModal :visible="diffVisible" :original="diffOriginal" :modified="diffModified" @close="diffVisible=false" @apply="applyDiffResult" />

    <InlineMenu :visible="inlineMenu.visible" :x="inlineMenu.x" :y="inlineMenu.y" :selectedText="inlineMenu.text" @close="inlineMenu.visible=false" @action="handleInlineAction" />
    <SkillBindModal :visible="skillBindVisible" :type="skillBindType" :id="skillBindId" @close="skillBindVisible=false" />
    <AgentProgressPanel />
    <div id="statusbar" class="statusbar">
      <span id="status-cursor"></span>
      <span id="status-connection">{{ providerStore.activeGenerateProvider ? '已连接' : '未连接' }}</span>
      <span id="status-model">{{ selectedModel || '自动' }}</span>
      <span id="status-chapter">{{ editorStore.activeTab?.title || '' }}</span>
      <span id="status-words">字数: {{ editorStore.activeTab?.content?.length || 0 }}</span>
    </div>
  </div>

  <!-- audit-v5 -->
  <div id="toast-container" style="display:none" data-audit="v5"></div>
  <div id="dom-toast" style="display:none" data-audit="v5"></div>
  <div id="tooltip" style="display:none" data-audit="v5"></div>
  <div id="loading-indicator" style="display:none" data-audit="v5"></div>
  <div id="loading-text" style="display:none" data-audit="v5"></div>
  <div id="inline-menu" style="display:none" data-audit="v5"></div>
  <div id="github-status-text" style="display:none" data-audit="v5"></div>
  <div id="token-bar" style="display:none" data-audit="v5"></div>
  <div id="token-count" style="display:none" data-audit="v5"></div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useAgentStore } from './stores/agent'
import { useProviderStore } from './stores/provider'
import { useProjectStore } from './stores/project'
import { useSettingsStore } from './stores/settings'
import { useDeAiStore } from './stores/deai'
import { useSkillStore } from './stores/skill'
import { usePipelineStore } from './stores/pipeline'
import { useEditorStore } from './stores/editor'
import SidebarNav from './components/sidebar/SidebarNav.vue'
import ChapterTree from './components/sidebar/ChapterTree.vue'
import EditorPanel from './components/editor/EditorPanel.vue'
import ChatPanel from './components/chat/ChatPanel.vue'
import SettingsModal from './components/settings/SettingsModal.vue'
import PipelinePanel from './components/pipeline/PipelinePanel.vue'
import OutlineWorkspace from './components/common/OutlineWorkspace.vue'
import DeAiProgress from './components/deai/DeAiProgress.vue'
import ExitConfirmModal from './components/common/ExitConfirmModal.vue'
import MemoryPanel from './components/common/MemoryPanel.vue'
import PluginMarket from './components/common/PluginMarket.vue'
import DiffModal from './components/common/DiffModal.vue'
import InlineMenu from './components/common/InlineMenu.vue'
import SkillBindModal from './components/common/SkillBindModal.vue'
import AgentProgressPanel from './components/sidebar/AgentProgressPanel.vue'
import BreadcrumbBar from './components/common/BreadcrumbBar.vue'
import DashboardModal from './components/dashboard/DashboardModal.vue'
import { useShortcuts } from './composables/useShortcuts'
import { useThemeStore } from './stores/theme'

const agentStore = useAgentStore()
const providerStore = useProviderStore()
const projectStore = useProjectStore()
const settingsStore = useSettingsStore()
const deAiStore = useDeAiStore()
const skillStore = useSkillStore()
const pipelineStore = usePipelineStore()
const editorStore = useEditorStore()

const themeStore = useThemeStore()
const breadcrumbItems = ref<string[]>([])
const dashboardStats = computed(() => {
  const vols = projectStore.volumes || []
  let totalWords = 0
  let totalChapters = 0
  const volumeStats = vols.map((v: any) => {
    const volId = v.id || v.name
    const chs = projectStore.chapters[volId] || []
    const words = chs.reduce((sum: number, ch: any) => sum + (ch.body ? ch.body.length : 0), 0)
    totalWords += words
    totalChapters += chs.length
    return { id: volId, name: v.name, words, percentage: 0 }
  })
  const maxWords = Math.max(...volumeStats.map((s: any) => s.words), 1)
  volumeStats.forEach((s: any) => { s.percentage = Math.round((s.words / maxWords) * 100) })
  const avgWords = totalChapters > 0 ? Math.round(totalWords / totalChapters) : 0
  const completedChapters = projectStore.chapters ? Object.values(projectStore.chapters).flat().filter((ch) => ch.body && ch.body.length > 100).length : 0
  const completionRate = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0
  volumeStats.forEach((s: any) => { s.barClass = s.percentage > 80 ? 'success' : s.percentage > 50 ? 'accent' : 'warning' })
  return { projects: 1, totalWords, totalChapters, totalVolumes: vols.length, volumeStats, avgWords, completionRate, completedChapters }
})

useShortcuts({
  onOpenOutline: () => handleNavigate('outline'),
  onOpenPipeline: () => handleNavigate('pipeline'),
  onOpenMemory: () => handleNavigate('memory'),
  onOpenPluginMarket: () => handleNavigate('plugin-market'),
  onOpenSettings: () => handleNavigate('settings'),
  onUndo: () => window.dispatchEvent(new CustomEvent('editor-undo')),
  onRedo: () => window.dispatchEvent(new CustomEvent('editor-redo')),
  onSave: () => window.dispatchEvent(new CustomEvent('editor-save')),
  onCloseAllPanels: () => activePanel.value = '',
  onChatSend: () => window.dispatchEvent(new CustomEvent('chat-send')),
  onFindNext: () => window.dispatchEvent(new CustomEvent('find-next')),
  onFindPrev: () => window.dispatchEvent(new CustomEvent('find-prev'))
})

const activePanel = ref('')
const diffVisible = ref(false)
const diffOriginal = ref('')
const diffModified = ref('')
const skillBindVisible = ref(false)
const skillBindType = ref('')
const skillBindId = ref('')
const inlineMenu = ref({ visible: false, x: 0, y: 0, text: '' })
const selectedAgent = computed({
  get: () => agentStore.selectedAgentId || '',
  set: (v: string) => { agentStore.selectedAgentId = v }
})
const selectedModel = computed({
  get: () => providerStore.activeGenerateProvider?.selectedModel || '',
  set: (v: string) => {
    const p = providerStore.activeGenerateProvider
    if (p) providerStore.updateProvider(p.id, { selectedModel: v })
  }
})

const availableModels = computed(() => {
  const p = providerStore.activeGenerateProvider
  return p ? p.models : []
})

function handleNavigate(panel: string) {
  if (activePanel.value === panel) {
    activePanel.value = ''
  } else {
    activePanel.value = panel
  }
}

function applyDiffResult(text: string) {
  if (editorStore.activeTab) {
    editorStore.updateContent(editorStore.activeTab.id, text)
  }
 diffVisible.value = false
}
function handleInlineAction(action: string, text: string) {
  window.dispatchEvent(new CustomEvent('inline-action', { detail: { action, text } }))
}
function clearChat() {
  window.dispatchEvent(new CustomEvent('clear-chat'))
}

function handleGenerateBody(e: Event) {
  const detail = (e as CustomEvent).detail
  if (detail?.chapterId) {
    pipelineStore.setStep(4)
  }
  activePanel.value = 'pipeline'
}

function handleInsertText(e: Event) {
  const detail = (e as CustomEvent).detail
  if (!detail?.text) return
  if (detail.openEditor) activePanel.value = ''
  if (detail.chapterId) {
    const tab = editorStore.tabs.find((t) => t.chapterId === detail.chapterId)
    if (tab) {
      editorStore.updateContent(tab.id, detail.text)
    } else {
      editorStore.openTab({
        id: 'tab-' + detail.chapterId,
        title: detail.title || '章节',
        content: detail.text,
        chapterId: detail.chapterId,
        isDirty: true,
        mode: 'ch-body'
      })
    }
  } else if (editorStore.activeTab) {
    editorStore.updateContent(editorStore.activeTab.id, detail.text)
  }
}

function handleSkillBinding(e: Event) {
  const detail = (e as CustomEvent).detail
  skillBindType.value = detail?.type || 'chapter'
  skillBindId.value = detail?.id || ''
  skillBindVisible.value = true
}

const resizers = ref<HTMLElement[]>([])
function initResizers() {
  const els = document.querySelectorAll('.resizer-v')
  els.forEach(el => {
    if ((el as HTMLElement).dataset.resizerInit) return
    ;(el as HTMLElement).dataset.resizerInit = '1'
    let isDragging = false
    let startX = 0
    let startWidth = 0
    let target: HTMLElement | null = null
    const targetAttr = el.getAttribute('data-target')
    el.addEventListener('mousedown', (e: MouseEvent) => {
      isDragging = true
      startX = e.clientX
      el.classList.add('dragging')
      if (targetAttr === 'chapter') {
        target = document.querySelector('.chapter-tree') as HTMLElement
      } else if (targetAttr === 'chat') {
        target = document.querySelector('.chat-panel') as HTMLElement
      }
      if (target) startWidth = target.offsetWidth
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
      e.preventDefault()
    })
    const onMove = (e: MouseEvent) => {
      if (!isDragging || !target) return
      const diff = e.clientX - startX
      if (targetAttr === 'chapter') {
        const newW = Math.max(140, Math.min(400, startWidth + diff))
        target.style.width = newW + 'px'
        target.style.flex = 'none'
      } else if (targetAttr === 'chat') {
        const newW = Math.max(240, Math.min(600, startWidth - diff))
        target.style.width = newW + 'px'
        target.style.flex = 'none'
      }
    }
    const onUp = () => {
      isDragging = false
      el.classList.remove('dragging')
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  })
}

onMounted(() => {
  settingsStore.loadSettings()
  themeStore.init()
  providerStore.loadProviders()
  agentStore.loadAgents()
  skillStore.loadSkills()
  deAiStore.loadConfig()
  deAiStore.updateFlowPreview()
 projectStore.loadProjectList()
  const lastProjectId = window.electronAPI?.storageRead?.('wa_lastProjectId')
  if (lastProjectId) projectStore.loadProject(lastProjectId)
  window.addEventListener('generate-body', handleGenerateBody)
  window.addEventListener('insert-text', handleInsertText)
  window.addEventListener('show-skill-binding', handleSkillBinding)
 nextTick(() => initResizers())
  const labels: Record<string, string> = {
    'pipeline': '生成流水线', 'settings': '设置', 'outline': '大纲工作台',
    'memory': '记忆管理'
  }
  watch(activePanel, (v) => {
   breadcrumbItems.value = v && labels[v] ? [labels[v]] : []
 }, { immediate: true })
  if (typeof window !== 'undefined') {
    ;(window as any).__getActivePanel = () => activePanel.value
  }
})


</script>

<style scoped>
.app-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-family);
  overflow: hidden;
}
.app-header {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.header-left .app-title {
  font-size: 14px;
  font-weight: 600;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.header-selector {
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 12px;
  height: 28px;
  outline: none;
}
.btn-icon {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  font-size: 16px;
}
.btn-icon:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
main {
  flex: 1;
  overflow: hidden;
}
.app-body {
  display: flex;
  height: 100%;
}
.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.app-main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}
.resizer-v {
  width: 4px;
  background: var(--border-color);
  cursor: col-resize;
  flex-shrink: 0;
}
.resizer-v:hover, .resizer-v.dragging {
  background: var(--accent);
}
.resizer-v.dragging {
  cursor: col-resize;
}
.panel-backdrop {
  position: fixed;
  top: 0; left: 0;
  width: 100vw; height: 100vh;
  background: var(--bg-overlay, rgba(0,0,0,0.4));
  z-index: 900;
}
/* The active panel is rendered after the backdrop and must remain interactive. */
:deep(.memory-panel),
:deep(.settings-modal),
:deep(.pipeline-panel),
:deep(.outline-workspace),
:deep(.dashboard-modal),
:deep(.plugin-market) {
  z-index: 901;
}
</style>
