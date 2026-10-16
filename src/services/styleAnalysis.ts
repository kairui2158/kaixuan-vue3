import type { StyleProfile } from '../stores/project'
import { extractJsonObject } from './jsonExtraction'

export interface StyleAnalysisRuleDraft {
  id: string
  text: string
  enabled: boolean
}

export interface StyleAnalysisDraft {
  profileVersion: 2
  styleTags: string
  pacingParams: string
  positioning: NonNullable<StyleProfile['positioning']>
  positiveRules: StyleAnalysisRuleDraft[]
}

export interface StyleAnalysisReport {
  ok: boolean
  errors: string[]
  insufficientEvidenceFields: string[]
  ignoredFields: string[]
  draft: StyleAnalysisDraft | null
}

export interface StyleAnalysisRequestPayload {
  sourceId: string
  host: 'outline' | 'pipeline'
  mode: 'analysis'
}

export interface StyleAnalysisResultPayload {
  sourceId: string
  host: 'outline' | 'pipeline'
  report: StyleAnalysisReport
}

export const STYLE_ANALYSIS_SYSTEM_PROMPT =
  '你是小说风格分析专家。大纲是情节产物，不是正文样品。只允许根据大纲证据返回 JSON：'
  + '{"positioning":{"coreTemperament":["..."],"genreTags":["..."],"oneLinePositioning":"..."},'
  + '"styleTags":"逗号分隔风格标签","pacingParams":"节奏参数描述","positiveRules":["可执行正向规则"]}'

export function buildStyleAnalysisUserPrompt(outlineText: string): string {
  return '请分析以下小说大纲的风格定位与节奏特征。只返回上述 JSON 对象，不要输出解释。'
    + '证据不足以判断的字段必须返回空值，禁止虚构声口、句式、场景、日更规则或警戒线。\n\n大纲：\n'
    + outlineText
}

const RULE_TEXT_LIMIT = 240
const RULE_COUNT_LIMIT = 12
const EVIDENCE_BOUND_FIELDS = [
  'voice',
  'sentencePatterns',
  'sceneTemplates',
  'dailyRules',
  'prohibitions',
] as const

function cleanText(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, RULE_TEXT_LIMIT)
    : ''
}

function cleanTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map(item => cleanText(item))
    .filter(Boolean)
    .slice(0, 12)
}

function ruleId(prefix: string, text: string, index: number): string {
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `${prefix}-${(hash >>> 0).toString(36)}-${index + 1}`
}

function cleanRules(value: unknown): StyleAnalysisRuleDraft[] {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, RULE_COUNT_LIMIT)
    .map(item => cleanText(item))
    .filter(Boolean)
    .map((text, index) => ({ id: ruleId('style', text, index), text, enabled: true }))
}

export function parseStyleAnalysis(rawText: string): StyleAnalysisReport {
  const errors: string[] = []
  const ignoredFields: string[] = []
  let data: Record<string, unknown> | null = null
  try {
    data = extractJsonObject(rawText)
  } catch {
    data = null
  }
  if (!data) {
    return {
      ok: false,
      errors: ['模型未返回可解析的 JSON 对象'],
      insufficientEvidenceFields: [...EVIDENCE_BOUND_FIELDS],
      ignoredFields,
      draft: null,
    }
  }

  for (const field of EVIDENCE_BOUND_FIELDS) {
    if (data[field] !== undefined) ignoredFields.push(field)
  }
  const positioningInput = data.positioning
  const positioning = {
    coreTemperament: cleanTags(
      positioningInput && typeof positioningInput === 'object'
        ? (positioningInput as Record<string, unknown>).coreTemperament
        : undefined,
    ),
    genreTags: cleanTags(
      positioningInput && typeof positioningInput === 'object'
        ? (positioningInput as Record<string, unknown>).genreTags
        : undefined,
    ),
    oneLinePositioning: cleanText(
      positioningInput && typeof positioningInput === 'object'
        ? (positioningInput as Record<string, unknown>).oneLinePositioning
        : undefined,
    ),
  }
  const styleTags = cleanText(data.styleTags || data.style)
  const pacingParams = cleanText(data.pacingParams || data.pacing)
  const positiveRules = cleanRules(data.positiveRules)

  if (!styleTags && !pacingParams && !positioning.oneLinePositioning && positiveRules.length === 0) {
    errors.push('结构化分析结果为空：styleTags、pacingParams、positioning.oneLinePositioning、positiveRules 均未返回')
  }

  return {
    ok: errors.length === 0,
    errors,
    insufficientEvidenceFields: [...EVIDENCE_BOUND_FIELDS],
    ignoredFields,
    draft: errors.length
      ? null
      : {
        profileVersion: 2,
        styleTags,
        pacingParams,
        positioning,
        positiveRules,
      },
  }
}
