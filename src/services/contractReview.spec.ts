import { describe, expect, it } from 'vitest'
import { reviewVolumeContractSemantics } from './contractReview'

describe('reviewVolumeContractSemantics', () => {
  it('marks an explicit forbidden-final-card reveal as contract broken', () => {
    const review = reviewVolumeContractSemantics({
      prose: '沈萤看着信纸，母亲身世终于揭晓：她就是全书头号宿敌留下的唯一血脉。',
      forbiddenFinalCards: ['全书头号宿敌', '母亲身世']
    })

    expect(review.status).toBe('contract_broken')
    expect(review.detected).toBe(true)
    expect(review.findings.map(item => item.card)).toContain('母亲身世')
    expect(review.findings[0].excerpt).toContain('母亲身世终于揭晓')
  })

  it('does not flag a normal chapter that only pushes the public plot line', () => {
    const review = reviewVolumeContractSemantics({
      prose: '沈萤把纸条藏进袖口，转身走进雨里的灯塔。她只知道，自己还要查下去。',
      forbiddenFinalCards: ['全书头号宿敌', '母亲身世']
    })

    expect(review).toEqual({
      status: 'contract_safe',
      detected: false,
      findings: []
    })
  })

  it('marks a suspicious forbidden-card mention without an explicit reveal as needs reinforcement', () => {
    const review = reviewVolumeContractSemantics({
      prose: '桌上出现了和母亲身世有关的旧照片，但没有说明任何真相。',
      forbiddenFinalCards: ['母亲身世']
    })

    expect(review.status).toBe('contract_needs_reinforcement')
    expect(review.detected).toBe(true)
    expect(review.findings[0].card).toBe('母亲身世')
  })

  it('ignores pending placeholders and empty cards', () => {
    const review = reviewVolumeContractSemantics({
      prose: '这一章保持悬念，不解释任何终局问题。',
      forbiddenFinalCards: ['', '[待补充]']
    })

    expect(review.status).toBe('contract_safe')
    expect(review.detected).toBe(false)
  })
})
