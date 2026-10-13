import type { MemoryData, MemoryEntity, MemoryEvent, Foreshadowing, WorldEntry } from '../types/memory'

export interface MemoryRetrievalOptions {
  chapterId?: string
  chapterIndex?: number
  unitId?: string
  query?: string
  previousChapterSummary?: string
  maxChars?: number
  recentEventCount?: number
}

export interface MemoryRetrievalResult {
  text: string
  charCount: number
  sections: string[]
  priority: 'current-chapter' | 'current-unit' | 'global-permanent'
  trimmed: string[]
}

function clean(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function matchesQuery(value: unknown, query: string): boolean {
  const source = clean(value).toLowerCase()
  if (!source || !query) return false
  return query.split(/\s+/).filter(Boolean).some(term => term.length > 1 && source.includes(term))
}

function entityText(entity: MemoryEntity): string {
  const aliases = entity.aliases?.length ? `（别名：${entity.aliases.join('、')}）` : ''
  const status = clean(entity.status) ? `；状态：${clean(entity.status)}` : ''
  const description = clean(entity.description) || clean(entity.notes)
  return `- ${clean(entity.name) || '未命名实体'}${aliases}${status}${description ? `；${description}` : ''}`
}

function eventText(event: MemoryEvent): string {
  const chapter = Number.isFinite(event.chapterIndex) ? `第${event.chapterIndex + 1}章` : '未知章节'
  return `- ${chapter}「${clean(event.title) || '未命名事件'}」：${clean(event.summary) || '暂无摘要'}`
}

function foreshadowingText(item: Foreshadowing): string {
  return `- ${clean(item.title) || '未命名伏笔'}（${item.status || 'active'}）：${clean(item.description) || '暂无描述'}`
}

function worldText(item: WorldEntry): string {
  return `- ${clean(item.name) || '未命名设定'}：${clean(item.description) || '暂无描述'}`
}

function takeWithinLimit(sections: string[], maxChars: number): { text: string; trimmed: string[] } {
  const output: string[] = []
  const trimmed: string[] = []
  let size = 0
  for (const section of sections) {
    const separatorSize = output.length ? 2 : 0
    if (size + separatorSize + section.length <= maxChars) {
      output.push(section)
      size += separatorSize + section.length
      continue
    }
    const remaining = maxChars - size - separatorSize
    const label = section.split('\n')[0]?.replace(/[：:]$/, '') || 'unknown'
    trimmed.push(label)
    if (remaining > 40) output.push(section.slice(0, remaining - 1).trimEnd() + '…')
    break
  }
  return { text: output.join('\n\n'), trimmed }
}

/** Read-only memory context builder shared by chat and pipeline generation. */
export function retrieveContext(memory: MemoryData | null | undefined, options: MemoryRetrievalOptions = {}): MemoryRetrievalResult {
  const maxChars = Math.max(200, options.maxChars ?? 2000)
  if (!memory) return { text: '', charCount: 0, sections: [], priority: 'global-permanent', trimmed: [] }

  const query = clean(options.query).toLowerCase()
  const chapterId = clean(options.chapterId)
  const chapterIndex = options.chapterIndex
  const unitId = clean(options.unitId)
  const sections: string[] = []
  const currentChapterEvidence: string[] = []
  const currentUnitCauses: string[] = []
  const globalPermanent: string[] = []

  const inCurrentChapter = (item: { evidence?: Array<{ chapterId: string; snippet: string }> }): boolean =>
    Boolean(chapterId && (item.evidence || []).some(entry => clean(entry.chapterId) === chapterId))
  const inCurrentUnit = (item: { evidence?: Array<{ chapterId: string; snippet: string }> }, source = ''): boolean =>
    Boolean(
      unitId
      && (
        (item.evidence || []).some(entry => clean(entry.snippet).includes(unitId))
        || clean(source).includes(unitId)
      )
    )

  for (const entity of memory.entities || []) {
    const source = `${entity.name} ${entity.aliases?.join(' ')} ${entity.description} ${entity.status}`
    const matched = inCurrentChapter(entity) || matchesQuery(source, query)
    if (!matched) continue
    const line = entityText(entity)
    if (inCurrentChapter(entity)) currentChapterEvidence.push(line)
    else if (inCurrentUnit(entity, source)) currentUnitCauses.push(line)
    else globalPermanent.push(line)
  }

  const currentChapterEntities = (memory.entities || []).filter(inCurrentChapter)
  const currentUnitEntities = (memory.entities || []).filter(entity =>
    inCurrentUnit(entity, `${entity.name} ${entity.aliases?.join(' ')} ${entity.description} ${entity.status}`)
  )
  if (currentChapterEntities.length) {
    currentChapterEvidence.unshift(`当前相关人物与实体：\n${currentChapterEntities.map(entityText).join('\n')}`)
  }
  if (currentUnitEntities.length && currentChapterEntities.length === 0) {
    currentUnitCauses.unshift(`当前相关人物与实体：\n${currentUnitEntities.map(entityText).join('\n')}`)
  }

  // 聊天上下文可能没有活动章节，且自然中文查询未必包含实体名称。
  // 命中时保持精准筛选；无命中但确有记忆时带入有限背景，避免检索层静默返回空。
  if (currentChapterEvidence.length === 0 && currentUnitCauses.length === 0) {
    const entities = (memory.entities || []).slice(0, 12)
    if (entities.length) globalPermanent.unshift(`当前相关人物与实体：\n${entities.map(entityText).join('\n')}`)
  }

  const recentEvents = (memory.events || [])
    .filter(event => chapterIndex === undefined || event.chapterIndex <= chapterIndex)
    .sort((a, b) => b.chapterIndex - a.chapterIndex)
    .filter((event, index) => index < (options.recentEventCount ?? 5) || matchesQuery(`${event.title} ${event.summary}`, query))
    .slice(0, 8)
  const chapterEvents = (memory.events || []).filter(inCurrentChapter).slice(0, 8)
  if (chapterEvents.length) {
    currentChapterEvidence.push(`最近剧情事件：\n${chapterEvents.map(eventText).join('\n')}`)
  } else if (recentEvents.length) {
    currentUnitCauses.push(`最近剧情事件：\n${recentEvents.map(eventText).join('\n')}`)
  }

  const activeForeshadowing = (memory.foreshadowing || []).filter(item => !item.resolved && item.status !== 'abandoned').slice(0, 8)
  if (activeForeshadowing.length) globalPermanent.push(`未解决伏笔：\n${activeForeshadowing.map(foreshadowingText).join('\n')}`)

  const world = (memory.world || []).filter(item => matchesQuery(`${item.name} ${item.description}`, query)).slice(0, 6)
  if (world.length) globalPermanent.push(`相关世界观设定：\n${world.map(worldText).join('\n')}`)

  const previous = clean(options.previousChapterSummary)
  if (previous) currentUnitCauses.push(`上一章摘要：\n${previous}`)

  sections.push(...currentChapterEvidence, ...currentUnitCauses, ...globalPermanent)
  const limited = takeWithinLimit(sections, maxChars)
  const priority = currentChapterEvidence.length > 0
    ? 'current-chapter'
    : currentUnitCauses.length > 0
      ? 'current-unit'
      : 'global-permanent'
  return {
    text: limited.text,
    charCount: limited.text.length,
    sections: limited.text ? limited.text.split('\n\n') : [],
    priority,
    trimmed: limited.trimmed
  }
}
