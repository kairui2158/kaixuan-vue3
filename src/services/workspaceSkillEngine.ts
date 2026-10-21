import type {
  ContextBundle,
  ContextMessage,
  ContextPolicy,
  ContextRef,
  ContextTurn,
  ContextWorkspaceState,
} from '../types/context'
import type {
  AiService,
  CallAiParams,
  CallAiResult,
  PhysicalCallEvent,
} from './aiService'
import { type ApiCallBudget, createApiCallBudget } from './apiCallBudget'
import {
  type ChainBreakpoint,
  createChainFailureBreakpoint,
  createChainSuccessBreakpoint,
  getChainResumePoint,
} from './chainBreakpoint'
import {
  buildChainSkillPrompt,
  detectChainOutputEcho,
  getChainEchoWarningLevel,
  templateReferencesPreviousOutput,
} from './chainExecution'
import {
  describeChainHandoffEvent,
  makeChainHandoffArtifact,
} from './chainHandoff'
import {
  type ChainIntent,
  type ChainIntentHistoryMessage,
  classifyChainIntent,
  filterTemplatesByIntent,
  routeChainIntentDetailed,
  routeChainIntent,
  type ChainRoutingContext,
  type ChainRoutingDiagnostics,
  type ChainRoutingResult,
  type DetailedChainRoutingResult,
} from './chainIntentRouter'
import type {
  ContextBuildInput,
  ConversationContextService,
} from './conversationContextService'
import type { AgentToolDefinition } from './editorTools'
import { hashEditorContent } from './editorTarget'
import type {
  RealSkillExecuteOptions,
  RealSkillPostProcessReport,
  RealSkillExecutionResult,
} from './realSkillTypes'
import { formatSkillFallback, type RoutedSkill, routeSkill } from './skillRouter'
import {
  acceptWorkspaceArtifact,
  type WorkspaceArtifactAcceptanceResult,
  type WorkspaceArtifactContract,
} from './workspaceArtifactAcceptance'
export type { WorkspaceArtifactContract } from './workspaceArtifactAcceptance'
import {
  authorizeDialogueTools,
  type DialogueToolSurfaceTaskContext,
  type DialogueWriteAuthorization,
} from './dialogueToolSurface'
import type { EditTask } from './editTaskService'
import type { LongDocumentExecutionPlan } from './longDocumentExecutionPlanner'
import {
  getSkillMaxAttempts,
  type JsonSchema,
  type SkillRetryPolicy,
  validateSkillInput,
  validateSkillOutput,
  validateSkillRules,
} from './skillValidation'

export type WorkspaceSkillMode = 'chain' | 'compose'

export type RoutingAwaitState = {
  runId: string
  requestText: string
  candidates: string[]
  fallbackMode: string
  createdAt: number
  resumeToken: string
}

export function buildRoutingResumeToken(input: {
  runId: string
  requestText: string
  createdAt: number
}): string {
  return hashEditorContent(
    `${input.runId}\n${input.requestText}\n${input.createdAt}`,
  )
}

export function createRoutingAwaitState(input: {
  runId: string
  requestText: string
  routing?: ChainRoutingResult
}): RoutingAwaitState {
  const createdAt = Date.now()
  return {
    runId: input.runId,
    requestText: input.requestText,
    candidates:
      input.routing?.kind === 'ambiguous' ? [...input.routing.candidates] : [],
    fallbackMode:
      (input.routing && 'fallbackMode' in input.routing
        ? String(input.routing.fallbackMode)
        : 'await-user') || 'await-user',
    createdAt,
    resumeToken: buildRoutingResumeToken({
      runId: input.runId,
      requestText: input.requestText,
      createdAt,
    }),
  }
}

export function validateRoutingResumeToken(
  state:
    | Partial<
        Pick<
          RoutingAwaitState,
          'runId' | 'requestText' | 'createdAt' | 'resumeToken'
        >
      >
    | null
    | undefined,
  expectedRunId: string | null | undefined,
): boolean {
  if (!state?.runId || !state.resumeToken || !expectedRunId) return false
  if (state.runId !== expectedRunId) return false
  return (
    state.resumeToken ===
    buildRoutingResumeToken({
      runId: state.runId,
      requestText: state.requestText || '',
      createdAt: state.createdAt || 0,
    })
  )
}

export type WorkspaceSkillToolAccess = 'read' | 'write'

export type WorkspaceSkillTemplate = {
  id: string
  name: string
  version?: string
  template: string
  skill?: RoutedSkill
  customVars?: Record<string, unknown>
  injectMode?: string
  outputFormat?: 'json' | 'text'
  validationRules?: string[]
  inputSchema?: JsonSchema | string
  outputSchema?: JsonSchema | string
  retryPolicy?: SkillRetryPolicy | string
  intents?: string[]
}

export type WorkspacePromptParts = {
  systemSkill?: string
  userPrefix?: string
  userSuffix?: string
}

export type WorkspaceAgentConfig = {
  provider?: string
  model?: string
  temperature?: number
  /** null means the request intentionally omitted the output limit. */
  maxTokens?: number | null
  systemPrompt?: string
}

export type WorkspaceProviderConfig = {
  id?: string
  selectedModel?: string
  models?: string[]
  temperature?: number
  /** null means the request intentionally omitted the output limit. */
  maxTokens?: number | null
}

export type WorkspaceContextOptions = {
  requestText: string
  previousSkillOutput?: string
  previousOutputOwnership?: 'user_prompt' | 'context_block'
  includeHistory?: boolean
  intent?: ChainIntent
  stage?: number
  mode?: WorkspaceSkillMode
}

export type WorkspaceSkillToolRequest = {
  intent: ChainIntent
  stage: number
  mode: WorkspaceSkillMode
  requestText: string
}

type AuthorizedWorkspaceToolSurface = {
  tools: AgentToolDefinition[]
  toolPolicy?: CallAiParams['toolPolicy']
  actualToolSurface: Array<{ name: string; policy: 'read' | 'write' }>
  permissionDecision: ReturnType<typeof authorizeDialogueTools>['permissionDecision']
  activeEditTask: EditTask | null
  executionPlan: LongDocumentExecutionPlan | null
}

export type WorkspaceSkillRunMeta = {
  finishReason?: string
  requestMessages: ContextMessage[]
  providerId?: string
  model: string
  agentId?: string
  skillId: string
  status?: 'success' | 'degraded'
  responseText?: string
  reasoningText?: string
  usage?: unknown
  /** null means the request intentionally omitted the output limit. */
  maxTokens?: number | null
  contextBudget?: RealSkillExecutionResult['apiMeta'] extends infer T
    ? T extends { contextBudget?: infer B } ? B : never
    : never
  usageReconciliation?: unknown
  textOrigin?: 'application' | 'model'
  diagnostics?: Array<{
    type: 'info' | 'warning' | 'error'
    code: string
    message: string
    at?: string
  }>
  skillToolDeclarationsIgnored?: number
  budget?: { used: number; limit: number }
  folderPackageCache?: boolean
  postProcessReport?: RealSkillPostProcessReport
  artifactAcceptance?: WorkspaceArtifactAcceptanceResult | null
  toolCalls?: Array<{ name: string; input?: unknown }>
  toolResults?: Array<{ call: { id?: string; name: string; input?: unknown; argumentsRaw?: string }; result: unknown }>
  toolRequestDeltas?: Array<{ role: string; content: string }>
  toolAudit?: unknown
}

export type WorkspaceSkillRunResult = {
  text: string
  meta: WorkspaceSkillRunMeta | null
  terminalStatus?: 'success' | 'success_with_warnings' | 'degraded' | 'blocked'
  terminalReason?: string
  mode: WorkspaceSkillMode
  allMetas?: WorkspaceSkillRunMeta[]
  intent?: ChainIntent
  routing?: ChainRoutingResult
  runState?: ChainRunState
  awaiting?: {
    routing: ChainRoutingResult
    recommendedSkills: WorkspaceSkillTemplate[]
  }
  budgetSnapshot?: {
    used: number
    limit: number
    entries: Array<{
      step: string
      at: string
      used: number
      limit: number | null
    }>
  }
}

