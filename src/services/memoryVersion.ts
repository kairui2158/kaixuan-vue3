import type { MemoryChangeRecord, MemoryData } from '../types/memory'

export interface MemoryVersionOptions {
  chapterId: string
  chapterIndex?: number
  reason?: string
  timestamp?: string
}

export interface MemoryRollbackResult {
  data: MemoryData
  record: MemoryChangeRecord
}

type MemorySnapshot = Omit<MemoryData, 'history'>

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function snapshot(data: MemoryData): MemorySnapshot {
  const { history: _history, ...rest } = clone(data)
  return rest
}

function makeId(timestamp: string): string {
  return `memv_${Date.parse(timestamp) || Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** 保存一条不可变的 before/after 记录，不修改传入数组。 */
export function saveChangeRecord(
  history: MemoryChangeRecord[] | undefined,
  before: MemoryData,
  after: MemoryData,
  options: MemoryVersionOptions
): MemoryChangeRecord {
  const timestamp = options.timestamp || new Date().toISOString()
  const record: MemoryChangeRecord = {
    id: makeId(timestamp),
    chapterId: options.chapterId,
    chapterIndex: options.chapterIndex,
    timestamp,
    reason: options.reason,
    before: snapshot(before),
    after: snapshot(after)
  }
  // history 参数用于统一生成审计记录的入口，调用方负责把返回记录持久化到快照。
  void history
  return record
}

export function getChangeHistory(history: MemoryChangeRecord[] | undefined): MemoryChangeRecord[] {
  return clone(history || [])
}

function withHistory(data: MemorySnapshot, history: MemoryChangeRecord[]): MemoryData {
  return { ...clone(data), history: clone(history) }
}

/** 回滚到指定版本的 after 快照，并追加一条“回滚”审计记录。 */
export function rollbackTo(
  current: MemoryData,
  history: MemoryChangeRecord[] | undefined,
  versionId: string,
  options: MemoryVersionOptions = { chapterId: 'rollback' }
): MemoryRollbackResult | null {
  const records = history || []
  const target = records.find(record => record.id === versionId)
  if (!target) return null
  const next = withHistory(target.after, records)
  const record = saveChangeRecord(records, current, next, {
    ...options,
    chapterId: options.chapterId || 'rollback',
    reason: options.reason || `回滚到版本 ${versionId}`
  })
  next.history = [...records, record]
  return { data: next, record }
}

/** 回滚到某章完成后的最新版本；优先精确 chapterId，否则使用 chapterIndex。 */
export function rollbackByChapter(
  current: MemoryData,
  history: MemoryChangeRecord[] | undefined,
  chapterId: string,
  chapterIndex?: number,
  options: MemoryVersionOptions = { chapterId: 'rollback' }
): MemoryRollbackResult | null {
  const records = history || []
  const matching = records.filter(record => record.chapterId === chapterId)
  const indexed = chapterIndex === undefined
    ? []
    : records.filter(record => record.chapterIndex !== undefined && record.chapterIndex <= chapterIndex)
  const target = (matching.length > 0 ? matching : indexed).at(-1)
  return target ? rollbackTo(current, records, target.id, { ...options, reason: options.reason || `回滚到章节 ${chapterId}` }) : null
}
