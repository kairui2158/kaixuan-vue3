import type { AiService, CallAiResult } from './aiService'
import type {
  ContextBundle,
  ContextMessage,
  ContextPolicy,
  ContextRef,
  ContextTurn,
  ContextWorkspaceState,
} from '../types/context'
import type { ContextBuildInput } from './conversationContextService'
import type { ConversationContextService } from './conversationContextService'
import { buildChainSkillPrompt } from './chainExecution'
import {
  createChainFailureBreakpoint,
  createChainSuccessBreakpoint,
  getChainResumePoint,
  type ChainBreakpoint,
} from './chainBreakpoint'
import {
  getSkillMaxAttempts,
  validateSkillInput,
  validateSkillOutput,
  validateSkillRules,
  type JsonSchema,
  type SkillRetryPolicy,
} from './skillValidation'
import { routeSkill, type RoutedSkill } from './skillRouter'
import { createApiCallBudget, type ApiCallBudget } from './apiCallBudget'

export type WorkspaceSkillMode = 'chain' | 'compose'

export type WorkspaceSkillTemplate = {
  id: string
  name: string
  template: string
  skill?: RoutedSkill
  customVars?: Record<string, unknown>
  injectMode?: string
  outputFormat?: 'json' | 'text'
  validationRules?: string[]
  inputSchema?: JsonSchema | string
  outputSchema?: JsonSchema | string
  retryPolicy?: SkillRetryPolicy | string
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
  maxTokens?: number
  systemPrompt?: string
}

export type WorkspaceProviderConfig = {
  id?: string
  selectedModel?: string
  models?: string[]
  temperature?: number
  maxTokens?: number
}

export type WorkspaceContextOptions = {
  requestText: string
  previousSkillOutput?: string
  includeHistory?: boolean
}

export type WorkspaceSkillRunMeta = {
  finishReason?: string
  requestMessages: ContextMessage[]
  providerId?: string
  model: string
  agentId?: string
  skillId: string
  status?: 'success' | 'degraded'
  diagnostics?: Array<{ type: 'info' | 'warning' | 'error'; code: string; message: string; at?: string }>
  budget?: { used: number; limit: number }
  fromCache?: boolean
}

export type WorkspaceSkillRunResult = {
  text: string
  meta: WorkspaceSkillRunMeta | null
  mode: WorkspaceSkillMode
}

export type WorkspaceSkillEngineCallbacks = {
  onFirstChunk?: () => void
  onStatus?: (status: string) => void
  onChunk?: (text: string) => void
}

export interface WorkspaceContextServiceLike {
  getPolicy(
    purpose: string,
    skillId?: string,
    skillPolicy?: Parameters<ConversationContextService['getPolicy']>[2],
  ): ContextPolicy
  buildContextBundle(input: ContextBuildInput): Promise<ContextBundle>
  assembleMessages(bundle: ContextBundle, policy: ContextPolicy, base: ContextMessage[]): ContextMessage[]
  recordTurn(ref: ContextRef, turn: ContextTurn): Promise<void>
}

export interface WorkspaceSkillEngineAdapter {
  workspace: 'main' | 'outline'
  source: string
  projectId: string
  step: number
  defaultSystemPrompt: string
  preferredModel?: string
  getBaseAgentId(): string
  getSkillAgentId(skillId: string): string
  getAgent(agentId: string): WorkspaceAgentConfig | null
  getProvider(agent: WorkspaceAgentConfig | null): WorkspaceProviderConfig | null
  getSkillPolicy(template: WorkspaceSkillTemplate): Parameters<ConversationContextService['getPolicy']>[2]
  buildTemplateContext(requestText: string, previousOutput?: string): Record<string, unknown>
  getWorkspaceState(): Partial<ContextWorkspaceState>
  getLegacyMessages(requestText: string): ContextMessage[]
  loadBreakpoint(): Promise<ChainBreakpoint | null>
  saveBreakpoint(breakpoint: ChainBreakpoint): Promise<void>
  clearBreakpoint(): Promise<void>
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
  callbacks?: WorkspaceSkillEngineCallbacks
}

export function getPromptParts(template: string, mode: string): WorkspacePromptParts {
  if (mode === 'user_prefix') return { userPrefix: template }
  if (mode === 'user_suffix') return { userSuffix: template }
  return { systemSkill: template }
}

export function mergePromptParts(parts: WorkspacePromptParts[]): WorkspacePromptParts {
  return {
    systemSkill: parts.map(part => part.systemSkill).filter(Boolean).join('\n\n'),
    userPrefix: parts.map(part => part.userPrefix).filter(Boolean).join('\n\n'),
    userSuffix: parts.map(part => part.userSuffix).filter(Boolean).join('\n\n'),
  }
}

