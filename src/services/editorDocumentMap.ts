import { EDITOR_CONTEXT_FULL_CONTENT_MAX_CHARS } from './editorContextPolicy'
import { estimateInputTokens } from './contextBudget'
import type { AgentToolContext, AgentToolDefinition, ToolResult } from './editorTools'
import { parseOutlineStructure, type OutlineStructureNode } from './outlineStructure'
import type { EditorTargetSnapshot } from './editorTarget'

export const EDITOR_DOCUMENT_MAP_DEFAULT_READ_CHARS = EDITOR_CONTEXT_FULL_CONTENT_MAX_CHARS
export const EDITOR_DOCUMENT_MAP_MAX_READ_CHARS = EDITOR_CONTEXT_FULL_CONTENT_MAX_CHARS
export const EDITOR_DOCUMENT_MAP_MIN_READ_CHARS = 1000
export const EDITOR_DOCUMENT_MAP_DEFAULT_SECTION_LIMIT = 120
export const EDITOR_DOCUMENT_MAP_MAX_SECTION_LIMIT = 500
export const EDITOR_DOCUMENT_MAP_SEARCH_CONTEXT_CHARS = 160
export const EDITOR_DOCUMENT_MAP_SEARCH_MAX_MATCHES = 1000

export type EditorDocumentCursor = {
  kind: 'section'
  sectionId: string
  offset: number
}

export interface EditorDocumentSection {
  id: string
  title: string
  kind: string
  level: number
  start: number
  end: number
  charCount: number
  summaryHead: string
}

export interface EditorDocumentMap {
  totalChars: number
  estimatedTokens: number
  sectionCount: number
  degraded: boolean
  degradedReason?: string
  sections: EditorDocumentSection[]
}

