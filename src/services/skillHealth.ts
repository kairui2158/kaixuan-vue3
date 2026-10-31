export type SkillHealthLevel = 'error' | 'warning' | 'info'

export interface SkillHealthIssue {
  level: SkillHealthLevel
  field: string
  message: string
}

export interface SkillHealthReport {
  skillId: string
  healthy: boolean
  issues: SkillHealthIssue[]
}

const TEMPLATE_VARIABLE_PATTERN = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g

export function inspectTemplateVariables(template: string): string[] {
  const variables = new Set<string>()
  if (typeof template !== 'string') return []
  let match: RegExpExecArray | null
  TEMPLATE_VARIABLE_PATTERN.lastIndex = 0
  while ((match = TEMPLATE_VARIABLE_PATTERN.exec(template))) {
    variables.add(match[1])
  }
  return [...variables]
}

export function inspectSkillSamples(samples: string): SkillHealthIssue[] {
  const text = typeof samples === 'string' ? samples.trim() : ''
  if (!text) return []

  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0)
  if (lines.length > 8) {
    return [{ level: 'warning', field: 'samples.txt', message: '样本行数超过 8 行，建议只保留风格参考，不要放置完整成品' }]
  }

  for (const line of lines) {
    if (line.length > 400) {
      return [{ level: 'warning', field: 'samples.txt', message: '存在超过 400 字符的样本行，建议改为短句风格参考或占位符' }]
    }
    const looksStructured = /^\s*[\[{]/.test(line)
    if (looksStructured && !/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/.test(line)) {
      return [{ level: 'warning', field: 'samples.txt', message: '样本疑似完整结构化输出，请改为占位符结构，避免诱导模型复制成品' }]
    }
  }

  return []
}

export function analyzeSkillHealth(input: {
  skillId: string
  format: string
  folderPath?: string
  template?: string
  loadError?: string
  package?: {
    template?: string
    meta?: Record<string, unknown>
    script?: string
    samples?: string
    schema?: unknown
    evals?: unknown
    fingerprint?: unknown[]
    warnings?: unknown[]
    manifest?: {
      id?: unknown
      name?: unknown
      version?: unknown
    } | null
  } | null
  sourceId?: string
  version?: string
}): SkillHealthReport {
  const issues: SkillHealthIssue[] = []
  const pkg = input.package

  if (input.format === 'folder') {
    if (!input.folderPath) {
      issues.push({ level: 'error', field: 'folderPath', message: '未记录技能文件夹路径' })
    } else if (input.loadError) {
      issues.push({ level: 'error', field: 'folder', message: `技能文件夹读取失败：${input.loadError}` })
    }
    if (!pkg && !input.loadError) {
      issues.push({ level: 'error', field: 'folder', message: '技能文件夹无法加载' })
    }
    if (pkg && !String(pkg.template || '').trim()) {
      issues.push({ level: 'error', field: 'template.md', message: '模板为空' })
    }
    if (pkg?.script && !/module\.exports\s*=|exports\./.test(pkg.script)) {
      issues.push({ level: 'error', field: 'script.js', message: '脚本未导出钩子函数' })
    }
    if (pkg && !String(pkg.samples || '').trim()) {
      issues.push({ level: 'info', field: 'samples.txt', message: '未提供示例文本' })
    }
    if (!Array.isArray(pkg?.fingerprint) || pkg.fingerprint.length === 0) {
      issues.push({ level: 'warning', field: 'fingerprint', message: '技能包缺少文件指纹，版本变更追踪不完整' })
    }
    for (const warning of Array.isArray(pkg?.warnings) ? pkg.warnings : []) {
      if (!warning || typeof warning !== 'object') continue
      const item = warning as { code?: unknown; message?: unknown }
      const code = String(item.code || 'skill-warning')
      issues.push({ level: 'warning', field: `loader:${code}`, message: String(item.message || code) })
    }
    if (pkg?.manifest) {
      const manifestId = String(pkg.manifest.id ?? '').trim()
      if (manifestId && input.sourceId && manifestId !== input.sourceId) {
        issues.push({
          level: 'error',
          field: 'skill.json.id',
          message: `manifest id (${manifestId}) 与技能记录 id (${input.sourceId}) 不一致`,
        })
      }
      const manifestName = String(pkg.manifest.name ?? '').trim()
      if (!manifestName) {
        issues.push({ level: 'warning', field: 'skill.json.name', message: 'skill.json 未声明技能名称' })
      }
      const manifestVersion = String(pkg.manifest.version ?? '').trim()
      if (manifestVersion && input.version && manifestVersion !== input.version) {
        issues.push({
          level: 'warning',
          field: 'skill.json.version',
          message: `manifest 版本 (${manifestVersion}) 与技能记录版本 (${input.version}) 不一致`,
        })
      }
    }
    const intents = Array.isArray(pkg?.meta?.intents)
      ? (pkg.meta.intents as unknown[]).filter((item): item is string => typeof item === 'string')
      : []
    if (pkg && intents.length === 0) {
      issues.push({ level: 'warning', field: 'meta.intents', message: '未声明可解析的 intents，技能用途不完整' })
    }
    const rawPolicy = pkg?.meta?.contextPolicy
    if (pkg && (!rawPolicy || typeof rawPolicy !== 'object' || Array.isArray(rawPolicy))) {
      issues.push({ level: 'warning', field: 'meta.contextPolicy', message: 'contextPolicy 缺失或不是对象，运行时将退回默认上下文' })
    } else if (rawPolicy && typeof rawPolicy === 'object' && !Array.isArray(rawPolicy)) {
      const policy = rawPolicy as Record<string, unknown>
      const chatHistory = String(policy.chatHistory || '')
      if (chatHistory && !(SKILL_CONTEXT_HISTORY_MODES as readonly string[]).includes(chatHistory)) {
        issues.push({ level: 'error', field: 'meta.contextPolicy.chatHistory', message: `chatHistory 非法：${chatHistory}` })
      }
      if (policy.includeOutline !== undefined && typeof policy.includeOutline !== 'boolean') {
        issues.push({ level: 'error', field: 'meta.contextPolicy.includeOutline', message: 'includeOutline 必须是布尔值' })
      }
    }
    if (pkg?.evals !== undefined && pkg.evals !== null && (typeof pkg.evals !== 'object' || Array.isArray(pkg.evals))) {
      issues.push({ level: 'warning', field: 'evals.json', message: 'evals.json 不是对象，已被加载器忽略' })
    }
    const sampleIssues = inspectSkillSamples(String(pkg?.samples || ''))
    issues.push(...sampleIssues)
  } else {
    if (!String(input.template || '').trim()) {
      issues.push({ level: 'error', field: 'template', message: '文本技能模板为空' })
    }
  }

  const template = input.format === 'folder' ? String(pkg?.template || '') : String(input.template || '')
  if (template && inspectTemplateVariables(template).length > 30) {
    issues.push({ level: 'warning', field: 'template', message: '模板变量数量超过 30 个，建议拆分技能' })
  }

  return {
    skillId: input.skillId,
    healthy: issues.every(issue => issue.level !== 'error'),
    issues,
  }
}
import { SKILL_CONTEXT_HISTORY_MODES } from './skillIdentity'