export function resolveWorkspaceTemplate(template: string, context: Record<string, unknown>): string {
  const engine = typeof window !== 'undefined' ? (window as any).SkillExecutionEngine : undefined
  if (engine && typeof engine.resolveTemplate === 'function' && template && /\{\{/.test(template)) {
    try {
      return engine.resolveTemplate(template, context, { keepMissing: false })
    } catch (error) {
      console.warn('[WORKSPACE_SKILL_ENGINE] resolveTemplate failed, using raw template', error)
    }
  }
  return template
}

function validateInput(template: WorkspaceSkillTemplate, input: unknown): void {
  if (!template.inputSchema) return
  const result = validateSkillInput(input, template)
  if (!result.valid) {
    throw new Error('「' + template.name + '」输入校验失败：' + result.errors.join('；'))
  }
}

function validateOutput(template: WorkspaceSkillTemplate, output: string): void {
  const structured = validateSkillOutput(output, template)
  if (!structured.valid) {
    throw new Error('「' + template.name + '」输出校验失败：' + structured.errors.join('；'))
  }
  const rules = validateSkillRules(structured.value ?? output, template.validationRules)
  if (!rules.valid) {
    throw new Error('「' + template.name + '」规则校验失败：' + rules.errors.join('；'))
  }
}

function combineComposeTemplate(templates: WorkspaceSkillTemplate[]): WorkspaceSkillTemplate {
  const folderTemplate = templates.find(template => template.skill)
  if (folderTemplate) {
    return {
      ...folderTemplate,
      template: templates.map(template => template.template).filter(Boolean).join('\n\n'),
      validationRules: templates.flatMap(template => template.validationRules || []),
      outputSchema: templates.find(template => template.outputSchema)?.outputSchema,
      retryPolicy: JSON.stringify({ maxAttempts: templates.reduce((max, template) => Math.max(max, getSkillMaxAttempts(template.retryPolicy)), 1) }),
    }
  }
  return {
    id: 'compose',
    name: templates.map(template => template.name).join(' + '),
    template: '',
    outputFormat: templates.some(template => template.outputFormat === 'json') ? 'json' : 'text',
    validationRules: templates.flatMap(template => template.validationRules || []),
    outputSchema: templates.find(template => template.outputSchema)?.outputSchema,
    retryPolicy: JSON.stringify({ maxAttempts: templates.reduce((max, template) => Math.max(max, getSkillMaxAttempts(template.retryPolicy)), 1) }),
  }
}

function contextPolicy(
  contextService: WorkspaceContextServiceLike,
  adapter: WorkspaceSkillEngineAdapter,
  template: WorkspaceSkillTemplate,
  previousSkillOutput?: string,
): ContextPolicy {
  const policy = contextService.getPolicy('generate', template.id, adapter.getSkillPolicy(template))
  if (previousSkillOutput === undefined) return policy
  return {
    ...policy,
    chatHistory: 'none',
    includeOutline: false,
    includeSettings: false,
    includeMemory: false,
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
  validateInput(template, inputContext)
  if (template.skill) {
    const previousOutput = (inputContext as { previousOutput?: unknown }).previousOutput
    const folderInput = typeof previousOutput === 'string' && previousOutput.trim()
      ? `原始用户请求: ${contextOptions.requestText}\n\n请继续处理上一步 SKILL 输出：\n${previousOutput}`
      : contextOptions.requestText
    const agentId = adapter.getSkillAgentId(template.id) || adapter.getBaseAgentId()
    const agentConfig = agentId ? adapter.getAgent(agentId) : null
    if (agentId && !agentConfig) throw new Error('绑定的智能体不存在：' + agentId)
    const budget = input.apiBudget || createApiCallBudget(8)
    const contextRef: ContextRef = {
      projectId: adapter.projectId,
      workspace: adapter.workspace,
      purpose: 'generate',
      skillId: template.id,
      agentId: agentId || undefined
    }
    const contextBundle = await contextService.buildContextBundle({
      ...contextRef,
      previousSkillOutput: contextOptions.previousSkillOutput,
      workspaceState: adapter.getWorkspaceState(),
      legacyMessages: contextOptions.includeHistory === false
        ? []
        : adapter.getLegacyMessages(contextOptions.requestText)
    })
    const policy = contextPolicy(contextService, adapter, template, contextOptions.previousSkillOutput)
    const route = await routeSkill(template.skill, {
      input: folderInput,
      agent: agentConfig ? {
        id: agentId,
        model: agentConfig.model,
        temperature: agentConfig.temperature,
        maxTokens: agentConfig.maxTokens,
        systemPrompt: agentConfig.systemPrompt
      } : null,
      purpose: 'generate',
      budget,
      skillId: template.id,
      aiService,
      stream: true,
      signal: input.signal,
      onChunk: text => {
        input.callbacks?.onChunk?.(text)
        onProgress?.('正在生成...')
      },
      messageBuilder: (systemPrompt, userPrompt) => {
        return contextService.assembleMessages(contextBundle, policy, [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ])
      }
    })
    if (route.mode === 'folder' && route.folderResult) {
      const folderResult = route.folderResult
      const output = folderResult.output || ''
      if (!output.trim()) throw new Error('API 返回为空')
      await contextService.recordTurn(contextRef, {
        user: contextOptions.requestText,
        assistant: output,
        meta: { source: adapter.source, skillId: template.id, agentId: agentId || undefined }
      })
      lastRunMeta.set(input, {
        finishReason: folderResult.apiMeta?.finishReason,
        requestMessages: folderResult.apiMeta?.requestMessages as ContextMessage[] || [],
        providerId: folderResult.apiMeta?.providerId,
        model: agentConfig?.model || 'folder-skill',
        agentId: agentId || undefined,
        skillId: template.id,
        status: folderResult.status === 'degraded' ? 'degraded' : 'success',
        diagnostics: folderResult.diagnostics,
        budget: budget.snapshot(),
        fromCache: folderResult.fromCache
      })
      return output
    }
    if (!route.fallbackReason) throw new Error('folder SKILL 配置不完整')
    // Only a load failure may fall through to the text path; execution failures already returned text mode with diagnostics.
  }
  const maxAttempts = template.retryPolicy
    ? getSkillMaxAttempts(template.retryPolicy)
    : template.outputFormat === 'json' ? 2 : 1
  const agentId = adapter.getSkillAgentId(template.id) || adapter.getBaseAgentId()
  const agentConfig = agentId ? adapter.getAgent(agentId) : null
  if (agentId && !agentConfig) throw new Error('绑定的智能体不存在：' + agentId)
  const provider = adapter.getProvider(agentConfig)
  if (!provider) throw new Error('请先配置API供应商')
  const model = adapter.preferredModel
    || agentConfig?.model
    || provider.selectedModel
    || provider.models?.[0]
    || 'gpt-4o'
  const temperature = agentConfig?.temperature ?? provider.temperature ?? 0.7
  const maxTokens = agentConfig?.maxTokens || provider.maxTokens || 8192
  const systemPrompt = [injection.systemSkill, agentConfig?.systemPrompt].filter(Boolean).join('\n\n')
    || adapter.defaultSystemPrompt
  const userPromptParts = [injection.userPrefix, userPrompt, injection.userSuffix].filter(Boolean)
  const contextRef: ContextRef = {
    projectId: adapter.projectId,
    workspace: adapter.workspace,
    purpose: 'generate',
    skillId: template.id,
    agentId: agentId || undefined,
  }
  const contextBundle = await contextService.buildContextBundle({
    ...contextRef,
    previousSkillOutput: contextOptions.previousSkillOutput,
    workspaceState: adapter.getWorkspaceState(),
    legacyMessages: contextOptions.includeHistory === false
      ? []
      : adapter.getLegacyMessages(contextOptions.requestText),
  })
  const policy = contextPolicy(contextService, adapter, template, contextOptions.previousSkillOutput)
  let lastError: unknown = null
  let lastResult: CallAiResult | null = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptPrompt = attempt === 1
      ? userPromptParts.join('\n\n')
      : userPromptParts.join('\n\n') + '\n\n[校验重试] 上次输出未满足技能的结构化约束，请只返回符合要求的结果。'
    try {
      const requestMessages = contextService.assembleMessages(contextBundle, policy, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: attemptPrompt },
      ])
      const result = await input.aiService.callAi({
        purpose: 'generate',
        messages: requestMessages,
        model,
        temperature,
        maxTokens,
        signal: input.signal,
        onChunk: (text: string) => {
          input.callbacks?.onChunk?.(text)
          onProgress?.('正在生成...')
        },
        retry: true,
        meta: { source: adapter.source, skillId: template.id, agentId: agentId || undefined },
      })
      const output = result.text || ''
      if (!output.trim()) throw new Error('API 返回为空')
      validateOutput(template, output)
      await contextService.recordTurn(contextRef, {
        user: contextOptions.requestText,
        assistant: output,
        meta: { source: adapter.source, skillId: template.id, agentId: agentId || undefined },
      })
      lastResult = result
      lastRunMeta.set(input, {
        finishReason: result.finishReason,
        requestMessages,
        providerId: result.providerId,
        model,
        agentId: agentId || undefined,
        skillId: template.id,
      })
      return output
    } catch (error) {
      lastError = error
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
    })
  }
  throw lastError instanceof Error ? lastError : new Error('技能输出校验失败')
}