interface SectionEntry {
  section: EditorDocumentSection
  path: string
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function toolError(code: string, message: string, retryable = false): ToolResult {
  return { ok: false, error: { code, message, retryable } }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function readInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback
}

function sectionSummary(content: string, start: number, end: number): string {
  return content
    .slice(start, end)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

function toDocumentSection(
  node: OutlineStructureNode,
  content: string,
): EditorDocumentSection {
  return {
    id: node.id,
    title: node.title,
    kind: node.kind,
    level: node.level,
    start: node.start,
    end: node.end,
    charCount: node.charCount,
    summaryHead: node.summaryHead || sectionSummary(content, node.start, node.end),
  }
}

function buildSectionIndex(map: EditorDocumentMap): Map<string, SectionEntry> {
  const entries = new Map<string, SectionEntry>()
  const walk = (sections: EditorDocumentSection[], parentPath: string) => {
    for (const section of sections) {
      const path = parentPath ? `${parentPath} / ${section.title}` : section.title
      entries.set(section.id, { section, path })
    }
  }
  walk(map.sections, '')
  return entries
}

export function buildEditorDocumentMap(content: string): EditorDocumentMap {
  const structure = parseOutlineStructure(content)
  const sections: EditorDocumentSection[] = []
  const walk = (nodes: OutlineStructureNode[]) => {
    for (const node of nodes) {
      sections.push(toDocumentSection(node, content))
      walk(node.children)
    }
  }
  walk(structure.nodes)
  return {
    totalChars: structure.totalChars,
    estimatedTokens: estimateInputTokens(content),
    sectionCount: sections.length,
    degraded: structure.degraded,
    degradedReason: structure.degradedReason ?? undefined,
    sections,
  }
}

function encodeCursor(cursor: EditorDocumentCursor): string {
  return `section:${cursor.sectionId}:${cursor.offset}`
}

function decodeCursor(value: unknown): EditorDocumentCursor | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const [kind, sectionId, offsetText] = value.trim().split(':')
  if (kind !== 'section' || !sectionId) return null
  const offset = Number(offsetText)
  if (!Number.isInteger(offset) || offset < 0) return null
  return { kind: 'section', sectionId, offset }
}

function sectionCandidates(entries: Map<string, SectionEntry>, requested: string): Array<{
  id: string
  title: string
  kind: string
}> {
  const needle = requested.trim().toLowerCase()
  if (!needle) return []
  const matches: Array<{ id: string; title: string; kind: string }> = []
  for (const { section } of entries.values()) {
    if (
      section.title.toLowerCase().includes(needle)
      || section.id.toLowerCase().includes(needle)
    ) {
      matches.push({ id: section.id, title: section.title, kind: section.kind })
    }
    if (matches.length >= 5) break
  }
  return matches
}

function findDeepestSection(map: EditorDocumentMap, start: number, end: number): EditorDocumentSection | null {
  let best: EditorDocumentSection | null = null
  for (const section of map.sections) {
    if (section.start <= start && end <= section.end) {
      if (!best || section.end - section.start < best.end - best.start) best = section
    }
  }
  return best
}

function searchContext(content: string, start: number, end: number): string {
  const from = Math.max(0, start - EDITOR_DOCUMENT_MAP_SEARCH_CONTEXT_CHARS / 2)
  const to = Math.min(content.length, end + EDITOR_DOCUMENT_MAP_SEARCH_CONTEXT_CHARS / 2)
  return content.slice(from, to)
}

export function createEditorDocumentMapTools(options: {
  getSnapshot: () => EditorTargetSnapshot | null
  /** Optional hard cap used by callers that know the provider window. */
  maxReadChars?: () => number
}): AgentToolDefinition[] {
  const mapCache = new WeakMap<EditorTargetSnapshot, {
    map: EditorDocumentMap
    entries: Map<string, SectionEntry>
  }>()

  const getState = (): { snapshot: EditorTargetSnapshot; map: EditorDocumentMap; entries: Map<string, SectionEntry> } | null => {
    const snapshot = options.getSnapshot()
    if (!snapshot) return null
    const cached = mapCache.get(snapshot)
    if (cached) return { snapshot, ...cached }
    const map = buildEditorDocumentMap(snapshot.content)
    const entries = buildSectionIndex(map)
    mapCache.set(snapshot, { map, entries })
    return { snapshot, map, entries }
  }

  const documentMap: AgentToolDefinition = {
    name: 'editor.document_map',
    description: '读取当前编辑目标的文档地图：总字符、估算 token、节列表、节范围与摘要头。长文档必须先调用本工具，再分段读取。',
    policy: 'read',
    defaultToolPolicy: 'allowedWithoutPermission',
    riskLevel: 'low',
    inputSchema: {
      type: 'object',
      properties: {
        offset: { type: 'number', description: '节列表起始位置，默认 0' },
        limit: { type: 'number', description: `单次返回节数量，默认 ${EDITOR_DOCUMENT_MAP_DEFAULT_SECTION_LIMIT}，最大 ${EDITOR_DOCUMENT_MAP_MAX_SECTION_LIMIT}` },
      },
    },
    async execute(input) {
      const current = getState()
      if (!current) return toolError('target_missing', '当前没有可编辑目标')
      const params = isPlainObject(input) ? input : {}
      const offset = readInteger(params.offset, 0)
      if (offset >= current.map.sections.length) {
        return toolError('invalid_range', `offset ${offset} 超出节列表长度 ${current.map.sections.length}`)
      }
      const requestedLimit = readInteger(params.limit, EDITOR_DOCUMENT_MAP_DEFAULT_SECTION_LIMIT)
      const limit = clamp(requestedLimit, 1, EDITOR_DOCUMENT_MAP_MAX_SECTION_LIMIT)
      const selected = current.map.sections.slice(offset, offset + limit)
      const hasMore = offset + selected.length < current.map.sections.length
      return {
        ok: true,
        data: {
          totalChars: current.map.totalChars,
          estimatedTokens: current.map.estimatedTokens,
          sectionCount: current.map.sectionCount,
          degraded: current.map.degraded,
          degradedReason: current.map.degradedReason,
          sections: selected,
          offset,
          limit,
          hasMore,
          nextOffset: hasMore ? offset + selected.length : undefined,
          next_steps: hasMore
            ? ['继续调用 editor.document_map 并传入 nextOffset 获取剩余节']
            : ['调用 editor.read_range 传入 sectionId 或 cursor 分段读取全文'],
        },
      }
    },
  }

  const readRange: AgentToolDefinition = {
    name: 'editor.read_range',
    description: '按 sectionId 或 cursor 分段读取编辑目标内容；分页只用 cursor，不支持 offset。写入后节 id 可能变化，读取失败时先刷新 editor.document_map 并使用当前版本 id。',
    policy: 'read',
    defaultToolPolicy: 'allowedWithoutPermission',
    riskLevel: 'low',
    inputSchema: {
      type: 'object',
      properties: {
        cursor: { type: 'string', description: '上一页返回的 nextCursor' },
        sectionId: { type: 'string', description: 'editor.document_map 返回的节 id' },
        maxChars: { type: 'number', description: `单次读取字符数，默认 ${EDITOR_DOCUMENT_MAP_DEFAULT_READ_CHARS}，最大 ${EDITOR_DOCUMENT_MAP_MAX_READ_CHARS}` },
      },
    },
    async execute(input) {
      const current = getState()
      if (!current) return toolError('target_missing', '当前没有可编辑目标')
      const params = isPlainObject(input) ? input : {}
      const unsupportedPaginationKeys = ['offset', 'limit'].filter(key => key in params)
      if (unsupportedPaginationKeys.length > 0) {
        return toolError(
          'invalid_input',
          `editor.read_range 不支持 offset/limit 分页（收到不支持字段：${unsupportedPaginationKeys.join(', ')}）。请传 nextCursor 继续读取当前节，或用 editor.document_map 返回的 sectionId 开始读取。`,
        )
      }
      const cursor = decodeCursor(params.cursor)
      const hasSectionId = typeof params.sectionId === 'string' && params.sectionId.trim().length > 0
      if (!cursor && !hasSectionId) {
        return toolError('invalid_input', '必须提供 sectionId，或传入 document map/read_range 返回的 cursor')
      }
      if (cursor && hasSectionId) {
        return toolError('invalid_input', 'cursor 与 sectionId 二选一，不要同时传入')
      }

      let section: EditorDocumentSection
      let path = ''
      const sectionNotFound = (source: 'cursor' | 'sectionId', requestedId: string): ToolResult => ({
        ok: false,
        error: {
          code: 'section_not_found',
          message: `${source === 'cursor' ? 'cursor 中的节' : '节'}不存在：${requestedId}。写入会改变节 id，请重新调用 editor.document_map，并使用当前版本返回的 sectionId；本次失败前的 cursor 不可复用。`,
          retryable: true,
        },
        data: {
          candidates: sectionCandidates(current.entries, requestedId),
          contentVersion: current.snapshot.contentVersion,
          recovery: [
            '重新调用 editor.document_map',
            '使用当前 document_map 返回的 sectionId',
          ],
        },
      })
      if (cursor) {
        const entry = current.entries.get(cursor.sectionId)
        if (!entry) return sectionNotFound('cursor', cursor.sectionId)
        section = entry.section
        path = entry.path
        if (cursor.offset >= section.charCount) {
          return toolError('invalid_range', `cursor offset ${cursor.offset} 超出节内容长度 ${section.charCount}`)
        }
      } else {
        const entry = current.entries.get((params.sectionId as string).trim())
        if (!entry) return sectionNotFound('sectionId', (params.sectionId as string).trim())
        section = entry.section
        path = entry.path
      }

      const requestedMaxChars = readInteger(params.maxChars, EDITOR_DOCUMENT_MAP_DEFAULT_READ_CHARS)
      const providerCap = options.maxReadChars?.()
      const hardCap = providerCap !== undefined && Number.isFinite(providerCap) && providerCap > 0
        ? Math.floor(providerCap)
        : EDITOR_DOCUMENT_MAP_MAX_READ_CHARS
      if (hardCap < EDITOR_DOCUMENT_MAP_MIN_READ_CHARS) {
        return toolError('range_too_large', `当前上下文预算不足，单次至少需要 ${EDITOR_DOCUMENT_MAP_MIN_READ_CHARS} 字符，可用上限 ${hardCap}`)
      }
      const maxChars = clamp(
        requestedMaxChars,
        EDITOR_DOCUMENT_MAP_MIN_READ_CHARS,
        Math.min(EDITOR_DOCUMENT_MAP_MAX_READ_CHARS, hardCap),
      )
      if (maxChars < EDITOR_DOCUMENT_MAP_MIN_READ_CHARS) {
        return toolError('range_too_large', `当前上下文预算过小，单次至少需要 ${EDITOR_DOCUMENT_MAP_MIN_READ_CHARS} 字符`)
      }
      const offset = cursor ? cursor.offset : 0
      const readStart = section.start + offset
      const readEnd = Math.min(section.end, readStart + maxChars)
      if (readEnd <= readStart) {
        return toolError('invalid_range', '读取区间为空，请检查 cursor 或 sectionId')
      }
      const content = current.snapshot.content.slice(readStart, readEnd)
      const hasMore = readEnd < section.end
      return {
        ok: true,
        data: {
          section: {
            id: section.id,
            title: section.title,
            kind: section.kind,
            level: section.level,
            path,
          },
          range: { start: readStart, end: readEnd },
          offset,
          maxChars,
          content,
          hasMore,
          nextCursor: hasMore ? encodeCursor({ kind: 'section', sectionId: section.id, offset: readEnd - section.start }) : undefined,
          next_steps: hasMore
            ? ['继续调用 editor.read_range 并传入 nextCursor']
            : ['基于已读取内容回答或写入；需要其他节时先调用 editor.document_map'],
        },
      }
    },
  }

  return [documentMap, readRange]
}

export function enhanceEditorSearchWithDocumentMap(input: {
  content: string
  map: EditorDocumentMap
  query: string
  caseSensitive: boolean
  offset: number
  limit: number
}): {
  ok: true
  data: {
    total: number
    truncated: boolean
    offset: number
    limit: number
    hasMore: boolean
    nextOffset?: number
    matches: Array<{
      start: number
      end: number
      sectionId?: string
      sectionTitle?: string
      context: string
    }>
    next_steps: string[]
  }
} | { ok: false; error: { code: string; message: string; retryable?: boolean } } {
  if (!input.query.trim()) {
    return { ok: false, error: { code: 'invalid_input', message: 'query 必须是非空字符串' } }
  }
  const haystack = input.caseSensitive ? input.content : input.content.toLowerCase()
  const needle = input.caseSensitive ? input.query : input.query.toLowerCase()
  const positions: Array<{ start: number; end: number }> = []
  let index = haystack.indexOf(needle)
  while (index >= 0 && positions.length <= EDITOR_DOCUMENT_MAP_SEARCH_MAX_MATCHES) {
    positions.push({ start: index, end: index + needle.length })
    index = haystack.indexOf(needle, index + 1)
  }
  const truncated = positions.length > EDITOR_DOCUMENT_MAP_SEARCH_MAX_MATCHES
  const total = truncated ? EDITOR_DOCUMENT_MAP_SEARCH_MAX_MATCHES : positions.length
  if (input.offset >= total && total > 0) {
    return { ok: false, error: { code: 'invalid_range', message: `offset ${input.offset} 超出命中总数 ${total}` } }
  }
  const selected = positions.slice(input.offset, input.offset + input.limit)
  const hasMore = input.offset + selected.length < total
  return {
    ok: true,
    data: {
      total,
      truncated,
      offset: input.offset,
      limit: input.limit,
      hasMore,
      nextOffset: hasMore ? input.offset + selected.length : undefined,
      matches: selected.map(match => {
        const section = findDeepestSection(input.map, match.start, match.end)
        return {
          start: match.start,
          end: match.end,
          sectionId: section?.id,
          sectionTitle: section?.title,
          context: searchContext(input.content, match.start, match.end),
        }
      }),
      next_steps: hasMore
        ? ['继续调用 editor.search 并传入 nextOffset']
        : ['调用 editor.read_range 传入 sectionId 读取命中节全文'],
    },
  }
}
