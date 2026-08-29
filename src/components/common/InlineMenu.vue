<template>
  <div v-if="visible" class="inline-menu" :style="{ left: x + 'px', top: y + 'px' }" @click.stop>
    <button v-for="action in actions" :key="action.key" class="inline-menu-btn" @click="handleAction(action.key)">
      {{ action.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  visible: boolean
  x: number
  y: number
  selectedText: string
}>()
const emit = defineEmits<{
  close: []
  action: [action: string, text: string]
}>()

const actions = [
  { key: 'rewrite', label: '改写' },
  { key: 'expand', label: '扩写' },
  { key: 'polish', label: '润色' },
  { key: 'regenerate', label: '重写' },
  { key: 'translate', label: '翻译' },
  { key: 'style', label: '风格' },
  { key: 'scene', label: '场景描写' },
  { key: 'dialogue', label: '对话生成' },
  { key: 'plot', label: '情节推演' },
  { key: 'inject', label: '上下文注入' },
  { key: 'continue', label: '续写' },
  { key: 'condense', label: '精简' },
  { key: 'modify', label: '修改' },
  { key: 'summary', label: '概括' },
  { key: 'character', label: '角色描写' },
  { key: 'environment', label: '环境描写' },
  { key: 'psychology', label: '心理描写' },
  { key: 'pacing', label: '节奏调整' },
  { key: 'foreshadow', label: '伏笔铺垫' },
  { key: 'conflict', label: '冲突强化' },
  { key: 'emotion', label: '情感强化' },
]

function handleAction(action: string) {
  emit('action', action, props.selectedText)
  emit('close')
}
</script>

<style scoped>
.inline-menu {
  position: fixed; z-index: 5000;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-panel-sm);
  padding: 4px;
  display: flex; flex-wrap: wrap; gap: 2px;
  max-width: 360px;
}
.inline-menu-btn {
  padding: 4px 10px; border: none; background: transparent;
  color: var(--text-primary); cursor: pointer; font-size: var(--font-size-sm);
  border-radius: var(--radius-xs); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;
}
.inline-menu-btn:hover { background: var(--bg-hover); color: var(--accent); }
</style>
