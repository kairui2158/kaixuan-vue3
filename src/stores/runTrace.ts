import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { DialogueBatchEvent } from '../services/dialogueFoundation'
import { checkStateIntegrity } from '../services/stateIntegrityCheck'
import { createLifecycleTransitionEvent } from '../services/stateTransitionGuard'
import { getStateTimeout, startStateWatchdog, type StateWatchdog } from '../services/stateWatchdog'
import type { LifecycleStatus } from '../services/stateTransitionGuard'

export type RunTraceStatus = 'running' | 'success' | 'degraded' | 'failed' | 'canceled' | 'blocked'
export type RunTraceEventLevel = 'info' | 'warn' | 'error'
export type RunTraceSource = 'pipeline' | 'outline' | 'home' | 'eval' | 'infra'

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
  detail?: string
  batchEvent?: DialogueBatchEvent
  payloadRefs?: string[]
}

export interface RunTraceMessage {
  role: string
  content: string
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
  model?: string
  temperature?: number
  maxTokens?: number
  intent?: string
  toolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
  actualToolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
  requestMessages: RunTraceMessage[]
  toolRequestDeltas?: RunTraceMessage[]
  responseText: string
  streamText: string
  reasoningText: string
  finishReason?: string
  usage?: unknown
  durationMs?: number
  status: RunTraceStatus
  error?: string
  compatibilityMode?: 'json-protocol'
  compatibilityWrite?: boolean
  toolsDowngraded?: boolean | 'json-protocol'
  downgradeReason?: string
  retryStrategy?: 'thinking_disabled' | 'max_tokens_raised' | 'prompt_only'
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
  }
  timeToFirstChunkMs?: number
  conversationCompacted?: boolean
}

export interface RunTraceToolDefinition {
  name: string
  policy: 'read' | 'write'
  description?: string
  parameters?: unknown
}

export interface RunTraceToolCall {
  id: string
  name: string
  input: unknown
  result?: unknown
  status: 'success' | 'failed' | 'canceled'
  startedAt: number
  endedAt?: number
  durationMs?: number
  error?: string
}

export interface RunTracePhysicalCall {
  id: string
  physicalCallId?: string
  seq: number
  phase: 'normal' | 'tool_iteration' | 'tool_convergence' | 'downgrade_initial' | 'downgrade_retry' | 'continuation' | 'retry' | 'heartbeat_retry'
  status: RunTraceStatus
  requestMessages: RunTraceMessage[]
  responseText: string
  streamText: string
  reasoningText?: string
  finishReason?: string
  usage?: unknown
  startedAt: number
  endedAt?: number
  durationMs?: number
  error?: string
  toolsEnabled?: boolean
  toolsDowngraded?: boolean
  downgradeReason?: string
  retryStrategy?: 'thinking_disabled' | 'max_tokens_raised' | 'prompt_only'
  maxTokens?: number
}

export interface RunTraceTurn {
  id: string
  seq: number
  startedAt: number
  endedAt?: number
  durationMs?: number
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
  error?: string
}

export interface RunTrace {
  id: string
  source: RunTraceSource
  sourceName: string
  step?: number
  stepName?: string
  mode: string
  projectId?: string
  projectName?: string
  providerId?: string
  providerName?: string
  model?: string
  skillNames: string[]
  skillMode?: string
  status: RunTraceStatus
  startedAt: number
  endedAt?: number
  durationMs?: number
  events: RunTraceEvent[]
  apiCalls: RunTraceApiCall[]
  turns?: RunTraceTurn[]
  promptSnapshots?: RunTracePromptSnapshot[]
  processingReports?: RunTraceProcessingReport[]
  payloads?: RunTracePayloadRef[]
  payloadIntegrityWarnings?: string[]
  dirName?: string
  currentTurnId?: string
  sessionKind?: 'task' | 'chat'
  sessionSnapshot?: boolean
  folderDiagnostics?: RunTraceFolderDiagnostic[]
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
    coverage: 'full' | 'partial' | 'structure_map' | 'reference' | 'selection'
    content?: string
    truncated?: boolean
  }>
  systemPrompt?: string
  userPrompt?: string
  finalMessages: RunTraceMessage[]
}

