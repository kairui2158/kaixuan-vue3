import { storageKey } from '../utils/storage-key'
import { retrieveContext } from './memoryRetriever'
import {
  formatCrossTurnToolAudit,
  hasCrossTurnToolAudit,
} from './crossTurnToolAudit'
import type { MemoryData } from '../types/memory'
import { parseOutlineStructure } from './outlineStructure'
import { buildMainEditorContextPack, editorContextInjectionMode } from './editorContextPolicy'
import { validateDialogueContextBlocks, type DialogueContextBlock } from './dialogueFoundation'
import type {
  ContextBudget,
  ContextBundle,
  ContextCompactionObserver,
  ContextCompactionResult,
  ContextCompactionMarker,
  ContextMessageCompaction,
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
  /** 上一轮工具调用的 compact 审计；由调用方在写入完成后登记。 */
  toolAudit?: unknown
}

export interface ConversationContextServiceOptions {
  storage?: ContextStorage
  projectReader?: (projectId: string) => Promise<ContextProjectSnapshot> | ContextProjectSnapshot
  compaction?: {
    budget?: ContextBudget
    observer?: ContextCompactionObserver
    buildSummary?: (messages: ContextMessage[]) => Promise<string | null>
  }
}

export interface ContextCompactionRouting {
  workspace?: ContextWorkspace
  budget?: ContextBudget
  observer?: ContextCompactionObserver
}

export interface ContextCompactionCheckpoint {
  version: 1
  checkpointId: string
  compactionId: string
  createdAt: number
  projectId: string
  workspace: ContextWorkspace
  sessionId: string
  messageCount: number
  contentHash: string
  /** Hash of the compacted session produced by this checkpoint's compaction. */
  postCompactionHash?: string
  /** Compaction is only allowed to start after its pre-write checkpoint lands. */
  status: 'saved' | 'restored' | 'failed' | 'hash_mismatch'
  goal?: string
  keyFacts?: string[]
  hardConstraints?: string[]
  openQuestions?: string[]
  necessaryFragments?: string[]
  toolState?: Record<string, unknown>
}

const DEFAULT_POLICY: ContextPolicy = {
  chatHistory: 'recent',
  recentTurns: 10,
  includeOutline: true,
  includeSettings: true,
  includeMemory: true
}

const MAX_STORED_MESSAGES = 200
export const MAX_SELECTED_TEXT_CHARS = 4000
export const MAX_MEMORY_CHARS = 6000
const CONTEXT_WINDOW_INPUT_RATIO = 0.9
const DEFAULT_PRESERVE_RECENT_MESSAGES = 4
const MAX_SUMMARY_MESSAGES = 30
const MAX_SUMMARY_SNAPSHOT_CHARS = 160
const MAX_MARKER_FALLBACK_CHARS = 240

function isCompacted(message: ContextMessage): boolean {
  return Boolean(message.meta?.compaction || message.meta?.compactionId)
}

function isCompactionMarker(message: ContextMessage): boolean {
  return Boolean(message.meta?.compactionMarker)
}

function estimateTokens(text: string): number {
  return Math.ceil((text || '').length / 2)
}

function messageTokens(messages: ContextMessage[]): number {
  return messages.reduce((total, message) => total + estimateTokens(message.content), 0)
}

function identityKey(message: ContextMessage): string {
  return JSON.stringify([message.ts ?? 0, message.role, message.content])
}

function checkpointHash(messages: ContextMessage[], summary?: string): string {
  let hash = 0x811c9dc5
  const source = JSON.stringify([messages.map(message => identityKey(message)), summary || ''])
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `fnv1a32_${hash.toString(16).padStart(8, '0')}`
}

function normalizeCheckpoint(raw: unknown): ContextCompactionCheckpoint | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Partial<ContextCompactionCheckpoint>
  if (value.version !== 1) return null
  const required = [value.checkpointId, value.compactionId, value.projectId, value.workspace, value.sessionId, value.contentHash]
  if (required.some(item => typeof item !== 'string' || !item)) return null
  const status = value.status
  if (status !== 'saved' && status !== 'restored' && status !== 'failed' && status !== 'hash_mismatch') return null
  if (!Number.isFinite(Number(value.createdAt))) return null
  return {
    version: 1,
    checkpointId: String(value.checkpointId),
    compactionId: String(value.compactionId),
    createdAt: Number(value.createdAt),
    projectId: String(value.projectId),
    workspace: value.workspace as ContextWorkspace,
    sessionId: String(value.sessionId),
    messageCount: Number(value.messageCount) || 0,
    contentHash: String(value.contentHash),
    status,
    ...(typeof value.goal === 'string' && value.goal ? { goal: value.goal } : {}),
    ...(Array.isArray(value.keyFacts) ? { keyFacts: value.keyFacts.map(item => String(item)) } : {}),
    ...(Array.isArray(value.hardConstraints) ? { hardConstraints: value.hardConstraints.map(item => String(item)) } : {}),
    ...(Array.isArray(value.openQuestions) ? { openQuestions: value.openQuestions.map(item => String(item)) } : {}),
    ...(Array.isArray(value.necessaryFragments) ? { necessaryFragments: value.necessaryFragments.map(item => String(item)) } : {}),
    ...(typeof value.postCompactionHash === 'string' && value.postCompactionHash ? { postCompactionHash: value.postCompactionHash } : {}),
    ...(value.toolState && typeof value.toolState === 'object' ? { toolState: value.toolState as Record<string, unknown> } : {}),
  }
}

