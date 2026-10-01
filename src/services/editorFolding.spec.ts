import { describe, expect, it } from 'vitest'
import {
  applyFold,
  computeFoldRanges,
  toggleFoldForSelection,
  toggleFold,
} from './editorFolding'

const content = [
  '# 第一卷 北境',
  '少年在雪原行走。',
  '## 第1节 出发',
  '船工喊号的声音被雨压低。',
  '## 第2节 渡口',
  '灯塔在风暴里亮着。',
  '# 第二卷 南方',
  '旧城位于河湾。',
].join('\n')

describe('computeFoldRanges', () => {
  it('builds heading ranges with nesting boundaries', () => {
    const ranges = computeFoldRanges(content)
    expect(ranges.map(range => range.title)).toEqual([
      '第一卷 北境',
      '第1节 出发',
      '第2节 渡口',
      '第二卷 南方',
    ])
    expect(ranges[0].level).toBe(1)
    expect(ranges[1].level).toBe(2)
    expect(ranges[1].endLine).toBe(3)
    expect(ranges[2].endLine).toBe(5)
    expect(ranges[3].endLine).toBe(7)
  })

  it('returns an empty list for plain text', () => {
    expect(computeFoldRanges('第一段。\n第二段。')).toEqual([])
    expect(computeFoldRanges('')).toEqual([])
  })

  it('ignores hashes that are not line-start headings', () => {
    const ranges = computeFoldRanges('正文里有 # 不是标题\n##真实标题吗')
    expect(ranges).toEqual([])
  })

  it('keeps offsets aligned with the original content', () => {
    const ranges = computeFoldRanges(content)
    for (const range of ranges) {
      expect(content.slice(range.startOffset).startsWith('#')).toBe(true)
      expect(range.endOffset).toBeLessThanOrEqual(content.length)
    }
  })
})

describe('applyFold', () => {
  it('renders a collapsed section as heading plus placeholder without changing source content', () => {
    const ranges = computeFoldRanges(content)
    const firstSection = ranges.find(range => range.title === '第1节 出发')!
    const folded = applyFold(content, [firstSection.id])
    expect(folded.content).toContain('## 第1节 出发')
    expect(folded.content).toContain('[已折叠')
    expect(folded.content).not.toContain('船工喊号的声音被雨压低。')
    expect(content).toContain('船工喊号的声音被雨压低。')
  })

  it('collapses a parent section and omits nested child headings', () => {
    const ranges = computeFoldRanges(content)
    const parent = ranges.find(range => range.title === '第一卷 北境')!
    const folded = applyFold(content, [parent.id])
    expect(folded.content).toContain('# 第一卷 北境')
    expect(folded.content).not.toContain('## 第1节 出发')
    expect(folded.content).toContain('# 第二卷 南方')
    expect(folded.content).not.toContain('少年在雪原行走。')
  })

  it('maps rendered offsets back to original offsets', () => {
    const ranges = computeFoldRanges(content)
    const firstSection = ranges.find(range => range.title === '第1节 出发')!
    const folded = applyFold(content, [firstSection.id])
    const headingOffset = folded.content.indexOf('## 第2节 渡口')
    expect(folded.toOriginalOffset(headingOffset)).toBe(content.indexOf('## 第2节 渡口'))
    const placeholderOffset = folded.content.indexOf('[已折叠')
    expect(folded.toOriginalOffset(placeholderOffset)).toBe(firstSection.startOffset)
    expect(folded.toOriginalOffset(0)).toBe(0)
    expect(folded.toOriginalOffset(folded.content.length + 99)).toBe(content.length)
  })

  it('maps original offsets to rendered offsets and reports visibility', () => {
    const ranges = computeFoldRanges(content)
    const firstSection = ranges.find(range => range.title === '第1节 出发')!
    const folded = applyFold(content, [firstSection.id])
    const beforeHeadingEnd = content.indexOf('第一卷 北境')
    const hiddenStart = content.indexOf('船工喊号的声音被雨压低。')
    const afterFold = content.indexOf('# 第二卷 南方')

    expect(folded.fromOriginalOffset(beforeHeadingEnd)).toBe(beforeHeadingEnd)
    expect(folded.fromOriginalOffset(hiddenStart)).toBe(folded.content.indexOf('[已折叠'))
    expect(folded.fromOriginalOffset(afterFold)).toBe(folded.content.indexOf('# 第二卷 南方'))

    expect(folded.isOriginalRangeVisible(0, beforeHeadingEnd + 1)).toBe(true)
    expect(folded.isOriginalRangeVisible(hiddenStart, hiddenStart + 2)).toBe(false)
    expect(folded.isOriginalRangeVisible(afterFold, afterFold + 2)).toBe(true)
    expect(folded.isOriginalRangeVisible(beforeHeadingEnd, hiddenStart + 2)).toBe(false)
  })

  it('does not modify output for empty or unknown collapsed ids', () => {
    expect(applyFold(content, []).content).toBe(content)
    expect(applyFold('', ['missing']).content).toBe('')
    const ranges = computeFoldRanges(content)
    expect(applyFold(content, ['missing-id']).collapsedRanges).toEqual([])
    expect(ranges.length).toBeGreaterThan(0)
  })
})

describe('toggleFold', () => {
  it('toggles a heading line and normalizes invalid input', () => {
    const ranges = computeFoldRanges(content)
    const firstSection = ranges.find(range => range.title === '第1节 出发')!
    const collapsed = toggleFold([], ranges, firstSection.startLine)
    expect(collapsed).toEqual([firstSection.id])
    expect(toggleFold(collapsed, ranges, firstSection.startLine)).toEqual([])
    expect(toggleFold(collapsed, ranges, 999)).toEqual(collapsed)
    expect(toggleFold(collapsed, [], firstSection.startLine)).toEqual(collapsed)
  })

  it('toggles the innermost heading that owns the current selection', () => {
    const ranges = computeFoldRanges(content)
    const firstSection = ranges.find(range => range.title === '第1节 出发')!
    const bodyStart = content.indexOf('船工喊号的声音被雨压低。')

    expect(toggleFoldForSelection([], ranges, bodyStart, bodyStart + 2)).toEqual([firstSection.id])
    expect(toggleFoldForSelection([firstSection.id], ranges, bodyStart, bodyStart + 2)).toEqual([])
  })

  it('uses selection position on a heading line to toggle that heading', () => {
    const ranges = computeFoldRanges(content)
    const firstSection = ranges.find(range => range.title === '第1节 出发')!
    const headingStart = content.indexOf('## 第1节 出发')

    expect(toggleFoldForSelection([], ranges, headingStart, headingStart + 2)).toEqual([firstSection.id])
  })

  it('does not fold when no heading owns the selection', () => {
    const ranges = computeFoldRanges(content)
    expect(toggleFoldForSelection(['fold-x'], ranges, -1, 2)).toEqual(['fold-x'])
    expect(toggleFoldForSelection(['fold-x'], [], 0, 2)).toEqual(['fold-x'])
  })
})
