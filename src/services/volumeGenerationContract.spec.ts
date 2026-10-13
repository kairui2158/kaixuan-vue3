import { describe, expect, it } from 'vitest'
import {
  extractVolumeContractSemantics,
  placeholderVolumeContractSemantics,
  buildVolumeHistoryFacts,
  renderVolumeHistoryContext,
  validateVolumeBatch,
  validateVolumeGenerationLedger,
  type VolumeGenerationContract
} from './volumeGenerationContract'

function contract(overrides: Partial<VolumeGenerationContract> = {}): VolumeGenerationContract {
  return {
    mode: 'auto',
    expectedCount: 3,
    existingCount: 0,
    totalPlannedVolumes: 3,
    semantics: placeholderVolumeContractSemantics(),
    ...overrides
  }
}

function volume(name: string, overrides: Record<string, unknown> = {}) {
  return {
    name,
    outline: `${name}卷纲`,
    summary: `${name}摘要`,
    allocatedWords: 100000,
    readerExpectations: '每卷兑现一次公开成长',
    mainPlotLine: '事业线',
    unlockMilestone: '第一卷只解锁城市级舞台',
    forbiddenFinalCards: ['全书头号宿敌', '母亲身世'],
    contractRisk: 'contract_safe',
    ...overrides
  }
}

describe('buildVolumeHistoryFacts', () => {
  it('builds the full volume ledger with names, summaries, and allocated words', () => {
    const facts = buildVolumeHistoryFacts([
      volume('第一卷', { allocatedWords: 300000 }),
      volume('第二卷', { outline: '', summary: '第二卷摘要' }),
      volume('第三卷', { allocatedWords: 200000 })
    ])

    expect(facts.totalGenerated).toBe(3)
    expect(facts.volumes).toEqual([
      { index: 1, name: '第一卷', summary: '第一卷摘要', allocatedWords: 300000 },
      { index: 2, name: '第二卷', summary: '第二卷摘要', allocatedWords: 100000 },
      { index: 3, name: '第三卷', summary: '第三卷摘要', allocatedWords: 200000 }
    ])
  })

  it('renders no-history context without inventing volumes', () => {
    const rendered = renderVolumeHistoryContext(buildVolumeHistoryFacts([]))

    expect(rendered).toContain('[已生成卷事实清单]\n暂无已生成卷')
  })

  it('renders every generated volume fact', () => {
    const rendered = renderVolumeHistoryContext(buildVolumeHistoryFacts([
      volume('第一卷', { allocatedWords: 300000 }),
      volume('第二卷', { allocatedWords: 200000 })
    ]))

    expect(rendered).toContain('[已生成卷事实清单]')
    expect(rendered).toContain('第1卷《第一卷》')
    expect(rendered).toContain('分配字数：300000')
    expect(rendered).toContain('摘要：第一卷摘要')
    expect(rendered).toContain('第2卷《第二卷》')
    expect(rendered).toContain('分配字数：200000')
  })
})