function allowedInputTokens(budget?: ContextBudget): number | undefined {
  const window = Number(budget?.modelContextWindow)
  if (!Number.isFinite(window) || window <= 0) return undefined
  const reserved = Math.max(0, Number(budget?.reservedOutputTokens) || 0)
  return Math.max(0, Math.floor(window * CONTEXT_WINDOW_INPUT_RATIO) - reserved)
}

/**
 * Model input windows are resolved from provider-declared model names only.
 * Unknown models deliberately return undefined: compaction is skipped instead
 * of guessing a window that could silently discard working history.
 */
export function resolveModelContextWindow(model: unknown): number | undefined {
  const name = clean(model).toLowerCase()
  if (!name) return undefined
  const compactWindow = name.match(/(?:^|[^0-9k])(\d+(?:\.\d+)?)(k|k-context)(?:[^0-9a-z]|$)/)
  const millionWindow = name.match(/(?:^|[^0-9m])(\d+(?:\.\d+)?)(m|m-context)(?:[^0-9a-z]|$)/)
  if (compactWindow) {
    const value = Number(compactWindow[1]) * 1000
    if (value >= 1000) return Math.floor(value)
  }
  if (millionWindow) {
    const value = Number(millionWindow[1]) * 1_000_000
    if (value >= 1000) return Math.floor(value)
  }
  if (/(?:^|[^a-z])1m(?:[^a-z]|$)/.test(name)) return 1_000_000
  if (/(?:^|[^a-z])2m(?:[^a-z]|$)/.test(name)) return 2_000_000
  if (name.includes('claude')) {
    if (name.includes('sonnet') || name.includes('haiku')) return 200_000
    if (name.includes('opus')) return 200_000
  }
  if (name.includes('gpt-4o') || name.includes('gpt-4.1')) return 128_000
  if (name.includes('gpt-4-turbo')) return 128_000
  if (name.includes('gpt-4')) return 8_192
  if (name.includes('deepseek')) return name.includes('reasoner') ? 128_000 : 64_000
  if (name.includes('gemini')) {
    if (name.includes('1.5')) return 1_000_000
    if (name.includes('2.5')) return 1_000_000
  }
  return undefined
}

export interface EffectiveModelContextWindowInput {
  model?: unknown
  providerContextWindowTokens?: number | string | null
}

/**
 * Single source for dialogue-side context windows. A provider-declared window
 * is authoritative; model-name parsing is only a fallback for undeclared
 * providers. Unknown stays unknown so compaction never guesses.
 */
export function resolveEffectiveModelContextWindow(
  input: EffectiveModelContextWindowInput,
): number | undefined {
  const declared = Number(input.providerContextWindowTokens)
  if (Number.isFinite(declared) && declared > 0) return Math.floor(declared)
  return resolveModelContextWindow(input.model)
}

function compactedMessages(messages: ContextMessage[]): ContextMessage[] {
  return messages.filter(message => !isCompacted(message))
}

function isRealUserInput(message: ContextMessage): boolean {
  return message.role === 'user'
    && !message.content.startsWith('[AI 编辑]')
    && !message.content.startsWith('[上一步 SKILL 完整输出]')
}

function buildHistorySummary(messages: ContextMessage[]): string | null {
  const bounded = messages.slice(-MAX_SUMMARY_MESSAGES)
  if (!bounded.length) return null
  return [
    `[非破坏性上下文摘要] 原始消息数=${messages.length}，摘要覆盖最近=${bounded.length}`,
    ...bounded.map(message => `${message.role === 'user' ? '用户' : '助手'}：${clip(message.content, MAX_SUMMARY_SNAPSHOT_CHARS)}`),
  ].join('\n')
}

function markerMessage(compactedCount: number, compactionId: string): ContextMessage {
  const foldedAt = Date.now()
  return {
    role: 'system',
    content: `[上下文压缩标记] 已非破坏性折叠 ${compactedCount} 条历史消息；原始内容保留在本地会话存储，compactionId=${compactionId}`,
    ts: foldedAt,
    meta: {
      compactionMarker: { compactionId, foldedAt, foldedMessageCount: compactedCount } satisfies ContextCompactionMarker,
    },
  }
}

function clean(value: unknown): string {
  return String(value ?? '').trim()
}

