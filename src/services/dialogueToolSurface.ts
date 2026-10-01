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
import type { LongDocumentExecutionPlan } from './longDocumentExecutionPlanner'
import type { EditorTargetSnapshot } from './editorTarget'
import type { EditTask } from './editTaskService'
import {
  findAgentToolNameConflicts,
  removeConflictingExternalTools,
} from './agentToolConflict'

export type {
  AgentToolDefinition,
  EditorRevealer,
  EditorWriteApplier,
  EditorWriteApplyInput,
  EditorWriteRetryCarrier,
  ToolResult,
} from './editorTools'

export type { LongDocumentExecutionPlan }

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
  mode?: EditorWriteMode
  maxReadChars?: () => number
  executionPlan?: LongDocumentExecutionPlan
  applyWrite?: EditorWriteApplier
  revealTarget?: EditorRevealer
  onFailedBatch?: (batch: EditorWriteRetryCarrier | null) => void
  takeFailedBatch?: () => EditorWriteRetryCarrier | null
  extraTools?: AgentToolDefinition[]
  writeAuthorization?: DialogueWriteAuthorization | null
  activeEditTask?: EditTask | null
  onResumeEditTask?: (taskId: string) => Promise<ToolResult>
  onCancelEditTask?: (taskId: string) => Promise<ToolResult>
}

export interface DialogueWriteAuthorization {
  source: 'long-document-workflow'
  reason?: string
}

export interface DialogueToolSurface {
  tools: AgentToolDefinition[]
  actualToolSurface: Array<{ name: string; policy: 'read' | 'write' }>
  permission: ReturnType<typeof resolveDialoguePermission>
  toolConflicts?: Array<{
    type: 'tool_conflict'
    level: 'warning'
    label: string
    detail?: string
    payload?: unknown
  }>
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
  const externalTools = entry.extraTools || []
  const ownedExternalTools = externalTools.map(tool =>
    tool.origin === 'external' ? tool : { ...tool, origin: 'external' as const },
  )
  const conflicts = findAgentToolNameConflicts(ownedExternalTools)
  const safeExternalTools = removeConflictingExternalTools(ownedExternalTools, conflicts)
  const conflictDiagnostics = conflicts.map(conflict => ({
    type: 'tool_conflict' as const,
    level: 'warning' as const,
    label: conflict.reason === 'built-in'
      ? `外部工具占用内置工具名：${conflict.toolName}`
      : `外部工具重名：${conflict.toolName}`,
    detail: `offenders=${conflict.offenders.map(item => `${item.source}:${item.index}`).join(',')}`,
    payload: conflict,
  }))
  const toolSet: DialogueToolSet = {
    version: 1,
    workspace: entry.workspace,
    tools: [
      ...createEditorTools({
        workspace: entry.workspace,
        getSnapshot: entry.getSnapshot,
        getAllSnapshots: entry.getAllSnapshots,
        mode: entry.mode || 'direct',
        maxReadChars: entry.maxReadChars,
    executionPlan: entry.executionPlan,
        applyWrite: entry.applyWrite,
        revealTarget: entry.revealTarget,
        onFailedBatch: entry.onFailedBatch,
        takeFailedBatch: entry.takeFailedBatch,
      }),
      ...safeExternalTools,
    ],
    readableTargets,
    writableTarget: entry.writableTarget || currentTarget?.targetId || '',
  }
  const authorized = authorizeDialogueTools(toolSet, entry.intent, 'direct', {
    activeEditTask: entry.activeEditTask,
    onResumeEditTask: entry.onResumeEditTask,
    onCancelEditTask: entry.onCancelEditTask,
    writeAuthorization: entry.writeAuthorization,
  })
  return {
    ...authorized,
    toolConflicts: conflictDiagnostics,
  }
}

export interface DialogueToolSurfaceTaskContext {
  activeEditTask?: EditTask | null
  onResumeEditTask?: (taskId: string) => Promise<ToolResult>
  onCancelEditTask?: (taskId: string) => Promise<ToolResult>
  writeAuthorization?: DialogueWriteAuthorization | null
}

export function authorizeDialogueTools(
  input: DialogueToolSet | AgentToolDefinition[],
  intent: DialogueIntent,
  writeMode: EditorWriteMode = 'direct',
  taskContext?: DialogueToolSurfaceTaskContext,
): {
  tools: AgentToolDefinition[]
  actualToolSurface: DialogueToolSurfaceSummary
  permission: ReturnType<typeof resolveDialoguePermission>
} {
  const basePermission = resolveDialoguePermission(intent, writeMode)
  const workflowWriteAuthorized = taskContext?.writeAuthorization?.source === 'long-document-workflow'
  const permission = workflowWriteAuthorized
    ? { ...basePermission, writeEditor: true }
    : basePermission
  const sourceTools = Array.isArray(input) ? input : input.tools
  const task = taskContext?.activeEditTask
  const activeTask = task && isActiveEditTask(task) ? task : null
  const taskAwaitsRetry = activeTask?.status === 'awaiting_batch'
  const writeToolsAllowed = permission.writeEditor && (!activeTask || taskAwaitsRetry)
  const taskTools = writeToolsAllowed
    ? buildEditTaskControlTools(taskContext).filter(tool => tool.name !== 'task.resume')
    : buildEditTaskControlTools(taskContext)
  const taskToolNames = new Set(taskTools.map(tool => tool.name))
  const taskIsTerminal = Boolean(task) && !activeTask
  const authorizedReadToolNames = new Set(
    sourceTools
      .filter(tool => tool.policy !== 'write' && permission.readTarget)
      .map(tool => tool.name),
  )
  const authorizedTools = sourceTools
    .filter(tool => tool.policy !== 'write'
      ? permission.readTarget && !taskToolNames.has(tool.name)
      : writeToolsAllowed)
    .concat(taskTools)
    .filter(tool => !taskIsTerminal || !taskToolNames.has(tool.name))
    .filter(tool => tool.policy === 'write'
      || authorizedReadToolNames.has(tool.name)
      || taskToolNames.has(tool.name))
  return {
    tools: authorizedTools,
    actualToolSurface: describeDialogueToolSurface(authorizedTools),
    permission,
  }
}

