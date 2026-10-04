import type { EditorTargetSnapshot } from './editorTarget'
import type { AgentToolContext, AgentToolDefinition, ToolResult } from './editorTools'
import { parseOutlineStructure, type OutlineStructure, type OutlineStructureNode } from './outlineStructure'

const DEFAULT_MAP_LIMIT = 160
const MAX_MAP_LIMIT = 500
const DEFAULT_READ_LIMIT = 4000
const MAX_READ_LIMIT = 12000
const MIN_READ_LIMIT = 500
const DEFAULT_SEARCH_LIMIT = 20
const MAX_SEARCH_LIMIT = 50
const MAX_SEARCH_MATCHES = 1000
const SEARCH_CONTEXT_CHARS = 120
const MAX_NODE_CANDIDATES = 5

interface OutlineNodeEntry {
  node: OutlineStructureNode
  path: string
}

interface OutlineSnapshotIndex {
  structure: OutlineStructure
  nodes: Map<string, OutlineNodeEntry>
}

function toolError(code: string, message: string, retryable = false): ToolResult {
  return { ok: false, error: { code, message, retryable } }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function readPositiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function buildIndex(structure: OutlineStructure): Map<string, OutlineNodeEntry> {
  const nodes = new Map<string, OutlineNodeEntry>()
  const walk = (items: OutlineStructureNode[], parentPath: string) => {
    for (const node of items) {
      const path = parentPath ? `${parentPath} / ${node.title}` : node.title
      nodes.set(node.id, { node, path })
      walk(node.children, path)
    }
  }
  walk(structure.nodes, '')
  return nodes
}

function findNodeCandidates(nodes: Map<string, OutlineNodeEntry>, requested: string): Array<{ id: string; title: string; kind: string; path: string }> {
  const needle = requested.trim().toLowerCase()
  if (!needle) return []
  const candidates: Array<{ id: string; title: string; kind: string; path: string; score: number }> = []
  for (const entry of nodes.values()) {
    const title = entry.node.title.toLowerCase()
    if (!title.includes(needle) && !entry.node.id.toLowerCase().includes(needle)) continue
    const score = title === needle ? 3 : title.startsWith(needle) ? 2 : 1
    candidates.push({ id: entry.node.id, title: entry.node.title, kind: entry.node.kind, path: entry.path, score })
  }
  return candidates
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, MAX_NODE_CANDIDATES)
    .map(({ id, title, kind, path }) => ({ id, title, kind, path }))
}

function findDeepestNode(structure: OutlineStructure, start: number, end: number): OutlineStructureNode | null {
  let deepest: OutlineStructureNode | null = null
  const walk = (nodes: OutlineStructureNode[]) => {
    for (const node of nodes) {
      if (node.start <= start && end <= node.end) deepest = node
      if (node.children.length && node.start <= start && end <= node.end) walk(node.children)
    }
  }
  walk(structure.nodes)
  return deepest
}

function searchContext(content: string, start: number, end: number): string {
  const from = Math.max(0, start - SEARCH_CONTEXT_CHARS / 2)
  const to = Math.min(content.length, end + SEARCH_CONTEXT_CHARS / 2)
  return content.slice(from, to)
}

