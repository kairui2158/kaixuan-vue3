import { describe, expect, it } from 'vitest'
import {
  buildCacheFamily,
  buildRequestContextComposition,
  stablePrefixFingerprint,
} from './requestContextComposition'

describe('stablePrefixFingerprint', () => {
  it('keeps identical prefixes on one stable hash', () => {
    expect(stablePrefixFingerprint('system-prefix', 'user-prefix')).toBe(
      stablePrefixFingerprint('system-prefix', 'user-prefix')
    )
  })

  it('changes when either prefix changes', () => {
    const baseline = stablePrefixFingerprint('system-prefix', 'user-prefix')
    expect(stablePrefixFingerprint('system-prefix-2', 'user-prefix')).not.toBe(baseline)
    expect(stablePrefixFingerprint('system-prefix', 'user-prefix-2')).not.toBe(baseline)
  })
})

describe('buildCacheFamily', () => {
  it('binds the family to provider, model, layer and step', () => {
    expect(buildCacheFamily({
      providerType: 'openai-compatible',
      providerId: 'provider-a',
      model: 'model-a',
      layer: 'chapter',
      step: 2,
    })).toBe('openai-compatible:provider-a:model-a:chapter:step-2')
  })

  it('does not merge unknown identities into one family', () => {
    expect(buildCacheFamily({ providerType: 'unknown' })).not.toBe(
      buildCacheFamily({ providerType: 'unknown' })
    )
  })

  it('keeps the layer identity used by the pipeline executor', () => {
    expect(buildRequestContextComposition({
      layer: 'volumes',
      step: 1,
      providerType: 'openai-compatible',
      systemPrompt: 'system',
      userPrompt: 'user',
    }).layer).toBe('volumes')
    expect(buildRequestContextComposition({
      layer: 'chapters',
      step: 2,
      providerType: 'openai-compatible',
      systemPrompt: 'system',
      userPrompt: 'user',
    }).layer).toBe('chapters')
  })
})

describe('buildRequestContextComposition', () => {
  it('measures stable and variable segments without storing full text', () => {
    const composition = buildRequestContextComposition({
      layer: 'chapter',
      step: 2,
      providerType: 'openai-compatible',
      providerId: 'provider-a',
      model: 'model-a',
      systemPrompt: 'S'.repeat(100),
      userPrompt: 'P'.repeat(40),
      stableSystemPrefix: 'S'.repeat(80),
      stableUserPrefix: 'P'.repeat(20),
    })

    expect(composition.layer).toBe('chapter')
    expect(composition.step).toBe(2)
    expect(composition.systemLength).toBe(100)
    expect(composition.userLength).toBe(40)
    expect(composition.stableSystemPrefixLength).toBe(80)
    expect(composition.stableUserPrefixLength).toBe(20)
    expect(composition.stableChars).toBe(100)
    expect(composition.variableChars).toBe(40)
    expect(composition.stableRatio).toBeCloseTo(100 / 140, 3)
    expect(Object.keys(composition)).not.toContain('systemPrompt')
    expect(Object.keys(composition)).not.toContain('userPrompt')
    expect(composition.cacheFamily).toBe('openai-compatible:provider-a:model-a:chapter:step-2')
    expect(composition.prefixFingerprint).toBe(
      stablePrefixFingerprint('S'.repeat(80), 'P'.repeat(20))
    )
  })

  it('clamps prefix lengths that exceed their prompts', () => {
    const composition = buildRequestContextComposition({
      layer: 'body',
      step: 3,
      providerType: 'anthropic',
      systemPrompt: 'short-system',
      userPrompt: 'short-user',
      stableSystemPrefix: 'longer-system-prefix',
      stableUserPrefix: 'longer-user-prefix',
    })

    expect(composition.stableSystemPrefixLength).toBe('short-system'.length)
    expect(composition.stableUserPrefixLength).toBe('short-user'.length)
    expect(composition.stableChars).toBe('short-system'.length + 'short-user'.length)
    expect(composition.variableChars).toBe(0)
  })

  it('caps stable ratio at one even when declared prefixes overlap', () => {
    const composition = buildRequestContextComposition({
      layer: 'body',
      step: 3,
      providerType: 'anthropic',
      systemPrompt: 'system',
      userPrompt: 'user',
      stableSystemPrefix: 'system',
      stableUserPrefix: 'user',
    })

    expect(composition.stableRatio).toBe(1)
  })
})
