import { getAiService } from './aiService'
import { createApiCallBudget } from './apiCallBudget'
import { loadRealSkill } from './realSkillLoader'
import { formatSkillFallback, routeSkill } from './skillRouter'
import { classifyGenerationValidity } from './generationValidity'
import type { RealSkillAgentContext } from './realSkillTypes'

export type FolderSkillEvalAssertionType =
  | 'min_length'
  | 'max_length'
  | 'contains'
  | 'not_contains'
  | 'json_valid'
  | 'resource_referenced'

export interface FolderSkillEvalAssertion {
  type: FolderSkillEvalAssertionType
  /** Required by contains / not_contains / resource_referenced. */
  value?: string
  /** Required by resource_referenced when value is omitted. */
  resource?: string
  min?: number
  max?: number
  caseSensitive?: boolean
  message?: string
}

export interface FolderSkillEvalCase {
  id: string
  name?: string
  input: string
  assertions: FolderSkillEvalAssertion[]
}

export interface FolderSkillEvalDefinition {
  schema?: string
  name?: string
  cases: FolderSkillEvalCase[]
}

export interface FolderSkillEvalAssertionResult {
  type: FolderSkillEvalAssertionType
  pass: boolean
  message: string
  evidence?: string
}

export interface FolderSkillEvalGrading {
  caseId: string
  caseName: string
  input: string
  withSkill: {
    status: 'success' | 'failed'
    output: string
    errors: string[]
    assertions: FolderSkillEvalAssertionResult[]
    passed: boolean
  }
  baseline: {
    status: 'success' | 'failed'
    output: string
    errors: string[]
    assertions: FolderSkillEvalAssertionResult[]
    passed: boolean
  }
  skillEffect: 'improved' | 'same' | 'degraded' | 'indeterminate'
  durationMs: number
}

export interface FolderSkillEvalReport {
  status: 'success' | 'no-evals' | 'invalid-evals' | 'load-failed' | 'failed'
  skillId: string
  skillName: string
  caseCount: number
  grading: FolderSkillEvalGrading[]
  benchmark: {
    withPassed: number
    baselinePassed: number
    total: number
    withPassRate: number
    baselinePassRate: number
    improved: number
    degraded: number
    same: number
    indeterminate: number
    averageWithDurationMs: number
    averageBaselineDurationMs: number
  } | null
  errors: string[]
}

export interface FolderSkillEvalInput {
  skillId: string
  folderPath: string
  agent?: RealSkillAgentContext | null
  aiService?: {
    callAi: (params: any) => Promise<{
      text: string
      finishReason?: string
      providerId?: string
      usage?: Record<string, unknown>
    }>
  }
}

const BASELINE_SYSTEM_PROMPT = '你是专业的文本处理专家。'

