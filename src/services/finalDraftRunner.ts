import {
  continueFinalDraft,
  createFinalDraftTask,
  generateFinalDraft,
  hashContent,
  normalizeFinalDraftSkillGuidance,
  FINAL_DRAFT_SKILL_GUIDANCE_CHAR_LIMIT,
  retryFinalDraftSegment,
  type FinalDraftDestination,
  type FinalDraftEditorAdapter,
  type FinalDraftEvent as FinalDraftTaskEvent,
  type FinalDraftTask,
} from './finalDraftService'
import type { AiService, CallAiParams, CallAiResult, PhysicalCallEvent } from './aiService'
import type { ProviderQueueEvent } from './providerScheduler'
import type { RunTraceMessage, RunTraceStatus } from '../stores/runTrace'
import { createFinalDraftThroughputTracker } from './finalDraftTelemetry'
import {
  finalDraftCheckpointId,
  loadFinalDraftCheckpoint,
  restoreFinalDraftTaskFromCheckpoint,
  saveFinalDraftCheckpoint,
  type FinalDraftCheckpointStore,
} from './finalDraftCheckpoint'
import type { FinalDraftProgressTelemetry } from './finalDraftProgress'
import {
  detectSourceContamination,
  type SourceContaminationConversationMessage,
} from './sourceContaminationDetector'

export { snapshotFinalDraftTask } from './finalDraftService'

interface FinalDraftRunnerProgressEvent {
  taskId: string
  phase: 'generating' | 'awaiting_continuation' | 'writing' | 'completed' | 'interrupted'
  accumulatedChars: number
  continuationCount: number
  streamingChars: number
  lastStreamActivityAt: number
  activeSegmentIndex: number
  telemetry?: FinalDraftProgressTelemetry
}

export interface FinalDraftTraceHooks {
  startApiCall(input: {
    skillName?: string
    requestMessages: RunTraceMessage[]
    model?: string
    intent?: string
    toolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
    actualToolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
  }): string | undefined
  finishApiCall(callId: string | undefined, result: {
    status: RunTraceStatus
    responseText?: string
    reasoningText?: string
    finishReason?: string
    usage?: unknown
    usageUnavailable?: boolean
    durationMs?: number
    error?: string
    maxTokens?: number | null
  }): void
  recordPhysicalCall(callId: string | undefined, event: PhysicalCallEvent): void
  recordProviderQueue(callId: string | undefined, event: ProviderQueueEvent): void
  appendStream(text: string): void
  appendReasoning(callId: string | undefined, text: string | undefined): void
  addEvent(event: { type: string; label: string; level?: 'info' | 'warn' | 'error'; detail?: string; payload?: unknown }): void
}

export interface FinalDraftRunInput {
  aiService: Pick<AiService, 'callAi'>
  adapter: FinalDraftEditorAdapter
  destination: FinalDraftDestination
  targetId: string
  sourceContent: string
  instruction: string
  operation?: FinalDraftTask['operation']
  /** App-owned SKILL guidance. It never changes the final-draft execution protocol. */
  skillGuidance?: string
  constraints?: string[]
  styleProfileVersion?: 1 | 2
  model?: string
  providerId?: string
  signal?: AbortSignal
  cancelSignal?: AbortSignal
  sourceSegments?: FinalDraftTask['sourceSegments']
  /** Recent conversation text used only to warn when it has leaked into the source. */
  conversationMarkers?: SourceContaminationConversationMessage[]
  checkpointStore?: FinalDraftCheckpointStore
  onTaskChange?: (task: FinalDraftTask) => void
  onTaskEvent?: (task: FinalDraftTask, event: FinalDraftTaskEvent) => void
  onProgress?: (event: FinalDraftRunnerProgressEvent) => void
}

export interface FinalDraftContinueInput {
  aiService: Pick<AiService, 'callAi'>
  adapter: FinalDraftEditorAdapter
  task: FinalDraftTask
  model?: string
  providerId?: string
  signal?: AbortSignal
  cancelSignal?: AbortSignal
  checkpointStore?: FinalDraftCheckpointStore
  onTaskChange?: (task: FinalDraftTask) => void
  onTaskEvent?: (task: FinalDraftTask, event: FinalDraftTaskEvent) => void
  onProgress?: FinalDraftRunInput['onProgress']
}

export interface FinalDraftRetrySegmentInput {
  aiService: Pick<AiService, 'callAi'>
  adapter: FinalDraftEditorAdapter
  task: FinalDraftTask
  model?: string
  providerId?: string
  signal?: AbortSignal
  cancelSignal?: AbortSignal
  checkpointStore?: FinalDraftCheckpointStore
  onTaskChange?: (task: FinalDraftTask) => void
  onTaskEvent?: (task: FinalDraftTask, event: FinalDraftTaskEvent) => void
  onProgress?: FinalDraftRunInput['onProgress']
  providerSwitch?: {
    fromProviderId?: string
    fromProviderName?: string
    fromModel?: string
    toProviderId?: string
    toProviderName?: string
    toModel?: string
    beforeTelemetry?: FinalDraftProgressTelemetry
  }
}

