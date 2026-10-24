export interface PerformanceEventRecord {
  kind: 'longtask' | 'freeze' | 'click-feedback' | 'responsiveness-state'
  startTime: number
  durationMs: number
  label?: string
  payload?: unknown
}

export type ResponsivenessState = 'normal' | 'warning' | 'safe_mode'

export interface PerformanceMonitorOptions {
  now?: () => number
  longTaskThresholdMs?: number
  freezeThresholdMs?: number
  safeModeThresholdMs?: number
  clickFeedbackBudgetMs?: number
  maxEvents?: number
  recoveryTicks?: number
}

interface PerformanceObserverLike {
  observe: (options: { type: string; buffered?: boolean }) => void
  disconnect: () => void
}

type PerformanceObserverCtor = new (
  callback: (entries: PerformanceEntryList | ArrayLike<PerformanceEntry>) => void
) => PerformanceObserverLike

/**
 * Main-thread health counters for the parallel-run budget. The counters stay
 * framework-neutral so Electron verification scripts can read them directly.
 */
export class PerformanceMonitor {
  readonly longTaskThresholdMs: number
  readonly freezeThresholdMs: number
  readonly safeModeThresholdMs: number
  readonly clickFeedbackBudgetMs: number
  longTaskCount = 0
  freezeCount = 0
  safeModeCount = 0
  clickFeedbackCount = 0
  slowClickFeedbackCount = 0
  responsivenessState: ResponsivenessState = 'normal'
  private readonly maxEvents: number
  private readonly now: () => number
  private readonly recoveryTicks: number
  private observer: PerformanceObserverLike | null = null
  private freezeStartedAt: number | null = null
  private consecutiveCleanTicks = 0
  private safeModeSource: 'auto' | 'manual' | null = null
  private readonly events: PerformanceEventRecord[] = []
  private readonly listeners = new Set<() => void>()

  constructor(options: PerformanceMonitorOptions = {}) {
    this.longTaskThresholdMs = options.longTaskThresholdMs ?? 200
    this.freezeThresholdMs = options.freezeThresholdMs ?? 2000
    this.safeModeThresholdMs = options.safeModeThresholdMs ?? 5000
    this.clickFeedbackBudgetMs = options.clickFeedbackBudgetMs ?? 100
    this.now = options.now || (() => Date.now())
    const maxEvents = options.maxEvents ?? 200
    if (!Number.isFinite(maxEvents) || maxEvents < 1) throw new Error('maxEvents must be a positive number')
    this.maxEvents = maxEvents
    const recoveryTicks = options.recoveryTicks ?? 2
    if (!Number.isFinite(recoveryTicks) || recoveryTicks < 1) throw new Error('recoveryTicks must be a positive number')
    this.recoveryTicks = Math.floor(recoveryTicks)
  }

  start(): void {
    const observerCtor = (globalThis as unknown as { PerformanceObserver?: PerformanceObserverCtor }).PerformanceObserver
    if (!observerCtor) return
    this.observer = new observerCtor(entries => {
      // Electron passes an array-like entry list without Symbol.iterator.
      const entryList = Array.isArray(entries) ? entries : Array.from(entries)
      for (const entry of entryList) {
        if (entry.entryType !== 'longtask') continue
        this.longTaskCount += 1
        this.record({
          kind: 'longtask',
          startTime: entry.startTime || this.now(),
          durationMs: entry.duration || 0,
          label: 'main-thread-long-task'
        })
      }
    })
    try {
      this.observer.observe({ type: 'longtask', buffered: true })
    } catch {
      this.observer = null
    }
  }

  /**
   * Timer ticks cannot fire while the main thread is blocked, so the delay
   * beyond the interval approximates main-thread freeze time.
   */
  tick(): void {
    const now = this.now()
    if (this.freezeStartedAt === null) {
      this.freezeStartedAt = now
      return
    }
    const blockedMs = now - this.freezeStartedAt - 500
    this.applyBlockedDuration(blockedMs, this.freezeStartedAt)
    this.freezeStartedAt = now
  }

  private applyBlockedDuration(blockedMs: number, startedAt: number | null) {
    if (blockedMs >= this.freezeThresholdMs) {
      this.freezeCount += 1
      this.record({
        kind: 'freeze',
        startTime: startedAt ?? this.now(),
        durationMs: blockedMs,
          label: 'main-thread-freeze'
      })
    }
    if (blockedMs >= this.safeModeThresholdMs) {
      this.enterSafeMode('auto', blockedMs, startedAt || this.now())
      return
    }
    if (blockedMs >= this.freezeThresholdMs) {
      this.setResponsivenessState('warning', 'freeze', blockedMs)
      this.consecutiveCleanTicks = 0
      return
    }
    if (this.responsivenessState === 'normal') return
    this.consecutiveCleanTicks += 1
    if (this.safeModeSource === 'auto' && this.consecutiveCleanTicks >= this.recoveryTicks) {
      this.setResponsivenessState('normal', 'recovered', undefined)
      this.safeModeSource = null
    }
  }

