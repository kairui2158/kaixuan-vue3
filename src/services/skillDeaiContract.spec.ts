import { describe, expect, it } from 'vitest'
import {
  buildDeaiGuidancePack,
} from './deaiGuidancePack'
import {
  DEFAULT_SKILL_DEAI_META,
  SUFFIX_ONLY_EQUIVALENT_MODE,
  resolveDeaiPromptForSkillStep,
  resolveDeaiPromptConflict,
  validateSkillDeaiMeta,
} from './skillDeaiContract'

describe('folder SKILL DEAI contract', () => {
  it('uses numeric contract version and bounded defaults', () => {
    expect(DEFAULT_SKILL_DEAI_META).toEqual({
      contractVersion: 2,
      generation: 'on',
      finalStepDetection: 'on',
      conflictPolicy: 'skill-wins',
      guidanceOwnership: 'app',
      overlaps: [],
    })
  })

  it('keeps contract v1 packages readable with an explicit migration warning', () => {
    const result = validateSkillDeaiMeta({
      contractVersion: 1,
      generation: 'off',
      conflictPolicy: 'report',
    })

    expect(result.valid).toBe(true)
    expect(result.meta).toEqual({
      contractVersion: 2,
      generation: 'off',
      finalStepDetection: 'on',
      conflictPolicy: 'report',
      guidanceOwnership: 'app',
      overlaps: [],
    })
    expect(result.warnings).toEqual([
      expect.stringContaining('contractVersion 1 已迁移为 2'),
    ])
    expect(result.errors).toEqual([])
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
      expect.stringContaining('contractVersion 仅支持 1 / 2'),
      expect.stringContaining('generation'),
      expect.stringContaining('finalStepDetection'),
      expect.stringContaining('conflictPolicy'),
      expect.stringContaining('unknownField'),
    ]))
    expect(result.warnings).toEqual([
      expect.stringContaining('contractVersion'),
      expect.stringContaining('generation'),
      expect.stringContaining('finalStepDetection'),
      expect.stringContaining('conflictPolicy'),
    ])
    expect(result.meta).toEqual({
      ...DEFAULT_SKILL_DEAI_META,
      conflictPolicy: 'skill-wins',
      guidanceOwnership: 'skill',
    })
  })

  it('keeps generation off truly off and marks it as a skill declaration', () => {
    const projection = resolveDeaiPromptForSkillStep(
      4,
      0,
      3,
      { contractVersion: 2, generation: 'off' },
      { voiceProfile: null },
    )

    expect(projection.prompt).toBe('')
    expect(projection.variant).toBe('off')
    expect(projection.source).toBe('skill-disabled')
    expect(projection.policy.generation).toBe('off')
  })

  it('keeps suffix-only explicitly equivalent to on in contract v1', () => {
    const methodologyPack = buildDeaiGuidancePack({ role: 'methodology', voiceProfile: null })
    const projection = resolveDeaiPromptForSkillStep(
      4,
      0,
      3,
      { contractVersion: 2, generation: 'suffix-only' },
      { voiceProfile: null },
    )

    expect(SUFFIX_ONLY_EQUIVALENT_MODE).toBe('on')
    expect(projection.prompt).toBe(methodologyPack.text)
    expect(projection.variant).toBe('methodology')
    expect(projection.source).toBe('skill-declared')
    expect(projection.policy.generation).toBe('suffix-only')
  })

  it('projects all chain variants from one prompt authority', () => {
    const profile = { text: '[声纹]\n主角声口：狠、短、少解释', conflicts: [] }
    const expectedPacks = [
      buildDeaiGuidancePack({ role: 'methodology', voiceProfile: null }),
      buildDeaiGuidancePack({ role: 'creative', voiceProfile: null }),
      buildDeaiGuidancePack({ role: 'polish', voiceProfile: null }),
    ]

    for (let index = 0; index < expectedPacks.length; index += 1) {
      const projection = resolveDeaiPromptForSkillStep(4, index, 3, null, { voiceProfile: null })
      expect(projection.prompt).toBe(expectedPacks[index]!.text)
      expect(projection.guidancePack?.hash).toBe(expectedPacks[index]!.hash)
      expect(projection.prompt).not.toContain('【降AI创作约束 - 生成阶段执行】')
      expect(projection.prompt).not.toContain('【降AI创作风格 - 创作执行阶段】')
      expect(projection.prompt).not.toContain('【降AI创作约束 - 打磨阶段】')
    }

    const withVoice = resolveDeaiPromptForSkillStep(4, 2, 3, null, {
      voiceProfile: profile as never,
    })
    expect(withVoice.prompt).toContain(expectedPacks[2]!.text)
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
      { contractVersion: 2 },
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
      { contractVersion: 2, generation: 'on' },
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
      { contractVersion: 2, conflictPolicy: 'skill-wins', guidanceOwnership: 'app' },
      { voiceProfile: null },
    )
    const conflictingTemplate = '正文规则：短句只用于动作转折，对白不得解释因果。'

    const report = resolveDeaiPromptConflict(conflictingTemplate, {
      ...projection,
      policy: { ...projection.policy, conflictPolicy: 'report', guidanceOwnership: 'app' },
    })
    expect(report.action).toBe('report')
    expect(report.overlaps).toContain('短句')
    expect(report.prompt).toBe(projection.prompt)

    const skillWins = resolveDeaiPromptConflict(conflictingTemplate, projection)
    expect(skillWins.action).toBe('skill-wins')
    expect(skillWins.prompt).toBe('')

    const appWins = resolveDeaiPromptConflict(conflictingTemplate, {
      ...projection,
      policy: { ...projection.policy, conflictPolicy: 'app-wins', guidanceOwnership: 'app' },
    })
    expect(appWins.action).toBe('app-wins')
    expect(appWins.prompt).toBe(projection.prompt)
  })

  it('derives guidance ownership from the declared contract when it is omitted', () => {
    expect(validateSkillDeaiMeta({ conflictPolicy: 'skill-wins' }).meta.guidanceOwnership).toBe('skill')
    expect(validateSkillDeaiMeta({ conflictPolicy: 'app-wins' }).meta.guidanceOwnership).toBe('app')
    expect(validateSkillDeaiMeta({ conflictPolicy: 'report' }).meta.guidanceOwnership).toBe('app')
    expect(validateSkillDeaiMeta(null).meta.guidanceOwnership).toBe('app')
    expect(validateSkillDeaiMeta({ guidanceOwnership: 'other' }).valid).toBe(false)
  })

  it('withdraws app guidance injection when the skill owns guidance', () => {
    const projection = resolveDeaiPromptForSkillStep(
      4,
      0,
      3,
      { contractVersion: 2, guidanceOwnership: 'skill' },
      { voiceProfile: null },
    )

    expect(projection.prompt).toBe('')
    expect(projection.guidancePack).toBeNull()
    expect(projection.variant).toBe('methodology')
    expect(projection.source).toBe('skill-declared')
    expect(projection.policy.guidanceOwnership).toBe('skill')
  })

  it('validates declared overlaps and merges them with keyword overlaps', () => {
    expect(validateSkillDeaiMeta({ overlaps: '短句' }).valid).toBe(false)
    expect(validateSkillDeaiMeta({ overlaps: ['短句', ''] }).valid).toBe(false)
    expect(validateSkillDeaiMeta({ overlaps: ['短句'] }).valid).toBe(true)

    const projection = resolveDeaiPromptForSkillStep(
      4,
      0,
      3,
      { contractVersion: 2, overlaps: ['自定义域'] },
      { voiceProfile: null },
    )
    const report = resolveDeaiPromptConflict('正文规则：短句与自定义域。', projection)

    expect(report.overlaps).toEqual(expect.arrayContaining(['短句', '自定义域']))
    expect(report.overlapOrigins).toEqual(expect.arrayContaining(['keyword', 'declared']))
  })
})
