<template>
  <div v-if="visible" id="run-trace-overlay" data-modal-id="run-trace-panel" class="modal-overlay" :style="{ zIndex: modalQueue.getZIndex('run-trace-panel') }" @click.self="$emit('close')">
    <section id="run-trace-panel" class="rt-panel" role="dialog" aria-modal="true" aria-labelledby="run-trace-title">
      <header class="rt-header">
        <div>
          <strong id="run-trace-title">运行记录</strong>
          <span>仅保留最近 20 次运行，对话类运行按会话聚合，一次导出覆盖完整调试过程</span>
        </div>
        <div class="rt-header-actions">
          <button
            type="button"
            class="btn-sm"
            :class="compareMode ? 'btn-primary' : 'btn-secondary'"
            @click="toggleCompareMode"
          >
            {{ compareMode ? '退出对比' : '对比运行' }}
          </button>
          <button type="button" class="btn-sm btn-secondary" @click="openTraceFolder">打开记录文件夹</button>
          <button type="button" class="modal-close" aria-label="关闭运行记录" @click="$emit('close')"><AppIcon name="x" /></button>
        </div>
      </header>

      <div class="rt-layout">
        <aside class="rt-list" aria-label="运行列表">
          <nav class="rt-filter" aria-label="来源筛选">
            <button
              v-for="item in sourceFilters"
              :key="item.value"
              type="button"
              :class="{ active: activeSource === item.value }"
              @click="activeSource = item.value"
            >
              {{ item.label }}
            </button>
          </nav>
          <div
            v-for="run in filteredRuns"
            :key="run.id"
            :data-run-id="run.id"
            class="rt-run"
            :class="{
              active: !compareMode && run.id === selectedRunId,
              'compare-a': run.id === compareRunAId,
              'compare-b': run.id === compareRunBId
            }"
            @click="selectedRunId = run.id"
          >
            <div class="rt-run-main">
              <strong>{{ run.sourceName }}</strong>
              <span>{{ formatTime(run.startedAt) }}</span>
            </div>
            <div class="rt-run-sub">{{ run.stepName || run.mode }}</div>
            <div class="rt-run-meta">
              <span :class="'is-' + run.status">{{ statusText(run.status) }}</span>
              <span v-if="run.sessionKind === 'chat'">会话 · {{ run.turns?.length || 1 }} 轮</span>
              <span>{{ run.mode }}</span>
              <span>{{ run.durationMs ? run.durationMs + 'ms' : '进行中' }}</span>
            </div>
            <div v-if="compareMode" class="rt-run-compare" @click.stop>
              <button type="button" :class="{ active: run.id === compareRunAId }" @click="selectCompareRun(run.id, 'A')">选 A</button>
              <button type="button" :class="{ active: run.id === compareRunBId }" @click="selectCompareRun(run.id, 'B')">选 B</button>
            </div>
          </div>
          <div v-if="filteredRuns.length === 0" class="rt-empty">当前筛选还没有运行记录。</div>
        </aside>

        <section v-if="compareMode" class="rt-detail rt-detail-compare">
          <div class="rt-summary rt-compare-summary">
            <span>A：{{ compareRunSummary(compareRunA) }}</span>
            <span>B：{{ compareRunSummary(compareRunB) }}</span>
            <span v-if="compareRunA && compareRunB && compareRunA.source !== compareRunB.source">来源不同，对齐结果仅供参考</span>
          </div>
          <RunTraceDiffPanel v-if="compareDiff" :diff-result="compareDiff" />
          <div v-else class="rt-compare-empty">
            请在左侧选择 A、B 两次运行。{{ compareSelectionText }}
          </div>
          <div class="rt-compare-actions">
            <button
              type="button"
              class="btn-primary"
              :disabled="!compareDiff || diffExportState === 'exporting'"
              @click="exportDiff"
            >
              {{ diffExportState === 'exporting' ? '导出中...' : '导出对比 JSON（全文）' }}
            </button>
            <button type="button" class="btn-secondary" :disabled="!compareDiff" @click="copyDiff">复制对比报告</button>
            <span v-if="diffExportState === 'done'" class="rt-compare-result">{{ diffExportResult }}</span>
            <span v-else-if="diffExportState === 'failed'" class="rt-compare-error">{{ diffExportResult }}</span>
          </div>
        </section>

        <section v-else-if="selectedRun" class="rt-detail">
          <div class="rt-summary">
            <span>来源：{{ selectedRun.sourceName }}</span>
            <span>层级：{{ selectedRun.stepName || '-' }}</span>
            <span>项目：{{ selectedRun.projectName || selectedRun.projectId || '未命名' }}</span>
            <span>供应商：{{ selectedRun.providerName || selectedRun.providerId || '未记录' }}</span>
            <span>模型：{{ selectedRun.model || '未记录' }}</span>
            <span>技能：{{ selectedRun.skillNames.join('、') || '未使用' }}</span>
            <span>技能模式：{{ selectedRun.skillMode || '直接生成' }}</span>
          </div>

          <nav class="rt-tabs" role="tablist" aria-label="运行记录视图">
            <button type="button" :class="{ active: activeTab === 'timeline' }" @click="activeTab = 'timeline'">时间线</button>
            <button type="button" :class="{ active: activeTab === 'api' }" @click="activeTab = 'api'">API 调用</button>
            <button type="button" :class="{ active: activeTab === 'skill' }" @click="activeTab = 'skill'">技能与工具</button>
            <button type="button" :class="{ active: activeTab === 'export' }" @click="activeTab = 'export'">导出/复制</button>
          </nav>

          <div class="rt-body">
            <div v-if="activeTab === 'timeline'" class="rt-section">
              <div v-if="selectedRun.payloadIntegrityWarnings?.length" class="rt-error">
                payload 完整性警告：{{ selectedRun.payloadIntegrityWarnings.join('；') }}
              </div>
              <div class="rt-inline-filters">
                <select v-model="timelineLevelFilter" aria-label="按级别筛选">
                  <option value="all">全部级别</option>
                  <option value="info">信息</option>
                  <option value="warn">警告</option>
                  <option value="error">错误</option>
                </select>
                <select v-model="timelineTypeFilter" aria-label="按类型筛选">
                  <option value="all">全部类型</option>
                  <option v-for="type in timelineEventTypes" :key="type" :value="type">{{ type }}</option>
                </select>
              </div>
              <template v-for="group in timelineGroups" :key="group.key">
                <div v-if="group.turn" class="rt-turn-divider">
                  <strong>第 {{ group.turn.seq }} 轮</strong>
                  <span>{{ turnRequestText(group.turn) }}</span>
                  <em>{{ formatTime(group.turn.startedAt) }}</em>
                </div>
                <div v-for="event in group.items" :key="event.id" class="rt-event" :class="'is-' + event.level">
                  <span>{{ formatTime(event.ts) }}</span>
                  <strong>{{ event.label }}</strong>
                  <pre v-if="event.detail">{{ event.detail }}</pre>
                </div>
              </template>
              <div v-if="selectedRun.error" class="rt-error">{{ selectedRun.error }}</div>
            </div>

            <div v-else-if="activeTab === 'api'" class="rt-section">
              <template v-for="group in apiGroups" :key="group.key">
                <div v-if="group.turn" class="rt-turn-divider">
                  <strong>第 {{ group.turn.seq }} 轮</strong>
                  <span>{{ turnRequestText(group.turn) }}</span>
                  <em>{{ formatTime(group.turn.startedAt) }}</em>
                </div>
                <div v-for="call in group.items" :key="call.id" class="rt-api">
                  <div class="rt-api-head">
                    <strong>第 {{ call.seq }} 次调用</strong>
                    <span :class="'is-' + call.status">{{ statusText(call.status) }}</span>
                    <span>{{ call.skillName || call.skillId || '无技能' }}</span>
                    <span>{{ call.model || '未记录模型' }}</span>
                    <span>{{ call.durationMs ? call.durationMs + 'ms' : '未记录耗时' }}</span>
                  </div>
                  <details>
                    <summary>请求消息</summary>
                    <pre v-for="(message, index) in call.requestMessages" :key="index">[{{ message.role }}]
{{ message.content }}</pre>
                  </details>
                  <details>
                    <summary>工具面</summary>
                    <pre>入口声明：{{ toolSurfaceText(call.toolSurface) }}
