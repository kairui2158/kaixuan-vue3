<template>
  <div v-if="visible" id="ctx-menu" class="context-menu" :style="{ left: x + 'px', top: y + 'px' }" @click.stop>
    <button v-for="item in items" :key="item.action" class="ctx-menu-btn" @click="handleClick(item.action)">
      {{ item.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  visible: boolean
  x: number
  y: number
  nodeId?: string
  volumeId?: string
}>()
const emit = defineEmits<{
  close: []
  action: [action: string, nodeId?: string, volumeId?: string]
}>()

const items = [
  { action: 'ctx-bind-skill', label: '绑定技能' },
  { action: 'ctx-gen-chapters', label: '生成章节' },
  { action: 'ctx-gen-body', label: '生成正文' },
  { action: 'ctx-edit', label: '编辑' },
  { action: 'ctx-delete', label: '删除' },
  { action: 'ctx-rename', label: '重命名' },
]

function handleClick(action: string) {
  emit('action', action, props.nodeId, props.volumeId)
  emit('close')
}
</script>

<style scoped>
.context-menu {
  position: fixed; z-index: 5000;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  padding: 4px 0;
  min-width: 140px;
}
.ctx-menu-btn {
  display: block; width: 100%; text-align: left;
  padding: 6px 16px; border: none; background: transparent;
  color: var(--text-primary); cursor: pointer; font-size: var(--font-size-md);
}
.ctx-menu-btn:hover { background: var(--bg-hover); }
</style>
