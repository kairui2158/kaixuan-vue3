/**
 * AI 起名工作台类型定义
 * 定义命名类型、请求参数、结果、历史与收藏数据结构
 */

export type NamingType =
  | 'character'
  | 'location'
  | 'city'
  | 'faction'
  | 'item'
  | 'technique'
  | 'custom'

export interface NamingOptions {
  /** 命名类别 */
  type: NamingType
  /** 自定义类别名称（type === 'custom' 时使用） */
  customType?: string
  /** 背景与上下文 */
  context: string
  /** 命名风格描述 */
  style: string
  /** 性别（主要用于角色类型） */
  gender?: string
  /** 种族（主要用于角色类型） */
  species?: string
  /** 名字字数范围，如 "2-3" */
  length?: string
  /** 生成数量 1-20 */
  count: number
}

export interface NamingResult {
  /** 唯一标识 */
  id: string
  /** 生成的名字 */
  name: string
  /** 含义或构词解释 */
  meaning: string
  /** 适用场景描述 */
  usage?: string
  /** 对应的命名类别 */
  type: NamingType
  /** 创建时间 ISO */
  createdAt: string
  /** 用户是否编辑过 */
  edited?: boolean
  /** 关联的请求 ID */
  sourceRequestId?: string
}

export interface NamingHistoryRecord {
  /** 唯一标识 */
  id: string
  /** 当次请求参数 */
  request: NamingOptions
  /** 当次生成结果 */
  results: NamingResult[]
  /** 创建时间 ISO */
  createdAt: string
}

export interface AiNamingData {
  /** 数据结构版本 */
  version: 1
  /** 收藏的结果列表 */
  favorites: NamingResult[]
  /** 历史请求记录 */
  history: NamingHistoryRecord[]
}

/** 弹窗打开时携带的编辑器目标快照 */
export interface NamingInsertTarget {
  /** 目标编辑器 tab ID */
  tabId: string
  /** 目标章节 ID */
  chapterId: string
  /** 编辑器模式 */
  mode?: 'ch-body' | 'vol-outline' | 'ch-plot'
  /** 选区起始位置 */
  selectionStart: number
  /** 选区结束位置 */
  selectionEnd: number
  /** 选中文本 */
  selectedText: string
  /** 当前正文快照（用于检测弹窗期间内容变化） */
  contentSnapshot: string
}

/** 命名请求状态 */
export type NamingStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'partial'
  | 'error'
  | 'canceled'

/** 命名类别标签映射 */
export const NAMING_TYPE_LABELS: Record<NamingType, string> = {
  character: '角色',
  location: '地点',
  city: '城市',
  faction: '势力',
  item: '物品',
  technique: '功法技能',
  custom: '自定义',
}

/** 命名类别提示词标签 */
export const NAMING_TYPE_PROMPT_LABELS: Record<NamingType, string> = {
  character: '角色名',
  location: '地点名',
  city: '城市名',
  faction: '势力/门派名',
  item: '物品名',
  technique: '功法/技能名',
  custom: '名称',
}

/** 默认命名数据 */
export function createDefaultAiNamingData(): AiNamingData {
  return {
    version: 1,
    favorites: [],
    history: [],
  }
}

/** 兼容旧项目：补齐缺失字段 */
export function normalizeAiNaming(raw: any): AiNamingData {
  const base = createDefaultAiNamingData()
  if (!raw || typeof raw !== 'object') return base
  return {
    version: 1,
    favorites: Array.isArray(raw.favorites) ? raw.favorites : [],
    history: Array.isArray(raw.history) ? raw.history : [],
  }
}

/** 历史上限 */
export const MAX_HISTORY = 100
/** 收藏上限 */
export const MAX_FAVORITES = 500
/** 单次生成上限 */
export const MAX_COUNT = 20
/** 单次生成下限 */
export const MIN_COUNT = 1
