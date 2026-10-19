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
})
