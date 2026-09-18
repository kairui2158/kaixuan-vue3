import { extractJsonCandidates } from './jsonExtraction'

export type EditorEditOperation =
  | 'insert'
  | 'replace_selection'
  | 'replace_match'
  | 'append'
  | 'delete'
  | 'rewrite'

export interface EditorEditCommand {
  type: 'editor_edit'
  version: 1
  operation: EditorEditOperation
  content?: string
  target?: string
  volumeTitle?: string
  chapterTitle?: string
  sectionTitle?: string
  position?: 'cursor' | 'selection_start' | 'selection_end' | 'end'
  reason?: string
}

export interface EditorEditBatchCommand {
  type: 'editor_edit_batch'
  version: 1
  target?: {
    workspace: 'main' | 'outline'
    targetId: string
    contentVersion: number
  }
  commands: EditorEditCommand[]
  reason?: string
}

export type EditorEditFailureReason =
  | 'invalid_command'
  | 'target_not_found'
  | 'ambiguous_target'
  | 'selection_missing'
  | 'version_changed'
  | 'locked'
  | 'content_too_large'

export type EditorParseFailureReason =
  | 'raw-empty'
  | 'raw-too-long'
  | 'json-invalid'
  | 'protocol-invalid'
  | 'command-limit'
  | 'content-too-large'

export interface EditorParseFailure {
  reason: EditorParseFailureReason
  message: string
}

export interface EditorParseResult<T> {
  value: T | null
  failure: EditorParseFailure | null
}

const operations = new Set<EditorEditOperation>([
  'insert',
  'replace_selection',
  'replace_match',
  'append',
  'delete',
  'rewrite'
])

const maxCommandLength = 20000
const maxBatchCommands = 10
const maxBatchContentLength = 60000
const maxBatchRawLength = 80000

function normalizeOperation(value: unknown): EditorEditOperation | null {
  if (value === 'replace_section') return 'replace_match'
  if (value === 'rewrite_section') return 'rewrite'
  return typeof value === 'string' && operations.has(value as EditorEditOperation)
    ? value as EditorEditOperation
    : null
}

function normalizeCommand(parsed: Record<string, unknown>): EditorEditCommand | null {
  const operation = normalizeOperation(parsed.operation)
  if (!operation) return null

  const content = typeof parsed.content === 'string' ? parsed.content : undefined
  const target = typeof parsed.target === 'string' ? parsed.target.trim() : undefined
  const volumeTitle = typeof parsed.volumeTitle === 'string' ? parsed.volumeTitle.trim() : undefined
  const chapterTitle = typeof parsed.chapterTitle === 'string' ? parsed.chapterTitle.trim() : undefined
  const sectionTitle = typeof parsed.sectionTitle === 'string' ? parsed.sectionTitle.trim() : undefined
  if (content !== undefined && content.length > maxCommandLength) return null
  if (operation !== 'delete' && typeof content !== 'string') return null
  if (['replace_match', 'delete', 'rewrite'].includes(operation) && !target) return null

  const position = parsed.position
  const normalizedPosition = position === 'cursor' || position === 'selection_start' || position === 'selection_end' || position === 'end'
    ? position
    : 'cursor'

  return {
    type: 'editor_edit',
    version: 1,
    operation,
    content,
    target,
    ...(volumeTitle ? { volumeTitle } : {}),
    ...(chapterTitle ? { chapterTitle } : {}),
    ...(sectionTitle ? { sectionTitle } : {}),
    position: normalizedPosition,
    reason: typeof parsed.reason === 'string' ? parsed.reason : undefined
  }
}

/**
 * Parses a model response into a constrained editor command.
 * Returns null instead of throwing: invalid model output must degrade to a
 * normal chat message, never become a partial editor write.
 */
export function parseEditorEditCommand(raw: string): EditorEditCommand | null {
  return parseEditorEditCommandWithReason(raw).value
}

export function parseEditorEditCommandWithReason(
  raw: string,
): EditorParseResult<EditorEditCommand> {
  if (!raw || !raw.trim()) {
    return { value: null, failure: { reason: 'raw-empty', message: '响应为空' } }
  }
  if (raw.length > maxBatchRawLength) {
    return { value: null, failure: { reason: 'raw-too-long', message: `响应超过 ${maxBatchRawLength} 字符上限` } }
  }

  for (const candidate of extractJsonCandidates(raw)) {
    if (!candidate.value || typeof candidate.value !== 'object' || Array.isArray(candidate.value)) continue
    const parsed = candidate.value as Record<string, unknown>
    if (parsed.type !== 'editor_edit' && parsed.type !== 'outline_edit') continue
    const command = normalizeCommand(parsed)
    if (command) return { value: command, failure: null }
    return { value: null, failure: { reason: 'protocol-invalid', message: '编辑命令字段非法' } }
  }
  return { value: null, failure: { reason: 'json-invalid', message: '未找到合法 JSON 编辑命令' } }
}

