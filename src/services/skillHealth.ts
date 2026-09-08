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
  } | null
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
