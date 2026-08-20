<template>
  <section id="memory-timeline" class="memory-timeline" aria-label="记忆时间线">
    <div class="timeline-toolbar">
      <strong>时间线</strong>
      <span>事件 {{ filteredEvents.length }}/{{ timeline.length }}</span>
      <select v-model="typeFilter" aria-label="按事件类型筛选">
        <option value="all">全部类型</option>
        <option v-for="type in eventTypes" :key="type" :value="type">{{ type }}</option>
      </select>
      <input v-model="characterFilter" class="timeline-filter" placeholder="筛选角色" aria-label="按角色筛选" />
    </div>
    <div v-if="filteredEvents.length === 0" class="timeline-empty">暂无符合条件的事件</div>
    <div v-else class="timeline-list">
      <button v-for="event in filteredEvents" :key="event.id" class="timeline-item" type="button" @click="selectEvent(event.id)">
        <span class="timeline-marker"></span>
        <span class="timeline-main">
          <span class="timeline-meta">第 {{ event.chapterIndex || '?' }} 章 · {{ event.type }}{{ event.location ? ` · ${event.location}` : '' }}</span>
          <strong>{{ event.title }}</strong>
          <span class="timeline-summary">{{ event.summary || '暂无摘要' }}</span>
          <span v-if="event.characters.length" class="timeline-characters">{{ event.characters.join('、') }}</span>
        </span>
      </button>
    </div>
    <div v-if="selectedEvent" class="timeline-selection">
      <span>已选事件：{{ selectedEvent.title }}</span>
      <button class="btn-sm btn-secondary" type="button" @click="openSource">打开章节</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { MemoryData } from '../../types/memory'
import { useMemoryGraph } from '../../composables/useMemoryGraph'

const props = defineProps<{ memories: MemoryData }>()
const emit = defineEmits<{ openSource: [payload: { kind: 'event'; id: string }] }>()
const { eventsToTimelineData } = useMemoryGraph()
const typeFilter = ref('all')
const characterFilter = ref('')
const selectedId = ref('')
const timeline = computed(() => eventsToTimelineData(props.memories.events))
const eventTypes = computed(() => [...new Set(timeline.value.map(event => event.type))])
const filteredEvents = computed(() => {
  const character = characterFilter.value.trim().toLowerCase()
  return timeline.value.filter(event => (typeFilter.value === 'all' || event.type === typeFilter.value) && (!character || event.characters.some(name => name.toLowerCase().includes(character))))
})
const selectedEvent = computed(() => timeline.value.find(event => event.id === selectedId.value) || null)
function selectEvent(id: string) { selectedId.value = id }
function openSource() {
  if (selectedEvent.value) emit('openSource', { kind: 'event', id: selectedEvent.value.id })
}
</script>

<style scoped>
.memory-timeline { height: 100%; overflow: auto; color: var(--text-primary); }
.timeline-toolbar { display: flex; align-items: center; gap: 8px; min-height: 38px; border-bottom: 1px solid var(--border-color); }
.timeline-toolbar span { flex: 1; color: var(--text-secondary); font-size: var(--font-size-sm); }
.timeline-toolbar select, .timeline-filter { height: 30px; max-width: 150px; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: var(--radius-xs); color: var(--text-primary); padding: 4px 8px; font-size: var(--font-size-sm); }
.timeline-list { position: relative; padding: 12px 0 12px 20px; }
.timeline-list::before { content: ''; position: absolute; left: 7px; top: 14px; bottom: 14px; width: 2px; background: var(--border-color); }
.timeline-item { display: flex; position: relative; width: 100%; border: 0; background: transparent; text-align: left; color: var(--text-primary); padding: 8px 0 8px 14px; cursor: pointer; }
.timeline-item:hover { background: var(--bg-hover); }
.timeline-marker { position: absolute; left: -17px; top: 14px; width: 10px; height: 10px; border: 2px solid var(--accent); border-radius: 50%; background: var(--bg-primary); }
.timeline-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.timeline-meta, .timeline-characters { color: var(--text-secondary); font-size: var(--font-size-sm); }
.timeline-summary { color: var(--text-primary); line-height: 1.5; }
.timeline-empty { padding: 22px; color: var(--text-secondary); }
.timeline-selection { border-top: 1px solid var(--border-color); padding-top: 10px; color: var(--accent); }
</style>
