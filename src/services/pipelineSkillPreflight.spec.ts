import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./realSkillLoader', () => ({
  loadRealSkill: vi.fn()
}))

import { loadRealSkill } from './realSkillLoader'
import { formatPreflightFailure, preflightFolderSkills } from './pipelineSkillPreflight'

const loadRealSkillMock = vi.mocked(loadRealSkill)

describe('pipelineSkillPreflight', () => {
  beforeEach(() => {
    loadRealSkillMock.mockReset()
  })

  it('passes when every bound folder skill loads', async () => {
    loadRealSkillMock.mockResolvedValue({
      package: { id: 'ok' } as any,
      error: null,
      folderPackageCache: false
    })

    const result = await preflightFolderSkills([
      { id: 's1', name: '骨架师', folderPath: 'D:/skills/s1' }
    ])

    expect(result.ok).toBe(true)
    expect(result.failures).toEqual([])
  })

  it('returns skill identity, path, reason, and repair action for missing folders', async () => {
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

    const result = await preflightFolderSkills([
      { id: 's1', name: '骨架师', folderPath: 'D:/missing' },
      { id: 'text-only' }
    ])

    expect(result.ok).toBe(false)
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]).toMatchObject({
      skillId: 's1',
      skillName: '骨架师',
      code: 'folder-not-found',
      message: 'SKILL 文件夹不存在或不是目录',
      folderPath: 'D:/missing',
      action: '请到技能设置中重新选择该技能的文件夹'
    })
    expect(formatPreflightFailure(result.failures[0])).toContain('D:/missing')
    expect(formatPreflightFailure(result.failures[0])).toContain('骨架师')
  })
})
