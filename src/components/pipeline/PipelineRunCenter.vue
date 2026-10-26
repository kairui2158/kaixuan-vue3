<template>
  <div v-if="runs.length > 0" id="pipeline-run-center" class="pipeline-run-center">
    <div class="pipeline-run-center-header">
      <span>运行中心</span>
      <span>{{ runningCount }} 运行 / {{ queuedCount }} 排队</span>
    </div>
    <div class="pipeline-run-center-list">
      <div
        v-for="run in runs"
        :key="run.runId"
        class="pipeline-run-center-row"
        :data-run-id="run.runId"
        :class="`pipeline-run-${run.status}`"
      >
        <span class="pipeline-run-layer">{{ layerLabel(run.layer) }}</span>
        <span class="pipeline-run-target">{{ run.target }}</span>
        <span class="pipeline-run-status">{{ statusText(run) }}</span>
        <div class="pipeline-run-progress">
          <div class="pipeline-run-progress-bar" :style="{ width: `${Math.max(0, Math.min(100, run.progress))}%` }" />
        </div>
        <span class="pipeline-run-time">{{ elapsedText(run) }}</span>
        <button
          v-if="run.status === 'running' || run.status === 'queued'"
          class="btn-sm btn-danger"
          :data-cancel-run-id="run.runId"
          @click="pipelineStore.cancelGeneration(run.runId)"
        >取消</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { usePipelineStore } from '../../stores/pipeline'
import type { PipelineRunContext } from '../../services/runRegistry'

const pipelineStore = usePipelineStore()

const runs = computed(() => pipelineStore.runs.filter(run =>
  run.status === 'running' || run.status === 'queued'
))
const runningCount = computed(() => runs.value.filter(run => run.status === 'running').length)
const queuedCount = computed(() => runs.value.filter(run => run.status === 'queued').length)

const now = ref(Date.now())
let heartbeatTimer: number | undefined

onMounted(() => {
  heartbeatTimer = window.setInterval(() => {
    now.value = Date.now()
  }, 1000)
})
onBeforeUnmount(() => {
  if (heartbeatTimer !== undefined) window.clearInterval(heartbeatTimer)
})

function layerLabel(layer: PipelineRunContext['layer']) {
  if (layer === 'settings') return '设定'
  if (layer === 'volumes') return '卷纲'
  if (layer === 'chapters') return '章节'
  if (layer === 'body') return '正文'
  return layer
}

function statusText(run: PipelineRunContext) {
  if (run.status === 'queued') return run.queuedReason || run.statusText || '排队中'
  if (run.status === 'running') return `${run.progress}% · ${run.statusText}`
  return run.statusText
}

function elapsedText(run: PipelineRunContext) {
  void now.value
  const end = run.endedAt || now.value
  const seconds = Math.max(0, Math.round((end - run.startedAt) / 1000))
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}
</script>

<style scoped>
.pipeline-run-center {
  margin: 0 0 12px;
  border: 1px solid var(--border, #ddd);
  border-radius: 6px;
  background: var(--surface, #fff);
  font-size: 12px;
}
.pipeline-run-center-header {
  display: flex;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border, #eee);
}
.pipeline-run-center-list {
  display: grid;
  gap: 6px;
  padding: 8px 10px;
}
.pipeline-run-center-row {
  display: grid;
  grid-template-columns: 48px minmax(80px, 160px) minmax(120px, 1fr) 100px 64px 56px;
  align-items: center;
  gap: 8px;
}
.pipeline-run-progress {
  height: 6px;
  border-radius: 3px;
  background: #eee;
  overflow: hidden;
}
.pipeline-run-progress-bar {
  height: 100%;
  background: #3b82f6;
}
.pipeline-run-queued .pipeline-run-progress-bar {
  background: #f59e0b;
}
</style>
