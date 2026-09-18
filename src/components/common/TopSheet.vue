<template>
  <Transition name="topsheet">
    <div v-if="visible" class="topsheet-overlay" :style="{ zIndex: modalQueue.getZIndex(modalId) }" @click.self="$emit('close')">
      <div class="topsheet-panel" :style="{ maxHeight: height }">
        <div class="topsheet-header">
          <span class="topsheet-title">{{ title }}</span>
          <button class="topsheet-close" @click="$emit('close')">×</button>
        </div>
        <div class="topsheet-body">
          <slot />
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useModalQueue } from '../../composables/useModalQueue'

interface Props {
  visible: boolean
  modalId?: string
  title?: string
  height?: string
}

const props = withDefaults(defineProps<Props>(), {
  modalId: 'topsheet',
  title: '',
  height: '40vh'
})

defineEmits<{ close: [] }>()

const modalQueue = useModalQueue()
const modalId = computed(() => props.modalId)

watch(() => props.visible, visible => {
  if (visible) modalQueue.open(modalId.value)
  else modalQueue.close(modalId.value)
}, { immediate: true })
</script>

<style scoped>
.topsheet-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal, 3000);
  background: var(--bg-overlay, rgba(0,0,0,0.3));
}
.topsheet-panel {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  background: var(--bg-elevated, #1e1e2e);
  border-bottom: 1px solid var(--border-color, #333);
  box-shadow: var(--shadow-lg, 0 8px 32px rgba(0,0,0,0.4));
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.topsheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-5) var(--space-6);
  border-bottom: 1px solid var(--border-color, #333);
  flex: 0 0 auto;
}
.topsheet-title {
  font-size: var(--font-size-md, 14px);
  color: var(--text-primary, #e0e0e0);
  font-weight: 600;
}
.topsheet-close {
  background: none;
  border: none;
  font-size: 20px;
  color: var(--text-secondary, #999);
  cursor: pointer;
  padding: 0 var(--space-2);
}
.topsheet-close:hover {
  color: var(--text-primary, #e0e0e0);
}
.topsheet-body {
  padding: var(--space-5) var(--space-6);
  overflow-y: auto;
  flex: 1 1 auto;
}
.topsheet-enter-from {
  transform: translateY(-100%);
}
.topsheet-enter-active {
  transition: transform 0.25s ease;
}
.topsheet-enter-to {
  transform: translateY(0);
}
.topsheet-leave-from {
  transform: translateY(0);
}
.topsheet-leave-active {
  transition: transform 0.25s ease;
}
.topsheet-leave-to {
  transform: translateY(-100%);
}
</style>
