import type { EditorEditFailureReason } from './editorEditProtocol'
import type { EditorEditCommand } from './editorEditProtocol'
import { EDITOR_EDIT_OPERATIONS } from './editorEditSemantics'
import { locateEditorFragment, type EditorLocateCandidate } from './editorEditLocator'

export type EditorEditResult =
  | 'parsed'
  | 'rejected'
  | 'applied'
  | 'canceled'
  | 'no_edit'

export interface EditorEditLogParams {
  requestId: string
  batchId?: string
  workspace: 'main' | 'outline'
  tabId: string
  operation?: string
  result: EditorEditResult
  targetLength?: number
  contentLength?: number
  failureReason?: EditorEditFailureReason | 'target_not_found'
  durationMs: number
  detail?: string
}

export type EditorEditDiagnosticSuggestion =
  | 'extend_fragment'
  | 'use_structure_anchor'
  | 're_read_target'
  | 'check_selection'
  | 'check_operation'
  | 'check_version'

export interface EditorEditCommandDiagnostic {
  index: number
  operation: EditorEditCommand['operation']
  target?: string
  reason: EditorEditFailureReason
  message: string
  suggestion: EditorEditDiagnosticSuggestion
  candidates?: EditorLocateCandidate[]
  matches?: Array<{ start: number; end: number }>
}

export interface EditorEditBatchDiagnostics {
  version: 1
  ok: boolean
  commandCount: number
  succeededIndexes: number[]
  failedItems: EditorEditCommandDiagnostic[]
  retryCommand?: EditorEditCommand
  invalidValue?: string
  validValues?: string[]
  summary: string
}

export interface EditorWriteFailedDiagnostics extends EditorEditBatchDiagnostics {
  errorCatalog: Record<string, string>
  repairPolicy: string
}

export interface EditorEditDiagnosticsLogPayload {
  requestId: string
  batchId?: string
  workspace: 'main' | 'outline'
  tabId: string
  diagnostics: EditorEditBatchDiagnostics
}

const diagnosticMessages: Record<EditorEditFailureReason, string> = {
  invalid_command: '命令不合法：请检查 operation、content、target 是否符合协议。',
  target_not_found: '目标片段不存在：请重新读取原文，并逐字复制目标片段。',
  ambiguous_target: '目标片段出现多次：请扩展片段或使用结构锚点使其唯一。',
  selection_missing: '当前没有可用选区：请改用 insert/replace_match/append。',
  version_changed: '编辑器内容版本已变化：请重新读取目标后再次提案。',
  locked: '编辑器已锁定：请提示用户解锁后再发起修改。',
  content_too_large: '命令内容超过大小限制：请拆分修改内容。'
}

const diagnosticSuggestions: Record<EditorEditFailureReason, EditorEditDiagnosticSuggestion> = {
  invalid_command: 'check_operation',
  target_not_found: 're_read_target',
  ambiguous_target: 'extend_fragment',
  selection_missing: 'check_selection',
  version_changed: 'check_version',
  locked: 'check_operation',
  content_too_large: 'check_operation'
}

function suggestionText(suggestion: EditorEditDiagnosticSuggestion): string {
  switch (suggestion) {
    case 'extend_fragment': return '扩大上下文：复制更长的原文片段，直到目标唯一。'
    case 'use_structure_anchor': return '使用结构锚点：例如卷标题、章节标题、章节小节标题。'
    case 're_read_target': return '重新读取范围：先用结构地图定位，再读取目标节点局部全文。'
    case 'check_selection': return '检查选区：replace_selection 只有在用户当前有选区时可用。'
    case 'check_operation': return '检查命令：确认操作类型、必填字段与大小限制。'
    case 'check_version': return '检查版本：内容已变化，先重新读取最新编辑器状态。'
    default: return '检查命令：确认操作类型、必填字段与大小限制。'
  }
}

