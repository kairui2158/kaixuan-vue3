import type { AgentToolDefinition, AgentToolContext, ToolResult } from './editorTools'
import type { ContextMessage } from '../types/context'

export const DIALOGUE_FOUNDATION_VERSION = 1

export type DialogueIntent =
  | 'discuss'
  | 'analyze'
  | 'edit'
  | 'generate'
  | 'auto'

export type DialoguePermissionName =
  | 'read_target'
  | 'write_editor'

export interface DialoguePermission {
  intent: Exclude<DialogueIntent, 'auto'>
  readTarget: boolean
  writeEditor: boolean
}

export type DialogueWriteMode = 'direct'

export type DialogueToolKind =
  | 'editor_read'
  | 'editor_write'
  | 'outline_read'
  | 'pipeline_read'

export type DialogueWorkspace =
  | 'main'
  | 'outline'
  | 'pipeline'

export interface DialogueToolSet {
  version: 1
  workspace: DialogueWorkspace
  tools: AgentToolDefinition[]
  readableTargets?: string[]
  writableTarget?: string
}

export type DialogueToolDeclaration =
  | {
      name: string
      kind: DialogueToolKind
      readableTargets?: string[]
      writableTarget?: string
    }

export interface DialogueToolValidationResult {
  valid: boolean
  errors: string[]
  tools: AgentToolDefinition[]
}

export function resolveDialoguePermission(
  intent: DialogueIntent,
  writeMode: DialogueWriteMode = 'direct',
): DialoguePermission {
  const normalized: Exclude<DialogueIntent, 'auto'> =
    intent === 'auto' ? 'discuss' : intent
  const canWrite = normalized === 'edit' || normalized === 'generate'
  void writeMode
  return {
    intent: normalized,
    readTarget: true,
    writeEditor: canWrite,
  }
}

