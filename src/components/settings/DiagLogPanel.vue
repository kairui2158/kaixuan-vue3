<template>
  <div id="diag-panel" class="diag-panel" :class="{ 'diag-panel-visible': visible !== false, 'diag-panel-inline': isInline }">
    <div class="diag-header">
      <span class="diag-title">诊断日志</span>
      <span v-if="stats.errorCount > 0" class="diag-error-count">{{ stats.errorCount }} 错误</span>
      <button class="btn-close" @click="$emit('close')">&times;</button>
    </div>
    <div class="diag-toolbar">
      <label class="diag-toggle-label"><input id="diag-enabled" type="checkbox" checked> 启用诊断</label>
      <select id="diag-level" v-model="levelFilter" class="diag-select">
        <option value="">全部级别</option>
        <option value="error">Error</option>
        <option value="warn">Warn</option>
        <option value="info">Info</option>
        <option value="debug">Debug</option>
      </select>
      <select id="diag-category" v-model="catFilter" class="diag-select">
        <option value="">全部分类</option>
        <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
      </select>
      <input id="diag-search-input" v-model="searchQuery" class="diag-search" placeholder="搜索..." type="text">
     <button id="btn-diag-refresh" class="btn-sm" @click="refreshLogs">刷新</button>
     <button id="btn-diag-export" class="btn-sm" @click="exportLogs">导出</button>
      <span v-if="exportStatus" class="diag-export-status">{{ exportStatus }}</span>
     <button id="btn-diag-clear" class="btn-sm" @click="clearLogs">清空</button>
    </div>
    <div class="diag-toolbar-meta">
      <span id="diag-stats" class="diag-stats-text">错误 {{ stats.errorCount }} / 警告 {{ stats.warnCount }}</span>
    </div>
    <div id="diag-log-list" class="diag-log-list" ref="logContainer">
      <div v-if="filteredLogs.length === 0" class="diag-empty">暂无日志记录</div>
      <div v-for="(log, i) in filteredLogs" :key="log.tsMs + '-' + i" class="diag-log-item" :class="log.level">
        <span class="diag-log-time">{{ log.ts || '' }}</span>
        <span class="diag-log-level">{{ (log.level || 'info').toUpperCase() }}</span>
        <span class="diag-log-cat">[{{ log.cat || 'general' }}]</span>
        <span class="diag-log-msg">{{ log.msg || '' }}</span>
        <span v-if="log.traceId" class="diag-log-trace">#{{ log.traceId.slice(-6) }}</span>
      </div>
    </div>
    <div class="diag-footer">
      <span>{{ filteredLogs.length }} / {{ liveLogs.length }} 条</span>
      <label class="diag-autoscroll">
        <input type="checkbox" v-model="autoScroll"> 自动滚动
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { subscribe } from '../../services/diag.js'

const props = defineProps<{ visible?: boolean }>()
const isInline = computed(() => props.visible === undefined)
defineEmits<{ close: [] }>()

const liveLogs = ref<any[]>([])
const levelFilter = ref('')
const catFilter = ref('')
const searchQuery = ref('')
const autoScroll = ref(true)
const exportStatus = ref('')
const logContainer = ref<HTMLElement | null>(null)
const stats = ref({ errorCount: 0, warnCount: 0 })

let unsub: (() => void) | null = null
let throttleTimer: number | null = null
let pendingEntries: any[] = []

const categories = computed(() => {
  const set = new Set<string>()
  liveLogs.value.forEach(l => { if (l.cat) set.add(l.cat) })
  return Array.from(set).sort()
})

const filteredLogs = computed(() => {
  return liveLogs.value.filter(l => {
    if (levelFilter.value && l.level !== levelFilter.value) return false
    if (catFilter.value && l.cat !== catFilter.value) return false
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase()
      const text = (l.msg + ' ' + (l.detail || '') + ' ' + (l.cat || '')).toLowerCase()
      if (!text.includes(q)) return false
    }
    return true
  })
})

watch(filteredLogs, () => {
  if (autoScroll.value) {
    nextTick(() => {
      if (logContainer.value) {
        logContainer.value.scrollTop = logContainer.value.scrollHeight
      }
    })
  }
})

function flushPending() {
  if (pendingEntries.length === 0) return
  liveLogs.value.push(...pendingEntries)
  pendingEntries = []
  // Cap at 500 entries
  if (liveLogs.value.length > 500) {
    liveLogs.value = liveLogs.value.slice(-500)
  }
  // Update stats
  let errs = 0, warns = 0
  liveLogs.value.forEach(l => {
    if (l.level === 'error') errs++
    if (l.level === 'warn') warns++
  })
  stats.value = { errorCount: errs, warnCount: warns }
}

