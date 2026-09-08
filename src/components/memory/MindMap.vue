<template>
  <section id="memory-mind-map" class="memory-mind-map" aria-label="记忆思维导图">
    <div class="mind-toolbar">
      <strong>思维导图</strong>
      <span>卷 {{ volumeCount }} · 事件 {{ eventCount }}</span>
      <button class="btn-sm btn-secondary" type="button" @click="expandAll">全部展开</button>
      <button class="btn-sm btn-secondary" type="button" @click="collapseAll">全部收起</button>
    </div>
    <div v-if="volumeCount === 0" class="mind-empty">暂无卷纲和事件数据</div>
    <G6Canvas v-else ref="canvasRef" :options="graphOptions" :data="graphData" aria-label="记忆思维导图" @node-click="selectEvent" />
    <div v-if="selectedEvent" class="mind-selection">
      <span>已选事件：{{ selectedEvent.title }}{{ selectedEvent.summary ? `：${selectedEvent.summary}` : '' }}</span>
      <button class="btn-sm btn-secondary" type="button" @click="openSource">打开章节</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { GraphOptions } from '@antv/g6'
import { treeToGraphData } from '@antv/g6'
import type { MemoryData } from '../../types/memory'
import { adaptTreeForG6 } from '../../composables/useG6Graph'
import { useMemoryGraph } from '../../composables/useMemoryGraph'
import G6Canvas from './G6Canvas.vue'

const props = defineProps<{ memories: MemoryData; volumes?: Array<{ id?: string; name?: string }>; chapters?: Record<string, Array<{ id?: string; title?: string }>> }>()
const emit = defineEmits<{ openSource: [payload: { kind: 'event'; id: string }] }>()
const { buildMemoryTree } = useMemoryGraph()
const selectedEventId = ref('')
const collapsedOverride = ref(false)
const canvasRef = ref<InstanceType<typeof G6Canvas> | null>(null)
const tree = computed(() => buildMemoryTree(props.volumes || [], props.chapters || {}, props.memories.events))
const eventCount = computed(() => tree.value.reduce((total, volume) => total + volume.chapters.reduce((sum, chapter) => sum + chapter.events.length, 0), 0))
const volumeCount = computed(() => (props.volumes || []).length)
const sourceGraphData = computed(() => treeToGraphData({
  id: 'memory-root',
  data: { label: '记忆' },
  children: adaptTreeForG6(props.volumes || [], props.chapters || {}, props.memories.events)
}))
const graphData = computed(() => ({
  nodes: (sourceGraphData.value.nodes || []).map(node => ({
    ...node,
    style: { ...node.style, collapsed: collapsedOverride.value }
  })),
  edges: sourceGraphData.value.edges || []
}))
const selectedEvent = computed(() => props.memories.events.find(event => event.id === selectedEventId.value) || null)

const graphOptions: GraphOptions = {
  transforms: ['collapse-expand-node'],
  layout: { type: 'mindmap', direction: 'H' },
  node: {
    style: { size: d => (d.data?.kind === 'event' ? 20 : 26), fill: '#2c3a5d', stroke: '#4d5f8a' },
    state: { selected: { stroke: '#7c8cf8', lineWidth: 3 } }
  },
  edge: {
    style: { stroke: '#4d5f8a', lineWidth: 1.5 },
    state: { selected: { stroke: '#7c8cf8', lineWidth: 2.5 } }
  },
  behaviors: ['drag-canvas', 'zoom-canvas', 'collapse-expand', { type: 'click-select' }],
  animation: false
}

function selectEvent(id: string) {
  selectedEventId.value = id
}
function expandAll() {
  collapsedOverride.value = false
}
function collapseAll() {
  collapsedOverride.value = true
}
function openSource() {
  if (selectedEvent.value) emit('openSource', { kind: 'event', id: selectedEvent.value.id })
}

defineExpose({
  getGraph: () => canvasRef.value?.getGraph() || null
})
</script>

<style scoped>
.memory-mind-map { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden; color: var(--text-primary); background: var(--g6-bg); }
.mind-toolbar { display: flex; align-items: center; gap: var(--space-4); min-height: 38px; border-bottom: 1px solid var(--border-color); }
.mind-toolbar span { flex: 1; color: var(--text-secondary); font-size: var(--font-size-sm); }
.mind-empty { display: grid; place-items: center; flex: 1; color: var(--memory-empty-text); }
.mind-selection { display: flex; gap: var(--space-5); align-items: center; border-top: 1px solid var(--border-color); padding-top: 10px; color: var(--accent); }
</style>
