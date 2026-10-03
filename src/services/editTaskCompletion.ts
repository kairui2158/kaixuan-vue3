import type { EditTask, EditTaskBatchDetail } from './editTaskService'

const PLANNED_DELETION_ONLY = 'planned-deletion-only'
const NORMALIZE_PUNCTUATION_WHITESPACE_FORMAT_ONLY =
  'normalize-changes-punctuation-whitespace-format-only'

export interface EditTaskCompletionViolation {
  code:
    | 'planned_deletion_not_removed'
    | 'planned_deletion_count_not_reduced'
    | 'normalize_semantic_text_changed'
    | 'normalize_punctuation_not_normalized'
    | 'delete_target_missing_before_execution'
    | 'unplanned_content_removed'
  message: string
  batchId?: string
  target?: string
  beforeCount?: number
  afterCount?: number
}

export interface EditTaskCompletionReport {
  verified: boolean
  invariant?: string
  violations: EditTaskCompletionViolation[]
}

function countOccurrences(content: string, target: string): number {
  if (!target) return 0
  let count = 0
  let index = content.indexOf(target)
  while (index !== -1) {
    count += 1
    index = content.indexOf(target, index + target.length)
  }
  return count
}

/** Punctuation/whitespace/format-only normalize check, token and order independent. */
function normalizeForSemanticComparison(text: string): string[] {
  return text
    .replace(/[\s\p{P}\p{S}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
}

function semanticTokensEqual(before: string, after: string): boolean {
  const left = normalizeForSemanticComparison(before)
  const right = normalizeForSemanticComparison(after)
  if (left.length !== right.length) return false
  return left.every((token, index) => token === right[index])
}

function countHalfWidthPunctuation(text: string): number {
  // Section identifiers such as 5.1 are structure, not prose punctuation.
  const proseOnly = text.replace(/\b\d+\.\d+\b/g, '')
  return [...proseOnly].filter(char => /[,.;;:!?]/.test(char)).length
}

function contentBodyLines(text: string): string[] {
  return text.split(/\r?\n/).map(line => line.trim()).filter(line => {
    if (!line) return false
    if (/^#{1,6}\s+/.test(line)) return false
    if (/^【[^】]+】$/.test(line)) return false
    if (line.includes('\t')) return false
    if (/^(?:一|二|三|四|五|六|七|八|九|十)、/.test(line)) return false
    if (/^\|[-\s|:]*\|$/.test(line)) return false
    if (/^[-*_]{3,}$/.test(line)) return false
    if (/\]\(#/.test(line)) return false
    return true
  })
}

function invariantForBatch(detail: EditTaskBatchDetail | undefined): string | undefined {
  if (detail?.invariantResult === PLANNED_DELETION_ONLY) return PLANNED_DELETION_ONLY
  if (detail?.invariantResult === NORMALIZE_PUNCTUATION_WHITESPACE_FORMAT_ONLY) {
    return NORMALIZE_PUNCTUATION_WHITESPACE_FORMAT_ONLY
  }
  return undefined
}

/**
 * Verify that a finished EditTask actually achieved its structured goals.
 * Batch success only proves writes were atomic; this service-level check
 * prevents model summaries from converting an unachieved goal into
 * `completed`.
 */
export function verifyEditTaskCompletion(input: {
  task: Pick<EditTask, 'executedBatches' | 'batchCommandSnapshots'>
  before: string
  after: string
}): EditTaskCompletionReport {
  const snapshots = input.task.batchCommandSnapshots || {}
  const violations: EditTaskCompletionViolation[] = []
  const invariants = new Set<string>()
  const plannedDeletionTargets = new Set<string>()

  for (const batchId of input.task.executedBatches) {
    const commands = snapshots[batchId] || []
    for (const command of commands) {
      const invariant = invariantForBatch(command.batchDetail)
      if (invariant) invariants.add(invariant)

      if (invariant === PLANNED_DELETION_ONLY && command.operation === 'delete' && command.target) {
        plannedDeletionTargets.add(command.target)
        const beforeCount = countOccurrences(input.before, command.target)
        const afterCount = countOccurrences(input.after, command.target)
        if (beforeCount === 0) {
          violations.push({
            code: 'delete_target_missing_before_execution',
            message: `计划删除目标在执行前不存在：${command.target}`,
            batchId,
            target: command.target,
            beforeCount,
            afterCount,
          })
        } else if (afterCount >= beforeCount) {
          violations.push({
            code: 'planned_deletion_not_removed',
            message: `计划删除目标仍然存在：${command.target}，before=${beforeCount}，after=${afterCount}`,
            batchId,
            target: command.target,
            beforeCount,
            afterCount,
          })
        }
      }
    }
  }

  if (invariants.has(NORMALIZE_PUNCTUATION_WHITESPACE_FORMAT_ONLY)
    && invariants.has(PLANNED_DELETION_ONLY)) {
    const beforeBodies = contentBodyLines(input.before)
    const afterBodies = new Set(contentBodyLines(input.after))
    const unplanned = beforeBodies.filter(line =>
      !afterBodies.has(line) && !plannedDeletionTargets.has(line))
    if (unplanned.length > 0) {
      violations.push({
        code: 'unplanned_content_removed',
        message: `复合整理删除了计划外正文行：${unplanned[0].slice(0, 80)}${unplanned.length > 1 ? `（共 ${unplanned.length} 行）` : ''}`,
        beforeCount: beforeBodies.length,
        afterCount: afterBodies.size,
      })
    }
  }

  if (invariants.has(NORMALIZE_PUNCTUATION_WHITESPACE_FORMAT_ONLY)) {
    // Only the semantic token multiset must stay unchanged. Deletion batches
    // in the same task intentionally remove text, so they are excluded here.
    const normalizeBatchExists = input.task.executedBatches.some(batchId =>
      (snapshots[batchId] || []).some(command =>
      invariantForBatch(command.batchDetail) === NORMALIZE_PUNCTUATION_WHITESPACE_FORMAT_ONLY))
    if (normalizeBatchExists && !semanticTokensEqual(input.before, input.after)) {
      violations.push({
        code: 'normalize_semantic_text_changed',
        message: '标点/空白整理批次改变了正文语义内容',
      })
    }
    if (normalizeBatchExists) {
      const beforeCount = countHalfWidthPunctuation(input.before)
      const afterCount = countHalfWidthPunctuation(input.after)
      if (beforeCount > 0 && afterCount >= beforeCount) {
        violations.push({
          code: 'normalize_punctuation_not_normalized',
          message: `标点整理未完成：半角标点未减少（before=${beforeCount}，after=${afterCount}）`,
          beforeCount,
          afterCount,
        })
      }
    }
  }

  if (input.task.executedBatches.length > 0) {
    const hasStructuredGoals = input.task.executedBatches.some(batchId =>
      (snapshots[batchId] || []).some(command =>
        invariantForBatch(command.batchDetail) !== undefined))
    if (!hasStructuredGoals) {
      return { verified: true, violations: [] }
    }
  }

  return {
    verified: violations.length === 0,
    invariant: Array.from(invariants).join('+') || undefined,
    violations,
  }
}