export interface FinalDraftResumeInput {
  aiService: Pick<AiService, 'callAi'>
  adapter: FinalDraftEditorAdapter
  checkpointId: string
  sourceContent: string
  checkpointStore: FinalDraftCheckpointStore
  model?: string
  providerId?: string
  signal?: AbortSignal
  cancelSignal?: AbortSignal
  onTaskChange?: (task: FinalDraftTask) => void
  onTaskEvent?: (task: FinalDraftTask, event: FinalDraftTaskEvent) => void
  onProgress?: FinalDraftRunInput['onProgress']
}

interface FinalDraftTaskPublisher {
  publish(task: FinalDraftTask): void
  flush(task?: FinalDraftTask): void
}

function createFinalDraftTaskPublisher(
  onPublish: (task: FinalDraftTask) => void,
  intervalMs = 250,
): FinalDraftTaskPublisher {
  let pendingTask: FinalDraftTask | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  const publishPending = () => {
    const task = pendingTask
    pendingTask = null
    if (task) onPublish(task)
  }
  return {
    publish(task) {
      pendingTask = task
      if (timer === null) {
        timer = setTimeout(() => {
          timer = null
          publishPending()
        }, intervalMs)
      }
    },
    flush(task) {
      if (task) pendingTask = task
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      publishPending()
    },
  }
}

function publishableFinalDraftTask(task: FinalDraftTask): FinalDraftTask {
  if (task.status === 'completed' && !task.accumulatedText && task.completedText) {
    return { ...task, accumulatedText: task.completedText }
  }
  return task
}

