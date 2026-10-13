import { mergeMemory } from './memoryMerger'
import type { ExtractedMemoryData } from './memoryExtractor'
import type { MemoryData, MemoryMeta } from '../types/memory'

export const DELTA_TARGET_CHARS = 20_000
export const DELTA_MAX_CHARS = 30_000
export const CONTEXT_TARGET_CHARS = 6_000
export const CONTEXT_MAX_CHARS = 8_000
export const SNAPSHOT_TARGET_CHARS = 240_000
export const SNAPSHOT_MAX_CHARS = 320_000

const queues = new Map<string, Promise<unknown>>()
const revisions = new Map<string, number>()

export interface TrackingTransaction {
  projectId: string
  expectedRevision: number
  currentMemory: MemoryData
  extracted: ExtractedMemoryData
  chapterId: string
  chapterIndex?: number
  blacklist: string[]
  now?: string
}

export type TrackingCommitResult =
  | {
      ok: true
      data: MemoryData
      changes: ReturnType<typeof mergeMemory>['changes']
      revision: number
      commitId: string
    }
  | {
      ok: false
      error: TrackingCommitError
    }

export type TrackingCommitError =
  | {
      code: 'stale_state'
      message: string
      expectedRevision: number
      currentRevision: number
      changes: []
    }
  | {
      code: 'delta_limit_exceeded' | 'snapshot_limit_exceeded'
      message: string
      charCount: number
      targetChars: number
      maxChars: number
      changes: []
    }

export type TrackingImportResult =
  | {
      ok: true
      data: MemoryData
      revision: number
    }
  | {
      ok: false
      error: {
        code: 'snapshot_limit_exceeded'
        message: string
        charCount: number
        targetChars: number
        maxChars: number
      }
    }

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function currentRevision(projectId: string): number {
  return revisions.get(projectId) || 1
}

function setStateRevision(projectId: string, revision: number) {
  revisions.set(projectId, revision)
}

function charCount(value: unknown): number {
  if (value == null) return 0
  if (typeof value === 'string') return value.length
  if (typeof value !== 'object') return String(value).length
  try {
    return JSON.stringify(value).length
  } catch {
    return Number.MAX_SAFE_INTEGER
  }
}

function deltaCharCount(extracted: ExtractedMemoryData): number {
  return (['entities', 'relations', 'events', 'world', 'foreshadowing'] as const)
    .reduce((total, key) => total + charCount(extracted[key]), 0)
}

function normalizeMeta(meta: MemoryMeta | undefined): MemoryMeta {
  const base: MemoryMeta = {
    extractionCount: 0,
    lastExtractedAt: null,
    lastFullRebuildAt: null,
    pendingCount: 0,
    totals: { entities: 0, relations: 0, events: 0, world: 0, foreshadowing: 0 }
  }
  return {
    ...base,
    ...meta,
    stateRevision: normalizeRevision(meta?.stateRevision),
    lastCommittedChapter: meta?.lastCommittedChapter,
    lastCommittedAt: meta?.lastCommittedAt,
    derivedViewHash: meta?.derivedViewHash
  }
}

function normalizeRevision(value: unknown): number {
  const revision = Number(value)
  return Number.isInteger(revision) && revision > 0 ? revision : 1
}

export function createMemoryData(): MemoryData {
  return {
    version: 1,
    entities: [],
    relations: [],
    events: [],
    world: [],
    foreshadowing: [],
    meta: normalizeMeta(undefined),
    history: [],
    categories: ['情节', '人物', '世界观', '伏笔'],
    items: [],
    sourceVersions: []
  }
}

function withNormalizedMeta(memory: MemoryData): MemoryData {
  return { ...memory, meta: normalizeMeta(memory.meta) }
}

function derivedViewHash(memory: MemoryData): string {
  const view = {
    entities: memory.entities.map(item => [item.id, item.name, item.status]),
    relations: memory.relations.map(item => [item.id, item.sourceId, item.targetId, item.type]),
    events: memory.events.map(item => [item.id, item.title, item.chapterIndex]),
    world: memory.world.map(item => [item.id, item.name, item.category]),
    foreshadowing: memory.foreshadowing.map(item => [item.id, item.title, item.status])
  }
  const text = JSON.stringify(view)
  let hash = 0
  for (let index = 0; index < text.length; index++) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0
  }
  return `tv_${(hash >>> 0).toString(36)}_${view.entities.length}_${view.events.length}`
}

function withDerivedState(memory: MemoryData, revision: number, chapterId: string, now: string): MemoryData {
  return withTrackingState(memory, revision, chapterId, now)
}

export function withTrackingState(memory: MemoryData, revision: number, chapterId: string, now: string): MemoryData {
  const next = withNormalizedMeta(memory)
  next.meta.stateRevision = revision
  next.meta.lastCommittedChapter = chapterId
  next.meta.lastCommittedAt = now
  next.meta.derivedViewHash = derivedViewHash(next)
  return next
}

export function getState(projectId: string, memory: MemoryData | null | undefined): MemoryData {
  const normalized = withNormalizedMeta(memory || createMemoryData())
  const revision = Math.max(normalized.meta.stateRevision || 1, currentRevision(projectId))
  setStateRevision(projectId, revision)
  normalized.meta.stateRevision = revision
  if (!normalized.meta.derivedViewHash) {
    normalized.meta.derivedViewHash = derivedViewHash(normalized)
  }
  return normalized
}

