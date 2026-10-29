import { describe, expect, it } from 'vitest'
import {
  DEAI_CREATIVE_PROMPT,
  DEAI_METHODOLOGY_PROMPT,
  DEAI_POLISH_PROMPT,
  resolveDeaiPromptForChainStep,
} from '../../../services/de-ai'
import {
  DEFAULT_SKILL_DEAI_META,
  SKILL_DEAI_CONTRACT_VERSION,
  resolveDeaiPromptConflict,
  resolveDeaiPromptForSkillStep,
  validateSkillDeaiMeta,
} from '../../../services/skillDeaiContract'
import {
  appendDeaiVoiceProfile,
  buildDeaiVoiceProfile,
  buildDeaiVoiceProfileTraceEvent,
} from '../../../services/deaiVoiceProfile'

const guideSource = await import('node:fs')
  .then(fs => fs.readFileSync(new URL('../../../../_audit/FOLDER_SKILL_DEAI_CONTRACT_GUIDE_2026-10-29.md', import.meta.url), 'utf8'))
  .catch(() => '')

const pipelineSource = await import('node:fs')
  .then(fs => fs.readFileSync(new URL('../PipelinePanel.vue', import.meta.url), 'utf8'))
  .catch(() => '')

const settingsSource = await import('node:fs')
  .then(fs => fs.readFileSync(new URL('../../settings/DeAiSettings.vue', import.meta.url), 'utf8'))
  .catch(() => '')

const RETAINED_DEAI_EVENT_TYPES = [
  'deai-prompt-variant',
  'deai-voice-profile',
  'deai-injection-policy',
  'deai-contract-warning',
  'deai-conflict-policy',
  'deai-kernel-v2',
  'deai-score',
  'deai-change-rate',
  'deai-style-drift',
  'deai-quality-gate-degraded',
]

const retainedAuditSource = await import('node:fs')
  .then(fs => fs.readFileSync(new URL('../../../stores/runTrace.ts', import.meta.url), 'utf8'))
  .catch(() => '')

