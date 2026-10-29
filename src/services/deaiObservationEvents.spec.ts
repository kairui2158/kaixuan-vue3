import { describe, expect, it } from 'vitest'
import { buildDeaiDetectSummaryEvents } from './deaiObservationEvents'
import { DeAiProcessor } from './de-ai'

describe('DEAI detect summary trace events', () => {
  it('projects machine-readable kernel and score events from the full report', () => {
    const report = DeAiProcessor.detectBody('陈舟推开门。他说：“先别动。”王芳把伞塞给他。', {})
    const events = buildDeaiDetectSummaryEvents(report)
    const types = events.map(event => event.type)

    expect(types).toEqual(expect.arrayContaining(['deai-kernel-v2', 'deai-score']))
    const kernel = events.find(event => event.type === 'deai-kernel-v2')
    expect(kernel?.level).toBe('info')
    expect(JSON.parse(String(kernel?.detail))).toMatchObject({
      kernelVersion: 'v2',
      provisional: true,
      effectiveChars: report.effectiveChars
    })
    const score = events.find(event => event.type === 'deai-score')
    expect(JSON.parse(String(score?.detail))).toMatchObject({
      score: report.score,
      verdict: report.verdict,
      aiEditedFraction: report.aiEditedFraction
    })
  })

  it('emits the style drift event only when drift exists', () => {
    const start = '陈舟推开门，雨水顺着帽檐滴到门槛，走廊尽头灯闪两下。'.repeat(100)
    const end = '首先毫无疑问的是，与此同时显然确实仿佛，他深吸一口气。'.repeat(100)
    const report = DeAiProcessor.detectBody(`${start}${end}${start}${end}`, {})
    const events = buildDeaiDetectSummaryEvents(report)
    const drift = events.find(event => event.type === 'deai-style-drift')

    expect(drift).toBeTruthy()
    expect(JSON.parse(String(drift?.detail))).toMatchObject({
      windowCount: report.styleDrift?.windowCount,
      firstLastDelta: report.styleDrift?.firstLastDelta,
      severity: report.styleDrift?.severity
    })
  })

  it('does not project events from an invalid report', () => {
    expect(buildDeaiDetectSummaryEvents(null)).toEqual([])
    expect(buildDeaiDetectSummaryEvents({} as never)).toEqual([])
  })
})
