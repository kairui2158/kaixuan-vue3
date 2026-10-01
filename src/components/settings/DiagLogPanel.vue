<template>
  <div id="diag-panel" class="diag-panel" :class="{ 'diag-panel-visible': visible !== false, 'diag-panel-inline': isInline }">
    <div class="diag-header">
      <span class="diag-title">诊断日志</span>
      <span v-if="appVersion" class="diag-version">应用版本 {{ appVersion }}</span>
      <span v-if="stats.errorCount > 0" class="diag-error-count">{{ stats.errorCount }} 错误</span>
        <button class="btn-close" aria-label="关闭诊断日志" @click="$emit('close')"><AppIcon name="x" /></button>
    </div>
    <div class="diag-toolbar">
      <label class="diag-toggle-label"><input id="diag-enabled" type="checkbox" checked> 启用诊断</label>
      <select id="diag-level" v-model="levelFilter" class="select-standard">
        <option value="">全部级别</option>
        <option value="error">错误</option>
        <option value="warn">警告</option>
        <option value="info">信息</option>
        <option value="debug">调试</option>
      </select>
      <select id="diag-category" v-model="catFilter" class="select-standard">
        <option value="">全部分类</option>
        <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
      </select>
      <select id="diag-purpose" v-model="purposeFilter" class="select-standard">
        <option value="">全部用途</option>
        <option v-for="p in purposes" :key="p" :value="p">{{ p }}</option>
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
        <span class="diag-log-level">{{ levelLabel(log.level) }}</span>
        <span class="diag-log-cat">[{{ catLabel(log.cat) }}]</span>
        <span v-if="log.providerId" class="diag-log-provider">{{ log.providerId }}</span>
        <span v-if="log.purpose" class="diag-log-purpose">{{ log.purpose }}</span>
        <span v-if="log.model" class="diag-log-model">{{ log.model }}</span>
        <span v-if="log.agentId" class="diag-log-agent">{{ log.agentId }}</span>
        <span v-if="log.skillId" class="diag-log-skill">{{ log.skillId }}</span>
        <span v-if="log.toolCapability" class="diag-log-capability">{{ capabilityLabel(log.toolCapability) }}</span>
        <span v-if="log.batchId" class="diag-log-batch">#{{ log.batchId }}</span>
        <span v-if="log.downgradeReason" class="diag-log-downgrade">降级：{{ log.downgradeReason }}</span>
        <span v-if="log.durationMs" class="diag-log-duration">{{ log.durationMs }}ms</span>
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
import AppIcon from '../common/AppIcon.vue'

const props = defineProps<{ visible?: boolean }>()
const isInline = computed(() => props.visible === undefined)
defineEmits<{ close: [] }>()

const liveLogs = ref<any[]>([])
const levelFilter = ref('')
const catFilter = ref('')
const searchQuery = ref('')
const purposeFilter = ref('')
const autoScroll = ref(true)
const exportStatus = ref('')
const logContainer = ref<HTMLElement | null>(null)
const stats = ref({ errorCount: 0, warnCount: 0 })
const appVersion = ref('')

const levelLabels: Record<string, string> = { error: '错误', warn: '警告', info: '信息', debug: '调试' }
function levelLabel(level?: string): string {
  const key = (level || 'info').toLowerCase()
  return levelLabels[key] || key
}
const catLabels: Record<string, string> = { general: '通用' }
function catLabel(cat?: string): string {
  const key = cat || 'general'
  return catLabels[key] || key
}

let unsub: (() => void) | null = null
let throttleTimer: number | null = null
let pendingEntries: any[] = []

const categories = computed(() => {
  const set = new Set<string>()
  liveLogs.value.forEach(l => { if (l.cat) set.add(l.cat) })
  return Array.from(set).sort()
})

const purposes = computed(() => {
  const set = new Set<string>()
  liveLogs.value.forEach(l => { if (l.purpose) set.add(l.purpose) })
  return Array.from(set).sort()
})

