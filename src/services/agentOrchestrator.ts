import type { CallAiParams, CallAiResult } from './aiService'
import { judgeConvergenceText } from './aiService'
import { estimateInputTokens } from './contextBudget'
import type { AgentToolDefinition, ToolResult } from './editorTools'
import type { LongDocumentOperationType } from './longDocumentPolicy'
import type { LongDocumentExecutionPlan } from './longDocumentExecutionPlanner'
import {
  collectLongDocumentWriteCoverage,
  summarizeLongDocumentWriteCoverage,
} from './longDocumentWriteCoverage'
import {
  findAgentToolNameConflicts,
  removeConflictingExternalTools,
} from './agentToolConflict'
import { sanitizeSkillGuidance } from './skillGuidanceSanitizer'

export type AgentOrchestratorStatus =
  | 'planning'
  | 'running'
  | 'waiting_tool'
  | 'waiting_user'
  | 'completed'
  | 'stalled'
  | 'needs_user'
  | 'failed'
  | 'canceled'

export const AGENT_ORCHESTRATOR_TERMINAL_STATUSES: readonly AgentOrchestratorStatus[] = [
  'completed',
  'stalled',
  'needs_user',
  'failed',
  'canceled',
]

export interface AgentOrchestratorPlanStep {
  id: string
  description: string
  requiredTools?: string[]
}

export interface AgentOrchestratorPlan {
  goal: string
  steps: AgentOrchestratorPlanStep[]
  completionCriteria: string[]
  failureCriteria?: string[]
  allowNoHardTimeout?: boolean
}

export interface AgentOrchestratorEvent {
  type:
    | 'state'
    | 'plan'
    | 'tool'
    | 'no_progress'
    | 'physical_request_limit'
    | 'repeated_call'
    | 'pseudo_tool'
    | 'interactive_response'
    | 'idle_timeout'
    | 'error'
    | 'tool_conflict'
    | 'plan-origin'
    | 'skill-guidance-injected'
    | 'skill-guidance-sanitized'
  level: 'info' | 'warning' | 'error'
  label: string
  detail?: string
  payload?: unknown
}

export interface AgentOrchestratorSnapshot {
  taskId: string
  status: AgentOrchestratorStatus
  reason?: string
  goal: string
  stepIndex: number
  callCount: number
  successfulWriteCount: number
  noProgressRounds: number
  repeatedCallCount: number
  maxPhysicalRequests: number
  updatedAt: number
}

export interface AgentOrchestratorTaskResult {
  taskId: string
  status: AgentOrchestratorStatus
  reason?: string
  text: string
  result?: CallAiResult
  toolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
  events: AgentOrchestratorEvent[]
  snapshot: AgentOrchestratorSnapshot
}

export interface AgentOrchestratorToolObservation {
  toolName: string
  policy: 'read' | 'write'
  iteration: number
  input: unknown
  result: ToolResult
}

export interface AgentOrchestratorRoundVerdict {
  progress: boolean
  complete?: boolean
  needsUser?: string
  reason?: string
}

export type AgentOrchestratorRunInput = Omit<CallAiParams, 'tools'> & {
  tools?: AgentToolDefinition[]
}

export interface AgentOrchestratorRuntime {
  goal?: string
  skillGuidance?: string
  skillIds?: string[]
  promptSource?: string
  callAi: (params: CallAiParams) => Promise<CallAiResult>
  persistState?: (snapshot: AgentOrchestratorSnapshot) => void | Promise<void>
  onEvent?: (event: AgentOrchestratorEvent, snapshot: AgentOrchestratorSnapshot) => void
  evaluateRound?: (result: CallAiResult) => AgentOrchestratorRoundVerdict
  observeToolCall?: (event: AgentOrchestratorToolObservation) => void
  getContextRemaining?: (input: { messages: CallAiParams['messages'] }) => {
    contextWindowTokens?: number | null
    maxOutputTokens?: number | null
  }
  document?: {
    content: string
    operationType?: LongDocumentOperationType
    executionPlan?: LongDocumentExecutionPlan
  }
  editTaskWorkflow?: boolean
  maxNoProgressRounds?: number
  maxPhysicalRequests?: number
  idleTimeoutMs?: number
}

