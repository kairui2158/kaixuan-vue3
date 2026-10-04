import { describe, expect, it } from 'vitest'
import { createEditorTargetSnapshot } from './editorTarget'
import { ToolGateway } from './editorTools'
import { createOutlineTools } from './outlineTools'

const outlineText = [
  '第一卷 风暴起点',
  '第一卷内容包含风暴设定。',
  '第1章 夜行',
  '第一章内容。男主在夜路中遇到风暴。',
  '第1节 夜路',
  '小节内容。',
  '第二卷 潮汐',
  '第二卷内容。'
].join('\n')

const snapshot = createEditorTargetSnapshot({
  workspace: 'outline',
  targetId: 'outline',
  label: '大纲',
  content: outlineText,
})

function makeGateway(content = outlineText) {
  const target = content === outlineText
    ? snapshot
    : createEditorTargetSnapshot({ workspace: 'outline', targetId: 'outline', label: '大纲', content })
  const gateway = new ToolGateway()
  gateway.registerAll(createOutlineTools({ getSnapshot: () => target }))
  return gateway
}

async function call(name: string, input: Record<string, unknown>) {
  const result = await makeGateway().execute(name, input, {
    projectId: 'p1',
    workspace: 'outline',
    targetId: 'outline',
    sessionId: 's1',
    iteration: 1,
  })
  return result
}

describe('outlineTools', () => {
  it('returns the structure map with navigation steps', async () => {
    const result = await call('outline.get_structure', {})
    expect(result.ok).toBe(true)
    const data = result.data as any
    expect(data.volumeCount).toBe(2)
    expect(data.chapterCount).toBe(1)
    expect(data.sectionCount).toBe(1)
    expect(data.mapText).toContain('[volume-1] 第一卷 风暴起点')
    expect(data.reorderTopLevelIds).toEqual(['volume-1', 'volume-2'])
    expect(data.reorderScope).toBe('top-level')
    expect(data.next_steps.join('\n')).toContain('outline.read_range')
  })

  it('reads the full content of a node and reports child boundaries', async () => {
    const result = await call('outline.read_range', { nodeId: 'chapter-1' })
    expect(result.ok).toBe(true)
    const data = result.data as any
    expect(data.node.title).toBe('第1章 夜行')
    expect(data.content).toContain('第一章内容。男主在夜路中遇到风暴。')
    expect(data.content).toContain('第1节 夜路')
    expect(data.hasMore).toBe(false)
  })

  it('paginates long ranges without losing characters', async () => {
    const longOutline = `第一卷 长卷\n${'甲'.repeat(1200)}`
    const gateway = makeGateway(longOutline)
    const context = {
      projectId: 'p1',
      workspace: 'outline' as const,
      targetId: 'outline',
      sessionId: 's1',
      iteration: 1,
    }
    const first = await gateway.execute('outline.read_range', { nodeId: 'volume-1', limit: 500 }, context)
    expect(first.ok).toBe(true)
    const firstData = first.data as any
    expect(firstData.readChars).toBe(500)
    expect(firstData.hasMore).toBe(true)
    expect(firstData.nextOffset).toBe(500)

    const second = await gateway.execute('outline.read_range', {
      nodeId: 'volume-1',
      limit: 500,
      offset: firstData.nextOffset,
    }, context)
    const secondData = second.data as any
    expect(secondData.readChars).toBe(500)
    expect(secondData.hasMore).toBe(true)
    expect(secondData.readStart).toBe(firstData.readEnd)
  })

  it('search returns matches with owning nodes and read guidance', async () => {
    const result = await call('outline.search', { query: '风暴' })
    expect(result.ok).toBe(true)
    const data = result.data as any
    expect(data.total).toBe(3)
    expect(data.matches[0].nodeId).toBe('volume-1')
    expect(data.matches[1].nodeId).toBe('paragraph-1')
    expect(data.matches[2].nodeId).toBe('paragraph-2')
    expect(data.matches[2].context).toContain('男主在夜路中遇到风暴')
    expect(data.next_steps.join('\n')).toContain('outline.read_range')
  })

  it('returns guidance instead of hallucination when search has no result', async () => {
    const result = await call('outline.search', { query: '不存在的关键词' })
    expect(result.ok).toBe(true)
    const data = result.data as any
    expect(data.total).toBe(0)
    expect(data.hint).toContain('没有找到')
    expect(data.next_steps.join('\n')).toContain('outline.get_structure')
  })

  it('returns structured errors for invalid ranges and missing nodes', async () => {
    const both = await call('outline.read_range', { nodeId: 'chapter-1', start: 0, end: 10 })
    expect(both.error?.code).toBe('invalid_input')

    const invalidRange = await call('outline.read_range', { start: 10, end: 5 })
    expect(invalidRange.error?.code).toBe('invalid_range')

    const missing = await call('outline.read_range', { nodeId: 'chapter-9' })
    expect(missing.ok).toBe(false)
    expect(missing.error?.code).toBe('node_not_found')
    expect((missing.data as any).candidates).toEqual([])
  })

  it('get_summary returns navigation metadata and all tools are read-only', async () => {
    const result = await call('outline.get_summary', { nodeId: 'volume-1' })
    expect(result.ok).toBe(true)
    const data = result.data as any
    expect(data.node.title).toBe('第一卷 风暴起点')
    expect(data.children.some((child: any) => child.kind === 'chapter')).toBe(true)

    const gateway = makeGateway()
    const tools = gateway.list()
    expect(tools.map(tool => tool.name)).toEqual([
      'outline.get_structure',
      'outline.read_range',
      'outline.search',
      'outline.get_summary',
    ])
    expect(tools.every(tool => tool.policy === 'read')).toBe(true)
  })
})
