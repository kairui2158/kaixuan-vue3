import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useRunTraceStore } from './runTrace'

describe('runTrace integrity', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('skips empty physical payloads and preserves the diagnostic marker', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 2, stepName: '卷纲层', mode: 'chain', skillNames: ['S1'] })
    const callId = store.startApiCall(runId, {
      step: 2,
      requestMessages: [{ role: 'user', content: '生成卷纲' }]
    })

    const emptyPhysicalId = store.appendPhysicalCall(runId, callId, {
      phase: 'tool_iteration',
      requestMessages: [{ role: 'assistant', content: '' }]
    })
    const normalPhysicalId = store.appendPhysicalCall(runId, callId, {
      phase: 'tool_iteration',
      requestMessages: [{ role: 'user', content: '正常物理请求' }],
      responseText: '正常物理返回'
    })

    expect(emptyPhysicalId).toBe('')
    expect(normalPhysicalId).not.toBe('')
    const call = store.getRun(runId)!.apiCalls[0]
    expect(call.physicalCalls).toHaveLength(1)
    expect(call.physicalCalls?.[0].requestMessages[0].content).toBe('正常物理请求')
    expect(call.integrity).toEqual({
      physicalSkipped: true,
      physicalSkipReason: 'empty-payload'
    })
  })

  it('marks failed calls that never reached a physical request without inventing data', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 2, stepName: '卷纲层', mode: 'chain', skillNames: ['S1'] })
    const callId = store.startApiCall(runId, {
      step: 2,
      requestMessages: [{ role: 'user', content: '生成卷纲' }]
    })

    store.finishApiCall(runId, callId, { status: 'failed', error: '网络中断' })

    const call = store.getRun(runId)!.apiCalls[0]
    expect(call.status).toBe('failed')
    expect(call.physicalCalls || []).toHaveLength(0)
    expect(call.integrity).toEqual({
      physicalMissing: true,
      physicalMissingReason: 'failure-before-physical-request'
    })
  })

  it('does not mark successful calls as missing physical data', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ step: 2, stepName: '卷纲层', mode: 'chain', skillNames: ['S1'] })
    const callId = store.startApiCall(runId, {
      step: 2,
      requestMessages: [{ role: 'user', content: '生成卷纲' }]
    })

    store.finishApiCall(runId, callId, { status: 'success', responseText: '返回' })

    expect(store.getRun(runId)!.apiCalls[0].integrity).toBeUndefined()
  })
})
