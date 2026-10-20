import type { MemoryData, MemoryEntity, WorldEntry } from '../types/memory'
import { normalizeSemanticCategory } from './settingsLayerSemantics'
import type { SettingsProjection } from './settingsProjection'

export interface ContextConflict {
  entityName: string
  settingLine: string
  memoryLine: string
  conflictKind: 'entity' | 'world'
}

export interface ContextConflictResult {
  memoryText: string
  conflicts: ContextConflict[]
  priorityNote: string
}

function clean(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

interface SettingItem {
  category: string
  name: string
  text: string
  semanticCategory: ReturnType<typeof normalizeSemanticCategory>
}

function settingItemNames(projection: SettingsProjection): SettingItem[] {
  const unique = new Map<string, SettingItem>()
  for (const item of projection.items) {
    if (!item.name) continue
    const text = item.text
    const semanticCategory = normalizeSemanticCategory(item.category, item.name, text)
    unique.set(item.name, {
      category: item.category,
      name: item.name,
      text,
      semanticCategory
    })
  }
  return [...unique.values()]
}

function aliases(entity: MemoryEntity): string[] {
  return [entity.name, ...(entity.aliases || [])]
    .map(clean)
    .filter(Boolean)
}

function lineMentionsAnyName(line: string, names: string[]): boolean {
  return names.some(name => name.length > 1 && line.includes(name))
}

export function detectContextConflicts(
  settingsProjection: SettingsProjection,
  memory: MemoryData | null | undefined
): ContextConflict[] {
  const conflicts: ContextConflict[] = []
  if (!memory) return conflicts

  const entityByName = new Map<string, { entity: MemoryEntity; names: string[]; line: string }>()
  for (const entity of memory.entities || []) {
    const names = aliases(entity)
    const status = clean(entity.status)
    const description = clean(entity.description) || clean(entity.notes)
    const line = `- ${clean(entity.name) || '未命名实体'}${entity.aliases?.length ? `（别名：${entity.aliases.join('、')}）` : ''}${status ? `；状态：${status}` : ''}${description ? `；${description}` : ''}`
    for (const name of names) {
      if (!entityByName.has(name)) entityByName.set(name, { entity, names, line })
    }
  }

  for (const setting of settingItemNames(settingsProjection)) {
    if (setting.semanticCategory !== 'character') continue
    const settingLine = `${setting.category} - ${setting.name} - ${setting.text}`
    for (const [name, memoryItem] of entityByName) {
      if (!lineMentionsAnyName(settingLine, memoryItem.names)) continue
      if (setting.text === memoryItem.entity.description || setting.text === memoryItem.entity.status) continue
      if (conflicts.some(item => item.memoryLine === memoryItem.line && item.settingLine === settingLine)) continue
      conflicts.push({
        entityName: clean(memoryItem.entity.name) || name,
        settingLine,
        memoryLine: memoryItem.line,
        conflictKind: 'entity'
      })
    }
  }

  const worldByName = new Map<string, { world: WorldEntry; names: string[]; line: string }>()
  for (const world of memory.world || []) {
    const names = [clean(world.name)].filter(Boolean)
    const line = `- ${clean(world.name) || '未命名设定'}：${clean(world.description)}`
    for (const name of names) {
      if (!worldByName.has(name)) worldByName.set(name, { world, names, line })
    }
  }
  for (const setting of settingItemNames(settingsProjection)) {
    if (setting.semanticCategory !== 'world') continue
    const settingLine = `${setting.category} - ${setting.name} - ${setting.text}`
    for (const [name, worldItem] of worldByName) {
      if (!lineMentionsAnyName(settingLine, worldItem.names)) continue
      if (setting.text === worldItem.world.description) continue
      if (conflicts.some(item => item.memoryLine === worldItem.line && item.settingLine === settingLine)) continue
      conflicts.push({
        entityName: clean(worldItem.world.name) || name,
        settingLine,
        memoryLine: worldItem.line,
        conflictKind: 'world'
      })
    }
  }

  return conflicts
}

export function applyLockedSettingsPriority(
  memoryText: string,
  conflicts: ContextConflict[]
): ContextConflictResult {
  if (!memoryText) return { memoryText, conflicts, priorityNote: '' }
  if (!conflicts.length) return { memoryText, conflicts, priorityNote: '' }

  let output = memoryText
  for (const conflict of conflicts) {
    output = output.replace(
      conflict.memoryLine,
      `已被锁定设定覆盖：${conflict.memoryLine}`
    )
  }
  const priorityNote = '[上下文优先级]\n锁定设定优先于相关记忆；带“已被锁定设定覆盖”前缀的记忆行仅作历史参考，不得覆盖锁定设定。'
  return {
    memoryText: output,
    conflicts,
    priorityNote
  }
}

export function contextConflictScopeForLayer(layer: 'volume' | 'chapter' | 'body'): {
  enabled: boolean
  reason: string
} {
  return layer === 'body'
    ? { enabled: true, reason: 'body_layer_injects_memory' }
    : { enabled: false, reason: `${layer}_layer_does_not_inject_memory` }
}

export function appendPriorityNote(prompt: string, priorityNote: string): string {
  if (!priorityNote || prompt.includes(priorityNote)) return prompt
  return `${prompt}\n\n${priorityNote}`
}

export function buildContextConflictTraceEvent(
  conflicts: ContextConflict[]
): { type: string; level: 'info' | 'warn'; label: string; detail: string } | null {
  if (!conflicts.length) return null
  return {
    type: 'context-conflict-detected',
    level: 'warn',
    label: `锁定设定与相关记忆存在 ${conflicts.length} 处冲突`,
    detail: JSON.stringify({
      conflictCount: conflicts.length,
      conflicts: conflicts.map(conflict => ({
        entityName: conflict.entityName,
        conflictKind: conflict.conflictKind,
        settingLine: conflict.settingLine,
        memoryLine: conflict.memoryLine
      }))
    })
  }
}
