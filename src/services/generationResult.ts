import { filterThinkingTags } from './aiService'

export type GenerationStatus = 'success' | 'failed' | 'fallback'

export interface GenerationMetadata {
  sourceRefs?: string[]
  coveredItems?: string[]
  status?: GenerationStatus
  runId?: string
  reports?: unknown[]
  extractedMeta?: string[]
  [key: string]: unknown
}

export interface GenerationResult {
  body: string
  metadata: GenerationMetadata
  rawText: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseJsonEnvelope(text: string): Record<string, unknown> | null {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  const candidate = fenced ? fenced[1].trim() : trimmed
  try {
    const value: unknown = JSON.parse(candidate)
    return isRecord(value) ? value : null
  } catch {
    return null
  }
}

// Legacy plain-text outputs append machine-facing sections like 【来源覆盖】
// after the prose. Only a line-start heading from this whitelist opens a
// metadata section, so bracketed words inside sentences stay untouched.
const META_SECTION_HEADERS = [
  '【来源覆盖】',
  '【状态变化】',
  '【交接清单】',
  '【交接状态】',
  '【正文交接】',
  '【输出末尾元数据】'
] as const

function findMetaSectionHeading(line: string): string | null {
  const trimmed = line.trimStart()
  const header = META_SECTION_HEADERS.find((candidate) => trimmed.startsWith(candidate))
  return header ? trimmed : null
}

function isMetaSectionEnd(line: string): boolean {
  return /^【[^】]+结束】\s*$/.test(line.trim())
}

function splitLegacyMetadataSections(text: string): { body: string; sections: string[] } {
  const bodyLines: string[] = []
  const sections: string[] = []
  let current: string[] | null = null
  for (const line of String(text || '').split(/\r?\n/)) {
    const heading = findMetaSectionHeading(line)
    if (heading) {
      if (current) sections.push(current.join('\n').trim())
      current = [heading.trimEnd()]
      continue
    }
    if (current) {
      current.push(line)
      if (isMetaSectionEnd(line)) {
        sections.push(current.join('\n').trim())
        current = null
      }
      continue
    }
    bodyLines.push(line)
  }
  if (current) sections.push(current.join('\n').trim())
  return { body: bodyLines.join('\n').trim(), sections }
}

/** Split an optional generation envelope without deleting ordinary prose markers. */
export function parseGenerationResult(text: string): GenerationResult {
  const rawText = String(text || '')
  const envelope = parseJsonEnvelope(rawText)
  if (!envelope || typeof envelope.body !== 'string') {
    const split = splitLegacyMetadataSections(filterThinkingTags(rawText))
    return {
      body: split.body,
      metadata: split.sections.length ? { extractedMeta: split.sections } : {},
      rawText
    }
  }

  const metadata = isRecord(envelope.metadata) ? { ...envelope.metadata } : {}
  const split = splitLegacyMetadataSections(filterThinkingTags(envelope.body))
  if (split.sections.length) {
    const existing = Array.isArray(metadata.extractedMeta) ? metadata.extractedMeta : []
    metadata.extractedMeta = [...existing, ...split.sections]
  }
  return {
    body: split.body,
    metadata,
    rawText
  }
}