export interface RunTraceProcessingReport {
  id: string
  apiCallId?: string
  turnId?: string
  stage: 'pre' | 'post' | 'eval'
  processor: 'hard-rules' | 'deai' | 'postProcess' | 'integrity' | 'chain-handoff' | 'other'
  status: 'success' | 'warning' | 'failed'
  inputRef?: string
  outputRef?: string
  inputPreview?: string
  outputPreview?: string
  output?: string
  ruleHits?: Array<{ rule: string; count: number; samples?: string[] }>
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
  kind: 'request' | 'response' | 'stream' | 'reasoning' | 'prompt' | 'tool-input' | 'tool-result' | 'processing-input' | 'processing-output' | 'raw-http' | 'folder-output'
  file: string
  bytes: number
  chars: number
  sha256: string
  createdAt: number
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
    issues?: Array<{ severity?: string; code?: string; message?: string }>
    durationMs?: number
  }
}

export interface StartRunInput {
  source?: RunTraceSource
  step?: number
  stepName?: string
  mode: string
  projectId?: string
  projectName?: string
  providerId?: string
  providerName?: string
  model?: string
  skillNames?: string[]
  skillMode?: string
  target?: RunTrace['target']
  context?: RunTrace['context']
  sessionKind?: 'task' | 'chat'
  timeoutHint?: RunTrace['timeoutHint']
}

export function folderDiagnosticsStatus(diagnostics: RunTraceFolderDiagnostic[]): RunTraceStatus | null {
  let worst: RunTraceStatus | null = null
  for (const item of diagnostics) {
    if (item?.status === 'failed' || item?.status === 'blocked') return 'failed'
    if (item?.status === 'degraded') worst = 'degraded'
  }
  return worst
}

export interface StartTurnInput {
  userRequest: string
  skillNames?: string[]
  mode?: string
  intent?: string
  writeMode?: string
  toolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
  actualToolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
}

export interface UpdateTurnIntentInput {
  intent?: string
  routingFallback?: string
  toolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
  actualToolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
}

export interface StartApiCallInput {
  source?: RunTraceSource
  step?: number
  skillId?: string
  skillName?: string
  agentId?: string
  agentName?: string
  providerId?: string
  providerName?: string
  model?: string
  temperature?: number
  maxTokens?: number
  intent?: string
  toolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
  actualToolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
  requestMessages: RunTraceMessage[]
  toolRequestDeltas?: RunTraceMessage[]
}

export interface FinishApiCallInput {
  status: RunTraceStatus
  responseText?: string
  reasoningText?: string
  finishReason?: string
  usage?: unknown
  durationMs?: number
  error?: string
  reason?: string
  compatibilityMode?: 'json-protocol'
  compatibilityWrite?: boolean
  toolsDowngraded?: boolean | 'json-protocol'
  downgradeReason?: string
  retryStrategy?: 'thinking_disabled' | 'max_tokens_raised' | 'prompt_only'
  maxTokens?: number
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
  durationMs?: number
  status?: RunTraceStatus
  error?: string
  toolsEnabled?: boolean
  toolsDowngraded?: boolean
  downgradeReason?: string
  retryStrategy?: RunTracePhysicalCall['retryStrategy']
  maxTokens?: number
}

export interface ToolCallInput {
  name: string
  input: unknown
  result?: unknown
  status?: RunTraceToolCall['status']
  startedAt?: number
  endedAt?: number
  durationMs?: number
  error?: string
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
  issues?: RunTraceProcessingReport['issues']
  integrity?: RunTraceProcessingReport['integrity']
  startedAt: number
  endedAt?: number
  durationMs?: number
}

export interface RunMetadataInput {
  providerId?: string
  providerName?: string
  model?: string
}

