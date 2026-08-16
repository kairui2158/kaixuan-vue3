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
   padding: var(--space-5);
   background: var(--bg-tertiary);
   border: 1px solid var(--border-color);
   border-radius: var(--radius-md);
   cursor: pointer;
   transition: var(--transition);
 }
 .mode-card:hover {
   border-color: var(--border-light);
   box-shadow: var(--shadow-sm);
   transform: translateY(-1px);
 }
 .mode-card.active {
   border-color: var(--accent);
   box-shadow: 0 0 0 1px var(--accent-glow, rgba(90,125,154,0.15));
   background: var(--bg-hover);
 }
.card-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
.card-name {
  font-size: var(--font-size-md);
  font-weight: 600;
  color: var(--text-primary);
}
.card-badge {
  background: var(--accent);
  color: var(--text-on-accent);
  font-size: var(--font-size-xxs);
  padding: 1px 6px;
  border-radius: var(--radius-xs);
}
.card-desc {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin-bottom: var(--space-3);
  line-height: var(--lh-normal);
}
.card-flow {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.flow-step {
  padding: 2px 8px;
  background: var(--bg-input);
  border-radius: var(--radius-xs);
  font-size: var(--font-size-xxs);
  color: var(--text-muted);
}
</style>
