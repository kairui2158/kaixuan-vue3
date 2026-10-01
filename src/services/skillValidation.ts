export type JsonSchema = {
  type?: string
  required?: string[]
  properties?: Record<string, JsonSchema>
  additionalProperties?: boolean
  items?: JsonSchema
  minItems?: number
  maxItems?: number
  minLength?: number
  maxLength?: number
  enum?: unknown[]
}

export type SchemaNormalizationEvent = {
  type: string
  path: string
  from: unknown
  to: unknown
}

export type SchemaValidationResult = {
  valid: boolean
  schema?: JsonSchema
  errors: string[]
  normalizations?: SchemaNormalizationEvent[]
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

const MAX_SCHEMA_DEPTH = 100

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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function validateAndNormalizeSchema(schema: JsonSchema | string | undefined): SchemaValidationResult {
  const parsed = parseSchema(schema)
  if (parsed.errors.length) return { valid: false, errors: parsed.errors }
  if (!parsed.schema) return { valid: true, schema: undefined, errors: [] }

  const errors: string[] = []
  const normalizations: SchemaNormalizationEvent[] = []
  const seen = new WeakSet<object>()
  const visit = (node: unknown, path: string, depth: number): unknown => {
    if (!isPlainObject(node)) {
      if (node !== undefined) errors.push(`${path} schema 节点必须是对象`)
      return undefined
    }
    if (seen.has(node)) {
      errors.push(`${path} schema 存在循环引用`)
      return undefined
    }
    if (depth > MAX_SCHEMA_DEPTH) {
      errors.push(`${path} schema 深度超过 ${MAX_SCHEMA_DEPTH}`)
      return undefined
    }
    seen.add(node)

    const result: Record<string, unknown> = {}
    const type = node.type
    if (type !== undefined) {
      if (typeof type !== 'string') {
        errors.push(`${path}.type 必须是字符串`)
      } else if (!['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'].includes(type)) {
        errors.push(`${path}.type 不是受支持的类型`)
      } else {
        result.type = type
      }
    }

    if (node.required !== undefined) {
      if (!Array.isArray(node.required) || node.required.some(item => typeof item !== 'string')) {
        errors.push(`${path}.required 必须是字符串数组`)
      } else {
        result.required = node.required
      }
    }

    if (node.additionalProperties !== undefined) {
      if (node.additionalProperties !== false && node.additionalProperties !== true) {
        errors.push(`${path}.additionalProperties 必须是布尔值`)
      } else if (node.additionalProperties === false && result.type && result.type !== 'object') {
        errors.push(`${path}.additionalProperties:false 只能用于 object schema`)
      } else {
        result.additionalProperties = node.additionalProperties
      }
    }

    if (node.properties !== undefined) {
      if (!isPlainObject(node.properties)) {
        errors.push(`${path}.properties 必须是对象`)
      } else if (result.type && result.type !== 'object') {
        errors.push(`${path}.properties 只能用于 object schema`)
      } else {
        const properties: Record<string, unknown> = {}
        for (const [key, child] of Object.entries(node.properties)) {
          const childResult = visit(child, `${path}.properties.${key}`, depth + 1)
          if (childResult !== undefined) properties[key] = childResult
        }
        result.properties = properties
      }
    }

    if (node.items !== undefined) {
      if (result.type && result.type !== 'array') {
        errors.push(`${path}.items 只能用于 array schema`)
      } else {
        const items = visit(node.items, `${path}.items`, depth + 1)
        if (items !== undefined) result.items = items
      }
    }

    for (const key of ['minItems', 'maxItems', 'minLength', 'maxLength'] as const) {
      const value = node[key]
      if (value === undefined) continue
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        errors.push(`${path}.${key} 必须是非负数字`)
      } else {
        result[key] = value
      }
    }

    if (node.enum !== undefined) {
      if (!Array.isArray(node.enum)) errors.push(`${path}.enum 必须是数组`)
      else result.enum = node.enum
    }

    if (result.type === 'object' && node.additionalProperties === undefined && isPlainObject(node.properties)) {
      const hasProperties = Object.keys(node.properties).length > 0
      if (hasProperties) {
        result.additionalProperties = false
        normalizations.push({
          type: 'additional-properties-defaulted',
          path,
          from: undefined,
          to: false,
        })
      }
    }

    return result
  }

  const normalized = visit(parsed.schema, '$', 1)
  if (errors.length > 0) return { valid: false, errors, normalizations }
  if (!isPlainObject(normalized)) return { valid: false, errors: ['$ schema 必须是对象'] }
  if (parsed.schema.type !== undefined && parsed.schema.type !== 'object') {
    return { valid: false, errors: ['顶层 schema 必须是 object'] }
  }
  return { valid: true, schema: normalized as JsonSchema, errors: [], normalizations }
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
      if (objectValue[key] === undefined) errors.push(`${path}.${key} 缺少必填字段`)
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties || {}))
      for (const key of Object.keys(objectValue)) {
        if (!allowed.has(key) && objectValue[key] !== undefined) {
          errors.push(`${path}.${key} 不是允许的字段`)
        }
      }
    }
    for (const [key, childSchema] of Object.entries(schema.properties || {})) {
      if (objectValue[key] !== undefined) validateValue(objectValue[key], childSchema, `${path}.${key}`, errors)
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
  const parsed = validateAndNormalizeSchema(schema)
  if (!parsed.valid || !parsed.schema) {
    return { valid: false, value, errors: parsed.errors }
  }
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
