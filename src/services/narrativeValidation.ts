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

function checkSourceRefNumbering(refs: string[]): string[] {
  const groups = new Map<string, number[]>()
  for (const ref of refs) {
    // Only "prefix-N" style refs carry a sequence; semantic refs like
    // "outline:locked" have nothing to check.
    const match = ref.match(/^(.+?)[-\s](\d+)$/)
    if (!match) continue
    const num = Number(match[2])
    if (!Number.isInteger(num) || num <= 0) continue
    const list = groups.get(match[1]) || []
    list.push(num)
    groups.set(match[1], list)
  }
  const errors: string[] = []
  for (const [prefix, numbers] of groups) {
    // A sequence is only enforced when it starts at 1; otherwise the number
    // may be an id suffix (e.g. "volume:vol-2") rather than an ordinal.
    if (!numbers.includes(1)) continue
    const sorted = [...new Set(numbers)].sort((a, b) => a - b)
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] !== i + 1) {
        errors.push(`来源编号断档：「${prefix}」组第 ${i + 1} 个编号应为 ${i + 1}，实际为 ${sorted[i]}`)
        break
      }
    }
  }
  return errors
}

export function validateChapterExecutionPackage(
  pkg: any,
  options?: { expectedSceneCount?: number }
): NarrativeValidationResult {
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) {
    return { valid: false, errors: ['章节执行包缺失'], missingCount: 1 }
  }
  const errors: string[] = []
  let missingCount = 0
  const require = (value: string, message: string) => {
    if (!value) {
      errors.push(message)
      missingCount++
    }
  }
  if (pkg.version !== 1) errors.push(`章节执行包版本不支持：${String(pkg.version ?? '?')}`)
  const volume = pkg.volume && typeof pkg.volume === 'object' ? pkg.volume : {}
  const chapter = pkg.chapter && typeof pkg.chapter === 'object' ? pkg.chapter : {}
  require(text(volume.id), '执行包缺少卷 ID')
  require(text(volume.name), '执行包缺少卷名')
  require(text(volume.outline) || text(volume.summary), '执行包缺少卷纲内容')
  require(text(chapter.id), '执行包缺少章节 ID')
  require(text(chapter.title), '执行包缺少章节标题')
  require(text(chapter.plot), '执行包缺少章节剧情点')
  require(text(pkg.outlineContent), '执行包缺少全书大纲内容')
  const sourceRefs = Array.isArray(pkg.sourceRefs) ? pkg.sourceRefs.map((ref: unknown) => String(ref || '').trim()).filter(Boolean) : []
  if (sourceRefs.length === 0) {
    errors.push('执行包缺少来源编号')
    missingCount++
  } else {
    for (const name of duplicateLabels(sourceRefs, (ref) => ref)) {
      errors.push(`来源编号重复：「${name}」`)
    }
    errors.push(...checkSourceRefNumbering(sourceRefs))
  }
  const expectedSceneCount = options?.expectedSceneCount
  const scenes = Array.isArray(pkg.scenes) ? pkg.scenes : null
  if (scenes) {
    scenes.forEach((scene: any, index: number) => {
      const name = text(scene?.name) || text(scene?.title) || text(scene?.id)
      const desc = text(scene?.description) || text(scene?.content) || text(scene?.summary) || text(scene?.plot)
      if (!name) errors.push(`第 ${index + 1} 个场景缺少场景名`)
      if (!desc) errors.push(`场景「${name || index + 1}」缺少场景内容`)
    })
    if (expectedSceneCount !== undefined && scenes.length !== expectedSceneCount) {
      errors.push(`场景数量不一致：执行包含 ${scenes.length} 个场景，预期 ${expectedSceneCount} 个`)
    }
  } else if (expectedSceneCount !== undefined && expectedSceneCount > 0) {
    errors.push(`执行包缺少场景列表，预期 ${expectedSceneCount} 个场景`)
  }
  return { valid: errors.length === 0, errors, missingCount }
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
