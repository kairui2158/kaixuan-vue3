<template>
  <section id="chat-panel" class="chat-panel">
    <div id="messages-container" class="messages-container" ref="messagesContainer">
      <EmptyState
        v-if="messages.length === 0"
        id="chat-empty-state"
        icon="spark"
        title="开始对话"
        description="在下方输入框输入消息，与 AI 助手开始创作"
      />
      <DynamicScroller
        v-if="messageVirtualizationEnabled"
        id="messages-list"
        ref="messageScrollerRef"
        :items="messages"
        :min-item-size="96"
        key-field="id"
        class="messages-list chat-message-scroller"
        :buffer="600"
        :prerender="12"
      >
        <template #default="{ item: msg, index: i, active }">
          <DynamicScrollerItem
            :item="msg"
            :active="active"
            :index="i"
            :data-message-id="msg.id"
          >
            <ChatMessageComponent
              :key="msg.id"
              :message="msg"
              :busy="isStreaming"
              :current-content-for-diff="editorContentForBatch(msg)"
              :providers="providerStore.providers"
              @copy="copyMessage"
              @regenerate="regenerateMessage(i)"
              @apply="insertToEditor(msg.content)"
              @replace="replaceWhole(msg.content)"
              @continue="continueMessage(msg)"
              @rollback="rollbackEditorBatch(msg)"
              @reveal="revealEditorBatch(msg)"
              @rollback-hunk="rollbackEditorBatchHunk(msg, $event)"
              @reveal-hunk="revealEditorBatchHunk(msg, $event)"
              @resume-task="aiTaskStore.resumeTask(aiTaskStore.activeTaskId!)"
              @pause-task="aiTaskStore.pauseTask(aiTaskStore.activeTaskId!)"
              @retry-step="aiTaskStore.retryStep(aiTaskStore.activeTaskId!)"
              @resume-breakpoint="resumeFromChainBreakpoint()"
              @discard-breakpoint="discardChainBreakpoint()"
              @routing-continue="continueRoutingFallback(msg)"
              @routing-bypass="bypassRoutingFallback(msg)"
              @budget-extend="extendRoutingBudget(msg)"
              @continue-final-draft="continueFinalDraftMessage(msg)"
              @resume-final-draft="resumeFinalDraftMessage(msg)"
              @retry-final-draft-segment-with-provider="retryFinalDraftSegmentMessage(msg, $event)"
              :chain-breakpoint="chainBreakpointInfo"
            />
          </DynamicScrollerItem>
        </template>
      </DynamicScroller>
      <div v-else id="messages-list" class="messages-list" ref="messageListRef">
        <ChatMessageComponent
          v-for="(msg, i) in messages"
          :key="msg.id"
          :message="msg"
          :busy="isStreaming"
          :current-content-for-diff="editorContentForBatch(msg)"
          :providers="providerStore.providers"
          @copy="copyMessage"
          @regenerate="regenerateMessage(i)"
          @apply="insertToEditor(msg.content)"
          @replace="replaceWhole(msg.content)"
          @continue="continueMessage(msg)"
          @rollback="rollbackEditorBatch(msg)"
          @reveal="revealEditorBatch(msg)"
          @rollback-hunk="rollbackEditorBatchHunk(msg, $event)"
          @reveal-hunk="revealEditorBatchHunk(msg, $event)"
          @resume-task="aiTaskStore.resumeTask(aiTaskStore.activeTaskId!)"
          @pause-task="aiTaskStore.pauseTask(aiTaskStore.activeTaskId!)"
          @retry-step="aiTaskStore.retryStep(aiTaskStore.activeTaskId!)"
          @resume-breakpoint="resumeFromChainBreakpoint()"
          @discard-breakpoint="discardChainBreakpoint()"
          @routing-continue="continueRoutingFallback(msg)"
          @routing-bypass="bypassRoutingFallback(msg)"
          @budget-extend="extendRoutingBudget(msg)"
          @continue-final-draft="continueFinalDraftMessage(msg)"
          @resume-final-draft="resumeFinalDraftMessage(msg)"
          @retry-final-draft-segment-with-provider="retryFinalDraftSegmentMessage(msg, $event)"
          :chain-breakpoint="chainBreakpointInfo"
        />
      </div>
    </div>

    <div v-if="isStreaming || generationMessage" id="chat-generation-status" class="chat-generation-status" :class="generationStatus">
      <span class="generation-status-dot" aria-hidden="true"></span>
      <span class="generation-status-text">
        <span
          v-for="(line, idx) in liveApiStatusLines"
          :key="`${line.kind}-${idx}`"
          class="chat-live-status-line"
          :class="`is-${line.kind}`"
        >{{ line.text }}</span>
      </span>
      <button v-if="isStreaming" id="btn-cancel-generation" class="generation-action generation-cancel" type="button" @click="cancelGeneration">取消生成</button>
      <button v-if="generationStatus === 'error' && lastFailedText" id="btn-retry-generation" class="generation-action" type="button" @click="retryLastRequest">重试</button>
    </div>
    <div v-else-if="compatibilityNotice" id="chat-compatibility-notice" class="chat-compatibility-notice">
      <span>{{ compatibilityNotice }}</span>
      <button type="button" @click="compatibilityNotice = ''">知道了</button>
    </div>
    <div v-if="sourceContaminationNotice" id="chat-source-contamination-notice" class="chat-compatibility-notice">
      <span>{{ sourceContaminationNotice }}</span>
      <button type="button" @click="sourceContaminationNotice = ''">知道了</button>
    </div>
    <EditTaskBanner
      :task="homeEditTask"
      :busy="homeInputBlocked"
      @resume="resumeHomeEditTask"
      @cancel="cancelHomeEditTask"
    />
    <div id="chat-input-row" class="chat-input-row">
      <ApiChatInput
        v-model="inputText"
        placeholder="输入消息..."
        :send-disabled="homeInputBlocked"
        send-label="发送"
        show-reset
        reset-label="重置对话"
        input-id="user-input"
        send-id="btn-send"
        reset-id="btn-reset-conversation"
        @send="() => sendMessage()"
        @reset="resetConversation"
      />
    </div>

      <div id="skill-area" class="skill-area">
      <div id="co-creation-config-row" class="co-creation-config-row">
        <label class="co-creation-field">
          <span class="co-creation-label">SKILL选择</span>
          <select
            id="co-skill-select"
            v-model="coCreationSkillToAdd"
            class="select-standard"
            aria-label="选择后添加到主页共创"
            @change="addCoCreationSkill"
          >
            <option value="">添加技能</option>
            <option v-for="skill in availableCoCreationSkills" :key="skill.id" :value="skill.id">{{ skillStore.displaySkillName(skill) }}</option>
          </select>
        </label>
        <label class="co-creation-field">
          <span class="co-creation-label">AGENT</span>
          <select
            id="co-agent-select"
            v-model="coCreationAgentId"
            class="select-standard"
            aria-label="主页共创默认智能体"
          >
            <option value="">默认</option>
            <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </label>
        <label class="co-creation-field">
          <span class="co-creation-label">模式</span>
          <select
            id="co-mode-select"
            v-model="coCreationMode"
            class="select-standard"
            aria-label="串行逐步传递，并行合并请求"
          >
            <option value="compose">并行</option>
            <option value="chain">串行</option>
          </select>
        </label>
      </div>
      <div id="co-skill-list" class="co-skill-list" v-if="selectedCoCreationSkills.length > 0">
        <span
          v-for="(skill, index) in selectedCoCreationSkills"
          :key="skill.id"
          class="co-skill-chip"
          :data-tooltip="skillStore.displaySkillName(skill)"
        >
          <span class="co-skill-seq">{{ index + 1 }}</span>
          <span class="co-skill-name">{{ skillStore.displaySkillName(skill) }}</span>
          <select
            v-if="coCreationMode === 'chain'"
            :value="coCreation.config.skillAgents[homeSkillAgentKey(skill.id)] || ''"
            class="co-skill-agent"
            aria-label="当前技能绑定的智能体"
            @change="handleCoSkillAgentChange(skill.id, ($event.target as HTMLSelectElement).value)"
          >
            <option value="">默认</option>
            <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
          <button class="co-skill-close" type="button" aria-label="移除技能" @click="removeCoCreationSkill(skill.id)"><AppIcon name="x" /></button>
        </span>
      </div>
    </div>

    <div id="char-count" class="input-hint">
      <span>{{ inputText.length }}</span> 字 |
        <span id="config-status">{{ configStatus }}</span>
        <span v-if="isStreaming" class="token-inline">生成中…</span>
    </div>
  </section>

</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useAgentStore } from '../../stores/agent'
import { useAppConfirm } from '../../composables/useAppConfirm'
import { useProviderStore } from '../../stores/provider'
import { useEditorStore } from '../../stores/editor'
import { useProjectStore } from '../../stores/project'
import { useSettingsStore } from '../../stores/settings'
import ChatMessageComponent from './ChatMessage.vue'
import EditTaskBanner from '../common/EditTaskBanner.vue'
import ApiChatInput from '../common/ApiChatInput.vue'
import EmptyState from '../common/EmptyState.vue'
import { useSkillStore } from '../../stores/skill'
import { useChatStore } from '../../stores/chat'
import { useCoCreationStore } from '../../stores/coCreation'
import { useAiTaskStore } from '../../stores/aiTaskStore'
import {
  getAiService,
  type PhysicalCallEvent,
  type ProviderQueueEvent,
} from '../../services/aiService'
import { projectPhysicalCallEvent } from '../../services/physicalCallTraceProjection'
import { extractJsonCandidates } from '../../services/jsonExtraction'
import { createIntentLlmFallback } from '../../services/intentLlmFallback'
import {
  consumeIntentCorpusInference,
  recordIntentRoutingConfirmation,
  recordIntentRoutingSample,
  stageIntentCorpusInference,
} from '../../services/intentCorpusCollector'
import { getProviderReasoningControl } from '../../services/providerProtocols'
import { classifyGenerationValidity, GENERATION_VALIDITY_MESSAGES } from '../../services/generationValidity'
import { detectVisiblePlanningRatio, VISIBLE_PLANNING_RATIO_THRESHOLD } from '../../services/visiblePlanningText'
import { buildWorkspaceSkillGuidance, createRoutingAwaitState, inferRoutingFallbackIntent, resolvePostProcessTerminalStatus, runWorkspaceSkills, validateRoutingResumeToken, type ChainRoutingEvent, type WorkspaceSkillEngineAdapter, type WorkspaceSkillToolRequest, type WorkspaceSkillTemplate } from '../../services/workspaceSkillEngine'
import { hydrateRuntimeFolderTemplates, type FolderSkillHydrationDiagnostic } from '../../services/folderSkillRuntimeHydration'
import { formatSkillFallback } from '../../services/skillRouter'
import { collectSkillPackageProtocolDiagnostics, type RealSkillDiagnostic } from '../../services/realSkillExecutor'
import {
  classifyPlainDialogueIntentDetailed,
  routeChainIntentDetailed,
  type DetailedChainRoutingResult,
  type ChainRoutingResult,
  type PlainDialogueIntentDetailed,
} from '../../services/chainIntentRouter'
import { createApiCallBudget } from '../../services/apiCallBudget'
import type { ApiCallBudget } from '../../services/apiCallBudget'
import { LONG_DOCUMENT_ACTIVE_TIMEOUT_MS } from '../../services/stateWatchdog'
import { getWorkspaceSkillAgentKey } from '../../services/skillAgentBinding'
import { MCPProtocol } from '../../services/mcp-protocol'
import { retrieveContext } from '../../services/memoryRetriever'
import { getLockedSettingsForLayer } from '../../services/settingsProjection'
import { characterLinesForLayer } from '../../services/settingsCharacterContext'
import { conversationContextService, resolveEffectiveModelContextWindow } from '../../services/conversationContextService'
import {
  buildSnapshot,
  buildContextPack,
  buildMainSnapshot,
  getReadCapChars,
} from '../../services/editorEntryFacade'
import type { ContextBudgetDecision } from '../../services/contextBudget'
import {
  buildLongDocumentExecutionPlan,
  toLongDocumentOperationType,
  usesLongDocumentToolRuntime,
} from '../../services/longDocumentExecutionPlanner'
import type { LongDocumentExecutionPlan } from '../../services/longDocumentExecutionPlanner'
import { transformDocument } from '../../services/documentTransformService'
import { createToolRunBudget } from '../../services/toolRunBudget'
import type { DialoguePermissionDecision, DialogueWriteAuthorization } from '../../services/dialogueToolSurface'
import type { LongDocumentOperationType } from '../../services/longDocumentPolicy'
import type { ContextMessage } from '../../types/context'
import { buildContinuationMessages, continueSnapshot } from '../../services/continuationService'
import { slimContinuationMessages } from '../../services/continuationSlim'
import { canContinue, continuationStatusFor, type ContinuationSnapshot } from '../../services/continuation'
import { saveContinuation, loadContinuation, removeContinuation } from '../../services/continuationStorage'
import { buildEditorReadonlyPrompt, type EditorEditCommand } from '../../services/editorEditProtocol'
import type { EditTaskCompletionReport } from '../../services/editTaskCompletion'
import { hashEditorContent, validateEditorTarget, type EditorTargetSnapshot } from '../../services/editorTarget'
import { createDocumentReadLedger, type DocumentReadLedger } from '../../services/documentReadLedger'
import { buildEditPlan } from '../../services/editorEditService'
import { canRollbackEditorBatch, createEditorBatchRecord, findEditorBatchUndoContent, normalizeEditorBatchRecord, toDialogueBatchEvent, updateEditorBatchRecord } from '../../services/editorBatchRecord'
import { applyAcceptedItems, planEditorEditBatch } from '../../services/editorEditBatch'
import { buildEditHunks, rebaseHunksAfterReject, type EditorDiffHunk } from '../../services/editorDiffHunks'
import { logEditorEdit, logEditorPresentation } from '../../services/editorEditDiagnostics'
import { captureWorkspaceSnapshot, clearWorkspaceSnapshot, hasWorkspaceSnapshot, restoreWorkspaceSnapshot } from '../../services/workspaceSnapshot'
import {
  appendDialogueToolSurfaceDeclaration,
  buildDialogueToolSurfaceDeclarationAudit,
  authorizeDialogueTools,
  type AgentToolDefinition,
  buildDialogueToolSurface,
  describeDialogueToolSurface,
  type EditorRevealer,
  type EditorWriteContaminationDecision,
  type EditorWriteApplier,
  type EditorWriteApplyInput,
  type ToolResult,
  type DialogueToolSurfaceIntent,
  type DialogueToolSurfaceSummary,
  type EditorWriteRetryCarrier,
  buildWorkflowWriteAuthorizationFromPlan,
  shouldRetryStalledDirectWrite,
} from '../../services/dialogueToolSurface'
import { classifyPlainDialogueIntent, type PlainDialogueIntent } from '../../services/plainDialogueIntent'
import type { ChatMessage } from '../../stores/chat'
import {
  useRunTraceStore,
  type RunTrace,
  type RunTraceExecutionSettlement,
  type RunTraceMessage,
  type RunTraceReadLedgerSnapshot,
  type RunTraceStatus
} from '../../stores/runTrace'
import { createAgentDialogueRuntime } from '../../services/agentDialogueRuntime'
import type { AgentOrchestratorStatus } from '../../services/agentOrchestrator'
import {
  createToolRunSupervisor,
  DIRECT_TOOL_RUN_HARD_DEADLINE_MS,
  DIRECT_TOOL_RUN_IDLE_TIMEOUT_MS,
  LONG_TOOL_RUN_IDLE_TIMEOUT_MS,
  buildToolErrorKey,
  physicalCallReportsProgress,
  type ToolRunSupervisor,
} from '../../services/toolRunSupervisor'
import { mapAgentResultToRunTrace, mergeEditTaskTerminal } from '../../services/agentTerminalMapping'
import {
  activeExecutionTaskStore,
  type ActiveExecutionTask,
} from '../../services/activeExecutionTaskStore'
import { isAgentRuntimeToolName } from '../../services/agentToolConflict'
import { useLiveApiStatus, type LiveApiStatusInput } from '../../composables/useLiveApiStatus'
import {
  continueFinalDraftTask,
  createFinalDraftStatusMessage,
  finalDraftStatusNeedsAction,
  finalDraftSourceHash,
  resumeFinalDraftTask,
  retryFinalDraftSegmentTask,
  runFinalDraft,
  snapshotFinalDraftTask,
} from '../../services/finalDraftRunner'
import { createElectronFinalDraftCheckpointStore } from '../../services/finalDraftCheckpointElectron'
import { finalDraftCheckpointId, resolveFinalDraftTaskFromView } from '../../services/finalDraftCheckpoint'
import { formatFinalDraftProgress } from '../../services/finalDraftProgress'
import {
  type FinalDraftEvent as FinalDraftRunnerTaskEvent,
  describeFinalDraftEvent,
  type FinalDraftDocumentState,
  type FinalDraftEditorAdapter,
  type FinalDraftTask,
} from '../../services/finalDraftService'
import type { FinalDraftEvent } from '../../services/finalDraftService'
import {
  useEditTaskSession,
  type EditTaskSessionLifecycleEvent,
} from '../../composables/useEditTaskSession'
import type { EditTask } from '../../services/editTaskService'
import { detectSourceContamination } from '../../services/sourceContaminationDetector'
import { describeRoutingDiagEvent } from '../../services/routingDiagBridge'

const agentStore = useAgentStore()
const providerStore = useProviderStore()
const editorStore = useEditorStore()
// P6-1: track consecutive no_edit responses for adaptive hint
const consecutiveNoEditCount = ref(0)
const appConfirm = useAppConfirm()
const skillStore = useSkillStore()
const chatStore = useChatStore()
const projectStore = useProjectStore()
const coCreation = useCoCreationStore()
const settingsStore = useSettingsStore()
const aiTaskStore = useAiTaskStore()

const projectId = computed(() => projectStore.currentProjectId || 'default')
const messages = computed(() => chatStore.activeMessages)
const runTraceStore = useRunTraceStore()
let homeRunTraceId: string | null = null
let activeHomeApiCallId: string | null = null
let homeLastDirectRequestId = 0
let homeStreamLength = 0
let homeRunTurnId: string | null = null
let homeSessionId = ''
let homeSessionReadLedger: DocumentReadLedger | null = null
let homeReadLedgerSessionKey = ''
let lastHomeToolAudit: unknown
let homeLongDocumentEditTaskPlan = false
let activeHomeExecutionPlan: LongDocumentExecutionPlan | null = null
let activeHomeRoutingIntent: PlainDialogueIntent = 'discuss'
let homeToolRunSupervisor: (ReturnType<typeof createToolRunSupervisor> & {
  readonly reason: string | null
}) | null = null

function createHomeToolRunSupervisor(longDocument: boolean) {
  let supervisorReason: string | null = null
  const supervisor = createToolRunSupervisor({
    idleTimeoutMs: longDocument ? LONG_TOOL_RUN_IDLE_TIMEOUT_MS : DIRECT_TOOL_RUN_IDLE_TIMEOUT_MS,
    hardDeadlineMs: longDocument ? null : DIRECT_TOOL_RUN_HARD_DEADLINE_MS,
    onStuck: ({ reason, idleMs, totalMs, message }) => {
      supervisorReason = reason
      chatStore.setGenerationState('error', message)
      addHomeTraceEvent({
        type: 'state-stuck-aborted',
        level: 'warn',
        label: '停滞请求已自动中止',
        detail: `reason=${reason} idleMs=${Math.round(idleMs)} totalMs=${Math.round(totalMs)} idleLimitMs=${longDocument ? LONG_TOOL_RUN_IDLE_TIMEOUT_MS : DIRECT_TOOL_RUN_IDLE_TIMEOUT_MS} longDocument=${longDocument} hardDeadlineMs=${longDocument ? null : DIRECT_TOOL_RUN_HARD_DEADLINE_MS}`
      })
      const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
      diag?.log?.('warn', 'home/tool-run-supervisor', message, {
        reason,
        idleMs: Math.round(idleMs),
        totalMs: Math.round(totalMs),
        idleLimitMs: longDocument ? LONG_TOOL_RUN_IDLE_TIMEOUT_MS : DIRECT_TOOL_RUN_IDLE_TIMEOUT_MS,
        longIdleLimitMs: longDocument ? LONG_TOOL_RUN_IDLE_TIMEOUT_MS : null,
        hardDeadlineMs: longDocument ? null : DIRECT_TOOL_RUN_HARD_DEADLINE_MS,
      })
      activeAbortController?.abort()
    },
  })
  return {
    ...supervisor,
    get reason() { return supervisorReason },
  }
}

function createHomeActiveTask(input: {
  requestText: string
  plan: LongDocumentExecutionPlan
  snapshot: EditorTargetSnapshot
}): ActiveExecutionTask | null {
  if (input.plan.operation === 'discussion' || input.plan.mode === 'final-draft') return null
  const now = Date.now()
  return activeExecutionTaskStore.create({
    taskId: `home-${input.plan.planId}`,
    workspace: 'main',
    projectId: String(projectId.value),
    originalRequest: input.requestText,
    operation: input.plan.operation,
    documentVersion: input.snapshot.contentVersion,
    contentHash: hashEditorContent(input.snapshot.content),
    createdAt: now,
    updatedAt: now,
    status: 'active',
    plan: input.plan,
    authorizedExcerpts: [],
  })
}

function isHomeWorkflowWriteAuthorization(
  writeAuthorization: unknown,
): writeAuthorization is DialogueWriteAuthorization {
  if (!writeAuthorization || typeof writeAuthorization !== 'object') return false
  const authorization = writeAuthorization as Partial<DialogueWriteAuthorization>
  return authorization.source === 'long-document-workflow'
    && (authorization.intent === 'edit' || authorization.intent === 'generate')
    && authorization.operation !== undefined
    && authorization.operation !== 'discussion'
    && authorization.mode !== undefined
    && authorization.mode !== 'final-draft'
}

const homeEditTaskSession = useEditTaskSession({
  sessionId: 'home',
  source: 'editor',
  hashContent: hashEditorContent,
  onLifecycle: event => recordHomeEditTaskEvent(event),
})
const homeEditTask = computed(() => homeEditTaskSession.activeTaskRef().value)

function recordHomeEditTaskEvent(event: EditTaskSessionLifecycleEvent) {
  closeInvalidActiveExecutionTaskForEditTask(event.task)
  const activeBatchId = event.task.activeBatchId
  const activeBatchDetail = activeBatchId ? event.task.plan.batchDetails?.[activeBatchId] : undefined
  const payload = {
    taskId: event.task.id,
    status: event.task.status,
    source: event.task.source,
    targetId: event.task.target.targetId,
    goal: event.task.goal,
    executedBatches: event.task.executedBatches,
    pendingBatches: event.task.pendingBatches,
    failedBatches: event.task.failedBatchIds,
    activeBatchId: event.task.activeBatchId,
    executionPlan: event.task.plan,
    batchId: activeBatchId,
    segmentId: activeBatchDetail?.segmentId,
    expectedChange: activeBatchDetail?.expectedChange,
    invariantResult: activeBatchDetail?.invariantResult,
  }
  addHomeTraceEvent({
    type: `edit-task-${event.type.replace(/_/g, '-')}`,
    level: event.type === 'batch_failed' ? 'warn' : 'info',
    label: `编辑任务：${event.type}`,
    detail: JSON.stringify(payload).slice(0, 20000),
    payload,
    turnId: homeRunTurnId,
  })
  if (homeRunTraceId) {
    runTraceStore.reportEditTaskActivity(homeRunTraceId, payload, {
      turnId: homeRunTurnId,
      persist: event.type === 'batch_failed' || event.type === 'task_finished' || event.type === 'task_failed',
    })
  }
  const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
  diag?.log?.(
    event.type === 'batch_failed' ? 'warn' : 'info',
    `edit-task/${event.type}`,
    `编辑任务事件：${event.type}`,
    payload,
  )
}

function isTerminalEditTaskStatus(status: EditTask['status']): boolean {
  return status === 'completed'
    || status === 'completed_with_warnings'
    || status === 'failed_before_write'
    || status === 'failed_after_write'
    || status === 'canceled'
}

function closeInvalidActiveExecutionTaskForEditTask(task: EditTask): void {
  if (!isTerminalEditTaskStatus(task.status)) return
  if (
    task.status === 'completed'
    || task.status === 'completed_with_warnings'
  ) {
    const snapshot = buildSnapshot({
      workspace: 'main',
      targetId: task.target.targetId,
      label: editorStore.activeTab?.title || '主页编辑器',
      chapterId: editorStore.activeTab?.chapterId,
      mode: editorStore.activeTab?.mode,
      content: editorStore.activeTab?.content || '',
    })
    activeExecutionTaskStore.complete(
      'main',
      String(projectId.value),
      snapshot.contentVersion,
      hashEditorContent(snapshot.content),
    )
    return
  }
  activeExecutionTaskStore.clear('main', String(projectId.value))
}

function completeHomeActiveTaskAfterLocalTransform(input: {
  target: EditorTargetSnapshot
  nextContent: string
}): void {
  const snapshot = buildSnapshot({
    workspace: 'main',
    targetId: input.target.targetId,
    label: input.target.label,
    chapterId: input.target.chapterId,
    mode: input.target.mode,
    content: input.nextContent,
    selectionStart: input.target.selectionStart,
    selectionEnd: input.target.selectionEnd,
  })
  activeExecutionTaskStore.complete(
    'main',
    String(projectId.value),
    snapshot.contentVersion,
    hashEditorContent(snapshot.content),
  )
}

function describeHomeLocalTransformResult(outcome: 'completed' | 'no_change', changedLineCount: number, durationMs: number) {
  return outcome === 'completed'
    ? `已本地完成整理：${changedLineCount} 行发生变化，耗时 ${durationMs}ms。未发起模型请求。`
    : `已检查当前文档：没有需要本地整理的变化，耗时 ${durationMs}ms。未发起模型请求。`
}

function recordHomeLocalTransform(input: {
  plan: LongDocumentExecutionPlan
  result: ReturnType<typeof transformDocument>
  sourceChars: number
  beforeHash: string
  afterHash: string
}) {
  const payload = {
    execution_mode: 'local-transform',
    planId: input.plan.planId,
    operations: input.result.operations,
    outcome: input.result.outcome,
    durationMs: input.result.durationMs,
    changedLineCount: input.result.changedLineCount,
    validation: input.result.validation,
    sourceChars: input.sourceChars,
    beforeHash: input.beforeHash,
    afterHash: input.afterHash,
    contextCompactedMessageCount: 0,
    reason: input.result.reason || null,
  }
  addHomeTraceEvent({
    type: 'local-transform-executed',
    level: 'info',
    label: '确定性整理已本地执行',
    detail: JSON.stringify(payload),
    payload,
  })
  ;(typeof window !== 'undefined' ? (window as any).DiagLogger : null)?.log?.(
    'info',
    'home/local-transform-executed',
    '确定性整理已本地执行',
    payload,
  )
}

