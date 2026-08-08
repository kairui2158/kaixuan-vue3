<template>
  <div class="app-container">
    <header class="app-header">
      <div class="header-left">
        <span class="app-title">小说工坊</span>
      </div>
      <div class="header-right">
        <select v-model="selectedAgent" class="header-selector" aria-label="选择智能体">
          <option value="">默认</option>
          <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
        <select v-model="selectedModel" class="header-selector" aria-label="选择模型">
          <option value="">自动</option>
          <option v-for="m in availableModels" :key="m" :value="m">{{ m }}</option>
        </select>
        <button class="btn-icon" title="清空对话" @click="clearChat">x</button>
      </div>
    </header>

    <main>
      <div class="app-body">
        <SidebarNav :active-panel="activePanel" @navigate="handleNavigate" />

        <div class="app-main">
          <ChapterTree v-if="!activePanel" />
          <SettingsModal v-if="activePanel === 'settings'" @close="activePanel=''" />
          <PipelinePanel v-if="activePanel === 'pipeline'" @close="activePanel=''" />
          <SettingsCollectionPanel v-if="activePanel === 'settings-collection'" @close="activePanel=''" />
          <OutlineWorkspace v-if="activePanel === 'outline'" @close="activePanel=''" />

          <template v-if="!activePanel">
            <div class="resizer-v" data-target="chapter"></div>
            <EditorPanel />
            <div class="resizer-v" data-target="chat"></div>
            <ChatPanel />
          </template>
        </div>
      </div>
    </main>

    <DeAiProgress v-if="deAiStore.isProcessing" />
    <AgentProgressPanel />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAgentStore } from './stores/agent'
import { useProviderStore } from './stores/provider'
import { useProjectStore } from './stores/project'
import { useSettingsStore } from './stores/settings'
import { useDeAiStore } from './stores/deai'
import { useSkillStore } from './stores/skill'
import SidebarNav from './components/sidebar/SidebarNav.vue'
import ChapterTree from './components/sidebar/ChapterTree.vue'
import EditorPanel from './components/editor/EditorPanel.vue'
import ChatPanel from './components/chat/ChatPanel.vue'
import SettingsModal from './components/settings/SettingsModal.vue'
import PipelinePanel from './components/pipeline/PipelinePanel.vue'
import SettingsCollectionPanel from './components/settings-collection/ScPanel.vue'
import OutlineWorkspace from './components/common/OutlineWorkspace.vue'
import DeAiProgress from './components/deai/DeAiProgress.vue'
import AgentProgressPanel from './components/sidebar/AgentProgressPanel.vue'

const agentStore = useAgentStore()
const providerStore = useProviderStore()
const projectStore = useProjectStore()
const settingsStore = useSettingsStore()
const deAiStore = useDeAiStore()
const skillStore = useSkillStore()

const activePanel = ref('')
const selectedAgent = ref('')
const selectedModel = ref('')

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

function clearChat() {
  // emit to chat panel via store or event bus
}

onMounted(() => {
  settingsStore.loadSettings()
  providerStore.loadProviders()
  agentStore.loadAgents()
  skillStore.loadSkills()
  deAiStore.loadConfig()
  deAiStore.updateFlowPreview()
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
  height: 40px;
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
  overflow: hidden;
}
.resizer-v {
  width: 4px;
  background: var(--border-color);
  cursor: col-resize;
  flex-shrink: 0;
}
.resizer-v:hover {
  background: var(--accent);
}
</style>
