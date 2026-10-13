export type OutlineScopeKind = 'volume-permanent' | 'unit' | 'unit-draft'

export interface OutlineScopeSection {
  id: string
  title: string
  level: number
  startIndex: number
  endIndex: number
  scope: string | null
  kind: OutlineScopeKind | null
  unitId: string | null
  retired: boolean
  text: string
}

export interface OutlineContextScopeInput {
  outline: string
  unitId?: string
  volumeSummary?: string
  chapterDetail?: string
  includeUnitDraft?: boolean
  targetBytes?: number
  maxBytes?: number
}

export interface OutlineContextScopeError {
  code:
    | 'outline_empty'
    | 'unit_not_found'
    | 'scope_invalid'
    | 'closure_empty'
    | 'closure_over_budget'
  message: string
}

export interface OutlineContextScopeResult {
  ok: boolean
  closure: string
  sections: OutlineScopeSection[]
  permanentCount: number
  unitCount: number
  undeclaredCount: number
  closureBytes: number
  targetBytes: number
  maxBytes: number
  trimmed: string[]
  warnings: string[]
  degradedReason: string | null
  errors: OutlineContextScopeError[]
}

const HEADING_RE = /^(#{2,4})\s+(.*\S)\s*$/
const SCOPE_RE = /^>\s*作用域[：:]\s*(.+?)\s*$/
const RETIRED_RE = /^\s*(?:[-*]\s*)?⊘|^\s*\|\s*⊘/
const UNIT_ID_RE = /^[A-Za-z][\w-]*$/
const UNIT_IN_TITLE_RE = /(?:^|[^A-Za-z0-9_-])([A-Za-z][A-Za-z0-9_-]*\d+(?:-\d+)?|U\d+)(?![A-Za-z0-9_-])/
const STORY_UNIT_IN_TITLE_RE = /剧情单元\s+([A-Za-z][\w-]*)/
const CH_RANGE_RE = /章节范围[：:]\s*第\s*(\d+)\s*[-–—~至]\s*(\d+)\s*章/
const ARC_ROW_RE = /^\|\s*第?\s*(\d+)\s*章?\s*\|/

const TARGET_BYTES = 12_000
const MAX_BYTES = 24_000

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

function parseScopeHead(head: string): { kind: OutlineScopeKind | null; unitId: string | null } {
  if (head === '卷级常任') return { kind: 'volume-permanent', unitId: null }
  const unitMatch = head.match(/^单元级\s+([A-Za-z][\w-]*)$/)
  if (unitMatch) return { kind: 'unit', unitId: unitMatch[1] }
  const draftMatch = head.match(/^批次底稿\s+([A-Za-z][\w-]*)$/)
  if (draftMatch) return { kind: 'unit-draft', unitId: draftMatch[1] }
  return { kind: null, unitId: null }
}

function parseOutlineSections(outline: string): OutlineScopeSection[] {
  const lines = outline.split('\n')
  const headings: Array<{ level: number; title: string; startIndex: number }> = []
  let fenceMarker: string | null = null
  lines.forEach((line, index) => {
    const fence = line.match(/^\s{0,3}(`{3,}|~{3,})/)
    if (fence) {
      if (fenceMarker === null) fenceMarker = fence[1]
      else if (fence[1][0] === fenceMarker[0] && fence[1].length >= fenceMarker.length) fenceMarker = null
      return
    }
    if (fenceMarker) return
    const heading = line.match(HEADING_RE)
    if (heading && heading[2] !== undefined) {
      headings.push({ level: heading[1].length, title: heading[2], startIndex: index })
    }
  })

  return headings.map((heading, index) => {
    const endIndex = index + 1 < headings.length ? headings[index + 1].startIndex : lines.length
    const sectionLines = lines.slice(heading.startIndex, endIndex)
    let scope: string | null = null
    for (const candidate of sectionLines.slice(1)) {
      if (!candidate.trim()) continue
      const scopeMatch = candidate.match(SCOPE_RE)
      if (scopeMatch) scope = scopeMatch[1]
      break
    }
    let kind: OutlineScopeKind | null = null
    let unitId: string | null = null
    let retired = false
    if (scope) {
      const head = scope.split('｜')[0].trim()
      const parsed = parseScopeHead(head)
      kind = parsed.kind
      unitId = parsed.unitId
      retired = scope.includes('已退役')
    }
    if (!unitId) {
      const titleUnit = heading.title.match(STORY_UNIT_IN_TITLE_RE) || heading.title.match(UNIT_IN_TITLE_RE)
      if (titleUnit) unitId = titleUnit[1]
    }
    if (!unitId && !scope) {
      for (const line of sectionLines.slice(1)) {
        const field = line.replace(/\*\*/g, '').match(/^\s*[-*+]\s*单元ID\s*[：:]\s*([A-Za-z][\w-]*)\s*$/)
        if (field) {
          unitId = field[1]
          break
        }
      }
    }
    return {
      id: `section-${index + 1}`,
      title: heading.title,
      level: heading.level,
      startIndex: heading.startIndex,
      endIndex,
      scope,
      kind,
      unitId,
      retired,
      text: sectionLines.join('\n').trimEnd()
    }
  })
}

function stripRetired(section: OutlineScopeSection): string {
  if (!section.retired) return section.text
  return section.text
    .split('\n')
    .filter(line => !RETIRED_RE.test(line))
    .join('\n')
    .trimEnd()
}

function unitChapterRange(sections: OutlineScopeSection[], unitId: string): { start: number; end: number } | null {
  for (const section of sections) {
    if (section.unitId !== unitId || section.kind !== 'unit' || !section.title.includes('剧情单元')) continue
    const match = section.text.match(CH_RANGE_RE)
    if (match) return { start: Number(match[1]), end: Number(match[2]) }
  }
  return null
}

function sliceArc(section: OutlineScopeSection, span: { start: number; end: number } | null): string {
  if (!span || (!section.title.includes('情绪弧线') && !section.title.includes('排班'))) return section.text
  const kept = section.text.split('\n').filter(line => {
    const row = line.match(ARC_ROW_RE)
    if (!row) return true
    const chapter = Number(row[1])
    return span.start <= chapter && chapter <= span.end
  })
  return kept.join('\n').trimEnd()
}

export function validateOutlineContextScope(outline: string): OutlineContextScopeResult {
  const sections = parseOutlineSections(outline || '')
  const errors: OutlineContextScopeError[] = []
  const legacyOutline = Boolean(outline?.trim()) && !sections.some(section => section.scope)
  if (!outline || !outline.trim()) {
    errors.push({ code: 'outline_empty', message: '卷纲为空，无法构建上下文闭包' })
  } else if (sections.length === 0 && !legacyOutline) {
    errors.push({ code: 'closure_empty', message: '卷纲缺少可解析的 ## 段，无法构建上下文闭包' })
  }
  for (const section of sections) {
    if (section.scope && section.kind === null) {
      errors.push({
        code: 'scope_invalid',
        message: `第 ${section.startIndex + 1} 行「${section.title}」作用域声明无效：${section.scope}`
      })
    }
    if (section.kind && section.kind !== 'volume-permanent' && !section.unitId) {
      errors.push({
        code: 'scope_invalid',
        message: `第 ${section.startIndex + 1} 行「${section.title}」单元级/批次底稿段未标单元ID`
      })
    }
  }
  return {
    ok: errors.length === 0,
    closure: '',
    sections,
    permanentCount: 0,
    unitCount: 0,
    undeclaredCount: 0,
    closureBytes: 0,
    targetBytes: TARGET_BYTES,
    maxBytes: MAX_BYTES,
    trimmed: [],
    warnings: sections
      .filter(section => !section.scope)
      .map(section => `第 ${section.startIndex + 1} 行「${section.title}」未声明作用域`),
    degradedReason: legacyOutline ? 'legacy_outline_no_scope' : null,
    errors
  }
}

export function buildOutlineUnitClosure(input: OutlineContextScopeInput): OutlineContextScopeResult {
  const targetBytes = Math.max(1, Math.floor(input.targetBytes ?? TARGET_BYTES))
  const maxBytes = Math.max(targetBytes, Math.floor(input.maxBytes ?? MAX_BYTES))
  const sections = parseOutlineSections(input.outline || '')
  const errors: OutlineContextScopeError[] = []
  const warnings: string[] = []
  const legacyOutline = Boolean(input.outline?.trim()) && !sections.some(section => section.scope)
  if (!input.outline || !input.outline.trim()) {
    errors.push({ code: 'outline_empty', message: '卷纲为空，无法构建上下文闭包' })
  } else if (sections.length === 0 && !legacyOutline) {
    errors.push({ code: 'closure_empty', message: '卷纲缺少可解析的 ## 段，无法构建上下文闭包' })
  }
  for (const section of sections) {
    if (section.scope && section.kind === null) {
      errors.push({
        code: 'scope_invalid',
        message: `第 ${section.startIndex + 1} 行「${section.title}」作用域声明无效：${section.scope}`
      })
    }
    if (section.kind && section.kind !== 'volume-permanent' && !section.unitId) {
      errors.push({
        code: 'scope_invalid',
        message: `第 ${section.startIndex + 1} 行「${section.title}」单元级/批次底稿段未标单元ID`
      })
    }
  }
  const legacyWithoutScope = legacyOutline
  if (errors.length > 0) {
    return {
      ok: false,
      closure: '',
      sections,
      permanentCount: 0,
      unitCount: 0,
      undeclaredCount: 0,
      closureBytes: 0,
      targetBytes,
      maxBytes,
      trimmed: [],
      degradedReason: legacyWithoutScope ? 'legacy_outline_no_scope' : null,
      warnings,
      errors
    }
  }

  const active = sections.filter(section => !section.retired)
  const unitId = input.unitId?.trim() || ''
  const hasScopeDeclaration = active.some(section => section.scope)
  let owned = active.filter(section => section.unitId === unitId)
  if (unitId && owned.length === 0 && hasScopeDeclaration) {
    errors.push({ code: 'unit_not_found', message: `找不到单元 ${unitId}，不静默降级；请核对单元ID或补卷纲` })
    return {
      ok: false,
      closure: '',
      sections,
      permanentCount: 0,
      unitCount: 0,
      undeclaredCount: 0,
      closureBytes: 0,
      targetBytes,
      maxBytes,
      trimmed: [],
      degradedReason: null,
      warnings,
      errors
    }
  }
  if (!unitId) owned = []

  if (legacyWithoutScope) {
    const volumeSummary = (input.volumeSummary || '').trim()
    const chapterDetail = (input.chapterDetail || '').trim()
    errors.push({
      code: 'closure_empty',
      message: '旧卷纲缺少卷概要或当前章细纲，无法显式降级'
    })
    if (!volumeSummary || !chapterDetail) {
      return {
        ok: false,
        closure: '',
        sections,
        permanentCount: 0,
        unitCount: 0,
        undeclaredCount: active.length,
        closureBytes: 0,
        targetBytes,
        maxBytes,
        trimmed: [],
        warnings,
        degradedReason: 'legacy_outline_no_scope',
        errors
      }
    } else {
      errors.pop()
      const legacyBlocks = [
        `[旧卷纲显式降级：卷概要]\n${volumeSummary}`,
        `[旧卷纲显式降级：当前章细纲]\n${chapterDetail}`
      ]
      const legacyClosure = legacyBlocks.join('\n\n')
      const legacyBytes = byteLength(legacyClosure)
      if (legacyBytes > maxBytes) {
        errors.push({ code: 'closure_over_budget', message: '旧卷纲显式降级闭包超过预算，不截断半段' })
      } else {
        return {
          ok: true,
          closure: legacyClosure,
          sections,
          permanentCount: 0,
          unitCount: 0,
          undeclaredCount: active.length,
          closureBytes: legacyBytes,
          targetBytes,
          maxBytes,
          trimmed: [],
          warnings,
          degradedReason: 'legacy_outline_no_scope',
          errors
        }
      }
      return {
        ok: false,
        closure: '',
        sections,
        permanentCount: 0,
        unitCount: 0,
        undeclaredCount: active.length,
        closureBytes: 0,
        targetBytes,
        maxBytes,
        trimmed: [],
        warnings,
        degradedReason: 'legacy_outline_no_scope',
        errors
      }
    }
  }

  const permanent = active.filter(section => section.kind === 'volume-permanent')
  const undeclared = active.filter(section => !section.scope)
  const live = owned.filter(section => section.kind === 'unit' || (input.includeUnitDraft === true && section.kind === 'unit-draft'))
  const span = unitId ? unitChapterRange(active, unitId) : null
  const chosen = [...permanent, ...live, ...undeclared]
  warnings.push(
    ...undeclared.map(section => `第 ${section.startIndex + 1} 行「${section.title}」未声明作用域，已保守纳入`)
  )

  const blocks: string[] = []
  const trimmed: string[] = []
  let closureBytes = 0
  for (const section of chosen) {
    const block = sliceArc(section, span)
    const blockBytes = byteLength(block)
    if (closureBytes + blockBytes <= targetBytes) {
      blocks.push(block)
      closureBytes += blockBytes
      continue
    }
    if (closureBytes + blockBytes <= maxBytes) {
      blocks.push(block)
      closureBytes += blockBytes
      continue
    }
    trimmed.push(section.title)
  }
  if (blocks.length === 0) {
    errors.push({ code: 'closure_empty', message: '当前单元闭包为空，不静默降级' })
  }

  return {
    ok: errors.length === 0,
    closure: blocks.join('\n\n'),
    sections,
    permanentCount: permanent.length,
    unitCount: live.length,
    undeclaredCount: undeclared.length,
    closureBytes,
    targetBytes,
    maxBytes,
    trimmed,
    warnings,
    degradedReason: null,
    errors
  }
}
