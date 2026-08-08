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
      providers.value = data.providers || []
      generateProvider.value = data.generateProvider || null
      verifyProvider.value = data.verifyProvider || null
    }
  }

  function saveProviders() {
    window.electronAPI.storageWrite('providers', {
      providers: providers.value,
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

  return {
    providers, generateProvider, verifyProvider,
    activeGenerateProvider, activeVerifyProvider,
    loadProviders, saveProviders, addProvider, updateProvider,
    removeProvider, setGenerateProvider, setVerifyProvider, fetchModels
  }
})
