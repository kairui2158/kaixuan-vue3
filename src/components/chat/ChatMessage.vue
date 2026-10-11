<template>
  <div class="chat-message" :class="message.role">
    <div class="message-bubble" :class="message.role">
      <div ref="contentRef" class="message-content" v-html="renderedContent"></div>
      <div
        v-if="message.role === 'assistant' && message.editorBatch && message.editorBatchRecord"
        class="chat-edit-command"
        data-tooltip="API 已直接写入编辑器，可通过批次记录回滚"
      >
        已写入编辑器：{{ message.editorBatch.commands.length }} 条
        <span class="chat-direct-write-badge">可回滚</span>
        <button
          v-if="canRollbackBatch"
          class="msg-btn"
          :disabled="busy"
          type="button"
          data-tooltip="恢复该批次应用前的内容"
          @click="$emit('rollback')"
        >回滚此批次</button>
        <button
          class="msg-btn"
          type="button"
          data-tooltip="在编辑器中定位首处变更"
          @click="$emit('reveal')"
        >查看位置</button>
        <EditorDiffLayer
          v-if="message.editorBatchDiff"
          :batch-plan="{
            ok: true,
            original: message.editorBatchDiff.original,
            next: message.editorBatchDiff.next,
            items: [],
          }"
          :current-content="currentContentForDiff || ''"
          :stored-hunks="message.editorBatchDiff.hunks"
          :busy="busy"
          @rollback-hunk="index => $emit('rollback-hunk', index)"
          @reveal-hunk="hunk => $emit('reveal-hunk', hunk)"
        />
      </div>
    <div
      v-if="message.role === 'assistant' && activeTask"
      class="chat-task-status"
    >
      <div class="chat-task-title">
        <span class="chat-task-name">{{ activeTask?.description }}</span>
        <span class="chat-task-state" :class="activeTask?.state">{{ taskStateLabel }}</span>
      </div>
      <div class="chat-task-steps">
        <span
          v-for="(step, idx) in activeTask?.steps"
          :key="step.stepId"
          class="chat-task-step"
          :class="step.status"
        >{{ idx + 1 }}.{{ step.action }}:{{ stepStatusIcon(step.status) }}</span>
      </div>
      <div class="chat-task-actions" v-if="activeTask?.state === 'paused' || activeTask?.state === 'failed'">
        <button class="msg-btn" :disabled="busy" type="button" @click="$emit('resume-task')">恢复</button>
        <button class="msg-btn" :disabled="busy" type="button" @click="$emit('retry-step')">重试</button>
      </div>
      <div class="chat-task-actions" v-if="activeTask?.state === 'acting'">
        <button class="msg-btn" :disabled="busy" type="button" @click="$emit('pause-task')">暂停</button>
      </div>
    </div>
    <div
      v-if="message.role === 'assistant' && message.finalDraftTask"
      class="chat-task-status chat-final-draft-status"
      :class="message.finalDraftTask.status"
    >
      <div class="chat-task-title">
        <span class="chat-task-name">终稿生成</span>
        <span class="chat-task-state">{{ finalDraftStatusLabel }}</span>
      </div>
      <div class="chat-task-steps">
        <span class="chat-task-step">{{ finalDraftStatusMeta }}</span>
        <span v-if="finalDraftStalled" class="chat-task-step stalled">流式停滞：长时间无新增或持续低速输出</span>
      </div>
      <div v-if="finalDraftStalled" class="chat-final-draft-stalled-actions">
        <span class="chat-final-draft-hint">可继续等待、重试当前段或取消生成；重试会保留已完成分段。</span>
        <select
          v-if="providerOptions.length > 0"
          v-model="selectedProviderId"
          class="chat-final-draft-provider-select"
          aria-label="停滞重试供应商"
        >
          <option value="">使用当前供应商</option>
          <option v-for="provider in providerOptions" :key="provider.id" :value="provider.id">
            {{ provider.name }}（{{ provider.model }}）
          </option>
        </select>
      </div>
      <div class="chat-task-actions" v-if="canContinueFinalDraft || finalDraftStalled">
        <button class="msg-btn" :disabled="busy" type="button" @click="$emit('continue-final-draft')">继续生成终稿</button>
        <button
          v-if="canRetryFinalDraftSegment"
          class="msg-btn"
          :class="{ 'is-stalled': finalDraftStalled }"
          :disabled="busy && !finalDraftStalled"
          type="button"
          data-tooltip="停滞时可重试当前分段，已完成分段不会被重做"
          @click="emit('retry-final-draft-segment-with-provider', selectedProviderId)"
        >重试当前段</button>
        <button
          v-if="canResumeFinalDraft"
          class="msg-btn"
          :disabled="busy"
          type="button"
          @click="$emit('resume-final-draft')"
        >从检查点恢复</button>
      </div>
    </div>
    <div
      v-if="message.role === 'assistant' && props.chainBreakpoint"
      class="chat-breakpoint-status"
    >
      <div class="chat-breakpoint-title">
        <span class="chat-breakpoint-icon">⚠</span>
        <span>链式执行中断：第 {{ props.chainBreakpoint.step }} 步「{{ props.chainBreakpoint.skillId }}」失败</span>
      </div>
      <div class="chat-breakpoint-error">{{ props.chainBreakpoint.error }}</div>
      <div class="chat-breakpoint-actions">
        <button class="msg-btn" :disabled="busy" type="button" @click="$emit('resume-breakpoint')">从断点恢复</button>
        <button class="msg-btn" :disabled="busy" type="button" @click="$emit('discard-breakpoint')">放弃</button>
      </div>
    </div>
    <div class="message-actions" v-if="message.role === 'assistant'">
        <button class="msg-btn" :disabled="busy" data-tooltip="复制" @click="runAction('copy', message.content)">
          <AppIcon name="copy" :size="12" />
          <span>复制</span>
        </button>
        <button v-if="canContinue(message.continuation)" class="msg-btn continuation-btn" :disabled="busy" data-tooltip="继续生成" @click="runAction('continue')">续 <span>续生成</span></button>
        <button class="msg-btn" :disabled="busy" data-tooltip="重新生成" @click="runAction('regenerate')">
          <AppIcon name="refresh" :size="12" />
          <span>重生成</span>
        </button>
        <button class="msg-btn" :disabled="busy" data-tooltip="插入到光标处" @click="runAction('apply', message.content)">
          <AppIcon name="insert" :size="12" />
          <span>插入</span>
        </button>
        <button class="msg-btn" :disabled="busy" data-tooltip="整章替换为消息内容" @click="runAction('replace', message.content)">
          <AppIcon name="replace" :size="12" />
          <span>替换</span>
        </button>
        <span v-if="actionFeedback" class="action-feedback" role="status">{{ actionFeedback }}</span>
      </div>
      <RealSkillDiagnosticsPanel
        v-if="message.role === 'assistant' && message.skillRunDiagnostics && (message.skillRunDiagnostics.diagnostics?.length || message.skillRunDiagnostics.status === 'degraded')"
        :status="message.skillRunDiagnostics.status || 'success'"
        :diagnostics="message.skillRunDiagnostics.diagnostics"
        :request-messages="message.skillRunDiagnostics.requestMessages"
        :budget="message.skillRunDiagnostics.budget"
        :folder-package-cache="message.skillRunDiagnostics.folderPackageCache"
      />
    </div>
    <div
      v-if="message.role === 'assistant' && message.routingFallback"
      class="chat-routing-fallback"
    >
      <div class="chat-routing-title">未识别到明确执行意图</div>
      <div class="chat-routing-desc">{{ routingFallbackText }}</div>
      <div class="chat-routing-actions">
        <button class="msg-btn" :disabled="busy" type="button" @click="$emit('routing-continue')">按推荐技能继续</button>
        <details class="chat-routing-advanced">
          <summary>高级</summary>
          <button class="msg-btn" :disabled="busy" type="button" @click="$emit('routing-bypass')">本次直接全链执行</button>
        </details>
      </div>
    </div>
    <div
      v-if="message.role === 'assistant' && message.budgetExhausted"
      class="chat-routing-budget"
    >
      <div class="chat-routing-title">API 调用预算已用尽（{{ message.budgetExhausted.used }}/{{ message.budgetExhausted.limit }}）</div>
      <div class="chat-routing-desc">已保留链式断点，可追加预算后从断点继续。</div>
      <div class="chat-routing-actions">
        <button class="msg-btn" :disabled="busy" type="button" @click="$emit('budget-extend')">追加 4 次并继续</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useAiTaskStore } from '../../stores/aiTaskStore'
