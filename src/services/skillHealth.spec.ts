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
        meta: {
          intents: ['generate'],
          contextPolicy: { chatHistory: 'none', includeOutline: false },
        },
        fingerprint: [{ path: 'SKILL.md', hash: 'abc' }],
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
      package: {
        template: '模板',
        script: 'module.exports = {}',
        samples: '示例',
        manifest: { id: 'demo', name: 'Demo Skill', version: '1.0.0' },
        meta: {
          intents: ['generate'],
          contextPolicy: { chatHistory: 'latest', includeOutline: true },
        },
        fingerprint: [{ path: 'SKILL.md', hash: 'abc' }],
        warnings: [],
        evals: null,
      },
      sourceId: 'demo',
      version: '1.0.0',
    })
    expect(report.healthy).toBe(true)
    expect(report.issues).toEqual([])
  })

  it('reports identity, metadata, fingerprint, and loader warnings', () => {
    const report = analyzeSkillHealth({
      skillId: 'demo',
      format: 'folder',
      folderPath: 'D:/skills/demo',
      sourceId: 'other',
      version: '1.0.0',
      package: {
        template: '模板',
        manifest: { id: 'other', version: '1.1.0' },
        meta: {
          intents: ['generate', 42],
          contextPolicy: { chatHistory: 'sometimes', includeOutline: 'yes' },
        },
        warnings: [{ code: 'manifest-id-conflict', message: 'id 冲突' }],
      },
    })
    expect(report.healthy).toBe(false)
    expect(report.issues).toEqual(expect.arrayContaining([
      { level: 'warning', field: 'fingerprint', message: '技能包缺少文件指纹，版本变更追踪不完整' },
      { level: 'warning', field: 'loader:manifest-id-conflict', message: 'id 冲突' },
      { level: 'warning', field: 'skill.json.name', message: 'skill.json 未声明技能名称' },
      { level: 'warning', field: 'skill.json.version', message: 'manifest 版本 (1.1.0) 与技能记录版本 (1.0.0) 不一致' },
      { level: 'error', field: 'meta.contextPolicy.chatHistory', message: 'chatHistory 非法：sometimes' },
      { level: 'error', field: 'meta.contextPolicy.includeOutline', message: 'includeOutline 必须是布尔值' },
    ]))
  })

  it('keeps old folder packages readable with protocol warnings', () => {
    const report = analyzeSkillHealth({
      skillId: 'demo',
      format: 'folder',
      folderPath: 'D:/skills/demo',
      sourceId: 'demo',
      package: {
        template: '模板',
        meta: {},
      },
    })
    expect(report.healthy).toBe(true)
    expect(report.issues).toEqual(expect.arrayContaining([
      { level: 'info', field: 'samples.txt', message: '未提供示例文本' },
      { level: 'warning', field: 'fingerprint', message: '技能包缺少文件指纹，版本变更追踪不完整' },
      { level: 'warning', field: 'meta.intents', message: '未声明可解析的 intents，技能用途不完整' },
      { level: 'warning', field: 'meta.contextPolicy', message: 'contextPolicy 缺失或不是对象，运行时将退回默认上下文' },
    ]))
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
