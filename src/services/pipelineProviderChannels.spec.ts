import { describe, expect, it } from 'vitest'
import {
  buildPipelineProviderChannelSnapshot,
  resolvePipelineRequestProfile,
  normalizePipelineLayerProviders,
  resolvePipelineProviderChannel,
} from './pipelineProviderChannels'

const providerExists = (id: string) => [
  'provider-agent',
  'provider-layer',
  'provider-global',
  'provider-modelless',
  'provider-detect',
].includes(id)

const providerById: Record<string, { selectedModel?: string; models?: string[]; purpose?: string[] }> = {
  'provider-agent': { selectedModel: 'agent-model', models: ['agent-model', 'agent-alt'], purpose: ['generate'] },
  'provider-layer': { selectedModel: 'layer-model', models: ['layer-model', 'layer-alt'], purpose: ['generate'] },
  'provider-global': { selectedModel: 'global-model', models: ['global-model'], purpose: ['generate'] },
  'provider-modelless': { selectedModel: '', models: [], purpose: ['generate'] },
  'provider-detect': { selectedModel: 'detect-model', models: ['detect-model'], purpose: ['detect'] },
}

const getProvider = (id: string) => providerById[id]

describe('pipelineProviderChannels', () => {
  it('prefers the layer binding over the agent and global providers', () => {
    expect(resolvePipelineProviderChannel({
      layer: 'volumes',
      layerProviderId: 'provider-layer',
      agentProviderId: 'provider-agent',
      globalProviderId: 'provider-global',
      providerExists,
    })).toEqual({
      providerId: 'provider-layer',
      source: 'layer',
      providerMissing: false,
      providerUnsupported: false,
    })
  })

  it('uses the agent binding only when the layer binding is absent', () => {
    expect(resolvePipelineProviderChannel({
      layer: 'chapters',
      layerProviderId: null,
      agentProviderId: 'provider-agent',
      globalProviderId: 'provider-global',
      providerExists,
    })).toEqual({
      providerId: 'provider-agent',
      source: 'agent',
      providerMissing: false,
      providerUnsupported: false,
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
      providerUnsupported: false,
    })
  })

  it('marks a configured agent provider missing instead of silently falling back when the layer binding is absent', () => {
    expect(resolvePipelineProviderChannel({
      layer: 'settings',
      layerProviderId: null,
      agentProviderId: 'deleted-provider',
      globalProviderId: 'provider-global',
      providerExists,
    })).toEqual({
      providerId: 'deleted-provider',
      source: 'agent',
      providerMissing: true,
      providerUnsupported: false,
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
      providerUnsupported: false,
    })
  })

  it('marks a resolved provider without generate purpose as unsupported', () => {
    const providerCanGenerate = (id: string) => id !== 'provider-detect'

    expect(resolvePipelineProviderChannel({
      layer: 'volumes',
      layerProviderId: 'provider-detect',
      agentProviderId: '',
      globalProviderId: 'provider-global',
      providerExists,
      providerCanGenerate,
    })).toEqual({
      providerId: 'provider-detect',
      source: 'layer',
      providerMissing: false,
      providerUnsupported: true,
    })

    expect(resolvePipelineProviderChannel({
      layer: 'body',
      layerProviderId: '',
      agentProviderId: 'provider-detect',
      globalProviderId: 'provider-global',
      providerExists,
      providerCanGenerate,
    })).toEqual({
      providerId: 'provider-detect',
      source: 'agent',
      providerMissing: false,
      providerUnsupported: true,
    })

    expect(resolvePipelineProviderChannel({
      layer: 'settings',
      layerProviderId: '',
      agentProviderId: '',
      globalProviderId: 'provider-detect',
      providerExists,
      providerCanGenerate,
    })).toEqual({
      providerId: 'provider-detect',
      source: 'global',
      providerMissing: false,
      providerUnsupported: true,
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
      providerUnsupported: false,
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
      agentProviderId: null,
      globalProviderId: ' provider-global ',
      providerExists,
    })).toEqual({
      layer: 'chapters',
      layerProviderId: 'provider-layer',
      agentProviderId: '',
      globalProviderId: 'provider-global',
      providerId: 'provider-layer',
      source: 'layer',
      providerMissing: false,
      providerUnsupported: false,
    })
  })

  it('uses the agent model only when the agent explicitly binds the provider', () => {
    expect(resolvePipelineRequestProfile({
      layer: 'volumes',
      layerProviderId: null,
      globalProviderId: 'provider-global',
      agent: { providerId: 'provider-agent', model: 'agent-model' },
      getProvider,
    })).toEqual({
      providerId: 'provider-agent',
      source: 'agent',
      model: 'agent-model',
      modelSource: 'agent',
      providerMissing: false,
      providerUnsupported: false,
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
      providerUnsupported: false,
      modelMissing: false,
      modelSupported: true,
      modelFallback: {
        reason: 'agent-model-without-provider',
        configuredModel: 'agent-model',
      },
    })
  })

  it('marks an agent model unsupported when the agent provider resolves the channel', () => {
    expect(resolvePipelineRequestProfile({
      layer: 'body',
      layerProviderId: null,
      globalProviderId: 'provider-global',
      agent: { providerId: 'provider-agent', model: 'unknown-model' },
      getProvider,
    })).toEqual({
      providerId: 'provider-agent',
      source: 'agent',
      model: 'unknown-model',
      modelSource: 'agent',
      providerMissing: false,
      providerUnsupported: false,
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
      providerUnsupported: false,
      modelMissing: true,
      modelSupported: false,
    })
  })

  it('carries generate purpose eligibility through the request profile', () => {
    expect(resolvePipelineRequestProfile({
      layer: 'volumes',
      layerProviderId: 'provider-detect',
      globalProviderId: 'provider-global',
      agent: null,
      getProvider,
      providerCanGenerate: id => id !== 'provider-detect',
    })).toMatchObject({
      providerId: 'provider-detect',
      source: 'layer',
      providerUnsupported: true,
      model: 'detect-model',
      modelMissing: false,
      modelSupported: true,
    })
  })
})
