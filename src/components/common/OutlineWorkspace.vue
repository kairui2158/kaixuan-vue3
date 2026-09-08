<template>
  <div id="outline-workspace" class="ow-overlay" @click.self="$emit('close')">
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
        </div>
        <div v-show="chatAreaOpen" class="ow-chat">
          <div id="ow-chat-messages" ref="msgContainer" class="ow-messages">
            <div v-if="compatibilityNotice" id="ow-compatibility-notice" class="ow-msg assistant">
              <div class="ow-msg-bubble">{{ compatibilityNotice }}</div>
            </div>
            <div v-for="(msg, i) in messages" :key="i" class="ow-msg" :class="msg.role">
              <div class="ow-msg-bubble" v-html="renderMarkdown(msg.content)"></div>
              <RealSkillDiagnosticsPanel
                v-if="msg.role === 'assistant' && msg.skillRunDiagnostics"
                :status="msg.skillRunDiagnostics.status"
                :diagnostics="msg.skillRunDiagnostics.diagnostics"
                :request-messages="msg.skillRunDiagnostics.requestMessages"
                :budget="msg.skillRunDiagnostics.budget"
                :from-cache="msg.skillRunDiagnostics.fromCache"
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
              <div v-if="msg.role === 'assistant' && msg.outlineEdit" class="ow-edit-command" title="已识别为待确认的大纲编辑指令">
                已识别编辑指令：{{ msg.outlineEdit.operation }}<span v-if="msg.outlineEdit.target"> · {{ msg.outlineEdit.target }}</span>
                <button class="msg-btn" @click="previewCommand(msg.outlineEdit)">预览修改</button>
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
              <div class="ow-msg-bubble" v-html="streamingRenderedContent || '正在等待 API 返回...'"></div>
            </div>
          </div>
          <div v-if="pendingEdit" id="ow-edit-preview" class="ow-edit-preview">
            <div class="ow-edit-preview-title">待确认的大纲修改</div>
            <div class="ow-edit-preview-meta">{{ pendingEdit.operation }}<span v-if="pendingEdit.target"> · 目标：{{ pendingEdit.target }}</span></div>
            <pre class="ow-edit-preview-content">{{ previewText }}</pre>
            <div class="ow-edit-preview-actions">
              <button id="btn-ow-apply-edit" class="btn-sm btn-primary" @click="applyPendingEdit">确认修改</button>
              <button id="btn-ow-cancel-edit" class="btn-sm btn-secondary" @click="pendingEdit = null">取消</button>
            </div>
          </div>
          <div class="ow-input-row">
            <input
              id="ow-chat-input"
              v-model="inputText"
              class="ow-input"
              placeholder="和AI讨论大纲..."
              @keydown.enter="sendMessage"
            />
            <button
              v-if="isGenerating"
              id="btn-ow-cancel-generation"
              class="btn-send btn-cancel"
              title="取消当前生成"
              @click="cancelGeneration"
            >取消生成</button>
            <button v-else id="btn-ow-send" class="btn-send" @click="sendMessage">发送</button>
          </div>
          <div
            v-for="msg in outlineBatchMessages"
            :key="'batch-' + msg.index"
            class="ow-edit-command"
            title="已识别为待确认的大纲批量编辑"
          >
            已识别批量编辑：{{ msg.outlineBatch.commands.length }} 条
            <button class="msg-btn" @click="previewOutlineBatch(msg.outlineBatch, msg.outlineBatchTarget)">预览修改</button>
            <button
              v-if="canRollbackOutlineBatch(msg.outlineBatchRecord)"
              class="msg-btn"
              :disabled="isGenerating"
              title="恢复该批次应用前的大纲"
              @click="rollbackOutlineBatch(msg.index)"
            >回滚此批次</button>
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
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useProjectStore } from '../../stores/project'
import { useProviderStore } from '../../stores/provider'
import { usePipelineStore } from '../../stores/pipeline'
import { useSkillStore } from '../../stores/skill'
import { useAgentStore } from '../../stores/agent'
import { migrateSkillAgentBindings } from '../../services/skillAgentBinding'
import { runWorkspaceSkills, type WorkspaceSkillEngineAdapter, type WorkspaceSkillRunMeta, type WorkspaceSkillTemplate } from '../../services/workspaceSkillEngine'
import RealSkillDiagnosticsPanel from './RealSkillDiagnosticsPanel.vue'
import { createApiCallBudget } from '../../services/apiCallBudget'
import { importFile } from '../../services/file-import'
import { useAiTools } from '../../composables/useAiTools'
import { useAppConfirm } from '../../composables/useAppConfirm'
import { getAiService } from '../../services/aiService'
import { conversationContextService } from '../../services/conversationContextService'
import { canContinue, continuationStatusFor, type ContinuationSnapshot } from '../../services/continuation'
import { continueSnapshot } from '../../services/continuationService'
import { saveContinuation, loadContinuation, removeContinuation } from '../../services/continuationStorage'
import { logEditorEdit } from '../../services/editorEditDiagnostics'
import { buildEditorEditPrompt, parseEditorEditBatch, parseEditorEditCommand, type EditorEditBatchCommand, type EditorEditCommand } from '../../services/editorEditProtocol'
import { applyAcceptedItems, planEditorEditBatch, type EditorEditBatchPlan } from '../../services/editorEditBatch'
import { canRollbackEditorBatch, createEditorBatchRecord, findEditorBatchUndoContent, normalizeEditorBatchRecord, updateEditorBatchRecord } from '../../services/editorBatchRecord'
import { createEditorTargetSnapshot, validateEditorTarget } from '../../services/editorTarget'
import { createEditorTools } from '../../services/editorTools'
import type { EditorToolPlan } from '../../stores/chat'
import type { ContextMessage } from '../../types/context'
import { enhanceCodeBlocks, renderMarkdown as renderMarkdownText } from '../../utils/markdownService'
import { useThrottledMarkdown } from '../../utils/throttledMarkdown'

