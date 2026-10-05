/**
 * Unified AI Service Layer — single entry point for all AI API calls.
 * Routes by purpose, handles stream/non-stream, timeout, retry,
 * JSON repair, thinking-tag filter, diagnostics logging.
 *
 * Step 3: full implementation.
 */

import {
  buildChatUrl,
  buildModelsUrl,
  buildAuthHeaders,
  resolveModel,
  resolveTemperature,
  resolveMaxTokens,
  resolveModelCapabilityForProvider,
  extractNonStreamText,
  extractStreamDelta,
  extractFinishReason,
  resolveFinishReason,
  isSSEDataLine,
  isSSEDone,
  type ProviderLike,
} from './providerAdapter'
import type { ModelCapability } from './modelCapability'
import {
  buildUsageReconciliation,
  resolveContextBudget,
  type ContextBudgetResult,
  type UsageReconciliation,
} from './contextBudget'
import {
  buildProviderChatUrl,
  buildProviderHeaders,
  buildProviderModelsUrl,
  buildProviderModelsHeaders,
  getProviderProtocol,
  httpErrorMessage,
  extractProviderErrorSummary,
  readErrorBody,
  sanitizeUrlForLog,
  normalizeProviderType,
} from './providerProtocols'
import { resolveProvider, type ProviderStoreLike } from './providerRouter'
import {
  validateAgentToolInput,
  type AgentToolDefinition,
  type ToolResult,
} from './editorTools'
import type { LongDocumentExecutionPlan } from './longDocumentExecutionPlanner'
import {
  buildProviderTools,
  buildToolResultChatMessages,
  extractProviderToolCalls,
  supportsNativeTools,
  type NormalizedToolCall,
  type ProviderToolMessage,
} from './providerTools'
import { buildCrossTurnToolAudit } from './crossTurnToolAudit'
import {
  collectLongDocumentWriteCoverage,
  summarizeLongDocumentWriteCoverage,
} from './longDocumentWriteCoverage'
import { getToolLoopPolicy, normalizeToolIterations } from './toolLoopPolicy'
import {
  buildEditorWriteProtocolPrompt,
  parseEditorWriteProtocol,
} from './editorEditProtocol'
import { buildLongDocumentWriteDirective } from './longDocumentWriteProtocol'
import {
  resolveEditorToolProtocolVersion,
} from './editorTools'
import { EDITOR_EDIT_PROTOCOL_VERSION } from './editorEditSemantics'
import type { DialogueIntent } from './dialogueFoundation'
import type { DialoguePermissionDecision } from './dialogueToolSurface'
import { extractJsonCandidates } from './jsonExtraction'
import {
  normalizeUsage as normalizeTraceUsage,
} from './traceFieldNormalizer'

// ── Types (carried from Step 2 interface) ──────────────────────────

export type ProviderPurpose = 'generate' | 'rewrite' | 'verify' | 'detect' | 'image' | 'video'

export interface AiServiceError {
  kind: 'network' | 'timeout' | 'http' | 'json' | 'auth' | 'canceled'
  message: string
  providerId?: string
  purpose?: ProviderPurpose
  statusCode?: number
  providerErrorSummary?: string
}

export class AiServiceErrorImpl extends Error implements AiServiceError {
  kind: AiServiceError['kind']
  providerId?: string
  purpose?: ProviderPurpose
  statusCode?: number
  providerErrorSummary?: string
  constructor(params: AiServiceError) {
    super(params.message)
    this.name = 'AiServiceError'
    this.kind = params.kind
    this.providerId = params.providerId
    this.purpose = params.purpose
    this.statusCode = params.statusCode
    this.providerErrorSummary = params.providerErrorSummary
  }
}

export interface CallAiParams {
  purpose: ProviderPurpose
  messages: Array<ProviderToolMessage>
  /** Request-level provider override; used for stalled final-draft segment retries. */
  providerId?: string
  model?: string
  temperature?: number
  /** Null means the output limit is undeclared and must be omitted from provider requests. */
  maxTokens?: number | null
  /** Protocol-level request control for providers whose thinking consumes the output budget. */
  reasoning?: {
    mode: 'off'
  }
  /** Marks a request as a deliberate validity retry; recorded in diagnostics and run traces. */
  retryStrategy?: 'thinking_disabled' | 'max_tokens_raised' | 'prompt_only'
  jsonMode?: boolean
  stream?: boolean
  signal?: AbortSignal
  /** User cancellation; kept separate from logical deadline signals such as a supervisor timeout. */
  cancelSignal?: AbortSignal
  tools?: AgentToolDefinition[]
  toolPolicy?: {
    scenario?: 'direct' | 'direct-tool-intensive' | 'folder-chain' | 'compatibility-json'
    maxToolIterations?: number
    intent?: DialogueIntent
    /** Single-source permission decision; execution authorization never comes from SKILL. */
    permissionDecision?: DialoguePermissionDecision
    /** True while the entry-level edit-task workflow owns editor writes. */
    editTaskWorkflow?: boolean
    /** Single-source execution plan used for steering and tool policy. */
    executionPlan?: LongDocumentExecutionPlan
    onCompatibilityMode?: (reason: string) => void
    onConvergenceStart?: () => void
    onConvergencePseudoCall?: (event: { text: string; reason: string }) => void
    onConvergenceCorrected?: () => void
    onConvergenceLocalFallback?: (reason: string) => void
    onToolWarning?: (message: string) => void
    onPermissionDenied?: (event: {
      toolName: string
      policy: 'read' | 'write'
      intent?: DialogueIntent
      permissionDecision?: DialoguePermissionDecision
      writeMode: 'direct'
      reason: string
      durationMs: number
    }) => void
    onRepeatedWriteBlocked?: (event: {
      toolName: string
      input: unknown
      repeatCount: number
    }) => void
    onToolStart?: (event: {
      toolName: string
      policy: 'read' | 'write'
      iteration: number
      input: unknown
    }) => void
    onToolCall?: (event: {
      toolName: string
      toolCallId?: string
      policy: 'read' | 'write'
      iteration: number
      input: unknown
      result: ToolResult
      durationMs: number
      protocolVersion?: number
      protocolVersionDefaulted?: boolean
      toolCapability?: 'native_tools' | 'json_protocol'
      rejectionCategory?: ToolRejectionCategory
      defaultToolPolicy?: AgentToolDefinition['defaultToolPolicy']
      riskLevel?: AgentToolDefinition['riskLevel']
    }) => void
  }
  /** Explicit timeout; null means "no application-side timeout" (long-document runs). */
  timeoutMs?: number | null
  /**
   * Slow-stream tolerance. Final-draft generation explicitly opts in: the
   * task-level throughput monitor owns stall/retry decisions, so transport
   * watchdogs must not kill a stream merely because it is slow.
   */
  slowStreamTolerant?: boolean
  retry?: boolean
  /** @internal Suppresses tool-protocol-looking stream output for tool-related convergence requests. */
  suppressToolProtocolStream?: boolean
  /** @internal Used by tool-loop and downgrade wrappers to classify physical requests. */
  physicalPhase?: PhysicalCallEvent['phase']
  /** @internal Wraps the caller's onChunk to capture per-request stream deltas. */
  onPhysicalCall?: (event: PhysicalCallEvent) => void
  meta?: {
    source?: string
    projectId?: string
    workspace?: 'main' | 'outline'
    sessionId?: string
    targetId?: string
    readableTargets?: string[]
    step?: number
    skillId?: string
    agentId?: string
    /** Eval case id for with/baseline grading runs. */
    caseId?: string
    ctxTurns?: number
  }
  /** Stream callback contract: receives only the newly emitted text for this chunk. */
  onChunk?: (text: string) => void
  /** Stream callback contract: receives only the newly emitted reasoning text for this chunk. */
  onReasoning?: (text: string) => void
  onUsage?: (usage: any) => void
  onProgress?: (percent: number, label: string) => void
  /** @internal Keep the legacy public path clean; P6 callers receive a typed helper instead. */
}

export interface PhysicalCallEvent {
  /** Stable identity for one physical network request; running/finish records use the same value. */
  physicalCallId?: string
  phase: 'normal' | 'tool_iteration' | 'tool_convergence' | 'downgrade_initial' | 'downgrade_retry' | 'continuation' | 'retry' | 'heartbeat_retry'
  status: 'running' | 'success' | 'failed' | 'canceled'
  attempt: number
  durationMs: number
  requestMessages: CallAiParams['messages']
  responseText: string
  streamText: string
  reasoningText: string
  finishReason?: string
  usage?: any
  /** True when the provider response carried no usage block. */
  usageUnavailable?: boolean
  error?: string
  toolsEnabled: boolean
  toolsDowngraded: boolean
  downgradeReason?: string
  retryStrategy?: 'thinking_disabled' | 'max_tokens_raised' | 'prompt_only'
  /** Effective max_tokens after overrides or a 400 downgrade; null means intentionally omitted. */
  maxTokens?: number | null
  /** Resolved capability provenance; unknown stays unknown instead of becoming a fake cap. */
  modelCapability?: ModelCapability
  /** Pre-request input context budget decision. */
  contextBudget?: ContextBudgetResult
  /** Reconciles estimated input tokens against provider-reported usage. */
  usageReconciliation?: UsageReconciliation
  /** True when a running request is alive but has produced no stream bytes yet. */
  heartbeat?: boolean
  /** Stable classification for transport interruptions delegated to a task layer. */
  interruptionCode?: 'slow_stream_interrupted'
}

export interface CallAiResult {
  text: string
  reasoning: string
  providerId?: string
  model?: string
  durationMs?: number
  usage?: any
  /** True when the provider response carried no usage block. */
  usageUnavailable?: boolean
  finishReason?: string
  /** Why a tool-loop convergence round was requested; distinguishes terminal write failures from discussion convergence. */
  convergenceReason?: string
  toolCalls?: NormalizedToolCall[]
  toolResults?: Array<{ call: { id?: string; name: string; input?: unknown }; result: ToolResult }>
  /** Compact cross-turn audit for the next request's system context. */
  toolAudit?: ReturnType<typeof buildCrossTurnToolAudit>
  /** Initial request plus only the messages appended in later native-tool rounds. */
  toolRequestDeltas?: CallAiParams['messages']
  /** Present when the provider does not support native tools and the JSON protocol path was used. */
  compatibilityMode?: 'json-protocol'
  /** Present when a compatibility-mode response executed editor.write through the unified tool. */
  compatibilityWrite?: boolean
  /** Present when a provider with declared native-tool support rejected tools at request time. */
  toolsDowngraded?: 'json-protocol'
  /** Pre-request input context budget decision for the initial physical call. */
  contextBudget?: ContextBudgetResult
  /** Reconciles estimated input tokens against provider-reported usage. */
  usageReconciliation?: UsageReconciliation
  retryStrategy?: 'thinking_disabled' | 'max_tokens_raised' | 'prompt_only'
  /** Effective max_tokens after overrides, provider defaults, or a 400 downgrade. */
  maxTokens?: number | null
  /** Resolved capability provenance; unknown stays unknown instead of becoming a fake cap. */
  modelCapability?: ModelCapability
  /** @internal Raw provider payload; needed to continue native tool-call loops. */
  raw?: any
}

export interface AiService {
  callAi(params: CallAiParams): Promise<CallAiResult>
  fetchModels(providerId: string): Promise<string[]>
  fetchModelsForProvider(provider: ProviderLike): Promise<string[]>
  testConnection(providerId: string): Promise<{ connected: boolean; error?: string; note?: string }>
  testConnectionForProvider(provider: ProviderLike): Promise<{ connected: boolean; error?: string; note?: string }>
}

// ── Constants ──────────────────────────────────────────────────────

const DEFAULT_NON_STREAM_TIMEOUT = 300_000
const DEFAULT_STREAM_TIMEOUT = 600_000
const RETRY_DELAYS = [1000, 2000, 3000]
const MAX_RETRIES = 3
const IDLE_THRESHOLD = 15_000
const IDLE_THRESHOLD_LOW = 10_000
// A null timeoutMs means "no total deadline"; it must never disable stream
// liveness detection. A provider can leave a half-open connection that emits
// no bytes and no error, so an idle stream is treated as a network drop and
// routed through the physical retry path.
const MAIN_NET_STREAM_IDLE_TIMEOUT_MS = 15 * 60_000
// Some OpenAI-compatible providers keep the socket alive while sending
// protocol-only SSE frames (empty deltas/usage pings). This watchdog only
// resets on content or reasoning progress, so those live-but-silent streams
// still terminate and enter the normal retry path.
const MAIN_NET_STREAM_PROGRESS_TIMEOUT_MS = 20 * 60_000
const HEARTBEAT_INTERVAL = 60_000
const MAX_HEARTBEAT_ATTEMPTS = 3
const PHYSICAL_HEARTBEAT_INTERVAL_MS = 15_000
// A disabled semantic retry still owns one physical reconnect. The main
// process can report a transient stream drop as a failed IPC result; without
// this floor, direct tool rounds turn that transport error into a terminal
// `HTTP undefined` failure.
const NETWORK_RETRY_FLOOR = 1

const TABLE_OUTPUT_GUIDELINE = [
  '如果本次回答需要展示表格，必须使用 GFM 标准表格：',
  '首行为表头；第二行只使用半角 |、短横线和冒号作为分隔行；',
  '每个单元格使用半角 | 分隔，单元格内不换行。',
  '如果没有表格内容，不要输出空表或伪造表格。'
].join('\n')

function withTableOutputGuideline(
  messages: CallAiParams['messages'],
  jsonMode: boolean
): CallAiParams['messages'] {
  if (jsonMode) return messages
  const hasSystem = messages.some(message => message.role === 'system')
  if (hasSystem) {
    return messages.map(message => message.role === 'system'
      ? { ...message, content: `${message.content}\n\n${TABLE_OUTPUT_GUIDELINE}` }
      : message
    )
  }
  return [{ role: 'system', content: TABLE_OUTPUT_GUIDELINE }, ...messages]
}

function withEditorWriteProtocol(
  messages: CallAiParams['messages'],
  executionPlan?: LongDocumentExecutionPlan | null,
): CallAiParams['messages'] {
  const prompt = buildEditorWriteProtocolPrompt(executionPlan)
  const systemIndex = messages.findIndex(message => message.role === 'system')
  if (systemIndex >= 0) {
    return messages.map((message, index) => index === systemIndex
      ? { ...message, content: `${message.content}\n\n${prompt}` }
      : message
    )
  }
  return [{ role: 'system', content: prompt }, ...messages]
}

function hasEditorWriteTool(params: CallAiParams): boolean {
  return params.tools?.some(tool => tool.name === 'editor.write') ?? false
}

function isFinalDraftPlan(params: CallAiParams): boolean {
  return params.toolPolicy?.executionPlan?.mode === 'final-draft'
}

function resolveFinalDraftToolSurface(params: CallAiParams): CallAiParams {
  if (!isFinalDraftPlan(params)) return params
  return {
    ...params,
    tools: (params.tools || []).filter(tool => tool.policy !== 'write'),
  }
}

function stableToolSignature(value: unknown): string {
  const sortValue = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(sortValue)
    if (item && typeof item === 'object') {
      return Object.keys(item as Record<string, unknown>)
        .sort()
        .reduce((result, key) => {
          result[key] = sortValue((item as Record<string, unknown>)[key])
          return result
        }, {} as Record<string, unknown>)
    }
    return item
  }
  try {
    return JSON.stringify(sortValue(value))
  } catch {
    return String(value)
  }
}

export type ConvergenceTextVerdict =
  | { kind: 'usable'; text: string }
  | { kind: 'pseudo_tool_call'; text: string; reason: string }
  | { kind: 'empty_or_failed'; text: string }

