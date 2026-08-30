import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { storageKey } from '../utils/storage-key'

export const usePipelineStore = defineStore('pipeline', () => {
  const currentStep = ref(0)  // 0=outline, 1=settings, 2=volumes, 3=chapters, 4=body
  const isGenerating = ref(false)
  const generationProgress = ref(0)
  const generationStatus = ref('')
  const generationAbortController = ref<AbortController | null>(null)
  const breakpoint = ref<any>(null)
  const chapterProgress = ref<{ volumeIndex: number; chapterIndex: number; total: number } | null>(null)

  const stepNames = ['outline', 'settings', 'volumes', 'chapters', 'body']
  const currentStepName = computed(() => stepNames[currentStep.value] || '')

  function setStep(step: number) {
    currentStep.value = step
  }

  function startGeneration() {
    generationAbortController.value?.abort()
    generationAbortController.value = new AbortController()
    isGenerating.value = true
    generationProgress.value = 0
    generationStatus.value = 'generating'
  }

  function updateProgress(percent: number, status?: string) {
    if (generationStatus.value === 'canceled') return
    generationProgress.value = percent
    if (status) generationStatus.value = status
  }

  function finishGeneration() {
    if (generationStatus.value === 'canceled') return
    isGenerating.value = false
    generationProgress.value = 100
    generationStatus.value = 'done'
    generationAbortController.value = null
  }

  function failGeneration(error: string) {
    if (generationStatus.value === 'canceled') return
    isGenerating.value = false
    generationStatus.value = 'failed: ' + error
    generationAbortController.value = null
  }

  function cancelGeneration() {
    if (!isGenerating.value) return false
    generationAbortController.value?.abort()
    generationAbortController.value = null
    isGenerating.value = false
    generationStatus.value = 'canceled'
    return true
  }

  function getGenerationSignal(): AbortSignal | undefined {
    return generationAbortController.value?.signal
  }

  function isGenerationCanceled() {
    return generationStatus.value === 'canceled'
  }

  async function saveBreakpoint(data: any) {
    breakpoint.value = data
    await window.electronAPI.storageWrite(storageKey('pipeline_breakpoint'), data)
    if (data && data.volumeIndex !== undefined) {
      chapterProgress.value = {
        volumeIndex: data.volumeIndex,
        chapterIndex: data.chapterIndex || 0,
        total: data.total || 0
      }
    }
  }

  async function refreshBreakpoint() {
    const saved = await window.electronAPI.storageRead(storageKey('pipeline_breakpoint')) || null
    breakpoint.value = saved
    if (saved && saved.volumeIndex !== undefined) {
      chapterProgress.value = {
        volumeIndex: saved.volumeIndex,
        chapterIndex: saved.chapterIndex || 0,
        total: saved.total || 0
      }
    }
    return saved
  }

  function updateChapterProgress(chapterIndex: number) {
    if (chapterProgress.value) {
      chapterProgress.value.chapterIndex = chapterIndex
    }
  }

  function clearChapterProgress() {
    chapterProgress.value = null
  }

  async function clearBreakpoint() {
    breakpoint.value = null
    chapterProgress.value = null
    await window.electronAPI.storageRemove(storageKey('pipeline_breakpoint'))
  }

  async function setStepSkills(step: number, skillIds: string[]) {
    try {
      const key = 'pipeline_step_config'
      const saved = await window.electronAPI.storageRead(storageKey(key))
      const config = JSON.parse(JSON.stringify(saved)) || { agents: {}, skills: {}, modes: {} }
      if (!config.skills) config.skills = {}
      config.skills[step] = skillIds.filter(Boolean)
      await window.electronAPI.storageWrite(storageKey(key), config)
    } catch(e) {
      console.warn('[pipeline] setStepSkills failed:', e)
    }
  }

  async function getStepSkills(step: number): Promise<string[]> {
    try {
      const key = 'pipeline_step_config'
      const saved = await window.electronAPI.storageRead(storageKey(key))
      if (saved && saved.skills && saved.skills[step]) {
        return saved.skills[step].filter(Boolean)
      }
    } catch(e) {}
    return []
  }

  async function setStepAgents(step: number, agentId: string) {
    try {
      const saved = await window.electronAPI.storageRead(storageKey('pipeline_step_config'))
      const config = JSON.parse(JSON.stringify(saved)) || { agents: {}, skills: {}, modes: {} }
      if (!config.agents) config.agents = {}
      config.agents[step] = agentId || ''
      await window.electronAPI.storageWrite(storageKey('pipeline_step_config'), config)
    } catch(e) {
      console.warn('[pipeline] setStepAgents failed:', e)
    }
  }

  async function getStepAgents(step: number): Promise<string> {
    try {
      const saved = await window.electronAPI.storageRead(storageKey('pipeline_step_config'))
      if (saved && saved.agents && saved.agents[step]) return saved.agents[step]
    } catch(e) {}
    return ''
  }

  async function setStepModes(step: number, mode: 'chain' | 'compose') {
    try {
      const saved = await window.electronAPI.storageRead(storageKey('pipeline_step_config'))
      const config = JSON.parse(JSON.stringify(saved)) || { agents: {}, skills: {}, modes: {} }
      if (!config.modes) config.modes = {}
      config.modes[step] = mode
      await window.electronAPI.storageWrite(storageKey('pipeline_step_config'), config)
    } catch(e) {
      console.warn('[pipeline] setStepModes failed:', e)
    }
  }

  async function getStepModes(step: number): Promise<'chain' | 'compose'> {
    try {
      const saved = await window.electronAPI.storageRead(storageKey('pipeline_step_config'))
      if (saved && saved.modes && saved.modes[step]) return saved.modes[step] === 'chain' ? 'chain' : 'compose'
    } catch(e) {}
    return 'compose'
  }

  async function updateStepConfig(step: number, patch: {
    agentId?: string
    skillIds?: string[]
    mode?: 'chain' | 'compose'
    skillAgentId?: string
    skillId?: string
  }) {
    try {
      const saved = await window.electronAPI.storageRead(storageKey('pipeline_step_config')) || {}
      const config = JSON.parse(JSON.stringify(saved)) || {}
      config.agents = config.agents || {}
      config.skills = config.skills || {}
      config.modes = config.modes || {}
      config.skillAgents = config.skillAgents || {}
      if (patch.agentId !== undefined) config.agents[step] = patch.agentId || ''
      if (patch.skillIds) config.skills[step] = patch.skillIds.filter(Boolean)
      if (patch.mode) config.modes[step] = patch.mode
      if (patch.skillId && patch.skillAgentId !== undefined) {
        const key = `${step}-${patch.skillId}`
        if (patch.skillAgentId) config.skillAgents[key] = patch.skillAgentId
        else delete config.skillAgents[key]
      }
      await window.electronAPI.storageWrite(storageKey('pipeline_step_config'), config)
    } catch(e) {
      console.warn('[pipeline] updateStepConfig failed:', e)
    }
  }

  async function readStepConfig(step: number): Promise<{
    agentId: string
    skillIds: string[]
    mode: 'chain' | 'compose'
    skillAgents: Record<string, string>
  }> {
    try {
      const saved = await window.electronAPI.storageRead(storageKey('pipeline_step_config')) || {}
      return {
        agentId: saved?.agents?.[step] || '',
        skillIds: Array.isArray(saved?.skills?.[step]) ? saved.skills[step].filter(Boolean) : [],
        mode: saved?.modes?.[step] === 'chain' ? 'chain' : 'compose',
        skillAgents: saved?.skillAgents || {}
      }
    } catch(e) {
      console.warn('[pipeline] readStepConfig failed:', e)
      return { agentId: '', skillIds: [], mode: 'compose', skillAgents: {} }
    }
  }

  return {
    currentStep, isGenerating, generationProgress, generationStatus, breakpoint, chapterProgress,
    currentStepName,
    setStep, startGeneration, updateProgress, finishGeneration, failGeneration, cancelGeneration, getGenerationSignal, isGenerationCanceled,
    saveBreakpoint, refreshBreakpoint, clearBreakpoint, updateChapterProgress, clearChapterProgress,
    setStepSkills, getStepSkills, setStepAgents, getStepAgents, setStepModes, getStepModes,
    updateStepConfig, readStepConfig
  }
})



