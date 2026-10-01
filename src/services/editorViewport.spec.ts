import { describe, expect, it } from 'vitest'
import {
  computeViewportScroll,
  resolveScrollStrategy,
} from './editorViewport'
import {
  buildLocalMeasureText,
  computeTextareaLineWindow,
  countLinesInContent,
} from './editorVirtualization'

describe('editorViewport scroll strategies', () => {
  it('centers a target with the center strategy', () => {
    expect(computeViewportScroll({
      top: 500,
      height: 20,
      clientHeight: 200,
      scrollTop: 0,
      strategy: 'center',
    })).toBe(410)
  })

  it('aligns the target with the viewport start or end', () => {
    expect(computeViewportScroll({
      top: 500,
      height: 20,
      clientHeight: 200,
      scrollTop: 0,
      strategy: 'start',
    })).toBe(500)
    expect(computeViewportScroll({
      top: 500,
      height: 20,
      clientHeight: 200,
      scrollTop: 0,
      strategy: 'end',
    })).toBe(320)
  })

  it('keeps the current scroll when the target is already visible in nearest mode', () => {
    expect(computeViewportScroll({
      top: 120,
      height: 20,
      clientHeight: 200,
      scrollTop: 100,
      strategy: 'nearest',
    })).toBe(100)
  })

  it('centers an out-of-viewport target in nearest mode', () => {
    expect(computeViewportScroll({
      top: 500,
      height: 20,
      clientHeight: 200,
      scrollTop: 100,
      strategy: 'nearest',
    })).toBe(410)
  })

  it('resolves auto focus to nearest and named focus to its strategy', () => {
    expect(resolveScrollStrategy('auto')).toBe('nearest')
    expect(resolveScrollStrategy('start')).toBe('start')
    expect(resolveScrollStrategy('end')).toBe('end')
    expect(resolveScrollStrategy('center')).toBe('center')
  })
})

describe('editor viewport local measurement', () => {
  it('keeps the offset as a stable column and reports its logical line', () => {
    const result = buildLocalMeasureText({
      content: '第一行\n第二行\n第三行\n第四行',
      offset: 10,
      maxCharacters: 8,
    })

    expect(result).toMatchObject({ text: '第三', column: 2, line: 2 })
  })

  it('builds a bounded local measurement prefix for the target line', () => {
    const result = buildLocalMeasureText({
      content: '第一行\n第二行\n第三行\n第四行',
      offset: 10,
      maxCharacters: 8,
    })

    expect(result).toMatchObject({
      text: '第三',
      column: 2,
      line: 2,
    })
  })

  it('limits an extremely long line to the measured suffix and reports its column', () => {
    const longLine = '甲'.repeat(100)
    const result = buildLocalMeasureText({
      content: `${longLine}\n下一行`,
      offset: 90,
      maxCharacters: 10,
    })

    expect(result).toMatchObject({
      text: `${'甲'.repeat(5)}\n`,
      column: 5,
      line: 0,
    })
  })

  it('computes a textarea render window with buffered lines', () => {
    expect(computeTextareaLineWindow({
      textarea: { scrollTop: 100, clientHeight: 300, value: 'a\nb\nc\nd\ne\nf\ng' },
      lineHeight: 20,
      bufferRatio: 0.5,
    })).toEqual({ startLine: 0, endLine: 6 })
  })

  it('accepts a precomputed line count to avoid rescanning the document', () => {
    expect(computeTextareaLineWindow({
      textarea: { scrollTop: 100, clientHeight: 300, value: 'a\nb\nc\nd\ne\nf\ng' },
      lineHeight: 20,
      bufferRatio: 0.5,
      lineCount: countLinesInContent('a\nb\nc\nd\ne\nf\ng'),
    })).toEqual({ startLine: 0, endLine: 6 })
  })
})
