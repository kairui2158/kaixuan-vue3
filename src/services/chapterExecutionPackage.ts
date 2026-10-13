export interface ChapterExecutionPackage {
  version: 2
  projectId: string
  contextScope?: {
    unitId: string | null
    closure: string
    permanentCount: number
    unitCount: number
    undeclaredCount: number
    closureBytes: number
    targetBytes: number
    maxBytes: number
    trimmed: string[]
    warnings: string[]
    degradedReason: string | null
  }
  volume: {
    id: string
    index: number
    name: string
    outline: string
    summary: string
    suggestedWords: number
  }
  chapter: {
    id: string
    index: number
    title: string
    plot: string
    summary: string
    wordCount: number
  }
  outlineContent: string
  settings: string[]
  boundSettings: string
  styleContext: string
  pacingContext: string
  memoryContext: string
  prevChapterSummary: string
  sourceRefs: string[]
}

export interface ChapterExecutionPackageInput {
  projectId?: string | null
  volume?: any
  volumeIndex?: number
  chapter?: any
  chapterIndex?: number
  outlineContent?: unknown
  contextScope?: unknown
  settings?: unknown[]
  boundSettings?: unknown
  styleContext?: unknown
  pacingContext?: unknown
  memoryContext?: unknown
  prevChapterSummary?: unknown
  sourceRefs?: unknown[]
}

function contextScope(value: unknown): ChapterExecutionPackage['contextScope'] {
  if (!value || typeof value !== 'object') return undefined
  const scope = value as Record<string, unknown>
  const numbers = (key: string, fallback = 0): number => {
    const parsed = Number(scope[key])
    return Number.isFinite(parsed) ? parsed : fallback
  }
  const strings = (key: string): string[] =>
    Array.isArray(scope[key]) ? scope[key].map(text).filter(Boolean) : []
  const unitId = scope.unitId
  return {
    unitId: unitId == null || unitId === '' ? null : text(unitId),
    closure: text(scope.closure),
    permanentCount: numbers('permanentCount'),
    unitCount: numbers('unitCount'),
    undeclaredCount: numbers('undeclaredCount'),
    closureBytes: numbers('closureBytes'),
    targetBytes: numbers('targetBytes'),
    maxBytes: numbers('maxBytes'),
    trimmed: strings('trimmed'),
    warnings: strings('warnings'),
    degradedReason: scope.degradedReason == null ? null : text(scope.degradedReason)
  }
}

function text(value: unknown): string {
  return value == null ? "" : String(value)
}

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function list(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return values.map(text).filter(Boolean)
}

export function createChapterExecutionPackage(input: ChapterExecutionPackageInput): ChapterExecutionPackage {
  const volume = input.volume || {}
  const chapter = input.chapter || {}
  const volumeId = text(volume.id || volume.name)
  const chapterId = text(chapter.id || `${volumeId}-chapter-${number(input.chapterIndex) + 1}`)
  const volumeOutline = text(volume.outline || volume.summary)
  const chapterPlot = text(chapter.plot)

  return {
    version: 2,
    projectId: text(input.projectId),
    contextScope: contextScope(input.contextScope),
    volume: {
      id: volumeId,
      index: number(input.volumeIndex),
      name: text(volume.name),
      outline: volumeOutline,
      summary: text(volume.summary || volumeOutline),
      suggestedWords: number(volume.allocatedWords || volume.suggestedWords)
    },
    chapter: {
      id: chapterId,
      index: number(input.chapterIndex),
      title: text(chapter.title),
      plot: chapterPlot,
      summary: text(chapter.summary || chapterPlot),
      wordCount: number(chapter.wordCount)
    },
    outlineContent: text(input.outlineContent),
    settings: list(input.settings),
    boundSettings: text(input.boundSettings),
    styleContext: text(input.styleContext),
    pacingContext: text(input.pacingContext),
    memoryContext: text(input.memoryContext),
    prevChapterSummary: text(input.prevChapterSummary),
    sourceRefs: list(input.sourceRefs)
  }
}

export function buildChapterExecutionPrompt(pkg: ChapterExecutionPackage, targetWords: unknown): string {
  if (!pkg.contextScope?.closure) {
    throw new Error("正文上下文闭包为空，禁止回退全书大纲")
  }
  const settings = pkg.settings.join("\n")
  const bound = pkg.boundSettings ? "\n\n[绑定设定]\n" + pkg.boundSettings : ""
  const style = pkg.styleContext || pkg.pacingContext
    ? "\n\n[风格与节奏分析]\n" + [pkg.styleContext, pkg.pacingContext].filter(Boolean).join("\n")
    : ""
  const memory = pkg.memoryContext ? "\n\n[相关记忆]\n" + pkg.memoryContext : ""
  const prevChapter = pkg.prevChapterSummary ? "\n\n[上一章概要]\n" + pkg.prevChapterSummary : ""
  const outlineBlock = pkg.contextScope?.closure
    ? "[单元闭包卷纲]\n" + pkg.contextScope.closure
    : "[全书大纲（降级）]\n" + pkg.outlineContent
  return outlineBlock
    + "\n\n[设定摘要]\n" + settings + bound + style
    + "\n\n[当前卷概要]\n" + pkg.volume.name + " - " + pkg.volume.outline
    + prevChapter
    + "\n\n[当前章节剧情点]\n" + pkg.chapter.title + " - " + pkg.chapter.plot
    + memory
    + "\n\n请为本章节生成约" + text(targetWords) + "字的正文内容。"
}
