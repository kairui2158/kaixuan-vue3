<template>
  <div data-modal-id="diff-modal" class="modal-overlay" :class="{ 'modal-hidden': !visible }" :style="{ zIndex: modalQueue.getZIndex('diff-modal') }" @click.self="$emit('close')">
    <div class="modal-content diff-modal-content">
      <div class="modal-header">
        <h3>AI 修改对比</h3>
        <div v-if="editMeta" class="edit-meta">
          <span class="edit-meta-target">{{ editMeta.targetLabel }}</span>
          <span class="edit-meta-operation" :class="{ 'is-danger': editMeta.dangerous }">{{ editMeta.operationLabel }}</span>
          <span v-if="editMeta.failureReason" class="edit-meta-failure">{{ editMeta.failureReason }}</span>
        </div>
        <div v-if="diagnostics?.failedItems?.length" class="edit-diagnostics">
          <div class="edit-diagnostics-title">写入诊断（{{ diagnostics.failedItems.length }} 条失败）</div>
          <div class="edit-diagnostics-list">
            <div v-for="item in diagnostics.failedItems" :key="item.index" class="edit-diagnostic">
              <span class="edit-diagnostic-index">#{{ item.index + 1 }}</span>
              <span class="edit-diagnostic-reason">{{ item.reason }}</span>
              <span class="edit-diagnostic-message">{{ item.message }}</span>
              <span class="edit-diagnostic-suggestion">{{ suggestionLabel(item.suggestion) }}</span>
            </div>
          </div>
        </div>
        <div v-if="showIntegrity" class="integrity-panel" :class="{ 'is-critical': integrityBlocked }" id="diff-integrity">
          <div class="integrity-title">结构完整性：{{ integrity.summary }}</div>
          <div v-if="integrity.issues.length" class="integrity-list">
            <div
              v-for="(issue, index) in integrity.issues"
              :key="issue.type + '-' + index"
              class="integrity-item"
              :class="'is-' + issue.level"
            >
              <span class="integrity-level">{{ issue.level === 'critical' ? '严重' : '提示' }}</span>
              <span>{{ issue.message }}</span>
            </div>
          </div>
          <div v-if="integrityBlocked" class="integrity-override">
            <span>严重问题默认阻断应用；确认影响后可继续。</span>
            <button type="button" id="btn-diff-allow-critical" @click="criticalOverride = true">仍要应用</button>
          </div>
        </div>
        <div v-if="impact" class="impact-panel" id="diff-impact">
          <div class="impact-title">影响分析：{{ impact.summary }}</div>
          <div v-if="impact.affectedNodes.length" class="impact-nodes">
            <span v-for="node in impact.affectedNodes" :key="node.id" class="impact-node">{{ node.path }}</span>
          </div>
          <div v-if="impact.references.length" class="impact-references">
            <div v-for="reference in visibleImpactReferences" :key="reference.start + '-' + reference.keyword" class="impact-reference">
              <div class="impact-reference-owner">{{ reference.nodePath || reference.nodeTitle || '未归属节点' }}</div>
              <pre class="impact-reference-context">{{ reference.context }}</pre>
            </div>
          </div>
        </div>
        <span id="diff-count" class="diff-count">{{ changeCount }} 处变更</span>
        <button class="btn-close" id="btn-close-diff" type="button" aria-label="关闭修改对比" @click="$emit('close')"><AppIcon name="x" /></button>
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
          <div class="batch-items batch-cards">
            <div
              v-for="item in batchItems"
              :key="item.index"
              class="batch-card"
              :class="{ 'is-danger': item.dangerous, 'is-excluded': !batchAccepted[item.index], 'is-active': activeBatchIndex === item.index }"
            >
              <div class="batch-card-header">
                <span class="batch-card-index">#{{ item.index + 1 }}</span>
                <span class="batch-card-operation">{{ item.operation || '命令' }}</span>
                <span v-if="item.matchType" class="batch-card-match">{{ item.matchType }}</span>
                <button
                  class="batch-card-toggle"
                  type="button"
                  :data-tooltip="batchAccepted[item.index] ? '本次应用中排除' : '本次应用中包含'"
                  @click="toggleBatchItem(item.index)"
                >{{ batchAccepted[item.index] ? '已选择' : '已排除' }}</button>
              </div>
              <div v-if="item.location" class="batch-card-location">{{ item.location }}</div>
              <div v-if="item.before" class="batch-card-section">
                <span class="batch-card-label">原文</span>
                <pre class="batch-card-text">{{ item.before }}</pre>
              </div>
              <div v-if="item.after || item.operation === 'delete'" class="batch-card-section">
                <span class="batch-card-label">改后</span>
                <pre class="batch-card-text">{{ item.after || '（空）' }}</pre>
              </div>
              <div v-if="item.reason" class="batch-card-reason">{{ item.reason }}</div>
              <button
                class="batch-card-locate"
                type="button"
                :disabled="!item.range"
                data-tooltip="定位到编辑器"
                @click.stop="locateBatchItem(item)"
              >定位原文</button>
            </div>
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
                <button type="button" class="diff-action reject" v-if="line.type === 'removed'" aria-label="拒绝此行" @click="rejectLine(line.changeIdx)"><AppIcon name="x" /></button>
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
                <button type="button" class="diff-action accept" v-if="line.type === 'added'" aria-label="采纳此行" @click="acceptLine(line.changeIdx)"><AppIcon name="check" /></button>
                <span class="diff-line-text">{{ line.text }}</span>
              </div>
              <div v-if="windowStart + windowSize < modifiedLines.length" class="diff-window-hint" @click="windowStart += windowSize">向下加载</div>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-primary" id="btn-diff-apply" :disabled="integrityBlocked && !criticalOverride" @click="applyResult">应用结果到编辑器</button>
        <button class="btn-secondary" id="btn-diff-cancel" @click="$emit('close')">取消</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { lcsDiff, buildDiffResult, acceptDiffLine, rejectDiffLine } from '../../services/diff-utils.js'
