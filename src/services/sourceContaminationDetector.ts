export const SOURCE_CONTAMINATION_MARKER_MIN_CHARS = 16
const SOURCE_CONTAMINATION_MAX_REPORTED_MATCHES = 10
const SOURCE_CONTAMINATION_EXCERPT_RADIUS = 40
const SOURCE_CONTAMINATION_MARKER_SPLIT_PATTERN = /\n+/

export interface SourceContaminationConversationMessage {
  role?: string
  content: string
}

export interface SourceContaminationMarker {
  role: string
  content: string
  normalized: string
  messageIndex: number
}

export interface SourceContaminationMatch {
  markerIndex: number
  markerRole: string
  matchKind: 'exact' | 'normalized'
  start: number
  end: number
  excerpt: string
}

export interface SourceContaminationResult {
  detected: boolean
  matches: SourceContaminationMatch[]
  truncated: boolean
}

function normalizeContaminationText(text: string): string {
  return text.replace(/\s+/g, '')
}

function normalizeSourceForContamination(text: string): {
  normalized: string
  offsets: Array<number | null>
} {
  const offsets: Array<number | null> = []
  let normalized = ''
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (/\s/.test(char)) {
      offsets.push(null)
      continue
    }
    normalized += char
    offsets.push(normalized.length - 1)
  }
  return { normalized, offsets }
}

function resolveSourceRange(
  source: string,
  normalizedOffset: number,
  markerLength: number,
): { start: number; end: number } | null {
  const offsets: Array<number> = []
  for (let index = 0; index < source.length; index += 1) {
    if (!/\s/.test(source[index])) offsets.push(index)
  }
  if (normalizedOffset >= offsets.length) return null
  const start = offsets[normalizedOffset]
  const normalizedEnd = normalizedOffset + markerLength - 1
  if (normalizedEnd >= offsets.length) return null
  const end = offsets[normalizedEnd] + 1
  return { start, end }
}

function buildExcerpt(source: string, start: number, end: number): string {
  const excerptStart = Math.max(0, start - SOURCE_CONTAMINATION_EXCERPT_RADIUS)
  const excerptEnd = Math.min(source.length, end + SOURCE_CONTAMINATION_EXCERPT_RADIUS)
  return source.slice(excerptStart, excerptEnd)
}

export function buildSourceContaminationMarkers(
  messages: SourceContaminationConversationMessage[],
): SourceContaminationMarker[] {
  return messages.flatMap((message, messageIndex) => message.content
    .split(SOURCE_CONTAMINATION_MARKER_SPLIT_PATTERN)
    .map(part => part.trim())
    .filter(part => part.length >= SOURCE_CONTAMINATION_MARKER_MIN_CHARS)
    .map(part => ({
      role: message.role || 'conversation',
      content: part,
      normalized: normalizeContaminationText(part),
      messageIndex,
    }))
    .filter(marker => marker.normalized.length >= SOURCE_CONTAMINATION_MARKER_MIN_CHARS))
}

export function detectSourceContamination(
  source: string,
  conversationMarkers: SourceContaminationConversationMessage[],
): SourceContaminationResult {
  if (!source.trim()) {
    return { detected: false, matches: [], truncated: false }
  }

  const markers = buildSourceContaminationMarkers(conversationMarkers)
  const matches: SourceContaminationMatch[] = []
  let truncated = false

  for (let markerIndex = 0; markerIndex < markers.length; markerIndex += 1) {
    const marker = markers[markerIndex]
    const seenRanges = new Set<string>()

    let searchFrom = 0
    while (searchFrom <= source.length - SOURCE_CONTAMINATION_MARKER_MIN_CHARS) {
      const foundAt = source.indexOf(marker.content, searchFrom)
      if (foundAt === -1) break
      const key = `${foundAt}:${foundAt + marker.content.length}`
      if (!seenRanges.has(key)) {
        seenRanges.add(key)
        if (matches.length >= SOURCE_CONTAMINATION_MAX_REPORTED_MATCHES) {
          truncated = true
          break
        }
        matches.push({
          markerIndex,
          markerRole: marker.role,
          matchKind: 'exact',
          start: foundAt,
          end: foundAt + marker.content.length,
          excerpt: buildExcerpt(source, foundAt, foundAt + marker.content.length),
        })
      }
      searchFrom = foundAt + 1
    }
    if (truncated) break
  }

  if (!truncated) {
    const normalizedSource = normalizeSourceForContamination(source)
    for (let markerIndex = 0; markerIndex < markers.length; markerIndex += 1) {
      const marker = markers[markerIndex]
        const exact = false
      let searchFrom = 0
      while (searchFrom <= normalizedSource.normalized.length - marker.normalized.length) {
        const foundAt = normalizedSource.normalized.indexOf(marker.normalized, searchFrom)
        if (foundAt === -1) break
        const range = resolveSourceRange(source, foundAt, marker.normalized.length)
        const key = range ? `${range.start}:${range.end}` : `${foundAt}:normalized`
        if (range && !seenExactRange(matches, markerIndex, range)) {
          if (matches.length >= SOURCE_CONTAMINATION_MAX_REPORTED_MATCHES) {
            truncated = true
            break
          }
          matches.push({
            markerIndex,
            markerRole: marker.role,
            matchKind: exact ? 'exact' : 'normalized',
            start: range.start,
            end: range.end,
            excerpt: buildExcerpt(source, range.start, range.end),
          })
        }
        searchFrom = foundAt + 1
      }
      if (truncated) break
    }
  }

  matches.sort((left, right) => left.start - right.start || left.end - right.end)
  return {
    detected: matches.length > 0,
    matches,
    truncated,
  }
}

function seenExactRange(
  matches: SourceContaminationMatch[],
  markerIndex: number,
  range: { start: number; end: number },
): boolean {
  return matches.some(match =>
    match.markerIndex === markerIndex
    && match.start <= range.start
    && match.end >= range.end
  )
}
