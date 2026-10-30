import { describe, expect, it } from 'vitest'
import { buildSchemaRetryFeedback } from './schemaRetryFeedback'

describe('buildSchemaRetryFeedback', () => {
  it('suppresses the full candidate and reports the bounded feedback', () => {
    const candidate = [
      '第一段'.repeat(200),
      'middle-line',
      '最后一段'.repeat(200)
    ].join('\n')
    const result = buildSchemaRetryFeedback({
      errors: ['$.output 缺少必填字段', '额外错误'],
      previousOutput: candidate
    })

    expect(result.feedback).toContain('【结构化重试反馈】')
    expect(result.feedback).toContain('$.output 缺少必填字段')
    expect(result.feedback).toContain('完整全文已抑制')
    expect(result.feedback).not.toContain(candidate)
    expect(result.feedback).not.toContain('<<<上一版候选输出开始>>>')
    expect(result.candidateChars).toBe(candidate.length)
    expect(result.feedbackChars).toBe(result.feedback.length)
    expect(result.anchorCount).toBe(3)
    expect(result.previewChars).toBeLessThanOrEqual(420)
    expect(result.suppressedCandidateChars).toBeGreaterThan(0)
  })

  it('keeps short candidates inside the bounded preview', () => {
    const result = buildSchemaRetryFeedback({
      errors: ['缺少 output 字段'],
      previousOutput: '{"wrong": true}'
    })

    expect(result.feedback).toContain('{"wrong": true}')
    expect(result.candidateChars).toBe('{"wrong": true}'.length)
    expect(result.suppressedCandidateChars).toBe(0)
  })

  it('works without a previous candidate', () => {
    const result = buildSchemaRetryFeedback({ errors: ['缺少 output 字段'] })

    expect(result.feedback).toContain('缺少 output 字段')
    expect(result.candidateChars).toBe(0)
    expect(result.anchorCount).toBe(0)
    expect(result.previewChars).toBe(0)
  })

  it('routes word-count failure feedback to the protected body contract strategy', () => {
    const candidate = [
      '正'.repeat(1000),
      '【正文交接】',
      '章节：第12章 王芳入局',
      'POV：林越',
      '已完成场景：1. 王芳在酒馆讲出线索；2. 林越确认旧案时间',
      '未完成场景：3. 王芳与林越分头行动',
      '角色状态变化：林越开始怀疑内鬼',
      '章末状态：王芳拿到账册',
      'FACT_LOCK：王芳=话痨；账册=旧案关键物',
      '【正文交接结束】'
    ].join('\n')
    const result = buildSchemaRetryFeedback({
      errors: ['正文过短：2650字，要求不低于2800字'],
      previousOutput: candidate,
      protectedContract: {
        kind: 'body',
        targetWords: 3500
      }
    })

    expect(result.strategy).toBe('word-gap')
    expect(result.feedback).toContain('目标净字数：3500')
    expect(result.feedback).toContain('下限净字数：2800')
    expect(result.feedback).toMatch(/当前净字数：\d+/)
    expect(result.feedback).toMatch(/还差净字数：\d+/)
    expect(result.feedback).toContain('候选全文未随本反馈回传')
    expect(result.feedback).toContain('一、上一版场景结构骨架（有界，不是候选全文）')
    expect(result.feedback).toContain('已完成场景：1. 王芳在酒馆讲出线索')
    expect(result.feedback).toContain('FACT_LOCK：王芳=话痨；账册=旧案关键物')
    expect(result.feedback).not.toContain('正'.repeat(100))
    expect(result.scaffoldFieldCount).toBeGreaterThanOrEqual(7)
    expect(result.scaffoldChars).toBeLessThanOrEqual(820)
    expect(result.feedback).not.toContain('请以上一版候选输出为基底补写缺失场景')
    expect(result.feedback).not.toContain(candidate)
    expect(result.feedback).not.toContain('请基于原始任务输入重新输出完整结果')
  })

  it('declares the missing scaffold instead of pretending the previous structure exists', () => {
    const result = buildSchemaRetryFeedback({
      errors: ['正文过短：2000字，要求不低于2800字'],
      previousOutput: '正'.repeat(2000),
      protectedContract: {
        kind: 'body',
        targetWords: 3500
      }
    })

    expect(result.strategy).toBe('word-gap')
    expect(result.feedback).toContain('上一版候选没有可解析的【正文交接】账本')
    expect(result.feedback).toContain('不要把缺失骨架降级为丢弃段落结构')
    expect(result.scaffoldChars).toBe(0)
    expect(result.scaffoldFieldCount).toBe(0)
    expect(result.feedback).not.toContain('正'.repeat(100))
  })

  it('keeps bounded-summary feedback for quality failures', () => {
    const result = buildSchemaRetryFeedback({
      errors: ['复述上一步内容过多'],
      previousOutput: '候选',
      protectedContract: {
        kind: 'body',
        targetWords: 3500
      }
    })

    expect(result.strategy).toBe('bounded-summary')
    expect(result.feedback).toContain('请基于原始任务输入重新输出完整结果')
    expect(result.feedback).not.toContain('请以上一版候选输出为基底补写缺失场景')
  })
})