实际发送：{{ toolSurfaceText(call.actualToolSurface) }}</pre>
                  </details>
                  <details>
                    <summary>上下文预算</summary>
                    <pre>供应商窗口：{{ call.providerContextWindowTokens ?? '未记录' }}
估算输入：{{ call.estimatedInputTokens ?? '未记录' }}
决策：{{ contextBudgetDecisionText(call.contextBudgetDecision) }}
{{ call.contextBudgetReason || '' }}
usage 对账：{{ renderText(JSON.stringify(call.usageReconciliation || {}, null, 2)) }}</pre>
                  </details>
                  <details v-if="call.executionSettlement || call.readLedger">
                    <summary>执行预算 / 覆盖结算</summary>
                    <pre>阶段：{{ executionPhaseText(call.executionSettlement?.phase) }}
读取：{{ call.executionSettlement?.readToolCalls ?? '未记录' }}/{{ call.executionSettlement?.maxReadToolCalls ?? '未记录' }}
写入容量：{{ call.executionSettlement?.writeToolCalls ?? '未记录' }}/{{ call.executionSettlement?.reservedWriteToolCalls ?? '未记录' }}
控制调用：{{ call.executionSettlement?.controlToolCalls ?? '未记录' }}
物理请求安全网：{{ call.executionSettlement?.physicalRequests ?? '未记录' }}/{{ call.executionSettlement?.maxPhysicalRequests ?? '未记录' }}
已成功写入：{{ call.executionSettlement?.successfulWriteCount ?? '未记录' }}
已确认覆盖：{{ call.executionSettlement?.trustedCoverageCount ?? '未记录' }}
计划完成：{{ call.executionSettlement?.planComplete ? '是' : call.executionSettlement ? '否' : '未记录' }}
耗尽分类：{{ call.executionSettlement?.exhaustedClasses?.length ? call.executionSettlement.exhaustedClasses.join('、') : '无' }}
读取缓存：唯一 {{ call.readLedger?.uniqueReadCount ?? '未记录' }} / 重复 {{ call.readLedger?.duplicateReadCount ?? '未记录' }} / 压缩后重读 {{ call.readLedger?.rereadAfterCompactionCount ?? '未记录' }} / 已压缩 {{ call.readLedger?.compactedReadCount ?? '未记录' }}
结构标识：{{ call.readLedger?.structureIdentity || '未记录' }}</pre>
                  </details>
                  <details>
                    <summary>流式输出</summary>
                    <pre>{{ call.streamText || '本次没有流式内容。' }}</pre>
                  </details>
                  <details>
                    <summary>完整返回</summary>
                    <pre>{{ renderText(call.responseText || '本次没有返回内容。') }}</pre>
                  </details>
                  <details v-if="call.physicalCalls?.length">
                    <summary>物理请求（{{ call.physicalCalls.length }} 次）</summary>
                    <div v-for="physical in call.physicalCalls" :key="physical.id" class="rt-subcall">
                      <strong>#{{ physical.seq }} {{ physical.phase }}</strong>
                      <span :class="'is-' + physical.status">{{ statusText(physical.status) }}</span>
                      <span>{{ physical.durationMs ? physical.durationMs + 'ms' : '未记录耗时' }}</span>
                      <span>工具调用 {{ physical.toolCallCount ?? 0 }} 次{{ physical.toolCallNames?.length ? '：' + physical.toolCallNames.join('、') : '' }}</span>
                      <pre v-for="(message, index) in physical.requestMessages" :key="index">[{{ message.role }}]
{{ renderText(message.content) }}</pre>
                      <pre>{{ renderText(physical.responseText || '本次没有返回内容。') }}</pre>
                    </div>
                  </details>
                  <details v-if="call.toolCalls?.length">
                    <summary>工具调用（{{ call.toolCalls.length }} 次）</summary>
                    <div v-for="tool in call.toolCalls" :key="tool.id" class="rt-subcall">
                      <strong>{{ tool.name }}</strong>
                      <span :class="'is-' + (tool.status === 'success' ? 'success' : 'failed')">{{ tool.status === 'success' ? '成功' : '失败' }}</span>
                      <pre>输入：{{ renderText(JSON.stringify(tool.input, null, 2)) }}</pre>
                      <pre>结果：{{ renderText(JSON.stringify(tool.result, null, 2)) }}</pre>
                    </div>
                  </details>
                  <details v-if="promptSnapshotsFor(call).length">
                    <summary>提示词快照（{{ promptSnapshotsFor(call).length }} 份）</summary>
                    <div v-for="snapshot in promptSnapshotsFor(call)" :key="snapshot.id" class="rt-subcall">
                      <strong>{{ snapshot.skillName || snapshot.promptName || snapshot.id }}</strong>
                      <span>{{ snapshot.mode || '未记录模式' }} / {{ formatTime(snapshot.builtAt) }}</span>
                      <pre>变量：{{ renderText(JSON.stringify(snapshot.variables || [], null, 2)) }}</pre>
                      <pre>上下文：{{ renderText(JSON.stringify(snapshot.contextBlocks || [], null, 2)) }}</pre>
                    </div>
                  </details>
                  <details v-if="processingReportsFor(call).length">
                    <summary>处理报告（{{ processingReportsFor(call).length }} 份）</summary>
                    <div v-for="report in processingReportsFor(call)" :key="report.id" class="rt-subcall">
                      <strong>{{ report.processor }} / {{ report.stage }}</strong>
                      <span :class="'is-' + report.status">{{ statusText(report.status) }}</span>
                      <span>{{ report.durationMs ?? 0 }}ms</span>
                      <pre>规则命中：{{ renderText(JSON.stringify(report.ruleHits || [], null, 2)) }}</pre>
                      <pre>问题：{{ renderText(JSON.stringify(report.issues || [], null, 2)) }}</pre>
                    </div>
                  </details>
                  <div v-if="call.error" class="rt-error">{{ call.error }}</div>
                </div>
              </template>
              <div v-if="selectedRun.apiCalls.length === 0" class="rt-empty">本次运行没有 API 调用。</div>
            </div>

            <div v-else-if="activeTab === 'skill'" class="rt-section">
              <div v-if="toolSummary" class="rt-tool-summary">
                <strong>工具统计</strong>
                <span>{{ toolSummary.total }} 次 / 失败 {{ toolSummary.failed }} 次 / 降级 {{ toolSummary.downgrades }} 次</span>
                <span>平均 {{ toolSummary.avgMs }}ms / 中位 {{ toolSummary.medianMs }}ms</span>
              </div>
              <div v-if="selectedRun.folderDiagnostics?.length" class="rt-folders">
                <slot
                  name="folder-diagnostics"
                  :diagnostics="folderDiagnostics"
                >
                  <pre v-for="(item, index) in folderDiagnostics" :key="index">{{ JSON.stringify(item, null, 2) }}</pre>
                </slot>
              </div>
              <slot name="skill-extra" :run="selectedRun">
                <div class="rt-empty">本次运行没有技能诊断摘要。</div>
              </slot>
            </div>

            <div v-else class="rt-section">
              <div class="rt-export">
                <button type="button" class="btn-primary" @click="exportRun('standard')">导出标准 JSON</button>
                <button type="button" class="btn-secondary" @click="exportRun('light')">导出轻量</button>
                <button type="button" class="btn-secondary" @click="exportRun('deep')">导出深度</button>
                <button type="button" class="btn-secondary" @click="copyRun">复制完整文本</button>
                <button
                  v-if="selectedRun.sessionKind === 'chat' && selectedRun.status === 'running'"
                  type="button"
                  class="btn-secondary"
                  @click="sealSelectedRun"
                >
                  完成本段记录
                </button>
              </div>
              <p class="rt-export-tip">标准导出包含结构与全部 payload 全文；轻量导出只保留结构和摘要，方便快速交流；深度导出等于标准导出，若采集到 HTTP 原文会脱敏后一并保存。所有导出前都会隐藏 API Key，导出结果是一个包含 payloads 文件夹和 export.json 的目录。</p>
            </div>
          </div>
        </section>

        <section v-else class="rt-detail rt-detail-empty">
          请选择左侧任意一次运行查看详情。
        </section>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useModalQueue } from '../../composables/useModalQueue'
