import { describe, expect, it } from 'vitest'
import {
  type JsonSchema,
  getSkillMaxAttempts,
  parseStructuredOutput,
  validateAndNormalizeSchema,
  validateSkillInput,
  validateSkillOutput,
  validateSkillRules,
} from './skillValidation'

describe('skill structured validation', () => {
  it('validates input schema before a call', () => {
    const result = validateSkillInput({ chapters: [] }, { inputSchema: { type: 'object', required: ['outline'] } })
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('outline')
  })

  it('parses fenced JSON and validates output schema', () => {
    const raw = '```json\n{"chapters":[{"title":"第一章"}]}\n```'
    expect(parseStructuredOutput(raw).value).toEqual({ chapters: [{ title: '第一章' }] })
    expect(validateSkillOutput(raw, { outputFormat: 'json', outputSchema: { type: 'object', required: ['chapters'], properties: { chapters: { type: 'array', minItems: 1 } } } }).valid).toBe(true)
  })

  it('reports malformed JSON and rule failures', () => {
    expect(validateSkillOutput('not json', { outputFormat: 'json' }).valid).toBe(false)
    expect(validateSkillRules({ chapters: [] }, ['required:chapters']).valid).toBe(true)
    expect(validateSkillRules({}, ['required:chapters']).valid).toBe(false)
  })

  it('clamps invalid retry policy to one attempt', () => {
    expect(getSkillMaxAttempts('{"maxAttempts":3}')).toBe(3)
    expect(getSkillMaxAttempts('{"maxAttempts":99}')).toBe(1)
  })

  it('rejects unknown fields when additionalProperties is false', () => {
    const result = validateSkillInput(
      { operation: 'insert', insertAfter: true },
      {
        inputSchema: {
          type: 'object',
          required: ['operation'],
          properties: { operation: { type: 'string' } },
          additionalProperties: false,
        },
      },
    )
    expect(result.valid).toBe(false)
    expect(result.errors.join('；')).toContain('insertAfter 不是允许的字段')
  })

  it('treats explicit undefined properties as missing', () => {
    const result = validateSkillInput(
      { operation: undefined },
      { inputSchema: { type: 'object', required: ['operation'], properties: { operation: { type: 'string' } } } },
    )
    expect(result.valid).toBe(false)
    expect(result.errors.join('；')).toContain('operation 缺少必填字段')
  })

  it('rejects invalid schema structures and circular references', () => {
    expect(validateAndNormalizeSchema({ type: 'array' }).errors).toContain('顶层 schema 必须是 object')
    expect(validateAndNormalizeSchema({ type: 'object', required: 'x' } as unknown as JsonSchema).errors.join('；')).toContain('required 必须是字符串数组')
    expect(validateAndNormalizeSchema({ type: 'object', properties: { x: 1 } } as unknown as JsonSchema).errors.join('；')).toContain('schema 节点必须是对象')

    const circular: any = { type: 'object', properties: {} }
    circular.properties.self = circular
    expect(validateAndNormalizeSchema(circular).errors.join('；')).toContain('循环引用')
  })

  it('normalizes folder schemas without changing author semantics', () => {
    const result = validateAndNormalizeSchema({
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1 },
        range: { type: 'object', properties: { start: { type: 'number' }, end: { type: 'number' } } },
      },
    })
    expect(result.valid).toBe(true)
    expect(result.schema?.additionalProperties).toBe(false)
    expect(result.schema?.properties?.range?.additionalProperties).toBe(false)
    expect(result.normalizations).toHaveLength(2)
    expect(validateSkillInput(
      { query: '第一卷', range: { start: 1, end: 10, extra: true } },
      { inputSchema: result.schema },
    ).valid).toBe(false)
  })
})
