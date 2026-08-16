<template>
  <div id="exit-confirm-modal" v-if="visible" class="modal-overlay" @click.self="cancel">
    <div class="modal-content modal-content-sm">
      <div class="modal-header">
        <h3>确认退出</h3>
        <button class="btn-close" @click="cancel">&times;</button>
      </div>
      <div class="modal-body">
        <p class="exit-msg-primary">退出前会先保存当前数据</p>
        <p class="exit-msg-secondary">应用按设定间隔自动保存；两种退出方式都会先写入磁盘。</p>
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
import { useEditorStore } from '../../stores/editor'
import { storageKey } from '../../utils/storage-key'

const visible = ref(false)
const projectStore = useProjectStore()
const providerStore = useProviderStore()
const editorStore = useEditorStore()

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
  var _activeTab = editorStore.activeTab
  var _cid = _activeTab?.chapterId || null
  var _vid = null
  if (_cid) {
    for (var _volId of Object.keys(projectStore.chapters)) {
      if (projectStore.chapters[_volId].some(function(c) { return c.id === _cid })) { _vid = _volId; break }
    }
  }
  window.electronAPI?.storageWrite?.(storageKey('lastSession'), {
    pid: projectStore.currentProjectId,
    vid: _vid,
    cid: _cid,
    ts: Date.now()
  })
  window.dispatchEvent(new CustomEvent('editor-save'))
})
function cancel() {
  visible.value = false
  window.electronAPI?.respondCloseChoice?.('cancel')
}
function directExit() {
  projectStore.saveProject()
  providerStore.saveProviders()
  window.dispatchEvent(new CustomEvent('editor-save'))
  visible.value = false
  window.electronAPI?.respondCloseChoice?.('force-quit')
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
.exit-msg-primary {
  margin: 0 0 8px 0; font-size: var(--font-size-md); color: var(--text-primary);
}
.exit-msg-secondary {
  margin: 0; font-size: var(--font-size-sm); color: var(--text-muted); line-height: 1.6;
}
.footer-right { display: flex; gap: 8px; }
</style>
