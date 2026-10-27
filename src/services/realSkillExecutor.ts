import { getAiService } from './aiService'
import type { PhysicalCallPhase } from './aiService'
import {
  appendDialogueToolSurfaceDeclaration,
  buildDialogueToolSurfaceDeclarationAudit,
} from './dialogueToolSurface'
import { sanitizeSkillGuidance } from './skillGuidanceSanitizer'
import { DeAiSamples } from './deai-samples.js'
import { DeAiProcessor } from './de-ai'
import { classifyGenerationValidity, GENERATION_VALIDITY_MESSAGES } from './generationValidity'
import { getProviderReasoningControl } from './providerProtocols'
import { loadRealSkill } from './realSkillLoader'
import { formatSkillFallback } from './skillRouter'
import { REPEATED_PROMPT_BLOCK_MARKERS } from './promptBlockProtocol'
import { buildFinalStepFeedback } from './finalStepFeedback'
import { buildSchemaRetryFeedback } from './schemaRetryFeedback'
import { validateSkillOutput } from './skillValidation'
import type {
  RealSkillAgentContext,
  RealSkillDiagnostic,
  RealSkillExecuteOptions,
  RealSkillExecutionResult,
  RealSkillMeta,
  RealSkillPostProcessReport,
  RealSkillResource,
} from './realSkillTypes'

export type { RealSkillDiagnostic } from './realSkillTypes'


const ALLOWED_PRE_FIELDS = new Set(['input', 'template', 'samples'])
const ALLOWED_POST_FIELDS = new Set(['output', 'valid', 'message', 'errors', 'issues', 'warnings'])
const TEMPLATE_LIMIT = 20000
const RETRY_LIMIT = 3
const SMART_SAMPLE_CHAR_LIMIT = 4000
const CONTINUATION_TAIL_CHAR_LIMIT = 32000
const DIRECT_OUTPUT_SUFFIX = [
  '【直出模式】',
  '跳过所有内部思考、分析过程和推理说明，不输出任何标签。',
  '从回复第一个字符开始直接输出最终正文内容。'
].join('\n')

export type RealSkillPassInputMode = 'original' | 'previous'

export function countRepeatedPromptBlocks(userPrompt: string): Record<string, number> {
  const result: Record<string, number> = {}
  for (const marker of REPEATED_PROMPT_BLOCK_MARKERS) {
    let count = 0
    let index = userPrompt.indexOf(marker)
    while (index !== -1) {
      count += 1
      index = userPrompt.indexOf(marker, index + marker.length)
    }
    result[marker] = count
  }
  return result
}

export function buildFolderPassInputMeasurement(input: {
  passIndex: number
  inputMode: RealSkillPassInputMode
  input: string
  userPrompt: string
  systemPrompt: string
  sampleCount: number
  isRetry: boolean
  declaredFullUpstream: boolean
  appliedFullUpstream: boolean
  traceRunId?: string | null
  traceCallId?: string | null
}) {
  return {
    passIndex: input.passIndex,
    inputMode: input.inputMode,
    inputLength: input.input.length,
    userPromptLength: input.userPrompt.length,
    systemPromptLength: input.systemPrompt.length,
    sampleCount: input.sampleCount,
    isRetry: input.isRetry,
    declaredFullUpstream: input.declaredFullUpstream,
    appliedFullUpstream: input.appliedFullUpstream,
    traceRunId: input.traceRunId || null,
    traceCallId: input.traceCallId || null
  }
}

type CallAiToolResultLike = {
  toolCalls?: Array<{ name: string; input: unknown }>
  toolResults?: Array<{ call: { id?: string; name: string; input?: unknown }; result: unknown }>
  toolRequestDeltas?: Array<{ role: string; content: string }>
  toolAudit?: unknown
  reasoning?: string
  contextBudget?: NonNullable<RealSkillExecutionResult['apiMeta']>['contextBudget']
  usageReconciliation?: unknown
  textOrigin?: 'application' | 'model'
}

function diagnostic(
  type: RealSkillDiagnostic['type'],
  code: string,
  message: string
): RealSkillDiagnostic {
  return { type, code, message, at: new Date().toISOString() }
}

/**
 * Compose-mode Agent runs never enter the folder executor. This single-source
 * collector keeps their protocol observability aligned with executor runs:
 * SKILL declarations are visible as warnings, but never as execution authority.
 */
export async function collectSkillPackageProtocolDiagnostics(templates: Array<{
  skill?: {
    format?: string
    folderPath?: string
  }
}>): Promise<RealSkillDiagnostic[]> {
  const folderPaths = [...new Set(
    templates
      .filter(template => template.skill?.format === 'folder' && template.skill.folderPath)
      .map(template => String(template.skill?.folderPath))
  )]
  const diagnostics: RealSkillDiagnostic[] = []
  for (const folderPath of folderPaths) {
    const loaded = await loadRealSkill(folderPath)
    if (!loaded.package) continue
    for (const warning of loaded.warnings || loaded.package.warnings || []) {
      diagnostics.push(diagnostic(
        'warning',
        `folder-package:${warning.code}`,
        warning.message
      ))
    }
  }
  return diagnostics
}

/**
 * Only warnings that affected the delivered output may downgrade a run.
 * Protocol/debug hints stay visible in diagnostics without turning a valid
 * generation into a degraded one.
 */
const OUTPUT_DEGRADING_WARNING_CODES = new Set([
  'generation-truncated',
  'generation-truncated-after-continuation',
  'template-truncated',
  'folder-template-missing',
  'base-template-fallback',
  'script-bridge-unavailable',
  'script-hook-failed',
  'script-hook-exception',
  'hook-result-ignored',
  'schema-contract-warning',
  'schema-validation-exhausted'
])

// A failed schema attempt that is later recovered by a valid retry is normal
// repair behavior. Only exhausting all retries downgrades the delivered output.
const NON_DEGRADING_RECOVERY_WARNING_CODES = new Set([
  'schema-validation-failed',
  'post-process-validation-failed'
])

const OUTPUT_DEGRADING_POST_PROCESS_CODES = new Set([
  'lost-section',
  'missing-continuity-snapshot',
  'missing-micro-scene-range',
  'missing-marker'
])

function isOutputDegradingPostProcessCode(code: string): boolean {
  if (OUTPUT_DEGRADING_POST_PROCESS_CODES.has(code)) return true
  // Generic skill-authored messages such as "缺少标记区块" and
  // "missing continuity snapshot" describe structural output loss, not prose
  // taste warnings. Those must downgrade the run so trace consumers can see
  // that a delivered volume no longer satisfies the skill contract.
  return /^missing\b/i.test(code) || /^(缺少|缺失)/.test(code)
}

