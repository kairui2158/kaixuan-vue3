import { describe, expect, it } from 'vitest'
import {
  buildEditorDocumentMap,
  createEditorDocumentMapTools,
  enhanceEditorSearchWithDocumentMap,
} from './editorDocumentMap'
import { createEditorTargetSnapshot } from './editorTarget'
import { ToolGateway } from './editorTools'

const structuredContent = [
  '# 第一卷 北境',
  '少年在雪原行走。',
  '## 第1节 出发',
  '船工喊号的声音被雨压低。',
  '## 第2节 渡口',
  '灯塔在风暴里亮着。',
  '# 第二卷 南方',
  '旧城位于河湾。',
  '## 第1节 归途',
  '旧城位于河湾。',
].join('\n')

function makeGateway(content = structuredContent, options: { maxReadChars?: () => number } = {}) {
  const snapshot = createEditorTargetSnapshot({
    workspace: 'main',
    targetId: 'chapter-1',
    label: '第一章',
    content,
  })
  const tools = createEditorDocumentMapTools({
    getSnapshot: () => snapshot,
    maxReadChars: options.maxReadChars,
  })
  const gateway = new ToolGateway()
  gateway.registerAll(tools)
  return { gateway, snapshot }
}

function makeContext() {
  return {
    projectId: 'p1',
    workspace: 'main' as const,
    targetId: 'chapter-1',
    sessionId: 's1',
    iteration: 1,
  }
}

