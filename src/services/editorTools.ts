import type { DialogueToolSet, DialogueWorkspace } from './dialogueFoundation'
import { validateDialogueToolSet } from './dialogueFoundation'
import type { EditorTargetSnapshot } from './editorTarget'
import { locateEditorFragment } from './editorEditLocator'
import type { EditorEditCommand } from './editorEditProtocol'
import { diagnoseEditorEditBatch } from './editorEditDiagnostics'
import { mergeRetriedCommands, planEditorEditBatch } from './editorEditBatch'
import { parseOutlineStructure, type OutlineStructureNode } from './outlineStructure'

export type AgentToolPolicy = 'read' | 'write'

export interface AgentToolContext {
  projectId: string
  workspace: 'main' | 'outline'
  targetId: string
  readableTargets?: string[]
  writableTarget?: string
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

export type EditorWriteMode = 'direct'

export interface EditorWriteApplyInput {
  workspace: 'main' | 'outline'
  targetId: string
  batchId: string
  next: string
  original: string
  commands: EditorEditCommand[]
  reason?: string
  reveal: {
    mode: 'stream' | 'instant'
    firstChange: boolean
  }
}

export type EditorWriteApplier = (input: EditorWriteApplyInput) => Promise<
  | { ok: true; rollbackAvailable: boolean }
  | { ok: false; code: string; message: string }
>

export interface EditorWriteRetryCarrier {
  workspace: string
  targetId: string
  contentVersion: number
  commands: EditorEditCommand[]
  succeededIndexes: number[]
}

export interface EditorRevealTargetInput {
  fragment?: string
  paragraphIndex?: number
  anchor?: {
    volumeTitle?: string
    chapterTitle?: string
    sectionTitle?: string
  }
  range?: { start: number; end: number }
}

export type EditorRevealFocus = 'auto' | 'start' | 'end' | 'center'

export interface EditorRevealRequest {
  workspace: 'main' | 'outline'
  targetId: string
  start: number
  end: number
  focus: EditorRevealFocus
  highlightMs: number
  reason?: string
}

export type EditorRevealer = (request: EditorRevealRequest) => Promise<void>

const MAX_CONTEXT_WINDOW = 300
const MAX_SEARCH_RESULTS = 20
const MAX_PLAN_STEPS = 20
const MAX_REVEAL_RANGE = 20000

interface RevealSuccess {
  ok: true
  start: number
  end: number
  line: number
  structurePath: string[]
  degraded: boolean
}

interface RevealFailure {
  ok: false
  code: string
  message: string
  retryable: boolean
  data?: unknown
}

function buildStructurePath(
  structure: ReturnType<typeof parseOutlineStructure>,
  start: number,
  end: number
): string[] {
  const path: string[] = []
  const walk = (nodes: OutlineStructureNode[]): boolean => {
    for (const node of nodes) {
      if (node.end <= start) continue
      if (node.start >= end) continue
      path.push(node.title)
      if (walk(node.children)) return true
      return true
    }
    return false
  }
  walk(structure.nodes)
  return path
}

function resolveRevealRange(target: EditorRevealTargetInput, content: string): RevealSuccess | RevealFailure {
  const hasFragment = typeof target.fragment === 'string' && target.fragment.trim().length > 0
  const hasParagraphIndex = typeof target.paragraphIndex === 'number' && Number.isFinite(target.paragraphIndex)
  const hasAnchor = !!target.anchor && [
    target.anchor.volumeTitle,
    target.anchor.chapterTitle,
    target.anchor.sectionTitle,
  ].some(title => typeof title === 'string' && title.trim().length > 0)
  const hasRange = !!target.range && Number.isFinite(target.range.start) && Number.isFinite(target.range.end)
  if ([hasFragment, hasParagraphIndex, hasAnchor, hasRange].filter(Boolean).length !== 1) {
    return {
      ok: false,
      code: 'invalid_input',
      message: 'target 必须且只能提供 fragment / paragraphIndex / anchor / range 之一',
      retryable: true,
    }
  }

  const structure = parseOutlineStructure(content)
  const toSuccess = (start: number, end: number, degraded = structure.degraded): RevealSuccess => ({
    ok: true,
    start,
    end,
    line: content.slice(0, start).split('\n').length,
    structurePath: buildStructurePath(structure, start, end),
    degraded,
  })

  if (hasFragment) {
    const located = locateEditorFragment({ content, fragment: target.fragment as string })
    if (located.ok) {
      return toSuccess(located.start, located.end)
    }
    if (located.reason === 'ambiguous_target') {
      return {
        ok: false,
        code: 'ambiguous_target',
        message: located.message,
        retryable: true,
        data: { matches: located.matches },
      }
    }
    if (located.reason === 'target_not_found' && located.candidates?.length) {
      return {
        ok: false,
        code: 'target_not_found',
        message: located.message,
        retryable: true,
        data: { candidates: located.candidates },
      }
    }
    return {
      ok: false,
      code: located.reason || 'target_not_found',
      message: located.message,
      retryable: true,
    }
  }

  if (hasParagraphIndex) {
    const index = target.paragraphIndex as number
    if (index < 0) {
      return { ok: false, code: 'invalid_input', message: 'paragraphIndex 不能为负数', retryable: true }
    }
    const paragraphs = content.split(/\n{2,}/)
    if (index >= paragraphs.length) {
      return {
        ok: false,
        code: 'target_not_found',
        message: `段落索引不存在：当前共 ${paragraphs.length} 段，合法范围 0-${paragraphs.length - 1}`,
        retryable: true,
      }
    }
    let cursor = 0
    for (let current = 0; current < index; current += 1) {
      cursor += paragraphs[current].length + 2
    }
    return toSuccess(cursor, cursor + paragraphs[index].length, true)
  }

  if (hasAnchor) {
    const anchor = target.anchor!
    const wanted = anchor.sectionTitle || anchor.chapterTitle || anchor.volumeTitle || ''
    const exact = content.indexOf(wanted)
    if (exact < 0) {
      return {
        ok: false,
        code: 'target_not_found',
        message: '结构锚点不存在；请改用候选锚点或先读取结构地图',
        retryable: true,
        data: { anchor },
      }
    }
    const nextBreak = content.indexOf('\n', exact + wanted.length)
    const end = nextBreak < 0 ? content.length : nextBreak
    return toSuccess(exact, end)
  }

  const range = target.range!
  const start = Math.max(0, Math.floor(range.start))
  const end = Math.min(content.length, Math.ceil(range.end))
  if (end <= start) {
    return { ok: false, code: 'invalid_input', message: 'range.end 必须大于 range.start', retryable: true }
  }
  if (end - start > MAX_REVEAL_RANGE) {
    return { ok: false, code: 'range_too_large', message: '定位范围不能超过 20000 字符', retryable: true }
  }
  return toSuccess(start, end)
}

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
    matches.push({ start: index, end: index + needle.length })
    index = haystack.indexOf(needle, index + 1)
  }
  return matches
}