async function runHomeLocalTransform(input: {
  plan: LongDocumentExecutionPlan
  target: EditorTargetSnapshot
  intent: PlainDialogueIntent
  requestText: string
}): Promise<boolean> {
  if (input.plan.mode !== 'local-transform' || !input.plan.localTransformOperations) return false
  const result = transformDocument({
    content: input.target.content,
    operations: input.plan.localTransformOperations,
  })
  if (result.outcome !== 'completed' && result.outcome !== 'no_change') return false
  const tab = editorStore.tabs.find(item => item.id === input.target.targetId)
  if (!tab) return false
  const currentContent = tab.content || ''
  if (currentContent !== input.target.content) return false
  startHomeRun('direct', input.requestText, [], {
    intent: input.intent,
    longDocument: true,
    toolSurface: [],
    actualToolSurface: [],
  })
  const beforeHash = hashEditorContent(input.target.content)
  const afterHash = hashEditorContent(result.content)
  recordHomeLocalTransform({
    plan: input.plan,
    result,
    sourceChars: input.target.content.length,
    beforeHash,
    afterHash,
  })
  if (result.outcome === 'completed') {
    editorStore.pushUndoTransactionForTab(tab.id, currentContent, 'api', '本地确定性整理')
    editorStore.updateContent(tab.id, result.content)
    window.dispatchEvent(new CustomEvent('editor-external-change', {
      detail: { tabId: tab.id, content: result.content },
    }))
    completeHomeActiveTaskAfterLocalTransform({
      target: input.target,
      nextContent: result.content,
    })
    const firstChange = firstContentDifference(currentContent, result.content)
    window.dispatchEvent(new CustomEvent('diff-locate', {
      detail: {
        workspace: 'main',
        targetId: tab.id,
        range: {
          start: firstChange,
          end: Math.max(firstChange + 1, firstChange + (result.content.length - currentContent.length)),
        },
      },
    }))
  }
  const content = describeHomeLocalTransformResult(result.outcome, result.changedLineCount, result.durationMs)
  if (result.outcome === 'no_change') {
    activeExecutionTaskStore.complete(
      'main',
      String(projectId.value),
      input.target.contentVersion,
      hashEditorContent(input.target.content),
    )
  }
  chatStore.addMessage({ role: 'user', content: input.requestText, tabId: chatStore.currentContext?.tabId || '' }, String(projectId.value))
  chatStore.addMessage({ role: 'assistant', content, tabId: chatStore.currentContext?.tabId || '' }, String(projectId.value))
  inputText.value = ''
  chatStore.setGenerationState('idle')
  finishHomeRun('success', undefined, content, 'local_transform_complete')
  await nextTick()
  scrollToBottom()
  return true
}

async function resumeHomeEditTask(task: { id: string }) {
  await homeEditTaskSession.resumeEditTask(task.id)
}

async function cancelHomeEditTask(task: { id: string }) {
  await homeEditTaskSession.onCancelEditTask(task.id)
}

function reportHomeEditTaskCompletion(report: EditTaskCompletionReport | null) {
  if (!report) return
  const verified = report.verified
  const payload = {
    verified,
    invariant: report.invariant,
    violations: report.violations,
  }
  addHomeTraceEvent({
    type: verified ? 'edit-task-completion-verified' : 'edit-task-completion-violation',
    level: verified ? 'info' : 'warn',
    label: verified ? '编辑任务完成度校验通过' : '编辑任务完成度校验失败',
    detail: JSON.stringify(payload).slice(0, 20000),
    payload,
    turnId: homeRunTurnId,
  })
  if (homeRunTraceId) {
    runTraceStore.reportEditTaskCompletion(homeRunTraceId, payload, {
      turnId: homeRunTurnId,
      persist: !verified,
    })
  }
  const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
  diag?.log?.(
    verified ? 'info' : 'warn',
    `edit-task/completion-${verified ? 'verified' : 'violation'}`,
    verified ? '编辑任务完成度校验通过' : '编辑任务完成度校验失败',
    payload,
  )
}

function reportHomeSourceContamination(sourceContent: string) {
  const contamination = detectSourceContamination(sourceContent, buildHomeConversationMarkers())
  if (!contamination.detected) return
  sourceContaminationNotice.value = '源文疑似包含上一轮对话说明文本，本次仍按你的当前指令执行，请在结果中重点核对插入说明附近的内容'
  const payload = {
    workspace: 'home-editor',
    sourceChars: sourceContent.length,
    matchCount: contamination.matches.length,
    truncated: contamination.truncated,
    matches: contamination.matches,
  }
  addHomeTraceEvent({
    type: 'source-contamination-detected',
    label: '源文疑似包含上一轮对话说明文本',
    level: 'warn',
    detail: JSON.stringify(payload),
    payload,
  })
  ;(typeof window !== 'undefined' ? (window as any).DiagLogger : null)?.log?.(
    'warn',
    'home/source-contamination-detected',
    '源文疑似包含上一轮对话说明文本',
    payload,
  )
}

function homeTraceTarget() {
  const tab = editorStore.activeTab
  return {
    type: tab?.mode || 'main',
    id: tab?.id || 'main',
    name: tab?.title || '主页编辑器',
    activeTab: tab?.title || '未打开页签',
    locked: false
  }
}

function startHomeRun(
  mode: string,
  requestText: string,
  skillNames: string[] = [],
  options: {
    intent?: PlainDialogueIntent
    longDocument?: boolean
    permissionDecision?: DialoguePermissionDecision
    writeMode?: 'direct'
    toolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
    actualToolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
  } = {},
) {
  const provider = providerStore.activeGenerateProvider
  const timeoutHint: RunTrace['timeoutHint'] = options.longDocument
    ? { active: LONG_DOCUMENT_ACTIVE_TIMEOUT_MS }
    : undefined
  homeStreamLength = 0
  const activeRun = homeRunTraceId ? runTraceStore.getRun(homeRunTraceId) : null
  if (
    activeRun &&
    activeRun.status === 'running' &&
    activeRun.sessionKind === 'chat' &&
    homeSessionId === (chatStore.currentContext?.tabId || '')
  ) {
    homeRunTraceId = activeRun.id
  } else {
    homeRunTraceId = runTraceStore.startRun({
      source: 'home',
      stepName: '主页共创',
      mode,
      sessionKind: 'chat',
      projectId: projectId.value,
      projectName: projectStore.projectName,
      providerId: provider?.id,
      providerName: provider?.name,
      model: provider?.selectedModel || provider?.models?.[0],
      skillNames,
      skillMode: skillNames.length ? mode : undefined,
      timeoutHint,
      target: homeTraceTarget(),
      context: {
        turns: messages.value.filter(item => item.role === 'user').length
      }
    })
    homeSessionId = chatStore.currentContext?.tabId || ''
  }
  homeRunTurnId = runTraceStore.startTurn(homeRunTraceId, {
    userRequest: requestText,
    skillNames,
    mode,
    intent: options.intent,
    timeoutHint,
    permissionDecision: options.permissionDecision,
    writeMode: options.writeMode,
    toolSurface: options.toolSurface,
    actualToolSurface: options.actualToolSurface
  })
  if (runTraceStore.getRun(homeRunTraceId)?.status === 'running') {
    runTraceStore.finishAwaitingUser(homeRunTraceId, `next_turn:${requestText.slice(0, 80)}`)
  }
  runTraceStore.addEvent(homeRunTraceId, {
    type: 'user-request',
    level: 'info',
    label: '用户请求',
    detail: requestText
  })
}

function appendHomeStream(text: string, isDelta = false) {
  const callId = runTraceStore.getApiCallId('home')
  if (!homeRunTraceId || !callId) return
  if (isDelta) {
    if (!text) return
    runTraceStore.appendStream(homeRunTraceId, callId, text)
    return
  }
  if (text.length < homeStreamLength) return
  const delta = text.slice(homeStreamLength)
  if (!delta) return
  homeStreamLength = text.length
  runTraceStore.appendStream(homeRunTraceId, callId, delta)
}

function appendHomeReasoning(callId: string | undefined, text?: string) {
  if (!homeRunTraceId || !text) return
  if (callId) runTraceStore.appendReasoning(homeRunTraceId, callId, text)
}

function finishHomeRun(status: RunTraceStatus, error?: string, resultPreview?: string, reason?: string) {
  const runId = homeRunTraceId
  if (!runId) return
  if (status === 'canceled' || status === 'failed') {
    if (status === 'canceled') {
      runTraceStore.cancelRunningApiCalls(runId, error || '用户取消生成')
    } else {
      runTraceStore.failRunningApiCalls(runId, error || '运行失败')
    }
  }
  const run = runTraceStore.getRun(runId)
  if (run && resultPreview) run.resultPreview = resultPreview
  if (run?.sessionKind === 'chat') {
    if (homeRunTurnId) runTraceStore.finishTurn(runId, homeRunTurnId, status, error, reason)
    return
  }
  runTraceStore.finishRun(runId, status, error, reason)
  homeRunTraceId = null
  homeStreamLength = 0
}

function sealHomeTraceSession() {
  const runId = homeRunTraceId
  if (!runId) return
  const run = runTraceStore.getRun(runId)
  if (!run || run.sessionKind !== 'chat') return
  if (run.status === 'running') runTraceStore.finishRun(runId, 'success')
  homeRunTraceId = null
  homeRunTurnId = null
  homeStreamLength = 0
}

function finishHomeTraceSession(status: RunTraceStatus, error?: string, reason?: string) {
  const runId = homeRunTraceId
  if (!runId) return
  const run = runTraceStore.getRun(runId)
  if (run?.sessionKind === 'chat') {
    if (homeRunTurnId) runTraceStore.finishTurn(runId, homeRunTurnId, status, error, reason)
    if (run.status === 'running') runTraceStore.finishRun(runId, status, error, reason)
  } else if (run?.status === 'running') {
    runTraceStore.finishRun(runId, status, error, reason)
  }
  homeRunTraceId = null
  homeRunTurnId = null
  homeStreamLength = 0
  activeHomeApiCallId = null
}

function addHomeTraceEvent(event: { type: string; label: string; level?: 'info' | 'warn' | 'error'; detail?: string; payload?: unknown; turnId?: string | null }) {
  const runId = homeRunTraceId
  if (!runId) return
  runTraceStore.addEvent(runId, {
    level: event.level || 'info',
    type: event.type,
    label: event.label,
    detail: event.detail?.slice(0, 20000),
    ...(event.payload !== undefined ? { payload: event.payload } : {}),
    ...(event.turnId ? { turnId: event.turnId } : {})
  })
}

function startHomeApiCall(input: {
  skillName?: string
  requestMessages: RunTraceMessage[]
  model?: string
  intent?: PlainDialogueIntent
  permissionDecision?: DialoguePermissionDecision
  toolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
  actualToolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
}) {
  const runId = homeRunTraceId
  if (!runId) return
  homeStreamLength = 0
  const callId = runTraceStore.startApiCall(runId, {
    source: 'home',
    skillName: input.skillName,
    providerId: providerStore.activeGenerateProvider?.id,
    providerName: providerStore.activeGenerateProvider?.name,
    model: input.model || providerStore.activeGenerateProvider?.selectedModel || providerStore.activeGenerateProvider?.models?.[0],
    requestMessages: input.requestMessages,
    intent: input.intent,
    permissionDecision: input.permissionDecision,
    toolSurface: input.toolSurface,
    actualToolSurface: input.actualToolSurface
  })
  activeHomeApiCallId = callId || null
  return callId
}

function finishHomeApiCall(callId: string | undefined, result: {
  status: RunTraceStatus
  responseText?: string
  reasoningText?: string
  finishReason?: string
  convergenceReason?: string
  usage?: unknown
  usageUnavailable?: boolean
  durationMs?: number
  error?: string
  compatibilityMode?: 'json-protocol'
  compatibilityWrite?: boolean
  toolsDowngraded?: boolean | 'json-protocol'
  downgradeReason?: string
  retryStrategy?: 'thinking_disabled' | 'max_tokens_raised' | 'prompt_only' | 'heartbeat_recovery'
    maxTokens?: number | null
  providerContextWindowTokens?: number
  estimatedInputTokens?: number
  contextBudgetDecision?: ContextBudgetDecision
  contextBudgetReason?: string
  usageReconciliation?: unknown
  textOrigin?: 'application' | 'model'
  toolAudit?: unknown
  executionSettlement?: RunTraceExecutionSettlement
  readLedger?: RunTraceReadLedgerSnapshot
}) {
  const runId = homeRunTraceId
  if (!runId || !callId) return
  runTraceStore.finishApiCall(runId, callId, result)
  if (activeHomeApiCallId === callId) activeHomeApiCallId = null
}

function closeActiveHomeApiCall(status: RunTraceStatus, error?: string) {
  const callId = activeHomeApiCallId
  if (!callId) return
  finishHomeApiCall(callId, { status, error })
}

function recordHomePhysicalCall(callId: string | undefined, event: PhysicalCallEvent) {
  if (!homeRunTraceId || !callId) return
  runTraceStore.appendPhysicalCall(homeRunTraceId, callId, projectPhysicalCallEvent(event))
}

function recordHomeProviderQueue(callId: string | undefined, event: ProviderQueueEvent) {
  if (!homeRunTraceId) return
  runTraceStore.addEvent(homeRunTraceId, {
    type: 'provider-queue',
    level: 'info',
    label: event.status === 'queued'
      ? `等待供应商槽位：第 ${event.position ?? 1}/${event.waiting ?? 1} 位`
      : event.status === 'started'
        ? '已获得供应商槽位'
        : '排队取消',
    detail: JSON.stringify(event),
    turnId: callId || undefined,
  })
}

  function recordHomeToolCall(callId: string | undefined, event: {
  toolName: string
  toolCallId?: string
  input: unknown
  argumentsRaw?: string
    result: ToolResult
    durationMs: number
    protocolVersion?: number
    protocolVersionDefaulted?: boolean
    toolCapability?: 'native_tools' | 'json_protocol'
    rejectionCategory?: 'unknown_tool' | 'schema_invalid' | 'permission_denied' | 'range_invalid' | 'invalid_protocol' | 'other'
    defaultToolPolicy?: 'allowedWithoutPermission' | 'allowedWithPermission' | 'disabled'
    riskLevel?: 'low' | 'medium' | 'high'
}) {
  if (!homeRunTraceId || !callId) return
  runTraceStore.appendToolCall(homeRunTraceId, callId, {
    name: event.toolName,
    toolCallId: event.toolCallId,
    input: event.input,
    argumentsRaw: event.argumentsRaw,
    result: event.result,
    status: event.result.ok ? 'success' : 'failed',
    durationMs: event.durationMs,
    error: event.result.ok ? undefined : event.result.error?.message,
    errorCode: event.result.ok ? undefined : event.result.error?.code,
    protocolVersion: event.protocolVersion,
    protocolVersionDefaulted: event.protocolVersionDefaulted,
    toolCapability: event.toolCapability,
    rejectionCategory: event.rejectionCategory,
    defaultToolPolicy: event.defaultToolPolicy,
    riskLevel: event.riskLevel,
  })
}

function recordEditorPresentation(event: {
  phase: 'start' | 'finished' | 'failed'
  workspace: 'main'
  targetId: string
  mode: string
  commands?: number
  reason?: string
}) {
  logEditorPresentation(event)
  const label = event.phase === 'start'
    ? '编辑器直写呈现开始'
    : event.phase === 'finished'
      ? '编辑器直写呈现完成'
      : '编辑器直写呈现失败'
  addHomeTraceEvent({
    type: `editor-presentation-${event.phase}`,
    level: event.phase === 'failed' ? 'error' : 'info',
    label,
    detail: JSON.stringify(event).slice(0, 20000)
  })
}

function compatibilityNoticeFor(result: {
  compatibilityWrite?: boolean
  toolCalls?: Array<{ name: string }>
}): string | null {
  if (result.compatibilityWrite) {
    return '兼容模式直写：本次编辑器写入已执行，但模型定位可靠性较低'
  }
  return null
}
const inputText = ref('')
const _pendingInlineOriginal = ref('')
const _pendingInlineSelection = ref<{ tabId: string; start: number; end: number } | null>(null)
let homeFailedWriteBatch: {
  workspace: string
  targetId: string
  contentVersion: number
  commands: EditorEditCommand[]
  succeededIndexes: number[]
} | null = null
let lastToolCallSummary: string | null = null
const messagesContainer = ref<HTMLElement | null>(null)
const messageScrollerRef = ref<any | null>(null)
const messageListRef = ref<HTMLElement | null>(null)
const isStreaming = computed(() => chatStore.generationStatus === 'preparing' || chatStore.generationStatus === 'streaming' || chatStore.generationStatus === 'retrying')
const MESSAGE_VIRTUALIZATION_THRESHOLD = 300
const messageVirtualizationEnabled = computed(() => messages.value.length >= MESSAGE_VIRTUALIZATION_THRESHOLD)
const homeSendStarting = ref(false)
const homeInputBlocked = computed(() =>
  isStreaming.value || homeSendStarting.value
)
const generationStatus = computed(() => chatStore.generationStatus)
const generationMessage = computed(() => chatStore.generationMessage)
const liveApiStatusLines = useLiveApiStatus(computed<LiveApiStatusInput>(() => ({
  active: isStreaming.value,
  message: generationMessage.value,
  latestCall: (() => {
    const runId = runTraceStore.getRunId('home')
    const call = runId ? runTraceStore.getRun(runId)?.apiCalls.at(-1) : undefined
    if (!call) return null
    return {
      status: call.status,
      streamLength: call.streamTotalChars ?? call.streamText.length,
      lastStreamActivityAt: call.lastStreamActivityAt,
      lastExecutionActivityAt: call.lastExecutionActivityAt,
      lastToolArgumentProgressAt: call.lastToolArgumentProgressAt,
      lastToolArgumentProgress: call.lastToolArgumentProgress,
      retrying: chatStore.generationStatus === 'retrying',
      executionSettlement: call.executionSettlement,
    }
  })()
})))
const lastFailedText = ref('')
const homeApiBudget = ref<ApiCallBudget | null>(null)
const homeBudgetTokens = new WeakMap<ApiCallBudget, string>()
let homeBudgetTokenSeq = 0

function pinnedHomeTab(targetId: string) {
  return editorStore.tabs.find(tab => tab.id === targetId)
}

function homeFinalDraftAdapter(targetId: string): FinalDraftEditorAdapter {
  return {
    getDocumentState: async (): Promise<FinalDraftDocumentState> => {
      const tab = pinnedHomeTab(targetId)
      if (!tab) throw new Error(`终稿目标页签不存在：${targetId}`)
      return {
        targetId,
        documentVersion: tab.isDirty ? 1 : 0,
        content: tab.content || '',
        contentHash: finalDraftSourceHash(tab.content || ''),
      }
    },
    writeDocument: async content => {
      const tab = pinnedHomeTab(targetId)
      if (!tab) throw new Error(`终稿目标页签不存在：${targetId}`)
      editorStore.pushUndoTransactionForTab(targetId, tab.content || '', 'api', '终稿写入')
      editorStore.updateContent(targetId, content)
      const next = pinnedHomeTab(targetId)
      return {
        targetId,
        documentVersion: (next?.isDirty ? 1 : 0) + 1,
        contentHash: finalDraftSourceHash(content),
      }
    },
    restoreDocument: async content => {
      const tab = pinnedHomeTab(targetId)
      if (!tab) throw new Error(`终稿目标页签不存在：${targetId}`)
      editorStore.updateContent(targetId, content)
      return {
        targetId,
        documentVersion: (tab.isDirty ? 1 : 0) + 1,
        contentHash: finalDraftSourceHash(content),
      }
    },
  }
}

function homeFinalDraftTraceHooks() {
  return {
    startApiCall: startHomeApiCall,
    finishApiCall: finishHomeApiCall,
    recordPhysicalCall: recordHomePhysicalCall,
    recordProviderQueue: recordHomeProviderQueue,
    appendStream: (text: string) => appendHomeStream(text, true),
    appendReasoning: appendHomeReasoning,
    addEvent: addHomeTraceEvent,
  }
}

function recordHomeFinalDraftTaskEvent(task: FinalDraftTask, event: FinalDraftEvent) {
  const described = describeFinalDraftEvent(event)
  addHomeTraceEvent({
    type: described.type,
    label: described.label,
    level: described.level,
    detail: JSON.stringify({
      taskId: task.taskId,
      status: task.status,
      activeSegmentIndex: task.activeSegmentIndex,
      segments: task.sourceSegments.length,
      accumulatedChars: task.accumulatedText.length,
      completedChars: task.completedText.length,
      continuationCount: task.continuationCount,
    }),
    payload: described.payload,
  })
}

function isHomeFinalDraftRequest(plan: LongDocumentExecutionPlan, requestText: string, targetContent: string) {
  return (plan.mode === 'final-draft' || plan.mode === 'single-pass')
    && Boolean(targetContent)
    && !requestText.trim().startsWith('@')
}

async function runHomeFinalDraft(options: {
  requestText: string
  targetId: string
  messageId: string
  sourceContent: string
  model: string
  plan: LongDocumentExecutionPlan
  skillGuidance?: string
  abortSignal: AbortSignal
  cancelSignal: AbortSignal
  conversationMarkers: Array<{ role: string; content: string }>
}): Promise<FinalDraftTask | undefined> {
  let latestTask: FinalDraftTask | undefined
  const aiService = await getAiService()
  const adapter = homeFinalDraftAdapter(options.targetId)
  const task = await runFinalDraft({
    aiService,
    adapter,
    destination: 'home-editor',
    targetId: options.targetId,
    sourceContent: options.sourceContent,
    instruction: options.requestText,
    operation: options.plan.operation,
    model: options.model,
    skillGuidance: options.skillGuidance,
    conversationMarkers: options.conversationMarkers,
    signal: options.abortSignal,
    cancelSignal: options.cancelSignal,
    checkpointStore: createElectronFinalDraftCheckpointStore(),
    sourceSegments: options.plan.finalDraftPlan?.segments?.map(segment => ({
      segmentId: segment.segmentId,
      start: segment.start,
      end: segment.end,
    })) || undefined,
    onTaskChange: task => {
      latestTask = task
      syncHomeFinalDraftMessage(options.messageId, task)
    },
    onProgress: event => {
      const segments = latestTask?.sourceSegments.length || 1
      const segmentIndex = Math.min((latestTask?.activeSegmentIndex || 0) + 1, segments)
      const completedChars = latestTask?.completedText.length || 0
      chatStore.setGenerationState('streaming', formatFinalDraftProgress({
        action: '生成',
        segmentIndex,
        segments,
        completedChars,
        streamingChars: event.streamingChars,
        telemetry: event.telemetry,
      }))
    },
    onTaskEvent: recordHomeFinalDraftTaskEvent,
  }, homeFinalDraftTraceHooks())
  return task || latestTask
}

function syncHomeFinalDraftMessage(messageId: string, task: FinalDraftTask) {
  const sessionId = chatStore.activeSession?.id
  const projId = projectId.value
  chatStore.updateMessageFinalDraftTask(messageId, task, sessionId, projId)
  chatStore.updateMessageContent(messageId, createFinalDraftStatusMessage(task), sessionId)
}

