import { describe, expect, it } from 'vitest'
import {
  buildImportPlan,
  parseAgentJson,
  parseAgentMd,
  parseBindingJson,
  parseBundleJson,
  parseSkillJson,
  parseSkillMd,
  serializeAgentJson,
  serializeAgentMd,
  serializeBindingJson,
  serializeBundleJson,
  serializeSkillJson,
  serializeSkillMd,
} from './configExchange'
import type {
  AgentRecord,
  ConfigDiagnostic,
  ConfigFieldTrace,
  ConfigSourceInfo,
  PipelineBindingRecord,
  SkillRecord,
} from './configExchange'

const agentFixture: AgentRecord = {
  id: 'agent-volume-parse',
  name: '卷纲解析师',
  model: 'deepseek-chat',
  temperature: 0.2,
  maxTokens: 128000,
  systemPrompt: '你是卷纲解析师，输出结构化卷纲。',
  tools: ['outline'],
}

const skillFixture: SkillRecord = {
  id: 'L3-S1',
  name: '卷纲解析',
  template: '解析以下大纲：\n{{outlineContent}}',
  category: 'volume',
  executionMode: 'chain',
  outputFormat: 'json',
  validationRules: ['required:volumes'],
  splitSize: 2000,
  bindTarget: { type: 'volume' },
  customVars: { tone: '悬疑' },
}

describe('config exchange agents', () => {
  it('parses versioned agent JSON and reports unknown fields', () => {
    const text = JSON.stringify({
      schema: 'shenyi.agent',
      version: 1,
      exportedAt: '2026-08-27T00:00:00.000Z',
      note: '第三方备注字段会进报告',
      agents: [{ ...agentFixture, skillId: 'L3-S1' }],
    })
    const result = parseAgentJson(text)
    expect(result.ok).toBe(true)
    expect(result.addedCount).toBe(1)
    expect(result.value?.agents[0].id).toBe('agent-volume-parse')
    expect(result.value?.unknownFields).toContain('$.note')
    expect(result.value?.unknownFields).toContain('agents[0].skillId')
  })

  it('rejects higher protocol versions and malformed JSON', () => {
    const tooNew = parseAgentJson(
      JSON.stringify({ schema: 'shenyi.agent', version: 3, agents: [] }),
    )
    expect(tooNew.ok).toBe(false)
    expect(tooNew.issues[0].code).toBe('version')

    const malformed = parseAgentJson('{not-json')
    expect(malformed.ok).toBe(false)
    expect(malformed.issues[0].code).toBe('json')
  })

  it('accepts legacy agent arrays with a compatibility warning', () => {
    const result = parseAgentJson(
      JSON.stringify([{ id: 'a1', name: 'A', systemPrompt: 'prompt' }]),
    )
    expect(result.ok).toBe(true)
    expect(result.issues.some(issue => issue.code === 'warning')).toBe(true)
    expect(result.value?.agents[0].name).toBe('A')
  })

  it('round-trips agent markdown including tools and prompt body', () => {
    const markdown = serializeAgentMd(agentFixture)
    const result = parseAgentMd(markdown)
    expect(result.ok).toBe(true)
    expect(result.value?.agent.id).toBe('agent-volume-parse')
    expect(result.value?.agent.systemPrompt).toBe(agentFixture.systemPrompt)
    expect(result.value?.agent.tools).toEqual(['outline'])
    expect(result.value?.agent.temperature).toBe(0.2)
  })

  it('classifies BOM-prefixed plain Markdown as plain Markdown', () => {
    const result = parseAgentMd('\uFEFF# 兼容 Agent\n\n这是提示词正文。', {
      format: 'markdown',
      markdownKind: 'plain-markdown',
      fileName: '兼容-agent.md',
      extension: '.md',
    })
    expect(result.source?.format).toBe('markdown')
    expect(result.source?.markdownKind).toBe('plain-markdown')
    expect(result.issues.some(issue => issue.message.includes('普通 Markdown'))).toBe(true)
  })

  it('infers Agent id and name from a plain Markdown heading', () => {
    const result = parseAgentMd('# 叙事校验师\n\n只输出校验建议。', {
      format: 'markdown',
      fileName: 'unused.agent.md',
      extension: '.md',
    })
    expect(result.ok).toBe(true)
    expect(result.value?.agent).toMatchObject({
      id: 'agent-叙事校验师',
      name: '叙事校验师',
      systemPrompt: '只输出校验建议。',
    })
    expect(result.fieldTrace?.map(trace => trace.field)).toEqual(['name', 'id'])
  })

  it('navigates away from third-party agentId as the primary key', () => {
    const result = parseAgentJson(
      JSON.stringify({
        agents: [{ agentId: 'x-1', name: 'X', systemPrompt: 'p' }],
      }),
    )
    expect(result.skippedCount).toBe(0)
    expect(result.value?.agents[0].id).toBe('x-1')
    expect(result.issues.some(issue => issue.message.includes('agentId'))).toBe(true)
  })

  it('maps common third-party Agent aliases while preserving standard-field priority', () => {
    const result = parseAgentJson(JSON.stringify({ agents: [{
      agentId: 'agent-alias',
      title: '别名 Agent',
      instruction: '使用别名提示词',
      modelName: 'alias-model',
      temp: 0.25,
      max_tokens: 4096,
      providerId: 'alias-provider',
    }] }))
    const agent = result.value?.agents[0]
    expect(agent).toMatchObject({
      id: 'agent-alias', name: '别名 Agent', systemPrompt: '使用别名提示词',
      model: 'alias-model', temperature: 0.25, maxTokens: 4096, provider: 'alias-provider',
    })
    expect(result.issues.filter(issue => issue.message.includes('映射')).length).toBeGreaterThanOrEqual(6)
  })

  it('keeps a front-matter Agent body separate and warns when schema is missing', () => {
    const result = parseAgentMd(`---
id: half-agent
name: 半标准 Agent
model: test-model
---
# 不应进入提示词

这是完整的系统提示词。`, {
      format: 'markdown',
      fileName: 'half-agent.md',
      extension: '.md',
    })
    expect(result.ok).toBe(true)
    expect(result.source?.markdownKind).toBe('front-matter')
    expect(result.value?.agent.systemPrompt).toBe('# 不应进入提示词\n\n这是完整的系统提示词。')
    expect(result.issues.some(issue => issue.message.includes('缺少 schema'))).toBe(true)
    expect(result.value?.agent.model).toBe('test-model')
  })
})