describe('editorDocumentMap', () => {
  it('builds a structured document map with sections and token estimate', () => {
    const map = buildEditorDocumentMap(structuredContent)
    expect(map.totalChars).toBe(structuredContent.length)
    expect(map.estimatedTokens).toBeGreaterThan(0)
    expect(map.sectionCount).toBeGreaterThan(0)
    expect(map.sections.map(section => section.title)).toContain('第1节 出发')
    expect(map.sections.some(section => section.charCount > 0)).toBe(true)
  })

  it('degrades to paragraph sections when no structure exists', () => {
    const content = '第一段。\n\n第二段。\n\n第三段。'
    const map = buildEditorDocumentMap(content)
    expect(map.degraded).toBe(true)
    expect(map.sections.length).toBeGreaterThan(0)
  })

  it('document map paginates sections and guides the next call', async () => {
    const { gateway } = makeGateway()
    const first = await gateway.execute('editor.document_map', { limit: 2 }, makeContext())
    expect(first.ok).toBe(true)
    expect((first.data as any).sections).toHaveLength(2)
    expect((first.data as any).hasMore).toBe(true)
    expect((first.data as any).nextOffset).toBe(2)

    const second = await gateway.execute('editor.document_map', { offset: 2, limit: 500 }, makeContext())
    expect(second.ok).toBe(true)
    expect((second.data as any).offset).toBe(2)
    expect((second.data as any).limit).toBe(500)

    const invalid = await gateway.execute('editor.document_map', { offset: 999 }, makeContext())
    expect(invalid.ok).toBe(false)
    expect(invalid.error?.code).toBe('invalid_range')
  })

  it('document map exposes reorder top-level section ids', async () => {
    const { gateway } = makeGateway()
    const result = await gateway.execute('editor.document_map', { limit: 2 }, makeContext())
    const data = result.data as any
    const map = buildEditorDocumentMap(structuredContent)
    const expectedTopLevelIds = map.topLevelSectionIds
    expect(result.ok).toBe(true)
    expect(data.reorderTopLevelIds).toEqual(expectedTopLevelIds)
    expect(data.reorderScope).toBe('top-level')
  })

  it('read_range reads a section and follows the cursor', async () => {
    const longBody = '雨'.repeat(2000)
    const content = `## 第1节 出发\n${longBody}\n## 第2节 渡口\n灯塔。`
    const { gateway, snapshot } = makeGateway(content)
    const first = await gateway.execute('editor.read_range', {
      sectionId: 'chapter-0',
      maxChars: 1000,
    }, makeContext())
    expect(first.ok).toBe(false)

    const map = buildEditorDocumentMap(content)
    const section = map.sections.find(item => item.title === '第1节 出发')
    expect(section).toBeTruthy()
    expect(section).toBeTruthy()
    expect(section).toBeTruthy()
    const page1 = await gateway.execute('editor.read_range', {
      sectionId: section!.id,
      maxChars: 1000,
    }, makeContext())
    expect(page1.ok).toBe(true)
    expect((page1.data as any).content).toHaveLength(1000)
    expect((page1.data as any).hasMore).toBe(true)
    expect(typeof (page1.data as any).nextCursor).toBe('string')

    const page2 = await gateway.execute('editor.read_range', {
      cursor: (page1.data as any).nextCursor,
    }, makeContext())
    expect(page2.ok).toBe(true)
    expect((page2.data as any).content).toBe(content.slice(section!.start + 1000, section!.end))
    expect((page2.data as any).hasMore).toBe(false)
    expect(snapshot.content).toBe(content)
  })

  it('read_range supports sectionId offset/limit pagination and cursor shorthand', async () => {
    const longBody = '雨'.repeat(2000)
    const content = `## 第1节 出发\n${longBody}\n## 第2节 渡口\n灯塔。`
    const { gateway } = makeGateway(content)
    const map = buildEditorDocumentMap(content)
    const section = map.sections.find(item => item.title === '第1节 出发')
    expect(section).toBeTruthy()

    const page1 = await gateway.execute('editor.read_range', {
      sectionId: section!.id,
      offset: 500,
      limit: 700,
      maxChars: 12000,
    }, makeContext())
    expect(page1.ok).toBe(true)
    expect((page1.data as any).offset).toBe(500)
    expect((page1.data as any).content).toBe(content.slice(section!.start + 500, section!.start + 1200))
    expect((page1.data as any).hasMore).toBe(true)
    expect(typeof (page1.data as any).nextCursor).toBe('string')

    const page2 = await gateway.execute('editor.read_range', {
      sectionId: section!.id,
      offset: 1200,
      limit: 1000,
    }, makeContext())
    expect(page2.ok).toBe(true)
    expect((page2.data as any).content).toBe(content.slice(section!.start + 1200, section!.end))
    expect((page2.data as any).hasMore).toBe(false)

    const shorthand = await gateway.execute('editor.read_range', {
      cursor: `section:${section!.id}`,
    }, makeContext())
    expect(shorthand.ok).toBe(true)
    expect((shorthand.data as any).offset).toBe(0)
    expect((shorthand.data as any).content.startsWith('## 第1节 出发')).toBe(true)
  })

  it('read_range returns a duplicate_read warning for the same version and range', async () => {
    const { gateway } = makeGateway()
    const documentMap = await gateway.execute('editor.document_map', {}, makeContext())
    const section = ((documentMap.data as any).sections || [])[0] as { id: string }
    expect(section?.id).toBeTruthy()
    const input = { sectionId: section.id, offset: 0, limit: 100 }
    const first = await gateway.execute('editor.read_range', input, makeContext())
    const second = await gateway.execute('editor.read_range', input, makeContext())

    expect(first.ok).toBe(true)
    expect((first.data as any).content.length).toBeGreaterThan(0)
    expect((first.data as { duplicate_read?: boolean }).duplicate_read).toBeUndefined()
    expect(second.ok).toBe(true)
    expect((second.data as { duplicate_read?: boolean }).duplicate_read).toBe(true)
    expect((second.data as { duplicate_read_notice?: string }).duplicate_read_notice)
      .toContain('不要重复读取')
  })

  it('read_range rejects mixed pagination modes with one unambiguous rule', async () => {
    const { gateway } = makeGateway()
    const map = buildEditorDocumentMap(structuredContent)
    const section = map.sections[0]

    const mixed = await gateway.execute('editor.read_range', {
      sectionId: section.id,
      cursor: `section:${section.id}:0`,
    }, makeContext())
    expect(mixed.ok).toBe(false)
    expect(mixed.error?.code).toBe('invalid_input')
    expect(mixed.error?.message).toContain('cursor 与 offset/limit/sectionId 分页只能选择一种')
  })

  it('read_range rejects invalid cursors and full-document requests', async () => {
    const { gateway } = makeGateway()
    const empty = await gateway.execute('editor.read_range', {}, makeContext())
    expect(empty.error?.code).toBe('invalid_input')

    const documentLevelPagination = await gateway.execute('editor.read_range', {
      offset: 0,
      limit: 60,
    }, makeContext())
    expect(documentLevelPagination.error?.code).toBe('invalid_input')
    expect(documentLevelPagination.error?.message).toContain('必须提供 sectionId')

    const both = await gateway.execute('editor.read_range', {
      cursor: 'section:chapter-0:0',
      sectionId: 'chapter-0',
    }, makeContext())
    expect(both.error?.code).toBe('invalid_input')

    const malformed = await gateway.execute('editor.read_range', { cursor: 'bad-cursor' }, makeContext())
    expect(malformed.error?.code).toBe('invalid_input')

    const missing = await gateway.execute('editor.read_range', { sectionId: 'not-exists' }, makeContext())
    expect(missing.error?.code).toBe('section_not_found')
    expect(Array.isArray((missing.data as any).candidates)).toBe(true)
    expect((missing.error as any).retryable).toBe(true)
    expect((missing.data as any).contentVersion).toBeGreaterThan(0)
    expect((missing.data as any).recovery).toContain('重新调用 editor.document_map')

    const map = buildEditorDocumentMap(structuredContent)
    const section = map.sections[0]
    const oversized = await gateway.execute('editor.read_range', {
      sectionId: section.id,
      maxChars: 999999,
    }, makeContext())
    expect(oversized.ok).toBe(true)
    expect((oversized.data as any).maxChars).toBe(12000)
  })

  it('read_range can lower the read cap from context budget', async () => {
    const content = `## 第1节 出发\n${'雨'.repeat(3000)}`
    const { gateway } = makeGateway(content, { maxReadChars: () => 800 })
    const map = buildEditorDocumentMap(content)
    const section = map.sections.find(item => item.title === '第1节 出发')
    const rejected = await gateway.execute('editor.read_range', {
      sectionId: section!.id,
      maxChars: 12000,
    }, makeContext())
    expect(rejected.error?.code).toBe('range_too_large')

    const lowered = await gateway.execute('editor.read_range', {
      sectionId: section!.id,
      maxChars: 800,
    }, makeContext())
    expect(lowered.error?.code).toBe('range_too_large')
  })

  it('search returns section-aware paginated matches', () => {
    const map = buildEditorDocumentMap(structuredContent)
    const result = enhanceEditorSearchWithDocumentMap({
      content: structuredContent,
      map,
      query: '旧城',
      caseSensitive: false,
      offset: 0,
      limit: 1,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.total).toBe(2)
    expect(result.data.matches[0].sectionTitle).toBeTruthy()
    expect(result.data.hasMore).toBe(true)
    expect(result.data.nextOffset).toBe(1)
  })

  it('search rejects invalid offsets and empty queries', () => {
    const map = buildEditorDocumentMap(structuredContent)
    const invalidOffset = enhanceEditorSearchWithDocumentMap({
      content: structuredContent,
      map,
      query: '旧城',
      caseSensitive: false,
      offset: 99,
      limit: 10,
    })
    expect(invalidOffset.ok).toBe(false)
    if (!invalidOffset.ok) expect(invalidOffset.error.code).toBe('invalid_range')

    const emptyQuery = enhanceEditorSearchWithDocumentMap({
      content: structuredContent,
      map,
      query: ' ',
      caseSensitive: false,
      offset: 0,
      limit: 10,
    })
    expect(emptyQuery.ok).toBe(false)
    if (!emptyQuery.ok) expect(emptyQuery.error.code).toBe('invalid_input')
  })
})
