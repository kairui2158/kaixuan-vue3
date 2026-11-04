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
  updateInputTokenCalibration,
  resolveContextBudget,
  type ContextBudgetResult,
  type UsageReconciliation,
} from './contextBudget'
import {
  buildCacheUsageSummary,
  normalizeUsage,
  type CacheUsageSummary,
} from './traceFieldNormalizer'
import {
  buildRequestContextComposition,
  type RequestContextComposition,
} from './requestContextComposition'
import {
  buildProviderChatUrl,
  buildProviderHeaders,
  buildProviderModelsUrl,
  buildProviderModelsHeaders,
  getProviderProtocol,
  getProviderReasoningControl,
  httpErrorMessage,
  extractProviderErrorSummary,
  readErrorBody,
  sanitizeUrlForLog,
  normalizeProviderType,
} from './providerProtocols'
import {
  classifyProviderSoftFailure,
  extractSoftProviderErrorBody,
  normalizeProviderResponse,
  type ProviderResponseContract,
} from './providerResponseContract'
import {
  createStreamFrame,
  parseStreamFrames,
  type StreamFrame,
  type StreamParseState,
} from './streamContract'
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
import { compactToolContextMessages } from './toolContextCompactor'
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
import {
  classifyToolBudgetClass,
  type ToolRunBudget,
  type ToolRunBudgetClass,
} from './toolRunBudget'
import {
  createProviderScheduler,
  ProviderSchedulerCanceledError,
  type ProviderQueueEvent,
} from './providerScheduler'

// ── Types (carried from Step 2 interface) ──────────────────────────

export type ProviderPurpose = 'generate' | 'rewrite' | 'verify' | 'detect' | 'image' | 'video'
export type { ProviderQueueEvent } from './providerScheduler'

export interface AiServiceError {
  kind: 'network' | 'timeout' | 'http' | 'json' | 'auth' | 'canceled'
  message: string
  providerId?: string
  purpose?: ProviderPurpose
  statusCode?: number
  providerErrorSummary?: string
  retryable?: boolean
  softError?: boolean
}

export class AiServiceErrorImpl extends Error implements AiServiceError {
  kind: AiServiceError['kind']
  providerId?: string
  purpose?: ProviderPurpose
  statusCode?: number
  providerErrorSummary?: string
  retryable?: boolean
  softError?: boolean
  constructor(params: AiServiceError) {
    super(params.message)
    this.name = 'AiServiceError'
    this.kind = params.kind
    this.providerId = params.providerId
    this.purpose = params.purpose
    this.statusCode = params.statusCode
    this.providerErrorSummary = params.providerErrorSummary
    this.retryable = params.retryable
    this.softError = params.softError
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
    /** Task-owned classified read/write budget; one object spans the whole tool run. */
    toolRunBudget?: ToolRunBudget
    onCompatibilityMode?: (reason: string) => void
    onConvergenceStart?: () => void
    onConvergencePseudoCall?: (event: { text: string; reason: string }) => void
    onConvergenceCorrected?: () => void
    onConvergenceLocalFallback?: (reason: string) => void
    onToolWarning?: (message: string) => void
    /** Native tool-call stream delta; used for progress reporting, not transport liveness. */
    onStreamToolProgress?: (progress: StreamToolProgressEvent) => void
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
      argumentsRaw?: string
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
  /** @internal Number of older successful read tool results compacted for this physical request. */
  contextCompactedMessageCount?: number
  /** Observability only: request prefix/cache provenance, never affects the wire request. */
  contextComposition?: {
    layer?: string
    step?: number
    providerId?: string
    model?: string
    stableSystemPrefix?: string
    stableUserPrefix?: string
  }
  /** @internal Used by tool-loop and downgrade wrappers to classify physical requests. */
  physicalPhase?: PhysicalCallEvent['phase']
  /** @internal Wraps the caller's onChunk to capture per-request stream deltas. */
  onPhysicalCall?: (event: PhysicalCallEvent) => void
  /** Provider-slot queue observability; fires before a physical request starts. */
  onProviderQueue?: (event: ProviderQueueEvent) => void
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
    /** Single-source provider channel provenance for diagnostics. */
    providerSource?: 'agent' | 'layer' | 'global' | 'auxiliary' | 'none'
    /** Model provenance for pipeline requests resolved by the caller. */
    modelSource?: string
  }
  /** Stream callback contract: receives only the newly emitted text for this chunk. */
  onChunk?: (text: string) => void
  /** Stream callback contract: receives only the newly emitted reasoning text for this chunk. */
  onReasoning?: (text: string) => void
  /** Stream callback contract: a native tool-call delta arrived, which is task progress. */
  onStreamToolProgress?: (progress: StreamToolProgressEvent) => void
  onUsage?: (usage: any) => void
  onProgress?: (percent: number, label: string) => void
  /** @internal Keep the legacy public path clean; P6 callers receive a typed helper instead. */
}

export type PhysicalCallPhase =
  | 'normal'
  | 'tool_iteration'
  | 'tool_convergence'
  | 'downgrade_initial'
  | 'downgrade_retry'
  | 'continuation'
  | 'schema_retry'
  | 'direct_retry'
  | 'retry'
  | 'heartbeat_retry'

export interface PhysicalCallEvent {
  /** Stable identity for one physical network request; running/finish records use the same value. */
  physicalCallId?: string
  phase: PhysicalCallPhase
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
  /** Provider channel provenance copied from the request meta for trace projection. */
  providerSource?: NonNullable<CallAiParams['meta']>['providerSource']
  retryStrategy?: 'thinking_disabled' | 'max_tokens_raised' | 'prompt_only'
  /** Effective max_tokens after overrides or a 400 downgrade; null means intentionally omitted. */
  maxTokens?: number | null
  /** Resolved capability provenance; unknown stays unknown instead of becoming a fake cap. */
  modelCapability?: ModelCapability
  /** Pre-request input context budget decision. */
  contextBudget?: ContextBudgetResult
  /** Reconciles estimated input tokens against provider-reported usage. */
  usageReconciliation?: UsageReconciliation
  /** Provider-reported cache usage summary; absent usage is never treated as a hit. */
  cacheUsageSummary?: CacheUsageSummary
  /** Observability-only request composition; excludes prompt full text. */
  contextComposition?: RequestContextComposition
  /** True when a running request is alive but has produced no stream bytes yet. */
  heartbeat?: boolean
  /** Stable classification for transport interruptions delegated to a task layer. */
  interruptionCode?: 'slow_stream_interrupted' | 'reasoning_only_stalled'
  /** Number of older successful read tool results compacted for this physical request. */
  contextCompactedMessageCount?: number
  /** Number of provider tool calls extracted from this physical response. */
  toolCallCount?: number
  /** Provider tool-call names extracted from this physical response. */
  toolCallNames?: string[]
  /** Request start to first body/reasoning delta. */
  firstTokenMs?: number
  /** Streaming time after the first delta. */
  outputMs?: number
  /** Request start to the first body/tool-progress delta. */
  firstContentAt?: number
  /** Last time a body/tool-progress delta arrived. */
  lastContentAt?: number
  /** Request start to the most recent reasoning delta. */
  lastReasoningAt?: number
  /** How long the stream ran while producing reasoning but no body. */
  bodyAbsentMs?: number
  /** HTTP status returned by the provider; absent for pure network failures. */
  statusCode?: number
  /** Compact provider error body, kept separate from the human-facing error. */
  providerErrorSummary?: string
  /** Sanitized endpoint actually used by this request. */
  finalUrl?: string
  /** Network bridge that carried this request. */
  transport?: 'main-process' | 'renderer-fetch'
}

export interface CallAiResult {
  text: string
  reasoning: string
  providerId?: string
  providerType?: string
  model?: string
  durationMs?: number
  usage?: any
  /** True when the provider response carried no usage block. */
  usageUnavailable?: boolean
  finishReason?: string
  /** Why a tool-loop convergence/checkpoint result was produced; distinguishes terminal write failures and budget stops from discussion convergence. */
  convergenceReason?: string
  /** Which classified budget stopped the run; separates read starvation from write exhaustion. */
  toolRunBudgetPhase?: ToolRunBudgetClass
  toolCalls?: NormalizedToolCall[]
  toolResults?: Array<{ call: { id?: string; name: string; input?: unknown; argumentsRaw?: string }; result: ToolResult }>
  /** Compact cross-turn audit for the next request's system context. */
  toolAudit?: ReturnType<typeof buildCrossTurnToolAudit>
  /** Initial request plus only the messages appended in later native-tool rounds. */
  toolRequestDeltas?: CallAiParams['messages']
  /** Present when the provider does not support native tools and the JSON protocol path was used. */
  compatibilityMode?: 'json-protocol'
  /** Present when a compatibility-mode response executed editor.write through the unified tool. */
  compatibilityWrite?: boolean
  /** Marks locally composed terminal text so traces can distinguish it from model prose. */
  textOrigin?: 'application' | 'model'
  /** Present when a provider with declared native-tool support rejected tools at request time. */
  toolsDowngraded?: 'json-protocol'
  /** Pre-request input context budget decision for the initial physical call. */
  contextBudget?: ContextBudgetResult
  /** Reconciles estimated input tokens against provider-reported usage. */
  usageReconciliation?: UsageReconciliation
  /** Total older successful read tool results compacted during native tool rounds. */
  contextCompactedMessageCount?: number
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
  testGenerationProbe(provider: ProviderLike): Promise<{ connected: boolean; error?: string; model?: string; durationMs?: number }>
}

