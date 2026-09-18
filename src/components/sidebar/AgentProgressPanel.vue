<template>
  <div class="agent-progress-panel" :class="{ collapsed: !expanded }">
    <div class="agp-header" @click="expanded = !expanded">
      <span class="agp-title">智能体进度</span>
      <span class="agp-toggle">{{ expanded ? '<' : '>' }}</span>
    </div>
    <div v-if="expanded" class="agp-body">
      <div v-if="agents.length === 0" class="agp-empty">暂无运行中的智能体</div>
      <div v-for="agent in agents" :key="agent.id" class="agp-item">
        <span class="agp-status-dot" :class="agent.status"></span>
        <span class="agp-name">{{ agent.name }}</span>
        <div class="agp-mini-bar">
          <div class="agp-mini-fill" :style="{ width: agent.progress + '%' }"></div>
        </div>
        <span class="agp-task">{{ agent.task }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, onUnmounted } from 'vue'

const expanded = ref(false)
const agents = reactive<any[]>([])

let pollTimer: number | null = null

async function pollAgentStatus() {
  try {
    if (window.electronAPI?.agentStatus) {
      const status = await window.electronAPI.agentStatus('all')
      if (Array.isArray(status)) {
        agents.splice(0, agents.length, ...status)
      }
    }
  } catch (e) {
    console.warn('[AgentProgressPanel] agent status poll failed:', e)
  }
}

function startPolling() {
  stopPolling()
  pollTimer = window.setInterval(pollAgentStatus, 2000)
  void pollAgentStatus()
}

function stopPolling() {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer)
    pollTimer = null
  }
}

watch(expanded, (value) => {
  if (value) startPolling()
  else stopPolling()
}, { immediate: true })

onUnmounted(() => {
  stopPolling()
})

</script>

<style scoped>
.agent-progress-panel {
  position: fixed;
  left: 48px;
  top: 40px;
  width: 280px;
  max-height: 60vh;
  background: var(--bg-tertiary);
  border-right: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
  border-radius: 0 0 8px 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  transition: var(--transition);
}
.agent-progress-panel.collapsed {
  width: 0;
  overflow: hidden;
  border: none;
}
.agent-progress-panel.collapsed .agp-header {
  width: 0;
  min-width: 0;
  padding: 0;
  border: none;
  overflow: hidden;
}
.agp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-6);
  cursor: pointer;
  border-bottom: 1px solid var(--border-color);
}
.agp-title {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-secondary);
}
.agp-toggle {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}
.agp-body {
  overflow-y: auto;
  padding: var(--space-2) 0;
}
.agp-empty {
  padding: var(--space-5);
  text-align: center;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
}
.agp-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-5);
  font-size: var(--font-size-sm);
}
.agp-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.agp-status-dot.running { background: var(--success); }
.agp-status-dot.completed { background: var(--accent); }
.agp-status-dot.failed { background: var(--danger); }
.agp-status-dot.waiting { background: var(--warning); }
.agp-status-dot.idle { background: var(--text-muted); }
.agp-name {
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 60px;
}
.agp-mini-bar {
  flex: 1;
  height: 4px;
  background: var(--bg-input);
  border-radius: var(--radius-xs);
  overflow: hidden;
}
.agp-mini-fill {
  height: 100%;
  background: var(--accent);
  transition: width var(--duration-normal) var(--ease-standard);
}
.agp-task {
  color: var(--text-muted);
  white-space: nowrap;
  text-overflow: ellipsis;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
