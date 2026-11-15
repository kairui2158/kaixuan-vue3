import { describe, expect, it } from 'vitest'
import { bodyGeneratorContractSentence } from './chainExecution'
import {
  PROSE_MIN_WORD_RATIO,
  PROSE_MAX_WORD_RATIO,
  resolveProseWordContract
} from './proseWordContract'
import { validateBodyArtifact } from './bodyArtifactContract'

describe('resolveProseWordContract', () => {
  it('uses one 80% source for both prompt and validation', () => {
    const contract = resolveProseWordContract({ targetWords: 3500 })
    const sentence = bodyGeneratorContractSentence(3500)
    const validation = validateBodyArtifact('字'.repeat(contract.minWords - 1), {
      chapterId: 'ch-1',
      targetWords: 3500
    })

    expect(contract.minRatio).toBe(PROSE_MIN_WORD_RATIO)
    expect(contract.maxRatio).toBe(PROSE_MAX_WORD_RATIO)
    expect(sentence).toContain(`不低于${contract.minWords}字`)
    expect(sentence).toContain(`不超过${contract.maxWords}字`)
    expect(sentence).not.toContain("正文本体后必须追加【正文交接】区块")
    expect(validation.minWords).toBe(contract.minWords)
    expect(validation.status).toBe('too_short')
  })

  it('rejects the legacy 60% floor as the default', () => {
    const contract = resolveProseWordContract({ targetWords: 3500 })
    expect(contract.minWords).not.toBe(2100)
    expect(contract.minWords).toBe(2800)
  })
})
