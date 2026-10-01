<template>
  <div class="toast-viewport" role="status" aria-live="polite">
    <div
      v-for="item in items"
      :key="item.id"
      :class="['toast-message', `is-${item.variant}`, { 'is-leaving': item.leaving }]"
      @click="toast.dismiss(item.id)"
    >
      <span class="toast-edge" aria-hidden="true"></span>
      <span class="toast-text">{{ item.message }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { toast, type ToastItem } from '../../services/toastService'

const items = ref<ToastItem[]>([])
let unsubscribe: (() => void) | null = null

onMounted(() => {
  unsubscribe = toast.subscribe((next) => {
    items.value = next
  })
})

onBeforeUnmount(() => {
  unsubscribe?.()
})
</script>

<style scoped>
.toast-viewport {
  position: fixed;
  top: var(--space-5);
  right: var(--space-5);
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  pointer-events: none;
  max-width: min(420px, calc(100vw - 32px));
}
.toast-message {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  padding: var(--space-3) var(--space-5);
  background: var(--bg-elevated);
  border: 1px solid var(--border-hairline);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-sm);
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  line-height: 1.45;
  pointer-events: auto;
  cursor: default;
  animation: toastSlideIn 180ms var(--ease-standard);
}
.toast-message:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.toast-message.is-leaving {
  animation: toastSlideOut 180ms var(--ease-standard) forwards;
}
.toast-edge {
  width: 3px;
  align-self: stretch;
  border-radius: var(--radius-pill);
  background: var(--accent);
  flex-shrink: 0;
}
.toast-message.is-success .toast-edge { background: var(--success); }
.toast-message.is-warning .toast-edge { background: var(--warning); }
.toast-message.is-danger .toast-edge { background: var(--danger); }
.toast-text {
  min-width: 0;
  overflow-wrap: anywhere;
}
@keyframes toastSlideIn {
  from { opacity: 0; transform: translateX(12px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes toastSlideOut {
  from { opacity: 1; transform: translateX(0); }
  to { opacity: 0; transform: translateX(12px); }
}
</style>
