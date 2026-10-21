export const PROMPT_BLOCK_FULL_OUTLINE = '[全书大纲]'
export const PROMPT_BLOCK_OUTLINE = '[大纲]'
export const PROMPT_BLOCK_VOLUME_OUTLINE = '[卷纲]'
export const PROMPT_BLOCK_SETTINGS = '[设定]'
export const PROMPT_BLOCK_BOUND_SETTINGS = '[绑定设定]'
export const PROMPT_BLOCK_SETTINGS_PLANNING_CONSTRAINTS = '[设定规划约束]'
export const PROMPT_BLOCK_CHAPTER_PLANNING_CONSTRAINTS = '[章节规划约束]'
export const PROMPT_BLOCK_BODY_EXECUTION_CONSTRAINTS = '[正文执行约束]'
export const PROMPT_BLOCK_VOLUME_COUNT = '[卷数]'
export const PROMPT_BLOCK_TOTAL_CHAPTERS = '[本卷总章数]'
export const PROMPT_BLOCK_WORDS_PER_CHAPTER = '[单章字数]'
export const PROMPT_BLOCK_GENERATED_CHAPTER_TITLES = '[已生成章节标题清单]'
export const PROMPT_BLOCK_STYLE_AND_RHYTHM = '[风格与节奏]'
export const PROMPT_BLOCK_PREVIOUS_SKILL_OUTPUT = '[上一步 SKILL 完整输出]'

/**
 * Ordered full-outline headers. Volume generation still uses the historical
 * `[大纲]` spelling; chapter generation uses `[全书大纲]`. Both names mean the
 * same asset and must be managed by this protocol only.
 */
export const FULL_OUTLINE_BLOCK_HEADERS = [
  PROMPT_BLOCK_FULL_OUTLINE,
  PROMPT_BLOCK_OUTLINE,
] as const

/** Headers that terminate a full-outline block in existing prompt builders. */
export const FULL_OUTLINE_BLOCK_END_HEADERS = [
  PROMPT_BLOCK_SETTINGS,
  PROMPT_BLOCK_BOUND_SETTINGS,
  PROMPT_BLOCK_SETTINGS_PLANNING_CONSTRAINTS,
  PROMPT_BLOCK_CHAPTER_PLANNING_CONSTRAINTS,
  PROMPT_BLOCK_BODY_EXECUTION_CONSTRAINTS,
  PROMPT_BLOCK_VOLUME_COUNT,
  PROMPT_BLOCK_STYLE_AND_RHYTHM,
  PROMPT_BLOCK_VOLUME_OUTLINE,
] as const

/** Blocks whose repetition is meaningful in physical request audits. */
export const REPEATED_PROMPT_BLOCK_MARKERS = [
  '[已生成卷事实清单]',
  PROMPT_BLOCK_FULL_OUTLINE,
  PROMPT_BLOCK_OUTLINE,
  '[style reference]',
  PROMPT_BLOCK_PREVIOUS_SKILL_OUTPUT,
] as const

export interface LocatedPromptBlock {
  header: string
  start: number
  contentStart: number
  end: number
  content: string
}

export function locatePromptBlock(
  prompt: string,
  headers: readonly string[],
  endHeaders: readonly string[],
): LocatedPromptBlock | null {
  const text = String(prompt || '')
  let located: LocatedPromptBlock | null = null
  for (const header of headers) {
    const start = text.indexOf(header)
    if (start < 0) continue
    if (!located || start < located.start) {
      located = { header, start, contentStart: start + header.length, end: -1, content: '' }
    }
  }
  if (!located) return null

  for (const nextHeader of endHeaders) {
    const index = text.indexOf(nextHeader, located.contentStart)
    if (index >= 0 && (located.end < 0 || index < located.end)) located.end = index
  }
  if (located.end < 0) return null
  located.content = text.slice(located.contentStart, located.end).trim()
  return located
}