function isOutputDegradingWarning(item: RealSkillDiagnostic): boolean {
  if (item.type !== 'warning') return false
  if (NON_DEGRADING_RECOVERY_WARNING_CODES.has(item.code)) return false
  if (OUTPUT_DEGRADING_WARNING_CODES.has(item.code)) return true
  if (!item.code.startsWith('post-process-issue:')) return false
  return isOutputDegradingPostProcessCode(item.code.slice('post-process-issue:'.length))
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeRecord(
  value: unknown,
  outputKey: 'input' | 'output',
  allowedFields: Set<string>,
  diagnostics: RealSkillDiagnostic[]
): Record<string, unknown> {
  if (value === undefined || value === null) return {}
  if (typeof value === 'string') {
    return { [outputKey]: value }
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    diagnostics.push(diagnostic(
      'warning',
      'hook-result-ignored',
      `${outputKey === 'input' ? 'preProcess' : 'postProcess'} 返回了不可识别类型，已忽略`
    ))
    return {}
  }

  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (allowedFields.has(key)) result[key] = item
    else diagnostics.push(diagnostic('info', 'hook-field-ignored', `未知字段已忽略：${key}`))
  }
  return result
}

async function executeHook(
  script: string,
  hookName: 'preProcess' | 'postProcess',
  payload: unknown,
  diagnostics: RealSkillDiagnostic[]
): Promise<{ fields: Record<string, unknown>; templateOverride: string }> {
  if (!script.trim()) return { fields: {}, templateOverride: '' }
  try {
    const api = (window as any).electronAPI
    if (!api?.skillExecuteScript) {
      diagnostics.push(diagnostic('warning', 'script-bridge-unavailable', '脚本桥不可用，已跳过脚本钩子'))
      return { fields: {}, templateOverride: '' }
    }
    const response = await api.skillExecuteScript(script, {
      hook: hookName,
      payload
    })
    if (!response || response.ok !== true) {
      diagnostics.push(diagnostic(
        'warning',
        'script-hook-failed',
        `${hookName} 执行失败，已降级继续：${response?.message || '未知错误'}`
      ))
      return { fields: {}, templateOverride: '' }
    }

    // New bridge protocol returns data; old protocol returned exported functions.
    const hasResult = response.results
      ? hookName in response.results
      : Boolean(response.exports && hookName in response.exports)
    if (!hasResult) {
      return { fields: {}, templateOverride: '' }
    }
    const result = response.results?.[hookName] ?? response.exports?.[hookName]
    if (typeof result === 'function' || result === undefined) {
      return { fields: {}, templateOverride: '' }
    }
    if (response.consumedStructuredOutput === true && isPlainObject(result)) {
      return {
        fields: normalizeRecord(
          result,
          hookName === 'preProcess' ? 'input' : 'output',
          hookName === 'preProcess' ? ALLOWED_PRE_FIELDS : ALLOWED_POST_FIELDS,
          diagnostics
        ),
        templateOverride: typeof response.templateOverride === 'string' ? response.templateOverride : ''
      }
    }
    return {
      fields: normalizeRecord(
        result,
        hookName === 'preProcess' ? 'input' : 'output',
        hookName === 'preProcess' ? ALLOWED_PRE_FIELDS : ALLOWED_POST_FIELDS,
        diagnostics
      ),
      templateOverride: typeof response.templateOverride === 'string' ? response.templateOverride : ''
    }
  } catch (error: any) {
    diagnostics.push(diagnostic(
      'warning',
      'script-hook-exception',
      `${hookName} 抛出异常，已降级继续：${error?.message || '未知错误'}`
    ))
    return { fields: {}, templateOverride: '' }
  }
}

function loadSamples(skillSamples: string, count: number, diagnostics: RealSkillDiagnostic[]): string[] {
  if (count <= 0) return []
  if (skillSamples.trim()) {
    const items = skillSamples
      .split(/\r?\n+/)
      .map(line => line.trim())
      .filter(Boolean)
    if (items.length > 0) return items
  }

  try {
    const all = DeAiSamples.getAll()
    return all.slice(0, count)
  } catch {
    diagnostics.push(diagnostic('warning', 'samples-unavailable', '样本加载失败，已跳过样本'))
    return []
  }
}

function buildSystemPrompt(
  agentPrompt: string | undefined,
  skillBody: string | undefined,
  template: string,
  resources: RealSkillResource[] | undefined,
  systemPromptSuffix?: string
): string {
  const resourceBlocks = (resources || [])
    .filter(resource => resource.path && resource.content.trim())
    .map(resource => `[folder resource: ${resource.path}]\n${resource.content}`)
  const normalizedSkillBody = skillBody?.trim()
  const assembled = [
    agentPrompt?.trim(),
    // Fallback packages already use SKILL.md as template; don't inject it twice.
    normalizedSkillBody && normalizedSkillBody !== template.trim() ? normalizedSkillBody : '',
    template.trim(),
    ...resourceBlocks,
    systemPromptSuffix?.trim(),
  ].filter(Boolean).join('\n\n')
  return sanitizeSkillGuidance(assembled).text
}

function mergeContinuationText(previous: string, continuation: string): string {
  const left = previous.trimEnd()
  const right = continuation.trimStart()
  if (!left) return right
  if (!right) return left
  const maxOverlap = Math.min(200, left.length, right.length)
  for (let size = maxOverlap; size >= 12; size -= 1) {
    if (left.slice(-size) === right.slice(0, size)) {
      return `${left}${right.slice(size)}`
    }
  }
  return `${left}\n${right}`
}

function buildContinuationMessages(
  requestMessages: Array<{ role: string; content: string }>,
  output: string
): Array<{ role: string; content: string }> {
  const tail = output.length > CONTINUATION_TAIL_CHAR_LIMIT
    ? output.slice(-CONTINUATION_TAIL_CHAR_LIMIT)
    : output
  const continuationContext = requestMessages.filter(message => message.role !== 'user')
  return [
    ...continuationContext,
    {
      role: 'user',
      content: `以下是未完成输出的最后部分，请从中断处自然续写，不要重复已有内容，也不要重新输出开头：\n${tail}`
    }
  ]
}

