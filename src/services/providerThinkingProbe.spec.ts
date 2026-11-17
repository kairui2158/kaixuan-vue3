import { describe, expect, it } from 'vitest'
import type { ProviderLike } from './providerAdapter'
import {
  describeThinkingProbeVerdict,
  runThinkingProbe,
  type ThinkingProbeCallResult,
  type ThinkingProbeCaller,
} from './providerThinkingProbe'

const provider: ProviderLike = {
  id: 'probe-test',
  name: 'Probe Test',
  baseUrl: 'https://probe.test/v1',
  apiKey: 'key-probe',
  selectedModel: 'glm-5.3',
  temperature: 0.7,
  maxTokens: 0,
  providerType: 'openai-compatible',
}

function ok(partial: Partial<ThinkingProbeCallResult>): ThinkingProbeCallResult {
  return { ok: true, statusCode: 200, ...partial }
}

function callerWith(
  handler: (override: { thinkingDisableParam?: string; thinkingDisableValue?: string }) =>
    ThinkingProbeCallResult | Promise<ThinkingProbeCallResult>
): ThinkingProbeCaller {
  return async (_provider, override) => handler(override)
}

describe('providerThinkingProbe', () => {
  it('returns effective on first candidate whose reasoning collapses below baseline', async () => {
    const seen: Array<string | undefined> = []
    const caller: ThinkingProbeCaller = callerWith(override => {
      seen.push(override.thinkingDisableParam)
      if (!override.thinkingDisableParam) return ok({ reasoning: '<think>deep reasoning</think>', text: '回答' })
      if (override.thinkingDisableParam === 'thinking') return ok({ text: '回答' })
      throw new Error('should not reach')
    })
    const result = await runThinkingProbe(provider, caller)
    expect(result.verdict).toBe('effective')
    expect(result.param).toBe('thinking')
    expect(result.value).toBe('{"type":"disabled"}')
    expect(result.requestsUsed).toBe(2)
    expect(seen).toEqual(['', 'thinking'])
    expect(result.attempts[0].outcome).toBe('effective')
  })

  it('returns not_applicable when baseline has no reasoning signal', async () => {
    let requests = 0
    const caller: ThinkingProbeCaller = callerWith(() => {
      requests += 1
      return ok({ text: '回答' })
    })
    const result = await runThinkingProbe(provider, caller)
    expect(result.verdict).toBe('not_applicable')
    expect(requests).toBe(1)
    expect(result.attempts).toHaveLength(0)
    expect(describeThinkingProbeVerdict(result)).toContain('无需配置')
  })

  it('skips candidates rejected with HTTP 400 and finds the working one', async () => {
    const caller: ThinkingProbeCaller = callerWith(override => {
      if (!override.thinkingDisableParam) return ok({ reasoning: 'think', text: '回答' })
      if (override.thinkingDisableParam === 'thinking') {
        const error = new Error('invalid field: thinking') as any
        error.statusCode = 400
        throw error
      }
      if (override.thinkingDisableParam === 'enable_thinking') return ok({ text: '回答' })
      throw new Error('should not reach')
    })
    const result = await runThinkingProbe(provider, caller)
    expect(result.verdict).toBe('effective')
    expect(result.param).toBe('enable_thinking')
    expect(result.value).toBe('false')
    expect(result.attempts[0].outcome).toBe('rejected_400')
    expect(result.attempts[0].statusCode).toBe(400)
    expect(result.attempts[1].outcome).toBe('effective')
  })

  it('returns rejected when all candidates fail with HTTP 400', async () => {
    let calls = 0
    const caller: ThinkingProbeCaller = callerWith(override => {
      calls += 1
      if (!override.thinkingDisableParam) return ok({ reasoning: 'think', text: '回答' })
      const error = new Error('unknown field') as any
      error.statusCode = 400
      throw error
    })
    const result = await runThinkingProbe(provider, caller)
    expect(result.verdict).toBe('rejected')
    expect(calls).toBe(5)
    expect(result.attempts).toHaveLength(4)
    expect(result.attempts.every(a => a.outcome === 'rejected_400')).toBe(true)
    expect(describeThinkingProbeVerdict(result)).toContain('被供应商拒绝')
  })

  it('continues past a no_effect candidate and finds a later effective one', async () => {
    const caller: ThinkingProbeCaller = callerWith(override => {
      if (!override.thinkingDisableParam) return ok({ reasoning: 'think', text: '回答' })
      if (override.thinkingDisableParam === 'thinking') return ok({ reasoning: 'still thinking', text: '回答' })
      if (override.thinkingDisableParam === 'enable_thinking') return ok({ text: '回答' })
      throw new Error('should not reach')
    })
    const result = await runThinkingProbe(provider, caller)
    expect(result.verdict).toBe('effective')
    expect(result.param).toBe('enable_thinking')
    expect(result.attempts[0].outcome).toBe('no_effect')
    expect(result.attempts[1].outcome).toBe('effective')
  })

  it('uses usage.completion_tokens_details.reasoning_tokens as fallback signal', async () => {
    const caller: ThinkingProbeCaller = callerWith(override => {
      if (!override.thinkingDisableParam) {
        return ok({ text: '回答', usage: { completion_tokens_details: { reasoning_tokens: 500 } } })
      }
      if (override.thinkingDisableParam === 'thinking') {
        return ok({ text: '回答', usage: { completion_tokens_details: { reasoning_tokens: 0 } } })
      }
      throw new Error('should not reach')
    })
    const result = await runThinkingProbe(provider, caller)
    expect(result.verdict).toBe('effective')
    expect(result.param).toBe('thinking')
    expect(result.baselineReasoningChars).toBe(500)
  })

  it('returns no_effect when no candidate changes the reasoning signal', async () => {
    const caller: ThinkingProbeCaller = callerWith(override => {
      if (!override.thinkingDisableParam) return ok({ reasoning: 'think', text: '回答' })
      return ok({ reasoning: 'think', text: '回答' })
    })
    const result = await runThinkingProbe(provider, caller)
    expect(result.verdict).toBe('no_effect')
    expect(result.requestsUsed).toBe(5)
    expect(describeThinkingProbeVerdict(result)).toContain('未生效')
  })

  it('returns probe_error on non-400 error and stops further candidates', async () => {
    let calls = 0
    const caller: ThinkingProbeCaller = callerWith(override => {
      calls += 1
      if (!override.thinkingDisableParam) return ok({ reasoning: 'think', text: '回答' })
      const error = new Error('HTTP 503') as any
      error.statusCode = 503
      throw error
    })
    const result = await runThinkingProbe(provider, caller)
    expect(result.verdict).toBe('probe_error')
    expect(calls).toBe(2)
    expect(result.error).toContain('503')
    expect(result.attempts[0].outcome).toBe('error')
  })

  it('classifies an accepted reasoning-only response as no_effect', async () => {
    const caller: ThinkingProbeCaller = callerWith(override => {
      if (!override.thinkingDisableParam) return ok({ reasoning: 'think', text: '回答' })
      return ok({ reasoning: 'still thinking', text: '' })
    })
    const result = await runThinkingProbe(provider, caller)
    expect(result.verdict).toBe('no_effect')
    expect(result.attempts.every(a => a.outcome === 'no_effect')).toBe(true)
    expect(result.attempts[0].note).toContain('无正文')
  })

  it('returns undecidable when accepted candidates carry no decodable signal', async () => {
    const caller: ThinkingProbeCaller = callerWith(override => {
      if (!override.thinkingDisableParam) return ok({ reasoning: 'think', text: '回答' })
      return ok({ text: '' })
    })
    const result = await runThinkingProbe(provider, caller)
    expect(result.verdict).toBe('undecidable')
    expect(result.attempts.every(a => a.outcome === 'unverifiable_response')).toBe(true)
  })

  it('keeps mixed rejection with unverifiable acceptance as undecidable', async () => {
    const caller: ThinkingProbeCaller = callerWith(override => {
      if (!override.thinkingDisableParam) return ok({ reasoning: 'think', text: '回答' })
      if (override.thinkingDisableParam !== 'chat_template_kwargs') {
        const error = new Error('unknown field') as any
        error.statusCode = 400
        throw error
      }
      return ok({ text: '' })
    })
    const result = await runThinkingProbe(provider, caller)
    expect(result.verdict).toBe('undecidable')
    expect(result.attempts.filter(a => a.outcome === 'rejected_400')).toHaveLength(3)
    expect(result.attempts[3].outcome).toBe('unverifiable_response')
  })

  it('returns probe_error when the baseline request itself fails', async () => {
    const caller: ThinkingProbeCaller = callerWith(() => {
      const error = new Error('network unreachable') as any
      error.statusCode = 503
      throw error
    })
    const result = await runThinkingProbe(provider, caller)
    expect(result.verdict).toBe('probe_error')
    expect(result.requestsUsed).toBe(1)
    expect(result.error).toContain('network unreachable')
  })

  it('returns undecidable when baseline returns neither text nor reasoning', async () => {
    const caller: ThinkingProbeCaller = callerWith(() => ok({ text: '', reasoning: '' }))
    const result = await runThinkingProbe(provider, caller)
    expect(result.verdict).toBe('undecidable')
    expect(result.error).toContain('基线')
  })

  it('verifies manual declaration first when provider has thinkingDisableParam', async () => {
    const declared: ProviderLike = { ...provider, thinkingDisableParam: 'thinking', thinkingDisableValue: '{"type":"disabled"}' }
    const seenParams: Array<string | undefined> = []
    const caller: ThinkingProbeCaller = callerWith(override => {
      seenParams.push(override.thinkingDisableParam)
      if (!override.thinkingDisableParam) return ok({ reasoning: 'think', text: '回答' })
      return ok({ text: '回答' })
    })
    const result = await runThinkingProbe(declared, caller)
    expect(result.verdict).toBe('effective')
    expect(result.param).toBe('thinking')
    expect(seenParams).toEqual(['', 'thinking'])
  })

  it('effective threshold requires reasoning to drop to 20% of baseline', async () => {
    const caller: ThinkingProbeCaller = callerWith(override => {
      if (!override.thinkingDisableParam) return ok({ reasoning: 'x'.repeat(1000), text: '回答' })
      return ok({ reasoning: 'x'.repeat(201), text: '回答' })
    })
    const result = await runThinkingProbe(provider, caller)
    expect(result.verdict).toBe('no_effect')

    const caller2: ThinkingProbeCaller = callerWith(override => {
      if (!override.thinkingDisableParam) return ok({ reasoning: 'x'.repeat(1000), text: '回答' })
      return ok({ reasoning: 'x'.repeat(200), text: '回答' })
    })
    const result2 = await runThinkingProbe(provider, caller2)
    expect(result2.verdict).toBe('effective')
  })
})
