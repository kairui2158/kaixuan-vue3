import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import {
  buildDeaiGuidancePack,
  buildDeaiGuidancePackTraceEvent,
} from '../../../services/deaiGuidancePack'
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

const memoryExtractorSource = await import('node:fs')
  .then(fs => fs.readFileSync(new URL('../../../services/memoryExtractor.ts', import.meta.url), 'utf8'))
  .catch(() => '')

const physicalCallProjectionSource = await import('node:fs')
  .then(fs => fs.readFileSync(new URL('../../../services/physicalCallTraceProjection.ts', import.meta.url), 'utf8'))
  .catch(() => '')

const settingsSource = await import('node:fs')
  .then(fs => fs.readFileSync(new URL('../../settings/DeAiSettings.vue', import.meta.url), 'utf8'))
  .catch(() => '')

const settingsObservationSource = await import('node:fs')
  .then(fs => fs.readFileSync(new URL('../../settings/DeAiSettingsObservations.ts', import.meta.url), 'utf8'))
  .catch(() => '')

const RETAINED_DEAI_EVENT_TYPES = [
  'deai-prompt-variant',
  'deai-voice-profile',
  'deai-guidance-pack',
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
    expect(SKILL_DEAI_CONTRACT_VERSION).toBe(2)
    expect(DEFAULT_SKILL_DEAI_META).toEqual({
      contractVersion: 2,
      generation: 'on',
      finalStepDetection: 'on',
      conflictPolicy: 'skill-wins',
      guidanceOwnership: 'app',
      overlaps: [],
    })

    expect(guideSource).toContain('版本：v2（对应 `contractVersion: 2`）')
    expect(guideSource).toContain('`generation` | `on` / `off` / `suffix-only` | `on`')
    expect(guideSource).toContain('`finalStepDetection` | `on` / `off` | `on`')
    expect(guideSource).toContain('`conflictPolicy` | `report` / `skill-wins` / `app-wins` | `skill-wins`')
    expect(guideSource).toContain('`guidanceOwnership` | `skill` / `app` / `split` | `app`')
    expect(guideSource).toContain('`overlaps` | 字符串数组 | `[]`')
    expect(guideSource).toContain('contractVersion 1 已迁移为 2')
    expect(guideSource).toContain('不得通过 `meta.deai` 覆盖用户的 `hardRuleMode`')
    expect(guideSource).toContain('跳过手册更新等同发布未完成')
  })

  it('keeps every projection and policy event in the retained audit whitelist', () => {
    for (const eventType of RETAINED_DEAI_EVENT_TYPES) {
      expect(retainedAuditSource).toContain(`'${eventType}'`)
    }
  })

  it('emits the guidance-pack budget event from both production call paths', () => {
    const pack = buildDeaiGuidancePack({ role: 'creative', voiceProfile: null })
    const event = buildDeaiGuidancePackTraceEvent(pack, {
      step: 4,
      skillIndex: 1,
      totalSkillCount: 3,
    })
    const detail = JSON.parse(String(event?.detail || '{}'))

    expect(event?.type).toBe('deai-guidance-pack')
    expect(detail.guidanceChars).toBe(pack.guidanceChars)
    expect(detail.voiceProfileChars).toBe(pack.voiceProfileChars)
    expect(detail.totalInjectionChars).toBe(pack.totalInjectionChars)
    expect(detail.totalInjectionChars).toBeLessThanOrEqual(1900)

    expect(pipelineSource).toContain('buildDeaiGuidancePackTraceEvent(')
    expect(pipelineSource.match(/buildDeaiGuidancePackTraceEvent\(/g) || []).toHaveLength(2)
    expect(pipelineSource).toContain(
      'buildDeaiGuidancePackTraceEvent(deaiProjection.guidancePack, {',
    )
    expect(pipelineSource).toContain(
      "const guidancePackTraceEvent = deaiProjection.guidancePack",
    )
    expect(pipelineSource).toContain(
      'if (traceRunId && guidancePackTraceEvent && systemPromptSuffix)',
    )
    expect(pipelineSource).toContain(
      "if (runId && deaiVariant !== 'off') {",
    )
    expect(pipelineSource).toContain(
      "runTraceStore.addEvent(traceRunId, guidancePackTraceEvent)",
    )
    expect(pipelineSource).toContain(
      "runTraceStore.addEvent(runId, guidancePackTraceEvent)",
    )
  })

  it('keeps runtime UI and guidance copy aligned with the actual guidance pack', async () => {
    const pipelineSource = fs.readFileSync(
      new URL('../PipelinePanel.vue', import.meta.url),
      'utf8',
    )
    const helpSource = await fs.promises.readFile(
      new URL('../../common/HelpGuide.vue', import.meta.url),
      'utf8',
    )
    const traceSource = await fs.promises.readFile(
      new URL('../../../../src/services/deaiGuidancePack.ts', import.meta.url),
      'utf8',
    )

    for (const source of [pipelineSource, helpSource]) {
      expect(source).not.toContain('17条')
      expect(source).not.toContain('硬规则清洗')
      expect(source).not.toContain('硬规则后处理')
    }

    expect(pipelineSource).toContain('id="pl-deai-guidance-badge"')
    expect(pipelineSource).toContain('displayedBodyDeaiGuidanceBadge')
    expect(pipelineSource).toContain('displayedBodyDeaiGuidanceFeedback')
    expect(pipelineSource).toContain('informational-only')
    expect(pipelineSource).toContain('resolveDeaiChainGuidanceDisplay')
    expect(pipelineSource).toContain('displayedBodyDeaiGuidanceBadge')
    expect(pipelineSource).toContain('SKILL 方法指导接管 · 0注入')
    expect(pipelineSource).toContain('应用方法指导关闭')
    expect(pipelineSource).toContain('方法指导混合 · 展开查看')
    expect(pipelineSource).toContain('未观测到方法指导契约')
    expect(pipelineSource).not.toContain('deaiGuidanceTraceForRun')
    expect(helpSource).toContain('生成前提供方法指导')
    expect(helpSource).toContain('不改写正文')
    expect(traceSource).toContain('已构造：${itemCount}条 / ${pack.guidanceChars}字符')
  })

  it('shows the skill-declared final-step shutdown next to the user post-processing mode', () => {
    expect(pipelineSource).toContain("type: 'deai-injection-policy'")
    expect(pipelineSource).toContain('policy: projection.policy')

    expect(settingsSource).toContain("import { collectDeaiSettingsObservations } from './DeAiSettingsObservations'")
    expect(settingsSource).toContain('return collectDeaiSettingsObservations(runTraceStore.runs)')
    expect(settingsObservationSource).toContain("event.type === 'deai-injection-policy'")
    expect(settingsObservationSource).toContain("import { BODY_LAYER_STEP } from '../../services/skillDeaiContract'")
    expect(settingsObservationSource).toContain("run.source === 'home'")
    expect(settingsObservationSource).toContain("run.source === 'pipeline'")
    expect(settingsObservationSource).toContain("detail.step === BODY_LAYER_STEP")
    expect(settingsObservationSource).toContain("detail.policy?.finalStepDetection === 'off'")
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
        buildDeaiGuidancePack({
          role: projection.variant === 'off' ? 'methodology' : projection.variant,
          voiceProfile: profile,
        }).text,
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
      { contractVersion: 2, generation: 'on' },
      { voiceProfile: null },
    )
    const suffixOnlyProjection = resolveDeaiPromptForSkillStep(
      4,
      1,
      3,
      { contractVersion: 2, generation: 'suffix-only' },
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
    const expectedPacks = [
      buildDeaiGuidancePack({ role: 'methodology', voiceProfile: null }),
      buildDeaiGuidancePack({ role: 'creative', voiceProfile: null }),
      buildDeaiGuidancePack({ role: 'polish', voiceProfile: null }),
      buildDeaiGuidancePack({ role: 'methodology-compose', voiceProfile: null }),
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

      expect(folderProjection.prompt).toBe(expectedPacks[index]!.text)
      expect(agentProjection.prompt).toBe(expectedPacks[index]!.text)
      expect(folderProjection.guidancePack?.hash).toBe(expectedPacks[index]!.hash)
      expect(folderProjection.prompt).not.toContain('【降AI创作约束 - 生成阶段执行】')
      expect(folderProjection.prompt).not.toContain('【降AI创作风格 - 创作执行阶段】')
      expect(folderProjection.prompt).not.toContain('【降AI创作约束 - 打磨阶段】')
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
      { contractVersion: 2, generation: 'off' },
      { voiceProfile: null },
    )

    expect(agentProjection.prompt).toBe('')
    expect(agentProjection.variant).toBe('off')
    expect(agentProjection.source).toBe('skill-disabled')

    expect(pipelineSource).toContain(
      'const skillDeaiMeta = skillDeaiMetaParam ?? null',
    )
    expect(pipelineSource).toContain(
      'const deaiProjection = resolveDeaiProjection(step, chainSkillIndex, chainSkillCount, skillDeaiMeta, pipelineRunIdParam)',
    )
    expect(pipelineSource).toContain(
      'resolveSkillDeaiMetaFromTemplate(template)',
    )
    expect(pipelineSource).toContain(
      "meta: templates.find(t => resolveSkillDeaiMetaFromTemplate(t) !== null)?.meta",
    )
  })

  it('keeps the retired agent variant wrapper from returning', () => {
    expect(pipelineSource).not.toContain('async function callApiWithAgentVariant(')
    expect(pipelineSource).toContain('async function callApiWithAgentVariantOwned(')
    expect(pipelineSource).toContain('await callApiWithAgentVariantOwned(')

    const retiredWrapperReferences = pipelineSource.match(
      /callApiWithAgentVariant(?!Owned)/g,
    ) || []
    expect(retiredWrapperReferences).toHaveLength(0)
  })

  it('keeps direct pipeline AI paths observable for cache composition', () => {
    expect(pipelineSource).toContain('layer: pipelineLayerForStep(step)')
    expect(pipelineSource).toContain('stableSystemPrefix: systemPrompt')
    expect(pipelineSource).toContain("layer: 'body'")
    expect(memoryExtractorSource).toContain('contextComposition: trace?.contextComposition')
    expect(pipelineSource).toContain('contextComposition,')

    const directCallSites = pipelineSource.match(/aiService\.callAi\(/g) || []
    const compositionMarkers = pipelineSource.match(/contextComposition[,:]/g) || []
    expect(directCallSites.length).toBeGreaterThan(0)
    expect(compositionMarkers.length).toBeGreaterThanOrEqual(directCallSites.length)

    const physicalHandlers = pipelineSource.match(/projectPhysicalCallEvent\(event\)/g) || []
    expect(physicalHandlers).toHaveLength(5)
    expect(physicalCallProjectionSource).toContain('cacheUsageSummary: event.cacheUsageSummary')
    expect(physicalCallProjectionSource).toContain('contextComposition: event.contextComposition')
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
    expect(validation.warnings).toEqual([
      expect.stringContaining('contractVersion'),
      expect.stringContaining('generation'),
    ])

    const projection = resolveDeaiPromptForSkillStep(
      4,
      0,
      3,
      invalidMeta as never,
      { voiceProfile: null },
    )
    const methodologyPack = buildDeaiGuidancePack({ role: 'methodology', voiceProfile: null })
    expect(projection.prompt).toBe(methodologyPack.text)
    expect(projection.source).toBe('skill-declared')
  })

  it('removes overlapping app projection only when the skill declares skill-wins', () => {
    const template = '正文模板规则：短句只用于关键转折；对白不得解释因果。'
    const methodologyPack = buildDeaiGuidancePack({ role: 'methodology', voiceProfile: null })
    const report = resolveDeaiPromptConflict(
      template,
      resolveDeaiPromptForSkillStep(4, 0, 3, { conflictPolicy: 'report', guidanceOwnership: 'app' }, { voiceProfile: null }),
    )
    expect(report.prompt).toBe(methodologyPack.text)
    expect(report.action).toBe('report')

    const skillWins = resolveDeaiPromptConflict(
      template,
      resolveDeaiPromptForSkillStep(4, 0, 3, { conflictPolicy: 'skill-wins', guidanceOwnership: 'app' }, { voiceProfile: null }),
    )
    expect(skillWins.prompt).toBe('')
    expect(skillWins.action).toBe('skill-wins')
  })

  it('withdraws guidance from both production paths when the skill owns guidance', () => {
    const projection = resolveDeaiPromptForSkillStep(
      4,
      2,
      3,
      { contractVersion: 2, guidanceOwnership: 'skill' },
      { voiceProfile: null },
    )

    expect(projection.prompt).toBe('')
    expect(projection.guidancePack).toBeNull()
    expect(projection.source).toBe('skill-declared')

    expect(pipelineSource).toContain('deaiProjection.guidancePack')
    expect(pipelineSource).toContain(
      'deaiProjection.policy.guidanceOwnership === \'skill\'',
    )
  })
})