const emit = defineEmits<{ close: []; navigate: [target: string] }>()

const projectStore = useProjectStore()
const appConfirm = useAppConfirm()
const providerStore = useProviderStore()
const pipelineStore = usePipelineStore()
const skillStore = useSkillStore()
const agentStore = useAgentStore()
const { callAi } = useAiTools()

const messages = computed(() => projectStore.outlineChat)
type OutlineBatchTargetMeta = {
  workspace: 'outline'
  targetId: 'outline'
  contentHash: string
}

const inputText = ref('')
const msgContainer = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const editorRef = ref<HTMLTextAreaElement | null>(null)
const chatAreaOpen = ref(false)
const isFullscreen = ref(false)
const saveFeedback = ref('')
const lastUserRequest = ref('')
const compatibilityNotice = ref('')
const pendingOutlineBatchMessage = ref<number | null>(null)

const OUTLINE_WORKSPACE_ID = 'outline'
const OUTLINE_SESSION_ID = 'outline'
let lastWorkspaceSkillMeta: WorkspaceSkillRunMeta | null = null

function outlineProjectId() {
  return String(projectStore.currentProjectId || 'default')
}

function isTruncationReason(reason?: string) {
  return reason === 'length' || reason === 'timeout' || reason === 'network_error' || reason === 'canceled'
}

function buildOutlineFallbackMessages(requestText: string) {
  return [
    { role: 'system', content: buildOutlineSystemPrompt() },
    { role: 'user', content: '当前大纲:\n' + (projectStore.outlineText || '') + '\n\n用户请求: ' + requestText }
  ]
}

