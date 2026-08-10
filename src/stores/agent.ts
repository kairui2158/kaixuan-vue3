import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface Agent {
  id: string
  name: string
  model: string
  temperature: number
  maxTokens: number
  systemPrompt: string
  description?: string
  provider?: string
  createdAt?: string
  updatedAt?: string
}

export const useAgentStore = defineStore('agent', () => {
const agents = ref<Agent[]>([])
const selectedAgentId = ref<string>('')

  function loadAgents() {
    const data = window.electronAPI.storageRead('agents')
    if (data) agents.value = data.agents || data || []
  }

  function saveAgents() {
    window.electronAPI.storageWrite('agents', { agents: agents.value })
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

  return { agents, selectedAgentId, loadAgents, saveAgents, addAgent, updateAgent, removeAgent, getAgent }
})
