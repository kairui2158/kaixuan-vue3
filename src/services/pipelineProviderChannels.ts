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
}

export interface PipelineProviderChannelInput {
  layer: PipelineProviderChannelLayer
  layerProviderId?: string | null
  agentProviderId?: string | null
  globalProviderId?: string | null
  providerExists?: (providerId: string) => boolean
}

export interface PipelineProviderChannelResolution {
  providerId: string
  source: PipelineProviderChannelSource
  providerMissing: boolean
}

export function resolvePipelineProviderChannel(
  input: PipelineProviderChannelInput
): PipelineProviderChannelResolution {
  const exists = input.providerExists || (() => true)
  const agentProviderId = (input.agentProviderId || '').trim()
  if (agentProviderId) {
    return {
      providerId: agentProviderId,
      source: 'agent',
      providerMissing: !exists(agentProviderId),
    }
  }

  const layerProviderId = (input.layerProviderId || '').trim()
  if (layerProviderId) {
    return {
      providerId: layerProviderId,
      source: 'layer',
      providerMissing: !exists(layerProviderId),
    }
  }

  const globalProviderId = (input.globalProviderId || '').trim()
  return {
    providerId: globalProviderId,
    source: 'global',
    providerMissing: Boolean(globalProviderId) && !exists(globalProviderId),
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
}): PipelineProviderChannelSnapshot {
  const layerProviderId = normalizeProviderId(input.layerProviderId)
  const globalProviderId = normalizeProviderId(input.globalProviderId)
  const resolution = resolvePipelineProviderChannel({
    layer: input.layer,
    layerProviderId,
    globalProviderId,
    providerExists: input.providerExists,
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