const DEFAULT_MAX_NO_PROGRESS_ROUNDS = 3
const DEFAULT_MAX_PHYSICAL_REQUESTS = 8
const STATE_TRANSITIONS: Record<AgentOrchestratorStatus, AgentOrchestratorStatus[]> = {
  planning: ['running', 'failed', 'canceled'],
  running: [
    'waiting_tool',
    'waiting_user',
    'completed',
    'stalled',
    'needs_user',
    'failed',
    'canceled',
  ],
  waiting_tool: ['running', 'stalled', 'needs_user', 'failed', 'canceled'],
  waiting_user: ['running', 'needs_user', 'canceled'],
  completed: [],
  stalled: [],
  needs_user: [],
  failed: [],
  canceled: [],
}

function isTerminal(status: AgentOrchestratorStatus): boolean {
  return AGENT_ORCHESTRATOR_TERMINAL_STATUSES.includes(status)
}

function stableSignature(value: unknown): string {
  const sortValue = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(sortValue)
    if (item && typeof item === 'object') {
      return Object.keys(item as Record<string, unknown>)
        .sort()
        .reduce((output, key) => {
          output[key] = sortValue((item as Record<string, unknown>)[key])
          return output
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

function defaultEvaluateRound(result: CallAiResult): AgentOrchestratorRoundVerdict {
  const hasText = Boolean(String(result.text || '').trim())
  const hasSuccessfulWrite = (result.toolResults || []).some(item =>
    item.result.ok && String(item.call.name).startsWith('editor.write'))
  const needsUser = (result.toolResults || []).some(item =>
    item.result.error?.code === 'needs_user')
  if (needsUser) {
    const message = (result.toolResults || []).find(item =>
      item.result.error?.code === 'needs_user')?.result.error?.message
    return { progress: true, needsUser: message || '任务需要用户补充信息' }
  }
  return {
    progress: hasText || hasSuccessfulWrite,
    complete: hasText,
  }
}

function evaluateWriteTaskRound(input: {
  result: CallAiResult
  plan: LongDocumentExecutionPlan
  successfulWriteCount: number
  coverageRecords: ReturnType<typeof collectLongDocumentWriteCoverage>
}): AgentOrchestratorRoundVerdict {
  const text = String(input.result.text || '').trim()
  const toolResults = input.result.toolResults || []
  const hasSuccessfulWrite = toolResults.some(item =>
    item.result.ok && String(item.call.name).startsWith('editor.write'))
  const hasLegacyPreview = text.startsWith('【修改预览】') || text.includes('等待确认')
  if (hasLegacyPreview && !hasSuccessfulWrite) {
    return {
      progress: false,
      complete: false,
      reason: 'legacy_preview_response',
    } as AgentOrchestratorRoundVerdict
  }
  if (!hasSuccessfulWrite && input.successfulWriteCount === 0 && text) {
    return {
      progress: true,
      complete: false,
      reason: 'write_not_executed',
    } as AgentOrchestratorRoundVerdict
  }
  const coverage = summarizeLongDocumentWriteCoverage({
    plan: input.plan,
    coverageRecords: input.coverageRecords,
    toolResults: input.result.toolResults,
  })
  if (!coverage.complete) {
    return {
      progress: true,
      complete: false,
      reason: 'partially_applied',
    } as AgentOrchestratorRoundVerdict
  }
  return { progress: true, complete: true }
}

function isTerminalWriteConvergence(result: CallAiResult): boolean {
  // aiService and the shared budget are the only authorities that can stop a
  // physical dispatch. Once either emits a terminal verdict, the orchestrator
  // must consume it instead of dispatching another request.
  if (result.finishReason === 'physical_request_budget_exhausted') return true
  if (result.finishReason === 'incomplete_write_coverage_checkpoint') return true
  if (result.finishReason === 'needs_user_handoff') return true
  if (result.finishReason === 'legacy_preview_response') return true
  if (result.finishReason !== 'tool_converged' && result.finishReason !== 'tool_converged_local') {
    return false
  }
  return String(result.convergenceReason || '').startsWith('terminal write failure:')
}

export function createContextRemainingTool(
  getSnapshot: () => AgentOrchestratorSnapshot,
  getContextRemaining: () => { contextWindowTokens?: number | null; estimatedInputTokens?: number | null },
): AgentToolDefinition {
  return {
    name: 'context.remaining',
    description: '读取当前任务状态与上下文水位。上下文未知时保持 unknown，不合成假窗口。',
    policy: 'read',
    defaultToolPolicy: 'allowedWithoutPermission',
    riskLevel: 'low',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async execute() {
      const context = getContextRemaining()
      return {
        ok: true,
        data: {
          task: getSnapshot(),
          contextWindowTokens: context.contextWindowTokens ?? null,
          estimatedInputTokens: context.estimatedInputTokens ?? null,
          contextWindowKnown: typeof context.contextWindowTokens === 'number',
        },
      }
    },
  }
}

function resolveRuntimeContextRemaining(
  runtime: AgentOrchestratorRuntime,
  messages: CallAiParams['messages'],
): { contextWindowTokens?: number | null; estimatedInputTokens?: number | null } {
  const supplied = runtime.getContextRemaining?.({ messages })
  const contextWindowTokens = supplied?.contextWindowTokens
  const hasDeclaredWindow = typeof contextWindowTokens === 'number'
    && Number.isFinite(contextWindowTokens)
    && contextWindowTokens > 0
  const estimatedInputTokens = estimateInputTokens(messages)
  return {
    contextWindowTokens: hasDeclaredWindow ? Math.floor(contextWindowTokens as number) : null,
    estimatedInputTokens,
  }
}

function shouldRouteAwayFromDirectToolsBeforeRun(input: {
  runtime: AgentOrchestratorRuntime
  messages: CallAiParams['messages']
  planGoal: string
}): {
  editTask: boolean
  finalDraft: boolean
  reason: string
  operationType?: LongDocumentOperationType
  fallbackEvent?: Pick<AgentOrchestratorEvent, 'payload'>
} {
  const document = input.runtime.document
  if (input.runtime.editTaskWorkflow) {
    return {
      editTask: false,
      finalDraft: false,
      reason: 'edit-task-workflow-active',
      operationType: document?.operationType,
    }
  }
  if (!document?.content) {
    return { editTask: false, finalDraft: false, reason: 'no-document-target' }
  }
  if (document.operationType === 'discussion') {
    return { editTask: false, finalDraft: false, reason: 'discussion-operation' }
  }
  if (!document.executionPlan) {
    const fallbackEvent = {
      payload: { source: 'agent-fallback', mode: 'readonly-fallback' },
    }
    return {
      editTask: false,
      finalDraft: false,
      reason: 'agent-fallback-readonly',
      operationType: document.operationType,
      fallbackEvent,
    }
  }
  const plan = document.executionPlan
  return {
    editTask: plan.mode === 'edit-task',
    finalDraft: plan.mode === 'final-draft',
    reason: `execution-plan-${plan.operation}:${plan.decision}:${plan.segments.length}batches`,
    operationType: document.operationType,
  }
}

export function createAgentPlanTool(
  getPlan: () => AgentOrchestratorPlan,
): AgentToolDefinition {
  return {
    name: 'agent.plan',
    description: '读取当前任务计划、完成判据与失败判据。',
    policy: 'read',
    defaultToolPolicy: 'allowedWithoutPermission',
    riskLevel: 'low',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async execute() {
      return { ok: true, data: getPlan() }
    },
  }
}

export class AgentOrchestrator {
  private taskId: string
  private status: AgentOrchestratorStatus = 'planning'
  private reason?: string
  private plan: AgentOrchestratorPlan
  private stepIndex = 0
  private callCount = 0
  private successfulWriteCount = 0
  private writeCoverageRecords: ReturnType<typeof collectLongDocumentWriteCoverage> = []
  private noProgressRounds = 0
  private repeatedCallCount = 0
  private maxPhysicalRequests: number
  private lastToolSignature = ''
  private lastRoundToolSignature = ''
  private events: AgentOrchestratorEvent[] = []
  private runtime: AgentOrchestratorRuntime
  private executedToolCalls: AgentOrchestratorToolObservation[] = []
  private runtimeToolCalls: AgentOrchestratorToolObservation[] = []
  private roundToolSignatures = new Set<string>()
  private cancelRequested = false
  private effectiveToolSurface: Array<{ name: string; policy: 'read' | 'write' }> = []
  private sharedPhysicalRequestBudget: (input?: { inCall?: boolean }) => boolean
  private sanitizedSkillGuidance: ReturnType<typeof sanitizeSkillGuidance>

  constructor(input: {
    taskId?: string
    plan: AgentOrchestratorPlan
    runtime: AgentOrchestratorRuntime
  }) {
    this.taskId = input.taskId || `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    this.plan = input.plan
    this.runtime = input.runtime
    this.maxPhysicalRequests = this.normalizeMaxPhysicalRequests(input.runtime.maxPhysicalRequests)
    this.sharedPhysicalRequestBudget = ({ inCall } = {}) => this.callCount
      < this.maxPhysicalRequests - (inCall ? 1 : 0)
    this.sanitizedSkillGuidance = sanitizeSkillGuidance(input.runtime.skillGuidance)
    if (input.runtime.skillGuidance !== undefined) {
      this.emit({
        type: 'skill-guidance-injected',
        level: 'info',
        label: this.sanitizedSkillGuidance.text
          ? 'SKILL guidance 已接入统一执行底座'
          : 'SKILL guidance 无可注入内容',
        payload: {
          skillIds: input.runtime.skillIds || [],
          promptSource: input.runtime.promptSource || 'unknown',
          guidanceChars: input.runtime.skillGuidance.length,
          skillGuidancePresent: input.runtime.skillGuidance.length > 0,
        },
      })
      const sanitized = this.sanitizedSkillGuidance
      if (input.runtime.skillGuidance.trim() && sanitized.removedCategories.length > 0) {
        this.emit({
          type: 'skill-guidance-sanitized',
          level: 'warning',
          label: 'SKILL guidance 已剥离应用执行协议语义',
          detail: 'folder SKILL 仅保留领域能力；执行协议与工具权限由应用单源控制',
          payload: {
            skillIds: input.runtime.skillIds || [],
            promptSource: input.runtime.promptSource || 'unknown',
            originalChars: sanitized.originalChars,
            retainedChars: sanitized.text.length,
            removedChars: sanitized.removedChars,
            removedCategories: sanitized.removedCategories,
          },
        })
      }
    }
    this.emit({
      type: 'plan',
      level: 'info',
      label: '任务计划已建立',
      payload: this.plan,
    })
    void Promise.resolve(this.runtime.persistState?.(this.getSnapshot())).catch(() => {})
  }

  getSnapshot(): AgentOrchestratorSnapshot {
    return {
      taskId: this.taskId,
      status: this.status,
      reason: this.reason,
      goal: this.plan.goal,
      stepIndex: this.stepIndex,
      callCount: this.callCount,
      successfulWriteCount: this.successfulWriteCount,
      noProgressRounds: this.noProgressRounds,
      repeatedCallCount: this.repeatedCallCount,
      maxPhysicalRequests: this.maxPhysicalRequests,
      updatedAt: Date.now(),
    }
  }

  private normalizeMaxPhysicalRequests(value: number | undefined): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return DEFAULT_MAX_PHYSICAL_REQUESTS
    }
    return Math.max(1, Math.floor(value))
  }

  private appendSkillGuidance(messages: CallAiParams['messages']): CallAiParams['messages'] {
    const guidance = this.sanitizedSkillGuidance.text
    if (!guidance) return messages

    const systemIndex = messages.findIndex(message => message.role === 'system')
    if (systemIndex === -1) {
      return [{ role: 'system', content: guidance }, ...messages]
    }

    const nextMessages = [...messages]
    const systemMessage = nextMessages[systemIndex]
    nextMessages[systemIndex] = {
      ...systemMessage,
      content: `${String(systemMessage.content || '').trim()}\n\n${guidance}`.trimStart(),
    }
    return nextMessages
  }

  getPlan(): AgentOrchestratorPlan {
    return this.plan
  }

  getEvents(): AgentOrchestratorEvent[] {
    return [...this.events]
  }

  cancel(reason = 'user_cancel'): boolean {
    if (isTerminal(this.status)) return false
    this.cancelRequested = true
    this.transition('canceled', reason)
    return true
  }

  private transition(next: AgentOrchestratorStatus, reason?: string): boolean {
    if (isTerminal(this.status)) return false
    if (!STATE_TRANSITIONS[this.status].includes(next)) return false
    this.status = next
    this.reason = reason
    const snapshot = this.getSnapshot()
    this.emit({
      type: 'state',
      level: isTerminal(next) && next !== 'completed' ? 'warning' : 'info',
      label: `任务状态：${next}`,
      detail: reason,
    })
    void Promise.resolve(this.runtime.persistState?.(snapshot)).catch(() => {})
    return true
  }

  private emit(event: AgentOrchestratorEvent): void {
    this.events.push(event)
    this.runtime.onEvent?.(event, this.getSnapshot())
  }

  private createIdleSupervisor(timeoutMs: number): {
    start: () => void
    stop: () => void
    triggered: () => boolean
  } {
    let timer: ReturnType<typeof setTimeout> | null = null
    let triggered = false
    return {
      start: () => {
        if (timer || timeoutMs <= 0) return
        timer = setTimeout(() => {
          triggered = true
        }, timeoutMs)
      },
      stop: () => {
        if (timer) clearTimeout(timer)
        timer = null
      },
      triggered: () => triggered,
    }
  }

  private recordObservation(observation: AgentOrchestratorToolObservation): boolean {
    this.runtimeToolCalls.push(observation)
    this.runtime.observeToolCall?.(observation)
    const signature = `${observation.toolName}::${stableSignature(observation.input)}`
    const repeatedInRound = this.roundToolSignatures.has(signature)
    this.roundToolSignatures.add(signature)
    if (signature === this.lastToolSignature) {
      this.repeatedCallCount += 1
      this.emit({
        type: 'repeated_call',
        level: 'warning',
        label: '检测到连续相同工具调用',
        detail: observation.toolName,
        payload: { signature, repeatCount: this.repeatedCallCount },
      })
      return true
    }
    this.lastToolSignature = signature
    if (!repeatedInRound) this.repeatedCallCount = 0
    if (observation.result.ok) {
      this.emit({
        type: 'tool',
        level: 'info',
        label: `工具完成：${observation.toolName}`,
        payload: { iteration: observation.iteration },
      })
    }
    return false
  }

  private recordWriteCoverage(result: ToolResult): void {
    if (!result.ok) return
    const record = collectLongDocumentWriteCoverage([{
      call: { name: 'editor.write' },
      result,
    }])[0]
    if (record) this.writeCoverageRecords.push(record)
  }

  async run(input: AgentOrchestratorRunInput): Promise<AgentOrchestratorTaskResult> {
    if (!String(this.plan.goal || '').trim()) {
      this.transition('failed', 'invalid_plan_goal')
      return this.buildResult('')
    }
    if (!Array.isArray(this.plan.steps) || this.plan.steps.length === 0) {
      this.transition('failed', 'invalid_plan_steps')
      return this.buildResult('')
    }
    if (this.cancelRequested || isTerminal(this.status)) {
      return this.buildResult('')
    }

    this.transition('running')
    const directToolRouting = shouldRouteAwayFromDirectToolsBeforeRun({
      runtime: this.runtime,
      messages: input.messages,
      planGoal: this.plan.goal,
    })
    if (directToolRouting.fallbackEvent) {
      this.emit({
        type: 'plan-origin',
        level: 'warning',
        label: '使用降级执行计划',
        detail: '生产链路未传入 document.executionPlan，Agent 降级为只读执行；写入类长文档任务由生产入口重建计划',
        payload: directToolRouting.fallbackEvent.payload,
      })
    }
    if (directToolRouting.editTask) {
      this.transition('needs_user', `edit_task_required:${directToolRouting.reason}`)
      this.emit({
        type: 'state',
        level: 'warning',
        label: '长文档任务自动路由 EditTask',
        detail: directToolRouting.reason,
        payload: directToolRouting,
      })
      return this.buildResult('')
    }
    if (directToolRouting.finalDraft) {
      this.transition('needs_user', `final_draft_required:${directToolRouting.reason}`)
      this.emit({
        type: 'state',
        level: 'info',
        label: '长文档任务自动进入终稿生成',
        detail: directToolRouting.reason,
        payload: directToolRouting,
      })
      return this.buildResult('')
    }


    let tools = [
      ...(input.tools || []),
      createContextRemainingTool(
        () => this.getSnapshot(),
        () => resolveRuntimeContextRemaining(this.runtime, input.messages),
      ),
      createAgentPlanTool(() => this.getPlan()),
    ]
    const toolConflicts = findAgentToolNameConflicts(tools)
    for (const conflict of toolConflicts) {
      this.emit({
        type: 'tool_conflict',
        level: 'warning',
        label: conflict.reason === 'built-in'
          ? `外部工具占用内置工具名：${conflict.toolName}`
          : `外部工具重名：${conflict.toolName}`,
        detail: `offenders=${conflict.offenders.map(item => `${item.source}:${item.index}`).join(',')}`,
        payload: conflict,
      })
    }
    if (toolConflicts.length > 0) {
      tools = removeConflictingExternalTools(tools, toolConflicts)
    }
    this.effectiveToolSurface = tools.map(tool => ({ name: tool.name, policy: tool.policy }))

    const idleTimeoutMs = this.runtime.idleTimeoutMs ?? 0
    const maxNoProgressRounds = this.runtime.maxNoProgressRounds ?? DEFAULT_MAX_NO_PROGRESS_ROUNDS
    const discussionOperation = this.runtime.document?.operationType === 'discussion'
      || this.runtime.document?.executionPlan?.operation === 'discussion'
    let lastResult: CallAiResult | null = null

    while (!isTerminal(this.status)) {
      if (this.cancelRequested) {
        this.transition('canceled', 'user_cancel')
        break
      }

      this.callCount += 1
      this.transition('waiting_tool', 'physical request dispatched')
      const supervisor = this.createIdleSupervisor(idleTimeoutMs)
      supervisor.start()
      this.runtimeToolCalls = []
      this.roundToolSignatures = new Set()
      let result: CallAiResult
      try {
        const callerOnToolCall = input.toolPolicy?.onToolCall
        result = await this.runtime.callAi({
          ...input,
          messages: this.appendSkillGuidance(input.messages),
          tools,
          toolPolicy: {
            ...input.toolPolicy,
            scenario: input.toolPolicy?.scenario || 'direct-tool-intensive',
            ...(this.runtime.document?.executionPlan
              ? { executionPlan: this.runtime.document.executionPlan }
              : {}),
            ...(this.runtime.editTaskWorkflow
              ? { editTaskWorkflow: true }
              : {}),
            consumePhysicalRequestBudget: ({ inCall } = {}) =>
              this.sharedPhysicalRequestBudget({ inCall }),
            onToolCall: event => {
              const repeated = this.recordObservation({
                toolName: event.toolName,
                policy: event.policy,
                iteration: event.iteration,
                input: event.input,
                result: event.result,
              })
              if (event.result.ok && event.policy === 'write') this.successfulWriteCount += 1
              this.recordWriteCoverage(event.result)
              if (repeated) {
                this.transition('stalled', 'repeated_tool_call')
              }
              callerOnToolCall?.(event)
            },
          } as CallAiParams['toolPolicy'],
        })
      } catch (error) {
        supervisor.stop()
        const message = error instanceof Error ? error.message : String(error)
        if (this.cancelRequested) {
          this.transition('canceled', 'user_cancel')
        } else {
          this.transition('failed', message)
          this.emit({
            type: 'error',
            level: 'error',
            label: '任务执行失败',
            detail: message,
          })
        }
        break
      }
      supervisor.stop()
      lastResult = result
      const convergence = judgeConvergenceText({ text: result.text })
      const hasInteractiveResponseText = Boolean(String(result.text || '').trim())
        && convergence.kind !== 'pseudo_tool_call'
      if (hasInteractiveResponseText) {
        this.emit({
          type: 'interactive_response',
          level: 'info',
          label: '模型已给出可回复内容',
          payload: {
            textPreview: String(result.text).slice(0, 500),
            finishReason: result.finishReason || null,
            hasSuccessfulWrite: (result.toolResults || []).some(item =>
              item.result.ok && String(item.call.name).startsWith('editor.write')),
            callCount: this.callCount,
          },
        })
      }
      if (convergence.kind === 'pseudo_tool_call') {
        this.emit({
          type: 'pseudo_tool',
          level: 'warning',
          label: '收口输出疑似伪工具调用',
          detail: convergence.reason,
          payload: { text: convergence.text },
        })
      }
      const observedRuntimeToolCalls = [...this.runtimeToolCalls]
      if (!this.transition('running', 'physical response received')) {
        break
      }

      if (supervisor.triggered()) {
        this.transition('failed', 'idle_timeout')
        this.emit({
          type: 'idle_timeout',
          level: 'error',
          label: '任务空闲超时',
          payload: { idleTimeoutMs },
        })
        break
      }

      const suppliedEvaluator = this.runtime.evaluateRound
      const executionPlan = this.runtime.document?.executionPlan
      if (isTerminalWriteConvergence(result)) {
        const hasSuccessfulWrite = (result.toolResults || []).some(item =>
          item.result.ok && String(item.call.name).startsWith('editor.write'))
        const terminalReason = result.finishReason === 'physical_request_budget_exhausted'
          ? 'physical_request_limit'
                  : result.finishReason === 'incomplete_write_coverage_checkpoint'
                    ? 'partially_applied'
                    : result.finishReason === 'needs_user_handoff'
                      ? 'needs_user'
                      : result.finishReason === 'legacy_preview_response'
                        ? 'legacy_preview_response'
                        : hasSuccessfulWrite || this.successfulWriteCount > 0
                          ? 'partially_applied'
                          : 'write_not_executed'
        if (terminalReason === 'needs_user') {
          this.transition('waiting_user', terminalReason)
        }
        this.transition(terminalReason === 'needs_user' ? 'needs_user' : 'stalled', terminalReason)
        this.emit({
          type: 'tool',
          level: terminalReason === 'needs_user' ? 'info' : 'warning',
          label: result.finishReason === 'physical_request_budget_exhausted'
            ? '物理请求预算耗尽'
            : result.finishReason === 'incomplete_write_coverage_checkpoint'
              ? '写入覆盖不完整'
              : result.finishReason === 'needs_user_handoff'
                ? '模型等待用户回复'
                : result.finishReason === 'legacy_preview_response'
                  ? 'SKILL 旧执行协议残留'
              : '写入任务终局收敛',
          detail: result.convergenceReason
            || 'editor.write 已被应用终态拒绝；保留收敛回复，不再发起物理请求',
          payload: {
            reason: terminalReason,
            finishReason: result.finishReason,
          },
        })
        break
      }
      const verdict = suppliedEvaluator
        ? suppliedEvaluator(result)
        : executionPlan && executionPlan.operation !== 'discussion'
          ? evaluateWriteTaskRound({
            result,
            plan: executionPlan,
            successfulWriteCount: this.successfulWriteCount,
            coverageRecords: this.writeCoverageRecords,
          })
          : defaultEvaluateRound(result)
      const signature = observedRuntimeToolCalls
        .map(item => `${item.toolName}::${stableSignature(item.input)}`)
        .join('|')
      if (signature && signature === this.lastRoundToolSignature) {
        this.repeatedCallCount += 1
        this.emit({
          type: 'repeated_call',
          level: 'warning',
          label: '连续两轮重复同一批工具调用',
          detail: signature,
          payload: { repeatCount: this.repeatedCallCount },
        })
        this.transition('stalled', 'repeated_tool_call')
        break
      }
      if (signature) this.lastRoundToolSignature = signature
      this.executedToolCalls = [...this.executedToolCalls, ...observedRuntimeToolCalls]
      if (verdict.needsUser) {
        this.transition('waiting_user', verdict.needsUser)
        this.transition('needs_user', verdict.needsUser)
        break
      }
      const isDiscussionProgress = discussionOperation
        && Boolean(String(result.text || '').trim())
      if (verdict.reason && !verdict.progress && !isDiscussionProgress) {
        this.emit({
          type: 'no_progress',
          level: 'warning',
          label: `写入任务未完成：${verdict.reason}`,
          payload: { reason: verdict.reason },
        })
      }
      if (verdict.reason && verdict.progress && !verdict.complete) {
        this.emit({
          type: 'tool',
          level: 'warning',
          label: `写入覆盖不足：${verdict.reason}`,
          payload: { reason: verdict.reason },
        })
      }
      if (!verdict.progress && !isDiscussionProgress) {
        this.noProgressRounds += 1
        this.emit({
          type: 'no_progress',
          level: 'warning',
          label: `连续无进展：${this.noProgressRounds}`,
          payload: { maxNoProgressRounds },
        })
        if (this.noProgressRounds >= maxNoProgressRounds) {
          this.transition('stalled', verdict.reason || 'no_progress')
          break
        }
      } else {
        this.noProgressRounds = 0
      }
      if (verdict.complete || (discussionOperation && isDiscussionProgress)) {
        this.transition('completed', 'completion criteria satisfied')
        break
      }
      if (this.callCount >= this.maxPhysicalRequests) {
        this.emit({
          type: 'physical_request_limit',
          level: 'warning',
          label: `物理请求次数达到上限：${this.callCount}/${this.maxPhysicalRequests}`,
          detail: '每轮仍有局部进展，但任务未满足完成条件；停止继续请求，避免长文档工具循环失控',
          payload: {
            callCount: this.callCount,
            maxPhysicalRequests: this.maxPhysicalRequests,
            successfulWriteCount: this.successfulWriteCount,
          },
        })
        this.transition('stalled', verdict.reason || 'physical_request_limit')
        break
      }
      if (this.plan.steps[this.stepIndex + 1]) {
        this.stepIndex += 1
      }
    }

    if (!isTerminal(this.status)) {
      this.transition('stalled', 'unresolved_non_terminal_state')
    }
    return this.buildResult(lastResult?.text || '', lastResult || undefined)
  }

  private buildResult(text: string, result?: CallAiResult): AgentOrchestratorTaskResult {
    return {
      taskId: this.taskId,
      status: this.status,
      reason: this.reason,
      text,
      result,
      toolSurface: [...this.effectiveToolSurface],
      events: [...this.events],
      snapshot: this.getSnapshot(),
    }
  }
}
