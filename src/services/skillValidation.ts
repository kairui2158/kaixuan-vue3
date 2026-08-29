export type JsonSchema = {
  type?: string
  required?: string[]
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
  minItems?: number
  maxItems?: number
  minLength?: number
  maxLength?: number
  enum?: unknown[]
}

export type SkillRetryPolicy = {
  maxAttempts?: number
}

export type SkillValidationConfig = {
  outputFormat?: 'json' | 'text'
  inputSchema?: JsonSchema | string
  outputSchema?: JsonSchema | string
  validationRules?: string[]
  retryPolicy?: SkillRetryPolicy | string
}

export type ValidationResult = {
  valid: boolean
  value?: unknown
  errors: string[]
}

function parseSchema(schema: JsonSchema | string | undefined): { schema?: JsonSchema; errors: string[] } {
  if (!schema) return { schema: undefined, errors: [] }
  if (typeof schema !== 'string') return { schema, errors: [] }
  try {
    const parsed = JSON.parse(schema)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { errors: ['schema 必须是 JSON 对象'] }
    }
    return { schema: parsed as JsonSchema, errors: [] }
  } catch {
    return { errors: ['schema 不是合法 JSON'] }
  }
}

function typeMatches(value: unknown, type?: string): boolean {
  if (!type) return true
  if (type === 'object') return !!value && typeof value === 'object' && !Array.isArray(value)
  if (type === 'array') return Array.isArray(value)
  if (type === 'string') return typeof value === 'string'
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value)
  if (type === 'boolean') return typeof value === 'boolean'
  if (type === 'null') return value === null
  return true
}

function validateValue(value: unknown, schema: JsonSchema, path: string, errors: string[]) {
  if (!typeMatches(value, schema.type)) {
    errors.push(`${path} 类型应为 ${schema.type}`)
    return
  }
  if (schema.enum && !schema.enum.some(item => Object.is(item, value))) errors.push(`${path} 不在 enum 范围内`)
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path} 长度小于 minLength`)
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path} 长度超过 maxLength`)
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path} 数量小于 minItems`)
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path} 数量超过 maxItems`)
    if (schema.items) value.forEach((item, index) => validateValue(item, schema.items!, `${path}[${index}]`, errors))
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const objectValue = value as Record<string, unknown>
    for (const key of schema.required || []) {
      if (!(key in objectValue)) errors.push(`${path}.${key} 缺少必填字段`)
    }
    for (const [key, childSchema] of Object.entries(schema.properties || {})) {
      if (key in objectValue) validateValue(objectValue[key], childSchema, `${path}.${key}`, errors)
    }
  }
}

export function parseStructuredOutput(text: string): { value?: unknown; errors: string[] } {
  try {
    const fenced = text.match(/```json?\s*([\s\S]*?)```/i)
    return { value: JSON.parse((fenced ? fenced[1] : text).trim()), errors: [] }
  } catch {
    return { errors: ['输出不是合法 JSON'] }
  }
}

export function validateStructuredValue(value: unknown, schema: JsonSchema | string | undefined): ValidationResult {
  const parsed = parseSchema(schema)
  if (parsed.errors.length) return { valid: false, errors: parsed.errors }
  if (!parsed.schema) return { valid: true, value, errors: [] }
  const errors: string[] = []
  validateValue(value, parsed.schema, '$', errors)
  return { valid: errors.length === 0, value, errors }
}

export function validateSkillInput(input: unknown, config: SkillValidationConfig): ValidationResult {
  return validateStructuredValue(input, config.inputSchema)
}

export function validateSkillOutput(text: string, config: SkillValidationConfig): ValidationResult {
  if (config.outputFormat !== 'json' && !config.outputSchema) return { valid: true, value: text, errors: [] }
  const parsed = parseStructuredOutput(text)
  if (parsed.errors.length) return { valid: false, errors: parsed.errors }
  return validateStructuredValue(parsed.value, config.outputSchema)
}

export function getSkillMaxAttempts(policy: SkillRetryPolicy | string | undefined): number {
  if (!policy) return 1
  const parsed = typeof policy === 'string' ? (() => { try { return JSON.parse(policy) } catch { return {} } })() : policy
  const value = Number(parsed.maxAttempts)
  return Number.isInteger(value) && value >= 1 && value <= 5 ? value : 1
}

export function validateSkillRules(value: unknown, rules: string[] = []): ValidationResult {
  const errors: string[] = []
  for (const rule of rules) {
    const match = /^required(?:\.|:)([A-Za-z0-9_.-]+)$/.exec(rule.trim())
    if (match) {
      const exists = match[1].split('.').reduce<any>((current, key) => current?.[key], value)
      if (exists === undefined || exists === null || exists === '') errors.push(`缺少必填字段 ${match[1]}`)
    }
  }
  return { valid: errors.length === 0, value, errors }
}