function buildOutlineSystemPrompt() {
  return [
    '你是小说大纲创作助手。用户正在编辑大纲，请给出建议和修改意见。',
    buildEditorEditPrompt({
      workspace: 'outline',
      label: '大纲编辑器',
      content: projectStore.outlineText || '',
      selectedText: getCurrentOutlineSelection()
    })
  ].join('\n\n')
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

function extractOutlineToolEditBatch(toolCalls: Array<{ name: string; input: unknown }> | undefined): EditorEditBatchCommand | null {
  if (!toolCalls?.length) return null
  for (let index = toolCalls.length - 1; index >= 0; index--) {
    const call = toolCalls[index]
    if (call.name !== 'editor.propose_edits') continue
    const input = call.input as { commands?: unknown; reason?: unknown }
    if (!Array.isArray(input?.commands) || input.commands.length === 0) continue
    return {
      type: 'editor_edit_batch',
      version: 1,
      commands: input.commands as EditorEditCommand[],
      reason: typeof input.reason === 'string' ? input.reason : undefined
    }
  }
  return null
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
    originalMessages: options.requestMessages,
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
const pendingEdit = ref<OutlineEditCommand | null>(null)
const pendingBatch = ref<EditorEditBatchPlan | null>(null)
const undoStack = ref<string[]>([])
const redoStack = ref<string[]>([])
const isGenerating = ref(false)
const generationStatus = ref('')
const streamingContent = ref('')
const toolStreamOpen = ref<Record<number, boolean>>({})

function toggleToolStream(index: number) {
  toolStreamOpen.value[index] = !toolStreamOpen.value[index]
}
const { content: streamingRenderedContent, flush: flushStreamingRender } = useThrottledMarkdown(streamingContent)
let generationController: AbortController | null = null
let lastEditorHistoryAt = 0
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

const outlineBatchMessages = computed(() => messages.value
  .map((message, index) => ({ message, index }))
  .filter(item => item.message.role === 'assistant' && item.message.outlineBatch)
  .map(item => ({
    index: item.index,
    outlineBatch: item.message.outlineBatch as EditorEditBatchCommand,
    outlineBatchTarget: item.message.outlineBatchTarget as OutlineBatchTargetMeta | undefined,
    outlineBatchRecord: item.message.outlineBatchRecord
  })))

function hashOutlineContent(content: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < content.length; index++) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return 'fnv1a32_' + hash.toString(16).padStart(8, '0')
}

function createOutlineBatchTargetMeta(): OutlineBatchTargetMeta {
  return {
    workspace: 'outline',
    targetId: 'outline',
    contentHash: hashOutlineContent(projectStore.outlineText || '')
  }
}

function isOutlineTargetChanged(meta: OutlineBatchTargetMeta | undefined): boolean {
  if (!meta) return false
  return meta.contentHash !== hashOutlineContent(projectStore.outlineText || '')
}

function canRollbackOutlineBatch(record: unknown) {
  const normalized = normalizeEditorBatchRecord(record)
  return !!normalized && normalized.status === 'applied' && normalized.undoAvailable === true
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
    }))
}

