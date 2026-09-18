import type { LifecycleStatus } from './stateTransitionGuard'

export const DEFAULT_STATE_TIMEOUTS: Partial<Record<LifecycleStatus, number>> = {
  routing: 30_000,
  active: 600_000,
  retrying: 60_000,
  awaiting_user: 600_000,
}

export interface StateTimeoutHint {
  timeoutHint?: Partial<Record<'active' | 'routing' | 'retrying' | 'awaiting_user', number>>
}

export interface StateWatchdog {
  clear(): void
}

export function getStateTimeout(
  status: LifecycleStatus,
  hint?: StateTimeoutHint | null,
): number {
  const hinted = hint?.timeoutHint?.[status as keyof NonNullable<StateTimeoutHint['timeoutHint']>]
  if (typeof hinted === 'number' && Number.isFinite(hinted) && hinted > 0) return hinted
  return DEFAULT_STATE_TIMEOUTS[status] ?? 300_000
}

export function startStateWatchdog(
  onStuck: (status: LifecycleStatus, timeoutMs: number) => void,
  status: LifecycleStatus,
  hint?: StateTimeoutHint | null,
): StateWatchdog | null {
  const timeoutMs = getStateTimeout(status, hint)
  if (!onStuck || timeoutMs <= 0) return null
  const timer = setTimeout(() => onStuck(status, timeoutMs), timeoutMs)
  return {
    clear() {
      clearTimeout(timer)
    },
  }
}
