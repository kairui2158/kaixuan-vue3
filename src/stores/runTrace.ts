import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { DialogueBatchEvent } from '../services/dialogueFoundation'
import { checkStateIntegrity } from '../services/stateIntegrityCheck'
import { createLifecycleTransitionEvent } from '../services/stateTransitionGuard'
import { getStateTimeout, startStateWatchdog, type StateWatchdog } from '../services/stateWatchdog'
import type { ContextBudgetDecision } from '../services/contextBudget'
import { resolveRuntimeBuildFingerprint } from '../services/buildManifest'
import type { LifecycleStatus } from '../services/stateTransitionGuard'
import { normalizeUsage as normalizeTraceUsage } from '../services/traceFieldNormalizer'
import { safeModeActive } from '../services/responsivenessStore'
import {
  RUN_TRACE_EXPORT_SCHEMA_VERSION,
  exportRunTraceToJson as exportRunTraceJson,
  exportRunTraceToText as exportRunTraceText,
  maskRunTraceSensitiveText,
  maskRunTraceSensitiveValue as maskRunTraceSensitiveObject
} from '../services/runTraceExportService'

export type RunTraceStatus =
  | 'running'
  | 'success'
  | 'degraded'
  | 'failed'
  | 'canceled'
  | 'blocked'
  | 'interrupted'
  | 'partially_applied'
  | 'failed_after_write'
  | 'success_with_warnings'
export type RunTraceEventLevel = 'info' | 'warn' | 'error'
export type RunTraceSource = 'pipeline' | 'outline' | 'home' | 'eval' | 'infra'

export type RunActivitySource =
  | 'physical_call_running'
  | 'physical_call_heartbeat'
  | 'stream_delta'
  | 'tool_argument_delta'
  | 'tool_call'
  | 'edit_task'

export const RUN_TRACE_SOURCE_NAMES: Record<RunTraceSource, string> = {
  pipeline: '生成流水线',
  outline: '大纲工作台',
  home: '主页编辑器',
  eval: '技能评测',
  infra: '供应商连接'
}

export interface RunTraceEvent {
  id: string
  ts: number
  turnId?: string
  seq?: number
  level: RunTraceEventLevel
  type: string
  label: string
  selectionRestoreMode?: 'auto' | 'reset' | 'none'
  detail?: string
  batchEvent?: DialogueBatchEvent
  payload?: unknown
  payloadRefs?: string[]
}

export interface RunTraceEditTaskPayload {
  taskId: string
  status: string
  source: string
  targetId: string
  goal: string
  executedBatches: string[]
  pendingBatches: string[]
  failedBatches: string[]
  activeBatchId?: string
  executionPlan: {
    goal: string
    batches: string[]
    batchDetails?: Record<string, {
      segmentId: string
      expectedChange: string
      invariantResult?: string
      range?: { startLine: number; endLine: number }
      writeStrategy?: string
    }>
  }
  batchId?: string
  segmentId?: string
  expectedChange?: string
  invariantResult?: string
}

export interface RunTraceEditTaskCompletionPayload {
  verified: boolean
  invariant?: string
  violations: Array<{
    code: string
    message: string
    batchId?: string
    target?: string
    beforeCount?: number
    afterCount?: number
  }>
}

export interface RunTraceMessage {
  role: string
  content: string
}

export interface RunTracePermissionDecision {
  source: 'dialogue-intent' | 'long-document-workflow'
  decision: 'read-only' | 'write-authorized'
  intent: string
  operation: string
  mode: string
  reason: string
}

export interface RunTraceExecutionSettlement {
  phase: 'locating' | 'planning' | 'writing' | 'settling'
  readToolCalls: number
  maxReadToolCalls: number
  writeToolCalls: number
  reservedWriteToolCalls: number
  controlToolCalls: number
  physicalRequests: number
  maxPhysicalRequests: number
  exhaustedClasses: Array<'read' | 'write' | 'control'>
  successfulWriteCount: number
  trustedCoverageCount: number
  planComplete: boolean
}

export interface RunTraceReadLedgerSnapshot {
  workspace: 'main' | 'outline'
  targetId: string
  uniqueReadCount: number
  duplicateReadCount: number
  rereadAfterCompactionCount: number
  compactedReadCount: number
  structureIdentity: string
}

export interface RunTraceApiCall {
  id: string
  turnId?: string
  seq: number
  step?: number
  skillId?: string
  skillName?: string
  agentId?: string
  agentName?: string
  providerId?: string
  providerName?: string
  providerSource?: RunTraceProviderSource
  model?: string
  /** null records an undeclared output limit; a number records the effective wire limit. */
  maxTokens?: number | null
  /** Effective temperature sent to the provider for this physical request. */
  temperature?: number
  /** Thinking-disable request parameter actually used for this physical request. */
  thinkingDisableParam?: string
  /** Thinking-disable request value actually used for this physical request. */
  thinkingDisableValue?: string
  intent?: string
  toolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
  actualToolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
  permissionDecision?: RunTracePermissionDecision
  providerContextWindowTokens?: number
  estimatedInputTokens?: number
  contextBudgetDecision?: ContextBudgetDecision
  contextBudgetReason?: string
  usageReconciliation?: unknown
  requestMessages: RunTraceMessage[]
  toolRequestDeltas?: RunTraceMessage[]
  /** Compact cross-turn tool audit generated by aiService for this call. */
  toolAudit?: unknown
  responseText: string
  /** Distinguishes model prose from locally composed application fallback text. */
  textOrigin?: 'application' | 'model'
  streamText: string
  reasoningText: string
  /** Wall clock of the latest response-body delta; distinguishes live streaming from tool rounds. */
  lastStreamActivityAt?: number
  /** Latest native tool-argument stream progress; visible even while body text is empty. */
  lastToolArgumentProgressAt?: number
  lastToolArgumentProgress?: { toolCallCount: number; argumentCharacters: number }
  /** Wall clock of the latest physical request or tool activity, including body-less tool rounds. */
  lastExecutionActivityAt?: number
  finishReason?: string
  /** Why a tool-loop convergence/checkpoint result was produced. */
  convergenceReason?: string
  /** Classified execution budget and coverage settlement for this API call. */
  executionSettlement?: RunTraceExecutionSettlement
  /** Read-cache observation for this API call. */
  readLedger?: RunTraceReadLedgerSnapshot
  /** Layered de-AI prompt variant used by this API call. */
  deaiPromptVariant?: 'methodology' | 'methodology-compose' | 'creative' | 'polish' | 'off'
  usage?: unknown
  usageUnavailable?: boolean
  durationMs?: number
  /** Observability only; local phases must not change execution behavior. */
  timingLedger?: RunTraceTimingLedger
  /** Per-attempt protected-body candidate metrics retained by the executor. */
  bodyCandidateLedger?: Array<{
    attempt: number
    rawChars: number
    netWords: number
    handoffCount: number
    contractDistance: number
    missingHandoff: boolean
    valid: boolean
    errorCount: number
  }>
  /** Per-attempt candidate audit for every folder skill execution. */
  candidateLedger?: Array<{
    passIndex: number
    attempt: number
    rawChars: number
    sourceResponseHash: string
    valid: boolean
    schemaValidationValid?: boolean
    errorCount: number
    errors: string[]
    postProcessIssueCodes: string[]
    retained: boolean
  }>
  /** Structured explanation of the retry candidate retained by the executor. */
  bodyCandidateRetention?: {
    retainedCandidateIndex: number
    retainedAttempt: number
    retainedReason: string
  }
  /** 1-based retained candidate position from candidateLedger; 0 means no retained candidate. */
  retainedCandidateIndex?: number
  status: RunTraceStatus
  error?: string
  /** Total streamed chars ever received; streamText may be a bounded tail preview. */
  streamTotalChars?: number
  streamTruncated?: boolean
  streamTruncatedChars?: number
  compatibilityMode?: 'json-protocol'
  compatibilityWrite?: boolean
  toolsDowngraded?: boolean | 'json-protocol'
  downgradeReason?: string
  retryStrategy?: 'thinking_disabled' | 'max_tokens_raised' | 'prompt_only' | 'heartbeat_recovery'
  startedAt: number
  endedAt?: number
  semantic?: RunTraceSemantic
  physicalCalls?: RunTracePhysicalCall[]
  toolDefinitions?: RunTraceToolDefinition[]
  toolCalls?: RunTraceToolCall[]
  promptSnapshotIds?: string[]
  processingReportIds?: string[]
  payloadRefs?: string[]
  integrity?: RunTraceApiCallIntegrity
}

export interface RunTraceApiCallIntegrity {
  physicalSkipped?: boolean
  physicalSkipReason?: string
  physicalMissing?: boolean
  physicalMissingReason?: string
}

export interface RunTraceSemantic {
  conversationId: string
  turnId?: string
  prompt?: {
    name?: string
    version?: string
    variables?: Record<string, unknown>
  }
  usage?: {
    inputTokens?: number
    outputTokens?: number
    cacheReadInputTokens?: number
    cacheWriteInputTokens?: number
    reasoningOutputTokens?: number
    totalTokens?: number
  }
  timeToFirstChunkMs?: number
  conversationCompacted?: boolean
}

export interface RunTraceToolDefinition {
  name: string
  policy: 'read' | 'write'
  defaultToolPolicy?: 'allowedWithoutPermission' | 'allowedWithPermission' | 'disabled'
  riskLevel?: 'low' | 'medium' | 'high'
  description?: string
  parameters?: unknown
}

type RunTraceToolCapability = 'native_tools' | 'json_protocol'

type RunTraceToolRejectionCategory =
  | 'unknown_tool'
  | 'schema_invalid'
  | 'permission_denied'
  | 'range_invalid'
  | 'invalid_protocol'
  | 'other'

export interface RunTraceToolCall {
  id: string
  toolCallId?: string
  name: string
  input: unknown
  argumentsRaw?: string
  result?: unknown
  protocolVersion?: number
  protocolVersionDefaulted?: boolean
  status: 'success' | 'failed' | 'canceled'
  startedAt: number
  endedAt?: number
  durationMs?: number
  error?: string
  errorCode?: string
  toolCapability?: RunTraceToolCapability
  rejectionCategory?: RunTraceToolRejectionCategory
  defaultToolPolicy?: 'allowedWithoutPermission' | 'allowedWithPermission' | 'disabled'
  riskLevel?: 'low' | 'medium' | 'high'
}

export interface RunTracePhysicalCall {
  id: string
  physicalCallId?: string
  seq: number
  phase: 'normal' | 'tool_iteration' | 'tool_convergence' | 'downgrade_initial' | 'downgrade_retry' | 'continuation' | 'schema_retry' | 'direct_retry' | 'retry' | 'heartbeat_retry'
  status: RunTraceStatus
  requestMessages: RunTraceMessage[]
  responseText: string
  streamText: string
  reasoningText?: string
  finishReason?: string
  usage?: unknown
  usageUnavailable?: boolean
  startedAt: number
  endedAt?: number
  durationMs?: number
  /** Time from physical request start to the first body/reasoning delta. */
  firstTokenMs?: number
  /** Streaming time after the first delta; durationMs - firstTokenMs. */
  outputMs?: number
  error?: string
  toolsEnabled?: boolean
  toolsDowngraded?: boolean
  downgradeReason?: string
  /** Native tool calls parsed from this physical response; distinguishes parse loss from trace loss. */
  toolCallCount?: number
  toolCallNames?: string[]
  retryStrategy?: 'thinking_disabled' | 'max_tokens_raised' | 'prompt_only' | 'heartbeat_recovery'
  /** null records an undeclared output limit; a number records the effective wire limit. */
  maxTokens?: number | null
  /** Effective temperature sent to the provider for this physical request. */
  temperature?: number
  /** Thinking-disable request parameter actually used for this physical request. */
  thinkingDisableParam?: string
  /** Thinking-disable request value actually used for this physical request. */
  thinkingDisableValue?: string
  /** Capability provenance so traces distinguish unknown limits from app-imposed caps. */
  modelCapability?: {
    contextWindowTokens: number
    contextWindowSource: 'provider' | 'builtin' | 'unknown'
    maxOutputTokens: number
    maxOutputSource: 'override' | 'provider' | 'unknown'
    protocolRequiresMaxTokens: boolean
    protocolRequiredMaxTokens: number
  }
  providerContextWindowTokens?: number
  estimatedInputTokens?: number
  contextBudgetDecision?: ContextBudgetDecision
  contextBudgetReason?: string
  usageReconciliation?: unknown
  heartbeat?: boolean
  /** Non-empty only for transport interruptions that must surface in exported traces. */
  interruptionCode?: 'slow_stream_interrupted' | 'reasoning_only_stalled'
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
  /** Provider channel provenance copied from the request meta for trace projection. */
  providerSource?: RunTraceProviderSource
  /** Number of older successful read tool results compacted for this physical request. */
  contextCompactedMessageCount?: number
  /** Provider-reported cache usage; absent usage is never treated as a hit. */
  cacheUsageSummary?: unknown
  /** Observability-only request composition; excludes prompt full text. */
  contextComposition?: unknown
}

export interface RunTraceTimingLedger {
  apiCallCount?: number
  firstTokenSumMs?: number
  outputSumMs?: number
  localOverheadSumMs?: number
  requestBuildSumMs?: number
  schemaValidateSumMs?: number
  retrySumMs?: number
  postProcessSumMs?: number
  physicalCallCount?: number
  retryPhysicalCallCount?: number
  physicalDurationSumMs?: number
  minFirstTokenMs?: number
  maxFirstTokenMs?: number
  localOverheadMs?: number
  requestBuildMs?: number
  schemaValidateMs?: number
  retryMs?: number
  postProcessMs?: number
  /** Schema-validation retries consumed before the terminal attempt. */
  schemaRetryCount?: number
  /** Worst marker-block count per request across API calls. */
  repeatedPromptBlocks?: Record<string, number>
}

export type RunTraceStepPhase =
  | 'promptBuild'
  | 'contextLoad'
  | 'postProcess'
  | 'validation'
  | 'persistence'

export interface RunTraceStepTimingLedger {
  promptBuildMs?: number
  contextLoadMs?: number
  apiCallCount?: number
  physicalCallCount?: number
  retryCallCount?: number
  schemaRetryCallCount?: number
  continuationCallCount?: number
  firstTokenSumMs?: number
  outputSumMs?: number
  postProcessSumMs?: number
  validationSumMs?: number
  persistenceSumMs?: number
  stepBoundaryGapMs?: number
  repeatedPromptBlocks?: Record<string, number>
  contextChars?: number
  outputChars?: number
  physicalDurationSumMs?: number
}

export type RunTraceStepTimingPatch = Partial<Record<RunTraceStepPhase, number>>

export type RunTraceProviderSource = 'agent' | 'layer' | 'global' | 'auxiliary' | 'none'

export interface RunTraceTurn {
  id: string
  seq: number
  startedAt: number
  endedAt?: number
  durationMs?: number
  /** Aggregated observability across API calls; never gates execution. */
  timingLedger?: RunTraceTimingLedger
  status: RunTraceStatus
  reason?: string
  userRequest: string
  skillNames?: string[]
  mode?: string
  intent?: string
  routingFallback?: string
  assistantResponse?: string
  assistantResponseChars?: number
  apiCallIds?: string[]
  toolCalls?: RunTraceToolCall[]
  toolCallCount?: number
  continuationCount?: number
  writeMode?: string
  toolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
  actualToolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
  permissionDecision?: RunTracePermissionDecision
  /** Provenance for surfaces recorded from projection paths rather than live execution. */
  surfaceSource?: 'trace-projection'
  error?: string
}

