import type { SettingsProjectionLayer } from './settingsProjection'

export const SETTINGS_PROJECTION_POLICY_VERSION = 2

export type SemanticSettingCategory =
  | 'character'
  | 'scene'
  | 'world'
  | 'faction'
  | 'item'
  | 'event'
  | 'style'
  | 'other'

export interface SemanticSettingsItem {
  category: string
  name: string
  text: string
  keywords: string[]
}

export interface SettingsProjectionContext {
  query?: string
}

export interface SettingsLayerProjectionResult {
  text: string
  blocks: Array<{
    semanticCategory: SemanticSettingCategory
    label: string
    lines: string[]
  }>
  categoryDistribution: Record<string, number>
  warnings: string[]
  includedReasons: string[]
  excludedReasons: string[]
  trimmedReasons: string[]
}

export const SETTINGS_PROJECTION_BUDGETS: Partial<Record<SettingsProjectionLayer, number>> = {
  volume: 1200,
  chapter: 1500,
  body: 1800
}

const BUDGET_TRIM_PRIORITY: Partial<Record<SettingsProjectionLayer, SemanticSettingCategory[]>> = {
  volume: ['other', 'item', 'event', 'scene', 'faction', 'style', 'world', 'character'],
  chapter: ['other', 'item', 'event', 'style', 'scene', 'faction', 'world', 'character'],
  body: ['other', 'item', 'event', 'scene', 'faction', 'style', 'world', 'character']
}

const CATEGORY_RULES: Array<{ semantic: SemanticSettingCategory; keywords: string[] }> = [
  { semantic: 'character', keywords: ['人物', '角色', 'character'] },
  { semantic: 'scene', keywords: ['场景', '地点', '空间', 'scene'] },
  { semantic: 'world', keywords: ['世界观', '世界', '规则', 'world'] },
  { semantic: 'faction', keywords: ['势力', '组织', '阵营'] },
  { semantic: 'item', keywords: ['物品', '道具'] },
  { semantic: 'event', keywords: ['事件'] },
  { semantic: 'style', keywords: ['风格', '基调', '节奏', 'style'] }
]

function semanticForValue(value: string): SemanticSettingCategory | null {
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(keyword => value.includes(keyword))) return rule.semantic
  }
  return null
}

const LAYER_CONFIG: Record<SettingsProjectionLayer, {
  header: string
  instructions: string[]
  sections: Array<{ semantic: SemanticSettingCategory; label: string }>
}> = {
  volume: {
    header: '[设定规划约束]',
    instructions: [
      '卷数分配、冲突升级和人物阶段必须遵守以下锁定设定。',
      '规划卷纲时不得违背世界规则，不得让人物关系发生无来源漂移。'
    ],
    sections: [
      { semantic: 'character', label: '[人物规划约束]' },
      { semantic: 'world', label: '[世界规则]' },
      { semantic: 'faction', label: '[势力约束]' },
      { semantic: 'scene', label: '[主要场景]' },
      { semantic: 'item', label: '[关键物品]' },
      { semantic: 'event', label: '[事件约束]' },
      { semantic: 'style', label: '[卷级风格]' },
      { semantic: 'other', label: '[其他锁定设定]' }
    ]
  },
  chapter: {
    header: '[章节规划约束]',
    instructions: [
      '章节切分、剧情点、人物出场和场景选择必须遵守以下锁定设定。',
      '章节规划不得违背世界规则，不得提前释放终局信息。'
    ],
    sections: [
      { semantic: 'character', label: '[出场人物约束]' },
      { semantic: 'scene', label: '[章节场景]' },
      { semantic: 'item', label: '[章节物品]' },
      { semantic: 'world', label: '[世界规则]' },
      { semantic: 'faction', label: '[势力约束]' },
      { semantic: 'event', label: '[事件约束]' },
      { semantic: 'style', label: '[章节节奏]' },
      { semantic: 'other', label: '[其他锁定设定]' }
    ]
  },
  body: {
    header: '[正文执行约束]',
    instructions: [
      '正文对话、动作和描写必须遵守以下锁定设定。',
      '人物口吻不得互相串味；场景描写不得空间漂移；事实边界不得违背。'
    ],
    sections: [
      { semantic: 'character', label: '[人物口吻与行为]' },
      { semantic: 'scene', label: '[场景氛围]' },
      { semantic: 'item', label: '[物品状态]' },
      { semantic: 'world', label: '[事实边界]' },
      { semantic: 'faction', label: '[势力立场]' },
      { semantic: 'event', label: '[事件边界]' },
      { semantic: 'style', label: '[表达风格]' },
      { semantic: 'other', label: '[其他执行约束]' }
    ]
  },
  home: {
    header: '[当前上下文设定]',
    instructions: [
      '以下锁定设定与当前讨论目标相关，共创时必须保持一致。',
      '若用户要求执行生成，交由对应流水线层执行，不在首页复制执行语义。'
    ],
    sections: [
      { semantic: 'character', label: '[相关人物]' },
      { semantic: 'scene', label: '[相关场景]' },
      { semantic: 'item', label: '[相关物品]' },
      { semantic: 'world', label: '[相关世界规则]' },
      { semantic: 'faction', label: '[相关势力]' },
      { semantic: 'event', label: '[相关事件]' },
      { semantic: 'style', label: '[相关风格]' },
      { semantic: 'other', label: '[相关设定]' }
    ]
  }
}

