<template>
  <div class="ow-overlay" @click.self="$emit('close')">
    <div class="ow-content">
      <div class="ow-header">
        <span>大纲工作台</span>
        <button class="modal-close" @click="$emit('close')">x</button>
      </div>
      <div class="ow-body">
        <div class="ow-editor">
          <textarea
            v-model="projectStore.outlineText"
            class="ow-textarea"
            placeholder="在此输入或编辑你的小说大纲..."
          ></textarea>
        </div>
        <div class="ow-chat">
          <div class="ow-chat-header">AI共创</div>
          <div class="ow-messages" ref="msgContainer">
            <div v-for="(msg, i) in messages" :key="i" class="ow-msg" :class="msg.role">
              <div class="ow-msg-bubble" v-html="renderMarkdown(msg.content)"></div>
            </div>
          </div>
          <div class="ow-input-row">
            <input v-model="inputText" class="ow-input" placeholder="和AI讨论大纲..." @keydown.enter="sendMessage" />
            <button class="btn-send" @click="sendMessage">send</button>
          </div>
        </div>
      </div>
      <div class="ow-footer">
        <button class="btn-primary" @click="saveOutline">保存大纲</button>
        <button class="btn-secondary" @click="projectStore.lockOutline()" :disabled="!projectStore.hasOutline">锁定大纲</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { useProjectStore } from '../../stores/project'
import { useProviderStore } from '../../stores/provider'

defineEmits<{ close: [] }>()

const projectStore = useProjectStore()
const providerStore = useProviderStore()
const messages = ref<any[]>([])
const inputText = ref('')
const msgContainer = ref<HTMLElement | null>(null)

function renderMarkdown(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
}

function saveOutline() {
  projectStore.setOutline(projectStore.outlineText)
}

async function sendMessage() {
  const text = inputText.value.trim()
  if (!text) return
  messages.value.push({ role: 'user', content: text })
  inputText.value = ''
  await nextTick()
  if (msgContainer.value) msgContainer.value.scrollTop = msgContainer.value.scrollHeight

  try {
    const provider = providerStore.activeGenerateProvider
    if (!provider) {
      messages.value.push({ role: 'assistant', content: '请先配置API供应商' })
      return
    }
    const url = provider.baseUrl.replace(/\/$/, '') + '/v1/chat/completions'
    const model = provider.selectedModel || 'gpt-4o'
    const systemPrompt = '你是小说大纲创作助手。用户正在编辑大纲，请给出建议和修改意见。'
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + provider.apiKey },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: '当前大纲:\n' + projectStore.outlineText + '\n\n用户请求: ' + text }], stream: false })
    })
    if (!resp.ok) throw new Error('API error: ' + resp.status)
    const data = await resp.json()
    messages.value.push({ role: 'assistant', content: data.choices?.[0]?.message?.content || '' })
  } catch (e: any) {
    messages.value.push({ role: 'assistant', content: 'Error: ' + e.message })
  }
  await nextTick()
  if (msgContainer.value) msgContainer.value.scrollTop = msgContainer.value.scrollHeight
}
</script>

<style scoped>
.ow-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: var(--bg-overlay); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.ow-content { width: 1000px; height: 700px; background: var(--bg-glass); border: 1px solid var(--border-color); border-radius: 12px; box-shadow: var(--shadow-lg); display: flex; flex-direction: column; }
.ow-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; border-bottom: 1px solid var(--border-color); font-size: 16px; font-weight: 600; }
.modal-close { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 18px; }
.modal-close:hover { color: var(--danger); }
.ow-body { flex: 1; display: flex; overflow: hidden; }
.ow-editor { flex: 1; padding: 16px; }
.ow-textarea { width: 100%; height: 100%; background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 16px; font-size: 14px; line-height: 1.8; resize: none; outline: none; }
.ow-chat { width: 360px; border-left: 1px solid var(--border-color); display: flex; flex-direction: column; }
.ow-chat-header { padding: 8px 16px; border-bottom: 1px solid var(--border-color); font-size: 13px; font-weight: 600; color: var(--text-secondary); }
.ow-messages { flex: 1; overflow-y: auto; padding: 12px; }
.ow-msg { margin-bottom: 10px; }
.ow-msg.user { text-align: right; }
.ow-msg-bubble { display: inline-block; max-width: 85%; padding: 8px 12px; border-radius: 10px; font-size: 12px; line-height: 1.6; text-align: left; }
.ow-msg.user .ow-msg-bubble { background: var(--user-bubble); }
.ow-msg.assistant .ow-msg-bubble { background: var(--ai-bubble); border: 1px solid var(--border-color); }
.ow-input-row { display: flex; gap: 6px; padding: 8px 12px; border-top: 1px solid var(--border-color); }
.ow-input { flex: 1; background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 10px; font-size: 12px; height: 28px; outline: none; }
.btn-send { background: var(--accent-gradient); color: var(--text-on-accent); border: none; border-radius: 6px; padding: 0 12px; height: 28px; cursor: pointer; font-size: 11px; }
.ow-footer { display: flex; gap: 8px; padding: 12px 24px; border-top: 1px solid var(--border-color); justify-content: flex-end; }
.btn-primary { background: var(--accent-gradient); color: var(--text-on-accent); border: none; border-radius: 6px; padding: 8px 20px; cursor: pointer; font-size: 13px; }
.btn-secondary { background: transparent; color: var(--text-secondary); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 20px; cursor: pointer; font-size: 13px; }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