export type ChainRunState =
  | 'idle'
  | 'routing'
  | 'awaiting_user'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'budget_exhausted'

export type ChainRoutingEvent =
  | { type: 'routing_started'; requestText: string }
  | { type: 'routing_result'; requestText: string; result: ChainRoutingResult }
  | {
      type: 'routing_diagnostics'
      diagnostics: ChainRoutingDiagnostics
    }
  | { type: 'fallback_requested'; result: ChainRoutingResult }
  | {
      type: 'chain_handoff'
      artifact: ReturnType<typeof describeChainHandoffEvent>
    }
  | {
      type: 'skill_skipped'
      skillIndex: number
      skillId: string
      reason: string
    }
  | {
      type: 'budget_exhausted'
      step: string
      budget: { used: number; limit: number }
    }
  | { type: 'run_completed'; state: ChainRunState }

export type WorkspaceSkillEngineCallbacks = {
  onFirstChunk?: () => void
  onStatus?: (status: string) => void
  onChunk?: (text: string) => void
  onReasoning?: (text: string) => void
  onBeforeSkill?: (
    skillIndex: number,
    skillId: string,
    skillName: string,
  ) => void
  onAfterSkill?: (
    skillIndex: number,
    skillId: string,
    skillName: string,
    output: string,
  ) => void
  onArtifactAcceptance?: (
    result: WorkspaceArtifactAcceptanceResult,
    stepIndex: number,
    mode: WorkspaceSkillMode,
  ) => void
  onApiCallStart?: (
    skillId: string,
    skillName: string,
    model: string,
    actualToolSurface?: Array<{ name: string; policy: 'read' | 'write' }>,
  ) => string | undefined
  onApiCallFinish?: (
    callId: string,
    meta: WorkspaceSkillRunMeta,
    durationMs: number,
    result?: {
      status: 'success' | 'failed'
      text: string
      reasoning?: string
    },
  ) => void
  onPromptBuilt?: (input: {
    skillId: string
    skillName: string
    skillVersion?: string
    mode: string
    systemPrompt: string
    userPrompt: string
    finalMessages: ContextMessage[]
    variables: Record<string, unknown>
    contextBlocks: WorkspaceContextBlock[]
    folderFingerprint?: Array<{
      file: string
      hash: string
      mtime: number
      bytes: number
    }>
  }) => void
  onSkillSkipped?: (skillIndex: number, skillId: string, reason: string) => void
  onRoutingEvent?: (event: ChainRoutingEvent) => void
  onPhysicalCall?: (skillId: string, callId: string, event: PhysicalCallEvent) => void
  onGenerationEvent?: (
    skillId: string,
    event: Parameters<NonNullable<RealSkillExecuteOptions['onGenerationEvent']>>[0],
  ) => void
  onSkillFallback?: (skillId: string, detail: {
    code: string
    message: string
    skillName?: string
    folderPath?: string
    action?: string
  }) => void
}

export interface WorkspaceContextServiceLike {
  getPolicy(
    purpose: string,
    skillId?: string,
    skillPolicy?: Parameters<ConversationContextService['getPolicy']>[2],
  ): ContextPolicy
  buildContextBundle(input: ContextBuildInput): Promise<ContextBundle>
  buildDialogueContextBlocks(
    bundle: ContextBundle,
    policy: ContextPolicy,
  ): WorkspaceContextBlock[]
  assembleMessages(
    bundle: ContextBundle,
    policy: ContextPolicy,
    base: ContextMessage[],
  ): ContextMessage[]
  recordTurn(ref: ContextRef, turn: ContextTurn): Promise<void>
}

export type PostProcessTerminalStatus = {
  processingStatus: 'success' | 'warning' | 'failed'
  runStatus: 'success' | 'success_with_warnings' | 'degraded' | 'blocked'
  eventReason: 'post-process-completed' | 'post-process-warning' | 'post-process-degraded' | 'post-process-blocked'
}

export function resolvePostProcessTerminalStatus(
  report: RealSkillPostProcessReport | undefined,
): PostProcessTerminalStatus {
  if (!report) {
    return {
      processingStatus: 'success',
      runStatus: 'success',
      eventReason: 'post-process-completed',
    }
  }
  if (report.issues.some(issue => issue.severity === 'blocking')) {
    return {
      processingStatus: 'failed',
      runStatus: 'blocked',
      eventReason: 'post-process-blocked',
    }
  }
  if (report.changedOutput || report.issues.length > 0) {
    return {
      processingStatus: 'warning',
      runStatus: 'success_with_warnings',
      eventReason: 'post-process-warning',
    }
  }
  return {
    processingStatus: 'success',
    runStatus: 'success',
    eventReason: 'post-process-completed',
  }
}

function resolveArtifactTerminal(
  artifact: WorkspaceArtifactAcceptanceResult | null,
  postProcess: RealSkillPostProcessReport | undefined,
): {
  processingStatus: 'success' | 'warning' | 'failed'
  runStatus: WorkspaceSkillRunResult['terminalStatus']
  eventReason: string
} {
  if (artifact) {
    return {
      processingStatus: artifact.decision === 'reject'
        ? artifact.callerStatus === 'failed' || artifact.callerStatus === 'blocked'
          ? 'failed'
          : 'warning'
        : artifact.terminalStatus === 'success'
          ? 'success'
          : 'warning',
      runStatus: artifact.terminalStatus,
      eventReason: artifact.terminalReason,
    }
  }
  return resolvePostProcessTerminalStatus(postProcess)
}

export type WorkspaceContextBlock = {
  source:
    | 'editorContent'
    | 'referenceOutline'
    | 'outline'
    | 'settings'
    | 'memory'
    | 'selection'
    | 'pipeline'
    | 'activeTab'
  version: string
  coverage:
    | 'full'
    | 'packed'
    | 'partial'
    | 'structure_map'
    | 'reference'
    | 'selection'
  content?: string
  truncated?: boolean
}

export interface WorkspaceSkillEngineAdapter {
  workspace: 'main' | 'outline'
  source: string
  projectId: string
  /** Stable owner identity for chain breakpoints; resumes require an exact match. */
  breakpointOwnerKey: string
  /**
   * Identity of the editor target owned by this adapter. `callAi.meta` and the
   * tool execution context must share it, otherwise editor.write is rejected.
   */
  toolContext?: {
    targetId?: string
    readableTargets?: string[]
  }
  step: number
  defaultSystemPrompt: string
  preferredModel?: string
  getBaseAgentId(): string
  getSkillAgentId(skillId: string): string
  getAgent(agentId: string): WorkspaceAgentConfig | null
  getProvider(
    agent: WorkspaceAgentConfig | null,
  ): WorkspaceProviderConfig | null
  getSkillPolicy(
    template: WorkspaceSkillTemplate,
  ): Parameters<ConversationContextService['getPolicy']>[2]
  buildTemplateContext(
    requestText: string,
    previousOutput?: string,
  ): Record<string, unknown>
  getWorkspaceState(): Partial<ContextWorkspaceState>
  getLegacyMessages(requestText: string): ContextMessage[]
  /** Tool audit from the workspace's previous completed turn. */
  getToolAudit?(): unknown
  /** Current edit-task context; used to remove editor.write while task controls are active. */
  getEditTaskContext?(): DialogueToolSurfaceTaskContext
  /**
   * App-owned execution context. SKILL packages cannot supply this; it is the
   * same single-source plan and write authorization used by the plain path.
   */
  getExecutionContext?(): {
    executionPlan?: LongDocumentExecutionPlan
    writeAuthorization?: DialogueWriteAuthorization | null
  }
  /** Load only the slot owned by this adapter; never another owner's state. */
  loadBreakpoint(ownerKey?: string): Promise<ChainBreakpoint | null>
  saveBreakpoint(breakpoint: ChainBreakpoint): Promise<void>
  clearBreakpoint(ownerKey?: string): Promise<void>
  /**
   * Intent-scoped tool surface. Read tools are always safe; adapters must only
   * return write proposal tools when the engine explicitly requests them.
   */
  buildTools?(request: WorkspaceSkillToolRequest): {
    tools?: AgentToolDefinition[]
    toolPolicy?: CallAiParams['toolPolicy']
  }
  /** Optional L4 semantic classifier for low-confidence routing. */
  classifyIntentWithLlm?(requestText: string): Promise<{
    intent?: unknown
    confidence?: unknown
    reason?: unknown
  } | null>
}

