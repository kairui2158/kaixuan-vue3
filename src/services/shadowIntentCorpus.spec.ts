import { describe, expect, it } from 'vitest'
import { SHADOW_INTENT_CORPUS, isShadowIntentCorpusPackage } from './shadowIntentCorpus.ts'

describe('shadow intent corpus', () => {
  it('keeps shadow samples separate and frozen', () => {
    expect(SHADOW_INTENT_CORPUS.length).toBeGreaterThan(0)
    expect(Object.isFrozen(SHADOW_INTENT_CORPUS)).toBe(true)
    for (const sample of SHADOW_INTENT_CORPUS) {
      expect(sample.source).toBe('community-shadow')
    }
  })

  it('identifies only shadow packages', () => {
    expect(isShadowIntentCorpusPackage({ schema: 'shenyi.shadow-intent-corpus' })).toBe(true)
    expect(isShadowIntentCorpusPackage({ schema: 'shenyi.intent-corpus-package' })).toBe(false)
  })
})
