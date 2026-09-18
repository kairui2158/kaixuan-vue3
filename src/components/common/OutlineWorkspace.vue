<template>
  <div id="outline-workspace" class="ow-overlay" :style="{ zIndex: modalQueue.getZIndex('outline-workspace') }" @click.self="$emit('close')">
    <div class="ow-content" :class="{ 'ows-fullscreen': isFullscreen }">
      <div class="ow-header">
        <span>大纲工作台</span>
        <div class="ow-config-bar">
          <label class="ow-config-label" for="ow-agent-select">智能体</label>
          <select id="ow-agent-select" v-model="workspaceAgentId" class="select-standard" @change="handleAgentChange">
            <option value="">不使用</option>
            <option v-for="agent in agentStore.agents" :key="agent.id" :value="agent.id">{{ agent.name }}</option>
          </select>
          <label class="ow-config-label" for="ow-skill-select">技能</label>
          <select id="ow-skill-select" v-model="selectedSkillId" class="select-standard ow-skill-select" @change="addSelectedSkill">
            <option value="">无</option>
            <option v-for="skill in skillStore.skills" :key="skill.id" :value="skill.id">{{ skillStore.displaySkillName(skill) }}</option>
          </select>
          <label class="ow-config-label" for="ow-skill-mode">模式</label>
          <select id="ow-skill-mode" v-model="workspaceSkillMode" class="select-standard ow-mode-select" @change="handleModeChange">
            <option value="compose">并行</option>
            <option value="chain">串行</option>
          </select>
        </div>
        <div class="ow-header-right">
          <button
            id="btn-ow-zoom"
            class="ow-icon-btn"
            :title="isFullscreen ? '缩小' : '放大'"
            @click="isFullscreen = !isFullscreen"
          >
            <svg
              v-if="!isFullscreen"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M8 3H5a2 2 0 0 0-2 2v3"></path>
              <path d="M21 8V5a2 2 0 0 0-2-2h-3"></path>
              <path d="M3 16v3a2 2 0 0 0 2 2h3"></path>
              <path d="M16 21h3a2 2 0 0 0 2-2v-3"></path>
            </svg>
            <svg
              v-else
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M8 3H5a2 2 0 0 0-2 2v3"></path>
              <path d="M13 3h6a2 2 0 0 1 2 2v6"></path>
              <path d="M3 13v6a2 2 0 0 0 2 2h6"></path>
              <path d="M13 13h8v8h-8z"></path>
            </svg>
          </button>
          <button id="btn-ai-co-create" class="ow-chat-toggle" @click="chatAreaOpen = !chatAreaOpen">
            AI 共创大纲
          </button>
          <button id="btn-close-outline-workspace" class="modal-close" @click="$emit('close')">x</button>
        </div>
      </div>
      <div class="ow-body">
        <div class="ow-editor">
          <div class="ow-editor-header">
            <span>大纲编辑器</span>
            <div class="editor-toolbar">
              <div class="editor-toolbar-group">
                <button id="btn-ow-undo" class="btn-sm btn-secondary" title="撤销" @click="editCommand('undo')">撤销</button>
                <button id="btn-ow-redo" class="btn-sm btn-secondary" title="重做" @click="editCommand('redo')">重做</button>
                <button id="btn-ow-copy" class="btn-sm btn-secondary" title="复制选中文本" @click="copySelection">复制</button>
                <button id="btn-ow-cut" class="btn-sm btn-secondary" title="剪切选中文本" @click="editCommand('cut')">剪切</button>
                <button id="btn-ow-run-trace" class="btn-sm btn-secondary" title="查看大纲工作台运行记录" @click="showRunTrace = true">运行记录</button>
                <button id="btn-ow-paste" class="btn-sm btn-secondary" title="粘贴剪贴板文本" @click="pasteText">粘贴</button>
                <button id="btn-ow-find" class="btn-sm btn-secondary" title="查找正文" @click="findOpen = !findOpen">查找</button>
                <button id="btn-export-outline-md" class="btn-sm btn-secondary ow-export-btn" @click="exportMd">.md</button>
                <button id="btn-export-outline-txt" class="btn-sm btn-secondary ow-export-btn" @click="exportTxt">.txt</button>
              </div>
            </div>
            <span id="ow-word-count" class="word-count">{{ (projectStore.outlineText || '').length }} 字</span>
          </div>
          <div v-if="findOpen" id="ow-find-bar" class="ow-find-bar">
            <input id="ow-find-input" ref="findRef" v-model="findQuery" class="ow-find-input" placeholder="查找正文..." @keydown.enter="findNext" />
            <span id="ow-find-result" class="ow-find-result">{{ findResult }}</span>
            <button id="btn-ow-find-prev" class="btn-sm btn-secondary" title="上一个匹配" @click="findPrevious">上一个</button>
            <button id="btn-ow-find-next" class="btn-sm btn-secondary" title="下一个匹配" @click="findNext">下一个</button>
            <button id="btn-ow-find-close" class="btn-sm btn-secondary" title="关闭查找" @click="closeFind">关闭</button>
          </div>
          <textarea
            id="outline-editor"
            ref="editorRef"
            v-model="projectStore.outlineText"
            class="ow-textarea"
            placeholder="在此输入或编辑你的小说大纲..."
            :readonly="projectStore.outlineLocked"
            :class="{ 'ow-readonly': projectStore.outlineLocked }"
            @beforeinput="handleEditorBeforeInput"
          ></textarea>
          <div ref="outlineViewportMirror" class="ow-viewport-mirror" aria-hidden="true"></div>
          <div ref="outlineViewportHighlight" class="ow-viewport-highlight-layer" aria-hidden="true"></div>
        </div>
        <div v-show="chatAreaOpen" class="ow-chat">
          <div id="ow-chat-messages" ref="msgContainer" class="ow-messages">
            <div v-if="compatibilityNotice" id="ow-compatibility-notice" class="ow-msg assistant">
              <div class="ow-msg-bubble">{{ compatibilityNotice }}</div>
            </div>
            <div v-for="(msg, i) in messages" :key="i" class="ow-msg" :class="msg.role">
              <div class="ow-msg-bubble" v-html="renderMarkdown(msg.content)"></div>
              <div
                v-if="msg.role === 'assistant' && msg.routingFallback"
                class="ow-routing-fallback"
              >
                <div class="ow-routing-title">未识别到明确执行意图</div>
                <div class="ow-routing-desc">{{ outlineRoutingText(msg) }}</div>
                <div class="ow-routing-actions">
                  <button class="msg-btn" :disabled="isGenerating" @click="continueOutlineRouting(i)">按推荐技能继续</button>
                  <details class="ow-routing-advanced">
                    <summary>高级</summary>
                    <button class="msg-btn" :disabled="isGenerating" @click="bypassOutlineRouting(i)">本次直接全链执行</button>
                  </details>
                </div>
              </div>
              <div
                v-if="msg.role === 'assistant' && msg.budgetExhausted"
                class="ow-routing-fallback ow-routing-budget"
              >
                <div class="ow-routing-title">API 调用预算已用尽（{{ msg.budgetExhausted.used }}/{{ msg.budgetExhausted.limit }}）</div>
                <div class="ow-routing-desc">已保留链式断点，可追加预算后从断点继续。</div>
                <div class="ow-routing-actions">
                  <button class="msg-btn" :disabled="isGenerating" @click="extendOutlineBudget(i)">追加 4 次并继续</button>
                </div>
              </div>
              <RealSkillDiagnosticsPanel
                v-if="msg.role === 'assistant' && msg.skillRunDiagnostics"
                :status="msg.skillRunDiagnostics.status"
                :diagnostics="msg.skillRunDiagnostics.diagnostics"
                :request-messages="msg.skillRunDiagnostics.requestMessages"
                :budget="msg.skillRunDiagnostics.budget"
                :folder-package-cache="msg.skillRunDiagnostics.folderPackageCache"
              />
              <div
                v-if="msg.role === 'assistant' && msg.outlineToolPlan?.steps?.length"
                class="ow-tool-plan"
              >
                <div class="ow-tool-plan-title">AI 执行计划：{{ msg.outlineToolPlan.stage }}</div>
                <ol class="ow-tool-plan-steps">
                  <li v-for="(step, stepIndex) in msg.outlineToolPlan.steps" :key="stepIndex">{{ step }}</li>
                </ol>
              </div>
              <div
                v-if="msg.role === 'assistant' && msg.outlineCompatibilityMode"
                class="ow-compatibility-mode"
              >
                <span class="ow-compatibility-mode-title">兼容模式：定位可靠性较低</span>
                <span class="ow-compatibility-mode-desc">当前供应商未启用原生工具调用。请在修改命令中使用结构锚点（卷/章/节标题）或更长的唯一原文片段。</span>
              </div>
              <div v-if="msg.role === 'assistant'" class="ow-msg-actions">
                <button class="msg-btn" title="复制" @click="copyMsg(msg.content)">复制</button>
                <button class="msg-btn" title="替换整个大纲" @click="replaceOutline(msg.content)">替换</button>
              <button class="msg-btn" title="重新生成该回复" @click="regenerateMsg(i)">重生成</button>
              <button class="msg-btn" title="插入到光标处" @click="insertAtCursor(msg.content)">插入</button>
              <button
                v-if="msg.outlineBatchRecord?.status === 'applied' && msg.outlineBatchRecord?.undoAvailable === true"
                class="msg-btn"
                :disabled="isGenerating"
                title="恢复该批次应用前的大纲内容"
                @click="rollbackOutlineBatch(i)"
              >回滚批次</button>
              <button
                v-if="msg.outlineBatchRecord?.status === 'applied'"
                class="msg-btn"
                :disabled="isGenerating"
                title="在大纲编辑器中定位首处变更"
                @click="revealOutlineBatch(i)"
              >查看位置</button>
              <span v-if="msg.outlineToolCallStream?.length" class="ow-tool-stream-toggle" @click="toggleToolStream(i)">工具过程 ({{ msg.outlineToolCallStream.length }})</span>
              <div v-if="msg.outlineToolCallStream?.length && toolStreamOpen[i]" class="ow-tool-stream">
                <div v-for="(ev, idx) in msg.outlineToolCallStream" :key="idx" class="ow-tool-stream-item" :class="ev.type">
                  <span class="ow-tool-stream-icon">{{ ev.ok ? '✓' : '✗' }}</span>
                  <span class="ow-tool-stream-name">{{ ev.toolName }}</span>
                  <span class="ow-tool-stream-desc">{{ ev.stepDescription }}</span>
                </div>
              </div>
              <button
                  v-if="msg.continuation && canContinue(msg.continuation)"
                  class="msg-btn"
                  :disabled="isGenerating"
                  title="从中断位置继续生成"
                  @click="continueOutlineMessage(i)"
                >续生成</button>
              </div>
            </div>
            <div v-if="isGenerating" id="ow-streaming-message" class="ow-msg assistant ow-msg-streaming">
              <div class="ow-streaming-status">{{ generationStatus }}<span v-if="streamingContent"> · {{ streamingContent.length }} 字</span></div>
              <div v-if="liveToolStream.length" class="ow-tool-stream">
                <div v-for="(ev, idx) in liveToolStream" :key="'live-' + idx" class="ow-tool-stream-item" :class="ev.type">
                  <span class="ow-tool-stream-icon">{{ ev.ok ? '✓' : '✗' }}</span>
                  <span class="ow-tool-stream-name">{{ ev.toolName }}</span>
                  <span class="ow-tool-stream-desc">{{ ev.stepDescription }}</span>
                </div>
              </div>
              <div class="ow-msg-bubble" v-html="streamingRenderedContent || '正在等待 API 返回...'"></div>
            </div>
          </div>
          <div class="ow-input-row">
            <ApiChatInput
              v-model="inputText"
              placeholder="和AI讨论大纲..."
              :send-disabled="isGenerating"
              send-label="发送"
              :show-cancel="isGenerating"
              cancel-label="取消生成"
              show-reset
              reset-label="重置对话"
              input-id="ow-chat-input"
              send-id="btn-ow-send"
              cancel-id="btn-ow-cancel-generation"
              reset-id="btn-ow-reset-conversation"
              @send="sendMessage"
              @cancel="cancelGeneration"
              @reset="resetConversation"
            />
          </div>
        </div>
      </div>
      <div class="ow-footer">
        <div class="ow-footer-config">
          <div v-if="selectedWorkspaceSkills.length" id="ow-selected-skills" class="ow-selected-skills">
            <span
              v-for="(skill, index) in selectedWorkspaceSkills"
              :key="skill.id"
              class="ow-skill-chip"
            >
              <span class="ow-skill-seq">{{ index + 1 }}</span>
              <span class="ow-skill-name">{{ skillStore.displaySkillName(skill) }}</span>
              <select
                v-if="workspaceSkillMode === 'chain'"
                v-model="workspaceSkillAgents[`0-${skill.id}`]"
                class="ow-chip-agent"
                title="当前技能绑定的智能体"
                @change="handleSkillAgentChange(skill.id, ($event.target as HTMLSelectElement).value)"
              >
                <option value="">默认</option>
                <option v-for="agent in agentStore.agents" :key="agent.id" :value="agent.id">{{ agent.name }}</option>
              </select>
              <button class="ow-chip-close" title="移除技能" @click="removeSelectedSkill(index)">&times;</button>
            </span>
          </div>
          <button id="btn-import-outline" class="btn-secondary btn-import" @click="triggerImport">
            从文件导入(.txt/.md/.rtf/.docx)
          </button>
        </div>
        <input
          ref="fileInput"
          type="file"
          accept=".txt,.md,.text,.rtf,.docx"
          style="display:none"
          @change="handleImport"
        />
        <button id="btn-save-outline" class="btn-primary" @click="saveOutline">保存大纲到本地</button>
        <span v-if="saveFeedback" class="save-feedback">{{ saveFeedback }}</span>
        <button
          id="btn-lock-outline"
          class="btn-primary"
          :disabled="!projectStore.hasOutline"
          @click="handleLockOutline()"
        >
          {{ projectStore.outlineLocked ? '已锁定大纲' : '确认大纲，锁定并进入创作' }}
        </button>
        <button
          v-if="projectStore.outlineLocked"
          id="btn-unlock-outline"
          class="btn-secondary"
          title="解锁后可继续编辑，修改内容需要重新确认才能进入流水线"
          @click="handleUnlockOutline"
        >
          解锁编辑
        </button>
      </div>
      <div class="ow-resize-handle"></div>
    </div>
  </div>
  <RunTracePanel :visible="showRunTrace" default-source="outline" @close="showRunTrace = false" />
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useModalQueue } from '../../composables/useModalQueue'
import { useRunTraceStore, type RunTraceMessage, type RunTraceStatus } from '../../stores/runTrace'
import { useProjectStore } from '../../stores/project'
import { useProviderStore } from '../../stores/provider'
import { usePipelineStore } from '../../stores/pipeline'
import { useSkillStore } from '../../stores/skill'
import { useAgentStore } from '../../stores/agent'
import { migrateSkillAgentBindings } from '../../services/skillAgentBinding'
import { createRoutingAwaitState, inferRoutingFallbackIntent, resolvePostProcessTerminalStatus, runWorkspaceSkills, validateRoutingResumeToken, type ChainRoutingEvent, type WorkspaceSkillEngineAdapter, type WorkspaceSkillRunMeta, type WorkspaceSkillTemplate } from '../../services/workspaceSkillEngine'
import type { ChainIntent, ChainRoutingResult } from '../../services/chainIntentRouter'
import {
  authorizeDialogueTools,
  buildDialogueToolSurface,
  type DialogueToolSurfaceSummary,
  type ToolResult,
} from '../../services/dialogueToolSurface'
import { classifyPlainDialogueIntent, type PlainDialogueIntent } from '../../services/plainDialogueIntent'
import RealSkillDiagnosticsPanel from './RealSkillDiagnosticsPanel.vue'
import RunTracePanel from './RunTracePanel.vue'
import ApiChatInput from './ApiChatInput.vue'
import { createApiCallBudget, type ApiCallBudget } from '../../services/apiCallBudget'
import { importFile } from '../../services/file-import'
import { useAiTools } from '../../composables/useAiTools'
import { useAiCallTrace } from '../../composables/useAiCallTrace'
import { useAppConfirm } from '../../composables/useAppConfirm'
import { getAiService, type PhysicalCallEvent } from '../../services/aiService'
import { conversationContextService, resolveModelContextWindow } from '../../services/conversationContextService'
import { parseOutlineStructure } from '../../services/outlineStructure'
import { canContinue, continuationStatusFor, type ContinuationSnapshot } from '../../services/continuation'
import { buildContinuationMessages, continueSnapshot } from '../../services/continuationService'
import { classifyRunOutcome } from '../../services/generationValidity'
import { slimContinuationMessages } from '../../services/continuationSlim'
import { saveContinuation, loadContinuation, removeContinuation } from '../../services/continuationStorage'
import { logEditorEdit, logEditorPresentation } from '../../services/editorEditDiagnostics'
import type { EditorEditCommand } from '../../services/editorEditProtocol'
import { validateOutlineIntegrity } from '../../services/outlineIntegrity'
import { canRollbackEditorBatch, createEditorBatchRecord, findEditorBatchUndoContent, normalizeEditorBatchRecord, toDialogueBatchEvent, updateEditorBatchRecord } from '../../services/editorBatchRecord'
import type { EditorBatchRecord } from '../../services/editorBatchRecord'
import { createEditorTargetSnapshot } from '../../services/editorTarget'
import { createOutlineTools } from '../../services/outlineTools'
import {
  createToolRunSupervisor,
  DIRECT_TOOL_RUN_HARD_DEADLINE_MS,
  DIRECT_TOOL_RUN_IDLE_TIMEOUT_MS,
  type ToolRunSupervisor,
} from '../../services/toolRunSupervisor'
import type { EditorToolPlan } from '../../stores/chat'
import type { ContextMessage } from '../../types/context'
import { enhanceCodeBlocks, renderMarkdown as renderMarkdownText } from '../../utils/markdownService'
import { useThrottledMarkdown } from '../../utils/throttledMarkdown'
import { extractJsonArray } from '../../services/jsonExtraction'
import { createTextareaViewport, type EditorViewport } from '../../services/editorViewport'

