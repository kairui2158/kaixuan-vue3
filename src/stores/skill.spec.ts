import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSkillStore } from './skill'

const storageWrite = vi.fn().mockResolvedValue(true)
const storageRead = vi.fn().mockResolvedValue(null)

function makeSkill(id: string, name = id) {
  return {
    id,
    name,
    template: `template-${id}`,
    category: 'general',
    description: '',
    executionMode: 'chain' as const,
    outputFormat: 'text' as const,
    validationRules: [],
    splitSize: 1000,
  }
}

describe('skill store configuration exchange', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    storageWrite.mockClear()
    storageRead.mockClear()
    vi.stubGlobal('window', {
      electronAPI: { storageWrite, storageRead },
    })
  })

  it('adds new skills and waits for persistence before resolving', async () => {
    const store = useSkillStore()
    let persisted = false
    storageWrite.mockImplementationOnce(async () => {
      await new Promise(resolve => setTimeout(resolve, 5))
      persisted = true
      return true
    })

    const result = await store.importSkills([makeSkill('new-skill')], { strategy: 'skip' })

    expect(result).toEqual({ added: 1, updated: 0, skipped: 0 })
    expect(persisted).toBe(true)
    expect(storageWrite).toHaveBeenCalledTimes(1)
  })

  it('skips duplicate skills without overwriting or writing storage', async () => {
    const store = useSkillStore()
    store.skills.push(makeSkill('same-skill', 'existing'))

    const result = await store.importSkills([makeSkill('same-skill', 'incoming')], { strategy: 'skip' })

    expect(result).toEqual({ added: 0, updated: 0, skipped: 1 })
    expect(store.getSkill('same-skill')?.name).toBe('existing')
    expect(storageWrite).not.toHaveBeenCalled()
  })

  it('overwrites duplicate skills and persists the updated record', async () => {
    const store = useSkillStore()
    store.skills.push(makeSkill('same-skill', 'existing'))

    const result = await store.importSkills([makeSkill('same-skill', 'incoming')], { strategy: 'overwrite' })

    expect(result).toEqual({ added: 0, updated: 1, skipped: 0 })
    expect(store.getSkill('same-skill')?.name).toBe('incoming')
    expect(store.getSkill('same-skill')?.updatedAt).toEqual(expect.any(String))
    expect(storageWrite).toHaveBeenCalledTimes(1)
  })

  it('persists pipeline and de-ai bindings included in the import', async () => {
    const store = useSkillStore()

    const result = await store.importSkills([makeSkill('pipeline-skill'), makeSkill('deai-skill')], {
      strategy: 'skip',
      pipelineSkills: ['pipeline-skill'],
      deAiSkills: ['deai-skill'],
    })

    expect(result.added).toBe(2)
    expect(store.pipelineSkills).toEqual(['pipeline-skill'])
    expect(store.deAiSkills).toEqual(['deai-skill'])
    expect(storageWrite).toHaveBeenCalledWith(
      expect.stringContaining('skills'),
      expect.objectContaining({
        skills: expect.arrayContaining([expect.objectContaining({ id: 'pipeline-skill' })]),
        pipelineSkills: ['pipeline-skill'],
        deAiSkills: ['deai-skill'],
      }),
    )
  })
})
