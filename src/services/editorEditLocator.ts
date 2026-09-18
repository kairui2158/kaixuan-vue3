export type EditorLocateFailureReason =
  | 'invalid_input'
  | 'target_not_found'
  | 'ambiguous_target'

export interface EditorLocateCandidate {
  start: number
  end: number
  similarity: number
  context: string
}

export interface EditorLocateSuccess {
  ok: true
  unique: true
  fuzzy: false
  start: number
  end: number
  context: string
}

export interface EditorLocateDiagnostic {
  ok: false
  unique: false
  fuzzy: boolean
  reason: EditorLocateFailureReason
  message: string
  matches?: Array<{ start: number; end: number }>
  candidates?: EditorLocateCandidate[]
  anchorCandidates?: EditorAnchorCandidate[]
}

export interface EditorAnchorCandidate {
  title: string
  kind: 'volume' | 'chapter' | 'section' | 'heading' | 'paragraph'
  start: number
  end: number
}

export type EditorLocateResult = EditorLocateSuccess | EditorLocateDiagnostic

export interface EditorStructureAnchor {
  volumeTitle?: string
  chapterTitle?: string
  sectionTitle?: string
}

const CONTEXT_RADIUS = 150
const FUZZY_MIN_SIMILARITY = 0.6
const FUZZY_WINDOW = 200

function exactMatches(content: string, fragment: string): Array<{ start: number; end: number }> {
  const matches: Array<{ start: number; end: number }> = []
  let index = content.indexOf(fragment)
  while (index >= 0) {
    matches.push({ start: index, end: index + fragment.length })
    index = content.indexOf(fragment, index + 1)
  }
  return matches
}

function contextWindow(content: string, start: number, end: number): string {
  const from = Math.max(0, Math.floor((start + end) / 2) - CONTEXT_RADIUS)
  const to = Math.min(content.length, from + CONTEXT_RADIUS * 2)
  return content.slice(from, to)
}

function levenshtein(a: string, b: string): number {
  if (!a.length) return b.length
  if (!b.length) return a.length
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
    previous = current
  }
  return previous[b.length]
}

function fuzzyCandidates(
  content: string,
  fragment: string,
  maxCandidates = 3
): EditorLocateCandidate[] {
  const windowSize = Math.min(fragment.length + 40, FUZZY_WINDOW)
  const step = Math.max(1, Math.floor(windowSize / 4))
  const candidates: EditorLocateCandidate[] = []
  for (let start = 0; start < content.length; start += step) {
    const end = Math.min(start + windowSize, content.length)
    const slice = content.slice(start, end)
    const distance = levenshtein(slice.slice(0, fragment.length), fragment)
    const similarity = fragment.length ? 1 - distance / fragment.length : 0
    if (similarity >= FUZZY_MIN_SIMILARITY) {
      candidates.push({
        start,
        end: start + fragment.length,
        similarity: Math.round(similarity * 100) / 100,
        context: contextWindow(content, start, start + fragment.length)
      })
    }
  }
  candidates.sort((a, b) => b.similarity - a.similarity)
  return candidates.slice(0, maxCandidates)
}

function resolveAnchorRange(content: string, anchor: EditorStructureAnchor): { start: number; end: number } | null {
  const title = anchor.sectionTitle || anchor.chapterTitle || anchor.volumeTitle
  if (!title) return null
  const index = content.indexOf(title)
  if (index < 0) return null
  return { start: index, end: content.length }
}

