<template>
  <div
    v-if="state.visible"
    ref="overlayRef"
    data-modal-id="app-confirm"
    class="modal-overlay modal-nested app-confirm-overlay"
    :style="{ zIndex: confirmZIndex }"
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
import { computed, nextTick, ref, watch } from 'vue'
import { onBeforeUnmount } from 'vue'
import { useAppConfirm } from '../../composables/useAppConfirm'
import { useModalQueue } from '../../composables/useModalQueue'

const { state, accept, dismiss } = useAppConfirm()
const modalQueue = useModalQueue()
const overlayRef = ref<HTMLElement | null>(null)
const confirmBtnRef = ref<HTMLButtonElement | null>(null)
const cancelBtnRef = ref<HTMLButtonElement | null>(null)
const confirmZIndex = computed(() => modalQueue.getZIndex('app-confirm'))

// Verification bridge for responsive E2E; no runtime behavior depends on it.
function showAppConfirmProbe() {
  state.title = '响应式验证确认框'
  state.kind = 'confirm'
  state.message = '这是一个用于确认框压力验证的超长文本，需要检查按钮文字、换行与视口边界表现。'
  state.confirmText = '确认操作'
  state.cancelText = '取消操作'
  state.danger = false
  state.visible = true
}
window.addEventListener('show-app-confirm', showAppConfirmProbe)
onBeforeUnmount(() => window.removeEventListener('show-app-confirm', showAppConfirmProbe))

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
    // Confirm is the active top-layer; closing it must not cascade to the owner modal.
    e.stopPropagation()
    dismiss()
  } else if (e.key === 'Enter' && state.kind === 'alert') {
    e.preventDefault()
    accept()
  }
}
</script>

<style scoped>
.app-confirm-overlay:focus:not(:focus-visible) { outline: none; }
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
