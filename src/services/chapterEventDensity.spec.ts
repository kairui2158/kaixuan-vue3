import { describe, expect, it } from 'vitest'
import {
  CHAPTER_NARRATIVE_NOT_READY_CODE,
  detectChapterEventDensityNotReady,
  detectChapterNarrativeVerdict,
  evaluateChapterEventIncrement,
  findChapterEventIncrementValue,
  isChapterNarrativeBlockDiagnosticCode,
  resolveChapterNarrativeBlock
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
  it('warns only when the required protocol field is missing', () => {
    const result = evaluateChapterEventIncrement(
      '【正文交接】\nFACT_LOCK:位置=仓库\n【正文交接结束】'
    )

    expect(result).toMatchObject({
      detected: true,
      incrementValue: null
    })
    expect(result.message).toContain('缺少必填字段「事件增量」')
  })

  it('passes any declared increment value without judging narrative quality', () => {
    const result = evaluateChapterEventIncrement(
      '【正文交接】\n事件增量：新信息一，新信息二。\n【正文交接结束】'
    )

    expect(result).toMatchObject({
      detected: false,
      incrementValue: '新信息一，新信息二。'
    })
  })
})

describe('detectChapterNarrativeVerdict', () => {
  it('passes through an explicit SKILL ready verdict', () => {
    const result = detectChapterNarrativeVerdict(
      '【正文交接】\nnarrativeStatus：ready\nnarrativeReason：状态改变动作达标\nstateChangingScenes：3\n【正文交接结束】'
    )

    expect(result).toMatchObject({
      detected: true,
      status: 'ready',
      reason: '状态改变动作达标',
      stateChangingScenes: '3'
    })
  })

  it('passes through an explicit SKILL not_ready verdict', () => {
    const result = detectChapterNarrativeVerdict(
      'narrativeStatus: not_ready\nnarrativeReason：全章只有确认与核对，未改变状态'
    )

    expect(result).toMatchObject({
      detected: true,
      status: 'not_ready',
      reason: '全章只有确认与核对，未改变状态'
    })
  })

  it('does not infer a verdict from prose or a missing declaration', () => {
    const result = detectChapterNarrativeVerdict(
      '王芳确认了线索，但没有发生任何改变。'
    )

    expect(result).toMatchObject({
      detected: false,
      status: 'undeclared',
      reason: null,
      stateChangingScenes: null
    })
  })
})

describe('resolveChapterNarrativeBlock', () => {
  it('keeps the density NOT_READY upstream route', () => {
    const result = resolveChapterNarrativeBlock(
      'NOT-READY：章级事件密度不足，需上游补剧情点'
    )

    expect(result).toMatchObject({
      code: 'chapter-event-density-not-ready',
      retryableInBodyLayer: false
    })
  })

  it('routes an explicit not_ready verdict to the upstream block route', () => {
    const result = resolveChapterNarrativeBlock(
      'narrativeStatus: not_ready\nnarrativeReason：状态改变动作场景数为 1'
    )

    expect(result).toMatchObject({
      code: CHAPTER_NARRATIVE_NOT_READY_CODE,
      gap: '状态改变动作场景数为 1',
      retryableInBodyLayer: false
    })
  })

  it('does not block a ready verdict', () => {
    const result = resolveChapterNarrativeBlock('narrativeStatus: ready')

    expect(result).toBeNull()
  })

  it('recognizes both narrative block diagnostic codes', () => {
    expect(isChapterNarrativeBlockDiagnosticCode('chapter-event-density-not-ready')).toBe(true)
    expect(isChapterNarrativeBlockDiagnosticCode(CHAPTER_NARRATIVE_NOT_READY_CODE)).toBe(true)
    expect(isChapterNarrativeBlockDiagnosticCode('api-failed')).toBe(false)
  })
})