describe('config exchange protocol metadata', () => {
  it('defines one source contract for front matter and plain Markdown', () => {
    const source: ConfigSourceInfo = {
      format: 'markdown',
      markdownKind: 'plain-markdown',
      fileName: '卷纲解析.md',
      extension: '.md',
    }
    const fields: ConfigFieldTrace[] = [
      { field: 'id', origin: 'inferred', sourceField: 'title', value: 'L3-S1' },
      { field: 'template', origin: 'source', value: '解析以下大纲' },
      { field: 'executionMode', origin: 'defaulted', value: 'chain' },
    ]
    const diagnostics: ConfigDiagnostic[] = [
      { level: 'info', code: 'inference', message: '从标题推导 id', field: 'id' },
    ]

    expect(source.format).toBe('markdown')
    expect(source.markdownKind).toBe('plain-markdown')
    expect(fields.find(field => field.field === 'id')?.origin).toBe('inferred')
    expect(diagnostics[0].code).toBe('inference')
  })
})

describe('config exchange skills', () => {
  it('round-trips versioned skill JSON with pipeline and de-ai lists', () => {
    const text = serializeSkillJson({
      skills: [skillFixture],
      pipelineSkills: ['L3-S1'],
      deAiSkills: ['L3-S1'],
    })
    const result = parseSkillJson(text)
    expect(result.ok).toBe(true)
    expect(result.value?.skills[0].id).toBe('L3-S1')
    expect(result.value?.pipelineSkills).toEqual(['L3-S1'])
    expect(result.value?.deAiSkills).toEqual(['L3-S1'])
    expect(result.value?.skills[0].validationRules).toEqual(['required:volumes'])
  })

  it('round-trips skill markdown without losing validation, split, vars or template', () => {
    const markdown = serializeSkillMd(skillFixture)
    const result = parseSkillMd(markdown)
    expect(result.ok).toBe(true)
    const skill = result.value?.skill
    expect(skill?.id).toBe('L3-S1')
    expect(skill?.validationRules).toEqual(['required:volumes'])
    expect(skill?.splitSize).toBe(2000)
    expect(skill?.customVars).toEqual({ tone: '悬疑' })
    expect(skill?.bindTarget).toEqual({ type: 'volume' })
    expect(skill?.template).toContain('{{outlineContent}}')
  })

  it('classifies BOM-prefixed CRLF Front Matter as formal Markdown', () => {
    const markdown = serializeSkillMd(skillFixture).replace(/\n/g, '\r\n')
    const result = parseSkillMd('\uFEFF' + markdown, {
      format: 'markdown',
      fileName: 'L3-S1.skill.md',
      extension: '.md',
    })
    expect(result.source?.markdownKind).toBe('front-matter')
    expect(result.value?.skill.id).toBe('L3-S1')
  })

  it('infers Skill id and name from the file name when no heading exists', () => {
    const result = parseSkillMd('执行卷纲解析：{{outlineContent}}', {
      format: 'markdown',
      fileName: '卷纲解析.skill.md',
      extension: '.md',
    })
    expect(result.ok).toBe(true)
    expect(result.value?.skill).toMatchObject({
      id: 'skill-卷纲解析',
      name: '卷纲解析',
      template: '执行卷纲解析：{{outlineContent}}',
    })
    expect(result.diagnostics?.map(diagnostic => diagnostic.code)).toEqual(['inference', 'inference'])
  })

  it('skips skill items that miss required id or name', () => {
    const result = parseSkillJson(
      JSON.stringify({ skills: [{ name: 'no-id' }, { id: 'no-name' }, skillFixture] }),
    )
    expect(result.ok).toBe(true)
    expect(result.skippedCount).toBe(2)
    expect(result.addedCount).toBe(1)
  })

  it('maps common third-party Skill aliases', () => {
    const result = parseSkillJson(JSON.stringify({ skills: [{
      skillId: 'skill-alias', title: '别名技能', prompt: '执行：{{input}}',
      mode: 'chain', output_format: 'text', validation: ['required:output'],
    }] }))
    expect(result.value?.skills[0]).toMatchObject({
      id: 'skill-alias', name: '别名技能', template: '执行：{{input}}',
      executionMode: 'chain', outputFormat: 'text', validationRules: ['required:output'],
    })
    expect(result.issues.filter(issue => issue.message.includes('映射')).length).toBeGreaterThanOrEqual(5)
  })

  it('keeps a front-matter Skill body separate and reports missing advanced fields', () => {
    const result = parseSkillMd(`---
id: half-skill
name: 半标准技能
---
# 模板正文标题

请处理 {{outlineContent}}。`, {
      format: 'markdown',
      fileName: 'half-skill.md',
      extension: '.md',
    })
    expect(result.ok).toBe(true)
    expect(result.source?.markdownKind).toBe('front-matter')
    expect(result.value?.skill.template).toBe('# 模板正文标题\n\n请处理 {{outlineContent}}。')
    expect(result.issues.some(issue => issue.message.includes('缺少 schema'))).toBe(true)
    expect(result.value?.skill.executionMode).toBe('chain')
    expect(result.value?.skill.outputFormat).toBe('text')
  })

  it('reports unknown front-matter fields instead of silently treating them as standard fields', () => {
    const result = parseSkillMd(`---
schema: shenyi.skill
version: 1
id: third-party-skill
name: 第三方技能
vendorMode: experimental
---
正文`, {
      format: 'markdown',
      fileName: 'third-party.skill.md',
      extension: '.md',
    })
    expect(result.ok).toBe(true)
    expect(result.value?.unknownFields).toContain('skill.vendorMode')
    expect(result.value?.skill.template).toBe('正文')
  })
})

