import { useRunTraceStore } from '../stores/runTrace'
import type {
  RunTrace,
  RunTraceStatus,
  RunTraceSource,
  RunTraceEvent
} from '../stores/runTrace'

export type AiTraceSource = RunTraceSource
export type AiTraceStatus = RunTraceStatus

export interface UseAiCallTraceOptions {
  source: AiTraceSource
  step?: number
  stepName: string
  mode: string
  projectId?: string
  projectName?: string
  providerId?: string
  providerName?: string
  model?: string
  skillNames?: string[]
  skillMode?: string
  timeoutHint?: RunTrace['timeoutHint']
  /** Application-level run id in the pipeline registry domain. */
  pipelineRunId?: string
  target?: RunTrace['target']
  context?: RunTrace['context']
}

export interface AiApiCallOptions {
  skillId?: string
  skillName?: string
  agentId?: string
  agentName?: string
  providerId?: string
  providerName?: string
  model?: string
  temperature?: number
  /** Null means the output limit was intentionally omitted from the request. */
  maxTokens?: number | null
  requestMessages: RunTraceMessageLike[]
}

export interface AiApiCallFinish {
  status: AiTraceStatus
  responseText?: string
  reasoningText?: string
  finishReason?: string
  convergenceReason?: string
  usage?: unknown
  error?: string
}

export interface RunTraceMessageLike {
  role: string
  content: string
}

export interface AiCallContext {
  runId: string | null
  begin(): void
  beginApiCall(options: AiApiCallOptions): string
  finishApiCall(callId: string, patch: AiApiCallFinish, startedAt?: number): void
  recordPhaseTiming(phase: AiTracePhase, durationMs: number): void
  recordStepObservation(phase: AiTracePhase, durationMs?: number): void
  measurePhase<T>(phase: AiTracePhase, fn: () => Promise<T> | T): Promise<T> | T
  addEvent(event: Omit<RunTraceEvent, 'id' | 'ts'>): void
  finish(status: AiTraceStatus, error?: string, reason?: string): void
  fail(error: unknown): void
  isRunning(): boolean
}

export type AiTracePhase =
  | 'promptBuild'
  | 'contextLoad'
  | 'postProcess'
  | 'validation'
  | 'persistence'

/**
 * Shared runTrace lifecycle wrapper. The wrapper deliberately owns only
 * lifecycle bookkeeping; retries, prompt construction, routing, and streaming
 * remain at each business entry point.
 */
export function useAiCallTrace(options: UseAiCallTraceOptions): AiCallContext {
  const store = useRunTraceStore()
  let runId: string | null = null
  const activeCalls = new Map<string, number>()

  function requireRunId(): string {
    if (!runId) {
      throw new Error(`AI trace run has not started: ${options.stepName}`)
    }
    return runId
  }

  function begin() {
    if (runId) return
    runId = store.startRun({
      source: options.source,
      step: options.step,
      stepName: options.stepName,
      mode: options.mode,
      projectId: options.projectId,
      projectName: options.projectName,
      providerId: options.providerId,
      providerName: options.providerName,
      model: options.model,
      skillNames: options.skillNames,
      skillMode: options.skillMode,
      pipelineRunId: options.pipelineRunId,
      timeoutHint: options.timeoutHint,
      target: options.target,
      context: options.context
    })
  }

  function beginApiCall(input: AiApiCallOptions): string {
    const id = requireRunId()
    const callId = store.startApiCall(id, input)
    activeCalls.set(callId, Date.now())
    return callId
  }

  function finishApiCall(callId: string, patch: AiApiCallFinish, startedAt?: number) {
    if (!runId || !callId) return
    const start = startedAt ?? activeCalls.get(callId) ?? Date.now()
    store.finishApiCall(runId, callId, { ...patch, durationMs: Math.max(0, Date.now() - start) })
    activeCalls.delete(callId)
  }

  function addEvent(event: Omit<RunTraceEvent, 'id' | 'ts'>) {
    if (!runId) return
    store.addEvent(runId, event)
  }

  function recordPhaseTiming(phase: AiTracePhase, durationMs: number) {
    if (!runId) return
    store.recordStepPhaseTiming(runId, phase, durationMs)
  }

  function recordStepObservation(phase: AiTracePhase, durationMs?: number) {
    if (!runId) return
    store.recordStepObservation(runId, phase, durationMs)
  }

  function measurePhase<T>(phase: AiTracePhase, fn: () => Promise<T> | T): Promise<T> | T {
    const startedAt = Date.now()
    const record = () => recordStepObservation(phase, Math.max(0, Date.now() - startedAt))
    try {
      const result = fn()
      if (result instanceof Promise) {
        return result.then(
          value => {
            record()
            return value
          },
          error => {
            record()
            throw error
          }
        )
      }
      record()
      return result
    } catch (error) {
      record()
      throw error
    }
  }

  function finish(status: AiTraceStatus, error?: string, reason?: string) {
    if (!runId) return
    const run = store.getRun(runId)
    if (run && run.status !== 'running') {
      store.addEvent(runId, {
        type: 'status-conflict-ignored',
        level: 'warn',
        label: '忽略运行状态改写',
        detail: `运行已处于 ${run.status}，包装器尝试改写为 ${status}`
      })
      runId = null
      activeCalls.clear()
      return
    }
    for (const callId of activeCalls.keys()) {
      finishApiCall(callId, { status: 'failed', error: error || 'API 调用随运行中断而结束' })
    }
    store.finishRun(runId, status, error, reason)
    runId = null
    activeCalls.clear()
  }

  function fail(error: unknown, reason?: string) {
    finish('failed', error instanceof Error ? error.message : String(error), reason)
  }

  function isRunning() {
    return Boolean(runId)
  }

  return {
    get runId() { return runId },
    begin,
    beginApiCall,
    finishApiCall,
    recordPhaseTiming,
    recordStepObservation,
    measurePhase,
    addEvent,
    finish,
    fail,
    isRunning
  }
}
