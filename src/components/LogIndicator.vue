<template>
  <div v-if="visible" class="log-indicator" :class="{ 'has-error': errorCount > 0 }" @click="togglePanel">
    <svg class="indicator-icon" viewBox="0 0 24 24" width="20" height="20">
      <path v-if="errorCount > 0" fill="currentColor" d="M12 2L1 21h22L12 2zm0 6l7.5 13h-15L12 8zm-1 4v4h2v-4h-2zm0 6v2h2v-2h-2z"/>
      <path v-else fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h2v-6h-2v6zm0-8h2V7h-2v2z"/>
    </svg>
    <span v-if="errorCount > 0" class="indicator-badge">{{ errorCount > 99 ? '99+' : errorCount }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { subscribe } from '../services/diag.js'

const visible = ref(true)
const errorCount = ref(0)
const emit = defineEmits<{ toggle: [] }>()

let unsub: (() => void) | null = null

function togglePanel() {
  emit('toggle')
}

onMounted(() => {
  unsub = subscribe((entry: any) => {
    if (entry.level === 'error') {
      errorCount.value++
    }
  })
})

onUnmounted(() => {
  if (unsub) unsub()
})
</script>

<style scoped>
.log-indicator {
  position: fixed;
  bottom: 16px;
  right: 16px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--bg-tertiary, #2a2a2e);
  border: 1px solid var(--border-color, #3a3a3e);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 9998;
  color: var(--text-muted, #888);
  transition: all 0.2s ease;
}
.log-indicator:hover {
  background: var(--bg-hover, #3a3a3e);
  transform: scale(1.05);
}
.log-indicator.has-error {
  background: #dc3545;
  border-color: #dc3545;
  color: #fff;
  animation: pulse 2s infinite;
}
@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(220,53,69,0.4); }
  50% { box-shadow: 0 0 0 6px rgba(220,53,69,0); }
}
.indicator-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #dc3545;
  color: #fff;
  font-size: var(--font-size-xs);
  font-weight: 700;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}
</style>
