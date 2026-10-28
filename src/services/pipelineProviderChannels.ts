export type PipelineProviderChannelLayer = 'settings' | 'volumes' | 'chapters' | 'body'

export const PIPELINE_PROVIDER_CHANNEL_LAYERS: PipelineProviderChannelLayer[] = [
  'settings',
  'volumes',
  'chapters',
  'body',
]

export type PipelineProviderChannelSource = 'agent' | 'layer' | 'global'

export interface PipelineProviderChannelSnapshot {
  layer: PipelineProviderChannelLayer
  layerProviderId: string | null
  globalProviderId: string
  providerId: string
  source: PipelineProviderChannelSource
  providerMissing: boolean
  providerUnsupported?: boolean
}

export interface PipelineProviderChannelInput {
  layer: PipelineProviderChannelLayer
  layerProviderId?: string | null
  agentProviderId?: string | null
  globalProviderId?: string | null
  providerExists?: (providerId: string) => boolean
  providerCanGenerate?: (providerId: string) => boolean
}

export interface PipelineProviderChannelResolution {
  providerId: string
  source: PipelineProviderChannelSource
  providerMissing: boolean
  providerUnsupported: boolean
}

export interface PipelineRequestProfileAgent {
  model?: string | null
  providerId?: string | null
}

export interface PipelineRequestProfileProvider {
  selectedModel?: string | null
  models?: Array<string | null> | null
  purpose?: Array<string | null> | string | null
}

export interface PipelineRequestProfile {
  providerId: string
  source: PipelineProviderChannelSource
  model: string
  modelSource: 'agent' | 'provider-selected' | 'provider-first-listed'
  providerMissing: boolean
  providerUnsupported: boolean
  modelMissing: boolean
  modelSupported: boolean
  modelFallback?: {
    reason: 'agent-model-without-provider'
    configuredModel: string
  }
}

export function resolvePipelineProviderChannel(
  input: PipelineProviderChannelInput
): PipelineProviderChannelResolution {
  const exists = input.providerExists || (() => true)
  const canGenerate = input.providerCanGenerate || (() => true)
  const agentProviderId = (input.agentProviderId || '').trim()
  if (agentProviderId) {
    const providerMissing = !exists(agentProviderId)
    return {
      providerId: agentProviderId,
      source: 'agent',
      providerMissing,
      providerUnsupported: !providerMissing && !canGenerate(agentProviderId),
    }
  }

  const layerProviderId = (input.layerProviderId || '').trim()
  if (layerProviderId) {
    const providerMissing = !exists(layerProviderId)
    return {
      providerId: layerProviderId,
      source: 'layer',
      providerMissing,
      providerUnsupported: !providerMissing && !canGenerate(layerProviderId),
    }
  }

  const globalProviderId = (input.globalProviderId || '').trim()
  const providerMissing = Boolean(globalProviderId) && !exists(globalProviderId)
  return {
    providerId: globalProviderId,
    source: 'global',
    providerMissing,
    providerUnsupported: !providerMissing && !canGenerate(globalProviderId),
  }
}

export function resolvePipelineRequestProfile(input: {
  layer: PipelineProviderChannelLayer
  layerProviderId?: string | null
  globalProviderId?: string | null
  agent?: PipelineRequestProfileAgent | null
  getProvider?: (providerId: string) => PipelineRequestProfileProvider | null | undefined
  providerCanGenerate?: (providerId: string) => boolean
}): PipelineRequestProfile {
  const channel = resolvePipelineProviderChannel({
    ...input,
    agentProviderId: input.agent?.providerId,
  })
  const provider = input.getProvider?.(channel.providerId) || null
  const providerModels = (provider?.models || [])
    .map(model => String(model || '').trim())
    .filter(Boolean)
  const providerModel = String(provider?.selectedModel || '').trim()
  const agentModel = String(input.agent?.model || '').trim()
  const agentOwnsProvider = channel.source === 'agent'

  if (agentModel && agentOwnsProvider) {
    return {
      ...channel,
      model: agentModel,
      modelSource: 'agent',
      modelMissing: false,
      modelSupported: providerModels.length === 0 || providerModels.includes(agentModel),
    }
  }

  if (agentModel && !agentOwnsProvider) {
    const fallbackModel = providerModel || providerModels[0] || ''
    return {
      ...channel,
      model: fallbackModel,
      modelSource: 'provider-selected',
      modelMissing: !fallbackModel,
      modelSupported: Boolean(fallbackModel),
      modelFallback: {
        reason: 'agent-model-without-provider',
        configuredModel: agentModel,
      },
    }
  }

  const selectedModel = providerModel || providerModels[0] || ''
  return {
    ...channel,
    model: selectedModel,
    modelSource: 'provider-selected',
    modelMissing: !selectedModel,
    modelSupported: Boolean(selectedModel),
  }
}

export function normalizePipelineLayerProviders(
  value: unknown
): Partial<Record<PipelineProviderChannelLayer, string | null>> {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const result: Partial<Record<PipelineProviderChannelLayer, string | null>> = {}
  for (const layer of PIPELINE_PROVIDER_CHANNEL_LAYERS) {
    const raw = source[layer]
    if (typeof raw !== 'string') continue
    const trimmed = raw.trim()
    result[layer] = trimmed || null
  }
  return result
}

export function buildPipelineProviderChannelSnapshot(input: {
  layer: PipelineProviderChannelLayer
  layerProviderId?: string | null
  globalProviderId?: string | null
  providerExists?: (providerId: string) => boolean
  providerCanGenerate?: (providerId: string) => boolean
}): PipelineProviderChannelSnapshot {
  const layerProviderId = normalizeProviderId(input.layerProviderId)
  const globalProviderId = normalizeProviderId(input.globalProviderId)
  const resolution = resolvePipelineProviderChannel({
    layer: input.layer,
    layerProviderId,
    globalProviderId,
    providerExists: input.providerExists,
    providerCanGenerate: input.providerCanGenerate,
  })
  return {
    layer: input.layer,
    layerProviderId,
    globalProviderId,
    ...resolution,
  }
}

function normalizeProviderId(value?: string | null): string {
  return (value || '').trim()
}
