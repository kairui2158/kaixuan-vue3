<template>
  <section class="rtd-body">
    <div v-if="diffResult.warnings.length" class="rtd-warnings">
      <p v-for="warning in diffResult.warnings" :key="warning">{{ warning }}</p>
    </div>

    <nav class="rtd-tabs" role="tablist" aria-label="运行对比视图">
      <button
        v-for="tab in tabs"
        :key="tab.value"
        type="button"
        :class="{ active: activeTab === tab.value }"
        @click="activeTab = tab.value"
      >
        {{ tab.label }}
      </button>
    </nav>

    <div class="rtd-section">
      <template v-if="activeTab === 'overview'">
        <EmptyState v-if="hasNoChanges" variant="compact" icon="search" title="两次运行没有差异" description="核心状态与请求计数保持一致" />
        <div v-else class="rtd-grid">
          <div
            v-for="field in diffResult.overview.filter(item => item.changed)"
            :key="field.key"
            class="rtd-field"
          >
            <strong>{{ field.key }}</strong>
            <span>A：{{ formatValue(field.a) }}</span>
            <span>B：{{ formatValue(field.b) }}</span>
          </div>
        </div>
      </template>

      <template v-else-if="activeTab === 'api'">
        <EmptyState v-if="diffResult.apiCalls.length === 0" variant="compact" icon="search" title="没有 API 调用" description="两次运行都没有产生 API 调用记录" />
        <article v-for="item in diffResult.apiCalls" :key="item.key" class="rtd-item">
          <header>
            <strong>API {{ item.a?.seq ?? item.b?.seq }} / {{ pairLabel(item) }}</strong>
            <span>{{ item.rule }}</span>
          </header>
          <div class="rtd-fields">
            <div v-for="field in item.fields.filter(field => field.changed)" :key="field.key">
              <strong>{{ field.key }}</strong>
              <span>A：{{ formatValue(field.a) }}</span>
              <span>B：{{ formatValue(field.b) }}</span>
            </div>
          </div>
          <details v-for="request in item.requestDiffs" :key="request.role">
            <summary>请求消息 / {{ request.role }}（{{ diffStats(request.diff) }}）</summary>
            <TextDiffView :diff="request.diff" />
          </details>
          <details>
            <summary>完整返回（{{ diffStats(item.responseDiff) }}）</summary>
            <TextDiffView :diff="item.responseDiff" />
          </details>
          <details>
            <summary>流式全文（{{ diffStats(item.streamDiff) }}）</summary>
            <TextDiffView :diff="item.streamDiff" />
          </details>
          <details>
            <summary>思考过程（{{ diffStats(item.reasoningDiff) }}）</summary>
            <TextDiffView :diff="item.reasoningDiff" />
          </details>
        </article>
      </template>

      <template v-else-if="activeTab === 'prompt'">
        <EmptyState v-if="diffResult.promptSnapshots.length === 0" variant="compact" icon="search" title="没有提示词快照" description="两次运行都没有暴露提示词快照" />
        <article v-for="item in diffResult.promptSnapshots" :key="item.key" class="rtd-item">
          <header>
            <strong>{{ item.a?.skillName || item.b?.skillName || '提示词快照' }} / {{ pairLabel(item) }}</strong>
            <span>{{ item.rule }}</span>
          </header>
          <div class="rtd-fields">
            <div v-for="field in item.fields.filter(field => field.changed)" :key="field.key">
              <strong>{{ field.key }}</strong>
              <span>A：{{ formatValue(field.a) }}</span>
              <span>B：{{ formatValue(field.b) }}</span>
            </div>
          </div>
          <details>
            <summary>变量（{{ diffStats(item.variableDiff) }}）</summary>
            <TextDiffView :diff="item.variableDiff" />
          </details>
          <details>
            <summary>上下文块（{{ diffStats(item.contextDiff) }}）</summary>
            <TextDiffView :diff="item.contextDiff" />
          </details>
          <details>
            <summary>folder 指纹（{{ diffStats(item.fingerprintDiff) }}）</summary>
            <TextDiffView :diff="item.fingerprintDiff" />
          </details>
          <details>
            <summary>system prompt（{{ diffStats(item.systemDiff) }}）</summary>
            <TextDiffView :diff="item.systemDiff" />
          </details>
          <details>
            <summary>user prompt（{{ diffStats(item.userDiff) }}）</summary>
            <TextDiffView :diff="item.userDiff" />
          </details>
        </article>
      </template>

      <template v-else-if="activeTab === 'output'">
        <EmptyState v-if="diffResult.physicalCalls.length === 0" variant="compact" icon="search" title="没有物理请求" description="两次运行都没有发起物理请求" />
        <article v-for="item in diffResult.physicalCalls" :key="item.key" class="rtd-item">
          <header>
            <strong>物理请求 #{{ item.a?.seq ?? item.b?.seq }} / {{ pairLabel(item) }}</strong>
            <span>{{ item.rule }}</span>
          </header>
          <div class="rtd-fields">
            <div v-for="field in item.fields.filter(field => field.changed)" :key="field.key">
              <strong>{{ field.key }}</strong>
              <span>A：{{ formatValue(field.a) }}</span>
              <span>B：{{ formatValue(field.b) }}</span>
            </div>
          </div>
          <details>
            <summary>物理请求全文（{{ diffStats(item.requestDiff) }}）</summary>
            <TextDiffView :diff="item.requestDiff" />
          </details>
          <details>
            <summary>物理响应全文（{{ diffStats(item.responseDiff) }}）</summary>
            <TextDiffView :diff="item.responseDiff" />
          </details>
        </article>
      </template>

      <template v-else-if="activeTab === 'tools'">
        <div class="rtd-grid" v-if="diffResult.skillDebugSummary">
          <div class="rtd-field">
            <strong>模板版本差异数</strong>
            <span>{{ diffResult.skillDebugSummary.templateVersionChanged }}</span>
          </div>
          <div class="rtd-field">
            <strong>工具序列是否变化</strong>
            <span>{{ diffResult.skillDebugSummary.toolSequenceChanged ? '有变化' : '一致' }}</span>
          </div>
          <div
            v-if="diffResult.skillDebugSummary.firstDifferentApiCall"
            class="rtd-field"
          >
            <strong>首个不同 API 调用</strong>
            <span>A #{{ diffResult.skillDebugSummary.firstDifferentApiCall.seqA ?? '-' }} / B #{{ diffResult.skillDebugSummary.firstDifferentApiCall.seqB ?? '-' }}</span>
            <span>{{ diffResult.skillDebugSummary.firstDifferentApiCall.reason }}</span>
          </div>
        </div>
        <div v-if="diffResult.templateVersions.length" class="rtd-subtitle">模板版本</div>
        <div v-if="diffResult.templateVersions.length" class="rtd-grid">
          <div v-for="item in diffResult.templateVersions" :key="item.key" class="rtd-field">
            <strong>{{ item.skillName || item.skillId || '技能' }}</strong>
            <span>A：{{ item.aVersion || '未记录版本' }}</span>
            <span>B：{{ item.bVersion || '未记录版本' }}</span>
            <span v-if="item.changed">模板版本或 folder 指纹存在差异</span>
          </div>
        </div>
        <div v-if="diffResult.toolSequence.steps.length" class="rtd-subtitle">工具序列</div>
        <div v-if="diffResult.toolSequence.steps.length" class="rtd-state">
          <div>
            <strong>A</strong>
            <p v-for="item in diffResult.toolSequence.steps" :key="'tool-a-' + item.index">
              API {{ item.apiSeqA ?? '-' }} / {{ item.nameA || '-' }} / {{ item.statusA || '-' }}
            </p>
          </div>
          <div>
            <strong>B</strong>
            <p v-for="item in diffResult.toolSequence.steps" :key="'tool-b-' + item.index">
              API {{ item.apiSeqB ?? '-' }} / {{ item.nameB || '-' }} / {{ item.statusB || '-' }}
            </p>
          </div>
        </div>
        <div v-if="diffResult.toolSequence.firstDivergence" class="rtd-warning">
          工具序列首次分叉：第 {{ diffResult.toolSequence.firstDivergence.index + 1 }} 个工具调用
        </div>
        <div v-if="diffResult.toolSurfaces.length" class="rtd-grid">
          <div v-for="item in diffResult.toolSurfaces" :key="item.name" class="rtd-field">
            <strong>{{ item.name }}</strong>
            <span>A：{{ item.policyA || '未暴露' }}</span>
            <span>B：{{ item.policyB || '未暴露' }}</span>
          </div>
        </div>
        <div v-if="diffResult.actualToolSurfaces.length" class="rtd-grid">
          <div v-for="item in diffResult.actualToolSurfaces" :key="'actual-' + item.name" class="rtd-field">
            <strong>{{ item.name }}</strong>
            <span>A：{{ item.policyA || '未暴露' }}</span>
            <span>B：{{ item.policyB || '未暴露' }}</span>
          </div>
        </div>
        <EmptyState v-if="diffResult.toolCalls.length === 0" variant="compact" icon="search" title="没有工具调用" description="两次运行都没有记录工具调用" />
        <article v-for="item in diffResult.toolCalls" :key="item.key" class="rtd-item">
          <header>
            <strong>{{ item.a?.name || item.b?.name || '工具调用' }} / {{ pairLabel(item) }}</strong>
            <span>{{ item.rule }}</span>
          </header>
          <details>
            <summary>工具输入（{{ diffStats(item.inputDiff) }}）</summary>
            <TextDiffView :diff="item.inputDiff" />
          </details>
          <details>
            <summary>工具结果（{{ diffStats(item.resultDiff) }}）</summary>
            <TextDiffView :diff="item.resultDiff" />
          </details>
        </article>

        <div v-if="diffResult.processingReports.length" class="rtd-subtitle">本地处理报告</div>
        <article v-for="item in diffResult.processingReports" :key="item.key" class="rtd-item">
          <header>
            <strong>{{ item.a?.processor || item.b?.processor }} / {{ item.a?.stage || item.b?.stage }} / {{ pairLabel(item) }}</strong>
            <span>{{ item.rule }}</span>
          </header>
          <details>
            <summary>规则命中（{{ diffStats(item.ruleHitsDiff) }}）</summary>
            <TextDiffView :diff="item.ruleHitsDiff" />
          </details>
          <details>
            <summary>问题（{{ diffStats(item.issuesDiff) }}）</summary>
            <TextDiffView :diff="item.issuesDiff" />
          </details>
        </article>

        <div v-if="diffResult.folderDiagnostics.length" class="rtd-subtitle">folder 诊断</div>
        <article v-for="item in diffResult.folderDiagnostics" :key="item.index" class="rtd-item">
          <header>
            <strong>diagnostic-{{ item.index + 1 }}</strong>
            <span>{{ item.onlyIn ? `仅存在于 ${item.onlyIn}` : '已对齐' }}</span>
          </header>
          <details>
            <summary>诊断内容（{{ diffStats(item.diff) }}）</summary>
            <TextDiffView :diff="item.diff" />
          </details>
        </article>
      </template>

      <template v-else>
        <div v-if="eventCountDiffs.length" class="rtd-grid">
          <div v-for="item in eventCountDiffs" :key="item.type" class="rtd-field">
            <strong>{{ item.type }}</strong>
            <span>A：{{ item.countA }} 次</span>
            <span>B：{{ item.countB }} 次</span>
          </div>
        </div>
        <EmptyState v-else variant="compact" icon="search" title="事件计数没有差异" description="各事件类型数量保持一致" />
        <div class="rtd-subtitle">状态历史</div>
        <div class="rtd-state">
          <div>
            <strong>A</strong>
            <p v-for="(item, index) in diffResult.stateHistory.a" :key="'a-' + index">
              {{ statusLabel(item?.fromStatus) }} -> {{ statusLabel(item?.toStatus) }}{{ item?.reason ? `（${item.reason}）` : '' }}
            </p>
          </div>
          <div>
            <strong>B</strong>
            <p v-for="(item, index) in diffResult.stateHistory.b" :key="'b-' + index">
              {{ statusLabel(item?.fromStatus) }} -> {{ statusLabel(item?.toStatus) }}{{ item?.reason ? `（${item.reason}）` : '' }}
            </p>
          </div>
        </div>
        <div v-if="diffResult.stateHistory.firstDivergence" class="rtd-warning">
          状态历史首次分叉：{{ diffResult.stateHistory.firstDivergence.reason }}
        </div>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { RunTraceDiffResult, TextDiff } from '../../services/runTraceDiff'
