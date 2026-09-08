import { describe, expect, it } from 'vitest'
import { analyzeSkillHealth, inspectTemplateVariables } from './skillHealth'

describe('skillHealth', () => {
  it('extracts unique template variables', () => {
    expect(inspectTemplateVariables('{{outline}} {{ outline }} {{characters}}')).toEqual([
      'outline',
      'characters',
    ])
  })

  it('reports a healthy folder skill', () => {
    const report = analyzeSkillHealth({
      skillId: 'demo',
      format: 'folder',
      folderPath: 'D:/skills/demo',
      package: { template: '模板', script: 'module.exports = {}', samples: '示例' },
    })
    expect(report.healthy).toBe(true)
    expect(report.issues).toEqual([])
  })

  it('reports missing folder path and invalid script hook', () => {
    const report = analyzeSkillHealth({
      skillId: 'demo',
      format: 'folder',
      folderPath: '',
    })
    expect(report.healthy).toBe(false)
    expect(report.issues.map(issue => issue.field)).toContain('folderPath')
  })

  it('rejects an empty text skill template', () => {
    const report = analyzeSkillHealth({
      skillId: 'text-demo',
      format: 'text',
      template: '   ',
    })
    expect(report.healthy).toBe(false)
    expect(report.issues[0]).toMatchObject({ level: 'error', field: 'template' })
  })
})
