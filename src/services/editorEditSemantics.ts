export type EditorEditOperation =
  | 'insert'
  | 'replace_selection'
  | 'replace_match'
  | 'append'
  | 'delete'
  | 'move'
  | 'reorder_sections'
  | 'rewrite'
  | 'replace_document'

export type EditorEditPosition = 'cursor' | 'selection_start' | 'selection_end' | 'end'

export const EDITOR_EDIT_PROTOCOL_VERSION = 1

export const SUPPORTED_EDITOR_EDIT_PROTOCOL_VERSIONS: readonly number[] = [EDITOR_EDIT_PROTOCOL_VERSION]

export const EDITOR_EDIT_OPERATIONS: readonly EditorEditOperation[] = [
  'insert',
  'replace_selection',
  'replace_match',
  'append',
  'delete',
  'move',
  'reorder_sections',
  'rewrite',
  'replace_document',
]

export type EditorEditDestinationPosition = 'before' | 'after'

export const EDITOR_EDIT_POSITIONS: readonly EditorEditPosition[] = [
  'cursor',
  'selection_start',
  'selection_end',
  'end',
]

const LEGACY_OPERATION_ALIASES: Record<string, EditorEditOperation> = {
  replace_section: 'replace_match',
  rewrite_section: 'rewrite',
}

// Target-based operations ignore position rather than rejecting it: old
// providers and stored traces commonly send position:"cursor" alongside them.
const ignoredPositions: Partial<Record<EditorEditOperation, readonly EditorEditPosition[]>> = {
  append: [],
  replace_document: [],
  move: ['cursor', 'selection_start', 'selection_end', 'end'],
  replace_match: ['cursor', 'selection_start', 'selection_end', 'end'],
  delete: ['cursor', 'selection_start', 'selection_end', 'end'],
  rewrite: ['cursor', 'selection_start', 'selection_end', 'end'],
  reorder_sections: ['cursor', 'selection_start', 'selection_end', 'end'],
}

const requiresTarget: Record<EditorEditOperation, boolean> = {
  insert: false,
  replace_selection: false,
  replace_match: true,
  append: false,
  delete: true,
  move: true,
  reorder_sections: false,
  rewrite: true,
  replace_document: false,
}

// Every non-delete operation except move treats content as the replacement
// text. move uses content only as optional text appended after the moved
// fragment, so an empty value is valid there.
const requiresNonEmptyContent = new Set<EditorEditOperation>([
  'insert',
  'replace_selection',
  'replace_match',
  'append',
  'rewrite',
  'replace_document',
])

export function normalizeEditorEditOperation(value: unknown): EditorEditOperation | null {
  const alias = LEGACY_OPERATION_ALIASES[String(value)]
  if (alias) return alias
  return typeof value === 'string' && EDITOR_EDIT_OPERATIONS.includes(value as EditorEditOperation)
    ? value as EditorEditOperation
    : null
}

export function normalizeEditorEditPosition(value: unknown): EditorEditPosition | null {
  return typeof value === 'string' && EDITOR_EDIT_POSITIONS.includes(value as EditorEditPosition)
    ? value as EditorEditPosition
    : null
}

export function isEditorEditPositionAllowed(
  operation: EditorEditOperation,
  position: EditorEditPosition,
): boolean {
  if (operation === 'insert') return true
  if (operation === 'replace_selection') return position === 'selection_start' || position === 'selection_end'
  return true
}

export function shouldIgnoreEditorEditPosition(
  operation: EditorEditOperation,
): boolean {
  return Boolean(ignoredPositions[operation])
}

export function doesEditorEditOperationRequireTarget(operation: EditorEditOperation): boolean {
  return requiresTarget[operation]
}

export function doesEditorEditOperationRequireNonEmptyContent(operation: EditorEditOperation): boolean {
  return requiresNonEmptyContent.has(operation)
}

export function describeEditorEditSemantics(): string {
  return [
    `operation 枚举：${EDITOR_EDIT_OPERATIONS.join('|')}（旧别名 replace_section/rewrite_section 仅在协议入口迁移）`,
    `position 枚举：${EDITOR_EDIT_POSITIONS.join('|')}`,
    'insert 允许四种 position，禁止 target；replace_selection 仅允许 selection_start/selection_end，禁止 target；append 禁止 position 与 target；replace_match/delete/rewrite 必须携带唯一 target，定位完全由 target 决定；replace_match/rewrite 必须同时携带 target（原文）和 content（新文），缺失 content 等于要求替换为空，会被拒绝；move 必须携带唯一 target 与唯一 destination，destinationPosition 为 before|after，整段一次性剪切并插入，content 可选且仅作为移动后追加文本，禁止用删除+插入两条命令拼接移动。',
    'reorder_sections 是结构级原子重排命令：单批只能包含这一条命令，必须携带完整有序结构 ID 列表 order，禁止携带 content/target/destination/position。是否允许由当前执行计划决定；长文档结构重排必须使用该命令，禁止用多条 move 拼接。',
    'replace_document 是整篇原子替换命令：单批只能包含这一条命令，必须携带完整整理后的全文 content，禁止携带 target/destination/position。是否允许由当前执行计划决定；长文档/EditTask 模式默认禁止，请改用受限命令分批写入。',
  ].join('\n')
}
