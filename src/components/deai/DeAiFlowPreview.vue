<template>
  <div class="deai-flow-preview">
    <div class="flow-steps">
      <template v-for="(step, i) in steps" :key="i">
        <span class="deai-flow-step" :class="{ active: isCurrent(i), done: isDone(i) }">{{ step }}</span>
        <span v-if="i < steps.length - 1" class="deai-flow-arrow">-></span>
      </template>
    </div>
    <div class="deai-flow-time" v-if="estimatedTime">预计耗时: {{ estimatedTime }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useDeAiStore } from '../../stores/deai'

const deAiStore = useDeAiStore()

const steps = computed(() => deAiStore.flowPreview)

// estimate time based on mode and step count
const estimatedTime = computed(() => {
  const stepCount = steps.value.length
  if (stepCount === 0) return ''
  if (deAiStore.mode === 'split-merge') {
    // parallel mode: ~10s per step (parallel cuts time)
    const secs = stepCount * 10
    return formatTime(secs)
  } else if (deAiStore.mode === 'multi-step') {
    // multi-step: ~15s per step (more API calls)
    const secs = stepCount * 15
    return formatTime(secs)
  } else {
    // chain: ~20s per step (serial)
    const secs = stepCount * 20
    return formatTime(secs)
  }
})

function formatTime(secs: number): string {
  if (secs < 60) return `${secs}秒`
  const min = Math.floor(secs / 60)
  const rem = secs % 60
  return rem > 0 ? `${min}分${rem}秒` : `${min}分钟`
}

function isCurrent(index: number): boolean {
  const total = steps.value.length
  const currentIdx = Math.floor((deAiStore.progress / 100) * total)
  return index === currentIdx && deAiStore.isProcessing
}

function isDone(index: number): boolean {
  const total = steps.value.length
  const currentIdx = Math.floor((deAiStore.progress / 100) * total)
  return index < currentIdx || (deAiStore.progress === 100 && index < total)
}
</script>

<style scoped>
/* matches old arch style.css L7395-7398 */
.deai-flow-preview {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: var(--space-sm, 8px);
  font-size: var(--font-size-sm, 13px);
  color: var(--text-secondary);
  line-height: 1.8;
}
.flow-steps {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-wrap: wrap;
}
.deai-flow-step {
  display: inline-block;
  padding: 2px 8px;
  margin: 2px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-size: var(--font-size-sm, 13px);
}
.deai-flow-step.active {
  background: var(--accent);
  color: var(--text-on-accent);
}
.deai-flow-step.done {
  background: var(--success);
  color: var(--text-on-accent);
}
.deai-flow-arrow {
  color: var(--text-muted);
  margin: 0 2px;
  font-size: var(--font-size-sm, 13px);
}
/* time estimate - matches old arch .deai-flow-time */
.deai-flow-time {
  font-weight: 600;
  color: var(--text-primary);
  margin-top: var(--space-xs, 4px);
  font-size: var(--font-size-sm, 13px);
}
</style>