export interface RunWorkspaceSkillsInput {
  requestText: string
  templates: WorkspaceSkillTemplate[]
  mode: WorkspaceSkillMode
  aiService: AiService
  contextService: WorkspaceContextServiceLike
  adapter: WorkspaceSkillEngineAdapter
  signal?: AbortSignal
  apiBudget?: ApiCallBudget
  artifactContract?: WorkspaceArtifactContract | null
  routingOverride?: {
    bypass?: boolean
    forcedIntent?: Exclude<ChainIntent, 'auto'>
    /** Reuse a caller-side detailed routing result; prevents duplicate LLM fallback calls. */
    precomputedRouting?: DetailedChainRoutingResult
  }
  callbacks?: WorkspaceSkillEngineCallbacks
}

export function getPromptParts(
  template: string,
  mode: string,
): WorkspacePromptParts {
  if (mode === 'user_prefix') return { userPrefix: template }
  if (mode === 'user_suffix') return { userSuffix: template }
  return { systemSkill: template }
}

export function mergePromptParts(
  parts: WorkspacePromptParts[],
): WorkspacePromptParts {
  return {
    systemSkill: parts
      .map((part) => part.systemSkill)
      .filter(Boolean)
      .join('\n\n'),
    userPrefix: parts
      .map((part) => part.userPrefix)
      .filter(Boolean)
      .join('\n\n'),
    userSuffix: parts
      .map((part) => part.userSuffix)
      .filter(Boolean)
      .join('\n\n'),
  }
}

