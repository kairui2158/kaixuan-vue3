<template>
  <section id="memory-graph-analysis" class="memory-graph-analysis" aria-label="记忆图谱分析">
    <div class="analysis-toolbar">
      <strong>图谱分析</strong>
      <span>节点 {{ graph.nodes.length }} · 关系 {{ graph.edges.length }}</span>
      <span v-if="brushSelectionCount > 0">框选 {{ brushSelectionCount }} 项</span>
    </div>
    <div class="analysis-grid">
      <article class="analysis-card">
        <span class="analysis-label">最核心实体</span>
        <strong>{{ topEntity?.label || '暂无' }}</strong>
        <small>{{ topEntity ? `${topEntity.degree} 条关系` : '添加关系后自动分析' }}</small>
      </article>
      <article class="analysis-card">
        <span class="analysis-label">孤立实体</span>
        <strong>{{ isolatedCount }}</strong>
        <small>没有任何关系连接</small>
      </article>
      <article class="analysis-card">
        <span class="analysis-label">关系类型</span>
        <strong>{{ relationTypeCount }}</strong>
        <small>已识别关系类别</small>
      </article>
    </div>
    <div class="analysis-body">
      <div v-if="graph.nodes.length === 0" class="analysis-empty">暂无实体数据</div>
      <G6Canvas v-else :options="graphOptions" :data="graphData" aria-label="实体中心性图谱" @node-click="selectEntity" />
      <div v-if="graph.nodes.length > 0" class="analysis-legend" aria-label="图谱图例">
        <span><i class="legend-core"></i>核心实体</span>
        <span><i class="legend-active"></i>重要实体</span>
        <span><i class="legend-normal"></i>普通实体</span>
        <span><i class="legend-isolated"></i>孤立实体</span>
      </div>
    </div>
    <div class="analysis-section">
      <h4>实体中心性</h4>
      <div v-if="rankedEntities.length === 0" class="analysis-empty">暂无实体数据</div>
      <button v-for="item in rankedEntities" :key="item.id" class="rank-row" type="button" @click="selectEntity(item.id)">
        <span class="rank-name">{{ item.label }}</span>
        <span class="rank-bar"><i :style="{ width: `${item.percent}%` }"></i></span>
        <span class="rank-value">{{ item.degree }}</span>
      </button>
    </div>
    <div class="analysis-section">
      <h4>关系检查</h4>
      <p v-if="warnings.length === 0" class="analysis-ok">当前没有发现孤立关系或自指关系</p>
      <p v-for="warning in warnings" :key="warning.id" class="analysis-warning">{{ warning.text }}</p>
    </div>
    <div v-if="selectedId" class="analysis-selected">
      <span>已选中：{{ selectedEntity?.data.label }}</span>
      <button class="btn-sm btn-secondary" type="button" @click="openSource">打开来源</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { GraphOptions } from '@antv/g6'
import type { MemoryData } from '../../types/memory'
import { toG6Data } from '../../composables/useG6Graph'
import G6Canvas from './G6Canvas.vue'

const props = defineProps<{ memories: MemoryData }>()
const emit = defineEmits<{ openSource: [payload: { kind: 'entity'; id: string }] }>()
const selectedId = ref('')
const brushSelectionIds = ref<string[]>([])
const graph = computed(() => toG6Data(props.memories))
const degrees = computed(() => {
  const degree = new Map<string, number>()
  graph.value.nodes.forEach(node => degree.set(node.id, 0))
  graph.value.edges.forEach(edge => {
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1)
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1)
  })
  return degree
})
const rankedEntities = computed(() => {
  const max = Math.max(1, ...degrees.value.values())
  return graph.value.nodes
    .map(node => ({ id: node.id, label: node.data.label, degree: degrees.value.get(node.id) || 0, percent: Math.round(((degrees.value.get(node.id) || 0) / max) * 100) }))
    .sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label))
})
const topEntity = computed(() => rankedEntities.value[0] || null)
const isolatedCount = computed(() => rankedEntities.value.filter(item => item.degree === 0).length)
const relationTypeCount = computed(() => new Set(graph.value.edges.map(edge => edge.data?.label)).size)
const selectedEntity = computed(() => graph.value.nodes.find(node => node.id === selectedId.value) || null)
const graphData = computed(() => ({
  nodes: graph.value.nodes.map(node => ({ ...node, data: { ...node.data, degree: degrees.value.get(node.id) || 0, tier: centralityTier(degrees.value.get(node.id) || 0) } })),
  edges: graph.value.edges
}))
const brushSelectionCount = computed(() => brushSelectionIds.value.length)
const warnings = computed(() => props.memories.relations
  .filter(relation => relation.sourceId === relation.targetId)
  .map(relation => ({ id: relation.id, text: `关系“${relation.type || '未命名'}”连接了自身，请检查实体配置` })))

