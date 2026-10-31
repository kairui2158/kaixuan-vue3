import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { storageKey } from '../utils/storage-key'
import type { JsonSchema, SkillRetryPolicy } from '../services/skillValidation'
import { serializeSkillMd } from '../services/configExchange/markdown'
import { toSkillRecord } from '../services/configExchange'
import { normalizeContextPolicy, normalizeSkillId as normalizeSkillIdentity } from '../services/skillIdentity'
import { clearRealSkillCache } from '../services/realSkillLoader'

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
  /** Package metadata such as chainHandoff.role; preserved across catalog loads. */
  meta?: Record<string, unknown>
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
    return normalizeSkillIdentity(id, format)
  }

  function logContextPolicyMigration(skillId: string, migratedFrom: 'latest' | 'all') {
    const detail = {
      skillId,
      field: 'contextPolicy.chatHistory',
      from: migratedFrom,
      to: migratedFrom === 'latest' ? 'recent' : 'full',
    }
    console.warn('[skill] context policy migrated to current contract', detail)
    ;(typeof window !== 'undefined' ? (window as any).DiagLogger : null)?.log?.(
      'warn',
      'skill/context-policy-migration',
      '技能上下文策略已从旧语义迁移',
      detail,
    )
  }

  function normalizeSkillRecord(skill: Skill): Skill {
    const normalizedPolicy = normalizeContextPolicy(skill.contextPolicy)
    if (normalizedPolicy.migratedFrom) {
      logContextPolicyMigration(skill.id, normalizedPolicy.migratedFrom)
    }
    return normalizedPolicy.policy ? { ...skill, contextPolicy: normalizedPolicy.policy } : skill
  }

  const FOLDER_RECORD_FIELDS = new Set([
    'id', 'name', 'format', 'sourceId', 'folderPath', 'version', 'source', 'packageHash',
    'template', 'category', 'description', 'resourceSummary', 'executionMode', 'outputFormat',
    'validationRules', 'splitSize', 'injectMode', 'bindTarget', 'linkedSkillIds', 'createdAt',
    'updatedAt', 'injectFrequency', 'injectDepth', 'contextPolicy', 'customVars', 'inputSchema',
    'outputSchema', 'retryPolicy', 'meta', 'intents'
  ])

  function replaceFolderRecord(current: Skill, incoming: Skill, now: string): Skill {
    const next: Skill = {
      ...incoming,
      id: normalizeSkillId(incoming.id, incoming.format),
      format: 'folder',
      updatedAt: now
    }
    for (const key of Object.keys(current)) {
      if (!FOLDER_RECORD_FIELDS.has(key) && !(key in next)) {
        const record = next as unknown as Record<string, unknown>
        record[key] = current[key as keyof Skill]
      }
    }
    return next
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
    const cachePathsToClear = new Set<string>()

    for (const skill of list) {
      const normalized = { ...skill, id: normalizeSkillId(skill.id, skill.format) }
      const normalizedRecord = normalizeSkillRecord(normalized)
      const current = existing.get(normalized.id)
      if (current) {
        if (strategy === 'overwrite') {
          const index = skills.value.findIndex(s => s.id === normalized.id)
          skills.value[index] = normalized.format === 'folder'
            ? replaceFolderRecord(current, normalizedRecord, now)
            : { ...current, ...normalizedRecord, updatedAt: now }
          updated++
          if (current.folderPath) cachePathsToClear.add(current.folderPath)
          if (normalizedRecord.folderPath) cachePathsToClear.add(normalizedRecord.folderPath)
        } else {
          skipped++
        }
      } else {
        skills.value.push(normalizedRecord)
        existing.set(normalized.id, normalizedRecord)
        added++
        if (normalizedRecord.folderPath) cachePathsToClear.add(normalizedRecord.folderPath)
      }
    }
    for (const folderPath of cachePathsToClear) clearRealSkillCache(folderPath)

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
    if (data && !Array.isArray(data)) {
      skills.value = (data.skills || []).map((skill: Skill) => normalizeSkillRecord(skill))
      pipelineSkills.value = data.pipelineSkills || []
      deAiSkills.value = data.deAiSkills || []
      const shouldPersist = skills.value.some((skill, index) => skill !== (data.skills || [])[index])
      if (shouldPersist) await saveSkills()
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
      const current = skills.value[idx]
      const next = normalizeSkillRecord({ ...current, ...data })
      if (current.folderPath) clearRealSkillCache(current.folderPath)
      if (next.folderPath && next.folderPath !== current.folderPath) clearRealSkillCache(next.folderPath)
      skills.value[idx] = next
      saveSkills()
    }
  }

  function removeSkill(id: string) {
    const removed = skills.value.find(s => s.id === id)
    if (removed?.folderPath) clearRealSkillCache(removed.folderPath)
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
    exportSkillToMD, importSkills
  }
})


