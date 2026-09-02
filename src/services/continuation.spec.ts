import { describe, expect, it } from 'vitest'
import { canContinue, continuationStatusFor, mergeContinuationText } from './continuation'

describe('continuation protocol', () => {
  it('marks length-limited output as resumable', () => {
    expect(continuationStatusFor('length', true)).toBe('possibly_truncated')
    expect(canContinue({ status: 'possibly_truncated', accumulatedText: '正文' })).toBe(true)
  })
  it('does not expose an empty failed response as resumable', () => {
    expect(continuationStatusFor('length', false)).toBe('failed')
    expect(canContinue({ status: 'failed', accumulatedText: '' })).toBe(false)
  })
  it('does not expose a failed response with text as resumable', () => {
    expect(canContinue({ status: 'failed', accumulatedText: '姝ｆ枃' })).toBe(false)
  })

  it('deduplicates an overlapping continuation boundary', () => {
    expect(mergeContinuationText('甲乙丙', '丙丁戊')).toBe('甲乙丙丁戊')
  })
})


describe('finish reason boundaries', () => {
  it('does not mark unknown finish reason as resumable', () => {
    expect(continuationStatusFor('unknown', true)).toBe('failed')
  })
})

