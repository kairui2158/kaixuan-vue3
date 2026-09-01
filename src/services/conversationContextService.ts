import { storageKey } from '../utils/storage-key'
import { retrieveContext } from './memoryRetriever'
import type { MemoryData } from '../types/memory'
import type {
  ContextBundle,
  ContextMessage,
  ContextPolicy,
  ContextPurpose,
  ContextRef,
  ContextTurn,
  ContextWorkspace,
  ContextWorkspaceState,
  StoredContextSession,
  StoredContextState
} from '../types/context'

export interface ContextStorage {
  read(key: string): Promise<unknown> | unknown
  write(key: string, value: unknown): Promise<unknown> | unknown
  remove?(key: string): Promise<unknown> | unknown
}

export interface ContextProjectSnapshot {
  outline?: string
  selectedText?: string
  activeTab?: string
  settings?: Record<string, unknown>
  memories?: MemoryData | string | null
}

export interface ContextBuildInput extends ContextRef {
  selectedText?: string
  activeTab?: string
  previousSkillOutput?: string
  /** 允许调用点提供尚未落盘的即时工作区状态。 */
  workspaceState?: Partial<ContextWorkspaceState>
  /** 旧项目聊天记录的只读兼容入口，仅在新会话尚不存在时使用。 */
  legacyMessages?: ContextMessage[]
}

export interface ConversationContextServiceOptions {
  storage?: ContextStorage
  projectReader?: (projectId: string) => Promise<ContextProjectSnapshot> | ContextProjectSnapshot
}

const DEFAULT_POLICY: ContextPolicy = {
  chatHistory: 'recent',
  recentTurns: 10,
  includeOutline: true,
  includeSettings: true,
  includeMemory: true
}

const MAX_STORED_MESSAGES = 200
const MAX_OUTLINE_CHARS = 12000
const MAX_SETTINGS_CHARS = 5000
const MAX_MEMORY_CHARS = 6000
const MAX_SELECTED_TEXT_CHARS = 4000

function clean(value: unknown): string {
  return String(value ?? '').trim()
}

function clip(value: unknown, limit: number): string {
  const text = clean(value)
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function sessionIdFor(ref: ContextRef): string {
  return ref.sessionId || [ref.workspace, ref.purpose, ref.skillId || 'default'].join('__')
}

function sameScope(session: StoredContextSession, ref: ContextRef): boolean {
  return session.scope.workspace === ref.workspace
    && session.scope.purpose === ref.purpose
    && (session.scope.skillId || '') === (ref.skillId || '')
}

function emptyState(): StoredContextState {
  return { version: 1, sessions: [] }
}

function normalizeState(raw: unknown): StoredContextState {
  if (!raw || typeof raw !== 'object') return emptyState()
  const value = raw as Partial<StoredContextState>
  if (!Array.isArray(value.sessions)) return emptyState()
  const sessions = value.sessions.filter(session => {
    return !!session
      && typeof session === 'object'
      && typeof session.id === 'string'
      && !!session.scope
      && Array.isArray(session.messages)
  }).map(session => ({
    id: session.id,
    scope: {
      projectId: session.scope.projectId,
      workspace: session.scope.workspace,
      purpose: session.scope.purpose,
      ...(session.scope.skillId ? { skillId: session.scope.skillId } : {}),
      ...(session.scope.agentId ? { agentId: session.scope.agentId } : {})
    },
    messages: session.messages.filter(message => {
      return !!message && typeof message === 'object'
        && (message.role === 'system' || message.role === 'user' || message.role === 'assistant')
        && typeof message.content === 'string'
    }).map(message => ({ ...message })),
    ...(typeof session.summary === 'string' ? { summary: session.summary } : {}),
    createdAt: Number(session.createdAt) || Date.now(),
    updatedAt: Number(session.updatedAt) || Date.now()
  }))
  return { version: 1, sessions }
}

function legacyMessages(raw: unknown): ContextMessage[] {
  if (!Array.isArray(raw)) return []
  const sessions = raw.filter(session => session && Array.isArray(session.messages))
  sessions.sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt))
  const latest = sessions[0]
  if (!latest) return []
  return latest.messages.filter((message: any) => {
    return message && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string'
  }).map((message: any) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    ts: Number(message.ts) || Date.now(),
    model: message.model,
    agentId: message.agentId,
    tabId: message.tabId
  }))
}

function defaultStorage(): ContextStorage {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined
  if (!api) throw new Error('上下文存储不可用：未找到 Electron 存储接口')
  return {
    read: key => api.storageRead(key),
    write: (key, value) => api.storageWrite(key, value),
    remove: key => api.storageRemove(key)
  }
}

