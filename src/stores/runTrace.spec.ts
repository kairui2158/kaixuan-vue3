import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useRunTraceStore } from './runTrace'

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

  it('marks an abandoned running run as failed before starting a new one', () => {
    const store = useRunTraceStore()
    const first = store.startRun({ step: 2, stepName: '卷纲层', mode: 'single', skillNames: [] })
    const second = store.startRun({ step: 3, stepName: '章节层', mode: 'batch', skillNames: [] })

    expect(store.getRun(first)?.status).toBe('failed')
    expect(store.getRun(first)?.error).toContain('未正常结束')
    expect(store.getRun(second)?.status).toBe('running')
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
    const exported = store.exportRunToJson(run) as typeof run
    const json = JSON.stringify(exported)
    expect(json).not.toContain('abcdef123456')
    expect(json).not.toContain('sk-test-1234567890')
    expect(json).toContain('test-model')
  })
})