const RUN_TRACE_SCHEMA_VERSION = 9

let idSeed = 0
function nextId(prefix: string) {
  idSeed += 1
  return `${prefix}-${Date.now()}-${idSeed}`
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

  function trimRuns() {
    if (runs.value.length <= maxRuns) return
    const keepRuns = runs.value.slice(0, maxRuns)
    const removedRuns = runs.value.slice(maxRuns)
    runs.value = keepRuns
    removedRuns.forEach(removeRunDirectory)
  }

  function startRun(input: StartRunInput) {
    const source = normalizeSource(input.source)
    if (input.sessionKind !== 'chat') abandonRunningRun(source)
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
      model: input.model,
      skillNames: input.skillNames?.slice() || [],
      skillMode: input.skillMode,
      target: input.target ? { ...input.target } : undefined,
      context: input.context ? { ...input.context } : undefined,
      status: 'running',
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
    runs.value.unshift(run)
    currentRunIdBySource.value[source] = run.id
    currentApiCallIdBySource.value[source] = null
    lastRunIdBySource.value[source] = run.id
    addEvent(run.id, {
      type: 'started',
      level: 'info',
      label: `开始${RUN_TRACE_SOURCE_NAMES[source]}${input.stepName ? ' ' + input.stepName : ''}运行`
    })
    trimRuns()
    startStateWatchdogForRun(run.id, 'active')
    return run.id
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

  function startTurn(runId: string, input: StartTurnInput) {
    const run = getRun(runId)
    if (!run || run.sessionKind !== 'chat') return ''
    if (run.status !== 'running') {
      run.status = 'running'
      run.endedAt = undefined
      run.durationMs = undefined
      run.error = undefined
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
      level: status === 'success' ? 'info' : status === 'degraded' || status === 'blocked' ? 'warn' : 'error',
      label: `第 ${turn.seq} 轮${status === 'success' ? '完成' : status === 'degraded' ? '完成（降级）' : status === 'blocked' ? '已阻断，等待恢复' : status === 'canceled' ? '取消' : '失败'}`,
      detail: [error, reason].filter(Boolean).join(' / ')
    })
    if (run.currentTurnId === turnId) run.currentTurnId = undefined
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
    turn.intent = input.intent
    turn.routingFallback = input.routingFallback || turn.routingFallback
    if (input.toolSurface) {
      turn.toolSurface = input.toolSurface.map(item => ({ ...item }))
    }
    if (input.actualToolSurface) {
      turn.actualToolSurface = input.actualToolSurface.map(item => ({ ...item }))
    }
    addEvent(runId, {
      type: 'turn-intent-updated',
      level: 'info',
      label: `第 ${turn.seq} 轮意图已修正`,
      detail: [
        input.intent,
        input.routingFallback,
        input.actualToolSurface?.map(item => item.name).join(','),
      ].filter(Boolean).join(' / ')
    })
    void saveRunToDisk(run)
    return true
  }

  function addEvent(runId: string, event: Omit<RunTraceEvent, 'id' | 'ts'>) {
    const run = getRun(runId)
    if (!run) return
    const seq = run.events.reduce((max, item) => Math.max(max, item.seq || 0), 0) + 1
    run.events.push({ id: nextId('event'), ts: Date.now(), turnId: run.currentTurnId, seq, ...event })
  }

  function startApiCall(runId: string, input: StartApiCallInput) {
    const run = getRun(runId)
    if (!run) return ''
    backfillRunMetadata(runId, input)
    const call: RunTraceApiCall = {
      id: nextId('api'),
      turnId: run.currentTurnId,
      seq: run.apiCalls.length + 1,
      step: input.step,
      skillId: input.skillId,
      skillName: input.skillName,
      agentId: input.agentId,
      agentName: input.agentName,
      providerId: input.providerId,
      providerName: input.providerName,
      model: input.model,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      intent: input.intent,
      toolSurface: input.toolSurface,
      actualToolSurface: input.actualToolSurface,
      requestMessages: input.requestMessages.map(m => ({ role: m.role, content: m.content })),
      toolRequestDeltas: input.toolRequestDeltas?.map(m => ({ role: m.role, content: m.content })),
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
        actualToolSurface: input.actualToolSurface?.map(item => ({ ...item })) || []
      })
    })
    return call.id
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
      existing.endedAt = Date.now()
      existing.durationMs = input.durationMs ?? existing.durationMs
      existing.error = input.error
      existing.toolsEnabled = input.toolsEnabled ?? existing.toolsEnabled
      existing.toolsDowngraded = input.toolsDowngraded ?? existing.toolsDowngraded
      existing.downgradeReason = input.downgradeReason ?? existing.downgradeReason
      existing.retryStrategy = input.retryStrategy ?? existing.retryStrategy
      existing.maxTokens = input.maxTokens ?? existing.maxTokens
      addEvent(runId, {
        type: 'physical-call',
        level: existing.status === 'success' ? 'info' : existing.status === 'running' ? 'info' : 'error',
        label: `第 ${existing.seq} 次物理请求${existing.status === 'success' ? '完成' : existing.status === 'running' ? '进行中' : '失败'}`,
        detail: [existing.phase, call.skillName, call.model, existing.finishReason, existing.error].filter(Boolean).join(' / ')
      })
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
      startedAt: Date.now(),
      durationMs: input.durationMs,
      endedAt: input.durationMs ? Date.now() : undefined,
      error: input.error,
      toolsEnabled: input.toolsEnabled,
      toolsDowngraded: input.toolsDowngraded,
      downgradeReason: input.downgradeReason,
      retryStrategy: input.retryStrategy,
      maxTokens: input.maxTokens
    }
    call.physicalCalls.push(physical)
    addEvent(runId, {
      type: 'physical-call',
      level: physical.status === 'success' || physical.status === 'running' ? 'info' : 'error',
      label: `第 ${physical.seq} 次物理请求${physical.status === 'success' ? '完成' : physical.status === 'running' ? '进行中' : '失败'}`,
      detail: [physical.phase, call.skillName, call.model, physical.finishReason, physical.error].filter(Boolean).join(' / ')
    })
    return physical.id
  }

  function appendToolCall(runId: string, callId: string, input: ToolCallInput): string {
    const call = getRun(runId)?.apiCalls.find(item => item.id === callId)
    if (!call) return ''
    call.toolCalls = call.toolCalls || []
    const toolCall: RunTraceToolCall = {
      id: nextId('tool'),
      name: input.name,
      input: input.input,
      result: input.result,
      status: input.status || (input.error ? 'failed' : 'success'),
      startedAt: input.startedAt || Date.now(),
      endedAt: input.endedAt,
      durationMs: input.durationMs,
      error: input.error
    }
    call.toolCalls.push(toolCall)
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
      detail: toolCall.error
    })
    return toolCall.id
  }

  function attachPromptSnapshot(runId: string, input: PromptSnapshotInput): string {
    const run = getRun(runId)
    if (!run) return ''
    run.promptSnapshots = run.promptSnapshots || []
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
      finalMessages: input.finalMessages.map(m => ({ role: m.role, content: m.content }))
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
    if (input.model && !run.model) run.model = input.model
  }

  function appendStream(runId: string, callId: string, text: string) {
    const call = getRun(runId)?.apiCalls.find(item => item.id === callId)
    if (!call) return
    if (call.status !== 'running') return
    call.streamText += text
    const run = getRun(runId)
    if (run) currentApiCallIdBySource.value[run.source] = call.id
    scheduleStreamSave(runId)
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

  function backfillApiResponseFromPhysicalCalls(call: RunTraceApiCall): void {
    const physical = [...(call.physicalCalls || [])]
      .reverse()
      .find(item => (
        (typeof item.responseText === 'string' && item.responseText.trim())
        || (typeof item.reasoningText === 'string' && item.reasoningText.trim())
      ))
    if (!physical) return
    if (!String(call.responseText || '').trim() && typeof physical.responseText === 'string') {
      call.responseText = physical.responseText
    }
    if (!String(call.reasoningText || '').trim() && typeof physical.reasoningText === 'string') {
      call.reasoningText = physical.reasoningText
    }
  }

  function finishApiCall(runId: string, callId: string, patch: FinishApiCallInput) {
    const run = getRun(runId)
    const call = run?.apiCalls.find(item => item.id === callId)
    if (!run || !call) return
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
    call.responseText = patch.responseText ?? call.responseText
    const patchReasoning = patch.reasoningText || ''
    if (patchReasoning && patchReasoning.length >= call.reasoningText.length) {
      call.reasoningText = patchReasoning
    }
    call.finishReason = patch.finishReason ?? call.finishReason
    call.usage = patch.usage ?? call.usage
    call.durationMs = patch.durationMs ?? (Date.now() - call.startedAt)
    call.error = patch.error
    call.compatibilityMode = patch.compatibilityMode ?? call.compatibilityMode
    call.compatibilityWrite = patch.compatibilityWrite ?? call.compatibilityWrite
    call.toolsDowngraded = patch.toolsDowngraded ?? call.toolsDowngraded
    call.downgradeReason = patch.downgradeReason ?? call.downgradeReason
    call.retryStrategy = patch.retryStrategy ?? call.retryStrategy
    call.maxTokens = patch.maxTokens ?? call.maxTokens
    call.endedAt = Date.now()
    if (!String(call.responseText || '').trim() || !String(call.reasoningText || '').trim()) {
      backfillApiResponseFromPhysicalCalls(call)
    }
    if (patch.usage) {
      call.semantic = {
        ...call.semantic,
        conversationId: call.semantic?.conversationId || run?.id || callId,
        turnId: call.semantic?.turnId || call.turnId,
        usage: normalizeUsage(patch.usage)
      }
    }
    if (run && currentApiCallIdBySource.value[run.source] === call.id) {
      currentApiCallIdBySource.value[run.source] = null
    }
    addEvent(runId, createLifecycleTransitionEvent(
      'RunTraceStatus',
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
        level: status === 'success' ? 'info' : status === 'degraded' || status === 'blocked' ? 'warn' : 'error',
        label: `第 ${call.seq} 次 API 调用随运行闭合`,
      detail: [call.skillName, call.model, call.error].filter(Boolean).join(' / ')
      })
    }
    if (run.sessionKind === 'chat' && run.currentTurnId) {
      finishTurn(runId, run.currentTurnId, status, error)
    }
    const fromStatus = 'running'
    run.status = status
    run.endedAt = Date.now()
    run.durationMs = run.endedAt - run.startedAt
    run.error = error
    addEvent(runId, {
      type: status === 'canceled' ? 'canceled' : 'finished',
      level: status === 'success' ? 'info' : status === 'degraded' || status === 'blocked' ? 'warn' : 'error',
      label: status === 'success' ? '运行完成' : status === 'degraded' ? '运行完成（降级）' : status === 'blocked' ? '运行阻断，等待恢复' : status === 'canceled' ? '运行取消' : '运行失败',
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
    if (run.sessionKind === 'chat') {
      addEvent(runId, {
        type: 'session-closed',
        level: 'info',
        label: '会话记录已封存'
      })
    }
    void saveRunToDisk(run)
  }

  function normalizeUsage(usage: unknown): RunTraceSemantic['usage'] | undefined {
    if (!usage || typeof usage !== 'object') return undefined
    const source = usage as Record<string, unknown>
    const value: Record<string, number> = {}
    const map: Array<[keyof NonNullable<RunTraceSemantic['usage']>, string[]]> = [
      ['inputTokens', ['inputTokens', 'input_tokens', 'promptTokens', 'prompt_tokens', 'promptTokenCount']],
      ['outputTokens', ['outputTokens', 'output_tokens', 'completionTokens', 'completion_tokens', 'candidatesTokenCount']],
      ['cacheReadInputTokens', ['cacheReadInputTokens', 'cache_read_input_tokens', 'promptTokensDetails.cacheReadTokenCount', 'cachedTokens', 'cached_tokens']],
      ['cacheWriteInputTokens', ['cacheWriteInputTokens', 'cache_write_input_tokens']],
      ['reasoningOutputTokens', ['reasoningOutputTokens', 'reasoning_output_tokens', 'reasoningTokens', 'reasoning_tokens']]
    ]
    map.forEach(([target, keys]) => {
      for (const key of keys) {
        const raw = key.includes('.')
          ? (source as any)[key.split('.')[0]]?.[key.split('.')[1]]
          : source[key]
        if (typeof raw === 'number' && Number.isFinite(raw)) {
          value[target] = raw
          break
        }
      }
    })
    return Object.keys(value).length ? (value as RunTraceSemantic['usage']) : undefined
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
    run.folderDiagnostics = [
      ...(run.folderDiagnostics || []),
      ...(Array.isArray(diagnostics) ? diagnostics : [diagnostics])
    ]
    addEvent(runId, {
      type: 'folder-diagnostics',
      level: 'info',
      label: '记录 folder SKILL 诊断'
    })
  }

  function removeRun(id: string) {
    const index = runs.value.findIndex(run => run.id === id)
    if (index >= 0) {
      clearStateWatchdogForRun(id)
      flushStreamSave(id)
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
    removed.forEach(removeRunDirectory)
    currentRunIdBySource.value = { pipeline: null, outline: null, home: null, eval: null, infra: null }
    currentApiCallIdBySource.value = { pipeline: null, outline: null, home: null, eval: null, infra: null }
    lastRunIdBySource.value = { pipeline: null, outline: null, home: null, eval: null, infra: null }
  }

  function addSourceEvent(source: RunTraceSource, event: Omit<RunTraceEvent, 'id' | 'ts'>) {
    const runId = currentRunIdBySource.value[source] || lastRunIdBySource.value[source]
    if (!runId) return
    addEvent(runId, event)
  }

  function addBatchEvent(source: RunTraceSource, batchEvent: DialogueBatchEvent) {
    const runId = currentRunIdBySource.value[source] || lastRunIdBySource.value[source]
    if (!runId) return
    addEvent(runId, {
      type: 'batch_event',
      level: batchEvent.status === 'pending' || batchEvent.status === 'applied' ? 'info' : 'warn',
      label: `AI 批次${batchEvent.status}`,
      detail: [
        `batchId=${batchEvent.batchId}`,
        `workspace=${batchEvent.workspace}`,
        `targetId=${batchEvent.targetId}`,
        `commands=${batchEvent.commandCount}`,
        batchEvent.reason,
      ].filter(Boolean).join(' / '),
      batchEvent,
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

  function maskSensitive(text: string) {
    return String(text || '')
      .replace(/(Authorization\s*[:=]\s*Bearer\s+)[^\s"'，。]+/gi, '$1***MASKED***')
      .replace(/(api[_-]?key\s*[:=]\s*)[^\s"'，。]+/gi, '$1***MASKED***')
      .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '***MASKED***')
  }

  function exportRunToText(run: RunTrace) {
    const snapshot = createExportSnapshot(run)
    const lines: string[] = [
      '===== 运行记录 =====',
      `来源：${snapshot.sourceName}`,
      `层级：${snapshot.stepName || '-'}`,
      `模式：${snapshot.mode}`,
      `状态：${snapshot.status}`,
      `开始：${formatTime(snapshot.startedAt)}`,
      `结束：${formatTime(snapshot.endedAt)}`,
      `耗时：${snapshot.durationMs ?? 0}ms`,
      `项目：${snapshot.projectName || snapshot.projectId || '-'}`,
      `供应商：${snapshot.providerName || snapshot.providerId || '-'}`,
      `模型：${snapshot.model || '-'}`,
      `技能：${snapshot.skillNames.join('、') || '-'}`,
      `技能模式：${snapshot.skillMode || '-'}`,
      snapshot.sessionSnapshot ? '会话快照：导出时会话仍在应用内继续' : '',
      `状态时间线：${(snapshot.stateHistory || []).map(item => `${item.fromStatus || 'initial'} -> ${item.toStatus}${item.reason ? `(${item.reason})` : ''}`).join('；') || '-'}`,
      `超时提示：${snapshot.timeoutHint ? JSON.stringify(snapshot.timeoutHint) : '-'}`,
      '',
      '===== 时间线 ====='
    ]
    snapshot.events.forEach(event => {
      lines.push(`[${formatTime(event.ts)}] [${event.level}] ${event.label}`)
      if (event.detail) lines.push(maskSensitive(event.detail))
    })
    lines.push('', '===== API 调用 =====')
    snapshot.apiCalls.forEach(call => {
      lines.push(
        `--- api-call-${call.seq} ---`,
        `状态：${call.status}`,
        `耗时：${call.durationMs ?? 0}ms`,
        `finish_reason：${call.finishReason || '-'}`,
        `技能：${call.skillName || call.skillId || '-'}`,
        `智能体：${call.agentName || call.agentId || '-'}`,
        `供应商：${call.providerName || call.providerId || '-'}`,
        `模型：${call.model || '-'}`,
        `temperature：${call.temperature ?? '-'}`,
        `max_tokens：${call.maxTokens ?? '-'}`,
        '请求消息：'
      )
      call.requestMessages.forEach(message => {
        lines.push(`[${message.role}]`, maskSensitive(message.content))
      })
      lines.push('响应全文：', maskSensitive(call.responseText || ''))
      if (call.streamText) lines.push('流式全文：', maskSensitive(call.streamText))
      if (call.reasoningText) lines.push('思考过程全文：', maskSensitive(call.reasoningText))
      if (call.usage) lines.push('usage：', JSON.stringify(call.usage, null, 2))
      if (call.physicalCalls?.length) {
        if (call.integrity?.physicalSkipped) {
          lines.push(`物理请求标记：跳过空载荷（${call.integrity.physicalSkipReason || '-'}）`)
        }
        lines.push('物理请求：')
        call.physicalCalls.forEach(physical => {
          lines.push(
            `--- physical-${physical.seq} (${physical.phase}) ---`,
            `状态：${physical.status}`,
            `耗时：${physical.durationMs ?? 0}ms`,
            `finish_reason：${physical.finishReason || '-'}`
          )
          physical.requestMessages.forEach(message => {
            lines.push(`[${message.role}]`, maskSensitive(message.content))
          })
          lines.push('响应：', maskSensitive(physical.responseText || ''))
        })
      }
      if (call.toolCalls?.length) {
        lines.push('工具调用：')
        call.toolCalls.forEach(tool => {
          lines.push(
            `--- ${tool.id} ${tool.name} ---`,
            `状态：${tool.status}`,
            `耗时：${tool.durationMs ?? 0}ms`,
            '输入：', JSON.stringify(tool.input, null, 2),
            '结果：', JSON.stringify(tool.result, null, 2)
          )
        })
      }
      if (call.error) lines.push('错误原文：', maskSensitive(call.error))
      if (call.integrity?.physicalMissing) {
        lines.push(`物理请求标记：缺失（${call.integrity.physicalMissingReason || '-'}）`)
      }
    })
    if (snapshot.promptSnapshots?.length) {
      lines.push('', '===== 提示词快照 =====')
      snapshot.promptSnapshots.forEach(promptSnapshot => {
        lines.push(
          `--- ${promptSnapshot.id} ---`,
          `技能：${promptSnapshot.skillName || promptSnapshot.skillId || '-'}`,
          `模式：${promptSnapshot.mode || '-'}`,
          `构建时间：${formatTime(promptSnapshot.builtAt)}`
        )
        promptSnapshot.finalMessages.forEach(message => {
          lines.push(`[${message.role}]`, maskSensitive(message.content))
        })
      })
    }
    if (snapshot.processingReports?.length) {
      lines.push('', '===== 本地处理报告 =====')
      snapshot.processingReports.forEach(report => {
        lines.push(
          `--- ${report.id} ${report.processor} ${report.stage} ---`,
          `状态：${report.status}`,
          `耗时：${report.durationMs ?? 0}ms`
        )
        if (report.ruleHits?.length) {
          lines.push('规则命中：', JSON.stringify(report.ruleHits, null, 2))
        }
        if (report.issues?.length) {
          lines.push('问题：', JSON.stringify(report.issues, null, 2))
        }
      })
    }
    if (snapshot.folderDiagnostics?.length) {
      lines.push('', '===== folder SKILL 诊断 =====')
      snapshot.folderDiagnostics.forEach((item, index) => {
        lines.push(`--- diagnostic-${index + 1} ---`, JSON.stringify(item, null, 2))
      })
    }
    if (snapshot.error) lines.push('', '===== 运行错误 =====', maskSensitive(snapshot.error))
    return lines.join('\n')
  }

  function exportRunToJson(run: RunTrace) {
    const exportable = createExportSnapshot(run) as Partial<RunTrace>
    delete exportable.currentTurnId
    delete exportable.dirName
    return {
      schemaVersion: RUN_TRACE_SCHEMA_VERSION,
      ...maskSensitiveValue(exportable) as Record<string, unknown>
    }
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
   * Exports must not lie about that state: a completed turn should never be
   * reported as a running run to a skill author.
   */
  function createExportSnapshot(run: RunTrace): RunTrace {
    if (run.sessionKind !== 'chat' || run.status !== 'running') return run
    if (run.currentTurnId || run.apiCalls.some(call => call.status === 'running')) return run
    const snapshot = JSON.parse(JSON.stringify(run)) as RunTrace
    const lastTurn = snapshot.turns?.[snapshot.turns.length - 1]
    snapshot.status = lastTurn?.status === 'failed' || lastTurn?.status === 'canceled' || lastTurn?.status === 'blocked'
      ? lastTurn.status
      : 'success'
    snapshot.stateHistory = [...(snapshot.stateHistory || []), {
      fromStatus: 'running',
      toStatus: snapshot.status,
      reason: 'export_snapshot_synthesized_from_last_turn',
      recordedAt: Date.now()
    }]
    snapshot.sessionSnapshot = true
    snapshot.endedAt = Date.now()
    snapshot.durationMs = snapshot.endedAt - snapshot.startedAt
    return snapshot
  }

  function maskSensitiveValue(value: unknown): unknown {
    if (typeof value === 'string') return maskSensitive(value)
    if (Array.isArray(value)) return value.map(maskSensitiveValue)
    if (value && typeof value === 'object') {
      const output: Record<string, unknown> = {}
      Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
        output[key] = maskSensitiveValue(item)
      })
      return output
    }
    return value
  }

  return {
    runs,
    sortedRuns,
    currentRun,
    currentRunIdBySource,
    currentApiCallIdBySource,
    currentRunId,
    currentApiCallId,
    maxRuns,
    getRun,
    getLastRunId,
    abandonRunningRun,
    getRunId,
    getApiCallId,
    addSourceEvent,
    addBatchEvent,
    startRun,
    startTurn,
    finishTurn,
    updateTurnIntent,
    addEvent,
    startApiCall,
    appendPhysicalCall,
    appendToolCall,
    setApiCallToolRequestDeltas,
    attachPromptSnapshot,
    attachProcessingReport,
    registerPayload,
    attachSemantic,
    markContextCompacted,
    appendStream,
    appendReasoning,
    appendCumulativeStream,
    setApiCallRequest,
    finishApiCall,
    cancelRunningApiCalls,
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
    checkStateIntegrityBeforeClose,
    checkStateIntegrity
  }
})