import TextDiffView from './TextDiffView.vue'
import EmptyState from './EmptyState.vue'

const props = defineProps<{
  diffResult: RunTraceDiffResult
}>()

defineOptions({ name: 'RunTraceDiffPanel' })

const tabs = [
  { value: 'overview', label: '概览' },
  { value: 'api', label: 'API' },
  { value: 'prompt', label: '提示词' },
  { value: 'output', label: '输出' },
  { value: 'tools', label: '工具与处理' },
  { value: 'events', label: '事件与状态' }
] as const

const activeTab = ref<typeof tabs[number]['value']>('overview')
const eventCountDiffs = computed(() => props.diffResult.events.countDiffs.filter(item => item.countA !== item.countB))
const hasNoChanges = computed(() =>
  props.diffResult.overview.every(field => !field.changed)
  && props.diffResult.apiCalls.every(item => !item.onlyIn && item.fields.every(field => !field.changed)
    && item.requestDiffs.every(request => request.diff.same)
    && item.responseDiff.same && item.streamDiff.same && item.reasoningDiff.same)
)

function pairLabel(item: { onlyIn?: 'A' | 'B' }) {
  if (item.onlyIn === 'A') return '仅存在于 A'
  if (item.onlyIn === 'B') return '仅存在于 B'
  return '已对齐'
}