function mergeSkillAgentDefaults(
  agent: RealSkillExecuteOptions['agent'],
  skillDefaults: RealSkillAgentContext | undefined,
  agentSource: RealSkillExecuteOptions['agentSource']
): RealSkillExecuteOptions['agent'] {
  if (!skillDefaults) return agent
  if (agentSource === 'user-binding') return agent
  if (skillDefaults.model !== undefined
    || skillDefaults.temperature !== undefined
    || skillDefaults.maxTokens !== undefined
  ) {
    return {
      ...agent,
      model: agent?.model,
      temperature: agent?.temperature,
      maxTokens: agent?.maxTokens,
      systemPrompt: agent?.systemPrompt
        ? appendSkillAgentGuidance(agent.systemPrompt, skillDefaults.systemPrompt)
        : skillDefaults.systemPrompt,
    }
  }
  if (agentSource === 'step-default') {
    return {
      ...agent,
      model: agent?.model,
      temperature: agent?.temperature,
      maxTokens: agent?.maxTokens,
      systemPrompt: agent?.systemPrompt
        ? appendSkillAgentGuidance(agent.systemPrompt, skillDefaults.systemPrompt)
        : skillDefaults.systemPrompt,
    }
  }
  return {
    ...agent,
    systemPrompt: agent?.systemPrompt
      ? appendSkillAgentGuidance(agent.systemPrompt, skillDefaults.systemPrompt)
      : skillDefaults.systemPrompt,
  }
}

function hasSkillAgentDefaults(skillDefaults: RealSkillAgentContext | undefined): boolean {
  return Boolean(skillDefaults)
}

function appendSkillAgentGuidance(primary: string, guidance?: string): string {
  if (!guidance?.trim()) return primary
  return `${primary}\n\n${guidance.trim()}`
}

function buildUserPrompt(input: string, samples: string[]): string {
  if (samples.length === 0) return input
  return `[style reference]\n${samples.join('\n')}\n\n--- text ---\n${input}`
}

function buildFolderPassUserPrompt(input: {
  input: string
  samples: string[]
  chainUpstreamContext?: string
  requiresFullUpstreamContext: boolean
  isPreviousInput: boolean
  userPromptSuffix?: string
}): string {
  const upstream = input.chainUpstreamContext?.trim()
  const base = buildUserPrompt(input.input, input.samples)
  const body = input.requiresFullUpstreamContext && input.isPreviousInput && upstream
    ? `[declared upstream context]\n${upstream}\n\n--- current input ---\n${base}`
    : base
  const suffix = input.userPromptSuffix?.trim()
  return suffix ? `${body}\n\n${suffix}` : body
}

function normalizePasses(value: unknown): Array<{ name?: string; input?: 'original' | 'previous' }> {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, 5)
    .map(item => {
      if (typeof item === 'string') return { name: item }
      if (!item || typeof item !== 'object') return {}
      const record = item as Record<string, unknown>
      const input = record.input === 'original' ? 'original' : 'previous'
      return {
        name: typeof record.name === 'string' ? record.name : undefined,
        input
      }
    })
}

