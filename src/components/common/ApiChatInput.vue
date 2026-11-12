<template>
  <div class="api-chat-input-root">
    <div class="api-chat-input-row">
      <textarea
        ref="textareaRef"
        :id="inputId"
        :value="modelValue"
        class="api-chat-input"
        :placeholder="placeholder"
        rows="1"
        @input="handleInput"
        @keydown="handleKeydown"
      ></textarea>
      <button
        v-if="showCancel"
        :id="cancelId"
        class="api-chat-btn api-chat-btn-cancel"
        type="button"
        @click="$emit('cancel')"
      >{{ cancelLabel }}</button>
      <button
        v-else
        :id="sendId"
        class="api-chat-btn api-chat-btn-send"
        type="button"
        :disabled="sendDisabled"
        :data-tooltip="sendDisabled ? '生成中' : '发送'"
        @click="$emit('send')"
      >{{ sendLabel }}</button>
      <button
        v-if="showReset"
        :id="resetId"
        class="api-chat-btn api-chat-btn-reset"
        type="button"
        :disabled="sendDisabled"
        @click="$emit('reset')"
      >{{ resetLabel }}</button>
    </div>
    <div class="api-chat-mode-row">
      <div class="api-chat-mode-switch" role="group" aria-label="输入模式">
        <button
          type="button"
          class="api-chat-mode-btn"
          :class="{ 'is-active': chatInputMode === 'enter-send' }"
          @click="setMode('enter-send')"
        >Enter 发送</button>
        <button
          type="button"
          class="api-chat-mode-btn"
          :class="{ 'is-active': chatInputMode === 'enter-newline' }"
          @click="setMode('enter-newline')"
        >Enter 换行</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useSettingsStore } from '../../stores/settings'

const props = defineProps<{
  modelValue: string
  placeholder?: string
  sendDisabled?: boolean
  sendLabel?: string
  cancelLabel?: string
  resetLabel?: string
  showCancel?: boolean
  showReset?: boolean
  inputId?: string
  sendId?: string
  cancelId?: string
  resetId?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'send'): void
  (e: 'cancel'): void
  (e: 'reset'): void
}>()

const settings = useSettingsStore()
const chatInputMode = computed(() => settings.chatInputMode)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
let autosizeFrame = 0

function setMode(mode: 'enter-send' | 'enter-newline') {
  settings.updateSettings({ chatInputMode: mode })
}

function autosize() {
  nextTick(() => {
    if (autosizeFrame) return
    autosizeFrame = requestAnimationFrame(() => {
      autosizeFrame = 0
      const el = textareaRef.value
      if (!el) return
      el.style.height = 'auto'
      el.style.height = Math.min(120, Math.max(60, el.scrollHeight)) + 'px'
    })
  })
}

function handleInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
  autosize()
}

function flushAutosize() {
  if (!autosizeFrame) return
  cancelAnimationFrame(autosizeFrame)
  autosizeFrame = 0
  autosize()
}

function handleKeydown(event: KeyboardEvent) {
  if (props.sendDisabled) return
  const isEnter = event.key === 'Enter'
  if (!isEnter) return
  if (chatInputMode.value === 'enter-send') {
    if (event.shiftKey) return
    event.preventDefault()
    emit('send')
  } else {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      emit('send')
    }
  }
  flushAutosize()
}

watch(() => props.modelValue, () => autosize())
onMounted(() => {
  autosize()
  nextTick(() => flushAutosize())
})
</script>

<style scoped>
.api-chat-input-root {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}
.api-chat-input-row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}
.api-chat-input {
  flex: 1;
  min-width: 0;
  min-height: 60px;
  max-height: 120px;
  resize: none;
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: var(--space-3) var(--space-4);
  font-size: var(--font-size-md);
  line-height: 1.6;
  overflow-y: auto;
}
.api-chat-input:focus {
  border-color: var(--accent);
}
.api-chat-btn {
  flex: 0 0 auto;
  height: 60px;
  min-width: 48px;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--font-size-sm);
  white-space: nowrap;
}
.api-chat-btn:disabled {
  cursor: wait;
  opacity: 0.65;
}
.api-chat-btn-send {
  background: var(--accent);
  color: var(--text-on-accent);
}
.api-chat-btn-cancel {
  background: var(--danger);
  color: var(--text-on-accent);
}
.api-chat-btn-reset {
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
}
.api-chat-mode-row {
  display: flex;
  justify-content: flex-end;
}
.api-chat-mode-switch {
  display: inline-flex;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xs);
  overflow: hidden;
}
.api-chat-mode-btn {
  border: none;
  background: transparent;
  color: var(--text-muted);
  padding: 2px 8px;
  font-size: var(--font-size-xxs);
  cursor: pointer;
}
.api-chat-mode-btn.is-active {
  background: var(--bg-hover);
  color: var(--text-primary);
}
</style>
