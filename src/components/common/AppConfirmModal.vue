<template>
  <div
    v-if="state.visible"
    ref="overlayRef"
    class="modal-overlay modal-nested app-confirm-overlay"
    tabindex="-1"
    @click.self="dismiss"
    @keydown="onKeydown"
  >
    <div class="modal-content modal-content-sm app-confirm-content" role="dialog" aria-modal="true" :aria-label="state.title">
      <div class="modal-header">
        <h3>{{ state.title }}</h3>
      </div>
      <div class="modal-body">
        <p class="app-confirm-message">{{ state.message }}</p>
      </div>
      <div class="modal-footer">
        <button v-if="state.kind === 'confirm'" ref="cancelBtnRef" class="btn-secondary" @click="dismiss">{{ state.cancelText }}</button>
        <button ref="confirmBtnRef" class="btn-primary" :class="{ 'btn-danger': state.danger }" @click="accept">{{ state.confirmText }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useAppConfirm } from '../../composables/useAppConfirm'

const { state, accept, dismiss } = useAppConfirm()
const overlayRef = ref<HTMLElement | null>(null)
const confirmBtnRef = ref<HTMLButtonElement | null>(null)
const cancelBtnRef = ref<HTMLButtonElement | null>(null)

watch(() => state.visible, async (visible) => {
  if (!visible) return
  await nextTick()
  overlayRef.value?.focus()
  const target = state.kind === 'alert'
    ? confirmBtnRef.value
    : (state.danger ? cancelBtnRef.value : confirmBtnRef.value)
  target?.focus()
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    dismiss()
  } else if (e.key === 'Enter' && state.kind === 'alert') {
    e.preventDefault()
    accept()
  }
}
</script>

<style scoped>
.app-confirm-overlay { outline: none; }
.app-confirm-content { --modal-width: 440px; }
.app-confirm-message {
  margin: 0;
  font-size: var(--font-size-md);
  color: var(--text-primary);
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
