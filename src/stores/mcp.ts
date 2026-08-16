import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { storageKey } from '../utils/storage-key'

export interface McpServer {
  id: string
  name: string
  url: string
  apiKey: string
  tools: string[]
  enabled: boolean
  createdAt?: string
  updatedAt?: string
}

export const useMcpStore = defineStore('mcp', () => {
  const servers = ref<McpServer[]>([])
  const connectedServers = ref<Set<string>>(new Set())

  function loadServers() {
    try {
      const data = window.electronAPI.storageRead(storageKey('mcp_servers'))
      if (data && Array.isArray(data)) {
        servers.value = data.map((s: any) => ({
          id: s.id,
          name: s.name || '',
          url: s.url || '',
          apiKey: s.apiKey || '',
          tools: s.tools || [],
          enabled: s.enabled !== false,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        }))
      }
    } catch(e) {
      console.warn('[mcp] loadServers failed:', e)
    }
  }

  function saveServers() {
    try {
      window.electronAPI.storageWrite(storageKey('mcp_servers'), JSON.parse(JSON.stringify(servers.value)))
    } catch(e) {
      console.warn('[mcp] saveServers failed:', e)
    }
  }

  function addServer(server: McpServer) {
    servers.value.push(server)
    saveServers()
  }

  function updateServer(id: string, data: Partial<McpServer>) {
    const idx = servers.value.findIndex(s => s.id === id)
    if (idx >= 0) {
      servers.value[idx] = { ...servers.value[idx], ...data }
      saveServers()
    }
  }

  function removeServer(id: string) {
    servers.value = servers.value.filter(s => s.id !== id)
    saveServers()
  }

  function getServer(id: string): McpServer | undefined {
    return servers.value.find(s => s.id === id)
  }

  const enabledServers = computed(() => servers.value.filter(s => s.enabled))
  const allTools = computed(() => {
    const tools: string[] = []
    servers.value.forEach(s => {
      if (s.enabled) {
        s.tools.forEach(t => {
          if (!tools.includes(t)) tools.push(t)
        })
      }
    })
    return tools
  })

  async function testConnection(url: string, apiKey: string): Promise<{ ok: boolean; tools: string[]; error?: string }> {
    try {
      const resp = await fetch(url + '/tools', {
        headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' }
      })
      if (!resp.ok) return { ok: false, tools: [], error: 'HTTP ' + resp.status }
      const data = await resp.json()
      const tools = Array.isArray(data) ? data : (data.tools || [])
      return { ok: true, tools }
    } catch(e: any) {
      return { ok: false, tools: [], error: e.message || 'Connection failed' }
    }
  }

  async function callTool(serverId: string, toolName: string, args: any): Promise<any> {
    const server = getServer(serverId)
    if (!server) throw new Error('MCP server not found: ' + serverId)
    try {
      const resp = await fetch(server.url + '/call', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + server.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ tool: toolName, args })
      })
      if (!resp.ok) throw new Error('HTTP ' + resp.status)
      return await resp.json()
    } catch(e: any) {
      throw new Error('MCP call failed: ' + e.message)
    }
  }

  return {
    servers, connectedServers, enabledServers, allTools,
    loadServers, saveServers, addServer, updateServer, removeServer, getServer,
    testConnection, callTool
  }
})
