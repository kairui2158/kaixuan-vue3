import { Graph, type GraphData, type GraphOptions } from '@antv/g6'
import type {
  G6GraphData,
  G6TreeData,
  MemoryChapterSource,
  MemoryData,
  MemoryEvent,
  MemoryGraphData,
  MemoryTimelineItem,
  MemoryVolumeSource
} from '../types/g6'

export type { G6GraphData, G6TreeData }

export function toG6Data(memories: Pick<MemoryData, 'entities' | 'relations'>): G6GraphData {
  const graph: MemoryGraphData = {
    nodes: [],
    edges: []
  }
  const entityIds = new Set(memories.entities.map(entity => entity.id))
  const nodes = memories.entities.map(entity => ({
    id: entity.id,
    data: {
      label: entity.name || entity.id,
      type: 'entity',
      entity
    }
  }))
  const edges = memories.relations
    .filter(relation => entityIds.has(relation.sourceId) && entityIds.has(relation.targetId))
    .map(relation => ({
      id: relation.id,
      source: relation.sourceId,
      target: relation.targetId,
      data: {
        label: relation.type || '关联',
        relation
      }
    }))
  graph.nodes = nodes
  graph.edges = edges
  return graph
}

export function adaptTreeForG6(
  volumes: MemoryVolumeSource[],
  chapters: Record<string, MemoryChapterSource[]>,
  events: MemoryEvent[]
): G6TreeData[] {
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
      data: {
        label: volume.name?.trim() || '未命名卷',
        kind: 'volume'
      },
      children: (chapters[volumeId] || []).map(chapter => {
        const chapterId = chapter.id || chapter.title || 'chapter'
        return {
          id: chapterId,
          data: {
            label: chapter.title?.trim() || '未命名章',
            kind: 'chapter'
          },
          children: (eventsByChapter.get(chapterId) || []).map(event => ({
            id: event.id,
            data: {
              label: event.title || '未命名事件',
              kind: 'event',
              summary: event.summary || '',
              event
            }
          }))
        }
      })
    }
  })
}

export function timelineToG6Data(timeline: MemoryTimelineItem[]): G6GraphData {
  const nodes = timeline.map(event => ({
    id: event.id,
    data: {
      label: event.title,
      kind: 'event',
      type: event.type,
      summary: event.summary,
      chapterIndex: event.chapterIndex,
      chapterId: event.chapterId,
      characters: event.characters,
      location: event.location,
      event: event.data
    }
  }))
  const edges = timeline.slice(0, -1).map((event, index) => ({
    id: `${event.id}-next`,
    source: event.id,
    target: timeline[index + 1].id
  }))
  return { nodes, edges }
}

export function createGraph(container: HTMLElement, options: GraphOptions): Graph {
  const graph = new Graph({
    container,
    autoResize: true,
    ...options
  })
  ;(container as HTMLElement & { __g6Graph?: Graph }).__g6Graph = graph
  const registry = window as typeof window & { __G6_GRAPHS__?: Set<Graph> }
  if (!registry.__G6_GRAPHS__) registry.__G6_GRAPHS__ = new Set()
  registry.__G6_GRAPHS__.add(graph)
  return graph
}

export function destroyGraph(graph: Graph | null | undefined): void {
  if (!graph) return
  const registry = window as typeof window & { __G6_GRAPHS__?: Set<Graph> }
  registry.__G6_GRAPHS__?.delete(graph)
  if (graph.destroyed) return
  graph.destroy()
}

export async function updateGraphData(graph: Graph, data: G6GraphData | GraphData): Promise<void> {
  if (!graph || graph.destroyed) return
  graph.setData(data)
  await graph.render()
}
