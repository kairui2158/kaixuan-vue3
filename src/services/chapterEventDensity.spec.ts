import { describe, expect, it } from 'vitest'
import {
  detectChapterEventDensityNotReady,
  evaluateChapterEventIncrement,
  findChapterEventIncrementValue
} from './chapterEventDensity'

describe('detectChapterEventDensityNotReady', () => {
  it('detects the upstream material gap', () => {
    const result = detectChapterEventDensityNotReady(
      'NOT-READY：章级事件密度不足，需上游补剧情点'
    )

    expect(result).toMatchObject({
      detected: true,
      reason: 'upstream_material_gap',
      code: 'chapter-event-density-not-ready'
    })
    expect(result.gap).toContain('章级事件密度不足')
    expect(result.guidance).toContain('章节规划/剧情层')
  })

  it('does not treat an unrelated NOT-READY as a density gap', () => {
    const result = detectChapterEventDensityNotReady('NOT-READY：模型额度不足')

    expect(result.detected).toBe(false)
    expect(result.gap).toBeNull()
    expect(result.guidance).toBe('')
  })

  it('does not match density wording embedded in ordinary prose without NOT-READY', () => {
    const result = detectChapterEventDensityNotReady(
      '本章避免章级事件密度不足的问题，继续推进剧情。'
    )

    expect(result.detected).toBe(false)
  })
})

describe('findChapterEventIncrementValue', () => {
  it('extracts the handoff field', () => {
    const value = findChapterEventIncrementValue(
      '【正文交接】\n事件增量：王芳获得新信息，处境改变。\n【正文交接结束】'
    )

    expect(value).toBe('王芳获得新信息，处境改变。')
  })

  it('returns null when the field is missing', () => {
    expect(findChapterEventIncrementValue('【正文交接】\nFACT_LOCK:位置=仓库')).toBeNull()
  })
})

describe('evaluateChapterEventIncrement', () => {
  it('warns when the required field is missing', () => {
    const result = evaluateChapterEventIncrement(
      '【正文交接】\nFACT_LOCK:位置=仓库\n【正文交接结束】'
    )

    expect(result).toMatchObject({
      detected: true,
      exempted: false,
      distinctBenefitCategoryCount: 0
    })
    expect(result.message).toContain('缺少必填字段「事件增量」')
  })

  it('warns when benefits are homogeneous', () => {
    const result = evaluateChapterEventIncrement(
      '【正文交接】\n事件增量：新信息一，新信息二。\n【正文交接结束】'
    )

    expect(result.detected).toBe(true)
    expect(result.benefitCategories).toEqual(['新信息'])
    expect(result.message).toContain('收益同质')
  })

  it('passes when two distinct benefit categories are declared', () => {
    const result = evaluateChapterEventIncrement(
      '【正文交接】\n事件增量：王芳获得新信息，处境改变。\n【正文交接结束】'
    )

    expect(result).toMatchObject({
      detected: false,
      exempted: false,
      benefitCategories: ['新信息', '处境改变'],
      distinctBenefitCategoryCount: 2
    })
  })

  it('does not flag an exempt quiet chapter as a density failure', () => {
    const result = evaluateChapterEventIncrement(
      '【正文交接】\n豁免：静章\n事件增量：情绪兑现。\n【正文交接结束】'
    )

    expect(result).toMatchObject({
      detected: false,
      exempted: true,
      benefitCategories: ['情绪兑现'],
      distinctBenefitCategoryCount: 1
    })
    expect(result.exemptReason).toContain('静章')
  })
})
