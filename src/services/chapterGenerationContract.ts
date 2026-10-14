export interface ChapterBatchContract {
  volumeId: string
  batchIndex: number
  expectedStart: number
  expectedEnd: number
  requestedCount: number
  totalChapters: number
}

export interface ChapterHistoryFacts {
  totalGenerated: number
  titles: Array<{ index: number; title: string }>
  lastChapter?: { index: number; title: string; plot: string }
}

export interface ChapterBatchValidation {
  valid: boolean
  errors: string[]
  missingCount: number
}

export interface ChapterLedgerValidation {
  valid: boolean
  errors: string[]
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value || '').trim()
}

function normalizePositiveInteger(value: unknown): number {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : 0
}

export function buildChapterHistoryFacts(chapters: unknown[]): ChapterHistoryFacts {
  const list = Array.isArray(chapters) ? chapters : []
  const titles = list
    .map((chapter, index) => ({ index: index + 1, title: text((chapter as any)?.title) }))
    .filter(item => item.title.length > 0)
  const last = list.length > 0 ? list[list.length - 1] : null
  const lastTitle = last ? text((last as any)?.title) : ''
  const lastPlot = last ? text((last as any)?.plot) || text((last as any)?.summary) : ''
  return {
    totalGenerated: list.length,
    titles,
    lastChapter: lastTitle ? { index: list.length, title: lastTitle, plot: lastPlot } : undefined
  }
}

export function renderChapterHistoryContext(facts: ChapterHistoryFacts): string {
  const titleLines = facts.titles.length > 0
    ? facts.titles.map(item => `第${item.index}章《${item.title}》`).join('\n')
    : '暂无已生成章节'
  const lines = [
    '[已生成章节标题清单]',
    titleLines
  ]
  if (facts.lastChapter) {
    lines.push(
      '',
      '[上一章事实]',
      `第${facts.lastChapter.index}章《${facts.lastChapter.title}》`,
      facts.lastChapter.plot
    )
  }
  return lines.join('\n')
}

export function validateChapterBatch(
  chapters: unknown[],
  contract: ChapterBatchContract,
  existingTitles: Set<string>
): ChapterBatchValidation {
  const list = Array.isArray(chapters) ? chapters : []
  const errors: string[] = []
  const batchTitles = new Set<string>()

  if (list.length !== contract.requestedCount) {
    errors.push(`章节数量不一致：本批声明 ${contract.requestedCount} 章，实际 ${list.length} 章`)
  }

  list.forEach((chapter, index) => {
    const globalIndex = contract.expectedStart + index
    const title = text((chapter as any)?.title)
    const plot = text((chapter as any)?.plot) || text((chapter as any)?.summary)
    if (!title) errors.push(`第 ${globalIndex} 章缺少标题`)
    if (!plot) errors.push(`章节「${title || '?'}」缺少剧情点概要`)
    if (title) {
      if (existingTitles.has(title)) {
        errors.push(`章节标题与历史重复：「${title}」`)
      }
      if (batchTitles.has(title)) {
        errors.push(`章节标题重复：「${title}」`)
      }
      batchTitles.add(title)
    }
  })

  return {
    valid: errors.length === 0,
    errors,
    missingCount: Math.max(0, contract.requestedCount - list.length)
  }
}

export function validateChapterGenerationLedger(
  contracts: ChapterBatchContract[],
  totalChapters: number,
  options?: { requiredEnd?: number }
): ChapterLedgerValidation {
  const list = Array.isArray(contracts) ? contracts : []
  const errors: string[] = []
  let expectedStart = 1
  let coveredEnd = 0

  list.forEach((item) => {
    if (item.expectedStart !== expectedStart) {
      if (expectedStart === 1) {
        errors.push('批次台账未从第 1 章开始')
      } else if (item.expectedStart > expectedStart) {
        errors.push(`批次区间断档：期望第 ${expectedStart} 章，实际第 ${item.expectedStart} 章`)
      } else {
        errors.push(`批次区间重叠：第 ${item.expectedStart} 章已被上一批覆盖`)
      }
    }
    expectedStart = item.expectedEnd + 1
    coveredEnd = Math.max(coveredEnd, item.expectedEnd)
  })

  const requiredEnd = Math.min(
    totalChapters,
    Math.max(1, Math.floor(Number(options?.requiredEnd ?? totalChapters) || 0))
  )
  if (coveredEnd < requiredEnd) {
    const target = requiredEnd === totalChapters
      ? `${totalChapters} 章`
      : `第 ${requiredEnd} 章`
    errors.push(`批次台账未覆盖${requiredEnd === totalChapters ? '目标章数' : '本次目标章数'}：只覆盖到第 ${coveredEnd} 章，目标 ${target}`)
  }

  return { valid: errors.length === 0, errors }
}

export function isValidChapterBatchContractInput(input: {
  expectedStart?: unknown
  expectedEnd?: unknown
  requestedCount?: unknown
}): boolean {
  const start = normalizePositiveInteger(input.expectedStart)
  const end = normalizePositiveInteger(input.expectedEnd)
  const count = normalizePositiveInteger(input.requestedCount)
  return start > 0 && end >= start && count === end - start + 1
}
