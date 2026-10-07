import { describe, expect, it, vi } from 'vitest'
import {
  createLifecycleTransitionEvent,
  isLegalLifecycleTransition,
  isLegalKnownLifecycleTransition,
  mapToLifecycle,
} from './stateTransitionGuard'
import {
  getStateTimeout,
  startStateWatchdog,
  LONG_DOCUMENT_ACTIVE_TIMEOUT_MS,
  type StateWatchdog,
} from './stateWatchdog'
import { checkStateIntegrity } from './stateIntegrityCheck'
import type { RunTrace } from '../stores/runTrace'

describe('state transition guard', () => {
  it('preserves blocked as a distinct recoverable lifecycle state', () => {
    expect(isLegalLifecycleTransition('running', 'blocked')).toBe(true)
    expect(isLegalLifecycleTransition('blocked', 'running')).toBe(true)
    expect(isLegalLifecycleTransition('success', 'running')).toBe(false)
  })

  it('records suspicious transitions without failing production', () => {
    const event = createLifecycleTransitionEvent('RunTraceStatus', 'success', 'running')
    expect(event.type).toBe('state-transition-violation')
    expect(event.level).toBe('warn')
  })

  it('maps EditTask terminal statuses to distinct lifecycle semantics', () => {
    expect(isLegalLifecycleTransition('running', 'partially_applied')).toBe(true)
    expect(isLegalLifecycleTransition('running', 'failed_after_write')).toBe(true)
    expect(isLegalLifecycleTransition('running', 'success_with_warnings')).toBe(true)
    expect(isLegalLifecycleTransition('running', 'success')).toBe(true)
    expect(mapToLifecycle('RunTraceStatus', 'unknown_status')).toBe('blocked')
    expect(isLegalKnownLifecycleTransition('running', 'unknown_status')).toBe(false)
  })
})

describe('state watchdog', () => {
  it('allows skill timeout hints to override defaults', () => {
    expect(getStateTimeout('active')).toBe(600_000)
    expect(getStateTimeout('active', { timeoutHint: { active: 900_000 } })).toBe(900_000)
  })

  it('keeps a dedicated long-document active timeout constant for both workspaces', () => {
    expect(LONG_DOCUMENT_ACTIVE_TIMEOUT_MS).toBe(3_600_000)
    expect(getStateTimeout('active', { timeoutHint: { active: LONG_DOCUMENT_ACTIVE_TIMEOUT_MS } }))
      .toBe(LONG_DOCUMENT_ACTIVE_TIMEOUT_MS)
  })

  it('fires once and can be cleared before firing', () => {
    vi.useFakeTimers()
    let fired = 0
    const watchdog: StateWatchdog | null = startStateWatchdog(() => {
      fired += 1
    }, 'active')
    expect(watchdog).not.toBeNull()
    vi.advanceTimersByTime(600_000)
    expect(fired).toBe(1)
    watchdog?.clear()
    vi.useRealTimers()
  })

  it('accepts non-active lifecycle states and reports the actual status', () => {
    vi.useFakeTimers()
    const fired: string[] = []
    const watchdog = startStateWatchdog(status => fired.push(status), 'awaiting_user')
    expect(watchdog).not.toBeNull()
    vi.advanceTimersByTime(600_001)
    expect(fired).toEqual(['awaiting_user'])
    watchdog?.clear()
    vi.useRealTimers()
  })

  it('resets the stuck deadline on reported progress', () => {
    vi.useFakeTimers()
    let fired = 0
    const watchdog = startStateWatchdog(() => {
      fired += 1
    }, 'active', { timeoutHint: { active: 30_000 } })
    vi.advanceTimersByTime(29_000)
    watchdog?.reportProgress()
    vi.advanceTimersByTime(29_000)
    expect(fired).toBe(0)
    vi.advanceTimersByTime(1_000)
    expect(fired).toBe(1)
    watchdog?.clear()
    vi.useRealTimers()
  })
})

describe('state integrity', () => {
  it('finds running runs and API calls without changing them', () => {
    const now = Date.now()
    const runs = [{
      id: 'run-1',
      source: 'pipeline',
      status: 'running',
      startedAt: now,
      apiCalls: [{ id: 'call-1', seq: 1, status: 'running', startedAt: now }],
    }] as unknown as RunTrace[]
    const report = checkStateIntegrity(runs)
    expect(report.healthy).toBe(false)
    expect(report.stuckRuns).toHaveLength(1)
    expect(report.runningApiCalls).toHaveLength(1)
  })
})


