import type { MemoryData } from '../types/memory'

export interface MemoryExportChapter {
  id?: string
  title?: string
  body?: string
  summary?: string
  volumeId?: string
}

export interface MemoryExportVolume {
  id?: string
  name?: string
  summary?: string
}

export interface MemoryExportContext {
  volumes?: MemoryExportVolume[]
  chapters?: Record<string, MemoryExportChapter[]>
}

export interface CharacterProfileExport {
  format: 'shenyi-character-profile'
  version: 1
  exportedAt: string
  entity: MemoryData['entities'][number]
}

export interface StorylineExport {
  format: 'shenyi-storyline'
  version: 1
  exportedAt: string
  volumes: Array<{
    id: string
    name: string
    summary: string
    chapters: Array<{ id: string; title: string; summary: string; events: MemoryData['events'] }>
  }>
}

export interface TimelineExport {
  format: 'shenyi-timeline'
  version: 1
  exportedAt: string
  events: MemoryData['events']
}

export interface SceneExport {
  format: 'shenyi-scene'
  version: 1
  exportedAt: string
  scenes: Array<{
    chapterId: string
    chapterTitle: string
    body: string
    events: MemoryData['events']
    characters: MemoryData['entities']
  }>
}

function now() {
  return new Date().toISOString()
}

function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function json(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function volumeKey(volume: MemoryExportVolume) {
  return text(volume.id) || text(volume.name) || 'volume'
}

function chapterKey(chapter: MemoryExportChapter) {
  return text(chapter.id) || text(chapter.title) || 'chapter'
}

export function exportCharacterProfile(memory: MemoryData, entityId: string): string | null {
  const entity = memory.entities.find(item => item.id === entityId)
  if (!entity) return null
  const payload: CharacterProfileExport = {
    format: 'shenyi-character-profile',
    version: 1,
    exportedAt: now(),
    entity: clone(entity)
  }
  return json(payload)
}

export function exportStoryline(memory: MemoryData, context: MemoryExportContext = {}): string {
  const eventsByChapter = new Map<string, MemoryData['events']>()
  for (const event of memory.events) {
    const events = eventsByChapter.get(event.chapterId) || []
    events.push(clone(event))
    eventsByChapter.set(event.chapterId, events)
  }
  const volumes = (context.volumes || []).map(volume => {
    const id = volumeKey(volume)
    const chapters = (context.chapters?.[id] || []).map(chapter => {
      const chapterId = chapterKey(chapter)
      return {
        id: chapterId,
        title: text(chapter.title) || '未命名章节',
        summary: text(chapter.summary),
        events: eventsByChapter.get(chapterId) || []
      }
    })
    return { id, name: text(volume.name) || '未命名卷', summary: text(volume.summary), chapters }
  })
  return json({ format: 'shenyi-storyline', version: 1, exportedAt: now(), volumes } satisfies StorylineExport)
}

export function exportTimeline(memory: MemoryData): string {
  const events = clone(memory.events).sort((left, right) => left.chapterIndex - right.chapterIndex || left.id.localeCompare(right.id))
  return json({ format: 'shenyi-timeline', version: 1, exportedAt: now(), events } satisfies TimelineExport)
}

export function exportScene(memory: MemoryData, context: MemoryExportContext = {}): string {
  const entitiesByName = new Map(memory.entities.map(entity => [entity.name, entity]))
  const scenes = Object.values(context.chapters || {}).flat().map(chapter => {
    const chapterId = chapterKey(chapter)
    const events = memory.events.filter(event => event.chapterId === chapterId).map(clone)
    const names = new Set(events.flatMap(event => event.characters))
    const characters = [...names].map(name => entitiesByName.get(name)).filter((entity): entity is MemoryData['entities'][number] => Boolean(entity)).map(clone)
    return {
      chapterId,
      chapterTitle: text(chapter.title) || '未命名章节',
      body: text(chapter.body),
      events,
      characters
    }
  })
  return json({ format: 'shenyi-scene', version: 1, exportedAt: now(), scenes } satisfies SceneExport)
}
