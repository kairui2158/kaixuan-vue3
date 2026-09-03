import { describe, expect, it, vi } from 'vitest'
import {
  mergePromptParts,
  getPromptParts,
  runWorkspaceSkills,
  type WorkspaceSkillEngineAdapter,
  type WorkspaceSkillTemplate,
} from './workspaceSkillEngine'
import type { AiService, CallAiResult } from './aiService'
import type { WorkspaceContextServiceLike } from './workspaceSkillEngine'
import type { ContextBundle, ContextMessage, ContextPolicy, ContextRef, ContextTurn } from '../types/context'
import type { ChainBreakpoint } from './chainBreakpoint'

type Call = {
  messages: Array<{ role: string; content: string }>
  model?: string
  temperature?: number
  maxTokens?: number
  meta?: Record<string, unknown>
}

function makeTemplate(id: string, name: string, overrides: Partial<WorkspaceSkillTemplate> = {}): WorkspaceSkillTemplate {
  return {
    id,
    name,
    template: `执行 ${name}`,
    ...overrides,
  }
}

function makeContextService(): WorkspaceContextServiceLike {
  return {
    getPolicy: vi.fn(() => ({
      chatHistory: 'recent' as const,
      recentTurns: 10,
      includeOutline: true,
      includeSettings: true,
      includeMemory: true,
    })),
    buildContextBundle: vi.fn(async (input: ContextRef): Promise<ContextBundle> => ({
      session: { id: input.skillId || 'default', projectId: input.projectId, recentMessages: [] },
      workspace: {},
      execution: { purpose: 'generate' },
    })),
    assembleMessages: vi.fn((_bundle: ContextBundle, _policy: ContextPolicy, base: ContextMessage[]) => base),
    recordTurn: vi.fn(async (_ref: ContextRef, _turn: ContextTurn) => undefined),
  }
}

function makeAdapter(overrides: Partial<WorkspaceSkillEngineAdapter> = {}): WorkspaceSkillEngineAdapter {
  return {
    workspace: 'outline',
    source: 'TestWorkspace.skill',
    projectId: 'project-1',
    step: 0,
    defaultSystemPrompt: '默认助手',
    getBaseAgentId: () => '',
    getSkillAgentId: () => '',
    getAgent: () => null,
    getProvider: () => ({ selectedModel: 'provider-model' }),
    getSkillPolicy: () => undefined,
    buildTemplateContext: (requestText, previousOutput) => ({
      userPrompt: requestText,
      selectedText: requestText,
      outlineContent: '',
      novelTitle: '',
      prevResponse: previousOutput || '',
    }),
    getWorkspaceState: () => ({}),
    getLegacyMessages: () => [],
    loadBreakpoint: async () => null,
    saveBreakpoint: vi.fn(),
    clearBreakpoint: vi.fn(),
    ...overrides,
  }
}

function makeAiService(outputs: string[]) {
  const calls: Call[] = []
  let index = 0
  const callAi = vi.fn(async (params: Call): Promise<CallAiResult> => {
    calls.push(params)
    const text = outputs[Math.min(index, outputs.length - 1)]
    index += 1
    return {
      text,
      reasoning: '',
      finishReason: 'stop',
      providerId: 'provider-1',
      model: params.model,
    }
  })
  return { aiService: { callAi } as unknown as AiService & { callAi: ReturnType<typeof vi.fn> }, calls }
}