/**
 * Parses a batch response. Any invalid item rejects the whole batch: partial
 * application is never allowed, so partial parsing must not be possible.
 */
export function parseEditorEditBatch(raw: string): EditorEditBatchCommand | null {
  return parseEditorEditBatchWithReason(raw).value
}

export function parseEditorEditBatchWithReason(
  raw: string,
): EditorParseResult<EditorEditBatchCommand> {
  if (!raw || !raw.trim()) {
    return { value: null, failure: { reason: 'raw-empty', message: '响应为空' } }
  }
  if (raw.length > maxBatchRawLength) {
    return { value: null, failure: { reason: 'raw-too-long', message: `响应超过 ${maxBatchRawLength} 字符上限` } }
  }

  for (const candidate of extractJsonCandidates(raw)) {
    if (!candidate.value || typeof candidate.value !== 'object' || Array.isArray(candidate.value)) continue
    const parsed = candidate.value as Record<string, unknown>
    if (parsed.type !== 'editor_edit_batch') continue
    if (!Array.isArray(parsed.commands)) {
      return { value: null, failure: { reason: 'protocol-invalid', message: 'commands 必须是数组' } }
    }
    if (parsed.commands.length === 0) {
      return { value: null, failure: { reason: 'command-limit', message: 'commands 不能为空' } }
    }
    if (parsed.commands.length > maxBatchCommands) {
      return { value: null, failure: { reason: 'command-limit', message: `commands 超过 ${maxBatchCommands} 条上限` } }
    }

    const commands: EditorEditCommand[] = []
    let totalLength = 0
    for (const item of parsed.commands) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return { value: null, failure: { reason: 'protocol-invalid', message: 'commands 中存在非法对象' } }
      }
      const command = normalizeCommand(item as Record<string, unknown>)
      if (!command) {
        return { value: null, failure: { reason: 'protocol-invalid', message: '编辑命令字段非法' } }
      }
      totalLength += (command.content?.length || 0) + (command.target?.length || 0)
      commands.push(command)
    }
    if (totalLength > maxBatchContentLength) {
      return { value: null, failure: { reason: 'content-too-large', message: `批次内容超过 ${maxBatchContentLength} 字符上限` } }
    }

    const batchTarget = parsed.target
    const target = batchTarget && typeof batchTarget === 'object' && !Array.isArray(batchTarget)
      ? {
        workspace: (batchTarget as Record<string, unknown>).workspace === 'outline' ? 'outline' as const : 'main' as const,
        targetId: String((batchTarget as Record<string, unknown>).targetId || ''),
        contentVersion: Number((batchTarget as Record<string, unknown>).contentVersion || 0),
      }
      : undefined
    if (target && (!target.targetId || !Number.isFinite(target.contentVersion))) {
      return { value: null, failure: { reason: 'protocol-invalid', message: 'target 字段非法' } }
    }

    return {
      value: {
        type: 'editor_edit_batch',
        version: 1,
        target,
        commands,
        reason: typeof parsed.reason === 'string' ? parsed.reason : undefined
      },
      failure: null
    }
  }
  return { value: null, failure: { reason: 'json-invalid', message: '未找到合法 JSON 编辑批次' } }
}

