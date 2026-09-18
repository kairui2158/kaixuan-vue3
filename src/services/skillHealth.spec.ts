import { describe, expect, it } from 'vitest'
import { analyzeSkillHealth, inspectSkillSamples, inspectTemplateVariables } from './skillHealth'

describe('skillHealth', () => {
  it('extracts unique template variables', () => {
    expect(inspectTemplateVariables('{{outline}} {{ outline }} {{characters}}')).toEqual([
      'outline',
      'characters',
    ])
  })

  it('accepts short style samples', () => {
    expect(inspectSkillSamples('雨声压过人群。\n刀光像被水洗过。')).toEqual([])
  })

  it('warns when samples have too many lines', () => {
    const samples = Array.from({ length: 9 }, (_, index) => `第${index + 1}句风格样本`).join('\n')
    expect(inspectSkillSamples(samples)).toEqual([
      { level: 'warning', field: 'samples.txt', message: '样本行数超过 8 行，建议只保留风格参考，不要放置完整成品' },
    ])
  })

  it('warns when a sample line is too long', () => {
    const samples = '风很冷。'.repeat(101)
    expect(inspectSkillSamples(samples)).toEqual([
      { level: 'warning', field: 'samples.txt', message: '存在超过 400 字符的样本行，建议改为短句风格参考或占位符' },
    ])
  })

  it('warns on complete structured samples without placeholders', () => {
    const report = analyzeSkillHealth({
      skillId: 'demo',
      format: 'folder',
      folderPath: 'D:/skills/demo',
      package: {
        template: '模板',
        script: 'module.exports = {}',
        samples: '[{"volumeName":"第一卷","volumeSummary":"完整成品文本"}]',
      },
    })
    expect(report.healthy).toBe(true)
    expect(report.issues).toEqual([
      { level: 'warning', field: 'samples.txt', message: '样本疑似完整结构化输出，请改为占位符结构，避免诱导模型复制成品' },
    ])
  })

  it('accepts structured samples with placeholders', () => {
    expect(inspectSkillSamples('[{"volumeName":"{{volumeName}}","volumeSummary":"{{volumeSummary}}"}]')).toEqual([])
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