const emit = defineEmits<{ close: []; navigate: [target: string] }>()

const projectStore = useProjectStore()
const appConfirm = useAppConfirm()
const providerStore = useProviderStore()
const pipelineStore = usePipelineStore()
const skillStore = useSkillStore()
const agentStore = useAgentStore()
const runTraceStore = useRunTraceStore()
const { callAi } = useAiTools()

const modalQueue = useModalQueue()
onMounted(() => modalQueue.open('outline-workspace'))
onUnmounted(() => modalQueue.close('outline-workspace'))

const messages = computed(() => projectStore.outlineChat)
const inputText = ref('')
const pendingOutlineDirectWrite = ref<{ batch: { type: 'editor_edit_batch'; version: 1; commands: EditorEditCommand[]; reason?: string }; record: EditorBatchRecord } | null>(null)
let outlineFailedWriteBatch: {
  workspace: string
  targetId: string
  contentVersion: number
  commands: EditorEditCommand[]
  succeededIndexes: number[]
} | null = null
const msgContainer = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const editorRef = ref<HTMLTextAreaElement | null>(null)
const outlineViewportMirror = ref<HTMLDivElement | null>(null)
const outlineViewportHighlight = ref<HTMLDivElement | null>(null)
let outlineViewport: EditorViewport | null = null
const chatAreaOpen = ref(false)
const isFullscreen = ref(false)
const saveFeedback = ref('')
const lastUserRequest = ref('')
const compatibilityNotice = ref('')
const showRunTrace = ref(false)

const OUTLINE_WORKSPACE_ID = 'outline'
const OUTLINE_SESSION_ID = 'outline'
let lastWorkspaceSkillMeta: WorkspaceSkillRunMeta | null = null
let outlineRunTurnId: string | null = null
let outlineSessionProjectId = ''
let outlineApiBudget: ApiCallBudget | null = null

function recordOutlineRoutingEvent(event: ChainRoutingEvent) {
  if (event.type === 'routing_started') {
    addOutlineTraceEvent({ type: 'routing-started', label: '开始意图路由', detail: event.requestText })
  } else if (event.type === 'routing_result') {
    const routing = event.result
    if (
      routing.kind === 'matched' &&
      outlineRunTraceId &&
      outlineRunTurnId
    ) {
      const matchedIntent = routing.intent
      const reroutedSurface = createWorkspaceSkillAdapter().buildTools?.({
        intent: matchedIntent,
        stage: 0,
        mode: workspaceSkillMode.value === 'chain' ? 'chain' : 'compose',
      })
      const reroutedToolSurface = reroutedSurface?.tools || []
      const authorizedSurface = authorizeDialogueTools(
        reroutedToolSurface,
        matchedIntent,
      )
      runTraceStore.updateTurnIntent(outlineRunTraceId, outlineRunTurnId, {
        intent: matchedIntent,
        routingFallback: 'none',
        toolSurface: reroutedToolSurface.map(tool => ({
          name: tool.name,
          policy: tool.policy || 'read' as const,
        })),
        actualToolSurface: authorizedSurface.actualToolSurface,
      })
    }
    addOutlineTraceEvent({
      type: 'routing-result',
      label: `意图路由结果：${routing.kind}`,
      detail: `${routing.reason}${'fallbackMode' in routing ? ` | fallback=${routing.fallbackMode}` : ''}`
    })
    if (
      routing.kind !== 'matched' &&
      outlineRunTraceId &&
      outlineRunTurnId
    ) {
      runTraceStore.updateTurnIntent(outlineRunTraceId, outlineRunTurnId, {
        routingFallback: routing.fallbackMode,
      })
    }
  } else if (event.type === 'skill_skipped') {
    addOutlineTraceEvent({
      type: 'skill-skipped',
      label: `跳过技能：${event.skillId}`,
      detail: event.reason
    })
  } else if (event.type === 'chain_handoff') {
    addOutlineTraceEvent({
      type: 'chain-handoff',
      level: event.artifact.repeatedHashCount ? 'warn' : 'info',
      label: `链式步骤 Handoff：${event.artifact.sourceSkillId}`,
      detail: JSON.stringify(event.artifact)
    })
  } else if (event.type === 'budget_exhausted') {
    addOutlineTraceEvent({
      type: 'budget-exhausted',
      level: 'warn',
      label: 'API 调用预算已用尽',
      detail: `已用 ${event.budget.used}/${event.budget.limit}，阻断位置：${event.step}`
    })
    addOutlineTraceEvent({
      type: 'state-transition',
      label: 'ChainRunState：running → budget_exhausted',
      detail: '预算耗尽，等待用户追加后恢复'
    })
  } else if (event.type === 'run_completed') {
    addOutlineTraceEvent({ type: 'routing-run-complete', label: '链式技能执行完成', detail: event.state })
    if (event.state === 'completed') {
      addOutlineTraceEvent({
        type: 'state-transition',
        label: 'ChainRunState：running → completed',
        detail: '全部链式技能执行完成'
      })
    }
  }
}

function outlineRoutingText(msg: any) {
  const routing = msg?.routingFallback?.routing
  if (routing?.kind === 'ambiguous') {
    return `检测到多个可能意图：${routing.candidates.join('、')}。请确认后继续。`
  }
  return '未能识别意图，请补充写入或讨论说明'
}

function clearOutlineRoutingState(index: number) {
  const message = messages.value[index]
  if (!message) return
  projectStore.updateOutlineChatAt(index, {
    routingFallback: undefined,
    budgetExhausted: undefined
  })
}

async function continueOutlineRouting(index: number) {
  const message = messages.value[index]
  if (isGenerating.value || !message?.routingFallback) return
  const fallback: OutlineRoutingFallbackBubble = message.routingFallback
  if (!fallback.requestText) return
  const recommendedSkillIds = fallback.recommendedSkillIds || []
  const forcedIntent = inferRoutingFallbackIntent(
    fallback.routing || {
      kind: 'no_match',
      confidence: 0,
      reason: 'low-confidence',
      fallbackMode: 'await-user',
    },
  )
  const tokenValid =
    fallback.runId === outlineRunTraceId &&
    validateRoutingResumeToken(fallback, outlineRunTraceId)
  if (fallback.runId && !tokenValid) {
    addOutlineTraceEvent({
      type: 'routing-resume-token-invalid',
      level: 'warn',
      label: '意图确认恢复令牌失效',
      detail: `bubble_run=${fallback.runId}; current_run=${outlineRunTraceId || 'none'}`
    })
  } else if (fallback.runId) {
    runTraceStore.finishAwaitingUser(fallback.runId, `resume:${fallback.requestText.slice(0, 80)}`)
  }
  clearOutlineRoutingState(index)
  await askAi(fallback.requestText, {
    forcedIntent: recommendedSkillIds.length > 0 ? forcedIntent : undefined,
    recommendedSkillIds
  })
}

async function bypassOutlineRouting(index: number) {
  const message = messages.value[index]
  if (isGenerating.value || !message?.routingFallback?.requestText) return
  const requestText = message.routingFallback.requestText
  addOutlineTraceEvent({
    type: 'user-bypassed-routing',
    level: 'warn',
    label: '用户跳过意图路由',
    detail: '本次直接全链执行，不写入配置'
  })
  clearOutlineRoutingState(index)
  await askAi(requestText, { bypass: true })
}

async function extendOutlineBudget(index: number) {
  const message = messages.value[index]
  if (isGenerating.value || !message?.budgetExhausted?.requestText) return
  const requestText = message.budgetExhausted.requestText
  if (!outlineApiBudget) {
    await appConfirm.alert('本次执行的预算对象已释放，请重新发起请求')
    return
  }
  const next = outlineApiBudget.extend(4)
  addOutlineTraceEvent({
    type: 'budget-extended',
    level: 'warn',
    label: '用户追加 API 预算',
    detail: `追加 4 次；当前 ${next.used}/${next.limit}`
  })
  clearOutlineRoutingState(index)
  await askAi(requestText)
}

function outlineProjectId() {
  return String(projectStore.currentProjectId || 'default')
}

function outlineTraceTarget() {
  return {
    type: 'outline',
    id: 'outline',
    name: projectStore.projectName || '未命名项目',
    activeTab: '大纲编辑器',
    locked: projectStore.outlineLocked
  }
}

function startOutlineRun(
  mode: string,
  requestText: string,
  skillNames: string[] = [],
  options: {
    intent?: PlainDialogueIntent
    toolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
    actualToolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
  } = {},
) {
  const provider = providerStore.activeGenerateProvider
  outlineStreamLength = 0
  const activeRun = outlineRunTraceId ? runTraceStore.getRun(outlineRunTraceId) : null
  if (
    activeRun &&
    activeRun.status === 'running' &&
    activeRun.sessionKind === 'chat' &&
    outlineSessionProjectId === outlineProjectId()
  ) {
    outlineRunTraceId = activeRun.id
  } else {
    outlineRunTraceId = runTraceStore.startRun({
      source: 'outline',
      stepName: '大纲共创',
      mode,
      sessionKind: 'chat',
      projectId: outlineProjectId(),
      projectName: projectStore.projectName,
      providerId: provider?.id,
      providerName: provider?.name,
      model: provider?.selectedModel || provider?.models?.[0],
      skillNames,
      skillMode: skillNames.length ? mode : undefined,
      target: outlineTraceTarget(),
      context: {
        turns: messages.value.filter(item => item.role === 'user').length
      }
    })
    outlineSessionProjectId = outlineProjectId()
  }
  outlineRunTurnId = runTraceStore.startTurn(outlineRunTraceId, {
    userRequest: requestText,
    skillNames,
    mode,
    intent: options.intent,
    writeMode: 'direct',
    toolSurface: options.toolSurface,
    actualToolSurface: options.actualToolSurface
  })
  if (runTraceStore.getRun(outlineRunTraceId)?.status === 'running') {
    runTraceStore.finishAwaitingUser(outlineRunTraceId, `next_turn:${requestText.slice(0, 80)}`)
  }
  runTraceStore.addEvent(outlineRunTraceId, {
    type: 'user-request',
    level: 'info',
    label: '用户请求',
    detail: requestText
  })
}

function appendOutlineStream(text: string, isDelta = false) {
  const callId = runTraceStore.getApiCallId('outline')
  if (!outlineRunTraceId || !callId) return
  if (isDelta) {
    if (!text) return
    runTraceStore.appendStream(outlineRunTraceId, callId, text)
    return
  }
  if (text.length < outlineStreamLength) return
  const delta = text.slice(outlineStreamLength)
  if (!delta) return
  outlineStreamLength = text.length
  runTraceStore.appendStream(outlineRunTraceId, callId, delta)
}

function appendOutlineReasoning(text: string) {
  const callId = runTraceStore.getApiCallId('outline')
  if (!outlineRunTraceId || !callId || !text) return
  runTraceStore.appendReasoning(outlineRunTraceId, callId, text)
}

function finishOutlineRun(status: RunTraceStatus, error?: string, resultPreview?: string, reason?: string) {
  const runId = outlineRunTraceId
  if (!runId) return
  if (status === 'canceled' || status === 'failed') {
    runTraceStore.cancelRunningApiCalls(runId, error || (status === 'canceled' ? '用户取消生成' : '运行失败'))
  }
  const run = runTraceStore.getRun(runId)
  if (run && resultPreview) run.resultPreview = resultPreview
  if (run?.sessionKind === 'chat') {
    if (outlineRunTurnId) {
      runTraceStore.finishTurn(runId, outlineRunTurnId, status, error, reason)
      outlineRunTurnId = null
    }
    return
  }
  runTraceStore.finishRun(runId, status, error, reason)
  outlineRunTraceId = null
  outlineStreamLength = 0
}

function finishOutlineRunIfRunning(status: RunTraceStatus, error?: string, resultPreview?: string, reason?: string) {
  const runId = outlineRunTraceId
  if (!runId) return
  const run = runTraceStore.getRun(runId)
  if (run && run.status !== 'running') {
    runTraceStore.addEvent(runId, {
      type: 'status-conflict-ignored',
      level: 'warn',
      label: '忽略收尾状态改写',
      detail: `运行已处于 ${run.status}，收尾尝试改写为 ${status}`
    })
    outlineRunTraceId = null
    outlineRunTurnId = null
    outlineStreamLength = 0
    return
  }
  finishOutlineRun(status, error, resultPreview, reason)
}

function sealOutlineTraceSession() {
  const runId = outlineRunTraceId
  if (!runId) return
  const run = runTraceStore.getRun(runId)
  if (!run || run.sessionKind !== 'chat') return
  if (run.status === 'running') runTraceStore.finishRun(runId, 'success')
  outlineRunTraceId = null
  outlineRunTurnId = null
  outlineStreamLength = 0
}

function addOutlineTraceEvent(event: { type: string; label: string; level?: 'info' | 'warn' | 'error'; detail?: string }) {
  const runId = outlineRunTraceId
  if (!runId) return
  runTraceStore.addEvent(runId, {
    level: event.level || 'info',
    type: event.type,
    label: event.label,
    detail: event.detail?.slice(0, 20000)
  })
}

