import type { EditorEditBatchCommand, EditorEditCommand, EditorEditOperation } from './editorEditProtocol'
import { parseOutlineStructure, type OutlineNodeKind, type OutlineStructureNode } from './outlineStructure'

export interface OutlineProposalAnchor {
  volumeTitle?: string
  chapterTitle?: string
  sectionTitle?: string
}

export interface OutlineProposal {
  type: 'outline_proposal'
  version: 1
  operation: EditorEditOperation
  content?: string
  target?: string
  anchor?: OutlineProposalAnchor
  reason: string
  impact: string[]
}

export interface OutlineProposalResult {
  proposal: OutlineProposal
  batch: EditorEditBatchCommand
}

export interface OutlineImpactNode {
  id: string
  title: string
  kind: OutlineNodeKind
  path: string
}

export interface OutlineImpactReference {
  keyword: string
  start: number
  end: number
  nodeId: string | null
  nodeTitle: string | null
  nodePath: string | null
  context: string
}

export interface OutlineImpactReport {
  affectedNodes: OutlineImpactNode[]
  references: OutlineImpactReference[]
  summary: string
}

const operations = new Set<EditorEditOperation>([
  'insert',
  'replace_selection',
  'replace_match',
  'append',
  'delete',
  'rewrite'
])
const MAX_PROPOSAL_LENGTH = 80000
const MAX_COMMAND_LENGTH = 20000
const MAX_IMPACT_ITEMS = 10
const MAX_REFERENCES = 30
const REFERENCE_CONTEXT_CHARS = 96
const MAX_UNIQUE_REFERENCE_CONTEXTS = 8
const STOP_REFERENCE_WORDS = new Set(['内容', '大纲', '正文', '章节'])
const STOP_REFERENCE_FRAGMENTS = new Set(['男主', '风暴起点', '风暴', '起点', '主在', '暴起'])

function extractJsonCandidate(raw: string): Record<string, unknown> | null {
  if (!raw || raw.length > MAX_PROPOSAL_LENGTH) return null
  let candidate = raw.trim()
  const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) candidate = fence[1].trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

function normalizeOperation(value: unknown): EditorEditOperation | null {
  if (value === 'replace_section') return 'replace_match'
  if (value === 'rewrite_section') return 'rewrite'
  return typeof value === 'string' && operations.has(value as EditorEditOperation)
    ? value as EditorEditOperation
    : null
}

function normalizeAnchor(value: unknown): OutlineProposalAnchor | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const source = value as Record<string, unknown>
  const anchor: OutlineProposalAnchor = {}
  for (const key of ['volumeTitle', 'chapterTitle', 'sectionTitle'] as const) {
    const title = source[key]
    if (typeof title === 'string' && title.trim()) anchor[key] = title.trim()
  }
  return Object.keys(anchor).length ? anchor : undefined
}

/**
 * Distills a structured discussion proposal from an assistant response. A
 * failed distillation returns null and must never block normal conversation.
 */
export function parseOutlineProposal(raw: string): OutlineProposalResult | null {
  const parsed = extractJsonCandidate(raw)
  if (!parsed || parsed.type !== 'outline_proposal') return null

  const operation = normalizeOperation(parsed.operation)
  if (!operation) return null
  const content = typeof parsed.content === 'string' ? parsed.content : undefined
  const target = typeof parsed.target === 'string' ? parsed.target.trim() : undefined
  if (content !== undefined && content.length > MAX_COMMAND_LENGTH) return null
  if (operation !== 'delete' && typeof content !== 'string') return null
  if (['replace_match', 'delete', 'rewrite'].includes(operation) && !target) return null
  if (typeof parsed.reason !== 'string' || !parsed.reason.trim()) return null
  if (!Array.isArray(parsed.impact) || parsed.impact.length === 0 || parsed.impact.length > MAX_IMPACT_ITEMS) return null
  const impact = parsed.impact.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  if (impact.length !== parsed.impact.length) return null

  const anchor = normalizeAnchor(parsed.anchor)
  const command: EditorEditCommand = {
    type: 'editor_edit',
    version: 1,
    operation,
    content,
    target,
    ...(anchor?.volumeTitle ? { volumeTitle: anchor.volumeTitle } : {}),
    ...(anchor?.chapterTitle ? { chapterTitle: anchor.chapterTitle } : {}),
    ...(anchor?.sectionTitle ? { sectionTitle: anchor.sectionTitle } : {}),
    position: 'end',
    reason: parsed.reason.trim()
  }

  return {
    proposal: {
      type: 'outline_proposal',
      version: 1,
      operation,
      content,
      target,
      anchor,
      reason: parsed.reason.trim(),
      impact
    },
    batch: {
      type: 'editor_edit_batch',
      version: 1,
      commands: [command],
      reason: parsed.reason.trim()
    }
  }
}

interface FlatOutlineNode {
  node: OutlineStructureNode
  path: string
}

