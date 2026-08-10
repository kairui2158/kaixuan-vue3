<template>
  <div id="exit-confirm-modal" v-if="visible" class="modal-backdrop" @click.self="cancel">
    <div class="modal-content modal-content-sm">
      <div class="modal-header">
        <h3>确认退出</h3>
        <button class="btn-close" @click="cancel">&times;</button>
      </div>
      <div class="modal-body">
        <p class="exit-msg-primary">您的数据已自动保存</p>
        <p class="exit-msg-secondary">应用在每次修改时自动保存到磁盘。</p>
        <p class="exit-msg-secondary">确认退出应用？</p>
      </div>
      <div class="modal-footer">
        <button id="btn-exit-cancel" class="btn-secondary" @click="cancel">取消</button>
        <div class="footer-right">
          <button id="btn-exit-direct" class="btn-secondary" @click="directExit">直接退出</button>
          <button id="btn-exit-save" class="btn-primary" @click="saveAndExit">保存并退出</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useProjectStore } from '../../stores/project'
import { useProviderStore } from '../../stores/provider'

const visible = ref(false)
const projectStore = useProjectStore()
const providerStore = useProviderStore()

function show() { visible.value = true }
function hide() { visible.value = false }
// Listen for close request from main process
window.electronAPI?.onCloseRequest?.(() => {
  show()
})
 // Listen for final save event from main process (backup save before quit)
 window.electronAPI?.onFinalSave?.(() => {
   projectStore.saveProject()
   providerStore.saveProviders()
 })
function cancel() {
  visible.value = false
  window.electronAPI?.respondCloseChoice?.('cancel')
}
function directExit() {
  visible.value = false
  window.electronAPI?.respondCloseChoice?.('quit')
}
function saveAndExit() {
  hide()
  projectStore.saveProject()
  providerStore.saveProviders()
  window.electronAPI?.respondCloseChoice?.('quit')
}

defineExpose({ show, hide })
</script>

<style scoped>
.modal-backdrop {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: var(--bg-overlay); display: flex; align-items: center; justify-content: center;
  z-index: 9999;
}
.modal-content-sm { max-width: 380px; }
.exit-msg-primary {
  margin: 0 0 8px 0; font-size: var(--font-size-md); color: var(--text-primary);
}
.exit-msg-secondary {
  margin: 0; font-size: var(--font-size-sm); color: var(--text-muted); line-height: 1.6;
}
.footer-right { display: flex; gap: 8px; }
</style>
