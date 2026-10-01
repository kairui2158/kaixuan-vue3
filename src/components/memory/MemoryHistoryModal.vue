<template>
  <div v-if="visible" data-modal-id="memory-history" class="modal-overlay modal-nested" :style="{ zIndex: modalQueue.getZIndex('memory-history') }" @click.self="$emit('close')">
    <div class="mem-history-modal">
      <div class="mem-history-header">
        <h3>记忆版本历史</h3>
        <button class="btn-close" type="button" aria-label="关闭记忆版本历史" @click="$emit('close')"><AppIcon name="x" /></button>
      </div>
      <div class="mem-history-summary">
        <span>共 {{ records.length }} 次变更</span>
        <span>最早 {{ firstTime || '—' }}</span>
        <span>最近 {{ lastTime || '—' }}</span>
      </div>
      <div class="mem-history-toolbar">
        <select id="mem-history-chapter-filter" v-model="chapterFilter">
          <option value="">全部章节</option>
          <option v-for="chapter in chapterOptions" :key="chapter.id" :value="chapter.id">{{ chapter.label }}</option>
        </select>
      </div>
      <div class="mem-history-list">
        <EmptyState
          v-if="filteredRecords.length === 0"
          variant="compact"
          icon="history"
          title="暂无历史记录"
          description="当前筛选条件下没有记忆变更记录，可调整时间或类型"
        />
        <div v-for="record in filteredRecords" :key="record.id" class="mem-history-item">
          <div class="mem-history-item-main">
            <div class="mem-history-title">
              <span>{{ formatTime(record.timestamp) }}</span>
              <span class="mem-history-chapter">{{ chapterLabel(record) }}</span>
            </div>
            <div class="mem-history-reason">{{ record.reason || '未记录原因' }}</div>
          </div>
          <div class="mem-history-actions">
            <button class="btn-sm btn-secondary" @click="previewId = previewId === record.id ? '' : record.id">预览</button>
            <button class="btn-sm btn-secondary" @click="rollbackTo(record)">回滚到此版本</button>
          </div>
          <div v-if="previewId === record.id" class="mem-history-preview">
            <div v-for="metric in previewMetrics(record)" :key="metric.label" class="mem-history-metric">
              <span>{{ metric.label }}</span>
              <span>{{ metric.before }} → {{ metric.after }}</span>
              <span :class="metric.after - metric.before >= 0 ? 'increase' : 'decrease'">{{ metric.after - metric.before >= 0 ? '+' : '' }}{{ metric.after - metric.before }}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="mem-history-footer">
        <select id="mem-history-rollback-chapter" v-model="rollbackChapterId">
          <option value="">选择章节</option>
          <option v-for="chapter in chapterOptions" :key="'rollback-' + chapter.id" :value="chapter.id">{{ chapter.label }}</option>
        </select>
        <button class="btn-sm btn-secondary" :disabled="!rollbackChapterId" @click="rollbackByChapter">按章节回滚</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { MemoryChangeRecord } from '../../types/memory'
import { useModalQueue } from '../../composables/useModalQueue'
import EmptyState from '../common/EmptyState.vue'

const props = defineProps<{ visible: boolean; records: MemoryChangeRecord[] }>()
const emit = defineEmits<{
  close: []
  rollback: [record: MemoryChangeRecord]
  rollbackByChapter: [chapterId: string, chapterIndex: number | undefined]
}>()

const previewId = ref('')
const chapterFilter = ref('')
const rollbackChapterId = ref('')
const modalQueue = useModalQueue()

watch(() => props.visible, visible => {
  if (visible) modalQueue.open('memory-history')
  else modalQueue.close('memory-history')
}, { immediate: true })

const filteredRecords = computed(() => {
  if (!chapterFilter.value) return props.records
  return props.records.filter(record => record.chapterId === chapterFilter.value)
})

const firstTime = computed(() => props.records[0]?.timestamp || '')
const lastTime = computed(() => props.records[props.records.length - 1]?.timestamp || '')

const chapterOptions = computed(() => {
  const options: Array<{ id: string; label: string }> = []
  const seen = new Set<string>()
  for (const record of props.records) {
    if (!record.chapterId || seen.has(record.chapterId)) continue
    seen.add(record.chapterId)
    options.push({ id: record.chapterId, label: `第${record.chapterIndex ?? '?'}章 / ${record.chapterId}` })
  }
  return options
})

function formatTime(value: string) {
  return value ? new Date(value).toLocaleString() : '—'
}

function chapterLabel(record: MemoryChangeRecord) {
  return record.chapterIndex !== undefined ? `第${record.chapterIndex}章` : record.chapterId
}

function previewMetrics(record: MemoryChangeRecord) {
  return [
    { label: '实体', before: record.before.entities.length, after: record.after.entities.length },
    { label: '关系', before: record.before.relations.length, after: record.after.relations.length },
    { label: '事件', before: record.before.events.length, after: record.after.events.length },
    { label: '世界观', before: record.before.world.length, after: record.after.world.length },
    { label: '伏笔', before: record.before.foreshadowing.length, after: record.after.foreshadowing.length }
  ]
}

function rollbackTo(record: MemoryChangeRecord) {
  emit('rollback', record)
}

function rollbackByChapter() {
  if (!rollbackChapterId.value) return
  const record = props.records.find(item => item.chapterId === rollbackChapterId.value)
  emit('rollbackByChapter', rollbackChapterId.value, record?.chapterIndex)
}
</script>

<style scoped>
.mem-history-modal { background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: var(--radius-lg); width: min(760px, 92vw); max-height: 86vh; display: flex; flex-direction: column; padding: var(--space-8); gap: var(--space-5); }
.mem-history-header { display: flex; align-items: center; justify-content: space-between; }
.mem-history-header h3 { margin: 0; font-size: var(--font-size-lg); }
.mem-history-summary { display: flex; gap: var(--space-6); color: var(--text-secondary); font-size: var(--font-size-sm); flex-wrap: wrap; }
.mem-history-toolbar select, .mem-history-footer select { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-xs); padding: var(--space-2) var(--space-3); }
.mem-history-list { overflow-y: auto; min-height: 180px; display: flex; flex-direction: column; gap: var(--space-4); padding-right: var(--space-2); }
.mem-history-item { border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: var(--space-4); background: var(--bg-card); }
.mem-history-title { display: flex; gap: var(--space-4); align-items: center; font-size: var(--font-size-sm); color: var(--text-primary); }
.mem-history-chapter { color: var(--text-secondary); }
.mem-history-reason { color: var(--text-secondary); font-size: var(--font-size-sm); margin-top: 4px; }
.mem-history-actions { display: flex; gap: var(--space-3); margin-top: var(--space-3); }
.mem-history-preview { margin-top: var(--space-3); border-top: 1px solid var(--border-color); padding-top: var(--space-3); display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--space-3); }
.mem-history-metric { display: flex; gap: var(--space-3); align-items: center; font-size: var(--font-size-sm); color: var(--text-secondary); }
.mem-history-metric .increase { color: var(--success); }
.mem-history-metric .decrease { color: var(--danger); }
.mem-history-footer { display: flex; gap: var(--space-3); align-items: center; border-top: 1px solid var(--border-color); padding-top: var(--space-4); }
</style>