function invalidOperationDiagnostics(
  input: {
    commands: EditorEditCommand[]
    content: string
    selectedText?: string
    failureReason?: EditorEditFailureReason
  },
  invalidOperation: unknown,
): EditorEditBatchDiagnostics {
  const invalidValue = invalidOperation === undefined || invalidOperation === null
    ? '（缺失）'
    : String(invalidOperation)
  return {
    version: 1,
    ok: false,
    commandCount: input.commands.length,
    succeededIndexes: [],
    failedItems: input.commands.map((command, index) => ({
      index,
      operation: command.operation,
      target: command.target,
      reason: 'invalid_command',
      message: `operation 非法：${invalidValue}。请改用合法枚举后整批重新提交。`,
      suggestion: 'check_operation'
    })),
    invalidValue,
    validValues: [...EDITOR_EDIT_OPERATIONS],
    summary: `operation 非法：${invalidValue}；合法值为 ${EDITOR_EDIT_OPERATIONS.join(' | ')}。旧别名 replace_section/rewrite_section 会被迁移，insert_after 不受支持。`
  }
}

/**
 * Diagnoses every command in a write proposal against the current snapshot.
 * Success diagnostics are advisory only: the batch remains all-or-nothing and
 * is never partially applied. A retry command lets the model repair failed
 * entries while keeping valid commands from the original proposal.
 */
export function diagnoseEditorEditBatch(input: {
  commands: EditorEditCommand[]
  content: string
  selectedText?: string
  failureReason?: EditorEditFailureReason
  invalidOperation?: unknown
}): EditorEditBatchDiagnostics {
  const commands = input.commands || []
  const succeededIndexes: number[] = []
  const failedItems: EditorEditCommandDiagnostic[] = []

  if (input.invalidOperation !== undefined) {
    return invalidOperationDiagnostics(input, input.invalidOperation)
  }

  if (input.failureReason === 'version_changed' || input.failureReason === 'locked') {
    const reason = input.failureReason
    return {
      version: 1,
      ok: false,
      commandCount: commands.length,
      succeededIndexes: [],
      failedItems: commands.map((command, index) => ({
        index,
        operation: command.operation,
        target: command.target,
        reason,
        message: diagnosticMessages[reason],
        suggestion: diagnosticSuggestions[reason]
      })),
      retryCommand: commands.length
        ? {
          type: 'editor_edit',
          version: 1,
          operation: 'rewrite',
          content: JSON.stringify({
            repair: '重新读取当前编辑器内容后，整批重提修正后的完整批次',
            failedIndexes: commands.map((_, index) => index)
          }, null, 2),
          target: 'RETRY_WHOLE_BATCH',
          reason: '版本或锁定状态变化导致批次未写入；必须整批重提'
        }
        : undefined,
      summary: diagnosticMessages[reason]
    }
  }

  commands.forEach((command, index) => {
    if (input.failureReason) {
      const reason = input.failureReason
      failedItems.push({
        index,
        operation: command.operation,
        target: command.target,
        reason,
        message: diagnosticMessages[reason],
        suggestion: diagnosticSuggestions[reason]
      })
      return
    }

    if (command.operation === 'replace_selection' && !input.selectedText) {
      failedItems.push({
        index,
        operation: command.operation,
        reason: 'selection_missing',
        message: diagnosticMessages.selection_missing,
        suggestion: diagnosticSuggestions.selection_missing
      })
      return
    }

    if (['replace_match', 'delete', 'move', 'rewrite'].includes(command.operation)) {
      const located = locateEditorFragment({
        content: input.content,
        fragment: command.target || '',
        anchor: {
          ...(command.volumeTitle ? { volumeTitle: command.volumeTitle } : {}),
          ...(command.chapterTitle ? { chapterTitle: command.chapterTitle } : {}),
          ...(command.sectionTitle ? { sectionTitle: command.sectionTitle } : {})
        }
      })
      if (!located.ok) {
        const reason = located.reason === 'ambiguous_target' ? 'ambiguous_target' : 'target_not_found'
        failedItems.push({
          index,
          operation: command.operation,
          target: command.target,
          reason,
          message: diagnosticMessages[reason],
          suggestion: reason === 'ambiguous_target' ? 'extend_fragment' : 're_read_target',
          candidates: located.reason === 'target_not_found' ? located.candidates : undefined,
          matches: located.reason === 'ambiguous_target' ? located.matches : undefined
        })
        return
      }
    }

    succeededIndexes.push(index)
  })

  const retryCommand: EditorEditCommand | undefined = failedItems.length && commands.length
    ? {
      type: 'editor_edit',
      version: 1,
      operation: 'rewrite',
      content: JSON.stringify({
        repair: '请整批重新提交修正后的命令',
        failedIndexes: failedItems.map(item => item.index),
        diagnostics: failedItems.map(item => ({
          index: item.index,
          reason: item.reason,
          suggestion: item.suggestion
        })),
        keepIndexes: succeededIndexes
      }, null, 2),
      target: 'RETRY_FAILED_ITEMS_ONLY',
      reason: '批次原子执行：预演通过条目未写入；必须整批重提'
    }
    : undefined

  const summary = failedItems.length
    ? `批次 ${commands.length} 条命令中 ${failedItems.length} 条在预演中失败；原文未修改，预演通过条目也未写入，必须整批重提；${failedItems
      .map(item => `第 ${item.index + 1} 条：${item.message} ${suggestionText(item.suggestion)}`)
      .join(' ')}`
    : `批次 ${commands.length} 条命令全部通过定位校验`

  return {
    version: 1,
    ok: failedItems.length === 0,
    commandCount: commands.length,
    succeededIndexes,
    failedItems,
    retryCommand,
    summary
  }
}