export async function runFinalDraft(input: FinalDraftRunInput, hooks: FinalDraftTraceHooks): Promise<FinalDraftTask> {
  const guidance = normalizeFinalDraftSkillGuidance(input.skillGuidance)
  const contamination = detectSourceContamination(input.sourceContent, input.conversationMarkers || [])
  const task = createFinalDraftTask({
    destination: input.destination,
    targetId: input.targetId,
    sourceContent: input.sourceContent,
    instruction: input.instruction,
    operation: input.operation,
    skillGuidance: guidance?.text,
    constraints: input.constraints,
    styleProfileVersion: input.styleProfileVersion,
    sourceSegments: input.sourceSegments,
  })
  if (contamination.detected) {
    const payload = {
      taskId: task.taskId,
      destination: task.destination,
      sourceChars: input.sourceContent.length,
      markerCount: (input.conversationMarkers || []).length,
      matchCount: contamination.matches.length,
      truncated: contamination.truncated,
      matches: contamination.matches,
    }
    hooks.addEvent({
      type: 'source-contamination-detected',
      label: '源文疑似包含上一轮对话说明文本',
      level: 'warn',
      detail: JSON.stringify(payload),
      payload,
    })
  }
  if (guidance?.truncated) {
    hooks.addEvent({
      type: 'skill-guidance-truncated',
      label: '终稿领域能力已截断',
      level: 'warn',
      detail: JSON.stringify({
        limit: FINAL_DRAFT_SKILL_GUIDANCE_CHAR_LIMIT,
        originalChars: input.skillGuidance?.length || 0,
        retainedChars: guidance.text.length,
      }),
      payload: {
        limit: FINAL_DRAFT_SKILL_GUIDANCE_CHAR_LIMIT,
        originalChars: input.skillGuidance?.length || 0,
        retainedChars: guidance.text.length,
      },
    })
  }
  hooks.addEvent({
    type: 'final-draft-skill-guidance',
    label: guidance ? '终稿领域能力已注入' : '未注入终稿领域能力',
    level: guidance?.truncated ? 'warn' : 'info',
    detail: JSON.stringify({
      executor: 'final-draft-runner',
      skillGuidancePresent: Boolean(guidance),
      chars: guidance?.text.length || 0,
      truncated: guidance?.truncated || false,
    }),
    payload: {
      executor: 'final-draft-runner',
      skillGuidancePresent: Boolean(guidance),
      chars: guidance?.text.length || 0,
      truncated: guidance?.truncated || false,
    },
  })
  hooks.addEvent({
    type: 'final-draft-created',
    label: '终稿生成任务已创建',
    detail: JSON.stringify({
      taskId: task.taskId,
      destination: task.destination,
      targetId: task.targetId,
      instruction: task.instruction,
      sourceChars: task.sourceContent.length,
      sourceContentHash: task.sourceContentHash,
      segments: task.sourceSegments.length,
    }),
    payload: {
      taskId: task.taskId,
      destination: task.destination,
      targetId: task.targetId,
      sourceChars: task.sourceContent.length,
      sourceContentHash: task.sourceContentHash,
      segments: task.sourceSegments.length,
    },
  })
  const progressState = {
    task,
    baseStreamText: '',
    streamedText: '',
    lastStreamActivityAt: Date.now(),
  }
  const activeCallId: { current?: string } = {}
  const taskPublisher = createFinalDraftTaskPublisher(task => input.onTaskChange?.(task))
  const taskChangedOnStream = () => {
    const current = {
      ...progressState.task,
      accumulatedText: progressState.baseStreamText + progressState.streamedText,
      updatedAt: Date.now(),
    }
    progressState.task = current
    taskPublisher.publish(current)
  }
  const telemetry = createFinalDraftThroughputTracker()
  const lastEventAt = { value: 0 }
  const lastMessageTelemetryStatus = { value: task.lastTelemetry?.throughputStatus }
  input.onTaskChange?.(task)
  const heartbeat = startFinalDraftHeartbeat({
    hooks,
    state: progressState,
    telemetry,
    lastEventAt: { value: 0 },
    onProgress: event => {
      input.onProgress?.(event)
      updateTaskTelemetry(progressState, event, lastMessageTelemetryStatus, input.onTaskChange)
    },
    checkpointStore: input.checkpointStore,
  })
  try {
    return await generateFinalDraft(
    {
      aiService: wrapAiService(input.aiService, hooks, activeCallId, input.model, input.providerId),
      adapter: input.adapter,
      task,
      sourceContent: input.sourceContent,
    },
    {
      skillGuidance: guidance?.text,
      signal: input.signal,
      cancelSignal: input.cancelSignal,
      onTaskChange: changed => {
        const previous = progressState.task
        progressState.task = changed
        if (previous !== changed) {
          progressState.baseStreamText = changed.accumulatedText
          progressState.streamedText = ''
        }
        if (
          previous.activeSegmentIndex !== changed.activeSegmentIndex
          || (previous.status !== 'generating' && changed.status === 'generating')
          || changed.status === 'awaiting_continuation'
          || changed.status === 'interrupted'
        ) {
          void persistCheckpoint(hooks, changed, input.checkpointStore)
        }
        taskPublisher.publish(changed)
      },
      onTaskEvent: input.onTaskEvent,
      onProgress: event => input.onProgress?.(event),
      onSlowStreamInterrupted: partialText => {
        // The service reducer still holds the last segment-start snapshot;
        // keep the live partial stream instead of checkpointing an empty one.
        restoreLivePartialStream(progressState, partialText + progressState.streamedText)
        taskPublisher.flush(progressState.task)
        void persistCheckpoint(hooks, progressState.task, input.checkpointStore)
        input.onTaskChange?.(progressState.task)
        return progressState.task.accumulatedText
      },
      onChunk: text => {
        hooks.appendStream(text)
        progressState.streamedText += text
        taskChangedOnStream()
        publishFinalDraftProgress({
          hooks,
          state: progressState,
          telemetry,
          lastEventAt,
          recordSample: true,
          now: Date.now(),
          onProgress: event => {
            input.onProgress?.(event)
            updateTaskTelemetry(progressState, event, lastMessageTelemetryStatus, input.onTaskChange)
          },
        })
      },
      onPhysicalCall: event => hooks.recordPhysicalCall(activeCallId.current, event),
      onProviderQueue: event => hooks.recordProviderQueue(activeCallId.current, event),
    })
  } finally {
    heartbeat.stop()
    taskPublisher.flush(publishableFinalDraftTask(progressState.task))
  }
}

async function persistCheckpoint(
  hooks: FinalDraftTraceHooks,
  task: FinalDraftTask,
  store?: FinalDraftCheckpointStore,
): Promise<void> {
  if (!store) return
  const result = await saveFinalDraftCheckpoint(task, store)
  if (result.ok) {
    hooks.addEvent({
      type: 'final-draft-checkpoint-saved',
      label: '终稿分段检查点已保存',
      detail: JSON.stringify({
        taskId: task.taskId,
        checkpointId: result.checkpointId,
        activeSegmentIndex: task.activeSegmentIndex,
        completedChars: task.completedText.length,
      }),
      payload: {
        taskId: task.taskId,
        checkpointId: result.checkpointId,
        activeSegmentIndex: task.activeSegmentIndex,
        completedChars: task.completedText.length,
      },
    })
  } else {
    hooks.addEvent({
      type: 'final-draft-checkpoint-save-failed',
      label: '终稿分段检查点保存失败',
      level: 'warn',
      detail: JSON.stringify({ taskId: task.taskId, reason: result.reason }),
      payload: { taskId: task.taskId, reason: result.reason },
    })
  }
}

async function persistPartialCheckpoint(
  hooks: FinalDraftTraceHooks,
  task: FinalDraftTask,
  accumulatedText: string,
  store?: FinalDraftCheckpointStore,
): Promise<void> {
  if (!store) return
  if (task.status !== 'generating') return
  if (!accumulatedText) return
  await persistCheckpoint(hooks, { ...task, accumulatedText }, store)
}