function configureOutlineContextCompaction(model: string, reservedOutputTokens?: number): void {
  const modelContextWindow = resolveModelContextWindow(model)
  conversationContextService.setCompactionRouting({
    workspace: 'outline',
    ...(modelContextWindow
      ? { budget: { modelContextWindow, ...(reservedOutputTokens ? { reservedOutputTokens } : {}) } }
      : {}),
    observer: {
      onContextCompacted: result => {
        const detail = `strategy=${result.strategy}; compacted=${result.compactedMessageCount}; retained=${result.retainedMessageCount}; chars=${result.beforeChars}->${result.afterChars}; allowedTokens=${result.allowedInputTokens ?? 'unknown'}`
        if (outlineRunTraceId) runTraceStore.markContextCompacted(outlineRunTraceId, detail)
        addOutlineTraceEvent({
          type: 'context-compacted',
          label: '上下文已非破坏性压缩',
          detail
        })
        const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
        diag?.log?.('info', 'context/compaction', '大纲上下文已非破坏性压缩', {
          workspace: 'outline',
          model,
          strategy: result.strategy,
          compactedMessageCount: result.compactedMessageCount,
          retainedMessageCount: result.retainedMessageCount,
          beforeChars: result.beforeChars,
          afterChars: result.afterChars,
          allowedInputTokens: result.allowedInputTokens,
        })
      },
      onContextCompactionSkipped: result => {
        if (result.reason !== 'unknown-window') return
        const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
        diag?.log?.('info', 'context/compaction', '模型输入窗口未知，跳过上下文压缩', {
          workspace: 'outline',
          model,
          reason: result.reason,
          messageCount: result.retainedMessageCount,
        })
      },
    },
  })
}

function recordOutlineBatchEvent(
  record: ReturnType<typeof normalizeEditorBatchRecord>,
  status: Parameters<typeof toDialogueBatchEvent>[1],
  reason?: string,
) {
  if (!record) return
  runTraceStore.addBatchEvent('outline', toDialogueBatchEvent(record, status, reason))
}

function startOutlineApiCall(input: {
  skillName?: string
  requestMessages: RunTraceMessage[]
  model?: string
  intent?: string
  toolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
  actualToolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
}) {
  const runId = outlineRunTraceId
  if (!runId) return
  const provider = providerStore.activeGenerateProvider
  outlineStreamLength = 0
  return runTraceStore.startApiCall(runId, {
    source: 'outline',
    skillName: input.skillName,
    providerId: provider?.id,
    providerName: provider?.name,
    model: input.model || provider?.selectedModel || provider?.models?.[0],
    intent: input.intent,
    toolSurface: input.toolSurface,
    actualToolSurface: input.actualToolSurface,
    requestMessages: input.requestMessages
  })
}

function finishOutlineApiCall(callId: string | undefined, result: {
  status: RunTraceStatus
  responseText?: string
  reasoningText?: string
  finishReason?: string
  usage?: unknown
  durationMs?: number
    error?: string
    retryStrategy?: 'thinking_disabled' | 'max_tokens_raised' | 'prompt_only'
    maxTokens?: number
}) {
  const runId = outlineRunTraceId
  if (!runId || !callId) return
  runTraceStore.finishApiCall(runId, callId, result)
}

function recordOutlinePhysicalCall(callId: string | undefined, event: PhysicalCallEvent) {
  if (!outlineRunTraceId || !callId) return
  runTraceStore.appendPhysicalCall(outlineRunTraceId, callId, {
    physicalCallId: event.physicalCallId,
    phase: event.phase,
    status: event.status,
    requestMessages: event.requestMessages.map((m: { role: string; content?: unknown }) => ({
      role: m.role,
      content: String(m.content || '')
    })),
    responseText: event.responseText,
    streamText: event.streamText,
    reasoningText: event.reasoningText,
    finishReason: event.finishReason,
    usage: event.usage,
    durationMs: event.durationMs,
    error: event.error,
    toolsEnabled: event.toolsEnabled,
    toolsDowngraded: event.toolsDowngraded,
    downgradeReason: event.downgradeReason,
    retryStrategy: event.retryStrategy,
    maxTokens: event.maxTokens,
  })
  const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
  if (diag && typeof diag.log === 'function') {
    diag.log(event.status === 'running' ? 'info' : event.status === 'success' ? 'info' : 'error',
      `runTrace/physical-call/${event.phase}`,
      `physical call ${event.status}: attempt=${event.attempt} tools=${event.toolsEnabled ? 'on' : 'off'}`,
      {
        physicalCallId: event.physicalCallId,
        status: event.status,
        phase: event.phase,
        attempt: event.attempt,
        durationMs: event.durationMs,
        toolsEnabled: event.toolsEnabled,
        error: event.error,
      })
  }
}

function recordOutlineToolCall(callId: string | undefined, event: {
  toolName: string
  input: unknown
  result: ToolResult
  durationMs: number
}) {
  if (!outlineRunTraceId || !callId) return
  runTraceStore.appendToolCall(outlineRunTraceId, callId, {
    name: event.toolName,
    input: event.input,
    result: event.result,
    status: event.result.ok ? 'success' : 'failed',
    durationMs: event.durationMs,
    error: event.result.ok ? undefined : event.result.error?.message,
  })
}

function recordOutlineEditorPresentation(event: {
  phase: 'start' | 'finished' | 'failed'
  workspace: 'outline'
  targetId: string
  mode: string
  commands?: number
  reason?: string
}) {
  logEditorPresentation(event)
  addOutlineTraceEvent({
    type: `editor-presentation-${event.phase}`,
    level: event.phase === 'failed' ? 'error' : 'info',
    label: event.phase === 'start'
      ? '大纲直写呈现开始'
      : event.phase === 'finished'
        ? '大纲直写呈现完成'
        : '大纲直写呈现失败',
    detail: JSON.stringify(event).slice(0, 20000)
  })
}

function isTruncationReason(reason?: string) {
  return reason === 'length' || reason === 'timeout' || reason === 'network_error' || reason === 'canceled'
}

function buildOutlineFallbackMessages(requestText: string) {
  const hasHistory = messages.value.length > 0
  const userContent = hasHistory
    ? '用户请求: ' + requestText
    : '当前大纲:\n' + (projectStore.outlineText || '') + '\n\n用户请求: ' + requestText
  return [
    { role: 'system', content: buildOutlineSystemPrompt() },
    { role: 'user', content: userContent }
  ]
}

function buildOutlineSystemPrompt() {
  return '你是小说大纲创作助手。用户正在编辑大纲，请给出建议和修改意见。'
}

function readableToolLoopError(error: any, finishReason?: string) {
  const effectiveReason = error?.finishReason || finishReason
  return effectiveReason === 'tool_loop_limit'
    ? 'AI 连续尝试工具调用但未能产出回答，已中止。请简化问题或更换模型。'
    : error?.message || String(error)
}

function toolRunSupervisorEventDetail(reason: string, idleMs: number, totalMs: number) {
  return `reason=${reason} idleMs=${Math.round(idleMs)} totalMs=${Math.round(totalMs)} idleLimitMs=${DIRECT_TOOL_RUN_IDLE_TIMEOUT_MS} hardDeadlineMs=${DIRECT_TOOL_RUN_HARD_DEADLINE_MS}`
}

function toolRunSupervisorReadableMessage(reason: string) {
  if (reason === 'stuck_timeout') return 'AI 请求无进展，已自动中止。请缩小问题范围、分段处理，或稍后重试。'
  if (reason === 'hard_deadline') return '本轮工具任务超过总时间上限，已自动中止。请把长文档任务拆分为多轮处理。'
  if (reason === 'repeated_tool_error') return '同一工具连续失败，已自动中止。请检查模型是否支持当前工具参数。'
  return 'AI 请求已自动中止。'
}

function createOutlineRequestTarget() {
  const editor = editorRef.value
  const start = editor?.selectionStart ?? (projectStore.outlineText || '').length
  const end = editor?.selectionEnd ?? start
  return createEditorTargetSnapshot({
    workspace: 'outline',
    targetId: 'outline',
    label: '大纲编辑器',
    content: projectStore.outlineText || '',
    selectionStart: start,
    selectionEnd: end
  })
}

function buildOutlineWorkspaceSnapshots() {
  const outline = createOutlineRequestTarget()
  const settings = projectStore.settingsCollection
  const settingsText = typeof settings === 'string'
    ? settings
    : JSON.stringify(settings || {})
  return [
    outline,
    {
      workspace: 'outline' as const,
      targetId: 'outline-settings',
      label: '设定库',
      content: settingsText,
      contentVersion: 0,
      selectionStart: 0,
      selectionEnd: 0,
      selectedText: '',
    },
  ]
}

function firstOutlineDifference(previous: string, next: string): number {
  const length = Math.min(previous.length, next.length)
  let index = 0
  while (index < length && previous[index] === next[index]) index += 1
  return index
}

async function applyOutlineDirectWrite(input: {
  targetId: string
  batchId: string
  next: string
  original: string
  commands: EditorEditCommand[]
  reason?: string
  reveal: { mode: 'stream' | 'instant'; firstChange: boolean }
}): Promise<{ ok: true; rollbackAvailable: boolean } | { ok: false; code: string; message: string }> {
  if (input.targetId !== 'outline') {
    return { ok: false, code: 'write_target_mismatch', message: '大纲直写只允许写入大纲编辑器' }
  }
  if (projectStore.outlineLocked) {
    recordOutlineEditorPresentation({
      phase: 'failed',
      workspace: 'outline',
      targetId: input.targetId,
      mode: input.reveal.mode,
      commands: input.commands.length,
      reason: 'locked',
    })
    return { ok: false, code: 'locked', message: '大纲已锁定，本轮只允许定位讨论，不允许写入' }
  }
  if ((projectStore.outlineText || '') !== input.original) {
    recordOutlineEditorPresentation({
      phase: 'failed',
      workspace: 'outline',
      targetId: input.targetId,
      mode: input.reveal.mode,
      commands: input.commands.length,
      reason: 'version_changed',
    })
    return { ok: false, code: 'version_changed', message: '大纲内容已变化，本次写入已取消' }
  }
  recordOutlineEditorPresentation({
    phase: 'start',
    workspace: 'outline',
    targetId: input.targetId,
    mode: input.reveal.mode,
    commands: input.commands.length,
    reason: input.reason,
  })
  const integrity = validateOutlineIntegrity(input.original, input.next)
  if (!integrity.ok) {
    recordOutlineEditorPresentation({
      phase: 'failed',
      workspace: 'outline',
      targetId: input.targetId,
      mode: input.reveal.mode,
      commands: input.commands.length,
      reason: `integrity_failed:${integrity.summary}`,
    })
    return { ok: false, code: 'integrity_failed', message: `结构完整性校验未通过：${integrity.summary}` }
  }
  if (!commitOutlineChange(input.next)) {
    recordOutlineEditorPresentation({
      phase: 'failed',
      workspace: 'outline',
      targetId: input.targetId,
      mode: input.reveal.mode,
      commands: input.commands.length,
      reason: 'write_failed',
    })
    return { ok: false, code: 'write_failed', message: '大纲写入失败，原文未修改' }
  }
  const record = createEditorBatchRecord({
    workspace: 'outline',
    targetId: 'outline',
    batch: {
      type: 'editor_edit_batch',
      version: 1,
      commands: input.commands,
      reason: input.reason,
    },
    sourceContent: input.original,
    batchId: input.batchId,
  })
  const appliedRecord = updateEditorBatchRecord(record, {
    status: 'applied',
    appliedContentHash: hashOutlineContent(input.next),
    appliedAt: Date.now(),
    undoAvailable: true,
  })
  // The assistant bubble is appended after the tool loop finishes, so the batch
  // must be carried into that final message instead of overwriting an older one.
  pendingOutlineDirectWrite.value = {
    batch: {
      type: 'editor_edit_batch',
      version: 1,
      commands: input.commands,
      reason: input.reason,
    },
    record: appliedRecord,
  }
  recordOutlineBatchEvent(record, 'applied', `API 已直接写入 ${input.commands.length} 条大纲修改`)
  logEditorEdit({
    requestId: `outline-direct-write_${record.batchId}`,
    batchId: record.batchId,
    workspace: 'outline',
    tabId: 'outline',
    operation: 'editor_write',
    result: 'applied',
    targetLength: input.original.length,
    contentLength: input.commands.reduce((sum, command) => sum + (command.content?.length || 0), 0),
    durationMs: 0,
    detail: `API 直写已应用 ${input.commands.length} 条命令`,
  })
  if (input.reveal.firstChange !== false) {
    const start = firstOutlineDifference(input.original, input.next)
    window.dispatchEvent(new CustomEvent('diff-locate', {
      detail: {
        workspace: 'outline',
        targetId: 'outline',
        range: {
          start,
          end: Math.max(start + 1, start + (input.next.length - input.original.length)),
        },
      },
    }))
  }
  saveFeedback.value = '[OK] API 已直接写入大纲'
  recordOutlineEditorPresentation({
    phase: 'finished',
    workspace: 'outline',
    targetId: input.targetId,
    mode: input.reveal.mode,
    commands: input.commands.length,
    reason: input.reason,
  })
  setTimeout(() => { saveFeedback.value = '' }, 2500)
  return { ok: true, rollbackAvailable: true }
}

function createOutlineSnapshot(options: {
  requestMessages: Array<{ role: string; content: string }>
  text: string
  finishReason: string
  model: string
  providerId?: string
  skillIds?: string[]
  agentIds?: string[]
  mode?: ContinuationSnapshot['mode']
}): ContinuationSnapshot | null {
  if (!isTruncationReason(options.finishReason)) return null
  const status = continuationStatusFor(options.finishReason as ContinuationSnapshot['finishReason'], Boolean(options.text))
  if (status === 'failed') return null
  return JSON.parse(JSON.stringify({
    requestId: `outline_${Date.now()}`,
    projectId: outlineProjectId(),
    workspace: OUTLINE_WORKSPACE_ID,
    purpose: 'generate' as const,
    providerId: options.providerId,
    model: options.model,
    skillIds: options.skillIds || [],
    agentIds: options.agentIds || [],
    mode: options.mode || 'single',
    originalMessages: slimContinuationMessages(options.requestMessages),
    _slimmed: true,
    accumulatedText: options.text || '',
    continuationCount: 0,
    status,
    finishReason: options.finishReason,
    createdAt: Date.now(),
    updatedAt: Date.now()
  })) as ContinuationSnapshot
}

async function attachOutlineSnapshot(index: number, snapshot: ContinuationSnapshot) {
  projectStore.updateOutlineChatAt(index, { continuation: JSON.parse(JSON.stringify(snapshot)) })
  await saveContinuation(snapshot, OUTLINE_SESSION_ID)
}
const findOpen = ref(false)
const findQuery = ref('')
const findIndex = ref(-1)
const findRef = ref<HTMLInputElement | null>(null)
const undoStack = ref<string[]>([])
const redoStack = ref<string[]>([])
const isGenerating = ref(false)
const generationStatus = ref('')
const streamingContent = ref('')
const toolStreamOpen = ref<Record<number, boolean>>({})
const liveToolStream = ref<Array<{ type: string; toolName: string; stepDescription: string; targetId?: string; iteration: number; ok: boolean; error?: string }>>([])

function toggleToolStream(index: number) {
  toolStreamOpen.value[index] = !toolStreamOpen.value[index]
}

function diagnosticCountFromSummary(summary: string): number {
  const match = /(?:批次\s*\d+\s*条命令中\s*(\d+)\s*条失败|(\d+)\s*条命令需要修正)/.exec(summary)
  if (!match) return 0
  return Number(match[1] || match[2] || 0)
}
const { content: streamingRenderedContent, flush: flushStreamingRender } = useThrottledMarkdown(streamingContent)
let generationController: AbortController | null = null
let cancelController: AbortController | null = null
let lastEditorHistoryAt = 0
let outlineRunTraceId: string | null = null
let outlineStreamLength = 0
const workspaceAgentId = ref('')
const selectedSkillId = ref('')
const workspaceSkillIds = ref<string[]>([])
const workspaceSkillMode = ref<'chain' | 'compose'>('compose')
const workspaceSkillAgents = ref<Record<string, string>>({})

