import { getAiService } from './aiService'
import { DeAiSamples } from './deai-samples.js'
import { loadRealSkill } from './realSkillLoader'
import { validateSkillOutput } from './skillValidation'
import type {
  RealSkillAgentContext,
  RealSkillDiagnostic,
  RealSkillExecuteOptions,
  RealSkillExecutionResult
} from './realSkillTypes'

const ALLOWED_PRE_FIELDS = new Set(['input', 'template', 'samples'])
const ALLOWED_POST_FIELDS = new Set(['output', 'valid', 'message', 'errors'])
const TEMPLATE_LIMIT = 20000
const RETRY_LIMIT = 3
const SMART_SAMPLE_CHAR_LIMIT = 4000

function diagnostic(
  type: RealSkillDiagnostic['type'],
  code: string,
  message: string
): RealSkillDiagnostic {
  return { type, code, message, at: new Date().toISOString() }
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
    else diagnostics.push(diagnostic('warning', 'hook-field-ignored', `未知字段已忽略：${key}`))
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
  template: string,
  systemPromptSuffix?: string
): string {
  return [agentPrompt?.trim(), template.trim(), systemPromptSuffix?.trim()].filter(Boolean).join('\n\n')
}

function mergeSkillAgentDefaults(
  agent: RealSkillExecuteOptions['agent'],
  skillDefaults: RealSkillAgentContext | undefined,
  agentSource: RealSkillExecuteOptions['agentSource']
): RealSkillExecuteOptions['agent'] {
  if (!skillDefaults) return agent
  if (agentSource === 'user-binding') return agent
  if (!agent) return skillDefaults
  if (agentSource === 'step-default') {
    return {
      ...skillDefaults,
      model: skillDefaults.model || agent.model,
      temperature: skillDefaults.temperature ?? agent.temperature,
      maxTokens: skillDefaults.maxTokens || agent.maxTokens,
      systemPrompt: skillDefaults.systemPrompt || agent.systemPrompt,
      id: agent.id
    }
  }
  return {
    ...agent,
    model: agent.model || skillDefaults.model,
    temperature: agent.temperature ?? skillDefaults.temperature,
    maxTokens: agent.maxTokens || skillDefaults.maxTokens,
    systemPrompt: agent.systemPrompt || skillDefaults.systemPrompt
  }
}

