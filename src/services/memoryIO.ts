 /**
  * 记忆板块导入导出服务
  * 全量 JSON 导出/导入 + 角色卡 V3 兼容 (SillyTavern/Chub)
  */
import type { MemoryData, MemoryEntity } from '../types/memory'
 
 type EntityEvidence = Array<{ chapterId: string; snippet: string }>
 
 /** 全量导出包装格式 */
 export interface MemoryFullExport {
   format: 'shenyi-memory'
   version: 1
   exportedAt: string
   source?: string
   memory: MemoryData
 }
 
export interface ImportResult {
  success: boolean
  error?: string
  memory?: MemoryData
  entity?: MemoryEntity
}

export interface MemoryImportMergeResult {
  memory: MemoryData
  added: number
  skipped: number
}

export interface MemoryBackup { createdAt: string; memory: MemoryData }

export function createMemoryBackup(memory: MemoryData): string {
  return JSON.stringify({ createdAt: new Date().toISOString(), memory: JSON.parse(JSON.stringify(memory)) })
}

export function recoverFromBackup(raw: string): ImportResult {
  try {
    const parsed = JSON.parse(raw) as Partial<MemoryBackup>
    if (!parsed || typeof parsed !== "object" || !parsed.memory) return { success: false, error: "备份格式无效" }
    return importFullJSON(JSON.stringify(parsed.memory))
  } catch (error) {
    return { success: false, error: "备份解析失败：" + (error instanceof Error ? error.message : "未知错误") }
  }
}
 
 // ---- 全量导出 ----
 
 export function exportFullJSON(memory: MemoryData, source?: string): string {
   const pkg: MemoryFullExport = {
     format: 'shenyi-memory',
     version: 1,
     exportedAt: new Date().toISOString(),
     source,
     memory: JSON.parse(JSON.stringify(memory))
   }
   return JSON.stringify(pkg, null, 2)
 }
 
 // ---- 全量导入 ----
 
export function importFullJSON(raw: string): ImportResult {
  try {
    const parsed = JSON.parse(raw)

    // 支持包装格式和裸 MemoryData
    let memory: MemoryData
    if (parsed && typeof parsed === 'object' && parsed.format === 'shenyi-memory' && parsed.memory) {
      memory = parsed.memory
    } else if (parsed && typeof parsed === 'object' && 'entities' in parsed) {
      memory = parsed
    } else {
      return { success: false, error: '无法识别的记忆数据格式：缺少 memory 字段或 entities 数组' }
    }

    // 校验核心字段
    if (!Array.isArray(memory.entities)) return { success: false, error: '记忆数据格式无效：entities 必须是数组' }
    if (!Array.isArray(memory.relations)) return { success: false, error: '记忆数据格式无效：relations 必须是数组' }
    if (!Array.isArray(memory.events)) return { success: false, error: '记忆数据格式无效：events 必须是数组' }
    if (!Array.isArray(memory.world)) return { success: false, error: '记忆数据格式无效：world 必须是数组' }
    if (!Array.isArray(memory.foreshadowing)) return { success: false, error: '记忆数据格式无效：foreshadowing 必须是数组' }

    return { success: true, memory: normalizeMemoryData(memory) }
  } catch (e) {
    return { success: false, error: `JSON 解析失败：${e instanceof Error ? e.message : '未知错误'}` }
  }
}

/**
 * 合并完整记忆快照。导入不是正文抽取，不应伪造章节证据或递增抽取计数。
 * 已存在的条目保留当前项目版本，新条目才追加；调用方负责记录项目变更历史。
 */
