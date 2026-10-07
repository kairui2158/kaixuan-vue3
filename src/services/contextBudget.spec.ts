import { describe, expect, it } from 'vitest'
import {
  CONTEXT_BUDGET_DEFAULTS,
  buildUsageReconciliation,
  estimateInputTokens,
  resolveContextBudget,
  resolveAvailableContextTokens,
  resolveContextWindowTokens,
  resolvePlanningInputBudget,
} from './contextBudget'

describe('resolveContextWindowTokens', () => {
  it('keeps an explicit 1M window', () => {
    expect(resolveContextWindowTokens({ contextWindowTokens: 1_000_000 })).toBe(1_000_000)
  })

  it('treats 0 as an unknown window', () => {
    expect(resolveContextWindowTokens({ contextWindowTokens: 0 })).toBe(0)
  })

  it('normalizes null, undefined, and invalid values to unknown', () => {
    expect(resolveContextWindowTokens({})).toBe(0)
    expect(resolveContextWindowTokens({ contextWindowTokens: null as any })).toBe(0)
    expect(resolveContextWindowTokens({ contextWindowTokens: Number.NaN })).toBe(0)
    expect(resolveContextWindowTokens({ contextWindowTokens: Number.POSITIVE_INFINITY })).toBe(0)
    expect(resolveContextWindowTokens({ contextWindowTokens: '131072' as any })).toBe(131072)
    expect(resolveContextWindowTokens({ contextWindowTokens: -1 })).toBe(0)
  })
})

describe('estimateInputTokens', () => {
  it('uses a conservative Chinese ratio', () => {
    const tokens = estimateInputTokens('中'.repeat(170))
    expect(tokens).toBe(100)
  })

  it('uses an English ratio and keeps whitespace visible to the estimator', () => {
    const tokens = estimateInputTokens('a'.repeat(400))
    expect(tokens).toBe(100)
  })

  it('estimates mixed-language text by language share', () => {
    const tokens = estimateInputTokens('中'.repeat(170) + 'a'.repeat(400))
    expect(tokens).toBe(200)
  })

  it('always rounds up so the estimate never undercounts a partial token', () => {
    expect(estimateInputTokens('中'.repeat(171))).toBe(101)
    expect(estimateInputTokens('')).toBe(0)
  })

  it('counts every message content, including tool payloads', () => {
    const tokens = estimateInputTokens([
      { role: 'system', content: '中'.repeat(170) },
      { role: 'user', content: 'a'.repeat(400) },
    ])
    expect(tokens).toBe(201)
  })
})

describe('resolveContextBudget', () => {
  const messages = [
    { role: 'system', content: '中'.repeat(17_000) },
    { role: 'user', content: 'a'.repeat(40_000) },
  ]

  it('returns fits when the input and output reserve stay inside the window', () => {
    const result = resolveContextBudget({
      provider: { contextWindowTokens: 131_072 },
      messages,
      maxOutputTokens: 8192,
    })
    expect(result.decision).toBe('fits')
    expect(result.estimatedInputTokens).toBe(20_001)
    expect(result.providerContextWindowTokens).toBe(131_072)
    expect(result.availableContextTokens).toBeLessThanOrEqual(131_072)
  })

  it('returns needs_segmentation before the request exceeds the provider window', () => {
    const result = resolveContextBudget({
      provider: { contextWindowTokens: 21_000 },
      messages,
      maxOutputTokens: 8192,
    })
    expect(result.decision).toBe('needs_segmentation')
    expect(result.reason).toContain('输出保留区')
  })

  it('returns exceeds_provider when even the input alone cannot fit', () => {
    const result = resolveContextBudget({
      provider: { contextWindowTokens: 10_000 },
      messages,
      maxOutputTokens: 8192,
    })
    expect(result.decision).toBe('exceeds_provider')
    expect(result.reason).toContain('输入上下文已超过')
  })

  it('treats an unknown provider window as a conservative declared default', () => {
    const result = resolveContextBudget({
      provider: {},
      messages,
      maxOutputTokens: 8192,
    })
    expect(result.decision).toBe('fits')
    expect(result.providerContextWindowTokens).toBe(CONTEXT_BUDGET_DEFAULTS.unknownWindowTokens)
    expect(result.windowDeclared).toBe(false)
  })

  it('labels an omitted output limit while planning with the default reserve', () => {
    const result = resolveContextBudget({
      provider: {},
      messages,
      maxOutputTokens: null,
    })

    expect(result.outputLimitDeclared).toBe(false)
    expect(result.outputReserveTokens).toBe(CONTEXT_BUDGET_DEFAULTS.defaultOutputReserveTokens)
  })

  it('keeps a small explicit window honest instead of falling back to the unknown default', () => {
    const result = resolveContextBudget({
      provider: { contextWindowTokens: 28_100 },
      messages,
      maxOutputTokens: 0,
    })
    expect(result.decision).toBe('needs_segmentation')
    expect(result.providerContextWindowTokens).toBe(28_100)
    expect(result.outputReserveTokens).toBe(Math.floor(28_100 * CONTEXT_BUDGET_DEFAULTS.windowSafetyRatio))
  })

  it('always clamps the output reserve to the window safety margin', () => {
    const result = resolveContextBudget({
      provider: { contextWindowTokens: 1_000_000 },
      messages,
      maxOutputTokens: 999_999,
    })
    expect(result.decision).toBe('fits')
    expect(result.outputReserveTokens).toBeLessThanOrEqual(Math.floor(1_000_000 * CONTEXT_BUDGET_DEFAULTS.windowSafetyRatio))
  })

  it('detects a provider configuration conflict instead of routing with a zero input window', () => {
    const result = resolveContextBudget({
      provider: { contextWindowTokens: 128_000 },
      messages: [{ role: 'user', content: '中'.repeat(1_700) }],
      maxOutputTokens: 128_000,
    })

    expect(result.decision).toBe('provider_configuration_conflict')
    expect(result.availableContextTokens).toBeNull()
    expect(result.reason).toContain('供应商输出上限吞没输入窗口')
  })
})

