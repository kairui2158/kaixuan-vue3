import { describe, expect, it, vi } from 'vitest'
import { DeAiProcessor, collectDeaiFindingsWithObservability } from './de-ai'

const sampleBody = [
  '陈舟推开门，雨水顺着帽檐滴到门槛。',
  '他说：“先别动。”',
  '走廊尽头的灯闪了两下，又稳住。',
  '王芳把手里的伞塞给他，转身跑进雨里。'
].join('\n')

const makeLongNarration = (repeatedFragment: string, times: number) => {
  const fragments: string[] = []
  for (let i = 0; i < times; i += 1) {
    fragments.push(`${repeatedFragment}${i + 1}。`)
  }
  return fragments.join('')
}

describe('DEAI V2 observation integrity', () => {
  it('does not fabricate protected-span retention before a repair exists', () => {
    const report = DeAiProcessor.detectBody(sampleBody, {})

    expect(report.metrics.protectedSpans).toEqual({ total: expect.any(Number) })
    expect(report.metrics).not.toHaveProperty('retentionRatio')
  })

  it('computes retention only after deep repair', () => {
    const original = '必须保留的人名。他站在门口。'
    const spans = DeAiProcessor.extractProtectedSpans(original, { mustSpans: ['必须保留的人名'] })
    const kept = DeAiProcessor.verifyProtectedSpans(original, original, spans)
    const changed = DeAiProcessor.verifyProtectedSpans(original, original.replace('必须保留的人名', '替换掉'), spans)

    expect(kept.retentionRatio).toBe(1)
    expect(changed.retentionRatio).toBeLessThan(1)
  })

  it('returns a provisional V2 kernel report without fabricating repair metrics', () => {
    const report = DeAiProcessor.detectBody(sampleBody, {})

    expect(report.kernelVersion).toBe('v2')
    expect(report.provisional).toBe(true)
    expect(report.verdict).toBeOneOf(['clean', 'advisory', 'suspicious', 'likely_ai', 'blocking'])
    expect(Array.isArray(report.thresholds)).toBe(true)
    expect(report.metrics).not.toHaveProperty('retentionRatio')
  })
})

describe('DEAI kernel V2', () => {
  it('scales density thresholds down for short samples', () => {
    const short = DeAiProcessor.detectBody(`${'他不禁深吸一口气。'.repeat(8)}`, {})
    const threshold = short.thresholds.find((item: { name: string }) => item.name === 'aiFreqWord')

    expect(threshold.scaledValue).toBeLessThan(threshold.value)
  })

  it('keeps dialogue thresholds more tolerant than narration thresholds', () => {
    const report = DeAiProcessor.detectBody(`叙述里他似乎不安，好像犹豫，或许迟疑。他说：“我似乎好像或许确实应该走了。”`, {})
    const narration = report.thresholds.find((item: { name: string }) => item.name === 'narrationHedging')
    const dialogue = report.thresholds.find((item: { name: string }) => item.name === 'dialogueHedging')

    expect(dialogue.scaledValue).toBeGreaterThan(narration.scaledValue)
  })

  it('detects repeated Chinese n-gram fingerprints in long narration', () => {
    const text = makeLongNarration('他忽然停住，肩膀绷紧，呼吸停滞，瞳孔收缩，', 30)
    const report = DeAiProcessor.detectBody(text, {})
    const ids = report.findings.map((finding: { id: string }) => finding.id)

    expect(ids).toContain('deai-repeated-bigram')
    expect(ids).toContain('deai-repeated-trigram')
  })

  it('scores over-varied sentence rhythm without treating it as a blocking failure', () => {
    const text = [
      '他忽然停住，肩膀绷紧，呼吸停滞，瞳孔收缩，所有人的目光都压过来，走廊尽头的灯闪了两下又稳住。',
      '短。',
      '短。',
      '短。',
      '短。',
      '短。',
      '短。',
      '短。',
      '短。'
    ].join('\n')
    const report = DeAiProcessor.detectBody(text, {})
    const finding = report.findings.find((item: { id: string }) => item.id === 'deai-sentence-cv-excess')

    expect(finding).toBeTruthy()
    expect(finding?.severity).toBe('advisory')
    expect(report.metrics.sentenceLengthCV).toBeGreaterThanOrEqual(1)
    expect(report.verdict).not.toBe('blocking')
  })

  it('reports style drift across a long chapter', () => {
    const start = makeLongNarration('陈舟推开门，雨水顺着帽檐滴到门槛，', 60)
    const end = makeLongNarration('首先毫无疑问注意的是与此同时显然确实仿佛，', 60)
    const report = DeAiProcessor.detectBody(`${start}${end}${start}${end}`, {})

    expect(report.styleDrift).toBeTruthy()
    expect(report.findings.map((finding: { id: string }) => finding.id)).toContain('deai-style-drift')
  })
})