import RunTraceDiffPanel from './RunTraceDiffPanel.vue'
import {
  buildRunTraceDiff,
  buildRunTraceDiffExport,
  buildRunTraceDiffText,
  RUN_TRACE_DIFF_SCHEMA_VERSION,
  type RunTraceDiffResult
} from '../../services/runTraceDiff'
import {
  useRunTraceStore,
  type RunTraceApiCall,
  type RunTraceEvent,
  type RunTraceSource,
  type RunTraceTurn
} from '../../stores/runTrace'

interface TraceGroup<T> {
  key: string
  turn: RunTraceTurn | null
  items: T[]
}

const props = withDefaults(defineProps<{
  visible: boolean
  defaultSource?: RunTraceSource | 'all'
}>(), {
  defaultSource: 'all'
})

const emit = defineEmits<{ close: [] }>()
const modalQueue = useModalQueue()

const runTraceStore = useRunTraceStore()
const activeSource = ref<RunTraceSource | 'all'>(props.defaultSource)
const selectedRunId = ref<string | null>(null)
const activeTab = ref<'timeline' | 'api' | 'skill' | 'export'>('timeline')
const timelineLevelFilter = ref<'all' | 'info' | 'warn' | 'error'>('all')
const timelineTypeFilter = ref('all')
const compareMode = ref(false)
const compareRunAId = ref<string | null>(null)
const compareRunBId = ref<string | null>(null)
const diffExportState = ref<'idle' | 'exporting' | 'done' | 'failed'>('idle')
const diffExportResult = ref('')