describe('resolveAvailableContextTokens', () => {
  it('returns null for an unknown input window instead of inventing one', () => {
    expect(resolveAvailableContextTokens({ contextWindowTokens: null, maxOutputTokens: null })).toBeNull()
    expect(resolveAvailableContextTokens({ contextWindowTokens: 0 })).toBeNull()
  })

  it('uses the shared planning reserve when the output limit is omitted', () => {
    const result = resolveAvailableContextTokens({ contextWindowTokens: 1_000_000, maxOutputTokens: null })
    expect(result).toBe(Math.floor(1_000_000 * CONTEXT_BUDGET_DEFAULTS.windowSafetyRatio) - CONTEXT_BUDGET_DEFAULTS.defaultOutputReserveTokens)
  })

  it('uses an explicit output override as the reserve', () => {
    const result = resolveAvailableContextTokens({ contextWindowTokens: 1_000_000, maxOutputTokens: 100_000 })
    expect(result).toBe(Math.floor(1_000_000 * CONTEXT_BUDGET_DEFAULTS.windowSafetyRatio) - 100_000)
  })
})

describe('resolvePlanningInputBudget', () => {
  it('keeps every window class on one formula', () => {
    const cases = [
      { contextWindowTokens: 64_000, maxOutputTokens: 8_192 },
      { contextWindowTokens: 200_000, maxOutputTokens: 8_192 },
      { contextWindowTokens: 1_000_000, maxOutputTokens: 8_192 },
      { contextWindowTokens: 1_000_000, maxOutputTokens: null },
    ]

    for (const item of cases) {
      const expected = Math.max(
        0,
        Math.floor(item.contextWindowTokens * CONTEXT_BUDGET_DEFAULTS.windowSafetyRatio)
          - (item.maxOutputTokens ?? CONTEXT_BUDGET_DEFAULTS.defaultOutputReserveTokens),
      )
      expect(resolvePlanningInputBudget(item)).toBe(expected)
    }
  })

  it('stays aligned with the public available-context helper', () => {
    expect(resolvePlanningInputBudget({ contextWindowTokens: 200_000, maxOutputTokens: 8_192 }))
      .toBe(resolveAvailableContextTokens({ contextWindowTokens: 200_000, maxOutputTokens: 8_192 }))
    expect(resolvePlanningInputBudget({ contextWindowTokens: 64_000, maxOutputTokens: null }))
      .toBe(resolveAvailableContextTokens({ contextWindowTokens: 64_000, maxOutputTokens: null }))
  })

  it('returns zero for an unknown window rather than inventing a planning budget', () => {
    expect(resolvePlanningInputBudget({ contextWindowTokens: null, maxOutputTokens: null })).toBe(0)
    expect(resolvePlanningInputBudget({ contextWindowTokens: 0, maxOutputTokens: 8_192 })).toBe(0)
  })
})

describe('buildUsageReconciliation', () => {
  it('reports unavailable when the provider gives no usage', () => {
    const result = buildUsageReconciliation({
      estimatedInputTokens: 1234,
      usage: undefined,
    })
    expect(result.status).toBe('unavailable')
    expect(result.actualInputTokens).toBeUndefined()
  })

  it('uses prompt tokens from provider usage shapes', () => {
    for (const usage of [
      { prompt_tokens: 1200 },
      { input_tokens: 1200 },
      { promptTokens: 1200 },
      { inputTokens: 1200 },
    ]) {
      expect(buildUsageReconciliation({ estimatedInputTokens: 1000, usage }).actualInputTokens).toBe(1200)
    }
  })

  it('records the drift ratio and corrected ratio when usage is available', () => {
    const result = buildUsageReconciliation({ estimatedInputTokens: 1000, usage: { prompt_tokens: 1250 } })
    expect(result.status).toBe('available')
    expect(result.actualInputTokens).toBe(1250)
    expect(result.driftRatio).toBeCloseTo(0.25, 5)
    expect(result.correctedRatio).toBeCloseTo(1.25, 5)
  })
})
