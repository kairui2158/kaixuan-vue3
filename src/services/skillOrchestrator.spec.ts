import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./realSkillLoader', () => ({
  loadRealSkill: vi.fn()
}))
vi.mock('./aiService', () => ({
  getAiService: vi.fn(),
  filterThinkingTags: vi.fn((text: string) => text)
}))

const skillExecuteScriptMock = vi.fn(async (script: string, payload: { hook: string }) => {
  const module = { exports: {} as Record<string, unknown> }
  const run = new Function('module', 'exports', 'payload', script)
  run(module, module.exports, payload)
  const availableHooks = Object.keys(module.exports).filter(key => typeof module.exports[key] === 'function')
  return { ok: true, availableHooks, exports: {}, results: {}, templateOverride: '', logs: [] }
})
vi.stubGlobal('electronAPI', { skillExecuteScript: skillExecuteScriptMock })
vi.stubGlobal('window', {
  electronAPI: { skillExecuteScript: skillExecuteScriptMock },
  dispatchEvent: vi.fn()
})

import { executeCompositeSkill } from './skillOrchestrator'
import { loadRealSkill } from './realSkillLoader'
import { getAiService } from './aiService'

const loadRealSkillMock = vi.mocked(loadRealSkill)
const getAiServiceMock = vi.mocked(getAiService)

function packageFor(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: id,
    description: '',
    template: `模板-${id}`,
    meta: {},
    script: '',
    samples: '',
    schema: null,
    folderPath: `D:/skills/${id}`,
    ...overrides
  }
}

function budget() {
  return {
    tryConsume: vi.fn(() => ({ status: 'allowed' as const, used: 1, limit: 8 }))
  }
}