export function resolveWorkspaceTemplate(
  template: string,
  context: Record<string, unknown>,
): string {
  const engine =
    typeof window !== 'undefined'
      ? (window as any).SkillExecutionEngine
      : undefined
  if (
    engine &&
    typeof engine.resolveTemplate === 'function' &&
    template &&
    /\{\{/.test(template)
  ) {
    try {
      return engine.resolveTemplate(template, context, { keepMissing: false })
    } catch (error) {
      console.warn(
        '[WORKSPACE_SKILL_ENGINE] resolveTemplate failed, using raw template',
        error,
      )
    }
  }
  return template
}

export type WorkspaceSkillGuidancePromptSource =
  | 'folder-system-prompt'
  | 'template-system-prefix'
  | 'template-user-affixes'
  | 'none'

export type WorkspaceSkillGuidance = {
  guidance: string
  skillIds: string[]
  promptSource: WorkspaceSkillGuidancePromptSource
  guidanceChars: number
  truncated: boolean
}

export const WORKSPACE_SKILL_GUIDANCE_CHAR_LIMIT = 8000

export function buildWorkspaceSkillGuidance(input: {
  templates: WorkspaceSkillTemplate[]
  requestText: string
  adapter: WorkspaceSkillEngineAdapter
  previousSkillOutput?: string
}): WorkspaceSkillGuidance {
  const templates = input.templates.filter(Boolean)
  if (templates.length === 0) {
    return {
      guidance: '',
      skillIds: [],
      promptSource: 'none',
      guidanceChars: 0,
      truncated: false,
    }
  }
  const baseContext = input.adapter.buildTemplateContext(
    input.requestText,
    input.previousSkillOutput,
  )
  const parts = templates.map((template) => {
    const templateContext = {
      ...baseContext,
      ...(template.customVars || {}),
    }
    return getPromptParts(
      resolveWorkspaceTemplate(template.template, templateContext),
      template.injectMode || 'system_prefix',
    )
  })
  const merged = mergePromptParts(parts)
  const folderTemplate = templates.find(isFolderTemplate)
  const folderSystemPrompt = folderTemplate?.skill
    ? resolveFolderSystemPrompt(folderTemplate.skill)
      // Imported folder skills keep their domain capability in template.md;
      // the store record intentionally has no systemPrompt field.
      || folderTemplate.template
      || folderTemplate.skill?.description
    : ''
  const guidance = folderTemplate ? folderSystemPrompt : merged.systemSkill
  const text = (guidance || '').trim()
  const promptSource: WorkspaceSkillGuidancePromptSource = folderTemplate
    ? 'folder-system-prompt'
    : text
      ? 'template-system-prefix'
      : merged.userPrefix || merged.userSuffix
        ? 'template-user-affixes'
        : 'none'
  const truncated = text.length > WORKSPACE_SKILL_GUIDANCE_CHAR_LIMIT
  return {
    guidance: truncated
      ? text.slice(0, WORKSPACE_SKILL_GUIDANCE_CHAR_LIMIT)
      : text,
    skillIds: templates.map((template) => template.id),
    promptSource,
    guidanceChars: Math.min(
      text.length,
      WORKSPACE_SKILL_GUIDANCE_CHAR_LIMIT,
    ),
    truncated,
  }
}

function resolveFolderSystemPrompt(skill: RoutedSkill): string {
  const folderSkill = skill as RoutedSkill & {
    systemPrompt?: string
  }
  return folderSkill.systemPrompt || ''
}

function isFolderTemplate(
  template: WorkspaceSkillTemplate,
): template is WorkspaceSkillTemplate & {
  skill: RoutedSkill & { format: 'folder'; folderPath: string }
} {
  return (
    template.skill?.format === 'folder' && Boolean(template.skill.folderPath)
  )
}

function validateInput(template: WorkspaceSkillTemplate, input: unknown): void {
  if (!template.inputSchema) return
  const result = validateSkillInput(input, template)
  if (!result.valid) {
    throw new Error(
      '「' + template.name + '」输入校验失败：' + result.errors.join('；'),
    )
  }
}

function validateOutput(
  template: WorkspaceSkillTemplate,
  output: string,
): void {
  const structured = validateSkillOutput(output, template)
  if (!structured.valid) {
    throw new Error(
      '「' + template.name + '」输出校验失败：' + structured.errors.join('；'),
    )
  }
  const rules = validateSkillRules(
    structured.value ?? output,
    template.validationRules,
  )
  if (!rules.valid) {
    throw new Error(
      '「' + template.name + '」规则校验失败：' + rules.errors.join('；'),
    )
  }
}

function combineComposeTemplate(
  templates: WorkspaceSkillTemplate[],
): WorkspaceSkillTemplate {
  const folderTemplate = templates.find(isFolderTemplate)
  if (folderTemplate) {
    return {
      ...folderTemplate,
      template: templates
        .map((template) => template.template)
        .filter(Boolean)
        .join('\n\n'),
      validationRules: templates.flatMap(
        (template) => template.validationRules || [],
      ),
      outputSchema: templates.find((template) => template.outputSchema)
        ?.outputSchema,
      retryPolicy: JSON.stringify({
        maxAttempts: templates.reduce(
          (max, template) =>
            Math.max(max, getSkillMaxAttempts(template.retryPolicy)),
          1,
        ),
      }),
    }
  }
  return {
    id: 'compose',
    name: templates.map((template) => template.name).join(' + '),
    template: '',
    outputFormat: templates.some((template) => template.outputFormat === 'json')
      ? 'json'
      : 'text',
    validationRules: templates.flatMap(
      (template) => template.validationRules || [],
    ),
    outputSchema: templates.find((template) => template.outputSchema)
      ?.outputSchema,
    retryPolicy: JSON.stringify({
      maxAttempts: templates.reduce(
        (max, template) =>
          Math.max(max, getSkillMaxAttempts(template.retryPolicy)),
        1,
      ),
    }),
  }
}

function contextPolicy(
  contextService: WorkspaceContextServiceLike,
  adapter: WorkspaceSkillEngineAdapter,
  template: WorkspaceSkillTemplate,
  previousSkillOutput?: string,
  templateContext?: Record<string, unknown>,
): ContextPolicy {
  const policy = contextService.getPolicy(
    'generate',
    template.id,
    adapter.getSkillPolicy(template),
  )
  if (
    typeof templateContext?.outlineContent === 'string' &&
    templateContext.outlineContent.length > 0
  ) {
    return { ...policy, skipOutlineBody: true }
  }
  if (previousSkillOutput === undefined) return policy
  return {
    ...policy,
    chatHistory: 'none',
    includeOutline: false,
    includeSettings: false,
    includeMemory: false,
  }
}

export function inferRoutingFallbackIntent(
  routing: ChainRoutingResult,
): Exclude<ChainIntent, 'auto'> {
  if (routing.kind === 'matched') {
    if (
      routing.intent === 'analyze' ||
      routing.intent === 'edit' ||
      routing.intent === 'generate' ||
      routing.intent === 'discuss'
    ) {
      return routing.intent
    }
  }
  return 'discuss'
}

function resolveReadonlyFallbackIntent(
  routing: ChainRoutingResult,
): 'discuss' | null {
  if (routing.kind === 'matched') return null
  return routing.fallbackMode === 'readonly-discuss' ? 'discuss' : null
}

function resolveAuthorizedToolSurface(
  adapter: WorkspaceSkillEngineAdapter,
  intent: ChainIntent,
  stage: number,
  mode: WorkspaceSkillMode,
  requestText: string,
): AuthorizedWorkspaceToolSurface {
  const requestedSurface = adapter.buildTools?.({ intent, stage, mode, requestText }) || {}
  const executionContext = adapter.getExecutionContext?.() || {}
  const taskContext = {
    ...adapter.getEditTaskContext?.(),
    ...(executionContext.writeAuthorization !== undefined
      ? { writeAuthorization: executionContext.writeAuthorization }
      : {}),
    ...(executionContext.executionPlan !== undefined
      ? { executionPlan: executionContext.executionPlan }
      : {}),
  }
  const { tools: authorizedTools, permissionDecision } = authorizeDialogueTools(
    requestedSurface.tools || [],
    intent,
    'direct',
    taskContext,
  )
  const authorizedToolPolicy = requestedSurface.toolPolicy
    ? {
        ...requestedSurface.toolPolicy,
        intent,
        scenario: 'folder-chain' as const,
        permissionDecision,
      }
    : undefined
  return {
    tools: authorizedTools,
    toolPolicy: authorizedToolPolicy,
    actualToolSurface: authorizedTools.map(tool => ({
      name: tool.name,
      policy: tool.policy,
    })),
    permissionDecision,
    activeEditTask: adapter.getEditTaskContext?.().activeEditTask || null,
    executionPlan: adapter.getExecutionContext?.().executionPlan || null,
  }
}

async function callWorkspaceSkill(
  input: RunWorkspaceSkillsInput,
  template: WorkspaceSkillTemplate,
  injection: WorkspacePromptParts,
  userPrompt: string,
  inputContext: unknown,
  contextOptions: WorkspaceContextOptions,
  onProgress?: (status: string) => void,
): Promise<string> {
  const { adapter, aiService, contextService } = input
  let streamText = ''
  validateInput(template, inputContext)
  const toolSurface = resolveAuthorizedToolSurface(
    adapter,
    contextOptions.intent || 'auto',
    contextOptions.stage || 0,
    contextOptions.mode || 'compose',
    contextOptions.requestText,
  )
  const toolContext = {
    ...(adapter.toolContext || {}),
    projectId: adapter.projectId,
    workspace: adapter.workspace,
  }
  let folderFallback: Awaited<ReturnType<typeof routeSkill>>['fallback']
  if (isFolderTemplate(template)) {
    let folderFingerprint: Array<{
      file: string
      hash: string
      mtime: number
      bytes: number
    }> | undefined
    const previousOutput = (inputContext as { previousOutput?: unknown })
      .previousOutput
    const previousOutputOwnership: 'user_prompt' | 'context_block' =
      contextOptions.previousOutputOwnership || 'user_prompt'
    const folderInput =
      typeof previousOutput === 'string' && previousOutput.trim()
        ? `${userPrompt}\n\n请继续处理上一步 SKILL 输出：\n${previousOutput}`
        : contextOptions.requestText
    const agentId =
      adapter.getSkillAgentId(template.id) || adapter.getBaseAgentId()
    const agentConfig = agentId ? adapter.getAgent(agentId) : null
    if (agentId && !agentConfig)
      throw new Error('绑定的智能体不存在：' + agentId)
    const budget = input.apiBudget || createApiCallBudget(8)
    const contextRef: ContextRef = {
      projectId: adapter.projectId,
      workspace: adapter.workspace,
      purpose: 'generate',
      skillId: template.id,
      agentId: agentId || undefined,
    }
    const contextBundle = await contextService.buildContextBundle({
      ...contextRef,
      ...(previousOutputOwnership === 'user_prompt' ||
        contextOptions.previousSkillOutput === undefined
        ? {}
        : { previousSkillOutput: contextOptions.previousSkillOutput }),
      workspaceState: adapter.getWorkspaceState(),
      immediateContextMessages:
        contextOptions.includeHistory === false
          ? []
          : adapter.getLegacyMessages(contextOptions.requestText),
      ...(adapter.getToolAudit?.() !== undefined
        ? { toolAudit: adapter.getToolAudit() }
        : {}),
    })
    const policy = contextPolicy(
      contextService,
      adapter,
      template,
      contextOptions.previousSkillOutput,
      adapter.buildTemplateContext(contextOptions.requestText, contextOptions.previousSkillOutput),
    )
    const route = await routeSkill(template.skill, {
      input: folderInput,
      agent: agentConfig
        ? {
            id: agentId,
            model: agentConfig.model,
            temperature: agentConfig.temperature,
            maxTokens: agentConfig.maxTokens,
            systemPrompt: agentConfig.systemPrompt,
          }
        : null,
      purpose: 'generate',
      budget,
      skillId: template.id,
      toolContext,
      aiService,
      stream: true,
      signal: input.signal,
      onReasoning: (text) => {
        input.callbacks?.onReasoning?.(text)
      },
      onPhysicalCall: (event) => {
        const callId = activeSkillCallIds.get(input)?.get(template.id) || ''
        if (callId) input.callbacks?.onPhysicalCall?.(template.id, callId, event)
      },
      onGenerationEvent: (event) => {
        input.callbacks?.onGenerationEvent?.(template.id, event)
      },
      onChunk: (text) => {
        streamText += text
        input.callbacks?.onChunk?.(streamText)
        onProgress?.('正在生成...')
      },
      onFolderLoaded: (pkg) => {
        folderFingerprint = pkg.fingerprint
      },
      messageBuilder: (systemPrompt, userPrompt) => {
        const finalMessages = contextService.assembleMessages(contextBundle, policy, [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ])
        try {
          input.callbacks?.onPromptBuilt?.({
            skillId: template.id,
            skillName: template.name || template.id,
            skillVersion: template.version,
            mode: input.mode,
            systemPrompt,
            userPrompt,
            finalMessages,
            variables: adapter.buildTemplateContext(contextOptions.requestText, contextOptions.previousSkillOutput),
            contextBlocks: contextService.buildDialogueContextBlocks(contextBundle, policy),
            folderFingerprint
          })
        } catch { /* trace hook must not break generation */ }
        return finalMessages
      },
      ...(toolSurface.tools?.length
        ? { tools: toolSurface.tools, toolPolicy: toolSurface.toolPolicy }
        : {}),
      toolSurface: toolSurface.actualToolSurface,
      activeEditTask: toolSurface.activeEditTask,
      executionPlan: toolSurface.executionPlan,
    })
    if (route.mode === 'folder' && route.folderResult) {
      const folderResult = route.folderResult
      const output = folderResult.output || ''
      if (!output.trim()) throw new Error('API 返回为空')
      await contextService.recordTurn(contextRef, {
        user: contextOptions.requestText,
        assistant: output,
        reservedOutputTokens:
          folderResult.apiMeta?.maxTokens
          ?? agentConfig?.maxTokens
          ?? undefined,
        meta: {
          source: adapter.source,
          skillId: template.id,
          agentId: agentId || undefined,
        },
      })
      lastRunMeta.set(input, {
        finishReason: folderResult.apiMeta?.finishReason,
        requestMessages:
          (folderResult.apiMeta?.requestMessages as ContextMessage[]) || [],
        providerId: folderResult.apiMeta?.providerId,
        model: agentConfig?.model || 'folder-skill',
        agentId: agentId || undefined,
        skillId: template.id,
        status: folderResult.status === 'degraded' ? 'degraded' : 'success',
        responseText: output,
        reasoningText: folderResult.apiMeta?.reasoningText,
        usage: folderResult.apiMeta?.usage,
        maxTokens: folderResult.apiMeta?.maxTokens,
        contextBudget: folderResult.apiMeta?.contextBudget,
        usageReconciliation: folderResult.apiMeta?.usageReconciliation,
        diagnostics: folderResult.diagnostics,
        budget: budget.snapshot(),
        folderPackageCache: folderResult.folderPackageCache === true,
        skillToolDeclarationsIgnored: folderResult.diagnostics?.filter(
          diagnostic => diagnostic.code === 'folder-package:manifest-protocol-fields-ignored',
        ).length || 0,
        postProcessReport: folderResult.postProcessReport,
        toolCalls: folderResult.apiMeta?.toolCalls,
        toolResults: folderResult.apiMeta?.toolResults,
        toolRequestDeltas: folderResult.apiMeta?.toolRequestDeltas,
        toolAudit: folderResult.apiMeta?.toolAudit,
      })
      return output
    }
    // Only a load failure falls back to the text path; execution failures
    // already return folder mode with diagnostics above.
    folderFallback = route.fallback
    if (folderFallback) {
      const fallbackDetail = {
        ...folderFallback,
        skillId: folderFallback.skillId || template.id,
        skillName: folderFallback.skillName || template.name || template.id
      }
      input.callbacks?.onSkillFallback?.(template.id, fallbackDetail)
    }
  }
  const maxAttempts = template.retryPolicy
    ? getSkillMaxAttempts(template.retryPolicy)
    : template.outputFormat === 'json'
      ? 2
      : 1
  const agentId =
    adapter.getSkillAgentId(template.id) || adapter.getBaseAgentId()
  const agentConfig = agentId ? adapter.getAgent(agentId) : null
  if (agentId && !agentConfig) throw new Error('绑定的智能体不存在：' + agentId)
  const provider = adapter.getProvider(agentConfig)
  if (!provider) throw new Error('请先配置API供应商')
  const model =
    adapter.preferredModel ||
    agentConfig?.model ||
    provider.selectedModel ||
    provider.models?.[0] ||
    'gpt-4o'
  const temperature = agentConfig?.temperature ?? provider.temperature ?? 0.7
  const maxTokens = agentConfig?.maxTokens || provider.maxTokens || null
  const systemPrompt =
    [injection.systemSkill, agentConfig?.systemPrompt]
      .filter(Boolean)
      .join('\n\n') || adapter.defaultSystemPrompt
  const userPromptParts = [
    injection.userPrefix,
    userPrompt,
    injection.userSuffix,
  ].filter(Boolean)
  const contextRef: ContextRef = {
    projectId: adapter.projectId,
    workspace: adapter.workspace,
    purpose: 'generate',
    skillId: template.id,
    agentId: agentId || undefined,
  }
  const contextBundle = await contextService.buildContextBundle({
    ...contextRef,
    ...(contextOptions.previousOutputOwnership === 'user_prompt' ||
      contextOptions.previousSkillOutput === undefined
      ? {}
      : { previousSkillOutput: contextOptions.previousSkillOutput }),
    workspaceState: adapter.getWorkspaceState(),
    immediateContextMessages:
      contextOptions.includeHistory === false
        ? []
        : adapter.getLegacyMessages(contextOptions.requestText),
    ...(adapter.getToolAudit?.() !== undefined
      ? { toolAudit: adapter.getToolAudit() }
      : {}),
  })
  const policy = contextPolicy(
    contextService,
    adapter,
    template,
    contextOptions.previousSkillOutput,
    adapter.buildTemplateContext(contextOptions.requestText, contextOptions.previousSkillOutput),
  )
  let lastError: unknown = null
  let lastResult: CallAiResult | null = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptPrompt =
      attempt === 1
        ? userPromptParts.join('\n\n')
        : userPromptParts.join('\n\n') +
          '\n\n[校验重试] 上次输出未满足技能的结构化约束，请只返回符合要求的结果。'
    try {
      const requestMessages = contextService.assembleMessages(
        contextBundle,
        policy,
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: attemptPrompt },
        ],
      )
      try {
        input.callbacks?.onPromptBuilt?.({
          skillId: template.id,
          skillName: template.name || template.id,
          skillVersion: template.version,
          mode: input.mode,
          systemPrompt,
          userPrompt: attemptPrompt,
          finalMessages: requestMessages,
          variables: adapter.buildTemplateContext(contextOptions.requestText, contextOptions.previousSkillOutput),
          contextBlocks: contextService.buildDialogueContextBlocks(contextBundle, policy)
        })
      } catch { /* trace hook must not break generation */ }
      const result = await input.aiService.callAi({
        purpose: 'generate',
        messages: requestMessages,
        model,
        temperature,
        maxTokens,
        signal: input.signal,
        onChunk: (text: string) => {
          streamText += text
          input.callbacks?.onChunk?.(streamText)
          onProgress?.('正在生成...')
        },
        onPhysicalCall: (event) => {
          const callId = activeSkillCallIds.get(input)?.get(template.id) || ''
          if (callId) input.callbacks?.onPhysicalCall?.(template.id, callId, event)
        },
      retry: true,
      ...(toolSurface.tools?.length
        ? { tools: toolSurface.tools, toolPolicy: toolSurface.toolPolicy }
        : {}),
      meta: {
        source: adapter.source,
        projectId: adapter.projectId,
        workspace: adapter.workspace,
        targetId: toolContext.targetId,
        readableTargets: toolContext.readableTargets,
        skillId: template.id,
        agentId: agentId || undefined,
      },
      })
      const output = result.text || ''
      lastRunMeta.set(input, {
        finishReason: result.finishReason,
        requestMessages,
        providerId: result.providerId,
        model,
        agentId: agentId || undefined,
        skillId: template.id,
        responseText: output,
        reasoningText: result.reasoning,
        usage: result.usage,
        maxTokens: result.maxTokens,
        toolCalls: result.toolCalls,
        toolResults: result.toolResults,
        toolAudit: result.toolAudit,
      })
      if (!output.trim()) throw new Error('API 返回为空')
      validateOutput(template, output)
      await contextService.recordTurn(contextRef, {
        user: contextOptions.requestText,
        assistant: output,
        reservedOutputTokens: maxTokens,
        meta: {
          source: adapter.source,
          skillId: template.id,
          agentId: agentId || undefined,
        },
      })
      lastResult = result
      lastRunMeta.set(input, {
        finishReason: result.finishReason,
        requestMessages,
        providerId: result.providerId,
        model,
        agentId: agentId || undefined,
        skillId: template.id,
        responseText: output,
        reasoningText: result.reasoning,
        usage: result.usage,
        maxTokens: result.maxTokens,
        toolCalls: lastResult.toolCalls,
        toolResults: lastResult.toolResults,
        toolAudit: lastResult.toolAudit,
      })
      if (folderFallback) {
        const meta = lastRunMeta.get(input)
        if (meta) {
          meta.diagnostics = [
            ...(meta.diagnostics || []),
            {
              type: 'warning',
              code: 'folder-skill-fallback',
              message: `folder SKILL 加载失败，已回退文本路径：${formatSkillFallback(folderFallback)}`,
            },
          ]
        }
      }
      return output
    } catch (error) {
      lastError = error
      const meta = lastRunMeta.get(input)
      if (meta) {
        meta.diagnostics = [
          ...(meta.diagnostics || []),
          {
            type: 'warning' as const,
            code: 'skill-validation-retry',
            message: `第 ${attempt}/${maxAttempts} 次尝试未通过：${error instanceof Error ? error.message : String(error)}`,
            at: new Date().toISOString(),
          },
        ]
      }
      if (attempt === maxAttempts) throw error
    }
  }
  if (lastResult) {
    lastRunMeta.set(input, {
      finishReason: lastResult.finishReason,
      requestMessages: [],
      providerId: lastResult.providerId,
      model,
      agentId: agentId || undefined,
        skillId: template.id,
        responseText: lastResult.text,
        reasoningText: lastResult.reasoning,
        usage: lastResult.usage,
        toolCalls: lastResult.toolCalls,
        toolResults: lastResult.toolResults,
        toolAudit: lastResult.toolAudit,
      })
  }
  throw lastError instanceof Error ? lastError : new Error('技能输出校验失败')
}

