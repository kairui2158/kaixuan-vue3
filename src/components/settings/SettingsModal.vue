<template>
  <div class="modal-overlay" :class="{ 'modal-hidden': !visible }" @click.self="$emit('close')">
    <div class="modal-content modal-lg" :class="{ 'modal-closing': closing }">
      <div class="modal-header">
        <h3>设置</h3>
        <button id="btn-close-settings" class="modal-close" @click="handleClose">x</button>
      </div>
      <div id="tab-api" class="modal-body">
        <div id="settings-modal" class="settings-tabs">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            :id="'tab-' + tab.id"
            class="settings-tab"
            :class="{ active: settingsStore.activeTab === tab.id }"
            @click="settingsStore.setActiveTab(tab.id)"
          >{{ tab.label }}</button>
        </div>
        <div class="settings-panel">
          <ApiSettings v-if="settingsStore.activeTab === 'api'" />
          <SkillSettings v-else-if="settingsStore.activeTab === 'skill'" />
          <AgentSettings v-else-if="settingsStore.activeTab === 'agent'" />
          <AppearanceSettings v-else-if="settingsStore.activeTab === 'appearance'" />
          <DeAiSettings v-else-if="settingsStore.activeTab === 'deai'" />
          <DiagLogPanel v-else-if="settingsStore.activeTab === 'diag'" />
          <McpSettings v-else-if="settingsStore.activeTab === 'mcp'" />
        </div>
      </div>
      <div class="modal-footer">
        <button id="btn-test-connection" class="btn-secondary footer-left" @click="handleClose">取消</button>
        <button id="btn-save-settings" class="btn-primary footer-right" @click="handleSave">保存</button>
      </div>
    </div>
  </div>

</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useSettingsStore } from '../../stores/settings'
import { useProviderStore } from '../../stores/provider'
import { useSkillStore } from '../../stores/skill'
import { useAgentStore } from '../../stores/agent'
import ApiSettings from './ApiSettings.vue'
import SkillSettings from './SkillSettings.vue'
import AgentSettings from './AgentSettings.vue'
import AppearanceSettings from './AppearanceSettings.vue'
import DeAiSettings from './DeAiSettings.vue'
import DiagLogPanel from './DiagLogPanel.vue'
import McpSettings from './McpSettings.vue'

const emit = defineEmits<{ close: [] }>()
const props = defineProps<{ visible: boolean }>()

const settingsStore = useSettingsStore()
const providerStore = useProviderStore()
const skillStore = useSkillStore()
const agentStore = useAgentStore()
const closing = ref(false)

const tabs = [
  { id: 'api' as const, label: 'API设置' },
  { id: 'skill' as const, label: '技能' },
  { id: 'agent' as const, label: '智能体' },
  { id: 'appearance' as const, label: '外观' },
  { id: 'deai' as const, label: '去AI味' },
  { id: 'diag' as const, label: '诊断日志' },
  { id: 'mcp' as const, label: 'MCP' },
]

function handleClose() {
  closing.value = true
  setTimeout(() => emit('close'), 200)
}

function handleSave() {
  providerStore.saveProviders()
  skillStore.saveSkills()
  agentStore.saveAgents()
  settingsStore.saveSettings()
  closing.value = true
  setTimeout(() => emit('close'), 200)
}
</script>

<style scoped>
@keyframes modalIn {
  from { opacity: 0; transform: scale(0.95) translateY(-10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes modalOut {
  from { opacity: 1; transform: scale(1) translateY(0); }
  to { opacity: 0; transform: scale(0.95) translateY(-10px); }
}

.modal-content.modal-closing {
  animation: modalOut 0.2s ease-in forwards;
}
/* modal-lg: settings modal size (old arch L4790) */
.modal-lg { width: 800px; max-width: 90vw; min-height: 600px; max-height: 85vh; }

/* modal-body override: flex layout for settings sidebar (old arch L2052) */
.modal-body {
  padding: var(--space-md, 16px);
  overflow: hidden;
  flex: 1;
  min-height: 0;
  display: flex;
}

/* footer buttons (old arch L1879-1897) */
.modal-footer button {
  height: var(--btn-md-height, 32px);
  min-width: 80px;
  padding: 0 var(--space-md, 16px);
  font-size: var(--font-size-sm, 13px);
  border-radius: var(--radius-sm);
  cursor: pointer;
  border: none;
}
.modal-footer .footer-left {
  margin-right: auto;
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}
.modal-footer .footer-left:hover {
  background: var(--bg-hover);
}
.modal-footer .footer-right {
  margin-left: auto;
  background: var(--accent);
  color: var(--text-on-accent);
}
.modal-footer .footer-right:hover {
  transform: translateY(-1px);
}

/* === settings tabs === */
.settings-tabs {
  width: 140px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-sm, 8px);
  border-right: 1px solid var(--border-color);
  flex-shrink: 0;
}
.settings-tab {
  text-align: left;
  padding: 8px 12px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: var(--radius-sm, 6px);
  font-size: var(--font-size-sm, 13px);
  position: relative;
  transition: background 0.12s ease, color 0.12s ease;
}
.settings-tab:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.settings-tab.active {
  background: var(--accent-dim, var(--bg-hover));
  color: var(--accent);
  font-weight: 500;
}
/* active indicator bar (old arch L1933-1945) */
.settings-tab.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 3px;
  background: var(--accent);
  border-radius: 0 3px 3px 0;
}

.settings-panel {
  flex: 1;
  padding: var(--space-md, 16px) var(--space-lg, 24px);
  overflow-y: auto;
}
</style>

