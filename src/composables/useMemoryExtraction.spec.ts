import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const callAi = vi.fn().mockResolvedValue({
  text: JSON.stringify({
    entities: [{ id: 'ent-1', name: '林舟', evidence: [{ chapterId: 'chapter-1', snippet: '林舟站在门口' }] }],
    relations: [],
    events: [],
    world: [],
    foreshadowing: []
  })
})

vi.mock('../services/aiService', () => ({
  getAiService: vi.fn(async () => ({ callAi }))
}))

import { useMemoryExtraction } from './useMemoryExtraction'
import { useProjectStore } from '../stores/project'

describe('useMemoryExtraction source binding', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    callAi.mockClear()
    vi.stubGlobal('window', {
      electronAPI: {
        storageRead: vi.fn().mockResolvedValue(null),
        storageWrite: vi.fn().mockResolvedValue(true),
        storageRemove: vi.fn().mockResolvedValue(true),
        storageList: vi.fn().mockResolvedValue([])
      }
    })
  })

  it('binds extracted facts to the source version', async () => {
    const projectStore = useProjectStore()
    projectStore.currentProjectId = 'project-1'
    const originalWarn = console.warn
    console.warn = vi.fn()
    const extraction = useMemoryExtraction(async () => JSON.stringify({
      entities: [{ id: 'ent-1', name: '林舟', evidence: [{ chapterId: 'chapter-1', snippet: '林舟站在门口' }] }],
      relations: [],
      events: [],
      world: [],
      foreshadowing: []
    }))
    const started = await extraction.start({
      id: 'chapter-1',
      index: 3,
      title: '第一章',
      content: '林舟站在门口，望向远处的海。',
      sourceVersionId: 'sv-1'
    })

    expect(started).toBe(true)
    console.warn = originalWarn
    expect(extraction.extracted.value?.entities).toHaveLength(1)
    expect(extraction.extracted.value?.entities[0]).toMatchObject({
      factStatus: 'pending',
      factSource: {
        sourceVersionId: 'sv-1',
        chapterId: 'chapter-1',
        chapterIndex: 3,
        snippet: '林舟站在门口',
        verified: true
      }
    })
  })
})