function activeSegmentTargetChars(task: FinalDraftTask): number | undefined {
  const segmentId = task.segmentOrder[task.activeSegmentIndex]
  const segment = task.sourceSegments.find(item => item.segmentId === segmentId)
  if (!segment) return undefined
  return segment.end - segment.start
}

function updateTaskTelemetry(
  state: FinalDraftHeartbeatState,
  event: FinalDraftRunnerProgressEvent,
  lastMessageTelemetryStatus: { value?: FinalDraftProgressTelemetry['throughputStatus'] },
  onTaskChange?: (task: FinalDraftTask) => void,
): void {
  if (!event.telemetry) return
  if (state.task.taskId !== event.taskId) return
  const shouldNotify = lastMessageTelemetryStatus.value !== event.telemetry.throughputStatus
  state.task = {
    ...state.task,
    lastTelemetry: event.telemetry,
    lastStreamActivityAt: event.lastStreamActivityAt,
    updatedAt: event.lastStreamActivityAt,
  }
  if (!shouldNotify) return
  lastMessageTelemetryStatus.value = event.telemetry.throughputStatus
  onTaskChange?.(state.task)
}

function restoreLivePartialStream(
  state: FinalDraftHeartbeatState,
  partialText: string,
): void {
  const liveText = partialText.length >= state.baseStreamText.length
    && partialText.startsWith(state.baseStreamText)
    ? partialText
    : state.baseStreamText + partialText
  state.task = {
    ...state.task,
    accumulatedText: liveText,
    updatedAt: Date.now(),
  }
}

interface FinalDraftHeartbeatState {
  task: FinalDraftTask
  baseStreamText: string
  streamedText: string
  lastStreamActivityAt: number
}