export interface RunTrace {
  id: string
  source: RunTraceSource
  sourceName: string
  step?: number
  stepName?: string
  mode: string
  /** Application-level run id (pipeline registry domain), never a trace run id. */
  pipelineRunId?: string
  projectId?: string
  projectName?: string
  providerId?: string
  providerName?: string
  providerSource?: RunTraceProviderSource
  model?: string
  skillNames: string[]
  skillMode?: string
  status: RunTraceStatus
  startedAt: number
  endedAt?: number
  durationMs?: number
  /** Aggregated timing observability for API/local phases. */
  timingLedger?: RunTraceTimingLedger
  /** Step-level timing ledger; computed at finishRun and never backfilled. */
  stepTimingLedger?: RunTraceStepTimingLedger
  /** Transient explicit phase timing before finishRun projects the step ledger. */
  stepPhaseTiming?: RunTraceStepTimingPatch
  /** Gap from the previous finished run in the same source/project/step scope. */
  stepBoundaryGapMs?: number
  events: RunTraceEvent[]
  apiCalls: RunTraceApiCall[]
  turns?: RunTraceTurn[]
  promptSnapshots?: RunTracePromptSnapshot[]
  processingReports?: RunTraceProcessingReport[]
  payloads?: RunTracePayloadRef[]
  apiResponseIndex?: RunTraceApiResponseIndexEntry[]
  payloadToAttemptIndex?: RunTracePayloadToAttemptIndexEntry[]
  payloadIntegrityWarnings?: string[]
  /** Exact event accounting for compacted runs; events are a bounded recent window. */
  eventLedger?: {
    totalEvents: number
    droppedInfoEvents: number
    droppedWarnEvents: number
    droppedErrorEvents: number
    droppedInfoEventsByType?: Record<string, number>
  }
  dirName?: string
  currentTurnId?: string
  sessionKind?: 'task' | 'chat'
  runtimeFingerprint?: {
    source: 'vite-manifest' | 'dev'
    manifestVersion: string
    commit: string
    buildTime: string
    appVersion: string
  }
  sessionSnapshot?: boolean
  folderDiagnostics?: RunTraceFolderDiagnostic[]
  executionContext?: 'skill-eval'
  evalReport?: unknown
  target?: {
    type?: string
    id?: string
    name?: string
    activeTab?: string
    locked?: boolean
  }
  context?: {
    turns?: number
    referencedDocuments?: string[]
    contextStrategy?: string
  }
  resultPreview?: string
  error?: string
  timeoutHint?: {
    active?: number
    routing?: number
    retrying?: number
    awaiting_user?: number
  }
  stateHistory?: Array<{
    fromStatus: RunTraceStatus
    toStatus: RunTraceStatus
    reason?: string
    recordedAt: number
  }>
}

export interface RunTracePromptSnapshot {
  id: string
  apiCallId?: string
  turnId?: string
  skillId?: string
  skillName?: string
  skillVersion?: string
  mode?: string
  builtAt: number
  promptName?: string
  variables?: Array<{
    key: string
    source: string
    chars: number
    value: unknown
  }>
  folderFingerprint?: Array<{
    file: string
    hash: string
    mtime: number
    bytes: number
  }>
  contextBlocks: Array<{
    source: string
    version: string
    coverage: 'full' | 'packed' | 'partial' | 'structure_map' | 'reference' | 'selection'
    content?: string
    truncated?: boolean
  }>
  systemPrompt?: string
  userPrompt?: string
  finalMessages: RunTraceMessage[]
  finalMessagesTruncated?: boolean
  finalMessagesTruncatedChars?: number
}

export interface RunTraceProcessingReport {
  id: string
  apiCallId?: string
  turnId?: string
  stage: 'pre' | 'post' | 'eval'
  processor: 'hard-rules' | 'hard-rules-legacy-auto' | 'deai' | 'deai-deep-fix' | 'deai-detect-v2' | 'postProcess' | 'integrity' | 'chain-handoff' | 'other'
  status: 'success' | 'warning' | 'failed'
  inputRef?: string
  outputRef?: string
  inputPreview?: string
  outputPreview?: string
  output?: string
  ruleHits?: Array<{ rule: string; count: number; samples?: string[] }>
  warnings?: string[]
  issues?: Array<{
    level: 'error' | 'warning' | 'info'
    code: string
    message: string
    blocking: boolean
    retried?: boolean
  }>
  integrity?: {
    paragraphCountSame: boolean
    sentenceCountSame: boolean
    lengthRatio: number
    rolledBack: boolean
  }
  startedAt: number
  endedAt?: number
  durationMs?: number
}

export interface RunTracePayloadRef {
  id: string
  kind: 'request' | 'response' | 'stream' | 'reasoning' | 'prompt' | 'tool-input' | 'tool-result' | 'processing-input' | 'processing-output' | 'raw-http' | 'folder-output' | 'agent-event'
  file: string
  bytes: number
  chars: number
  sha256: string
  createdAt: number
  artifactRole?: 'final' | 'intermediate'
  firstSeen?: {
    apiCallId?: string
    apiCallSeq?: number
    physicalCallId?: string
    physicalCallSeq?: number
    firstSeenSource?: string
  }
}

export interface RunTraceApiResponseRef {
  ref: string
  file: string
  sha256: string
  bytes: number
  chars: number
  preview?: string
}

export interface RunTracePayloadToAttemptIndexEntry {
  payloadRef: string
  apiCallId?: string
  apiCallSeq?: number
  physicalCallId?: string
  physicalCallSeq?: number
  firstSeenSource?: string
}

export interface RunTraceApiResponseIndexEntry {
  apiCallId: string
  turnId?: string
  seq: number
  status: RunTraceStatus
  response?: RunTraceApiResponseRef
  stream?: RunTraceApiResponseRef
  reasoning?: RunTraceApiResponseRef
  physicalCalls?: Array<{
    physicalCallId?: string
    seq: number
    phase?: RunTracePhysicalCall['phase']
    status: RunTraceStatus
    response?: RunTraceApiResponseRef
    stream?: RunTraceApiResponseRef
    reasoning?: RunTraceApiResponseRef
  }>
}

export interface RunTraceFolderDiagnostic {
  status?: 'success' | 'degraded' | 'failed' | 'blocked'
  errors?: unknown[]
  diagnostics?: unknown[]
  outputPreview?: string
  outputLength?: number
  outputPayloadRef?: string
  apiMeta?: {
    requestMessages?: Array<{ role: string; content: string; length?: number }>
    requestPayloadRef?: string
  }
  postProcessReport?: {
    applied?: boolean
    changedOutput?: boolean
    output?: string
    outputLength?: number
    outputPreview?: string
    outputPayloadRef?: string
    warnings?: string[]
    issues?: Array<{ severity?: string; code?: string; message?: string }>
    durationMs?: number
    perf?:
      | {
          warning: string
          ratio: number
          blocking: false
        }
      | 'usageUnavailable'
      | 'thresholdNotMet'
  }
}

export interface StartRunInput {
  source?: RunTraceSource
  step?: number
  stepName?: string
  mode: string
  /** Application-level run id (pipeline registry domain), never a trace run id. */
  pipelineRunId?: string
  projectId?: string
  projectName?: string
  providerId?: string
  providerName?: string
  providerSource?: RunTraceProviderSource
  model?: string
  skillNames?: string[]
  skillMode?: string
  target?: RunTrace['target']
  context?: RunTrace['context']
  sessionKind?: 'task' | 'chat'
  timeoutHint?: RunTrace['timeoutHint']
}

export interface RecordStepPhaseTimingInput {
  runId: string
  phase: RunTraceStepPhase
  durationMs: number
}

export function folderDiagnosticsStatus(diagnostics: RunTraceFolderDiagnostic[]): RunTraceStatus | null {
  // Tail recovery: the most recent verdict decides whether a historical
  // failure is still live. A failed/blocked entry followed by a later
  // success or degraded is recovered evidence; a trailing failure is not.
  let hasWarning = false
  for (let i = diagnostics.length - 1; i >= 0; i--) {
    const status = diagnostics[i]?.status
    if (!status) continue
    if (status === 'failed' || status === 'blocked') return 'failed'
    if (status === 'degraded') { hasWarning = true; break }
    if (status === 'success') {
      hasWarning = diagnostics.slice(0, i).some(item => {
        const prev = item?.status
        return prev === 'failed' || prev === 'blocked' || prev === 'degraded'
      })
      break
    }
  }
  return hasWarning ? 'degraded' : null
}

export type FolderDiagnosticsRecoveryKind =
  | 'none'
  | 'recovered_from_degraded'
  | 'recovered_from_failed'

export function folderDiagnosticsRecoveryKind(
  diagnostics: RunTraceFolderDiagnostic[]
): FolderDiagnosticsRecoveryKind {
  let seenDegraded = false
  let seenFailed = false
  for (const diagnostic of diagnostics) {
    const status = diagnostic?.status
    if (!status) continue
    if (status === 'failed' || status === 'blocked') seenFailed = true
    if (status === 'degraded') seenDegraded = true
  }
  if (seenFailed) return 'recovered_from_failed'
  return seenDegraded ? 'recovered_from_degraded' : 'none'
}

function traceStatusLevel(status: RunTraceStatus): 'info' | 'warn' | 'error' {
  if (status === 'success') return 'info'
  if (status === 'degraded' || status === 'blocked' || status === 'interrupted' || status === 'partially_applied' || status === 'success_with_warnings') return 'warn'
  return 'error'
}

function traceStatusLabel(status: RunTraceStatus): string {
  if (status === 'success') return '完成'
  if (status === 'degraded') return '完成（降级）'
  if (status === 'blocked') return '已阻断，等待恢复'
  if (status === 'canceled') return '取消'
  if (status === 'interrupted') return '启动中断，需恢复'
  if (status === 'partially_applied') return '完成（部分写入）'
  if (status === 'success_with_warnings') return '完成（带警告）'
  if (status === 'failed_after_write') return '失败（写入后失败）'
  return '失败'
}

export interface StartTurnInput {
  userRequest: string
  skillNames?: string[]
  mode?: string
  intent?: string
  timeoutHint?: RunTrace['timeoutHint']
  permissionDecision?: RunTracePermissionDecision
  writeMode?: string
  toolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
  actualToolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
}

export interface UpdateTurnIntentInput {
  intent?: string
  permissionDecision?: RunTracePermissionDecision
  routingFallback?: string
  toolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
  actualToolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
  surfaceSource?: 'trace-projection'
}

export interface StartApiCallInput {
  source?: RunTraceSource
  turnId?: string
  step?: number
  skillId?: string
  skillName?: string
  agentId?: string
  agentName?: string
  providerId?: string
  providerName?: string
  providerSource?: RunTraceProviderSource
  model?: string
  temperature?: number
  /** null records an undeclared output limit; a number records the effective wire limit. */
  maxTokens?: number | null
  intent?: string
  permissionDecision?: RunTracePermissionDecision
  toolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
  actualToolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
  requestMessages: RunTraceMessage[]
  toolRequestDeltas?: RunTraceMessage[]
  deaiPromptVariant?: RunTraceApiCall['deaiPromptVariant']
}

export interface FinishApiCallInput {
  status: RunTraceStatus
  responseText?: string
  reasoningText?: string
  finishReason?: string
  convergenceReason?: string
  usage?: unknown
  usageUnavailable?: boolean
  durationMs?: number
  error?: string
  reason?: string
  compatibilityMode?: 'json-protocol'
  compatibilityWrite?: boolean
  toolsDowngraded?: boolean | 'json-protocol'
  downgradeReason?: string
  retryStrategy?: 'thinking_disabled' | 'max_tokens_raised' | 'prompt_only' | 'heartbeat_recovery'
  /** null records an undeclared output limit; a number records the effective wire limit. */
  maxTokens?: number | null
  providerContextWindowTokens?: number
  estimatedInputTokens?: number
  contextBudgetDecision?: ContextBudgetDecision
  contextBudgetReason?: string
  usageReconciliation?: unknown
  textOrigin?: 'application' | 'model'
  /** Stable transport-interruption classification delegated to a task layer. */
  interruptionCode?: 'slow_stream_interrupted' | 'reasoning_only_stalled'
  toolAudit?: unknown
  executionSettlement?: RunTraceExecutionSettlement
  readLedger?: RunTraceReadLedgerSnapshot
  deaiPromptVariant?: RunTraceApiCall['deaiPromptVariant']
  timingLedger?: RunTraceTimingLedger
  candidateLedger?: RunTraceApiCall['candidateLedger']
  bodyCandidateLedger?: RunTraceApiCall['bodyCandidateLedger']
  bodyCandidateRetention?: RunTraceApiCall['bodyCandidateRetention']
  retainedCandidateIndex?: number
}

export interface AttachSemanticInput {
  conversationId?: string
  turnId?: string
  prompt?: RunTraceSemantic['prompt']
  usage?: RunTraceSemantic['usage']
  timeToFirstChunkMs?: number
  conversationCompacted?: boolean
}

export interface PhysicalCallInput {
  physicalCallId?: string
  phase?: RunTracePhysicalCall['phase']
  requestMessages: RunTraceMessage[]
  responseText?: string
  streamText?: string
  reasoningText?: string
  finishReason?: string
  usage?: unknown
  usageUnavailable?: boolean
  durationMs?: number
  firstTokenMs?: number
  outputMs?: number
  status?: RunTraceStatus
  error?: string
  toolsEnabled?: boolean
  toolsDowngraded?: boolean
  downgradeReason?: string
  toolCallCount?: number
  toolCallNames?: string[]
  retryStrategy?: RunTracePhysicalCall['retryStrategy']
  /** null records an undeclared output limit; a number records the effective wire limit. */
  maxTokens?: number | null
  temperature?: number
  thinkingDisableParam?: string
  thinkingDisableValue?: string
  modelCapability?: RunTracePhysicalCall['modelCapability']
  providerContextWindowTokens?: number
  estimatedInputTokens?: number
  contextBudgetDecision?: ContextBudgetDecision
  contextBudgetReason?: string
  usageReconciliation?: unknown
  interruptionCode?: RunTracePhysicalCall['interruptionCode']
  firstContentAt?: number
  lastContentAt?: number
  lastReasoningAt?: number
  bodyAbsentMs?: number
  statusCode?: number
  providerErrorSummary?: string
  finalUrl?: string
  transport?: RunTracePhysicalCall['transport']
  providerSource?: RunTraceProviderSource
  heartbeat?: boolean
  contextCompactedMessageCount?: number
  cacheUsageSummary?: RunTracePhysicalCall['cacheUsageSummary']
  contextComposition?: RunTracePhysicalCall['contextComposition']
}

export interface ToolCallInput {
  name: string
  toolCallId?: string
  input: unknown
  argumentsRaw?: string
  result?: unknown
  protocolVersion?: number
  protocolVersionDefaulted?: boolean
  status?: RunTraceToolCall['status']
  startedAt?: number
  endedAt?: number
  durationMs?: number
  error?: string
  errorCode?: string
  toolCapability?: RunTraceToolCapability
  rejectionCategory?: RunTraceToolRejectionCategory
  defaultToolPolicy?: RunTraceToolCall['defaultToolPolicy']
  riskLevel?: RunTraceToolCall['riskLevel']
}

export interface PromptSnapshotInput {
  apiCallId?: string
  turnId?: string
  skillId?: string
  skillName?: string
  skillVersion?: string
  mode?: string
  promptName?: string
  variables?: RunTracePromptSnapshot['variables']
  folderFingerprint?: RunTracePromptSnapshot['folderFingerprint']
  contextBlocks: RunTracePromptSnapshot['contextBlocks']
  systemPrompt?: string
  userPrompt?: string
  finalMessages: RunTraceMessage[]
}

const runTracePromptMessageMemoryChars = 200_000

export interface ProcessingReportInput {
  apiCallId?: string
  turnId?: string
  stage: RunTraceProcessingReport['stage']
  processor: RunTraceProcessingReport['processor']
  status: RunTraceProcessingReport['status']
  inputPreview?: string
  outputPreview?: string
  output?: string
  ruleHits?: RunTraceProcessingReport['ruleHits']
  warnings?: RunTraceProcessingReport['warnings']
  issues?: RunTraceProcessingReport['issues']
  integrity?: RunTraceProcessingReport['integrity']
  startedAt: number
  endedAt?: number
  durationMs?: number
}

