/**
 * Chain Handoff Protocol (warn-only phase).
 *
 * The application layer never "picks" important text semantically. Accuracy
 * comes from three deterministic layers: the SKILL's declared consumption
 * contract (field names), structured extraction of declared keys/sections,
 * and a full-text archive + read tool as the fallback information source.
 */

import { extractJsonObject } from './jsonExtraction'

export type ChainHandoffDelivery =
  | 'full_text'
  | 'canonical_excerpt'
  | 'structured_summary'

export interface ChainHandoffStructuredSummary {
  purpose?: string
  facts?: string[]
  constraints?: string[]
  artifacts?: string[]
  openQuestions?: string[]
}

export interface ChainHandoffArtifact {
  artifactId: string
  sourceStep: number
  sourceSkillId: string
  outputHash: string
  fullTextLength: number
  delivery: ChainHandoffDelivery
  canonicalExcerpt?: string
  structuredSummary?: ChainHandoffStructuredSummary
  declaredFields?: Record<string, string>
  requiresFullPreviousOutput: boolean
  repeatedHashCount: number
}

export interface ChainHandoffTemplateMeta {
  chainHandoff?: {
  requiresFullPreviousOutput?: boolean
    /** Step role used by pipeline contracts (for example `generator`, `polish`). */
    role?: 'generator' | 'polish' | 'analysis'
    /** Folder pass input=previous should also keep the declared upstream chain context. */
    requiresFullUpstreamContext?: boolean
    previousOutput?: 'full' | 'excerpt' | 'structured'
    requires?: string[]
    /** Why a full previous-output handoff is necessary. */
    reason?: string
  }
}

export interface ResolveChainPreviousOutputInput {
  previousOutput: string
  templateMeta?: ChainHandoffTemplateMeta | null
  textSkillTemplateReferencesPreviousOutput?: boolean
  excerptLimit?: number
}

export interface ChainHandoffContractMiss {
  reason:
    | 'structured_requires_invalid'
    | 'structured_json_missing'
    | 'structured_fields_missing'
    | 'structured_fields_empty'
    | 'structured_markdown_missing'
  missingFields?: string[]
  declaredMode: 'full' | 'excerpt' | 'structured' | 'default'
}

export interface ResolveChainPreviousOutputResult {
  delivery: ChainHandoffDelivery
  output: string
  contractMiss?: ChainHandoffContractMiss
}

export interface MakeChainHandoffArtifactInput {
  sourceStep: number
  sourceSkillId: string
  output: string
  delivery?: ChainHandoffDelivery
  templateMeta?: ChainHandoffTemplateMeta | null
  structuredSummary?: ChainHandoffStructuredSummary
  previousSeenHashes?: Set<string>
  excerptLimit?: number
}

const DEFAULT_EXCERPT_LIMIT = 2400

function normalizeRequiredFields(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 16) return []
  const fields: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') return []
    const field = item.trim()
    if (!field || field.length > 64) return []
    if (!fields.includes(field)) fields.push(field)
  }
  return fields
}

function fieldToText(value: unknown): string {
  if (typeof value === 'string') return value
  if (value == null) return ''
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return ''
    }
  }
  return String(value)
}

function extractMarkdownSections(text: string, fields: string[]): Map<string, string> {
  const result = new Map<string, string>()
  const lines = text.split(/\r?\n/)
  let currentField: string | null = null
  let currentLines: string[] = []
  const closeCurrent = () => {
    if (currentField) {
      const content = currentLines.join('\n').trim()
      if (!result.has(currentField)) result.set(currentField, content)
    }
  }
  for (const line of lines) {
    const heading = /^#{1,6}\s+(.+?)\s*$/.exec(line)
    if (heading) {
      closeCurrent()
      currentField = heading[1]
      currentLines = []
      continue
    }
    if (currentField) currentLines.push(line)
  }
  closeCurrent()
  void fields
  return result
}

