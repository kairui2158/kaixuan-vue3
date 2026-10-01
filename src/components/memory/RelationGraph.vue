<template>
  <section id="memory-relation-graph" class="memory-relation-graph" aria-label="记忆关系图">
    <div class="graph-toolbar">
      <span class="graph-title">关系图</span>
      <span class="graph-hint">节点 {{ visibleNodes.length }} · 关系 {{ visibleEdges.length }}</span>
      <span v-if="hoveredNode" class="graph-hover">悬停：{{ hoveredNode.data.label }}</span>
      <button class="btn-sm btn-secondary" type="button" @click="toggleEditMode">{{ editMode ? '退出编辑' : '编辑' }}</button>
      <button class="btn-sm btn-secondary" type="button" @click="resetView">重置</button>
    </div>
    <div v-if="visibleNodes.length === 0" class="graph-empty">暂无实体关系数据</div>
    <G6Canvas
      v-else
      ref="canvasRef"
      :options="graphOptions"
      :data="visibleData"
      aria-label="记忆关系图"
      @node-click="selectNode"
      @node-dblclick="editSelectedNode"
    />
    <div v-if="selectedNode" class="graph-selection">
      <strong>{{ selectedNode.data.label }}</strong>
      <span>{{ neighborCount }} 个关联节点</span>
      <button v-if="editMode" class="btn-sm btn-primary" type="button" @click="editSelectedNode(selectedNode.id)">编辑实体</button>
      <button v-if="editMode" class="btn-sm btn-secondary" type="button" @click="startRelationFrom(selectedNode.id)">从当前节点建关系</button>
      <button class="btn-sm btn-secondary" type="button" @click="openSource">打开来源</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { GraphOptions, IElementEvent } from '@antv/g6'
import type { MemoryData } from '../../types/memory'
import { toG6Data } from '../../composables/useG6Graph'
import G6Canvas from './G6Canvas.vue'
import { g6Token } from './g6Theme'

const props = defineProps<{ memories: MemoryData }>()
const emit = defineEmits<{
  openSource: [payload: { kind: 'entity'; id: string }]
  editEntity: [id: string]
  createRelation: [payload: { sourceId: string; targetId: string }]
}>()
const selectedId = ref('')
const hoveredId = ref('')
const editMode = ref(false)
const relationSourceId = ref('')
const canvasRef = ref<InstanceType<typeof G6Canvas> | null>(null)
type G6GraphInstance = NonNullable<ReturnType<InstanceType<typeof G6Canvas>['getGraph']>>
let setupGraph: G6GraphInstance | null = null

const graph = computed(() => toG6Data(props.memories))
const neighborIds = computed(() => {
  if (!selectedId.value) return new Set<string>()
  const ids = new Set([selectedId.value])
  graph.value.edges.forEach(edge => {
    if (edge.source === selectedId.value) ids.add(edge.target)
    if (edge.target === selectedId.value) ids.add(edge.source)
  })
  return ids
})
const visibleNodes = computed(() => {
  if (!selectedId.value) return graph.value.nodes
  return graph.value.nodes.filter(node => neighborIds.value.has(node.id))
})
const visibleEdges = computed(() => {
  const ids = new Set(visibleNodes.value.map(node => node.id))
  return graph.value.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target))
})
const visibleData = computed(() => ({ nodes: visibleNodes.value, edges: visibleEdges.value }))
const selectedNode = computed(() => graph.value.nodes.find(node => node.id === selectedId.value) || null)
const hoveredNode = computed(() => graph.value.nodes.find(node => node.id === hoveredId.value) || null)
const neighborCount = computed(() => new Set(visibleEdges.value.flatMap(edge => [edge.source, edge.target])).size - 1)

const graphOptions: GraphOptions = {
  layout: { type: 'force', preventOverlap: true, nodeSize: 40, linkDistance: 120 },
  node: {
    style: { size: 40, fill: g6Token('--g6-node-fill'), stroke: g6Token('--g6-node-stroke') },
    state: {
      selected: { stroke: g6Token('--g6-selected'), lineWidth: 3 },
      active: { stroke: g6Token('--g6-hover'), lineWidth: 3 }
    }
  },
  edge: {
    style: { stroke: g6Token('--g6-node-stroke'), lineWidth: 1.5 },
    state: {
      selected: { stroke: g6Token('--g6-selected'), lineWidth: 2.5 },
      active: { stroke: g6Token('--g6-hover'), lineWidth: 2.5 }
    }
  },
  behaviors: [
    'drag-element',
    'drag-canvas',
    'zoom-canvas',
    { type: 'hover-activate', degree: 1 },
    { type: 'click-select' }
  ],
  animation: false
}

async function syncGraphEvents() {
  await nextTick()
  const graph = canvasRef.value?.getGraph()
  if (!graph || graph === setupGraph) return
  setupGraph = graph
  graph.on('node:pointerover', event => {
    const id = (event as IElementEvent).target.id
    if (typeof id === 'string') hoveredId.value = id
  })
  graph.on('node:pointerleave', () => {
    hoveredId.value = ''
  })
  graph.on('node:dragstart', event => {
    if (!editMode.value || !relationSourceId.value) return
    const id = (event as IElementEvent).target.id
    if (typeof id === 'string' && id !== relationSourceId.value) {
      emit('createRelation', { sourceId: relationSourceId.value, targetId: id })
      relationSourceId.value = ''
    }
  })
}

void syncGraphEvents()

defineExpose({
  getGraph: () => canvasRef.value?.getGraph() || null,
  setHoveredId: (id: string) => {
    hoveredId.value = id
  },
  selectNode
})

function selectNode(id: string) {
  selectedId.value = selectedId.value === id ? '' : id
}
function toggleEditMode() {
  editMode.value = !editMode.value
  relationSourceId.value = ''
}
function editSelectedNode(id: string) {
  if (!editMode.value) return
  emit('editEntity', id)
}
function startRelationFrom(id: string) {
  relationSourceId.value = id
}
function resetView() {
  selectedId.value = ''
  hoveredId.value = ''
  relationSourceId.value = ''
}
function openSource() {
  if (selectedNode.value) emit('openSource', { kind: 'entity', id: selectedNode.value.id })
}
</script>

<style scoped>
.memory-relation-graph { display: flex; flex-direction: column; min-height: 0; height: 100%; overflow: hidden; background: var(--g6-bg); }
.graph-toolbar { display: flex; align-items: center; gap: var(--space-5); min-height: 38px; border-bottom: 1px solid var(--border-color); color: var(--text-secondary); }
.graph-title { color: var(--text-primary); font-weight: 600; }
.graph-hint { flex: 1; font-size: var(--font-size-sm); }
.graph-empty { display: grid; place-items: center; flex: 1; color: var(--memory-empty-text); }
.graph-selection { display: flex; gap: var(--space-5); padding: var(--space-4) 0 0; color: var(--text-secondary); }
.graph-selection strong { color: var(--text-primary); }
</style>
