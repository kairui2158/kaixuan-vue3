export interface SearchOptions {
  caseSensitive?: boolean
  wholeWord?: boolean
  useRegex?: boolean
}

export interface SearchMatch {
  start: number
  end: number
}

export interface EditorMatchResult {
  matches: SearchMatch[]
  error: string | null
}

export type EditorReplacementPlanStatus = 'ready' | 'no-match' | 'unchanged' | 'invalid-pattern'

export interface EditorReplacementPlanItem extends SearchMatch {
  before: string
  after: string
}

export interface EditorReplacementPlan {
  status: EditorReplacementPlanStatus
  error: string | null
  next: string | null
  matches: SearchMatch[]
  items: EditorReplacementPlanItem[]
}

export interface ApplyEditorReplacementPlanResult {
  status: 'applied' | 'source-changed'
  next: string | null
}

function escapeRegExpLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildSearchRegExp(
  query: string,
  options: SearchOptions,
): { regexp: RegExp | null; error: string | null } {
  const pattern = options.useRegex
    ? query
    : escapeRegExpLiteral(query)
  const flags = options.caseSensitive ? 'g' : 'gi'
  const body = options.wholeWord
    ? `(?<![\\p{L}\\p{N}_])${pattern}(?![\\p{L}\\p{N}_])`
    : pattern
  try {
    return { regexp: new RegExp(body, `${flags}u`), error: null }
  } catch (error) {
    return {
      regexp: null,
      error: options.useRegex
        ? '正则表达式无效，请检查括号或通配符'
        : '查找内容无法转换为有效匹配模式',
    }
  }
}

export function computeEditorMatches(
  content: string,
  query: string,
  options: SearchOptions = {},
): EditorMatchResult {
  if (!content || !query || query.trim() === '') {
    return { matches: [], error: null }
  }

  const search = buildSearchRegExp(query, options)
  if (!search.regexp) {
    return { matches: [], error: search.error || '查找内容不是有效的正则表达式' }
  }
  const regexp = search.regexp

  const matches: SearchMatch[] = []
  let cursor = 0
  for (;;) {
    regexp.lastIndex = cursor
    const match = regexp.exec(content)
    if (!match) break
    const start = match.index
    const end = start + match[0].length
    if (end > start) {
      matches.push({ start, end })
      cursor = end
    } else {
      cursor = start + 1
    }
    if (cursor > content.length) break
  }
  return { matches, error: null }
}

function buildReplacementText(
  match: RegExpExecArray,
  replacement: string,
  useRegex: boolean,
): string {
  return useRegex ? replacement : replacement
}

function buildReplacementPlanItem(
  content: string,
  match: SearchMatch,
  replacement: string,
  useRegex: boolean,
  groups?: RegExpExecArray,
): EditorReplacementPlanItem {
  const before = content.slice(match.start, match.end)
  let after = replacement
  if (useRegex && groups) {
    after = replacement.replace(/\$(\d)/g, (_token, digit: string) => {
      const index = Number(digit)
      return groups[index] ?? ''
    })
  }
  return { ...match, before, after }
}

export function buildEditorReplacementPlan(
  content: string,
  query: string,
  replacement: string,
  options: SearchOptions = {},
): EditorReplacementPlan {
  const result = computeEditorMatches(content, query, options)
  if (result.error) {
    return {
      status: 'invalid-pattern',
      error: result.error,
      next: null,
      matches: [],
      items: [],
    }
  }
  if (result.matches.length === 0) {
    return { status: 'no-match', error: null, next: null, matches: [], items: [] }
  }

  const items: EditorReplacementPlanItem[] = []
  const search = buildSearchRegExp(query, options)
  const regexp = options.useRegex ? search.regexp : null
  result.matches.forEach((match) => {
    let groups: RegExpExecArray | undefined
    if (regexp) {
      regexp.lastIndex = match.start
      groups = regexp.exec(content) ?? undefined
    }
    items.push(buildReplacementPlanItem(content, match, replacement, Boolean(options.useRegex), groups))
  })

  let next = ''
  let cursor = 0
  items.forEach((item) => {
    next += content.slice(cursor, item.start) + item.after
    cursor = item.end
  })
  next += content.slice(cursor)

  if (next === content) {
    return { status: 'unchanged', error: null, next: null, matches: result.matches, items }
  }
  return { status: 'ready', error: null, next, matches: result.matches, items }
}

export function applyEditorReplacementPlan(
  content: string,
  plan: EditorReplacementPlan,
): ApplyEditorReplacementPlanResult {
  if (plan.status !== 'ready' || !plan.next) {
    return { status: 'source-changed', next: null }
  }
  const sourceValid = plan.items.every((item) => content.slice(item.start, item.end) === item.before)
  if (!sourceValid) {
    return { status: 'source-changed', next: null }
  }
  return { status: 'applied', next: plan.next }
}
