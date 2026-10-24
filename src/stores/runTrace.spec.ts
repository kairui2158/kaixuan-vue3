import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { folderDiagnosticsStatus, useRunTraceStore } from './runTrace'
import { PerformanceMonitor } from '../services/performanceMonitor'
import { installResponsivenessProjection, setPerformanceMonitorForTests } from '../services/responsivenessStore'
import type { RunTrace } from './runTrace'

describe('runTrace store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('records the renderer build fingerprint on every run', () => {
    const store = useRunTraceStore()
    vi.stubGlobal('__SHENYI_BUILD_MANIFEST__', JSON.stringify({
      schemaVersion: 1,
      commit: 'fingerprint-test',
      buildTime: '2026-10-17T03:11:00.000Z'
    }))
    const runId = store.startRun({ stepName: '卷纲层', mode: 'single', skillNames: [] })
    const run = store.getRun(runId)
    expect(run?.runtimeFingerprint).toEqual({
      source: 'vite-manifest',
      manifestVersion: expect.any(String),
      commit: expect.any(String),
      buildTime: expect.any(String),
    })
    const exported = store.exportRunToJson(run!) as Record<string, unknown>
    expect(exported.runtimeFingerprint).toEqual(run?.runtimeFingerprint)
    vi.unstubAllGlobals()
  })

  it('keeps only the latest 20 runs', () => {
    const store = useRunTraceStore()
    for (let i = 1; i <= 21; i++) {
      const runId = store.startRun({
        step: 2,
        stepName: '卷纲层',
        mode: 'single',
        projectId: 'p1',
        projectName: '测试项目',
        skillNames: ['S' + i],
        skillMode: 'chain'
      })
      store.finishRun(runId, 'success')
    }
    expect(store.runs).toHaveLength(20)
    expect(store.runs[0].skillNames[0]).toBe('S21')
    expect(store.runs[19].skillNames[0]).toBe('S2')
  })

  it('exports completed chat sessions as closed snapshots without sealing the live run', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'home',
      stepName: '主页对话',
      mode: 'chat',
      sessionKind: 'chat',
      skillNames: ['主页技能']
    })
    const turnId = store.startTurn(runId, { userRequest: '第一轮', mode: 'chat' })
    const callId = store.startApiCall(runId, {
      source: 'home',
      requestMessages: [{ role: 'user', content: '第一轮' }]
    })
    store.appendStream(runId, callId, '回复')
    store.finishApiCall(runId, callId, { status: 'success', responseText: '回复' })
    store.finishTurn(runId, turnId, 'success')

    const liveRun = store.getRun(runId)
    const exported = store.exportRunToJson(liveRun!) as unknown as RunTrace

    expect(liveRun?.status).toBe('running')
    expect(exported.status).toBe('running')
    expect(exported.sessionSnapshot).toBe(true)
    expect(exported.endedAt).toBeUndefined()
    expect(exported.durationMs).toBeUndefined()
    expect(exported.turns?.at(-1)?.status).toBe('success')
    expect(exported.stateHistory?.some(item => item.reason === 'export_snapshot_synthesized_from_last_turn')).toBe(false)
    expect(store.exportRunToText(liveRun!)).toContain('会话快照：导出时会话仍在应用内继续')

    const secondTurnId = store.startTurn(runId, { userRequest: '第二轮', mode: 'chat' })
    expect(store.getRun(runId)?.turns).toHaveLength(2)
    store.finishTurn(runId, secondTurnId, 'success')

    vi.useFakeTimers()
    const thirdTurnId = store.startTurn(runId, { userRequest: '第三轮', mode: 'chat' })
    store.finishTurn(runId, thirdTurnId, 'success')
    vi.advanceTimersByTime(600_001)
    const liveThirdRun = store.getRun(runId)!
    expect(liveThirdRun.events.some(event =>
      event.turnId === thirdTurnId && event.type === 'state-stuck-detected'
    )).toBe(false)
    vi.useRealTimers()
  })

  it('keeps the last failed or canceled chat turn visible in export snapshots', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'home',
      stepName: '主页对话',
      mode: 'chat',
      sessionKind: 'chat',
      skillNames: []
    })
    const turnId = store.startTurn(runId, { userRequest: '取消这一轮', mode: 'chat' })
    store.finishTurn(runId, turnId, 'canceled', '用户取消生成')

    const liveRun = store.getRun(runId)
    const exported = store.exportRunToJson(liveRun!) as unknown as RunTrace

    expect(liveRun?.status).toBe('running')
    expect(exported.status).toBe('running')
    expect(exported.sessionSnapshot).toBe(true)
    expect(exported.turns?.at(-1)?.status).toBe('canceled')
    expect(exported.stateHistory?.some(item => item.reason === 'export_snapshot_synthesized_from_last_turn')).toBe(false)
  })

  it('keeps same-source runs running when a new task starts', () => {
    const store = useRunTraceStore()
    const first = store.startRun({ step: 2, stepName: '卷纲层', mode: 'single', skillNames: [] })
    const second = store.startRun({ step: 3, stepName: '章节层', mode: 'batch', skillNames: [] })

    expect(store.getRun(first)?.status).toBe('running')
    expect(store.getRun(second)?.status).toBe('running')
  })

  it('keeps the supervisor terminal reason on the finished turn', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'outline',
      stepName: '大纲共创',
      mode: 'chat',
      sessionKind: 'chat',
      skillNames: []
    })
    const turnId = store.startTurn(runId, { userRequest: '统一时间线', mode: 'chat' })
    store.finishTurn(runId, turnId, 'failed', '模型连续工具轮未输出正文', 'stuck_timeout')

    const turn = store.getRun(runId)?.turns?.find(item => item.id === turnId)
    expect(turn?.status).toBe('failed')
    expect(turn?.error).toBe('模型连续工具轮未输出正文')
    expect(turn?.reason).toBe('stuck_timeout')
  })

  it('keeps concurrent runs isolated by source', () => {
    const store = useRunTraceStore()
    const pipeline = store.startRun({
      source: 'pipeline',
      step: 2,
      stepName: '卷纲层',
      mode: 'single',
      skillNames: []
    })
    const outline = store.startRun({
      source: 'outline',
      stepName: '大纲共创',
      mode: 'chat',
      skillNames: ['大纲技能'],
      target: { type: 'outline', id: 'outline', name: '大纲编辑器', locked: true },
      context: { turns: 4, referencedDocuments: ['outline', 'settings'], contextStrategy: 'generate' }
    })
    const home = store.startRun({
      source: 'home',
      stepName: '主页对话',
      mode: 'chat',
      skillNames: ['主页技能']
    })

    const pipelineCall = store.startApiCall(pipeline, { step: 2, requestMessages: [{ role: 'user', content: 'pipeline' }] })
    const outlineCall = store.startApiCall(outline, { source: 'outline', requestMessages: [{ role: 'user', content: 'outline' }] })

    expect(store.getRunId('pipeline')).toBe(pipeline)
    expect(store.getRunId('outline')).toBe(outline)
    expect(store.getRunId('home')).toBe(home)
    expect(store.getApiCallId('pipeline')).toBe(pipelineCall)
    expect(store.getApiCallId('outline')).toBe(outlineCall)
    expect(store.getApiCallId('home')).toBeNull()
    expect(store.getRun(pipeline)?.status).toBe('running')
    expect(store.getRun(outline)?.status).toBe('running')
    expect(store.getRun(home)?.status).toBe('running')
  })

  it('keeps concurrent same-source runs isolated without auto-abandoning the first', () => {
    const store = useRunTraceStore()
    const firstPipeline = store.startRun({ source: 'pipeline', step: 1, stepName: '设定层', mode: 'single', skillNames: [] })
    const outline = store.startRun({ source: 'outline', stepName: '大纲共创', mode: 'chat', skillNames: [] })
    const secondPipeline = store.startRun({ source: 'pipeline', step: 2, stepName: '卷纲层', mode: 'single', skillNames: [] })

    expect(store.getRun(firstPipeline)?.status).toBe('running')
    expect(store.getRun(outline)?.status).toBe('running')
    expect(store.getRun(secondPipeline)?.status).toBe('running')
  })

  it('keeps a provider quota soft failure scoped to the failing run', () => {
    const store = useRunTraceStore()
    const failing = store.startRun({ source: 'pipeline', step: 2, stepName: '卷纲层', mode: 'single', skillNames: [] })
    const unaffected = store.startRun({ source: 'pipeline', step: 3, stepName: '章节层', mode: 'batch', skillNames: [] })
    const failingCall = store.startApiCall(failing, {
      step: 2,
      requestMessages: [{ role: 'user', content: '生成卷纲' }],
    })
    const unaffectedCall = store.startApiCall(unaffected, {
      step: 3,
      requestMessages: [{ role: 'user', content: '生成章节' }],
    })

    store.finishApiCall(failing, failingCall, {
      status: 'failed',
      error: 'quota_exhausted：供应商返回软错误，未产生正文',
      finishReason: 'provider_quota_exhausted',
    })
    store.finishRun(failing, 'failed')

    expect(store.getRun(failing)?.status).toBe('failed')
    expect(store.getRun(failing)?.events.some(event =>
      event.type === 'api-failed' && event.detail?.includes('quota_exhausted')
    )).toBe(true)
    expect(store.getRun(unaffected)?.status).toBe('running')
    expect(store.getRun(unaffected)?.events.some(event => event.type === 'api-failed')).toBe(false)
    expect(store.getApiCallId('pipeline')).toBe(unaffectedCall)
  })

  it('marks unmounted source runs failed without breaking other sources', () => {
    const store = useRunTraceStore()
    const outline = store.startRun({ source: 'outline', stepName: '大纲共创', mode: 'chat', skillNames: [] })
    const home = store.startRun({ source: 'home', stepName: '主页对话', mode: 'chat', skillNames: [] })

    store.abandonRunningRun('outline')

    expect(store.getRun(outline)?.status).toBe('failed')
    expect(store.getRun(home)?.status).toBe('running')
  })

  it('cancels running trace runs and waits for their save queues during shutdown', async () => {
    const runTraceSave = vi.fn(async (_payload: unknown) => ({ success: true, dirName: 'app-shutdown-run' }))
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { electronAPI: { runTraceSave } }
    })
    const store = useRunTraceStore()
    const pipelineRunId = store.startRun({ source: 'pipeline', step: 2, stepName: '卷纲层', mode: 'single', skillNames: [] })
    const outlineRunId = store.startRun({ source: 'outline', stepName: '大纲共创', mode: 'chat', skillNames: [] })
    const pipelineCallId = store.startApiCall(pipelineRunId, {
      requestMessages: [{ role: 'user', content: '生成卷纲' }],
    })

    const result = await store.shutdownAndFlush({ reason: '应用关闭，任务已取消' })

    expect(result.canceledRunIds).toEqual([outlineRunId, pipelineRunId])
    expect(result.errors).toEqual([])
    expect(store.getRun(pipelineRunId)?.status).toBe('canceled')
    expect(store.getRun(outlineRunId)?.status).toBe('canceled')
    expect(store.getRun(pipelineRunId)?.apiCalls[0]?.id).toBe(pipelineCallId)
    expect(store.getRun(pipelineRunId)?.apiCalls[0]?.status).toBe('canceled')
    expect(store.getRun(pipelineRunId)?.stateHistory?.at(-1)?.reason).toContain('应用关闭，任务已取消')
    expect(runTraceSave).toHaveBeenCalled()
  })

  it('records complete api calls and stream text without truncation', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 2, stepName: '卷纲层', mode: 'single', skillNames: ['卷纲技能'] })
    const callId = store.startApiCall(runId, {
      step: 2,
      requestMessages: [
        { role: 'system', content: 'S'.repeat(1200) },
        { role: 'user', content: 'U'.repeat(1200) }
      ],
      providerId: 'provider-1',
      model: 'test-model',
      skillId: 'skill-1',
      skillName: '卷纲技能',
      temperature: 0.7,
      maxTokens: 8192,
      deaiPromptVariant: 'creative'
    })
    store.appendStream(runId, callId, 'A'.repeat(600))
    store.appendStream(runId, callId, 'B'.repeat(600))
    store.finishApiCall(runId, callId, {
      status: 'success',
      responseText: 'R'.repeat(1500),
      finishReason: 'stop',
      convergenceReason: 'model answered the question and tool loop converged',
      executionSettlement: {
        phase: 'writing',
        readToolCalls: 20,
        maxReadToolCalls: 90,
        writeToolCalls: 4,
        reservedWriteToolCalls: 9,
        controlToolCalls: 2,
        physicalRequests: 12,
        maxPhysicalRequests: 27,
        exhaustedClasses: [],
        successfulWriteCount: 4,
        trustedCoverageCount: 3,
        planComplete: false,
      },
      readLedger: {
        workspace: 'outline',
        targetId: 'outline',
        uniqueReadCount: 18,
        duplicateReadCount: 2,
        rereadAfterCompactionCount: 1,
        compactedReadCount: 1,
        structureIdentity: 'structure:standard:node-1',
      },
      usage: { total_tokens: 123 },
      durationMs: 456
    })
    store.finishRun(runId, 'success')

    const run = store.getRun(runId)
    const call = run?.apiCalls[0]
    expect(call?.requestMessages[0].content).toHaveLength(1200)
    expect(call?.requestMessages[1].content).toHaveLength(1200)
    expect(call?.streamText).toHaveLength(1200)
    expect(call?.responseText).toHaveLength(1500)
    expect(call?.convergenceReason).toBe('model answered the question and tool loop converged')
    expect(call?.executionSettlement?.successfulWriteCount).toBe(4)
    expect(call?.executionSettlement?.trustedCoverageCount).toBe(3)
    expect(call?.readLedger?.duplicateReadCount).toBe(2)
    expect(call?.deaiPromptVariant).toBe('creative')
    expect(call?.seq).toBe(1)
    expect(run?.events.map(e => e.type)).toContain('api-start')
    expect(run?.events.map(e => e.type)).toContain('api-success')
  })

  it('keeps physical response text when a later update has an empty payload', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 2, stepName: '卷纲层', mode: 'single', skillNames: ['卷纲技能'] })
    const callId = store.startApiCall(runId, {
      requestMessages: [{ role: 'user', content: '生成卷纲' }]
    })
    store.appendPhysicalCall(runId, callId, {
      physicalCallId: 'physical-1',
      requestMessages: [{ role: 'user', content: '生成卷纲' }],
      responseText: '第一次物理响应'
    })
    store.appendPhysicalCall(runId, callId, {
      physicalCallId: 'physical-1',
      requestMessages: [{ role: 'user', content: '生成卷纲' }],
      responseText: ''
    })

    const physical = store.getRun(runId)?.apiCalls[0]?.physicalCalls?.[0]
    expect(physical?.responseText).toBe('第一次物理响应')
  })

  it('persists reasoning-only stall diagnostics on physical calls', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 2, stepName: '卷纲层', mode: 'single', skillNames: ['卷纲技能'] })
    const callId = store.startApiCall(runId, {
      requestMessages: [{ role: 'user', content: '生成卷纲' }]
    })
    store.appendPhysicalCall(runId, callId, {
      physicalCallId: 'reasoning-only-1',
      requestMessages: [{ role: 'user', content: '生成卷纲' }],
      reasoningText: '仍在推理',
      status: 'failed',
      interruptionCode: 'reasoning_only_stalled',
      firstContentAt: undefined,
      lastContentAt: undefined,
      lastReasoningAt: 720_000,
      bodyAbsentMs: 720_000
    })
    store.appendPhysicalCall(runId, callId, {
      physicalCallId: 'reasoning-only-1',
      requestMessages: [{ role: 'user', content: '生成卷纲' }],
      responseText: ''
    })

    const physical = store.getRun(runId)?.apiCalls[0]?.physicalCalls?.[0]
    expect(physical?.interruptionCode).toBe('reasoning_only_stalled')
    expect(physical?.lastReasoningAt).toBe(720_000)
    expect(physical?.bodyAbsentMs).toBe(720_000)
    expect(physical?.firstContentAt).toBeUndefined()
    expect(physical?.lastContentAt).toBeUndefined()
  })

  it('stores physical timing segments and computes api call timing ledger', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 2, stepName: '卷纲层', mode: 'single', skillNames: ['卷纲技能'] })
    const callId = store.startApiCall(runId, {
      requestMessages: [{ role: 'user', content: '生成卷纲' }]
    })

    store.appendPhysicalCall(runId, callId, {
      physicalCallId: 'timing-normal',
      requestMessages: [{ role: 'user', content: '生成卷纲' }],
      responseText: '第一次物理响应',
      durationMs: 1200,
      firstTokenMs: 300,
      outputMs: 900
    })
    store.appendPhysicalCall(runId, callId, {
      physicalCallId: 'timing-retry',
      phase: 'retry',
      requestMessages: [{ role: 'user', content: '生成卷纲' }],
      responseText: '第二次物理响应',
      durationMs: 700,
      firstTokenMs: 200,
      outputMs: 500
    })
    store.finishApiCall(runId, callId, {
      status: 'success',
      responseText: '第二次物理响应',
      durationMs: 2500,
      timingLedger: {
        requestBuildMs: 80,
        schemaValidateMs: 45,
        retryMs: 60,
        postProcessMs: 15
      }
    })

    const call = store.getRun(runId)?.apiCalls[0]
    expect(call?.physicalCalls?.[0]?.firstTokenMs).toBe(300)
    expect(call?.physicalCalls?.[0]?.outputMs).toBe(900)
    expect(call?.timingLedger).toMatchObject({
      physicalCallCount: 2,
      retryPhysicalCallCount: 1,
      physicalDurationSumMs: 1900,
      firstTokenSumMs: 500,
      outputSumMs: 1400,
      minFirstTokenMs: 200,
      maxFirstTokenMs: 300,
      localOverheadMs: 600,
      requestBuildMs: 80,
      schemaValidateMs: 45,
      retryMs: 60,
      postProcessMs: 15
    })
  })

  it('computes run timing ledger when finishing a run', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 2, stepName: '卷纲层', mode: 'single', skillNames: ['卷纲技能'] })
    const callId = store.startApiCall(runId, {
      requestMessages: [{ role: 'user', content: '生成卷纲' }]
    })
    store.appendPhysicalCall(runId, callId, {
      requestMessages: [{ role: 'user', content: '生成卷纲' }],
      responseText: '物理响应',
      durationMs: 1000,
      firstTokenMs: 250,
      outputMs: 750
    })
    store.finishApiCall(runId, callId, {
      status: 'success',
      responseText: '物理响应',
      durationMs: 1500,
      timingLedger: { requestBuildMs: 100, schemaValidateMs: 50 }
    })
    store.finishRun(runId, 'success')

    const run = store.getRun(runId)
    expect(run?.timingLedger).toMatchObject({
      apiCallCount: 1,
      physicalCallCount: 1,
      retryPhysicalCallCount: 0,
      physicalDurationSumMs: 1000,
      firstTokenSumMs: 250,
      outputSumMs: 750,
      localOverheadSumMs: 500,
      requestBuildSumMs: 100,
      schemaValidateSumMs: 50
    })
  })

  it('counts schema and direct physical retries without changing continuation accounting', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 4, stepName: '正文层', mode: 'chain' })
    const callId = store.startApiCall(runId, {
      requestMessages: [{ role: 'user', content: '生成正文' }]
    })
    const phases = ['normal', 'schema_retry', 'direct_retry', 'continuation', 'heartbeat_retry'] as const
    for (const [index, phase] of phases.entries()) {
      store.appendPhysicalCall(runId, callId, {
        physicalCallId: `phase-${phase}`,
        phase,
        requestMessages: [{ role: 'user', content: `第${index + 1}次请求` }],
        responseText: `第${index + 1}次响应`,
        durationMs: 100,
        firstTokenMs: 20,
        outputMs: 80
      })
    }
    store.finishApiCall(runId, callId, {
      status: 'success',
      responseText: '第5次响应',
      durationMs: 600
    })
    store.finishRun(runId, 'success')

    const call = store.getRun(runId)?.apiCalls[0]
    expect(call?.timingLedger).toMatchObject({
      physicalCallCount: 5,
      retryPhysicalCallCount: 2,
      firstTokenSumMs: 100,
      outputSumMs: 400
    })
    expect(store.getRun(runId)?.timingLedger).toMatchObject({
      retryPhysicalCallCount: 2,
      firstTokenSumMs: 100,
      outputSumMs: 400
    })
    expect(store.getRun(runId)?.stepTimingLedger).toMatchObject({
      retryCallCount: 3,
      continuationCallCount: 1,
      firstTokenSumMs: 100,
      outputSumMs: 400
    })
  })

  it('computes an observability-only step timing ledger when finishing a run', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'pipeline',
      projectId: 'project-step-ledger',
      step: 2,
      stepName: '卷纲层',
      mode: 'single'
    })
    const callId = store.startApiCall(runId, {
      requestMessages: [{ role: 'user', content: '生成卷纲' }]
    })
    store.appendPhysicalCall(runId, callId, {
      physicalCallId: 'step-normal',
      requestMessages: [{ role: 'user', content: '生成卷纲' }],
      responseText: '卷纲',
      durationMs: 1000,
      firstTokenMs: 200,
      outputMs: 800
    })
    store.appendPhysicalCall(runId, callId, {
      physicalCallId: 'step-continuation',
      phase: 'continuation',
      requestMessages: [{ role: 'user', content: '继续生成卷纲' }],
      responseText: '续写卷纲',
      durationMs: 700,
      firstTokenMs: 150,
      outputMs: 550
    })
    store.finishApiCall(runId, callId, {
      status: 'success',
      responseText: '卷纲续写卷纲',
      durationMs: 1800,
      timingLedger: {
        requestBuildMs: 100,
        schemaRetryCount: 1,
        repeatedPromptBlocks: { '[大纲]': 2 }
      }
    })
    store.recordStepPhaseTiming(runId, 'validation', 30)
    store.recordStepPhaseTiming(runId, 'validation', 20)
    store.recordStepPhaseTiming(runId, 'persistence', 40)
    store.recordStepPhaseTiming(runId, 'validation', -1)
    store.finishRun(runId, 'success')

    const run = store.getRun(runId)
    expect(run?.stepTimingLedger).toMatchObject({
      promptBuildMs: 100,
      contextLoadMs: undefined,
      apiCallCount: 1,
      physicalCallCount: 2,
      retryCallCount: 0,
      schemaRetryCallCount: 1,
      continuationCallCount: 1,
      firstTokenSumMs: 350,
      outputSumMs: 1350,
      validationSumMs: 50,
      persistenceSumMs: 40,
      repeatedPromptBlocks: { '[大纲]': 2 },
      contextChars: 4,
      outputChars: 6,
      physicalDurationSumMs: 1700
    })
  })

  it('records step observations with explicit zero semantics and rejects invalid input', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 3, stepName: '章节层', mode: 'single' })

    store.recordStepObservation(runId, 'validation', 0)
    store.recordStepObservation(runId, 'validation', undefined)
    store.recordStepObservation(runId, 'validation', 25)
    store.recordStepObservation(runId, 'validation', -1)
    store.recordStepObservation(runId, 'validation', Number.POSITIVE_INFINITY)
    store.recordStepObservation(runId, 'persistence', Number.NaN)
    store.finishRun(runId, 'success')
    store.recordStepObservation(runId, 'validation', 100)

    const run = store.getRun(runId)
    expect(run?.stepPhaseTiming?.validation).toBe(25)
    expect(run?.stepPhaseTiming).not.toHaveProperty('persistence')
    expect(run?.stepTimingLedger?.validationSumMs).toBe(25)
  })

  it('does not backfill a step timing ledger into a legacy run object', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 2, stepName: '卷纲层', mode: 'single' })
    const callId = store.startApiCall(runId, {
      requestMessages: [{ role: 'user', content: '旧结构请求' }]
    })
    store.finishApiCall(runId, callId, { status: 'success', responseText: '旧结构返回' })
    const run = store.getRun(runId)!
    const legacyRun = JSON.parse(JSON.stringify({
      ...run,
      stepTimingLedger: undefined,
      stepPhaseTiming: undefined,
      stepBoundaryGapMs: undefined
    }))

    expect(legacyRun).not.toHaveProperty('stepTimingLedger')
    expect(store.exportRunToJson(legacyRun as any)).toBeTruthy()
  })

  it('records the gap to the previous finished run in the same step scope', async () => {
    const store = useRunTraceStore()
    const input = {
      source: 'pipeline' as const,
      projectId: 'project-gap',
      step: 2,
      stepName: '卷纲层',
      mode: 'single'
    }
    const firstRunId = store.startRun(input)
    store.finishRun(firstRunId, 'success')
    await new Promise(resolve => setTimeout(resolve, 2))
    const secondRunId = store.startRun(input)

    const run = store.getRun(secondRunId)
    expect(run?.stepBoundaryGapMs).toBeGreaterThanOrEqual(0)
  })

  it('summarizes the worst repeated prompt block count across API calls', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 2, stepName: '卷纲层', mode: 'single', skillNames: ['卷纲技能'] })
    const firstCallId = store.startApiCall(runId, {
      requestMessages: [{ role: 'user', content: '生成卷纲' }]
    })
    store.finishApiCall(runId, firstCallId, {
      status: 'success',
      responseText: '卷纲一',
      durationMs: 1000,
      timingLedger: {
        requestBuildMs: 10,
        repeatedPromptBlocks: { '[大纲]': 1, '[已生成卷事实清单]': 1 }
      }
    })
    const secondCallId = store.startApiCall(runId, {
      requestMessages: [{ role: 'user', content: '续生成卷纲' }]
    })
    store.finishApiCall(runId, secondCallId, {
      status: 'success',
      responseText: '卷纲二',
      durationMs: 1200,
      timingLedger: {
        requestBuildMs: 15,
        repeatedPromptBlocks: { '[大纲]': 2, '[已生成卷事实清单]': 2, '[style reference]': 1 }
      }
    })
    store.finishRun(runId, 'success')

    expect(store.getRun(runId)?.timingLedger?.repeatedPromptBlocks).toEqual({
      '[大纲]': 2,
      '[已生成卷事实清单]': 2,
      '[style reference]': 1
    })
  })

  it('updates the running api call execution settlement without changing terminal calls', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'outline',
      stepName: '大纲共创',
      mode: 'chat',
      sessionKind: 'chat',
      skillNames: []
    })
    const callId = store.startApiCall(runId, {
      source: 'outline',
      requestMessages: [{ role: 'user', content: '整理全文' }]
    })

    expect(store.updateApiCallExecutionSettlement(runId, callId, {
      executionSettlement: {
        phase: 'locating',
        readToolCalls: 3,
        maxReadToolCalls: 24,
        writeToolCalls: 0,
        reservedWriteToolCalls: 2,
        controlToolCalls: 0,
        physicalRequests: 1,
        maxPhysicalRequests: 8,
        exhaustedClasses: [],
        successfulWriteCount: 0,
        trustedCoverageCount: 0,
        planComplete: false,
      },
      readLedger: {
        workspace: 'outline',
        targetId: 'outline',
        uniqueReadCount: 3,
        duplicateReadCount: 0,
        rereadAfterCompactionCount: 0,
        compactedReadCount: 0,
        structureIdentity: 'structure:standard:node-1',
      },
    })).toBe(true)

    const call = store.getRun(runId)?.apiCalls[0]
    expect(call?.status).toBe('running')
    expect(call?.executionSettlement?.readToolCalls).toBe(3)
    expect(call?.readLedger?.uniqueReadCount).toBe(3)
    expect(store.getRun(runId)?.events.some(event => event.type === 'api-execution-settlement-updated')).toBe(true)

    store.finishApiCall(runId, callId, { status: 'success', responseText: '完成' })
    expect(store.updateApiCallExecutionSettlement(runId, callId, {
      executionSettlement: {
        phase: 'settling',
        readToolCalls: 4,
        maxReadToolCalls: 24,
        writeToolCalls: 1,
        reservedWriteToolCalls: 2,
        controlToolCalls: 0,
        physicalRequests: 2,
        maxPhysicalRequests: 8,
        exhaustedClasses: [],
        successfulWriteCount: 1,
        trustedCoverageCount: 1,
        planComplete: true,
      },
    })).toBe(false)
    expect(call?.executionSettlement?.phase).toBe('locating')
  })

  it('does not mark usage unavailable while a physical call is still running', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 2, stepName: '卷纲层', mode: 'single', skillNames: ['卷纲技能'] })
    const callId = store.startApiCall(runId, {
      requestMessages: [{ role: 'user', content: '生成卷纲' }]
    })
    store.appendPhysicalCall(runId, callId, {
      physicalCallId: 'physical-usage-state',
      status: 'running',
      requestMessages: [{ role: 'user', content: '生成卷纲' }],
      responseText: '',
      streamText: '',
      reasoningText: ''
    })
    store.appendPhysicalCall(runId, callId, {
      physicalCallId: 'physical-usage-state',
      status: 'success',
      requestMessages: [{ role: 'user', content: '生成卷纲' }],
      responseText: '响应正文',
      streamText: '响应正文',
      reasoningText: '',
      usage: { inputTokens: 10, outputTokens: 3, totalTokens: 13 }
    })

    const call = store.getRun(runId)?.apiCalls[0]
    expect(call?.physicalCalls?.[0]?.usageUnavailable).toBe(false)
  })

  it('keeps physical request messages when a later update has an empty message list', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 2, stepName: '卷纲层', mode: 'single', skillNames: ['卷纲技能'] })
    const callId = store.startApiCall(runId, {
      requestMessages: [{ role: 'user', content: '初始请求' }]
    })
    store.appendPhysicalCall(runId, callId, {
      physicalCallId: 'physical-keep-request',
      phase: 'normal',
      status: 'success',
      durationMs: 10,
      requestMessages: [{ role: 'user', content: '初始请求' }],
      responseText: '响应正文',
      streamText: '',
      reasoningText: '',
    })
    store.appendPhysicalCall(runId, callId, {
      phase: 'normal',
      status: 'success',
      durationMs: 20,
      requestMessages: [],
      responseText: '',
      streamText: '',
      reasoningText: '',
      physicalCallId: 'physical-keep-request',
    })
    const physical = store.getRun(runId)?.apiCalls[0]?.physicalCalls?.[0]
    expect(physical?.requestMessages).toEqual([{ role: 'user', content: '初始请求' }])
    expect(physical?.responseText).toBe('响应正文')
  })

  it('does not reopen a terminal physical call with a late running callback', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 2, stepName: '卷纲层', mode: 'single', skillNames: ['卷纲技能'] })
    const callId = store.startApiCall(runId, {
      requestMessages: [{ role: 'user', content: '初始请求' }]
    })
    store.appendPhysicalCall(runId, callId, {
      physicalCallId: 'physical-late-running',
      phase: 'normal',
      status: 'success',
      durationMs: 10,
      requestMessages: [{ role: 'user', content: '初始请求' }],
      responseText: '响应正文',
      streamText: '',
      reasoningText: '',
    })
    store.appendPhysicalCall(runId, callId, {
      phase: 'normal',
      status: 'running',
      requestMessages: [],
      responseText: '',
      streamText: '',
      reasoningText: '',
      physicalCallId: 'physical-late-running',
    })
    const physical = store.getRun(runId)?.apiCalls[0]?.physicalCalls?.[0]
    expect(physical?.physicalCallId).toBe('physical-late-running')
    expect(physical?.status).toBe('success')
    expect(physical?.responseText).toBe('响应正文')
  })

  it('keeps terminal physical response and stream payloads from empty retry updates', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 2, stepName: '卷纲层', mode: 'single', skillNames: ['卷纲技能'] })
    const callId = store.startApiCall(runId, {
      requestMessages: [{ role: 'user', content: '生成卷纲' }]
    })
    store.appendPhysicalCall(runId, callId, {
      physicalCallId: 'physical-retry-buffer',
      phase: 'normal',
      status: 'running',
      requestMessages: [{ role: 'user', content: '生成卷纲' }],
      responseText: '',
      streamText: '流式中断前的部分正文',
      reasoningText: '流式中断前的部分思考'
    })
    store.appendPhysicalCall(runId, callId, {
      physicalCallId: 'physical-retry-buffer',
      phase: 'normal',
      status: 'failed' as const,
      requestMessages: [{ role: 'user', content: '生成卷纲' }],
      responseText: '网络错误前已取得的正文',
      streamText: '',
      reasoningText: ''
    })
    store.appendPhysicalCall(runId, callId, {
      physicalCallId: 'physical-retry-buffer',
      phase: 'normal',
      status: 'running',
      requestMessages: [{ role: 'user', content: '生成卷纲' }],
      responseText: '',
      streamText: '',
      reasoningText: ''
    })

    const physical = store.getRun(runId)?.apiCalls[0]?.physicalCalls?.[0]
    expect(physical?.status).toBe('failed')
    expect(physical?.responseText).toBe('网络错误前已取得的正文')
    expect(physical?.streamText).toBe('流式中断前的部分正文')
    expect(physical?.reasoningText).toBe('流式中断前的部分思考')
  })

  it('exports physical call error text without reopening the terminal call', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 2, stepName: '卷纲层', mode: 'single', skillNames: ['卷纲技能'] })
    const callId = store.startApiCall(runId, {
      requestMessages: [{ role: 'user', content: '生成卷纲' }]
    })
    store.appendPhysicalCall(runId, callId, {
      physicalCallId: 'physical-error-observability',
      phase: 'normal',
      status: 'running',
      requestMessages: [{ role: 'user', content: '生成卷纲' }],
      responseText: '',
      streamText: '',
      reasoningText: ''
    })
    store.appendPhysicalCall(runId, callId, {
      physicalCallId: 'physical-error-observability',
      phase: 'normal',
      status: 'failed' as const,
      requestMessages: [{ role: 'user', content: '生成卷纲' }],
      responseText: '',
      streamText: '',
      reasoningText: '',
      error: '供应商返回 502'
    })
    const liveRun = store.getRun(runId)!
    const livePhysical = liveRun.apiCalls[0]?.physicalCalls?.[0]
    const exported = store.exportRunToJson(liveRun) as unknown as RunTrace
    const exportedPhysical = exported.apiCalls[0]?.physicalCalls?.[0]

    expect(livePhysical?.status).toBe('failed')
    expect(livePhysical?.error).toBe('供应商返回 502')
    expect(exportedPhysical?.status).toBe('failed')
    expect(exportedPhysical?.error).toBe('供应商返回 502')
  })

  it('backfills an empty top-level response from the last non-empty physical response', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 2, stepName: '卷纲层', mode: 'single', skillNames: ['卷纲技能'] })
    const callId = store.startApiCall(runId, {
      requestMessages: [{ role: 'user', content: '生成卷纲' }]
    })
    store.appendPhysicalCall(runId, callId, {
      requestMessages: [{ role: 'user', content: '生成卷纲' }],
      responseText: '第一段响应'
    })
    store.appendPhysicalCall(runId, callId, {
      requestMessages: [{ role: 'user', content: '生成卷纲' }],
      responseText: '最终响应'
    })
    store.finishApiCall(runId, callId, {
      status: 'success',
      responseText: ''
    })

    const call = store.getRun(runId)?.apiCalls[0]
    expect(call?.responseText).toBe('最终响应')
  })

  it('backfills and persists an empty top-level response from physical stream text', async () => {
    vi.useFakeTimers()
    const runTraceSave = vi.fn(async (_payload: unknown) => ({ success: true, dirName: 'run-stream-backfill' }))
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { electronAPI: { runTraceSave } }
    })
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 2, stepName: '卷纲层', mode: 'single', skillNames: ['卷纲技能'] })
    const callId = store.startApiCall(runId, {
      requestMessages: [{ role: 'user', content: '生成卷纲' }]
    })
    store.appendPhysicalCall(runId, callId, {
      requestMessages: [{ role: 'user', content: '生成卷纲' }],
      responseText: '',
      streamText: '物理请求里的完整流式正文'
    })

    store.finishApiCall(runId, callId, { status: 'success', responseText: '' })
    await vi.advanceTimersByTimeAsync(0)

    const call = store.getRun(runId)?.apiCalls[0]
    expect(call?.responseText).toBe('物理请求里的完整流式正文')
    const exported = call ? store.exportRunToJson(store.getRun(runId)!) as unknown as RunTrace : undefined
    expect(exported?.apiCalls?.[0]?.responseText).toBe('物理请求里的完整流式正文')
    const persisted = runTraceSave.mock.calls.at(-1)?.[0] as
      | { run?: { apiCalls?: Array<{ responseText?: string }> } }
      | undefined
    expect(persisted?.run?.apiCalls?.[0]?.responseText).toBe('物理请求里的完整流式正文')
    vi.useRealTimers()
  })

  it('persists editor context policy events with legacy history neutralization fields', async () => {
    vi.useFakeTimers()
    const runTraceSave = vi.fn(async (_payload: unknown) => ({ success: true, dirName: 'run-history-neutralization' }))
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { electronAPI: { runTraceSave } }
    })
    const store = useRunTraceStore()
    const runId = store.startRun({ source: 'outline', stepName: '大纲共创', mode: 'chat', skillNames: [] })
    const detail = JSON.stringify({
      historyNeutralization: {
        neutralizedMessageCount: 1,
        markers: { '修改预览': 1, '等待确认': 1 },
      },
    })
    store.addEvent(runId, {
      type: 'editor-context-policy',
      level: 'info',
      label: '编辑目标上下文策略',
      detail,
    })

    store.finishRun(runId, 'success')
    await vi.advanceTimersByTimeAsync(0)

    const savedEvent = store.getRun(runId)?.events.find(item => item.type === 'editor-context-policy')
    expect(savedEvent?.type).toBe('editor-context-policy')
    expect(JSON.parse(String(savedEvent?.detail || '{}'))).toEqual({
      historyNeutralization: {
        neutralizedMessageCount: 1,
        markers: { '修改预览': 1, '等待确认': 1 },
      },
    })
    const persisted = runTraceSave.mock.calls.at(-1)?.[0] as
      | { run?: { events?: Array<{ type?: string; detail?: string }> } }
      | undefined
    const persistedEvent = persisted?.run?.events?.find(item => item.type === 'editor-context-policy')
    expect(JSON.parse(String(persistedEvent?.detail || '{}'))).toEqual({
      historyNeutralization: {
        neutralizedMessageCount: 1,
        markers: { '修改预览': 1, '等待确认': 1 },
      },
    })
    vi.useRealTimers()
  })

  it('backfills empty top-level reasoning from the last non-empty physical reasoning', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 2, stepName: '卷纲层', mode: 'single', skillNames: ['卷纲技能'] })
    const callId = store.startApiCall(runId, {
      requestMessages: [{ role: 'user', content: '生成卷纲' }]
    })
    store.appendPhysicalCall(runId, callId, {
      requestMessages: [{ role: 'user', content: '生成卷纲' }],
      responseText: '',
      reasoningText: '物理请求里的完整思考'
    })
    store.finishApiCall(runId, callId, {
      status: 'success',
      responseText: '最终响应'
    })

    const call = store.getRun(runId)?.apiCalls[0]
    expect(call?.reasoningText).toBe('物理请求里的完整思考')
    expect(call?.responseText).toBe('最终响应')
  })

  it('records the actual tool surface on api start events', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ source: 'home', stepName: '主页对话', mode: 'chat', skillNames: [] })
    store.startApiCall(runId, {
      step: 4,
      requestMessages: [{ role: 'user', content: '直接写入编辑器' }],
      model: 'test-model',
      actualToolSurface: [{ name: 'editor.write', policy: 'write' }]
    })

    const event = store.getRun(runId)?.events.find(e => e.type === 'api-start')
    expect(event?.detail).toBe(
      JSON.stringify({
        skillName: undefined,
        model: 'test-model',
        actualToolSurface: [{ name: 'editor.write', policy: 'write' }],
        permissionDecision: null
      })
    )
  })

  it('persists permission decisions on turns and API calls and exports them', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'outline',
      stepName: '大纲共创',
      mode: 'direct',
      skillNames: [],
      sessionKind: 'chat',
    })
    const permissionDecision = {
      source: 'dialogue-intent',
      decision: 'write-authorized',
      intent: 'edit',
      operation: 'targeted_edit',
      mode: 'direct',
      reason: '用户明确要求修改编辑器内容',
    } as const
    const turnId = store.startTurn(runId, {
      userRequest: '直接修改第一段',
      intent: 'edit',
      permissionDecision,
      actualToolSurface: [{ name: 'editor.write', policy: 'write' }],
    })
    const callId = store.startApiCall(runId, {
      source: 'outline',
      requestMessages: [{ role: 'user', content: '直接修改第一段' }],
      intent: 'edit',
      permissionDecision,
      actualToolSurface: [{ name: 'editor.write', policy: 'write' }],
    })
    store.appendToolCall(runId, callId, {
      name: 'editor.write',
      input: { commands: [] },
      status: 'success',
      defaultToolPolicy: 'allowedWithPermission',
      riskLevel: 'medium',
    })
    store.finishApiCall(runId, callId, {
      status: 'success',
      responseText: '写入完成',
    })
    store.finishTurn(runId, turnId, 'success')

    const exported = store.exportRunToJson(store.getRun(runId)!) as unknown as {
      turns?: Array<{ permissionDecision?: unknown }>
      apiCalls?: Array<{
        permissionDecision?: unknown
        toolCalls?: Array<{ defaultToolPolicy?: string; riskLevel?: string }>
      }>
    }
    expect(exported.turns?.[0]?.permissionDecision).toEqual(permissionDecision)
    expect(exported.apiCalls?.[0]?.permissionDecision).toEqual(permissionDecision)
    expect(exported.apiCalls?.[0]?.toolCalls?.[0]).toMatchObject({
      defaultToolPolicy: 'allowedWithPermission',
      riskLevel: 'medium',
    })
  })

  it('keeps permission decisions and optional for legacy v11 traces', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'outline',
      stepName: '大纲共创',
      mode: 'direct',
      skillNames: [],
      sessionKind: 'chat',
    })
    const turnId = store.startTurn(runId, {
      userRequest: '旧版本只读讨论',
      intent: 'discuss',
      actualToolSurface: [],
    })
    const callId = store.startApiCall(runId, {
      source: 'outline',
      requestMessages: [{ role: 'user', content: '旧版本只读讨论' }],
      intent: 'discuss',
      actualToolSurface: [],
    })
    store.finishApiCall(runId, callId, { status: 'success', responseText: '旧版本返回' })
    store.finishTurn(runId, turnId, 'success')
    const current = JSON.parse(JSON.stringify(store.getRun(runId)!)) as {
      turns: Array<Record<string, unknown>>
      apiCalls: Array<Record<string, unknown>>
    }
    const legacy = {
      ...current,
      schemaVersion: 11,
      turns: current.turns.map((turn: Record<string, unknown>) => ({
        ...turn,
        permissionDecision: undefined,
      })),
      apiCalls: current.apiCalls.map((call: Record<string, unknown>) => ({
        ...call,
        permissionDecision: undefined,
        toolCalls: ((call.toolCalls || []) as Array<Record<string, unknown>>).map((tool: Record<string, unknown>) => ({
          ...tool,
          defaultToolPolicy: undefined,
          riskLevel: undefined,
        })),
      })),
    }

    const exported = store.exportRunToJson(legacy as any) as any
    expect(exported.schemaVersion).toBe(11)
    expect(exported.turns[0].permissionDecision).toBeUndefined()
    expect(exported.apiCalls[0].permissionDecision).toBeUndefined()
    expect(exported.apiCalls[0].responseText).toBe('旧版本返回')
  })

  it('records degraded api calls and run state', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 2, stepName: '卷纲层', mode: 'single', skillNames: ['卷纲技能'] })
    const callId = store.startApiCall(runId, {
      step: 2,
      requestMessages: [{ role: 'user', content: '生成卷纲' }],
      maxTokens: 1000
    })
    store.finishApiCall(runId, callId, {
      status: 'degraded',
      responseText: '不完整卷纲',
      finishReason: 'length',
      usage: { completion_tokens: 1000 },
      error: '输出被截断，已自动续写合并'
    })
    store.finishRun(runId, 'degraded', '输出被截断，已自动续写合并')

    const run = store.getRun(runId)!
    expect(run.apiCalls[0].status).toBe('degraded')
    expect(run.events.map(e => e.type)).toContain('api-degraded')
    expect(run.events.find(e => e.type === 'api-degraded')?.label).toContain('完成（降级）')
    expect(run.events.find(e => e.type === 'finished')?.label).toContain('完成（降级）')
    expect(run.events.find(e => e.type === 'finished')?.level).toBe('warn')
    expect(run.events.map(e => e.type)).not.toContain('failed')
    expect(run.status).toBe('degraded')
  })

  it('masks api keys when exporting text', () => {
    const store = useRunTraceStore()
    expect(store.maskSensitive('Authorization: Bearer sk-test-1234567890')).not.toContain('sk-test-1234567890')
    expect(store.maskSensitive('apiKey=abcdef123456')).not.toContain('abcdef123456')
    expect(store.maskSensitive('模型 test-model 保留')).toContain('test-model')
  })

  it('exports a complete readable run trace', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 2, stepName: '卷纲层', mode: 'single', skillNames: ['卷纲技能'] })
    store.addEvent(runId, { type: 'started', level: 'info', label: '开始逐卷生成', detail: '大纲锁定' })
    const callId = store.startApiCall(runId, {
      step: 2,
      requestMessages: [{ role: 'user', content: '完整用户提示词' }],
      model: 'test-model'
    })
    store.appendStream(runId, callId, '完整流式输出')
    store.finishApiCall(runId, callId, { status: 'success', responseText: '完整返回', durationMs: 100 })
    store.finishRun(runId, 'success')

    const run = store.getRun(runId)
    const text = store.exportRunToText(run!)
    expect(text).toContain('运行记录')
    expect(text).toContain('完整用户提示词')
    expect(text).toContain('完整流式输出')
    expect(text).toContain('完整返回')
    expect(text).toContain('api-call-1')
  })

  it('stores only reasoning deltas and exports the full thinking trace', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 2, stepName: '卷纲层', mode: 'single', skillNames: ['卷纲技能'] })
    const callId = store.startApiCall(runId, {
      step: 2,
      requestMessages: [{ role: 'user', content: '完整用户提示词' }],
      model: 'test-model'
    })
    store.appendReasoning(runId, callId, '思考开始')
    store.appendReasoning(runId, callId, '：定位当前卷')
    store.appendReasoning(runId, callId, '')
    store.finishApiCall(runId, callId, { status: 'success', responseText: '完整返回', durationMs: 100 })
    store.finishRun(runId, 'success')

    const run = store.getRun(runId)!
    expect(run.apiCalls[0]?.reasoningText).toBe('思考开始：定位当前卷')
    expect(store.exportRunToText(run)).toContain('思考过程全文：\n思考开始：定位当前卷')
    expect(JSON.stringify(store.exportRunToJson(run))).toContain('思考开始：定位当前卷')
  })

  it('does not let a short legacy final reasoning overwrite accumulated deltas', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 2, stepName: '卷纲层', mode: 'single', skillNames: ['卷纲技能'] })
    const callId = store.startApiCall(runId, {
      step: 2,
      requestMessages: [{ role: 'user', content: '完整用户提示词' }],
      model: 'test-model'
    })
    store.appendReasoning(runId, callId, '<reasoning>完整')
    store.appendReasoning(runId, callId, '思考：含尾巴')
    store.finishApiCall(runId, callId, {
      status: 'failed',
      responseText: '',
      reasoningText: '<reasoning>完整思考：', // legacy pre-fix payload without the flushed tail
      error: '请求中断',
      durationMs: 100
    })

    const run = store.getRun(runId)!
    expect(run.apiCalls[0]?.reasoningText).toBe('<reasoning>完整思考：含尾巴')
  })

  it('replaces accumulated reasoning when the final result is the longer canonical text', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 4, stepName: '正文层', mode: 'body', skillNames: ['正文技能'] })
    const callId = store.startApiCall(runId, {
      step: 4,
      requestMessages: [{ role: 'user', content: '完整用户提示词' }],
      model: 'test-model'
    })
    store.appendReasoning(runId, callId, '局部思考')
    store.finishApiCall(runId, callId, {
      status: 'success',
      responseText: '正文返回',
      reasoningText: '局部思考 + 过滤器补齐的完整思考',
      durationMs: 100
    })

    const run = store.getRun(runId)!
    expect(run.apiCalls[0]?.reasoningText).toBe('局部思考 + 过滤器补齐的完整思考')
  })

  it('appends folder diagnostics and keeps multiple diagnostic records', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 4, stepName: '正文层', mode: 'body', skillNames: ['文件夹技能'] })
    store.appendFolderDiagnostics(runId, { status: 'success', diagnostics: [] })
    store.appendFolderDiagnostics(runId, { status: 'degraded', diagnostics: [] })
    store.finishRun(runId, 'success')

    const run = store.getRun(runId)
    expect(run?.folderDiagnostics).toHaveLength(2)
    expect(run?.events.filter(event => event.type === 'folder-diagnostics')).toHaveLength(2)
  })

  it('masks sensitive strings recursively in JSON export', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 2, stepName: '卷纲层', mode: 'single', skillNames: [] })
    const callId = store.startApiCall(runId, {
      step: 2,
      requestMessages: [{ role: 'user', content: 'apiKey=abcdef123456' }],
      model: 'test-model'
    })
    store.finishApiCall(runId, callId, { status: 'success', responseText: 'Authorization: Bearer sk-test-1234567890' })
    const run = store.getRun(runId)!
    const exported = store.exportRunToJson(run) as unknown as typeof run
    const json = JSON.stringify(exported)
    expect(json).not.toContain('abcdef123456')
    expect(json).not.toContain('sk-test-1234567890')
    expect(json).toContain('test-model')
  })

  it('keeps the internal dirName out of JSON exports', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ source: 'home', stepName: '主页共创', mode: 'chat', skillNames: [] })
    const run = store.getRun(runId)!
    run.dirName = 'run-trace-home-test'
    const exported = store.exportRunToJson(run) as Partial<typeof run>
    expect(exported.dirName).toBeUndefined()
  })

  it('aggregates multiple turns into one chat run', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'outline',
      stepName: '大纲共创',
      mode: 'chain',
      skillNames: ['S1'],
      sessionKind: 'chat'
    })

    const firstTurn = store.startTurn(runId, {
      userRequest: '审核大纲看看缺什么',
      skillNames: ['S1', 'S2'],
      mode: 'chain',
      intent: 'analyze'
    })
    const firstCall = store.startApiCall(runId, {
      source: 'outline',
      requestMessages: [{ role: 'user', content: '第一轮请求' }]
    })
    store.finishApiCall(runId, firstCall, { status: 'success', responseText: '第一轮返回', durationMs: 100 })
    store.finishTurn(runId, firstTurn, 'success')

    const secondTurn = store.startTurn(runId, {
      userRequest: '修改第三卷结构',
      mode: 'direct'
    })
    const secondCall = store.startApiCall(runId, {
      source: 'outline',
      turnId: secondTurn,
      requestMessages: [{ role: 'user', content: '第二轮请求' }]
    })
    store.appendStream(runId, secondCall, '第二轮流式')
    store.finishApiCall(runId, secondCall, { status: 'success', responseText: '第二轮返回', durationMs: 120 })
    store.finishTurn(runId, secondTurn, 'success')

    const run = store.getRun(runId)
    expect(store.runs.filter(item => item.source === 'outline')).toHaveLength(1)
    expect(run?.turns?.length).toBe(2)
    expect(run?.turns?.[0]?.userRequest).toBe('审核大纲看看缺什么')
    expect(run?.turns?.[1]?.userRequest).toBe('修改第三卷结构')
    expect(run?.events.filter(event => event.turnId === firstTurn).length).toBeGreaterThan(0)
    expect(run?.events.filter(event => event.turnId === secondTurn).length).toBeGreaterThan(0)
    expect(run?.apiCalls.every(call => call.turnId === secondTurn)).toBe(false)
    expect(run?.apiCalls.find(call => call.id === firstCall)?.turnId).toBe(firstTurn)
    expect(run?.apiCalls.find(call => call.id === secondCall)?.turnId).toBe(secondTurn)

    const exported = store.exportRunToJson(run!)
    expect(JSON.stringify(exported)).not.toContain('currentTurnId')
  })

  it('keeps chain calls and continuation in the same turn', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'home',
      stepName: '主页共创',
      mode: 'chain',
      skillNames: ['S1', 'S2', 'S3'],
      sessionKind: 'chat'
    })
    const turnId = store.startTurn(runId, { userRequest: '重写第一章', skillNames: ['S1', 'S2', 'S3'], mode: 'chain' })

    const firstCall = store.startApiCall(runId, {
      source: 'home',
      requestMessages: [{ role: 'user', content: 'S1 请求' }]
    })
    store.finishApiCall(runId, firstCall, { status: 'success', responseText: 'S1 输出' })
    const secondCall = store.startApiCall(runId, {
      source: 'home',
      requestMessages: [{ role: 'user', content: 'S2 请求' }]
    })
    store.finishApiCall(runId, secondCall, { status: 'success', responseText: 'S2 输出' })
    const continuationCall = store.startApiCall(runId, {
      source: 'home',
      requestMessages: [{ role: 'user', content: '继续生成' }]
    })
    store.finishApiCall(runId, continuationCall, { status: 'success', responseText: '续写输出' })

    const run = store.getRun(runId)
    expect(run?.turns).toHaveLength(1)
    expect(run?.apiCalls).toHaveLength(3)
    expect(run?.apiCalls.every(call => call.turnId === turnId)).toBe(true)
    expect(run?.events.filter(event => event.type !== 'started').every(event => event.turnId === turnId)).toBe(true)
  })

  it('updates the running turn after late intent routing', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'outline',
      stepName: '大纲共创',
      mode: 'chain',
      skillNames: ['S1'],
      sessionKind: 'chat'
    })
    const turnId = store.startTurn(runId, {
      userRequest: '把这段设定插入第三段',
      skillNames: ['S1'],
      mode: 'chain',
      intent: 'auto',
      writeMode: 'direct',
      toolSurface: [{ name: 'editor.read', policy: 'read' }],
      actualToolSurface: [{ name: 'editor.read', policy: 'read' }]
    })

    const updated = store.updateTurnIntent(runId, turnId, {
      intent: 'edit',
      toolSurface: [
        { name: 'editor.read', policy: 'read' },
        { name: 'editor.write', policy: 'write' }
      ],
      actualToolSurface: [
        { name: 'editor.read', policy: 'read' },
        { name: 'editor.write', policy: 'write' }
      ]
    })
    store.finishTurn(runId, turnId, 'success')

    const turn = store.getRun(runId)?.turns?.find(item => item.id === turnId)
    expect(updated).toBe(true)
    expect(turn?.intent).toBe('edit')
    expect(turn?.actualToolSurface).toEqual([
      { name: 'editor.read', policy: 'read' },
      { name: 'editor.write', policy: 'write' }
    ])
    expect(
      store.getRun(runId)?.events.some(
        event => event.type === 'turn-intent-updated' && event.turnId === turnId
      )
    ).toBe(true)

    const staleUpdate = store.updateTurnIntent(runId, turnId, { intent: 'analyze' })
    expect(staleUpdate).toBe(false)
    expect(store.getRun(runId)?.turns?.find(item => item.id === turnId)?.intent).toBe('edit')
  })

  it('records the surface source when routing traces project the tool surface', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'outline',
      stepName: '大纲共创',
      mode: 'chain',
      skillNames: ['S1'],
      sessionKind: 'chat'
    })
    const turnId = store.startTurn(runId, {
      userRequest: '把这段设定插入第三段',
      mode: 'chain',
      intent: 'auto'
    })

    const updated = store.updateTurnIntent(runId, turnId, {
      intent: 'edit',
      surfaceSource: 'trace-projection',
      toolSurface: [{ name: 'editor.read', policy: 'read' }],
      actualToolSurface: [{ name: 'editor.read', policy: 'read' }]
    })

    const run = store.getRun(runId)
    const turn = run?.turns?.find(item => item.id === turnId)
    const event = run?.events.find(
      item => item.type === 'turn-intent-updated' && item.turnId === turnId
    )
    expect(updated).toBe(true)
    expect(turn?.surfaceSource).toBe('trace-projection')
    expect(event?.payload).toMatchObject({ surfaceSource: 'trace-projection' })
  })

  it('emits a dedicated event when folder diagnostics ignore skill agent execution overrides', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'pipeline',
      stepName: '生成流水线',
      mode: 'chain'
    })

    store.appendFolderDiagnostics(runId, [
      { level: 'info', code: 'skill-agent-ignored', message: 'meta.agent execution parameters ignored' }
    ])

    const event = store.getRun(runId)?.events.find(item => item.type === 'skill-agent-ignored')
    expect(event?.level).toBe('warn')
    expect(event?.payload).toMatchObject({ code: 'skill-agent-ignored' })
  })

  it('emits the skill agent ignored event from wrapped pipeline diagnostics', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'pipeline',
      stepName: '生成流水线',
      mode: 'chain'
    })

    store.appendFolderDiagnostics(runId, {
      status: 'degraded',
      diagnostics: [
        { type: 'warning', code: 'skill-agent-ignored', message: 'meta.agent execution parameters ignored' }
      ]
    })

    const event = store.getRun(runId)?.events.find(item => item.type === 'skill-agent-ignored')
    expect(event?.level).toBe('warn')
    expect(event?.payload).toMatchObject({ code: 'skill-agent-ignored' })
  })

  it('marks eval runs with an explicit execution context', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'eval',
      stepName: '技能评测',
      mode: 'with-baseline'
    })

    const run = store.getRun(runId)
    expect(run?.executionContext).toBe('skill-eval')
    expect(
      run?.events.some(event => event.type === 'execution-context'
        && (event.payload as { executionContext?: string } | undefined)?.executionContext === 'skill-eval')
    ).toBe(true)
  })

  it('preserves the folded intent when a late no-match event only records fallback', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'home',
      stepName: '主页对话',
      mode: 'direct',
      skillNames: [],
      sessionKind: 'chat'
    })
    const turnId = store.startTurn(runId, {
      userRequest: '开篇那个吸引点我不太满意',
      mode: 'direct',
      intent: 'discuss'
    })

    const updated = store.updateTurnIntent(runId, turnId, {
      routingFallback: 'readonly-discuss'
    })
    store.finishTurn(runId, turnId, 'success')

    const turn = store.getRun(runId)?.turns?.find(item => item.id === turnId)
    expect(updated).toBe(true)
    expect(turn?.intent).toBe('discuss')
    expect(turn?.routingFallback).toBe('readonly-discuss')
  })

  it('keeps cancellation terminal and preserves the original cancellation reason', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'outline',
      stepName: '大纲共创',
      mode: 'chain',
      sessionKind: 'chat'
    })
    store.startTurn(runId, { userRequest: '分析大纲', skillNames: ['S1'], mode: 'chain' })
    const callId = store.startApiCall(runId, {
      source: 'outline',
      skillName: 'S1',
      requestMessages: [{ role: 'user', content: '分析大纲' }]
    })

    store.cancelRunningApiCalls(runId, '用户取消生成')
    store.finishApiCall(runId, callId, { status: 'success', responseText: '迟到回调' })

    const call = store.getRun(runId)?.apiCalls[0]
    expect(call?.status).toBe('canceled')
    expect(call?.error).toBe('用户取消生成')
    expect(call?.responseText).toBe('')
  })

  it('closes running physical calls when API calls are canceled', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'outline',
      stepName: '大纲共创',
      mode: 'direct',
      sessionKind: 'chat',
      skillNames: []
    })
    store.startTurn(runId, { userRequest: '取消这一轮', mode: 'direct' })
    const callId = store.startApiCall(runId, {
      source: 'outline',
      requestMessages: [{ role: 'user', content: '取消这一轮' }]
    })
    store.appendPhysicalCall(runId, callId, {
      physicalCallId: 'physical-cancel',
      status: 'running',
      phase: 'normal',
      requestMessages: [{ role: 'user', content: '取消这一轮' }]
    })

    store.cancelRunningApiCalls(runId, '用户取消生成')

    const physical = store.getRun(runId)?.apiCalls[0]?.physicalCalls?.[0]
    expect(physical?.status).toBe('canceled')
    expect(physical?.endedAt).toBeGreaterThan(0)
    expect(physical?.durationMs).toBeGreaterThanOrEqual(0)
    expect(physical?.error).toBe('用户取消生成')
  })

  it('keeps real provider failures failed and ignores a late success callback', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'outline',
      stepName: '大纲共创',
      mode: 'direct',
      sessionKind: 'chat',
      skillNames: []
    })
    store.startTurn(runId, { userRequest: '整理大纲', mode: 'direct' })
    const callId = store.startApiCall(runId, {
      source: 'outline',
      requestMessages: [{ role: 'user', content: '整理大纲' }]
    })
    store.appendPhysicalCall(runId, callId, {
      physicalCallId: 'physical-failure',
      status: 'running',
      phase: 'normal',
      requestMessages: [{ role: 'user', content: '整理大纲' }]
    })

    store.failRunningApiCalls(runId, '供应商网络断流')
    store.finishApiCall(runId, callId, { status: 'success', responseText: '迟到回调' })

    const call = store.getRun(runId)?.apiCalls[0]
    const physical = call?.physicalCalls?.[0]
    expect(call?.status).toBe('failed')
    expect(call?.error).toBe('供应商网络断流')
    expect(call?.responseText).toBe('')
    expect(physical?.status).toBe('failed')
    expect(physical?.error).toBe('供应商网络断流')
  })

  it('stores cumulative stream callbacks as deltas without quadratic growth', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'pipeline',
      stepName: '卷纲层',
      mode: 'chain',
      skillNames: ['S1']
    })
    const callId = store.startApiCall(runId, {
      source: 'pipeline',
      step: 2,
      skillId: 'S1',
      skillName: '卷纲解析',
      requestMessages: [{ role: 'user', content: '生成第一卷' }]
    })

    store.appendCumulativeStream(runId, callId, '第一')
    store.appendCumulativeStream(runId, callId, '第一段')
    store.appendCumulativeStream(runId, callId, '第一段完整')
    store.appendCumulativeStream(runId, callId, '第一段完整')
    store.appendCumulativeStream(runId, callId, '非前缀回调')

    const call = store.getRun(runId)?.apiCalls.find(call => call.id === callId)
    expect(call?.streamText).toBe('第一段完整')
    store.finishApiCall(runId, callId, { status: 'success', responseText: '第一段完整', durationMs: 100 })
    expect(call?.status).toBe('success')
  })

  it('assigns monotonic event sequence numbers across api calls and v4 records', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 4, stepName: '正文层', mode: 'chain', skillNames: ['S1'] })
    const callId = store.startApiCall(runId, {
      step: 4,
      requestMessages: [{ role: 'user', content: '生成正文' }]
    })
    store.appendPhysicalCall(runId, callId, {
      phase: 'tool_iteration',
      requestMessages: [{ role: 'user', content: '物理请求' }],
      responseText: '物理返回',
      usage: { input_tokens: 12, output_tokens: 7 }
    })
    store.appendToolCall(runId, callId, {
      name: 'editor.get_state',
      input: { targetId: 'chapter-1' },
      result: { ok: true },
      durationMs: 15
    })
    store.finishApiCall(runId, callId, {
      status: 'success',
      responseText: '最终返回',
      usage: { promptTokens: 12, completionTokens: 7 }
    })
    const promptId = store.attachPromptSnapshot(runId, {
      apiCallId: callId,
      skillId: 'S1',
      skillName: '正文技能',
      contextBlocks: [{ source: 'outline', version: 'v1', coverage: 'structure_map' }],
      finalMessages: [{ role: 'system', content: 'system' }, { role: 'user', content: 'user' }]
    })
    const reportId = store.attachProcessingReport(runId, {
      apiCallId: callId,
      stage: 'post',
      processor: 'hard-rules',
      status: 'warning',
      issues: [{ level: 'warning', code: 'rule-hit', message: '命中规则', blocking: false }],
      startedAt: Date.now() - 10,
      endedAt: Date.now(),
      durationMs: 10
    })
    store.finishRun(runId, 'success')

    const run = store.getRun(runId)!
    const seqs = run.events.map(event => event.seq)
    expect(seqs).toEqual([...seqs].sort((a, b) => (a || 0) - (b || 0)))
    expect(new Set(seqs).size).toBe(seqs.length)
    expect(run.apiCalls[0].physicalCalls).toHaveLength(1)
    expect(run.apiCalls[0].physicalCalls?.[0].phase).toBe('tool_iteration')
    expect(run.apiCalls[0].toolCalls?.[0].name).toBe('editor.get_state')
    expect(run.apiCalls[0].semantic?.usage).toMatchObject({ inputTokens: 12, outputTokens: 7 })
    expect(run.promptSnapshots?.[0].id).toBe(promptId)
    expect(run.processingReports?.[0].id).toBe(reportId)
    expect(run.apiCalls[0].promptSnapshotIds).toContain(promptId)
    expect(run.apiCalls[0].processingReportIds).toContain(reportId)
  })

  it('backfills turn-level tool call reconciliation while the turn is running', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'outline',
      stepName: '大纲共创',
      mode: 'direct',
      skillNames: [],
      sessionKind: 'chat'
    })
    const turnId = store.startTurn(runId, {
      userRequest: '试着在大纲第一行后面加几个字，验证写入权限',
      mode: 'direct',
      writeMode: 'direct',
      toolSurface: [{ name: 'editor.write', policy: 'write' }],
      actualToolSurface: [{ name: 'editor.write', policy: 'write' }]
    })
    const callId = store.startApiCall(runId, {
      source: 'outline',
      intent: 'edit',
      toolSurface: [{ name: 'editor.write', policy: 'write' }],
      actualToolSurface: [{ name: 'editor.write', policy: 'write' }],
      requestMessages: [{ role: 'user', content: '试着在大纲第一行后面加几个字' }]
    })
    store.appendToolCall(runId, callId, {
      name: 'editor.write',
      input: { anchor: '第一行', text: '测试' },
      result: { status: 'written' },
      durationMs: 12,
      protocolVersion: 1,
      protocolVersionDefaulted: true
    })
    store.finishApiCall(runId, callId, {
      status: 'success',
      responseText: '已写入',
      durationMs: 100
    })
    store.finishTurn(runId, turnId, 'success')

    const turn = store.getRun(runId)?.turns?.find(item => item.id === turnId)
    expect(turn?.toolCalls).toHaveLength(1)
    expect(turn?.toolCalls?.[0]).toMatchObject({
      name: 'editor.write',
      status: 'success',
      protocolVersion: 1,
      protocolVersionDefaulted: true
    })
    expect(turn?.toolCallCount).toBe(1)
    expect(turn?.apiCallIds).toContain(callId)
  })

  it('upserts duplicate tool-call records by provider toolCallId within one api call', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'home',
      stepName: '主页对话',
      mode: 'direct',
      skillNames: [],
      sessionKind: 'chat'
    })
    const callId = store.startApiCall(runId, {
      source: 'home',
      requestMessages: [{ role: 'user', content: '写入测试' }]
    })
    const input = {
      name: 'editor.write',
      toolCallId: 'provider-tool-call-1',
      input: { anchor: '第一段', text: '新段落' },
      result: { ok: true, status: 'written' },
      durationMs: 12,
      protocolVersion: 1
    }
    store.appendToolCall(runId, callId, input)
    store.appendToolCall(runId, callId, {
      ...input,
      durationMs: 20,
      result: { ok: true, status: 'written', applied: 1 }
    })

    const call = store.getRun(runId)?.apiCalls.find(item => item.id === callId)
    expect(call?.toolCalls).toHaveLength(1)
    expect(call?.toolCalls?.[0]).toMatchObject({
      toolCallId: 'provider-tool-call-1',
      durationMs: 20,
      protocolVersion: 1
    })
  })

  it('records tool protocol capability and normalized rejection category for failed direct writes', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'outline',
      stepName: '大纲共创',
      mode: 'direct',
      skillNames: [],
      sessionKind: 'chat'
    })
    const callId = store.startApiCall(runId, {
      source: 'outline',
      intent: 'edit',
      toolSurface: [{ name: 'editor.write', policy: 'write' }],
      actualToolSurface: [{ name: 'editor.write', policy: 'write' }],
      requestMessages: [{ role: 'user', content: '写入测试' }]
    })
    const input = {
      name: 'editor.write',
      toolCallId: 'provider-tool-call-rejected',
      input: { protocolVersion: 99, commands: [] },
      result: { ok: false, error: { code: 'unsupported_protocol_version', message: '不支持的编辑协议版本' } },
      status: 'failed' as const,
      error: '不支持的编辑协议版本',
      durationMs: 8,
      protocolVersion: 99,
      toolCapability: 'native_tools' as const,
      rejectionCategory: 'invalid_protocol' as const
    }
    store.appendToolCall(runId, callId, input)
    store.finishApiCall(runId, callId, { status: 'failed', responseText: '', error: '协议拒绝' })

    const call = store.getRun(runId)?.apiCalls.find(item => item.id === callId)
    expect(call?.toolCalls?.[0]).toMatchObject({
      toolCapability: 'native_tools',
      rejectionCategory: 'invalid_protocol',
      status: 'failed',
      errorCode: 'unsupported_protocol_version'
    })
    const text = store.exportRunToText(store.getRun(runId)!)
    expect(text).toContain('协议能力：native_tools')
    expect(text).toContain('拒绝分类：invalid_protocol')
    expect(text).toContain('错误码：unsupported_protocol_version')
  })

  it('keeps tool capability and rejection category when a duplicate tool-call record is updated', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'home',
      stepName: '主页对话',
      mode: 'direct',
      skillNames: [],
      sessionKind: 'chat'
    })
    const callId = store.startApiCall(runId, {
      source: 'home',
      requestMessages: [{ role: 'user', content: '写入测试' }]
    })
    const base = {
      name: 'editor.write',
      toolCallId: 'provider-tool-call-duplicate',
      input: { commands: [] },
      durationMs: 5,
      protocolVersion: 1,
      toolCapability: 'json_protocol' as const
    }
    store.appendToolCall(runId, callId, {
      ...base,
      result: { ok: false, error: { code: 'invalid_input', message: '参数错误' } },
      rejectionCategory: 'schema_invalid'
    })
    store.appendToolCall(runId, callId, {
      ...base,
      durationMs: 9,
      result: { ok: false, error: { code: 'permission_denied', message: '权限不足' } },
      rejectionCategory: 'permission_denied'
    })

    const call = store.getRun(runId)?.apiCalls.find(item => item.id === callId)
    expect(call?.toolCalls).toHaveLength(1)
    expect(call?.toolCalls?.[0]).toMatchObject({
      toolCapability: 'json_protocol',
      rejectionCategory: 'permission_denied',
      durationMs: 9,
      errorCode: 'permission_denied'
    })
  })

  it('upserts running physical calls by physicalCallId without duplicate records', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 4, stepName: '正文层', mode: 'single', skillNames: [] })
    const callId = store.startApiCall(runId, {
      step: 4,
      requestMessages: [{ role: 'user', content: '生成正文' }]
    })
    store.appendPhysicalCall(runId, callId, {
      physicalCallId: 'physical-fixed',
      status: 'running',
      phase: 'normal',
      requestMessages: [{ role: 'user', content: '生成正文' }]
    })
    store.appendPhysicalCall(runId, callId, {
      physicalCallId: 'physical-fixed',
      status: 'success',
      phase: 'normal',
      requestMessages: [{ role: 'user', content: '生成正文' }],
      responseText: '正文返回'
    })
    const call = store.getRun(runId)?.apiCalls.find(item => item.id === callId)!
    expect(call.physicalCalls).toHaveLength(1)
    expect(call.physicalCalls?.[0].status).toBe('success')
    expect(call.physicalCalls?.[0].physicalCallId).toBe('physical-fixed')
    expect(call.physicalCalls?.[0].responseText).toBe('正文返回')
    expect(store.getRun(runId)?.events.filter(event => event.type === 'physical-call')).toHaveLength(2)
    expect(store.getRun(runId)?.events
      .filter(event => event.type === 'physical-call')
      .map(event => ({ level: event.level, label: event.label }))).toEqual([
      { level: 'info', label: '第 1 次物理请求进行中' },
      { level: 'info', label: '第 1 次物理请求完成' },
    ])
  })

  it('rejects non-string stream deltas and records a serialization guard event', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 4, stepName: '正文层', mode: 'single', skillNames: [] })
    const callId = store.startApiCall(runId, {
      step: 4,
      requestMessages: [{ role: 'user', content: '请求' }]
    })

    store.appendStream(runId, callId, { text: '对象 delta' } as unknown as string)

    const call = store.getRun(runId)?.apiCalls[0]!
    expect(call.streamText).toBe('')
    expect(store.getRun(runId)?.events.at(-1)).toMatchObject({
      type: 'stream-serialization-guard',
      level: 'error',
    })
  })

  it('appends a final physical stream delta even after the call reaches a terminal state', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 4, stepName: '正文层', mode: 'single', skillNames: [] })
    const callId = store.startApiCall(runId, {
      step: 4,
      requestMessages: [{ role: 'user', content: '请求' }]
    })
    store.appendStream(runId, callId, '前半')
    store.finishApiCall(runId, callId, {
      status: 'success',
      responseText: '',
    })

    store.appendStream(runId, callId, '后半')

    const call = store.getRun(runId)?.apiCalls[0]!
    expect(call.streamText).toBe('前半后半')
    expect(call.responseText).toBe('前半后半')
  })

  it('normalizes common provider usage shapes without inventing values', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 4, stepName: '正文层', mode: 'single', skillNames: [] })
    const callId = store.startApiCall(runId, {
      step: 4,
      requestMessages: [{ role: 'user', content: '请求' }]
    })
    store.finishApiCall(runId, callId, {
      status: 'success',
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        cacheReadInputTokens: 3,
        reasoningOutputTokens: 2
      }
    })
    expect(store.getRun(runId)?.apiCalls[0].semantic?.usage).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      cacheReadInputTokens: 3,
      reasoningOutputTokens: 2,
      totalTokens: 15
    })
  })

  it('keeps legacy v3 JSON compatible by allowing missing v4 fields', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 2, stepName: '卷纲层', mode: 'single', skillNames: [] })
    const callId = store.startApiCall(runId, {
      step: 2,
      requestMessages: [{ role: 'user', content: '旧结构请求' }]
    })
    store.finishApiCall(runId, callId, { status: 'success', responseText: '旧结构返回' })
    const run = store.getRun(runId)!
    const legacyLike = JSON.parse(JSON.stringify({
      ...run,
      promptSnapshots: undefined,
      processingReports: undefined,
      payloads: undefined,
      apiCalls: run.apiCalls.map(call => ({
        ...call,
        semantic: undefined,
        physicalCalls: undefined,
        toolDefinitions: undefined,
        toolCalls: undefined,
        promptSnapshotIds: undefined,
        processingReportIds: undefined,
        payloadRefs: undefined
      }))
    }))
    const legacyCall = legacyLike.apiCalls[0] as any
    expect(legacyCall.requestMessages[0].content).toBe('旧结构请求')
    expect((store.exportRunToJson(legacyLike as any) as any).apiCalls[0].responseText).toBe('旧结构返回')
  })

  it('exports a schemaVersion so skill authors can detect future trace formats', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ stepName: '卷纲层', mode: 'single', skillNames: [] })
    const exported = store.exportRunToJson(store.getRun(runId)!) as Record<string, unknown>
    expect(exported.schemaVersion).toBe(19)
  })

  it('exports pipeline artifact validation events for all three stages', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ source: 'pipeline', stepName: '生成流水线', mode: 'chain' })
    const eventTypes = [
      'volume-batch-validated',
      'settings-artifact-validated',
      'body-artifact-validated'
    ]
    eventTypes.forEach(type => {
      store.addEvent(runId, {
        type,
        level: 'info',
        label: '产物验收',
        detail: JSON.stringify({ type })
      })
    })
    const run = store.getRun(runId)!
    const exported = store.exportRunToJson(run) as unknown as RunTrace & { schemaVersion: number }

    eventTypes.forEach(type => {
      expect(run.events.some(event => event.type === type)).toBe(true)
      expect(exported.events?.some(event => event.type === type)).toBe(true)
      expect(store.exportRunToText(run)).toContain(type)
    })
    expect(exported.schemaVersion).toBe(19)
  })

  it('keeps a successful final body artifact successful while preserving degraded call evidence', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ source: 'pipeline', stepName: '正文层', mode: 'single' })
    store.addEvent(runId, {
      type: 'api-degraded',
      level: 'warn',
      label: '第 2 次 API 调用完成（降级）',
      detail: 'folder schema validation exhausted'
    })
    store.addEvent(runId, {
      type: 'body-artifact-validated',
      level: 'info',
      label: '正文批次验收通过',
      detail: JSON.stringify({ chapterId: 'ch-1', targetWords: 1200, wordCount: 2091, ratio: 1.74 })
    })
    store.addEvent(runId, {
      type: 'body-artifact-recovered',
      level: 'warn',
      label: '正文中间尝试曾降级，最终产物已通过契约验收',
      detail: JSON.stringify({ degradedApiCalls: 2, finalStatus: 'complete' })
    })
    store.finishRun(runId, 'success', undefined, 'body_generation_complete')

    const run = store.getRun(runId)!
    const exported = store.exportRunToJson(run) as Record<string, unknown>
    expect(run.status).toBe('success')
    expect(run.events.some(event => event.type === 'api-degraded')).toBe(true)
    expect(run.events.some(event => event.type === 'body-artifact-recovered')).toBe(true)
    const stateHistory = exported.stateHistory as Array<{ reason?: string }>
    expect(stateHistory.at(-1)?.reason).toContain('body_generation_complete')
  })

  it('keeps a contract-validated volume artifact successful while preserving degraded call evidence', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ source: 'pipeline', step: 2, stepName: '卷纲层', mode: 'all' })
    store.addEvent(runId, {
      type: 'api-degraded',
      level: 'warn',
      label: '第 4 次 API 调用完成（降级）',
      detail: 'folder schema validation exhausted'
    })
    store.addEvent(runId, {
      type: 'volume-batch-validated',
      level: 'info',
      label: '卷纲批次验收通过',
      detail: JSON.stringify({ mode: 'all', expectedCount: 3, actualCount: 3 })
    })
    store.addEvent(runId, {
      type: 'volume-artifact-recovered',
      level: 'warn',
      label: '卷纲中间尝试曾降级，最终产物已通过契约验收',
      detail: JSON.stringify({ degradedApiCalls: 1, finalStatus: 'complete' })
    })
    store.finishRun(runId, 'success', undefined, 'all_volumes_generation_complete')

    const run = store.getRun(runId)!
    const exported = store.exportRunToJson(run) as Record<string, unknown>
    expect(run.status).toBe('success')
    expect(run.events.some(event => event.type === 'volume-artifact-recovered')).toBe(true)
    const stateHistory = exported.stateHistory as Array<{ reason?: string }>
    expect(stateHistory.at(-1)?.reason).toContain('all_volumes_generation_complete')
  })

  it('preserves raw provider arguments through the tool-call trace export', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'outline',
      stepName: '大纲共创',
      mode: 'direct',
      skillNames: [],
      sessionKind: 'chat',
    })
    store.startTurn(runId, { userRequest: '整理整篇大纲', intent: 'edit' })
    const callId = store.startApiCall(runId, {
      source: 'outline',
      requestMessages: [{ role: 'user', content: '整理整篇大纲' }],
      intent: 'edit',
    })
    store.appendToolCall(runId, callId, {
      name: 'editor.write',
      toolCallId: 'call_bad',
      input: {},
      argumentsRaw: '{"commands":',
      status: 'failed',
    })
    store.finishApiCall(runId, callId, { status: 'success', responseText: '工具参数解析失败' })

    const exported = store.exportRunToJson(store.getRun(runId)!) as unknown as {
      apiCalls?: Array<{ toolCalls?: Array<{ argumentsRaw?: string; input?: unknown }> }>
    }
    expect(exported.apiCalls?.[0]?.toolCalls?.[0]).toMatchObject({
      input: {},
      argumentsRaw: '{"commands":',
    })
  })

  it('records physical, stream, tool, and edit-task activity without firing false stuck warnings', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-09T00:00:00Z'))
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'outline',
      stepName: '大纲共创',
      mode: 'chat',
      sessionKind: 'chat',
      skillNames: []
    })
    store.startTurn(runId, { userRequest: '整理整篇大纲', mode: 'chat' })
    const callId = store.startApiCall(runId, {
      source: 'outline',
      requestMessages: [{ role: 'user', content: '整理整篇大纲' }]
    })

    store.appendPhysicalCall(runId, callId, {
      phase: 'normal',
      status: 'running',
      requestMessages: [{ role: 'user', content: '整理整篇大纲' }]
    })
    store.appendStream(runId, callId, '第一段')
    store.appendToolCall(runId, callId, {
      name: 'editor.write',
      input: { commands: [] },
      status: 'success'
    })
    store.reportEditTaskActivity(runId, {
      taskId: 'edit-task-1',
      status: 'running_batch',
      source: 'outline',
      targetId: 'outline',
      goal: '整理整篇大纲',
      executedBatches: [],
      pendingBatches: ['batch-1'],
      failedBatches: [],
      activeBatchId: 'batch-1',
      executionPlan: {
        goal: '整理整篇大纲',
        batches: ['batch-1'],
        batchDetails: {
          'batch-1': {
            segmentId: 'segment-0001',
            expectedChange: 'reorder-only',
            invariantResult: 'structure-preserved'
          }
        }
      }
    })

    const run = store.getRun(runId)!
    const activity = run.events.filter(event => event.type === 'run-activity')
    expect(activity.map(event => (event.payload as { source: string }).source)).toEqual([
      'physical_call_running',
      'stream_delta',
      'tool_call',
      'edit_task'
    ])
    expect(run.events.some(event => event.type === 'state-stuck-detected')).toBe(false)
    expect(run.events.some(event =>
      event.type === 'edit-task-plan-detail'
      && event.detail?.includes('segmentId=segment-0001')
      && event.detail?.includes('expectedChange=reorder-only')
      && event.detail?.includes('invariantResult=structure-preserved')
    )).toBe(true)
    vi.advanceTimersByTime(600_001)
    expect(run.events.some(event => event.type === 'state-stuck-detected')).toBe(true)
    store.finishRun(runId, 'success')
    vi.useRealTimers()
  })

  describe('single-run trace memory bounds', () => {
    it('bounds one call stream in memory while retaining exact totals and truncation evidence', () => {
      const store = useRunTraceStore()
      const previous = store.setMemoryLimits({ streamMemoryChars: 64 })
      const runId = store.startRun({ step: 3, stepName: '正文层', mode: 'chain', skillNames: ['S1'] })
      const callId = store.startApiCall(runId, {
        step: 3,
        skillId: 'S1',
        requestMessages: [{ role: 'user', content: '生成长文正文' }]
      })

      store.appendStream(runId, callId, '甲'.repeat(60))

      const call = store.getRun(runId)?.apiCalls.find(item => item.id === callId)!
      expect(call.streamText).toHaveLength(60)
      expect(call.streamText).toBe('甲'.repeat(60))
      expect(call.responseText).toBe(call.streamText)
      expect(call.streamTotalChars).toBe(60)
      expect(call.streamTruncated).toBeUndefined()

      store.appendStream(runId, callId, '乙'.repeat(40))
      store.appendStream(runId, callId, '丙'.repeat(140))

      const bounded = store.getRun(runId)?.apiCalls.find(item => item.id === callId)!
      expect(bounded.streamText).toHaveLength(64)
      expect(bounded.streamText).toBe('丙'.repeat(64))
      expect(bounded.streamTotalChars).toBe(240)
      expect(bounded.streamTruncated).toBe(true)
      expect(bounded.streamTruncatedChars).toBe(176)
      expect(store.getRun(runId)?.events.some(event =>
        event.type === 'trace-stream-compacted'
        && event.level === 'warn'
        && event.detail?.includes('chars=100')
      )).toBe(true)
      store.setMemoryLimits(previous)
    })

    it('bounds cumulative streams without regrowing memory and keeps response fallback stable', () => {
      const store = useRunTraceStore()
      const previous = store.setMemoryLimits({ streamMemoryChars: 100 })
      const runId = store.startRun({ source: 'outline', stepName: '大纲共创', mode: 'chat', sessionKind: 'chat', skillNames: [] })
      const callId = store.startApiCall(runId, {
        source: 'outline',
        requestMessages: [{ role: 'user', content: '重排整篇大纲' }]
      })

      store.appendCumulativeStream(runId, callId, 'A'.repeat(100))
      store.appendCumulativeStream(runId, callId, 'A'.repeat(100) + 'B'.repeat(200))

      const call = store.getRun(runId)?.apiCalls.find(item => item.id === callId)!
      expect(call.streamText).toHaveLength(100)
      expect(call.streamTotalChars).toBe(300)
      expect(call.streamTruncated).toBe(true)
      expect(call.streamTruncatedChars).toBe(200)
      expect(call.responseText).toBe(call.streamText)
      expect(call.responseText).not.toBe('A'.repeat(100) + 'B'.repeat(200))
      store.setMemoryLimits(previous)
    })

    it('bounds events per run, evicting old info first and preserving diagnostics', () => {
      const store = useRunTraceStore()
      const previous = store.setMemoryLimits({ maxEvents: 128 })
      const runId = store.startRun({ step: 2, stepName: '卷纲层', mode: 'batch', skillNames: [] })

      store.addEvent(runId, { type: 'diagnostic-keep', level: 'error', label: '早期错误' })
      for (let i = 0; i < 140; i++) {
        store.addEvent(runId, { type: 'noise-' + i, level: 'info', label: '噪声' + i })
      }
      store.addEvent(runId, { type: 'terminal-diagnostics', level: 'warn', label: '终态告警' })

      const run = store.getRun(runId)!
      expect(run.events.length).toBeLessThanOrEqual(129)
      expect(run.events.some(event => event.type === 'diagnostic-keep')).toBe(true)
      expect(run.events.some(event => event.type === 'terminal-diagnostics')).toBe(true)
      expect(run.events.filter(event => event.type?.startsWith('noise-')).length).toBeLessThanOrEqual(127)
      expect(run.eventLedger?.totalEvents).toBe(144)
      expect(run.eventLedger?.droppedInfoEvents).toBeGreaterThanOrEqual(13)
      expect(run.events.some(event => event.type === 'trace-events-compacted')).toBe(true)
      const seqs = run.events.map(event => event.seq).filter((seq): seq is number => typeof seq === 'number')
      expect(seqs).toEqual([...seqs].sort((a, b) => a - b))
      store.setMemoryLimits(previous)
    })
  })
  it('throttles stream activity events while preserving the full stream response', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-09T00:00:00Z'))
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'outline',
      stepName: '大纲共创',
      mode: 'chat',
      sessionKind: 'chat',
      skillNames: []
    })
    const callId = store.startApiCall(runId, {
      source: 'outline',
      requestMessages: [{ role: 'user', content: '整理整篇大纲' }]
    })

    for (let i = 0; i < 80; i++) store.appendStream(runId, callId, '字')
    vi.advanceTimersByTime(1000)
    for (let i = 80; i < 100; i++) store.appendStream(runId, callId, '字')
    vi.advanceTimersByTime(1000)
    for (let i = 100; i < 110; i++) store.appendStream(runId, callId, '字')

    const run = store.getRun(runId)!
    const activity = run.events.filter(event =>
      event.type === 'run-activity'
      && (event.payload as { source?: string } | undefined)?.source === 'stream_delta')
    expect(activity.length).toBeGreaterThan(0)
    expect(activity.length).toBeLessThan(20)
    const call = run.apiCalls.find(item => item.id === callId)!
    expect(call.streamText).toHaveLength(110)
    expect(call.responseText).toHaveLength(110)
    expect(call.lastStreamActivityAt).toBeDefined()
    store.finishRun(runId, 'success')
    vi.setSystemTime(new Date('2026-10-09T00:01:00Z'))
    const continuationCallId = store.startApiCall(runId, {
      source: 'outline',
      requestMessages: [{ role: 'user', content: '继续整理' }]
    })
    for (let i = 0; i < 120; i++) store.appendStream(runId, continuationCallId, '字')
    const continuationCall = store.getRun(runId)!.apiCalls.find(item => item.id === continuationCallId)!
    expect(continuationCall.streamText).toHaveLength(120)
    expect(continuationCall.responseText).toHaveLength(120)
    vi.useRealTimers()
  })

  it('reduces stream activity frequency in safe mode without losing response text', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-24T00:00:00Z'))
    const monitor = new PerformanceMonitor({ now: () => Date.now() })
    setPerformanceMonitorForTests(monitor)
    installResponsivenessProjection()
    monitor.requestSafeMode('test_freeze')

    const store = useRunTraceStore()
    const runId = store.startRun({ source: 'outline', stepName: '大纲共创', mode: 'chat', sessionKind: 'chat', skillNames: [] })
    const callId = store.startApiCall(runId, {
      source: 'outline',
      requestMessages: [{ role: 'user', content: '安全模式流式验证' }]
    })

    for (let i = 0; i < 12; i++) {
      store.appendStream(runId, callId, '字')
      vi.advanceTimersByTime(1000)
    }

    const run = store.getRun(runId)!
    const activity = run.events.filter(event =>
      event.type === 'run-activity'
      && (event.payload as { source?: string } | undefined)?.source === 'stream_delta')
    expect(activity.length).toBeLessThanOrEqual(3)
    const call = run.apiCalls.find(item => item.id === callId)!
    expect(call.streamText).toHaveLength(12)
    expect(call.responseText).toHaveLength(12)

    monitor.exitSafeMode('user_exit')
    setPerformanceMonitorForTests(null)
    store.finishRun(runId, 'success')
    vi.useRealTimers()
  })

  it('throttles tool-argument progress and exposes the latest progress to live UI', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-10T00:00:00Z'))
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'outline',
      stepName: '大纲共创',
      mode: 'chat',
      sessionKind: 'chat',
      skillNames: []
    })
    const callId = store.startApiCall(runId, {
      source: 'outline',
      requestMessages: [{ role: 'user', content: '整理整篇大纲' }]
    })

    for (let i = 1; i <= 80; i++) {
      store.reportToolArgumentProgress(runId, callId, { toolCallCount: 1, argumentCharacters: i * 100 })
    }
    vi.advanceTimersByTime(1000)
    for (let i = 81; i <= 100; i++) {
      store.reportToolArgumentProgress(runId, callId, { toolCallCount: 1, argumentCharacters: i * 100 })
    }

    const run = store.getRun(runId)!
    const activity = run.events.filter(event =>
      event.type === 'run-activity'
      && (event.payload as { source?: string } | undefined)?.source === 'tool_argument_delta')
    expect(activity.length).toBeGreaterThan(0)
    expect(activity.length).toBeLessThan(20)
    const call = run.apiCalls.find(item => item.id === callId)!
    expect(call.lastToolArgumentProgress).toEqual({ toolCallCount: 1, argumentCharacters: 10_000 })
    expect(call.lastExecutionActivityAt).toBe(Date.now())
    store.finishRun(runId, 'success')
    vi.useRealTimers()
  })

  it('records newly planned edit-task batches once with forward-looking metadata', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'outline',
      stepName: '大纲共创',
      mode: 'chat',
      sessionKind: 'chat',
      skillNames: []
    })
    const executionPlan = {
      goal: '清理错误标点并删除重复项',
      batches: ['batch-1'],
      batchDetails: {
        'batch-1': {
          segmentId: 'segment-0001',
          expectedChange: 'normalize',
          invariantResult: 'normalize-changes-punctuation-whitespace-format-only',
          range: { startLine: 1, endLine: 12 },
          writeStrategy: 'replace_match'
        }
      }
    }
    const payload = {
      taskId: 'edit-task-1',
      status: 'running_batch',
      source: 'outline',
      targetId: 'outline',
      goal: '清理错误标点并删除重复项',
      executedBatches: [],
      pendingBatches: ['batch-1'],
      failedBatches: [],
      activeBatchId: 'batch-1',
      executionPlan
    }

    store.reportEditTaskActivity(runId, payload)
    store.reportEditTaskActivity(runId, { ...payload, status: 'awaiting_batch' })
    store.reportEditTaskActivity(runId, {
      ...payload,
      executedBatches: ['batch-1'],
      pendingBatches: ['batch-2'],
      activeBatchId: 'batch-2',
      executionPlan: {
        ...executionPlan,
        batches: ['batch-1', 'batch-2'],
        batchDetails: {
          ...executionPlan.batchDetails,
          'batch-2': {
            segmentId: 'segment-0002',
            expectedChange: 'remove_duplicate',
            invariantResult: 'planned-deletion-only',
            range: { startLine: 13, endLine: 20 },
            writeStrategy: 'delete'
          }
        }
      }
    })

    const run = store.getRun(runId)!
    const planned = run.events.filter(event => event.type === 'edit-task-batch-planned')
    expect(planned).toHaveLength(2)
    expect(planned[0].detail).toContain('taskId=edit-task-1')
    expect(planned[0].detail).toContain('batchId=batch-1')
    expect(planned[0].detail).toContain('segmentId=segment-0001')
    expect(planned[0].detail).toContain('range=1-12')
    expect(planned[0].detail).toContain('writeStrategy=replace_match')
    expect(planned[0].detail).toContain('expectedChange=normalize')
    expect(planned[0].detail).toContain('estimatedBatches=1')
    expect(planned[1].detail).toContain('estimatedBatches=2')
    store.finishRun(runId, 'success')
  })

  it('keeps edit-task planning observable when a task continues in a later turn', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'outline',
      stepName: '大纲共创',
      mode: 'chat',
      sessionKind: 'chat',
      skillNames: []
    })
    const firstTurnId = store.startTurn(runId, { userRequest: '整理第一段', mode: 'chat' })
    const executionPlan = {
      goal: '删除重复项并统一标点',
      batches: ['batch-1'],
      batchDetails: {
        'batch-1': {
          segmentId: 'segment-0001',
          expectedChange: 'remove_duplicate',
          invariantResult: 'planned-deletion-only',
          range: { startLine: 1, endLine: 12 },
          writeStrategy: 'delete'
        }
      }
    }
    const payload = {
      taskId: 'edit-task-1',
      status: 'running_batch',
      source: 'outline',
      targetId: 'outline',
      goal: '删除重复项并统一标点',
      executedBatches: [],
      pendingBatches: ['batch-1'],
      failedBatches: [],
      activeBatchId: 'batch-1',
      executionPlan
    }

    store.reportEditTaskActivity(runId, payload, { turnId: firstTurnId })
    store.finishTurn(runId, firstTurnId, 'success', undefined, 'plain_dialogue_complete')
    const secondTurnId = store.startTurn(runId, { userRequest: '继续删除重复项', mode: 'chat' })
    store.reportEditTaskActivity(runId, { ...payload, status: 'awaiting_batch' }, { turnId: secondTurnId })

    const run = store.getRun(runId)!
    const planned = run.events.filter(event => event.type === 'edit-task-batch-planned')
    expect(planned).toHaveLength(2)
    expect(planned.map(event => event.turnId)).toEqual([firstTurnId, secondTurnId])
    const activity = run.events.filter(event => event.type === 'run-activity' && event.turnId === secondTurnId)
    expect(activity).toHaveLength(1)
    const planDetail = run.events.filter(event => event.type === 'edit-task-plan-detail')
    expect(planDetail.map(event => event.turnId)).toEqual([firstTurnId, secondTurnId])
    store.finishRun(runId, 'success')
  })

  it('records long physical requests and terminal merge as distinct run semantics without duplication', () => {
    vi.useFakeTimers()
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'outline',
      stepName: '大纲共创',
      mode: 'chat',
      sessionKind: 'chat',
      skillNames: []
    })
    store.startTurn(runId, { userRequest: '整理整篇大纲', mode: 'chat' })
    const callId = store.startApiCall(runId, {
      source: 'outline',
      requestMessages: [{ role: 'user', content: '整理整篇大纲' }]
    })

    store.appendPhysicalCall(runId, callId, {
      physicalCallId: 'physical-1',
      phase: 'normal',
      status: 'running',
      requestMessages: [{ role: 'user', content: '整理整篇大纲' }]
    })
    store.appendPhysicalCall(runId, callId, {
      physicalCallId: 'physical-1',
      phase: 'normal',
      status: 'running',
      heartbeat: true,
      requestMessages: [{ role: 'user', content: '整理整篇大纲' }]
    })
    store.appendPhysicalCall(runId, callId, {
      physicalCallId: 'physical-2',
      phase: 'tool_iteration',
      status: 'running',
      requestMessages: [{ role: 'user', content: '继续读取下一批' }]
    })

    const run = store.getRun(runId)!
    const longRequests = run.events.filter(event => event.type === 'long-request-in-progress')
    expect(longRequests).toHaveLength(2)
    expect(longRequests[0].detail).toContain('physicalCall=1')
    expect(longRequests[1].detail).toContain('physicalCall=2')
    expect(run.events.some(event => event.type === 'awaiting-terminal-merge')).toBe(false)

    const executionPlan = {
      goal: '整理整篇大纲',
      batches: ['batch-1'],
      batchDetails: {
        'batch-1': {
          segmentId: 'segment-0001',
          expectedChange: 'reorder-only',
          invariantResult: 'structure-preserved'
        }
      }
    }
    store.reportEditTaskActivity(runId, {
      taskId: 'edit-task-1',
      status: 'running_batch',
      source: 'outline',
      targetId: 'outline',
      goal: '整理整篇大纲',
      executedBatches: [],
      pendingBatches: ['batch-1'],
      failedBatches: [],
      activeBatchId: 'batch-1',
      executionPlan
    })
    store.reportEditTaskActivity(runId, {
      taskId: 'edit-task-1',
      status: 'awaiting_batch',
      source: 'outline',
      targetId: 'outline',
      goal: '整理整篇大纲',
      executedBatches: ['batch-1'],
      pendingBatches: [],
      failedBatches: [],
      executionPlan
    })
    store.reportEditTaskActivity(runId, {
      taskId: 'edit-task-1',
      status: 'awaiting_batch',
      source: 'outline',
      targetId: 'outline',
      goal: '整理整篇大纲',
      executedBatches: ['batch-1'],
      pendingBatches: [],
      failedBatches: [],
      executionPlan
    })

    const terminalMerges = run.events.filter(event => event.type === 'awaiting-terminal-merge')
    expect(terminalMerges).toHaveLength(1)
    expect(terminalMerges[0].detail).toContain('taskId=edit-task-1')
    expect(terminalMerges[0].detail).toContain('batches=1/1')
    vi.advanceTimersByTime(600_001)
    expect(run.events.some(event => event.type === 'state-stuck-detected')).toBe(true)
    store.finishRun(runId, 'success')
    vi.useRealTimers()
  })

  it('records edit task completion verification and violations', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ stepName: '大纲共创', mode: 'chain', skillNames: ['S1'] })

    store.reportEditTaskCompletion(runId, {
      verified: true,
      invariant: 'planned-deletion-only',
      violations: [],
    })
    store.reportEditTaskCompletion(runId, {
      verified: false,
      invariant: 'planned-deletion-only',
      violations: [{
        code: 'planned_deletion_not_removed',
        message: '计划删除目标仍然存在：重复段落',
        batchId: 'batch-1',
        target: '重复段落',
        beforeCount: 2,
        afterCount: 2,
      }],
    }, { turnId: null })

    const run = store.getRun(runId)!
    const verified = run.events.find(event => event.type === 'edit-task-completion-verified')
    const violation = run.events.find(event => event.type === 'edit-task-completion-violation')
    expect(verified?.level).toBe('info')
    expect(violation?.level).toBe('warn')
    expect(violation?.detail).toContain('batchId=batch-1')
    expect(violation?.detail).toContain('target=重复段落')
    expect(violation?.detail).toContain('before=2')
    expect(violation?.detail).toContain('after=2')
    store.finishRun(runId, 'success')
  })

  it('keeps logical initial requests separate from tool-round deltas', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ stepName: '大纲共创', mode: 'chain', skillNames: ['S1'] })
    const callId = store.startApiCall(runId, {
      skillName: 'S1',
      requestMessages: [
        { role: 'system', content: '初始系统提示' },
        { role: 'user', content: '初始用户请求' }
      ]
    })
    store.setApiCallToolRequestDeltas(runId, callId, [
      { role: 'system', content: '初始系统提示' },
      { role: 'user', content: '初始用户请求' },
      { role: 'assistant', content: '' },
      { role: 'tool', content: '{"ok":true}' }
    ])
    const call = store.getRun(runId)!.apiCalls[0]
    expect(call.requestMessages).toHaveLength(2)
    expect(call.toolRequestDeltas).toHaveLength(4)
    expect(call.toolRequestDeltas?.[2]).toEqual({ role: 'assistant', content: '' })
  })

  it('keeps unknown event types and processing processors readable when old traces meet schema v8', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ source: 'pipeline', step: 2, stepName: '卷纲层', mode: 'chain' })
    store.addEvent(runId, {
      type: 'chain-handoff-delivery',
      level: 'info',
      label: '历史事件兼容',
      detail: '{"delivery":"structured_summary"}'
    })
    store.attachProcessingReport(runId, {
      stage: 'post',
      processor: 'chain-handoff',
      status: 'success',
      startedAt: Date.now()
    })
    const run = store.getRun(runId)!
    expect(run.events.some(event => event.type === 'chain-handoff-delivery')).toBe(true)
    expect(run.processingReports?.some(report => report.processor === 'chain-handoff')).toBe(true)
    expect((store.exportRunToJson(run) as Record<string, unknown>).schemaVersion).toBe(19)
  })

  it('records the requested and actual tool surface separately', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      stepName: '大纲共创',
      mode: 'direct',
      skillNames: [],
      sessionKind: 'chat',
    })
    const turnId = store.startTurn(runId, {
      userRequest: '直接写入大纲',
      writeMode: 'direct',
      toolSurface: [{ name: 'editor.write', policy: 'write' }],
      actualToolSurface: [{ name: 'editor.write', policy: 'write' }],
    })
    store.finishTurn(runId, turnId, 'success')
    const exported = store.exportRunToJson(store.getRun(runId)!) as unknown as {
      turns?: Array<{ toolSurface?: string[]; actualToolSurface?: string[] }>
    }
    const turn = exported.turns?.[0]
    expect(turn?.toolSurface).toEqual([{ name: 'editor.write', policy: 'write' }])
    expect(turn?.actualToolSurface).toEqual([{ name: 'editor.write', policy: 'write' }])
  })

  it('exports live chat runs as an explicit open-session snapshot without synthesizing a terminal status', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'home',
      stepName: '主页对话',
      mode: 'chat',
      sessionKind: 'chat',
      skillNames: []
    })
    const turnId = store.startTurn(runId, { userRequest: '完成轮', mode: 'chat' })
    store.finishTurn(runId, turnId, 'success')
    const exported = store.exportRunToJson(store.getRun(runId)!) as unknown as {
      status: string
      endedAt?: number
      durationMs?: number
      stateHistory?: Array<{ fromStatus: string; toStatus: string; reason?: string }>
    }
    expect(exported.status).toBe('running')
    expect(exported.endedAt).toBeUndefined()
    expect(exported.durationMs).toBeUndefined()
    expect(exported.stateHistory?.some(item => item.reason === 'export_snapshot_synthesized_from_last_turn')).toBe(false)
  })

  it('does not mutate the live run while exporting an in-flight chat trace', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'home',
      stepName: '主页对话',
      mode: 'chat',
      sessionKind: 'chat',
      skillNames: [],
    })
    const turnId = store.startTurn(runId, { userRequest: '全文重排', mode: 'chat' })
    const liveRun = store.getRun(runId)!

    store.exportRunToJson(liveRun)

    expect(liveRun.currentTurnId).toBe(turnId)
    store.addEvent(runId, { type: 'stream-activity', level: 'info', label: '流式活动' })
    expect(liveRun.events.at(-1)?.turnId).toBe(turnId)

    // Spread order regression: a caller that explicitly passes
    // `turnId: undefined` (a common reportRunActivity shape) must not erase
    // the active-turn fallback above.
    store.addEvent(runId, {
      type: 'undefined-turn-activity',
      level: 'info',
      label: '显式空轮事件',
      turnId: undefined,
    })
    expect(liveRun.events.at(-1)?.turnId).toBe(turnId)

    // The historical mutation path must also stay recoverable: even if a
    // transient pointer is lost, an event emitted during a running turn still
    // belongs to that turn instead of becoming run-level noise.
    liveRun.currentTurnId = undefined
    store.addEvent(runId, { type: 'late-stream-activity', level: 'info', label: '迟到的流式活动' })
    expect(liveRun.events.at(-1)?.turnId).toBe(turnId)
  })

  it('keeps the last failed or partially applied chat turn visible in export snapshots', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'home',
      stepName: '主页对话',
      mode: 'chat',
      sessionKind: 'chat',
      skillNames: []
    })
    const turnId = store.startTurn(runId, { userRequest: '统一时间线', mode: 'chat' })
    store.finishTurn(runId, turnId, 'partially_applied', '批次 2 失败，已写入 2/4', 'edit_task_batch_failed')

    const exported = store.exportRunToJson(store.getRun(runId)!) as unknown as RunTrace

    expect(exported.status).toBe('running')
    expect(exported.turns?.at(-1)?.status).toBe('partially_applied')
    expect(exported.turns?.at(-1)?.reason).toBe('edit_task_batch_failed')
    expect(exported.stateHistory?.some(item => item.reason === 'export_snapshot_synthesized_from_last_turn')).toBe(false)
  })

  it('describes EditTask terminal statuses in run and turn labels', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'outline',
      stepName: '大纲共创',
      mode: 'chat',
      sessionKind: 'chat',
      skillNames: []
    })
    const turnId = store.startTurn(runId, { userRequest: '重排大纲', mode: 'chat' })
    store.finishTurn(runId, turnId, 'failed_after_write', '批次已写入但任务失败', 'edit_task_failed_after_write')
    store.finishRun(runId, 'failed_after_write', '任务写入后失败', 'edit_task_failed_after_write')

    const run = store.getRun(runId)!
    expect(run.turns?.at(-1)?.status).toBe('failed_after_write')
    expect(run.status).toBe('failed_after_write')
    expect(run.events.some(event => event.type === 'turn-finished' && event.label.includes('写入后失败'))).toBe(true)
    expect(run.events.some(event => event.type === 'finished' && event.label.includes('写入后失败'))).toBe(true)
  })

  it('does not reject generation when run trace persistence fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 2, stepName: '卷纲层', mode: 'single', skillNames: [] })

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        electronAPI: {
          runTraceSave: vi.fn(async () => {
            throw new Error('disk full')
          })
        }
      }
    })
    store.finishRun(runId, 'success')
    await new Promise(resolve => setTimeout(resolve, 0))

    const run = store.getRun(runId)!
    expect(run.events.some(event => event.type === 'autosave-failed' && event.detail?.includes('disk full'))).toBe(true)
    consoleError.mockRestore()
  })

  it('restores terminal runs and marks persisted active runs interrupted without hijacking pointers', async () => {
    const terminal = {
      id: 'run-restored-terminal',
      source: 'pipeline',
      sourceName: '生成流水线',
      mode: 'single',
      status: 'success',
      startedAt: 1770000000000,
      events: [],
      apiCalls: [{ id: 'call-restored', seq: 1, requestMessages: [], responseText: '响应', streamText: '', reasoningText: '' }]
    }
    const running = { ...terminal, id: 'run-restored-running', startedAt: 1770000001000, status: 'running' }
    const runTraceList = vi.fn(async (source: string) => ({
      success: true,
      runs: source === 'pipeline'
        ? [
            { dirName: 'run-running', status: running.status },
            { dirName: 'run-terminal', status: terminal.status }
          ]
        : []
    }))
    const runTraceRead = vi.fn(async (payload: { dirName: string }) => ({
      success: true,
      run: payload.dirName === 'run-terminal' ? terminal : running
    }))
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { electronAPI: { runTraceList, runTraceRead } }
    })

    const store = useRunTraceStore()
    const activeRunId = store.startRun({ step: 2, stepName: '卷纲层', mode: 'single', skillNames: [] })
    const result = await store.restorePersistedRuns()

    expect(result).toEqual({ restored: 2, skipped: 0 })
    expect(runTraceRead).toHaveBeenCalledTimes(2)
    const restored = store.getRun('run-restored-terminal')
    expect(restored?.dirName).toBe('run-terminal')
    const interrupted = store.getRun('run-restored-running')
    expect(interrupted?.status).toBe('interrupted')
    expect(interrupted?.endedAt).toBeTypeOf('number')
    expect(interrupted?.events.some(event => event.type === 'run-startup-interrupted')).toBe(true)
    expect(store.getRunId('pipeline')).toBe(activeRunId)
    expect(store.getLastRunId('pipeline')).toBe(activeRunId)
  })

  it('keeps event seq monotonic without scanning restored events on every append', async () => {
    const restored = {
      id: 'run-restored-seq',
      source: 'outline',
      sourceName: '大纲共创',
      mode: 'chat',
      status: 'success',
      startedAt: 1770000000000,
      events: [
        { id: 'event-7', ts: 1770000000001, seq: 7, level: 'info', type: 'restored', label: '历史事件 7' },
        { id: 'event-41', ts: 1770000000002, seq: 41, level: 'info', type: 'restored', label: '历史事件 41' }
      ],
      apiCalls: []
    }
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        electronAPI: {
          runTraceList: vi.fn(async (source: string) => ({
            success: true,
            runs: source === 'outline' ? [{ dirName: 'run-restored-seq' }] : []
          })),
          runTraceRead: vi.fn(async () => ({ success: true, run: restored }))
        }
      }
    })

    const store = useRunTraceStore()
    await store.restorePersistedRuns()
    store.addEvent('run-restored-seq', { type: 'post-restore', level: 'info', label: '恢复后事件' })

    const run = store.getRun('run-restored-seq')!
    expect(run.events.at(-1)?.seq).toBe(42)

    const events: Array<{ seq?: number }> = []
    Object.defineProperty(run, 'events', {
      configurable: true,
      get() {
        return events
      },
      set(value: Array<{ seq?: number }>) {
        events.splice(0, events.length, ...value)
      }
    })
    for (let index = 0; index < 1000; index += 1) {
      store.addEvent('run-restored-seq', { type: `bulk-${index}`, level: 'info', label: `批量事件 ${index}` })
    }
    expect(events.at(-1)?.seq).toBe(1043)
  })

  it('persists long-running streams with a debounced snapshot save', async () => {
    vi.useFakeTimers()
    const runTraceSave = vi.fn(async (_payload: unknown) => ({ success: true, dirName: 'run-1' }))
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 2, stepName: '卷纲层', mode: 'single', skillNames: [] })
    const callId = store.startApiCall(runId, {
      requestMessages: [{ role: 'user', content: '生成长卷纲' }]
    })

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { electronAPI: { runTraceSave } }
    })

    store.appendStream(runId, callId, '第一段')
    store.appendStream(runId, callId, '第二段')
    expect(runTraceSave).toHaveBeenCalledTimes(0)

    await vi.advanceTimersByTimeAsync(5000)
    expect(runTraceSave).toHaveBeenCalledTimes(1)
    const savedPayload = runTraceSave.mock.calls[0]?.[0] as
      | { run?: { apiCalls?: Array<{ streamText?: string }> } }
      | undefined
    expect(savedPayload?.run?.apiCalls?.[0]?.streamText).toBe('第一段第二段')

    store.appendStream(runId, callId, '第三段')
    store.finishApiCall(runId, callId, { status: 'success', responseText: '第一段第二段第三段' })
    await vi.advanceTimersByTimeAsync(0)
    expect(runTraceSave).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(10000)
    expect(runTraceSave).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('cancels pending stream saves when a run is removed', async () => {
    vi.useFakeTimers()
    const runTraceSave = vi.fn(async () => ({ success: true, dirName: 'run-2' }))
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 2, stepName: '卷纲层', mode: 'single', skillNames: [] })
    const callId = store.startApiCall(runId, {
      requestMessages: [{ role: 'user', content: '生成长卷纲' }]
    })

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { electronAPI: { runTraceSave } }
    })

    store.appendStream(runId, callId, '流式内容')
    store.removeRun(runId)
    await vi.advanceTimersByTimeAsync(10000)
    expect(runTraceSave).toHaveBeenCalledTimes(0)
    vi.useRealTimers()
  })

  it('keeps a terminal physical stream delta when the call has no final response', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 2, stepName: '卷纲层', mode: 'single', skillNames: [] })
    const callId = store.startApiCall(runId, {
      requestMessages: [{ role: 'user', content: '生成长卷纲' }]
    })

    store.appendStream(runId, callId, '运行中流式')
    store.finishApiCall(runId, callId, { status: 'success', responseText: '', durationMs: 100 })
    store.appendStream(runId, callId, '迟到 delta')

    const call = store.getRun(runId)!.apiCalls.find(item => item.id === callId)!
    expect(call.streamText).toBe('运行中流式迟到 delta')
    expect(call.responseText).toBe('运行中流式迟到 delta')
  })

  it('keeps stream fallback text when a terminal patch sends an empty response', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ stepName: '大纲工作台', mode: 'direct', skillNames: [] })
    const callId = store.startApiCall(runId, {
      requestMessages: [{ role: 'user', content: '整理大纲' }]
    })

    store.appendStream(runId, callId, '完整流式回复')
    store.finishApiCall(runId, callId, { status: 'success', responseText: '', durationMs: 100 })

    const call = store.getRun(runId)!.apiCalls.find(item => item.id === callId)!
    expect(call.responseText).toBe('完整流式回复')
    expect(call.streamText).toBe('完整流式回复')
    expect(store.exportRunToJson(store.getRun(runId)!)).toMatchObject({
      apiCalls: [{ responseText: '完整流式回复' }]
    })
  })

  it('backfills a late terminal physical response after the API call already finished', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'outline',
      stepName: '大纲工作台',
      mode: 'direct',
      skillNames: [],
      sessionKind: 'chat'
    })
    const turnId = store.startTurn(runId, { userRequest: '整理大纲', mode: 'direct' })
    const callId = store.startApiCall(runId, {
      turnId,
      requestMessages: [{ role: 'user', content: '整理大纲' }]
    })

    store.finishApiCall(runId, callId, { status: 'success', responseText: '', durationMs: 100 })
    store.appendPhysicalCall(runId, callId, {
      requestMessages: [{ role: 'user', content: '整理大纲' }],
      responseText: '迟到的终态物理响应'
    })
    store.finishTurn(runId, turnId, 'success')

    const call = store.getRun(runId)!.apiCalls.find(item => item.id === callId)!
    expect(call.turnId).toBe(turnId)
    expect(call.responseText).toBe('迟到的终态物理响应')
    expect(call.physicalCalls?.at(-1)?.responseText).toBe('迟到的终态物理响应')
    expect(store.exportRunToJson(store.getRun(runId)!)).toMatchObject({
      apiCalls: [{ responseText: '迟到的终态物理响应' }]
    })
  })

  it('keeps pipeline runs task-scoped and unaffected by turn APIs', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 2, stepName: '卷纲层', mode: 'single', skillNames: ['卷纲技能'] })
    const turnId = store.startTurn(runId, { userRequest: '不应产生轮次' })
    const callId = store.startApiCall(runId, {
      step: 2,
      requestMessages: [{ role: 'user', content: '流水线请求' }]
    })
    store.finishApiCall(runId, callId, { status: 'success', responseText: '卷纲返回' })
    store.finishRun(runId, 'success')

    const run = store.getRun(runId)
    expect(turnId).toBe('')
    expect(run?.sessionKind).toBe('task')
    expect(run?.turns).toBeUndefined()
    expect(run?.events.some(event => event.turnId)).toBe(false)
  })

  it('marks awaiting-user runs and resumes their watchdog on the next turn', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'home',
      stepName: '主页共创',
      mode: 'chat',
      sessionKind: 'chat',
      skillNames: []
    })
    store.startAwaitingUser(runId, 'awaiting_user')
    store.startTurn(runId, { userRequest: '确认执行' })
    store.finishAwaitingUser(runId, 'next_turn:确认执行')

    const run = store.getRun(runId)!
    expect(run.status).toBe('running')
    expect(run.events.map(event => event.label)).toEqual([
      expect.stringContaining('开始'),
      '运行进入等待用户确认',
      '等待用户确认已恢复',
    ])
  })

  it('ignores waiting-user resumes for runs that never waited', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'home',
      stepName: '主页共创',
      mode: 'chat',
      sessionKind: 'chat',
      skillNames: []
    })
    store.startTurn(runId, { userRequest: '普通继续对话' })
    store.finishAwaitingUser(runId, 'next_turn:普通继续对话')

    const run = store.getRun(runId)!
    expect(run.status).toBe('running')
    expect(run.events.some(event => event.label === '等待用户确认已恢复')).toBe(false)
  })

  it('refreshes the timeout hint and watchdog for each chat turn', () => {
    vi.useFakeTimers()
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'home',
      stepName: '主页共创',
      mode: 'direct',
      sessionKind: 'chat',
      skillNames: [],
      timeoutHint: { active: 600_000 },
    })
    store.startTurn(runId, { userRequest: '整理长文', timeoutHint: { active: 3_600_000 } })

    vi.advanceTimersByTime(600_001)
    let run = store.getRun(runId)!
    expect(run.timeoutHint).toEqual({ active: 3_600_000 })
    expect(run.events.some(event => event.type === 'state-stuck-detected')).toBe(false)

    store.startAwaitingUser(runId, 'waiting')
    store.startTurn(runId, { userRequest: '继续讨论', timeoutHint: { active: 600_000 } })
    store.finishAwaitingUser(runId, 'next_turn:继续讨论')
    vi.advanceTimersByTime(600_001)
    run = store.getRun(runId)!
    expect(run.timeoutHint).toEqual({ active: 600_000 })
    expect(run.events.some(event => event.type === 'state-stuck-detected')).toBe(true)
    vi.useRealTimers()
  })

  it('persists application-authored fallback text origin through export', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'outline',
      stepName: '大纲工作台',
      mode: 'direct',
      sessionKind: 'chat',
      skillNames: []
    })
    const callId = store.startApiCall(runId, {
      source: 'outline',
      requestMessages: [{ role: 'user', content: '整理全文' }],
      intent: 'edit'
    })
    store.finishApiCall(runId, callId, {
      status: 'failed',
      responseText: '本轮未完整执行写入计划：任务级物理请求安全网已达到。',
      finishReason: 'physical_request_budget_exhausted',
      textOrigin: 'application'
    })

    const call = store.getRun(runId)?.apiCalls[0]
    expect(call?.textOrigin).toBe('application')
    const exported = store.exportRunToJson(store.getRun(runId)!) as unknown as {
      apiCalls?: Array<{ textOrigin?: string }>
    }
    expect(exported.apiCalls?.[0]?.textOrigin).toBe('application')
  })

  it('records unified batch events in the active chat run and exports them', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'outline',
      stepName: '大纲共创',
      mode: 'chat',
      skillNames: [],
      sessionKind: 'chat'
    })
    const turnId = store.startTurn(runId, { userRequest: '修改第一卷' })

    store.addBatchEvent('outline', {
      version: 1,
      batchId: 'batch-1',
      workspace: 'outline',
      targetId: 'outline',
      status: 'applied',
      commandCount: 2,
      reason: '用户确认',
      occurredAt: Date.now()
    })

    const run = store.getRun(runId)!
    const event = run.events.find(item => item.type === 'batch_event')
    expect(event?.batchEvent?.batchId).toBe('batch-1')
    expect(event?.turnId).toBe(turnId)
    expect(store.exportRunToText(run)).toContain('AI 批次applied')
    expect(JSON.stringify(store.exportRunToJson(run))).toContain('batch_event')
  })

  it('records offline batch events after a run reaches a terminal state but drops source events', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      source: 'outline',
      stepName: '大纲共创',
      mode: 'chat',
      skillNames: [],
      sessionKind: 'chat'
    })
    store.startTurn(runId, { userRequest: '修改第一卷' })
    store.finishRun(runId, 'failed')

    store.addBatchEvent('outline', {
      version: 1,
      batchId: 'late-rollback',
      workspace: 'outline',
      targetId: 'outline',
      status: 'rolled_back',
      commandCount: 2,
      reason: '已回滚大纲 AI 批次',
      occurredAt: Date.now()
    })
    store.addSourceEvent('outline', {
      type: 'batch_event',
      level: 'warn',
      label: '迟到来源事件'
    })

    const run = store.getRun(runId)!
    const lateBatch = run.events.find(item => item.batchEvent?.batchId === 'late-rollback')
    expect(lateBatch?.batchEvent?.status).toBe('rolled_back')
    expect(String(lateBatch?.detail)).toContain('offline=true')
    expect(run.events.some(item => item.label === '迟到来源事件')).toBe(false)
  })

  it('does not crash when an offline batch event has no recorded run', () => {
    const store = useRunTraceStore()
    store.clearRuns()

    store.addBatchEvent('outline', {
      version: 1,
      batchId: 'orphan-batch',
      workspace: 'outline',
      targetId: 'outline',
      status: 'rolled_back',
      commandCount: 1,
      reason: '无历史 run',
      occurredAt: Date.now()
    })

    expect(store.runs.length).toBe(0)
  })

  it('exports folder diagnostics status for run-level aggregation', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 2, stepName: '卷纲层', mode: 'continue', skillNames: ['文件夹技能'] })
    store.appendFolderDiagnostics(runId, { status: 'success', diagnostics: [] })
    store.appendFolderDiagnostics(runId, { status: 'degraded', diagnostics: [] })

    expect(folderDiagnosticsStatus(store.getRun(runId)!.folderDiagnostics || [])).toBe('degraded')

    store.appendFolderDiagnostics(runId, { status: 'failed', diagnostics: [] })
    expect(folderDiagnosticsStatus(store.getRun(runId)!.folderDiagnostics || [])).toBe('failed')
  })

  it('records and resets body feedback audits on the active pipeline run', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({
      step: 4,
      stepName: '正文层',
      mode: 'chain',
      skillNames: ['S1', 'S2', 'S3']
    })

    store.recordBodyFeedbackAudit({
      schema: {
        candidateChars: 12000,
        feedbackChars: 800,
        anchorCount: 3,
        previewChars: 240,
        suppressedCandidateChars: 11200
      }
    })
    store.recordBodyFeedbackAudit({
      finalStep: {
        sourceCounts: { errors: 2, anchors: 3 },
        length: 640
      }
    })

    const audits = store.getBodyFeedbackAudits(runId)
    expect(audits).toEqual([
      {
        schema: {
          candidateChars: 12000,
          feedbackChars: 800,
          anchorCount: 3,
          previewChars: 240,
          suppressedCandidateChars: 11200
        },
        finalStep: null
      },
      {
        schema: null,
        finalStep: {
          sourceCounts: { errors: 2, anchors: 3 },
          length: 640
        }
      }
    ])

    const run = store.getRun(runId)!
    expect(run.events.filter(event => event.type === 'body-feedback-audit')).toHaveLength(2)
    expect(JSON.stringify(store.exportRunToJson(run))).toContain('body-feedback-audit')

    store.resetBodyFeedbackAudits(runId)
    expect(store.getBodyFeedbackAudits(runId)).toEqual([])
  })
})
