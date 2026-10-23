<template>
  <div id="outline-workspace" data-modal-id="outline-workspace" class="modal-overlay" :style="{ zIndex: modalQueue.getZIndex('outline-workspace') }" @click.self="$emit('close')">
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
            :data-tooltip="isFullscreen ? '缩小' : '放大'"
            @click="isFullscreen = !isFullscreen"
          >
            <AppIcon v-if="!isFullscreen" name="expand" :size="14" />
            <AppIcon v-else name="shrink" :size="14" />
          </button>
          <button id="btn-ai-co-create" class="ow-chat-toggle" @click="chatAreaOpen = !chatAreaOpen">
            AI 共创大纲
          </button>
          <button id="btn-close-outline-workspace" class="modal-close" aria-label="关闭大纲工作台" @click="$emit('close')"><AppIcon name="x" /></button>
        </div>
      </div>
      <div class="ow-body">
        <div class="ow-editor">
          <div class="ow-editor-header">
            <span>大纲编辑器</span>
            <div class="editor-toolbar">
              <div class="editor-toolbar-group">
                <button id="btn-ow-undo" class="btn-sm btn-secondary" data-tooltip="撤销" @click="editCommand('undo')">撤销</button>
                <button id="btn-ow-redo" class="btn-sm btn-secondary" data-tooltip="重做" @click="editCommand('redo')">重做</button>
                <button id="btn-ow-copy" class="btn-sm btn-secondary" data-tooltip="复制选中文本" @click="copySelection">复制</button>
                <button id="btn-ow-cut" class="btn-sm btn-secondary" data-tooltip="剪切选中文本" @click="editCommand('cut')">剪切</button>
                <button id="btn-ow-run-trace" class="btn-sm btn-secondary" data-tooltip="查看大纲工作台运行记录" @click="showRunTrace = true">运行记录</button>
                <button id="btn-ow-paste" class="btn-sm btn-secondary" data-tooltip="粘贴剪贴板文本" @click="pasteText">粘贴</button>
                <button id="btn-ow-find" class="btn-sm btn-secondary" data-tooltip="查找正文" @click="findOpen = !findOpen">查找</button>
                <button id="btn-export-outline-md" class="btn-sm btn-secondary ow-export-btn" @click="exportMd">.md</button>
                <button id="btn-export-outline-txt" class="btn-sm btn-secondary ow-export-btn" @click="exportTxt">.txt</button>
              </div>
            </div>
            <span id="ow-word-count" class="word-count">{{ (projectStore.outlineText || '').length }} 字</span>
          </div>
          <div v-if="findOpen" id="ow-find-bar" class="ow-find-bar">
            <input id="ow-find-input" ref="findRef" v-model="findQuery" class="ow-find-input" placeholder="查找正文..." @keydown.enter="findNext" />
            <input id="ow-replace-input" v-model="replaceQuery" class="ow-find-input" placeholder="替换为..." :disabled="projectStore.outlineLocked" />
            <label class="ow-find-option"><input id="ow-find-case-sensitive" v-model="findCaseSensitive" type="checkbox">区分大小写</label>
            <label class="ow-find-option"><input id="ow-find-whole-word" v-model="findWholeWord" type="checkbox">全词匹配</label>
            <label class="ow-find-option"><input id="ow-find-use-regex" v-model="findUseRegex" type="checkbox">正则</label>
            <span id="ow-find-result" class="ow-find-result">{{ findResult }}</span>
            <button id="btn-ow-find-prev" class="btn-sm btn-secondary" data-tooltip="上一个匹配" @click="findPrevious">上一个</button>
            <button id="btn-ow-find-next" class="btn-sm btn-secondary" data-tooltip="下一个匹配" @click="findNext">下一个</button>
            <button id="btn-ow-find-all" class="btn-sm btn-secondary" data-tooltip="全部选中匹配" :disabled="projectStore.outlineLocked" @click="selectAllMatches">全部选中</button>
            <button id="btn-ow-replace" class="btn-sm btn-secondary" data-tooltip="替换当前匹配" :disabled="projectStore.outlineLocked" @click="replaceCurrent">替换</button>
            <button id="btn-ow-replace-all" class="btn-sm btn-secondary" data-tooltip="替换全部匹配" :disabled="projectStore.outlineLocked" @click="replaceAll">全部替换</button>
            <button id="btn-ow-find-close" class="btn-sm btn-secondary" type="button" aria-label="关闭查找" @click="closeFind">关闭</button>
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
            @keydown="handleEditorKeydown"
            @compositionstart="multiCursorComposing = true"
            @compositionend="multiCursorComposing = false"
          ></textarea>
          <div ref="outlineViewportMirror" class="ow-viewport-mirror" aria-hidden="true"></div>
          <div ref="outlineViewportHighlight" class="ow-viewport-highlight-layer" aria-hidden="true"></div>
          <div ref="outlineMultiCursorLayer" class="ow-multi-cursor-layer" aria-hidden="true"></div>
        </div>
        <div v-show="chatAreaOpen" class="ow-chat">
          <div id="ow-chat-messages" ref="msgContainer" class="ow-messages">
            <div v-if="sourceContaminationNotice" id="ow-source-contamination-notice" class="ow-msg assistant ow-source-contamination">
              <div class="ow-msg-bubble">
                <span>{{ sourceContaminationNotice }}</span>
                <button type="button" @click="sourceContaminationNotice = ''">知道了</button>
              </div>
            </div>
            <div v-if="compatibilityNotice" id="ow-compatibility-notice" class="ow-msg assistant">
              <div class="ow-msg-bubble">{{ compatibilityNotice }}</div>
            </div>
            <div v-for="(msg, i) in messages" :key="i" class="ow-msg" :class="msg.role">
              <div class="ow-msg-bubble" v-html="renderMarkdown(msg.content)"></div>
            <div
              v-if="msg.role === 'assistant' && msg.routingFallback"
              class="ow-routing-fallback"
              :data-msg-index="i"
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
              <div
                v-if="msg.role === 'assistant' && msg.finalDraftTask"
                class="ow-routing-fallback ow-final-draft-status"
                :class="msg.finalDraftTask.status"
              >
                <div class="ow-routing-title">终稿生成：{{ outlineFinalDraftStatusLabel(msg.finalDraftTask.status) }}</div>
                <div class="ow-routing-desc">
                  源文 {{ msg.finalDraftTask.sourceChars }} 字；终稿 {{ msg.finalDraftTask.completedChars || msg.finalDraftTask.accumulatedChars }} 字；续生成 {{ msg.finalDraftTask.continuationCount }} 次。
                </div>
                <div class="ow-routing-desc" v-if="msg.finalDraftTask.error">{{ msg.finalDraftTask.error }}</div>
                <div class="ow-routing-desc ow-final-draft-stalled" v-if="outlineFinalDraftStalled(msg.finalDraftTask)">
                  流式停滞：长时间无新增或持续低速输出。可继续等待、重试当前段或取消生成；重试会保留已完成分段。
                </div>
                <div class="ow-routing-actions" v-if="outlineFinalDraftStalled(msg.finalDraftTask)">
                  <select
                    v-model="outlineStalledRetryProviderId"
                    class="ow-final-draft-provider-select"
                    aria-label="停滞重试供应商"
                  >
                    <option value="">使用当前供应商</option>
                    <option v-for="provider in outlineStalledRetryProviders" :key="provider.id" :value="provider.id">
                      {{ provider.name }}（{{ provider.model }}）
                    </option>
                  </select>
                </div>
                <div
                  class="ow-routing-actions"
                  v-if="canResumeOutlineFinalDraft(msg.finalDraftTask) || outlineFinalDraftStalled(msg.finalDraftTask)"
                >
                  <button class="msg-btn" :disabled="isGenerating" @click="continueOutlineFinalDraft(i)">继续生成终稿</button>
                  <button
                    v-if="msg.finalDraftTask.status === 'generating' || msg.finalDraftTask.status === 'awaiting_continuation' || msg.finalDraftTask.status === 'interrupted'"
                    class="msg-btn"
                    :class="{ 'is-stalled': outlineFinalDraftStalled(msg.finalDraftTask) }"
                    :disabled="isGenerating && !outlineFinalDraftStalled(msg.finalDraftTask)"
                    @click="retryOutlineFinalDraftSegment(i, outlineStalledRetryProviderId)"
                  >重试当前段</button>
                  <button
                    v-if="msg.finalDraftTask.status === 'generating'"
                    class="msg-btn"
                    :disabled="isGenerating"
                    @click="resumeOutlineFinalDraft(i)"
                  >从检查点恢复</button>
                </div>
              </div>
              <div
                v-if="msg.role === 'assistant' && msg.outlineDeletionConfirmation"
                class="ow-routing-fallback ow-deletion-confirmation"
                :data-turn-id="msg.outlineDeletionConfirmation.turnId"
              >
                <div class="ow-routing-title">API 请求删除大纲标题，等待你授权</div>
                <div class="ow-routing-desc">{{ msg.outlineDeletionConfirmation.reason }}。授权前原文不会被修改。</div>
                <div class="ow-routing-actions">
                  <button class="msg-btn" :disabled="isGenerating" @click="approveOutlineDeletion(i)">授权本次删除</button>
                  <button class="msg-btn" :disabled="isGenerating" @click="dismissOutlineDeletion(i)">拒绝并保留原文</button>
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
                v-if="msg.role === 'assistant' && msg.outlineCompatibilityMode"
                class="ow-compatibility-mode"
              >
                <span class="ow-compatibility-mode-title">兼容模式：定位可靠性较低</span>
                <span class="ow-compatibility-mode-desc">当前供应商未启用原生工具调用。请在修改命令中使用结构锚点（卷/章/节标题）或更长的唯一原文片段。</span>
              </div>
              <div v-if="msg.role === 'assistant' && outlineBatchDiffView(i)" class="ow-batch-diff">
                <EditorDiffLayer
                  :batch-plan="{
                    ok: true,
                    original: outlineBatchDiffView(i)!.original,
                    next: outlineBatchDiffView(i)!.next,
                    items: [],
                  }"
                  :current-content="projectStore.outlineText || ''"
                    :stored-hunks="outlineBatchDiffView(i)!.hunks"
              :busy="isGenerating"
                  @rollback-hunk="hunkIndex => rollbackOutlineBatchHunk(i, hunkIndex)"
                  @reveal-hunk="hunk => revealOutlineBatchHunk(i, hunk)"
                />
              </div>
              <div v-if="msg.role === 'assistant'" class="ow-msg-actions">
                <button class="msg-btn" data-tooltip="复制" @click="copyMsg(msg.content)">复制</button>
                <button class="msg-btn" data-tooltip="替换整个大纲" @click="replaceOutline(msg.content)">替换</button>
              <button class="msg-btn" data-tooltip="重新生成该回复" @click="regenerateMsg(i)">重生成</button>
              <button class="msg-btn" data-tooltip="插入到光标处" @click="insertAtCursor(msg.content)">插入</button>
              <button
                v-if="msg.outlineBatchRecord?.status === 'applied' && msg.outlineBatchRecord?.undoAvailable === true"
                class="msg-btn"
                :disabled="isGenerating"
                data-tooltip="恢复该批次应用前的大纲内容"
                @click="rollbackOutlineBatch(i)"
              >回滚批次</button>
              <button
                v-if="msg.outlineBatchRecord?.status === 'applied'"
                class="msg-btn"
                :disabled="isGenerating"
                data-tooltip="在大纲编辑器中定位首处变更"
                @click="revealOutlineBatch(i)"
              >查看位置</button>
              <button
                  v-if="msg.continuation && canContinue(msg.continuation)"
                  class="msg-btn"
                  :disabled="isGenerating"
                  data-tooltip="从中断位置继续生成"
                  @click="continueOutlineMessage(i)"
                >续生成</button>
              </div>
            </div>
            <div v-if="isGenerating" id="ow-streaming-message" class="ow-msg assistant ow-msg-streaming">
              <div class="ow-streaming-status">
                <div
                  v-for="(line, idx) in liveApiStatusLines"
                  :key="`${line.kind}-${idx}`"
                  class="ow-live-status-line"
                  :class="`is-${line.kind}`"
                >{{ line.text }}</div>
              </div>
              <div class="ow-msg-bubble" v-html="streamingRenderedContent || '正在等待 API 返回...'"></div>
            </div>
          </div>
          <EditTaskBanner
            :task="outlineEditTask"
                  :busy="isGenerating"
            @resume="resumeOutlineEditTask"
            @cancel="cancelOutlineEditTask"
          />
          <div class="ow-input-row">
            <ApiChatInput
              v-model="inputText"
              placeholder="和AI讨论大纲..."
                :send-disabled="outlineInputBlocked"
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
          <StyleProfileCard host="outline" />
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
                aria-label="当前技能绑定的智能体"
                @change="handleSkillAgentChange(skill.id, ($event.target as HTMLSelectElement).value)"
              >
                <option value="">默认</option>
                <option v-for="agent in agentStore.agents" :key="agent.id" :value="agent.id">{{ agent.name }}</option>
              </select>
              <button class="ow-chip-close" type="button" aria-label="移除技能" @click="removeSelectedSkill(index)"><AppIcon name="x" /></button>
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
          data-tooltip="解锁后可继续编辑，修改内容需要重新确认才能进入流水线"
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
import { applyOutlineReplacement } from '../../services/outlineReplace'
import { computeEditorMatches, type SearchOptions } from '../../services/editorReplace'
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useModalQueue } from '../../composables/useModalQueue'
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
import { mapAgentResultToRunTrace, mergeEditTaskTerminal } from '../../services/agentTerminalMapping'
import {
  activeExecutionTaskStore,
  type ActiveExecutionTask,
  type ActiveExecutionTaskSnapshot,
} from '../../services/activeExecutionTaskStore'
import { isAgentRuntimeToolName } from '../../services/agentToolConflict'
import { useProjectStore } from '../../stores/project'
import { useEditorStore } from '../../stores/editor'
import { useProviderStore } from '../../stores/provider'
import { usePipelineStore } from '../../stores/pipeline'
import { useSkillStore } from '../../stores/skill'
import { useAgentStore } from '../../stores/agent'
import { migrateSkillAgentBindings } from '../../services/skillAgentBinding'
import { buildWorkspaceSkillGuidance, createRoutingAwaitState, inferRoutingFallbackIntent, resolvePostProcessTerminalStatus, runWorkspaceSkills, validateRoutingResumeToken, type ChainRoutingEvent, type WorkspaceArtifactContract, type WorkspaceSkillEngineAdapter, type WorkspaceSkillRunMeta, type WorkspaceSkillTemplate } from '../../services/workspaceSkillEngine'
import { formatSkillFallback } from '../../services/skillRouter'
import { collectSkillPackageProtocolDiagnostics, type RealSkillDiagnostic } from '../../services/realSkillExecutor'
import {
  classifyPlainDialogueIntentDetailed,
  type ChainIntent,
  type ChainRoutingContext,
  type ChainRoutingResult,
  type DetailedChainRoutingResult,
  type PlainDialogueIntentDetailed,
} from '../../services/chainIntentRouter'
import {
  buildOutlineDeletionCommandHash,
  createOutlineDeletionContract,
  isOutlineDeletionAffirmativeInput,
  resolveOutlineDeletionGate,
} from '../../services/outlineDeletionContract'
import {
  consumeIntentCorpusInference,
  recordIntentRoutingConfirmation,
  recordIntentRoutingSample,
  stageIntentCorpusInference,
} from '../../services/intentCorpusCollector'
import {
  appendDialogueToolSurfaceDeclaration,
  buildDialogueToolSurfaceDeclarationAudit,
  authorizeDialogueTools,
  buildDialogueToolSurface,
  buildWorkflowWriteAuthorizationFromPlan,
  type DialogueToolSurfaceSummary,
  type EditorWriteContaminationDecision,
  type ToolResult,
} from '../../services/dialogueToolSurface'
import type { PlainDialogueIntent } from '../../services/plainDialogueIntent'
import RealSkillDiagnosticsPanel from './RealSkillDiagnosticsPanel.vue'
import EditorDiffLayer from '../editor/EditorDiffLayer.vue'
import RunTracePanel from './RunTracePanel.vue'
import EditTaskBanner from './EditTaskBanner.vue'
import ApiChatInput from './ApiChatInput.vue'
import AppIcon from './AppIcon.vue'
import { createApiCallBudget, type ApiCallBudget } from '../../services/apiCallBudget'
import { LONG_DOCUMENT_ACTIVE_TIMEOUT_MS } from '../../services/stateWatchdog'
import { importFile } from '../../services/file-import'
import { useAiCallTrace } from '../../composables/useAiCallTrace'
import { useLiveApiStatus, type LiveApiStatusInput } from '../../composables/useLiveApiStatus'
import { useAppConfirm } from '../../composables/useAppConfirm'
import {
  getAiService,
  type CallAiParams,
  type PhysicalCallEvent,
  type ProviderQueueEvent,
} from '../../services/aiService'
import { extractJsonCandidates } from '../../services/jsonExtraction'
import { createIntentLlmFallback } from '../../services/intentLlmFallback'
import { conversationContextService, resolveEffectiveModelContextWindow } from '../../services/conversationContextService'
import { canContinue, continuationStatusFor, type ContinuationSnapshot } from '../../services/continuation'
import { buildContinuationMessages, continueSnapshot } from '../../services/continuationService'
import { classifyRunOutcome } from '../../services/generationValidity'
import { slimContinuationMessages } from '../../services/continuationSlim'
import { saveContinuation, loadContinuation, removeContinuation } from '../../services/continuationStorage'
import { logEditorEdit, logEditorPresentation } from '../../services/editorEditDiagnostics'
import type { EditorEditCommand } from '../../services/editorEditProtocol'
import { validateOutlineIntegrity } from '../../services/outlineIntegrity'
import {
  resolveOutlineDeletionAuthorization,
} from '../../services/outlineDeletionAuthorization'
import { canRollbackEditorBatch, createEditorBatchRecord, findEditorBatchUndoContent, normalizeEditorBatchRecord, toDialogueBatchEvent, updateEditorBatchRecord } from '../../services/editorBatchRecord'
import type { EditorBatchRecord } from '../../services/editorBatchRecord'
import { applyAcceptedItems, planEditorEditBatch } from '../../services/editorEditBatch'
import { buildEditHunks, normalizeEditorDiffHunks, rebaseHunksAfterReject, type EditorDiffHunk } from '../../services/editorDiffHunks'
import {
  buildContextPack,
  buildSnapshot,
  getReadCapChars,
} from '../../services/editorEntryFacade'
import { createOutlineTools } from '../../services/outlineTools'
import { createDocumentReadLedger, type DocumentReadLedger } from '../../services/documentReadLedger'
import { LONG_DOCUMENT_CHAR_THRESHOLD, type LongDocumentOperationType } from '../../services/longDocumentPolicy'
import {
  buildLongDocumentExecutionPlan,
  toLongDocumentOperationType,
  usesLongDocumentToolRuntime,
  type LongDocumentExecutionPlan,
} from '../../services/longDocumentExecutionPlanner'
import { calculateLongDocumentPhysicalRequestBudget } from '../../services/longDocumentWriteProtocol'
import { transformDocument } from '../../services/documentTransformService'
import { createToolRunBudget, shouldRetryStalledDirectWrite } from '../../services/toolRunBudget'
import type { DialogueWriteAuthorization } from '../../services/dialogueToolSurface'
import {
  continueFinalDraftTask,
  createFinalDraftStatusMessage,
  finalDraftSourceHash,
  finalDraftStatusNeedsAction,
  resumeFinalDraftTask,
  retryFinalDraftSegmentTask,
  runFinalDraft,
} from '../../services/finalDraftRunner'
import { canResumeFinalDraftTask, finalDraftCheckpointId, resolveFinalDraftTaskFromView } from '../../services/finalDraftCheckpoint'
import { compileStyleContext } from '../../services/styleContextCompiler'
import { createElectronFinalDraftCheckpointStore } from '../../services/finalDraftCheckpointElectron'
import { formatFinalDraftProgress } from '../../services/finalDraftProgress'
import { buildStyleTemplateVariables } from '../../services/styleTemplateContext'
import {
  type FinalDraftEvent as FinalDraftTaskEvent,
  describeFinalDraftEvent,
  FinalDraftDocumentState,
  FinalDraftEditorAdapter,
  FinalDraftTask,
  FinalDraftTaskView,
  toFinalDraftTaskView,
} from '../../services/finalDraftService'
import type { FinalDraftEvent } from '../../services/finalDraftService'
import type { ContextBudgetDecision } from '../../services/contextBudget'
import {
  buildToolErrorKey,
  createToolRunSupervisor,
  DIRECT_TOOL_RUN_HARD_DEADLINE_MS,
  DIRECT_TOOL_RUN_IDLE_TIMEOUT_MS,
  LONG_TOOL_RUN_IDLE_TIMEOUT_MS,
  physicalCallReportsProgress,
  type ToolRunSupervisor,
} from '../../services/toolRunSupervisor'
import type { ContextMessage } from '../../types/context'
import { enhanceCodeBlocks, renderMarkdown as renderMarkdownText } from '../../utils/markdownService'
import { useThrottledMarkdown } from '../../utils/throttledMarkdown'
import { extractJsonArray } from '../../services/jsonExtraction'
import { createTextareaViewport, type EditorViewport } from '../../services/editorViewport'
import {
  buildMultiCursorEditPlan,
  buildSelectionSetFromMatches,
  type MultiCursorCommand,
  type NormalizedSelection,
} from '../../services/editorSelectionModel'
import { useEditTaskSession, type EditTaskSessionLifecycleEvent } from '../../composables/useEditTaskSession'
import type { EditTaskCompletionReport } from '../../services/editTaskCompletion'
import type { EditTask } from '../../services/editTaskService'
import { detectSourceContamination } from '../../services/sourceContaminationDetector'
import { describeRoutingDiagEvent } from '../../services/routingDiagBridge'
import {
  buildStyleAnalysisUserPrompt,
  parseStyleAnalysis,
  STYLE_ANALYSIS_SYSTEM_PROMPT,
  type StyleAnalysisReport,
  type StyleAnalysisRequestPayload,
  type StyleAnalysisResultPayload,
} from '../../services/styleAnalysis'
import StyleProfileCard from './StyleProfileCard.vue'

const emit = defineEmits<{ close: []; navigate: [target: string] }>()

const projectStore = useProjectStore()
const editorStore = useEditorStore()
const appConfirm = useAppConfirm()
const providerStore = useProviderStore()
const pipelineStore = usePipelineStore()
const skillStore = useSkillStore()
const agentStore = useAgentStore()
const runTraceStore = useRunTraceStore()

const modalQueue = useModalQueue()
onMounted(() => modalQueue.open('outline-workspace'))
onUnmounted(() => modalQueue.close('outline-workspace'))