watch(() => props.visible, visible => {
  if (visible) modalQueue.open('run-trace-panel')
  else modalQueue.close('run-trace-panel')
}, { immediate: true })

const sourceFilters = [
  { value: 'all' as const, label: '全部' },
  { value: 'pipeline' as const, label: '生成流水线' },
  { value: 'outline' as const, label: '大纲工作台' },
  { value: 'home' as const, label: '主页编辑器' },
  { value: 'eval' as const, label: '技能评测' }
]

const filteredRuns = computed(() => activeSource.value === 'all'
  ? runTraceStore.sortedRuns
  : runTraceStore.sortedRuns.filter(run => run.source === activeSource.value))

const selectedRun = computed(() => selectedRunId.value ? runTraceStore.getRun(selectedRunId.value) : null)
const compareRunA = computed(() => compareRunAId.value ? runTraceStore.getRun(compareRunAId.value) : null)
const compareRunB = computed(() => compareRunBId.value ? runTraceStore.getRun(compareRunBId.value) : null)
const compareDiff = computed<RunTraceDiffResult | null>(() => {
  if (!compareRunA.value || !compareRunB.value || compareRunA.value.id === compareRunB.value.id) return null
  return buildRunTraceDiff(compareRunA.value, compareRunB.value)
})
const compareSelectionText = computed(() => {
  const a = compareRunAId.value ? 'A 已选择' : 'A 未选择'
  const b = compareRunBId.value ? 'B 已选择' : 'B 未选择'
  return `${a} / ${b}`
})
const folderDiagnostics = computed(() => (selectedRun.value?.folderDiagnostics || []) as any[])
const timelineGroups = computed<TraceGroup<RunTraceEvent>[]>(() => selectedRun.value
  ? groupByTurn(selectedRun.value.events.filter(event =>
    (timelineLevelFilter.value === 'all' || event.level === timelineLevelFilter.value)
    && (timelineTypeFilter.value === 'all' || event.type === timelineTypeFilter.value)
  ), selectedRun.value.turns)
  : [])
