import { extractJsonArray } from './jsonExtraction'
import {
  isValidChapterBatchContractInput,
  validateChapterBatch,
  type ChapterBatchContract
} from './chapterGenerationContract'

export interface ChapterBatchAttempt {
  repairAttempt: number
  status: 'short' | 'complete' | 'error'
  requestedCount: number
  acceptedCount: number
  missingStart: number
  missingCount: number
  errors: string[]
}

export interface GenerateChapterBatchInput {
  contract: ChapterBatchContract
  historyTitles: Set<string>
  callChapterApi: (prompt: string) => Promise<string>
  shouldContinue?: () => boolean
  basePrompt: string
  historyContext: string
  maxRepairAttempts?: number
  onAttempt?: (attempt: ChapterBatchAttempt) => void
}

export interface ChapterBatchResult {
  status: 'complete' | 'incomplete'
  chapters: any[]
  attempts: ChapterBatchAttempt[]
  errors: string[]
}

export function buildChapterBatchPrompt(input: {
  contract: ChapterBatchContract
  repair: boolean
  missingStart?: number
  missingCount?: number
  basePrompt: string
  historyContext: string
  repairErrors?: string[]
  forbiddenTitles?: string[]
}): string {
  const { contract } = input
  if (input.repair) {
    const missingStart = input.missingStart ?? contract.expectedStart
    const missingCount = input.missingCount ?? contract.requestedCount
    const missingEnd = missingStart + missingCount - 1
    return [
      input.basePrompt,
      '',
      input.historyContext,
      '',
      `补充生成第${missingStart}章到第${missingEnd}章，共${missingCount}章。只输出缺失章节，不要重复任何已有标题。`,
      '输出JSON数组，每项含title/plot字段。数组长度必须为' + missingCount + '。'
    ].concat(input.repairErrors?.length ? [
      '',
      '【上一次验收失败原因】',
      ...input.repairErrors
    ] : []).concat(input.forbiddenTitles?.length ? [
      '',
      '【禁止重复的已有标题】',
      input.forbiddenTitles.join('、')
    ] : []).join('\n')
  }
  return [
    input.basePrompt,
    '',
    input.historyContext,
    '',
    `生成第${contract.expectedStart}章到第${contract.expectedEnd}章，共${contract.requestedCount}章。不要重复任何已有标题。`,
    '输出JSON数组，每项含title/plot字段。数组长度必须为' + contract.requestedCount + '。'
  ].join('\n')
}

function normalizedTitle(value: unknown): string {
  return (typeof value === 'string' ? value : String(value || '')).trim()
}

function recordAttempt(
  attempts: ChapterBatchAttempt[],
  attempt: ChapterBatchAttempt,
  onAttempt?: (attempt: ChapterBatchAttempt) => void
): void {
  attempts.push(attempt)
  onAttempt?.(attempt)
}

export async function generateChapterBatch(input: GenerateChapterBatchInput): Promise<ChapterBatchResult> {
  const attempts: ChapterBatchAttempt[] = []
  const maxRepairs = Math.max(0, Math.round(Number(input.maxRepairAttempts ?? 3)))
  if (!isValidChapterBatchContractInput(input.contract)) {
    return {
      status: 'incomplete',
      chapters: [],
      attempts: [],
      errors: ['无效批次契约：区间与数量不一致']
    }
  }

  const accepted: any[] = []
  const existingTitles = new Set(input.historyTitles)
  const forbiddenTitles = Array.from(existingTitles)
  let repairAttempt = 0
  let previousErrors: string[] = []

  while (true) {
    if (input.shouldContinue && !input.shouldContinue()) {
      return {
        status: 'incomplete',
        chapters: [],
        attempts,
        errors: ['章节批次生成已被用户取消']
      }
    }
    const missingCount = input.contract.requestedCount - accepted.length
    const missingStart = input.contract.expectedStart + accepted.length
    const prompt = buildChapterBatchPrompt({
      contract: input.contract,
      repair: repairAttempt > 0,
      missingStart,
      missingCount,
      basePrompt: input.basePrompt,
      historyContext: input.historyContext,
      repairErrors: previousErrors,
      forbiddenTitles
    })

    let raw: string
    try {
      raw = await input.callChapterApi(prompt)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      recordAttempt(attempts, {
        repairAttempt,
        status: 'error',
        requestedCount: missingCount,
        acceptedCount: accepted.length,
        missingStart,
        missingCount,
        errors: [message]
      }, input.onAttempt)
      throw error
    }

    const parsed = extractJsonArray(raw) as any[]
    const candidates = []
    const batchSeen = new Set<string>()
    const validationErrors: string[] = []
    for (const chapter of parsed) {
      const title = normalizedTitle(chapter?.title)
      const plot = normalizedTitle(chapter?.plot) || normalizedTitle(chapter?.summary)
      if (!title || !plot) continue
      if (existingTitles.has(title)) {
        validationErrors.push(`章节标题与历史重复：「${title}」`)
        continue
      }
      if (batchSeen.has(title)) {
        validationErrors.push(`章节标题重复：「${title}」`)
        continue
      }
      if (accepted.length + candidates.length >= input.contract.requestedCount) continue
      batchSeen.add(title)
      candidates.push(chapter)
    }
    for (const candidate of candidates) {
      accepted.push(candidate)
      existingTitles.add(normalizedTitle(candidate?.title))
    }

    if (accepted.length === input.contract.requestedCount) {
      const validation = validateChapterBatch(accepted, input.contract, input.historyTitles)
      const completeAttempt: ChapterBatchAttempt = {
        repairAttempt,
        status: 'complete',
        requestedCount: input.contract.requestedCount,
        acceptedCount: accepted.length,
        missingStart,
        missingCount,
        errors: validation.errors
      }
      recordAttempt(attempts, completeAttempt, input.onAttempt)
      return { status: 'complete', chapters: accepted, attempts, errors: [] }
    }

    const currentMissingStart = input.contract.expectedStart + accepted.length
    const currentMissingCount = input.contract.requestedCount - accepted.length
    previousErrors = validationErrors
    recordAttempt(attempts, {
      repairAttempt,
      status: 'short',
      requestedCount: input.contract.requestedCount,
      acceptedCount: accepted.length,
      missingStart: currentMissingStart,
      missingCount: currentMissingCount,
      errors: validationErrors
    }, input.onAttempt)

    if (repairAttempt >= maxRepairs) break
    repairAttempt += 1
  }

  const errors = [
    ...new Set([
      `批次未能补齐：期望第${input.contract.expectedStart}章到第${input.contract.expectedEnd}章，共${input.contract.requestedCount}章；最终只有${accepted.length}章`,
      ...attempts.flatMap(attempt => attempt.errors)
    ])
  ]
  return { status: 'incomplete', chapters: [], attempts, errors }
}
