import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./realSkillLoader', () => ({
  loadRealSkill: vi.fn()
}))
vi.mock('./aiService', () => ({
  getAiService: vi.fn()
}))
const skillExecuteScriptMock = vi.fn(async (script: string, payload: { hook: string }) => {
  const module = { exports: {} as Record<string, unknown> }
  const run = new Function('module', 'exports', 'payload', 'api', script)
  run(module, module.exports, payload, { setTemplate: vi.fn() })
  const availableHooks = Object.keys(module.exports).filter(key => typeof module.exports[key] === 'function')
  return {
    ok: true,
    availableHooks,
    exports: {},
    results: {},
    templateOverride: '',
    logs: []
  }
  })
vi.stubGlobal('electronAPI', { skillExecuteScript: skillExecuteScriptMock })
vi.stubGlobal('window', {
  electronAPI: { skillExecuteScript: skillExecuteScriptMock },
  dispatchEvent: vi.fn()
})
vi.stubGlobal('window', {
  electronAPI: (globalThis as any).electronAPI,
  dispatchEvent: vi.fn()
})

import { executeRealSkill } from './realSkillExecutor'
import { loadRealSkill } from './realSkillLoader'
import { DeAiSamples } from './deai-samples.js'
import { getAiService } from './aiService'
import type { CallAiParams } from './aiService'

const loadRealSkillMock = vi.mocked(loadRealSkill)
const getAiServiceMock = vi.mocked(getAiService)

function createBudget(used = 0) {
  return {
    tryConsume: vi.fn((): { status: 'allowed' | 'blocked'; used: number; limit: number } => ({
      status: used >= 8 ? 'blocked' as const : 'allowed' as const,
      used: used + 1,
      limit: 8
    }))
  }
}

function createPackage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'folder-full',
    name: '完整文件夹技能',
    description: '',
    template: '请处理输入文本，保持事件与语义不变。',
    meta: {},
    script: '',
    samples: '',
    schema: null,
    folderPath: 'D:/skill',
    resources: [{ path: 'references/protocol.md', content: '协议资源' }],
    ...overrides
  }
}

