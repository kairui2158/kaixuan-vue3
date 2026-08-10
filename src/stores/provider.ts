import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

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
   const data = window.electronAPI.storageRead('providers')
   if (data) {
      if (Array.isArray(data)) {
        // Legacy format: raw array with purpose field on each provider
        providers.value = data
        // Auto-set generateProvider/verifyProvider from purpose field
        var gen = data.find(function(p) { return p.purpose === 'generate' })
        var ver = data.find(function(p) { return p.purpose === 'verify' })
        if (gen) generateProvider.value = gen.id
        if (ver) verifyProvider.value = ver.id
        // Fallback: if no purpose fields at all, set first as generate
        if (!gen && !ver && data.length > 0) generateProvider.value = data[0].id
      } else {
        providers.value = data.providers || []
        generateProvider.value = data.generateProvider || null
        verifyProvider.value = data.verifyProvider || null
      }
   }
 }

 function saveProviders() {
   window.electronAPI.storageWrite('providers', {
     providers: JSON.parse(JSON.stringify(providers.value)),
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
    if (verifyProvider.value === id) verifyProvider.value = null
   generateProvider.value = id
   saveProviders()
 }

 function setVerifyProvider(id: string) {
    if (generateProvider.value === id) generateProvider.value = null
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

  return {
    providers, generateProvider, verifyProvider,
    activeGenerateProvider, activeVerifyProvider,
    loadProviders, saveProviders, addProvider, updateProvider,
    removeProvider, setGenerateProvider, setVerifyProvider, fetchModels,
    testConnection
  }
})
