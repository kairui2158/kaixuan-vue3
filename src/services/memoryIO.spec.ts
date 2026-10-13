import { describe, expect, it } from 'vitest'
import type { MemoryData, MemoryEntity } from '../types/memory'
import { normalizeMemories } from '../stores/project'
import { exportFullJSON, importFullJSON, mergeImportedMemory } from './memoryIO'

function entity(id: string, name: string, description = ''): MemoryEntity {
  const now = '2026-01-01T00:00:00.000Z'
  return {
    id,
    name,
    type: 'character',
    aliases: [],
    firstAppearance: '',
    lastAppearance: '',
    appearances: [],
    description,
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
    createdAt: now,
    updatedAt: now
  }
}

function memory(entities: MemoryEntity[] = []): MemoryData {
  return {
    version: 1,
    entities,
    relations: [],
    events: [],
    world: [],
    foreshadowing: [],
    meta: {
      extractionCount: 0,
      lastExtractedAt: null,
      lastFullRebuildAt: null,
      pendingCount: 0,
      totals: { entities: entities.length, relations: 0, events: 0, world: 0, foreshadowing: 0 }
    },
    history: [],
    categories: ['人物'],
    items: []
  }
}

describe('memoryIO boundaries', () => {
  it('round-trips the export wrapper and recalculates totals', () => {
    const result = importFullJSON(exportFullJSON(memory([entity('e1', '林舟')]), 'test'))
    expect(result.success).toBe(true)
    expect(result.memory?.entities[0].name).toBe('林舟')
    expect(result.memory?.meta.totals.entities).toBe(1)
  })

  it('rejects malformed JSON and missing core arrays', () => {
    expect(importFullJSON('{broken').success).toBe(false)
    expect(importFullJSON(JSON.stringify({ entities: [] })).error).toMatch(/relations.*数组/)
  })

  it('keeps current records and skips duplicate incoming records', () => {
    const current = memory([entity('e1', '林舟', '当前版本')])
    const incoming = memory([entity('e1', '林舟', '导入版本'), entity('e2', '苏晚')])
    const result = mergeImportedMemory(current, incoming)
    expect(result.added).toBe(1)
    expect(result.skipped).toBe(1)
    expect(result.memory.entities.map(item => item.name)).toEqual(['林舟', '苏晚'])
    expect(result.memory.entities[0].description).toBe('当前版本')
    expect(result.memory.meta.totals.entities).toBe(2)
  })

  it('survives imported entities with missing schema fields', () => {
    const current = memory([entity('e1', '林舟')])
    const incoming = {
      version: 1,
      entities: [{ id: 'imported-incomplete', name: '缺失字段实体', type: 'character' }],
      relations: [{ id: 'imported-relation', sourceId: 'e1', targetId: 'imported-incomplete', type: '同盟' }],
      events: [{ id: 'imported-event', title: '缺失字段事件', chapterId: 'chapter-1' }],
      world: [{ id: 'imported-world', name: '缺失字段地点' }],
      foreshadowing: [{ id: 'imported-foreshadowing', title: '缺失字段伏笔', plantedChapterId: 'chapter-1' }],
      meta: {},
      history: [],
      categories: [],
      items: []
    }

    const parsed = importFullJSON(JSON.stringify(incoming))
    const merged = mergeImportedMemory(current, parsed.memory as MemoryData)
    const result = { ...merged, memory: normalizeMemories(merged.memory) }

    expect(result.added).toBe(5)
    const importedEntity = result.memory.entities.find(item => item.id === 'imported-incomplete')
    expect(importedEntity?.aliases).toEqual([])
    expect(importedEntity?.appearances).toEqual([])
    expect(importedEntity?.possessions).toEqual([])
    expect(importedEntity?.skills).toEqual([])
    expect(importedEntity?.evidence).toEqual([])
    expect(() => importedEntity?.appearances.join('、')).not.toThrow()
    expect(result.memory.relations.find(item => item.id === 'imported-relation')?.strength).toBe(0.5)
    expect(result.memory.events.find(item => item.id === 'imported-event')?.chapterIndex).toBe(0)
    expect(result.memory.world.find(item => item.id === 'imported-world')?.category).toBe('其他')
    expect(result.memory.foreshadowing.find(item => item.id === 'imported-foreshadowing')?.status).toBe('planted')
  })
})
