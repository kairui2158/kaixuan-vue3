<template>
  <div v-if="hunks.length || view.stale" class="editor-diff-layer" data-testid="editor-diff-layer">
    <button
      class="diff-layer-toggle"
      type="button"
      @click="expanded = !expanded"
    >{{ expanded ? '收起改动明细' : `查看改动明细（${hunks.length} 处）` }}</button>
    <div v-if="expanded" class="diff-layer-body">
      <div v-if="view.reason" class="diff-layer-stale">{{ view.reason }}</div>
      <ol class="diff-hunk-list">
        <li
          v-for="hunk in hunks"
          :key="hunk.index"
          class="diff-hunk"
          :class="[`is-${hunk.kind}`, `is-${hunk.status}`]"
        >
          <div class="diff-hunk-header">
            <span>{{ hunkLabels[hunk.kind] || hunk.operation }}</span>
            <button
              class="diff-hunk-action"
              type="button"
              :disabled="busy || stale"
              :data-tooltip="stale ? '编辑器版本已变化，禁止单条回滚' : '回滚这一条修改'"
              @click="$emit('rollback-hunk', hunk.index)"
            >回滚此条</button>
          </div>
          <div v-if="hunk.beforeText" class="diff-text is-before">- {{ hunk.beforeText }}</div>
          <div v-if="hunk.afterText" class="diff-text is-after">+ {{ hunk.afterText }}</div>
          <button
            class="diff-hunk-location"
            type="button"
            :disabled="stale"
            @click="$emit('reveal-hunk', hunk)"
          >定位</button>
        </li>
      </ol>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  resolveEditorDiffHunkView,
  type EditorDiffHunk,
  type EditorEditBatchPlanLike,
} from '../../services/editorDiffHunks'

const props = defineProps<{
  batchPlan: EditorEditBatchPlanLike
  currentContent: string
  storedHunks?: EditorDiffHunk[]
  busy?: boolean
}>()

defineEmits<{
  'rollback-hunk': [index: number]
  'reveal-hunk': [hunk: EditorDiffHunk]
}>()

const expanded = ref(false)
const hunkLabels: Record<string, string> = {
  insert: '新增',
  remove: '删除',
  replace: '替换',
}

const view = computed(() => resolveEditorDiffHunkView(props.batchPlan, {
  currentContent: props.currentContent,
  storedHunks: props.storedHunks,
}))
const hunks = computed(() => view.value.hunks)
const stale = computed(() => view.value.stale)
</script>

<style scoped>
.editor-diff-layer {
  display: grid;
  gap: 6px;
}

.diff-layer-toggle,
.diff-hunk-action,
.diff-hunk-location {
  border: 1px solid currentColor;
  border-radius: 4px;
  color: inherit;
  padding: 2px 6px;
}

.diff-layer-body {
  display: grid;
  gap: 6px;
}

.diff-layer-stale {
  color: #b45309;
  font-size: 12px;
}

.diff-hunk-list {
  display: grid;
  gap: 6px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.diff-hunk {
  border: 1px solid rgba(127, 127, 127, 0.2);
  border-radius: 4px;
  display: grid;
  gap: 4px;
  padding: 6px;
}

.diff-hunk-header {
  align-items: center;
  display: flex;
  font-size: 12px;
  gap: 6px;
  justify-content: space-between;
}

.diff-text {
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
}

.diff-text.is-before {
  color: #b91c1c;
}

.diff-text.is-after {
  color: #15803d;
}

.diff-hunk.is-stale {
  opacity: 0.6;
}
</style>