import { enhanceCodeBlocks } from '../../utils/markdownService'
import { renderMarkdown } from '../../utils/markdownService'
import { canContinue as isContinuationAvailable } from '../../services/continuation'
import type { EditorEditBatchCommand } from '../../services/editorEditProtocol'
import type { EditorBatchRecord } from '../../services/editorBatchRecord'
import type { ChatMessage as ChatMessageType } from '../../stores/chat'
import RealSkillDiagnosticsPanel from '../common/RealSkillDiagnosticsPanel.vue'
import AppIcon from '../common/AppIcon.vue'
import EditorDiffLayer from '../editor/EditorDiffLayer.vue'
import type { EditorDiffHunk } from '../../services/editorDiffHunks'

const props = defineProps<{
  message: { role: string; content: string; continuation?: unknown; editorBatch?: EditorEditBatchCommand; editorBatchRecord?: EditorBatchRecord; editorBatchDiff?: ChatMessageType['editorBatchDiff']; skillRunDiagnostics?: ChatMessageType['skillRunDiagnostics']; routingFallback?: ChatMessageType['routingFallback']; budgetExhausted?: ChatMessageType['budgetExhausted']; finalDraftTask?: ChatMessageType['finalDraftTask'] }
  busy?: boolean
  currentContentForDiff?: string
  providers?: Array<{ id: string; name: string; models?: string[]; selectedModel?: string; apiKey?: string }>
  chainBreakpoint?: { skillId: string; step: number; error: string; retryCount: number } | null
}>()
const aiTaskStore = useAiTaskStore()
const activeTask = computed(() => aiTaskStore.activeTask)
const actionFeedback = ref('')

