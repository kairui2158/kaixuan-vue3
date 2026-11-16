import { getAiService } from './aiService'
import type { PhysicalCallPhase } from './aiService'
import { AiServiceErrorImpl } from './aiService'
import {
  appendDialogueToolSurfaceDeclaration,
  buildDialogueToolSurfaceDeclarationAudit,
} from './dialogueToolSurface'
import { sanitizeSkillGuidance } from './skillGuidanceSanitizer'
import { DeAiSamples } from './deai-samples.js'
import { resolveChapterNarrativeBlock } from './chapterEventDensity'
import { collectDeaiFindingsWithObservability } from './de-ai'
import { classifyGenerationValidity, GENERATION_VALIDITY_MESSAGES } from './generationValidity'
import { isContinuationSelfCheckText } from './continuationSelfCheck'
import { getProviderReasoningControl } from './providerProtocols'
import { loadRealSkill } from './realSkillLoader'
import { formatSkillFallback } from './skillRouter'
import { REPEATED_PROMPT_BLOCK_MARKERS } from './promptBlockProtocol'
import { buildFinalStepFeedback } from './finalStepFeedback'
import { buildSchemaRetryFeedback } from './schemaRetryFeedback'
import {
  isProtectedSkillContract,
  measureProtectedBodyCandidate,
  protectedContractText,
  validateProtectedBodyCandidate,
  type ProtectedSkillContract,
  type ProtectedBodyCandidateMeasurement
} from './protectedSkillContract'
import { validateSkillOutput } from './skillValidation'
import type {
  RealSkillAgentContext,
  RealSkillCandidateLedgerEntry,
  RealSkillDiagnostic,
  RealSkillExecuteOptions,
  RealSkillExecutionResult,
  RealSkillMeta,
  RealSkillPostProcessReport,
  RealSkillResource,
} from './realSkillTypes'

export type { RealSkillDiagnostic } from './realSkillTypes'


const ALLOWED_PRE_FIELDS = new Set(['input', 'template', 'samples'])
const ALLOWED_POST_FIELDS = new Set(['output', 'valid', 'message', 'errors', 'issues', 'warnings', '_perf'])
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

