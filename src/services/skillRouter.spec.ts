import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./realSkillLoader', () => ({
  loadRealSkill: vi.fn()
}))
vi.mock('./skillOrchestrator', () => ({
  executeCompositeSkill: vi.fn()
}))
vi.mock('./realSkillExecutor', () => ({
  executeRealSkill: vi.fn()
}))

import { routeSkill } from './skillRouter'
import { loadRealSkill } from './realSkillLoader'
import { executeCompositeSkill } from './skillOrchestrator'
import { executeRealSkill } from './realSkillExecutor'

const loadRealSkillMock = vi.mocked(loadRealSkill)
const executeCompositeSkillMock = vi.mocked(executeCompositeSkill)
const executeRealSkillMock = vi.mocked(executeRealSkill)

function compositeResult(status: 'DONE' | 'DONE_WITH_CONCERNS' | 'NEEDS_CONTEXT' | 'BLOCKED') {
  return {
    status,
    output: status === 'BLOCKED' ? '' : '组合输出',
    steps: [],
    diagnostics: [],
    errors: status === 'BLOCKED' ? ['组合阻断'] : [],
    apiMeta: undefined
  }
}

function budget() {
  return { tryConsume: vi.fn(() => ({ status: 'allowed' as const, used: 1, limit: 8 })) }
}