describe('DEAI injection policy integration contract', () => {
  it('keeps the contract, tests, and folder SKILL guide on the same fields and values', () => {
    expect(SKILL_DEAI_CONTRACT_VERSION).toBe(1)
    expect(DEFAULT_SKILL_DEAI_META).toEqual({
      contractVersion: 1,
      generation: 'on',
      finalStepDetection: 'on',
      conflictPolicy: 'report',
    })

    expect(guideSource).toContain('版本：v1（对应 `contractVersion: 1`）')
    expect(guideSource).toContain('`generation` | `on` / `off` / `suffix-only` | `on`')
    expect(guideSource).toContain('`finalStepDetection` | `on` / `off` | `on`')
    expect(guideSource).toContain('`conflictPolicy` | `report` / `skill-wins` / `app-wins` | `report`')
    expect(guideSource).toContain('不得通过 `meta.deai` 覆盖用户的 `hardRuleMode`')
    expect(guideSource).toContain('跳过手册更新等同发布未完成')
  })

  it('keeps every projection and policy event in the retained audit whitelist', () => {
    for (const eventType of RETAINED_DEAI_EVENT_TYPES) {
      expect(retainedAuditSource).toContain(`'${eventType}'`)
    }
  })

  it('shows the skill-declared final-step shutdown next to the user post-processing mode', () => {
    expect(pipelineSource).toContain("type: 'deai-injection-policy'")
    expect(pipelineSource).toContain('policy: projection.policy')

    expect(settingsSource).toContain("event.type === 'deai-injection-policy'")
    expect(settingsSource).toContain("detail.step === 4")
    expect(settingsSource).toContain("detail.policy?.finalStepDetection === 'off'")
    expect(settingsSource).toContain('终步降AI检测已由 SKILL 声明关闭')
    expect(settingsSource).toContain('用户后处理模式仍为：{{ hardRuleModeLabel }}')
    const declarationStart = settingsSource.indexOf('id="deai-skill-final-step-detection"')
    const reportStart = settingsSource.indexOf('id="deai-detect-report"')
    expect(declarationStart).toBeGreaterThanOrEqual(0)
    expect(reportStart).toBeGreaterThanOrEqual(0)
    expect(declarationStart).toBeLessThan(reportStart)
    expect(settingsSource).toContain("'deep-fix': '深度修复'")
    expect(settingsSource).toContain("'detect-report': '检测报告'")
    expect(settingsSource).toContain("'legacy-auto': '兼容清洗'")
  })

  it('projects one locked author voice across all three chain steps and its trace event', () => {
    const profile = buildDeaiVoiceProfile({
      profileVersion: 2,
      locked: true,
      injected: true,
      voice: { protagonistSpeech: '狠、短、少解释', dialogueTags: '动作带话', subtextDensity: '高' },
      positiveRules: [{ id: 'p1', text: '关键转折使用短句', enabled: true }],
      prohibitions: [{ id: 'b1', text: '禁止连续三句短句碎片', enabled: true }],
    })
    expect(profile).not.toBeNull()

    const projections = [0, 1, 2].map(chainIndex => resolveDeaiPromptForSkillStep(
      4,
      chainIndex,
      3,
      DEFAULT_SKILL_DEAI_META,
      { voiceProfile: profile },
    ))

    projections.forEach(projection => {
      expect(projection.source).toBe('skill-declared')
      expect(projection.prompt).toContain('【作者声纹 - 最高风格优先级】')
      expect(projection.prompt).toContain('主角声口：狠、短、少解释')
      expect(projection.prompt).toContain('关键转折使用短句')
      expect(projection.prompt).toBe(appendDeaiVoiceProfile(
        resolveDeaiPromptForChainStep(4, projections.indexOf(projection), 3),
        profile,
      ))
    })
    const expectedAttachment = projections[0]!.prompt.slice(
      projections[0]!.prompt.indexOf('【作者声纹 - 最高风格优先级】'),
    )
    projections.forEach(projection => {
      expect(projection.prompt.endsWith(expectedAttachment)).toBe(true)
    })

    const traceEvent = buildDeaiVoiceProfileTraceEvent(profile)
    const traceDetail = JSON.parse(String(traceEvent?.detail || '{}'))
    expect(traceDetail.source).toBe(profile?.source)
    expect(traceDetail.profileVersion).toBe(profile?.profileVersion)
    expect(traceDetail.injectedChars).toBe(profile?.injectedChars)
    expect(traceDetail.truncated).toBe(profile?.truncated)
    expect(traceDetail.sections).toEqual(profile?.sections)
    expect(traceDetail.conflicts).toEqual(profile?.conflicts)
  })

  it('keeps suffix-only and on projections identical in contract v1', () => {
    const onProjection = resolveDeaiPromptForSkillStep(
      4,
      1,
      3,
      { contractVersion: 1, generation: 'on' },
      { voiceProfile: null },
    )
    const suffixOnlyProjection = resolveDeaiPromptForSkillStep(
      4,
      1,
      3,
      { contractVersion: 1, generation: 'suffix-only' },
      { voiceProfile: null },
    )

    expect(suffixOnlyProjection.prompt).toBe(onProjection.prompt)
    expect(suffixOnlyProjection.variant).toBe(onProjection.variant)
    expect(suffixOnlyProjection.source).toBe(onProjection.source)
    expect(suffixOnlyProjection.policy.generation).toBe('suffix-only')
  })

  it('uses one contract projection for folder and agent paths', () => {
    const chainCases = [
      [0, 3],
      [1, 3],
      [2, 3],
      [undefined, undefined],
    ] as const
    const expectedPrompts = [
      DEAI_METHODOLOGY_PROMPT,
      DEAI_CREATIVE_PROMPT,
      DEAI_POLISH_PROMPT,
      DEAI_METHODOLOGY_PROMPT,
    ]

    chainCases.forEach(([chainIndex, chainCount], index) => {
      const folderProjection = resolveDeaiPromptForSkillStep(
        4,
        chainIndex,
        chainCount,
        DEFAULT_SKILL_DEAI_META,
        { voiceProfile: null },
      )
      const agentProjection = resolveDeaiPromptForSkillStep(
        4,
        chainIndex,
        chainCount,
        null,
        { voiceProfile: null },
      )

      expect(folderProjection.prompt).toBe(expectedPrompts[index])
      expect(agentProjection.prompt).toBe(expectedPrompts[index])
      expect(folderProjection.variant).toBe(agentProjection.variant)
      expect(folderProjection.source).toBe('skill-declared')
      expect(agentProjection.source).toBe('app-default-no-skill-meta')
      expect(folderProjection.policy).toEqual(agentProjection.policy)
    })
  })

  it('keeps the real agent call path wired to skill-declared meta', () => {
    const agentProjection = resolveDeaiPromptForSkillStep(
      4,
      2,
      3,
      { contractVersion: 1, generation: 'off' },
      { voiceProfile: null },
    )

    expect(agentProjection.prompt).toBe('')
    expect(agentProjection.variant).toBe('off')
    expect(agentProjection.source).toBe('skill-disabled')

    expect(pipelineSource).toContain(
      'const skillDeaiMeta = skillDeaiMetaParam ?? null',
    )
    expect(pipelineSource).toContain(
      'const deaiProjection = resolveDeaiProjection(step, chainSkillIndex, chainSkillCount, skillDeaiMeta)',
    )
    expect(pipelineSource).toContain(
      'resolveSkillDeaiMetaFromTemplate(template)',
    )
    expect(pipelineSource).toContain(
      "meta: templates.find(t => resolveSkillDeaiMetaFromTemplate(t) !== null)?.meta",
    )
  })

  it('keeps contract fallback observable instead of silently failing', () => {
    const invalidMeta: unknown = {
      contractVersion: '1.0',
      generation: 'maybe',
      unknownField: true,
    }
    const validation = validateSkillDeaiMeta(invalidMeta)

    expect(validation.valid).toBe(false)
    expect(validation.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('contractVersion'),
      expect.stringContaining('generation'),
      expect.stringContaining('unknownField'),
    ]))
    expect(validation.warnings).toHaveLength(validation.errors.length)

    const projection = resolveDeaiPromptForSkillStep(
      4,
      0,
      3,
      invalidMeta as never,
      { voiceProfile: null },
    )
    expect(projection.prompt).toBe(DEAI_METHODOLOGY_PROMPT)
    expect(projection.source).toBe('skill-declared')
  })

  it('removes overlapping app projection only when the skill declares skill-wins', () => {
    const template = '正文模板规则：短句只用于关键转折；对白不得解释因果。'
    const report = resolveDeaiPromptConflict(
      template,
      resolveDeaiPromptForSkillStep(4, 0, 3, { conflictPolicy: 'report' }, { voiceProfile: null }),
    )
    expect(report.prompt).toBe(DEAI_METHODOLOGY_PROMPT)
    expect(report.action).toBe('report')

    const skillWins = resolveDeaiPromptConflict(
      template,
      resolveDeaiPromptForSkillStep(4, 0, 3, { conflictPolicy: 'skill-wins' }, { voiceProfile: null }),
    )
    expect(skillWins.prompt).toBe('')
    expect(skillWins.action).toBe('skill-wins')
  })
})