const CONVERGENCE_PSEUDO_CALL_START = [
  /^\s*<tool_?calls?>/i,
  /^\s*```(?:json|tool)?/i,
  /^\s*\{/,
  /^\s*(?:tool|function)[ _-]?call\s*[:=]/i,
  /^\s*(?:我将|现在|接下来)?(?:调用|执行|使用)\s*(?:工具|editor\.)/,
]

function looksLikeToolCallEnvelope(text: string): boolean {
  if (!text.startsWith('{')) return false
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>
    const hasToolName = typeof parsed.name === 'string' || typeof parsed.tool === 'string'
    const hasArguments = 'arguments' in parsed || 'parameters' in parsed
    return hasToolName && hasArguments
  } catch {
    return /["'](?:name|tool)["']\s*:/.test(text) && /["'](?:arguments|parameters)["']\s*:/.test(text)
  }
}

export function judgeConvergenceText(input: { text?: string | null }): ConvergenceTextVerdict {
  const text = String(input?.text || '').trim()
  if (!text) return { kind: 'empty_or_failed', text }
  const startsAsPseudoCall = CONVERGENCE_PSEUDO_CALL_START.some(pattern => pattern.test(text))
  const mentionsToolProtocol = /tool[_ -]?call|<tool_?call|function[._ -]?call|调用工具|我将调用|editor\.write\s*\(/i.test(text)
    || looksLikeToolCallEnvelope(text)
  const hasBalancedBrackets = (text.includes('(') && text.includes(')'))
    || (text.includes('（') && text.includes('）'))
  if (text.length < 500 && startsAsPseudoCall && mentionsToolProtocol && (hasBalancedBrackets || text.length < 160)) {
    return {
      kind: 'pseudo_tool_call',
      text,
      reason: 'convergence response looks like a tool-call protocol fragment instead of natural language',
    }
  }
  return { kind: 'usable', text }
}

/**
 * M72 single-source guard: keeps tool-call protocol text out of UI streams on
 * every tool-related path (native tools, compatibility JSON, and downgrade).
 * Tool identity and results must only surface via RunTrace and `tool-activity`.
 */
function createToolStreamGuard() {
  return {
    buffer: '',
    suppressed: false,
    reset() {
      this.buffer = ''
      this.suppressed = false
    },
    push(delta: string): string {
      if (!delta) return ''
      if (this.suppressed) return ''
      this.buffer += delta
      const braceIndex = this.buffer.indexOf('{')
      const fenceIndex = this.buffer.indexOf('```')
      const candidates = [braceIndex, fenceIndex].filter(index => index >= 0)
      const toolTokenIndex = candidates.length ? Math.min(...candidates) : -1
      if (toolTokenIndex < 0) {
        const emit = this.buffer
        this.buffer = ''
        return emit
      }
      if (toolTokenIndex === 0) {
        this.suppressed = true
        this.buffer = ''
        return ''
      }
      const emit = this.buffer.slice(0, toolTokenIndex)
      this.buffer = this.buffer.slice(toolTokenIndex)
      return emit
    },
    flush(): string {
      const emit = this.suppressed ? '' : this.buffer
      this.buffer = ''
      return emit
    },
  }
}

function createRepeatedWriteGuard(
  policy: CallAiParams['toolPolicy'],
) {
  const threshold = 3
  let lastSignature = ''
  let repeatCount = 0
  const shouldBlock = (input: unknown, toolName = 'editor.write'): boolean => {
    const signature = stableToolSignature(input)
    if (signature !== lastSignature) {
      lastSignature = signature
      repeatCount = 1
      return false
    }
    repeatCount += 1
    if (repeatCount < threshold) return false
    policy?.onRepeatedWriteBlocked?.({
      toolName,
      input,
      repeatCount,
    })
    lastSignature = ''
    repeatCount = 0
    return true
  }
  const record = (input: unknown, ok: boolean): void => {
    if (ok) return
    lastSignature = ''
    repeatCount = 0
  }
  return { shouldBlock, record }
}

type RepeatedWriteGuard = ReturnType<typeof createRepeatedWriteGuard>

function hasModelCorrectableToolFailure(
  results: Array<{ call: NormalizedToolCall; result: ToolResult }>,
): boolean {
  // These failures tell the model exactly how to fix the next tool call.
  // Read-only convergence must not strip the tool surface in that state,
  // otherwise an ambiguous target can never be disambiguated.
  const correctableCodes = new Set([
    'ambiguous_target',
    'target_not_found',
    'invalid_input',
    'missing_field',
    'tool_not_found',
    'integrity_failed',
    'heading_deletion_requires_user_confirmation',
    'operation_not_allowed_by_execution_plan',
  ])
  return results.some(item => item.result.ok === false
    && correctableCodes.has(item.result.error?.code || ''))
}

const TERMINAL_WRITE_FAILURE_CODES = new Set([
  'permission_denied',
  'document_too_large_for_whole_replacement',
  'invariant_violation',
  'write_target_mismatch',
  'final_draft_mode_active',
])

function findTerminalWriteFailure(
  results: Array<{ call: NormalizedToolCall; result: ToolResult }>,
): { call: NormalizedToolCall; result: ToolResult } | undefined {
  // A correctable error means the model still has a meaningful next tool
  // call; stripping the tool surface there would strand an ambiguous target.
  return results.find(item =>
    item.call.name === 'editor.write'
    && item.result.ok === false
    && !hasModelCorrectableToolFailure([item])
    && TERMINAL_WRITE_FAILURE_CODES.has(item.result.error?.code || ''))
}

function getCompatibilityWriteGuard(
  guards: Map<string, RepeatedWriteGuard>,
  params: CallAiParams,
): RepeatedWriteGuard {
  const scope = [
    params.meta?.projectId || params.meta?.source || 'unknown-project',
    params.meta?.workspace || 'unknown-workspace',
    params.meta?.targetId || 'unknown-target',
    params.meta?.sessionId || 'unknown-session',
  ].join('::')
  let guard = guards.get(scope)
  if (!guard) {
    if (guards.size >= 100) {
      const oldestScope = guards.keys().next().value
      if (oldestScope !== undefined) guards.delete(oldestScope)
    }
    guard = createRepeatedWriteGuard(params.toolPolicy)
    guards.set(scope, guard)
  }
  else if (guards.delete(scope)) {
    guards.set(scope, guard)
  }
  return guard
}

function evaluateWritePermission(
  params: CallAiParams,
  tool: AgentToolDefinition,
): ToolResult | null {
  if (tool.policy !== 'write') return null
  const policy = params.toolPolicy
  if (!policy?.intent) {
    return {
      ok: false,
      error: {
        code: 'permission_denied',
        message: '编辑器写入请求缺少意图上下文，已拒绝执行',
      },
    }
  }
  if (policy.intent !== 'edit' && policy.intent !== 'generate') {
    return {
      ok: false,
      error: {
        code: 'permission_denied',
        message: `当前意图 ${policy.intent} 不允许编辑器写入`,
      },
    }
  }
  return null
}

export type ToolRejectionCategory =
  | 'unknown_tool'
  | 'schema_invalid'
  | 'permission_denied'
  | 'range_invalid'
  | 'invalid_protocol'
  | 'other'

export function classifyToolRejection(result: ToolResult): ToolRejectionCategory | undefined {
  if (result.ok) return undefined
  switch (result.error?.code) {
    case 'tool_not_found':
      return 'unknown_tool'
    case 'invalid_input':
    case 'missing_field':
      return 'schema_invalid'
    case 'permission_denied':
      return 'permission_denied'
    case 'invalid_range':
    case 'range_too_large':
    case 'section_not_found':
      return 'range_invalid'
    case 'unsupported_protocol_version':
      return 'invalid_protocol'
    default:
      return 'other'
  }
}

function compatibilityEditorWriteText(
  response: CallAiResult,
  compatibilityWrite: { call: NormalizedToolCall; result: ToolResult } | null,
): string {
  if (!compatibilityWrite) return response.text || ''
  const commandCount = Array.isArray((compatibilityWrite.call.input as { commands?: unknown } | undefined)?.commands)
    ? ((compatibilityWrite.call.input as { commands: unknown[] }).commands.length)
    : 0
  if (compatibilityWrite.result.ok) {
    return `已通过兼容模式直写编辑器：${commandCount} 条修改已执行。`
  }
  return `兼容模式直写未执行：${compatibilityWrite.result.error?.message || '未知错误'}`
}

