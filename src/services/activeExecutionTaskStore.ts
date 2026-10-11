import type {
  LongDocumentExecutionOperation,
  LongDocumentExecutionPlan,
} from './longDocumentExecutionPlanner'

export type ActiveExecutionWorkspace = 'main' | 'outline'
export type ActiveExecutionTaskStatus =
  | 'active'
  | 'awaiting_user_plan'
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
  plan?: LongDocumentExecutionPlan
  authorizedExcerpts?: string[]
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
  status: ActiveExecutionTaskStatus
  plan?: LongDocumentExecutionPlan
  authorizedExcerpts: string[]
}

export interface SupersededActivePlanRecord {
  taskId: string
  planId: string | null
  reason: string
  supersededAt: number
}

export interface AuthorizedExcerptObservation {
  taskId: string
  outcome: 'appended' | 'rejected-empty' | 'rejected-length'
  excerptChars: number
}

const MAX_AUTHORIZED_EXCERPTS = 3
const MAX_AUTHORIZED_EXCERPT_CHARS = 20_000

function key(workspace: ActiveExecutionWorkspace, projectId: string): string {
  return `${workspace}:${projectId}`
}

function isValidTask(
  task: ActiveExecutionTask,
  documentVersion: number,
  contentHash: string,
): boolean {
  return (
    task.status === 'active' ||
    task.status === 'awaiting_user_plan' ||
    task.status === 'completed'
  )
    && task.documentVersion === documentVersion
    && task.contentHash === contentHash
}

export class ActiveExecutionTaskStore {
  private readonly activeTasks = new Map<string, ActiveExecutionTask>()
  private lastSupersededPlan: SupersededActivePlanRecord | null = null
  private lastAuthorizedExcerptObservation: AuthorizedExcerptObservation | null = null

  create(task: ActiveExecutionTask): ActiveExecutionTask {
    const taskKey = key(task.workspace, task.projectId)
    const existing = this.activeTasks.get(taskKey)
    if (
      existing?.status === 'awaiting_user_plan'
      || (existing?.status === 'active' && task.operation === 'discussion')
    ) {
      return { ...existing }
    }
    const normalized: ActiveExecutionTask = {
      ...task,
      status: 'active',
      createdAt: task.createdAt || Date.now(),
      updatedAt: task.updatedAt || Date.now(),
    }
    this.activeTasks.set(taskKey, normalized)
    return { ...normalized }
  }

  get(
    workspace: ActiveExecutionWorkspace,
    projectId: string,
  ): ActiveExecutionTask | null {
    const task = this.activeTasks.get(key(workspace, projectId))
    return task ? { ...task } : null
  }

  getValid(
    workspace: ActiveExecutionWorkspace,
    projectId: string,
    documentVersion: number,
    contentHash: string,
  ): ActiveExecutionTask | null {
    const task = this.activeTasks.get(key(workspace, projectId))
    if (!task) return null
    if (!isValidTask(task, documentVersion, contentHash)) {
      this.activeTasks.delete(key(workspace, projectId))
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
    const task = this.activeTasks.get(key(workspace, projectId))
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
    const task = this.activeTasks.get(key(workspace, projectId))
    if (!task || (task.status !== 'active' && task.status !== 'awaiting_user_plan')) return null
    task.status = 'completed'
    task.documentVersion = documentVersion
    task.contentHash = contentHash
    task.updatedAt = Date.now()
    return { ...task }
  }

  markAwaitingUserPlan(
    workspace: ActiveExecutionWorkspace,
    projectId: string,
  ): ActiveExecutionTask | null {
    const task = this.activeTasks.get(key(workspace, projectId))
    if (!task || task.status !== 'active' || !task.plan) return null
    task.status = 'awaiting_user_plan'
    task.updatedAt = Date.now()
    return { ...task }
  }

  supersedeAwaitingUserPlan(
    workspace: ActiveExecutionWorkspace,
    projectId: string,
    reason: 'new-edit-request',
  ): void {
    const task = this.activeTasks.get(key(workspace, projectId))
    if (task?.status !== 'awaiting_user_plan') return
    this.activeTasks.delete(key(workspace, projectId))
    this.lastSupersededPlan = {
      taskId: task.taskId,
      planId: task.plan?.planId || null,
      reason,
      supersededAt: Date.now(),
    }
  }

  isAwaitingPlanSupersededByPlan(
    workspace: ActiveExecutionWorkspace,
    projectId: string,
    replacementOperation: LongDocumentExecutionOperation,
  ): boolean {
    const task = this.activeTasks.get(key(workspace, projectId))
    return task?.status === 'awaiting_user_plan'
      && replacementOperation !== 'discussion'
  }

  appendAuthorizedExcerpt(
    workspace: ActiveExecutionWorkspace,
    projectId: string,
    excerpt: string,
  ): ActiveExecutionTask | null {
    const task = this.activeTasks.get(key(workspace, projectId))
    if (
      !task ||
      (task.status !== 'active' && task.status !== 'awaiting_user_plan')
    ) return null
    const normalizedExcerpt = excerpt.trim()
    if (
      !normalizedExcerpt ||
      normalizedExcerpt.length > MAX_AUTHORIZED_EXCERPT_CHARS
    ) {
      this.lastAuthorizedExcerptObservation = {
        taskId: task.taskId,
        outcome: normalizedExcerpt ? 'rejected-length' : 'rejected-empty',
        excerptChars: normalizedExcerpt.length,
      }
      return { ...task }
    }
    const excerpts = [...(task.authorizedExcerpts || []), normalizedExcerpt]
      .slice(-MAX_AUTHORIZED_EXCERPTS)
    task.authorizedExcerpts = excerpts
    task.updatedAt = Date.now()
    this.lastAuthorizedExcerptObservation = {
      taskId: task.taskId,
      outcome: 'appended',
      excerptChars: normalizedExcerpt.length,
    }
    return { ...task }
  }

  consumeLastAuthorizedExcerptObservation(): AuthorizedExcerptObservation | null {
    const observation = this.lastAuthorizedExcerptObservation
    this.lastAuthorizedExcerptObservation = null
    return observation
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
        status: task.status,
        ...(task.plan ? { plan: task.plan } : {}),
        authorizedExcerpts: [...(task.authorizedExcerpts || [])],
      }
      : null
  }

  clear(workspace: ActiveExecutionWorkspace, projectId: string): void {
    this.activeTasks.delete(key(workspace, projectId))
  }

  consumeLastSupersededPlan(): SupersededActivePlanRecord | null {
    const record = this.lastSupersededPlan
    this.lastSupersededPlan = null
    return record
  }
}

export const activeExecutionTaskStore = new ActiveExecutionTaskStore()
