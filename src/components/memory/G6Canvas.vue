<template>
  <div ref="containerRef" class="g6-canvas" role="img" :aria-label="ariaLabel"></div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, ref, watch } from 'vue'
import type { Graph, GraphData, GraphOptions, IPointerEvent } from '@antv/g6'
import { createGraph, destroyGraph, updateGraphData } from '../../composables/useG6Graph'

const props = withDefaults(
  defineProps<{
    options: Omit<GraphOptions, 'container' | 'autoResize'>
    data: GraphData
    ariaLabel?: string
  }>(),
  { ariaLabel: '图可视化' }
)

const emit = defineEmits<{ nodeClick: [id: string]; nodeDblClick: [id: string] }>()
const containerRef = ref<HTMLDivElement | null>(null)
const graphRef = shallowRef<Graph | null>(null)
let renderPromise: Promise<void> | null = null

onMounted(() => {
  if (!containerRef.value) return
  graphRef.value = createGraph(containerRef.value, props.options)
  graphRef.value.on('node:click', event => {
    const pointerEvent = event as IPointerEvent
    const id = (pointerEvent.target as { id?: unknown } | null | undefined)?.id
    if (typeof id === 'string') emit('nodeClick', id)
  })
  graphRef.value.on('node:dblclick', event => {
    const pointerEvent = event as IPointerEvent
    const id = (pointerEvent.target as { id?: unknown } | null | undefined)?.id
    if (typeof id === 'string') emit('nodeDblClick', id)
  })
  renderPromise = updateGraphData(graphRef.value, props.data)
})

watch(
  () => props.data,
  data => {
    if (!graphRef.value) return
    renderPromise = updateGraphData(graphRef.value, data)
  }
)

onBeforeUnmount(() => {
  const graph = graphRef.value
  graphRef.value = null
  renderPromise = null
  destroyGraph(graph)
  renderPromise = null
})

defineExpose({
  focusNode: async (id: string) => {
    const graph = graphRef.value
    if (!graph || graph.destroyed) return
    await renderPromise
    await graph.focusElement(id, true)
  },
  getGraph: () => graphRef.value
})
</script>

<style scoped>
.g6-canvas {
  position: relative;
  flex: 1;
  min-height: 220px;
  overflow: hidden;
  background: var(--g6-bg);
}
</style>