const timelineEventTypes = computed(() => [...new Set((selectedRun.value?.events || []).map(event => event.type))].sort())
const apiGroups = computed<TraceGroup<RunTraceApiCall>[]>(() => selectedRun.value
  ? groupByTurn(selectedRun.value.apiCalls, selectedRun.value.turns)
  : [])

watch(() => props.visible, visible => {
  if (!visible) return
  activeSource.value = props.defaultSource
  compareMode.value = false
  compareRunAId.value = null
  compareRunBId.value = null
  diffExportState.value = 'idle'
  diffExportResult.value = ''
  if (!selectedRunId.value || !filteredRuns.value.some(run => run.id === selectedRunId.value)) {
    selectedRunId.value = filteredRuns.value[0]?.id || null
  }
})

watch(() => props.defaultSource, source => {
  activeSource.value = source
})

watch(activeSource, () => {
  if (!compareMode.value) return
  if (compareRunAId.value && !filteredRuns.value.some(run => run.id === compareRunAId.value)) compareRunAId.value = null
  if (compareRunBId.value && !filteredRuns.value.some(run => run.id === compareRunBId.value)) compareRunBId.value = null
})

function formatTime(ts: number) {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function statusText(status: string) {
  if (status === 'running') return '进行中'
  if (status === 'success') return '成功'
  if (status === 'degraded') return '降级完成'
  if (status === 'blocked') return '已阻断，等待恢复'
  if (status === 'canceled') return '已取消'
  return '失败'
}

function contextBudgetDecisionText(decision?: string) {
  if (decision === 'fits') return '可容纳'
  if (decision === 'needs_segmentation') return '需要分段'
  if (decision === 'exceeds_provider') return '超过供应商窗口'
  return '未记录'
}

function executionPhaseText(phase?: string) {
  if (phase === 'locating') return '定位'
  if (phase === 'planning') return '规划'
  if (phase === 'writing') return '写入'
  if (phase === 'settling') return '结算'
  return '未记录'
}

function toggleCompareMode() {
  compareMode.value = !compareMode.value
  if (!compareMode.value) {
    compareRunAId.value = null
    compareRunBId.value = null
    diffExportState.value = 'idle'
    diffExportResult.value = ''
  }
}

function selectCompareRun(runId: string, side: 'A' | 'B') {
  if (side === 'A') {
    compareRunAId.value = compareRunAId.value === runId ? null : runId
  } else {
    compareRunBId.value = compareRunBId.value === runId ? null : runId
  }
  diffExportState.value = 'idle'
  diffExportResult.value = ''
}

function compareRunSummary(run: ReturnType<typeof runTraceStore.getRun>) {
  if (!run) return '未选择'
  return `${run.sourceName} / ${run.stepName || run.mode} / ${formatTime(run.startedAt)}`
}

function groupByTurn<T extends { turnId?: string }>(items: T[], turns?: RunTraceTurn[]): TraceGroup<T>[] {
  if (!turns?.length) return [{ key: 'legacy', turn: null, items }]
  const groups = turns.map(turn => ({ key: turn.id, turn, items: [] as T[] }))
  const unassigned: TraceGroup<T> = { key: 'unassigned', turn: null, items: [] }
  items.forEach(item => {
    const group = groups.find(candidate => candidate.turn?.id === item.turnId)
    if (group) group.items.push(item)
    else unassigned.items.push(item)
  })
  return unassigned.items.length ? [unassigned, ...groups] : groups
}

function turnRequestText(turn: RunTraceTurn) {
  const text = turn.userRequest?.trim() || '未记录请求'
  return text.length > 40 ? text.slice(0, 40) + '...' : text
}

function promptSnapshotsFor(call: RunTraceApiCall) {
  return (selectedRun.value?.promptSnapshots || []).filter(snapshot =>
    call.promptSnapshotIds?.includes(snapshot.id) || snapshot.apiCallId === call.id
  )
}

function processingReportsFor(call: RunTraceApiCall) {
  return (selectedRun.value?.processingReports || []).filter(report =>
    call.processingReportIds?.includes(report.id) || report.apiCallId === call.id
  )
}

const toolSummary = computed(() => {
  const tools = (selectedRun.value?.apiCalls || []).flatMap(call => call.toolCalls || [])
  if (!tools.length) return null
  const durations = tools.map(tool => tool.durationMs || 0).filter(value => value > 0).sort((a, b) => a - b)
  const mid = Math.floor((durations.length - 1) / 2)
  return {
    total: tools.length,
    failed: tools.filter(tool => tool.status !== 'success').length,
    downgrades: (selectedRun.value?.events || []).filter(event => event.type === 'physical-call' && event.detail?.includes('降级')).length,
    avgMs: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0,
    medianMs: durations.length ? Math.round((durations[mid] + durations[Math.ceil((durations.length - 1) / 2)]) / 2) : 0
  }
})

function toolSurfaceText(surface?: Array<{ name: string; policy: 'read' | 'write' }>) {
  if (!surface?.length) return '无'
  return surface.map(tool => `${tool.name}(${tool.policy})`).join('、')
}

function renderText(text: string) {
  const value = text || ''
  return value.length > 200000 ? value.slice(0, 200000) + '\n\n[文本超过 20 万字符，已截断预览；请导出 JSON 获取完整内容]' : value
}

function sealSelectedRun() {
  const run = selectedRun.value
  if (!run || run.sessionKind !== 'chat' || run.status !== 'running') return
  runTraceStore.finishRun(run.id, 'success')
}

async function copyRun() {
  const run = selectedRun.value
  if (!run) return
  const text = runTraceStore.exportRunToText(run)
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    await window.electronAPI?.clipboardWrite(text)
  }
}

