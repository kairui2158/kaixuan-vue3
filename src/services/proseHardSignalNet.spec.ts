import { describe, expect, it } from 'vitest'
import {
  HARD_SIGNAL_SCAN_PASSED,
  scanProseHardSignals,
  type ProseHardSignalFinding,
  type ProseHardSignalScan
} from './proseHardSignalNet'

function findingsOf(scan: ProseHardSignalScan): ProseHardSignalFinding[] {
  return scan.detected ? scan.findings : []
}

describe('scanProseHardSignals', () => {
  it('detects generation refusal statements', () => {
    const scan = scanProseHardSignals('我无法继续创作这一章。')

    expect(scan.detected).toBe(true)
    expect(findingsOf(scan).map(item => item.type)).toContain('refusal')
  })

  it('does not treat fiction dialogue about inability as refusal', () => {
    const scan = scanProseHardSignals('“我做不到。”她垂下眼睛。')

    expect(scan.detected).toBe(false)
    expect(scan.status).toBe(HARD_SIGNAL_SCAN_PASSED)
  })

  it('detects meta and engineering language in generated prose', () => {
    const scan = scanProseHardSignals('本章按照系统要求进行输出，token 已控制在目标范围内。')

    expect(scan.detected).toBe(true)
    expect(findingsOf(scan).map(item => item.type)).toContain('meta_language')
  })

  it('detects adjacent duplicated lines', () => {
    const scan = scanProseHardSignals('雨落在旧城上。\n雨落在旧城上。\n远处的灯亮了。')

    expect(scan.detected).toBe(true)
    expect(findingsOf(scan).map(item => item.type)).toContain('near_duplicate_line')
  })

  it('does not flag legitimate repeated short dialogue lines', () => {
    const scan = scanProseHardSignals('“走。”\n“走。”\n“现在就走。”')

    expect(scan.detected).toBe(false)
  })

  it('does not flag repeated labels as duplication when below the evidence threshold', () => {
    const scan = scanProseHardSignals('第一章 归途\n第一章 归途\n正文从这里开始。')

    expect(scan.detected).toBe(false)
  })

  it('does not flag a normal paragraph as a hard signal', () => {
    const scan = scanProseHardSignals('灯芯晃了一下。她伸手按住桌角，把那张地图重新压平。')

    expect(scan.detected).toBe(false)
    expect(scan.findings).toEqual([])
  })

  it('reports structured evidence with offsets and excerpts', () => {
    const scan = scanProseHardSignals('抱歉，我无法完成这个请求。')
    const finding = findingsOf(scan).find(item => item.type === 'refusal')

    expect(finding).toMatchObject({
      type: 'refusal',
      start: expect.any(Number),
      end: expect.any(Number),
      excerpt: expect.stringContaining('无法')
    })
  })

  it('counts each refusal match once even when overlapping patterns match it', () => {
    const scan = scanProseHardSignals('抱歉，我无法继续创作这一章。')

    expect(scan.detected).toBe(true)
    expect(scan.counts.refusal).toBe(1)
    expect(findingsOf(scan).filter(item => item.type === 'refusal')).toHaveLength(1)
  })

  it('passes valid prose even when a provider finish reason is absent', () => {
    const scan = scanProseHardSignals('风把门吹开，他先看见火，再看见母亲的手。', {})

    expect(scan.detected).toBe(false)
    expect(scan.status).toBe(HARD_SIGNAL_SCAN_PASSED)
  })

  it('reports provider length evidence as truncation', () => {
    const scan = scanProseHardSignals('这是一段看起来完整的正文。', { finishReason: 'length' })

    expect(scan.detected).toBe(true)
    expect(findingsOf(scan).map(item => item.type)).toContain('truncated')
    expect(findingsOf(scan)[0].origin).toBe('provider')
  })

  it('does not infer truncation from a normal stop reason', () => {
    const scan = scanProseHardSignals('这是一段看起来完整的正文。', { finishReason: 'stop' })

    expect(scan.detected).toBe(false)
  })

  it('detects markdown truncation markers without flagging ordinary brackets', () => {
    const scan = scanProseHardSignals('他跑下山道。 [内容截断，请继续')

    expect(scan.detected).toBe(true)
    expect(findingsOf(scan).map(item => item.type)).toContain('truncated')
  })
})
