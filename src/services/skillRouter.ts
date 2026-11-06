import { executeRealSkill } from './realSkillExecutor'
import { loadRealSkill } from './realSkillLoader'
import { executeCompositeSkill } from './skillOrchestrator'
import type {
  RealSkillPackage,
  RealSkillAgentContext,
  RealSkillExecuteOptions,
  RealSkillFileFingerprint,
  RealSkillExecutionResult
} from './realSkillTypes'

export interface RoutedSkill {
  id: string
  format?: 'text' | 'folder'
  folderPath?: string
  description?: string
  name?: string
}

export interface SkillRouteOptions {
  input: string
  /** Run-level SKILL package pin; threaded through to the folder executor. */
  pinnedFingerprint?: RealSkillFileFingerprint[]
  onSkillVersionMismatch?: RealSkillExecuteOptions['onSkillVersionMismatch']
  traceRunId?: string | null
  traceCallId?: string | null
  chainUpstreamContext?: string
  agent?: RealSkillAgentContext | null
  purpose?: 'rewrite' | 'verify' | 'generate'
  providerId?: string
  contextLayer?: RealSkillExecuteOptions['contextLayer']
  providerModel?: string
  providerModelSource?: 'caller-profile'
  providerModelFallback?: { reason: 'agent-model-without-provider'; configuredModel: string }
  providerModelMissing?: boolean
  providerSource?: RealSkillExecuteOptions['providerSource']
  budget: { tryConsume: (step: string, skillLimit?: number | null) => any }
  skillId?: string
  aiService?: {
    callAi: (params: any) => Promise<{ text: string; finishReason?: string; providerId?: string; usage?: Record<string, unknown> }>
  }
  stream?: boolean
  signal?: AbortSignal
  timeoutMs?: number
  onChunk?: (text: string) => void
  onReasoning?: (text: string) => void
  onPhysicalCall?: (event: import('./aiService').PhysicalCallEvent) => void
  onProviderQueue?: (event: import('./providerScheduler').ProviderQueueEvent) => void
  onGenerationEvent?: RealSkillExecuteOptions['onGenerationEvent']
  onRequestBuilt?: (messages: Array<{ role: string; content: string }>) => void
  onFolderLoaded?: (pkg: RealSkillPackage) => void
  messageBuilder?: (systemPrompt: string, userPrompt: string) => Array<{ role: string; content: string }>
  toolContext?: RealSkillExecuteOptions['toolContext']
  systemPromptSuffix?: string
  userPromptSuffix?: string
  protectedContract?: RealSkillExecuteOptions['protectedContract']
  agentSource?: 'user-binding' | 'step-default' | 'none'
  baseTemplateOverride?: string
  resolvedTemplate?: string
  templateVariables?: Record<string, unknown>
  validateOutputSchema?: boolean
  tools?: RealSkillExecuteOptions['tools']
  toolPolicy?: RealSkillExecuteOptions['toolPolicy']
  toolSurface?: RealSkillExecuteOptions['toolSurface']
  activeEditTask?: RealSkillExecuteOptions['activeEditTask']
  executionPlan?: RealSkillExecuteOptions['executionPlan']
  finalStepRetry?: RealSkillExecuteOptions['finalStepRetry']
  onFinalStepFeedbackComposed?: RealSkillExecuteOptions['onFinalStepFeedbackComposed']
  onSchemaRetryFeedbackComposed?: RealSkillExecuteOptions['onSchemaRetryFeedbackComposed']
}

export interface SkillRouteResult {
  mode: 'text' | 'folder'
  folderResult?: RealSkillExecutionResult
  compositeResult?: import('./skillOrchestrator').CompositeExecutionResult
  fallbackReason?: string
  /** Structured fallback context. Prefer this over the legacy fallbackReason string. */
  fallback?: {
    code: string
    message: string
    folderPath?: string
    skillId?: string
    skillName?: string
    action?: string
  }
}

export function formatSkillFallback(fallback: SkillRouteResult['fallback']): string {
  if (!fallback) return ''
  const skill = fallback.skillName || fallback.skillId || '未命名 SKILL'
  const parts = [
    `${skill} 加载失败（${fallback.code}）：${fallback.message}`,
    fallback.folderPath ? `绑定路径：${fallback.folderPath}` : '',
    fallback.action || ''
  ]
  return parts.filter(Boolean).join('\n')
}

function compositeToExecutionResult(
  result: import('./skillOrchestrator').CompositeExecutionResult
): RealSkillExecutionResult {
  if (result.status === 'DONE') {
    return {
      status: 'success',
      output: result.output,
      errors: result.errors,
      diagnostics: result.diagnostics,
      folderPackageCache: false,
      apiMeta: result.apiMeta
    }
  }
  if (result.status === 'DONE_WITH_CONCERNS') {
    return {
      status: 'degraded',
      output: result.output,
      errors: result.errors,
      diagnostics: result.diagnostics,
      folderPackageCache: false,
      apiMeta: result.apiMeta
    }
  }
  return {
    status: 'blocked',
    output: '',
    errors: result.errors,
    diagnostics: result.diagnostics,
    folderPackageCache: false,
    apiMeta: result.apiMeta
  }
}