function flattenNodes(nodes: OutlineStructureNode[], parentPath = ''): FlatOutlineNode[] {
  const result: FlatOutlineNode[] = []
  for (const node of nodes) {
    const title = node.kind === 'volume' || node.kind === 'chapter' || node.kind === 'section'
      ? node.title.split(/[。.]/)[0].trim()
      : node.title
    const path = parentPath ? `${parentPath} / ${title}` : title
    result.push({ node, path })
    result.push(...flattenNodes(node.children, path))
  }
  return result
}

function findDeepestNode(entries: FlatOutlineNode[], start: number, end: number): FlatOutlineNode | null {
  let deepest: FlatOutlineNode | null = null
  for (const entry of entries) {
    if (entry.node.start <= start && end <= entry.node.end) {
      if (!deepest || entry.node.end - entry.node.start < deepest.node.end - deepest.node.start) {
        deepest = entry
      }
    }
  }
  return deepest
}

function nodeDisplayTitle(entry: FlatOutlineNode): string {
  if (entry.node.kind !== 'paragraph') return entry.node.title
  return (entry.node.summaryHead || entry.node.title).trim() || entry.node.title
}

function contextWindow(content: string, start: number, end: number): string {
  const from = Math.max(0, start - REFERENCE_CONTEXT_CHARS / 2)
  const to = Math.min(content.length, end + REFERENCE_CONTEXT_CHARS / 2)
  return content.slice(from, to)
}

/**
 * First-version impact analysis: deterministic structure indexing plus exact
 * lexical references. It only explains scope; it never modifies content.
 */
export function analyzeOutlineProposalImpact(
  original: string,
  items: Array<{ range?: { start: number; end: number }; target?: string }>
): OutlineImpactReport {
  const content = typeof original === 'string' ? original : ''
  const structure = parseOutlineStructure(content)
  const entries = flattenNodes(structure.nodes)
  const affected = new Map<string, OutlineImpactNode>()
  const references: OutlineImpactReference[] = []
  const seenReferenceStarts = new Set<number>()
  const excludedRanges: Array<{ start: number; end: number }> = []

  for (const item of items) {
    let range = item.range
    if (!range && item.target && content.includes(item.target)) {
      const index = content.indexOf(item.target)
      range = { start: index, end: index + item.target.length }
    }
    if (!range) continue

    const deepest = findDeepestNode(entries, range.start, Math.max(range.end, range.start + 1))
    if (deepest) {
      affected.set(deepest.node.id, {
        id: deepest.node.id,
        title: deepest.path.split(' / ').at(-1) || deepest.node.title,
        kind: deepest.node.kind,
        path: deepest.path
      })
      excludedRanges.push({ start: deepest.node.start, end: deepest.node.end })
      const rawKeywords = [deepest.path.split(' / ').at(-1) || deepest.node.title, item.target]
      for (const ancestor of deepest.path.split(' / ').slice(0, -1)) rawKeywords.push(ancestor)
      const keywordSet = new Set<string>()
      for (const keyword of rawKeywords) {
        if (typeof keyword !== 'string') continue
        const segments = keyword
          .split(/[：:。；;，,、！？\s]+/)
          .flatMap(part => [
            part,
            ...(part.match(/[\u4e00-\u9fffA-Za-z0-9]+/g) || []).flatMap(word =>
              word.length >= 4
                ? Array.from({ length: word.length - 1 }, (_, offset) => word.slice(offset, offset + 2)).concat(word)
                : [word]
            )
          ])
          .filter(part => part.length >= 2)
        for (const part of segments) {
          if (STOP_REFERENCE_FRAGMENTS.has(part)) continue
          if (!STOP_REFERENCE_WORDS.has(part) && !part.match(/^(第[0-9一二三四五六七八九十百千万零两]+[卷章节回]|[0-9一二三四五六七八九十百千万零两]+)$/)) {
            keywordSet.add(part)
          }
        }
      }
      const keywords = [...keywordSet]
      for (const keyword of new Set(keywords)) {
        let index = content.indexOf(keyword)
        while (index >= 0 && references.length < MAX_REFERENCES) {
          const end = index + keyword.length
          const insideAffected = excludedRanges.some(range => index >= range.start && end <= range.end)
          const context = contextWindow(content, index, end)
          const overlapsAccepted = references.some(reference =>
            index < reference.end && reference.start < end
          )
          if (
            !insideAffected &&
            !seenReferenceStarts.has(index) &&
            !overlapsAccepted
          ) {
            seenReferenceStarts.add(index)
            const owner = findDeepestNode(entries, index, end)
            references.push({
              keyword,
              start: index,
              end,
              nodeId: owner?.node.id || null,
              nodeTitle: owner ? nodeDisplayTitle(owner) : null,
              nodePath: owner?.path || null,
              context
            })
          }
          index = content.indexOf(keyword, index + 1)
        }
      }
    }
  }

  return {
    affectedNodes: [...affected.values()],
    references,
    summary: references.length
      ? `发现 ${references.length} 处引用可能受影响`
      : '未发现直接影响'
  }
}
