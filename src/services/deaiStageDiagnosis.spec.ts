import { describe, expect, it } from 'vitest'
import {
  buildDeaiStageDiagnosis,
  formatDeaiStageGuidance,
  buildDeaiStageGuidanceTraceEvent,
  type DeaiStageFinding
} from './deaiStageDiagnosis'

const finding = (id: string, type: string, samples: string[]): DeaiStageFinding => ({
  id,
  severity: 'advisory',
  type,
  sample: samples[0] || '',
  position: 0,
  positionPercent: 0
})

const findingInput = (id: string, type: string, samples: string[]) => ({
  id,
  severity: 'advisory',
  type,
  samples
})

describe('deaiStageDiagnosis', () => {
  it('computes character positions for bounded diagnosis findings', () => {
    const body = '第一段。他非常突然地抬头。第二段。'
    const result = buildDeaiStageDiagnosis(body, {
      detect: () => ({
        findings: [
          findingInput('deai-banned-vocab', '高频禁用词', ['突然(1)'])
        ]
      })
    })

    expect(result.degraded).toBe(false)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      id: 'deai-banned-vocab',
      type: '高频禁用词',
      sample: '突然(1)',
      position: body.indexOf('突然')
    })
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('limits findings and total guidance characters without carrying prose', () => {
    const body = '他突然抬头。他非常突然地转身。她突然停下。'
    const result = buildDeaiStageDiagnosis(body, {
      detect: () => ({
        findings: Array.from({ length: 8 }, (_, index) =>
          findingInput(`id-${index}`, `规则${index}`, [`样本${index}`]))
      })
    })

    expect(result.findings).toHaveLength(6)
    expect(result.droppedFindingCount).toBe(2)
    const guidance = formatDeaiStageGuidance(result)
    expect(guidance).toContain('【S2诊断情报（有界，不改稿）】')
    expect(guidance.length).toBeLessThanOrEqual(1200)
    expect(guidance).not.toContain('改写建议')
    expect(guidance).not.toContain(body)
  })

  it('bounds each finding sample independently of the total guidance budget', () => {
    const longSample = '样'.repeat(180)
    const result = buildDeaiStageDiagnosis('正文', {
      detect: () => ({
        findings: [findingInput('deai-banned-vocab', '高频禁用词', [longSample])]
      })
    })

    expect(result.findings[0].sample).toHaveLength(120)
    expect(formatDeaiStageGuidance(result)).not.toContain(longSample)
  })

  it('falls back to a percentage position when a sample cannot be located', () => {
    const body = '短正文'
    const result = buildDeaiStageDiagnosis(body, {
      detect: () => ({
        findings: [findingInput('deai-style-drift', '前后风格漂移', ['窗口数 4'])]
      })
    })

    expect(result.findings[0].position).toBe(0)
    expect(result.findings[0].positionPercent).toBe(0)
  })

  it('degrades to no findings when the detector throws', () => {
    const result = buildDeaiStageDiagnosis('正文', {
      detect: () => { throw new Error('detector failed') }
    })

    expect(result.degraded).toBe(true)
    expect(result.degradedReason).toContain('detector failed')
    expect(result.findings).toHaveLength(0)
  })

  it('emits a trace event with bounded audit fields only', () => {
    const result = buildDeaiStageDiagnosis('他突然抬头。', {
      detect: () => ({ findings: [findingInput('deai-banned-vocab', '高频禁用词', ['突然(1)'])] })
    })
    const guidance = formatDeaiStageGuidance(result)
    const event = buildDeaiStageGuidanceTraceEvent(result, guidance, {
      step: 4,
      sourceSkillIndex: 1,
      targetSkillIndex: 2,
      totalSkillCount: 3
    })

    expect(event?.type).toBe('deai-stage-guidance')
    expect(event?.level).toBe('info')
    const detail = JSON.parse(String(event?.detail))
    expect(detail).toMatchObject({
      step: 4,
      sourceSkillIndex: 1,
      targetSkillIndex: 2,
      findingCount: 1,
      guidanceChars: guidance.length,
      target: 'next_step_user_prompt'
    })
    expect(JSON.stringify(detail)).not.toContain('他突然抬头')
  })

  it('hashes guidance without carrying its full text in trace', () => {
    const body = '他突然抬头。'.repeat(200)
    const result = buildDeaiStageDiagnosis(body, {
      detect: () => ({
        findings: [findingInput('deai-banned-vocab', '高频禁用词', ['突然(1)'])]
      })
    })
    const guidance = formatDeaiStageGuidance(result, { maxChars: 1200 })
    const event = buildDeaiStageGuidanceTraceEvent(result, guidance, {
      step: 4,
      sourceSkillIndex: 1,
      targetSkillIndex: 2,
      totalSkillCount: 3
    })

    const detail = JSON.parse(String(event?.detail))
    expect(detail.hash).toMatch(/^deai-stage-v1:[0-9a-f]{16}$/)
    expect(JSON.stringify(detail)).not.toContain(guidance)
    expect(String(detail.guidanceChars)).toBe(String(guidance.length))
  })

  it('records a zero-finding diagnosis execution without injecting guidance', () => {
    const result = buildDeaiStageDiagnosis('干净正文', {
      detect: () => ({ findings: [] })
    })
    const guidance = formatDeaiStageGuidance(result)
    const event = buildDeaiStageGuidanceTraceEvent(result, guidance, {
      step: 4,
      sourceSkillIndex: 1,
      targetSkillIndex: 2,
      totalSkillCount: 3
    })

    expect(guidance).toBe('')
    expect(event.type).toBe('deai-stage-guidance')
    expect(event.label).toBe('S2 后降AI位置诊断已执行：0条 / 未注入')
    const detail = JSON.parse(event.detail)
    expect(detail).toMatchObject({
      findingCount: 0,
      injected: false,
      guidanceChars: 0
    })
  })

  it('drops findings that would exceed the construction budget', () => {
    let calls = 0
    const result = buildDeaiStageDiagnosis('正文'.repeat(600), {
      detect: () => {
        calls += 1
        return {
          findings: [findingInput('deai-banned-vocab', '高频禁用词', ['突然(1)'])]
        }
      },
      maxConstructionMs: 0
    })

    expect(result.budgetExceeded).toBe(true)
    expect(result.findings).toHaveLength(0)
    expect(result.droppedFindingCount).toBe(1)
    expect(calls).toBe(1)
  })
})
