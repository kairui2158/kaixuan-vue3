import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { storageKey } from '../utils/storage-key'

export interface Agent {
  id: string
  name: string
  model: string
  temperature: number
  maxTokens: number
  systemPrompt: string
  description?: string
  provider?: string
  tools?: string[]
  createdAt?: string
  updatedAt?: string
}

export const useAgentStore = defineStore('agent', () => {
const agents = ref<Agent[]>([])
const selectedAgentId = ref<string>('')
const activeAgent = computed(() => agents.value.find(a => a.id === selectedAgentId.value))

  async function loadAgents() {
    const data = await window.electronAPI.storageRead(storageKey('agents'))
    if (data) agents.value = data.agents || data || []
  }

  async function saveAgents() {
    await window.electronAPI.storageWrite(storageKey('agents'), { agents: JSON.parse(JSON.stringify(agents.value)) })
  }

  function addAgent(agent: Agent) {
    agents.value.push(agent)
    saveAgents()
  }

  function updateAgent(id: string, data: Partial<Agent>) {
    const idx = agents.value.findIndex(a => a.id === id)
    if (idx >= 0) {
      agents.value[idx] = { ...agents.value[idx], ...data }
      saveAgents()
    }
  }

  function removeAgent(id: string) {
    agents.value = agents.value.filter(a => a.id !== id)
    saveAgents()
  }

  function getAgent(id: string) {
    return agents.value.find(a => a.id === id)
  }

  async function importAgents(list: Agent[], strategy: 'skip' | 'overwrite'): Promise<{ added: number; updated: number; skipped: number }> {
    const existing = new Map(agents.value.map(a => [a.id, a]))
    let added = 0, updated = 0, skipped = 0
    const now = new Date().toISOString()
    for (const a of list) {
      const existingAgent = existing.get(a.id)
      if (existingAgent) {
        if (strategy === 'overwrite') {
          Object.assign(existingAgent, a, { updatedAt: now })
          updated++
        } else {
          skipped++
        }
      } else {
        agents.value.push(a)
        existing.set(a.id, a)
        added++
      }
    }
    if (added > 0 || updated > 0) await saveAgents()
    return { added, updated, skipped }
  }

  function exportAllToJSON(): string {
    return JSON.stringify({
      schema: 'shenyi.agent',
      version: 1,
      exportedAt: new Date().toISOString(),
      agents: JSON.parse(JSON.stringify(agents.value)),
    }, null, 2)
  }

  return { agents, selectedAgentId, activeAgent, loadAgents, saveAgents, addAgent, updateAgent, removeAgent, getAgent, importAgents, exportAllToJSON }
})


