import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { storageKey } from '../utils/storage-key'
import type { ContinuationSnapshot } from '../services/continuation'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  ts: number
  model?: string
  agentId?: string
  tabId?: string
  continuation?: ContinuationSnapshot
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

  async function saveSessions(projectId?: string) {
    const id = projectId || currentProjectId.value || 'default'
    await window.electronAPI.storageWrite(storageKey('chat_' + id), JSON.parse(JSON.stringify(sessions.value)))
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
    if (!session) return
    const full: ChatMessage = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      ts: Date.now(),
      ...msg
    }
    session.messages.push(full)
    session.updatedAt = Date.now()
    saveSessions(projectId)
  }

  function updateLastMessage(content: string) {
    const session = activeSession.value
    if (session && session.messages.length > 0) {
      const last = session.messages[session.messages.length - 1]
      if (last.role === 'assistant') {
        last.content = content
        session.updatedAt = Date.now()
        saveSessions()
      }
    }
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

  function replaceMessagePair(userIndex: number, projectId?: string): string | null {
    const session = activeSession.value
    if (!session) return null
    const user = session.messages[userIndex]
    const assistant = session.messages[userIndex + 1]
    if (!user || user.role !== 'user' || !assistant || assistant.role !== 'assistant') return null
    const content = user.content
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
      saveSessions()
    }
  }

  function removeSession(id: string) {
    const idx = sessions.value.findIndex(s => s.id === id)
    if (idx >= 0) {
      sessions.value.splice(idx, 1)
      if (activeSessionId.value === id) {
        activeSessionId.value = sessions.value[Math.max(0, idx - 1)]?.id || null
      }
      saveSessions()
    }
  }

  function setCurrentContext(ctx: { tabId: string; chapterId: string; title: string; content: string; mode: string }) {
    currentContext.value = ctx
  }

  return {
    sessions, activeSessionId, activeSession, activeMessages, currentContext,
    generationStatus, generationMessage, generationStartedAt,
    loadSessions, saveSessions, ensureSession, addMessage, updateLastMessage, updateMessageContent, replaceMessagePair, setGenerationState,
    clearSession, removeSession, setCurrentContext, updateMessageContinuation
  }
})

