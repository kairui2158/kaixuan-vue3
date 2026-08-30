<template>
  <div class="chat-message" :class="message.role">
    <div class="message-bubble" :class="message.role">
      <div class="message-content" v-html="renderedContent"></div>
      <div class="message-actions" v-if="message.role === 'assistant'">
        <button class="msg-btn" :disabled="busy" title="复制" @click="runAction('copy', message.content)">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          <span>复制</span>
        </button>
        <button class="msg-btn" :disabled="busy" title="重新生成" @click="runAction('regenerate')">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
          <span>重生成</span>
        </button>
        <button class="msg-btn" :disabled="busy" title="插入到光标处" @click="runAction('apply', message.content)">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          <span>插入</span>
        </button>
        <button class="msg-btn" :disabled="busy" title="整章替换为消息内容" @click="runAction('replace', message.content)">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M3 16v5h5"/><path d="M16 21h5v-5"/>
          </svg>
          <span>替换</span>
        </button>
        <span v-if="actionFeedback" class="action-feedback" role="status">{{ actionFeedback }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { marked } from 'marked'

const props = defineProps<{ message: { role: string; content: string }; busy?: boolean }>()
const actionFeedback = ref('')
const emit = defineEmits<{
  copy: [string]
  regenerate: []
  replace: [string]
  apply: [string]
}>()

function runAction(action: 'copy' | 'regenerate' | 'apply' | 'replace', content?: string) {
  if (props.busy) return
  actionFeedback.value = action === 'copy' ? '已复制' : action === 'apply' ? '已插入' : action === 'replace' ? '已替换' : '生成中'
  window.setTimeout(() => { actionFeedback.value = '' }, 1400)
  if (action === 'copy') emit('copy', content || '')
  else if (action === 'regenerate') emit('regenerate')
  else if (action === 'apply') emit('apply', content || '')
  else emit('replace', content || '')
}

const renderedContent = computed(() => {
  const content = props.message.content || ''
  const html = marked.parse(content, { breaks: true }) as string
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
})
</script>

<style scoped>
.chat-message {
  display: flex;
  margin-bottom: 12px;
  content-visibility: auto;
  contain-intrinsic-size: auto 160px;
}
.chat-message.user {
  justify-content: flex-end;
}
.chat-message.assistant {
  justify-content: flex-start;
}
.message-bubble {
  width: fit-content;
  max-width: min(92%, 72ch);
  min-width: 0;
  box-sizing: border-box;
  padding: var(--space-5) var(--space-6);
  border-radius: var(--radius-lg);
  font-size: var(--font-size-lg);
  line-height: 1.75;
  overflow-wrap: anywhere;
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
  background: var(--chat-action-bg);
  padding: 1px 4px;
  border-radius: var(--radius-xs);
  font-size: var(--font-size-lg);
  overflow-wrap: anywhere;
}
.message-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  opacity: 0.6;
  transition: var(--transition-fast);
}
.message-bubble:hover .message-actions {
  opacity: 1;
}
.msg-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 30px;
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  border-radius: var(--radius-xs);
  padding: 4px 10px;
  font-size: var(--font-size-sm);
  line-height: 1.3;
  white-space: nowrap;
  cursor: pointer;
}
.msg-btn:hover {
  background: var(--chat-action-bg-hover);
  color: var(--text-primary);
}
.msg-btn:disabled {
  cursor: wait;
  opacity: 0.5;
}
.action-feedback {
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  white-space: nowrap;
}

/* C-01: Markdown rendering styles (ported from old arch style.css) */
.message-content :deep(h1) { font-size: 1.4em; font-weight: 600; margin: 12px 0 6px; color: var(--text-primary); }
.message-content :deep(h2) { font-size: 1.2em; font-weight: 600; margin: 10px 0 4px; color: var(--text-primary); }
.message-content :deep(h3) { font-size: 1.05em; font-weight: 600; margin: 8px 0 4px; color: var(--text-secondary); }
.message-content :deep(p) { margin: 4px 0; }
.message-content :deep(ul), .message-content :deep(ol) { margin: 4px 0; padding-left: 20px; }
.message-content :deep(li) { margin: 4px 0; }
.message-content :deep(pre) {
  background: var(--bg-primary); border: 1px solid var(--border-color);
  border-radius: var(--radius-sm); overflow-x: auto; margin: 8px 0;
  padding: 12px; font-size: var(--font-size-lg); line-height: 1.6;
  max-width: 100%; box-sizing: border-box;
}
.message-content :deep(pre code) {
  background: none; color: var(--text-primary); padding: 0; font-size: inherit;
}
.message-content :deep(blockquote) {
  border-left: 3px solid var(--accent); margin: 8px 0; padding: 4px 16px;
  color: var(--text-secondary); background: var(--bg-tertiary);
  border-radius: 0 4px 4px 0;
}
.message-content :deep(table) {
  border-collapse: collapse; margin: 8px 0; width: 100%; font-size: var(--font-size-lg);
  display: block; overflow-x: auto; max-width: 100%;
}
.message-content :deep(th), .message-content :deep(td) {
  border: 1px solid var(--border-color); padding: 6px 14px; text-align: left;
}
.message-content :deep(th) { background: var(--bg-tertiary); font-weight: 600; }
.message-content :deep(strong) { color: var(--text-primary); }
.message-content :deep(a) { color: var(--accent); text-decoration: none; }
.message-content :deep(a:hover) { text-decoration: underline; }
.message-content :deep(hr) { border: none; border-top: 1px solid var(--border-color); margin: 16px 0; }
.message-content :deep(em) { color: var(--text-secondary); }
.message-content {
  max-width: 100%;
  min-width: 0;
  overflow: visible;
  word-break: break-word;
  overflow-wrap: anywhere;
  user-select: text;
  cursor: text;
}
.message-content :deep(a) {
  overflow-wrap: anywhere;
  word-break: break-word;
}
</style>
