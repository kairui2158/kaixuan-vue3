<template>
  <div
    class="ow-msg"
    :class="message.role"
    :data-message-id="message.messageId || ''"
  >
    <div ref="bubbleRef" class="ow-msg-bubble" v-html="renderedContent"></div>
    <div
      v-if="message.role === 'assistant' && message.routingFallback"
      class="ow-routing-fallback"
    >
      <div class="ow-routing-title">未识别到明确执行意图</div>
      <div class="ow-routing-desc">{{ routingText }}</div>
      <div class="ow-routing-actions">
        <button class="msg-btn" :disabled="busy" @click="emit('routing-continue')">按推荐技能继续</button>
        <details class="ow-routing-advanced">
          <summary>高级</summary>
          <button class="msg-btn" :disabled="busy" @click="emit('routing-bypass')">本次直接全链执行</button>
        </details>
      </div>
    </div>
    <div
      v-if="message.role === 'assistant' && message.budgetExhausted"
      class="ow-routing-fallback ow-routing-budget"
    >
      <div class="ow-routing-title">API 调用预算已用尽（{{ message.budgetExhausted.used }}/{{ message.budgetExhausted.limit }}）</div>
      <div class="ow-routing-desc">已保留链式断点，可追加预算后从断点继续。</div>
      <div class="ow-routing-actions">
        <button class="msg-btn" :disabled="busy" @click="emit('budget-extend')">追加 4 次并继续</button>
      </div>
    </div>
    <div
      v-if="message.role === 'assistant' && message.finalDraftTask"
      class="ow-routing-fallback ow-final-draft-status"
      :class="message.finalDraftTask.status"
    >
      <div class="ow-routing-title">终稿生成：{{ finalDraftStatusLabel(message.finalDraftTask.status) }}</div>
      <div class="ow-routing-desc">
        源文 {{ message.finalDraftTask.sourceChars }} 字；终稿 {{ message.finalDraftTask.completedChars || message.finalDraftTask.accumulatedChars }} 字；续生成 {{ message.finalDraftTask.continuationCount }} 次。
      </div>
      <div class="ow-routing-desc" v-if="message.finalDraftTask.error">{{ message.finalDraftTask.error }}</div>
      <div class="ow-routing-desc ow-final-draft-stalled" v-if="finalDraftStalled">
        流式停滞：长时间无新增或持续低速输出。可继续等待、重试当前段或取消生成；重试会保留已完成分段。
      </div>
      <div class="ow-routing-actions" v-if="finalDraftStalled">
        <select
          v-model="stalledRetryProviderId"
          class="ow-final-draft-provider-select"
          aria-label="停滞重试供应商"
        >
          <option value="">使用当前供应商</option>
          <option v-for="provider in stalledRetryProviders" :key="provider.id" :value="provider.id">
            {{ provider.name }}（{{ provider.model }}）
          </option>
        </select>
      </div>
      <div
        class="ow-routing-actions"
        v-if="canResumeFinalDraft || finalDraftStalled"
      >
        <button class="msg-btn" :disabled="busy" @click="emit('final-draft-continue')">继续生成终稿</button>
        <button
          v-if="canRetryFinalDraftSegment"
          class="msg-btn"
          :class="{ 'is-stalled': finalDraftStalled }"
          :disabled="busy && !finalDraftStalled"
          @click="emit('final-draft-retry-segment', stalledRetryProviderId)"
        >重试当前段</button>
        <button
          v-if="message.finalDraftTask.status === 'generating'"
          class="msg-btn"
          :disabled="busy"
          @click="emit('final-draft-resume')"
        >从检查点恢复</button>
      </div>
    </div>
    <div
      v-if="message.role === 'assistant' && message.outlineDeletionConfirmation"
      class="ow-routing-fallback ow-deletion-confirmation"
      :data-turn-id="message.outlineDeletionConfirmation.turnId"
    >
      <div class="ow-routing-title">API 请求删除大纲标题，等待你授权</div>
      <div class="ow-routing-desc">{{ message.outlineDeletionConfirmation.reason }}。授权前原文不会被修改。</div>
      <div class="ow-routing-actions">
        <button class="msg-btn" :disabled="busy" @click="emit('deletion-approve')">授权本次删除</button>
        <button class="msg-btn" :disabled="busy" @click="emit('deletion-dismiss')">拒绝并保留原文</button>
      </div>
    </div>
    <RealSkillDiagnosticsPanel
      v-if="message.role === 'assistant' && message.skillRunDiagnostics"
      :status="message.skillRunDiagnostics.status"
      :diagnostics="message.skillRunDiagnostics.diagnostics"
      :request-messages="message.skillRunDiagnostics.requestMessages"
      :budget="message.skillRunDiagnostics.budget"
      :folder-package-cache="message.skillRunDiagnostics.folderPackageCache"
    />
    <div
      v-if="message.role === 'assistant' && message.outlineCompatibilityMode"
      class="ow-compatibility-mode"
    >
      <span class="ow-compatibility-mode-title">兼容模式：定位可靠性较低</span>
      <span class="ow-compatibility-mode-desc">当前供应商未启用原生工具调用。请在修改命令中使用结构锚点（卷/章/节标题）或更长的唯一原文片段。</span>
    </div>
    <div v-if="batchDiff" class="ow-batch-diff">
      <EditorDiffLayer
        :batch-plan="{ ok: true, original: batchDiff.original, next: batchDiff.next, items: [] }"
        :current-content="currentOutlineContent"
        :stored-hunks="batchDiff.hunks"
        :busy="busy"
        @rollback-hunk="hunkIndex => emit('batch-rollback-hunk', hunkIndex)"
        @reveal-hunk="hunk => emit('batch-reveal-hunk', hunk)"
      />
    </div>
    <div v-if="message.role === 'assistant'" class="ow-msg-actions">
      <button class="msg-btn" data-tooltip="复制" @click="emit('copy')">复制</button>
      <button class="msg-btn" data-tooltip="替换整个大纲" @click="emit('replace')">替换</button>
      <button class="msg-btn" data-tooltip="重新生成该回复" @click="emit('regenerate')">重生成</button>
      <button class="msg-btn" data-tooltip="插入到光标处" @click="emit('insert')">插入</button>
      <button
        v-if="message.outlineBatchRecord?.status === 'applied' && message.outlineBatchRecord?.undoAvailable === true"
        class="msg-btn"
        :disabled="busy"
        data-tooltip="恢复该批次应用前的大纲内容"
        @click="emit('batch-rollback')"
      >回滚批次</button>
      <button
        v-if="message.outlineBatchRecord?.status === 'applied'"
        class="msg-btn"
        :disabled="busy"
        data-tooltip="在大纲编辑器中定位首处变更"
        @click="emit('batch-reveal')"
      >查看位置</button>
      <button
        v-if="message.continuation && continuationAvailable"
        class="msg-btn"
        :disabled="busy"
        data-tooltip="从中断位置继续生成"
        @click="emit('continuation-continue')"
      >续生成</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { renderMarkdown } from '../../utils/markdownService'
