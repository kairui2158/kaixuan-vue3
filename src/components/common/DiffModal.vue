<template>
  <div id="diff-modal" v-if="visible" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content diff-modal-content">
      <div class="modal-header">
        <h3>AI 修改对比</h3>
        <span id="diff-count" class="diff-count">{{ diffCount }} 处变更</span>
        <button id="btn-close-diff" class="btn-close" @click="$emit('close')">&times;</button>
      </div>
      <div class="modal-body diff-modal-body">
        <div class="diff-toolbar">
          <button id="btn-diff-prev" class="btn-sm btn-secondary" @click="navDiff(-1)">上一处</button>
          <button id="btn-diff-next" class="btn-sm btn-secondary" @click="navDiff(1)">下一处</button>
          <button id="btn-diff-accept-all" class="btn-sm btn-primary" @click="acceptAll">全部接受</button>
          <button id="btn-diff-reject-all" class="btn-sm btn-secondary" @click="rejectAll">全部拒绝</button>
        </div>
        <div id="diff-container" class="diff-container">
          <div class="diff-pane">
            <div class="diff-pane-label">原文</div>
            <div id="diff-modified" class="diff-content diff-original">
              <div v-for="(line, i) in origLines" :key="i" class="diff-line removed">{{ line }}</div>
            </div>
          </div>
          <div class="diff-pane">
            <div class="diff-pane-label">AI 修改</div>
            <div id="diff-original" class="diff-content diff-modified">
              <div v-for="(line, i) in modLines" :key="i" class="diff-line added">{{ line }}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button id="btn-diff-apply" class="btn-primary" @click="applyResult">应用结果到编辑器</button>
        <button id="btn-diff-cancel" class="btn-secondary" @click="$emit('close')">取消</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const props = defineProps<{
  visible: boolean
  original: string
  modified: string
}>()
const emit = defineEmits<{
  close: []
  apply: [text: string]
}>()

const origLines = computed(() => (props.original || '').split('\n'))
const modLines = computed(() => (props.modified || '').split('\n'))
const diffCount = computed(() => Math.abs(modLines.value.length - origLines.value.length))
const currentIdx = ref(0)

function navDiff(dir: number) {
  currentIdx.value = Math.max(0, Math.min(diffCount.value - 1, currentIdx.value + dir))
}
function acceptAll() {
  emit('apply', props.modified)
  emit('close')
}
function rejectAll() {
  emit('close')
}
function applyResult() {
  emit('apply', props.modified)
  emit('close')
}
</script>

<style scoped>
.modal-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: var(--bg-overlay); z-index: var(--z-modal);
  display: flex; align-items: center; justify-content: center;
}
.modal-header h3 { font-size: var(--font-size-lg); font-weight: 600; margin: 0; color: var(--text-primary); }
.diff-count { font-size: var(--font-size-sm); color: var(--text-secondary); }</style>
