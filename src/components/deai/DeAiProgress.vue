<template>
  <div class="deai-progress-overlay">
    <div class="deai-progress-modal">
      <div class="deai-progress-header">
        <span>去AI味处理中</span>
        <span class="deai-percent">{{ deAiStore.progress }}%</span>
      </div>
      <div class="deai-progress-bar">
        <div id="deai-progress-fill" class="deai-progress-fill" :style="{ width: deAiStore.progress + '%' }"></div>
      </div>
      <div class="deai-progress-info">
        <span id="deai-progress-percent" class="deai-progress-percent">{{ deAiStore.progress }}%</span>
        <span id="deai-progress-step" class="deai-progress-step">{{ deAiStore.currentStep }}</span>
      </div>
      <!-- step list with dot indicators -->
      <div id="deai-step-list" class="deai-step-list">
        <div
          v-for="(step, i) in deAiStore.flowPreview"
          :key="i"
          class="deai-step-item"
          :class="getStepClass(i)"
        >
          <span class="deai-step-dot"></span>
          <span class="deai-step-label">{{ step }}</span>
          <span class="deai-step-status">{{ getStepStatusText(i) }}</span>
        </div>
      </div>
      <button class="btn-secondary" @click="cancelDeAi">取消</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useDeAiStore } from '../../stores/deai'

const deAiStore = useDeAiStore()

function cancelDeAi() {
  window.dispatchEvent(new CustomEvent('deai-cancel'))
}

function getCurrentIdx(): number {
  const total = deAiStore.flowPreview.length
  return Math.floor((deAiStore.progress / 100) * total)
}

function getStepClass(index: number): string {
  if (deAiStore.progress === 100) return 'done'
  const currentIdx = getCurrentIdx()
  if (index < currentIdx) return 'done'
  if (index === currentIdx && deAiStore.isProcessing) return 'active'
  return 'pending'
}

function getStepStatusText(index: number): string {
  const cls = getStepClass(index)
  if (cls === 'done') return '完成'
  if (cls === 'active') return '处理中...'
  return '等待'
}
</script>

<style scoped>
.deai-progress-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: var(--bg-overlay, rgba(0,0,0,0.5));
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.deai-progress-modal {
  width: min(480px, 90vw);
  background: var(--bg-elevated, var(--bg-tertiary));
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md, 12px);
  padding: 24px;
  box-shadow: var(--shadow-lg, 0 8px 32px rgba(0,0,0,0.3));
}
.deai-progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-md, 16px);
  font-size: var(--font-size-lg, 16px);
  font-weight: var(--fw-semibold, 600);
}
.deai-percent {
  font-size: var(--font-size-lg, 16px);
  font-weight: var(--fw-semibold, 600);
  color: var(--accent);
}
/* progress bar */
.deai-progress-bar {
  width: 100%;
  height: 8px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
  overflow: hidden;
  margin-bottom: var(--space-sm);
}
.deai-progress-fill {
  height: 100%;
  width: 0%;
  background: var(--accent-gradient);
  border-radius: var(--radius-sm);
  transition: width 0.3s ease;
}
.deai-progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-md, 16px);
}
.deai-progress-step {
  font-size: var(--font-size-sm, 13px);
  color: var(--text-secondary);
}
/* step list with dot indicators - matches old arch style.css L7370-7385 */
.deai-step-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs, 4px);
  margin-bottom: var(--space-md, 16px);
}
.deai-step-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm, 8px);
  padding: var(--space-xs, 4px) var(--space-sm, 8px);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm, 13px);
}
.deai-step-item .deai-step-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 2px solid var(--border-color);
  background: transparent;
}
.deai-step-item .deai-step-label {
  flex: 1;
  color: var(--text-secondary);
}
.deai-step-item .deai-step-status {
  font-size: var(--font-size-xs, 12px);
  color: var(--text-muted);
}
/* pending state */
.deai-step-item.pending .deai-step-dot {
  border-color: var(--border-color);
  background: transparent;
}
/* active state - pulse animation */
.deai-step-item.active .deai-step-dot {
  border-color: var(--accent);
  background: var(--accent);
  animation: deai-pulse 1s ease-in-out infinite;
}
.deai-step-item.active .deai-step-label {
  color: var(--text-primary);
  font-weight: var(--fw-medium, 500);
}
.deai-step-item.active .deai-step-status {
  color: var(--accent);
}
/* done state */
.deai-step-item.done .deai-step-dot {
  border-color: var(--success);
  background: var(--success);
}
.deai-step-item.done .deai-step-label {
  color: var(--text-muted);
  text-decoration: line-through;
}
.deai-step-item.done .deai-step-status {
  color: var(--success);
}
/* failed state */
.deai-step-item.failed .deai-step-dot {
  border-color: var(--danger);
  background: var(--danger);
}
.deai-step-item.failed .deai-step-label {
  color: var(--danger);
}
.deai-step-item.failed .deai-step-status {
  color: var(--danger);
}
@keyframes deai-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