async function exportLogs() {
  try {
    const result = await window.electronAPI?.diagExport?.({})
    if (result && result.success) {
      exportStatus.value = '已导出 ' + result.count + ' 条日志到: ' + result.path
    } else if (result && result.reason === 'canceled') {
      exportStatus.value = '已取消导出'
    } else {
      exportStatus.value = '导出失败: ' + (result ? result.reason : '未知错误')
    }
    setTimeout(() => { exportStatus.value = '' }, 3000)
  } catch(e) {
    exportStatus.value = '导出异常: ' + (e.message || e)
    setTimeout(() => { exportStatus.value = '' }, 3000)
  }
}

function clearLogs() {
  liveLogs.value = []
  stats.value = { errorCount: 0, warnCount: 0 }
  try { window.electronAPI?.diagClear?.() } catch {}
}

function refreshLogs() {
  pendingEntries = []
  liveLogs.value = []
  stats.value = { errorCount: 0, warnCount: 0 }
  try { window.electronAPI?.diagRefresh?.() } catch {}
}

onMounted(() => {
  unsub = subscribe((entry: any) => {
    pendingEntries.push(entry)
    if (!throttleTimer) {
      throttleTimer = window.setTimeout(() => {
        flushPending()
        throttleTimer = null
      }, 200)
    }
  })
})

onUnmounted(() => {
  if (unsub) unsub()
  if (throttleTimer) clearTimeout(throttleTimer)
})
</script>

<style scoped>
.diag-panel {
  position: fixed;
  bottom: 64px;
  right: 16px;
  width: 600px;
  max-width: calc(100vw - 32px);
  height: 400px;
  max-height: 60vh;
  background: var(--bg-secondary, #1e1e22);
  border: 1px solid var(--border-color, #3a3a3e);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  z-index: 9997;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}
.diag-panel-visible {
  opacity: 1;
  pointer-events: auto;
}
.diag-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-color, #3a3a3e);
}
.diag-title { font-size: 14px; font-weight: 600; color: var(--text-primary, #e0e0e0); }
.diag-error-count { font-size: 11px; color: #dc3545; font-weight: 600; background: rgba(220,53,69,0.15); padding: 2px 8px; border-radius: 10px; }
.btn-close { margin-left: auto; background: none; border: none; color: var(--text-muted, #888); font-size: 20px; cursor: pointer; padding: 0 4px; line-height: 1; }
.btn-close:hover { color: var(--text-primary, #e0e0e0); }
.diag-toolbar { display: flex; gap: 6px; padding: 8px 14px; border-bottom: 1px solid var(--border-color, #3a3a3e); align-items: center; }
.diag-select { background: var(--bg-input, #2a2a2e); color: var(--text-primary, #e0e0e0); border: 1px solid var(--border-color, #3a3a3e); border-radius: 4px; padding: 3px 6px; font-size: 11px; height: 26px; }
.diag-search { flex: 1; background: var(--bg-input, #2a2a2e); color: var(--text-primary, #e0e0e0); border: 1px solid var(--border-color, #3a3a3e); border-radius: 4px; padding: 3px 8px; font-size: 11px; height: 26px; }
.diag-log-list { flex: 1; overflow-y: auto; padding: 6px; }
.diag-empty { padding: 24px; text-align: center; color: var(--text-muted, #888); font-size: 12px; }
.diag-log-item { display: flex; gap: 6px; padding: 3px 6px; border-bottom: 1px solid rgba(255,255,255,0.03); font-size: 11px; line-height: 1.4; align-items: baseline; }
.diag-log-item:last-child { border-bottom: none; }
.diag-log-time { color: var(--text-muted, #888); flex-shrink: 0; font-family: monospace; }
.diag-log-level { min-width: 40px; flex-shrink: 0; font-weight: 600; font-size: 10px; }
.diag-log-item.error .diag-log-level { color: #dc3545; }
.diag-log-item.warn .diag-log-level { color: #ffc107; }
.diag-log-item.info .diag-log-level { color: #17a2b8; }
.diag-log-item.debug .diag-log-level { color: #6c757d; }
.diag-log-cat { color: var(--text-muted, #888); flex-shrink: 0; font-size: 10px; }
.diag-log-msg { flex: 1; color: var(--text-secondary, #ccc); word-break: break-all; }
.diag-log-trace { color: var(--text-muted, #666); font-size: 10px; flex-shrink: 0; font-family: monospace; }
.diag-footer { display: flex; justify-content: space-between; align-items: center; padding: 6px 14px; border-top: 1px solid var(--border-color, #3a3a3e); font-size: 10px; color: var(--text-muted, #888); }
.diag-autoscroll { display: flex; align-items: center; gap: 4px; cursor: pointer; }
.diag-autoscroll input { cursor: pointer; }
.diag-panel-inline {
  position: relative !important;
  width: 100% !important;
  max-width: none !important;
  height: 400px !important;
  max-height: 50vh !important;
  opacity: 1 !important;
  pointer-events: auto !important;
  box-shadow: none !important;
  bottom: auto !important;
  right: auto !important;
}

.diag-export-status { font-size: 10px; color: var(--text-muted, #888); flex-shrink: 0; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
