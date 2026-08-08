<template>
  <div class="chat-message" :class="message.role">
    <div class="message-bubble" :class="message.role">
      <div class="message-content" v-html="renderedContent"></div>
      <div class="message-actions" v-if="message.role === 'assistant'">
        <button class="msg-btn" title="复制" @click="$emit('copy', message.content)">copy</button>
        <button class="msg-btn" title="重新生成" @click="$emit('regenerate')">redo</button>
        <button class="msg-btn" title="应用到编辑区" @click="$emit('apply', message.content)">apply</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ message: { role: string; content: string } }>()
defineEmits<{
  copy: [string]
  regenerate: []
  apply: [string]
}>()

const renderedContent = computed(() => {
  let html = props.message.content || ''
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/`(.+?)`/g, '<code>$1</code>')
  html = html.replace(/\n/g, '<br>')
  return html
})
</script>

<style scoped>
.chat-message {
  display: flex;
  margin-bottom: 12px;
}
.chat-message.user {
  justify-content: flex-end;
}
.chat-message.assistant {
  justify-content: flex-start;
}
.message-bubble {
  max-width: 80%;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.6;
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
.message-content :deep(code) {
  background: var(--bg-input);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 12px;
}
.message-actions {
  display: flex;
  gap: 4px;
  margin-top: 8px;
  opacity: 0.6;
  transition: var(--transition-fast);
}
.message-bubble:hover .message-actions {
  opacity: 1;
}
.msg-btn {
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 10px;
  cursor: pointer;
}
.msg-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
</style>
