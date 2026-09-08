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
    ...overrides
  }
}

describe('realSkillExecutor single pass', () => {
  it('injects agent prompt before skill template and passes agent parameters', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage(),
      error: null,
      fromCache: false
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
    expect(params.model).toBe('test-model')
    expect(params.temperature).toBe(0.2)
    expect(params.maxTokens).toBe(1234)
  })

  it('appends the system prompt suffix after the skill template without changing the legacy order', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage(),
      error: null,
      fromCache: false
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
    expect(systemPrompt).toContain('请处理输入文本，保持事件与语义不变。\n\n降AI约束')
  })

  it('uses skill samples first and global samples only as fallback', async () => {
    const callAi = vi.fn(async (_params: CallAiParams) => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)

    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({ samples: '技能样本一\n技能样本二' }),
      error: null,
      fromCache: false
    })
    await executeRealSkill({ folderPath: 'D:/skill', input: '原文', budget: createBudget() })
    expect(callAi.mock.calls[0][0]?.messages[1].content).toContain('技能样本一')

    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage(),
      error: null,
      fromCache: false
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
      fromCache: false
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

  it('keeps the package template when preProcess only rewrites the input', async () => {
    const callAi = vi.fn(async () => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        script: `module.exports = { preProcess() { return { input: '处理后的输入' } } }`
      }),
      error: null,
      fromCache: false
    })
    const result = await executeRealSkill({ folderPath: 'D:/skill', input: '原文', budget: createBudget() })
    expect(result.status).toBe('success')
    const dynamicParams = (callAi.mock.calls[0] as unknown as Array<CallAiParams>)[0]
    expect(dynamicParams.messages[0]?.content).toContain('请处理输入文本，保持事件与语义不变。')
    expect(dynamicParams.messages[1]?.content).toContain('处理后的输入')
  })

  it('uses meta.agent defaults when no explicit user binding exists', async () => {
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
      fromCache: false
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
    expect(params.model).toBe('folder-model')
    expect(params.temperature).toBe(0.45)
    expect(params.maxTokens).toBe(4096)
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
      fromCache: false
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

  it('keeps the compose merged template over the folder package template', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        script: `module.exports = { preProcess() { return { input: '处理后的输入' } } }`
      }),
      error: null,
      fromCache: false
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
    expect(dynamicParams.messages[0]?.content).toContain('compose合并模板')
    expect(dynamicParams.messages[0]?.content).not.toContain('请处理输入文本，保持事件与语义不变。')
    expect(result.diagnostics.some(item => item.code === 'base-template-applied')).toBe(true)
  })

  it('uses the resolved chain template over the folder package template', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        script: `module.exports = { preProcess() { return { input: '处理后的输入' } } }`
      }),
      error: null,
      fromCache: false
    })
    const callAi = vi.fn(async () => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget(),
      resolvedTemplate: 'chain解析后模板'
    })

    expect(result.status).toBe('success')
    const dynamicParams = (callAi.mock.calls[0] as unknown as Array<CallAiParams>)[0]
    expect(dynamicParams.messages[0]?.content).toContain('chain解析后模板')
    expect(dynamicParams.messages[0]?.content).not.toContain('请处理输入文本，保持事件与语义不变。')
    expect(result.diagnostics.some(item => item.code === 'base-template-applied')).toBe(true)
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
      fromCache: false
    })
    const result = await executeRealSkill({ folderPath: 'D:/skill', input: '原文', budget: createBudget() })
    expect(result.status).toBe('success')
    const dynamicParams = (callAi.mock.calls[0] as unknown as Array<CallAiParams>)[0]
    expect(dynamicParams.messages[0]?.content).toContain('固定模板')
    expect(dynamicParams.messages[0]?.content).not.toContain('旧协议函数')
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
      fromCache: false
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
      fromCache: false
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
      fromCache: false
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
      fromCache: false
    })
    const result = await executeRealSkill({ folderPath: 'D:/skill', input: '这段科幻内容包含机甲', budget: createBudget() })
    expect(result.status).toBe('success')
    const smartParams = (callAi.mock.calls[0] as unknown as Array<CallAiParams>)[0]
    const userPrompt = smartParams.messages[1]?.content ?? ''
    expect(userPrompt).toContain('科幻样本')
    expect(userPrompt).not.toContain('武侠样本')
  })
})