async function copyDiff() {
  if (!compareDiff.value) return
  const text = runTraceStore.maskSensitive(buildRunTraceDiffText(compareDiff.value))
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    await window.electronAPI?.clipboardWrite(text)
  }
}

async function exportDiff() {
  if (!compareDiff.value || diffExportState.value === 'exporting') return
  diffExportState.value = 'exporting'
  diffExportResult.value = ''
  try {
    const maskValue = (value: unknown): unknown => {
      if (typeof value === 'string') return runTraceStore.maskSensitive(value)
      if (Array.isArray(value)) return value.map(maskValue)
      if (value && typeof value === 'object') {
        const output: Record<string, unknown> = {}
        Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
          output[key] = maskValue(item)
        })
        return output
      }
      return value
    }
    const payload = buildRunTraceDiffExport(compareDiff.value, maskValue) as Record<string, unknown>
    const result = await window.electronAPI?.runTraceExport({
      schema: 'shenyi.run-trace-diff',
      version: RUN_TRACE_DIFF_SCHEMA_VERSION,
      mode: 'diff',
      exportedAt: new Date().toISOString(),
      diff: payload
    })
    if (result?.success) {
      diffExportState.value = 'done'
      diffExportResult.value = `已导出：${result.path || '未知目录'}${result.bytes ? `（${result.bytes} bytes）` : ''}`
    } else if (result?.reason !== 'canceled') {
      diffExportState.value = 'failed'
      diffExportResult.value = `导出失败：${result?.reason || '未知错误'}`
    } else {
      diffExportState.value = 'idle'
      diffExportResult.value = '已取消导出'
    }
  } catch (error) {
    diffExportState.value = 'failed'
    diffExportResult.value = `导出失败：${error instanceof Error ? error.message : String(error)}`
  }
}

