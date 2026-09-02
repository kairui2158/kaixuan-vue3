
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProjectStore } from './project'

const storageWrite = vi.fn().mockResolvedValue(true)
const storageRead = vi.fn().mockResolvedValue(null)
const storageRemove = vi.fn().mockResolvedValue(true)
const storageList = vi.fn().mockResolvedValue([])

describe('project store saveProject coalescing', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    storageWrite.mockClear()
    storageRead.mockClear()
    vi.stubGlobal('window', {
      electronAPI: { storageWrite, storageRead, storageRemove, storageList },
    })
  })

  it('coalesces multiple saveProject calls into one storageWrite', async () => {
    const store = useProjectStore()
    store.currentProjectId = 'test-coalesce'
    store.projectName = 'Coalesce Test'
    
    // Call saveProject 3 times in quick succession
    const p1 = store.saveProject()
    const p2 = store.saveProject()
    const p3 = store.saveProject()
    
    await Promise.all([p1, p2, p3])
    
    // Wait for queueMicrotask to execute
    await new Promise(r => setTimeout(r, 50))
    
    // Should only call storageWrite once for the project
    const projectWrites = storageWrite.mock.calls.filter(c => c[0].includes('project_test-coalesce'))
    expect(projectWrites.length).toBe(1)
  })
})

describe('project store recordSourceVersion', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    storageWrite.mockClear()
    storageRead.mockClear()
    vi.stubGlobal('window', {
      electronAPI: { storageWrite, storageRead, storageRemove, storageList },
    })
  })

  it('records one version for repeated identical chapter content', async () => {
    const store = useProjectStore()
    store.currentProjectId = 'test-version'

    const firstId = await store.recordSourceVersion('chapter-1', 1, '正文内容')
    const secondId = await store.recordSourceVersion('chapter-1', 1, '正文内容')

    expect(firstId).toBeTruthy()
    expect(secondId).toBe(firstId)
    expect(store.memories.sourceVersions || []).toHaveLength(1)
    expect(store.memories.sourceVersions?.[0]).toMatchObject({
      chapterId: 'chapter-1',
      chapterIndex: 1,
      wordCount: 4
    })
  })

  it('does not record empty chapter content', async () => {
    const store = useProjectStore()
    store.currentProjectId = 'test-version-empty'

    const versionId = await store.recordSourceVersion('chapter-1', 1, '')

    expect(versionId).toBe('')
    expect(store.memories.sourceVersions || []).toHaveLength(0)
  })
})
