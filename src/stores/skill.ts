import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { storageKey } from '../utils/storage-key'
import type { JsonSchema, SkillRetryPolicy } from '../services/skillValidation'
import { serializeSkillMd } from '../services/configExchange/markdown'
import { toSkillRecord } from '../services/configExchange'

export interface Skill {
  id: string
  name: string
  format?: 'text' | 'folder'
  /** 文件夹技能的来源 ID，即 SKILL.md 中声明的原始 id */
  sourceId?: string
  folderPath?: string
  version?: string
  source?: 'package' | 'external' | 'legacy'
  packageHash?: string
  template: string
  category: string
  description?: string
  /** Folder skill catalog summary; full package content is loaded on activation. */
  resourceSummary?: {
    resourceCount: number
    warningCount: number
  }
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
  contextPolicy?: {
    chatHistory?: 'none' | 'recent' | 'summary' | 'full'
    includeOutline?: boolean
    includeMemory?: boolean
  }
  customVars?: Record<string, string>
  inputSchema?: JsonSchema | string
  outputSchema?: JsonSchema | string
  retryPolicy?: SkillRetryPolicy | string
  intents?: string[]
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

  /** 文件夹技能使用独立命名空间，允许与同 ID 文本技能共存 */
  function normalizeSkillId(id: string, format?: 'text' | 'folder') {
    return format === 'folder' ? `folder:${id.replace(/^folder:/, '')}` : id
  }

  function displaySkillName(skill: Pick<Skill, 'name' | 'format'>) {
    return skill.format === 'folder' ? `${skill.name}（文件夹）` : `${skill.name}（文本）`
  }

  async function importSkills(
    list: Skill[],
    options: {
      strategy?: 'skip' | 'overwrite'
      pipelineSkills?: string[]
      deAiSkills?: string[]
    } = {},
  ): Promise<{ added: number; updated: number; skipped: number }> {
    const strategy = options.strategy || 'skip'
    const existing = new Map(skills.value.map(s => [s.id, s]))
    let added = 0
    let updated = 0
    let skipped = 0
    const now = new Date().toISOString()

    for (const skill of list) {
      const normalized = { ...skill, id: normalizeSkillId(skill.id, skill.format) }
      const current = existing.get(normalized.id)
      if (current) {
        if (strategy === 'overwrite') {
          Object.assign(current, normalized, { updatedAt: now })
          updated++
        } else {
          skipped++
        }
      } else {
        skills.value.push(normalized)
        existing.set(normalized.id, normalized)
        added++
      }
    }

    for (const id of options.pipelineSkills || []) {
      const normalizedId = existing.has(id) ? id : normalizeSkillId(id, 'folder')
      if (existing.has(normalizedId) && !pipelineSkills.value.includes(normalizedId)) pipelineSkills.value.push(normalizedId)
    }
    for (const id of options.deAiSkills || []) {
      const normalizedId = existing.has(id) ? id : normalizeSkillId(id, 'folder')
      if (existing.has(normalizedId) && !deAiSkills.value.includes(normalizedId)) deAiSkills.value.push(normalizedId)
    }
    if (added > 0 || updated > 0 || (options.pipelineSkills || []).length > 0 || (options.deAiSkills || []).length > 0) {
      await saveSkills()
    }
    return { added, updated, skipped }
  }

  async function loadSkills() {
    const data = await window.electronAPI.storageRead(storageKey('skills'))
    if (data) {
      if (Array.isArray(data)) {
        skills.value = data.map(function(s: any) {
          return {
            id: s.id,
            name: s.name,
            format: s.format || 'text',
            sourceId: s.sourceId || (s.format === 'folder' ? s.id.replace(/^folder:/, '') : ''),
            folderPath: s.folderPath || '',
            version: s.version || '',
            source: s.source || 'legacy',
            packageHash: s.packageHash || '',
            template: s.template,
            category: s.category || 'general',
            description: s.description || '',
            resourceSummary: s.format === 'folder' || s.resourceSummary ? {
              resourceCount: Number(s.resourceSummary?.resourceCount || 0),
              warningCount: Number(s.resourceSummary?.warningCount || 0)
            } : undefined,
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
            injectDepth: s.injectDepth,
            contextPolicy: s.contextPolicy,
            customVars: s.customVars || {},
            inputSchema: s.inputSchema,
            outputSchema: s.outputSchema,
            retryPolicy: s.retryPolicy
            ,intents: s.intents
          }
        })
      } else {
        skills.value = data.skills || []
        pipelineSkills.value = data.pipelineSkills || []
        deAiSkills.value = data.deAiSkills || []
      }
    }
  }

  async function saveSkills() {
    await window.electronAPI.storageWrite(storageKey('skills'), {
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

  /** 将单个 SKILL 导出为 Markdown 格式（含 YAML 元信息头） */
  function exportSkillToMD(skillId: string): string {
    const s = skills.value.find(sk => sk.id === skillId)
    if (!s) return ''
    return serializeSkillMd(toSkillRecord(s))
  }

  /** 全量导出所有 SKILL 为 JSON */
  function exportAllToJSON(): string {
    return JSON.stringify({
      exportVersion: '1.0',
      exportedAt: new Date().toISOString(),
      skills: JSON.parse(JSON.stringify(skills.value)),
      pipelineSkills: JSON.parse(JSON.stringify(pipelineSkills.value)),
      deAiSkills: JSON.parse(JSON.stringify(deAiSkills.value))
    }, null, 2)
  }

  /** 从 JSON 导入 SKILL */
  function importFromJSON(jsonStr: string): { added: number; skipped: number } {
    let result = { added: 0, skipped: 0 }
    try {
      const data = JSON.parse(jsonStr)
      const incoming: any[] = data.skills || data || []
      if (!Array.isArray(incoming)) return result
      const existingIds = new Set(skills.value.map(s => s.id))
      for (const s of incoming) {
        if (!s.id || !s.name) continue
        if (existingIds.has(s.id)) {
          result.skipped++
          continue
        }
        skills.value.push({
          id: s.id,
          name: s.name,
          format: s.format || 'text',
          folderPath: s.folderPath || '',
          version: s.version || '',
          source: s.source || 'legacy',
          packageHash: s.packageHash || '',
          template: s.template || '',
          category: s.category || 'general',
          description: s.description || '',
          executionMode: s.executionMode || 'chain',
          outputFormat: s.outputFormat || 'text',
          validationRules: s.validationRules || [],
          splitSize: s.splitSize || 1000,
          injectMode: s.injectMode,
          bindTarget: s.bindTarget,
          linkedSkillIds: s.linkedSkillIds || [],
          createdAt: s.createdAt || new Date().toISOString(),
          updatedAt: s.updatedAt,
          injectFrequency: s.injectFrequency,
          injectDepth: s.injectDepth,
          customVars: s.customVars || {},
          inputSchema: s.inputSchema,
          outputSchema: s.outputSchema,
          retryPolicy: s.retryPolicy
          ,intents: s.intents
        })
        existingIds.add(s.id)
        result.added++
      }
      if (result.added > 0) saveSkills()
      return result
    } catch {
      return result
    }
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
    getSkill, normalizeSkillId, displaySkillName, loadSkills, saveSkills, addSkill, updateSkill, removeSkill,
    movePipelineSkillUp, movePipelineSkillDown,
    exportSkillToMD, exportAllToJSON, importFromJSON, importSkills
  }
})


