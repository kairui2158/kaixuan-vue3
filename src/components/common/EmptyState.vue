<template>
  <div :class="['empty-state', `is-${variant}`]" role="status">
    <AppIcon :name="icon" :size="iconSize" class="empty-state-icon" />
    <div class="empty-state-title">{{ title }}</div>
    <div v-if="description" class="empty-state-description">{{ description }}</div>
    <slot name="action" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AppIcon, { type AppIconName } from './AppIcon.vue'

const props = withDefaults(defineProps<{
  title: string
  description?: string
  icon?: AppIconName
  variant?: 'default' | 'compact'
}>(), {
  icon: 'inbox',
  variant: 'default',
})

const iconSize = computed(() => (props.variant === 'compact' ? 16 : 24))
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-8) var(--space-5);
  color: var(--text-muted);
  text-align: center;
}
.empty-state.is-compact {
  padding: var(--space-4);
  gap: var(--space-1);
}
.empty-state-icon {
  color: var(--text-muted);
  opacity: 0.7;
}
.empty-state-title {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  font-weight: 500;
  line-height: 1.45;
}
.empty-state-description {
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  line-height: 1.55;
  max-width: 42ch;
}
</style>
