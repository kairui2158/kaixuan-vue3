import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SKILL_GUIDANCE_PROTOCOL_GUARD } from './skillGuidanceSanitizer'

vi.mock('./realSkillLoader', () => ({
  loadRealSkill: vi.fn()
}))
vi.mock('./aiService', () => ({
  getAiService: vi.fn(),
  filterThinkingTags: vi.fn((text: string) => text)
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
import { buildFolderPassInputMeasurement, countRepeatedPromptBlocks } from './realSkillExecutor'
import { loadRealSkill } from './realSkillLoader'
import { DeAiSamples } from './deai-samples.js'
import { getAiService } from './aiService'
import type { CallAiParams } from './aiService'
import type { FinalStepFeedbackResult } from './finalStepFeedback'

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
  beforeEach(() => {
    loadRealSkillMock.mockReset()
    getAiServiceMock.mockReset()
    skillExecuteScriptMock.mockReset()
    skillExecuteScriptMock.mockImplementation(async (script: string, payload: { hook: string }) => {
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
  })

  it('fails closed on the pinned package before making a physical API call', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: null,
      error: 'skill_version_mismatch',
      pinMismatch: {
        folderPath: 'D:/skill',
        expected: [{ file: 'template.md', hash: 'expected', mtime: 1, bytes: 10 }],
        actual: [{ file: 'template.md', hash: 'actual', mtime: 2, bytes: 20 }]
      },
      failure: {
        code: 'skill_version_mismatch',
        message: 'SKILL 目录内容与运行基准不一致，禁止中途换闸',
        folderPath: 'D:/skill',
        action: '请结束本次运行后重新启动'
      },
      folderPackageCache: false
    })
    const callAi = vi.fn(async () => ({ text: '不该发生' }))
    const onSkillVersionMismatch = vi.fn()
    getAiServiceMock.mockResolvedValue({ callAi } as any)

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget(),
      pinnedFingerprint: [{ file: 'template.md', hash: 'expected', mtime: 1, bytes: 10 }],
      onSkillVersionMismatch
    })

    expect(result.status).toBe('failed')
    expect(result.output).toBe('')
    expect(result.diagnostics[0]?.code).toBe('skill_version_mismatch')
    expect(result.errors[0]).toContain('运行基准')
    expect(result.errors[0]).toContain('磁盘现状')
    expect(result.diagnostics).toEqual([expect.objectContaining({ code: 'skill_version_mismatch' })])
    expect(onSkillVersionMismatch).toHaveBeenCalledWith(expect.objectContaining({
      folderPath: 'D:/skill',
      expected: [{ file: 'template.md', hash: 'expected', mtime: 1, bytes: 10 }]
    }))
    expect(callAi).not.toHaveBeenCalled()
    expect(loadRealSkillMock).toHaveBeenCalledWith('D:/skill', {
      pinnedFingerprint: [{ file: 'template.md', hash: 'expected', mtime: 1, bytes: 10 }]
    })
  })

  it('rechecks the pin at the start of every retry attempt and blocks a mid-run swap', async () => {
    const expectedPin = [{ file: 'template.md', hash: 'expected', mtime: 1, bytes: 10 }]
    const makeAttemptPackage = () => createPackage({
      schema: {
        type: 'object',
        required: ['output', 'expected'],
        properties: { output: { type: 'string' }, expected: { type: 'string' } }
      }
    })
    loadRealSkillMock
      .mockResolvedValueOnce({
        package: makeAttemptPackage(),
        error: null,
        folderPackageCache: false
      })
      .mockResolvedValueOnce({
        package: makeAttemptPackage(),
        error: null,
        folderPackageCache: false
      })
      .mockResolvedValueOnce({
        package: null,
        error: 'skill_version_mismatch',
        pinMismatch: {
          folderPath: 'D:/skill',
          expected: expectedPin,
          actual: [{ file: 'template.md', hash: 'swapped', mtime: 3, bytes: 30 }]
        },
        failure: {
          code: 'skill_version_mismatch',
          message: 'SKILL 目录内容与运行基准不一致，禁止中途换闸',
          folderPath: 'D:/skill',
          action: '请结束本次运行后重新启动'
        },
        folderPackageCache: false
      })
    const callAi = vi.fn(async (_params: CallAiParams) => ({ text: JSON.stringify({ output: '第 1 次输出' }) }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)
    const onSkillVersionMismatch = vi.fn()

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget(),
      pinnedFingerprint: expectedPin,
      onSkillVersionMismatch,
    })

    expect(result.status).toBe('failed')
    expect(callAi).toHaveBeenCalledTimes(1)
    expect(loadRealSkillMock).toHaveBeenCalledTimes(3)
    expect(loadRealSkillMock).toHaveBeenNthCalledWith(3, 'D:/skill', { pinnedFingerprint: expectedPin })
    expect(onSkillVersionMismatch).toHaveBeenCalledWith(expect.objectContaining({
      expected: expectedPin,
      actual: [{ file: 'template.md', hash: 'swapped', mtime: 3, bytes: 30 }]
    }))
  })

  it('routes the layer provider and records its source in call metadata', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage(),
      error: null,
      folderPackageCache: false
    })
    const callAi = vi.fn(async (_params: CallAiParams) => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      providerId: 'provider-layer',
      providerSource: 'layer',
      budget: createBudget()
    })

    expect(result.status).toBe('success')
    expect(callAi).toHaveBeenCalledWith(expect.objectContaining({
      providerId: 'provider-layer',
      meta: expect.objectContaining({ providerSource: 'layer' })
    }))
  })

  it('passes observability-only context composition without changing request messages', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage(),
      error: null,
      folderPackageCache: false
    })
    const callAi = vi.fn(async (_params: CallAiParams) => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)

    await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      contextLayer: 'chapters',
      providerId: 'provider-layer',
      providerModel: 'model-a',
      budget: createBudget()
    })

    expect(callAi).toHaveBeenCalledWith(expect.objectContaining({
      contextComposition: {
        layer: 'chapters',
        step: 0,
        providerId: 'provider-layer',
        model: 'model-a',
        stableSystemPrefix: expect.any(String),
        stableUserPrefix: ''
      }
    }))
  })

  it('does not block or retry the retired legacy density word-table', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage(),
      error: null,
      folderPackageCache: false
    })
    const callAi = vi.fn(async () => ({
      text: 'NOT-READY：章级事件密度不足，需上游补剧情点'
    }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget()
    })

    expect(result.status).toBe('success')
    expect(callAi).toHaveBeenCalledTimes(1)
    expect(result.errors.filter((error: string) => error.includes('章级事件密度不足'))).toEqual([])
    expect(result.diagnostics.some(item => item.code === 'chapter-event-density-not-ready')).toBe(false)
  })

  it('blocks an explicit SKILL narrative not_ready verdict without retrying', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage(),
      error: null,
      folderPackageCache: false
    })
    const callAi = vi.fn(async () => ({
      text: '【正文交接】\nnarrativeStatus: not_ready\nnarrativeReason：全章只有确认与核对，未改变状态'
    }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget()
    })

    expect(result.status).toBe('blocked')
    expect(callAi).toHaveBeenCalledTimes(1)
    expect(result.errors[0]).toContain('全章只有确认与核对，未改变状态')
    expect(result.errors[0]).toContain('章节规划/剧情层')
    expect(result.diagnostics.some(item => item.code === 'chapter-narrative-not-ready')).toBe(true)
  })

  it('keeps the layer provider ahead of the explicit agent provider', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage(),
      error: null,
      folderPackageCache: false
    })
    const callAi = vi.fn(async (_params: CallAiParams) => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      providerId: 'provider-layer',
      providerSource: 'layer',
      agent: { providerId: 'provider-agent' },
      budget: createBudget()
    })

    expect(result.status).toBe('success')
    expect(callAi).toHaveBeenCalledWith(expect.objectContaining({
      providerId: 'provider-layer',
      meta: expect.objectContaining({ providerSource: 'layer' })
    }))
  })

  it('counts repeated prompt marker blocks in the user prompt only', () => {
    const counts = countRepeatedPromptBlocks(
      '[style reference]\n样本\n\n--- text ---\n[大纲]\n正文\n[大纲]\n[已生成卷事实清单]\n第一卷\n[已生成卷事实清单]\n第二卷'
    )

    expect(counts).toEqual({
      '[已生成卷事实清单]': 2,
      '[全书大纲]': 0,
      '[大纲]': 2,
      '[style reference]': 1,
      '[上一步 SKILL 完整输出]': 0
    })
  })

  it('records repeated prompt block counts in the timing ledger', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage(),
      error: null,
      folderPackageCache: false
    })
    const callAi = vi.fn(async () => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '[大纲]\n原文\n[大纲]\n[已生成卷事实清单]\n第一卷\n[已生成卷事实清单]\n第二卷',
      budget: createBudget()
    })

    expect(result.status).toBe('success')
    expect(result.apiMeta?.timingLedger?.repeatedPromptBlocks).toEqual({
      '[已生成卷事实清单]': 2,
      '[全书大纲]': 0,
      '[大纲]': 2,
      '[style reference]': 1,
      '[上一步 SKILL 完整输出]': 0
    })
  })

  it('measures the real request caliber for a folder pass', () => {
    const measurement = buildFolderPassInputMeasurement({
      passIndex: 1,
      inputMode: 'previous',
      input: '上一步输出',
      userPrompt: '用户请求 1000 字',
      systemPrompt: '系统提示 2000 字',
      sampleCount: 2,
      isRetry: true,
      declaredFullUpstream: true,
      appliedFullUpstream: true
    })

    expect(measurement).toEqual({
      passIndex: 1,
      inputMode: 'previous',
      inputLength: '上一步输出'.length,
      userPromptLength: '用户请求 1000 字'.length,
      systemPromptLength: '系统提示 2000 字'.length,
      sampleCount: 2,
      isRetry: true,
      declaredFullUpstream: true,
      appliedFullUpstream: true,
      traceRunId: null,
      traceCallId: null
    })
  })

  it('keeps declared upstream context in a previous-input pass', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        meta: {
          executionMode: 'multi-pass',
          chainHandoff: { requiresFullUpstreamContext: true },
          passes: [
            { name: '第一步' },
            { name: '第二步', input: 'previous' }
          ]
        }
      }),
      error: null,
      folderPackageCache: false
    })
    const callAi = vi.fn(async () => ({ text: '正'.repeat(3000) }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget(),
      chainUpstreamContext: '上游设定：北境雪城'
    })

    expect(result.status).toBe('success')
    const secondPassUserPrompt = result.apiMeta?.attemptRequestMessages?.[1]?.messages
      ?.find(message => message.role === 'user')?.content || ''
    expect(secondPassUserPrompt).toContain('[declared upstream context]')
    expect(secondPassUserPrompt).toContain('上游设定：北境雪城')
    expect(secondPassUserPrompt).toContain('[style reference]')
  })

  it('keeps previous-input behavior unchanged without the upstream declaration', async () => {
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
    const callAi = vi.fn(async () => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget(),
      chainUpstreamContext: '上游设定：北境雪城'
    })

    expect(result.status).toBe('success')
    const secondPassUserPrompt = result.apiMeta?.attemptRequestMessages?.[1]?.messages
      ?.find(message => message.role === 'user')?.content || ''
    expect(secondPassUserPrompt).not.toContain('[declared upstream context]')
    expect(secondPassUserPrompt).not.toContain('上游设定：北境雪城')
  })

  it('keeps app-owned final-step retry feedback in the folder user prompt', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        meta: {
          executionMode: 'multi-pass',
          passes: [{ name: '唯一一步' }]
        }
      }),
      error: null,
      folderPackageCache: false
    })
    const callAi = vi.fn(async () => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget(),
      userPromptSuffix: '【终步重试协议】\n终步回显校验失败：输出与上一步高度重复。'
    })

    expect(result.status).toBe('success')
    const userPrompt = result.apiMeta?.requestMessages
      ?.find(message => message.role === 'user')?.content || ''
    expect(userPrompt).toContain('原文')
    expect(userPrompt).toContain('【终步重试协议】')
    expect(userPrompt).toContain('终步回显校验失败')
  })

  it('warns and keeps previous-only input when declared upstream context is empty', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        meta: {
          executionMode: 'multi-pass',
          chainHandoff: { requiresFullUpstreamContext: true },
          passes: [
            { name: '第一步' },
            { name: '第二步', input: 'previous' }
          ]
        }
      }),
      error: null,
      folderPackageCache: false
    })
    const callAi = vi.fn(async () => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget()
    })

    expect(result.status).toBe('success')
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'chain-upstream-context-empty'
    }))
    const secondPassUserPrompt = result.apiMeta?.attemptRequestMessages?.[1]?.messages
      ?.find(message => message.role === 'user')?.content || ''
    expect(secondPassUserPrompt).not.toContain('[declared upstream context]')
  })

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
      providerId: 'provider-1',
      providerType: 'unsupported-provider'
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
    expect(callAi.mock.calls[1]![0]).toMatchObject({ retryStrategy: 'max_tokens_raised' })
    expect(callAi.mock.calls[1]![0].maxTokens).toBeGreaterThan(1000)
    expect(eventSpy.mock.calls[1]![0]).toMatchObject({ retryStrategy: 'max_tokens_raised' })
    expect(eventSpy.mock.calls[1]![0].maxTokens).toBeGreaterThan(1000)
    expect(eventSpy.mock.calls[2]![0]).toMatchObject({ retryStrategy: 'max_tokens_raised' })
    expect(eventSpy.mock.calls[2]![0].maxTokens).toBeGreaterThan(1000)
    expect(result.errors[0]).toContain('模型思考耗尽输出预算')
    expect(result.diagnostics.some(item => item.code === 'generation-invalid:reasoning_exhausted')).toBe(true)
  })

  it('uses provider reasoning control for the direct-output retry when the provider type is known', async () => {
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
      providerId: 'provider-1',
      providerType: 'openai-compatible'
    }))
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget(),
      agent: { id: 'agent-1', maxTokens: 1000 },
      onGenerationEvent: eventSpy
    })

    expect(callAi).toHaveBeenCalledTimes(2)
    expect(callAi.mock.calls[1]![0]).toMatchObject({
      retryStrategy: 'thinking_disabled',
      maxTokens: 1000,
      reasoning: { mode: 'off' }
    })
    expect(eventSpy.mock.calls[1]![0]).toMatchObject({
      retryStrategy: 'thinking_disabled',
      maxTokens: 1000
    })
    expect(result.status).toBe('failed')
  })

  it('routes folder calls through the layer provider even when an agent binding exists', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage(),
      error: null,
      folderPackageCache: false
    })
    const callAi = vi.fn(async () => ({
      text: 'ok',
      finishReason: 'stop',
      providerId: 'provider-agent',
    }))
    const result = await executeRealSkill({
      folderPath: '',
      input: 'input',
      agent: { providerId: 'provider-agent' },
      purpose: 'generate',
      providerId: 'provider-layer',
      budget: { tryConsume: () => ({ status: 'allowed' }) },
      aiService: { callAi },
    } as any)

    expect(result.status).toBe('success')
    expect(callAi).toHaveBeenCalledWith(expect.objectContaining({
      providerId: 'provider-layer',
    }))
  })

  it('routes folder calls through the layer provider when the agent has no binding', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage(),
      error: null,
      folderPackageCache: false
    })
    const callAi = vi.fn(async () => ({
      text: 'ok',
      finishReason: 'stop',
      providerId: 'provider-layer',
    }))
    const result = await executeRealSkill({
      folderPath: '',
      input: 'input',
      agent: null,
      purpose: 'generate',
      providerId: 'provider-layer',
      budget: { tryConsume: () => ({ status: 'allowed' }) },
      aiService: { callAi },
    } as any)

    expect(result.status).toBe('success')
    expect(callAi).toHaveBeenCalledWith(expect.objectContaining({
      providerId: 'provider-layer',
    }))
  })

  it('does not send an unbound agent model to the layer provider', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage(),
      error: null,
      folderPackageCache: false
    })
    const callAi = vi.fn(async () => ({
      text: 'ok',
      finishReason: 'stop',
      providerId: 'provider-layer',
    }))
    const result = await executeRealSkill({
      folderPath: '',
      input: 'input',
      agent: { model: 'agent-model' },
      purpose: 'generate',
      providerId: 'provider-layer',
      providerSource: 'layer',
      providerModel: 'layer-model',
      providerModelSource: 'caller-profile',
      providerModelFallback: { reason: 'agent-model-without-provider', configuredModel: 'agent-model' },
      budget: { tryConsume: () => ({ status: 'allowed' }) },
      aiService: { callAi },
    } as any)

    expect(result.status).toBe('success')
    expect(callAi).toHaveBeenCalledWith(expect.objectContaining({
      providerId: 'provider-layer',
      model: 'layer-model',
      meta: expect.objectContaining({
        providerSource: 'layer',
        modelSource: 'caller-profile',
      }),
    }))
  })

  it('fails before the request when the resolved provider has no model', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage(),
      error: null,
      folderPackageCache: false
    })
    const callAi = vi.fn(async () => ({ text: 'ok' }))
    const result = await executeRealSkill({
      folderPath: '',
      input: 'input',
      agent: null,
      purpose: 'generate',
      providerId: 'provider-layer',
      providerModel: '',
      providerModelMissing: true,
      budget: { tryConsume: () => ({ status: 'allowed' }) },
      aiService: { callAi },
    } as any)

    expect(result.status).toBe('failed')
    expect(callAi).not.toHaveBeenCalled()
    expect(result.errors[0]).toContain('未配置可用模型')
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
    expect(result.status).toBe('success')
    expect(result.output).toBe('直出正文')
    expect(result.diagnostics.some(item => item.code === 'generation-direct-retry-recovered' && item.type === 'warning')).toBe(true)
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
    expect(result.status).toBe('success')
    expect(result.diagnostics.some(item => item.code === 'generation-truncated')).toBe(false)
  })

  it('stops after one truncated continuation and keeps the usable output', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage(),
      error: null,
      folderPackageCache: false
    })
    const callAi = vi.fn(async () => ({
      text: '卷纲开头，主角进入北境。',
      finishReason: 'length'
    }))
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget()
    })

    expect(callAi).toHaveBeenCalledTimes(2)
    expect(result.output).toContain('卷纲开头，主角进入北境。')
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'generation-truncated-after-continuation'
    }))
  })

  it('keeps the original length signal when the continuation is still truncated', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage(),
      error: null,
      folderPackageCache: false
    })
    const callAi = vi.fn(async () => ({
      text: '卷纲开头，主角进入北境。',
      finishReason: 'length'
    }))
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget()
    })

    expect(callAi).toHaveBeenCalledTimes(2)
    expect(result.apiMeta?.finishReason).toBe('length')
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'generation-truncated-after-continuation'
    }))
  })

  it('marks the run degraded when the continuation is still truncated', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage(),
      error: null,
      folderPackageCache: false
    })
    const callAi = vi.fn(async (_params: CallAiParams) => {
      if (callAi.mock.calls.length === 1) {
        return { text: '卷纲开头，主角进入北境。', finishReason: 'length' }
      }
      return { text: '主角进入北境。随后敌军压境。', finishReason: 'length' }
    })
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget()
    })

    expect(result.status).toBe('degraded')
    expect(result.apiMeta?.finishReason).toBe('length')
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'generation-truncated-after-continuation'
    }))
  })

  it('sends only the bounded output tail in a continuation request', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage(),
      error: null,
      folderPackageCache: false
    })
    const firstOutput = '开'.repeat(40000)
    const callAi = vi.fn(async (_params: CallAiParams) => {
      if (callAi.mock.calls.length === 1) {
        return { text: firstOutput, finishReason: 'length' }
      }
      return { text: '续写结尾', finishReason: 'stop' }
    })
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget()
    })

    expect(callAi).toHaveBeenCalledTimes(2)
    const continuationMessages = callAi.mock.calls[1]![0].messages
    const continuationMessage = continuationMessages.find(message => message.role === 'user')!
    expect(continuationMessage.role).toBe('user')
    expect(continuationMessages.some(message =>
      message.role === 'system' && String(message.content).includes('请处理输入文本')))
      .toBe(true)
    expect((continuationMessage.content as string).length).toBeLessThanOrEqual(32100)
    expect((continuationMessage.content as string)).toContain('最后部分')
    expect(result.output).toBe(firstOutput + '\n续写结尾')
  })

  it('skips a continuation self-check annotation and keeps the original candidate', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage(),
      error: null,
      folderPackageCache: false
    })
    const firstOutput = '卷纲开头，主体抵达北境。'
    const callAi = vi.fn(async (_params: CallAiParams) => {
      if (callAi.mock.calls.length === 1) {
        return { text: firstOutput, finishReason: 'length' }
      }
      return {
        text: '【续写检查：当前卷任务包已到达协议终点，无待续写内容。】',
        finishReason: 'stop'
      }
    })
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget()
    })

    expect(callAi).toHaveBeenCalledTimes(2)
    expect(result.status).toBe('success')
    expect(result.output).toBe(firstOutput)
    expect(result.output).not.toContain('【续写检查：')
    expect(result.apiMeta?.finishReason).toBe('stop')
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'continuation-self-check-skipped',
      type: 'warning'
    }))
  })

  it('counts a direct-output retry as one physical call without consuming budget twice', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage(),
      error: null,
      folderPackageCache: false
    })
    const budget = {
      tryConsume: vi.fn((step: string) => step.includes(':direct-retry')
        ? { status: 'blocked' as const, used: 1, limit: 1, reason: 'API 调用预算已耗尽' }
        : { status: 'allowed' as const, used: 1, limit: 1 })
    }
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
      budget,
      agent: { id: 'agent-1', maxTokens: 1000 }
    } as any)

    expect(result.status).toBe('success')
    expect(callAi).toHaveBeenCalledTimes(2)
    expect(budget.tryConsume).toHaveBeenCalledTimes(1)
    expect(result.output).toBe('直出正文')
  })

  it('bans protocol markers in the continuation prompt', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage(),
      error: null,
      folderPackageCache: false
    })
    const callAi = vi.fn(async (_params: CallAiParams) => {
      if (callAi.mock.calls.length === 1) {
        return { text: '卷纲开头，主角进入北境。', finishReason: 'length' }
      }
      return { text: '随后敌军压境。', finishReason: 'stop' }
    })
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: {
        tryConsume: () => ({ status: 'allowed', used: 1, limit: 24 }),
        consumePhysicalRetry: () => ({ status: 'allowed', used: 2, limit: 24 })
      }
    } as any)

    expect(result.status).toBe('success')
    const continuationMessage = callAi.mock.calls[1]![0].messages.at(-1)!
    expect(continuationMessage.role).toBe('user')
    expect(continuationMessage.content).toContain('也不要输出任何【续写检查】等协议标记')
  })

  it('deduplicates physical call events and charges the physical retry budget once', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage(),
      error: null,
      folderPackageCache: false
    })
    const consumePhysicalRetry = vi.fn(() => ({
      status: 'allowed' as const,
      used: 2,
      limit: 24,
      step: 'physical'
    }))
    const tryConsume = vi.fn(() => ({ status: 'allowed' as const, used: 1, limit: 24 }))
    const onPhysicalCall = vi.fn()
    const emit = (params: CallAiParams) => {
      params.onPhysicalCall?.({
        physicalCallId: 'physical-continuation-1',
        phase: 'continuation',
        status: 'running',
        attempt: 1,
        durationMs: 0,
        requestMessages: params.messages,
        responseText: '',
        streamText: '',
        reasoningText: '',
        toolsEnabled: false,
        toolsDowngraded: false
      } as any)
      params.onPhysicalCall?.({
        physicalCallId: 'physical-continuation-1',
        phase: 'continuation',
        status: 'success',
        attempt: 1,
        durationMs: 20,
        requestMessages: params.messages,
        responseText: '随后敌军压境。',
        streamText: '随后敌军压境。',
        reasoningText: '',
        toolsEnabled: false,
        toolsDowngraded: false
      } as any)
    }
    const callAi = vi.fn(async (params: CallAiParams) => {
      if (callAi.mock.calls.length === 1) {
        return { text: '卷纲开头，主角进入北境。', finishReason: 'length' }
      }
      emit(params)
      return { text: '随后敌军压境。', finishReason: 'stop' }
    })
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: { tryConsume, consumePhysicalRetry },
      onPhysicalCall
    } as any)

    expect(result.status).toBe('success')
    expect(callAi).toHaveBeenCalledTimes(2)
    expect(consumePhysicalRetry).toHaveBeenCalledTimes(1)
    expect(consumePhysicalRetry).toHaveBeenCalledWith(expect.stringContaining('attempt-1:physical'))
    expect(onPhysicalCall).toHaveBeenCalledTimes(2)
  })

  it('returns blocked when a physical retry exhausts the budget', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage(),
      error: null,
      folderPackageCache: false
    })
    const budgetReason = 'API 物理重试预算已耗尽（已用 24/24），阻断位置：physical'
    const budget = {
      tryConsume: vi.fn(() => ({ status: 'allowed' as const, used: 1, limit: 24 })),
      consumePhysicalRetry: vi.fn(() => ({
        status: 'blocked' as const,
        used: 24,
        limit: 24,
        reason: budgetReason,
        step: 'physical'
      }))
    }
    const callAi = vi.fn(async (params: CallAiParams) => {
      params.onPhysicalCall?.({
        physicalCallId: 'physical-retry-1',
        phase: 'retry',
        status: 'failed',
        attempt: 1,
        durationMs: 0,
        requestMessages: params.messages,
        responseText: '',
        streamText: '',
        reasoningText: '',
        toolsEnabled: false,
        toolsDowngraded: false,
        error: 'network unavailable'
      } as any)
      throw new Error('network unavailable')
    })
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget
    } as any)

    expect(result.status).toBe('blocked')
    expect(callAi).toHaveBeenCalledTimes(1)
    expect(budget.consumePhysicalRetry).toHaveBeenCalledTimes(1)
    expect(result.errors).toContain(budgetReason)
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'api-budget-blocked',
      type: 'error'
    }))
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
    expect(systemPrompt.startsWith(SKILL_GUIDANCE_PROTOCOL_GUARD)).toBe(true)
    expect(systemPrompt).toContain('智能体指令')
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
    expect(systemPrompt.startsWith(SKILL_GUIDANCE_PROTOCOL_GUARD)).toBe(true)
    expect(systemPrompt).toContain('智能体指令')
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
    const composed: FinalStepFeedbackResult[] = []

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

  it('keeps a non-final chain schema failure as a degraded result without retries', async () => {
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
    const composed: FinalStepFeedbackResult[] = []

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget(),
      validateOutputSchema: true
    })

    expect(callAi).toHaveBeenCalledTimes(1)
    expect(result.status).toBe('degraded')
    expect(result.output).toBe('S1 中间输出')
    expect(result.diagnostics.some(item => item.code === 'schema-contract-warning')).toBe(true)
    expect(result.diagnostics.some(item => item.code === 'schema-validation-exhausted')).toBe(false)
    expect(result.diagnostics.some(item => item.code === 'schema-contract-warning' && item.message.includes('交由产物契约门裁决'))).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('retries blocking postProcess issues with the previous candidate and recovers', async () => {
    const callAi = vi.fn(async (_params: CallAiParams) => ({
      text: callAi.mock.calls.length === 1 ? '输出' : '修复后的输出'
    }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        script: `module.exports = { postProcess({ output }) { if (output === '输出') return { output, valid: false, issues: [{ code: 'lost-section', severity: 'blocking', message: '缺少核心章节' }, { code: 'minor-warning', severity: 'non-blocking', message: '存在轻微问题' }] }; return { output, valid: true } } }`,
        resources: []
      }),
      error: null,
      folderPackageCache: false,
      warnings: [{ code: 'template-fallback-skill-md', message: '缺少 template.md，已回退使用 SKILL.md 正文' }]
    })

    const result = await executeRealSkill({ folderPath: 'D:/skill', input: '原文', budget: createBudget() })

    expect(result.status).toBe('success')
    expect(result.output).toBe('修复后的输出')
    expect(callAi).toHaveBeenCalledTimes(2)
    expect(result.diagnostics.some(item => item.code === 'folder-package:template-fallback-skill-md')).toBe(true)
    expect(result.diagnostics.filter(item => item.code === 'post-process-issue:lost-section')[0]?.type).toBe('error')
    expect(result.diagnostics.filter(item => item.code === 'post-process-issue:minor-warning')[0]?.type).toBe('warning')
    expect(result.errors.join('\n')).toContain('缺少核心章节')
    expect(result.folderPackageCache).toBe(false)
    expect(result.postProcessReport).toMatchObject({
      applied: true,
      changedOutput: false,
      output: '修复后的输出',
      issues: []
    })
    expect(result.apiMeta?.requestMessages).toEqual([
      { role: 'system', content: expect.stringContaining('请处理输入文本') },
      { role: 'user', content: expect.stringMatching(/^\[style reference\][\s\S]*\n--- text ---\n原文$/) }
    ])
    const retrySystemPrompt = callAi.mock.calls[1]![0].messages[0]?.content || ''
    expect(retrySystemPrompt).toContain('缺少核心章节')
    expect(retrySystemPrompt).toContain('【结构化重试反馈】')
    expect(retrySystemPrompt).toContain('候选输出有界摘要')
    expect(retrySystemPrompt).toContain('输出')
    expect(retrySystemPrompt).not.toContain('<<<上一版候选输出开始>>>')
    expect(retrySystemPrompt).not.toContain('请基于上一版候选输出修正上述错误')
  })

  it('fails blocking postProcess exhaustion after candidate-preserving retries', async () => {
    const callAi = vi.fn(async (_params: CallAiParams) => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        script: `module.exports = { postProcess({ output }) { return { output, valid: false, issues: [{ code: 'lost-section', severity: 'blocking', message: '缺少核心章节' }] } } }`,
        resources: []
      }),
      error: null,
      folderPackageCache: false
    })

    const result = await executeRealSkill({ folderPath: 'D:/skill', input: '原文', budget: createBudget() })

    expect(result.status).toBe('failed')
    expect(result.blockingGateFailed).toBe(true)
    expect(result.output).toBe('输出')
    expect(callAi).toHaveBeenCalledTimes(3)
    expect(result.errors.join('\n')).toContain('第 3/3 次输出未通过 postProcess 校验')
    expect(result.diagnostics.some(item => item.code === 'post-process-validation-failed')).toBe(true)
    expect(result.diagnostics.some(item => item.code === 'schema-validation-exhausted')).toBe(true)
    expect(result.diagnostics.filter(item => item.code === 'post-process-issue:lost-section').every(item => item.type === 'error')).toBe(true)
    for (let index = 1; index < callAi.mock.calls.length; index += 1) {
      const systemPrompt = callAi.mock.calls[index]![0].messages[0]?.content || ''
      expect(systemPrompt).toContain('缺少核心章节')
      expect(systemPrompt).toContain('【结构化重试反馈】')
      expect(systemPrompt).not.toContain('<<<上一版候选输出开始>>>')
    }
  })

  it('retains the best failed candidate after retries are exhausted', async () => {
    const outputs = [
      '正文',
      '正文正文正文正文正文正文'
    ]
    let callIndex = 0
    const callAi = vi.fn(async (_params: CallAiParams) => ({
      text: outputs[Math.min(callIndex++, outputs.length - 1)] ?? '{}'
    }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        script: `module.exports = { postProcess({ output }) { return { output, valid: false, issues: [{ code: 'body-too-short', severity: 'blocking', message: '正文过短' }] } } }`,
        resources: []
      }),
      error: null,
      folderPackageCache: false
    })
    const composed: FinalStepFeedbackResult[] = []

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget(),
      validateOutputSchema: false
    })

    expect(callAi).toHaveBeenCalledTimes(3)
    expect(result.status).toBe('failed')
    expect(result.blockingGateFailed).toBe(true)
    expect(result.output).toBe(outputs[0])
    expect(result.diagnostics.some(item =>
      item.code === 'schema-validation-best-candidate-retained' &&
      item.message.includes('第 1/3 次候选')
    )).toBe(true)
  })

  it('retains the candidate closest to the protected body contract when errors tie', async () => {
    const outputs = [
      '正文'.repeat(1000),
      '正文'.repeat(1300),
      '正文'.repeat(1400)
    ]
    let callIndex = 0
    const callAi = vi.fn(async (_params: CallAiParams) => ({
      text: outputs[Math.min(callIndex++, outputs.length - 1)] ?? outputs[outputs.length - 1]
    }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        script: `module.exports = { postProcess({ output }) { return { output, valid: false, issues: [{ code: 'body-too-short', severity: 'blocking', message: '正文过短' }] } } }`,
        resources: []
      }),
      error: null,
      folderPackageCache: false
    })
    const composed: FinalStepFeedbackResult[] = []

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget(),
      protectedContract: {
        kind: 'body',
        targetWords: 3500
      }
    })

    expect(result.status).toBe('failed')
    expect(result.blockingGateFailed).toBe(true)
    expect(result.output).toBe(outputs[2])
    expect(result.apiMeta?.retainedCandidateIndex).toBe(3)
    expect(result.apiMeta?.bodyCandidateLedger).toEqual([
      { attempt: 1, rawChars: 2000, netWords: 2000, handoffCount: 0, contractDistance: 800, missingHandoff: true, valid: false, errorCount: 2 },
      { attempt: 2, rawChars: 2600, netWords: 2600, handoffCount: 0, contractDistance: 200, missingHandoff: true, valid: false, errorCount: 2 },
      { attempt: 3, rawChars: 2800, netWords: 2800, handoffCount: 0, contractDistance: 0, missingHandoff: true, valid: false, errorCount: 1 }
    ])
    expect(result.apiMeta?.bodyCandidateRetention).toEqual({
      retainedCandidateIndex: 3,
      retainedAttempt: 3,
      retainedReason: 'missing-handoff|net-words:2800|contract-distance:0|errors:1'
    })
    expect(result.diagnostics.some(item =>
      item.code === 'schema-validation-best-candidate-retained' &&
      item.message.includes('第 3/3 次候选') &&
      item.message.includes('净字数 2800') &&
      item.message.includes('距离正文下限 0')
    )).toBe(true)
  })

  it('records per-attempt candidate audits for non-body folder skills', async () => {
    const outputs = [
      '骨架一',
      '骨架二'
    ]
    let callIndex = 0
    const callAi = vi.fn(async (_params: CallAiParams) => ({
      text: outputs[Math.min(callIndex++, outputs.length - 1)] ?? outputs[outputs.length - 1]
    }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        script: `module.exports = { postProcess({ output }) { return { output, valid: false, issues: [{ code: 's1-narrative-invalid', severity: 'blocking', message: '场景一未推进' }] } } }`,
        resources: []
      }),
      error: null,
      folderPackageCache: false
    })

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget()
    })

    expect(result.status).toBe('failed')
    expect(result.blockingGateFailed).toBe(true)
    expect(result.output).toBe(outputs[0])
    expect(result.apiMeta?.candidateLedger).toHaveLength(3)
    expect(result.apiMeta?.candidateLedger?.map(item => ({
      passIndex: item.passIndex,
      attempt: item.attempt,
      valid: item.valid,
      errorCount: item.errorCount,
      errors: item.errors,
      postProcessIssueCodes: item.postProcessIssueCodes,
      retained: item.retained
    }))).toEqual([
      { passIndex: 0, attempt: 1, valid: false, errorCount: 1, errors: ['场景一未推进'], postProcessIssueCodes: ['s1-narrative-invalid'], retained: true },
      { passIndex: 0, attempt: 2, valid: false, errorCount: 1, errors: ['场景一未推进'], postProcessIssueCodes: ['s1-narrative-invalid'], retained: false },
      { passIndex: 0, attempt: 3, valid: false, errorCount: 1, errors: ['场景一未推进'], postProcessIssueCodes: ['s1-narrative-invalid'], retained: false }
    ])
    const fnv1a32 = (text: string) => {
      let hash = 0x811c9dc5
      for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193)
      }
      return `fnv1a32_${(hash >>> 0).toString(16).padStart(8, '0')}`
    }
    expect(result.apiMeta?.candidateLedger?.[0]?.sourceResponseHash).toBe(fnv1a32('骨架一'))
    expect(result.apiMeta?.candidateLedger?.[0]?.rawChars).toBe(3)
    expect(result.apiMeta?.candidateLedger?.[0]?.output).toBe('骨架一')
  })

  it('prioritizes a complete handoff over a lower error count for the protected body contract', async () => {
    const outputs = [
      '正文'.repeat(1391) + '\n【正文交接】\n章节：第1章\nFACT_LOCK：示例事实',
      '正文'.repeat(1486),
      '正文'.repeat(1486)
    ]
    let callIndex = 0
    const callAi = vi.fn(async (_params: CallAiParams) => ({
      text: outputs[Math.min(callIndex++, outputs.length - 1)] ?? outputs[outputs.length - 1]
    }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        script: `module.exports = { postProcess({ output }) { const issues = output.includes('【正文交接】') ? [{ code: 'issue-a', severity: 'blocking', message: '失败一' }, { code: 'issue-b', severity: 'blocking', message: '失败二' }] : [{ code: 'protected-body-contract', severity: 'blocking', message: '正文过短' }]; return { output, valid: false, issues } } }`,
        resources: []
      }),
      error: null,
      folderPackageCache: false
    })

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget(),
      protectedContract: {
        kind: 'body',
        targetWords: 3500
      }
    })

    expect(result.status).toBe('failed')
    expect(result.blockingGateFailed).toBe(true)
    expect(result.output).toBe(outputs[0])
    expect(result.apiMeta?.retainedCandidateIndex).toBe(1)
    expect(result.apiMeta?.bodyCandidateLedger).toEqual([
      { attempt: 1, rawChars: 2811, netWords: 2782, handoffCount: 1, contractDistance: 18, missingHandoff: false, valid: false, errorCount: 3 },
      { attempt: 2, rawChars: 2972, netWords: 2972, handoffCount: 0, contractDistance: 0, missingHandoff: true, valid: false, errorCount: 1 },
      { attempt: 3, rawChars: 2972, netWords: 2972, handoffCount: 0, contractDistance: 0, missingHandoff: true, valid: false, errorCount: 1 }
    ])
    expect(result.apiMeta?.bodyCandidateRetention).toEqual({
      retainedCandidateIndex: 1,
      retainedAttempt: 1,
      retainedReason: 'net-words:2782|contract-distance:18|errors:3'
    })
    expect(result.diagnostics.some(item =>
      item.code === 'schema-validation-best-candidate-retained' &&
      item.message.includes('第 1/3 次候选')
    )).toBe(true)
  })

  it('injects the protected body contract after folder preProcess and blocks a missing contract before the API call', async () => {
    const contract = '请生成本章节正文，目标约3500字（不低于2800字，不超过7000字）。正文本体后必须追加【正文交接】区块。'
    const callAi = vi.fn(async () => ({ text: '正'.repeat(3000) }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        script: `module.exports = { preProcess(input) { return { input: input.split('\\n\\n【受保护契约】')[0] } } }`,
        resources: [],
        meta: { executionMode: 'plain' }
      }),
      error: null,
      folderPackageCache: false
    })
    const composed: FinalStepFeedbackResult[] = []

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: `原文\n\n【受保护契约】\n${contract}`,
      budget: createBudget(),
      protectedContract: {
        kind: 'body',
        targetWords: 3500
      }
    })

    expect(callAi).toHaveBeenCalledTimes(1)
    const request = callAi.mock.calls.at(0)?.at(0) as CallAiParams | undefined
    const userPrompt = request?.messages.find((message: { role: string }) => message.role === 'user')?.content || ''
    expect(userPrompt).toContain(contract)
    expect(userPrompt.indexOf(contract)).toBeGreaterThan(userPrompt.lastIndexOf('【受保护契约】'))
    expect(result.status).toBe('success')
    expect(result.diagnostics.some(item => item.code === 'script-hook-exception')).toBe(false)
  })

  it('enforces the protected body contract when folder postProcess reports valid but the body is too short', async () => {
    const outputs = [
      '正'.repeat(2000),
      `${'正'.repeat(3000)}\n\n【正文交接】\nFACT_LOCK：王芳=话痨\n【正文交接结束】`
    ]
    let callIndex = 0
    const callAi = vi.fn(async (_params: CallAiParams) => ({
      text: outputs[Math.min(callIndex++, outputs.length - 1)] ?? outputs.at(-1)
    }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        script: `module.exports = { postProcess({ output }) { return { output, valid: true, issues: [] } } }`,
        resources: []
      }),
      error: null,
      folderPackageCache: false
    })
    const composed: FinalStepFeedbackResult[] = []

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      chainUpstreamContext: [
        '[上一章事实]',
        '第12章《王芳入局》',
        '王芳拿到账册；林越确认旧案时间。',
        '',
        '【场景1：酒馆问线】',
        'POV：林越；行动：追问王芳→核对时间。',
        'FACT_LOCK：王芳=话痨；账册=旧案关键物'
      ].join('\n'),
      budget: createBudget(),
      protectedContract: {
        kind: 'body',
        targetWords: 3500
      }
    })

    expect(callAi).toHaveBeenCalledTimes(2)
    expect(result.status).toBe('success')
    expect(result.output).toBe(outputs[1])
    expect(result.errors).toEqual(['第 1/3 次输出未通过 postProcess 校验：正文过短：2000字，要求不低于2800字'])
    expect(result.diagnostics.some(item =>
      item.code === 'post-process-issue:protected-body-contract' &&
      item.type === 'error' &&
      item.message.includes('正文过短：2000字')
    )).toBe(true)
    const retrySystemPrompt = callAi.mock.calls[1]?.[0].messages[0]?.content || ''
    expect(retrySystemPrompt).toContain('【结构化重试反馈】')
    expect(retrySystemPrompt).toContain('上一版候选正文中没有出现【正文交接】标记')
    expect(retrySystemPrompt).toContain('FACT_LOCK：王芳=话痨')
    expect(retrySystemPrompt).toContain('基于 FACT_LOCK 与上游事实链重建【正文交接】账本')
    expect(retrySystemPrompt).toContain('正文过短：2000字，要求不低于2800字')
    expect(retrySystemPrompt).not.toContain('当前净字数：2000')
    expect(retrySystemPrompt).not.toContain('按原始任务输入重建正文')
  })

  it('accepts advisory postProcess warnings without downgrading a valid output', async () => {
    const callAi = vi.fn(async () => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        script: `module.exports = { postProcess({ output }) { return { output, valid: true, issues: [], warnings: ['文风建议：保留事实，仅轻微调整节奏'] } } }`,
        resources: []
      }),
      error: null,
      folderPackageCache: false
    })

    const result = await executeRealSkill({ folderPath: 'D:/skill', input: '原文', budget: createBudget() })

    expect(result.status).toBe('success')
    expect(result.postProcessReport).toMatchObject({
      applied: true,
      changedOutput: false,
      output: '输出',
      issues: []
    })
    expect(result.diagnostics.some(item => item.type === 'warning' && item.code.startsWith('post-process'))).toBe(false)
  })

  it('passes postProcess usage through and retains only a valid advisory perf observation', async () => {
    const callAi = vi.fn(async () => ({
      text: '输出',
      usage: { inputTokens: 100, outputTokens: 10, reasoningOutputTokens: 8 }
    }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        script: `module.exports = { postProcess(payload) { const { output, usage } = payload; const ratio = usage?.reasoningOutputTokens / usage?.outputTokens; return { output, valid: true, issues: [], _perf: ratio > 0.7 ? { warning: 'reasoning-output-ratio-high', ratio: 0.8, blocking: false } : undefined } } }`,
        resources: []
      }),
      error: null,
      folderPackageCache: false
    })

    const result = await executeRealSkill({ folderPath: 'D:/skill', input: '原文', budget: createBudget() })

    expect(result.status).toBe('success')
    expect(result.postProcessReport?.perf).toEqual({
      warning: 'reasoning-output-ratio-high',
      ratio: 0.8,
      blocking: false
    })
    expect(result.postProcessReport?.issues).toEqual([])
  })

  it('drops malformed postProcess perf observations without affecting the output', async () => {
    const callAi = vi.fn(async () => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        script: `module.exports = { postProcess({ output }) { return { output, valid: true, issues: [], _perf: { warning: '', ratio: Number.NaN, blocking: true } } } }`,
        resources: []
      }),
      error: null,
      folderPackageCache: false
    })

    const result = await executeRealSkill({ folderPath: 'D:/skill', input: '原文', budget: createBudget() })

    expect(result.status).toBe('success')
    expect(result.postProcessReport?.perf).toBeUndefined()
    expect(result.postProcessReport?.issues).toEqual([])
  })

  it('downgrades structural postProcess warnings but keeps prose taste warnings successful', async () => {
    const callAi = vi.fn(async () => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        script: `module.exports = { postProcess({ output }) { return { output, valid: true, issues: [
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
    expect(result.blockingGateFailed).toBe(false)
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
    const composed: FinalStepFeedbackResult[] = []

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

  it('sanitizes legacy execution protocol semantics from the folder package system prompt', async () => {
    const callAi = vi.fn(async () => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        body: [
          '领域能力：卷纲钩子必须服务悬念张力。',
          '### 修改预览',
          '### 批准写回',
          '### 写入未执行',
          'status: pending',
          'await_user: true',
        ].join('\n'),
        resources: []
      }),
      error: null,
      folderPackageCache: false
    })

    const result = await executeRealSkill({ folderPath: 'D:/skill', input: '原文', budget: createBudget() })

    expect(result.status).toBe('success')
    const params = (callAi.mock.calls[0] as unknown as Array<CallAiParams>)[0]
    const systemPrompt = String(params.messages[0]?.content || '')
    expect(systemPrompt).toContain('领域能力：卷纲钩子必须服务悬念张力。')
    expect(systemPrompt).toContain('执行协议、工具权限、写入方式以应用系统提示为准')
    expect(systemPrompt).not.toContain('修改预览')
    expect(systemPrompt).not.toContain('批准写回')
    expect(systemPrompt).not.toContain('写入未执行')
    expect(systemPrompt).not.toContain('status: pending')
    expect(systemPrompt).not.toContain('await_user')
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
    expect(result.blockingGateFailed).toBe(false)
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
    const composed: FinalStepFeedbackResult[] = []

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
    const composed: FinalStepFeedbackResult[] = []

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
    const composed: FinalStepFeedbackResult[] = []

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
    const composed: FinalStepFeedbackResult[] = []

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

  it('blocks execution when template placeholders are not provided', async () => {
    const callAi = vi.fn(async () => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({ template: '标题：{{chapterTitle}}；缺失：{{missingVar}}' }),
      error: null,
      folderPackageCache: false
    })

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget(),
      templateVariables: { chapterTitle: '第一章' }
    })

    expect(result.status).toBe('failed')
    expect(result.output).toBe('')
    expect(result.errors[0]).toContain('未解析占位符')
    expect(result.diagnostics.some(item =>
      item.type === 'error' &&
      item.code === 'template-placeholder-unresolved' &&
      item.message.includes('missingVar')
    )).toBe(true)
    expect(callAi).not.toHaveBeenCalled()
  })

  it('treats placeholders inside markdown code as documentation literals', async () => {
    const callAi = vi.fn(async () => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        template: [
          '标题：{{chapterTitle}}',
          '',
          '文档说明：输入变量未替换（保留 `{{xxx}}` 占位符原文）时…',
          '',
          '```',
          '变量格式：{{yyy}}',
          '```'
        ].join('\n')
      }),
      error: null,
      folderPackageCache: false
    })

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget(),
      templateVariables: { chapterTitle: '第一章' }
    })

    expect(result.status).toBe('success')
    expect(result.diagnostics.some(item => item.code === 'template-placeholder-unresolved')).toBe(false)
    const params = (callAi.mock.calls[0] as unknown as Array<CallAiParams>)[0]
    const systemPrompt = params.messages.find(message => message.role === 'system')?.content || ''
    expect(systemPrompt).toContain('标题：第一章')
    expect(systemPrompt).toContain('保留 `{{xxx}}` 占位符原文')
    expect(systemPrompt).toContain('变量格式：{{yyy}}')
  })

  it('blocks execution when no template variables are provided at all', async () => {
    const callAi = vi.fn(async () => ({ text: '输出' }))
    getAiServiceMock.mockResolvedValueOnce({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({ template: '章节：{{chapterTitle}}' }),
      error: null,
      folderPackageCache: false
    })

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget()
    })

    expect(result.status).toBe('failed')
    expect(result.output).toBe('')
    expect(result.errors[0]).toContain('未解析占位符')
    expect(result.diagnostics.some(item =>
      item.type === 'error' &&
      item.code === 'template-placeholder-unresolved' &&
      item.message.includes('chapterTitle')
    )).toBe(true)
    expect(callAi).not.toHaveBeenCalled()
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
    const composed: FinalStepFeedbackResult[] = []

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

    expect(result.status).toBe('success')
    expect(result.output).toBe('结构化后输出')
    expect(result.diagnostics.some(item => item.code === 'hook-field-ignored' && item.type === 'info' && item.message.includes('ignored'))).toBe(true)
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

  it('captures the real request caliber for every pass and schema retry', async () => {
    const callAi = vi.fn(async (_params: CallAiParams) => {
      if (callAi.mock.calls.length === 1) return { text: '{"wrong": true}' }
      if (callAi.mock.calls.length === 2) return { text: JSON.stringify({ output: '第一步输出' }) }
      return { text: JSON.stringify({ output: '第二步输出' }) }
    })
    getAiServiceMock.mockResolvedValue({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        meta: {
          executionMode: 'multi-pass',
          passes: [
            { name: '第一步' },
            { name: '第二步', input: 'previous' }
          ]
        },
        schema: {
          type: 'object',
          required: ['output'],
          properties: { output: { type: 'string' } }
        }
      }),
      error: null,
      folderPackageCache: false
    })
    const onRequestBuilt = vi.fn()
    const observedEvents: CustomEvent[] = []
    const originalDispatchEvent = window.dispatchEvent
    window.dispatchEvent = vi.fn((event: Event) => {
      if (event instanceof CustomEvent) observedEvents.push(event)
      return true
    })

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget(),
      onRequestBuilt
    })
    window.dispatchEvent = originalDispatchEvent

    expect(result.status).toBe('success')
    expect(callAi).toHaveBeenCalledTimes(3)
    expect(onRequestBuilt).toHaveBeenCalledTimes(3)
    expect(result.apiMeta?.attemptRequestMessages).toHaveLength(3)
    const firstPass = result.apiMeta?.attemptRequestMessages?.[0]
    expect(firstPass).toMatchObject({ passIndex: 0, attempt: 1 })
    expect(firstPass?.messages[1]?.content).toContain('原文')
    const schemaRetry = result.apiMeta?.attemptRequestMessages?.[1]
    expect(schemaRetry).toMatchObject({ passIndex: 0, attempt: 2 })
    expect(schemaRetry?.messages[0]?.content).toContain('【结构化重试反馈】')
    const secondPass = result.apiMeta?.attemptRequestMessages?.[2]
    expect(secondPass).toMatchObject({ passIndex: 1, attempt: 1 })
    expect(secondPass?.messages[1]?.content).toContain('第一步输出')
    expect(result.apiMeta?.requestMessages).toEqual(secondPass?.messages)

    const passInputEvents = observedEvents.filter(event => event.type === 'real-skill:folder-pass-input')
    expect(passInputEvents).toHaveLength(3)
    expect(passInputEvents.map(event => event.detail)).toEqual([
      expect.objectContaining({ passIndex: 0, inputMode: 'original', isRetry: false }),
      expect.objectContaining({ passIndex: 0, inputMode: 'original', isRetry: true }),
      expect.objectContaining({ passIndex: 1, inputMode: 'previous', isRetry: false })
    ])
    const secondPassMeasurement = passInputEvents[2]!.detail as {
      userPromptLength: number
      inputLength: number
    }
    expect(secondPassMeasurement.inputLength).toBeGreaterThan('第一步输出'.length)
    expect(secondPassMeasurement.userPromptLength).toBeGreaterThan(0)

    expect(callAi.mock.calls[0]![0]).toMatchObject({ physicalPhase: 'normal' })
    expect(callAi.mock.calls[1]![0]).toMatchObject({ physicalPhase: 'schema_retry' })
    expect(callAi.mock.calls[2]![0]).toMatchObject({ physicalPhase: 'normal' })
  })

  it('retries schema validation up to three attempts and keeps schema exhaustion degraded', async () => {
    const callAi = vi.fn(async (_params: CallAiParams) => ({ text: '{"wrong": true}' }))
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
    expect(result.blockingGateFailed).toBe(false)
    expect(callAi).toHaveBeenCalledTimes(3)
    expect(result.errors.length).toBeGreaterThanOrEqual(4)
  })

  it('injects the previous validation errors into schema retry requests', async () => {
    const callAi = vi.fn(async (_params: CallAiParams) => ({
      text: callAi.mock.calls.length === 1 ? '{"wrong": true}' : JSON.stringify({ output: '修复后的输出' })
    }))
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

    expect(result.status).toBe('success')
    expect(result.output).toBe(JSON.stringify({ output: '修复后的输出' }))
    expect(callAi).toHaveBeenCalledTimes(2)
    const retrySystemPrompt = callAi.mock.calls[1]![0].messages[0]?.content || ''
    expect(retrySystemPrompt).toContain('【结构化重试反馈】')
    expect(retrySystemPrompt).toContain('$.output 缺少必填字段')
    expect(retrySystemPrompt).toContain('候选输出定位锚点')
    expect(retrySystemPrompt).not.toContain('<<<上一版候选输出开始>>>')
    expect(retrySystemPrompt).toContain('{"wrong": true}')
    expect(retrySystemPrompt).toContain('完整全文已抑制')
  })

  it('keeps validation feedback on every schema retry attempt', async () => {
    const callAi = vi.fn(async (_params: CallAiParams) => ({ text: '{"wrong": true}' }))
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
    expect(result.blockingGateFailed).toBe(false)
    expect(callAi).toHaveBeenCalledTimes(3)
    for (let index = 1; index < callAi.mock.calls.length; index += 1) {
      const systemPrompt = callAi.mock.calls[index]![0].messages[0]?.content || ''
      expect(systemPrompt).toContain('【结构化重试反馈】')
      expect(systemPrompt).toContain('$.output 缺少必填字段')
      expect(systemPrompt).not.toContain('<<<上一版候选输出开始>>>')
      expect(systemPrompt).toContain('{"wrong": true}')
      expect(systemPrompt).toContain('候选输出有界摘要')
    }
  })

  it('retries the final chain step with upstream anchors instead of the failed candidate', async () => {
    const candidateOutput = JSON.stringify({
      output: '终步候选全文',
      metadata: { 来源覆盖状态: '无法核对' }
    })
    const callAi = vi.fn(async (_params: CallAiParams) => ({
      text: callAi.mock.calls.length === 1 ? candidateOutput : JSON.stringify({ output: '修复后的终稿' })
    }))
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
    const composed: FinalStepFeedbackResult[] = []

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '上游原文',
      budget: createBudget(),
      finalStepRetry: {
        role: 'polish',
        upstreamAnchors: ['S2 权威事实锚点'],
      },
      onFinalStepFeedbackComposed: feedback => composed.push(feedback)
    })

    expect(result.status).toBe('success')
    expect(callAi).toHaveBeenCalledTimes(2)
    expect(composed).toHaveLength(1)
    expect(composed[0]!.kind).toBe('retry')
    const retrySystemPrompt = callAi.mock.calls[1]![0].messages[0]?.content || ''
    expect(retrySystemPrompt).toContain('终步重试协议')
    expect(retrySystemPrompt).toContain('FACT_LOCK')
    expect(retrySystemPrompt).toContain('S2 权威事实锚点')
    expect(retrySystemPrompt).toContain('上一步完整输出')
    expect(retrySystemPrompt).not.toContain('<<<上一版候选输出开始>>>')
    expect(retrySystemPrompt).not.toContain(candidateOutput)
    expect(retrySystemPrompt).not.toContain('必须以它为基底')
    expect(retrySystemPrompt).not.toContain('保留其余内容')
  })

  it('keeps finalStepDetection off free of app-owned DEAI findings', async () => {
    const candidateOutput = JSON.stringify({
      output: '终步候选全文',
      metadata: { 来源覆盖状态: '无法核对' }
    })
    const callAi = vi.fn(async (_params: CallAiParams) => ({
      text: callAi.mock.calls.length === 1 ? candidateOutput : JSON.stringify({ output: '修复后的终稿' })
    }))
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

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '上游原文',
      budget: createBudget(),
      finalStepRetry: {
        role: 'polish',
        deaiDetection: 'off',
        upstreamAnchors: ['S2 权威事实锚点'],
      }
    })

    expect(result.status).toBe('success')
    expect(callAi).toHaveBeenCalledTimes(2)
    const retrySystemPrompt = callAi.mock.calls[1]![0].messages[0]?.content || ''
    expect(retrySystemPrompt).toContain('终步重试协议')
    expect(retrySystemPrompt).toContain('FACT_LOCK')
    expect(retrySystemPrompt).toContain('S2 权威事实锚点')
    expect(retrySystemPrompt).not.toContain('三、降AI语言打磨项')
  })

  it('composes app-owned DEAI teaching feedback on a valid normal final step', async () => {
    const fragments: string[] = []
    for (let index = 0; index < 30; index += 1) {
      fragments.push(`他忽然停住，肩膀绷紧，呼吸停滞，瞳孔收缩，${index + 1}。`)
    }
    const candidateOutput = fragments.join('')
    const callAi = vi.fn(async (_params: CallAiParams) => ({ text: candidateOutput }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage(),
      error: null,
      folderPackageCache: false
    })
    const composed: FinalStepFeedbackResult[] = []

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '上游原文',
      budget: createBudget(),
      finalStepRetry: {
        role: 'polish',
        deaiDetection: 'on'
      },
      onFinalStepFeedbackComposed: feedback => composed.push(feedback)
    })

    expect(result.status).toBe('success')
    expect(result.errors).toEqual([])
    expect(callAi).toHaveBeenCalledTimes(1)
    expect(composed).toHaveLength(1)
    expect(composed[0]!.kind).toBe('teaching')
    expect(composed[0]!.sourceCounts.deai).toBeGreaterThan(0)
    expect(composed[0]!.feedback).toContain('三、降AI语言打磨项')
    expect(result.diagnostics.some(item => item.code === 'quality_gate_degraded')).toBe(false)
  })

  it('keeps a valid normal final step free of app-owned DEAI teaching feedback when detection is off', async () => {
    const fragments: string[] = []
    for (let index = 0; index < 30; index += 1) {
      fragments.push(`他忽然停住，肩膀绷紧，呼吸停滞，瞳孔收缩，${index + 1}。`)
    }
    const candidateOutput = fragments.join('')
    const callAi = vi.fn(async (_params: CallAiParams) => ({ text: candidateOutput }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage(),
      error: null,
      folderPackageCache: false
    })
    const composed: FinalStepFeedbackResult[] = []

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '上游原文',
      budget: createBudget(),
      finalStepRetry: {
        role: 'polish',
        deaiDetection: 'off'
      },
      onFinalStepFeedbackComposed: feedback => composed.push(feedback)
    })

    expect(result.status).toBe('success')
    expect(result.errors).toEqual([])
    expect(callAi).toHaveBeenCalledTimes(1)
    expect(composed).toHaveLength(0)
    expect(result.diagnostics.some(item => item.code === 'quality_gate_degraded')).toBe(false)
  })

  it('keeps the normal retry protocol for non-final chain steps', async () => {
    const candidateOutput = JSON.stringify({ wrong: true })
    const callAi = vi.fn(async (_params: CallAiParams) => ({
      text: callAi.mock.calls.length === 1 ? candidateOutput : JSON.stringify({ output: '修复后的中间步' })
    }))
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

    const result = await executeRealSkill({
      folderPath: 'D:/skill',
      input: '原文',
      budget: createBudget(),
      finalStepRetry: { role: 'generator' }
    })

    expect(result.status).toBe('success')
    const retrySystemPrompt = callAi.mock.calls[1]![0].messages[0]?.content || ''
    expect(retrySystemPrompt).toContain('【结构化重试反馈】')
    expect(retrySystemPrompt).toContain(candidateOutput)
    expect(retrySystemPrompt).not.toContain('<<<上一版候选输出开始>>>')
    expect(retrySystemPrompt).not.toContain('终步重试协议')
  })

  it('injects the previous candidate into postProcess validation retries', async () => {
    const callAi = vi.fn(async (_params: CallAiParams) => ({
      text: callAi.mock.calls.length === 1 ? '{"wrong": true}' : '{"output": "修复后的输出"}'
    }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)
    loadRealSkillMock.mockResolvedValueOnce({
      package: createPackage({
        script: `module.exports = { postProcess({ output }) { if (output.includes('wrong')) return { output, valid: false, errors: ['缺少 output 字段'] }; return { output, valid: true } } }`
      }),
      error: null,
      folderPackageCache: false
    })

    const result = await executeRealSkill({ folderPath: 'D:/skill', input: '原文', budget: createBudget() })

    expect(result.status).toBe('success')
    expect(result.output).toBe('{"output": "修复后的输出"}')
    expect(callAi).toHaveBeenCalledTimes(2)
    const retrySystemPrompt = callAi.mock.calls[1]![0].messages[0]?.content || ''
    expect(retrySystemPrompt).toContain('缺少 output 字段')
    expect(retrySystemPrompt).toContain('【结构化重试反馈】')
    expect(retrySystemPrompt).toContain('{"wrong": true}')
    expect(retrySystemPrompt).not.toContain('<<<上一版候选输出开始>>>')
    expect(retrySystemPrompt).not.toContain('请基于上一版候选输出修正上述错误')
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
    expect(result.blockingGateFailed).toBe(false)
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
