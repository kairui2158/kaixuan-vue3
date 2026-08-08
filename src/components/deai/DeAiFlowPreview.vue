<template>
  <div class="flow-preview">
    <div class="flow-header">处理流程预览</div>
    <div class="flow-steps">
      <template v-for="(step, i) in steps" :key="i">
        <div class="flow-node" :class="{ active: isCurrent(i), done: isDone(i) }">
          <span class="flow-icon" v-if="isDone(i)">done</span>
          <span class="flow-icon" v-else-if="isCurrent(i)">...</span>
          <span class="flow-icon" v-else>{{ i + 1 }}</span>
          <span class="flow-label">{{ step }}</span>
        </div>
        <span v-if="i < steps.length - 1" class="flow-arrow">-></span>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useDeAiStore } from '../../stores/deai'

const deAiStore = useDeAiStore()

const steps = computed(() => deAiStore.flowPreview)

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
.flow-preview {
  padding: 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}
.flow-header {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 10px;
}
.flow-steps {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.flow-node {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 11px;
  color: var(--text-muted);
}
.flow-node.active {
  background: var(--accent);
  color: var(--text-on-accent);
  border-color: var(--accent);
}
.flow-node.done {
  background: var(--success);
  color: var(--text-on-accent);
  border-color: var(--success);
}
.flow-icon {
  font-size: 10px;
  font-weight: 600;
}
.flow-arrow {
  color: var(--text-muted);
  font-size: 10px;
}
</style>
