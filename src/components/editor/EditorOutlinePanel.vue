<template>
  <aside v-if="visible" id="editor-outline-panel" class="editor-outline-panel" aria-label="大纲导航">
    <header class="editor-outline-header">
      <strong id="editor-outline-title">大纲导航</strong>
      <button
        id="btn-editor-outline-collapse"
        class="editor-outline-close"
        type="button"
        aria-label="收起大纲导航"
        @click="emit('close')"
      ><AppIcon name="x" /></button>
    </header>
    <div v-if="headings.length === 0" id="editor-outline-empty" class="editor-outline-empty">
      当前文档没有可导航的标题
    </div>
    <nav v-else id="editor-outline-list" class="editor-outline-list">
      <button
        v-for="heading in headings"
        :id="'editor-outline-item-' + heading.id"
        :key="heading.id"
        class="editor-outline-item"
        :style="{ paddingLeft: `${Math.min(heading.level - 1, 5) * 12 + 12}px` }"
        type="button"
        :title="`第 ${heading.line + 1} 行`"
        @click="emit('locate', heading)"
      >
        <span class="editor-outline-level">H{{ heading.level }}</span>
        <span class="editor-outline-text">{{ heading.title }}</span>
        <span class="editor-outline-line">{{ heading.line + 1 }}</span>
      </button>
    </nav>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import { computeEditorOutline, type EditorOutlineHeading } from '../../services/editorOutline'

const props = defineProps<{
  visible: boolean
  content: string
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'locate', heading: EditorOutlineHeading): void
}>()

const headings = computed(() => computeEditorOutline(props.content))
</script>

<style scoped>
.editor-outline-panel {
  width: 280px;
  flex: 0 0 280px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-left: 1px solid var(--border-color);
  background: var(--bg-secondary);
}
.editor-outline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: 40px;
  padding: 0 var(--space-3) 0 var(--space-5);
  border-bottom: 1px solid var(--border-color);
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  flex-shrink: 0;
}
.editor-outline-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.editor-outline-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.editor-outline-empty {
  padding: var(--space-5);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}
.editor-outline-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--space-2);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.editor-outline-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-width: 0;
  height: 30px;
  padding-right: var(--space-3);
  border: none;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  text-align: left;
  cursor: pointer;
}
.editor-outline-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.editor-outline-level {
  flex: 0 0 auto;
  color: var(--text-muted);
  font-size: var(--font-size-xs);
}
.editor-outline-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.editor-outline-line {
  flex: 0 0 auto;
  color: var(--text-muted);
  font-size: var(--font-size-xs);
}
@media (max-width: 1279px) {
  .editor-outline-panel {
    width: 240px;
    flex-basis: 240px;
  }
}
@media (max-width: 760px) {
  .editor-outline-panel {
    display: none;
  }
}
</style>
