import type { EditorTargetSnapshot } from './editorTarget'

export type AgentToolPolicy = 'read' | 'write'

export interface AgentToolContext {
  projectId: string
  workspace: 'main' | 'outline'
  targetId: string
  sessionId: string
  iteration: number
  abortSignal?: AbortSignal
}

export interface ToolResult {
  ok: boolean
  data?: unknown
  error?: {
    code: string
    message: string
    retryable?: boolean
  }
}

export interface AgentToolDefinition {
  name: string
  description: string
  policy: AgentToolPolicy
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
  timeoutMs?: number
  execute(input: unknown, context: AgentToolContext): Promise<ToolResult>
}

export interface ToolCallEvent {
  toolName: string
  policy: AgentToolPolicy
  iteration: number
  input: unknown
  result: ToolResult
  durationMs: number
}

export type ToolEventSink = (event: ToolCallEvent) => void

const MAX_CONTEXT_WINDOW = 300
const MAX_SEARCH_RESULTS = 20
const MAX_PLAN_STEPS = 20

function toolError(code: string, message: string, retryable = false): ToolResult {
  return { ok: false, error: { code, message, retryable } }
}

function contextWindow(content: string, start: number, end: number): string {
  const from = Math.max(0, Math.floor((start + end) / 2) - MAX_CONTEXT_WINDOW / 2)
  const to = Math.min(content.length, from + MAX_CONTEXT_WINDOW)
  return content.slice(from, to)
}

function findMatches(content: string, query: string, caseSensitive: boolean): Array<{ start: number; end: number }> {
  if (!query) return []
  const haystack = caseSensitive ? content : content.toLowerCase()
  const needle = caseSensitive ? query : query.toLowerCase()
  const matches: Array<{ start: number; end: number }> = []
  let index = haystack.indexOf(needle)
  while (index >= 0 && matches.length <= MAX_SEARCH_RESULTS) {
    matches.push({ start: index, end: index + query.length })
    index = haystack.indexOf(needle, index + Math.max(1, needle.length))
  }
  return matches
}

export function createEditorTools(options: {
  getSnapshot: () => EditorTargetSnapshot | null
  onPlanUpdate?: (plan: { stage: string; steps: string[] }) => void
}): AgentToolDefinition[] {
  const getState: AgentToolDefinition = {
    name: 'editor.get_state',
    description: '读取当前编辑目标摘要：目标、字数、选区、快照版本。不返回全文。',
    policy: 'read',
    inputSchema: { type: 'object', properties: {} },
    async execute() {
      const snapshot = options.getSnapshot()
      if (!snapshot) return toolError('target_missing', '当前没有可编辑目标')
      return {
        ok: true,
        data: {
          workspace: snapshot.workspace,
          targetId: snapshot.targetId,
          label: snapshot.label,
          contentLength: snapshot.content.length,
          contentPreview: snapshot.content.slice(0, 240),
          contentVersion: snapshot.contentVersion,
          selectionStart: snapshot.selectionStart,
          selectionEnd: snapshot.selectionEnd,
          hasSelection: snapshot.selectedText.length > 0,
          selectedTextPreview: snapshot.selectedText.slice(0, 240),
          mode: snapshot.mode,
        },
      }
    },
  }

  const search: AgentToolDefinition = {
    name: 'editor.search',
    description: '按关键词搜索编辑内容，返回少量位置和上下文窗口。',
    policy: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索文本' },
        caseSensitive: { type: 'boolean', description: '是否区分大小写，默认 false' },
      },
      required: ['query'],
    },
    async execute(input) {
      const snapshot = options.getSnapshot()
      if (!snapshot) return toolError('target_missing', '当前没有可编辑目标')
      const params = input as { query?: unknown; caseSensitive?: unknown }
      if (typeof params.query !== 'string' || !params.query.trim()) {
        return toolError('invalid_input', 'query 必须是非空字符串')
      }
      const caseSensitive = params.caseSensitive === true
      const matches = findMatches(snapshot.content, params.query, caseSensitive)
      return {
        ok: true,
        data: {
          total: Math.min(matches.length, MAX_SEARCH_RESULTS),
          truncated: matches.length > MAX_SEARCH_RESULTS,
          matches: matches.slice(0, MAX_SEARCH_RESULTS).map(match => ({
            start: match.start,
            end: match.end,
            context: contextWindow(snapshot.content, match.start, match.end),
          })),
        },
      }
    },
  }

  const locate: AgentToolDefinition = {
    name: 'editor.locate',
    description: '验证候选片段是否唯一存在，并返回位置。用于编辑前定位。',
    policy: 'read',
    inputSchema: {
      type: 'object',
      properties: { fragment: { type: 'string', description: '从原文逐字复制的候选片段' } },
      required: ['fragment'],
    },
    async execute(input) {
      const snapshot = options.getSnapshot()
      if (!snapshot) return toolError('target_missing', '当前没有可编辑目标')
      const params = input as { fragment?: unknown }
      if (typeof params.fragment !== 'string' || !params.fragment) {
        return toolError('invalid_input', 'fragment 必须是非空字符串')
      }
      const matches = findMatches(snapshot.content, params.fragment, true)
      if (matches.length === 0) return toolError('target_not_found', '片段不存在，请重新复制原文')
      if (matches.length > 1) {
        return toolError('ambiguous_target', '片段出现多次，必须扩展片段使其唯一')
      }
      const match = matches[0]
      return {
        ok: true,
        data: {
          unique: true,
          start: match.start,
          end: match.end,
          context: contextWindow(snapshot.content, match.start, match.end),
        },
      }
    },
  }

  const proposeEdits: AgentToolDefinition = {
    name: 'editor.propose_edits',
    description: '提交受限编辑批次，只进入待确认暂存区，不会写入编辑器。',
    policy: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        commands: {
          type: 'array',
          description: '1-10 条受限编辑命令',
          items: {
            type: 'object',
            properties: {
              operation: { type: 'string' },
              content: { type: 'string' },
              target: { type: 'string' },
              position: { type: 'string' },
              reason: { type: 'string' },
            },
            required: ['operation'],
          },
        },
        reason: { type: 'string', description: '整批修改说明' },
      },
      required: ['commands'],
    },
    async execute(input) {
      const params = input as { commands?: unknown }
      if (!Array.isArray(params.commands) || params.commands.length === 0) {
        return toolError('invalid_input', 'commands 必须是非空数组')
      }
      if (params.commands.length > 10) {
        return toolError('too_many_commands', '单批最多 10 条编辑命令')
      }
      const totalLength = params.commands.reduce((sum, command) => {
        const item = command as { content?: unknown; target?: unknown }
        return sum + (typeof item?.content === 'string' ? item.content.length : 0) +
          (typeof item?.target === 'string' ? item.target.length : 0)
      }, 0)
      if (totalLength > 60000) {
        return toolError('batch_too_large', '批次内容超过 60000 字符上限')
      }
      return {
        ok: true,
        data: {
          status: 'pending_user_confirmation',
          commandCount: params.commands.length,
          totalLength,
        },
      }
    },
  }

  const updatePlan: AgentToolDefinition = {
    name: 'task.update_plan',
    description: '更新当前编辑任务计划，仅用于界面状态，不修改正文。',
    policy: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        stage: { type: 'string', description: '当前阶段说明' },
        steps: { type: 'array', items: { type: 'string' }, description: '计划步骤' },
      },
      required: ['stage', 'steps'],
    },
    async execute(input) {
      const params = input as { stage?: unknown; steps?: unknown }
      if (typeof params.stage !== 'string' || !params.stage.trim()) {
        return toolError('invalid_input', 'stage 必须是非空字符串')
      }
      if (!Array.isArray(params.steps) || params.steps.some(step => typeof step !== 'string')) {
        return toolError('invalid_input', 'steps 必须是字符串数组')
      }
      const steps = params.steps.slice(0, MAX_PLAN_STEPS)
      options.onPlanUpdate?.({ stage: params.stage, steps })
      return { ok: true, data: { stage: params.stage, steps } }
    },
  }

  return [getState, search, locate, proposeEdits, updatePlan]
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : (error as { name?: string } | null)?.name === 'AbortError'
}

