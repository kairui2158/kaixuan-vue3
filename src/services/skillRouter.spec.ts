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

  it('falls back to text mode when folder loading fails', async () => {
    loadRealSkillMock.mockResolvedValueOnce({ package: null, error: 'folder-not-found', folderPackageCache: false })

    const result = await routeSkill(
      { id: 'skill', format: 'folder', folderPath: 'D:/missing' },
      { input: '输入', budget: budget() }
    )

    expect(result.mode).toBe('text')
    expect(result.fallbackReason).toBe('folder-not-found')
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
        baseTemplateOverride: 'compose合并模板',
        resolvedTemplate: 'chain解析后模板'
      }
    )

    expect(result.mode).toBe('folder')
    expect(executeRealSkillMock).toHaveBeenCalledWith(expect.objectContaining({
      systemPromptSuffix: '降AI约束',
      baseTemplateOverride: 'compose合并模板',
      resolvedTemplate: 'chain解析后模板'
    }))
  })
})
