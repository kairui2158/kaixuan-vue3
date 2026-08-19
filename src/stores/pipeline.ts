import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { storageKey } from '../utils/storage-key'

export const usePipelineStore = defineStore('pipeline', () => {
  const currentStep = ref(0)  // 0=outline, 1=settings, 2=volumes, 3=chapters, 4=body
  const isGenerating = ref(false)
  const generationProgress = ref(0)
  const generationStatus = ref('')
  const breakpoint = ref<any>(window.electronAPI.storageRead(storageKey('pipeline_breakpoint')) || null)
  const chapterProgress = ref<{ volumeIndex: number; chapterIndex: number; total: number } | null>(null)

  const stepNames = ['outline', 'settings', 'volumes', 'chapters', 'body']
  const currentStepName = computed(() => stepNames[currentStep.value] || '')

  function setStep(step: number) {
    currentStep.value = step
  }

  function startGeneration() {
    isGenerating.value = true
    generationProgress.value = 0
    generationStatus.value = 'generating'
  }

  function updateProgress(percent: number, status?: string) {
    generationProgress.value = percent
    if (status) generationStatus.value = status
  }

  function finishGeneration() {
    isGenerating.value = false
    generationProgress.value = 100
    generationStatus.value = 'done'
  }

  function failGeneration(error: string) {
    isGenerating.value = false
    generationStatus.value = 'failed: ' + error
  }

  function saveBreakpoint(data: any) {
    breakpoint.value = data
    window.electronAPI.storageWrite(storageKey('pipeline_breakpoint'), data)
    if (data && data.volumeIndex !== undefined) {
      chapterProgress.value = {
        volumeIndex: data.volumeIndex,
        chapterIndex: data.chapterIndex || 0,
        total: data.total || 0
      }
    }
  }

  function updateChapterProgress(chapterIndex: number) {
    if (chapterProgress.value) {
      chapterProgress.value.chapterIndex = chapterIndex
    }
  }

  function clearChapterProgress() {
    chapterProgress.value = null
  }

  function clearBreakpoint() {
    breakpoint.value = null
    chapterProgress.value = null
    window.electronAPI.storageRemove(storageKey('pipeline_breakpoint'))
  }

  function setStepSkills(step: number, skillIds: string[]) {
    try {
      const key = 'pipeline_step_config'
      const saved = window.electronAPI.storageRead(storageKey(key))
      const config = JSON.parse(JSON.stringify(saved)) || { agents: {}, skills: {}, modes: {} }
      if (!config.skills) config.skills = {}
      config.skills[step] = skillIds.filter(Boolean)
      window.electronAPI.storageWrite(storageKey(key), config)
    } catch(e) {
      console.warn('[pipeline] setStepSkills failed:', e)
    }
  }

  function getStepSkills(step: number): string[] {
    try {
      const key = 'pipeline_step_config'
      const saved = window.electronAPI.storageRead(storageKey(key))
      if (saved && saved.skills && saved.skills[step]) {
        return saved.skills[step].filter(Boolean)
      }
    } catch(e) {}
    return []
  }

  function setStepAgents(step: number, agentId: string) {
    try {
      const saved = window.electronAPI.storageRead(storageKey('pipeline_step_config'))
      const config = JSON.parse(JSON.stringify(saved)) || { agents: {}, skills: {}, modes: {} }
      if (!config.agents) config.agents = {}
      config.agents[step] = agentId || ''
      window.electronAPI.storageWrite(storageKey('pipeline_step_config'), config)
    } catch(e) {
      console.warn('[pipeline] setStepAgents failed:', e)
    }
  }

  function getStepAgents(step: number): string {
    try {
      const saved = window.electronAPI.storageRead(storageKey('pipeline_step_config'))
      if (saved && saved.agents && saved.agents[step]) return saved.agents[step]
    } catch(e) {}
    return ''
  }

  function setStepModes(step: number, mode: 'chain' | 'compose') {
    try {
      const saved = window.electronAPI.storageRead(storageKey('pipeline_step_config'))
      const config = JSON.parse(JSON.stringify(saved)) || { agents: {}, skills: {}, modes: {} }
      if (!config.modes) config.modes = {}
      config.modes[step] = mode
      window.electronAPI.storageWrite(storageKey('pipeline_step_config'), config)
    } catch(e) {
      console.warn('[pipeline] setStepModes failed:', e)
    }
  }

  function getStepModes(step: number): 'chain' | 'compose' {
    try {
      const saved = window.electronAPI.storageRead(storageKey('pipeline_step_config'))
      if (saved && saved.modes && saved.modes[step]) return saved.modes[step] === 'chain' ? 'chain' : 'compose'
    } catch(e) {}
    return 'compose'
  }

  return {
    currentStep, isGenerating, generationProgress, generationStatus, breakpoint, chapterProgress,
    currentStepName,
    setStep, startGeneration, updateProgress, finishGeneration, failGeneration,
    saveBreakpoint, clearBreakpoint, updateChapterProgress, clearChapterProgress,
    setStepSkills, getStepSkills, setStepAgents, getStepAgents, setStepModes, getStepModes
  }
})