export function assertSettingsProjectionLayer(layer: SettingsProjectionLayer): void {
  if (!Object.prototype.hasOwnProperty.call(LAYER_CONFIG, layer)) {
    throw new Error(`Unsupported settings projection layer: ${layer}`)
  }
}

export function normalizeSemanticCategory(
  category: string,
  name = '',
  text = ''
): SemanticSettingCategory {
  const explicit = semanticForValue(String(category || '').toLowerCase())
  if (explicit) return explicit
  return semanticForValue(`${name} ${text}`.toLowerCase()) || 'other'
}

function itemKeywords(item: SemanticSettingsItem): string[] {
  return item.keywords
    .map(keyword => String(keyword || '').trim().toLowerCase())
    .filter(Boolean)
}

function matchesQuery(item: SemanticSettingsItem, query: string): boolean {
  const normalized = query.toLowerCase()
  if (!normalized) return false
  const name = item.name.trim().toLowerCase()
  if (name && normalized.includes(name)) return true
  return itemKeywords(item).some(keyword => normalized.includes(keyword))
}

function lineOf(item: SemanticSettingsItem): string {
  return `${item.category} - ${item.name} - ${item.text}`
}

export function buildSettingsLayerProjection(
  layer: SettingsProjectionLayer,
  items: SemanticSettingsItem[],
  context: SettingsProjectionContext = {}
): SettingsLayerProjectionResult {
  assertSettingsProjectionLayer(layer)
  const config = LAYER_CONFIG[layer]
  const warnings: string[] = []
  const includedReasons: string[] = []
  const excludedReasons: string[] = []
  const trimmedReasons: string[] = []
  const query = String(context.query || '').trim()

  let selected = items
  if (layer === 'home' && query) {
    const matched = items.filter(item => matchesQuery(item, query))
    if (matched.length > 0) {
      selected = matched
      matched.forEach(item => includedReasons.push(`query_match:${item.name}`))
      items
        .filter(item => !matched.includes(item))
        .forEach(item => excludedReasons.push(`query_no_match:${item.name}`))
    } else {
      warnings.push('home_projection_no_query_match_fallback_all_locked')
      items.forEach(item => includedReasons.push(`query_unknown:${item.name}`))
    }
  } else {
    items.forEach(item => includedReasons.push(`locked:${item.name}`))
  }

  if (selected.length === 0) {
    return {
      text: '',
      blocks: [],
      categoryDistribution: {},
      warnings,
      includedReasons,
      excludedReasons,
      trimmedReasons: []
    }
  }

  const grouped = new Map<SemanticSettingCategory, string[]>()
  for (const item of selected) {
    const semantic = normalizeSemanticCategory(item.category, item.name, item.text)
    if (semantic === 'other') {
      warnings.push(`unrecognized_settings_category:${item.category || 'unknown'}`)
    }
    const lines = grouped.get(semantic) || []
    lines.push(lineOf(item))
    grouped.set(semantic, lines)
  }

  const blocks = config.sections
    .map(section => ({
      semanticCategory: section.semantic,
      label: section.label,
      lines: grouped.get(section.semantic) || []
    }))
    .filter(block => block.lines.length > 0)

  let trimmableBlocks = blocks
  const budget = SETTINGS_PROJECTION_BUDGETS[layer]
  if (budget != null) {
    const priorities = BUDGET_TRIM_PRIORITY[layer] || []
    const headerSize = [config.header, ...config.instructions].join('\n').length + 1
    const projectedSize = () => headerSize + trimmableBlocks
      .reduce((sum, block) => sum + block.label.length + 1 + block.lines.join('\n').length + 1, 0)
    while (projectedSize() > budget) {
      const target = priorities.find(priority => {
        const block = trimmableBlocks.find(item => item.semanticCategory === priority)
        return block && block.lines.length > 0
      })
      const block = target
        ? trimmableBlocks.find(item => item.semanticCategory === target)
        : trimmableBlocks.find(item => item.lines.length > 0)
      if (!block) break
      const dropped = block.lines.pop()
      if (dropped) trimmedReasons.push(`layer_budget_trim:${block.semanticCategory}:${dropped.slice(0, 60)}`)
      if (!block.lines.length) {
        trimmableBlocks = trimmableBlocks.filter(item => item !== block)
      }
    }
  }

  const text = [
    config.header,
    ...config.instructions,
    ...trimmableBlocks.map(block => `${block.label}\n${block.lines.join('\n')}`)
  ].join('\n')

  const categoryDistribution: Record<string, number> = {}
  for (const block of trimmableBlocks) {
    categoryDistribution[block.semanticCategory] = block.lines.length
  }

  return {
    text,
    blocks: trimmableBlocks,
    categoryDistribution,
    warnings,
    includedReasons,
    excludedReasons,
    trimmedReasons
  }
}
