import type {
  Foreshadowing,
  MemoryData,
  MemoryEntity,
  MemoryEvent,
  MemoryRelation,
  WorldEntry
} from '../types/memory'
import type { ExtractedMemoryData } from './memoryExtractor'

export interface MemoryMergeOptions {
  chapterId: string
  chapterIndex?: number
  blacklist?: string[]
  now?: string
}

export interface MemoryChange {
  kind: 'entity' | 'relation' | 'event' | 'world' | 'foreshadowing'
  action: 'added' | 'updated' | 'skipped'
  id?: string
  name?: string
  reason?: string
}

export interface MemoryMergeResult {
  data: MemoryData
  changes: MemoryChange[]
}

const emptyEvidence = (chapterId: string) => [{ chapterId, snippet: '' }]

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function normalized(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase() : ''
}

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && Boolean(value.trim())).map(value => value.trim()))]
}

function isBlacklisted(value: unknown, blacklist: Set<string>): boolean {
  const id = normalized(value && typeof value === 'object' ? (value as { id?: unknown }).id : '')
  const name = normalized(value && typeof value === 'object' ? (value as { name?: unknown }).name : '')
  return (Boolean(id) && blacklist.has(id)) || (Boolean(name) && blacklist.has(name))
}

function newId(prefix: string, name: string, now: string): string {
  const slug = normalized(name).replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '') || 'unnamed'
  return `${prefix}_${slug}_${Date.parse(now) || Date.now()}`
}

function evidenceFor(value: { evidence?: unknown }, chapterId: string): MemoryEntity['evidence'] {
  if (!Array.isArray(value.evidence)) return emptyEvidence(chapterId)
  return value.evidence.filter(item => {
    if (!item || typeof item !== 'object') return false
    const row = item as { chapterId?: unknown; snippet?: unknown }
    return typeof row.chapterId === 'string' && typeof row.snippet === 'string' && row.snippet.trim()
  }) as MemoryEntity['evidence']
}

function sameEntity(entity: MemoryEntity, incoming: Partial<MemoryEntity>): boolean {
  const incomingName = normalized(incoming.name)
  if (!incomingName) return false
  const names = [entity.name, ...(entity.aliases || [])].map(normalized)
  return names.includes(incomingName) || (typeof incoming.id === 'string' && entity.id === incoming.id)
}

function appendEvidence<T extends { evidence: Array<{ chapterId: string; snippet: string }> }>(target: T, incoming: T['evidence']) {
  const seen = new Set(target.evidence.map(item => `${item.chapterId}\u0000${item.snippet}`))
  for (const item of incoming) {
    const key = `${item.chapterId}\u0000${item.snippet}`
    if (!seen.has(key)) {
      target.evidence.push(item)
      seen.add(key)
    }
  }
}

function mergeEntity(target: MemoryEntity, incoming: Partial<MemoryEntity>, options: Required<Pick<MemoryMergeOptions, 'chapterId' | 'now'>>, changes: MemoryChange[]) {
  const locked = new Set(target.lockedFields || [])
  const incomingEvidence = evidenceFor(incoming, options.chapterId)
  if (target.factStatus === 'confirmed' && incoming.factStatus === 'pending') target.factStatus = 'conflicted'
  appendEvidence(target, incomingEvidence)
  target.aliases = uniqueStrings([...target.aliases, ...uniqueStrings(incoming.aliases), incoming.name])
    .filter(alias => normalized(alias) !== normalized(target.name))

  const arrayFields: Array<keyof MemoryEntity> = ['appearances', 'possessions', 'skills', 'relationships']
  for (const field of arrayFields) {
    const values = incoming[field]
    if (Array.isArray(values) && !locked.has(String(field))) {
      target[field] = uniqueStrings([...(target[field] as string[]), ...values]) as never
    }
  }

  const scalarFields: Array<keyof MemoryEntity> = ['type', 'firstAppearance', 'lastAppearance', 'description', 'personality', 'appearance', 'background', 'notes']
  for (const field of scalarFields) {
    const value = incoming[field]
    if (typeof value === 'string' && value.trim() && !locked.has(String(field)) && !target[field]) {
      target[field] = value as never
    }
  }

  if (typeof incoming.status === 'string' && incoming.status.trim() && incoming.status !== target.status) {
    if (locked.has('status')) {
      changes.push({ kind: 'entity', action: 'skipped', id: target.id, name: target.name, reason: 'status 字段已锁定' })
    } else {
      target.statusHistory = [...(target.statusHistory || []), {
        chapterId: options.chapterId,
        value: target.status,
        recordedAt: options.now
      }]
      target.status = incoming.status
    }
  }
  target.updatedAt = options.now
  changes.push({ kind: 'entity', action: 'updated', id: target.id, name: target.name })
}

