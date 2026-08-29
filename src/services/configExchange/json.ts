import {
  AGENT_JSON_VERSION,
  BINDING_JSON_VERSION,
  BUNDLE_JSON_VERSION,
  CONFIG_PROTOCOL,
  SKILL_JSON_VERSION,
} from './types'
import type {
  AgentJsonPayload,
  AgentRecord,
  BundleJsonPayload,
  ConfigIssue,
  ConfigParseResult,
  PipelineBindingRecord,
  SkillJsonPayload,
  SkillRecord,
} from './types'
import {
  isRecord,
  normalizeAgentItem,
  normalizeSkillItem,
} from './validation'
import { normalizeSkillAgentBindings } from '../skillAgentBinding'

function readVersion(value: unknown, fallback: number): number | null {
  if (value === undefined || value === null || value === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function checkSchemaVersion(
  field: string,
  data: Record<string, unknown>,
  expectedSchema: string,
  expectedVersion: number,
  issues: ConfigIssue[],
): boolean {
  const schema = data.schema
  if (schema === undefined) {
    issues.push({
      code: 'warning',
      field,
      message: '缺少 schema 字段，已按旧格式兼容解析',
    })
  } else if (schema !== expectedSchema) {
    issues.push({
      code: 'schema',
      field: `${field}.schema`,
      message: `schema 应为 ${expectedSchema}，实际为 ${schema}`,
    })
    return false
  }

  const version = readVersion(data.version, expectedVersion)
  if (version === null) {
    issues.push({ code: 'version', field: `${field}.version`, message: '版本号不是有效数字' })
    return false
  }
  if (version > expectedVersion) {
    issues.push({
      code: 'version',
      field: `${field}.version`,
      message: `${version} 高于当前支持版本 ${expectedVersion}，请先升级应用`,
    })
    return false
  }
  if (version < expectedVersion) {
    issues.push({
      code: 'warning',
      field: `${field}.version`,
      message: `版本 ${version} 低于当前 ${expectedVersion}，已兼容导入`,
    })
  }
  return true
}

function collectDocumentUnknown(
  data: Record<string, unknown>,
  allowed: Set<string>,
  unknownFields: string[],
) {
  for (const key of Object.keys(data)) {
    if (!allowed.has(key)) unknownFields.push(`$.${key}`)
  }
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function normalizeAgents(
  rawItems: unknown,
  section: string,
  issues: ConfigIssue[],
): { agents: AgentRecord[]; unknownFields: string[]; added: number; skipped: number } {
  const agents: AgentRecord[] = []
  const unknownFields: string[] = []
  let added = 0
  let skipped = 0
  if (!Array.isArray(rawItems)) {
    issues.push({ code: 'field', field: section, message: '必须是数组' })
    return { agents, unknownFields, added, skipped }
  }
  rawItems.forEach((item, index) => {
    const field = `${section}[${index}]`
    const normalized = normalizeAgentItem(item, field, issues, unknownFields)
    if (normalized) {
      agents.push(normalized)
      added += 1
    } else {
      skipped += 1
    }
  })
  return { agents, unknownFields, added, skipped }
}

function normalizeSkills(
  rawItems: unknown,
  section: string,
  issues: ConfigIssue[],
): { skills: SkillRecord[]; unknownFields: string[]; added: number; skipped: number } {
  const skills: SkillRecord[] = []
  const unknownFields: string[] = []
  let added = 0
  let skipped = 0
  if (!Array.isArray(rawItems)) {
    issues.push({ code: 'field', field: section, message: '必须是数组' })
    return { skills, unknownFields, added, skipped }
  }
  rawItems.forEach((item, index) => {
    const field = `${section}[${index}]`
    const normalized = normalizeSkillItem(item, field, issues, unknownFields)
    if (normalized) {
      skills.push(normalized)
      added += 1
    } else {
      skipped += 1
    }
  })
  return { skills, unknownFields, added, skipped }
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}
  const result: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string') result[key] = raw
  }
  return result
}

function normalizeStringArrayRecord(value: unknown): Record<string, string[]> {
  if (!isRecord(value)) return {}
  const result: Record<string, string[]> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (Array.isArray(raw)) {
      result[key] = raw.filter((item): item is string => typeof item === 'string')
    }
  }
  return result
}

