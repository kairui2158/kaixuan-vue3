import type {
  MemoryData,
  MemoryEntity,
  MemoryEvent,
  MemoryRelation
} from '../types/memory'

export interface MemoryGraphNode {
  id: string
  label: string
  type: 'entity' | 'event' | 'world' | 'foreshadowing'
  data: Record<string, unknown>
}

export interface MemoryGraphEdge {
  id: string
  source: string
  target: string
  label: string
  data: Record<string, unknown>
}

export interface MemoryGraphData {
  nodes: MemoryGraphNode[]
  edges: MemoryGraphEdge[]
}

export interface MemoryTimelineItem {
  id: string
  chapterId: string
  chapterIndex: number
  title: string
  type: string
  summary: string
  characters: string[]
  location: string
  data: MemoryEvent
}

export interface MemoryTreeVolume {
  id: string
  name: string
  chapters: Array<{
    id: string
    title: string
    events: Array<{ id: string; title: string; summary: string }>
  }>
}

export interface MemoryChapterSource {
  id?: string
  title?: string
}

export interface MemoryVolumeSource {
  id?: string
  name?: string
}

function safeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function entityNode(entity: MemoryEntity): MemoryGraphNode {
  return {
    id: entity.id,
    label: entity.name || entity.id,
    type: 'entity',
    data: { entity }
  }
}

function relationEdge(relation: MemoryRelation): MemoryGraphEdge {
  return {
    id: relation.id,
    source: relation.sourceId,
    target: relation.targetId,
    label: relation.type || '关联',
    data: { relation }
  }
}

/**
 * 记忆可视化的唯一图数据入口。组件只消费返回值，不维护自己的实体/关系副本。
 */
export function entitiesToGraphData(memories: Pick<MemoryData, 'entities' | 'relations'>): MemoryGraphData {
  const entityIds = new Set(memories.entities.map(entity => entity.id))
  return {
    nodes: memories.entities.map(entityNode),
    edges: memories.relations
      .filter(relation => entityIds.has(relation.sourceId) && entityIds.has(relation.targetId))
      .map(relationEdge)
  }
}

export function eventsToTimelineData(events: MemoryEvent[]): MemoryTimelineItem[] {
  return [...events]
    .sort((left, right) => left.chapterIndex - right.chapterIndex || left.id.localeCompare(right.id))
    .map(event => ({
      id: event.id,
      chapterId: event.chapterId,
      chapterIndex: event.chapterIndex,
      title: event.title || '未命名事件',
      type: event.type || '其他',
      summary: event.summary || '',
      characters: [...event.characters],
      location: event.location || '',
      data: event
    }))
}

export function toMarkdownTree(
  volumes: MemoryVolumeSource[],
  chapters: Record<string, MemoryChapterSource[]>,
  events: MemoryEvent[]
): string {
  const eventsByChapter = new Map<string, MemoryEvent[]>()
  for (const event of events) {
    const list = eventsByChapter.get(event.chapterId) || []
    list.push(event)
    eventsByChapter.set(event.chapterId, list)
  }

  const lines: string[] = []
  for (const volume of volumes) {
    const volumeId = volume.id || volume.name || 'volume'
    lines.push(`# ${safeText(volume.name) || '未命名卷'} <!-- ${volumeId} -->`)
    for (const chapter of chapters[volumeId] || []) {
      const chapterId = chapter.id || chapter.title || 'chapter'
      lines.push(`## ${safeText(chapter.title) || '未命名章'} <!-- ${chapterId} -->`)
      for (const event of eventsByChapter.get(chapterId) || []) {
        const summary = safeText(event.summary).replace(/\r?\n/g, ' ')
        lines.push(`- ${safeText(event.title) || '未命名事件'}${summary ? `：${summary}` : ''} <!-- ${event.id} -->`)
      }
    }
  }
  return lines.join('\n')
}

export function buildMemoryTree(
  volumes: MemoryVolumeSource[],
  chapters: Record<string, MemoryChapterSource[]>,
  events: MemoryEvent[]
): MemoryTreeVolume[] {
  const eventsByChapter = new Map<string, MemoryEvent[]>()
  for (const event of events) {
    const list = eventsByChapter.get(event.chapterId) || []
    list.push(event)
    eventsByChapter.set(event.chapterId, list)
  }
  return volumes.map(volume => {
    const volumeId = volume.id || volume.name || 'volume'
    return {
      id: volumeId,
      name: safeText(volume.name) || '未命名卷',
      chapters: (chapters[volumeId] || []).map(chapter => {
        const chapterId = chapter.id || chapter.title || 'chapter'
        return {
          id: chapterId,
          title: safeText(chapter.title) || '未命名章',
          events: (eventsByChapter.get(chapterId) || []).map(event => ({
            id: event.id,
            title: event.title || '未命名事件',
            summary: event.summary || ''
          }))
        }
      })
    }
  })
}

export function useMemoryGraph() {
  return {
    entitiesToGraphData,
    eventsToTimelineData,
    toMarkdownTree,
    buildMemoryTree
  }
}
