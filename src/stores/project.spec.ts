
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

describe('project store style profile', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    storageWrite.mockClear()
    storageRead.mockClear()
    vi.stubGlobal('window', {
      electronAPI: { storageWrite, storageRead, storageRemove, storageList },
    })
  })

  it('keeps unlocked drafts editable and rejects edits after locking', () => {
    const store = useProjectStore()

    const updateDraft = store.updateStyleProfileDraft({ styleTags: '快节奏, 冷峻' })
    expect(updateDraft.ok).toBe(true)
    expect(store.styleProfile.styleTags).toBe('快节奏, 冷峻')
    expect(store.styleProfileEffective.injected).toBe(false)

    const lockResult = store.lockStyleProfile()
    expect(lockResult.ok).toBe(true)
    expect(store.styleProfile.locked).toBe(true)

    const rejected = store.updateStyleProfileDraft({ styleTags: '新风格' })
    expect(rejected.ok).toBe(false)
    expect(rejected.reason).toBe('style_locked')
    expect(store.styleProfile.styleTags).toBe('快节奏, 冷峻')
  })

  it('stores AI analysis as draft only and never overwrites a locked profile', () => {
    const store = useProjectStore()
    store.updateStyleProfileDraft({ styleTags: '手工风格' })
    store.lockStyleProfile()

    const rejected = store.applyAiStyleAnalysis({ styleTags: 'AI风格', pacingParams: '速度:快节奏' })
    expect(rejected.ok).toBe(false)
    expect(rejected.reason).toBe('style_locked')
    expect(store.styleProfile.styleTags).toBe('手工风格')

    store.unlockStyleProfile()
    const accepted = store.applyAiStyleAnalysis({ styleTags: 'AI风格', pacingParams: '速度:快节奏' })
    expect(accepted.ok).toBe(true)
    expect(store.styleProfile.source).toBe('ai-analysis')
    expect(store.styleProfile.aiPacingSnapshot?.pacingParams).toBe('速度:快节奏')
  })

  it('persists the locked style profile and reloads it through loadProject', async () => {
    const store = useProjectStore()
    store.currentProjectId = 'test-style'
    store.updateStyleProfileDraft({
      styleTags: '冷峻',
      pacingParams: '速度:快节奏',
      customStyleTags: ['冷峻'],
    })
    store.lockStyleProfile()
    await store.saveProject()
    await new Promise(resolve => setTimeout(resolve, 50))

    const persistedCall = storageWrite.mock.calls.find(call => call[0].includes('project_test-style'))
    expect(persistedCall?.[1]?.styleProfile).toMatchObject({
      styleTags: '冷峻',
      pacingParams: '速度:快节奏',
      locked: true,
    })

    storageRead.mockResolvedValueOnce(persistedCall?.[1])
    await store.loadProject('test-style')

    expect(store.styleProfile.styleTags).toBe('冷峻')
    expect(store.styleProfile.locked).toBe(true)
    expect(store.styleProfileEffective.injected).toBe(true)
  })

  it('gives legacy projects a default unlocked profile and clears it between projects', async () => {
    const store = useProjectStore()
    store.currentProjectId = 'style-project-a'
    store.updateStyleProfileDraft({ styleTags: 'A项目风格' })
    store.lockStyleProfile()

    storageRead.mockResolvedValue({
      schemaVersion: 3,
      projectName: '旧项目',
      outlineText: '# 旧大纲',
    })
    await store.loadProject('style-project-b')

    expect(store.styleProfile.styleTags).toBe('')
    expect(store.styleProfile.locked).toBe(false)
    expect(store.styleProfileEffective.injected).toBe(false)
  })
})

describe('project store settings lock migration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    storageWrite.mockClear()
    storageRead.mockClear()
    vi.stubGlobal('window', {
      electronAPI: { storageWrite, storageRead, storageRemove, storageList },
    })
  })

  it('migrates legacy isBound settings to locked status at schema version 4', async () => {
    const store = useProjectStore()
    store.currentProjectId = 'test-settings-migration'
    storageRead.mockResolvedValueOnce({
      schemaVersion: 3,
      projectName: '设定迁移',
      settingsCollection: {
        categories: ['人物'],
        items: {
          人物: [
            { id: 's1', name: '王芳', category: '人物', content: '话痨', isBound: true, boundTo: ['pipeline'] },
            { id: 's2', name: '林舟', category: '人物', content: '冷静', isBound: false, boundTo: [] }
          ]
        }
      }
    })

    await store.loadProject('test-settings-migration')

    const collection = store.getSettingsCollection()
    expect(collection.items['人物'][0]).toMatchObject({ status: 'locked', lockedAt: expect.any(Number) })
    expect(collection.items['人物'][1]).toMatchObject({ status: 'draft', lockedAt: null })
    expect(store.schemaVersion).toBe(4)
  })
})
