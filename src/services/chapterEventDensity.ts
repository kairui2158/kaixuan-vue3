export const CHAPTER_EVENT_DENSITY_NOT_READY_CODE = 'chapter-event-density-not-ready'
export const CHAPTER_NARRATIVE_NOT_READY_CODE = 'chapter-narrative-not-ready'

const NOT_READY_PATTERN = /(?:^|\n)\s*\[?NOT-READY\]?\s*[：:]?\s*(.+)/i
const DENSITY_GAP_PATTERN = /章级事件密度不足/
const NARRATIVE_STATUS_PATTERN = /(?:^|\n)\s*(?:【)?\s*narrativeStatus\s*(?:】)?\s*[：:]\s*(ready|not_ready)\s*/i
const NARRATIVE_REASON_PATTERN = /(?:^|\n)\s*(?:【)?\s*narrativeReason\s*(?:】)?\s*[：:]\s*(.+)/i
const STATE_CHANGING_SCENES_PATTERN = /(?:^|\n)\s*(?:【)?\s*stateChangingScenes\s*(?:】)?\s*[：:]\s*(.+)/i

export interface ChapterEventIncrementAdvisory {
  code: 'chapter-event-increment-advisory'
  severity: 'warning'
  detected: boolean
  incrementValue: string | null
  message: string
}

export interface ChapterNarrativeVerdict {
  code: 'chapter-narrative-verdict'
  detected: boolean
  status: 'ready' | 'not_ready' | 'undeclared'
  reason: string | null
  stateChangingScenes: string | null
  message: string
}

export interface ChapterEventDensityResult {
  detected: boolean
  reason: 'upstream_material_gap'
  code: typeof CHAPTER_EVENT_DENSITY_NOT_READY_CODE
  gap: string | null
  guidance: string
  rawOutput: string
}

export interface ChapterNarrativeBlock {
  code: typeof CHAPTER_EVENT_DENSITY_NOT_READY_CODE | typeof CHAPTER_NARRATIVE_NOT_READY_CODE
  gap: string
  guidance: string
  retryableInBodyLayer: false
}

export function detectChapterEventDensityNotReady(text: string): ChapterEventDensityResult {
  const rawOutput = String(text || '')
  const match = NOT_READY_PATTERN.exec(rawOutput)
  const gap = match?.[1]?.trim() || null
  const detected = Boolean(match && DENSITY_GAP_PATTERN.test(match[1]))
  return {
    detected,
    reason: 'upstream_material_gap',
    code: CHAPTER_EVENT_DENSITY_NOT_READY_CODE,
    gap: detected ? (gap || '章级事件密度不足，需上游补剧情点') : null,
    guidance: detected
      ? '上游剧情材料不足：请回到章节规划/剧情层补足事件点，正文层不重试。'
      : '',
    rawOutput
  }
}

export function findChapterEventIncrementValue(text: string): string | null {
  const raw = String(text || '')
  const patterns = [
    /(?:^|\n)\s*事件增量\s*[：:]\s*(.+)/,
    /(?:^|\n)\s*【事件增量】\s*[：:]?\s*(.+)/
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(raw)
    if (match?.[1]) {
      const value = match[1].split(/\r?\n/)[0].trim()
      if (value) return value
    }
  }
  return null
}

export function detectChapterNarrativeVerdict(text: string): ChapterNarrativeVerdict {
  const raw = String(text || '')
  const statusMatch = NARRATIVE_STATUS_PATTERN.exec(raw)
  const status = statusMatch
    ? (statusMatch[1].toLowerCase() === 'not_ready' ? 'not_ready' : 'ready')
    : 'undeclared'
  const reasonMatch = NARRATIVE_REASON_PATTERN.exec(raw)
  const stateChangingScenesMatch = STATE_CHANGING_SCENES_PATTERN.exec(raw)
  const reason = reasonMatch?.[1]?.split(/\r?\n/)[0]?.trim() || null
  const stateChangingScenes = stateChangingScenesMatch?.[1]?.split(/\r?\n/)[0]?.trim() || null
  return {
    code: 'chapter-narrative-verdict',
    detected: status !== 'undeclared',
    status,
    reason,
    stateChangingScenes,
    message: status === 'undeclared'
      ? 'SKILL 未声明 narrativeStatus；应用不推断叙事质量。'
      : `SKILL 叙事裁决：${status}${reason ? `；${reason}` : ''}`
  }
}

export function evaluateChapterEventIncrement(
  text: string
): ChapterEventIncrementAdvisory {
  const raw = String(text || '')
  const incrementValue = findChapterEventIncrementValue(raw)
  const detected = !incrementValue
  const message = detected
    ? '【正文交接】缺少必填字段「事件增量」，属于交接协议缺口；叙事质量由 SKILL 层裁定。'
    : '事件增量字段已按 SKILL 交接协议交付；应用只做协议观测，不评估叙事质量。'

  return {
    code: 'chapter-event-increment-advisory',
    severity: 'warning',
    detected,
    incrementValue,
    message
  }
}

export function resolveChapterNarrativeBlock(text: string): ChapterNarrativeBlock | null {
  const density = detectChapterEventDensityNotReady(text)
  if (density.detected) {
    return {
      code: CHAPTER_EVENT_DENSITY_NOT_READY_CODE,
      gap: density.gap || '章级事件密度不足，需上游补剧情点',
      guidance: density.guidance,
      retryableInBodyLayer: false
    }
  }
  const verdict = detectChapterNarrativeVerdict(text)
  if (verdict.status === 'not_ready') {
    return {
      code: CHAPTER_NARRATIVE_NOT_READY_CODE,
      gap: verdict.reason || 'SKILL 声明叙事 NOT_READY，需上游补足剧情材料',
      guidance: 'SKILL 叙事裁决 NOT_READY：请回到章节规划/剧情层补足事件点，正文层不重试、不改写。',
      retryableInBodyLayer: false
    }
  }
  return null
}

export function isChapterNarrativeBlockDiagnosticCode(code: string): boolean {
  return code === CHAPTER_EVENT_DENSITY_NOT_READY_CODE || code === CHAPTER_NARRATIVE_NOT_READY_CODE
}
