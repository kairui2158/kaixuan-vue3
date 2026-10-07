import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { folderDiagnosticsStatus, useRunTraceStore } from './runTrace'
import type { RunTrace } from './runTrace'

describe('runTrace store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
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

  it('marks an abandoned running run as failed before starting a new one', () => {
    const store = useRunTraceStore()
    const first = store.startRun({ step: 2, stepName: '卷纲层', mode: 'single', skillNames: [] })
    const second = store.startRun({ step: 3, stepName: '章节层', mode: 'batch', skillNames: [] })

    expect(store.getRun(first)?.status).toBe('failed')
    expect(store.getRun(first)?.error).toContain('未正常结束')
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

  it('abandons stale runs only in the same source', () => {
    const store = useRunTraceStore()
    const firstPipeline = store.startRun({ source: 'pipeline', step: 1, stepName: '设定层', mode: 'single', skillNames: [] })
    const outline = store.startRun({ source: 'outline', stepName: '大纲共创', mode: 'chat', skillNames: [] })
    const secondPipeline = store.startRun({ source: 'pipeline', step: 2, stepName: '卷纲层', mode: 'single', skillNames: [] })

    expect(store.getRun(firstPipeline)?.status).toBe('failed')
    expect(store.getRun(outline)?.status).toBe('running')
    expect(store.getRun(secondPipeline)?.status).toBe('running')
  })

  it('marks unmounted source runs failed without breaking other sources', () => {
    const store = useRunTraceStore()
    const outline = store.startRun({ source: 'outline', stepName: '大纲共创', mode: 'chat', skillNames: [] })
    const home = store.startRun({ source: 'home', stepName: '主页对话', mode: 'chat', skillNames: [] })

    store.abandonRunningRun('outline')

    expect(store.getRun(outline)?.status).toBe('failed')
    expect(store.getRun(home)?.status).toBe('running')
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
      maxTokens: 8192
    })
    store.appendStream(runId, callId, 'A'.repeat(600))
    store.appendStream(runId, callId, 'B'.repeat(600))
    store.finishApiCall(runId, callId, {
      status: 'success',
      responseText: 'R'.repeat(1500),
      finishReason: 'stop',
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
    expect(exported.schemaVersion).toBe(15)
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
    expect((store.exportRunToJson(run) as Record<string, unknown>).schemaVersion).toBe(15)
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
      responseText: '本轮未完整执行写入计划：任务级物理请求预算已耗尽。',
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

  it('exports folder diagnostics status for run-level aggregation', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 2, stepName: '卷纲层', mode: 'continue', skillNames: ['文件夹技能'] })
    store.appendFolderDiagnostics(runId, { status: 'success', diagnostics: [] })
    store.appendFolderDiagnostics(runId, { status: 'degraded', diagnostics: [] })

    expect(folderDiagnosticsStatus(store.getRun(runId)!.folderDiagnostics || [])).toBe('degraded')

    store.appendFolderDiagnostics(runId, { status: 'failed', diagnostics: [] })
    expect(folderDiagnosticsStatus(store.getRun(runId)!.folderDiagnostics || [])).toBe('failed')
  })
})
