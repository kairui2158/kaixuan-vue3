export const PIPELINE_RUN_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'canceled',
] as const

export type PipelineRunStatus = (typeof PIPELINE_RUN_STATUSES)[number]

export type PipelineRunLayer = 'settings' | 'volumes' | 'chapters' | 'body'

export type PipelineProgressPhase =
  | 'queued'
  | 'requesting'
  | 'streaming'
  | 'validating'
  | 'repairing'
  | 'saving'
  | 'terminal'

export interface PipelineRejectedRunEvent {
  kind: 'progress' | 'success' | 'fail' | 'cancel'
  reason: 'missing_run_id' | 'unknown_run' | 'terminal_run'
  detail?: string
  error?: string
  at: number
}

export interface PipelineRunProgressEvent {
  runId?: string
  percent: number
  phase?: PipelineProgressPhase
  detail?: string
  attempt?: number
  queuedReason?: string
  updatedAt?: number
}

export interface PipelineRunContext {
  runId: string
  layer: PipelineRunLayer
  target: string
  dependencyRevision: string
  configSnapshot: Record<string, unknown>
  status: PipelineRunStatus
  progress: number
  progressPhase?: PipelineProgressPhase
  progressAttempt?: number
  queuedReason?: string
  statusText: string
  error?: string
  rejectedEvents?: PipelineRejectedRunEvent[]
  controller: AbortController
  startedAt: number
  endedAt?: number
}

export interface CreatePipelineRunInput {
  layer?: PipelineRunLayer
  target?: string
  dependencyRevision?: string
  configSnapshot?: Record<string, unknown>
  statusText?: string
  status?: PipelineRunStatus
  error?: string
  queuedReason?: string
}

export class PipelineRunRegistry {
  private readonly runsById = new Map<string, PipelineRunContext>()
  private readonly activationWaiters = new Map<string, Array<(run: PipelineRunContext) => void>>()
  private runSequence = 0

  createRun(input: CreatePipelineRunInput = {}): PipelineRunContext {
    this.runSequence += 1
    const run: PipelineRunContext = {
      runId: `pipeline-run-${Date.now()}-${this.runSequence}`,
      layer: input.layer || 'volumes',
      target: input.target || 'all',
      dependencyRevision: input.dependencyRevision || '0',
      configSnapshot: input.configSnapshot ? JSON.parse(JSON.stringify(input.configSnapshot)) : {},
      status: input.status || 'running',
      progress: 0,
      statusText: input.statusText || 'generating',
      controller: new AbortController(),
      startedAt: Date.now(),
      queuedReason: input.queuedReason,
      error: input.error,
    }
    this.runsById.set(run.runId, run)
    if (run.status === 'queued') {
      run.statusText = input.statusText || 'queued'
    }
    return run
  }

  getRun(runId: string): PipelineRunContext | undefined {
    return this.runsById.get(runId)
  }

  get activeRuns(): PipelineRunContext[] {
    return this.listRuns().filter(run => run.status === 'running' || run.status === 'queued')
  }

  get runs(): PipelineRunContext[] {
    return this.listRuns()
  }

  listRuns(): PipelineRunContext[] {
    return Array.from(this.runsById.values())
  }

  waitForActivation(runId: string): Promise<PipelineRunContext> {
    const run = this.runsById.get(runId)
    if (!run) {
      return Promise.reject(new Error(`waitForActivation requires a known runId: ${runId}`))
    }
    if (run.status !== 'queued') return Promise.resolve(run)
    return new Promise(resolve => {
      const waiters = this.activationWaiters.get(runId) || []
      waiters.push(resolve)
      this.activationWaiters.set(runId, waiters)
    })
  }

  updateProgress(runId: string, percent: number, statusText?: string): boolean {
    const run = this.runsById.get(runId)
    if (!run) return false
    if (run.status !== 'running' && run.status !== 'queued') return false
    run.progress = clampPercent(percent)
    if (statusText !== undefined) run.statusText = statusText
    return true
  }

  applyProgressEvent(event: PipelineRunProgressEvent): boolean {
    const run = event.runId ? this.runsById.get(event.runId) : undefined
    if (!run) return false
    if (run.status !== 'running' && run.status !== 'queued') return false
    run.progress = clampPercent(event.percent)
    if (event.phase) run.progressPhase = event.phase
    if (event.detail !== undefined) run.statusText = event.detail
    if (event.attempt !== undefined) run.progressAttempt = event.attempt
    if (event.queuedReason !== undefined) {
      run.queuedReason = event.queuedReason || undefined
    }
    return true
  }

  recordRejectedRunEvent(
    runId: string | undefined,
    rejected: Omit<PipelineRejectedRunEvent, 'at'>,
  ): boolean {
    const run = runId ? this.runsById.get(runId) : undefined
    if (!run) return false
    run.rejectedEvents = [...run.rejectedEvents || [], { ...rejected, at: Date.now() }]
    return true
  }

  activateQueuedRuns(layer: PipelineRunLayer, target: string): PipelineRunContext[] {
    void target
    if (this.listRuns().some(run => run.status === 'running' && run.layer === layer)) return []
    const next = this.listRuns().find(run => run.status === 'queued' && run.layer === layer)
    if (!next) return []
    next.status = 'running'
    next.statusText = 'generating'
    this.resolveActivationWaiters(next)
    return [next]
  }

  succeed(runId: string): boolean {
    return this.finish(runId, 'succeeded', 100)
  }

  fail(runId: string, error: string): boolean {
    return this.finish(runId, 'failed', undefined, error)
  }

  cancel(runId: string): boolean {
    const run = this.runsById.get(runId)
    if (!run || (run.status !== 'running' && run.status !== 'queued')) return false
    // Queued runs may not have started a physical request yet, but aborting
    // their controller also closes the activation race.
    run.controller.abort()
    return this.finish(runId, 'canceled')
  }

  private finish(
    runId: string,
    status: Exclude<PipelineRunStatus, 'running' | 'queued'>,
    progress?: number,
    error?: string
  ): boolean {
    const run = this.runsById.get(runId)
    if (!run) return false
    if (run.status !== 'running' && run.status !== 'queued') return false
    run.status = status
    if (progress !== undefined) run.progress = clampPercent(progress)
    if (error !== undefined) run.error = error
    run.statusText = status
    run.progressPhase = 'terminal'
    run.endedAt = Date.now()
    this.resolveActivationWaiters(run)
    return true
  }

  private resolveActivationWaiters(run: PipelineRunContext): void {
    const waiters = this.activationWaiters.get(run.runId)
    if (!waiters?.length) return
    this.activationWaiters.delete(run.runId)
    for (const resolve of waiters) resolve(run)
  }
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}
