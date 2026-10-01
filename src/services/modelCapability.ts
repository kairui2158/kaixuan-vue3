export type ProviderType =
  | 'openai-compatible'
  | 'deepseek'
  | 'anthropic'
  | 'gemini'
  | 'azure-openai'

export interface ModelCapabilityLike {
  providerType?: string
  selectedModel?: string
  contextWindowTokens?: number | string | null
  maxTokens?: number | string | null
}

export interface ModelCapability {
  /** Effective input context window; 0 means unknown. */
  contextWindowTokens: number
  contextWindowSource: 'provider' | 'builtin' | 'unknown'
  /** Explicit protocol output override; 0 means "let the provider decide". */
  maxOutputTokens: number
  maxOutputSource: 'override' | 'provider' | 'unknown'
  /** True only for protocols that require a positive output limit on the wire. */
  protocolRequiresMaxTokens: boolean
  /** Stable value used for protocol-required limits when capability is unknown. */
  protocolRequiredMaxTokens: number
}

export const MODEL_CAPABILITY_DEFAULTS = {
  protocolRequiredMaxTokens: 32_768,
} as const

const providersRequiringMaxTokens = new Set<string>(['anthropic'])

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null
}

function normalizeProviderType(value?: string): ProviderType {
  if (value === 'deepseek' || value === 'anthropic' || value === 'gemini' || value === 'azure-openai') return value
  return 'openai-compatible'
}

/**
 * Resolves model capabilities without inventing a user-facing output cap.
 * Unknown means unknown; protocol-required limits are labeled as such.
 */
export function resolveModelCapability(input: {
  provider: ModelCapabilityLike
  model?: number | string
}): ModelCapability {
  const providerType = normalizeProviderType(input.provider.providerType)
  const providerWindow = positiveInteger(input.provider.contextWindowTokens)
  const contextWindowTokens = providerWindow ?? 0
  const contextWindowSource: ModelCapability['contextWindowSource'] = providerWindow != null ? 'provider' : 'unknown'

  const explicitMaxTokens = positiveInteger(input.provider.maxTokens)
  const requestMaxTokens = positiveInteger(input.model)
  const maxOutputTokens = requestMaxTokens ?? explicitMaxTokens ?? 0
  const maxOutputSource: ModelCapability['maxOutputSource'] = requestMaxTokens != null || explicitMaxTokens != null
    ? 'override'
    : 'unknown'
  const protocolRequiresMaxTokens = providersRequiringMaxTokens.has(providerType)

  return {
    contextWindowTokens,
    contextWindowSource,
    maxOutputTokens,
    maxOutputSource,
    protocolRequiresMaxTokens,
    protocolRequiredMaxTokens: MODEL_CAPABILITY_DEFAULTS.protocolRequiredMaxTokens,
  }
}

export function protocolMaxTokens(capability: ModelCapability): number | null {
  if (capability.maxOutputTokens > 0) return capability.maxOutputTokens
  return capability.protocolRequiresMaxTokens ? capability.protocolRequiredMaxTokens : null
}
