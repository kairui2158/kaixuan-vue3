import { DeAiProcessor } from './de-ai'

export interface DeaiStageFindingInput {
  id: string
  severity?: string
  type: string
  count?: number
  perKilo?: number
  samples?: string[]
}

export interface DeaiStageFinding {
  id: string
  severity: string
  type: string
  sample: string
  position: number
  positionPercent: number
}

export interface DeaiStageDiagnosis {
  findings: DeaiStageFinding[]
  droppedFindingCount: number
  degraded: boolean
  degradedReason?: string
  budgetExceeded: boolean
  durationMs: number
}

export interface DeaiStageGuidanceTraceEvent {
  type: 'deai-stage-guidance'
  level: 'info' | 'warn'
  label: string
  detail: string
}

export interface DeaiStageDiagnosisOptions {
  detect?: (text: string) => { findings?: DeaiStageFindingInput[] }
  maxFindings?: number
  maxChars?: number
  maxSampleChars?: number
  maxConstructionMs?: number
}

type DeaiStageDetector = (text: string) => { findings?: DeaiStageFindingInput[] }

const DEFAULT_MAX_FINDINGS = 6
const DEFAULT_MAX_CHARS = 1200
const DEFAULT_MAX_SAMPLE_CHARS = 120
const DEFAULT_MAX_CONSTRUCTION_MS = 50

function hashGuidance(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `deai-stage-v1:${(hash >>> 0).toString(16).padStart(8, '0')}${text.length.toString(16).padStart(8, '0')}`
}

function extractSampleText(sample: string): string {
  const value = String(sample || '').trim()
  if (!value) return ''
  const match = value.match(/^([^((]+)/)
  return (match ? match[1] : value).trim()
}

function boundSampleText(sample: string, maxSampleChars: number): string {
  const value = String(sample || '').trim()
  return value.length <= maxSampleChars ? value : value.slice(0, maxSampleChars)
}

function resolveFindingPosition(
  body: string,
  sample: string
): { position: number; positionPercent: number } {
  const text = extractSampleText(sample)
  const index = text ? body.indexOf(text) : -1
  const position = index >= 0 ? index : 0
  return {
    position,
    positionPercent: body.length ? Math.floor((position / body.length) * 100) : 0
  }
}

export function buildDeaiStageDiagnosis(
  body: string,
  options: DeaiStageDiagnosisOptions = {}
): DeaiStageDiagnosis {
  const started = performance.now()
  const detect: DeaiStageDetector = options.detect || ((text: string) => DeAiProcessor.detectBody(text, {}))
  const maxConstructionMs = options.maxConstructionMs ?? DEFAULT_MAX_CONSTRUCTION_MS
  try {
    const source = typeof body === 'string' ? body : ''
    const rawFindings: DeaiStageFindingInput[] = detect(source)?.findings || []
    const maxFindings = options.maxFindings ?? DEFAULT_MAX_FINDINGS
    const maxSampleChars = options.maxSampleChars ?? DEFAULT_MAX_SAMPLE_CHARS
    const budgetExceeded = performance.now() - started > maxConstructionMs
    const findings = rawFindings
      .map((finding: DeaiStageFindingInput) => {
        const sample = boundSampleText(String(finding.samples?.[0] || ''), maxSampleChars)
        const { position, positionPercent } = resolveFindingPosition(source, sample)
        return {
          id: finding.id,
          severity: finding.severity || 'advisory',
          type: finding.type,
          sample,
          position,
          positionPercent
        }
      })
      .filter((finding: DeaiStageFinding) => finding.id && finding.type)
      .slice(0, Math.max(0, maxFindings))

    return {
      findings,
      droppedFindingCount: Math.max(0, rawFindings.length - findings.length),
      degraded: false,
      budgetExceeded,
      durationMs: performance.now() - started
    }
  } catch (error) {
    return {
      findings: [],
      droppedFindingCount: 0,
      degraded: true,
      degradedReason: error instanceof Error ? error.message : String(error),
      budgetExceeded: false,
      durationMs: performance.now() - started
    }
  }
}

export function formatDeaiStageGuidance(
  diagnosis: DeaiStageDiagnosis,
  options: { maxChars?: number } = {}
): string {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS
  if (!diagnosis.findings.length) return ''
  const lines = [
    '【S2诊断情报（有界，不改稿）】',
    ...diagnosis.findings.map((finding, index) =>
      `${index + 1}. 位置 ${finding.positionPercent}%：${finding.type}（${finding.sample}）`)
  ]
  if (diagnosis.droppedFindingCount > 0) {
    lines.push(`另有 ${diagnosis.droppedFindingCount} 条诊断因预算省略。`)
  }
  let text = lines.join('\n')
  if (text.length > maxChars) text = `${text.slice(0, maxChars)}`
  return text
}

export function buildDeaiStageGuidanceTraceEvent(
  diagnosis: DeaiStageDiagnosis,
  guidance: string,
  context: {
    step: number
    sourceSkillIndex: number
    targetSkillIndex: number
    totalSkillCount: number
  }
): DeaiStageGuidanceTraceEvent {
  return {
    type: 'deai-stage-guidance',
    level: diagnosis.degraded || diagnosis.budgetExceeded || diagnosis.droppedFindingCount > 0 ? 'warn' : 'info',
    label: guidance
      ? `S2 后降AI位置诊断已注入 S3：${diagnosis.findings.length}条 / ${guidance.length}字符`
      : `S2 后降AI位置诊断已执行：0条 / 未注入`,
    detail: JSON.stringify({
      step: context.step,
      sourceSkillIndex: context.sourceSkillIndex,
      targetSkillIndex: context.targetSkillIndex,
      totalSkillCount: context.totalSkillCount,
      findingCount: diagnosis.findings.length,
      injected: guidance.length > 0,
      droppedFindingCount: diagnosis.droppedFindingCount,
      guidanceChars: guidance.length,
      durationMs: diagnosis.durationMs,
      degraded: diagnosis.degraded,
      degradedReason: diagnosis.degradedReason || null,
      budgetExceeded: diagnosis.budgetExceeded,
      hash: hashGuidance(guidance),
      target: 'next_step_user_prompt'
    })
  }
}
