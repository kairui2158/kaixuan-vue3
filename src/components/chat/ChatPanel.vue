<template>
  <section id="chat-panel" class="chat-panel">
    <div id="messages-container" class="messages-container" ref="messagesContainer">
      <div v-if="messages.length === 0" id="chat-empty-state" class="empty-state">
        <div class="empty-state-icon">&#9997;&#65039;</div>
        <div class="empty-title">开始对话</div>
        <div class="empty-desc">在下方输入框输入消息，与 AI 助手开始创作</div>
      </div>
      <div id="messages-list" class="messages-list">
        <ChatMessageComponent
          v-for="(msg, i) in messages"
          :key="i"
          :message="msg"
          :busy="isStreaming"
          @copy="copyMessage"
          @regenerate="regenerateMessage(i)"
          @apply="insertToEditor(msg.content)" @replace="replaceWhole(msg.content)"
          @continue="continueMessage(msg)"
         @preview="previewEditorBatch(msg)"
         @rollback="rollbackEditorBatch(msg)"
        @resume-task="aiTaskStore.resumeTask(aiTaskStore.activeTaskId!)"
        @pause-task="aiTaskStore.pauseTask(aiTaskStore.activeTaskId!)"
         @retry-step="aiTaskStore.retryStep(aiTaskStore.activeTaskId!)"
        @resume-breakpoint="resumeFromChainBreakpoint()"
        @discard-breakpoint="discardChainBreakpoint()"
        :chain-breakpoint="chainBreakpointInfo"
     />
      </div>
    </div>

    <div v-if="isStreaming || generationMessage" id="chat-generation-status" class="chat-generation-status" :class="generationStatus">
      <span class="generation-status-dot" aria-hidden="true"></span>
      <span class="generation-status-text">{{ generationMessage || (isStreaming ? '正在生成…' : '') }}</span>
      <button v-if="isStreaming" id="btn-cancel-generation" class="generation-action generation-cancel" type="button" @click="cancelGeneration">取消生成</button>
      <button v-if="generationStatus === 'error' && lastFailedText" id="btn-retry-generation" class="generation-action" type="button" @click="retryLastRequest">重试</button>
    </div>
    <div v-else-if="compatibilityNotice" id="chat-compatibility-notice" class="chat-compatibility-notice">
      <span>{{ compatibilityNotice }}</span>
      <button type="button" @click="compatibilityNotice = ''">知道了</button>
    </div>
    <div id="chat-input-row" class="chat-input-row">
     <textarea
       v-model="inputText"
        class="chat-input"
        id="user-input"
       placeholder="输入消息..."
       rows="1"
     @keydown.enter.exact.prevent="() => sendMessage()"
       @keydown.enter.shift.exact="inputText += '\n'"
    ></textarea>
      <button id="btn-send" class="btn-send" :disabled="isStreaming" @click="() => sendMessage()" :title="isStreaming ? '生成中' : '发送'">
        <svg v-if="!isStreaming" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
        <span v-else class="send-busy-label">生成中</span>
      </button>
    </div>

      <div id="skill-area" class="skill-area">
      <div id="co-creation-config-row" class="co-creation-config-row">
        <label class="co-creation-field">
          <span class="co-creation-label">SKILL选择</span>
          <select
            id="co-skill-select"
            v-model="coCreationSkillToAdd"
            class="co-creation-select"
            title="选择后添加到主页共创"
            @change="addCoCreationSkill"
          >
            <option value="">添加技能</option>
            <option v-for="skill in availableCoCreationSkills" :key="skill.id" :value="skill.id">{{ skill.name }}</option>
          </select>
        </label>
        <label class="co-creation-field">
          <span class="co-creation-label">AGENT</span>
          <select
            id="co-agent-select"
            v-model="coCreationAgentId"
            class="co-creation-select"
            title="主页共创默认智能体"
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
            class="co-creation-select"
            title="串行逐步传递，并行合并请求"
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
          :title="skill.name"
        >
          <span class="co-skill-seq">{{ index + 1 }}</span>
          <span class="co-skill-name">{{ skill.name }}</span>
          <select
            v-if="coCreationMode === 'chain'"
            :value="coCreation.config.skillAgents[homeSkillAgentKey(skill.id)] || ''"
            class="co-skill-agent"
            title="当前技能绑定的智能体"
            @change="handleCoSkillAgentChange(skill.id, ($event.target as HTMLSelectElement).value)"
          >
            <option value="">默认</option>
            <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
          <button class="co-skill-close" type="button" title="移除技能" @click="removeCoCreationSkill(skill.id)">&times;</button>
        </span>
      </div>
    </div>

    <div id="char-count" class="input-hint">
      <span>{{ inputText.length }}</span> 字 |
        <span id="config-status">{{ configStatus }}</span>
    </div>
    <div class="token-bar" v-show="tokenCount > 0">本次消耗: <span>{{ tokenCount }}</span> 个 Token</div>
  </section>

</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useAgentStore } from '../../stores/agent'
import { useAppConfirm } from '../../composables/useAppConfirm'
import { useProviderStore } from '../../stores/provider'
import { useEditorStore } from '../../stores/editor'
import { useProjectStore } from '../../stores/project'
import { useSettingsStore } from '../../stores/settings'
import ChatMessageComponent from './ChatMessage.vue'
import { useSkillStore } from '../../stores/skill'
import { useChatStore } from '../../stores/chat'
import { useCoCreationStore } from '../../stores/coCreation'
import { useAiTaskStore } from '../../stores/aiTaskStore'
import { getAiService } from '../../services/aiService'
import { runWorkspaceSkills, type WorkspaceSkillEngineAdapter, type WorkspaceSkillTemplate } from '../../services/workspaceSkillEngine'
import { getWorkspaceSkillAgentKey } from '../../services/skillAgentBinding'
import { MCPProtocol } from '../../services/mcp-protocol'
import { retrieveContext } from '../../services/memoryRetriever'
import { conversationContextService } from '../../services/conversationContextService'
import type { ContextMessage } from '../../types/context'
import { continueSnapshot } from '../../services/continuationService'
import { canContinue, continuationStatusFor, type ContinuationSnapshot } from '../../services/continuation'
import { saveContinuation, removeContinuation } from '../../services/continuationStorage'
import { buildEditorEditPrompt, buildEditorReadonlyPrompt, parseEditorEditBatch, parseEditorEditCommand, type EditorEditCommand } from '../../services/editorEditProtocol'
import { createEditorTargetSnapshot, hashEditorContent, validateEditorTarget, type EditorTargetSnapshot } from '../../services/editorTarget'
import { buildEditPlan } from '../../services/editorEditService'
import { applyAcceptedItems, planEditorEditBatch, type EditorEditBatchPlan } from '../../services/editorEditBatch'
import { canRollbackEditorBatch, createEditorBatchRecord, findEditorBatchUndoContent, normalizeEditorBatchRecord, updateEditorBatchRecord } from '../../services/editorBatchRecord'
import { logEditorEdit } from '../../services/editorEditDiagnostics'
import { captureWorkspaceSnapshot, clearWorkspaceSnapshot, hasWorkspaceSnapshot, restoreWorkspaceSnapshot } from '../../services/workspaceSnapshot'
import { createEditorTools } from '../../services/editorTools'
import type { EditorEditBatchCommand } from '../../services/editorEditProtocol'
import type { ChatMessage } from '../../stores/chat'