function buildUserPrompt(input: string, samples: string[]): string {
  if (samples.length === 0) return input
  return `[style reference]\n${samples.join('\n')}\n\n--- text ---\n${input}`
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

function dispatchPassEvent(detail: {
  skillId: string
  index: number
  total: number
  name: string
  status: 'running' | 'done' | 'failed' | 'skipped'
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
}) {
  try {
    window.dispatchEvent(new CustomEvent('real-skill:step', { detail }))
  } catch {
    // Progress events are diagnostic only and must never affect execution.
  }
}

export async function executeRealSkill(options: RealSkillExecuteOptions): Promise<RealSkillExecutionResult> {
  const diagnostics: RealSkillDiagnostic[] = []
  const errors: string[] = []
  const loaded = await loadRealSkill(options.folderPath)
  if (!loaded.package) {
    return {
      status: 'failed',
      output: '',
      errors: [`文件夹技能加载失败：${loaded.error || '未知错误'}`],
      diagnostics: [diagnostic('error', 'skill-load-failed', `folderPath=${options.folderPath}`)],
      fromCache: false
    }
  }

  const pkg = loaded.package
  const agent = mergeSkillAgentDefaults(options.agent, pkg.meta.agent, options.agentSource)
  if (!pkg.template.trim()) {
    return {
      status: 'failed',
      output: '',
      errors: ['template.md 为空，未调用 API'],
      diagnostics,
      fromCache: loaded.fromCache === true
    }
  }

  const preResult = await executeHook(pkg.script, 'preProcess', options.input, diagnostics)
  const preInput = typeof preResult.fields.input === 'string' && preResult.fields.input.length > 0
    ? preResult.fields.input
    : options.input
  const hasBaseTemplate = (
    typeof options.baseTemplateOverride === 'string' && options.baseTemplateOverride.trim().length > 0
  ) || (
    typeof options.resolvedTemplate === 'string' && options.resolvedTemplate.trim().length > 0
  )
  if (hasBaseTemplate) {
    diagnostics.push(diagnostic(
      'info',
      'base-template-applied',
      '流水线已传入变量解析后的基础模板，将优先于 folder 静态 template.md'
    ))
  }
  const baseTemplate = hasBaseTemplate
    ? (options.baseTemplateOverride || options.resolvedTemplate || '').slice(0, TEMPLATE_LIMIT)
    : pkg.template
  // preProcess 只改写 input，不改写模板。compose 场景必须保留完整合并模板，
  // 否则多个 SKILL 合并后的 system prompt 会被 folder 自身 template 意外替换。
  let template = normalizeTemplate(
    baseTemplate,
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
  let currentInput = preInput
  let output = ''
  let finishReason: string | undefined
  let providerId: string | undefined
  const capturedRequestMessages: Array<{ role: string; content: string }> = []

  for (let passIndex = 0; passIndex < passList.length; passIndex += 1) {
    const pass = passList[passIndex]
    const passName = pass.name || `第 ${passIndex + 1} 步`
    if (isMultiPass) {
      dispatchPassEvent({ skillId: pkg.id, index: passIndex, total: passList.length, name: passName, status: 'running' })
    } else {
      dispatchStepEvent({ skillId: pkg.id, index: 0, total: 1, status: 'running' })
    }
    const passInput = pass.input === 'previous' && output ? output : currentInput
    let lastAttempt: { output: string; validation: { valid: boolean; errors: string[] } } | null = null

    for (let attempt = 1; attempt <= RETRY_LIMIT; attempt += 1) {
      const budgetStep = `real-skill:${options.skillId || pkg.id}${isMultiPass ? `:pass-${passIndex + 1}` : ''}`
      const budget = options.budget.tryConsume(budgetStep, pkg.meta.apiCallLimit ?? null)
      if (budget.status === 'blocked') {
        if (isMultiPass) {
          dispatchPassEvent({ skillId: pkg.id, index: passIndex, total: passList.length, name: passName, status: 'failed' })
        }
        errors.push(budget.reason || 'API 调用预算已耗尽')
        diagnostics.push(diagnostic('error', 'api-budget-blocked', budget.reason || ''))
        return { status: 'blocked', output: '', errors, diagnostics, fromCache: loaded.fromCache === true }
      }

      const selectedSamples = pkg.meta.smartSamples === true
        ? applySampleBudget(chooseSmartSamples(allSamples, passInput, sampleCount), SMART_SAMPLE_CHAR_LIMIT)
        : samples
      const aiService = options.aiService || await getAiService()
      const systemPrompt = buildSystemPrompt(agent?.systemPrompt, template, options.systemPromptSuffix)
      const userPrompt = buildUserPrompt(passInput, selectedSamples)
      const requestMessages = options.messageBuilder
        ? options.messageBuilder(systemPrompt, userPrompt)
        : [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
      if (passIndex === 0 && attempt === 1) {
        capturedRequestMessages.push(...requestMessages.map(message => ({
          role: message.role,
          content: typeof message.content === 'string' ? message.content : ''
        })))
      }

      try {
        const result = await aiService.callAi({
          purpose: options.purpose || 'rewrite',
          messages: requestMessages,
          stream: options.stream === true,
          signal: options.signal,
          timeoutMs: options.timeoutMs,
          onChunk: options.onChunk,
          retry: true,
          model: agent?.model || undefined,
          temperature: attempt === RETRY_LIMIT
            ? Math.min((agent?.temperature ?? 0.7) + 0.05, 1.0)
            : agent?.temperature,
          maxTokens: agent?.maxTokens,
          meta: {
            source: 'realSkillExecutor',
            skillId: pkg.id,
            agentId: agent?.id,
            step: attempt
          }
        })

        let candidateOutput = result.text || ''
        const postResult = await executeHook(pkg.script, 'postProcess', candidateOutput, diagnostics)
        if (typeof postResult.fields.output === 'string' && postResult.fields.output.length > 0) {
          candidateOutput = postResult.fields.output
        }

        const hasPostValidation = typeof postResult.fields.valid === 'boolean'
        const validation = hasPostValidation
          ? {
              valid: postResult.fields.valid === true,
              errors: Array.isArray(postResult.fields.errors)
                ? postResult.fields.errors.map(String)
                : typeof postResult.fields.message === 'string' ? [postResult.fields.message] : []
            }
          : pkg.schema
            ? validateSkillOutput(candidateOutput, { outputFormat: 'json', outputSchema: pkg.schema })
            : { valid: true, errors: [] }
        lastAttempt = { output: candidateOutput, validation }

        if (validation.valid) {
          output = candidateOutput
          finishReason = result.finishReason
          providerId = result.providerId
          if (isMultiPass) {
            dispatchPassEvent({ skillId: pkg.id, index: passIndex, total: passList.length, name: passName, status: 'done' })
          }
          break
        }

        const report = buildValidationErrorReport(validation.errors)
        errors.push(`第 ${attempt}/${RETRY_LIMIT} 次输出未通过校验：${report}`)
        diagnostics.push(diagnostic('warning', 'schema-validation-failed', `尝试 ${attempt}/${RETRY_LIMIT}：${report}`))
        dispatchStepEvent({
          skillId: pkg.id,
          index: passIndex,
          total: passList.length,
          status: attempt < RETRY_LIMIT ? 'running' : 'failed',
          attempts: attempt
        })
      } catch (error: any) {
        if (isMultiPass) {
          dispatchPassEvent({ skillId: pkg.id, index: passIndex, total: passList.length, name: passName, status: 'failed' })
        } else {
          dispatchStepEvent({ skillId: pkg.id, index: passIndex, total: passList.length, status: 'failed', attempts: attempt })
        }
        errors.push(error?.message || 'API 调用失败')
        diagnostics.push(diagnostic('error', 'api-failed', error?.message || ''))
        return { status: 'failed', output: '', errors, diagnostics, fromCache: loaded.fromCache === true }
      }
    }

    if (!lastAttempt || !lastAttempt.validation.valid) {
      if (isMultiPass) {
        dispatchPassEvent({ skillId: pkg.id, index: passIndex, total: passList.length, name: passName, status: 'failed' })
      } else {
        dispatchStepEvent({ skillId: pkg.id, index: passIndex, total: passList.length, status: 'failed', attempts: RETRY_LIMIT })
      }
      errors.push(`输出未通过校验，已达最大尝试次数 ${RETRY_LIMIT}`)
      diagnostics.push(diagnostic('error', 'schema-validation-exhausted', '输出未通过校验，已达最大尝试次数'))
      return {
        status: 'degraded',
        output: lastAttempt?.output || '',
        errors,
        diagnostics,
        fromCache: loaded.fromCache === true,
        apiMeta: { finishReason, providerId, requestMessages: capturedRequestMessages }
      }
    }

    currentInput = output
    if (!isMultiPass) {
      dispatchStepEvent({ skillId: pkg.id, index: 0, total: 1, status: 'done', attempts: 1 })
    }
  }

  const status = diagnostics.some(item => item.type === 'warning')
    ? 'degraded'
    : 'success'
  return {
    status,
    output,
    errors,
    diagnostics,
    fromCache: loaded.fromCache === true,
    apiMeta: { finishReason, providerId, requestMessages: capturedRequestMessages }
  }
}