async function executeCompatibilityEditorWrite(
  response: CallAiResult,
  params: CallAiParams,
  logger: DiagnosticLogLike | null,
  providerId: string,
  model: string,
  iteration = 1,
  guardRegistry?: Map<string, RepeatedWriteGuard>
): Promise<{ call: NormalizedToolCall; result: ToolResult } | null> {
  const writeTool = params.tools?.find(tool => tool.name === 'editor.write')
  if (!writeTool) return null
  const request = parseEditorWriteProtocol(response.text || '')
  if (!request) return null

  const input = {
    commands: request.commands,
    reveal: request.reveal,
    reason: request.reason,
  }
  const compatibilityProtocolResolution = resolveEditorToolProtocolVersion(input)
  const call: NormalizedToolCall = {
    id: `compatibility-write-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: writeTool.name,
    input,
  }
  const started = Date.now()
  const permissionError = evaluateWritePermission(params, writeTool)
  if (permissionError) {
    params.toolPolicy?.onToolStart?.({
      toolName: writeTool.name,
      policy: writeTool.policy,
      iteration,
      input,
    })
    params.toolPolicy?.onPermissionDenied?.({
      toolName: writeTool.name,
      policy: writeTool.policy,
      intent: params.toolPolicy?.intent,
      permissionDecision: params.toolPolicy?.permissionDecision,
      writeMode: 'direct',
      reason: permissionError.error?.message || '编辑器写入权限不足',
      durationMs: Date.now() - started,
    })
    logToolRequest(logger, {
      purpose: params.purpose,
      providerId,
      model,
      toolName: writeTool.name,
      iteration,
      input,
      result: permissionError,
      durationMs: Date.now() - started,
      toolCapability: 'json_protocol',
    })
    params.toolPolicy?.onToolCall?.({
      toolName: writeTool.name,
      toolCallId: call.id,
      policy: writeTool.policy,
      iteration,
      input,
      result: permissionError,
      durationMs: Date.now() - started,
      protocolVersion: compatibilityProtocolResolution.version,
      protocolVersionDefaulted: compatibilityProtocolResolution.defaulted,
      toolCapability: 'json_protocol',
      rejectionCategory: classifyToolRejection(permissionError),
      defaultToolPolicy: writeTool.defaultToolPolicy,
      riskLevel: writeTool.riskLevel,
    })
    return {
      call,
      result: permissionError,
    }
  }
  const repeatedWriteGuard = guardRegistry
    ? getCompatibilityWriteGuard(guardRegistry, params)
    : createRepeatedWriteGuard(params.toolPolicy)
  if (repeatedWriteGuard.shouldBlock(input, writeTool.name)) {
    const result: ToolResult = {
      ok: false,
      error: {
        code: 'duplicate_write_blocked',
        message: '检测到连续 3 次完全相同的编辑器写入请求，本次重复写入已拦截。请不要重复提交同一批修改，基于已写入结果输出总结或调整参数。',
      },
    }
    params.toolPolicy?.onToolStart?.({
      toolName: writeTool.name,
      policy: writeTool.policy,
      iteration,
      input,
    })
    params.toolPolicy?.onToolCall?.({
      toolName: writeTool.name,
      toolCallId: call.id,
      policy: writeTool.policy,
      iteration,
      input,
      result,
      durationMs: Date.now() - started,
      protocolVersion: compatibilityProtocolResolution.version,
      protocolVersionDefaulted: compatibilityProtocolResolution.defaulted,
      toolCapability: 'json_protocol',
      rejectionCategory: classifyToolRejection(result),
      defaultToolPolicy: writeTool.defaultToolPolicy,
      riskLevel: writeTool.riskLevel,
    })
    logToolRequest(logger, {
      purpose: params.purpose,
      providerId,
      model,
      toolName: writeTool.name,
      iteration,
      input,
      result,
      durationMs: Date.now() - started,
      toolCapability: 'json_protocol',
    })
    return { call, result }
  }
  const context = {
    projectId: params.meta?.projectId || params.meta?.source || 'unknown-project',
    workspace: params.meta?.workspace || 'main',
    targetId: params.meta?.targetId || 'unknown-target',
    readableTargets: params.meta?.readableTargets || (params.meta?.targetId ? [params.meta.targetId] : []),
    writableTarget: params.meta?.targetId || 'unknown-target',
    sessionId: params.meta?.sessionId || params.meta?.source || 'unknown-session',
    iteration,
    abortSignal: params.signal,
  }
  const invalidInput = validateAgentToolInput(writeTool, input)
  if (invalidInput) {
    params.toolPolicy?.onToolCall?.({
      toolName: writeTool.name,
      toolCallId: call.id,
      policy: writeTool.policy,
      iteration,
      input,
      result: invalidInput,
      durationMs: Date.now() - started,
      protocolVersion: compatibilityProtocolResolution.version,
      protocolVersionDefaulted: compatibilityProtocolResolution.defaulted,
      toolCapability: 'json_protocol',
      rejectionCategory: classifyToolRejection(invalidInput),
      defaultToolPolicy: writeTool.defaultToolPolicy,
      riskLevel: writeTool.riskLevel,
    })
    return { call, result: invalidInput }
  }
  const durationMs = Date.now() - started
  params.toolPolicy?.onToolStart?.({
    toolName: writeTool.name,
    policy: writeTool.policy,
    iteration,
    input,
  })
  const result = await writeTool.execute(input, context)
  const actualDurationMs = Date.now() - started
  repeatedWriteGuard.record(input, result.ok)
  params.onPhysicalCall?.({
    phase: 'tool_iteration',
    status: result.ok ? 'success' : 'failed',
    attempt: 1,
    durationMs,
    requestMessages: [{
      role: 'tool',
      content: JSON.stringify(input),
      toolCallId: call.id,
      toolName: call.name,
    }],
    responseText: JSON.stringify({ ok: result.ok, pending: true }),
    streamText: '',
    reasoningText: '',
    toolsEnabled: false,
    toolsDowngraded: true,
    downgradeReason: 'compatibility_write',
    error: result.ok ? undefined : (result.error?.message || '兼容模式编辑器写入失败'),
  })
  params.toolPolicy?.onToolCall?.({
    toolName: writeTool.name,
    toolCallId: call.id,
    policy: writeTool.policy,
    iteration,
    input,
    result,
    durationMs: actualDurationMs,
    protocolVersion: compatibilityProtocolResolution.version,
    protocolVersionDefaulted: compatibilityProtocolResolution.defaulted,
    toolCapability: 'json_protocol',
    rejectionCategory: classifyToolRejection(result),
    defaultToolPolicy: writeTool.defaultToolPolicy,
    riskLevel: writeTool.riskLevel,
  })
  logToolRequest(logger, {
    purpose: params.purpose,
    providerId,
    model,
    toolName: writeTool.name,
    iteration,
    input,
    result,
    durationMs: actualDurationMs,
    toolCapability: 'json_protocol',
  })
  return { call, result }
}


// ── Thinking-tag filter ─────────────────────────────────────────────

const THINKING_PATTERNS = [
  /<thinking>[\s\S]*?<\/thinking>/gi,
  /<reasoning>[\s\S]*?<\/reasoning>/gi,
  /<think>[\s\S]*?<\/think>/gi,
]

export function filterThinkingTags(text: string): string {
  let out = text
  for (const re of THINKING_PATTERNS) out = out.replace(re, '')
  return out
}

const THINKING_TAG_NAMES = ['thinking', 'reasoning', 'think'] as const

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const THINKING_OPEN_RES = THINKING_TAG_NAMES.map(
  name => new RegExp(`<${escapeRegExp(name)}>`, 'i'),
)
const THINKING_CLOSE_RES = new Map(
  THINKING_TAG_NAMES.map(name => [name, new RegExp(`</${escapeRegExp(name)}>`, 'i')] as const),
)

function potentialTagPrefixLength(text: string, patterns: RegExp[]): number {
  const start = text.lastIndexOf('<')
  if (start < 0) return 0
  const fragment = text.slice(start).toLowerCase()
  const possible = patterns.some(pattern => {
    const source = pattern.source.toLowerCase()
    return source.startsWith(fragment) && fragment.length < source.length
  })
  return possible ? text.length - start : 0
}

export interface ThinkingTagStreamFilter {
  push(delta: string): string
  flush(): string
}

export function createThinkingTagStreamFilter(): ThinkingTagStreamFilter {
  let pending = ''
  let activeTag: (typeof THINKING_TAG_NAMES)[number] | null = null

  function emitAvailable(): string {
    if (activeTag) {
      const closeRe = THINKING_CLOSE_RES.get(activeTag)!
      const match = closeRe.exec(pending)
      if (!match) {
        const hold = potentialTagPrefixLength(pending, [closeRe])
        if (hold <= 0) return ''
        const emitted = pending.slice(0, -hold)
        pending = pending.slice(-hold)
        return emitted
      }
      pending = pending.slice(match.index + match[0].length)
      activeTag = null
      return emitAvailable()
    }

    let earliest: { index: number; name: (typeof THINKING_TAG_NAMES)[number]; length: number } | null = null
    for (let i = 0; i < THINKING_TAG_NAMES.length; i++) {
      const match = THINKING_OPEN_RES[i].exec(pending)
      if (match && (!earliest || match.index < earliest.index)) {
        earliest = { index: match.index, name: THINKING_TAG_NAMES[i], length: match[0].length }
      }
    }
    if (earliest) {
      const emitted = pending.slice(0, earliest.index)
      pending = pending.slice(earliest.index + earliest.length)
      activeTag = earliest.name
      return emitted + emitAvailable()
    }

    const hold = potentialTagPrefixLength(pending, THINKING_OPEN_RES)
    if (hold <= 0) {
      const emitted = pending
      pending = ''
      return emitted
    }
    const emitted = pending.slice(0, -hold)
    pending = pending.slice(-hold)
    return emitted
  }

  return {
    push(delta: string) {
      if (!delta) return ''
      pending += delta
      return emitAvailable()
    },
    flush() {
      const emitted = pending
      pending = ''
      activeTag = null
      return emitted
    },
  }
}

// ── SSE Stream Parser ──────────────────────────────────────────────

interface StreamCallbacks {
  onChunk?: (text: string) => void
  onReasoning?: (text: string) => void
  onUsage?: (usage: any) => void
}

type MainNetStreamResult = {
  text: string
  reasoning: string
  finishReason?: string
  usage?: any
  raw?: any
}

const PROVIDER_SOFT_ERROR_PATTERNS = [
  /quota[_\s-]?(?:exhaust|exceeded|limit)/i,
  /insufficient[_\s-]?(?:balance|credit|quota)/i,
  /(?:balance|credit)[_\s-]?(?:exhaust|insufficient)/i,
  /(?:plan|subscription)[_\s-]?(?:limit|exhaust|expired)/i,
  /(?:额度|余额|配额|套餐|订阅)(?:已)?(?:耗尽|不足|到期|用完|超限)/,
  /请(?:充值|续费|升级|购买).{0,24}(?:额度|余额|套餐|配额)?/,
]

function extractSoftProviderErrorBody(raw: any): { error?: any; message?: string } | null {
  if (!raw || typeof raw !== 'object') return null
  if (raw.error || raw.message || raw.msg) return raw
  if (Array.isArray(raw.choices) && raw.choices.length === 0 && (raw.usage || raw.prompt_tokens || raw.completion_tokens)) {
    return { message: JSON.stringify(raw).slice(0, 500) }
  }
  return null
}

function hasProviderSoftQuotaError(text: string): boolean {
  return PROVIDER_SOFT_ERROR_PATTERNS.some(pattern => pattern.test(text))
}

function hasAbnormalZeroUsage(usage: any, hasText: boolean): boolean {
  if (!usage || typeof usage !== 'object') return false
  const inputTokens = Number(usage.inputTokens ?? usage.promptTokens ?? usage.prompt_tokens ?? usage.input_tokens)
  const outputTokens = Number(usage.outputTokens ?? usage.completion_tokens ?? usage.completionTokens ?? usage.output_tokens)
  const totalTokens = Number(usage.totalTokens ?? usage.total_tokens ?? usage.totalTokenCount)
  const allNumbers = [inputTokens, outputTokens, totalTokens].filter(value => Number.isFinite(value))
  if (allNumbers.length === 0) return false
  return !hasText
    && Number.isFinite(totalTokens) && totalTokens > 0
    && inputTokens === 0
    && outputTokens === 0
}

function throwProviderSoftError(
  raw: unknown,
  provider: ProviderLike,
  purpose: ProviderPurpose,
  usage?: any,
  hasText = false
): never {
  const body = extractSoftProviderErrorBody(raw)
  const summary = body ? extractProviderErrorSummary(body) : ''
  const quotaText = hasProviderSoftQuotaError(summary) || hasAbnormalZeroUsage(usage, hasText)
  const message = quotaText
    ? `quota_exhausted：供应商返回软错误，未产生正文${summary ? `：${summary}` : ''}`
    : `供应商在 HTTP 200 中返回错误结构，未产生正文${summary ? `：${summary}` : ''}`
  throw new AiServiceErrorImpl({
    kind: 'auth',
    message,
    providerId: provider.id,
    purpose,
    statusCode: 402,
    providerErrorSummary: summary || JSON.stringify(raw).slice(0, 500),
  })
}

interface StreamToolCallState {
  openAIToolCalls: Array<{ id?: string; type: 'function'; function: { name: string; arguments: string } }>
  anthropicBlocks: Map<number, { id?: string; name?: string; json: string }>
  anthropicContent: Array<{ type: 'tool_use'; id: string; name: string; input: unknown }>
  geminiParts: Array<{ functionCall: { name: string; args: unknown } }>
}

function createStreamToolCallState(): StreamToolCallState {
  return {
    openAIToolCalls: [],
    anthropicBlocks: new Map(),
    anthropicContent: [],
    geminiParts: [],
  }
}

function collectStreamToolCalls(json: any, protocolName: string, state: StreamToolCallState): void {
  if (protocolName === 'gemini') {
    const parts = json?.candidates?.[0]?.content?.parts
    if (!Array.isArray(parts)) return
    for (const part of parts) {
      if (!part?.functionCall?.name) continue
      state.geminiParts.push({ functionCall: { name: String(part.functionCall.name), args: part.functionCall.args ?? {} } })
    }
    return
  }

  if (protocolName === 'anthropic') {
    if (json?.type === 'content_block_start' && json?.content_block?.type === 'tool_use') {
      state.anthropicBlocks.set(Number(json.index ?? 0), {
        id: json.content_block.id ? String(json.content_block.id) : undefined,
        name: json.content_block.name ? String(json.content_block.name) : undefined,
        json: '',
      })
    }
    if (json?.type === 'content_block_delta' && json?.delta?.type === 'input_json_delta') {
      const block = state.anthropicBlocks.get(Number(json.index ?? 0))
      if (block) block.json += String(json.delta.partial_json || '')
    }
    if (json?.type === 'content_block_stop') {
      const index = Number(json.index ?? 0)
      const block = state.anthropicBlocks.get(index)
      if (block) {
        let input: unknown = {}
        try { input = block.json ? JSON.parse(block.json) : {} } catch { input = {} }
        state.anthropicContent.push({
          type: 'tool_use',
          id: block.id || `anthropic-tool-${index}`,
          name: block.name || '',
          input,
        })
        state.anthropicBlocks.delete(index)
      }
    }
    return
  }

  const deltas = json?.choices?.[0]?.delta?.tool_calls
  const calls = Array.isArray(deltas) ? deltas : json?.choices?.[0]?.message?.tool_calls
  if (!Array.isArray(calls)) return
  for (const delta of calls) {
    const index = Number.isFinite(delta?.index) ? Number(delta.index) : state.openAIToolCalls.length
    while (state.openAIToolCalls.length <= index) {
      state.openAIToolCalls.push({ id: '', type: 'function', function: { name: '', arguments: '' } })
    }
    const target = state.openAIToolCalls[index]
    if (delta?.id) target.id = String(delta.id)
    if (delta?.function?.name) target.function.name = String(delta.function.name)
    if (typeof delta?.function?.arguments === 'string') target.function.arguments += delta.function.arguments
  }
}

function streamToolCallRaw(protocolName: string, state: StreamToolCallState): any | undefined {
  if (protocolName === 'gemini') {
    if (state.geminiParts.length === 0) return undefined
    return { candidates: [{ content: { parts: state.geminiParts } }] }
  }
  if (protocolName === 'anthropic') {
    if (state.anthropicContent.length === 0) return undefined
    return { content: state.anthropicContent }
  }
  if (state.openAIToolCalls.length === 0) return undefined
  return { choices: [{ message: { tool_calls: state.openAIToolCalls } }] }
}

function looksLikePlainJsonResponseBody(json: any): boolean {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return false
  if (json?.candidates?.[0]?.content?.parts?.some((part: any) => part?.functionCall?.name)) {
    return true
  }
  if (json?.content?.some((block: any) => block?.type === 'tool_use' && block?.name)) {
    return true
  }
  return Array.isArray(json?.choices)
    || Array.isArray(json?.content)
    || Array.isArray(json?.candidates)
}

/**
 * Unified SSE stream parser. Handles data: prefix, [DONE],
 * reasoning_content, and thinking-tag filtering.
 */
async function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  cb: StreamCallbacks,
  protocolName: string = 'openai-compatible',
  nativeToolExchange = false
): Promise<MainNetStreamResult> {
  const decoder = new TextDecoder()
  let fullText = ''
  let reasoningText = ''
  let finishReason: string | undefined
  let buffer = ''
  const chunkFilter = createThinkingTagStreamFilter()
  const reasoningFilter = createThinkingTagStreamFilter()
  const toolCallState = createStreamToolCallState()
  let streamError: { error?: any; message?: string } | undefined
  const protocol = getProviderProtocol(protocolName)
  const emitChunk = (delta: string) => {
    const emitted = chunkFilter.push(delta)
    if (emitted) cb.onChunk?.(emitted)
  }
  const emitReasoning = (delta: string) => {
    const emitted = reasoningFilter.push(delta)
    if (emitted) {
      reasoningText += emitted
      cb.onReasoning?.(emitted)
    }
  }
  let streamUsage: Record<string, any> | undefined
  let plainJsonBody: any | undefined
  const tryCapturePlainToolCallBody = (candidate: string) => {
    if (plainJsonBody || !nativeToolExchange) return
    const trimmedCandidate = candidate.trim()
    if (!trimmedCandidate.startsWith('{') || !trimmedCandidate.endsWith('}')) return
    try {
      const json = JSON.parse(trimmedCandidate)
      if (looksLikePlainJsonResponseBody(json)) plainJsonBody = json
    } catch {
      // Fall through to the normal SSE parser.
    }
  }
  const mergeUsageAndEmit = (usage: unknown) => {
    if (!usage || typeof usage !== 'object') return
    // Anthropic streams input/output usage in different SSE frames. Merge
    // them instead of letting the later frame erase the former.
    streamUsage = { ...streamUsage, ...(usage as Record<string, any>) }
    cb.onUsage?.(streamUsage)
  }

  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    buffer += decoder.decode(chunk.value, { stream: true })
    tryCapturePlainToolCallBody(buffer)
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      tryCapturePlainToolCallBody(trimmed)
      if (!trimmed || !isSSEDataLine(trimmed)) continue
      const payload = trimmed.slice(6)
      if (isSSEDone(payload)) continue
      try {
        const json = JSON.parse(payload)
        if (json?.error || json?.message || json?.msg) {
          streamError = json
        }
        collectStreamToolCalls(json, protocolName, toolCallState)
        if (protocolName === 'gemini') {
          const text = (json?.candidates?.[0]?.content?.parts || []).map((part: any) => part?.text || '').join('')
          if (text) {
            fullText += text
            emitChunk(text)
          }
          finishReason = json?.candidates?.[0]?.finishReason || finishReason
          if (json?.usageMetadata) mergeUsageAndEmit(json.usageMetadata)
        } else if (protocolName === 'anthropic') {
          if (json?.type === 'content_block_delta') {
            const text = json?.delta?.text || ''
            const thinking = json?.delta?.thinking || ''
            if (thinking) {
              emitReasoning(thinking)
            }
            if (text) {
              fullText += text
              emitChunk(text)
            }
          }
          if (json?.type === 'message_delta') {
            finishReason = json?.delta?.stop_reason || finishReason
            const usage = protocol.extractUsage(json)
            if (usage) mergeUsageAndEmit(usage)
          }
        } else {
          const delta = extractStreamDelta(json)
          finishReason = extractFinishReason(json) || finishReason
          if (delta.reasoning) {
            emitReasoning(delta.reasoning)
          }
          if (delta.content) {
            fullText += delta.content
            emitChunk(delta.content)
          }
          if (json.usage) mergeUsageAndEmit(json.usage)
        }
      } catch { /* skip non-JSON lines */ }
    }
  }
  const finalChunk = chunkFilter.flush()
  if (finalChunk) cb.onChunk?.(finalChunk)
  const finalReasoning = reasoningFilter.flush()
  if (finalReasoning) {
    reasoningText += finalReasoning
    cb.onReasoning?.(finalReasoning)
  }
  if (plainJsonBody) {
    const plainProtocol = getProviderProtocol(protocolName)
    return {
      text: plainProtocol.extractText(plainJsonBody),
      reasoning: plainProtocol.extractReasoning(plainJsonBody),
      finishReason: plainProtocol.extractFinishReason(plainJsonBody),
      usage: plainProtocol.extractUsage(plainJsonBody),
      raw: plainJsonBody,
    }
  }
  return {
    text: fullText,
    reasoning: reasoningText,
    finishReason,
    usage: streamUsage,
    raw: streamToolCallRaw(protocolName, toolCallState) ?? streamError,
  }
}

// ── JSON Repair ─────────────────────────────────────────────────────

/**
 * Attempts JSON.parse with a single retry: if it fails, sends a
 * follow-up prompt asking for valid JSON and tries again.
 * Only used when params.jsonMode === true.
 */
async function tryJsonParse(
  text: string,
  rawCall: () => Promise<string>
): Promise<string> {
  try {
    JSON.parse(text)
    return text // already valid JSON
  } catch {
    // retry once with explicit instruction
    const repaired = await rawCall()
    try {
      JSON.parse(repaired)
      return repaired
    } catch {
      throw new AiServiceErrorImpl({
        kind: 'json',
        message: 'JSON 解析失败，已重试一次仍无法解析',
      })
    }
  }
}

// ── Timeout helper ──────────────────────────────────────────────────

function makeTimeoutSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs)
}

function combineSignals(...signals: (AbortSignal | undefined)[]): AbortSignal {
  const valid = signals.filter(Boolean) as AbortSignal[]
  if (valid.length === 0) return new AbortController().signal
  if (valid.length === 1) return valid[0]
  return AbortSignal.any(valid)
}

export function resolveRequestTimeout(
  timeoutMs: number | null | undefined,
  provider: { timeoutMs?: number },
  wantStream: boolean
): number | null {
  if (timeoutMs !== undefined) return timeoutMs
  return provider.timeoutMs ?? (wantStream ? DEFAULT_STREAM_TIMEOUT : DEFAULT_NON_STREAM_TIMEOUT)
}

function waitWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('The operation was aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(new DOMException('The operation was aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

// ── Diagnostic Logger ───────────────────────────────────────────────

export interface DiagnosticLogLike {
  addLog(entry: {
    step: number
    stepName: string
    mode: string
    skillNames: string[]
    agentId?: string
    providerId?: string
    model?: string
    prompt: string
    result: string
    duration: number
    status: 'success' | 'failed'
    usage?: any
    providerType?: string
    transport?: 'main-process' | 'renderer-fetch'
    finalUrl?: string
    statusCode?: number
    providerErrorSummary?: string
    toolCapability?: 'native_tools' | 'json_protocol'
    rejectionCategory?: ToolRejectionCategory
    downgradeReason?: string
    retryStrategy?: 'thinking_disabled' | 'max_tokens_raised' | 'prompt_only'
    /** null records an undeclared output limit; a number records the effective wire limit. */
    maxTokens?: number | null
  }): void
}

function logRequest(
  logger: DiagnosticLogLike | null,
  params: {
    step?: number
    purpose: ProviderPurpose
    providerId?: string
    model?: string
    prompt: string
    result: string
    durationMs: number
    success: boolean
    skillId?: string
    agentId?: string
    ctxTurns?: number
    usage?: any
    providerType?: string
    transport?: 'main-process' | 'renderer-fetch'
    finalUrl?: string
    statusCode?: number
    providerErrorSummary?: string
    toolCapability?: 'native_tools' | 'json_protocol'
    downgradeReason?: string
    retryStrategy?: 'thinking_disabled' | 'max_tokens_raised' | 'prompt_only'
    /** null records an undeclared output limit; a number records the effective wire limit. */
    maxTokens?: number | null
  }
) {
  if (logger) {
    logger.addLog({
      step: params.step ?? -1,
      stepName: params.purpose,
      mode: params.skillId || 'default',
      skillNames: params.skillId ? [params.skillId] : [],
      agentId: params.agentId || '',
      providerId: params.providerId || '',
      model: params.model || '',
      prompt: params.prompt.slice(0, 500),
      result: params.result.slice(0, 500),
      duration: params.durationMs,
      status: params.success ? 'success' : 'failed',
      usage: params.usage,
      providerType: params.providerType,
      transport: params.transport,
      finalUrl: params.finalUrl,
      statusCode: params.statusCode,
      providerErrorSummary: params.providerErrorSummary,
      toolCapability: params.toolCapability,
      downgradeReason: params.downgradeReason,
      retryStrategy: params.retryStrategy,
      maxTokens: params.maxTokens,
    })
  }
  // Push to DiagLogger for real-time DiagLogPanel display.
  // Must run even when the caller passes no pipeline logger:
  // diagnostics are a cross-cutting concern of the unified AI entry.
  const _diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
  if (_diag && typeof _diag.log === 'function') {
    _diag.log(params.success ? 'info' : 'error', 'ai-service',
      'AI call: purpose=' + params.purpose + ' provider=' + (params.providerId || '?') + ' model=' + (params.model || '?') + ' ' + params.durationMs + 'ms ' + (params.success ? 'OK' : 'FAIL'),
      {
        providerId: params.providerId,
        purpose: params.purpose,
        model: params.model,
        durationMs: params.durationMs,
        skillId: params.skillId,
        agentId: params.agentId,
        ctxTurns: params.ctxTurns,
        result: params.result.slice(0, 300),
        usage: params.usage || undefined,
        providerType: params.providerType,
        transport: params.transport,
        finalUrl: params.finalUrl,
        statusCode: params.statusCode,
        providerErrorSummary: params.providerErrorSummary,
        toolCapability: params.toolCapability,
        downgradeReason: params.downgradeReason,
        retryStrategy: params.retryStrategy,
        maxTokens: params.maxTokens,
      }
    )
    if (typeof _diag.trackApiCall === 'function') {
      const usage = params.usage
      const totalTokens = usage
        ? (usage.totalTokens ?? usage.total_tokens ?? ((usage.inputTokens ?? usage.prompt_tokens ?? 0) + (usage.outputTokens ?? usage.completion_tokens ?? 0)))
        : 0
      _diag.trackApiCall(params.model || '?', totalTokens, params.durationMs, params.success ? 'ok' : 'error', params.success ? '' : params.result.slice(0, 200))
    }
  }
}

function logToolRequest(
  logger: DiagnosticLogLike | null,
  params: {
    purpose: ProviderPurpose
    providerId?: string
    model?: string
    toolName: string
    iteration: number
    input: unknown
    result: ToolResult
    durationMs: number
    toolCapability?: 'native_tools' | 'json_protocol'
    rejectionCategory?: ToolRejectionCategory
  }
) {
  const rejectionCategory = params.rejectionCategory ?? classifyToolRejection(params.result)
  const resultPreview = JSON.stringify(params.result).slice(0, 500)
  if (logger) {
    logger.addLog({
      step: -1,
      stepName: 'tool-call',
      mode: params.toolName,
      skillNames: [],
      agentId: '',
      providerId: params.providerId || '',
      model: params.model || '',
      prompt: JSON.stringify(params.input).slice(0, 500),
      result: resultPreview,
      duration: params.durationMs,
      status: params.result.ok ? 'success' : 'failed',
      toolCapability: params.toolCapability,
      rejectionCategory,
    })
  }
  const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
  if (diag && typeof diag.log === 'function') {
    diag.log(params.result.ok ? 'info' : 'error', 'ai-service/tool-call',
      `Tool call: ${params.toolName} iteration=${params.iteration} ${params.durationMs}ms ${params.result.ok ? 'OK' : 'FAIL'}`,
      {
        providerId: params.providerId,
        purpose: params.purpose,
        model: params.model,
        toolName: params.toolName,
        toolCapability: params.toolCapability,
        rejectionCategory,
        iteration: params.iteration,
        durationMs: params.durationMs,
        input: params.input,
        result: params.result,
      }
    )
  }
}

function reportToolAuditDiagnostics(audit: ReturnType<typeof buildCrossTurnToolAudit>): void {
  if (!audit.orphanToolCallIds.length) return
  const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
  if (diag && typeof diag.log === 'function') {
    diag.log(
      'error',
      'ai-service/tool-audit',
      `Orphan tool calls detected: ${audit.orphanToolCallIds.join(', ')}`,
      {
        orphanToolCallIds: audit.orphanToolCallIds,
        entryCount: audit.entries.length,
        protocolVersion: audit.protocolVersion,
      },
    )
  }
}

function parseMaxTokensDowngrade(providerMessage: string, currentMaxTokens: number | null): { from: number | null; to: number; reason: string } | null {
  const message = String(providerMessage || '')
  const limitPatterns = [
    /max[_\s-]*tokens?[^\d]{0,80}(\d{1,9})/gi,
    /(?:maximum|allowed|permitted|上限|最大)[^\d]{0,80}(\d{1,9})/gi,
  ]
  const suggested = limitPatterns
    .flatMap(pattern => Array.from(message.matchAll(pattern)))
    .map(match => Number(match[1]))
    .find(value => Number.isFinite(value) && value > 0 && (currentMaxTokens == null || value < currentMaxTokens))
  if (suggested == null) return null
  return {
    from: currentMaxTokens,
    to: suggested,
    reason: message.slice(0, 300),
  }
}

// ── Main-process network transport ──────────────────────────────────

interface MainNetResult {
  ok: boolean
  kind?: 'network' | 'timeout' | 'http' | 'json' | 'auth' | 'canceled'
  message?: string
  statusCode?: number
  providerErrorSummary?: string
  data?: any
  text?: string
}

function mainNetError(
  result: MainNetResult,
  provider: ProviderLike,
  purpose: ProviderPurpose
): AiServiceErrorImpl {
  const kind = result.kind === 'auth'
    ? 'auth'
    : result.kind === 'timeout'
      ? 'timeout'
      : result.kind === 'network'
        ? 'network'
        : 'http'
  return new AiServiceErrorImpl({
    kind,
    message: result.message || httpErrorMessage(result.statusCode || 0),
    providerId: provider.id,
    purpose,
    statusCode: result.statusCode,
    providerErrorSummary: result.providerErrorSummary,
  })
}

function hasMainNet(): boolean {
  return typeof window !== 'undefined' &&
    typeof (window as any).electronAPI?.providerNetRequest === 'function' &&
    typeof (window as any).electronAPI?.providerNetStream === 'function'
}

function isMainNetCanceled(result: MainNetResult): boolean {
  return result.kind === 'canceled'
}

async function mainNetRequest(request: {
  url: string
  method?: string
  headers: Record<string, string>
  body?: unknown
}, externalSignal?: AbortSignal): Promise<Response | { __mainNetError: true; result: MainNetResult }> {
  const signalId = 'provider-net-request-' + Date.now() + '-' + Math.random().toString(36).slice(2)
  const abortHandler = () => {
    ;(window as any).electronAPI.providerNetAbort(signalId).catch(() => {})
  }
  externalSignal?.addEventListener('abort', abortHandler, { once: true })
  let result: MainNetResult
  try {
    result = await (window as any).electronAPI.providerNetRequest({
      ...request,
      method: request.method || 'GET',
      signalId,
    })
  } finally {
    externalSignal?.removeEventListener('abort', abortHandler)
  }
  if (!result.ok) return { __mainNetError: true, result }
  return new Response(result.text || '', {
    status: result.statusCode || 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function extractProtocolStreamDelta(json: any, protocol: ReturnType<typeof getProviderProtocol>) {
  const openAIDelta = extractStreamDelta(json)
  if (openAIDelta.content || openAIDelta.reasoning) return openAIDelta
  if (json?.type === 'content_block_delta') {
    return {
      content: json.delta?.text ?? null,
      reasoning: json.delta?.thinking ?? null,
      finishReason: undefined,
    }
  }
  if (json?.type === 'message_delta') {
    return { content: null, reasoning: null, finishReason: json.delta?.stop_reason }
  }
  if (Array.isArray(json?.candidates?.[0]?.content?.parts)) {
    return {
      content: protocol.extractText(json),
      reasoning: null,
      finishReason: protocol.extractFinishReason(json),
    }
  }
  return { content: null, reasoning: null, finishReason: protocol.extractFinishReason(json) }
}

async function mainNetStream(
  request: { url: string; headers: Record<string, string>; body: Record<string, unknown> },
  callbacks: StreamCallbacks,
  protocolName: string,
  externalSignal?: AbortSignal,
  timeoutMs?: number | null,
  slowStreamTolerant = false,
  nativeToolExchange = false
): Promise<MainNetStreamResult> {
  const signalId = 'provider-net-' + Date.now() + '-' + Math.random().toString(36).slice(2)
  const chunkQueue: string[] = []
  let resolveChunk: (() => void) | null = null
  let ended = false
  let streamError: string | null = null
  let canceled = false
  let fullText = ''
  let reasoningText = ''
  let finishReason: string | undefined
  let streamUsage: Record<string, any> | undefined
  const chunkFilter = createThinkingTagStreamFilter()
  const reasoningFilter = createThinkingTagStreamFilter()
  const toolCallState = createStreamToolCallState()
  let plainJsonBody: any | undefined
  const tryCapturePlainToolCallBody = (candidate: string) => {
    if (plainJsonBody || !nativeToolExchange) return
    const trimmedCandidate = candidate.trim()
    if (!trimmedCandidate.startsWith('{') || !trimmedCandidate.endsWith('}')) return
    try {
      const json = JSON.parse(trimmedCandidate)
      if (looksLikePlainJsonResponseBody(json)) plainJsonBody = json
    } catch {
      // Keep the normal SSE parser for partial or non-JSON responses.
    }
  }

  const offChunk = (window as any).electronAPI.onProviderNetStreamChunk((payload: any) => {
    if (payload.signalId !== signalId) return
    if (payload.event === 'chunk' && payload.text) chunkQueue.push(payload.text)
    if (payload.event === 'end') ended = true
    if (payload.event === 'canceled') {
      canceled = true
      ended = true
    }
    if (payload.event === 'error') {
      streamError = payload.message || '主进程流式请求失败'
      ended = true
    }
    if (resolveChunk) {
      const resolve = resolveChunk
      resolveChunk = null
      resolve()
    }
  })

  const invoke: Promise<MainNetResult> = (window as any).electronAPI.providerNetStream({
    ...request,
    signalId,
    slowStreamTolerant,
  })
  invoke
    .then((result: MainNetResult) => {
      // The stream IPC returns failures without emitting a stream event. Wake
      // the consumer immediately so HTTP/auth failures do not wait for the
      // long stream timeout.
      if (result && result.ok === false) {
        ended = true
        if (resolveChunk) {
          const resolve = resolveChunk
          resolveChunk = null
          resolve()
        }
      }
    })
    .catch((error: unknown) => {
      streamError = error instanceof Error ? error.message : String(error)
      ended = true
      if (resolveChunk) {
        const resolve = resolveChunk
        resolveChunk = null
        resolve()
      }
    })
  const startedAt = Date.now()
  let idleTimedOut = false
  let progressTimedOut = false
  let streamSettled = false
  let streamProgressTimer: ReturnType<typeof setTimeout> | null = null
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  const clearIdleWatchdog = () => {
    if (!idleTimer) return
    clearTimeout(idleTimer)
    idleTimer = null
  }
  const armIdleWatchdog = () => {
    clearIdleWatchdog()
    idleTimer = setTimeout(() => {
      idleTimedOut = true
      streamError = '流式响应长时间无输出，已按网络断流处理'
      ended = true
      if (resolveChunk) {
        const resolve = resolveChunk
        resolveChunk = null
        resolve()
      }
    }, MAIN_NET_STREAM_IDLE_TIMEOUT_MS)
  }
  const clearProgressWatchdog = () => {
    if (!streamProgressTimer) return
    clearTimeout(streamProgressTimer)
    streamProgressTimer = null
  }
  const armProgressWatchdog = () => {
    clearProgressWatchdog()
    streamProgressTimer = setTimeout(() => {
      progressTimedOut = true
      streamError = '流式响应长时间无正文或推理增量，已按内容断流处理'
      ended = true
      if (resolveChunk) {
        const resolve = resolveChunk
        resolveChunk = null
        resolve()
      }
    }, MAIN_NET_STREAM_PROGRESS_TIMEOUT_MS)
  }
  // Slow-stream callers own stall handling at the task layer. Transport
  // watchdogs must not kill a live-but-slow final-draft stream and force the
  // current segment to restart from zero.
  if (!slowStreamTolerant) {
    armIdleWatchdog()
    armProgressWatchdog()
  }

  const abortHandler = () => {
    ;(window as any).electronAPI.providerNetAbort(signalId)
  }
  externalSignal?.addEventListener('abort', abortHandler, { once: true })

  const decoder = new TextDecoder()
  let buffer = ''
  let sawFirstByte = false
  const protocol = getProviderProtocol(protocolName)

  try {
    while (!ended || chunkQueue.length > 0) {
      if (chunkQueue.length === 0 && !ended) {
        await new Promise<void>(resolve => {
          resolveChunk = resolve
          setTimeout(resolve, 100)
        })
        if (!ended) {
          if (timeoutMs && Date.now() - startedAt > timeoutMs) {
            throw new DOMException('The operation was aborted', 'AbortError')
          }
        }
        continue
      }
      const text = chunkQueue.shift()
      if (text == null) continue
      armIdleWatchdog()
      if (!sawFirstByte) {
        sawFirstByte = true
      }
      buffer += text
      tryCapturePlainToolCallBody(buffer)
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !isSSEDataLine(trimmed)) continue
        const payload = trimmed.slice(6)
        if (isSSEDone(payload)) continue
        try {
          const json = JSON.parse(payload)
          if (!progressTimedOut) {
            const delta = extractProtocolStreamDelta(json, protocol)
            if (delta.content || delta.reasoning) armProgressWatchdog()
          }
          collectStreamToolCalls(json, protocolName, toolCallState)
          const delta = extractProtocolStreamDelta(json, protocol)
          finishReason = delta.finishReason || finishReason
          if (delta.reasoning) {
            armProgressWatchdog()
            const emitted = reasoningFilter.push(delta.reasoning)
            if (emitted) {
              reasoningText += emitted
              callbacks.onReasoning?.(emitted)
            }
          }
          if (delta.content) {
            armProgressWatchdog()
            fullText += delta.content
            const emitted = chunkFilter.push(delta.content)
            if (emitted) callbacks.onChunk?.(emitted)
          }
          const usage = protocol.extractUsage(json)
          if (usage) {
            // Anthropic streams input/output usage in different SSE frames.
            // Merge them instead of letting the later frame erase the former.
            streamUsage = { ...streamUsage, ...usage }
            callbacks.onUsage?.(streamUsage)
          }
        } catch { /* skip non-JSON lines */ }
      }
    }
    if (canceled) {
      throw new DOMException('The operation was aborted', 'AbortError')
    }
    if (idleTimedOut) {
      throw new AiServiceErrorImpl({ kind: 'network', message: streamError || '流式响应长时间无输出' })
    }
    if (progressTimedOut) {
      throw new AiServiceErrorImpl({ kind: 'network', message: streamError || '流式响应长时间无正文或推理增量' })
    }
    const invokeResult = await invoke
    if (!invokeResult.ok) {
      if (invokeResult.kind === 'canceled') {
        throw new DOMException('The operation was aborted', 'AbortError')
      }
      const kind = invokeResult.kind === 'auth'
        ? 'auth'
        : invokeResult.kind === 'timeout'
          ? 'timeout'
          : invokeResult.kind === 'json'
            ? 'json'
            : invokeResult.kind === 'network'
              ? 'network'
              : 'http'
      throw new AiServiceErrorImpl({
        message: invokeResult.message || '主进程网络请求失败',
        kind,
        statusCode: invokeResult.statusCode,
        providerErrorSummary: invokeResult.providerErrorSummary,
      })
    }
    if (streamError) {
      throw new AiServiceErrorImpl({ kind: 'network', message: streamError })
    }
    if (plainJsonBody) {
      const plainProtocol = getProviderProtocol(protocolName)
      return {
        text: plainProtocol.extractText(plainJsonBody),
        reasoning: plainProtocol.extractReasoning(plainJsonBody),
        finishReason: plainProtocol.extractFinishReason(plainJsonBody),
        usage: plainProtocol.extractUsage(plainJsonBody),
        raw: plainJsonBody,
      }
    }
    const finalChunk = chunkFilter.flush()
    if (finalChunk) callbacks.onChunk?.(finalChunk)
    const finalReasoning = reasoningFilter.flush()
    if (finalReasoning) {
      reasoningText += finalReasoning
      callbacks.onReasoning?.(finalReasoning)
    }
    streamSettled = true
    return {
      text: fullText,
      reasoning: reasoningText,
      finishReason,
      usage: streamUsage,
      raw: streamToolCallRaw(protocolName, toolCallState),
    }
  } finally {
    clearProgressWatchdog()
    clearIdleWatchdog()
    externalSignal?.removeEventListener('abort', abortHandler)
    if (typeof offChunk === 'function') offChunk()
    if (!streamSettled) {
      ;(window as any).electronAPI.providerNetAbort(signalId).catch(() => {})
    }
  }
}

// ── Main: createAiService ───────────────────────────────────────────

/**
 * Factory: creates the singleton AiService instance.
 */
export function createAiService(
  providerStore: ProviderStoreLike,
  logger?: DiagnosticLogLike | null
): AiService {
  const log = logger || null
  const compatibilityWriteGuards = new Map<string, RepeatedWriteGuard>()

  async function _rawCall(
    provider: ProviderLike,
    params: CallAiParams,
    timeoutMs: number | null
  ): Promise<{ text: string; reasoning: string; usage?: any; finishReason?: string; raw?: any; maxTokens?: number | null; modelCapability?: ModelCapability }> {
    const model = resolveModel(provider, params.model)
    const providerType = normalizeProviderType(provider.providerType)
    const headers = buildProviderHeaders(providerType, provider.apiKey)
    const temperature = resolveTemperature(provider, params.temperature)
    const maxTokens = resolveMaxTokens(provider, params.maxTokens)
    const modelCapability = resolveModelCapabilityForProvider(provider, params.maxTokens)
    const signal = timeoutMs == null
      ? params.signal
      : combineSignals(params.signal, makeTimeoutSignal(timeoutMs))
    const protocol = getProviderProtocol(providerType)
    const nativeToolExchange = Boolean(params.tools?.length) && supportsNativeTools(providerType)
    const nativeTools = nativeToolExchange
      ? buildProviderTools(providerType, params.tools as AgentToolDefinition[])
      : undefined
    const requestParams = params
    const wantStream = requestParams.stream ?? (
      !params.tools?.length &&
      (params.purpose === 'generate' || params.purpose === 'rewrite')
    )
    const url = buildProviderChatUrl({
      baseUrl: provider.baseUrl,
      providerType,
      endpointMode: provider.endpointMode,
      chatPath: provider.chatPath,
      deployment: provider.deployment,
      apiVersion: provider.apiVersion,
      model,
      stream: wantStream,
    })
    const body = protocol.buildRequestBody({
      model,
      messages: withTableOutputGuideline(params.messages, params.jsonMode === true),
      stream: wantStream,
      temperature,
      maxTokens,
      reasoning: params.reasoning?.mode === 'off' ? { mode: 'off' } : undefined,
      tools: nativeTools,
    })
    const useMainNet = hasMainNet()
    let resp: Response | null = null
    if (useMainNet && !wantStream) {
      const mainResult = await mainNetRequest({ url, method: 'POST', headers, body }, signal)
      if ('__mainNetError' in mainResult) {
        const result = mainResult.result
        if (isMainNetCanceled(result) || params.signal?.aborted) {
          throw new DOMException('The operation was aborted', 'AbortError')
        }
        throw mainNetError(result, provider, params.purpose)
      }
      resp = mainResult
    } else if (!useMainNet) {
      resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal })
    }
    if (resp && !resp.ok) throw resp
    if (!wantStream && !resp) throw new Error('网络传输初始化失败')
    if (wantStream) {
      let result: MainNetStreamResult
      let streamUsage: any
      if (useMainNet) {
        result = await mainNetStream(
          { url, headers, body },
          {
            onChunk: requestParams.onChunk,
            onReasoning: requestParams.onReasoning,
            onUsage: (u: any) => {
              streamUsage = u
              if (requestParams.onUsage) requestParams.onUsage(u)
            },
          },
          providerType,
          signal,
          timeoutMs,
          params.slowStreamTolerant === true,
          nativeToolExchange
        )
      } else {
        const reader = resp!.body!.getReader()
        result = await parseSSEStream(
          reader,
          {
            onChunk: requestParams.onChunk,
            onReasoning: requestParams.onReasoning,
            onUsage: (u: any) => {
              streamUsage = u
              if (requestParams.onUsage) requestParams.onUsage(u)
            },
          },
          providerType,
          nativeToolExchange
        )
      }
      const usage = normalizeTraceUsage(providerType, streamUsage ?? result.usage)
      if (
        (!result.text && !result.reasoning && extractSoftProviderErrorBody(result.raw))
        || hasProviderSoftQuotaError(extractProviderErrorSummary(result.raw))
        || (!result.text && !result.reasoning && hasAbnormalZeroUsage(usage, false))
      ) {
        throwProviderSoftError(result.raw, provider, params.purpose, usage, Boolean(result.text))
      }
      const finishReason = resolveFinishReason(result.finishReason, usage, maxTokens, Boolean(result.text))
      return { ...result, usage, finishReason, raw: result.raw, maxTokens, modelCapability }
    } else {
      const data = await resp!.json()
      if (
        (!protocol.extractText(data) && !protocol.extractReasoning(data) && extractSoftProviderErrorBody(data))
        || hasProviderSoftQuotaError(extractProviderErrorSummary(data))
      ) {
        const provisionalText = protocol.extractText(data)
        throwProviderSoftError(
          data,
          provider,
          params.purpose,
          normalizeTraceUsage(providerType, protocol.extractUsage(data)),
          Boolean(provisionalText)
        )
      }
      const text = protocol.extractText(data)
      const reasoning = protocol.extractReasoning(data)
      const rawUsage = protocol.extractUsage(data)
      const usage = normalizeTraceUsage(providerType, rawUsage)
      const rawFinishReason = protocol.extractFinishReason(data)
      if (usage && requestParams.onUsage) requestParams.onUsage(usage)
      const finishReason = resolveFinishReason(rawFinishReason, usage, maxTokens, Boolean(text))
      return {
        text,
        reasoning,
        usage,
        finishReason,
        raw: data,
        maxTokens,
        modelCapability,
      }
    }
  }

  /**
   * The unified callAi entry point.
   */
  async function callAi(params: CallAiParams): Promise<CallAiResult> {
    const prepared = resolveFinalDraftToolSurface(params)
    if (!prepared.tools || prepared.tools.length === 0) return callAiWithoutTools(prepared)
    return callAiWithToolFallback(prepared)
  }

  async function callAiWithTools(params: CallAiParams): Promise<CallAiResult> {
    const startTime = Date.now()
    const { provider, providerId } = resolveProvider(providerStore, params.purpose, params.providerId)
    const providerType = normalizeProviderType(provider.providerType)
    const compatibleMode = !supportsNativeTools(providerType)
    const model = resolveModel(provider, params.model)
    const modelCapability = resolveModelCapabilityForProvider(provider, params.maxTokens)
    const contextBudget = resolveContextBudget({
      provider,
      messages: params.messages,
      maxOutputTokens: modelCapability.maxOutputTokens,
    })
        const loopScenario = params.toolPolicy?.scenario || (compatibleMode ? 'compatibility-json' : 'direct')
        const maxIterations = normalizeToolIterations(
          loopScenario,
          params.toolPolicy?.maxToolIterations,
        )
    let messages: CallAiParams['messages'] = params.messages.map(message => ({ ...message }))
    const allToolCalls: NormalizedToolCall[] = []
    const allToolResults: Array<{ call: NormalizedToolCall; result: ToolResult }> = []
    const toolRequestDeltas: CallAiParams['messages'] = []
    const repeatedWriteGuard = createRepeatedWriteGuard(params.toolPolicy)
    let lastToolAudit: CallAiResult['toolAudit']
    let consecutiveToolOnlyRounds = 0
    let readOnlySteeringSent = false
    let writeContinuationSteeringSent = false
    let steerAfterToolResults = false
    let lastRoundToolResults: Array<{ call: NormalizedToolCall; result: ToolResult }> = []
    let consecutiveInvalidInputRounds = 0
    let invalidInputLoopSignature = ''
    const zeroTextWarnThreshold = 2
    const readOnlyConvergenceThreshold = 2
    const invalidInputConvergenceThreshold = 3
    let effectiveTools = params.tools
    let lastResult: CallAiResult | null = null
    let lastRawResponse: any = null
    let hitToolLoopLimit = false
    if (compatibleMode) {
      const compatibility: CallAiResult['compatibilityMode'] = 'json-protocol'
      params.toolPolicy?.onCompatibilityMode?.('provider_not_supported')
      logRequest(log, {
        purpose: params.purpose,
        providerId,
        model,
        prompt: params.messages.map(message => message.content).join(' ').slice(0, 200),
        result: '当前供应商未启用原生工具调用，已使用兼容模式',
        durationMs: 0,
        success: true,
        providerType,
        toolCapability: 'json_protocol',
        downgradeReason: 'provider_not_supported',
      })
      const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
      if (diag && typeof diag.log === 'function') {
        diag.log('info', 'ai-service/tool-capability',
          `Tool capability: provider=${providerId || '?'} type=${providerType} capability=json_protocol reason=provider_not_supported`,
          {
            providerId,
            purpose: params.purpose,
            model,
            toolCapability: 'json_protocol',
            downgradeReason: 'provider_not_supported',
          })
      }
      const response = await callAiWithoutTools({
        ...params,
        messages: hasEditorWriteTool(params)
          ? withEditorWriteProtocol(params.messages, params.toolPolicy?.executionPlan)
          : params.messages,
        toolPolicy: {
          ...params.toolPolicy,
          onCompatibilityMode: undefined,
          onToolStart: undefined,
          onToolCall: undefined,
          onToolWarning: undefined,
        },
        tools: undefined,
        // Compatibility JSON must never stream raw tool protocol into the UI.
        stream: false,
        physicalPhase: 'downgrade_retry',
      })
      const compatibilityWrite = await executeCompatibilityEditorWrite(
        response,
        params,
        log,
        providerId,
        model,
        1,
        compatibilityWriteGuards
      )
      const compatibilityResponse: CallAiResult = {
        ...response,
        compatibilityMode: compatibility,
        compatibilityWrite: Boolean(compatibilityWrite?.result.ok),
        toolCalls: compatibilityWrite ? [compatibilityWrite.call] : [],
        toolResults: compatibilityWrite ? [{ call: compatibilityWrite.call, result: compatibilityWrite.result }] : [],
        text: compatibilityEditorWriteText(response, compatibilityWrite),
        reasoning: response.reasoning || '',
      }
      return compatibilityResponse
    }

    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      const response = await callAiWithoutTools({
        ...params,
        messages,
        tools: effectiveTools,
        retry: params.retry,
        jsonMode: false,
        // Long-document runs set timeoutMs: null at the outer call. Preserve
        // that choice for every tool iteration; otherwise a 20k-character
        // document is still cut off by the non-stream default timeout.
        timeoutMs: params.timeoutMs,
        physicalPhase: iteration === 1 ? 'normal' : 'tool_iteration',
      })
      lastResult = response
      lastRawResponse = response.raw ?? null
      if (iteration === 1) {
        toolRequestDeltas.push(...messages.map(message => ({ ...message })))
      }

      const calls = extractProviderToolCallsFromResponse(providerType, response)
      if (calls.length === 0) {
        lastToolAudit = buildCrossTurnToolAudit({
          toolCalls: allToolCalls,
          toolResults: allToolResults,
          actualToolSurface: (effectiveTools || []).map(tool => ({ name: tool.name, policy: tool.policy })),
        })
        reportToolAuditDiagnostics(lastToolAudit)
        const finalVerdict = judgeConvergenceText(response)
        if (allToolCalls.length > 0 && finalVerdict.kind === 'pseudo_tool_call') {
          params.toolPolicy?.onConvergencePseudoCall?.({
            text: finalVerdict.text,
            reason: finalVerdict.reason,
          })
          const convergence = await requestToolConvergence({
            reason: 'final answer after tool execution looked like a tool-call protocol',
            systemPrompt: '上一次回答是伪工具调用 JSON，未被应用执行。当前请求不携带任何工具。不要再输出工具调用、JSON 协议或调用计划，直接输出自然语言总结；如果已完成写入，请说明写入结果和位置；如果没有完成写入，第一句必须说明“本轮未写入”。',
            alreadyReportedPseudoCall: true,
            params,
            messages,
            startTime,
            providerId,
            model,
            lastResult,
            allToolCalls,
            allToolResults,
            toolRequestDeltas,
            lastToolAudit,
          })
          lastResult = convergence
          return convergence
        }
        const executionPlan = params.toolPolicy?.executionPlan
        const coverageSummary = executionPlan
          ? summarizeLongDocumentWriteCoverage({
            plan: executionPlan,
            coverageRecords: collectLongDocumentWriteCoverage(allToolResults),
            toolResults: allToolResults,
          })
          : null
        const successfulWriteCount = coverageSummary?.successfulWriteCount ?? allToolResults.filter(item =>
          item.result.ok
          && String(item.call.name).startsWith('editor.write')).length
        const planRequiresMoreWrites = Boolean(coverageSummary
          && executionPlan
          && executionPlan.mode === 'edit-task'
          && executionPlan.operation !== 'discussion'
          && !coverageSummary.complete)
        if (planRequiresMoreWrites && !writeContinuationSteeringSent) {
          writeContinuationSteeringSent = true
          params.toolPolicy?.onToolWarning?.(
            `写入计划尚未完成（${successfulWriteCount}/${executionPlan!.segments.length} 批），模型停止调用工具；本轮继续携带工具面，要求其执行剩余批次`,
          )
          const continuationSystem = {
            role: 'system' as const,
            content: [
              '执行计划尚未完成，禁止把问题或计划当作最终回复。',
              buildLongDocumentWriteDirective(executionPlan),
              `当前已成功写入 ${successfulWriteCount} 批（可信覆盖 ${coverageSummary!.trustedWriteCount} 批），计划共 ${executionPlan!.segments.length} 批，未覆盖批次：${coverageSummary!.missingSegments.slice(0, 12).join(' | ') || '无'}。必须继续调用工具执行剩余批次；只有全部批次完成或遇到终态失败后，才能输出给用户看的最终总结。`,
            ].join('\n'),
          }
          messages = [...messages, continuationSystem]
          toolRequestDeltas.push({ ...continuationSystem })
          continue
        }
        return {
          ...response,
          toolCalls: allToolCalls,
          toolResults: allToolResults,
          toolRequestDeltas,
          toolAudit: lastToolAudit,
          contextBudget,
          usageReconciliation: buildUsageReconciliation({
            estimatedInputTokens: contextBudget.estimatedInputTokens,
            usage: response.usage,
          }),
        }
      }
      {
        const finalDraftPlan = params.toolPolicy?.executionPlan?.mode === 'final-draft'
        const hasWriteTool = (params.tools || []).some(item => item.policy === 'write')
        const readOnlyOnly = calls.every(call =>
          params.tools?.find(tool => tool.name === call.name)?.policy === 'read')
        const hasWriteCall = calls.some(call =>
          params.tools?.find(tool => tool.name === call.name)?.policy === 'write')
        if (readOnlyOnly && (hasWriteTool || finalDraftPlan)) consecutiveToolOnlyRounds += 1
        else if (hasWriteCall) {
          consecutiveToolOnlyRounds = 0
          messages = messages.filter(message => !(
            message.role === 'system'
            && String(message.content || '').includes('禁止继续无计划读取')
          ))
        }
        const hasNoVisibleText = !String(response.text || '').trim()
        const hitReadOnlyConvergence = readOnlyOnly
          && hasWriteTool
          && consecutiveToolOnlyRounds >= readOnlyConvergenceThreshold
          && !hasModelCorrectableToolFailure(lastRoundToolResults)
        if (finalDraftPlan && readOnlyOnly && consecutiveToolOnlyRounds >= readOnlyConvergenceThreshold) {
          steerAfterToolResults = true
          params.toolPolicy?.onToolWarning?.(`终稿模式下模型连续 ${consecutiveToolOnlyRounds} 轮只调用读取工具；下一轮必须停止调用工具并直接输出终稿正文`)
        } else if (hitReadOnlyConvergence && !readOnlySteeringSent) {
          steerAfterToolResults = true
          readOnlySteeringSent = true
          params.toolPolicy?.onToolWarning?.(`模型连续 ${consecutiveToolOnlyRounds} 轮只调用读取工具、未提交写入；本轮读取仍会执行，下一轮必须提交 editor.write 或说明无法完成`)
        } else if (hitReadOnlyConvergence) {
          params.toolPolicy?.onToolWarning?.(`模型连续 ${consecutiveToolOnlyRounds} 轮只调用读取工具、仍未提交写入；保留完整工具面，下一轮必须提交 editor.write 或说明无法完成`)
          steerAfterToolResults = true
        }
        if (readOnlyOnly
          && hasWriteTool
          && consecutiveToolOnlyRounds >= readOnlyConvergenceThreshold
          && hasModelCorrectableToolFailure(lastRoundToolResults)) {
          params.toolPolicy?.onToolWarning?.(`模型连续 ${consecutiveToolOnlyRounds} 轮只读取未写入，但上一轮工具返回了可修正错误；保留工具面供其修正目标后重试`)
        }
        if (hasNoVisibleText && consecutiveToolOnlyRounds === zeroTextWarnThreshold) {
          params.toolPolicy?.onToolWarning?.(`模型连续 ${consecutiveToolOnlyRounds} 轮只调用工具、未输出正文；到达工具上限后将基于已获得的工具结果直接总结回答`)
        }
      }
      const toolResults: Array<{ call: NormalizedToolCall; result: ToolResult }> = []
      for (const call of calls) {
        allToolCalls.push(call)
        const tool = params.tools?.find(item => item.name === call.name)
        const protocolResolution = tool?.name === 'editor.write'
          ? resolveEditorToolProtocolVersion(call.input)
          : null
        if (!tool) {
          const sameNamespaceTools = (params.tools || [])
            .filter(item => item.name.split('.')[0] === call.name.split('.')[0])
            .map(item => item.name)
          const allAvailableTools = (params.tools || []).map(item => item.name)
          const alternativeTools = sameNamespaceTools.length ? sameNamespaceTools : allAvailableTools
          const alternativeHint = alternativeTools.length
            ? `。可用同类工具：${alternativeTools.join(' | ')}`
            : ''
          const result: ToolResult = { ok: false, error: { code: 'tool_not_found', message: `工具不存在：${call.name}${alternativeHint}` } }
          toolResults.push({ call, result })
          allToolResults.push({ call, result })
          params.toolPolicy?.onToolStart?.({ toolName: call.name, policy: 'read', iteration, input: call.input })
          params.toolPolicy?.onToolCall?.({
            toolName: call.name,
            toolCallId: call.id,
            policy: 'read',
            iteration,
            input: call.input,
            result,
            durationMs: 0,
            toolCapability: 'native_tools',
            rejectionCategory: classifyToolRejection(result),
          })
          logToolRequest(log, {
            purpose: params.purpose,
            providerId,
            model,
            toolName: call.name,
            iteration,
          input: call.input,
          result,
          durationMs: 0,
          toolCapability: 'native_tools',
          rejectionCategory: classifyToolRejection(result),
        })
          continue
        }
        const permissionError = evaluateWritePermission(params, tool)
        if (permissionError) {
          params.toolPolicy?.onToolStart?.({ toolName: tool.name, policy: tool.policy, iteration, input: call.input })
          params.toolPolicy?.onPermissionDenied?.({
            toolName: tool.name,
            policy: tool.policy,
            intent: params.toolPolicy?.intent,
            permissionDecision: params.toolPolicy?.permissionDecision,
            writeMode: 'direct' as const,
            reason: permissionError.error?.message || '编辑器写入权限不足',
            durationMs: 0,
          })
          toolResults.push({ call, result: permissionError })
          allToolResults.push({ call, result: permissionError })
          params.toolPolicy?.onToolCall?.({
            toolName: tool.name,
            toolCallId: call.id,
            policy: tool.policy,
            iteration,
            input: call.input,
            result: permissionError,
            durationMs: 0,
            protocolVersion: protocolResolution?.version,
            protocolVersionDefaulted: protocolResolution?.defaulted,
            toolCapability: 'native_tools',
            rejectionCategory: classifyToolRejection(permissionError),
            defaultToolPolicy: tool.defaultToolPolicy,
            riskLevel: tool.riskLevel,
          })
          logToolRequest(log, {
            purpose: params.purpose,
            providerId,
            model,
            toolName: tool.name,
            iteration,
      input: call.input,
      result: permissionError,
      durationMs: 0,
      toolCapability: 'native_tools',
      rejectionCategory: classifyToolRejection(permissionError),
    })
          continue
        }
        if (tool.policy === 'write' && repeatedWriteGuard.shouldBlock(call.input, tool.name)) {
          const result: ToolResult = {
            ok: false,
            error: {
              code: 'duplicate_write_blocked',
              message: '检测到连续 3 次完全相同的编辑器写入请求，本次重复写入已拦截。请不要重复提交同一批修改，基于已写入结果输出总结或调整参数。',
            },
          }
          toolResults.push({ call, result })
          allToolResults.push({ call, result })
          params.toolPolicy?.onToolStart?.({ toolName: tool.name, policy: tool.policy, iteration, input: call.input })
          params.toolPolicy?.onToolCall?.({
            toolName: tool.name,
            toolCallId: call.id,
            policy: tool.policy,
            iteration,
            input: call.input,
            result,
            durationMs: 0,
            protocolVersion: protocolResolution?.version,
            protocolVersionDefaulted: protocolResolution?.defaulted,
            toolCapability: 'native_tools',
            rejectionCategory: classifyToolRejection(result),
            defaultToolPolicy: tool.defaultToolPolicy,
            riskLevel: tool.riskLevel,
          })
          logToolRequest(log, {
            purpose: params.purpose,
            providerId,
            model,
            toolName: tool.name,
            iteration,
            input: call.input,
            result,
            durationMs: 0,
            toolCapability: 'native_tools',
          })
          continue
        }
        const started = Date.now()
        const toolAbortControllers = [params.signal, params.cancelSignal]
          .filter((sourceSignal): sourceSignal is AbortSignal => Boolean(sourceSignal))
        const toolAbortController = new AbortController()
        toolAbortControllers.forEach(sourceSignal => {
          if (sourceSignal.aborted) toolAbortController.abort(sourceSignal.reason)
          sourceSignal.addEventListener('abort', () => toolAbortController.abort(sourceSignal.reason), { once: true })
        })
        params.toolPolicy?.onToolStart?.({ toolName: tool.name, policy: tool.policy, iteration, input: call.input })
        const invalidInput = validateAgentToolInput(tool, call.input)
        if (invalidInput) {
          toolResults.push({ call, result: invalidInput })
          allToolResults.push({ call, result: invalidInput })
          params.toolPolicy?.onToolCall?.({
            toolName: tool.name,
            toolCallId: call.id,
            policy: tool.policy,
            iteration,
            input: call.input,
            result: invalidInput,
            durationMs: 0,
            protocolVersion: protocolResolution?.version,
            protocolVersionDefaulted: protocolResolution?.defaulted,
            toolCapability: 'native_tools',
            rejectionCategory: classifyToolRejection(invalidInput),
            defaultToolPolicy: tool.defaultToolPolicy,
            riskLevel: tool.riskLevel,
          })
          logToolRequest(log, {
            purpose: params.purpose,
            providerId,
            model,
            toolName: tool.name,
            iteration,
            input: call.input,
            result: invalidInput,
            durationMs: 0,
            toolCapability: 'native_tools',
          })
          continue
        }
          const result = await tool.execute(call.input, {
          projectId: params.meta?.projectId || params.meta?.source || 'unknown-project',
          workspace: params.meta?.workspace || 'main',
          targetId: params.meta?.targetId || 'unknown-target',
          readableTargets: params.meta?.readableTargets || (params.meta?.targetId ? [params.meta.targetId] : []),
          writableTarget: params.meta?.targetId || 'unknown-target',
          sessionId: params.meta?.sessionId || params.meta?.source || 'unknown-session',
          iteration,
          abortSignal: toolAbortController.signal,
        })
        const durationMs = Date.now() - started
          toolResults.push({ call, result })
          allToolResults.push({ call, result })
          if (tool.policy === 'write') repeatedWriteGuard.record(call.input, result.ok)
        params.toolPolicy?.onToolCall?.({
          toolName: tool.name,
          toolCallId: call.id,
          policy: tool.policy,
          iteration,
          input: call.input,
          result,
          durationMs,
          protocolVersion: protocolResolution?.version,
          protocolVersionDefaulted: protocolResolution?.defaulted,
          toolCapability: 'native_tools',
          rejectionCategory: classifyToolRejection(result),
          defaultToolPolicy: tool.defaultToolPolicy,
          riskLevel: tool.riskLevel,
        })
        logToolRequest(log, {
          purpose: params.purpose,
          providerId,
          model,
          toolName: tool.name,
          iteration,
          input: call.input,
          result,
          durationMs,
          toolCapability: 'native_tools',
          rejectionCategory: classifyToolRejection(result),
        })
      }

      const previousMessageCount = messages.length
      lastRoundToolResults = toolResults
      const invalidInputResults = toolResults.filter(item =>
        item.result.ok === false && item.result.error?.code === 'invalid_input')
      if (invalidInputResults.length > 0) {
        const signature = invalidInputResults
          .map(item => `${item.call.name}::${stableToolSignature(item.call.input)}`)
          .join('|')
        if (signature === invalidInputLoopSignature) {
          consecutiveInvalidInputRounds += 1
        } else {
          invalidInputLoopSignature = signature
          consecutiveInvalidInputRounds = 1
        }
      } else {
        invalidInputLoopSignature = ''
        consecutiveInvalidInputRounds = 0
      }
      const hitInvalidInputConvergence = consecutiveInvalidInputRounds >= invalidInputConvergenceThreshold
      if (hitInvalidInputConvergence) {
        params.toolPolicy?.onToolWarning?.(
          `模型连续 ${consecutiveInvalidInputRounds} 轮相同参数校验失败；已停止工具循环并要求直接说明失败原因`,
        )
      }
      messages = buildToolResultChatMessages(
        providerType,
        messages,
        lastRawResponse,
        toolResults
      )
      toolRequestDeltas.push(
        ...messages.slice(previousMessageCount).map(message => ({ ...message }))
      )
      if (steerAfterToolResults) {
        const writeDirective = buildLongDocumentWriteDirective(params.toolPolicy?.executionPlan)
        const discussionDirective = params.toolPolicy?.executionPlan?.operation === 'discussion'
          ? `${writeDirective}下一轮必须停止调用工具，直接输出自然语言回答。`
          : ''
        const finalDraftDirective = discussionDirective
          || (params.toolPolicy?.executionPlan?.mode === 'final-draft'
          ? `${writeDirective}下一轮必须停止调用工具，直接输出终稿正文。`
          : `下一轮必须直接提交 editor.write 写入；${writeDirective}如果已执行部分计划批次但尚未覆盖全部计划范围，必须继续执行剩余批次。如果确实无法完成写入，必须停止调用工具并输出“本轮未写入”及具体原因。禁止继续无计划读取。`)
        const steeringSystem = {
          role: 'system' as const,
          content: `你已连续 ${consecutiveToolOnlyRounds} 轮只调用读取工具。当前请求仍携带工具面。${finalDraftDirective}`,
        }
        messages = [...messages, steeringSystem]
        toolRequestDeltas.push({ ...steeringSystem })
        steerAfterToolResults = false
      }
      if (hitInvalidInputConvergence) {
        const convergence = await requestToolConvergence({
          reason: 'repeated identical invalid tool inputs',
          systemPrompt: '工具连续多次返回相同参数校验失败，模型未能修正调用参数。当前请求不携带任何工具。禁止继续调用工具或输出调用计划；直接基于已获得的错误说明哪一次调用失败、失败字段是什么、本轮未完成什么任务。',
          params,
          messages,
          startTime,
          providerId,
          model,
          lastResult,
          allToolCalls,
          allToolResults,
          toolRequestDeltas,
          lastToolAudit,
        })
        return convergence
      }
      const terminalWriteFailure = findTerminalWriteFailure(toolResults)
      if (terminalWriteFailure) {
        const errorCode = terminalWriteFailure.result.error?.code || 'unknown'
        const errorMessage = terminalWriteFailure.result.error?.message || '写入被拒绝'
        params.toolPolicy?.onToolWarning?.(
          `editor.write 返回终态拒绝（${errorCode}）；已停止工具循环并要求模型直接向用户说明原因`,
        )
        const convergence = await requestToolConvergence({
          reason: `terminal write failure: ${errorCode}`,
          systemPrompt: [
            `上一次 editor.write 已被应用终态拒绝，错误码：${errorCode}。`,
            `拒绝原因：${errorMessage}`,
            '当前请求不携带任何工具。禁止再次调用工具、输出工具协议或提出新的执行计划；直接向用户说明本轮未写入、被拒绝的操作、具体原因，以及用户可以采取的下一步操作。',
          ].join('\n'),
          params,
          messages,
          startTime,
          providerId,
          model,
          lastResult,
          allToolCalls,
          allToolResults,
          toolRequestDeltas,
          lastToolAudit,
        })
        lastResult = convergence
        return convergence
      }
      if (iteration === maxIterations) hitToolLoopLimit = true
      lastToolAudit = buildCrossTurnToolAudit({
        toolCalls: allToolCalls,
        toolResults: allToolResults,
          actualToolSurface: (effectiveTools || []).map(tool => ({ name: tool.name, policy: tool.policy })),
      })
      reportToolAuditDiagnostics(lastToolAudit)
    }

      if (hitToolLoopLimit) {
      const convergence = await requestToolConvergence({
        reason: 'tool iterations exhausted without usable natural-language text',
        systemPrompt: '工具调用轮次已达上限。当前请求不携带任何工具。禁止输出 tool call、伪 tool call、JSON 工具协议或“我将调用工具”的计划。基于已获得的工具结果输出给用户看的最终回答；如果信息不足，请明确说明已确认的信息和仍缺失的信息；如果没有完成写入，必须明确说明“本轮未写入”。',
        params,
        messages,
        startTime,
        providerId,
        model,
        lastResult,
        allToolCalls,
        allToolResults,
        toolRequestDeltas,
        lastToolAudit,
      })
      lastResult = convergence
      return convergence
    }

    return {
      text: lastResult?.text || '',
      reasoning: lastResult?.reasoning || '',
      usage: lastResult?.usage,
      usageUnavailable: !lastResult?.usage,
      providerId,
      model,
      durationMs: Date.now() - startTime,
      toolCalls: allToolCalls,
      toolResults: allToolResults,
      toolRequestDeltas,
      toolAudit: lastToolAudit,
      finishReason: hitToolLoopLimit ? 'tool_loop_limit' : (lastResult?.finishReason || 'tool_loop_limit'),
      contextBudget,
      usageReconciliation: buildUsageReconciliation({
        estimatedInputTokens: contextBudget.estimatedInputTokens,
        usage: lastResult?.usage,
      }),
    }
  }

  async function requestToolConvergence(options: {
    reason: string
    systemPrompt: string
    alreadyReportedPseudoCall?: boolean
    params: CallAiParams
    messages: CallAiParams['messages']
    startTime: number
    providerId?: string
    model?: string
    lastResult: CallAiResult | null
    allToolCalls: NormalizedToolCall[]
    allToolResults: Array<{ call: NormalizedToolCall; result: ToolResult }>
    toolRequestDeltas: CallAiParams['messages']
    lastToolAudit: CallAiResult['toolAudit']
  }): Promise<CallAiResult> {
    const {
      reason,
      systemPrompt,
      alreadyReportedPseudoCall = false,
      params,
      messages,
      startTime,
      providerId,
      model,
      lastResult,
      allToolCalls,
      allToolResults,
      toolRequestDeltas,
      lastToolAudit,
    } = options
    const convergenceSystem = {
      role: 'system',
      content: systemPrompt,
    }
    let convergenceMessages: CallAiParams['messages'] = [
      ...messages,
      convergenceSystem,
    ]
    toolRequestDeltas.push({ ...convergenceSystem })
    try {
      params.toolPolicy?.onConvergenceStart?.()
      const requestConvergence = () => callAiWithoutTools({
        ...params,
        messages: convergenceMessages,
        tools: undefined,
        toolPolicy: undefined,
        suppressToolProtocolStream: true,
        stream: params.stream ?? false,
        // The convergence turn is the last-mile answer after slow tool rounds.
        // It must not inherit the exhausted logical deadline, but user
        // cancellation still aborts it immediately.
        timeoutMs: undefined,
        signal: params.cancelSignal ?? params.signal,
        physicalPhase: 'tool_convergence',
      })
      let convergenceResponse = await requestConvergence()
      let verdict = judgeConvergenceText(convergenceResponse)
      if (verdict.kind === 'pseudo_tool_call') {
        params.toolPolicy?.onConvergencePseudoCall?.({
          text: verdict.text,
          reason: verdict.reason,
        })
        const correctionSystem = {
          role: 'system',
          content: '上一次回答仍像工具调用协议，未被应用执行。当前请求没有任何工具。不要再输出工具调用、JSON 协议或调用计划，直接输出自然语言；如果没有完成写入，第一句必须说明“本轮未写入”。'
        }
        convergenceMessages = [...convergenceMessages, correctionSystem]
        toolRequestDeltas.push({ ...correctionSystem })
        convergenceResponse = await requestConvergence()
        verdict = judgeConvergenceText(convergenceResponse)
        if (verdict.kind === 'usable') {
          params.toolPolicy?.onConvergenceCorrected?.()
        } else {
          params.toolPolicy?.onConvergenceLocalFallback?.('convergence correction still returned no usable natural-language text')
        }
      }
      if (verdict.kind === 'usable') {
        if (alreadyReportedPseudoCall) params.toolPolicy?.onConvergenceCorrected?.()
        return {
          ...convergenceResponse,
          text: verdict.text,
          toolCalls: allToolCalls,
          toolResults: allToolResults,
          toolRequestDeltas,
          toolAudit: lastToolAudit,
          finishReason: 'tool_converged',
          convergenceReason: reason,
        }
      }
      if (verdict.kind === 'empty_or_failed') {
        params.toolPolicy?.onConvergenceLocalFallback?.('convergence response was empty')
      }
    } catch (error) {
      if ((params.cancelSignal ?? params.signal)?.aborted) throw error
      params.toolPolicy?.onConvergenceLocalFallback?.(`convergence request failed (${reason}): ${error instanceof Error ? error.message : String(error)}`)
    }
    // The convergence request is a last-mile answer, not a new generation.
    // If it is empty or fails (without user cancellation), return the already
    // collected tool evidence instead of another empty-body failure.
    params.toolPolicy?.onToolWarning?.('本轮未完成写入；返回本地拼接的工具结果摘要')
    return {
      text: `本轮未完成写入，API 未返回可用正文（${reason}）。工具过程与结果已保存到运行记录。建议缩小问题范围后重试，或分轮继续处理。`,
      reasoning: '',
      usage: lastResult?.usage,
      usageUnavailable: !lastResult?.usage,
      providerId,
      model,
      durationMs: Date.now() - startTime,
      toolCalls: allToolCalls,
      toolResults: allToolResults,
      toolRequestDeltas,
      toolAudit: lastToolAudit,
      finishReason: 'tool_converged_local',
      convergenceReason: reason,
    }
  }

  /**
   * One-request degradation: retry once without tools when a provider with
   * declared native-tool support rejects the tools request with a client error.
   */
  async function callAiWithToolFallback(params: CallAiParams): Promise<CallAiResult> {
    try {
      return await callAiWithTools(params)
    } catch (error: any) {
      const isClientError = error?.statusCode === 400 || error?.statusCode === 422
      const requestedTools = Boolean(params.tools?.length)
      const toolsRejected = requestedTools && (Boolean(error?.providerErrorSummary?.includes('tools unsupported')) || error?.message?.includes('tools unsupported'))
      if (!isClientError || !requestedTools || params.signal?.aborted || !toolsRejected) throw error

      params.onPhysicalCall?.({
        phase: 'downgrade_initial',
        status: 'failed',
        attempt: 1,
        durationMs: 0,
        requestMessages: params.messages,
        responseText: '',
        streamText: '',
        reasoningText: '',
        error: error?.message || String(error),
        toolsEnabled: true,
        toolsDowngraded: false,
      })
      const downgradeParams: CallAiParams = {
        ...params,
        messages: hasEditorWriteTool(params)
          ? withEditorWriteProtocol(params.messages, params.toolPolicy?.executionPlan)
          : params.messages,
        toolPolicy: params.toolPolicy
          ? {
            ...params.toolPolicy,
            onCompatibilityMode: undefined,
            onToolStart: undefined,
            onToolCall: undefined,
            onToolWarning: undefined,
          }
          : undefined,
        tools: undefined,
        // Same rule as compatibility mode: collect JSON, then surface only
        // the post-processed natural-language result.
        stream: false,
        physicalPhase: 'downgrade_retry',
      }
      const { provider: downgradeProvider, providerId: downgradeProviderId } = resolveProvider(providerStore, params.purpose, params.providerId)
      const downgradeProviderType = normalizeProviderType(downgradeProvider.providerType)
      const downgradeModel = resolveModel(downgradeProvider, params.model)
      const response = await callAiWithoutTools(downgradeParams)
      logRequest(log, {
        purpose: params.purpose,
        providerId: downgradeProviderId,
        model: downgradeModel,
        prompt: params.messages.map(message => message.content).join(' ').slice(0, 200),
        result: '供应商拒绝原生工具调用，已降级为 JSON 协议模式',
        durationMs: 0,
        success: true,
        providerType: downgradeProviderType,
        toolCapability: 'json_protocol',
        downgradeReason: `http_${error?.statusCode || 'client_error'}`,
      })
      const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
      if (diag && typeof diag.log === 'function') {
        diag.log('warn', 'ai-service/tool-capability',
          `Tool capability: provider=${downgradeProviderId || '?'} type=${downgradeProviderType} capability=json_protocol reason=http_${error?.statusCode || 'client_error'}`,
          {
            providerId: downgradeProviderId,
            purpose: params.purpose,
            model: downgradeModel,
            toolCapability: 'json_protocol',
            downgradeReason: `http_${error?.statusCode || 'client_error'}`,
          })
      }
      const downgradeReason = `http_${error?.statusCode || 'client_error'}`
      params.toolPolicy?.onCompatibilityMode?.(downgradeReason)
      const compatibilityWrite = await executeCompatibilityEditorWrite(
        response,
        params,
        log,
        downgradeProviderId,
        downgradeModel,
        1,
        compatibilityWriteGuards
      )
      const downgradedResponse: CallAiResult = {
        ...response,
        toolsDowngraded: 'json-protocol',
        compatibilityWrite: Boolean(compatibilityWrite?.result.ok),
        toolCalls: compatibilityWrite ? [compatibilityWrite.call] : [],
        toolResults: compatibilityWrite ? [{ call: compatibilityWrite.call, result: compatibilityWrite.result }] : [],
        text: compatibilityEditorWriteText(response, compatibilityWrite),
        reasoning: response.reasoning || '',
      }
      return downgradedResponse
    }
  }

  function extractProviderToolCallsFromResponse(
    providerType: string,
    response: CallAiResult
  ): NormalizedToolCall[] {
    if (!supportsNativeTools(providerType)) return []
    if (response.toolCalls && response.toolCalls.length > 0) return response.toolCalls
    if (!response.raw) return []
    return extractProviderToolCalls(providerType, response.raw)
  }

  async function callAiWithoutTools(params: CallAiParams): Promise<CallAiResult> {
    const startTime = Date.now()
    const requestedTools = Boolean(params.tools?.length)
    const { provider, providerId } = resolveProvider(providerStore, params.purpose, params.providerId)
    const providerType = normalizeProviderType(provider.providerType)
    // Default stream: true for generate/rewrite (long text), false for others (short/JSON).
    // Native tool exchanges use non-streaming JSON because some compatible providers
    // ignore stream=true and return a plain JSON tool_calls body.
    const defaultStream = !requestedTools &&
      (params.purpose === 'generate' || params.purpose === 'rewrite')
    const wantStream = params.stream ?? defaultStream
    const timeoutMs = resolveRequestTimeout(params.timeoutMs, provider, wantStream)
    const doRetry = params.retry !== false
    const maxRetries = doRetry ? MAX_RETRIES : 0
    const physicalRetryCeiling = doRetry ? maxRetries : NETWORK_RETRY_FLOOR
    const finalUrl = (() => {
      try {
        return sanitizeUrlForLog(buildProviderChatUrl({
          baseUrl: provider.baseUrl,
          providerType,
          endpointMode: provider.endpointMode,
          chatPath: provider.chatPath,
          deployment: provider.deployment,
          apiVersion: provider.apiVersion,
          model: resolveModel(provider, params.model),
        }))
      } catch {
        return '[invalid-url]'
      }
    })()
    const transport: 'main-process' | 'renderer-fetch' = hasMainNet() ? 'main-process' : 'renderer-fetch'
    const modelCapability = resolveModelCapabilityForProvider(provider, params.maxTokens)
    const contextBudget = resolveContextBudget({
      provider,
      messages: params.messages,
      maxOutputTokens: modelCapability.maxOutputTokens,
    })
    let lastErr: any = null
    let lastResp: { text: string; reasoning: string; usage?: any } | null = null
    let sawStreamOutput = false
    const getSlowStreamSawOutput = () => params.slowStreamTolerant === true && sawStreamOutput
    let streamBuffer = ''
    let reasoningBuffer = ''
    const basePhase = params.physicalPhase || 'normal'
    const effectiveMaxTokens = () => resolveMaxTokens(provider, params.maxTokens ?? provider.maxTokens)
    const physicalCallIds = new Map<number, string>()
    let physicalHeartbeatTimer: ReturnType<typeof setInterval> | null = null
    const stopPhysicalHeartbeat = () => {
      if (!physicalHeartbeatTimer) return
      clearInterval(physicalHeartbeatTimer)
      physicalHeartbeatTimer = null
    }
    const reportPhysical = (
      attempt: number,
      status: PhysicalCallEvent['status'],
      result?: any,
      error?: string,
      overridePhase?: PhysicalCallEvent['phase'],
      heartbeat?: boolean,
      interruption?: Pick<PhysicalCallEvent, 'interruptionCode'>,
    ) => {
      try {
        let physicalCallId = physicalCallIds.get(attempt)
        if (!physicalCallId) {
          physicalCallId = `physical-${startTime}-${attempt}`
          physicalCallIds.set(attempt, physicalCallId)
        }
        params.onPhysicalCall?.({
          physicalCallId,
          phase: overridePhase || (attempt > 0 ? 'retry' : basePhase),
          status,
          attempt: attempt + 1,
          durationMs: Date.now() - startTime,
          requestMessages: params.messages,
          responseText: result?.text || '',
          streamText: streamBuffer,
          reasoningText: reasoningBuffer || result?.reasoning || '',
          finishReason: result?.finishReason,
          usage: result?.usage,
          usageUnavailable: status === 'running' ? undefined : !result?.usage,
          error,
          toolsEnabled: requestedTools,
          toolsDowngraded: Boolean(params.toolPolicy === undefined && requestedTools),
          downgradeReason: overridePhase?.startsWith('downgrade') ? undefined : undefined,
          retryStrategy: params.retryStrategy,
          maxTokens: result?.maxTokens ?? effectiveMaxTokens(),
          modelCapability,
          contextBudget,
          usageReconciliation: buildUsageReconciliation({
            estimatedInputTokens: contextBudget.estimatedInputTokens,
            usage: result?.usage,
          }),
          heartbeat: status === 'running'
            ? Boolean(heartbeat || physicalHeartbeatTimer !== null)
            : undefined,
          ...interruption,
        })
      } catch { /* trace must never break the AI request */ }
    }
    const promptPreview = params.messages.map(m => m.content).join(' ').slice(0, 200)
    let maxTokensDowngrade: { from: number | null; to: number; reason: string } | null = null
    let currentPhysicalAttempt = 0
    const throwCanceled = (): never => {
      const durationMs = Date.now() - startTime
      stopPhysicalHeartbeat()
      // Closing the same running physical record prevents a canceled request
      // from leaving a perpetual running physical call in the trace.
      reportPhysical(currentPhysicalAttempt, 'canceled')
      logRequest(log, { step: params.meta?.step, purpose: params.purpose, providerId, model: resolveModel(provider, params.model), prompt: promptPreview, result: '用户取消', durationMs, success: false, skillId: params.meta?.skillId, agentId: params.meta?.agentId, providerType, transport, finalUrl })
      throw new AiServiceErrorImpl({ kind: 'canceled', message: '用户取消', providerId, purpose: params.purpose })
    }

    // Do not even open a network request when the caller has already canceled.
    if (params.signal?.aborted) return throwCanceled()

    // The wrapper must be applied once per logical request. Wrapping it inside
    // the retry loop made every retry nest another callback and duplicate the
    // same stream chunks in both the UI and the physical-call trace.
    // Stream callbacks are delta-only; the trace buffer accumulates them so
    // physical-call records keep their final cumulative stream text.
    const originalOnChunk = params.onChunk
    const originalOnReasoning = params.onReasoning
    const needsToolStreamGuard = (requestedTools || Boolean(params.suppressToolProtocolStream)) && wantStream
    const toolStreamGuard = needsToolStreamGuard
      ? createToolStreamGuard()
      : null
    // Slow-stream interruption is decided by whether the transport actually
    // emitted body text. Accumulate that stream even when the caller has no
    // onChunk listener; otherwise a silent-callback slow stream looks like a
    // no-output stream and falls back into physical retry.
    const traceParams = (originalOnChunk || toolStreamGuard || params.slowStreamTolerant === true)
      ? { ...params, onChunk: (text: string) => {
          if (!text) return
          streamBuffer += text
          const visibleText = toolStreamGuard ? toolStreamGuard.push(text) : text
          if (visibleText && originalOnChunk) originalOnChunk(visibleText)
        } }
      : params
    const reasoningTraceParams = originalOnReasoning
      ? { ...traceParams, onReasoning: (text: string) => {
          if (!text) return
          reasoningBuffer += text
          originalOnReasoning(text)
        } }
      : traceParams
    params = reasoningTraceParams

    try {
      for (let attempt = 0; attempt <= physicalRetryCeiling; attempt++) {
        try {
        streamBuffer = ''
        reasoningBuffer = ''
          currentPhysicalAttempt = attempt
          reportPhysical(attempt, 'running')
          physicalHeartbeatTimer = setInterval(() => {
            if (params.signal?.aborted) {
              stopPhysicalHeartbeat()
              return
            }
            reportPhysical(attempt, 'running', undefined, undefined, undefined, true)
          }, PHYSICAL_HEARTBEAT_INTERVAL_MS)
          const result = await _rawCall(provider, params, timeoutMs)
          stopPhysicalHeartbeat()
          if (toolStreamGuard) {
            const tailText = toolStreamGuard.flush()
            if (tailText && originalOnChunk) originalOnChunk(tailText)
          }
        lastResp = result
        let finalText = filterThinkingTags(result.text)
        if (params.jsonMode) {
          finalText = await tryJsonParse(finalText, () => _rawCall(provider, { ...params, jsonMode: false }, timeoutMs).then(r => r.text))
        }
        const durationMs = Date.now() - startTime
        const _model = resolveModel(provider, params.model)
        logRequest(log, { step: params.meta?.step, purpose: params.purpose, providerId, model: _model, prompt: promptPreview, result: finalText.slice(0, 200), durationMs, success: true, skillId: params.meta?.skillId, agentId: params.meta?.agentId, usage: result.usage, providerType, transport, finalUrl })
        reportPhysical(attempt, 'success', result)
        return {
          text: finalText,
          reasoning: result.reasoning,
          providerId,
          model: _model,
          durationMs,
          usage: result.usage,
          finishReason: result.finishReason,
          usageUnavailable: !result?.usage,
          raw: result.raw,
          maxTokens: result.maxTokens ?? effectiveMaxTokens(),
          modelCapability,
          retryStrategy: params.retryStrategy,
          contextBudget,
          usageReconciliation: buildUsageReconciliation({
            estimatedInputTokens: contextBudget.estimatedInputTokens,
            usage: result.usage,
          }),
        }
      } catch (e: any) {
        if (streamBuffer.length > 0 || reasoningBuffer.length > 0) sawStreamOutput = true
        // Canceled by user?
        if (params.signal?.aborted) {
          return throwCanceled()
        }
        // A slow-stream-tolerant request owns stall decisions at its task
        // layer. Once that stream has produced content, reconnecting here
        // creates a second recovery loop: every new physical attempt resets
        // the task's idle telemetry, and exhausting retries turns a still
        // actionable stalled stream into an immediate task failure.
        if (params.slowStreamTolerant === true && sawStreamOutput) {
          const slowStreamError = e?.kind
            ? e
            : new AiServiceErrorImpl({
                kind: 'network',
                message: e?.message || '慢流请求传输中断',
                providerId,
                purpose: params.purpose,
              })
          ;(slowStreamError as { code?: string }).code = 'slow_stream_interrupted'
          lastErr = slowStreamError
          stopPhysicalHeartbeat()
          reportPhysical(
            attempt,
            'failed',
            undefined,
            lastErr.message,
            undefined,
            undefined,
            { interruptionCode: 'slow_stream_interrupted' },
          )
          break
        }
        // A malformed structured response is an application-level terminal
        // error, not a transient network failure. Do not send it through the
        // long network retry and heartbeat recovery path.
        if (e?.kind === 'json') {
          lastErr = e
          stopPhysicalHeartbeat()
          reportPhysical(attempt, 'failed', undefined, e?.message || String(e))
          break
        }
        // The Electron main bridge returns already-classified errors
        // (timeout/auth/http/network); only unclassified errors may fall
        // through to the generic network branch.
        if (e?.kind === 'timeout' || e?.kind === 'auth') {
          lastErr = e
          stopPhysicalHeartbeat()
          reportPhysical(attempt, 'failed', undefined, e?.message || String(e))
          break
        }
        // Timeout?
        if (e.name === 'TimeoutError' || e.name === 'AbortError') {
          lastErr = new AiServiceErrorImpl({ kind: 'timeout', message: '请求超时', providerId, purpose: params.purpose })
          reportPhysical(attempt, params.signal?.aborted ? 'canceled' : 'failed', undefined, '请求超时')
          if (doRetry && attempt < maxRetries) {
            try { await waitWithSignal(RETRY_DELAYS[attempt], params.signal) }
            catch (ce: any) {
              if (params.signal?.aborted) return throwCanceled()
              throw ce
            }
            continue
          }
          break
        }
        // HTTP error. Renderer fetch throws a Response; the Electron main
        // bridge throws an already-classified AiServiceError.
        const httpError = e instanceof Response
          ? {
              status: e.status,
              providerSummary: e.clone().text().then((text: string) => {
                try { return extractProviderErrorSummary(JSON.parse(text)) }
                catch { return String(text || '').slice(0, 500) }
              }),
            }
          : (e?.kind === 'http' || e?.kind === 'auth')
            ? { status: e.statusCode, providerSummary: Promise.resolve(e.providerErrorSummary || '') }
            : null
        if (httpError) {
          const status = httpError.status
          if (!Number.isFinite(status) || status == null) {
            const protocolError = new AiServiceErrorImpl({
              kind: 'network',
              message: e?.message || '网络传输异常，未获得有效 HTTP 状态',
              providerId,
              purpose: params.purpose,
            })
            lastErr = protocolError
            stopPhysicalHeartbeat()
            reportPhysical(attempt, 'failed', undefined, protocolError.message)
            if (!getSlowStreamSawOutput() && attempt < physicalRetryCeiling) {
              try { await waitWithSignal(RETRY_DELAYS[attempt], params.signal) }
              catch (ce: any) {
                if (params.signal?.aborted) return throwCanceled()
                throw ce
              }
              continue
            }
            break
          }
          const providerMessage = await httpError.providerSummary
          stopPhysicalHeartbeat()
          reportPhysical(attempt, 'failed', undefined, `${status}: ${providerMessage || httpErrorMessage(status, '')}`)
          if (!getSlowStreamSawOutput() && doRetry && (status === 429 || status === 502 || status === 503) && attempt < maxRetries) {
            lastErr = new AiServiceErrorImpl({ kind: 'http', message: httpErrorMessage(status, providerMessage), providerId, purpose: params.purpose, statusCode: status, providerErrorSummary: providerMessage })
            try { await waitWithSignal(RETRY_DELAYS[attempt], params.signal) }
            catch (ce: any) {
              if (params.signal?.aborted) return throwCanceled()
              throw ce
            }
            continue
          }
          const toolsRejected = status === 400 && requestedTools &&
            providerMessage.toLowerCase().includes('tools unsupported')
          if (toolsRejected) {
            // A rejected tools request must reach the tool fallback immediately;
            // halving max_tokens cannot fix an unsupported tools parameter.
            throw new AiServiceErrorImpl({
              kind: 'http',
              message: httpErrorMessage(status, providerMessage),
              providerId,
              purpose: params.purpose,
              statusCode: status,
              providerErrorSummary: providerMessage,
            })
          }
          if (status === 400 && doRetry && attempt < maxRetries) {
            const downgrade = parseMaxTokensDowngrade(providerMessage, effectiveMaxTokens())
            if (downgrade) {
              // Provider-declared limits are authoritative; retry once at the
              // allowed value instead of blind halving.
              params = { ...params, maxTokens: downgrade.to, retry: false }
              maxTokensDowngrade = downgrade
              logRequest(log, {
                step: params.meta?.step,
                purpose: params.purpose,
                providerId,
                model: resolveModel(provider, params.model),
                prompt: promptPreview,
                result: `max-tokens-downgraded: ${downgrade.from} -> ${downgrade.to}; ${downgrade.reason}`,
                durationMs: Date.now() - startTime,
                success: false,
                skillId: params.meta?.skillId,
                agentId: params.meta?.agentId,
                providerType,
                transport,
                finalUrl,
                statusCode: 400,
                providerErrorSummary: providerMessage,
                maxTokens: downgrade.to,
              })
              const diag = (typeof window !== 'undefined') ? (window as any).DiagLogger : null
              if (diag && typeof diag.log === 'function') {
                diag.log('warn', 'ai-service/max-tokens', 'max-tokens-downgraded', {
                  providerId,
                  purpose: params.purpose,
                  from: downgrade.from,
                  to: downgrade.to,
                  reason: downgrade.reason,
                })
              }
              continue
            }
            lastErr = new AiServiceErrorImpl({ kind: 'http', message: httpErrorMessage(400, providerMessage), providerId, purpose: params.purpose, statusCode: 400, providerErrorSummary: providerMessage })
            break
          }
          if (status === 401 || status === 403) {
            throw new AiServiceErrorImpl({ kind: 'auth', message: httpErrorMessage(status, providerMessage), providerId, purpose: params.purpose, statusCode: status })
          }
          lastErr = new AiServiceErrorImpl({ kind: 'http', message: httpErrorMessage(status, providerMessage), providerId, purpose: params.purpose, statusCode: status })
          if (doRetry && attempt < maxRetries) {
            try { await waitWithSignal(RETRY_DELAYS[attempt], params.signal) }
            catch (ce: any) {
              if (params.signal?.aborted) return throwCanceled()
              throw ce
            }
            continue
          }
          break
        }
        // Network error
        lastErr = new AiServiceErrorImpl({ kind: 'network', message: e.message || '网络错误', providerId, purpose: params.purpose })
        stopPhysicalHeartbeat()
        reportPhysical(attempt, 'failed', undefined, e.message || '网络错误')
        const noRetry = e.message?.includes('API Key') || e.message?.includes('访问被禁止') || e.message?.includes('接口不存在')
        if (!getSlowStreamSawOutput() && attempt < physicalRetryCeiling && !noRetry) {
          try { await waitWithSignal(RETRY_DELAYS[attempt], params.signal) }
          catch (ce: any) {
            if (params.signal?.aborted) return throwCanceled()
            throw ce
          }
          continue
        }
        break
      }
      }
    } finally {
      stopPhysicalHeartbeat()
    }

    // Heartbeat reconnection is only for a stream that actually started and
    // then dropped. A request that never produced bytes has nothing to
    // reconnect to; it must fail after the fast retry budget instead of
    // silently waiting through three 60-second heartbeat probes.
    if (
      !getSlowStreamSawOutput()
      && doRetry
      && lastErr
      && lastErr.kind !== 'json'
      && lastErr.kind !== 'timeout'
      && sawStreamOutput
    ) {
      let hbAttempt = 0
      while (hbAttempt < MAX_HEARTBEAT_ATTEMPTS) {
        hbAttempt++
        try {
          await waitWithSignal(HEARTBEAT_INTERVAL, params.signal)
        } catch (e: any) {
          if (params.signal?.aborted || e.name === 'AbortError') {
            return throwCanceled()
          }
          throw e
        }
        try {
          const hbSignal = timeoutMs == null
            ? params.signal
            : combineSignals(params.signal, makeTimeoutSignal(timeoutMs))
          const hbParams = { ...params, signal: hbSignal }
          streamBuffer = ''
          reasoningBuffer = ''
          currentPhysicalAttempt = hbAttempt
          const result = await _rawCall(provider, hbParams, timeoutMs)
          let finalText = filterThinkingTags(result.text)
          if (params.jsonMode) {
            finalText = await tryJsonParse(finalText, () => _rawCall(provider, { ...params, jsonMode: false }, timeoutMs).then(r => r.text))
          }
          const durationMs = Date.now() - startTime
          const _hbModel = resolveModel(provider, params.model)
          logRequest(log, { step: params.meta?.step, purpose: params.purpose, providerId, model: _hbModel, prompt: promptPreview, result: finalText.slice(0, 200), durationMs, success: true, skillId: params.meta?.skillId, agentId: params.meta?.agentId, usage: result.usage })
          reportPhysical(hbAttempt, 'success', result, undefined, 'heartbeat_retry')
          return {
            text: finalText,
            reasoning: result.reasoning,
            providerId,
            model: resolveModel(provider, params.model),
            durationMs,
            usage: result.usage,
            usageUnavailable: !result.usage,
            maxTokens: result.maxTokens ?? effectiveMaxTokens(),
            modelCapability,
            retryStrategy: params.retryStrategy,
            contextBudget,
            usageReconciliation: buildUsageReconciliation({
              estimatedInputTokens: contextBudget.estimatedInputTokens,
              usage: result.usage,
            }),
          }
        } catch (hbErr: any) {
          if (params.signal?.aborted) {
            return throwCanceled()
          }
          reportPhysical(hbAttempt, 'failed', undefined, hbErr?.message || String(hbErr), 'heartbeat_retry')
          console.warn('[HEARTBEAT] Probe ' + hbAttempt + ' failed: ' + ((hbErr && (hbErr.message || String(hbErr))) || 'unknown'))
        }
      }
    }

    const durationMs = Date.now() - startTime
    logRequest(log, {
      step: params.meta?.step,
      purpose: params.purpose,
      providerId,
      model: resolveModel(provider, params.model),
      prompt: promptPreview,
      result: lastErr?.message || 'unknown',
      durationMs,
      success: false,
      skillId: params.meta?.skillId,
      agentId: params.meta?.agentId,
      providerType,
      transport,
      finalUrl,
      statusCode: lastErr?.statusCode,
      providerErrorSummary: lastErr?.providerErrorSummary,
      downgradeReason: maxTokensDowngrade ? 'max-tokens-downgraded' : undefined,
      maxTokens: maxTokensDowngrade?.to ?? effectiveMaxTokens(),
    })
    throw lastErr || new AiServiceErrorImpl({ kind: 'network', message: 'unknown error', providerId, purpose: params.purpose })
  }

  async function fetchModelsForProvider(p: ProviderLike): Promise<string[]> {
    const startTime = Date.now()
    const providerId = p.id
    const providerType = normalizeProviderType(p.providerType)
    const transport: 'main-process' | 'renderer-fetch' = hasMainNet() ? 'main-process' : 'renderer-fetch'
    const url = buildProviderModelsUrl({
      baseUrl: p.baseUrl,
      providerType,
      endpointMode: p.endpointMode,
      modelsPath: p.modelsPath,
    })
        const headers = buildProviderModelsHeaders(providerType, p.apiKey)
    try {
      let resp: Response
      if (hasMainNet()) {
        const mainResult = await mainNetRequest({ url, method: 'GET', headers }, makeTimeoutSignal(30_000))
        if ('__mainNetError' in mainResult) {
          const result = mainResult.result
          throw new AiServiceErrorImpl({
            kind: result.kind === 'auth' ? 'auth' : result.kind === 'timeout' ? 'timeout' : 'http',
            message: '获取模型列表失败：' + (result.message || httpErrorMessage(result.statusCode || 0)),
            providerId,
            purpose: 'generate',
            statusCode: result.statusCode,
          })
        }
        resp = mainResult
      } else {
        resp = await fetch(url, { method: 'GET', headers, signal: makeTimeoutSignal(30_000) })
      }
      if (!resp.ok) {
        const status = resp.status
        const errorBody = await readErrorBody(resp)
        const providerMessage = extractProviderErrorSummary(errorBody)
        const kind = status === 401 || status === 403 ? 'auth' : 'http'
        throw new AiServiceErrorImpl({
          kind,
          message: (kind === 'auth' ? '模型列表鉴权失败：' + providerMessage : '获取模型列表失败：' + httpErrorMessage(status, providerMessage)),
          providerId,
          purpose: 'generate',
          statusCode: status,
        })
      }
      const data = await resp.json()
      const models = getProviderProtocol(p.providerType).extractModels(data)
      logRequest(log, {
        purpose: 'generate', providerId, model: p.selectedModel,
        prompt: '获取模型列表', result: models.join(', '),
        durationMs: Date.now() - startTime, success: true,
        providerType, transport, finalUrl: sanitizeUrlForLog(url),
      })
      return models
    } catch (e: any) {
      const error = e?.kind ? e : new AiServiceErrorImpl({
        kind: e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'timeout' : 'network',
        message: e?.name === 'TimeoutError' || e?.name === 'AbortError' ? '获取模型列表超时' : (e?.message || '获取模型列表失败'),
        providerId,
        purpose: 'generate',
      })
      logRequest(log, {
        purpose: 'generate', providerId, model: p.selectedModel,
        prompt: '获取模型列表', result: error.message,
        durationMs: Date.now() - startTime, success: false,
        providerType, transport, finalUrl: sanitizeUrlForLog(url),
        statusCode: error.statusCode, providerErrorSummary: error.providerErrorSummary,
      })
      throw error
    }
  }

  async function fetchModels(providerId: string): Promise<string[]> {
    const p = providerStore.providers.find(x => x.id === providerId)
    if (!p) {
      const error = new AiServiceErrorImpl({ kind: 'http', message: '未找到供应商：' + providerId, providerId, purpose: 'generate' })
      logRequest(log, { purpose: 'generate', providerId, prompt: '获取模型列表', result: error.message, durationMs: 0, success: false })
      throw error
    }
    return fetchModelsForProvider(p)
  }

  async function testConnection(providerId: string): Promise<{ connected: boolean; error?: string; note?: string }> {
    try {
      await fetchModels(providerId)
      return { connected: true }
    } catch (e: any) {
      return { connected: false, error: e.message }
    }
  }

  async function testConnectionForProvider(provider: ProviderLike): Promise<{ connected: boolean; error?: string; note?: string }> {
    try {
      await fetchModelsForProvider(provider)
      return { connected: true }
    } catch (e: any) {
      const status = e?.statusCode
      const modelsEndpointUnsupported = status === 404 || status === 405
      if (modelsEndpointUnsupported) {
        try {
          await _rawCall(provider, {
            purpose: 'generate',
            messages: [{ role: 'user', content: '连接测试' }],
            stream: false,
            retry: false,
            timeoutMs: 30_000,
            maxTokens: 1,
          }, 30_000)
          return {
            connected: true,
            note: '该供应商未提供模型列表接口，已用最小对话请求验证连接（会消耗极小 token）',
          }
        } catch (chatError: any) {
          return { connected: false, error: chatError?.message || '连接失败' }
        }
      }
      return { connected: false, error: e?.message || '连接失败' }
    }
  }

  return { callAi, fetchModels, fetchModelsForProvider, testConnection, testConnectionForProvider }
}

// ── Singleton ───────────────────────────────────────────────────────

let _aiServiceInstance: AiService | null = null

/**
 * Returns the singleton AiService instance.
 * Lazily created on first call. Imports stay local to defer store creation until first use.
 * All callers should use this instead of createAiService() directly.
 */
export async function getAiService(): Promise<AiService> {
  if (!_aiServiceInstance) {
    const { useProviderStore } = await import('../stores/provider')
    const { useExecutionLogStore } = await import('../stores/executionLog')
    _aiServiceInstance = createAiService(
      useProviderStore() as any,
      useExecutionLogStore() as any
    )
  }
  return _aiServiceInstance
}