export function parseFolderSkillEvalDefinition(value: unknown): {
  definition: FolderSkillEvalDefinition | null
  errors: string[]
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { definition: null, errors: ['evals.json 必须是 JSON 对象'] }
  }
  const source = value as Record<string, unknown>
  const rawCases = source.cases
  if (!Array.isArray(rawCases) || rawCases.length === 0) {
    return { definition: null, errors: ['evals.json 缺少有效 cases 数组'] }
  }

  const cases: FolderSkillEvalCase[] = []
  const errors: string[] = []
  const seenIds = new Set<string>()
  rawCases.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`cases[${index}] 必须是对象`)
      return
    }
    const record = item as Record<string, unknown>
    const id = String(record.id || '').trim()
    const input = String(record.input ?? '')
    if (!id) {
      errors.push(`cases[${index}] 缺少 id`)
      return
    }
    if (seenIds.has(id)) {
      errors.push(`cases[${index}] 的 id 重复：${id}`)
      return
    }
    if (!input.trim()) {
      errors.push(`cases[${index}]（${id}）缺少 input`)
      return
    }
    if (!Array.isArray(record.assertions) || record.assertions.length === 0) {
      errors.push(`cases[${index}]（${id}）缺少 assertions`)
      return
    }
    const assertions: FolderSkillEvalAssertion[] = []
    ;(record.assertions as unknown[]).forEach((rawAssertion, assertionIndex) => {
      if (!rawAssertion || typeof rawAssertion !== 'object' || Array.isArray(rawAssertion)) {
        errors.push(`cases[${index}]（${id}）assertions[${assertionIndex}] 必须是对象`)
        return
      }
      const assertion = rawAssertion as Record<string, unknown>
      const type = String(assertion.type || '') as FolderSkillEvalAssertionType
      const supported: FolderSkillEvalAssertionType[] = [
        'min_length',
        'max_length',
        'contains',
        'not_contains',
        'json_valid',
        'resource_referenced'
      ]
      if (!supported.includes(type)) {
        errors.push(`cases[${index}]（${id}）assertions[${assertionIndex}] 类型不支持：${type || '(空)'}`)
        return
      }
      assertions.push({
        type,
        value: assertion.value === undefined ? undefined : String(assertion.value),
        resource: assertion.resource === undefined ? undefined : String(assertion.resource),
        min: typeof assertion.min === 'number' ? assertion.min : undefined,
        max: typeof assertion.max === 'number' ? assertion.max : undefined,
        caseSensitive: assertion.caseSensitive === true,
        message: assertion.message === undefined ? undefined : String(assertion.message)
      })
    })
    if (assertions.length === 0) {
      errors.push(`cases[${index}]（${id}）没有可执行 assertions`)
      return
    }
    seenIds.add(id)
    cases.push({
      id,
      name: record.name === undefined ? undefined : String(record.name),
      input,
      assertions
    })
  })

  if (cases.length === 0) {
    return { definition: null, errors: [...(errors.length ? errors : ['evals.json 没有可执行用例'])] }
  }
  return {
    definition: {
      schema: source.schema === undefined ? undefined : String(source.schema),
      name: source.name === undefined ? undefined : String(source.name),
      cases
    },
    errors
  }
}

function normalizeText(text: string, caseSensitive: boolean) {
  return caseSensitive ? text : text.toLocaleLowerCase('zh-CN')
}

function runAssertion(
  assertion: FolderSkillEvalAssertion,
  output: string,
  resourcePaths: string[] = []
): FolderSkillEvalAssertionResult {
  const base = { type: assertion.type, evidence: '' as string }
  const fail = (message: string): FolderSkillEvalAssertionResult => ({
    ...base,
    pass: false,
    message: assertion.message || message
  })
  const pass = (message: string, evidence?: string): FolderSkillEvalAssertionResult => ({
    ...base,
    pass: true,
    message: assertion.message || message,
    evidence
  })

  const length = output.length
  if (assertion.type === 'min_length') {
    const min = Number.isFinite(assertion.min) ? Number(assertion.min) : 0
    return length >= min
      ? pass(`长度 ${length} >= ${min}`, `length=${length}`)
      : fail(`长度 ${length} < ${min}`)
  }
  if (assertion.type === 'max_length') {
    const max = Number.isFinite(assertion.max) ? Number(assertion.max) : Number.POSITIVE_INFINITY
    return length <= max
      ? pass(`长度 ${length} <= ${max}`, `length=${length}`)
      : fail(`长度 ${length} > ${max}`)
  }
  if (assertion.type === 'contains' || assertion.type === 'not_contains') {
    const needle = String(assertion.value ?? '')
    if (!needle) return fail('contains/not_contains 缺少 value')
    const found = normalizeText(output, assertion.caseSensitive !== false)
      .includes(normalizeText(needle, assertion.caseSensitive !== false))
    if (assertion.type === 'contains') {
      return found
        ? pass(`包含目标内容：${needle}`, `value=${needle}`)
        : fail(`未包含目标内容：${needle}`)
    }
    return found
      ? fail(`出现禁用内容：${needle}`)
      : pass(`未出现禁用内容：${needle}`, `value=${needle}`)
  }
  if (assertion.type === 'json_valid') {
    try {
      JSON.parse(output)
      return pass('输出是有效 JSON', 'json_valid=true')
    } catch {
      return fail('输出不是有效 JSON')
    }
  }

  const expected = String(assertion.value ?? assertion.resource ?? '')
  if (!expected) return fail('resource_referenced 缺少 value/resource')
  const referenced = resourcePaths.some(path =>
    normalizeText(path, assertion.caseSensitive !== false)
      .includes(normalizeText(expected, assertion.caseSensitive !== false))
  )
  return referenced
    ? pass(`引用了资源：${expected}`, `resource=${expected}`)
    : fail(`未引用资源：${expected}`)
}

