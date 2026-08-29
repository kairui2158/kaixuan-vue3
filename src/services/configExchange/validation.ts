import type {
  AgentRecord,
  ConfigIssue,
  ExchangeExecutionMode,
  SkillRecord,
} from './types'

const AGENT_ALLOWED_KEYS = new Set([
  'id',
  'agentId',
  'name',
  'title',
  'displayName',
  'model',
  'modelName',
  'temperature',
  'temp',
  'maxTokens',
  'max_tokens',
  'systemPrompt',
  'prompt',
  'instruction',
  'description',
  'provider',
  'providerId',
  'tools',
  'createdAt',
  'updatedAt',
])

const SKILL_ALLOWED_KEYS = new Set([
  'id',
  'skillId',
  'name',
  'title',
  'displayName',
  'template',
  'prompt',
  'instruction',
  'category',
  'description',
  'executionMode',
  'mode',
  'outputFormat',
  'output_format',
  'validationRules',
  'validation',
  'splitSize',
  'injectMode',
  'bindTarget',
  'linkedSkillIds',
  'createdAt',
  'updatedAt',
  'injectFrequency',
  'injectDepth',
  'customVars',
  'inputSchema',
  'outputSchema',
  'retryPolicy',
])

const EXECUTION_MODES = new Set<ExchangeExecutionMode>([
  'chain',
  'compose',
  'split-merge',
  'multi-step',
])

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function toOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

function toFiniteNumber(
  value: unknown,
  fallback: number,
): { value: number; valid: boolean } {
  if (value === undefined || value === null || value === '') {
    return { value: fallback, valid: true }
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return { value: fallback, valid: false }
  return { value: parsed, valid: true }
}

function toInteger(
  value: unknown,
  fallback: number,
): { value: number; valid: boolean } {
  const result = toFiniteNumber(value, fallback)
  if (!result.valid) return result
  return {
    value: Number.isInteger(result.value) ? result.value : Math.round(result.value),
    valid: true,
  }
}

function toStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value)) return undefined
  const result: string[] = []
  for (const item of value) {
    if (typeof item === 'string') result.push(item)
    else if (typeof item === 'number' || typeof item === 'boolean') result.push(String(item))
  }
  return result
}

function toRecordStringMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}
  const result: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string') result[key] = raw
    else if (typeof raw === 'number' || typeof raw === 'boolean') result[key] = String(raw)
  }
  return result
}

function collectUnknownKeys(
  raw: Record<string, unknown>,
  allowed: Set<string>,
  field: string,
  unknownFields: string[],
) {
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) unknownFields.push(`${field}.${key}`)
  }
}

function firstValue(raw: Record<string, unknown>, keys: string[]): { value: unknown; key?: string } {
  for (const key of keys) {
    if (raw[key] !== undefined && raw[key] !== null && raw[key] !== '') {
      return { value: raw[key], key }
    }
  }
  return { value: undefined }
}

function reportAlias(
  issues: ConfigIssue[],
  field: string,
  target: string,
  source: string | undefined,
) {
  if (source && source !== target) {
    issues.push({
      code: 'warning',
      field: `${field}.${target}`,
      message: `已将第三方字段 ${source} 映射为 ${target}`,
    })
  }
}

export function normalizeAgentItem(
  raw: unknown,
  field: string,
  issues: ConfigIssue[],
  unknownFields: string[] = [],
): AgentRecord | null {
  if (!isRecord(raw)) {
    issues.push({ code: 'item', field, message: '不是对象，已跳过' })
    return null
  }

  collectUnknownKeys(raw, AGENT_ALLOWED_KEYS, field, unknownFields)

  const idSource = firstValue(raw, ['id', 'agentId'])
  reportAlias(issues, field, 'id', idSource.key)
  const id = toOptionalString(idSource.value)
  if (!id || !id.trim()) {
    issues.push({ code: 'field', field: `${field}.id`, message: '缺少必填字段 id' })
    return null
  }

  const nameSource = firstValue(raw, ['name', 'title', 'displayName'])
  reportAlias(issues, field, 'name', nameSource.key)
  const name = toOptionalString(nameSource.value)
  if (!name || !name.trim()) {
    issues.push({ code: 'field', field: `${field}.name`, message: '缺少必填字段 name' })
    return null
  }

  const promptSource = firstValue(raw, ['systemPrompt', 'prompt', 'instruction'])
  reportAlias(issues, field, 'systemPrompt', promptSource.key)
  const systemPrompt = toOptionalString(promptSource.value) ?? ''
  if (typeof systemPrompt !== 'string') {
    issues.push({ code: 'field', field: `${field}.systemPrompt`, message: '必须是字符串' })
    return null
  }

  const modelSource = firstValue(raw, ['model', 'modelName'])
  reportAlias(issues, field, 'model', modelSource.key)
  const model = toOptionalString(modelSource.value) ?? ''
  if (modelSource.value === undefined) {
    issues.push({
      code: 'warning',
      field: `${field}.model`,
      message: '未配置 model，将使用空值并回退到供应商默认模型',
    })
  }

  const temperatureSource = firstValue(raw, ['temperature', 'temp'])
  reportAlias(issues, field, 'temperature', temperatureSource.key)
  const temperature = toFiniteNumber(temperatureSource.value, 0.7)
  if (!temperature.valid) {
    issues.push({ code: 'field', field: `${field}.temperature`, message: '必须是数字' })
    return null
  }
  const clampedTemperature = Math.min(2, Math.max(0, temperature.value))
  if (temperature.value < 0 || temperature.value > 2) {
    issues.push({
      code: 'warning',
      field: `${field}.temperature`,
      message: '温度超出 0-2 范围，已按边界收敛',
    })
  }

  const maxTokensSource = firstValue(raw, ['maxTokens', 'max_tokens'])
  reportAlias(issues, field, 'maxTokens', maxTokensSource.key)
  const maxTokens = toInteger(maxTokensSource.value, 0)
  if (!maxTokens.valid || maxTokens.value < 0) {
    issues.push({ code: 'field', field: `${field}.maxTokens`, message: '必须是非负整数' })
    return null
  }

  const tools = toStringArray(raw.tools)
  if (raw.tools !== undefined && !tools) {
    issues.push({ code: 'warning', field: `${field}.tools`, message: 'tools 必须是字符串数组' })
  }

  return {
    id: id.trim(),
    name: name.trim(),
    model,
    temperature: clampedTemperature,
    maxTokens: maxTokens.value,
    systemPrompt,
    description: toOptionalString(raw.description),
    provider: toOptionalString(firstValue(raw, ['provider', 'providerId']).value),
    tools,
    createdAt: toOptionalString(raw.createdAt),
    updatedAt: toOptionalString(raw.updatedAt),
  }
}