type OutlineEditOperation = 'insert' | 'replace_selection' | 'replace_section' | 'append' | 'delete' | 'rewrite'
interface OutlineEditCommand {
  type: 'outline_edit'
  operation: OutlineEditOperation
  content?: string
  target?: string
  position?: string
  reason?: string
}


const DEFAULT_SKILL_HISTORY_TURNS = 10

const findResult = computed(() => {
  if (!findQuery.value) return ''
  return findIndex.value >= 0 ? '已定位' : '未找到'
})

const selectedWorkspaceSkills = computed(() => {
  return workspaceSkillIds.value
    .flatMap(id => {
      const skill = skillStore.getSkill(id)
      return skill ? [skill] : []
    })
})

function hashOutlineContent(content: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < content.length; index++) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return 'fnv1a32_' + hash.toString(16).padStart(8, '0')
}

function getWorkspaceTemplates(): WorkspaceSkillTemplate[] {
  return selectedWorkspaceSkills.value
    .filter(skill => skill && (skill.template || (skill.format === 'folder' && skill.folderPath)))
    .map(skill => ({
      id: skill.id,
      name: skillStore.displaySkillName(skill),
      template: skill.template,
      skill,
      customVars: skill.customVars || {},
      injectMode: skill.injectMode || 'system_prefix',
      outputFormat: skill.outputFormat || 'text',
      validationRules: skill.validationRules || [],
      inputSchema: skill.inputSchema,
      outputSchema: skill.outputSchema,
      retryPolicy: skill.retryPolicy
      ,intents: skill.intents
    }))
}

function getOutlineContextMessages(currentRequest: string): ContextMessage[] {
  const source = messages.value
    .filter(message => (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string' && message.content.trim())
    .filter(message => !message.routingFallback && !message.budgetExhausted)
    .map(message => ({ role: message.role, content: message.content }))
  const latestRequestIndex = [...source].reverse().findIndex(message => message.role === 'user' && message.content === currentRequest)
  if (latestRequestIndex < 0) return source
  const removeIndex = source.length - 1 - latestRequestIndex
  return source.filter((_message, index) => index !== removeIndex)
}

function getCurrentOutlineSelection(): string {
  const editor = editorRef.value
  if (!editor) return ''
  const start = editor.selectionStart ?? 0
  const end = editor.selectionEnd ?? start
  return start < end ? (projectStore.outlineText || '').slice(start, end) : ''
}

function createWorkspaceSkillAdapter(
): WorkspaceSkillEngineAdapter {
  const buildOutlineToolSurface = (intent: ChainIntent) => {
    const requestTarget = createOutlineRequestTarget()
    if (!requestTarget.content) {
      return { tools: [], actualToolSurface: [] as Array<{ name: string; policy: 'read' | 'write' }> }
    }
    return buildDialogueToolSurface({
      workspace: 'outline',
      intent,
      getSnapshot: () => createOutlineRequestTarget(),
      getAllSnapshots: buildOutlineWorkspaceSnapshots,
      mode: 'direct',
      applyWrite: async input => applyOutlineDirectWrite(input),
      onFailedBatch: batch => { outlineFailedWriteBatch = batch },
      takeFailedBatch: () => outlineFailedWriteBatch,
      revealTarget: async request => {
        if (request.workspace !== 'outline' || request.targetId !== 'outline') return
        window.dispatchEvent(new CustomEvent('diff-locate', {
          detail: {
            workspace: 'outline',
            targetId: 'outline',
            range: { start: request.start, end: request.end },
          },
        }))
      },
      extraTools: createOutlineTools({
        getSnapshot: () => createOutlineRequestTarget()
      }),
      readableTargets: ['outline', 'outline-settings'],
      writableTarget: 'outline',
    })
  }
  return {
    workspace: 'outline',
    source: 'OutlineWorkspace.skill',
    projectId: outlineProjectId(),
    toolContext: {
      targetId: 'outline',
      readableTargets: ['outline', 'outline-settings'],
    },
    step: 0,
    defaultSystemPrompt: '你是小说大纲创作助手。',
    getBaseAgentId: () => workspaceAgentId.value,
    getSkillAgentId: skillId => workspaceSkillAgents.value[`0-${skillId}`] || '',
    getAgent: agentId => {
      if (!agentId) return null
      const agent = agentStore.getAgent(agentId)
      if (!agent) throw new Error('绑定的智能体不存在：' + agentId)
      return agent
    },
    getProvider: agent => {
      const provider = agent?.provider
        ? providerStore.getProvider(agent.provider)
        : providerStore.activeGenerateProvider
      return provider || providerStore.activeGenerateProvider || null
    },
    getSkillPolicy: template => skillStore.skills.find(skill => skill.id === template.id)?.contextPolicy,
    buildTemplateContext: (requestText, previousOutput) => ({
      userPrompt: requestText,
      selectedText: requestText,
      outlineContent: projectStore.outlineText || '',
      novelTitle: projectStore.projectName || '',
      prevResponse: previousOutput || ''
    }),
    getWorkspaceState: () => ({
      outline: projectStore.outlineText || '',
      selectedText: getCurrentOutlineSelection(),
      activeTab: '大纲编辑器',
      settings: projectStore.settingsCollection,
      memories: JSON.stringify(projectStore.memories || {})
    }),
    getLegacyMessages: requestText => getOutlineContextMessages(requestText).slice(-DEFAULT_SKILL_HISTORY_TURNS * 2),
    buildTools: (request) => {
      const surface = buildOutlineToolSurface(request.intent)
      return {
        tools: surface.tools,
        toolPolicy: surface.tools.length ? {
          maxToolIterations: 6,
          intent: request.intent,
          onPermissionDenied: event => {
            addOutlineTraceEvent({
              type: 'tool-permission-denied',
              level: 'error',
              label: '工具写入权限拒绝',
              detail: `${event.toolName}：${event.reason}`
            })
          },
          onRepeatedWriteBlocked: event => {
            addOutlineTraceEvent({
              type: 'write-duplicate-blocked',
              level: 'warn',
              label: '重复写入已拦截',
              detail: `${event.toolName}：连续 ${event.repeatCount} 次提交完全相同的写入参数，本次已拦截`
            })
          },
          onToolStart: (event) => {
            liveToolStream.value.push({
              type: 'tool_start',
              toolName: event.toolName,
              stepDescription: `正在执行 ${event.toolName}…`,
              targetId: 'outline',
              iteration: event.iteration,
              ok: true,
            })
            if (!streamingContent.value) {
              generationStatus.value = `正在执行工具 ${event.toolName}...`
            }
            window.dispatchEvent(new CustomEvent('tool-activity', { detail: { type: 'tool_start', toolName: event.toolName, targetId: 'outline', policy: event.policy } }))
          },
          onToolCall: (event) => {
            recordOutlineToolCall(runTraceStore.getApiCallId('outline') || undefined, event)
            const toolResult = event.result as {
              ok?: boolean
              error?: { message?: string }
              data?: { summary?: string; failedItems?: unknown[] }
            }
            const failedItems = Array.isArray(toolResult?.data?.failedItems) ? toolResult.data.failedItems : []
            const message = !toolResult?.ok
              ? (toolResult?.error?.message || toolResult?.data?.summary || JSON.stringify(toolResult?.data || {}) || '失败')
              : '已完成'
            const diagnosticCount = failedItems.length || diagnosticCountFromSummary(message)
            liveToolStream.value.push({
              type: toolResult?.ok ? 'tool_result' : 'tool_error',
              toolName: event.toolName,
              stepDescription: diagnosticCount
                ? `${message}（${diagnosticCount} 条命令需要修正）`
                : message,
              targetId: 'outline',
              iteration: event.iteration,
              ok: Boolean(toolResult?.ok),
              error: toolResult?.ok ? undefined : message
            })
            window.dispatchEvent(new CustomEvent('tool-activity', {
            detail: {
              type: toolResult?.ok ? 'tool_result' : 'tool_error',
              toolName: event.toolName,
              targetId: 'outline',
              policy: event.policy,
              ok: Boolean(toolResult?.ok),
            }
          }))
          },
          onToolWarning: message => {
            generationStatus.value = message
            liveToolStream.value.push({
              type: 'tool_warning',
              toolName: 'tool-loop',
              stepDescription: message,
              targetId: 'outline',
              iteration: 0,
              ok: false,
              error: message
            })
          },
          onCompatibilityMode: () => {
            compatibilityNotice.value = '当前供应商未启用原生工具调用，已使用兼容模式'
          }
        } : undefined
      }
    },
    loadBreakpoint: () => pipelineStore.refreshBreakpoint(),
    saveBreakpoint: breakpoint => pipelineStore.saveBreakpoint(breakpoint),
    clearBreakpoint: () => pipelineStore.clearBreakpoint()
  }
}

onMounted(async () => {
  if (editorRef.value) {
    outlineViewport = createTextareaViewport({
      textarea: editorRef.value,
      mirror: outlineViewportMirror.value || document.createElement('div'),
      highlightLayer: outlineViewportHighlight.value || undefined,
    })
  }
  await restoreOutlineContinuation()
  const config = await pipelineStore.readStepConfig(0)
  workspaceAgentId.value = config.agentId
  workspaceSkillIds.value = config.skillIds
  workspaceSkillMode.value = config.mode
  workspaceSkillAgents.value = migrateSkillAgentBindings(config.skillAgents, { 0: config.skillIds })
  window.addEventListener('diff-locate', handleDiffLocate)
})

onUnmounted(() => {
  outlineViewport?.dispose()
  outlineViewport = null
  window.removeEventListener('diff-locate', handleDiffLocate)
})

function handleDiffLocate(event: Event) {
  const detail = (event as CustomEvent).detail
  if (!detail || detail.workspace !== 'outline' || !editorRef.value) return
  const start = Math.max(0, Number(detail.range?.start) || 0)
  const end = Math.max(start, Number(detail.range?.end) || start)
  editorRef.value.focus()
  if (outlineViewport) {
    outlineViewport.revealTarget({ start, end, focus: 'center' })
  } else {
    editorRef.value.setSelectionRange(start, end)
  }
}

async function handleAgentChange() {
  await pipelineStore.updateStepConfig(0, { agentId: workspaceAgentId.value })
}

async function addSelectedSkill() {
  const id = selectedSkillId.value
  if (!id || workspaceSkillIds.value.includes(id)) {
    selectedSkillId.value = ''
    return
  }
  workspaceSkillIds.value.push(id)
  selectedSkillId.value = ''
  await pipelineStore.updateStepConfig(0, { skillIds: workspaceSkillIds.value })
}

async function removeSelectedSkill(index: number) {
  workspaceSkillIds.value.splice(index, 1)
  await pipelineStore.updateStepConfig(0, { skillIds: workspaceSkillIds.value })
}

async function handleModeChange() {
  await pipelineStore.updateStepConfig(0, { mode: workspaceSkillMode.value })
}

async function handleSkillAgentChange(skillId: string, agentId: string) {
  workspaceSkillAgents.value[`0-${skillId}`] = agentId
  await pipelineStore.updateStepConfig(0, { skillId, skillAgentId: agentId })
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
watch(
  () => projectStore.outlineText,
  () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (projectStore.currentProjectId) projectStore.setOutline(projectStore.outlineText)
    }, 400)
  }
)

function triggerImport() {
  fileInput.value?.click()
}

function editCommand(command: 'undo' | 'redo' | 'cut') {
  const ta = editorRef.value
  if (!ta || projectStore.outlineLocked) return
  if (command === 'undo') {
    if (undoStack.value.length === 0) return
    redoStack.value.push(projectStore.outlineText)
    const previous = undoStack.value.pop() || ''
    projectStore.outlineText = previous
    projectStore.setOutline(previous)
    return
  }
  if (command === 'redo') {
    if (redoStack.value.length === 0) return
    undoStack.value.push(projectStore.outlineText)
    const next = redoStack.value.pop() || ''
    projectStore.outlineText = next
    projectStore.setOutline(next)
    return
  }
  ta.focus()
  document.execCommand(command)
}

function commitOutlineChange(next: string) {
  const current = projectStore.outlineText || ''
  if (next === current || projectStore.outlineLocked) return false
  undoStack.value.push(current)
  if (undoStack.value.length > 50) undoStack.value.shift()
  redoStack.value = []
  lastEditorHistoryAt = Date.now()
  projectStore.outlineText = next
  projectStore.setOutline(next)
  return true
}

async function copySelection() {
  const ta = editorRef.value
  if (!ta || ta.selectionStart === ta.selectionEnd) return
  const selected = ta.value.slice(ta.selectionStart, ta.selectionEnd)
  try {
    if (window.electronAPI && typeof window.electronAPI.clipboardWrite === 'function') {
      await window.electronAPI.clipboardWrite(selected)
    } else {
      await navigator.clipboard.writeText(selected)
    }
    saveFeedback.value = '[OK] 已复制选中文本'
  } catch {
    saveFeedback.value = '[失败] 无法写入剪贴板'
  }
  setTimeout(() => { saveFeedback.value = '' }, 2000)
}

async function pasteText() {
  const ta = editorRef.value
  if (!ta || projectStore.outlineLocked) return
  try {
    const text = await navigator.clipboard.readText()
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const next = ta.value.slice(0, start) + text + ta.value.slice(end)
    commitOutlineChange(next)
    await nextTick()
    ta.focus()
    ta.selectionStart = ta.selectionEnd = start + text.length
  } catch {
    saveFeedback.value = '[提示] 请使用系统粘贴快捷键或授予剪贴板权限'
    setTimeout(() => { saveFeedback.value = '' }, 2500)
  }
}

function closeFind() {
  findOpen.value = false
  findQuery.value = ''
  findIndex.value = -1
  editorRef.value?.focus()
}

function findNext() {
  const ta = editorRef.value
  const query = findQuery.value
  if (!ta || !query) return
  const text = ta.value
  const from = ta.selectionEnd > ta.selectionStart ? ta.selectionEnd : ta.selectionStart
  const found = text.indexOf(query, from >= text.length ? 0 : from)
  findIndex.value = found
  if (found >= 0) {
    ta.focus()
    ta.selectionStart = found
    ta.selectionEnd = found + query.length
  }
}

function findPrevious() {
  const ta = editorRef.value
  const query = findQuery.value
  if (!ta || !query) return
  const from = Math.max(0, ta.selectionStart - 1)
  const found = ta.value.lastIndexOf(query, from)
  findIndex.value = found
  if (found >= 0) {
    ta.focus()
    ta.selectionStart = found
    ta.selectionEnd = found + query.length
  }
}

async function handleImport(e: Event) {
  const target = e.target as HTMLInputElement
  if (!target.files || target.files.length === 0) return
  try {
    const text = await importFile(target.files[0])
    if (text && text.length > 0) {
      if (!projectStore.currentProjectId) {
        projectStore.currentProjectId = 'proj-' + Date.now()
      }
      projectStore.projectName =
        target.files[0].name.replace(/\.(txt|md|rtf|docx)$/i, '').substring(0, 20) ||
        projectStore.projectName ||
        '新小说'
      projectStore.outlineText = text
      projectStore.setOutline(text)
    }
  } catch (err: any) {
    void appConfirm.alert('导入失败: ' + (err.message || String(err)))
  }
  target.value = ''
}

function renderMarkdown(text: string): string {
  return renderMarkdownText(text)
}

watch(messages, async () => {
  await nextTick()
  await enhanceCodeBlocks(msgContainer.value)
}, { immediate: true })