const taskStateLabel = computed(() => {
  const labels: Record<string, string> = {
    planning: '规划中',
    acting: '执行中',
    reviewing: '审核中',
    completed: '已完成',
    failed: '失败',
    paused: '已暂停',
  }
  return labels[activeTask.value?.state || ''] || ''
})

function stepStatusIcon(status: string) {
  const icons: Record<string, string> = {
    pending: '待执行',
    running: '执行中',
    done: '已完成',
    failed: '失败',
    skipped: '已跳过',
  }
  return icons[status] || status
}

function canContinueSnapshot(value: unknown) {
  return Boolean(value && typeof value === 'object' && isContinuationAvailable(value as { status: 'none' | 'generating' | 'completed' | 'possibly_truncated' | 'interrupted' | 'failed' | 'user_stopped' | 'continuing'; accumulatedText: string }))
}

const canContinue = canContinueSnapshot
const finalDraftTask = computed(() => props.message.finalDraftTask)
const canContinueFinalDraft = computed(() =>
  finalDraftTask.value?.status === 'awaiting_continuation'
  || (finalDraftTask.value?.status === 'generating' && (finalDraftTask.value.activeSegmentIndex || 0) > 0)
  || finalDraftTask.value?.status === 'interrupted'
)
const canResumeFinalDraft = computed(() =>
  finalDraftTask.value?.status === 'generating' && (finalDraftTask.value.activeSegmentIndex || 0) > 0
)
const canRetryFinalDraftSegment = computed(() =>
  finalDraftTask.value?.status === 'generating'
  || finalDraftTask.value?.status === 'awaiting_continuation'
  || finalDraftTask.value?.status === 'interrupted'
)
const finalDraftStalled = computed(() =>
  (finalDraftTask.value?.status === 'generating'
    && finalDraftTask.value.lastTelemetry?.throughputStatus === 'stalled')
  || finalDraftTask.value?.status === 'interrupted'
)
const providerOptions = computed(() => {
  const current = finalDraftTask.value
  if (!finalDraftStalled.value || !current) return []
  const providers = (props.providers || []) as Array<{ id: string; name: string; models?: string[]; selectedModel?: string; apiKey?: string }>
  return providers
    .filter(provider => provider.apiKey)
    .map(provider => ({
      id: provider.id,
      name: provider.name,
      model: provider.selectedModel || provider.models?.[0] || '',
    }))
})
const selectedProviderId = ref('')
const finalDraftStatusLabel = computed(() => {
  const labels: Record<string, string> = {
    planning: '准备中',
    generating: '生成中',
    interrupted: '慢流中断',
    awaiting_continuation: '等待续生成',
    writing: '写入中',
    completed: '已写入',
    failed: '失败',
    rolled_back: '已回滚',
    canceled: '已取消',
  }
  return labels[finalDraftTask.value?.status || ''] || '未知状态'
})
const finalDraftStatusMeta = computed(() => {
  const task = finalDraftTask.value
  if (!task) return ''
  // Current sessions persist FinalDraftTaskView; legacy sessions may still hold
  // a full task, so read character counts without retaining document text.
  const draftChars = 'completedChars' in task
    ? task.completedChars || task.accumulatedChars
    : (task.completedText?.length || task.accumulatedText?.length || 0)
  const parts = [
    `源文 ${'sourceChars' in task ? task.sourceChars : (task.sourceContent?.length || 0)} 字`,
    `终稿 ${draftChars} 字`,
    `续生成 ${task.continuationCount} 次`,
  ]
  if (task.error) parts.push(task.error)
  return parts.join(' · ')
})
const contentRef = ref<HTMLElement | null>(null)
const emit = defineEmits<{
  copy: [string]
  regenerate: []
  replace: [string]
  apply: [string]
  continue: []
  rollback: []
  reveal: []
  'rollback-hunk': [index: number]
  'reveal-hunk': [hunk: EditorDiffHunk]
  'resume-task': []
  'pause-task': []
  'retry-step': []
  'resume-breakpoint': []
  'discard-breakpoint': []
  'routing-continue': []
  'routing-bypass': []
  'budget-extend': []
  'continue-final-draft': []
  'resume-final-draft': []
  'retry-final-draft-segment-with-provider': [providerId: string]
}>()

