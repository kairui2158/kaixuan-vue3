import { describe, expect, it } from 'vitest'
import {
  buildLineIndex,
  buildLineLayout,
  computeRenderWindow,
  updateLineLayout,
  lineToOffset,
  offsetToLine,
  rebuildLineIndex,
  offsetToLineInContent,
  STREAMED_LINE_INDEX_THRESHOLD,
  countLinesInContent,
  createLineIndexCache,
} from './editorVirtualization'

const content = [
  '第一行正文',
  '第二行正文',
  '',
  '第四行正文',
  '最后一行',
].join('\n')

describe('buildLineIndex', () => {
  it('builds one entry per physical line with offsets and lengths', () => {
    const index = buildLineIndex(content)

    expect(index.lines).toHaveLength(5)
    expect(index.lines[0]).toMatchObject({ offset: 0, length: 5 })
    expect(index.lines[1]).toMatchObject({ offset: 6, length: 5 })
    expect(index.lines[2]).toMatchObject({ offset: 12, length: 0 })
    expect(index.lines[3]).toMatchObject({ offset: 13, length: 5 })
    expect(index.lines[4]).toMatchObject({ offset: 19, length: 4 })
    expect(index.contentLength).toBe(content.length)
  })

  it('supports empty documents', () => {
    const index = buildLineIndex('')
    expect(index.lines).toEqual([{ offset: 0, length: 0, lineStart: 0 }])
    expect(index.contentLength).toBe(0)
  })
})

describe('offset and line mapping', () => {
  it('maps offsets to zero-based lines and back with binary search', () => {
    const index = buildLineIndex(content)

    expect(offsetToLine(index, -1)).toBe(0)
    expect(offsetToLine(index, 0)).toBe(0)
    expect(offsetToLine(index, 5)).toBe(0)
    expect(offsetToLine(index, 6)).toBe(1)
    expect(offsetToLine(index, 12)).toBe(2)
    expect(offsetToLine(index, 19)).toBe(4)
    expect(offsetToLine(index, content.length)).toBe(4)
    expect(offsetToLine(index, content.length + 99)).toBe(4)

    expect(lineToOffset(index, 0)).toBe(0)
    expect(lineToOffset(index, 2)).toBe(12)
    expect(lineToOffset(index, 4)).toBe(19)
    expect(lineToOffset(index, 99)).toBe(content.length)
  })
})

describe('offsetToLineInContent', () => {
  it('reports the same line as the full index on short documents', () => {
    expect(offsetToLineInContent(content, 6)).toBe(1)
    expect(offsetToLineInContent(content, 12)).toBe(2)
    expect(offsetToLineInContent(content, content.length)).toBe(4)
  })

  it('streams the offset without building a full index on very long documents', () => {
    const longContent = 'x'.repeat(STREAMED_LINE_INDEX_THRESHOLD + 1)
    expect(offsetToLineInContent(longContent, 250_000)).toBe(0)
    expect(offsetToLineInContent(`${'x'.repeat(10)}\n${'y'.repeat(STREAMED_LINE_INDEX_THRESHOLD)}`, 12)).toBe(1)
  })

  it('reports newline-separated lines exactly on very long documents', () => {
    const longContent = `${'x'.repeat(10)}\n${'y'.repeat(10)}\n${'z'.repeat(STREAMED_LINE_INDEX_THRESHOLD)}`
    expect(offsetToLineInContent(longContent, 5)).toBe(0)
    expect(offsetToLineInContent(longContent, 12)).toBe(1)
    expect(offsetToLineInContent(longContent, 23)).toBe(2)
    expect(offsetToLineInContent(longContent, longContent.length)).toBe(2)
  })
})

describe('rebuildLineIndex', () => {
  it('updates the index for a bounded local edit without rescanning the document', () => {
    const index = buildLineIndex(content)
    const next = '第二行新增\n第二行正文\n'
    const rebuilt = rebuildLineIndex(index, 6, 11, next)

    expect(builtLineSummary(rebuilt)).toEqual([
      { offset: 0, length: 5 },
      { offset: 6, length: 5 },
      { offset: 12, length: 5 },
      { offset: 18, length: 0 },
      { offset: 19, length: 0 },
      { offset: 20, length: 5 },
      { offset: 26, length: 4 },
    ])
    expect(rebuilt.contentLength).toBe(content.length + next.length - 5)
    expect(offsetToLine(rebuilt, 20)).toBe(5)
  })
})

describe('computeRenderWindow', () => {
  it('computes a buffered visible line window and clamps invalid input', () => {
    expect(computeRenderWindow({
      scrollTop: 120,
      clientHeight: 200,
      lineHeight: 20,
      lineCount: 100,
      bufferRatio: 0.5,
    })).toEqual({ startLine: 1, endLine: 21 })

    expect(computeRenderWindow({
      scrollTop: 0,
      clientHeight: 200,
      lineHeight: 0,
      lineCount: 100,
      bufferRatio: 0.5,
    })).toEqual({ startLine: 0, endLine: 99 })
    expect(computeRenderWindow({
      scrollTop: 0,
      clientHeight: 200,
      lineHeight: 20,
      lineCount: 0,
      bufferRatio: 0.5,
    })).toEqual({ startLine: 0, endLine: 0 })
  })
})

describe('line index cache', () => {
  it('caches a short document index and reports streamed counts safely', () => {
    const cache = createLineIndexCache()
    expect(cache.getIndex(content)?.lines).toHaveLength(5)
    expect(cache.getLineCount(content)).toBe(5)
    expect(cache.getIndex('')?.lines).toHaveLength(1)

    const longContent = 'x'.repeat(STREAMED_LINE_INDEX_THRESHOLD + 1)
    expect(cache.getIndex(longContent)).toBeNull()
    expect(cache.getLineCount(longContent)).toBe(1)
    expect(countLinesInContent('a\nb\nc')).toBe(3)
  })
})

describe('line layout', () => {
  it('caches per-line heights and cumulative tops', () => {
    const layout = buildLineLayout('短行\n很长的换行行\n短行', line => (line.length > 5 ? 40 : 20))

    expect(layout.heights).toEqual([20, 40, 20])
    expect(layout.tops).toEqual([0, 20, 60])
  })

  it('updates only the affected line heights and shifts later tops', () => {
    const layout = buildLineLayout('第一\n第二\n第三', () => 20)
    const updated = updateLineLayout(layout, 4, 7, '第2.5行\n第2.6行', line => (line.includes('2.6') ? 30 : 20))

    expect(updated.heights).toEqual([20, 20, 30])
    expect(updated.tops).toEqual([0, 20, 40])
    expect(offsetToLine(updated.index, 16)).toBe(2)
  })
})

function builtLineSummary(index: ReturnType<typeof buildLineIndex>) {
  return index.lines.map(line => ({ offset: line.offset, length: line.length }))
}
