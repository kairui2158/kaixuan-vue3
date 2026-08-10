import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const usePipelineStore = defineStore('pipeline', () => {
  const currentStep = ref(0)  // 0=outline, 1=settings, 2=volumes, 3=chapters, 4=body
  const isGenerating = ref(false)
  const generationProgress = ref(0)
  const generationStatus = ref('')
  const breakpoint = ref<any>(null)
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
  }

  return {
    currentStep, isGenerating, generationProgress, generationStatus, breakpoint, chapterProgress,
    currentStepName,
    setStep, startGeneration, updateProgress, finishGeneration, failGeneration,
    saveBreakpoint, clearBreakpoint, updateChapterProgress, clearChapterProgress
  }
})
