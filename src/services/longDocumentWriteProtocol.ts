import type { EditorEditOperation } from './editorEditSemantics'
import { EDITOR_EDIT_OPERATIONS } from './editorEditSemantics'
import type { LongDocumentExecutionPlan } from './longDocumentExecutionPlanner'

const DIRECT_TARGETED_OPERATIONS: readonly EditorEditOperation[] = [
  'insert',
  'replace_selection',
  'replace_match',
  'append',
  'delete',
  'move',
  'rewrite',
]

/**
 * Single source for operation-specific write rules. Prompts, steering text,
 * and tool rejections all consume this module so an execution plan can never
 * forbid an operation in one place while encouraging it in another.
 */
export function resolveLongDocumentWriteOperations(
  plan?: LongDocumentExecutionPlan | null,
): readonly EditorEditOperation[] {
  if (plan?.mode === 'final-draft') return []
  if (!plan || plan.mode !== 'edit-task') return EDITOR_EDIT_OPERATIONS
  switch (plan.operation) {
    case 'restructure':
      return ['reorder_sections']
    case 'normalize':
      return ['replace_match', 'rewrite']
    case 'deduplicate':
      return ['delete']
    case 'rewrite_segments':
      return ['replace_match', 'rewrite']
    case 'targeted_edit':
    default:
      return DIRECT_TARGETED_OPERATIONS
  }
}

export function buildLongDocumentWriteDirective(
  plan?: LongDocumentExecutionPlan | null,
): string {
  if (plan?.mode === 'final-draft') {
    return '终稿生成模式：直接输出完整终稿正文，禁止提交编辑命令或调用写入工具；应用会在终稿完成后写入编辑器。'
  }
  if (!plan || plan.mode !== 'edit-task') {
    return '编辑请提交受限编辑命令；整篇替换仅在短文档 direct 模式且用户明确要求时使用。'
  }
  switch (plan.operation) {
    case 'restructure':
      return '结构重排只允许提交单条 reorder_sections 命令：order 必须包含全部结构 ID 且仅重排，保持叶子正文集合不变；禁止多条 move 拼接，禁止整篇 replace_document，禁止重写正文。'
    case 'normalize':
      return '格式整理请按分段 replace_match/rewrite 提交，只改变标点、空白与格式；禁止整篇 replace_document。'
    case 'deduplicate':
      return '去重请先用只读工具确认重复项，再提交唯一目标删除命令；删除范围需通过完整性校验，未确认候选禁止顺手删除。'
    case 'rewrite_segments':
      return '长文重写请按分段 replace_match/rewrite 提交；禁止整篇 replace_document。'
    case 'targeted_edit':
    default:
      return '长文档局部修改请提交受限编辑命令；禁止整篇 replace_document。'
  }
}

export function describeLongDocumentWriteProtocol(
  plan?: LongDocumentExecutionPlan | null,
): string {
  if (plan?.mode === 'final-draft') {
    return [
      '当前执行计划为终稿生成模式：本轮没有可用编辑命令。',
      buildLongDocumentWriteDirective(plan),
    ].join('\n')
  }
  const allowed = resolveLongDocumentWriteOperations(plan)
  return [
    `当前允许的写入操作：${allowed.join('|')}。`,
    buildLongDocumentWriteDirective(plan),
  ].join('\n')
}

export function buildLongDocumentWriteRejectionMessage(
  plan?: LongDocumentExecutionPlan | null,
): string {
  if (plan?.mode === 'final-draft') {
    return [
      '当前执行计划为终稿生成模式，编辑命令与写入工具均已关闭。',
      buildLongDocumentWriteDirective(plan),
    ].join('\n')
  }
  const allowed = resolveLongDocumentWriteOperations(plan)
  return [
    '当前执行计划不允许该写入操作。',
    buildLongDocumentWriteDirective(plan),
    `可用操作：${allowed.join('|')}。`,
  ].join('\n')
}