function fnv1a32(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a32_${(hash >>> 0).toString(16).padStart(8, '0')}`
}

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

function consumeBudgetPhysicalRetry(
  budget: RealSkillExecuteOptions['budget'],
  step: string,
  skillLimit?: number | null,
): void {
  const consume = budget.consumePhysicalRetry
  if (!consume) return
  const decision = consume(step, skillLimit)
  if (decision.status === 'blocked') {
    throw Object.assign(
      new Error(decision.reason || 'API 调用预算已耗尽'),
      { budgetBlocked: true }
    )
  }
}

function diagnostic(
  type: RealSkillDiagnostic['type'],
  code: string,
  message: string
): RealSkillDiagnostic {
  return { type, code, message, at: new Date().toISOString() }
}

function describeFingerprintList(list: Array<{ file: string; hash: string; mtime: number; bytes: number }>): string {
  if (!list.length) return '(空)'
  return list.map(item => `${item.file}@${item.hash.slice(0, 8)}:${item.mtime}:${item.bytes}`).join(', ')
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
      content: `以下是未完成输出的最后部分，请从中断处自然续写，不要重复已有内容，也不要重新输出开头，也不要输出任何【续写检查】等协议标记：\n${tail}`
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
  protectedContractText?: string
}): string {
  const upstream = input.chainUpstreamContext?.trim()
  const base = buildUserPrompt(input.input, input.samples)
  const body = input.requiresFullUpstreamContext && input.isPreviousInput && upstream
    ? `[declared upstream context]\n${upstream}\n\n--- current input ---\n${base}`
    : base
  const suffix = input.userPromptSuffix?.trim()
  const protectedSuffix = input.protectedContractText?.trim()
  const prompt = suffix ? `${body}\n\n${suffix}` : body
  if (!protectedSuffix) return prompt
  // Idempotent injection: upstream input may already carry the same contract
  // after preProcess. Keep one copy so the terminal instruction is not doubled.
  return prompt.includes(protectedSuffix) ? prompt : `${prompt}\n\n${protectedSuffix}`
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
  diagnostics: RealSkillDiagnostic[],
): string {
  const deaiDetection = options.finalStepRetry?.deaiDetection ?? 'on'
  const deaiFindings = options.finalStepRetry?.role === 'polish' && deaiDetection === 'on'
    ? collectFinalStepDeaiFindings(candidate, diagnostics)
    : undefined
  const result = buildFinalStepFeedback({
    errors,
    upstreamAnchors: options.finalStepRetry?.upstreamAnchors,
    deaiFindings: deaiFindings ?? options.finalStepRetry?.deaiFindings,
  })
  options.onFinalStepFeedbackComposed?.({ ...result, kind: 'retry' })
  return result.feedback
}

/**
 * Normal final steps have no failure feedback to inject. DEAI findings remain
 * teaching-only observability: the composed result is reported to the caller
 * and never changes status, errors, output, or retries.
 */
function composeFinalStepTeachingFeedback(
  options: RealSkillExecuteOptions,
  candidate: string,
  diagnostics: RealSkillDiagnostic[],
): void {
  const deaiDetection = options.finalStepRetry?.deaiDetection ?? 'on'
  if (deaiDetection === 'off') return
  const result = buildFinalStepFeedback({
    errors: [],
    upstreamAnchors: options.finalStepRetry?.upstreamAnchors,
    deaiFindings: collectFinalStepDeaiFindings(candidate, diagnostics)
  })
  if (result.sourceCounts.deai > 0) {
    options.onFinalStepFeedbackComposed?.({ ...result, kind: 'teaching' })
  }
}

function collectFinalStepDeaiFindings(
  candidate: string,
  diagnostics: RealSkillDiagnostic[],
): Array<{ code: string; label: string; message: string }> {
  if (!candidate.trim()) return []
  const result = collectDeaiFindingsWithObservability(candidate, message => {
    diagnostics.push(diagnostic('warning', 'quality_gate_degraded', `终步降AI检测失败：${message}`))
  })
  if (result.degraded) {
    return [{ code: 'quality_gate_degraded', label: '降AI门禁降级', message: `终步降AI检测失败：${result.degradedReason}` }]
  }
  return result.findings.slice(0, 10).map((finding: unknown) => {
    const item = finding as { id?: string; type?: string; suggestion?: string }
    return {
      code: item.id || item.type || 'unknown',
      label: item.type || item.id || 'unknown',
      message: item.suggestion || ''
    }
  })
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
  const ignoredSpans: Array<{ start: number; end: number }> = []
  const fencePattern = /(?:```|~~~)[\s\S]*?(?:```|~~~|$)/g
  for (const match of folderTemplate.matchAll(fencePattern)) {
    ignoredSpans.push({ start: match.index, end: match.index + match[0].length })
  }
  const inlinePattern = /`[^`\n]*`/g
  for (const match of folderTemplate.matchAll(inlinePattern)) {
    const start = match.index
    const end = start + match[0].length
    if (!ignoredSpans.some(span => start >= span.start && end <= span.end)) {
      ignoredSpans.push({ start, end })
  }
  }
  const isIgnoredLiteral = (index: number) => ignoredSpans.some(
    span => index >= span.start && index < span.end
  )
  const entries = Object.entries(variables || {})
    .map(([name, value]) => [name, value == null ? '' : String(value)] as const)
  const missing: string[] = []
  const empty: string[] = []
  const placeholderPattern = /\{\{\s*([A-Za-z_$][\w$-]*)\s*\}\}/g
  const placeholders = new Set(Array.from(folderTemplate.matchAll(placeholderPattern), match => ({
    name: match[1],
    offset: match.index
  })).filter(({ offset }) => !isIgnoredLiteral(offset)).map(({ name }) => name))
  for (const [name, value] of entries) {
    if (!placeholders.has(name)) {
      missing.push(name)
      continue
    }
    if (!value.trim()) empty.push(name)
  }
  const output = folderTemplate.replace(placeholderPattern, (placeholder, name: string, offset: number) => {
    if (isIgnoredLiteral(offset)) return placeholder
    const entry = entries.find(([entryName]) => entryName === name)
    if (!entry) return placeholder
    return entry[1].trim() ? entry[1] : '未设置'
  })
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
  const unresolved = Array.from(placeholders).filter(name => !entries.some(([entryName]) => entryName === name))
  if (unresolved.length > 0) {
    diagnostics.push(diagnostic(
      'error',
      'template-placeholder-unresolved',
      `folder template.md 存在未被注入的占位符：${[...new Set(unresolved)].join('、')}。已阻止请求发出，请检查调用方是否提供全部模板变量。`
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
  const loaded = await loadRealSkill(options.folderPath, {
    pinnedFingerprint: options.pinnedFingerprint
  })
  if (!loaded.package) {
    if (loaded.error === 'skill_version_mismatch' && loaded.pinMismatch) {
      options.onSkillVersionMismatch?.(loaded.pinMismatch)
      const detail = `运行基准 ${describeFingerprintList(loaded.pinMismatch.expected)}；磁盘现状 ${describeFingerprintList(loaded.pinMismatch.actual)}`
      errors.push(`SKILL 目录内容与运行基准不一致，已阻止本次调用：${detail}`)
      diagnostics.push(diagnostic('error', 'skill_version_mismatch', detail))
      return {
        status: 'failed',
        output: '',
        errors,
        diagnostics,
        folderPackageCache: false
      }
    }
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
  const pinnedFingerprint = options.pinnedFingerprint
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
  const protectedContract = isProtectedSkillContract(options.protectedContract)
    ? options.protectedContract
    : null
  const activeProtectedContractText = protectedContract ? protectedContractText(protectedContract) : ''
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
  const variableInjectedTemplate = useFolderTemplate
    ? injectResolvedVariables(pkg.template, options.templateVariables, diagnostics)
    : pkg.template
  if (diagnostics.some(item => item.code === 'template-placeholder-unresolved')) {
    return {
      status: 'failed',
      output: '',
      errors: ['folder template.md 存在未解析占位符，已阻止请求发出'],
      diagnostics,
      folderPackageCache: loaded.folderPackageCache === true
    }
  }
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
  let retainedCandidateBlocking = false
  const candidateAuditLedger: RealSkillCandidateLedgerEntry[] = []
  let bodyCandidateLedger: NonNullable<RealSkillExecutionResult['apiMeta']>['bodyCandidateLedger']
  let bodyCandidateRetention: NonNullable<RealSkillExecutionResult['apiMeta']>['bodyCandidateRetention']

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
    const candidateLedger: Array<{
      output: string
      validation: { valid: boolean; errors: string[] }
      attempt: number
      measurement: ProtectedBodyCandidateMeasurement | null
      audit: RealSkillCandidateLedgerEntry
    }> = []
    let schemaRetryFeedback: string | undefined

    for (let attempt = 1; attempt <= RETRY_LIMIT; attempt += 1) {
      if (pinnedFingerprint) {
        const pinCheck = await loadRealSkill(options.folderPath, { pinnedFingerprint })
        if (!pinCheck.package) {
          const mismatch = pinCheck.pinMismatch
          const detail = mismatch
            ? `运行基准 ${describeFingerprintList(mismatch.expected)}；磁盘现状 ${describeFingerprintList(mismatch.actual)}`
            : String(pinCheck.failure?.message || pinCheck.error || 'SKILL 校验失败')
          options.onSkillVersionMismatch?.(mismatch || {
            folderPath: options.folderPath,
            expected: pinnedFingerprint,
            actual: []
          })
          errors.push(`SKILL 目录内容与运行基准不一致，已阻止第 ${attempt} 次调用：${detail}`)
          diagnostics.push(diagnostic('error', 'skill_version_mismatch', detail))
          return {
            status: 'failed',
            output: '',
            errors,
            diagnostics,
            folderPackageCache: false
          }
        }
      }
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
          userPromptSuffix: options.userPromptSuffix,
          protectedContractText: activeProtectedContractText
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
      if (protectedContract) {
        const missingContract = requestMessages.every(message =>
          !String(message.content || '').includes(activeProtectedContractText)
        )
        if (missingContract) {
          errors.push('受保护正文契约未进入最终请求，已阻止本次 API 调用')
          diagnostics.push(diagnostic(
            'error',
            'protected-contract-missing',
            `执行器无法将受保护契约注入最终请求：${activeProtectedContractText}`
          ))
          return {
            status: 'failed',
            output: '',
            errors,
            diagnostics,
            folderPackageCache: loaded.folderPackageCache === true,
            apiMeta: {
              finishReason: 'error',
              requestMessages: capturedRequestMessages,
              attemptRequestMessages: capturedAttemptRequestMessages,
              timingLedger: { ...timingLedger }
            }
          }
        }
      }

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
          const resolvedProviderModel = options.providerModel !== undefined
            ? String(options.providerModel || '')
            : (agent?.model || undefined)
          if (options.providerModel !== undefined && !resolvedProviderModel) {
            throw Object.assign(
              new Error(`供应商「${options.providerId || '默认供应商'}」未配置可用模型，已停止本次请求；请先在该供应商中选择模型。`),
              { requestProfileBlocked: true }
            )
          }
          const physicalRetryStep = `${options.skillId || pkg.id}:${passIndex + 1}:attempt-${attempt}:physical`
          const reportedPhysicalCallIds = new Set<string>()
          const onPhysicalCall = (event: import('./aiService').PhysicalCallEvent) => {
            const physicalCallId = event.physicalCallId ||
              `${event.phase}:${event.attempt}:${event.status === 'running' ? 'start' : 'finish'}`
            if (!reportedPhysicalCallIds.has(physicalCallId)) {
              reportedPhysicalCallIds.add(physicalCallId)
              if (
                event.phase === 'retry' ||
                event.phase === 'heartbeat_retry' ||
                event.phase === 'direct_retry' ||
                event.phase === 'continuation'
              ) {
                consumeBudgetPhysicalRetry(options.budget, physicalRetryStep, pkg.meta.apiCallLimit ?? null)
              }
            }
            options.onPhysicalCall?.(event)
          }
          return (await aiService.callAi({
            purpose: options.purpose || 'rewrite',
            providerId: options.providerId || agent?.providerId || undefined,
            messages,
            // Keep the caller's stream contract. Leaving undefined lets
            // aiService apply its purpose-based generate/rewrite default.
            stream: options.stream,
          physicalPhase: retryOptions?.physicalPhase ||
            retryOptions?.defaultPhysicalPhase ||
            (attempt > 1 ? 'schema_retry' : 'normal'),
          signal: options.signal,
          timeoutMs: options.timeoutMs,
          onChunk: (text: string) => {
            options.onChunk?.(text)
            if (options.traceRunId && options.traceCallId && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
              window.dispatchEvent(new CustomEvent('real-skill:stream', {
                detail: {
                  traceRunId: options.traceRunId,
                  traceCallId: options.traceCallId,
                  text
                }
              }))
            }
          },
          onReasoning: options.onReasoning,
          onPhysicalCall,
          onProviderQueue: options.onProviderQueue,
          retry: true,
          model: resolvedProviderModel,
          contextComposition: options.contextLayer
            ? {
            layer: options.contextLayer,
              step: passIndex,
              providerId: options.providerId || agent?.providerId || undefined,
              model: resolvedProviderModel,
              // Phase 0 observes composition only. System prompts are
              // known-stable candidates; user prompts stay fully variable.
              stableSystemPrefix: systemPrompt,
              stableUserPrefix: ''
            }
            : undefined,
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
            providerSource: options.providerId
              ? options.providerSource
              : (agent?.providerId ? 'agent' : undefined),
            modelSource: options.providerModelSource
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
            const generationError = new Error(GENERATION_VALIDITY_MESSAGES[validity.kind === 'reasoning_exhausted' ? 'reasoning_exhausted' : validity.kind])
            if (validity.kind === 'reasoning_exhausted') {
              ;(generationError as Error & { generationValidityKind?: 'reasoning_exhausted' })
                .generationValidityKind = 'reasoning_exhausted'
            }
            throw generationError
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
          if (isContinuationSelfCheckText(continuation.text)) {
            result = {
              ...result,
              reasoning: continuation.reasoning || result.reasoning,
              usage: continuation.usage || result.usage,
              finishReason: 'stop'
            }
            diagnostics.push(diagnostic(
              'warning',
              'continuation-self-check-skipped',
              '续写调用返回自检注释，已按协议终点处理并保留原候选正文'
            ))
            const truncatedIndex = diagnostics.findIndex(item =>
              item.code === 'generation-truncated' ||
              item.code === 'generation-truncated-after-continuation'
            )
            if (truncatedIndex !== -1) diagnostics.splice(truncatedIndex, 1)
        } else {
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
            const truncatedIndex = diagnostics.findIndex(item =>
              item.code === 'generation-truncated' ||
              item.code === 'generation-truncated-after-continuation'
            )
            if (truncatedIndex !== -1) diagnostics.splice(truncatedIndex, 1)
          }
          if (!continuationValidity.usable || continuationValidity.kind === 'truncated') {
            diagnostics.push(diagnostic('warning', 'generation-truncated-after-continuation', '续写后输出仍不完整，已保留可用正文'))
          }
        }

        let candidateOutput = result.text || ''
        const narrativeBlock = resolveChapterNarrativeBlock(candidateOutput)
        if (narrativeBlock) {
          diagnostics.push(diagnostic(
            'error',
            narrativeBlock.code,
            `${narrativeBlock.gap}${narrativeBlock.guidance}`
          ))
          return {
            status: 'blocked',
            output: candidateOutput,
            errors: [`${narrativeBlock.gap}；${narrativeBlock.guidance}`],
            diagnostics,
            folderPackageCache: loaded.folderPackageCache === true,
            postProcessReport,
            apiMeta: {
              finishReason: result.finishReason,
              providerId: result.providerId,
              usage: result.usage,
              maxTokens: result.maxTokens ?? agent?.maxTokens,
              reasoningText: (result as { reasoning?: string }).reasoning || finalReasoningText || '',
              contextBudget: (result as CallAiToolResultLike).contextBudget || finalContextBudget,
              usageReconciliation: (result as CallAiToolResultLike).usageReconciliation ?? finalUsageReconciliation,
              textOrigin: (result as CallAiToolResultLike).textOrigin ?? finalTextOrigin,
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
        const postStartedAt = Date.now()
        const postInput = candidateOutput
        const postResult = await executeHook(pkg.script, 'postProcess', {
          output: candidateOutput,
          usage: result.usage
        }, diagnostics)
        if (typeof postResult.fields.output === 'string' && postResult.fields.output.length > 0) {
          candidateOutput = postResult.fields.output
        }
        const postIssues = normalizePostIssues(postResult.fields.issues)
        const protectedBodyViolation = protectedContract?.kind === 'body'
          ? validateProtectedBodyCandidate(candidateOutput, protectedContract)
          : null
        if (protectedBodyViolation) {
          postIssues.push({
            code: 'protected-body-contract',
            message: protectedBodyViolation.message,
            severity: 'blocking'
          })
        }
        const rawPerf = postResult.fields._perf
        const rawWarnings = postResult.fields.warnings
        const perf: RealSkillPostProcessReport['perf'] = isPlainObject(rawPerf)
          && typeof rawPerf.warning === 'string'
          && rawPerf.warning.length > 0
          && Number.isFinite(rawPerf.ratio)
          && rawPerf.blocking === false
          ? { warning: rawPerf.warning, ratio: rawPerf.ratio as number, blocking: false as const }
          : result.usage
            ? 'thresholdNotMet'
            : 'usageUnavailable'
        postProcessReport = {
          applied: true,
          changedOutput: candidateOutput !== postInput,
          output: candidateOutput,
          warnings: Array.isArray(rawWarnings)
            ? rawWarnings
              .filter((item): item is string => typeof item === 'string')
              .map(item => item.trim())
              .filter(Boolean)
            : [],
          issues: postIssues.map(issue => ({
            severity: issue.severity === 'blocking' ? 'blocking' : 'warning',
            code: issue.code || 'post-process-issue',
            message: issue.message
          })),
          durationMs: Date.now() - postStartedAt,
          ruleFingerprint: fnv1a32(pkg.script),
          perf
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
        const candidateErrorMessages = validation.valid
          ? []
          : hasBlockingPostIssue
            ? postIssues.filter(issue => issue.severity === 'blocking').map(issue => issue.message)
            : validation.errors
        const candidateErrorCount = validation.valid
          ? 0
          : hasBlockingPostIssue
            ? postIssues.filter(issue => issue.severity === 'blocking').length
            : validation.errors.length
        const candidateIssueCodes = postIssues.map(issue => issue.code || 'post-process-issue')
        const candidateAudit = {
          passIndex,
          attempt,
          rawChars: result.text.length,
          output: candidateOutput,
          sourceResponseHash: fnv1a32(result.text),
          valid: validation.valid,
          schemaValidationValid: validation.valid,
          errorCount: candidateErrorCount,
          errors: candidateErrorMessages,
          postProcessIssueCodes: candidateIssueCodes,
          retained: false
        }
        if (!validation.valid && hasBlockingPostIssue) {
          retainedCandidateBlocking = true
          const blockingErrors = postIssues
            .filter(issue => issue.severity === 'blocking')
            .map(issue => issue.message)
          const retryErrors = blockingErrors.length > 0 ? blockingErrors : ['postProcess 返回阻断性问题']
          const report = buildValidationErrorReport(retryErrors)
          candidateLedger.push({
            output: candidateOutput,
            validation: { valid: false, errors: retryErrors },
            attempt,
            measurement: protectedContract?.kind === 'body'
              ? measureProtectedBodyCandidate(candidateOutput, protectedContract)
              : null,
            audit: {
              ...candidateAudit,
              errors: retryErrors,
              errorCount: retryErrors.length
            }
          })
          candidateAuditLedger.push(candidateLedger[candidateLedger.length - 1].audit)
          if (options.finalStepRetry?.role === 'polish') {
            schemaRetryFeedback = buildFinalStepSchemaRetryFeedback(options, retryErrors, candidateOutput, diagnostics)
          } else {
            const feedback = buildSchemaRetryFeedback({
              errors: retryErrors,
              previousOutput: candidateOutput,
              chainUpstreamContext,
              protectedContract: protectedContract || undefined
            })
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
          retainedCandidateBlocking = false
          candidateLedger.push({
            output: candidateOutput,
            validation: { valid: true, errors: [] },
            attempt,
            measurement: protectedContract?.kind === 'body'
              ? measureProtectedBodyCandidate(candidateOutput, protectedContract)
              : null,
            audit: {
              ...candidateAudit,
              valid: true,
              schemaValidationValid: false,
              errors: validation.errors,
              errorCount: validation.errors.length
            }
          })
          candidateAuditLedger.push(candidateLedger[candidateLedger.length - 1].audit)
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
        retainedCandidateBlocking = false
        candidateLedger.push({
          output: candidateOutput,
          validation,
          attempt,
          measurement: protectedContract?.kind === 'body'
            ? measureProtectedBodyCandidate(candidateOutput, protectedContract)
            : null,
          audit: {
            ...candidateAudit,
            errors: validation.valid ? [] : validation.errors,
            errorCount: validation.valid ? 0 : validation.errors.length
          }
        })
        candidateAuditLedger.push(candidateLedger[candidateLedger.length - 1].audit)

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
          if (options.finalStepRetry?.role === 'polish') {
            composeFinalStepTeachingFeedback(options, candidateOutput, diagnostics)
          }
          if (isMultiPass) {
            dispatchPassEvent({ skillId: pkg.id, index: passIndex, total: passList.length, name: passName, status: 'done', traceRunId: options.traceRunId })
          }
          break
        }

        const report = buildValidationErrorReport(validation.errors)
        if (options.finalStepRetry?.role === 'polish') {
          schemaRetryFeedback = buildFinalStepSchemaRetryFeedback(options, validation.errors, candidateOutput, diagnostics)
        } else {
          const feedback = buildSchemaRetryFeedback({
            errors: validation.errors,
            previousOutput: candidateOutput,
            chainUpstreamContext,
            protectedContract: protectedContract || undefined
          })
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
        if (
          error instanceof AiServiceErrorImpl &&
          (error.kind === 'auth' || error.statusCode === 401 || error.statusCode === 403)
        ) {
          if (isMultiPass) {
            dispatchPassEvent({ skillId: pkg.id, index: passIndex, total: passList.length, name: passName, status: 'failed', traceRunId: options.traceRunId })
          } else {
            dispatchStepEvent({ skillId: pkg.id, index: passIndex, total: passList.length, status: 'failed', traceRunId: options.traceRunId })
          }
          errors.push(error?.message || '供应商认证或凭证不可用')
          diagnostics.push(diagnostic('error', 'api-terminal-auth-error', error?.message || ''))
          return {
            status: 'failed',
            terminalApiError: true,
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
              timingLedger: { ...timingLedger },
              candidateLedger: candidateAuditLedger
            }
          }
        }
        if (error?.budgetBlocked === true) {
          if (isMultiPass) {
            dispatchPassEvent({ skillId: pkg.id, index: passIndex, total: passList.length, name: passName, status: 'failed', traceRunId: options.traceRunId })
          } else {
            dispatchStepEvent({ skillId: pkg.id, index: 0, total: 1, status: 'failed', attempts: attempt, traceRunId: options.traceRunId })
          }
          errors.push(error?.message || 'API 调用预算已耗尽')
          diagnostics.push(diagnostic('error', 'api-budget-blocked', error?.message || ''))
          return {
            status: 'blocked',
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
              timingLedger: { ...timingLedger },
              candidateLedger: candidateAuditLedger
            }
          }
        }
        if (isMultiPass) {
          dispatchPassEvent({ skillId: pkg.id, index: passIndex, total: passList.length, name: passName, status: 'failed', traceRunId: options.traceRunId })
        } else {
          dispatchStepEvent({ skillId: pkg.id, index: passIndex, total: passList.length, status: 'failed', attempts: attempt, traceRunId: options.traceRunId })
        }
        errors.push(error?.message || 'API 调用失败')
        diagnostics.push(diagnostic('error', 'api-failed', error?.message || ''))
        const terminalGenerationError = (error as Error & {
          generationValidityKind?: 'reasoning_exhausted'
        }).generationValidityKind === 'reasoning_exhausted'
        return {
          status: 'failed',
          ...(terminalGenerationError ? { terminalApiError: true } : {}),
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
            timingLedger: { ...timingLedger },
            candidateLedger: candidateAuditLedger
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
          if (protectedContract?.kind === 'body') {
            const bestMissingHandoff = best.measurement?.missingHandoff ?? true
            const currentMissingHandoff = current.measurement?.missingHandoff ?? true
            if (bestMissingHandoff !== currentMissingHandoff) {
              return currentMissingHandoff ? best : current
            }
            const bestDistance = best.measurement?.contractDistance ?? Number.POSITIVE_INFINITY
            const currentDistance = current.measurement?.contractDistance ?? Number.POSITIVE_INFINITY
            if (bestDistance !== currentDistance) {
              return bestDistance <= currentDistance ? best : current
            }
          }
          if (best.validation.errors.length !== current.validation.errors.length) {
            return best.validation.errors.length <= current.validation.errors.length ? best : current
          }
          return best.attempt <= current.attempt ? best : current
        })
      : null
    bodyCandidateLedger = protectedContract?.kind === 'body'
      ? candidateLedger.map(candidate => ({
        attempt: candidate.attempt,
        rawChars: candidate.measurement?.rawChars ?? candidate.output.length,
        netWords: candidate.measurement?.netWords ?? 0,
        handoffCount: candidate.measurement?.handoffCount ?? 0,
        contractDistance: candidate.measurement?.contractDistance ?? 0,
        missingHandoff: candidate.measurement?.missingHandoff ?? false,
        valid: candidate.validation.valid,
        errorCount: candidate.validation.errors.length
      }))
      : undefined
    retainedCandidateIndex = retainedCandidate
      ? candidateLedger.findIndex(item => item === retainedCandidate) + 1
      : 0
    candidateAuditLedger.forEach((entry, index) => {
      entry.retained = retainedCandidateIndex === index + 1
    })
    bodyCandidateRetention = protectedContract?.kind === 'body' && retainedCandidate
      ? {
        retainedCandidateIndex,
        retainedAttempt: retainedCandidate.attempt,
        retainedReason: retainedCandidate.validation.valid
          ? 'first-valid-candidate'
          : [
            retainedCandidate.measurement?.missingHandoff ? 'missing-handoff' : null,
            retainedCandidate.measurement ? `net-words:${retainedCandidate.measurement.netWords}` : null,
            retainedCandidate.measurement ? `contract-distance:${retainedCandidate.measurement.contractDistance}` : null,
            `errors:${retainedCandidate.validation.errors.length}`
          ].filter(Boolean).join('|')
      }
      : undefined
    if (!retainedCandidate || !retainedCandidate.validation.valid) {
      const blockingGateFailed = Boolean(retainedCandidate) && retainedCandidateBlocking
      if (isMultiPass) {
        dispatchPassEvent({ skillId: pkg.id, index: passIndex, total: passList.length, name: passName, status: 'failed', traceRunId: options.traceRunId })
      } else {
        dispatchStepEvent({ skillId: pkg.id, index: passIndex, total: passList.length, status: 'failed', attempts: RETRY_LIMIT, traceRunId: options.traceRunId })
      }
      errors.push(`输出未通过校验，已达最大尝试次数 ${RETRY_LIMIT}`)
      if (retainedCandidate && candidateLedger.length > 1) {
        const measurement = retainedCandidate.measurement
        diagnostics.push(diagnostic(
          'warning',
          'schema-validation-best-candidate-retained',
          `重试耗尽后保留第 ${retainedCandidate.attempt}/${RETRY_LIMIT} 次候选（${retainedCandidate.validation.errors.length} 项失败${measurement ? `，净字数 ${measurement.netWords}，距离正文下限 ${measurement.contractDistance}` : ''}）`
        ))
      }
      diagnostics.push(diagnostic('error', 'schema-validation-exhausted', '输出未通过校验，已达最大尝试次数'))
      return {
        status: blockingGateFailed ? 'failed' : 'degraded',
        blockingGateFailed,
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
            retainedCandidateIndex,
            candidateLedger: candidateAuditLedger,
            bodyCandidateLedger,
            bodyCandidateRetention
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
    blockingGateFailed: false,
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
        retainedCandidateIndex,
        candidateLedger: candidateAuditLedger,
        bodyCandidateLedger,
        bodyCandidateRetention
    }
  }
}
