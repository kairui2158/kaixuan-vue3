import { describe, expect, it, vi } from 'vitest'
import {
  previewFolderSkill,
  refreshFolderSkillPlan,
  previewFolderSkillBatch,
  refreshFolderSkillBatchPlan,
  summarizeFolderSkillBatch
} from './folderSkillBatchImport'

function bridgeWith(folders: Array<any>, loadedByPath: Record<string, any>) {
  return {
    skillListFolders: vi.fn(async () => ({ ok: true, folders })),
    skillLoadFolder: vi.fn(async (folderPath: string) => loadedByPath[folderPath])
  }
}

describe('folderSkillBatchImport', () => {
  it('previews a single folder skill with a normalized id and conflict state', async () => {
    const bridge = {
      skillListFolders: vi.fn(),
      skillLoadFolder: vi.fn(async () => ({
        ok: true,
        folderPath: 'D:/skills/kaixuan-s1',
        skill: { id: 'KAI-S1', name: '骨架师', template: '模板' }
      }))
    }

    const result = await previewFolderSkill('D:/skills/kaixuan-s1', ['folder:KAI-S1'], bridge)

    expect(result.ok).toBe(true)
    expect(result.item).toMatchObject({
      folderName: 'kaixuan-s1',
      folderPath: 'D:/skills/kaixuan-s1',
      id: 'folder:KAI-S1',
      name: '骨架师',
      valid: true,
      exists: true,
      action: 'skip'
    })
  })

  it('keeps coexisting text skills from triggering a folder import conflict', async () => {
    const bridge = {
      skillListFolders: vi.fn(),
      skillLoadFolder: vi.fn(async () => ({
        ok: true,
        folderPath: 'D:/skills/kaixuan-s1',
        skill: { id: 'KAI-S1', name: '骨架师', template: '模板' }
      }))
    }

    const result = await previewFolderSkill('D:/skills/kaixuan-s1', ['KAI-S1'], bridge)

    expect(result.ok).toBe(true)
    expect(result.item).toMatchObject({ id: 'folder:KAI-S1', exists: false, action: 'add' })
  })

  it('updates a single folder import plan when the duplicate strategy changes', () => {
    const item = { id: 'folder:KAI-S1', exists: true, valid: true, action: 'skip' } as any

    expect(refreshFolderSkillPlan(item, 'overwrite')).toMatchObject({ action: 'overwrite' })
    expect(refreshFolderSkillPlan(item, 'skip')).toMatchObject({ action: 'skip' })
    expect(refreshFolderSkillPlan(null, 'overwrite')).toBeNull()
  })

  it('guides the user back one level when the selected root is a skill folder itself', async () => {
    const bridge = {
      skillListFolders: vi.fn(async () => ({ ok: false, message: '没有可导入的一级子文件夹' })),
      skillLoadFolder: vi.fn(async () => ({
        ok: true,
        folderPath: 'D:/skills/folder-minimal',
        skill: { id: 'folder-minimal', name: '最小技能' }
      }))
    }

    const result = await previewFolderSkillBatch('D:/skills/folder-minimal', [], bridge)

    expect(result.ok).toBe(false)
    expect(result.items).toEqual([])
    expect(result.message).toContain('返回上一级')
    expect(bridge.skillLoadFolder).toHaveBeenCalledWith('D:/skills/folder-minimal')
  })

  it('guides the user back one level even when scanning the skill folder returns an empty list', async () => {
    const bridge = {
      skillListFolders: vi.fn(async () => ({ ok: true, folders: [] })),
      skillLoadFolder: vi.fn(async () => ({
        ok: true,
        folderPath: 'D:/skills/folder-minimal',
        skill: { id: 'folder-minimal', name: '最小技能' }
      }))
    }

    const result = await previewFolderSkillBatch('D:/skills/folder-minimal', [], bridge)

    expect(result.ok).toBe(false)
    expect(result.items).toEqual([])
    expect(result.message).toContain('返回上一级')
    expect(bridge.skillLoadFolder).toHaveBeenCalledWith('D:/skills/folder-minimal')
  })

  it('filters invalid folders and marks valid folders with conflict state', async () => {
    const bridge = bridgeWith(
      [
        { name: 'invalid', folderPath: 'D:/skills/invalid' },
        { name: 'new', folderPath: 'D:/skills/new' },
        { name: 'exists', folderPath: 'D:/skills/exists' }
      ],
      {
        'D:/skills/invalid': { ok: false, message: '缺少 template.md' },
        'D:/skills/new': { ok: true, folderPath: 'D:/skills/new', skill: { id: 'new-skill', name: '新技能', template: '模板' } },
        'D:/skills/exists': { ok: true, folderPath: 'D:/skills/exists', skill: { id: 'old-skill', name: '已有技能', template: '模板' } }
      }
    )

    const result = await previewFolderSkillBatch('D:/skills', ['folder:old-skill'], bridge)

    expect(result.ok).toBe(true)
    expect(result.items.map(item => item.id)).toEqual(['', 'folder:new-skill', 'folder:old-skill'])
    expect(result.items[0]).toMatchObject({ valid: false, action: 'invalid', message: '缺少 template.md' })
    expect(result.items[1]).toMatchObject({ valid: true, exists: false, action: 'add' })
    expect(result.items[2]).toMatchObject({ valid: true, exists: true, action: 'skip' })
    expect(bridge.skillListFolders).toHaveBeenCalledWith('D:/skills')
    expect(bridge.skillLoadFolder).toHaveBeenCalledTimes(3)
  })

  it('treats a text skill with the same source id as coexistence, not conflict', async () => {
    const bridge = bridgeWith(
      [{ name: 'kaixuan-s1', folderPath: 'D:/skills/kaixuan-s1' }],
      {
        'D:/skills/kaixuan-s1': {
          ok: true,
          folderPath: 'D:/skills/kaixuan-s1',
          skill: { id: 'KAI-S1', name: '骨架师', template: '模板' }
        }
      }
    )

    const result = await previewFolderSkillBatch('D:/skills', ['KAI-S1'], bridge)

    expect(result.ok).toBe(true)
    expect(result.items[0]).toMatchObject({
      id: 'folder:KAI-S1',
      valid: true,
      exists: false,
      action: 'add'
    })
  })

  it('updates the plan when the duplicate strategy changes', () => {
    const items = [
      { id: 'a', exists: true, valid: true, action: 'skip' },
      { id: 'b', exists: false, valid: true, action: 'add' },
      { id: '', exists: false, valid: false, action: 'invalid' }
    ] as any[]

    expect(refreshFolderSkillBatchPlan(items, 'overwrite').map(item => item.action)).toEqual(['overwrite', 'add', 'invalid'])
    expect(refreshFolderSkillBatchPlan(items, 'skip').map(item => item.action)).toEqual(['skip', 'add', 'invalid'])
  })

  it('summarizes successful imports without hiding failures', () => {
    const summary = summarizeFolderSkillBatch([
      { status: 'success', message: '新增成功' },
      { status: 'success', message: '已存在并覆盖' },
      { status: 'skipped', message: '已存在，跳过' },
      { status: 'failed', message: '读取失败' }
    ] as any[])

    expect(summary).toEqual({ added: 1, updated: 1, skipped: 1, failed: 1 })
  })
})
