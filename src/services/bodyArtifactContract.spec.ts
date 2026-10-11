import { describe, expect, it } from 'vitest'
import {
  countBodyWords,
  isBodyArtifactContractInput,
  validateBodyArtifact
} from './bodyArtifactContract'

describe('countBodyWords', () => {
  it('counts CJK characters individually and ASCII words as words', () => {
    expect(countBodyWords('雨夜里的纸条')).toBe(6)
    expect(countBodyWords('rain night 42')).toBe(3)
    expect(countBodyWords('雨夜 rain 纸条')).toBe(5)
  })

  it('ignores whitespace and punctuation', () => {
    expect(countBodyWords('  雨夜，纸条！  ')).toBe(4)
  })
})

describe('validateBodyArtifact', () => {
  it('rejects an empty body', () => {
    const result = validateBodyArtifact('   ', { chapterId: 'ch-1', targetWords: 100 })
    expect(result.valid).toBe(false)
    expect(result.status).toBe('empty')
    expect(result.errors).toEqual(['正文为空'])
  })

  it('accepts the default 60% to 200% range', () => {
    const contract = { chapterId: 'ch-1', targetWords: 100 }
    expect(validateBodyArtifact('字'.repeat(59), contract).status).toBe('too_short')
    expect(validateBodyArtifact('字'.repeat(60), contract).status).toBe('valid')
    expect(validateBodyArtifact('字'.repeat(200), contract).status).toBe('valid')
    expect(validateBodyArtifact('字'.repeat(201), contract).status).toBe('too_long')
  })

  it('supports explicit ratio overrides', () => {
    const contract = {
      chapterId: 'ch-1',
      targetWords: 100,
      minRatio: 0.5,
      maxRatio: 1.5
    }
    expect(validateBodyArtifact('字'.repeat(49), contract).status).toBe('too_short')
    expect(validateBodyArtifact('字'.repeat(50), contract).status).toBe('valid')
    expect(validateBodyArtifact('字'.repeat(151), contract).status).toBe('too_long')
  })
})

describe('isBodyArtifactContractInput', () => {
  it('requires a chapter id and a positive target word count', () => {
    expect(isBodyArtifactContractInput({ chapterId: 'ch-1', targetWords: 100 })).toBe(true)
    expect(isBodyArtifactContractInput({ chapterId: '', targetWords: 100 })).toBe(false)
    expect(isBodyArtifactContractInput({ chapterId: 'ch-1', targetWords: 0 })).toBe(false)
    expect(isBodyArtifactContractInput({ chapterId: 'ch-1', targetWords: 1.5 })).toBe(false)
  })
})
