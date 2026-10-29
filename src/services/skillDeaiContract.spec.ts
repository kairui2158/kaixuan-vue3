import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SKILL_DEAI_META,
  SUFFIX_ONLY_EQUIVALENT_MODE,
  resolveDeaiPromptForSkillStep,
  resolveDeaiPromptConflict,
  validateSkillDeaiMeta,
} from './skillDeaiContract'
import {
  DEAI_CREATIVE_PROMPT,
  DEAI_METHODOLOGY_PROMPT,
  DEAI_POLISH_PROMPT,
} from './de-ai'

describe('folder SKILL DEAI contract', () => {
  it('uses numeric contract version and bounded defaults', () => {
    expect(DEFAULT_SKILL_DEAI_META).toEqual({
      contractVersion: 1,
      generation: 'on',
      finalStepDetection: 'on',
      conflictPolicy: 'report',
    })
  })

  it('reports errors, warnings, and normalized meta for invalid declarations', () => {
    const result = validateSkillDeaiMeta({
      contractVersion: '1.0',
      generation: 'maybe',
      finalStepDetection: true,
      conflictPolicy: 'overwrite',
      unknownField: true,
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('contractVersion'),
      expect.stringContaining('generation'),
      expect.stringContaining('finalStepDetection'),
      expect.stringContaining('conflictPolicy'),
      expect.stringContaining('unknownField'),
    ]))
    expect(result.warnings).toHaveLength(result.errors.length)
    expect(result.meta).toEqual(DEFAULT_SKILL_DEAI_META)
  })

  it('keeps generation off truly off and marks it as a skill declaration', () => {
    const projection = resolveDeaiPromptForSkillStep(
      4,
      0,
      3,
      { contractVersion: 1, generation: 'off' },
      { voiceProfile: null },
    )

    expect(projection.prompt).toBe('')
    expect(projection.variant).toBe('off')
    expect(projection.source).toBe('skill-disabled')
    expect(projection.policy.generation).toBe('off')
  })

  it('keeps suffix-only explicitly equivalent to on in contract v1', () => {
    const projection = resolveDeaiPromptForSkillStep(
      4,
      0,
      3,
      { contractVersion: 1, generation: 'suffix-only' },
      { voiceProfile: null },
    )

    expect(SUFFIX_ONLY_EQUIVALENT_MODE).toBe('on')
    expect(projection.prompt).toBe(DEAI_METHODOLOGY_PROMPT)
    expect(projection.variant).toBe('methodology')
    expect(projection.source).toBe('skill-declared')
    expect(projection.policy.generation).toBe('suffix-only')
  })

  it('projects all chain variants from one prompt authority', () => {
    const profile = { text: '[声纹]\n主角声口：狠、短、少解释', conflicts: [] }

    expect(resolveDeaiPromptForSkillStep(4, 0, 3, null, { voiceProfile: null }).prompt)
      .toBe(DEAI_METHODOLOGY_PROMPT)
    expect(resolveDeaiPromptForSkillStep(4, 1, 3, null, { voiceProfile: null }).prompt)
      .toBe(DEAI_CREATIVE_PROMPT)
    expect(resolveDeaiPromptForSkillStep(4, 2, 3, null, { voiceProfile: null }).prompt)
      .toBe(DEAI_POLISH_PROMPT)

    const withVoice = resolveDeaiPromptForSkillStep(4, 2, 3, null, {
      voiceProfile: profile as never,
    })
    expect(withVoice.prompt).toContain(DEAI_POLISH_PROMPT)
    expect(withVoice.prompt).toContain('主角声口')
  })

  it('identifies variants and sources without a second prompt semantic', () => {
    const cases = [
      [0, 3, 'methodology'],
      [1, 3, 'creative'],
      [2, 3, 'polish'],
      [0, 1, 'methodology'],
      [undefined, undefined, 'methodology-compose'],
    ] as const

    for (const [chainIndex, chainCount, variant] of cases) {
      const projection = resolveDeaiPromptForSkillStep(
        4,
        chainIndex,
        chainCount,
        { contractVersion: 1 },
        { voiceProfile: null },
      )
      expect(projection.variant).toBe(variant)
      expect(projection.source).toBe('skill-declared')
    }

    expect(resolveDeaiPromptForSkillStep(4, 0, 3, null, { voiceProfile: null }).source)
      .toBe('app-default-no-skill-meta')
  })

  it('does not inject generation prompts outside the body layer', () => {
    const projection = resolveDeaiPromptForSkillStep(
      1,
      0,
      3,
      { contractVersion: 1, generation: 'on' },
      { voiceProfile: null },
    )

    expect(projection.prompt).toBe('')
    expect(projection.variant).toBe('off')
    expect(projection.policy.generation).toBe('on')
  })

  it('resolves overlapping template rules by the declared conflict policy', () => {
    const projection = resolveDeaiPromptForSkillStep(
      4,
      0,
      3,
      { contractVersion: 1, conflictPolicy: 'skill-wins' },
      { voiceProfile: null },
    )
    const conflictingTemplate = '正文规则：短句只用于动作转折，对白不得解释因果。'

    const report = resolveDeaiPromptConflict(conflictingTemplate, {
      ...projection,
      policy: { ...projection.policy, conflictPolicy: 'report' },
    })
    expect(report.action).toBe('report')
    expect(report.overlaps).toContain('短句')
    expect(report.prompt).toBe(projection.prompt)

    const skillWins = resolveDeaiPromptConflict(conflictingTemplate, projection)
    expect(skillWins.action).toBe('skill-wins')
    expect(skillWins.prompt).toBe('')

    const appWins = resolveDeaiPromptConflict(conflictingTemplate, {
      ...projection,
      policy: { ...projection.policy, conflictPolicy: 'app-wins' },
    })
    expect(appWins.action).toBe('app-wins')
    expect(appWins.prompt).toBe(projection.prompt)
  })
})