export function createOutlineTools(options: {
  getSnapshot: () => EditorTargetSnapshot | null
}): AgentToolDefinition[] {
  const indexCache = new WeakMap<EditorTargetSnapshot, OutlineSnapshotIndex>()

  const getIndex = (snapshot: EditorTargetSnapshot): OutlineSnapshotIndex => {
    const cached = indexCache.get(snapshot)
    if (cached) return cached
    const structure = parseOutlineStructure(snapshot.content)
    const index = { structure, nodes: buildIndex(structure) }
    indexCache.set(snapshot, index)
    return index
  }

  const getSnapshot = (): { snapshot: EditorTargetSnapshot; index: OutlineSnapshotIndex } | null => {
    const snapshot = options.getSnapshot()
    return snapshot ? { snapshot, index: getIndex(snapshot) } : null
  }

  const getStructure: AgentToolDefinition = {
    name: 'outline.get_structure',
    description: '读取大纲结构地图：卷/章/节数量、节点 id、标题与字符区间。超长地图自动分页。',
    policy: 'read',
    defaultToolPolicy: 'allowedWithoutPermission',
    riskLevel: 'low',
    inputSchema: {
      type: 'object',
      properties: {
        offset: { type: 'number', description: '起始行号，默认 0' },
        limit: { type: 'number', description: '单次返回行数，默认 160，最大 500' },
      },
    },
    async execute(input) {
      const current = getSnapshot()
      if (!current) return toolError('target_missing', '当前没有大纲目标')
      const params = isPlainObject(input) ? input : {}
      const offset = readPositiveInteger(params.offset, 0)
      const requestedLimit = readPositiveInteger(params.limit, DEFAULT_MAP_LIMIT)
      const limit = clamp(requestedLimit, 20, MAX_MAP_LIMIT)
      const lines = current.index.structure.mapText.split('\n')
      if (offset >= lines.length) {
        return toolError('invalid_range', `offset ${offset} 超出结构地图行数 ${lines.length}`)
      }
      const selected = lines.slice(offset, offset + limit)
      const hasMore = offset + selected.length < lines.length
      return {
        ok: true,
        data: {
          totalChars: current.index.structure.totalChars,
          volumeCount: current.index.structure.volumeCount,
          chapterCount: current.index.structure.chapterCount,
          sectionCount: current.index.structure.sectionCount,
          reorderTopLevelIds: current.index.structure.nodes.map(node => node.id),
          reorderScope: 'top-level',
          degraded: current.index.structure.degraded,
          degradedReason: current.index.structure.degradedReason,
          mapText: selected.join('\n'),
          totalLines: lines.length,
          offset,
          limit,
          hasMore,
          nextOffset: hasMore ? offset + selected.length : undefined,
          next_steps: hasMore
            ? ['继续调用 outline.get_structure 并传入 nextOffset 获取剩余地图']
            : ['用节点 id 调用 outline.read_range 读取局部全文', '用 outline.search 查找关键词所在节点'],
        },
      }
    },
  }

  const readRange: AgentToolDefinition = {
    name: 'outline.read_range',
    description: '按结构节点 id 或字符区间读取大纲局部全文。超过单次上限时自动分页，不截断信息。',
    policy: 'read',
    defaultToolPolicy: 'allowedWithoutPermission',
    riskLevel: 'low',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'outline.get_structure 返回的节点 id' },
        start: { type: 'number', description: '字符区间起点，与 end 一起使用' },
        end: { type: 'number', description: '字符区间终点，与 start 一起使用' },
        offset: { type: 'number', description: '区间内读取偏移，默认 0' },
        limit: { type: 'number', description: '单次读取字符数，默认 4000，最大 12000' },
      },
    },
    async execute(input) {
      const current = getSnapshot()
      if (!current) return toolError('target_missing', '当前没有大纲目标')
      const params = isPlainObject(input) ? input : {}
      const hasNodeId = typeof params.nodeId === 'string' && params.nodeId.trim()
      const hasCharRange = params.start !== undefined || params.end !== undefined
      if (!hasNodeId && !hasCharRange) {
        return toolError('invalid_input', '必须提供 nodeId，或同时提供 start 与 end')
      }
      if (hasNodeId && hasCharRange) {
        return toolError('invalid_input', 'nodeId 与字符区间二选一，不要同时传入')
      }

      let rangeStart = 0
      let rangeEnd = current.snapshot.content.length
      let node: OutlineStructureNode | null = null
      let path = ''
      if (hasNodeId) {
        const entry = current.index.nodes.get((params.nodeId as string).trim())
        if (!entry) {
          return {
            ok: false,
            error: {
              code: 'node_not_found',
              message: `节点不存在：${params.nodeId}`,
            },
            data: {
              candidates: findNodeCandidates(current.index.nodes, params.nodeId as string),
            },
          }
        }
        node = entry.node
        path = entry.path
        rangeStart = node.start
        rangeEnd = node.end
      } else {
        const start = params.start
        const end = params.end
        if (typeof start !== 'number' || typeof end !== 'number' || !Number.isInteger(start) || !Number.isInteger(end)) {
          return toolError('invalid_input', 'start 与 end 必须是整数')
        }
        if (start < 0 || end <= start || end > current.snapshot.content.length) {
          return toolError('invalid_range', `非法区间 ${start}-${end}，当前大纲长度 ${current.snapshot.content.length}`)
        }
        rangeStart = start
        rangeEnd = end
        node = findDeepestNode(current.index.structure, start, end)
      }

      const offset = readPositiveInteger(params.offset, 0)
      const requestedLimit = readPositiveInteger(params.limit, DEFAULT_READ_LIMIT)
      const limit = clamp(requestedLimit, MIN_READ_LIMIT, MAX_READ_LIMIT)
      if (offset >= rangeEnd - rangeStart) {
        return toolError('invalid_range', `offset ${offset} 超出节点内容长度 ${rangeEnd - rangeStart}`)
      }
      const readStart = rangeStart + offset
      const readEnd = Math.min(rangeEnd, readStart + limit)
      const content = current.snapshot.content.slice(readStart, readEnd)
      const hasMore = readEnd < rangeEnd
      return {
        ok: true,
        data: {
          node: node
            ? { id: node.id, title: node.title, kind: node.kind, level: node.level, path }
            : null,
          rangeStart,
          rangeEnd,
          readStart,
          readEnd,
          offset,
          limit,
          content,
          rangeChars: rangeEnd - rangeStart,
          readChars: content.length,
          hasMore,
          nextOffset: hasMore ? readEnd - rangeStart : undefined,
          next_steps: hasMore
            ? ['继续调用 outline.read_range 并传入同一 nodeId/start/end 与 nextOffset']
            : ['基于已读取全文回答或提案，不要凭摘要推测细节'],
        },
      }
    },
  }

  const search: AgentToolDefinition = {
    name: 'outline.search',
    description: '在大纲内做词法检索，返回命中节点、位置与上下文。空结果会返回引导信息。',
    policy: 'read',
    defaultToolPolicy: 'allowedWithoutPermission',
    riskLevel: 'low',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索文本' },
        caseSensitive: { type: 'boolean', description: '是否区分大小写，默认 false' },
        maxResults: { type: 'number', description: '返回命中数量，默认 20，最大 50' },
      },
      required: ['query'],
    },
    async execute(input) {
      const current = getSnapshot()
      if (!current) return toolError('target_missing', '当前没有大纲目标')
      const params = isPlainObject(input) ? input : {}
      if (typeof params.query !== 'string' || !params.query.trim()) {
        return toolError('invalid_input', 'query 必须是非空字符串')
      }
      const caseSensitive = params.caseSensitive === true
      const maxResults = clamp(readPositiveInteger(params.maxResults, DEFAULT_SEARCH_LIMIT), 1, MAX_SEARCH_LIMIT)
      const haystack = caseSensitive ? current.snapshot.content : current.snapshot.content.toLowerCase()
      const needle = caseSensitive ? params.query : params.query.toLowerCase()
      const matches: Array<{ start: number; end: number }> = []
      let index = haystack.indexOf(needle)
      while (index >= 0 && matches.length <= MAX_SEARCH_MATCHES) {
        matches.push({ start: index, end: index + needle.length })
        index = haystack.indexOf(needle, index + 1)
      }
      if (!matches.length) {
        return {
          ok: true,
          data: {
            total: 0,
            matches: [],
            hint: '没有找到该关键词。请换同义词、角色全名，或先读取结构地图确认章节标题。',
            next_steps: [
              '调用 outline.get_structure 查看卷章标题',
              '用更完整的关键词重新调用 outline.search',
            ],
          },
        }
      }
      const truncated = matches.length > MAX_SEARCH_MATCHES
      const selected = matches.slice(0, maxResults)
      return {
        ok: true,
        data: {
          total: truncated ? MAX_SEARCH_MATCHES : matches.length,
          truncated,
          matches: selected.map(match => {
            const node = findDeepestNode(current.index.structure, match.start, match.end)
            return {
              start: match.start,
              end: match.end,
              nodeId: node?.id,
              nodeTitle: node?.title,
              nodeKind: node?.kind,
              context: searchContext(current.snapshot.content, match.start, match.end),
            }
          }),
          next_steps: [
            '调用 outline.read_range 传入 nodeId 读取命中节点全文',
            '如需精确上下文，可用 start/end 调用 outline.read_range',
          ],
        },
      }
    },
  }

  const getSummary: AgentToolDefinition = {
    name: 'outline.get_summary',
    description: '读取节点摘要头、长度与直接子节点列表。摘要只用于导航，不能替代局部全文。',
    policy: 'read',
    defaultToolPolicy: 'allowedWithoutPermission',
    riskLevel: 'low',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'outline.get_structure 返回的节点 id' },
      },
      required: ['nodeId'],
    },
    async execute(input) {
      const current = getSnapshot()
      if (!current) return toolError('target_missing', '当前没有大纲目标')
      const params = isPlainObject(input) ? input : {}
      if (typeof params.nodeId !== 'string' || !params.nodeId.trim()) {
        return toolError('invalid_input', 'nodeId 必须是非空字符串')
      }
      const entry = current.index.nodes.get(params.nodeId.trim())
      if (!entry) {
        return {
          ok: false,
          error: {
            code: 'node_not_found',
            message: `节点不存在：${params.nodeId}`,
          },
          data: {
            candidates: findNodeCandidates(current.index.nodes, params.nodeId),
          },
        }
      }
      return {
        ok: true,
        data: {
          node: {
            id: entry.node.id,
            title: entry.node.title,
            kind: entry.node.kind,
            level: entry.node.level,
            path: entry.path,
            start: entry.node.start,
            end: entry.node.end,
            charCount: entry.node.charCount,
            summaryHead: entry.node.summaryHead,
          },
          children: entry.node.children.map(child => ({
            id: child.id,
            title: child.title,
            kind: child.kind,
            charCount: child.charCount,
            summaryHead: child.summaryHead,
          })),
          next_steps: ['调用 outline.read_range 传入该 nodeId 读取完整内容'],
        },
      }
    },
  }

  return [getStructure, readRange, search, getSummary]
}

export type OutlineToolContext = AgentToolContext
