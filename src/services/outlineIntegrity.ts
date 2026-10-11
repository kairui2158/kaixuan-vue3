import { assertStructureCoverage, parseOutlineStructure } from './outlineStructure'
import type { OutlineStructureNode } from './outlineStructure'

export interface OutlineIntegrityIssue {
  level: 'critical' | 'warning'
  type: string
  message: string
}

export interface OutlineIntegrityOptions {
  allowCritical?: boolean
  /** Allows a user-approved heading deletion batch; other critical guards remain active. */
  allowHeadingDeletion?: boolean
  /** Allows a user-approved deletion batch's expected heading/body reduction; all other critical guards remain active. */
  allowAuthorizedDeletion?: boolean
  /** Exact deletion length covered by the user-approved command batch. */
  authorizedDeletedLength?: number
  /** Enables whole-document body-preservation checks; leave false for ordinary scoped edits. */
  validateDocumentBody?: boolean
  /**
   * Single-pass whole-document rewrites legitimately merge or remove duplicate
   * and malformed sections. Global structure and length guards stay active.
   */
  allowWholeDocumentRewrite?: boolean
}

export interface OutlineIntegrityReport {
  ok: boolean
  criticalCount: number
  warningCount: number
  issues: OutlineIntegrityIssue[]
  summary: string
}

const normalizeBodyText = (value: string): string => value.replace(/\s+/g, '')

const STRUCTURAL_NODE_KINDS = new Set<OutlineStructureNode['kind']>(['volume', 'chapter', 'section', 'heading'])

function collectSectionBodies(nodes: OutlineStructureNode[], text: string, output: string[]): void {
  for (const node of nodes) {
    if (node.kind === 'section' || node.kind === 'heading') {
      // A container heading's node range includes all child sections. Compare
      // only its own lead text; child bodies are checked separately so that a
      // whole-document reorder is not falsely reported as content loss.
      const firstStructuralChild = node.children.find(child => STRUCTURAL_NODE_KINDS.has(child.kind))
      const bodyEnd = firstStructuralChild ? firstStructuralChild.start : node.end
      const body = normalizeBodyText(text.slice(node.contentStart, bodyEnd))
      if (body) output.push(body)
    }
    collectSectionBodies(node.children, text, output)
  }
}

export function validateOutlineIntegrity(
  original: string,
  next: string,
  options: OutlineIntegrityOptions = {}
): OutlineIntegrityReport {
  const issues: OutlineIntegrityIssue[] = []
  const before = parseOutlineStructure(original)
  const after = parseOutlineStructure(next)

  const coverage = assertStructureCoverage(after, next.length)
  for (const problem of coverage.problems) {
    issues.push({ level: 'critical', type: 'structure_broken', message: problem })
  }

  if (!after.degraded && before.volumeCount > 0 && after.volumeCount === 0) {
    issues.push({ level: 'critical', type: 'structure_broken', message: '修改后所有卷级标题均丢失' })
  }
  if (before.degraded === false && after.degraded && after.degradedReason?.includes('重复')) {
    issues.push({ level: 'critical', type: 'duplicate_heading', message: after.degradedReason })
  }

  const beforeHeadingCount = original.match(/^(?:#{1,6}\s|第[0-9一二三四五六七八九十百千万零两\s]+[卷章节回])/gm)?.length || 0
  const afterHeadingCount = next.match(/^(?:#{1,6}\s|第[0-9一二三四五六七八九十百千万零两\s]+[卷章节回])/gm)?.length || 0
  if (beforeHeadingCount > 0 && afterHeadingCount < beforeHeadingCount) {
    issues.push({
      level: options.allowWholeDocumentRewrite ? 'warning' : 'critical',
      type: 'heading_count_reduced',
      message: `标题数量从 ${beforeHeadingCount} 降到 ${afterHeadingCount}，可能破坏层级`
    })
  }

  if (options.validateDocumentBody) {
    const beforeBodies: string[] = []
    const afterBodies: string[] = []
    collectSectionBodies(before.nodes, original, beforeBodies)
    collectSectionBodies(after.nodes, next, afterBodies)
    const missingBodies = beforeBodies.filter(body => !afterBodies.some(candidate => candidate.includes(body)))
    if (missingBodies.length) {
      issues.push({
        level: options.allowWholeDocumentRewrite ? 'warning' : 'critical',
        type: 'body_content_lost',
        message: options.allowWholeDocumentRewrite
          ? `整篇重排合并/清理了 ${missingBodies.length} 个旧小节正文（已在计划内）`
          : `整篇替换后有 ${missingBodies.length} 个小节正文丢失，需保留全部小节正文`
      })
    }
  }

  const nonEmptyBefore = original.replace(/\s/g, '').length
  const nonEmptyAfter = next.replace(/\s/g, '').length
  const ratio = nonEmptyBefore ? nonEmptyAfter / nonEmptyBefore : 1
  if (nonEmptyBefore > 100 && ratio < 0.6) {
    issues.push({
      level: 'critical',
      type: 'content_loss',
      message: `正文有效字数骤减：${Math.round(ratio * 100)}%`
    })
  } else if (nonEmptyBefore > 100 && ratio < 0.8) {
    issues.push({
      level: 'warning',
      type: 'content_shrink',
      message: `正文有效字数下降至 ${Math.round(ratio * 100)}%`
    })
  }

  if (before.chapterCount > 0 && after.chapterCount > before.chapterCount * 1.5) {
    issues.push({
      level: 'warning',
      type: 'chapter_explosion',
      message: `章节数量异常增长：${before.chapterCount} -> ${after.chapterCount}`
    })
  }

  const expectedDeletionAuthorized = options.allowAuthorizedDeletion
    && options.authorizedDeletedLength !== undefined
    && Math.max(0, original.length - next.length) === options.authorizedDeletedLength
  // A whole-section deletion naturally reduces both heading count and body
  // length. The exact-length check above proves the model replayed the exact
  // authorized batch, so these two consequences may be waived together.
  const authorizedDeletionTypes = new Set(['heading_count_reduced', 'content_loss'])
  const blockingIssues = options.allowAuthorizedDeletion
    ? issues.filter(issue => issue.level === 'critical' && !(
      expectedDeletionAuthorized && authorizedDeletionTypes.has(issue.type)
    ))
    : options.allowHeadingDeletion
      ? issues.filter(issue => issue.level === 'critical' && issue.type !== 'heading_count_reduced')
      : issues.filter(issue => issue.level === 'critical')
  const criticalCount = issues.filter(issue => issue.level === 'critical').length
  const warningCount = issues.filter(issue => issue.level === 'warning').length
  return {
    ok: options.allowCritical ? true : blockingIssues.length === 0,
    criticalCount,
    warningCount,
    issues,
    summary: criticalCount
      ? `发现 ${criticalCount} 个严重结构问题，默认阻断应用`
      : warningCount
        ? `发现 ${warningCount} 个提示，可继续确认`
        : '大纲结构完整性校验通过'
  }
}