import { useModalQueue } from '../../composables/useModalQueue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  original: { type: String, default: '' },
  modified: { type: String, default: '' },
  editMeta: { type: Object, default: null }
})

const emit = defineEmits(['close', 'apply'])
const modalQueue = useModalQueue()

const diffChanges = ref([])
const diffAccepted = ref({})
const windowStart = ref(0)
const windowSize = ref(400)
const currentIdx = ref(0)
const changeCount = ref(0)

watch(() => props.visible, visible => {
  if (visible) modalQueue.open('diff-modal')
  else modalQueue.close('diff-modal')
}, { immediate: true })

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
  if (integrityBlocked.value && !criticalOverride.value) return
  const result = buildDiffResult(diffChanges.value, diffAccepted.value)
  if (batchItems.value.length > 0) {
    emit('apply', result, Object.keys(batchAccepted.value).filter(index => batchAccepted.value[index]).map(Number), {
      allowCritical: integrityBlocked.value && criticalOverride.value
    })
    return
  }
  emit('apply', result, undefined, { allowCritical: integrityBlocked.value && criticalOverride.value })
}

const batchItems = computed(() => {
  const items = props.editMeta?.batchItems
  return Array.isArray(items) ? items : []
})
const batchAccepted = ref({})
const activeBatchIndex = ref(null)

const diagnostics = computed(() => props.editMeta?.diagnostics || null)
const integrity = computed(() => props.editMeta?.integrity || null)
const showIntegrity = computed(() => Boolean(
  props.editMeta?.integrity &&
  (props.editMeta.integrity.criticalCount > 0 || props.editMeta.integrity.warningCount > 0)
))
const impact = computed(() => props.editMeta?.impact || null)
const integrityBlocked = computed(() => Boolean(integrity.value && integrity.value.criticalCount > 0))
const criticalOverride = ref(false)
const visibleImpactReferences = computed(() => impact.value?.references.slice(0, 10) || [])

