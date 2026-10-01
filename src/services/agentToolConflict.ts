import type { AgentToolDefinition, ToolResult } from './editorTools'
import type { AgentOrchestratorTaskResult } from './agentOrchestrator'

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
  'agent.spawn',
  'agent.wait',
  'agent.cancel',
]

export const AGENT_RUNTIME_TOOL_NAMES: readonly string[] = [
  'context.remaining',
  'agent.plan',
  'agent.spawn',
  'agent.wait',
  'agent.cancel',
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

export interface SequentialSubAgentRecord {
  taskId: string
  goal: string
  status: 'running' | 'completed' | 'failed' | 'canceled'
  reason?: string
  result?: AgentOrchestratorTaskResult
  startedAt: number
  finishedAt?: number
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

export interface AgentSubAgentManager {
  spawn(input: {
    taskId: string
    goal: string
    timeoutMs?: number
  }): Promise<{ ok: boolean; taskId?: string; error?: { code: string; message: string } }>
  wait(input: {
    taskId: string
    timeoutMs?: number
  }): Promise<{ ok: boolean; status?: string; error?: { code: string; message: string } }>
  cancel(taskId: string, reason?: string): Promise<{ ok: boolean }>
}

export function createSequentialSubAgentManager(options?: {
  runTask?: (input: { taskId: string; goal: string }) => Promise<AgentOrchestratorTaskResult>
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}): AgentSubAgentManager & {
  getRecord(taskId: string): SequentialSubAgentRecord | null
  listRecords(): SequentialSubAgentRecord[]
} {
  const records = new Map<string, SequentialSubAgentRecord>()
  const queue: SequentialSubAgentRecord[] = []
  let executing = false
  const now = options?.now || (() => Date.now())
  const sleep = options?.sleep || (async (ms: number) => {
    await new Promise(resolve => setTimeout(resolve, ms))
  })
  const settle = (record: SequentialSubAgentRecord, result: AgentOrchestratorTaskResult) => {
    if (record.status !== 'running') return
    record.status = result.status === 'completed' ? 'completed' : 'failed'
    record.reason = result.reason
    record.result = result
    record.finishedAt = now()
  }
  const runNext = () => {
    if (executing || queue.length === 0) return
    const record = queue.shift()
    if (!record) return
    if (record.status !== 'running') {
      runNext()
      return
    }
    executing = true
    const finish = () => {
      executing = false
      runNext()
    }
    if (!options?.runTask) {
      finish()
      return
    }
    void options.runTask({ taskId: record.taskId, goal: record.goal })
      .then(result => settle(record, result))
      .catch(error => {
        if (record.status === 'running') {
          record.status = 'failed'
          record.reason = error instanceof Error ? error.message : String(error)
          record.finishedAt = now()
        }
      })
      .then(finish)
  }

  return {
    async spawn(input) {
      const taskId = String(input.taskId || '').trim()
      const goal = String(input.goal || '').trim()
      if (!taskId || !goal) {
        return { ok: false, error: { code: 'invalid_sub_agent', message: '子任务 ID 和目标不能为空' } }
      }
      if (records.has(taskId)) {
        return { ok: false, error: { code: 'duplicate_sub_agent', message: '子任务已存在，当前只支持顺序执行' } }
      }
      const record: SequentialSubAgentRecord = {
        taskId,
        goal,
        status: 'running',
        startedAt: now(),
      }
      records.set(taskId, record)
      queue.push(record)
      runNext()
      return { ok: true, taskId }
    },
    async wait(input) {
      const record = records.get(String(input.taskId || '').trim())
      if (!record) {
        return { ok: false, error: { code: 'sub_agent_not_found', message: '子任务不存在' } }
      }
      const timeoutMs = typeof input.timeoutMs === 'number' && input.timeoutMs > 0 ? input.timeoutMs : 0
      const deadline = timeoutMs > 0 ? now() + timeoutMs : Infinity
      while (record.status === 'running') {
        if (now() >= deadline) {
          record.status = 'failed'
          record.reason = 'sub_agent_timeout'
          record.finishedAt = now()
          return {
            ok: false,
            error: { code: 'sub_agent_timeout', message: `子任务超时：${timeoutMs}ms` },
          }
        }
        await sleep(timeoutMs > 0 ? Math.min(20, Math.max(1, deadline - now())) : 20)
      }
      return { ok: true, status: record.status }
    },
    async cancel(taskId, reason) {
      const record = records.get(String(taskId || '').trim())
      if (!record) return { ok: false }
      if (record.status !== 'running') return { ok: true }
      record.status = 'canceled'
      record.reason = reason || 'user_cancel'
      record.finishedAt = now()
      return { ok: true }
    },
    getRecord(taskId) {
      return records.get(String(taskId || '').trim()) || null
    },
    listRecords() {
      return [...records.values()].sort((a, b) => a.startedAt - b.startedAt)
    },
  }
}

export function createAgentSubAgentTools(input: {
  manager: AgentSubAgentManager
  onConflict?: (event: ToolConflictDiagnostic) => void
}): AgentToolDefinition[] {
  const { manager } = input

  return [
    {
      name: 'agent.spawn',
      description: '顺序启动一个子 Agent 任务。当前版本只支持顺序执行，不支持并行。',
      policy: 'read',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: '子任务 ID' },
          goal: { type: 'string', description: '子任务目标' },
          timeoutMs: { type: 'number', description: '可选超时毫秒数' },
        },
        required: ['taskId', 'goal'],
        additionalProperties: false,
      },
      async execute(rawInput): Promise<ToolResult> {
        const params = rawInput as { taskId?: unknown; goal?: unknown; timeoutMs?: unknown }
        if (typeof params.taskId !== 'string' || !params.taskId.trim()) {
          return { ok: false, error: { code: 'invalid_task_id', message: '子任务 ID 不能为空' } }
        }
        if (typeof params.goal !== 'string' || !params.goal.trim()) {
          return { ok: false, error: { code: 'invalid_goal', message: '子任务目标不能为空' } }
        }
        const timeoutMs = typeof params.timeoutMs === 'number' && params.timeoutMs > 0
          ? params.timeoutMs
          : undefined
      const spawned = await manager.spawn({ taskId: params.taskId, goal: params.goal, timeoutMs })
        if (!spawned.ok) return { ok: false, error: spawned.error || { code: 'spawn_failed', message: '子任务启动失败' } }
        return { ok: true, data: { taskId: spawned.taskId } }
      },
    },
    {
      name: 'agent.wait',
      description: '等待一个子 Agent 任务进入终态。超时会返回明确错误，不静默重跑。',
      policy: 'read',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: '子任务 ID' },
          timeoutMs: { type: 'number', description: '可选等待超时毫秒数' },
        },
        required: ['taskId'],
        additionalProperties: false,
      },
      async execute(rawInput): Promise<ToolResult> {
        const params = rawInput as { taskId?: unknown; timeoutMs?: unknown }
        if (typeof params.taskId !== 'string' || !params.taskId.trim()) {
          return { ok: false, error: { code: 'invalid_task_id', message: '子任务 ID 不能为空' } }
        }
        const timeoutMs = typeof params.timeoutMs === 'number' && params.timeoutMs > 0
          ? params.timeoutMs
          : undefined
        const waited = await manager.wait({ taskId: params.taskId, timeoutMs })
        if (!waited.ok) return { ok: false, error: waited.error || { code: 'wait_failed', message: '子任务等待失败' } }
        return { ok: true, data: { taskId: params.taskId, status: waited.status } }
      },
    },
    {
      name: 'agent.cancel',
      description: '取消一个子 Agent 任务，任务必须进入终态 canceled。',
      policy: 'read',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: '子任务 ID' },
          reason: { type: 'string', description: '取消原因' },
        },
        required: ['taskId'],
        additionalProperties: false,
      },
      async execute(rawInput): Promise<ToolResult> {
        const params = rawInput as { taskId?: unknown; reason?: unknown }
        if (typeof params.taskId !== 'string' || !params.taskId.trim()) {
          return { ok: false, error: { code: 'invalid_task_id', message: '子任务 ID 不能为空' } }
        }
        const canceled = await manager.cancel(params.taskId, typeof params.reason === 'string' ? params.reason : undefined)
        if (!canceled.ok) return { ok: false, error: { code: 'cancel_failed', message: '子任务取消失败' } }
        return { ok: true, data: { taskId: params.taskId, status: 'canceled' } }
      },
    },
  ]
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