const graphOptions: GraphOptions = {
  layout: { type: 'concentric', minNodeSpacing: 30, preventOverlap: true },
  node: {
    style: { size: 36, fill: (datum: { data?: { degree?: number } }) => centralityFill(datum.data?.degree || 0), stroke: '#4d5f8a' },
    state: { selected: { stroke: '#7c8cf8', lineWidth: 3 } }
  },
  edge: {
    style: { stroke: '#4d5f8a', lineWidth: 1 },
    state: { selected: { stroke: '#7c8cf8', lineWidth: 2 } }
  },
  behaviors: [
    'drag-canvas',
    'zoom-canvas',
    {
      type: 'brush-select',
      onSelect: (states: Record<string, string | string[]>) => {
        brushSelectionIds.value = Object.keys(states)
      }
    },
    { type: 'click-select' }
  ],
  animation: false
}

function centralityDegree(degree: number) {
  if (degree >= 5) return 'core'
  if (degree >= 2) return 'active'
  if (degree === 0) return 'isolated'
  return 'normal'
}
function centralityTier(degree: number) {
  return centralityDegree(degree)
}
function centralityFill(degree: number) {
  const degreeTier = centralityDegree(degree)
  if (degreeTier === 'core') return '#7c8cf8'
  if (degreeTier === 'active') return '#4d5f8a'
  if (degreeTier === 'isolated') return '#6b7280'
  return '#2c3a5d'
}

function selectEntity(id: string) {
  selectedId.value = selectedId.value === id ? '' : id
}
function openSource() {
  if (selectedEntity.value) emit('openSource', { kind: 'entity', id: selectedEntity.value.id })
}
</script>

<style scoped>
.memory-graph-analysis { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: auto; color: var(--text-primary); background: var(--g6-bg); }
.analysis-toolbar { display: flex; align-items: center; gap: var(--space-5); min-height: 38px; border-bottom: 1px solid var(--border-color); }
.analysis-toolbar span { color: var(--text-secondary); font-size: var(--font-size-sm); }
.analysis-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-5); padding: var(--space-5) 0; }
.analysis-card { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-5); background: var(--memory-card-bg); border: 1px solid var(--memory-card-border); border-radius: var(--radius-sm); min-width: 0; }
.analysis-card strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.analysis-card small, .analysis-label { color: var(--text-secondary); font-size: var(--font-size-sm); }
.analysis-body { position: relative; display: flex; min-height: 260px; }
.analysis-legend { position: absolute; right: 12px; bottom: 12px; display: flex; gap: var(--space-5); align-items: center; padding: var(--space-3) var(--space-5); background: var(--memory-card-bg); border: 1px solid var(--memory-card-border); border-radius: var(--radius-sm); color: var(--text-secondary); font-size: var(--font-size-sm); z-index: 2; }
.analysis-legend span { display: inline-flex; align-items: center; gap: var(--space-2); }
.analysis-legend i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.legend-core { background: #7c8cf8; }
.legend-active { background: #4d5f8a; }
.legend-normal { background: #2c3a5d; }
.legend-isolated { background: #6b7280; }
.analysis-section { border-top: 1px solid var(--border-color); padding: var(--space-5) 0; }
.analysis-section h4 { margin: 0 0 var(--space-4); font-size: var(--font-size-md); }
.rank-row { display: flex; align-items: center; gap: var(--space-4); width: 100%; border: 0; background: transparent; color: var(--text-primary); padding: var(--space-3) 0; text-align: left; cursor: pointer; }
.rank-name { width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rank-bar { flex: 1; height: 8px; background: var(--bg-hover); border-radius: var(--radius-xs); overflow: hidden; }
.rank-bar i { display: block; height: 100%; background: var(--accent); }
.rank-value { width: 24px; text-align: right; color: var(--text-secondary); }
.analysis-empty, .analysis-ok { color: var(--text-secondary); }
.analysis-warning { color: var(--memory-state-pending); margin: var(--space-2) 0; }
.analysis-selected { border-top: 1px solid var(--border-color); padding-top: 10px; color: var(--accent); }
@media (max-width: 700px) { .analysis-grid { grid-template-columns: 1fr; } }
</style>