import { safeModeActive } from '../../services/responsivenessStore'
import { canContinue } from '../../services/continuation'
import RealSkillDiagnosticsPanel from './RealSkillDiagnosticsPanel.vue'
import EditorDiffLayer from '../editor/EditorDiffLayer.vue'
import type { EditorDiffHunk } from '../../services/editorDiffHunks'

export interface OutlineStalledRetryProvider {
  id: string
  name: string
  model: string
}

export interface OutlineBatchDiffView {
  original: string
  next: string
  hunks: EditorDiffHunk[]
}

const props = defineProps<{
  message: any
  busy: boolean
  currentOutlineContent: string
  batchDiff: OutlineBatchDiffView | null
  stalledRetryProviders: OutlineStalledRetryProvider[]
}>()

const emit = defineEmits<{
  copy: []
  replace: []
  regenerate: []
  insert: []
  'routing-continue': []
  'routing-bypass': []
  'budget-extend': []
  'final-draft-continue': []
  'final-draft-retry-segment': [providerId: string]
  'final-draft-resume': []
  'deletion-approve': []
  'deletion-dismiss': []
  'batch-rollback': []
  'batch-reveal': []
  'batch-rollback-hunk': [hunkIndex: number]
  'batch-reveal-hunk': [hunk: EditorDiffHunk]
  'continuation-continue': []
}>()

const bubbleRef = ref<HTMLElement | null>(null)
const stalledRetryProviderId = ref('')
const messageId = computed(() => String(props.message?.messageId || ''))

const renderedContent = computed(() => {
  const content = String(props.message?.content || '')
  if (safeModeActive.value) return content.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character)
  return renderMarkdown(content)
})
const continuationAvailable = computed(() => Boolean(props.message?.continuation && canContinue(props.message.continuation)))
const finalDraftTask = computed(() => props.message?.finalDraftTask)
const finalDraftStalled = computed(() =>
  finalDraftTask.value?.status === 'generating'
  && finalDraftTask.value?.lastTelemetry?.throughputStatus === 'stalled')
const canResumeFinalDraft = computed(() =>
  finalDraftTask.value?.status === 'awaiting_continuation'
  || finalDraftTask.value?.status === 'interrupted')
const canRetryFinalDraftSegment = computed(() => {
  const status = finalDraftTask.value?.status
  return status === 'generating' || status === 'awaiting_continuation' || status === 'interrupted'
})

const routingText = computed(() => {
  const routing = props.message?.routingFallback?.routing
  if (routing?.kind === 'ambiguous') {
    return `检测到多个可能意图：${routing.candidates.join('、')}。请确认后继续。`
  }
  return '未能识别意图，请补充写入或讨论说明'
})

function finalDraftStatusLabel(status: string) {
  const labels: Record<string, string> = {
    planning: '准备中',
    generating: '生成中',
    awaiting_continuation: '等待续生成',
    interrupted: '慢流中断',
    writing: '写入中',
    completed: '已写入',
    failed: '失败',
    rolled_back: '已回滚',
    canceled: '已取消',
  }
  return labels[status] || '未知状态'
}
</script>
