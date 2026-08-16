import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { storageKey } from '../utils/storage-key'

export const useDeAiStore = defineStore('deai', () => {
  const enabled = ref(false)
  const mode = ref<'chain' | 'split-merge' | 'multi-step'>('chain')
  const skillIds = ref<string[]>([])
  const agentId = ref<string | null>(null)
 const hardruleEnabled = ref(true)
 const hardRules = ref<Record<string, boolean>>({})
const version = ref<'v2' | 'v3'>('v3')
const level = ref<'light' | 'medium' | 'heavy'>('medium')
  const textType = ref<'novel' | 'script' | 'media'>('novel')
  const splitSize = ref(1000)
  const isProcessing = ref(false)
  const progress = ref(0)
  const currentStep = ref('')
  const flowPreview = ref<string[]>([])

 function loadConfig() {
    let data = window.electronAPI.storageRead(storageKey('deAiConfig'))
    if (!data) data = window.electronAPI.storageRead(storageKey('app-deai-config'))
   if (data) {
     enabled.value = data.enabled || false
      mode.value = data.mode || data.agentMode || 'chain'
      skillIds.value = data.skillIds || data.skills || []
     agentId.value = data.agentId || null
     hardruleEnabled.value = data.hardruleEnabled !== undefined ? data.hardruleEnabled : (data.hardRulesEnabled !== false)
     hardRules.value = data.hardRules || {}
    version.value = data.version || 'v3'
   level.value = data.level || 'medium'
     textType.value = data.textType || 'novel'
    splitSize.value = data.splitSize || 1000
   }
    updateFlowPreview()
  }

 function saveConfig() {
   window.electronAPI.storageWrite(storageKey('deAiConfig'), {
     enabled: enabled.value,
     mode: mode.value,
     skillIds: JSON.parse(JSON.stringify(skillIds.value)),
     agentId: agentId.value,
     hardruleEnabled: hardruleEnabled.value,
     hardRules: JSON.parse(JSON.stringify(hardRules.value)),
     version: version.value,
     level: level.value,
     textType: textType.value,
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
      flowPreview.value = ['S1 rewrite', 'hardrule pre', 'S2 verify', 'hardrule post', 'cross-model', 'zhuque', 'done']
    } else if (mode.value === 'split-merge') {
      flowPreview.value = ['split', 'parallel rewrite', 'join', 'hardrule post', 'cross-model', 'zhuque', 'done']
    } else {
      flowPreview.value = ['extract event core', 'select perspective', 'reconstruct output', 'hardrule post', 'S2 verify', 'cross-model', 'zhuque', 'done']
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
  hardRules, version,
    textType,
   isProcessing, progress, currentStep, flowPreview,
    loadConfig, saveConfig, setMode, updateFlowPreview,
    startProcessing, updateProgress, finishProcessing
  }
})
