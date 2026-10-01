import { describe, expect, it } from 'vitest'
import { computeEditorOutline } from './editorOutline'

const content = [
  '# 第一卷 北境',
  '少年在雪原行走。',
  '## 第1节 出发',
  '船工喊号的声音被雨压低。',
  '### 第一个锚点',
  '灯塔在风暴里亮着。',
  '# 第二卷 南方',
  '旧城位于河湾。',
].join('\n')

describe('computeEditorOutline', () => {
  it('builds an ordered outline from markdown headings', () => {
    const outline = computeEditorOutline(content)
    expect(outline.map(heading => heading.title)).toEqual([
      '第一卷 北境',
      '第1节 出发',
      '第一个锚点',
      '第二卷 南方',
    ])
    expect(outline.map(heading => heading.level)).toEqual([1, 2, 3, 1])
    expect(outline.map(heading => heading.line)).toEqual([0, 2, 4, 6])
    for (const heading of outline) {
      expect(content.slice(heading.startOffset).startsWith('#')).toBe(true)
    }
  })

  it('returns an empty outline for empty or heading-free documents', () => {
    expect(computeEditorOutline('')).toEqual([])
    expect(computeEditorOutline('   \n\n')).toEqual([])
    expect(computeEditorOutline('正文里有 # 符号。\n##没有空格的文本')).toEqual([])
  })

  it('supports a document containing only top-level headings', () => {
    const outline = computeEditorOutline('# 开篇\n# 中段\n# 结尾')
    expect(outline.map(heading => heading.title)).toEqual(['开篇', '中段', '结尾'])
    expect(outline.every(heading => heading.level === 1)).toBe(true)
  })

  it('normalizes CRLF input and keeps duplicate titles addressable', () => {
    const crlfContent = '# 同名标题\r\n第一段\r\n# 同名标题\r\n第二段'
    const outline = computeEditorOutline(crlfContent)
    expect(outline.map(heading => heading.title)).toEqual(['同名标题', '同名标题'])
    expect(new Set(outline.map(heading => heading.id)).size).toBe(2)
    expect(outline[1].line).toBe(2)
  })
})
