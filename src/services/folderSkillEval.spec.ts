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

import { parseFolderSkillEvalDefinition, runFolderSkillEval } from './folderSkillEval'
import { loadRealSkill } from './realSkillLoader'

const loadRealSkillMock = vi.mocked(loadRealSkill)
const skillExecuteScriptMock = vi.fn(async () => ({
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

function createPackage(evals: unknown) {
  return {
    id: 'eval-skill',
    name: '评测技能',
    description: '',
    body: '入口说明',
    template: '磁盘模板：处理输入。',
    meta: {},
    script: '',
    samples: '技能样本',
    schema: null,
    evals: evals as Record<string, unknown> | null,
    folderPath: 'D:/skills/eval-skill',
    resources: [{ path: 'references/world.md', content: '世界观资料' }]
  }
}

describe('parseFolderSkillEvalDefinition', () => {
  it('accepts a valid definition', () => {
    const result = parseFolderSkillEvalDefinition({
      schema: 'shenyi.skill-evals/1',
      cases: [{ id: 'case-1', input: '输入', assertions: [{ type: 'min_length', min: 2 }] }]
    })
    expect(result.definition?.cases).toHaveLength(1)
    expect(result.errors).toEqual([])
  })

  it('rejects definitions without executable cases', () => {
    expect(parseFolderSkillEvalDefinition(null).definition).toBeNull()
    expect(parseFolderSkillEvalDefinition({ cases: [] }).errors[0]).toContain('cases')
    expect(parseFolderSkillEvalDefinition({ cases: [{ id: 'case-1' }] }).errors[0]).toContain('input')
    expect(parseFolderSkillEvalDefinition({
      cases: [{ id: 'case-1', input: '输入', assertions: [] }]
    }).errors[0]).toContain('assertions')
  })
})

describe('runFolderSkillEval', () => {
  beforeEach(() => {
    loadRealSkillMock.mockReset()
    skillExecuteScriptMock.mockClear()
  })

  it('runs with/baseline grading and builds the benchmark', async () => {
    loadRealSkillMock.mockResolvedValue({
      package: createPackage({
        schema: 'shenyi.skill-evals/1',
        cases: [
          {
            id: 'case-1',
            input: '请输出世界观',
            assertions: [
              { type: 'min_length', min: 3 },
              { type: 'contains', value: '世界观' },
              { type: 'not_contains', value: '禁止词' },
              { type: 'resource_referenced', value: 'references/world.md' }
            ]
          }
        ]
      }),
      error: null,
      folderPackageCache: false
    })
    const callAi = vi.fn(async (params: any) => ({
      text: params.messages[0].role === 'system' && params.messages[0].content.includes('磁盘模板')
        ? '这是世界观输出'
        : '普通输出'
    }))

    const report = await runFolderSkillEval({
      skillId: 'eval-skill',
      folderPath: 'D:/skills/eval-skill',
      aiService: { callAi }
    })

    expect(report.status).toBe('success')
    expect(report.caseCount).toBe(1)
    expect(report.grading[0].withSkill.output).toBe('这是世界观输出')
    expect(report.grading[0].baseline.output).toBe('普通输出')
    expect(report.grading[0].withSkill.passed).toBe(true)
    expect(report.grading[0].baseline.passed).toBe(false)
    expect(report.grading[0].skillEffect).toBe('improved')
    expect(report.benchmark).toMatchObject({ withPassed: 1, baselinePassed: 0, total: 1, withPassRate: 100 })
    expect(callAi).toHaveBeenCalledTimes(2)
    expect(callAi.mock.calls[1][0].meta).toMatchObject({ source: 'folderSkillEval.baseline', caseId: 'case-1' })
  })

  it('returns no-evals and load-failed without calling AI', async () => {
    loadRealSkillMock
      .mockResolvedValueOnce({ package: createPackage(null), error: null, folderPackageCache: false })
      .mockResolvedValueOnce({ package: null, error: 'folder-not-found', folderPackageCache: false })
    const callAi = vi.fn(async () => ({ text: '不应调用' }))

    const noEvals = await runFolderSkillEval({
      skillId: 'eval-skill',
      folderPath: 'D:/skills/eval-skill',
      aiService: { callAi }
    })
    const loadFailed = await runFolderSkillEval({
      skillId: 'eval-skill',
      folderPath: 'D:/missing',
      aiService: { callAi }
    })

    expect(noEvals.status).toBe('no-evals')
    expect(loadFailed.status).toBe('load-failed')
    expect(callAi).not.toHaveBeenCalled()
  })

  it('reports execution failures as failed cases instead of aborting the benchmark', async () => {
    loadRealSkillMock.mockResolvedValue({
      package: createPackage({
        cases: [{ id: 'case-1', input: '输入', assertions: [{ type: 'min_length', min: 1 }] }]
      }),
      error: null,
      folderPackageCache: false
    })
    const callAi = vi.fn(async () => { throw new Error('API 连接失败') })

    const report = await runFolderSkillEval({
      skillId: 'eval-skill',
      folderPath: 'D:/skills/eval-skill',
      aiService: { callAi }
    })

    expect(report.status).toBe('success')
    expect(report.grading[0].baseline.status).toBe('failed')
    expect(report.grading[0].baseline.status).toBe('failed')
    expect(report.grading[0].skillEffect).toBe('indeterminate')
    expect(report.benchmark).toMatchObject({ withPassed: 0, baselinePassed: 0, indeterminate: 1 })
  })

  it('marks an empty or truncated baseline as a failed case', async () => {
    loadRealSkillMock.mockResolvedValue({
      package: createPackage({
        cases: [{ id: 'case-1', input: '输入', assertions: [{ type: 'min_length', min: 1 }] }]
      }),
      error: null,
      folderPackageCache: false
    })
    const callAi = vi.fn(async () => ({ text: '', finishReason: 'stop', usage: {} }))

    const report = await runFolderSkillEval({
      skillId: 'eval-skill',
      folderPath: 'D:/skills/eval-skill',
      aiService: { callAi }
    })

    expect(report.grading[0].baseline.status).toBe('failed')
    expect(report.grading[0].baseline.errors).toContain('模型没有返回正文')
    expect(report.grading[0].skillEffect).toBe('indeterminate')
  })
})
