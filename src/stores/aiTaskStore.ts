import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { storageKey } from '../utils/storage-key'

export type TaskState = 'planning' | 'acting' | 'reviewing' | 'completed' | 'failed' | 'paused'

export interface TaskStep {
  stepId: string
  action: string
  targetId: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped'
  result?: string
  error?: string
  retryCount?: number
  startedAt?: number
  completedAt?: number
}

export interface TaskPlan {
  taskId: string
  description: string
  steps: TaskStep[]
  currentStep: number
  state: TaskState
  createdAt: number
  updatedAt: number
  projectId: string
  workspace: string
  stateHistory?: Array<{
    stepId: string
    fromStatus: TaskStep['status']
    toStatus: TaskStep['status']
    reason?: string
    recordedAt: number
  }>
}

export const useAiTaskStore = defineStore('aiTask', () => {
  const tasks = ref<TaskPlan[]>([])
  const activeTaskId = ref<string | null>(null)

  const activeTask = computed(() => tasks.value.find(t => t.taskId === activeTaskId.value) || null)
  const hasActiveTask = computed(() => activeTask.value !== null)
  const taskCount = computed(() => tasks.value.length)

  function createTask(params: {
    description: string
    projectId: string
    workspace: string
    steps: Array<{ action: string; targetId: string }>
  }): TaskPlan {
    const task: TaskPlan = {
      taskId: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      description: params.description,
      projectId: params.projectId,
      workspace: params.workspace,
      steps: params.steps.map((step, i) => ({
        stepId: `step_${i}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        action: step.action,
        targetId: step.targetId,
        status: 'pending' as const,
      })),
      currentStep: 0,
      state: 'planning',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    tasks.value.push(task)
    activeTaskId.value = task.taskId
    persist()
    return task
  }

  function updateTaskState(taskId: string, state: TaskState) {
    const task = tasks.value.find(t => t.taskId === taskId)
    if (!task) return
    task.state = state
    task.updatedAt = Date.now()
    persist()
  }

  function updateStepStatus(taskId: string, stepId: string, status: TaskStep['status'], result?: string, error?: string) {
    const task = tasks.value.find(t => t.taskId === taskId)
    if (!task) return
    const step = task.steps.find(s => s.stepId === stepId)
    if (!step) return
    const fromStatus = step.status
    step.status = status
    if (result !== undefined) step.result = result
    if (error !== undefined) step.error = error
    if (status === 'running') step.startedAt = Date.now()
    if (status === 'done' || status === 'failed') step.completedAt = Date.now()
    task.updatedAt = Date.now()
    if (status === 'done') {
      task.currentStep = Math.min(task.currentStep + 1, task.steps.length)
      if (task.currentStep >= task.steps.length) {
        task.state = 'completed'
      }
    }
    if (status === 'failed') {
      task.state = 'failed'
    }
    task.stateHistory = [
      ...(task.stateHistory || []),
      {
        stepId,
        fromStatus,
        toStatus: status,
        reason: result || error || 'status-update',
        recordedAt: Date.now()
      }
    ]
    persist()
  }

  function pauseTask(taskId: string) {
    updateTaskState(taskId, 'paused')
  }

  function resumeTask(taskId: string) {
    const task = tasks.value.find(t => t.taskId === taskId)
    if (!task) return
    if (task.state === 'paused') updateTaskState(taskId, 'acting')
  }

  function retryStep(taskId: string) {
    const task = tasks.value.find(t => t.taskId === taskId)
    if (!task) return
    const failedStep = task.steps.find(s => s.status === 'failed')
    if (failedStep) {
      updateStepStatus(taskId, failedStep.stepId, 'pending')
      updateTaskState(taskId, 'acting')
    }
  }

  function completeTask(taskId: string) {
    updateTaskState(taskId, 'completed')
  }

  function clearTask(taskId: string) {
    const idx = tasks.value.findIndex(t => t.taskId === taskId)
    if (idx >= 0) {
      tasks.value.splice(idx, 1)
      if (activeTaskId.value === taskId) activeTaskId.value = null
      persist()
    }
  }

  function persist() {
    try {
      const key = `wa_ai_task_${activeTaskId.value || 'default'}`
      const data = JSON.stringify(tasks.value)
      localStorage.setItem(key, data)
    } catch (e) {
      console.error('[AI_TASK_STORE] persist failed', e)
    }
  }

  function restore(projectId: string) {
    try {
      const key = `wa_ai_task_${projectId}`
      const raw = localStorage.getItem(key)
      if (raw) {
        tasks.value = JSON.parse(raw)
      }
    } catch (e) {
      console.error('[AI_TASK_STORE] restore failed', e)
    }
  }

  return {
    tasks, activeTaskId, activeTask, hasActiveTask, taskCount,
    createTask, updateTaskState, updateStepStatus,
    pauseTask, resumeTask, retryStep, completeTask, clearTask, restore,
  }
})