export function normalizeSkillItem(
  raw: unknown,
  field: string,
  issues: ConfigIssue[],
  unknownFields: string[] = [],
): SkillRecord | null {
  if (!isRecord(raw)) {
    issues.push({ code: 'item', field, message: '不是对象，已跳过' })
    return null
  }

  collectUnknownKeys(raw, SKILL_ALLOWED_KEYS, field, unknownFields)

  const idSource = firstValue(raw, ['id', 'skillId'])
  reportAlias(issues, field, 'id', idSource.key)
  const id = toOptionalString(idSource.value)
  if (!id || !id.trim()) {
    issues.push({ code: 'field', field: `${field}.id`, message: '缺少必填字段 id' })
    return null
  }

  const nameSource = firstValue(raw, ['name', 'title', 'displayName'])
  reportAlias(issues, field, 'name', nameSource.key)
  const name = toOptionalString(nameSource.value)
  if (!name || !name.trim()) {
    issues.push({ code: 'field', field: `${field}.name`, message: '缺少必填字段 name' })
    return null
  }

  const modeSource = firstValue(raw, ['executionMode', 'mode'])
  reportAlias(issues, field, 'executionMode', modeSource.key)
  const executionMode = toOptionalString(modeSource.value)
  if (executionMode !== undefined && !EXECUTION_MODES.has(executionMode as ExchangeExecutionMode)) {
    issues.push({
      code: 'field',
      field: `${field}.executionMode`,
      message: `不支持的模式 ${executionMode}，仅支持 chain/compose/split-merge/multi-step`,
    })
    return null
  }

  const outputFormatSource = firstValue(raw, ['outputFormat', 'output_format'])
  reportAlias(issues, field, 'outputFormat', outputFormatSource.key)
  const outputFormat = toOptionalString(outputFormatSource.value)
  if (outputFormat !== undefined && outputFormat !== 'json' && outputFormat !== 'text') {
    issues.push({ code: 'field', field: `${field}.outputFormat`, message: '仅支持 json/text' })
    return null
  }

  const splitSize = toInteger(raw.splitSize, 1000)
  if (!splitSize.valid || splitSize.value < 1) {
    issues.push({ code: 'field', field: `${field}.splitSize`, message: '必须是不小于 1 的整数' })
    return null
  }

  const injectDepth = toInteger(raw.injectDepth, 0)
  if (!injectDepth.valid || injectDepth.value < 0) {
    issues.push({ code: 'field', field: `${field}.injectDepth`, message: '必须是非负整数' })
    return null
  }

  const validationSource = firstValue(raw, ['validationRules', 'validation'])
  reportAlias(issues, field, 'validationRules', validationSource.key)
  if (validationSource.value !== undefined && !toStringArray(validationSource.value)) {
    issues.push({
      code: 'warning',
      field: `${field}.validationRules`,
      message: 'validationRules 必须是字符串数组',
    })
  }
  if (raw.linkedSkillIds !== undefined && !toStringArray(raw.linkedSkillIds)) {
    issues.push({
      code: 'warning',
      field: `${field}.linkedSkillIds`,
      message: 'linkedSkillIds 必须是字符串数组',
    })
  }
  if (raw.customVars !== undefined && !isRecord(raw.customVars)) {
    issues.push({ code: 'warning', field: `${field}.customVars`, message: 'customVars 必须是对象' })
  }

  return {
    id: id.trim(),
    name: name.trim(),
    template: toOptionalString(firstValue(raw, ['template', 'prompt', 'instruction']).value) ?? '',
    category: toOptionalString(raw.category) ?? 'general',
    description: toOptionalString(raw.description) ?? '',
    executionMode: (executionMode as ExchangeExecutionMode) ?? 'chain',
    outputFormat: (outputFormat as 'json' | 'text') ?? 'text',
    validationRules: toStringArray(validationSource.value) ?? [],
    splitSize: splitSize.value,
    injectMode: toOptionalString(raw.injectMode),
    bindTarget: raw.bindTarget,
    linkedSkillIds: toStringArray(raw.linkedSkillIds) ?? [],
    createdAt: toOptionalString(raw.createdAt),
    updatedAt: toOptionalString(raw.updatedAt),
    injectFrequency: toOptionalString(raw.injectFrequency),
    injectDepth: injectDepth.value,
    customVars: toRecordStringMap(raw.customVars),
    inputSchema: raw.inputSchema,
    outputSchema: raw.outputSchema,
    retryPolicy: raw.retryPolicy,
  }
}
