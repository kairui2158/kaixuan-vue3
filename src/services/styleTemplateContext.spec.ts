import { describe, expect, it } from 'vitest'
import type { StyleProfileEffectiveLike } from './styleContextCompiler'
import { buildStyleTemplateVariables } from './styleTemplateContext'

const injectedProfile: StyleProfileEffectiveLike = {
  profileVersion: 2,
  locked: true,
  injected: true,
  voice: {
    protagonistSpeech: '短句、冷句、少形容词',
    dialogueTags: '说、问、答',
    subtextDensity: '高',
  },
  sentencePatterns: [
    { id: 'a', text: '用动作句收尾', enabled: true },
    { id: 'b', text: '禁用句式', enabled: false },
  ],
  prohibitions: [
    { id: 'c', text: '禁止滥用感叹号', enabled: true },
    { id: 'd', text: '禁用警戒', enabled: false },
  ],
}

describe('buildStyleTemplateVariables', () => {
  it('returns empty strings when style is not injected', () => {
    const result = buildStyleTemplateVariables({ ...injectedProfile, injected: false })
    expect(result).toEqual({
      styleVoice: '',
      styleSentencePatterns: '',
      styleProhibitions: '',
    })
  })

  it('renders only enabled V2 rules from an injected profile', () => {
    const result = buildStyleTemplateVariables(injectedProfile)
    expect(result.styleVoice).toContain('短句、冷句、少形容词')
    expect(result.styleVoice).toContain('对话标签：说、问、答')
    expect(result.styleSentencePatterns).toBe('用动作句收尾')
    expect(result.styleProhibitions).toBe('禁止滥用感叹号')
  })

  it('keeps the empty-value contract for a V1 profile', () => {
    const result = buildStyleTemplateVariables({ profileVersion: 1, locked: true, injected: true })
    expect(result).toEqual({
      styleVoice: '',
      styleSentencePatterns: '',
      styleProhibitions: '',
    })
  })
})