const canRollbackBatch = computed(() => props.message.editorBatchRecord?.status === 'applied' && props.message.editorBatchRecord?.undoAvailable === true)
const routingFallbackText = computed(() => {
  const fallback = props.message.routingFallback
  if (!fallback) return ''
  const routing = fallback.routing
  if (routing?.kind === 'ambiguous') {
    return `检测到多个可能意图：${routing.candidates.join('、')}。请确认后继续。`
  }
  return '未能识别意图，请补充写入或讨论说明'
})

function runAction(action: 'copy' | 'regenerate' | 'apply' | 'replace' | 'continue', content?: string) {
  if (props.busy) return
  if (action === 'copy') {
    actionFeedback.value = '已复制'
    window.setTimeout(() => { actionFeedback.value = '' }, 1400)
  }
  if (action === 'copy') emit('copy', content || '')
  else if (action === 'regenerate') emit('regenerate')
  else if (action === 'apply') emit('apply', content || '')
  else if (action === 'continue') emit('continue')
  else emit('replace', content || '')
}

const messageSource = computed(() => props.message.content || '')
const renderedContent = computed(() => renderMarkdown(messageSource.value))

watch(renderedContent, async () => {
  await nextTick()
  await enhanceCodeBlocks(contentRef.value)
}, { immediate: true })

watch(() => props.busy, (busy, previousBusy) => {
  if (previousBusy && !busy) {
    nextTick().then(() => enhanceCodeBlocks(contentRef.value))
  }
})
</script>

<style scoped>
.chat-message {
  display: flex;
  margin-bottom: 12px;
  content-visibility: auto;
  contain-intrinsic-size: auto 160px;
}
.chat-message.user {
  justify-content: flex-end;
}
.chat-message.assistant {
  justify-content: flex-start;
}
.message-bubble {
  width: fit-content;
  max-width: min(92%, 72ch);
  min-width: 0;
  box-sizing: border-box;
  padding: var(--space-5) var(--space-6);
  border-radius: var(--radius-lg);
  font-size: var(--font-size-lg);
  line-height: 1.75;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.message-bubble.user {
  background: var(--user-bubble);
  color: var(--text-primary);
}
.message-bubble.assistant {
  background: var(--ai-bubble);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}
.message-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-top: 8px;
  opacity: 0.6;
  transition: var(--transition-fast);
}
.message-bubble:hover .message-actions {
  opacity: 1;
}
.msg-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: var(--density-btn-sm-height);
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  border-radius: var(--radius-xs);
  padding: var(--space-2) var(--space-5);
  font-size: var(--font-size-sm);
  line-height: 1.3;
  white-space: nowrap;
  cursor: pointer;
}
.msg-btn:hover {
  background: var(--chat-action-bg-hover);
  color: var(--text-primary);
}
.msg-btn:disabled {
  cursor: wait;
  opacity: 0.5;
}
.action-feedback {
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  white-space: nowrap;
}

