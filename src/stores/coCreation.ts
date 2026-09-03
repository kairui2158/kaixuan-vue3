import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { ChainBreakpoint } from '../services/chainBreakpoint'
import { storageKey } from '../utils/storage-key'

export type HomeCoCreationMode = 'chain' | 'compose'

export interface CoCreationConfig {
  agentId: string
  skillIds: string[]
  mode: HomeCoCreationMode
  skillAgents: Record<string, string>
}

type StoredCoCreationConfig = Partial<Omit<CoCreationConfig, 'skillIds'>> & {
  skillIds?: unknown
}

const STORAGE_NAME = 'co_creation_config'
const BREAKPOINT_STORAGE_NAME = 'co_creation_breakpoint'
const DEFAULT_CONFIG: CoCreationConfig = {
  agentId: '',
  skillIds: [],
  mode: 'compose',
  skillAgents: {},
}

function normalizeSkillIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of value) {
    const id = typeof item === 'string' ? item.trim() : ''
    if (!id || seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

function normalizeSkillAgents(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: Record<string, string> = {}
  for (const [key, agentId] of Object.entries(value as Record<string, unknown>)) {
    const id = typeof agentId === 'string' ? agentId.trim() : ''
    if (key && id) result[key] = id
  }
  return result
}

export function normalizeCoCreationConfig(value: StoredCoCreationConfig | null | undefined): CoCreationConfig {
  const mode = value?.mode === 'chain' ? 'chain' : 'compose'
  const skillIds = normalizeSkillIds(value?.skillIds)
  return {
    agentId: typeof value?.agentId === 'string' ? value.agentId.trim() : '',
    skillIds,
    mode,
    skillAgents: normalizeSkillAgents(value?.skillAgents),
  }
}

export const useCoCreationStore = defineStore('coCreation', () => {
  const config = ref<CoCreationConfig>({ ...DEFAULT_CONFIG })
  const loaded = ref(false)

  const skillCount = computed(() => config.value.skillIds.length)

  async function loadConfig(): Promise<CoCreationConfig> {
    try {
      const saved = await window.electronAPI.storageRead(storageKey(STORAGE_NAME))
      config.value = normalizeCoCreationConfig(saved as StoredCoCreationConfig | null)
    } catch (error) {
      console.warn('[coCreation] load config failed:', error)
      config.value = { ...DEFAULT_CONFIG }
    } finally {
      loaded.value = true
    }
    return config.value
  }

  async function saveConfig(next: CoCreationConfig): Promise<void> {
    // Only persist; do NOT reassign config.value here —
    // reassignment triggers the ChatPanel watch → saveConfig loop.
    // Callers already mutate config.value in place before calling saveConfig.
    try {
      const normalized = normalizeCoCreationConfig(next)
      await window.electronAPI.storageWrite(
        storageKey(STORAGE_NAME),
        JSON.parse(JSON.stringify(normalized)),
      )
    } catch (error) {
      console.warn('[coCreation] save config failed:', error)
      throw error
    }
  }

  function addSkill(skillId: string): boolean {
    const id = skillId?.trim()
    if (!id || config.value.skillIds.includes(id)) return false
    config.value.skillIds = [...config.value.skillIds, id]
    return true
  }

  function removeSkill(skillId: string): boolean {
    const id = skillId?.trim()
    if (!id || !config.value.skillIds.includes(id)) return false
    config.value.skillIds = config.value.skillIds.filter(item => item !== id)
    const key = `home-${id}`
    if (config.value.skillAgents[key]) {
      const nextAgents = { ...config.value.skillAgents }
      delete nextAgents[key]
      config.value.skillAgents = nextAgents
    }
    return true
  }

  function moveSkill(skillId: string, direction: -1 | 1): boolean {
    const ids = [...config.value.skillIds]
    const index = ids.indexOf(skillId)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) return false
    ;[ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]]
    config.value.skillIds = ids
    return true
  }

  function setSkillAgent(skillId: string, agentId: string): boolean {
    const id = skillId?.trim()
    if (!id || !config.value.skillIds.includes(id)) return false
    const key = `home-${id}`
    const next = { ...config.value.skillAgents }
    const value = agentId?.trim() || ''
    if (value) next[key] = value
    else delete next[key]
    config.value.skillAgents = next
    return true
  }

  function setAgent(agentId: string): void {
    config.value.agentId = agentId?.trim() || ''
  }

  function setMode(mode: HomeCoCreationMode): void {
    config.value.mode = mode === 'chain' ? 'chain' : 'compose'
  }

  async function loadBreakpoint(): Promise<ChainBreakpoint | null> {
    try {
      return await window.electronAPI.storageRead(storageKey(BREAKPOINT_STORAGE_NAME)) || null
    } catch (error) {
      console.warn('[coCreation] load breakpoint failed:', error)
      return null
    }
  }

  async function saveBreakpoint(breakpoint: ChainBreakpoint): Promise<void> {
    try {
      await window.electronAPI.storageWrite(
        storageKey(BREAKPOINT_STORAGE_NAME),
        JSON.parse(JSON.stringify(breakpoint)),
      )
    } catch (error) {
      console.warn('[coCreation] save breakpoint failed:', error)
    }
  }

  async function clearBreakpoint(): Promise<void> {
    try {
      await window.electronAPI.storageRemove(storageKey(BREAKPOINT_STORAGE_NAME))
    } catch (error) {
      console.warn('[coCreation] clear breakpoint failed:', error)
    }
  }

  return {
    config,
    loaded,
    skillCount,
    loadConfig,
    saveConfig,
    addSkill,
    removeSkill,
    moveSkill,
    setSkillAgent,
    setAgent,
    setMode,
    loadBreakpoint,
    saveBreakpoint,
    clearBreakpoint,
  }
})
