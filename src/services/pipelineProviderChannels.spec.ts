import { describe, expect, it } from 'vitest'
import {
  buildPipelineProviderChannelSnapshot,
  normalizePipelineLayerProviders,
  resolvePipelineProviderChannel,
} from './pipelineProviderChannels'

const providerExists = (id: string) => ['provider-agent', 'provider-layer', 'provider-global'].includes(id)

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
})