async function runHomeFinalDraftTurn(options: {
  requestText: string
  targetId: string
  sourceContent: string
  model: string
  plan: LongDocumentExecutionPlan
  skillGuidance?: string
  conversationMarkers: Array<{ role: string; content: string }>
}) {
  const projId = projectId.value
  const abortController = activeAbortController || new AbortController()
  activeAbortController = abortController
  if ((window as any).__SHENYI_FINAL_DRAFT_TEST_OVERRIDES__) {
    ;(window as any).__SHENYI_FINAL_DRAFT_ACTIVE_CONTROLLER__ = abortController
  }
  const cancelController = new AbortController()
  const releaseRunTracking = beginActiveHomeRunTracking()
  chatStore.addMessage({ role: 'user', content: options.requestText, tabId: chatStore.currentContext?.tabId || '' }, projId)
    const placeholder = chatStore.addMessage({
    role: 'assistant',
    content: '终稿任务已创建，正在准备生成。',
    tabId: chatStore.currentContext?.tabId || '',
  }, projId)
  if (!placeholder) {
    releaseRunTracking()
    return
  }
  await nextTick()
  scrollToBottom()
  try {
    chatStore.setGenerationState('preparing', '正在准备终稿生成…')
    addHomeTraceEvent({
      type: 'final-draft-mode-selected',
      level: 'info',
      label: '长文档终稿模式已启动',
      detail: JSON.stringify({
        planId: options.plan.planId,
        operation: options.plan.operation,
        destination: 'home-editor',
        targetId: options.targetId,
        sourceChars: options.sourceContent.length,
        segments: options.plan.finalDraftPlan?.segments?.length || 1,
      }),
    })
    const finalDraftTask = await runHomeFinalDraft({
      requestText: options.requestText,
      targetId: options.targetId,
      messageId: placeholder.id,
      sourceContent: options.sourceContent,
      model: options.model,
      plan: options.plan,
      skillGuidance: options.skillGuidance,
      conversationMarkers: options.conversationMarkers,
      abortSignal: abortController.signal,
      cancelSignal: cancelController.signal,
    })
    if (finalDraftTask) syncHomeFinalDraftMessage(placeholder.id, finalDraftTask)
    if (finalDraftTask?.status === 'completed') {
      finishHomeRun('success', undefined, createFinalDraftStatusMessage(finalDraftTask), 'final_draft_complete')
    } else if (finalDraftTask?.status === 'canceled') {
      finishHomeRun('canceled', '终稿任务已取消', undefined, 'final_draft_canceled')
    } else if (finalDraftTask?.status === 'awaiting_continuation') {
      finishHomeRun('success', undefined, createFinalDraftStatusMessage(finalDraftTask), 'final_draft_awaiting_continuation')
    } else if (finalDraftTask?.status === 'interrupted') {
      finishHomeRun('degraded', finalDraftTask.error || '终稿慢流中断，等待用户选择', createFinalDraftStatusMessage(finalDraftTask), 'final_draft_interrupted')
    } else {
      finishHomeRun('failed', finalDraftTask?.error || '终稿生成失败', undefined, 'final_draft_failed')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    chatStore.updateMessageContent(placeholder.id, '终稿任务失败：' + message, chatStore.activeSession?.id)
    finishHomeRun('failed', message, undefined, 'final_draft_runtime_exception')
  } finally {
    if (chatStore.generationStatus !== 'idle') chatStore.setGenerationState('idle')
    closeActiveHomeApiCall('failed', '终稿运行收尾时仍未闭合')
    activeAbortController = null
    releaseRunTracking()
    await nextTick()
    scrollToBottom()
  }
}

async function continueFinalDraftMessage(message: ChatMessage) {
  if (isStreaming.value) return
  const sourceContent = editorStore.tabs.find(tab => tab.id === message.finalDraftTask?.targetId)?.content || ''
  const resolved = await resolveFinalDraftTaskFromView(
    message.finalDraftTask,
    sourceContent,
    createElectronFinalDraftCheckpointStore(),
  )
  const task = resolved.ok ? resolved.task : undefined
  if (!task || !finalDraftStatusNeedsAction(task)) return
  const provider = providerStore.activeGenerateProvider
  if (!provider?.apiKey) {
    await appConfirm.alert('未配置 API 提供方或 API Key，无法继续生成终稿')
    return
  }
  const abortController = new AbortController()
  activeAbortController = abortController
  const cancelController = new AbortController()
  const releaseRunTracking = beginActiveHomeRunTracking()
  startHomeRun('continue-final-draft', '继续生成终稿', [], {
    intent: 'generate',
    longDocument: true,
    writeMode: 'direct',
  })
  const aiService = await getAiService()
  chatStore.setGenerationState('preparing', '正在继续生成终稿…')
  let latestTask: FinalDraftTask | undefined
  try {
    latestTask = await continueFinalDraftTask({
      aiService,
      adapter: homeFinalDraftAdapter(task.targetId),
      task,
      model: provider.selectedModel || provider.models?.[0] || 'gpt-4o',
      signal: abortController.signal,
      cancelSignal: cancelController.signal,
      checkpointStore: createElectronFinalDraftCheckpointStore(),
      onProgress: event => {
        const segments = latestTask?.sourceSegments.length || task.sourceSegments.length || 1
        const segmentIndex = Math.min((latestTask?.activeSegmentIndex ?? task.activeSegmentIndex) + 1, segments)
        const completedChars = latestTask?.completedText.length ?? task.completedText.length
        chatStore.setGenerationState('streaming', formatFinalDraftProgress({
          action: '续生成',
          segmentIndex,
          segments,
          completedChars,
          streamingChars: event.streamingChars,
          telemetry: event.telemetry,
        }))
      },
      onTaskChange: changed => {
        latestTask = changed
        syncHomeFinalDraftMessage(message.id, changed)
      },
      onTaskEvent: recordHomeFinalDraftTaskEvent,
    }, homeFinalDraftTraceHooks())
    syncHomeFinalDraftMessage(message.id, latestTask)
    if (latestTask.status === 'completed') {
      finishHomeRun('success', undefined, createFinalDraftStatusMessage(latestTask), 'final_draft_continuation_complete')
    } else if (latestTask.status === 'awaiting_continuation') {
      finishHomeRun('success', undefined, createFinalDraftStatusMessage(latestTask), 'final_draft_awaiting_continuation')
    } else {
      finishHomeRun('failed', latestTask.error || '终稿续生成失败', undefined, 'final_draft_continuation_failed')
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (latestTask) syncHomeFinalDraftMessage(message.id, latestTask)
    finishHomeRun('failed', errorMessage, undefined, 'final_draft_continuation_runtime_exception')
  } finally {
    if (chatStore.generationStatus !== 'idle') chatStore.setGenerationState('idle')
    closeActiveHomeApiCall('failed', '终稿续生成收尾时仍未闭合')
    activeAbortController = null
    releaseRunTracking()
    await nextTick()
    scrollToBottom()
  }
}

const FINAL_DRAFT_RESUME_REASONS: Record<string, string> = {
  checkpoint_not_found: '未找到分段检查点，可能尚未完成第一段，请重新发起终稿生成。',
  schema_version_mismatch: '分段检查点版本不兼容，请重新发起终稿生成。',
  task_not_resumable: '该检查点已完成或不可恢复。',
  checkpoint_corrupted: '分段检查点校验失败，请重新发起终稿生成。',
  source_content_mismatch: '源文内容已变化，为避免拼接错文，请重新发起终稿生成。',
  browser: '当前环境不支持持久化检查点，请在 Electron 应用内恢复。',
}

function finalDraftResumeErrorText(reason: string) {
  return FINAL_DRAFT_RESUME_REASONS[reason] || `终稿恢复失败：${reason}`
}

async function resumeFinalDraftMessage(message: ChatMessage) {
  if (isStreaming.value) return
  const storedTask = message.finalDraftTask
  const sourceContent = editorStore.tabs.find(tab => tab.id === storedTask?.targetId)?.content || ''
  const resolved = await resolveFinalDraftTaskFromView(
    storedTask,
    sourceContent,
    createElectronFinalDraftCheckpointStore(),
  )
  const task = resolved.ok ? resolved.task : undefined
  if (!task || task.status !== 'generating') return
  const provider = providerStore.activeGenerateProvider
  if (!provider?.apiKey) {
    await appConfirm.alert('未配置 API 提供方或 API Key，无法恢复终稿生成')
    return
  }
  const tab = editorStore.tabs.find(item => item.id === task.targetId)
  if (!tab) {
    await appConfirm.alert('终稿目标页签不存在，无法恢复。请重新打开源文页签后再试。')
    return
  }
  const abortController = new AbortController()
  activeAbortController = abortController
  const cancelController = new AbortController()
  const releaseRunTracking = beginActiveHomeRunTracking()
  startHomeRun('resume-final-draft', '从检查点恢复终稿', [], {
    intent: 'generate',
    longDocument: true,
    writeMode: 'direct',
  })
  const aiService = await getAiService()
  chatStore.setGenerationState('preparing', '正在恢复终稿检查点…')
  let latestTask: FinalDraftTask | undefined
  try {
    latestTask = await resumeFinalDraftTask({
      aiService,
      adapter: homeFinalDraftAdapter(task.targetId),
      checkpointId: finalDraftCheckpointId(task.taskId),
      sourceContent: tab.content || '',
      checkpointStore: createElectronFinalDraftCheckpointStore(),
      model: provider.selectedModel || provider.models?.[0] || 'gpt-4o',
      signal: abortController.signal,
      cancelSignal: cancelController.signal,
      onTaskChange: changed => {
        latestTask = changed
        syncHomeFinalDraftMessage(message.id, changed)
      },
      onTaskEvent: recordHomeFinalDraftTaskEvent,
    }, homeFinalDraftTraceHooks())
    syncHomeFinalDraftMessage(message.id, latestTask)
    if (latestTask.status === 'completed') {
      finishHomeRun('success', undefined, createFinalDraftStatusMessage(latestTask), 'final_draft_resume_complete')
    } else if (latestTask.status === 'awaiting_continuation') {
      finishHomeRun('success', undefined, createFinalDraftStatusMessage(latestTask), 'final_draft_resume_awaiting_continuation')
    } else {
      finishHomeRun('failed', latestTask.error || '终稿恢复后未完成', undefined, 'final_draft_resume_failed')
    }
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error)
    const reason = rawMessage.startsWith('final_draft_resume_failed:')
      ? rawMessage.slice('final_draft_resume_failed:'.length)
      : rawMessage
    const text = finalDraftResumeErrorText(reason)
    chatStore.updateMessageContent(message.id, text, chatStore.activeSession?.id)
    finishHomeRun('failed', text, undefined, 'final_draft_resume_runtime_exception')
  } finally {
    if (chatStore.generationStatus !== 'idle') chatStore.setGenerationState('idle')
    closeActiveHomeApiCall('failed', '终稿恢复收尾时仍未闭合')
    activeAbortController = null
    releaseRunTracking()
    await nextTick()
    scrollToBottom()
  }
}

async function retryFinalDraftSegmentMessage(message: ChatMessage, providerId?: string) {
  const storedTask = message.finalDraftTask
  const sourceContent = editorStore.tabs.find(tab => tab.id === storedTask?.targetId)?.content || ''
  const resolved = await resolveFinalDraftTaskFromView(
    storedTask,
    sourceContent,
    createElectronFinalDraftCheckpointStore(),
  )
  const existingTask = resolved.ok ? resolved.task : undefined
  if (
    !existingTask
    || (
      existingTask.status !== 'generating'
      && existingTask.status !== 'awaiting_continuation'
      && existingTask.status !== 'interrupted'
    )
  ) return
  const stalled = existingTask.status === 'generating'
    && existingTask.lastTelemetry?.throughputStatus === 'stalled'
  if (isStreaming.value && !stalled) return
  // Capture the retry snapshot before aborting; abort marks the live task canceled/failed.
  const retryTaskSnapshot = snapshotFinalDraftTask(existingTask)
  if (isStreaming.value) {
    activeAbortController?.abort()
    await activeHomeRunPromise?.catch(() => {})
  }
  const task = retryTaskSnapshot
  if (
    !task
    || (
      task.status !== 'generating'
      && task.status !== 'awaiting_continuation'
      && task.status !== 'interrupted'
    )
  ) return
  const activeProvider = providerStore.activeGenerateProvider
  const provider = providerId
    ? providerStore.getProvider(providerId)
    : activeProvider
  if (!provider?.apiKey) {
    await appConfirm.alert('未配置 API 提供方或 API Key，无法重试当前终稿分段')
    return
  }
  const tab = editorStore.tabs.find(item => item.id === task.targetId)
  if (!tab) {
    await appConfirm.alert('终稿目标页签不存在，无法重试当前段。请重新打开源文页签后再试。')
    return
  }
  const abortController = new AbortController()
  activeAbortController = abortController
  const cancelController = new AbortController()
  const releaseRunTracking = beginActiveHomeRunTracking()
  const aiService = await getAiService()
  chatStore.setGenerationState('preparing', '正在重试当前终稿分段…')
  let latestTask: FinalDraftTask | undefined
  try {
    latestTask = await retryFinalDraftSegmentTask({
      aiService,
      adapter: homeFinalDraftAdapter(task.targetId),
      task,
      model: provider.selectedModel || provider.models?.[0] || 'gpt-4o',
      providerId,
      providerSwitch: providerId
        ? {
            fromProviderId: activeProvider?.id,
            fromProviderName: activeProvider?.name,
            fromModel: activeProvider?.selectedModel || activeProvider?.models?.[0],
            toProviderId: provider.id,
            toProviderName: provider.name,
            toModel: provider.selectedModel || provider.models?.[0] || 'gpt-4o',
            beforeTelemetry: task.lastTelemetry,
          }
        : undefined,
      signal: abortController.signal,
      cancelSignal: cancelController.signal,
      checkpointStore: createElectronFinalDraftCheckpointStore(),
      onProgress: event => {
        const segments = latestTask?.sourceSegments.length || task.sourceSegments.length || 1
        const segmentIndex = Math.min((latestTask?.activeSegmentIndex ?? task.activeSegmentIndex) + 1, segments)
        const completedChars = latestTask?.completedText.length ?? task.completedText.length
        chatStore.setGenerationState('streaming', formatFinalDraftProgress({
          action: '重试当前段',
          segmentIndex,
          segments,
          completedChars,
          streamingChars: event.streamingChars,
          telemetry: event.telemetry,
        }))
      },
      onTaskChange: changed => {
        latestTask = changed
        syncHomeFinalDraftMessage(message.id, changed)
      },
      onTaskEvent: recordHomeFinalDraftTaskEvent,
    }, homeFinalDraftTraceHooks())
    syncHomeFinalDraftMessage(message.id, latestTask)
    const statusMessage = createFinalDraftStatusMessage(latestTask)
    if (latestTask.status === 'completed') {
      finishHomeRun('success', undefined, statusMessage, 'final_draft_segment_retry_complete')
    } else if (latestTask.status === 'awaiting_continuation') {
      finishHomeRun('success', undefined, statusMessage, 'final_draft_segment_retry_awaiting_continuation')
    } else if (latestTask.status === 'canceled') {
      finishHomeRun('canceled', '终稿当前段重试已取消', undefined, 'final_draft_segment_retry_canceled')
    } else if (latestTask.status === 'interrupted') {
      finishHomeRun('degraded', latestTask.error || '终稿慢流中断，等待用户选择', statusMessage, 'final_draft_segment_retry_interrupted')
    } else {
      finishHomeRun('failed', latestTask.error || '终稿当前段重试失败', statusMessage, 'final_draft_segment_retry_failed')
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (latestTask) syncHomeFinalDraftMessage(message.id, latestTask)
    finishHomeRun('failed', errorMessage, undefined, 'final_draft_segment_retry_runtime_exception')
  } finally {
    if (chatStore.generationStatus !== 'idle') chatStore.setGenerationState('idle')
    closeActiveHomeApiCall('failed', '终稿当前段重试收尾时仍未闭合')
    activeAbortController = null
    releaseRunTracking()
    await nextTick()
    scrollToBottom()
  }
}

function currentHomeBudgetToken() {
  const budget = homeApiBudget.value
  if (!budget) return undefined
  let token = homeBudgetTokens.get(budget)
  if (!token) {
    homeBudgetTokenSeq += 1
    token = `home-budget-${homeBudgetTokenSeq}`
    homeBudgetTokens.set(budget, token)
  }
  return token
}

function recordHomeRoutingEvent(event: ChainRoutingEvent) {
  const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
  const diagEvent = describeRoutingDiagEvent(event)
  diag?.log?.(diagEvent.level, diagEvent.category, diagEvent.message, diagEvent.payload)
  if (event.type === 'routing_started') {
    addHomeTraceEvent({ type: 'routing-started', label: '开始意图路由', detail: event.requestText })
  } else if (event.type === 'routing_result') {
    const routing = event.result
    if (
      routing.kind === 'matched' &&
      homeRunTraceId &&
      homeRunTurnId
    ) {
      const matchedIntent = routing.intent
      const requestTarget = createMainEditorTargetSnapshot(editorStore.activeTab)
      const reroutedSurface = requestTarget.content
        ? buildHomeDialogueToolSurface(
          requestTarget,
          matchedIntent,
          undefined,
          activeHomeExecutionPlan ?? undefined,
          undefined,
          event.requestText,
        )
        : { tools: [] as AgentToolDefinition[] }
      const authorizedSurface = authorizeDialogueTools(reroutedSurface.tools, matchedIntent)
      runTraceStore.updateTurnIntent(homeRunTraceId, homeRunTurnId, {
        intent: matchedIntent,
        permissionDecision: authorizedSurface.permissionDecision,
        routingFallback: 'none',
        toolSurface: reroutedSurface.tools.map(tool => ({
          name: tool.name,
          policy: tool.policy || 'read' as const,
        })),
        actualToolSurface: authorizedSurface.actualToolSurface,
      })
    }
    addHomeTraceEvent({
      type: 'routing-result',
      label: `意图路由结果：${routing.kind}`,
      detail: `${routing.reason}${'fallbackMode' in routing ? ` | fallback=${routing.fallbackMode}` : ''}`
    })
    if (
      routing.kind !== 'matched' &&
      homeRunTraceId &&
      homeRunTurnId
    ) {
      runTraceStore.updateTurnIntent(homeRunTraceId, homeRunTurnId, {
        routingFallback: routing.fallbackMode,
      })
    }
  } else if (event.type === 'skill_skipped') {
    addHomeTraceEvent({
      type: 'skill-skipped',
      label: `跳过技能：${event.skillId}`,
      detail: event.reason
    })
  } else if (event.type === 'routing_diagnostics') {
    addHomeTraceEvent({
      type: 'routing-diagnostics',
      label: `意图路由诊断：${event.diagnostics.router.decisionLayer}`,
      detail: JSON.stringify(event.diagnostics)
    })
  } else if (event.type === 'chain_handoff') {
    addHomeTraceEvent({
      type: 'chain-handoff',
      level: event.artifact.repeatedHashCount ? 'warn' : 'info',
      label: `链式步骤 Handoff：${event.artifact.sourceSkillId}`,
      detail: JSON.stringify(event.artifact)
    })
  } else if (event.type === 'budget_exhausted') {
    addHomeTraceEvent({
      type: 'budget-exhausted',
      level: 'warn',
      label: 'API 调用预算已用尽',
      detail: `已用 ${event.budget.used}/${event.budget.limit}，阻断位置：${event.step}`
    })
    addHomeTraceEvent({
      type: 'state-transition',
      label: 'ChainRunState：running → budget_exhausted',
      detail: '预算耗尽，等待用户追加后恢复'
    })
  } else if (event.type === 'run_completed') {
    addHomeTraceEvent({ type: 'routing-run-complete', label: '链式技能执行完成', detail: event.state })
    if (event.state === 'completed') {
      addHomeTraceEvent({
        type: 'state-transition',
        label: 'ChainRunState：running → completed',
        detail: '全部链式技能执行完成'
      })
    }
  }
}

function clearRoutingFallback(messageId: string) {
  const session = chatStore.activeSession
  const message = session?.messages.find(item => item.id === messageId)
  if (!message) return
  message.routingFallback = undefined
  message.budgetExhausted = undefined
  if (!session) return
  session.updatedAt = Date.now()
  void chatStore.saveSessions(projectId.value)
}

type RoutingFallbackBubble = {
  requestText?: string
  routing?: ChainRoutingResult
  runId?: string
  createdAt?: number
  resumeToken?: string
}

async function continueRoutingFallback(message: { id?: string; routingFallback?: RoutingFallbackBubble }) {
  if (isStreaming.value || !message.routingFallback) return
  const fallback = message.routingFallback
  if (!fallback.requestText) return
  recordIntentRoutingConfirmation({
    projectId: projectId.value,
    projectName: projectStore.projectName,
    workspace: 'home-editor',
    runId: fallback.runId,
    requestText: fallback.requestText,
    intent: inferRoutingFallbackIntent(fallback.routing || {
      kind: 'no_match',
      confidence: 0,
      reason: 'low-confidence',
      fallbackMode: 'await-user',
    }),
  })
  const tokenValid =
    fallback.runId === homeRunTraceId &&
    validateRoutingResumeToken(fallback, homeRunTraceId)
  if (fallback.runId && !tokenValid) {
    addHomeTraceEvent({
      type: 'routing-resume-token-invalid',
      level: 'warn',
      label: '意图确认恢复令牌失效',
      detail: `bubble_run=${fallback.runId}; current_run=${homeRunTraceId || 'none'}`
    })
  } else if (fallback.runId) {
    runTraceStore.finishAwaitingUser(fallback.runId, `resume:${fallback.requestText.slice(0, 80)}`)
  }
  if (message.id) clearRoutingFallback(message.id)
  await sendMessage(fallback.requestText, {
    forcedIntent: inferRoutingFallbackIntent(fallback.routing || {
      kind: 'no_match',
      confidence: 0,
      reason: 'low-confidence',
      fallbackMode: 'await-user',
    })
  })
}

function recordHomeBatchEvent(
  record: ReturnType<typeof normalizeEditorBatchRecord>,
  status: Parameters<typeof toDialogueBatchEvent>[1],
  reason?: string,
) {
  if (!record) return
  runTraceStore.addBatchEvent('home', toDialogueBatchEvent(record, status, reason))
}

async function bypassRoutingFallback(message: { id?: string; routingFallback?: { requestText?: string } }) {
  if (isStreaming.value || !message.routingFallback?.requestText) return
  const requestText = message.routingFallback.requestText
  addHomeTraceEvent({
    type: 'user-bypassed-routing',
    level: 'warn',
    label: '用户跳过意图路由',
    detail: '本次直接全链执行，不写入配置'
  })
  if (message.id) clearRoutingFallback(message.id)
  await sendMessage(requestText, { bypass: true })
}

async function extendRoutingBudget(message: {
  id?: string
  budgetExhausted?: { requestText?: string; budgetToken?: string }
}) {
  if (isStreaming.value || !message.budgetExhausted?.requestText) return
  const requestText = message.budgetExhausted.requestText
  const budget = homeApiBudget.value
  if (!budget) {
    await appConfirm.alert('本次执行的预算对象已释放，请重新发起请求')
    return
  }
  if (message.budgetExhausted.budgetToken && message.budgetExhausted.budgetToken !== currentHomeBudgetToken()) {
    await appConfirm.alert('已有更新的执行占用预算，请从最新一条预算提示继续')
    return
  }
  const next = budget.extend(4)
  addHomeTraceEvent({
    type: 'budget-extended',
    level: 'warn',
    label: '用户追加 API 预算',
    detail: `追加 4 次；当前 ${next.used}/${next.limit}`
  })
  if (message.id) clearRoutingFallback(message.id)
  await sendMessage(requestText, { resumedApiBudget: budget })
}

type HomeRoutingDecision = {
  bypass?: boolean
  forcedIntent?: 'analyze' | 'edit' | 'generate' | 'discuss'
  resumedApiBudget?: ApiCallBudget
  precomputedRouting?: DetailedChainRoutingResult
}

const compatibilityNotice = ref('')
const sourceContaminationNotice = ref('')
let activeAbortController: AbortController | null = null
let activeHomeRunPromise: Promise<unknown> | null = null
function beginActiveHomeRunTracking(): () => void {
  let resolveRun!: () => void
  activeHomeRunPromise = new Promise<void>(resolve => {
    resolveRun = resolve
  })
  return () => {
    resolveRun()
    activeHomeRunPromise = null
  }
}
const maxDepthRef = ref(21)
const coCreationSkillToAdd = ref('')
const DEFAULT_CO_CREATION_HISTORY_TURNS = 10

function getChatContextMessages(currentRequest: string): ContextMessage[] {
  return chatStore.activeMessages
    .filter(message => (message.role === 'user' || message.role === 'assistant') && message.content?.trim())
    .filter(message => !message.routingFallback && !message.budgetExhausted)
    .filter(message => !(message.role === 'user' && message.content === currentRequest))
    .slice(-maxDepthRef.value * 2)
    .map(message => ({ role: message.role, content: message.content }))
}

const coCreationAgentId = computed({
  get: () => coCreation.config.agentId,
  set: (v: string) => { coCreation.setAgent(v) }
})

async function classifyHomeIntentDetailed(
  requestText: string,
): Promise<DetailedChainRoutingResult> {
  const requestTarget = createMainEditorTargetSnapshot(editorStore.activeTab)
  const activeHomePlanTask = activeExecutionTaskStore.getValidSnapshot(
    'main',
    String(projectId.value),
    requestTarget.contentVersion,
    hashEditorContent(requestTarget.content),
  )
  const recentHistory = getChatContextMessages(requestText)
    .slice(-4)
    .map(message => ({
      role: message.role,
      content: String(message.content || ''),
    }))
  const result = await routeChainIntentDetailed(requestText, {
    projectId: projectId.value,
    workspace: 'home-editor',
    activeEditTaskStatus: homeEditTask.value?.status === 'awaiting_batch'
      ? 'awaiting_batch'
      : undefined,
    activePlanStatus: activeHomePlanTask?.status === 'awaiting_user_plan' || activeHomePlanTask?.status === 'active'
      ? activeHomePlanTask.status
      : undefined,
    recentUserMessages: recentHistory
      .filter(message => message.role === 'user')
      .map(message => message.content),
    recentHistory,
    activeSkillIds: selectedCoCreationSkills.value.map(skill => skill.id),
    llmClassifier: createIntentLlmFallback({
      activeVerifyProvider: providerStore.activeVerifyProvider,
      activeGenerateProvider: providerStore.activeGenerateProvider,
      onTraceEvent: event => addHomeTraceEvent({
        type: event.type,
        label: event.type === 'intent-llm-fallback-start'
          ? '意图 LLM 兜底开始'
          : `意图 LLM 兜底${event.status === 'success' ? '成功' : event.status === 'canceled' ? '取消' : '失败'}`,
        level: event.type === 'intent-llm-fallback-start' || event.status === 'success' ? 'info' : 'error',
        detail: JSON.stringify(event),
      }),
      }),
  })
  return result
}

function addHomeRoutingDiagnostics(
  diagnostics: PlainDialogueIntentDetailed['diagnostics'],
) {
  addHomeTraceEvent({
    type: 'routing-diagnostics',
    label: `意图路由诊断：${diagnostics.router.decisionLayer}`,
    detail: JSON.stringify(diagnostics),
  })
}

const coCreationMode = computed({
  get: () => coCreation.config.mode,
  set: (v: string) => { coCreation.setMode(v === 'chain' ? 'chain' : 'compose') }
})

const selectedCoCreationSkills = computed(() => {
  return coCreation.config.skillIds
    .map(id => skillStore.getSkill(id))
    .filter((skill): skill is NonNullable<typeof skill> => Boolean(skill))
})

const availableCoCreationSkills = computed(() => {
  const selected = new Set(coCreation.config.skillIds)
  return skillStore.skills.filter(skill => !selected.has(skill.id))
})

function homeSkillAgentKey(skillId: string): string {
  return getWorkspaceSkillAgentKey('home', skillId)
}

function addCoCreationSkill() {
  const id = coCreationSkillToAdd.value
  if (id && coCreation.addSkill(id)) {
    void coCreation.saveConfig(coCreation.config)
  }
  coCreationSkillToAdd.value = ''
}

function removeCoCreationSkill(skillId: string) {
  if (coCreation.removeSkill(skillId)) {
    void coCreation.saveConfig(coCreation.config)
  }
}

function handleCoSkillAgentChange(skillId: string, agentId: string) {
  coCreation.setSkillAgent(skillId, agentId)
  void coCreation.saveConfig(coCreation.config)
}

function getHomeSkillTemplates(): WorkspaceSkillTemplate[] {
  return selectedCoCreationSkills.value
    .filter(skill => skill && (skill.template || (skill.format === 'folder' && skill.folderPath)))
    .map(skill => ({
      id: skill.id,
      name: skillStore.displaySkillName(skill),
      version: skill.version,
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
      ,meta: skill.meta
      ,contextPolicy: skill.contextPolicy
    }))
}

function getHomeSkillMaxDepth(): number {
  const depths = selectedCoCreationSkills.value
    .map(skill => Number(skill.injectDepth))
    .filter(depth => Number.isFinite(depth) && depth > 0)
  return depths.length > 0 ? Math.min(...depths, 21) : 21
}

/**
 * buildSOI - Structured Outline Index replacing 500-char truncation
 * Ref: Agent-Skills-for-Context-Engineering
 * Exp: S8 rule62/67
 */
function buildSOI(mode: string | undefined, activeTab: any): string {
  const volumes = projectStore.volumes || []
  const volumeOverview = volumes
    .map((v) => (v.name || v.title || '未命名') + '：' + (v.summary || v.outline || '').slice(0, 100))
    .join('\n')

  if (!mode || mode === 'main') {
    return projectStore.outlineText || ''
  }

  if (mode === 'vol-outline') {
    const volIdx = volumes.findIndex((v) => v.id === activeTab?.chapterId || v.name === activeTab?.title)
    const vol = volIdx >= 0 ? volumes[volIdx] : null
    if (!vol) return volumeOverview ? '【全局卷概览】\n' + volumeOverview : ''
    const chs = projectStore.chapters[vol.id] || []
    const chapterList = chs.length > 0
      ? chs.map((ch, i) => '  ' + (i + 1) + '. ' + (ch.title || ch.name || '未命名') + (ch.summary ? ' — ' + ch.summary.slice(0, 50) : '')).join('\n')
      : '  （本卷暂无章节）'
    const parts = []
    if (volumeOverview) parts.push('【全局卷概览】\n' + volumeOverview)
    parts.push('【当前上下文锚点】\n' + (vol.name || vol.title || '未命名') + ' 的卷纲要：\n' + (vol.outline || vol.summary || '（空）') + '\n\n本卷包含 ' + chs.length + ' 章：\n' + chapterList)
    return parts.join('\n\n')
  }

  if (mode === 'ch-plot') {
    for (let vi = 0; vi < volumes.length; vi++) {
      const chs = projectStore.chapters[volumes[vi].id] || []
      const chIdx = chs.findIndex((c) => c.id === activeTab?.chapterId)
      if (chIdx >= 0) {
        const ch = chs[chIdx]
        const prevCh = chIdx > 0 ? chs[chIdx - 1] : null
        const nextCh = chIdx < chs.length - 1 ? chs[chIdx + 1] : null
        const parts = []
        if (volumeOverview) parts.push('【全局卷概览】\n' + volumeOverview)
        parts.push('【当前上下文锚点】\n' + (volumes[vi].name || volumes[vi].title || '未命名') + '（第' + (vi + 1) + '卷）\n本卷纲要：' + (volumes[vi].outline || volumes[vi].summary || '').slice(0, 500) + '\n\n当前章节：' + (ch.title || ch.name || '未命名') + '\n\n前后章节：\n  前一章：' + (prevCh?.title || '无') + '\n  后一章：' + (nextCh?.title || '无'))
        return parts.join('\n\n')
      }
    }
    return volumeOverview ? '【全局卷概览】\n' + volumeOverview : ''
  }

  if (mode === 'ch-body') {
    for (let vi = 0; vi < volumes.length; vi++) {
      const chs = projectStore.chapters[volumes[vi].id] || []
      const chIdx = chs.findIndex((c) => c.id === activeTab?.chapterId)
      if (chIdx >= 0) {
        const ch = chs[chIdx]
        const prevCh = chIdx > 0 ? chs[chIdx - 1] : null
        const parts = []
        if (volumeOverview) parts.push('【全局卷概览】\n' + volumeOverview)
        parts.push('【当前上下文锚点】\n' + (volumes[vi].name || volumes[vi].title || '未命名') + '（第' + (vi + 1) + '卷）\n本卷纲要：' + (volumes[vi].outline || volumes[vi].summary || '').slice(0, 300) + '\n\n当前章节：' + (ch.title || ch.name || '未命名') + '\n章节剧情：' + (ch.plot || ch.summary || '').slice(0, 500) + '\n\n前一章摘要：' + (prevCh ? (prevCh.summary || prevCh.plot || '').slice(0, 200) : '无'))
        return parts.join('\n\n')
      }
    }
    return volumeOverview ? '【全局卷概览】\n' + volumeOverview : ''
  }

  return volumeOverview ? '【全局卷概览】\n' + volumeOverview : ''
}

function createHomeSkillAdapter(
  fallbackIntent: PlainDialogueIntent = 'discuss',
): WorkspaceSkillEngineAdapter {
  const requestTarget = createMainEditorTargetSnapshot(editorStore.activeTab)
  const breakpointOwnerKey = `main:${requestTarget.targetId}:${projectId.value}`
  return {
    workspace: 'main',
    source: 'HomeCoCreation.skill',
    projectId: projectId.value,
    breakpointOwnerKey,
    toolContext: {
      targetId: requestTarget.targetId,
      readableTargets: [requestTarget.targetId],
    },
    step: 0,
    preferredModel: undefined,
    defaultSystemPrompt: '你是小说主页编辑器创作助手。',
    getBaseAgentId: () => coCreation.config.agentId,
    getSkillAgentId: skillId => coCreation.config.skillAgents[homeSkillAgentKey(skillId)] || '',
    getAgent: agentId => {
      if (!agentId) return null
      const agent = agentStore.getAgent(agentId)
      if (!agent) throw new Error('绑定的智能体不存在：' + agentId)
      return agent
    },
    getProvider: agent => {
      const provider = agent?.provider
        ? providerStore.getProvider(agent.provider) || providerStore.activeGenerateProvider
        : providerStore.activeGenerateProvider
      return provider || providerStore.activeGenerateProvider || null
    },
    getSkillPolicy: template => skillStore.skills.find(skill => skill.id === template.id)?.contextPolicy,
    buildTemplateContext: (requestText, previousOutput) => {
      const activeTab = editorStore.activeTab
      const tabMode = activeTab?.mode
      const volumes = projectStore.volumes || []
      let outlineContent = projectStore.outlineText || ''
      let editorContent = ''
      let chapterSummary = ''
      if (tabMode === 'vol-outline') {
        const volIdx = volumes.findIndex((v: any) => v.id === activeTab!.chapterId || v.name === activeTab!.title)
        const vol = volIdx >= 0 ? volumes[volIdx] : null
        editorContent = vol ? (vol.outline || vol.summary || '') : ''
        outlineContent = buildSOI(tabMode, activeTab)
      } else if (tabMode === 'ch-plot') {
        for (let vi = 0; vi < volumes.length; vi++) {
          const chs = projectStore.chapters[volumes[vi].id] || []
          const ch = chs.find((c: any) => c.id === activeTab!.chapterId)
          if (ch) {
            outlineContent = buildSOI(tabMode, activeTab)
            editorContent = ch.plot || ''
            chapterSummary = ch.summary || ch.plot || ''
            break
          }
        }
      } else if (tabMode === 'ch-body') {
        for (let vi = 0; vi < volumes.length; vi++) {
          const chs = projectStore.chapters[volumes[vi].id] || []
          const ch = chs.find((c: any) => c.id === activeTab!.chapterId)
          if (ch) {
            outlineContent = buildSOI(tabMode, activeTab)
            editorContent = activeTab!.content || ''
            chapterSummary = ch.summary || ch.plot || ''
            break
          }
        }
      }
      return {
        userPrompt: requestText,
        selectedText: requestTargetFromEditor().selectedText || requestText,
        referenceOutline: outlineContent,
        outlineContent: outlineContent,
        editorContent,
        novelTitle: projectStore.projectName || '',
        prevResponse: previousOutput || '',
        volumeCount: volumes.length,
        chapterTitle: activeTab?.title || '',
        chapterSummary
      }
    },
    getWorkspaceState: () => ({
      outline: projectStore.outlineText || '',
      editorContent: editorStore.activeTab?.content || '',
      selectedText: requestTargetFromEditor().selectedText,
      activeTab: editorStore.activeTab?.title || '',
      settings: projectStore.getSettingsCollection(),
      memories: JSON.stringify(projectStore.memories)
    }),
    getLegacyMessages: requestText => getChatContextMessages(requestText)
      .slice(-DEFAULT_CO_CREATION_HISTORY_TURNS * 2),
    getToolAudit: () => lastHomeToolAudit,
    getEditTaskContext: () => ({
      activeEditTask: homeEditTask.value,
      onResumeEditTask: taskId => homeEditTaskSession.resumeEditTask(taskId),
      onCancelEditTask: taskId => homeEditTaskSession.onCancelEditTask(taskId),
    }),
    getExecutionContext: () => ({
      executionPlan: activeHomeExecutionPlan ?? undefined,
      writeAuthorization: activeHomeExecutionPlan
        ? buildWorkflowWriteAuthorizationFromPlan({
          workspace: 'main',
          intent: activeHomeRoutingIntent,
          plan: activeHomeExecutionPlan,
        })
        : null,
    }),
    buildTools: (request) => ({
      tools: requestTarget.content
        ? buildHomeDialogueToolSurface(
          buildSnapshot({
            workspace: 'main',
            targetId: requestTarget.targetId,
            label: requestTarget.label,
            chapterId: requestTarget.chapterId,
            mode: requestTarget.mode,
            content: editorStore.activeTab?.content || '',
            selectionStart: currentMainSelection().selectionStart,
            selectionEnd: currentMainSelection().selectionEnd,
          }),
          request.intent === 'auto' ? fallbackIntent : request.intent,
          undefined,
          activeHomeExecutionPlan ?? undefined,
          activeHomeExecutionPlan
            ? buildWorkflowWriteAuthorizationFromPlan({
              workspace: 'main',
              intent: activeHomeRoutingIntent,
              plan: activeHomeExecutionPlan,
            })
            : null,
          request.requestText,
        ).tools
        : [],
      toolPolicy: requestTarget.content ? {
        scenario: 'direct-tool-intensive',
        intent: request.intent,
        onConvergenceStart: () => {
          addHomeTraceEvent({
            type: 'tool-convergence-started',
            level: 'info',
            label: '开始收敛最终回答',
            detail: '应用已判定继续工具循环不可取（写入终态拒绝、参数反复无效、覆盖检查未通过或轮次耗尽），正在请求不带工具的最终说明'
          })
        },
        onPermissionDenied: event => {
          addHomeTraceEvent({
            type: 'tool-permission-denied',
            level: 'error',
            label: '工具写入权限拒绝',
            detail: `${event.toolName}：${event.reason}`
          })
        },
          onCompatibilityMode: () => {
            compatibilityNotice.value = '当前供应商未启用原生工具调用，已使用兼容模式'
          },
          onConvergencePseudoCall: event => {
            addHomeTraceEvent({
              type: 'tool-convergence-pseudo-call',
              level: 'warn',
              label: '收敛回答疑似伪工具调用',
              detail: event.text.slice(0, 2000)
            })
            const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
            diag?.log?.('warn', 'tool/convergence-pseudo-call', '收敛回答疑似伪工具调用，已发起一次强纠正请求', {
              workspace: 'home',
              text: event.text.slice(0, 2000),
              reason: event.reason,
            })
          },
          onConvergenceCorrected: () => {
            addHomeTraceEvent({
              type: 'tool-convergence-corrected',
              level: 'info',
              label: '收敛回答已纠正为自然语言',
              detail: '伪工具调用已被拦截，强纠正请求返回可用正文'
            })
            const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
            diag?.log?.('info', 'tool/convergence-corrected', '收敛伪工具调用已通过强纠正请求修复')
          },
          onConvergenceLocalFallback: reason => {
            addHomeTraceEvent({
              type: 'tool-convergence-local-fallback',
              level: 'warn',
              label: '收敛失败，返回本地摘要',
              detail: reason
            })
            const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
            diag?.log?.('warn', 'tool/convergence-local-fallback', '收敛请求未得到可用正文，已返回本地工具结果摘要', {
              workspace: 'home',
              reason,
            })
          }
      } : undefined
    }),
    loadBreakpoint: ownerKey => coCreation.loadBreakpoint(ownerKey),
    saveBreakpoint: breakpoint => coCreation.saveBreakpoint(breakpoint),
    clearBreakpoint: ownerKey => coCreation.clearBreakpoint(ownerKey),
    classifyIntentWithLlm: createIntentLlmFallback({
      activeVerifyProvider: providerStore.activeVerifyProvider,
      activeGenerateProvider: providerStore.activeGenerateProvider,
    })
  }
}

function requestTargetFromEditor(): { selectedText: string } {
  const editor = document.getElementById('editor-content') as HTMLTextAreaElement | null
  const content = editorStore.activeTab?.content || ''
  const start = editor?.selectionStart ?? 0
  const end = editor?.selectionEnd ?? start
  return { selectedText: start < end ? content.slice(start, end) : '' }
}

function currentMainSelection(): { selectionStart: number; selectionEnd: number } {
  const editor = document.getElementById('editor-content') as HTMLTextAreaElement | null
  if (!editor) return { selectionStart: 0, selectionEnd: 0 }
  return { selectionStart: editor.selectionStart, selectionEnd: editor.selectionEnd }
}

function createMainEditorTargetSnapshot(
  tab: { id: string; title: string; chapterId?: string; mode?: string; content?: string } | null | undefined,
  fallbackTargetId = projectId.value,
): EditorTargetSnapshot {
  const selection = currentMainSelection()
  return buildMainSnapshot(
    tab
      ? {
          workspace: 'main',
          targetId: tab.id,
          label: tab.title,
          chapterId: tab.chapterId,
          mode: tab.mode,
          content: tab.content || '',
        }
      : null,
    fallbackTargetId,
    selection,
  )
}

function createInactiveMainEditorTargetSnapshot(tab: {
  id: string
  title: string
  chapterId?: string
  mode?: string
  content?: string
}): EditorTargetSnapshot {
  return buildMainSnapshot({
    workspace: 'main',
    targetId: tab.id,
    label: tab.title,
    chapterId: tab.chapterId,
    mode: tab.mode,
    content: tab.content || '',
  }, tab.id)
}

function firstContentDifference(previous: string, next: string): number {
  const length = Math.min(previous.length, next.length)
  let index = 0
  while (index < length && previous[index] === next[index]) index += 1
  return index
}

const DIRECT_WRITE_INSTANT_LINE_THRESHOLD = 3000

function configureHomeContextCompaction(
  model: string,
  providerContextWindowTokens: number | string | null | undefined,
  reservedOutputTokens?: number,
): void {
  const modelContextWindow = resolveEffectiveModelContextWindow({
    model,
    providerContextWindowTokens,
  })
  conversationContextService.setCompactionRouting({
    workspace: 'main',
    ...(modelContextWindow
      ? { budget: { modelContextWindow, ...(reservedOutputTokens ? { reservedOutputTokens } : {}) } }
      : {}),
    observer: {
      onContextCompacted: result => {
        const detail = `strategy=${result.strategy}; compacted=${result.compactedMessageCount}; retained=${result.retainedMessageCount}; chars=${result.beforeChars}->${result.afterChars}; allowedTokens=${result.allowedInputTokens ?? 'unknown'}`
        if (homeRunTraceId) runTraceStore.markContextCompacted(homeRunTraceId, detail)
        addHomeTraceEvent({
          type: 'context-compacted',
          label: '上下文已非破坏性压缩',
          detail
        })
        const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
        diag?.log?.('info', 'context/compaction', '主页上下文已非破坏性压缩', {
          workspace: 'main',
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
          workspace: 'main',
          model,
          reason: result.reason,
          messageCount: result.retainedMessageCount,
        })
      },
      onContextCompactionLifecycle: event => {
        const detail = [
          `stage=${event.stage}`,
          `status=${event.status}`,
          event.checkpointId ? `checkpointId=${event.checkpointId}` : '',
          event.compactionId ? `compactionId=${event.compactionId}` : '',
          event.detail || '',
        ].filter(Boolean).join('; ')
        addHomeTraceEvent({
          type: `context-compaction-${event.stage.replace(/_/g, '-')}`,
          level: event.status === 'failed' ? 'warn' : 'info',
          label: `上下文压缩生命周期：${event.stage}`,
          detail
        })
        const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
        diag?.log?.(
          event.status === 'failed' ? 'warn' : 'info',
          'context/compaction',
          `主页上下文压缩生命周期：${event.stage}`,
          {
            workspace: 'main',
            model,
            stage: event.stage,
            status: event.status,
            checkpointId: event.checkpointId,
            compactionId: event.compactionId,
            detail: event.detail,
          }
        )
      },
    },
  })
}


function presentDirectWrite(options: {
  targetId: string
  original: string
  next: string
  mode: 'stream' | 'instant'
  onProgress: (content: string) => void
}): Promise<void> {
  const changed = options.next !== options.original
  if (options.mode === 'instant' || !changed) return Promise.resolve()
  const lineCount = options.next.split('\n').length
  if (lineCount > DIRECT_WRITE_INSTANT_LINE_THRESHOLD) return Promise.resolve()
  const firstChange = firstContentDifference(options.original, options.next)
  const frames: number[] = []
  const frameCount = 16
  const insertedLength = Math.max(0, options.next.length - options.original.length)
  if (insertedLength > 0) {
    for (let index = 1; index <= frameCount; index += 1) {
      frames.push(firstChange + Math.floor(insertedLength * index / frameCount))
    }
  }
  if (!frames.length) return Promise.resolve()
  return new Promise(resolve => {
    let index = 0
    const step = () => {
      const position = frames[index]
      options.onProgress(options.original + options.next.slice(options.original.length, position))
      window.dispatchEvent(new CustomEvent('editor-follow-progress', {
        detail: {
          workspace: 'main',
          targetId: options.targetId,
          start: firstChange,
          end: Math.max(firstChange + 1, position)
        }
      }))
      index += 1
      if (index < frames.length) window.requestAnimationFrame(step)
      else resolve()
    }
    window.requestAnimationFrame(step)
  })
}

async function runHomeCoCreationSkills(
  requestText: string,
  routingDecision: HomeRoutingDecision = {},
  options: {
    intent?: PlainDialogueIntent
    toolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
    actualToolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
  } = {},
): Promise<{
  text: string
  maxTokens?: number | null
  toolCallSummary: string | null
  terminalStatus?: 'success' | 'success_with_warnings' | 'degraded' | 'blocked'
  terminalReason?: string
}> {
  if (coCreationMode.value !== 'chain') {
    throw new Error('当前 SKILL 链路仅支持 chain 模式；compose 模式应走统一 Agent 执行底座')
  }
  const provider = providerStore.activeGenerateProvider
  const model = provider?.selectedModel || provider?.models?.[0] || ''
  // Compaction input windows are set per turn from the actual request result;
  // this only ensures the model-window routing exists before the first turn.
  configureHomeContextCompaction(model, provider?.contextWindowTokens)
  const placeholderMessage = chatStore.addMessage(
    { role: 'assistant', content: '', tabId: chatStore.currentContext?.tabId || '' },
    projectId.value
  )
  if (!placeholderMessage) throw new Error('当前没有可用对话会话')

  let streamedText = ''
  let firstChunkSeen = false
  let homeSkillTerminalStatus: 'success' | 'success_with_warnings' | 'degraded' | 'blocked' | undefined
  let homeSkillTerminalReason: string | undefined
  let homeAgentTerminalStatus: RunTraceStatus | undefined
  let homeAgentTerminalReason: string | undefined
  let homeTurnOutcomeVerified = false
  const runStartedAt = performance.now()
  const skillNames = selectedCoCreationSkills.value.map(skill => skillStore.displaySkillName(skill))
  const templates = getHomeSkillTemplates()
  reportHomeFolderHydrationDiagnostics(await hydrateRuntimeFolderTemplates(templates))
  // A budget-exhausted resume must keep the spent count and the user's
  // extension on the same budget object; minting a fresh one resets 8/12 to 0/8.
  const apiBudget = routingDecision.resumedApiBudget || createApiCallBudget(8)
  homeApiBudget.value = apiBudget
  addHomeTraceEvent({
    type: 'skill-start',
    label: '开始主页共创技能',
    detail: [coCreationMode.value, skillNames.join(' → ')].filter(Boolean).join(' / ')
  })
  const result = await runWorkspaceSkills({
    requestText,
    templates,
    mode: coCreationMode.value,
    aiService: await getAiService(),
    contextService: conversationContextService,
    adapter: createHomeSkillAdapter(options.intent),
    signal: activeAbortController?.signal,
    apiBudget,
    routingOverride: routingDecision.bypass
      ? { bypass: true }
      : routingDecision.forcedIntent
        ? {
            forcedIntent: routingDecision.forcedIntent,
            precomputedRouting: routingDecision.precomputedRouting,
          }
        : routingDecision.precomputedRouting
          ? { precomputedRouting: routingDecision.precomputedRouting }
          : undefined,
    callbacks: {
      onFirstChunk: () => {
        firstChunkSeen = true
        const callId = runTraceStore.getApiCallId('home')
        if (callId) {
          runTraceStore.attachSemantic(homeRunTraceId || '', callId, {
            timeToFirstChunkMs: Math.round(performance.now() - runStartedAt)
          })
        }
        chatStore.setGenerationState('streaming', '正在接收共创输出…')
      },
      onStatus: status => {
        if (!firstChunkSeen) chatStore.setGenerationState('preparing', status)
      },
      onChunk: text => {
      streamedText += text
      appendHomeStream(streamedText)
      chatStore.updateLastMessage(streamedText)
        void nextTick().then(() => scrollToBottom())
      },
      onApiCallStart: (skillId, skillName, callModel, actualToolSurface) => {
        return startHomeApiCall({
          skillName: skillName || skillId,
          requestMessages: [],
          model: callModel || model,
          intent: options.intent,
          toolSurface: options.toolSurface,
          actualToolSurface: actualToolSurface || options.actualToolSurface
        })
      },
      onGenerationEvent: (skillId, event) => {
        addHomeTraceEvent({
          type: event.type,
          level: event.type === 'generation-invalid' ? 'warn' : 'info',
          label: event.type === 'generation-invalid'
            ? `SKILL「${skillId}」生成无效`
            : event.type === 'direct-retry-start'
              ? `SKILL「${skillId}」切换直出重试`
              : `SKILL「${skillId}」直出重试${event.success ? '成功' : '失败'}`,
          detail: JSON.stringify(event).slice(0, 20000)
        })
        chatStore.setGenerationState('preparing', event.message || '正在直出重试')
      },
      onApiCallFinish: (callId, meta, durationMs, result) => {
        if (callId) {
          const requestMessages = (meta.requestMessages || []).map(message => ({
            role: String(message.role || ''),
            content: String(message.content || '')
          }))
          if (requestMessages.length) runTraceStore.setApiCallRequest(homeRunTraceId || '', callId, requestMessages)
          const toolRequestDeltas = (meta.toolRequestDeltas || []).map(message => ({
            role: String(message.role || ''),
            content: String(message.content || '')
          }))
          if (toolRequestDeltas.length) runTraceStore.setApiCallToolRequestDeltas(homeRunTraceId || '', callId, toolRequestDeltas)
          if (meta.toolAudit !== undefined) runTraceStore.setApiCallToolAudit(homeRunTraceId || '', callId, meta.toolAudit)
          for (const toolResult of meta.toolResults || []) {
            recordHomeToolCall(callId, {
              toolName: toolResult.call.name,
              toolCallId: toolResult.call.id,
              input: toolResult.call.input,
              argumentsRaw: toolResult.call.argumentsRaw,
              result: toolResult.result as ToolResult,
              durationMs: 0
            })
          }
          finishHomeApiCall(callId, {
            status: 'success',
            responseText: meta.responseText || result?.text || '',
            reasoningText: meta.reasoningText || result?.reasoning || '',
            finishReason: meta.finishReason,
            usage: meta.usage,
            providerContextWindowTokens: meta.contextBudget?.providerContextWindowTokens,
            estimatedInputTokens: meta.contextBudget?.estimatedInputTokens,
            contextBudgetDecision: meta.contextBudget?.decision,
            contextBudgetReason: meta.contextBudget?.reason,
            usageReconciliation: meta.usageReconciliation,
            textOrigin: meta.textOrigin,
            durationMs
            })
          }
        },
        onPhysicalCall: (_skillId, callId, event) => {
          recordHomePhysicalCall(callId, event)
        },
      onPromptBuilt: (event) => {
        if (!homeRunTraceId) return
        const callId = runTraceStore.getApiCallId('home') || undefined
        runTraceStore.attachPromptSnapshot(homeRunTraceId, {
          apiCallId: callId,
          skillId: event.skillId,
          skillName: event.skillName,
          skillVersion: event.skillVersion,
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
        addHomeTraceEvent({
          type: 'skill-skipped',
          label: `跳过技能：${skillId}`,
          detail: reason
        })
      },
      onSkillFallback: (skillId, detail) => {
        addHomeTraceEvent({
          type: 'skill-load-failed',
          level: 'warn',
          label: `folder SKILL 加载失败：${detail.skillName || skillId}`,
          detail: formatSkillFallback({
            code: detail.code,
            message: detail.message,
            folderPath: detail.folderPath,
            skillId,
            skillName: detail.skillName,
            action: detail.action
          })
        })
      },
      onBeforeSkill: (skillIndex, skillId, skillName) => {
        addHomeTraceEvent({
          type: 'skill-start',
          label: `开始执行：${skillName}`,
          detail: `步骤 ${skillIndex + 1}`
        })
      },
      onAfterSkill: (skillIndex, skillId, skillName) => {
        addHomeTraceEvent({
          type: 'skill-complete',
          label: `完成：${skillName}`,
          detail: `步骤 ${skillIndex + 1} 完成`
        })
      },
      onRoutingEvent: event => recordHomeRoutingEvent(event)
    }
  })

  if (result.runState === 'awaiting_user' && placeholderMessage) {
    const fallbackSkillNames = getHomeSkillTemplates().map(template => template.name || template.id)
    const fallbackRouting = result.awaiting?.routing || result.routing
    const recommendedSkillIds = (result.awaiting?.recommendedSkills || []).map(template => template.id)
    const awaitingState = homeRunTraceId
      ? createRoutingAwaitState({
          runId: homeRunTraceId,
          requestText,
          routing: fallbackRouting,
        })
      : undefined
    chatStore.updateMessageRoutingState(placeholderMessage.id, {
      routingFallback: {
        routing: fallbackRouting || undefined,
        skillNames: fallbackSkillNames,
        recommendedSkillIds,
        requestText,
        runId: awaitingState?.runId,
        createdAt: awaitingState?.createdAt,
        resumeToken: awaitingState?.resumeToken
      }
    })
    addHomeTraceEvent({
      type: 'routing-fallback',
      label: '等待意图确认',
      detail: result.awaiting?.routing?.reason || '未识别到明确意图'
    })
    if (homeRunTraceId) runTraceStore.startAwaitingUser(homeRunTraceId, 'awaiting_user')
    activeHomeExecutionPlan = null
    return { text: '', toolCallSummary: null }
  }
  if (result.runState === 'budget_exhausted' && placeholderMessage) {
    chatStore.updateMessageRoutingState(placeholderMessage.id, {
      budgetExhausted: {
        used: result.budgetSnapshot?.used || 0,
        limit: result.budgetSnapshot?.limit || 0,
        requestText,
        budgetToken: currentHomeBudgetToken()
      }
    })
    if (result.text) chatStore.updateLastMessage(result.text)
    addHomeTraceEvent({
      type: 'budget-exhausted',
      level: 'warn',
      label: 'API 调用预算已用尽',
      detail: `已用 ${result.budgetSnapshot?.used || 0}/${result.budgetSnapshot?.limit || 0}，已保留断点`
    })
    activeHomeExecutionPlan = null
    return {
      text: result.text,
      toolCallSummary: null,
      terminalStatus: result.terminalStatus || 'blocked',
      terminalReason: result.terminalReason || 'budget_exhausted'
    }
  }
  if (result.text.trim()) chatStore.updateLastMessage(result.text)
  if (result.meta && (result.meta.diagnostics?.length || result.meta.status === 'degraded')) {
    chatStore.updateLastMessageSkillDiagnostics(result.meta)
    runTraceStore.setFolderDiagnostics(homeRunTraceId || '', result.meta.diagnostics || [])
  }
  if (result.meta?.skillToolDeclarationsIgnored) {
    addHomeTraceEvent({
      type: 'skill-tool-declarations-ignored',
      level: 'info',
      label: 'SKILL 工具/授权声明已忽略',
      detail: `声明 ${result.meta.skillToolDeclarationsIgnored} 项，启用 0 项`
    })
  }
  if (homeRunTraceId && result.meta?.postProcessReport) {
    const report = result.meta.postProcessReport
    const currentApiCallId = runTraceStore.getApiCallId('home') || undefined
    const postProcessTerminal = resolvePostProcessTerminalStatus(report)
    runTraceStore.attachProcessingReport(homeRunTraceId, {
      apiCallId: currentApiCallId,
      stage: 'post',
      processor: 'postProcess',
      status: postProcessTerminal.processingStatus,
      outputPreview: report.output.slice(0, 200),
      ruleHits: [{
        rule: report.changedOutput ? 'postProcess.output' : 'postProcess.no-change',
        count: report.issues.length
      }],
      warnings: report.warnings || [],
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
    addHomeTraceEvent({
      type: postProcessTerminal.eventReason,
      level: postProcessTerminal.runStatus === 'success' ? 'info' : postProcessTerminal.runStatus === 'degraded' || postProcessTerminal.runStatus === 'success_with_warnings' ? 'warn' : 'error',
      label: postProcessTerminal.runStatus === 'success'
        ? 'postProcess 完成'
        : postProcessTerminal.runStatus === 'success_with_warnings'
          ? 'postProcess 完成但保留警告'
          : postProcessTerminal.runStatus === 'degraded'
            ? 'postProcess 输出已降级'
            : 'postProcess 阻断输出',
      detail: `${report.issues.length} 个 issue；changedOutput=${report.changedOutput}`
    })
  }
  addHomeTraceEvent({
    type: result.mode === 'chain' ? 'skill-chain-complete' : 'skill-compose-complete',
    label: '主页共创技能执行完成',
    detail: result.mode || coCreationMode.value
  })
  const allToolCalls = (result.allMetas || [])
    .flatMap(meta => meta.toolCalls || [])
  const toolCallSummary = allToolCalls.length
    ? allToolCalls.map(call => call.name).join(' → ')
    : null
  if (toolCallSummary) {
    addHomeTraceEvent({
      type: 'tool-call',
      label: '技能工具调用完成',
      detail: toolCallSummary
    })
  }
  void loadChainBreakpointStatus()
  if (result.mode && result.text.trim()) {
    await conversationContextService.recordTurn({
      projectId: projectId.value,
      workspace: 'main',
      purpose: 'generate'
    }, {
      user: requestText,
      assistant: result.text,
      reservedOutputTokens: result.meta?.maxTokens,
      meta: {
        source: 'HomeCoCreation.skill',
        mode: result.mode,
        skillIds: coCreation.config.skillIds,
        agentIds: coCreation.config.skillIds
          .map(skillId => coCreation.config.skillAgents[homeSkillAgentKey(skillId)] || coCreation.config.agentId)
          .filter((agentId, index, all): agentId is string => Boolean(agentId) && all.indexOf(agentId) === index)
      }
    })
  }
  return {
    text: result.text,
    maxTokens: result.meta?.maxTokens,
    toolCallSummary,
    terminalStatus: result.terminalStatus,
    terminalReason: result.terminalReason
  }
}

const configStatus = computed(() => {
  const p = providerStore.activeGenerateProvider
  if (p && p.apiKey) return 'API 已配置'
  return '未配置 API | 点击设置配置'
})
watch(() => [coCreation.config.agentId, coCreation.config.mode, coCreation.config.skillIds], async () => {
  if (coCreation.loaded) await coCreation.saveConfig(coCreation.config)
}, { deep: true })

// Editor -> chat context binding. 《行为等价》：切换标签/内容变化时，对话会话跟着上下文走。
watch(() => editorStore.activeTab, (tab) => {
  if (!tab) return
  if (chatStore.currentContext?.tabId && tab.id !== chatStore.currentContext.tabId) sealHomeTraceSession()
  chatStore.ensureSession(tab.id, tab.chapterId, tab.title, projectId.value)
  chatStore.setCurrentContext({
    tabId: tab.id,
    chapterId: tab.chapterId,
    title: tab.title,
    content: tab.content || '',
    mode: tab.mode || 'ch-body'
  })
}, { immediate: true })

async function restoreContinuation(sessionId: string) {
  const snapshot = await loadContinuation(projectId.value, 'main', sessionId)
  if (!snapshot) return
  const messageId = snapshot.requestId.replace(/^chat_/, '')
  if (chatStore.activeSession?.messages.some(message => message.id === messageId)) {
    chatStore.updateMessageContinuation(messageId, snapshot, sessionId)
  }
}

async function syncChatProject() {
  await chatStore.loadSessions(projectId.value)
  const tab = editorStore.activeTab
  if (tab) {
    chatStore.ensureSession(tab.id, tab.chapterId, tab.title, projectId.value)
    void restoreContinuation(chatStore.activeSession?.id || 'main')
    chatStore.setCurrentContext({
      tabId: tab.id,
      chapterId: tab.chapterId,
      title: tab.title,
      content: tab.content || '',
      mode: tab.mode || 'ch-body'
    })
  } else {
    chatStore.ensureSession('', '', '默认对话', projectId.value)
    void restoreContinuation(chatStore.activeSession?.id || 'main')
  }
}

watch(projectId, (nextId, previousId) => {
  if (nextId && nextId !== previousId) syncChatProject()
  if (previousId && nextId && nextId !== previousId) sealHomeTraceSession()
})

onMounted(() => {
  void coCreation.loadConfig()
  void loadChainBreakpointStatus()
  syncChatProject()
  // Dense sessions can mount already populated; virtual scrollers need one settled frame before anchoring.
  void nextTick().then(() => scrollToBottom())
  // Reload 后保留上一条 chat run 的指针，跨进程重载也能继续聚合。
  const restoredHomeRunId = runTraceStore.getLastRunId('home')
  if (restoredHomeRunId && runTraceStore.getRun(restoredHomeRunId)?.sessionKind === 'chat') {
    homeRunTraceId = restoredHomeRunId
    homeSessionId = chatStore.currentContext?.tabId || ''
  }
  window.addEventListener('editor-action', handleEditorAction)
  aiTaskStore.restore(projectId.value)
})

watch(messageVirtualizationEnabled, async (enabled) => {
  if (!enabled) return
  await nextTick()
  scrollToBottom()
})

onUnmounted(() => {
  window.removeEventListener('editor-action', handleEditorAction)
})

function handleEditorAction(e: any) {
  const detail = e.detail
  if (detail && detail.action === 'ai-names' && detail.chapterId) {
    window.dispatchEvent(new CustomEvent('open-ai-naming', {
      detail: { source: 'editor', target: { chapterId: detail.chapterId } }
    }))
  } else if (detail && detail.action === 'inline-ai' && detail.prompt) {
    _pendingInlineOriginal.value = detail.prompt;
    _pendingInlineSelection.value = detail.tabId
      ? { tabId: detail.tabId, start: Number(detail.selectionStart) || 0, end: Number(detail.selectionEnd) || 0 }
      : null
    inputText.value = detail.prompt;
    nextTick(() => {
      sendMessage();
    });
  } else if (detail && detail.action === 'revise' && detail.chapterId) {
    _pendingInlineOriginal.value = editorStore.activeTab?.content || "";
    _pendingInlineSelection.value = null
    const prompt = "请对以下章节内容进行修订，优化文笔、修复逻辑问题、提升可读性：\n\n" + _pendingInlineOriginal.value;
    inputText.value = prompt;
    nextTick(() => { sendMessage(); });
  }
  }

function buildHomeSkillGuidance(): string {
  return selectedCoCreationSkills.value
    .map(skill => {
      const name = skillStore.displaySkillName(skill)
      const guidance = [skill.template, skill.description]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .join('\n\n')
      return guidance ? `【${name}】\n${guidance}` : ''
    })
    .filter(Boolean)
    .join('\n\n')
}

function buildHomeConversationMarkers(limit = 8): Array<{ role: string; content: string }> {
  return messages.value
    .slice(-limit)
    .map(message => ({ role: message.role, content: String(message.content || '') }))
}

const homeDirectStallRetryDecisions: Array<{
  intent: 'analyze' | 'edit' | 'generate' | 'discuss'
  longDocument: boolean
  toolSurface: Array<{ name: string; policy: 'read' | 'write' }>
}> = []
let homeDirectStallRetryRequest: {
  provider: any
  model: string
  systemPrompt: string
  originalRequest: string
  maxDepth: number
  projId: string
  engineInput: string
  tools?: AgentToolDefinition[]
  requestTarget: EditorTargetSnapshot
  plainIntent: PlainDialogueIntent
  actualToolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
  workflowWrite?: DialogueWriteAuthorization
  permissionDecision?: DialoguePermissionDecision
  executionPlan?: LongDocumentExecutionPlan
  operationType?: LongDocumentOperationType
  skill?: {
    guidance: string
    skillIds: string[]
    promptSource: string
    protocolDiagnostics?: RealSkillDiagnostic[]
  }

  directApiBudget: ApiCallBudget
} | null = null

function reportHomeFolderHydrationDiagnostics(diagnostics: FolderSkillHydrationDiagnostic[]) {
  for (const diagnostic of diagnostics) {
    addHomeTraceEvent({
      type: diagnostic.type,
      level: diagnostic.level,
      label: diagnostic.type === 'folder-hydration-load-failed'
        ? '文件夹 SKILL 磁盘刷新失败，已保留当前快照'
        : `文件夹 SKILL 磁盘声明缺失：${diagnostic.field}`,
      detail: JSON.stringify(diagnostic),
    })
    ;(typeof window !== 'undefined' ? (window as any).DiagLogger : null)?.log?.(
      'warn',
      `home/${diagnostic.type}`,
      diagnostic.type === 'folder-hydration-load-failed'
        ? '文件夹 SKILL 磁盘刷新失败，已保留当前快照'
        : `文件夹 SKILL 磁盘声明缺失：${diagnostic.field}`,
      diagnostic,
    )
  }
}

function retryStalledHomeDirectRequest(): void {
  homeToolRunSupervisor?.dispose()
  homeToolRunSupervisor = createHomeToolRunSupervisor(false)
  activeAbortController = new AbortController()
}

async function sendMessage(requestText?: string, routingDecision: HomeRoutingDecision = {}) {
  if (homeSendStarting.value) return
  const editRequestId = `chat-edit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const editStartedAt = performance.now()
  const projId = projectId.value
  let text = (typeof requestText === 'string' ? requestText : inputText.value).trim()
  const originalRequest = text
  if (!text || homeInputBlocked.value) return
  homeSendStarting.value = true
  try {
  if (!chatStore.activeSession) {
    await appConfirm.alert('当前没有可用对话会话，请重新打开项目后再试')
    return
  }
  activeAbortController?.abort()
  activeAbortController = new AbortController()
  const pendingOriginal = _pendingInlineOriginal.value
  _pendingInlineOriginal.value = ''
  lastToolCallSummary = null
  homeFailedWriteBatch = null
  const requestTarget = buildSnapshot({
    workspace: 'main',
    targetId: editorStore.activeTab?.id || 'main',
    label: editorStore.activeTab?.title || '主页编辑器',
    chapterId: editorStore.activeTab?.chapterId,
    mode: editorStore.activeTab?.mode,
    content: editorStore.activeTab?.content || '',
    selectionStart: _pendingInlineSelection.value?.start,
    selectionEnd: _pendingInlineSelection.value?.end
  })
  const requestIntentDetailed = await classifyHomeIntentDetailed(text)
  const requestIntent: PlainDialogueIntent =
    requestIntentDetailed.kind === 'matched' ? requestIntentDetailed.intent : 'discuss'
  const requestRoutingReason = requestIntentDetailed.kind === 'matched'
    ? requestIntentDetailed.reason
    : ''
  activeHomeRoutingIntent = requestIntent
  const homeProviderForRouting = providerStore.activeGenerateProvider
  const homeModelForRouting = homeProviderForRouting?.selectedModel || homeProviderForRouting?.models?.[0] || ''
  const homeProviderWindow = resolveEffectiveModelContextWindow({
    model: homeModelForRouting,
    providerContextWindowTokens: homeProviderForRouting?.contextWindowTokens,
  })
  const homeMaxOutputTokens = Number(homeProviderForRouting?.maxTokens) > 0
    ? Number(homeProviderForRouting?.maxTokens)
    : null
  const activeHomeTask = activeExecutionTaskStore.getValidSnapshot(
    'main',
    String(projectId.value),
    requestTarget.contentVersion,
    hashEditorContent(requestTarget.content),
  )
  const homeExecutionPlan = buildLongDocumentExecutionPlan({
    requestText: text,
    content: requestTarget.content,
    contextWindowTokens: typeof homeProviderWindow === 'number' ? homeProviderWindow : null,
    maxOutputTokens: homeMaxOutputTokens,
    intent: requestIntent,
    activeTask: activeHomeTask || undefined,
    activePlanConfirmation: requestRoutingReason === 'active-plan-continuation',
  })
  const shouldReuseHomeActiveTask = Boolean(
    (activeHomeTask?.status === 'awaiting_user_plan' || activeHomeTask?.status === 'active')
    && activeHomeTask.plan
    && requestRoutingReason === 'active-plan-continuation',
  )
  const shouldPreserveHomeAwaitingPlan = Boolean(
    activeHomeTask?.status === 'awaiting_user_plan'
    && activeHomeTask.plan
    && !shouldReuseHomeActiveTask
    && activeExecutionTaskStore.isAwaitingPlanSupersededByPlan(
      'main',
      String(projectId.value),
      homeExecutionPlan.operation,
    ) === false,
  )
  if (!shouldReuseHomeActiveTask && !shouldPreserveHomeAwaitingPlan) {
    if (activeHomeTask?.status === 'awaiting_user_plan') {
      activeExecutionTaskStore.supersedeAwaitingUserPlan(
        'main',
        String(projectId.value),
        'new-edit-request',
      )
    }
    createHomeActiveTask({
      requestText: text,
      plan: homeExecutionPlan,
      snapshot: requestTarget,
    })
    const supersededPlan = activeExecutionTaskStore.consumeLastSupersededPlan()
    if (supersededPlan) {
      addHomeTraceEvent({
        type: 'active-plan-superseded',
        level: 'info',
        label: '旧等待计划已由新编辑请求替换',
        detail: JSON.stringify(supersededPlan),
      })
    }
  }
  // Keep planner as the single place that marks a reused awaiting plan.
  const effectiveHomeExecutionPlan = homeExecutionPlan
  homeLongDocumentEditTaskPlan = effectiveHomeExecutionPlan.mode === 'edit-task'
  const homeWorkflowWriteAuthorization = buildWorkflowWriteAuthorizationFromPlan({
    workspace: 'main',
    intent: requestIntent,
    plan: effectiveHomeExecutionPlan,
  })
  activeHomeExecutionPlan = effectiveHomeExecutionPlan
  const homeLongDocumentOperationType = toLongDocumentOperationType(effectiveHomeExecutionPlan.operation)
  const useHomeFinalDraft = isHomeFinalDraftRequest(effectiveHomeExecutionPlan, text, requestTarget.content)
  if (await runHomeLocalTransform({
    plan: effectiveHomeExecutionPlan,
    target: requestTarget,
    intent: requestIntent,
    requestText: text,
  })) return
  const skillSurfaceModel = providerStore.activeGenerateProvider?.selectedModel
    || providerStore.activeGenerateProvider?.models?.[0] || ''
  const skillSurface = requestTarget.content
    ? buildHomeDialogueToolSurface(
      requestTarget,
      requestIntent,
      skillSurfaceModel,
          effectiveHomeExecutionPlan,
      homeWorkflowWriteAuthorization,
      text,
      activeHomeTask?.authorizedExcerpts || [],
    )
    : undefined
  const skillToolSurface = useHomeFinalDraft ? undefined : skillSurface?.actualToolSurface
  for (const conflict of skillSurface?.toolConflicts || []) {
    addHomeTraceEvent({
      type: 'tool-conflict',
      level: 'warn',
      label: conflict.label,
      detail: conflict.detail,
    })
    ;(typeof window !== 'undefined' ? (window as any).DiagLogger : null)?.log?.(
      'warn',
      'home/tool-conflict',
      conflict.label,
      { detail: conflict.detail, payload: conflict.payload },
    )
  }
  startHomeRun(
    selectedCoCreationSkills.value.length > 0 ? coCreationMode.value : 'direct',
    text,
    selectedCoCreationSkills.value.map(skill => skillStore.displaySkillName(skill)),
    {
      intent: requestIntent,
      longDocument: useHomeFinalDraft || usesLongDocumentToolRuntime(effectiveHomeExecutionPlan),
      permissionDecision: skillSurface?.permissionDecision,
      writeMode: requestTarget.content ? 'direct' : undefined,
      toolSurface: skillToolSurface,
      actualToolSurface: skillToolSurface,
    }
  )
  if (useHomeFinalDraft) {
    const providerForFinalDraft = providerStore.activeGenerateProvider
    if (!providerForFinalDraft) {
      chatStore.addMessage({ role: 'user', content: text, tabId: chatStore.currentContext?.tabId || '' }, projId)
      chatStore.addMessage({ role: 'assistant', content: '未配置 API 提供方。请在设置中配置后重试。', tabId: chatStore.currentContext?.tabId || '' }, projId)
      finishHomeRun('failed', '未配置 API 提供方', undefined, 'provider_not_configured')
      inputText.value = ''
      return
    }
    if (!providerForFinalDraft.apiKey) {
      chatStore.addMessage({ role: 'user', content: text, tabId: chatStore.currentContext?.tabId || '' }, projId)
      chatStore.addMessage({ role: 'assistant', content: '未配置 API Key。请在设置中填写后重试。', tabId: chatStore.currentContext?.tabId || '' }, projId)
      finishHomeRun('failed', '未配置 API Key', undefined, 'api_key_missing')
      inputText.value = ''
      return
    }
    inputText.value = ''
    await runHomeFinalDraftTurn({
      requestText: text,
      targetId: requestTarget.targetId,
      sourceContent: requestTarget.content,
      model: providerForFinalDraft.selectedModel || providerForFinalDraft.models?.[0] || 'gpt-4o',
      plan: effectiveHomeExecutionPlan,
      skillGuidance: buildHomeSkillGuidance(),
      conversationMarkers: buildHomeConversationMarkers(),
    })
    return
  }
  addHomeTraceEvent({
    type: 'long-document-policy',
    level: 'info',
    label: effectiveHomeExecutionPlan.mode === 'edit-task'
      ? '长文档进入 EditTask 多批执行'
      : effectiveHomeExecutionPlan.mode === 'single-pass'
        ? '全文一次成型执行'
      : usesLongDocumentToolRuntime(effectiveHomeExecutionPlan)
        ? '启用长文档工具任务策略'
        : '使用短文档工具任务策略',
    detail: JSON.stringify({
      planId: effectiveHomeExecutionPlan.planId,
      operation: effectiveHomeExecutionPlan.operation,
      operationResolution: effectiveHomeExecutionPlan.operationResolution,
      legacyOperationType: homeLongDocumentOperationType,
      mode: effectiveHomeExecutionPlan.mode,
      decision: effectiveHomeExecutionPlan.decision,
      reason: homeLongDocumentEditTaskPlan
        ? 'execution-plan-edit-task'
        : usesLongDocumentToolRuntime(effectiveHomeExecutionPlan)
          ? 'execution-plan-long-document'
          : 'execution-plan-direct',
      segments: effectiveHomeExecutionPlan.segments.length,
      invariants: effectiveHomeExecutionPlan.invariants,
      estimatedPhysicalRequests: effectiveHomeExecutionPlan.estimatedPhysicalRequests,
      contextWindow: effectiveHomeExecutionPlan.contextWindow,
      estimatedDocumentTokens: effectiveHomeExecutionPlan.estimatedDocumentTokens,
      targetChars: effectiveHomeExecutionPlan.totalChars,
      request: text.slice(0, 120),
    })
  })
  const homeLongDocumentDiag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
  homeLongDocumentDiag?.log?.('info', 'home/long-document-policy', `executionPlan=${effectiveHomeExecutionPlan.planId}`, {
    reason: `execution-plan-${effectiveHomeExecutionPlan.decision}`,
    executionMode: effectiveHomeExecutionPlan.mode,
    executionModeReason: `operation=${effectiveHomeExecutionPlan.operation}`,
    operationResolution: effectiveHomeExecutionPlan.operationResolution,
    planId: effectiveHomeExecutionPlan.planId,
    decision: effectiveHomeExecutionPlan.decision,
    contextWindow: effectiveHomeExecutionPlan.contextWindow,
    estimatedDocumentTokens: effectiveHomeExecutionPlan.estimatedDocumentTokens,
    requestText: text,
    targetChars: effectiveHomeExecutionPlan.totalChars,
  })
  consumeIntentCorpusInference({
    projectId: projectId.value,
    projectName: projectStore.projectName,
    workspace: 'home-editor',
    runId: homeRunTraceId,
    turnId: homeRunTurnId,
    requestText: text,
    routing: requestIntentDetailed,
  })
  if (requestIntentDetailed.kind === 'no_match' || requestIntentDetailed.kind === 'ambiguous') {
    stageIntentCorpusInference({
      projectId: projectId.value,
      projectName: projectStore.projectName,
      workspace: 'home-editor',
      runId: homeRunTraceId,
      requestText: text,
      routing: requestIntentDetailed,
    })
  }
  recordIntentRoutingSample({
    projectId: projectId.value,
    projectName: projectStore.projectName,
    workspace: 'home-editor',
    runId: homeRunTraceId,
    turnId: homeRunTurnId || undefined,
    requestText: text,
    routing: requestIntentDetailed,
  })

  homeToolRunSupervisor?.dispose()
  homeToolRunSupervisor = createHomeToolRunSupervisor(
    homeLongDocumentEditTaskPlan || usesLongDocumentToolRuntime(effectiveHomeExecutionPlan),
  )

  chatStore.addMessage({ role: 'user', content: text, tabId: chatStore.currentContext?.tabId || '' }, projId)
  addHomeRoutingDiagnostics(requestIntentDetailed.diagnostics)
  inputText.value = ''
  await nextTick()
  scrollToBottom()

  chatStore.setGenerationState('preparing', '正在准备请求…')
  let response = ''
  let failedTurnMaxTokens: number | null | undefined
  let homeSkillTerminalStatus: 'success' | 'success_with_warnings' | 'degraded' | 'blocked' | undefined
  let homeSkillTerminalReason: string | undefined
  let homeAgentTerminalStatus: RunTraceStatus | undefined
  let homeAgentTerminalReason: string | undefined
  let homeTurnOutcomeVerified = false
  let homeTurnSucceeded = false
  // A direct turn owns its physical-request budget. Reusing the last skill
  // budget would carry its spent count into an unrelated dialogue path.
  const directApiBudget = routingDecision.resumedApiBudget || createApiCallBudget(8)
  try {
    const provider = providerStore.activeGenerateProvider
    if (!provider) {
      chatStore.addMessage({ role: 'assistant', content: '未配置 API 提供方。请在设置中配置后重试。', tabId: chatStore.currentContext?.tabId || '' }, projId)
      finishHomeRun('failed', '未配置 API 提供方', undefined, 'provider_not_configured')
      chatStore.setGenerationState('idle')
      return
    }
    if (!provider.apiKey) {
      chatStore.addMessage({ role: 'assistant', content: '未配置 API Key。请在设置中填写后重试。', tabId: chatStore.currentContext?.tabId || '' }, projId)
      finishHomeRun('failed', '未配置 API Key', undefined, 'api_key_missing')
      chatStore.setGenerationState('idle')
      return
    }
    const agent = agentStore.getAgent(coCreationAgentId.value)
    const mainContextPack = buildContextPack(requestTarget, undefined, {
      provider,
      model: provider.selectedModel || provider.models?.[0] || 'gpt-4o',
      maxOutputTokens: Number(provider.maxTokens) > 0 ? Number(provider.maxTokens) : null,
    })
    const agentPrompt = agent?.systemPrompt || '你是写作助手。'
    const systemParts: string[] = []
    systemParts.push(agentPrompt)

    if (agent?.tools && agent.tools.length > 0) {
      const toolText = agent.tools.map((t: string) => {
        const def = (window as any).ToolRegistry?.get?.(t)
        return def ? '【' + t + '】' + (def.description || '') : '【' + t + '】'
      }).join('\n')
      if (toolText) systemParts.push('可用工具（调用格式：@工具名 {参数JSON}）：\n' + toolText)
    }

    const currentMessages = messages.value
    const sc = projectStore.getSettingsCollection()
    const recentUserMsgs: string[] = []
    for (let i = currentMessages.length - 1; i >= 0 && recentUserMsgs.length < 3; i--) {
      const msg = currentMessages[i]
      if (msg?.role === 'user') recentUserMsgs.push((msg.content || '').toLowerCase())
    }
    const settingsProjection = getLockedSettingsForLayer('home', sc, {
      query: [text, ...recentUserMsgs].join(' ')
    })
    if (settingsProjection.text) {
      systemParts.push(settingsProjection.text)
    }

    const activeTabForCtx = editorStore.activeTab
    const chatCtx: Record<string, any> = {
      selectedText: text,
      userPrompt: text,
      referenceOutline: '',
      editorContent: '',
      novelTitle: projectStore.projectName || '',
      prevResponse: '',
      volumeCount: projectStore.volumes?.length || 0,
      volumeOutline: '',
      chapterCount: 0,
      chapterTitle: editorStore.activeTab?.title || '',
      chapterSummary: '',
      prevChapterSummary: '',
      chapterPlot: '',
      characters: '',
      wordsPerVolume: '',
      wordsPerChapter: ''
    }
    for (let mi = currentMessages.length - 1; mi >= 0; mi--) {
      const mc = currentMessages[mi]
      if (mc?.role === 'assistant' && mc.content && (mc.content as string).indexOf('请求失败') !== 0) {
        chatCtx.prevResponse = mc.content
        break
      }
    }

    const activeTab = editorStore.activeTab
    if (activeTab && activeTab.mode) {
      let ctxLabel = ''
      let ctxText = ''
      const volumes = projectStore.volumes || []
      if (activeTab.mode === 'vol-outline') {
        ctxLabel = '卷纲纲要'
        const volIdx = volumes.findIndex((v: any) => v.id === activeTab.chapterId || v.name === activeTab.title)
        const vol = volIdx >= 0 ? volumes[volIdx] : null
        ctxText = vol ? (vol.outline || vol.summary || '') : ''
        chatCtx.volumeOutline = ctxText
        chatCtx.volumeCount = volumes.length
        chatCtx.editorContent = ctxText
        chatCtx.referenceOutline = buildSOI('vol-outline', activeTab)
      } else if (activeTab.mode === 'ch-plot') {
        ctxLabel = '章节剧情梗概'
        for (let vi = 0; vi < volumes.length; vi++) {
          const chs = projectStore.chapters[volumes[vi].id] || []
          const ch = chs.find((c: any) => c.id === activeTab.chapterId)
          if (ch) {
            ctxText = ch.plot || ''
            chatCtx.referenceOutline = buildSOI('ch-plot', activeTab)
            chatCtx.editorContent = ctxText
            chatCtx.chapterSummary = ch.summary || ch.plot || ''
            chatCtx.chapterPlot = ch.plot || ''
            chatCtx.chapterCount = chs.length
            const chIdx = chs.indexOf(ch)
            const prevCh = chIdx > 0 ? chs[chIdx - 1] : null
            if (prevCh) chatCtx.prevChapterSummary = prevCh.summary || prevCh.plot || ''
            break
          }
        }
      } else if (activeTab.mode === 'ch-body') {
        ctxLabel = '正文'
        ctxText = activeTab.content || ''
        chatCtx.chapterPlot = ctxText
        for (let vi2 = 0; vi2 < volumes.length; vi2++) {
          const chs2 = projectStore.chapters[volumes[vi2].id] || []
          const ch2 = chs2.find((c: any) => c.id === activeTab.chapterId)
          if (ch2) {
            chatCtx.referenceOutline = buildSOI('ch-body', activeTab)
            chatCtx.editorContent = ctxText
            chatCtx.chapterSummary = ch2.summary || ch2.plot || ''
            break
          }
        }
      }
      const sc3 = projectStore.getSettingsCollection()
      chatCtx.characters = characterLinesForLayer('body', sc3).join('；')
      // Editor content is injected below as "主创作上下文" with priority over reference outline
    }
    if (!chatCtx.editorContent && editorStore.activeTab) {
      chatCtx.editorContent = editorStore.activeTab.content || ''
    }
    if (!chatCtx.referenceOutline) {
      chatCtx.referenceOutline = projectStore.outlineText || ''
    }
    if (chatCtx.editorContent && chatCtx.editorContent === chatCtx.referenceOutline) {
      chatCtx.referenceOutline = ''
    }
    if (chatCtx.editorContent) {
      if (mainContextPack) {
        systemParts.push('主创作上下文（编辑器内容）：\n' + mainContextPack.content)
      }
    }
    if (chatCtx.referenceOutline) { systemParts.push('参考资料-大纲索引：\n' + chatCtx.referenceOutline) }

    const memoryContext = retrieveContext(projectStore.memories, {
      chapterId: editorStore.activeTab?.chapterId,
      query: `${text} ${editorStore.activeTab?.title || ''}`,
      previousChapterSummary: chatCtx.prevChapterSummary,
      maxChars: 2000
    })
    if (memoryContext.text) systemParts.push(`相关记忆：\n${memoryContext.text}`)
    if (requestTarget.content) {
      systemParts.push([
        `当前编辑目标：${requestTarget.label}`,
        requestTarget.selectedText
          ? `当前选区：${requestTarget.selectedText}`
          : '当前无选区：请使用 insert/replace_match/append，禁止 replace_selection。',
        `当前编辑内容总长度 ${requestTarget.content.length} 字符；当前选区 ${requestTarget.selectionStart}-${requestTarget.selectionEnd}；如需修改焦点外内容，必须先用只读工具读取对应范围。`
      ].join('\n'))
    } else if (editorStore.activeTab) {
      systemParts.push(buildEditorReadonlyPrompt({
        workspace: 'main',
        label: editorStore.activeTab.title || '主页编辑器',
        content: editorStore.activeTab.content || ''
      }))
    }

    const baseSystemPrompt = systemParts.join('\n\n---\n\n')
    const model = provider.selectedModel || 'gpt-4o'
  const maxDepth = getHomeSkillMaxDepth()
  maxDepthRef.value = maxDepth
  const composeSkillGuidance = coCreationMode.value === 'compose'
    ? buildWorkspaceSkillGuidance({
        templates: getHomeSkillTemplates(),
        requestText: originalRequest,
        adapter: createHomeSkillAdapter(requestIntent),
      })
    : undefined
  const composeSkillProtocolDiagnostics: RealSkillDiagnostic[] = composeSkillGuidance
    ? await collectSkillPackageProtocolDiagnostics(getHomeSkillTemplates())
    : []

    // 2) MCP 工具执行：前缀 @tool-name 的命令直接调用 ToolRegistry
    if (text.startsWith('@')) {
      const spaceIdx = text.indexOf(' ')
      const toolName = spaceIdx > 0 ? text.slice(1, spaceIdx) : text.slice(1)
      const rawParams = spaceIdx > 0 ? text.slice(spaceIdx + 1) : '{}'
      try {
        const params = JSON.parse(rawParams || '{}')
        const toolResult: any = await MCPProtocol.callToolLocal(toolName, params)
        response = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2)
        addHomeTraceEvent({
          type: 'tool_call',
          label: '本地工具调用完成',
          detail: toolName
        })
      } catch (toolErr: any) {
        response = 'MCP 工具调用失败: ' + (toolErr?.message || String(toolErr))
        addHomeTraceEvent({
          type: 'tool_call',
          level: 'error',
          label: '本地工具调用失败',
          detail: toolName + '：' + (toolErr?.message || String(toolErr))
        })
      }
  } else if (selectedCoCreationSkills.value.length > 0 && coCreationMode.value === 'chain') {
    const skillRun = await runHomeCoCreationSkills(originalRequest, {
      ...routingDecision,
      precomputedRouting: requestIntentDetailed,
    }, {
        intent: requestIntent,
      toolSurface: skillToolSurface,
      actualToolSurface: skillToolSurface
      })
      response = skillRun.text
      failedTurnMaxTokens = skillRun.maxTokens
      lastToolCallSummary = skillRun.toolCallSummary
      homeSkillTerminalStatus = skillRun.terminalStatus
      homeSkillTerminalReason = skillRun.terminalReason
    } else {
      // 3) 常规对话走统一意图授权：讨论/分析只读，编辑/生成才提供提案工具
      const useTools = Boolean(editorStore.activeTab)
      const plainIntent = requestIntent
      const plainRequestTarget = requestTarget.targetId === (editorStore.activeTab?.id || projectId.value)
        ? createMainEditorTargetSnapshot(editorStore.activeTab)
        : requestTarget
      const plainSurface = useTools
        ? buildHomeDialogueToolSurface(
          plainRequestTarget,
          plainIntent,
          model,
      effectiveHomeExecutionPlan,
          homeWorkflowWriteAuthorization,
          text,
          activeHomeTask?.authorizedExcerpts || [],
        )
        : undefined
      const plainTools = plainSurface?.tools
      const homePermissionDecision = plainSurface?.permissionDecision
      homeDirectStallRetryDecisions.length = 0
      homeDirectStallRetryDecisions.push({
        intent: plainIntent,
        longDocument: homeLongDocumentEditTaskPlan || usesLongDocumentToolRuntime(effectiveHomeExecutionPlan),
        toolSurface: plainSurface?.actualToolSurface || [],
      })
      for (const conflict of plainSurface?.toolConflicts || []) {
        addHomeTraceEvent({
          type: 'tool-conflict',
          level: 'warn',
          label: conflict.label,
          detail: conflict.detail,
        })
        ;(typeof window !== 'undefined' ? (window as any).DiagLogger : null)?.log?.(
          'warn',
          'home/tool-conflict',
          conflict.label,
          { detail: conflict.detail, payload: conflict.payload },
        )
      }
      const systemPrompt = appendDialogueToolSurfaceDeclaration(
        baseSystemPrompt,
        plainSurface?.actualToolSurface,
        {
          activeEditTask: homeEditTask.value,
          executionPlan: effectiveHomeExecutionPlan,
        },
      )
      addHomeTraceEvent({
        type: 'dialogue-tool-surface-declaration',
        label: '应用注入工具面事实声明',
        detail: JSON.stringify(buildDialogueToolSurfaceDeclarationAudit({
          source: 'home',
          toolSurface: plainSurface?.actualToolSurface,
          activeEditTask: homeEditTask.value,
          executionPlan: effectiveHomeExecutionPlan,
        })).slice(0, 20000),
      })
      homeDirectStallRetryRequest = {
        provider,
        model,
        systemPrompt,
        originalRequest,
        maxDepth,
        projId,
        engineInput: text,
        tools: plainTools,
        requestTarget: plainRequestTarget,
        plainIntent,
        actualToolSurface: plainSurface?.actualToolSurface,
        workflowWrite: homeWorkflowWriteAuthorization ?? undefined,
        permissionDecision: homePermissionDecision,
        executionPlan: effectiveHomeExecutionPlan,
        operationType: homeLongDocumentOperationType,
        skill: composeSkillGuidance?.skillIds.length ? {
          guidance: composeSkillGuidance.guidance,
          skillIds: composeSkillGuidance.skillIds,
          promptSource: composeSkillGuidance.promptSource,
          protocolDiagnostics: composeSkillProtocolDiagnostics,
        } : undefined,
        directApiBudget,
      }
      const plainResult = await callApi(
       provider,
       model,
       systemPrompt,
      originalRequest,
      maxDepth,
      projId,
      text,
      plainTools,
      plainRequestTarget,
      plainIntent,
      plainSurface?.actualToolSurface,
      homeWorkflowWriteAuthorization ?? undefined,
      homePermissionDecision,
      effectiveHomeExecutionPlan,
      homeLongDocumentOperationType,
      composeSkillGuidance?.skillIds.length ? {
        guidance: composeSkillGuidance.guidance,
        skillIds: composeSkillGuidance.skillIds,
        promptSource: composeSkillGuidance.promptSource,
        protocolDiagnostics: composeSkillProtocolDiagnostics,
      } : undefined,
      directApiBudget,
    )
      homeDirectStallRetryDecisions.length = 0
      homeDirectStallRetryRequest = null
      response = plainResult.text
      failedTurnMaxTokens = plainResult.maxTokens
      lastToolCallSummary = plainResult.toolCallSummary
      homeAgentTerminalStatus = plainResult.terminalStatus
      homeAgentTerminalReason = plainResult.terminalReason
      if (response?.trim()) {
        await conversationContextService.recordTurn({
          projectId: projId,
          workspace: 'main',
          purpose: 'generate'
        }, {
          user: originalRequest,
          assistant: response,
          reservedOutputTokens: plainResult.maxTokens,
          meta: {
            source: 'ChatPanel.callApi',
            model,
            agentId: coCreationAgentId.value || undefined,
            toolCalls: plainResult.toolCallSummary,
          }
        })
      }
    }

    if (
      !response &&
      selectedCoCreationSkills.value.length > 0 &&
      coCreationMode.value === 'chain' &&
      homeSkillTerminalStatus !== 'blocked'
    ) {
      // Awaiting confirmation keeps its dedicated bubble and the chat run open;
      // the next user action resumes the active watchdog instead of minting a
      // false success terminal state.
      if (homeRunTraceId) runTraceStore.startAwaitingUser(homeRunTraceId, 'awaiting_user')
    } else if (response) {
      const currentMessages = messages.value
      const lastMessage = currentMessages[currentMessages.length - 1]
      if (currentMessages.length === 0 || lastMessage?.role !== 'assistant') {
        chatStore.addMessage({ role: 'assistant', content: response, tabId: chatStore.currentContext?.tabId || '' }, projId)
      }
    }
    logEditorEdit({
      requestId: editRequestId,
      workspace: 'main',
      tabId: requestTarget.targetId,
      operation: 'editor_write',
      result: 'no_edit',
      targetLength: requestTarget.content.length,
      contentLength: response?.length,
      durationMs: Math.round(performance.now() - editStartedAt),
     detail: '编辑器写入统一由 editor.write 执行；UI 不再解析待确认编辑协议'
    })
    // P6-1: no_edit hint — append inline tip when AI response has no edit command
    if (response) {
      consecutiveNoEditCount.value++
      const tip = consecutiveNoEditCount.value >= 3
        ? '连续多次未识别编辑指令。如需 AI 直接修改内容，请明确指示，例如「请重写第三段」或「在开头插入一段环境描写」。'
        : '本次回复未包含编辑操作。如需修改内容，请明确告诉 AI 要改什么。'
      const currentMessages = messages.value
      const lastMsg = currentMessages[currentMessages.length - 1]
      if (lastMsg?.role === 'assistant') {
        chatStore.updateMessageContent(lastMsg.id, lastMsg.content + '\n\n---\n\n**提示：** ' + tip, chatStore.activeSessionId || undefined)
      }
    } else {
      consecutiveNoEditCount.value = 0
    }
    if (requestIntent !== 'discuss' && pendingOriginal && response && pendingOriginal !== response) {
        addHomeTraceEvent({
          type: 'manual-inline-preview-removed',
          level: 'info',
          label: '主页内联改写已统一直写语义',
          detail: '内联响应不再弹出 diff 预览；如需写入请使用插入/替换命令',
          turnId: homeRunTurnId,
        })
    }
    finishHomeRun(
      homeAgentTerminalStatus ?? homeSkillTerminalStatus ?? 'success',
      undefined,
      response,
      homeAgentTerminalReason
        ?? homeSkillTerminalReason
        ?? (selectedCoCreationSkills.value.length > 0 ? 'co_creation_complete' : 'dialogue_complete'),
    )
    homeTurnOutcomeVerified = true
    homeTurnSucceeded = true
 } catch (e: any) {
   const homeSupervisorReason = homeToolRunSupervisor?.reason || ''
   const stallRetryContext = homeDirectStallRetryDecisions[0] && homeDirectStallRetryRequest
     ? homeDirectStallRetryRequest
     : null
   if (
     homeSupervisorReason === 'stuck_timeout' &&
     e?.kind === 'canceled' &&
     stallRetryContext &&
     shouldRetryStalledDirectWrite({
       supervisorReason: homeSupervisorReason,
       intent: homeDirectStallRetryDecisions[0].intent,
       longDocument: homeDirectStallRetryDecisions[0].longDocument,
       toolSurface: homeDirectStallRetryDecisions[0].toolSurface,
     }).retryable
   ) {
     const stallRetryDecision = shouldRetryStalledDirectWrite({
       supervisorReason: homeSupervisorReason,
       intent: homeDirectStallRetryDecisions[0].intent,
       longDocument: homeDirectStallRetryDecisions[0].longDocument,
       toolSurface: homeDirectStallRetryDecisions[0].toolSurface,
     })
     homeDirectStallRetryDecisions.length = 0
     addHomeTraceEvent({
       type: 'state-stuck-retry',
       level: 'warn',
      label: '直接对话请求无进展，已自动隔离重试',
      detail: JSON.stringify({
        reason: 'stall_retry_valid',
        scope: stallRetryDecision.scope || 'read-only-dialogue',
        inheritedSignal: false,
        inheritedTimeout: false,
       longDocumentRetry: stallRetryDecision.longDocumentRetry,
     }),
   })
   homeDirectStallRetryRequest = null
     chatStore.setGenerationState('retrying', 'AI 请求无进展，已自动隔离重试')
     retryStalledHomeDirectRequest()
     const stallRetryResult = await callApi(
       stallRetryContext.provider,
       stallRetryContext.model,
       stallRetryContext.systemPrompt,
       stallRetryContext.originalRequest,
       stallRetryContext.maxDepth,
       stallRetryContext.projId,
       stallRetryContext.engineInput,
       stallRetryContext.tools,
       stallRetryContext.requestTarget,
       stallRetryContext.plainIntent,
       stallRetryContext.actualToolSurface,
       stallRetryContext.workflowWrite,
       stallRetryContext.permissionDecision,
       stallRetryContext.executionPlan,
       stallRetryContext.operationType,
       stallRetryContext.skill,
       stallRetryContext.directApiBudget,
     )
     response = stallRetryResult.text
     failedTurnMaxTokens = stallRetryResult.maxTokens
     lastToolCallSummary = stallRetryResult.toolCallSummary
     homeAgentTerminalStatus = stallRetryResult.terminalStatus
     homeAgentTerminalReason = stallRetryResult.terminalReason
     if (response?.trim()) {
       await conversationContextService.recordTurn({
         projectId: projId,
         workspace: 'main',
         purpose: 'generate'
       }, {
         user: originalRequest,
         assistant: response,
         reservedOutputTokens: stallRetryResult.maxTokens,
         meta: {
           source: 'ChatPanel.sendMessage:stall-retry',
           model: stallRetryContext.model,
           agentId: coCreationAgentId.value || undefined,
           toolCalls: stallRetryResult.toolCallSummary,
         }
       })
     }
     const currentMessages = messages.value
     const lastMessage = currentMessages[currentMessages.length - 1]
     if (currentMessages.length === 0 || lastMessage?.role !== 'assistant') {
      chatStore.addMessage({ role: 'assistant', content: response, tabId: chatStore.currentContext?.tabId || '' }, projId)
    } else if (response && lastMessage) {
      chatStore.updateMessageContent(lastMessage.id, response, chatStore.activeSessionId || undefined)
     }
    finishHomeRun(
      homeAgentTerminalStatus ?? 'success',
      undefined,
      response,
      homeAgentTerminalReason ?? 'stall_retry_valid',
    )
     homeTurnOutcomeVerified = true
     homeTurnSucceeded = true
   } else if (e?.kind === 'canceled' || activeAbortController?.signal.aborted) {
     closeActiveHomeApiCall('canceled', '用户取消生成')
     removeEmptyAssistantMessage()
     chatStore.setGenerationState('canceled', '已取消生成')
     finishHomeRun('canceled', '用户取消生成', undefined, 'user_cancel')
   } else {
    const homeFailureMessage = homeSupervisorReason === 'stuck_timeout'
      ? 'AI 请求无进展，已自动中止。请缩小问题范围、分段处理，或稍后重试。'
      : homeSupervisorReason === 'hard_deadline'
        ? '本轮工具任务超过总时间上限，已自动中止。请把长文档任务拆分为多轮处理。'
        : homeSupervisorReason === 'repeated_tool_error'
          ? '同一工具连续失败，已自动中止。请检查模型是否支持当前工具参数。'
          : (e?.message || String(e))
    const runtimeErrorStack = e instanceof Error ? e.stack : undefined
    if (runtimeErrorStack) {
      addHomeTraceEvent({
        type: 'turn-runtime-error',
        level: 'error',
        label: '本轮运行时异常栈',
        detail: runtimeErrorStack.slice(0, 20000),
      })
    }
    closeActiveHomeApiCall('failed', homeFailureMessage)
     finishHomeTraceSession('failed', homeFailureMessage)
     removeEmptyAssistantMessage()
     lastFailedText.value = text
     chatStore.setGenerationState('error', '生成失败：' + homeFailureMessage)
     chatStore.addMessage({ role: 'assistant', content: '请求失败：' + homeFailureMessage, tabId: chatStore.currentContext?.tabId || '' }, projId)
     finishHomeRun(
       'failed',
       homeFailureMessage,
       undefined,
       homeSupervisorReason || (homeTurnOutcomeVerified ? 'post_outcome_runtime_exception' : 'runtime_exception'),
     )
     void conversationContextService.recordTurn({
       projectId: projId,
       workspace: 'main',
       purpose: 'generate'
     }, {
       user: originalRequest,
       assistant: `[错误] ${e?.message || String(e)}`,
       reservedOutputTokens: failedTurnMaxTokens,
       meta: { source: 'ChatPanel.sendMessage', failed: true }
     }).catch(() => undefined)
   }
} finally {
 if (homeRunTraceId && !homeTurnOutcomeVerified) {
   addHomeTraceEvent({
     type: 'turn-outcome-unverified',
     level: 'error',
     label: '本轮未获得已验证终态',
     detail: '运行进入收尾但未发生任何经写入或讨论判定的完成路径',
   })
 }
  const activeHomeEditTask = homeEditTaskSession.activeTask()
  if (homeLongDocumentEditTaskPlan && activeHomeEditTask?.status === 'awaiting_batch') {
    let finishedHomeEditTask: EditTask | null = null
    const allBatchesWritten = activeHomeEditTask.executedBatches.length > 0
      && activeHomeEditTask.pendingBatches.length === 0
      && activeHomeEditTask.failedBatchIds.length === 0
    const currentHomeTab = editorStore.tabs.find(item => item.id === activeHomeEditTask.target.targetId)
    const homeCompletion = {
      target: {
        workspace: 'editor' as const,
        targetId: activeHomeEditTask.target.targetId,
      },
      before: requestTarget.content,
      after: currentHomeTab?.content ?? requestTarget.content,
    }
    if (!homeTurnSucceeded && allBatchesWritten) {
      finishedHomeEditTask = homeEditTaskSession.finishActiveTask({ succeeded: false, summaryFailed: true, completion: homeCompletion })
      if (homeRunTraceId && runTraceStore.getRun(homeRunTraceId)?.status === 'running') {
        addHomeTraceEvent({
          type: 'edit-task-summary-failed-content-verified',
          level: 'warn',
          label: '写入已完成，仅总结回复失败',
          detail: '所有计划批次已落盘；供应商总结请求失败，不视为写入失败',
        })
        finishHomeRun(
          'success',
          undefined,
          `编辑任务已完成 ${activeHomeEditTask.executedBatches.length}/${activeHomeEditTask.executedBatches.length} 批写入；仅最终总结未生成。文档内容已落盘。`,
          'edit_task_written_summary_failed',
        )
      }
    } else {
      finishedHomeEditTask = homeEditTaskSession.finishActiveTask({ succeeded: homeTurnSucceeded, completion: homeCompletion })
    }
    reportHomeEditTaskCompletion(homeEditTaskSession.completionReport())
    if (homeAgentTerminalStatus) {
      const mergedHomeTerminal = mergeEditTaskTerminal({
        agentTerminal: {
          status: homeAgentTerminalStatus,
          reason: homeAgentTerminalReason || homeAgentTerminalStatus,
        },
        editTask: finishedHomeEditTask || homeEditTaskSession.activeTask(),
        completionReport: homeEditTaskSession.completionReport(),
      })
      if (mergedHomeTerminal.override) {
        addHomeTraceEvent({
          type: 'edit-task-terminal-override',
          level: 'warn',
          label: '动态批次完成度覆盖旧计划口径',
          detail: `EditTask 已完成并通过内容级校验；${mergedHomeTerminal.evidenceReason}`,
        })
        homeAgentTerminalStatus = mergedHomeTerminal.terminal.status
        homeAgentTerminalReason = mergedHomeTerminal.terminal.reason
      }
    }
 }
  homeToolRunSupervisor?.dispose()
  homeToolRunSupervisor = null
  if (homeRunTraceId && runTraceStore.isAwaitingUser(homeRunTraceId)) {
    closeActiveHomeApiCall('canceled', '等待用户确认，未发起 API 调用')
  } else {
    closeActiveHomeApiCall('failed', '运行收尾时仍未闭合')
  }
    clearWorkspaceSnapshotIfSafe()
    activeAbortController = null
    activeHomeExecutionPlan = null
    if (chatStore.generationStatus === 'preparing' || chatStore.generationStatus === 'streaming' || chatStore.generationStatus === 'retrying') {
      chatStore.setGenerationState('idle')
    }
    await nextTick()
    scrollToBottom()
  }
  } finally {
    homeSendStarting.value = false
  }
}

function getHomeSessionReadLedger(targetId: string): DocumentReadLedger {
  const sessionKey = chatStore.currentContext?.tabId || 'default'
  if (
    !homeSessionReadLedger
    || homeSessionReadLedger.snapshot().targetId !== targetId
    || homeReadLedgerSessionKey !== sessionKey
  ) {
    homeSessionReadLedger = createDocumentReadLedger({
      workspace: 'main',
      targetId,
    })
    homeReadLedgerSessionKey = sessionKey
  }
  return homeSessionReadLedger
}

function removeEmptyAssistantMessage() {
  const session = chatStore.activeSession
  const last = session?.messages[session.messages.length - 1]
  if (session && last?.role === 'assistant' && !last.content) {
    session.messages.pop()
    session.updatedAt = Date.now()
    chatStore.saveSessions(projectId.value)
  }
}

async function callApi(
  provider: any,
  model: string,
  systemPrompt: string,
  userText: string,
  maxDepth: number,
  projId: string,
 engineInput = userText,
    tools?: AgentToolDefinition[],
 externalRequestTarget?: EditorTargetSnapshot,
 plainIntent?: PlainDialogueIntent,
 actualToolSurface?: Array<{ name: string; policy: 'read' | 'write' }>,
 workflowWrite?: DialogueWriteAuthorization | undefined,
 permissionDecision?: DialoguePermissionDecision | undefined,
 executionPlan?: LongDocumentExecutionPlan,
 operationType?: LongDocumentOperationType,
  skill?: {
    guidance: string
    skillIds: string[]
    promptSource: string
    protocolDiagnostics?: RealSkillDiagnostic[]
  },
  resumedApiBudget?: ApiCallBudget,
): Promise<{
  text: string
  maxTokens?: number | null
  toolCallSummary: string | null
  terminalStatus?: RunTraceStatus
  terminalReason?: string
}> {
  const inputLockController = activeAbortController
  // The per-turn token limit is recorded from the actual request result.
  configureHomeContextCompaction(model, provider.contextWindowTokens)
  const requestTarget = externalRequestTarget || createMainEditorTargetSnapshot(editorStore.activeTab, projId)
  // P4: AI 任务开始前创建工作区快照
  // 经验引用: §1 M1（影响圈声明）、§7 规则6（项目 ID 前缀）
  if (!hasWorkspaceSnapshot()) {
    captureWorkspaceSnapshot(editorStore.tabs, editorStore.activeTabId)
  }
  const placeholderMessage = chatStore.addMessage({ role: 'assistant', content: '', tabId: chatStore.currentContext?.tabId || '' }, projId)
  if (!placeholderMessage) throw new Error('当前没有可用对话会话')

 const contextBundle = await conversationContextService.buildContextBundle({
   projectId: projId,
   workspace: 'main',
   purpose: 'generate',
   immediateContextMessages: getChatContextMessages(userText),
   toolAudit: lastHomeToolAudit,
   workspaceState: {
     editorContent: requestTarget.content,
     referenceOutline: projectStore.outlineText || '',
     selectedText: requestTarget.selectedText || undefined,
     activeTab: requestTarget.label
   }
 })
 const contextPolicy = conversationContextService.getPolicy('generate')
 // Build structured ContextPack blocks for contract validation; assembly stays unchanged.
 void conversationContextService.buildDialogueContextBlocks(
   contextBundle,
   { ...contextPolicy, includeOutline: false, includeSettings: false, includeMemory: false }
 )
 const messages = conversationContextService.assembleMessages(
    contextBundle,
    {
      ...contextPolicy,
      includeOutline: false,
      includeSettings: false,
      includeMemory: false,
      recentTurns: Math.max(1, Math.floor(maxDepth / 2))
    },
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: engineInput }
    ]
  )
  const ctxTurns = messages.filter(message => message.role === 'user' || message.role === 'assistant').length / 2
  const historyNeutralization = contextBundle.execution.historyNeutralization

  const service = await getAiService()
  const requestMaxTokens = Number(provider.maxTokens) > 0 ? Number(provider.maxTokens) : null
  const releaseInputOnTerminalState = (status: AgentOrchestratorStatus) => {
    if (status !== 'needs_user' && status !== 'stalled'
      && status !== 'failed' && status !== 'canceled' && status !== 'completed') return
    if (activeAbortController !== inputLockController) return
    if (homeInputBlocked.value) {
      addHomeTraceEvent({
        type: 'input-unlocked-terminal-state',
        level: status === 'completed' ? 'info' : 'warn',
        label: 'Agent 已进入终态，输入已解锁',
        detail: `agent_status:${status}`,
      })
    }
  }
  const tracePipelineMetadata = buildContextPack(requestTarget, undefined, {
    provider,
    model,
    maxOutputTokens: requestMaxTokens,
  })?.pipeline ?? null
  const traceApiCallId = startHomeApiCall({
    skillName: selectedCoCreationSkills.value.length > 0 ? '主页共创' : '直接对话',
    requestMessages: messages.map(message => ({ role: message.role, content: String(message.content || '') })),
    model,
    intent: plainIntent,
    permissionDecision,
    toolSurface: actualToolSurface,
    actualToolSurface
  })
  if (skill?.protocolDiagnostics?.length) {
    runTraceStore.appendFolderDiagnostics(homeRunTraceId || '', skill.protocolDiagnostics)
    const ignoredCount = skill.protocolDiagnostics
      .filter(item => item.code === 'folder-package:manifest-protocol-fields-ignored')
      .length
    if (ignoredCount > 0) {
      addHomeTraceEvent({
        type: 'skill-tool-declarations-ignored',
        level: 'info',
        label: 'SKILL 工具/授权声明已忽略',
        detail: `声明 ${ignoredCount} 项，启用 0 项`
      })
    }
  }
  addHomeTraceEvent({
    type: 'editor-context-policy',
    label: '编辑目标上下文策略',
    detail: JSON.stringify({
      targetId: requestTarget.targetId,
      label: requestTarget.label,
      targetLength: requestTarget.content.length,
      contentVersion: requestTarget.contentVersion,
      versionSource: 'stable_content_version',
      selectionSource: requestTarget.targetId === editorStore.activeTab?.id ? 'real' : 'inactive',
      selectionStart: requestTarget.selectionStart,
      selectionEnd: requestTarget.selectionEnd,
      pipeline: tracePipelineMetadata,
      historyNeutralization: historyNeutralization || null,
    })
  })
  const editorContextDiag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
  editorContextDiag?.log?.('info', 'home/editor-context-pipeline', '编辑上下文管道元数据', {
    targetId: requestTarget.targetId,
    pipeline: tracePipelineMetadata,
    historyNeutralization: historyNeutralization || null,
  })
  const requestId = ++homeLastDirectRequestId
  const reportDirectGenerationEvent = (type: 'generation-invalid' | 'direct-retry-start' | 'direct-retry-finished', detail: Record<string, unknown>) => {
    if (homeLastDirectRequestId !== requestId) return
    addHomeTraceEvent({
      type,
      level: type === 'generation-invalid' || (type === 'direct-retry-finished' && detail.success === false) ? 'warn' : 'info',
      label: '产物有效性检查',
      detail: JSON.stringify(detail).slice(0, 20000),
    })
  }
  let directStreamText = ''
  const reasoningControl = getProviderReasoningControl(provider.providerType)
    const agentToolRunBudget = createToolRunBudget({
      plan: executionPlan,
      operation: operationType,
    })
    const agentRuntime = createAgentDialogueRuntime({
      source: 'home',
      runId: homeRunTraceId,
      taskId: `home-direct-${traceApiCallId || Date.now().toString(36)}`,
      goal: engineInput.slice(0, 200) || '完成本轮主页直接对话',
      document: {
        content: requestTarget.content,
        operationType,
        executionPlan,
      },
      editTaskWorkflow: homeLongDocumentEditTaskPlan,
      skillGuidance: skill?.guidance,
      skillIds: skill?.skillIds,
      promptSource: skill?.promptSource,
      idleTimeoutMs: homeLongDocumentEditTaskPlan || (executionPlan ? usesLongDocumentToolRuntime(executionPlan) : false)
        ? LONG_TOOL_RUN_IDLE_TIMEOUT_MS
        : DIRECT_TOOL_RUN_IDLE_TIMEOUT_MS,
      toolRunBudget: agentToolRunBudget.snapshot(),
      getContextRemaining: () => ({
        contextWindowTokens: resolveEffectiveModelContextWindow({
          model,
          providerContextWindowTokens: provider.contextWindowTokens,
        }) ?? null,
        maxOutputTokens: requestMaxTokens,
      }),
      onEvent: (event, snapshot) => {
        if (event.type === 'state') {
          releaseInputOnTerminalState(snapshot.status)
          if (snapshot.status === 'needs_user') {
            const awaitingHomeTask = activeExecutionTaskStore.markAwaitingUserPlan(
              'main',
              projId,
            )
            if (awaitingHomeTask) {
              addHomeTraceEvent({
                type: 'active-plan-awaiting-user',
                level: 'info',
                label: '执行计划已登记，等待用户确认',
                detail: JSON.stringify({
                  taskId: awaitingHomeTask.taskId,
                  planId: awaitingHomeTask.plan?.planId,
                  operation: awaitingHomeTask.operation,
                }),
              })
            }
          }
        }
        addHomeTraceEvent({
          type: `agent-${event.type}`,
          level: event.level === 'warning' ? 'warn' : event.level,
          label: event.label,
          detail: event.detail,
          payload: event.payload,
        })
        const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
        diag?.log?.(
          event.level === 'error' ? 'error' : event.level === 'warning' ? 'warn' : 'info',
          `home/agent-orchestrator/${event.type}`,
          event.label,
          { reason: event.detail, payload: event.payload },
        )
      },
    })
    const agentResult = await agentRuntime.run({
      purpose: 'generate',
      messages,
    model,
    stream: true,
    temperature: provider.temperature ?? 0.7,
      maxTokens: requestMaxTokens,
    retry: true,
    signal: activeAbortController?.signal,
    tools,
    onPhysicalCall: (event) => {
      recordHomePhysicalCall(traceApiCallId, event)
      if (physicalCallReportsProgress(event)) homeToolRunSupervisor?.reportProgress()
    },
    onProviderQueue: event => recordHomeProviderQueue(traceApiCallId, event),
    onStreamToolProgress: progress => {
      homeToolRunSupervisor?.reportProgress()
      if (homeRunTraceId && traceApiCallId) {
        runTraceStore.reportToolArgumentProgress(homeRunTraceId, traceApiCallId, progress)
      }
    },
    onReasoning: (text: string) => {
      appendHomeReasoning(traceApiCallId, text)
    },
    toolPolicy: {
   scenario: 'direct-tool-intensive',
   intent: plainIntent,
  permissionDecision,
   toolRunBudget: agentToolRunBudget,
   onConvergenceStart: () => {
     homeToolRunSupervisor?.dispose()
     addHomeTraceEvent({
       type: 'tool-convergence-started',
       level: 'info',
       label: '开始收敛最终回答',
       detail: '应用已判定继续工具循环不可取（写入终态拒绝、参数反复无效、覆盖检查未通过或轮次耗尽），正在请求不带工具的最终说明'
     })
   },
   onPermissionDenied: event => {
     addHomeTraceEvent({
       type: 'tool-permission-denied',
       level: 'error',
       label: '工具写入权限拒绝',
       detail: `${event.toolName}：${event.reason}`
     })
   },
   onConvergencePseudoCall: event => {
     addHomeTraceEvent({
       type: 'tool-convergence-pseudo-call',
       level: 'warn',
       label: '收敛回答疑似伪工具调用',
       detail: event.text.slice(0, 2000)
     })
     const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
     diag?.log?.('warn', 'tool/convergence-pseudo-call', '收敛回答疑似伪工具调用，已发起一次强纠正请求', {
       workspace: 'home',
       text: event.text.slice(0, 2000),
       reason: event.reason,
     })
   },
   onConvergenceCorrected: () => {
     addHomeTraceEvent({
       type: 'tool-convergence-corrected',
       level: 'info',
       label: '收敛回答已纠正为自然语言',
       detail: '伪工具调用已被拦截，强纠正请求返回可用正文'
     })
     const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
     diag?.log?.('info', 'tool/convergence-corrected', '收敛伪工具调用已通过强纠正请求修复')
   },
   onConvergenceLocalFallback: reason => {
     addHomeTraceEvent({
       type: 'tool-convergence-local-fallback',
       level: 'warn',
       label: '收敛失败，返回本地摘要',
       detail: reason
     })
     const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
     diag?.log?.('warn', 'tool/convergence-local-fallback', '收敛请求未得到可用正文，已返回本地工具结果摘要', {
       workspace: 'home',
       reason,
     })
  },
  onToolStart: (event) => {
    homeToolRunSupervisor?.reportProgress()
    // P7: 通知编辑器实时反馈
    if (!isAgentRuntimeToolName(event.toolName)) {
      window.dispatchEvent(new CustomEvent('tool-activity', { detail: { type: 'tool_start', toolName: event.toolName, targetId: requestTarget.targetId, policy: event.policy } }))
    }
    addHomeTraceEvent({
      type: 'tool_start',
      label: '工具调用开始',
      detail: `${event.toolName}（${event.policy}，第 ${event.iteration} 轮）`
    })
   },
  onToolCall: (event) => {
    recordHomeToolCall(traceApiCallId, event)
    homeToolRunSupervisor?.reportProgress()
    if (!event.result.ok) {
      homeToolRunSupervisor?.reportToolError(
        buildToolErrorKey(event.toolName, event.result.error?.code, event.input),
        3,
        event.iteration,
      )
    }
     // P2: 实时校验写入目标一致性
     if (event.policy === 'write' && event.result.ok) {
       const writableTarget = event.result.data && typeof event.result.data === 'object'
         ? (event.result.data as { targetId?: string }).targetId
         : undefined
       if (writableTarget && writableTarget !== requestTarget.targetId) {
         console.warn('[P2 写入安全] AI 尝试写入非当前目标', { writableTarget, expected: requestTarget.targetId })
       }
     }
     // P7: 通知编辑器工具完成
     if (!isAgentRuntimeToolName(event.toolName)) {
       window.dispatchEvent(new CustomEvent('tool-activity', { detail: { type: event.result.ok ? 'tool_result' : 'tool_error', toolName: event.toolName, targetId: requestTarget.targetId, policy: event.policy } }))
     }
     addHomeTraceEvent({
       type: 'tool_call',
       level: event.result.ok ? 'info' : 'error',
       label: event.result.ok ? '工具调用完成' : '工具调用失败',
       detail: `${event.toolName}：${event.result.ok ? '成功' : (event.result.error?.message || '失败')}`
     })
     // P5: 记录编辑器工具调用到任务状态机；Agent 运行时工具只进 trace，不进入对话 UI。
     if (!isAgentRuntimeToolName(event.toolName) && !aiTaskStore.hasActiveTask) {
       aiTaskStore.createTask({
         description: '编辑器共创',
         projectId: projId,
         workspace: 'main',
         steps: [{ action: event.toolName, targetId: requestTarget.targetId }]
       })
       aiTaskStore.updateTaskState(aiTaskStore.activeTaskId!, 'acting')
     }
      // P5: requestTarget 从外部闭包传入，此处直接使用 callApi 参数
      // requestTarget 在 sendMessage 闭包中定义，callApi 内部需要通过参数传入
     const activeTask = aiTaskStore.activeTask
     if (activeTask && !isAgentRuntimeToolName(event.toolName)) {
       const currentStep = activeTask.steps[activeTask.currentStep]
       if (currentStep && currentStep.action === event.toolName) {
         aiTaskStore.updateStepStatus(
           activeTask.taskId,
           currentStep.stepId,
           event.result.ok ? 'done' : 'failed',
           event.result.ok ? JSON.stringify(event.result.data).slice(0, 200) : undefined,
           event.result.ok ? undefined : event.result.error?.message
         )
       }
       // 如果所有步骤完成，标记任务完成
       if (activeTask.currentStep >= activeTask.steps.length) {
         aiTaskStore.completeTask(activeTask.taskId)
       }
     }
   },
    onCompatibilityMode: () => {
        compatibilityNotice.value = '当前供应商未启用原生工具调用，已使用 JSON 兼容模式'
      }
    },
    meta: {
      source: 'ChatPanel.callApi',
      workspace: 'main',
      targetId: requestTarget.targetId,
      readableTargets: [requestTarget.targetId, ...editorStore.tabs.map(tab => tab.id)]
        .filter((id, index, all) => Boolean(id) && all.indexOf(id) === index),
      ctxTurns: Math.round(ctxTurns),
    },
    onChunk: (text: string) => {
      chatStore.setGenerationState('streaming', '正在接收 AI 输出…')
      directStreamText += text
      appendHomeStream(text, true)
      chatStore.updateLastMessage(directStreamText)
      nextTick().then(() => scrollToBottom())
    },
     callAi: params => service.callAi(params),
    })
    const result = agentResult.result
    if (!result) throw new Error(agentResult.reason || 'Agent 编排器未返回 API 结果')
    const agentTerminal = mapAgentResultToRunTrace({
      agentResult,
      executionPlan,
    })
    const budgetSnapshot = agentResult.snapshot.toolRunBudget
    const executionSettlement: RunTraceExecutionSettlement | undefined = budgetSnapshot
      ? {
        phase: agentResult.snapshot.executionPhase,
        readToolCalls: budgetSnapshot.readToolCalls,
        maxReadToolCalls: budgetSnapshot.maxReadToolCalls,
        writeToolCalls: budgetSnapshot.writeToolCalls,
        reservedWriteToolCalls: budgetSnapshot.reservedWriteToolCalls,
        controlToolCalls: budgetSnapshot.controlToolCalls,
        physicalRequests: budgetSnapshot.physicalRequests,
        maxPhysicalRequests: budgetSnapshot.maxPhysicalRequests,
        exhaustedClasses: budgetSnapshot.exhaustedClasses,
        successfulWriteCount: agentResult.snapshot.successfulWriteCount,
        trustedCoverageCount: agentResult.snapshot.trustedCoverageCount,
        planComplete: agentResult.snapshot.planComplete,
      }
      : undefined
    if (agentResult.toolSurface?.length) {
      runTraceStore.updateApiCallToolSurface(homeRunTraceId || '', traceApiCallId || '', {
        actualToolSurface: agentResult.toolSurface,
        permissionDecision,
      })
    }
  const validity = classifyGenerationValidity({
    text: result.text,
    reasoning: result.reasoning,
    finishReason: result.finishReason,
    usage: result.usage,
    maxTokens: requestMaxTokens,
    toolCalls: result.toolCalls,
    canceled: activeAbortController?.signal.aborted,
  })
  if (!validity.usable && (validity.kind === 'reasoning_exhausted' || validity.kind === 'visible_planning' || validity.kind === 'empty')) {
    reportDirectGenerationEvent('generation-invalid', {
      kind: validity.kind,
      message: validity.message,
      reasoningLength: (result.reasoning || '').length,
      textLength: (result.text || '').length,
    })
    reportDirectGenerationEvent('direct-retry-start', {
      type: 'direct-retry-start',
      message: validity.kind === 'visible_planning'
        ? '可见输出被规划文本占用，已切换直出模式重试'
        : '正文为空，已切换直出模式重试',
      retryStrategy: reasoningControl.supported ? 'thinking_disabled' : 'max_tokens_raised',
      maxTokens: reasoningControl.supported
        ? requestMaxTokens
        : requestMaxTokens == null
          ? 32_768
          : Math.max(requestMaxTokens, Math.round(requestMaxTokens * 1.5)),
    })
    chatStore.setGenerationState('retrying', validity.kind === 'visible_planning'
      ? '可见输出被规划文本占用，正在切换直出模式重试'
      : '正文为空，正在切换直出模式重试')
    const retryStrategy: 'thinking_disabled' | 'max_tokens_raised' = reasoningControl.supported
      ? 'thinking_disabled'
      : 'max_tokens_raised'
    const retryMaxTokens = retryStrategy === 'thinking_disabled'
      ? requestMaxTokens
      : requestMaxTokens == null
        ? 32_768
        : Math.max(requestMaxTokens, Math.round(requestMaxTokens * 1.5))
    const retryResult = await service.callAi({
      purpose: 'generate',
      messages: [...messages, { role: 'system', content: '请直接输出最终正文，不要输出思考过程。' }],
      model,
      temperature: provider.temperature ?? 0.7,
      maxTokens: retryMaxTokens,
      reasoning: retryStrategy === 'thinking_disabled' ? { mode: 'off' } : undefined,
      retryStrategy,
      retry: true,
      signal: activeAbortController?.signal,
      tools: undefined,
      onPhysicalCall: (event) => {
        recordHomePhysicalCall(traceApiCallId, event)
      },
      onProviderQueue: event => recordHomeProviderQueue(traceApiCallId, event),
      onReasoning: (text: string) => {
        appendHomeReasoning(traceApiCallId, text)
      },
      toolPolicy: undefined,
      meta: {
        source: 'ChatPanel.callApi:direct-retry',
        workspace: 'main',
        targetId: requestTarget.targetId,
        readableTargets: [requestTarget.targetId, ...editorStore.tabs.map(tab => tab.id)]
          .filter((id, index, all) => Boolean(id) && all.indexOf(id) === index),
        ctxTurns: Math.round(ctxTurns),
      },
      onChunk: (text: string) => {
        chatStore.setGenerationState('streaming', '正在接收直出重试输出…')
        directStreamText += text
        appendHomeStream(text, true)
        chatStore.updateLastMessage(directStreamText)
        nextTick().then(() => scrollToBottom())
      },
    })
    const retryValidity = classifyGenerationValidity({
      text: retryResult.text,
      reasoning: retryResult.reasoning,
      finishReason: retryResult.finishReason,
      usage: retryResult.usage,
      maxTokens: retryResult.maxTokens ?? retryMaxTokens ?? null,
      toolCalls: retryResult.toolCalls,
      canceled: activeAbortController?.signal.aborted,
    })
    if (!retryValidity.usable) {
      reportDirectGenerationEvent('direct-retry-finished', {
        kind: retryValidity.kind,
        message: GENERATION_VALIDITY_MESSAGES[retryValidity.kind],
        success: false,
        reasoningLength: (retryResult.reasoning || '').length,
        textLength: (retryResult.text || '').length,
      })
      throw new Error(GENERATION_VALIDITY_MESSAGES[retryValidity.kind])
    }
    reportDirectGenerationEvent('direct-retry-finished', {
      kind: retryValidity.kind,
      message: '直出模式重试后已生成正文',
      success: true,
      reasoningLength: (retryResult.reasoning || '').length,
      textLength: (retryResult.text || '').length,
      retryStrategy,
      maxTokens: retryResult.maxTokens ?? retryMaxTokens ?? null,
    })
    finishHomeApiCall(traceApiCallId, {
      status: 'success',
      responseText: retryResult.text || '',
      reasoningText: retryResult.reasoning || '',
      finishReason: retryResult.finishReason,
      convergenceReason: retryResult.convergenceReason,
      usage: retryResult.usage,
      retryStrategy,
      maxTokens: retryResult.maxTokens ?? retryMaxTokens ?? null,
    })
    if (
      agentTerminal.status !== 'success'
      && agentTerminal.status !== 'partially_applied'
      && agentTerminal.status !== 'failed_after_write'
    ) {
      addHomeTraceEvent({
        type: 'agent-terminal-overridden',
        level: 'warn',
        label: 'Agent 终态已被直出重试覆盖',
        detail: `${agentTerminal.status}/${agentTerminal.reason} -> success/direct_retry_valid`,
        payload: {
          agentStatus: agentTerminal.status,
          agentReason: agentTerminal.reason,
          overriddenStatus: 'success',
          overriddenReason: 'direct_retry_valid',
        },
      })
    }
    chatStore.updateLastMessage(retryResult.text || '')
    return {
      text: retryResult.text || '',
      maxTokens: retryResult.maxTokens ?? retryMaxTokens ?? null,
      toolCallSummary: null,
      terminalStatus: 'success',
      terminalReason: 'direct_retry_valid',
    }
  }
  if (!validity.usable) {
    throw new Error(validity.message)
  }
  const toolCallSummary = result.toolCalls?.length
    ? result.toolCalls.map(call => call.name).join(' → ')
    : null
  lastHomeToolAudit = result.toolAudit
  finishHomeApiCall(traceApiCallId, {
    status: 'success',
    responseText: result.text || '',
    reasoningText: result.reasoning || '',
    finishReason: result.finishReason,
    usage: result.usage,
    compatibilityMode: result.compatibilityMode,
    compatibilityWrite: result.compatibilityWrite,
    toolsDowngraded: result.toolsDowngraded,
    downgradeReason: result.compatibilityWrite ? 'compatibility_write' : undefined,
      maxTokens: result.maxTokens,
      textOrigin: result.textOrigin,
      toolAudit: result.toolAudit,
      executionSettlement,
      readLedger: getHomeSessionReadLedger(requestTarget.targetId).snapshot(),
    })
  if (result.toolsDowngraded === 'json-protocol' && !compatibilityNotice.value) {
    compatibilityNotice.value = '供应商拒绝原生工具调用，已降级为 JSON 兼容模式'
  }
  const compatibilityWriteNotice = compatibilityNoticeFor(result)
  if (compatibilityWriteNotice) {
    compatibilityNotice.value = compatibilityWriteNotice
    addHomeTraceEvent({
      type: 'tool-compatibility',
      level: 'warn',
      label: '兼容模式完成编辑器直写',
      detail: 'compatibility_write=true'
    })
  }

    const responseText = result.text
    if (responseText) chatStore.updateLastMessage(responseText)
    if ((plainIntent === 'discuss' || plainIntent === 'analyze') && responseText.trim()) {
      const excerptAppended = activeExecutionTaskStore.appendAuthorizedExcerpt(
        'main',
        projId,
        responseText,
      )
      const excerptObservation = activeExecutionTaskStore
        .consumeLastAuthorizedExcerptObservation()
      if (excerptAppended && excerptObservation) {
        addHomeTraceEvent({
          type: 'authorized-plan-excerpt',
          level: excerptObservation.outcome === 'appended' ? 'info' : 'warn',
          label: excerptObservation.outcome === 'appended'
            ? '讨论回复已进入计划授权上下文'
            : '讨论回复未进入计划授权上下文',
          detail: JSON.stringify(excerptObservation),
        })
      }
    }
  const finishReason = result.finishReason || 'unknown'
  const continuationStatus = finishReason === 'length' || finishReason === 'timeout' || finishReason === 'network_error' || finishReason === 'canceled'
    ? continuationStatusFor(finishReason as any, Boolean(result.text))
    : 'completed'
  const activeMessage = chatStore.activeSession?.messages[chatStore.activeSession.messages.length - 1]
  if (activeMessage?.role === 'assistant' && continuationStatus !== 'completed') {
    const snapshot: ContinuationSnapshot = {
      requestId: `chat_${activeMessage.id}`, projectId: projId, workspace: 'main', purpose: 'generate',
      providerId: result.providerId || provider.id, model: result.model || model,
      skillIds: coCreation.config.skillIds,
      agentIds: coCreation.config.skillIds
        .map(skillId => coCreation.config.skillAgents[homeSkillAgentKey(skillId)] || coCreation.config.agentId)
        .filter((agentId, index, all): agentId is string => Boolean(agentId) && all.indexOf(agentId) === index),
      mode: 'single', originalMessages: slimContinuationMessages(messages), _slimmed: true, accumulatedText: result.text || '', continuationCount: 0, status: continuationStatus,
      finishReason: finishReason as any, createdAt: Date.now(), updatedAt: Date.now()
    }
    chatStore.updateMessageContinuation(activeMessage.id, snapshot, chatStore.activeSession?.id || 'main')
    await saveContinuation(snapshot, chatStore.activeSession?.id || 'main')
  }
  return {
    text: responseText,
    maxTokens: result.maxTokens ?? requestMaxTokens ?? null,
    toolCallSummary,
    terminalStatus: agentTerminal.status,
    terminalReason: agentTerminal.reason,
  }
}

function clearWorkspaceSnapshotIfSafe() {
  // P4: 任务完成后清理工作区快照（只在内存中，不持久化）
  // 经验引用: §1 M1（影响圈声明）
  clearWorkspaceSnapshot()
}

function cancelGeneration() {
  activeAbortController?.abort()
}

async function resetConversation() {
  if (isStreaming.value) return
  const confirmed = await appConfirm.confirm({
    title: '重置对话',
    message: '将清空当前对话和会话上下文。API 下次请求会从当前编辑器内容重新开始，不影响编辑器内容、项目记忆和运行记录。',
    confirmText: '清空',
    danger: true
  })
  if (!confirmed) return
  if (homeRunTraceId) runTraceStore.markContextCompacted(homeRunTraceId, '用户点击清空记忆')
  sealHomeTraceSession()
  lastHomeToolAudit = undefined
  activeExecutionTaskStore.clear('main', String(projectId.value))
  activeHomeExecutionPlan = null
  try {
    chatStore.clearSession()
    await conversationContextService.clearSession({
      projectId: projectId.value,
      workspace: 'main',
      purpose: 'generate'
    })
    inputText.value = ''
    compatibilityNotice.value = '上下文已重置，API 将从当前编辑器内容重新开始。'
  } catch (error) {
    console.error('[chat] reset conversation failed:', error)
    compatibilityNotice.value = '重置对话失败：' + (error instanceof Error ? error.message : String(error))
  }
}

const chainBreakpointInfo = ref<{ skillId: string; step: number; error: string; retryCount: number } | null>(null)

async function loadChainBreakpointStatus() {
  try {
    const requestTarget = createMainEditorTargetSnapshot(editorStore.activeTab)
    const bp = await coCreation.loadBreakpoint(`main:${requestTarget.targetId}:${projectId.value}`)
    if (bp && bp.status === 'failed') {
      chainBreakpointInfo.value = {
        skillId: bp.skillId || '',
        step: bp.step,
        error: bp.error || '未知错误',
        retryCount: bp.retryCount || 0,
      }
    } else {
      chainBreakpointInfo.value = null
    }
  } catch {
    chainBreakpointInfo.value = null
  }
}

async function resumeFromChainBreakpoint() {
  if (!chainBreakpointInfo.value || isStreaming.value) return
  const lastUserMsg = [...messages.value].reverse().find(m => m.role === 'user')
  if (lastUserMsg?.content) {
    chainBreakpointInfo.value = null
    const requestTarget = createMainEditorTargetSnapshot(editorStore.activeTab)
    await coCreation.clearBreakpoint(`main:${requestTarget.targetId}:${projectId.value}`)
    nextTick(() => sendMessage(lastUserMsg.content))
  }
}

async function discardChainBreakpoint() {
  chainBreakpointInfo.value = null
  const requestTarget = createMainEditorTargetSnapshot(editorStore.activeTab)
  await coCreation.clearBreakpoint(`main:${requestTarget.targetId}:${projectId.value}`)
}

function retryLastRequest() {
  if (!lastFailedText.value || isStreaming.value) return
  const failed = chatStore.activeSession?.messages[chatStore.activeSession.messages.length - 1]
  if (failed?.role === 'assistant' && failed.content.startsWith('请求失败：')) {
    chatStore.activeSession?.messages.pop()
  }
  inputText.value = lastFailedText.value
  lastFailedText.value = ''
  nextTick(() => sendMessage())
}

async function continueMessage(message: any) {
  const snapshot = message?.continuation as ContinuationSnapshot | undefined
  if (isStreaming.value) {
    await appConfirm.alert('正在生成中，请等待当前回复完成后再续生成')
    return
  }
  if (!snapshot || !canContinue(snapshot)) {
    await appConfirm.alert('当前消息没有可续生成的中断状态')
    return
  }
  chatStore.setGenerationState('streaming', '正在续生成…')
  const targetSessionId = chatStore.activeSession?.id || 'main'
  const targetMessageId = message.id
  activeAbortController = new AbortController()
  startHomeRun('continue', '续生成', [])
  addHomeTraceEvent({
    type: 'continuation-resume',
    label: '续生成断点恢复',
    detail: `已生成 ${snapshot.accumulatedText.length} 字，finish_reason=${snapshot.finishReason}，第 ${snapshot.continuationCount + 1} 次续生成`
  })
  try {
    const continuationRequestMessages = buildContinuationMessages(snapshot)
    const traceApiCallId = startHomeApiCall({
      skillName: '续生成',
      requestMessages: continuationRequestMessages.map((message: any) => ({ role: message.role, content: String(message.content || '') })),
      model: snapshot.model
    })
    const result = await continueSnapshot(await getAiService(), snapshot, {
      signal: activeAbortController?.signal,
      onPhysicalCall: event => recordHomePhysicalCall(traceApiCallId, event),
      onProviderQueue: event => recordHomeProviderQueue(traceApiCallId, event),
      onReasoning: (text: string) => {
        appendHomeReasoning(traceApiCallId, text)
      },
      onChunk: (text: string | null) => {
        const newStreamText = text || ''
        const streamText = snapshot.accumulatedText + newStreamText
        if (!newStreamText) return
        if (homeRunTraceId && traceApiCallId) {
          runTraceStore.appendStream(homeRunTraceId, traceApiCallId, newStreamText)
        }
        chatStore.updateMessageContent(targetMessageId, streamText, targetSessionId)
      }
    })
    finishHomeApiCall(traceApiCallId, {
      status: 'success',
      responseText: result.text || '',
      reasoningText: result.reasoning || '',
      finishReason: result.finishReason,
      convergenceReason: result.convergenceReason,
      usage: result.usage
    })
    finishHomeRun('success', undefined, result.text, 'continuation_complete')
    chatStore.updateMessageContent(targetMessageId, result.text, targetSessionId)
    const nextReason = result.finishReason || 'unknown'
    if (nextReason === 'length' || nextReason === 'timeout' || nextReason === 'network_error' || nextReason === 'canceled') {
      const nextStatus = continuationStatusFor(nextReason as any, Boolean(result.text))
      const nextSnapshot = { ...snapshot, accumulatedText: result.text, continuationCount: snapshot.continuationCount + 1, status: nextStatus, finishReason: nextReason as any, updatedAt: Date.now(), statusHistory: [...(snapshot.statusHistory || []), { fromStatus: snapshot.status, toStatus: nextStatus, reason: `finish_reason=${nextReason}`, recordedAt: Date.now() }] }
      chatStore.updateMessageContinuation(targetMessageId, nextSnapshot, targetSessionId)
      await saveContinuation(nextSnapshot, targetSessionId)
    } else {
      await removeContinuation(snapshot.projectId, snapshot.workspace, targetSessionId)
      chatStore.updateMessageContinuation(targetMessageId, undefined, targetSessionId)
    }
  } catch (error: any) {
    closeActiveHomeApiCall('failed', error?.message || String(error))
    chatStore.setGenerationState('error', '续生成失败：' + (error?.message || String(error)))
    finishHomeRun('failed', error?.message || String(error), undefined, 'continuation_failed')
  } finally {
    closeActiveHomeApiCall('failed', '运行收尾时仍未闭合')
    chatStore.setGenerationState('idle')
  }
}

async function copyMessage(content: string) {
  try {
    await navigator.clipboard.writeText(content)
    window.dispatchEvent(new CustomEvent('show-copy', { detail: { text: content } }))
  } catch (error) {
    console.error('[CHAT] 复制消息失败', error)
    await appConfirm.alert('复制失败，请检查系统剪贴板权限')
  }
}

async function regenerateMessage(index: number) {
  if (isStreaming.value) {
    await appConfirm.alert('正在生成中，请等待当前回复完成后再重生成')
    return
  }
  const currentMessages = messages.value
  const user = currentMessages[index - 1]
  const assistant = currentMessages[index]
  if (!user || user.role !== 'user' || !assistant || assistant.role !== 'assistant') {
    await appConfirm.alert('未找到这条回复对应的原始请求，无法重生成')
    return
  }
  const previousText = chatStore.replaceMessagePair(index - 1, projectId.value)
  if (!previousText) {
    void appConfirm.alert('未找到这条回复对应的原始请求，无法重生成')
    return
  }
  void nextTick().then(() => sendMessage(previousText))
}

async function insertToEditor(content: string) {
  const tab = editorStore.activeTab
  if (!tab) {
    await appConfirm.alert('请先打开或创建一个章节，再插入到编辑器')
    return
  }
  const manualWriteBlocked = await rejectManualWriteWhenTaskActive('manual-insert')
  if (manualWriteBlocked) return
  const editor = document.getElementById('editor-content') as HTMLTextAreaElement | null
  const selectionStart = editor?.selectionStart ?? (tab.content || '').length
  const selectionEnd = editor?.selectionEnd ?? selectionStart
  const target = buildSnapshot({
    workspace: 'main',
    targetId: tab.id,
    label: tab.title,
    chapterId: tab.chapterId,
    mode: tab.mode,
    content: tab.content || '',
    selectionStart,
    selectionEnd
  })
  const command: EditorEditCommand = {
    type: 'editor_edit',
    version: 1,
    operation: selectionStart < selectionEnd ? 'replace_selection' : 'insert',
    content,
    position: 'cursor'
  }
  const plan = buildEditPlan(target, command, { content: tab.content || '' })
  if (!plan.ok) {
    await appConfirm.alert('无法插入：' + (plan.failureReason || '编辑目标不可用'))
    return
  }
  const original = tab.content || ''
  editorStore.pushUndoTransactionForTab(tab.id, original, 'api', '手动插入直写')
  editorStore.updateContent(tab.id, plan.next)
  window.dispatchEvent(new CustomEvent('editor-external-change', {
    detail: { tabId: tab.id, content: plan.next }
  }))
  const start = firstContentDifference(original, plan.next)
  window.dispatchEvent(new CustomEvent('diff-locate', {
    detail: {
      workspace: 'main',
      targetId: tab.id,
      range: { start, end: Math.max(start + 1, start + (plan.next.length - original.length)) },
    },
  }))
  addHomeTraceEvent({
    type: 'manual-direct-write-applied',
    level: 'info',
    label: '主页手动插入已直写',
    detail: `targetId=${tab.id}; operation=${plan.operation}`,
    payload: {
      targetId: tab.id,
      operation: plan.operation,
      originalLength: original.length,
      nextLength: plan.next.length,
    },
    turnId: homeRunTurnId,
  })
  logEditorEdit({
    requestId: `chat-manual-direct-write_${Date.now()}`,
    workspace: 'main',
    tabId: tab.id,
    operation: 'editor_write',
    result: 'applied',
    targetLength: original.length,
    contentLength: Math.max(0, plan.next.length - original.length),
    durationMs: 0,
    detail: '用户手动插入已按直写语义写入编辑器',
  })
}

async function rejectManualWriteWhenTaskActive(operation: 'manual-insert' | 'manual-replace') {
  const activeHomeEditTask = homeEditTaskSession.activeTask()
  if (!activeHomeEditTask || isTerminalEditTaskStatus(activeHomeEditTask.status)) return false
  addHomeTraceEvent({
    type: 'manual-write-task-paused',
    level: 'warn',
    label: '存在挂起编辑任务，手动写入未执行',
    detail: `taskId=${activeHomeEditTask.id}; status=${activeHomeEditTask.status}`,
    payload: { taskId: activeHomeEditTask.id, taskStatus: activeHomeEditTask.status, operation },
    turnId: homeRunTurnId,
  })
  await appConfirm.alert('当前存在挂起的编辑任务，新的写入请求需要先恢复或取消该任务。')
  return true
}

function buildChatEditorTools(requestTarget: EditorTargetSnapshot) {
  const getCurrentTarget = (): EditorTargetSnapshot | null => {
    if (requestTarget.targetId === editorStore.activeTab?.id) {
      return createMainEditorTargetSnapshot(editorStore.activeTab)
    }
    const tab = editorStore.tabs.find(item => item.id === requestTarget.targetId)
    if (!tab) return null
    return createInactiveMainEditorTargetSnapshot(tab)
  }
  const applyDirectWrite = async (input: EditorWriteApplyInput): Promise<
    | { ok: true; rollbackAvailable: boolean; documentVersion: number; contentHash: string }
    | { ok: false; code: string; message: string }
  > => {
    reportHomeSourceContamination(input.original)
    const tab = editorStore.tabs.find(item => item.id === input.targetId)
    if (!tab) return { ok: false, code: 'target_missing', message: '编辑目标已关闭，无法写入' }
    const currentContent = tab.content || ''
    if (currentContent !== input.original) {
      recordEditorPresentation({
        phase: 'failed',
        workspace: 'main',
        targetId: input.targetId,
        mode: input.reveal.mode,
        commands: input.commands.length,
        reason: 'version_changed',
      })
      return { ok: false, code: 'version_changed', message: '编辑器内容已变化，本次写入已取消' }
    }
    const message = chatStore.activeSession?.messages[chatStore.activeSession.messages.length - 1]
    recordEditorPresentation({
      phase: 'start',
      workspace: 'main',
      targetId: input.targetId,
      mode: input.reveal.mode,
      commands: input.commands.length,
      reason: input.reason,
    })
    const record = createEditorBatchRecord({
      workspace: 'main',
      targetId: input.targetId,
      batch: {
        type: 'editor_edit_batch',
        version: 1,
        commands: input.commands,
        reason: input.reason,
      },
      sourceContent: input.original,
      batchId: input.batchId,
    })
    const batchDiffPlan = planEditorEditBatch({
      type: 'editor_edit_batch',
      version: 1,
      commands: input.commands,
      reason: input.reason,
    }, createInactiveMainEditorTargetSnapshot({ ...tab, content: input.original }), { content: input.original })
    editorStore.pushAiBatchCheckpoint(tab.id, currentContent, record.batchId)
    const finishWrite = () => {
      editorStore.updateContent(tab.id, input.next)
      window.dispatchEvent(new CustomEvent('editor-ai-batch-checkpoint', {
        detail: { tabId: tab.id, content: input.next, batchId: record.batchId }
      }))
      window.dispatchEvent(new CustomEvent('editor-external-change', {
        detail: { tabId: tab.id, content: input.next }
      }))
    }
    if (input.reveal.mode === 'stream') {
      await presentDirectWrite({
        targetId: input.targetId,
        original: input.original,
        next: input.next,
        mode: 'stream',
        onProgress: content => editorStore.updateContent(tab.id, content)
      })
    }
    finishWrite()
    window.dispatchEvent(new CustomEvent('editor-stop-follow', {
      detail: { workspace: 'main', targetId: input.targetId }
    }))
    if (message?.role === 'assistant') {
      chatStore.updateMessageEditorBatch(
        message.id,
        {
          type: 'editor_edit_batch',
          version: 1,
          commands: input.commands,
          reason: input.reason,
        },
        {
          workspace: 'main',
          targetId: input.targetId,
          contentHash: hashEditorContent(input.original),
        },
        updateEditorBatchRecord(record, {
          status: 'applied',
          appliedContentHash: hashEditorContent(input.next),
          appliedAt: Date.now(),
          undoAvailable: true,
        }),
        chatStore.activeSession?.id,
        batchDiffPlan.ok && hashEditorContent(input.next) === hashEditorContent(batchDiffPlan.next) ? {
          original: batchDiffPlan.original,
          next: batchDiffPlan.next,
          hunks: buildEditHunks(batchDiffPlan),
        } : undefined,
      )
    }
    recordHomeBatchEvent(record, 'applied', `已直接写入 ${input.commands.length} 条修改`)
    const after = createInactiveMainEditorTargetSnapshot({ ...tab, content: input.next })
    const refreshedTask = activeExecutionTaskStore.refresh(
      'main',
      String(projectId.value),
      after.contentVersion,
      hashEditorContent(input.next),
    )
    logEditorEdit({
      requestId: `chat-direct-write_${record.batchId}`,
      batchId: record.batchId,
      workspace: 'main',
      tabId: input.targetId,
      operation: 'editor_write',
      result: 'applied',
      targetLength: input.original.length,
      contentLength: input.commands.reduce(
        (sum: number, command: { content?: string }) => sum + (command.content?.length || 0),
        0,
      ),
      durationMs: 0,
      detail: `API 直写已应用 ${input.commands.length} 条命令`,
    })
    if (input.reveal.firstChange !== false) {
      const start = firstContentDifference(input.original, input.next)
      window.dispatchEvent(new CustomEvent('diff-locate', {
        detail: {
          workspace: 'main',
          targetId: input.targetId,
          range: { start, end: Math.max(start + 1, start + (input.next.length - input.original.length)) },
        },
      }))
    }
    recordEditorPresentation({
      phase: 'finished',
      workspace: 'main',
      targetId: input.targetId,
      mode: input.reveal.mode,
      commands: input.commands.length,
      reason: input.reason,
    })
    return {
      ok: true,
      rollbackAvailable: true,
      documentVersion: refreshedTask?.documentVersion ?? after.contentVersion,
      contentHash: hashEditorContent(input.next),
    }
  }
  return {
    getSnapshot: getCurrentTarget,
    getAllSnapshots: () => editorStore.tabs.map(tab => createInactiveMainEditorTargetSnapshot(tab)),
    mode: 'direct' as const,
    applyWrite: async (input: EditorWriteApplyInput) => {
      const beforeTab = editorStore.tabs.find(item => item.id === input.targetId)
      const before = beforeTab ? createInactiveMainEditorTargetSnapshot(beforeTab) : null
      const result = await homeEditTaskSession.startOrContinueBatch({
        target: { workspace: 'editor', targetId: input.targetId },
        goal: input.reason || '主页编辑器 API 直写',
      batchId: input.batchId,
      batchDetail: input.batchDetail,
      snapshot: {
          contentVersion: before?.contentVersion || 0,
          contentHash: hashEditorContent(input.original),
        },
      }, () => applyDirectWrite(input), { multiBatch: homeLongDocumentEditTaskPlan })
      if (result.ok) {
        return { ok: true, rollbackAvailable: true } as const
      }
      return {
        ok: false,
        code: result.code || 'write_failed',
        message: result.message || '编辑任务批次执行失败',
      } as const
    },
    onFailedBatch: (batch: EditorWriteRetryCarrier | null) => { homeFailedWriteBatch = batch },
    takeFailedBatch: () => homeFailedWriteBatch,
    revealTarget: async (request: Parameters<EditorRevealer>[0]) => {
      if (request.workspace !== 'main') return
      window.dispatchEvent(new CustomEvent('diff-locate', {
        detail: {
          workspace: 'main',
          targetId: request.targetId,
          range: { start: request.start, end: request.end },
        },
      }))
    },
  }
}

function buildHomeDialogueToolSurface(
  requestTarget: EditorTargetSnapshot,
  intent: PlainDialogueIntent,
  model?: string,
  executionPlan?: LongDocumentExecutionPlan,
  writeAuthorization?: DialogueWriteAuthorization | null,
  requestText?: string,
  authorizedPlanExcerpts?: readonly string[],
): ReturnType<typeof buildDialogueToolSurface> {
  return buildDialogueToolSurface({
    workspace: 'main',
    intent,
    readLedger: getHomeSessionReadLedger(requestTarget.targetId),
    writeAuthorization: writeAuthorization || null,
    maxReadChars: () => getReadCapChars(
      providerStore.activeGenerateProvider,
      model || providerStore.activeGenerateProvider?.selectedModel
        || providerStore.activeGenerateProvider?.models?.[0] || '',
    ),
    ...buildChatEditorTools(requestTarget),
    conversationMarkers: buildHomeConversationMarkers(),
    userRequestText: requestText,
    authorizedPlanExcerpts: authorizedPlanExcerpts || [],
    onContaminationDecision: (decision: EditorWriteContaminationDecision) => addHomeTraceEvent({
      type: decision.type,
      level: decision.type === 'write-contamination-rejected' ? 'warn' : 'info',
      label: decision.type === 'write-contamination-rejected'
        ? '写入内容包含历史对话表述，已整批拒绝'
        : '写入内容由当前用户请求显式提供，允许通过',
      detail: JSON.stringify(decision.payload),
      payload: decision.payload,
      turnId: homeRunTurnId,
    }),
    executionPlan,
    activeEditTask: homeEditTask.value,
    onResumeEditTask: taskId => homeEditTaskSession.resumeEditTask(taskId),
    onCancelEditTask: taskId => homeEditTaskSession.onCancelEditTask(taskId),
    readableTargets: [requestTarget.targetId, ...editorStore.tabs.map(tab => tab.id)]
      .filter((id, index, all) => Boolean(id) && all.indexOf(id) === index),
    writableTarget: requestTarget.targetId,
  })
}

function rollbackEditorBatch(message: ChatMessage) {
  if (isStreaming.value) return
  const record = normalizeEditorBatchRecord(message.editorBatchRecord)
  const tab = record ? editorStore.tabs.find(item => item.id === record.targetId) : null
  if (!record || !tab) {
    void appConfirm.alert('编辑目标已关闭，无法回滚此批次')
    return
  }
  const currentContent = tab.content || ''
  if (!canRollbackEditorBatch(record, currentContent)) {
    recordHomeBatchEvent(record, 'version_changed', '批次应用后编辑器内容已变化，拒绝自动回滚')
    logEditorEdit({
      requestId: `chat-edit_${Date.now()}`,
      batchId: record.batchId,
      workspace: 'main',
      tabId: record.targetId,
      operation: 'editor_edit_batch',
      result: 'rejected',
      targetLength: currentContent.length,
      failureReason: 'version_changed',
      durationMs: 0,
      detail: '批次应用后编辑器内容已变化，拒绝自动回滚'
    })
    void appConfirm.alert('编辑器内容在批次应用后已有修改，请打开运行记录查看失败批次差异，或撤销后重试该批次')
    return
  }
  const undoContent = findEditorBatchUndoContent(editorStore.listUndoContentsForTab(record.targetId), record)
  if (!undoContent) {
    logEditorEdit({
      requestId: `chat-edit_${Date.now()}`,
      batchId: record.batchId,
      workspace: 'main',
      tabId: record.targetId,
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
  editorStore.pushUndoState(tab.id, currentContent)
  editorStore.updateContent(tab.id, undoContent.content)
  window.dispatchEvent(new CustomEvent('editor-external-change', {
    detail: { tabId: tab.id, content: undoContent.content }
  }))
  chatStore.updateMessageEditorBatch(
    message.id,
    undefined,
    undefined,
    updateEditorBatchRecord(record, {
      status: 'rolled_back',
      rolledBackAt: Date.now(),
      undoAvailable: false
    }),
    chatStore.activeSession?.id,
    null,
  )
  recordHomeBatchEvent(record, 'rolled_back', `已回滚 AI 批次，消耗 ${undoContent.consumed} 条撤销历史`)
  logEditorEdit({
    requestId: `chat-edit_${Date.now()}`,
    batchId: record.batchId,
    workspace: 'main',
    tabId: record.targetId,
    operation: 'editor_edit_batch',
    result: 'applied',
    targetLength: currentContent.length,
    contentLength: undoContent.content.length,
    durationMs: 0,
    detail: `已回滚 AI 批次，消耗 ${undoContent.consumed} 条撤销历史；可用撤销恢复`
  })
  void conversationContextService.recordEditorEvent({
    projectId: projectId.value,
    workspace: 'main',
    purpose: 'generate'
  }, `已回滚 AI 编辑批次，恢复 ${undoContent.content.length} 字符`, {
    batchId: record.batchId,
    commandCount: record.commandCount,
    targetId: record.targetId,
    status: 'rolled_back'
  }).catch(error => console.error('[CHAT] 记录 AI 批次回滚上下文失败', error))
}

function editorContentForBatch(message: ChatMessage): string {
  const record = normalizeEditorBatchRecord(message.editorBatchRecord)
  if (!record) return ''
  const tab = editorStore.tabs.find(item => item.id === record.targetId)
  return tab?.content || ''
}

function batchPlanForMessage(
  message: ChatMessage,
  sourceContent: string,
): ReturnType<typeof planEditorEditBatch> | null {
  const record = normalizeEditorBatchRecord(message.editorBatchRecord)
  const batch = message.editorBatch
  if (!record || !batch || batch.type !== 'editor_edit_batch') return null
  return planEditorEditBatch(batch, {
    ...createInactiveMainEditorTargetSnapshot({
      id: record.targetId,
      title: record.targetId,
      content: sourceContent,
    }),
    content: sourceContent,
  }, { content: sourceContent })
}

function rollbackEditorBatchHunk(message: ChatMessage, hunkIndex: number) {
  if (isStreaming.value) return
  const record = normalizeEditorBatchRecord(message.editorBatchRecord)
  const tab = record ? editorStore.tabs.find(item => item.id === record.targetId) : null
  if (!record || !tab) {
    void appConfirm.alert('编辑目标已关闭，无法回滚这一条修改')
    return
  }
  const currentContent = tab.content || ''
  if (!canRollbackEditorBatch(record, currentContent)) {
    recordHomeBatchEvent(record, 'version_changed', '单命令回滚前校验失败：编辑器版本已变化')
    void appConfirm.alert('编辑器内容已变化，请使用整批回滚或重新读取当前文档')
    return
  }
  const batch = message.editorBatch
  if (!batch || batch.type !== 'editor_edit_batch') {
    void appConfirm.alert('批次命令记录缺失，无法单条回滚')
    return
  }
  const undoContent = findEditorBatchUndoContent(editorStore.listUndoContentsForTab(record.targetId), record)
  if (!undoContent) {
    void appConfirm.alert('撤销历史不足，无法回滚这一条修改')
    return
  }
  const originalPlan = planEditorEditBatch(batch, createInactiveMainEditorTargetSnapshot({
    id: record.targetId,
    title: record.targetId,
    content: undoContent.content,
  }), { content: undoContent.content })
  if (!originalPlan.ok) {
    void appConfirm.alert('批次无法重放，已拒绝单条回滚')
    return
  }
  const rejected = [hunkIndex]
  const replanned = applyAcceptedItems(originalPlan, originalPlan.items
    .map(item => item.index)
    .filter(index => index !== hunkIndex))
  if (!replanned.ok) {
    logEditorEdit({
      requestId: `chat-direct-write-hunk_${record.batchId}_${hunkIndex}`,
      batchId: record.batchId,
      workspace: 'main',
      tabId: record.targetId,
      operation: 'editor_write',
      result: 'rejected',
      targetLength: currentContent.length,
      failureReason: 'invalid_command',
      durationMs: 0,
      detail: `单命令回滚重放失败：${replanned.failureReason || 'invalid_command'}`
    })
    void appConfirm.alert('单条回滚重放失败，原文未修改')
    return
  }
  if (originalPlan.next !== currentContent) {
    logEditorEdit({
      requestId: `chat-direct-write-hunk_${record.batchId}_${hunkIndex}`,
      batchId: record.batchId,
      workspace: 'main',
      tabId: record.targetId,
      operation: 'editor_write',
      result: 'rejected',
      targetLength: currentContent.length,
      failureReason: 'version_changed',
      durationMs: 0,
      detail: '撤销栈中批次应用前内容与当前批次命令重放结果不一致，拒绝单条回滚'
    })
    void appConfirm.alert('批次历史与当前内容不匹配，已拒绝单条回滚')
    return
  }
  editorStore.pushUndoState(tab.id, currentContent)
  editorStore.updateContent(tab.id, replanned.next)
  window.dispatchEvent(new CustomEvent('editor-external-change', {
    detail: { tabId: tab.id, content: replanned.next }
  }))
  const rebased = rebaseHunksAfterReject(originalPlan, rejected)
  chatStore.updateMessageEditorBatch(
    message.id,
    undefined,
    undefined,
    updateEditorBatchRecord(record, {
      status: 'applied',
      appliedContentHash: hashEditorContent(replanned.next),
      acceptedIndexes: originalPlan.items.map(item => item.index).filter(index => index !== hunkIndex),
      rejectedIndexes: rejected,
      undoAvailable: true,
    }),
    chatStore.activeSession?.id,
    {
      original: replanned.original,
      next: replanned.next,
      hunks: rebased.hunks,
    },
  )
  addHomeTraceEvent({
    type: 'editor-diff-hunk-rollback',
    label: '单命令回滚',
    detail: JSON.stringify({
      batchId: record.batchId,
      rejectedIndex: hunkIndex,
      hunkCount: rebased.hunks.length,
      rebaseEvents: rebased.rebaseEvents,
      appliedChars: currentContent.length,
      nextChars: replanned.next.length,
    }),
  })
  recordHomeBatchEvent(record, 'applied', `已回滚第 ${hunkIndex + 1} 条修改并重放其余命令`)
  logEditorEdit({
    requestId: `chat-direct-write-hunk_${record.batchId}_${hunkIndex}`,
    batchId: record.batchId,
    workspace: 'main',
    tabId: record.targetId,
    operation: 'editor_write',
    result: 'applied',
    targetLength: currentContent.length,
    contentLength: replanned.next.length,
    durationMs: 0,
    detail: `已回滚单条命令并重放其余命令；hunkCount=${rebased.hunks.length}; rebaseEvents=${rebased.rebaseEvents.length}`
  })
  const firstChange = firstContentDifference(currentContent, replanned.next)
  window.dispatchEvent(new CustomEvent('diff-locate', {
    detail: {
      workspace: 'main',
      targetId: record.targetId,
      range: { start: firstChange, end: Math.max(firstChange + 1, firstChange + (replanned.next.length - currentContent.length)) },
    },
  }))
}

function revealEditorBatchHunk(message: ChatMessage, hunk: EditorDiffHunk) {
  const record = normalizeEditorBatchRecord(message.editorBatchRecord)
  if (!record) return
  const currentContent = editorContentForBatch(message)
  if (!currentContent) {
    void appConfirm.alert('编辑目标已关闭，无法定位这一条修改')
    return
  }
  // Rejected hunks have already been rebased out of the stored diff. Replaying
  // the original batch here would always mismatch, so validate the stored range.
  const storedHunks = message.editorBatchDiff?.hunks || []
  const hasStoredHunk = storedHunks.some(item => item.index === hunk.index)
  const boundedStart = Math.max(0, Math.min(hunk.range.start, currentContent.length))
  const boundedEnd = Math.max(boundedStart + 1, Math.min(hunk.range.end, currentContent.length))
  if (!hasStoredHunk || boundedEnd > currentContent.length || hunk.range.start < 0 || hunk.range.end < hunk.range.start) {
    void appConfirm.alert('编辑器内容已变化，请重新读取当前文档后再定位')
    return
  }
  window.dispatchEvent(new CustomEvent('diff-locate', {
    detail: {
      workspace: 'main',
      targetId: record.targetId,
      range: { start: boundedStart, end: boundedEnd },
    },
  }))
  logEditorEdit({
    requestId: `chat-direct-write-hunk-reveal_${record.batchId}_${hunk.index}`,
    batchId: record.batchId,
    workspace: 'main',
    tabId: record.targetId,
    operation: 'editor_write',
    result: 'applied',
    targetLength: currentContent.length,
    durationMs: 0,
    detail: `用户定位单条修改：index=${hunk.index}; kind=${hunk.kind}; range=${hunk.range.start}-${hunk.range.end}`
  })
}

function revealEditorBatch(message: ChatMessage) {
  const record = normalizeEditorBatchRecord(message.editorBatchRecord)
  if (!record) return
  const tab = editorStore.tabs.find(item => item.id === record.targetId)
  if (!tab) {
    void appConfirm.alert('编辑目标已关闭，无法定位该批次')
    return
  }
  const content = tab.content || ''
  const sourceContent = findEditorBatchUndoContent(editorStore.listUndoContentsForTab(record.targetId), record)?.content
  if (!sourceContent) {
    void appConfirm.alert('找不到批次应用前内容，无法计算首处变更')
    return
  }
  const start = firstContentDifference(sourceContent, content)
  const end = Math.max(start + 1, start + (content.length - sourceContent.length))
  window.dispatchEvent(new CustomEvent('diff-locate', {
    detail: {
      workspace: 'main',
      targetId: record.targetId,
      range: { start, end }
    }
  }))
  logEditorEdit({
    requestId: `chat-direct-write-reveal_${record.batchId}`,
    batchId: record.batchId,
    workspace: 'main',
    tabId: record.targetId,
    operation: 'editor_write',
    result: 'applied',
    targetLength: content.length,
    durationMs: 0,
    detail: '用户在气泡中查看 AI 批次首处变更位置'
  })
}

async function replaceWhole(content: string) {
  const pending = _pendingInlineSelection.value
  const tab = editorStore.activeTab
  if (!tab) {
    await appConfirm.alert('请先打开或创建一个章节，再替换编辑器内容')
    return
  }
  const manualWriteBlocked = await rejectManualWriteWhenTaskActive('manual-replace')
  if (manualWriteBlocked) return
  if (pending && tab && pending.tabId === tab.id && pending.end > pending.start) {
    const original = tab.content || ''
    const start = Math.max(0, Math.min(pending.start, original.length))
    const end = Math.max(start, Math.min(pending.end, original.length))
    const next = original.substring(0, start) + content + original.substring(end)
    editorStore.pushUndoTransactionForTab(tab.id, original, 'api', '手动替换直写')
    editorStore.updateContent(tab.id, next)
    window.dispatchEvent(new CustomEvent('editor-external-change', {
      detail: { tabId: tab.id, content: next }
    }))
    window.dispatchEvent(new CustomEvent('diff-locate', {
      detail: {
        workspace: 'main',
        targetId: tab.id,
        range: { start, end: Math.max(start + 1, start + (next.length - original.length)) },
      },
    }))
    recordManualReplaceWrite(tab.id, original, next, 'replace_selection')
    _pendingInlineSelection.value = null
    return
  }
  if (!tab || !(await appConfirm.confirm({
    title: '替换整章',
    message: '当前没有可用选区，将替换整章内容，确认继续？',
    confirmText: '替换',
    danger: true,
  }))) return
  const original = tab.content || ''
  editorStore.pushUndoTransactionForTab(tab.id, original, 'api', '手动替换直写')
  editorStore.updateContent(tab.id, content)
  window.dispatchEvent(new CustomEvent('editor-external-change', {
    detail: { tabId: tab.id, content }
  }))
  const firstChange = firstContentDifference(original, content)
  window.dispatchEvent(new CustomEvent('diff-locate', {
    detail: {
      workspace: 'main',
      targetId: tab.id,
      range: { start: firstChange, end: Math.max(firstChange + 1, firstChange + (content.length - original.length)) },
    },
  }))
  recordManualReplaceWrite(tab.id, original, content, 'replace_document')
}

function recordManualReplaceWrite(tabId: string, original: string, next: string, operation: 'replace_selection' | 'replace_document') {
  addHomeTraceEvent({
    type: 'manual-direct-write-applied',
    level: 'info',
    label: '主页手动替换已直写',
    detail: `targetId=${tabId}; operation=${operation}`,
    payload: {
      targetId: tabId,
      operation,
      originalLength: original.length,
      nextLength: next.length,
    },
    turnId: homeRunTurnId,
  })
  logEditorEdit({
    requestId: `chat-manual-direct-write_${Date.now()}`,
    workspace: 'main',
    tabId,
    operation: 'editor_write',
    result: 'applied',
    targetLength: original.length,
    contentLength: Math.max(0, next.length - original.length),
    durationMs: 0,
    detail: '用户手动替换已按直写语义写入编辑器',
  })
}

async function clearMessages() {
  chatStore.clearSession()
  await conversationContextService.clearSession({
    projectId: projectId.value,
    workspace: 'main',
    purpose: 'generate'
  })
}

function scrollToBottom() {
  if (messageVirtualizationEnabled.value) {
    messageScrollerRef.value?.scrollToBottom?.()
    return
  }
  const scrollTarget = messageListRef.value || messagesContainer.value
  if (scrollTarget) {
    scrollTarget.scrollTop = scrollTarget.scrollHeight
  }
}
</script>

<style scoped>
.chat-panel {
  width: clamp(340px, 28vw, 520px);
  background: var(--bg-secondary);
  border-left: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
}
.chat-header {
  min-height: 44px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-4);
  padding: var(--space-5) var(--space-5);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  font-size: var(--font-size-md);
  font-weight: 600;
}
.chat-header-title-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: var(--space-4);
  min-width: 0;
}
.chat-header-title {
  flex: 0 0 auto;
}
.messages-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.chat-input-row {
  display: flex;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-6);
  border-top: 1px solid var(--border-color);
}
.chat-generation-status {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  min-height: 34px;
  padding: var(--space-3) var(--space-5);
  border-top: 1px solid var(--border-color);
  background: var(--chat-status-bg);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}
.generation-status-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 7px;
  border-radius: 50%;
  background: var(--chat-status-active);
}
.chat-generation-status.error .generation-status-dot { background: var(--chat-status-error); }
.chat-generation-status.canceled .generation-status-dot { background: var(--chat-status-canceled); }
.generation-status-text {
  min-width: 0;
  flex: 1 1 auto;
  overflow-wrap: anywhere;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 88px;
  overflow: hidden;
}
.chat-live-status-line {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chat-live-status-line.is-retrying {
  color: var(--warning);
}
.chat-compatibility-notice {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  min-height: 34px;
  padding: var(--space-3) var(--space-5);
  border-top: 1px solid var(--border-color);
  background: var(--chat-status-bg);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}
.chat-compatibility-notice span {
  min-width: 0;
  flex: 1 1 auto;
  overflow-wrap: anywhere;
}
.chat-compatibility-notice button {
  flex: 0 0 auto;
  min-height: var(--density-btn-sm-height);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xs);
  background: var(--bg-input);
  color: var(--text-secondary);
  cursor: pointer;
}
.generation-action {
  flex: 0 0 auto;
  min-height: var(--density-btn-sm-height);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xs);
  background: var(--bg-input);
  color: var(--text-primary);
  cursor: pointer;
  font-size: var(--font-size-sm);
  white-space: nowrap;
}
.generation-action:hover { background: var(--bg-hover); }
.generation-cancel { color: var(--accent-lighter); }
.chat-context-bar {
  height: 0;
  overflow: hidden;
}
.skill-area {
  border-top: 1px solid var(--border-color);
}
.co-creation-config-row {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: var(--space-3);
  box-sizing: border-box;
  padding: var(--space-3) var(--space-5);
  background: var(--bg-secondary);
}
.co-creation-field {
  display: flex;
  flex: 1 1 92px;
  min-width: 0;
  flex-direction: column;
  gap: var(--space-1);
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  font-weight: 500;
}
.co-creation-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.select-standard {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  height: var(--density-form-height);
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xs);
  padding: var(--density-form-padding);
  font-size: var(--font-size-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.select-standard:focus {
  border-color: var(--accent);
}
.co-creation-action {
  flex: 0 0 auto;
  min-height: var(--density-btn-sm-height);
  padding: var(--space-3) var(--space-5);
  border: none;
  border-radius: var(--radius-xs);
  background: var(--control-primary-bg);
  color: var(--text-on-accent);
  font-size: var(--font-size-sm);
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.co-creation-action:hover { background: var(--control-primary-bg-hover); }
.co-creation-action:disabled {
  cursor: wait;
  opacity: 0.65;
}
.co-skill-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  box-sizing: border-box;
  padding: 0 var(--space-5) var(--space-4);
  background: var(--bg-secondary);
}
.co-skill-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  max-width: 100%;
  padding: var(--space-1) var(--space-2) var(--space-1) var(--space-3);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xs);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: var(--font-size-xs);
}
.co-skill-seq {
  flex: 0 0 auto;
  color: var(--text-muted);
  font-weight: 600;
}
.co-skill-name {
  min-width: 0;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.co-skill-agent {
  max-width: 96px;
  min-width: 0;
  height: 20px;
  padding: 0 var(--space-3);
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xs);
  font-size: var(--font-size-xxs);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.co-skill-close {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: var(--font-size-sm);
  line-height: 1;
}
.co-skill-close:hover {
  color: var(--text-primary);
}
.co-skill-empty {
  color: var(--text-muted);
  font-size: var(--font-size-xs);
}
.input-hint {
  padding: var(--space-2) var(--space-5) var(--space-4);
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}
.chat-message-scroller {
  padding: var(--space-5);
}
.token-inline {
  margin-left: auto;
  color: var(--text-muted);
}
</style>

