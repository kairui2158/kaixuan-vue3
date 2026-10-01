export type ToolRunSupervisorReason =
  | 'stuck_timeout'
  | 'hard_deadline'
  | 'repeated_tool_error'

export interface ToolRunSupervisorOptions {
  signal?: AbortSignal
  idleTimeoutMs?: number
  hardDeadlineMs?: number | null
  controller?: AbortController
  onStuck?: (event: {
    reason: ToolRunSupervisorReason
    idleMs: number
    totalMs: number
    message: string
  }) => void
}

export class ToolRunSupervisorError extends Error {
  reason: ToolRunSupervisorReason
  constructor(reason: ToolRunSupervisorReason, message: string) {
    super(message)
    this.name = 'ToolRunSupervisorError'
    this.reason = reason
  }
}

export type ToolRunSupervisor = ReturnType<typeof createToolRunSupervisor>

export const DIRECT_TOOL_RUN_IDLE_TIMEOUT_MS = 150_000
export const DIRECT_TOOL_RUN_HARD_DEADLINE_MS = 300_000

const readTestOverrides = (): { idleTimeoutMs?: number; hardDeadlineMs?: number | null } => {
  if (typeof window === 'undefined') return {}
  const overrides = (window as any).__SHENYI_TOOL_RUN_TEST_OVERRIDES__
  if (!overrides || typeof overrides !== 'object') return {}
  return {
    idleTimeoutMs: Number(overrides.idleTimeoutMs) > 0 ? Number(overrides.idleTimeoutMs) : undefined,
    hardDeadlineMs: overrides.hardDeadlineMs === null
      ? null
      : Number(overrides.hardDeadlineMs) > 0
        ? Number(overrides.hardDeadlineMs)
        : undefined,
  }
}

/**
 * Request-level lifecycle guard for direct dialogue tool runs.
 *
 * The supervisor never owns terminal trace state. It only aborts the caller's
 * controller and reports a classified reason; the existing component catch and
 * finishRun paths remain the single owners of run/turn/api-call completion.
 */
export function createToolRunSupervisor(options: ToolRunSupervisorOptions = {}) {
  const testOverrides = readTestOverrides()
  const idleTimeoutMs = options.idleTimeoutMs ?? testOverrides.idleTimeoutMs ?? DIRECT_TOOL_RUN_IDLE_TIMEOUT_MS
  const hardDeadlineMs = options.hardDeadlineMs !== undefined
    ? options.hardDeadlineMs
    : testOverrides.hardDeadlineMs ?? DIRECT_TOOL_RUN_HARD_DEADLINE_MS
  const startedAt = Date.now()
  let lastProgressAt = startedAt
  let lastErrorKey: string | null = null
  let repeatedErrorCount = 0
  let lastErrorScope: string | number | null = null
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  let hardTimer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  const dispatch = (reason: ToolRunSupervisorReason, fallbackMessage: string) => {
    if (disposed) return
    disposed = true
    clearTimers()
    const totalMs = Date.now() - startedAt
    const idleMs = Date.now() - lastProgressAt
    const message = reason === 'stuck_timeout'
      ? 'AI 请求超过 150 秒无进展，已自动中止。请缩小问题范围、分段处理，或稍后重试。'
      : reason === 'hard_deadline'
        ? '本轮工具任务超过 300 秒总上限，已自动中止。请把长文档任务拆分为多轮处理。'
        : fallbackMessage
    options.onStuck?.({ reason, idleMs, totalMs, message })
    options.controller?.abort()
  }

  const scheduleIdle = () => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => dispatch('stuck_timeout', 'AI 请求停滞，已自动中止'), Math.max(0, lastProgressAt + idleTimeoutMs - Date.now()))
  }

  const clearTimers = () => {
    if (idleTimer) clearTimeout(idleTimer)
    if (hardTimer) clearTimeout(hardTimer)
    idleTimer = null
    hardTimer = null
  }

  hardTimer = typeof hardDeadlineMs === 'number'
    ? setTimeout(() => dispatch('hard_deadline', '工具任务达到总上限，已自动中止'), hardDeadlineMs)
    : null
  scheduleIdle()

  return {
    reportProgress() {
      if (disposed) return
      lastProgressAt = Date.now()
      scheduleIdle()
    },
    /**
     * Report a failed tool. `scope` identifies the model iteration (or another
     * caller-defined batch): parallel failures inside one iteration count once,
     * because a model can legitimately recover from them on the next request.
     */
    reportToolError(key: string, threshold = 3, scope?: string | number) {
      if (disposed) return
      const sameScope = scope !== undefined && scope === lastErrorScope
      if (sameScope && key === lastErrorKey) return
      if (key === lastErrorKey) repeatedErrorCount += 1
      else {
        lastErrorKey = key
        repeatedErrorCount = 1
      }
      if (scope !== undefined) lastErrorScope = scope
      else lastErrorScope = null
      if (repeatedErrorCount >= threshold) {
        dispatch('repeated_tool_error', `同一工具连续失败 ${repeatedErrorCount} 次，已自动中止`)
      }
    },
    dispose() {
      disposed = true
      clearTimers()
    },
  }
}
