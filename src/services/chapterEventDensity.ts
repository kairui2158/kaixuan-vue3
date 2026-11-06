export const CHAPTER_NARRATIVE_NOT_READY_CODE = 'chapter-narrative-not-ready'

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
  status: 'declared_ready' | 'declared_not_ready' | 'undeclared' | 'unreadable_because_missing_handoff'
  reason: string | null
  stateChangingScenes: string | null
  message: string
}

export interface ChapterNarrativeBlock {
  code: typeof CHAPTER_NARRATIVE_NOT_READY_CODE
  gap: string
  guidance: string
  retryableInBodyLayer: false
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
  const hasHandoff = /【正文交接】/.test(raw)
  const statusMatch = NARRATIVE_STATUS_PATTERN.exec(raw)
  const declaredStatus = statusMatch
    ? (statusMatch[1].toLowerCase() === 'not_ready' ? 'not_ready' : 'ready')
    : null
  const status = !declaredStatus
    ? 'undeclared'
    : !hasHandoff
      ? 'unreadable_because_missing_handoff'
      : declaredStatus === 'ready'
        ? 'declared_ready'
        : 'declared_not_ready'
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
      : status === 'unreadable_because_missing_handoff'
        ? 'narrativeStatus 出现但【正文交接】缺失；verdict 无法归因到有效交付账本。'
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
  // Single-referee rule: the app consumes only an explicit SKILL narrative verdict.
  const verdict = detectChapterNarrativeVerdict(text)
  if (verdict.status === 'declared_not_ready' || verdict.status === 'unreadable_because_missing_handoff') {
    return {
      code: CHAPTER_NARRATIVE_NOT_READY_CODE,
      gap: verdict.status === 'unreadable_because_missing_handoff'
        ? 'narrativeStatus 声明存在，但【正文交接】缺失，verdict 无法归属到可审计候选'
        : verdict.reason || 'SKILL 声明叙事 NOT_READY，需上游补足剧情材料',
      guidance: verdict.status === 'unreadable_because_missing_handoff'
        ? '叙事 verdict 载体缺失：需先补齐【正文交接】再判断叙事状态；本次不进入正文层重试。'
        : 'SKILL 叙事裁决 NOT_READY：请回到章节规划/剧情层补足事件点，正文层不重试、不改写。',
      retryableInBodyLayer: false
    }
  }
  return null
}

export function isChapterNarrativeBlockDiagnosticCode(code: string): boolean {
  return code === CHAPTER_NARRATIVE_NOT_READY_CODE
}