function mergeEntityList(data: MemoryData, values: Array<Partial<MemoryEntity>>, options: Required<Pick<MemoryMergeOptions, 'chapterId' | 'now'>>, blacklist: Set<string>, changes: MemoryChange[]) {
  for (const incoming of values) {
    if (!incoming || isBlacklisted(incoming, blacklist)) {
      changes.push({ kind: 'entity', action: 'skipped', name: incoming?.name, reason: '黑名单过滤' })
      continue
    }
    const target = data.entities.find(entity => sameEntity(entity, incoming))
    if (target) mergeEntity(target, incoming, options, changes)
    else {
      const name = typeof incoming.name === 'string' && incoming.name.trim() ? incoming.name.trim() : '未命名实体'
      const now = options.now
      const entity: MemoryEntity = {
        id: incoming.id || newId('ent', name, now),
        name,
        type: incoming.type || 'other',
        aliases: uniqueStrings(incoming.aliases).filter(alias => normalized(alias) !== normalized(name)),
        firstAppearance: incoming.firstAppearance || options.chapterId,
        lastAppearance: incoming.lastAppearance || options.chapterId,
        appearances: uniqueStrings(incoming.appearances),
        description: incoming.description || '', personality: incoming.personality || '', appearance: incoming.appearance || '',
        background: incoming.background || '', status: incoming.status || '', possessions: uniqueStrings(incoming.possessions),
        skills: uniqueStrings(incoming.skills), relationships: uniqueStrings(incoming.relationships), notes: incoming.notes || '',
        lockedFields: uniqueStrings(incoming.lockedFields), evidence: evidenceFor(incoming, options.chapterId), createdAt: now, updatedAt: now
      }
      data.entities.push(entity)
      changes.push({ kind: 'entity', action: 'added', id: entity.id, name: entity.name })
    }
  }
}

function mergeRelations(data: MemoryData, values: Array<Partial<MemoryRelation>>, chapterId: string, now: string, changes: MemoryChange[]) {
  for (const incoming of values) {
    if (!incoming?.sourceId || !incoming.targetId || !incoming.type) continue
    const target = data.relations.find(item => item.sourceId === incoming.sourceId && item.targetId === incoming.targetId && item.type === incoming.type)
    if (target) {
      if (target.locked) changes.push({ kind: 'relation', action: 'skipped', id: target.id, reason: '关系已锁定' })
      else {
        target.detail = incoming.detail || target.detail
        target.strength = typeof incoming.strength === 'number' ? incoming.strength : target.strength
        appendEvidence(target, evidenceFor(incoming, chapterId))
        target.updatedAt = now
        changes.push({ kind: 'relation', action: 'updated', id: target.id })
      }
    } else {
      const relation: MemoryRelation = { ...incoming, id: incoming.id || newId('rel', `${incoming.sourceId}_${incoming.targetId}`, now), strength: incoming.strength ?? 0.5, detail: incoming.detail || '', evidence: evidenceFor(incoming, chapterId), locked: Boolean(incoming.locked), createdAt: now, updatedAt: now } as MemoryRelation
      data.relations.push(relation)
      changes.push({ kind: 'relation', action: 'added', id: relation.id })
    }
  }
}

function mergeEvents(data: MemoryData, values: Array<Partial<MemoryEvent>>, chapterId: string, chapterIndex: number, now: string, changes: MemoryChange[]) {
  for (const incoming of values) {
    if (!incoming?.title) continue
    const target = data.events.find(item => item.title === incoming.title && item.chapterId === (incoming.chapterId || chapterId))
    if (target) {
      if (target.locked) changes.push({ kind: 'event', action: 'skipped', id: target.id, reason: '事件已锁定' })
      else {
        if (target.factStatus === 'confirmed' && incoming.factStatus === 'pending') target.factStatus = 'conflicted'
        if (incoming.type) target.type = incoming.type
        if (Array.isArray(incoming.characters)) target.characters = uniqueStrings([...(target.characters || []), ...incoming.characters])
        if (incoming.location) target.location = incoming.location
        if (incoming.summary) target.summary = incoming.summary
        if (Array.isArray(incoming.consequences)) target.consequences = uniqueStrings([...(target.consequences || []), ...incoming.consequences])
        if (incoming.chapterIndex !== undefined) target.chapterIndex = incoming.chapterIndex
        if (incoming.factStatus) target.factStatus = incoming.factStatus
        if (incoming.factSource) target.factSource = incoming.factSource
        appendEvidence(target, evidenceFor(incoming, chapterId))
        changes.push({ kind: 'event', action: 'updated', id: target.id })
      }
    } else {
      const event: MemoryEvent = { ...incoming, id: incoming.id || newId('evt', incoming.title, now), chapterId: incoming.chapterId || chapterId, chapterIndex: incoming.chapterIndex ?? chapterIndex, type: incoming.type || '剧情', characters: uniqueStrings(incoming.characters), location: incoming.location || '', summary: incoming.summary || '', consequences: uniqueStrings(incoming.consequences), locked: Boolean(incoming.locked), evidence: evidenceFor(incoming, chapterId), createdAt: now } as MemoryEvent
      data.events.push(event)
      changes.push({ kind: 'event', action: 'added', id: event.id })
    }
  }
}