async function defaultProjectReader(projectId: string): Promise<ContextProjectSnapshot> {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined
  if (!api) return {}
  const raw = await api.storageRead(storageKey(`project_${projectId}`))
  if (!raw || typeof raw !== 'object') return {}
  const data = raw as any
  return {
    outline: data.outlineText || '',
    settings: data.settingsCollection || { categories: [], items: {} },
    memories: data.memories || null
  }
}

function memoryText(value: MemoryData | string | null | undefined): string {
  if (typeof value === 'string') return clip(value, MAX_MEMORY_CHARS)
  if (!value) return ''
  return retrieveContext(value, { maxChars: MAX_MEMORY_CHARS }).text
}

function contextMessage(bundle: ContextBundle, policy: ContextPolicy): ContextMessage | null {
  const sections: string[] = []
  if (policy.includeOutline && bundle.workspace.outline) {
    sections.push(`当前大纲：\n${clip(bundle.workspace.outline, MAX_OUTLINE_CHARS)}`)
  }
  if (policy.includeSettings && bundle.workspace.settings) {
    const settings = clip(JSON.stringify(bundle.workspace.settings), MAX_SETTINGS_CHARS)
    if (settings && settings !== '{}') sections.push(`当前设定：\n${settings}`)
  }
  if (policy.includeMemory && bundle.workspace.memories) {
    sections.push(`相关记忆：\n${clip(bundle.workspace.memories, MAX_MEMORY_CHARS)}`)
  }
  if (bundle.workspace.selectedText) {
    sections.push(`当前选中文本：\n${clip(bundle.workspace.selectedText, MAX_SELECTED_TEXT_CHARS)}`)
  }
  if (bundle.workspace.activeTab) sections.push(`当前编辑区：${bundle.workspace.activeTab}`)
  if (!sections.length) return null
  return { role: 'system', content: `[工作区上下文]\n${sections.join('\n\n')}` }
}

function recentMessages(messages: ContextMessage[], turns: number): ContextMessage[] {
  const limit = Math.max(0, Math.floor(turns)) * 2
  return limit > 0 ? messages.slice(-limit) : []
}

export class ConversationContextService {
  private readonly storage: ContextStorage
  private readonly projectReader: (projectId: string) => Promise<ContextProjectSnapshot> | ContextProjectSnapshot

  constructor(options: ConversationContextServiceOptions = {}) {
    this.storage = options.storage || defaultStorage()
    this.projectReader = options.projectReader || defaultProjectReader
  }

  private contextKey(projectId: string): string {
    return storageKey(`ctx_${projectId}`)
  }

  private legacyKey(projectId: string): string {
    return storageKey(`chat_${projectId}`)
  }

  private async readState(projectId: string): Promise<StoredContextState> {
    const raw = await this.storage.read(this.contextKey(projectId))
    return normalizeState(raw)
  }

  private async readSession(ref: ContextRef): Promise<StoredContextSession | null> {
    const state = await this.readState(ref.projectId)
    const found = state.sessions.find(session => session.id === sessionIdFor(ref) && sameScope(session, ref))
    if (found) return found
    if (ref.workspace === 'main' && !ref.skillId) {
      const legacy = legacyMessages(await this.storage.read(this.legacyKey(ref.projectId)))
      if (legacy.length) {
        return {
          id: sessionIdFor(ref),
          scope: { projectId: ref.projectId, workspace: ref.workspace, purpose: ref.purpose },
          messages: legacy,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      }
    }
    return null
  }

  getPolicy(_purpose: string, _skillId?: string, skillPolicy?: {
    chatHistory?: ContextPolicy['chatHistory']
    recentTurns?: number
    includeOutline?: boolean
    includeSettings?: boolean
    includeMemory?: boolean
  }): ContextPolicy {
    return {
      ...DEFAULT_POLICY,
      ...(skillPolicy || {})
    }
  }

  async buildContextBundle(input: ContextBuildInput): Promise<ContextBundle> {
    const ref: ContextRef = {
      projectId: input.projectId,
      workspace: input.workspace,
      purpose: input.purpose,
      ...(input.skillId ? { skillId: input.skillId } : {}),
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {})
    }
    const [project, session] = await Promise.all([
      this.projectReader(input.projectId),
      this.readSession(ref)
    ])
    const memories = memoryText(project.memories)
    const legacy = !session && Array.isArray(input.legacyMessages)
      ? input.legacyMessages.filter(message => {
        return message
          && (message.role === 'user' || message.role === 'assistant')
          && typeof message.content === 'string'
          && message.content.trim().length > 0
      }).map(message => ({ ...message }))
      : []
    const workspaceState = input.workspaceState || {}
    return {
      session: {
        id: sessionIdFor(ref),
        projectId: input.projectId,
        recentMessages: clone(session?.messages || legacy),
        ...(session?.summary ? { summary: session.summary } : {})
      },
      workspace: {
        outline: clip(workspaceState.outline ?? project.outline, MAX_OUTLINE_CHARS),
        selectedText: clip(workspaceState.selectedText ?? input.selectedText ?? project.selectedText, MAX_SELECTED_TEXT_CHARS),
        activeTab: workspaceState.activeTab || input.activeTab || project.activeTab,
        settings: workspaceState.settings ?? project.settings,
        memories: workspaceState.memories !== undefined
          ? memoryText(workspaceState.memories)
          : memories
      },
      execution: {
        purpose: input.purpose,
        ...(input.skillId ? { skillId: input.skillId } : {}),
        ...(input.agentId ? { agentId: input.agentId } : {}),
        ...(input.previousSkillOutput !== undefined ? { previousSkillOutput: input.previousSkillOutput } : {})
      }
    }
  }

