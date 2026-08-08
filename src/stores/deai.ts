import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useDeAiStore = defineStore('deai', () => {
  const enabled = ref(false)
  const mode = ref<'chain' | 'split-merge' | 'multi-step'>('chain')
  const skillIds = ref<string[]>([])
  const agentId = ref<string | null>(null)
  const hardruleEnabled = ref(true)
  const level = ref<'light' | 'medium' | 'heavy'>('medium')
  const splitSize = ref(1000)
  const isProcessing = ref(false)
  const progress = ref(0)
  const currentStep = ref('')
  const flowPreview = ref<string[]>([])

  function loadConfig() {
    const data = window.electronAPI.storageRead('deAiConfig')
    if (data) {
      enabled.value = data.enabled || false
      mode.value = data.mode || 'chain'
      skillIds.value = data.skillIds || []
      agentId.value = data.agentId || null
      hardruleEnabled.value = data.hardruleEnabled !== false
      level.value = data.level || 'medium'
      splitSize.value = data.splitSize || 1000
    }
  }

  function saveConfig() {
    window.electronAPI.storageWrite('deAiConfig', {
      enabled: enabled.value,
      mode: mode.value,
      skillIds: skillIds.value,
      agentId: agentId.value,
      hardruleEnabled: hardruleEnabled.value,
      level: level.value,
      splitSize: splitSize.value
    })
  }

  function setMode(m: 'chain' | 'split-merge' | 'multi-step') {
    mode.value = m
    updateFlowPreview()
    saveConfig()
  }

  function updateFlowPreview() {
    if (mode.value === 'chain') {
      flowPreview.value = ['S1 rewrite', 'hardrule pre', 'S2 verify', 'hardrule post', 'write back']
    } else if (mode.value === 'split-merge') {
      flowPreview.value = ['split', 'parallel rewrite', 'join', 'write back']
    } else {
      flowPreview.value = ['extract event core', 'select perspective', 'reconstruct output', 'verify', 'write back']
    }
  }

  function startProcessing() {
    isProcessing.value = true
    progress.value = 0
  }

  function updateProgress(percent: number, step: string) {
    progress.value = percent
    currentStep.value = step
  }

  function finishProcessing() {
    isProcessing.value = false
    progress.value = 100
    currentStep.value = 'done'
  }

  return {
    enabled, mode, skillIds, agentId, hardruleEnabled, level, splitSize,
    isProcessing, progress, currentStep, flowPreview,
    loadConfig, saveConfig, setMode, updateFlowPreview,
    startProcessing, updateProgress, finishProcessing
  }
})
