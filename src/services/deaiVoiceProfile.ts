import type { StyleProfileEffectiveLike } from './styleContextCompiler'
import type { StyleRule } from '../stores/project'
import { findDeaiSharedTopicConflicts } from './deaiSharedTopics'

export interface DeAiVoiceProfileSection {
  section: '声纹' | '场景写法' | '量化' | '正向规则' | '警戒线'
  entries: number
}

export interface DeAiVoiceProfile {
  enabled: boolean
  source: 'style-profile'
  profileVersion: 1 | 2
  voice: string[]
  descriptionFocus: string[]
  quantitative: string | null
  positiveRules: string[]
  prohibitions: string[]
  text: string
  injectedChars: number
  truncated: boolean
  truncationReason: string | null
  sections: DeAiVoiceProfileSection[]
  conflicts: DeAiVoiceProfileConflict[]
}

export interface DeAiVoiceProfileConflict {
  key: string
  topic: string
  profileTerms: string[]
}

export const DEAI_VOICE_PROFILE_BUDGET = 700

function enabledRuleText(rules: StyleRule[] | undefined): string[] {
  return (rules || [])
    .filter(rule => rule.enabled && rule.text.trim())
    .map(rule => `- ${rule.text.trim()}`)
}

function truthy(lines: Array<string | null | undefined>): string[] {
  return (lines || []).filter((line): line is string => Boolean(line && line.trim()))
}

function quantitativeLine(style: StyleProfileEffectiveLike): string | null {
  const q = style.quantitative
  if (!q) return null
  const parts: string[] = []
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
  return parts.length ? parts.join('；') : null
}

function detectConflicts(text: string): DeAiVoiceProfileConflict[] {
  return findDeaiSharedTopicConflicts(text).map(topic => ({
    key: topic.key,
    topic: topic.topic,
    profileTerms: topic.terms,
  }))
}

export function buildDeaiVoiceProfile(
  style: StyleProfileEffectiveLike | null | undefined,
): DeAiVoiceProfile | null {
  if (!style || !style.locked || !style.injected) return null

  const voice = truthy([
    style.voice?.protagonistSpeech ? '主角声口：' + style.voice.protagonistSpeech : null,
    style.voice?.dialogueTags ? '对话标签：' + style.voice.dialogueTags : null,
    style.voice?.subtextDensity ? '潜台词：' + style.voice.subtextDensity : null,
    style.styleTags ? '风格标签：' + style.styleTags : null,
    style.pacingParams ? '节奏参数：' + style.pacingParams : null,
  ])
  const descriptionFocus = truthy([
    style.descriptionFocus?.senses ? '五感：' + style.descriptionFocus.senses : null,
    style.descriptionFocus?.sketch ? '白描：' + style.descriptionFocus.sketch : null,
    style.descriptionFocus?.psychology ? '心理外化：' + style.descriptionFocus.psychology : null,
  ])
  const positiveRules = enabledRuleText(style.positiveRules)
  const prohibitions = enabledRuleText(style.prohibitions)
  const quantitative = quantitativeLine(style)

  const blocks: Array<[DeAiVoiceProfileSection['section'], string[]]> = [
    ['声纹', voice],
    ['场景写法', descriptionFocus],
    ['量化', quantitative ? [quantitative] : []],
    ['正向规则', positiveRules],
    ['警戒线', prohibitions],
  ]
  let rendered = blocks
    .filter(([, lines]) => lines.length > 0)
    .map(([title, lines]) => `[${title}]\n${lines.join('\n')}`)
    .join('\n')

  const truncationPriority: Array<DeAiVoiceProfileSection['section']> = ['量化', '警戒线', '正向规则', '场景写法']
  const removed: string[] = []
  let kept = blocks
  for (const section of truncationPriority) {
    if (rendered.length <= DEAI_VOICE_PROFILE_BUDGET) break
    if (!kept.find(([title]) => title === section)?.[1].length) continue
    removed.push(section)
    kept = kept.map(([title, lines]) => title === section ? [title, []] : [title, lines])
    rendered = kept
      .filter(([, lines]) => lines.length > 0)
      .map(([title, lines]) => `[${title}]\n${lines.join('\n')}`)
      .join('\n')
  }
  let truncated = removed.length > 0
  let truncationReason = removed.length ? `voice_profile_budget_trim:${removed.join(',')}` : null
  if (rendered.length > DEAI_VOICE_PROFILE_BUDGET) {
    rendered = rendered.slice(0, DEAI_VOICE_PROFILE_BUDGET)
    truncated = true
    truncationReason = 'voice_profile_budget_slice'
  }

  const conflicts = detectConflicts(rendered)
  const sections = kept
    .filter(([, lines]) => lines.length > 0)
    .map(([section, lines]) => ({ section, entries: lines.length }))

  return {
    enabled: true,
    source: 'style-profile',
    profileVersion: style.profileVersion === 2 ? 2 : 1,
    voice,
    descriptionFocus,
    quantitative,
    positiveRules,
    prohibitions,
    text: rendered,
    injectedChars: rendered.length,
    truncated,
    truncationReason,
    sections,
    conflicts,
  }
}

export function appendDeaiVoiceProfile(prompt: string, profile: DeAiVoiceProfile | null): string {
  if (!profile || !profile.text) return prompt
  const conflictLine = profile.conflicts.length
    ? `\n声纹重叠主题：${profile.conflicts.map(conflict => conflict.topic).join('、')}。这些主题以作者声纹为准。`
    : ''
  const attachment = [
    '【作者声纹 - 最高风格优先级】',
    profile.text,
    '执行规则：与通用降AI约束重叠时，作者声纹优先；未覆盖的主题继续遵守通用降AI约束。',
    `来源：锁定风格档案；版本：v${profile.profileVersion}${profile.truncated ? `；已压缩：${profile.truncationReason}` : ''}${conflictLine}`,
  ].join('\n')
  return [prompt, attachment].filter(Boolean).join('\n\n')
}

export function buildDeaiVoiceProfileTraceEvent(profile: DeAiVoiceProfile | null): {
  type: string
  level: 'info' | 'warn'
  label: string
  detail: string
} | null {
  if (!profile) return null
  return {
    type: 'deai-voice-profile',
    level: profile.conflicts.length ? 'warn' : 'info',
    label: profile.conflicts.length
      ? '作者声纹已注入并覆盖通用降AI重叠约束'
      : '作者声纹已注入降AI链路',
    detail: JSON.stringify({
      source: profile.source,
      profileVersion: profile.profileVersion,
      injectedChars: profile.injectedChars,
      truncated: profile.truncated,
      truncationReason: profile.truncationReason,
      sections: profile.sections,
      conflicts: profile.conflicts,
    }),
  }
}
