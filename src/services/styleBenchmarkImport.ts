import type { StyleProfile } from '../stores/project'

export interface StyleRuleDraft {
  id: string
  text: string
  enabled: boolean
}

export interface StyleBenchmarkImportDraft {
  profileVersion: 2
  styleTags: string
  pacingParams: string
  positioning: NonNullable<StyleProfile['positioning']>
  quantitative: NonNullable<StyleProfile['quantitative']>
  voice: NonNullable<StyleProfile['voice']>
  descriptionFocus: NonNullable<StyleProfile['descriptionFocus']>
  sceneTemplates: StyleRuleDraft[]
  sentencePatterns: StyleRuleDraft[]
  positiveRules: StyleRuleDraft[]
  prohibitions: StyleRuleDraft[]
  dailyRules: StyleRuleDraft[]
}

export interface StyleBenchmarkImportReport {
  ok: boolean
  fileName: string
  recognizedSections: string[]
  ignoredSections: string[]
  ignoredLines: string[]
  truncations: string[]
  errors: string[]
  draft: StyleBenchmarkImportDraft | null
}

const REQUIRED_SECTIONS = ['定位', '声口特征'] as const
const KNOWN_SECTIONS = [
  '定位',
  '量化特征',
  '声口特征',
  '描写侧重',
  '场景写法',
  '标志性句式模式',
  '借鉴边界',
  '日更参考',
] as const
const RULE_TEXT_LIMIT = 240
const RULE_COUNT_LIMIT = 12

function parseSections(source: string): Map<string, string> {
  const sections = new Map<string, string>()
  const pattern = /^##\s+(.+?)\s*$/gm
  let match = pattern.exec(source)
  while (match) {
    const next = pattern.exec(source)
    const body = source.slice(match.index + match[0].length, next ? next.index : source.length)
    sections.set(match[1].trim(), body.trim())
    match = next
  }
  return sections
}

function cleanText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, RULE_TEXT_LIMIT)
}

function stableRuleId(prefix: string, text: string, index: number): string {
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `${prefix}-${(hash >>> 0).toString(36)}-${index + 1}`
}

function makeRule(prefix: string, text: string, index: number): StyleRuleDraft {
  const cleaned = cleanText(text)
  return { id: stableRuleId(prefix, cleaned, index), text: cleaned, enabled: Boolean(cleaned) }
}

function parseBulletedLines(section: string): string[] {
  return section
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !line.startsWith('#'))
    .map(line => line.replace(/^[-*]\s+/, ''))
}

function parseNumberedLines(section: string): string[] {
  return section
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !line.startsWith('#'))
    .map(line => line.replace(/^\d+[.、]\s*/, ''))
}

function parseDefinition(section: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of section.split(/\r?\n/)) {
    const match = line.match(/^\s*[-*]?\s*\*\*(.+?)\*\*\s*[：:]\s*(.+)$/)
    if (match) result[cleanText(match[1])] = cleanText(match[2])
  }
  return result
}

function parseTitledBlocks(section: string): Array<{ title: string; body: string }> {
  const blocks: Array<{ title: string; body: string }> = []
  const pattern = /^###\s+(.+?)\s*$/gm
  let match = pattern.exec(section)
  while (match) {
    const next = pattern.exec(section)
    const body = section.slice(match.index + match[0].length, next ? next.index : section.length).trim()
    blocks.push({ title: cleanText(match[1]), body })
    match = next
  }
  return blocks
}

