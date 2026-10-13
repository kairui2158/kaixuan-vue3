import { describe, expect, it } from 'vitest'
import type { MemoryData, MemoryEntity, MemoryEvent } from '../types/memory'
import { retrieveContext } from './memoryRetriever'

const baseEntity = (overrides: Partial<MemoryEntity>): MemoryEntity => ({
  id: 'entity',
  name: '实体',
  type: 'character',
  aliases: [],
  firstAppearance: '',
  lastAppearance: '',
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
  createdAt: '',
  updatedAt: '',
  ...overrides
})

const memory = (entities: MemoryEntity[], events: MemoryEvent[] = []): MemoryData => ({
  version: 1,
  entities,
  relations: [],
  events,
  world: [],
  foreshadowing: [],
  meta: {
    extractionCount: 1,
    lastExtractedAt: null,
    lastFullRebuildAt: null,
    pendingCount: 0,
    totals: { entities: entities.length, relations: 0, events: events.length, world: 0, foreshadowing: 0 }
  },
  categories: [],
  items: []
})

describe('memoryRetriever scoped priority', () => {
  it('keeps current chapter evidence ahead of unit and global context', () => {
    const data = memory([
      baseEntity({
        id: 'chapter-entity',
        name: '本章实体',
        evidence: [{ chapterId: 'ch-12', snippet: '本章证据' }]
      }),
      baseEntity({
        id: 'global-entity',
        name: '全局实体',
        description: '普通背景'
      })
    ])
    const result = retrieveContext(data, {
      chapterId: 'ch-12',
      unitId: 'D1-03',
      query: '本章 全局',
      maxChars: 500
    })
    expect(result.priority).toBe('current-chapter')
    expect(result.text.indexOf('本章实体')).toBeGreaterThanOrEqual(0)
    expect(result.text.indexOf('本章实体')).toBeLessThan(result.text.indexOf('全局实体'))
  })

  it('falls back to unit causality and records trimmed sections', () => {
    const entities = [
      baseEntity({ id: 'unit', name: '单元实体', description: 'D1-03 连续因果' }),
      baseEntity({ id: 'global', name: '全局实体', description: '普通背景' })
    ]
    const result = retrieveContext(memory(entities), {
      chapterId: 'ch-12',
      unitId: 'D1-03',
      query: 'D1-03 普通背景',
      maxChars: 300
    })
    expect(result.priority).toBe('current-unit')
    expect(result.text).toContain('单元实体')
  })

  it('records low-priority sections dropped by the fixed budget', () => {
    const data = memory([baseEntity({ id: 'one', name: '实体一', description: 'A'.repeat(300) })])
    const result = retrieveContext(data, { query: '实体一', maxChars: 200 })
    expect(result.priority).toBe('global-permanent')
    expect(result.text.length).toBeLessThanOrEqual(200)
  })
})
