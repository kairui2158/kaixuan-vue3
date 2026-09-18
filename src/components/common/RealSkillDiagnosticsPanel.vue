<template>
  <section class="real-skill-diagnostics" :class="`is-${status}`" aria-label="文件夹技能执行诊断">
    <div class="real-skill-diagnostics-head">
      <span class="real-skill-diagnostics-status">{{ statusText }}</span>
      <span v-if="folderPackageCache !== undefined">磁盘加载：{{ folderPackageCache ? '使用缓存' : '实时读取' }}</span>
      <span v-if="budget">API 预算：{{ budget.used }}/{{ budget.limit }}</span>
      <button type="button" class="btn-sm btn-secondary" @click="copyDiagnostics">复制诊断</button>
    </div>
    <div v-if="diagnostics.length > 0" class="real-skill-diagnostics-list">
      <div
        v-for="(item, index) in diagnostics"
        :key="`${item.code}-${index}`"
        class="real-skill-diagnostic"
        :class="`is-${item.type}`"
      >
        <span>{{ item.code }}</span>
        <p>{{ item.message }}</p>
      </div>
    </div>
    <details class="real-skill-request">
      <summary>查看请求概览</summary>
      <div v-for="(message, index) in requestMessages" :key="`request-${index}`" class="real-skill-request-message">
        <span>{{ message.role }}</span>
        <pre>{{ message.content }}</pre>
      </div>
      <p v-if="requestMessages.length === 0">本次没有可展示的请求内容。</p>
    </details>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface DiagnosticItem {
  type: 'info' | 'warning' | 'error'
  code: string
  message: string
}

const props = defineProps<{
  status: 'success' | 'degraded' | 'blocked' | 'failed' | 'load-failed'
  diagnostics?: DiagnosticItem[]
  requestMessages?: Array<{ role: string; content: string }>
  budget?: { used: number; limit: number }
  folderPackageCache?: boolean
}>()

const diagnostics = computed(() => props.diagnostics || [])
const requestMessages = computed(() => props.requestMessages || [])
const statusText = computed(() => {
  if (props.status === 'success') return '成功'
  if (props.status === 'degraded') return '降级完成'
  if (props.status === 'blocked') return '预算阻断'
  if (props.status === 'load-failed') return '加载失败'
  return '执行失败'
})

async function copyDiagnostics() {
  const text = [
    `状态：${statusText.value}`,
    ...diagnostics.value.map(item => `${item.type} ${item.code} ${item.message}`)
  ].join('\n')
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Clipboard permission can be denied; the panel remains readable.
  }
}
</script>

<style scoped>
.real-skill-diagnostics { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-elevated); min-width: 0; }
.real-skill-diagnostics-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); font-size: var(--font-size-sm); color: var(--text-secondary); }
.real-skill-diagnostics-status { font-weight: 600; color: var(--text-primary); }
.real-skill-diagnostics.is-degraded .real-skill-diagnostics-status { color: var(--warning); }
.real-skill-diagnostics.is-blocked .real-skill-diagnostics-status,
.real-skill-diagnostics.is-failed .real-skill-diagnostics-status,
.real-skill-diagnostics.is-load-failed .real-skill-diagnostics-status { color: var(--danger); }
.real-skill-diagnostics-list { display: flex; flex-direction: column; gap: var(--space-2); max-height: 160px; overflow-y: auto; }
.real-skill-diagnostic { display: grid; grid-template-columns: minmax(90px, auto) minmax(0, 1fr); gap: var(--space-3); padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); background: var(--bg-tertiary); font-size: var(--font-size-sm); color: var(--text-secondary); }
.real-skill-diagnostic.is-warning { color: var(--warning); }
.real-skill-diagnostic.is-error { color: var(--danger); }
.real-skill-diagnostic p { margin: 0; min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
.real-skill-request summary { cursor: pointer; color: var(--text-secondary); font-size: var(--font-size-sm); }
.real-skill-request-message { margin-top: var(--space-2); }
.real-skill-request-message span { display: block; margin-bottom: var(--space-1); color: var(--text-secondary); font-size: var(--font-size-sm); }
.real-skill-request-message pre { margin: 0; padding: var(--space-3); border-radius: var(--radius-sm); background: var(--bg-tertiary); color: var(--text-primary); font-size: var(--font-size-sm); line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 160px; overflow-y: auto; }
</style>
