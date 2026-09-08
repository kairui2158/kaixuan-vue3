import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSkillStore, type Skill } from './skill'

function textSkill(id = 'KAI-S1'): Skill {
  return {
    id,
    name: `${id} 文本版`,
    format: 'text',
    template: '文本模板',
    category: 'general',
    executionMode: 'chain',
    outputFormat: 'text',
    validationRules: [],
    splitSize: 1000,
  }
}

function folderSkill(id = 'KAI-S1'): Skill {
  return {
    id,
    name: `${id} 文件夹版`,
    format: 'folder',
    sourceId: id,
    folderPath: 'D:/skills/kaixuan-s1',
    template: '文件夹模板',
    category: 'folder',
    executionMode: 'chain',
    outputFormat: 'text',
    validationRules: [],
    splitSize: 1000,
  }
}

describe('skill store format namespace', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('window', {
      electronAPI: {
        storageRead: vi.fn(async () => null),
        storageWrite: vi.fn(async () => undefined),
      },
    })
  })

  it('allows a folder skill to coexist with a text skill using the same source id', async () => {
    const store = useSkillStore()
    await store.importSkills([textSkill()])

    const result = await store.importSkills([folderSkill()])

    expect(result).toEqual({ added: 1, updated: 0, skipped: 0 })
    expect(store.skills.map(skill => skill.id)).toEqual(['KAI-S1', 'folder:KAI-S1'])
    expect(store.getSkill('KAI-S1')?.format).toBe('text')
    expect(store.getSkill('folder:KAI-S1')?.format).toBe('folder')
    expect(store.getSkill('folder:KAI-S1')?.sourceId).toBe('KAI-S1')
  })

  it('normalizes legacy and new folder ids to one namespace', async () => {
    const store = useSkillStore()

    const legacy = await store.importSkills([folderSkill('legacy')])
    const duplicate = await store.importSkills([folderSkill('legacy')])

    expect(legacy).toEqual({ added: 1, updated: 0, skipped: 0 })
    expect(duplicate).toEqual({ added: 0, updated: 0, skipped: 1 })
    expect(store.skills.filter(skill => skill.format === 'folder').map(skill => skill.id)).toEqual(['folder:legacy'])
  })

  it('keeps folder selection references when import configuration uses the source id', async () => {
    const store = useSkillStore()
    await store.importSkills([textSkill('DUAL'), folderSkill('DUAL')])

    await store.importSkills([], { pipelineSkills: ['DUAL'], deAiSkills: ['DUAL'] })

    expect(store.pipelineSkills).toEqual(['DUAL'])
    expect(store.deAiSkills).toEqual(['DUAL'])
  })
})
