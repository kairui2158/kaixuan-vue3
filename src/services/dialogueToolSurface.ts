import {
  resolveDialoguePermission,
  type DialogueIntent,
  type DialogueToolSet,
  type DialogueWorkspace,
} from './dialogueFoundation'
import {
  createEditorTools,
  type AgentToolDefinition,
  type EditorWriteApplier,
  type EditorWriteMode,
  type EditorRevealer,
  type EditorWriteRetryCarrier,
  type ToolResult,
} from './editorTools'
import type { EditorTargetSnapshot } from './editorTarget'

export type {
  AgentToolDefinition,
  EditorRevealer,
  EditorWriteApplier,
  EditorWriteRetryCarrier,
  ToolResult,
} from './editorTools'

export type DialogueToolSurfaceIntent = DialogueIntent
export type { DialogueIntent, DialogueToolSet } from './dialogueFoundation'

export type DialogueToolSurfaceSummary = Array<{
  name: string
  policy: 'read' | 'write'
}>

export interface DialogueToolSurfaceEntry {
  workspace: Exclude<DialogueWorkspace, 'pipeline'>
  intent: DialogueToolSurfaceIntent
  getSnapshot: () => EditorTargetSnapshot | null
  readableTargets?: string[]
  writableTarget: string
  getAllSnapshots?: () => EditorTargetSnapshot[]
  onPlanUpdate?: (plan: { stage: string; steps: string[] }) => void
  mode?: EditorWriteMode
  applyWrite?: EditorWriteApplier
  revealTarget?: EditorRevealer
  onFailedBatch?: (batch: EditorWriteRetryCarrier | null) => void
  takeFailedBatch?: () => EditorWriteRetryCarrier | null
  extraTools?: AgentToolDefinition[]
}

export interface DialogueToolSurface {
  tools: AgentToolDefinition[]
  actualToolSurface: Array<{ name: string; policy: 'read' | 'write' }>
  permission: ReturnType<typeof resolveDialoguePermission>
}

export function buildDialogueToolSurface(
  entry: DialogueToolSurfaceEntry,
): DialogueToolSurface {
  const currentTarget = entry.getSnapshot()
  const readableTargets = entry.readableTargets?.length
    ? entry.readableTargets
    : [...new Set([
        currentTarget?.targetId,
        ...(entry.getAllSnapshots?.().map(item => item.targetId) || []),
      ].filter((id): id is string => Boolean(id)))]
  const toolSet: DialogueToolSet = {
    version: 1,
    workspace: entry.workspace,
    tools: [
      ...createEditorTools({
        workspace: entry.workspace,
        getSnapshot: entry.getSnapshot,
        getAllSnapshots: entry.getAllSnapshots,
        onPlanUpdate: entry.onPlanUpdate,
        mode: entry.mode || 'direct',
        applyWrite: entry.applyWrite,
        revealTarget: entry.revealTarget,
        onFailedBatch: entry.onFailedBatch,
        takeFailedBatch: entry.takeFailedBatch,
      }),
      ...(entry.extraTools || []),
    ],
    readableTargets,
    writableTarget: entry.writableTarget || currentTarget?.targetId || '',
  }
  return authorizeDialogueTools(toolSet, entry.intent, 'direct')
}

export function authorizeDialogueTools(
  input: DialogueToolSet | AgentToolDefinition[],
  intent: DialogueIntent,
  writeMode: EditorWriteMode = 'direct',
): {
  tools: AgentToolDefinition[]
  actualToolSurface: DialogueToolSurfaceSummary
  permission: ReturnType<typeof resolveDialoguePermission>
} {
  const permission = resolveDialoguePermission(intent, writeMode)
  const sourceTools = Array.isArray(input) ? input : input.tools
  const authorizedTools = sourceTools.filter(tool =>
    tool.policy !== 'write'
      ? permission.readTarget
      : permission.writeEditor,
  )
  return {
    tools: authorizedTools,
    actualToolSurface: describeDialogueToolSurface(authorizedTools),
    permission,
  }
}

export function describeDialogueToolSurface(
  tools: AgentToolDefinition[],
): DialogueToolSurfaceSummary {
  return tools.map(tool => ({ name: tool.name, policy: tool.policy }))
}