const agentStore = useAgentStore()
const providerStore = useProviderStore()
const editorStore = useEditorStore()
const appConfirm = useAppConfirm()
const skillStore = useSkillStore()
const chatStore = useChatStore()
const projectStore = useProjectStore()
const coCreation = useCoCreationStore()
const settingsStore = useSettingsStore()
const aiTaskStore = useAiTaskStore()

const projectId = computed(() => projectStore.currentProjectId || 'default')
const messages = computed(() => chatStore.activeMessages)
const inputText = ref('')
const _pendingInlineOriginal = ref('')
const _pendingInlineSelection = ref<{ tabId: string; start: number; end: number } | null>(null)
const pendingEditorTarget = ref<EditorTargetSnapshot | null>(null)
const pendingEditorBatchPlan = ref<EditorEditBatchPlan | null>(null)
const pendingEditorBatchMessage = ref<{ messageId: string; sessionId?: string } | null>(null)
let pendingToolEditBatch: EditorEditBatchCommand | null = null
let lastToolCallSummary: string | null = null
const messagesContainer = ref<HTMLElement | null>(null)
const isStreaming = computed(() => chatStore.generationStatus === 'preparing' || chatStore.generationStatus === 'streaming' || chatStore.generationStatus === 'retrying')
const generationStatus = computed(() => chatStore.generationStatus)
const generationMessage = computed(() => chatStore.generationMessage)
const lastFailedText = ref('')
const compatibilityNotice = ref('')
let activeAbortController: AbortController | null = null
const tokenCount = ref(0)
const maxDepthRef = ref(21)
const coCreationSkillToAdd = ref('')
const DEFAULT_CO_CREATION_HISTORY_TURNS = 10

function getChatContextMessages(currentRequest: string): ContextMessage[] {
  return chatStore.activeMessages
    .filter(message => (message.role === 'user' || message.role === 'assistant') && message.content?.trim())
    .filter(message => !(message.role === 'user' && message.content === currentRequest))
    .slice(-maxDepthRef.value * 2)
    .map(message => ({ role: message.role, content: message.content }))
}

const coCreationAgentId = computed({
  get: () => coCreation.config.agentId,
  set: (v: string) => { coCreation.setAgent(v) }
})

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
    .filter(skill => skill && skill.template)
    .map(skill => ({
      id: skill.id,
      name: skill.name,
      template: skill.template,
      customVars: skill.customVars || {},
      injectMode: skill.injectMode || 'system_prefix',
      outputFormat: skill.outputFormat || 'text',
      validationRules: skill.validationRules || [],
      inputSchema: skill.inputSchema,
      outputSchema: skill.outputSchema,
      retryPolicy: skill.retryPolicy
    }))
}

function getHomeSkillMaxDepth(): number {
  const depths = selectedCoCreationSkills.value
    .map(skill => Number(skill.injectDepth))
    .filter(depth => Number.isFinite(depth) && depth > 0)
  return depths.length > 0 ? Math.min(...depths, 21) : 21
}

