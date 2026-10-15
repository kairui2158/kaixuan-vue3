import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadRealSkill } from './realSkillLoader'
import type {
  ContextBundle,
  ContextMessage,
  ContextPolicy,
  ContextRef,
  ContextTurn,
} from '../types/context'
import type { AiService, CallAiResult } from './aiService'
import type { ChainBreakpoint } from './chainBreakpoint'
import type { WorkspaceContextServiceLike } from './workspaceSkillEngine'
import {
  createApiCallBudget,
} from './apiCallBudget'
import {
  executeRealSkill,
} from './realSkillExecutor'
import {
  resolvePostProcessTerminalStatus,
  buildRoutingResumeToken,
  createRoutingAwaitState,
  validateRoutingResumeToken,
  getPromptParts,
  mergePromptParts,
  runWorkspaceSkills,
  buildWorkspaceSkillGuidance,
  WORKSPACE_SKILL_GUIDANCE_CHAR_LIMIT,
  type WorkspaceSkillEngineAdapter,
  type WorkspaceSkillTemplate,
} from './workspaceSkillEngine'

type Call = {
  messages: Array<{ role: string; content: string }>
  model?: string
  temperature?: number
  maxTokens?: number
  meta?: Record<string, unknown>
  tools?: Array<{ name: string }>
}

vi.mock('./realSkillLoader', () => ({
  loadRealSkill: vi.fn()
}))
vi.mock('./realSkillExecutor', () => ({
  executeRealSkill: vi.fn()
}))

const loadRealSkillMock = vi.mocked(loadRealSkill)
const executeRealSkillMock = vi.mocked(executeRealSkill)

function makeTemplate(
  id: string,
  name: string,
  overrides: Partial<WorkspaceSkillTemplate> = {},
): WorkspaceSkillTemplate {
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
    buildContextBundle: vi.fn(
      async (input: ContextRef): Promise<ContextBundle> => ({
        session: {
          id: input.skillId || 'default',
          projectId: input.projectId,
          recentMessages: [],
        },
        workspace: {},
        execution: { purpose: 'generate' },
      }),
    ),
    assembleMessages: vi.fn(
      (
        _bundle: ContextBundle,
        _policy: ContextPolicy,
        base: ContextMessage[],
      ) => base,
    ),
    buildDialogueContextBlocks: vi.fn(() => [
      {
        source: 'outline' as const,
        version: 'v1',
        coverage: 'structure_map' as const,
      },
    ]),
    recordTurn: vi.fn(
      async (_ref: ContextRef, _turn: ContextTurn) => undefined,
    ),
  }
}