watch(streamingContent, async () => {
  await nextTick()
  const streamingMessage = document.getElementById('ow-streaming-message')
  await enhanceCodeBlocks(streamingMessage?.querySelector('.ow-msg-bubble') || null)
})

function rollbackOutlineBatch(messageIndex: number) {
  if (isGenerating.value) {
    void appConfirm.alert('正在生成中，请等待当前回复完成后再回滚批次')
    return
  }
  const record = normalizeEditorBatchRecord(messages.value[messageIndex]?.outlineBatchRecord)
  const currentContent = projectStore.outlineText || ''
  if (!record) {
    void appConfirm.alert('批次记录不可用，无法回滚')
    return
  }
  if (projectStore.outlineLocked) {
    logEditorEdit({
      requestId: `outline-edit_${Date.now()}`,
      batchId: record.batchId,
      workspace: 'outline',
      tabId: 'outline',
      operation: 'editor_edit_batch',
      result: 'rejected',
      targetLength: currentContent.length,
      failureReason: 'locked',
      durationMs: 0,
      detail: '大纲已锁定，拒绝自动回滚批次'
    })
    void appConfirm.alert('大纲已锁定，请先解锁再回滚批次')
    return
  }
  if (!canRollbackEditorBatch(record, currentContent)) {
    logEditorEdit({
      requestId: `outline-edit_${Date.now()}`,
      batchId: record.batchId,
      workspace: 'outline',
      tabId: 'outline',
      operation: 'editor_edit_batch',
      result: 'rejected',
      targetLength: currentContent.length,
      failureReason: 'version_changed',
      durationMs: 0,
      detail: '批次应用后大纲内容已变化，拒绝自动回滚'
    })
    void appConfirm.alert('大纲内容在批次应用后已有修改，请使用对比预览手动处理')
    return
  }
  const undoContent = findEditorBatchUndoContent(undoStack.value, record)
  if (!undoContent) {
    logEditorEdit({
      requestId: `outline-edit_${Date.now()}`,
      batchId: record.batchId,
      workspace: 'outline',
      tabId: 'outline',
      operation: 'editor_edit_batch',
      result: 'rejected',
      targetLength: currentContent.length,
      failureReason: 'version_changed',
      durationMs: 0,
      detail: '撤销栈中找不到批次应用前内容，拒绝自动回滚'
    })
    void appConfirm.alert('撤销历史不足，无法自动回滚此批次')
    return
  }
  redoStack.value = []
  if (!commitOutlineChange(undoContent.content)) {
    void appConfirm.alert('回滚批次失败，请手动处理大纲内容')
    return
  }
  projectStore.updateOutlineChatAt(messageIndex, {
    outlineBatchRecord: updateEditorBatchRecord(record, {
      status: 'rolled_back',
      rolledBackAt: Date.now(),
      undoAvailable: false
    })
  })
  recordOutlineBatchEvent(record, 'rolled_back', `已回滚大纲 AI 批次，消耗 ${undoContent.consumed} 条撤销历史`)
  logEditorEdit({
    requestId: `outline-edit_${Date.now()}`,
    batchId: record.batchId,
    workspace: 'outline',
    tabId: 'outline',
    operation: 'editor_edit_batch',
    result: 'applied',
    targetLength: currentContent.length,
    contentLength: undoContent.content.length,
    durationMs: 0,
    detail: `已回滚大纲 AI 批次，消耗 ${undoContent.consumed} 条撤销历史；可用撤销恢复`
  })
  void conversationContextService.recordEditorEvent({
    projectId: String(projectStore.currentProjectId || 'default'),
    workspace: 'outline',
    purpose: 'generate'
  }, `已回滚大纲 AI 编辑批次，恢复 ${undoContent.content.length} 字符`, {
    batchId: record.batchId,
    commandCount: record.commandCount,
    targetId: record.targetId,
    status: 'rolled_back'
  }).catch(error => console.error('[OUTLINE] 记录 AI 批次回滚上下文失败', error))
  saveFeedback.value = '[OK] 已回滚大纲批次，可撤销恢复'
  setTimeout(() => { saveFeedback.value = '' }, 2500)
}

function revealOutlineBatch(messageIndex: number) {
  if (isGenerating.value) return
  const record = normalizeEditorBatchRecord(messages.value[messageIndex]?.outlineBatchRecord)
  if (!record) return
  const currentContent = projectStore.outlineText || ''
  const undoContent = findEditorBatchUndoContent(undoStack.value, record)
  if (!undoContent) {
    void appConfirm.alert('找不到批次应用前内容，无法计算首处变更')
    return
  }
  const start = firstOutlineDifference(undoContent.content, currentContent)
  const end = Math.max(start + 1, start + (currentContent.length - undoContent.content.length))
  window.dispatchEvent(new CustomEvent('diff-locate', {
    detail: {
      workspace: 'outline',
      targetId: 'outline',
      range: { start, end }
    }
  }))
  logEditorEdit({
    requestId: `outline-direct-write-reveal_${record.batchId}`,
    batchId: record.batchId,
    workspace: 'outline',
    tabId: 'outline',
    operation: 'editor_write',
    result: 'applied',
    targetLength: currentContent.length,
    durationMs: 0,
    detail: '用户在大纲气泡中查看 AI 批次首处变更位置'
  })
}

function pendingOutlineDirectWriteFields() {
  const directWrite = pendingOutlineDirectWrite.value
  return directWrite
    ? { outlineBatch: directWrite.batch, outlineBatchRecord: directWrite.record }
    : {}
}

interface OutlineFocusNode {
  start: number
  end: number
  title?: string
  children?: OutlineFocusNode[]
}

function findOutlineFocusNode(
  nodes: OutlineFocusNode[],
  selection: string
): OutlineFocusNode | null {
  for (const node of nodes) {
    const children = Array.isArray(node.children) ? node.children : []
    const child = findOutlineFocusNode(children, selection)
    if (child) return child
  }
  return null
}

async function handleLockOutline() {
  if (projectStore.outlineLocked) {
    saveFeedback.value = '[提示] 大纲已锁定，如需修改请先解锁编辑'
    setTimeout(function() { saveFeedback.value = '' }, 3000)
    return
  }
  const outline = projectStore.outlineText.trim()
  if (!outline) {
    saveFeedback.value = '[WARN] 大纲为空，请先输入内容'
    setTimeout(function() { saveFeedback.value = '' }, 3000)
    return
  }

  try {
    if (!projectStore.currentProjectId) {
      projectStore.currentProjectId = 'proj-' + Date.now()
    }
    projectStore.projectName =
      projectStore.projectName ||
      outline.split('\n')[0].replace(/^#+\s*/, '').replace(/\s+/g, ' ').trim().substring(0, 20) ||
      '新小说'

    projectStore.setOutline(outline)
    projectStore.lockOutline()
    projectStore.syncTreeToPipeline()
    pipelineStore.setStep(0)

    saveFeedback.value = '[OK] 大纲已锁定，正在同步到流水线...'
    setTimeout(function() { saveFeedback.value = '' }, 3000)

    emit('navigate', 'pipeline')

    autoDecompose(outline)
  } catch (e: any) {
    saveFeedback.value = '[锁定失败] ' + (e.message || String(e))
    setTimeout(function() { saveFeedback.value = '' }, 3000)
  }
}

async function autoDecompose(outline: string) {
  if (!outline || outline.trim().length < 50) return
  const provider = providerStore.activeGenerateProvider
  if (!provider || !provider.apiKey) return

  const trace = useAiCallTrace({
    source: 'outline',
    stepName: '大纲自动拆解',
    mode: 'auto-decompose',
    projectId: projectStore.currentProjectId || undefined,
    projectName: projectStore.projectName,
    providerId: provider.id,
    providerName: provider.name,
    model: agentStore.activeAgent?.model || provider.selectedModel || provider.models?.[0] || ''
  })
  const runLabel = (kind: string, index: number, total: number) => `大纲自动拆解 ${index}/${total}：${kind}`
  let worstStatus: RunTraceStatus = 'success'
  const finishStep = (step: number, status: RunTraceStatus, error?: string) => {
    if (status === 'failed' || (status === 'degraded' && worstStatus !== 'failed')) worstStatus = status
    trace.addEvent({
      type: 'auto-decompose-step',
      level: status === 'success' ? 'info' : 'warn',
      label: runLabel(step === 1 ? '设定拆解' : '伏笔提取', step, 2),
      detail: error
    })
  }
  try {
    trace.begin()
    const decomposePrompt =
      '请从以下小说大纲中提取设定信息，根据大纲内容自行决定需要哪些分类（如角色、世界观、物种、物品、势力、地理、魔法体系、技术、组织等），不要限定在固定分类里。\n返回JSON数组，每项包含 category、name、content 字段。只返回JSON数组，不要其他文字。\n\n大纲：\n' +
      outline
    const decomposeResult = await callAi(
      decomposePrompt,
      '你是专业的小说设定编辑，擅长从大纲中提取各类设定信息，能根据大纲内容灵活判断需要哪些分类。',
      [],
      { source: 'outline', stepName: runLabel('设定拆解', 1, 2) }
    )
    parseDecomposedSettings(decomposeResult)
    finishStep(1, decomposeResult ? 'success' : 'degraded', decomposeResult ? undefined : 'API 无返回')
  } catch (e) {
    console.warn('[OutlineWorkspace] 设定自动拆解失败:', e)
    finishStep(1, 'failed', e instanceof Error ? e.message : String(e))
  }

  try {
    const foreshadowPrompt =
      '请从以下小说大纲中识别所有的伏笔（铺垫、暗示、悬念、未解之谜等）。\n返回JSON数组，每项包含 name、content 字段。只返回JSON数组，不要其他文字。\n\n大纲：\n' +
      outline
    const foreshadowResult = await callAi(
      foreshadowPrompt,
      '你是专业的小说结构分析师，擅长识别伏笔和铺垫。',
      [],
      { source: 'outline', stepName: runLabel('伏笔提取', 2, 2) }
    )
    parseForeshadows(foreshadowResult)
    finishStep(2, foreshadowResult ? 'success' : 'degraded', foreshadowResult ? undefined : 'API 无返回')
  } catch (e) {
    console.warn('[OutlineWorkspace] 伏笔提取失败:', e)
    finishStep(2, 'failed', e instanceof Error ? e.message : String(e))
  }
  trace.finish(worstStatus, worstStatus === 'success' ? undefined : '大纲自动拆解存在失败或降级步骤')
}

function parseDecomposedSettings(raw: string | null) {
  if (!raw) return
  const items = extractJsonArray(raw) as Array<Record<string, unknown>>
  if (!items || items.length === 0) return

  const sc = projectStore.getSettingsCollection()
  let count = 0
  for (const item of items) {
    if (!item.name) continue
    const cat = (item.category || '其他').toString()
    if (!sc.categories.includes(cat)) sc.categories.push(cat)
    if (!sc.items[cat]) sc.items[cat] = []
    sc.items[cat].push({
      id: 'set_' + Date.now() + '_' + count,
      name: item.name,
      category: cat,
      content: item.content || '',
      attrs: item.attrs || { 描述: item.content || '' },
      isBound: false,
      boundTo: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    })
    count++
  }
  if (count > 0) {
    projectStore.saveProject()
  }
}

function parseForeshadows(raw: string | null) {
  if (!raw) return
  const items = extractJsonArray(raw) as Array<Record<string, unknown>>
  if (!items || items.length === 0) return

  const category = '伏笔'
  const currentCats = (projectStore.memories?.categories ?? []).includes(category)
    ? projectStore.memories.categories
    : [...(projectStore.memories?.categories ?? []), category]
  const currentItems = [...(projectStore.memories?.items ?? [])]
  for (const item of items) {
    if (!item.name) continue
    currentItems.push({
      key: String(item.name || ''),
      category,
      content: String(item.content || '')
    })
  }
  if (projectStore.memories) projectStore.memories.categories = currentCats
  if (projectStore.memories) projectStore.memories.items = currentItems
  projectStore.saveProject()
}

async function saveOutline() {
  const text = projectStore.outlineText || ''
  if (!text.trim()) {
    saveFeedback.value = '[WARN] 大纲为空，无法保存'
    setTimeout(function() { saveFeedback.value = '' }, 3000)
    return
  }
  projectStore.setOutline(text)
  const defaultName = (projectStore.projectName || '大纲') + '.md'
  const filePath = await window.electronAPI.dialogSaveFile(defaultName)
  if (!filePath) {
    saveFeedback.value = '已取消保存'
    setTimeout(function() { saveFeedback.value = '' }, 2000)
    return
  }
  const ok = await window.electronAPI.dialogWriteFile(filePath, text)
  saveFeedback.value = ok ? '[OK] 已保存到本地' : '[失败] 无法写入文件'
  setTimeout(function() { saveFeedback.value = '' }, 3000)
}

function exportMd() {
  const text = projectStore.outlineText || ''
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = (projectStore.projectName || '大纲') + '.md'
  a.click()
}

function exportTxt() {
  const text = projectStore.outlineText || ''
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = (projectStore.projectName || '大纲') + '.txt'
  a.click()
}

async function copyMsg(text: string) {
  try {
    if (window.electronAPI && typeof window.electronAPI.clipboardWrite === 'function') {
      await window.electronAPI.clipboardWrite(text)
      return
    }
  } catch {}
  navigator.clipboard.writeText(text).catch(() => {
    const tmp = document.createElement('textarea')
    tmp.value = text
    document.body.appendChild(tmp)
    tmp.select()
    document.execCommand('copy')
    document.body.removeChild(tmp)
  })
}

function replaceOutline(text: string) {
  commitOutlineChange(text)
  saveFeedback.value = '[OK] 大纲已替换'
  setTimeout(function() { saveFeedback.value = '' }, 3000)
}

function insertAtCursor(text: string) {
  const ta = editorRef.value
  const current = projectStore.outlineText || ''
  if (!ta) {
    projectStore.outlineText = current + (current ? '\n' : '') + text
    projectStore.setOutline(projectStore.outlineText)
    return
  }
  const start = ta.selectionStart ?? current.length
  const end = ta.selectionEnd ?? current.length
  commitOutlineChange(current.slice(0, start) + text + current.slice(end))
  requestAnimationFrame(() => {
    ta.focus()
    const pos = start + text.length
    ta.selectionStart = ta.selectionEnd = pos
  })
}

async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || isGenerating.value) return
  projectStore.appendOutlineChat({ role: 'user', content: text })
  inputText.value = ''
  lastUserRequest.value = text
  await scrollToBottom()
  await askAi(text)
}

async function regenerateMsg(index: number) {
  if (isGenerating.value) {
    await appConfirm.alert('正在生成中，请等待当前回复完成后再重生成')
    return
  }
  const target = messages.value[index]
  if (!target || target.role !== 'assistant') {
    await appConfirm.alert('未找到这条回复，无法重生成')
    return
  }
  if (target.continuation) await removeContinuation(outlineProjectId(), OUTLINE_WORKSPACE_ID, OUTLINE_SESSION_ID)
  projectStore.removeOutlineChatAt(index)
  const requestText = lastUserRequest.value ||
    [...messages.value].reverse().find(function(m) { return m.role === 'user' })?.content || ''
  if (!requestText) {
    await appConfirm.alert('未找到这条回复对应的原始请求，无法重生成')
    return
  }
  await scrollToBottom()
  await askAi(requestText)
}

async function scrollToBottom() {
  await nextTick()
  if (msgContainer.value) msgContainer.value.scrollTop = msgContainer.value.scrollHeight
}

type OutlineRoutingDecision = {
  bypass?: boolean
  forcedIntent?: 'analyze' | 'edit' | 'generate' | 'discuss'
  recommendedSkillIds?: string[]
}

type OutlineRoutingFallbackBubble = {
  requestText?: string
  routing?: ChainRoutingResult
  runId?: string
  createdAt?: number
  resumeToken?: string
  recommendedSkillIds?: string[]
}

