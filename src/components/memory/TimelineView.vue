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
    <div v-else class="timeline-canvas-wrap">
      <G6Canvas :options="graphOptions" :data="graphData" aria-label="记忆时间线图" @node-click="selectEvent" />
      <div class="timeline-range">
        <label for="timeline-chapter-range">章节范围</label>
        <input id="timeline-chapter-range" v-model.number="chapterRange" type="range" :min="1" :max="maxChapterIndex" />
        <span>{{ rangeStart }}-{{ rangeEnd }} 章</span>
      </div>
    </div>
    <div v-if="selectedEvent" class="timeline-selection">
      <span>已选事件：{{ selectedEvent.title }}</span>
      <button class="btn-sm btn-secondary" type="button" @click="openSource">打开章节</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { GraphOptions } from '@antv/g6'
import type { MemoryData } from '../../types/memory'
import { timelineToG6Data } from '../../composables/useG6Graph'
import { useMemoryGraph } from '../../composables/useMemoryGraph'
import G6Canvas from './G6Canvas.vue'
import { g6Token } from './g6Theme'

const props = defineProps<{ memories: MemoryData }>()
const emit = defineEmits<{ openSource: [payload: { kind: 'event'; id: string }] }>()
const { eventsToTimelineData } = useMemoryGraph()
const typeFilter = ref('all')
const characterFilter = ref('')
const chapterRange = ref(1)
const selectedId = ref('')

const timeline = computed(() => eventsToTimelineData(props.memories.events))
const maxChapterIndex = computed(() => Math.max(1, ...timeline.value.map(event => event.chapterIndex || 0)))
const rangeStart = computed(() => Math.max(1, maxChapterIndex.value - chapterRange.value + 1))
const rangeEnd = computed(() => maxChapterIndex.value)
const eventTypes = computed(() => [...new Set(timeline.value.map(event => event.type))])
const filteredEvents = computed(() => {
  const character = characterFilter.value.trim().toLowerCase()
  return timeline.value.filter(event =>
    (typeFilter.value === 'all' || event.type === typeFilter.value) &&
    (!character || event.characters.some(name => name.toLowerCase().includes(character))) &&
    (!event.chapterIndex || event.chapterIndex >= rangeStart.value)
  )
})
const graphData = computed(() => timelineToG6Data(filteredEvents.value))
const selectedEvent = computed(() => timeline.value.find(event => event.id === selectedId.value) || null)

const graphOptions: GraphOptions = {
  layout: { type: 'snake', indent: 40, fixSize: 30 },
  node: {
    style: { size: 30, fill: g6Token('--g6-node-fill'), stroke: g6Token('--g6-node-stroke') },
    state: { selected: { stroke: g6Token('--g6-selected'), lineWidth: 3 } }
  },
  edge: {
    style: { stroke: g6Token('--g6-node-stroke'), lineWidth: 1 },
    state: { selected: { stroke: g6Token('--g6-selected'), lineWidth: 2 } }
  },
  behaviors: ['drag-canvas', 'zoom-canvas', 'scroll-canvas', { type: 'click-select' }],
  animation: false
}

function selectEvent(id: string) {
  selectedId.value = id
}
function openSource() {
  if (selectedEvent.value) emit('openSource', { kind: 'event', id: selectedEvent.value.id })
}
</script>

<style scoped>
.memory-timeline { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden; color: var(--text-primary); background: var(--g6-bg); }
.timeline-toolbar { display: flex; align-items: center; gap: var(--space-4); min-height: 38px; border-bottom: 1px solid var(--border-color); }
.timeline-toolbar span { flex: 1; color: var(--text-secondary); font-size: var(--font-size-sm); }
.timeline-toolbar select, .timeline-filter { height: var(--density-form-height); max-width: 150px; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: var(--radius-xs); color: var(--text-primary); padding: var(--space-2) var(--space-4); font-size: var(--font-size-sm); }
.timeline-canvas-wrap { position: relative; display: flex; flex: 1; min-height: 0; }
.timeline-range { display: flex; align-items: center; gap: var(--space-4); position: absolute; right: 12px; bottom: 12px; padding: var(--space-3) var(--space-5); background: var(--g6-timebar-bg); border: 1px solid var(--border-color); border-radius: var(--radius-sm); font-size: var(--font-size-sm); }
.timeline-range input { width: 140px; }
.timeline-empty { display: grid; place-items: center; flex: 1; color: var(--memory-empty-text); }
.timeline-selection { border-top: 1px solid var(--border-color); padding-top: 10px; color: var(--accent); }
</style>
