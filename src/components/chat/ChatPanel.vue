<template>
  <section id="chat-panel" class="chat-panel">
    <div id="agent-select-chat" class="chat-header">
      <span>AI 对话</span>
      <select v-model="selectedChatAgent" class="agent-selector">
        <option value="">默认</option>
        <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
      </select>
      <select id="model-select-chat" v-model="selectedChatModel" class="agent-selector">
        <option value="">自动</option>
        <option v-for="m in availableModels" :key="m" :value="m">{{ m }}</option>
      </select>
      <span v-if="syncedStepLabel" class="chat-sync-label">{{ syncedStepLabel }}</span>
      <span v-if="syncedAgentName" class="chat-sync-agent">Agent: {{ syncedAgentName }}</span>
      <span v-if="syncedSkillNames" class="chat-sync-skills">Skill: {{ syncedSkillNames }}</span>
   </div>

    <div id="chat-context-bar" class="chat-context-bar"></div>

    <div id="messages-container" class="messages-container" ref="messagesContainer">
      <div v-if="messages.length === 0" id="chat-empty-state" class="empty-state">
        <div class="empty-state-icon">&#9997;&#65039;</div>
        <div class="empty-title">开始对话</div>
        <div class="empty-desc">在下方输入框输入消息，与 AI 助手开始创作</div>
      </div>
      <div id="messages-list" class="messages-list">
        <ChatMessage
          v-for="(msg, i) in messages"
          :key="i"
          :message="msg"
          @copy="copyMessage"
          @regenerate="regenerateMessage(i)"
          @apply="insertToEditor(msg.content)" @replace="replaceWhole(msg.content)"
        />
      </div>
    </div>

    <div id="chat-input-row" class="chat-input-row">
     <textarea
       v-model="inputText"
        class="chat-input"
        id="user-input"
       placeholder="输入消息..."
       rows="1"
       @keydown.enter.exact.prevent="sendMessage"
       @keydown.enter.shift.exact="inputText += '\n'"
    ></textarea>
      <button id="btn-send" class="btn-send" @click="sendMessage" title="发送">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
      </button>
    </div>

      <div id="skill-area" class="skill-area">
      <div id="skill-area-toggle" class="skill-area-header" @click="skillAreaOpen = !skillAreaOpen">
        <span class="skill-area-title">技能区</span>
        <span id="skill-area-arrow" class="skill-area-arrow" :class="{ rotated: !skillAreaOpen }">▼</span>
      </div>
      <div id="skill-area-content" class="skill-area-content" v-show="skillAreaOpen">
        <div id="agent-info-bar" class="agent-info-bar">
          <span class="agent-info-label">AI</span>
          <span id="agent-info-name" class="agent-info-name">{{ currentAgentName }}</span>
          <span id="agent-info-model" class="agent-info-model">{{ selectedChatModel || '自动' }}</span>
        </div>
        <div id="skill-list-active" class="skill-list-active">{{ activeSkillNames || '暂无' }}</div>
      </div>
    </div>

    <div id="char-count" class="input-hint">
      <span>{{ inputText.length }}</span> 字 |
        <span id="config-status">{{ configStatus }}</span>
    </div>
    <div class="token-bar" v-show="tokenCount > 0">本次消耗: <span>{{ tokenCount }}</span> tokens</div>
  </section>

</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useAgentStore } from '../../stores/agent'
import { useProviderStore } from '../../stores/provider'
import { useEditorStore } from '../../stores/editor'
import { useProjectStore } from '../../stores/project'
import { usePipelineStore } from '../../stores/pipeline'
import { useSettingsStore } from '../../stores/settings'
import ChatMessage from './ChatMessage.vue'
import { useSkillStore } from '../../stores/skill'
import { useChatStore } from '../../stores/chat'
import { createAiService } from '../../services/aiService'
import { useExecutionLogStore } from '../../stores/executionLog'
import { MCPProtocol } from '../../services/mcp-protocol'
import { retrieveContext } from '../../services/memoryRetriever'

const agentStore = useAgentStore()
const providerStore = useProviderStore()
const editorStore = useEditorStore()
const skillStore = useSkillStore()
const chatStore = useChatStore()
const projectStore = useProjectStore()
const pipelineStore = usePipelineStore()
const settingsStore = useSettingsStore()

