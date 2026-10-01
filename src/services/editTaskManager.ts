import type { ToolResult } from './editorTools'
import {
  applyEditTaskEvent,
  type EditTask,
} from './editTaskService'

export type EditTaskManagerStatus =
  | 'not_started'
  | 'active'
  | 'paused'
  | 'finished'
  | 'canceled'

export interface EditTaskManagerState {
  status: EditTaskManagerStatus
  task: EditTask | null
}

export interface EditTaskManager {
  getCurrentTask(): EditTask | null
  getActiveTask(): EditTask | null
  getTask(taskId: string): EditTask | null
  startTask(task: EditTask): EditTask
  updateTask(task: EditTask): EditTask
  pauseTask(taskId: string): EditTask | null
  resumeTask(taskId: string): EditTask | null
  cancelTask(taskId: string): EditTask | null
  finishTask(taskId: string): EditTask | null
  finishTaskWithWarnings(taskId: string): EditTask | null
  finishTaskWithFailure(taskId: string): EditTask | null
}

function isActiveStatus(status: EditTask['status']): boolean {
  return status === 'planning'
    || status === 'awaiting_batch'
    || status === 'running_batch'
    || status === 'partially_applied'
    || status === 'waiting_user'
}

function managerStatus(task: EditTask | null): EditTaskManagerStatus {
  if (!task) return 'not_started'
  if (task.status === 'failed_before_write' || task.status === 'failed_after_write') return 'finished'
  if (task.status === 'canceled') return 'canceled'
  if (!isActiveStatus(task.status)) return 'finished'
  if (task.status === 'waiting_user') return 'paused'
  return 'active'
}

export function createEditTaskManager(): EditTaskManager {
  let currentTask: EditTask | null = null
  const finishedTasks = new Map<string, EditTask>()

  const requireTask = (taskId: string): EditTask | null => {
    if (!currentTask) return null
    if (currentTask.id === taskId) return currentTask
    return finishedTasks.get(taskId) || null
  }

  const withTask = (
    taskId: string,
    update: (task: EditTask) => EditTask,
  ): EditTask | null => {
    const task = requireTask(taskId)
    if (!task) return null
    const next = update(task)
    if (currentTask && currentTask.id === next.id) currentTask = next
    else finishedTasks.set(next.id, next)
    return next
  }

  return {
    getCurrentTask() {
      return currentTask
    },
    getActiveTask() {
      if (!currentTask) return null
      if (!isActiveStatus(currentTask.status)) return null
      return currentTask
    },
    getTask(taskId) {
      const task = requireTask(taskId)
      if (!task || !isActiveStatus(task.status)) return task
      return currentTask
    },
    startTask(task) {
      currentTask = task
      return task
    },
    updateTask(task) {
      if (currentTask?.id === task.id) currentTask = task
      else finishedTasks.set(task.id, task)
      return task
    },
    pauseTask(taskId) {
      return withTask(taskId, task => applyEditTaskEvent(task, {
        type: 'task_paused',
        now: Date.now(),
      }))
    },
    resumeTask(taskId) {
      return withTask(taskId, task => applyEditTaskEvent(task, {
        type: 'task_resumed',
        now: Date.now(),
      }))
    },
    cancelTask(taskId) {
      return withTask(taskId, task => applyEditTaskEvent(task, {
        type: 'task_canceled',
        now: Date.now(),
      }))
    },
    finishTask(taskId) {
      return withTask(taskId, task => applyEditTaskEvent(task, {
        type: 'task_succeeded',
        now: Date.now(),
      }))
    },
    finishTaskWithWarnings(taskId) {
      return withTask(taskId, task => applyEditTaskEvent(task, {
        type: 'task_succeeded_with_warnings',
        now: Date.now(),
      }))
    },
    finishTaskWithFailure(taskId) {
      return withTask(taskId, task => applyEditTaskEvent(task, {
        type: 'task_failed',
        now: Date.now(),
      }))
    },
  }
}

export function getEditTaskManagerState(
  manager: EditTaskManager,
): EditTaskManagerState {
  const task = manager.getCurrentTask()
  return { status: managerStatus(task), task }
}

export function buildEditTaskControlHandlers(
  manager: EditTaskManager,
  options: {
    onResume?: (task: EditTask) => Promise<void> | void
    onCancel?: (task: EditTask) => Promise<void> | void
  } = {},
): {
  onResumeEditTask: (taskId: string) => Promise<ToolResult>
  onCancelEditTask: (taskId: string) => Promise<ToolResult>
} {
  return {
    async onResumeEditTask(taskId) {
      const current = manager.getActiveTask()
      if (
        !current
        || current.id !== taskId
        || (current.status !== 'awaiting_batch' && current.status !== 'waiting_user')
      ) {
        return {
          ok: false,
          error: {
            code: 'task_not_resumable',
            message: `当前任务状态不支持恢复：${current?.status || 'not_found'}。批次是原子执行：失败批次未写入时任务进入 failed_before_write 终态，请基于当前编辑器内容重新提交完整批次；移动整节请使用 move 操作。`,
          },
        }
      }
      const task = manager.resumeTask(taskId)
      if (!task) {
        return {
          ok: false,
          error: { code: 'task_not_found', message: '没有找到要恢复的编辑任务' },
        }
      }
      await options.onResume?.(task)
      return { ok: true, data: { taskId: task.id, status: task.status } }
    },
    async onCancelEditTask(taskId) {
      const task = manager.cancelTask(taskId)
      if (!task) {
        return {
          ok: false,
          error: { code: 'task_not_found', message: '没有找到要取消的编辑任务' },
        }
      }
      await options.onCancel?.(task)
      return { ok: true, data: { taskId: task.id, status: task.status } }
    },
  }
}