const messages = computed(() => projectStore.outlineChat)
const outlineStyleProfileEffective = computed(() => projectStore.styleProfileEffective)
let outlineStyleAnalysisRunId: string | null = null
const inputText = ref('')
const outlineStalledRetryProviderId = ref('')
const outlineDeletionContract = createOutlineDeletionContract()
const pendingOutlineDeletionConfirmation = ref<{
  turnId: string
  targetSignature: string
  reason: string
  requestText: string
} | null>(null)
const pendingOutlineDeletionReplay = ref<{
  targetId: string
  batchId: string
  next: string
  original: string
  commands: EditorEditCommand[]
  batchDetail?: {
    segmentId: string
    expectedChange: string
    invariantResult?: string
  }
  reason?: string
  writeAuthorization?: DialogueWriteAuthorization
  reveal: { mode: 'stream' | 'instant'; firstChange: boolean }
  multiBatch?: boolean
} | null>(null)
  const pendingOutlineDirectWrite = ref<{ batch: { type: 'editor_edit_batch'; version: 1; commands: EditorEditCommand[]; reason?: string }; record: EditorBatchRecord; diff?: OutlineBatchDiffSnapshot } | null>(null)
interface OutlineBatchDiffSnapshot {
  original: string
  next: string
  hunks: EditorDiffHunk[]
}

function normalizeOutlineDiff(raw: unknown): OutlineBatchDiffSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Partial<OutlineBatchDiffSnapshot>
  if (typeof value.original !== 'string' || typeof value.next !== 'string') return null
  const hunks = normalizeEditorDiffHunks(value.hunks)
  if (!hunks.length) return null
  return { original: value.original, next: value.next, hunks }
}

function outlineBatchDiffView(messageIndex: number): OutlineBatchDiffSnapshot | null {
  const message = messages.value[messageIndex]
  if (message?.role !== 'assistant' || message.outlineBatchRecord?.status !== 'applied') return null
  return normalizeOutlineDiff(message.outlineBatchDiff)
}
let outlineFailedWriteBatch: {
  workspace: string
  targetId: string
  contentVersion: number
  commands: EditorEditCommand[]
  succeededIndexes: number[]
} | null = null
let outlineDirectWriteMultiBatch = false
const msgContainer = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const editorRef = ref<HTMLTextAreaElement | null>(null)
const outlineViewportMirror = ref<HTMLDivElement | null>(null)
const outlineViewportHighlight = ref<HTMLDivElement | null>(null)
const outlineMultiCursorLayer = ref<HTMLDivElement | null>(null)
let outlineViewport: EditorViewport | null = null
const multiCursorSelection = ref<NormalizedSelection | null>(null)
const multiCursorBaseContent = ref('')
const multiCursorComposing = ref(false)
const chatAreaOpen = ref(false)
const isFullscreen = ref(false)
const saveFeedback = ref('')
const lastUserRequest = ref('')
const currentRoutingIntent = ref<PlainDialogueIntent>('discuss')
const compatibilityNotice = ref('')
const sourceContaminationNotice = ref('')
const showRunTrace = ref(false)

const OUTLINE_WORKSPACE_ID = 'outline'
const OUTLINE_SESSION_ID = 'outline'

const outlineEditTaskSession = useEditTaskSession({
  sessionId: OUTLINE_SESSION_ID,
  source: 'outline',
  hashContent: hashOutlineContent,
  onLifecycle: event => recordOutlineEditTaskEvent(event),
})
const outlineEditTask = computed(() => outlineEditTaskSession.activeTaskRef().value)

