import type { AgentToolDefinition } from './editorTools'

export const BUILT_IN_TOOL_NAMES: readonly string[] = [
  'editor.get_state',
  'editor.read_range',
  'editor.locate',
  'editor.search',
  'editor.write',
  'editor.reveal',
  'editor.multi_get_state',
  'editor.global_search',
  'editor.workspace_summary',
  'editor.document_map',
  'task.resume',
  'task.cancel',
  'context.remaining',
  'agent.plan',
]

export const AGENT_RUNTIME_TOOL_NAMES: readonly string[] = [
  'context.remaining',
  'agent.plan',
]

export function isAgentRuntimeToolName(name: unknown): boolean {
  return typeof name === 'string' && AGENT_RUNTIME_TOOL_NAMES.includes(name)
}

export interface ToolConflictDiagnostic {
  type: 'tool_conflict'
  level: 'warning'
  label: string
  detail?: string
  payload?: unknown
}

export function findAgentToolNameConflicts(
  tools: AgentToolDefinition[],
): Array<{
  toolName: string
  reason: 'built-in' | 'duplicate'
  offenders: Array<{ index: number; source: string }>
}> {
  const conflicts: Array<{
    toolName: string
    reason: 'built-in' | 'duplicate'
    offenders: Array<{ index: number; source: string }>
  }> = []
  const seen = new Map<string, number[]>()
  tools.forEach((tool, index) => {
    const name = String(tool?.name || '')
    if (!name) return
    seen.set(name, [...(seen.get(name) || []), index])
  })
  for (const [toolName, indexes] of seen) {
    const externalIndexes = indexes.filter(index => isExternalAgentTool(tools[index]))
    const builtInIndexes = indexes.filter(index => !isExternalAgentTool(tools[index]))
    if (BUILT_IN_TOOL_NAMES.includes(toolName)) {
      const offenders = externalIndexes.map(index => ({ index, source: 'external' }))
      if (offenders.length > 0) {
        conflicts.push({ toolName, reason: 'built-in', offenders })
      }
      continue
    }
    if (builtInIndexes.length > 1) {
      conflicts.push({
        toolName,
        reason: 'built-in',
        offenders: builtInIndexes.slice(1).map(index => ({ index, source: 'built-in' })),
      })
      continue
    }
    if (indexes.length > 1) {
      conflicts.push({
        toolName,
        reason: 'duplicate',
        offenders: indexes
          .map(index => ({
            index,
            source: isExternalAgentTool(tools[index]) ? 'external' : 'built-in',
          }))
          .slice(1),
      })
    }
  }
  return conflicts
}

export function isExternalAgentTool(tool: AgentToolDefinition | undefined): boolean {
  return tool?.origin === 'external'
}

export function createToolConflictDiagnostic(conflict: {
  toolName: string
  reason: 'built-in' | 'duplicate'
  offenders: Array<{ index: number; source: string }>
}): ToolConflictDiagnostic {
  return {
    type: 'tool_conflict',
    level: 'warning',
    label: conflict.reason === 'built-in'
      ? `外部工具占用内置工具名：${conflict.toolName}`
      : `外部工具重名：${conflict.toolName}`,
    detail: `offenders=${conflict.offenders.map(item => `${item.source}:${item.index}`).join(',')}`,
    payload: conflict,
  }
}

export function removeConflictingExternalTools(
  tools: AgentToolDefinition[],
  diagnostics: Array<{
    toolName: string
    reason: 'built-in' | 'duplicate'
    offenders: Array<{ index: number; source: string }>
  }>,
): AgentToolDefinition[] {
  if (diagnostics.length === 0) return tools
  const conflictNames = new Set(diagnostics.map(item => item.toolName))
  const removable = new Set(
    diagnostics.flatMap(conflict => conflict.offenders.map(item => `${conflict.toolName}#${item.index}`)),
  )
  return tools.filter((tool, index) => {
    const name = String(tool?.name || '')
    if (!conflictNames.has(name)) return true
    return !removable.has(`${name}#${index}`)
  })
}
