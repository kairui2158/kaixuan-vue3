
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

describe('project store editor bookmarks persistence', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    storageWrite.mockClear()
    storageRead.mockClear()
    vi.stubGlobal('window', {
      electronAPI: { storageWrite, storageRead, storageRemove, storageList },
    })
  })

  it('persists bookmarks through saveProject and reloads them through loadProject', async () => {
    const store = useProjectStore()
    store.currentProjectId = 'test-bookmarks'

    const bookmark = {
      id: 'bm-1',
      documentId: 'tab-1',
      offset: 3,
      line: 0,
      label: '开头',
      contentHash: 'hash-1',
      createdAt: '2026-09-24T00:00:00.000Z',
    }
    store.setEditorBookmarks([bookmark])
    await store.saveProject()
    await new Promise(resolve => setTimeout(resolve, 50))

    const persistedCall = storageWrite.mock.calls.find(call => call[0].includes('project_test-bookmarks'))
    expect(persistedCall?.[1]?.editorBookmarks).toEqual([bookmark])

    storageRead.mockResolvedValueOnce({
      schemaVersion: 3,
      projectName: '书签项目',
      outlineText: '# 大纲',
      editorBookmarks: [bookmark, { invalid: true }],
    })
    await store.loadProject('test-bookmarks')

    expect(store.editorBookmarks).toEqual([bookmark])
  })

  it('clears editor bookmarks with the current project', () => {
    const store = useProjectStore()
    store.currentProjectId = 'test-bookmarks-clear'
    store.setEditorBookmarks([{
      id: 'bm-1',
      documentId: 'tab-1',
      offset: 0,
      line: 0,
      label: '',
      contentHash: 'hash-1',
      createdAt: '',
    }])

    store.clearCurrent()

    expect(store.editorBookmarks).toEqual([])
  })

  it('resets project state when loading a project with no stored data', async () => {
    const store = useProjectStore()
    store.currentProjectId = 'project-before'
    store.projectName = '旧项目'
    store.outlineText = '# 旧大纲'
    store.volumes = [{ id: 'vol-old', name: '旧卷' }]
    store.chapters = { 'vol-old': [{ id: 'ch-old', title: '旧章' }] }
    store.outlineChat = [{ role: 'user', content: '旧对话' }]
    store.setEditorBookmarks([{
      id: 'bm-old',
      documentId: 'tab-old',
      offset: 0,
      line: 0,
      label: '',
      contentHash: 'hash-old',
      createdAt: '',
    }])

    storageRead.mockResolvedValue(null)
    await store.loadProject('project-empty')

    expect(store.currentProjectId).toBe('project-empty')
    expect(store.projectName).toBe('')
    expect(store.outlineText).toBe('')
    expect(store.volumes).toEqual([])
    expect(store.chapters).toEqual({})
    expect(store.outlineChat).toEqual([])
    expect(store.editorBookmarks).toEqual([])
  })
})
