import { describe, expect, it } from 'vitest'
import { adaptTreeForG6, toG6Data, timelineToG6Data } from './useG6Graph'
import type { MemoryData } from '../types/memory'

function createMemoryData(): MemoryData {
  return {
    version: 1,
    entities: [
      {
        id: 'entity-1',
        name: '林川',
        type: 'character',
        aliases: [],
        firstAppearance: '',
        lastAppearance: '',
        appearances: [],
        description: '主角',
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
        updatedAt: ''
      },
      {
        id: 'entity-2',
        name: '沈月',
        type: 'character',
        aliases: [],
        firstAppearance: '',
        lastAppearance: '',
        appearances: [],
        description: '女主',
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
        updatedAt: ''
      }
    ],
    relations: [
      {
        id: 'relation-1',
        sourceId: 'entity-1',
        targetId: 'entity-2',
        type: '挚友',
        strength: 8,
        detail: '',
        evidence: [],
        locked: false,
        createdAt: '',
        updatedAt: ''
      }
    ],
    events: [
      {
        id: 'event-1',
        title: '初遇',
        type: '转折',
        chapterId: 'chapter-1',
        chapterIndex: 1,
        characters: ['林川', '沈月'],
        location: '北城',
        summary: '林川与沈月初遇。',
        consequences: [],
        locked: false,
        evidence: [],
        createdAt: ''
      }
    ],
    world: [],
    foreshadowing: [],
    meta: {
      extractionCount: 0,
      lastExtractedAt: null,
      lastFullRebuildAt: null,
      pendingCount: 0,
      totals: { entities: 2, relations: 1, events: 1, world: 0, foreshadowing: 0 }
    },
    categories: [],
    items: []
  }
}

describe('toG6Data', () => {
  it('moves label and type into node data', () => {
    const data = toG6Data(createMemoryData())
    expect(data.nodes[0].data.label).toBe('林川')
    expect(data.nodes[0].data.type).toBe('entity')
  })

  it('keeps valid relation edges', () => {
    const data = toG6Data(createMemoryData())
    expect(data.edges).toHaveLength(1)
    expect(data.edges[0].data?.label).toBe('挚友')
  })
})

describe('adaptTreeForG6', () => {
  it('converts volume/chapter/event to label/children', () => {
    const memories = createMemoryData()
    const tree = adaptTreeForG6(
      [{ id: 'volume-1', name: '第一卷' }],
      { 'volume-1': [{ id: 'chapter-1', title: '第一章' }] },
      memories.events
    )
    expect(tree[0].data.label).toBe('第一卷')
    expect(tree[0].children?.[0]?.data.label).toBe('第一章')
    expect(tree[0].children?.[0]?.children?.[0]?.data.label).toBe('初遇')
  })
})

describe('timelineToG6Data', () => {
  it('creates ordered event nodes and edges', () => {
    const memories = createMemoryData()
    const timeline = [
      {
        id: 'event-1',
        chapterId: 'chapter-1',
        chapterIndex: 1,
        title: '初遇',
        type: '转折',
        summary: '林川与沈月初遇。',
        characters: ['林川'],
        location: '北城',
        data: memories.events[0]
      },
      {
        id: 'event-2',
        chapterId: 'chapter-2',
        chapterIndex: 2,
        title: '分别',
        type: '低谷',
        summary: '二人分别。',
        characters: ['林川'],
        location: '南城',
        data: memories.events[0]
      }
    ]
    const data = timelineToG6Data(timeline)
    expect(data.nodes).toHaveLength(2)
    expect(data.edges).toHaveLength(1)
    expect(data.edges[0].source).toBe('event-1')
    expect(data.edges[0].target).toBe('event-2')
  })
})