function chooseSmartSamples(all: string[], input: string, count: number): string[] {
  const keywords = new Set<string>()
  for (const word of input.split(/\s+|。|！|？|，|、|；|：/)) {
    const normalized = word.trim()
    if (normalized.length < 2) continue
    keywords.add(normalized)
    for (let index = 0; index + 2 <= normalized.length; index += 1) {
      keywords.add(normalized.slice(index, index + 2))
    }
  }
  const scored = all
    .map((sample, index) => {
      let score = 0
      for (const keyword of keywords) {
        if (sample.includes(keyword)) score += keyword.length
      }
      return { sample, index, score }
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
  const matched = scored.filter(item => item.score > 0).slice(0, count)
  return (matched.length > 0 ? matched : scored.slice(0, count)).map(item => item.sample)
}

function applySampleBudget(samples: string[], totalLimit = 4000): string[] {
  const output: string[] = []
  let used = 0
  for (const sample of samples) {
    if (used + sample.length > totalLimit) {
      if (output.length === 0) output.push(sample.slice(0, totalLimit))
      break
    }
    output.push(sample)
    used += sample.length
  }
  return output
}

function normalizeTemplate(
  template: string,
  override: string | undefined,
  source: 'preProcess' | 'api.setTemplate',
  diagnostics: RealSkillDiagnostic[]
): string {
  if (typeof override !== 'string' || !override.trim()) return template
  const limited = override.slice(0, TEMPLATE_LIMIT)
  diagnostics.push(diagnostic(
    'info',
    'template-overridden',
    `${source === 'preProcess' ? 'preProcess' : 'api.setTemplate'} 覆盖了本轮模板${override.length > limited.length ? '，已截断到 20000 字符' : ''}`
  ))
  if (override.length > limited.length) {
    diagnostics.push(diagnostic('warning', 'template-truncated', '动态模板超过 20000 字符，已截断'))
  }
  return limited
}

function buildValidationErrorReport(errors: string[]): string {
  return errors.slice(0, 10).join('\n')
}

function buildFinalStepSchemaRetryFeedback(
  options: RealSkillExecuteOptions,
  errors: string[],
  candidate: string,
): string {
  const deaiFindings = options.finalStepRetry?.role === 'polish'
    ? collectFinalStepDeaiFindings(candidate)
    : undefined
  const result = buildFinalStepFeedback({
    errors,
    upstreamAnchors: options.finalStepRetry?.upstreamAnchors,
    deaiFindings: deaiFindings ?? options.finalStepRetry?.deaiFindings,
  })
  options.onFinalStepFeedbackComposed?.(result)
  return result.feedback
}

function collectFinalStepDeaiFindings(candidate: string): Array<{ code: string; label: string; message: string }> {
  if (!candidate.trim()) return []
  try {
    const report = DeAiProcessor.detectBody(candidate, {})
    return report.findings.slice(0, 10).map((finding: { id: string; type: string; suggestion: string }) => ({
      code: finding.id,
      label: finding.type,
      message: finding.suggestion
    }))
  } catch {
    return []
  }
}

/**
 * Folder skills own their template.md structure. In chain mode the app
 * nevertheless resolves the catalog template with live layer variables, so
 * extract those values and inject them into matching folder placeholders.
 */
function injectResolvedVariables(
  folderTemplate: string,
  variables: Record<string, unknown> | undefined,
  diagnostics: RealSkillDiagnostic[]
): string {
  const entries = Object.entries(variables || {})
    .map(([name, value]) => [name, value == null ? '' : String(value)] as const)
  let output = folderTemplate
  const missing: string[] = []
  const empty: string[] = []
  const placeholders = new Set(Array.from(output.matchAll(/\{\{\s*([A-Za-z_$][\w$-]*)\s*\}\}/g), match => match[1]))
  for (const [name, value] of entries) {
    if (!placeholders.has(name)) {
      missing.push(name)
      continue
    }
    if (!value.trim()) {
      empty.push(name)
      output = output.replace(new RegExp(`\\{\\{\\s*${name.replace(/[$]/g, '\\$')}\\s*\\}\\}`, 'g'), '未设置')
      continue
    }
    const pattern = new RegExp(`\\{\\{\\s*${name.replace(/[$]/g, '\\$')}\\s*\\}\\}`, 'g')
    if (!pattern.test(output)) {
      pattern.lastIndex = 0
      missing.push(name)
      continue
    }
    pattern.lastIndex = 0
    output = output.replace(pattern, () => value)
  }
  if (missing.length > 0) {
    diagnostics.push(diagnostic(
      'info',
      'folder-template-variables-missing',
      `folder template.md 缺少流水线变量：${missing.join('、')}`
    ))
  }
  if (empty.length > 0) {
    diagnostics.push(diagnostic(
      'info',
      'template-variable-empty',
      `folder template.md 变量为空，已渲染为“未设置”：${empty.join('、')}`
    ))
  }
  return output
}

function normalizePostIssues(value: unknown): Array<{ message: string; severity?: 'blocking' | 'non-blocking'; code?: string }> {
  if (!Array.isArray(value)) return []
  const issues: Array<{ message: string; severity?: 'blocking' | 'non-blocking'; code?: string }> = []
  for (const item of value) {
    if (typeof item === 'string') {
      if (item.trim()) issues.push({ message: item, severity: 'non-blocking' })
      continue
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    const message = String(record.message || record.reason || '').trim()
    if (!message) continue
    const rawSeverity = String(record.severity || record.level || '').toLowerCase()
    const severity = rawSeverity === 'blocking' || rawSeverity === 'error'
      ? 'blocking'
      : 'non-blocking'
    const code = String(record.code || '').trim()
    issues.push({
      message,
      severity,
      ...(code ? { code } : {})
    })
  }
  return issues.slice(0, 50)
}

function dispatchPassEvent(detail: {
  skillId: string
  index: number
  total: number
  name: string
  status: 'running' | 'done' | 'failed' | 'skipped'
  traceRunId?: string | null
}) {
  try {
    window.dispatchEvent(new CustomEvent('real-skill:pass', { detail }))
  } catch {
    // The pass event is diagnostic only; execution must continue without it.
  }
}

function dispatchStepEvent(detail: {
  skillId: string
  index: number
  total: number
  status: 'running' | 'done' | 'failed' | 'skipped'
  attempts?: number
  traceRunId?: string | null
}) {
  try {
    window.dispatchEvent(new CustomEvent('real-skill:step', { detail }))
  } catch {
    // Progress events are diagnostic only and must never affect execution.
  }
}

function dispatchToolSurfaceDeclarationAudit(audit: {
  type: 'dialogue-tool-surface-declaration'
  source: 'home' | 'outline'
  trigger: 'request-built'
  visibleToModel: boolean
  toolSurface: unknown
  text: string
  origin: 'application'
}) {
  try {
    window.dispatchEvent(new CustomEvent('real-skill:dialogue-tool-surface-declaration', { detail: audit }))
  } catch {
    // Audit events are diagnostic only; execution must continue without them.
  }
}

export async function executeRealSkill(options: RealSkillExecuteOptions): Promise<RealSkillExecutionResult> {
  const diagnostics: RealSkillDiagnostic[] = []
  const errors: string[] = []
  const loaded = await loadRealSkill(options.folderPath)
  if (!loaded.package) {
    const failure = loaded.failure || {
      code: loaded.error || 'skill-load-failed',
      message: 'SKILL 文件夹加载失败',
      folderPath: options.folderPath
    }
    return {
      status: 'failed',
      output: '',
      errors: [formatSkillFallback({ ...failure, skillId: options.skillId })],
      diagnostics: [
        diagnostic('error', 'skill-load-failed', formatSkillFallback({ ...failure, skillId: options.skillId })),
      ],
      folderPackageCache: false
    }
  }

  const pkg = loaded.package
  for (const warning of loaded.warnings || pkg.warnings || []) {
    diagnostics.push(diagnostic('warning', `folder-package:${warning.code}`, warning.message))
  }
  if (hasSkillAgentDefaults(pkg.meta.agent)) {
    diagnostics.push(diagnostic(
      'info',
      'skill-agent-ignored',
      'SKILL 包内 meta.agent 不再改变执行参数；提示词内容仅作为 guidance 追加'
    ))
  }
  const agent = mergeSkillAgentDefaults(options.agent, pkg.meta.agent, options.agentSource)
  const hasPipelineTemplate = (
    typeof options.baseTemplateOverride === 'string' && options.baseTemplateOverride.trim().length > 0
  ) || (
    typeof options.resolvedTemplate === 'string' && options.resolvedTemplate.trim().length > 0
  )
  if (!pkg.template.trim() && !hasPipelineTemplate) {
    return {
      status: 'failed',
      output: '',
      errors: ['template.md 为空，未调用 API'],
      diagnostics,
      folderPackageCache: loaded.folderPackageCache === true
    }
  }
  if (!pkg.template.trim() && hasPipelineTemplate) {
    diagnostics.push(diagnostic(
      'warning',
      'folder-template-missing',
      'folder template.md 为空，已回退使用流水线传入模板'
    ))
  }

  const preResult = await executeHook(pkg.script, 'preProcess', options.input, diagnostics)
  const preInput = typeof preResult.fields.input === 'string' && preResult.fields.input.length > 0
    ? preResult.fields.input
    : options.input
  const hasFolderTemplate = pkg.template.trim().length > 0
  const hasBaseTemplate = (
    typeof options.baseTemplateOverride === 'string' && options.baseTemplateOverride.trim().length > 0
  ) || (
    typeof options.resolvedTemplate === 'string' && options.resolvedTemplate.trim().length > 0
  )
  const useFolderTemplate = hasFolderTemplate
  const resolvedBaseTemplate = (
    options.baseTemplateOverride || options.resolvedTemplate || ''
  ).slice(0, TEMPLATE_LIMIT)
  if (useFolderTemplate && hasBaseTemplate) {
    diagnostics.push(diagnostic(
      'info',
      'folder-template-priority',
      '已优先执行 folder template.md，并注入流水线已解析的同名变量'
    ))
  } else if (hasBaseTemplate) {
    diagnostics.push(diagnostic(
      'info',
      'base-template-fallback',
      'folder 无有效模板，已使用流水线传入的基础模板'
    ))
  }
  const baseTemplate = hasBaseTemplate && !useFolderTemplate
    ? resolvedBaseTemplate
    : pkg.template
  const variableInjectedTemplate = useFolderTemplate && Object.keys(options.templateVariables || {}).length > 0
    ? injectResolvedVariables(pkg.template, options.templateVariables, diagnostics)
    : pkg.template
  // preProcess 只改写 input，不改写模板。compose 场景必须保留完整合并模板，
  // 否则多个 SKILL 合并后的 system prompt 会被 folder 自身 template 意外替换。
  let template = normalizeTemplate(
    useFolderTemplate ? variableInjectedTemplate : baseTemplate,
    preResult.templateOverride,
    'api.setTemplate',
    diagnostics
  )

  const sampleCount = Math.max(1, Math.min(5, Math.floor(pkg.meta.sampleCount ?? 3) || 3))
  const allSamples = loadSamples(pkg.samples, sampleCount, diagnostics)
  const samples = pkg.meta.smartSamples === true
    ? allSamples
    : allSamples.slice(0, sampleCount)
  const normalizedPasses = normalizePasses(pkg.meta.passes)
  const isMultiPass = pkg.meta.executionMode === 'multi-pass' && normalizedPasses.length > 0
  const passList = isMultiPass ? normalizedPasses : [{ name: 'default', input: 'original' as const }]
  const chainHandoffMeta = (pkg.meta.chainHandoff || {}) as {
    requiresFullUpstreamContext?: unknown
  }
  const declaredFullUpstream = chainHandoffMeta.requiresFullUpstreamContext === true
  const chainUpstreamContext = options.chainUpstreamContext?.trim() || ''
  let currentInput = preInput
  let output = ''
  let finishReason: string | undefined
  let providerId: string | undefined
  let usage: Record<string, unknown> | undefined
  let finalMaxTokens: number | null | undefined
  let finalReasoningText: string | undefined
  let finalContextBudget: NonNullable<RealSkillExecutionResult['apiMeta']>['contextBudget']
  let finalUsageReconciliation: unknown
  let finalTextOrigin: 'application' | 'model' | undefined
  let postProcessReport: RealSkillPostProcessReport | undefined
  let toolCalls: NonNullable<RealSkillExecutionResult['apiMeta']>['toolCalls']
  let toolResults: NonNullable<RealSkillExecutionResult['apiMeta']>['toolResults']
  let toolRequestDeltas: NonNullable<RealSkillExecutionResult['apiMeta']>['toolRequestDeltas']
  let toolAudit: NonNullable<RealSkillExecutionResult['apiMeta']>['toolAudit']
  const timingLedger = {
    requestBuildMs: 0,
    schemaValidateMs: 0,
    retryMs: 0,
    postProcessMs: 0,
    schemaRetryCount: 0,
    repeatedPromptBlocks: {} as Record<string, number>
  }
  const capturedRequestMessages: Array<{ role: string; content: string }> = []
  const capturedAttemptRequestMessages: Array<NonNullable<NonNullable<RealSkillExecutionResult['apiMeta']>['attemptRequestMessages']>[number]> = []
  let retainedCandidateIndex = 0

  function captureRequestMessages(
    messages: Array<{ role: string; content: string }>,
    passIndex: number,
    attempt: number
  ) {
    capturedRequestMessages.length = 0
    for (const message of messages || []) {
      capturedRequestMessages.push({
        role: String(message.role || ''),
        content: typeof message.content === 'string' ? message.content : ''
      })
    }
    capturedAttemptRequestMessages.push({
      passIndex,
      attempt,
      messages: capturedRequestMessages.map(message => ({ ...message }))
    })
  }

  for (let passIndex = 0; passIndex < passList.length; passIndex += 1) {
    const pass = passList[passIndex]
    postProcessReport = undefined
    capturedRequestMessages.length = 0
    const passName = pass.name || `第 ${passIndex + 1} 步`
    if (isMultiPass) {
      dispatchPassEvent({ skillId: pkg.id, index: passIndex, total: passList.length, name: passName, status: 'running', traceRunId: options.traceRunId })
    } else {
      dispatchStepEvent({ skillId: pkg.id, index: 0, total: 1, status: 'running', traceRunId: options.traceRunId })
    }
    const passInput = pass.input === 'previous' && output ? output : currentInput
    const isPreviousInput = pass.input === 'previous' && Boolean(output)
    if (declaredFullUpstream && isPreviousInput && !chainUpstreamContext) {
      diagnostics.push(diagnostic(
        'warning',
        'chain-upstream-context-empty',
        'SKILL 声明 requiresFullUpstreamContext，但上游上下文为空，已按 previous-only 口径继续'
      ))
    }
    const candidateLedger: Array<{ output: string; validation: { valid: boolean; errors: string[] }; attempt: number }> = []
    let schemaRetryFeedback: string | undefined

    for (let attempt = 1; attempt <= RETRY_LIMIT; attempt += 1) {
      const budgetStep = `real-skill:${options.skillId || pkg.id}${isMultiPass ? `:pass-${passIndex + 1}` : ''}`
      const budget = options.budget.tryConsume(budgetStep, pkg.meta.apiCallLimit ?? null)
      if (budget.status === 'blocked') {
        if (isMultiPass) {
          dispatchPassEvent({ skillId: pkg.id, index: passIndex, total: passList.length, name: passName, status: 'failed', traceRunId: options.traceRunId })
        }
        errors.push(budget.reason || 'API 调用预算已耗尽')
        diagnostics.push(diagnostic('error', 'api-budget-blocked', budget.reason || ''))
        return { status: 'blocked', output: '', errors, diagnostics, folderPackageCache: loaded.folderPackageCache === true }
      }

      const selectedSamples = pkg.meta.smartSamples === true
        ? applySampleBudget(chooseSmartSamples(allSamples, passInput, sampleCount), SMART_SAMPLE_CHAR_LIMIT)
        : samples
      const aiService = options.aiService || await getAiService()
      const systemPrompt = buildSystemPrompt(
        agent?.systemPrompt,
        pkg.body,
        template,
        pkg.resources,
        appendDialogueToolSurfaceDeclaration(
          options.systemPromptSuffix || '',
          options.toolSurface,
          {
            activeEditTask: options.activeEditTask,
            executionPlan: options.executionPlan,
          },
        ),
      )
      const declarationAudit = buildDialogueToolSurfaceDeclarationAudit({
        source: 'outline',
        toolSurface: options.toolSurface,
        activeEditTask: options.activeEditTask,
        executionPlan: options.executionPlan,
      })
      dispatchToolSurfaceDeclarationAudit(declarationAudit)
      const buildRequest = (promptSuffix?: string) => {
        const requestBuildStartedAt = Date.now()
        const effectiveSystemPrompt = promptSuffix
          ? `${systemPrompt}\n\n${promptSuffix}`
          : systemPrompt
        const userPrompt = buildFolderPassUserPrompt({
          input: passInput,
          samples: selectedSamples,
          chainUpstreamContext,
          requiresFullUpstreamContext: declaredFullUpstream,
          isPreviousInput,
          userPromptSuffix: options.userPromptSuffix
        })
        timingLedger.repeatedPromptBlocks = countRepeatedPromptBlocks(userPrompt)
        const messages = options.messageBuilder
          ? options.messageBuilder(effectiveSystemPrompt, userPrompt)
          : [
              { role: 'system', content: effectiveSystemPrompt },
              { role: 'user', content: userPrompt }
            ]
        const passMeasurement = buildFolderPassInputMeasurement({
          passIndex,
          inputMode: pass.input === 'previous' && output ? 'previous' : 'original',
          input: passInput,
          userPrompt,
          declaredFullUpstream,
          appliedFullUpstream: declaredFullUpstream && isPreviousInput && Boolean(chainUpstreamContext),
          systemPrompt: effectiveSystemPrompt,
          sampleCount: selectedSamples.length,
          isRetry: attempt > 1,
          traceRunId: options.traceRunId,
          traceCallId: options.traceCallId
        })
        try {
          window.dispatchEvent(new CustomEvent('real-skill:folder-pass-input', { detail: passMeasurement }))
        } catch {
          // Diagnostic only; request construction must continue.
        }
        captureRequestMessages(messages, passIndex, attempt)
        options.onRequestBuilt?.(messages)
        timingLedger.requestBuildMs += Date.now() - requestBuildStartedAt
        return messages
      }
      let requestMessages = buildRequest(schemaRetryFeedback)

      try {
        const callAiOnce = async (
          messages: Array<{ role: string; content: string }>,
          promptSuffix?: string,
          retryOptions?: {
            reasoningRetry?: RealSkillExecuteOptions['reasoningRetry']
            maxTokens?: number | null
            physicalPhase?: PhysicalCallPhase
            defaultPhysicalPhase?: PhysicalCallPhase
          }
        ) => {
          const budgetStep = `real-skill:${options.skillId || pkg.id}${isMultiPass ? `:pass-${passIndex + 1}` : ''}`
          const callBudget = options.budget.tryConsume(
            `${budgetStep}${promptSuffix ? ':direct-retry' : ''}`,
            pkg.meta.apiCallLimit ?? null
          )
          if (callBudget.status === 'blocked') {
            throw Object.assign(new Error(callBudget.reason || 'API 调用预算已耗尽'), { budgetBlocked: true })
          }
          return (await aiService.callAi({
            purpose: options.purpose || 'rewrite',
            providerId: agent?.providerId || options.providerId || undefined,
            messages,
            // Keep the caller's stream contract. Leaving undefined lets
            // aiService apply its purpose-based generate/rewrite default.
            stream: options.stream,
          physicalPhase: retryOptions?.physicalPhase ||
            retryOptions?.defaultPhysicalPhase ||
            (attempt > 1 ? 'schema_retry' : 'normal'),
          signal: options.signal,
          timeoutMs: options.timeoutMs,
          onChunk: options.onChunk,
          onReasoning: options.onReasoning,
          onPhysicalCall: options.onPhysicalCall as any,
          onProviderQueue: options.onProviderQueue,
          retry: true,
          model: agent?.model || undefined,
          temperature: attempt === RETRY_LIMIT
            ? Math.min((agent?.temperature ?? 0.7) + 0.05, 1.0)
            : agent?.temperature,
          maxTokens: retryOptions?.maxTokens ?? agent?.maxTokens,
          ...(retryOptions?.reasoningRetry === 'thinking_disabled'
            ? { reasoning: { mode: 'off' as const } }
            : {}),
          retryStrategy: retryOptions?.reasoningRetry,
          meta: {
            source: 'realSkillExecutor',
            projectId: options.toolContext?.projectId,
            workspace: options.toolContext?.workspace,
            targetId: options.toolContext?.targetId,
            readableTargets: options.toolContext?.readableTargets,
            skillId: pkg.id,
            agentId: agent?.id,
            step: attempt,
            providerSource: agent?.providerId ? 'agent' : options.providerSource
          },
            ...(options.tools?.length
            ? { tools: options.tools, toolPolicy: options.toolPolicy }
            : {})
          })) as { text: string; reasoning?: string; providerId?: string; providerType?: string; finishReason?: string; usage?: Record<string, unknown>; maxTokens?: number | null } & CallAiToolResultLike
        }

        let result = await callAiOnce(requestMessages, undefined, {
          defaultPhysicalPhase: attempt > 1 ? 'schema_retry' : 'normal'
        })
        let validity = classifyGenerationValidity({
          text: result.text,
          reasoning: (result as { reasoning?: string }).reasoning,
          finishReason: result.finishReason,
          usage: result.usage,
        maxTokens: result.maxTokens ?? agent?.maxTokens ?? null
        })

        if (!validity.usable && (validity.kind === 'reasoning_exhausted' || validity.kind === 'empty')) {
          diagnostics.push(diagnostic('error', `generation-invalid:${validity.kind}`, validity.message))
          options.onGenerationEvent?.({
            type: 'generation-invalid',
            kind: validity.kind,
            message: validity.message,
            reasoningLength: (result.reasoning || '').length,
            textLength: result.text.length,
          })
          const retryMessages = buildRequest(DIRECT_OUTPUT_SUFFIX)
          const retryStartedAt = Date.now()
          const reasoningControl = getProviderReasoningControl(result.providerType)
          const retryStrategy: NonNullable<Required<RealSkillExecuteOptions>['reasoningRetry']> = reasoningControl.supported
            ? 'thinking_disabled'
            : 'max_tokens_raised'
  const baseMaxTokens = Number(agent?.maxTokens) > 0 ? Number(agent?.maxTokens) : null
  const retryMaxTokens = retryStrategy === 'max_tokens_raised'
    ? Math.max(baseMaxTokens ?? 32_768, Math.round((baseMaxTokens ?? 32_768) * 1.5))
    : baseMaxTokens
          options.onGenerationEvent?.({
            type: 'direct-retry-start',
            kind: validity.kind,
            message: retryStrategy === 'thinking_disabled'
              ? '正文为空，已关闭模型思考并切换直出模式重试'
              : '正文为空，已提高输出上限并切换直出模式重试',
            retryStrategy,
          maxTokens: retryMaxTokens ?? null,
          })
          result = await callAiOnce(retryMessages, DIRECT_OUTPUT_SUFFIX, {
            reasoningRetry: retryStrategy,
            maxTokens: retryMaxTokens,
            physicalPhase: 'direct_retry',
          })
          validity = classifyGenerationValidity({
            text: result.text,
            reasoning: (result as { reasoning?: string }).reasoning,
            finishReason: result.finishReason,
            usage: result.usage,
          maxTokens: result.maxTokens ?? agent?.maxTokens ?? null
          })
          if (!validity.usable) {
            options.onGenerationEvent?.({
              type: 'direct-retry-finished',
              kind: validity.kind,
              message: GENERATION_VALIDITY_MESSAGES[validity.kind === 'reasoning_exhausted' ? 'reasoning_exhausted' : validity.kind],
              reasoningLength: (result.reasoning || '').length,
              textLength: result.text.length,
            durationMs: Date.now() - retryStartedAt,
            success: false,
            retryStrategy,
            maxTokens: result.maxTokens ?? retryMaxTokens,
            })
            throw new Error(GENERATION_VALIDITY_MESSAGES[validity.kind === 'reasoning_exhausted' ? 'reasoning_exhausted' : validity.kind])
          }
          options.onGenerationEvent?.({
            type: 'direct-retry-finished',
            kind: validity.kind,
            message: '直出模式重试后已生成正文',
            reasoningLength: (result.reasoning || '').length,
            textLength: result.text.length,
            durationMs: Date.now() - retryStartedAt,
            success: true,
            retryStrategy,
            maxTokens: result.maxTokens ?? retryMaxTokens,
          })
          timingLedger.retryMs += Date.now() - retryStartedAt
          diagnostics.push(diagnostic('warning', 'generation-direct-retry-recovered', '直出模式重试后已生成正文'))
        } else if (validity.kind === 'truncated') {
          diagnostics.push(diagnostic('warning', 'generation-truncated', validity.message))
          const continuationMessages = buildContinuationMessages(requestMessages, result.text)
          const continuation = await callAiOnce(continuationMessages, undefined, {
            physicalPhase: 'continuation',
          })
          const continuationValidity = classifyGenerationValidity({
            text: continuation.text,
            reasoning: (continuation as { reasoning?: string }).reasoning,
            finishReason: continuation.finishReason,
            usage: continuation.usage,
            maxTokens: agent?.maxTokens
          })
          result = {
            ...result,
            text: continuationValidity.usable
              ? mergeContinuationText(result.text, continuation.text)
              : result.text,
            reasoning: continuation.reasoning || result.reasoning,
            usage: continuation.usage || result.usage,
            // Only a completed continuation clears the provider truncation signal;
            // a second length result means the run is still physically truncated.
            finishReason: continuationValidity.usable && continuationValidity.kind === 'usable'
              ? continuation.finishReason
              : result.finishReason
          }
          if (!continuationValidity.usable || continuationValidity.kind === 'truncated') {
            diagnostics.push(diagnostic('warning', 'generation-truncated-after-continuation', '续写后输出仍不完整，已保留可用正文'))
          }
        }

        let candidateOutput = result.text || ''
        const postStartedAt = Date.now()
        const postInput = candidateOutput
        const postResult = await executeHook(pkg.script, 'postProcess', candidateOutput, diagnostics)
        if (typeof postResult.fields.output === 'string' && postResult.fields.output.length > 0) {
          candidateOutput = postResult.fields.output
        }
        const postIssues = normalizePostIssues(postResult.fields.issues)
        postProcessReport = {
          applied: true,
          changedOutput: candidateOutput !== postInput,
          output: candidateOutput,
          issues: postIssues.map(issue => ({
            severity: issue.severity === 'blocking' ? 'blocking' : 'warning',
            code: issue.code || 'post-process-issue',
            message: issue.message
          })),
          durationMs: Date.now() - postStartedAt
        }
        timingLedger.postProcessMs += Date.now() - postStartedAt
        for (const issue of postIssues) {
          const issueCode = issue.code ? `post-process-issue:${issue.code}` : 'post-process-issue'
          diagnostics.push(diagnostic(
            issue.severity === 'blocking' ? 'error' : 'warning',
            issueCode,
            `[${issue.severity}] ${issue.message}`
          ))
        }

        const schemaValidateStartedAt = Date.now()
        const hasPostValidation = typeof postResult.fields.valid === 'boolean' || postIssues.some(issue => issue.severity === 'blocking')
        const validation = hasPostValidation
          ? {
              valid: postResult.fields.valid === true && !postIssues.some(issue => issue.severity === 'blocking'),
              errors: Array.isArray(postResult.fields.errors)
                ? postResult.fields.errors.map(String)
                : typeof postResult.fields.message === 'string' ? [postResult.fields.message] : postIssues.filter(issue => issue.severity === 'blocking').map(issue => issue.message)
            }
          : pkg.schema
            ? validateSkillOutput(candidateOutput, { outputFormat: 'json', outputSchema: pkg.schema })
            : { valid: true, errors: [] }
        const hasBlockingPostIssue = postIssues.some(issue => issue.severity === 'blocking')
        timingLedger.schemaValidateMs += Date.now() - schemaValidateStartedAt
        if (!validation.valid && hasBlockingPostIssue) {
          const blockingErrors = postIssues
            .filter(issue => issue.severity === 'blocking')
            .map(issue => issue.message)
          const retryErrors = blockingErrors.length > 0 ? blockingErrors : ['postProcess 返回阻断性问题']
          const report = buildValidationErrorReport(retryErrors)
          candidateLedger.push({
            output: candidateOutput,
            validation: { valid: false, errors: retryErrors },
            attempt
          })
          if (options.finalStepRetry?.role === 'polish') {
            schemaRetryFeedback = buildFinalStepSchemaRetryFeedback(options, retryErrors, candidateOutput)
          } else {
            const feedback = buildSchemaRetryFeedback({ errors: retryErrors, previousOutput: candidateOutput })
            schemaRetryFeedback = feedback.feedback
            options.onSchemaRetryFeedbackComposed?.(feedback)
          }
          timingLedger.schemaRetryCount = Math.max(0, attempt - 1)
          errors.push(`第 ${attempt}/${RETRY_LIMIT} 次输出未通过 postProcess 校验：${report}`)
          diagnostics.push(diagnostic(
            'warning',
            'post-process-validation-failed',
            `尝试 ${attempt}/${RETRY_LIMIT}：${report}`
          ))
          dispatchStepEvent({
            skillId: pkg.id,
            index: passIndex,
            total: passList.length,
            status: attempt < RETRY_LIMIT ? 'running' : 'failed',
            attempts: attempt,
            traceRunId: options.traceRunId
          })
          continue
        }
        if (!validation.valid && options.validateOutputSchema) {
          candidateLedger.push({
            output: candidateOutput,
            validation: { valid: true, errors: [] },
            attempt
          })
          diagnostics.push(diagnostic(
            'warning',
            'schema-contract-warning',
            `非末步结构化契约未满足：${buildValidationErrorReport(validation.errors)}（保留候选输出，执行器状态降级，交由产物契约门裁决）`
          ))
          output = candidateOutput
          finishReason = result.finishReason
          providerId = result.providerId
          usage = result.usage
          finalMaxTokens = result.maxTokens ?? agent?.maxTokens
          if (isMultiPass) {
            dispatchPassEvent({ skillId: pkg.id, index: passIndex, total: passList.length, name: passName, status: 'done', traceRunId: options.traceRunId })
          }
          break
        }
        candidateLedger.push({ output: candidateOutput, validation, attempt })

        if (validation.valid) {
          output = candidateOutput
          finishReason = result.finishReason
          providerId = result.providerId
          usage = result.usage
          finalMaxTokens = result.maxTokens ?? agent?.maxTokens
          finalReasoningText = (result as CallAiToolResultLike).reasoning || finalReasoningText
          finalContextBudget = (result as CallAiToolResultLike).contextBudget || finalContextBudget
          finalUsageReconciliation = (result as CallAiToolResultLike).usageReconciliation ?? finalUsageReconciliation
          finalTextOrigin = (result as CallAiToolResultLike).textOrigin ?? finalTextOrigin
          toolCalls = (result as CallAiToolResultLike).toolCalls
          toolResults = (result as CallAiToolResultLike).toolResults
          toolRequestDeltas = (result as CallAiToolResultLike).toolRequestDeltas
          toolAudit = (result as CallAiToolResultLike).toolAudit
          if (isMultiPass) {
            dispatchPassEvent({ skillId: pkg.id, index: passIndex, total: passList.length, name: passName, status: 'done', traceRunId: options.traceRunId })
          }
          break
        }

        const report = buildValidationErrorReport(validation.errors)
        if (options.finalStepRetry?.role === 'polish') {
          schemaRetryFeedback = buildFinalStepSchemaRetryFeedback(options, validation.errors, candidateOutput)
        } else {
          const feedback = buildSchemaRetryFeedback({ errors: validation.errors, previousOutput: candidateOutput })
          schemaRetryFeedback = feedback.feedback
          options.onSchemaRetryFeedbackComposed?.(feedback)
        }
        timingLedger.schemaRetryCount = Math.max(0, attempt - 1)
        errors.push(`第 ${attempt}/${RETRY_LIMIT} 次输出未通过校验：${report}`)
        diagnostics.push(diagnostic('warning', 'schema-validation-failed', `尝试 ${attempt}/${RETRY_LIMIT}：${report}`))
        dispatchStepEvent({
          skillId: pkg.id,
          index: passIndex,
          total: passList.length,
          status: attempt < RETRY_LIMIT ? 'running' : 'failed',
          attempts: attempt,
          traceRunId: options.traceRunId
        })
      } catch (error: any) {
        if (isMultiPass) {
          dispatchPassEvent({ skillId: pkg.id, index: passIndex, total: passList.length, name: passName, status: 'failed', traceRunId: options.traceRunId })
        } else {
          dispatchStepEvent({ skillId: pkg.id, index: passIndex, total: passList.length, status: 'failed', attempts: attempt, traceRunId: options.traceRunId })
        }
        errors.push(error?.message || 'API 调用失败')
        diagnostics.push(diagnostic('error', 'api-failed', error?.message || ''))
        return {
          status: 'failed',
          output: '',
          errors,
          diagnostics,
          folderPackageCache: loaded.folderPackageCache === true,
          postProcessReport,
          apiMeta: {
            finishReason: finishReason || 'error',
            providerId,
            usage,
            maxTokens: finalMaxTokens,
            reasoningText: finalReasoningText || '',
            contextBudget: finalContextBudget,
            usageReconciliation: finalUsageReconciliation,
            textOrigin: finalTextOrigin,
            requestMessages: capturedRequestMessages,
            attemptRequestMessages: capturedAttemptRequestMessages,
            toolCalls,
            toolResults,
            toolRequestDeltas,
            toolAudit,
            timingLedger: { ...timingLedger }
          }
        }
      }
    }

    const retainedCandidate = candidateLedger.length
      ? candidateLedger.reduce((best, current) => {
          if (!best) return current
          if (best.validation.valid !== current.validation.valid) {
            return best.validation.valid ? best : current
          }
          if (best.validation.errors.length !== current.validation.errors.length) {
            return best.validation.errors.length <= current.validation.errors.length ? best : current
          }
          return best.attempt <= current.attempt ? best : current
        })
      : null
    retainedCandidateIndex = retainedCandidate
      ? candidateLedger.findIndex(item => item === retainedCandidate) + 1
      : 0
    if (!retainedCandidate || !retainedCandidate.validation.valid) {
      if (isMultiPass) {
        dispatchPassEvent({ skillId: pkg.id, index: passIndex, total: passList.length, name: passName, status: 'failed', traceRunId: options.traceRunId })
      } else {
        dispatchStepEvent({ skillId: pkg.id, index: passIndex, total: passList.length, status: 'failed', attempts: RETRY_LIMIT, traceRunId: options.traceRunId })
      }
      errors.push(`输出未通过校验，已达最大尝试次数 ${RETRY_LIMIT}`)
      if (retainedCandidate && candidateLedger.length > 1) {
        diagnostics.push(diagnostic(
          'warning',
          'schema-validation-best-candidate-retained',
          `重试耗尽后保留第 ${retainedCandidate.attempt}/${RETRY_LIMIT} 次候选（${retainedCandidate.validation.errors.length} 项失败）`
        ))
      }
      diagnostics.push(diagnostic('error', 'schema-validation-exhausted', '输出未通过校验，已达最大尝试次数'))
      return {
        status: 'degraded',
        output: retainedCandidate?.output || '',
        errors,
        diagnostics,
        folderPackageCache: loaded.folderPackageCache === true,
        postProcessReport,
        apiMeta: {
          finishReason,
          providerId,
          usage,
          maxTokens: finalMaxTokens,
          reasoningText: finalReasoningText || '',
          contextBudget: finalContextBudget,
          usageReconciliation: finalUsageReconciliation,
          textOrigin: finalTextOrigin,
          requestMessages: capturedRequestMessages,
          attemptRequestMessages: capturedAttemptRequestMessages,
          toolCalls,
          toolResults,
          toolRequestDeltas,
          toolAudit,
          timingLedger: { ...timingLedger },
          retainedCandidateIndex
        }
      }
    }
    currentInput = output
    if (!isMultiPass) {
      dispatchStepEvent({ skillId: pkg.id, index: 0, total: 1, status: 'done', attempts: 1, traceRunId: options.traceRunId })
    }
  }

  const status = diagnostics.some(isOutputDegradingWarning)
    ? 'degraded'
    : 'success'
  return {
    status,
    output,
    errors,
    diagnostics,
    folderPackageCache: loaded.folderPackageCache === true,
    postProcessReport,
    apiMeta: {
      finishReason,
      providerId,
      usage,
      maxTokens: finalMaxTokens,
      reasoningText: finalReasoningText || '',
      contextBudget: finalContextBudget,
      usageReconciliation: finalUsageReconciliation,
      textOrigin: finalTextOrigin,
      requestMessages: capturedRequestMessages,
      attemptRequestMessages: capturedAttemptRequestMessages,
      toolCalls,
      toolResults,
      toolRequestDeltas,
      toolAudit,
      timingLedger: { ...timingLedger },
      retainedCandidateIndex
    }
  }
}