export function buildEditorWriteFailedDiagnostics(
  diagnostics: EditorEditBatchDiagnostics,
): EditorWriteFailedDiagnostics {
  return {
    ...diagnostics,
    errorCatalog: {
      invalid_input: '输入结构非法；按错误信息修正后整批重试',
      missing_field: '必填字段缺失；补齐 operation/content/target 后整批重试',
      ambiguous_target: '目标片段多命中；扩展片段或改用结构锚点后重试',
      target_not_found: '目标片段不存在；按候选重新复制原文后重试',
      version_changed: '编辑器版本已变化；重新读取目标后重试',
      locked: '目标已锁定；请改为定位讨论或请求用户解锁',
      permission_denied: '当前意图无写入权限；等待用户明确写入请求',
      duplicate_write_blocked: '连续重复写入被拦截；不要重发相同参数',
      integrity_failed: '结构完整性校验失败；按诊断调整命令，禁止删除关键结构后重试'
    },
    repairPolicy: '批次是原子执行：任何条目失败时原文未修改，预演通过条目也没有写入。重试必须提交修正后的完整批次，禁止只重提失败条目或拼接旧批次。移动整节必须使用 move 操作，禁止用删除+插入两条命令拼接移动。'
  }
}

/**
 * A failed batch is diagnosed one command at a time against the working text.
 * This maps that local diagnosis back to the original batch coordinates so
 * retry protocol indexes match what the model actually submitted.
 */
export function remapEditorEditDiagnostics(input: {
  diagnostics: EditorEditBatchDiagnostics
  commandIndex: number
  succeededIndexes: number[]
  commandCount: number
}): EditorEditBatchDiagnostics {
  const failedItems = input.diagnostics.failedItems.map(item => ({
    ...item,
    index: input.commandIndex
  }))
  if (!failedItems.length) {
    return {
      ...input.diagnostics,
      commandCount: input.commandCount,
      succeededIndexes: input.succeededIndexes
    }
  }

  let retryPayload: Record<string, unknown> = {}
  if (input.diagnostics.retryCommand) {
    try {
      retryPayload = JSON.parse(input.diagnostics.retryCommand.content || '{}') as Record<string, unknown>
    } catch {
      retryPayload = {}
    }
  }
  const retryCommand: EditorEditCommand | undefined = input.diagnostics.retryCommand
    ? {
      ...input.diagnostics.retryCommand,
      content: JSON.stringify({
        ...retryPayload,
        failedIndexes: [input.commandIndex],
        keepIndexes: input.succeededIndexes
      }, null, 2)
    }
    : undefined

  const summary = [
    `批次 ${input.commandCount} 条命令中 ${failedItems.length} 条失败；`,
    ...failedItems.map(item => `第 ${item.index + 1} 条：${item.message} ${suggestionText(item.suggestion)}`),
    '批次原子执行：预演通过条目未写入，原文保持不变，必须整批重提修正后的批次。'
  ].join(' ')

  return {
    ...input.diagnostics,
    commandCount: input.commandCount,
    succeededIndexes: input.succeededIndexes,
    failedItems,
    retryCommand,
    summary
  }
}

