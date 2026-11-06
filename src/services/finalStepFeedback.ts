export type FinalStepFeedbackSource = 'content_contract' | 'deai' | 'upstream_anchor'

export interface FinalStepFeedbackFinding {
  source: FinalStepFeedbackSource
  label: string
  detail: string
}

export interface FinalStepFeedbackInput {
  errors: string[]
  deaiFindings?: Array<{ code?: string; label?: string; message?: string }>
  upstreamAnchors?: string[]
  maxAnchorChars?: number
  maxAnchors?: number
}

export interface FinalStepFeedbackResult {
  feedback: string
  sourceCounts: Record<FinalStepFeedbackSource, number>
  length: number
  kind?: 'retry' | 'teaching'
}

const DEFAULT_MAX_ANCHORS = 3
const DEFAULT_MAX_ANCHOR_CHARS = 200

function normalizeText(value: string | undefined, fallback: string): string {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || fallback
}

export function buildFinalStepFeedback(input: FinalStepFeedbackInput): FinalStepFeedbackResult {
  const errors = (input.errors || []).filter(Boolean)
  const isEchoFailure = errors.some(error => error.includes('failureKind: chain_output_echo'))
  const deaiFindings = (input.deaiFindings || [])
    .filter(finding => finding && (finding.label || finding.message))
  const normalizedErrors = errors.map(error => error.replace(/\s*failureKind:\s*chain_output_echo\s*/, '').trim()).filter(Boolean)
  const anchors = (input.upstreamAnchors || [])
    .filter(anchor => typeof anchor === 'string' && anchor.trim())
    .map(anchor => anchor.slice(0, Math.max(0, input.maxAnchorChars ?? DEFAULT_MAX_ANCHOR_CHARS)))
    .filter(anchor => anchor.trim())
    .slice(0, Math.max(0, input.maxAnchors ?? DEFAULT_MAX_ANCHORS))

  const sourceCounts: Record<FinalStepFeedbackSource, number> = {
    content_contract: errors.length,
    deai: deaiFindings.length,
    upstream_anchor: anchors.length,
  }

  const lines: string[] = [
    '【终步重试协议】',
    '本反馈只描述失败事实，不携带候选输出全文（终步职责例外：与重试层 candidate-anchored 协议不同）；结构修复基于上游完整输出，表达打磨基于失败事实与锚点。元数据与事实账本由应用维护，你不需要自行补写账本。',
  ]

  lines.push('一、事实与账本约束')
  lines.push('FACT_LOCK 与来源覆盖状态以单独提供的上一步完整输出为权威；允许为满足账本与语言契约调整表达，不得改变事实、事件顺序与场景结果。')

  if (normalizedErrors.length > 0) {
    lines.push('二、内容契约失败项')
    for (const error of normalizedErrors.slice(0, 10)) lines.push(`- ${error}`)
  }

  if (deaiFindings.length > 0) {
    lines.push('三、降AI语言打磨项')
    for (const finding of deaiFindings.slice(0, 10)) {
      lines.push(`- ${normalizeText(finding.label, '语言问题')}：${normalizeText(finding.message, '需按降AI规则修复')}`)
    }
    lines.push('信息无损的相邻短句合并、句号改逗号或分号，属于合法语言打磨，不算结构变更。')
  }

  if (anchors.length > 0) {
    lines.push('四、上游权威锚点')
    for (const anchor of anchors) lines.push(`- ${anchor}`)
  }

  if (isEchoFailure) {
    lines.push('五、回显修复')
    lines.push('不要逐句复述上一步文本；输出仍必须是一份完整的打磨稿。')
  }

  lines.push('输出要求：基于单独提供的上一步完整输出，输出完整打磨稿；不要复述本反馈，不要输出解释。')

  const feedback = lines.join('\n')
  return { feedback, sourceCounts, length: feedback.length }
}