function readTestHeartbeatIntervalMs(): number | undefined {
  if (typeof window === 'undefined') return undefined
  const overrides = (window as unknown as { __SHENYI_FINAL_DRAFT_TEST_OVERRIDES__?: { heartbeatIntervalMs?: unknown } })
    .__SHENYI_FINAL_DRAFT_TEST_OVERRIDES__
  if (!overrides || typeof overrides !== 'object') return undefined
  const value = Number(overrides.heartbeatIntervalMs)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

interface FinalDraftProgressContext {
  hooks: FinalDraftTraceHooks
  state: FinalDraftHeartbeatState
  telemetry: ReturnType<typeof createFinalDraftThroughputTracker>
  lastEventAt: { value: number }
  recordSample?: boolean
}

function startFinalDraftHeartbeat(context: FinalDraftProgressContext & {
  onProgress?: (event: FinalDraftRunnerProgressEvent) => void
  checkpointStore?: FinalDraftCheckpointStore
}): { stop(): void } {
  let lastCheckpointAt = 0
  let pendingCheckpoint = false
  const timer = setInterval(() => {
    const { onProgress, ...publishContext } = context
    publishFinalDraftProgress({ ...publishContext, now: Date.now(), recordSample: false, onProgress })
    const now = Date.now()
    const task = context.state.task
    const accumulatedText = context.state.baseStreamText + context.state.streamedText
    if (
      !pendingCheckpoint
      && task.status === 'generating'
      && context.state.streamedText.length > 0
      && now - lastCheckpointAt >= 60_000
    ) {
      pendingCheckpoint = true
      lastCheckpointAt = now
      void persistPartialCheckpoint(
        context.hooks,
        { ...task, accumulatedText },
        accumulatedText,
        context.checkpointStore,
      ).finally(() => {
        pendingCheckpoint = false
      })
    }
  }, readTestHeartbeatIntervalMs() ?? 10_000)
  return {
    stop() {
      clearInterval(timer)
    },
  }
}

function publishFinalDraftProgress(
  context: FinalDraftProgressContext & {
    now: number
    onProgress?: (event: FinalDraftRunnerProgressEvent) => void
    label?: string
  },
): void {
  const task = context.state.task
  if (context.recordSample) {
    context.telemetry.record({ at: context.now, chars: context.state.streamedText.length })
    context.state.lastStreamActivityAt = context.now
  }
  const telemetrySnapshot = context.telemetry.snapshot({
    at: context.now,
    targetChars: activeSegmentTargetChars(task),
  })
  const telemetry = {
    tenSecondCharsPerSecond: telemetrySnapshot.tenSecondCharsPerSecond,
    sixtySecondCharsPerSecond: telemetrySnapshot.sixtySecondCharsPerSecond,
    throughputStatus: telemetrySnapshot.status,
    estimatedRemainingMs: telemetrySnapshot.estimatedRemainingMs,
  }
  const shouldAddEvent = context.recordSample
    ? context.now - context.lastEventAt.value >= 1000
    : true
  if (shouldAddEvent && context.recordSample) context.lastEventAt.value = context.now
  if (shouldAddEvent) context.hooks.addEvent({
    type: `final-draft-throughput-${telemetrySnapshot.status}`,
    label: context.label || '终稿流式吞吐',
    level: telemetrySnapshot.status === 'stalled' ? 'warn' : 'info',
    detail: JSON.stringify({
      taskId: task.taskId,
      activeSegmentIndex: task.activeSegmentIndex,
      streamingChars: context.state.streamedText.length,
      ...telemetry,
    }),
    payload: {
      taskId: task.taskId,
      activeSegmentIndex: task.activeSegmentIndex,
      streamingChars: context.state.streamedText.length,
      ...telemetry,
    },
  })
  context.onProgress?.({
    taskId: task.taskId,
    phase: task.status === 'awaiting_continuation'
      ? 'awaiting_continuation'
      : task.status === 'interrupted'
        ? 'interrupted'
      : task.status === 'writing'
        ? 'writing'
        : task.status === 'completed'
          ? 'completed'
          : 'generating',
    accumulatedChars: context.state.baseStreamText.length + context.state.streamedText.length,
    continuationCount: task.continuationCount,
    streamingChars: context.state.streamedText.length,
    lastStreamActivityAt: context.recordSample
      ? context.now
      : context.state.lastStreamActivityAt,
    activeSegmentIndex: task.activeSegmentIndex,
    telemetry,
  })
}

function wrapAiService(
  aiService: Pick<AiService, 'callAi'>,
  hooks: FinalDraftTraceHooks,
  activeCallId: { current?: string },
  model?: string,
  providerId?: string,
): Pick<AiService, 'callAi'> {
  return {
    callAi: async (request: CallAiParams): Promise<CallAiResult> => {
      const callId = hooks.startApiCall({
        skillName: '终稿生成',
        requestMessages: request.messages.map(message => ({
          role: String(message.role || ''),
          content: String(message.content || ''),
        })),
        model: request.model || model,
        intent: 'generate',
        toolSurface: [],
        actualToolSurface: [],
      })
      activeCallId.current = callId
      const startedAt = Date.now()
      const canceled = () => Boolean(request.cancelSignal?.aborted || request.signal?.aborted)
      try {
        const result = await aiService.callAi({
          ...request,
          providerId: request.providerId || providerId,
          onPhysicalCall: event => hooks.recordPhysicalCall(callId, event),
          onProviderQueue: event => hooks.recordProviderQueue(callId, event),
          onChunk: request.onChunk,
          onReasoning: text => {
            hooks.appendReasoning(callId, text)
            request.onReasoning?.(text)
          },
          onUsage: request.onUsage,
        })
        hooks.finishApiCall(callId, {
          status: 'success',
          responseText: result.text || '',
          reasoningText: result.reasoning || '',
          finishReason: result.finishReason,
          usage: result.usage,
          usageUnavailable: result.usageUnavailable,
          durationMs: result.durationMs ?? (Date.now() - startedAt),
          maxTokens: result.maxTokens ?? null,
        })
        return result
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const slowStreamInterrupted = error instanceof Error
          && (error as { code?: string }).code === 'slow_stream_interrupted'
        hooks.finishApiCall(callId, {
          status: canceled() ? 'canceled' : slowStreamInterrupted ? 'degraded' : 'failed',
          error: message,
          durationMs: Date.now() - startedAt,
        })
        throw error
      }
    },
  }
}

export async function continueFinalDraftTask(
  input: FinalDraftContinueInput,
  hooks: FinalDraftTraceHooks,
): Promise<FinalDraftTask> {
  hooks.addEvent({
    type: 'final-draft-continuation-requested',
    label: '请求继续生成终稿',
    detail: JSON.stringify({
      taskId: input.task.taskId,
      status: input.task.status,
      accumulatedChars: input.task.accumulatedText.length,
      continuationCount: input.task.continuationCount,
    }),
    payload: {
      taskId: input.task.taskId,
      accumulatedChars: input.task.accumulatedText.length,
      continuationCount: input.task.continuationCount,
    },
  })
  const activeCallId: { current?: string } = {}
  const progressState = {
    task: input.task,
    baseStreamText: input.task.accumulatedText,
    streamedText: '',
    lastStreamActivityAt: Date.now(),
  }
  const taskPublisher = createFinalDraftTaskPublisher(task => input.onTaskChange?.(task))
  const taskChangedOnStream = () => {
    const current = {
      ...progressState.task,
      accumulatedText: progressState.baseStreamText + progressState.streamedText,
      updatedAt: Date.now(),
    }
    progressState.task = current
    taskPublisher.publish(current)
  }
  const telemetry = createFinalDraftThroughputTracker()
  const lastEventAt = { value: 0 }
  const lastMessageTelemetryStatus = { value: input.task.lastTelemetry?.throughputStatus }
  const heartbeat = startFinalDraftHeartbeat({
    hooks,
    state: progressState,
    telemetry,
    lastEventAt: { value: 0 },
    onProgress: event => {
      input.onProgress?.(event)
      updateTaskTelemetry(progressState, event, lastMessageTelemetryStatus, input.onTaskChange)
    },
    checkpointStore: input.checkpointStore,
  })
  try {
    return await continueFinalDraft(
    {
      aiService: wrapAiService(input.aiService, hooks, activeCallId, input.model, input.providerId),
      adapter: input.adapter,
      task: input.task,
    },
    {
      signal: input.signal,
      cancelSignal: input.cancelSignal,
      onTaskChange: changed => {
        const previous = progressState.task
        progressState.task = changed
        if (previous !== changed) {
          progressState.baseStreamText = changed.accumulatedText
          progressState.streamedText = ''
        }
        if (
          previous.activeSegmentIndex !== changed.activeSegmentIndex
          || (previous.status !== 'generating' && changed.status === 'generating')
          || changed.status === 'awaiting_continuation'
          || changed.status === 'interrupted'
        ) {
          void persistCheckpoint(hooks, changed, input.checkpointStore)
        }
        taskPublisher.publish(changed)
      },
      onTaskEvent: input.onTaskEvent,
      onProgress: event => {
        input.onProgress?.(event)
        updateTaskTelemetry(progressState, event, lastMessageTelemetryStatus, input.onTaskChange)
      },
      onSlowStreamInterrupted: partialText => {
        // Preserve the continuation stream that the service reducer has not merged yet.
        restoreLivePartialStream(progressState, partialText + progressState.streamedText)
        taskPublisher.flush(progressState.task)
        void persistCheckpoint(hooks, progressState.task, input.checkpointStore)
        return progressState.task.accumulatedText
      },
      onChunk: text => {
        hooks.appendStream(text)
        progressState.streamedText += text
        taskChangedOnStream()
        publishFinalDraftProgress({
          hooks,
          state: progressState,
          telemetry,
          lastEventAt,
          recordSample: true,
          now: Date.now(),
          label: '终稿续生成吞吐',
          onProgress: event => input.onProgress?.(event),
        })
      },
      onPhysicalCall: event => hooks.recordPhysicalCall(activeCallId.current, event),
    })
  } finally {
    heartbeat.stop()
    taskPublisher.flush(publishableFinalDraftTask(progressState.task))
  }
}

export async function retryFinalDraftSegmentTask(
  input: FinalDraftRetrySegmentInput,
  hooks: FinalDraftTraceHooks,
): Promise<FinalDraftTask> {
  if (input.providerSwitch && input.providerId) {
    hooks.addEvent({
      type: 'final-draft-provider-switch',
      label: '终稿停滞换路：本次重试改用指定供应商',
      level: 'warn',
      detail: JSON.stringify({
        taskId: input.task.taskId,
        activeSegmentIndex: input.task.activeSegmentIndex,
        completedChars: input.task.completedText.length,
        accumulatedChars: input.task.accumulatedText.length,
        beforeProviderId: input.providerSwitch.fromProviderId || null,
        beforeProviderName: input.providerSwitch.fromProviderName || null,
        beforeModel: input.providerSwitch.fromModel || null,
        afterProviderId: input.providerSwitch.toProviderId || input.providerId,
        afterProviderName: input.providerSwitch.toProviderName || null,
        afterModel: input.providerSwitch.toModel || input.model || null,
        beforeTelemetry: input.providerSwitch.beforeTelemetry || input.task.lastTelemetry || null,
      }),
      payload: {
        taskId: input.task.taskId,
        activeSegmentIndex: input.task.activeSegmentIndex,
        beforeProviderId: input.providerSwitch.fromProviderId || null,
        afterProviderId: input.providerSwitch.toProviderId || input.providerId,
        beforeModel: input.providerSwitch.fromModel || null,
        afterModel: input.providerSwitch.toModel || input.model || null,
        beforeTelemetry: input.providerSwitch.beforeTelemetry || input.task.lastTelemetry || null,
      },
    })
  }
  hooks.addEvent({
    type: 'final-draft-segment-user-retry-requested',
    label: '请求重试当前终稿分段',
    detail: JSON.stringify({
      taskId: input.task.taskId,
      status: input.task.status,
      activeSegmentIndex: input.task.activeSegmentIndex,
      completedChars: input.task.completedText.length,
      accumulatedChars: input.task.accumulatedText.length,
    }),
    payload: {
      taskId: input.task.taskId,
      activeSegmentIndex: input.task.activeSegmentIndex,
      completedChars: input.task.completedText.length,
      accumulatedChars: input.task.accumulatedText.length,
    },
  })
  const activeCallId: { current?: string } = {}
  const progressState = {
    task: input.task,
    baseStreamText: input.task.accumulatedText,
    streamedText: '',
    lastStreamActivityAt: Date.now(),
  }
  const taskPublisher = createFinalDraftTaskPublisher(task => input.onTaskChange?.(task))
  const telemetry = createFinalDraftThroughputTracker()
  const lastEventAt = { value: 0 }
  const lastMessageTelemetryStatus = { value: input.task.lastTelemetry?.throughputStatus }
  const heartbeat = startFinalDraftHeartbeat({
    hooks,
    state: progressState,
    telemetry,
    lastEventAt: { value: 0 },
    onProgress: event => {
      input.onProgress?.(event)
      updateTaskTelemetry(progressState, event, lastMessageTelemetryStatus, input.onTaskChange)
    },
    checkpointStore: input.checkpointStore,
  })
  try {
    return await retryFinalDraftSegment(
      {
        aiService: wrapAiService(input.aiService, hooks, activeCallId, input.model, input.providerId),
        adapter: input.adapter,
        task: input.task,
      },
      {
        signal: input.signal,
        cancelSignal: input.cancelSignal,
        onTaskChange: changed => {
        const previous = progressState.task
        progressState.task = changed
        if (previous !== changed) {
          progressState.baseStreamText = changed.accumulatedText
          progressState.streamedText = ''
          }
          if (
            previous.activeSegmentIndex !== changed.activeSegmentIndex
            || (previous.status !== 'generating' && changed.status === 'generating')
            || changed.status === 'awaiting_continuation'
            || changed.status === 'interrupted'
          ) {
            void persistCheckpoint(hooks, changed, input.checkpointStore)
          }
          taskPublisher.publish(changed)
        },
        onTaskEvent: input.onTaskEvent,
        onProgress: event => {
          input.onProgress?.(event)
          updateTaskTelemetry(progressState, event, lastMessageTelemetryStatus, input.onTaskChange)
        },
      onSlowStreamInterrupted: partialText => {
        // Keep the live partial stream for the same reason as generation.
        restoreLivePartialStream(progressState, partialText + progressState.streamedText)
        taskPublisher.flush(progressState.task)
        void persistCheckpoint(hooks, progressState.task, input.checkpointStore)
        return progressState.task.accumulatedText
      },
      onChunk: text => {
        hooks.appendStream(text)
        progressState.streamedText += text
        const current = {
          ...progressState.task,
          accumulatedText: progressState.baseStreamText + progressState.streamedText,
          updatedAt: Date.now(),
        }
        progressState.task = current
        taskPublisher.publish(current)
        publishFinalDraftProgress({
            hooks,
            state: progressState,
            telemetry,
            lastEventAt,
            recordSample: true,
            now: Date.now(),
            label: '终稿分段重试吞吐',
            onProgress: event => input.onProgress?.(event),
          })
        },
        onPhysicalCall: event => hooks.recordPhysicalCall(activeCallId.current, event),
        onProviderQueue: event => hooks.recordProviderQueue(activeCallId.current, event),
      },
    )
  } finally {
    heartbeat.stop()
    taskPublisher.flush(publishableFinalDraftTask(progressState.task))
  }
}

export async function resumeFinalDraftTask(
  input: FinalDraftResumeInput,
  hooks: FinalDraftTraceHooks,
): Promise<FinalDraftTask> {
  const loaded = await loadFinalDraftCheckpoint(input.checkpointId, input.checkpointStore)
  if (!loaded.ok) {
    hooks.addEvent({
      type: 'final-draft-resume-rejected',
      label: '终稿恢复被拒绝',
      level: 'warn',
      detail: JSON.stringify({ checkpointId: input.checkpointId, reason: loaded.reason }),
      payload: { checkpointId: input.checkpointId, reason: loaded.reason },
    })
    throw new Error(`final_draft_resume_failed:${loaded.reason}`)
  }
  const restored = restoreFinalDraftTaskFromCheckpoint(loaded.checkpoint, input.sourceContent)
  if (!restored.ok) {
    hooks.addEvent({
      type: 'final-draft-resume-rejected',
      label: '终稿恢复被拒绝',
      level: 'warn',
      detail: JSON.stringify({
        checkpointId: input.checkpointId,
        taskId: loaded.checkpoint.taskId,
        reason: restored.reason,
      }),
      payload: {
        checkpointId: input.checkpointId,
        taskId: loaded.checkpoint.taskId,
        reason: restored.reason,
      },
    })
    throw new Error(`final_draft_resume_failed:${restored.reason}`)
  }
  hooks.addEvent({
    type: 'final-draft-resume-started',
    label: '终稿从分段检查点恢复',
    detail: JSON.stringify({
      taskId: restored.task.taskId,
      checkpointId: input.checkpointId,
      activeSegmentIndex: restored.task.activeSegmentIndex,
      completedChars: restored.task.completedText.length,
      status: restored.task.status,
    }),
    payload: {
      taskId: restored.task.taskId,
      checkpointId: input.checkpointId,
      activeSegmentIndex: restored.task.activeSegmentIndex,
      completedChars: restored.task.completedText.length,
      status: restored.task.status,
    },
  })
  const progressState = {
    task: restored.task,
    baseStreamText: restored.task.accumulatedText,
    streamedText: '',
    lastStreamActivityAt: Date.now(),
  }
  const activeCallId: { current?: string } = {}
  const taskPublisher = createFinalDraftTaskPublisher(task => input.onTaskChange?.(task))
  const telemetry = createFinalDraftThroughputTracker()
  const lastEventAt = { value: 0 }
  const lastMessageTelemetryStatus = { value: restored.task.lastTelemetry?.throughputStatus }
  const heartbeat = startFinalDraftHeartbeat({
    hooks,
    state: progressState,
    telemetry,
    lastEventAt: { value: 0 },
    onProgress: event => {
      input.onProgress?.(event)
      updateTaskTelemetry(progressState, event, lastMessageTelemetryStatus, input.onTaskChange)
    },
    checkpointStore: input.checkpointStore,
  })
  try {
    return await generateFinalDraft(
    {
      aiService: wrapAiService(input.aiService, hooks, activeCallId, input.model, input.providerId),
      adapter: input.adapter,
      task: restored.task,
      sourceContent: input.sourceContent,
    },
    {
      signal: input.signal,
      cancelSignal: input.cancelSignal,
      onTaskChange: changed => {
        const previous = progressState.task
        progressState.task = changed
        if (previous !== changed) {
          progressState.baseStreamText = changed.accumulatedText
          progressState.streamedText = ''
        }
        if (
          previous.activeSegmentIndex !== changed.activeSegmentIndex
          || (previous.status !== 'generating' && changed.status === 'generating')
          || changed.status === 'awaiting_continuation'
          || changed.status === 'interrupted'
        ) {
          void persistCheckpoint(hooks, changed, input.checkpointStore)
        }
        taskPublisher.publish(changed)
      },
      onTaskEvent: input.onTaskEvent,
      onSlowStreamInterrupted: partialText => {
        // A resumed partial segment must keep its live stream when interrupted.
        restoreLivePartialStream(progressState, partialText + progressState.streamedText)
        taskPublisher.flush(progressState.task)
        void persistCheckpoint(hooks, progressState.task, input.checkpointStore)
        return progressState.task.accumulatedText
      },
      resumePartialSegment: true,
      onProgress: event => {
        input.onProgress?.(event)
        updateTaskTelemetry(progressState, event, lastMessageTelemetryStatus, input.onTaskChange)
      },
      onChunk: text => {
        hooks.appendStream(text)
        progressState.streamedText += text
        const current = {
          ...progressState.task,
          accumulatedText: progressState.baseStreamText + progressState.streamedText,
          updatedAt: Date.now(),
        }
        progressState.task = current
        taskPublisher.publish(current)
        publishFinalDraftProgress({
          hooks,
          state: progressState,
          telemetry,
          lastEventAt,
          recordSample: true,
          now: Date.now(),
          label: '终稿恢复吞吐',
          onProgress: event => input.onProgress?.(event),
        })
      },
      onPhysicalCall: event => hooks.recordPhysicalCall(activeCallId.current, event),
      onProviderQueue: event => hooks.recordProviderQueue(activeCallId.current, event),
    })
  } finally {
    heartbeat.stop()
    taskPublisher.flush(publishableFinalDraftTask(progressState.task))
  }
}

export function createFinalDraftStatusMessage(task: FinalDraftTask): string {
  switch (task.status) {
    case 'planning':
      return '终稿任务已创建，正在准备生成。'
    case 'generating':
      return `正在生成终稿：已输出 ${task.accumulatedText.length} 字。`
    case 'awaiting_continuation':
      return `终稿已生成 ${task.accumulatedText.length} 字，模型单次输出截断，可继续生成。`
    case 'interrupted':
      return `终稿流式中断：已输出 ${task.accumulatedText.length} 字。可重试当前段或换供应商继续，已完成分段不会重做。`
    case 'writing':
      return '终稿校验通过，正在写入编辑器。'
    case 'completed':
      return `终稿已写入编辑器：源文 ${task.sourceContent.length} 字，终稿 ${
        (task.completedText || task.accumulatedText).length
      } 字，续生成 ${task.continuationCount} 次。`
    case 'failed':
      return `终稿任务失败：${task.error || '未知错误'}`
    case 'rolled_back':
      return `终稿未写入，已回滚：${task.error || '未知原因'}`
    case 'canceled':
      return '终稿任务已取消，编辑器内容未被修改。'
    default:
      return '终稿任务状态未知。'
  }
}

export function finalDraftStatusNeedsAction(task: FinalDraftTask): boolean {
  return task.status === 'awaiting_continuation' || task.status === 'interrupted'
}

export function finalDraftSourceHash(content: string): string {
  return hashContent(content)
}
