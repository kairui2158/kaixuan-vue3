import { describe, expect, it } from 'vitest'
import { detectVolumeContractSkillVerdict, observeVolumeContractMentions } from './contractReview'

describe('observeVolumeContractMentions', () => {
  it('records forbidden-card mentions without inferring early reveal', () => {
    const review = observeVolumeContractMentions({
      prose: '沈萤看着信纸，母亲身世终于揭晓：她就是全书头号宿敌留下的唯一血脉。',
      forbiddenFinalCards: ['全书头号宿敌', '母亲身世']
    })

    expect(review.status).toBe('card_mention_observed')
    expect(review.detected).toBe(true)
    expect(review.findings.map(item => item.card)).toContain('母亲身世')
    expect(review.findings[0].excerpt).toContain('母亲身世终于揭晓')
    expect(review.skillVerdict.status).toBe('undeclared')
    expect(review.ownership).toBe('app_protocol_observation')
  })

  it('does not flag a normal chapter that only pushes the public plot line', () => {
    const review = observeVolumeContractMentions({
      prose: '沈萤把纸条藏进袖口，转身走进雨里的灯塔。她只知道，自己还要查下去。',
      forbiddenFinalCards: ['全书头号宿敌', '母亲身世']
    })

    expect(review).toEqual({
      status: 'no_card_mentions',
      detected: false,
      findings: [],
      skillVerdict: { status: 'undeclared', reason: null },
      ownership: 'app_protocol_observation'
    })
  })

  it('keeps a suspicious forbidden-card mention as observation only', () => {
    const review = observeVolumeContractMentions({
      prose: '桌上出现了和母亲身世有关的旧照片，但没有说明任何真相。',
      forbiddenFinalCards: ['母亲身世']
    })

    expect(review.status).toBe('card_mention_observed')
    expect(review.detected).toBe(true)
    expect(review.findings[0].card).toBe('母亲身世')
  })

  it('ignores pending placeholders and empty cards', () => {
    const review = observeVolumeContractMentions({
      prose: '这一章保持悬念，不解释任何终局问题。',
      forbiddenFinalCards: ['', '[待补充]']
    })

    expect(review.status).toBe('no_declared_cards')
    expect(review.detected).toBe(false)
  })

  it('consumes the SKILL-declared contract verdict without local narrative inference', () => {
    const review = observeVolumeContractMentions({
      prose: '沈萤看着信纸，母亲身世终于揭晓：她就是全书头号宿敌留下的唯一血脉。',
      forbiddenFinalCards: ['母亲身世'],
      skillVerdictText: 'contractStatus：broken\ncontractReason：终局底牌提前释放'
    })

    expect(review.status).toBe('card_mention_observed')
    expect(review.skillVerdict).toEqual({
      status: 'broken',
      reason: '终局底牌提前释放'
    })
  })
})

describe('detectVolumeContractSkillVerdict', () => {
  it('parses safe and broken statuses with bracketed labels', () => {
    expect(detectVolumeContractSkillVerdict('【contractStatus】：safe')).toEqual({
      status: 'safe',
      reason: null
    })
    expect(detectVolumeContractSkillVerdict('【contractStatus】：broken\n【contractReason】：禁区提前释放')).toEqual({
      status: 'broken',
      reason: '禁区提前释放'
    })
  })

  it('stays undeclared when the SKILL does not report a verdict', () => {
    expect(detectVolumeContractSkillVerdict('【正文交接】\nFACT_LOCK：位置=灯塔')).toEqual({
      status: 'undeclared',
      reason: null
    })
  })
})