describe('skillRouter composite mapping', () => {
  beforeEach(() => {
    loadRealSkillMock.mockReset()
    executeCompositeSkillMock.mockReset()
  })

  it('maps DONE composite output to success without throwing', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: {
        id: 'parent',
        name: 'parent',
        description: '',
        template: '',
        meta: { executionMode: 'composite' },
        script: '',
        samples: '',
        schema: null,
        folderPath: 'D:/skills/parent'
      } as any,
      error: null,
      folderPackageCache: false
    })
    executeCompositeSkillMock.mockResolvedValueOnce(compositeResult('DONE'))

    const result = await routeSkill(
      { id: 'parent', format: 'folder', folderPath: 'D:/skills/parent' },
      { input: '输入', budget: budget() }
    )

    expect(result.mode).toBe('folder')
    expect(result.folderResult?.status).toBe('success')
    expect(result.folderResult?.output).toBe('组合输出')
    expect(result.compositeResult?.status).toBe('DONE')
  })

  it('keeps DONE_WITH_CONCERNS output as degraded instead of blocking it', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: {
        id: 'parent',
        name: 'parent',
        description: '',
        template: '',
        meta: { executionMode: 'composite' },
        script: '',
        samples: '',
        schema: null,
        folderPath: 'D:/skills/parent'
      } as any,
      error: null,
      folderPackageCache: false
    })
    executeCompositeSkillMock.mockResolvedValueOnce(compositeResult('DONE_WITH_CONCERNS'))

    const result = await routeSkill(
      { id: 'parent', format: 'folder', folderPath: 'D:/skills/parent' },
      { input: '输入', budget: budget() }
    )

    expect(result.mode).toBe('folder')
    expect(result.folderResult?.status).toBe('degraded')
    expect(result.folderResult?.output).toBe('组合输出')
  })

  it('throws with folderResult when composite needs context or is blocked', async () => {
    loadRealSkillMock.mockResolvedValue({
      package: {
        id: 'parent',
        name: 'parent',
        description: '',
        template: '',
        meta: { executionMode: 'composite' },
        script: '',
        samples: '',
        schema: null,
        folderPath: 'D:/skills/parent'
      } as any,
      error: null,
      folderPackageCache: false
    })
    executeCompositeSkillMock.mockResolvedValueOnce(compositeResult('NEEDS_CONTEXT'))

    await expect(routeSkill(
      { id: 'parent', format: 'folder', folderPath: 'D:/skills/parent' },
      { input: '输入', budget: budget() }
    )).rejects.toMatchObject({
      folderResult: { status: 'blocked', output: '' }
    })
  })

  it('throws with folderResult when the density gate returns blocked', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: {
        id: 'folder',
        name: 'folder',
        description: '',
        template: '',
        meta: {},
        script: '',
        samples: '',
        schema: null,
        folderPath: 'D:/skills/folder'
      } as any,
      error: null,
      folderPackageCache: false
    })
    executeRealSkillMock.mockResolvedValueOnce({
      status: 'blocked',
      output: 'NOT-READY：章级事件密度不足，需上游补剧情点',
      errors: ['章级事件密度不足，需上游补剧情点；上游剧情材料不足：请回到章节规划/剧情层补足事件点。'],
      diagnostics: [{
        type: 'error',
        code: 'chapter-event-density-not-ready',
        message: '章级事件密度不足',
        at: '2026-10-31T00:00:00.000Z'
      }],
      folderPackageCache: false
    })

    await expect(routeSkill(
      { id: 'folder', format: 'folder', folderPath: 'D:/skills/folder' },
      { input: '输入', budget: budget() }
    )).rejects.toMatchObject({
      message: '章级事件密度不足，需上游补剧情点；上游剧情材料不足：请回到章节规划/剧情层补足事件点。',
      folderResult: {
        status: 'blocked',
        diagnostics: [{
          code: 'chapter-event-density-not-ready'
        }]
      }
    })
  })

  it('throws with folderResult when a SKILL narrative verdict blocks execution', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: {
        id: 'folder',
        name: 'folder',
        description: '',
        template: '',
        meta: {},
        script: '',
        samples: '',
        schema: null,
        format: 'folder',
        folderPath: 'D:/skills/folder'
      } as any,
      error: null,
      folderPackageCache: false
    })
    executeRealSkillMock.mockResolvedValueOnce({
      status: 'blocked',
      output: 'narrativeStatus: not_ready\nnarrativeReason：全章只有确认与核对，未改变状态',
      errors: ['全章只有确认与核对，未改变状态；SKILL 叙事裁决 NOT_READY：请回到章节规划/剧情层补足事件点，正文层不重试、不改写。'],
      diagnostics: [{
        type: 'error',
        code: 'chapter-narrative-not-ready',
        message: 'SKILL narrative verdict not_ready',
        at: '2026-10-31T00:00:00.000Z'
      }],
      folderPackageCache: false
    })

    await expect(routeSkill(
      { id: 'folder', format: 'folder', folderPath: 'D:/skills/folder' },
      { input: '输入', budget: budget() }
    )).rejects.toMatchObject({
      folderResult: {
        status: 'blocked',
        diagnostics: [{
          code: 'chapter-narrative-not-ready'
        }]
      }
    })
  })

  it('falls back to text mode when folder loading fails', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: null,
      error: 'folder-not-found',
      failure: {
        code: 'folder-not-found',
        message: 'SKILL 文件夹不存在或不是目录',
        folderPath: 'D:/missing',
        action: '请到技能设置中重新选择该技能的文件夹'
      },
      folderPackageCache: false
    })

    const result = await routeSkill(
      { id: 'skill', name: '凯旋正文', format: 'folder', folderPath: 'D:/missing' },
      { input: '输入', budget: budget() }
    )

    expect(result.mode).toBe('text')
    expect(result.fallbackReason).toBe('folder-not-found')
    expect(result.fallback).toMatchObject({
      code: 'folder-not-found',
      message: 'SKILL 文件夹不存在或不是目录',
      folderPath: 'D:/missing',
      skillId: 'skill',
      skillName: '凯旋正文'
    })
  })

  it('passes the pipeline injection fields through to the folder executor', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: {
        id: 'folder',
        name: 'folder',
        description: '',
        template: '模板',
        meta: {},
        script: '',
        samples: '',
        schema: null,
        folderPath: 'D:/skills/folder'
      } as any,
      error: null,
      folderPackageCache: false
    })
    executeRealSkillMock.mockResolvedValueOnce({
      status: 'success',
      output: '输出',
      errors: [],
      diagnostics: [],
      folderPackageCache: false
    })

    const result = await routeSkill(
      { id: 'folder', format: 'folder', folderPath: 'D:/skills/folder' },
      {
        input: '输入',
        budget: budget(),
        systemPromptSuffix: '降AI约束',
        userPromptSuffix: '终步重试协议',
        baseTemplateOverride: 'compose合并模板',
        resolvedTemplate: 'chain解析后模板',
        activeEditTask: { id: 'task-1', status: 'awaiting_batch' } as any,
        protectedContract: { kind: 'body', targetWords: 3500 }
      }
    )

    expect(result.mode).toBe('folder')
    expect(executeRealSkillMock).toHaveBeenCalledWith(expect.objectContaining({
      systemPromptSuffix: '降AI约束',
      userPromptSuffix: '终步重试协议',
      baseTemplateOverride: 'compose合并模板',
      resolvedTemplate: 'chain解析后模板',
      activeEditTask: { id: 'task-1', status: 'awaiting_batch' },
      protectedContract: { kind: 'body', targetWords: 3500 }
    }))
  })

  it('forwards the final-step retry contract to the folder executor', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: {
        id: 'folder',
        name: 'folder',
        description: '',
        template: '模板',
        meta: {},
        script: '',
        samples: '',
        schema: null,
        folderPath: 'D:/skills/folder'
      } as any,
      error: null,
      folderPackageCache: false
    })
    executeRealSkillMock.mockResolvedValueOnce({
      status: 'success',
      output: '输出',
      errors: [],
      diagnostics: [],
      folderPackageCache: false
    })
    const finalStepRetry = {
      role: 'polish' as const,
      deaiDetection: 'on' as const,
      upstreamAnchors: ['S2 权威事实锚点'],
      deaiFindings: []
    }

    const result = await routeSkill(
      { id: 'folder', format: 'folder', folderPath: 'D:/skills/folder' },
      {
        input: '输入',
        budget: budget(),
        finalStepRetry
      }
    )

    expect(result.mode).toBe('folder')
    expect(executeRealSkillMock).toHaveBeenCalledWith(expect.objectContaining({
      finalStepRetry
    }))
  })

  it('forwards the final-step retry contract to the composite executor', async () => {
    loadRealSkillMock.mockResolvedValueOnce({
      package: {
        id: 'parent',
        name: 'parent',
        description: '',
        template: '',
        meta: { executionMode: 'composite' },
        script: '',
        samples: '',
        schema: null,
        folderPath: 'D:/skills/parent'
      } as any,
      error: null,
      folderPackageCache: false
    })
    executeCompositeSkillMock.mockResolvedValueOnce(compositeResult('DONE'))
    const finalStepRetry = {
      role: 'polish' as const,
      deaiDetection: 'on' as const,
      upstreamAnchors: ['S2 权威事实锚点'],
      deaiFindings: []
    }

    const result = await routeSkill(
      { id: 'parent', format: 'folder', folderPath: 'D:/skills/parent' },
      {
        input: '输入',
        budget: budget(),
        finalStepRetry
      }
    )

    expect(result.mode).toBe('folder')
    expect(executeCompositeSkillMock).toHaveBeenCalledWith(expect.objectContaining({
      finalStepRetry
    }))
  })
})

