<template>
  <div class="agent-progress-panel" :class="{ collapsed: !expanded }">
    <div class="agp-header" @click="expanded = !expanded">
      <span class="agp-title">Agent 进度</span>
      <span class="agp-toggle">{{ expanded ? '<' : '>' }}</span>
    </div>
    <div v-if="expanded" class="agp-body">
      <div v-if="agents.length === 0" class="agp-empty">暂无运行中的Agent</div>
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
import { ref, reactive, onMounted, onUnmounted } from 'vue'

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
    // silently ignore
  }
}

onMounted(() => {
  pollTimer = window.setInterval(pollAgentStatus, 2000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
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
  transition: var(--transition);
}
.agent-progress-panel.collapsed {
  width: 0;
  overflow: hidden;
  border: none;
}
.agp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--border-color);
}
.agp-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}
.agp-toggle {
  font-size: 12px;
  color: var(--text-muted);
}
.agp-body {
  overflow-y: auto;
  padding: 4px 0;
}
.agp-empty {
  padding: 12px;
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
}
.agp-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 11px;
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
  border-radius: 2px;
  overflow: hidden;
}
.agp-mini-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.3s ease;
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