// ── Constants ──────────────────────────────────────────────────────

const DEFAULT_NON_STREAM_TIMEOUT = 300_000
const DEFAULT_STREAM_TIMEOUT = 600_000
const RETRY_DELAYS = [1000, 2000, 3000]
const MAX_RETRIES = 3
const IDLE_THRESHOLD = 15_000
const IDLE_THRESHOLD_LOW = 10_000
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

function resolveRequestCompositionContent(params: Pick<CallAiParams, 'messages' | 'jsonMode'>): {
  systemPrompt: string
  userPrompt: string
} {
  const wireMessages = withTableOutputGuideline(params.messages, params.jsonMode === true)
  const systemContents = wireMessages
    .filter(message => message.role === 'system')
    .map(message => String(message.content ?? ''))
  const firstUserMessage = wireMessages.find(message => message.role === 'user')
  return {
    systemPrompt: systemContents.join('\n'),
    userPrompt: String(firstUserMessage?.content ?? ''),
  }
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
  const mode = params.toolPolicy?.executionPlan?.mode
  return mode === 'final-draft' || mode === 'single-pass'
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

export type UserHandoffVerdict =
  | { kind: 'none' }
  | { kind: 'legacy_preview_response' }
  | { kind: 'needs_user_handoff' }

const LEGACY_PREVIEW_HANDOFF_MARKERS = [
  /【(?:修改预览|写回状态|批准写回|写入未执行)】/,
  /^#{2,6}\s*(?:修改预览|批准写回|写入未执行)\s*$/im,
  /\bstatus\s*:\s*pending\b/i,
  /\bawait_user\s*:\s*true\b/i,
  /等待(?:你|用户|作者)?(?:确认|批准|批准写回)/,
]

const USER_HANDOFF_QUESTION_MARKERS = [
  /(?:是否|要不要|需要我|请(?:确认|选择|回复|告诉我)|你(?:希望|想要|倾向)|等(?:你|用户|作者)?(?:确认|回复|选择))/,
  /[？?]\s*$/,
]

export function detectUserHandoffResponse(input: {
  text?: string | null
  executionPlan?: LongDocumentExecutionPlan | null
  hasSuccessfulWrite?: boolean
  successfulWriteCount?: number
  plannedWriteCount?: number
}): UserHandoffVerdict {
  const text = String(input?.text || '').trim()
  if (!text) return { kind: 'none' }
  const executionPlan = input.executionPlan || null
  const successfulWriteCount = input.successfulWriteCount
    ?? (input.hasSuccessfulWrite ? 1 : 0)
  const plannedWriteCount = input.plannedWriteCount
    ?? (executionPlan?.segments.length || (successfulWriteCount > 0 ? successfulWriteCount : 1))
  const writeTaskIncomplete = Boolean(executionPlan
    && executionPlan.mode !== 'final-draft'
    && executionPlan.operation !== 'discussion'
    && successfulWriteCount < plannedWriteCount)

  if (LEGACY_PREVIEW_HANDOFF_MARKERS.some(pattern => pattern.test(text))) {
    return { kind: 'legacy_preview_response' }
  }

  // Only a write task that has not produced a successful write may stop on a
  // user question. A completed write followed by a question is normal prose.
  if (writeTaskIncomplete) {
    const asksUser = USER_HANDOFF_QUESTION_MARKERS.some(pattern => pattern.test(text))
    const requestsChoice = /(?:二选一|两个方案|几个选项|选择[：:])/i.test(text)
    if (asksUser || requestsChoice) return { kind: 'needs_user_handoff' }
  }
  return { kind: 'none' }
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
  'invariant_violation',
  'write_target_mismatch',
  'final_draft_mode_active',
])

const WHOLE_DOCUMENT_REPLACEMENT_CODE = 'document_too_large_for_whole_replacement'
const WHOLE_DOCUMENT_REPLACEMENT_VIOLATION_LIMIT = 2

function isBlankReplaceMatchFailure(item: { call: NormalizedToolCall; result: ToolResult }): boolean {
  return item.call.name === 'editor.write'
    && item.result.ok === false
    && item.result.error?.code === 'invalid_input'
    && typeof item.result.error?.message === 'string'
    && item.result.error.message.includes('若目的是删除原文，请使用 delete 操作')
}

function isReorderCommandAsPhantomToolFailure(item: { call: NormalizedToolCall; result: ToolResult }): boolean {
  return item.call.name === 'editor.reorder_sections'
    && item.result.ok === false
    && item.result.error?.code === 'tool_not_found'
}

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
  onToolProgress?: (progress: StreamToolProgressEvent) => void
  onProviderQueue?: (event: ProviderQueueEvent) => void
}

export interface StreamToolProgressEvent {
  protocol: string
  toolCallCount: number
  argumentCharacters: number
}

type MainNetStreamResult = {
  text: string
  reasoning: string
  finishReason?: string
  usage?: any
  raw?: any
}

function throwProviderSoftError(
  raw: unknown,
  provider: ProviderLike,
  purpose: ProviderPurpose,
  usage?: any,
  hasText = false
): never {
  const contract: ProviderResponseContract = {
    ok: true,
    kind: 'ok',
    transportKind: 'stream',
    text: hasText ? 'present' : '',
    reasoning: '',
    usage,
    raw,
    canceled: false,
  }
  const classification = classifyProviderSoftFailure(contract)
  const summary = classification.softError
    ? extractProviderErrorSummary(extractSoftProviderErrorBody(raw))
    : ''
  const quotaText = classification.quota
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
    retryable: false,
    softError: true,
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

function collectStreamToolCalls(json: any, protocolName: string, state: StreamToolCallState): boolean {
  if (protocolName === 'gemini') {
    const parts = json?.candidates?.[0]?.content?.parts
    if (!Array.isArray(parts)) return false
    let progressed = false
    for (const part of parts) {
      if (!part?.functionCall?.name) continue
      state.geminiParts.push({ functionCall: { name: String(part.functionCall.name), args: part.functionCall.args ?? {} } })
      progressed = true
    }
    return progressed
  }

  if (protocolName === 'anthropic') {
    let progressed = false
    if (json?.type === 'content_block_start' && json?.content_block?.type === 'tool_use') {
      state.anthropicBlocks.set(Number(json.index ?? 0), {
        id: json.content_block.id ? String(json.content_block.id) : undefined,
        name: json.content_block.name ? String(json.content_block.name) : undefined,
        json: '',
      })
      progressed = true
    }
    if (json?.type === 'content_block_delta' && json?.delta?.type === 'input_json_delta') {
      const block = state.anthropicBlocks.get(Number(json.index ?? 0))
      if (block) {
        const partialJson = String(json.delta.partial_json || '')
        if (partialJson) {
          block.json += partialJson
          progressed = true
        }
      }
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
        progressed = true
      }
    }
    return progressed
  }

  const deltas = json?.choices?.[0]?.delta?.tool_calls
  const calls = Array.isArray(deltas) ? deltas : json?.choices?.[0]?.message?.tool_calls
  if (!Array.isArray(calls)) return false
  let progressed = false
  for (const delta of calls) {
    const index = Number.isFinite(delta?.index) ? Number(delta.index) : state.openAIToolCalls.length
    while (state.openAIToolCalls.length <= index) {
      state.openAIToolCalls.push({ id: '', type: 'function', function: { name: '', arguments: '' } })
    }
    const target = state.openAIToolCalls[index]
    if (delta?.id) {
      target.id = String(delta.id)
      progressed = true
    }
    if (delta?.function?.name) {
      target.function.name = String(delta.function.name)
      progressed = true
    }
    if (typeof delta?.function?.arguments === 'string' && delta.function.arguments) {
      target.function.arguments += delta.function.arguments
      progressed = true
    }
  }
  return progressed
}