export interface RunMetadataInput {
  providerId?: string
  providerName?: string
  providerSource?: RunTraceProviderSource
  model?: string
}

const RUN_TRACE_SCHEMA_VERSION = 23
const reportedLongRequestPhysicalIds = new Set<string>()
const reportedThinkingDisabledObservationPhysicalIds = new Set<string>()
const reportedTerminalMergeTaskIds = new Set<string>()
const lastFinishedRunEndedAtByStep = new Map<string, number>()

function stepTimingKey(run: Pick<RunTrace, 'source' | 'projectId' | 'step'>): string {
  return `${run.source}:${run.projectId || '-'}:${run.step ?? '-'}`
}

function sumNumber(values: Array<number | undefined>): number | undefined {
  let present = false
  let total = 0
  for (const value of values) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    present = true
    total += Math.max(0, value)
  }
  return present ? total : undefined
}

function responseCharacterCount(text: unknown): number {
  return typeof text === 'string' ? text.length : 0
}

let idSeed = 0
function nextId(prefix: string) {
  idSeed += 1
  return `${prefix}-${Date.now()}-${idSeed}`
}

export interface BodyFeedbackAuditRecord {
  schema?: null | {
    candidateChars: number
    feedbackChars: number
    anchorCount: number
    previewChars: number
    suppressedCandidateChars: number
  }
  finalStep?: null | {
    sourceCounts: Record<string, number>
    length: number
  }
}

