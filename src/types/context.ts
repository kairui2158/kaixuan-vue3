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

/** Non-destructive compaction marker; the original message stays in storage. */
export interface ContextMessageCompaction {
  compactionId: string
  foldedAt: number
  reason?: 'summary' | 'budget'
}

/** Boundary marker stored in the session; it replaces folded messages in API history. */
export interface ContextCompactionMarker {
  compactionId: string
  foldedAt: number
  foldedMessageCount: number
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
  /** SKILL 模板已通过 {{outlineContent}} 变量注入大纲全文时，ContextPack 不再重复携带焦点全文。 */
  skipOutlineBody?: boolean
}

export interface ContextBudget {
  /** Declared model input window; undefined means no reliable compaction trigger. */
  modelContextWindow?: number
  /** Output tokens reserved by this generation request. */
  reservedOutputTokens?: number
}

export interface ContextCompactionResult {
  performed: boolean
  strategy: 'none' | 'summary' | 'marker-truncation'
  reason?: 'budget-exceeded' | 'summary-failed' | 'unknown-window'
  compactedMessageCount: number
  retainedMessageCount: number
  retainedMessages?: ContextMessage[]
  summary?: string
  markerMessage?: ContextMessage
  beforeChars: number
  afterChars: number
  estimatedBeforeTokens: number
  estimatedAfterTokens: number
  allowedInputTokens?: number
}

export interface ContextWorkspaceState {
  outline?: string
  outlineContextPack?: string
  /** 主页编辑器当前目标的完整内容；仅在 main 工作区使用。 */
  editorContent?: string
  /** 主页编辑器的参考资料大纲；不得替代 editorContent 的主上下文地位。 */
  referenceOutline?: string
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
  /** 上一轮工具调用的 compact 审计；只进 system context，不进聊天文本。 */
  toolAudit?: unknown
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

export interface ContextCompactionObserver {
  onContextCompacted?: (result: ContextCompactionResult) => void
  onContextCompactionSkipped?: (result: ContextCompactionResult) => void
  onContextCompactionLifecycle?: (event: ContextCompactionLifecycleEvent) => void
}

export type ContextCompactionLifecycleStage =
  | 'pre_compact'
  | 'summarizing'
  | 'checkpoint'
  | 'post_compact'
  | 'window_switch'
  | 'checkpoint_failed'

export interface ContextCompactionLifecycleEvent {
  stage: ContextCompactionLifecycleStage
  workspace?: ContextWorkspace
  sessionId?: string
  checkpointId?: string
  compactionId?: string
  status: 'success' | 'failed' | 'needs_user'
  detail?: string
  usageSource?: 'actual' | 'estimated' | 'unavailable'
  usageReconciliation?: {
    status: 'available' | 'unavailable'
    estimatedInputTokens: number
    actualInputTokens?: number
    driftRatio?: number
    correctedRatio?: number
  }
}

export interface ContextTurn {
  user: string
  assistant: string
  /** 本轮真实请求的实际输出上限，用于压缩预算；缺省回落到 workspace 路由配置。 */
  reservedOutputTokens?: number | null
  meta?: Record<string, unknown>
}

/** 跨轮工具审计元数据；由 crossTurnToolAudit 单源构建。 */
export interface ContextTurnToolAudit {
  version: 1
  entries: Array<{
    toolCallId: string
    toolName: string
    status: 'success' | 'failed'
    policy: 'read' | 'write' | 'unknown'
    inputSummary: string
    resultSummary: string
    errorCode?: string
    protocolVersion?: number
  }>
  orphanToolCallIds: string[]
  truncated: boolean
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