function suggestionLabel(suggestion) {
  const labels = {
    extend_fragment: '扩大上下文',
    use_structure_anchor: '使用结构锚点',
    re_read_target: '重新读取范围',
    check_selection: '检查选区',
    check_operation: '检查命令',
    check_version: '检查版本'
  }
  return labels[suggestion] || '检查命令'
}

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
    criticalOverride.value = false
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
  z-index: var(--z-modal-content);
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
  flex-wrap: wrap;
  gap: var(--space-4);
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
  padding: var(--space-3) var(--space-5);
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--text-muted);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}
.diff-content {
  flex: 1;
  overflow-y: auto;
  font-family: var(--font-family-mono);
  font-size: var(--font-size-sm);
  line-height: 1.6;
}
.diff-line {
  display: flex;
  align-items: flex-start;
  padding: var(--space-1) var(--space-4);
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
  padding: 0 var(--space-2);
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
  gap: var(--space-3);
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
  padding: var(--space-1) var(--space-3);
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
  gap: var(--space-4);
  min-width: 0;
  padding: var(--space-3) var(--space-5);
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}
.batch-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--space-4);
  align-items: stretch;
  overflow: visible;
}
.batch-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
  max-width: 520px;
  padding: var(--space-4);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  text-align: left;
}
.batch-card.is-danger {
  border-color: var(--danger);
}
.batch-card.is-excluded {
  opacity: 0.5;
}
.batch-card.is-active {
  border-color: var(--accent);
}
.batch-card-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}
.batch-card-index,
.batch-card-operation,
.batch-card-match {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}
.batch-card-operation {
  font-weight: 600;
  color: var(--text-primary);
}
.batch-card-toggle {
  margin-left: auto;
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xs);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  cursor: pointer;
}
.batch-card-location {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}
.batch-card-section {
  min-width: 0;
}
.batch-card-label {
  display: block;
  margin-bottom: var(--space-1);
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}
.batch-card-text {
  max-height: 160px;
  overflow-y: auto;
  margin: 0;
  padding: var(--space-3);
  border-radius: var(--radius-xs);
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: var(--font-size-xs);
  white-space: pre-wrap;
  word-break: break-word;
}
.batch-card-reason {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}
.batch-card-locate {
  align-self: flex-start;
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xs);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: var(--font-size-xs);
  cursor: pointer;
}
.batch-card-locate:disabled {
  opacity: 0.45;
  cursor: not-allowed;
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
  gap: var(--space-3);
  overflow-x: auto;
}
.batch-item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  flex: 0 0 auto;
  min-width: 0;
  max-width: 180px;
  padding: var(--space-3) var(--space-3);
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
  gap: var(--space-3);
}
.batch-item-locate {
  padding: var(--space-3) var(--space-3);
}
.batch-toolbar:has(.batch-cards) {
  display: block;
  max-height: 38vh;
  overflow-y: auto;
}
.edit-diagnostics {
  flex: 1 1 100%;
  min-width: 0;
  margin-top: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--danger);
  border-radius: var(--radius-xs);
  background: var(--danger-dim);
}
.integrity-panel,
.impact-panel {
  flex: 1 1 100%;
  min-width: 0;
  margin-top: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xs);
  background: var(--bg-secondary);
}
.integrity-panel.is-critical {
  border-color: var(--danger);
  background: var(--danger-dim);
}
.integrity-title,
.impact-title {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--text-primary);
}
.integrity-panel.is-critical .integrity-title {
  color: var(--danger);
}
.integrity-list {
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-2);
}
.integrity-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--text-primary);
}
.integrity-level {
  flex: 0 0 auto;
  padding: 0 var(--space-2);
  border-radius: var(--radius-xs);
  font-weight: 600;
}
.integrity-item.is-critical .integrity-level {
  background: var(--danger);
  color: var(--bg-primary);
}
.integrity-item.is-warning .integrity-level {
  background: var(--bg-primary);
  color: var(--warning);
}
.integrity-override {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-top: var(--space-3);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}
.integrity-override button {
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--danger);
  border-radius: var(--radius-xs);
  background: var(--danger-dim);
  color: var(--danger);
  font-size: var(--font-size-xs);
  font-weight: 600;
  cursor: pointer;
}
.impact-nodes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-2);
}
.impact-node {
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-xs);
  background: var(--bg-input);
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}
.impact-references {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--space-3);
  margin-top: var(--space-3);
}
.impact-reference {
  min-width: 0;
  padding: var(--space-3);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xs);
  background: var(--bg-input);
}
.impact-reference-owner {
  margin-bottom: var(--space-2);
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.impact-reference-context {
  max-height: 96px;
  overflow-y: auto;
  margin: 0;
  color: var(--text-primary);
  font-size: var(--font-size-xs);
  white-space: pre-wrap;
  word-break: break-word;
}
.edit-diagnostics-title {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--danger);
  margin-bottom: var(--space-2);
}
.edit-diagnostics-list {
  display: grid;
  gap: var(--space-2);
}
.edit-diagnostic {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  font-size: var(--font-size-xs);
  color: var(--text-primary);
}
.edit-diagnostic-index,
.edit-diagnostic-reason,
.edit-diagnostic-suggestion {
  flex: 0 0 auto;
}
.edit-diagnostic-index {
  color: var(--danger);
}
.edit-diagnostic-reason {
  color: var(--danger);
  font-weight: 600;
}
.edit-diagnostic-message {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.edit-diagnostic-suggestion {
  color: var(--text-secondary);
}
.diff-window-hint {
  padding: var(--space-3) var(--space-5);
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  cursor: pointer;
  text-align: center;
}
.diff-window-hint:hover {
  color: var(--text-primary);
}
</style>
