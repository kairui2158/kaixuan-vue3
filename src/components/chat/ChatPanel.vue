<template>
  <section id="chat-panel" class="chat-panel">
    <div id="agent-select-chat" class="chat-header">
      <span>AI 对话</span>
      <select v-model="selectedChatAgent" class="agent-selector">
        <option value="">默认</option>
        <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
      </select>
      <select v-model="selectedChatModel" class="agent-selector">
        <option value="">自动</option>
        <option v-for="m in availableModels" :key="m" :value="m">{{ m }}</option>
      </select>
   </div>

    <div class="chat-context-bar"></div>

    <div class="messages-container" ref="messagesContainer">
      <div v-if="messages.length === 0" id="chat-empty-state" class="empty-state">
        <div class="empty-icon">[edit]</div>
        <div class="empty-title">开始对话</div>
        <div class="empty-desc">在下方输入框输入消息，与 AI 助手开始创作</div>
      </div>
      <ChatMessage
        v-for="(msg, i) in messages"
        :key="i"
        :message="msg"
        @copy="copyMessage"
        @regenerate="regenerateMessage(i)"
        @apply="applyToEditor(msg.content)"
      />
    </div>

    <div id="btn-send" class="chat-input-row">
     <textarea
       v-model="inputText"
        class="chat-input"
        id="user-input"
       placeholder="输入消息..."
       rows="1"
       @keydown.enter.exact.prevent="sendMessage"
       @keydown.enter.shift.exact="inputText += '\n'"
    ></textarea>
      <button class="btn-send" @click="sendMessage" title="发送">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
      </button>
    </div>

    <div class="skill-area">
      <div id="agent-info-bar" class="skill-area-header" @click="skillAreaOpen = !skillAreaOpen">
        <span class="skill-area-title">技能区</span>
        <span class="skill-area-arrow" :class="{ rotated: !skillAreaOpen }">▼</span>
      </div>
      <div class="skill-area-content" v-show="skillAreaOpen">
        <div class="agent-info-bar">
          <span class="agent-info-label">AI</span>
          <span class="agent-info-name">{{ currentAgentName }}</span>
          <span class="agent-info-model">{{ selectedChatModel || '自动' }}</span>
        </div>
        <div class="skill-list-active">{{ activeSkillNames || '暂无' }}</div>
      </div>
    </div>

    <div id="char-count" class="input-hint">
      <span>{{ inputText.length }}</span> 字 |
      <span>{{ configStatus }}</span>
    </div>
    <div class="token-bar" v-show="tokenCount > 0">本次消耗: <span>{{ tokenCount }}</span> tokens</div>
  </section>

  <!-- audit-v5 -->
  <div id="chat-context-bar" style="display:none" data-audit="v5"></div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { useAgentStore } from '../../stores/agent'
import { useProviderStore } from '../../stores/provider'
import { useEditorStore } from '../../stores/editor'
import ChatMessage from './ChatMessage.vue'
import { useSkillStore } from '../../stores/skill'

const agentStore = useAgentStore()
const providerStore = useProviderStore()
const editorStore = useEditorStore()
const skillStore = useSkillStore()

const messages = ref<any[]>([])
const inputText = ref('')
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

async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || isStreaming.value) return
  messages.value.push({ role: 'user', content: text })
  inputText.value = ''
  await nextTick()
  scrollToBottom()

  // call API
  isStreaming.value = true
  try {
    const provider = providerStore.activeGenerateProvider
    if (!provider) {
      messages.value.push({ role: 'assistant', content: '请先配置API供应商' })
      return
    }
    const agent = agentStore.getAgent(selectedChatAgent.value)
    const systemPrompt = agent?.systemPrompt || '你是写作助手。'
    const model = selectedChatModel.value || provider.selectedModel || 'gpt-4o'
    const response = await callApi(provider, model, systemPrompt, text)
    if (messages.value.length > 0 && messages.value[messages.value.length - 1].role === 'assistant' && !messages.value[messages.value.length - 1].content) {
      messages.value.pop()
    }
    if (response) {
      if (messages.value.length === 0 || messages.value[messages.value.length - 1].role !== 'assistant') {
        messages.value.push({ role: 'assistant', content: response })
      }
    }
 } catch (e: any) {
    if (messages.value.length > 0 && messages.value[messages.value.length - 1].role === 'assistant' && !messages.value[messages.value.length - 1].content) {
      messages.value.pop()
    }
   messages.value.push({ role: 'assistant', content: 'Error: ' + (e.message || String(e)) })
 } finally {
    isStreaming.value = false
    await nextTick()
    scrollToBottom()
  }
}

