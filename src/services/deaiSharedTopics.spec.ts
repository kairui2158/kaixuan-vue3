import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  DEAI_SHARED_TOPICS,
  findDeaiSharedTopicConflicts,
  findDeaiSharedTerms,
} from './deaiSharedTopics'

describe('DEAI shared conflict topics', () => {
  it('keeps one canonical topic source for both consumers', () => {
    expect(DEAI_SHARED_TOPICS.map(topic => topic.key)).toEqual([
      'sentence-rhythm',
      'transition',
      'dialogue',
      'perspective',
      'integrity',
      'ai-trace',
    ])
    expect(DEAI_SHARED_TOPICS.find(topic => topic.key === 'sentence-rhythm')?.terms)
      .toEqual(['短句', '句长', '碎片'])
  })

  it('finds flat terms for prompt conflict checks', () => {
    expect(findDeaiSharedTerms('短句与对白规则')).toEqual(['短句', '对白'])
    expect(findDeaiSharedTerms('没有共享主题')).toEqual([])
  })

  it('finds grouped topic conflicts for voice profile checks', () => {
    expect(findDeaiSharedTopicConflicts('短句与对白规则')).toEqual([
      {
        key: 'sentence-rhythm',
        topic: '句长节奏与短句使用',
        terms: ['短句'],
      },
      {
        key: 'dialogue',
        topic: '对白完整度与轻重',
        terms: ['对白'],
      },
    ])
  })

  it('keeps the shared keyword layer free of store and IO dependencies', () => {
    const sharedSource = readFileSync(new URL('./deaiSharedTopics.ts', import.meta.url), 'utf8')
    const skillSource = readFileSync(new URL('./skillDeaiContract.ts', import.meta.url), 'utf8')
    const voiceSource = readFileSync(new URL('./deaiVoiceProfile.ts', import.meta.url), 'utf8')

    for (const source of [sharedSource, skillSource]) {
      expect(source).not.toContain('pinia')
      expect(source).not.toContain('useDeAiStore')
      expect(source).not.toContain('localStorage')
    }
    expect(voiceSource).not.toContain("import { useDeAiStore }")
    expect(skillSource).not.toContain('const DEAI_CONFLICT_TERMS')
    expect(voiceSource).not.toContain('const SHARED_TOPICS')
    expect(skillSource).toContain('findDeaiSharedTerms')
    expect(voiceSource).toContain('findDeaiSharedTopicConflicts')
  })
})
