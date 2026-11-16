import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { storageKey } from '../utils/storage-key'
import { normalizeProviderType } from '../services/providerProtocols'
import type { ThinkingProbeResult } from '../services/providerThinkingProbe'
import {
  PIPELINE_PROVIDER_CHANNEL_LAYERS,
  normalizePipelineLayerProviders,
  type PipelineProviderChannelLayer,
} from '../services/pipelineProviderChannels'

export type ProviderProtocolType =
  | 'openai-compatible'
  | 'deepseek'
  | 'anthropic'
  | 'gemini'
  | 'azure-openai'

export type ProviderEndpointMode = 'auto' | 'base' | 'full'

export interface Provider {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  models: string[]
  selectedModel: string
  temperature: number
  maxTokens: number
  /** Input context window in tokens; 0 means undeclared. */
  contextWindowTokens?: number
  /** Provider-declared request body field that disables thinking; use with a JSON string value. */
  thinkingDisableParam?: string
  /** JSON value for thinkingDisableParam; a plain string is sent verbatim. */
  thinkingDisableValue?: string
  /** Last provider thinking-disable probe; stored for observability, never auto-cleared. */
  thinkingProbe?: ThinkingProbeResult
  timeoutMs?: number
  purpose: ('generate' | 'rewrite' | 'verify' | 'detect' | 'image' | 'video')[]
  streamMode?: boolean
  systemPrompt?: string
  providerType: ProviderProtocolType
  endpointMode?: ProviderEndpointMode
  chatPath?: string
  modelsPath?: string
  deployment?: string
  apiVersion?: string
}

