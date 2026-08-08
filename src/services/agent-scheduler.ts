/**
 * Agent Scheduler - manages parallel/sequential agent execution
 * Supports: sequential chain, parallel dispatch, split-merge, multi-step
 */

export interface AgentTask {
  id: string
  name: string
  type: string
  status: 'idle' | 'running' | 'completed' | 'failed' | 'waiting'
  progress: number
  currentStep: string
  result?: any
  error?: string
  startTime?: number
  endTime?: number
}

export interface ScheduleConfig {
  mode: 'chain' | 'split-merge' | 'multi-step'
  agentId: string | null
  skillIds: string[]
  splitSize?: number
  hardruleEnabled?: boolean
  level?: string
}

type ProgressCallback = (taskId: string, progress: number, step: string) => void
type StatusCallback = (taskId: string, status: AgentTask['status']) => void

class AgentSchedulerClass {
  private tasks = new Map<string, AgentTask>()
  private progressCallbacks: ProgressCallback[] = []
  private statusCallbacks: StatusCallback[] = []

  spawn(name: string, type: string): string {
    const id = 'task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
    const task: AgentTask = {
      id, name, type,
      status: 'idle',
      progress: 0,
      currentStep: ''
    }
    this.tasks.set(id, task)
    this.notifyStatus(id, 'idle')
    return id
  }

  start(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (task) {
      task.status = 'running'
      task.startTime = Date.now()
      this.notifyStatus(taskId, 'running')
    }
  }

  updateProgress(taskId: string, progress: number, step: string): void {
    const task = this.tasks.get(taskId)
    if (task) {
      task.progress = progress
      task.currentStep = step
      this.progressCallbacks.forEach(cb => cb(taskId, progress, step))
    }
  }

  complete(taskId: string, result?: any): void {
    const task = this.tasks.get(taskId)
    if (task) {
      task.status = 'completed'
      task.progress = 100
      task.result = result
      task.endTime = Date.now()
      this.notifyStatus(taskId, 'completed')
    }
  }

  fail(taskId: string, error: string): void {
    const task = this.tasks.get(taskId)
    if (task) {
      task.status = 'failed'
      task.error = error
      task.endTime = Date.now()
      this.notifyStatus(taskId, 'failed')
    }
  }

  cancel(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (task) {
      task.status = 'idle'
      task.progress = 0
      this.notifyStatus(taskId, 'idle')
    }
  }

  get(taskId: string): AgentTask | undefined {
    return this.tasks.get(taskId)
  }

  getAll(): AgentTask[] {
    return Array.from(this.tasks.values())
  }

  getActive(): AgentTask[] {
    return this.getAll().filter(t => t.status === 'running' || t.status === 'waiting')
  }

  onProgress(cb: ProgressCallback): void {
    this.progressCallbacks.push(cb)
  }

  onStatusChange(cb: StatusCallback): void {
    this.statusCallbacks.push(cb)
  }

  private notifyStatus(taskId: string, status: AgentTask['status']): void {
    this.statusCallbacks.forEach(cb => cb(taskId, status))
  }

  clear(): void {
    this.tasks.clear()
  }
}

export const AgentScheduler = new AgentSchedulerClass()