  assembleMessages(bundle: ContextBundle, policy: ContextPolicy, base: ContextMessage[]): ContextMessage[] {
    const systemMessages = base.filter(message => message.role === 'system')
    const nonSystem = base.filter(message => message.role !== 'system')
    const current = nonSystem.length ? nonSystem[nonSystem.length - 1] : null
    const earlierBase = nonSystem.slice(0, -1)
    const output: ContextMessage[] = [...systemMessages]
    const workspace = contextMessage(bundle, policy)
    if (workspace) output.push(workspace)

    if (policy.chatHistory === 'summary' && bundle.session.summary) {
      output.push({ role: 'system', content: `[会话摘要]\n${bundle.session.summary}` })
    } else if (policy.chatHistory === 'recent') {
      output.push(...recentMessages(bundle.session.recentMessages, policy.recentTurns))
    } else if (policy.chatHistory === 'full') {
      output.push(...bundle.session.recentMessages)
    }

    if (bundle.execution.previousSkillOutput !== undefined) {
      output.push({ role: 'user', content: `[上一步 SKILL 完整输出]\n${bundle.execution.previousSkillOutput}` })
    }
    output.push(...earlierBase)
    if (current) output.push(current)
    return output
  }

  async recordTurn(ref: ContextRef, turn: ContextTurn): Promise<void> {
    const state = await this.readState(ref.projectId)
    const id = sessionIdFor(ref)
    let session = state.sessions.find(item => item.id === id && sameScope(item, ref))
    const now = Date.now()
    if (!session) {
      session = {
        id,
        scope: {
          projectId: ref.projectId,
          workspace: ref.workspace,
          purpose: ref.purpose,
          ...(ref.skillId ? { skillId: ref.skillId } : {})
        },
        messages: [],
        createdAt: now,
        updatedAt: now
      }
      state.sessions.push(session)
    }
    session.messages.push(
      { role: 'user', content: turn.user, ts: now },
      { role: 'assistant', content: turn.assistant, ts: now, ...(turn.meta ? { meta: clone(turn.meta) } : {}) }
    )
    session.messages = session.messages.slice(-MAX_STORED_MESSAGES)
    session.updatedAt = now
    const result = await this.storage.write(this.contextKey(ref.projectId), state)
    if (result === false) throw new Error(`上下文写盘失败：${this.contextKey(ref.projectId)}`)
  }

  async clearSession(ref: ContextRef): Promise<void> {
    const state = await this.readState(ref.projectId)
    const session = state.sessions.find(item => item.id === sessionIdFor(ref) && sameScope(item, ref))
    if (!session) return
    session.messages = []
    delete session.summary
    session.updatedAt = Date.now()
    const result = await this.storage.write(this.contextKey(ref.projectId), state)
    if (result === false) throw new Error(`上下文写盘失败：${this.contextKey(ref.projectId)}`)
  }
}

export const conversationContextService = new Proxy({} as ConversationContextService, {
  get(_target, property: keyof ConversationContextService) {
    if (!(globalThis as any).__conversationContextService) {
      ;(globalThis as any).__conversationContextService = new ConversationContextService()
    }
    const service = (globalThis as any).__conversationContextService as ConversationContextService
    const value = service[property]
    return typeof value === 'function' ? value.bind(service) : value
  }
})