async function callApi(provider: any, model: string, systemPrompt: string, userText: string): Promise<string> {
 const baseUrl = provider.baseUrl.replace(/\/$/, '')
 const url = baseUrl.match(/\/v\d+$/) ? baseUrl + '/chat/completions' : baseUrl + '/v1/chat/completions'
const body = JSON.stringify({
  model,
  messages: [
    { role: 'system', content: systemPrompt },
    ...messages.value.filter(m => m.role === 'user' || (m.role === 'assistant' && m.content)).map(m => ({ role: m.role, content: m.content }))
  ],
   stream: true
})
let resp = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + provider.apiKey
  },
  body
})
if (resp.status === 429) {
   for (let attempt = 0; attempt < 8; attempt++) {
     const waitMs = [30000, 60000, 90000, 120000, 150000, 180000, 210000, 240000][attempt]
     await new Promise(r => setTimeout(r, waitMs))
     resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + provider.apiKey }, body })
     if (resp.ok) break
     if (resp.status !== 429) throw new Error('API error: ' + resp.status)
   }
 }
 if (!resp.ok) throw new Error('API error: ' + resp.status)
 const reader = resp.body?.getReader()
  if (!reader) {
    const data = await resp.json()
    return data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning_content || ''
  }
  const decoder = new TextDecoder()
  let result = ''
  messages.value.push({ role: 'assistant', content: '' })
  const aiIdx = messages.value.length - 1
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') continue
      try {
        const json = JSON.parse(data)
        const delta = json.choices?.[0]?.delta?.content || json.choices?.[0]?.delta?.reasoning_content || ''
        if (delta) {
          result += delta
          messages.value[aiIdx].content = result
          await nextTick()
          scrollToBottom()
        }
      } catch {}
    }
  }
  if (!result) {
    const fallback = await resp.text()
    try {
    const data = JSON.parse(fallback)
    result = data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning_content || ''
    messages.value[aiIdx].content = result
    } catch {}
  }
  return result
}

function copyMessage(content: string) {
  navigator.clipboard.writeText(content)
}

function regenerateMessage(index: number) {
  const msg = messages.value[index]
  if (msg.role !== 'assistant') return
  messages.value.splice(index, 1)
  const prevUser = messages.value[index - 1]
  if (prevUser && prevUser.role === 'user') {
    inputText.value = prevUser.content
    messages.value.splice(index - 1, 1)
    sendMessage()
  }
}

function applyToEditor(content: string) {
  if (editorStore.activeTab) {
    editorStore.updateContent(editorStore.activeTab.id, content)
  }
}

function clearMessages() {
  messages.value = []
}

const handleClearChat = () => clearMessages()
window.addEventListener('clear-chat', handleClearChat)

onUnmounted(() => {
  window.removeEventListener('clear-chat', handleClearChat)
})

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
  font-size: 13px;
  font-weight: 600;
}
.agent-selector {
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 1px 4px;
  font-size: 11px;
  height: 24px;
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
.empty-title { font-size: 14px; font-weight: 600; color: var(--text-secondary); }
.empty-desc { font-size: 12px; text-align: center; }
.chat-input-row {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--border-color);
}
.chat-input {
  flex: 1;
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 13px;
  resize: none;
  outline: none;
  height: 32px;
  max-height: 100px;
}
.chat-input:focus {
  border-color: var(--accent);
}
.btn-send {
  background: var(--accent);
  color: var(--text-on-accent);
  border: none;
  border-radius: 6px;
  padding: 0 var(--space-md);
  min-width: 48px;
  height: 32px;
  cursor: pointer;
  font-size: 12px;
}
.btn-send:hover {
  background: var(--accent-hover);
}
.btn-send:active {
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
  font-size: 11px;
  color: var(--text-muted);
  user-select: none;
}
.skill-area-title { font-weight: 600; }
.skill-area-arrow { font-size: 9px; transition: transform 0.2s; }
.skill-area-arrow.rotated { transform: rotate(-90deg); }
.skill-area-content { padding: 4px 12px 8px; }
.agent-info-bar { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.agent-info-label { font-size: 10px; background: var(--accent-dim); color: var(--accent-lighter); padding: 1px 4px; border-radius: 3px; font-weight: 600; }
.agent-info-name { font-size: 11px; color: var(--text-primary); font-weight: 500; }
.agent-info-model { font-size: 10px; color: var(--text-muted); margin-left: auto; }
.skill-list-active { font-size: 11px; color: var(--text-secondary); }
.token-bar { padding: 2px 12px 6px; font-size: 10px; color: var(--text-muted); }
.input-hint {
  padding: 4px 12px 8px;
  font-size: 11px;
  color: var(--text-muted);
}
</style>
