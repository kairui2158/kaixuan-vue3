import { describe, expect, it } from 'vitest'
import { getSkillMaxAttempts, parseStructuredOutput, validateSkillInput, validateSkillOutput, validateSkillRules } from './skillValidation'

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
})