function clip(value: unknown, limit: number): string {
  const text = clean(value)
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

function contentVersion(value: unknown): string {
  const text = clean(value)
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `v-${hash.toString(16).padStart(8, '0')}`
}

export function buildOutlineContextPack(outline: string, selectedText: string): string {
  const source = clean(outline)
  if (!source) return ''
  const structure = parseOutlineStructure(source)
  const lines = [
    '[事实优先级]',
    '1. 用户当前指令与当前选中文本优先级最高，必须完整遵守。',
    '2. 锁定大纲与设定是稳定事实，不得凭推测改写。',
    '3. 结构地图只描述位置，不替代局部全文；需要细节时必须先读取节点内容。',
    '4. 会话历史与摘要仅用于延续讨论，与当前大纲冲突时以当前大纲为准。',
    '',
    '[大纲结构地图]',
    structure.mapText,
    '',
    '[当前焦点全文]',
    selectedText.trim() || source
  ]
  return lines.join('\n')
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
    }).map(message => ({
      ...message,
      ...(message.meta ? { meta: { ...message.meta } } : {}),
    })),
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
    tabId: message.tabId,
    ...(message.meta && typeof message.meta === 'object' ? { meta: message.meta as Record<string, unknown> } : {})
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
    if (policy.skipOutlineBody) {
      const structure = parseOutlineStructure(clean(bundle.workspace.outline))
      const mapOnly = [
        '[事实优先级]',
        '1. 用户当前指令与当前选中文本优先级最高，必须完整遵守。',
        '2. 锁定大纲与设定是稳定事实，不得凭推测改写。',
        '3. 结构地图只描述位置，不替代局部全文；需要细节时必须先读取节点内容。',
        '4. 会话历史与摘要仅用于延续讨论，与当前大纲冲突时以当前大纲为准。',
        '',
        '[大纲结构地图]',
        structure.mapText,
        '',
        '[提示] 大纲全文已由 SKILL 模板变量注入，此处仅提供结构地图。需要读取其他区域时请使用只读工具。',
      ].join('\n')
      sections.push(`当前大纲 ContextPack（来源=outline，版本=${contentVersion(mapOnly)}）：\n${mapOnly}`)
    } else {
      const pack = buildOutlineContextPack(
        bundle.workspace.outline,
        bundle.workspace.selectedText || ''
      )
      sections.push(`当前大纲 ContextPack（来源=outline，版本=${contentVersion(pack)}）：\n${pack}`)
    }
  }
  if (policy.includeSettings && bundle.workspace.settings) {
    const settings = clean(JSON.stringify(bundle.workspace.settings))
    if (settings && settings !== '{}') sections.push(`当前设定（来源=settings，版本=${contentVersion(settings)}）：\n${settings}`)
  }
  if (policy.includeMemory && bundle.workspace.memories) {
    sections.push(`相关记忆（来源=memory，版本=${contentVersion(bundle.workspace.memories)}）：\n${clip(bundle.workspace.memories, MAX_MEMORY_CHARS)}`)
  }
  if (bundle.workspace.selectedText) {
    sections.push(`当前选中文本（来源=selection，版本=${contentVersion(bundle.workspace.selectedText)}）：\n${clip(bundle.workspace.selectedText, MAX_SELECTED_TEXT_CHARS)}`)
  }
  if (bundle.workspace.activeTab) sections.push(`当前编辑区（来源=active_tab）：${bundle.workspace.activeTab}`)
  if (!sections.length) return null
  return { role: 'system', content: `[工作区上下文]\n${sections.join('\n\n')}` }
}

function toolAuditMessage(bundle: ContextBundle): ContextMessage | null {
  const audit = bundle.execution.toolAudit
  if (!hasCrossTurnToolAudit(audit)) return null
  const content = formatCrossTurnToolAudit(audit)
  return content ? { role: 'system', content } : null
}

function recentMessages(messages: ContextMessage[], turns: number): ContextMessage[] {
  const limit = Math.max(0, Math.floor(turns)) * 2
  return limit > 0 ? messages.slice(-limit) : []
}

export class ConversationContextService {
  private readonly storage: ContextStorage
  private readonly projectReader: (projectId: string) => Promise<ContextProjectSnapshot> | ContextProjectSnapshot
  private readonly writeQueues = new Map<string, Promise<unknown>>()
  private readonly compaction: NonNullable<ConversationContextServiceOptions['compaction']>
  private readonly routedCompaction = new Map<ContextWorkspace, ContextCompactionRouting>()
  private checkpoint?: ContextCompactionCheckpoint
  private checkpointVerifyMessages?: ContextMessage[]
  private checkpointContext: Omit<ContextCompactionCheckpoint, 'version' | 'checkpointId' | 'compactionId' | 'createdAt' | 'projectId' | 'workspace' | 'sessionId' | 'messageCount' | 'contentHash' | 'status'> = {}

  constructor(options: ConversationContextServiceOptions = {}) {
    this.storage = options.storage || defaultStorage()
    this.projectReader = options.projectReader || defaultProjectReader
    this.compaction = options.compaction || {}
  }

