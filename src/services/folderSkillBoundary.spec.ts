import { describe, expect, it } from 'vitest'
import { formatFolderSkillBoundary, getFolderSkillBoundary } from './folderSkillBoundary'

describe('folderSkillBoundary', () => {
  it('describes all six execution modes with consistent capability fields', () => {
    const modes = [
      'chain',
      'compose-single',
      'compose-multi',
      'split-merge',
      'multi-step',
      'composite'
    ] as const

    for (const mode of modes) {
      const boundary = getFolderSkillBoundary(mode)
      expect(boundary.label).toBeTruthy()
      expect(boundary.executesScript).toBe(true)
      expect(boundary.usesSchema).toBe(true)
      expect(boundary.usesBudget).toBe(true)
      expect(boundary.perSkillAgent).toBe(mode === 'chain' || mode === 'split-merge' || mode === 'multi-step')
    }
  })

  it('lists the multi-folder compose limitations in Chinese', () => {
    const text = formatFolderSkillBoundary('compose-multi')
    expect(text).toContain('并行（多个文件夹技能）')
    expect(text).toContain('仅第一个的 script/schema 会执行')
    expect(text).toContain('技能级智能体不会生效')
  })

  it('states that composite honors portable child agent defaults', () => {
    const boundary = getFolderSkillBoundary('composite')
    expect(boundary.perSkillAgent).toBe(false)
    expect(boundary.notes[0]).toContain('应用内技能级智能体绑定不生效')
    expect(boundary.notes[0]).toContain('子技能 meta.agent 默认值会生效')
  })
})
