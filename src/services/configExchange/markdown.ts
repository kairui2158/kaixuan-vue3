import {
  AGENT_JSON_VERSION,
  CONFIG_PROTOCOL,
  SKILL_MD_VERSION,
} from './types'
import type {
  AgentRecord,
  ConfigDiagnostic,
  ConfigFieldTrace,
  ConfigIssue,
  ConfigParseResult,
  ConfigSourceInfo,
  MarkdownInputKind,
  SkillRecord,
} from './types'
import {
  normalizeAgentItem,
  normalizeSkillItem,
} from './validation'
import { checkSchemaVersion } from './json'

function parseYamlValue(raw: string): unknown {
  const value = raw.trim()
  if (!value) return ''
  if (value.startsWith('"') || value.startsWith("'")) {
    try {
      return JSON.parse(value)
    } catch {
      const quote = value[0]
      if (value.endsWith(quote) && value.length >= 2) return value.slice(1, -1)
      return value
    }
  }
  if (value.startsWith('{') || value.startsWith('[')) {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  if (value === 'true') return true
  if (value === 'false') return false
  if (value === 'null') return null
  if (/^[+-]?\d+(\.\d+)?$/.test(value)) return Number(value)
  return value
}

function normalizeMarkdownText(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
}

function extractFrontMatter(
  rawText: string,
  issues: ConfigIssue[],
): { front: Record<string, unknown>; body: string; kind: MarkdownInputKind } {
  const text = normalizeMarkdownText(rawText)
  const match = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*\n?/.exec(text)
  if (!match) {
    issues.push({
      code: 'warning',
      field: '$',
      message: '未发现 YAML 元信息头，按普通 Markdown 解析',
    })
    return { front: {}, body: text, kind: 'plain-markdown' }
  }

  const front: Record<string, unknown> = {}
  for (const line of match[1].split(/\r?\n/)) {
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const key = line.slice(0, colon).trim()
    if (!key) continue
    front[key] = parseYamlValue(line.slice(colon + 1))
  }
  return { front, body: text.slice(match[0].length), kind: 'front-matter' }
}

function markdownSource(kind: MarkdownInputKind, source?: ConfigSourceInfo): ConfigSourceInfo {
  return {
    format: 'markdown',
    markdownKind: kind,
    fileName: source?.fileName,
    extension: source?.extension,
  }
}

function markdownTitle(body: string): { title?: string; body: string } {
  const match = /^\s*#{1,6}\s+(.+?)\s*\n(?:\s*\n)?/.exec(body)
  if (!match) return { body: body.trimStart() }
  return { title: match[1].replace(/\s+#+\s*$/, '').trim(), body: body.slice(match[0].length) }
}

function fileStem(source?: ConfigSourceInfo): string | undefined {
  const fileName = source?.fileName
  if (!fileName) return undefined
  return fileName
    .replace(/\.(agent|skill)\.md$/i, '')
    .replace(/\.(markdown|md)$/i, '')
    .trim() || undefined
}

function stableId(value: string, kind: 'agent' | 'skill'): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return `${kind}-${slug || 'imported'}`
}

function inferPlainMarkdownFields(
  front: Record<string, unknown>,
  body: string,
  source: ConfigSourceInfo | undefined,
  kind: 'agent' | 'skill',
): {
  front: Record<string, unknown>
  body: string
  fields: ConfigFieldTrace[]
  diagnostics: ConfigDiagnostic[]
} {
  const titleResult = markdownTitle(body)
  const title = titleResult.title || fileStem(source)
  const fields: ConfigFieldTrace[] = []
  const diagnostics: ConfigDiagnostic[] = []
  const result = { ...front }
  if (title) {
    if (result.name === undefined) {
      result.name = title
      fields.push({ field: 'name', origin: 'inferred', sourceField: titleResult.title ? 'markdown.title' : 'fileName', value: title })
      diagnostics.push({ level: 'info', code: 'inference', field: 'name', message: `已从${titleResult.title ? ' Markdown 标题' : '文件名'}推导 name` })
    }
    if (result.id === undefined) {
      result.id = stableId(title, kind)
      fields.push({ field: 'id', origin: 'inferred', sourceField: 'name', value: result.id })
      diagnostics.push({ level: 'info', code: 'inference', field: 'id', message: '已从 name 推导稳定 id' })
    }
  }
  return { front: result, body: titleResult.body, fields, diagnostics }
}

function yamlValue(value: unknown): string {
  if (value === undefined || value === null) return '""'
  if (typeof value === 'string') {
    if (
      value &&
      !value.includes('\n') &&
      !/["'[{\s]$/.test(value) &&
      !/^["'[{\-]/.test(value)
    ) {
      return value
    }
    return JSON.stringify(value)
  }
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)
  return JSON.stringify(value)
}

function frontLines(entries: Array<[string, unknown]>): string[] {
  return ['---', ...entries.map(([key, value]) => `${key}: ${yamlValue(value)}`), '---']
}

export function parseAgentMd(
  text: string,
  source?: ConfigSourceInfo,
): ConfigParseResult<{ agent: AgentRecord; unknownFields: string[] }> {
  const issues: ConfigIssue[] = []
  const extracted = extractFrontMatter(text, issues)
  const { kind } = extracted
  const inferred = kind === 'plain-markdown'
    ? inferPlainMarkdownFields(extracted.front, extracted.body, source, 'agent')
    : { front: extracted.front, body: extracted.body, fields: [], diagnostics: [] }
  const { front, body } = inferred
  if (front.schema !== undefined) {
    const clean: Record<string, unknown> = { ...front, version: front.version ?? AGENT_JSON_VERSION }
    if (!checkSchemaVersion('$', clean, CONFIG_PROTOCOL.agent.schema, AGENT_JSON_VERSION, issues)) {
      return { ok: false, issues, source: markdownSource(kind, source), fieldTrace: inferred.fields, diagnostics: inferred.diagnostics }
    }
  } else {
    issues.push({ code: 'warning', field: '$', message: '缺少 schema 字段，已按 Agent Markdown 兼容解析' })
  }

  const itemRaw: Record<string, unknown> = { ...front }
  delete itemRaw.schema
  delete itemRaw.version
  itemRaw.systemPrompt = front.systemPrompt ?? body.replace(/^\r?\n+/, '')

  const unknownFields: string[] = []
  const agent = normalizeAgentItem(itemRaw, 'agent', issues, unknownFields)
  if (!agent) {
    return { ok: false, issues, source: markdownSource(kind, source), fieldTrace: inferred.fields, diagnostics: inferred.diagnostics, skippedCount: 1 }
  }
  return {
    ok: true,
    value: { agent, unknownFields },
    issues,
    source: markdownSource(kind, source),
    fieldTrace: inferred.fields,
    diagnostics: inferred.diagnostics,
    addedCount: 1,
    skippedCount: 0,
  }
}

export function serializeAgentMd(agent: AgentRecord): string {
  const entries: Array<[string, unknown]> = [
    ['schema', CONFIG_PROTOCOL.agent.schema],
    ['version', AGENT_JSON_VERSION],
    ['id', agent.id],
    ['name', agent.name],
    ['model', agent.model],
    ['temperature', agent.temperature],
    ['maxTokens', agent.maxTokens],
    ['description', agent.description || ''],
    ['provider', agent.provider || ''],
    ['tools', agent.tools || []],
    ['createdAt', agent.createdAt || ''],
    ['updatedAt', agent.updatedAt || ''],
  ]
  const header = frontLines(entries).join('\n') + '\n\n'
  return header + (agent.systemPrompt || '')
}

export function parseSkillMd(
  text: string,
  source?: ConfigSourceInfo,
): ConfigParseResult<{ skill: SkillRecord; unknownFields: string[] }> {
  const issues: ConfigIssue[] = []
  const extracted = extractFrontMatter(text, issues)
  const { kind } = extracted
  const inferred = kind === 'plain-markdown'
    ? inferPlainMarkdownFields(extracted.front, extracted.body, source, 'skill')
    : { front: extracted.front, body: extracted.body, fields: [], diagnostics: [] }
  const { front, body } = inferred
  if (front.schema !== undefined) {
    if (!checkSchemaVersion('$', front, CONFIG_PROTOCOL.skill.schema, SKILL_MD_VERSION, issues)) {
      return { ok: false, issues, source: markdownSource(kind, source), fieldTrace: inferred.fields, diagnostics: inferred.diagnostics }
    }
  } else {
    issues.push({ code: 'warning', field: '$', message: '缺少 schema 字段，已按 Skill Markdown 兼容解析' })
  }

  const itemRaw: Record<string, unknown> = { ...front }
  delete itemRaw.schema
  delete itemRaw.version
  itemRaw.template = front.template ?? body.replace(/^\r?\n+/, '')

  const unknownFields: string[] = []
  const skill = normalizeSkillItem(itemRaw, 'skill', issues, unknownFields)
  if (!skill) {
    return { ok: false, issues, source: markdownSource(kind, source), fieldTrace: inferred.fields, diagnostics: inferred.diagnostics, skippedCount: 1 }
  }
  return {
    ok: true,
    value: { skill, unknownFields },
    issues,
    source: markdownSource(kind, source),
    fieldTrace: inferred.fields,
    diagnostics: inferred.diagnostics,
    addedCount: 1,
    skippedCount: 0,
  }
}

export function serializeSkillMd(skill: SkillRecord): string {
  const entries: Array<[string, unknown]> = [
    ['schema', CONFIG_PROTOCOL.skill.schema],
    ['version', SKILL_MD_VERSION],
    ['id', skill.id],
    ['name', skill.name],
    ['category', skill.category || 'general'],
    ['description', skill.description || ''],
    ['executionMode', skill.executionMode || 'chain'],
    ['outputFormat', skill.outputFormat || 'text'],
    ['validationRules', skill.validationRules || []],
    ['splitSize', skill.splitSize ?? 1000],
    ['injectMode', skill.injectMode || 'system_prefix'],
    ['injectFrequency', skill.injectFrequency || 'every'],
    ['injectDepth', skill.injectDepth ?? 0],
    ['bindTarget', skill.bindTarget ?? 'project'],
    ['linkedSkillIds', skill.linkedSkillIds || []],
    ['customVars', skill.customVars || {}],
    ['inputSchema', skill.inputSchema || ''],
    ['outputSchema', skill.outputSchema || ''],
    ['retryPolicy', skill.retryPolicy || ''],
    ['createdAt', skill.createdAt || ''],
    ['updatedAt', skill.updatedAt || ''],
  ]
  const header = frontLines(entries).join('\n') + '\n\n'
  return header + (skill.template || '')
}
