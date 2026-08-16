<template>
  <transition-group name="toast" tag="div" class="toast-container">
    <div v-for="t in toasts" :key="t.id" class="log-toast" :class="t.level" @click="dismiss(t.id)">
      <span class="toast-level">{{ t.level.toUpperCase() }}</span>
      <span class="toast-msg">{{ t.msg }}</span>
    </div>
  </transition-group>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { subscribe } from '../services/diag.js'

interface Toast { id: number; level: string; msg: string; ts: number }

const toasts = ref<Toast[]>([])
let nextId = 0
let unsub: (() => void) | null = null

function dismiss(id: number) {
  const idx = toasts.value.findIndex(t => t.id === id)
  if (idx >= 0) toasts.value.splice(idx, 1)
}

onMounted(() => {
  unsub = subscribe((entry: any) => {
    if (entry.level !== 'error' && entry.level !== 'warn') return
    const id = nextId++
    toasts.value.push({ id, level: entry.level, msg: entry.msg, ts: entry.tsMs })
    if (toasts.value.length > 5) toasts.value.shift()
    setTimeout(() => dismiss(id), 5000)
  })
})

onUnmounted(() => { if (unsub) unsub() })
</script>

<style scoped>
.toast-container {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}
.log-toast {
  background: var(--bg-secondary, #1e1e22);
  border: 1px solid var(--border-color, #3a3a3e);
  border-radius: var(--radius-sm);
  padding: var(--space-4) var(--space-6);
  font-size: var(--font-size-sm);
  display: flex;
  gap: 8px;
  align-items: center;
  max-width: 400px;
  cursor: pointer;
  pointer-events: auto;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}
.log-toast.error { border-left: 3px solid #dc3545; }
.log-toast.warn { border-left: 3px solid #ffc107; }
.toast-level { font-weight: 700; font-size: var(--font-size-xs); flex-shrink: 0; }
.log-toast.error .toast-level { color: var(--danger); }
.log-toast.warn .toast-level { color: var(--warning); }
.toast-msg { color: var(--text-secondary, #ccc); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.toast-enter-active, .toast-leave-active { transition: all 0.3s ease; }
.toast-enter-from { opacity: 0; transform: translateX(20px); }
.toast-leave-to { opacity: 0; transform: translateX(20px); }
</style>
