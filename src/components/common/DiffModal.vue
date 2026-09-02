<template>
  <div class="modal-overlay" :class="{ 'modal-hidden': !visible }" @click.self="$emit('close')">
    <div class="modal-content diff-modal-content">
      <div class="modal-header">
        <h3>AI 修改对比</h3>
        <div v-if="editMeta" class="edit-meta">
          <span class="edit-meta-target">{{ editMeta.targetLabel }}</span>
          <span class="edit-meta-operation" :class="{ 'is-danger': editMeta.dangerous }">{{ editMeta.operationLabel }}</span>
          <span v-if="editMeta.failureReason" class="edit-meta-failure">{{ editMeta.failureReason }}</span>
        </div>
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
        <div v-if="batchItems.length" class="batch-toolbar" id="diff-batch-items">
          <div class="batch-title">编辑批次</div>
          <div class="batch-items">
            <span v-for="item in batchItems" :key="item.index" class="batch-item-group">
              <button
                class="batch-item"
                :class="{ 'is-danger': item.dangerous, 'is-excluded': !batchAccepted[item.index] }"
                type="button"
                :title="item.reason || item.label"
                @click="toggleBatchItem(item.index)"
              >
                <span class="batch-item-index">{{ item.index + 1 }}</span>
                <span class="batch-item-label">{{ item.label }}</span>
              </button>
              <button
                v-if="item.range"
                class="batch-item batch-item-locate"
                type="button"
                title="定位到编辑器"
                @click.stop="locateBatchItem(item)"
              >定位</button>
            </span>
          </div>
        </div>
        <div class="diff-container" id="diff-container">
          <div class="diff-pane">
            <div class="diff-pane-label">原文</div>
            <div class="diff-content" id="diff-original">
              <div v-if="windowStart > 0" class="diff-window-hint" @click="windowStart = Math.max(0, windowStart - windowSize)">向上加载</div>
              <div v-for="(line, idx) in visibleOriginalLines" :key="'o-' + (idx + windowStart)"
                class="diff-line"
                :class="lineClass(line)"
                :data-idx="line.changeIdx !== undefined ? line.changeIdx : undefined"
                :style="lineStyle(line)">
                <span class="diff-action reject" v-if="line.type === 'removed'" @click="rejectLine(line.changeIdx)">x</span>
                <span class="diff-line-text">{{ line.text }}</span>
              </div>
              <div v-if="windowStart + windowSize < originalLines.length" class="diff-window-hint" @click="windowStart += windowSize">向下加载</div>
            </div>
          </div>
          <div class="diff-pane">
            <div class="diff-pane-label">AI 修改</div>
            <div class="diff-content" id="diff-modified">
              <div v-if="windowStart > 0" class="diff-window-hint" @click="windowStart = Math.max(0, windowStart - windowSize)">向上加载</div>
              <div v-for="(line, idx) in visibleModifiedLines" :key="'m-' + (idx + windowStart)"
                class="diff-line"
                :class="lineClass(line)"
                :data-idx="line.changeIdx !== undefined ? line.changeIdx : undefined"
                :style="lineStyle(line)">
                <span class="diff-action accept" v-if="line.type === 'added'" @click="acceptLine(line.changeIdx)">v</span>
                <span class="diff-line-text">{{ line.text }}</span>
              </div>
              <div v-if="windowStart + windowSize < modifiedLines.length" class="diff-window-hint" @click="windowStart += windowSize">向下加载</div>
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
  modified: { type: String, default: '' },
  editMeta: { type: Object, default: null }
})

const emit = defineEmits(['close', 'apply'])

const diffChanges = ref([])
const diffAccepted = ref({})
const windowStart = ref(0)
const windowSize = ref(400)
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

const visibleOriginalLines = computed(() => originalLines.value.slice(windowStart.value, windowStart.value + windowSize.value))
const visibleModifiedLines = computed(() => modifiedLines.value.slice(windowStart.value, windowStart.value + windowSize.value))

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