function getOutlineContextMessages(currentRequest: string): ContextMessage[] {
  const source = messages.value
    .filter(message => (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string' && message.content.trim())
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

function createWorkspaceSkillAdapter(): WorkspaceSkillEngineAdapter {
  return {
    workspace: 'outline',
    source: 'OutlineWorkspace.skill',
    projectId: outlineProjectId(),
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
      memories: JSON.stringify(projectStore.memories)
    }),
    getLegacyMessages: requestText => getOutlineContextMessages(requestText).slice(-DEFAULT_SKILL_HISTORY_TURNS * 2),
    loadBreakpoint: () => pipelineStore.refreshBreakpoint(),
    saveBreakpoint: breakpoint => pipelineStore.saveBreakpoint(breakpoint),
    clearBreakpoint: () => pipelineStore.clearBreakpoint()
  }
}

onMounted(async () => {
  await restoreOutlineContinuation()
  const config = await pipelineStore.readStepConfig(0)
  workspaceAgentId.value = config.agentId
  workspaceSkillIds.value = config.skillIds
  workspaceSkillMode.value = config.mode
  workspaceSkillAgents.value = migrateSkillAgentBindings(config.skillAgents, { 0: config.skillIds })
  window.addEventListener('diff-locate', handleDiffLocate)
  window.addEventListener('diff-closed', handleDiffClosed)
  window.addEventListener('diff-applied', handleDiffApplied)
})

onUnmounted(() => {
  window.removeEventListener('diff-locate', handleDiffLocate)
  window.removeEventListener('diff-closed', handleDiffClosed)
  window.removeEventListener('diff-applied', handleDiffApplied)
})

function handleDiffLocate(event: Event) {
  const detail = (event as CustomEvent).detail
  if (!detail || detail.workspace !== 'outline' || !editorRef.value) return
  const start = Math.max(0, Number(detail.range?.start) || 0)
  const end = Math.max(start, Number(detail.range?.end) || start)
  editorRef.value.focus()
  editorRef.value.setSelectionRange(start, end)
  const linesBefore = editorRef.value.value.substring(0, start).split('\n').length
  editorRef.value.scrollTop = Math.max(0, (linesBefore - 3) * 29)
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

function parseOutlineEditCommand(raw: string): OutlineEditCommand | null {
  const command = parseEditorEditCommand(raw)
  if (!command) return null
  return {
    type: 'outline_edit',
    operation: command.operation === 'replace_match' ? 'replace_section' : command.operation,
    content: command.content,
    target: command.target,
    position: command.position,
    reason: command.reason
  }
}

const previewText = computed(() => {
  if (!pendingEdit.value) return ''
  const command = pendingEdit.value
  if (command.operation === 'delete') return `删除目标：${command.target}`
  return command.content || ''
})

function previewCommand(command: OutlineEditCommand) {
  pendingEdit.value = command
}

function previewOutlineBatch(batch: EditorEditBatchCommand, targetMeta?: OutlineBatchTargetMeta) {
  if (isOutlineTargetChanged(targetMeta)) {
    pendingBatch.value = null
    pendingEdit.value = null
    logEditorEdit({
      requestId: `outline-edit_${Date.now()}`,
      batchId: `outline-batch_${Date.now()}`,
      workspace: 'outline',
      tabId: 'outline',
      operation: 'editor_edit_batch',
      result: 'rejected',
      targetLength: (projectStore.outlineText || '').length,
      contentLength: batch.commands.reduce((sum, command) => sum + (command.content?.length || 0), 0),
      failureReason: 'version_changed',
      durationMs: 0,
      detail: '大纲批次生成后内容已手动修改，请重新生成编辑建议'
    })
    window.dispatchEvent(new CustomEvent('show-diff', {
      detail: {
        original: projectStore.outlineText || '',
        modified: projectStore.outlineText || '',
        editMeta: {
          workspace: 'outline',
          targetId: 'outline',
          targetLabel: '大纲编辑器',
          operationLabel: `大纲批量编辑（${batch.commands.length} 项）`,
          failureReason: 'version_changed',
          dangerous: false,
          batchItems: []
        }
      }
    }))
    void appConfirm.alert('大纲内容已手动修改，请重新生成编辑建议')
    return
  }
  const target = createOutlineRequestTarget()
  const record = normalizeEditorBatchRecord(outlineBatchMessages.value.find(item => item.outlineBatch === batch)?.outlineBatchRecord)
  const plan = planEditorEditBatch(batch, target, {
    content: projectStore.outlineText || '',
    locked: projectStore.outlineLocked
  }, { batchId: record?.batchId })
  pendingBatch.value = plan
  pendingEdit.value = null
  pendingOutlineBatchMessage.value = outlineBatchMessages.value.find(item => item.outlineBatch === batch)?.index ?? null
  logEditorEdit({
    requestId: `outline-edit_${Date.now()}`,
    batchId: plan.batchId,
    workspace: 'outline',
    tabId: 'outline',
    operation: 'editor_edit_batch',
    result: plan.ok ? 'parsed' : 'rejected',
    targetLength: target.content.length,
    contentLength: plan.items.reduce((sum, item) => sum + (item.command.content?.length || 0), 0),
    failureReason: plan.failureReason,
    durationMs: 0,
    detail: plan.ok ? `大纲批次包含 ${plan.items.length} 条编辑，等待用户预览确认` : '大纲批次规划失败：' + plan.failureReason
  })
  window.dispatchEvent(new CustomEvent('show-diff', {
    detail: {
      original: plan.original,
      modified: plan.ok ? plan.next : plan.original,
      editMeta: {
        workspace: 'outline',
        targetId: 'outline',
        targetLabel: '大纲编辑器',
        operationLabel: `大纲批量编辑（${batch.commands.length} 项）`,
        failureReason: plan.ok ? undefined : plan.failureReason,
        dangerous: plan.items.some(item => item.command.operation === 'rewrite' || item.command.operation === 'delete'),
        batchItems: plan.items.map(item => ({
          index: item.index,
          label: item.command.operation + (item.command.target ? `：${item.command.target}` : ''),
          reason: item.command.reason,
          dangerous: item.command.operation === 'rewrite' || item.command.operation === 'delete',
          range: item.plan.range
        }))
      }
    }
  }))
}

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

function handleDiffClosed() {
  pendingBatch.value = null
  pendingOutlineBatchMessage.value = null
}

function applyPendingEdit() {
  const command = pendingEdit.value
  const current = projectStore.outlineText || ''
  if (!command) return
  if (projectStore.outlineLocked) {
    logEditorEdit({
      requestId: `outline-edit_${Date.now()}`,
      workspace: 'outline',
      tabId: 'outline',
      operation: command.operation,
      result: 'rejected',
      targetLength: current.length,
      contentLength: command.content?.length,
      failureReason: 'locked',
      durationMs: 0,
      detail: '大纲已锁定，编辑指令未写入'
    })
    return
  }
  let next = current
  if (command.operation === 'append') {
    next = current + (current ? '\n' : '') + (command.content || '')
  } else if (command.operation === 'insert') {
    insertAtCursor(command.content || '')
    pendingEdit.value = null
    return
  } else if (command.operation === 'replace_selection') {
    const ta = editorRef.value
    if (!ta || ta.selectionStart === ta.selectionEnd) {
      saveFeedback.value = '[提示] 请先在编辑器中框选要替换的内容'
      setTimeout(() => { saveFeedback.value = '' }, 2500)
      return
    }
    next = current.slice(0, ta.selectionStart) + (command.content || '') + current.slice(ta.selectionEnd)
  } else if (command.operation === 'replace_section' || command.operation === 'rewrite') {
    if (!command.target) return
    if (!current.includes(command.target)) {
      saveFeedback.value = '[提示] 未找到目标内容，未执行修改'
      setTimeout(() => { saveFeedback.value = '' }, 2500)
      return
    }
    next = current.replace(command.target, command.content || '')
  } else if (command.operation === 'delete') {
    if (!command.target || !current.includes(command.target)) {
      saveFeedback.value = '[提示] 未找到删除目标，未执行修改'
      setTimeout(() => { saveFeedback.value = '' }, 2500)
      return
    }
    next = current.replace(command.target, '')
  }
  if (!commitOutlineChange(next)) return
  pendingEdit.value = null
  logEditorEdit({
    requestId: `outline-edit_${Date.now()}`,
    workspace: 'outline',
    tabId: 'outline',
    operation: command.operation,
    result: 'applied',
    targetLength: current.length,
    contentLength: command.content?.length,
    durationMs: 0,
    detail: '用户确认后已写入大纲编辑器'
  })
  saveFeedback.value = '[OK] 已应用大纲修改'
  setTimeout(() => { saveFeedback.value = '' }, 2500)
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

  try {
    const decomposePrompt =
      '请从以下小说大纲中提取设定信息，根据大纲内容自行决定需要哪些分类（如角色、世界观、物种、物品、势力、地理、魔法体系、技术、组织等），不要限定在固定分类里。\n返回JSON数组，每项包含 category、name、content 字段。只返回JSON数组，不要其他文字。\n\n大纲：\n' +
      outline
    const decomposeResult = await callAi(
      decomposePrompt,
      '你是专业的小说设定编辑，擅长从大纲中提取各类设定信息，能根据大纲内容灵活判断需要哪些分类。'
    )
    parseDecomposedSettings(decomposeResult)
  } catch (e) {
    console.warn('[OutlineWorkspace] 设定自动拆解失败:', e)
  }

  try {
    const foreshadowPrompt =
      '请从以下小说大纲中识别所有的伏笔（铺垫、暗示、悬念、未解之谜等）。\n返回JSON数组，每项包含 name、content 字段。只返回JSON数组，不要其他文字。\n\n大纲：\n' +
      outline
    const foreshadowResult = await callAi(
      foreshadowPrompt,
      '你是专业的小说结构分析师，擅长识别伏笔和铺垫。'
    )
    parseForeshadows(foreshadowResult)
  } catch (e) {
    console.warn('[OutlineWorkspace] 伏笔提取失败:', e)
  }
}

function parseDecomposedSettings(raw: string | null) {
  if (!raw) return
  const items = extractJsonArray(raw)
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
  const items = extractJsonArray(raw)
  if (!items || items.length === 0) return

  const category = '伏笔'
  const currentCats = projectStore.memories.categories.includes(category)
    ? projectStore.memories.categories
    : [...projectStore.memories.categories, category]
  const currentItems = [...projectStore.memories.items]
  for (const item of items) {
    if (!item.name) continue
    currentItems.push({
      key: item.name,
      category,
      content: item.content || ''
    })
  }
  projectStore.memories.categories = currentCats
  projectStore.memories.items = currentItems
  projectStore.saveProject()
}

function extractJsonArray(text: string): any[] | null {
  if (!text) return null
  let cleaned = text.trim()
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) cleaned = fenceMatch[1].trim()
  try {
    const d = JSON.parse(cleaned)
    if (Array.isArray(d)) return d
    if (d && typeof d === 'object') return [d]
  } catch {}
  const firstBracket = cleaned.indexOf('[')
  const lastBracket = cleaned.lastIndexOf(']')
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    const sub = cleaned.substring(firstBracket, lastBracket + 1)
    try {
      const v = JSON.parse(sub)
      if (Array.isArray(v)) return v
    } catch {}
  }
  return null
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

async function askAi(requestText: string) {
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
  const systemPrompt = buildOutlineSystemPrompt()
  const fallbackMessages = buildOutlineFallbackMessages(requestText)
  generationController = new AbortController()
  isGenerating.value = true
  generationStatus.value = '正在连接 API...'
  streamingContent.value = ''
  const startedAt = performance.now()
  let firstChunkSeen = false
  try {
    const aiService = await getAiService()
    let responseText = ''
    const result = await runWorkspaceSkills({
      requestText,
      templates,
      mode: workspaceSkillMode.value,
      aiService,
      contextService: conversationContextService,
      adapter: createWorkspaceSkillAdapter(),
      signal: generationController?.signal,
      apiBudget: createApiCallBudget(8),
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
          void scrollToBottom()
        }
      }
    })
    responseText = result.text
    lastWorkspaceSkillMeta = result.meta
    const skillRunDiagnostics = result.meta && (result.meta.diagnostics?.length || result.meta.status === 'degraded')
      ? {
          status: result.meta.status || 'success',
          diagnostics: result.meta.diagnostics || [],
          requestMessages: result.meta.requestMessages,
          budget: result.meta.budget,
          fromCache: result.meta.fromCache
        }
      : null
    if (!responseText.trim()) throw new Error('API 返回为空')
    flushStreamingRender()
    const requestTarget = createOutlineRequestTarget()
    const outlineBatchTarget = createOutlineBatchTargetMeta()
    const editCommand = parseOutlineEditCommand(responseText)
    const editBatch = parseEditorEditBatch(responseText)
    logEditorEdit({
      requestId: `outline-edit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      workspace: 'outline',
      tabId: 'outline',
      operation: editBatch ? 'editor_edit_batch' : editCommand?.operation,
      result: editBatch || editCommand ? 'parsed' : 'no_edit',
      targetLength: (projectStore.outlineText || '').length,
      contentLength: editBatch
        ? editBatch.commands.reduce((sum, command) => sum + (command.content?.length || 0), 0)
        : editCommand?.content?.length,
      durationMs: Math.round(performance.now() - startedAt),
      detail: editBatch
        ? `大纲响应已解析为 ${editBatch.commands.length} 条批量编辑指令，等待用户预览确认`
        : editCommand ? '大纲响应已解析为编辑指令，等待用户预览确认' : '普通大纲响应，未识别编辑指令'
    })
    projectStore.appendOutlineChat({
      role: 'assistant',
      content: responseText,
      ...(skillRunDiagnostics ? { skillRunDiagnostics } : {}),
      ...(editBatch ? { outlineBatch: editBatch } : {}),
      ...(editBatch ? { outlineBatchTarget } : {}),
      ...(editBatch ? {
        outlineBatchRecord: createEditorBatchRecord({
          workspace: 'outline',
          targetId: 'outline',
          batch: editBatch,
          sourceContent: projectStore.outlineText || ''
        })
      } : {}),
      ...(editCommand ? { outlineEdit: editCommand } : {})
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
      projectStore.appendOutlineChat({ role: 'assistant', content: '生成失败：' + (e.message || '未知错误') })
    }
  } finally {
    generationController = null
    isGenerating.value = false
    if (generationStatus.value !== '已取消生成') generationStatus.value = ''
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

let applyingOutlineBatch = false
function handleDiffApplied(event: Event) {
  const detail = (event as CustomEvent).detail
  const plan = pendingBatch.value
  const messageIndex = pendingOutlineBatchMessage.value
  const pendingRecord = messageIndex !== null
    ? normalizeEditorBatchRecord(messages.value[messageIndex]?.outlineBatchRecord)
    : null
  if (applyingOutlineBatch || !plan || typeof detail?.text !== 'string') return
  const validation = validateEditorTarget(plan.snapshot, {
    content: projectStore.outlineText || '',
    locked: projectStore.outlineLocked
  })
  if (!validation.valid) {
    pendingBatch.value = null
    logEditorEdit({
      requestId: `outline-edit_${Date.now()}`,
      workspace: 'outline',
      tabId: 'outline',
      result: 'rejected',
      targetLength: plan.original.length,
      failureReason: validation.reason,
      durationMs: 0,
      detail: '大纲批次确认时目标已变化，拒绝写入'
    })
    void appConfirm.alert('大纲目标已变化，请重新生成或预览编辑批次')
    return
  }

  applyingOutlineBatch = true
  try {
    let nextText = detail.text
    if (Array.isArray(detail.acceptedIndexes)) {
      const replanned = applyAcceptedItems(plan, detail.acceptedIndexes)
      if (!replanned.ok) {
        pendingBatch.value = null
        void appConfirm.alert('部分大纲命令被拒绝后无法重新规划，请重新发起编辑请求')
        return
      }
      nextText = replanned.next
    }
    if (!commitOutlineChange(nextText)) {
      pendingBatch.value = null
      pendingOutlineBatchMessage.value = null
      return
    }
    const rejectedIndexes = Array.isArray(detail.acceptedIndexes)
      ? plan.items
        .map(item => item.index)
        .filter(index => !(detail.acceptedIndexes as number[]).includes(index))
      : undefined
    if (pendingRecord && messageIndex !== null) {
      projectStore.updateOutlineChatAt(messageIndex, {
        outlineBatchRecord: updateEditorBatchRecord(pendingRecord, {
          status: 'applied',
          appliedContentHash: hashOutlineContent(nextText),
          appliedAt: Date.now(),
          undoAvailable: true,
          acceptedIndexes: Array.isArray(detail.acceptedIndexes) ? [...detail.acceptedIndexes] : undefined,
          rejectedIndexes
        })
      })
    }
    pendingBatch.value = null
    pendingOutlineBatchMessage.value = null
    logEditorEdit({
      requestId: `outline-edit_${Date.now()}`,
      workspace: 'outline',
      tabId: 'outline',
      operation: 'editor_edit_batch',
      result: 'applied',
      targetLength: plan.original.length,
      contentLength: Math.max(0, nextText.length - plan.original.length),
      durationMs: 0,
      detail: '用户确认后已按批次写入大纲编辑器'
    })
    if (pendingRecord) {
      void conversationContextService.recordEditorEvent({
        projectId: String(projectStore.currentProjectId || 'default'),
        workspace: 'outline',
        purpose: 'generate'
      }, '已应用大纲 AI 编辑批次', {
        batchId: pendingRecord.batchId,
        commandCount: pendingRecord.commandCount,
        targetId: 'outline',
        status: 'applied',
        acceptedIndexes: Array.isArray(detail.acceptedIndexes) ? [...detail.acceptedIndexes] : undefined,
        rejectedIndexes
      }).catch(error => console.error('[OUTLINE] 记录 AI 批次应用上下文失败', error))
    }
    saveFeedback.value = '[OK] 已应用大纲批量修改'
    setTimeout(() => { saveFeedback.value = '' }, 2500)
  } finally {
    applyingOutlineBatch = false
  }
}

async function askPlainAi(requestText: string) {
  const provider = providerStore.activeGenerateProvider
  if (!provider) {
    projectStore.appendOutlineChat({ role: 'assistant', content: '请先配置API供应商' })
    await scrollToBottom()
    return
  }
  const model = provider.selectedModel || provider.models?.[0] || 'gpt-4o'
  const systemPrompt = buildOutlineSystemPrompt()
  const aiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.value.filter(item => item.content).map(item => ({ role: item.role, content: item.content })),
    { role: 'user', content: '当前大纲:\n' + (projectStore.outlineText || '') + '\n\n用户请求: ' + requestText }
  ]
  let requestMessages: Array<{ role: string; content: string }> = []
  generationController = new AbortController()
  isGenerating.value = true
  generationStatus.value = '正在连接 API...'
  streamingContent.value = ''
  const startedAt = performance.now()
  let firstChunkSeen = false
  let latestOutlineToolPlan: EditorToolPlan | null = null
  const latestOutlineToolCallStream: Array<{ type: string; toolName: string; stepDescription: string; targetId?: string; iteration: number; ok: boolean }> = []
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
        selectedText: getCurrentOutlineSelection(),
        activeTab: '大纲编辑器',
        settings: projectStore.settingsCollection,
        memories: JSON.stringify(projectStore.memories)
      },
      legacyMessages: getOutlineContextMessages(requestText)
    })
    requestMessages = conversationContextService.assembleMessages(
      contextBundle,
      conversationContextService.getPolicy('generate'),
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: '用户请求: ' + requestText }
      ]
    )
    const requestTarget = createOutlineRequestTarget()
    const outlineBatchTarget = createOutlineBatchTargetMeta()
    const tools = requestTarget.content
      ? createEditorTools({
        getSnapshot: () => (pendingBatch.value ? pendingBatch.value.snapshot : requestTarget),
        onPlanUpdate: (plan) => {
          latestOutlineToolPlan = plan
        }
      })
      : undefined
    const result = await aiService.callAi({
      purpose: 'generate',
      messages: requestMessages,
      model,
      signal: generationController.signal,
      onChunk: (text: string) => {
        streamingContent.value = text
        if (!firstChunkSeen) {
          firstChunkSeen = true
          generationStatus.value = `已收到内容 · 首字节 ${Math.round(performance.now() - startedAt)}ms`
        } else {
          generationStatus.value = '正在生成...'
        }
        void scrollToBottom()
      },
      retry: true,
      tools,
      toolPolicy: tools ? {
        maxToolIterations: 6,
        maxWriteProposals: 1,
        onToolStart: (event) => {
          window.dispatchEvent(new CustomEvent('tool-activity', { detail: { type: 'tool_start', toolName: event.toolName, targetId: 'outline', policy: event.policy } }))
          latestOutlineToolCallStream.push({
            type: 'tool_start',
            toolName: event.toolName,
            stepDescription: `正在执行 ${event.toolName}…`,
            targetId: 'outline',
            iteration: event.iteration,
            ok: true,
          })
        },
        onCompatibilityMode: () => {
          compatibilityNotice.value = '当前供应商未启用原生工具调用，已使用兼容模式'
        }
      } : undefined,
      meta: { source: 'OutlineWorkspace.askAi' }
    })
    const responseText = result.text || ''
    if (!responseText.trim()) throw new Error('API 返回为空')
    const editBatch = extractOutlineToolEditBatch(result.toolCalls) || parseEditorEditBatch(responseText)
    await conversationContextService.recordTurn(contextRef, {
      user: requestText,
      assistant: responseText,
      meta: {
        source: 'OutlineWorkspace.askPlainAi',
        model: result.model || model,
        providerId: result.providerId,
        toolCalls: result.toolCalls?.length ? result.toolCalls.map(call => call.name).join(' → ') : undefined,
        editorBatch: editBatch ? { commandCount: editBatch.commands.length, reason: editBatch.reason } : undefined
      }
    })
    flushStreamingRender()
    projectStore.appendOutlineChat({
      role: 'assistant',
      content: responseText,
      ...(latestOutlineToolPlan ? { outlineToolPlan: latestOutlineToolPlan } : {}),
      ...(latestOutlineToolCallStream.length ? { outlineToolCallStream: [...latestOutlineToolCallStream] } : {}),
      ...(editBatch ? { outlineBatch: editBatch } : {}),
      ...(editBatch ? { outlineBatchTarget } : {}),
      ...(editBatch ? {
        outlineBatchRecord: createEditorBatchRecord({
          workspace: 'outline',
          targetId: 'outline',
          batch: editBatch,
          sourceContent: projectStore.outlineText || ''
        })
      } : {})
    })
    if (result.finishReason && isTruncationReason(result.finishReason)) {
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
    if (generationController?.signal.aborted || error?.name === 'AbortError' || error?.code === 'canceled') {
      generationStatus.value = '已取消生成'
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
      projectStore.appendOutlineChat({ role: 'assistant', content: '生成失败：' + (error.message || '未知错误') })
    }
  } finally {
    generationController = null
    isGenerating.value = false
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
  isGenerating.value = true
  generationStatus.value = '正在续生成…'
  streamingContent.value = snapshot.accumulatedText
  generationController = new AbortController()
  try {
    const aiService = await getAiService()
    const result = await continueSnapshot(aiService, snapshot, {
      signal: generationController.signal,
      onChunk: (text: string) => {
        streamingContent.value = snapshot.accumulatedText + text
        void scrollToBottom()
      }
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
    } else {
      generationStatus.value = '续生成失败：' + (e?.message || String(e))
    }
  } finally {
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
  if (!generationController) return
  generationStatus.value = '正在取消...'
  generationController.abort()
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
.ow-input {
  flex: 1;
  min-width: 0;
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-5);
  font-size: var(--font-size-md);
  height: 28px;
  outline: none;
}
.btn-send {
  background: var(--accent);
  color: var(--text-on-accent);
  border: none;
  border-radius: var(--radius-sm);
  padding: 0 var(--space-5);
  height: 28px;
  cursor: pointer;
  font-size: var(--font-size-xs);
}
.btn-send:disabled,
.btn-cancel {
  opacity: 0.9;
}
.btn-cancel {
  background: var(--danger);
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

