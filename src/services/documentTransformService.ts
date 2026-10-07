import { parseOutlineStructure } from './outlineStructure'

export type DocumentTransformOperation =
  | 'normalize_punctuation'
  | 'normalize_blank_lines'
  | 'normalize_numbering'
  | 'reorder_sections'
  | 'remove_exact_duplicates'
  | 'word_layout_normalize'

export type DocumentTransformOutcome =
  | 'completed'
  | 'no_change'
  | 'needs_model'
  | 'invalid_input'

export interface DocumentTransformValidation {
  ok: boolean
  problems: string[]
  checks: {
    structureCoverage: boolean
    bodyMultisetUnchanged: boolean
    duplicateRemovalOnly: boolean
  }
}

export interface DocumentTransformResult {
  outcome: DocumentTransformOutcome
  content: string
  operations: DocumentTransformOperation[]
  changedLineCount: number
  durationMs: number
  validation: DocumentTransformValidation
  reason?: string
}

export function validateDocumentTransform(input: {
  content: string
  output: string
  operations: readonly DocumentTransformOperation[]
}): DocumentTransformValidation {
  return validateTransform(input)
}

interface LineNode {
  kind: 'heading' | 'blank' | 'body'
  text: string
}

interface SectionNode {
  number: number | null
  start: number
  lines: LineNode[]
}

const SUPPORTED_OPERATIONS: readonly DocumentTransformOperation[] = [
  'normalize_punctuation',
  'normalize_blank_lines',
  'normalize_numbering',
  'reorder_sections',
  'remove_exact_duplicates',
  'word_layout_normalize',
]

const PUNCTUATION_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/,/g, '，'],
  [/;/g, '；'],
  [/:/g, '：'],
  [/!/g, '！'],
  [/\?/g, '？'],
]

