import {
  resolveDialoguePermission,
  type DialogueIntent,
  type DialogueToolSet,
  type DialogueWorkspace,
} from './dialogueFoundation'
import {
  createEditorTools,
  type AgentToolDefinition,
  type EditorWriteContaminationDecision,
  type EditorWriteApplier,
  type EditorWriteMode,
  type EditorRevealer,
  type EditorWriteRetryCarrier,
  type ToolResult,
} from './editorTools'
import type {
  LongDocumentExecutionMode,
  LongDocumentExecutionOperation,
  LongDocumentExecutionPlan,
} from './longDocumentExecutionPlanner'
import type { EditorTargetSnapshot } from './editorTarget'
import type { EditTask } from './editTaskService'
import {
  findAgentToolNameConflicts,
  removeConflictingExternalTools,
} from './agentToolConflict'
import type { SourceContaminationConversationMessage } from './sourceContaminationDetector'

export type {
  AgentToolDefinition,
  EditorRevealer,
  EditorWriteContaminationDecision,
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
  conversationMarkers?: SourceContaminationConversationMessage[]
  userRequestText?: string
  onContaminationDecision?: (decision: EditorWriteContaminationDecision) => void
  activeEditTask?: EditTask | null
  onResumeEditTask?: (taskId: string) => Promise<ToolResult>
  onCancelEditTask?: (taskId: string) => Promise<ToolResult>
}

export interface DialogueWriteAuthorization {
  source: 'long-document-workflow'
  intent: 'edit' | 'generate'
  operation: LongDocumentExecutionOperation
  mode: LongDocumentExecutionMode
  reason?: string
}

export interface DialoguePermissionDecision {
  source: 'dialogue-intent' | 'long-document-workflow'
  decision: 'read-only' | 'write-authorized'
  intent: DialogueIntent
  operation: LongDocumentExecutionOperation
  mode: LongDocumentExecutionMode
  reason: string
}

export interface DialogueToolSurface {
  tools: AgentToolDefinition[]
  actualToolSurface: Array<{ name: string; policy: 'read' | 'write' }>
  permission: ReturnType<typeof resolveDialoguePermission>
  permissionDecision: DialoguePermissionDecision
  toolPolicyDiagnostics?: Array<{
    type: 'tool_policy_mismatch'
    level: 'warning'
    label: string
    detail?: string
    payload?: unknown
  }>
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
        writeAuthorization: resolveDialoguePermissionDecision(
          entry.intent,
          entry.writeAuthorization,
        ).decision === 'write-authorized'
          ? entry.writeAuthorization ?? undefined
          : undefined,
        applyWrite: entry.applyWrite,
        revealTarget: entry.revealTarget,
        onFailedBatch: entry.onFailedBatch,
        takeFailedBatch: entry.takeFailedBatch,
        conversationMarkers: entry.conversationMarkers,
        userRequestText: entry.userRequestText,
        onContaminationDecision: entry.onContaminationDecision,
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
    toolPolicyDiagnostics: authorized.toolPolicyDiagnostics,
  }
}

