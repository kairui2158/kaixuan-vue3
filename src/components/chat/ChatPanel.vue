<template>
  <section class="chat-panel">
    <div class="chat-header">
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

    <div class="messages-container" ref="messagesContainer">
      <div v-if="messages.length === 0" class="empty-state">
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

    <div class="chat-input-row">
      <textarea
        v-model="inputText"
        class="chat-input"
        placeholder="输入消息..."
        rows="1"
        @keydown.enter.exact.prevent="sendMessage"
        @keydown.enter.shift.exact="inputText += '\n'"
      ></textarea>
      <button class="btn-send" @click="sendMessage">send</button>
    </div>

    <div class="input-hint">
      <span>{{ inputText.length }}</span> 字 |
      <span>{{ configStatus }}</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted } from 'vue'
import { useAgentStore } from '../../stores/agent'
import { useProviderStore } from '../../stores/provider'
import { useEditorStore } from '../../stores/editor'
import ChatMessage from './ChatMessage.vue'

const agentStore = useAgentStore()
const providerStore = useProviderStore()
const editorStore = useEditorStore()

const messages = ref<any[]>([])
const inputText = ref('')
const selectedChatAgent = ref('')
const selectedChatModel = ref('')
const messagesContainer = ref<HTMLElement | null>(null)
const isStreaming = ref(false)

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
    messages.value.push({ role: 'assistant', content: response })
  } catch (e: any) {
    messages.value.push({ role: 'assistant', content: 'Error: ' + (e.message || String(e)) })
  } finally {
    isStreaming.value = false
    await nextTick()
    scrollToBottom()
  }
}

async function callApi(provider: any, model: string, systemPrompt: string, userText: string): Promise<string> {
  const baseUrl = provider.baseUrl.replace(/\/$/, '')
  const url = baseUrl + '/v1/chat/completions'
  const body = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userText }
    ],
    stream: false
  })
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + provider.apiKey
    },
    body
  })
  if (!resp.ok) throw new Error('API error: ' + resp.status)
  const data = await resp.json()
  return data.choices?.[0]?.message?.content || ''
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

function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}
</script>

<style scoped>
.chat-panel {
  width: 320px;
  min-width: 240px;
  max-width: 500px;
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
  background: var(--accent-gradient);
  color: var(--text-on-accent);
  border: none;
  border-radius: 6px;
  padding: 0 16px;
  height: 32px;
  cursor: pointer;
  font-size: 12px;
}
.btn-send:hover {
  opacity: 0.9;
}
.input-hint {
  padding: 4px 12px 8px;
  font-size: 11px;
  color: var(--text-muted);
}
</style>
