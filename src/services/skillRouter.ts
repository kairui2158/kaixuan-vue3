import { executeRealSkill } from './realSkillExecutor'
import { loadRealSkill } from './realSkillLoader'
import { executeCompositeSkill } from './skillOrchestrator'
import type {
  RealSkillPackage,
  RealSkillAgentContext,
  RealSkillExecuteOptions,
  RealSkillExecutionResult
} from './realSkillTypes'

export interface RoutedSkill {
  id: string
  format?: 'text' | 'folder'
  folderPath?: string
}

export interface SkillRouteOptions {
  input: string
  agent?: RealSkillAgentContext | null
  purpose?: 'rewrite' | 'verify' | 'generate'
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
  onGenerationEvent?: RealSkillExecuteOptions['onGenerationEvent']
  onRequestBuilt?: (messages: Array<{ role: string; content: string }>) => void
  onFolderLoaded?: (pkg: RealSkillPackage) => void
  messageBuilder?: (systemPrompt: string, userPrompt: string) => Array<{ role: string; content: string }>
  toolContext?: RealSkillExecuteOptions['toolContext']
  systemPromptSuffix?: string
  agentSource?: 'user-binding' | 'step-default' | 'none'
  baseTemplateOverride?: string
  resolvedTemplate?: string
  templateVariables?: Record<string, unknown>
  validateOutputSchema?: boolean
  tools?: RealSkillExecuteOptions['tools']
  toolPolicy?: RealSkillExecuteOptions['toolPolicy']
  toolSurface?: RealSkillExecuteOptions['toolSurface']
  activeEditTask?: RealSkillExecuteOptions['activeEditTask']
}

export interface SkillRouteResult {
  mode: 'text' | 'folder'
  folderResult?: RealSkillExecutionResult
  compositeResult?: import('./skillOrchestrator').CompositeExecutionResult
  fallbackReason?: string
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
    return { mode: 'text', fallbackReason: 'skill-missing' }
  }
  if (skill.format !== 'folder' || !skill.folderPath) {
    return { mode: 'text' }
  }

  const probe = await loadRealSkill(skill.folderPath)
  if (!probe.package) {
    return {
      mode: 'text',
      fallbackReason: probe.error || 'skill-load-failed'
    }
  }
  options.onFolderLoaded?.(probe.package)

  const executeOptions = {
    folderPath: skill.folderPath,
    input: options.input,
    toolContext: options.toolContext,
    agent: options.agent,
    agentSource: options.agentSource,
    purpose: options.purpose,
    budget: options.budget,
    skillId: options.skillId || skill.id,
    aiService: options.aiService,
    stream: options.stream,
    signal: options.signal,
    timeoutMs: options.timeoutMs,
    onChunk: options.onChunk,
    onReasoning: options.onReasoning,
    onPhysicalCall: options.onPhysicalCall,
    onGenerationEvent: options.onGenerationEvent,
    onRequestBuilt: options.onRequestBuilt,
    messageBuilder: options.messageBuilder,
    systemPromptSuffix: options.systemPromptSuffix,
    baseTemplateOverride: options.baseTemplateOverride,
    resolvedTemplate: options.resolvedTemplate,
    templateVariables: options.templateVariables,
    validateOutputSchema: options.validateOutputSchema,
    tools: options.tools,
    toolPolicy: options.toolPolicy,
    toolSurface: options.toolSurface,
    activeEditTask: options.activeEditTask
  }

  if (probe.package.meta.executionMode === 'composite') {
    const compositeResult = await executeCompositeSkill(executeOptions)
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
