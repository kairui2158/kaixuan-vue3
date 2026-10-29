import { describe, expect, it } from 'vitest'
import {
  DEAI_METHODOLOGY_PROMPT,
  DEAI_CREATIVE_PROMPT,
  DEAI_POLISH_PROMPT,
  resolveDeaiPromptForChainStep
} from '../../../services/de-ai'
import {
  appendDeaiVoiceProfile,
  buildDeaiVoiceProfile,
  buildDeaiVoiceProfileTraceEvent
} from '../../../services/deaiVoiceProfile'

const lockedStyle = {
  profileVersion: 2 as const,
  locked: true,
  injected: true,
  voice: { protagonistSpeech: '狠、短、少解释', dialogueTags: '动作带话', subtextDensity: '高' },
  prohibitions: [{ id: 'b1', text: '短句只用于动作转折；对白不解释因果', enabled: true }],
}

describe('DEAI voice profile injection', () => {
  it('keeps all generation and deep-fix paths on one voice projection', () => {
    const profile = buildDeaiVoiceProfile(lockedStyle)
    expect(profile).not.toBeNull()

    const prompts = [
      resolveDeaiPromptForChainStep(4, 0, 3),
      resolveDeaiPromptForChainStep(4, 1, 3),
      resolveDeaiPromptForChainStep(4, 2, 3),
      '',
    ].map(prompt => appendDeaiVoiceProfile(prompt, profile))

    for (const prompt of prompts) {
      expect(prompt).toContain('【作者声纹 - 最高风格优先级】')
      expect(prompt).toContain('主角声口：狠、短、少解释')
      expect(prompt).toContain('这些主题以作者声纹为准')
    }
    expect(prompts[0]).toContain(DEAI_METHODOLOGY_PROMPT)
    expect(prompts[1]).toContain(DEAI_CREATIVE_PROMPT)
    expect(prompts[2]).toContain(DEAI_POLISH_PROMPT)
  })

  it('does not inject when the profile is unlocked', () => {
    const profile = buildDeaiVoiceProfile({ ...lockedStyle, locked: false, injected: false })
    expect(profile).toBeNull()
    expect(appendDeaiVoiceProfile(DEAI_METHODOLOGY_PROMPT, profile)).toBe(DEAI_METHODOLOGY_PROMPT)
    expect(buildDeaiVoiceProfileTraceEvent(profile)).toBeNull()
  })

  it('exposes one auditable trace event for the shared projection', () => {
    const event = buildDeaiVoiceProfileTraceEvent(buildDeaiVoiceProfile(lockedStyle))
    expect(event?.type).toBe('deai-voice-profile')
    expect(event?.detail).toContain('"profileVersion":2')
    expect(event?.detail).toContain('sentence-rhythm')
    expect(event?.detail).toContain('dialogue')
  })
})
