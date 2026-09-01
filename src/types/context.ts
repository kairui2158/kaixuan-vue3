/**
 * 上下文记忆协议的纯类型定义。
 *
 * 本文件只描述跨会话、工作区和链式执行之间传递的数据形状，
 * 不读取 store、不写入磁盘，也不发起网络请求。
 */

export type ContextWorkspace = 'main' | 'outline' | 'pipeline' | 'editor'

export type ContextPurpose =
  | 'generate'
  | 'rewrite'
  | 'verify'
  | 'detect'
  | 'image'
  | 'video'

export type ContextMessageRole = 'system' | 'user' | 'assistant'

/** 与 chat store 兼容的最小消息形状，允许保留已有诊断字段。 */
export interface ContextMessage {
  role: ContextMessageRole
  content: string
  id?: string
  ts?: number
  model?: string
  agentId?: string
  tabId?: string
  meta?: Record<string, unknown>
}

export interface ContextRef {
  projectId: string
  workspace: ContextWorkspace
  purpose: ContextPurpose
  skillId?: string
  agentId?: string
  sessionId?: string
}

export type ContextHistoryMode = 'none' | 'recent' | 'summary' | 'full'

export interface ContextPolicy {
  chatHistory: ContextHistoryMode
  recentTurns: number
  includeOutline: boolean
  includeSettings: boolean
  includeMemory: boolean
}

export interface ContextWorkspaceState {
  outline?: string
  selectedText?: string
  activeTab?: string
  settings?: Record<string, unknown>
  memories?: string
}

export interface ContextExecutionState {
  purpose: ContextPurpose
  skillId?: string
  agentId?: string
  previousSkillOutput?: string
}

export interface ContextBundle {
  session: {
    id: string
    projectId: string
    recentMessages: ContextMessage[]
    summary?: string
  }
  workspace: ContextWorkspaceState
  execution: ContextExecutionState
}

export interface ContextTurn {
  user: string
  assistant: string
  meta?: Record<string, unknown>
}

export interface StoredContextSession {
  id: string
  scope: Omit<ContextRef, 'sessionId'>
  messages: ContextMessage[]
  summary?: string
  createdAt: number
  updatedAt: number
}

export interface StoredContextState {
  version: 1
  sessions: StoredContextSession[]
}