function resolveSkillTemplate(template: string, context: Record<string, any>): string {
  const engine = (window as any).SkillExecutionEngine
  if (engine && typeof engine.resolveTemplate === "function" && template && /\{\{/.test(template)) {
    try {
      return engine.resolveTemplate(template, context, { keepMissing: false })
    } catch (e) {
      console.warn('[CHAT] resolveTemplate failed, using raw template', e)
    }
  }
  return template
}

const projectId = computed(() => projectStore.currentProjectId || 'default')
const messages = computed(() => chatStore.activeMessages)
const inputText = ref('')
const _pendingInlineOriginal = ref('')
const _pendingInlineSelection = ref<{ tabId: string; start: number; end: number } | null>(null)
const selectedChatAgent = computed({
  get: () => agentStore.selectedAgentId || '',
  set: (v: string) => { agentStore.selectedAgentId = v }
})
const selectedChatModel = computed({
  get: () => providerStore.activeGenerateProvider?.selectedModel || '',
  set: (v: string) => {
    const p = providerStore.activeGenerateProvider
    if (p) providerStore.updateProvider(p.id, { selectedModel: v })
  }
})
const messagesContainer = ref<HTMLElement | null>(null)
const isStreaming = ref(false)
const skillAreaOpen = ref(true)
const tokenCount = ref(0)

const currentAgentName = computed(() => {
  const a = agentStore.getAgent(selectedChatAgent.value)
  return a?.name || '默认'
})

const activeSkillNames = computed(() => {
  const skills = skillStore.skills.filter((s: any) => s.enabled)
  return skills.map((s: any) => s.name).join(', ')
})

const availableModels = computed(() => {
  const p = providerStore.activeGenerateProvider
  return p ? p.models : []
})

const configStatus = computed(() => {
  const p = providerStore.activeGenerateProvider
  if (p && p.apiKey) return 'API 已配置'
  return '未配置 API | 点击设置配置'
})
const syncedStepLabel = computed(() => {
  const tab = editorStore.activeTab
  if (!tab || !tab.mode) return ''
  const modeMap: Record<string, string> = {
    'vol-outline': '卷纲层',
    'ch-plot': '章节概要',
    'ch-body': '正文层'
  }
  return modeMap[tab.mode] || ''
})
const syncedAgentName = computed(() => {
  const tab = editorStore.activeTab
  if (!tab || !tab.mode) return ''
  const stepMap: Record<string, number> = {
    'vol-outline': 2,
    'ch-plot': 3,
    'ch-body': 4
  }
  const step = stepMap[tab.mode]
  if (step === undefined) return ''
  const agentId = pipelineStore.getStepAgents(step)
  if (!agentId) return ''
  const a = agentStore.getAgent(agentId)
  return a?.name || ''
})
const syncedSkillNames = computed(() => {
  const tab = editorStore.activeTab
  if (!tab || !tab.mode) return ''
  const stepMap: Record<string, number> = {
    'vol-outline': 2,
    'ch-plot': 3,
    'ch-body': 4
  }
  const step = stepMap[tab.mode]
  if (step === undefined) return ''
  const skillIds = pipelineStore.getStepSkills(step)
  if (!skillIds || skillIds.length === 0) return ''
  return skillIds.map((sid: string) => {
    const s = skillStore.skills.find((sk: any) => sk.id === sid)
    return s?.name || sid
  }).join(', ')
})

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

function syncChatProject() {
  chatStore.loadSessions(projectId.value)
  const tab = editorStore.activeTab
  if (tab) {
    chatStore.ensureSession(tab.id, tab.chapterId, tab.title, projectId.value)
    chatStore.setCurrentContext({
      tabId: tab.id,
      chapterId: tab.chapterId,
      title: tab.title,
      content: tab.content || '',
      mode: tab.mode || 'ch-body'
    })
  } else {
    chatStore.ensureSession('', '', '默认对话', projectId.value)
  }
}

watch(projectId, (nextId, previousId) => {
  if (nextId && nextId !== previousId) syncChatProject()
})

onMounted(() => {
  syncChatProject()
  window.addEventListener('editor-action', handleEditorAction)
})

function handleEditorAction(e: any) {
  const detail = e.detail
  if (detail && detail.action === 'inline-ai' && detail.prompt) {
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

async function sendMessage() {
  const projId = projectId.value
  let text = inputText.value.trim()
  if (!text || isStreaming.value) return
  const pendingOriginal = _pendingInlineOriginal.value
  _pendingInlineOriginal.value = ''

  chatStore.addMessage({ role: 'user', content: text, tabId: chatStore.currentContext?.tabId || '' }, projId)
  inputText.value = ''
  await nextTick()
  scrollToBottom()

  isStreaming.value = true
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
    const agent = agentStore.getAgent(selectedChatAgent.value)
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

    const chatCtx: Record<string, any> = {
      selectedText: text,
      userPrompt: text,
      outlineContent: projectStore.outlineText || '',
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
    const enabledSkills = skillStore.skills.filter((s: any) => s.enabled)
    if (enabledSkills.length > 0) {
      const skillText = enabledSkills.map((s: any) => {
        const ctxForSkill = { ...chatCtx, ...(s.customVars || {}) }
        return '【' + s.name + '】\n' + resolveSkillTemplate(s.template || '', ctxForSkill)
      }).join('\n\n')
      systemParts.push('生效中的技能：\n' + skillText)
    }

    const activeTab = editorStore.activeTab
    if (activeTab && activeTab.mode) {
      let ctxLabel = ''
      let ctxText = ''
      let ctxSkillIds: string[] = []
      const volumes = projectStore.volumes || []
      if (activeTab.mode === 'vol-outline') {
        ctxLabel = '卷纲纲要'
        const volIdx = volumes.findIndex((v: any) => v.id === activeTab.chapterId || v.name === activeTab.title)
        const vol = volIdx >= 0 ? volumes[volIdx] : null
        ctxText = vol ? (vol.outline || vol.summary || '') : ''
        chatCtx.volumeOutline = ctxText
        chatCtx.volumeCount = volumes.length
        ctxSkillIds = skillStore.pipelineSkills.filter((id: string, i: number) => i === 2)
      } else if (activeTab.mode === 'ch-plot') {
        ctxLabel = '章节剧情梗概'
        for (let vi = 0; vi < volumes.length; vi++) {
          const chs = projectStore.chapters[volumes[vi].id] || []
          const ch = chs.find((c: any) => c.id === activeTab.chapterId)
          if (ch) {
            ctxText = ch.plot || ''
            chatCtx.chapterSummary = ch.summary || ch.plot || ''
            chatCtx.chapterPlot = ch.plot || ''
            chatCtx.chapterCount = chs.length
            const chIdx = chs.indexOf(ch)
            const prevCh = chIdx > 0 ? chs[chIdx - 1] : null
            if (prevCh) chatCtx.prevChapterSummary = prevCh.summary || prevCh.plot || ''
            break
          }
        }
        ctxSkillIds = skillStore.pipelineSkills.filter((id: string, i: number) => i === 3)
      } else if (activeTab.mode === 'ch-body') {
        ctxLabel = '正文'
        ctxText = activeTab.content || ''
        chatCtx.chapterPlot = ctxText
        ctxSkillIds = skillStore.pipelineSkills.filter((id: string, i: number) => i === 4)
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
      if (ctxText) { systemParts.push('当前编辑内容（' + ctxLabel + '）：\n' + ctxText) }
      if (ctxSkillIds.length > 0) {
        const existingIds = new Set(enabledSkills.map(s => s.id))
        let ctxSkillText = ''
        ctxSkillIds.forEach(sid => {
          if (existingIds.has(sid)) return
          const sObj = skillStore.skills.find(s => s.id === sid)
          if (sObj && sObj.template) {
            const ctxForSkill = { ...chatCtx, ...(sObj.customVars || {}) }
            ctxSkillText += '\n【' + sObj.name + '】\n' + resolveSkillTemplate(sObj.template, ctxForSkill) + '\n'
          }
        })
        if (ctxSkillText) { systemParts.push('当前层级 Skill（' + ctxLabel + '）：' + ctxSkillText) }
      }
    }

    const memoryContext = retrieveContext(projectStore.memories, {
      chapterId: editorStore.activeTab?.chapterId,
      query: `${text} ${editorStore.activeTab?.title || ''}`,
      previousChapterSummary: chatCtx.prevChapterSummary,
      maxChars: 2000
    })
    if (memoryContext.text) systemParts.push(`相关记忆：\n${memoryContext.text}`)

    const systemPrompt = systemParts.join('\n\n---\n\n')
    const model = selectedChatModel.value || provider.selectedModel || 'gpt-4o'
    let maxDepth = 21
    for (let s = 0; s < enabledSkills.length; s++) {
      const d = enabledSkills[s].injectDepth
      if (d && d > 0 && d < maxDepth) maxDepth = d
    }

    // Skill/MCP/Agent 真实执行：调用本机 skill engine 做预加工，再用 MCP 暴露本地工具
    const engine = (window as any).SkillExecutionEngine
    const skillCtxSkills = enabledSkills.map((s: any) => ({
      name: s.name,
      template: s.template,
      executionMode: s.executionMode || 'chain',
      validate: s.validationRules || [],
      customVars: s.customVars || {}
    }))

    // 1) 有 engine 且选了明确 skill 时，先跑 engine 预加工
    if (engine && skillCtxSkills.length > 0) {
      const activeMode = skillCtxSkills[0].executionMode
      try {
        const _engineAiRequest = async (opts: any) => {
          const logStore = useExecutionLogStore()
          const aiSvc = createAiService(providerStore as any, logStore as any)
          const result = await aiSvc.callAi({
            purpose: 'generate',
            messages: opts.messages || [],
            model: opts.model || undefined,
            temperature: opts.temperature != null ? opts.temperature : undefined,
            maxTokens: opts.maxTokens || 128000,
            stream: opts.stream !== false,
            retry: true,
            meta: { source: 'ChatPanel.engine' },
            onChunk: opts.onChunk
          })
          return { text: result.text, reasoning: result.reasoning }
        }
        let engineResult: any = null
        if (activeMode === 'split-merge') {
          engineResult = await engine.splitMerge(text, skillCtxSkills, {
            aiRequest: _engineAiRequest,
            splitSize: 1000,
            stream: false,
            templateContext: chatCtx
          })
        } else if (activeMode === 'multi-step') {
          engineResult = await engine.multiStep(text, skillCtxSkills.slice(0, 4), {
            aiRequest: _engineAiRequest,
            splitSize: 1500,
            stream: false,
            templateContext: chatCtx
          })
        } else {
          engineResult = await engine.chain(text, skillCtxSkills, {
            aiRequest: _engineAiRequest,
            stream: false,
            templateContext: chatCtx
          })
        }
        if (engineResult && engineResult.text) {
          // engine 给的是加工后的输入，交给 AI 做最终生成
          text = engineResult.text
          console.log('[CHAT] SkillExecutionEngine 预加工完成，链上步骤: ' + (engineResult.reports?.length || 1))
        }
      } catch (engineErr) {
        console.warn('[CHAT] SkillExecutionEngine 预加工失败，回退直连', engineErr)
      }
    }

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
    } else {
      // 3) 常规对话走 callApi
      response = await callApi(provider, model, systemPrompt, text, maxDepth, projId)
    }
    if (response) {
      if (messages.value.length === 0 || messages.value[messages.value.length - 1].role !== 'assistant') {
        chatStore.addMessage({ role: 'assistant', content: response, tabId: chatStore.currentContext?.tabId || '' }, projId)
      }
    }
    if (pendingOriginal && response && pendingOriginal !== response) {
        window.dispatchEvent(new CustomEvent('show-diff', {
          detail: { original: pendingOriginal, modified: response }
        }));
    }
 } catch (e: any) {
   chatStore.addMessage({ role: 'assistant', content: '请求失败：' + (e?.message || String(e)), tabId: chatStore.currentContext?.tabId || '' }, projId)
 } finally {
    isStreaming.value = false
    await nextTick()
    scrollToBottom()
  }
}

async function callApi(provider: any, model: string, systemPrompt: string, userText: string, maxDepth: number, projId: string): Promise<string> {
  const histMsgs = chatStore.activeMessages
    .filter(m => m.role === 'user' || (m.role === 'assistant' && m.content))
    .slice(-maxDepth)
    .map(m => ({ role: m.role, content: m.content }))

  chatStore.addMessage({ role: 'assistant', content: '', tabId: chatStore.currentContext?.tabId || '' }, projId)

  const logStore = useExecutionLogStore()
  const aiService = createAiService(providerStore as any, logStore as any)
  const result = await aiService.callAi({
    purpose: 'generate',
    messages: [
      { role: 'system', content: systemPrompt },
      ...histMsgs
    ],
    model,
    temperature: provider.temperature ?? 0.7,
    maxTokens: 128000,
    stream: true,
    retry: true,
    meta: { source: 'ChatPanel.callApi' },
    onChunk: (text) => {
      chatStore.updateLastMessage(text)
      nextTick().then(() => scrollToBottom())
    }
  })

  if (result.text) {
    chatStore.updateLastMessage(result.text)
  }
  return result.text || ''
}

function copyMessage(content: string) {
  navigator.clipboard.writeText(content)
}

function regenerateMessage(index: number) {
  const msgs = chatStore.activeSession?.messages
  if (!msgs) return
  const msg = msgs[index]
  if (!msg || msg.role !== 'assistant') return
  msgs.splice(index, 1)
  const prevUser = msgs[index - 1]
  if (prevUser && prevUser.role === 'user') {
    inputText.value = prevUser.content
    msgs.splice(index - 1, 1)
    sendMessage()
  }
}

function insertToEditor(content: string) {
  const editor = document.getElementById('editor-content') as HTMLTextAreaElement | null
  if (editor && editorStore.activeTab) {
    const start = editor.selectionStart
    const end = editor.selectionEnd
    if (start !== end) {
      // 有选中：替换选中区间（插入语义）
      const val = editor.value
      editor.value = val.substring(0, start) + content + val.substring(end)
      editor.selectionStart = editor.selectionEnd = start + content.length
      editor.dispatchEvent(new Event('input', { bubbles: true }))
    } else {
      // 无选中：在光标处插入，不破坏原正文
      const val = editor.value
      editor.value = val.substring(0, start) + content + val.substring(end)
      editor.selectionStart = editor.selectionEnd = start + content.length
      editor.dispatchEvent(new Event('input', { bubbles: true }))
    }
  } else if (editorStore.activeTab) {
    // 编辑器 DOM 不可用时，退回 store 更新（追加到末尾）
    editorStore.updateContent(editorStore.activeTab.id, content)
  }
}

function replaceWhole(content: string) {
  const pending = _pendingInlineSelection.value
  const tab = editorStore.activeTab
  if (pending && tab && pending.tabId === tab.id && pending.end > pending.start) {
    const original = tab.content || ''
    const start = Math.max(0, Math.min(pending.start, original.length))
    const end = Math.max(start, Math.min(pending.end, original.length))
    editorStore.updateContent(tab.id, original.substring(0, start) + content + original.substring(end))
    _pendingInlineSelection.value = null
    return
  }
  if (tab && confirm('当前没有可用选区，将替换整章内容，确认继续？')) {
    editorStore.updateContent(tab.id, content)
  }
}

function clearMessages() { chatStore.clearSession() }

const handleClearChat = () => clearMessages()
window.addEventListener('clear-chat', handleClearChat)

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
  height: 40px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  font-size: var(--font-size-md);
  font-weight: 600;
}
.agent-selector {
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xs);
  padding: 4px 6px;
  font-size: var(--font-size-sm);
  height: 28px;
  outline: none;
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
  background: var(--accent);
  color: var(--text-on-accent);
  border: none;
  border-radius: var(--radius-sm);
  padding: 0 var(--space-md);
  min-width: 48px;
  height: 32px;
  cursor: pointer;
  font-size: var(--btn-font-size-md);
}
#btn-send:hover {
  background: var(--accent-hover);
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
.skill-area-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  cursor: pointer;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  user-select: none;
}
.skill-area-title { font-weight: 600; }
.skill-area-arrow { font-size: var(--font-size-xxs); transition: transform 0.2s; }
.skill-area-arrow.rotated { transform: rotate(-90deg); }
.skill-area-content { padding: 4px 12px 8px; }
.agent-info-bar { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.agent-info-label { font-size: var(--font-size-sm); background: var(--accent-dim); color: var(--accent-lighter); padding: 2px 6px; border-radius: var(--radius-xs); font-weight: 600; }
.agent-info-name { font-size: var(--font-size-md); color: var(--text-primary); font-weight: 500; }
.agent-info-model { font-size: var(--font-size-sm); color: var(--text-muted); margin-left: auto; }
.skill-list-active { font-size: var(--font-size-sm); color: var(--text-secondary); }
.token-bar { padding: 4px 12px 6px; font-size: var(--font-size-sm); color: var(--text-muted); }
.input-hint {
  padding: 4px 12px 8px;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}
</style>

