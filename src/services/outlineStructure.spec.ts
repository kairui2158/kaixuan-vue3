import { describe, expect, it } from 'vitest'
import { assertStructureCoverage, parseOutlineStructure } from './outlineStructure'

const standardOutline = [
  '# 总书设定',
  '世界观与基调。',
  '',
  '## 第一卷：风暴起点',
  '第一卷内容。',
  '',
  '### 第1章：夜行',
  '第一章内容。',
  '',
  '### 第2章：回声',
  '第二章内容。',
  '',
  '## 第二卷：潮汐',
  '第二卷内容。'
].join('\n')

const chineseOutline = [
  '第一卷 风暴起点',
  '第一卷内容。',
  '第1章 夜行',
  '第一章内容。',
  '第1节 夜路',
  '小节内容。',
  '第二卷 潮汐',
  '第二卷内容。'
].join('\n')

const duplicateOutline = [
  '第一卷 风暴起点',
  '第一卷内容。',
  '第一卷 重复卷',
  '重复内容。'
].join('\n')

const plainOutline = '这是一段没有任何标题的大纲文本。\n\n第二段内容继续描述故事走向。\n\n第三段内容。'

describe('parseOutlineStructure', () => {
  it('builds a standard markdown hierarchy', () => {
    const structure = parseOutlineStructure(standardOutline)
    expect(structure.degraded).toBe(false)
    expect(structure.nodes).toHaveLength(1)
    expect(structure.nodes[0].title).toBe('总书设定')
    const volumes = structure.nodes[0].children.filter(node => node.kind === 'heading')
    expect(volumes).toHaveLength(2)
    expect(volumes[0].title).toBe('第一卷：风暴起点')
    const chapters = volumes[0].children.filter(node => node.kind === 'heading')
    expect(chapters).toHaveLength(2)
    expect(chapters[0].title).toBe('第1章：夜行')
  })

  it('recognizes chinese volume chapter and section headings', () => {
    const structure = parseOutlineStructure(chineseOutline)
    expect(structure.degraded).toBe(false)
    expect(structure.volumeCount).toBe(2)
    expect(structure.chapterCount).toBe(1)
    expect(structure.sectionCount).toBe(1)
    expect(structure.nodes[0].kind).toBe('volume')
    const chapter = structure.nodes[0].children.find(node => node.kind === 'chapter')
    const section = chapter?.children.find(node => node.kind === 'section')
    expect(chapter?.title).toBe('第1章 夜行')
    expect(section?.title).toBe('第1节 夜路')
  })

  it('degrades duplicated numbered headings to paragraph blocks', () => {
    const structure = parseOutlineStructure(duplicateOutline)
    expect(structure.degraded).toBe(true)
    expect(structure.degradedReason).toContain('编号重复')
    expect(structure.nodes.every(node => node.kind === 'paragraph')).toBe(true)
  })

  it('falls back to paragraph blocks when no headings exist', () => {
    const structure = parseOutlineStructure(plainOutline)
    expect(structure.degraded).toBe(true)
    expect(structure.nodes.length).toBeGreaterThan(0)
    expect(structure.nodes.every(node => node.kind === 'paragraph')).toBe(true)
    expect(structure.nodes[0].summaryHead).toContain('这是一段')
  })

  it('covers the source text without overlap or gaps', () => {
    for (const source of [standardOutline, chineseOutline, duplicateOutline, plainOutline]) {
      const structure = parseOutlineStructure(source)
      const coverage = assertStructureCoverage(structure, source.length)
      expect(coverage.problems).toEqual([])
      expect(coverage.ok).toBe(true)
    }
  })

  it('renders a deterministic structure map', () => {
    const first = parseOutlineStructure(standardOutline)
    const second = parseOutlineStructure(standardOutline)
    expect(first.mapText).toBe(second.mapText)
    expect(first.mapText).toContain('大纲结构地图')
    expect(first.mapText).toContain('第一卷：风暴起点')
    expect(first.mapText).toMatch(/\[\w+-\d+\]/)
  })
})
