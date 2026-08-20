<template>
  <section id="memory-graph-analysis" class="memory-graph-analysis" aria-label="记忆图谱分析">
    <div class="analysis-toolbar">
      <strong>图谱分析</strong>
      <span>节点 {{ graph.nodes.length }} · 关系 {{ graph.edges.length }}</span>
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
      <span>已选中：{{ selectedEntity?.label }}</span>
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
const selectedId = ref('')
const graph = computed(() => entitiesToGraphData(props.memories))
const rankedEntities = computed(() => {
  const degree = new Map<string, number>()
  graph.value.nodes.forEach(node => degree.set(node.id, 0))
  graph.value.edges.forEach(edge => {
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1)
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1)
  })
  const max = Math.max(1, ...degree.values())
  return graph.value.nodes
    .map(node => ({ id: node.id, label: node.label, degree: degree.get(node.id) || 0, percent: Math.round(((degree.get(node.id) || 0) / max) * 100) }))
    .sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label))
})
const topEntity = computed(() => rankedEntities.value[0] || null)
const isolatedCount = computed(() => rankedEntities.value.filter(item => item.degree === 0).length)
const relationTypeCount = computed(() => new Set(graph.value.edges.map(edge => edge.label)).size)
const selectedEntity = computed(() => graph.value.nodes.find(node => node.id === selectedId.value) || null)
const warnings = computed(() => props.memories.relations
  .filter(relation => relation.sourceId === relation.targetId)
  .map(relation => ({ id: relation.id, text: `关系“${relation.type || '未命名'}”连接了自身，请检查实体配置` })))
function selectEntity(id: string) { selectedId.value = id }
function openSource() {
  if (selectedEntity.value) emit('openSource', { kind: 'entity', id: selectedEntity.value.id })
}
</script>

<style scoped>
.memory-graph-analysis { height: 100%; overflow: auto; color: var(--text-primary); }
.analysis-toolbar { display: flex; align-items: center; gap: 12px; min-height: 38px; border-bottom: 1px solid var(--border-color); }
.analysis-toolbar span { color: var(--text-secondary); font-size: var(--font-size-sm); }
.analysis-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; padding: 14px 0; }
.analysis-card { display: flex; flex-direction: column; gap: 4px; padding: 12px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); min-width: 0; }
.analysis-card strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.analysis-card small, .analysis-label { color: var(--text-secondary); font-size: var(--font-size-sm); }
.analysis-section { border-top: 1px solid var(--border-color); padding: 12px 0; }
.analysis-section h4 { margin: 0 0 8px; font-size: var(--font-size-md); }
.rank-row { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; background: transparent; color: var(--text-primary); padding: 6px 0; text-align: left; cursor: pointer; }
.rank-name { width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rank-bar { flex: 1; height: 8px; background: var(--bg-hover); border-radius: 4px; overflow: hidden; }
.rank-bar i { display: block; height: 100%; background: var(--accent); }
.rank-value { width: 24px; text-align: right; color: var(--text-secondary); }
.analysis-empty, .analysis-ok { color: var(--text-secondary); }
.analysis-warning { color: var(--warning); margin: 4px 0; }
.analysis-selected { border-top: 1px solid var(--border-color); padding-top: 10px; color: var(--accent); }
@media (max-width: 700px) { .analysis-grid { grid-template-columns: 1fr; } }
</style>