function recordOutlineEditTaskEvent(event: EditTaskSessionLifecycleEvent) {
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
  addOutlineTraceEvent({
    type: `edit-task-${event.type.replace(/_/g, '-')}`,
    level: event.type === 'batch_failed' ? 'warn' : 'info',
    label: `编辑任务：${event.type}`,
    detail: JSON.stringify(payload).slice(0, 20000),
    payload,
    turnId: outlineRunTurnId,
  })
  if (outlineRunTraceId) {
    runTraceStore.reportEditTaskActivity(outlineRunTraceId, payload, {
      turnId: outlineRunTurnId,
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
    const snapshot = createOutlineRequestTarget()
    activeExecutionTaskStore.complete(
      'outline',
      outlineProjectId(),
      snapshot?.contentVersion || 0,
      hashOutlineContent(snapshot?.content || projectStore.outlineText || ''),
    )
    return
  }
  activeExecutionTaskStore.clear('outline', outlineProjectId())
}

async function resumeOutlineEditTask(task: { id: string }) {
  await outlineEditTaskSession.resumeEditTask(task.id)
}

async function cancelOutlineEditTask(task: { id: string }) {
  await outlineEditTaskSession.onCancelEditTask(task.id)
}

function reportOutlineEditTaskCompletion(report: EditTaskCompletionReport | null) {
  if (!report) return
  const verified = report.verified
  const payload = {
    verified,
    invariant: report.invariant,
    violations: report.violations,
  }
  addOutlineTraceEvent({
    type: verified ? 'edit-task-completion-verified' : 'edit-task-completion-violation',
    level: verified ? 'info' : 'warn',
    label: verified ? '编辑任务完成度校验通过' : '编辑任务完成度校验失败',
    detail: JSON.stringify(payload).slice(0, 20000),
    payload,
    turnId: outlineRunTurnId,
  })
  if (outlineRunTraceId) {
    runTraceStore.reportEditTaskCompletion(outlineRunTraceId, payload, {
      turnId: outlineRunTurnId,
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

function reportOutlineSourceContamination(sourceContent: string) {
  const contamination = detectSourceContamination(sourceContent, buildOutlineConversationMarkers())
  if (!contamination.detected) return
  sourceContaminationNotice.value = '源文疑似包含上一轮对话说明文本，本次仍按你的当前指令执行，请在结果中重点核对插入说明附近的内容'
  const payload = {
    workspace: 'outline-editor',
    sourceChars: sourceContent.length,
    matchCount: contamination.matches.length,
    truncated: contamination.truncated,
    matches: contamination.matches,
  }
  addOutlineTraceEvent({
    type: 'source-contamination-detected',
    label: '源文疑似包含上一轮对话说明文本',
    level: 'warn',
    detail: JSON.stringify(payload),
    payload,
    turnId: outlineRunTurnId,
  })
  ;(typeof window !== 'undefined' ? (window as any).DiagLogger : null)?.log?.(
    'warn',
    'outline/source-contamination-detected',
    '源文疑似包含上一轮对话说明文本',
    payload,
  )
}
let lastWorkspaceSkillMeta: WorkspaceSkillRunMeta | null = null
let outlineRunTurnId: string | null = null
let outlineSessionProjectId = ''
let outlineSessionReadLedger: DocumentReadLedger | null = null
let outlineApiBudget: ApiCallBudget | null = null
const outlineBudgetTokens = new WeakMap<ApiCallBudget, string>()
let outlineBudgetTokenSeq = 0

function currentOutlineBudgetToken() {
  const budget = outlineApiBudget
  if (!budget) return undefined
  let token = outlineBudgetTokens.get(budget)
  if (!token) {
    outlineBudgetTokenSeq += 1
    token = `outline-budget-${outlineBudgetTokenSeq}`
    outlineBudgetTokens.set(budget, token)
  }
  return token
}

function recordOutlineRoutingEvent(event: ChainRoutingEvent, requestText = currentOutlineUserRequest) {
  const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
  const diagEvent = describeRoutingDiagEvent(event)
  diag?.log?.(diagEvent.level, diagEvent.category, diagEvent.message, diagEvent.payload)
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
        requestText,
      })
      const reroutedToolSurface = reroutedSurface?.tools || []
      const authorizedSurface = authorizeDialogueTools(
        reroutedToolSurface,
        matchedIntent,
      )
      runTraceStore.updateTurnIntent(outlineRunTraceId, outlineRunTurnId, {
        intent: matchedIntent,
        permissionDecision: authorizedSurface.permissionDecision,
        routingFallback: 'none',
        surfaceSource: 'trace-projection',
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
  } else if (event.type === 'routing_diagnostics') {
    addOutlineTraceEvent({
      type: 'routing-diagnostics',
      label: `意图路由诊断：${event.diagnostics.router.decisionLayer}`,
      detail: JSON.stringify(event.diagnostics)
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
    budgetExhausted: undefined,
    outlineDeletionConfirmation: undefined,
  })
}

async function continueOutlineRouting(index: number) {
  const message = messages.value[index]
  if (isGenerating.value || !message?.routingFallback) return
  const fallback: OutlineRoutingFallbackBubble = message.routingFallback
  if (!fallback.requestText) return
  recordIntentRoutingConfirmation({
    projectId: outlineProjectId(),
    projectName: projectStore.projectName,
    workspace: 'outline-workbench',
    runId: fallback.runId,
    requestText: fallback.requestText,
    intent: inferRoutingFallbackIntent(
      fallback.routing || {
        kind: 'no_match',
        confidence: 0,
        reason: 'low-confidence',
        fallbackMode: 'await-user',
      },
    ),
  })
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
    forcedIntent,
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
  if (message.budgetExhausted.budgetToken && message.budgetExhausted.budgetToken !== currentOutlineBudgetToken()) {
    await appConfirm.alert('已有更新的执行占用预算，请从最新一条预算提示继续')
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
  await askAi(requestText, { resumedApiBudget: outlineApiBudget })
}

function outlineProjectId() {
  return String(projectStore.currentProjectId || 'default')
}

function buildOutlineConversationMarkers(limit = 8): Array<{ role: string; content: string }> {
  return messages.value
    .slice(-limit)
    .map(message => ({ role: message.role, content: String(message.content || '') }))
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
    longDocument?: boolean
    permissionDecision?: ReturnType<typeof buildDialogueToolSurface>['permissionDecision']
    toolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
    actualToolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
  } = {},
) {
  const provider = providerStore.activeGenerateProvider
  const timeoutHint: RunTrace['timeoutHint'] = options.longDocument
    ? { active: LONG_DOCUMENT_ACTIVE_TIMEOUT_MS }
    : undefined
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
      timeoutHint,
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
    timeoutHint,
    permissionDecision: options.permissionDecision,
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

async function runOutlineFinalDraftTurn(options: {
  requestText: string
  sourceContent: string
  model: string
  plan: LongDocumentExecutionPlan
  skillGuidance?: string
  conversationMarkers: Array<{ role: string; content: string }>
}) {
  const placeholderIndex = projectStore.outlineChat.length
  projectStore.appendOutlineChat({ role: 'assistant', content: '终稿任务已创建，正在准备生成。' })
  const abortController = generationController || new AbortController()
  generationController = abortController
  const activeCancelController = cancelController || new AbortController()
  cancelController = activeCancelController
  const cancelSignal = activeCancelController.signal
  let latestTask: FinalDraftTask | undefined
  const releaseRunTracking = beginActiveOutlineRunTracking()
  try {
    isGenerating.value = true
    outlineInputUnlockedByAgent.value = false
    generationStatus.value = '正在生成终稿...'
    addOutlineTraceEvent({
      type: 'final-draft-mode-selected',
      level: 'info',
      label: '长文档终稿模式已启动',
      detail: JSON.stringify({
        planId: options.plan.planId,
        operation: options.plan.operation,
        destination: 'outline-editor',
        sourceChars: options.sourceContent.length,
        segments: options.plan.finalDraftPlan?.segments?.length || 1,
      }),
    })
    const aiService = await getAiService()
    const styleProfile = outlineStyleProfileEffective.value
    const styleCompilation = compileStyleContext('final-draft', styleProfile)
    const styleConstraints = styleCompilation.injectedChars > 0
      ? [
        styleCompilation.text
          + '。终稿生成必须符合该风格；如与用户当前指令冲突，以用户当前指令为准并在输出中说明冲突。',
      ]
      : []
    addOutlineTraceEvent({
      type: 'style-profile',
      label: '终稿风格约束已编译',
      detail: JSON.stringify({
        profileVersion: styleProfile.profileVersion,
        target: 'final-draft',
        injectedChars: styleCompilation.injectedChars,
        truncated: styleCompilation.truncated,
        truncationReason: styleCompilation.truncationReason,
        sections: styleCompilation.sections,
      }),
    })
    const task = await runFinalDraft({
      aiService,
      adapter: outlineFinalDraftAdapter(),
      destination: 'outline-editor',
      targetId: 'outline',
      sourceContent: options.sourceContent,
      instruction: options.requestText,
      operation: options.plan.operation,
      model: options.model,
      skillGuidance: options.skillGuidance,
      styleProfileVersion: styleProfile.profileVersion,
      conversationMarkers: options.conversationMarkers,
      signal: abortController.signal,
      cancelSignal,
      checkpointStore: createElectronFinalDraftCheckpointStore(),
      sourceSegments: options.plan.finalDraftPlan?.segments?.map(segment => ({
        segmentId: segment.segmentId,
        start: segment.start,
        end: segment.end,
      })) || undefined,
      onProgress: event => {
        const segments = latestTask?.sourceSegments.length || 1
        const segmentIndex = Math.min((latestTask?.activeSegmentIndex || 0) + 1, segments)
        const completedChars = latestTask?.completedText.length || 0
        generationStatus.value = formatFinalDraftProgress({
          action: '生成',
          segmentIndex,
          segments,
          completedChars,
          streamingChars: event.streamingChars,
          telemetry: event.telemetry,
        })
      },
      onTaskChange: changed => {
        latestTask = changed
        projectStore.updateOutlineChatAt(placeholderIndex, {
          finalDraftTask: toFinalDraftTaskView(changed),
          content: createFinalDraftStatusMessage(changed),
        })
      },
      onTaskEvent: recordOutlineFinalDraftTaskEvent,
    }, outlineFinalDraftTraceHooks())
    const finalTask = task || latestTask
    if (!finalTask) throw new Error('final_draft_task_missing')
    recordOutlineFinalDraftStyleConstraints(finalTask, 'create')
    projectStore.updateOutlineChatAt(placeholderIndex, {
      finalDraftTask: toFinalDraftTaskView(finalTask),
      content: createFinalDraftStatusMessage(finalTask),
    })
    const statusMessage = createFinalDraftStatusMessage(finalTask)
    if (finalTask.status === 'completed') {
      finishOutlineRunIfRunning('success', undefined, statusMessage, 'final_draft_complete')
    } else if (finalTask.status === 'awaiting_continuation') {
      finishOutlineRunIfRunning('success', undefined, statusMessage, 'final_draft_awaiting_continuation')
    } else if (finalTask.status === 'canceled') {
      finishOutlineRunIfRunning('canceled', '终稿任务已取消', statusMessage, 'final_draft_canceled')
    } else {
      finishOutlineRunIfRunning('failed', finalTask.error || '终稿生成失败', statusMessage, 'final_draft_failed')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    projectStore.updateOutlineChatAt(placeholderIndex, {
      finalDraftTask: latestTask ? toFinalDraftTaskView(latestTask) : undefined,
      content: `终稿任务失败：${message}`,
    })
    finishOutlineRunIfRunning('failed', message, undefined, 'final_draft_runtime_exception')
  } finally {
    isGenerating.value = false
    generationStatus.value = ''
    streamingContent.value = ''
    generationController = null
    cancelController = null
    releaseRunTracking()
    await scrollToBottom()
  }
}

async function continueOutlineFinalDraft(index: number) {
  if (isGenerating.value) return
  const storedTask = messages.value[index]?.finalDraftTask
  const sourceContent = projectStore.outlineText || ''
  const resolved = await resolveFinalDraftTaskFromView(storedTask, sourceContent, createElectronFinalDraftCheckpointStore())
  const task = resolved.ok ? resolved.task : undefined
  if (!task || !finalDraftStatusNeedsAction(task)) return
  const provider = providerStore.activeGenerateProvider
  if (!provider?.apiKey) {
    await appConfirm.alert('未配置 API 提供方或 API Key，无法继续生成终稿')
    return
  }
  const abortController = new AbortController()
  const activeCancelController = new AbortController()
  const releaseRunTracking = beginActiveOutlineRunTracking()
  startOutlineRun('continue-final-draft', '继续生成终稿', [], {
    intent: 'generate',
    longDocument: true,
  })
  generationController = abortController
  cancelController = activeCancelController
  let latestTask: FinalDraftTask | undefined
  try {
    isGenerating.value = true
    outlineInputUnlockedByAgent.value = false
    generationStatus.value = '正在继续生成终稿...'
    projectStore.updateOutlineChatAt(index, { content: '正在继续生成终稿...' })
    const aiService = await getAiService()
    latestTask = await continueFinalDraftTask({
      aiService,
      adapter: outlineFinalDraftAdapter(),
      task,
      model: provider.selectedModel || provider.models?.[0] || 'gpt-4o',
      signal: abortController.signal,
      cancelSignal: activeCancelController.signal,
      checkpointStore: createElectronFinalDraftCheckpointStore(),
      onProgress: event => {
        const segments = latestTask?.sourceSegments.length || task.sourceSegments.length || 1
        const segmentIndex = Math.min((latestTask?.activeSegmentIndex ?? task.activeSegmentIndex) + 1, segments)
        const completedChars = latestTask?.completedText.length ?? task.completedText.length
        generationStatus.value = formatFinalDraftProgress({
          action: '续生成',
          segmentIndex,
          segments,
          completedChars,
          streamingChars: event.streamingChars,
          telemetry: event.telemetry,
        })
      },
      onTaskChange: changed => {
        latestTask = changed
        projectStore.updateOutlineChatAt(index, {
          finalDraftTask: toFinalDraftTaskView(changed),
          content: createFinalDraftStatusMessage(changed),
        })
      },
      onTaskEvent: recordOutlineFinalDraftTaskEvent,
    }, outlineFinalDraftTraceHooks())
    if (latestTask) {
      recordOutlineFinalDraftStyleConstraints(latestTask, 'continue')
      projectStore.updateOutlineChatAt(index, {
        finalDraftTask: toFinalDraftTaskView(latestTask),
        content: createFinalDraftStatusMessage(latestTask),
      })
    }
    const statusMessage = latestTask ? createFinalDraftStatusMessage(latestTask) : '终稿续生成失败'
    if (latestTask?.status === 'completed') {
      finishOutlineRunIfRunning('success', undefined, statusMessage, 'final_draft_continuation_complete')
    } else if (latestTask?.status === 'awaiting_continuation') {
      finishOutlineRunIfRunning('success', undefined, statusMessage, 'final_draft_awaiting_continuation')
    } else if (latestTask?.status === 'canceled') {
      finishOutlineRunIfRunning('canceled', '终稿任务已取消', statusMessage, 'final_draft_continuation_canceled')
    } else {
      finishOutlineRunIfRunning('failed', latestTask?.error || '终稿续生成失败', statusMessage, 'final_draft_continuation_failed')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    projectStore.updateOutlineChatAt(index, {
      finalDraftTask: latestTask ? toFinalDraftTaskView(latestTask) : undefined,
      content: `终稿续生成失败：${message}`,
    })
    finishOutlineRunIfRunning('failed', message, undefined, 'final_draft_continuation_runtime_exception')
  } finally {
    isGenerating.value = false
    generationStatus.value = ''
    streamingContent.value = ''
    generationController = null
    cancelController = null
    releaseRunTracking()
    await scrollToBottom()
  }
}

const OUTLINE_FINAL_DRAFT_RESUME_REASONS: Record<string, string> = {
  checkpoint_not_found: '未找到分段检查点，可能尚未完成第一段，请重新发起终稿生成。',
  schema_version_mismatch: '分段检查点版本不兼容，请重新发起终稿生成。',
  task_not_resumable: '该检查点已完成或不可恢复。',
  checkpoint_corrupted: '分段检查点校验失败，请重新发起终稿生成。',
  source_content_mismatch: '大纲源文已变化，为避免拼接错文，请重新发起终稿生成。',
  browser: '当前环境不支持持久化检查点，请在 Electron 应用内恢复。',
}

function outlineFinalDraftResumeErrorText(reason: string) {
  return OUTLINE_FINAL_DRAFT_RESUME_REASONS[reason] || `终稿恢复失败：${reason}`
}

async function retryOutlineFinalDraftSegment(index: number, providerId?: string) {
  const storedTask = messages.value[index]?.finalDraftTask
  const sourceContent = projectStore.outlineText || ''
  const resolved = await resolveFinalDraftTaskFromView(storedTask, sourceContent, createElectronFinalDraftCheckpointStore())
  const existingTask = resolved.ok ? resolved.task : undefined
  if (
    !existingTask
    || (
      existingTask.status !== 'generating'
      && existingTask.status !== 'awaiting_continuation'
      && existingTask.status !== 'interrupted'
    )
  ) return
  const stalled = outlineFinalDraftStalled(existingTask)
  if (isGenerating.value && !stalled) return
  // Capture the retry snapshot before aborting; abort marks the live task canceled/failed.
  const retryTaskSnapshot = existingTask
  if (isGenerating.value) {
    generationController?.abort()
    await activeOutlineRunPromise?.catch(() => {})
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
  if (!sourceContent) {
    await appConfirm.alert('大纲源文为空，无法重试当前段。请先恢复原大纲内容后再试。')
    return
  }
  const abortController = new AbortController()
  const activeCancelController = new AbortController()
  const releaseRunTracking = beginActiveOutlineRunTracking()
  startOutlineRun('retry-final-draft-segment', '重试当前终稿分段', [], {
    intent: 'generate',
    longDocument: true,
  })
  generationController = abortController
  cancelController = activeCancelController
  let latestTask: FinalDraftTask | undefined
  try {
    isGenerating.value = true
    outlineInputUnlockedByAgent.value = false
    generationStatus.value = '正在重试当前终稿分段...'
    projectStore.updateOutlineChatAt(index, { content: '正在重试当前终稿分段...' })
    const aiService = await getAiService()
    latestTask = await retryFinalDraftSegmentTask({
      aiService,
      adapter: outlineFinalDraftAdapter(),
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
      cancelSignal: activeCancelController.signal,
      checkpointStore: createElectronFinalDraftCheckpointStore(),
      onProgress: event => {
        const segments = latestTask?.sourceSegments.length || task.sourceSegments.length || 1
        const segmentIndex = Math.min((latestTask?.activeSegmentIndex ?? task.activeSegmentIndex) + 1, segments)
        const completedChars = latestTask?.completedText.length ?? task.completedText.length
        generationStatus.value = formatFinalDraftProgress({
          action: '重试当前段',
          segmentIndex,
          segments,
          completedChars,
          streamingChars: event.streamingChars,
          telemetry: event.telemetry,
        })
      },
      onTaskChange: changed => {
        latestTask = changed
        projectStore.updateOutlineChatAt(index, {
          finalDraftTask: toFinalDraftTaskView(changed),
          content: createFinalDraftStatusMessage(changed),
        })
      },
      onTaskEvent: recordOutlineFinalDraftTaskEvent,
    }, outlineFinalDraftTraceHooks())
    recordOutlineFinalDraftStyleConstraints(latestTask, 'retry_segment')
    projectStore.updateOutlineChatAt(index, {
      finalDraftTask: toFinalDraftTaskView(latestTask),
      content: createFinalDraftStatusMessage(latestTask),
    })
    const statusMessage = createFinalDraftStatusMessage(latestTask)
    if (latestTask.status === 'completed') {
      finishOutlineRunIfRunning('success', undefined, statusMessage, 'final_draft_segment_retry_complete')
    } else if (latestTask.status === 'awaiting_continuation') {
      finishOutlineRunIfRunning('success', undefined, statusMessage, 'final_draft_segment_retry_awaiting_continuation')
    } else if (latestTask.status === 'canceled') {
      finishOutlineRunIfRunning('canceled', '终稿当前段重试已取消', statusMessage, 'final_draft_segment_retry_canceled')
    } else {
      finishOutlineRunIfRunning('failed', latestTask.error || '终稿当前段重试失败', statusMessage, 'final_draft_segment_retry_failed')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    projectStore.updateOutlineChatAt(index, {
      finalDraftTask: latestTask ? toFinalDraftTaskView(latestTask) : undefined,
      content: `终稿当前段重试失败：${message}`,
    })
    finishOutlineRunIfRunning('failed', message, undefined, 'final_draft_segment_retry_runtime_exception')
  } finally {
    isGenerating.value = false
    generationStatus.value = ''
    streamingContent.value = ''
    generationController = null
    cancelController = null
    releaseRunTracking()
    await scrollToBottom()
  }
}

function canResumeOutlineFinalDraft(task: FinalDraftTask | FinalDraftTaskView) {
  if (task.status === 'awaiting_continuation' || task.status === 'interrupted') return true
  return 'sourceContent' in task && canResumeFinalDraftTask(task)
}

async function resumeOutlineFinalDraft(index: number) {
  if (isGenerating.value) return
  const storedTask = messages.value[index]?.finalDraftTask
  const sourceContent = projectStore.outlineText || ''
  const resolved = await resolveFinalDraftTaskFromView(storedTask, sourceContent, createElectronFinalDraftCheckpointStore())
  const task = resolved.ok ? resolved.task : undefined
  if (!task || task.status !== 'generating') return
  const provider = providerStore.activeGenerateProvider
  if (!provider?.apiKey) {
    await appConfirm.alert('未配置 API 提供方或 API Key，无法恢复终稿生成')
    return
  }
  if (!sourceContent) {
    await appConfirm.alert('大纲源文为空，无法恢复。请先恢复原大纲内容后再试。')
    return
  }
  const abortController = new AbortController()
  const activeCancelController = new AbortController()
  const releaseRunTracking = beginActiveOutlineRunTracking()
  generationController = abortController
  cancelController = activeCancelController
  let latestTask: FinalDraftTask | undefined
  try {
    isGenerating.value = true
    outlineInputUnlockedByAgent.value = false
    generationStatus.value = '正在恢复终稿检查点...'
    projectStore.updateOutlineChatAt(index, { content: '正在恢复终稿检查点...' })
    const aiService = await getAiService()
    latestTask = await resumeFinalDraftTask({
      aiService,
      adapter: outlineFinalDraftAdapter(),
      checkpointId: finalDraftCheckpointId(task.taskId),
      sourceContent,
      checkpointStore: createElectronFinalDraftCheckpointStore(),
      model: provider.selectedModel || provider.models?.[0] || 'gpt-4o',
      signal: abortController.signal,
      cancelSignal: activeCancelController.signal,
      onProgress: event => {
        const segments = latestTask?.sourceSegments.length || task.sourceSegments.length || 1
        const segmentIndex = Math.min((latestTask?.activeSegmentIndex ?? task.activeSegmentIndex) + 1, segments)
        const completedChars = latestTask?.completedText.length ?? task.completedText.length
        generationStatus.value = formatFinalDraftProgress({
          action: '恢复',
          segmentIndex,
          segments,
          completedChars,
          streamingChars: event.streamingChars,
          telemetry: event.telemetry,
        })
      },
      onTaskChange: changed => {
        latestTask = changed
        projectStore.updateOutlineChatAt(index, {
          finalDraftTask: toFinalDraftTaskView(changed),
          content: createFinalDraftStatusMessage(changed),
        })
      },
      onTaskEvent: recordOutlineFinalDraftTaskEvent,
    }, outlineFinalDraftTraceHooks())
    recordOutlineFinalDraftStyleConstraints(latestTask, 'resume')
    projectStore.updateOutlineChatAt(index, {
      finalDraftTask: toFinalDraftTaskView(latestTask),
      content: createFinalDraftStatusMessage(latestTask),
    })
    const statusMessage = createFinalDraftStatusMessage(latestTask)
    if (latestTask.status === 'completed') {
      finishOutlineRunIfRunning('success', undefined, statusMessage, 'final_draft_resume_complete')
    } else if (latestTask.status === 'awaiting_continuation') {
      finishOutlineRunIfRunning('success', undefined, statusMessage, 'final_draft_resume_awaiting_continuation')
    } else if (latestTask.status === 'canceled') {
      finishOutlineRunIfRunning('canceled', '终稿任务已取消', statusMessage, 'final_draft_resume_canceled')
    } else {
      finishOutlineRunIfRunning('failed', latestTask.error || '终稿恢复后未完成', statusMessage, 'final_draft_resume_failed')
    }
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error)
    const reason = rawMessage.startsWith('final_draft_resume_failed:')
      ? rawMessage.slice('final_draft_resume_failed:'.length)
      : rawMessage
    const text = outlineFinalDraftResumeErrorText(reason)
    projectStore.updateOutlineChatAt(index, {
      finalDraftTask: latestTask ? toFinalDraftTaskView(latestTask) : undefined,
      content: text,
    })
    finishOutlineRunIfRunning('failed', text, undefined, 'final_draft_resume_runtime_exception')
  } finally {
    isGenerating.value = false
    generationStatus.value = ''
    streamingContent.value = ''
    generationController = null
    cancelController = null
    releaseRunTracking()
    await scrollToBottom()
  }
}

function finishOutlineRun(status: RunTraceStatus, error?: string, resultPreview?: string, reason?: string) {
  const runId = outlineRunTraceId
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

function outlineFinalDraftStatusLabel(status: string) {
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

function outlineFinalDraftAdapter(): FinalDraftEditorAdapter {
  return {
    getDocumentState: async (): Promise<FinalDraftDocumentState> => {
      const content = projectStore.outlineText || ''
      return {
        targetId: 'outline',
        content,
        documentVersion: outlineDocumentVersion(),
        contentHash: finalDraftSourceHash(content),
      }
    },
    writeDocument: async content => {
      const current = projectStore.outlineText || ''
      if (projectStore.outlineLocked) throw new Error('outline_locked')
      editorStore.pushUndoTransactionForTab('outline', current, 'api', '终稿写入')
      projectStore.setOutline(content)
      return {
        targetId: 'outline',
        documentVersion: outlineDocumentVersion() + 1,
        contentHash: finalDraftSourceHash(content),
      }
    },
    restoreDocument: async content => {
      if (projectStore.outlineLocked) throw new Error('outline_locked_restore')
      projectStore.setOutline(content)
      return {
        targetId: 'outline',
        documentVersion: outlineDocumentVersion() + 1,
        contentHash: finalDraftSourceHash(content),
      }
    },
  }
}

function outlineFinalDraftTraceHooks() {
  return {
    startApiCall: startOutlineApiCall,
    finishApiCall: finishOutlineApiCall,
    recordPhysicalCall: recordOutlinePhysicalCall,
    recordProviderQueue: recordOutlineProviderQueue,
    appendStream: (text: string) => appendOutlineStream(text, true),
    appendReasoning: (callId: string | undefined, text: string | undefined) => {
      if (text) appendOutlineReasoning(text)
      void callId
    },
    addEvent: addOutlineTraceEvent,
  }
}

function recordOutlineFinalDraftTaskEvent(task: FinalDraftTask, event: FinalDraftEvent) {
  const described = describeFinalDraftEvent(event)
  addOutlineTraceEvent({
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
    turnId: outlineRunTurnId,
  })
}

function outlineDocumentVersion() {
  return editorStore.listUndoContentsForTab('outline').length > 0 ? 1 : 0
}

function isOutlineFinalDraftRequest(
  plan: LongDocumentExecutionPlan,
  requestText: string,
  targetContent: string,
) {
  return (plan.mode === 'final-draft' || plan.mode === 'single-pass')
    && Boolean(targetContent)
    && !requestText.trim().startsWith('@')
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

function addOutlineTraceEvent(event: { type: string; label: string; level?: 'info' | 'warn' | 'error'; detail?: string; payload?: unknown; turnId?: string | null }) {
  const runId = outlineRunTraceId
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

function configureOutlineContextCompaction(
  model: string,
  providerContextWindowTokens: number | string | null | undefined,
  reservedOutputTokens?: number,
): void {
  const modelContextWindow = resolveEffectiveModelContextWindow({
    model,
    providerContextWindowTokens,
  })
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
      onContextCompactionLifecycle: event => {
        const detail = [
          `stage=${event.stage}`,
          `status=${event.status}`,
          event.checkpointId ? `checkpointId=${event.checkpointId}` : '',
          event.compactionId ? `compactionId=${event.compactionId}` : '',
          event.detail || '',
        ].filter(Boolean).join('; ')
        addOutlineTraceEvent({
          type: `context-compaction-${event.stage.replace(/_/g, '-')}`,
          level: event.status === 'failed' ? 'warn' : 'info',
          label: `上下文压缩生命周期：${event.stage}`,
          detail
        })
        const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
        diag?.log?.(
          event.status === 'failed' ? 'warn' : 'info',
          'context/compaction',
          `大纲上下文压缩生命周期：${event.stage}`,
          {
            workspace: 'outline',
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
  permissionDecision?: ReturnType<typeof buildDialogueToolSurface>['permissionDecision']
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
    permissionDecision: input.permissionDecision,
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
  convergenceReason?: string
  usage?: unknown
  usageUnavailable?: boolean
  durationMs?: number
    error?: string
    retryStrategy?: 'thinking_disabled' | 'max_tokens_raised' | 'prompt_only'
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
    usageUnavailable: event.usageUnavailable,
    durationMs: event.durationMs,
    error: event.error,
    toolsEnabled: event.toolsEnabled,
    toolsDowngraded: event.toolsDowngraded,
    downgradeReason: event.downgradeReason,
    retryStrategy: event.retryStrategy,
    maxTokens: event.maxTokens,
    modelCapability: event.modelCapability,
    providerContextWindowTokens: event.contextBudget?.providerContextWindowTokens,
    estimatedInputTokens: event.contextBudget?.estimatedInputTokens,
    contextBudgetDecision: event.contextBudget?.decision,
    contextBudgetReason: event.contextBudget?.reason,
    usageReconciliation: event.usageReconciliation,
    interruptionCode: event.interruptionCode,
    contextCompactedMessageCount: event.contextCompactedMessageCount,
    heartbeat: event.heartbeat,
    toolCallCount: event.toolCallCount,
    toolCallNames: event.toolCallNames,
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

function recordOutlineProviderQueue(callId: string | undefined, event: ProviderQueueEvent) {
  if (!outlineRunTraceId) return
  runTraceStore.addEvent(outlineRunTraceId, {
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

function recordOutlineToolCall(callId: string | undefined, event: {
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
  if (!outlineRunTraceId || !callId) return
  runTraceStore.appendToolCall(outlineRunTraceId, callId, {
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

function buildOutlineFallbackMessages(
  requestText: string,
  toolSurface?: Array<{ name: string; policy: 'read' | 'write' }>,
) {
  const hasHistory = messages.value.length > 0
  const userContent = hasHistory
    ? '用户请求: ' + requestText
    : '当前大纲:\n' + (projectStore.outlineText || '') + '\n\n用户请求: ' + requestText
  return [
    { role: 'system', content: buildOutlineSystemPrompt(toolSurface) },
    { role: 'user', content: userContent }
  ]
}

function buildOutlineSystemPrompt(
  toolSurface?: Array<{ name: string; policy: 'read' | 'write' }>,
  activeTask?: EditTask | null,
) {
  const style = outlineStyleProfileEffective.value
  const styleCompilation = compileStyleContext('outline', style)
  const styleBlock = styleCompilation.injectedChars > 0
    ? '\n\n[创作风格约束（应用级，优先级高于普通建议）]\n'
      + styleCompilation.text + '\n'
      + '要求：所有大纲创作、扩写、修改建议必须符合上述风格；如与用户当轮明确要求冲突，以用户当轮要求为准并在回复中说明冲突。'
    : ''
  addOutlineTraceEvent({
    type: 'style-profile',
    label: '大纲工作台风格注入决策',
    detail: JSON.stringify({
      profileVersion: style.profileVersion,
      locked: style.locked,
      injected: style.injected,
      target: 'outline',
      injectedChars: styleCompilation.injectedChars,
      truncated: styleCompilation.truncated,
      truncationReason: styleCompilation.truncationReason,
      sections: styleCompilation.sections,
      reason: style.injected
        ? null
        : !style.locked
          ? 'style_unlocked'
          : 'style_empty',
      styleTags: style.styleTags,
      pacingParams: style.pacingParams,
    }),
  })
  const prompt = appendDialogueToolSurfaceDeclaration(
    '你是小说大纲创作助手。用户正在编辑大纲，请给出建议和修改意见。' + styleBlock,
    toolSurface,
    {
      activeEditTask: activeTask ?? outlineEditTask.value,
      executionPlan: activeOutlineExecutionPlan,
    },
  )
  addOutlineTraceEvent({
    type: 'dialogue-tool-surface-declaration',
    label: '应用注入工具面事实声明',
      detail: JSON.stringify(buildDialogueToolSurfaceDeclarationAudit({
        source: 'outline',
        toolSurface,
        activeEditTask: activeTask ?? outlineEditTask.value,
        executionPlan: activeOutlineExecutionPlan,
      })).slice(0, 20000),
  })
  return prompt
}

function readableToolLoopError(error: any, finishReason?: string) {
  const effectiveReason = error?.finishReason || finishReason
  if (effectiveReason === 'tool_loop_limit') {
    return 'AI 连续尝试工具调用但未能产出回答，已中止。请简化问题或更换模型。'
  }
  if (effectiveReason === 'tool_budget_exhausted') {
    return '长文档执行预算已按读取/写入分类结算。已执行的写入已保存；若写入容量尚未耗尽，请继续剩余批次，否则请从当前文档状态重新发起下一轮。'
  }
  if (effectiveReason === 'incomplete_write_coverage_checkpoint') {
    return '模型声称完成，但写入覆盖校验仍未确认全部批次完成。已执行内容已保存，请继续剩余批次。'
  }
  return error?.message || String(error)
}

type OutlineToolCallEvent = Parameters<
  NonNullable<NonNullable<CallAiParams['toolPolicy']>['onToolCall']>
>[0]

function toolRunSupervisorEventDetail(reason: string, idleMs: number, totalMs: number, longDocument = false) {
  const idleLimitMs = longDocument ? LONG_TOOL_RUN_IDLE_TIMEOUT_MS : DIRECT_TOOL_RUN_IDLE_TIMEOUT_MS
  return `reason=${reason} idleMs=${Math.round(idleMs)} totalMs=${Math.round(totalMs)} idleLimitMs=${idleLimitMs} longDocument=${longDocument} hardDeadlineMs=${longDocument ? null : DIRECT_TOOL_RUN_HARD_DEADLINE_MS}`
}

function getOutlineSessionReadLedger(): DocumentReadLedger {
  const currentProjectId = outlineProjectId()
  if (!outlineSessionReadLedger || outlineSessionProjectId !== currentProjectId) {
    outlineSessionReadLedger = createDocumentReadLedger({
      workspace: 'outline',
      targetId: 'outline',
    })
  }
  return outlineSessionReadLedger
}

function toolRunSupervisorReadableMessage(reason: string) {
  if (reason === 'stuck_timeout') return 'AI 请求无进展，已自动中止。请缩小问题范围、分段处理，或稍后重试。'
  if (reason === 'hard_deadline') return '本轮工具任务超过总时间上限，已自动中止。请把长文档任务拆分为多轮处理。'
  if (reason === 'repeated_tool_error') return '同一工具连续失败，已自动中止。请检查模型是否支持当前工具参数。'
  return 'AI 请求已自动中止。'
}

function createOutlineToolRunSupervisor(
  getController: () => AbortController | null,
  options: { longDocument?: boolean } = {},
) {
  let supervisorReason: string | null = null
  const supervisor = createToolRunSupervisor({
    controller: undefined,
    idleTimeoutMs: options.longDocument ? LONG_TOOL_RUN_IDLE_TIMEOUT_MS : DIRECT_TOOL_RUN_IDLE_TIMEOUT_MS,
    hardDeadlineMs: options.longDocument ? null : DIRECT_TOOL_RUN_HARD_DEADLINE_MS,
    onStuck: ({ reason, idleMs, totalMs, message }) => {
      supervisorReason = reason
      generationStatus.value = message
      addOutlineTraceEvent({
        type: 'state-stuck-aborted',
        level: 'warn',
        label: '停滞请求已自动中止',
        detail: toolRunSupervisorEventDetail(reason, idleMs, totalMs, options.longDocument)
      })
      const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
      diag?.log?.('warn', 'outline/tool-run-supervisor', message, {
        reason,
        idleMs: Math.round(idleMs),
        totalMs: Math.round(totalMs),
        idleLimitMs: DIRECT_TOOL_RUN_IDLE_TIMEOUT_MS,
        longIdleLimitMs: options.longDocument ? LONG_TOOL_RUN_IDLE_TIMEOUT_MS : null,
        hardDeadlineMs: options.longDocument ? null : DIRECT_TOOL_RUN_HARD_DEADLINE_MS,
      })
      getController()?.abort()
    },
  })
  return {
    ...supervisor,
    get reason() { return supervisorReason },
  }
}

function createOutlineRequestTarget() {
  const editor = editorRef.value
  const start = editor?.selectionStart ?? (projectStore.outlineText || '').length
  const end = editor?.selectionEnd ?? start
  return buildSnapshot({
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
    ...(outline ? [outline] : []),
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
  batchDetail?: {
    segmentId: string
    expectedChange: string
    invariantResult?: string
  }
  reason?: string
  reveal: { mode: 'stream' | 'instant'; firstChange: boolean }
  multiBatch?: boolean
  writeAuthorization?: DialogueWriteAuthorization
  authorizationTurnId?: string
}): Promise<
  | { ok: true; rollbackAvailable: boolean; documentVersion?: number; contentHash?: string }
  | { ok: false; code: string; message: string }
> {
  reportOutlineSourceContamination(input.original)
  const writeGoal = input.reason || `API 直写 ${input.commands.length} 条大纲命令`
  const beforeSnapshot = createOutlineRequestTarget()
  if (!beforeSnapshot) {
    return { ok: false, code: 'target_missing', message: '大纲编辑目标不可用' }
  }
  const recordBatchResult = async (
    run: () => Promise<
      | { ok: true; rollbackAvailable: boolean; documentVersion?: number; contentHash?: string }
      | { ok: false; code: string; message: string }
    >,
  ) => {
    const result = await outlineEditTaskSession.startOrContinueBatch({
      target: { workspace: 'outline', targetId: input.targetId },
      goal: writeGoal,
      batchId: input.batchId,
      batchDetail: input.batchDetail,
      snapshot: {
        contentVersion: beforeSnapshot.contentVersion,
        contentHash: hashOutlineContent(input.original),
      },
    }, async () => {
      const writeResult = await run()
      if (!writeResult.ok) {
        return { ok: false, code: writeResult.code, message: writeResult.message }
      }
      const currentSnapshot = createOutlineRequestTarget()
      return {
        ok: true,
        documentVersion: currentSnapshot?.contentVersion || 0,
        contentHash: hashOutlineContent(input.next),
      }
    }, { multiBatch: input.multiBatch === true })
    return result.ok
      ? {
        ok: true,
        rollbackAvailable: true,
        ...(result.documentVersion !== undefined ? { documentVersion: result.documentVersion } : {}),
        ...(result.contentHash !== undefined ? { contentHash: result.contentHash } : {}),
      } as const
      : {
        ok: false,
        code: result.code || 'write_failed',
        message: result.message || '编辑任务批次执行失败',
      } as const
  }
  if (input.targetId !== 'outline') {
    return { ok: false, code: 'write_target_mismatch', message: '大纲直写只允许写入大纲编辑器' }
  }
  if (!input.writeAuthorization?.lockOverride && projectStore.outlineLocked) {
    addOutlineTraceEvent({
      type: 'write-authorization-mismatch',
      level: 'error',
      label: '写入缺少大纲锁定覆盖授权',
      detail: JSON.stringify({
        targetId: input.targetId,
        reason: 'missing-lock-override',
      }),
    })
    recordOutlineEditorPresentation({
      phase: 'failed',
      workspace: 'outline',
      targetId: input.targetId,
      mode: input.reveal.mode,
      commands: input.commands.length,
      reason: 'locked',
    })
    return { ok: false, code: 'locked', message: '大纲已锁定，本次写入缺少 API 锁定覆盖授权' }
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
  return recordBatchResult(async () => {
  recordOutlineEditorPresentation({
    phase: 'start',
    workspace: 'outline',
    targetId: input.targetId,
    mode: input.reveal.mode,
    commands: input.commands.length,
    reason: input.reason,
  })
  const isWholeDocumentReplacement = input.commands.some(command => command.operation === 'replace_document')
  const authorizationTurnId = input.authorizationTurnId || outlineRunTurnId
  const authorization = authorizationTurnId
    ? outlineDeletionContract.getPending(authorizationTurnId)
    : null
  const deletionAuthorization = resolveOutlineDeletionAuthorization({
    commands: input.commands,
    authorizationTurnId,
    getPendingConfirmation: turnId => outlineDeletionContract.getPending(turnId),
    writeAuthorization: input.writeAuthorization,
    batchDetail: input.batchDetail,
    original: input.original,
    next: input.next,
  })
  const authorizationMatches = deletionAuthorization.channel === 'user-confirmation'
  const workflowDeletionAuthorized = deletionAuthorization.channel === 'workflow-contract'
  const integrity = validateOutlineIntegrity(input.original, input.next, {
    validateDocumentBody: isWholeDocumentReplacement,
    allowWholeDocumentRewrite: isWholeDocumentReplacement
      && input.writeAuthorization?.mode === 'single-pass',
    allowAuthorizedDeletion: authorizationMatches || workflowDeletionAuthorized,
      ...(deletionAuthorization.authorized
        ? { authorizedDeletedLength: deletionAuthorization.authorizedDeletedLength }
        : {}),
  })
  if (!integrity.ok) {
    const decision = resolveOutlineDeletionGate({ commands: input.commands, integrity })
    recordOutlineEditorPresentation({
      phase: 'failed',
      workspace: 'outline',
      targetId: input.targetId,
      mode: input.reveal.mode,
      commands: input.commands.length,
      reason: `integrity_failed:${integrity.summary}`,
    })
    const requestTurnId = outlineRunTurnId
    if (decision.action === 'request_confirmation' && requestTurnId) {
      pendingOutlineDeletionConfirmation.value = {
        turnId: requestTurnId,
        targetSignature: decision.targetSignature,
        reason: input.reason || 'API 请求删除大纲标题',
        requestText: currentOutlineUserRequest || '',
      }
      pendingOutlineDeletionReplay.value = { ...input }
      outlineDeletionContract.request({
        turnId: requestTurnId,
        commands: input.commands,
        original: input.original,
        next: input.next,
        reason: input.reason,
      })
      addOutlineTraceEvent({
        type: 'outline-deletion-confirmation-requested',
        level: 'warn',
        label: '大纲删除等待用户授权',
      detail: JSON.stringify({
        turnId: outlineRunTurnId,
        targetSignature: decision.targetSignature,
        commandHash: buildOutlineDeletionCommandHash(input.commands),
        originalHash: hashOutlineContent(input.original),
        expectedNextHash: hashOutlineContent(input.next),
        expectedDeletedLength: Math.max(0, input.original.length - input.next.length),
        commands: input.commands,
      }).slice(0, 20000),
        turnId: requestTurnId,
      })
    }
    return {
      ok: false,
      code: decision.code,
      message: decision.message,
    }
  }
  if (!commitOutlineChange(input.next, {
    authorized: input.writeAuthorization?.lockOverride === true,
  })) {
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
  const diffTarget = {
    ...createOutlineRequestTarget(),
    content: input.original,
    selectionStart: input.original.length,
    selectionEnd: input.original.length,
  }
  const batchDiffPlan = planEditorEditBatch({
    type: 'editor_edit_batch',
    version: 1,
    commands: input.commands,
    reason: input.reason,
  }, diffTarget, { content: input.original }, { batchId: input.batchId })
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
    diff: batchDiffPlan.ok && hashOutlineContent(input.next) === hashOutlineContent(batchDiffPlan.next) ? {
      original: batchDiffPlan.original,
      next: batchDiffPlan.next,
      hunks: buildEditHunks(batchDiffPlan),
    } : undefined,
  }
  recordOutlineBatchEvent(record, 'applied', `API 已直接写入 ${input.commands.length} 条大纲修改`)
  const refreshedSnapshot = createOutlineRequestTarget()
  if (refreshedSnapshot) {
    activeExecutionTaskStore.refresh(
      'outline',
      outlineProjectId(),
      refreshedSnapshot.contentVersion,
      hashOutlineContent(input.next),
    )
  }
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
  if (authorizationMatches && outlineDeletionContract.consume(authorization!.turnId, {
    commands: input.commands,
    original: input.original,
    next: input.next,
  })) {
    addOutlineTraceEvent({
      type: 'outline-deletion-confirmation-consumed',
      level: 'info',
      label: '用户授权的大纲删除已执行',
      detail: JSON.stringify({
        turnId: authorization!.turnId,
        targetSignature: authorization!.targetSignature,
        commandHash: authorization!.commandHash,
        expectedDeletedLength: authorization!.expectedDeletedLength,
        execution: 'authorized-replay',
        commandCount: input.commands.length,
        originalChars: input.original.length,
        nextChars: input.next.length,
        removedChars: Math.max(0, input.original.length - input.next.length),
      }),
      payload: {
        execution: 'authorized-replay',
        commandCount: input.commands.length,
        removedChars: Math.max(0, input.original.length - input.next.length),
      },
      turnId: authorization!.turnId,
    })
    pendingOutlineDeletionReplay.value = null
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
  })
}

let currentOutlineUserRequest = ''
let activeOutlineExecutionPlan: LongDocumentExecutionPlan | null = null

function createOutlineActiveTask(input: {
  requestText: string
  plan: LongDocumentExecutionPlan
  snapshot: ReturnType<typeof createOutlineRequestTarget>
}): ActiveExecutionTask | null {
  if (input.plan.operation === 'discussion' || input.plan.mode === 'final-draft') return null
  const now = Date.now()
  return activeExecutionTaskStore.create({
    taskId: `outline-${input.plan.planId}`,
    workspace: 'outline',
    projectId: outlineProjectId(),
    originalRequest: input.requestText,
    operation: input.plan.operation,
    plan: input.plan,
    authorizedExcerpts: [],
    documentVersion: input.snapshot.contentVersion,
    contentHash: hashOutlineContent(input.snapshot.content),
    createdAt: now,
    updatedAt: now,
    status: 'active',
  })
}

function describeLocalTransformResult(outcome: 'completed' | 'no_change', changedLineCount: number, durationMs: number) {
  return outcome === 'completed'
    ? `已本地完成整理：${changedLineCount} 行发生变化，耗时 ${durationMs}ms。未发起模型请求。`
    : `已检查当前大纲：没有需要本地整理的变化，耗时 ${durationMs}ms。未发起模型请求。`
}

function recordOutlineLocalTransform(input: {
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
    reason: input.result.reason || null,
  }
  addOutlineTraceEvent({
    type: 'local-transform-executed',
    level: 'info',
    label: '确定性整理已本地执行',
    detail: JSON.stringify(payload),
    payload,
  })
  ;(typeof window !== 'undefined' ? (window as any).DiagLogger : null)?.log?.(
    'info',
    'outline/local-transform-executed',
    '确定性整理已本地执行',
    payload,
  )
}

function recordOutlineStyleProfileExemption(reason: 'local_transform' | 'extraction_task') {
  const style = outlineStyleProfileEffective.value
  addOutlineTraceEvent({
    type: 'style-profile',
    label: reason === 'local_transform' ? '本地变换不注入风格' : '自动拆解为抽取任务不注入风格',
    detail: JSON.stringify({
      locked: style.locked,
      injected: false,
      reason,
      styleTags: style.styleTags,
      pacingParams: style.pacingParams,
    }),
  })
}

function addOutlineStyleAnalysisEvent(event: {
  type: 'style-benchmark-import' | 'style-analysis'
  label: string
  level?: 'info' | 'warn' | 'error'
  detail: Record<string, unknown>
}) {
  if (!outlineStyleAnalysisRunId) return
  runTraceStore.addEvent(outlineStyleAnalysisRunId, {
    type: event.type,
    level: event.level || 'info',
    label: event.label,
    detail: JSON.stringify(event.detail),
    payload: event.detail,
  })
}

function publishOutlineStyleAnalysisResult(payload: StyleAnalysisResultPayload) {
  window.dispatchEvent(new CustomEvent('style-analysis-result', { detail: payload }))
}

async function handleStyleAnalysisRequest(event: Event) {
  const payload = (event as CustomEvent).detail as StyleAnalysisRequestPayload | undefined
  if (!payload?.sourceId || payload.host !== 'outline') return
  const outlineText = projectStore.outlineText || projectStore.outlineLockedText
  if (!outlineText?.trim()) {
    publishOutlineStyleAnalysisResult({
      sourceId: payload.sourceId,
      host: 'outline',
      report: {
        ok: false,
        errors: ['当前项目没有可分析的大纲文本'],
        insufficientEvidenceFields: [],
        ignoredFields: [],
        draft: null,
      },
    })
    return
  }
  const provider = providerStore.activeGenerateProvider
  if (!provider?.id || !provider.apiKey) {
    publishOutlineStyleAnalysisResult({
      sourceId: payload.sourceId,
      host: 'outline',
      report: {
        ok: false,
        errors: ['未配置可用的生成供应商'],
        insufficientEvidenceFields: [],
        ignoredFields: [],
        draft: null,
      },
    })
    return
  }
  const model = provider.selectedModel || provider.models?.[0] || ''
  const runId = runTraceStore.startRun({
    source: 'outline',
    stepName: '创作风格 AI 分析',
    mode: 'style-analysis',
    sessionKind: 'task',
    projectId: projectStore.currentProjectId || undefined,
    projectName: projectStore.projectName,
    providerId: provider.id,
    providerName: provider.name,
    model,
    target: {
      type: 'outline',
      id: 'outline',
      name: projectStore.projectName || '未命名项目',
      activeTab: '大纲编辑器',
      locked: projectStore.outlineLocked,
    },
    context: { turns: 0 },
  })
  outlineStyleAnalysisRunId = runId
  const turnId = runTraceStore.startTurn(runId, {
    userRequest: '分析大纲风格',
    mode: 'style-analysis',
  })
  runTraceStore.addEvent(runId, {
    type: 'style-analysis',
    level: 'info',
    label: '大纲风格分析开始',
    detail: JSON.stringify({ sourceId: payload.sourceId, outlineChars: outlineText.length, model }),
    payload: { sourceId: payload.sourceId, outlineChars: outlineText.length, model },
    turnId,
  })
  const finishAnalysis = (status: RunTraceStatus, report: StyleAnalysisReport | null, reason?: string) => {
    if (turnId) runTraceStore.finishTurn(runId, turnId, status, undefined, reason)
    runTraceStore.finishRun(runId, status, undefined, reason)
    outlineStyleAnalysisRunId = null
    if (report) {
      publishOutlineStyleAnalysisResult({ sourceId: payload.sourceId, host: 'outline', report })
    }
  }
  const messagesToCall = [
    { role: 'system', content: STYLE_ANALYSIS_SYSTEM_PROMPT },
    { role: 'user', content: buildStyleAnalysisUserPrompt(outlineText) },
  ]
  const apiCallId = runTraceStore.startApiCall(runId, {
    turnId,
    step: 0,
    skillName: '创作风格 AI 分析',
    providerId: provider.id,
    providerName: provider.name,
    model,
    temperature: 0.2,
    intent: 'analyze',
    requestMessages: messagesToCall,
    actualToolSurface: [],
  })
  try {
    const aiService = await getAiService()
    const response = await aiService.callAi({
      purpose: 'generate',
      messages: messagesToCall,
      model,
      temperature: 0.2,
      stream: false,
      retry: true,
      onPhysicalCall: (event) => {
        if (!apiCallId) return
        runTraceStore.appendPhysicalCall(runId, apiCallId, {
          physicalCallId: event.physicalCallId,
          phase: event.phase,
          status: event.status,
          requestMessages: (event.requestMessages || []).map(m => ({ role: m.role, content: String(m.content || '') })),
          responseText: event.responseText || '',
          streamText: event.streamText || '',
          reasoningText: event.reasoningText || '',
          finishReason: event.finishReason,
          usage: event.usage,
          durationMs: event.durationMs,
          error: event.error,
          toolsEnabled: event.toolsEnabled,
          toolsDowngraded: event.toolsDowngraded,
          downgradeReason: event.downgradeReason,
          maxTokens: event.maxTokens,
          providerContextWindowTokens: event.contextBudget?.providerContextWindowTokens,
          estimatedInputTokens: event.contextBudget?.estimatedInputTokens,
          firstTokenMs: event.firstTokenMs,
          outputMs: event.outputMs,
        })
      },
      onProviderQueue: event => recordOutlineProviderQueue(apiCallId, event),
      meta: { source: 'OutlineWorkspace.style-analysis' },
    })
    if (apiCallId) {
      runTraceStore.finishApiCall(runId, apiCallId, {
        status: response.text ? 'success' : 'failed',
        responseText: response.text || '',
        reasoningText: response.reasoning || '',
        finishReason: response.finishReason,
        usage: response.usage,
        durationMs: response.durationMs,
        error: response.text ? undefined : '模型没有返回风格分析结果',
      })
    }
    const responseText = response.text || ''
    const report = parseStyleAnalysis(responseText)
    addOutlineStyleAnalysisEvent({
      type: 'style-analysis',
      label: report.ok ? '大纲风格结构化分析完成' : '大纲风格结构化分析未通过校验',
      level: report.ok ? 'info' : 'warn',
      detail: {
        sourceId: payload.sourceId,
        ok: report.ok,
        errors: report.errors,
        insufficientEvidenceFields: report.insufficientEvidenceFields,
        ignoredFields: report.ignoredFields,
        responsePreview: responseText.slice(0, 400),
      },
    })
    if (!report.ok || !report.draft) {
      finishAnalysis('degraded', report, '结构化分析结果未通过校验')
      return
    }
    finishAnalysis('success', report)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (apiCallId) {
      runTraceStore.finishApiCall(runId, apiCallId, {
        status: 'failed',
        error: message,
      })
    }
    addOutlineStyleAnalysisEvent({
      type: 'style-analysis',
      level: 'error',
      label: '大纲风格分析请求失败',
      detail: { sourceId: payload.sourceId, error: message },
    })
    finishAnalysis('failed', {
      ok: false,
      errors: ['AI 请求失败：' + message],
      insufficientEvidenceFields: [],
      ignoredFields: [],
      draft: null,
    }, 'AI 请求失败')
  }
}

function recordOutlineFinalDraftStyleConstraints(task: FinalDraftTask | undefined, action: string) {
  if (!task) return
  addOutlineTraceEvent({
    type: 'style-profile',
    label: '终稿风格约束使用任务快照',
    detail: JSON.stringify({
      constraintsSource: 'task_snapshot',
      action,
      styleProfileVersion: task.styleProfileVersion || 1,
      hasStyleConstraint: task.constraints.some(constraint => constraint.startsWith('创作风格约束：')),
      constraintsCount: task.constraints.length,
      constraintsHash: task.constraints.length
        ? `${[...task.constraints.join('')].reduce((hash, char) => {
          const next = (hash * 31 + char.charCodeAt(0)) >>> 0
          return next
        }, 7)}`
        : null,
    }),
  })
}

async function runOutlineLocalTransformIfReady(input: {
  plan: LongDocumentExecutionPlan
  snapshot: ReturnType<typeof createOutlineRequestTarget>
  intent: PlainDialogueIntent | ChainIntent
  mode: 'direct' | string
}): Promise<boolean> {
  if (input.plan.mode !== 'local-transform' || !input.plan.localTransformOperations) return false
  recordOutlineStyleProfileExemption('local_transform')
  const traceIntent: PlainDialogueIntent = input.intent === 'auto' ? 'discuss' : input.intent
  const result = transformDocument({
    content: input.snapshot.content,
    operations: input.plan.localTransformOperations,
  })
  if (result.outcome !== 'completed' && result.outcome !== 'no_change') return false
  startOutlineRun(input.mode, currentOutlineUserRequest, [], {
    intent: traceIntent,
    longDocument: true,
    toolSurface: [],
    actualToolSurface: [],
  })
  const beforeHash = hashOutlineContent(input.snapshot.content)
  const afterHash = hashOutlineContent(result.content)
  recordOutlineLocalTransform({
    plan: input.plan,
    result,
    sourceChars: input.snapshot.content.length,
    beforeHash,
    afterHash,
  })
  const content = describeLocalTransformResult(result.outcome, result.changedLineCount, result.durationMs)
  if (result.outcome === 'no_change') {
    activeExecutionTaskStore.complete(
      'outline',
      outlineProjectId(),
      input.snapshot.contentVersion,
      hashOutlineContent(input.snapshot.content),
    )
  }
  if (result.outcome === 'completed') {
    if (!commitOutlineChange(result.content)) {
      projectStore.appendOutlineChat({
        role: 'assistant',
        content: '本地整理未能写入：大纲当前被锁定，请解锁后重试。',
      })
      finishOutlineRun('failed', '大纲锁定或内容未变化', undefined, 'local_transform_write_failed')
      await scrollToBottom()
      return true
    }
    const nextSnapshot = createOutlineRequestTarget()
    activeExecutionTaskStore.complete(
      'outline',
      outlineProjectId(),
      nextSnapshot?.contentVersion || 0,
      hashOutlineContent(nextSnapshot?.content || result.content),
    )
    const firstChange = firstOutlineDifference(input.snapshot.content, result.content)
    window.dispatchEvent(new CustomEvent('diff-locate', {
      detail: {
        workspace: 'outline',
        targetId: 'outline',
        range: {
          start: firstChange,
          end: Math.max(firstChange + 1, firstChange + (result.content.length - input.snapshot.content.length)),
        },
      },
    }))
  }
  projectStore.appendOutlineChat({ role: 'assistant', content })
  finishOutlineRun('success', undefined, content, 'local_transform_complete')
  await scrollToBottom()
  return true
}

function buildOutlineExecutionPlanForRequest(options: {
  requestText: string
  content: string
  provider: NonNullable<typeof providerStore.activeGenerateProvider>
  intent?: PlainDialogueIntent
  activeTask?: ActiveExecutionTaskSnapshot
  activePlanConfirmation?: boolean
}): { plan: LongDocumentExecutionPlan; providerWindow: number | null } {
  const model = options.provider.selectedModel || options.provider.models?.[0] || 'gpt-4o'
  const providerWindow = resolveEffectiveModelContextWindow({
    model,
    providerContextWindowTokens: options.provider.contextWindowTokens,
  })
  const maxOutputTokens = Number(options.provider.maxTokens) > 0 ? Number(options.provider.maxTokens) : null
  return {
    providerWindow: typeof providerWindow === 'number' ? providerWindow : null,
    plan: buildLongDocumentExecutionPlan({
      requestText: options.requestText,
      content: options.content,
      contextWindowTokens: typeof providerWindow === 'number' ? providerWindow : null,
      maxOutputTokens,
      intent: options.intent,
      activeTask: options.activeTask,
      activePlanConfirmation: options.activePlanConfirmation,
    }),
  }
}


function buildOutlineSkillGuidance(): string {
  return selectedWorkspaceSkills.value
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
const replaceQuery = ref('')
const findIndex = ref(-1)
const findCaseSensitive = ref(true)
const findWholeWord = ref(false)
const findUseRegex = ref(false)
const findRef = ref<HTMLInputElement | null>(null)
const isGenerating = ref(false)
const outlineInputUnlockedByAgent = ref(false)
const outlineSendStarting = ref(false)
const outlineInputBlocked = computed(() =>
  (isGenerating.value || outlineSendStarting.value) && !outlineInputUnlockedByAgent.value
)
// The send-starting flag only suppresses duplicate UI submits. askAi is part
// of that same send flow, so execution gating must use the generation state.
const outlineExecutionLocked = computed(() =>
  isGenerating.value && !outlineInputUnlockedByAgent.value
)
const generationStatus = ref('')
const streamingContent = ref('')
// Test-only hook for Electron CDP verification of the live API status surface.
;(window as any).__shenyiOutlineStatusTestHook = {
  set(active: boolean, message: string) {
    isGenerating.value = active
    generationStatus.value = message
  },
}
const liveApiStatusLines = useLiveApiStatus(computed<LiveApiStatusInput>(() => ({
  active: isGenerating.value,
  message: generationStatus.value,
  latestCall: (() => {
    const runId = runTraceStore.getRunId('outline')
    const call = runId ? runTraceStore.getRun(runId)?.apiCalls.at(-1) : undefined
    if (!call) return null
    return {
      status: call.status,
      streamLength: call.streamTotalChars ?? call.streamText.length,
      lastStreamActivityAt: call.lastStreamActivityAt,
      lastExecutionActivityAt: call.lastExecutionActivityAt,
      lastToolArgumentProgressAt: call.lastToolArgumentProgressAt,
      lastToolArgumentProgress: call.lastToolArgumentProgress,
      retrying: Boolean(call.retryStrategy),
      executionSettlement: call.executionSettlement,
    }
  })()
})))
function diagnosticCountFromSummary(summary: string): number {
  const match = /(?:批次\s*\d+\s*条命令中\s*(\d+)\s*条失败|(\d+)\s*条命令需要修正)/.exec(summary)
  if (!match) return 0
  return Number(match[1] || match[2] || 0)
}
const { content: streamingRenderedContent, flush: flushStreamingRender } = useThrottledMarkdown(streamingContent)
let generationController: AbortController | null = null
let activeOutlineRunPromise: Promise<unknown> | null = null
function beginActiveOutlineRunTracking(): () => void {
  let resolveRun!: () => void
  activeOutlineRunPromise = new Promise<void>(resolve => {
    resolveRun = resolve
  })
  return () => {
    resolveRun()
    activeOutlineRunPromise = null
  }
}
function outlineFinalDraftStalled(task: FinalDraftTask | FinalDraftTaskView) {
  return task.status === 'generating' && task.lastTelemetry?.throughputStatus === 'stalled'
}
const outlineStalledRetryProviders = computed(() =>
  providerStore.providers
    .filter(provider => provider.apiKey)
    .map(provider => ({
      id: provider.id,
      name: provider.name,
      model: provider.selectedModel || provider.models?.[0] || '',
    }))
)
let cancelController: AbortController | null = null
let lastEditorHistoryAt = 0
let outlineRunTraceId: string | null = null
let outlineStreamLength = 0
let lastOutlineToolAudit: unknown
const workspaceAgentId = ref('')
const selectedSkillId = ref('')
const workspaceSkillIds = ref<string[]>([])
const workspaceSkillMode = ref<'chain' | 'compose'>('compose')
const workspaceSkillAgents = ref<Record<string, string>>({})

const DEFAULT_SKILL_HISTORY_TURNS = 10

const findOptions = computed<SearchOptions>(() => ({
  caseSensitive: findCaseSensitive.value,
  wholeWord: findWholeWord.value,
  useRegex: findUseRegex.value,
}))
const findMatches = computed(() => findOpen.value
  ? computeEditorMatches(projectStore.outlineText || '', findQuery.value, findOptions.value)
  : { matches: [], error: null as string | null })
const findError = computed(() => findMatches.value.error)

const findResult = computed(() => {
  if (!findQuery.value) return ''
  if (findError.value) return '表达式无效'
  if (findMatches.value.matches.length === 0) return '未找到'
  return findIndex.value >= 0
    ? `${findIndex.value + 1}/${findMatches.value.matches.length}`
    : `0/${findMatches.value.matches.length}`
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
    }))
}

function getOutlineContextMessages(currentRequest: string): ContextMessage[] {
  const source = messages.value
    .filter(message => (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string' && message.content.trim())
    .filter(message => !message.routingFallback && !message.budgetExhausted && !message.outlineDeletionConfirmation)
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
      return {
        tools: [],
        actualToolSurface: [] as Array<{ name: string; policy: 'read' | 'write' }>,
        toolConflicts: [],
      }
    }
    const outlineSkillExecutionPlan = activeOutlineExecutionPlan
      || buildOutlineExecutionPlanForRequest({
        requestText: currentOutlineUserRequest,
        content: requestTarget.content,
        provider: providerStore.activeGenerateProvider!,
        intent: intent === 'auto' ? 'discuss' : intent,
      }).plan
    const outlineSkillExecutionPlanFallback = !activeOutlineExecutionPlan
    const outlineSkillWriteAuthorization = buildWorkflowWriteAuthorizationFromPlan({
      workspace: 'outline',
      intent,
      plan: outlineSkillExecutionPlan,
      locked: projectStore.outlineLocked,
    })
    const surface = buildDialogueToolSurface({
      workspace: 'outline',
      intent,
      readLedger: getOutlineSessionReadLedger(),
      maxReadChars: () => getReadCapChars(
        providerStore.activeGenerateProvider,
        providerStore.activeGenerateProvider?.selectedModel || providerStore.activeGenerateProvider?.models?.[0] || '',
      ),
      getSnapshot: () => createOutlineRequestTarget(),
      getAllSnapshots: buildOutlineWorkspaceSnapshots,
      mode: 'direct',
      executionPlan: outlineSkillExecutionPlan,
      writeAuthorization: outlineSkillWriteAuthorization,
      applyWrite: async input => applyOutlineDirectWrite(input),
      conversationMarkers: buildOutlineConversationMarkers(),
      userRequestText: currentOutlineUserRequest,
      onContaminationDecision: (decision: EditorWriteContaminationDecision) => addOutlineTraceEvent({
        type: decision.type,
        level: decision.type === 'write-contamination-rejected' ? 'warn' : 'info',
        label: decision.type === 'write-contamination-rejected'
          ? '写入内容包含历史对话表述，已整批拒绝'
          : '写入内容由当前用户请求显式提供，允许通过',
        detail: JSON.stringify(decision.payload),
        payload: decision.payload,
        turnId: outlineRunTurnId,
      }),
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
        getSnapshot: () => createOutlineRequestTarget(),
        readLedger: getOutlineSessionReadLedger()
      }),
      readableTargets: ['outline', 'outline-settings'],
      writableTarget: 'outline',
      activeEditTask: outlineEditTask.value,
      onResumeEditTask: taskId => outlineEditTaskSession.resumeEditTask(taskId),
      onCancelEditTask: taskId => outlineEditTaskSession.onCancelEditTask(taskId),
    })
    if (outlineSkillExecutionPlanFallback) {
      addOutlineTraceEvent({
        type: 'plan-origin',
        level: 'warn',
        label: '大纲工具面使用降级计划',
        detail: JSON.stringify({
          planId: outlineSkillExecutionPlan.planId,
          source: 'adapter-fallback',
        }),
        payload: {
          planId: outlineSkillExecutionPlan.planId,
          source: 'adapter-fallback',
        },
      })
    }
    return surface
  }
  return {
    workspace: 'outline',
    source: 'OutlineWorkspace.skill',
    projectId: outlineProjectId(),
    breakpointOwnerKey: `outline:${outlineProjectId()}`,
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
      styleTags: outlineStyleProfileEffective.value.injected ? outlineStyleProfileEffective.value.styleTags : '',
      pacingParams: outlineStyleProfileEffective.value.injected ? outlineStyleProfileEffective.value.pacingParams : '',
      ...buildStyleTemplateVariables(outlineStyleProfileEffective.value),
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
    getEditTaskContext: () => ({
      activeEditTask: outlineEditTask.value,
      onResumeEditTask: taskId => outlineEditTaskSession.resumeEditTask(taskId),
      onCancelEditTask: taskId => outlineEditTaskSession.onCancelEditTask(taskId),
    }),
    getExecutionContext: () => ({
      executionPlan: activeOutlineExecutionPlan ?? undefined,
      writeAuthorization: activeOutlineExecutionPlan
        ? buildWorkflowWriteAuthorizationFromPlan({
          workspace: 'outline',
          intent: currentRoutingIntent.value,
          plan: activeOutlineExecutionPlan,
          locked: projectStore.outlineLocked,
        })
        : null,
    }),
    buildTools: (request) => {
      const surface = buildOutlineToolSurface(request.intent)
      for (const conflict of surface.toolConflicts || []) {
        addOutlineTraceEvent({
          type: 'tool-conflict',
          level: 'warn',
          label: conflict.label,
          detail: conflict.detail,
        })
        ;(typeof window !== 'undefined' ? (window as any).DiagLogger : null)?.log?.(
          'warn',
          'outline/tool-conflict',
          conflict.label,
          { detail: conflict.detail, payload: conflict.payload },
        )
      }
      return {
        tools: surface.tools,
        toolPolicy: surface.tools.length ? {
          scenario: 'direct-tool-intensive',
          intent: request.intent,
          onPermissionDenied: event => {
            addOutlineTraceEvent({
              type: 'tool-permission-denied',
              level: 'error',
              label: '工具写入权限拒绝',
              detail: `${event.toolName}：${event.reason}`
            })
          },
          onToolStart: (event) => {
            if (!isAgentRuntimeToolName(event.toolName)) {
              window.dispatchEvent(new CustomEvent('tool-activity', { detail: { type: 'tool_start', toolName: event.toolName, targetId: 'outline', policy: event.policy } }))
            }
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
            if (isAgentRuntimeToolName(event.toolName)) return
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
          onCompatibilityMode: () => {
            compatibilityNotice.value = '当前供应商未启用原生工具调用，已使用兼容模式'
          }
        } : undefined
      }
    },
    loadBreakpoint: ownerKey => pipelineStore.refreshBreakpoint(ownerKey),
    saveBreakpoint: breakpoint => pipelineStore.saveBreakpoint(breakpoint),
    clearBreakpoint: ownerKey => pipelineStore.clearBreakpoint(ownerKey),
    classifyIntentWithLlm: createIntentLlmFallback({
      activeVerifyProvider: providerStore.activeVerifyProvider,
      activeGenerateProvider: providerStore.activeGenerateProvider,
    })
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
  window.addEventListener('style-analysis-request', handleStyleAnalysisRequest)
})

onUnmounted(() => {
  outlineViewport?.dispose()
  outlineViewport = null
  window.removeEventListener('diff-locate', handleDiffLocate)
  window.removeEventListener('style-analysis-request', handleStyleAnalysisRequest)
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
    scheduleMultiCursorRepaint()
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
    if (!editorStore.canUndoTab('outline')) return
    const previous = editorStore.undoTab('outline')
    if (previous === null) return
    projectStore.outlineText = previous
    projectStore.setOutline(previous)
    recordUndoAction('undo', 'manual', previous)
    return
  }
  if (command === 'redo') {
    if (!editorStore.canRedoTab('outline')) return
    const next = editorStore.redoTab('outline')
    if (next === null) return
    projectStore.outlineText = next
    projectStore.setOutline(next)
    recordUndoAction('redo', 'manual', next)
    return
  }
  ta.focus()
  document.execCommand(command)
}

function recordUndoAction(
  action: 'undo' | 'redo',
  origin: 'manual' | 'api' | 'import',
  content: string,
) {
  const detail = {
    documentId: 'outline',
    action,
    origin,
    contentLength: content.length,
  }
  runTraceStore.addSourceEvent('outline', {
    type: 'editor-undo',
    level: 'info',
    label: `大纲编辑器${action === 'undo' ? '撤销' : '重做'}：${origin}`,
    detail: JSON.stringify(detail),
  })
  ;(typeof window !== 'undefined' ? (window as any).DiagLogger : null)?.log?.('info', 'editor-undo', `大纲编辑器${action === 'undo' ? '撤销' : '重做'}`, detail)
}

function commitOutlineChange(next: string, options: { authorized?: boolean } = {}) {
  const current = projectStore.outlineText || ''
  if (next === current || (projectStore.outlineLocked && !options.authorized)) return false
  editorStore.pushUndoTransactionForTab('outline', current, 'manual', '大纲编辑')
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
  replaceQuery.value = ''
  findIndex.value = -1
  editorRef.value?.focus()
}

function replaceCurrent() {
  const ta = editorRef.value
  const query = findQuery.value
  if (!ta || !query || projectStore.outlineLocked) return
  const search = computeEditorMatches(ta.value, query, findOptions.value)
  if (search.error) {
    saveFeedback.value = `[提示] ${search.error}`
    setTimeout(() => { saveFeedback.value = '' }, 2000)
    return
  }
  const result = applyOutlineReplacement({
    mode: 'current',
    locked: projectStore.outlineLocked,
    content: ta.value,
    query,
    replacement: replaceQuery.value,
    options: findOptions.value,
    selectionStart: ta.selectionStart,
    selectionEnd: ta.selectionEnd,
  })
  if (result.status === 'invalid-selection') {
    saveFeedback.value = '[提示] 请先定位到要替换的匹配'
    setTimeout(() => { saveFeedback.value = '' }, 2000)
    return
  }
  if (result.status === 'invalid-pattern') {
    saveFeedback.value = '[提示] 查找内容无效'
    setTimeout(() => { saveFeedback.value = '' }, 2000)
    return
  }
  if (result.status === 'no-match') {
    saveFeedback.value = '[提示] 未找到匹配'
    setTimeout(() => { saveFeedback.value = '' }, 2000)
    return
  }
  if (result.status !== 'replaced' || !result.next || !commitOutlineChange(result.next)) return
  recordOutlineReplace('current', ta.value, result.next, result.matchCount)
  const caret = result.caret
  void nextTick()
  ta.focus()
  ta.setSelectionRange(caret, caret)
  findIndex.value = -1
}

function replaceAll() {
  const ta = editorRef.value
  const query = findQuery.value
  if (!ta || !query || projectStore.outlineLocked) return
  const current = projectStore.outlineText || ''
  const search = computeEditorMatches(current, query, findOptions.value)
  if (search.error) {
    saveFeedback.value = `[提示] ${search.error}`
    setTimeout(() => { saveFeedback.value = '' }, 2000)
    return
  }
  const result = applyOutlineReplacement({
    mode: 'all',
    locked: projectStore.outlineLocked,
    content: current,
    query,
    replacement: replaceQuery.value,
    options: findOptions.value,
  })
  if (result.status === 'invalid-pattern') {
    saveFeedback.value = '[提示] 查找内容无效'
    setTimeout(() => { saveFeedback.value = '' }, 2000)
    return
  }
  if (result.status === 'no-match') {
    saveFeedback.value = '[提示] 未找到匹配'
    setTimeout(() => { saveFeedback.value = '' }, 2000)
    return
  }
  if (result.status === 'unchanged') {
    saveFeedback.value = '[提示] 替换结果与原文相同'
    setTimeout(() => { saveFeedback.value = '' }, 2000)
    return
  }
  if (result.status !== 'replaced' || !result.next || !commitOutlineChange(result.next)) return
  recordOutlineReplace('all', current, result.next, result.matchCount)
  saveFeedback.value = '[OK] 已替换全部匹配'
  setTimeout(() => { saveFeedback.value = '' }, 2000)
  void nextTick()
  ta.focus()
  ta.setSelectionRange(0, 0)
  findIndex.value = -1
}

function findNext() {
  const ta = editorRef.value
  const query = findQuery.value
  if (!ta || !query) return
  const search = computeEditorMatches(ta.value, query, findOptions.value)
  if (search.error) {
    saveFeedback.value = `[提示] ${search.error}`
    setTimeout(() => { saveFeedback.value = '' }, 2000)
    return
  }
  const matches = search.matches
  const from = ta.selectionEnd > ta.selectionStart ? ta.selectionEnd : ta.selectionStart
  const nextIndex = matches.findIndex(match => match.start >= from)
  const found = nextIndex >= 0 ? nextIndex : (matches.length > 0 ? 0 : -1)
  findIndex.value = found >= 0 ? found : -1
  if (found >= 0 && matches[found]) {
    const match = matches[found]
    ta.focus()
    ta.setSelectionRange(match.start, match.end)
  }
}

function findPrevious() {
  const ta = editorRef.value
  const query = findQuery.value
  if (!ta || !query) return
  const search = computeEditorMatches(ta.value, query, findOptions.value)
  if (search.error) {
    saveFeedback.value = `[提示] ${search.error}`
    setTimeout(() => { saveFeedback.value = '' }, 2000)
    return
  }
  const matches = search.matches
  const from = ta.selectionStart
  let found = -1
  for (let index = matches.length - 1; index >= 0; index--) {
    if (matches[index].start < from) {
      found = index
      break
    }
  }
  if (found < 0 && matches.length > 0) found = matches.length - 1
  findIndex.value = found
  if (found >= 0 && matches[found]) {
    const match = matches[found]
    ta.focus()
    ta.setSelectionRange(match.start, match.end)
  }
}

function recordOutlineReplace(mode: 'current' | 'all', before: string, after: string, matchCount: number) {
  const detail = {
    documentId: 'outline',
    mode,
    options: findOptions.value,
    matchCount,
    beforeLength: before.length,
    afterLength: after.length,
  }
  runTraceStore.addSourceEvent('outline', {
    type: 'editor-replace',
    level: 'info',
    label: `大纲编辑器替换${mode === 'current' ? '当前匹配' : '全部匹配'}：${matchCount} 处`,
    detail: JSON.stringify(detail),
  })
  ;(typeof window !== 'undefined' ? (window as any).DiagLogger : null)?.log?.(
    'info',
    'editor-replace',
    `大纲编辑器替换${mode === 'current' ? '当前匹配' : '全部匹配'}`,
    detail,
  )
}

function recordMultiCursorEvent(
  type: 'find-all' | 'multi-cursor-edit' | 'multi-cursor-conflict' | 'multi-cursor-downgrade',
  level: 'info' | 'warn',
  detail: Record<string, unknown>,
) {
  const labels = {
    'find-all': '大纲查找全部选中',
    'multi-cursor-edit': '大纲多光标编辑',
    'multi-cursor-conflict': '大纲多光标版本冲突',
    'multi-cursor-downgrade': '大纲多光标降级',
  } as const
  const payload = { documentId: 'outline', ...detail }
  runTraceStore.addSourceEvent('outline', {
    type,
    level,
    label: labels[type],
    detail: JSON.stringify(payload),
  })
  ;(typeof window !== 'undefined' ? (window as any).DiagLogger : null)?.log?.(
    level,
    type,
    labels[type],
    payload,
  )
}

function renderMultiCursors() {
  const layer = outlineMultiCursorLayer.value
  if (!layer) return
  const selection = multiCursorSelection.value
  if (!selection || !outlineViewport || !editorRef.value) {
    layer.replaceChildren()
    return
  }
  const lineWindow = outlineViewport.getLineWindow()
  layer.replaceChildren(...selection.cursors.map((cursor, index) => {
    const offset = Math.min(cursor.anchor, cursor.focus)
    const item = document.createElement('div')
    item.className = index === (selection.primaryIndex ?? 0)
      ? 'ow-multi-cursor ow-multi-cursor-primary'
      : 'ow-multi-cursor'
    if (outlineViewport!.getLine(offset) >= lineWindow.startLine
      && outlineViewport!.getLine(offset) <= lineWindow.endLine) {
      const rect = outlineViewport!.measureOffset(offset)
      item.style.left = `${rect.left}px`
      item.style.top = `${rect.top}px`
      item.style.height = `${rect.height}px`
    } else {
      item.style.display = 'none'
    }
    return item
  }))
  const primary = selection.cursors[selection.primaryIndex ?? 0]
  if (primary) {
    const primaryOffset = Math.min(primary.anchor, primary.focus)
    editorRef.value.setSelectionRange(primaryOffset, primaryOffset)
  }
}

function scheduleMultiCursorRepaint() {
  requestAnimationFrame(renderMultiCursors)
}

function clearMultiCursorSelection(reason: string, level: 'info' | 'warn' = 'info') {
  if (!multiCursorSelection.value) return
  multiCursorSelection.value = null
  multiCursorBaseContent.value = ''
  const type = level === 'warn' ? 'multi-cursor-conflict' : 'multi-cursor-downgrade'
  recordMultiCursorEvent(type, level, { reason, cursorCount: 0 })
  scheduleMultiCursorRepaint()
}

function selectAllMatches() {
  const content = projectStore.outlineText || ''
  if (projectStore.outlineLocked || findError.value || findMatches.value.matches.length === 0) return
  multiCursorSelection.value = buildSelectionSetFromMatches({
    matches: findMatches.value.matches,
    contentLength: content.length,
    primaryIndex: 0,
  })
  multiCursorBaseContent.value = content
  recordMultiCursorEvent('find-all', 'info', {
    cursorCount: multiCursorSelection.value.cursors.length,
    matchCount: findMatches.value.matches.length,
  })
  editorRef.value?.focus()
  scheduleMultiCursorRepaint()
}

function runMultiCursorCommand(command: MultiCursorCommand) {
  const selection = multiCursorSelection.value
  const content = projectStore.outlineText || ''
  if (!selection || !editorRef.value) return false
  if (multiCursorComposing.value || projectStore.outlineLocked) return false
  if (multiCursorBaseContent.value !== content) {
    clearMultiCursorSelection('document-version-changed', 'warn')
    return false
  }
  const plan = buildMultiCursorEditPlan({ content, selection, command })
  if (plan.status !== 'applied') {
    clearMultiCursorSelection('version-conflict', 'warn')
    return false
  }
  if (!commitOutlineChange(plan.next)) {
    clearMultiCursorSelection('commit-failed', 'warn')
    return false
  }
  multiCursorSelection.value = plan.selection
  multiCursorBaseContent.value = plan.next
  recordMultiCursorEvent('multi-cursor-edit', 'info', {
    command: command.type,
    cursorCount: plan.selection.cursors.length,
    changedCursors: plan.changedCursors,
    beforeLength: content.length,
    afterLength: plan.next.length,
  })
  scheduleMultiCursorRepaint()
  return true
}

function handleEditorKeydown(event: KeyboardEvent) {
  if (!multiCursorSelection.value || event.ctrlKey || event.metaKey || event.altKey) return
  if (event.key === 'Enter') {
    event.preventDefault()
    runMultiCursorCommand({ type: 'newline' })
    return
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    runMultiCursorCommand({ type: event.key === 'Delete' ? 'delete_forward' : 'delete_backward' })
    return
  }
  if (event.key.length === 1 && !multiCursorComposing.value) {
    event.preventDefault()
    runMultiCursorCommand({ type: 'insert', text: event.key })
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
      editorStore.pushUndoTransactionForTab('outline', projectStore.outlineText || '', 'import', '导入文档')
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
    void appConfirm.alert('大纲内容在批次应用后已有修改，请打开运行记录查看失败批次差异，或撤销后重试该批次')
    return
  }
  const undoContent = findEditorBatchUndoContent(editorStore.listUndoContentsForTab('outline'), record)
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
  if (!commitOutlineChange(undoContent.content)) {
    void appConfirm.alert('回滚批次失败，请手动处理大纲内容')
    return
  }
  projectStore.updateOutlineChatAt(messageIndex, {
    outlineBatchRecord: updateEditorBatchRecord(record, {
      status: 'rolled_back',
      rolledBackAt: Date.now(),
      undoAvailable: false
    }),
    outlineBatchDiff: undefined,
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
  const undoContent = findEditorBatchUndoContent(editorStore.listUndoContentsForTab('outline'), record)
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

function outlineBatchSourcePlan(
  record: EditorBatchRecord,
  batch: { type: 'editor_edit_batch'; version: 1; commands: EditorEditCommand[]; reason?: string },
  sourceContent: string,
) {
  const sourceTarget = createOutlineRequestTarget()
  return planEditorEditBatch(batch, {
    ...sourceTarget,
    content: sourceContent,
    selectionStart: sourceContent.length,
    selectionEnd: sourceContent.length,
  }, { content: sourceContent }, { batchId: record.batchId })
}

function rollbackOutlineBatchHunk(messageIndex: number, hunkIndex: number) {
  if (isGenerating.value) {
    void appConfirm.alert('正在生成中，请等待当前回复完成后再回滚这一条修改')
    return
  }
  const message = messages.value[messageIndex]
  const record = normalizeEditorBatchRecord(message?.outlineBatchRecord)
  const batch = message?.outlineBatch
  const currentContent = projectStore.outlineText || ''
  if (!record || !batch || batch.type !== 'editor_edit_batch') {
    void appConfirm.alert('批次记录不可用，无法回滚这一条修改')
    return
  }
  if (projectStore.outlineLocked) {
    void appConfirm.alert('大纲已锁定，请先解锁再回滚这一条修改')
    return
  }
  if (!canRollbackEditorBatch(record, currentContent)) {
    logEditorEdit({
      requestId: `outline-direct-write-hunk_${record.batchId}_${hunkIndex}`,
      batchId: record.batchId,
      workspace: 'outline',
      tabId: 'outline',
      operation: 'editor_write',
      result: 'rejected',
      targetLength: currentContent.length,
      failureReason: 'version_changed',
      durationMs: 0,
      detail: '单命令回滚前校验失败：大纲版本已变化'
    })
    void appConfirm.alert('大纲内容已变化，请使用整批回滚或重新读取当前文档')
    return
  }
  const undoContent = findEditorBatchUndoContent(editorStore.listUndoContentsForTab('outline'), record)
  if (!undoContent) {
    void appConfirm.alert('撤销历史不足，无法回滚这一条修改')
    return
  }
  const originalPlan = outlineBatchSourcePlan(record, batch, undoContent.content)
  if (!originalPlan.ok) {
    void appConfirm.alert('批次无法重放，已拒绝单条回滚')
    return
  }
  if (originalPlan.next !== currentContent) {
    logEditorEdit({
      requestId: `outline-direct-write-hunk_${record.batchId}_${hunkIndex}`,
      batchId: record.batchId,
      workspace: 'outline',
      tabId: 'outline',
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
  const rejected = [hunkIndex]
  const replanned = applyAcceptedItems(originalPlan, originalPlan.items
    .map(item => item.index)
    .filter(index => index !== hunkIndex))
  if (!replanned.ok) {
    logEditorEdit({
      requestId: `outline-direct-write-hunk_${record.batchId}_${hunkIndex}`,
      batchId: record.batchId,
      workspace: 'outline',
      tabId: 'outline',
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
  if (!commitOutlineChange(replanned.next)) {
    void appConfirm.alert('回滚这一条修改失败，原文未修改')
    return
  }
  const rebased = rebaseHunksAfterReject(originalPlan, rejected)
  projectStore.updateOutlineChatAt(messageIndex, {
    outlineBatchRecord: updateEditorBatchRecord(record, {
      status: 'applied',
      appliedContentHash: hashOutlineContent(replanned.next),
      acceptedIndexes: originalPlan.items.map(item => item.index).filter(index => index !== hunkIndex),
      rejectedIndexes: rejected,
      undoAvailable: true,
    }),
    outlineBatchDiff: {
      original: replanned.original,
      next: replanned.next,
      hunks: rebased.hunks,
    },
  })
  addOutlineTraceEvent({
    type: 'editor-diff-hunk-rollback',
    label: '大纲单命令回滚',
    detail: JSON.stringify({
      batchId: record.batchId,
      rejectedIndex: hunkIndex,
      hunkCount: rebased.hunks.length,
      rebaseEvents: rebased.rebaseEvents,
      appliedChars: currentContent.length,
      nextChars: replanned.next.length,
    }),
  })
  recordOutlineBatchEvent(record, 'applied', `已回滚第 ${hunkIndex + 1} 条大纲修改并重放其余命令`)
  logEditorEdit({
    requestId: `outline-direct-write-hunk_${record.batchId}_${hunkIndex}`,
    batchId: record.batchId,
    workspace: 'outline',
    tabId: 'outline',
    operation: 'editor_write',
    result: 'applied',
    targetLength: currentContent.length,
    contentLength: replanned.next.length,
    durationMs: 0,
    detail: `已回滚大纲单条命令并重放其余命令；hunkCount=${rebased.hunks.length}; rebaseEvents=${rebased.rebaseEvents.length}`
  })
  const firstChange = firstOutlineDifference(currentContent, replanned.next)
  window.dispatchEvent(new CustomEvent('diff-locate', {
    detail: {
      workspace: 'outline',
      targetId: 'outline',
      range: { start: firstChange, end: Math.max(firstChange + 1, firstChange + (replanned.next.length - currentContent.length)) },
    },
  }))
  saveFeedback.value = '[OK] 已回滚单条大纲修改，可撤销恢复'
  setTimeout(() => { saveFeedback.value = '' }, 2500)
}

function revealOutlineBatchHunk(messageIndex: number, hunk: EditorDiffHunk) {
  if (isGenerating.value) return
  const message = messages.value[messageIndex]
  const record = normalizeEditorBatchRecord(message?.outlineBatchRecord)
  if (!record) return
  const currentContent = projectStore.outlineText || ''
  if (!canRollbackEditorBatch(record, currentContent)) {
    void appConfirm.alert('大纲内容已变化，请重新读取当前文档后再定位')
    return
  }
  // Rejected hunks have already been rebased out of the stored diff. Validate
  // the stored range instead of replaying the now-incomplete original batch.
  const storedHunks: EditorDiffHunk[] = message?.outlineBatchDiff?.hunks || []
  const hasStoredHunk = storedHunks.some(item => item.index === hunk.index)
  const boundedStart = Math.max(0, Math.min(hunk.range.start, currentContent.length))
  const boundedEnd = Math.max(boundedStart + 1, Math.min(hunk.range.end, currentContent.length))
  if (!hasStoredHunk || boundedEnd > currentContent.length || hunk.range.start < 0 || hunk.range.end < hunk.range.start) {
    void appConfirm.alert('大纲内容已变化，请重新读取当前文档后再定位')
    return
  }
  window.dispatchEvent(new CustomEvent('diff-locate', {
    detail: {
      workspace: 'outline',
      targetId: 'outline',
      range: { start: boundedStart, end: boundedEnd },
    },
  }))
  addOutlineTraceEvent({
    type: 'editor-diff-hunk-reveal',
    label: '定位大纲单条修改',
    detail: JSON.stringify({ batchId: record.batchId, hunkIndex: hunk.index }),
  })
  logEditorEdit({
    requestId: `outline-direct-write-hunk-reveal_${record.batchId}_${hunk.index}`,
    batchId: record.batchId,
    workspace: 'outline',
    tabId: 'outline',
    operation: 'editor_write',
    result: 'applied',
    targetLength: currentContent.length,
    durationMs: 0,
    detail: '用户在大纲气泡中定位单条修改'
  })
}

function pendingOutlineDirectWriteFields() {
  const directWrite = pendingOutlineDirectWrite.value
  return directWrite
    ? {
      outlineBatch: directWrite.batch,
      outlineBatchRecord: directWrite.record,
      ...(directWrite.diff ? { outlineBatchDiff: directWrite.diff } : {}),
    }
    : {}
}

async function approveOutlineDeletion(index: number) {
  const message = messages.value[index]
  const confirmation = message?.outlineDeletionConfirmation
  const replay = pendingOutlineDeletionReplay.value
  if (isGenerating.value || !confirmation || confirmation.status !== 'requested' || !replay) return
  const granted = outlineDeletionContract.grant(confirmation.turnId)
  if (!granted) return
  addOutlineTraceEvent({
    type: 'outline-deletion-confirmation-granted',
    level: 'warn',
    label: '用户授权大纲删除',
    detail: JSON.stringify({
      turnId: confirmation.turnId,
      targetSignature: confirmation.targetSignature,
    }),
    turnId: confirmation.turnId,
  })
  projectStore.updateOutlineChatAt(index, { outlineDeletionConfirmation: undefined })
  pendingOutlineDeletionConfirmation.value = null
  const replayResult = await applyOutlineDirectWrite({ ...replay, authorizationTurnId: confirmation.turnId })
  if (replayResult.ok) {
    projectStore.updateOutlineChatAt(index, pendingOutlineDirectWriteFields())
    pendingOutlineDeletionReplay.value = null
  } else {
    outlineDeletionContract.dismiss(confirmation.turnId)
    pendingOutlineDeletionReplay.value = null
    saveFeedback.value = `[提示] 授权删除执行失败：${replayResult.message}`
    setTimeout(() => { saveFeedback.value = '' }, 5000)
  }
}

function dismissOutlineDeletion(index: number) {
  const message = messages.value[index]
  const confirmation = message?.outlineDeletionConfirmation
  if (isGenerating.value || !confirmation) return
  const dismissed = outlineDeletionContract.dismiss(confirmation.turnId)
  if (!dismissed) return
  addOutlineTraceEvent({
    type: 'outline-deletion-confirmation-dismissed',
    level: 'warn',
    label: '用户拒绝大纲删除',
    detail: JSON.stringify({
      turnId: confirmation.turnId,
      targetSignature: confirmation.targetSignature,
    }),
    turnId: confirmation.turnId,
  })
  pendingOutlineDeletionConfirmation.value = null
  pendingOutlineDeletionReplay.value = null
  projectStore.updateOutlineChatAt(index, { outlineDeletionConfirmation: undefined })
}

function activeOutlineDeletionConfirmation() {
  const pending = pendingOutlineDeletionConfirmation.value
  if (!pending) return null
  const contractConfirmation = outlineDeletionContract.getPending(pending.turnId)
  if (contractConfirmation?.status !== 'requested') return null
  return { pending, contractConfirmation }
}

async function consumeOutlineDeletionAffirmativeTurn(text: string) {
  const active = activeOutlineDeletionConfirmation()
  const replay = pendingOutlineDeletionReplay.value
  if (!active || !replay) return false
  const { pending, contractConfirmation } = active
  const granted = outlineDeletionContract.grant(pending.turnId)
  if (!granted) return false
  addOutlineTraceEvent({
    type: 'outline-deletion-confirmation-granted',
    level: 'warn',
    label: '用户授权大纲删除',
    detail: JSON.stringify({
      turnId: pending.turnId,
      targetSignature: contractConfirmation.targetSignature,
      source: 'cross_turn_input',
      userRequest: text,
    }),
    turnId: pending.turnId,
  })
  pendingOutlineDeletionConfirmation.value = null
  const replayResult = await applyOutlineDirectWrite({ ...replay, authorizationTurnId: pending.turnId })
  if (replayResult.ok) {
    projectStore.appendOutlineChat({
      role: 'assistant',
      content: '[OK] 已按你的确认执行删除并写入大纲。',
      ...pendingOutlineDirectWriteFields(),
    })
    pendingOutlineDeletionReplay.value = null
    await scrollToBottom()
    return true
  }
  outlineDeletionContract.dismiss(pending.turnId)
  pendingOutlineDeletionReplay.value = null
  projectStore.appendOutlineChat({
    role: 'assistant',
    content: `生成失败：授权删除执行失败：${replayResult.message}`,
  })
  await scrollToBottom()
  return true
}

async function supersedeOutlineDeletionConfirmation() {
  const active = activeOutlineDeletionConfirmation()
  if (!active) return
  const { pending, contractConfirmation } = active
  const superseded = outlineDeletionContract.supersede(pending.turnId)
  if (!superseded) return
  addOutlineTraceEvent({
    type: 'outline-deletion-confirmation-superseded',
    level: 'warn',
    label: '新的对话请求已取代旧删除授权',
    detail: JSON.stringify({
      turnId: pending.turnId,
      targetSignature: contractConfirmation.targetSignature,
    }),
    turnId: pending.turnId,
  })
  pendingOutlineDeletionConfirmation.value = null
  pendingOutlineDeletionReplay.value = null
  const index = messages.value.findIndex(message =>
    message.role === 'assistant'
    && message.outlineDeletionConfirmation?.turnId === pending.turnId
  )
  if (index >= 0) {
    projectStore.updateOutlineChatAt(index, { outlineDeletionConfirmation: undefined })
  }
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
  recordOutlineStyleProfileExemption('extraction_task')
  const timeoutHint: RunTrace['timeoutHint'] = outline.length >= LONG_DOCUMENT_CHAR_THRESHOLD
    ? { active: LONG_DOCUMENT_ACTIVE_TIMEOUT_MS }
    : undefined

  const trace = useAiCallTrace({
    source: 'outline',
    stepName: '大纲自动拆解',
    mode: 'auto-decompose',
    projectId: projectStore.currentProjectId || undefined,
    projectName: projectStore.projectName,
    providerId: provider.id,
    providerName: provider.name,
    model: agentStore.activeAgent?.model || provider.selectedModel || provider.models?.[0] || '',
    timeoutHint
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
  const aiService = await getAiService()
  const agent = agentStore.activeAgent
  try {
    trace.begin()
    const decomposePrompt =
      '请从以下小说大纲中提取设定信息，根据大纲内容自行决定需要哪些分类（如角色、世界观、物种、物品、势力、地理、魔法体系、技术、组织等），不要限定在固定分类里。\n返回JSON数组，每项包含 category、name、content 字段。只返回JSON数组，不要其他文字。\n\n大纲：\n' +
      outline
    const decomposeCallId = trace.beginApiCall({
      providerId: provider.id,
      providerName: provider.name,
      model: agent?.model || provider.selectedModel || provider.models?.[0] || '',
      requestMessages: [
        { role: 'system', content: '你是专业的小说设定编辑，擅长从大纲中提取各类设定信息，能根据大纲内容灵活判断需要哪些分类。' },
        { role: 'user', content: decomposePrompt }
      ]
    })
    const decomposeResponse = await aiService.callAi({
      purpose: 'generate',
      messages: [
        { role: 'system', content: '你是专业的小说设定编辑，擅长从大纲中提取各类设定信息，能根据大纲内容灵活判断需要哪些分类。' },
        { role: 'user', content: decomposePrompt }
      ],
      model: agent?.model || provider.selectedModel || provider.models?.[0] || undefined,
      temperature: agent?.temperature ?? 0.7,
      maxTokens: agent?.maxTokens ?? null,
      stream: false,
      retry: true,
      meta: { source: 'outline.autoDecompose' }
    })
    trace.finishApiCall(decomposeCallId, {
      status: decomposeResponse.text ? 'success' : 'degraded',
      responseText: decomposeResponse.text || '',
      reasoningText: decomposeResponse.reasoning || '',
      usage: decomposeResponse.usage,
      finishReason: decomposeResponse.finishReason
    })
    const decomposeResult = decomposeResponse.text || ''
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
    const foreshadowCallId = trace.beginApiCall({
      providerId: provider.id,
      providerName: provider.name,
      model: agent?.model || provider.selectedModel || provider.models?.[0] || '',
      requestMessages: [
        { role: 'system', content: '你是专业的小说结构分析师，擅长识别伏笔和铺垫。' },
        { role: 'user', content: foreshadowPrompt }
      ]
    })
    const foreshadowResponse = await aiService.callAi({
      purpose: 'generate',
      messages: [
        { role: 'system', content: '你是专业的小说结构分析师，擅长识别伏笔和铺垫。' },
        { role: 'user', content: foreshadowPrompt }
      ],
      model: agent?.model || provider.selectedModel || provider.models?.[0] || undefined,
      temperature: agent?.temperature ?? 0.7,
      maxTokens: agent?.maxTokens ?? null,
      stream: false,
      retry: true,
      meta: { source: 'outline.autoDecompose' }
    })
    trace.finishApiCall(foreshadowCallId, {
      status: foreshadowResponse.text ? 'success' : 'degraded',
      responseText: foreshadowResponse.text || '',
      reasoningText: foreshadowResponse.reasoning || '',
      usage: foreshadowResponse.usage,
      finishReason: foreshadowResponse.finishReason
    })
    const foreshadowResult = foreshadowResponse.text || ''
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
      status: 'draft',
      lockedAt: null,
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
  if (outlineSendStarting.value) return
  const text = inputText.value.trim()
  if (!text || outlineInputBlocked.value) return
  outlineSendStarting.value = true
  try {
  if (isOutlineDeletionAffirmativeInput(text)) {
    const consumed = await consumeOutlineDeletionAffirmativeTurn(text)
    if (consumed) {
      projectStore.appendOutlineChat({ role: 'user', content: text })
      inputText.value = ''
      lastUserRequest.value = text
      await scrollToBottom()
      return
    }
  }
  await supersedeOutlineDeletionConfirmation()
  projectStore.appendOutlineChat({ role: 'user', content: text })
  inputText.value = ''
  lastUserRequest.value = text
  await scrollToBottom()
  await askAi(text)
  } finally {
    outlineSendStarting.value = false
  }
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
  resumedApiBudget?: ApiCallBudget
}

type OutlineRoutingFallbackBubble = {
  requestText?: string
  routing?: ChainRoutingResult
  runId?: string
  createdAt?: number
  resumeToken?: string
  recommendedSkillIds?: string[]
}

async function classifyHomeIntentDetailed(requestText: string): Promise<PlainDialogueIntentDetailed> {
  const recentHistory = getOutlineContextMessages(requestText)
    .slice(-4)
    .map(message => ({
      role: message.role,
      content: String(message.content || ''),
    }))
  const detailed = await classifyPlainDialogueIntentDetailed(requestText, recentHistory, {
    workspace: 'outline-workbench',
    projectId: outlineProjectId(),
    activeEditTaskStatus: outlineEditTask.value?.status === 'awaiting_batch'
      ? 'awaiting_batch'
      : undefined,
    activePlanStatus: (() => {
      const snapshot = createOutlineRequestTarget()
      const snapshotStatus = activeExecutionTaskStore.getValidSnapshot(
        'outline',
        outlineProjectId(),
        snapshot?.contentVersion || 0,
        hashOutlineContent(snapshot?.content || ''),
      )?.status
      return snapshotStatus === 'awaiting_user_plan' || snapshotStatus === 'active'
        ? snapshotStatus
        : undefined
    })(),
    llmClassifier: createIntentLlmFallback({
      activeVerifyProvider: providerStore.activeVerifyProvider,
      activeGenerateProvider: providerStore.activeGenerateProvider,
      onTraceEvent: event => addOutlineTraceEvent({
        type: event.type,
        label: event.type === 'intent-llm-fallback-start'
          ? '意图 LLM 兜底开始'
          : `意图 LLM 兜底${event.status === 'success' ? '成功' : event.status === 'canceled' ? '取消' : '失败'}`,
        level: event.type === 'intent-llm-fallback-start' || event.status === 'success' ? 'info' : 'error',
        detail: JSON.stringify(event),
      }),
      }),
    })
  if (detailed.routing.kind === 'no_match' || detailed.routing.kind === 'ambiguous') {
    stageIntentCorpusInference({
      projectId: outlineProjectId(),
      projectName: projectStore.projectName,
      workspace: 'outline-workbench',
      runId: outlineRunTraceId,
      requestText,
      routing: detailed.routing,
    })
  }
  return detailed
}

function addOutlineRoutingDiagnostics(
  diagnostics: PlainDialogueIntentDetailed['diagnostics'],
) {
  addOutlineTraceEvent({
    type: 'routing-diagnostics',
    label: `意图路由诊断：${diagnostics.router.decisionLayer}`,
    detail: JSON.stringify(diagnostics),
  })
}

async function askAi(requestText: string, routingDecision: OutlineRoutingDecision = {}) {
  if (outlineExecutionLocked.value) {
    const activeOutlineTraceId = outlineRunTraceId
      ? runTraceStore.getRun(outlineRunTraceId)
      : null
    const latestCall = activeOutlineTraceId?.apiCalls.at(-1)
    if (activeOutlineTraceId?.status === 'running' && latestCall?.status === 'running') {
      addOutlineTraceEvent({
        type: 'input-guard-deferred',
        level: 'warn',
        label: '当前任务仍在执行，输入已延后',
        detail: '物理请求仍在进行；为避免并发写编辑器，本轮输入未发送',
      })
    }
    return
  }
  currentOutlineUserRequest = requestText
  const templates = getWorkspaceTemplates()
  const provider = providerStore.activeGenerateProvider
  if (!provider) {
    projectStore.appendOutlineChat({ role: 'assistant', content: '请先配置API供应商' })
    await scrollToBottom()
    return
  }
  const model = provider.selectedModel || provider.models?.[0] || 'gpt-4o'
  // The per-turn token limit is recorded from the actual request result.
  configureOutlineContextCompaction(model, provider.contextWindowTokens)
  const detailedIntent = routingDecision.forcedIntent
    ? null
    : await classifyHomeIntentDetailed(requestText)
  const resolvedIntent: PlainDialogueIntent = routingDecision.forcedIntent
    || (detailedIntent ? detailedIntent.intent : 'discuss')
  const resolvedRoutingReason = detailedIntent?.routing.reason || ''
  if (detailedIntent) {
    currentRoutingIntent.value = resolvedIntent
    recordIntentRoutingSample({
      projectId: outlineProjectId(),
      projectName: projectStore.projectName,
      workspace: 'outline-workbench',
      runId: outlineRunTraceId,
      turnId: outlineRunTurnId || undefined,
      requestText,
      routing: detailedIntent.routing,
    })
    addOutlineRoutingDiagnostics(detailedIntent.diagnostics)
  }
  const requestTarget = createOutlineRequestTarget()
  const outlineActiveTaskBeforeRun = activeExecutionTaskStore.getValidSnapshot(
    'outline',
    outlineProjectId(),
    requestTarget.contentVersion,
    hashOutlineContent(requestTarget.content),
  )
  const outlinePlan = buildOutlineExecutionPlanForRequest({
    requestText,
    content: requestTarget.content,
    provider,
    intent: resolvedIntent,
    activeTask: outlineActiveTaskBeforeRun || undefined,
    activePlanConfirmation: resolvedRoutingReason === 'active-plan-continuation',
  })
  const shouldReuseAwaitingOutlinePlan = Boolean(
    (outlineActiveTaskBeforeRun?.status === 'awaiting_user_plan' ||
      outlineActiveTaskBeforeRun?.status === 'active')
    && outlineActiveTaskBeforeRun.plan
    && resolvedRoutingReason === 'active-plan-continuation',
  )
  const shouldPreserveAwaitingOutlinePlan = Boolean(
    outlineActiveTaskBeforeRun?.status === 'awaiting_user_plan'
    && outlineActiveTaskBeforeRun.plan
    && !shouldReuseAwaitingOutlinePlan
    && activeExecutionTaskStore.isAwaitingPlanSupersededByPlan(
      'outline',
      outlineProjectId(),
      outlinePlan.plan.operation,
    ) === false,
  )
  if (!shouldReuseAwaitingOutlinePlan && !shouldPreserveAwaitingOutlinePlan) {
    if (outlineActiveTaskBeforeRun?.status === 'awaiting_user_plan') {
      activeExecutionTaskStore.supersedeAwaitingUserPlan(
        'outline',
        outlineProjectId(),
        'new-edit-request',
      )
    }
    createOutlineActiveTask({
      requestText,
      plan: outlinePlan.plan,
      snapshot: requestTarget,
    })
    const supersededPlan = activeExecutionTaskStore.consumeLastSupersededPlan()
    if (supersededPlan) {
      addOutlineTraceEvent({
        type: 'active-plan-superseded',
        level: 'info',
        label: '旧等待计划已由新编辑请求替换',
        detail: JSON.stringify(supersededPlan),
      })
    }
  }
  activeOutlineExecutionPlan = outlinePlan.plan
  if (isOutlineFinalDraftRequest(outlinePlan.plan, requestText, requestTarget.content)) {
    startOutlineRun(workspaceSkillMode.value, requestText, templates.map(template => template.name), {
      intent: routingDecision.forcedIntent || 'generate',
      longDocument: usesLongDocumentToolRuntime(outlinePlan.plan),
      toolSurface: [],
      actualToolSurface: [],
    })
    consumeIntentCorpusInference({
      projectId: outlineProjectId(),
      projectName: projectStore.projectName,
      workspace: 'outline-workbench',
      runId: outlineRunTraceId,
      turnId: outlineRunTurnId,
      requestText,
      routing: {
        kind: 'matched',
        intent: routingDecision.forcedIntent || 'generate',
        confidence: 1,
        reason: 'skill-final-draft-wrapper',
      },
    })
    await runOutlineFinalDraftTurn({
      requestText,
      sourceContent: requestTarget.content,
      model,
      plan: outlinePlan.plan,
      skillGuidance: buildOutlineSkillGuidance(),
      conversationMarkers: buildOutlineConversationMarkers(),
    })
    return
  }
  const localTransform = await runOutlineLocalTransformIfReady({
    plan: outlinePlan.plan,
    snapshot: requestTarget,
    intent: resolvedIntent,
    mode: workspaceSkillMode.value,
  })
  if (localTransform) return
  if (templates.length === 0) {
    await askPlainAi(requestText)
    return
  }
  const composeSkillGuidance = workspaceSkillMode.value === 'compose'
    ? buildWorkspaceSkillGuidance({
        templates,
        requestText,
        adapter: createWorkspaceSkillAdapter(),
      })
    : undefined
  if (composeSkillGuidance) {
    await askPlainAi(requestText, {
      skillGuidance: composeSkillGuidance.guidance,
      skillIds: composeSkillGuidance.skillIds,
      promptSource: composeSkillGuidance.promptSource,
      resumedApiBudget: routingDecision.resumedApiBudget,
      skillProtocolDiagnostics: await collectSkillPackageProtocolDiagnostics(templates),
    })
    return
  }
  startOutlineRun(workspaceSkillMode.value, requestText, templates.map(template => template.name), {
    intent: routingDecision.forcedIntent,
    longDocument: usesLongDocumentToolRuntime(outlinePlan.plan),
    toolSurface: [],
    actualToolSurface: [],
  })
  let systemPrompt = buildOutlineSystemPrompt()
  const fallbackMessages = buildOutlineFallbackMessages(requestText)
  consumeIntentCorpusInference({
    projectId: outlineProjectId(),
    projectName: projectStore.projectName,
    workspace: 'outline-workbench',
    runId: outlineRunTraceId,
    turnId: outlineRunTurnId,
    requestText,
    routing: {
      kind: 'matched',
      intent: routingDecision.forcedIntent || 'discuss',
      confidence: routingDecision.forcedIntent ? 1 : 0,
      reason: routingDecision.forcedIntent ? 'forced-routing' : 'pre-turn-routing',
    },
  })
  generationController = new AbortController()
  isGenerating.value = true
  outlineInputUnlockedByAgent.value = false
  generationStatus.value = '正在连接 API...'
  streamingContent.value = ''
  pendingOutlineDirectWrite.value = null
    const startedAt = performance.now()
    let firstChunkSeen = false
    let activeWorkspaceApiCallId: string | undefined
  let outlineSkillTerminalStatus: RunTraceStatus | undefined
  let outlineSkillTerminalReason: string | undefined
  const outlineArtifactContract: WorkspaceArtifactContract | null =
    resolvedIntent === 'edit' && requestTarget.content
      ? {
          kind: 'outline',
          original: requestTarget.content,
          options: { validateDocumentBody: true },
        }
      : null
  try {
    const aiService = await getAiService()
    if (workspaceSkillMode.value !== 'chain') {
      throw new Error('compose SKILL 路径必须走统一 Agent 执行底座')
    }
    let responseText = ''
    // Resume keeps the exhausted run's used count and user-approved extension.
    const apiBudget = routingDecision.resumedApiBudget || createApiCallBudget(8)
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
      artifactContract: outlineArtifactContract,
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
          systemPrompt = buildOutlineSystemPrompt(actualToolSurface)
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
          if (meta.toolAudit !== undefined) runTraceStore.setApiCallToolAudit(outlineRunTraceId || '', callId, meta.toolAudit)
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
              providerContextWindowTokens: meta.contextBudget?.providerContextWindowTokens,
              estimatedInputTokens: meta.contextBudget?.estimatedInputTokens,
              contextBudgetDecision: meta.contextBudget?.decision,
              contextBudgetReason: meta.contextBudget?.reason,
              usageReconciliation: meta.usageReconciliation,
              textOrigin: meta.textOrigin,
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
          addOutlineTraceEvent({
            type: 'skill-skipped',
            label: `跳过技能：${skillId}`,
            detail: reason
          })
        },
        onSkillFallback: (skillId, detail) => {
          addOutlineTraceEvent({
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
      onRoutingEvent: event => recordOutlineRoutingEvent(event),
      onArtifactAcceptance: (acceptance, stepIndex, mode) => {
        if (acceptance.reason === 'no_contract') return
        outlineSkillTerminalStatus = acceptance.terminalStatus
        outlineSkillTerminalReason = acceptance.terminalReason
        addOutlineTraceEvent({
          type: acceptance.decision === 'accept'
            ? 'workspace-artifact-accepted'
            : 'workspace-artifact-rejected',
          level: acceptance.decision === 'accept'
            ? (acceptance.warnings.length ? 'warn' : 'info')
            : 'error',
          label: acceptance.decision === 'accept'
            ? '大纲产物契约通过'
            : '大纲产物契约失败',
          detail: `mode=${mode}; step=${stepIndex}; reason=${acceptance.terminalReason}`,
          payload: acceptance.traceDetail,
          turnId: outlineRunTurnId,
        })
      }
    }
  })
  if (result.runState === 'awaiting_user') {
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
    if (outlineRunTraceId) runTraceStore.startAwaitingUser(outlineRunTraceId, 'awaiting_user')
    activeOutlineExecutionPlan = null
    return
  }
  if (result.runState === 'budget_exhausted') {
    projectStore.appendOutlineChat({
      role: 'assistant',
      content: result.text,
      budgetExhausted: {
        used: result.budgetSnapshot?.used || 0,
        limit: result.budgetSnapshot?.limit || 0,
        requestText,
        budgetToken: currentOutlineBudgetToken()
      }
    })
    addOutlineTraceEvent({
      type: 'budget-exhausted',
      level: 'warn',
      label: 'API 调用预算已用尽',
      detail: `已用 ${result.budgetSnapshot?.used || 0}/${result.budgetSnapshot?.limit || 0}，已保留断点`
    })
    finishOutlineRun('blocked', 'API 调用预算已用尽，等待用户追加', result.text, 'budget_exhausted')
    activeOutlineExecutionPlan = null
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
    if (result.meta?.skillToolDeclarationsIgnored) {
      addOutlineTraceEvent({
        type: 'skill-tool-declarations-ignored',
        level: 'info',
        label: 'SKILL 工具/授权声明已忽略',
        detail: `声明 ${result.meta.skillToolDeclarationsIgnored} 项，启用 0 项`
      })
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
      ...(pendingOutlineDeletionConfirmation.value ? { outlineDeletionConfirmation: {
        ...pendingOutlineDeletionConfirmation.value,
        status: 'requested' as const,
      } } : {}),
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
    if (outlineRunTraceId) {
      if (runTraceStore.isAwaitingUser(outlineRunTraceId)) {
        runTraceStore.cancelRunningApiCalls(outlineRunTraceId, '等待用户确认，未发起 API 调用')
      } else if (generationStatus.value === '已取消生成') {
        runTraceStore.cancelRunningApiCalls(outlineRunTraceId, '用户取消生成')
      } else {
        runTraceStore.failRunningApiCalls(outlineRunTraceId, '运行收尾时仍未闭合')
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
    activeOutlineExecutionPlan = null
    pendingOutlineDeletionConfirmation.value = null
    if (generationStatus.value !== '已取消生成' && generationStatus.value !== '等待意图确认') generationStatus.value = ''
    streamingContent.value = ''
  }
  await scrollToBottom()
}

function handleEditorBeforeInput() {
  if (projectStore.outlineLocked) return
  if (multiCursorSelection.value) {
    const composing = multiCursorComposing.value
    if (!composing) clearMultiCursorSelection('native-input', 'warn')
  }
  const now = Date.now()
  if (now - lastEditorHistoryAt < 800) return
  const current = projectStore.outlineText || ''
  editorStore.pushUndoTransactionForTab('outline', current, 'manual', '手动输入')
  lastEditorHistoryAt = now
}

async function askPlainAi(
  requestText: string,
  options: {
    skillGuidance?: string
    skillIds?: string[]
    promptSource?: string
    resumedApiBudget?: ApiCallBudget
    skillProtocolDiagnostics?: RealSkillDiagnostic[]
  } = {},
) {
  currentOutlineUserRequest = requestText
  activeOutlineExecutionPlan = null
  const provider = providerStore.activeGenerateProvider
  if (!provider) {
    projectStore.appendOutlineChat({ role: 'assistant', content: '请先配置API供应商' })
    await scrollToBottom()
    return
  }
  const model = provider.selectedModel || provider.models?.[0] || 'gpt-4o'
  configureOutlineContextCompaction(model, provider.contextWindowTokens)
  let requestMessages: Array<{ role: string; content: string }> = []
  const plainIntentDetailed = await classifyHomeIntentDetailed(requestText)
  const plainIntent: PlainDialogueIntent = plainIntentDetailed.intent
  currentRoutingIntent.value = plainIntent
  const plainRoutingReason = plainIntentDetailed.routing.reason
  const requestTarget = createOutlineRequestTarget()
  const activeOutlineTask = activeExecutionTaskStore.getValidSnapshot(
    'outline',
    outlineProjectId(),
    requestTarget.contentVersion,
    hashOutlineContent(requestTarget.content),
  )
  const outlinePlan = buildOutlineExecutionPlanForRequest({
    requestText,
    content: requestTarget.content,
    provider,
    intent: plainIntent,
    activeTask: activeOutlineTask || undefined,
    activePlanConfirmation: plainRoutingReason === 'active-plan-continuation',
  })
  const shouldReusePlainAwaitingOutlinePlan = Boolean(
    (activeOutlineTask?.status === 'awaiting_user_plan' ||
      activeOutlineTask?.status === 'active')
    && activeOutlineTask.plan
    && plainRoutingReason === 'active-plan-continuation',
  )
  // Keep planner as the single place that marks a reused awaiting plan.
  const outlineExecutionPlan = outlinePlan.plan
  const shouldPreservePlainAwaitingOutlinePlan = Boolean(
    activeOutlineTask?.status === 'awaiting_user_plan'
    && activeOutlineTask.plan
    && !shouldReusePlainAwaitingOutlinePlan
    && activeExecutionTaskStore.isAwaitingPlanSupersededByPlan(
      'outline',
      outlineProjectId(),
      outlineExecutionPlan.operation,
    ) === false,
  )
  if (!shouldReusePlainAwaitingOutlinePlan && !shouldPreservePlainAwaitingOutlinePlan) {
    if (activeOutlineTask?.status === 'awaiting_user_plan') {
      activeExecutionTaskStore.supersedeAwaitingUserPlan(
        'outline',
        outlineProjectId(),
        'new-edit-request',
      )
    }
    createOutlineActiveTask({
      requestText,
      plan: outlineExecutionPlan,
      snapshot: requestTarget,
    })
    const supersededPlan = activeExecutionTaskStore.consumeLastSupersededPlan()
    if (supersededPlan) {
      addOutlineTraceEvent({
        type: 'active-plan-superseded',
        level: 'info',
        label: '旧等待计划已由新编辑请求替换',
        detail: JSON.stringify(supersededPlan),
      })
    }
  }
  const outlineProviderWindowDeclared = typeof outlinePlan.providerWindow === 'number'
  const outlineProviderWindow = outlinePlan.providerWindow
  const outlineMaxOutputTokens = Number(provider.maxTokens) > 0 ? Number(provider.maxTokens) : null
  activeOutlineExecutionPlan = outlineExecutionPlan
  const useOutlineFinalDraft = isOutlineFinalDraftRequest(outlineExecutionPlan, requestText, requestTarget.content)
  if (useOutlineFinalDraft) {
    startOutlineRun('direct', requestText, [], {
      intent: plainIntent,
      longDocument: true,
      toolSurface: [],
      actualToolSurface: [],
    })
    consumeIntentCorpusInference({
      projectId: outlineProjectId(),
      projectName: projectStore.projectName,
      workspace: 'outline-workbench',
      runId: outlineRunTraceId,
      turnId: outlineRunTurnId,
      requestText,
      routing: {
        kind: 'matched',
        intent: plainIntent,
        confidence: 1,
        reason: 'final-draft-wrapper',
        diagnostics: plainIntentDetailed.diagnostics,
      },
    })
    recordIntentRoutingSample({
      projectId: outlineProjectId(),
      projectName: projectStore.projectName,
      workspace: 'outline-workbench',
      runId: outlineRunTraceId,
      turnId: outlineRunTurnId || undefined,
      requestText,
      routing: plainIntentDetailed.routing,
    })
    addOutlineRoutingDiagnostics(plainIntentDetailed.diagnostics)
    generationController = new AbortController()
    cancelController = new AbortController()
    await runOutlineFinalDraftTurn({
      requestText,
      sourceContent: requestTarget.content,
      model,
      plan: outlineExecutionPlan,
      skillGuidance: buildOutlineSkillGuidance(),
      conversationMarkers: buildOutlineConversationMarkers(),
    })
    return
  }
  const plainLocalTransform = await runOutlineLocalTransformIfReady({
    plan: outlineExecutionPlan,
    snapshot: requestTarget,
    intent: plainIntent,
    mode: 'direct',
  })
  if (plainLocalTransform) return
  const useOutlineEditTaskPlan = outlineExecutionPlan.mode === 'edit-task'
  const isLongDocumentRequest = useOutlineEditTaskPlan || usesLongDocumentToolRuntime(outlineExecutionPlan)
  const outlineLongDocumentOperationType = toLongDocumentOperationType(outlineExecutionPlan.operation)
  outlineDirectWriteMultiBatch = useOutlineEditTaskPlan
  const workflowWriteAuthorization = buildWorkflowWriteAuthorizationFromPlan({
    workspace: 'outline',
    intent: plainIntent,
    plan: outlineExecutionPlan,
    locked: projectStore.outlineLocked,
  })
    const plainSurface = requestTarget.content
      ? buildDialogueToolSurface({
      workspace: 'outline',
      intent: plainIntent,
      readLedger: getOutlineSessionReadLedger(),
      maxReadChars: () => getReadCapChars(providerStore.activeGenerateProvider, model),
      getSnapshot: () => createOutlineRequestTarget(),
      getAllSnapshots: buildOutlineWorkspaceSnapshots,
      mode: 'direct',
      executionPlan: outlineExecutionPlan,
      writeAuthorization: workflowWriteAuthorization,
      conversationMarkers: buildOutlineConversationMarkers(),
      userRequestText: requestText,
      authorizedPlanExcerpts: activeOutlineTask?.authorizedExcerpts || [],
      onContaminationDecision: (decision: EditorWriteContaminationDecision) => addOutlineTraceEvent({
        type: decision.type,
        level: decision.type === 'write-contamination-rejected' ? 'warn' : 'info',
        label: decision.type === 'write-contamination-rejected'
          ? '写入内容包含历史对话表述，已整批拒绝'
          : '写入内容由当前用户请求显式提供，允许通过',
        detail: JSON.stringify(decision.payload),
        payload: decision.payload,
        turnId: outlineRunTurnId,
      }),
      applyWrite: async input => applyOutlineDirectWrite({
        ...input,
        multiBatch: useOutlineEditTaskPlan,
      }),
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
        getSnapshot: () => createOutlineRequestTarget(),
        readLedger: getOutlineSessionReadLedger()
      }),
      readableTargets: ['outline', 'outline-settings'],
      writableTarget: 'outline',
      activeEditTask: outlineEditTask.value,
      onResumeEditTask: taskId => outlineEditTaskSession.resumeEditTask(taskId),
      onCancelEditTask: taskId => outlineEditTaskSession.onCancelEditTask(taskId),
    })
    : undefined
  const tools = plainSurface?.tools
  const outlinePermissionDecision = plainSurface?.permissionDecision
  const plainToolSurface = plainSurface?.actualToolSurface
  for (const conflict of plainSurface?.toolConflicts || []) {
    addOutlineTraceEvent({
      type: 'tool-conflict',
      level: 'warn',
      label: conflict.label,
      detail: conflict.detail,
    })
    ;(typeof window !== 'undefined' ? (window as any).DiagLogger : null)?.log?.(
      'warn',
      'outline/tool-conflict',
      conflict.label,
      { detail: conflict.detail, payload: conflict.payload },
    )
  }
  startOutlineRun('direct', requestText, [], {
    intent: plainIntent,
    longDocument: isLongDocumentRequest,
    permissionDecision: outlinePermissionDecision,
    toolSurface: plainToolSurface,
    actualToolSurface: plainToolSurface,
  })
  const systemPrompt = buildOutlineSystemPrompt(plainToolSurface)
  consumeIntentCorpusInference({
    projectId: outlineProjectId(),
    projectName: projectStore.projectName,
    workspace: 'outline-workbench',
    runId: outlineRunTraceId,
    turnId: outlineRunTurnId,
    requestText,
    routing: {
      kind: 'matched',
      intent: plainIntent,
      confidence: 1,
      reason: 'plain-dialogue-wrapper',
      diagnostics: plainIntentDetailed.diagnostics,
    },
  })
  recordIntentRoutingSample({
    projectId: outlineProjectId(),
    projectName: projectStore.projectName,
    workspace: 'outline-workbench',
    runId: outlineRunTraceId,
    turnId: outlineRunTurnId || undefined,
    requestText,
    routing: plainIntentDetailed.routing,
  })
  addOutlineRoutingDiagnostics(plainIntentDetailed.diagnostics)
  if (options.skillProtocolDiagnostics?.length) {
    runTraceStore.appendFolderDiagnostics(outlineRunTraceId || '', options.skillProtocolDiagnostics)
    const ignoredCount = options.skillProtocolDiagnostics
      .filter(item => item.code === 'folder-package:manifest-protocol-fields-ignored')
      .length
    if (ignoredCount > 0) {
      addOutlineTraceEvent({
        type: 'skill-tool-declarations-ignored',
        level: 'info',
        label: 'SKILL 工具/授权声明已忽略',
        detail: `声明 ${ignoredCount} 项，启用 0 项`
      })
    }
  }
  generationController = new AbortController()
  cancelController = new AbortController()
  generationStatus.value = '正在连接 API...'
    streamingContent.value = ''
  pendingOutlineDirectWrite.value = null
    outlineFailedWriteBatch = null
    isGenerating.value = true
    outlineInputUnlockedByAgent.value = false
  const startedAt = performance.now()
  const requestStartedAt = Date.now()
  let firstChunkSeen = false
  let directStreamText = ''
  let compatibilityModeUsed = false
  let plainAiResult: { finishReason?: string; maxTokens?: number | null } | null = null
  let outlineAgentTerminal: { status: RunTraceStatus; reason: string } | undefined
  const outlineToolRunBudget = createToolRunBudget({
    plan: outlineExecutionPlan,
    operation: outlineLongDocumentOperationType,
  })
  let aiService: Awaited<ReturnType<typeof getAiService>> | null = null
  let contextRef: Parameters<typeof conversationContextService.recordTurn>[0] | null = null
  let traceApiCallId: string | undefined
  const requestContextPack = buildContextPack(requestTarget, undefined, {
    provider,
    model,
    maxOutputTokens: Number(provider.maxTokens) > 0 ? Number(provider.maxTokens) : null,
  })
  let plainAiTurnSucceeded = false
  addOutlineTraceEvent({
    type: 'long-document-policy',
    level: 'info',
    label: useOutlineEditTaskPlan
      ? '长文档进入 EditTask 多批执行'
      : outlineExecutionPlan.mode === 'single-pass'
        ? '全文一次成型执行'
      : isLongDocumentRequest
        ? '启用长文档工具任务策略'
        : '使用短文档工具任务策略',
    detail: JSON.stringify({
      planId: outlineExecutionPlan.planId,
      operation: outlineExecutionPlan.operation,
      operationResolution: outlineExecutionPlan.operationResolution,
      legacyOperationType: outlineLongDocumentOperationType,
      mode: outlineExecutionPlan.mode,
      decision: outlineExecutionPlan.decision,
      reason: useOutlineEditTaskPlan
        ? 'execution-plan-edit-task'
        : isLongDocumentRequest
          ? 'execution-plan-long-document'
          : 'execution-plan-direct',
      segments: outlineExecutionPlan.segments.length,
      invariants: outlineExecutionPlan.invariants,
      estimatedPhysicalRequests: outlineExecutionPlan.estimatedPhysicalRequests,
      contextWindow: outlineExecutionPlan.contextWindow,
      estimatedDocumentTokens: outlineExecutionPlan.estimatedDocumentTokens,
      outlineChars: outlineExecutionPlan.totalChars,
      request: requestText.slice(0, 120),
    })
  })
  const longDocumentDiag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
  longDocumentDiag?.log?.('info', 'outline/long-document-policy', `longDocument=${isLongDocumentRequest}`, {
    reason: `execution-plan-${outlineExecutionPlan.decision}`,
    executionMode: useOutlineEditTaskPlan ? 'edit-task' : 'direct',
    executionModeReason: `operation=${outlineExecutionPlan.operation}`,
    operationResolution: outlineExecutionPlan.operationResolution,
    planId: outlineExecutionPlan.planId,
    decision: outlineExecutionPlan.decision,
    contextWindow: outlineExecutionPlan.contextWindow,
    estimatedDocumentTokens: outlineExecutionPlan.estimatedDocumentTokens,
    requestText,
    outlineChars: outlineExecutionPlan.totalChars,
  })
  let toolRunSupervisor = createOutlineToolRunSupervisor(() => generationController, {
    longDocument: isLongDocumentRequest,
  })
  function resetOutlineToolRunSupervisor() {
    toolRunSupervisor.dispose()
    toolRunSupervisor = createOutlineToolRunSupervisor(() => generationController, {
      longDocument: isLongDocumentRequest,
    })
  }
  try {
    aiService = await getAiService()
    const projectId = String(projectStore.currentProjectId || 'default')
    contextRef = {
      projectId,
      workspace: 'outline' as const,
      purpose: 'generate' as const
    }
    const contextBundle = await conversationContextService.buildContextBundle({
      ...contextRef,
      toolAudit: lastOutlineToolAudit,
      workspaceState: {
        outline: projectStore.outlineText || '',
        outlineContextPack: requestContextPack?.content || undefined,
        selectedText: getCurrentOutlineSelection(),
        activeTab: '大纲编辑器',
        settings: projectStore.settingsCollection,
        memories: JSON.stringify(projectStore.memories || {})
      },
      immediateContextMessages: getOutlineContextMessages(requestText)
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
    const historyNeutralization = contextBundle.execution.historyNeutralization
    addOutlineTraceEvent({
      type: 'editor-context-policy',
      label: '编辑目标上下文策略',
      detail: JSON.stringify({
        targetId: requestTarget.targetId,
        label: requestTarget.label,
        targetLength: requestTarget.content.length,
        contentVersion: requestTarget.contentVersion,
        versionSource: 'stable_content_version',
        selectionSource: editorRef.value ? 'real' : 'fallback_end',
        selectionStart: requestTarget.selectionStart,
        selectionEnd: requestTarget.selectionEnd,
        contextInjectionMode: requestContextPack?.mode || 'none',
        pipeline: requestContextPack?.pipeline || null,
        historyNeutralization: historyNeutralization || null,
      })
    })
    const outlineEditorContextDiag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
    outlineEditorContextDiag?.log?.('info', 'outline/editor-context-pipeline', '编辑上下文管道元数据', {
      targetId: requestTarget.targetId,
      pipeline: requestContextPack?.pipeline || null,
      historyNeutralization: historyNeutralization || null,
    })
    traceApiCallId = startOutlineApiCall({
      skillName: '直接对话',
      requestMessages: requestMessages.map(message => ({
        role: String(message.role || ''),
        content: String(message.content || '')
      })),
      model,
      intent: plainIntent,
      permissionDecision: outlinePermissionDecision,
      toolSurface: plainToolSurface,
      actualToolSurface
    })
    const agentRuntime = createAgentDialogueRuntime({
      source: 'outline',
      runId: outlineRunTraceId,
      taskId: `outline-direct-${traceApiCallId || Date.now().toString(36)}`,
      goal: requestText.slice(0, 200) || '完成本轮大纲直接对话',
      document: {
        content: requestTarget.content,
        operationType: outlineLongDocumentOperationType,
        executionPlan: outlineExecutionPlan,
      },
      editTaskWorkflow: useOutlineEditTaskPlan,
      skillGuidance: options.skillGuidance,
      skillIds: options.skillIds,
      promptSource: options.promptSource,
      idleTimeoutMs: isLongDocumentRequest ? LONG_TOOL_RUN_IDLE_TIMEOUT_MS : DIRECT_TOOL_RUN_IDLE_TIMEOUT_MS,
      toolRunBudget: outlineExecutionPlan || !useOutlineEditTaskPlan
        ? outlineToolRunBudget.snapshot()
        : undefined,
      toolRunBudgetInstance: outlineExecutionPlan || !useOutlineEditTaskPlan
        ? outlineToolRunBudget
        : undefined,
      getContextRemaining: () => ({
        contextWindowTokens: outlineProviderWindowDeclared ? outlineProviderWindow : null,
        maxOutputTokens: outlineMaxOutputTokens,
      }),
      onEvent: (event, snapshot) => {
        if (event.type === 'state') {
          const status = snapshot.status
          if (status === 'needs_user' || status === 'stalled'
            || status === 'failed' || status === 'canceled' || status === 'completed') {
            isGenerating.value = false
            generationStatus.value = status === 'needs_user'
              ? '模型等待你的回复'
              : status === 'completed' ? '正在收尾...' : ''
          }
          if (status === 'needs_user') {
            const awaitingOutlineTask = activeExecutionTaskStore.markAwaitingUserPlan(
              'outline',
              outlineProjectId(),
            )
            if (awaitingOutlineTask) {
              addOutlineTraceEvent({
                type: 'active-plan-awaiting-user',
                level: 'info',
                label: '执行计划已登记，等待用户确认',
                detail: JSON.stringify({
                  taskId: awaitingOutlineTask.taskId,
                  planId: awaitingOutlineTask.plan?.planId,
                  operation: awaitingOutlineTask.operation,
                }),
              })
            }
          }
        }
        if (event.type === 'interactive_response' && outlineInputBlocked.value) {
          outlineInputUnlockedByAgent.value = true
          addOutlineTraceEvent({
            type: 'input-unlocked-interactive-response',
            level: 'info',
            label: '模型已给出正文，输入已解锁',
            detail: 'agent_interactive_response',
          })
        }
        addOutlineTraceEvent({
          type: `agent-${event.type}`,
          level: event.level === 'warning' ? 'warn' : event.level,
          label: event.label,
          detail: event.detail,
          payload: event.payload,
        })
        const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
        diag?.log?.(
          event.level === 'error' ? 'error' : event.level === 'warning' ? 'warn' : 'info',
          `outline/agent-orchestrator/${event.type}`,
          event.label,
          { reason: event.detail, payload: event.payload },
        )
      },
    })
    const agentOnChunk = (text: string) => {
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
    }
    const agentResult = await agentRuntime.run({
      purpose: 'generate',
      messages: requestMessages,
      model,
      stream: true,
      signal: generationController.signal,
      cancelSignal: cancelController?.signal,
      onChunk: agentOnChunk,
      retry: false,
      tools,
      timeoutMs: isLongDocumentRequest ? null : DIRECT_TOOL_RUN_HARD_DEADLINE_MS,
      onStreamToolProgress: progress => {
        toolRunSupervisor.reportProgress()
        if (outlineRunTraceId && traceApiCallId) {
          runTraceStore.reportToolArgumentProgress(outlineRunTraceId, traceApiCallId, progress)
        }
      },
    onPhysicalCall: (event) => {
      recordOutlinePhysicalCall(traceApiCallId, event)
      if (physicalCallReportsProgress(event)) toolRunSupervisor.reportProgress()
    },
    onProviderQueue: event => recordOutlineProviderQueue(traceApiCallId, event),
    toolPolicy: tools ? {
        scenario: 'direct-tool-intensive',
        maxToolIterations: calculateLongDocumentPhysicalRequestBudget(outlineExecutionPlan),
        toolRunBudget: outlineToolRunBudget,
          intent: plainIntent,
          permissionDecision: outlinePermissionDecision,
        onPermissionDenied: event => {
          addOutlineTraceEvent({
            type: 'tool-permission-denied',
            level: 'error',
            label: '工具写入权限拒绝',
            detail: `${event.toolName}：${event.reason}`
          })
        },
        onConvergenceStart: () => {
          if (firstChunkSeen) generationStatus.value = '正在生成...'
          addOutlineTraceEvent({
            type: 'tool-convergence-started',
            level: 'info',
            label: '开始收敛最终回答',
            detail: '应用已判定继续工具循环不可取（写入终态拒绝、参数反复无效、覆盖检查未通过或轮次耗尽），正在请求不带工具的最终说明'
          })
          toolRunSupervisor.dispose()
        },
        onConvergencePseudoCall: event => {
          addOutlineTraceEvent({
            type: 'tool-convergence-pseudo-call',
            level: 'warn',
            label: '收敛回答疑似伪工具调用',
            detail: event.text.slice(0, 2000)
          })
          const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
          diag?.log?.('warn', 'tool/convergence-pseudo-call', '收敛回答疑似伪工具调用，已发起一次强纠正请求', {
            workspace: 'outline',
            text: event.text.slice(0, 2000),
            reason: event.reason,
          })
        },
        onConvergenceCorrected: () => {
          addOutlineTraceEvent({
            type: 'tool-convergence-corrected',
            level: 'info',
            label: '收敛回答已纠正为自然语言',
            detail: '伪工具调用已被拦截，强纠正请求返回可用正文'
          })
          const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
          diag?.log?.('info', 'tool/convergence-corrected', '收敛伪工具调用已通过强纠正请求修复')
        },
        onConvergenceLocalFallback: reason => {
          addOutlineTraceEvent({
            type: 'tool-convergence-local-fallback',
            level: 'warn',
            label: '收敛失败，返回本地摘要',
            detail: reason
          })
          const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
          diag?.log?.('warn', 'tool/convergence-local-fallback', '收敛请求未得到可用正文，已返回本地工具结果摘要', {
            workspace: 'outline',
            reason,
          })
        },
        onToolStart: (event) => {
          toolRunSupervisor.reportProgress()
          if (!isAgentRuntimeToolName(event.toolName)) {
            window.dispatchEvent(new CustomEvent('tool-activity', { detail: { type: 'tool_start', toolName: event.toolName, targetId: 'outline', policy: event.policy } }))
          }
        },
        onToolCall: (event) => {
          toolRunSupervisor.reportProgress()
          if (!event.result.ok) toolRunSupervisor.reportToolError(
            buildToolErrorKey(
              event.toolName,
              event.result.error?.code || event.result.error?.message,
              event.input,
            ),
            3,
            event.iteration,
          )
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
          if (!isAgentRuntimeToolName(event.toolName)) {
            window.dispatchEvent(new CustomEvent('tool-activity', {
              detail: {
                type: event.result.ok ? 'tool_result' : 'tool_error',
                toolName: event.toolName,
                targetId: 'outline',
                policy: event.policy,
                ok: Boolean(event.result.ok),
              }
            }))
          }
          addOutlineTraceEvent({
            type: 'tool_call',
            level: event.result.ok ? 'info' : 'error',
            label: event.result.ok ? '工具调用完成' : '工具调用失败',
            detail: `${event.toolName}：${message}`
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
      callAi: params => aiService!.callAi(params),
    })
    const result = agentResult.result
    if (!result) throw new Error(agentResult.reason || 'Agent 编排器未返回 API 结果')
    outlineAgentTerminal = mapAgentResultToRunTrace({
      agentResult,
      executionPlan: outlineExecutionPlan,
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
      runTraceStore.updateApiCallToolSurface(outlineRunTraceId || '', traceApiCallId || '', {
        actualToolSurface: agentResult.toolSurface,
        permissionDecision: outlinePermissionDecision,
      })
    }
    plainAiResult = result
    const responseText = result.text || ''
    lastOutlineToolAudit = result.toolAudit
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
      convergenceReason: result.convergenceReason,
      usage: result.usage,
      durationMs: result.durationMs,
      error: plainOutcome.error,
      retryStrategy: result.retryStrategy,
      maxTokens: result.maxTokens,
      textOrigin: result.textOrigin,
      providerContextWindowTokens: result.contextBudget?.providerContextWindowTokens,
      estimatedInputTokens: result.contextBudget?.estimatedInputTokens,
      contextBudgetDecision: result.contextBudget?.decision,
      contextBudgetReason: result.contextBudget?.reason,
      usageReconciliation: result.usageReconciliation,
      toolAudit: result.toolAudit,
      executionSettlement,
      readLedger: getOutlineSessionReadLedger().snapshot(),
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
    if ((plainIntent === 'discuss' || plainIntent === 'analyze') && responseText.trim()) {
      const excerptAppended = activeExecutionTaskStore.appendAuthorizedExcerpt(
        'outline',
        outlineProjectId(),
        responseText,
      )
      const excerptObservation = activeExecutionTaskStore
        .consumeLastAuthorizedExcerptObservation()
      if (excerptAppended && excerptObservation) {
        addOutlineTraceEvent({
          type: 'authorized-plan-excerpt',
          level: excerptObservation.outcome === 'appended' ? 'info' : 'warn',
          label: excerptObservation.outcome === 'appended'
            ? '讨论回复已进入计划授权上下文'
            : '讨论回复未进入计划授权上下文',
          detail: JSON.stringify(excerptObservation),
        })
      }
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
      ...(compatibilityModeUsed ? { outlineCompatibilityMode: true } : {}),
      ...(pendingOutlineDeletionConfirmation.value ? { outlineDeletionConfirmation: {
        ...pendingOutlineDeletionConfirmation.value,
        status: 'requested' as const,
      } } : {}),
      ...pendingOutlineDirectWriteFields(),
    })
    plainAiTurnSucceeded = true
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
    const supervisorReason: string = toolRunSupervisor.reason || ''
    if (generationController?.signal.aborted || error?.name === 'AbortError' || error?.code === 'canceled') {
      if (supervisorReason === 'stuck_timeout' || supervisorReason === 'hard_deadline' || supervisorReason === 'repeated_tool_error') {
        finishOutlineApiCall(traceApiCallId, {
          status: 'failed',
          responseText: streamingContent.value || '',
          finishReason: supervisorReason,
          durationMs: Date.now() - requestStartedAt,
          error: toolRunSupervisorReadableMessage(supervisorReason),
        })
        const stallRetry = shouldRetryStalledDirectWrite({
          supervisorReason,
          intent: plainIntent,
          longDocument: isLongDocumentRequest,
          toolSurface: plainToolSurface,
        })
        if (stallRetry.retryable) {
          addOutlineTraceEvent({
            type: 'state-stuck-retry',
            level: 'warn',
            label: '编辑请求无进展，已自动隔离重试',
            detail: JSON.stringify({
              scope: stallRetry.scope || 'read-only-dialogue',
              authorizedTool: 'editor.write',
              inheritedSignal: false,
              inheritedTimeout: false,
              longDocumentRetry: false,
            })
          })
          generationController = new AbortController()
          cancelController = new AbortController()
          resetOutlineToolRunSupervisor()
          firstChunkSeen = false
          directStreamText = ''
          streamingContent.value = ''
          try {
            const retryTraceApiCallId = startOutlineApiCall({
              skillName: '直接对话·停滞重试',
              requestMessages: requestMessages.map(message => ({
                role: String(message.role || ''),
                content: String(message.content || '')
              })),
              model,
              intent: plainIntent,
              permissionDecision: outlinePermissionDecision,
              toolSurface: plainToolSurface,
              actualToolSurface: plainToolSurface,
            })
            const retryResult = await aiService!.callAi({
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
                  generationStatus.value = `重试已收到内容 · 首字节 ${Math.round(performance.now() - startedAt)}ms`
                } else {
                  generationStatus.value = '正在生成...'
                }
                void scrollToBottom()
              },
              retry: false,
              tools,
              timeoutMs: isLongDocumentRequest ? null : DIRECT_TOOL_RUN_HARD_DEADLINE_MS,
              onPhysicalCall: (event: PhysicalCallEvent) => {
                recordOutlinePhysicalCall(retryTraceApiCallId, event)
                if (physicalCallReportsProgress(event)) toolRunSupervisor.reportProgress()
              },
      toolPolicy: tools ? {
        scenario: 'direct-tool-intensive',
          maxToolIterations: calculateLongDocumentPhysicalRequestBudget(outlineExecutionPlan),
          toolRunBudget: outlineToolRunBudget,
                intent: plainIntent,
                permissionDecision: outlinePermissionDecision,
                onPermissionDenied: event => {
                  addOutlineTraceEvent({
                    type: 'tool-permission-denied',
                    level: 'error',
                    label: '工具写入权限拒绝',
                    detail: `${event.toolName}：${event.reason}`
                  })
                },
                onConvergenceStart: () => {
                  generationStatus.value = '正在生成...'
                  toolRunSupervisor.dispose()
                },
                onConvergencePseudoCall: event => {
                  addOutlineTraceEvent({
                    type: 'tool-convergence-pseudo-call',
                    level: 'warn',
                    label: '收敛回答疑似伪工具调用',
                    detail: event.text.slice(0, 2000)
                  })
                  const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
                  diag?.log?.('warn', 'tool/convergence-pseudo-call', '收敛回答疑似伪工具调用，已发起一次强纠正请求', {
                    workspace: 'outline',
                    text: event.text.slice(0, 2000),
                    reason: event.reason,
                  })
                },
                onConvergenceCorrected: () => {
                  addOutlineTraceEvent({
                    type: 'tool-convergence-corrected',
                    level: 'info',
                    label: '收敛回答已纠正为自然语言',
                    detail: '伪工具调用已被拦截，强纠正请求返回可用正文'
                  })
                  const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
                  diag?.log?.('info', 'tool/convergence-corrected', '收敛伪工具调用已通过强纠正请求修复')
                },
                onConvergenceLocalFallback: reason => {
                  addOutlineTraceEvent({
                    type: 'tool-convergence-local-fallback',
                    level: 'warn',
                    label: '收敛失败，返回本地摘要',
                    detail: reason
                  })
                  const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
                  diag?.log?.('warn', 'tool/convergence-local-fallback', '收敛请求未得到可用正文，已返回本地工具结果摘要', {
                    workspace: 'outline',
                    reason,
                  })
                },
                onToolStart: event => {
                  toolRunSupervisor.reportProgress()
                  if (!isAgentRuntimeToolName(event.toolName)) {
                    window.dispatchEvent(new CustomEvent('tool-activity', { detail: { type: 'tool_start', toolName: event.toolName, targetId: 'outline', policy: event.policy } }))
                  }
                },
                onToolCall: (event: OutlineToolCallEvent) => {
                  toolRunSupervisor.reportProgress()
                  if (!event.result.ok) toolRunSupervisor.reportToolError(
                    buildToolErrorKey(
                      event.toolName,
                      event.result.error?.code || event.result.error?.message,
                      event.input,
                    ),
                    3,
                    event.iteration,
                  )
                  recordOutlineToolCall(retryTraceApiCallId, event)
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
                  if (!isAgentRuntimeToolName(event.toolName)) {
                    window.dispatchEvent(new CustomEvent('tool-activity', {
                      detail: {
                        type: event.result.ok ? 'tool_result' : 'tool_error',
                        toolName: event.toolName,
                        targetId: 'outline',
                        policy: event.policy,
                        ok: Boolean(event.result.ok),
                      }
                    }))
                  }
                  addOutlineTraceEvent({
                    type: 'tool_call',
                    level: event.result.ok ? 'info' : 'error',
                    label: event.result.ok ? '工具调用完成' : '工具调用失败',
                    detail: `${event.toolName}：${message}`
                  })
                },
              } : undefined,
              meta: {
                source: 'OutlineWorkspace.askPlainAi.retry',
                workspace: 'outline',
                targetId: 'outline',
                readableTargets: ['outline', 'outline-settings'],
              },
            })
            const retryText = retryResult.text || ''
            plainAiResult = retryResult
            const retryOutcome = classifyRunOutcome({
              text: retryResult.text,
              reasoning: retryResult.reasoning,
              finishReason: retryResult.finishReason,
              usage: retryResult.usage,
              toolCalls: retryResult.toolCalls
            })
            finishOutlineApiCall(retryTraceApiCallId, {
              status: retryOutcome.status,
              responseText: retryText,
              reasoningText: retryResult.reasoning || '',
              finishReason: retryResult.finishReason,
              usage: retryResult.usage,
              durationMs: retryResult.durationMs,
              error: retryOutcome.error,
              retryStrategy: retryResult.retryStrategy,
              maxTokens: retryResult.maxTokens,
              providerContextWindowTokens: retryResult.contextBudget?.providerContextWindowTokens,
              estimatedInputTokens: retryResult.contextBudget?.estimatedInputTokens,
              contextBudgetDecision: retryResult.contextBudget?.decision,
              contextBudgetReason: retryResult.contextBudget?.reason,
              usageReconciliation: retryResult.usageReconciliation,
              toolAudit: retryResult.toolAudit
            })
            if (!retryText.trim()) {
              const retryEmptyMessage = '模型未响应（非权限问题）：重试仍无正文输出，请稍后重试或换用模型。'
              finishOutlineRun('failed', retryEmptyMessage, streamingContent.value, 'edit_retry_empty_response')
              projectStore.appendOutlineChat({ role: 'assistant', content: '生成失败：' + retryEmptyMessage })
            } else {
              await conversationContextService.recordTurn(contextRef!, {
                user: requestText,
                assistant: retryText,
                reservedOutputTokens: retryResult.maxTokens,
                meta: {
                  source: 'OutlineWorkspace.askPlainAi.retry',
                  model: retryResult.model || model,
                  providerId: retryResult.providerId,
                  toolCalls: retryResult.toolCalls?.length ? retryResult.toolCalls.map((call: { name: string }) => call.name).join(' → ') : undefined
                }
              })
              flushStreamingRender()
              projectStore.appendOutlineChat({
                role: 'assistant',
                content: retryText,
                ...(pendingOutlineDeletionConfirmation.value ? { outlineDeletionConfirmation: {
                  ...pendingOutlineDeletionConfirmation.value,
                  status: 'requested' as const,
                } } : {}),
                ...pendingOutlineDirectWriteFields(),
              })
              plainAiTurnSucceeded = true
            }
          } catch (retryError: any) {
            const activeTrace = (runTraceStore as any).activeTraces?.outline
            const openRetryCall = activeTrace?.apiCalls?.find((call: any) =>
              call.skillName === '直接对话·停滞重试' && call.status === 'running'
            )
            if (openRetryCall) {
              finishOutlineApiCall(openRetryCall.id, {
                status: 'failed',
                responseText: '',
                finishReason: toolRunSupervisor.reason || 'edit_retry_failed',
                durationMs: Date.now() - requestStartedAt,
                error: retryError?.message || String(retryError),
              })
            }
            const retryReadable = toolRunSupervisor.reason
              ? '模型未响应（非权限问题）：重试请求仍停滞，请稍后重试或换用模型。'
              : readableToolLoopError(retryError, plainAiResult?.finishReason)
            finishOutlineRun('failed', retryReadable, streamingContent.value, 'edit_retry_failed')
            projectStore.appendOutlineChat({ role: 'assistant', content: '生成失败：' + retryReadable })
          }
        } else {
          const supervisorMessage = toolRunSupervisorReadableMessage(supervisorReason)
          finishOutlineRun('failed', supervisorMessage, streamingContent.value, supervisorReason)
          projectStore.appendOutlineChat({ role: 'assistant', content: '生成失败：' + supervisorMessage })
        }
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
    const activeEditTask = outlineEditTaskSession.activeTask()
    if (useOutlineEditTaskPlan && activeEditTask?.status === 'awaiting_batch') {
      let finishedOutlineEditTask: EditTask | null = null
      const allBatchesWritten = activeEditTask.executedBatches.length > 0
        && activeEditTask.pendingBatches.length === 0
        && activeEditTask.failedBatchIds.length === 0
      const outlineCompletion = {
        target: {
          workspace: 'outline' as const,
          targetId: activeEditTask.target.targetId,
        },
          before: createOutlineRequestTarget()?.content ?? (projectStore.outlineText || ''),
        after: projectStore.outlineText || '',
      }
      if (!plainAiTurnSucceeded && allBatchesWritten) {
        const writtenCount = activeEditTask.executedBatches.length
        finishedOutlineEditTask = outlineEditTaskSession.finishActiveTask({
          succeeded: false,
          summaryFailed: true,
          completion: outlineCompletion,
        })
        projectStore.appendOutlineChat({
          role: 'assistant',
          content: `编辑任务已完成 ${writtenCount}/${writtenCount} 批写入；仅最终总结未生成。文档内容已落盘，可继续追问写入结果。`,
        })
        if (outlineRunTraceId && runTraceStore.getRun(outlineRunTraceId)?.status === 'running') {
          addOutlineTraceEvent({
            type: 'edit-task-summary-failed-content-verified',
            level: 'warn',
            label: '写入已完成，仅总结回复失败',
            detail: '所有计划批次已落盘；供应商总结请求失败，不视为写入失败',
          })
          finishOutlineRunIfRunning(
            'success',
            undefined,
            `编辑任务已完成 ${writtenCount}/${writtenCount} 批写入；仅最终总结未生成。文档内容已落盘。`,
            'edit_task_written_summary_failed',
          )
        }
      } else {
        finishedOutlineEditTask = outlineEditTaskSession.finishActiveTask({
          succeeded: plainAiTurnSucceeded,
          completion: outlineCompletion,
        })
      }
      reportOutlineEditTaskCompletion(outlineEditTaskSession.completionReport())
      const completionReport = outlineEditTaskSession.completionReport()
      const finalOutlineEditTask = finishedOutlineEditTask || outlineEditTaskSession.activeTask()
      if (outlineAgentTerminal) {
        const mergedOutlineTerminal = mergeEditTaskTerminal({
          agentTerminal: outlineAgentTerminal,
          originalExecutionPlan: activeOutlineExecutionPlan ?? undefined,
          editTask: finalOutlineEditTask,
          completionReport,
        })
        if (mergedOutlineTerminal.override) {
          addOutlineTraceEvent({
            type: 'edit-task-terminal-override',
            level: 'warn',
            label: '动态批次完成度覆盖旧计划口径',
            detail: `EditTask 已完成并通过内容级校验；${mergedOutlineTerminal.evidenceReason}`,
          })
        }
        outlineAgentTerminal = mergedOutlineTerminal.terminal
      }
      if (completionReport && !completionReport.verified) {
        projectStore.appendOutlineChat({
          role: 'assistant',
          content: `编辑任务完成度校验未通过：${completionReport.violations.map(item => item.message).join('；')}`,
        })
      }
    }
    pendingOutlineDirectWrite.value = null
    if (outlineRunTraceId) {
      const outlineTerminal = outlineAgentTerminal
        || { status: 'success' as RunTraceStatus, reason: 'plain_dialogue_complete' }
      finishOutlineRunIfRunning(outlineTerminal.status, undefined, streamingContent.value, outlineTerminal.reason)
    }
    generationController = null
    cancelController = null
    isGenerating.value = false
    activeOutlineExecutionPlan = null
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
  outlineInputUnlockedByAgent.value = false
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
      onProviderQueue: event => recordOutlineProviderQueue(traceApiCallId, event),
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
  lastOutlineToolAudit = undefined
  activeExecutionTaskStore.clear('outline', outlineProjectId())
  activeOutlineExecutionPlan = null
    try {
    projectStore.outlineChat = []
    await nextTick()
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
  height: var(--density-form-height);
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
  height: var(--density-form-height);
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
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  white-space: nowrap;
}
.ow-chat-toggle:hover {
  background: var(--accent);
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
}
.ow-textarea.ow-readonly {
  background: var(--bg-secondary);
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
.ow-multi-cursor-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 5;
}

.ow-multi-cursor {
  position: absolute;
  width: 2px;
  background: var(--accent, #2563eb);
}

.ow-multi-cursor-primary {
  box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.35);
}

.ow-viewport-highlight-layer {
  position: absolute;
  pointer-events: none;
  border-radius: var(--radius-xs);
}
.ow-viewport-highlight-layer.editor-viewport-highlight {
  background: color-mix(in srgb, var(--accent) 22%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 50%, transparent);
}
.ow-viewport-highlight-layer.editor-viewport-active-line {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 38%, transparent);
}

.ow-compatibility-mode {
  display: grid;
  gap: var(--space-1);
  margin-top: 8px;
  padding: var(--space-4) var(--space-5);
  border-left: 3px solid var(--warning);
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
  height: var(--density-form-height);
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
.ow-find-option {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  white-space: nowrap;
  user-select: none;
}
.ow-find-option input {
  accent-color: var(--primary);
  margin: 0;
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
.ow-live-status-line {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ow-live-status-line.is-retrying {
  color: var(--warning);
}
.ow-live-status-line.is-terminal {
  color: var(--text-secondary);
}
.ow-msg-streaming .ow-msg-bubble {
  min-height: 24px;
}
.ow-source-contamination .ow-msg-bubble {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  max-width: 100%;
  color: var(--text-secondary);
}
.ow-source-contamination span {
  min-width: 0;
  flex: 1 1 auto;
  overflow-wrap: anywhere;
}
.ow-source-contamination button {
  flex: 0 0 auto;
  min-height: var(--density-btn-sm-height);
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xs);
  background: var(--bg-input);
  color: var(--text-secondary);
  cursor: pointer;
}
.ow-msg-actions {
  display: flex;
  gap: var(--space-2);
  margin-top: 6px;
  padding-left: 2px;
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
.ow-final-draft-stalled {
  color: var(--warning, #d97706);
  font-weight: 600;
}
.ow-routing-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.ow-final-draft-provider-select {
  max-width: 100%;
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: var(--font-size-sm);
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
  height: var(--density-btn-sm-height);
  transition: var(--transition-fast);
}
.msg-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.msg-btn.is-stalled {
  border-color: var(--warning, #d97706);
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
  height: var(--density-btn-sm-height);
  padding: 0 var(--space-3);
  background: var(--bg-secondary);
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
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
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
.ow-batch-diff { margin-top: var(--space-2); }
</style>

