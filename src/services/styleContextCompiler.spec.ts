import { describe, expect, it } from 'vitest'
import { compileStyleContext, STYLE_CONTEXT_BUDGETS } from './styleContextCompiler'

function v2Profile(overrides: Record<string, unknown> = {}) {
  return {
    profileVersion: 2 as const,
    locked: true,
    injected: true,
    styleTags: '末世高武',
    pacingParams: '速度:快节奏, 紧张度:4',
    positioning: {
      coreTemperament: ['冷硬', '快节奏'],
      genreTags: ['末世高武'],
      oneLinePositioning: '用干净动作推进更大世界',
    },
    voice: {
      protagonistSpeech: '短句、直接、少修饰。',
      dialogueTags: '多用道、问、喊。',
      subtextDensity: '中高，试探性提问较多。',
    },
    sentencePatterns: [
      { id: 's1', text: '{环境破坏细节}。{人群反应}。', enabled: true },
      { id: 's2', text: '{主角观察}。{动作}。{直接结果}。', enabled: true },
      { id: 's3', text: '禁用句式', enabled: false },
    ],
    sceneTemplates: [
      { id: 'c1', text: '战斗：动作链短，结果明确。', enabled: true },
    ],
    positiveRules: [{ id: 'p1', text: '动作推进快。', enabled: true }],
    prohibitions: [{ id: 'w1', text: '不写长篇自我解释。', enabled: true }],
    dailyRules: [{ id: 'd1', text: '每章至少推进一项。', enabled: true }],
    ...overrides,
  }
}

type V2ProfileFixture = ReturnType<typeof v2Profile>

describe('styleContextCompiler', () => {
  it('injects zero style context while unlocked', () => {
    const result = compileStyleContext('body', v2Profile({ locked: false, injected: false }))
    expect(result).toMatchObject({ text: '', injectedChars: 0, truncated: false })
  })

  it('keeps V1 semantics for old profiles', () => {
    const result = compileStyleContext('outline', {
      profileVersion: 1,
      locked: true,
      injected: true,
      styleTags: '快节奏',
      pacingParams: '速度:快节奏',
    })
    expect(result.text).toContain('风格标签：快节奏')
    expect(result.text).toContain('节奏参数：速度:快节奏')
    expect(result.text).not.toContain('声口')
  })

  it('uses layer-specific sections for V2 profiles', () => {
    const chapter = compileStyleContext('chapter', v2Profile())
    expect(chapter.text).toContain('[声口]')
    expect(chapter.text).toContain('[句式模式]')
    expect(chapter.text).not.toContain('[场景写法]')
    expect(chapter.text).not.toContain('禁用句式')

    const settings = compileStyleContext('settings', v2Profile())
    expect(settings.text).toContain('[场景写法]')
    expect(settings.text).not.toContain('[声口]')
  })

  it('trims lower-priority sections before prohibitions', () => {
    const longRules = Array.from({ length: 12 }, (_, i) => ({
      id: `r${i}`,
      text: `规则${i}：` + '很长的风格约束'.repeat(25),
      enabled: true,
    }))
    const result = compileStyleContext('body', v2Profile({
      sentencePatterns: longRules,
      sceneTemplates: longRules,
      dailyRules: longRules,
      prohibitions: [{ id: 'w1', text: '警戒线必须保留：不写长篇自我解释。', enabled: true }],
    }))
    expect(result.injectedChars).toBeLessThanOrEqual(STYLE_CONTEXT_BUDGETS.body)
    expect(result.truncated).toBe(true)
    expect(result.truncationReason).toContain('日更规则')
    expect(result.text).toContain('警戒线必须保留')
  })
})
