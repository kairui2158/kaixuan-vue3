import { fnv1a32Hash } from './settingsProjection'
import type { StyleProfileEffectiveLike } from './styleContextCompiler'
import type { RunTraceEventLevel } from '../stores/runTrace'
import type { SettingsProjection } from './settingsProjection'

export type StyleArbiterLayer = 'volume' | 'chapter' | 'body'

export interface StyleArbiterInput {
  layer: StyleArbiterLayer
  profileStyleText: string
  settingsStyleLines: string[]
  profile: StyleProfileEffectiveLike
}

export interface StyleArbiterResult {
  text: string
  sources: {
    profileStyle: boolean
    settingsStyle: boolean
  }
  duplicateLineCount: number
  conflictLineCount: number
  profileHash: string
  settingsHash: string
  lines: string[]
}

const LAYER_LABEL: Record<StyleArbiterLayer, string> = {
  volume: '[风格指令]',
  chapter: '[风格指令]',
  body: '[风格指令]',
}

function normalizeStyleLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function splitStyleLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*(?:[-*•]\s*)?/, '').trim())
    .map(line => line.replace(/^\[[^\]]+\]\s*/, '').trim())
    .filter(Boolean)
}

function normalizeForDuplicate(value: string): string {
  const normalized = normalizeStyleLine(value)
  const comparable = normalized.includes('：')
    ? normalized.slice(normalized.indexOf('：') + 1)
    : normalized
  return comparable.replace(/[。；;，,]$/g, '').trim().toLowerCase()
}

function normalizeForConflict(value: string): string {
  return normalizeForDuplicate(value).replace(/[：:]/g, '')
}

function conflictPair(a: string, b: string): boolean {
  const opposition = [
    ['冷峻', '幽默'], ['克制', '话痨'], ['快节奏', '慢节奏'],
    ['紧张', '轻松'], ['严肃', '戏谑'], ['华丽', '朴素'],
    ['繁复', '简洁'], ['密集', '疏朗'], ['热烈', '冷淡'],
  ]
  return opposition.some(([left, right]) =>
    (a.includes(left) && b.includes(right)) || (a.includes(right) && b.includes(left)))
}

export function arbitratePipelineStyle(input: StyleArbiterInput): StyleArbiterResult {
  const profileLines = splitStyleLines(input.profileStyleText)
  const settingsLines = input.settingsStyleLines.map(normalizeStyleLine).filter(Boolean)
  const profileNormalized = new Set(profileLines.map(normalizeForDuplicate))

  const lines: string[] = []
  let duplicateLineCount = 0
  let conflictLineCount = 0

  for (const line of profileLines) {
    lines.push(line)
  }
  for (const line of settingsLines) {
    const duplicateKey = normalizeForDuplicate(line)
    if (profileNormalized.has(duplicateKey)) {
      duplicateLineCount += 1
      continue
    }
    const conflictsWithProfile = profileLines.some(profileLine =>
      conflictPair(normalizeForConflict(line), normalizeForConflict(profileLine)))
    if (conflictsWithProfile) {
      conflictLineCount += 1
      lines.push(`${line}（主题基调；若与上方风格指令冲突，以风格指令为准）`)
      continue
    }
    lines.push(line)
  }

  const text = lines.length
    ? [
      LAYER_LABEL[input.layer],
      ...lines,
      '优先级：风格档案指令优先；下方主题基调仅补充人物与剧情表达，不得覆盖风格档案。',
    ].join('\n')
    : ''

  return {
    text,
    sources: {
      profileStyle: profileLines.length > 0,
      settingsStyle: settingsLines.length > 0,
    },
    duplicateLineCount,
    conflictLineCount,
    profileHash: fnv1a32Hash(profileLines.join('\n')),
    settingsHash: fnv1a32Hash(settingsLines.join('\n')),
    lines,
  }
}

export function settingsStyleLines(projection: SettingsProjection): string[] {
  const block = projection.blocks.find(item => item.semanticCategory === 'style')
  return block ? block.lines : []
}

export function withoutSettingsStyleText(projection: SettingsProjection): string {
  const styleLines = settingsStyleLines(projection)
  if (!styleLines.length) return projection.text
  const styleLineSet = new Set(styleLines)
  const output: string[] = []
  let inStyleSection = false
  for (const line of projection.text.split(/\r?\n/)) {
    if (line.startsWith('[') && line.endsWith(']')) {
      inStyleSection = false
    }
    if (inStyleSection) continue
    if (styleLineSet.has(line)) {
      inStyleSection = true
      if (output.length && output[output.length - 1].startsWith('[') && output[output.length - 1].endsWith(']')) {
        output.pop()
      }
      continue
    }
    if (line.trim()) output.push(line)
  }
  return output.join('\n')
}

export function buildStyleSemanticsTraceEvent(
  layer: StyleArbiterLayer,
  result: StyleArbiterResult,
  settingsProjection: SettingsProjection
): { type: string; level: RunTraceEventLevel; label: string; detail: string } {
  return {
    type: 'style-semantics-merged',
    level: result.conflictLineCount > 0 ? 'warn' : 'info',
    label: result.conflictLineCount > 0
      ? '风格语义已仲裁：存在设定卡与风格档案冲突'
      : '风格语义已仲裁合并',
    detail: JSON.stringify({
      layer,
      sources: result.sources,
      profileHash: result.profileHash,
      settingsHash: result.settingsHash,
      duplicateLineCount: result.duplicateLineCount,
      conflictLineCount: result.conflictLineCount,
      settingsProjectionHash: settingsProjection.contentHash
    })
  }
}