function buildEditTaskControlTools(
  taskContext?: DialogueToolSurfaceTaskContext,
): AgentToolDefinition[] {
  const task = taskContext?.activeEditTask
  if (!task || !isActiveEditTask(task)) return []
  const handlers = {
    resume: taskContext?.onResumeEditTask,
    cancel: taskContext?.onCancelEditTask,
  }
  if (!handlers.resume && !handlers.cancel) return []

  const tools: AgentToolDefinition[] = []
  const taskNeedsResume = task.status === 'awaiting_batch'
    || task.status === 'waiting_user'
    || task.status === 'partially_applied'
  if (handlers.resume && taskNeedsResume) {
    const resume = handlers.resume
    tools.push({
      name: 'task.resume',
      description: '恢复当前编辑任务。恢复后由任务执行器按批次校验并写入，不直接开放 editor.write。',
      policy: 'read',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: '要恢复的编辑任务 ID' },
        },
        required: ['taskId'],
      },
      async execute(input) {
        const params = input as { taskId?: unknown }
        if (params.taskId !== task.id) {
          return {
            ok: false,
            error: { code: 'task_id_mismatch', message: '当前活动任务不是请求恢复的任务' },
          }
        }
        return resume(task.id)
      },
    })
  }
  if (handlers.cancel) {
    const cancel = handlers.cancel
    tools.push({
      name: 'task.cancel',
      description: '取消当前编辑任务并保留已写入批次，执行器负责后续状态收敛。',
      policy: 'read',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: '要取消的编辑任务 ID' },
        },
        required: ['taskId'],
      },
      async execute(input) {
        const params = input as { taskId?: unknown }
        if (params.taskId !== task.id) {
          return {
            ok: false,
            error: { code: 'task_id_mismatch', message: '当前活动任务不是请求取消的任务' },
          }
        }
        return cancel(task.id)
      },
    })
  }
  return tools
}

function isActiveEditTask(task: EditTask): boolean {
  return task.status !== 'completed'
    && task.status !== 'completed_with_warnings'
    && task.status !== 'failed_before_write'
    && task.status !== 'failed_after_write'
    && task.status !== 'canceled'
}

export function describeDialogueToolSurface(
  tools: AgentToolDefinition[],
): DialogueToolSurfaceSummary {
  return tools.map(tool => ({ name: tool.name, policy: tool.policy }))
}

export function appendDialogueToolSurfaceDeclaration(
  systemPrompt: string,
  toolSurface?: DialogueToolSurfaceSummary,
  options?: { activeEditTask?: EditTask | null },
): string {
  if (!toolSurface || toolSurface.length === 0) return systemPrompt
  const toolList = toolSurface
    .map(tool => `${tool.name}(${tool.policy})`)
    .join('、')
  const hasWrite = toolSurface.some(tool => tool.policy === 'write')
  const activeTask = options?.activeEditTask && isActiveEditTask(options.activeEditTask)
    ? options.activeEditTask
    : null
  const activeTaskAwaitsRetry = activeTask?.status === 'awaiting_batch'
  const activeTaskDeclaration = activeTask
    ? activeTaskAwaitsRetry && hasWrite
      ? `当前存在编辑任务 ${activeTask.id}（状态：${activeTask.status}）。写入权限已恢复：必须调用 editor.write 重试当前批次，禁止声称“没有写入权限”或凭记忆直接输出修改稿。`
      : `当前存在编辑任务 ${activeTask.id}（状态：${activeTask.status}）。本轮未开放 editor.write；用户要求继续任务时必须调用 task.resume，由任务执行器按批次校验并写入，禁止声称“没有写入权限”或凭记忆直接输出修改稿。`
    : null
  const defaultDeclaration = hasWrite
    ? '你已获得编辑器写入权限：需要修改内容时必须调用写入工具完成，不要凭历史对话判断当前权限。'
    : '本轮未开放写入工具：请只输出讨论或分析内容，不要声称可以写入编辑器。'
  return [
    systemPrompt,
    `本轮实际可调用的工具：${toolList}。`,
    activeTaskDeclaration || defaultDeclaration,
  ].filter(Boolean).join('\n\n')
}