.message-content {
  max-width: 100%;
  min-width: 0;
  overflow: visible;
  word-break: break-word;
  user-select: text;
  cursor: text;
  font-family: var(--font-family-editor);
}

.chat-edit-command {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: 8px;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.chat-direct-write-badge {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 var(--space-2);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--success) 14%, transparent);
  color: var(--success);
  font-size: var(--font-size-xs);
  line-height: 1;
}

/* task status */
.chat-task-status { margin-top: 8px; padding: var(--space-4) var(--space-5); border-left: 3px solid var(--accent); background: var(--bg-secondary); font-size: var(--font-size-sm); }
.chat-task-title { display: flex; align-items: center; gap: var(--space-3); font-weight: 600; color: var(--text-primary); }
.chat-task-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chat-task-state { flex: 0 0 auto; font-weight: 400; font-size: var(--font-size-xs); }
.chat-task-state.acting { color: var(--accent); }
.chat-task-state.completed { color: var(--chat-status-success); }
.chat-task-state.failed { color: var(--chat-status-error); }
.chat-task-state.paused { color: var(--text-muted); }
.chat-task-steps { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); margin: var(--space-2) 0; }
.chat-task-step { font-size: var(--font-size-xs); color: var(--text-muted); }
.chat-task-step.done { color: var(--chat-status-success); }
.chat-task-step.failed { color: var(--chat-status-error); }
.chat-task-step.running { color: var(--accent); font-weight: 500; }
.chat-task-step.stalled { color: var(--warning); font-weight: 600; }
.chat-final-draft-stalled-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); margin: var(--space-2) 0; }
.chat-final-draft-hint { color: var(--text-secondary); font-size: var(--font-size-xs); }
.chat-final-draft-provider-select { max-width: 100%; padding: 4px 8px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-secondary); color: var(--text-primary); font-size: var(--font-size-sm); }
.msg-btn.is-stalled { border-color: var(--warning); }
.chat-task-actions { display: flex; gap: var(--space-2); margin-top: 4px; }
.chat-breakpoint-status { margin-top: 8px; padding: var(--space-4) var(--space-5); border-left: 3px solid var(--chat-status-error); background: var(--bg-secondary); font-size: var(--font-size-sm); }
.chat-routing-fallback, .chat-routing-budget { margin-top: 8px; padding: var(--space-4) var(--space-5); border-left: 3px solid var(--accent); background: var(--bg-secondary); font-size: var(--font-size-sm); }
.chat-routing-title { font-weight: 600; color: var(--text-primary); }
.chat-routing-desc { margin: var(--space-2) 0; color: var(--text-muted); }
.chat-routing-actions { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.chat-routing-advanced summary { color: var(--text-muted); cursor: pointer; font-size: var(--font-size-xs); }
.chat-routing-advanced[open] { display: contents; }
.chat-breakpoint-title { display: flex; align-items: center; gap: var(--space-3); font-weight: 600; color: var(--chat-status-error); }
.chat-breakpoint-error { margin: var(--space-2) 0; color: var(--text-muted); font-size: var(--font-size-xs); }
.chat-breakpoint-actions { display: flex; gap: var(--space-2); }
.chat-locate-candidates { margin-top: 8px; padding: var(--space-3) var(--space-5); border-left: 3px solid var(--accent); background: var(--bg-secondary); font-size: var(--font-size-sm); }
.chat-locate-candidates-title { font-weight: 600; color: var(--text-primary); margin-bottom: 4px; }
.chat-locate-candidate { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-1) 0; cursor: pointer; }
.chat-locate-candidate:hover { color: var(--accent); }
.chat-locate-candidate-similarity { color: var(--text-muted); font-size: var(--font-size-xs); flex: 0 0 auto; }
</style>
