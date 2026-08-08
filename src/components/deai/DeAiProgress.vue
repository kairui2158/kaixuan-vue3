<template>
  <div class="deai-progress-overlay">
    <div class="deai-progress-modal">
      <div class="deai-progress-header">
        <span>去AI味处理中</span>
        <span class="deai-percent">{{ deAiStore.progress }}%</span>
      </div>
      <div class="deai-progress-bar">
        <div class="deai-progress-fill" :style="{ width: deAiStore.progress + '%' }"></div>
      </div>
      <div class="deai-progress-step">{{ deAiStore.currentStep }}</div>
      <div class="deai-flow-preview">
        <span
          v-for="(step, i) in deAiStore.flowPreview"
          :key="i"
          class="flow-step"
          :class="{ active: isStepActive(i), done: isStepDone(i) }"
        >{{ step }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useDeAiStore } from '../../stores/deai'

const deAiStore = useDeAiStore()

function isStepActive(index: number): boolean {
  const total = deAiStore.flowPreview.length
  const currentIdx = Math.floor((deAiStore.progress / 100) * total)
  return index === currentIdx
}

function isStepDone(index: number): boolean {
  const total = deAiStore.flowPreview.length
  const currentIdx = Math.floor((deAiStore.progress / 100) * total)
  return index < currentIdx
}
</script>

<style scoped>
.deai-progress-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: var(--bg-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.deai-progress-modal {
  width: 480px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-lg);
}
.deai-progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  font-size: 16px;
  font-weight: 600;
}
.deai-percent {
  color: var(--accent);
}
.deai-progress-bar {
  width: 100%;
  height: 8px;
  background: var(--bg-input);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 12px;
}
.deai-progress-fill {
  height: 100%;
  background: var(--accent-gradient);
  transition: width 0.3s ease;
}
.deai-progress-step {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 16px;
}
.deai-flow-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.flow-step {
  padding: 3px 10px;
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 11px;
  color: var(--text-muted);
}
.flow-step.active {
  background: var(--accent);
  color: var(--text-on-accent);
  border-color: var(--accent);
}
.flow-step.done {
  background: var(--success);
  color: var(--text-on-accent);
  border-color: var(--success);
}
</style>
