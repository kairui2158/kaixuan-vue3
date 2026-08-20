/**
 * 记忆板块数据模型
 * 定义实体/关系/事件/世界观/伏笔的完整 schema
 * 兼容旧架构的 categories + items 字段
 */

/** 记忆条目（兼容旧架构） */
export interface MemoryItem {
  key: string
  category: string
  content: string
  created?: string
  sourceChapterId?: string
  locked?: boolean
}

/** 实体（人物/组织/地点等） */
export interface MemoryEntity {
  id: string
  name: string
  type: 'character' | 'organization' | 'location' | 'item' | 'concept' | 'other'
  aliases: string[]
  firstAppearance: string
  lastAppearance: string
  appearances: string[]
  description: string
  personality: string
  appearance: string
  background: string
  status: string
  statusHistory?: Array<{ chapterId: string; value: string; recordedAt: string }>
  possessions: string[]
  skills: string[]
  relationships: string[]
  notes: string
  lockedFields: string[]
  evidence: Array<{ chapterId: string; snippet: string }>
  createdAt: string
  updatedAt: string
}

/** 关系（实体之间的关联） */
export interface MemoryRelation {
  id: string
  sourceId: string
  targetId: string
  type: string
  strength: number
  detail: string
  evidence: Array<{ chapterId: string; snippet: string }>
  locked: boolean
  createdAt: string
  updatedAt: string
}

/** 事件（剧情事件） */
export interface MemoryEvent {
  id: string
  title: string
  type: string
  chapterId: string
  chapterIndex: number
  characters: string[]
  location: string
  summary: string
  consequences: string[]
  locked: boolean
  evidence: Array<{ chapterId: string; snippet: string }>
  createdAt: string
}

/** 世界观条目 */
export interface WorldEntry {
  id: string
  name: string
  category: '地理' | '政治' | '经济' | '文化' | '魔法' | '科技' | '历史' | '其他'
  description: string
  location?: string
  established: boolean
  locked: boolean
  evidence: Array<{ chapterId: string; snippet: string }>
  createdAt: string
}

/** 伏笔 */
export interface Foreshadowing {
  id: string
  title: string
  description: string
  plantedChapterId: string
  plantedChapterIndex: number
  revealChapterId?: string
  revealChapterIndex?: number
  status: 'planted' | 'active' | 'resolved' | 'abandoned'
  resolved: boolean
  locked: boolean
  evidence: Array<{ chapterId: string; snippet: string }>
  createdAt: string
}

/** 记忆元数据 */
export interface MemoryMeta {
  extractionCount: number
  lastExtractedAt: string | null
  lastFullRebuildAt: string | null
  pendingCount: number
  totals: {
    entities: number
    relations: number
    events: number
    world: number
    foreshadowing: number
  }
}

/** 记忆数据的单次变更审计记录。快照不包含 history，避免版本递归膨胀。 */
export interface MemoryChangeRecord {
  id: string
  chapterId: string
  chapterIndex?: number
  timestamp: string
  reason?: string
  before: Omit<MemoryData, 'history'>
  after: Omit<MemoryData, 'history'>
}

/** 顶层记忆数据 */
export interface MemoryData {
  version: 1
  entities: MemoryEntity[]
  relations: MemoryRelation[]
  events: MemoryEvent[]
  world: WorldEntry[]
  foreshadowing: Foreshadowing[]
  meta: MemoryMeta
  history?: MemoryChangeRecord[]
  categories: string[]
  items: MemoryItem[]
}