describe('skillOrchestrator composite', () => {
  beforeEach(() => {
    loadRealSkillMock.mockReset()
    getAiServiceMock.mockReset()
    skillExecuteScriptMock.mockReset()
    skillExecuteScriptMock.mockImplementation(async (script: string, payload: { hook: string; payload?: unknown }) => {
      const module = { exports: {} as Record<string, unknown> }
      const run = new Function('module', 'exports', 'payload', script)
      run(module, module.exports, { payload: payload.payload })
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
        templateOverride: '',
        logs: []
      }
    })
  })

  it('executes three child skills sequentially and maps status to DONE', async () => {
    const callAi = vi.fn(async () => ({ text: '组合输出' }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)
    loadRealSkillMock.mockImplementation(async (folderPath: string) => {
      if (folderPath === 'D:/skills/parent') {
        return {
          package: packageFor('parent', {
            folderPath: 'D:/skills/parent',
            meta: { executionMode: 'composite', children: ['child-a', 'child-b', 'child-c'] }
          }),
          error: null,
          folderPackageCache: false
        }
      }
      const id = folderPath.split('/').pop() || 'child'
      return { package: packageFor(id, { folderPath }), error: null, folderPackageCache: false }
    })

    const result = await executeCompositeSkill({
      folderPath: 'D:/skills/parent',
      input: '输入',
      budget: budget()
    })

    expect(result.status).toBe('DONE')
    expect(callAi).toHaveBeenCalledTimes(3)
    expect(result.steps.map(step => step.status)).toEqual(['done', 'done', 'done'])
  })

  it('inherits the pipeline injection fields for every composite child', async () => {
    const callAi = vi.fn(async () => ({ text: '组合输出' }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)
    loadRealSkillMock.mockImplementation(async (folderPath: string) => {
      if (folderPath === 'D:/skills/parent') {
        return {
          package: packageFor('parent', {
            folderPath: 'D:/skills/parent',
            meta: { executionMode: 'composite', children: ['child-a', 'child-b'] }
          }),
          error: null,
          folderPackageCache: false
        }
      }
      const id = folderPath.split('/').pop() || 'child'
      return { package: packageFor(id, { folderPath }), error: null, folderPackageCache: false }
    })

    const result = await executeCompositeSkill({
      folderPath: 'D:/skills/parent',
      input: '输入',
      budget: budget(),
      systemPromptSuffix: '降AI约束'
    })

    expect(result.status).toBe('DONE')
    expect(callAi).toHaveBeenCalledTimes(2)
    const systemPrompts = (callAi.mock.calls as unknown as Array<Array<any>>)
      .map(call => call[0]?.messages?.[0]?.content ?? '')
    expect(systemPrompts.length).toBe(2)
    expect(systemPrompts[0]).toContain('降AI约束')
    expect(systemPrompts[1]).toContain('降AI约束')
  })

  it('keeps the step agent parameters when child meta.agent is present', async () => {
    const callAi = vi.fn(async () => ({ text: '组合输出' }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)
    loadRealSkillMock.mockImplementation(async (folderPath: string) => {
      if (folderPath === 'D:/skills/parent') {
        return {
          package: packageFor('parent', {
            folderPath: 'D:/skills/parent',
            meta: { executionMode: 'composite', children: ['child-a', 'child-b'] }
          }),
          error: null,
          folderPackageCache: false
        }
      }
      const id = folderPath.split('/').pop() || 'child'
      const temperature = id === 'child-a' ? 0.45 : id === 'child-b' ? 0.85 : 0.55
      return {
        package: packageFor(id, {
          folderPath,
          meta: { agent: { temperature, maxTokens: 8192 } }
        }),
        error: null,
        folderPackageCache: false
      }
    })

    const result = await executeCompositeSkill({
      folderPath: 'D:/skills/parent',
      input: '输入',
      budget: budget(),
      agent: { id: 'step-agent', temperature: 0.2, model: 'step-model', maxTokens: 4096, systemPrompt: '步骤提示词' },
      agentSource: 'step-default'
    })

    expect(result.status).toBe('DONE')
    expect(callAi).toHaveBeenCalledTimes(2)
    const temperatures = callAi.mock.calls.map(call => (call as unknown as Array<any>)?.[0]?.temperature)
    const models = callAi.mock.calls.map(call => (call as unknown as Array<any>)?.[0]?.model)
    expect(temperatures).toEqual([0.2, 0.2])
    expect(models).toEqual(['step-model', 'step-model'])
  })

  it('keeps a user-bound agent over child meta.agent defaults', async () => {
    const callAi = vi.fn(async () => ({ text: '组合输出' }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)
    loadRealSkillMock.mockImplementation(async (folderPath: string) => {
      if (folderPath === 'D:/skills/parent') {
        return {
          package: packageFor('parent', {
            folderPath: 'D:/skills/parent',
            meta: { executionMode: 'composite', children: ['child-a', 'child-b'] }
          }),
          error: null,
          folderPackageCache: false
        }
      }
      const id = folderPath.split('/').pop() || 'child'
      return {
        package: packageFor(id, {
          folderPath,
          meta: { agent: { temperature: 0.45, model: 'child-model', maxTokens: 8192 } }
        }),
        error: null,
        folderPackageCache: false
      }
    })

    const result = await executeCompositeSkill({
      folderPath: 'D:/skills/parent',
      input: '输入',
      budget: budget(),
      agent: { id: 'user-agent', temperature: 0.3, model: 'user-model', maxTokens: 4096, systemPrompt: '用户绑定提示词' },
      agentSource: 'user-binding'
    })

    expect(result.status).toBe('DONE')
    expect(callAi).toHaveBeenCalledTimes(2)
    const temperatures = callAi.mock.calls.map(call => (call as unknown as Array<any>)?.[0]?.temperature)
    const models = callAi.mock.calls.map(call => (call as unknown as Array<any>)?.[0]?.model)
    expect(temperatures).toEqual([0.3, 0.3])
    expect(models).toEqual(['user-model', 'user-model'])
  })

  it('retries a child when afterStep returns retry and blocks after limit', async () => {
    const callAi = vi.fn(async () => ({ text: '步骤输出' }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)
    loadRealSkillMock.mockImplementation(async (folderPath: string) => {
      if (folderPath === 'D:/skills/parent') {
        return {
          package: packageFor('parent', {
            folderPath: 'D:/skills/parent',
            script: `module.exports = {
              afterStep() { return { action: 'retry', maxRetries: 1 } }
            }`,
            meta: { executionMode: 'composite', children: ['child-a'] }
          }),
          error: null,
          folderPackageCache: false
        }
      }
      const id = folderPath.split('/').pop() || 'child'
      return { package: packageFor(id, { folderPath }), error: null, folderPackageCache: false }
    })

    const result = await executeCompositeSkill({
      folderPath: 'D:/skills/parent',
      input: '输入',
      budget: budget()
    })

    expect(result.status).toBe('BLOCKED')
    expect(callAi).toHaveBeenCalledTimes(2)
    expect(result.steps[0]?.status).toBe('failed')
  })

  it('blocks nested composite beyond the depth limit', async () => {
    loadRealSkillMock.mockImplementation(async (folderPath: string) => ({
      package: packageFor(folderPath.split('/').pop() || 'skill', {
        folderPath,
        meta: { executionMode: 'composite', children: ['nested'] }
      }),
      error: null,
      folderPackageCache: false
    }))

    const result = await executeCompositeSkill({
      folderPath: 'D:/skills/parent',
      input: '输入',
      budget: budget(),
      maxDepth: 1
    })

    expect(result.status).toBe('BLOCKED')
    expect(result.errors[0]).toContain('composite 嵌套超过')
  })

  it('continues with DONE_WITH_CONCERNS when a degraded step keeps usable output', async () => {
    const callAi = vi.fn(async (request: any) => {
      if (request.messages?.[0]?.content?.includes('child-a')) return { text: '降级可用输出' }
      return { text: '后续步骤输出' }
    })
    getAiServiceMock.mockResolvedValue({ callAi } as any)
    loadRealSkillMock.mockImplementation(async (folderPath: string) => {
      if (folderPath === 'D:/skills/parent') {
        return {
          package: packageFor('parent', {
            folderPath: 'D:/skills/parent',
            meta: { executionMode: 'composite', children: ['child-a', 'child-b'] }
          }),
          error: null,
          folderPackageCache: false
        }
      }
      const id = folderPath.split('/').pop() || 'child'
      return {
        package: packageFor(id, {
          folderPath,
          template: `模板-${id}`,
          schema: id === 'child-a' ? { required: ['missing-field'] } : null
        }),
        error: null,
        folderPackageCache: false
      }
    })

    const result = await executeCompositeSkill({
      folderPath: 'D:/skills/parent',
      input: '输入',
      budget: budget()
    })

    expect(result.status).toBe('DONE_WITH_CONCERNS')
    expect(result.output).toBe('后续步骤输出')
    expect(result.steps.map(step => step.status)).toEqual(['done', 'done'])
    expect(result.diagnostics.some(item => item.code === 'step-degraded-with-output')).toBe(true)
    expect(result.diagnostics.some(item =>
      item.code === 'step-artifact-no-contract'
      && item.message.includes('no_contract')
    )).toBe(true)
  })

  it('blocks a degraded step when no usable output remains', async () => {
    const callAi = vi.fn(async () => ({ text: '' }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)
    loadRealSkillMock.mockImplementation(async (folderPath: string) => {
      if (folderPath === 'D:/skills/parent') {
        return {
          package: packageFor('parent', {
            folderPath: 'D:/skills/parent',
            meta: { executionMode: 'composite', children: ['child-a'] }
          }),
          error: null,
          folderPackageCache: false
        }
      }
      const id = folderPath.split('/').pop() || 'child'
      return {
        package: packageFor(id, {
          folderPath,
          schema: { required: ['missing-field'] }
        }),
        error: null,
        folderPackageCache: false
      }
    })

    const result = await executeCompositeSkill({
      folderPath: 'D:/skills/parent',
      input: '输入',
      budget: budget()
    })

    expect(result.status).toBe('BLOCKED')
    expect(result.steps[0]?.status).toBe('failed')
    expect(result.output).toBe('')
  })

  it('marks a skipped child and continues later steps', async () => {
    const callAi = vi.fn(async () => ({ text: '后续输出' }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)
    loadRealSkillMock.mockImplementation(async (folderPath: string) => {
      if (folderPath === 'D:/skills/parent') {
        return {
          package: packageFor('parent', {
            folderPath: 'D:/skills/parent',
            script: `module.exports = {
              afterStep(payload) {
                if (payload.stepId === 'child-a') return { action: 'skip' }
                return { action: 'continue' }
              }
            }`,
            meta: { executionMode: 'composite', children: ['child-a', 'child-b'] }
          }),
          error: null,
          folderPackageCache: false
        }
      }
      const id = folderPath.split('/').pop() || 'child'
      return { package: packageFor(id, { folderPath }), error: null, folderPackageCache: false }
    })

    const result = await executeCompositeSkill({
      folderPath: 'D:/skills/parent',
      input: '输入',
      budget: budget()
    })

    expect(result.status).toBe('DONE_WITH_CONCERNS')
    expect(result.steps.map(step => step.status)).toEqual(['skipped', 'done'])
    expect(callAi).toHaveBeenCalledTimes(2)
  })

  it('stops the whole composite when afterStep returns stop', async () => {
    const callAi = vi.fn(async () => ({ text: '步骤输出' }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)
    loadRealSkillMock.mockImplementation(async (folderPath: string) => {
      if (folderPath === 'D:/skills/parent') {
        return {
          package: packageFor('parent', {
            folderPath: 'D:/skills/parent',
            script: `module.exports = { afterStep() { return { action: 'stop' } } }`,
            meta: { executionMode: 'composite', children: ['child-a', 'child-b'] }
          }),
          error: null,
          folderPackageCache: false
        }
      }
      const id = folderPath.split('/').pop() || 'child'
      return { package: packageFor(id, { folderPath }), error: null, folderPackageCache: false }
    })

    const result = await executeCompositeSkill({
      folderPath: 'D:/skills/parent',
      input: '输入',
      budget: budget()
    })

    expect(result.status).toBe('BLOCKED')
    expect(callAi).toHaveBeenCalledTimes(1)
    expect(result.errors[0]).toContain('被父技能停止')
  })

  it('blocks when the shared API budget is exhausted and reports usage', async () => {
    const callAi = vi.fn(async () => ({ text: '步骤输出' }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)
    loadRealSkillMock.mockImplementation(async (folderPath: string) => {
      if (folderPath === 'D:/skills/parent') {
        return {
          package: packageFor('parent', {
            folderPath: 'D:/skills/parent',
            meta: { executionMode: 'composite', children: ['child-a'] }
          }),
          error: null,
          folderPackageCache: false
        }
      }
      const id = folderPath.split('/').pop() || 'child'
      return { package: packageFor(id, { folderPath }), error: null, folderPackageCache: false }
    })
    const tryConsume = vi.fn(() => ({
      status: 'blocked' as const,
      used: 8,
      limit: 8,
      reason: 'API 调用预算已耗尽（已用 8/8）'
    }))

    const result = await executeCompositeSkill({
      folderPath: 'D:/skills/parent',
      input: '输入',
      budget: { tryConsume }
    })

    expect(result.status).toBe('BLOCKED')
    expect(callAi).not.toHaveBeenCalled()
    expect(result.errors[0]).toContain('已用 8/8')
    expect(result.diagnostics.some(item => item.code === 'api-budget-blocked')).toBe(true)
  })

  it('marks a missing child as BLOCKED without pretending success', async () => {
    loadRealSkillMock.mockImplementation(async (folderPath: string) => {
      if (folderPath === 'D:/skills/parent') {
        return {
          package: packageFor('parent', {
            folderPath: 'D:/skills/parent',
            meta: { executionMode: 'composite', children: ['missing'] }
          }),
          error: null,
          folderPackageCache: false
        }
      }
      return { package: null, error: 'folder-not-found', folderPackageCache: false }
    })

    const result = await executeCompositeSkill({
      folderPath: 'D:/skills/parent',
      input: '输入',
      budget: budget()
    })

    expect(result.status).toBe('BLOCKED')
    expect(result.errors[0]).toContain('子技能加载失败')
  })
})
