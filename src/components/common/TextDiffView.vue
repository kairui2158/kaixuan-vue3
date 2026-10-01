<template>
  <div class="tdv" :class="{ 'is-single': singleColumn }">
    <div v-if="diff.reason" class="tdv-reason">{{ diff.reason }}</div>
    <div v-if="diff.mode === 'stats'" class="tdv-stats">
      <span>A：{{ diff.stats.aLines }} 行 / {{ diff.stats.aChars }} 字符</span>
      <span>B：{{ diff.stats.bLines }} 行 / {{ diff.stats.bChars }} 字符</span>
      <span>相同 {{ diff.stats.unchanged }} / 新增 {{ diff.stats.added }} / 删除 {{ diff.stats.removed }}</span>
    </div>
    <template v-else-if="diff.same">
      <div class="tdv-stats"><span>两侧内容完全相同。</span></div>
      <pre class="tdv-text">{{ visibleChanges.map(change => change.text).join('\n') }}</pre>
    </template>
    <template v-else>
      <div class="tdv-toolbar">
        <button type="button" class="btn-sm btn-secondary" @click="singleColumn = !singleColumn">
          {{ singleColumn ? '双栏对照' : '单栏上下' }}
        </button>
        <button v-if="hasMoreLines" type="button" class="btn-sm btn-secondary" @click="showAll = !showAll">
          {{ showAll ? '折叠到前 300 行' : '展开全部' }}
        </button>
        <span v-if="hasMoreLines">共 {{ diff.changes?.length || 0 }} 行</span>
      </div>
      <div v-if="singleColumn" class="tdv-single">
        <div
          v-for="(change, index) in visibleChanges"
          :key="index"
          class="tdv-line"
          :class="'is-' + change.type"
        >
          <span class="tdv-marker">{{ marker(change.type) }}</span>
          <pre>{{ change.text }}</pre>
        </div>
      </div>
      <div v-else class="tdv-columns">
        <div class="tdv-column" aria-label="A 侧内容">
          <strong>A</strong>
          <div
            v-for="(change, index) in visibleChanges"
            :key="'a-' + index"
            class="tdv-line"
            :class="['is-removed', 'is-unchanged'].includes('is-' + change.type) ? 'is-' + change.type : 'is-empty'"
          >
            <span class="tdv-marker">{{ change.type === 'removed' ? '-' : '' }}</span>
            <pre>{{ change.type === 'added' ? '' : change.text }}</pre>
          </div>
        </div>
        <div class="tdv-column" aria-label="B 侧内容">
          <strong>B</strong>
          <div
            v-for="(change, index) in visibleChanges"
            :key="'b-' + index"
            class="tdv-line"
            :class="['is-added', 'is-unchanged'].includes('is-' + change.type) ? 'is-' + change.type : 'is-empty'"
          >
            <span class="tdv-marker">{{ change.type === 'added' ? '+' : '' }}</span>
            <pre>{{ change.type === 'removed' ? '' : change.text }}</pre>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TextDiff } from '../../services/runTraceDiff'

const props = defineProps<{
  diff: TextDiff
}>()

defineOptions({ name: 'TextDiffView' })

const singleColumn = ref(false)
const showAll = ref(false)
const PREVIEW_LINES = 300
const visibleChanges = computed(() => {
  const changes = props.diff.changes || []
  return showAll.value ? changes : changes.slice(0, PREVIEW_LINES)
})
const hasMoreLines = computed(() => (props.diff.changes?.length || 0) > PREVIEW_LINES)

function marker(type: 'unchanged' | 'added' | 'removed') {
  if (type === 'added') return '+'
  if (type === 'removed') return '-'
  return ' '
}
</script>

<style scoped>
.tdv { display: flex; flex-direction: column; gap: var(--space-2); }
.tdv-reason { color: var(--warning); font-size: var(--font-size-xs); }
.tdv-stats { display: flex; flex-wrap: wrap; gap: var(--space-3); color: var(--text-secondary); font-size: var(--font-size-xs); }
.tdv-toolbar { display: flex; align-items: center; gap: var(--space-2); color: var(--text-secondary); font-size: var(--font-size-xs); }
.tdv-single { display: flex; flex-direction: column; border: 1px solid var(--border-color); border-radius: var(--radius-sm); overflow: auto; max-height: 360px; }
.tdv-columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border: 1px solid var(--border-color); border-radius: var(--radius-sm); overflow: hidden; max-height: 360px; overflow-y: auto; }
.tdv-column { min-width: 0; }
.tdv-column > strong { display: block; padding: var(--space-2); border-bottom: 1px solid var(--border-color); background: var(--bg-tertiary); color: var(--text-primary); font-size: var(--font-size-xs); }
.tdv-column + .tdv-column { border-left: 1px solid var(--border-color); }
.tdv-line { display: grid; grid-template-columns: 24px minmax(0, 1fr); min-height: 22px; }
.tdv-marker { display: flex; align-items: center; justify-content: center; border-right: 1px solid var(--border-color); color: var(--text-secondary); font-size: var(--font-size-xs); user-select: none; }
.tdv-line pre { margin: 0; padding: var(--space-1) var(--space-2); white-space: pre-wrap; overflow-wrap: anywhere; color: var(--text-primary); font-size: var(--font-size-xs); line-height: 1.55; user-select: text; }
.tdv-line.is-added { background: color-mix(in srgb, var(--success) 14%, transparent); }
.tdv-line.is-added pre { color: var(--success); }
.tdv-line.is-removed { background: color-mix(in srgb, var(--danger) 14%, transparent); }
.tdv-line.is-removed pre { color: var(--danger); }
.tdv-line.is-empty { opacity: .45; }
.tdv-text { margin: 0; max-height: 360px; padding: var(--space-3); overflow: auto; border-radius: var(--radius-sm); background: var(--bg-tertiary); color: var(--text-primary); font-size: var(--font-size-xs); line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; }
@media (max-width: 760px) { .tdv-columns { grid-template-columns: 1fr; } }
</style>