function createHomeSkillAdapter(): WorkspaceSkillEngineAdapter {
  return {
    workspace: 'main',
    source: 'HomeCoCreation.skill',
    projectId: projectId.value,
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
        outlineContent = (projectStore.outlineText || '').slice(0, 500)
      } else if (tabMode === 'ch-plot') {
        for (let vi = 0; vi < volumes.length; vi++) {
          const chs = projectStore.chapters[volumes[vi].id] || []
          const ch = chs.find((c: any) => c.id === activeTab!.chapterId)
          if (ch) {
            outlineContent = (volumes[vi].outline || volumes[vi].summary || '').slice(0, 500)
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
            outlineContent = (ch.plot || ch.summary || '').slice(0, 500)
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
    loadBreakpoint: () => coCreation.loadBreakpoint(),
    saveBreakpoint: breakpoint => coCreation.saveBreakpoint(breakpoint),
    clearBreakpoint: () => coCreation.clearBreakpoint()
  }
}

function requestTargetFromEditor(): { selectedText: string } {
  const editor = document.getElementById('editor-content') as HTMLTextAreaElement | null
  const content = editorStore.activeTab?.content || ''
  const start = editor?.selectionStart ?? 0
  const end = editor?.selectionEnd ?? start
  return { selectedText: start < end ? content.slice(start, end) : '' }
}

async function runHomeCoCreationSkills(requestText: string): Promise<string> {
  const placeholderMessage = chatStore.addMessage(
    { role: 'assistant', content: '', tabId: chatStore.currentContext?.tabId || '' },
    projectId.value
  )
  if (!placeholderMessage) throw new Error('当前没有可用对话会话')

  let streamedText = ''
  let firstChunkSeen = false
  const result = await runWorkspaceSkills({
    requestText,
    templates: getHomeSkillTemplates(),
    mode: coCreationMode.value,
    aiService: await getAiService(),
    contextService: conversationContextService,
    adapter: createHomeSkillAdapter(),
    signal: activeAbortController?.signal,
    callbacks: {
      onFirstChunk: () => {
        firstChunkSeen = true
        chatStore.setGenerationState('streaming', '正在接收共创输出…')
      },
      onStatus: status => {
        if (!firstChunkSeen) chatStore.setGenerationState('preparing', status)
      },
      onChunk: text => {
        streamedText = text
        chatStore.updateLastMessage(streamedText)
        void nextTick().then(() => scrollToBottom())
      }
    }
  })

  if (result.text.trim()) chatStore.updateLastMessage(result.text)
  void loadChainBreakpointStatus()
  if (result.mode) {
    await conversationContextService.recordTurn({
      projectId: projectId.value,
      workspace: 'main',
      purpose: 'generate'
    }, {
      user: requestText,
      assistant: result.text,
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
  return result.text
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
  chatStore.ensureSession(tab.id, tab.chapterId, tab.title, projectId.value)
  chatStore.setCurrentContext({
    tabId: tab.id,
    chapterId: tab.chapterId,
    title: tab.title,
    content: tab.content || '',
    mode: tab.mode || 'ch-body'
  })
}, { immediate: true })

watch(() => editorStore.activeTab?.content, (content) => {
  const tab = editorStore.activeTab
  if (!tab || chatStore.currentContext?.tabId !== tab.id) return
  if (chatStore.currentContext) {
    chatStore.currentContext.content = content || ''
  }
})

async function restoreContinuation(sessionId: string) {
  const snapshot = await (await import('../../services/continuationStorage')).loadContinuation(projectId.value, 'main', sessionId)
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
})

onMounted(() => {
  void coCreation.loadConfig()
  void loadChainBreakpointStatus()
  syncChatProject()
  window.addEventListener('editor-action', handleEditorAction)
  aiTaskStore.restore(projectId.value)
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

async function sendMessage(requestText?: string) {
  const editRequestId = `chat-edit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const editStartedAt = performance.now()
  const projId = projectId.value
  let text = (typeof requestText === 'string' ? requestText : inputText.value).trim()
  const originalRequest = text
  if (!text || isStreaming.value) return
  if (!chatStore.activeSession) {
    await appConfirm.alert('当前没有可用对话会话，请重新打开项目后再试')
    return
  }
  activeAbortController?.abort()
  activeAbortController = new AbortController()
  const pendingOriginal = _pendingInlineOriginal.value
  _pendingInlineOriginal.value = ''
  pendingToolEditBatch = null
  lastToolCallSummary = null
  const requestTarget = createEditorTargetSnapshot({
    workspace: 'main',
    targetId: editorStore.activeTab?.id || 'main',
    label: editorStore.activeTab?.title || '主页编辑器',
    chapterId: editorStore.activeTab?.chapterId,
    mode: editorStore.activeTab?.mode,
    content: editorStore.activeTab?.content || '',
    selectionStart: _pendingInlineSelection.value?.start,
    selectionEnd: _pendingInlineSelection.value?.end
  })

  chatStore.addMessage({ role: 'user', content: text, tabId: chatStore.currentContext?.tabId || '' }, projId)
  inputText.value = ''
  await nextTick()
  scrollToBottom()

  chatStore.setGenerationState('preparing', '正在准备请求…')
  let response = ''
  try {
    const provider = providerStore.activeGenerateProvider
    if (!provider) {
      chatStore.addMessage({ role: 'assistant', content: '未配置 API 提供方。请在设置中配置后重试。', tabId: chatStore.currentContext?.tabId || '' }, projId)
      return
    }
    if (!provider.apiKey) {
      chatStore.addMessage({ role: 'assistant', content: '未配置 API Key。请在设置中填写后重试。', tabId: chatStore.currentContext?.tabId || '' }, projId)
      return
    }
    const agent = agentStore.getAgent(coCreationAgentId.value)
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

    const sc = projectStore.getSettingsCollection()
    if (sc && sc.categories && sc.categories.length > 0) {
      let setText = '当前上下文设定：'
      for (const cat of sc.categories) {
        const items = sc.items[cat] || []
        for (const item of items) {
          if (item.isBound) {
            setText += '\n【' + (item.name || '') + '】(' + (item.category || cat || '通用') + ')'
            const attrs = item.attrs || {}
            Object.keys(attrs).forEach(k => { setText += '\n  ' + k + ': ' + attrs[k] })
          }
        }
      }
      if (setText !== '当前上下文设定：') {
        systemParts.push(setText)
      }
    }

    const recentUserMsgs: string[] = []
    for (let i = messages.value.length - 1; i >= 0 && recentUserMsgs.length < 3; i--) {
      if (messages.value[i].role === 'user') recentUserMsgs.push((messages.value[i].content || '').toLowerCase())
    }
    if (recentUserMsgs.length > 0) {
      const combined = recentUserMsgs.join(' ')
      const matched: any[] = []
      const sc2 = projectStore.getSettingsCollection()
      if (sc2 && sc2.categories) {
        for (const cat of sc2.categories) {
          const items = sc2.items[cat] || []
          for (const item of items) {
            const tkw = item.triggerKeywords || item.keywords || []
            for (let k = 0; k < tkw.length; k++) {
              if (tkw[k] && combined.indexOf(tkw[k].toLowerCase()) >= 0) {
                matched.push(item)
                break
              }
            }
          }
        }
      }
      if (matched.length > 0) {
        let trigText = '触发匹配的设定条目：'
        matched.forEach(mi => {
          trigText += '\n【' + (mi.name || '') + '】(' + (mi.category || '') + ')'
          const attrs = mi.attrs || {}
          Object.keys(attrs).forEach(k => { trigText += '\n  ' + k + ': ' + attrs[k] })
          if (mi.triggerKeywords) trigText += '\n  触发词: ' + mi.triggerKeywords.join(', ')
        })
        systemParts.push(trigText)
      }
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
    for (let mi = messages.value.length - 1; mi >= 0; mi--) {
      const mc = messages.value[mi]
      if (mc.role === 'assistant' && mc.content && (mc.content as string).indexOf('请求失败') !== 0) {
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
        chatCtx.referenceOutline = (projectStore.outlineText || '').slice(0, 500)
      } else if (activeTab.mode === 'ch-plot') {
        ctxLabel = '章节剧情梗概'
        for (let vi = 0; vi < volumes.length; vi++) {
          const chs = projectStore.chapters[volumes[vi].id] || []
          const ch = chs.find((c: any) => c.id === activeTab.chapterId)
          if (ch) {
            ctxText = ch.plot || ''
            chatCtx.referenceOutline = (volumes[vi].outline || volumes[vi].summary || '').slice(0, 500)
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
            chatCtx.referenceOutline = (ch2.plot || ch2.summary || '').slice(0, 500)
            chatCtx.editorContent = ctxText
            chatCtx.chapterSummary = ch2.summary || ch2.plot || ''
            break
          }
        }
      }
      const sc3 = projectStore.getSettingsCollection()
      if (sc3 && sc3.categories) {
        const charNames: string[] = []
        for (const cat of sc3.categories) {
          const items = sc3.items[cat] || []
          for (const item of items) {
            if (String(item.category || cat).includes('人物')) {
              const attrsStr = item.attrs && typeof item.attrs === 'object'
                ? Object.keys(item.attrs).map((k: string) => k + ': ' + String(item.attrs[k] ?? '')).join('; ')
                : String(item.content || '')
              charNames.push((item.name || '') + (attrsStr ? '（' + attrsStr + '）' : ''))
            }
          }
        }
        chatCtx.characters = charNames.join('；')
      }
      // Editor content is injected below as "主创作上下文" with priority over reference outline
    }
    if (!chatCtx.editorContent && editorStore.activeTab) {
      chatCtx.editorContent = editorStore.activeTab.content || ''
    }
    if (!chatCtx.referenceOutline) {
      chatCtx.referenceOutline = projectStore.outlineText || ''
    }
    if (chatCtx.editorContent) { systemParts.push('主创作上下文（编辑器内容）：\n' + chatCtx.editorContent) }
    if (chatCtx.referenceOutline) { systemParts.push('参考资料-大纲概要：\n' + chatCtx.referenceOutline) }

    const memoryContext = retrieveContext(projectStore.memories, {
      chapterId: editorStore.activeTab?.chapterId,
      query: `${text} ${editorStore.activeTab?.title || ''}`,
      previousChapterSummary: chatCtx.prevChapterSummary,
      maxChars: 2000
    })
    if (memoryContext.text) systemParts.push(`相关记忆：\n${memoryContext.text}`)
    if (requestTarget.content) {
      systemParts.push(buildEditorEditPrompt({
        workspace: 'main',
        label: requestTarget.label,
        content: requestTarget.content,
        selectedText: requestTarget.selectedText
      }))
    } else if (editorStore.activeTab) {
      systemParts.push(buildEditorReadonlyPrompt({
        workspace: 'main',
        label: editorStore.activeTab.title || '主页编辑器',
        content: editorStore.activeTab.content || ''
      }))
    }

    const systemPrompt = systemParts.join('\n\n---\n\n')
    const model = provider.selectedModel || 'gpt-4o'
    const maxDepth = getHomeSkillMaxDepth()
    maxDepthRef.value = maxDepth

    // 2) MCP 工具执行：前缀 @tool-name 的命令直接调用 ToolRegistry
    if (text.startsWith('@')) {
      const spaceIdx = text.indexOf(' ')
      const toolName = spaceIdx > 0 ? text.slice(1, spaceIdx) : text.slice(1)
      const rawParams = spaceIdx > 0 ? text.slice(spaceIdx + 1) : '{}'
      try {
        const params = JSON.parse(rawParams || '{}')
        const toolResult: any = await MCPProtocol.callToolLocal(toolName, params)
        response = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2)
      } catch (toolErr: any) {
        response = 'MCP 工具调用失败: ' + (toolErr?.message || String(toolErr))
      }
    } else if (selectedCoCreationSkills.value.length > 0) {
      response = await runHomeCoCreationSkills(originalRequest)
    } else {
      // 3) 常规对话走 callApi
      const useTools = Boolean(editorStore.activeTab)
     const toolEditBatch = await callApi(
       provider,
       model,
       systemPrompt,
      originalRequest,
      maxDepth,
      projId,
      text,
      useTools ? buildChatEditorTools(requestTarget) : undefined,
      requestTarget
    )
      response = toolEditBatch.text
      pendingToolEditBatch = toolEditBatch.toolEditBatch
      lastToolCallSummary = toolEditBatch.toolCallSummary
      if (response?.trim()) {
        await conversationContextService.recordTurn({
          projectId: projId,
          workspace: 'main',
          purpose: 'generate'
        }, {
          user: originalRequest,
          assistant: response,
          meta: {
            source: 'ChatPanel.callApi',
            model,
            agentId: coCreationAgentId.value || undefined,
            toolCalls: toolEditBatch.toolCallSummary,
            editorBatch: toolEditBatch.toolEditBatch
              ? { commandCount: toolEditBatch.toolEditBatch.commands.length, reason: toolEditBatch.toolEditBatch.reason }
              : undefined
          }
        })
      }
    }

    if (response) {
      if (messages.value.length === 0 || messages.value[messages.value.length - 1].role !== 'assistant') {
        chatStore.addMessage({ role: 'assistant', content: response, tabId: chatStore.currentContext?.tabId || '' }, projId)
      }
    }
    const editBatch = pendingToolEditBatch || parseEditorEditBatch(response)
    const editCommand = editBatch ? null : parseEditorEditCommand(response)
    const editorBatchRecord = editBatch && requestTarget.content
      ? createEditorBatchRecord({
        workspace: 'main',
        targetId: requestTarget.targetId,
        batch: editBatch,
        sourceContent: requestTarget.content
      })
      : undefined
    if (editBatch && requestTarget.content) {
      const lastMessage = messages.value[messages.value.length - 1]
      if (lastMessage?.role === 'assistant') {
        chatStore.updateMessageEditorBatch(
          lastMessage.id,
          editBatch,
          {
            workspace: 'main',
            targetId: requestTarget.targetId,
            contentHash: hashEditorContent(requestTarget.content)
          },
          editorBatchRecord,
          chatStore.activeSessionId || undefined
        )
      }
    }
    logEditorEdit({
      requestId: editRequestId,
      workspace: 'main',
      tabId: requestTarget.targetId,
      operation: editCommand?.operation,
      result: editCommand ? 'parsed' : 'no_edit',
      targetLength: requestTarget.content.length,
      contentLength: editCommand?.content?.length,
      durationMs: Math.round(performance.now() - editStartedAt),
      detail: editCommand ? '已解析为编辑指令，等待用户预览确认' : '普通对话响应，未识别编辑指令'
    })
    if (pendingOriginal && response && pendingOriginal !== response && !editCommand) {
        window.dispatchEvent(new CustomEvent('show-diff', {
          detail: { original: pendingOriginal, modified: response }
        }));
    }
    if (editBatch && requestTarget.content) {
      const currentContent = editorStore.activeTab?.id === requestTarget.targetId
        ? editorStore.activeTab?.content || ''
        : requestTarget.content
      const batchPlan = planEditorEditBatch(editBatch, requestTarget, { content: currentContent })
      const lastBatchMessage = messages.value[messages.value.length - 1]
      const pendingRecord = normalizeEditorBatchRecord(lastBatchMessage?.editorBatchRecord)
      logEditorEdit({
        requestId: editRequestId,
        batchId: pendingRecord?.batchId,
        workspace: 'main',
        tabId: requestTarget.targetId,
        operation: 'editor_edit_batch',
        result: batchPlan.ok ? 'parsed' : 'rejected',
        targetLength: requestTarget.content.length,
        contentLength: batchPlan.items.reduce((sum, item) => sum + (item.command.content?.length || 0), 0),
        failureReason: batchPlan.failureReason,
        durationMs: Math.round(performance.now() - editStartedAt),
        detail: batchPlan.ok ? `批次包含 ${batchPlan.items.length} 条编辑，等待用户预览确认` : '批次规划失败：' + batchPlan.failureReason
      })
      pendingEditorTarget.value = requestTarget
      pendingEditorBatchPlan.value = batchPlan
      if (lastBatchMessage?.role === 'assistant') {
        pendingEditorBatchMessage.value = {
          messageId: lastBatchMessage.id,
          sessionId: chatStore.activeSession?.id
        }
      }
      window.dispatchEvent(new CustomEvent('show-diff', {
        detail: {
          original: batchPlan.original,
          modified: batchPlan.ok ? batchPlan.next : batchPlan.original,
          editMeta: {
            workspace: 'main',
            targetId: requestTarget.targetId,
            targetLabel: requestTarget.label,
            operationLabel: `批量编辑（${batchPlan.items.length} 项）`,
            failureReason: batchPlan.ok ? undefined : batchPlan.failureReason,
            dangerous: batchPlan.items.some(item => item.command.operation === 'rewrite' || item.command.operation === 'delete'),
            batchItems: batchPlan.items.map(item => ({
              index: item.index,
              label: item.command.operation + (item.command.target ? `：${item.command.target}` : ''),
              reason: item.command.reason,
              dangerous: item.command.operation === 'rewrite' || item.command.operation === 'delete',
              range: item.plan.range
            })),
          }
        }
      }))
    } else if (editCommand && requestTarget.content) {
      const currentContent = editorStore.activeTab?.id === requestTarget.targetId
        ? editorStore.activeTab?.content || ''
        : requestTarget.content
    const plan = buildEditPlan(requestTarget, editCommand, { content: currentContent })
    logEditorEdit({
      requestId: editRequestId,
      workspace: 'main',
      tabId: requestTarget.targetId,
      operation: editCommand.operation,
      result: plan.ok ? 'parsed' : 'rejected',
      targetLength: requestTarget.content.length,
      contentLength: editCommand.content?.length,
      failureReason: plan.ok ? undefined : plan.failureReason,
      durationMs: Math.round(performance.now() - editStartedAt),
      detail: plan.ok ? '编辑计划已生成，等待用户预览确认' : '编辑计划失败：' + plan.failureReason
    })
      pendingEditorTarget.value = requestTarget
      pendingEditorBatchPlan.value = null
      window.dispatchEvent(new CustomEvent('show-diff', {
        detail: {
          original: plan.original,
          modified: plan.ok ? plan.next : plan.original,
          editMeta: {
            targetLabel: requestTarget.label,
            operationLabel: plan.operation,
            failureReason: plan.ok ? undefined : plan.failureReason,
            dangerous: plan.ok && (plan.operation === 'rewrite' || plan.operation === 'delete')
          }
        }
      }))
    }
 } catch (e: any) {
   if (e?.kind === 'canceled' || activeAbortController?.signal.aborted) {
     removeEmptyAssistantMessage()
     chatStore.setGenerationState('canceled', '已取消生成')
   } else {
     removeEmptyAssistantMessage()
     lastFailedText.value = text
     chatStore.setGenerationState('error', '生成失败：' + (e?.message || String(e)))
     chatStore.addMessage({ role: 'assistant', content: '请求失败：' + (e?.message || String(e)), tabId: chatStore.currentContext?.tabId || '' }, projId)
   }
} finally {
    clearWorkspaceSnapshotIfSafe()
    activeAbortController = null
    if (chatStore.generationStatus === 'preparing' || chatStore.generationStatus === 'streaming' || chatStore.generationStatus === 'retrying') {
      chatStore.setGenerationState('idle')
    }
    await nextTick()
    scrollToBottom()
  }
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
 tools?: ReturnType<typeof createEditorTools>,
 externalRequestTarget?: EditorTargetSnapshot
): Promise<{
  text: string
  toolEditBatch: EditorEditBatchCommand | null
  toolCallSummary: string | null
}> {
  const requestTarget = externalRequestTarget || createEditorTargetSnapshot({
    workspace: 'main',
    targetId: editorStore.activeTab?.id || projId,
    label: editorStore.activeTab?.title || '',
    chapterId: editorStore.activeTab?.chapterId,
    mode: editorStore.activeTab?.mode || 'ch-body',
    content: editorStore.activeTab?.content || '',
    selectionStart: 0,
    selectionEnd: 0
  })
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
    legacyMessages: getChatContextMessages(userText)
  })
  const contextPolicy = conversationContextService.getPolicy('generate')
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

  const service = await getAiService()
  const result = await service.callAi({
    purpose: 'generate',
    messages,
    model,
    temperature: provider.temperature ?? 0.7,
    maxTokens: 128000,
    retry: true,
    signal: activeAbortController?.signal,
    tools,
    toolPolicy: tools ? {
   maxToolIterations: 6,
   maxWriteProposals: 1,
  onToolStart: (event) => {
    // P6: 工具调用开始 -> 流式 tool_start 事件
    // P7: 通知编辑器实时反馈
    window.dispatchEvent(new CustomEvent('tool-activity', { detail: { type: 'tool_start', toolName: event.toolName, targetId: requestTarget.targetId, policy: event.policy } }))
    const activeMsg = chatStore.activeSession?.messages[chatStore.activeSession.messages.length - 1]
     if (activeMsg?.role === 'assistant') {
       chatStore.appendToolCallStream(activeMsg.id, {
         type: 'tool_start',
         toolName: event.toolName,
         stepDescription: `正在执行 ${event.toolName}…`,
         targetId: requestTarget.targetId,
         iteration: event.iteration,
         timestamp: Date.now(),
         ok: false,
       }, chatStore.activeSession?.id)
     }
   },
   onToolCall: (event) => {
     // P2: 实时校验写入目标一致性
     if (event.policy === 'write' && event.result.ok) {
       const writableTarget = event.result.data && typeof event.result.data === 'object'
         ? (event.result.data as { targetId?: string }).targetId
         : undefined
       if (writableTarget && writableTarget !== requestTarget.targetId) {
         console.warn('[P2 写入安全] AI 尝试写入非当前目标', { writableTarget, expected: requestTarget.targetId })
       }
     }
      // P6: 工具调用过程流式事件
      const activeMsg = chatStore.activeSession?.messages[chatStore.activeSession.messages.length - 1]
      if (activeMsg?.role === 'assistant') {
       chatStore.appendToolCallStream(activeMsg.id, {
         type: event.result.ok ? 'tool_result' : 'tool_error',
          toolName: event.toolName,
          stepDescription: event.result.ok ? '已完成' : (event.result.error?.message || '失败'),
          targetId: requestTarget.targetId,
          iteration: event.iteration,
          timestamp: Date.now(),
          ok: event.result.ok,
          error: event.result.ok ? undefined : event.result.error?.message
        }, chatStore.activeSession?.id)
        // P7: 通知编辑器工具完成
        window.dispatchEvent(new CustomEvent('tool-activity', { detail: { type: event.result.ok ? 'tool_result' : 'tool_error', toolName: event.toolName, targetId: requestTarget.targetId, policy: event.policy } }))
      }
     // P5: 记录工具调用到任务状态机
     if (!aiTaskStore.hasActiveTask) {
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
     if (activeTask) {
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
    } : undefined,
    meta: { source: 'ChatPanel.callApi', targetId: requestTarget.targetId, ctxTurns: Math.round(ctxTurns) },
    onChunk: (text: string) => {
      chatStore.setGenerationState('streaming', '正在接收 AI 输出…')
      chatStore.updateLastMessage(text)
      nextTick().then(() => scrollToBottom())
    }
  })
  if (result.toolsDowngraded === 'json-protocol' && !compatibilityNotice.value) {
    compatibilityNotice.value = '供应商拒绝原生工具调用，已降级为 JSON 兼容模式'
  }

  let toolEditBatch: EditorEditBatchCommand | null = null
  const compatibilityBatch = parseEditorEditBatch(result.text)
  if (!result.toolCalls?.length && compatibilityBatch) {
    toolEditBatch = compatibilityBatch
  }
  if (result.toolCalls?.length) {
    for (let index = result.toolCalls.length - 1; index >= 0; index--) {
      const call = result.toolCalls[index]
      if (call.name !== 'editor.propose_edits') continue
      const input = call.input as { commands?: unknown; reason?: unknown }
      if (!Array.isArray(input?.commands) || input.commands.length === 0) continue
      toolEditBatch = {
        type: 'editor_edit_batch',
        version: 1,
        commands: input.commands as EditorEditCommand[],
        reason: typeof input.reason === 'string' ? input.reason : undefined
      }
      break
    }
  }
    const responseText = result.text || (toolEditBatch
      ? `已生成 ${toolEditBatch.commands.length} 条编辑建议，请预览确认。`
      : '')
    if (responseText) chatStore.updateLastMessage(responseText)
  const toolCallSummary = result.toolCalls?.length
    ? result.toolCalls.map(call => call.name).join(' → ')
    : null
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
      mode: 'single', originalMessages: messages, accumulatedText: result.text || '', continuationCount: 0, status: continuationStatus,
      finishReason: finishReason as any, createdAt: Date.now(), updatedAt: Date.now()
    }
    chatStore.updateMessageContinuation(activeMessage.id, snapshot, chatStore.activeSession?.id || 'main')
    await saveContinuation(snapshot, chatStore.activeSession?.id || 'main')
  }
  return { text: responseText, toolEditBatch, toolCallSummary }
}

function clearWorkspaceSnapshotIfSafe() {
  // P4: 任务完成后清理工作区快照（只在内存中，不持久化）
  // 经验引用: §1 M1（影响圈声明）
  clearWorkspaceSnapshot()
}

function cancelGeneration() {
  activeAbortController?.abort()
}

const chainBreakpointInfo = ref<{ skillId: string; step: number; error: string; retryCount: number } | null>(null)

async function loadChainBreakpointStatus() {
  try {
    const bp = await coCreation.loadBreakpoint()
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
    await coCreation.clearBreakpoint()
    nextTick(() => sendMessage(lastUserMsg.content))
  }
}

async function discardChainBreakpoint() {
  chainBreakpointInfo.value = null
  await coCreation.clearBreakpoint()
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
  try {
    const result = await continueSnapshot(await getAiService(), snapshot, { signal: activeAbortController?.signal, onChunk: text => chatStore.updateMessageContent(targetMessageId, snapshot.accumulatedText + text, targetSessionId) })
    chatStore.updateMessageContent(targetMessageId, result.text, targetSessionId)
    const nextReason = result.finishReason || 'unknown'
    if (nextReason === 'length' || nextReason === 'timeout' || nextReason === 'network_error' || nextReason === 'canceled') {
      const nextSnapshot = { ...snapshot, accumulatedText: result.text, continuationCount: snapshot.continuationCount + 1, status: continuationStatusFor(nextReason as any, Boolean(result.text)), finishReason: nextReason as any, updatedAt: Date.now() }
      chatStore.updateMessageContinuation(targetMessageId, nextSnapshot, targetSessionId)
      await saveContinuation(nextSnapshot, targetSessionId)
    } else {
      await removeContinuation(snapshot.projectId, snapshot.workspace, targetSessionId)
      chatStore.updateMessageContinuation(targetMessageId, undefined, targetSessionId)
    }
  } catch (error: any) {
    chatStore.setGenerationState('error', '续生成失败：' + (error?.message || String(error)))
  } finally {
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
  const user = messages.value[index - 1]
  const assistant = messages.value[index]
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
  const editor = document.getElementById('editor-content') as HTMLTextAreaElement | null
  const selectionStart = editor?.selectionStart ?? (tab.content || '').length
  const selectionEnd = editor?.selectionEnd ?? selectionStart
  const target = createEditorTargetSnapshot({
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
  pendingEditorTarget.value = target
  pendingEditorBatchPlan.value = null
  window.dispatchEvent(new CustomEvent('show-diff', {
    detail: {
      original: plan.original,
      modified: plan.next,
      editMeta: {
        workspace: 'main',
        targetId: target.targetId,
        targetLabel: target.label,
        operationLabel: plan.operation,
        dangerous: selectionStart < selectionEnd
      }
    }
  }))
}

function buildChatEditorTools(requestTarget: EditorTargetSnapshot) {
  return createEditorTools({
    getSnapshot: () => (pendingEditorTarget.value && pendingEditorTarget.value.targetId === requestTarget.targetId
      ? pendingEditorTarget.value
      : requestTarget),
    getAllSnapshots: () => editorStore.tabs.map(tab => ({
      workspace: 'main' as const,
      targetId: tab.id,
      label: tab.title,
      chapterId: tab.chapterId,
      mode: tab.mode,
      content: tab.content,
      contentVersion: 0,
      selectionStart: 0,
      selectionEnd: 0,
      selectedText: '',
    })),
    onPlanUpdate: (plan) => {
      const activeMessage = chatStore.activeSession?.messages[chatStore.activeSession.messages.length - 1]
      if (activeMessage?.role === 'assistant') {
        chatStore.updateMessageEditorToolPlan(activeMessage.id, plan, chatStore.activeSession?.id)
      }
    }
  })
}

function previewEditorBatch(message: ChatMessage) {
  if (isStreaming.value) return
  const batch = message.editorBatch
  const targetMeta = message.editorBatchTarget
  if (!batch) return
  const tab = targetMeta
    ? editorStore.tabs.find(item => item.id === targetMeta.targetId)
    : editorStore.activeTab
  if (!tab) {
    void appConfirm.alert('编辑目标已关闭，请重新发起编辑请求')
    return
  }
  if (targetMeta && targetMeta.contentHash !== hashEditorContent(tab.content || '')) {
    const previewRecord = normalizeEditorBatchRecord(message.editorBatchRecord)
    logEditorEdit({
      requestId: `chat-edit_${Date.now()}`,
      batchId: previewRecord?.batchId,
      workspace: 'main',
      tabId: targetMeta.targetId,
      operation: 'editor_edit_batch',
      result: 'rejected',
      targetLength: (tab.content || '').length,
      contentLength: batch.commands.reduce((sum, command) => sum + (command.content?.length || 0), 0),
      failureReason: 'version_changed',
      durationMs: 0,
      detail: '主编辑器批次生成后内容已手动修改，请重新生成编辑建议'
    })
    void appConfirm.alert('编辑器内容已手动修改，请重新生成编辑建议')
    return
  }
  const target = createEditorTargetSnapshot({
    workspace: 'main',
    targetId: tab.id,
    label: tab.title,
    chapterId: tab.chapterId,
    mode: tab.mode,
    content: tab.content || '',
    selectionStart: tab.content?.length,
    selectionEnd: tab.content?.length
  })
  const batchPlan = planEditorEditBatch(batch, target, { content: tab.content || '' }, {
    batchId: normalizeEditorBatchRecord(message.editorBatchRecord)?.batchId
  })
  pendingEditorTarget.value = target
  pendingEditorBatchPlan.value = batchPlan
  pendingEditorBatchMessage.value = {
    messageId: message.id,
    sessionId: chatStore.activeSession?.id
  }
  const previewRecord = normalizeEditorBatchRecord(message.editorBatchRecord)
  logEditorEdit({
    requestId: `chat-edit_${Date.now()}`,
    batchId: previewRecord?.batchId,
    workspace: 'main',
    tabId: tab.id,
    operation: 'editor_edit_batch',
    result: batchPlan.ok ? 'parsed' : 'rejected',
    targetLength: (tab.content || '').length,
    contentLength: batchPlan.items.reduce((sum, item) => sum + (item.command.content?.length || 0), 0),
    failureReason: batchPlan.failureReason,
    durationMs: 0,
    detail: batchPlan.ok ? `重新预览批次包含 ${batchPlan.items.length} 条编辑` : '重新预览批次规划失败：' + batchPlan.failureReason
  })
  window.dispatchEvent(new CustomEvent('show-diff', {
    detail: {
      original: batchPlan.original,
      modified: batchPlan.ok ? batchPlan.next : batchPlan.original,
      editMeta: {
        workspace: 'main',
        targetId: target.targetId,
        targetLabel: target.label,
        operationLabel: `批量编辑（${batchPlan.items.length} 项）`,
        failureReason: batchPlan.ok ? undefined : batchPlan.failureReason,
        dangerous: batchPlan.items.some(item => item.command.operation === 'rewrite' || item.command.operation === 'delete'),
        batchItems: batchPlan.items.map(item => ({
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
    void appConfirm.alert('编辑器内容在批次应用后已有修改，请使用对比预览手动处理')
    return
  }
  const undoContent = findEditorBatchUndoContent(editorStore.tabUndoStacks[record.targetId] || [], record)
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
    chatStore.activeSession?.id
  )
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

let applyingEditorEdit = false
window.addEventListener('diff-applied', (event: Event) => {
  const detail = (event as CustomEvent).detail
  const target = pendingEditorTarget.value
  const text = detail?.text
  if (applyingEditorEdit || !target || typeof text !== 'string') return
  const tab = editorStore.tabs.find(item => item.id === target.targetId)
  if (!tab) return
  const pendingBatchMessage = pendingEditorBatchMessage.value
  const pendingRecord = pendingBatchMessage
    ? normalizeEditorBatchRecord(
      chatStore.sessions
        .find(session => session.id === (pendingBatchMessage.sessionId || chatStore.activeSessionId))
        ?.messages.find(message => message.id === pendingBatchMessage.messageId)?.editorBatchRecord
    )
    : null
  const validation = validateEditorTarget(target, { content: tab.content || '' })
  if (!validation.valid) {
    pendingEditorTarget.value = null
    pendingEditorBatchPlan.value = null
    logEditorEdit({
      requestId: `chat-edit_${Date.now()}`,
      workspace: 'main',
      tabId: target.targetId,
      result: 'rejected',
      targetLength: target.content.length,
      failureReason: validation.reason,
      durationMs: 0,
      detail: '请求返回后编辑目标内容已变化，拒绝写入'
    })
    void appConfirm.alert('编辑目标已变化，请重新发起编辑请求')
    return
  }
  applyingEditorEdit = true
  try {
    const wasBatch = Boolean(pendingEditorBatchPlan.value)
    const acceptedIndexes = detail?.acceptedIndexes
    let finalText = text
    if (wasBatch && Array.isArray(acceptedIndexes)) {
      const replanned = applyAcceptedItems(pendingEditorBatchPlan.value!, acceptedIndexes)
      if (!replanned.ok) {
        pendingEditorTarget.value = null
        pendingEditorBatchPlan.value = null
        void appConfirm.alert('部分命令被拒绝后批次无法重新规划，请重新发起编辑请求')
        return
      }
      finalText = replanned.next
    }
    editorStore.pushUndoState(tab.id, tab.content || '')
    editorStore.updateContent(tab.id, finalText)
    // P3: AI 批次 checkpoint 通过 editorStore undo 栈联动
    // 经验引用: §1 规则6（不得重新赋值）、§7 规则19（AI 批次专用回滚栈）
    // ChatPanel 不持有 useUndoRedo 实例，通过事件通知 EditorPanel 联动
    if (pendingRecord?.batchId) {
      window.dispatchEvent(new CustomEvent('editor-ai-batch-checkpoint', {
        detail: { tabId: tab.id, content: finalText, batchId: pendingRecord.batchId }
      }))
    }
    window.dispatchEvent(new CustomEvent('editor-external-change', {
      detail: { tabId: tab.id, content: finalText }
    }))
    const rejectedIndexes = Array.isArray(acceptedIndexes)
      ? pendingEditorBatchPlan.value!.items
        .map(item => item.index)
        .filter(index => !(acceptedIndexes as number[]).includes(index))
      : undefined
    if (pendingRecord) {
      chatStore.updateMessageEditorBatch(
        pendingBatchMessage!.messageId,
        undefined,
        undefined,
        updateEditorBatchRecord(pendingRecord, {
          status: 'applied',
          appliedContentHash: hashEditorContent(finalText),
          appliedAt: Date.now(),
          undoAvailable: true,
          acceptedIndexes: Array.isArray(acceptedIndexes) ? [...acceptedIndexes] : undefined,
          rejectedIndexes
        }),
        pendingBatchMessage!.sessionId
      )
    }
    _pendingInlineSelection.value = null
    pendingEditorTarget.value = null
    pendingEditorBatchPlan.value = null
    pendingEditorBatchMessage.value = null
    logEditorEdit({
      requestId: `chat-edit_${Date.now()}`,
      batchId: pendingRecord?.batchId,
      workspace: 'main',
      tabId: target.targetId,
      operation: wasBatch ? 'editor_edit_batch' : (target.selectedText ? 'replace_selection' : 'insert'),
      result: 'applied',
      targetLength: target.content.length,
      contentLength: Math.max(0, finalText.length - target.content.length),
      durationMs: 0,
      detail: '用户确认后已写入主页编辑器'
    })
    if (pendingRecord) {
      void conversationContextService.recordEditorEvent({
        projectId: projectId.value,
        workspace: 'main',
        purpose: 'generate'
      }, '已应用 AI 编辑批次', {
        batchId: pendingRecord.batchId,
        commandCount: pendingRecord.commandCount,
        targetId: target.targetId,
        status: 'applied',
        acceptedIndexes: Array.isArray(acceptedIndexes) ? [...acceptedIndexes] : undefined,
        rejectedIndexes
      }).catch(error => console.error('[CHAT] 记录 AI 批次应用上下文失败', error))
    }
  } finally {
    applyingEditorEdit = false
  }
})

window.addEventListener('diff-closed', () => {
  pendingEditorTarget.value = null
  pendingEditorBatchPlan.value = null
  pendingEditorBatchMessage.value = null
})

async function replaceWhole(content: string) {
  const pending = _pendingInlineSelection.value
  const tab = editorStore.activeTab
  if (!tab) {
    await appConfirm.alert('请先打开或创建一个章节，再替换编辑器内容')
    return
  }
  if (pending && tab && pending.tabId === tab.id && pending.end > pending.start) {
    const original = tab.content || ''
    const start = Math.max(0, Math.min(pending.start, original.length))
    const end = Math.max(start, Math.min(pending.end, original.length))
    editorStore.updateContent(tab.id, original.substring(0, start) + content + original.substring(end))
    _pendingInlineSelection.value = null
    return
  }
  if (tab && await appConfirm.confirm({ title: '替换整章', message: '当前没有可用选区，将替换整章内容，确认继续？', confirmText: '替换', danger: true })) {
    editorStore.updateContent(tab.id, content)
  }
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
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
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
  gap: 8px;
  padding: 10px 12px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  font-size: var(--font-size-md);
  font-weight: 600;
}
.chat-header-title-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  min-width: 0;
}
.chat-header-title {
  flex: 0 0 auto;
}
.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 8px;
  color: var(--text-muted);
}
.empty-icon { font-size: 32px; }
.empty-title { font-size: var(--font-size-md); font-weight: 600; color: var(--text-secondary); }
.empty-desc { font-size: var(--font-size-md); text-align: center; }
.chat-input-row {
  display: flex;
  gap: 8px;
  padding: var(--space-4) var(--space-6);
  border-top: 1px solid var(--border-color);
}
.chat-generation-status {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 6px 12px;
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
}
.chat-compatibility-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 6px 12px;
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
  min-height: 28px;
  padding: 3px 9px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xs);
  background: var(--bg-input);
  color: var(--text-secondary);
  cursor: pointer;
}
.generation-action {
  flex: 0 0 auto;
  min-height: 28px;
  padding: 3px 9px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xs);
  background: var(--bg-input);
  color: var(--text-primary);
  cursor: pointer;
  font-size: var(--font-size-sm);
  white-space: nowrap;
}
.generation-action:hover { background: var(--bg-hover); }
.generation-cancel { color: var(--accent-lighter, var(--accent)); }
.chat-input {
  flex: 1;
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 7px 10px;
  font-size: var(--font-size-md);
  resize: none;
  outline: none;
  height: 36px;
  max-height: 100px;
}
.chat-input:focus {
  border-color: var(--accent);
}
.btn-send {
  background: var(--control-primary-bg);
  color: var(--text-on-accent);
  border: none;
  border-radius: var(--radius-sm);
  padding: 0 var(--space-md);
  min-width: 48px;
  height: 32px;
  cursor: pointer;
  font-size: var(--btn-font-size-md);
}
.btn-send:disabled {
  cursor: wait;
  opacity: 0.65;
}
.send-busy-label { font-size: var(--font-size-sm); white-space: nowrap; }
#btn-send:hover {
  background: var(--control-primary-bg-hover);
}
#btn-send:active {
  transform: var(--tf-press);
}
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
  gap: 6px;
  box-sizing: border-box;
  padding: 6px 12px;
  background: var(--bg-secondary);
}
.co-creation-field {
  display: flex;
  flex: 1 1 92px;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
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
.co-creation-select {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  height: 26px;
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xs);
  padding: 2px 5px;
  font-size: var(--font-size-sm);
  outline: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.co-creation-select:focus {
  border-color: var(--accent);
}
.co-creation-action {
  flex: 0 0 auto;
  min-height: 26px;
  padding: 3px 12px;
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
  gap: 5px;
  box-sizing: border-box;
  padding: 0 12px 8px;
  background: var(--bg-secondary);
}
.co-skill-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
  padding: 2px 4px 2px 6px;
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
  padding: 0 3px;
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
.token-bar { padding: 4px 12px 6px; font-size: var(--font-size-sm); color: var(--text-muted); }
.input-hint {
  padding: 4px 12px 8px;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}
</style>

