import { describe, expect, it } from 'vitest'
import type { AgentToolDefinition, ToolResult } from './editorTools'
import {
  AGENT_RUNTIME_TOOL_NAMES,
  BUILT_IN_TOOL_NAMES,
  createToolConflictDiagnostic,
  findAgentToolNameConflicts,
  isAgentRuntimeToolName,
  removeConflictingExternalTools,
} from './agentToolConflict'

function tool(name: string, origin?: 'built-in' | 'external'): AgentToolDefinition {
  return {
    name,
    description: name,
    policy: 'read',
    origin,
    inputSchema: { type: 'object', properties: {} },
    async execute(): Promise<ToolResult> {
      return { ok: true }
    },
  }
}

describe('agent tool conflict protection', () => {
  it('keeps context and plan tools as the only agent runtime tools', () => {
    expect(AGENT_RUNTIME_TOOL_NAMES).toEqual(['context.remaining', 'agent.plan'])
    expect(['context.remaining', 'agent.plan'].map(isAgentRuntimeToolName)).toEqual([true, true])
    expect(isAgentRuntimeToolName('editor.write')).toBe(false)
    expect(isAgentRuntimeToolName('custom.tool')).toBe(false)
    expect(isAgentRuntimeToolName(undefined)).toBe(false)
  })

  it('treats retired sub-agent control names as external names, not reserved runtime names', () => {
    for (const name of ['agent.spawn', 'agent.wait', 'agent.cancel']) {
      expect(isAgentRuntimeToolName(name)).toBe(false)
      expect(BUILT_IN_TOOL_NAMES).not.toContain(name)
    }
  })

  it('rejects an external tool that occupies a built-in name', () => {
    const conflicts = findAgentToolNameConflicts([
      tool('editor.write', 'external'),
      tool('editor.write', 'built-in'),
      tool('editor.reveal', 'external'),
    ])

    expect(conflicts).toHaveLength(2)
    expect(conflicts[0]).toMatchObject({
      toolName: 'editor.write',
      reason: 'built-in',
      offenders: [{ index: 0, source: 'external' }],
    })
    expect(conflicts[1]).toMatchObject({
      toolName: 'editor.reveal',
      reason: 'built-in',
      offenders: [{ index: 2, source: 'external' }],
    })
    const diagnostic = createToolConflictDiagnostic(conflicts[0])
    expect(diagnostic.type).toBe('tool_conflict')
    expect(diagnostic.label).toContain('内置工具名')
  })

  it('rejects duplicate external names without clearing unrelated tools', () => {
    const tools = [
      tool('editor.write', 'built-in'),
      tool('editor.write', 'external'),
      tool('custom.lookup', 'external'),
      tool('custom.lookup', 'external'),
      tool('custom.safe', 'external'),
    ]
    const conflicts = findAgentToolNameConflicts(tools)
    const safeTools = removeConflictingExternalTools(tools, conflicts)
    const names = safeTools.map(item => item.name)

    expect(conflicts.map(item => `${item.reason}:${item.toolName}`).sort()).toEqual([
      'built-in:editor.write',
      'duplicate:custom.lookup',
    ])
    expect(names.filter(name => name === 'editor.write')).toHaveLength(1)
    expect(names.filter(name => name === 'custom.lookup')).toHaveLength(1)
    expect(names).toContain('custom.safe')
    expect(safeTools.find(item => item.name === 'editor.write')?.origin).toBe('built-in')
  })
})
