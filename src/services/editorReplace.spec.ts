import { describe, expect, it } from 'vitest'
import {
  applyEditorReplacementPlan,
  buildEditorReplacementPlan,
  computeEditorMatches,
} from './editorReplace'

describe('computeEditorMatches', () => {
  it('matches case-insensitively by default and keeps literal semantics', () => {
    const content = 'Abc abc ABC'
    const before = `${content}`
    const result = computeEditorMatches(content, 'abc')

    expect(result.error).toBeNull()
    expect(result.matches).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 7 },
      { start: 8, end: 11 },
    ])
    expect(content).toBe(before)
  })

  it('matches only the requested case when case-sensitive is enabled', () => {
    const result = computeEditorMatches('Abc abc ABC', 'abc', { caseSensitive: true })

    expect(result.matches).toEqual([{ start: 4, end: 7 }])
  })

  it('treats CJK text as word characters for whole-word matching', () => {
    const result = computeEditorMatches('灯塔 灯塔下 灯塔。', '灯塔', { wholeWord: true })

    expect(result.matches).toEqual([
      { start: 0, end: 2 },
      { start: 7, end: 9 },
    ])
  })

  it('supports regex matching when explicitly enabled', () => {
    const result = computeEditorMatches('第一卷：第一册：第二卷', '第[一二]卷', { useRegex: true })

    expect(result.matches).toEqual([
      { start: 0, end: 3 },
      { start: 8, end: 11 },
    ])
  })

  it('keeps regex metacharacters literal by default', () => {
    const result = computeEditorMatches('a.c abc', 'a.c')

    expect(result.matches).toEqual([{ start: 0, end: 3 }])
  })

  it('returns an explainable error instead of throwing for an invalid regex', () => {
    const result = computeEditorMatches('正文', '(', { useRegex: true })

    expect(result.matches).toEqual([])
    expect(result.error).not.toBeNull()
    expect((result.error || '').length).toBeGreaterThan(0)
  })

  it('skips zero-width matches while advancing the cursor', () => {
    const emptyOnly = computeEditorMatches('abc', 'x*', { useRegex: true })
    const mixed = computeEditorMatches('aab', 'a*', { useRegex: true })

    expect(emptyOnly.matches).toEqual([])
    expect(mixed.matches).toEqual([{ start: 0, end: 2 }])
  })
})

describe('buildEditorReplacementPlan', () => {
  it('builds a preview plan with per-match before and after text', () => {
    const plan = buildEditorReplacementPlan('旧灯塔，新灯塔。', '灯塔', '港口')

    expect(plan.status).toBe('ready')
    expect(plan.error).toBeNull()
    expect(plan.matches).toEqual([
      { start: 1, end: 3 },
      { start: 5, end: 7 },
    ])
    expect(plan.items).toEqual([
      { start: 1, end: 3, before: '灯塔', after: '港口' },
      { start: 5, end: 7, before: '灯塔', after: '港口' },
    ])
    expect(plan.next).toBe('旧港口，新港口。')
  })

  it('expands capture-group templates only in regex mode', () => {
    const regexPlan = buildEditorReplacementPlan('第一卷：甲', '第([一二三])卷', '第$1册', {
      useRegex: true,
    })
    const literalPlan = buildEditorReplacementPlan('a$1b', '$1', 'X')

    expect(regexPlan.next).toBe('第一册：甲')
    expect(literalPlan.next).toBe('aXb')
  })

  it('reports no-match without changing the content', () => {
    const plan = buildEditorReplacementPlan('正文内容', '不存在', '替换')

    expect(plan.status).toBe('no-match')
    expect(plan.next).toBeNull()
    expect(plan.items).toEqual([])
  })

  it('reports an unchanged plan when replacement equals every match', () => {
    const plan = buildEditorReplacementPlan('灯塔 灯塔', '灯塔', '灯塔')

    expect(plan.status).toBe('unchanged')
    expect(plan.next).toBeNull()
  })

  it('keeps invalid regexes as preview errors instead of producing a plan', () => {
    const plan = buildEditorReplacementPlan('正文', '(', '替换', { useRegex: true })

    expect(plan.status).toBe('invalid-pattern')
    expect(plan.error).toBeTypeOf('string')
    expect(plan.next).toBeNull()
    expect(plan.items).toEqual([])
  })
})

describe('applyEditorReplacementPlan', () => {
  it('applies a valid plan without mutating the source content', () => {
    const content = '旧灯塔，新灯塔。'
    const before = `${content}`
    const plan = buildEditorReplacementPlan(content, '灯塔', '港口')
    const result = applyEditorReplacementPlan(content, plan)

    expect(result.status).toBe('applied')
    expect(result.next).toBe('旧港口，新港口。')
    expect(content).toBe(before)
  })

  it('rejects a plan whose source ranges no longer match the content', () => {
    const plan = buildEditorReplacementPlan('旧灯塔，新灯塔。', '灯塔', '港口')
    const result = applyEditorReplacementPlan('正文已经变化，灯塔只剩一处。', plan)

    expect(result.status).toBe('source-changed')
    expect(result.next).toBeNull()
  })
})
