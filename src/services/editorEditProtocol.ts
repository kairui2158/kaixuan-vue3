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
  | 'selection_missing'
  | 'version_changed'
  | 'locked'
  | 'content_too_large'

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
  if (!raw || raw.length > maxBatchRawLength) return null

  let candidate = raw.trim()
  const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) candidate = fence[1].trim()

  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) return null

  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>
    if (parsed.type !== 'editor_edit' && parsed.type !== 'outline_edit') return null

    return normalizeCommand(parsed)
  } catch {
    return null
  }
}

/**
 * Parses a batch response. Any invalid item rejects the whole batch: partial
 * application is never allowed, so partial parsing must not be possible.
 */
export function parseEditorEditBatch(raw: string): EditorEditBatchCommand | null {
  if (!raw || raw.length > maxBatchRawLength) return null

  let candidate = raw.trim()
  const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) candidate = fence[1].trim()

  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) return null

  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>
    if (parsed.type !== 'editor_edit_batch') return null
    if (!Array.isArray(parsed.commands)) return null
    if (parsed.commands.length === 0 || parsed.commands.length > maxBatchCommands) return null

    const commands: EditorEditCommand[] = []
    let totalLength = 0
    for (const item of parsed.commands) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null
      const command = normalizeCommand(item as Record<string, unknown>)
      if (!command) return null
      totalLength += (command.content?.length || 0) + (command.target?.length || 0)
      commands.push(command)
    }
    if (totalLength > maxBatchContentLength) return null

    const batchTarget = parsed.target
    const target = batchTarget && typeof batchTarget === 'object' && !Array.isArray(batchTarget)
      ? {
        workspace: (batchTarget as Record<string, unknown>).workspace === 'outline' ? 'outline' as const : 'main' as const,
        targetId: String((batchTarget as Record<string, unknown>).targetId || ''),
        contentVersion: Number((batchTarget as Record<string, unknown>).contentVersion || 0),
      }
      : undefined
    if (target && (!target.targetId || !Number.isFinite(target.contentVersion))) return null

    return {
      type: 'editor_edit_batch',
      version: 1,
      target,
      commands,
      reason: typeof parsed.reason === 'string' ? parsed.reason : undefined
    }
  } catch {
    return null
  }
}

export function buildEditorEditPrompt(target: {
  workspace: string
  label: string
  content: string
  selectedText?: string
}): string {
  const selection = target.selectedText
    ? `\n当前选区（replace_selection 可直接替换）：\n${target.selectedText}`
    : '\n当前无选区：请使用 insert/replace_match/append，禁止 replace_selection。'

  return [
    '你可以通过受限编辑协议修改编辑区。协议规则：',
    '1. 仅当用户明确要求修改编辑区时返回 JSON，否则正常回答。',
    '2. 单条修改格式：{"type":"editor_edit","version":1,"operation":"insert|replace_selection|replace_match|append|delete|rewrite","content":"...","target":"原文精确片段","position":"cursor|selection_start|selection_end|end","reason":"..."}',
    '3. 多条修改格式：{"type":"editor_edit_batch","version":1,"commands":[单条修改对象数组],"reason":"整批修改说明"}，commands 为 1-10 条。',
    '4. target 必须从当前编辑内容中逐字复制，禁止行号或模糊描述。多条命令必须按执行顺序排列。',
    '5. replace_selection 仅在有当前选区时可用；delete 必须携带 target，禁止删除整章。',
    '6. content 单条不超过 20000 字符，批次总内容不超过 60000 字符。只返回 JSON，不附加解释。',
    `目标：${target.label}`,
    `当前编辑内容：\n${target.content}`
  ].join('\n') + selection
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
