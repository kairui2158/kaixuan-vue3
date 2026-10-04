import type { LongDocumentExecutionOperation } from './longDocumentExecutionPlanner'

export type ActiveExecutionWorkspace = 'main' | 'outline'
export type ActiveExecutionTaskStatus =
  | 'active'
  | 'completed'
  | 'failed'
  | 'invalidated'
  | 'narrowed'
  | 'reset'

export interface ActiveExecutionTask {
  taskId: string
  workspace: ActiveExecutionWorkspace
  projectId: string
  originalRequest: string
  operation: LongDocumentExecutionOperation
  documentVersion: number
  contentHash: string
  createdAt: number
  updatedAt: number
  status: ActiveExecutionTaskStatus
}

export interface ActiveExecutionTaskSnapshot {
  taskId: string
  operation: LongDocumentExecutionOperation
  originalRequest: string
}

const activeTasks = new Map<string, ActiveExecutionTask>()

function key(workspace: ActiveExecutionWorkspace, projectId: string): string {
  return `${workspace}:${projectId}`
}

function isValidTask(
  task: ActiveExecutionTask,
  documentVersion: number,
  contentHash: string,
): boolean {
  return (task.status === 'active' || task.status === 'completed')
    && task.documentVersion === documentVersion
    && task.contentHash === contentHash
}

export class ActiveExecutionTaskStore {
  create(task: ActiveExecutionTask): ActiveExecutionTask {
    const normalized: ActiveExecutionTask = {
      ...task,
      status: 'active',
      createdAt: task.createdAt || Date.now(),
      updatedAt: task.updatedAt || Date.now(),
    }
    activeTasks.set(key(task.workspace, task.projectId), normalized)
    return { ...normalized }
  }

  get(
    workspace: ActiveExecutionWorkspace,
    projectId: string,
  ): ActiveExecutionTask | null {
    const task = activeTasks.get(key(workspace, projectId))
    return task ? { ...task } : null
  }

  getValid(
    workspace: ActiveExecutionWorkspace,
    projectId: string,
    documentVersion: number,
    contentHash: string,
  ): ActiveExecutionTask | null {
    const task = activeTasks.get(key(workspace, projectId))
    if (!task) return null
    if (!isValidTask(task, documentVersion, contentHash)) {
      activeTasks.delete(key(workspace, projectId))
      return null
    }
    return { ...task }
  }

  refresh(
    workspace: ActiveExecutionWorkspace,
    projectId: string,
    documentVersion: number,
    contentHash: string,
  ): ActiveExecutionTask | null {
    const task = activeTasks.get(key(workspace, projectId))
    if (!task || task.status !== 'active') return null
    task.documentVersion = documentVersion
    task.contentHash = contentHash
    task.updatedAt = Date.now()
    return { ...task }
  }

  complete(
    workspace: ActiveExecutionWorkspace,
    projectId: string,
    documentVersion: number,
    contentHash: string,
  ): ActiveExecutionTask | null {
    const task = activeTasks.get(key(workspace, projectId))
    if (!task || task.status !== 'active') return null
    task.status = 'completed'
    task.documentVersion = documentVersion
    task.contentHash = contentHash
    task.updatedAt = Date.now()
    return { ...task }
  }

  getValidSnapshot(
    workspace: ActiveExecutionWorkspace,
    projectId: string,
    documentVersion: number,
    contentHash: string,
  ): ActiveExecutionTaskSnapshot | null {
    const task = this.getValid(workspace, projectId, documentVersion, contentHash)
    return task
      ? {
        taskId: task.taskId,
        operation: task.operation,
        originalRequest: task.originalRequest,
      }
      : null
  }

  markStatus(
    workspace: ActiveExecutionWorkspace,
    projectId: string,
    status: ActiveExecutionTaskStatus,
  ): void {
    const task = activeTasks.get(key(workspace, projectId))
    if (!task) return
    if (status === 'active') {
      task.updatedAt = Date.now()
      return
    }
    activeTasks.delete(key(workspace, projectId))
  }

  clear(workspace: ActiveExecutionWorkspace, projectId: string): void {
    activeTasks.delete(key(workspace, projectId))
  }
}

export const activeExecutionTaskStore = new ActiveExecutionTaskStore()
