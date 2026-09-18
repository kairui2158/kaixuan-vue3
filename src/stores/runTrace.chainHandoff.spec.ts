import { beforeEach, describe, expect, it } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useRunTraceStore } from './runTrace'

describe('runTrace chain handoff processing report', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('stores the full handoff output and reports it as a processing event', () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ source: 'pipeline', step: 2, stepName: '卷纲层', mode: 'chain' })
    const output = '上一步完整输出'.repeat(120)
    const startedAt = Date.now()
    const reportId = store.attachProcessingReport(runId, {
      stage: 'post',
      processor: 'chain-handoff',
      status: 'success',
      inputPreview: '上游输入预览',
      outputPreview: output.slice(0, 100),
      output,
      startedAt,
      endedAt: startedAt + 10,
      durationMs: 10,
    })

    const run = store.runs[0]
    const report = run.processingReports?.find(item => item.id === reportId)
    expect(report).toMatchObject({
      stage: 'post',
      processor: 'chain-handoff',
      status: 'success',
      output,
    })
    expect(run.events.some(event => event.type === 'processing-report')).toBe(true)
  })
})