  clickFeedback(startedAt: number, label = 'run-start-click'): void {
    const durationMs = Math.max(0, this.now() - startedAt)
    this.clickFeedbackCount += 1
    if (durationMs > this.clickFeedbackBudgetMs) this.slowClickFeedbackCount += 1
    this.record({
      kind: 'click-feedback',
      startTime: startedAt,
      durationMs,
      label
    })
  }

  listEvents(): readonly PerformanceEventRecord[] {
    return this.events.slice()
  }

  getSnapshot(): {
    longTaskCount: number
    freezeCount: number
    clickFeedbackCount: number
      slowClickFeedbackCount: number
      safeModeCount: number
      responsivenessState: ResponsivenessState
      withinBudget: boolean
      thresholds: {
        longTaskThresholdMs: number
        freezeThresholdMs: number
        safeModeThresholdMs: number
        clickFeedbackBudgetMs: number
      }
    events: readonly PerformanceEventRecord[]
  } {
    return {
      longTaskCount: this.longTaskCount,
      freezeCount: this.freezeCount,
      clickFeedbackCount: this.clickFeedbackCount,
      slowClickFeedbackCount: this.slowClickFeedbackCount,
      safeModeCount: this.safeModeCount,
      responsivenessState: this.responsivenessState,
      withinBudget: this.withinBudget(),
      thresholds: {
        longTaskThresholdMs: this.longTaskThresholdMs,
        freezeThresholdMs: this.freezeThresholdMs,
        safeModeThresholdMs: this.safeModeThresholdMs,
        clickFeedbackBudgetMs: this.clickFeedbackBudgetMs,
      },
      events: this.listEvents(),
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }

  withinBudget(): boolean {
    return this.longTaskCount === 0
      && this.freezeCount === 0
      && this.slowClickFeedbackCount === 0
  }

  stop(): void {
    this.observer?.disconnect()
    this.observer = null
    this.freezeStartedAt = null
  }

  requestSafeMode(reason = 'renderer_requested'): void {
    this.enterSafeMode('manual', undefined, this.now(), reason)
  }

  exitSafeMode(reason = 'user_exit'): void {
    if (this.responsivenessState !== 'safe_mode') return
    this.setResponsivenessState('normal', reason, undefined)
    this.safeModeSource = null
    this.consecutiveCleanTicks = 0
  }

  private enterSafeMode(source: 'auto' | 'manual', durationMs: number | undefined, startedAt: number, reason?: string) {
    if (this.responsivenessState === 'safe_mode') return
    this.safeModeCount += 1
    this.safeModeSource = source
    this.consecutiveCleanTicks = 0
    this.setResponsivenessState('safe_mode', source === 'manual' ? reason || 'renderer_requested' : 'main-thread-blocked', durationMs, startedAt)
  }

  private setResponsivenessState(
    state: ResponsivenessState,
    reason: string,
    durationMs?: number,
    startedAt?: number,
  ) {
    if (this.responsivenessState === state) return
    this.responsivenessState = state
    this.record({
      kind: 'responsiveness-state',
      startTime: startedAt ?? this.now(),
      durationMs: Math.max(0, durationMs ?? 0),
      label: `responsiveness-${state}`,
      payload: { reason, source: this.safeModeSource || 'auto' },
    })
  }

  private record(event: PerformanceEventRecord) {
    this.events.push(event)
    if (this.events.length > this.maxEvents) this.events.splice(0, this.events.length - this.maxEvents)
    this.notify()
  }
}

export const appPerformanceMonitor = new PerformanceMonitor()

export function installPerformanceMonitorReadSurface(monitor: PerformanceMonitor = appPerformanceMonitor): void {
  if (typeof window === 'undefined') return
  const target = window as Window & { __SHENYI_PERFORMANCE_MONITOR__?: unknown }
  if (target.__SHENYI_PERFORMANCE_MONITOR__) return
  Object.defineProperty(target, '__SHENYI_PERFORMANCE_MONITOR__', {
    enumerable: false,
    configurable: false,
    writable: false,
    value: {
      getSnapshot: () => monitor.getSnapshot(),
      subscribe: (listener: () => void) => monitor.subscribe(listener),
    },
  })
}