function formatValue(value: unknown) {
  if (value === undefined) return '未记录'
  if (value === null) return '无'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function statusLabel(status?: string) {
  if (!status) return 'initial'
  if (status === 'running') return '进行中'
  if (status === 'success') return '成功'
  if (status === 'degraded') return '降级完成'
  if (status === 'blocked') return '已阻断'
  if (status === 'canceled') return '已取消'
  return '失败'
}

function diffStats(diff: TextDiff) {
  return `${diff.mode === 'lines' ? '行级' : '统计'} / 相同 ${diff.stats.unchanged} / 新增 ${diff.stats.added} / 删除 ${diff.stats.removed}`
}
</script>

<style scoped>
.rtd-body { display: flex; flex: 1; flex-direction: column; min-height: 0; }
.rtd-warnings { display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-3) var(--space-5) 0; }
.rtd-warnings p { margin: 0; color: var(--warning); font-size: var(--font-size-sm); }
.rtd-tabs { display: flex; flex-wrap: wrap; gap: var(--space-1); padding: var(--space-3) var(--space-5) 0; border-bottom: 1px solid var(--border-color); }
.rtd-tabs button { padding: var(--space-2) var(--space-3); border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--text-secondary); cursor: pointer; font-size: var(--font-size-sm); }
.rtd-tabs button.active { border-bottom-color: var(--accent); color: var(--text-primary); font-weight: 600; }
.rtd-section { display: flex; flex: 1; flex-direction: column; gap: var(--space-3); min-height: 0; padding: var(--space-4) var(--space-5) var(--space-5); overflow-y: auto; }
.rtd-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-3); }
.rtd-field { display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-3); border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-secondary); }
.rtd-field strong { color: var(--text-primary); font-size: var(--font-size-sm); }
.rtd-field span { color: var(--text-secondary); font-size: var(--font-size-xs); overflow-wrap: anywhere; }
.rtd-item { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-secondary); }
.rtd-item header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2); }
.rtd-item header strong { color: var(--text-primary); font-size: var(--font-size-sm); }
.rtd-item header span { color: var(--text-secondary); font-size: var(--font-size-xs); }
.rtd-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-2); }
.rtd-fields div { display: flex; flex-direction: column; gap: 2px; }
.rtd-fields strong { color: var(--text-primary); font-size: var(--font-size-xs); }
.rtd-fields span { color: var(--text-secondary); font-size: var(--font-size-xs); overflow-wrap: anywhere; }
.rtd-item details { color: var(--text-secondary); font-size: var(--font-size-sm); }
.rtd-item summary { cursor: pointer; }
.rtd-subtitle { padding-top: var(--space-2); border-top: 1px solid var(--border-color); color: var(--text-primary); font-size: var(--font-size-sm); font-weight: 600; }
.rtd-state { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }
.rtd-state div { padding: var(--space-3); border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-secondary); }
.rtd-state strong { color: var(--text-primary); }
.rtd-state p { margin: var(--space-1) 0 0; color: var(--text-secondary); font-size: var(--font-size-xs); }
.rtd-warning { padding: var(--space-3); border-radius: var(--radius-sm); background: var(--bg-tertiary); color: var(--warning); font-size: var(--font-size-sm); }
@media (max-width: 760px) { .rtd-state { grid-template-columns: 1fr; } }
</style>
