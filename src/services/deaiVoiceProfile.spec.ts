import { describe, expect, it } from 'vitest'
import {
  appendDeaiVoiceProfile,
  buildDeaiVoiceProfile,
  buildDeaiVoiceProfileTraceEvent,
  DEAI_VOICE_PROFILE_BUDGET,
} from './deaiVoiceProfile'

describe('DEAI voice profile', () => {
  it('does not project an unlocked or empty style profile', () => {
    expect(buildDeaiVoiceProfile(null)).toBeNull()
    expect(buildDeaiVoiceProfile({ locked: false, injected: false })).toBeNull()
    expect(buildDeaiVoiceProfile({ locked: true, injected: false })).toBeNull()
  })

  it('projects the locked author voice from the style profile single source', () => {
    const profile = buildDeaiVoiceProfile({
      profileVersion: 2,
      locked: true,
      injected: true,
      voice: { protagonistSpeech: '狠、短、少解释', dialogueTags: '动作带话', subtextDensity: '高' },
      descriptionFocus: { senses: '偏触觉和痛感', sketch: '白描少形容词', psychology: '外化成动作' },
      quantitative: {
        sampleSource: '踏星样本',
        dialogueDensityPerKChars: 5.5,
        sentenceMix: { short: 20, medium: 50, long: 30 },
        punctuation: { comma: 18, period: 12, exclamation: 1, question: 2, ellipsis: 1, dash: 1 },
      },
      positiveRules: [
        { id: 'p1', text: '关键转折使用短句', enabled: true },
        { id: 'p2', text: '禁用规则', enabled: false },
      ],
      prohibitions: [{ id: 'b1', text: '禁止连续三句短句碎片', enabled: true }],
    })

    expect(profile).not.toBeNull()
    expect(profile?.positiveRules).toEqual(['- 关键转折使用短句'])
    expect(profile?.quantitative).toContain('对话密度=5.50段/千字')
    expect(profile?.text).toContain('[声纹]')
    expect(profile?.text).toContain('主角声口：狠、短、少解释')
    expect(profile?.text).toContain('[警戒线]')
    expect(profile?.text).not.toContain('禁用规则')
  })

  it('detects overlap with generic DEAI constraints and gives the profile priority', () => {
    const profile = buildDeaiVoiceProfile({
      profileVersion: 2,
      locked: true,
      injected: true,
      prohibitions: [{ id: 'b1', text: '短句只用于动作转折；对白不解释因果', enabled: true }],
    })
    const prompt = appendDeaiVoiceProfile('通用降AI约束', profile)

    expect(profile?.conflicts.map(conflict => conflict.key)).toContain('sentence-rhythm')
    expect(profile?.conflicts.map(conflict => conflict.key)).toContain('dialogue')
    expect(prompt).toContain('【作者声纹 - 最高风格优先级】')
    expect(prompt).toContain('这些主题以作者声纹为准')
    const event = buildDeaiVoiceProfileTraceEvent(profile)
    expect(event?.level).toBe('warn')
    expect(event?.detail).toContain('sentence-rhythm')
  })

  it('keeps the projection bounded and reports deterministic trim metadata', () => {
    const profile = buildDeaiVoiceProfile({
      profileVersion: 2,
      locked: true,
      injected: true,
      prohibitions: Array.from({ length: 60 }, (_, index) => ({
        id: `b${index}`,
        text: `作者短句与人物对白规则${index + 1}`,
        enabled: true,
      })),
    })

    expect(profile?.injectedChars).toBeLessThanOrEqual(DEAI_VOICE_PROFILE_BUDGET)
    expect(profile?.truncated).toBe(true)
    expect(profile?.truncationReason).toMatch(/^voice_profile_budget_(trim|slice)/)
  })
})
