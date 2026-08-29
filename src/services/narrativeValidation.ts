export type NarrativeValidationResult = {
  valid: boolean
  errors: string[]
  missingCount: number
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value || '').trim()
}

function duplicateLabels(items: unknown[], label: (item: any) => string): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const item of items) {
    const value = label(item)
    if (!value) continue
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  }
  return [...duplicates]
}

export function validateVolumeNarrative(volumes: any[], expectedCount?: number): NarrativeValidationResult {
  const errors: string[] = []
  const list = Array.isArray(volumes) ? volumes : []
  if (expectedCount !== undefined && list.length !== expectedCount) {
    errors.push(`卷数缺口：当前 ${list.length} 卷，目标 ${expectedCount} 卷`)
  }
  list.forEach((volume, index) => {
    const name = text(volume?.name)
    const outline = text(volume?.outline) || text(volume?.summary)
    if (!name) errors.push(`第 ${index + 1} 卷缺少名称`)
    if (!outline) errors.push(`卷「${name || '?'}」缺少卷纲内容`)
    if (volume?.suggestedWords !== undefined && Number(volume.suggestedWords) < 0) {
      errors.push(`卷「${name || '?'}」字数不能为负数`)
    }
  })
  for (const name of duplicateLabels(list, (volume) => text(volume?.name))) {
    errors.push(`卷名重复：「${name}」`)
  }
  return { valid: errors.length === 0, errors, missingCount: Math.max(0, (expectedCount || 0) - list.length) }
}

export function validateChapterNarrative(chapters: any[], expectedCount?: number): NarrativeValidationResult {
  const errors: string[] = []
  const list = Array.isArray(chapters) ? chapters : []
  if (expectedCount !== undefined && list.length !== expectedCount) {
    errors.push(`章节数量缺口：当前 ${list.length} 章，目标 ${expectedCount} 章`)
  }
  list.forEach((chapter, index) => {
    const title = text(chapter?.title)
    const plot = text(chapter?.plot) || text(chapter?.summary)
    if (!title) errors.push(`第 ${index + 1} 章缺少标题`)
    if (!plot) errors.push(`章节「${title || '?'}」缺少剧情点概要`)
  })
  for (const title of duplicateLabels(list, (chapter) => text(chapter?.title))) {
    errors.push(`章节标题重复：「${title}」`)
  }
  return { valid: errors.length === 0, errors, missingCount: Math.max(0, (expectedCount || 0) - list.length) }
}

export function selectCompleteChapters(chapters: any[]): any[] {
  if (!Array.isArray(chapters)) return []
  const titles = new Set<string>()
  return chapters.filter((chapter) => {
    const title = text(chapter?.title)
    const plot = text(chapter?.plot) || text(chapter?.summary)
    if (!title || !plot || titles.has(title)) return false
    titles.add(title)
    return true
  })
}