function classifyHomeIntent(requestText: string): PlainDialogueIntent {
  const recentHistory = getOutlineContextMessages(requestText)
    .slice(-4)
    .map(message => ({
      role: message.role,
      content: String(message.content || ''),
    }))
  return classifyPlainDialogueIntent(requestText, recentHistory)
}

async function askAi(requestText: string, routingDecision: OutlineRoutingDecision = {}) {
  if (isGenerating.value) return
  const templates = getWorkspaceTemplates()
  if (templates.length === 0) {
    await askPlainAi(requestText)
    return
  }
  const provider = providerStore.activeGenerateProvider
  if (!provider) {
    projectStore.appendOutlineChat({ role: 'assistant', content: '请先配置API供应商' })
    await scrollToBottom()
    return
  }
  const model = provider.selectedModel || provider.models?.[0] || 'gpt-4o'
  // The per-turn token limit is recorded from the actual request result.
  configureOutlineContextCompaction(model)
  const systemPrompt = buildOutlineSystemPrompt()
  const fallbackMessages = buildOutlineFallbackMessages(requestText)
  startOutlineRun(workspaceSkillMode.value, requestText, templates.map(template => template.name), {
    intent: routingDecision.forcedIntent,
    toolSurface: [],
    actualToolSurface: [],
  })
  generationController = new AbortController()
  isGenerating.value = true
  generationStatus.value = '正在连接 API...'
  liveToolStream.value = []
  streamingContent.value = ''
  pendingOutlineDirectWrite.value = null
    const startedAt = performance.now()
    let firstChunkSeen = false
    let activeWorkspaceApiCallId: string | undefined
    let outlineSkillTerminalStatus: RunTraceStatus | undefined
    let outlineSkillTerminalReason: string | undefined
  try {
    const aiService = await getAiService()
    let responseText = ''
    const apiBudget = createApiCallBudget(8)
    outlineApiBudget = apiBudget
    const result = await runWorkspaceSkills({
      requestText,
      templates,
      mode: workspaceSkillMode.value,
      aiService,
      contextService: conversationContextService,
      adapter: createWorkspaceSkillAdapter(),
      signal: generationController?.signal,
      apiBudget,
      routingOverride: routingDecision.bypass
        ? { bypass: true }
        : routingDecision.forcedIntent
          ? { forcedIntent: routingDecision.forcedIntent }
          : undefined,
      callbacks: {
        onFirstChunk: () => {
          firstChunkSeen = true
          generationStatus.value = `已收到内容 · 首字节 ${Math.round(performance.now() - startedAt)}ms`
        },
        onStatus: status => {
          if (!firstChunkSeen) generationStatus.value = status
        },
        onChunk: text => {
          streamingContent.value = text
          appendOutlineStream(text)
          void scrollToBottom()
        },
        onReasoning: text => {
          appendOutlineReasoning(text)
        },
        onApiCallStart: (skillId, skillName, callModel, actualToolSurface) => {
          const callId = startOutlineApiCall({
            skillName: skillName || skillId,
            requestMessages: [],
            model: callModel || model,
            intent: routingDecision.forcedIntent,
            toolSurface: [],
            actualToolSurface
          })
          if (callId) activeWorkspaceApiCallId = callId
          return callId
        },
        onGenerationEvent: (skillId, event) => {
          addOutlineTraceEvent({
            type: event.type,
            level: event.type === 'generation-invalid' ? 'warn' : 'info',
            label: event.type === 'generation-invalid'
              ? `SKILL「${skillId}」生成无效`
              : event.type === 'direct-retry-start'
                ? `SKILL「${skillId}」切换直出重试`
                : `SKILL「${skillId}」直出重试${event.success ? '成功' : '失败'}`,
            detail: JSON.stringify(event).slice(0, 20000)
          })
          generationStatus.value = event.message || '正在直出重试'
        },
        onApiCallFinish: (callId, meta, durationMs, result) => {
          if (callId) {
          const requestMessages = (meta.requestMessages || []).map(message => ({
            role: String(message.role || ''),
            content: String(message.content || '')
          }))
          if (requestMessages.length) runTraceStore.setApiCallRequest(outlineRunTraceId || '', callId, requestMessages)
          const toolRequestDeltas = (meta.toolRequestDeltas || []).map(message => ({
            role: String(message.role || ''),
            content: String(message.content || '')
          }))
          if (toolRequestDeltas.length) runTraceStore.setApiCallToolRequestDeltas(outlineRunTraceId || '', callId, toolRequestDeltas)
            const outcome = classifyRunOutcome({
              text: meta.responseText || result?.text,
              finishReason: meta.finishReason,
              usage: (meta.usage || null) as Record<string, unknown> | null,
              canceled: false,
              error: result?.status === 'failed' ? 'API 调用失败' : undefined
            })
            finishOutlineApiCall(callId, {
              status: outcome.status,
              responseText: meta.responseText || result?.text || '',
              reasoningText: meta.reasoningText || result?.reasoning || '',
              finishReason: meta.finishReason,
              usage: meta.usage,
              durationMs,
              error: outcome.error
            })
            if (activeWorkspaceApiCallId === callId) {
              activeWorkspaceApiCallId = undefined
            }
          }
        },
        onPhysicalCall: (_skillId, callId, event) => {
          recordOutlinePhysicalCall(callId, event)
        },
        onPromptBuilt: (event) => {
          if (!outlineRunTraceId) return
          const callId = activeWorkspaceApiCallId
          runTraceStore.attachPromptSnapshot(outlineRunTraceId, {
            apiCallId: callId,
            skillId: event.skillId,
            skillName: event.skillName,
            mode: event.mode,
            systemPrompt: event.systemPrompt,
            userPrompt: event.userPrompt,
            finalMessages: event.finalMessages.map(m => ({ role: m.role, content: String(m.content || '') })),
            variables: Object.entries(event.variables || {}).map(([key, value]) => ({
              key,
              source: 'template-context',
              chars: typeof value === 'string' ? value.length : JSON.stringify(value || null).length,
              value
            })),
          contextBlocks: event.contextBlocks,
          folderFingerprint: event.folderFingerprint,
        })
        },
        onSkillSkipped: (skillIndex, skillId, reason) => {
          addOutlineTraceEvent({
            type: 'skill-skipped',
            label: `跳过技能：${skillId}`,
            detail: reason
          })
        },
        onBeforeSkill: (skillIndex, skillId, skillName) => {
          addOutlineTraceEvent({
            type: 'skill-start',
            label: `开始执行：${skillName}`,
            detail: `步骤 ${skillIndex + 1}`
          })
        },
      onAfterSkill: (skillIndex, skillId, skillName, output) => {
        addOutlineTraceEvent({
          type: 'skill-complete',
          label: `完成：${skillName}`,
          detail: `输出 ${output.length} 字`
        })
      },
      onRoutingEvent: event => recordOutlineRoutingEvent(event)
    }
  })
  if (result.runState === 'awaiting_confirmation') {
    const fallbackRouting = result.awaiting?.routing || result.routing
    const recommendedSkillIds = (result.awaiting?.recommendedSkills || []).map(template => template.id)
    const awaitingState = outlineRunTraceId
      ? createRoutingAwaitState({
          runId: outlineRunTraceId,
          requestText,
          routing: fallbackRouting,
        })
      : undefined
    projectStore.appendOutlineChat({
      role: 'assistant',
      content: '',
      routingFallback: {
        routing: fallbackRouting || undefined,
        skillNames: templates.map(template => template.name || template.id),
        recommendedSkillIds,
        requestText,
        runId: awaitingState?.runId,
        createdAt: awaitingState?.createdAt,
        resumeToken: awaitingState?.resumeToken
      }
    })
    addOutlineTraceEvent({
      type: 'routing-fallback',
      label: '等待意图确认',
      detail: result.awaiting?.routing?.reason || '未识别到明确意图'
    })
    // BUG-2 修复：等待用户确认时不收尾，trace 保持 running；用户确认后由正常链路 finishRun
    generationStatus.value = '等待意图确认'
    if (outlineRunTraceId) runTraceStore.startAwaitingUser(outlineRunTraceId, 'awaiting_confirmation')
    return
  }
  if (result.runState === 'budget_exhausted') {
    projectStore.appendOutlineChat({
      role: 'assistant',
      content: result.text,
      budgetExhausted: {
        used: result.budgetSnapshot?.used || 0,
        limit: result.budgetSnapshot?.limit || 0,
        requestText
      }
    })
    addOutlineTraceEvent({
      type: 'budget-exhausted',
      level: 'warn',
      label: 'API 调用预算已用尽',
      detail: `已用 ${result.budgetSnapshot?.used || 0}/${result.budgetSnapshot?.limit || 0}，已保留断点`
    })
    finishOutlineRun('blocked', 'API 调用预算已用尽，等待用户追加', result.text, 'budget_exhausted')
    return
  }
    responseText = result.text
    lastWorkspaceSkillMeta = result.meta
    const workspaceToolCalls = (result.allMetas || [])
      .flatMap(meta => meta.toolCalls || [])
    if (workspaceToolCalls.length) {
      addOutlineTraceEvent({
        type: 'tool-call',
        label: '技能工具调用完成',
        detail: workspaceToolCalls.map(call => call.name).join(' → ')
      })
    }
    if (result.allMetas && result.allMetas.length > 1) {
      lastWorkspaceSkillMeta = result.allMetas[result.allMetas.length - 1] || result.meta
    }
    if (result.meta?.diagnostics?.length) {
      runTraceStore.setFolderDiagnostics(outlineRunTraceId || '', result.meta.diagnostics)
    }
    if (outlineRunTraceId && result.meta?.postProcessReport) {
      const report = result.meta.postProcessReport
      const postProcessTerminal = resolvePostProcessTerminalStatus(report)
      outlineSkillTerminalStatus = postProcessTerminal.runStatus
      outlineSkillTerminalReason = postProcessTerminal.eventReason
      runTraceStore.attachProcessingReport(outlineRunTraceId, {
        stage: 'post',
        processor: 'postProcess',
        status: postProcessTerminal.processingStatus,
        outputPreview: report.output.slice(0, 200),
        ruleHits: [{
          rule: report.changedOutput ? 'postProcess.output' : 'postProcess.no-change',
          count: report.issues.length
        }],
        issues: report.issues.map(issue => ({
          level: issue.severity === 'blocking' ? 'error' : issue.severity === 'warning' ? 'warning' : 'info',
          code: issue.code || 'post-process-issue',
          message: issue.message,
          blocking: issue.severity === 'blocking'
        })),
        startedAt: Date.now() - report.durationMs,
        endedAt: Date.now(),
        durationMs: report.durationMs
      })
      addOutlineTraceEvent({
        type: postProcessTerminal.eventReason,
        level: postProcessTerminal.runStatus === 'success' ? 'info' : postProcessTerminal.runStatus === 'degraded' ? 'warn' : 'error',
        label: postProcessTerminal.runStatus === 'success'
          ? 'postProcess 完成'
          : postProcessTerminal.runStatus === 'degraded'
            ? 'postProcess 输出已降级'
            : 'postProcess 阻断输出',
        detail: `${report.issues.length} 个 issue；changedOutput=${report.changedOutput}`
      })
    }
    addOutlineTraceEvent({
      type: 'skill-run-complete',
      label: '技能执行完成',
      detail: `模式：${result.mode}；技能：${templates.map(template => template.name).join('、')}`
    })
    const skillRunDiagnostics = result.meta && (result.meta.diagnostics?.length || result.meta.status === 'degraded')
      ? {
          status: result.meta.status || 'success',
          diagnostics: result.meta.diagnostics || [],
          requestMessages: result.meta.requestMessages,
          budget: result.meta.budget,
          folderPackageCache: result.meta.folderPackageCache
        }
      : null
    if (!responseText.trim()) throw new Error('API 返回为空')
    flushStreamingRender()
    const requestTarget = createOutlineRequestTarget()
    logEditorEdit({
      requestId: `outline-edit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      workspace: 'outline',
      tabId: 'outline',
      operation: 'editor_write',
      result: 'no_edit',
      targetLength: (projectStore.outlineText || '').length,
      contentLength: 0,
      durationMs: Math.round(performance.now() - startedAt),
      detail: workspaceToolCalls.length
        ? `工具直写响应：${workspaceToolCalls.length} 次调用`
        : '普通大纲响应，写入仅通过 editor.write 工具执行'
    })
    projectStore.appendOutlineChat({
      role: 'assistant',
      content: responseText,
      ...(skillRunDiagnostics ? { skillRunDiagnostics } : {}),
      ...(liveToolStream.value.length ? { outlineToolCallStream: [...liveToolStream.value] } : {}),
      ...pendingOutlineDirectWriteFields(),
    })
    const meta = lastWorkspaceSkillMeta
    if (meta && meta.finishReason && isTruncationReason(meta.finishReason)) {
      const snapshot = createOutlineSnapshot({
        requestMessages: meta.requestMessages,
        text: responseText,
        finishReason: meta.finishReason,
        model: meta.model || model,
        providerId: meta.providerId,
        skillIds: templates.map(template => template.id),
        agentIds: meta.agentId ? [meta.agentId] : [],
        mode: workspaceSkillMode.value === 'chain' ? 'chain' : 'compose'
      })
      if (snapshot) await attachOutlineSnapshot(messages.value.length - 1, snapshot)
    }
  } catch (e: any) {
    pendingOutlineDirectWrite.value = null
    if (generationController?.signal.aborted || e?.name === 'AbortError' || e?.code === 'canceled') {
      generationStatus.value = '已取消生成'
      if (streamingContent.value.trim()) {
        const snapshot = createOutlineSnapshot({
          requestMessages: lastWorkspaceSkillMeta?.requestMessages || fallbackMessages,
          text: streamingContent.value,
          finishReason: 'canceled',
          model: lastWorkspaceSkillMeta?.model || model,
          providerId: lastWorkspaceSkillMeta?.providerId,
          skillIds: templates.map(template => template.id),
          agentIds: lastWorkspaceSkillMeta?.agentId ? [lastWorkspaceSkillMeta.agentId] : [],
          mode: workspaceSkillMode.value === 'chain' ? 'chain' : 'compose'
        })
        projectStore.appendOutlineChat({ role: 'assistant', content: streamingContent.value })
      if (snapshot) await attachOutlineSnapshot(messages.value.length - 1, snapshot)
      }
    } else {
      const readableError = readableToolLoopError(e, lastWorkspaceSkillMeta?.finishReason)
      finishOutlineRun('failed', readableError, undefined, 'skill_execution_failed')
      projectStore.appendOutlineChat({ role: 'assistant', content: '生成失败：' + readableError })
    }
  } finally {
    pendingOutlineDirectWrite.value = null
    if (liveToolStream.value.length) {
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg?.role === 'assistant' && !lastMsg.outlineToolCallStream) {
        projectStore.updateOutlineChatAt(messages.value.length - 1, { outlineToolCallStream: [...liveToolStream.value] })
      }
    }
    if (outlineRunTraceId) {
      if (runTraceStore.isAwaitingUser(outlineRunTraceId)) {
        runTraceStore.cancelRunningApiCalls(outlineRunTraceId, '等待用户确认，未发起 API 调用')
      } else {
        runTraceStore.cancelRunningApiCalls(outlineRunTraceId, generationStatus.value === '已取消生成' ? '用户取消生成' : '运行收尾时仍未闭合')
      }
      finishOutlineRunIfRunning(
        generationStatus.value === '已取消生成'
          ? 'canceled'
          : (outlineSkillTerminalStatus || 'success'),
        generationStatus.value === '已取消生成' ? '用户取消生成' : undefined,
        streamingContent.value,
        generationStatus.value === '已取消生成'
          ? 'user_cancel'
          : (outlineSkillTerminalReason || 'skill_execution_complete')
      )
    }
    generationController = null
    isGenerating.value = false
    if (generationStatus.value !== '已取消生成' && generationStatus.value !== '等待意图确认') generationStatus.value = ''
    streamingContent.value = ''
  }
  await scrollToBottom()
}

function handleEditorBeforeInput() {
  if (projectStore.outlineLocked) return
  const now = Date.now()
  if (now - lastEditorHistoryAt < 800) return
  const current = projectStore.outlineText || ''
  if (undoStack.value[undoStack.value.length - 1] === current) return
  undoStack.value.push(current)
  if (undoStack.value.length > 50) undoStack.value.shift()
  redoStack.value = []
  lastEditorHistoryAt = now
}

async function askPlainAi(requestText: string) {
  const provider = providerStore.activeGenerateProvider
  if (!provider) {
    projectStore.appendOutlineChat({ role: 'assistant', content: '请先配置API供应商' })
    await scrollToBottom()
    return
  }
  const model = provider.selectedModel || provider.models?.[0] || 'gpt-4o'
  configureOutlineContextCompaction(model)
  const systemPrompt = buildOutlineSystemPrompt()
  let requestMessages: Array<{ role: string; content: string }> = []
  const plainIntent = classifyHomeIntent(requestText)
  const requestTarget = createOutlineRequestTarget()
  const plainSurface = requestTarget.content
    ? buildDialogueToolSurface({
      workspace: 'outline',
      intent: plainIntent,
      getSnapshot: () => createOutlineRequestTarget(),
      getAllSnapshots: buildOutlineWorkspaceSnapshots,
      onPlanUpdate: (plan) => {
        latestOutlineToolPlan = plan
      },
      mode: 'direct',
      applyWrite: async input => applyOutlineDirectWrite(input),
      onFailedBatch: batch => { outlineFailedWriteBatch = batch },
      takeFailedBatch: () => outlineFailedWriteBatch,
      revealTarget: async request => {
        if (request.workspace !== 'outline' || request.targetId !== 'outline') return
        window.dispatchEvent(new CustomEvent('diff-locate', {
          detail: {
            workspace: 'outline',
            targetId: 'outline',
            range: { start: request.start, end: request.end },
          },
        }))
      },
      extraTools: createOutlineTools({
        getSnapshot: () => createOutlineRequestTarget()
      }),
      readableTargets: ['outline', 'outline-settings'],
      writableTarget: 'outline',
    })
    : undefined
  const tools = plainSurface?.tools
  const plainToolSurface = plainSurface?.actualToolSurface
  startOutlineRun('direct', requestText, [], {
    intent: plainIntent,
    toolSurface: plainToolSurface,
    actualToolSurface: plainToolSurface,
  })
  generationController = new AbortController()
  cancelController = new AbortController()
  isGenerating.value = true
  generationStatus.value = '正在连接 API...'
  liveToolStream.value = []
  streamingContent.value = ''
  pendingOutlineDirectWrite.value = null
  outlineFailedWriteBatch = null
  const startedAt = performance.now()
  let firstChunkSeen = false
  let directStreamText = ''
  let latestOutlineToolPlan: EditorToolPlan | null = null
  let compatibilityModeUsed = false
  let plainAiResult: { finishReason?: string; maxTokens?: number } | null = null
  let lastToolRunSupervisorReason: string | null = null
  const toolRunSupervisor = createToolRunSupervisor({
    controller: generationController,
    onStuck: ({ reason, idleMs, totalMs, message }) => {
      lastToolRunSupervisorReason = reason
      generationStatus.value = message
      addOutlineTraceEvent({
        type: 'state-stuck-aborted',
        level: 'warn',
        label: '停滞请求已自动中止',
        detail: toolRunSupervisorEventDetail(reason, idleMs, totalMs)
      })
      const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
      if (diag && typeof diag.log === 'function') {
        diag.log('warn', 'outline/tool-run-supervisor', message, {
          reason,
          idleMs: Math.round(idleMs),
          totalMs: Math.round(totalMs),
          idleLimitMs: DIRECT_TOOL_RUN_IDLE_TIMEOUT_MS,
          hardDeadlineMs: DIRECT_TOOL_RUN_HARD_DEADLINE_MS,
        })
      }
    },
  })
  try {
    const aiService = await getAiService()
    const projectId = String(projectStore.currentProjectId || 'default')
    const contextRef = {
      projectId,
      workspace: 'outline' as const,
      purpose: 'generate' as const
    }
    const contextBundle = await conversationContextService.buildContextBundle({
      ...contextRef,
      workspaceState: {
        outline: projectStore.outlineText || '',
        outlineContextPack: conversationContextService.buildOutlineContextPack(
          projectStore.outlineText || '',
          getCurrentOutlineSelection()
        ) || undefined,
        selectedText: getCurrentOutlineSelection(),
        activeTab: '大纲编辑器',
        settings: projectStore.settingsCollection,
        memories: JSON.stringify(projectStore.memories || {})
      },
      legacyMessages: getOutlineContextMessages(requestText)
    })
    void conversationContextService.buildDialogueContextBlocks(
      contextBundle,
      conversationContextService.getPolicy('generate')
    )
    requestMessages = conversationContextService.assembleMessages(
      contextBundle,
      conversationContextService.getPolicy('generate'),
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: '用户请求: ' + requestText }
      ]
    )
    const actualToolSurface = plainToolSurface
    const traceApiCallId = startOutlineApiCall({
      skillName: '直接对话',
      requestMessages: requestMessages.map(message => ({
        role: String(message.role || ''),
        content: String(message.content || '')
      })),
      model,
      intent: plainIntent,
      toolSurface: plainToolSurface,
      actualToolSurface
    })
    const result = await aiService.callAi({
      purpose: 'generate',
      messages: requestMessages,
      model,
      stream: true,
      signal: generationController.signal,
      cancelSignal: cancelController?.signal,
      onChunk: (text: string) => {
        directStreamText += text
        streamingContent.value = directStreamText
        appendOutlineStream(text, true)
        if (!firstChunkSeen) {
          firstChunkSeen = true
          if (traceApiCallId) {
            runTraceStore.attachSemantic(outlineRunTraceId || '', traceApiCallId, {
              timeToFirstChunkMs: Math.round(performance.now() - startedAt)
            })
          }
          generationStatus.value = `已收到内容 · 首字节 ${Math.round(performance.now() - startedAt)}ms`
        } else {
          generationStatus.value = '正在生成...'
        }
        void scrollToBottom()
      },
      retry: false,
      tools,
      timeoutMs: DIRECT_TOOL_RUN_HARD_DEADLINE_MS,
      onPhysicalCall: (event) => {
        recordOutlinePhysicalCall(traceApiCallId, event)
        if (event.status === 'running' || event.streamText || event.responseText) toolRunSupervisor.reportProgress()
      },
      toolPolicy: tools ? {
        maxToolIterations: 6,
        intent: plainIntent,
        onPermissionDenied: event => {
          addOutlineTraceEvent({
            type: 'tool-permission-denied',
            level: 'error',
            label: '工具写入权限拒绝',
            detail: `${event.toolName}：${event.reason}`
          })
        },
        onConvergenceStart: () => {
          generationStatus.value = '工具调用已达上限，正在收敛最终回答...'
          addOutlineTraceEvent({
            type: 'tool-convergence-started',
            level: 'info',
            label: '开始收敛最终回答',
            detail: '工具调用轮次达到上限，已停止工具执行并开始最终回答请求'
          })
          toolRunSupervisor.dispose()
        },
        onRepeatedWriteBlocked: event => {
          addOutlineTraceEvent({
            type: 'write-duplicate-blocked',
            level: 'warn',
            label: '重复写入已拦截',
            detail: `${event.toolName}：连续 ${event.repeatCount} 次提交完全相同的写入参数，本次已拦截`
          })
        },
        onToolStart: (event) => {
          toolRunSupervisor.reportProgress()
          window.dispatchEvent(new CustomEvent('tool-activity', { detail: { type: 'tool_start', toolName: event.toolName, targetId: 'outline', policy: event.policy } }))
          liveToolStream.value.push({
            type: 'tool_start',
            toolName: event.toolName,
            stepDescription: `正在执行 ${event.toolName}…`,
            targetId: 'outline',
            iteration: event.iteration,
            ok: true,
          })
          if (!firstChunkSeen) generationStatus.value = `正在执行工具 ${event.toolName}...`
        },
        onToolCall: (event) => {
          toolRunSupervisor.reportProgress()
          if (!event.result.ok) toolRunSupervisor.reportToolError(`${event.toolName}:${event.result.error?.code || event.result.error?.message || 'unknown'}`)
          recordOutlineToolCall(traceApiCallId, event)
          const toolResult = event.result as {
            ok?: boolean
            error?: { message?: string }
            data?: { summary?: string; failedItems?: unknown[] }
          }
          const failedItems = Array.isArray(toolResult?.data?.failedItems)
            ? toolResult.data.failedItems
            : []
          const message = !toolResult?.ok
            ? (toolResult?.error?.message || toolResult?.data?.summary || JSON.stringify(toolResult?.data || {}) || '失败')
            : '已完成'
          const diagnosticCount = failedItems.length || diagnosticCountFromSummary(message)
          liveToolStream.value.push({
            type: event.result.ok ? 'tool_result' : 'tool_error',
            toolName: event.toolName,
            stepDescription: diagnosticCount
              ? `${message}（${diagnosticCount} 条命令需要修正）`
              : message,
            targetId: 'outline',
            iteration: event.iteration,
            ok: event.result.ok,
            error: event.result.ok ? undefined : message
          })
          if (!firstChunkSeen) generationStatus.value = `工具返回：${message}`
          window.dispatchEvent(new CustomEvent('tool-activity', {
            detail: {
              type: event.result.ok ? 'tool_result' : 'tool_error',
              toolName: event.toolName,
              targetId: 'outline',
              policy: event.policy,
              ok: Boolean(event.result.ok),
            }
          }))
          addOutlineTraceEvent({
            type: 'tool_call',
            level: event.result.ok ? 'info' : 'error',
            label: event.result.ok ? '工具调用完成' : '工具调用失败',
            detail: `${event.toolName}：${message}`
          })
        },
        onToolWarning: message => {
          generationStatus.value = message
          liveToolStream.value.push({
            type: 'tool_warning',
            toolName: 'tool-loop',
            stepDescription: message,
            targetId: 'outline',
            iteration: 0,
            ok: false,
            error: message
          })
        },
        onCompatibilityMode: () => {
          compatibilityNotice.value = '当前供应商未启用原生工具调用，已使用兼容模式'
        }
      } : undefined,
      meta: {
        source: 'OutlineWorkspace.askAi',
        workspace: 'outline',
        targetId: 'outline',
        readableTargets: ['outline', 'outline-settings'],
      },
    })
    plainAiResult = result
    const responseText = result.text || ''
    const plainOutcome = classifyRunOutcome({
      text: result.text,
      reasoning: result.reasoning,
      finishReason: result.finishReason,
      usage: result.usage,
      toolCalls: result.toolCalls
    })
    finishOutlineApiCall(traceApiCallId, {
      status: plainOutcome.status,
      responseText,
      reasoningText: result.reasoning || '',
      finishReason: result.finishReason,
      usage: result.usage,
      durationMs: result.durationMs,
      error: plainOutcome.error,
      retryStrategy: result.retryStrategy,
      maxTokens: result.maxTokens
    })
    if (result.compatibilityMode || result.toolsDowngraded) {
      addOutlineTraceEvent({
        type: 'tool-compatibility',
        level: 'warn',
        label: '工具调用使用兼容模式',
        detail: [
          result.compatibilityMode || result.toolsDowngraded || '',
          result.compatibilityWrite ? 'compatibility_write=true' : '',
        ].filter(Boolean).join(' / ')
      })
      compatibilityModeUsed = true
    }
    if (result.compatibilityWrite) {
      addOutlineTraceEvent({
        type: 'tool-compatibility',
        level: 'warn',
        label: '兼容模式完成大纲直写',
        detail: 'compatibility_write=true'
      })
      compatibilityNotice.value = '兼容模式直写：本次大纲写入已执行，但模型定位可靠性较低'
    }
    if (result.toolCalls?.length) {
      addOutlineTraceEvent({
        type: 'tool-call',
        label: '工具调用完成',
        detail: result.toolCalls.map(call => `${call.name}(${JSON.stringify(call.input)})`).join('\n')
      })
    }
    if (!responseText.trim()) {
      const emptyError: any = new Error('API 返回为空')
      emptyError.finishReason = result.finishReason
      throw emptyError
    }
    await conversationContextService.recordTurn(contextRef, {
      user: requestText,
      assistant: responseText,
      reservedOutputTokens: result.maxTokens,
      meta: {
        source: 'OutlineWorkspace.askPlainAi',
        model: result.model || model,
        providerId: result.providerId,
        toolCalls: result.toolCalls?.length ? result.toolCalls.map(call => call.name).join(' → ') : undefined
      }
    })
    flushStreamingRender()
    projectStore.appendOutlineChat({
      role: 'assistant',
      content: responseText,
      ...(latestOutlineToolPlan ? { outlineToolPlan: latestOutlineToolPlan } : {}),
      ...(liveToolStream.value.length ? { outlineToolCallStream: [...liveToolStream.value] } : {}),
      ...(compatibilityModeUsed ? { outlineCompatibilityMode: true } : {}),
      ...pendingOutlineDirectWriteFields(),
    })
    if (result.finishReason && isTruncationReason(result.finishReason)) {
      addOutlineTraceEvent({
        type: 'continuation-created',
        level: 'warn',
        label: '生成被截断，已创建续生成断点',
        detail: `finish_reason=${result.finishReason}`
      })
      const snapshot = createOutlineSnapshot({
        requestMessages,
        text: responseText,
        finishReason: result.finishReason,
        model: result.model || model,
        providerId: result.providerId
      })
      if (snapshot) await attachOutlineSnapshot(messages.value.length - 1, snapshot)
    }
  } catch (error: any) {
    const supervisorReason: string = lastToolRunSupervisorReason || ''
    if (generationController?.signal.aborted || error?.name === 'AbortError' || error?.code === 'canceled') {
      if (supervisorReason === 'stuck_timeout' || supervisorReason === 'hard_deadline' || supervisorReason === 'repeated_tool_error') {
        const supervisorMessage = toolRunSupervisorReadableMessage(supervisorReason)
        finishOutlineRun('failed', supervisorMessage, streamingContent.value, supervisorReason)
        projectStore.appendOutlineChat({ role: 'assistant', content: '生成失败：' + supervisorMessage })
      } else {
        generationStatus.value = '已取消生成'
        finishOutlineRun('canceled', '用户取消生成', streamingContent.value, 'user_cancel')
      }
      if (streamingContent.value.trim()) {
        const snapshot = createOutlineSnapshot({
          requestMessages,
          text: streamingContent.value,
          finishReason: 'canceled',
          model
        })
        projectStore.appendOutlineChat({ role: 'assistant', content: streamingContent.value })
        if (snapshot) await attachOutlineSnapshot(messages.value.length - 1, snapshot)
      }
    } else {
      const readableError = readableToolLoopError(error, plainAiResult?.finishReason)
      finishOutlineRun('failed', readableError, undefined, 'plain_dialogue_failed')
      projectStore.appendOutlineChat({ role: 'assistant', content: '生成失败：' + readableError })
      await conversationContextService.recordTurn({
        projectId: String(projectStore.currentProjectId || 'default'),
        workspace: 'outline',
        purpose: 'generate'
      }, {
        user: requestText,
        assistant: `[错误] ${readableError}`,
        reservedOutputTokens: plainAiResult?.maxTokens,
        meta: { source: 'OutlineWorkspace.askPlainAi', failed: true }
      }).catch(() => undefined)
    }
  } finally {
    pendingOutlineDirectWrite.value = null
    if (liveToolStream.value.length) {
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg?.role === 'assistant' && !lastMsg.outlineToolCallStream) {
        projectStore.updateOutlineChatAt(messages.value.length - 1, { outlineToolCallStream: [...liveToolStream.value] })
      }
    }
    if (outlineRunTraceId) {
      finishOutlineRunIfRunning('success', undefined, streamingContent.value, 'plain_dialogue_complete')
    }
    generationController = null
    cancelController = null
    isGenerating.value = false
    toolRunSupervisor.dispose()
    if (generationStatus.value !== '已取消生成') generationStatus.value = ''
    streamingContent.value = ''
  }
  await scrollToBottom()
}

async function continueOutlineMessage(index: number) {
  const msg = messages.value[index]
  const snapshot = msg?.continuation as ContinuationSnapshot | undefined
  if (isGenerating.value) {
    await appConfirm.alert('正在生成中，请等待当前回复完成后再续生成')
    return
  }
  if (!snapshot || !canContinue(snapshot)) {
    await appConfirm.alert('当前消息没有可续生成的中断状态')
    return
  }
  startOutlineRun('continue', snapshot.accumulatedText, snapshot.skillIds)
  runTraceStore.addEvent(outlineRunTraceId || '', {
    type: 'continuation-resume',
    level: 'warn',
    label: '续生成启动',
    detail: `已生成 ${snapshot.accumulatedText.length} 字，finish_reason=${snapshot.finishReason}，第 ${snapshot.continuationCount + 1} 次续生成`
  })
  isGenerating.value = true
  generationStatus.value = '正在续生成…'
  streamingContent.value = snapshot.accumulatedText
  generationController = new AbortController()
  try {
    const aiService = await getAiService()
    const continuationRequestMessages = buildContinuationMessages(snapshot)
    const traceApiCallId = startOutlineApiCall({
      skillName: '续生成',
      requestMessages: continuationRequestMessages.map(message => ({ role: message.role, content: String(message.content || '') })),
      model: snapshot.model
    })
    const result = await continueSnapshot(aiService, snapshot, {
      signal: generationController.signal,
      onPhysicalCall: event => recordOutlinePhysicalCall(traceApiCallId, event),
      onChunk: (text: string) => {
        streamingContent.value = snapshot.accumulatedText + text
        appendOutlineStream(text, true)
        void scrollToBottom()
      },
      onReasoning: (text: string) => {
        appendOutlineReasoning(text)
      }
    })
    const continuationOutcome = classifyRunOutcome({
      text: result.text,
      finishReason: result.finishReason,
      usage: result.usage
    })
    finishOutlineApiCall(traceApiCallId, {
      status: continuationOutcome.status,
      responseText: result.text,
      reasoningText: result.reasoning || '',
      finishReason: result.finishReason,
      durationMs: result.durationMs,
      error: continuationOutcome.error
    })
    const nextReason = result.finishReason || 'unknown'
    if (isTruncationReason(nextReason) && Boolean(result.text)) {
      const nextStatus = continuationStatusFor(nextReason as ContinuationSnapshot['finishReason'], true)
      const nextSnapshot = JSON.parse(JSON.stringify({
        ...snapshot,
        accumulatedText: result.text,
        continuationCount: snapshot.continuationCount + 1,
        status: nextStatus,
        finishReason: nextReason,
        statusHistory: [...(snapshot.statusHistory || []), { fromStatus: snapshot.status, toStatus: nextStatus, reason: `finish_reason=${nextReason}`, recordedAt: Date.now() }],
        updatedAt: Date.now()
      })) as ContinuationSnapshot
      projectStore.updateOutlineChatAt(index, { content: result.text, continuation: nextSnapshot })
      await saveContinuation(nextSnapshot, OUTLINE_SESSION_ID)
    } else {
      projectStore.updateOutlineChatAt(index, { content: result.text, continuation: undefined })
      await removeContinuation(snapshot.projectId, OUTLINE_WORKSPACE_ID, OUTLINE_SESSION_ID)
    }
  } catch (e: any) {
    if (generationController?.signal.aborted || e?.name === 'AbortError' || e?.code === 'canceled') {
      generationStatus.value = '已取消续生成'
      finishOutlineRun('canceled', '用户取消续生成', streamingContent.value, 'user_cancel')
    } else {
      generationStatus.value = '续生成失败：' + (e?.message || String(e))
      finishOutlineRun('failed', e?.message || String(e), streamingContent.value, 'continuation_failed')
    }
  } finally {
    if (outlineRunTraceId) finishOutlineRunIfRunning('success', undefined, streamingContent.value, 'continuation_complete')
    generationController = null
    isGenerating.value = false
    if (!String(generationStatus.value || '').startsWith('已取消')) generationStatus.value = ''
    streamingContent.value = ''
  }
  await scrollToBottom()
}

async function restoreOutlineContinuation() {
  try {
    const stored = await loadContinuation(outlineProjectId(), OUTLINE_WORKSPACE_ID, OUTLINE_SESSION_ID)
    if (!stored || !canContinue(stored)) return
    const list = projectStore.outlineChat
    for (let i = list.length - 1; i >= 0; i--) {
      const item = list[i]
      if (item?.role !== 'assistant') continue
      if (item.continuation) return
      if (String(item.content || '').trim() === String(stored.accumulatedText || '').trim()) {
        projectStore.updateOutlineChatAt(i, { continuation: JSON.parse(JSON.stringify(stored)) })
      }
      return
    }
  } catch {
    // 恢复失败不阻断工作台打开
  }
}

function cancelGeneration() {
  if (!generationController && !cancelController) return
  generationStatus.value = '正在取消...'
  generationController?.abort()
  cancelController?.abort()
}

async function resetConversation() {
  if (isGenerating.value) return
  const confirmed = await appConfirm.confirm({
    title: '重置对话',
    message: '将清空当前对话和会话上下文。API 下次请求会从当前大纲重新开始，不影响编辑器内容、项目记忆和运行记录。',
    confirmText: '清空',
    danger: true
  })
  if (!confirmed) return
  if (outlineRunTraceId) runTraceStore.markContextCompacted(outlineRunTraceId, '用户点击清空记忆')
  sealOutlineTraceSession()
  try {
    projectStore.outlineChat = []
    await conversationContextService.clearSession({
      projectId: String(projectStore.currentProjectId || 'default'),
      workspace: 'outline',
      purpose: 'generate'
    })
    inputText.value = ''
    compatibilityNotice.value = '上下文已重置，API 将从当前大纲重新开始。'
  } catch (error) {
    console.error('[outline] reset conversation failed:', error)
    compatibilityNotice.value = '重置对话失败：' + (error instanceof Error ? error.message : String(error))
  }
}

function handleUnlockOutline() {
  projectStore.unlockOutline()
  saveFeedback.value = '[OK] 已解锁，现在可以编辑大纲；修改后需重新确认才能进入流水线'
  nextTick(() => editorRef.value?.focus())
  setTimeout(function() { saveFeedback.value = '' }, 3000)
}
</script>

<style scoped>
.ow-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--bg-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
}
.ow-content {
  width: min(1000px, 92vw);
  height: min(700px, 88vh);
  max-width: 1000px;
  max-height: 88vh;
  background: var(--bg-glass);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  transition: width var(--duration-fast) var(--ease-standard), height var(--duration-fast) var(--ease-standard), border-radius var(--duration-fast) var(--ease-standard);
}
.ow-content.ows-fullscreen {
  width: 100vw;
  height: 100vh;
  max-width: none;
  max-height: none;
  border-radius: 0;
  border: none;
}
.ow-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-5) var(--space-8);
  border-bottom: 1px solid var(--border-color);
  font-size: var(--font-size-lg);
  font-weight: 600;
  flex-shrink: 0;
  gap: var(--space-5);
}
.ow-config-bar {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-4);
  font-size: var(--font-size-sm);
  font-weight: 400;
}
.ow-config-label {
  color: var(--text-secondary);
  white-space: nowrap;
}
.select-standard {
  min-width: 0;
  height: 28px;
  padding: var(--space-1) var(--space-4);
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
}
.select-standard.ow-skill-select {
  flex: 1 1 140px;
}
.select-standard.ow-mode-select {
  flex: 0 1 92px;
}
.ow-header-right {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}
.ow-icon-btn {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
}
.ow-icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.ow-chat-toggle {
  padding: var(--space-3) var(--space-5);
  font-size: var(--font-size-md);
  font-weight: 500;
  border: 1px solid var(--accent-color);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--accent-color);
  cursor: pointer;
  white-space: nowrap;
}
.ow-chat-toggle:hover {
  background: var(--accent-color);
  color: var(--text-on-accent);
}
.ow-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}
.ow-editor {
  flex: 1.2;
  min-width: 0;
  padding: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}
.ow-editor-header {
  display: flex;
  align-items: center;
  gap: var(--space-5);
  font-size: var(--font-size-md);
  font-weight: 600;
  color: var(--text-primary);
  flex-shrink: 0;
}
.ow-editor-header .word-count {
  margin-left: auto;
  font-size: var(--font-size-sm);
  font-weight: 400;
  color: var(--text-secondary);
  white-space: nowrap;
}
.ow-textarea {
  flex: 1;
  min-height: 0;
  width: 100%;
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: var(--space-6);
  font-size: var(--font-size-md);
  line-height: 1.8;
  resize: none;
  outline: none;
}
.ow-textarea.ow-readonly {
  background: var(--bg-panel);
  color: var(--text-secondary);
  cursor: not-allowed;
}
.ow-viewport-mirror {
  position: absolute;
  left: 0;
  top: 0;
  visibility: hidden;
  pointer-events: none;
}
.ow-viewport-highlight-layer {
  position: absolute;
  pointer-events: none;
  border-radius: var(--radius-xs);
}
.ow-viewport-highlight-layer.editor-viewport-highlight {
  background: color-mix(in srgb, var(--accent-color) 22%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent-color) 50%, transparent);
}
.ow-viewport-highlight-layer.editor-viewport-active-line {
  background: color-mix(in srgb, var(--accent-color) 12%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent-color) 38%, transparent);
}

.ow-tool-plan {
  margin-top: 8px;
  padding: var(--space-4) var(--space-5);
  border-left: 3px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.ow-tool-plan-title {
  margin-bottom: 4px;
  font-weight: 600;
  color: var(--text-primary);
}

.ow-tool-plan-steps {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: var(--space-1);
}
.ow-compatibility-mode {
  display: grid;
  gap: var(--space-1);
  margin-top: 8px;
  padding: var(--space-4) var(--space-5);
  border-left: 3px solid var(--warning, #d97706);
  background: var(--bg-secondary);
  font-size: var(--font-size-sm);
}
.ow-compatibility-mode-title {
  font-weight: 600;
  color: var(--text-primary);
}
.ow-compatibility-mode-desc {
  color: var(--text-secondary);
}
.ow-batch-status {
  color: var(--text-muted);
  font-size: var(--font-size-xs);
}
.editor-toolbar {
  display: flex;
  align-items: center;
  min-width: 0;
  margin-left: auto;
}
.editor-toolbar-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.ow-find-bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  flex-shrink: 0;
}
.ow-find-input {
  width: min(260px, 35%);
  min-width: 120px;
  height: 30px;
  padding: var(--space-2) var(--space-4);
  color: var(--text-primary);
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
}
.ow-find-result {
  min-width: 48px;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}
.ow-chat {
  flex: 1;
  min-width: 340px;
  border-left: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.ow-messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-5);
  min-height: 0;
}
.ow-msg {
  margin-bottom: 12px;
}
.ow-msg.user {
  text-align: right;
}
.ow-msg-bubble {
  display: inline-block;
  max-width: 85%;
  padding: var(--space-4) var(--space-6);
  border-radius: var(--radius-lg);
  text-align: left;
  word-break: break-word;
  user-select: text;
  cursor: text;
}
.ow-msg.user .ow-msg-bubble {
  background: var(--user-bubble);
}
.ow-msg.assistant .ow-msg-bubble {
  background: var(--ai-bubble);
  border: 1px solid var(--border-color);
}
.ow-msg-streaming .ow-streaming-status {
  margin: 0 0 var(--space-2) var(--space-1);
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}
.ow-msg-streaming .ow-msg-bubble {
  min-height: 24px;
}
.ow-msg-actions {
  display: flex;
  gap: var(--space-2);
  margin-top: 6px;
  padding-left: 2px;
}
.ow-edit-command {
  display: inline-block;
  margin-top: 6px;
  padding: var(--space-2) var(--space-4);
  color: var(--accent-color);
  background: var(--accent-dim);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
}
.ow-routing-fallback {
  margin-top: 6px;
  padding: var(--space-3) var(--space-4);
  border-left: 3px solid var(--accent);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}
.ow-routing-title {
  font-weight: 600;
  color: var(--text-primary);
}
.ow-routing-desc {
  margin: var(--space-1) 0;
  color: var(--text-muted);
}
.ow-routing-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.ow-routing-advanced summary {
  color: var(--text-muted);
  cursor: pointer;
  font-size: var(--font-size-xs);
}
.ow-routing-advanced[open] {
  display: contents;
}
.ow-msg.user .ow-msg-actions {
  justify-content: flex-end;
}
.msg-btn {
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  border-radius: var(--radius-xs);
  padding: var(--space-1) var(--space-4);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: var(--transition-fast);
}
.msg-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.ow-input-row {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-5) var(--space-5);
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
}
.ow-footer {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-5) var(--space-8);
  border-top: 1px solid var(--border-color);
  justify-content: flex-end;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.ow-footer-config {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-4);
}
.ow-selected-skills {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  overflow: hidden;
}
.ow-skill-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  max-width: 220px;
  height: 28px;
  padding: 0 var(--space-3);
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
}
.ow-skill-seq {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  border-radius: var(--radius-sm);
  background: var(--accent-dim);
  color: var(--accent);
  font-size: var(--font-size-xs);
}
.ow-skill-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ow-chip-agent {
  max-width: 92px;
  height: 24px;
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xs);
}
.ow-chip-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
}
.ow-chip-close:hover {
  color: var(--danger);
}
.save-feedback {
  font-size: var(--font-size-sm);
  color: var(--success);
  padding: 0 var(--space-4);
}
.ow-resize-handle {
  height: 6px;
  cursor: ns-resize;
  background: var(--border-color);
  border-radius: 0 0 12px 12px;
  flex-shrink: 0;
}
.ow-content.ows-fullscreen .ow-resize-handle {
  border-radius: 0;
}
.editor-toolbar-group {
  display: flex;
  gap: var(--space-2);
}
.btn-import { background: var(--accent-dim); color: var(--accent); border: 1px solid var(--accent); font-weight: 500; padding: var(--space-3) var(--space-6); border-radius: var(--radius-sm); cursor: pointer; transition: all var(--duration-fast) var(--ease-standard); } .btn-import:hover { background: var(--accent); color: var(--text-on-accent); } .btn-import:active { transform: scale(0.97); }
.ow-tool-stream-toggle { cursor: pointer; color: var(--text-muted); font-size: var(--font-size-xs); margin-left: 4px; }
.ow-tool-stream { margin-top: 4px; padding: var(--space-2) var(--space-4); border-left: 2px solid var(--accent); background: var(--bg-secondary); }
.ow-tool-stream-item { display: flex; align-items: center; gap: var(--space-2); font-size: var(--font-size-sm); }
.ow-tool-stream-item.tool_error { color: var(--chat-status-error); }
.ow-tool-stream-icon { flex: 0 0 auto; }
.ow-tool-stream-name { font-weight: 500; }
.ow-tool-stream-desc { color: var(--text-muted); flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>