export function createEditorTools(options: {
  getSnapshot: () => EditorTargetSnapshot | null
  getAllSnapshots?: () => EditorTargetSnapshot[]
  onPlanUpdate?: (plan: { stage: string; steps: string[] }) => void
  mode?: EditorWriteMode
  applyWrite?: EditorWriteApplier
  revealTarget?: EditorRevealer
  workspace?: DialogueWorkspace
  onFailedBatch?: (batch: EditorWriteRetryCarrier | null) => void
  takeFailedBatch?: () => EditorWriteRetryCarrier | null
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
    description: '验证候选片段是否唯一存在，并返回位置。精确匹配失败时返回Top-3模糊候选。',
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
      const located = locateEditorFragment({ content: snapshot.content, fragment: params.fragment })
      if (located.ok) {
        const match = { start: located.start, end: located.end }
        return {
          ok: true,
          data: {
            unique: true,
            fuzzy: false,
            start: match.start,
            end: match.end,
            context: located.context,
          },
        }
      }
      if (located.reason === 'ambiguous_target') {
        return toolError('ambiguous_target', '片段出现多次，必须扩展片段使其唯一')
      }
      if (located.reason === 'target_not_found' && located.candidates?.length) {
        return {
          ok: true,
          data: {
            unique: false,
            fuzzy: true,
            candidates: located.candidates,
            hint: '精确匹配失败，以下为相似度最高的候选位置，请选择一个并重新定位',
          },
        }
      }
      if (located.reason === 'target_not_found') {
        return toolError('target_not_found', '片段不存在，请重新复制原文')
      }
      return toolError('invalid_input', '定位请求无效，请提供非空原文片段')
    },
  }

  const writeEdits: AgentToolDefinition = {
    name: 'editor.write',
    description: '立即写入当前编辑器。提交 1-10 条受限编辑命令；应用执行唯一性、版本与锁定校验，通过后立即写入并返回结果；失败返回结构化错误供修正重试。',
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
        reveal: {
          type: 'object',
          description: '写入后的编辑器定位呈现配置',
          properties: {
            mode: { type: 'string', description: 'stream 或 instant' },
            firstChange: { type: 'boolean', description: '是否定位首处变更，默认 true' },
          },
        },
        reason: { type: 'string', description: '整批写入说明' },
      },
      required: ['commands'],
    },
    async execute(input, context) {
      if (options.mode !== 'direct' || !options.applyWrite) {
        return toolError('not_available', '当前会话未启用直写模式')
      }
      const params = input as { commands?: unknown; reason?: unknown; reveal?: unknown }
      if (!Array.isArray(params.commands) || params.commands.length === 0) {
        return toolError('invalid_input', 'commands 必须是非空数组')
      }
      if (params.commands.length > 10) {
        return toolError('too_many_commands', '单批最多 10 条编辑命令')
      }
      const snapshot = options.getSnapshot()
      if (!snapshot) return toolError('target_missing', '当前没有可编辑目标')
      if (context.writableTarget && context.writableTarget !== context.targetId) {
        return toolError('write_target_mismatch', '写入目标与当前编辑目标不一致，禁止跨目标写入')
      }
      if (snapshot.workspace !== context.workspace || snapshot.targetId !== context.targetId) {
        return toolError('write_target_mismatch', '工具目标与当前编辑目标不一致，禁止跨目标写入')
      }

      const totalLength = params.commands.reduce((sum, command) => {
        const item = command as { content?: unknown; target?: unknown }
        return sum + (typeof item?.content === 'string' ? item.content.length : 0) +
          (typeof item?.target === 'string' ? item.target.length : 0)
      }, 0)
      if (totalLength > 60000) {
        return toolError('batch_too_large', '批次内容超过 60000 字符上限')
      }

      const commands: EditorEditCommand[] = (params.commands as Array<Record<string, unknown>>).map(rawCommand => ({
        type: 'editor_edit' as const,
        version: 1 as const,
        operation: (typeof rawCommand.operation === 'string' ? rawCommand.operation : '') as EditorEditCommand['operation'],
        content: typeof rawCommand.content === 'string' ? rawCommand.content : undefined,
        target: typeof rawCommand.target === 'string' ? rawCommand.target : undefined,
        position: (typeof rawCommand.position === 'string' ? rawCommand.position : 'cursor') as EditorEditCommand['position'],
        reason: typeof rawCommand.reason === 'string' ? rawCommand.reason : undefined
      }))

      const batch = {
        type: 'editor_edit_batch' as const,
        version: 1 as const,
        target: {
          workspace: snapshot.workspace,
          targetId: snapshot.targetId,
          contentVersion: snapshot.contentVersion,
        },
        commands,
        reason: typeof params.reason === 'string' ? params.reason : undefined,
      }
      const failedBatch = options.takeFailedBatch?.()
      const failedIndexes = failedBatch
        ? failedBatch.commands.map((_, index) => index).filter(index => !failedBatch.succeededIndexes.includes(index))
        : []
      const retrySource = failedBatch
        && failedBatch.workspace === snapshot.workspace
        && failedBatch.targetId === snapshot.targetId
        && failedBatch.contentVersion === snapshot.contentVersion
        && failedIndexes.length > 0
        && failedIndexes.length === commands.length
        ? failedBatch
        : null
      const canRetryFailedBatch = retrySource !== null
      const retryCursor = { value: 0 }
      const mergedCommands = canRetryFailedBatch
        ? retrySource?.commands.map((command, index) =>
          retrySource?.succeededIndexes.includes(index)
            ? command
            : commands[retryCursor.value++]
        )
        : commands
      const plan = canRetryFailedBatch
        ? mergeRetriedCommands(
          { ...batch, commands: retrySource?.commands || [] },
          retrySource?.succeededIndexes || [],
          commands,
          snapshot,
          { content: snapshot.content }
        )
        : planEditorEditBatch(batch, snapshot, { content: snapshot.content })
      if (!plan.ok) {
        if (canRetryFailedBatch) {
          options.onFailedBatch?.({
            workspace: snapshot.workspace,
            targetId: snapshot.targetId,
            contentVersion: snapshot.contentVersion,
            commands: retrySource?.commands || [],
            succeededIndexes: retrySource?.succeededIndexes || [],
          })
        } else {
          const succeededIndexes = plan.diagnostics?.succeededIndexes || []
          options.onFailedBatch?.(
            succeededIndexes.length > 0 && succeededIndexes.length < commands.length
              ? {
                workspace: snapshot.workspace,
                targetId: snapshot.targetId,
                contentVersion: snapshot.contentVersion,
                commands,
                succeededIndexes,
              }
              : null
          )
        }
        return {
          ok: false,
          error: {
            code: plan.failureReason || 'invalid_command',
            message: plan.diagnostics?.summary || '编辑批次校验失败，原文未修改',
            retryable: true,
          },
          data: plan.diagnostics,
        }
      }
      options.onFailedBatch?.(null)

      const reveal = (params.reveal && typeof params.reveal === 'object' && !Array.isArray(params.reveal))
        ? params.reveal as { mode?: unknown; firstChange?: unknown }
        : {}
      const revealMode = reveal.mode === 'instant' ? 'instant' : 'stream'
      const applied = await options.applyWrite({
        workspace: snapshot.workspace,
        targetId: snapshot.targetId,
        batchId: plan.batchId,
        next: plan.next,
        original: plan.original,
        commands: mergedCommands,
        reason: typeof params.reason === 'string' ? params.reason : undefined,
        reveal: {
          mode: revealMode,
          firstChange: reveal.firstChange !== false,
        },
      })
      if (!applied.ok) {
        return toolError(applied.code || 'write_failed', applied.message || '编辑器写入失败，原文未修改', true)
      }

      return {
        ok: true,
        data: {
          status: 'written',
          batchId: plan.batchId,
          commandCount: mergedCommands.length,
          writtenLength: plan.next.length,
          reveal: { mode: revealMode, firstChange: reveal.firstChange !== false },
          rollbackAvailable: applied.rollbackAvailable,
        },
      }
    }
  }

  const revealTargetTool: AgentToolDefinition = {
    name: 'editor.reveal',
    description: '定位并高亮编辑器中的目标位置，不修改内容。用于回答写入位置、展示候选节点或写入前确认位置。',
    policy: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'object',
          description: '定位目标：fragment / paragraphIndex / anchor / range 四选一',
          properties: {
            fragment: { type: 'string', description: '原文唯一片段' },
            paragraphIndex: { type: 'number', description: '段落索引，从 0 开始' },
            anchor: {
              type: 'object',
              description: '结构锚点，支持卷/章/节标题',
              properties: {
                volumeTitle: { type: 'string' },
                chapterTitle: { type: 'string' },
                sectionTitle: { type: 'string' },
              },
            },
            range: {
              type: 'object',
              description: '精确字符范围',
              properties: {
                start: { type: 'number' },
                end: { type: 'number' },
              },
              required: ['start', 'end'],
            },
          },
        },
        focus: { type: 'string', description: 'auto / start / end / center，默认 auto' },
        highlightDuration: { type: 'number', description: '高亮毫秒数，默认 3000，最大 10000' },
        reason: { type: 'string', description: '定位说明' },
      },
      required: ['target'],
    },
    async execute(input, context) {
      if (!options.revealTarget) {
        return toolError('not_available', '当前会话未启用编辑器定位联动')
      }
      const snapshot = options.getSnapshot()
      if (!snapshot) return toolError('target_missing', '当前没有可编辑目标')
      if (snapshot.workspace !== context.workspace || snapshot.targetId !== context.targetId) {
        return toolError('target_mismatch', '定位目标与当前编辑目标不一致')
      }
      const params = input as {
        target?: EditorRevealTargetInput
        focus?: unknown
        highlightDuration?: unknown
        reason?: unknown
      }
      const target = params.target
      if (!target || typeof target !== 'object' || Array.isArray(target)) {
        return toolError('invalid_input', 'target 必须是定位对象')
      }

      const located = resolveRevealRange(target, snapshot.content)
      if (!located.ok) {
        return {
          ok: false,
          error: {
            code: located.code,
            message: located.message,
            retryable: located.retryable,
          },
          ...(located.data ? { data: located.data } : {}),
        }
      }

      const focus: EditorRevealFocus =
        params.focus === 'start' || params.focus === 'end' || params.focus === 'center'
          ? params.focus
          : 'auto'
      const highlightMs = typeof params.highlightDuration === 'number' && Number.isFinite(params.highlightDuration)
        ? Math.max(0, Math.min(10000, Math.floor(params.highlightDuration)))
        : 3000

      try {
        await options.revealTarget({
          workspace: snapshot.workspace,
          targetId: snapshot.targetId,
          start: located.start,
          end: located.end,
          focus,
          highlightMs,
          reason: typeof params.reason === 'string' ? params.reason : undefined,
        })
      } catch (error) {
        return toolError('reveal_failed', `编辑器定位失败：${(error as Error)?.message || String(error)}`, true)
      }

      return {
        ok: true,
        data: {
          status: 'revealed',
          start: located.start,
          end: located.end,
          line: located.line,
          structurePath: located.structurePath,
          degraded: located.degraded,
          context: contextWindow(snapshot.content, located.start, located.end),
        },
      }
    }
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

  const multiGetState: AgentToolDefinition = {
    name: 'editor.multi_get_state',
    description: '获取多个编辑目标的摘要（最多 5 个）。用于跨目标读取上下文。',
    policy: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        targetIds: {
          type: 'array',
          description: '目标 ID 列表，空数组则返回全部 tab',
          items: { type: 'string' },
        },
      },
    },
    async execute(input) {
      if (!options.getAllSnapshots) return toolError('not_available', '当前工作区不支持多目标读取')
      const allSnapshots = options.getAllSnapshots()
      const params = input as { targetIds?: unknown }
      let requestedIds: string[] = []
      if (Array.isArray(params.targetIds)) {
        requestedIds = (params.targetIds as unknown[]).filter(
          (v): v is string => typeof v === 'string'
        )
      }
      const filtered = requestedIds.length > 0
        ? allSnapshots.filter(s => requestedIds.includes(s.targetId))
        : allSnapshots
      const capped = filtered.slice(0, MAX_READABLE_TARGETS)
      if (capped.length === 0) return toolError('no_targets', '没有可读取的编辑目标')
      return {
        ok: true,
        data: {
          total: capped.length,
          truncated: filtered.length > MAX_READABLE_TARGETS,
          targets: capped.map(s => ({
            workspace: s.workspace,
            targetId: s.targetId,
            label: s.label,
            contentLength: s.content.length,
            contentPreview: s.content.slice(0, 240),
            mode: s.mode,
          })),
        },
      }
    },
  }

  const globalSearch: AgentToolDefinition = {
    name: 'editor.global_search',
    description: '跨所有编辑目标搜索关键词，返回每个目标中的匹配位置和上下文。',
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
      if (!options.getAllSnapshots) return toolError('not_available', '当前工作区不支持全局搜索')
      const params = input as { query?: unknown; caseSensitive?: unknown }
      if (typeof params.query !== 'string' || !params.query.trim()) {
        return toolError('invalid_input', 'query 必须是非空字符串')
      }
      const caseSensitive = params.caseSensitive === true
      const allSnapshots = options.getAllSnapshots()
      const results = allSnapshots.map(s => {
        const matches = findMatches(s.content, params.query as string, caseSensitive)
        return {
          targetId: s.targetId,
          label: s.label,
          workspace: s.workspace,
          matchCount: matches.length,
          matches: matches.slice(0, 5).map(m => ({
            start: m.start,
            end: m.end,
            context: contextWindow(s.content, m.start, m.end),
          })),
        }
      }).filter(r => r.matchCount > 0)
      return {
        ok: true,
        data: {
          totalTargets: results.length,
          totalMatches: results.reduce((sum, r) => sum + r.matchCount, 0),
          results: results.slice(0, MAX_READABLE_TARGETS),
        },
      }
    },
  }

  const workspaceSummary: AgentToolDefinition = {
    name: 'editor.workspace_summary',
    description: '获取整个工作区结构概览：所有打开的编辑目标列表及摘要。',
    policy: 'read',
    inputSchema: { type: 'object', properties: {} },
    async execute() {
      if (!options.getAllSnapshots) return toolError('not_available', '当前工作区不支持多目标概览')
      const allSnapshots = options.getAllSnapshots()
      if (allSnapshots.length === 0) return toolError('no_targets', '工作区没有打开的编辑目标')
      return {
        ok: true,
        data: {
          totalTargets: allSnapshots.length,
          targets: allSnapshots.map(s => ({
            workspace: s.workspace,
            targetId: s.targetId,
            label: s.label,
            contentLength: s.content.length,
            mode: s.mode,
            hasSelection: s.selectedText.length > 0,
          })),
        },
      }
    },
  }

  const currentTarget = options.getSnapshot()
  const writeTools = options.mode === 'direct' ? [writeEdits] : []
  const readableTargets = options.getAllSnapshots
    ? [...new Set([currentTarget?.targetId, ...options.getAllSnapshots().map(item => item.targetId)].filter(Boolean))]
    : [currentTarget?.targetId].filter(Boolean)
  const declaredReadableTargets: string[] = readableTargets.filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  )
  return buildDialogueToolSet({
    workspace: options.workspace || 'main',
    tools: [
      getState,
      search,
      locate,
      ...writeTools,
      revealTargetTool,
      updatePlan,
      multiGetState,
      globalSearch,
      workspaceSummary,
    ],
    readableTargets: declaredReadableTargets,
    writableTarget: currentTarget?.targetId || '',
  })
}

export function buildDialogueToolSet(input: {
  workspace: DialogueWorkspace
  tools: AgentToolDefinition[]
  readableTargets: string[]
  writableTarget: string
}): AgentToolDefinition[] {
  const toolSet: DialogueToolSet = {
    version: 1,
    workspace: input.workspace,
    tools: input.tools,
    readableTargets: input.readableTargets,
    writableTarget: input.writableTarget,
  }
  const validation = validateDialogueToolSet(toolSet)
  if (!validation.valid) {
    throw new Error(`编辑器工具集契约校验失败：${validation.errors.join('；')}`)
  }
  return validation.tools
}

const MAX_READABLE_TARGETS = 5

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

