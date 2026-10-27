import { describe, expect, it } from 'vitest'
import {
  buildPipelineProviderChannelSnapshot,
  resolvePipelineRequestProfile,
  normalizePipelineLayerProviders,
  resolvePipelineProviderChannel,
} from './pipelineProviderChannels'

const providerExists = (id: string) => ['provider-agent', 'provider-layer', 'provider-global'].includes(id)

const providerById: Record<string, { selectedModel?: string; models?: string[] }> = {
  'provider-agent': { selectedModel: 'agent-model', models: ['agent-model', 'agent-alt'] },
  'provider-layer': { selectedModel: 'layer-model', models: ['layer-model', 'layer-alt'] },
  'provider-global': { selectedModel: 'global-model', models: ['global-model'] },
  'provider-modelless': { selectedModel: '', models: [] },
}

const getProvider = (id: string) => providerById[id]

describe('pipelineProviderChannels', () => {
  it('prefers an explicit agent provider binding', () => {
    expect(resolvePipelineProviderChannel({
      layer: 'volumes',
      layerProviderId: 'provider-layer',
      agentProviderId: 'provider-agent',
      globalProviderId: 'provider-global',
      providerExists,
    })).toEqual({
      providerId: 'provider-agent',
      source: 'agent',
      providerMissing: false,
    })
  })

  it('uses the layer binding when the agent has no provider', () => {
    expect(resolvePipelineProviderChannel({
      layer: 'chapters',
      layerProviderId: 'provider-layer',
      agentProviderId: '',
      globalProviderId: 'provider-global',
      providerExists,
    })).toEqual({
      providerId: 'provider-layer',
      source: 'layer',
      providerMissing: false,
    })
  })

  it('falls back to the global generate provider without a layer binding', () => {
    expect(resolvePipelineProviderChannel({
      layer: 'body',
      layerProviderId: null,
      agentProviderId: null,
      globalProviderId: 'provider-global',
      providerExists,
    })).toEqual({
      providerId: 'provider-global',
      source: 'global',
      providerMissing: false,
    })
  })

  it('marks a configured agent provider missing instead of silently falling back', () => {
    expect(resolvePipelineProviderChannel({
      layer: 'settings',
      layerProviderId: 'provider-layer',
      agentProviderId: 'deleted-provider',
      globalProviderId: 'provider-global',
      providerExists,
    })).toEqual({
      providerId: 'deleted-provider',
      source: 'agent',
      providerMissing: true,
    })
  })

  it('marks a configured layer provider missing instead of silently falling back', () => {
    expect(resolvePipelineProviderChannel({
      layer: 'volumes',
      layerProviderId: 'deleted-provider',
      agentProviderId: '',
      globalProviderId: 'provider-global',
      providerExists,
    })).toEqual({
      providerId: 'deleted-provider',
      source: 'layer',
      providerMissing: true,
    })
  })

  it('keeps an empty global resolution explicit', () => {
    expect(resolvePipelineProviderChannel({
      layer: 'body',
      layerProviderId: '',
      agentProviderId: '',
      globalProviderId: null,
      providerExists,
    })).toEqual({
      providerId: '',
      source: 'global',
      providerMissing: false,
    })
  })

  it('normalizes persisted layer bindings and drops whitespace-only values', () => {
    expect(normalizePipelineLayerProviders({
      settings: ' provider-a ',
      volumes: '   ',
      chapters: null,
      body: 'provider-b',
      unknown: 'ignored',
    })).toEqual({
      settings: 'provider-a',
      volumes: null,
      body: 'provider-b',
    })
  })

  it('freezes a layer snapshot with the raw layer and global bindings', () => {
    expect(buildPipelineProviderChannelSnapshot({
      layer: 'chapters',
      layerProviderId: ' provider-layer ',
      globalProviderId: ' provider-global ',
      providerExists,
    })).toEqual({
      layer: 'chapters',
      layerProviderId: 'provider-layer',
      globalProviderId: 'provider-global',
      providerId: 'provider-layer',
      source: 'layer',
      providerMissing: false,
    })
  })

  it('uses the agent model only when the agent explicitly binds the provider', () => {
    expect(resolvePipelineRequestProfile({
      layer: 'volumes',
      layerProviderId: 'provider-layer',
      globalProviderId: 'provider-global',
      agent: { providerId: 'provider-agent', model: 'agent-model' },
      getProvider,
    })).toEqual({
      providerId: 'provider-agent',
      source: 'agent',
      model: 'agent-model',
      modelSource: 'agent',
      providerMissing: false,
      modelMissing: false,
      modelSupported: true,
    })
  })

  it('does not carry an unbound agent model across providers', () => {
    expect(resolvePipelineRequestProfile({
      layer: 'chapters',
      layerProviderId: 'provider-layer',
      globalProviderId: 'provider-global',
      agent: { model: 'agent-model' },
      getProvider,
    })).toEqual({
      providerId: 'provider-layer',
      source: 'layer',
      model: 'layer-model',
      modelSource: 'provider-selected',
      providerMissing: false,
      modelMissing: false,
      modelSupported: true,
      modelFallback: {
        reason: 'agent-model-without-provider',
        configuredModel: 'agent-model',
      },
    })
  })

  it('marks an explicit model unsupported when the provider declares a model list', () => {
    expect(resolvePipelineRequestProfile({
      layer: 'body',
      layerProviderId: 'provider-layer',
      globalProviderId: 'provider-global',
      agent: { providerId: 'provider-agent', model: 'unknown-model' },
      getProvider,
    })).toEqual({
      providerId: 'provider-agent',
      source: 'agent',
      model: 'unknown-model',
      modelSource: 'agent',
      providerMissing: false,
      modelMissing: false,
      modelSupported: false,
    })
  })

  it('marks a provider without any model explicit and request-blocking', () => {
    expect(resolvePipelineRequestProfile({
      layer: 'settings',
      layerProviderId: 'provider-modelless',
      globalProviderId: 'provider-global',
      agent: null,
      getProvider,
    })).toEqual({
      providerId: 'provider-modelless',
      source: 'layer',
      model: '',
      modelSource: 'provider-selected',
      providerMissing: false,
      modelMissing: true,
      modelSupported: false,
    })
  })
})
