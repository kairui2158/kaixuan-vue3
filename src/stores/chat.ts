import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { storageKey } from '../utils/storage-key'
import type { ContinuationSnapshot } from '../services/continuation'
import type { EditorEditBatchCommand } from '../services/editorEditProtocol'
import type { EditorDiffHunkView } from '../services/editorDiffHunks'
import type { EditorBatchRecord } from '../services/editorBatchRecord'
import type { WorkspaceSkillRunMeta } from '../services/workspaceSkillEngine'
import type { ChainRoutingResult } from '../services/chainIntentRouter'
import {
  toFinalDraftTaskView,
  type FinalDraftTask,
  type FinalDraftTaskView,
} from '../services/finalDraftService'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  ts: number
  model?: string
  agentId?: string
  tabId?: string
  continuation?: ContinuationSnapshot
  editorBatch?: EditorEditBatchCommand
  editorBatchTarget?: {
    workspace: 'main'
    targetId: string
    contentHash: string
  }
  editorBatchRecord?: EditorBatchRecord
  editorBatchDiff?: {
    original: string
    next: string
    hunks: EditorDiffHunkView['hunks']
  }
  routingFallback?: {
    routing?: ChainRoutingResult
    skillNames: string[]
    recommendedSkillIds?: string[]
    requestText: string
    runId?: string
    createdAt?: number
    resumeToken?: string
  }
  budgetExhausted?: {
    used: number
    limit: number
    requestText: string
    budgetToken?: string
  }
  skillRunDiagnostics?: Pick<WorkspaceSkillRunMeta, 'status' | 'diagnostics' | 'requestMessages' | 'budget' | 'folderPackageCache'>
  finalDraftTask?: FinalDraftTaskView | FinalDraftTask
}