const lastRunMeta = new WeakMap<RunWorkspaceSkillsInput, WorkspaceSkillRunMeta>()

export async function runWorkspaceSkills(input: RunWorkspaceSkillsInput): Promise<WorkspaceSkillRunResult> {
  const { adapter, contextService, templates } = input
  const callbacks = input.callbacks || {}
  if (templates.length === 0) throw new Error('未选择可执行技能')

  if (input.mode === 'chain' && templates.length > 1) {
    const skillSequence = templates.map(template => template.id)
    const breakpoint = await adapter.loadBreakpoint()
    const resumePoint = getChainResumePoint({
      breakpoint,
      step: adapter.step,
      projectId: adapter.projectId,
      skillSequence,
    })
    let current = resumePoint.previousOutput || input.requestText
    let startIndex = resumePoint.startIndex
    if (resumePoint.resumed) callbacks.onStatus?.(`从第 ${startIndex + 1} 步继续`)
    for (let index = startIndex; index < templates.length; index++) {
      const template = templates[index]
      const previousOutput = index === 0 ? '' : current
      const templateContext = {
        ...adapter.buildTemplateContext(input.requestText, previousOutput || undefined),
        ...(template.customVars || {}),
      }
      const injection = getPromptParts(
        resolveWorkspaceTemplate(template.template, templateContext),
        template.injectMode || 'system_prefix',
      )
      const userPrompt = index === 0
        ? buildChainSkillPrompt({
          initialPrompt: `用户请求: ${input.requestText}\n\n请执行当前 SKILL：${template.name || template.id}`,
          previousOutput: '',
          isFirst: true,
        })
        : `原始用户请求: ${input.requestText}\n\n请执行当前 SKILL：${template.name || template.id}。请严格基于上下文中的“上一步 SKILL 完整输出”继续处理。`
      callbacks.onStatus?.(`Skill ${index + 1}/${templates.length}：${template.name || template.id}`)
      try {
        current = await callWorkspaceSkill(
          input,
          template,
          injection,
          userPrompt,
          { ...templateContext, previousOutput },
          {
            requestText: input.requestText,
            previousSkillOutput: index === 0 ? undefined : current,
            includeHistory: index === 0,
          },
          () => {
            callbacks.onFirstChunk?.()
            callbacks.onStatus?.(`Skill ${index + 1}/${templates.length}：正在生成...`)
          },
        )
        await adapter.saveBreakpoint(createChainSuccessBreakpoint({
          step: adapter.step,
          projectId: adapter.projectId,
          skillIndex: index,
          skillId: template.id,
          skillSequence,
          lastSuccessChainIndex: index,
          lastOutput: current,
          inputPrompt: userPrompt,
          agentId: adapter.getSkillAgentId(template.id) || adapter.getBaseAgentId(),
          retryCount: 0,
        }))
      } catch (error) {
        await adapter.saveBreakpoint(createChainFailureBreakpoint({
          step: adapter.step,
          projectId: adapter.projectId,
          skillIndex: index,
          skillId: template.id,
          skillSequence,
          lastSuccessChainIndex: index - 1,
          lastOutput: previousOutput,
          inputPrompt: userPrompt,
          agentId: adapter.getSkillAgentId(template.id) || adapter.getBaseAgentId(),
          retryCount: Number(breakpoint?.skillId === template.id ? breakpoint.retryCount || 0 : 0) + 1,
          error: error instanceof Error ? error.message : String(error),
        }))
        throw error
      }
      callbacks.onChunk?.(current)
    }
    await adapter.clearBreakpoint()
    return { text: current, meta: lastRunMeta.get(input) || null, mode: 'chain' }
  }

  const context = adapter.buildTemplateContext(input.requestText)
  const parts = mergePromptParts(templates.map(template => {
    const templateContext = { ...context, ...(template.customVars || {}) }
    return getPromptParts(
      resolveWorkspaceTemplate(template.template, templateContext),
      template.injectMode || 'system_prefix',
    )
  }))
  templates.forEach(template => validateInput(template, context))
  const combinedTemplate = combineComposeTemplate(templates)
  const text = await callWorkspaceSkill(
    input,
    combinedTemplate,
    parts,
    `用户请求: ${input.requestText}`,
    context,
    { requestText: input.requestText, includeHistory: true },
    () => {
      callbacks.onFirstChunk?.()
      callbacks.onStatus?.('正在生成...')
    },
  )
  return { text, meta: lastRunMeta.get(input) || null, mode: 'compose' }
}
