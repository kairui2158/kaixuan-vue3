import { describe, expect, it, vi, afterEach } from 'vitest'
import { PerformanceMonitor, installPerformanceMonitorReadSurface } from './performanceMonitor'

describe('PerformanceMonitor', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('counts longtask entries from PerformanceObserver', () => {
    let observed: ((entries: PerformanceEntryList) => void) | undefined
    const observe = vi.fn()
    const disconnect = vi.fn()
    const OriginalObserver = globalThis.PerformanceObserver
    vi.stubGlobal('PerformanceObserver', class {
      constructor(callback: (entries: PerformanceEntryList) => void) {
        observed = callback
      }
      observe = observe
      disconnect = disconnect
    })
    const monitor = new PerformanceMonitor()
    monitor.start()
    observed?.([{ entryType: 'longtask', startTime: 10, duration: 250 } as PerformanceEntry])
    observed?.([{ entryType: 'measure', startTime: 20, duration: 900 } as PerformanceEntry])

    expect(monitor.longTaskCount).toBe(1)
    expect(monitor.withinBudget()).toBe(false)
    expect(monitor.listEvents()[0]).toMatchObject({ kind: 'longtask', durationMs: 250 })
    monitor.stop()
    expect(disconnect).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
    vi.stubGlobal('PerformanceObserver', OriginalObserver)
    vi.unstubAllGlobals()
  })

  it('handles Electron array-like PerformanceObserver entries', () => {
    let observed: ((entries: ArrayLike<PerformanceEntry>) => void) | undefined
    vi.stubGlobal('PerformanceObserver', class {
      constructor(callback: (entries: ArrayLike<PerformanceEntry>) => void) {
        observed = callback
      }
      observe() {}
      disconnect() {}
    })
    const monitor = new PerformanceMonitor()
    monitor.start()

    const entries = {
      length: 2,
      0: { entryType: 'longtask', startTime: 10, duration: 250 } as PerformanceEntry,
      1: { entryType: 'longtask', startTime: 20, duration: 320 } as PerformanceEntry,
    }
    expect(() => observed?.(entries)).not.toThrow()
    expect(monitor.longTaskCount).toBe(2)
    monitor.stop()
  })

  it('detects main-thread freezes from delayed watchdog ticks', () => {
    let clock = 1_000
    const monitor = new PerformanceMonitor({ now: () => clock })
    monitor.tick()
    clock += 2_700
    monitor.tick()
    clock += 600
    monitor.tick()

    expect(monitor.freezeCount).toBe(1)
    expect(monitor.listEvents()[0]).toMatchObject({ kind: 'freeze', durationMs: 2_200 })
  })

  it('keeps click feedback inside the 100ms budget observable', () => {
    let clock = 5_000
    const monitor = new PerformanceMonitor({ now: () => clock })
    monitor.clickFeedback(4_950)
    clock += 10
    monitor.clickFeedback(4_880)

    expect(monitor.clickFeedbackCount).toBe(2)
    expect(monitor.slowClickFeedbackCount).toBe(1)
    expect(monitor.withinBudget()).toBe(false)
  })

  it('limits stored evidence without losing newest records', () => {
    let clock = 0
    const monitor = new PerformanceMonitor({ now: () => clock, maxEvents: 2 })
    monitor.clickFeedback(0, 'one')
    clock += 1
    monitor.clickFeedback(0, 'two')
    clock += 1
    monitor.clickFeedback(0, 'three')

    expect(monitor.listEvents().map(event => event.label)).toEqual(['two', 'three'])
  })

  it('exposes a read-only snapshot surface for Electron verification', () => {
    let clock = 0
    const monitor = new PerformanceMonitor({ now: () => clock })
    const originalWindow = globalThis.window
    vi.stubGlobal('window', {})
    installPerformanceMonitorReadSurface(monitor)
    const surface = (globalThis.window as any).__SHENYI_PERFORMANCE_MONITOR__
    const updates: number[] = []
    surface.subscribe(() => updates.push(clock))

    clock += 120
    monitor.clickFeedback(0, 'run-start-click:volumes')
    const snapshot = surface.getSnapshot()

    expect(snapshot).toMatchObject({
      longTaskCount: 0,
      freezeCount: 0,
      clickFeedbackCount: 1,
      slowClickFeedbackCount: 1,
      withinBudget: false,
      thresholds: { clickFeedbackBudgetMs: 100 },
      events: [{ kind: 'click-feedback', label: 'run-start-click:volumes', durationMs: 120 }],
    })
    expect(updates).toEqual([120])

    vi.stubGlobal('window', originalWindow)
    vi.unstubAllGlobals()
    vi.stubGlobal('window', originalWindow)
  })
})
