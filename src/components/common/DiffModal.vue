<template>
  <div class="modal-overlay" :class="{ 'modal-hidden': !visible }" @click.self="$emit('close')">
    <div class="modal-content diff-modal-content">
      <div class="modal-header">
        <h3>AI 修改对比</h3>
        <span id="diff-count" class="diff-count">{{ changeCount }} 处变更</span>
        <button class="btn-close" id="btn-close-diff" @click="$emit('close')">&times;</button>
      </div>
      <div class="modal-body diff-modal-body">
        <div class="diff-toolbar">
          <button class="btn-sm btn-secondary" id="btn-diff-prev" @click="navDiff(-1)">上一处</button>
          <button class="btn-sm btn-secondary" id="btn-diff-next" @click="navDiff(1)">下一处</button>
          <button class="btn-sm btn-primary" id="btn-diff-accept-all" @click="acceptAll">全部接受</button>
          <button class="btn-sm btn-secondary" id="btn-diff-reject-all" @click="rejectAll">全部拒绝</button>
        </div>
        <div class="diff-container" id="diff-container">
          <div class="diff-pane">
            <div class="diff-pane-label">原文</div>
            <div class="diff-content" id="diff-original">
              <div v-for="(line, idx) in originalLines" :key="'o-' + idx"
                class="diff-line"
                :class="lineClass(line)"
                :data-idx="line.changeIdx !== undefined ? line.changeIdx : undefined"
                :style="lineStyle(line)">
                <span class="diff-action reject" v-if="line.type === 'removed'" @click="rejectLine(line.changeIdx)">x</span>
                <span class="diff-line-text">{{ line.text }}</span>
              </div>
            </div>
          </div>
          <div class="diff-pane">
            <div class="diff-pane-label">AI 修改</div>
            <div class="diff-content" id="diff-modified">
              <div v-for="(line, idx) in modifiedLines" :key="'m-' + idx"
                class="diff-line"
                :class="lineClass(line)"
                :data-idx="line.changeIdx !== undefined ? line.changeIdx : undefined"
                :style="lineStyle(line)">
                <span class="diff-action accept" v-if="line.type === 'added'" @click="acceptLine(line.changeIdx)">v</span>
                <span class="diff-line-text">{{ line.text }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-primary" id="btn-diff-apply" @click="applyResult">应用结果到编辑器</button>
        <button class="btn-secondary" id="btn-diff-cancel" @click="$emit('close')">取消</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { lcsDiff, buildDiffResult, acceptDiffLine, rejectDiffLine } from '../../services/diff-utils.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  original: { type: String, default: '' },
  modified: { type: String, default: '' }
})

const emit = defineEmits(['close', 'apply'])

const diffChanges = ref([])
const diffAccepted = ref({})
const currentIdx = ref(0)
const changeCount = ref(0)

// Build the two display line arrays from diffChanges
const originalLines = computed(() => {
  const lines = []
  let changeIdx = 0
  for (const c of diffChanges.value) {
    if (c.type === 'unchanged') {
      lines.push({ text: c.text, type: 'unchanged', changeIdx: undefined })
    } else if (c.type === 'removed') {
      lines.push({ text: c.text, type: 'removed', changeIdx })
      changeIdx++
    } else if (c.type === 'added') {
      // Show empty placeholder in original pane for added lines
      lines.push({ text: '', type: 'unchanged', changeIdx: undefined })
    }
  }
  return lines
})

const modifiedLines = computed(() => {
  const lines = []
  let changeIdx = 0
  for (const c of diffChanges.value) {
    if (c.type === 'unchanged') {
      lines.push({ text: c.text, type: 'unchanged', changeIdx: undefined })
    } else if (c.type === 'removed') {
      // Show empty placeholder in modified pane for removed lines
      lines.push({ text: '', type: 'unchanged', changeIdx: undefined })
    } else if (c.type === 'added') {
      lines.push({ text: c.text, type: 'added', changeIdx })
      changeIdx++
    }
  }
  return lines
})