export function createTrackingTransaction(input: {
  projectId: string
  currentMemory: MemoryData
  extracted: ExtractedMemoryData
  chapterId: string
  chapterIndex?: number
  blacklist?: string[]
  now?: string
}): TrackingTransaction {
  const current = getState(input.projectId, input.currentMemory)
  return {
    projectId: input.projectId,
    expectedRevision: current.meta.stateRevision || 1,
    currentMemory: current,
    extracted: input.extracted,
    chapterId: input.chapterId,
    chapterIndex: input.chapterIndex,
    blacklist: input.blacklist || [],
    now: input.now
  }
}

export function prepareTransaction(
  projectId: string,
  currentMemory: MemoryData,
  extracted: ExtractedMemoryData,
  options: {
    chapterId: string
    chapterIndex?: number
    blacklist?: string[]
    now?: string
  }
): TrackingTransaction {
  return createTrackingTransaction({
    projectId,
    currentMemory,
    extracted,
    chapterId: options.chapterId,
    chapterIndex: options.chapterIndex,
    blacklist: options.blacklist,
    now: options.now
  })
}

export function rejectStale(draft: TrackingTransaction, currentMemory: MemoryData): TrackingTransaction {
  return createTrackingTransaction({
    projectId: draft.projectId,
    currentMemory,
    extracted: draft.extracted,
    chapterId: draft.chapterId,
    chapterIndex: draft.chapterIndex,
    blacklist: draft.blacklist,
    now: draft.now
  })
}

export function previewTransactionChanges(
  currentMemory: MemoryData,
  extracted: ExtractedMemoryData,
  options: {
    chapterId: string
    chapterIndex?: number
    blacklist?: string[]
    now?: string
  }
): ReturnType<typeof mergeMemory>['changes'] {
  return mergeMemory(currentMemory, extracted, options).changes
}

function runSerialized<T>(projectId: string, task: () => Promise<T> | T): Promise<T> {
  const previous = queues.get(projectId) || Promise.resolve()
  const next = previous.then(task, task)
  queues.set(projectId, next.catch(() => undefined))
  return next
}

function commitNow(draft: TrackingTransaction): TrackingCommitResult {
  const now = draft.now || new Date().toISOString()
  const revision = currentRevision(draft.projectId)
  if (draft.expectedRevision !== revision) {
    return {
      ok: false,
      error: {
        code: 'stale_state',
        message: `记忆状态已更新：期待 revision ${draft.expectedRevision}，当前 revision ${revision}`,
        expectedRevision: draft.expectedRevision,
        currentRevision: revision,
        changes: []
      }
    }
  }

  const deltaChars = deltaCharCount(draft.extracted)
  if (deltaChars > DELTA_MAX_CHARS) {
    return {
      ok: false,
      error: {
        code: 'delta_limit_exceeded',
        message: `记忆增量 ${deltaChars} 字符，超过硬上限 ${DELTA_MAX_CHARS}。请拆分为多个事务，不做截断。`,
        charCount: deltaChars,
        targetChars: DELTA_TARGET_CHARS,
        maxChars: DELTA_MAX_CHARS,
        changes: []
      }
    }
  }

  const merged = mergeMemory(draft.currentMemory, draft.extracted, {
    chapterId: draft.chapterId,
    chapterIndex: draft.chapterIndex,
    blacklist: draft.blacklist,
    now
  })

  const snapshotChars = charCount(merged.data)
  if (snapshotChars > SNAPSHOT_MAX_CHARS) {
    return {
      ok: false,
      error: {
        code: 'snapshot_limit_exceeded',
        message: `记忆快照 ${snapshotChars} 字符，超过硬上限 ${SNAPSHOT_MAX_CHARS}。请先归档或拆分记忆，不做截断。`,
        charCount: snapshotChars,
        targetChars: SNAPSHOT_TARGET_CHARS,
        maxChars: SNAPSHOT_MAX_CHARS,
        changes: []
      }
    }
  }

  const nextRevision = revision + 1
  const next = withDerivedState(merged.data, nextRevision, draft.chapterId, now)
  setStateRevision(draft.projectId, nextRevision)
  return {
    ok: true,
    data: next,
    changes: merged.changes,
    revision: nextRevision,
    commitId: `tracking_${nextRevision}_${Date.parse(now) || Date.now()}`
  }
}

export function commitTransaction(draft: TrackingTransaction): Promise<TrackingCommitResult> {
  return runSerialized(draft.projectId, () => commitNow(draft))
}

/** User-initiated imports replace the authoritative state and always win. */
export function commitImport(
  projectId: string,
  nextMemory: MemoryData,
  options: { chapterId: string; now?: string }
): Promise<TrackingImportResult> {
  return runSerialized(projectId, () => {
    const now = options.now || new Date().toISOString()
    const next = withNormalizedMeta(nextMemory)
    const snapshotChars = charCount(next)
    if (snapshotChars > SNAPSHOT_MAX_CHARS) {
      return {
        ok: false,
        error: {
          code: 'snapshot_limit_exceeded',
          message: `导入后的记忆快照 ${snapshotChars} 字符，超过硬上限 ${SNAPSHOT_MAX_CHARS}。请先归档或拆分记忆，不做截断。`,
          charCount: snapshotChars,
          targetChars: SNAPSHOT_TARGET_CHARS,
          maxChars: SNAPSHOT_MAX_CHARS
        }
      }
    }

    const revision = currentRevision(projectId) + 1
    const imported = withTrackingState(next, revision, options.chapterId, now)
    setStateRevision(projectId, revision)
    return { ok: true, data: imported, revision }
  })
}

/** Keep unit tests isolated; production code never resets transaction queues. */
export function resetTrackingStateForTests() {
  queues.clear()
  revisions.clear()
}
