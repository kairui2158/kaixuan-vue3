<template>
  <div data-modal-id="deai-progress" class="modal-overlay" :style="{ zIndex: modalQueue.getZIndex('deai-progress') }">
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
      <div v-if="deAiStore.errorMessage" id="deai-error" class="deai-error" role="alert">
        <strong>处理未完成</strong>
        <span>{{ deAiStore.errorMessage }}</span>
      </div>
      <div v-if="deAiStore.runStatus === 'waiting_budget'" id="deai-budget" class="deai-budget" role="status">
        <div>
          <strong>API 调用预算已用尽（{{ deAiStore.budgetState?.used }}/{{ deAiStore.budgetState?.limit }}）</strong>
          <span>{{ deAiStore.budgetState?.blockedReason || '可追加预算后继续处理' }}</span>
        </div>
        <button id="deai-budget-extend" class="btn-secondary" @click="extendBudget">追加 4 次并继续</button>
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
      <button class="btn-secondary" @click="closeProgress">{{ deAiStore.errorMessage ? '关闭' : '取消' }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useModalQueue } from '../../composables/useModalQueue'
import { useDeAiStore } from '../../stores/deai'

const deAiStore = useDeAiStore()
const modalQueue = useModalQueue()

onMounted(() => modalQueue.open('deai-progress'))
onBeforeUnmount(() => modalQueue.close('deai-progress'))

function cancelDeAi() {
  window.dispatchEvent(new CustomEvent('deai-cancel'))
}

function extendBudget() {
  deAiStore.extendBudget(4)
}

function closeProgress() {
  if (deAiStore.errorMessage) {
    deAiStore.clearError()
    return
  }
  cancelDeAi()
}

function getCurrentIdx(): number {
  const total = deAiStore.flowPreview.length
  return Math.floor((deAiStore.progress / 100) * total)
}

function getStepClass(index: number): string {
  if (deAiStore.errorMessage) {
    const failedIndex = deAiStore.flowPreview.findIndex(step => deAiStore.lastFailedStep.includes(step))
    if (failedIndex === index) return 'failed'
    if (failedIndex >= 0 && index > failedIndex) return 'pending'
  }
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
.deai-progress-modal {
  width: min(540px, 92vw);
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: var(--space-8);
  box-shadow: var(--shadow-lg);
}
.deai-progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-6);
  font-size: var(--font-size-lg);
  font-weight: var(--fw-semibold);
}
.deai-percent {
  font-size: var(--font-size-lg);
  font-weight: var(--fw-semibold);
  color: var(--accent);
}
/* progress bar */
.deai-progress-bar {
  width: 100%;
  height: 8px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
  overflow: hidden;
  margin-bottom: var(--space-4);
}
.deai-progress-fill {
  height: 100%;
  width: 0%;
  background: var(--accent-gradient);
  border-radius: var(--radius-sm);
  transition: width var(--duration-normal) var(--ease-standard);
}
.deai-progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-6);
}
.deai-progress-step {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}
.deai-error {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0 0 var(--space-6);
  padding: var(--space-5) var(--space-5);
  border: 1px solid color-mix(in srgb, var(--danger) 45%, transparent);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--danger) 10%, transparent);
  color: var(--danger);
  font-size: var(--font-size-sm);
  line-height: 1.5;
}
.deai-error strong { font-weight: var(--fw-semibold); }
.deai-budget {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin: 0 0 var(--space-6);
  padding: var(--space-5);
  border: 1px solid color-mix(in srgb, var(--warning) 45%, transparent);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--warning) 10%, transparent);
  color: var(--warning);
  font-size: var(--font-size-sm);
}
.deai-budget > div {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.deai-budget strong { font-weight: var(--fw-semibold); }
.deai-budget button {
  flex-shrink: 0;
  white-space: nowrap;
}
/* step list with dot indicators - matches old arch style.css L7370-7385 */
.deai-step-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-6);
}
.deai-step-item {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
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
  font-size: var(--font-size-xs);
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
  animation: deai-pulse var(--duration-pulse) var(--ease-standard) infinite;
}
.deai-step-item.active .deai-step-label {
  color: var(--text-primary);
  font-weight: var(--fw-medium);
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
