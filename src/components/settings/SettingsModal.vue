<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content modal-lg">
      <div class="modal-header">
        <span>设置</span>
        <button class="modal-close" @click="$emit('close')">x</button>
      </div>
      <div class="modal-body">
        <div class="settings-tabs">
          <button
            v-for="tab in tabs"
            :key="tab.id"
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
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSettingsStore } from '../../stores/settings'
import ApiSettings from './ApiSettings.vue'
import SkillSettings from './SkillSettings.vue'
import AgentSettings from './AgentSettings.vue'
import AppearanceSettings from './AppearanceSettings.vue'
import DeAiSettings from './DeAiSettings.vue'

defineEmits<{ close: [] }>()

const settingsStore = useSettingsStore()

const tabs = [
  { id: 'api' as const, label: 'API设置' },
  { id: 'skill' as const, label: '技能' },
  { id: 'agent' as const, label: '智能体' },
  { id: 'appearance' as const, label: '外观' },
  { id: 'deai' as const, label: '去AI味' },
]
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: var(--bg-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-content {
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  max-height: 85vh;
}
.modal-lg { width: 800px; }
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border-color);
  font-size: 16px;
  font-weight: 600;
}
.modal-close {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 18px;
}
.modal-close:hover { color: var(--danger); }
.modal-body {
  display: flex;
  overflow: hidden;
  flex: 1;
}
.settings-tabs {
  width: 140px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 8px;
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
  border-radius: 6px;
  font-size: 13px;
}
.settings-tab:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.settings-tab.active {
  background: var(--bg-hover);
  color: var(--accent);
  font-weight: 500;
}
.settings-panel {
  flex: 1;
  padding: 16px 24px;
  overflow-y: auto;
}
</style>