export function normalizePipelineBindings(
  raw: unknown,
  field: string,
  issues: ConfigIssue[],
): PipelineBindingRecord | null {
  if (!isRecord(raw)) {
    issues.push({ code: 'item', field, message: '绑定数据不是对象' })
    return null
  }

  let source: Record<string, unknown> = raw
  if (isRecord(raw.pipeline)) {
    source = raw.pipeline
  } else if (isRecord(raw.bindings)) {
    source = isRecord(raw.bindings.pipeline) ? raw.bindings.pipeline : raw.bindings
  }
  if (!isRecord(source)) {
    issues.push({ code: 'item', field, message: '绑定数据必须是对象' })
    return null
  }

  const agents = normalizeStringRecord(source.agents)
  const skills = normalizeStringArrayRecord(source.skills)
  const modes = normalizeStringRecord(source.modes)
  const rawSkillAgents = normalizeStringRecord(source.skillAgents)
  const skillAgents = normalizeSkillAgentBindings(rawSkillAgents, skills)
  for (const [key, agentId] of Object.entries(rawSkillAgents)) {
    if (!agentId) continue
    if (!/^\d+-.+/.test(key)) {
      issues.push({
        code: 'warning',
        field: `${field}.skillAgents.${key}`,
        message: '绑定 key 必须是 层数-SKILLID 格式，已忽略',
      })
    } else if (/^\d+-\d+$/.test(key)) {
      const match = /^(\d+)-(\d+)$/.exec(key)
      const skillId = match ? skills[match[1]]?.[Number(match[2])] : undefined
      if (!skillId) {
        issues.push({
          code: 'warning',
          field: `${field}.skillAgents.${key}`,
          message: '旧索引绑定找不到对应 SKILL，已忽略',
        })
      }
    }
  }

  return { agents, skills, modes, skillAgents }
}

export function parseAgentJson(text: string): ConfigParseResult<AgentJsonPayload> {
  const issues: ConfigIssue[] = []
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, issues: [{ code: 'json', field: '$', message: '文件不是合法 JSON' }] }
  }

  if (Array.isArray(data)) {
    issues.push({ code: 'warning', field: '$', message: '旧格式 Agent 数组，已按兼容模式解析' })
    const normalized = normalizeAgents(data, 'agents', issues)
    return {
      ok: true,
      value: { agents: normalized.agents, unknownFields: normalized.unknownFields },
      issues,
      addedCount: normalized.added,
      skippedCount: normalized.skipped,
    }
  }

  if (!isRecord(data)) {
    return { ok: false, issues: [{ code: 'json', field: '$', message: '顶层必须是对象或数组' }] }
  }

  if (!checkSchemaVersion('$', data, CONFIG_PROTOCOL.agent.schema, AGENT_JSON_VERSION, issues)) {
    return { ok: false, issues, addedCount: 0, skippedCount: 0 }
  }

  const documentUnknown: string[] = []
  collectDocumentUnknown(
    data,
    new Set(['schema', 'version', 'exportedAt', 'agents']),
    documentUnknown,
  )
  const normalized = normalizeAgents(data.agents, 'agents', issues)
  return {
    ok: true,
    value: {
      agents: normalized.agents,
      unknownFields: [...documentUnknown, ...normalized.unknownFields],
    },
    issues,
    addedCount: normalized.added,
    skippedCount: normalized.skipped,
  }
}

export function serializeAgentJson(agents: AgentRecord[]): string {
  return JSON.stringify(
    {
      schema: CONFIG_PROTOCOL.agent.schema,
      version: AGENT_JSON_VERSION,
      exportedAt: new Date().toISOString(),
      agents,
    },
    null,
    2,
  )
}

export function parseSkillJson(text: string): ConfigParseResult<SkillJsonPayload> {
  const issues: ConfigIssue[] = []
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, issues: [{ code: 'json', field: '$', message: '文件不是合法 JSON' }] }
  }

  if (Array.isArray(data)) {
    issues.push({ code: 'warning', field: '$', message: '旧格式 Skill 数组，已按兼容模式解析' })
    const normalized = normalizeSkills(data, 'skills', issues)
    return {
      ok: true,
      value: {
        skills: normalized.skills,
        pipelineSkills: [],
        deAiSkills: [],
        unknownFields: normalized.unknownFields,
      },
      issues,
      addedCount: normalized.added,
      skippedCount: normalized.skipped,
    }
  }

  if (!isRecord(data)) {
    return { ok: false, issues: [{ code: 'json', field: '$', message: '顶层必须是对象或数组' }] }
  }

  if (!checkSchemaVersion('$', data, CONFIG_PROTOCOL.skill.schema, SKILL_JSON_VERSION, issues)) {
    return { ok: false, issues, addedCount: 0, skippedCount: 0 }
  }

  const documentUnknown: string[] = []
  collectDocumentUnknown(
    data,
    new Set(['schema', 'version', 'exportedAt', 'exportVersion', 'skills', 'pipelineSkills', 'deAiSkills']),
    documentUnknown,
  )
  const normalized = normalizeSkills(data.skills, 'skills', issues)
  return {
    ok: true,
    value: {
      skills: normalized.skills,
      pipelineSkills: toStringArray(data.pipelineSkills),
      deAiSkills: toStringArray(data.deAiSkills),
      unknownFields: [...documentUnknown, ...normalized.unknownFields],
    },
    issues,
    addedCount: normalized.added,
    skippedCount: normalized.skipped,
  }
}

