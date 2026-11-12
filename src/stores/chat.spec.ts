import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useChatStore } from './chat'
import type { FinalDraftTask } from '../services/finalDraftService'

const storageWrite = vi.fn().mockResolvedValue(true)
const storageRead = vi.fn().mockResolvedValue(null)

describe('chat store saveSessions coalescing', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    storageWrite.mockClear()
    storageRead.mockClear()
    vi.stubGlobal('window', {
      electronAPI: { storageWrite, storageRead },
    })
  })

  it('coalesces rapid final-draft message updates into one storageWrite', async () => {
    const store = useChatStore()
    store.loadSessions('test-coalesce')
    expect(store.currentProjectId).toBe('test-coalesce')
    store.ensureSession('tab-1', 'chapter-1', '第一章', 'test-coalesce')
    const message = store.addMessage({ role: 'assistant', content: '准备中', tabId: 'tab-1' }, 'test-coalesce')
    expect(message).toBeTruthy()
    storageWrite.mockClear()

    store.updateMessageFinalDraftTask(message!.id, createTask({ taskId: 'task-1' }))
    store.updateMessageContent(message!.id, '正在生成')
    store.updateMessageFinalDraftTask(message!.id, createTask({ taskId: 'task-1', accumulatedText: '片段' }))
    store.updateMessageContent(message!.id, '正在生成 100 字')

    await new Promise(resolve => setTimeout(resolve, 400))

    const chatWrites = storageWrite.mock.calls.filter(call => call[0] === 'wa_chat_test-coalesce')
    expect(chatWrites).toHaveLength(1)
    expect(chatWrites[0]?.[1]).toEqual(store.sessions)
  })

  it('assigns stable ids to legacy messages missing persisted ids', async () => {
    storageRead.mockResolvedValue([
      {
        id: 'legacy-session',
        title: '旧会话',
        tabId: 'tab-1',
        chapterId: 'chapter-1',
        createdAt: 1,
        updatedAt: 1,
        messages: [
          { role: 'user', content: '旧用户消息', ts: 1 },
          { role: 'assistant', content: '旧助手消息', ts: 2 },
        ],
      },
    ])
    const store = useChatStore()
    store.__setProjectForTests('legacy-ids')
    await store.loadSessions('legacy-ids')
    const messages = store.sessions[0]?.messages ?? []
    expect(messages).toHaveLength(2)
    expect(messages.every(message => typeof message.id === 'string' && message.id.startsWith('msg_'))).toBe(true)
    expect(new Set(messages.map(message => message.id)).size).toBe(2)
  })

  it('persists rapid updates to the requested project bucket', async () => {
    const store = useChatStore()
    store.ensureSession('tab-1', 'chapter-1', '第一章', 'project-A')
    const message = store.addMessage({ role: 'assistant', content: '准备中', tabId: 'tab-1' }, 'project-A')
    expect(message).toBeTruthy()
    storageWrite.mockClear()

    store.updateMessageContent(message!.id, '正在生成', store.activeSession?.id)

    await new Promise(resolve => setTimeout(resolve, 400))

    const keys = storageWrite.mock.calls.map(call => call[0])
    expect(keys).toContain('wa_chat_project-A')
    expect(keys).not.toContain('wa_chat_default')
  })

  it('starts a fresh save window after the previous coalesced write', async () => {
    const store = useChatStore()
    store.ensureSession('tab-1', 'chapter-1', '第一章', 'project-A')
    const message = store.addMessage({ role: 'assistant', content: '准备中', tabId: 'tab-1' }, 'project-A')
    expect(message).toBeTruthy()
    storageWrite.mockClear()

    store.updateMessageContent(message!.id, '第一轮更新', store.activeSession?.id)
    await new Promise(resolve => setTimeout(resolve, 400))
    store.updateMessageContent(message!.id, '第二轮更新', store.activeSession?.id)
    await new Promise(resolve => setTimeout(resolve, 400))

    const chatWrites = storageWrite.mock.calls.filter(call => call[0] === 'wa_chat_project-A')
    expect(chatWrites).toHaveLength(2)
    expect((chatWrites[0]?.[1] as any[])[0]?.messages?.[0]?.content).toBe('第一轮更新')
    expect((chatWrites[1]?.[1] as any[])[0]?.messages?.[0]?.content).toBe('第二轮更新')
  })

  it('does not persist project-A sessions into project-B during an in-flight project switch', async () => {
    let releaseProjectBRead!: (value: unknown) => void
    const projectBRead = new Promise(resolve => {
      releaseProjectBRead = resolve
    })
    storageWrite.mockImplementation(async (key: string) => {
      persistedKeys.push(key)
      return true
    })
    const persistedKeys: string[] = []
    storageRead.mockImplementation(async (key: string) => {
      if (key === 'wa_chat_project-B') {
        await projectBRead
        return [{ id: 'session-b', title: 'B 会话', tabId: '', chapterId: '', messages: [], createdAt: 1, updatedAt: 1 }]
      }
      return null
    })

    const store = useChatStore()
    store.ensureSession('tab-a', 'chapter-a', 'A 章节', 'project-A')
    const message = store.addMessage({ role: 'user', content: 'A 项目消息', tabId: 'tab-a' }, 'project-A')
    expect(message).toBeTruthy()
    await new Promise(resolve => setTimeout(resolve, 400))
    storageWrite.mockClear()

    // Project switching mutates currentProjectId before the target project's
    // sessions have been loaded. The pending A save must not write A sessions
    // to the B bucket during that window.
    const loadPromise = store.loadSessions('project-B')
    store.__setProjectForTests('project-B')
    store.addMessage({ role: 'user', content: 'B 项目新消息', tabId: '' })
    await new Promise(resolve => setTimeout(resolve, 400))

    const persistedB = storageWrite.mock.calls
      .filter(call => call[0] === 'wa_chat_project-B')
      .map(call => call[1] as any[])
    expect(persistedB).toHaveLength(0)

    releaseProjectBRead(null)
    await loadPromise
    expect(store.__isSessionsLoadedForProject('project-B')).toBe(true)
    store.ensureSession('', '', '默认对话', 'project-B')
    const bMessage = store.addMessage({ role: 'user', content: 'B 项目加载后消息', tabId: '' }, 'project-B')
    expect(bMessage).toBeTruthy()
    await new Promise(resolve => setTimeout(resolve, 400))

    const persistedAfterLoad = storageWrite.mock.calls
      .filter(call => call[0] === 'wa_chat_project-B')
      .map(call => call[1] as any[])
    expect(persistedAfterLoad).toHaveLength(1)
    expect(persistedAfterLoad[0]?.map(session => session.title)).toContain('B 会话')
    expect(persistedAfterLoad[0]?.map(session => session.title)).not.toContain('A 章节')
  })

  it('cancels a queued project-A write that fires after loadSessions switches to project B', async () => {
    let releaseProjectBRead!: (value: unknown) => void
    const projectBRead = new Promise(resolve => {
      releaseProjectBRead = resolve
    })
    const persistedKeys: string[] = []
    storageWrite.mockImplementation(async (key: string) => {
      persistedKeys.push(key)
      return true
    })
    storageRead.mockImplementation(async (key: string) => {
      if (key === 'wa_chat_project-B') {
        await projectBRead
        return []
      }
      return null
    })

    const store = useChatStore()
    store.ensureSession('tab-a', 'chapter-a', 'A 章节', 'project-A')
    store.addMessage({ role: 'user', content: 'A 项目消息', tabId: 'tab-a' }, 'project-A')
    await new Promise(resolve => setTimeout(resolve, 20))

    // The debounced A write is scheduled with 230ms remaining. loadSessions(B)
    // advances the project generation immediately, then blocks on storageRead.
    const loadPromise = store.loadSessions('project-B')
    await new Promise(resolve => setTimeout(resolve, 400))
    releaseProjectBRead(null)
    await loadPromise

    expect(persistedKeys).toEqual(['wa_chat_project-A'])
    expect(store.__isSessionsLoadedForProject('project-B')).toBe(true)
  })

  it('persists final-draft task snapshots on status transitions rather than every stream chunk', async () => {
    const store = useChatStore()
    store.ensureSession('tab-1', 'chapter-1', '第一章', 'project-A')
    const message = store.addMessage({ role: 'assistant', content: '准备中', tabId: 'tab-1' }, 'project-A')
    expect(message).toBeTruthy()
    storageWrite.mockClear()

    store.updateMessageFinalDraftTask(message!.id, createTask({ status: 'planning' }), store.activeSession?.id, 'project-A')
    store.updateMessageFinalDraftTask(message!.id, createTask({ status: 'generating', accumulatedText: '片段' }), store.activeSession?.id, 'project-A')
    store.updateMessageFinalDraftTask(message!.id, createTask({ status: 'generating', accumulatedText: '片段继续' }), store.activeSession?.id, 'project-A')
    store.updateMessageFinalDraftTask(message!.id, createTask({ status: 'writing' }), store.activeSession?.id, 'project-A')
    store.updateMessageFinalDraftTask(message!.id, createTask({ status: 'completed' }), store.activeSession?.id, 'project-A')

    await new Promise(resolve => setTimeout(resolve, 400))

    const persisted = storageWrite.mock.calls
      .find(call => call[0] === 'wa_chat_project-A')?.[1] as any[]
    const persistedTask = persisted?.[0]?.messages?.find((item: any) => item.id === message!.id)?.finalDraftTask
    expect(persistedTask).toMatchObject({
      taskId: 'task-1',
      status: 'completed',
      sourceChars: '源文'.length,
      completedChars: 0,
      accumulatedChars: 0,
      continuationCount: 0,
      sourceContentHash: 'hash-1',
    })
    expect(persistedTask).not.toHaveProperty('sourceContent')
    expect(persistedTask).not.toHaveProperty('completedText')
    expect(persistedTask).not.toHaveProperty('accumulatedText')
  })

  it('persists only slim final-draft task views', async () => {
    const store = useChatStore()
    store.ensureSession('tab-1', 'chapter-1', '第一章', 'project-A')
    const message = store.addMessage({ role: 'assistant', content: '准备中', tabId: 'tab-1' }, 'project-A')
    expect(message).toBeTruthy()
    storageWrite.mockClear()

    store.updateMessageFinalDraftTask(
      message!.id,
      createTask({
        status: 'interrupted',
        completedText: '已完成全文',
        accumulatedText: '已完成全文\n\n中断流',
      }),
      store.activeSession?.id,
      'project-A',
    )

    await new Promise(resolve => setTimeout(resolve, 400))
    const persisted = storageWrite.mock.calls
      .find(call => call[0] === 'wa_chat_project-A')?.[1] as any[]
    const persistedTask = persisted?.[0]?.messages?.find((item: any) => item.id === message!.id)?.finalDraftTask
    expect(persistedTask).toMatchObject({
      taskId: 'task-1',
      status: 'interrupted',
      sourceChars: 2,
      completedChars: 5,
      accumulatedChars: 10,
    })
    expect(persistedTask).not.toHaveProperty('sourceContent')
    expect(persistedTask).not.toHaveProperty('completedText')
    expect(persistedTask).not.toHaveProperty('accumulatedText')
  })
})

function createTask(patch: Partial<FinalDraftTask>): FinalDraftTask {
  return {
    taskId: 'task-1',
    destination: 'home-editor',
    targetId: 'target-1',
    instruction: '整理全文',
    constraints: [],
    protectedRanges: [],
    sourceContent: '源文',
    sourceSegments: [],
    segmentOrder: [],
    activeSegmentIndex: 0,
    completedText: '',
    accumulatedText: '',
    continuationCount: 0,
    status: 'planning',
    sourceContentHash: 'hash-1',
    createdAt: 1,
    updatedAt: 1,
    ...patch,
  }
}
