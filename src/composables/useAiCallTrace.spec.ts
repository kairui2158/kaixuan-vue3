import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAiCallTrace } from './useAiCallTrace'
import { useRunTraceStore } from '../stores/runTrace'

describe('useAiCallTrace', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('starts and finishes a run', () => {
    const trace = useAiCallTrace({ source: 'home', stepName: '技能测试', mode: 'single' })
    expect(trace.isRunning()).toBe(false)

    trace.begin()
    expect(trace.isRunning()).toBe(true)
    expect(trace.runId).toBeTruthy()

    const runId = trace.runId as string
    trace.finish('success')
    expect(trace.isRunning()).toBe(false)
    expect(useRunTraceStore().getRun(runId)?.status).toBe('success')
  })

  it('supports pipeline step runs and closes active calls on finish', () => {
    const trace = useAiCallTrace({ source: 'pipeline', step: 2, stepName: '卷纲层', mode: 'auto' })
    trace.begin()
    const callId = trace.beginApiCall({
      skillName: '卷纲生成',
      requestMessages: [{ role: 'user', content: 'generate volumes' }]
    })

    const runId = trace.runId as string
    trace.finish('failed', 'generation failed')

    const run = useRunTraceStore().getRun(runId)
    expect(run?.step).toBe(2)
    expect(run?.apiCalls[0].status).toBe('failed')
    expect(run?.apiCalls[0].error).toBe('generation failed')
  })

  it('forwards long-document timeout hints to the trace run', () => {
    const trace = useAiCallTrace({
      source: 'outline',
      stepName: '大纲自动拆解',
      mode: 'auto-decompose',
      timeoutHint: { active: 3_600_000 }
    })
    trace.begin()

    const run = useRunTraceStore().getRun(trace.runId as string)
    expect(run?.timeoutHint).toEqual({ active: 3_600_000 })
    trace.finish('success')
  })

  it('records api call lifecycle and duration', () => {
    const trace = useAiCallTrace({ source: 'home', stepName: '去AI味', mode: 'body' })
    trace.begin()
    const callId = trace.beginApiCall({
      skillName: '去AI味 API 调用',
      model: 'test-model',
      requestMessages: [{ role: 'user', content: 'hello' }]
    })

    const runId = trace.runId as string
    trace.finishApiCall(callId, { status: 'success', responseText: 'result' })
    trace.finish('success')

    const run = useRunTraceStore().getRun(runId)
    expect(run?.apiCalls).toHaveLength(1)
    expect(run?.apiCalls[0].status).toBe('success')
    expect(run?.apiCalls[0].responseText).toBe('result')
    expect(run?.apiCalls[0].durationMs).toBeGreaterThanOrEqual(0)
  })

  it('finishes active calls and marks run failed when fail() is called', () => {
    const trace = useAiCallTrace({ source: 'home', stepName: '技能测试', mode: 'single' })
    trace.begin()
    const callId = trace.beginApiCall({
      requestMessages: [{ role: 'user', content: 'hello' }]
    })

    const runId = trace.runId as string
    trace.fail(new Error('provider unavailable'))

    const run = useRunTraceStore().getRun(runId)
    expect(run?.status).toBe('failed')
    expect(run?.error).toBe('provider unavailable')
    expect(run?.apiCalls[0].status).toBe('failed')
    expect(run?.apiCalls[0].error).toBe('provider unavailable')
    expect(trace.isRunning()).toBe(false)
  })

  it('does not create a run when api call starts before begin()', () => {
    const trace = useAiCallTrace({ source: 'home', stepName: '技能测试', mode: 'single' })
    expect(() => trace.beginApiCall({
      requestMessages: [{ role: 'user', content: 'hello' }]
    })).toThrow('AI trace run has not started')
  })

  it('ignores repeated finish calls', () => {
    const trace = useAiCallTrace({ source: 'home', stepName: '技能测试', mode: 'single' })
    trace.begin()
    const runId = trace.runId as string
    trace.finish('success')
    trace.finish('failed', 'duplicate')

    const run = useRunTraceStore().getRun(runId)
    expect(run?.status).toBe('success')
  })

  it('keeps a terminal status and records a conflict when another finisher closes the run first', () => {
    const store = useRunTraceStore()
    const trace = useAiCallTrace({ source: 'home', stepName: '技能测试', mode: 'single' })
    trace.begin()
    const runId = trace.runId as string

    store.finishRun(runId, 'canceled', '用户取消')
    trace.finish('success')

    const run = store.getRun(runId)
    expect(run?.status).toBe('canceled')
    expect(run?.events.some(event => event.type === 'status-conflict-ignored')).toBe(true)
  })

  it('accepts a custom startedAt for duration calculation', () => {
    const trace = useAiCallTrace({ source: 'home', stepName: '技能测试', mode: 'single' })
    trace.begin()
    const callId = trace.beginApiCall({
      requestMessages: [{ role: 'user', content: 'hello' }]
    })
    const startedAt = Date.now() - 100

    const runId = trace.runId as string
    trace.finishApiCall(callId, { status: 'success' }, startedAt)
    trace.finish('success')

    const run = useRunTraceStore().getRun(runId)
    expect(run?.apiCalls[0].durationMs).toBeGreaterThanOrEqual(100)
  })

  it('records explicit phase timing and preserves it on finish', () => {
    const trace = useAiCallTrace({ source: 'pipeline', step: 2, stepName: '卷纲层', mode: 'single' })
    trace.begin()
    const runId = trace.runId as string

    trace.recordPhaseTiming('validation', 30)
    trace.recordPhaseTiming('validation', 20)
    trace.recordPhaseTiming('persistence', 40)
    trace.finish('success')

    expect(useRunTraceStore().getRun(runId)?.stepTimingLedger).toMatchObject({
      validationSumMs: 50,
      persistenceSumMs: 40
    })
  })

  it('measures sync and async phase timing and keeps timing on failure', async () => {
    const trace = useAiCallTrace({ source: 'pipeline', step: 3, stepName: '章节层', mode: 'single' })
    trace.begin()
    const runId = trace.runId as string

    const syncResult = trace.measurePhase('promptBuild', () => 'prompt')
    expect(syncResult).toBe('prompt')

    await expect(trace.measurePhase('contextLoad', async () => {
      throw new Error('context load failed')
    })).rejects.toThrow('context load failed')

    trace.fail(new Error('step failed'))
    const ledger = useRunTraceStore().getRun(runId)?.stepTimingLedger
    expect(ledger?.promptBuildMs).toBeGreaterThanOrEqual(0)
    expect(ledger?.contextLoadMs).toBeGreaterThanOrEqual(0)
  })
})
