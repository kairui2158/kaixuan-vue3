export type LifecycleStatus =
  | 'idle'
  | 'routing'
  | 'awaiting_user'
  | 'active'
  | 'paused'
  | 'retrying'
  | 'completed'
  | 'completed_partial'
  | 'degraded'
  | 'failed'
  | 'blocked'
  | 'canceled'
  | 'expired'

export type ResourceStatus =
  | 'pending'
  | 'applied'
  | 'rejected'
  | 'expired'
  | 'locked'
  | 'rolled_back'
  | 'confirmed'
  | 'stale'
  | 'conflicted'

export const LIFECYCLE_TRANSITIONS: Record<LifecycleStatus, LifecycleStatus[]> = {
  idle: ['routing', 'awaiting_user', 'active'],
  routing: ['active', 'awaiting_user', 'failed', 'blocked', 'canceled'],
  awaiting_user: ['active', 'canceled', 'expired'],
  active: ['completed', 'completed_partial', 'degraded', 'failed', 'blocked', 'canceled', 'paused', 'retrying', 'expired'],
  paused: ['active', 'canceled'],
  retrying: ['active', 'failed', 'blocked', 'canceled', 'expired'],
  completed: [],
  completed_partial: [],
  degraded: [],
  failed: ['active'],
  blocked: ['active'],
  canceled: [],
  expired: [],
}

export const LIFECYCLE_MAPPINGS: Record<string, Record<string, LifecycleStatus>> = {
  // #1 and #2 share the same run-trace lifecycle vocabulary.
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

export const RESOURCE_MAPPINGS: Record<string, Record<string, ResourceStatus>> = {
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

export interface LifecycleTransitionEventInput {
  type: 'state-transition' | 'state-transition-violation'
  level: 'info' | 'warn'
  label: string
  detail: string
}

export function mapToLifecycle(moduleName: string, status: string): LifecycleStatus {
  const mapping = LIFECYCLE_MAPPINGS[moduleName]
  const mapped = mapping?.[status]
  if (!mapped) return 'blocked'
  return mapped
}

export function isKnownLifecycleStatus(moduleName: string, status: string): boolean {
  return Boolean(LIFECYCLE_MAPPINGS[moduleName]?.[status])
}

export function isLegalKnownLifecycleTransition(
  fromStatus: string,
  toStatus: string,
  moduleName = 'RunTraceStatus',
): boolean {
  if (!isKnownLifecycleStatus(moduleName, fromStatus) || !isKnownLifecycleStatus(moduleName, toStatus)) return false
  return isLegalLifecycleTransition(fromStatus, toStatus, moduleName)
}

export function mapToResource(moduleName: string, status: string): ResourceStatus | null {
  const mapped = RESOURCE_MAPPINGS[moduleName]?.[status]
  return mapped ?? null
}

export function isLegalLifecycleTransition(
  fromStatus: string,
  toStatus: string,
  moduleName = 'RunTraceStatus',
): boolean {
  const from = mapToLifecycle(moduleName, fromStatus)
  const to = mapToLifecycle(moduleName, toStatus)
  return LIFECYCLE_TRANSITIONS[from]?.includes(to) ?? false
}

export function createLifecycleTransitionEvent(
  moduleName: string,
  fromStatus: string,
  toStatus: string,
  reason?: string,
): LifecycleTransitionEventInput {
  const legal = isLegalLifecycleTransition(fromStatus, toStatus, moduleName)
  return {
    type: legal ? 'state-transition' : 'state-transition-violation',
    level: legal ? 'info' : 'warn',
    label: legal
      ? `${moduleName}：${fromStatus} → ${toStatus}`
      : `${moduleName}：检测到可疑转换 ${fromStatus} → ${toStatus}`,
    detail: reason || `from=${fromStatus} to=${toStatus} legal=${legal}`,
  }
}