export function buildEditorEditPrompt(target: {
  workspace: string
  label: string
  content: string
  selectedText?: string
  structureMap?: string
  focusContent?: string
  focusLabel?: string
}): string {
  const selection = target.selectedText
    ? `\n当前选区（replace_selection 可直接替换）：\n${target.selectedText}`
    : '\n当前无选区：请使用 insert/replace_match/append，禁止 replace_selection。'

  const contentBlock = target.structureMap !== undefined || target.focusContent !== undefined
    ? [
      '当前编辑内容为长文档，已注入结构地图与当前焦点局部全文：',
      `目标：${target.label}`,
      `[结构地图]\n${target.structureMap || '（结构解析为空，请先用只读工具读取目标范围）'}`,
      `[当前焦点局部全文]${target.focusLabel ? `${target.focusLabel}` : ''}\n${target.focusContent || '（无焦点内容，请先用只读工具读取目标范围）'}`,
      '如需修改焦点外的内容，必须先用只读工具读取对应节点；禁止凭结构地图猜测原文。'
    ]
    : [
      `目标：${target.label}`,
      `当前编辑内容：\n${target.content}`
    ]

  return [
    '你可以通过受限编辑协议修改编辑区。协议规则：',
    '1. 仅当用户明确要求修改编辑区时返回 JSON，否则正常回答。',
    '2. 单条修改格式：{"type":"editor_edit","version":1,"operation":"insert|replace_selection|replace_match|append|delete|rewrite","content":"...","target":"原文精确片段","position":"cursor|selection_start|selection_end|end","reason":"..."}',
    '3. 多条修改格式：{"type":"editor_edit_batch","version":1,"commands":[单条修改对象数组],"reason":"整批修改说明"}，commands 为 1-10 条。',
    '4. target 必须从当前编辑内容中逐字复制，禁止行号或模糊描述。多条命令必须按执行顺序排列。',
    '5. replace_selection 仅在有当前选区时可用；delete 必须携带 target，禁止删除整章。',
    '6. content 单条不超过 20000 字符，批次总内容不超过 60000 字符。只返回 JSON，不附加解释。',
    ...contentBlock
  ].join('\n') + selection
}

export interface EditorWriteProtocolRequest {
  tool: 'editor.write'
  commands: EditorEditCommand[]
  reveal?: {
    mode?: 'stream' | 'instant'
    firstChange?: boolean
  }
  reason?: string
}

export function buildEditorWriteProtocolPrompt(): string {
  return [
    '当前供应商不支持原生工具调用，本轮启用 JSON 直写协议。',
    '仅当用户明确要求写入编辑器时输出 JSON，否则正常回答。',
    '直写格式：{"tool":"editor.write","commands":[{"operation":"insert|replace_selection|replace_match|append|delete|rewrite","content":"...","target":"replace_match/delete/rewrite 必填且必须唯一","position":"cursor|selection_start|selection_end|end","reason":"..."}],"reveal":{"mode":"stream|instant","firstChange":true},"reason":"整批写入说明"}',
    'commands 为 1-10 条；单条 content 不超过 20000 字符，批次总内容不超过 60000 字符。',
    'target 必须逐字复制当前编辑内容；多命中或未命中会拒绝写入，原文保持不变。',
    'JSON 之外禁止附加说明文字；写入失败时会返回结构化错误，请根据错误修正后再次输出 JSON。',
    '兼容模式下定位可靠性较低；如需说明位置，请在 reason 中写明段落或标题位置。'
  ].join('\n')
}

export function parseEditorWriteProtocol(raw: string): EditorWriteProtocolRequest | null {
  if (!raw || raw.length > maxBatchRawLength) return null

  for (const candidate of extractJsonCandidates(raw)) {
    const value = candidate.value
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const parsed = value as Record<string, unknown>
    if (parsed.tool !== 'editor.write' || !Array.isArray(parsed.commands)) continue
    if (parsed.commands.length === 0 || parsed.commands.length > maxBatchCommands) continue

    const commands: EditorEditCommand[] = []
    let totalLength = 0
    let valid = true
    for (const item of parsed.commands) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        valid = false
        break
      }
      const command = normalizeCommand(item as Record<string, unknown>)
      if (!command) {
        valid = false
        break
      }
      totalLength += (command.content?.length || 0) + (command.target?.length || 0)
      commands.push(command)
    }
    if (!valid || totalLength > maxBatchContentLength) continue

    const revealSource = parsed.reveal && typeof parsed.reveal === 'object' && !Array.isArray(parsed.reveal)
      ? parsed.reveal as Record<string, unknown>
      : {}
    const revealMode = revealSource.mode === 'instant' ? 'instant' : 'stream'
    const firstChange = revealSource.firstChange !== false

    return {
      tool: 'editor.write',
      commands,
      reveal: { mode: revealMode, firstChange },
      reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
    }
  }
  return null
}

export function buildEditorReadonlyPrompt(target: {
  workspace: string
  label: string
  content: string
}): string {
  if (!target.content) return '当前编辑器页签为空，请直接回答用户问题；如需写入编辑器，请让用户先输入正文内容。'
  return [
    '当前编辑器页签没有可写目标快照，本轮禁止使用编辑协议或编辑工具。',
    '你可以把当前内容作为讨论参考，但如需修改编辑器，请先说明建议，等待应用生成可用目标后再执行。',
    `目标：${target.label}`,
    `当前编辑内容：\n${target.content}`
  ].join('\n')
}
