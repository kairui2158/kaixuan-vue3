import { describe, expect, it } from 'vitest'
import {
  buildSearchHighlightRectangles,
  buildSearchHighlightPlan,
  computeSearchMatches,
} from './editorSearch'

describe('computeSearchMatches', () => {
  it('finds all non-overlapping matches', () => {
    const content = '第三章开头。第三章继续。第三章结束。'
    const matches = computeSearchMatches(content, '第三章')
    expect(matches).toEqual([
      { start: 0, end: 3 },
      { start: 6, end: 9 },
      { start: 12, end: 15 },
    ])
  })

  it('returns an empty list for empty or missing queries', () => {
    expect(computeSearchMatches('第三章内容', '')).toEqual([])
    expect(computeSearchMatches('第三章内容', '   ')).toEqual([])
    expect(computeSearchMatches('', '第三章')).toEqual([])
  })

  it('keeps source content unchanged and bounds matches to the document', () => {
    const content = 'abcabc'
    const before = `${content}`
    const matches = computeSearchMatches(content, 'abc')
    expect(content).toBe(before)
    expect(matches.at(-1)?.end).toBeLessThanOrEqual(content.length)
    expect(computeSearchMatches(content, 'abcdef')).toEqual([])
  })

  it('delegates case, whole-word, and regex semantics to the shared search model', () => {
    const content = '灯塔 灯塔下 灯塔。'
    expect(computeSearchMatches(content, '灯塔', { wholeWord: true })).toEqual([
      { start: 0, end: 2 },
      { start: 7, end: 9 },
    ])
    expect(computeSearchMatches('Abc abc', 'abc', { caseSensitive: true })).toEqual([
      { start: 4, end: 7 },
    ])
    expect(computeSearchMatches('第一卷：第二卷', '第[一二]卷', { useRegex: true })).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 7 },
    ])
  })
})

describe('buildSearchHighlightPlan', () => {
  it('builds rectangles for every match and marks the active one', () => {
    const plan = buildSearchHighlightPlan({
      matches: [
        { start: 0, end: 3 },
        { start: 6, end: 9 },
      ],
      activeIndex: 1,
      measureOffset: (offset) => ({ top: 0, left: offset, height: 20, line: 1 }),
      viewportWidth: 400,
    })

    expect(plan).toHaveLength(2)
    expect(plan[0]).toEqual({ top: 0, left: 0, width: 3, height: 20, active: false })
    expect(plan[1]).toEqual({ top: 0, left: 6, width: 3, height: 20, active: true })
  })

  it('returns an empty plan for invalid or missing matches', () => {
    expect(buildSearchHighlightPlan({
      matches: [],
      activeIndex: 0,
      measureOffset: () => ({ top: 0, left: 0, height: 20, line: 1 }),
      viewportWidth: 400,
    })).toEqual([])
    expect(buildSearchHighlightPlan({
      matches: [{ start: 0, end: 3 }],
      activeIndex: 0,
      measureOffset: () => ({ top: Number.NaN, left: 0, height: 20, line: 1 }),
      viewportWidth: 400,
    })).toEqual([])
  })

  it('renders only matches inside the requested line window', () => {
    const calls: number[] = []
    const plan = buildSearchHighlightPlan({
      matches: [
        { start: 0, end: 3 },
        { start: 6, end: 9 },
        { start: 12, end: 15 },
      ],
      activeIndex: 2,
      measureOffset: (offset) => {
        calls.push(offset)
        return { top: offset >= 12 ? 40 : 0, left: offset, height: 20, line: offset >= 12 ? 1 : 0 }
      },
      viewportWidth: 400,
      lineWindow: { startLine: 1, endLine: 1 },
      getLine: offset => (offset >= 12 ? 1 : 0),
    })

    expect(plan).toEqual([
      { top: 40, left: 12, width: 3, height: 20, active: true },
    ])
    expect(calls).toEqual([12, 15])
  })

  it('always keeps the active match measurable for navigation', () => {
    const calls: number[] = []
    const plan = buildSearchHighlightPlan({
      matches: [
        { start: 0, end: 3 },
        { start: 6, end: 9 },
      ],
      activeIndex: 1,
      measureOffset: (offset) => {
        calls.push(offset)
        return { top: 0, left: offset, height: 20, line: offset >= 6 ? 1 : 0 }
      },
      viewportWidth: 400,
      lineWindow: { startLine: 2, endLine: 3 },
      getLine: offset => (offset >= 6 ? 1 : 0),
    })

    expect(plan).toEqual([
      { top: 0, left: 6, width: 3, height: 20, active: true },
    ])
    expect(calls).toEqual([6, 9])
    expect(plan).toEqual([
      { top: 0, left: 6, width: 3, height: 20, active: true },
    ])
  })
})

describe('buildSearchHighlightRectangles', () => {
  it('builds one rectangle for a single-line match', () => {
    const rectangles = buildSearchHighlightRectangles({
      start: { top: 20, left: 10, height: 24 },
      end: { top: 20, left: 58, height: 24 },
      viewportWidth: 400,
    })
    expect(rectangles).toEqual([
      { top: 20, left: 10, width: 48, height: 24 },
    ])
  })

  it('splits a wrapped match into start and end line rectangles', () => {
    const rectangles = buildSearchHighlightRectangles({
      start: { top: 20, left: 360, height: 24 },
      end: { top: 44, left: 40, height: 24 },
      viewportWidth: 400,
    })
    expect(rectangles).toEqual([
      { top: 20, left: 360, width: 40, height: 24 },
      { top: 44, left: 0, width: 40, height: 24 },
    ])
  })

  it('normalizes invalid measurements into an empty result', () => {
    expect(buildSearchHighlightRectangles({
      start: { top: Number.NaN, left: 10, height: 24 },
      end: { top: 20, left: 58, height: 24 },
      viewportWidth: 400,
    })).toEqual([])
  })
})