async function exportRun(mode: 'standard' | 'light' | 'deep') {
  const run = selectedRun.value
  if (!run) return
  const result = await window.electronAPI?.runTraceExport({
    schema: 'shenyi.run-trace',
    version: 6,
    mode,
    exportedAt: new Date().toISOString(),
    run: runTraceStore.exportRunToJson(run)
  })
  if (result && !result.success && result.reason !== 'canceled') {
    console.warn('运行记录导出失败：' + (result.reason || '未知错误'))
  }
}

async function openTraceFolder() {
  await window.electronAPI?.runTraceOpenFolder?.(selectedRun.value?.source || activeSource.value)
}
</script>

<style scoped>
.rt-panel { display: flex; flex-direction: column; width: min(1180px, 100%); height: min(820px, calc(100vh - 96px)); overflow: hidden; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-primary); box-shadow: var(--shadow-lg); }
.rt-header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); min-width: 0; padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--border-color); }
.rt-header div { display: flex; align-items: baseline; gap: var(--space-3); min-width: 0; }
.rt-header strong { color: var(--text-primary); font-size: var(--font-size-header); }
.rt-header span { color: var(--text-secondary); font-size: var(--font-size-sm); }
.rt-header-actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--space-3); flex-wrap: wrap; }
.rt-layout { display: grid; grid-template-columns: minmax(240px, 300px) minmax(0, 1fr); flex: 1; min-height: 0; }
.rt-list { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); border-right: 1px solid var(--border-color); background: var(--bg-secondary); overflow-y: auto; }
.rt-filter { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); margin-bottom: var(--space-2); }
.rt-filter button { padding: var(--space-2); border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-elevated); color: var(--text-secondary); cursor: pointer; font-size: var(--font-size-xs); }
.rt-filter button.active { border-color: var(--accent); color: var(--accent); font-weight: 600; }
.rt-run { display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-3); border: 1px solid transparent; border-radius: var(--radius-sm); background: var(--bg-elevated); cursor: pointer; }
.rt-run:hover { border-color: var(--border-color); }
.rt-run.active { border-color: var(--accent); }
.rt-run.compare-a { border-color: var(--success); }
.rt-run.compare-b { border-color: var(--warning); }
.rt-run.compare-a.compare-b { border-color: var(--accent); }
.rt-run-compare { display: flex; gap: var(--space-2); margin-top: var(--space-1); }
.rt-run-compare button { flex: 1; padding: 3px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-elevated); color: var(--text-secondary); cursor: pointer; font-size: var(--font-size-xxs); }
.rt-run-compare button.active { border-color: var(--accent); color: var(--accent); font-weight: 600; }
.rt-run-main { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); color: var(--text-primary); font-size: var(--font-size-sm); }
.rt-run-sub { color: var(--text-secondary); font-size: var(--font-size-xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rt-run-meta { display: flex; flex-wrap: wrap; gap: var(--space-2); color: var(--text-secondary); font-size: var(--font-size-xs); }
.rt-run-meta .is-success { color: var(--success); }
.rt-run-meta .is-failed { color: var(--danger); }
.rt-run-meta .is-canceled { color: var(--warning); }
.rt-run-meta .is-running { color: var(--accent); }
.rt-detail { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.rt-detail-compare { overflow: hidden; }
.rt-detail-empty { align-items: center; justify-content: center; color: var(--text-secondary); }
.rt-summary { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); padding: var(--space-3) var(--space-5); border-bottom: 1px solid var(--border-color); color: var(--text-secondary); font-size: var(--font-size-sm); }
.rt-compare-summary { justify-content: space-between; }
.rt-compare-empty { display: flex; flex: 1; align-items: center; justify-content: center; color: var(--text-secondary); font-size: var(--font-size-sm); }
.rt-compare-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-5); border-top: 1px solid var(--border-color); }
.rt-compare-actions button:disabled { cursor: not-allowed; opacity: .55; }
.rt-compare-result { color: var(--success); font-size: var(--font-size-sm); overflow-wrap: anywhere; }
.rt-compare-error { color: var(--danger); font-size: var(--font-size-sm); overflow-wrap: anywhere; }
.rt-tabs { display: flex; gap: var(--space-1); padding: var(--space-3) var(--space-5) 0; border-bottom: 1px solid var(--border-color); }
.rt-tabs button { padding: var(--space-2) var(--space-3); border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--text-secondary); cursor: pointer; font-size: var(--font-size-sm); }
.rt-tabs button.active { border-bottom-color: var(--accent); color: var(--text-primary); font-weight: 600; }
.rt-body { flex: 1; min-height: 0; overflow: hidden; }
.rt-section { display: flex; flex-direction: column; gap: var(--space-3); height: 100%; padding: var(--space-4) var(--space-5) var(--space-5); overflow-y: auto; }
.rt-event { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: var(--space-2); padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); background: var(--bg-secondary); }
.rt-inline-filters { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.rt-inline-filters select { padding: var(--space-2); border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-elevated); color: var(--text-primary); font-size: var(--font-size-xs); }
.rt-tool-summary { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-3); padding: var(--space-3); border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-secondary); color: var(--text-secondary); font-size: var(--font-size-sm); }
.rt-tool-summary strong { color: var(--text-primary); }
.rt-turn-divider { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-3); border-left: 3px solid var(--accent); border-radius: var(--radius-sm); background: var(--bg-tertiary); }
.rt-turn-divider strong { color: var(--text-primary); font-size: var(--font-size-sm); }
.rt-turn-divider span { overflow: hidden; color: var(--text-primary); font-size: var(--font-size-xs); text-overflow: ellipsis; white-space: nowrap; }
.rt-turn-divider em { color: var(--text-secondary); font-size: var(--font-size-xs); font-style: normal; }
.rt-event span { color: var(--text-secondary); font-size: var(--font-size-xs); }
.rt-event strong { color: var(--text-primary); font-size: var(--font-size-sm); }
.rt-event pre { grid-column: 1 / -1; margin: 0; max-height: 180px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--text-secondary); font-size: var(--font-size-xs); line-height: 1.5; user-select: text; }
.rt-error { padding: var(--space-3); border-radius: var(--radius-sm); background: var(--bg-tertiary); color: var(--danger); overflow-wrap: anywhere; }
.rt-api { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-secondary); }
.rt-api-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); color: var(--text-secondary); font-size: var(--font-size-sm); }
.rt-api-head strong { color: var(--text-primary); }
.rt-api-head .is-success { color: var(--success); }
.rt-api-head .is-failed { color: var(--danger); }
.rt-api-head .is-canceled { color: var(--warning); }
.rt-api-head .is-running { color: var(--accent); }
.rt-api details { color: var(--text-secondary); font-size: var(--font-size-sm); }
.rt-api summary { cursor: pointer; }
.rt-api pre { margin: var(--space-2) 0 0; padding: var(--space-3); max-height: 360px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; border-radius: var(--radius-sm); background: var(--bg-tertiary); color: var(--text-primary); font-size: var(--font-size-xs); line-height: 1.6; user-select: text; }
.rt-subcall { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-2) 0; border-top: 1px solid var(--border-color); }
.rt-subcall strong { color: var(--text-primary); font-size: var(--font-size-xs); }
.rt-subcall span { color: var(--text-secondary); font-size: var(--font-size-xs); }
.rt-folders { display: flex; flex-direction: column; gap: var(--space-3); }
.rt-export { display: flex; flex-wrap: wrap; gap: var(--space-3); }
.rt-export-tip { margin: 0; color: var(--text-secondary); font-size: var(--font-size-sm); line-height: 1.6; }
.rt-empty { padding: var(--space-4); border-radius: var(--radius-sm); background: var(--bg-secondary); color: var(--text-secondary); font-size: var(--font-size-sm); line-height: 1.6; }
@media (max-width: 760px) {
  .rt-header { flex-wrap: wrap; }
  .rt-header > div:first-child { flex: 1 1 100%; }
  .rt-header span { display: none; }
  .rt-header-actions { flex: 1 1 100%; justify-content: flex-start; }
  .rt-layout { grid-template-columns: 1fr; }
  .rt-list { max-height: 220px; border-right: 0; border-bottom: 1px solid var(--border-color); }
}
</style>
