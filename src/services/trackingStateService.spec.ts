import { describe, expect, it } from 'vitest'
import type { MemoryData } from '../types/memory'
import type { ExtractedMemoryData } from './memoryExtractor'
import {
  DELTA_TARGET_CHARS,
  DELTA_MAX_CHARS,
  SNAPSHOT_MAX_CHARS,
  commitImport,
  commitTransaction,
  createMemoryData,
  createTrackingTransaction,
  getState,
  prepareTransaction,
  resetTrackingStateForTests
} from './trackingStateService'

function createProjectMemories(): MemoryData {
  return createMemoryData()
}

function memoryDelta(name: string): ExtractedMemoryData {
  return {
    entities: [{
      id: `ent-${name}`,
      name,
      evidence: [{ chapterId: 'chapter-1', snippet: `${name} 出场` }]
    }],
    relations: [],
    events: [],
    world: [],
    foreshadowing: []
  }
}

describe('trackingStateService transactions', () => {
  it('initializes legacy memory state at revision 1 without fabricating history', () => {
    resetTrackingStateForTests()
    const legacy = createProjectMemories()
    legacy.entities.push({
      id: 'legacy-entity',
      name: '既有实体',
      type: 'other',
      aliases: [],
      firstAppearance: 'old',
      lastAppearance: 'old',
      appearances: [],
      description: '',
      personality: '',
      appearance: '',
      background: '',
      status: '',
      possessions: [],
      skills: [],
      relationships: [],
      notes: '',
      lockedFields: [],
      evidence: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    })

    const state = getState('project-legacy', legacy)
    expect(state.meta.stateRevision).toBe(1)
    expect(state.meta.lastCommittedChapter).toBeUndefined()
    expect(state.meta.derivedViewHash).toBeTruthy()
  })

  it('commits a transaction and advances the revision', async () => {
    resetTrackingStateForTests()
    const memory = createProjectMemories()
    const draft = prepareTransaction('project-commit', memory, memoryDelta('林一'), {
      chapterId: 'chapter-1',
      chapterIndex: 0,
      blacklist: []
    })

    const result = await commitTransaction(draft)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.meta.stateRevision).toBe(2)
    expect(result.data.entities.map(item => item.name)).toContain('林一')
    expect(result.data.meta.lastCommittedChapter).toBe('chapter-1')
    expect(result.data.meta.lastCommittedAt).toBeTruthy()
    expect(result.data.meta.derivedViewHash).toBeTruthy()
  })

  it('rejects a stale transaction and returns stale_state for rebuild', async () => {
    resetTrackingStateForTests()
    const memory = createProjectMemories()
    const staleDraft = prepareTransaction('project-race', memory, memoryDelta('旧批次'), {
      chapterId: 'chapter-1',
      chapterIndex: 0,
      blacklist: []
    })
    const freshDraft = prepareTransaction('project-race', memory, memoryDelta('新批次'), {
      chapterId: 'chapter-2',
      chapterIndex: 1,
      blacklist: []
    })

    const fresh = await commitTransaction(freshDraft)
    expect(fresh.ok).toBe(true)
    const stale = await commitTransaction(staleDraft)

    expect(stale.ok).toBe(false)
    if (stale.ok) return
    if (stale.error.code !== 'stale_state') throw new Error(`unexpected error ${stale.error.code}`)
    expect(stale.error.expectedRevision).toBe(1)
    expect(stale.error.currentRevision).toBe(2)
    expect(stale.error.changes).toHaveLength(0)
  })

  it('serializes commits for the same project but not across projects', async () => {
    resetTrackingStateForTests()
    const memoryA = createProjectMemories()
    const memoryB = createProjectMemories()
    const order: string[] = []
    const first = commitTransaction(prepareTransaction('project-serial-a', memoryA, memoryDelta('A1'), {
      chapterId: 'chapter-a1',
      blacklist: []
    })).then(result => {
      order.push('a1')
      return result
    })
    const second = commitTransaction(prepareTransaction('project-serial-b', memoryB, memoryDelta('B1'), {
      chapterId: 'chapter-b1',
      blacklist: []
    })).then(result => {
      order.push('b1')
      return result
    })
    const results = await Promise.all([first, second])

    expect(results.map(result => result.ok)).toEqual([true, true])
    expect(order).toEqual(['a1', 'b1'])
  })

  it('rejects oversized delta payloads structurally instead of truncating', async () => {
    resetTrackingStateForTests()
    const memory = createProjectMemories()
    const oversized: ExtractedMemoryData = {
      entities: [{
        name: '超大实体',
        description: 'x'.repeat(DELTA_MAX_CHARS + 1),
        evidence: [{ chapterId: 'chapter-1', snippet: 'x'.repeat(DELTA_MAX_CHARS) }]
      }],
      relations: [],
      events: [],
      world: [],
      foreshadowing: []
    }
    const draft = prepareTransaction('project-oversize', memory, oversized, {
      chapterId: 'chapter-1',
      blacklist: []
    })

    const result = await commitTransaction(draft)

    expect(result.ok).toBe(false)
    if (result.ok) return
    if (result.error.code !== 'delta_limit_exceeded') throw new Error(`unexpected error ${result.error.code}`)
    expect(result.error.charCount).toBeGreaterThan(DELTA_MAX_CHARS)
    expect(result.error.targetChars).toBe(DELTA_TARGET_CHARS)
  })

  it('rejects a commit that would produce an oversized snapshot without writing', async () => {
    resetTrackingStateForTests()
    const memory = createProjectMemories()
    const largeEntity = {
      id: 'existing-large',
      name: '超大实体',
      description: 'y'.repeat(SNAPSHOT_MAX_CHARS),
      evidence: []
    }
    memory.entities.push(largeEntity as unknown as MemoryData['entities'][number])

    const draft = prepareTransaction('project-snapshot', memory, memoryDelta('追加实体'), {
      chapterId: 'chapter-1',
      blacklist: []
    })
    const result = await commitTransaction(draft)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('snapshot_limit_exceeded')
  })

  it('rebuilds a rejected stale draft against the current state', async () => {
    resetTrackingStateForTests()
    const memory = createProjectMemories()
    const staleDraft = prepareTransaction('project-rebuild', memory, memoryDelta('旧批次'), {
      chapterId: 'chapter-1',
      chapterIndex: 0,
      blacklist: []
    })
    const fresh = await commitTransaction(prepareTransaction('project-rebuild', memory, memoryDelta('新批次'), {
      chapterId: 'chapter-2',
      chapterIndex: 1,
      blacklist: []
    }))
    const rejected = await commitTransaction(staleDraft)
    expect(rejected.ok).toBe(false)

    const rebuilt = createTrackingTransaction({
      projectId: staleDraft.projectId,
      currentMemory: fresh.ok ? fresh.data : memory,
      extracted: staleDraft.extracted,
      chapterId: staleDraft.chapterId,
      chapterIndex: staleDraft.chapterIndex,
      blacklist: staleDraft.blacklist
    })
    const retry = await commitTransaction(rebuilt)

    expect(retry.ok).toBe(true)
    if (!retry.ok) return
    expect(retry.data.entities.map(item => item.name)).toEqual(expect.arrayContaining(['新批次', '旧批次']))
    expect(retry.data.meta.stateRevision).toBe(3)
  })

  it('runs user imports through the project queue and invalidates pending model drafts', async () => {
    resetTrackingStateForTests()
    const memory = createProjectMemories()
    const pendingDraft = prepareTransaction('project-import', memory, memoryDelta('模型批次'), {
      chapterId: 'chapter-1',
      blacklist: []
    })
    const imported = createMemoryData()
    imported.entities.push({
      id: 'imported-entity',
      name: '导入实体'
    } as unknown as MemoryData['entities'][number])

    const result = await commitImport('project-import', imported, { chapterId: 'memory-import' })
    const stale = await commitTransaction(pendingDraft)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.meta.stateRevision).toBe(2)
    expect(result.data.meta.lastCommittedChapter).toBe('memory-import')
    expect(stale.ok).toBe(false)
    if (stale.ok) return
    expect(stale.error.code).toBe('stale_state')
  })

  it('rejects oversized imports without advancing the revision', async () => {
    resetTrackingStateForTests()
    const oversized = createMemoryData()
    oversized.entities.push({
      id: 'oversized-import',
      name: '超大导入',
      description: 'z'.repeat(SNAPSHOT_MAX_CHARS + 1)
    } as unknown as MemoryData['entities'][number])

    const result = await commitImport('project-import-oversize', oversized, { chapterId: 'memory-import' })
    const normal = await commitImport('project-import-oversize', createMemoryData(), { chapterId: 'memory-import' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('snapshot_limit_exceeded')
    expect(normal.ok).toBe(true)
    if (!normal.ok) return
    expect(normal.revision).toBe(2)
  })
})