const TERMINAL_PUNCTUATION = /[。！？；：”』」）】]$/
const NUMBERED_HEADING = /^(#{1,6})\s+第\s*([0-9一二三四五六七八九十百千万零两]+)\s*节\s*(.*)$/
const ANY_HEADING = /^(#{1,6})\s+\S/

function normalizeChineseNumber(value: string): number | null {
  const trimmed = value.replace(/\s+/g, '')
  if (/^[0-9]+$/.test(trimmed)) return Number(trimmed)
  const digits: Record<string, number> = {
    零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4,
    五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  }
  if (trimmed === '十') return 10
  if (trimmed === '百') return 100
  if (trimmed === '千') return 1000
  if (trimmed === '万') return 10000
  if (!/^[一二三四五六七八九十零两]+$/.test(trimmed)) return null
  // Supports the common compound form up to ninety-nine; larger traditional
  // numbers stay on the model path rather than being guessed here.
  const tenIndex = trimmed.indexOf('十')
  if (tenIndex >= 0) {
    const left = trimmed.slice(0, tenIndex)
    const right = trimmed.slice(tenIndex + 1)
    if (!left || /^[零一二三四五六七八九]$/.test(left)) {
      const leftValue = left ? digits[left] : 1
      if (!right || /^[零一二三四五六七八九]$/.test(right)) {
        return leftValue * 10 + (right ? digits[right] : 0)
      }
    }
  }
  if (/^[零一二三四五六七八九]+$/.test(trimmed)) {
    return Number(trimmed.split('').map(char => digits[char]).join(''))
  }
  return null
}

function hasChinese(text: string): boolean {
  return /[\u3400-\u4dbf\u4e00-\u9fff]/.test(text)
}

function classifyLines(content: string): LineNode[] {
  return content.split('\n').map(text => {
    if (!text.trim()) return { kind: 'blank' as const, text: '' }
    if (ANY_HEADING.test(text.trim())) return { kind: 'heading' as const, text: text.trim() }
    return { kind: 'body' as const, text }
  })
}

function joinLines(lines: LineNode[]): string {
  return lines.map(line => line.text).join('\n')
}

function normalizePunctuation(lines: LineNode[]): LineNode[] {
  return lines.map(line => {
    if (line.kind !== 'body' || !hasChinese(line.text)) return line
    let text = line.text
    for (const [pattern, replacement] of PUNCTUATION_REPLACEMENTS) {
      text = text.replace(pattern, replacement)
    }
    return { ...line, text }
  })
}

function wordLayoutNormalize(lines: LineNode[]): LineNode[] {
  return lines.map(line => {
    if (line.kind !== 'body') return line
    const text = line.text.replace(/[ \t]+$/, '').replace(/^[ \t]+/, '')
    if (!hasChinese(text)) return { ...line, text }
    return { ...line, text: TERMINAL_PUNCTUATION.test(text) ? text : `${text}。` }
  })
}

function normalizeBlankLines(lines: LineNode[]): LineNode[] {
  const output: LineNode[] = []
  for (const line of lines) {
    if (line.kind !== 'blank') {
      output.push(line)
      continue
    }
    const previous = output.at(-1)
    if (!previous || previous.kind === 'blank') continue
    output.push(line)
  }
  const last = output.at(-1)
  if (last?.kind === 'blank') output.pop()
  return output
}

function parseSectionNumber(heading: string): number | null {
  const match = NUMBERED_HEADING.exec(heading)
  if (!match) return null
  return normalizeChineseNumber(match[2])
}

function parseSectionMarker(heading: string): { marker: string; title: string } | null {
  const match = NUMBERED_HEADING.exec(heading)
  if (!match) return null
  return { marker: match[1], title: match[3].trim() }
}

function normalizeNumbering(lines: LineNode[]): LineNode[] {
  let next = 1
  return lines.map(line => {
    if (line.kind !== 'heading') return line
    const marker = parseSectionMarker(line.text)
    if (!marker) return line
    const title = marker.title ? ` ${marker.title}` : ''
    const heading = { ...line, text: `${marker.marker} 第${next}节${title}` }
    next += 1
    return heading
  })
}

function collectSections(lines: LineNode[]): SectionNode[] {
  const sections: SectionNode[] = []
  let current: SectionNode | null = null
  lines.forEach((line, index) => {
    if (line.kind === 'heading') {
      const number = parseSectionNumber(line.text)
      if (number != null) {
        if (current) sections.push(current)
        current = { number, start: index, lines: [line] }
        return
      }
    }
    if (current) current.lines.push(line)
  })
  if (current) sections.push(current)
  return sections
}

function isSorted(numbers: number[]): boolean {
  return numbers.every((number, index) => index === 0 || numbers[index - 1] <= number)
}

function hasDuplicateNumbers(numbers: number[]): boolean {
  return new Set(numbers).size !== numbers.length
}

function collectSectionBodies(sections: SectionNode[]): Map<number, string[]> {
  const bodies = new Map<number, string[]>()
  for (const section of sections) {
    const existing = bodies.get(section.number!) ?? []
    existing.push(joinLines(section.lines.filter(line => line.kind === 'body')))
    bodies.set(section.number!, existing)
  }
  return bodies
}

function reorderSections(lines: LineNode[]): LineNode[] {
  const sections = collectSections(lines)
  if (sections.length < 2) return lines
  const numbers = sections.map(section => section.number!)
  if (isSorted(numbers) || hasDuplicateNumbers(numbers)) return lines

  const firstStart = sections[0].start
  const lastEnd = sections.at(-1)!.start + sections.at(-1)!.lines.length
  const prefix = lines.slice(0, firstStart)
  const suffix = lines.slice(lastEnd)
  const prefixHasContent = prefix.some(line => line.kind !== 'blank')
  const suffixHasContent = suffix.some(line => line.kind !== 'blank')
  if (prefixHasContent || suffixHasContent) return lines

  const beforeBodies = collectSectionBodies(sections)
  const sorted = [...sections].sort((left, right) => left.number! - right.number!)
  const afterBodies = collectSectionBodies(sorted)
  const sameBodies = [...beforeBodies.keys()].every(number => {
    const left = beforeBodies.get(number) ?? []
    const right = afterBodies.get(number) ?? []
    return left.length === right.length && left.every((body, index) => body === right[index])
  })
  if (!sameBodies) return lines

  return sorted.flatMap(section => section.lines)
}

function removeExactDuplicates(lines: LineNode[]): LineNode[] {
  const sections = collectSections(lines)
  if (sections.length < 2) return lines
  const groups = new Map<number, SectionNode[]>()
  for (const section of sections) {
    const group = groups.get(section.number!) ?? []
    group.push(section)
    groups.set(section.number!, group)
  }
  const duplicates = new Map<number, SectionNode>()
  for (const [number, group] of groups) {
    if (group.length < 2) continue
    const firstBody = joinLines(group[0].lines.filter(line => line.kind === 'body'))
    const allIdentical = group.every(section =>
      joinLines(section.lines.filter(line => line.kind === 'body')) === firstBody)
    if (allIdentical) duplicates.set(number, group[group.length - 1])
  }
  if (!duplicates.size) return lines

  const duplicateRange = new Map<number, { start: number; end: number }>()
  for (const [number, section] of duplicates) {
    duplicateRange.set(number, { start: section.start, end: section.start + section.lines.length })
  }
  return lines.filter((line, index) => {
    for (const range of duplicateRange.values()) {
      if (index >= range.start && index < range.end) return false
    }
    return true
  })
}

function countChangedLines(before: string, after: string): number {
  if (before === after) return 0
  const beforeLines = before.split('\n')
  const afterLines = after.split('\n')
  let changed = Math.abs(beforeLines.length - afterLines.length)
  const shared = Math.min(beforeLines.length, afterLines.length)
  for (let index = 0; index < shared; index += 1) {
    if (beforeLines[index] !== afterLines[index]) changed += 1
  }
  return changed
}

function collectLeafBodies(nodes: ReturnType<typeof parseOutlineStructure>['nodes']): string[] {
  const bodies: string[] = []
  const walk = (items: typeof nodes) => {
    for (const node of items) {
      if (node.children.length) walk(node.children)
      else bodies.push(node.summaryHead)
    }
  }
  walk(nodes)
  return bodies
}

function multisetEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false
  const counts = new Map<string, number>()
  for (const item of left) counts.set(item, (counts.get(item) ?? 0) + 1)
  for (const item of right) {
    const count = counts.get(item)
    if (!count) return false
    counts.set(item, count - 1)
  }
  return true
}

function duplicateRemovalOnly(left: string[], right: string[]): boolean {
  const counts = new Map<string, number>()
  for (const item of left) counts.set(item, (counts.get(item) ?? 0) + 1)
  for (const item of right) {
    const count = counts.get(item)
    if (!count || count < 1) return false
    counts.set(item, count - 1)
  }
  return true
}

function canonicalizeBody(body: string, operations: readonly DocumentTransformOperation[]): string {
  const formatOnly = operations.includes('normalize_punctuation')
    || operations.includes('word_layout_normalize')
    || operations.includes('normalize_blank_lines')
  if (!formatOnly) return body
  return body.replace(/[\s，。；：！？,.;:!?、·\u3000]/g, '')
}

function validationFailure(reason: string): DocumentTransformValidation {
  return {
    ok: false,
    problems: [reason],
    checks: {
      structureCoverage: false,
      bodyMultisetUnchanged: false,
      duplicateRemovalOnly: false,
    },
  }
}

function validateTransform(input: {
  content: string
  output: string
  operations: readonly DocumentTransformOperation[]
}): DocumentTransformValidation {
  const source = parseOutlineStructure(input.content)
  const target = parseOutlineStructure(input.output)
  const problems: string[] = []
  const structureCoverage = input.output.trim().length > 0
  if (!structureCoverage) problems.push('输出为空')

  const allowsDeletion = input.operations.includes('remove_exact_duplicates')
  const sourceBodies = collectLeafBodies(source.nodes)
  const targetBodies = collectLeafBodies(target.nodes)
  const canonicalSource = sourceBodies.map(body => canonicalizeBody(body, input.operations))
  const canonicalTarget = targetBodies.map(body => canonicalizeBody(body, input.operations))
  const bodyMultisetUnchanged = allowsDeletion
    ? duplicateRemovalOnly(canonicalSource, canonicalTarget)
    : multisetEqual(canonicalSource, canonicalTarget)
  const duplicateRemovalChecked = allowsDeletion
    ? duplicateRemovalOnly(canonicalSource, canonicalTarget)
    : true
  if (!bodyMultisetUnchanged) problems.push('正文集合发生计划外变化')
  return {
    ok: problems.length === 0,
    problems,
    checks: { structureCoverage, bodyMultisetUnchanged, duplicateRemovalOnly: duplicateRemovalChecked },
  }
}

function normalizeOperations(
  operations: readonly DocumentTransformOperation[],
): DocumentTransformOperation[] {
  const requested = operations.filter(operation =>
    SUPPORTED_OPERATIONS.includes(operation))
  return [...new Set(requested)]
}

export function transformDocument(input: {
  content: string
  operations: readonly DocumentTransformOperation[]
}): DocumentTransformResult {
  const started = performance.now()
  if (typeof input.content !== 'string') {
    return {
      outcome: 'invalid_input',
      content: '',
      operations: [],
      changedLineCount: 0,
      durationMs: performance.now() - started,
      validation: validationFailure('content 必须是字符串'),
      reason: 'invalid_content',
    }
  }
  const operations = normalizeOperations(input.operations)
  const unsupported = input.operations.filter(operation =>
    !SUPPORTED_OPERATIONS.includes(operation))
  if (!operations.length || unsupported.length) {
    return {
      outcome: 'needs_model',
      content: input.content,
      operations,
      changedLineCount: 0,
      durationMs: performance.now() - started,
      validation: validationFailure(unsupported.length
        ? `不支持本地执行：${unsupported.join(', ')}`
        : '没有可本地执行的操作'),
      reason: unsupported.length ? 'unsupported_operation' : 'empty_operations',
    }
  }
  let lines = classifyLines(input.content)
  if (operations.includes('remove_exact_duplicates')) {
    lines = removeExactDuplicates(lines)
  }
  if (operations.includes('reorder_sections')) lines = reorderSections(lines)
  if (operations.includes('normalize_punctuation')) lines = normalizePunctuation(lines)
  if (operations.includes('word_layout_normalize')) lines = wordLayoutNormalize(lines)
  if (operations.includes('normalize_numbering')) lines = normalizeNumbering(lines)
  if (operations.includes('normalize_blank_lines')) lines = normalizeBlankLines(lines)

  const output = joinLines(lines)
  const validation = validateTransform({ content: input.content, output, operations })
  if (!validation.ok) {
    return {
      outcome: 'needs_model',
      content: input.content,
      operations,
      changedLineCount: 0,
      durationMs: performance.now() - started,
      validation,
      reason: 'validation_failed',
    }
  }
  return {
    outcome: input.content === output ? 'no_change' : 'completed',
    content: output,
    operations,
    changedLineCount: countChangedLines(input.content, output),
    durationMs: performance.now() - started,
    validation,
  }
}