export interface ChatSession {
  id: string
  title: string
  tabId: string
  chapterId: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

export type ChatGenerationStatus = 'idle' | 'preparing' | 'streaming' | 'retrying' | 'canceled' | 'error'

export const useChatStore = defineStore('chat', () => {
  const sessions = ref<ChatSession[]>([])
  const activeSessionId = ref<string | null>(null)
  const currentProjectId = ref<string>('default')
  const currentContext = ref<{ tabId: string; chapterId: string; title: string; content: string; mode: string } | null>(null)
  const generationStatus = ref<ChatGenerationStatus>('idle')
  const generationMessage = ref('')
  const generationStartedAt = ref<number | null>(null)

  const activeSession = computed(() => sessions.value.find(s => s.id === activeSessionId.value) || null)
  const activeMessages = computed(() => activeSession.value?.messages || [])

  async function loadSessions(projectId: string) {
    const id = projectId || currentProjectId.value || 'default'
    const data = await window.electronAPI.storageRead(storageKey('chat_' + id))
    if (data && Array.isArray(data)) {
      sessions.value = data
    }
  }

  const SESSIONS_SAVE_INTERVAL_MS = 250
  let sessionsSavePending: Promise<boolean> | null = null
  let sessionsSaveTimer: ReturnType<typeof setTimeout> | null = null

  async function persistSessions(id: string): Promise<boolean> {
    // Serialize once here; callers mutate the live Pinia state and must not
    // trigger a full deep clone for every stream chunk.
    const snapshot = JSON.parse(JSON.stringify(sessions.value)) as ChatSession[]
    return window.electronAPI.storageWrite(storageKey('chat_' + id), snapshot)
  }

  function saveSessions(projectId?: string): Promise<boolean> {
    const id = projectId || currentProjectId.value || 'default'
    if (projectId) currentProjectId.value = projectId
    if (sessionsSaveTimer) return sessionsSavePending ?? Promise.resolve(true)
    sessionsSavePending = new Promise(resolve => {
      sessionsSaveTimer = setTimeout(async () => {
        sessionsSaveTimer = null
        const result = await persistSessions(id)
        sessionsSavePending = null
        resolve(result)
      }, SESSIONS_SAVE_INTERVAL_MS)
    })
    return sessionsSavePending
  }

  function ensureSession(tabId: string, chapterId: string, title: string, projectId?: string) {
    if (projectId) currentProjectId.value = projectId
    let session = sessions.value.find(s => s.tabId === tabId && s.chapterId === chapterId)
    if (!session) {
      session = {
        id: 'chat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        title: title,
        tabId: tabId,
        chapterId: chapterId,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      sessions.value.push(session)
    }
    activeSessionId.value = session.id
    return session
  }

  function addMessage(msg: Omit<ChatMessage, 'id' | 'ts'>, projectId?: string) {
    const session = activeSession.value
    if (!session) return null
    const full: ChatMessage = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      ts: Date.now(),
      ...msg
    }
    session.messages.push(full)
    session.updatedAt = Date.now()
    saveSessions(projectId)
    return full
  }

  function updateLastMessage(content: string) {
    const session = activeSession.value
    if (session && session.messages.length > 0) {
      const last = session.messages[session.messages.length - 1]
      if (last.role === 'assistant') {
        last.content = content
        session.updatedAt = Date.now()
        saveSessions(currentProjectId.value)
      }
    }
  }

  function updateLastMessageSkillDiagnostics(meta: WorkspaceSkillRunMeta) {
    const session = activeSession.value
    const last = session?.messages[session.messages.length - 1]
    if (!session || !last || last.role !== 'assistant') return false
    last.skillRunDiagnostics = {
      status: meta.status,
      diagnostics: meta.diagnostics,
      requestMessages: meta.requestMessages,
      budget: meta.budget,
      folderPackageCache: meta.folderPackageCache
    }
    session.updatedAt = Date.now()
    saveSessions(currentProjectId.value)
    return true
  }

  function updateMessageContent(messageId: string, content: string, sessionId?: string) {
    const session = sessions.value.find(item => item.id === (sessionId || activeSessionId.value))
    const message = session?.messages.find(item => item.id === messageId)
    if (!session || !message || message.role !== 'assistant') return false
    message.content = content
    session.updatedAt = Date.now()
    void saveSessions(currentProjectId.value)
    return true
  }
  function updateMessageContinuation(messageId: string, continuation?: ContinuationSnapshot, sessionId?: string) {
    const session = sessions.value.find(item => item.id === (sessionId || activeSessionId.value))
    const message = session?.messages.find(item => item.id === messageId)
    if (!session || !message) return false
    message.continuation = continuation
    session.updatedAt = Date.now()
    void saveSessions(currentProjectId.value)
    return true
  }

  function updateMessageFinalDraftTask(messageId: string, task: FinalDraftTask, sessionId?: string, projectId?: string) {
    const session = sessions.value.find(item => item.id === (sessionId || activeSessionId.value))
    const message = session?.messages.find(item => item.id === messageId)
    if (!session || !message) return false
    // Persist a slim view even on state transitions. Document-sized fields
    // belong to the live runner and checkpoint recovery, not chat storage.
    message.finalDraftTask = toFinalDraftTaskView(task)
    session.updatedAt = Date.now()
    void saveSessions(projectId || currentProjectId.value)
    return true
  }

  function updateMessageRoutingState(
    messageId: string,
    patch: { routingFallback?: ChatMessage['routingFallback']; budgetExhausted?: ChatMessage['budgetExhausted'] },
    sessionId?: string
  ) {
    const session = sessions.value.find(item => item.id === (sessionId || activeSessionId.value))
    const message = session?.messages.find(item => item.id === messageId)
    if (!session || !message || message.role !== 'assistant') return false
    if (patch.routingFallback !== undefined) message.routingFallback = patch.routingFallback
    if (patch.budgetExhausted !== undefined) message.budgetExhausted = patch.budgetExhausted
    session.updatedAt = Date.now()
    void saveSessions(currentProjectId.value)
    return true
  }

  function updateMessageEditorBatch(
    messageId: string,
    editorBatch?: EditorEditBatchCommand | null,
    editorBatchTarget?: ChatMessage['editorBatchTarget'] | null,
    editorBatchRecord?: EditorBatchRecord | null,
    sessionId?: string,
    editorBatchDiff?: ChatMessage['editorBatchDiff'] | null
  ) {
    const session = sessions.value.find(item => item.id === (sessionId || activeSessionId.value))
    const message = session?.messages.find(item => item.id === messageId)
    if (!session || !message || message.role !== 'assistant') return false
    // undefined means "leave this field unchanged"; null means "explicitly clear it".
    if (editorBatch !== undefined && editorBatch !== null) {
      message.editorBatch = editorBatch
    } else if (editorBatch === null) {
      delete message.editorBatch
    }
    if (editorBatchTarget !== undefined && editorBatchTarget !== null) message.editorBatchTarget = editorBatchTarget
    else if (editorBatchTarget === null) delete message.editorBatchTarget
    if (editorBatchRecord !== undefined && editorBatchRecord !== null) message.editorBatchRecord = editorBatchRecord
    else if (editorBatchRecord === null) delete message.editorBatchRecord
    if (editorBatchDiff !== undefined && editorBatchDiff !== null) message.editorBatchDiff = editorBatchDiff
    else if (editorBatchDiff === null) delete message.editorBatchDiff
    session.updatedAt = Date.now()
    void saveSessions(currentProjectId.value)
    return true
  }

  function replaceMessagePair(userIndex: number, projectId?: string): string | null {
    const session = activeSession.value
    if (!session) return null
    const user = session.messages[userIndex]
    const assistant = session.messages[userIndex + 1]
    if (!user || user.role !== 'user' || !assistant || assistant.role !== 'assistant') return null
    const content = user.content
    delete assistant.editorBatch
    delete assistant.editorBatchTarget
    delete assistant.editorBatchRecord
    delete assistant.editorBatchDiff
    session.messages.splice(userIndex, 2)
    session.updatedAt = Date.now()
    saveSessions(projectId)
    return content
  }

  function setGenerationState(status: ChatGenerationStatus, message = '') {
    generationStatus.value = status
    generationMessage.value = message
    if (status === 'preparing' || status === 'streaming' || status === 'retrying') {
      generationStartedAt.value ||= Date.now()
    } else if (status === 'idle') {
      generationStartedAt.value = null
    }
  }

  function clearSession() {
    const session = activeSession.value
    if (session) {
      session.messages = []
      session.updatedAt = Date.now()
      saveSessions(currentProjectId.value)
    }
  }

  function removeSession(id: string) {
    const idx = sessions.value.findIndex(s => s.id === id)
    if (idx >= 0) {
      sessions.value.splice(idx, 1)
      if (activeSessionId.value === id) {
        activeSessionId.value = sessions.value[Math.max(0, idx - 1)]?.id || null
      }
      saveSessions(currentProjectId.value)
    }
  }

  function setCurrentContext(ctx: { tabId: string; chapterId: string; title: string; content: string; mode: string }) {
    currentContext.value = ctx
  }

  return {
    sessions, activeSessionId, activeSession, activeMessages, currentContext,
    generationStatus, generationMessage, generationStartedAt,
    loadSessions, saveSessions, ensureSession, addMessage, updateLastMessage, updateLastMessageSkillDiagnostics, updateMessageContent, updateMessageRoutingState, replaceMessagePair, setGenerationState,
    clearSession, removeSession, setCurrentContext, updateMessageContinuation, updateMessageEditorBatch,
    updateMessageFinalDraftTask
  }
})

