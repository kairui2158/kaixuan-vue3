<template>
  <div class="mode-card" :class="{ active: isActive }" @click="select">
    <div class="card-header">
      <span class="card-name">{{ mode.name }}</span>
      <span v-if="mode.recommended" class="card-badge">推荐</span>
    </div>
    <p class="card-desc">{{ mode.desc }}</p>
    <div class="card-flow">
      <span v-for="(step, i) in mode.flow" :key="i" class="flow-step">{{ step }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  mode: { id: string; name: string; desc: string; flow: string[]; recommended?: boolean }
  isActive: boolean
}>()

const emit = defineEmits<{ select: [string] }>()

function select() {
  emit('select', props.mode.id)
}
</script>

<style scoped>
.mode-card {
  flex: 1;
  padding: 16px;
  background: var(--bg-tertiary);
  border: 2px solid var(--border-color);
  border-radius: 12px;
  cursor: pointer;
  transition: var(--transition);
}
.mode-card:hover {
  border-color: var(--border-light);
}
.mode-card.active {
  border-color: var(--accent);
  background: var(--bg-hover);
}
.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.card-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.card-badge {
  background: var(--accent);
  color: var(--text-on-accent);
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
}
.card-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
  line-height: 1.5;
}
.card-flow {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.flow-step {
  padding: 2px 8px;
  background: var(--bg-input);
  border-radius: 3px;
  font-size: 10px;
  color: var(--text-muted);
}
</style>
