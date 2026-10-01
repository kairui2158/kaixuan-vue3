import { describe, expect, it } from 'vitest'
import {
  MODEL_CAPABILITY_DEFAULTS,
  protocolMaxTokens,
  resolveModelCapability,
} from './modelCapability'

describe('resolveModelCapability', () => {
  it('keeps an unknown output limit unknown for OpenAI-compatible providers', () => {
    const capability = resolveModelCapability({
      provider: { providerType: 'openai-compatible', maxTokens: 0 },
    })

    expect(capability.maxOutputTokens).toBe(0)
    expect(capability.maxOutputSource).toBe('unknown')
    expect(capability.protocolRequiresMaxTokens).toBe(false)
    expect(protocolMaxTokens(capability)).toBeNull()
  })

  it('resolves an explicit override as protocol output', () => {
    const capability = resolveModelCapability({
      provider: { providerType: 'openai-compatible', maxTokens: 12_000 },
      model: 20_000,
    })

    expect(capability.maxOutputTokens).toBe(20_000)
    expect(capability.maxOutputSource).toBe('override')
    expect(protocolMaxTokens(capability)).toBe(20_000)
  })

  it('uses the labeled protocol-required value for Anthropic', () => {
    const capability = resolveModelCapability({
      provider: { providerType: 'anthropic', maxTokens: 0 },
    })

    expect(capability.protocolRequiresMaxTokens).toBe(true)
    expect(capability.protocolRequiredMaxTokens).toBe(MODEL_CAPABILITY_DEFAULTS.protocolRequiredMaxTokens)
    expect(protocolMaxTokens(capability)).toBe(32_768)
  })

  it('keeps provider context windows explicit instead of inventing them', () => {
    const capability = resolveModelCapability({
      provider: { providerType: 'gemini', contextWindowTokens: '1_000_000', maxTokens: 0 },
    })

    expect(capability.contextWindowTokens).toBe(0)
    expect(capability.contextWindowSource).toBe('unknown')
  })
})
