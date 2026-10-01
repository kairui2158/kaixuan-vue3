import { describe, expect, it } from 'vitest'
import { normalizeFinishReason, resolveFinishReason } from './providerAdapter'

describe('finish reason normalization', () => {
  it('keeps the legacy exported vocabulary stable', () => {
    expect(normalizeFinishReason('max_tokens')).toBe('length')
    expect(normalizeFinishReason('end_turn')).toBe('stop')
    expect(normalizeFinishReason('function_call')).toBe('tool_calls')
    expect(normalizeFinishReason('unknown_gateway_reason')).toBe('other')
  })

  it('infers truncation from normalized usage before raw provider keys', () => {
    expect(resolveFinishReason(undefined, { outputTokens: 1023 }, 1024, true)).toBe('length')
    expect(resolveFinishReason(undefined, { completion_tokens: 1023 }, 1024, true)).toBe('length')
    expect(resolveFinishReason('STOP', { candidatesTokenCount: 10 }, 1024, true)).toBe('stop')
  })
})