const filteredLogs = computed(() => {
  return liveLogs.value.filter(l => {
    if (levelFilter.value && l.level !== levelFilter.value) return false
    if (catFilter.value && l.cat !== catFilter.value) return false
    if (purposeFilter.value && l.purpose !== purposeFilter.value) return false
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase()
    const text = (l.msg + ' ' + (l.detail || '') + ' ' + (l.cat || '') + ' ' + (l.batchId || '') + ' ' + (l.detail?.batchId || '')).toLowerCase()
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

function capabilityLabel(value?: string) {
  if (value === 'native_tools') return '原生工具'
  if (value === 'json_protocol') return 'JSON 协议'
  return ''
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
    const message = e instanceof Error ? e.message : String(e)
    exportStatus.value = '导出异常: ' + message
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
  try {
    window.electronAPI?.diagRefresh?.().then((entries: any[]) => {
      if (entries && entries.length > 0) {
        liveLogs.value = entries.slice(-500)
        let errs = 0, warns = 0
        entries.forEach(l => {
          if (l.level === 'error') errs++
          if (l.level === 'warn') warns++
        })
        stats.value = { errorCount: errs, warnCount: warns }
      }
    })
  } catch {}
}

onMounted(() => {
  refreshLogs()
  try {
    window.electronAPI?.getAppVersion?.()?.then((version: unknown) => {
      if (typeof version === 'string' && version) appVersion.value = version
    })
  } catch {}
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
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  z-index: var(--z-diagnostics);
  box-shadow: var(--shadow-lg);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--duration-fast) var(--ease-standard);
}
.diag-panel-visible {
  opacity: 1;
  pointer-events: auto;
}
.diag-header {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-5) var(--space-5);
  border-bottom: 1px solid var(--border-color);
}
.diag-title { font-size: var(--font-size-md); font-weight: 600; color: var(--text-primary); }
.diag-version { font-size: var(--font-size-xs); color: var(--text-muted); }
.diag-error-count { font-size: var(--font-size-xs); color: var(--danger); font-weight: 600; background: var(--danger-dim); padding: var(--space-1) var(--space-4); border-radius: var(--radius-lg); }
.btn-close { margin-left: auto; background: none; border: none; color: var(--text-muted); font-size: var(--font-size-xl); cursor: pointer; padding: 0 var(--space-2); height: var(--space-8); line-height: var(--space-8); }
.btn-close:hover { color: var(--text-primary); }
.diag-toolbar { display: flex; gap: var(--space-3); padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--border-color); align-items: center; }
.select-standard { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-xs); padding: var(--space-3) var(--space-3); font-size: var(--font-size-xs); height: var(--density-form-height); }
.diag-search { flex: 1; background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-xs); padding: var(--space-3) var(--space-4); font-size: var(--font-size-xs); height: var(--density-form-height); }
.diag-log-list { flex: 1; overflow-y: auto; padding: var(--space-3); user-select: text; cursor: text; }
.diag-empty { padding: var(--space-8); text-align: center; color: var(--text-muted); font-size: var(--font-size-sm); }
.diag-log-item { display: flex; gap: var(--space-3); padding: var(--space-3) var(--space-3); border-bottom: 1px solid var(--diagnostic-divider); font-size: var(--font-size-xs); line-height: 1.4; align-items: baseline; }
.diag-log-item:last-child { border-bottom: none; }
.diag-log-time { color: var(--text-muted); flex-shrink: 0; font-family: var(--font-family-mono); }
.diag-log-level { min-width: 40px; flex-shrink: 0; font-weight: 600; font-size: var(--font-size-xxs); }
.diag-log-item.error .diag-log-level { color: var(--danger); }
.diag-log-item.warn .diag-log-level { color: var(--warning); }
.diag-log-item.info .diag-log-level { color: var(--info); }
.diag-log-item.debug .diag-log-level { color: var(--text-muted); }
.diag-log-cat { color: var(--text-muted); flex-shrink: 0; font-size: var(--font-size-xxs); }
.diag-log-msg { flex: 1; color: var(--text-secondary); word-break: break-all; }
.diag-log-trace { color: var(--diagnostic-trace); font-size: var(--font-size-xxs); flex-shrink: 0; font-family: var(--font-family-mono); }
.diag-log-provider { color: var(--diagnostic-provider); font-size: var(--font-size-xxs); margin-right: 4px; flex-shrink: 0; }
.diag-log-purpose { color: var(--text-secondary); font-size: var(--font-size-xxs); margin-right: 4px; flex-shrink: 0; }
.diag-log-model { color: var(--diagnostic-model); font-size: var(--font-size-xxs); margin-right: 4px; flex-shrink: 0; }
.diag-log-agent { color: var(--info); font-size: var(--font-size-xxs); margin-right: 4px; flex-shrink: 0; }
.diag-log-skill { color: var(--diagnostic-trace); font-size: var(--font-size-xxs); margin-right: 4px; flex-shrink: 0; font-family: var(--font-family-mono); }
.diag-log-capability { color: var(--info); font-size: var(--font-size-xxs); margin-right: 4px; flex-shrink: 0; }
.diag-log-batch { color: var(--text-muted); font-size: var(--font-size-xxs); margin-right: 4px; flex-shrink: 0; font-family: var(--font-family-mono); }
.diag-log-downgrade { color: var(--warning); font-size: var(--font-size-xxs); margin-right: 4px; flex-shrink: 0; }
.diag-log-duration { color: var(--diagnostic-duration); font-size: var(--font-size-xxs); margin-right: 4px; flex-shrink: 0; }
.diag-footer { display: flex; justify-content: space-between; align-items: center; padding: var(--space-3) var(--space-5); border-top: 1px solid var(--border-color); font-size: var(--font-size-xxs); color: var(--text-muted); }
.diag-autoscroll { display: flex; align-items: center; gap: var(--space-2); cursor: pointer; }
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

.settings-panel .diag-panel {
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
.diag-export-status { font-size: var(--font-size-xxs); color: var(--text-muted); flex-shrink: 0; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
