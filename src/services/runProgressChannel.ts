import type {
  PipelineRunProgressEvent,
  PipelineRunRegistry,
} from './runRegistry'

export interface RunProgressMigrationError {
  reason: 'missing_run_id' | 'unknown_run' | 'terminal_run'
  runId?: string
  event: Omit<PipelineRunProgressEvent, 'runId'> & { runId?: string }
}

export type RunProgressEmitResult =
  | { status: 'applied'; runId: string }
  | { status: 'queued'; runId: string }
  | { status: 'rejected'; reason: RunProgressMigrationError['reason']; runId?: string }

export interface RunProgressChannelOptions {
  mergeWindowMs?: number
  onMigrationError?: (error: RunProgressMigrationError) => void
  now?: () => number
  schedule?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
}

interface PendingEvent {
  event: PipelineRunProgressEvent
  timer: ReturnType<typeof setTimeout>
}

export class RunProgressChannel {
  private readonly pendingByRunId = new Map<string, PendingEvent>()
  private readonly mergeWindowMs: number
  private readonly onMigrationError?: RunProgressChannelOptions['onMigrationError']
  private readonly now: () => number
  private readonly schedule: NonNullable<RunProgressChannelOptions['schedule']>

  constructor(
    private readonly registry: PipelineRunRegistry,
    options: RunProgressChannelOptions = {},
  ) {
    this.mergeWindowMs = options.mergeWindowMs ?? 250
    this.onMigrationError = options.onMigrationError
    this.now = options.now || (() => Date.now())
    this.schedule = options.schedule || ((callback, delayMs) => setTimeout(callback, delayMs))
  }

  emit(event: PipelineRunProgressEvent): RunProgressEmitResult {
    if (!event.runId) {
      this.onMigrationError?.({
        reason: 'missing_run_id',
        event,
      })
      return { status: 'rejected', reason: 'missing_run_id' }
    }

    const run = this.registry.getRun(event.runId)
    if (!run) {
      this.onMigrationError?.({ reason: 'unknown_run', runId: event.runId, event })
      return { status: 'rejected', reason: 'unknown_run', runId: event.runId }
    }
    if (run.status !== 'running' && run.status !== 'queued') {
      this.registry.recordRejectedRunEvent(event.runId, {
        kind: 'progress',
        reason: 'terminal_run',
        detail: event.detail,
      })
      return { status: 'rejected', reason: 'terminal_run', runId: event.runId }
    }

    const pending = this.pendingByRunId.get(event.runId)
    if (pending) {
      this.schedule(() => this.flush(event.runId!), this.remainingWindowMs(pending.event))
      pending.event = event
      return { status: 'queued', runId: event.runId }
    }

    const timer = this.schedule(() => this.flush(event.runId!), this.mergeWindowMs)
    this.pendingByRunId.set(event.runId, { event, timer })
    // Keep the first progress update immediate so the user sees feedback without
    // waiting for a merge window; later updates coalesce per run.
    this.registry.applyProgressEvent({ ...event, updatedAt: this.now() })
    return { status: 'applied', runId: event.runId }
  }

  flush(runId: string): boolean {
    const pending = this.pendingByRunId.get(runId)
    if (!pending) return false
    this.pendingByRunId.delete(runId)
    return this.registry.applyProgressEvent({ ...pending.event, updatedAt: this.now() })
  }

  private remainingWindowMs(event: PipelineRunProgressEvent): number {
    const emittedAt = event.updatedAt || this.now()
    const elapsed = Math.max(0, this.now() - emittedAt)
    return Math.max(0, this.mergeWindowMs - elapsed)
  }
}