/**
 * Routes one skill to either the existing text path or the folder SKILL executor.
 * The router never writes project data or opens UI; callers keep presentation ownership.
 */
export async function routeSkill(
  skill: RoutedSkill | undefined | null,
  options: SkillRouteOptions
): Promise<SkillRouteResult> {
  if (!skill) {
    return {
      mode: 'text',
      fallbackReason: 'skill-missing',
      fallback: {
        code: 'skill-missing',
        message: '未找到可执行的 SKILL',
        skillId: options.skillId,
        action: '请检查本层技能配置'
      }
    }
  }
  if (skill.format !== 'folder' || !skill.folderPath) {
    return { mode: 'text' }
  }

  const probe = await loadRealSkill(skill.folderPath)
  if (!probe.package) {
    const code = probe.error || 'skill-load-failed'
    const failure = probe.failure || {
      code,
      message: 'SKILL 文件夹加载失败',
      folderPath: skill.folderPath
    }
    return {
      mode: 'text',
      fallbackReason: code,
      fallback: {
        ...failure,
        folderPath: failure.folderPath || skill.folderPath,
        skillId: options.skillId || skill.id,
        skillName: skill.name || undefined
      }
    }
  }
  options.onFolderLoaded?.(probe.package)

  const executeOptions = {
    folderPath: skill.folderPath,
    input: options.input,
    ...(options.pinnedFingerprint ? { pinnedFingerprint: options.pinnedFingerprint } : {}),
    ...(options.onSkillVersionMismatch ? { onSkillVersionMismatch: options.onSkillVersionMismatch } : {}),
    traceRunId: options.traceRunId,
    traceCallId: options.traceCallId,
    chainUpstreamContext: options.chainUpstreamContext,
    toolContext: options.toolContext,
    agent: options.agent,
    agentSource: options.agentSource,
    purpose: options.purpose,
    providerId: options.providerId,
    contextLayer: options.contextLayer,
    providerModel: options.providerModel,
    providerModelSource: options.providerModelSource,
    providerModelFallback: options.providerModelFallback,
    providerModelMissing: options.providerModelMissing,
    providerSource: options.providerSource,
    budget: options.budget,
    skillId: options.skillId || skill.id,
    aiService: options.aiService,
    stream: options.stream,
    signal: options.signal,
    timeoutMs: options.timeoutMs,
    onChunk: options.onChunk,
    onReasoning: options.onReasoning,
    onPhysicalCall: options.onPhysicalCall,
    onProviderQueue: options.onProviderQueue,
    onGenerationEvent: options.onGenerationEvent,
    onRequestBuilt: options.onRequestBuilt,
    messageBuilder: options.messageBuilder,
    systemPromptSuffix: options.systemPromptSuffix,
    userPromptSuffix: options.userPromptSuffix,
    ...(options.protectedContract !== undefined ? { protectedContract: options.protectedContract } : {}),
    baseTemplateOverride: options.baseTemplateOverride,
    resolvedTemplate: options.resolvedTemplate,
    templateVariables: options.templateVariables,
    validateOutputSchema: options.validateOutputSchema,
    ...(options.tools !== undefined ? { tools: options.tools } : {}),
    ...(options.toolPolicy !== undefined ? { toolPolicy: options.toolPolicy } : {}),
    ...(options.toolSurface !== undefined ? { toolSurface: options.toolSurface } : {}),
    activeEditTask: options.activeEditTask,
    executionPlan: options.executionPlan,
    finalStepRetry: options.finalStepRetry,
    onFinalStepFeedbackComposed: options.onFinalStepFeedbackComposed,
    onSchemaRetryFeedbackComposed: options.onSchemaRetryFeedbackComposed
  }

  if (probe.package.meta.executionMode === 'composite') {
    // Child folders have their own fingerprints; a parent pin must not fail them.
    const { pinnedFingerprint: _pinned, onSkillVersionMismatch: _onMismatch, ...compositeOptions } = executeOptions
    const compositeResult = await executeCompositeSkill(compositeOptions)
    const folderResult = compositeToExecutionResult(compositeResult)
    if (folderResult.status === 'failed' || folderResult.status === 'blocked') {
      const error = new Error(folderResult.errors[0] || 'composite SKILL 执行失败')
      ;(error as Error & { folderResult?: RealSkillExecutionResult }).folderResult = folderResult
      throw error
    }
    return { mode: 'folder', folderResult, compositeResult }
  }

  const folderResult = await executeRealSkill(executeOptions)

  if (folderResult.status === 'failed' || folderResult.status === 'blocked') {
    const error = new Error(folderResult.errors[0] || 'folder SKILL 执行失败')
    ;(error as Error & { folderResult?: RealSkillExecutionResult }).folderResult = folderResult
    throw error
  }

  return { mode: 'folder', folderResult }
}
