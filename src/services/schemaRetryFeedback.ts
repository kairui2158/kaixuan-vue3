import { countBodyWords } from './bodyArtifactContract'
import { splitLegacyMetadataSections } from './legacyMetadataSections'
import { resolveProseWordContract } from './proseWordContract'

export interface SchemaRetryFeedbackInput {
  errors: string[]
  previousOutput?: string
  protectedContract?: import('./protectedSkillContract').ProtectedSkillContract
  maxErrors?: number
  maxAnchors?: number
  maxAnchorChars?: number
  maxPreviewEdgeChars?: number
  maxScaffoldChars?: number
}

export interface SchemaRetryFeedbackResult {
  feedback: string
  strategy: 'bounded-summary' | 'word-gap'
  candidateChars: number
  feedbackChars: number
  anchorCount: number
  previewChars: number
  scaffoldChars: number
  scaffoldFieldCount: number
  suppressedCandidateChars: number
}

const DEFAULT_MAX_ERRORS = 10
const DEFAULT_MAX_ANCHORS = 3
const DEFAULT_MAX_ANCHOR_CHARS = 200
const DEFAULT_MAX_PREVIEW_EDGE_CHARS = 200
const DEFAULT_MAX_SCAFFOLD_CHARS = 800

const SCAFFOLD_FIELD_PATTERNS = [
  { key: '章节', pattern: /^章节[:：]/ },
  { key: 'POV', pattern: /^(?:POV|视角)[:：]/i },
  { key: '已完成场景', pattern: /^已完成场景[:：]/ },
  { key: '未完成场景', pattern: /^未完成场景[:：]/ },
  { key: '来源覆盖状态', pattern: /^来源覆盖状态[:：]/ },
  { key: '角色状态变化', pattern: /^角色状态变化[:：]/ },
  { key: '章末状态', pattern: /^章末状态[:：]/ },
  { key: '下一章必须使用', pattern: /^下一章必须使用[:：]/ },
  { key: '场景总数', pattern: /^场景总数[:：]/ },
  { key: 'FACT_LOCK', pattern: /^FACT_LOCK[:：]/i },
  { key: 'NEW_FACT', pattern: /^NEW_FACT[:：]/i }
] as const

interface WordGapScaffold {
  text: string
  fieldCount: number
  available: boolean
}

function buildWordGapScaffold(candidate: string, maxChars: number): WordGapScaffold {
  const limit = Math.max(0, maxChars)
  if (!candidate) return { text: '', fieldCount: 0, available: false }
  const handoff = splitLegacyMetadataSections(candidate)
    .sections
    .find(section => section.includes('【正文交接】'))
  if (!handoff) return { text: '', fieldCount: 0, available: false }

  const fields: string[] = []
  let current: { key: string; lines: string[] } | null = null
  for (const line of handoff.split(/\r?\n/)) {
    const matched = SCAFFOLD_FIELD_PATTERNS.find(field => field.pattern.test(line.trim()))
    if (matched) {
      if (current) fields.push(`${current.key}：${current.lines.join(' / ')}`)
      current = { key: matched.key, lines: [line.trim()] }
      continue
    }
    if (current) current.lines.push(line.trim())
  }
  if (current) fields.push(`${current.key}：${current.lines.join(' / ')}`)

  const normalized = fields
    .map(field => normalizeWhitespace(field))
    .filter(Boolean)
  let text = normalized.join('\n')
  if (text.length > limit) text = `${text.slice(0, limit)}\n（结构骨架超长，已截断）`
  return { text, fieldCount: normalized.length, available: true }
}

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
  const maxScaffoldChars = input.maxScaffoldChars ?? DEFAULT_MAX_SCAFFOLD_CHARS
  const contract = input.protectedContract
  const isWordGapFailure = Boolean(contract?.kind === 'body' &&
    errors.some(error => /正文过短|正文过长/.test(String(error))))

  if (contract?.kind === 'body' && isWordGapFailure) {
    const { targetWords, minWords, maxWords } = resolveProseWordContract(contract)
    const currentWords = candidate ? countBodyWords(candidate) : 0
    const gap = currentWords < minWords
      ? minWords - currentWords
      : currentWords > maxWords ? currentWords - maxWords : 0
    const scaffold = buildWordGapScaffold(candidate, maxScaffoldChars)
    const lines = [
      '【结构化重试反馈】',
      '本反馈描述净字数缺口与有界结构骨架。候选全文未随本反馈回传，请基于原始任务输入、结构骨架与已生成的场景结构补写缺口，不要复述反馈本身，不要输出解释。',
      '',
      `目标净字数：${targetWords}`,
      `下限净字数：${minWords}`,
      `上限净字数：${maxWords}`,
      `当前净字数：${currentWords}`,
      `还差净字数：${gap}`,
      '',
      '一、上一版场景结构骨架（有界，不是候选全文）'
    ]
    if (scaffold.available) {
      lines.push(scaffold.text, '', '修复要求：以上方结构骨架为保留边界，只补足缺口场景和承接段；正文末尾必须保留【正文交接】区块。')
    } else {
      lines.push('（上一版候选没有可解析的【正文交接】账本，无法提供结构骨架。）', '', '修复要求：按原始任务输入重建正文，并补足【正文交接】账本；不要把缺失骨架降级为丢弃段落结构。')
    }
    const feedback = lines.join('\n')
    return {
      feedback,
      strategy: 'word-gap',
      candidateChars: candidate.length,
      feedbackChars: feedback.length,
      anchorCount: 0,
      previewChars: 0,
      scaffoldChars: scaffold.text.length,
      scaffoldFieldCount: scaffold.fieldCount,
      suppressedCandidateChars: 0
    }
  }

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
    strategy: 'bounded-summary',
    candidateChars: candidate.length,
    feedbackChars: feedback.length,
    anchorCount: anchors.length,
    previewChars,
    scaffoldChars: 0,
    scaffoldFieldCount: 0,
    suppressedCandidateChars: Math.max(0, candidate.length - previewChars),
  }
}