function mergeWorld(data: MemoryData, values: Array<Partial<WorldEntry>>, chapterId: string, now: string, changes: MemoryChange[]) {
  for (const incoming of values) {
    if (!incoming?.name) continue
    const target = data.world.find(item => normalized(item.name) === normalized(incoming.name))
    if (target) {
      if (target.locked) changes.push({ kind: 'world', action: 'skipped', id: target.id, reason: '世界观条目已锁定' })
      else {
        if (target.factStatus === 'confirmed' && incoming.factStatus === 'pending') target.factStatus = 'conflicted'
        if (incoming.category) target.category = incoming.category
        if (incoming.description) target.description = incoming.description
        if (incoming.established !== undefined) target.established = incoming.established
        if (incoming.factStatus) target.factStatus = incoming.factStatus
        if (incoming.factSource) target.factSource = incoming.factSource
        appendEvidence(target, evidenceFor(incoming, chapterId)); changes.push({ kind: 'world', action: 'updated', id: target.id })
      }
    } else {
      const item: WorldEntry = { ...incoming, id: incoming.id || newId('wld', incoming.name, now), category: incoming.category || '其他', description: incoming.description || '', established: Boolean(incoming.established), locked: Boolean(incoming.locked), evidence: evidenceFor(incoming, chapterId), createdAt: now } as WorldEntry
      data.world.push(item)
      changes.push({ kind: 'world', action: 'added', id: item.id })
    }
  }
}

function mergeForeshadowing(data: MemoryData, values: Array<Partial<Foreshadowing>>, chapterId: string, chapterIndex: number, now: string, changes: MemoryChange[]) {
  for (const incoming of values) {
    if (!incoming?.title) continue
    const target = data.foreshadowing.find(item => normalized(item.title) === normalized(incoming.title))
    if (target) {
      if (target.locked) changes.push({ kind: 'foreshadowing', action: 'skipped', id: target.id, reason: '伏笔已锁定' })
      else {
        if (target.factStatus === 'confirmed' && incoming.factStatus === 'pending') target.factStatus = 'conflicted'
        if (incoming.description) target.description = incoming.description
        if (incoming.status) target.status = incoming.status
        if (incoming.resolved !== undefined) target.resolved = incoming.resolved
        if (incoming.factStatus) target.factStatus = incoming.factStatus
        if (incoming.factSource) target.factSource = incoming.factSource
        appendEvidence(target, evidenceFor(incoming, chapterId)); changes.push({ kind: 'foreshadowing', action: 'updated', id: target.id })
      }
    } else {
      const item: Foreshadowing = { ...incoming, id: incoming.id || newId('fsh', incoming.title, now), plantedChapterId: incoming.plantedChapterId || chapterId, plantedChapterIndex: incoming.plantedChapterIndex ?? chapterIndex, description: incoming.description || '', status: incoming.status || 'planted', resolved: Boolean(incoming.resolved), locked: Boolean(incoming.locked), evidence: evidenceFor(incoming, chapterId), createdAt: now } as Foreshadowing
      data.foreshadowing.push(item)
      changes.push({ kind: 'foreshadowing', action: 'added', id: item.id })
    }
  }
}

export function mergeMemory(current: MemoryData, extracted: ExtractedMemoryData, options: MemoryMergeOptions): MemoryMergeResult {
  const chapterId = options.chapterId.trim()
  const now = options.now || new Date().toISOString()
  if (!chapterId) return { data: clone(current), changes: [] }
  const data = clone(current)
  const changes: MemoryChange[] = []
  const blacklist = new Set((options.blacklist || []).map(normalized).filter(Boolean))
  mergeEntityList(data, extracted.entities || [], { chapterId, now }, blacklist, changes)
  mergeRelations(data, extracted.relations || [], chapterId, now, changes)
  mergeEvents(data, extracted.events || [], chapterId, options.chapterIndex || 0, now, changes)
  mergeWorld(data, extracted.world || [], chapterId, now, changes)
  mergeForeshadowing(data, extracted.foreshadowing || [], chapterId, options.chapterIndex || 0, now, changes)
  data.meta.extractionCount += 1
  data.meta.lastExtractedAt = now
  data.meta.pendingCount = 0
  data.meta.totals = { entities: data.entities.length, relations: data.relations.length, events: data.events.length, world: data.world.length, foreshadowing: data.foreshadowing.length }
  return { data, changes }
}