const lastRunMeta = new WeakMap<
  RunWorkspaceSkillsInput,
  WorkspaceSkillRunMeta
>()

const activeSkillCallIds = new WeakMap<
  RunWorkspaceSkillsInput,
  Map<string, string>
>()

const seenChainHandoffHashes = new WeakMap<
  RunWorkspaceSkillsInput,
  Set<string>
>()

function getRecentHistoryForIntent(
  adapter: WorkspaceSkillEngineAdapter,
  requestText: string,
): ChainIntentHistoryMessage[] {
  return adapter
    .getLegacyMessages(requestText)
    .slice(-4)
    .filter(
      (message): message is ContextMessage & { role: 'user' | 'assistant' } =>
        (message.role === 'user' || message.role === 'assistant') &&
        typeof message.content === 'string',
    )
}

async function resolveWorkspaceIntentRouting(
  input: RunWorkspaceSkillsInput,
  adapter: WorkspaceSkillEngineAdapter,
  templates: WorkspaceSkillTemplate[],
  callbacks: WorkspaceSkillEngineCallbacks,
): Promise<ChainRoutingResult> {
  if (input.routingOverride?.bypass === true) {
    const bypassedResult: ChainRoutingResult = {
      kind: 'matched',
      intent: 'generate',
      confidence: 1,
      reason: 'user-bypassed-routing',
    }
    callbacks.onRoutingEvent?.({
      type: 'routing_started',
      requestText: input.requestText,
    })
    callbacks.onRoutingEvent?.({
      type: 'routing_result',
      requestText: input.requestText,
      result: bypassedResult,
    })
    return bypassedResult
  }

  if (input.routingOverride?.precomputedRouting) {
    const precomputed = input.routingOverride.precomputedRouting
    callbacks.onRoutingEvent?.({
      type: 'routing_started',
      requestText: input.requestText,
    })
    callbacks.onRoutingEvent?.({
      type: 'routing_diagnostics',
      diagnostics: precomputed.diagnostics,
    })
    if (
      input.routingOverride.forcedIntent &&
      (precomputed.kind !== 'matched' ||
        precomputed.intent !== input.routingOverride.forcedIntent)
    ) {
      const forcedResult: ChainRoutingResult = {
        kind: 'matched',
        intent: input.routingOverride.forcedIntent,
        confidence: 1,
        reason: 'user-confirmed-recommendation',
      }
      callbacks.onRoutingEvent?.({
        type: 'routing_result',
        requestText: input.requestText,
        result: forcedResult,
      })
      return forcedResult
    }
    callbacks.onRoutingEvent?.({
      type: 'routing_result',
      requestText: input.requestText,
      result: precomputed,
    })
    return precomputed
  }

  const recentHistory = getRecentHistoryForIntent(adapter, input.requestText)
  callbacks.onRoutingEvent?.({
    type: 'routing_started',
    requestText: input.requestText,
  })
  const routingResult = await routeChainIntentDetailed(input.requestText, {
    projectId: adapter.projectId,
    workspace:
      adapter.workspace === 'outline' ? 'outline-workbench' : 'home-editor',
    activeEditTaskStatus:
      adapter.getEditTaskContext?.().activeEditTask?.status === 'awaiting_batch'
        ? 'awaiting_batch'
        : undefined,
    recentUserMessages: recentHistory
      .filter((message) => message.role === 'user')
      .map((message) => message.content),
    recentHistory,
    activeSkillIds: templates.map((template) => template.id),
    ...(adapter.classifyIntentWithLlm
      ? { llmClassifier: adapter.classifyIntentWithLlm }
      : {}),
  })
  callbacks.onRoutingEvent?.({
    type: 'routing_diagnostics',
    diagnostics: routingResult.diagnostics,
  })
  const effectiveRoutingResult: ChainRoutingResult = routingResult
  if (
    input.routingOverride?.forcedIntent &&
    (effectiveRoutingResult.kind !== 'matched' ||
      effectiveRoutingResult.intent !== input.routingOverride.forcedIntent)
  ) {
    const forcedResult: ChainRoutingResult = {
      kind: 'matched',
      intent: input.routingOverride.forcedIntent,
      confidence: 1,
      reason: 'user-confirmed-recommendation',
    }
    callbacks.onRoutingEvent?.({
      type: 'routing_result',
      requestText: input.requestText,
      result: forcedResult,
    })
    return forcedResult
  }
  callbacks.onRoutingEvent?.({
    type: 'routing_result',
    requestText: input.requestText,
    result: effectiveRoutingResult,
  })
  return effectiveRoutingResult
}