describe('skillRouter pipeline no-tool boundary', () => {
  beforeEach(() => {
    loadRealSkillMock.mockReset()
    executeRealSkillMock.mockReset()
    loadRealSkillMock.mockResolvedValueOnce({
      package: {
        id: 'folder',
        name: 'folder',
        description: '',
        template: '模板',
        meta: {},
        script: '',
        samples: '',
        schema: null,
        folderPath: 'D:/skills/folder'
      } as any,
      error: null,
      folderPackageCache: false
    })
    executeRealSkillMock.mockResolvedValueOnce({
      status: 'success',
      output: '输出',
      errors: [],
      diagnostics: [],
      folderPackageCache: false
    })
  })

  it('does not introduce tools or toolPolicy into pipeline folder execution', async () => {
    await routeSkill(
      { id: 'folder', format: 'folder', folderPath: 'D:/skills/folder' },
      {
        input: '输入',
        budget: budget(),
        purpose: 'generate'
      }
    )

    expect(executeRealSkillMock).toHaveBeenCalledTimes(1)
    const executeOptions = executeRealSkillMock.mock.calls[0][0] as unknown as Record<string, unknown>
    expect(Object.hasOwn(executeOptions, 'tools')).toBe(false)
    expect(Object.hasOwn(executeOptions, 'toolPolicy')).toBe(false)
    expect(Object.hasOwn(executeOptions, 'toolSurface')).toBe(false)
  })

  it('still forwards explicit tool surfaces for dialogue and outline paths', async () => {
    const tools = [{
      name: 'outline.read_range',
      description: '读取大纲范围',
      policy: 'readonly',
      inputSchema: { type: 'object' },
      execute: vi.fn()
    } as any]
    const toolPolicy = { intent: 'edit', maxToolIterations: 8 } as any

    await routeSkill(
      { id: 'folder', format: 'folder', folderPath: 'D:/skills/folder' },
      {
        input: '输入',
        budget: budget(),
        tools,
        toolPolicy
      }
    )

    expect(executeRealSkillMock).toHaveBeenCalledWith(expect.objectContaining({
      tools,
      toolPolicy
    }))
  })
})