describe('DEAI V2 deep-fix change-rate gate', () => {
  it('rejects a full rewrite that loses sentence continuity', () => {
    const rewrite = [
      '夜色压下来，少年从阴影里走出。',
      '他抬手止住身后的人。',
      '远处的灯光摇晃，随后恢复明亮。',
      '同伴把伞递过去，独自冲入雨幕。'
    ].join('\n')
    const gate = DeAiProcessor.evaluateDeepFixEdit(sampleBody, rewrite, 0)

    expect(gate.changeRate).toBeGreaterThanOrEqual(0.5)
    expect(gate.accepted).toBe(false)
    expect(gate.reason).toBe('change_rate_exceeded')
  })

  it('warns in the 30-50% band without rejecting the edit', () => {
    const sentences = sampleBody.split('\n')
    sentences[0] = '陈舟推开木门，雨水顺帽檐落到门槛上。'
    sentences[2] = '走廊尽头灯光闪两下，很快又稳住了。'
    const edited = sentences.join('\n')
    const gate = DeAiProcessor.evaluateDeepFixEdit(sampleBody, edited, 0)

    expect(gate.changeRate).toBeGreaterThanOrEqual(0.3)
    expect(gate.changeRate).toBeLessThan(0.5)
    expect(gate.accepted).toBe(true)
    expect(gate.warning).toBe('change_rate_high')
  })

  it('accepts a local minimal edit', () => {
    const edited = sampleBody.replace('他说：', '他说：'.replace('他', '陈舟'))
    const gate = DeAiProcessor.evaluateDeepFixEdit(sampleBody, edited, 0)

    expect(gate.changeRate).toBeLessThan(0.3)
    expect(gate.accepted).toBe(true)
    expect(gate.warning).toBeUndefined()
  })

  it('scales thresholds with blocking findings', () => {
    const rewrite = [
      '陈舟推门，雨水滴落。',
      '他说：“先别动。”',
      '灯闪两下，稳住。',
      '王芳把伞塞给他，跑进雨里。'
    ].join('\n')
    const strict = DeAiProcessor.evaluateDeepFixEdit(sampleBody, rewrite, 5)
    const relaxed = DeAiProcessor.evaluateDeepFixEdit(sampleBody, rewrite, 0)

    expect(strict.rejectThreshold).toBeLessThan(relaxed.rejectThreshold)
  })

  it('keeps detection and change-rate gates under the 20k-character budget', () => {
    const paragraph = [
      '陈舟推开院门，雨水先落在门槛上。',
      '他把伞骨压低，脚尖避开积水最深的砖缝。',
      '王芳在廊下喊他，声音被雨声削去一半。',
      '他说：“先别动。”',
      '走廊尽头的灯闪了两下，又稳住。'
    ].join('')
    const chapter = Array.from({ length: 250 }, (_, index) => `${paragraph}${index + 1}。`).join('')
    const edited = chapter.replace('他把伞骨压低', '他压低伞骨')
    const startedAt = performance.now()
    const report = DeAiProcessor.detectBody(chapter, {})
    const gate = DeAiProcessor.evaluateDeepFixEdit(chapter, edited, 0)
    const elapsed = performance.now() - startedAt

    expect(chapter.length).toBeGreaterThanOrEqual(20000)
    expect(gate.accepted).toBe(true)
    expect(elapsed).toBeLessThan(300)
  })
})

describe('DEAI V2 final-step observability', () => {
  it('reports detector failures instead of silently returning an empty list', async () => {
    vi.stubGlobal('__DEAI_V2_TEST_THROW__', true)
    const onDegraded = vi.fn()
    const result = collectDeaiFindingsWithObservability('正文', onDegraded, () => {
      throw new Error('detector crashed')
    })

    expect(result.findings).toEqual([])
    expect(result.degraded).toBe(true)
    expect(onDegraded).toHaveBeenCalledWith('detector crashed')
    vi.unstubAllGlobals()
  })
})
