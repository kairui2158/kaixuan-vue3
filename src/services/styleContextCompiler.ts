import type { StyleProfile, StyleRule } from '../stores/project'

export type StyleContextTarget = 'outline' | 'settings' | 'volume' | 'chapter' | 'body' | 'final-draft'

export interface StyleProfileEffectiveLike {
  profileVersion?: 1 | 2
  locked?: boolean
  injected?: boolean
  styleTags?: string
  pacingParams?: string
  positioning?: StyleProfile['positioning']
  quantitative?: StyleProfile['quantitative']
  voice?: StyleProfile['voice']
  descriptionFocus?: StyleProfile['descriptionFocus']
  sceneTemplates?: StyleRule[]
  sentencePatterns?: StyleRule[]
  positiveRules?: StyleRule[]
  prohibitions?: StyleRule[]
  dailyRules?: StyleRule[]
}

export interface StyleContextCompilation {
  text: string
  injectedChars: number
  truncated: boolean
  truncationReason: string | null
  sections: StyleContextSectionCount[]
}

export interface StyleContextSectionCount {
  section: string
  entries: number
}

export const STYLE_CONTEXT_BUDGETS: Record<StyleContextTarget, number> = {
  outline: 600,
  settings: 500,
  volume: 600,
  chapter: 800,
  body: 1200,
  'final-draft': 1200,
}

const TRUNCATION_PRIORITY: Record<StyleContextTarget, Array<keyof StyleBlockCandidates>> = {
  outline: ['prohibitions', 'dailyRules', 'quantitative', 'sentencePatterns', 'sceneTemplates'],
  settings: ['prohibitions', 'dailyRules', 'quantitative', 'sentencePatterns', 'sceneTemplates'],
  volume: ['prohibitions', 'dailyRules', 'quantitative', 'sentencePatterns', 'sceneTemplates', 'positiveRules'],
  chapter: ['prohibitions', 'dailyRules', 'quantitative', 'sceneTemplates'],
  body: ['prohibitions', 'dailyRules', 'quantitative', 'sentencePatterns', 'sceneTemplates'],
  'final-draft': ['prohibitions', 'dailyRules', 'quantitative', 'sentencePatterns', 'sceneTemplates'],
}

type StyleBlockCandidates = Pick<
  StyleProfileEffectiveLike,
  | 'prohibitions'
  | 'dailyRules'
  | 'quantitative'
  | 'sentencePatterns'
  | 'sceneTemplates'
  | 'positiveRules'
>

function enabledRules(rules: StyleRule[] | undefined): StyleRule[] {
  return (rules || []).filter(rule => rule.enabled && rule.text.trim())
}

function rulesText(rules: StyleRule[]): string {
  return rules.map(rule => `- ${rule.text}`).join('\n')
}

function positioningLines(style: StyleProfileEffectiveLike): string[] {
  const lines: string[] = []
  const temperament = (style.positioning?.coreTemperament || []).filter(Boolean)
  const genreTags = (style.positioning?.genreTags || []).filter(Boolean)
  if (temperament.length) lines.push('核心气质：' + temperament.join('、'))
  if (genreTags.length) lines.push('风格标签：' + genreTags.join('、'))
  if (style.positioning?.oneLinePositioning) lines.push('一句话定位：' + style.positioning.oneLinePositioning)
  return lines
}

function quantitativeLine(style: StyleProfileEffectiveLike): string | null {
  const q = style.quantitative
  if (!q) return null
  const parts: string[] = []
  if (q.sampleSource) parts.push('样本=' + q.sampleSource)
  if (q.dialogueDensityPerKChars != null) parts.push(`对话密度=${q.dialogueDensityPerKChars.toFixed(2)}段/千字`)
  if (q.sentenceMix) {
    const mix = q.sentenceMix
    const rendered = [
      mix.short != null ? `短${mix.short.toFixed(1)}%` : null,
      mix.medium != null ? `中${mix.medium.toFixed(1)}%` : null,
      mix.long != null ? `长${mix.long.toFixed(1)}%` : null,
    ].filter(Boolean)
    if (rendered.length) parts.push('句长=' + rendered.join('/'))
  }
  if (q.punctuation) {
    const p = q.punctuation
    parts.push(`标点/千字=逗号${p.comma} 句号${p.period} 感叹${p.exclamation} 问号${p.question} 省略${p.ellipsis} 破折${p.dash}`)
  }
  return parts.length ? parts.join('；') : null
}

function voiceLines(style: StyleProfileEffectiveLike): string[] {
  const voice = style.voice
  if (!voice) return []
  return [
    voice.protagonistSpeech ? '主角声口：' + voice.protagonistSpeech : null,
    voice.dialogueTags ? '对话标签：' + voice.dialogueTags : null,
    voice.subtextDensity ? '潜台词：' + voice.subtextDensity : null,
  ].filter((line): line is string => Boolean(line))
}

function descriptionLines(style: StyleProfileEffectiveLike): string[] {
  const focus = style.descriptionFocus
  if (!focus) return []
  return [
    focus.senses ? '五感：' + focus.senses : null,
    focus.sketch ? '白描：' + focus.sketch : null,
    focus.psychology ? '心理外化：' + focus.psychology : null,
  ].filter((line): line is string => Boolean(line))
}

