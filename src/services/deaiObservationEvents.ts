export interface DeAiDetectSummaryEvent {
  type: 'deai-kernel-v2' | 'deai-score' | 'deai-style-drift'
  level: 'info' | 'warn'
  label: string
  detail: string
}

interface DetectReportLike {
  kernelVersion?: unknown
  provisional?: unknown
  effectiveChars?: unknown
  dialogueChars?: unknown
  score?: unknown
  verdict?: unknown
  aiEditedFraction?: unknown
  styleDrift?: {
    windowCount?: unknown
    firstLastDelta?: unknown
    severity?: unknown
  } | null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function jsonDetail(value: Record<string, unknown>): string {
  return JSON.stringify(value)
}

export function buildDeaiDetectSummaryEvents(report: unknown): DeAiDetectSummaryEvent[] {
  if (!report || typeof report !== 'object') return []
  const source = report as DetectReportLike
  if (source.kernelVersion !== 'v2' || !isFiniteNumber(source.score)) return []

  const events: DeAiDetectSummaryEvent[] = [{
    type: 'deai-kernel-v2',
    level: 'info',
    label: '降AI V2 检测内核',
    detail: jsonDetail({
      kernelVersion: source.kernelVersion,
      provisional: source.provisional === true,
      effectiveChars: isFiniteNumber(source.effectiveChars) ? source.effectiveChars : null,
      dialogueChars: isFiniteNumber(source.dialogueChars) ? source.dialogueChars : null
    })
  }, {
    type: 'deai-score',
    level: isFiniteNumber(source.score) && source.score >= 70 ? 'warn' : 'info',
    label: '降AI检测评分',
    detail: jsonDetail({
      score: source.score,
      verdict: typeof source.verdict === 'string' ? source.verdict : 'unknown',
      aiEditedFraction: typeof source.aiEditedFraction === 'string' ? source.aiEditedFraction : 'unknown'
    })
  }]

  const drift = source.styleDrift
  if (
    drift
    && isFiniteNumber(drift.windowCount)
    && isFiniteNumber(drift.firstLastDelta)
    && (drift.severity === 'advisory' || drift.severity === 'blocking')
  ) {
    events.push({
      type: 'deai-style-drift',
      level: drift.severity === 'blocking' ? 'warn' : 'info',
      label: '降AI风格漂移检测',
      detail: jsonDetail({
        windowCount: drift.windowCount,
        firstLastDelta: drift.firstLastDelta,
        severity: drift.severity
      })
    })
  }

  return events
}