export async function runWorkspaceSkills(
  input: RunWorkspaceSkillsInput,
): Promise<WorkspaceSkillRunResult> {
  const { adapter, contextService, templates } = input
  const callbacks = input.callbacks || {}
  if (templates.length === 0) throw new Error('未选择可执行技能')

  if (input.mode === 'chain') {
    const bypassed = input.routingOverride?.bypass === true
    const effectiveRoutingResult = await resolveWorkspaceIntentRouting(
      input,
      adapter,
      templates,
      callbacks,
    )
    const readonlyFallbackIntent = resolveReadonlyFallbackIntent(
      effectiveRoutingResult,
    )
    if (effectiveRoutingResult.kind !== 'matched' && !readonlyFallbackIntent) {
      callbacks.onRoutingEvent?.({
        type: 'fallback_requested',
        result: effectiveRoutingResult,
      })
      const intentResult = {
        intent: 'auto' as ChainIntent,
        matchedKeywords: [],
        confidence: effectiveRoutingResult.confidence,
      }
      const { filtered: fallbackTemplates, skipped: fallbackSkipped } =
        filterTemplatesByIntent(templates, intentResult.intent)
      for (const s of fallbackSkipped) {
        callbacks.onSkillSkipped?.(s.index, s.template.id, s.reason)
      }
  return {
    text: '',
    meta: null,
    mode: 'chain',
    intent: intentResult.intent,
    routing: effectiveRoutingResult,
    runState: 'awaiting_user',
        allMetas: [],
        awaiting: {
          routing: effectiveRoutingResult,
          recommendedSkills: filterTemplatesByIntent(
            templates,
            inferRoutingFallbackIntent(effectiveRoutingResult),
          ).filtered,
        },
      }
}
    const intentResult: {
      intent: ChainIntent
      matchedKeywords: string[]
      confidence: number
    } = {
      intent: bypassed
        ? 'auto'
        : effectiveRoutingResult.kind === 'matched'
          ? effectiveRoutingResult.intent
          : readonlyFallbackIntent || input.routingOverride?.forcedIntent || 'auto',
      matchedKeywords: [],
      confidence: effectiveRoutingResult.confidence,
    }
    const { filtered: chainTemplates, skipped } = bypassed
      ? { filtered: templates, skipped: [] }
      : filterTemplatesByIntent(templates, intentResult.intent)
    if (skipped.length > 0) {
      for (const s of skipped) {
        callbacks.onSkillSkipped?.(s.index, s.template.id, s.reason)
        callbacks.onRoutingEvent?.({
          type: 'skill_skipped',
          skillIndex: s.index,
          skillId: s.template.id,
          reason: s.reason,
        })
      }
    }
    if (chainTemplates.length === 0) {
      return {
        text: '',
        meta: null,
        mode: 'chain',
        runState: 'awaiting_user',
        routing: effectiveRoutingResult,
        awaiting: { routing: effectiveRoutingResult, recommendedSkills: [] },
      }
    }
    const allMetas: WorkspaceSkillRunMeta[] = []
    const skillSequence = templates.map((template) => template.id)
    let artifactAcceptance: WorkspaceArtifactAcceptanceResult | null = null
    const stepToolSurface = resolveAuthorizedToolSurface(
      adapter,
      intentResult.intent,
      0,
      'chain',
      input.requestText,
    )
    const breakpoint = await adapter.loadBreakpoint(adapter.breakpointOwnerKey)
    const resumePoint = getChainResumePoint({
      breakpoint,
      step: adapter.step,
      projectId: adapter.projectId,
      skillSequence,
      ownerKey: adapter.breakpointOwnerKey,
    })
    let current = resumePoint.previousOutput || input.requestText
    const startIndex = resumePoint.startIndex
    const skillCallIds = new Map<string, string>()
    activeSkillCallIds.set(input, skillCallIds)
    seenChainHandoffHashes.set(input, new Set<string>(resumePoint.handoffHashes))
    if (resumePoint.resumed)
      callbacks.onStatus?.(`从第 ${startIndex + 1} 步继续`)
    for (let index = startIndex; index < chainTemplates.length; index++) {
      if (input.signal?.aborted) {
        callbacks.onStatus?.('已中断')
        break
      }
      if (
        input.apiBudget &&
        input.apiBudget.tryConsume(`chain-step-${index}`).status === 'blocked'
      ) {
        callbacks.onStatus?.('API 预算已用尽')
        const budgetSnapshot = input.apiBudget.snapshot()
        callbacks.onRoutingEvent?.({
          type: 'budget_exhausted',
          step: `chain-step-${index}`,
          budget: { used: budgetSnapshot.used, limit: budgetSnapshot.limit },
        })
        return {
          text: current,
          meta: allMetas[allMetas.length - 1] || null,
          allMetas,
          terminalStatus: 'blocked',
          terminalReason: 'budget_exhausted',
          mode: 'chain',
          intent: intentResult.intent,
          routing: effectiveRoutingResult,
          runState: 'budget_exhausted',
          budgetSnapshot,
        }
      }
      const template = chainTemplates[index]
      const previousOutput = index === 0 ? '' : current
      const templateOwnsPreviousOutput =
        isFolderTemplate(template) ||
        templateReferencesPreviousOutput(template.template)
      const templateContext = {
        ...adapter.buildTemplateContext(
          input.requestText,
          previousOutput || undefined,
        ),
        ...(template.customVars || {}),
      }
      const injection = getPromptParts(
        resolveWorkspaceTemplate(template.template, templateContext),
        template.injectMode || 'system_prefix',
      )
      const userPrompt =
        index === 0
          ? buildChainSkillPrompt({
              initialPrompt: `用户请求: ${input.requestText}\n\n请执行当前 SKILL：${template.name || template.id}`,
              previousOutput: '',
              isFirst: true,
            })
          : buildChainSkillPrompt({
              initialPrompt: `原始用户请求: ${input.requestText}\n\n请执行当前 SKILL：${template.name || template.id}。`,
              previousOutput: '',
              isFirst: false,
              templateOwnsPreviousOutput: true,
              delivery: 'template_variable',
            })
      callbacks.onStatus?.(
        `Skill ${index + 1}/${chainTemplates.length}：${template.name || template.id}`,
      )
      const stepStart = performance.now()
      callbacks.onBeforeSkill?.(
        index,
        template.id,
        template.name || template.id,
      )
      const provider = adapter.getProvider(
        adapter.getAgent(
          adapter.getSkillAgentId(template.id) || adapter.getBaseAgentId(),
        ),
      )
      const modelName =
        provider?.selectedModel ||
        provider?.models?.[0] ||
        adapter.preferredModel ||
        'unknown'
      const callId = callbacks.onApiCallStart?.(
        template.id,
        template.name || template.id,
        modelName,
        stepToolSurface.actualToolSurface,
      )
      if (callId) skillCallIds.set(template.id, callId)
      try {
        current = await callWorkspaceSkill(
          input,
          template,
          injection,
          userPrompt,
          { ...templateContext, previousOutput },
          {
            requestText: input.requestText,
            ...(index === 0 ? {} : { previousSkillOutput: current }),
            previousOutputOwnership: templateOwnsPreviousOutput
              ? 'user_prompt'
              : 'context_block',
            includeHistory: index === 0,
            intent: intentResult.intent,
            stage: index,
            mode: 'chain',
          },
          () => {
            callbacks.onFirstChunk?.()
            callbacks.onStatus?.(
              `Skill ${index + 1}/${chainTemplates.length}：正在生成...`,
            )
          },
        )
        skillCallIds.delete(template.id)
        const stepMeta = lastRunMeta.get(input)
        const seenSet = seenChainHandoffHashes.get(input)
        const handoffArtifact = makeChainHandoffArtifact({
          sourceStep: index,
          sourceSkillId: template.id,
          output: current,
          delivery: 'full_text',
          templateMeta: null,
          previousSeenHashes: seenSet,
        })
        if (seenSet) {
          seenSet.add(handoffArtifact.outputHash)
          callbacks.onRoutingEvent?.({
            type: 'chain_handoff',
            artifact: describeChainHandoffEvent(handoffArtifact),
          })
        }
        const echoDiagnostic = detectChainOutputEcho(
          previousOutput || undefined,
          current,
        )
        const echoWarningLevel = getChainEchoWarningLevel(index, chainTemplates.length, {
          finalStepRole: 'polish',
        })
        if (stepMeta && echoDiagnostic && echoWarningLevel) {
          stepMeta.diagnostics = [
            ...(stepMeta.diagnostics || []),
            {
              type: echoWarningLevel,
              code: echoDiagnostic.code,
              message: echoWarningLevel === 'info'
                ? `${echoDiagnostic.message}（终步为打磨角色，高重合保留为警告观察）`
                : echoDiagnostic.message,
            },
          ]
        }
        if (stepMeta) allMetas.push(stepMeta)
        let acceptedStepOutput = current
        if (input.artifactContract) {
          artifactAcceptance = acceptWorkspaceArtifact({
            rawOutput: current,
            callerStatus: stepMeta?.status === 'degraded' ? 'degraded' : 'success',
            degradedErrors: stepMeta?.diagnostics
              ?.filter(diagnostic => diagnostic.type === 'warning' || diagnostic.type === 'error')
              .map(diagnostic => diagnostic.message) || [],
            contract: input.artifactContract,
          })
          callbacks.onArtifactAcceptance?.(artifactAcceptance, index, 'chain')
          if (artifactAcceptance.decision === 'reject') {
            throw new Error(
              `工作区产物步骤验收失败（${artifactAcceptance.terminalReason}）：${artifactAcceptance.errors.join('；')}`,
            )
          }
          acceptedStepOutput = artifactAcceptance.downstreamPayload || current
        }
        callbacks.onApiCallFinish?.(
          callId || '',
          stepMeta || {
            requestMessages: [],
            model: modelName,
            skillId: template.id,
          },
          Math.round(performance.now() - stepStart),
          { status: 'success', text: acceptedStepOutput, reasoning: stepMeta?.reasoningText },
        )
        callbacks.onAfterSkill?.(
          index,
          template.id,
          template.name || template.id,
          acceptedStepOutput,
        )
        await adapter.saveBreakpoint(
          createChainSuccessBreakpoint({
            step: adapter.step,
            projectId: adapter.projectId,
            ownerKey: adapter.breakpointOwnerKey,
            skillIndex: index,
            skillId: template.id,
            skillSequence,
            lastSuccessChainIndex: index,
            lastOutput: current,
            handoffHashes: Array.from(
              seenChainHandoffHashes.get(input) || [],
            ),
            inputPrompt: userPrompt,
            agentId:
              adapter.getSkillAgentId(template.id) || adapter.getBaseAgentId(),
            retryCount: 0,
          }),
        )
      } catch (error) {
        callbacks.onApiCallFinish?.(
          callId || '',
          lastRunMeta.get(input) || {
            requestMessages: [],
            model: modelName,
            skillId: template.id,
          },
          Math.round(performance.now() - stepStart),
          { status: 'failed', text: '' },
        )
        await adapter.saveBreakpoint(
          createChainFailureBreakpoint({
            step: adapter.step,
            projectId: adapter.projectId,
            ownerKey: adapter.breakpointOwnerKey,
            skillIndex: index,
            skillId: template.id,
            skillSequence,
            lastSuccessChainIndex: index - 1,
            lastOutput: previousOutput,
            inputPrompt: userPrompt,
            agentId:
              adapter.getSkillAgentId(template.id) || adapter.getBaseAgentId(),
            retryCount:
              Number(
                breakpoint?.skillId === template.id
                  ? breakpoint.retryCount || 0
                  : 0,
              ) + 1,
            error: error instanceof Error ? error.message : String(error),
          }),
        )
        throw error
      }
      callbacks.onChunk?.(current)
    }
    await adapter.clearBreakpoint(adapter.breakpointOwnerKey)
    callbacks.onRoutingEvent?.({ type: 'run_completed', state: 'completed' })
  return {
    text: current,
    meta: allMetas[allMetas.length - 1] || lastRunMeta.get(input) || null,
    terminalStatus: resolveArtifactTerminal(
      artifactAcceptance,
      allMetas[allMetas.length - 1]?.postProcessReport,
    ).runStatus,
    terminalReason: resolveArtifactTerminal(
      artifactAcceptance,
      allMetas[allMetas.length - 1]?.postProcessReport,
    ).eventReason,
    allMetas,
      mode: 'chain',
      intent: intentResult.intent,
      routing: effectiveRoutingResult,
      runState: 'completed',
    }
  }

  const context = adapter.buildTemplateContext(input.requestText)
  const composeRouting = await resolveWorkspaceIntentRouting(
    input,
    adapter,
    templates,
    callbacks,
  )
  const composeReadonlyIntent = resolveReadonlyFallbackIntent(composeRouting)
  if (composeRouting.kind !== 'matched' && !composeReadonlyIntent) {
    callbacks.onRoutingEvent?.({
      type: 'fallback_requested',
      result: composeRouting,
    })
    return {
      text: '',
      meta: null,
      mode: 'compose',
      intent: 'auto',
      routing: composeRouting,
      runState: 'awaiting_user',
      allMetas: [],
      awaiting: {
        routing: composeRouting,
        recommendedSkills: filterTemplatesByIntent(
          templates,
          inferRoutingFallbackIntent(composeRouting),
        ).filtered,
      },
    }
  }
  const intent: ChainIntent = composeRouting.kind === 'matched'
    ? composeRouting.intent
    : composeReadonlyIntent || 'discuss'
  const composeToolSurface = resolveAuthorizedToolSurface(
    adapter,
    intent,
    0,
    'compose',
    input.requestText,
  )
  const parts = mergePromptParts(
    templates.map((template) => {
      const templateContext = { ...context, ...(template.customVars || {}) }
      return getPromptParts(
        resolveWorkspaceTemplate(template.template, templateContext),
        template.injectMode || 'system_prefix',
      )
    }),
  )
  templates.forEach((template) => validateInput(template, context))
  const combinedTemplate = combineComposeTemplate(templates)
  const composeSkillId = combinedTemplate.id || 'compose'
  const composeSkillName = templates
    .map((template) => template.name || template.id)
    .join(' + ')
  const composeProvider = adapter.getProvider(
    adapter.getAgent(
      adapter.getSkillAgentId(templates[0]?.id || '') ||
        adapter.getBaseAgentId(),
    ),
  )
  const composeModel =
    composeProvider?.selectedModel ||
    composeProvider?.models?.[0] ||
    adapter.preferredModel ||
    'unknown'
  const composeStart = performance.now()
  const composeCallId = callbacks.onApiCallStart?.(
    composeSkillId,
    composeSkillName,
    composeModel,
    composeToolSurface.actualToolSurface,
  )
  if (composeCallId) {
    let composeCallIds = activeSkillCallIds.get(input)
    if (!composeCallIds) {
      composeCallIds = new Map<string, string>()
      activeSkillCallIds.set(input, composeCallIds)
    }
    composeCallIds.set(composeSkillId, composeCallId)
  }
  let text = ''
  let composeArtifact: WorkspaceArtifactAcceptanceResult | null = null
  try {
    text = await callWorkspaceSkill(
      input,
      combinedTemplate,
      parts,
      `用户请求: ${input.requestText}`,
      context,
      {
        requestText: input.requestText,
        includeHistory: true,
        intent,
        mode: 'compose',
      },
      () => {
        callbacks.onFirstChunk?.()
        callbacks.onStatus?.('正在生成...')
      },
    )
    if (input.artifactContract) {
      composeArtifact = acceptWorkspaceArtifact({
        rawOutput: text,
        callerStatus: lastRunMeta.get(input)?.status === 'degraded' ? 'degraded' : 'success',
        degradedErrors: lastRunMeta.get(input)?.diagnostics
          ?.filter(diagnostic => diagnostic.type === 'warning' || diagnostic.type === 'error')
          .map(diagnostic => diagnostic.message) || [],
        contract: input.artifactContract,
      })
      callbacks.onArtifactAcceptance?.(composeArtifact, 0, 'compose')
      if (composeArtifact.decision === 'reject') {
        throw new Error(
          `工作区产物步骤验收失败（${composeArtifact.terminalReason}）：${composeArtifact.errors.join('；')}`,
        )
      }
      text = composeArtifact.downstreamPayload || text
    }
    if (composeCallId) {
      activeSkillCallIds.get(input)?.delete(composeSkillId)
    }
    callbacks.onApiCallFinish?.(
      composeCallId || '',
      lastRunMeta.get(input) || {
        requestMessages: [],
        model: composeModel,
        skillId: composeSkillId,
      },
      Math.round(performance.now() - composeStart),
          { status: 'success', text, reasoning: lastRunMeta.get(input)?.reasoningText },
    )
  } catch (error) {
    if (composeCallId) {
      activeSkillCallIds.get(input)?.delete(composeSkillId)
    }
    callbacks.onApiCallFinish?.(
      composeCallId || '',
      lastRunMeta.get(input) || {
        requestMessages: [],
        model: composeModel,
        skillId: composeSkillId,
      },
      Math.round(performance.now() - composeStart),
      { status: 'failed', text: '' },
    )
    throw error
  }
  return {
    text,
    meta: lastRunMeta.get(input) || null,
    terminalStatus: resolveArtifactTerminal(
      composeArtifact,
      lastRunMeta.get(input)?.postProcessReport,
    ).runStatus,
    terminalReason: resolveArtifactTerminal(
      composeArtifact,
      lastRunMeta.get(input)?.postProcessReport,
    ).eventReason,
    allMetas: [lastRunMeta.get(input)].filter(
      Boolean,
    ) as WorkspaceSkillRunMeta[],
    mode: 'compose',
    intent,
    routing: composeRouting,
    runState: 'completed',
  }
}
