<template>
  <section id="memory-relation-graph" class="memory-relation-graph" aria-label="记忆关系图">
    <div class="graph-toolbar">
      <span class="graph-title">关系图</span>
      <span class="graph-hint">节点 {{ visibleNodes.length }} · 关系 {{ visibleEdges.length }}</span>
      <button class="btn-sm btn-secondary" type="button" @click="resetView">重置</button>
    </div>
    <div v-if="visibleNodes.length === 0" class="graph-empty">暂无实体关系数据</div>
    <svg v-else class="graph-canvas" :viewBox="`0 0 ${canvasWidth} ${canvasHeight}`" role="img">
      <g :transform="`translate(${panX} ${panY}) scale(${zoom})`" @pointermove="onPointerMove" @pointerup="endPan" @pointerleave="endPan">
        <line
          v-for="edge in visibleEdges"
          :key="edge.id"
          class="graph-edge"
          :x1="nodePosition(edge.source).x"
          :y1="nodePosition(edge.source).y"
          :x2="nodePosition(edge.target).x"
          :y2="nodePosition(edge.target).y"
        />
        <text
          v-for="edge in visibleEdges"
          :key="edge.id + '-label'"
          class="graph-edge-label"
          :x="(nodePosition(edge.source).x + nodePosition(edge.target).x) / 2"
          :y="(nodePosition(edge.source).y + nodePosition(edge.target).y) / 2 - 5"
        >{{ edge.label }}</text>
        <g
          v-for="node in visibleNodes"
          :key="node.id"
          class="graph-node"
          :class="{ selected: selectedId === node.id }"
          :transform="`translate(${nodePosition(node.id).x} ${nodePosition(node.id).y})`"
          @pointerdown.stop="startNodeDrag(node.id, $event)"
          @click.stop="selectNode(node.id)"
        >
          <circle r="28" />
          <text text-anchor="middle" dy="4">{{ node.label.slice(0, 8) }}</text>
        </g>
      </g>
    </svg>
    <div v-if="selectedNode" class="graph-selection">
      <strong>{{ selectedNode.label }}</strong>
      <span>{{ neighborCount }} 个关联节点</span>
      <button class="btn-sm btn-secondary" type="button" @click="openSource">打开来源</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { MemoryData } from '../../types/memory'
import { useMemoryGraph } from '../../composables/useMemoryGraph'

const props = defineProps<{ memories: MemoryData }>()
const emit = defineEmits<{ openSource: [payload: { kind: 'entity'; id: string }] }>()
const { entitiesToGraphData } = useMemoryGraph()
const canvasWidth = 900
const canvasHeight = 430
const zoom = ref(1)
const panX = ref(0)
const panY = ref(0)
const selectedId = ref('')
const draggingNode = ref('')
const draggingPan = ref(false)
const lastPointer = ref({ x: 0, y: 0 })

const graph = computed(() => entitiesToGraphData(props.memories))
const positions = computed(() => {
  const result: Record<string, { x: number; y: number }> = {}
  const count = graph.value.nodes.length
  graph.value.nodes.forEach((node, index) => {
    const angle = count ? (Math.PI * 2 * index) / count : 0
    result[node.id] = { x: canvasWidth / 2 + Math.cos(angle) * Math.min(260, 60 + count * 18), y: canvasHeight / 2 + Math.sin(angle) * Math.min(145, 45 + count * 10) }
  })
  return result
})
const visibleNodes = computed(() => {
  if (!selectedId.value) return graph.value.nodes
  const ids = new Set([selectedId.value])
  graph.value.edges.forEach(edge => {
    if (edge.source === selectedId.value) ids.add(edge.target)
    if (edge.target === selectedId.value) ids.add(edge.source)
  })
  return graph.value.nodes.filter(node => ids.has(node.id))
})
const visibleEdges = computed(() => {
  const ids = new Set(visibleNodes.value.map(node => node.id))
  return graph.value.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target))
})
const selectedNode = computed(() => graph.value.nodes.find(node => node.id === selectedId.value) || null)
const neighborCount = computed(() => {
  if (!selectedId.value) return 0
  return new Set(visibleEdges.value.flatMap(edge => [edge.source, edge.target])).size - 1
})

function nodePosition(id: string) { return positions.value[id] || { x: 0, y: 0 } }
function selectNode(id: string) { selectedId.value = selectedId.value === id ? '' : id }
function openSource() {
  if (selectedNode.value) emit('openSource', { kind: 'entity', id: selectedNode.value.id })
}
function resetView() { selectedId.value = ''; zoom.value = 1; panX.value = 0; panY.value = 0 }
function startNodeDrag(id: string, event: PointerEvent) {
  draggingNode.value = id
  lastPointer.value = { x: event.clientX, y: event.clientY }
}
function onPointerMove(event: PointerEvent) {
  if (!draggingNode.value && !draggingPan.value) return
  const dx = event.clientX - lastPointer.value.x
  const dy = event.clientY - lastPointer.value.y
  panX.value += dx
  panY.value += dy
  lastPointer.value = { x: event.clientX, y: event.clientY }
}
function endPan() { draggingNode.value = ''; draggingPan.value = false }
</script>

<style scoped>
.memory-relation-graph { display: flex; flex-direction: column; min-height: 0; height: 100%; background: var(--bg-primary); }
.graph-toolbar { display: flex; align-items: center; gap: 10px; min-height: 38px; border-bottom: 1px solid var(--border-color); color: var(--text-secondary); }
.graph-title { color: var(--text-primary); font-weight: 600; }
.graph-hint { flex: 1; font-size: var(--font-size-sm); }
.graph-canvas { width: 100%; min-height: 280px; flex: 1; background: var(--bg-secondary); cursor: grab; touch-action: none; }
.graph-edge { stroke: var(--border-color); stroke-width: 2; }
.graph-edge-label { fill: var(--text-muted); font-size: 12px; text-anchor: middle; }
.graph-node { cursor: pointer; }
.graph-node circle { fill: var(--accent); stroke: var(--bg-primary); stroke-width: 3; }
.graph-node.selected circle { fill: var(--warning); }
.graph-node text { fill: #fff; font-size: 12px; pointer-events: none; }
.graph-empty { display: grid; place-items: center; flex: 1; color: var(--text-secondary); }
.graph-selection { display: flex; gap: 10px; padding: 8px 0 0; color: var(--text-secondary); }
.graph-selection strong { color: var(--text-primary); }
</style>