export function validateDialogueToolSet(
  toolSet: DialogueToolSet,
): DialogueToolValidationResult {
  const errors: string[] = []
  if (toolSet.version !== DIALOGUE_FOUNDATION_VERSION) {
    errors.push(`工具集版本必须是 ${DIALOGUE_FOUNDATION_VERSION}`)
  }
  if (!['main', 'outline', 'pipeline'].includes(toolSet.workspace)) {
    errors.push('工具集 workspace 非法')
  }
  if (toolSet.workspace === 'pipeline' && toolSet.tools.length > 0) {
    errors.push('生成流水线禁止注册交互式对话工具')
  }
  if (!Array.isArray(toolSet.tools)) {
    return {
      valid: false,
      errors: [...errors, 'tools 必须是数组'],
      tools: [],
    }
  }

  const names = new Set<string>()
  for (const tool of toolSet.tools) {
    if (!tool || typeof tool !== 'object') {
      errors.push('存在非法工具对象')
      continue
    }
    if (!tool.name || typeof tool.name !== 'string') {
      errors.push('存在缺少 name 的工具')
      continue
    }
    if (names.has(tool.name)) {
      errors.push(`工具重名：${tool.name}`)
      continue
    }
    names.add(tool.name)

    if (tool.policy !== 'read' && tool.policy !== 'write') {
      errors.push(`工具 ${tool.name} 的 policy 非法`)
      continue
    }
    if (
      !tool.inputSchema ||
      tool.inputSchema.type !== 'object' ||
      typeof tool.inputSchema.properties !== 'object' ||
      tool.inputSchema.properties === null
    ) {
      errors.push(`工具 ${tool.name} 的 inputSchema 非法`)
      continue
    }
    if (typeof tool.execute !== 'function') {
      errors.push(`工具 ${tool.name} 缺少 execute`)
      continue
    }

    if (tool.policy === 'read' && !toolSet.readableTargets?.length) {
      errors.push(`读取工具 ${tool.name} 缺少 readableTargets 声明`)
    }
    if (
      tool.policy === 'write' &&
      (!toolSet.writableTarget || !toolSet.writableTarget.trim())
    ) {
      errors.push(`写入工具 ${tool.name} 缺少 writableTarget 声明`)
    }
    if (
      tool.policy === 'write' &&
      toolSet.workspace === 'pipeline'
    ) {
      errors.push(`流水线工具集禁止写入工具：${tool.name}`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    tools: toolSet.tools.filter(tool => tool && typeof tool.name === 'string'),
  }
}

export function resolveDialogueToolSurface(
  toolSet: DialogueToolSet,
  intent: DialogueIntent,
  writeMode: DialogueWriteMode = 'direct',
): AgentToolDefinition[] {
  const validation = validateDialogueToolSet(toolSet)
  if (!validation.valid) return []
  const permission = resolveDialoguePermission(intent, writeMode)
  const canDirectWrite = permission.intent === 'edit' || permission.intent === 'generate'
  return toolSet.tools.filter(tool => {
    if (tool.policy === 'read') return permission.readTarget
    return canDirectWrite && permission.writeEditor
  })
}

export function describeDialogueTools(
  toolSet: DialogueToolSet,
): DialogueToolDeclaration[] {
  return toolSet.tools.map(tool => ({
    name: tool.name,
    kind:
      tool.policy === 'write'
        ? 'editor_write'
        : tool.name.startsWith('outline.')
          ? 'outline_read'
          : tool.name.startsWith('pipeline.')
            ? 'pipeline_read'
            : 'editor_read',
    ...(tool.policy === 'read'
      ? { readableTargets: toolSet.readableTargets || [] }
      : { writableTarget: toolSet.writableTarget }),
  }))
}

export type DialogueContextCoverage =
  | 'full'
  | 'packed'
  | 'partial'
  | 'structure_map'
  | 'reference'
  | 'selection'

export interface DialogueContextBlock {
  source:
    | 'editorContent'
    | 'referenceOutline'
    | 'outline'
    | 'settings'
    | 'memory'
    | 'selection'
    | 'pipeline'
    | 'activeTab'
  version: string
  coverage: DialogueContextCoverage
  content?: string
  truncated?: boolean
}

export interface DialogueContextValidationResult {
  valid: boolean
  errors: string[]
}

const SOURCE_WITH_CONTENT = new Set<DialogueContextBlock['source']>([
  'editorContent',
  'referenceOutline',
  'outline',
  'settings',
  'memory',
  'selection',
  'pipeline',
])

export function validateDialogueContextBlocks(
  blocks: unknown,
): DialogueContextValidationResult {
  const errors: string[] = []
  if (!Array.isArray(blocks)) {
    return { valid: false, errors: ['上下文块必须是数组'] }
  }
  const sources = new Set<string>()
  for (const block of blocks) {
    if (!block || typeof block !== 'object') {
      errors.push('存在非法上下文块')
      continue
    }
    const value = block as Partial<DialogueContextBlock>
    if (!value.source || typeof value.source !== 'string') {
      errors.push('上下文块缺少 source')
      continue
    }
    if (sources.has(value.source)) {
      errors.push(`上下文块来源重复：${value.source}`)
      continue
    }
    sources.add(value.source)
    if (!value.version || typeof value.version !== 'string') {
      errors.push(`上下文块 ${value.source} 缺少 version`)
    }
    if (
      !value.coverage ||
      !['full', 'packed', 'partial', 'structure_map', 'reference', 'selection'].includes(
        value.coverage,
      )
    ) {
      errors.push(`上下文块 ${value.source} 的 coverage 非法`)
    }
    if (
      SOURCE_WITH_CONTENT.has(value.source as DialogueContextBlock['source']) &&
      typeof value.content !== 'string'
    ) {
      errors.push(`上下文块 ${value.source} 缺少 content`)
    }
    if (value.coverage === 'full' && value.truncated === true) {
      errors.push(`上下文块 ${value.source} 声明 full 但 truncated=true`)
    }
  }
  return { valid: errors.length === 0, errors }
}

export type DialogueBatchEventName =
  | 'pending'
  | 'applied'
  | 'expired'
  | 'rejected'
  | 'version_changed'
  | 'locked'
  | 'rolled_back'

export interface DialogueBatchEvent {
  version: 1
  batchId: string
  workspace: 'main' | 'outline'
  targetId: string
  status: DialogueBatchEventName
  commandCount: number
  reason?: string
  occurredAt: number
}

export interface DialogueRunRecordEvent {
  type:
    | 'run_started'
    | 'api_started'
    | 'api_finished'
    | 'tool_started'
    | 'tool_finished'
    | 'batch_event'
    | 'run_finished'
  at: string
  label?: string
  detail?: string
  level?: 'info' | 'warning' | 'error'
  batchEvent?: DialogueBatchEvent
}

export function normalizeDialogueBatchEvent(
  raw: unknown,
): DialogueBatchEvent | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const value = raw as Partial<DialogueBatchEvent>
  if (value.version !== 1) return null
  if (typeof value.batchId !== 'string' || !value.batchId) return null
  if (value.workspace !== 'main' && value.workspace !== 'outline') return null
  if (typeof value.targetId !== 'string' || !value.targetId) return null
  const validStatuses: DialogueBatchEventName[] = [
    'pending',
    'applied',
    'expired',
    'rejected',
    'version_changed',
    'locked',
    'rolled_back',
  ]
  if (!validStatuses.includes(value.status as DialogueBatchEventName)) {
    return null
  }
  if (typeof value.commandCount !== 'number' || value.commandCount < 1) {
    return null
  }
  return {
    version: 1,
    batchId: value.batchId,
    workspace: value.workspace,
    targetId: value.targetId,
    status: value.status as DialogueBatchEventName,
    commandCount: value.commandCount,
    reason: typeof value.reason === 'string' ? value.reason : undefined,
    occurredAt: Number(value.occurredAt) || Date.now(),
  }
}

export interface DialogueFoundationExecutionResult {
  intent: Exclude<DialogueIntent, 'auto'>
  permission: DialoguePermission
  toolNames: string[]
  toolDeclarations: DialogueToolDeclaration[]
  contextBlocks: DialogueContextBlock[]
  contextValidation: DialogueContextValidationResult
  messages: ContextMessage[]
}

export async function executeDialogueFoundation(
  input: {
    intent: DialogueIntent
    writeMode?: DialogueWriteMode
    toolSet: DialogueToolSet
    contextBlocks: DialogueContextBlock[]
    baseMessages: ContextMessage[]
    executeTool?: (
      tool: AgentToolDefinition,
      toolInput: unknown,
      context: AgentToolContext,
    ) => Promise<ToolResult>
    toolCalls?: Array<{ name: string; input: unknown }>
    toolContext?: AgentToolContext
  },
): Promise<DialogueFoundationExecutionResult> {
  const permission = resolveDialoguePermission(input.intent, input.writeMode)
  const validation = validateDialogueToolSet(input.toolSet)
  const tools = validation.valid
    ? resolveDialogueToolSurface(input.toolSet, input.intent, input.writeMode)
    : []
  const contextValidation = validateDialogueContextBlocks(
    input.contextBlocks,
  )
  const messages = input.baseMessages
  const baseResult: DialogueFoundationExecutionResult = {
    intent: permission.intent,
    permission,
    toolNames: tools.map(tool => tool.name),
    toolDeclarations: describeDialogueTools(input.toolSet),
    contextBlocks: input.contextBlocks,
    contextValidation,
    messages,
  }
  if (!input.toolCalls?.length || !input.executeTool) return baseResult

  for (const call of input.toolCalls) {
    const tool = tools.find(item => item.name === call.name)
    if (!tool) continue
    const context: AgentToolContext =
      input.toolContext ||
      ({
        projectId: 'unknown-project',
        workspace: input.toolSet.workspace === 'pipeline' ? 'main' : input.toolSet.workspace,
        targetId: input.toolSet.writableTarget || 'unknown-target',
        sessionId: 'unknown-session',
        iteration: 0,
      } as AgentToolContext)
    await input.executeTool(tool, call.input, context)
  }
  return baseResult
}
