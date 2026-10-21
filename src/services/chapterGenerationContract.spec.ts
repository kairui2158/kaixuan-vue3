import { describe, expect, it } from 'vitest'
import {
  buildChapterHistoryFacts,
  renderChapterHistoryContext,
  extractDeclaredChapterCount,
  resolveChapterCountContract,
  validateChapterBatch,
  validateChapterGenerationLedger,
  type ChapterBatchContract
} from './chapterGenerationContract'

function contract(overrides: Partial<ChapterBatchContract> = {}): ChapterBatchContract {
  return {
    volumeId: 'vol-1',
    batchIndex: 0,
    expectedStart: 1,
    expectedEnd: 5,
    requestedCount: 5,
    totalChapters: 12,
    ...overrides
  }
}

function chapter(title: string, plot = '剧情概要') {
  return { title, plot }
}

describe('buildChapterHistoryFacts', () => {
  it('builds the full title ledger and last-chapter facts at a 172-chapter scale', () => {
    const chapters = Array.from({ length: 172 }, (_, index) => chapter(`第${index + 1}章标题`))

    const facts = buildChapterHistoryFacts(chapters)

    expect(facts.totalGenerated).toBe(172)
    expect(facts.titles).toHaveLength(172)
    expect(facts.titles[0]).toEqual({ index: 1, title: '第1章标题' })
    expect(facts.titles[171]).toEqual({ index: 172, title: '第172章标题' })
    expect(facts.lastChapter).toEqual({
      index: 172,
      title: '第172章标题',
      plot: '剧情概要'
    })
  })

  it('renders no-history context without inventing a previous chapter', () => {
    const rendered = renderChapterHistoryContext(buildChapterHistoryFacts([]))

    expect(rendered).toContain('[已生成章节标题清单]\n暂无已生成章节')
    expect(rendered).not.toContain('[上一章事实]')
  })

  it('renders the full title ledger and the previous chapter facts', () => {
    const chapters = [
      chapter('第一章标题', '第一章剧情'),
      chapter('第二章标题', '第二章剧情')
    ]

    const rendered = renderChapterHistoryContext(buildChapterHistoryFacts(chapters))

    expect(rendered).toContain('[已生成章节标题清单]')
    expect(rendered).toContain('第1章《第一章标题》')
    expect(rendered).toContain('第2章《第二章标题》')
    expect(rendered).toContain('[上一章事实]')
    expect(rendered).toContain('第2章《第二章标题》')
    expect(rendered).toContain('第二章剧情')
  })
})

describe('validateChapterBatch', () => {
  it('accepts a complete batch', () => {
    const chapters = Array.from({ length: 5 }, (_, index) => chapter(`第${index + 1}章标题`, `第${index + 1}章剧情`))

    const result = validateChapterBatch(chapters, contract(), new Set())

    expect(result).toEqual({ valid: true, errors: [], warnings: [], missingCount: 0 })
  })

  it('rejects a short batch and reports the missing count', () => {
    const chapters = Array.from({ length: 4 }, (_, index) => chapter(`第${index + 1}章标题`))

    const result = validateChapterBatch(chapters, contract(), new Set())

    expect(result.valid).toBe(false)
    expect(result.missingCount).toBe(1)
    expect(result.errors).toContain('章节数量不一致：本批声明 5 章，实际 4 章')
  })

  it('rejects empty titles and plots', () => {
    const chapters = [
      chapter(''),
      chapter('第二章标题', ''),
      chapter('第三章标题'),
      chapter('第四章标题'),
      chapter('第五章标题')
    ]

    const result = validateChapterBatch(chapters, contract(), new Set())

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('第 1 章缺少标题')
    expect(result.errors).toContain('章节「第二章标题」缺少剧情点概要')
  })

  it('rejects titles already present in the generated history', () => {
    const chapters = Array.from({ length: 5 }, (_, index) =>
      chapter(index === 0 ? '已存在标题' : `第${index + 1}章标题`)
    )

    const result = validateChapterBatch(chapters, contract(), new Set(['已存在标题']))

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('章节标题与历史重复：「已存在标题」')
  })

  it('rejects duplicate titles inside the batch', () => {
    const chapters = [
      chapter('重复标题'),
      chapter('重复标题'),
      chapter('第三章标题'),
      chapter('第四章标题'),
      chapter('第五章标题')
    ]

    const result = validateChapterBatch(chapters, contract(), new Set())

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('章节标题重复：「重复标题」')
  })

  it('reports completely duplicated plot content as a non-blocking warning', () => {
    const chapters = [
      chapter('第一章标题', '主角进入遗迹并取得信物'),
      chapter('第二章标题', '主角进入遗迹并取得信物'),
      chapter('第三章标题'),
      chapter('第四章标题'),
      chapter('第五章标题')
    ]

    const result = validateChapterBatch(chapters, contract(), new Set())

    expect(result.valid).toBe(true)
    expect(result.warnings).toContain('章节「第一章标题」与「第二章标题」剧情概要完全重复')
  })
})