function lineClass(line) {
  if (line.type === 'removed') return 'removed'
  if (line.type === 'added') return 'added'
  return 'unchanged'
}

function lineStyle(line) {
  if (line.changeIdx === undefined) return {}
  const accepted = diffAccepted.value[line.changeIdx]
  if (accepted === true) return { opacity: '0.5', textDecoration: 'line-through' }
  if (accepted === false) return { opacity: '0.3' }
  return {}
}

function acceptLine(idx) {
  diffAccepted.value = { ...acceptDiffLine({ ...diffAccepted.value }, idx) }
}

function rejectLine(idx) {
  diffAccepted.value = { ...rejectDiffLine({ ...diffAccepted.value }, idx) }
}

function acceptAll() {
  const acc = {}
  let changeIdx = 0
  for (const c of diffChanges.value) {
    if (c.type !== 'unchanged') {
      acc[changeIdx] = true
      changeIdx++
    }
  }
  diffAccepted.value = acc
}

function rejectAll() {
  const acc = {}
  let changeIdx = 0
  for (const c of diffChanges.value) {
    if (c.type !== 'unchanged') {
      acc[changeIdx] = false
      changeIdx++
    }
  }
  diffAccepted.value = acc
}

function navDiff(dir) {
  const maxIdx = changeCount.value - 1
  if (maxIdx < 0) return
  let newIdx = currentIdx.value + dir
  if (newIdx < 0) newIdx = maxIdx
  if (newIdx > maxIdx) newIdx = 0
  currentIdx.value = newIdx
  nextTick(() => {
    const els = document.querySelectorAll('.diff-line[data-idx="' + newIdx + '"]')
    if (els[0]) els[0].scrollIntoView({ block: 'center' })
  })
}

function applyResult() {
  const result = buildDiffResult(diffChanges.value, diffAccepted.value)
  emit('apply', result)
}

watch(() => [props.visible, props.original, props.modified], () => {
  if (props.visible && props.original !== undefined && props.modified !== undefined) {
    const changes = lcsDiff(props.original, props.modified)
    diffChanges.value = changes
    // Count changes
    let cnt = 0
    for (const c of changes) {
      if (c.type !== 'unchanged') cnt++
    }
    changeCount.value = cnt
    diffAccepted.value = {}
    currentIdx.value = 0
  }
})
</script>

<style scoped>
.modal-content.diff-modal-content {
  position: relative;
  background: var(--bg-primary, #1e1e2e);
  border: 1px solid var(--border-color, #2d2d3f);
  width: 90vw;
  max-width: 1000px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  z-index: 1001;
}
.diff-count {
  font-size: 12px;
  color: var(--text-muted, #888);
}
.btn-close {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--text-secondary, #aaa);
  font-size: 20px;
  cursor: pointer;
}
.diff-modal-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.diff-toolbar {
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-color, #2d2d3f);
}
.diff-container {
  flex: 1;
  display: flex;
  overflow: hidden;
}
.diff-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--border-color, #2d2d3f);
}
.diff-pane:last-child {
  border-right: none;
}
.diff-pane-label {
  padding: 6px 12px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted, #888);
  background: var(--bg-secondary, #2d2d3f);
  border-bottom: 1px solid var(--border-color, #2d2d3f);
}
.diff-content {
  flex: 1;
  overflow-y: auto;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  line-height: 1.6;
}
.diff-line {
  display: flex;
  align-items: flex-start;
  padding: 1px 8px;
  min-height: 20px;
}
.diff-line.unchanged {
  color: var(--text-primary, #eee);
}
.diff-line.removed {
  background: rgba(255, 80, 80, 0.1);
  color: #ff6666;
}
.diff-line.added {
  background: rgba(80, 200, 120, 0.1);
  color: #50c878;
}
.diff-action {
  cursor: pointer;
  padding: 0 4px;
  font-weight: bold;
  font-size: 12px;
  flex-shrink: 0;
  width: 16px;
  text-align: center;
}
.diff-action.reject {
  color: #ff4444;
}
.diff-action.accept {
  color: #44cc44;
}
.diff-line-text {
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
