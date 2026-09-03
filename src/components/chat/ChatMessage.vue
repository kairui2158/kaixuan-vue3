<template>
  <div class="chat-message" :class="message.role">
    <div class="message-bubble" :class="message.role">
      <div ref="contentRef" class="message-content" v-html="renderedContent"></div>
      <div
        v-if="message.role === 'assistant' && message.editorBatch"
        class="chat-edit-command"
        title="已识别为待确认的批量编辑"
      >
        已识别批量编辑：{{ message.editorBatch.commands.length }} 条
        <button class="msg-btn" :disabled="busy" type="button" @click="$emit('preview')">预览修改</button>
        <button
          v-if="canRollbackBatch"
          class="msg-btn"
          :disabled="busy"
          type="button"
          title="恢复该批次应用前的内容"
          @click="$emit('rollback')"
        >回滚此批次</button>
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useAiTaskStore } from '../../stores/aiTaskStore'
import { enhanceCodeBlocks } from '../../utils/markdownService'
import { useThrottledMarkdown } from '../../utils/throttledMarkdown'
import { canContinue as isContinuationAvailable } from '../../services/continuation'
import type { EditorEditBatchCommand } from '../../services/editorEditProtocol'
import type { EditorBatchRecord } from '../../services/editorBatchRecord'
import type { EditorToolPlan } from '../../stores/chat'
import type { ToolCallStreamEvent } from '../../stores/chat'

const props = defineProps<{
  message: { role: string; content: string; continuation?: unknown; editorBatch?: EditorEditBatchCommand; editorBatchRecord?: EditorBatchRecord; editorToolPlan?: EditorToolPlan; toolCallStream?: ToolCallStreamEvent[] }
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
  preview: []
  rollback: []
  'resume-task': []
  'pause-task': []
  'retry-step': []
  'resume-breakpoint': []
  'discard-breakpoint': []
}>()

const canRollbackBatch = computed(() => props.message.editorBatchRecord?.status === 'applied' && props.message.editorBatchRecord?.undoAvailable === true)

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
const { content: renderedContent, flush: flushRenderedContent } = useThrottledMarkdown(messageSource)

watch(renderedContent, async () => {
  await nextTick()
  await enhanceCodeBlocks(contentRef.value)
}, { immediate: true })

watch(() => props.busy, (busy, previousBusy) => {
  if (previousBusy && !busy) flushRenderedContent()
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
  gap: 4px;
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
  gap: 5px;
  min-height: 30px;
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  border-radius: var(--radius-xs);
  padding: 4px 10px;
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
}

.chat-edit-command {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.chat-tool-plan {
  margin-top: 8px;
  padding: 8px 10px;
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
  gap: 2px;
}
.chat-tool-stream {
  margin-top: 8px;
  padding: 6px 10px;
  border-left: 3px solid var(--accent, #4a9);
  background: var(--bg-secondary);
  font-size: var(--font-size-sm);
}
.chat-tool-stream-title {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-weight: 600;
  color: var(--text-primary);
}
.chat-tool-stream-count {
  color: var(--text-muted);
  font-weight: 400;
}
.chat-tool-stream-list {
  margin: 4px 0 0;
  padding-left: 18px;
  display: grid;
  gap: 2px;
}
.tool-stream-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.tool-stream-item.tool_error { color: var(--chat-status-error, #e54); }
.tool-stream-icon { flex: 0 0 auto; }
.tool-stream-name { font-weight: 500; }
.tool-stream-desc { color: var(--text-muted); flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tool-stream-time { color: var(--text-muted); font-size: var(--font-size-xs); flex: 0 0 auto; }
/* task status */
.chat-task-status { margin-top: 8px; padding: 8px 10px; border-left: 3px solid var(--accent, #4a9); background: var(--bg-secondary); font-size: var(--font-size-sm); }
.chat-task-title { display: flex; align-items: center; gap: 6px; font-weight: 600; color: var(--text-primary); }
.chat-task-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chat-task-state { flex: 0 0 auto; font-weight: 400; font-size: var(--font-size-xs); }
.chat-task-state.acting { color: var(--accent, #4a9); }
.chat-task-state.completed { color: var(--chat-status-success, #4a9); }
.chat-task-state.failed { color: var(--chat-status-error, #e54); }
.chat-task-state.paused { color: var(--text-muted); }
.chat-task-steps { display: flex; flex-wrap: wrap; gap: 4px 8px; margin: 4px 0; }
.chat-task-step { font-size: var(--font-size-xs); color: var(--text-muted); }
.chat-task-step.done { color: var(--chat-status-success, #4a9); }
.chat-task-step.failed { color: var(--chat-status-error, #e54); }
.chat-task-step.running { color: var(--accent, #4a9); font-weight: 500; }
.chat-task-actions { display: flex; gap: 4px; margin-top: 4px; }
.chat-breakpoint-status { margin-top: 8px; padding: 8px 10px; border-left: 3px solid var(--chat-status-error, #e54); background: var(--bg-secondary); font-size: var(--font-size-sm); }
.chat-breakpoint-title { display: flex; align-items: center; gap: 6px; font-weight: 600; color: var(--chat-status-error, #e54); }
.chat-breakpoint-error { margin: 4px 0; color: var(--text-muted); font-size: var(--font-size-xs); }
.chat-breakpoint-actions { display: flex; gap: 4px; }
.chat-locate-candidates { margin-top: 8px; padding: 6px 10px; border-left: 3px solid var(--accent, #4a9); background: var(--bg-secondary); font-size: var(--font-size-sm); }
.chat-locate-candidates-title { font-weight: 600; color: var(--text-primary); margin-bottom: 4px; }
.chat-locate-candidate { display: flex; align-items: center; gap: 6px; padding: 2px 0; cursor: pointer; }
.chat-locate-candidate:hover { color: var(--accent, #4a9); }
.chat-locate-candidate-similarity { color: var(--text-muted); font-size: var(--font-size-xs); flex: 0 0 auto; }
</style>