function anchorCandidates(content: string, anchor: EditorStructureAnchor): EditorAnchorCandidate[] {
  const wantedKinds: Array<{ title?: string; kind: EditorAnchorCandidate['kind'] }> = [
    { title: anchor.sectionTitle, kind: 'section' },
    { title: anchor.chapterTitle, kind: 'chapter' },
    { title: anchor.volumeTitle, kind: 'volume' }
  ]
  const wanted = wantedKinds.filter((item): item is { title: string; kind: EditorAnchorCandidate['kind'] } =>
    typeof item.title === 'string' && item.title.trim().length > 0
  )
  if (!wanted.length) return []
  const lines = content.split('\n')
  let cursor = 0
  const result: EditorAnchorCandidate[] = []
  for (const line of lines) {
    const start = cursor
    const end = cursor + line.length
    cursor = end + 1
    const trimmed = line.trim()
    if (!trimmed) continue
    const headingLike = /^(?:第[0-9一二三四五六七八九十百千万零两\s]+[卷章节回]|卷[0-9一二三四五六七八九十百千万零两\s]+|章节[0-9一二三四五六七八九十百千万零两\s]+|#{1,6}\s+)/.test(trimmed)
    if (!headingLike) continue
    const bestDistance = wanted.reduce((best, item) => {
      const sameKind = (item.kind === 'section' && /节/.test(trimmed)) ||
        (item.kind === 'chapter' && /章|回/.test(trimmed)) ||
        (item.kind === 'volume' && /卷/.test(trimmed))
      if (!sameKind) return best
      const distance = levenshtein(trimmed, item.title)
      return Math.min(best, distance)
    }, Number.MAX_SAFE_INTEGER)
    const similarity = 1 - bestDistance / Math.max(1, Math.max(trimmed.length, ...wanted.map(item => item.title.length)))
    if (similarity < 0.35) continue
    const match = wanted.find(item =>
      (item.kind === 'section' && /节/.test(trimmed)) ||
      (item.kind === 'chapter' && /章|回/.test(trimmed)) ||
      (item.kind === 'volume' && /卷/.test(trimmed))
    )
    if (!match) continue
    result.push({ title: trimmed, kind: match.kind, start, end })
  }
  return result.slice(0, 5)
}

export function locateEditorFragment(input: {
  content: string
  fragment: string
  anchor?: EditorStructureAnchor
  allowFuzzyDiagnostics?: boolean
}): EditorLocateResult {
  const content = typeof input.content === 'string' ? input.content : ''
  const fragment = typeof input.fragment === 'string' ? input.fragment.trim() : ''
  const hasEffectiveAnchor = !!input.anchor && [
    input.anchor.volumeTitle,
    input.anchor.chapterTitle,
    input.anchor.sectionTitle
  ].some(title => typeof title === 'string' && title.trim().length > 0)
  if (!content || !fragment) {
    return {
      ok: false,
      unique: false,
      fuzzy: false,
      reason: 'invalid_input',
      message: 'content 与 fragment 必须是非空字符串'
    }
  }

  const scoped = hasEffectiveAnchor ? resolveAnchorRange(content, input.anchor!) : null
  if (hasEffectiveAnchor && !scoped) {
    return {
      ok: false,
      unique: false,
      fuzzy: false,
      reason: 'target_not_found',
      message: '结构锚点不存在；请改用候选锚点或重新读取结构地图',
      candidates: input.allowFuzzyDiagnostics === false
        ? []
        : fuzzyCandidates(content, input.fragment)
            .map(candidate => ({
              ...candidate,
              context: candidate.context
            })),
      anchorCandidates: anchorCandidates(content, input.anchor!)
    }
  }
  const matches = scoped
    ? exactMatches(content.slice(scoped.start, scoped.end), fragment)
      .map(match => ({ start: scoped.start + match.start, end: scoped.start + match.end }))
    : exactMatches(content, fragment)

  if (matches.length === 0) {
    const scopeStart = scoped?.start || 0
    const scopeEnd = scoped?.end || content.length
    const candidates = input.allowFuzzyDiagnostics === false
      ? []
      : fuzzyCandidates(content.slice(scopeStart, scopeEnd), fragment)
        .map(candidate => ({
          ...candidate,
          start: scopeStart + candidate.start,
          end: scopeStart + candidate.end
        }))
    if (candidates.length > 0) {
      return {
        ok: false,
        unique: false,
        fuzzy: true,
        reason: 'target_not_found',
        message: '精确匹配失败；以下候选仅用于诊断，禁止直接放宽写入',
        candidates
      }
    }
    return {
      ok: false,
      unique: false,
      fuzzy: false,
      reason: 'target_not_found',
      message: '片段不存在；请重新读取原文并逐字复制目标片段'
    }
  }

  if (matches.length > 1) {
    return {
      ok: false,
      unique: false,
      fuzzy: false,
      reason: 'ambiguous_target',
      message: '片段出现多次；必须扩展片段或使用结构锚点使其唯一',
      matches
    }
  }

  const match = matches[0]
  return {
    ok: true,
    unique: true,
    fuzzy: false,
    start: match.start,
    end: match.end,
    context: contextWindow(content, match.start, match.end)
  }
}

export function normalizeEditorEditLocatorResult(result: EditorLocateResult): unknown {
  return result.ok
    ? { ...result, context: result.context }
    : { ...result }
}