describe('validateVolumeBatch', () => {
  it('accepts an auto batch that matches the planned volume count', () => {
    const result = validateVolumeBatch([
      volume('第一卷'),
      volume('第二卷'),
      volume('第三卷')
    ], contract())

    expect(result).toEqual({ valid: true, errors: [], missingCount: 0 })
  })

  it('rejects a short auto batch and reports the missing count', () => {
    const result = validateVolumeBatch([
      volume('第一卷'),
      volume('第二卷')
    ], contract())

    expect(result.valid).toBe(false)
    expect(result.missingCount).toBe(1)
    expect(result.errors).toContain('卷数数量不一致：本批声明 3 卷，实际 2 卷')
  })

  it('rejects extra volumes in single and continue modes', () => {
    const result = validateVolumeBatch([
      volume('下一卷'),
      volume('多余卷')
    ], contract({ mode: 'single', expectedCount: 1, existingCount: 2 }))

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('卷数数量不一致：本批声明 1 卷，实际 2 卷')
  })

  it('rejects volumes without names or outline content', () => {
    const result = validateVolumeBatch([
      volume(''),
      volume('第二卷', { outline: '', summary: '' }),
      volume('第三卷')
    ], contract())

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('第 1 卷缺少名称')
    expect(result.errors).toContain('卷「第二卷」缺少卷纲内容')
  })

  it('rejects invalid allocated words', () => {
    const result = validateVolumeBatch([
      volume('第一卷', { allocatedWords: -1 }),
      volume('第二卷', { allocatedWords: 'abc' }),
      volume('第三卷', { allocatedWords: 1.2 })
    ], contract())

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('卷「第一卷」分配字数必须是非负整数')
    expect(result.errors).toContain('卷「第二卷」分配字数必须是非负整数')
    expect(result.errors).toContain('卷「第三卷」分配字数必须是非负整数')
  })

  it('rejects history and batch duplicate names', () => {
    const result = validateVolumeBatch([
      volume('第一卷'),
      volume('第一卷'),
      volume('已存在卷')
    ], contract(), [volume('已存在卷')])

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('卷名重复：「第一卷」')
    expect(result.errors).toContain('卷名与历史重复：「已存在卷」')
  })

  it('accepts semantic fields that are explicitly marked as pending', () => {
    const result = validateVolumeBatch([
      volume('第一卷', {
        readerExpectations: '[待补充]',
        mainPlotLine: '[待补充]',
        unlockMilestone: '[待补充]',
        forbiddenFinalCards: [],
        contractRisk: '[待补充]'
      }),
      volume('第二卷'),
      volume('第三卷')
    ], contract())

    expect(result).toEqual({ valid: true, errors: [], missingCount: 0 })
  })

  it('rejects a volume when any semantic contract field is missing', () => {
    const result = validateVolumeBatch([
      volume('第一卷', {
        readerExpectations: '',
        mainPlotLine: undefined,
        unlockMilestone: ' ',
        forbiddenFinalCards: undefined,
        contractRisk: ''
      }),
      volume('第二卷'),
      volume('第三卷')
    ], contract())

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('卷「第一卷」缺少读者期待契约')
    expect(result.errors).toContain('卷「第一卷」缺少主推线契约')
    expect(result.errors).toContain('卷「第一卷」缺少解锁里程碑契约')
    expect(result.errors).toContain('卷「第一卷」禁碰终局底牌必须是字符串数组')
    expect(result.errors).toContain('卷「第一卷」缺少契约风险')
  })

  it('rejects unknown contract risk values', () => {
    const result = validateVolumeBatch([
      volume('第一卷', { contractRisk: '低风险' }),
      volume('第二卷', { contractRisk: 'contract_broken' }),
      volume('第三卷', { contractRisk: 'contract_needs_reinforcement' })
    ], contract())

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('卷「第一卷」契约风险必须是 contract_safe / contract_needs_reinforcement / contract_broken 或 [待补充]')
  })

  it('rejects non-string forbidden final cards', () => {
    const result = validateVolumeBatch([
      volume('第一卷', { forbiddenFinalCards: ['母亲身世', 42] }),
      volume('第二卷'),
      volume('第三卷')
    ], contract())

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('卷「第一卷」禁碰终局底牌必须是字符串数组')
  })
})

describe('extractVolumeContractSemantics', () => {
  it('normalizes model output into the persisted semantic contract', () => {
    expect(extractVolumeContractSemantics(volume('第一卷'))).toEqual({
      readerExpectations: '每卷兑现一次公开成长',
      mainPlotLine: '事业线',
      unlockMilestone: '第一卷只解锁城市级舞台',
      forbiddenFinalCards: ['全书头号宿敌', '母亲身世'],
      contractRisk: 'contract_safe'
    })
  })

  it('uses explicit placeholders when the model has no answer yet', () => {
    expect(extractVolumeContractSemantics({
      readerExpectations: ' [待补充] ',
      mainPlotLine: '',
      unlockMilestone: undefined,
      forbiddenFinalCards: [' ', 3],
      contractRisk: ' contract_safe '
    })).toEqual({
      readerExpectations: '[待补充]',
      mainPlotLine: '[待补充]',
      unlockMilestone: '[待补充]',
      forbiddenFinalCards: [],
      contractRisk: 'contract_safe'
    })
  })
})

describe('validateVolumeGenerationLedger', () => {
  it('accepts an auto generation that reaches the planned volume count', () => {
    const result = validateVolumeGenerationLedger(3, 3, 'auto')

    expect(result).toEqual({ valid: true, errors: [] })
  })

  it('rejects an auto ledger that is short or over target', () => {
    expect(validateVolumeGenerationLedger(2, 3, 'auto').errors)
      .toContain('卷数台账缺口：当前 2 卷，目标 3 卷')
    expect(validateVolumeGenerationLedger(4, 3, 'auto').errors)
      .toContain('卷数台账超额：当前 4 卷，目标 3 卷')
  })

  it('accepts one-volume progress without crossing the plan ceiling', () => {
    expect(validateVolumeGenerationLedger(3, 5, 'single')).toEqual({ valid: true, errors: [] })
    expect(validateVolumeGenerationLedger(3, 5, 'continue')).toEqual({ valid: true, errors: [] })
  })

  it('rejects single or continue progress that crosses the plan ceiling', () => {
    expect(validateVolumeGenerationLedger(6, 5, 'single').errors)
      .toContain('卷数台账超额：当前 6 卷，目标 5 卷')
    expect(validateVolumeGenerationLedger(6, 5, 'continue').errors)
      .toContain('卷数台账超额：当前 6 卷，目标 5 卷')
  })
})