  /** Sets the effective input window used by non-destructive history compaction. */
  setCompactionBudget(budget: ContextBudget | undefined): void {
    this.compaction.budget = budget
  }

  /**
   * Installs per-workspace compaction routing. Concurrent workspaces share one
   * service instance; a global budget would let outline requests overwrite the
   * main editor's model window, and vice versa.
   */
  setCompactionRouting(routing: ContextCompactionRouting): void {
    const workspace = routing.workspace
    if (!workspace) {
      this.compaction.budget = routing.budget
      this.compaction.observer = routing.observer
      return
    }
    this.routedCompaction.set(workspace, { ...routing, workspace })
  }

  setCompactionObserver(observer: ContextCompactionObserver | undefined): void {
    this.compaction.observer = observer
  }

  getActiveCompactionCheckpoint(): ContextCompactionCheckpoint | null {
    return this.checkpoint ? { ...this.checkpoint } : null
  }

  /**
   * Pre-compaction snapshot. Compaction never runs unless this write lands;
   * a write failure is reported so the caller can keep the untouched history.
   */
  async saveCompactionCheckpoint(
    ref: ContextRef,
    input: Omit<ContextCompactionCheckpoint, 'version' | 'checkpointId' | 'compactionId' | 'createdAt' | 'projectId' | 'workspace' | 'sessionId' | 'messageCount' | 'contentHash' | 'status'> & {
      summary?: string
    },
  ): Promise<ContextCompactionCheckpoint | null> {
    const session = await this.readSession(ref)
    const messages = session?.messages || []
    const now = Date.now()
    const checkpoint: ContextCompactionCheckpoint = {
      version: 1,
      checkpointId: `ctxcp-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      compactionId: `ctx-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: now,
      projectId: ref.projectId,
      workspace: ref.workspace,
      sessionId: sessionIdFor(ref),
      messageCount: messages.length,
      contentHash: checkpointHash(messages, input.summary),
      status: 'saved',
      ...(input.goal ? { goal: input.goal } : {}),
      ...(input.keyFacts?.length ? { keyFacts: input.keyFacts } : {}),
      ...(input.hardConstraints?.length ? { hardConstraints: input.hardConstraints } : {}),
      ...(input.openQuestions?.length ? { openQuestions: input.openQuestions } : {}),
      ...(input.necessaryFragments?.length ? { necessaryFragments: input.necessaryFragments } : {}),
      ...(input.toolState && Object.keys(input.toolState).length ? { toolState: input.toolState } : {}),
      ...(input.postCompactionHash ? { postCompactionHash: input.postCompactionHash } : {}),
    }
    const key = storageKey(`ctxcp_${ref.projectId}_${checkpoint.sessionId}`)
    const written = await this.storage.write(key, checkpoint)
    if (written === false) return null
    this.checkpoint = checkpoint
    // Verification is a recovery-time gate: compare against the pre-compaction
    // snapshot, because successful compaction intentionally changes the session.
    this.checkpointVerifyMessages = messages.map(message => clone(message))
    return { ...checkpoint }
  }

  async loadCompactionCheckpoint(ref: ContextRef): Promise<ContextCompactionCheckpoint | null> {
    const raw = await this.storage.read(
      storageKey(`ctxcp_${ref.projectId}_${sessionIdFor(ref)}`)
    )
    const checkpoint = normalizeCheckpoint(raw)
    this.checkpoint = checkpoint || undefined
    return checkpoint ? { ...checkpoint } : null
  }

  async verifyCompactionCheckpoint(
    ref: ContextRef,
    checkpoint: ContextCompactionCheckpoint,
  ): Promise<ContextCompactionCheckpoint> {
    const session = await this.readSession(ref)
    // A crash can land between the checkpoint write and the compacted session
    // write. Both states are therefore legal at recovery time: the untouched
    // pre-compaction history, or the committed compacted history.
    const hasPreSnapshot = (this.checkpointVerifyMessages?.length || 0) > 0
    const actualPreHash = hasPreSnapshot
      ? checkpointHash(this.checkpointVerifyMessages as ContextMessage[], undefined)
      : undefined
    const actualPostHash = checkpointHash(session?.messages || [], session?.summary)
    const rawMessages = session?.messages || []
    const rawPreHash = checkpointHash(rawMessages, undefined)
    const matchesRawHistory = !hasPreSnapshot
      && rawMessages.length === checkpoint.messageCount
      && rawPreHash === checkpoint.contentHash
    if (actualPreHash === checkpoint.contentHash
      || matchesRawHistory
      || (!hasPreSnapshot && actualPostHash === checkpoint.postCompactionHash)) {
      const restored: ContextCompactionCheckpoint = { ...checkpoint, status: 'restored' }
      this.checkpoint = restored
      return restored
    }
    const mismatch: ContextCompactionCheckpoint = { ...checkpoint, status: 'hash_mismatch' }
    this.checkpoint = mismatch
    await this.storage.write(
      storageKey(`ctxcp_${ref.projectId}_${checkpoint.sessionId}`),
      mismatch,
    )
    return mismatch
  }