export function resolveChainPreviousOutput(
  input: ResolveChainPreviousOutputInput,
): ResolveChainPreviousOutputResult {
  const fullText = input.previousOutput || ''
  const declared = input.templateMeta?.chainHandoff
  const declaredMode = declared?.previousOutput
  const requires = normalizeRequiredFields(declared?.requires)
  const excerptLimit = Math.max(0, input.excerptLimit ?? DEFAULT_EXCERPT_LIMIT)
  const fullResult: ResolveChainPreviousOutputResult = {
    delivery: 'full_text',
    output: fullText,
  }

  if (declared?.requiresFullPreviousOutput === true || declaredMode === 'full') {
    return fullResult
  }

  if (!declaredMode && input.textSkillTemplateReferencesPreviousOutput) {
    return fullResult
  }

  if (declaredMode === 'excerpt') {
    const excerpt = excerptLimit > 0 && fullText.length > excerptLimit
      ? fullText.slice(0, excerptLimit)
      : fullText
    return { delivery: 'canonical_excerpt', output: excerpt }
  }

  if (declaredMode !== 'structured') {
    return fullResult
  }

  if (!requires.length) {
    return {
      ...fullResult,
      contractMiss: {
        reason: 'structured_requires_invalid',
        declaredMode,
      },
    }
  }

  const jsonObject = extractJsonObject(fullText)
  if (jsonObject) {
    const missingFields = requires.filter(key => !(key in jsonObject))
    if (missingFields.length) {
      return {
        ...fullResult,
        contractMiss: { reason: 'structured_fields_missing', missingFields, declaredMode },
      }
    }
    const extracted = requires.map(key => fieldToText(jsonObject[key]))
    if (extracted.some(value => !value.trim())) {
      return {
        ...fullResult,
        contractMiss: { reason: 'structured_fields_empty', declaredMode },
      }
    }
    const output = requires
      .map((key, index) => `## ${key}\n${extracted[index]}`)
      .join('\n\n')
    return { delivery: 'structured_summary', output }
  }

  const sections = extractMarkdownSections(fullText, requires)
  const missingFields = requires.filter(key => !sections.get(key)?.trim())
  if (missingFields.length) {
    const reason = sections.size ? 'structured_fields_missing' : 'structured_markdown_missing'
    return {
      ...fullResult,
      contractMiss: { reason, missingFields, declaredMode },
    }
  }
  const output = requires
    .map(key => `## ${key}\n${sections.get(key)}`)
    .join('\n\n')
  return { delivery: 'structured_summary', output }
}

export function computeChainOutputHash(text: string): string {
  const normalized = (text || '').replace(/\s+/g, ' ').trim().toLowerCase()
  // FNV-1a 32-bit: stable across sessions, enough for duplicate detection.
  let hash = 0x811c9dc5
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function isFinalDraftStep(input: { sourceStep: number; totalSteps?: number }): boolean {
  if (!Number.isInteger(input.totalSteps) || (input.totalSteps as number) <= 0) return false
  return input.sourceStep === (input.totalSteps as number) - 1
}

export function makeChainHandoffArtifact(input: MakeChainHandoffArtifactInput): ChainHandoffArtifact {
  const output = input.output || ''
  const outputHash = computeChainOutputHash(output)
  const declaredRequiresFull =
    input.templateMeta?.chainHandoff?.requiresFullPreviousOutput === true
  const repeatedHashCount = input.previousSeenHashes?.has(outputHash)
    ? 1
    : 0
  const excerptLimit = Math.max(0, input.excerptLimit ?? DEFAULT_EXCERPT_LIMIT)
  const canonicalExcerpt = excerptLimit > 0 && output.length > excerptLimit
    ? output.slice(0, excerptLimit)
    : output

  return {
    artifactId: `handoff-${input.sourceStep}-${outputHash}`,
    sourceStep: input.sourceStep,
    sourceSkillId: input.sourceSkillId,
    outputHash,
    fullTextLength: output.length,
    delivery: input.delivery || 'canonical_excerpt',
    canonicalExcerpt: canonicalExcerpt || undefined,
    structuredSummary: input.structuredSummary,
    declaredFields: input.templateMeta?.chainHandoff?.requires
      ? Object.fromEntries(input.templateMeta.chainHandoff.requires.map(key => [key, 'declared']))
      : undefined,
    requiresFullPreviousOutput: declaredRequiresFull,
    repeatedHashCount,
  }
}

export function describeChainHandoffEvent(artifact: ChainHandoffArtifact) {
  const summary = artifact.structuredSummary
  return {
    artifactId: artifact.artifactId,
    sourceStep: artifact.sourceStep,
    sourceSkillId: artifact.sourceSkillId,
    outputHash: artifact.outputHash,
    fullTextLength: artifact.fullTextLength,
    delivery: artifact.delivery,
    excerptLength: artifact.canonicalExcerpt?.length || 0,
    factCount: summary?.facts?.length || 0,
    constraintCount: summary?.constraints?.length || 0,
    requiresFullPreviousOutput: artifact.requiresFullPreviousOutput,
    repeatedHashCount: artifact.repeatedHashCount,
  }
}
