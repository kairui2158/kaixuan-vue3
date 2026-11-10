import { describe, expect, it } from 'vitest'
import {
  normalizeChapterBatchSize,
  planChapterGeneration,
  type ChapterGenerationMode
} from './chapterBatchPlanning'
import {
  validateChapterGenerationLedger,
  type ChapterBatchContract
} from './chapterGenerationContract'

function contract(overrides: Partial<ChapterBatchContract> = {}): ChapterBatchContract {
  return {
    volumeId: 'vol-1',
    batchIndex: 0,
    expectedStart: 1,
    expectedEnd: 2,
    requestedCount: 2,
    totalChapters: 6,
    ...overrides
  }
}

describe('planChapterGeneration', () => {
  it('normalizes chapter batch size for UI, runtime and persistence', () => {
    expect(normalizeChapterBatchSize(0)).toBe(1)
    expect(normalizeChapterBatchSize(-3)).toBe(1)
    expect(normalizeChapterBatchSize(2.8)).toBe(2)
    expect(normalizeChapterBatchSize(21)).toBe(20)
    expect(normalizeChapterBatchSize(100)).toBe(20)
    expect(normalizeChapterBatchSize('')).toBe(5)
    expect(normalizeChapterBatchSize(undefined)).toBe(5)
    expect(planChapterGeneration({
      mode: 'batch',
      generatedCount: 0,
      totalChapters: 6,
      batchSize: 21
    }).requestedCount).toBe(6)
  })

  it('plans one configured batch from the resume position in batch mode', () => {
    const plan = planChapterGeneration({
      mode: 'batch',
      generatedCount: 2,
      totalChapters: 6,
      batchSize: 2
    })

    expect(plan).toEqual({
      mode: 'batch',
      start: 3,
      targetEnd: 4,
      requestedCount: 2,
      reachesTotal: false,
      stopReason: 'batch_complete',
      requiresFullLedger: false
    })
  })

  it('continues from any incomplete position with the same batch limit', () => {
    const plan = planChapterGeneration({
      mode: 'continue',
      generatedCount: 1,
      totalChapters: 6,
      batchSize: 4
    })

    expect(plan.targetEnd).toBe(5)
    expect(plan.requestedCount).toBe(4)
    expect(plan.stopReason).toBe('batch_complete')
  })

  it('plans the full remaining range in auto mode', () => {
    const plan = planChapterGeneration({
      mode: 'auto',
      generatedCount: 2,
      totalChapters: 6,
      batchSize: 2
    })

    expect(plan).toEqual({
      mode: 'auto',
      start: 3,
      targetEnd: 6,
      requestedCount: 4,
      reachesTotal: true,
      stopReason: 'all_chapters_complete',
      requiresFullLedger: true
    })
  })

  it('clamps an oversized batch to the remaining chapters', () => {
    const plan = planChapterGeneration({
      mode: 'batch',
      generatedCount: 5,
      totalChapters: 6,
      batchSize: 20
    })

    expect(plan.requestedCount).toBe(1)
    expect(plan.targetEnd).toBe(6)
    expect(plan.reachesTotal).toBe(true)
    expect(plan.stopReason).toBe('all_chapters_complete')
    expect(plan.requiresFullLedger).toBe(true)
  })

  it('marks a configured final batch that reaches the total as full completion', () => {
    const plan = planChapterGeneration({
      mode: 'continue',
      generatedCount: 4,
      totalChapters: 6,
      batchSize: 2
    })

    expect(plan.reachesTotal).toBe(true)
    expect(plan.stopReason).toBe('all_chapters_complete')
    expect(plan.requiresFullLedger).toBe(true)
  })

  it('rejects already-complete ranges', () => {
    const cases: ChapterGenerationMode[] = ['batch', 'continue', 'auto']
    for (const mode of cases) {
      expect(() => planChapterGeneration({
        mode,
        generatedCount: 6,
        totalChapters: 6,
        batchSize: 2
      })).toThrow('章节已全部生成')
    }
  })

  it('rejects unknown modes before range validation', () => {
    expect(() => planChapterGeneration({
      mode: 'unknown' as ChapterGenerationMode,
      generatedCount: 6,
      totalChapters: 6,
      batchSize: 2
    })).toThrow('未知章节生成模式')
  })
})

describe('partial chapter ledger validation', () => {
  it('accepts a continuous ledger that stops at the completed batch boundary', () => {
    const contracts = [
      contract({ batchIndex: 0, expectedStart: 1, expectedEnd: 2, requestedCount: 2 }),
      contract({ batchIndex: 1, expectedStart: 3, expectedEnd: 4, requestedCount: 2 })
    ]

    const result = validateChapterGenerationLedger(contracts, 6, { requiredEnd: 4 })

    expect(result).toEqual({ valid: true, errors: [] })
  })

  it('still rejects gaps and overlaps at a partial boundary', () => {
    const gap = [
      contract({ batchIndex: 0, expectedStart: 1, expectedEnd: 2, requestedCount: 2 }),
      contract({ batchIndex: 1, expectedStart: 4, expectedEnd: 5, requestedCount: 2 })
    ]

    expect(validateChapterGenerationLedger(gap, 6, { requiredEnd: 5 }).valid).toBe(false)

    const overlap = [
      contract({ batchIndex: 0, expectedStart: 1, expectedEnd: 2, requestedCount: 2 }),
      contract({ batchIndex: 1, expectedStart: 2, expectedEnd: 3, requestedCount: 2 })
    ]

    expect(validateChapterGenerationLedger(overlap, 6, { requiredEnd: 3 }).valid).toBe(false)
  })

  it('rejects a partial ledger that has not reached its own boundary', () => {
    const contracts = [
      contract({ batchIndex: 0, expectedStart: 1, expectedEnd: 2, requestedCount: 2 })
    ]

    const result = validateChapterGenerationLedger(contracts, 6, { requiredEnd: 4 })

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('批次台账未覆盖本次目标章数：只覆盖到第 2 章，目标 第 4 章')
  })
})
