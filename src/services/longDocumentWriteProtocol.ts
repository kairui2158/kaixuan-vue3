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
  if (plan?.operation === 'discussion') return []
  if (!plan || plan.mode !== 'edit-task') return EDITOR_EDIT_OPERATIONS
  switch (plan.operation) {
    case 'restructure':
      return ['reorder_sections']
    case 'normalize':
      return ['replace_match', 'rewrite']
    case 'deduplicate':
      return ['delete']
    case 'deduplicate_and_normalize':
      return ['delete', 'replace_match', 'rewrite']
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
  if (plan?.operation === 'discussion') {
    return '讨论模式：停止调用工具，直接基于已读内容回答；禁止提交编辑命令或调用写入工具。'
  }
  if (!plan || plan.mode !== 'edit-task') {
    return '编辑请提交受限编辑命令；整篇替换仅在短文档 direct 模式且用户明确要求时使用。'
  }
  switch (plan.operation) {
    case 'restructure':
      return '结构重排只允许提交单条 reorder_sections 命令：order 必须包含全部结构 ID 且仅重排，保持叶子正文集合不变；禁止多条 move 拼接，禁止整篇 replace_document，禁止重写正文。'
    case 'normalize':
      return [
        '格式整理请按分段 replace_match/rewrite 提交，只改变标点、空白、编号与标题层级；禁止整篇 replace_document。',
        `执行范围必须覆盖全部计划段落（${describePlannedSegments(plan)}）。每段先读取确认需整理项，再在该段一次 editor.write 中打包提交全部整理命令，禁止把同段多条命令拆成多次调用；未覆盖全部计划段落前，禁止输出“任务完成”总结。计划批次数量是 ${plan.segments.length}；执行侧允许的物理请求轮次为 ${describePhysicalRequestBudget(plan)} 轮，尚未完成前不要把工具轮次耗尽。`,
        '中文正文语境中的半角标点（, . ; : ! ?）必须统一为对应全角（，。；：！？）；这是完成校验的强制条件，不是可选项。',
        '统一标题层级前必须先读取结构：消除层级跳变并把标题归位到文档既有层级体系，禁止无依据地把标题层级改深或改浅。',
      ].join('')
    case 'deduplicate':
      return '去重请先用只读工具确认重复项，再提交唯一目标删除命令；删除范围需通过完整性校验，未确认候选禁止顺手删除。'
    case 'deduplicate_and_normalize':
      return [
        '复合整理请分两阶段执行：先只读确认重复项并提交唯一目标删除命令，完成后再提交 replace_match/rewrite 命令，仅整理标点、空白、编号与标题层级；禁止整篇 replace_document，禁止把未确认内容当作重复项删除。',
        `整理阶段必须覆盖全部计划段落（${describePlannedSegments(plan)}）。每段先读取确认需整理项，再在该段一次 editor.write 中打包提交全部整理命令，禁止把同段多条命令拆成多次调用；未覆盖全部计划段落前，禁止输出“任务完成”总结。计划批次数量是 ${plan.segments.length}；执行侧允许的物理请求轮次为 ${describePhysicalRequestBudget(plan)} 轮，尚未完成前不要把工具轮次耗尽。`,
        '中文正文语境中的半角标点（, . ; : ! ?）必须统一为对应全角（，。；：！？）；这是完成校验的强制条件，不是可选项。删除重复项后仍需完成剩余段落的标点归一。',
        '统一标题层级前必须先读取结构：消除层级跳变并把标题归位到文档既有层级体系，禁止无依据地把标题层级改深或改浅。',
        '整理与删除阶段都禁止丢弃测试或提示类插入句；这些句子不属于重复项，必须原地保留并完成标点归一。除计划删除目标外，任何正文行不得从文档中消失。',
      ].join('')
    case 'rewrite_segments':
      return '长文重写请按分段 replace_match/rewrite 提交；禁止整篇 replace_document。'
    case 'targeted_edit':
    default:
      return '长文档局部修改请提交受限编辑命令；禁止整篇 replace_document。'
  }
}

function describePhysicalRequestBudget(plan: LongDocumentExecutionPlan): number {
  return Math.min(64, 24 + Math.max(0, plan.segments.length - 1) * 6)
}

function describePlannedSegments(plan: LongDocumentExecutionPlan): string {
  const segments = plan.segments
    .filter(segment => segment.segmentId.startsWith('normalize-'))
    .map(segment => `${segment.segmentId}[${segment.range.startLine}-${segment.range.endLine}]`)
  return segments.length ? segments.join('|') : '全文'
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
  if (plan?.operation === 'discussion') {
    return [
      '当前执行计划为讨论模式：本轮没有可用编辑命令。',
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
  if (plan?.operation === 'discussion') {
    return [
      '当前执行计划为讨论模式，编辑命令与写入工具均已关闭。',
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