export function logEditorEdit(params: EditorEditLogParams): void {
  const diag = typeof window !== 'undefined' ? (window as any).DiagLogger : null
  if (!diag || typeof diag.log !== 'function') return

  const level = params.result === 'applied' ? 'info' : params.result === 'rejected' ? 'error' : params.result === 'no_edit' ? 'info' : 'warn'
  const purpose = params.workspace === 'outline' ? 'outline-edit' : 'main-edit'
  const summary = [
    'Editor edit:',
    'request=' + params.requestId,
    params.batchId ? 'batch=' + params.batchId : '',
    'workspace=' + params.workspace,
    'tab=' + params.tabId,
    'operation=' + (params.operation || '-'),
    'result=' + params.result,
    params.failureReason ? 'failure=' + params.failureReason : '',
    params.durationMs + 'ms'
  ].filter(Boolean).join(' ')

  diag.log(level, 'ai-service/editor-batch', summary, {
    purpose,
    editorEdit: true,
    requestId: params.requestId,
    batchId: params.batchId,
    workspace: params.workspace,
    tabId: params.tabId,
    operation: params.operation,
    result: params.result,
    targetLength: params.targetLength,
    contentLength: params.contentLength,
    failureReason: params.failureReason,
    durationMs: params.durationMs,
    detail: params.detail || ''
  })
}

export function logEditorEditDiagnostics(payload: EditorEditDiagnosticsLogPayload): void {
  const diag = typeof window !== 'undefined' ? (window as any).DiagLogger : null
  if (!diag || typeof diag.log !== 'function') return
  const { diagnostics } = payload
  diag.log(
    diagnostics.ok ? 'info' : 'warn',
    'ai-service/editor-batch',
    'Editor batch diagnostics: ' + diagnostics.summary,
    {
      purpose: payload.workspace === 'outline' ? 'outline-edit' : 'main-edit',
      requestId: payload.requestId,
      batchId: payload.batchId,
      workspace: payload.workspace,
      tabId: payload.tabId,
      editorEdit: true,
      diagnostics
    }
  )
}

export interface EditorPresentationLogParams {
  phase: 'start' | 'finished' | 'failed'
  workspace: 'main' | 'outline'
  targetId: string
  mode: string
  commands?: number
  reason?: string
}

export function logEditorPresentation(params: EditorPresentationLogParams): void {
  const diag = typeof window !== 'undefined' ? (window as any).DiagLogger : null
  if (!diag || typeof diag.log !== 'function') return

  const level = params.phase === 'failed' ? 'error' : 'info'
  const purpose = params.workspace === 'outline' ? 'outline-edit' : 'main-edit'
  const summary = [
    'Editor presentation:',
    'workspace=' + params.workspace,
    'phase=' + params.phase,
    'target=' + params.targetId,
    'mode=' + params.mode,
    params.commands !== undefined ? 'commands=' + params.commands : '',
    params.reason ? 'reason=' + params.reason : '',
  ].filter(Boolean).join(' ')

  diag.log(level, 'ai-service/editor-presentation', summary, {
    purpose,
    workspace: params.workspace,
    phase: params.phase,
    targetId: params.targetId,
    mode: params.mode,
    commands: params.commands,
    reason: params.reason,
  })
}