function gradeOutput(
  caseItem: FolderSkillEvalCase,
  output: string,
  resourcePaths: string[]
): FolderSkillEvalAssertionResult[] {
  return caseItem.assertions.map(assertion => runAssertion(assertion, output, resourcePaths))
}

function toFailureGrading(
  caseItem: FolderSkillEvalCase,
  withSkillErrors: string[],
  baselineErrors: string[] = withSkillErrors,
  durationMs: number,
  resourcePaths: string[]
): FolderSkillEvalGrading {
  const assertions = caseItem.assertions.map(assertion => ({
    type: assertion.type,
    pass: false,
    message: assertion.message || '执行失败，断言未运行',
    evidence: ''
  }))
  return {
    caseId: caseItem.id,
    caseName: caseItem.name || caseItem.id,
    input: caseItem.input,
    withSkill: { status: 'failed', output: '', errors: withSkillErrors, assertions, passed: false },
    baseline: { status: 'failed', output: '', errors: baselineErrors, assertions, passed: false },
    skillEffect: 'indeterminate',
    durationMs
  }
}

export async function runFolderSkillEval(input: FolderSkillEvalInput): Promise<FolderSkillEvalReport> {
  const emptyReport = (status: FolderSkillEvalReport['status'], errors: string[]): FolderSkillEvalReport => ({
    status,
    skillId: input.skillId,
    skillName: input.skillId,
    caseCount: 0,
    grading: [],
    benchmark: null,
    errors
  })

  const loaded = await loadRealSkill(input.folderPath)
  if (!loaded.package) {
    const failure = loaded.failure || {
      code: loaded.error || 'skill-load-failed',
      message: 'SKILL 文件夹加载失败',
      folderPath: input.folderPath
    }
    return emptyReport('load-failed', [
      `文件夹技能加载失败：${failure.code} ${failure.message}`,
      `路径：${failure.folderPath}`,
      failure.action || ''
    ].filter(Boolean))
  }
  const pkg = loaded.package
  if (!pkg.evals) {
    return emptyReport('no-evals', ['该技能包没有 evals.json'])
  }
  const parsed = parseFolderSkillEvalDefinition(pkg.evals)
  if (!parsed.definition) {
    return emptyReport('invalid-evals', parsed.errors)
  }

  const aiService = input.aiService || await getAiService()
  const resourcePaths = (pkg.resources || []).map(resource => resource.path)
  const grading: FolderSkillEvalGrading[] = []

  for (const caseItem of parsed.definition.cases) {
    const startedAt = Date.now()
    let withErrors: string[] = []
    let withOutput = ''
    let withStatus: 'success' | 'failed' = 'success'
    let withDegraded = false
    try {
      const budget = createApiCallBudget(3)
      const route = await routeSkill(
        { id: input.skillId, format: 'folder', folderPath: input.folderPath },
        {
          input: caseItem.input,
          agent: input.agent,
          purpose: 'rewrite',
          budget,
          skillId: input.skillId,
          aiService,
          stream: false
        }
      )
      if (route.mode !== 'folder' || !route.folderResult) {
        withStatus = 'failed'
        withErrors = [formatSkillFallback(route.fallback) || `folder 技能路由失败：${route.fallbackReason || 'skill-load-failed'}`]
      } else {
        withOutput = route.folderResult.output || ''
        withErrors = route.folderResult.errors.slice()
        withDegraded = route.folderResult.status === 'degraded'
        withStatus = route.folderResult.status === 'failed' || route.folderResult.status === 'blocked' || (withDegraded && !withOutput.trim())
          ? 'failed'
          : 'success'
        if (withDegraded && withStatus === 'success') {
          withErrors.push('folder SKILL 降级完成，已保留可用输出')
        }
      }
    } catch (error) {
      withStatus = 'failed'
      withErrors = [error instanceof Error ? error.message : 'with-skill 执行失败']
    }

    let baselineOutput = ''
    let baselineErrors: string[] = []
    let baselineDegraded = false
    let baselineStatus: 'success' | 'failed' = 'success'
    let baselineFailureMessage = ''
    try {
      const baselineResult = await aiService.callAi({
        purpose: 'generate',
        messages: [
          { role: 'system', content: BASELINE_SYSTEM_PROMPT },
          { role: 'user', content: caseItem.input }
        ],
        stream: false,
        retry: true,
        meta: { source: 'folderSkillEval.baseline', providerSource: 'auxiliary', skillId: input.skillId, caseId: caseItem.id }
      })
      baselineOutput = baselineResult.text || ''
      const baselineValidity = classifyGenerationValidity({
        text: baselineResult.text,
        finishReason: baselineResult.finishReason,
        usage: baselineResult.usage
      })
      baselineDegraded = baselineValidity.kind === 'truncated'
      if (!baselineValidity.usable) {
        baselineFailureMessage = baselineValidity.message
      }
    } catch (error) {
      baselineFailureMessage = error instanceof Error ? error.message : 'baseline 执行失败'
      baselineErrors = [baselineFailureMessage]
    }

    if (baselineFailureMessage) {
      baselineErrors = [baselineFailureMessage]
    }

    if (withErrors.length || baselineErrors.length) {
      const blockingErrors = [
        ...withErrors.filter(item => item !== 'folder SKILL 降级完成，已保留可用输出'),
        ...baselineErrors
      ]
      if (blockingErrors.length) {
        grading.push(toFailureGrading(
          caseItem,
          withErrors.filter(item => item !== 'folder SKILL 降级完成，已保留可用输出'),
          baselineErrors,
          Date.now() - startedAt,
          resourcePaths
        ))
        continue
      }
    }
    if (!baselineOutput.trim() || baselineDegraded) {
      baselineStatus = 'failed'
      baselineErrors = baselineErrors.length ? baselineErrors : [baselineDegraded ? 'baseline 输出被截断' : 'baseline 未返回正文']
      grading.push(toFailureGrading(
        caseItem,
        baselineDegraded ? ['baseline 输出被截断'] : ['baseline 执行失败'],
        baselineErrors.length ? baselineErrors : [baselineDegraded ? 'baseline 输出被截断' : 'baseline 未返回正文'],
        Date.now() - startedAt,
        resourcePaths
      ))
      continue
    }

    const withAssertions = gradeOutput(caseItem, withOutput, resourcePaths)
    const baselineAssertions = gradeOutput(caseItem, baselineOutput, resourcePaths)
    const withPassed = withStatus === 'success' && withAssertions.every(item => item.pass)
    const baselinePassed = baselineStatus === 'success' && baselineAssertions.every(item => item.pass)
    const skillEffect = withPassed === baselinePassed
      ? 'same'
      : withPassed
        ? 'improved'
        : baselinePassed
          ? 'degraded'
          : 'indeterminate'
      grading.push({
      caseId: caseItem.id,
      caseName: caseItem.name || caseItem.id,
      input: caseItem.input,
      withSkill: {
        status: withStatus,
        output: withOutput,
        errors: withErrors,
        assertions: withAssertions,
        passed: withPassed
      },
      baseline: {
        status: baselineStatus,
        output: baselineOutput,
        errors: baselineErrors,
        assertions: baselineAssertions,
        passed: baselinePassed
      },
      skillEffect,
      durationMs: Date.now() - startedAt
    })
  }

  const total = grading.length
  const withPassed = grading.filter(item => item.withSkill.passed).length
  const baselinePassed = grading.filter(item => item.baseline.passed).length
  const round = (value: number) => Number((value * 100).toFixed(1))
  return {
    status: 'success',
    skillId: input.skillId,
    skillName: pkg.name || input.skillId,
    caseCount: total,
    grading,
    benchmark: {
      withPassed,
      baselinePassed,
      total,
      withPassRate: total ? round(withPassed / total) : 0,
      baselinePassRate: total ? round(baselinePassed / total) : 0,
      improved: grading.filter(item => item.skillEffect === 'improved').length,
      degraded: grading.filter(item => item.skillEffect === 'degraded').length,
      same: grading.filter(item => item.skillEffect === 'same').length,
      indeterminate: grading.filter(item => item.skillEffect === 'indeterminate').length,
      averageWithDurationMs: 0,
      averageBaselineDurationMs: 0
    },
    errors: []
  }
}
