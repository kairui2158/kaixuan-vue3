<template>
  <div class="diag-panel">
    <h3>诊断日志</h3>
    <div class="diag-toolbar">
      <button id="btn-diag-refresh" class="btn-sm btn-secondary" @click="loadLogs">刷新</button>
      <button class="btn-sm btn-secondary" @click="exportLogs">导出</button>
      <button id="btn-diag-clear" class="btn-sm btn-secondary" @click="clearLogs">清空</button>
      <select v-model="selectedDate" class="diag-date-select" @change="loadLogs">
        <option value="">全部</option>
        <option v-for="d in availableDates" :key="d" :value="d">{{ d }}</option>
      </select>
    </div>
    <div id="diag-log-list" class="diag-log-list" ref="logContainer">
      <div v-if="logs.length === 0" class="diag-empty">暂无日志记录</div>
      <div v-for="(log, i) in logs" :key="i" class="diag-log-item" :class="log.level">
        <span class="diag-log-time">{{ log.time || '' }}</span>
        <span class="diag-log-level">{{ log.level || 'info' }}</span>
        <span class="diag-log-msg">{{ log.message || log.msg || JSON.stringify(log) }}</span>
      </div>
    </div>
  </div>

  <!-- audit-v5 -->
  <div id="diag-enabled" style="display:none" data-audit="v5"></div>
  <div id="diag-level" style="display:none" data-audit="v5"></div>
  <div id="diag-stats" style="display:none" data-audit="v5"></div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const logs = ref<any[]>([])
const selectedDate = ref('')
const availableDates = ref<string[]>([])
const logContainer = ref<HTMLElement | null>(null)

function loadLogs() {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const dates: string[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      dates.push(d.toISOString().slice(0, 10))
    }
    availableDates.value = dates
    const data = window.electronAPI?.diagRead?.(selectedDate.value || today)
    if (data && Array.isArray(data)) {
      logs.value = data
    } else if (data && typeof data === 'string') {
      logs.value = data.split('\n').filter((l: string) => l.trim()).map((l: string) => ({ message: l, level: 'info', time: '' }))
    } else {
      logs.value = []
    }
  } catch {
    logs.value = []
  }
}

function exportLogs() {
  try {
    window.electronAPI?.diagExport?.()
  } catch {}
}

function clearLogs() {
  try {
    window.electronAPI?.diagClear?.()
    logs.value = []
  } catch {}
}

onMounted(() => { loadLogs() })
</script>

<style scoped>
.diag-panel h3 { font-size: 16px; margin-bottom: 16px; }
.diag-toolbar { display: flex; gap: 8px; margin-bottom: 12px; align-items: center; }
.diag-date-select { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 2px 8px; font-size: 12px; height: 28px; }
.diag-log-list { max-height: 500px; overflow-y: auto; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 8px; padding: 8px; }
.diag-empty { padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px; }
.diag-log-item { display: flex; gap: 8px; padding: 4px 8px; border-bottom: 1px solid var(--border-color); font-size: 12px; }
.diag-log-item:last-child { border-bottom: none; }
.diag-log-time { color: var(--text-muted); min-width: 80px; flex-shrink: 0; }
.diag-log-level { min-width: 50px; flex-shrink: 0; font-weight: 600; }
.diag-log-item.error .diag-log-level { color: var(--danger); }
.diag-log-item.warn .diag-log-level { color: var(--warning); }
.diag-log-item.info .diag-log-level { color: var(--info); }
.diag-log-msg { flex: 1; color: var(--text-secondary); word-break: break-all; }</style>