function formatTime(ts?: number) {
  if (!ts) return '-'
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function normalizeSource(source?: RunTraceSource): RunTraceSource {
  return source === 'outline' || source === 'home' || source === 'eval' || source === 'infra' ? source : 'pipeline'
}

export const useRunTraceStore = defineStore('runTrace', () => {
  const runs = ref<RunTrace[]>([])
  const runDirNameById = new Map<string, string>()
  const saveRunQueuesById = new Map<string, Promise<unknown>>()
  const pendingStreamSaveTimersByRunId = new Map<string, ReturnType<typeof setTimeout>>()
const STREAM_SAVE_INTERVAL_MS = 5000
const RETAINED_AUDIT_EVENT_TYPES = new Set([
  'chain-step',
  'chain-context-slim',
  'deai-prompt-variant',
  'folder-pass-input',
  'chapter-batch-validated',
  'chapter-count-arbitration',
  'chapter-count-arbitration-failed',
  'deai-voice-profile',
  'deai-guidance-pack',
  'deai-stage-guidance',
  'deai-model-profile',
  'deai-calibration',
  'deai-injection-policy',
  'deai-contract-warning',
  'deai-conflict-policy',
  'deai-kernel-v2',
  'deai-score',
  'deai-change-rate',
  'deai-style-drift',
  'deai-quality-gate-degraded',
  'schema-retry-feedback-composed',
  'final-step-feedback-composed',
  'body-feedback-audit',
  'body-generator-step-resume-restored',
  'runtime-fingerprint-missing',
])
  // Bounded renderer memory for a single run. requestMessages are already
  // memory-mapped by aiService; stream events and one run's event list are the
  // remaining unbounded growth paths. Payload export keeps full artifacts on disk.
  let runTraceStreamMemoryChars = 2_000_000
  let runTraceMaxEvents = 128
  const lastMaxEventSeqByRunId = new Map<string, number>()
  const streamCompactionEventReportedByRunId = new Set<string>()
  const currentRunIdBySource = ref<Record<RunTraceSource, string | null>>({
    pipeline: null,
    outline: null,
    home: null,
    eval: null,
    infra: null
  })
  const currentApiCallIdBySource = ref<Record<RunTraceSource, string | null>>({
    pipeline: null,
    outline: null,
    home: null,
    eval: null,
    infra: null
  })
  const lastRunIdBySource = ref<Record<RunTraceSource, string | null>>({
    pipeline: null,
    outline: null,
    home: null,
    eval: null,
    infra: null
  })
  const maxRuns = 20
  const stateWatchdogByRunId = new Map<string, StateWatchdog>()
  const awaitingUserRunIds = new Set<string>()
  const editTaskPlannedBatchIds = new Set<string>()
  const lastStreamActivityEventAtByCallId = new Map<string, number>()
  const lastToolArgumentActivityEventAtByCallId = new Map<string, number>()
  const bodyFeedbackAuditsByRunId = ref<Record<string, BodyFeedbackAuditRecord[]>>({})

  function resetRunActivityDeduplication(runId: string) {
    reportedLongRequestPhysicalIds.delete(runId)
    reportedTerminalMergeTaskIds.delete(runId)
    for (const key of [...editTaskPlannedBatchIds]) {
      if (key.startsWith(`${runId}:`)) editTaskPlannedBatchIds.delete(key)
    }
  }

  function rebuildEventSeqIndex(run: RunTrace, reason: 'restore' | 'direct-push') {
    let maxSeq = 0
    for (const event of run.events) {
      if (typeof event.seq === 'number' && event.seq > maxSeq) maxSeq = event.seq
    }
    lastMaxEventSeqByRunId.set(run.id, maxSeq)
    void reason
  }

  const currentRunId = computed(() => currentRunIdBySource.value.pipeline)
  const currentApiCallId = computed(() => currentApiCallIdBySource.value.pipeline)
  const currentRun = computed(() => runs.value.find(run => run.id === currentRunId.value) || null)
  const sortedRuns = computed(() => [...runs.value].sort((a, b) => b.startedAt - a.startedAt))

  function getRunId(source: RunTraceSource = 'pipeline') {
    return currentRunIdBySource.value[normalizeSource(source)]
  }

  function getLastRunId(source: RunTraceSource = 'pipeline') {
    return lastRunIdBySource.value[normalizeSource(source)]
  }

  function getApiCallId(source: RunTraceSource = 'pipeline') {
    return currentApiCallIdBySource.value[normalizeSource(source)]
  }

  function getRun(id: string) {
    return runs.value.find(run => run.id === id) || null
  }

  function recordBodyFeedbackAudit(record: BodyFeedbackAuditRecord) {
    const runId = currentRunIdBySource.value.pipeline
    if (!runId) return
    const audits = bodyFeedbackAuditsByRunId.value[runId] || []
    audits.push({
      schema: record.schema ?? null,
      finalStep: record.finalStep ?? null
    })
    bodyFeedbackAuditsByRunId.value[runId] = audits
    const schemaAudit = record.schema
    const finalStepAudit = record.finalStep
    if (schemaAudit) {
      addEvent(runId, {
        type: 'body-feedback-audit',
        level: 'info',
        label: '正文修复反馈审计：候选全文已抑制',
        detail: JSON.stringify({
          channel: 'schema',
          candidateChars: schemaAudit.candidateChars,
          feedbackChars: schemaAudit.feedbackChars,
          anchorCount: schemaAudit.anchorCount,
          previewChars: schemaAudit.previewChars,
          suppressedCandidateChars: schemaAudit.suppressedCandidateChars
        })
      })
    }
    if (finalStepAudit) {
      addEvent(runId, {
        type: 'body-feedback-audit',
        level: 'info',
        label: '正文修复反馈审计：终步反馈单源合成',
        detail: JSON.stringify({
          channel: 'final_step',
          sourceCounts: finalStepAudit.sourceCounts,
          feedbackChars: finalStepAudit.length
        })
      })
    }
  }

  function resetBodyFeedbackAudits(runId: string) {
    if (bodyFeedbackAuditsByRunId.value[runId]?.length) {
      bodyFeedbackAuditsByRunId.value[runId] = []
    }
  }

  function getBodyFeedbackAudits(runId: string): BodyFeedbackAuditRecord[] {
    return (bodyFeedbackAuditsByRunId.value[runId] || []).map(audit => ({
      schema: audit.schema ? { ...audit.schema } : null,
      finalStep: audit.finalStep ? { ...audit.finalStep } : null
    }))
  }

  function abandonRunningRun(source: RunTraceSource = 'pipeline') {
    const activeRunId = currentRunIdBySource.value[source]
    if (!activeRunId) return
    const run = getRun(activeRunId)
    if (!run || run.status !== 'running') return
    run.status = 'failed'
    run.endedAt = Date.now()
    run.durationMs = run.endedAt - run.startedAt
    run.error = '上次运行未正常结束，已自动标记为失败'
    run.stateHistory = [...(run.stateHistory || []), {
      fromStatus: 'running',
      toStatus: 'failed',
      reason: run.error,
      recordedAt: Date.now()
    }]
    run.events.push({
      id: nextId('event'),
      ts: Date.now(),
      level: 'error',
      type: 'abandoned',
      label: '运行未正常结束',
      detail: run.error
    })
    rebuildEventSeqIndex(run, 'direct-push')
    run.apiCalls.forEach(call => {
      if (call.status === 'running') {
        call.status = 'failed'
        call.endedAt = Date.now()
        call.error = call.error || 'API 调用随运行中断而结束'
      }
    })
    void saveRunToDisk(run)
  }

  function cancelRunningApiCalls(runId: string, reason?: string) {
    const run = getRun(runId)
    if (!run) return
    for (const call of run.apiCalls) {
      if (call.status !== 'running') continue
      ;(call.physicalCalls || []).forEach(physical => {
        if (physical.status !== 'running') return
        physical.status = 'canceled'
        physical.durationMs = Date.now() - physical.startedAt
        physical.endedAt = Date.now()
        physical.error = reason || '物理请求已取消'
      })
      call.status = 'canceled'
      call.endedAt = Date.now()
      call.durationMs = call.endedAt - call.startedAt
      call.error = reason || 'API 调用已取消'
      addEvent(runId, createLifecycleTransitionEvent(
        'RunTraceStatus',
        'running',
        'canceled',
        [reason, `apiCall=${call.id} seq=${call.seq}`].filter(Boolean).join(' / '),
      ))
      addEvent(runId, {
        type: 'api-canceled',
        level: 'error',
        label: `第 ${call.seq} 次 API 调用取消`,
        detail: [call.skillName, call.model, call.error].filter(Boolean).join(' / ')
      })
    }
    if (currentApiCallIdBySource.value[run.source]) {
      currentApiCallIdBySource.value[run.source] = null
    }
  }

  async function shutdownAndFlush(options: { reason?: string; timeoutMs?: number } = {}) {
    const reason = options.reason || '应用关闭，运行已取消'
    // runs is newest-first. Cancelling newest first keeps the returned order
    // aligned with the registry's run list users already see.
    const activeRuns = runs.value.filter(run => run.status === 'running')
    const canceledRunIds: string[] = []
    const errors: string[] = []
    const pendingSaves: Promise<unknown>[] = []
    for (const run of activeRuns) {
      cancelRunningApiCalls(run.id, reason)
      finishRun(run.id, 'canceled', reason, 'app_shutdown')
      canceledRunIds.push(run.id)
      const queuedSave = saveRunQueuesById.get(run.id)
      if (queuedSave) pendingSaves.push(queuedSave)
    }
    const timeoutMs = options.timeoutMs ?? 3000
    if (pendingSaves.length > 0) {
      try {
        await Promise.race([
          Promise.allSettled(pendingSaves).then(() => undefined),
          new Promise<void>(resolve => {
            const timer = setTimeout(resolve, timeoutMs)
            ;(timer as unknown as { unref?: () => void }).unref?.()
          }),
        ])
      } catch (error) {
        // Trace persistence is observability only; shutdown still continues.
        errors.push(error instanceof Error ? error.message : String(error))
      }
    }
    return { canceledRunIds, errors }
  }

  function failRunningApiCalls(runId: string, reason?: string) {
    const run = getRun(runId)
    if (!run) return
    for (const call of run.apiCalls) {
      if (call.status !== 'running') continue
      ;(call.physicalCalls || []).forEach(physical => {
        if (physical.status !== 'running') return
        physical.status = 'failed'
        physical.durationMs = Date.now() - physical.startedAt
        physical.endedAt = Date.now()
        physical.error = reason || '物理请求失败'
      })
      call.status = 'failed'
      call.endedAt = Date.now()
      call.durationMs = call.endedAt - call.startedAt
      call.error = reason || 'API 调用失败'
      addEvent(runId, createLifecycleTransitionEvent(
        'RunTraceStatus',
        'running',
        'failed',
        [reason, `apiCall=${call.id} seq=${call.seq}`].filter(Boolean).join(' / '),
      ))
      addEvent(runId, {
        type: 'api-failed',
        level: 'error',
        label: `第 ${call.seq} 次 API 调用失败`,
        detail: [call.skillName, call.model, call.error].filter(Boolean).join(' / ')
      })
    }
    if (currentApiCallIdBySource.value[run.source]) {
      currentApiCallIdBySource.value[run.source] = null
    }
  }

  function trimRuns() {
    if (runs.value.length <= maxRuns) return
    const keepRuns = runs.value.slice(0, maxRuns)
    const removedRuns = runs.value.slice(maxRuns)
    runs.value = keepRuns
    removedRuns.forEach(removeRunDirectory)
  }

  function startRun(input: StartRunInput) {
    const source = normalizeSource(input.source)
    const run: RunTrace = {
      id: nextId('run'),
      source,
      sourceName: RUN_TRACE_SOURCE_NAMES[source],
      step: input.step,
      stepName: input.stepName,
      mode: input.mode,
      projectId: input.projectId,
      projectName: input.projectName,
      providerId: input.providerId,
      providerName: input.providerName,
      providerSource: input.providerSource,
      model: input.model,
      skillNames: input.skillNames?.slice() || [],
      skillMode: input.skillMode,
      pipelineRunId: input.pipelineRunId,
      target: input.target ? { ...input.target } : undefined,
      context: input.context ? { ...input.context } : undefined,
      status: 'running',
      runtimeFingerprint: resolveRuntimeBuildFingerprint(),
      executionContext: source === 'eval' ? 'skill-eval' : undefined,
      startedAt: Date.now(),
      timeoutHint: input.timeoutHint ? { ...input.timeoutHint } : undefined,
      stateHistory: [],
      events: [],
      apiCalls: [],
      sessionKind: input.sessionKind || 'task',
      turns: input.sessionKind === 'chat' ? [] : undefined,
      promptSnapshots: [],
      processingReports: [],
      payloads: []
    }
    const previousRunEndedAt = lastFinishedRunEndedAtByStep.get(stepTimingKey(run))
    if (typeof previousRunEndedAt === 'number' && previousRunEndedAt <= run.startedAt) {
      run.stepBoundaryGapMs = Math.max(0, run.startedAt - previousRunEndedAt)
    }
    runs.value.unshift(run)
    resetRunActivityDeduplication(run.id)
    currentRunIdBySource.value[source] = run.id
    currentApiCallIdBySource.value[source] = null
    lastRunIdBySource.value[source] = run.id
    addEvent(run.id, {
      type: 'started',
      level: 'info',
      label: `开始${RUN_TRACE_SOURCE_NAMES[source]}${input.stepName ? ' ' + input.stepName : ''}运行`
    })
    if (run.runtimeFingerprint?.source !== 'vite-manifest') {
      addEvent(run.id, {
        type: 'runtime-fingerprint-missing',
        level: 'warn',
        label: '运行指纹缺失',
        detail: `source=${run.runtimeFingerprint?.source || 'unknown'} missingFields=schemaVersion,commit,buildTime,appVersion`,
        payload: {
          source: run.runtimeFingerprint?.source || 'unknown',
          missingFields: ['schemaVersion', 'commit', 'buildTime', 'appVersion'],
        }
      })
    }
    if (run.executionContext) {
      addEvent(run.id, {
        type: 'execution-context',
        level: 'info',
        label: '执行上下文已标记',
        detail: run.executionContext,
        payload: { executionContext: run.executionContext }
      })
    }
    trimRuns()
    startStateWatchdogForRun(run.id, 'active')
    return run.id
  }

  function recordStepPhaseTiming(runId: string, phase: RunTraceStepPhase, durationMs: number): void {
    const run = getRun(runId)
    if (!run || run.status !== 'running') return
    if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) return
    const bucket = run.stepPhaseTiming || {}
    bucket[phase] = Math.max(0, (bucket[phase] || 0) + durationMs)
    run.stepPhaseTiming = bucket
  }

  function recordStepObservation(runId: string, phase: RunTraceStepPhase, durationMs?: number): void {
    const run = getRun(runId)
    if (!run || run.status !== 'running') return
    if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0) return

    const bucket = run.stepPhaseTiming || {}
    if (durationMs === 0) {
      bucket[phase] = bucket[phase] || 0
    } else {
      bucket[phase] = (bucket[phase] || 0) + durationMs
    }
    run.stepPhaseTiming = bucket
  }

  function startStateWatchdogForRun(runId: string, status: LifecycleStatus) {
    const run = getRun(runId)
    if (!run) return
    clearStateWatchdogForRun(runId)
    const watchdog = startStateWatchdog(() => {
      if (run.status !== 'running') return
      addEvent(runId, {
        type: 'state-stuck-detected',
        level: 'warn',
        label: '运行状态停滞',
        detail: `${status} 状态超过 ${getStateTimeout(status, run) / 1000} 秒，请检查 API 或终态归并`
      })
    }, status, run)
    if (watchdog) stateWatchdogByRunId.set(runId, watchdog)
  }

  function startAwaitingUser(runId: string, reason?: string) {
    const run = getRun(runId)
    if (!run || run.status !== 'running') return
    awaitingUserRunIds.add(runId)
    startStateWatchdogForRun(runId, 'awaiting_user')
    addEvent(runId, {
      type: 'state-transition',
      level: 'info',
      label: '运行进入等待用户确认',
      detail: reason || 'awaiting_user'
    })
  }

  function isAwaitingUser(runId: string) {
    return awaitingUserRunIds.has(runId)
  }

  function finishAwaitingUser(runId: string, reason?: string) {
    const run = getRun(runId)
    if (!run || run.status !== 'running') return
    if (!awaitingUserRunIds.has(runId)) return
    awaitingUserRunIds.delete(runId)
    startStateWatchdogForRun(runId, 'active')
    addEvent(runId, {
      type: 'state-transition',
      level: 'info',
      label: '等待用户确认已恢复',
      detail: reason || 'awaiting_user_resumed'
    })
  }

  function clearStateWatchdogForRun(runId: string) {
    stateWatchdogByRunId.get(runId)?.clear()
    stateWatchdogByRunId.delete(runId)
  }

  function reportLongRequestInProgress(runId: string, physical: RunTracePhysicalCall) {
    if (physical.status !== 'running') return
    if (reportedLongRequestPhysicalIds.has(physical.id)) return
    reportedLongRequestPhysicalIds.add(physical.id)
    addEvent(runId, {
      type: 'long-request-in-progress',
      level: 'info',
      label: '长物理请求进行中',
      detail: [
        `physicalCall=${physical.seq}`,
        physical.heartbeat ? 'heartbeat=true' : 'heartbeat=false',
        physical.phase,
      ].filter(Boolean).join(' / '),
      payload: { physicalCallId: physical.id, seq: physical.seq, heartbeat: Boolean(physical.heartbeat) }
    })
  }

  function reportRunActivity(
    runId: string,
    source: RunActivitySource,
    detail?: string,
    options?: { persist?: boolean; turnId?: string | null },
  ) {
    const run = getRun(runId)
    if (!run || run.status !== 'running') return false
    stateWatchdogByRunId.get(runId)?.reportProgress()
    addEvent(runId, {
      type: 'run-activity',
      level: 'info',
      label: '运行活性证据',
      detail: [source, detail].filter(Boolean).join(' / '),
      payload: { source, detail },
      turnId: options?.turnId || undefined,
    })
    if (options?.persist) void saveRunToDisk(run)
    return true
  }

  function reportToolArgumentProgress(
    runId: string,
    callId: string,
    progress: { toolCallCount: number; argumentCharacters: number },
  ) {
    const call = getRun(runId)?.apiCalls.find(item => item.id === callId)
    if (!call || call.status !== 'running') return false
    const now = Date.now()
    if (call.lastToolArgumentProgressAt === undefined || call.lastToolArgumentProgressAt <= now) {
      call.lastToolArgumentProgressAt = now
    }
    call.lastToolArgumentProgress = {
      toolCallCount: Math.max(0, Math.floor(progress.toolCallCount || 0)),
      argumentCharacters: Math.max(0, Math.floor(progress.argumentCharacters || 0)),
    }
    call.lastExecutionActivityAt = now
    const lastEventAt = lastToolArgumentActivityEventAtByCallId.get(callId) ?? 0
    const activityThrottleMs = safeModeActive.value ? 5000 : 1000
    if (now - lastEventAt < activityThrottleMs) return true
    lastToolArgumentActivityEventAtByCallId.set(callId, now)
    reportRunActivity(runId, 'tool_argument_delta', [
      `apiCall=${call.seq}`,
      `toolCalls=${call.lastToolArgumentProgress.toolCallCount}`,
      `arguments=${call.lastToolArgumentProgress.argumentCharacters}`,
    ].join('/'))
    return true
  }

  function startTurn(runId: string, input: StartTurnInput) {
    const run = getRun(runId)
    if (!run || run.sessionKind !== 'chat') return ''
    run.timeoutHint = input.timeoutHint ? { ...input.timeoutHint } : undefined
    if (run.status !== 'running') {
      run.status = 'running'
      run.endedAt = undefined
      run.durationMs = undefined
      run.error = undefined
      startStateWatchdogForRun(runId, 'active')
    } else if (!awaitingUserRunIds.has(runId)) {
      startStateWatchdogForRun(runId, 'active')
    }
    const turn: RunTraceTurn = {
      id: nextId('turn'),
      seq: (run.turns?.length || 0) + 1,
      startedAt: Date.now(),
      status: 'running',
      userRequest: input.userRequest,
      skillNames: input.skillNames?.slice(),
      mode: input.mode,
      intent: input.intent,
      permissionDecision: input.permissionDecision ? { ...input.permissionDecision } : undefined,
      writeMode: input.writeMode,
      toolSurface: input.toolSurface?.map(item => ({ ...item })),
      actualToolSurface: input.actualToolSurface?.map(item => ({ ...item }))
    }
    run.turns = run.turns || []
    run.turns.push(turn)
    run.currentTurnId = turn.id
    currentRunIdBySource.value[run.source] = run.id
    return turn.id
  }

  function finishTurn(runId: string, turnId: string, status: RunTraceStatus, error?: string, reason?: string) {
    const run = getRun(runId)
    const turn = run?.turns?.find(item => item.id === turnId)
    if (!run || !turn || turn.status !== 'running') return
    turn.status = status
    turn.reason = reason
    turn.endedAt = Date.now()
    turn.durationMs = turn.endedAt - turn.startedAt
    turn.error = error
    addEvent(runId, {
      type: status === 'canceled' ? 'turn-canceled' : 'turn-finished',
      level: traceStatusLevel(status),
      label: `第 ${turn.seq} 轮${traceStatusLabel(status)}`,
      detail: [error, reason].filter(Boolean).join(' / ')
    })
    if (run.currentTurnId === turnId) run.currentTurnId = undefined
    if (run.sessionKind === 'chat' && run.status === 'running') {
      clearStateWatchdogForRun(runId)
      addEvent(runId, {
        type: 'session-active',
        level: 'info',
        label: '会话仍在进行',
        detail: `第 ${turn.seq} 轮已${traceStatusLabel(status)}；本条 chat run 保持 running，等待下一轮用户输入`
      })
    }
    void saveRunToDisk(run)
  }

  function updateTurnIntent(
    runId: string,
    turnId: string,
    input: UpdateTurnIntentInput,
  ) {
    const run = getRun(runId)
    const turn = run?.turns?.find(item => item.id === turnId)
    if (!run || !turn || turn.status !== 'running') return false
    if (input.intent !== undefined) turn.intent = input.intent
    if (input.permissionDecision) turn.permissionDecision = { ...input.permissionDecision }
    turn.routingFallback = input.routingFallback || turn.routingFallback
    if (input.toolSurface) {
      turn.toolSurface = input.toolSurface.map(item => ({ ...item }))
    }
    if (input.actualToolSurface) {
      turn.actualToolSurface = input.actualToolSurface.map(item => ({ ...item }))
    }
    if (input.surfaceSource) turn.surfaceSource = input.surfaceSource
    addEvent(runId, {
      type: 'turn-intent-updated',
      level: 'info',
      label: `第 ${turn.seq} 轮意图已修正`,
      detail: [
        input.intent,
        input.routingFallback,
        input.actualToolSurface?.map(item => item.name).join(','),
      ].filter(Boolean).join(' / '),
      payload: input.surfaceSource ? { surfaceSource: input.surfaceSource } : undefined
    })
    void saveRunToDisk(run)
    return true
  }

  function ensureEventLedger(run: RunTrace) {
    if (!run.eventLedger) {
      run.eventLedger = {
        totalEvents: run.events.length,
        droppedInfoEvents: 0,
        droppedWarnEvents: 0,
        droppedErrorEvents: 0
      }
    }
    return run.eventLedger
  }

  function evictExcessEvents(run: RunTrace) {
    if (run.events.length <= runTraceMaxEvents) return
    const isProtected = (event: RunTraceEvent) =>
      event.level !== 'info' || RETAINED_AUDIT_EVENT_TYPES.has(String(event.type || ''))
    const protectedCount = run.events.filter(isProtected).length
    if (protectedCount >= runTraceMaxEvents - 1) return
    const evictableInfoCount = run.events.length - protectedCount
    const evictInfoCount = Math.min(
      evictableInfoCount,
      run.events.length - (runTraceMaxEvents - 1)
    )
    if (evictInfoCount <= 0) return
    const ledger = ensureEventLedger(run)
    const seenCountByType = new Map<string, number>()
    const duplicateBudgetByType = new Map<string, number>()
    for (const event of run.events) {
      const eventType = String(event.type || 'unknown')
      const seenCount = seenCountByType.get(eventType) || 0
      seenCountByType.set(eventType, seenCount + 1)
      if (seenCount > 0) {
        duplicateBudgetByType.set(eventType, (duplicateBudgetByType.get(eventType) || 0) + 1)
      }
    }

    // Preserve the first occurrence of each diagnostic event type. Later
    // duplicates are compacted first so historical audit evidence survives
    // bursts of repeated heartbeat or status events.
    const remainingByType = new Map(seenCountByType)
    let remainingEvictions = evictInfoCount
    const compactEvents = (sourceEvents: RunTraceEvent[], duplicatePhase: boolean) =>
      sourceEvents.filter(event => {
        if (isProtected(event) || remainingEvictions <= 0) return true
        const eventType = String(event.type || 'unknown')
        const budget = duplicatePhase
          ? duplicateBudgetByType.get(eventType) || 0
          : remainingByType.get(eventType) || 0
        if (budget <= 0 || (remainingByType.get(eventType) || 0) <= 0) return true
        remainingByType.set(eventType, (remainingByType.get(eventType) || 0) - 1)
        if (duplicatePhase) {
          duplicateBudgetByType.set(eventType, budget - 1)
        }
        ledger.droppedInfoEvents += 1
        ledger.droppedInfoEventsByType = ledger.droppedInfoEventsByType || {}
        ledger.droppedInfoEventsByType[eventType] =
          (ledger.droppedInfoEventsByType[eventType] || 0) + 1
        remainingEvictions -= 1
        return false
      })

    run.events = compactEvents(run.events, true)
    if (remainingEvictions > 0) {
      run.events = compactEvents(run.events, false)
    }
  }

  function reportEventCompactionOnce(run: RunTrace, droppedInfoEvents: number) {
    if (droppedInfoEvents <= 0) return
    const alreadyReported = run.events.some(event => event.type === 'trace-events-compacted')
    if (alreadyReported) return
    addEvent(run.id, {
      type: 'trace-events-compacted',
      level: 'warn',
      label: '运行记录事件已压缩',
      detail: `droppedInfo=${droppedInfoEvents} kept=${run.events.length}`,
      payload: { droppedInfoEvents, keptEvents: run.events.length }
    })
  }

  function addEvent(runId: string | null | undefined, event: Omit<RunTraceEvent, 'id' | 'ts'>) {
    if (!runId) return
    const run = getRun(runId)
    if (!run) return
    const seq = (lastMaxEventSeqByRunId.get(runId) || 0) + 1
    lastMaxEventSeqByRunId.set(runId, seq)
    const { turnId: explicitTurnId, ...rest } = event
    run.events.push({
      id: nextId('event'),
      ts: Date.now(),
      seq,
      // Explicit turnId wins. Otherwise use the run's active turn; if an
      // exporter removed that transient pointer mid-stream, the latest running
      // turn is the only semantically valid owner.
      turnId: explicitTurnId
        ?? run.currentTurnId
        ?? [...(run.turns || [])].reverse().find(turn => turn.status === 'running')?.id,
      ...rest
    })
    const ledgerExisted = Boolean(run.eventLedger)
    const ledger = ensureEventLedger(run)
    if (ledgerExisted) ledger.totalEvents += 1
    const droppedBefore = ledger.droppedInfoEvents
    evictExcessEvents(run)
    reportEventCompactionOnce(run, ledger.droppedInfoEvents - droppedBefore)
  }

  function setMemoryLimits(limits: { streamMemoryChars?: number; maxEvents?: number }) {
    const previous = {
      streamMemoryChars: runTraceStreamMemoryChars,
      maxEvents: runTraceMaxEvents
    }
    if (typeof limits.streamMemoryChars === 'number'
      && Number.isFinite(limits.streamMemoryChars)
      && limits.streamMemoryChars > 0) {
      runTraceStreamMemoryChars = Math.floor(limits.streamMemoryChars)
    }
    if (typeof limits.maxEvents === 'number'
      && Number.isFinite(limits.maxEvents)
      && limits.maxEvents > 0) {
      runTraceMaxEvents = Math.floor(limits.maxEvents)
    }
    runs.value.forEach(run => {
      const ledger = ensureEventLedger(run)
      const droppedBefore = ledger.droppedInfoEvents
      evictExcessEvents(run)
      reportEventCompactionOnce(run, ledger.droppedInfoEvents - droppedBefore)
    })
    return previous
  }
  function addAgentEvent(runId: string, event: Omit<RunTraceEvent, 'id' | 'ts'> & { payload?: unknown }) {
    addEvent(runId, event)
  }

  function startApiCall(runId: string, input: StartApiCallInput) {
    const run = getRun(runId)
    if (!run) return ''
    backfillRunMetadata(runId, input)
    const call: RunTraceApiCall = {
      id: nextId('api'),
      turnId: input.turnId || run.currentTurnId,
      seq: run.apiCalls.length + 1,
      step: input.step,
      skillId: input.skillId,
      skillName: input.skillName,
      agentId: input.agentId,
      agentName: input.agentName,
      providerId: input.providerId,
      providerName: input.providerName,
      providerSource: input.providerSource,
      model: input.model,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      intent: input.intent,
      permissionDecision: input.permissionDecision ? { ...input.permissionDecision } : undefined,
      toolSurface: input.toolSurface,
      actualToolSurface: input.actualToolSurface,
      requestMessages: input.requestMessages.map(m => ({ role: m.role, content: m.content })),
      toolRequestDeltas: input.toolRequestDeltas?.map(m => ({ role: m.role, content: m.content })),
      deaiPromptVariant: input.deaiPromptVariant,
      responseText: '',
    streamText: '',
      reasoningText: '',
      status: 'running',
      startedAt: Date.now()
    }
    run.apiCalls.push(call)
    currentApiCallIdBySource.value[run.source] = call.id
    addEvent(runId, {
      type: 'api-start',
      level: 'info',
      label: `第 ${call.seq} 次 API 调用开始`,
      detail: JSON.stringify({
        skillName: input.skillName,
        model: input.model,
        actualToolSurface: input.actualToolSurface?.map(item => ({ ...item })) || [],
        permissionDecision: input.permissionDecision || null
      })
    })
    return call.id
  }

  function updateApiCallToolSurface(
    runId: string,
    callId: string,
    input: {
      actualToolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
      permissionDecision?: RunTracePermissionDecision
    },
  ) {
    const run = getRun(runId)
    const call = run?.apiCalls.find(item => item.id === callId)
    if (!run || !call || (!input.actualToolSurface && !input.permissionDecision)) return false
    if (input.actualToolSurface) {
      call.actualToolSurface = input.actualToolSurface.map(item => ({ ...item }))
    }
    if (input.permissionDecision) {
      call.permissionDecision = { ...input.permissionDecision }
    }
    addEvent(runId, {
      type: 'api-tool-surface-updated',
      level: 'info',
      label: `第 ${call.seq} 次 API 调用工具面已回填`,
      detail: [
        call.actualToolSurface?.map(item => item.name).join(','),
        call.permissionDecision ? `${call.permissionDecision.decision}/${call.permissionDecision.source}` : undefined,
      ].filter(Boolean).join(' / ')
    })
    void saveRunToDisk(run)
    return true
  }

  function updateApiCallExecutionSettlement(
    runId: string,
    callId: string,
    input: {
      executionSettlement: RunTraceExecutionSettlement
      readLedger?: RunTraceReadLedgerSnapshot
    },
  ) {
    const run = getRun(runId)
    const call = run?.apiCalls.find(item => item.id === callId)
    if (!run || !call || call.status !== 'running') return false
    call.executionSettlement = { ...input.executionSettlement }
    if (input.readLedger) call.readLedger = { ...input.readLedger }
    addEvent(runId, {
      type: 'api-execution-settlement-updated',
      level: input.executionSettlement.exhaustedClasses.length ? 'warn' : 'info',
      label: `第 ${call.seq} 次 API 调用执行状态更新`,
      detail: [
        input.executionSettlement.phase,
        `读取 ${input.executionSettlement.readToolCalls}/${input.executionSettlement.maxReadToolCalls}`,
        `写入 ${input.executionSettlement.writeToolCalls}/${input.executionSettlement.reservedWriteToolCalls}`,
        input.executionSettlement.planComplete ? '计划完成' : `覆盖 ${input.executionSettlement.trustedCoverageCount}`,
      ].join(' / '),
    })
    void saveRunToDisk(run)
    return true
  }

  function maybeReportThinkingDisabledReasoning(runId: string, physical: RunTracePhysicalCall) {
    if (physical.retryStrategy !== 'thinking_disabled') return
    if (reportedThinkingDisabledObservationPhysicalIds.has(physical.id)) return
    const reasoningOutputTokens = normalizeTraceUsage(undefined, physical.usage)?.reasoningOutputTokens
    if (!reasoningOutputTokens || reasoningOutputTokens <= 0) return
    reportedThinkingDisabledObservationPhysicalIds.add(physical.id)
    addEvent(runId, {
      type: 'thinking-disabled-reasoning-consumed',
      level: 'warn',
      label: '禁推理参数未生效，仍产生推理输出',
      detail: `seq=${physical.seq} reasoningOutputTokens=${reasoningOutputTokens}`,
    })
  }

  function appendPhysicalCall(runId: string, callId: string, input: PhysicalCallInput): string {
    const call = getRun(runId)?.apiCalls.find(item => item.id === callId)
    if (!call) return ''
    const hasRequestMessages = input.requestMessages.some(message => Boolean(message.content))
    if (!hasRequestMessages && !input.responseText && !input.streamText && !input.reasoningText) {
      call.integrity = {
        ...call.integrity,
        physicalSkipped: true,
        physicalSkipReason: 'empty-payload'
      }
      return ''
    }
    call.physicalCalls = call.physicalCalls || []
    const existing = input.physicalCallId
      ? call.physicalCalls.find(item => item.physicalCallId === input.physicalCallId)
      : undefined
    if (existing) {
      const nextStatus = input.status || (input.error ? 'failed' : 'success')
      // A late "running" callback must not reopen a physical call that already
      // reached a terminal state.
      if (existing.status !== 'running' && nextStatus === 'running') return existing.id
      existing.phase = input.phase || existing.phase
      existing.status = nextStatus
      existing.requestMessages = input.requestMessages.length
        ? input.requestMessages.map(m => ({ role: m.role, content: m.content }))
        : existing.requestMessages
      // Retry wrappers reset per-attempt buffers, while the late running
      // callback for the same physicalCallId can carry empty payloads. A
      // terminal response must survive those later updates.
      const existingStatus = existing.status
      const nextStatusIsTerminal = nextStatus !== 'running'
      const canOverwriteResponse = existingStatus === 'running' || nextStatusIsTerminal
      if (canOverwriteResponse && typeof input.responseText === 'string' && input.responseText.length >= existing.responseText.length) {
        existing.responseText = input.responseText
      }
      if (canOverwriteResponse && typeof input.streamText === 'string' && input.streamText.length >= existing.streamText.length) {
        existing.streamText = input.streamText
      }
      const existingReasoning = existing.reasoningText || ''
      if (input.reasoningText && input.reasoningText.length >= existingReasoning.length) {
        existing.reasoningText = input.reasoningText
      }
      existing.finishReason = input.finishReason ?? existing.finishReason
      existing.usage = input.usage ?? existing.usage
      existing.usageUnavailable = input.usageUnavailable ?? (input.usage ? false : existing.usageUnavailable)
      existing.endedAt = Date.now()
      existing.durationMs = input.durationMs ?? existing.durationMs
      existing.firstTokenMs = input.firstTokenMs ?? existing.firstTokenMs
      existing.outputMs = input.outputMs ?? existing.outputMs
      existing.error = input.error
      existing.toolsEnabled = input.toolsEnabled ?? existing.toolsEnabled
      existing.toolsDowngraded = input.toolsDowngraded ?? existing.toolsDowngraded
      existing.downgradeReason = input.downgradeReason ?? existing.downgradeReason
      existing.toolCallCount = input.toolCallCount ?? existing.toolCallCount
      existing.toolCallNames = input.toolCallNames ?? existing.toolCallNames
      existing.retryStrategy = input.retryStrategy ?? existing.retryStrategy
      existing.maxTokens = input.maxTokens ?? existing.maxTokens
      existing.temperature = input.temperature ?? existing.temperature
      existing.thinkingDisableParam = input.thinkingDisableParam ?? existing.thinkingDisableParam
      existing.thinkingDisableValue = input.thinkingDisableValue ?? existing.thinkingDisableValue
      existing.modelCapability = input.modelCapability ?? existing.modelCapability
      existing.providerContextWindowTokens = input.providerContextWindowTokens ?? existing.providerContextWindowTokens
      existing.estimatedInputTokens = input.estimatedInputTokens ?? existing.estimatedInputTokens
      existing.contextBudgetDecision = input.contextBudgetDecision ?? existing.contextBudgetDecision
      existing.contextBudgetReason = input.contextBudgetReason ?? existing.contextBudgetReason
      existing.usageReconciliation = input.usageReconciliation ?? existing.usageReconciliation
      existing.interruptionCode = input.interruptionCode ?? existing.interruptionCode
      existing.firstContentAt = input.firstContentAt ?? existing.firstContentAt
      existing.lastContentAt = input.lastContentAt ?? existing.lastContentAt
      existing.lastReasoningAt = input.lastReasoningAt ?? existing.lastReasoningAt
      existing.bodyAbsentMs = input.bodyAbsentMs ?? existing.bodyAbsentMs
      existing.statusCode = input.statusCode ?? existing.statusCode
      existing.providerErrorSummary = input.providerErrorSummary ?? existing.providerErrorSummary
      existing.finalUrl = input.finalUrl ?? existing.finalUrl
      existing.transport = input.transport ?? existing.transport
      existing.providerSource = input.providerSource ?? existing.providerSource
      existing.contextCompactedMessageCount = input.contextCompactedMessageCount ?? existing.contextCompactedMessageCount
      existing.cacheUsageSummary = input.cacheUsageSummary ?? existing.cacheUsageSummary
      existing.contextComposition = input.contextComposition ?? existing.contextComposition
      if (input.heartbeat) existing.heartbeat = true
      maybeReportThinkingDisabledReasoning(runId, existing)
      const isHeartbeatProgress = input.heartbeat && existing.status === 'running'
      if (!isHeartbeatProgress) {
        addEvent(runId, {
          type: 'physical-call',
          level: existing.status === 'success' ? 'info' : existing.status === 'running' ? 'info' : 'error',
          label: `第 ${existing.seq} 次物理请求${existing.status === 'success' ? '完成' : existing.status === 'running' ? '进行中' : '失败'}`,
          detail: [
            existing.phase,
            call.skillName,
            call.model,
            existing.finishReason,
            existing.statusCode != null ? `HTTP ${existing.statusCode}` : undefined,
            existing.providerErrorSummary,
            existing.finalUrl,
            existing.transport,
            existing.error,
          ].filter(Boolean).join(' / ')
        })
      }
      if (existing.status === 'running') {
        call.lastExecutionActivityAt = Date.now()
        if (isHeartbeatProgress) {
          stateWatchdogByRunId.get(runId)?.reportProgress()
        } else {
          reportRunActivity(runId, 'physical_call_running', `${existing.seq}/${call.skillName || call.id}`)
        }
        reportLongRequestInProgress(runId, existing)
      }
      return existing.id
    }
    const physical: RunTracePhysicalCall = {
      id: nextId('physical'),
      physicalCallId: input.physicalCallId,
      seq: call.physicalCalls.length + 1,
      phase: input.phase || 'normal',
      status: input.status || (input.error ? 'failed' : 'success'),
      requestMessages: input.requestMessages.map(m => ({ role: m.role, content: m.content })),
      responseText: input.responseText || '',
      streamText: input.streamText || '',
      reasoningText: input.reasoningText || '',
      finishReason: input.finishReason,
      usage: input.usage,
      usageUnavailable: input.usageUnavailable,
      startedAt: Date.now(),
      durationMs: input.durationMs,
      firstTokenMs: input.firstTokenMs,
      outputMs: input.outputMs,
      endedAt: input.durationMs ? Date.now() : undefined,
      error: input.error,
      toolsEnabled: input.toolsEnabled,
      toolsDowngraded: input.toolsDowngraded,
      downgradeReason: input.downgradeReason,
      toolCallCount: input.toolCallCount,
      toolCallNames: input.toolCallNames,
      retryStrategy: input.retryStrategy,
      maxTokens: input.maxTokens,
      temperature: input.temperature,
      thinkingDisableParam: input.thinkingDisableParam,
      thinkingDisableValue: input.thinkingDisableValue,
      modelCapability: input.modelCapability,
      providerContextWindowTokens: input.providerContextWindowTokens,
      estimatedInputTokens: input.estimatedInputTokens,
      contextBudgetDecision: input.contextBudgetDecision,
      contextBudgetReason: input.contextBudgetReason,
      usageReconciliation: input.usageReconciliation,
      interruptionCode: input.interruptionCode,
      firstContentAt: input.firstContentAt,
      lastContentAt: input.lastContentAt,
      lastReasoningAt: input.lastReasoningAt,
      bodyAbsentMs: input.bodyAbsentMs,
      statusCode: input.statusCode,
      providerErrorSummary: input.providerErrorSummary,
      finalUrl: input.finalUrl,
      transport: input.transport,
      providerSource: input.providerSource,
      contextCompactedMessageCount: input.contextCompactedMessageCount,
      cacheUsageSummary: input.cacheUsageSummary,
      contextComposition: input.contextComposition,
      heartbeat: input.heartbeat,
    }
    call.physicalCalls.push(physical)
    maybeReportThinkingDisabledReasoning(runId, physical)
    if (physical.status === 'running') {
      call.lastExecutionActivityAt = Date.now()
      reportRunActivity(runId, physical.heartbeat ? 'physical_call_heartbeat' : 'physical_call_running', `${physical.seq}/${call.skillName || call.id}`)
      reportLongRequestInProgress(runId, physical)
    }
    addEvent(runId, {
      type: 'physical-call',
      level: physical.status === 'success' || physical.status === 'running' ? 'info' : 'error',
      label: `第 ${physical.seq} 次物理请求${physical.status === 'success' ? '完成' : physical.status === 'running' ? '进行中' : '失败'}`,
      detail: [
        physical.phase,
        call.skillName,
        call.model,
        physical.finishReason,
        physical.statusCode != null ? `HTTP ${physical.statusCode}` : undefined,
        physical.providerErrorSummary,
        physical.finalUrl,
        physical.transport,
        physical.error,
      ].filter(Boolean).join(' / ')
    })
    if (physical.status !== 'running') {
      const priorPhysicalResponses = new Set((call.physicalCalls || [])
        .filter(item => item !== physical)
        .flatMap(item => [item.responseText, item.streamText])
        .filter((text): text is string => typeof text === 'string' && Boolean(text)))
      backfillApiResponseFromPhysicalCalls(call)
      if (
        priorPhysicalResponses.has(call.responseText || '')
        && ((physical.responseText || '').trim() || (physical.streamText || '').trim())
      ) {
        call.responseText = physical.responseText || physical.streamText || ''
      }
      if (!String(call.responseText || '').trim() && String(call.streamText || '').trim()) {
        call.responseText = call.streamText
      }
    }
    return physical.id
  }

  function appendToolCall(runId: string, callId: string, input: ToolCallInput): string {
    const call = getRun(runId)?.apiCalls.find(item => item.id === callId)
    if (!call) return ''
    if (call.status === 'running') call.lastExecutionActivityAt = Date.now()
    call.toolCalls = call.toolCalls || []
    if (input.toolCallId) {
      const duplicate = call.toolCalls.find(item => item.toolCallId === input.toolCallId)
      if (duplicate) {
        duplicate.result = input.result
        duplicate.status = input.status || (input.error ? 'failed' : 'success')
        duplicate.durationMs = input.durationMs ?? duplicate.durationMs
        duplicate.error = input.error
        const resultCode = input.result && typeof input.result === 'object'
          && 'error' in input.result
          && input.result.error
          && typeof input.result.error === 'object'
          && 'code' in input.result.error
          && typeof (input.result.error as { code?: unknown }).code === 'string'
          ? (input.result.error as { code?: string }).code
          : undefined
        duplicate.errorCode = input.errorCode ?? resultCode ?? duplicate.errorCode
        duplicate.protocolVersion = input.protocolVersion ?? duplicate.protocolVersion
        duplicate.protocolVersionDefaulted = input.protocolVersionDefaulted ?? duplicate.protocolVersionDefaulted
        duplicate.toolCapability = input.toolCapability ?? duplicate.toolCapability
        duplicate.rejectionCategory = input.rejectionCategory ?? duplicate.rejectionCategory
        duplicate.defaultToolPolicy = input.defaultToolPolicy ?? duplicate.defaultToolPolicy
        duplicate.riskLevel = input.riskLevel ?? duplicate.riskLevel
        duplicate.argumentsRaw = input.argumentsRaw ?? duplicate.argumentsRaw
        duplicate.endedAt = Date.now()
        return duplicate.id
      }
    }
    const toolCall: RunTraceToolCall = {
      id: nextId('tool'),
      toolCallId: input.toolCallId,
      name: input.name,
      input: input.input,
      argumentsRaw: input.argumentsRaw,
      result: input.result,
      protocolVersion: input.protocolVersion,
      protocolVersionDefaulted: input.protocolVersionDefaulted,
      status: input.status || (input.error ? 'failed' : 'success'),
      startedAt: input.startedAt || Date.now(),
      endedAt: input.endedAt,
      durationMs: input.durationMs,
      error: input.error,
      errorCode: input.errorCode ?? (
        input.result && typeof input.result === 'object'
          && 'error' in input.result
          && input.result.error
          && typeof input.result.error === 'object'
          && 'code' in input.result.error
          && typeof (input.result.error as { code?: unknown }).code === 'string'
          ? (input.result.error as { code?: string }).code
          : undefined
      ),
      toolCapability: input.toolCapability,
      rejectionCategory: input.rejectionCategory,
      defaultToolPolicy: input.defaultToolPolicy,
      riskLevel: input.riskLevel,
    }
    call.toolCalls.push(toolCall)
    reportRunActivity(runId, 'tool_call', `${toolCall.name}/${toolCall.status}`, { persist: toolCall.status === 'failed' })
    if (call.turnId) {
      const turn = getRun(runId)?.turns?.find(item => item.id === call.turnId)
      if (turn?.status === 'running') {
        turn.toolCalls = [...(turn.toolCalls || []), toolCall]
        turn.toolCallCount = turn.toolCalls.length
        turn.apiCallIds = turn.apiCallIds?.includes(call.id)
          ? turn.apiCallIds
          : [...(turn.apiCallIds || []), call.id]
      }
    }
    addEvent(runId, {
      type: 'tool-call',
      level: toolCall.status === 'success' ? 'info' : 'error',
      label: toolCall.status === 'success' ? `工具调用完成：${toolCall.name}` : `工具调用失败：${toolCall.name}`,
      detail: toolCall.error || buildToolCallDetail(toolCall)
    })
    return toolCall.id
  }

  function buildToolCallDetail(toolCall: RunTraceToolCall): string | undefined {
    if (toolCall.name !== 'editor.write' || !toolCall.result || typeof toolCall.result !== 'object') return undefined
    const data = (toolCall.result as { data?: { structureIdentity?: EditorStructureIdentityReceipt } }).data
    const identity = data?.structureIdentity
    if (!identity) return undefined
    const parts = [
      `stable:${identity.stableIds.length}`,
      `migrated:${identity.migratedIds.length}`,
      `added:${identity.addedIds.length}`,
      `removed:${identity.removedIds.length}`,
    ]
    if (identity.migratedIds.length) {
      parts.push(`migrations:${identity.migratedIds.map(item => `${item.from}->${item.to}`).join(',')}`)
    }
    return `结构身份回执 ${parts.join(' / ')}`
  }

  function attachPromptSnapshot(runId: string, input: PromptSnapshotInput): string {
    const run = getRun(runId)
    if (!run) return ''
    run.promptSnapshots = run.promptSnapshots || []
    const finalMessages = input.finalMessages.map(m => ({ role: m.role, content: m.content }))
    let finalMessagesChars = finalMessages.reduce((total, message) => total + message.content.length, 0)
    let finalMessagesTruncated = false
    let finalMessagesTruncatedChars = 0
    while (finalMessagesChars > runTracePromptMessageMemoryChars && finalMessages.length) {
      const removed = finalMessages.shift()!
      finalMessagesTruncated = true
      finalMessagesTruncatedChars += removed.content.length
      finalMessagesChars -= removed.content.length
    }
    const snapshot: RunTracePromptSnapshot = {
      id: nextId('prompt'),
      apiCallId: input.apiCallId,
      turnId: input.turnId || run.currentTurnId,
      skillId: input.skillId,
      skillName: input.skillName,
      skillVersion: input.skillVersion,
      mode: input.mode,
      builtAt: Date.now(),
      promptName: input.promptName,
      variables: input.variables,
      contextBlocks: input.contextBlocks,
      folderFingerprint: input.folderFingerprint,
      systemPrompt: input.systemPrompt,
      userPrompt: input.userPrompt,
      finalMessages,
      ...(finalMessagesTruncated ? {
        finalMessagesTruncated,
        finalMessagesTruncatedChars,
      } : {}),
    }
    run.promptSnapshots.push(snapshot)
    if (input.apiCallId) {
      const call = run.apiCalls.find(item => item.id === input.apiCallId)
      if (call) {
        call.promptSnapshotIds = [...(call.promptSnapshotIds || []), snapshot.id]
      }
    }
    addEvent(runId, {
      type: 'prompt-built',
      level: 'info',
      label: '提示词快照已创建',
      detail: [input.skillName, input.skillId, input.mode].filter(Boolean).join(' / ')
    })
    return snapshot.id
  }

  function attachProcessingReport(runId: string, input: ProcessingReportInput): string {
    const run = getRun(runId)
    if (!run) return ''
    run.processingReports = run.processingReports || []
    const report: RunTraceProcessingReport = {
      id: nextId('processing'),
      apiCallId: input.apiCallId,
      turnId: input.turnId || run.currentTurnId,
      stage: input.stage,
      processor: input.processor,
      status: input.status,
      inputPreview: input.inputPreview,
      outputPreview: input.outputPreview,
      output: input.output,
      ruleHits: input.ruleHits,
      warnings: input.warnings,
      issues: input.issues,
      integrity: input.integrity,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      durationMs: input.durationMs
    }
    run.processingReports.push(report)
    if (input.apiCallId) {
      const call = run.apiCalls.find(item => item.id === input.apiCallId)
      if (call) {
        call.processingReportIds = [...(call.processingReportIds || []), report.id]
      }
    }
    addEvent(runId, {
      type: 'processing-report',
      level: input.status === 'failed' ? 'error' : input.status === 'warning' ? 'warn' : 'info',
      label: `本地处理完成：${input.processor}`,
      detail: [
        input.stage,
        input.issues?.filter(issue => issue.level === 'error').map(issue => issue.code).join(', ')
      ].filter(Boolean).join(' / ')
    })
    return report.id
  }

  function registerPayload(runId: string, ref: Omit<RunTracePayloadRef, 'id' | 'createdAt'>): string {
    const run = getRun(runId)
    if (!run) return ''
    run.payloads = run.payloads || []
    const payload: RunTracePayloadRef = {
      id: nextId('payload'),
      createdAt: Date.now(),
      kind: ref.kind,
      file: ref.file,
      bytes: ref.bytes,
      chars: ref.chars,
      sha256: ref.sha256
    }
    run.payloads.push(payload)
    return payload.id
  }

  function attachSemantic(runId: string, callId: string, input: AttachSemanticInput) {
    const call = getRun(runId)?.apiCalls.find(item => item.id === callId)
    if (!call) return
    call.semantic = {
      ...call.semantic,
      conversationId: input.conversationId || call.semantic?.conversationId || runId,
      turnId: input.turnId || call.semantic?.turnId || call.turnId,
      prompt: input.prompt || call.semantic?.prompt,
      usage: input.usage || call.semantic?.usage,
      timeToFirstChunkMs: input.timeToFirstChunkMs ?? call.semantic?.timeToFirstChunkMs,
      conversationCompacted: input.conversationCompacted ?? call.semantic?.conversationCompacted,
    }
  }

  function markContextCompacted(runId: string, detail?: string) {
    const run = getRun(runId)
    if (!run) return
    addEvent(runId, {
      type: 'context-compacted',
      level: 'info',
      label: '上下文已压缩或清空',
      detail
    })
    const currentCallId = currentApiCallIdBySource.value[run.source]
    if (currentCallId) {
      const call = run.apiCalls.find(item => item.id === currentCallId)
      if (call) {
        call.semantic = {
          ...call.semantic,
          conversationId: call.semantic?.conversationId || run.id,
          turnId: call.semantic?.turnId || call.turnId,
          conversationCompacted: true
        }
      }
    }
  }

  function backfillRunMetadata(runId: string, input: RunMetadataInput) {
    const run = getRun(runId)
    if (!run) return
    if (input.providerId && !run.providerId) run.providerId = input.providerId
    if (input.providerName && !run.providerName) run.providerName = input.providerName
    if (input.providerSource && !run.providerSource) run.providerSource = input.providerSource
    if (input.model && !run.model) run.model = input.model
  }

  function appendStream(runId: string, callId: string, text: string) {
    const call = getRun(runId)?.apiCalls.find(item => item.id === callId)
    if (!call) return
    if (typeof text !== 'string') {
      addEvent(runId, {
        type: 'stream-serialization-guard',
        level: 'error',
        label: '流式 delta 类型异常',
        detail: `expected string, received ${Object.prototype.toString.call(text)}`,
      })
      return
    }
    const terminalAppendWindowMs = 2000
    const terminalAppendAllowed = call.status === 'running'
      || (call.endedAt !== undefined && Date.now() - call.endedAt <= terminalAppendWindowMs)
    if (!terminalAppendAllowed || !text) return
    if (text) {
      const now = Date.now()
      const lastEventAt = lastStreamActivityEventAtByCallId.get(callId) ?? 0
      const activityThrottleMs = safeModeActive.value ? 5000 : 1000
      if (now - lastEventAt >= activityThrottleMs) {
        lastStreamActivityEventAtByCallId.set(callId, now)
        reportRunActivity(runId, 'stream_delta', `apiCall=${call.seq}`)
      }
    }
    const previousStreamText = call.streamText
    call.streamText += text
    const streamTotalChars = (call.streamTotalChars ?? previousStreamText.length) + text.length
    call.streamTotalChars = streamTotalChars
    if (call.streamText.length > runTraceStreamMemoryChars) {
      call.streamText = call.streamText.slice(call.streamText.length - runTraceStreamMemoryChars)
      call.streamTruncated = true
      call.streamTruncatedChars = streamTotalChars - call.streamText.length
      const run = getRun(runId)
      if (run && !streamCompactionEventReportedByRunId.has(runId)) {
        streamCompactionEventReportedByRunId.add(runId)
        addEvent(runId, {
          type: 'trace-stream-compacted',
          level: 'warn',
          label: '运行记录流式内容已压缩',
          detail: `chars=${streamTotalChars} kept=${call.streamText.length}`,
          payload: { chars: streamTotalChars, keptChars: call.streamText.length }
        })
      }
    } else {
      call.streamTruncated = undefined
      call.streamTruncatedChars = undefined
    }
    const responseWasStreamFallback = !String(call.responseText || '').trim()
      || (call.responseText === previousStreamText && call.streamText.startsWith(call.responseText))
      || (call.streamTruncated === true && call.responseText === previousStreamText)
    if (responseWasStreamFallback) call.responseText = call.streamText
    call.lastStreamActivityAt = Date.now()
    call.lastExecutionActivityAt = call.lastStreamActivityAt
    const run = getRun(runId)
    if (run) currentApiCallIdBySource.value[run.source] = call.id
    scheduleStreamSave(runId)
    // Tool-loop runtimes can deliver the final stream delta just after
    // finishApiCall. Persist that suffix too, or the on-disk trace keeps the
    // pre-delta response while the in-memory export already has the reply.
    if (call.status !== 'running' && run) void saveRunToDisk(run)
  }
  /** Reasoning callbacks are delta-only; the store accumulates the final text. */
  function appendReasoning(runId: string, callId: string, deltaText: string) {
    const call = getRun(runId)?.apiCalls.find(item => item.id === callId)
    if (!call) return
    if (call.status !== 'running') return
    const delta = deltaText || ''
    if (!delta) return
    call.reasoningText += delta
    const run = getRun(runId)
    if (run) currentApiCallIdBySource.value[run.source] = call.id
  }

  /**
   * aiService.onChunk reports the cumulative response, not the delta.
   * Persist only the newly appended suffix so long streams stay O(n).
   */
  function appendCumulativeStream(runId: string, callId: string, cumulativeText: string) {
    const call = getRun(runId)?.apiCalls.find(item => item.id === callId)
    if (!call) return
    const text = cumulativeText || ''
    // A retry can resend a shorter/equal prefix; only append a genuinely new
    // suffix, and ignore stale callbacks after the call was finished.
    if (call.status !== 'running') return
    const previous = call.streamText
    const delta = text.startsWith(previous) ? text.slice(previous.length) : ''
    if (!delta) return
    appendStream(runId, callId, delta)
  }

  function setApiCallRequest(runId: string, callId: string, messages: RunTraceMessage[]) {
    const call = getRun(runId)?.apiCalls.find(item => item.id === callId)
    if (!call) return
    call.requestMessages = messages.map(m => ({ role: m.role, content: m.content }))
  }

  function setApiCallToolRequestDeltas(runId: string, callId: string, messages: RunTraceMessage[]) {
    const call = getRun(runId)?.apiCalls.find(item => item.id === callId)
    if (!call) return
    call.toolRequestDeltas = messages.map(m => ({ role: m.role, content: m.content }))
  }

  function setApiCallToolAudit(runId: string, callId: string, toolAudit: unknown) {
    const call = getRun(runId)?.apiCalls.find(item => item.id === callId)
    if (!call) return
    call.toolAudit = toolAudit
  }

  function backfillApiResponseFromPhysicalCalls(call: RunTraceApiCall): void {
    const physicals = [...(call.physicalCalls || [])].reverse()
    const response = physicals.find(item => (
      (typeof item.responseText === 'string' && item.responseText.trim())
      || (typeof item.streamText === 'string' && item.streamText.trim())
    ))
    const reasoning = physicals.find(item => (
      typeof item.reasoningText === 'string' && item.reasoningText.trim()
    ))
    if (!String(call.responseText || '').trim() && response) {
      call.responseText = response.responseText || response.streamText || ''
    }
    if (!String(call.reasoningText || '').trim() && reasoning?.reasoningText) {
      call.reasoningText = reasoning.reasoningText
    }
  }

  function computeApiCallTimingLedger(call: RunTraceApiCall): RunTraceTimingLedger {
    const physicalCalls = call.physicalCalls || []
    const firstTokens = physicalCalls
      .map(item => item.firstTokenMs)
      .filter((value): value is number => typeof value === 'number')
    const outputDurations = physicalCalls
      .map(item => typeof item.firstTokenMs === 'number' ? item.outputMs : undefined)
      .filter((value): value is number => typeof value === 'number')
    const physicalDurationSumMs = physicalCalls.reduce((sum, item) => sum + (item.durationMs || 0), 0)
    const callDurationMs = call.durationMs || 0
    return {
      physicalCallCount: physicalCalls.length,
      retryPhysicalCallCount: physicalCalls.filter(item =>
        item.phase === 'retry' || item.phase === 'schema_retry' || item.phase === 'direct_retry'
      ).length,
      physicalDurationSumMs,
      firstTokenSumMs: sumNumber(firstTokens),
      outputSumMs: sumNumber(outputDurations),
      minFirstTokenMs: firstTokens.length ? Math.min(...firstTokens) : undefined,
      maxFirstTokenMs: firstTokens.length ? Math.max(...firstTokens) : undefined,
      localOverheadMs: callDurationMs - physicalDurationSumMs
    }
  }

  function computeRunTimingLedger(run: RunTrace): RunTraceTimingLedger {
    const ledgers = run.apiCalls.map(call => call.timingLedger).filter(Boolean) as RunTraceTimingLedger[]
    const sum = (pick: (ledger: RunTraceTimingLedger) => number | undefined) =>
      ledgers.reduce((total, ledger) => total + (pick(ledger) || 0), 0)
    const repeatedPromptBlocks: Record<string, number> = {}
    for (const ledger of ledgers) {
      for (const [marker, count] of Object.entries(ledger.repeatedPromptBlocks || {})) {
        repeatedPromptBlocks[marker] = Math.max(repeatedPromptBlocks[marker] || 0, count)
      }
    }
    return {
      apiCallCount: run.apiCalls.length,
      physicalCallCount: sum(ledger => ledger.physicalCallCount),
      retryPhysicalCallCount: sum(ledger => ledger.retryPhysicalCallCount),
      physicalDurationSumMs: sum(ledger => ledger.physicalDurationSumMs),
      firstTokenSumMs: sum(ledger => ledger.firstTokenSumMs),
      outputSumMs: sum(ledger => ledger.outputSumMs),
      localOverheadSumMs: sum(ledger => ledger.localOverheadMs),
      requestBuildSumMs: sum(ledger => ledger.requestBuildMs),
      schemaValidateSumMs: sum(ledger => ledger.schemaValidateMs),
      retrySumMs: sum(ledger => ledger.retryMs),
      postProcessSumMs: sum(ledger => ledger.postProcessMs),
      repeatedPromptBlocks
    }
  }

  function computeRunStepTimingLedger(run: RunTrace): RunTraceStepTimingLedger {
    const physicalCalls = run.apiCalls.flatMap(call => call.physicalCalls || [])
    const localPhases = run.stepPhaseTiming || {}
    const schemaRetries = run.apiCalls.reduce((total, call) => {
      const schemaRetryCount = (call.timingLedger as { schemaRetryCount?: number } | undefined)?.schemaRetryCount
      return total + (typeof schemaRetryCount === 'number' && schemaRetryCount > 0 ? schemaRetryCount : 0)
    }, 0)
    const repeatedPromptBlocks: Record<string, number> = {}
    for (const call of run.apiCalls) {
      for (const [marker, count] of Object.entries(call.timingLedger?.repeatedPromptBlocks || {})) {
        repeatedPromptBlocks[marker] = Math.max(repeatedPromptBlocks[marker] || 0, count)
      }
    }
    return {
      promptBuildMs: sumNumber([localPhases.promptBuild]) || run.apiCalls.reduce((total, call) => total + (call.timingLedger?.requestBuildMs || 0), 0),
      contextLoadMs: sumNumber([localPhases.contextLoad]),
      apiCallCount: run.apiCalls.length,
      physicalCallCount: physicalCalls.length,
      retryCallCount: physicalCalls.filter(call =>
        call.phase === 'retry' ||
        call.phase === 'schema_retry' ||
        call.phase === 'direct_retry' ||
        call.phase === 'heartbeat_retry'
      ).length,
      schemaRetryCallCount: schemaRetries || undefined,
      continuationCallCount: physicalCalls.filter(call => call.phase === 'continuation').length,
      firstTokenSumMs: sumNumber(physicalCalls.map(call => call.firstTokenMs)),
      outputSumMs: sumNumber(physicalCalls.map(call => call.outputMs)),
      postProcessSumMs: sumNumber([
        localPhases.postProcess,
        ...(run.processingReports || []).map(report => report.durationMs)
      ]),
      validationSumMs: sumNumber([localPhases.validation]),
      persistenceSumMs: sumNumber([localPhases.persistence]),
      stepBoundaryGapMs: run.stepBoundaryGapMs,
      repeatedPromptBlocks,
      contextChars: run.apiCalls.reduce((total, call) => (
        total + call.requestMessages.reduce((chars, message) => chars + responseCharacterCount(message.content), 0)
      ), 0) || undefined,
      outputChars: run.apiCalls.reduce((total, call) => total + responseCharacterCount(call.responseText || call.streamText), 0) || undefined,
      physicalDurationSumMs: sumNumber(physicalCalls.map(call => call.durationMs))
    }
  }

  function finishApiCall(runId: string, callId: string, patch: FinishApiCallInput) {
    const run = getRun(runId)
    const call = run?.apiCalls.find(item => item.id === callId)
    if (!run || !call) return
    if (call.streamText) {
      reportRunActivity(runId, 'stream_delta', `apiCall=${call.seq}/terminal`)
    }
    lastStreamActivityEventAtByCallId.delete(callId)
    lastToolArgumentActivityEventAtByCallId.delete(callId)
    // Cancellation can sweep a call before a late callback lands. Keep the
    // terminal status instead of letting success overwrite canceled/failed.
    if (call.status !== 'running') return
    if (patch.status === 'failed' && !call.physicalCalls?.length) {
      call.integrity = {
        ...call.integrity,
        physicalMissing: true,
        physicalMissingReason: 'failure-before-physical-request'
      }
    }
    call.status = patch.status
    call.providerContextWindowTokens = patch.providerContextWindowTokens ?? call.providerContextWindowTokens
    call.estimatedInputTokens = patch.estimatedInputTokens ?? call.estimatedInputTokens
    call.contextBudgetDecision = patch.contextBudgetDecision ?? call.contextBudgetDecision
    call.contextBudgetReason = patch.contextBudgetReason ?? call.contextBudgetReason
    call.usageReconciliation = patch.usageReconciliation ?? call.usageReconciliation
    if (patch.textOrigin) call.textOrigin = patch.textOrigin
    // Tool-loop wrappers can finish with an empty aggregate while stream
    // callbacks already produced the complete user-visible reply.
    if (patch.responseText) call.responseText = patch.responseText
    const patchReasoning = patch.reasoningText || ''
    if (patchReasoning && patchReasoning.length >= call.reasoningText.length) {
      call.reasoningText = patchReasoning
    }
    call.finishReason = patch.finishReason ?? call.finishReason
    call.convergenceReason = patch.convergenceReason ?? call.convergenceReason
    if (patch.executionSettlement) call.executionSettlement = patch.executionSettlement
    if (patch.readLedger) call.readLedger = patch.readLedger
    if (patch.deaiPromptVariant) call.deaiPromptVariant = patch.deaiPromptVariant
    call.durationMs = patch.durationMs ?? (Date.now() - call.startedAt)
    call.timingLedger = {
      ...computeApiCallTimingLedger(call),
      ...patch.timingLedger
    }
    if (patch.candidateLedger) call.candidateLedger = patch.candidateLedger
    if (patch.bodyCandidateLedger) call.bodyCandidateLedger = patch.bodyCandidateLedger
    if (patch.bodyCandidateRetention) call.bodyCandidateRetention = patch.bodyCandidateRetention
    if (patch.retainedCandidateIndex !== undefined) {
      call.retainedCandidateIndex = patch.retainedCandidateIndex
    }
    call.usage = patch.usage ?? call.usage
    call.usageUnavailable = patch.usageUnavailable ?? (patch.usage ? false : call.usageUnavailable)
    call.error = patch.error
    call.compatibilityMode = patch.compatibilityMode ?? call.compatibilityMode
    call.compatibilityWrite = patch.compatibilityWrite ?? call.compatibilityWrite
    call.toolsDowngraded = patch.toolsDowngraded ?? call.toolsDowngraded
    call.downgradeReason = patch.downgradeReason ?? call.downgradeReason
    call.retryStrategy = patch.retryStrategy ?? call.retryStrategy
    call.maxTokens = patch.maxTokens ?? call.maxTokens
    if (patch.toolAudit !== undefined) call.toolAudit = patch.toolAudit
    call.endedAt = Date.now()
    if (!String(call.responseText || '').trim() || !String(call.reasoningText || '').trim()) {
      backfillApiResponseFromPhysicalCalls(call)
    }
    if (!String(call.responseText || '').trim() && String(call.streamText || '').trim()) {
      call.responseText = call.streamText
    }
    if (patch.usage) {
      call.semantic = {
        ...call.semantic,
        conversationId: call.semantic?.conversationId || run?.id || callId,
        turnId: call.semantic?.turnId || call.turnId,
        usage: normalizeTraceUsage(undefined, patch.usage)
      }
    }
    if (run && currentApiCallIdBySource.value[run.source] === call.id) {
      currentApiCallIdBySource.value[run.source] = null
    }
    addEvent(runId, createLifecycleTransitionEvent(
      'ApiCallStatus',
      'running',
      patch.status,
      [patch.reason, `apiCall=${call.id} seq=${call.seq}`].filter(Boolean).join(' / '),
    ))
    if (run.status === 'running') startStateWatchdogForRun(runId, 'active')
    addEvent(runId, {
      type: `api-${patch.status}`,
      level: patch.status === 'success' ? 'info' : patch.status === 'degraded' || patch.status === 'blocked' ? 'warn' : 'error',
      label: `第 ${call.seq} 次 API 调用${patch.status === 'success' ? '完成' : patch.status === 'degraded' ? '完成（降级）' : patch.status === 'blocked' ? '已阻断，等待恢复' : patch.status === 'canceled' ? '取消' : '失败'}`,
      detail: [call.skillName, call.model, patch.error].filter(Boolean).join(' / ')
    })
    flushStreamSave(runId)
    void saveRunToDisk(run)
  }

  function finishRun(runId: string, status: RunTraceStatus, error?: string, reason?: string) {
    const run = getRun(runId)
    if (!run) return
    if (run.status !== 'running') {
      // A late wrapper callback must not change the terminal state, but the
      // ignored attempt is itself diagnostic evidence for skill debugging.
      addEvent(runId, {
        type: 'status-conflict-ignored',
        level: 'warn',
        label: `运行终态保持为 ${run.status}，忽略后到的 ${status}`,
        detail: [error, `attemptStatus=${status}`, `terminalStatus=${run.status}`].filter(Boolean).join(' / ')
      })
      return
    }
    clearStateWatchdogForRun(runId)
    awaitingUserRunIds.delete(runId)
    // A run must never finish while one of its API calls is still marked
    // running. This closes the "S2 stays running forever" gap when the
    // exception path skips the folder-executor's finish callback.
    for (const call of run.apiCalls) {
      if (call.status !== 'running') continue
      call.status = status
      call.endedAt = Date.now()
      call.durationMs = call.endedAt - call.startedAt
      call.error = call.error || error || `API 调用随运行${status === 'success' ? '完成' : status === 'blocked' ? '阻断' : '结束'}而关闭`
      addEvent(runId, {
        type: `api-${status}`,
        level: traceStatusLevel(status),
        label: `第 ${call.seq} 次 API 调用随运行闭合`,
      detail: [call.skillName, call.model, call.error].filter(Boolean).join(' / ')
      })
    }
    if (run.sessionKind === 'chat' && run.currentTurnId) {
      finishTurn(runId, run.currentTurnId, status, error)
    }
    const fromStatus = 'running'
    run.status = status
    run.timingLedger = computeRunTimingLedger(run)
    run.stepTimingLedger = computeRunStepTimingLedger(run)
    run.endedAt = Date.now()
    run.durationMs = run.endedAt - run.startedAt
    run.error = error
    addEvent(runId, {
      type: status === 'canceled' ? 'canceled' : 'finished',
      level: traceStatusLevel(status),
      label: status === 'running' ? '运行进行中' : `运行${traceStatusLabel(status)}`,
      detail: [error, reason].filter(Boolean).join(' / ')
    })
    addEvent(runId, createLifecycleTransitionEvent(
      'RunTraceStatus',
      fromStatus,
      status,
      [reason, `run=${run.id}`].filter(Boolean).join(' / '),
    ))
    run.stateHistory = [...(run.stateHistory || []), {
      fromStatus,
      toStatus: status,
      reason: [reason, error].filter(Boolean).join(' / ') || undefined,
      recordedAt: Date.now()
    }]
    if (currentRunIdBySource.value[run.source] === runId) {
      currentRunIdBySource.value[run.source] = null
      currentApiCallIdBySource.value[run.source] = null
    }
    lastFinishedRunEndedAtByStep.set(stepTimingKey(run), run.endedAt)
    if (run.sessionKind === 'chat') {
      addEvent(runId, {
        type: 'session-closed',
        level: 'info',
        label: '会话记录已封存'
      })
    }
    void saveRunToDisk(run)
  }


  function setFolderDiagnostics(runId: string, diagnostics: unknown) {
    const run = getRun(runId)
    if (!run) return
    run.folderDiagnostics = Array.isArray(diagnostics) ? diagnostics : [diagnostics]
    addEvent(runId, {
      type: 'folder-diagnostics',
      level: 'info',
      label: '记录 folder SKILL 诊断'
    })
    emitSkillAgentIgnoredEvents(runId, run.folderDiagnostics)
    emitDeaiQualityGateDegradedEvents(runId, run.folderDiagnostics)
  }

  function setEvalReport(runId: string, report: unknown) {
    const run = getRun(runId)
    if (!run) return
    run.evalReport = report
    addEvent(runId, {
      type: 'eval-report',
      level: 'info',
      label: '记录技能评测结果'
    })
  }

  function appendFolderDiagnostics(runId: string, diagnostics: unknown) {
    const run = getRun(runId)
    if (!run) return
    const incoming = Array.isArray(diagnostics) ? diagnostics : [diagnostics]
    run.folderDiagnostics = [
      ...(run.folderDiagnostics || []),
      ...incoming
    ]
    addEvent(runId, {
      type: 'folder-diagnostics',
      level: 'info',
      label: '记录 folder SKILL 诊断'
    })
    emitSkillAgentIgnoredEvents(runId, incoming)
    emitDeaiQualityGateDegradedEvents(runId, incoming)
  }

  function emitSkillAgentIgnoredEvents(runId: string, diagnostics: unknown) {
    if (!Array.isArray(diagnostics)) return
    for (const diagnostic of diagnostics) {
      const source = diagnostic as { code?: unknown; diagnostics?: unknown; message?: unknown }
      const code = source.code
      const nested = source.diagnostics
      if (Array.isArray(nested)) emitSkillAgentIgnoredEvents(runId, nested)
      if (code !== 'skill-agent-ignored') continue
      addEvent(runId, {
        type: 'skill-agent-ignored',
        level: 'warn',
        label: 'SKILL agent 执行参数已忽略',
        detail: typeof source.message === 'string' ? source.message : undefined,
        payload: diagnostic
      })
    }
  }

  function emitDeaiQualityGateDegradedEvents(runId: string, diagnostics: unknown) {
    if (!Array.isArray(diagnostics)) return
    for (const diagnostic of diagnostics) {
      const source = diagnostic as { code?: unknown; diagnostics?: unknown; message?: unknown }
      const nested = source.diagnostics
      if (Array.isArray(nested)) emitDeaiQualityGateDegradedEvents(runId, nested)
      if (source.code !== 'quality_gate_degraded') continue
      addEvent(runId, {
        type: 'deai-quality-gate-degraded',
        level: 'warn',
        label: '降AI门禁降级',
        detail: typeof source.message === 'string' ? source.message : undefined,
        payload: diagnostic
      })
    }
  }

  function removeRun(id: string) {
    const index = runs.value.findIndex(run => run.id === id)
    if (index >= 0) {
      clearStateWatchdogForRun(id)
      flushStreamSave(id)
      lastMaxEventSeqByRunId.delete(id)
      streamCompactionEventReportedByRunId.delete(id)
      const [removed] = runs.value.splice(index, 1)
      removeRunDirectory(removed)
    }
    const runSource = (['pipeline', 'outline', 'home', 'eval', 'infra'] as RunTraceSource[]).find(source => currentRunIdBySource.value[source] === id)
    if (runSource) {
      currentRunIdBySource.value[runSource] = null
      currentApiCallIdBySource.value[runSource] = null
    }
  }

  function clearRuns() {
    const removed = [...runs.value]
    for (const runId of [...stateWatchdogByRunId.keys()]) clearStateWatchdogForRun(runId)
    for (const runId of [...pendingStreamSaveTimersByRunId.keys()]) flushStreamSave(runId)
    runs.value = []
    lastMaxEventSeqByRunId.clear()
    streamCompactionEventReportedByRunId.clear()
    removed.forEach(item => {
      lastMaxEventSeqByRunId.delete(item.id)
      streamCompactionEventReportedByRunId.delete(item.id)
    })
    removed.forEach(removeRunDirectory)
    currentRunIdBySource.value = { pipeline: null, outline: null, home: null, eval: null, infra: null }
    currentApiCallIdBySource.value = { pipeline: null, outline: null, home: null, eval: null, infra: null }
    lastRunIdBySource.value = { pipeline: null, outline: null, home: null, eval: null, infra: null }
    lastFinishedRunEndedAtByStep.clear()
  }

  function addSourceEvent(source: RunTraceSource, event: Omit<RunTraceEvent, 'id' | 'ts'>) {
    const runId = currentRunIdBySource.value[source]
    if (!runId) {
      console.warn('[runTrace] dropped source event without an active run', { source, type: event.type })
      return
    }
    const run = runId ? getRun(runId) : null
    if (run?.status !== 'running') {
      console.warn('[runTrace] dropped source event without an active run', { source, type: event.type })
      return
    }
    addEvent(runId, event)
  }

  function addBatchEvent(source: RunTraceSource, batchEvent: DialogueBatchEvent) {
    const normalizedSource = normalizeSource(source)
    const activeRunId = currentRunIdBySource.value[normalizedSource]
    const runId = activeRunId || lastRunIdBySource.value[normalizedSource]
    if (!runId) {
      console.warn('[runTrace] dropped batch event without a recorded run', { source, batchId: batchEvent.batchId })
      return
    }
    const run = getRun(runId)
    if (!run) {
      console.warn('[runTrace] dropped batch event because the recorded run is unavailable', { source, batchId: batchEvent.batchId })
      return
    }
    // Batch rollback/replay is a user action that may happen after a chat run
    // has reached its terminal state. Keep those audit events attached to the
    // most recent run of the same source instead of silently dropping them.
    const offline = run.status !== 'running'
    addEvent(runId, {
      type: 'batch_event',
      level: batchEvent.status === 'pending' || batchEvent.status === 'applied' ? 'info' : 'warn',
      label: `AI 批次${batchEvent.status}`,
      detail: [
        `batchId=${batchEvent.batchId}`,
        `workspace=${batchEvent.workspace}`,
        `targetId=${batchEvent.targetId}`,
        `commands=${batchEvent.commandCount}`,
        offline ? 'offline=true' : '',
        batchEvent.reason,
      ].filter(Boolean).join(' / '),
      batchEvent,
    })
  }

  function reportEditTaskActivity(
    runId: string,
    payload: RunTraceEditTaskPayload,
    options?: { persist?: boolean; turnId?: string | null },
  ) {
    const turnId = options?.turnId || undefined
    const activeBatchId = payload.activeBatchId || payload.batchId
    const batchDetail = activeBatchId ? payload.executionPlan.batchDetails?.[activeBatchId] : undefined
    reportRunActivity(runId, 'edit_task', [payload.taskId, activeBatchId, payload.status].filter(Boolean).join('/'), options)
    const terminalMergeReady = payload.status === 'awaiting_batch'
      && payload.executionPlan.batches.length > 0
      && payload.executedBatches.length > 0
      && payload.pendingBatches.length === 0
      && payload.failedBatches.length === 0
      && !activeBatchId
    if (terminalMergeReady && !reportedTerminalMergeTaskIds.has(payload.taskId)) {
      reportedTerminalMergeTaskIds.add(payload.taskId)
      addEvent(runId, {
        type: 'awaiting-terminal-merge',
        level: 'info',
        label: '编辑任务等待终态归并',
        detail: [
          `taskId=${payload.taskId}`,
          `batches=${payload.executedBatches.length}/${payload.executionPlan.batches.length}`,
          payload.goal,
        ].filter(Boolean).join(' / '),
        turnId,
        payload: {
          taskId: payload.taskId,
          executedBatches: payload.executedBatches.length,
          totalBatches: payload.executionPlan.batches.length
        }
      })
    }
    if (batchDetail) {
      addEvent(runId, {
        type: 'edit-task-plan-detail',
        level: 'info',
        label: '编辑任务批次计划',
        detail: [
          `taskId=${payload.taskId}`,
          `batchId=${activeBatchId}`,
          `segmentId=${batchDetail.segmentId}`,
          `expectedChange=${batchDetail.expectedChange}`,
          batchDetail.invariantResult ? `invariantResult=${batchDetail.invariantResult}` : '',
        ].filter(Boolean).join(' / '),
        turnId,
      })
    }
    for (const batchId of payload.executionPlan.batches) {
      const dedupeKey = `${runId}:${payload.taskId}:${turnId || 'run'}:${batchId}`
      if (editTaskPlannedBatchIds.has(dedupeKey)) continue
      editTaskPlannedBatchIds.add(dedupeKey)
      const detail = payload.executionPlan.batchDetails?.[batchId]
      addEvent(runId, {
        type: 'edit-task-batch-planned',
        level: 'info',
        label: '编辑任务批次前瞻',
        detail: [
          `taskId=${payload.taskId}`,
          `batchId=${batchId}`,
          detail ? `segmentId=${detail.segmentId}` : '',
          detail?.range ? `range=${detail.range.startLine}-${detail.range.endLine}` : '',
          detail?.writeStrategy ? `writeStrategy=${detail.writeStrategy}` : '',
          detail ? `expectedChange=${detail.expectedChange}` : '',
          `estimatedBatches=${payload.executionPlan.batches.length}`,
        ].filter(Boolean).join(' / '),
        turnId,
        payload: {
          taskId: payload.taskId,
          batchId,
          segmentId: detail?.segmentId,
          range: detail?.range,
          writeStrategy: detail?.writeStrategy,
          expectedChange: detail?.expectedChange,
          estimatedBatches: payload.executionPlan.batches.length
        }
      })
    }
  }

  function reportEditTaskCompletion(
    runId: string,
    payload: RunTraceEditTaskCompletionPayload,
    options?: { persist?: boolean; turnId?: string | null },
  ) {
    addEvent(runId, {
      type: payload.verified ? 'edit-task-completion-verified' : 'edit-task-completion-violation',
      level: payload.verified ? 'info' : 'warn',
      label: payload.verified ? '编辑任务完成度校验通过' : '编辑任务完成度校验失败',
      detail: [
        payload.invariant ? `invariant=${payload.invariant}` : '',
        ...payload.violations.map(violation =>
          [
            violation.code,
            violation.batchId ? `batchId=${violation.batchId}` : '',
            violation.target ? `target=${violation.target}` : '',
            violation.beforeCount !== undefined ? `before=${violation.beforeCount}` : '',
            violation.afterCount !== undefined ? `after=${violation.afterCount}` : '',
          ].filter(Boolean).join('/')),
      ].filter(Boolean).join(' | ') || 'no-violation',
      turnId: options?.turnId || undefined,
      payload,
    })
  }

  async function saveRunToDisk(run: RunTrace) {
    if (typeof window === 'undefined' || !window.electronAPI?.runTraceSave) return
    // One in-flight save per run. finishTurn + finishRun can fire in the same
    // tick; serializing here prevents the main process from interleaving the
    // remove/write sequences and corrupting run-trace.json.
    const queuedSave = (saveRunQueuesById.get(run.id) || Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        try {
          const result = await window.electronAPI!.runTraceSave({
            schema: 'shenyi.run-trace',
            version: RUN_TRACE_SCHEMA_VERSION,
            run: exportRunToJson(run)
          })
          if (result?.success && result.dirName) {
            runDirNameById.set(run.id, result.dirName)
            if (!run.dirName) run.dirName = result.dirName
          }
        } catch (error) {
          // Trace persistence is observability only. A full disk, locked
          // directory, or IPC failure must never bubble into generation.
          try {
            addEvent(run.id, {
              type: 'autosave-failed',
              level: 'warn',
              label: '运行记录写入失败',
              detail: error instanceof Error ? error.message : String(error)
            })
          } catch { /* generation must continue even if tracing is broken */ }
        }
      })
    const trackedSave = queuedSave.finally(() => {
      if (saveRunQueuesById.get(run.id) === trackedSave) saveRunQueuesById.delete(run.id)
    })
    saveRunQueuesById.set(run.id, trackedSave)
    return trackedSave
  }

  /**
   * Trace persistence is observability only, but a renderer crash during a
   * long stream otherwise loses every chunk before finishTurn/finishRun.
   * Debounced saves keep the on-disk snapshot fresh without writing on every
   * token; failures remain non-blocking.
   */
  function scheduleStreamSave(runId: string) {
    const run = getRun(runId)
    if (!run || run.status !== 'running') return
    if (pendingStreamSaveTimersByRunId.has(runId)) return
    const timer = setTimeout(() => {
      pendingStreamSaveTimersByRunId.delete(runId)
      const currentRun = getRun(runId)
      if (!currentRun || currentRun.status !== 'running') return
      void saveRunToDisk(currentRun)
    }, STREAM_SAVE_INTERVAL_MS)
    pendingStreamSaveTimersByRunId.set(runId, timer)
  }

  function flushStreamSave(runId: string) {
    const timer = pendingStreamSaveTimersByRunId.get(runId)
    if (!timer) return
    clearTimeout(timer)
    pendingStreamSaveTimersByRunId.delete(runId)
  }

  async function removeRunDirectory(run: RunTrace) {
    const dirName = runDirNameById.get(run.id) || run.dirName
    if (!dirName || typeof window === 'undefined' || !window.electronAPI?.runTraceRemove) return
    // Wait for the latest queued save before removing, otherwise a save can
    // recreate the directory after rolling cleanup has removed it.
    await (saveRunQueuesById.get(run.id) || Promise.resolve()).catch(() => undefined)
    const queuedDirName = runDirNameById.get(run.id)
    if (queuedDirName && queuedDirName !== dirName) return
    try {
      const result = await window.electronAPI!.runTraceRemove({ source: run.source, dirName })
      if (!result?.success) {
        addEvent(run.id, {
          type: 'autosave-failed',
          level: 'warn',
          label: '运行记录目录清理失败',
          detail: result?.reason || '未知错误'
        })
      } else {
        runDirNameById.delete(run.id)
      }
    } catch (error) {
      addEvent(run.id, {
        type: 'autosave-failed',
        level: 'warn',
        label: '运行记录目录清理失败',
        detail: error instanceof Error ? error.message : String(error)
      })
    }
  }

  const RESTORED_RUN_STATUSES: ReadonlySet<RunTraceStatus> = new Set([
    'success',
    'degraded',
    'failed',
    'canceled',
    'interrupted',
    'partially_applied',
    'failed_after_write',
    'success_with_warnings'
  ])

  function isValidRestoredRun(run: unknown): run is RunTrace {
    const candidate = run as Partial<RunTrace> | null
    if (!candidate) return false
    return typeof candidate.id === 'string'
      && candidate.id.length > 0
      && typeof candidate.source === 'string'
      && typeof candidate.startedAt === 'number'
      && Array.isArray(candidate.events)
      && Array.isArray(candidate.apiCalls)
      && RESTORED_RUN_STATUSES.has(candidate.status as RunTraceStatus)
  }

  function insertRestoredRun(run: RunTrace) {
    if (runs.value.some(item => item.id === run.id)) return false
    const restoredRun: RunTrace = {
      ...run,
      currentTurnId: undefined,
      source: normalizeSource(run.source),
      sourceName: RUN_TRACE_SOURCE_NAMES[normalizeSource(run.source)]
    }
    rebuildEventSeqIndex(restoredRun, 'restore')
    runs.value.push(restoredRun)
    return true
  }

  async function restorePersistedRuns(): Promise<{ restored: number; skipped: number }> {
    if (typeof window === 'undefined'
      || typeof window.electronAPI?.runTraceList !== 'function'
      || typeof window.electronAPI?.runTraceRead !== 'function') {
      return { restored: 0, skipped: 0 }
    }
    const restoredBySource: Record<RunTraceSource, number> = {
      pipeline: 0, outline: 0, home: 0, eval: 0, infra: 0
    }
    let skipped = 0
    for (const source of ['pipeline', 'outline', 'home', 'eval', 'infra'] as RunTraceSource[]) {
      try {
        const listed = await window.electronAPI!.runTraceList(source)
        if (!listed?.success || !Array.isArray(listed.runs)) continue
        for (const item of listed.runs) {
          if (restoredBySource[source] >= maxRuns) break
          if (!item?.dirName) {
            skipped += 1
            continue
          }
          const read = await window.electronAPI!.runTraceRead({ source, dirName: item.dirName })
          if (!read?.success) {
            skipped += 1
            continue
          }
          const run = read.run as RunTrace | null
          if (run && (run.status === 'running' || run.status === 'blocked')) {
            // Restarted processes cannot own the persisted run's controllers.
            // Keep its evidence visible and make the non-terminal state explicit.
            run.status = 'interrupted'
            run.endedAt = run.endedAt ?? Date.now()
            run.events = [
              ...(run.events || []),
              {
                id: `${run.id}-startup-interrupted`,
                ts: Date.now(),
                level: 'warn',
                type: 'run-startup-interrupted',
                label: '应用重启，运行已中断',
                detail: '恢复的运行记录处于非终态；已标记为中断，需用户重新发起或选择恢复流程。'
              }
            ]
          }
          if (!isValidRestoredRun(run)) {
            skipped += 1
            continue
          }
          run.dirName = item.dirName
          runDirNameById.set(run.id, item.dirName)
          if (insertRestoredRun(run)) restoredBySource[source] += 1
        }
      } catch {
        // Trace history is observability. Startup must continue if one source is corrupt.
      }
    }
    runs.value.sort((a, b) => b.startedAt - a.startedAt)
    trimRuns()
    return { restored: Object.values(restoredBySource).reduce((total, count) => total + count, 0), skipped }
  }

  function maskSensitive(text: string) {
    return maskRunTraceSensitiveText(text)
  }

  function exportRunToText(run: RunTrace) {
    return exportRunTraceText(run)
  }

  function exportRunToJson(run: RunTrace) {
    return exportRunTraceJson(run)
  }

  function checkStateIntegrityBeforeClose() {
    const report = checkStateIntegrity(runs.value)
    if (!report.healthy) {
      try {
        window.electronAPI?.runTraceReportStateIntegrity?.(report)
      } catch {
        // 上报失败时仍保留 renderer 诊断写入。
      }
      try {
        window.electronAPI?.diagWrite?.([{
          ts: new Date().toISOString(),
          tsMs: Date.now(),
          level: 'warn',
          cat: 'state-integrity',
          msg: '应用关闭前发现状态完整性异常',
          detail: JSON.stringify(report),
          session: Date.now()
        }])
      } catch {
        // 退出完整性检查本身不能阻塞关闭。
      }
    }
    return report
  }

  /**
   * Chat runs are intentionally left open so later turns stay in one trace.
   * Exports must preserve that live-session truth instead of synthesizing a
   * terminal status from the latest completed turn.
   */

  return {
    runs,
    sortedRuns,
    currentRun,
    currentRunIdBySource,
    currentApiCallIdBySource,
    currentRunId,
    currentApiCallId,
    maxRuns,
    setMemoryLimits,
    getRun,
    getLastRunId,
    abandonRunningRun,
    getRunId,
    getApiCallId,
    addSourceEvent,
    addAgentEvent,
    addBatchEvent,
    reportEditTaskActivity,
    reportEditTaskCompletion,
    reportRunActivity,
    reportToolArgumentProgress,
    startRun,
    startTurn,
    finishTurn,
    updateTurnIntent,
    recordStepPhaseTiming,
    recordStepObservation,
    addEvent,
    recordBodyFeedbackAudit,
    resetBodyFeedbackAudits,
    getBodyFeedbackAudits,
    startApiCall,
    appendPhysicalCall,
    appendToolCall,
    setApiCallToolRequestDeltas,
    setApiCallToolAudit,
    attachPromptSnapshot,
    attachProcessingReport,
    registerPayload,
    attachSemantic,
    updateApiCallToolSurface,
    updateApiCallExecutionSettlement,
    markContextCompacted,
    appendStream,
    appendReasoning,
    appendCumulativeStream,
    setApiCallRequest,
    finishApiCall,
    cancelRunningApiCalls,
    failRunningApiCalls,
    shutdownAndFlush,
    finishRun,
    startAwaitingUser,
    isAwaitingUser,
    finishAwaitingUser,
    setFolderDiagnostics,
    appendFolderDiagnostics,
    setEvalReport,
    removeRun,
    clearRuns,
    maskSensitive,
    exportRunToText,
    exportRunToJson,
    restorePersistedRuns,
    checkStateIntegrityBeforeClose,
    checkStateIntegrity
  }
})
import type { EditorStructureIdentityReceipt } from '../services/editorTools'
