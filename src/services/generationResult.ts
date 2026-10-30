import { filterThinkingTags } from './aiService'
import { splitLegacyMetadataSections } from './legacyMetadataSections'

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
