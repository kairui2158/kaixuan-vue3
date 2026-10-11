export type OutlineNodeKind = 'volume' | 'chapter' | 'section' | 'heading' | 'paragraph'

export interface OutlineStructureNode {
  id: string
  title: string
  kind: OutlineNodeKind
  level: number
  start: number
  contentStart: number
  end: number
  charCount: number
  summaryHead: string
  children: OutlineStructureNode[]
}

export interface OutlineStructure {
  nodes: OutlineStructureNode[]
  degraded: boolean
  degradedReason: string | null
  /** Stable identity of the structural node set, independent of ranges and prose. */
  structureIdentity: string
  totalChars: number
  volumeCount: number
  chapterCount: number
  sectionCount: number
  mapText: string
}

interface HeadingCandidate {
  start: number
  end: number
  title: string
  kind: OutlineNodeKind
  level: number
  normalizedId: string
}

const MARKDOWN_HEADING = /^(#{1,6})\s+(.+?)\s*$/
const CHINESE_NUMBER = '[0-9一二三四五六七八九十百千万零两]+'
const VOLUME_HEADING = new RegExp(`^(?:第\\s*(${CHINESE_NUMBER})\\s*卷|卷\\s*(${CHINESE_NUMBER}))(?:[：:·.\\-—\\s]\\s*(.*))?$`)
const CHAPTER_HEADING = new RegExp(`^(?:第\\s*(${CHINESE_NUMBER})\\s*[章回]|章节\\s*(${CHINESE_NUMBER}))(?:[：:·.\\-—\\s]\\s*(.*))?$`)
const SECTION_HEADING = new RegExp(`^(?:第\\s*(${CHINESE_NUMBER})\\s*节|小节\\s*(${CHINESE_NUMBER}))(?:[：:·.\\-—\\s]\\s*(.*))?$`)
const CHINESE_DIGITS: Record<string, string> = {
  零: '0', 一: '1', 二: '2', 两: '2', 三: '3', 四: '4', 五: '5', 六: '6', 七: '7', 八: '8', 九: '9'
}
const HEADING_MAX_CHARS = 80
const MAX_PARAGRAPH_CHARS = 800
const SUMMARY_HEAD_CHARS = 80

function stableIdentitySuffix(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(36)
}

function normalizeChineseNumber(value: string): string {
  const trimmed = value.replace(/\s+/g, '')
  if (/^[0-9]+$/.test(trimmed)) return String(Number(trimmed))
  if (trimmed === '十') return '10'
  if (trimmed === '百') return '100'
  if (trimmed === '千') return '1000'
  if (trimmed === '万') return '10000'
  let result = ''
  for (const char of trimmed) {
    if (CHINESE_DIGITS[char]) result += CHINESE_DIGITS[char]
    else return trimmed
  }
  return result ? String(Number(result)) : trimmed
}

function lineStarts(text: string): number[] {
  const starts: number[] = []
  let current = 0
  for (const line of text.split('\n')) {
    starts.push(current)
    current += line.length + 1
  }
  return starts
}

function parseHeading(line: string): { kind: OutlineNodeKind; level: number; title: string; normalizedId: string } | null {
  if (!line.trim() || line.trim().length > HEADING_MAX_CHARS) return null
  const markdown = MARKDOWN_HEADING.exec(line)
  if (markdown) {
    const level = markdown[1].length
    const title = markdown[2].trim()
    return { kind: 'heading', level, title, normalizedId: `heading:${level}:${title}` }
  }
  const trimmed = line.trim()
  const volume = VOLUME_HEADING.exec(trimmed)
  if (volume) {
    const number = normalizeChineseNumber(volume[1] || volume[2] || '')
    return { kind: 'volume', level: 1, title: trimmed, normalizedId: `volume:${number}` }
  }
  const chapter = CHAPTER_HEADING.exec(trimmed)
  if (chapter) {
    const number = normalizeChineseNumber(chapter[1] || chapter[2] || '')
    return { kind: 'chapter', level: 2, title: trimmed, normalizedId: `chapter:${number}` }
  }
  const section = SECTION_HEADING.exec(trimmed)
  if (section) {
    const number = normalizeChineseNumber(section[1] || section[2] || '')
    return { kind: 'section', level: 3, title: trimmed, normalizedId: `section:${number}` }
  }
  return null
}

function buildHeadingCandidates(text: string): HeadingCandidate[] {
  const lines = text.split('\n')
  const starts = lineStarts(text)
  const candidates: HeadingCandidate[] = []
  for (let i = 0; i < lines.length; i += 1) {
    const nextStart = i + 1 < lines.length ? starts[i + 1] : text.length
    const parsed = parseHeading(lines[i])
    if (parsed) candidates.push({ start: starts[i], end: nextStart, ...parsed })
  }
  return candidates
}

function hasDuplicateHeadings(candidates: HeadingCandidate[]): boolean {
  const seen = new Set<string>()
  for (const candidate of candidates) {
    if (candidate.kind === 'heading') continue
    if (seen.has(candidate.normalizedId)) return true
    seen.add(candidate.normalizedId)
  }
  return false
}

function buildHeadingTree(candidates: HeadingCandidate[], textLength: number): OutlineStructureNode[] {
  const roots: OutlineStructureNode[] = []
  const stack: Array<{ node: OutlineStructureNode; candidate: HeadingCandidate }> = []
  const occurrences = new Map<string, number>()

  const makeNode = (candidate: HeadingCandidate): OutlineStructureNode => {
    const identityKey = `${candidate.kind}:${candidate.normalizedId}`
    const occurrence = (occurrences.get(identityKey) ?? 0) + 1
    occurrences.set(identityKey, occurrence)
    // Node ids are semantic identities, not positions. Numbered volume/chapter/
    // section ids stay stable across insertion, deletion, and reorder; markdown
    // headings and fallback blocks use content hashes with occurrence suffixes.
    const baseId = candidate.kind === 'heading'
      ? `heading-${candidate.level}-${stableIdentitySuffix(candidate.title)}`
      : `${candidate.kind}-${candidate.normalizedId.slice(candidate.kind.length + 1)}`
    return {
      id: occurrence > 1 ? `${baseId}~${occurrence}` : baseId,
      title: candidate.title,
      kind: candidate.kind,
      level: candidate.level,
      start: candidate.start,
      contentStart: candidate.end,
      end: candidate.end,
      charCount: 0,
      summaryHead: '',
      children: []
    }
  }

  for (const candidate of candidates) {
    const node = makeNode(candidate)
    while (stack.length && stack[stack.length - 1].candidate.level >= candidate.level) {
      const closed = stack.pop()
      if (closed) closed.node.end = Math.max(closed.node.start + 1, candidate.start)
    }
    const parent = stack[stack.length - 1]
    if (parent) parent.node.children.push(node)
    else roots.push(node)
    stack.push({ node, candidate })
  }
  while (stack.length) {
    const closed = stack.pop()
    if (closed) closed.node.end = Math.max(closed.node.start + 1, textLength)
  }
  return roots
}

function fillGaps(nodes: OutlineStructureNode[], from: number, to: number, makeParagraph: (start: number, end: number) => OutlineStructureNode): OutlineStructureNode[] {
  const filled: OutlineStructureNode[] = []
  let cursor = from
  for (const node of nodes) {
    if (node.start > cursor) filled.push(makeParagraph(cursor, node.start))
    filled.push(node)
    cursor = Math.max(cursor, node.end)
    fillChildGaps(node, makeParagraph)
  }
  if (to > cursor) filled.push(makeParagraph(cursor, to))
  return filled
}

function fillChildGaps(node: OutlineStructureNode, makeParagraph: (start: number, end: number) => OutlineStructureNode): void {
  if (node.kind === 'paragraph' || !node.children.length) return
  node.children = fillGaps(node.children, node.contentStart, node.end, makeParagraph)
}

function fallbackParagraphNodes(text: string): OutlineStructureNode[] {
  const blocks: Array<{ start: number; end: number }> = []
  let start = -1
  for (let i = 0; i <= text.length; i += 1) {
    const char = text[i]
    const isText = i < text.length && char !== '\n' && char !== '\r'
    if (isText && start < 0) start = i
    if ((!isText || i === text.length) && start >= 0) {
      if (!blocks.length || blocks[blocks.length - 1].end - blocks[blocks.length - 1].start >= MAX_PARAGRAPH_CHARS) {
        blocks.push({ start, end: i })
      } else {
        blocks[blocks.length - 1].end = i
      }
      start = -1
    }
  }
  if (!blocks.length) return []
  blocks[0].start = 0
  for (let i = 0; i < blocks.length - 1; i += 1) blocks[i].end = blocks[i + 1].start
  blocks[blocks.length - 1].end = text.length
  const occurrences = new Map<string, number>()
  return blocks.map((block, index) => {
    const body = text.slice(block.start, block.end)
    const identity = stableIdentitySuffix(body)
    const occurrence = (occurrences.get(identity) ?? 0) + 1
    occurrences.set(identity, occurrence)
    return {
      id: occurrence > 1 ? `paragraph-${identity}~${occurrence}` : `paragraph-${identity}`,
      title: `段落块 ${index + 1}`,
      kind: 'paragraph' as const,
      level: 1,
      start: block.start,
      contentStart: block.start,
      end: block.end,
      charCount: block.end - block.start,
      summaryHead: text.slice(block.start, Math.min(block.end, block.start + SUMMARY_HEAD_CHARS)).trim(),
      children: []
    }
  })
}

function decorate(nodes: OutlineStructureNode[], text: string): void {
  for (const node of nodes) {
    decorate(node.children, text)
    if (!node.children.length) {
      const body = text.slice(node.contentStart, node.end).trim()
      node.summaryHead = body.slice(0, SUMMARY_HEAD_CHARS)
    }
    node.charCount = Math.max(0, node.end - node.contentStart)
  }
}

function buildMapText(structure: Omit<OutlineStructure, 'mapText'>): string {
  const lines: string[] = []
  lines.push(`大纲结构地图：卷 ${structure.volumeCount}，章 ${structure.chapterCount}，节 ${structure.sectionCount}，总计 ${structure.totalChars} 字`)
  lines.push(structure.degraded ? '解析模式：降级（段落块索引）' : '解析模式：标准标题层级')
  const walk = (nodes: OutlineStructureNode[], depth: number) => {
    for (const node of nodes) {
      lines.push(`${'  '.repeat(depth)}- [${node.id}] ${node.title} (${node.start}-${node.end}, ${node.charCount}字)`)
      walk(node.children, depth + 1)
    }
  }
  walk(structure.nodes, 0)
  return lines.join('\n')
}

export function parseOutlineStructure(text: string): OutlineStructure {
  const source = typeof text === 'string' ? text : ''
  const totalChars = source.length
  const candidates = buildHeadingCandidates(source)
  const useFallback = candidates.length === 0 || hasDuplicateHeadings(candidates)
  let paragraphSeq = 0
  const paragraphOccurrences = new Map<string, number>()
  const makeParagraph = (start: number, end: number): OutlineStructureNode => {
    paragraphSeq += 1
    paragraphSeq += 1
    const occurrence = paragraphSeq
    const identity = `gap-${paragraphSeq}`
    return {
      id: `paragraph-${identity}`,
      title: `内容块 ${paragraphSeq}`,
      kind: 'paragraph',
      level: 1,
      start,
      contentStart: start,
      end,
      charCount: 0,
      summaryHead: '',
      children: []
    }
  }
  const headingRoots = useFallback ? [] : buildHeadingTree(candidates, source.length)
  const nodes = useFallback ? fallbackParagraphNodes(source) : fillGaps(headingRoots, 0, source.length, makeParagraph)
  decorate(nodes, source)
  const countKind = (kind: OutlineNodeKind) => nodes.reduce((sum, node) => sum + countKindIn(node, kind), 0)
  const base = {
    nodes,
    degraded: useFallback,
    degradedReason: useFallback
      ? (candidates.length === 0 ? '未识别到标题，降级为段落块索引' : '卷/章/节编号重复，降级为段落块索引')
      : null,
    totalChars,
    volumeCount: countKind('volume'),
    chapterCount: countKind('chapter'),
    sectionCount: countKind('section')
  }
  const baseWithIdentity = {
    ...base,
    structureIdentity: buildStructureIdentity(base),
  }
  return { ...baseWithIdentity, mapText: buildMapText(baseWithIdentity) }
}

function buildStructureIdentity(
  structure: Omit<OutlineStructure, 'mapText' | 'structureIdentity'>,
): string {
  const ids: string[] = []
  const walk = (nodes: OutlineStructureNode[]) => {
    for (const node of nodes) {
      ids.push(node.id)
      walk(node.children)
    }
  }
  walk(structure.nodes)
  const identity = `${structure.degraded ? 'degraded' : 'standard'}|${ids.join('|')}`
  return `structure-${stableIdentitySuffix(identity)}`
}

function countKindIn(node: OutlineStructureNode, kind: OutlineNodeKind): number {
  return (node.kind === kind ? 1 : 0) + node.children.reduce((sum, child) => sum + countKindIn(child, kind), 0)
}

export function assertStructureCoverage(structure: OutlineStructure, textLength: number): { ok: boolean; problems: string[] } {
  const problems: string[] = []
  const walk = (nodes: OutlineStructureNode[], contentStart: number, parentEnd: number, path: string) => {
    if (!nodes.length) return
    let cursor = contentStart
    for (const node of nodes) {
      if (node.start < cursor) problems.push(`${path}${node.id} 起点重叠`)
      if (node.end > parentEnd) problems.push(`${path}${node.id} 越界`)
      if (node.end < node.start) problems.push(`${path}${node.id} 区间倒置`)
      cursor = Math.max(cursor, node.end)
      walk(node.children, node.contentStart, node.end, `${path}${node.id}/`)
    }
    if (cursor < parentEnd) problems.push(`${path || 'root'} 区间缺口 ${parentEnd - cursor} 字`)
  }
  walk(structure.nodes, 0, textLength, '')
  return { ok: problems.length === 0, problems }
}