export const useProviderStore = defineStore('provider', () => {
  const providers = ref<Provider[]>([])
  const generateProvider = ref<string | null>(null)
  const verifyProvider = ref<string | null>(null)
  const detectProvider = ref<string | null>(null)
  const pipelineLayerProviders = ref<Partial<Record<PipelineProviderChannelLayer, string | null>>>({})

  const activeGenerateProvider = computed(() =>
    providers.value.find(p => p.id === generateProvider.value)
  )
  const activeVerifyProvider = computed(() =>
    providers.value.find(p => p.id === verifyProvider.value)
  )
  const activeDetectProvider = computed(() =>
    providers.value.find(p => p.id === detectProvider.value)
  )
  const pipelineLayerProviderIds = computed(() =>
    Object.values(pipelineLayerProviders.value).filter(Boolean) as string[]
  )

async function loadProviders() {
  const data = await window.electronAPI.storageRead(storageKey('providers'))
  if (data) {
    if (Array.isArray(data)) {
      // Legacy format: raw array with purpose field on each provider
      providers.value = data
      // Decrypt API keys on load - use for...of for async
      if (window.electronAPI && typeof window.electronAPI.decrypt === 'function') {
        for (const p of providers.value) {
          if (p.apiKey && p.apiKey.indexOf('enc:') === 0) {
            try { p.apiKey = await window.electronAPI.decrypt(p.apiKey) } catch(e) { /* keep encrypted form */ }
          }
        }
      }
      // Auto-set generateProvider/verifyProvider from purpose field
      // Normalize legacy purpose string to array
      providers.value.forEach(function(p) {
        if (typeof p.purpose === 'string') p.purpose = [p.purpose]
        if (!Array.isArray(p.purpose) || p.purpose.length === 0) p.purpose = ['generate']
        p.providerType = normalizeProviderType(p.providerType)
        normalizeContextWindow(p)
      })
      pipelineLayerProviders.value = normalizePipelineLayerProviders({
        ...pipelineLayerProviders.value,
        ...unsupportedLayerBindingsToClear(pipelineLayerProviders.value, providers.value),
      })
      var gen = data.find(function(p) { return p.purpose.indexOf('generate') >= 0 })
      var ver = data.find(function(p) { return p.purpose.indexOf('verify') >= 0 })
      if (gen) generateProvider.value = gen.id
      if (ver) verifyProvider.value = ver.id
      // Fallback: if no purpose fields at all, set first as generate
      if (!gen && !ver && data.length > 0) generateProvider.value = data[0].id
    } else {
      providers.value = data.providers || []
      // Decrypt API keys on load - use for...of for async
      if (window.electronAPI && typeof window.electronAPI.decrypt === 'function') {
        for (const p of providers.value) {
          if (p.apiKey && p.apiKey.indexOf('enc:') === 0) {
            try { p.apiKey = await window.electronAPI.decrypt(p.apiKey) } catch(e) { /* keep encrypted form */ }
          }
        }
      }
      generateProvider.value = data.generateProvider || null
      verifyProvider.value = data.verifyProvider || null
      detectProvider.value = data.detectProvider || null
      pipelineLayerProviders.value = normalizePipelineLayerProviders(data.pipelineLayerProviders)
      // Normalize legacy purpose string to array
      providers.value.forEach(function(p) {
        if (typeof p.purpose === 'string') p.purpose = [p.purpose]
        if (!Array.isArray(p.purpose) || p.purpose.length === 0) p.purpose = ['generate']
        p.providerType = normalizeProviderType(p.providerType)
        normalizeContextWindow(p)
      })
      const unsupportedLayerBindings = unsupportedLayerBindingsToClear(
        pipelineLayerProviders.value,
        providers.value,
      )
      if (Object.keys(unsupportedLayerBindings).length > 0) {
        pipelineLayerProviders.value = normalizePipelineLayerProviders({
          ...pipelineLayerProviders.value,
          ...unsupportedLayerBindings,
        })
      }
    }
  }
}

async function saveProviders() {
  // Encrypt API keys before saving (migrated from old architecture renderer_v2.js L40-42)
  var copy = JSON.parse(JSON.stringify(providers.value))
  var pipelineLayerSnapshot = JSON.parse(JSON.stringify(pipelineLayerProviders.value))
  if (window.electronAPI && typeof window.electronAPI.encrypt === 'function') {
    for (const p of copy) {
      if (p.apiKey && p.apiKey.indexOf('enc:') !== 0) {
        try { p.apiKey = await window.electronAPI.encrypt(p.apiKey) } catch(e) { /* keep plaintext */ }
      }
    }
  }
  return await window.electronAPI.storageWrite(storageKey('providers'), {
    providers: copy,
    generateProvider: generateProvider.value,
    verifyProvider: verifyProvider.value,
    detectProvider: detectProvider.value,
    pipelineLayerProviders: pipelineLayerSnapshot
  })
}

  function addProvider(provider: Provider) {
    normalizeContextWindow(provider)
    providers.value.push(provider)
    saveProviders()
  }

  function upsertProvider(provider: Provider, options: { preserveRuntimeState?: boolean } = {}) {
    const imported = { ...provider }
    normalizeContextWindow(imported)
    const idx = providers.value.findIndex(p => p.id === imported.id)
    if (idx >= 0) {
      const current = providers.value[idx]
      const replacement = options.preserveRuntimeState
        ? {
          ...current,
          ...imported,
          models: imported.models && imported.models.length > 0
            ? [...imported.models]
            : [...(current.models || [])],
        }
        : imported
      providers.value[idx] = replacement
    } else {
      providers.value.push(imported)
    }
    saveProviders()
  }

  function updateProvider(id: string, data: Partial<Provider>) {
    const idx = providers.value.findIndex(p => p.id === id)
    if (idx >= 0) {
      providers.value[idx] = { ...providers.value[idx], ...data }
      normalizeContextWindow(providers.value[idx])
      saveProviders()
    }
  }

  function removeProvider(id: string) {
    providers.value = providers.value.filter(p => p.id !== id)
    if (generateProvider.value === id) generateProvider.value = null
    if (verifyProvider.value === id) verifyProvider.value = null
    if (detectProvider.value === id) detectProvider.value = null
    for (const layer of Object.keys(pipelineLayerProviders.value) as PipelineProviderChannelLayer[]) {
      if (pipelineLayerProviders.value[layer] === id) pipelineLayerProviders.value[layer] = null
    }
    saveProviders()
  }

  function setPipelineLayerProvider(layer: PipelineProviderChannelLayer, providerId: string | null) {
    const next = normalizePipelineLayerProviders({
      ...pipelineLayerProviders.value,
      [layer]: providerId,
    })
    pipelineLayerProviders.value = next
    saveProviders()
  }

  function clearPipelineLayersForProvider(providerId: string): PipelineProviderChannelLayer[] {
    const cleared: PipelineProviderChannelLayer[] = []
    for (const layer of PIPELINE_PROVIDER_CHANNEL_LAYERS) {
      if (pipelineLayerProviders.value[layer] === providerId) {
        pipelineLayerProviders.value[layer] = null
        cleared.push(layer)
      }
    }
    if (cleared.length > 0) saveProviders()
    return cleared
  }

function setGenerateProvider(id: string | null) {
   generateProvider.value = id || null
   saveProviders()
}

function setVerifyProvider(id: string | null) {
  verifyProvider.value = id || null
  saveProviders()
}
function setDetectProvider(id: string | null) {
  detectProvider.value = id || null
  saveProviders()
}

  async function fetchModels(providerId: string) {
    const p = providers.value.find(p => p.id === providerId)
    if (!p) return
    const { getAiService } = await import('../services/aiService')
    const service = await getAiService()
    const models = await service.fetchModelsForProvider(p)
    updateProvider(providerId, { models })
    return models
  }

 async function testConnection(providerId: string) {
   const p = providers.value.find(p => p.id === providerId)
   if (!p) return { connected: false, error: 'Provider not found' }
   const { getAiService } = await import('../services/aiService')
   const service = await getAiService()
   return await service.testConnectionForProvider(p)
 }


function getProvider(id: string): Provider | undefined {
  return providers.value.find(p => p.id === id)
}

const preferredGenerateProvider = computed(() => activeGenerateProvider.value)
function getGenerateProvider(): Provider | undefined {
  return activeGenerateProvider.value
}
function getVerifyProvider(): Provider | undefined {
  return activeVerifyProvider.value
}
function getDetectProvider(): Provider | undefined {
  return activeDetectProvider.value
}
function getActiveProviders(): Provider[] {
  const ids = new Set([
    generateProvider.value,
    verifyProvider.value,
    detectProvider.value,
    ...pipelineLayerProviderIds.value,
  ].filter(Boolean) as string[])
  return providers.value.filter(p => ids.has(p.id))
}

  return {
    providers, generateProvider, verifyProvider, detectProvider, pipelineLayerProviders,
    activeGenerateProvider, activeVerifyProvider, activeDetectProvider,
    loadProviders, saveProviders, addProvider, upsertProvider, updateProvider,
    removeProvider, setGenerateProvider, setVerifyProvider, setDetectProvider,
    setPipelineLayerProvider, clearPipelineLayersForProvider, fetchModels,
    testConnection, getProvider, preferredGenerateProvider,
    getGenerateProvider, getVerifyProvider, getDetectProvider, getActiveProviders,
    pipelineLayerProviderIds
  }
})

function unsupportedLayerBindingsToClear(
  value: Partial<Record<PipelineProviderChannelLayer, string | null>>,
  providers: Provider[]
): Partial<Record<PipelineProviderChannelLayer, string | null>> {
  const result: Partial<Record<PipelineProviderChannelLayer, string | null>> = {}
  for (const layer of PIPELINE_PROVIDER_CHANNEL_LAYERS) {
    const providerId = value[layer] || null
    if (!providerId) continue
    const provider = providers.find(p => p.id === providerId)
    const purposes = provider ? (Array.isArray(provider.purpose) ? provider.purpose : [provider.purpose]) : []
    if (provider && !purposes.includes('generate')) result[layer] = null
  }
  return result
}

function normalizeContextWindow(provider: Provider) {
  const value = Number((provider as Provider & { contextWindowTokens?: number | string | null }).contextWindowTokens)
  provider.contextWindowTokens = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}