export function mergeImportedMemory(current: MemoryData, incoming: MemoryData): MemoryImportMergeResult {
  const memory = JSON.parse(JSON.stringify(current)) as MemoryData
  const source = JSON.parse(JSON.stringify(incoming)) as MemoryData
  let added = 0
  let skipped = 0

  const normalized = (value: unknown) => typeof value === 'string' ? value.trim().toLocaleLowerCase() : ''
  const key = (prefix: string, value: unknown) => {
    const normalizedValue = normalized(value)
    return normalizedValue ? `${prefix}:${normalizedValue}` : ''
  }
  const appendUnique = <T>(target: T[], values: T[], keysOf: (value: T) => string[]) => {
    const keys = new Set(target.flatMap(keysOf).filter(Boolean))
    for (const value of values) {
      const valueKeys = keysOf(value).filter(Boolean)
      if (valueKeys.length === 0 || valueKeys.some(key => keys.has(key))) {
        skipped += 1
        continue
      }
      target.push(value)
      valueKeys.forEach(key => keys.add(key))
      added += 1
    }
  }

  appendUnique(memory.entities, source.entities, value => {
    const item = value as MemoryEntity
    return [key('id', item.id), key('name', item.name)]
  })
  appendUnique(memory.relations, source.relations, value => {
    const item = value as MemoryData['relations'][number]
    return [key('id', item.id), key('link', `${normalized(item.sourceId)}|${normalized(item.targetId)}|${normalized(item.type)}`)]
  })
  appendUnique(memory.events, source.events, value => {
    const item = value as MemoryData['events'][number]
    return [key('id', item.id), key('event', `${normalized(item.chapterId)}|${normalized(item.title)}`)]
  })
  appendUnique(memory.world, source.world, value => {
    const item = value as MemoryData['world'][number]
    return [key('id', item.id), key('name', item.name)]
  })
  appendUnique(memory.foreshadowing, source.foreshadowing, value => {
    const item = value as MemoryData['foreshadowing'][number]
    return [key('id', item.id), key('title', item.title)]
  })
  memory.categories = [...new Set([...(memory.categories || []), ...(source.categories || [])])]
  appendUnique(memory.items, source.items, value => {
    const item = value as MemoryData['items'][number]
    return [key('item', `${normalized(item.category)}|${normalized(item.key)}`)]
  })
  memory.meta.totals = {
    entities: memory.entities.length,
    relations: memory.relations.length,
    events: memory.events.length,
    world: memory.world.length,
    foreshadowing: memory.foreshadowing.length
  }
  return { memory, added, skipped }
}
 
 function normalizeMemoryData(raw: any): MemoryData {
   const base = {
     version: 1 as const,
     entities: [] as any[],
     relations: [] as any[],
     events: [] as any[],
     world: [] as any[],
     foreshadowing: [] as any[],
     meta: { extractionCount: 0, lastExtractedAt: null, lastFullRebuildAt: null, pendingCount: 0, totals: { entities: 0, relations: 0, events: 0, world: 0, foreshadowing: 0 } },
     history: [] as any[],
     categories: ['情节', '人物', '世界观', '伏笔'],
     items: [] as any[]
   }
   if (!raw || typeof raw !== 'object') return base
   const out: MemoryData = {
     version: 1,
     entities: Array.isArray(raw.entities) ? raw.entities : [],
     relations: Array.isArray(raw.relations) ? raw.relations : [],
     events: Array.isArray(raw.events) ? raw.events : [],
     world: Array.isArray(raw.world) ? raw.world : [],
     foreshadowing: Array.isArray(raw.foreshadowing) ? raw.foreshadowing : [],
     meta: { ...base.meta, ...(raw.meta || {}) },
     history: Array.isArray(raw.history) ? raw.history : [],
     categories: Array.isArray(raw.categories) && raw.categories.length > 0 ? raw.categories : base.categories,
     items: Array.isArray(raw.items) ? raw.items : []
   }
   out.meta.totals = {
     entities: out.entities.length,
     relations: out.relations.length,
     events: out.events.length,
     world: out.world.length,
     foreshadowing: out.foreshadowing.length
   }
   return out
 }
 
 // ---- 角色卡 V3 导出 ----
 
 /** SillyTavern / Chub 标准 chara_card_v3 格式 */
 export interface CharacterCardV3 {
   spec: 'chara_card_v3'
   spec_version: '3.0'
   data: {
     name: string
     description: string
     personality: string
     scenario: string
     first_mes: string
     mes_example: string
     creator_notes: string
     system_prompt: string
     post_history_instructions: string
     alternate_greetings: string[]
     character_book: null | Record<string, unknown>
     tags: string[]
     creator: string
     character_version: string
     extensions: Record<string, unknown>
   }
 }
 
 export function exportCharacterCardV3(entity: MemoryEntity): string {
   const description = [
     entity.description,
     entity.background && `背景：${entity.background}`,
     entity.appearance && `外貌：${entity.appearance}`,
     entity.status && `状态：${entity.status}`,
     entity.notes && `备注：${entity.notes}`
   ].filter(Boolean).join('\n\n')
 
   const card: CharacterCardV3 = {
     spec: 'chara_card_v3',
     spec_version: '3.0',
     data: {
       name: entity.name || '未命名角色',
       description: description || '暂无描述',
       personality: entity.personality || '',
       scenario: '',
       first_mes: '',
       mes_example: '' ,
       creator_notes: '',
       system_prompt: '',
       post_history_instructions: '',
       alternate_greetings: [],
       character_book: null,
       tags: [entity.type || 'character', ...(entity.aliases || [])],
       creator: '',
       character_version: '1.0',
       extensions: {
         shenyi_entity_id: entity.id,
         shenyi_possessions: entity.possessions || [],
         shenyi_skills: entity.skills || [],
         shenyi_relationships: entity.relationships || [],
         shenyi_first_appearance: entity.firstAppearance,
         shenyi_last_appearance: entity.lastAppearance,
         shenyi_status_history: entity.statusHistory,
         shenyi_locked_fields: entity.lockedFields,
         shenyi_evidence: entity.evidence,
         shenyi_created_at: entity.createdAt,
         shenyi_updated_at: entity.updatedAt
       }
     }
   }
   return JSON.stringify(card, null, 2)
 }
 
 // ---- 角色卡 V3 导入 ----
 
 export function importCharacterCardV3(raw: string): ImportResult {
   try {
     const parsed = JSON.parse(raw)
     if (!parsed || typeof parsed !== 'object') {
       return { success: false, error: '无效的 JSON 格式' }
     }
     if (parsed.spec !== 'chara_card_v3' && !parsed.data) {
       return { success: false, error: '不是有效的角色卡 V3 格式：缺少 spec 或 data 字段' }
     }
     const data = parsed.data
     if (!data || !data.name) {
       return { success: false, error: '角色卡数据缺少 name 字段' }
     }
 
     const ext = data.extensions || {}
     const now = new Date().toISOString()
 
     // 从 description 还原各字段（如果 extensions 有原生值则优先使用）
     const description = ext.shenyi_entity_id ? (data.description || '') : data.description.split('\n\n')[0] || ''
 
     const entity: MemoryEntity = {
       id: ext.shenyi_entity_id || ('ent_import_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)),
       name: data.name,
       type: (data.tags && data.tags.length > 0 && ['character', 'organization', 'location', 'item', 'concept', 'other'].includes(data.tags[0]))
         ? data.tags[0] as MemoryEntity['type']
         : 'character',
       aliases: Array.isArray(data.tags) ? data.tags.filter((t: string) => t !== data.tags[0]) : [],
       firstAppearance: ext.shenyi_first_appearance || '',
       lastAppearance: ext.shenyi_last_appearance || '',
       appearances: [],
       description: description,
       personality: data.personality || '',
       appearance: '',
       background: '',
       status: '',
       possessions: Array.isArray(ext.shenyi_possessions) ? ext.shenyi_possessions : [],
       skills: Array.isArray(ext.shenyi_skills) ? ext.shenyi_skills : [],
       relationships: Array.isArray(ext.shenyi_relationships) ? ext.shenyi_relationships : [],
       notes: '',
       lockedFields: Array.isArray(ext.shenyi_locked_fields) ? ext.shenyi_locked_fields : [],
       evidence: Array.isArray(ext.shenyi_evidence) ? ext.shenyi_evidence as EntityEvidence : [],
       createdAt: ext.shenyi_created_at || now,
       updatedAt: ext.shenyi_updated_at || now
     }
 
     return { success: true, entity }
   } catch (e) {
     return { success: false, error: `角色卡解析失败：${e instanceof Error ? e.message : '未知错误'}` }
   }
 }
