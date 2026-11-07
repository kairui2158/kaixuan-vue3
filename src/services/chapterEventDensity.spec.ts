import { describe, expect, it } from 'vitest'
import {
  CHAPTER_NARRATIVE_NOT_READY_CODE,
  detectChapterNarrativeVerdict,
  evaluateChapterEventIncrement,
  findChapterEventIncrementValue,
  isChapterNarrativeBlockDiagnosticCode,
  resolveChapterNarrativeBlock
} from './chapterEventDensity'

describe('legacy density word-table retirement', () => {
  it('no longer parses or routes the legacy word-table format', () => {
    expect(resolveChapterNarrativeBlock('NOT-READY：章级事件密度不足，需上游补剧情点')).toBeNull()
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
      status: 'declared_ready',
      reason: '状态改变动作达标',
      stateChangingScenes: '3'
    })
  })

  it('passes through an explicit SKILL not_ready verdict', () => {
    const result = detectChapterNarrativeVerdict(
      '【正文交接】\nnarrativeStatus: not_ready\nnarrativeReason：全章只有确认与核对，未改变状态'
    )

    expect(result).toMatchObject({
      detected: true,
      status: 'declared_not_ready',
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

  it('marks a declared verdict unreadable when the handoff carrier is missing', () => {
    const result = detectChapterNarrativeVerdict(
      'narrativeStatus: ready\nnarrativeReason：状态改变动作达标'
    )

    expect(result).toMatchObject({
      detected: true,
      status: 'unreadable_because_missing_handoff',
      reason: '状态改变动作达标'
    })
  })
})

describe('resolveChapterNarrativeBlock', () => {
  it('routes a bare handoff not-ready envelope to generator repair', () => {
    const result = resolveChapterNarrativeBlock(
      '[NOT-READY] 交接输入不可恢复：归一化后仍缺字段：场景分段、场景字数、场景施工卡'
    )

    expect(result).toMatchObject({
      code: CHAPTER_NARRATIVE_NOT_READY_CODE,
      gap: '交接输入不可恢复：归一化后仍缺字段：场景分段、场景字数、场景施工卡',
      retryableInBodyLayer: true
    })
  })

  it('routes a bare BLOCK envelope to generator repair', () => {
    const result = resolveChapterNarrativeBlock('[BLOCK] 交接输入不可恢复')

    expect(result).toMatchObject({
      code: CHAPTER_NARRATIVE_NOT_READY_CODE,
      gap: '交接输入不可恢复',
      retryableInBodyLayer: true
    })
  })

  it('routes an explicit not_ready verdict to the upstream block route', () => {
    const result = resolveChapterNarrativeBlock(
      '【正文交接】\nnarrativeStatus: not_ready\nnarrativeReason：状态改变动作场景数为 1'
    )

    expect(result).toMatchObject({
      code: CHAPTER_NARRATIVE_NOT_READY_CODE,
      gap: '状态改变动作场景数为 1',
      retryableInBodyLayer: false
    })
  })

  it('does not block a ready verdict', () => {
    const result = resolveChapterNarrativeBlock('【正文交接】\nnarrativeStatus: ready')

    expect(result).toBeNull()
  })

  it('recognizes only the SKILL verdict diagnostic code', () => {
    expect(isChapterNarrativeBlockDiagnosticCode('chapter-event-density-not-ready')).toBe(false)
    expect(isChapterNarrativeBlockDiagnosticCode(CHAPTER_NARRATIVE_NOT_READY_CODE)).toBe(true)
    expect(isChapterNarrativeBlockDiagnosticCode('api-failed')).toBe(false)
  })
})
