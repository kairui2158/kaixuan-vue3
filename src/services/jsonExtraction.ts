export type JsonValueType = 'object' | 'array'

export interface ExtractedJson {
  value: unknown
  start: number
  end: number
}

const FENCE_PATTERN = /```(?:json)?\s*([\s\S]*?)```/gi

/**
 * Extracts balanced JSON candidates without using a greedy regex.
 * Brackets inside JSON strings are ignored, so explanation text or multiple
 * JSON blocks cannot accidentally join into one invalid candidate.
 */
export function extractJsonCandidates(text: string): ExtractedJson[] {
  if (typeof text !== 'string' || text.trim().length === 0) return []

  const candidates: ExtractedJson[] = []
  const pushCandidate = (raw: string, start: number) => {
    const trimmedStart = raw.length - raw.trimStart().length
    const value = raw.trim()
    if (!value.startsWith('{') && !value.startsWith('[')) return
    try {
      candidates.push({
        value: JSON.parse(value),
        start: start + trimmedStart,
        end: start + trimmedStart + value.length,
      })
    } catch {
      // Malformed candidates are deliberately skipped; callers keep their own
      // retry semantics instead of receiving a partially repaired object.
    }
  }

  for (const match of text.matchAll(FENCE_PATTERN)) {
    const body = match[1] || ''
    const bodyStart = (match.index ?? 0) + (match[0].length - body.length - 3)
    pushCandidate(body, bodyStart)
  }

  const stack: Array<{ char: '[' | '{'; start: number }> = []
  let inString = false
  let escaped = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      escaped = false
      continue
    }
    if (char === '[' || char === '{') {
      stack.push({ char, start: index })
      continue
    }
    if ((char === ']' || char === '}') && stack.length > 0) {
      const opening = stack[stack.length - 1]
      const isPair = (opening.char === '[' && char === ']') || (opening.char === '{' && char === '}')
      if (!isPair) continue
      stack.pop()
      if (stack.length === 0) pushCandidate(text.slice(opening.start, index + 1), opening.start)
    }
  }

  return candidates
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function sameRange(left: ExtractedJson, right: ExtractedJson): boolean {
  return left.start === right.start && left.end === right.end
}

export function extractJsonObject(text: string): Record<string, unknown> | null {
  const seen = new Set<string>()
  for (const candidate of extractJsonCandidates(text)) {
    if (!isRecord(candidate.value)) continue
    const key = JSON.stringify(candidate.value) + ':' + candidate.start + ':' + candidate.end
    if (seen.has(key)) continue
    seen.add(key)
    return candidate.value
  }
  return null
}

export function extractJsonArray(text: string): unknown[] {
  const seen = new Set<string>()
  for (const candidate of extractJsonCandidates(text)) {
    if (!Array.isArray(candidate.value)) continue
    const key = JSON.stringify(candidate.value) + ':' + candidate.start + ':' + candidate.end
    if (seen.has(key)) continue
    seen.add(key)
    return candidate.value
  }
  return []
}

export type JsonArrayDiagnosticsKind =
  | 'success'
  | 'none'
  | 'no_json'
  | 'parse_failed'
  | 'truncated'

export interface JsonArrayDiagnostics {
  kind: JsonArrayDiagnosticsKind
  rawLength: number
  candidateCount: number
  /** Bounded preview for terminal audit only; never sent back as replacement text. */
  tailPreview?: string
}

export function extractJsonArrayWithDiagnostics(
  text: string
): { value: unknown[]; diagnostics: JsonArrayDiagnostics } {
  const safeText = typeof text === 'string' ? text : ''
  const value = extractJsonArray(safeText)
  const candidateCount = extractJsonCandidates(safeText).length
  const rawLength = safeText.length
  if (value.length > 0) {
    return {
      value,
      diagnostics: { kind: 'success', rawLength, candidateCount }
    }
  }
  if (safeText.trim().length === 0) {
    return { value: [], diagnostics: { kind: 'none', rawLength, candidateCount } }
  }

  const stack: Array<'[' | '{'> = []
  let sawOpening = false
  let inString = false
  let escaped = false
  for (let index = 0; index < safeText.length; index += 1) {
    const char = safeText[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      escaped = false
      continue
    }
    if (char === '[' || char === '{') {
      sawOpening = true
      stack.push(char)
    }
    else if ((char === ']' || char === '}') && stack.length > 0) {
      const opening = stack[stack.length - 1]
      const isPair = (opening === '[' && char === ']') || (opening === '{' && char === '}')
      if (isPair) stack.pop()
    }
  }

  const kind: JsonArrayDiagnosticsKind = stack.length > 0
    ? 'truncated'
    : sawOpening || candidateCount > 0
      ? 'parse_failed'
      : 'no_json'
  return {
    value: [],
    diagnostics: {
      kind,
      rawLength,
      candidateCount,
      tailPreview: safeText.slice(-80)
    }
  }
}

export function extractJsonValue(text: string): unknown {
  const candidates = extractJsonCandidates(text)
  return candidates.length > 0 ? candidates[0].value : null
}

export function repairJsonText(text: string): unknown {
  return extractJsonValue(text)
}

export function dedupeJsonCandidates(candidates: ExtractedJson[]): ExtractedJson[] {
  const seen = new Set<string>()
  return candidates.filter(candidate => {
    const key = candidate.start + ':' + candidate.end
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
