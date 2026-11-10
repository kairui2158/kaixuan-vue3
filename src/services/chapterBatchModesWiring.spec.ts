import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const pipelineSource = readFileSync(fileURLToPath(new URL('../components/pipeline/PipelinePanel.vue', import.meta.url)), 'utf8')

function countMatches(pattern: RegExp): number {
  return pipelineSource.match(pattern)?.length ?? 0
}

describe('chapter batch mode wiring', () => {
  it('replaces the old chapter button labels everywhere', () => {
    expect(countMatches(/AI生成章节|自动生成章节/g)).toBe(0)
  })

  it('exposes the three confirmed chapter generation entries', () => {
    expect(countMatches(/>生成本批章节</g)).toBe(0)
    expect(countMatches(/>按设定章节数生成</g)).toBe(1)
    expect(countMatches(/>全量生成章节</g)).toBeGreaterThanOrEqual(1)
    expect(countMatches(/>续生成</g)).toBeGreaterThanOrEqual(1)
  })

  it('binds each entry to a distinct mode on the single generation engine', () => {
    expect(countMatches(/function genChapters\s*\(/g)).toBe(1)
    expect(countMatches(/genChapters\('batch'\)/g)).toBeGreaterThanOrEqual(1)
    expect(countMatches(/genChapters\('continue'\)/g)).toBeGreaterThanOrEqual(1)
    expect(countMatches(/genChapters\('auto'\)/g)).toBeGreaterThanOrEqual(1)
  })

  it('keeps batch stops successful and verifiable', () => {
    expect(countMatches(/saveChapterBreakpoint\('paused'\)/g)).toBeGreaterThanOrEqual(1)
    expect(countMatches(/chapters_batch_complete/g)).toBeGreaterThanOrEqual(1)
    expect(countMatches(/requiresFullLedger/g)).toBeGreaterThanOrEqual(1)
  })

  it('disables continue when generation is running or all chapters exist', () => {
    expect(countMatches(/canContinueChapters/g)).toBeGreaterThanOrEqual(2)
  })

  it('syncs batch size normalization, persistence, and real readiness gating', () => {
    expect(countMatches(/saveChapterBatchSize/g)).toBe(2)
    expect(countMatches(/normalizeChapterBatchSize/g)).toBeGreaterThanOrEqual(6)
    expect(countMatches(/canStartChapters/g)).toBeGreaterThanOrEqual(4)
    expect(countMatches(/chapterBatchSize:\s*chapterBatchSizeNormalized/g)).toBe(2)
    expect(countMatches(/selectedVolumeChapterLocked/g)).toBe(0)
  })

  it('keeps supplement ownership at the outer batch loop and surfaces output risk', () => {
    expect(countMatches(/maxRepairAttempts:\s*0/g)).toBe(1)
    expect(countMatches(/chapter-batch-partial/g)).toBe(1)
    expect(countMatches(/chapter-batch-output-risk/g)).toBe(1)
  })
})
