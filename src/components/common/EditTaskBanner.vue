<template>
  <div
    v-if="task"
    class="edit-task-banner"
    :class="`is-${task.status}`"
    :data-task-id="task.id"
  >
    <span class="edit-task-dot" aria-hidden="true"></span>
    <div class="edit-task-main">
      <div class="edit-task-title">
        <span>编辑任务 {{ task.id }}</span>
        <span class="edit-task-progress">{{ progress }}</span>
      </div>
      <div class="edit-task-goal">{{ task.goal }}</div>
      <div class="edit-task-batches">
        <span
          v-for="batchId in visibleBatches"
          :key="batchId"
          class="edit-task-batch"
          :class="batchState(batchId)"
          :title="batchId"
        >{{ batchId }}</span>
        <span
          v-if="failedBatchIds.length > 0"
          class="edit-task-batch is-failed"
          :title="failedBatchIds.join(', ')"
        >{{ failedBatchIds.length }} 失败</span>
      </div>
    </div>
    <div class="edit-task-actions">
      <button
        type="button"
        class="msg-btn"
        :disabled="busy || (task.status !== 'waiting_user' && task.status !== 'partially_applied' && task.status !== 'awaiting_batch')"
        @click="$emit('resume', task)"
      >继续任务</button>
      <button
        type="button"
        class="msg-btn"
        :disabled="busy"
        @click="$emit('cancel', task)"
      >取消任务</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { EditTask } from '../../services/editTaskService'
import { editTaskSessionProgress } from '../../composables/useEditTaskSession'

defineEmits<{
  resume: [task: EditTask]
  cancel: [task: EditTask]
}>()

const props = defineProps<{
  task: EditTask | null
  busy?: boolean
}>()

const progress = computed(() => editTaskSessionProgress(props.task))
const visibleBatches = computed(() => props.task?.plan.batches.slice(-8) || [])
const failedBatchIds = computed(() => props.task?.failedBatchIds || [])

function batchState(batchId: string): string {
  const task = props.task
  if (!task) return ''
  if (task.executedBatches.includes(batchId)) return 'is-done'
  if (task.activeBatchId === batchId) return 'is-running'
  if (task.failedBatchIds.includes(batchId)) return 'is-failed'
  return 'is-pending'
}
</script>

<style scoped>
.edit-task-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-secondary);
}

.edit-task-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--accent);
}

.is-failed_after_write .edit-task-dot,
.is-failed_before_write .edit-task-dot,
.is-partially_applied .edit-task-dot {
  background: var(--danger, #d64545);
}

.is-completed .edit-task-dot,
.is-completed_with_warnings .edit-task-dot {
  background: var(--success, #3e9c62);
}

.edit-task-main {
  min-width: 0;
  flex: 1;
}

.edit-task-title {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
}

.edit-task-progress {
  color: var(--text-muted);
  font-weight: 400;
}

.edit-task-goal {
  margin-top: 2px;
  overflow: hidden;
  color: var(--text-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.edit-task-batches {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.edit-task-batch {
  max-width: 160px;
  overflow: hidden;
  padding: 1px 5px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.edit-task-batch.is-done {
  border-color: var(--success, #3e9c62);
  color: var(--success, #3e9c62);
}

.edit-task-batch.is-running {
  border-color: var(--accent);
  color: var(--accent);
}

.edit-task-batch.is-failed {
  border-color: var(--danger, #d64545);
  color: var(--danger, #d64545);
}

.edit-task-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
}
</style>
