export interface SchemaRetryFeedbackInput {
  errors: string[]
  previousOutput?: string
  maxErrors?: number
  maxAnchors?: number
  maxAnchorChars?: number
  maxPreviewEdgeChars?: number
}

export interface SchemaRetryFeedbackResult {
  feedback: string
  candidateChars: number
  feedbackChars: number
  anchorCount: number
  previewChars: number
  suppressedCandidateChars: number
}

const DEFAULT_MAX_ERRORS = 10
const DEFAULT_MAX_ANCHORS = 3
const DEFAULT_MAX_ANCHOR_CHARS = 200
const DEFAULT_MAX_PREVIEW_EDGE_CHARS = 200

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function buildErrorLines(errors: string[], maxErrors: number): string[] {
  return errors
    .map(error => String(error || '').trim())
    .filter(Boolean)
    .slice(0, Math.max(0, maxErrors))
    .map((error, index) => `${index + 1}. ${error}`)
}

function buildAnchors(
  candidate: string,
  maxAnchors: number,
  maxAnchorChars: number
): string[] {
  if (maxAnchors <= 0) return []
  return candidate
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => normalizeWhitespace(line.slice(0, Math.max(0, maxAnchorChars))))
    .filter(Boolean)
    .slice(0, maxAnchors)
}

function buildCandidatePreview(
  candidate: string,
  maxPreviewEdgeChars: number
): { preview: string; previewChars: number } {
  const edge = Math.max(0, maxPreviewEdgeChars)
  if (candidate.length <= edge * 2) {
    return { preview: candidate, previewChars: candidate.length }
  }
  const head = candidate.slice(0, edge)
  const tail = candidate.slice(candidate.length - edge)
  const omitted = candidate.length - head.length - tail.length
  const preview = `${head}\n……（省略 ${omitted} 字符）……\n${tail}`
  return { preview, previewChars: preview.length }
}

export function buildSchemaRetryFeedback(input: SchemaRetryFeedbackInput): SchemaRetryFeedbackResult {
  const errors = Array.isArray(input.errors) ? input.errors : []
  const candidate = typeof input.previousOutput === 'string' ? input.previousOutput.trim() : ''
  const maxErrors = input.maxErrors ?? DEFAULT_MAX_ERRORS
  const maxAnchors = input.maxAnchors ?? DEFAULT_MAX_ANCHORS
  const maxAnchorChars = input.maxAnchorChars ?? DEFAULT_MAX_ANCHOR_CHARS
  const maxPreviewEdgeChars = input.maxPreviewEdgeChars ?? DEFAULT_MAX_PREVIEW_EDGE_CHARS

  const lines: string[] = [
    '【结构化重试反馈】',
    '本反馈只描述失败事实与有界候选摘要，不携带候选输出全文。请基于原始任务输入重新输出完整结果。',
    '',
    '一、校验失败项',
    ...buildErrorLines(errors, maxErrors),
  ]

  const anchors = candidate ? buildAnchors(candidate, maxAnchors, maxAnchorChars) : []
  if (anchors.length > 0) {
    lines.push('', '二、候选输出定位锚点（最多3条，仅用于定位，不是重写基底）')
    for (const anchor of anchors) lines.push(`- ${anchor}`)
  }

  const { preview, previewChars } = candidate
    ? buildCandidatePreview(candidate, maxPreviewEdgeChars)
    : { preview: '', previewChars: 0 }
  if (preview) {
    lines.push(
      '',
      '三、候选输出有界摘要（头尾各200字符，完整全文已抑制）',
      preview
    )
  }

  lines.push('', '输出要求：重新输出符合 schema 的完整结果；不要复述本反馈，不要输出解释。')
  const feedback = lines.join('\n')
  return {
    feedback,
    candidateChars: candidate.length,
    feedbackChars: feedback.length,
    anchorCount: anchors.length,
    previewChars,
    suppressedCandidateChars: Math.max(0, candidate.length - previewChars),
  }
}