describe('config exchange bindings and bundle', () => {
  const bindings: PipelineBindingRecord = {
    agents: { '1': 'agent-layer' },
    skills: { '1': ['L3-S1', 'L3-S2'] },
    modes: { '1': 'chain' },
    skillAgents: { '1-L3-S1': 'agent-parse', '1-1': 'agent-fill' },
  }

  it('round-trips bindings and migrates legacy index keys', () => {
    const text = serializeBindingJson(bindings)
    const result = parseBindingJson(text)
    expect(result.ok).toBe(true)
    expect(result.value?.bindings.skillAgents['1-L3-S1']).toBe('agent-parse')
    expect(result.value?.bindings.skillAgents['1-L3-S2']).toBe('agent-fill')
    expect(result.value?.bindings.skillAgents['1-1']).toBeUndefined()
  })

  it('keeps stable binding when a legacy index collides with it', () => {
    const result = parseBindingJson(JSON.stringify({
      schema: 'shenyi.binding',
      version: 1,
      bindings: { pipeline: {
        skills: { '1': ['L3-S1'] },
        skillAgents: { '1-L3-S1': 'stable-agent', '1-0': 'legacy-agent' },
      } },
    }))
    expect(result.value?.bindings.skillAgents).toEqual({ '1-L3-S1': 'stable-agent' })
  })

  it('round-trips a full bundle across the native file boundary', () => {
    const text = serializeBundleJson({
      agents: [agentFixture],
      skills: [skillFixture],
      pipelineSkills: ['L3-S1'],
      deAiSkills: [],
      bindings,
    })
    const result = parseBundleJson(text)
    expect(result.ok).toBe(true)
    expect(result.value?.agents[0].id).toBe('agent-volume-parse')
    expect(result.value?.skills[0].id).toBe('L3-S1')
    expect(result.value?.pipelineSkills).toEqual(['L3-S1'])
    expect(result.value?.bindings.skillAgents['1-L3-S1']).toBe('agent-parse')
  })

  it('keeps agent exports stable and versioned', () => {
    const text = serializeAgentJson([agentFixture])
    expect(text).toContain('"schema": "shenyi.agent"')
    expect(text).toContain('"version": 1')
  })
})

describe('import planning', () => {
  it('builds add/skip/update plans without mutating existing ids', () => {
    const plan = buildImportPlan(
      ['existing-a'],
      [
        { id: 'existing-a', name: 'A' },
        { id: 'new-b', name: 'B' },
      ],
    )
    expect(plan).toEqual([
      { id: 'existing-a', name: 'A', action: 'skip', reason: '已存在相同 id' },
      { id: 'new-b', name: 'B', action: 'add', reason: '新增' },
    ])

    const overwrite = buildImportPlan(['existing-a'], [{ id: 'existing-a' }], 'overwrite')
    expect(overwrite[0].action).toBe('update')
  })
})