describe('realSkillExecutor single pass', () => {
  it('retries reasoning exhaustion once in direct-output mode and fails if it stays empty', async () => {
    const eventSpy = vi.fn()
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage(),
      error: null,
      folderPackageCache: false
    })
    const callAi = vi.fn(async (_params: CallAiParams) => ({
      text: '',
      reasoning: '模型思考',
      finishReason: 'length',
      usage: { completion_tokens: 1000 },
      providerId: 'provider-1'
    }))
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget(),
      agent: { id: 'agent-1', maxTokens: 1000 },
      onGenerationEvent: eventSpy
    })

    expect(eventSpy.mock.calls.map(([event]) => event.type)).toEqual([
      'generation-invalid',
      'direct-retry-start',
      'direct-retry-finished'
    ])
    expect(eventSpy.mock.calls[1]![0].kind).toBe('reasoning_exhausted')
    expect(eventSpy.mock.calls[2]![0].success).toBe(false)
    expect(result.status).toBe('failed')
    expect(callAi).toHaveBeenCalledTimes(2)
    expect(callAi.mock.calls[1]![0].messages[0]?.content).toContain('【直出模式】')
    expect(callAi.mock.calls[1]![0]).toMatchObject({ retryStrategy: 'max_tokens_raised', maxTokens: 1500 })
    expect(eventSpy.mock.calls[1]![0]).toMatchObject({ retryStrategy: 'max_tokens_raised', maxTokens: 1500 })
    expect(eventSpy.mock.calls[2]![0]).toMatchObject({ retryStrategy: 'max_tokens_raised', maxTokens: 1500 })
    expect(result.errors[0]).toContain('模型思考耗尽输出预算')
    expect(result.diagnostics.some(item => item.code === 'generation-invalid:reasoning_exhausted')).toBe(true)
  })

  it('recovers when the direct-output retry produces a body', async () => {
    const eventSpy = vi.fn()
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage(),
      error: null,
      folderPackageCache: false
    })
    const callAi = vi.fn(async (_params: CallAiParams) => {
      if (callAi.mock.calls.length === 1) {
        return {
          text: '',
          reasoning: '模型思考',
          finishReason: 'length',
          usage: { completion_tokens: 1000 }
        }
      }
      return { text: '直出正文', finishReason: 'stop', usage: { completion_tokens: 20 } }
    })
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget(),
      agent: { id: 'agent-1', maxTokens: 1000 },
      onGenerationEvent: eventSpy
    })

    expect(eventSpy.mock.calls.map(([event]) => event.type)).toEqual([
      'generation-invalid',
      'direct-retry-start',
      'direct-retry-finished'
    ])
    expect(eventSpy.mock.calls[2]![0].success).toBe(true)
    expect(result.status).toBe('degraded')
    expect(result.output).toBe('直出正文')
    expect(result.diagnostics.some(item => item.code === 'generation-direct-retry-recovered')).toBe(true)
  })

  it('continues truncated output and removes the overlap between calls', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage(),
      error: null,
      folderPackageCache: false
    })
    const callAi = vi.fn(async (_params: CallAiParams) => {
      if (callAi.mock.calls.length === 1) {
        return { text: '卷纲开头，主角进入北境。', reasoning: '第一次调用思考', finishReason: 'length' }
      }
      return { text: '主角进入北境。随后敌军压境。', reasoning: '续写调用思考', finishReason: 'stop' }
    })
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget()
    })

    expect(result.output).toContain('卷纲开头，主角进入北境。')
    expect(result.output).toContain('随后敌军压境。')
    expect(result.output).not.toContain('主角进入北境。主角进入北境。')
    expect(result.apiMeta?.reasoningText).toBe('续写调用思考')
    expect(result.diagnostics.some(item => item.code === 'generation-truncated')).toBe(true)
  })

  it('injects agent prompt before skill template and passes agent parameters', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage(),
      error: null,
      folderPackageCache: false
    })
    const callAi = vi.fn(async (_params: CallAiParams) => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget(),
      agent: {
        id: 'agent-1',
        systemPrompt: '智能体指令',
        model: 'test-model',
        temperature: 0.2,
        maxTokens: 1234
      }
    })

    expect(result.status).toBe('success')
    expect(callAi).toHaveBeenCalledTimes(1)
    const params = callAi.mock.calls[0]![0] as CallAiParams
    const systemMessage = params.messages[0]
    const systemPrompt = systemMessage?.content ?? ''
    expect(systemPrompt.startsWith('智能体指令')).toBe(true)
    expect(systemPrompt).toContain('请处理输入文本，保持事件与语义不变。')
    expect(systemPrompt).toContain('[folder resource: references/protocol.md]\n协议资源')
    expect(params.model).toBe('test-model')
    expect(params.temperature).toBe(0.2)
    expect(params.maxTokens).toBe(1234)
  })

  it('appends the system prompt suffix after the skill template without changing the legacy order', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage(),
      error: null,
      folderPackageCache: false
    })
    const callAi = vi.fn(async (_params: CallAiParams) => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget(),
      agent: { id: 'agent-1', systemPrompt: '智能体指令' },
      systemPromptSuffix: '降AI约束'
    })

    expect(result.status).toBe('success')
    const params = callAi.mock.calls[0]![0] as CallAiParams
    const systemPrompt = params.messages[0]?.content ?? ''
    expect(systemPrompt.startsWith('智能体指令')).toBe(true)
    expect(systemPrompt).toContain('[folder resource: references/protocol.md]\n协议资源\n\n降AI约束')
  })

  it('keeps the SKILL.md body beside template.md and injects all resources without truncation', async () => {
    const callAi = vi.fn(async (_params: CallAiParams) => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        body: '入口说明正文',
        template: '执行模板',
        resources: [
          { path: 'references/a.md', content: '资源A' },
          { path: 'references/b.md', content: '资源B' }
        ]
      }),
      error: null,
      folderPackageCache: false
    })

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget()
    })

    expect(result.status).toBe('success')
    const systemPrompt = (callAi.mock.calls[0]![0] as CallAiParams).messages[0]?.content ?? ''
    expect(systemPrompt).toContain('入口说明正文')
    expect(systemPrompt).toContain('执行模板')
    expect(systemPrompt).toContain('[folder resource: references/a.md]\n资源A')
    expect(systemPrompt).toContain('[folder resource: references/b.md]\n资源B')
  })

  it('does not inject the SKILL.md body twice for fallback packages', async () => {
    const callAi = vi.fn(async (_params: CallAiParams) => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        body: '正文模板',
        template: '正文模板',
        resources: []
      }),
      error: null,
      folderPackageCache: false
    })

    await executeRealSkill({ folderPath: 'D:/skill', input: '原文', budget: createBudget() })

    const systemPrompt = (callAi.mock.calls[0]![0] as CallAiParams).messages[0]?.content ?? ''
    expect(systemPrompt.match(/正文模板/g)).toHaveLength(1)
  })

  it('does not inject an empty resource block when the package has no resources', async () => {
    const callAi = vi.fn(async (_params: CallAiParams) => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({ resources: [] }),
      error: null,
      folderPackageCache: false
    })

    await executeRealSkill({ folderPath: 'D:/skill', input: '原文', budget: createBudget() })

    const systemPrompt = (callAi.mock.calls[0]![0] as CallAiParams).messages[0]?.content ?? ''
    expect(systemPrompt).not.toContain('[folder resource:')
  })

  it('uses skill samples first and global samples only as fallback', async () => {
    const callAi = vi.fn(async (_params: CallAiParams) => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)

    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({ samples: '技能样本一\n技能样本二' }),
      error: null,
      folderPackageCache: false
    })
    await executeRealSkill({ folderPath: 'D:/skill', input: '原文', budget: createBudget() })
    expect(callAi.mock.calls[0][0]?.messages[1].content).toContain('技能样本一')

    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage(),
      error: null,
      folderPackageCache: false
    })
    await executeRealSkill({ folderPath: 'D:/skill', input: '原文', budget: createBudget() })
    expect(callAi.mock.calls[1][0]?.messages[1].content).toContain(DeAiSamples.getAll()[0])
  })

  it('marks blocked when budget is exhausted', async () => {
    getAiServiceMock.mockClear()
    const budget = createBudget(8)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({ meta: { apiCallLimit: 1 } }),
      error: null,
      folderPackageCache: false
    })
    const result = await executeRealSkill({ folderPath: 'D:/skill', input: '原文', budget })
    expect(result.status).toBe('blocked')
    expect(getAiServiceMock).not.toHaveBeenCalled()
  })
})

