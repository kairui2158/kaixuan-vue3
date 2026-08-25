import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { storageKey } from '../utils/storage-key'

export interface Provider {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  models: string[]
  selectedModel: string
  temperature: number
  maxTokens: number
  purpose: ('generate' | 'rewrite' | 'verify' | 'detect' | 'image' | 'video')[]
  streamMode?: boolean
  systemPrompt?: string
}

export const useProviderStore = defineStore('provider', () => {
  const providers = ref<Provider[]>([])
  const generateProvider = ref<string | null>(null)
  const verifyProvider = ref<string | null>(null)
  const detectProvider = ref<string | null>(null)

  const activeGenerateProvider = computed(() =>
    providers.value.find(p => p.id === generateProvider.value)
  )
  const activeVerifyProvider = computed(() =>
    providers.value.find(p => p.id === verifyProvider.value)
  )
  const activeDetectProvider = computed(() =>
    providers.value.find(p => p.id === detectProvider.value)
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
      // Normalize legacy purpose string to array
      providers.value.forEach(function(p) {
        if (typeof p.purpose === 'string') p.purpose = [p.purpose]
        if (!Array.isArray(p.purpose) || p.purpose.length === 0) p.purpose = ['generate']
      })
    }
  }
}

async function saveProviders() {
  // Encrypt API keys before saving (migrated from old architecture renderer_v2.js L40-42)
  var copy = JSON.parse(JSON.stringify(providers.value))
  if (window.electronAPI && typeof window.electronAPI.encrypt === 'function') {
    for (const p of copy) {
      if (p.apiKey && p.apiKey.indexOf('enc:') !== 0) {
        try { p.apiKey = await window.electronAPI.encrypt(p.apiKey) } catch(e) { /* keep plaintext */ }
      }
    }
  }
  await window.electronAPI.storageWrite(storageKey('providers'), {
    providers: copy,
    generateProvider: generateProvider.value,
    verifyProvider: verifyProvider.value,
    detectProvider: detectProvider.value
  })
}

  function addProvider(provider: Provider) {
    providers.value.push(provider)
    saveProviders()
  }

  function updateProvider(id: string, data: Partial<Provider>) {
    const idx = providers.value.findIndex(p => p.id === id)
    if (idx >= 0) {
      providers.value[idx] = { ...providers.value[idx], ...data }
      saveProviders()
    }
  }

  function removeProvider(id: string) {
    providers.value = providers.value.filter(p => p.id !== id)
    if (generateProvider.value === id) generateProvider.value = null
    if (verifyProvider.value === id) verifyProvider.value = null
    if (detectProvider.value === id) detectProvider.value = null
    saveProviders()
  }

function setGenerateProvider(id: string) {
   generateProvider.value = id
   saveProviders()
 }

function setVerifyProvider(id: string) {
   verifyProvider.value = id
   saveProviders()
 }
function setDetectProvider(id: string) {
   detectProvider.value = id
   saveProviders()
 }

  async function fetchModels(providerId: string) {
    const p = providers.value.find(p => p.id === providerId)
    if (!p) return
    const models = await window.electronAPI.fetchModels(p.baseUrl, p.apiKey)
    updateProvider(providerId, { models })
    return models
  }

 async function testConnection(providerId: string) {
   const p = providers.value.find(p => p.id === providerId)
   if (!p) return { connected: false, error: 'Provider not found' }
   return await window.electronAPI.providerTestConnection(p.baseUrl, p.apiKey)
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
  const ids = new Set([generateProvider.value, verifyProvider.value, detectProvider.value].filter(Boolean) as string[])
  return providers.value.filter(p => ids.has(p.id))
}

  return {
    providers, generateProvider, verifyProvider, detectProvider,
    activeGenerateProvider, activeVerifyProvider, activeDetectProvider,
    loadProviders, saveProviders, addProvider, updateProvider,
    removeProvider, setGenerateProvider, setVerifyProvider, setDetectProvider, fetchModels,
    testConnection, getProvider, preferredGenerateProvider,
    getGenerateProvider, getVerifyProvider, getDetectProvider, getActiveProviders
  }
})


