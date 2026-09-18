import { assertStructureCoverage, parseOutlineStructure } from './outlineStructure'

export interface OutlineIntegrityIssue {
  level: 'critical' | 'warning'
  type: string
  message: string
}

export interface OutlineIntegrityOptions {
  allowCritical?: boolean
}

export interface OutlineIntegrityReport {
  ok: boolean
  criticalCount: number
  warningCount: number
  issues: OutlineIntegrityIssue[]
  summary: string
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
      level: 'critical',
      type: 'structure_broken',
      message: `标题数量从 ${beforeHeadingCount} 降到 ${afterHeadingCount}，可能破坏层级`
    })
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

  const criticalCount = issues.filter(issue => issue.level === 'critical').length
  const warningCount = issues.filter(issue => issue.level === 'warning').length
  return {
    ok: options.allowCritical ? true : criticalCount === 0,
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