function updateWindow() {
  const firstChanged = diffChanges.value.findIndex(change => change.type !== 'unchanged')
  if (firstChanged < 0) {
    windowStart.value = 0
    return
  }
  const half = Math.floor(windowSize.value / 2)
  windowStart.value = Math.max(0, firstChanged - half)
}

function applyResult() {
  const result = buildDiffResult(diffChanges.value, diffAccepted.value)
  if (batchItems.value.length > 0) {
    emit('apply', result, Object.keys(batchAccepted.value).filter(index => batchAccepted.value[index]).map(Number))
    return
  }
  emit('apply', result)
}

const batchItems = computed(() => {
  const items = props.editMeta?.batchItems
  return Array.isArray(items) ? items : []
})
const batchAccepted = ref({})

function toggleBatchItem(index) {
  batchAccepted.value = { ...batchAccepted.value, [index]: !batchAccepted.value[index] }
}

function locateBatchItem(item) {
  if (!item?.range) return
  window.dispatchEvent(new CustomEvent('diff-locate', {
    detail: { workspace: props.editMeta?.workspace || 'main', targetId: props.editMeta?.targetId, range: item.range }
  }))
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
    updateWindow()
    const accepted = {}
    for (const item of batchItems.value) accepted[item.index] = true
    batchAccepted.value = accepted
  }
})
</script>

<style scoped>
.modal-content.diff-modal-content {
  position: relative;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  width: 90vw;
  max-width: 1000px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  z-index: 1001;
}
.diff-count {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}
.btn-close {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: var(--font-size-xxl);
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
  padding: var(--space-4) var(--space-6);
  border-bottom: 1px solid var(--border-color);
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
  border-right: 1px solid var(--border-color);
}
.diff-pane:last-child {
  border-right: none;
}
.diff-pane-label {
  padding: 6px 12px;
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--text-muted);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}
.diff-content {
  flex: 1;
  overflow-y: auto;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: var(--font-size-sm);
  line-height: 1.6;
}
.diff-line {
  display: flex;
  align-items: flex-start;
  padding: 1px 8px;
  min-height: 20px;
}
.diff-line.unchanged {
  color: var(--text-primary);
}
.diff-line.removed {
  background: var(--diff-remove-bg);
  color: var(--danger);
}
.diff-line.added {
  background: var(--diff-add-bg);
  color: var(--success);
}
.diff-action {
  cursor: pointer;
  padding: 0 4px;
  font-weight: bold;
  font-size: var(--font-size-sm);
  flex-shrink: 0;
  width: 16px;
  text-align: center;
}
.diff-action.reject {
  color: var(--danger);
}
.diff-action.accept {
  color: var(--success);
}
.diff-line-text {
  white-space: pre-wrap;
  word-break: break-all;
}
.edit-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  margin-left: 12px;
  overflow: hidden;
}
.edit-meta-target,
.edit-meta-operation,
.edit-meta-failure {
  min-width: 0;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-xs);
}
.edit-meta-target {
  color: var(--text-secondary);
}
.edit-meta-operation {
  padding: 2px 6px;
  border-radius: var(--radius-xs);
  background: var(--bg-input);
  color: var(--text-secondary);
}
.edit-meta-operation.is-danger {
  background: var(--danger-dim);
  color: var(--danger);
}
.edit-meta-failure {
  color: var(--danger);
}
.batch-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}
.batch-title {
  flex: 0 0 auto;
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--text-muted);
}
.batch-items {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  gap: 6px;
  overflow-x: auto;
}
.batch-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
  min-width: 0;
  max-width: 180px;
  padding: 3px 7px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xs);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: var(--font-size-xs);
  cursor: pointer;
}
.batch-item.is-danger {
  color: var(--danger);
  border-color: var(--danger);
}
.batch-item.is-excluded {
  opacity: 0.45;
  text-decoration: line-through;
}
.batch-item-index {
  color: var(--text-muted);
}
.batch-item-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.batch-item-group {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 3px;
}
.batch-item-locate {
  padding: 3px 7px;
}
.diff-window-hint {
  padding: 6px 10px;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  cursor: pointer;
  text-align: center;
}
.diff-window-hint:hover {
  color: var(--text-primary);
}
</style>
