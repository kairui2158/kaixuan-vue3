export type ChapterGenerationMode = 'batch' | 'continue' | 'auto'

export interface ChapterGenerationPlan {
  mode: ChapterGenerationMode
  start: number
  targetEnd: number
  requestedCount: number
  reachesTotal: boolean
  stopReason: 'batch_complete' | 'all_chapters_complete'
  requiresFullLedger: boolean
}

export interface PlanChapterGenerationInput {
  mode: ChapterGenerationMode
  generatedCount: number
  totalChapters: number
  batchSize: number
}

export function normalizeChapterBatchSize(value: unknown): number {
  if (value === '' || value === null || value === undefined) return 5
  const parsed = Math.floor(Number(value))
  if (!Number.isFinite(parsed)) return 5
  return Math.max(1, Math.min(parsed, 20))
}

export function planChapterGeneration(input: PlanChapterGenerationInput): ChapterGenerationPlan {
  const mode = input.mode
  const total = Math.max(0, Math.floor(Number(input.totalChapters) || 0))
  const generated = Math.max(0, Math.min(Math.floor(Number(input.generatedCount) || 0), total))
  const safeBatchSize = normalizeChapterBatchSize(input.batchSize)

  if (!['batch', 'continue', 'auto'].includes(mode)) {
    throw new Error('未知章节生成模式')
  }
  if (total <= 0) throw new Error('目标章数必须大于 0')
  if (generated >= total) throw new Error('章节已全部生成，无需继续')

  const start = generated + 1
  const remaining = total - generated
  const requestedCount = mode === 'auto' ? remaining : Math.min(safeBatchSize, remaining)
  const targetEnd = start + requestedCount - 1
  const reachesTotal = targetEnd >= total

  return {
    mode,
    start,
    targetEnd,
    requestedCount,
    reachesTotal,
    stopReason: reachesTotal ? 'all_chapters_complete' : 'batch_complete',
    requiresFullLedger: reachesTotal
  }
}