export function serializeSkillJson(
  payload: {
    skills: SkillRecord[]
    pipelineSkills?: string[]
    deAiSkills?: string[]
  },
): string {
  return JSON.stringify(
    {
      schema: CONFIG_PROTOCOL.skill.schema,
      version: SKILL_JSON_VERSION,
      exportedAt: new Date().toISOString(),
      skills: payload.skills,
      pipelineSkills: payload.pipelineSkills || [],
      deAiSkills: payload.deAiSkills || [],
    },
    null,
    2,
  )
}

export function parseBindingJson(
  text: string,
): ConfigParseResult<{ bindings: PipelineBindingRecord }> {
  const issues: ConfigIssue[] = []
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, issues: [{ code: 'json', field: '$', message: '文件不是合法 JSON' }] }
  }
  if (!isRecord(data)) {
    return { ok: false, issues: [{ code: 'json', field: '$', message: '顶层必须是对象' }] }
  }
  if (!checkSchemaVersion('$', data, CONFIG_PROTOCOL.binding.schema, BINDING_JSON_VERSION, issues)) {
    return { ok: false, issues }
  }
  const bindings = normalizePipelineBindings(data.bindings ?? data, '$', issues)
  if (!bindings) return { ok: false, issues }
  return { ok: true, value: { bindings }, issues }
}

export function serializeBindingJson(bindings: PipelineBindingRecord): string {
  return JSON.stringify(
    {
      schema: CONFIG_PROTOCOL.binding.schema,
      version: BINDING_JSON_VERSION,
      exportedAt: new Date().toISOString(),
      bindings: { pipeline: bindings },
    },
    null,
    2,
  )
}

export function parseBundleJson(text: string): ConfigParseResult<BundleJsonPayload> {
  const issues: ConfigIssue[] = []
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, issues: [{ code: 'json', field: '$', message: '文件不是合法 JSON' }] }
  }
  if (!isRecord(data)) {
    return { ok: false, issues: [{ code: 'json', field: '$', message: '顶层必须是对象' }] }
  }
  if (!checkSchemaVersion('$', data, CONFIG_PROTOCOL.bundle.schema, BUNDLE_JSON_VERSION, issues)) {
    return { ok: false, issues }
  }

  const documentUnknown: string[] = []
  collectDocumentUnknown(
    data,
    new Set(['schema', 'version', 'exportedAt', 'agents', 'skills', 'pipelineSkills', 'deAiSkills', 'bindings']),
    documentUnknown,
  )
  const agents = normalizeAgents(data.agents, 'agents', issues)
  const skills = normalizeSkills(data.skills, 'skills', issues)
  const bindings = normalizePipelineBindings(data.bindings, 'bindings', issues)
  if (!bindings) return { ok: false, issues, addedCount: 0, skippedCount: 0 }

  return {
    ok: true,
    value: {
      agents: agents.agents,
      skills: skills.skills,
      pipelineSkills: toStringArray(data.pipelineSkills),
      deAiSkills: toStringArray(data.deAiSkills),
      bindings,
      unknownFields: [...documentUnknown, ...agents.unknownFields, ...skills.unknownFields],
    },
    issues,
    addedCount: agents.added + skills.added,
    skippedCount: agents.skipped + skills.skipped,
  }
}

export function serializeBundleJson(payload: {
  agents: AgentRecord[]
  skills: SkillRecord[]
  pipelineSkills?: string[]
  deAiSkills?: string[]
  bindings: PipelineBindingRecord
}): string {
  return JSON.stringify(
    {
      schema: CONFIG_PROTOCOL.bundle.schema,
      version: BUNDLE_JSON_VERSION,
      exportedAt: new Date().toISOString(),
      agents: payload.agents,
      skills: payload.skills,
      pipelineSkills: payload.pipelineSkills || [],
      deAiSkills: payload.deAiSkills || [],
      bindings: { pipeline: payload.bindings },
    },
    null,
    2,
  )
}
