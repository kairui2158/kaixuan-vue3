<template>
  <div class="chat-message" :class="message.role">
    <div class="message-bubble" :class="message.role">
      <div ref="contentRef" class="message-content" v-html="renderedContent"></div>
      <div
        v-if="message.role === 'assistant' && message.editorBatch && message.editorBatchRecord"
        class="chat-edit-command"
        title="API 已直接写入编辑器，可通过批次记录回滚"
      >
        已写入编辑器：{{ message.editorBatch.commands.length }} 条
        <span class="chat-direct-write-badge">可回滚</span>
        <button
          v-if="canRollbackBatch"
          class="msg-btn"
          :disabled="busy"
          type="button"
          title="恢复该批次应用前的内容"
          @click="$emit('rollback')"
        >回滚此批次</button>
        <button
          class="msg-btn"
          type="button"
          title="在编辑器中定位首处变更"
          @click="$emit('reveal')"
        >查看位置</button>
      </div>
      <div
        v-if="message.role === 'assistant' && message.editorToolPlan?.steps?.length"
        class="chat-tool-plan"
      >
        <div class="chat-tool-plan-title">AI 执行计划：{{ message.editorToolPlan.stage }}</div>
        <ol class="chat-tool-plan-steps">
          <li v-for="(step, index) in message.editorToolPlan.steps" :key="index">{{ step }}</li>
       </ol>
     </div>
      <div
        v-if="message.role === 'assistant' && message.toolCallStream?.length"
        class="chat-tool-stream"
      >
        <div class="chat-tool-stream-title" @click="toolStreamExpanded = !toolStreamExpanded">
          <span>工具调用过程</span>
          <span class="chat-tool-stream-count">{{ message.toolCallStream.length }} 步</span>
        </div>
        <ol v-if="toolStreamExpanded" class="chat-tool-stream-list">
          <li
            v-for="(ev, idx) in message.toolCallStream"
            :key="idx"
            :class="['tool-stream-item', ev.type]"
          >
            <span class="tool-stream-icon">{{ ev.ok ? '✓' : '✗' }}</span>
            <span class="tool-stream-name">{{ ev.toolName }}</span>
            <span class="tool-stream-desc">{{ ev.stepDescription }}</span>
            <span class="tool-stream-time">{{ ev.iteration }}轮</span>
          </li>
       </ol>
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
        <button class="msg-btn" :disabled="busy" title="复制" @click="runAction('copy', message.content)">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          <span>复制</span>
        </button>
        <button v-if="canContinue(message.continuation)" class="msg-btn continuation-btn" :disabled="busy" title="继续生成" @click="runAction('continue')">续 <span>续生成</span></button>
        <button class="msg-btn" :disabled="busy" title="重新生成" @click="runAction('regenerate')">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
          <span>重生成</span>
        </button>
        <button class="msg-btn" :disabled="busy" title="插入到光标处" @click="runAction('apply', message.content)">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          <span>插入</span>
        </button>
        <button class="msg-btn" :disabled="busy" title="整章替换为消息内容" @click="runAction('replace', message.content)">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M3 16v5h5"/><path d="M16 21h5v-5"/>
          </svg>
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
import type { EditorToolPlan } from '../../stores/chat'
import type { ToolCallStreamEvent } from '../../stores/chat'
import type { ChatMessage as ChatMessageType } from '../../stores/chat'
import RealSkillDiagnosticsPanel from '../common/RealSkillDiagnosticsPanel.vue'

const props = defineProps<{
  message: { role: string; content: string; continuation?: unknown; editorBatch?: EditorEditBatchCommand; editorBatchRecord?: EditorBatchRecord; editorToolPlan?: EditorToolPlan; toolCallStream?: ToolCallStreamEvent[]; skillRunDiagnostics?: ChatMessageType['skillRunDiagnostics']; routingFallback?: ChatMessageType['routingFallback']; budgetExhausted?: ChatMessageType['budgetExhausted'] }
  busy?: boolean
  chainBreakpoint?: { skillId: string; step: number; error: string; retryCount: number } | null
}>()
const aiTaskStore = useAiTaskStore()
const activeTask = computed(() => aiTaskStore.activeTask)
const actionFeedback = ref('')
const toolStreamExpanded = ref(true)

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
const contentRef = ref<HTMLElement | null>(null)
const emit = defineEmits<{
  copy: [string]
  regenerate: []
  replace: [string]
  apply: [string]
  continue: []
  rollback: []
  reveal: []
  'resume-task': []
  'pause-task': []
  'retry-step': []
  'resume-breakpoint': []
  'discard-breakpoint': []
  'routing-continue': []
  'routing-bypass': []
  'budget-extend': []
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
  min-height: 30px;
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
  border-radius: var(--radius-sm, 4px);
  background: color-mix(in srgb, var(--success, #2f855a) 14%, transparent);
  color: var(--success, #2f855a);
  font-size: var(--font-size-xs, 12px);
  line-height: 1;
}

.chat-tool-plan {
  margin-top: 8px;
  padding: var(--space-4) var(--space-5);
  border-left: 3px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.chat-tool-plan-title {
  margin-bottom: 4px;
  font-weight: 600;
  color: var(--text-primary);
}

.chat-tool-plan-steps {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: var(--space-1);
}
.chat-tool-stream {
  margin-top: 8px;
  padding: var(--space-3) var(--space-5);
  border-left: 3px solid var(--accent);
  background: var(--bg-secondary);
  font-size: var(--font-size-sm);
}
.chat-tool-stream-title {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  cursor: pointer;
  font-weight: 600;
  color: var(--text-primary);
}
.chat-tool-stream-count {
  color: var(--text-muted);
  font-weight: 400;
}
.chat-tool-stream-list {
  margin: var(--space-2) 0 0;
  padding-left: 18px;
  display: grid;
  gap: var(--space-1);
}
.tool-stream-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.tool-stream-item.tool_error { color: var(--chat-status-error); }
.tool-stream-icon { flex: 0 0 auto; }
.tool-stream-name { font-weight: 500; }
.tool-stream-desc { color: var(--text-muted); flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tool-stream-time { color: var(--text-muted); font-size: var(--font-size-xs); flex: 0 0 auto; }
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