describe('realSkillExecutor phase 4 upgrades', () => {
  beforeEach(() => {
    loadRealSkillMock.mockReset()
    getAiServiceMock.mockReset()
    skillExecuteScriptMock.mockReset()
    skillExecuteScriptMock.mockImplementation(async (script: string, payload: { hook: string; payload?: unknown }) => {
      const module = { exports: {} as Record<string, unknown> }
      const templateOverride = { value: '' }
      const run = new Function('module', 'exports', 'payload', 'api', script)
      const hookPayload = { payload: payload.payload }
      run(module, module.exports, hookPayload, {
        setTemplate(text: string) { templateOverride.value = text }
      })
      const availableHooks = Object.keys(module.exports).filter(key => typeof module.exports[key] === 'function')
      const hookName = payload.hook
      const hookFn = hookName && typeof module.exports[hookName] === 'function'
        ? module.exports[hookName] as (value: unknown) => unknown
        : undefined
      const hookResult = hookFn ? await hookFn(payload.payload) : undefined
      return {
        ok: true,
        availableHooks,
        exports: {},
        results: hookFn ? { [hookName]: JSON.parse(JSON.stringify(hookResult)) } : {},
        templateOverride: templateOverride.value,
        logs: []
      }
    })
  })

  it('keeps a non-final chain schema failure as a warning without retries', async () => {
    const callAi = vi.fn(async () => ({ text: 'S1 中间输出' }))
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        schema: {
          type: 'object',
          required: ['facts'],
          properties: {
            facts: { type: 'array' }
          }
        }
      }),
      error: null,
      folderPackageCache: false
    })

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget(),
      validateOutputSchema: true
    })

    expect(callAi).toHaveBeenCalledTimes(1)
    expect(result.status).toBe('success')
    expect(result.output).toBe('S1 中间输出')
    expect(result.diagnostics.some(item => item.code === 'schema-contract-warning')).toBe(true)
    expect(result.diagnostics.some(item => item.code === 'schema-validation-exhausted')).toBe(false)
  })

  it('records loader warnings and blocking postProcess issues with explicit semantics', async () => {
    const callAi = vi.fn(async () => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        script: `module.exports = { postProcess(output) { return { output, valid: true, issues: [{ code: 'lost-section', severity: 'blocking', message: '缺少核心章节' }, { code: 'minor-warning', severity: 'non-blocking', message: '存在轻微问题' }] } } }`,
        resources: []
      }),
      error: null,
      folderPackageCache: false,
      warnings: [{ code: 'template-fallback-skill-md', message: '缺少 template.md，已回退使用 SKILL.md 正文' }]
    })

    const result = await executeRealSkill({ folderPath: 'D:/skill', input: '原文', budget: createBudget() })

    expect(result.status).toBe('failed')
    expect(callAi).toHaveBeenCalledTimes(1)
    expect(result.diagnostics.some(item => item.code === 'folder-package:template-fallback-skill-md')).toBe(true)
    expect(result.diagnostics.filter(item => item.code === 'post-process-issue:lost-section')[0]?.type).toBe('error')
    expect(result.diagnostics.filter(item => item.code === 'post-process-issue:minor-warning')[0]?.type).toBe('warning')
    expect(result.errors.join('\n')).toContain('缺少核心章节')
    expect(result.folderPackageCache).toBe(false)
    expect(result.postProcessReport).toMatchObject({
      applied: true,
      changedOutput: false,
      output: '输出',
      issues: [
        { severity: 'blocking', code: 'lost-section', message: '缺少核心章节' },
        { severity: 'warning', code: 'minor-warning', message: '存在轻微问题' }
      ]
    })
    expect(result.apiMeta?.requestMessages).toEqual([
      { role: 'system', content: expect.stringContaining('请处理输入文本') },
      { role: 'user', content: expect.stringMatching(/^\[style reference\][\s\S]*\n--- text ---\n原文$/) }
    ])
  })

  it('downgrades structural postProcess warnings but keeps prose taste warnings successful', async () => {
    const callAi = vi.fn(async () => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        script: `module.exports = { postProcess(output) { return { output, valid: true, issues: [
          { code: 'missing-marker', severity: 'non-blocking', message: '缺少标记区块' },
          { code: 'minor-warning', severity: 'non-blocking', message: '文风轻微偏软' }
        ] } } }`,
        resources: []
      }),
      error: null,
      folderPackageCache: false
    })

    const result = await executeRealSkill({ folderPath: 'D:/skill', input: '原文', budget: createBudget() })

    expect(result.status).toBe('degraded')
    expect(result.diagnostics.filter(item => item.code === 'post-process-issue:missing-marker')[0]?.type).toBe('warning')
    expect(result.diagnostics.filter(item => item.code === 'post-process-issue:minor-warning')[0]?.type).toBe('warning')
    expect(result.output).toBe('输出')
  })

  it('keeps the package template when preProcess only rewrites the input', async () => {
    const callAi = vi.fn(async () => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        script: `module.exports = { preProcess() { return { input: '处理后的输入' } } }`,
        resources: []
      }),
      error: null,
      folderPackageCache: false
    })
    const result = await executeRealSkill({ folderPath: 'D:/skill', input: '原文', budget: createBudget() })
    expect(result.status).toBe('success')
    const dynamicParams = (callAi.mock.calls[0] as unknown as Array<CallAiParams>)[0]
    expect(dynamicParams.messages[0]?.content).toContain('请处理输入文本，保持事件与语义不变。')
    expect(dynamicParams.messages[1]?.content).toContain('处理后的输入')
  })

  it('ignores meta.agent execution parameters and appends only guidance', async () => {
    const callAi = vi.fn(async () => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        meta: {
          agent: {
            model: 'folder-model',
            temperature: 0.45,
            maxTokens: 4096,
            systemPrompt: '技能默认智能体指令'
          }
        }
      }),
      error: null,
      folderPackageCache: false
    })

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget(),
      agent: { id: 'step-agent', model: 'step-model', temperature: 0.7 },
      agentSource: 'step-default'
    })

    expect(result.status).toBe('success')
    const params = (callAi.mock.calls[0] as unknown as Array<CallAiParams>)[0]
    expect(params.model).toBe('step-model')
    expect(params.temperature).toBe(0.7)
    expect(params.maxTokens).toBeUndefined()
    expect(params.messages[0]?.content).toContain('技能默认智能体指令')
  })

  it('keeps an explicit user-bound agent over meta.agent', async () => {
    const callAi = vi.fn(async () => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        meta: { agent: { model: 'folder-model', temperature: 0.45 } }
      }),
      error: null,
      folderPackageCache: false
    })

    await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget(),
      agent: { id: 'user-agent', model: 'user-model', temperature: 0.8 },
      agentSource: 'user-binding'
    })

    const params = (callAi.mock.calls[0] as unknown as Array<CallAiParams>)[0]
    expect(params.model).toBe('user-model')
    expect(params.temperature).toBe(0.8)
  })

  it('prioritizes the folder template over a compose merged template', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        script: `module.exports = { preProcess() { return { input: '处理后的输入' } } }`,
        resources: []
      }),
      error: null,
      folderPackageCache: false
    })
    const callAi = vi.fn(async () => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget(),
      baseTemplateOverride: 'compose合并模板'
    })

    expect(result.status).toBe('success')
    const dynamicParams = (callAi.mock.calls[0] as unknown as Array<CallAiParams>)[0]
    expect(dynamicParams.messages[0]?.content).toContain('请处理输入文本，保持事件与语义不变。')
    expect(dynamicParams.messages[0]?.content).not.toContain('compose合并模板')
    expect(result.diagnostics.some(item => item.code === 'folder-template-priority')).toBe(true)
    expect(result.diagnostics.some(item => item.code === 'base-template-applied')).toBe(false)
  })

  it('falls back to the pipeline template when the folder has no template', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        template: '',
        script: `module.exports = { preProcess() { return { input: '处理后的输入' } } }`,
        resources: []
      }),
      error: null,
      folderPackageCache: false
    })
    const callAi = vi.fn(async () => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget(),
      resolvedTemplate: 'chain解析后模板'
    })

    expect(result.status).toBe('degraded')
    const dynamicParams = (callAi.mock.calls[0] as unknown as Array<CallAiParams>)[0]
    expect(dynamicParams.messages[0]?.content).toContain('chain解析后模板')
    expect(result.diagnostics.some(item => item.code === 'base-template-fallback')).toBe(true)
  })

  it('keeps the folder template in chain mode without package resources', async () => {
    const callAi = vi.fn(async () => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        template: 'folder自有模板',
        resources: []
      }),
      error: null,
      folderPackageCache: false
    })

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget(),
      resolvedTemplate: 'chain解析后模板'
    })

    expect(result.status).toBe('success')
    const dynamicParams = (callAi.mock.calls[0] as unknown as Array<CallAiParams>)[0]
    expect(dynamicParams.messages[0]?.content).toContain('folder自有模板')
    expect(dynamicParams.messages[0]?.content).not.toContain('chain解析后模板')
    expect(result.diagnostics.some(item => item.code === 'folder-template-priority')).toBe(true)
  })

  it('injects live pipeline variables into the folder template without replacing it', async () => {
    const callAi = vi.fn(async () => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        template: '章节：{{chapterTitle}}\n字数：{{wordsPerChapter}}',
        resources: [{ path: 'references/world.md', content: '世界观资料' }]
      }),
      error: null,
      folderPackageCache: false
    })

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget(),
      resolvedTemplate: '章节：第一章',
      templateVariables: {
        chapterTitle: '第一章',
        wordsPerChapter: 4500
      }
    })

    expect(result.status).toBe('success')
    const params = (callAi.mock.calls[0] as unknown as Array<CallAiParams>)[0]
    expect(params.messages[0]?.content).toContain('章节：第一章')
    expect(params.messages[0]?.content).toContain('字数：4500')
    expect(params.messages[0]?.content).not.toContain('{{chapterTitle}}')
    expect(result.diagnostics.some(item => item.code === 'folder-template-variables-missing')).toBe(false)
  })

  it('reports folder template variables that are absent from template.md', async () => {
    const callAi = vi.fn(async () => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        template: 'folder自有模板',
        resources: [{ path: 'references/world.md', content: '世界观资料' }]
      }),
      error: null,
      folderPackageCache: false
    })

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget(),
      resolvedTemplate: 'chain解析后模板',
      templateVariables: { chapterTitle: '第一章' }
    })

    expect(result.status).toBe('success')
    expect(result.diagnostics.some(item =>
      item.code === 'folder-template-variables-missing' &&
      item.message.includes('chapterTitle')
    )).toBe(true)
  })

  it('renders known empty variables as unset instead of leaking placeholders', async () => {
    const callAi = vi.fn(async () => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({ template: '风格：{{styleTags}}；节奏：{{pacingParams}}' }),
      error: null,
      folderPackageCache: false
    })

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget(),
      resolvedTemplate: 'chain解析后模板',
      templateVariables: { styleTags: '', pacingParams: null }
    })

    expect(result.status).toBe('success')
    expect(result.diagnostics.some(item =>
      item.code === 'template-variable-empty' &&
      item.message.includes('styleTags') &&
      item.message.includes('pacingParams')
    )).toBe(true)
    const params = (callAi.mock.calls[0] as unknown as Array<CallAiParams>)[0]
    const systemPrompt = params.messages.find(message => message.role === 'system')?.content || ''
    expect(systemPrompt).toContain('风格：未设置；节奏：未设置')
    expect(systemPrompt).not.toContain('{{styleTags}}')
    expect(systemPrompt).not.toContain('{{pacingParams}}')
  })

  it('forwards reasoning delta callbacks to callAi', async () => {
    const onReasoning = vi.fn()
    const callAi = vi.fn(async () => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage(),
      error: null,
      folderPackageCache: false
    })

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget(),
      onReasoning
    })

    expect(result.status).toBe('success')
    const params = (callAi.mock.calls[0] as unknown as Array<CallAiParams>)[0]
    params.onReasoning?.('思考一')
    params.onReasoning?.('思考一思考二')
    expect(onReasoning).toHaveBeenNthCalledWith(1, '思考一')
    expect(onReasoning).toHaveBeenNthCalledWith(2, '思考一思考二')
  })

  it('ignores legacy hook functions returned over IPC', async () => {
    skillExecuteScriptMock.mockImplementationOnce(async () => ({
      ok: true,
      availableHooks: ['preProcess'],
      exports: { preProcess: () => ({ template: '旧协议函数' }) },
      results: { preProcess: undefined },
      templateOverride: '',
      logs: []
    }))
    const callAi = vi.fn(async () => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({ script: 'module.exports = {}', template: '固定模板' }),
      error: null,
      folderPackageCache: false
    })
    const result = await executeRealSkill({ folderPath: 'D:/skill', input: '原文', budget: createBudget() })
    expect(result.status).toBe('success')
    const dynamicParams = (callAi.mock.calls[0] as unknown as Array<CallAiParams>)[0]
    expect(dynamicParams.messages[0]?.content).toContain('固定模板')
    expect(dynamicParams.messages[0]?.content).not.toContain('旧协议函数')
  })

  it('consumes structured stdout JSON from postProcess through the whitelist', async () => {
    skillExecuteScriptMock.mockImplementation(async () => ({
      ok: true,
      availableHooks: [],
      exports: {},
      results: {
        postProcess: { output: '结构化后输出', valid: true, ignored: '应被过滤' }
      },
      templateOverride: '',
      logs: [],
      stdout: '{"output":"结构化后输出","valid":true,"ignored":"应被过滤"}',
      stderr: '',
      exitCode: 0,
      consumedStructuredOutput: true
    }))
    const callAi = vi.fn(async () => ({ text: '原始输出' }))
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({ script: 'module.exports = {}', template: '固定模板' }),
      error: null,
      folderPackageCache: false
    })

    const result = await executeRealSkill({ folderPath: 'D:/skill', input: '原文', budget: createBudget() })

    expect(result.status).toBe('degraded')
    expect(result.output).toBe('结构化后输出')
    expect(result.diagnostics.some(item => item.code === 'hook-field-ignored' && item.message.includes('ignored'))).toBe(true)
    expect(result.diagnostics.some(item => item.code === 'script-hook-failed')).toBe(false)
  })

  it('runs multi-pass in order and emits pass events', async () => {
    const callAi = vi.fn(async () => ({ text: '第步输出' }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        meta: {
          executionMode: 'multi-pass',
          passes: [
            { name: '第一步' },
            { name: '第二步', input: 'previous' }
          ]
        }
      }),
      error: null,
      folderPackageCache: false
    })
    const result = await executeRealSkill({ folderPath: 'D:/skill', input: '原文', budget: createBudget() })
    expect(result.status).toBe('success')
    expect(callAi).toHaveBeenCalledTimes(2)
    expect((window as any).dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'real-skill:pass' })
    )
  })

  it('retries schema validation up to three attempts and returns degraded output', async () => {
    const callAi = vi.fn(async () => ({ text: '{"wrong": true}' }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        schema: {
          type: 'object',
          required: ['output'],
          properties: { output: { type: 'string' } }
        }
      }),
      error: null,
      folderPackageCache: false
    })
    const result = await executeRealSkill({ folderPath: 'D:/skill', input: '原文', budget: createBudget() })
    expect(result.status).toBe('degraded')
    expect(callAi).toHaveBeenCalledTimes(3)
    expect(result.errors.length).toBeGreaterThanOrEqual(4)
  })

  it('emits retry attempts through the real-skill step event', async () => {
    const callAi = vi.fn(async () => ({ text: '{"wrong": true}' }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        schema: {
          type: 'object',
          required: ['output'],
          properties: { output: { type: 'string' } }
        }
      }),
      error: null,
      folderPackageCache: false
    })
    const result = await executeRealSkill({ folderPath: 'D:/skill', input: '原文', budget: createBudget() })
    expect(result.status).toBe('degraded')
    expect((window as any).dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'real-skill:step' })
    )
    const stepEvents = ((window as any).dispatchEvent as ReturnType<typeof vi.fn>).mock.calls
      .map(call => call[0])
      .filter(event => event?.type === 'real-skill:step')
    expect(stepEvents.some(event => event.detail?.attempts === 2 && event.detail?.status === 'running')).toBe(true)
    expect(stepEvents.some(event => event.detail?.attempts === 3 && event.detail?.status === 'failed')).toBe(true)
  })

  it('selects smart samples by input keywords within the sample budget', async () => {
    const callAi = vi.fn(async () => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        meta: { smartSamples: true, sampleCount: 2 },
        samples: '武侠样本\n科幻样本\n日常样本'
      }),
      error: null,
      folderPackageCache: false
    })
    const result = await executeRealSkill({ folderPath: 'D:/skill', input: '这段科幻内容包含机甲', budget: createBudget() })
    expect(result.status).toBe('success')
    const smartParams = (callAi.mock.calls[0] as unknown as Array<CallAiParams>)[0]
    const userPrompt = smartParams.messages[1]?.content ?? ''
    expect(userPrompt).toContain('科幻样本')
    expect(userPrompt).not.toContain('武侠样本')
  })

  it('captures every physical tool-call request, including later iterations', async () => {
    const callAi = vi.fn(async (_params: CallAiParams) => ({
      text: '输出',
      toolRequestDeltas: [
        { role: 'system', content: '初始 system' },
        { role: 'user', content: '初始 user' }
      ]
    }))
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage(),
      error: null,
      folderPackageCache: false
    })

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget(),
      messageBuilder: (systemPrompt, userPrompt) => [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })

    expect(result.status).toBe('success')
    expect(result.apiMeta?.requestMessages).toHaveLength(2)
    expect(result.apiMeta?.requestMessages?.[0].role).toBe('system')
    expect(result.apiMeta?.requestMessages?.[1].role).toBe('user')
    expect(result.apiMeta?.requestMessages?.[1].content).toContain('原文')
    expect(result.apiMeta?.toolRequestDeltas).toEqual([
      { role: 'system', content: '初始 system' },
      { role: 'user', content: '初始 user' }
    ])
  })
})