function summarizeStreamToolProgress(protocolName: string, state: StreamToolCallState): StreamToolProgressEvent {
  if (protocolName === 'anthropic') {
    let argumentCharacters = 0
    for (const block of state.anthropicBlocks.values()) argumentCharacters += block.json.length
    for (const item of state.anthropicContent) {
      try { argumentCharacters += JSON.stringify(item.input || {}).length } catch { /* ignore malformed progress payload */ }
    }
    return {
      protocol: protocolName,
      toolCallCount: state.anthropicBlocks.size + state.anthropicContent.length,
      argumentCharacters,
    }
  }
  if (protocolName === 'gemini') {
    let argumentCharacters = 0
    for (const part of state.geminiParts) {
      try { argumentCharacters += JSON.stringify(part.functionCall.args ?? {}).length } catch { /* ignore malformed progress payload */ }
    }
    return { protocol: protocolName, toolCallCount: state.geminiParts.length, argumentCharacters }
  }
  let argumentCharacters = 0
  for (const call of state.openAIToolCalls) argumentCharacters += call.function.arguments.length
  return { protocol: protocolName, toolCallCount: state.openAIToolCalls.length, argumentCharacters }
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
  ,
  onProviderQueue?: (event: ProviderQueueEvent) => void
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
        if (collectStreamToolCalls(json, protocolName, toolCallState)) {
          cb.onToolProgress?.(summarizeStreamToolProgress(protocolName, toolCallState))
        }
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

function createFirstOutputStreamSignal(
  timeoutMs: number,
  externalSignal?: AbortSignal,
): { signal: AbortSignal; markOutput: () => void; dispose: () => void } {
  const controller = new AbortController()
  let sawOutput = false
  let disposed = false
  const timer = setTimeout(() => {
    if (sawOutput) return
    controller.abort(new DOMException('The operation was aborted', 'AbortError'))
  }, timeoutMs)
  const markOutput = () => {
    if (sawOutput) return
    sawOutput = true
    clearTimeout(timer)
  }
  const onExternalAbort = () => {
    markOutput()
    controller.abort(externalSignal?.reason)
  }
  if (externalSignal) {
    if (externalSignal.aborted) onExternalAbort()
    else externalSignal.addEventListener('abort', onExternalAbort, { once: true })
  }
  return {
    signal: controller.signal,
    markOutput,
    dispose: () => {
      if (disposed) return
      disposed = true
      clearTimeout(timer)
      externalSignal?.removeEventListener('abort', onExternalAbort)
    },
  }
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
    /** Pipeline provider channel provenance: agent | layer | global. */
    providerSource?: 'agent' | 'layer' | 'global' | 'auxiliary' | 'none'
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
    /** Pipeline provider channel provenance: agent | layer | global. */
    providerSource?: 'agent' | 'layer' | 'global' | 'auxiliary' | 'none'
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
      providerSource: params.providerSource,
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
      providerSource: params.providerSource,
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

function startStreamHeartbeat(signalId: string): () => void {
  const bridge = (window as any).electronAPI
  if (typeof bridge?.providerNetHeartbeat !== 'function') return () => {}
  const timer = setInterval(() => {
    bridge.providerNetHeartbeat(signalId).catch(() => {})
  }, 1000)
  return () => clearInterval(timer)
}

function hasMainNetFrameBridge(): boolean {
  return typeof window !== 'undefined' &&
    typeof (window as any).electronAPI?.onProviderNetStreamFrame === 'function'
}

function hasExternalSchedulerSnapshot(): boolean {
  return typeof window !== 'undefined' &&
    typeof (window as any).electronAPI?.providerNetSchedulerSnapshot === 'function'
}

async function refreshExternalSchedulerSnapshot(
  scheduler: ReturnType<typeof createProviderScheduler>
): Promise<void> {
  try {
    const response = await (window as any).electronAPI.providerNetSchedulerSnapshot()
    if (!response || response.ok !== true || !response.snapshot) {
      scheduler.setExternalSnapshot(null)
      return
    }
    scheduler.setExternalSnapshot(response.snapshot)
  } catch {
    scheduler.setExternalSnapshot(null)
  }
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

async function mainNetRequestRaw(request: {
  url: string
  method?: string
  headers: Record<string, string>
  body?: unknown
}, externalSignal?: AbortSignal): Promise<MainNetResult> {
  const signalId = 'provider-net-request-' + Date.now() + '-' + Math.random().toString(36).slice(2)
  const abortHandler = () => {
    ;(window as any).electronAPI.providerNetAbort(signalId).catch(() => {})
  }
  externalSignal?.addEventListener('abort', abortHandler, { once: true })
  try {
    const result = await (window as any).electronAPI.providerNetRequest({
      ...request,
      method: request.method || 'GET',
      signalId,
    })
    if (!result || typeof result !== 'object') {
      return { ok: false, kind: 'network', message: '主进程网络桥接返回空结果' }
    }
    return result
  } finally {
    externalSignal?.removeEventListener('abort', abortHandler)
  }
}

async function mainNetStream(
  request: {
    url: string
    headers: Record<string, string>
    body: Record<string, unknown>
    providerId?: string
    projectId?: string | null
  },
  callbacks: StreamCallbacks,
  protocolName: string,
  externalSignal?: AbortSignal,
  timeoutMs?: number | null,
  slowStreamTolerant = false,
  nativeToolExchange = false
): Promise<MainNetStreamResult> {
  const signalId = 'provider-net-' + Date.now() + '-' + Math.random().toString(36).slice(2)
  let ended = false
  let streamError: string | undefined = undefined
  let canceled = false
  let fullText = ''
  let reasoningText = ''
  let finishReason: string | undefined
  let streamUsage: Record<string, any> | undefined
  const frameQueue: StreamFrame[] = []
  let resolveFrame: (() => void) | null = null
  let parseState: StreamParseState | undefined
  let parseBudgetExceeded = false
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
      // A chunked SSE response can still end as a plain JSON body.
    }
  }
  const offFrame = (window as any).electronAPI.onProviderNetStreamFrame((payload: any) => {
    if (payload?.streamId !== signalId) return
    frameQueue.push(payload)
    if (payload.transportEvent === 'end') ended = true
    if (payload.transportEvent === 'canceled') {
      canceled = true
      ended = true
    }
    if (payload.transportEvent === 'error') {
      streamError = payload.message || '主进程流式请求失败'
      ended = true
    }
    if (payload.transportEvent === 'queued' || payload.transportEvent === 'started' || payload.transportEvent === 'canceled') {
      callbacks.onProviderQueue?.({
        providerId: request.providerId || '',
        status: payload.transportEvent,
        position: payload.position,
        waiting: payload.waiting,
        maxConcurrencyPerProvider: payload.maxConcurrencyPerProvider,
      })
    }
    if (resolveFrame) {
      const resolve = resolveFrame
      resolveFrame = null
      resolve()
    }
  })
  const invoke: Promise<MainNetResult> = (window as any).electronAPI.providerNetStream({
    ...request,
    signalId,
    slowStreamTolerant,
    providerId: request.providerId || undefined,
    projectId: request.projectId || undefined,
  })
  const stopHeartbeat = startStreamHeartbeat(signalId)
  invoke
    .then((result: MainNetResult) => {
      // The stream IPC returns failures without emitting a stream event. Wake
      // the consumer immediately so HTTP/auth failures do not wait for the
      // long stream timeout.
      if (result && result.ok === false) {
        ended = true
        if (resolveFrame) {
          const resolve = resolveFrame
          resolveFrame = null
          resolve()
        }
      }
    })
    .catch((error: unknown) => {
      streamError = error instanceof Error ? error.message : String(error)
      ended = true
      if (resolveFrame) {
        const resolve = resolveFrame
        resolveFrame = null
        resolve()
      }
  })
  const startedAt = Date.now()
  let streamSettled = false
  let sawStreamOutput = false
  let firstContentAt: number | null = null
  let lastContentAt: number | null = null
  let lastReasoningAt: number | null = null
  const markStreamOutput = () => {
    if (!sawStreamOutput) {
      sawStreamOutput = true
    }
  }
  // Stream liveness is owned exclusively by the main-process watchdog. The
  // renderer classifies terminal events; it must not race a second timer set.

  const abortHandler = () => {
    ;(window as any).electronAPI.providerNetAbort(signalId)
  }
  externalSignal?.addEventListener('abort', abortHandler, { once: true })

  const protocol = getProviderProtocol(protocolName)

  try {
    while (!ended || frameQueue.length > 0 || parseBudgetExceeded) {
      if (frameQueue.length === 0 && parseBudgetExceeded) {
        parseBudgetExceeded = false
      } else if (frameQueue.length === 0 && !ended) {
        await new Promise<void>(resolve => {
          resolveFrame = resolve
          setTimeout(resolve, 100)
        })
        if (!ended && timeoutMs && !sawStreamOutput && Date.now() - startedAt > timeoutMs) {
          throw new DOMException('The operation was aborted', 'AbortError')
        }
        continue
      }
      if (frameQueue.length === 0) continue
      const frames = frameQueue.splice(0, frameQueue.length)
      const parsed = parseStreamFrames(frames, protocolName as never, parseState, { maxDurationMs: 16 })
      parseState = parsed.state
      tryCapturePlainToolCallBody(parseState.buffer)
      for (const event of parsed.events) {
        const hasStreamToolProgress = collectStreamToolCalls(event.raw, protocolName, toolCallState)
        if (hasStreamToolProgress) {
          if (firstContentAt === null) firstContentAt = Date.now()
          lastContentAt = Date.now()
        }
        if (event.content) {
          if (firstContentAt === null) firstContentAt = Date.now()
          lastContentAt = Date.now()
        }
        if (event.reasoning) lastReasoningAt = Date.now()
        if (hasStreamToolProgress) {
          callbacks.onToolProgress?.(summarizeStreamToolProgress(protocolName, toolCallState))
        }
        finishReason = event.finishReason || finishReason
        if (event.reasoning) {
          markStreamOutput()
          const emitted = reasoningFilter.push(event.reasoning)
          if (emitted) {
            reasoningText += emitted
            callbacks.onReasoning?.(emitted)
          }
        }
        if (event.content) {
          markStreamOutput()
          fullText += event.content
          const emitted = chunkFilter.push(event.content)
          if (emitted) callbacks.onChunk?.(emitted)
        }
        if (event.usage) {
          streamUsage = { ...streamUsage, ...event.usage }
          callbacks.onUsage?.(streamUsage)
        }
      }
      if (parsed.state.pendingFrames.length > 0) parseBudgetExceeded = true
    }
    if (canceled) {
      throw new DOMException('The operation was aborted', 'AbortError')
    }
    const terminalStreamError = streamError as string | undefined
    if (terminalStreamError) {
      const error = new AiServiceErrorImpl({
        kind: 'network',
        message: terminalStreamError,
        providerId: undefined,
      }) as AiServiceErrorImpl & {
        code?: string
        bodyAbsentMs?: number
        firstContentAt?: number
        lastReasoningAt?: number
      }
      if (terminalStreamError.includes('未产生正文')) error.code = 'reasoning_only_stalled'
      error.bodyAbsentMs = Date.now() - startedAt
      error.firstContentAt = firstContentAt === null ? undefined : firstContentAt
      error.lastReasoningAt = lastReasoningAt === null ? undefined : lastReasoningAt
      throw error
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
    stopHeartbeat()
    externalSignal?.removeEventListener('abort', abortHandler)
    if (typeof offFrame === 'function') offFrame()
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
  const providerScheduler = createProviderScheduler()
  const externalSchedulerSnapshotEnabled = hasExternalSchedulerSnapshot()
  let externalSchedulerSnapshotTimer: ReturnType<typeof setInterval> | null = null
  if (externalSchedulerSnapshotEnabled) {
    void refreshExternalSchedulerSnapshot(providerScheduler)
    externalSchedulerSnapshotTimer = setInterval(() => {
      void refreshExternalSchedulerSnapshot(providerScheduler)
    }, 1000)
  }

  async function _rawCall(
    provider: ProviderLike,
    params: CallAiParams,
    timeoutMs: number | null,
    explicitToolRunBudget?: ToolRunBudget
  ) {
    // In Electron the main process owns real acquire/queue semantics. A
    // renderer-side slot here would double-count every physical request and
    // race the main scheduler for abort handling.
    if (hasMainNet()) {
      return await _rawCallWithSlot(provider, params, timeoutMs, explicitToolRunBudget)
    }
    let slot: Awaited<ReturnType<typeof providerScheduler.acquire>>
    try {
      slot = await providerScheduler.acquire({
        providerId: provider.id,
        signal: params.cancelSignal ?? params.signal,
        onEvent: params.onProviderQueue,
      })
    } catch (error) {
      if (error instanceof ProviderSchedulerCanceledError) {
        throw new AiServiceErrorImpl({
          kind: 'canceled',
          message: '用户取消：请求仍在等待供应商槽位',
          providerId: provider.id,
          purpose: params.purpose,
        })
      }
      throw error
    }
    try {
      return await _rawCallWithSlot(provider, params, timeoutMs, explicitToolRunBudget)
    } finally {
      slot.release()
    }
  }

  async function _rawCallWithSlot(
    provider: ProviderLike,
    params: CallAiParams,
    timeoutMs: number | null,
    explicitToolRunBudget?: ToolRunBudget
  ): Promise<{ text: string; reasoning: string; usage?: any; finishReason?: string; raw?: any; maxTokens?: number | null; modelCapability?: ModelCapability }> {
    const requestToolRunBudget = explicitToolRunBudget ?? params.toolPolicy?.toolRunBudget
    if (requestToolRunBudget && !requestToolRunBudget.canStartPhysicalRequest('read')) {
      throw new AiServiceErrorImpl({
        kind: 'network',
        message: '任务级物理请求安全网已达到，已阻止本次供应商外呼',
        providerId: provider.id,
        purpose: params.purpose,
      })
    }
    // Count at dispatch, not completion. The live panel must show a request
    // as consumed while it is in flight, and failed calls still spend the
    // transport safety net.
    requestToolRunBudget?.recordPhysicalRequest()
    const model = resolveModel(provider, params.model)
    const providerType = normalizeProviderType(provider.providerType)
    const headers = buildProviderHeaders(providerType, provider.apiKey)
    const temperature = resolveTemperature(provider, params.temperature)
    const maxTokens = resolveMaxTokens(provider, params.maxTokens)
    const modelCapability = resolveModelCapabilityForProvider(provider, params.maxTokens)
    const requestParams = params
    const wantStream = requestParams.stream ?? (
      params.purpose === 'generate' || params.purpose === 'rewrite'
    )
    let signal: AbortSignal | undefined = params.signal
    let firstOutputStreamSignal: ReturnType<typeof createFirstOutputStreamSignal> | null = null
    if (timeoutMs != null && wantStream) {
      firstOutputStreamSignal = createFirstOutputStreamSignal(timeoutMs, params.signal)
      signal = firstOutputStreamSignal.signal
    } else if (timeoutMs != null) {
      signal = combineSignals(params.signal, makeTimeoutSignal(timeoutMs))
    }
    const protocol = getProviderProtocol(providerType)
    const nativeToolExchange = Boolean(params.tools?.length) && supportsNativeTools(providerType)
    const nativeTools = nativeToolExchange
      ? buildProviderTools(providerType, params.tools as AgentToolDefinition[])
      : undefined
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
    const useMainNet = wantStream ? hasMainNetFrameBridge() : hasMainNet()
    const streamOwnerContext = {
      providerId: provider.id,
      projectId: params.meta?.projectId || null,
    }
    let resp: Response | null = null
    let mainNetResponse: ReturnType<typeof normalizeProviderResponse> | null = null
    if (useMainNet && !wantStream) {
      const mainResult = await mainNetRequestRaw({ url, method: 'POST', headers, body }, signal)
      if (mainResult.ok === false) {
        if (isMainNetCanceled(mainResult) || params.signal?.aborted) {
          throw new DOMException('The operation was aborted', 'AbortError')
        }
        throw mainNetError(mainResult, provider, params.purpose)
      }
      mainNetResponse = normalizeProviderResponse(
        {
          ok: true,
          statusCode: mainResult.statusCode,
          text: mainResult.text,
          data: mainResult.data,
          stream: false,
        },
        { protocolName: providerType, providerId: provider.id, purpose: params.purpose }
      )
    } else if (!useMainNet) {
      resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal })
    }
    if (resp && !resp.ok) throw resp
    if (!wantStream && !resp && !mainNetResponse) throw new Error('网络传输初始化失败')
    if (wantStream) {
      try {
        let result: MainNetStreamResult
        let streamUsage: any
        if (useMainNet) {
          result = await mainNetStream(
            { url, headers, body, ...streamOwnerContext },
            {
              onChunk: (text: string) => {
                firstOutputStreamSignal?.markOutput()
                requestParams.onChunk?.(text)
              },
              onReasoning: (text: string) => {
                firstOutputStreamSignal?.markOutput()
                requestParams.onReasoning?.(text)
              },
              onToolProgress: requestParams.onStreamToolProgress,
              onUsage: (u: any) => {
                streamUsage = u
                if (requestParams.onUsage) requestParams.onUsage(u)
              },
              onProviderQueue: requestParams.onProviderQueue,
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
              onChunk: (text: string) => {
                firstOutputStreamSignal?.markOutput()
                requestParams.onChunk?.(text)
              },
              onReasoning: (text: string) => {
                firstOutputStreamSignal?.markOutput()
                requestParams.onReasoning?.(text)
              },
              onToolProgress: requestParams.onStreamToolProgress,
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
        const streamContract: ProviderResponseContract = {
          ok: true,
          kind: 'ok',
          transportKind: 'stream',
          text: result.text,
          reasoning: result.reasoning,
          usage,
          finishReason: result.finishReason,
          raw: result.raw,
          canceled: false,
        }
        const streamSoftFailure = classifyProviderSoftFailure(streamContract)
        if (streamSoftFailure.softError || streamSoftFailure.quota || streamSoftFailure.abnormalZeroUsage) {
          throwProviderSoftError(result.raw, provider, params.purpose, usage, Boolean(result.text))
        }
        const finishReason = resolveFinishReason(result.finishReason, usage, maxTokens, Boolean(result.text))
        return { ...result, usage, finishReason, raw: result.raw, maxTokens, modelCapability }
      } finally {
        firstOutputStreamSignal?.dispose()
      }
    } else {
      const data = mainNetResponse?.raw ?? await resp!.json()
      const nonStreamContract: ProviderResponseContract = {
        ok: true,
        kind: 'ok',
        transportKind: 'non-stream',
        text: protocol.extractText(data),
        reasoning: protocol.extractReasoning(data),
        usage: protocol.extractUsage(data),
        finishReason: protocol.extractFinishReason(data),
        raw: data,
        canceled: false,
      }
      const nonStreamSoftFailure = classifyProviderSoftFailure(nonStreamContract)
      if (nonStreamSoftFailure.softError || nonStreamSoftFailure.quota) {
        const provisionalText = protocol.extractText(data)
        throwProviderSoftError(
          data,
          provider,
          params.purpose,
          normalizeTraceUsage(providerType, protocol.extractUsage(data)),
          Boolean(provisionalText)
        )
      }
      const text = mainNetResponse?.text ?? protocol.extractText(data)
      const reasoning = mainNetResponse?.reasoning ?? protocol.extractReasoning(data)
      const rawUsage = protocol.extractUsage(data)
      const usage = normalizeTraceUsage(providerType, rawUsage)
      const rawFinishReason = mainNetResponse?.finishReason ?? protocol.extractFinishReason(data)
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
    if (!prepared.tools || prepared.tools.length === 0) return await callAiWithoutTools(prepared)
    return await callAiWithToolFallback(prepared)
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
      providerId,
      model,
    })
    const loopScenario = params.toolPolicy?.scenario || (compatibleMode ? 'compatibility-json' : 'direct')
    const maxIterations = normalizeToolIterations(
      loopScenario,
      params.toolPolicy?.maxToolIterations,
    )
    const toolRunBudget = params.toolPolicy?.toolRunBudget
    let messages: CallAiParams['messages'] = params.messages.map(message => ({ ...message }))
    let contextCompactedMessageCount = 0
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
    let successfulWriteProgressCount = 0
    let consecutiveNoWriteProgressRounds = 0
    let consecutiveInvalidInputRounds = 0
    let invalidInputLoopSignature = ''
    let wholeDocumentReplacementViolations = 0
    let wholeDocumentSteeringSent = false
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
      if (
        iteration > 1
        && toolRunBudget
        && !toolRunBudget.canStartPhysicalRequest('read')
      ) {
        const snapshot = toolRunBudget.snapshot()
        params.toolPolicy?.onToolWarning?.(
          `任务级物理请求安全网已达到：物理请求 ${snapshot.physicalRequests}/${snapshot.maxPhysicalRequests}，读取 ${snapshot.readToolCalls}/${snapshot.maxReadToolCalls}，写入 ${snapshot.writeToolCalls}/${snapshot.reservedWriteToolCalls}。已停止第 ${iteration} 轮工具迭代并转入终局收口`,
        )
        return {
          text: `本轮未完整执行写入计划：物理请求安全网已达到（${snapshot.physicalRequests}/${snapshot.maxPhysicalRequests}）。已执行的写入与工具结果已保存到运行记录，请根据剩余批次继续下一轮。`,
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
          finishReason: 'tool_budget_exhausted',
          convergenceReason: 'classified tool run budget exhausted during tool iteration',
          toolRunBudgetPhase: 'control',
        }
      }
      const contextCompaction = compactToolContextMessages(messages)
      contextCompactedMessageCount += contextCompaction.compactedMessageCount
      if (contextCompaction.compactedMessageCount > 0) {
        params.toolPolicy?.onToolWarning?.(
          `第 ${iteration} 轮工具请求已压缩 ${contextCompaction.compactedMessageCount} 条历史读取结果；原文保留在运行记录`,
        )
      }
      const response = await callAiWithoutTools({
        ...params,
        messages: contextCompaction.messages,
        tools: effectiveTools,
        retry: params.retry,
        jsonMode: false,
        // Long-document runs set timeoutMs: null at the outer call. Preserve
        // that choice for every tool iteration; otherwise a 20k-character
        // document is still cut off by the non-stream default timeout.
        timeoutMs: params.timeoutMs,
        physicalPhase: iteration === 1 ? 'normal' : 'tool_iteration',
      })
      if (contextCompaction.compactedMessageCount > 0) {
        response.contextCompactedMessageCount = contextCompaction.compactedMessageCount
      }
      lastResult = response
      lastRawResponse = response.raw ?? null
      if (iteration === 1) {
        toolRequestDeltas.push(...messages.map(message => ({ ...message })))
      }

      const calls = extractProviderToolCallsFromResponse(providerType, response)
      if (calls.length === 0) {
        if (response.finishReason === 'tool_calls') {
          const protocolMessage = `供应商返回 finish_reason=tool_calls，但响应载荷中没有可执行的工具调用（providerType=${providerType}，正文 ${String(response.text || '').length} 字，推理 ${String(response.reasoning || '').length} 字）。已停止工具循环，避免静默续发物理请求`
          params.toolPolicy?.onToolWarning?.(protocolMessage)
          return {
            text: protocolMessage,
            textOrigin: 'application' as const,
            reasoning: '',
            usage: response.usage,
            usageUnavailable: response.usageUnavailable,
            providerId,
            model,
            durationMs: Date.now() - startTime,
            toolCalls: allToolCalls,
            toolResults: allToolResults,
            toolRequestDeltas,
            toolAudit: lastToolAudit,
            contextBudget,
            contextCompactedMessageCount,
            usageReconciliation: buildUsageReconciliation({
              estimatedInputTokens: contextBudget.estimatedInputTokens,
              usage: response.usage,
            }),
            finishReason: 'tool_calls_payload_missing',
            convergenceReason: 'provider finished with tool_calls but the response payload contained no executable tool calls',
          }
        }
        const toolLoopContract: ProviderResponseContract = {
          ok: true,
          kind: 'ok',
          transportKind: 'non-stream',
          text: response.text || '',
          reasoning: response.reasoning || '',
          usage: response.usage,
          finishReason: response.finishReason,
          raw: { message: response.text || '' },
          canceled: false,
        }
        const toolLoopSoftFailure = classifyProviderSoftFailure(toolLoopContract)
        if (toolLoopSoftFailure.softError || toolLoopSoftFailure.quota) {
          throwProviderSoftError(
            toolLoopContract.raw,
            provider,
            params.purpose,
            response.usage,
            Boolean(toolLoopContract.text),
          )
        }
        lastToolAudit = buildCrossTurnToolAudit({
          toolCalls: allToolCalls,
          toolResults: allToolResults,
          actualToolSurface: (effectiveTools || []).map(tool => ({ name: tool.name, policy: tool.policy })),
        })
        reportToolAuditDiagnostics(lastToolAudit)
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
        const handoffVerdict = detectUserHandoffResponse({
          text: response.text,
          executionPlan,
          hasSuccessfulWrite: successfulWriteCount > 0,
          successfulWriteCount,
          plannedWriteCount: executionPlan?.segments.length,
        })
        if (handoffVerdict.kind !== 'none') {
          const planAllowsOneContinuation = Boolean(
            coverageSummary
            && executionPlan
            && executionPlan.mode === 'edit-task'
            && coverageSummary.successfulWriteCount > 0
            && !coverageSummary.complete
            && !writeContinuationSteeringSent,
          )
          if (
            handoffVerdict.kind === 'needs_user_handoff'
            && planAllowsOneContinuation
          ) {
            // Partial progress plus a question first gets one continuation
            // steering round. A repeated question then becomes a real user
            // handoff, so an interactive question cannot silently checkpoint.
          } else {
          const legacyHandoff = handoffVerdict.kind === 'legacy_preview_response'
          const convergenceReason = legacyHandoff
            ? 'model followed the removed preview state machine instead of using editor.write'
            : 'model asked the user a question before completing the write plan'
          params.toolPolicy?.onToolWarning?.(
            legacyHandoff
              ? '模型输出了已删除的修改预览协议；保留原文并停止物理请求'
              : '模型向用户交接了未完成的写入任务；保留问题并停止物理请求',
          )
          return {
            ...response,
            toolCalls: allToolCalls,
            toolResults: allToolResults,
            toolRequestDeltas,
            toolAudit: lastToolAudit,
            contextBudget,
            contextCompactedMessageCount,
            usageReconciliation: buildUsageReconciliation({
              estimatedInputTokens: contextBudget.estimatedInputTokens,
              usage: response.usage,
            }),
            finishReason: handoffVerdict.kind,
            convergenceReason,
          }
          }
        }
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
        // A forbidden whole-document replacement is a terminal safety decision.
        // If the model stops calling tools and explains that decision to the
        // user, the correct next action is user choice, not another physical
        // continuation request that re-sends the same oversized document.
        const wholeDocumentReplacementRejected = wholeDocumentSteeringSent
          && wholeDocumentReplacementViolations > 0
          && successfulWriteCount === 0
        if (wholeDocumentReplacementRejected && finalVerdict.kind !== 'pseudo_tool_call') {
          params.toolPolicy?.onToolWarning?.(
            `整篇替换被拒后模型已停止调用工具；已停止物理请求，保留用户决策权`,
          )
          return {
            ...response,
            toolCalls: allToolCalls,
            toolResults: allToolResults,
            toolRequestDeltas,
            toolAudit: lastToolAudit,
            contextBudget,
            contextCompactedMessageCount,
            usageReconciliation: buildUsageReconciliation({
              estimatedInputTokens: contextBudget.estimatedInputTokens,
              usage: response.usage,
            }),
            finishReason: 'tool_converged',
            convergenceReason: `terminal write failure: ${WHOLE_DOCUMENT_REPLACEMENT_CODE}`,
          }
        }
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
            `当前事实：已成功写入 ${successfulWriteCount} 批（可信覆盖 ${coverageSummary!.trustedWriteCount} 批），计划共 ${executionPlan!.segments.length} 批，未覆盖批次：${coverageSummary!.missingSegments.slice(0, 12).join(' | ') || '无'}。本请求仍携带原工具面；应用只按写入覆盖结果校验，不依据回复措辞判定完成。`,
            ].join('\n'),
          }
          messages = [...messages, continuationSystem]
          toolRequestDeltas.push({ ...continuationSystem })
          continue
        }
        if (planRequiresMoreWrites && writeContinuationSteeringSent) {
          params.toolPolicy?.onToolWarning?.(
            `模型已输出终局总结，但写入覆盖仍未完整（可信覆盖 ${coverageSummary!.trustedWriteCount}/${successfulWriteCount} 批，未覆盖批次：${coverageSummary!.missingSegments.slice(0, 12).join(' | ') || '无'}）；已停止静默续发请求`,
          )
          return {
            text: `本轮未完整执行写入计划。模型已输出终局总结，但覆盖校验仍未确认全部批次完成；未覆盖批次：${coverageSummary!.missingSegments.join(' | ') || '无'}。已执行的写入与工具结果已保存到运行记录，请继续剩余批次。`,
            textOrigin: 'application' as const,
            reasoning: '',
            usage: response.usage,
            usageUnavailable: response.usageUnavailable,
            providerId,
            model,
            durationMs: Date.now() - startTime,
            toolCalls: allToolCalls,
            toolResults: allToolResults,
            toolRequestDeltas,
            toolAudit: lastToolAudit,
            finishReason: 'incomplete_write_coverage_checkpoint',
            convergenceReason: 'model emitted a final summary before long-document coverage was complete',
            toolRunBudgetPhase: 'write',
          }
        }
        return {
          ...response,
          toolCalls: allToolCalls,
          toolResults: allToolResults,
          toolRequestDeltas,
          toolAudit: lastToolAudit,
          contextBudget,
          contextCompactedMessageCount,
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
        const budgetClass = classifyToolBudgetClass({
          name: call.name,
          policy: tool?.policy,
        })
        const budgetSnapshot = toolRunBudget?.snapshot()
        const budgetRejection = toolRunBudget && !toolRunBudget.canStartToolCall(budgetClass)
          ? {
              ok: false as const,
              error: {
                code: `${budgetClass}_budget_exhausted`,
                message: budgetClass === 'write'
                  ? `写入预算已用尽（计划 ${budgetSnapshot?.reservedWriteToolCalls ?? 0} 次），请停止继续写入并基于已执行结果收口`
                  : budgetClass === 'read'
                    ? `读取预算已用尽（安全网 ${budgetSnapshot?.maxReadToolCalls ?? 0} 次），请停止继续读取并基于已执行结果收口`
                    : '控制类工具预算已用尽（上限 16 次），请基于当前计划与上下文收口',
                retryable: false,
              },
            }
          : null
        if (budgetRejection) {
          toolResults.push({ call, result: budgetRejection })
          allToolResults.push({ call, result: budgetRejection })
          params.toolPolicy?.onToolStart?.({
            toolName: call.name,
            policy: tool?.policy || 'read',
            iteration,
            input: call.input,
          })
          params.toolPolicy?.onToolCall?.({
            toolName: call.name,
            toolCallId: call.id,
            policy: tool?.policy || 'read',
            iteration,
            input: call.input,
            argumentsRaw: call.argumentsRaw,
            result: budgetRejection,
            durationMs: 0,
            toolCapability: 'native_tools',
            rejectionCategory: classifyToolRejection(budgetRejection),
          })
          logToolRequest(log, {
            purpose: params.purpose,
            providerId,
            model,
            toolName: call.name,
            iteration,
            input: call.input,
            result: budgetRejection,
            durationMs: 0,
            toolCapability: 'native_tools',
            rejectionCategory: classifyToolRejection(budgetRejection),
          })
          continue
        }
        toolRunBudget?.recordToolCall(budgetClass)
        if (call.argumentsError) {
          const rawSummary = (call.argumentsRaw || '')
            .slice(0, 300)
            .replace(/\s+/g, ' ')
          const result: ToolResult = {
            ok: false,
            error: {
              code: call.argumentsError.code,
              message: `${call.argumentsError.message}${rawSummary ? `原始参数前 300 字符：${rawSummary}` : ''}`,
              retryable: true,
            },
          }
          toolResults.push({ call, result })
          allToolResults.push({ call, result })
          params.toolPolicy?.onToolStart?.({ toolName: call.name, policy: tool?.policy || 'read', iteration, input: call.input })
          params.toolPolicy?.onToolCall?.({
            toolName: call.name,
            toolCallId: call.id,
            policy: tool?.policy || 'read',
            iteration,
            input: call.input,
            argumentsRaw: call.argumentsRaw,
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
            argumentsRaw: call.argumentsRaw,
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
            argumentsRaw: call.argumentsRaw,
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
            argumentsRaw: call.argumentsRaw,
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
            argumentsRaw: call.argumentsRaw,
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
          argumentsRaw: call.argumentsRaw,
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
      if (params.toolPolicy?.executionPlan?.mode === 'edit-task') {
        const successfulWritesThisRound = toolResults.filter(item =>
          item.result.ok && String(item.call.name).startsWith('editor.write')).length
        if (successfulWritesThisRound > 0) {
          successfulWriteProgressCount += successfulWritesThisRound
          consecutiveNoWriteProgressRounds = 0
        } else if (successfulWriteProgressCount > 0) {
          consecutiveNoWriteProgressRounds += 1
        }
        if (consecutiveNoWriteProgressRounds >= 2) {
          params.toolPolicy?.onToolWarning?.(
            `长文档编辑任务已连续 ${consecutiveNoWriteProgressRounds} 轮没有新增写入；已停止物理请求并保留检查点`,
          )
          return {
            text: `本轮未完整执行写入计划：模型已连续 2 轮无新增写入。已执行的写入与工具结果已保存到运行记录，请继续剩余批次。`,
            textOrigin: 'application' as const,
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
            contextBudget,
            contextCompactedMessageCount,
            finishReason: 'no_write_progress',
            convergenceReason: 'two consecutive edit-task rounds added no write progress',
          }
        }
      }
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
      const wholeDocumentReplacementFailure = toolResults.find(item =>
        item.call.name === 'editor.write'
        && item.result.ok === false
        && item.result.error?.code === WHOLE_DOCUMENT_REPLACEMENT_CODE)
      const blankReplaceMatchFailure = toolResults.find(isBlankReplaceMatchFailure)
      const reorderCommandAsPhantomToolFailure = toolResults.find(isReorderCommandAsPhantomToolFailure)
      if (wholeDocumentReplacementFailure) {
        wholeDocumentReplacementViolations += 1
      } else {
        wholeDocumentReplacementViolations = 0
        wholeDocumentSteeringSent = false
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
      if (wholeDocumentReplacementFailure && !wholeDocumentSteeringSent) {
        wholeDocumentSteeringSent = true
        const steeringSystem = {
          role: 'system' as const,
          content: [
            `上一轮 editor.write 被拒绝（${WHOLE_DOCUMENT_REPLACEMENT_CODE}）：当前长文档计划禁止整篇替换。`,
            '下一轮必须继续使用受限局部命令：reorder_sections、replace_match、rewrite、delete_match、insert_after。禁止使用 replace_document 或再次提交整篇内容。',
            '必须基于已读取的文档与计划批次继续执行；如果无法继续，停止调用工具并说明缺失信息。',
          ].join('\n'),
        }
        messages = [...messages, steeringSystem]
        toolRequestDeltas.push({ ...steeringSystem })
        params.toolPolicy?.onToolWarning?.(
          `editor.write 拒绝整篇替换；已保留工具面并要求下一轮改用受限局部命令`,
        )
      }
      if (blankReplaceMatchFailure) {
        const steeringSystem = {
          role: 'system' as const,
          content: [
            '上一轮 editor.write 被拒绝：replace_match 缺失 content 会被视为替换为空，应用不会执行该写入。',
            '若目的是删除原文，下一轮必须改用 delete 操作，并保持 target 唯一；若是替换文本，下一轮必须提交非空 content。',
            '禁止重复提交相同的空 replace_match 命令；若无法继续，停止调用工具并说明具体原因。',
          ].join('\n'),
        }
        messages = [...messages, steeringSystem]
        toolRequestDeltas.push({ ...steeringSystem })
        params.toolPolicy?.onToolWarning?.(
          'editor.write 拒绝空 content；已要求下一轮改用 delete 删除原文',
        )
      }
      if (reorderCommandAsPhantomToolFailure) {
        const steeringSystem = {
          role: 'system' as const,
          content: [
            '上一轮调用了不存在的工具 editor.reorder_sections。',
            'reorder_sections 是 editor.write 里的命令，不是独立工具；下一轮必须改用 editor.write，并在 commands[0].operation 中提交 reorder_sections，同时提供完整有序顶层结构 ID 数组 order。',
            '禁止把编辑命令名直接当作工具名调用；若无法继续，停止调用工具并说明缺失信息。',
          ].join('\n'),
        }
        messages = [...messages, steeringSystem]
        toolRequestDeltas.push({ ...steeringSystem })
        params.toolPolicy?.onToolWarning?.(
          'editor.reorder_sections 不是独立工具；已要求下一轮改用 editor.write 的 reorder_sections 命令',
        )
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
      if (wholeDocumentReplacementFailure
        && wholeDocumentReplacementViolations >= WHOLE_DOCUMENT_REPLACEMENT_VIOLATION_LIMIT) {
        const errorCode = wholeDocumentReplacementFailure.result.error?.code || 'unknown'
        const errorMessage = wholeDocumentReplacementFailure.result.error?.message || '写入被拒绝'
        params.toolPolicy?.onToolWarning?.(
          `editor.write 连续 ${wholeDocumentReplacementViolations} 次违反整篇替换禁令；已停止工具循环并要求模型直接说明原因`,
        )
        const convergence = await requestToolConvergence({
          reason: `terminal write failure: ${errorCode}`,
          systemPrompt: [
            `上一次 editor.write 已被应用终态拒绝，错误码：${errorCode}。`,
            `拒绝原因：${errorMessage}`,
            `此前已明确要求禁止整篇 replace_document，模型仍连续 ${wholeDocumentReplacementViolations} 次尝试同类写入。`,
            '当前请求不携带任何工具。禁止再次调用工具、输出工具协议或提出新的执行计划；直接向用户说明已写入内容、未完成批次、被拒绝的操作，以及用户可以采取的下一步操作。',
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
      contextCompactedMessageCount,
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
    const convergenceCompaction = compactToolContextMessages(messages)
    let convergenceMessages: CallAiParams['messages'] = [
      ...convergenceCompaction.messages,
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
      textOrigin: 'application' as const,
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
      if (error?.message?.includes('任务级物理请求安全网已达到')) {
        const snapshot = params.toolPolicy?.toolRunBudget?.snapshot()
        return {
          text: `本轮未完整执行写入计划：物理请求安全网已达到（${snapshot ? `${snapshot.physicalRequests}/${snapshot.maxPhysicalRequests}` : '已耗尽'}）。已执行的写入与工具结果已保存到运行记录，请根据剩余批次继续下一轮。`,
          textOrigin: 'application' as const,
          reasoning: '',
          providerId: error?.providerId,
          durationMs: 0,
          toolCalls: [],
          toolResults: [],
          finishReason: 'tool_budget_exhausted',
          convergenceReason: 'classified tool run budget exhausted before provider dispatch',
          toolRunBudgetPhase: 'control',
        }
      }
      const isClientError = error?.statusCode === 400 || error?.statusCode === 422
      const requestedTools = Boolean(params.tools?.length)
      const toolsRejected = requestedTools && (Boolean(error?.providerErrorSummary?.includes('tools unsupported')) || error?.message?.includes('tools unsupported'))
      if (!isClientError || !requestedTools || (params.signal?.aborted || params.cancelSignal?.aborted) || !toolsRejected) throw error

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
    const toolRunBudget = params.toolPolicy?.toolRunBudget
    const { provider, providerId } = resolveProvider(providerStore, params.purpose, params.providerId)
    const providerType = normalizeProviderType(provider.providerType)
    // Default stream: true for generate/rewrite, including tool rounds. The native
    // tool exchange has a stream guard that still accepts plain-JSON tool_calls bodies.
    const defaultStream = params.purpose === 'generate' || params.purpose === 'rewrite'
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
      providerId,
      model: resolveModel(provider, params.model),
    })
    let lastErr: any = null
    let lastResp: { text: string; reasoning: string; usage?: any } | null = null
    let sawStreamOutput = false
    const getSlowStreamSawOutput = () => params.slowStreamTolerant === true && sawStreamOutput
    let streamBuffer = ''
    let reasoningBuffer = ''
    const basePhase = params.physicalPhase || 'normal'
    const effectiveMaxTokens = () => resolveMaxTokens(provider, params.maxTokens ?? provider.maxTokens)
    const reasoningControl = getProviderReasoningControl(providerType)
    let reasoningOnlyDirectRetryApplied = false
    const physicalCallIds = new Map<string, string>()
    let physicalDiagnostics: {
      statusCode?: number
      providerErrorSummary?: string
    } = {}
    let physicalFirstTokenAt: number | null = null
    let physicalStartedAt: number | null = null
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
      interruption?: Pick<PhysicalCallEvent,
        'interruptionCode' | 'bodyAbsentMs' | 'firstContentAt' | 'lastContentAt' | 'lastReasoningAt'
      >,
    ) => {
      try {
        const reconciliation = buildUsageReconciliation({
          estimatedInputTokens: contextBudget.estimatedInputTokens,
          usage: result?.usage,
        })
        const cacheUsageSummary = status === 'running'
          ? undefined
          : buildCacheUsageSummary(
            normalizeUsage(providerType, result?.usage),
            contextBudget.estimatedInputTokens,
          )
        const contextComposition = params.contextComposition
          ? buildRequestContextComposition({
            ...params.contextComposition,
            providerType,
            providerId,
            model: resolveModel(provider, params.model),
            ...resolveRequestCompositionContent(params),
          })
          : undefined
        if (status !== 'running') {
          updateInputTokenCalibration({
            providerId,
            model: resolveModel(provider, params.model),
            usageReconciliation: reconciliation
          })
        }
        const physicalScope = overridePhase === 'heartbeat_retry' ? 'heartbeat' : 'normal'
        const physicalCallKey = `${physicalScope}:${attempt}`
        let physicalCallId = physicalCallIds.get(physicalCallKey)
        if (!physicalCallId) {
          physicalCallId = `physical-${startTime}-${physicalScope}-${attempt}`
          physicalCallIds.set(physicalCallKey, physicalCallId)
        }
        const physicalToolCalls = requestedTools
          ? extractProviderToolCallsFromResponse(providerType, {
            toolCalls: result?.toolCalls,
            raw: result?.raw,
          } as CallAiResult)
          : []
        params.onPhysicalCall?.({
          physicalCallId,
          phase: overridePhase || (attempt > 0 ? 'retry' : basePhase),
          status,
          attempt: attempt + 1,
          durationMs: physicalStartedAt === null ? 0 : Date.now() - physicalStartedAt,
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
          providerSource: params.meta?.providerSource,
          downgradeReason: overridePhase?.startsWith('downgrade') ? undefined : undefined,
          retryStrategy: params.retryStrategy,
          maxTokens: result?.maxTokens ?? effectiveMaxTokens(),
          modelCapability,
          contextBudget,
          contextCompactedMessageCount: params.contextCompactedMessageCount,
          cacheUsageSummary,
          contextComposition,
          usageReconciliation: reconciliation,
          heartbeat: status === 'running'
            ? Boolean(heartbeat || physicalHeartbeatTimer !== null)
            : undefined,
          toolCallCount: requestedTools ? physicalToolCalls.length : 0,
          toolCallNames: requestedTools ? physicalToolCalls.map(call => call.name) : [],
          firstTokenMs: physicalFirstTokenAt === null
            ? undefined
            : physicalFirstTokenAt - (physicalStartedAt ?? startTime),
          outputMs: physicalFirstTokenAt === null
            ? undefined
            : Date.now() - physicalFirstTokenAt,
          statusCode: physicalDiagnostics.statusCode,
          providerErrorSummary: physicalDiagnostics.providerErrorSummary,
          finalUrl,
          transport,
          ...interruption,
        })
      } catch { /* trace must never break the AI request */ }
    }
    const promptPreview = params.messages.map(m => m.content).join(' ').slice(0, 200)
    let maxTokensDowngrade: { from: number | null; to: number; reason: string } | null = null
    let currentPhysicalAttempt = 0
    let currentPhysicalScope: 'normal' | 'heartbeat' = 'normal'
    const throwCanceled = (): never => {
      const durationMs = Date.now() - startTime
      stopPhysicalHeartbeat()
      // Closing the same running physical record prevents a canceled request
      // from leaving a perpetual running physical call in the trace.
      reportPhysical(
        currentPhysicalAttempt,
        'canceled',
        undefined,
        undefined,
        currentPhysicalScope === 'heartbeat' ? 'heartbeat_retry' : undefined,
      )
      logRequest(log, { step: params.meta?.step, purpose: params.purpose, providerId, model: resolveModel(provider, params.model), prompt: promptPreview, result: '用户取消', durationMs, success: false, skillId: params.meta?.skillId, agentId: params.meta?.agentId, providerType, transport, finalUrl, providerSource: params.meta?.providerSource })
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
    let streamFirstContentAt: number | null = null
    let streamLastContentAt: number | null = null
    let streamLastReasoningAt: number | null = null
    const markStreamContent = () => {
      const now = Date.now()
      if (streamFirstContentAt === null) streamFirstContentAt = now
      streamLastContentAt = now
    }
    const traceParams = (originalOnChunk || toolStreamGuard || params.slowStreamTolerant === true)
      ? { ...params, onChunk: (text: string) => {
          if (!text) return
          if (physicalFirstTokenAt === null) physicalFirstTokenAt = Date.now()
          markStreamContent()
          streamBuffer += text
          const visibleText = toolStreamGuard ? toolStreamGuard.push(text) : text
          if (visibleText && originalOnChunk) originalOnChunk(visibleText)
        } }
      : params
    // Reasoning is physical progress even when no caller listens to it. Always
    // accumulate it so long-thinking requests do not look idle in the trace
    // and are not killed by the outer tool-run watchdog.
    params = { ...traceParams, onReasoning: (text: string) => {
      if (!text) return
      if (physicalFirstTokenAt === null) physicalFirstTokenAt = Date.now()
      streamLastReasoningAt = Date.now()
      reasoningBuffer += text
      originalOnReasoning?.(text)
    } }

    try {
      for (let attempt = 0; attempt <= physicalRetryCeiling; attempt++) {
        try {
        streamBuffer = ''
        reasoningBuffer = ''
        physicalFirstTokenAt = null
        physicalStartedAt = Date.now()
          currentPhysicalAttempt = attempt
          currentPhysicalScope = 'normal'
          physicalDiagnostics = {}
          reportPhysical(attempt, 'running')
          physicalHeartbeatTimer = setInterval(() => {
            if (params.signal?.aborted) {
              stopPhysicalHeartbeat()
              return
            }
            reportPhysical(attempt, 'running', undefined, undefined, undefined, true)
          }, PHYSICAL_HEARTBEAT_INTERVAL_MS)
          const result = await _rawCall(provider, params, timeoutMs, toolRunBudget)
          stopPhysicalHeartbeat()
          if (toolStreamGuard) {
            const tailText = toolStreamGuard.flush()
            if (tailText && originalOnChunk) originalOnChunk(tailText)
          }
        lastResp = result
        let finalText = filterThinkingTags(result.text)
        if (params.jsonMode) {
          finalText = await tryJsonParse(finalText, () => _rawCall(provider, { ...params, jsonMode: false }, timeoutMs, toolRunBudget).then(r => r.text))
        }
        const durationMs = Date.now() - startTime
        const _model = resolveModel(provider, params.model)
        logRequest(log, { step: params.meta?.step, purpose: params.purpose, providerId, model: _model, prompt: promptPreview, result: finalText.slice(0, 200), durationMs, success: true, skillId: params.meta?.skillId, agentId: params.meta?.agentId, usage: result.usage, providerType, transport, finalUrl, providerSource: params.meta?.providerSource })
        reportPhysical(attempt, 'success', result, undefined, undefined, undefined, {
          firstContentAt: streamFirstContentAt === null ? undefined : streamFirstContentAt,
          lastContentAt: streamLastContentAt === null ? undefined : streamLastContentAt,
          lastReasoningAt: streamLastReasoningAt === null ? undefined : streamLastReasoningAt,
        })
        return {
          text: finalText,
          reasoning: result.reasoning,
          providerId,
          providerType,
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
        if (params.signal?.aborted || params.cancelSignal?.aborted) {
          return throwCanceled()
        }
        // A reasoning-only stream is a semantic stall, not a transport fault.
        // The first occurrence switches to a protocol-aware direct-output
        // retry immediately; a second occurrence is terminal.
        if ((e as { code?: string })?.code === 'reasoning_only_stalled') {
          const reasoningOnlyError = new AiServiceErrorImpl({
            kind: 'network',
            message: e.message || '流式响应长时间未产生正文',
            providerId,
            purpose: params.purpose,
          }) as AiServiceErrorImpl & {
            code?: string
            bodyAbsentMs?: number
            firstContentAt?: number
            lastReasoningAt?: number
          }
          reasoningOnlyError.code = 'reasoning_only_stalled'
          reasoningOnlyError.bodyAbsentMs = (e as { bodyAbsentMs?: number }).bodyAbsentMs
          reasoningOnlyError.firstContentAt = (e as { firstContentAt?: number }).firstContentAt
          reasoningOnlyError.lastReasoningAt = (e as { lastReasoningAt?: number }).lastReasoningAt
          lastErr = reasoningOnlyError
          stopPhysicalHeartbeat()
          reportPhysical(
            attempt,
            'failed',
            undefined,
            reasoningOnlyError.message,
            undefined,
            undefined,
            {
              interruptionCode: 'reasoning_only_stalled',
              bodyAbsentMs: reasoningOnlyError.bodyAbsentMs,
              firstContentAt: reasoningOnlyError.firstContentAt,
              lastContentAt: undefined,
              lastReasoningAt: reasoningOnlyError.lastReasoningAt,
            },
          )
          if (
            attempt < physicalRetryCeiling
            && !reasoningOnlyDirectRetryApplied
            && params.reasoning?.mode !== 'off'
          ) {
            reasoningOnlyDirectRetryApplied = true
            if (reasoningControl.supported) {
              params = {
                ...params,
                reasoning: { mode: 'off' },
                retryStrategy: 'thinking_disabled',
              }
            } else {
              const declaredMaxTokens = Number(
                params.maxTokens ?? provider.maxTokens
              )
              const baseMaxTokens = declaredMaxTokens > 0 ? declaredMaxTokens : 32_768
              params = {
                ...params,
                maxTokens: Math.max(baseMaxTokens, Math.round(baseMaxTokens * 1.5)),
                retryStrategy: 'max_tokens_raised',
              }
            }
            continue
          }
          if (reasoningOnlyDirectRetryApplied || params.reasoning?.mode === 'off') break
          if (attempt < physicalRetryCeiling) continue
          break
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
          physicalDiagnostics = {
            statusCode: Number.isFinite(Number(e?.statusCode)) ? Number(e.statusCode) : undefined,
            providerErrorSummary: typeof e?.providerErrorSummary === 'string' && e.providerErrorSummary
              ? e.providerErrorSummary
              : undefined,
          }
          reportPhysical(attempt, 'failed', undefined, e?.message || String(e))
          break
        }
        // Provider soft errors are terminal: a quota response never becomes
        // valid through another physical request.
        if ((e as any)?.softError === true) {
          lastErr = e as AiServiceErrorImpl
          stopPhysicalHeartbeat()
          physicalDiagnostics = {
            statusCode: Number.isFinite(Number(e?.statusCode)) ? Number(e.statusCode) : undefined,
            providerErrorSummary: typeof e?.providerErrorSummary === 'string' && e.providerErrorSummary
              ? e.providerErrorSummary
              : undefined,
          }
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
          physicalDiagnostics = {
            statusCode: Number.isFinite(Number(status)) ? Number(status) : undefined,
            providerErrorSummary: providerMessage || undefined,
          }
          if ((e as any)?.softError === true) {
            lastErr = e as AiServiceErrorImpl
            stopPhysicalHeartbeat()
            reportPhysical(attempt, 'failed', undefined, e?.message || String(e))
            break
          }
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
            throw new AiServiceErrorImpl({
              kind: 'auth',
              message: httpErrorMessage(status, providerMessage),
              providerId,
              purpose: params.purpose,
              statusCode: status,
              providerErrorSummary: providerMessage,
            })
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
          const hbParams = { ...params }
          streamBuffer = ''
          reasoningBuffer = ''
          currentPhysicalAttempt = hbAttempt
          currentPhysicalScope = 'heartbeat'
          physicalDiagnostics = {}
          reportPhysical(hbAttempt, 'running', undefined, undefined, 'heartbeat_retry')
          const result = await _rawCall(provider, hbParams, timeoutMs, toolRunBudget)
          let finalText = filterThinkingTags(result.text)
          if (params.jsonMode) {
            finalText = await tryJsonParse(finalText, () => _rawCall(provider, { ...params, jsonMode: false }, timeoutMs, toolRunBudget).then(r => r.text))
          }
          const durationMs = Date.now() - startTime
          const _hbModel = resolveModel(provider, params.model)
          logRequest(log, { step: params.meta?.step, purpose: params.purpose, providerId, model: _hbModel, prompt: promptPreview, result: finalText.slice(0, 200), durationMs, success: true, skillId: params.meta?.skillId, agentId: params.meta?.agentId, usage: result.usage, providerSource: params.meta?.providerSource })
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
          let hbStatus = Number.isFinite(Number(hbErr?.statusCode)) ? Number(hbErr.statusCode) : undefined
          let hbProviderMessage = typeof hbErr?.providerErrorSummary === 'string' && hbErr.providerErrorSummary
            ? hbErr.providerErrorSummary
            : undefined
          if (hbErr instanceof Response) {
            hbStatus = hbErr.status
            const hbErrorText = await hbErr.clone().text()
            try {
              hbProviderMessage = extractProviderErrorSummary(JSON.parse(hbErrorText))
            } catch {
              hbProviderMessage = String(hbErrorText || '').slice(0, 500)
            }
          }
          physicalDiagnostics = {
            statusCode: hbStatus,
            providerErrorSummary: hbProviderMessage || undefined,
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

  async function testGenerationProbe(provider: ProviderLike): Promise<{
    connected: boolean
    error?: string
    model?: string
    durationMs?: number
  }> {
    const startedAt = Date.now()
    try {
      await fetchModelsForProvider(provider)
    } catch (e: any) {
      const status = e?.statusCode
      if (status !== 404 && status !== 405) {
        return { connected: false, error: e?.message || '连接失败', durationMs: Date.now() - startedAt }
      }
    }
    const probeStartedAt = Date.now()
    try {
      await _rawCall(provider, {
        purpose: 'generate',
        messages: [{ role: 'user', content: 'Reply OK' }],
        stream: false,
        retry: false,
        timeoutMs: 30_000,
        maxTokens: 8,
      }, 30_000)
      return {
        connected: true,
        model: resolveModel(provider),
        durationMs: Date.now() - probeStartedAt,
      }
    } catch (e: any) {
      const status = e?.statusCode
      const error = status === 401 || status === 403 || status === 404 || status === 429
        ? `生成探针失败（HTTP ${status}）：${e?.message || '供应商拒绝生成请求'}`
        : (e?.message || '生成探针失败')
      return { connected: false, error, durationMs: Date.now() - probeStartedAt }
    }
  }

  const service = {
    callAi,
    fetchModels,
    fetchModelsForProvider,
    testConnection,
    testConnectionForProvider,
    testGenerationProbe,
    providerScheduler,
    externalSchedulerSnapshotEnabled,
    _stopExternalSchedulerSnapshot: () => {
      if (externalSchedulerSnapshotTimer) clearInterval(externalSchedulerSnapshotTimer)
      externalSchedulerSnapshotTimer = null
    },
  } as any
  return service
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
