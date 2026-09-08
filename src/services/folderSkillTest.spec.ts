import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./realSkillLoader', () => ({
  loadRealSkill: vi.fn()
}))
vi.mock('./skillOrchestrator', () => ({
  executeCompositeSkill: vi.fn()
}))
vi.mock('./aiService', () => ({
  getAiService: vi.fn()
}))

import { runFolderSkillTest } from './folderSkillTest'
import { loadRealSkill } from './realSkillLoader'

const loadRealSkillMock = vi.mocked(loadRealSkill)
const skillExecuteScriptMock = vi.fn(async (script: string, payload: { hook: string }) => ({
  ok: true,
  availableHooks: [],
  exports: {},
  results: {},
  templateOverride: '',
  logs: []
}))
vi.stubGlobal('electronAPI', { skillExecuteScript: skillExecuteScriptMock })
vi.stubGlobal('window', {
  electronAPI: { skillExecuteScript: skillExecuteScriptMock },
  dispatchEvent: vi.fn()
})

function createPackage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'folder-test',
    name: '文件夹测试技能',
    description: '',
    template: '磁盘模板：处理输入。',
    meta: {},
    script: '',
    samples: '技能样本',
    schema: null,
    folderPath: 'D:/skills/folder-test',
    ...overrides
  }
}

describe('folderSkillTest', () => {
  beforeEach(() => {
    loadRealSkillMock.mockReset()
    skillExecuteScriptMock.mockClear()
  })

  it('runs through the real folder executor and returns disk-template diagnostics', async () => {
    loadRealSkillMock.mockResolvedValue({
      package: createPackage(),
      error: null,
      fromCache: false
    })
    const callAi = vi.fn<(params: any) => Promise<any>>(async () => ({ text: '处理后的输出', reasoning: '' }))

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await runFolderSkillTest({
      skillId: 'folder-test',
      folderPath: 'D:/skills/folder-test',
      input: '测试文本',
      agent: { id: 'agent', systemPrompt: '智能体指令', model: 'test-model', temperature: 0.2, maxTokens: 1234 },
      aiService: { callAi }
    })

    expect(result.status).toBe('success')
    expect(result.output).toBe('处理后的输出')
    expect(result.budget).toEqual({ used: 1, limit: 3, entries: expect.any(Array) })
    expect(result.requestMessages[0]).toMatchObject({ role: 'system' })
    expect(result.requestMessages[0].content).toContain('磁盘模板：处理输入。')
    expect(callAi).toHaveBeenCalledTimes(1)
    const params = callAi.mock.calls[0]?.[0] as any
    expect(params.model).toBe('test-model')
    expect(params.temperature).toBe(0.2)
    expect(params.maxTokens).toBe(1234)
    expect(params.stream).toBe(false)
    consoleErrorSpy.mockRestore()
  })

  it('reports blocked status with the real budget snapshot when the skill-level budget is exhausted', async () => {
    loadRealSkillMock.mockResolvedValue({
      package: createPackage({
        meta: {
          apiCallLimit: 2,
          executionMode: 'multi-pass',
          passes: [
            { name: 'first', input: 'original' },
            { name: 'second', input: 'original' },
            { name: 'third', input: 'original' }
          ]
        }
      }),
      error: null,
      fromCache: false
    })
    const callAi = vi.fn(async () => ({ text: '第一轮输出' }))

    const result = await runFolderSkillTest({
      skillId: 'folder-test',
      folderPath: 'D:/skills/folder-test',
      input: '测试文本',
      aiService: { callAi },
      totalBudget: 3
    })
    expect(result.status).toBe('blocked')
    expect(result.budget).toEqual({ used: 2, limit: 3, entries: expect.any(Array) })
    expect(result.errors[0]).toContain('API 调用预算已耗尽（已用 2/2）')
  })

  it('returns a load-failed result without calling AI when the folder is unavailable', async () => {
    loadRealSkillMock.mockResolvedValueOnce({ package: null, error: 'folder-not-found', fromCache: false })
    const callAi = vi.fn(async () => ({ text: '不应调用' }))

    const result = await runFolderSkillTest({
      skillId: 'folder-test',
      folderPath: 'D:/missing',
      input: '测试文本',
      aiService: { callAi }
    })

    expect(result.status).toBe('load-failed')
    expect(result.errors[0]).toContain('folder-not-found')
    expect(callAi).not.toHaveBeenCalled()
  })
})