function makeAdapter(
  overrides: Partial<WorkspaceSkillEngineAdapter> = {},
): WorkspaceSkillEngineAdapter {
  return {
    workspace: 'outline',
    source: 'TestWorkspace.skill',
    projectId: 'project-1',
    breakpointOwnerKey: 'outline:project-1',
    toolContext: {
      targetId: 'outline',
      readableTargets: ['outline'],
    },
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
  return {
    aiService: { callAi } as unknown as AiService & {
      callAi: ReturnType<typeof vi.fn>
    },
    calls,
  }
}

describe('workspace skill engine', () => {
  it('builds SKILL guidance without changing the execution surface', () => {
    const adapter = makeAdapter()
    const noTemplates = buildWorkspaceSkillGuidance({
      templates: [],
      requestText: '请修改大纲',
      adapter,
    })
    expect(noTemplates).toEqual({
      guidance: '',
      skillIds: [],
      promptSource: 'none',
      guidanceChars: 0,
      truncated: false,
    })

    const emptyTemplate = buildWorkspaceSkillGuidance({
      templates: [makeTemplate('empty', '空模板', { template: '   ' })],
      requestText: '请修改大纲',
      adapter,
    })
    expect(emptyTemplate.promptSource).toBe('none')
    expect(emptyTemplate.skillIds).toEqual(['empty'])

    const multiple = buildWorkspaceSkillGuidance({
      templates: [
        makeTemplate('s1', '主编'),
        makeTemplate('s2', '审校'),
      ],
      requestText: '请修改大纲',
      adapter,
    })
    expect(multiple.guidance).toBe('执行 主编\n\n执行 审校')
    expect(multiple.skillIds).toEqual(['s1', 's2'])
    expect(multiple.promptSource).toBe('template-system-prefix')
    expect(multiple.truncated).toBe(false)
  })

  it('limits workspace SKILL guidance to the shared 8000-character budget', () => {
    const adapter = makeAdapter()
    const oversized = '领'.repeat(
      WORKSPACE_SKILL_GUIDANCE_CHAR_LIMIT + 25,
    )
    const result = buildWorkspaceSkillGuidance({
      templates: [makeTemplate('long', '长模板', { template: oversized })],
      requestText: '请修改大纲',
      adapter,
    })
    expect(result.guidance).toHaveLength(WORKSPACE_SKILL_GUIDANCE_CHAR_LIMIT)
    expect(result.guidanceChars).toBe(WORKSPACE_SKILL_GUIDANCE_CHAR_LIMIT)
    expect(result.truncated).toBe(true)
    expect(result.promptSource).toBe('template-system-prefix')
  })

  it('derives guidance prompt source from templates and folder packages', () => {
    const adapter = makeAdapter()
    const userAffix = buildWorkspaceSkillGuidance({
      templates: [
        makeTemplate('user-affix', '用户前缀', {
          template: '前缀',
          injectMode: 'user_prefix',
        }),
      ],
      requestText: '请修改大纲',
      adapter,
    })
    expect(userAffix.guidance).toBe('')
    expect(userAffix.promptSource).toBe('template-user-affixes')

    const folderSystemPrompt = 'folder 系统提示'
    const folder = buildWorkspaceSkillGuidance({
      templates: [
        makeTemplate('folder', 'folder 技能', {
          template: '模板正文',
          skill: {
            id: 'folder',
            format: 'folder',
            folderPath: 'D:/skills/folder',
            systemPrompt: folderSystemPrompt,
          } as WorkspaceSkillTemplate['skill'] & {
            systemPrompt?: string
          },
        }),
      ],
      requestText: '请修改大纲',
      adapter,
    })
    expect(folder.guidance).toBe(folderSystemPrompt)
    expect(folder.promptSource).toBe('folder-system-prompt')
    expect(folder.skillIds).toEqual(['folder'])
  })

  it('uses folder template.md as imported guidance when the store record has no systemPrompt', () => {
    const adapter = makeAdapter()
    const folderTemplateText = '# 职责：大纲共创主编\n\n领域提示正文'
    const result = buildWorkspaceSkillGuidance({
      templates: [
        makeTemplate('folder-imported', '导入的 folder 技能', {
          template: folderTemplateText,
          skill: {
            id: 'folder-imported',
            format: 'folder',
            folderPath: 'D:/skills/imported',
            description: '导入的 folder 技能',
          } as WorkspaceSkillTemplate['skill'],
        }),
      ],
      requestText: '请修改大纲',
      adapter,
    })
    expect(result.guidance).toBe(folderTemplateText)
    expect(result.promptSource).toBe('folder-system-prompt')
    expect(result.guidanceChars).toBe(folderTemplateText.length)
  })

  it('creates and validates routing resume tokens', () => {
    const runId = 'run-1'
    const requestText = '请确认这段大纲的意图'
    const state = createRoutingAwaitState({
      runId,
      requestText,
      routing: {
        kind: 'ambiguous',
        confidence: 0.4,
        reason: 'ambiguous-intent',
        candidates: ['discuss', 'edit'],
        fallbackMode: 'await-user',
      },
    })
    expect(state.runId).toBe(runId)
    expect(state.requestText).toBe(requestText)
    expect(state.candidates).toEqual(['discuss', 'edit'])
    expect(state.fallbackMode).toBe('await-user')
    expect(state.resumeToken).toBe(
      buildRoutingResumeToken({
        runId,
        requestText,
        createdAt: state.createdAt,
      }),
    )
    expect(validateRoutingResumeToken(state, runId)).toBe(true)
    expect(validateRoutingResumeToken(state, 'run-2')).toBe(false)
    expect(
      validateRoutingResumeToken(
        { ...state, requestText: requestText + ' ' },
        runId,
      ),
    ).toBe(false)
    expect(
      validateRoutingResumeToken(
        { ...state, createdAt: 0 },
        runId,
      ),
    ).toBe(false)
    expect(
      validateRoutingResumeToken(
        { ...state, resumeToken: state.resumeToken },
        null,
      ),
    ).toBe(false)
    expect(validateRoutingResumeToken(null, runId)).toBe(false)
  })
  beforeEach(() => {
    loadRealSkillMock.mockReset()
    executeRealSkillMock.mockReset()
  })

  it('merges postProcess results into stable terminal statuses', () => {
    expect(resolvePostProcessTerminalStatus(undefined)).toMatchObject({
      processingStatus: 'success',
      runStatus: 'success',
      eventReason: 'post-process-completed',
    })

    expect(resolvePostProcessTerminalStatus({
      applied: true,
      changedOutput: true,
      output: 'changed',
      issues: [],
      durationMs: 2,
    })).toMatchObject({
      processingStatus: 'warning',
      runStatus: 'degraded',
      eventReason: 'post-process-degraded',
    })

    expect(resolvePostProcessTerminalStatus({
      applied: true,
      changedOutput: false,
      output: 'same',
      issues: [{ severity: 'warning', code: 'minor', message: '轻微问题' }],
      durationMs: 2,
    })).toMatchObject({
      processingStatus: 'warning',
      runStatus: 'degraded',
      eventReason: 'post-process-degraded',
    })

    expect(resolvePostProcessTerminalStatus({
      applied: true,
      changedOutput: false,
      output: 'same',
      issues: [{ severity: 'blocking', code: 'lost-section', message: '缺少核心章节' }],
      durationMs: 2,
    })).toMatchObject({
      processingStatus: 'failed',
      runStatus: 'blocked',
      eventReason: 'post-process-blocked',
    })
  })

  it('maps skill injection modes and merges compose parts', () => {
    expect(getPromptParts('A', 'system_prefix')).toEqual({ systemSkill: 'A' })
    expect(getPromptParts('B', 'user_prefix')).toEqual({ userPrefix: 'B' })
    expect(getPromptParts('C', 'user_suffix')).toEqual({ userSuffix: 'C' })
    expect(
      mergePromptParts([
        { systemSkill: 'A' },
        { userPrefix: 'B' },
        { userSuffix: 'C' },
      ]),
    ).toEqual({
      systemSkill: 'A',
      userPrefix: 'B',
      userSuffix: 'C',
    })
  })

  it('runs a single skill as chain and returns final metadata', async () => {
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
    expect(result.mode).toBe('chain')
    expect(result.meta?.skillId).toBe('s1')
    expect(calls).toHaveLength(1)
    expect(calls[0].messages[0]).toEqual({
      role: 'system',
      content: '执行 解析',
    })
    expect(calls[0].messages[1]?.content).toContain('用户请求: 写一个大纲')
  })

  it('keeps discuss-intent chain calls read-only', async () => {
    const context = makeContextService()
    const adapter = makeAdapter({
      buildTools: () => ({
        tools: [
          { name: 'editor.get_state', description: 'Read editor state', policy: 'read', inputSchema: { type: 'object', properties: {} }, execute: async () => ({ ok: true }) },
          { name: 'editor.write', description: 'Direct write', policy: 'write', inputSchema: { type: 'object', properties: {} }, execute: async () => ({ ok: true }) },
        ],
      }),
    })
    const { aiService, calls } = makeAiService(['讨论结果'])
    await runWorkspaceSkills({
      requestText: '讨论',
      templates: [makeTemplate('s1', '诊断', { intents: ['discuss', 'analyze'] })],
      mode: 'chain',
      aiService,
      contextService: context,
      adapter,
      routingOverride: { forcedIntent: 'discuss' },
    })
    expect((calls[0].tools || []).map(tool => tool.name)).toEqual([
      'editor.get_state',
    ])
  })

  it('reuses precomputed routing without calling the LLM classifier again', async () => {
    const context = makeContextService()
    const classifier = vi.fn(async () => ({
      intent: 'discuss',
      confidence: 0.9,
      reason: 'late fallback',
    }))
    const adapter = makeAdapter({ classifyIntentWithLlm: classifier })
    const { aiService, calls } = makeAiService(['讨论结果'])
    const routingEvents: string[] = []

    await runWorkspaceSkills({
      requestText: '这句话没有路由关键词',
      templates: [makeTemplate('s1', '诊断', { intents: ['discuss'] })],
      mode: 'chain',
      aiService,
      contextService: context,
      adapter,
      routingOverride: {
        precomputedRouting: {
          kind: 'no_match',
          confidence: 0.2,
          reason: 'no-keyword-overlap',
          fallbackMode: 'readonly-discuss',
          decisionLayer: 'keyword',
          diagnostics: {
            router: {
              version: 'v6.1',
              layers: ['rule', 'keyword'],
              decisionLayer: 'keyword',
              embeddingModel: null,
              scores: {},
              thresholds: { generate: 0, discuss: 0, analyze: 0, edit: 0 },
              ambiguityThreshold: 0,
              ambiguityThresholds: { generate: 0, discuss: 0, analyze: 0, edit: 0 },
              oosThreshold: 0,
              thresholdSource: 'test',
            },
          },
        },
      },
      callbacks: {
        onRoutingEvent: event => routingEvents.push(event.type),
      },
    })

    expect(classifier).not.toHaveBeenCalled()
    expect(calls).toHaveLength(1)
    expect(routingEvents).toContain('routing_diagnostics')
    expect(routingEvents).toContain('routing_result')
  })

  it('exposes direct write tools only for edit or generate intents', async () => {
    const context = makeContextService()
    const adapter = makeAdapter({
      buildTools: () => ({
        tools: [
          { name: 'editor.get_state', description: 'Read editor state', policy: 'read', inputSchema: { type: 'object', properties: {} }, execute: async () => ({ ok: true }) },
          { name: 'editor.write', description: 'Direct write', policy: 'write', inputSchema: { type: 'object', properties: {} }, execute: async () => ({ ok: true }) },
        ],
      }),
    })
    const { aiService, calls } = makeAiService(['修改结果'])
    await runWorkspaceSkills({
      requestText: '把第一卷的目标改成复仇',
      templates: [makeTemplate('s1', '修改', { intents: ['edit'] })],
      mode: 'chain',
      aiService,
      contextService: context,
      adapter,
      routingOverride: { forcedIntent: 'edit' },
    })
    expect(calls[0].tools?.map(tool => tool.name)).toContain('editor.write')
  })

  it('reports the authorized tool surface to API-call trace callbacks', async () => {
    const context = makeContextService()
    const adapter = makeAdapter({
      buildTools: ({ intent }) => ({
        tools: intent === 'edit'
          ? [
            { name: 'editor.get_state', description: 'Read editor state', policy: 'read', inputSchema: { type: 'object', properties: {} }, execute: async () => ({ ok: true }) },
            { name: 'editor.write', description: 'Direct write', policy: 'write', inputSchema: { type: 'object', properties: {} }, execute: async () => ({ ok: true }) },
          ]
          : [
            { name: 'editor.get_state', description: 'Read editor state', policy: 'read', inputSchema: { type: 'object', properties: {} }, execute: async () => ({ ok: true }) },
          ],
      }),
    })
    const { aiService, calls } = makeAiService(['修改结果'])
    const reportedSurfaces: Array<Array<{ name: string; policy: 'read' | 'write' }>> = []
    await runWorkspaceSkills({
      requestText: '把第一卷的目标改成复仇',
      templates: [makeTemplate('s1', '修改', { intents: ['edit'] })],
      mode: 'chain',
      aiService,
      contextService: context,
      adapter,
      routingOverride: { forcedIntent: 'edit' },
      callbacks: {
        onApiCallStart: (_skillId, _skillName, _model, actualToolSurface) => {
          reportedSurfaces.push(actualToolSurface || [])
          return 'call-1'
        },
      },
    })
    expect(reportedSurfaces).toEqual([
      [
        { name: 'editor.get_state', policy: 'read' },
        { name: 'editor.write', policy: 'write' },
      ],
    ])
    expect(calls[0].tools?.map(tool => tool.name)).toEqual([
      'editor.get_state',
      'editor.write',
    ])
  })

  it('passes the request text and workflow write authorization through the adapter surface', async () => {
    const context = makeContextService()
    const buildTools = vi.fn<
      NonNullable<WorkspaceSkillEngineAdapter['buildTools']>
    >(({ intent, requestText }) => ({
      tools: intent === 'edit'
        ? [
          { name: 'editor.get_state', description: 'Read editor state', policy: 'read', inputSchema: { type: 'object', properties: {} }, execute: async () => ({ ok: true }) },
          { name: 'editor.write', description: 'Direct write', policy: 'write', inputSchema: { type: 'object', properties: {} }, execute: async () => ({ ok: true }) },
        ]
        : [],
    }))
    const adapter = makeAdapter({
      buildTools,
      getExecutionContext: () => ({
        writeAuthorization: {
          source: 'long-document-workflow',
          intent: 'edit',
          operation: 'targeted_edit',
          mode: 'direct',
        },
      }),
    })
    const { aiService, calls } = makeAiService(['修改结果'])

    await runWorkspaceSkills({
      requestText: '把第一卷的目标改成复仇',
      templates: [makeTemplate('s1', '修改', { intents: ['edit'] })],
      mode: 'chain',
      aiService,
      contextService: context,
      adapter,
      routingOverride: { forcedIntent: 'edit' },
    })

    expect(buildTools).toHaveBeenCalledWith(
      expect.objectContaining({ requestText: '把第一卷的目标改成复仇' }),
    )
    expect(calls[0].tools?.map(tool => tool.name)).toContain('editor.write')
  })

  it('does not give short replies pending-preview write authority in the skill engine router', async () => {
    const context = makeContextService()
    const adapter = makeAdapter()
    const { aiService, calls } = makeAiService(['继续结果'])
    const routingResults: string[] = []

    await runWorkspaceSkills({
      requestText: '继续',
      templates: [makeTemplate('s1', '编辑', { intents: ['edit'] })],
      mode: 'chain',
      aiService,
      contextService: context,
      adapter,
      callbacks: {
        onRoutingEvent: event => {
          if (event.type === 'routing_result') routingResults.push(event.result.reason)
        },
      },
    })

    expect(routingResults).not.toContain('pending-long-document-continuation')
    expect(calls).toHaveLength(0)
  })

  it('records compose API calls for success and failure paths', async () => {
    const context = makeContextService()
    const adapter = makeAdapter()
    const { aiService } = makeAiService(['compose 结果'])
    const started: string[] = []
    const finished: string[] = []
    const result = await runWorkspaceSkills({
      requestText: '把内容插入进大纲',
      templates: [makeTemplate('s1', '主编')],
      mode: 'compose',
      aiService,
      contextService: context,
      adapter,
      callbacks: {
        onApiCallStart: (skillId, skillName, model) => {
          started.push(`${skillId}:${skillName}:${model}`)
          return `call-${started.length}`
        },
        onApiCallFinish: (callId, meta, durationMs, callResult) => {
          finished.push(
            `${callId}:${meta.skillId}:${callResult?.status}:${callResult?.text}:${durationMs >= 0}`,
          )
        },
      },
    })

    expect(result.text).toBe('compose 结果')
    expect(started).toEqual(['compose:主编:provider-model'])
    expect(finished).toHaveLength(1)
    expect(finished[0]).toMatch(/^call-1:compose:success:compose 结果:true$/)

    const failingService = {
      callAi: vi.fn(async () => {
        throw new Error('API 失败')
      }),
    } as unknown as AiService
    started.length = 0
    finished.length = 0
    await expect(
      runWorkspaceSkills({
        requestText: '把内容插入进大纲',
        templates: [makeTemplate('s1', '主编')],
        mode: 'compose',
        aiService: failingService,
        contextService: context,
        adapter,
        callbacks: {
          onApiCallStart: () => `call-${started.length + 1}`,
          onApiCallFinish: (callId, meta, durationMs, callResult) => {
            finished.push(
              `${callId}:${meta.skillId}:${callResult?.status}:${durationMs >= 0}`,
            )
          },
        },
      }),
    ).rejects.toThrow('API 失败')
    expect(finished).toHaveLength(1)
    expect(finished[0]).toMatch(/^call-1:compose:failed:true$/)
  })

  it('routes compose requests through the shared intent router', async () => {
    const context = makeContextService()
    const adapter = makeAdapter({
      buildTools: () => ({
        tools: [
          { name: 'editor.get_state', description: 'Read editor state', policy: 'read', inputSchema: { type: 'object', properties: {} }, execute: async () => ({ ok: true }) },
          { name: 'editor.write', description: 'Direct write', policy: 'write', inputSchema: { type: 'object', properties: {} }, execute: async () => ({ ok: true }) },
        ],
      }),
    })
    const { aiService, calls } = makeAiService(['插入完成'])
    const result = await runWorkspaceSkills({
      requestText: '把内容插入进大纲',
      templates: [makeTemplate('s1', '主编')],
      mode: 'compose',
      aiService,
      contextService: context,
      adapter,
    })

    expect(result.runState).toBe('completed')
    expect(result.intent).toBe('edit')
    expect(result.routing).toMatchObject({ kind: 'matched', intent: 'edit' })
    expect(calls[0].tools?.map(tool => tool.name)).toContain('editor.write')
  })

  it('passes structured context blocks to prompt snapshots', async () => {
    const context = makeContextService()
    const adapter = makeAdapter()
    const { aiService } = makeAiService(['compose 结果'])
    const prompts: Array<{ skillId: string; contextBlocks: unknown[] }> = []
    await runWorkspaceSkills({
      requestText: '把内容插入进大纲',
      templates: [makeTemplate('s1', '主编')],
      mode: 'compose',
      aiService,
      contextService: context,
      adapter,
      callbacks: {
        onPromptBuilt: event => {
          prompts.push({ skillId: event.skillId, contextBlocks: event.contextBlocks })
        },
      },
    })

    expect(prompts).toHaveLength(1)
    expect(prompts[0].skillId).toBe('compose')
    expect(prompts[0].contextBlocks).toEqual([
      { source: 'outline', version: 'v1', coverage: 'structure_map' },
    ])
    expect(context.buildDialogueContextBlocks).toHaveBeenCalled()
  })

  it('keeps compose discussion read-only and records routing events', async () => {
    const context = makeContextService()
    const adapter = makeAdapter({
      buildTools: () => ({
        tools: [
          { name: 'editor.get_state', description: 'Read editor state', policy: 'read', inputSchema: { type: 'object', properties: {} }, execute: async () => ({ ok: true }) },
          { name: 'editor.write', description: 'Direct write', policy: 'write', inputSchema: { type: 'object', properties: {} }, execute: async () => ({ ok: true }) },
        ],
      }),
    })
    const { aiService, calls } = makeAiService(['讨论结果'])
    const routingEvents: string[] = []
    const result = await runWorkspaceSkills({
      requestText: '我们聊聊这个设定',
      templates: [makeTemplate('s1', '主编')],
      mode: 'compose',
      aiService,
      contextService: context,
      adapter,
      callbacks: {
        onRoutingEvent: event => routingEvents.push(event.type),
      },
    })

    expect(result.runState).toBe('completed')
    expect(result.intent).toBe('discuss')
    expect(routingEvents).toContain('routing_result')
    expect(calls[0].tools?.map(tool => tool.name)).toEqual([
      'editor.get_state',
    ])
  })

  it('runs read-only discussion fallback instead of blocking compose', async () => {
    const context = makeContextService()
    const adapter = makeAdapter()
    const { aiService, calls } = makeAiService(['我们来继续讨论这个设定'])
    const result = await runWorkspaceSkills({
      requestText: '今天天气不错呀',
      templates: [makeTemplate('s1', '主编')],
      mode: 'compose',
      aiService,
      contextService: context,
      adapter,
    })

    expect(result.runState).toBe('completed')
    expect(result.routing?.kind).toBe('no_match')
    expect(result.intent).toBe('discuss')
    expect(result.text).toBe('我们来继续讨论这个设定')
    expect(calls).toHaveLength(1)
  })

  it('keeps compose write tool calls in run metadata', async () => {
    const context = makeContextService()
    const adapter = makeAdapter()
    const { aiService } = makeAiService(['已完成编辑器写入'])
    aiService.callAi.mockImplementationOnce(async () => ({
      text: '已完成编辑器写入',
      reasoning: '',
      finishReason: 'stop',
      providerId: 'provider-1',
      model: 'provider-model',
      toolCalls: [
        {
          id: 'call-1',
          name: 'editor.write',
          input: {
            commands: [
              { operation: 'insert_after', content: '新增设定', target: '第一卷' },
            ],
            reason: '用户要求插入大纲',
          },
        },
      ],
      toolResults: [],
      toolRequestDeltas: [],
    }))
    const result = await runWorkspaceSkills({
      requestText: '把内容插入进大纲',
      templates: [makeTemplate('s1', '主编')],
      mode: 'compose',
      aiService,
      contextService: context,
      adapter,
    })

    expect(result.intent).toBe('edit')
    expect(result.meta?.toolCalls?.[0]?.name).toBe('editor.write')
    expect(result.meta?.toolCalls?.[0]?.input).toMatchObject({
      commands: [
        { operation: 'insert_after', content: '新增设定', target: '第一卷' },
      ],
    })
  })

  it('passes full previous output to the next chain skill and records full-text handoff', async () => {
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
    expect(calls[1].messages[1]?.content).toContain(
      '只输出当前步骤的定稿产物',
    )
    expect(context.buildContextBundle).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        skillId: 's2',
        previousSkillOutput: '第一步输出',
      }),
    )
    expect(adapter.clearBreakpoint).toHaveBeenCalledTimes(1)
  })

  it('emits full-text handoff artifacts for every completed chain step', async () => {
    const context = makeContextService()
    const adapter = makeAdapter()
    const { aiService } = makeAiService(['第一步输出', '第二步输出'])
    const routingEvents: Array<{ type: string; artifact?: { delivery: string } }> = []
    await runWorkspaceSkills({
      requestText: '续写设定',
      templates: [makeTemplate('s1', '解析'), makeTemplate('s2', '推演')],
      mode: 'chain',
      aiService,
      contextService: context,
      adapter,
      callbacks: {
        onRoutingEvent: event => {
          if (event.type === 'chain_handoff') routingEvents.push(event)
        },
      },
    })
    expect(routingEvents).toHaveLength(2)
    expect(routingEvents.map(event => event.artifact?.delivery)).toEqual(['full_text', 'full_text'])
  })

  it('injects the previous chain output exactly once for text skills', async () => {
    const previousOutput = '第一步完整输出。'.repeat(60)
    const context = makeContextService()
    const capturedBundles: Array<Record<string, unknown>> = []
    ;(context.buildContextBundle as any).mockImplementation(
      async (input: Record<string, unknown>) => {
        capturedBundles.push(input)
        return {
          session: { id: input.skillId || 'default', projectId: input.projectId, recentMessages: [] },
          workspace: {},
          execution: { purpose: 'generate' },
        }
      },
    )
    ;(context.assembleMessages as any).mockImplementation(
      (_bundle: unknown, _policy: unknown, base: ContextMessage[]) => [
        ...base.slice(0, -1),
        {
          role: 'user',
          content: `[上一步 SKILL 完整输出]\n${String(
            (capturedBundles.at(-1) || {}).previousSkillOutput || '',
          )}`,
        },
        ...base.slice(-1),
      ],
    )
    const adapter = makeAdapter()
    const { aiService, calls } = makeAiService([previousOutput, '第二步输出'])
    await runWorkspaceSkills({
      requestText: '续写设定',
      templates: [makeTemplate('s1', '解析'), makeTemplate('s2', '推演')],
      mode: 'chain',
      aiService,
      contextService: context,
      adapter,
      routingOverride: { forcedIntent: 'generate' },
    })
    const secondStepBundle = capturedBundles[1] || {}
    expect(capturedBundles[0] || {}).not.toHaveProperty('previousSkillOutput')
    expect(secondStepBundle).toHaveProperty('previousSkillOutput', previousOutput)
    const secondUserPrompt = String(calls[1].messages.at(-1)?.content || '')
    expect(secondUserPrompt).not.toContain(previousOutput)
    const secondRequestText = calls[1].messages
      .map((message) => message.content)
      .join('\n')
    expect(secondRequestText).toContain('[上一步 SKILL 完整输出]')
    expect(secondRequestText.split(previousOutput).length - 1).toBe(1)
  })

  it('keeps folder handoff in the user prompt and out of the context block', async () => {
    const previousOutput = 'folder 第一步完整输出。'.repeat(40)
    const context = makeContextService()
    const adapter = makeAdapter()
    loadRealSkillMock.mockResolvedValue({
      package: {
        id: 's2',
        name: 'folder 推演',
        description: '',
        template: '',
        meta: {},
        script: '',
        samples: '',
        schema: null,
        folderPath: 'D:/skills/s2',
      } as any,
      error: null,
      folderPackageCache: false,
    })
    executeRealSkillMock.mockResolvedValue({
      status: 'success',
      output: '第二步输出',
      errors: [],
      diagnostics: [],
      folderPackageCache: false,
      apiMeta: { requestMessages: [] },
    } as any)
    const { aiService, calls } = makeAiService([previousOutput, '第二步输出'])
    const folderTemplate: WorkspaceSkillTemplate = {
      ...makeTemplate('s2', 'folder 推演'),
      skill: {
        format: 'folder',
        folderPath: 'D:/skills/s2',
      } as any,
    }
    await runWorkspaceSkills({
      requestText: '续写设定',
      templates: [makeTemplate('s1', '解析'), folderTemplate],
      mode: 'chain',
      routingOverride: { forcedIntent: 'generate' },
      aiService,
      contextService: context,
      adapter,
    })
    expect(executeRealSkillMock).toHaveBeenCalledTimes(1)
    const secondPrompt = String(executeRealSkillMock.mock.calls[0]?.[0]?.input || '')
    expect(secondPrompt).toContain('请执行当前 SKILL：folder 推演')
    expect(secondPrompt).toContain(previousOutput)
    expect(
      (context.buildContextBundle as any).mock.calls[1][0],
    ).not.toHaveProperty('previousSkillOutput')
    expect(secondPrompt.split(previousOutput).length - 1).toBe(1)
    expect(calls).toHaveLength(1)
    expect(calls[0].messages[1]?.content).not.toContain(previousOutput)
  })

  it('records real SKILL protocol-field warnings without granting execution authority', async () => {
    const context = makeContextService()
    const buildTools = vi.fn<
      NonNullable<WorkspaceSkillEngineAdapter['buildTools']>
    >(({ intent }) => ({
      toolPolicy: { scenario: 'folder-chain' },
      tools: intent === 'edit'
        ? [
          {
            name: 'editor.get_state',
            description: 'Read editor state',
            policy: 'read',
            inputSchema: { type: 'object', properties: {} },
            defaultToolPolicy: 'allowedWithoutPermission',
            riskLevel: 'low',
            execute: async () => ({ ok: true }),
          },
          {
            name: 'editor.write',
            description: 'Direct write',
            policy: 'write',
            inputSchema: { type: 'object', properties: {} },
            defaultToolPolicy: 'allowedWithPermission',
            riskLevel: 'high',
            execute: async () => ({ ok: true }),
          },
        ]
        : [
          {
            name: 'editor.get_state',
            description: 'Read editor state',
            policy: 'read',
            inputSchema: { type: 'object', properties: {} },
            defaultToolPolicy: 'allowedWithoutPermission',
            riskLevel: 'low',
            execute: async () => ({ ok: true }),
          },
        ],
    }))
    const adapter = makeAdapter({
      buildTools,
      getExecutionContext: () => ({
        writeAuthorization: {
          source: 'long-document-workflow',
          intent: 'edit',
          operation: 'targeted_edit',
          mode: 'direct',
        },
      }),
    })
    loadRealSkillMock.mockResolvedValue({
      package: {
        id: 'folder-authority',
        name: 'folder-authority',
        description: '',
        template: 'folder template',
        meta: {},
        script: '',
        samples: '',
        schema: null,
        folderPath: 'D:/skills/folder-authority',
        manifest: {
          tools: [{ name: 'editor.write' }],
          writeAuthorization: { decision: 'write-authorized' },
        },
      } as any,
      warnings: [{
        code: 'manifest-protocol-fields-ignored',
        message: 'SKILL 包声明的执行协议字段已忽略：tools, writeAuthorization；执行器、工具面与权限由应用单源管理',
      }],
      error: null,
      folderPackageCache: false,
    })
    executeRealSkillMock.mockImplementation(async () => ({
      status: 'success',
      output: 'folder 结果',
      errors: [],
      diagnostics: [{
        type: 'warning',
        code: 'folder-package:manifest-protocol-fields-ignored',
        message: 'SKILL 包声明的执行协议字段已忽略：tools, writeAuthorization；执行器、工具面与权限由应用单源管理',
        at: '2026-10-03T00:00:00.000Z',
      }],
      folderPackageCache: false,
      apiMeta: { requestMessages: [] },
    } as any))
    const { aiService } = makeAiService(['folder 结果'])
    const folderTemplate: WorkspaceSkillTemplate = {
      ...makeTemplate('folder-authority', 'folder-authority', {
        intents: ['discuss', 'edit'],
      }),
      skill: {
        format: 'folder',
        folderPath: 'D:/skills/folder-authority',
      } as any,
    }

    const readonlyRun = await runWorkspaceSkills({
      requestText: '先讨论这一卷，不要写入',
      templates: [folderTemplate],
      mode: 'chain',
      aiService,
      contextService: context,
      adapter,
      routingOverride: { forcedIntent: 'discuss' },
    })
    const editRun = await runWorkspaceSkills({
      requestText: '把稳定段落末尾追加一个标记',
      templates: [folderTemplate],
      mode: 'chain',
      aiService,
      contextService: context,
      adapter,
      routingOverride: { forcedIntent: 'edit' },
    })

    expect(readonlyRun.meta?.skillToolDeclarationsIgnored).toBe(1)
    expect(editRun.meta?.skillToolDeclarationsIgnored).toBe(1)
    expect(readonlyRun.meta?.diagnostics?.some(item =>
      item.code === 'folder-package:manifest-protocol-fields-ignored')).toBe(true)
    expect(executeRealSkillMock).toHaveBeenCalledTimes(2)
    const readonlyArgs = executeRealSkillMock.mock.calls[0]?.[0]
    const editArgs = executeRealSkillMock.mock.calls[1]?.[0]
    expect(readonlyArgs.tools?.map(tool => tool.name)).toEqual([
      'editor.get_state',
    ])
    expect(readonlyArgs.tools?.some(tool => tool.name === 'editor.write')).toBe(false)
    expect(editArgs.tools?.map(tool => tool.name)).toEqual([
      'editor.get_state',
      'editor.write',
    ])
    const readonlyDecision = readonlyArgs.toolPolicy?.permissionDecision
    const editDecision = editArgs.toolPolicy?.permissionDecision
    expect(readonlyDecision?.decision).toBe('read-only')
    expect(readonlyDecision?.intent).toBe('discuss')
    expect(editDecision?.decision).toBe('write-authorized')
    expect(editDecision?.intent).toBe('edit')
    expect({
      mode: readonlyDecision?.mode,
    }).toEqual({
      mode: editDecision?.mode,
    })
  })

  it('routes short contextual replies to discussion skills only', async () => {
    const context = makeContextService()
    const adapter = makeAdapter({
      getLegacyMessages: () => [
        { role: 'user', content: '聊聊主角金手指落在谁身上' },
        {
          role: 'assistant',
          content:
            '【讨论回复】有两类方案。\n【讨论状态】await_user: true\n【下一问】你倾向哪一类？',
        },
      ],
    })
    const { aiService, calls } = makeAiService(['讨论结果'])
    const result = await runWorkspaceSkills({
      requestText: '落在自己的身上吧',
      templates: [
        makeTemplate('discuss', '共创讨论', {
          intents: ['generate', 'discuss'],
        }),
        makeTemplate('generator', '主编落地', { intents: ['generate'] }),
      ],
      mode: 'chain',
      aiService,
      contextService: context,
      adapter,
    })
    expect(result.intent).toBe('discuss')
    expect(calls).toHaveLength(1)
    expect(calls[0].messages[0]).toEqual({
      role: 'system',
      content: '执行 共创讨论',
    })
  })

  it('keeps normal intent routing when the reply is an explicit command', async () => {
    const context = makeContextService()
    const adapter = makeAdapter({
      getLegacyMessages: () => [
        { role: 'assistant', content: '【讨论状态】await_user: true' },
      ],
    })
    const { aiService, calls } = makeAiService(['生成结果'])
    const result = await runWorkspaceSkills({
      requestText: '直接生成第一版大纲',
      templates: [
        makeTemplate('discuss', '共创讨论', {
          intents: ['generate', 'discuss'],
        }),
        makeTemplate('generator', '主编落地', { intents: ['generate'] }),
      ],
      mode: 'chain',
      aiService,
      contextService: context,
      adapter,
    })
    expect(result.intent).toBe('generate')
    expect(calls).toHaveLength(2)
  })

  it('runs readonly fallback when no assistant turn is awaiting user input', async () => {
    const context = makeContextService()
    const adapter = makeAdapter({
      getLegacyMessages: () => [
        { role: 'assistant', content: '这是一段普通的历史输出。' },
      ],
    })
    const { aiService, calls } = makeAiService(['讨论结果'])
    const result = await runWorkspaceSkills({
      requestText: '落在自己的身上吧',
      templates: [
        makeTemplate('discuss', '共创讨论', {
          intents: ['generate', 'discuss'],
        }),
        makeTemplate('generator', '主编落地', { intents: ['generate'] }),
      ],
      mode: 'chain',
      aiService,
      contextService: context,
      adapter,
    })
    expect(result.runState).toBe('completed')
    expect(result.routing?.kind).toBe('no_match')
    expect(result.routing?.kind === 'no_match' && result.routing.fallbackMode).toBe('readonly-discuss')
    expect(result.intent).toBe('discuss')
    expect(calls).toHaveLength(1)
  })

  it('keeps write-candidate fallback awaiting user while readonly fallback executes', async () => {
    const context = makeContextService()
    const adapter = makeAdapter()
    const { aiService, calls } = makeAiService(['不应被调用'])
    const result = await runWorkspaceSkills({
      requestText: '生成后讨论一下',
      templates: [
        makeTemplate('generator', '主编落地', { intents: ['generate', 'edit'] }),
      ],
      mode: 'chain',
      aiService,
      contextService: context,
      adapter,
    })

    expect(result.runState).toBe('awaiting_user')
    expect(result.routing?.kind).toBe('ambiguous')
    expect(result.routing?.kind === 'ambiguous' && result.routing.fallbackMode).toBe('await-user')
    expect(calls).toHaveLength(0)
  })

  it('runs a text skill with a skill object through the text path', async () => {
    const context = makeContextService()
    const adapter = makeAdapter()
    const { aiService, calls } = makeAiService(['文本技能结果'])
    const result = await runWorkspaceSkills({
      requestText: '生成文本结果',
      templates: [
        makeTemplate('text-skill', '文本技能', {
          skill: { id: 'text-skill', format: 'text' },
        }),
      ],
      mode: 'compose',
      aiService,
      contextService: context,
      adapter,
    })
    expect(result.text).toBe('文本技能结果')
    expect(calls).toHaveLength(1)
  })

  it('passes adapter tool identity through text and folder callAi meta', async () => {
    const context = makeContextService()
    const adapter = makeAdapter()
    const { aiService, calls } = makeAiService(['最终结果'])
    await runWorkspaceSkills({
      requestText: '修改第二章设定',
      templates: [makeTemplate('s1', '修改')],
      mode: 'chain',
      aiService,
      contextService: context,
      adapter,
    })
    expect(calls).toHaveLength(1)
    expect(calls[0].meta).toMatchObject({
      projectId: 'project-1',
      workspace: 'outline',
      targetId: 'outline',
      readableTargets: ['outline'],
    })

    loadRealSkillMock.mockResolvedValueOnce({
      package: {
        id: 'folder-1',
        name: 'folder-1',
        description: '测试文件夹技能',
        template: 'folder template',
        meta: {},
        script: '',
        samples: '',
        schema: null,
        folderPath: 'D:/skills/folder-1',
      },
      warnings: [],
      error: null,
    })
    executeRealSkillMock.mockResolvedValueOnce({
      status: 'success',
      output: 'folder 结果',
      errors: [],
      diagnostics: [],
      folderPackageCache: false,
    })
    const folderRun = await runWorkspaceSkills({
      requestText: '把第二章设定修改为更清晰的伏笔',
      templates: [makeTemplate('s2', '文件夹', {
        intents: ['edit'],
        skill: {
          id: 'folder-1',
          format: 'folder',
          folderPath: 'D:/skills/folder-1',
        },
      })],
      mode: 'chain',
      aiService,
      contextService: context,
      adapter,
      routingOverride: { forcedIntent: 'edit' },
    })
    expect(folderRun.text).toBe('folder 结果')
    expect(executeRealSkillMock).toHaveBeenCalledTimes(1)
    expect(executeRealSkillMock.mock.calls[0]?.[0]).toMatchObject(
      expect.objectContaining({
        toolContext: {
          projectId: 'project-1',
          workspace: 'outline',
          targetId: 'outline',
          readableTargets: ['outline'],
        },
      }),
    )
  })

  it('bypasses intent routing for a user-confirmed full-chain run', async () => {
    const context = makeContextService()
    const adapter = makeAdapter()
    const { aiService, calls } = makeAiService(['A', 'B'])
    const result = await runWorkspaceSkills({
      requestText: '今天天气怎么样',
      templates: [
        makeTemplate('analyze', '分析', { intents: ['analyze'] }),
        makeTemplate('generator', '生成', { intents: ['generate'] }),
      ],
      mode: 'chain',
      aiService,
      contextService: context,
      adapter,
      routingOverride: { bypass: true },
    })
    expect(result.runState).toBe('completed')
    expect(result.routing).toMatchObject({
      reason: 'user-bypassed-routing',
    })
    expect(calls).toHaveLength(2)
  })

  it('continues with the fallback recommendation after user confirmation', async () => {
    const context = makeContextService()
    const adapter = makeAdapter()
    const { aiService, calls } = makeAiService(['讨论结果'])
    const result = await runWorkspaceSkills({
      requestText: '今天天气怎么样',
      templates: [
        makeTemplate('discuss', '讨论', { intents: ['discuss'] }),
        makeTemplate('generator', '生成', { intents: ['generate'] }),
      ],
      mode: 'chain',
      aiService,
      contextService: context,
      adapter,
      routingOverride: { forcedIntent: 'discuss' },
    })
    expect(result.runState).toBe('completed')
    expect(result.routing).toMatchObject({
      reason: 'user-confirmed-recommendation',
    })
    expect(calls).toHaveLength(1)
    expect(calls[0].messages[0]).toEqual({
      role: 'system',
      content: '执行 讨论',
    })
  })

  it('uses per-skill agent before base agent and default provider', async () => {
    const context = makeContextService()
    const adapter = makeAdapter({
      getBaseAgentId: () => 'base-agent',
      getSkillAgentId: (skillId) => (skillId === 's2' ? 'skill-agent' : ''),
      getAgent: (agentId) =>
        agentId === 'skill-agent'
          ? {
              model: 'skill-model',
              temperature: 0.2,
              maxTokens: 1234,
              systemPrompt: '专属智能体',
            }
          : agentId === 'base-agent'
            ? { model: 'base-model' }
            : null,
    })
    const { aiService, calls } = makeAiService(['A', 'B'])
    await runWorkspaceSkills({
      requestText: '生成执行结果',
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
    expect(calls[1].meta).toMatchObject({
      agentId: 'skill-agent',
      skillId: 's2',
    })
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
    await expect(
      runWorkspaceSkills({
        requestText: '生成JSON',
        templates: [template],
        mode: 'compose',
        aiService,
        contextService: context,
        adapter,
      }),
    ).rejects.toThrow('输出校验失败')
    expect(calls).toHaveLength(2)
    expect(calls[1].messages[1]?.content).toContain('[校验重试]')
  })

  it('writes a failure breakpoint and resumes from the failed skill output', async () => {
    const context = makeContextService()
    let saved: ChainBreakpoint | null = null
    const adapter = makeAdapter({
      loadBreakpoint: async () => null,
      saveBreakpoint: vi.fn(async (breakpoint: ChainBreakpoint) => {
        saved = breakpoint
      }),
    })
    const firstRun = makeAiService(['第一步输出'])
    firstRun.aiService.callAi
      .mockImplementationOnce(
        async () => ({ text: '第一步输出', reasoning: '' }) as never,
      )
      .mockImplementationOnce(async () => {
        throw new Error('第二步失败')
      })
    await expect(
      runWorkspaceSkills({
        requestText: '生成',
        templates: [makeTemplate('s1', '一'), makeTemplate('s2', '二')],
        mode: 'chain',
        aiService: firstRun.aiService,
        contextService: context,
        adapter,
      }),
    ).rejects.toThrow('第二步失败')
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
      requestText: '生成大纲',
      templates: [makeTemplate('s1', '一'), makeTemplate('s2', '二')],
      mode: 'chain',
      aiService: resumed.aiService,
      contextService: context,
      adapter: resumeAdapter,
    })
    expect(result.text).toBe('第二步续跑')
    expect(resumed.calls).toHaveLength(1)
    expect(resumed.calls[0].messages[1]?.content).toContain(
      'SKILL：二',
    )
  })

  it('returns budget_exhausted before running the remaining chain steps', async () => {
    const context = makeContextService()
    const adapter = makeAdapter()
    const { aiService, calls } = makeAiService(['A', 'B', 'C'])
    const result = await runWorkspaceSkills({
      requestText: '生成',
      templates: [
        makeTemplate('s1', '生成一'),
        makeTemplate('s2', '生成二'),
        makeTemplate('s3', '生成三'),
      ],
      mode: 'chain',
      aiService,
      contextService: context,
      adapter,
      apiBudget: createApiCallBudget(2),
    })
    expect(result.runState).toBe('budget_exhausted')
    expect(result.terminalStatus).toBe('blocked')
    expect(result.terminalReason).toBe('budget_exhausted')
    expect(result.text).toBe('B')
    expect(result.budgetSnapshot).toMatchObject({ used: 2, limit: 2 })
    expect(calls).toHaveLength(2)
  })

  it('continues from the breakpoint after the budget is extended', async () => {
    const context = makeContextService()
    let saved: ChainBreakpoint | null = null
    const adapter = makeAdapter({
      loadBreakpoint: async () => saved,
      saveBreakpoint: vi.fn(async (breakpoint: ChainBreakpoint) => {
        saved = breakpoint
      }),
    })
    const budget = createApiCallBudget(2)
    const firstRun = makeAiService(['A', 'B', 'C'])
    const exhausted = await runWorkspaceSkills({
      requestText: '生成',
      templates: [
        makeTemplate('s1', '生成一'),
        makeTemplate('s2', '生成二'),
        makeTemplate('s3', '生成三'),
      ],
      mode: 'chain',
      aiService: firstRun.aiService,
      contextService: context,
      adapter,
      apiBudget: budget,
    })
    expect(exhausted.runState).toBe('budget_exhausted')

    budget.extend(2)
    const resumed = makeAiService(['C'])
    const result = await runWorkspaceSkills({
      requestText: '生成',
      templates: [
        makeTemplate('s1', '生成一'),
        makeTemplate('s2', '生成二'),
        makeTemplate('s3', '生成三'),
      ],
      mode: 'chain',
      aiService: resumed.aiService,
      contextService: context,
      adapter,
      apiBudget: budget,
    })
    expect(result.runState).toBe('completed')
    expect(result.text).toBe('C')
    expect(resumed.calls).toHaveLength(1)
    expect(resumed.calls[0].messages[1]?.content).toContain(
      'SKILL：生成三',
    )
  })
})
