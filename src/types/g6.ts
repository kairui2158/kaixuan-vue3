import type { EdgeData, GraphData, NodeData, TreeData } from '@antv/g6'
import type {
  MemoryData,
  MemoryEntity,
  MemoryEvent,
  MemoryRelation
} from './memory'
import type {
  MemoryChapterSource,
  MemoryTimelineItem,
  MemoryVolumeSource
} from '../composables/useMemoryGraph'

export interface MemoryGraphData extends GraphData {
  nodes: G6NodeData[]
  edges: G6EdgeData[]
}

export interface G6NodeData extends NodeData {
  data: {
    label: string
    type?: string
    kind?: string
    summary?: string
    chapterIndex?: number
    chapterId?: string
    characters?: string[]
    location?: string
    entity?: MemoryEntity
    event?: MemoryEvent
  }
}

export interface G6EdgeData extends EdgeData {
  id: string
  data?: {
    label?: string
    relation?: MemoryRelation
  }
}

export type G6GraphData = Pick<MemoryGraphData, 'nodes' | 'edges'>
export type G6TreeData = TreeData

export type {
  MemoryEvent,
  MemoryData,
  MemoryChapterSource,
  MemoryTimelineItem,
  MemoryVolumeSource
}
