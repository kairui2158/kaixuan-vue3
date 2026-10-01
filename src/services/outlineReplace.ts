import {
  buildEditorReplacementPlan,
  computeEditorMatches,
  type SearchOptions,
} from './editorReplace'

export type OutlineReplacementStatus =
  | 'replaced'
  | 'no-match'
  | 'unchanged'
  | 'invalid-selection'
  | 'invalid-pattern'
  | 'locked'

export interface OutlineReplacementResult {
  status: OutlineReplacementStatus
  next: string | null
  caret: number
  matchCount: number
}

export interface OutlineReplaceAllInput {
  content: string
  query: string
  replacement: string
  options?: SearchOptions
}

export interface OutlineReplaceCurrentInput extends OutlineReplaceAllInput {
  selectionStart: number
  selectionEnd: number
}

export interface ApplyOutlineReplacementInput extends OutlineReplaceAllInput {
  mode: 'current' | 'all'
  locked?: boolean
  selectionStart?: number
  selectionEnd?: number
}

function noChange(status: OutlineReplacementStatus): OutlineReplacementResult {
  return { status, next: null, caret: 0, matchCount: 0 }
}

function defaultSearchOptions(options?: SearchOptions): SearchOptions {
  return { caseSensitive: true, ...options }
}

export function replaceOutlineCurrent(input: OutlineReplaceCurrentInput): OutlineReplacementResult {
  const { content, query, selectionStart, selectionEnd } = input
  const options = defaultSearchOptions(input.options)
  if (!query) return noChange('no-match')
  const search = computeEditorMatches(content, query, options)
  if (search.error) return noChange('invalid-pattern')
  const selectedMatch = search.matches.find(match => match.start === selectionStart && match.end === selectionEnd)
  if (!selectedMatch) return noChange('invalid-selection')
  const plan = buildEditorReplacementPlan(content, query, input.replacement, options)
  if (plan.status === 'invalid-pattern') return noChange('invalid-pattern')
  const plannedItem = plan.items.find(item => item.start === selectionStart && item.end === selectionEnd)
  if (!plannedItem) return noChange('invalid-selection')
  const replacedNext = content.slice(0, selectionStart) + plannedItem.after + content.slice(selectionEnd)
  if (replacedNext === content) return noChange('unchanged')
  return {
    status: 'replaced',
    next: replacedNext,
    caret: selectionStart + plannedItem.after.length,
    matchCount: search.matches.length,
  }
}

export function replaceOutlineAll(input: OutlineReplaceAllInput): OutlineReplacementResult {
  const { content, query } = input
  const options = defaultSearchOptions(input.options)
  if (!query) return noChange('no-match')
  const plan = buildEditorReplacementPlan(content, query, input.replacement, options)
  if (plan.status === 'invalid-pattern') return noChange('invalid-pattern')
  if (plan.status === 'no-match') return noChange('no-match')
  if (plan.status === 'unchanged' || !plan.next) return noChange('unchanged')
  return {
    status: 'replaced',
    next: plan.next,
    caret: 0,
    matchCount: plan.matches.length,
  }
}

export function applyOutlineReplacement(input: ApplyOutlineReplacementInput): OutlineReplacementResult {
  if (input.locked) return noChange('locked')
  if (input.mode === 'current') {
    return replaceOutlineCurrent({
      content: input.content,
      query: input.query,
      replacement: input.replacement,
      selectionStart: input.selectionStart ?? 0,
      selectionEnd: input.selectionEnd ?? 0,
    })
  }
  return replaceOutlineAll({
    content: input.content,
    query: input.query,
    replacement: input.replacement,
    options: input.options,
  })
}