  private contextKey(projectId: string): string {
    return storageKey(`ctx_${projectId}`)
  }

  private enqueueWrite(key: string, task: () => Promise<unknown>): Promise<unknown> {
    const previous = this.writeQueues.get(key) || Promise.resolve()
    const next = previous.then(task, task)
    this.writeQueues.set(key, next.catch(() => undefined))
    return next
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

  buildOutlineContextPack(outline: unknown, selectedText?: unknown): string {
    return buildOutlineContextPack(clean(outline), clean(selectedText))
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
        outline: workspaceState.outline ?? project.outline,
        outlineContextPack: workspaceState.outlineContextPack
          ?? buildOutlineContextPack(
            workspaceState.outline ?? project.outline ?? '',
            workspaceState.selectedText ?? input.selectedText ?? project.selectedText ?? ''
          ),
        selectedText: clip(workspaceState.selectedText ?? input.selectedText ?? project.selectedText, MAX_SELECTED_TEXT_CHARS),
        editorContent: workspaceState.editorContent !== undefined ? workspaceState.editorContent : undefined,
        referenceOutline: workspaceState.referenceOutline !== undefined ? workspaceState.referenceOutline : undefined,
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
        ...(input.previousSkillOutput !== undefined ? { previousSkillOutput: input.previousSkillOutput } : {}),
        ...(input.toolAudit !== undefined ? { toolAudit: input.toolAudit } : {})
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
    const toolAudit = toolAuditMessage(bundle)
    if (toolAudit) output.push(toolAudit)

    const history = policy.chatHistory === 'full'
      ? compactedMessages(bundle.session.recentMessages)
      : bundle.session.recentMessages
    const compactionMarker = [...bundle.session.recentMessages].reverse()
      .find((message: ContextMessage) => isCompactionMarker(message))
    if (policy.chatHistory === 'summary' && bundle.session.summary) {
      const compacted = compactedMessages(bundle.session.recentMessages)
      const latestMarker = [...bundle.session.recentMessages].reverse()
        .find((message: ContextMessage) => isCompactionMarker(message))
      const summaryContent = latestMarker?.content || bundle.session.summary
      output.push({ role: 'system', content: `[会话摘要]\n${summaryContent}` })
    } else if (policy.chatHistory === 'recent') {
      if (compactionMarker) output.push(compactionMarker)
      output.push(...recentMessages(
        history.filter(message => !isCompacted(message)),
        policy.recentTurns,
      ))
    } else if (policy.chatHistory === 'full') {
      if (compactionMarker) output.push(compactionMarker)
      output.push(...history)
    }

    if (bundle.execution.previousSkillOutput !== undefined) {
      output.push({ role: 'user', content: `[上一步 SKILL 完整输出]\n${bundle.execution.previousSkillOutput}` })
    }
    output.push(...earlierBase)
    if (current) output.push(current)
    return output
  }

  compactContext(
    messages: ContextMessage[],
    budget?: ContextBudget,
    workspace?: ContextWorkspace,
    requestReservedOutputTokens?: number | null,
  ): ContextCompactionResult {
    const routed = workspace ? this.routedCompaction.get(workspace) : undefined
    const requestBudget = Number(requestReservedOutputTokens)
    const hasRequestBudget = Number.isFinite(requestBudget) && requestBudget > 0
    const effectiveBudget = hasRequestBudget
      ? {
          ...(budget || routed?.budget || this.compaction.budget),
          reservedOutputTokens: requestBudget,
        }
      : (budget || routed?.budget || this.compaction.budget)
    const observer = routed?.observer || this.compaction.observer
    const allowed = allowedInputTokens(effectiveBudget)
    const history = compactedMessages(messages)
    const beforeChars = history.reduce((total, message) => total + message.content.length, 0)
    const estimatedBeforeTokens = messageTokens(history)
    const none: ContextCompactionResult = {
      performed: false,
      strategy: 'none',
      compactedMessageCount: 0,
      retainedMessageCount: history.length,
      beforeChars,
      afterChars: beforeChars,
      estimatedBeforeTokens,
      estimatedAfterTokens: estimatedBeforeTokens,
      allowedInputTokens: allowed,
    }
    if (allowed === undefined) {
      observer?.onContextCompactionSkipped?.({ ...none, reason: 'unknown-window' })
      observer?.onContextCompactionLifecycle?.({
        stage: 'window_switch',
        workspace: workspace || 'main',
        sessionId: '',
        status: 'failed',
        detail: 'unknown-window: compaction skipped',
        usageSource: 'unavailable',
      })
      return { ...none, reason: 'unknown-window' }
    }
    if (history.length <= DEFAULT_PRESERVE_RECENT_MESSAGES) return { ...none }
    if (estimatedBeforeTokens <= allowed) {
      return { ...none, reason: undefined }
    }

    let cutIndex = history.findIndex(isRealUserInput)
    if (cutIndex < 0) cutIndex = 0
    cutIndex = Math.max(cutIndex, history.length - DEFAULT_PRESERVE_RECENT_MESSAGES)
    cutIndex = Math.min(cutIndex, history.length - DEFAULT_PRESERVE_RECENT_MESSAGES)
    const compacted = history.slice(0, cutIndex)
    const retained = history.slice(cutIndex)
    if (!compacted.length) return { ...none, reason: 'budget-exceeded' }

    const compactionId = `ctx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const summary = buildHistorySummary(compacted)
    const marker = markerMessage(compacted.length, compactionId)
    const effectiveSummary = summary ? `${summary}\n\n` : ''
    marker.content = `${effectiveSummary}${marker.content}`
    const afterMessages = [marker, ...retained]
    if (messageTokens(afterMessages) > estimatedBeforeTokens) {
      // In an impossibly small window, keep only the protected tail and a short marker.
      marker.content = marker.content.slice(-MAX_MARKER_FALLBACK_CHARS)
    }
    const finalAfterMessages = [marker, ...retained]
    const afterChars = finalAfterMessages.reduce((total, message) => total + message.content.length, 0)
    const result: ContextCompactionResult = {
      performed: true,
      strategy: 'marker-truncation',
      reason: 'budget-exceeded',
      compactedMessageCount: compacted.length,
      retainedMessageCount: retained.length,
      retainedMessages: retained,
      summary: summary || undefined,
      markerMessage: marker,
      beforeChars,
      afterChars,
      estimatedBeforeTokens,
      estimatedAfterTokens: messageTokens(finalAfterMessages),
      allowedInputTokens: allowed,
    }
    observer?.onContextCompacted?.(result)
    return result
  }

  /**
   * 统一 ContextPack 的结构化描述。assembleMessages 继续负责提示词，
   * 这里描述实际注入的数据形状，供三入口契约校验与运行记录消费。
   */
  buildDialogueContextBlocks(
    bundle: ContextBundle,
    policy: ContextPolicy,
  ): DialogueContextBlock[] {
    const blocks: DialogueContextBlock[] = []
    const outline = clean(bundle.workspace.outline)
    if (outline) {
      const pack = bundle.workspace.outlineContextPack || buildOutlineContextPack(outline, bundle.workspace.selectedText || '')
      blocks.push({
        source: 'outline',
        version: contentVersion(pack),
        coverage: 'structure_map',
        content: pack,
      })
    }
    const editorContent = clean(bundle.workspace.editorContent)
    if (editorContent) {
      const injectionMode = editorContextInjectionMode(editorContent.length)
      blocks.push({
        source: 'editorContent',
        version: contentVersion(editorContent),
        coverage: injectionMode,
        ...(injectionMode === 'packed' ? { truncated: true } : {}),
        content: injectionMode === 'full'
          ? editorContent
          : buildMainEditorContextPack({
            label: '当前编辑目标',
            content: editorContent,
            selection: { selectionStart: 0, selectionEnd: 0, selectedText: '' },
          }),
      })
    }
    const referenceOutline = clean(bundle.workspace.referenceOutline)
    if (referenceOutline) {
      blocks.push({
        source: 'referenceOutline',
        version: contentVersion(referenceOutline),
        coverage: 'reference',
        content: referenceOutline,
      })
    }
    if (policy.includeSettings && bundle.workspace.settings) {
      const settings = clean(JSON.stringify(bundle.workspace.settings))
      if (settings && settings !== '{}') {
        blocks.push({
          source: 'settings',
          version: contentVersion(settings),
          coverage: 'full',
          content: settings,
        })
      }
    }
    if (policy.includeMemory && bundle.workspace.memories) {
      const memories = clean(bundle.workspace.memories)
      const truncated = memories.length > MAX_MEMORY_CHARS
      blocks.push({
        source: 'memory',
        version: contentVersion(memories),
        coverage: truncated ? 'partial' : 'full',
        content: truncated ? `${memories.slice(0, MAX_MEMORY_CHARS)}…` : memories,
        ...(truncated ? { truncated: true } : {}),
      })
    }
    const selection = clean(bundle.workspace.selectedText)
    if (selection) {
      const truncated = selection.length > MAX_SELECTED_TEXT_CHARS
      blocks.push({
        source: 'selection',
        version: contentVersion(selection),
        coverage: 'selection',
        content: truncated ? `${selection.slice(0, MAX_SELECTED_TEXT_CHARS)}…` : selection,
        ...(truncated ? { truncated: true } : {}),
      })
    }
    if (bundle.workspace.activeTab) {
      blocks.push({
        source: 'activeTab',
        version: contentVersion(bundle.workspace.activeTab),
        coverage: 'structure_map',
      })
    }
    const validation = validateDialogueContextBlocks(blocks)
    if (!validation.valid) {
      throw new Error('ContextPack 结构校验失败：' + validation.errors.join('；'))
    }
    return blocks
  }

  async recordTurn(ref: ContextRef, turn: ContextTurn): Promise<void> {
    const id = sessionIdFor(ref)
    const now = Date.now()
    const turnMeta = turn.meta ? clone(turn.meta) : undefined
    const routedObserver = this.routedCompaction.get(ref.workspace)?.observer || this.compaction.observer
    const lifecycle = (event: Parameters<NonNullable<ContextCompactionObserver['onContextCompactionLifecycle']>>[0]) => {
      routedObserver?.onContextCompactionLifecycle?.({
        ...event,
        workspace: ref.workspace,
        sessionId: id,
      })
    }
    let lifecycleEnabled = false
    const result = await this.enqueueWrite(this.contextKey(ref.projectId), async () => {
      const state = await this.readState(ref.projectId)
      const id = sessionIdFor(ref)
      let session = state.sessions.find(item => item.id === id && sameScope(item, ref))
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
        { role: 'assistant', content: turn.assistant, ts: now, ...(turnMeta ? { meta: turnMeta } : {}) }
      )
      const routedBudget = this.routedCompaction.get(ref.workspace)?.budget || this.compaction.budget
      const allowedTokens = allowedInputTokens({
        ...routedBudget,
        ...(turn.reservedOutputTokens != null ? { reservedOutputTokens: turn.reservedOutputTokens } : {}),
      })
      const history = compactedMessages(session.messages)
      const estimatedTokens = messageTokens(history)
      const turnCheckpointContext = {
        ...(this.checkpointContext.goal ? { goal: this.checkpointContext.goal } : {}),
        ...(this.checkpointContext.keyFacts?.length ? { keyFacts: this.checkpointContext.keyFacts } : {}),
        ...(this.checkpointContext.hardConstraints?.length ? { hardConstraints: this.checkpointContext.hardConstraints } : {}),
        ...(this.checkpointContext.openQuestions?.length ? { openQuestions: this.checkpointContext.openQuestions } : {}),
        ...(this.checkpointContext.necessaryFragments?.length ? { necessaryFragments: this.checkpointContext.necessaryFragments } : {}),
        ...(this.checkpointContext.toolState && Object.keys(this.checkpointContext.toolState).length ? { toolState: this.checkpointContext.toolState } : {}),
        ...(typeof turn.meta?.goal === 'string' ? { goal: turn.meta.goal } : {}),
        ...(Array.isArray(turn.meta?.keyFacts) ? { keyFacts: turn.meta.keyFacts.map(String) } : {}),
        ...(Array.isArray(turn.meta?.hardConstraints) ? { hardConstraints: turn.meta.hardConstraints.map(String) } : {}),
        ...(Array.isArray(turn.meta?.openQuestions) ? { openQuestions: turn.meta.openQuestions.map(String) } : {}),
        ...(Array.isArray(turn.meta?.necessaryFragments) ? { necessaryFragments: turn.meta.necessaryFragments.map(String) } : {}),
        ...(turn.meta?.toolState && typeof turn.meta.toolState === 'object' ? { toolState: turn.meta.toolState as Record<string, unknown> } : {}),
      }
      // Metadata must inherit across turns: compaction may only trigger after the turn
      // that originally carried goal/facts/constraints has already completed.
      this.checkpointContext = turnCheckpointContext
      const willCompact = Boolean(
        allowedTokens !== undefined
        && history.length > DEFAULT_PRESERVE_RECENT_MESSAGES
        && estimatedTokens > allowedTokens
      )
      if (!willCompact && allowedTokens === undefined) {
        routedObserver?.onContextCompactionSkipped?.({
          performed: false,
          strategy: 'none',
          reason: 'unknown-window',
          compactedMessageCount: 0,
          retainedMessageCount: history.length,
          beforeChars: history.reduce((total, message) => total + message.content.length, 0),
          afterChars: history.reduce((total, message) => total + message.content.length, 0),
          estimatedBeforeTokens: estimatedTokens,
          estimatedAfterTokens: estimatedTokens,
          allowedInputTokens: allowedTokens,
        })
      }
      let checkpoint: ContextCompactionCheckpoint | null = null
      if (willCompact) {
        lifecycleEnabled = true
        lifecycle({
          stage: 'pre_compact',
          status: 'success',
          detail: `beforeTokens=${estimatedTokens}; allowedTokens=${allowedTokens}; messageCount=${history.length}`,
          usageSource: 'estimated',
        })
        lifecycle({
          stage: 'summarizing',
          status: 'success',
          detail: 'preserve recent turns and generate non-destructive summary',
          usageSource: 'estimated',
        })
        checkpoint = await this.saveCompactionCheckpoint(ref, {
          summary: session.summary,
          ...turnCheckpointContext,
        })
        lifecycle({
          stage: 'checkpoint',
          status: checkpoint ? 'success' : 'failed',
          ...(checkpoint ? { checkpointId: checkpoint.checkpointId, compactionId: checkpoint.compactionId } : {}),
          detail: checkpoint
            ? `saved messageCount=${checkpoint.messageCount}; hash=${checkpoint.contentHash}`
            : 'checkpoint storage write failed; keep original history',
          usageSource: 'estimated',
        })
      }
      const compaction = checkpoint
        ? this.compactContext(
        session.messages,
        undefined,
        ref.workspace,
        turn.reservedOutputTokens,
      )
        : { performed: false } as ContextCompactionResult
      if (lifecycleEnabled && !compaction.performed) {
        lifecycle({
          stage: 'checkpoint_failed',
          status: 'failed',
          ...(checkpoint ? { checkpointId: checkpoint.checkpointId, compactionId: checkpoint.compactionId } : {}),
          detail: 'compaction did not perform after checkpoint; original history retained',
        })
      }
      if (compaction.performed && compaction.markerMessage) {
        const compactionId = String(
          (compaction.markerMessage.meta?.compactionMarker as ContextCompactionMarker | undefined)?.compactionId || ''
        )
        const reason: ContextMessageCompaction['reason'] = compaction.strategy === 'summary' ? 'summary' : 'budget'
        const markerData = compaction.markerMessage.meta?.compactionMarker as ContextCompactionMarker | undefined
        if (checkpoint && markerData?.compactionId) {
          markerData.compactionId = checkpoint.compactionId
          compaction.markerMessage.content = compaction.markerMessage.content.replace(
            `compactionId=${compactionId}`,
            `compactionId=${checkpoint.compactionId}`,
          )
        }
        const foldedCompactionId = checkpoint?.compactionId || compactionId
        const retained = compaction.retainedMessages || []
        const retainedIdentities = new Set(retained.map(message => identityKey(message)))
        const folded = session.messages
          .filter(message => !retainedIdentities.has(identityKey(message)))
          .map(message => ({
            ...message,
            meta: {
              ...(message.meta || {}),
              compaction: { compactionId: foldedCompactionId, foldedAt: now, reason },
            },
          }))
        session.messages = [...folded, compaction.markerMessage, ...retained]
        session.summary = compaction.markerMessage.content
      }
      session.messages = session.messages.slice(-MAX_STORED_MESSAGES)
      session.updatedAt = now
      if (checkpoint && compaction.performed) {
        checkpoint.postCompactionHash = checkpointHash(session.messages, session.summary)
        await this.storage.write(
          storageKey(`ctxcp_${ref.projectId}_${checkpoint.sessionId}`),
          checkpoint,
        )
      }
      return this.storage.write(this.contextKey(ref.projectId), state)
    })
    if (result === false) throw new Error(`上下文写盘失败：${this.contextKey(ref.projectId)}`)
    if (lifecycleEnabled && result !== false) {
      const finalCheckpoint = this.getActiveCompactionCheckpoint()
      lifecycle({
        stage: 'post_compact',
        status: 'success',
        ...(finalCheckpoint ? { checkpointId: finalCheckpoint.checkpointId, compactionId: finalCheckpoint.compactionId } : {}),
        detail: 'non-destructive compaction committed',
      })
      lifecycle({
        stage: 'window_switch',
        status: 'success',
        detail: 'next request consumes compacted history',
      })
    }
  }

  async recordEditorEvent(ref: ContextRef, text: string, meta?: Record<string, unknown>): Promise<void> {
    const id = sessionIdFor(ref)
    const now = Date.now()
    const eventMeta = meta ? clone(meta) : undefined
    const result = await this.enqueueWrite(this.contextKey(ref.projectId), async () => {
      const state = await this.readState(ref.projectId)
      const id = sessionIdFor(ref)
      let session = state.sessions.find(item => item.id === id && sameScope(item, ref))
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
      session.messages.push({
        role: 'assistant',
        content: `[AI 编辑] ${text}`,
        ts: now,
        ...(eventMeta ? { meta: eventMeta } : {})
      })
      session.messages = session.messages.slice(-MAX_STORED_MESSAGES)
      session.updatedAt = now
      return this.storage.write(this.contextKey(ref.projectId), state)
    })
    if (result === false) throw new Error(`上下文写盘失败：${this.contextKey(ref.projectId)}`)
  }

  async clearSession(ref: ContextRef): Promise<void> {
    const id = sessionIdFor(ref)
    const now = Date.now()
    const result = await this.enqueueWrite(this.contextKey(ref.projectId), async () => {
      const latest = await this.readState(ref.projectId)
      const session = latest.sessions.find(item => item.id === id && sameScope(item, ref))
      if (!session) return true
      session.messages = []
      delete session.summary
      session.updatedAt = now
      return this.storage.write(this.contextKey(ref.projectId), latest)
    })
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
