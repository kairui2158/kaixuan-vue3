import type { MemoryData, MemoryEntity, MemoryEvent, Foreshadowing, WorldEntry } from '../types/memory'

export interface MemoryRetrievalOptions {
  chapterId?: string
  chapterIndex?: number
  query?: string
  previousChapterSummary?: string
  maxChars?: number
  recentEventCount?: number
}

export interface MemoryRetrievalResult {
  text: string
  charCount: number
  sections: string[]
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

function takeWithinLimit(sections: string[], maxChars: number): string {
  const output: string[] = []
  let size = 0
  for (const section of sections) {
    const separatorSize = output.length ? 2 : 0
    if (size + separatorSize + section.length <= maxChars) {
      output.push(section)
      size += separatorSize + section.length
      continue
    }
    const remaining = maxChars - size - separatorSize
    if (remaining > 40) output.push(section.slice(0, remaining).trimEnd() + '…')
    break
  }
  return output.join('\n\n')
}

/** Read-only memory context builder shared by chat and pipeline generation. */
export function retrieveContext(memory: MemoryData | null | undefined, options: MemoryRetrievalOptions = {}): MemoryRetrievalResult {
  const maxChars = Math.max(200, options.maxChars ?? 2000)
  if (!memory) return { text: '', charCount: 0, sections: [] }

  const query = clean(options.query).toLowerCase()
  const chapterId = clean(options.chapterId)
  const chapterIndex = options.chapterIndex
  const sections: string[] = []
  const matchedEntities = (memory.entities || []).filter(entity => {
    const fromChapter = chapterId && entity.evidence?.some(item => item.chapterId === chapterId)
    return Boolean(fromChapter || matchesQuery(`${entity.name} ${entity.aliases?.join(' ')} ${entity.description} ${entity.status}`, query))
  })
  // 聊天上下文可能没有活动章节，且自然中文查询未必包含实体名称。
  // 命中时保持精准筛选；无命中但确有记忆时带入有限背景，避免检索层静默返回空。
  const entities = (matchedEntities.length > 0 ? matchedEntities : (chapterId || query ? memory.entities || [] : memory.entities || [])).slice(0, 12)
  if (entities.length) sections.push(`当前相关人物与实体：\n${entities.map(entityText).join('\n')}`)

  const events = (memory.events || [])
    .filter(event => chapterIndex === undefined || event.chapterIndex <= chapterIndex)
    .sort((a, b) => b.chapterIndex - a.chapterIndex)
    .filter((event, index) => index < (options.recentEventCount ?? 5) || matchesQuery(`${event.title} ${event.summary}`, query))
    .slice(0, 8)
  if (events.length) sections.push(`最近剧情事件：\n${events.map(eventText).join('\n')}`)

  const foreshadowing = (memory.foreshadowing || []).filter(item => !item.resolved && item.status !== 'abandoned').slice(0, 8)
  if (foreshadowing.length) sections.push(`未解决伏笔：\n${foreshadowing.map(foreshadowingText).join('\n')}`)

  const world = (memory.world || []).filter(item => matchesQuery(`${item.name} ${item.description}`, query)).slice(0, 6)
  if (world.length) sections.push(`相关世界观设定：\n${world.map(worldText).join('\n')}`)

  const previous = clean(options.previousChapterSummary)
  if (previous) sections.push(`上一章摘要：\n${previous}`)
  const text = takeWithinLimit(sections, maxChars)
  return { text, charCount: text.length, sections: text ? text.split('\n\n') : [] }
}