export class ToolGateway {
  private tools = new Map<string, AgentToolDefinition>()
  private events: ToolEventSink[] = []

  register(tool: AgentToolDefinition): void {
    this.tools.set(tool.name, tool)
  }

  registerAll(tools: AgentToolDefinition[]): void {
    for (const tool of tools) this.register(tool)
  }

  has(name: string): boolean {
    return this.tools.has(name)
  }

  list(): AgentToolDefinition[] {
    return Array.from(this.tools.values())
  }

  onEvent(sink: ToolEventSink): void {
    this.events.push(sink)
  }

  private emit(event: ToolCallEvent): void {
    for (const sink of this.events) sink(event)
  }

  private validateInput(tool: AgentToolDefinition, input: unknown): ToolResult | null {
    if (input == null || typeof input !== 'object' || Array.isArray(input)) {
      return toolError('invalid_input', '工具参数必须是对象')
    }
    for (const key of tool.inputSchema.required || []) {
      if (!(key in (input as Record<string, unknown>))) {
        return toolError('missing_field', `缺少必填参数：${key}`)
      }
    }
    return null
  }

  async execute(name: string, input: unknown, context: AgentToolContext): Promise<ToolResult> {
    const started = Date.now()
    const tool = this.tools.get(name)
    if (!tool) {
      const result = toolError('tool_not_found', `工具不存在：${name}`)
      this.emit({ toolName: name, policy: 'write', iteration: context.iteration, input, result, durationMs: 0 })
      return result
    }
    if (context.abortSignal?.aborted) {
      const result = toolError('canceled', '工具调用已被用户取消', true)
      this.emit({ toolName: name, policy: tool.policy, iteration: context.iteration, input, result, durationMs: 0 })
      return result
    }
    const invalid = this.validateInput(tool, input)
    if (invalid) {
      this.emit({ toolName: name, policy: tool.policy, iteration: context.iteration, input, result: invalid, durationMs: Date.now() - started })
      return invalid
    }

    try {
      const result = await tool.execute(input, context)
      this.emit({ toolName: name, policy: tool.policy, iteration: context.iteration, input, result, durationMs: Date.now() - started })
      return result
    } catch (error) {
      const result = isAbortError(error)
        ? toolError('canceled', '工具调用已被用户取消', true)
        : toolError('tool_execution_failed', `工具执行失败：${(error as Error)?.message || String(error)}`)
      this.emit({ toolName: name, policy: tool.policy, iteration: context.iteration, input, result, durationMs: Date.now() - started })
      return result
    }
  }
}