describe('workspace skill engine', () => {
  it('maps skill injection modes and merges compose parts', () => {
    expect(getPromptParts('A', 'system_prefix')).toEqual({ systemSkill: 'A' })
    expect(getPromptParts('B', 'user_prefix')).toEqual({ userPrefix: 'B' })
    expect(getPromptParts('C', 'user_suffix')).toEqual({ userSuffix: 'C' })
    expect(mergePromptParts([
      { systemSkill: 'A' },
      { userPrefix: 'B' },
      { userSuffix: 'C' },
    ])).toEqual({
      systemSkill: 'A',
      userPrefix: 'B',
      userSuffix: 'C',
    })
  })

  it('runs a single skill as compose and returns final metadata', async () => {
    const context = makeContextService()
    const adapter = makeAdapter()
    const { aiService, calls } = makeAiService(['最终结果'])
    const result = await runWorkspaceSkills({
      requestText: '写一个大纲',
      templates: [makeTemplate('s1', '解析')],
      mode: 'chain',
      aiService,
      contextService: context,
      adapter,
    })
    expect(result.text).toBe('最终结果')
    expect(result.mode).toBe('compose')
    expect(result.meta?.skillId).toBe('compose')
    expect(calls).toHaveLength(1)
    expect(calls[0].messages[0]).toEqual({ role: 'system', content: '执行 解析' })
    expect(calls[0].messages[1]?.content).toContain('用户请求: 写一个大纲')
  })

  it('passes full previous output to the next chain skill and records every step', async () => {
    const context = makeContextService()
    const adapter = makeAdapter()
    const { aiService, calls } = makeAiService(['第一步输出', '第二步输出'])
    const result = await runWorkspaceSkills({
      requestText: '续写设定',
      templates: [makeTemplate('s1', '解析'), makeTemplate('s2', '推演')],
      mode: 'chain',
      aiService,
      contextService: context,
      adapter,
    })
    expect(result.text).toBe('第二步输出')
    expect(result.mode).toBe('chain')
    expect(calls).toHaveLength(2)
    expect(calls[1].messages[1]?.content).toContain('请严格基于上下文中的“上一步 SKILL 完整输出”继续处理')
    expect(context.buildContextBundle).toHaveBeenNthCalledWith(2, expect.objectContaining({
      skillId: 's2',
      previousSkillOutput: '第一步输出',
    }))
    expect(adapter.clearBreakpoint).toHaveBeenCalledTimes(1)
  })

  it('uses per-skill agent before base agent and default provider', async () => {
    const context = makeContextService()
    const adapter = makeAdapter({
      getBaseAgentId: () => 'base-agent',
      getSkillAgentId: skillId => skillId === 's2' ? 'skill-agent' : '',
      getAgent: agentId => agentId === 'skill-agent'
        ? { model: 'skill-model', temperature: 0.2, maxTokens: 1234, systemPrompt: '专属智能体' }
        : agentId === 'base-agent'
          ? { model: 'base-model' }
          : null,
    })
    const { aiService, calls } = makeAiService(['A', 'B'])
    await runWorkspaceSkills({
      requestText: '执行',
      templates: [makeTemplate('s1', '一'), makeTemplate('s2', '二')],
      mode: 'chain',
      aiService,
      contextService: context,
      adapter,
    })
    expect(calls[0].model).toBe('base-model')
    expect(calls[1].model).toBe('skill-model')
    expect(calls[1].temperature).toBe(0.2)
    expect(calls[1].maxTokens).toBe(1234)
    expect(calls[1].meta).toMatchObject({ agentId: 'skill-agent', skillId: 's2' })
    expect(calls[1].messages[0]?.content).toContain('专属智能体')
  })

  it('retries invalid structured output and keeps validation error when attempts end', async () => {
    const context = makeContextService()
    const adapter = makeAdapter()
    const { aiService, calls } = makeAiService(['不是JSON'])
    const template = makeTemplate('json-skill', 'JSON技能', {
      outputFormat: 'json',
      outputSchema: { type: 'object', required: ['result'] },
      retryPolicy: { maxAttempts: 2 },
    })
    await expect(runWorkspaceSkills({
      requestText: '生成JSON',
      templates: [template],
      mode: 'compose',
      aiService,
      contextService: context,
      adapter,
    })).rejects.toThrow('输出校验失败')
    expect(calls).toHaveLength(2)
    expect(calls[1].messages[1]?.content).toContain('[校验重试]')
  })

  it('writes a failure breakpoint and resumes from the failed skill output', async () => {
    const context = makeContextService()
    let saved: ChainBreakpoint | null = null
    const adapter = makeAdapter({
      loadBreakpoint: async () => null,
      saveBreakpoint: vi.fn(async (breakpoint: ChainBreakpoint) => { saved = breakpoint }),
    })
    const firstRun = makeAiService(['第一步输出'])
    firstRun.aiService.callAi.mockImplementationOnce(async () => ({ text: '第一步输出', reasoning: '' }) as never)
      .mockImplementationOnce(async () => { throw new Error('第二步失败') })
    await expect(runWorkspaceSkills({
      requestText: '生成',
      templates: [makeTemplate('s1', '一'), makeTemplate('s2', '二')],
      mode: 'chain',
      aiService: firstRun.aiService,
      contextService: context,
      adapter,
    })).rejects.toThrow('第二步失败')
    expect(saved).toMatchObject({
      status: 'failed',
      skillId: 's2',
      lastSuccessChainIndex: 0,
      lastOutput: '第一步输出',
      retryCount: 1,
    })

    const resumeAdapter = makeAdapter({ loadBreakpoint: async () => saved })
    const resumed = makeAiService(['第二步续跑'])
    const result = await runWorkspaceSkills({
      requestText: '生成',
      templates: [makeTemplate('s1', '一'), makeTemplate('s2', '二')],
      mode: 'chain',
      aiService: resumed.aiService,
      contextService: context,
      adapter: resumeAdapter,
    })
    expect(result.text).toBe('第二步续跑')
    expect(resumed.calls).toHaveLength(1)
    expect(resumed.calls[0].messages[1]?.content).toContain('请执行当前 SKILL：二')
  })
})
