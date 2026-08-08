/**
 * MCP Protocol Adapter - bridges between MCP server tools and local ToolRegistry
 * Supports: tool discovery, tool invocation, resource listing
 */

import { ToolRegistry, ToolDefinition } from './tool-registry'

export interface MCPServerConfig {
  id: string
  name: string
  transport: 'stdio' | 'http' | 'sse'
  command?: string
  args?: string[]
  url?: string
  enabled: boolean
}

export interface MCPResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
}

class MCPProtocolClass {
  private servers = new Map<string, MCPServerConfig>()
  private connectedServers = new Set<string>()

  registerServer(config: MCPServerConfig): void {
    this.servers.set(config.id, config)
  }

  unregisterServer(id: string): void {
    this.servers.delete(id)
    this.connectedServers.delete(id)
  }

  async connect(serverId: string): Promise<boolean> {
    const server = this.servers.get(serverId)
    if (!server) return false
    // In Electron context, actual connection happens via IPC
    // This is a placeholder that marks as connected
    this.connectedServers.add(serverId)
    return true
  }

  async disconnect(serverId: string): Promise<void> {
    this.connectedServers.delete(serverId)
  }

  isConnected(serverId: string): boolean {
    return this.connectedServers.has(serverId)
  }

  listServers(): MCPServerConfig[] {
    return Array.from(this.servers.values())
  }

  getConnectedServers(): MCPServerConfig[] {
    return this.listServers().filter(s => this.isConnected(s.id))
  }

  async listTools(serverId: string): Promise<string[]> {
    if (!this.isConnected(serverId)) return []
    // In real implementation, query MCP server for tools
    // For now, return locally registered tools
    return ToolRegistry.listNames()
  }

  async listResources(serverId: string): Promise<MCPResource[]> {
    if (!this.isConnected(serverId)) return []
    // Placeholder - real implementation queries MCP server
    return []
  }

  async callTool(serverId: string, toolName: string, params: Record<string, any>): Promise<any> {
    if (!this.isConnected(serverId)) {
      throw new Error(`MCP server ${serverId} not connected`)
    }
    // Delegate to local ToolRegistry
    return ToolRegistry.execute(toolName, params)
  }

  async callToolLocal(toolName: string, params: Record<string, any>): Promise<any> {
    return ToolRegistry.execute(toolName, params)
  }

  // Sync local tools to MCP server format for external consumption
  exportToolsAsMCPFormat(): any[] {
    return ToolRegistry.list().map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: {
        type: 'object',
        properties: tool.parameters.reduce((acc, p) => {
          acc[p.name] = { type: p.type, description: p.description }
          return acc
        }, {} as Record<string, any>),
        required: tool.parameters.filter(p => p.required).map(p => p.name)
      }
    }))
  }
}

export const MCPProtocol = new MCPProtocolClass()