function resolveDialoguePermissionDecision(
  intent: DialogueIntent,
  authorization: DialogueWriteAuthorization | null | undefined,
): DialoguePermissionDecision {
  const normalizedIntent = intent === 'auto' ? 'discuss' : intent
  const dialogueDecision: DialoguePermissionDecision = {
    source: 'dialogue-intent',
    decision: 'read-only',
    intent: normalizedIntent,
    operation: 'discussion',
    mode: 'direct',
    reason: 'discuss/analyze intents are always read-only',
  }
  if (normalizedIntent !== 'edit' && normalizedIntent !== 'generate') return dialogueDecision
  if (!authorization || authorization.source !== 'long-document-workflow') {
    return {
      ...dialogueDecision,
      reason: normalizedIntent === 'generate'
        ? 'generate intent authorizes editor writes through the dialogue intent source'
        : 'edit intent without a workflow authorization uses the dialogue intent source',
    }
  }
  if (authorization.intent !== normalizedIntent) return dialogueDecision
  if (authorization.operation === 'discussion') return dialogueDecision
  if (authorization.mode === 'final-draft') return dialogueDecision
  if (authorization.mode === 'edit-task') {
    return {
      source: 'long-document-workflow',
      decision: 'write-authorized',
      intent: normalizedIntent,
      operation: authorization.operation,
      mode: authorization.mode,
      reason: authorization.reason || 'workflow authorization triple matched (edit-task mode)',
    }
  }
  if (authorization.mode !== 'direct') return dialogueDecision
  if (authorization.operation !== 'targeted_edit') return dialogueDecision
  return {
    source: 'long-document-workflow',
    decision: 'write-authorized',
    intent: normalizedIntent,
    operation: authorization.operation,
    mode: authorization.mode,
    reason: authorization.reason || 'workflow authorization triple matched',
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
  permissionDecision: DialoguePermissionDecision
  toolPolicyDiagnostics?: DialogueToolSurface['toolPolicyDiagnostics']
} {
  const basePermission = resolveDialoguePermission(intent, writeMode)
  const permissionDecision = resolveDialoguePermissionDecision(
    intent,
    taskContext?.writeAuthorization,
  )
  const permission = permissionDecision.decision === 'write-authorized'
    ? { ...basePermission, writeEditor: true }
    : basePermission
  const CONTROL_TOOL_NAMES = new Set(['agent.spawn', 'agent.wait', 'agent.cancel'])
  const sourceTools = Array.isArray(input) ? input : input.tools
  const toolPolicyDiagnostics: NonNullable<DialogueToolSurface['toolPolicyDiagnostics']> = []
  const staticPolicyValid = (tool: AgentToolDefinition): boolean => {
    if (tool.defaultToolPolicy === 'disabled') {
      toolPolicyDiagnostics.push({
        type: 'tool_policy_mismatch',
        level: 'warning',
        label: `工具被默认策略禁用：${tool.name}`,
        detail: `defaultToolPolicy=${tool.defaultToolPolicy}`,
        payload: { toolName: tool.name, defaultToolPolicy: tool.defaultToolPolicy },
      })
      return false
    }
    if (!tool.defaultToolPolicy) {
      toolPolicyDiagnostics.push({
        type: 'tool_policy_mismatch',
        level: 'warning',
        label: `外部工具未声明默认策略：${tool.name}`,
        detail: 'external tools without defaultToolPolicy are disabled',
        payload: { toolName: tool.name, defaultToolPolicy: null },
      })
      return false
    }
    if (tool.policy === 'write' && tool.defaultToolPolicy !== 'allowedWithPermission') {
      toolPolicyDiagnostics.push({
        type: 'tool_policy_mismatch',
        level: 'warning',
        label: `写入工具策略不一致：${tool.name}`,
        detail: `policy=write, defaultToolPolicy=${tool.defaultToolPolicy}`,
        payload: { toolName: tool.name, policy: tool.policy, defaultToolPolicy: tool.defaultToolPolicy },
      })
      return false
    }
    if (tool.policy !== 'write' && tool.defaultToolPolicy === 'allowedWithPermission') {
      toolPolicyDiagnostics.push({
        type: 'tool_policy_mismatch',
        level: 'warning',
        label: `读取工具策略不一致：${tool.name}`,
        detail: `policy=${tool.policy}, defaultToolPolicy=${tool.defaultToolPolicy}`,
        payload: { toolName: tool.name, policy: tool.policy, defaultToolPolicy: tool.defaultToolPolicy },
      })
      return false
    }
    return true
  }
  const isReadOnlyRound = !permission.writeEditor
  const controlToolBlocked = (tool: AgentToolDefinition): boolean => {
    const isControlTool = tool.control === true || CONTROL_TOOL_NAMES.has(tool.name)
    if (!isControlTool || !isReadOnlyRound) return false
    toolPolicyDiagnostics.push({
      type: 'tool_policy_mismatch',
      level: 'warning',
      label: `控制类工具被只读对话拒绝：${tool.name}`,
      detail: 'control tools can start or cancel requests and are not read-only tools',
      payload: { toolName: tool.name, policy: tool.policy, control: true },
    })
    return true
  }
  const staticallyValidTools = sourceTools.filter(tool => {
    const builtIn = tool.origin !== 'external'
    if (builtIn) return true
    return staticPolicyValid(tool) && !controlToolBlocked(tool)
  })
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
    staticallyValidTools
      .filter(tool => tool.policy !== 'write' && permission.readTarget)
      .map(tool => tool.name),
  )
  const authorizedTools = staticallyValidTools
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
    permissionDecision,
    toolPolicyDiagnostics,
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
      defaultToolPolicy: 'allowedWithPermission',
      riskLevel: 'high',
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
      defaultToolPolicy: 'allowedWithoutPermission',
      riskLevel: 'medium',
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
  options?: {
    activeEditTask?: EditTask | null
    executionPlan?: LongDocumentExecutionPlan | null
  },
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
  const executionPlan = options?.executionPlan || null
  const directWriteAuthorized = hasWrite
    && executionPlan?.mode === 'edit-task'
    && executionPlan.operation !== 'discussion'
  const basePrompt = directWriteAuthorized
    ? systemPrompt.replace('请给出建议和修改意见。', '应用已授权本轮通过 editor.write 直接写入编辑器，请按执行计划完成写入。')
    : systemPrompt
  const writeSurfaceDeclaration = hasWrite
    ? '本轮工具面包含 editor.write(write)。'
    : '本轮工具面未包含 editor.write。'
  const activeTaskDeclaration = activeTask
    ? `当前存在编辑任务 ${activeTask.id}（状态：${activeTask.status}）。${writeSurfaceDeclaration}${activeTaskAwaitsRetry && hasWrite ? '任务状态允许重试当前批次。' : '用户要求继续任务时，任务续跑入口为 task.resume。'}`
    : null
  return [
    basePrompt,
    `本轮实际可调用的工具：${toolList}。`,
    activeTaskDeclaration || writeSurfaceDeclaration,
  ].filter(Boolean).join('\n\n')
}

export function buildDialogueToolSurfaceDeclarationAudit(input: {
  source: 'home' | 'outline'
  toolSurface?: DialogueToolSurfaceSummary
  activeEditTask?: EditTask | null
  executionPlan?: LongDocumentExecutionPlan | null
}) {
  const text = appendDialogueToolSurfaceDeclaration('系统提示', input.toolSurface, {
    activeEditTask: input.activeEditTask,
    executionPlan: input.executionPlan,
  })
  return {
    type: 'dialogue-tool-surface-declaration' as const,
    source: input.source,
    trigger: 'request-built' as const,
    visibleToModel: true,
    toolSurface: input.toolSurface || [],
    text,
    origin: 'application' as const,
  }
}