describe('chapter count contract', () => {
  it('extracts a chapter declaration from volume outline prose', () => {
    expect(extractDeclaredChapterCount('本卷定稿承载90章。')).toBe(90)
    expect(extractDeclaredChapterCount('本卷规划共计 120 章')).toBe(120)
    expect(extractDeclaredChapterCount('普通卷纲，没有章数声明')).toBe(0)
  })

  it('lets the volume declaration override configured and estimated counts', () => {
    const result = resolveChapterCountContract({
      volumeName: '第一卷',
      volumeOutline: '本卷定稿承载90章',
      configuredChapterCount: 143,
      allocatedWords: 500500,
      wordsPerChapter: 3500
    })

    expect(result.totalChapters).toBe(90)
    expect(result.source).toBe('volume_outline_declared')
    expect(result.conflict).toBe(true)
    expect(result.message).toContain('卷纲声明90章')
    expect(result.message).toContain('应用配置为143章')
  })

  it('falls back to configured count and then word estimate', () => {
    expect(resolveChapterCountContract({
      volumeName: '第二卷',
      volumeOutline: '没有章数声明',
      configuredChapterCount: 30,
      allocatedWords: 100000,
      wordsPerChapter: 3500
    })).toMatchObject({ totalChapters: 30, source: 'configured_chapter_count', conflict: false })

    expect(resolveChapterCountContract({
      volumeName: '第三卷',
      volumeOutline: '',
      configuredChapterCount: 0,
      allocatedWords: 7000,
      wordsPerChapter: 3500
    })).toMatchObject({ totalChapters: 2, source: 'word_estimate', conflict: false })
  })

  it('reports an unusable count contract instead of inventing zero', () => {
    expect(resolveChapterCountContract({
      volumeName: '第四卷',
      volumeOutline: '',
      configuredChapterCount: 0,
      allocatedWords: 0,
      wordsPerChapter: 0
    })).toMatchObject({ totalChapters: 0, conflict: true })
  })
})

describe('validateChapterGenerationLedger', () => {
  it('accepts a continuous ledger covering the target chapter count', () => {
    const contracts = [
      contract({ batchIndex: 0, expectedStart: 1, expectedEnd: 5, requestedCount: 5 }),
      contract({ batchIndex: 1, expectedStart: 6, expectedEnd: 10, requestedCount: 5 }),
      contract({ batchIndex: 2, expectedStart: 11, expectedEnd: 12, requestedCount: 2 })
    ]

    const result = validateChapterGenerationLedger(contracts, 12)

    expect(result).toEqual({ valid: true, errors: [] })
  })

  it('rejects a ledger that does not start at chapter one', () => {
    const result = validateChapterGenerationLedger(
      [contract({ expectedStart: 2, expectedEnd: 5, requestedCount: 4 })],
      5
    )

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('批次台账未从第 1 章开始')
  })

  it('rejects a gap between batches', () => {
    const contracts = [
      contract({ batchIndex: 0, expectedStart: 1, expectedEnd: 5, requestedCount: 5 }),
      contract({ batchIndex: 1, expectedStart: 7, expectedEnd: 10, requestedCount: 4 })
    ]

    const result = validateChapterGenerationLedger(contracts, 10)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('批次区间断档：期望第 6 章，实际第 7 章')
  })

  it('rejects overlapping batches', () => {
    const contracts = [
      contract({ batchIndex: 0, expectedStart: 1, expectedEnd: 5, requestedCount: 5 }),
      contract({ batchIndex: 1, expectedStart: 5, expectedEnd: 9, requestedCount: 5 })
    ]

    const result = validateChapterGenerationLedger(contracts, 9)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('批次区间重叠：第 5 章已被上一批覆盖')
  })

  it('rejects a ledger that stops before the target chapter count', () => {
    const contracts = [
      contract({ batchIndex: 0, expectedStart: 1, expectedEnd: 5, requestedCount: 5 }),
      contract({ batchIndex: 1, expectedStart: 6, expectedEnd: 9, requestedCount: 4 })
    ]

    const result = validateChapterGenerationLedger(contracts, 12)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('批次台账未覆盖目标章数：只覆盖到第 9 章，目标 12 章')
  })
})
