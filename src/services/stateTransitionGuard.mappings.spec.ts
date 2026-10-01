import { describe, expect, it } from 'vitest'
import {
  LIFECYCLE_MAPPINGS,
  LIFECYCLE_TRANSITIONS,
  RESOURCE_MAPPINGS,
  isLegalLifecycleTransition,
  mapToLifecycle,
  mapToResource,
} from './stateTransitionGuard'
import { getStateTimeout } from './stateWatchdog'

const expectedLifecycleMappings: Record<string, Record<string, string>> = {
  RunTraceStatus: {
    running: 'active',
    success: 'completed',
    partially_applied: 'completed_partial',
    failed_after_write: 'failed',
    success_with_warnings: 'degraded',
    degraded: 'degraded',
    failed: 'failed',
    canceled: 'canceled',
    blocked: 'blocked',
  },
  AiTraceStatus: {
    running: 'active',
    success: 'completed',
    partially_applied: 'completed_partial',
    failed_after_write: 'failed',
    success_with_warnings: 'degraded',
    degraded: 'degraded',
    failed: 'failed',
    canceled: 'canceled',
    blocked: 'blocked',
  },
  RunOutcomeStatus: {
    success: 'completed',
    degraded: 'degraded',
    failed: 'failed',
    canceled: 'canceled',
    blocked: 'blocked',
  },
  ChainRunState: {
    idle: 'idle',
    routing: 'routing',
    awaiting_confirmation: 'awaiting_user',
    running: 'active',
    completed: 'completed',
    failed: 'failed',
    cancelled: 'canceled',
    budget_exhausted: 'blocked',
  },
  ChainBreakpointStatus: {
    completed: 'completed',
    failed: 'failed',
  },
  ChatGenerationStatus: {
    idle: 'idle',
    preparing: 'active',
    streaming: 'active',
    retrying: 'retrying',
    canceled: 'canceled',
    error: 'failed',
  },
  GenerationStatus: {
    success: 'completed',
    failed: 'failed',
    fallback: 'degraded',
  },
  ContinuationStatus: {
    none: 'idle',
    generating: 'active',
    continuing: 'active',
    completed: 'completed',
    possibly_truncated: 'degraded',
    interrupted: 'expired',
    failed: 'failed',
    user_stopped: 'canceled',
  },
  RealSkillExecutionStatus: {
    success: 'completed',
    failed: 'failed',
    degraded: 'degraded',
    blocked: 'blocked',
  },
  CompositeStatus: {
    DONE: 'completed',
    DONE_WITH_CONCERNS: 'degraded',
    NEEDS_CONTEXT: 'awaiting_user',
    BLOCKED: 'blocked',
  },
  TaskState: {
    planning: 'routing',
    acting: 'active',
    reviewing: 'awaiting_user',
    completed: 'completed',
    failed: 'failed',
    paused: 'paused',
  },
  TaskStepStatus: {
    pending: 'idle',
    running: 'active',
    done: 'completed',
    failed: 'failed',
    skipped: 'canceled',
  },
  NamingStatus: {
    idle: 'idle',
    loading: 'active',
    success: 'completed',
    partial: 'completed_partial',
    error: 'failed',
    canceled: 'canceled',
  },
  FinishReason: {
    stop: 'completed',
    length: 'degraded',
    tool_calls: 'awaiting_user',
    content_filter: 'blocked',
    network_error: 'failed',
    timeout: 'expired',
    canceled: 'canceled',
    unknown: 'failed',
  },
}

const expectedResourceMappings: Record<string, Record<string, string>> = {
  EditorBatchStatus: {
    pending: 'pending',
    applied: 'applied',
    rejected: 'rejected',
    expired: 'expired',
    version_changed: 'expired',
    locked: 'locked',
    rolled_back: 'rolled_back',
  },
  FactStatus: {
    confirmed: 'confirmed',
    pending: 'pending',
    stale: 'stale',
    conflicted: 'conflicted',
    rejected: 'rejected',
  },
}

describe('unified lifecycle mappings', () => {
  it.each(Object.entries(expectedLifecycleMappings))(
    'maps every %s value to its lifecycle status',
    (moduleName, mapping) => {
      expect(LIFECYCLE_MAPPINGS[moduleName]).toEqual(mapping)
      for (const [status, expected] of Object.entries(mapping)) {
        expect(mapToLifecycle(moduleName, status)).toBe(expected)
      }
    },
  )

  it.each(Object.entries(expectedResourceMappings))(
    'maps every %s value to its resource status',
    (moduleName, mapping) => {
      expect(RESOURCE_MAPPINGS[moduleName]).toEqual(mapping)
      for (const [status, expected] of Object.entries(mapping)) {
        expect(mapToResource(moduleName, status)).toBe(expected)
      }
    },
  )

  it('covers every lifecycle status in the transition matrix and watchdog timeouts', () => {
    const matrixStatuses = Object.keys(LIFECYCLE_TRANSITIONS)
    expect(matrixStatuses).toEqual([
      'idle',
      'routing',
      'awaiting_user',
      'active',
      'paused',
      'retrying',
      'completed',
      'completed_partial',
      'degraded',
      'failed',
      'blocked',
      'canceled',
      'expired',
    ])
    const timeoutStatuses = ['idle', 'routing', 'active', 'retrying', 'awaiting_user'] as const
    for (const status of timeoutStatuses) {
      expect(getStateTimeout(status)).toBeGreaterThan(0)
    }
  })

  it('keeps mapped transition legality aligned with the matrix', () => {
    expect(isLegalLifecycleTransition('running', 'blocked')).toBe(true)
    expect(isLegalLifecycleTransition('blocked', 'running')).toBe(true)
    expect(isLegalLifecycleTransition('loading', 'partial', 'NamingStatus')).toBe(true)
    expect(isLegalLifecycleTransition('success', 'running')).toBe(false)
    expect(isLegalLifecycleTransition('possibly_truncated', 'continuing', 'ContinuationStatus')).toBe(false)
  })

  it('keeps equivalent semantics mapped to the same unified status', () => {
    expect(mapToLifecycle('ChainRunState', 'cancelled')).toBe(mapToLifecycle('ContinuationStatus', 'user_stopped'))
    expect(mapToLifecycle('GenerationStatus', 'fallback')).toBe(mapToLifecycle('CompositeStatus', 'DONE_WITH_CONCERNS'))
    expect(mapToLifecycle('FinishReason', 'timeout')).toBe(mapToLifecycle('ContinuationStatus', 'interrupted'))
    expect(mapToLifecycle('ChainRunState', 'budget_exhausted')).toBe(mapToLifecycle('RealSkillExecutionStatus', 'blocked'))
    expect(LIFECYCLE_MAPPINGS.RunTraceStatus).toEqual(LIFECYCLE_MAPPINGS.AiTraceStatus)
  })

  it('makes unknown module statuses observable instead of silently passing', () => {
    expect(mapToLifecycle('UnknownModule', 'weird')).toBe('blocked')
    expect(mapToResource('UnknownModule', 'weird')).toBeNull()
    expect(mapToResource('EditorBatchStatus', 'unknown')).toBeNull()
  })

  it('documents the runTrace storage contract for completed_partial', () => {
    // NamingStatus.partial is kept as component-local vocabulary; the current
    // runTrace schema has no completed_partial terminal value, so observability
    // records it as degraded plus an explicit transition event.
    expect(mapToLifecycle('NamingStatus', 'partial')).toBe('completed_partial')
    expect(LIFECYCLE_TRANSITIONS.completed_partial).toEqual([])
  })
})