function parseQuantitative(section: string): {
  sampleSource: string
  dialogueDensityPerKChars: number | null
  sentenceMix: { short: number | null; medium: number | null; long: number | null }
  punctuation: StyleProfile['quantitative'] extends infer Q
    ? Q extends { punctuation: infer P } ? P : never
    : never
} {
  const sourceMatch = section.match(/统计来源[：:]\s*`?([^`\n]+)`?/)
  const sampleSource = cleanText(sourceMatch?.[1] || '')
  const densityMatch = section.match(/对话密度[：:]\s*([0-9]+(?:\.[0-9]+)?)/)
  const dialogueDensityPerKChars = densityMatch ? Number(densityMatch[1]) : null
  const mixMatch = section.match(/短句\s*([0-9]+(?:\.[0-9]+)?)%，\s*中句\s*([0-9]+(?:\.[0-9]+)?)%，\s*长句\s*([0-9]+(?:\.[0-9]+)?)%/)
  const sentenceMix = mixMatch
    ? { short: Number(mixMatch[1]), medium: Number(mixMatch[2]), long: Number(mixMatch[3]) }
    : { short: null, medium: null, long: null }
  const punctuation = {
    comma: numberMatch(section, '逗号'),
    period: numberMatch(section, '句号'),
    exclamation: numberMatch(section, '感叹号'),
    question: numberMatch(section, '问号'),
    ellipsis: numberMatch(section, '省略号'),
    dash: numberMatch(section, '破折号'),
  }
  return { sampleSource, dialogueDensityPerKChars, sentenceMix, punctuation }
}

function numberMatch(section: string, label: string): number {
  const match = section.match(new RegExp(`${label}[：:]\\s*([0-9,]+)`))
  return match ? Number(match[1].replace(/,/g, '')) : 0
}

export function parseStyleBenchmark(fileName: string, source: string): StyleBenchmarkImportReport {
  const sections = parseSections(source)
  const recognizedSections: string[] = []
  const ignoredSections: string[] = []
  const ignoredLines: string[] = []
  const truncations: string[] = []
  const errors: string[] = []

  for (const [title] of sections) {
    if (KNOWN_SECTIONS.includes(title as any)) recognizedSections.push(title)
    else ignoredSections.push(title)
  }
  for (const required of REQUIRED_SECTIONS) {
    if (!sections.get(required)) errors.push(`缺少核心段落：${required}`)
  }
  if (errors.length) {
    return {
      ok: false,
      fileName,
      recognizedSections,
      ignoredSections,
      ignoredLines,
      truncations,
      errors,
      draft: null,
    }
  }

  const positioningMap = parseDefinition(sections.get('定位') || '')
  const voiceMap = parseDefinition(sections.get('声口特征') || '')
  const descriptionMap = parseDefinition(sections.get('描写侧重') || '')
  const quantitative = parseQuantitative(sections.get('量化特征') || '')

  const sceneBlocks = parseTitledBlocks(sections.get('场景写法') || '')
  const patternLines = parseNumberedLines(sections.get('标志性句式模式') || '')
  const boundaryBlocks = parseTitledBlocks(sections.get('借鉴边界') || '')
  const positiveSection = boundaryBlocks.find(block => block.title === '值得学')?.body || ''
  const warningSection = boundaryBlocks.find(block => block.title === '需警惕')?.body || ''
  const positiveLines = parseBulletedLines(positiveSection)
  const warningLines = parseBulletedLines(warningSection)
  const dailyLines = parseNumberedLines(sections.get('日更参考') || '')

  const withLimits = (prefix: string, lines: string[]): StyleRuleDraft[] => {
    if (lines.length > RULE_COUNT_LIMIT) {
      truncations.push(`${prefix}超过${RULE_COUNT_LIMIT}条，仅保留前${RULE_COUNT_LIMIT}条`)
      lines = lines.slice(0, RULE_COUNT_LIMIT)
    }
    return lines.map((line, index) => makeRule(prefix, line, index)).filter(rule => rule.text)
  }

  const coreTemperament = (positioningMap['核心气质'] || '').split(/[、,，+]/).map(cleanText).filter(Boolean)
  const genreTags = (positioningMap['风格标签'] || '')
    .replace(/[。．.!]+$/, '')
    .split(/[、,，+]/)
    .map(cleanText)
    .filter(Boolean)
  const styleTags = genreTags.join(', ')
  const pacingParts: string[] = []
  if (quantitative.dialogueDensityPerKChars != null) pacingParts.push(`对话密度:${quantitative.dialogueDensityPerKChars.toFixed(2)}段/千字`)
  if (quantitative.sentenceMix.short != null) {
    pacingParts.push(`句长:短${quantitative.sentenceMix.short.toFixed(1)}%/中${quantitative.sentenceMix.medium?.toFixed(1) || '?'}%/长${quantitative.sentenceMix.long?.toFixed(1) || '?'}%`)
  }

  const draft: StyleBenchmarkImportDraft = {
    profileVersion: 2,
    styleTags,
    pacingParams: pacingParts.join(', '),
    positioning: {
      coreTemperament,
      genreTags,
      oneLinePositioning: cleanText(positioningMap['一句话定位'] || ''),
    },
    quantitative: {
      sampleSource: quantitative.sampleSource,
      dialogueDensityPerKChars: quantitative.dialogueDensityPerKChars,
      sentenceMix: quantitative.sentenceMix.short == null
        ? null
        : {
          short: quantitative.sentenceMix.short,
          medium: quantitative.sentenceMix.medium ?? 0,
          long: quantitative.sentenceMix.long ?? 0,
        },
      punctuation: quantitative.punctuation,
    },
    voice: {
      protagonistSpeech: cleanText(voiceMap['主角说话方式'] || ''),
      dialogueTags: cleanText(voiceMap['对话标签'] || ''),
      subtextDensity: cleanText(voiceMap['潜台词密度'] || ''),
    },
    descriptionFocus: {
      senses: cleanText(descriptionMap['五感'] || ''),
      sketch: cleanText(descriptionMap['白描 vs 渲染'] || descriptionMap['白描vs渲染'] || ''),
      psychology: cleanText(descriptionMap['心理外化'] || ''),
    },
    sceneTemplates: withLimits('scene', sceneBlocks.map(block => `${block.title}：${block.body}`)),
    sentencePatterns: withLimits('pattern', patternLines),
    positiveRules: withLimits('positive', positiveLines),
    prohibitions: withLimits('warn', warningLines),
    dailyRules: withLimits('daily', dailyLines),
  }

  if (!draft.sceneTemplates.length) errors.push('场景写法为空或未使用三级标题')
  if (!draft.sentencePatterns.length) errors.push('标志性句式模式为空')
  if (!draft.prohibitions.length) errors.push('借鉴边界缺少“需警惕”条目')
  if (!draft.dailyRules.length) errors.push('日更参考为空')
  if (errors.length) {
    return {
      ok: false,
      fileName,
      recognizedSections,
      ignoredSections,
      ignoredLines,
      truncations,
      errors,
      draft,
    }
  }

  return {
    ok: true,
    fileName,
    recognizedSections,
    ignoredSections,
    ignoredLines,
    truncations,
    errors,
    draft,
  }
}
