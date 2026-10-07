import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { storageKey } from '../utils/storage-key'

export interface DeAiFinding {
  id: string
  severity: 'blocking' | 'advisory'
  type: string
  count: number
  perKilo: number
  samples: string[]
  suggestion: string
}

export interface DeAiDetectReport {
  findings: DeAiFinding[]
  metrics: {
    sentenceLengthCV: number
    connectorDensity: number
    protectedSpans: { total: number, hit: number, missing: string[] }
    retentionRatio: number
  }
}

export type DeAiHardRuleMode = 'legacy-auto' | 'detect-report' | 'deep-fix'

export interface DeAiProcessingStage {
  step: string
  percent: number
  ts: number
}

export type DeAiRunStatus = 'idle' | 'running' | 'waiting_budget' | 'failed'

export interface DeAiBudgetState {
  used: number
  limit: number
  extensions: number
  blockedReason?: string
}

export interface DeAiResumeHandle {
  budget: {
    tryConsume: (step: string, skillLimit?: number | null) => { status: 'allowed' | 'blocked'; used: number; limit: number; reason?: string; step?: string }
    extend: (additional: number) => { used: number; limit: number; extensions: number }
    snapshot: () => { used: number; limit: number; extensions?: number; entries?: unknown[] }
  }
  resume: () => void
}

export const useDeAiStore = defineStore('deai', () => {
 const enabled = ref(false)
 const mode = ref<'chain' | 'split-merge' | 'multi-step'>('chain')
  const skillIds = ref<string[]>([])
  const agentId = ref<string | null>(null)
  const hardruleEnabled = ref(true)
  const hardRules = ref<Record<string, boolean>>({})
  const hardRuleMode = ref<DeAiHardRuleMode>('detect-report')
  const lastDetectReport = ref<DeAiDetectReport | null>(null)
const version = ref<'v2' | 'v3'>('v3')
const level = ref<'light' | 'medium' | 'heavy'>('medium')
  const textType = ref<'novel' | 'script' | 'media'>('novel')
  const splitSize = ref(1000)
  const isProcessing = ref(false)
  const progress = ref(0)
  const currentStep = ref('')
  const flowPreview = ref<string[]>([])
  const errorMessage = ref('')
  const lastFailedStep = ref('')
  const processingStages = ref<DeAiProcessingStage[]>([])
  const runStatus = ref<DeAiRunStatus>('idle')
  const budgetState = ref<DeAiBudgetState | null>(null)
  const resumeHandle = ref<DeAiResumeHandle | null>(null)

 async function loadConfig() {
    let data = await window.electronAPI.storageRead(storageKey('deAiConfig'))
    if (!data) data = await window.electronAPI.storageRead(storageKey('app-deai-config'))
   if (data) {
     enabled.value = data.enabled || false
      mode.value = data.mode || data.agentMode || 'chain'
      skillIds.value = data.skillIds || data.skills || []
     agentId.value = data.agentId || null
     hardruleEnabled.value = data.hardruleEnabled !== undefined ? data.hardruleEnabled : (data.hardRulesEnabled !== false)
     hardRules.value = data.hardRules || {}
     if (data.hardRuleMode === 'legacy-auto' || data.hardRuleMode === 'deep-fix' || data.hardRuleMode === 'detect-report') {
       hardRuleMode.value = data.hardRuleMode
     } else {
       hardRuleMode.value = 'detect-report'
     }
     lastDetectReport.value = isValidDetectReport(data.lastDetectReport) ? data.lastDetectReport : null
    version.value = data.version || 'v3'
   level.value = data.level || 'medium'
     textType.value = data.textType || 'novel'
    splitSize.value = data.splitSize || 1000
   }
    updateFlowPreview()
  }

 async function saveConfig() {
   await window.electronAPI.storageWrite(storageKey('deAiConfig'), {
     enabled: enabled.value,
     mode: mode.value,
     skillIds: JSON.parse(JSON.stringify(skillIds.value)),
     agentId: agentId.value,
     hardruleEnabled: hardruleEnabled.value,
     hardRules: JSON.parse(JSON.stringify(hardRules.value)),
     hardRuleMode: hardRuleMode.value,
     lastDetectReport: lastDetectReport.value ? JSON.parse(JSON.stringify(lastDetectReport.value)) : null,
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

 function setHardRuleMode(nextMode: DeAiHardRuleMode) {
   hardRuleMode.value = nextMode
   saveConfig()
 }

 function setLastDetectReport(report: DeAiDetectReport | null) {
   lastDetectReport.value = report
 }

 function isValidDetectReport(value: unknown): value is DeAiDetectReport {
  if (!value || typeof value !== 'object') return false
  const report = value as Partial<DeAiDetectReport>
  return Array.isArray(report.findings)
    && !!report.metrics
    && typeof report.metrics.sentenceLengthCV === 'number'
    && typeof report.metrics.connectorDensity === 'number'
    && typeof report.metrics.retentionRatio === 'number'
    && !!report.metrics.protectedSpans
    && Array.isArray(report.metrics.protectedSpans.missing)
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
   runStatus.value = 'running'
   progress.value = 0
   errorMessage.value = ''
   lastFailedStep.value = ''
   processingStages.value = []
   budgetState.value = null
   resumeHandle.value = null
 }

  function updateProgress(percent: number, step: string) {
    progress.value = percent
    currentStep.value = step
    if (!isProcessing.value) return
    processingStages.value.push({
      step,
      percent,
      ts: Date.now()
    })
  }

 function finishProcessing() {
   isProcessing.value = false
   runStatus.value = 'idle'
   progress.value = 100
   currentStep.value = 'done'
   budgetState.value = null
   resumeHandle.value = null
 }

 function setBudgetState(state: DeAiBudgetState | null) {
   budgetState.value = state
 }

 function attachBudgetHandle(handle: DeAiResumeHandle | null) {
   resumeHandle.value = handle
 }

 function waitBudget(reason: string) {
   runStatus.value = 'waiting_budget'
   budgetState.value = {
     ...(budgetState.value || { used: 0, limit: 0, extensions: 0 }),
     blockedReason: reason
   }
 }

 function extendBudget(additional = 4) {
   const handle = resumeHandle.value
   if (!handle || runStatus.value !== 'waiting_budget') return false
   const snapshot = handle.budget.extend(additional)
   budgetState.value = {
     used: snapshot.used,
     limit: snapshot.limit,
     extensions: snapshot.extensions,
     blockedReason: undefined
   }
   runStatus.value = 'running'
   isProcessing.value = true
   handle.resume()
   return true
 }

 function setError(message: string, step = '') {
   runStatus.value = 'failed'
   errorMessage.value = message || '处理失败，请重试'
    lastFailedStep.value = step || currentStep.value
    currentStep.value = lastFailedStep.value ? `${lastFailedStep.value}失败` : '处理失败'
  }

  function clearError() {
    errorMessage.value = ''
    lastFailedStep.value = ''
  }

  return {
  enabled, mode, skillIds, agentId, hardruleEnabled, level, splitSize,
  hardRules, hardRuleMode, lastDetectReport, version,
    textType,
   isProcessing, progress, currentStep, flowPreview, errorMessage, lastFailedStep, processingStages,
   runStatus, budgetState, resumeHandle,
    loadConfig, saveConfig, setMode, updateFlowPreview,
    setHardRuleMode, setLastDetectReport,
   startProcessing, updateProgress, finishProcessing, setError, clearError,
   setBudgetState, attachBudgetHandle, waitBudget, extendBudget
 }
})


