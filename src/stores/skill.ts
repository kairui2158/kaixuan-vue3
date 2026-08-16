import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { storageKey } from '../utils/storage-key'

export interface Skill {
  id: string
  name: string
  template: string
  category: string
  description?: string
  executionMode: 'chain' | 'split-merge' | 'multi-step'
  outputFormat: 'json' | 'text'
  validationRules: string[]
  splitSize: number
  injectMode?: string
  bindTarget?: any
  linkedSkillIds?: string[]
  createdAt?: string
  updatedAt?: string
  injectFrequency?: string
  injectDepth?: number
}

export const useSkillStore = defineStore('skill', () => {
  const skills = ref<Skill[]>([])
  const pipelineSkills = ref<string[]>([])
  const deAiSkills = ref<string[]>([])

  const orderedPipelineSkills = computed(() =>
    pipelineSkills.value.map(id => skills.value.find(s => s.id === id)).filter(Boolean)
  )
  const orderedDeAiSkills = computed(() =>
    deAiSkills.value.map(id => skills.value.find(s => s.id === id)).filter(Boolean)
  )

  function getSkill(id: string) {
    return skills.value.find(s => s.id === id)
  }

  function loadSkills() {
    const data = window.electronAPI.storageRead(storageKey('skills'))
    if (data) {
      if (Array.isArray(data)) {
        skills.value = data.map(function(s: any) {
          return {
            id: s.id,
            name: s.name,
            template: s.template,
            category: s.category || 'general',
            description: s.description || '',
            executionMode: s.executionMode || 'chain',
            outputFormat: s.outputFormat || 'text',
            validationRules: s.validationRules || [],
            splitSize: s.splitSize || 1000,
            injectMode: s.injectMode,
            bindTarget: s.bindTarget,
            linkedSkillIds: s.linkedSkillIds || [],
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
            injectFrequency: s.injectFrequency,
            injectDepth: s.injectDepth
          }
        })
      } else {
        skills.value = data.skills || []
        pipelineSkills.value = data.pipelineSkills || []
        deAiSkills.value = data.deAiSkills || []
      }
    }
  }

  function saveSkills() {
    window.electronAPI.storageWrite(storageKey('skills'), {
      skills: JSON.parse(JSON.stringify(skills.value)),
      pipelineSkills: JSON.parse(JSON.stringify(pipelineSkills.value)),
      deAiSkills: JSON.parse(JSON.stringify(deAiSkills.value))
    })
  }

  function addSkill(skill: Skill) {
    skills.value.push(skill)
    saveSkills()
  }

  function updateSkill(id: string, data: Partial<Skill>) {
    const idx = skills.value.findIndex(s => s.id === id)
    if (idx >= 0) {
      skills.value[idx] = { ...skills.value[idx], ...data }
      saveSkills()
    }
  }

  function removeSkill(id: string) {
    skills.value = skills.value.filter(s => s.id !== id)
    pipelineSkills.value = pipelineSkills.value.filter(sid => sid !== id)
    deAiSkills.value = deAiSkills.value.filter(sid => sid !== id)
    saveSkills()
  }

  function movePipelineSkillUp(index: number) {
    if (index > 0) {
      const arr = [...pipelineSkills.value]
      ;[arr[index - 1], arr[index]] = [arr[index], arr[index - 1]]
      pipelineSkills.value = arr
      saveSkills()
    }
  }

  function movePipelineSkillDown(index: number) {
    if (index < pipelineSkills.value.length - 1) {
      const arr = [...pipelineSkills.value]
      ;[arr[index], arr[index + 1]] = [arr[index + 1], arr[index]]
      pipelineSkills.value = arr
      saveSkills()
    }
  }

  return {
    skills, pipelineSkills, deAiSkills,
    orderedPipelineSkills, orderedDeAiSkills,
    getSkill, loadSkills, saveSkills, addSkill, updateSkill, removeSkill,
    movePipelineSkillUp, movePipelineSkillDown
  }
})
