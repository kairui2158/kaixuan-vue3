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
  purpose: 'generate' | 'verify'
  streamMode?: boolean
  systemPrompt?: string
}

export const useProviderStore = defineStore('provider', () => {
  const providers = ref<Provider[]>([])
  const generateProvider = ref<string | null>(null)
  const verifyProvider = ref<string | null>(null)

  const activeGenerateProvider = computed(() =>
    providers.value.find(p => p.id === generateProvider.value)
  )
  const activeVerifyProvider = computed(() =>
    providers.value.find(p => p.id === verifyProvider.value)
  )

function loadProviders() {
  const data = window.electronAPI.storageRead(storageKey('providers'))
  if (data) {
    if (Array.isArray(data)) {
      // Legacy format: raw array with purpose field on each provider
      providers.value = data
      // Decrypt API keys on load (migrated from old architecture renderer_v2.js L28-29)
      if (window.electronAPI && typeof window.electronAPI.decrypt === 'function') {
        providers.value.forEach(function(p) {
          if (p.apiKey && p.apiKey.indexOf('enc:') === 0) {
            try { p.apiKey = window.electronAPI.decrypt(p.apiKey) } catch(e) { /* keep encrypted form */ }
          }
        })
      }
      // Auto-set generateProvider/verifyProvider from purpose field
      var gen = data.find(function(p) { return p.purpose === 'generate' })
      var ver = data.find(function(p) { return p.purpose === 'verify' })
      if (gen) generateProvider.value = gen.id
      if (ver) verifyProvider.value = ver.id
      // Fallback: if no purpose fields at all, set first as generate
      if (!gen && !ver && data.length > 0) generateProvider.value = data[0].id
    } else {
      providers.value = data.providers || []
      // Decrypt API keys on load (migrated from old architecture renderer_v2.js L28-29)
      if (window.electronAPI && typeof window.electronAPI.decrypt === 'function') {
        providers.value.forEach(function(p) {
          if (p.apiKey && p.apiKey.indexOf('enc:') === 0) {
            try { p.apiKey = window.electronAPI.decrypt(p.apiKey) } catch(e) { /* keep encrypted form */ }
          }
        })
      }
      generateProvider.value = data.generateProvider || null
      verifyProvider.value = data.verifyProvider || null
    }
  }
}

function saveProviders() {
  // Encrypt API keys before saving (migrated from old architecture renderer_v2.js L40-42)
  var copy = JSON.parse(JSON.stringify(providers.value))
  if (window.electronAPI && typeof window.electronAPI.encrypt === 'function') {
    copy.forEach(function(p) {
      if (p.apiKey && p.apiKey.indexOf('enc:') !== 0) {
        try { p.apiKey = window.electronAPI.encrypt(p.apiKey) } catch(e) { /* keep plaintext */ }
      }
    })
  }
  window.electronAPI.storageWrite(storageKey('providers'), {
    providers: copy,
    generateProvider: generateProvider.value,
    verifyProvider: verifyProvider.value
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

async function callApi(providerId: string, model: string, messages: Array<{ role: string; content: string }>): Promise<string> {
  const p = providers.value.find(p => p.id === providerId)
  if (!p) throw new Error('Provider not found: ' + providerId)
  const resp = await fetch(p.baseUrl + '/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + p.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature: p.temperature || 0.7, max_tokens: p.maxTokens || 8192, stream: false })
  })
  if (!resp.ok) throw new Error('API error: ' + resp.status)
  const data = await resp.json()
  return data.choices?.[0]?.message?.content || ''
}

  return {
    providers, generateProvider, verifyProvider,
    activeGenerateProvider, activeVerifyProvider,
    loadProviders, saveProviders, addProvider, updateProvider,
    removeProvider, setGenerateProvider, setVerifyProvider, fetchModels,
    testConnection, getProvider, preferredGenerateProvider, callApi
  }
})