function v1Block(style: StyleProfileEffectiveLike): string | null {
  const lines = [
    style.styleTags ? '风格标签：' + style.styleTags : null,
    style.pacingParams ? '节奏参数：' + style.pacingParams : null,
  ].filter((line): line is string => Boolean(line))
  return lines.length ? lines.join('\n') : null
}

function renderBlock(blocks: Array<[string, string | null]>): string {
  return blocks
    .filter(([, body]) => Boolean(body && body.trim()))
    .map(([title, body]) => `[${title}]\n${body}`)
    .join('\n')
}

function shouldInclude(target: StyleContextTarget, section: string): boolean {
  if (target === 'outline') {
    return ['定位', 'V1兼容', '警戒线'].includes(section)
  }
  if (target === 'settings') return ['定位', '场景写法'].includes(section)
  if (target === 'volume') return ['定位', '正向规则'].includes(section)
  if (target === 'chapter') return ['定位', '声口', '句式模式', '日更规则'].includes(section)
  return ['定位', '声口', '句式模式', '场景写法', '日更规则', '警戒线'].includes(section)
}

export function compileStyleContext(
  target: StyleContextTarget,
  style: StyleProfileEffectiveLike,
): StyleContextCompilation {
  const budget = STYLE_CONTEXT_BUDGETS[target]
  if (!style || !style.locked || !style.injected) {
    return { text: '', injectedChars: 0, truncated: false, truncationReason: null, sections: [] }
  }
  if (style.profileVersion !== 2) {
    const text = v1Block(style) || ''
    return {
      text,
      injectedChars: text.length,
      truncated: text.length > budget,
      truncationReason: text.length > budget ? 'v1_profile_exceeds_budget' : null,
      sections: text ? [{ section: 'V1兼容', entries: 1 }] : [],
    }
  }

  const candidates: StyleBlockCandidates = {
    prohibitions: enabledRules(style.prohibitions),
    dailyRules: enabledRules(style.dailyRules),
    quantitative: style.quantitative,
    sentencePatterns: enabledRules(style.sentencePatterns),
    sceneTemplates: enabledRules(style.sceneTemplates),
    positiveRules: enabledRules(style.positiveRules),
  }
  const removed: string[] = []
  const buildBlocks = (): Array<[string, string | null]> => {
    const blocks: Array<[string, string | null]> = []
    const add = (title: string, body: string | null) => {
      if (shouldInclude(target, title)) blocks.push([title, body])
    }
    add('定位', renderBody([
      ...positioningLines(style),
      style.styleTags ? '风格标签：' + style.styleTags : null,
      style.pacingParams ? '节奏参数：' + style.pacingParams : null,
    ]))
    add('声口', renderBody(voiceLines(style)))
    add('句式模式', renderBody([rulesText(candidates.sentencePatterns as StyleRule[])]))
    add('场景写法', renderBody([rulesText(candidates.sceneTemplates as StyleRule[])]))
    add('正向规则', renderBody([rulesText(candidates.positiveRules as StyleRule[])]))
    add('日更规则', renderBody([rulesText(candidates.dailyRules as StyleRule[])]))
    add('警戒线', renderBody([rulesText(candidates.prohibitions as StyleRule[])]))
    add('量化', renderBody([quantitativeLine(style)]))
    return blocks
  }

  let rendered = renderBlock(buildBlocks())
  for (const sectionKey of [...TRUNCATION_PRIORITY[target]].reverse()) {
    if (rendered.length <= budget) break
    if (sectionKey === 'quantitative') {
      if (style.quantitative) removed.push('量化')
      ;(candidates as any).quantitative = undefined
    } else {
      const rules = candidates[sectionKey] as StyleRule[]
      if (!rules || rules.length === 0) continue
      removed.push(sectionTitle(sectionKey))
      ;(candidates as any)[sectionKey] = []
    }
    rendered = renderBlock(buildBlocks())
  }
  if (rendered.length > budget) {
    rendered = rendered.slice(0, budget)
  }
  const truncationReason = removed.length ? `${target}_budget_trim:${removed.join(',')}` : null
  const sections = buildBlocks()
    .filter(([, body]) => Boolean(body && body.trim()))
    .map(([title, body]) => ({
      section: title,
      entries: title === '量化' ? 1 : String(body || '').split('\n').length,
    }))
  return {
    text: rendered,
    injectedChars: rendered.length,
    truncated: Boolean(removed.length),
    truncationReason,
    sections,
  }
}

function renderBody(lines: Array<string | null | undefined>): string | null {
  const filtered = (lines || []).filter((line): line is string => Boolean(line && line.trim()))
  return filtered.length ? filtered.join('\n') : null
}

function sectionTitle(key: keyof StyleBlockCandidates): string {
  if (key === 'prohibitions') return '警戒线'
  if (key === 'dailyRules') return '日更规则'
  if (key === 'sentencePatterns') return '句式模式'
  if (key === 'sceneTemplates') return '场景写法'
  if (key === 'positiveRules') return '正向规则'
  return '量化'
}
