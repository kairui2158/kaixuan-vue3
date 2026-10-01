import { describe, expect, it } from 'vitest'
import {
  applyOutlineReplacement,
  replaceOutlineAll,
  replaceOutlineCurrent,
} from './outlineReplace'

const BASE_OUTLINE = [
  '第一卷 风暴起点',
  '第二章内容。男主在灯塔下发现旧信。',
  '第三章内容。男主在灯塔下发现旧信。',
].join('\n')

const SEARCH_OPTIONS = { caseSensitive: true, wholeWord: false, useRegex: false }

describe('replaceOutlineCurrent', () => {
  it('replaces only the selected match and moves the caret after the replacement', () => {
    const start = BASE_OUTLINE.indexOf('第二章内容。男主在灯塔下发现旧信。')
    const result = replaceOutlineCurrent({
      content: BASE_OUTLINE,
      query: '第二章内容。男主在灯塔下发现旧信。',
      replacement: '第二章大纲。男主在灯塔下确认旧信来源。',
      selectionStart: start,
      selectionEnd: start + '第二章内容。男主在灯塔下发现旧信。'.length,
    })

    expect(result.status).toBe('replaced')
    expect(result.next).toBe(
      BASE_OUTLINE.replace(
        '第二章内容。男主在灯塔下发现旧信。',
        '第二章大纲。男主在灯塔下确认旧信来源。',
      ),
    )
    expect(result.caret).toBe(start + '第二章大纲。男主在灯塔下确认旧信来源。'.length)
    expect(result.matchCount).toBe(1)
  })

  it('rejects when the current selection is not the query', () => {
    const result = replaceOutlineCurrent({
      content: BASE_OUTLINE,
      query: '第二章内容',
      replacement: '第二章大纲',
      selectionStart: 0,
      selectionEnd: 0,
    })

    expect(result.status).toBe('invalid-selection')
    expect(result.next).toBeNull()
  })
})

describe('replaceOutlineAll', () => {
  it('replaces every non-overlapping match', () => {
    const result = replaceOutlineAll({
      content: BASE_OUTLINE,
      query: '男主在灯塔下发现旧信',
      replacement: '男主在灯塔下确认旧信来源',
    })

    expect(result.status).toBe('replaced')
    expect(result.next).toBe(
      [
        '第一卷 风暴起点',
        '第二章内容。男主在灯塔下确认旧信来源。',
        '第三章内容。男主在灯塔下确认旧信来源。',
      ].join('\n'),
    )
    expect(result.matchCount).toBe(2)
    expect(result.caret).toBe(0)
  })

  it('reports no-match without changing content', () => {
    const result = replaceOutlineAll({
      content: BASE_OUTLINE,
      query: '不存在的内容',
      replacement: '替换',
    })

    expect(result.status).toBe('no-match')
    expect(result.next).toBeNull()
  })

  it('reports unchanged when replacement text equals the query', () => {
    const result = replaceOutlineAll({
      content: BASE_OUTLINE,
      query: '第二章内容',
      replacement: '第二章内容',
    })

    expect(result.status).toBe('unchanged')
    expect(result.next).toBeNull()
  })

  it('uses the shared search model for regex replacement and capture templates', () => {
    const result = replaceOutlineAll({
      content: '第一卷：第一册',
      query: '第([一二三])卷',
      replacement: '第$1册',
      options: { ...SEARCH_OPTIONS, useRegex: true },
    })

    expect(result.status).toBe('replaced')
    expect(result.next).toBe('第一册：第一册')
    expect(result.matchCount).toBe(1)
  })

  it('reports invalid regex patterns without replacing content', () => {
    const result = replaceOutlineAll({
      content: BASE_OUTLINE,
      query: '(',
      replacement: '替换',
      options: { ...SEARCH_OPTIONS, useRegex: true },
    })

    expect(result.status).toBe('invalid-pattern')
    expect(result.next).toBeNull()
    expect(result.matchCount).toBe(0)
  })
})

describe('applyOutlineReplacement', () => {
  it('rejects locked outlines before computing any replacement', () => {
    const result = applyOutlineReplacement({
      mode: 'all',
      locked: true,
      content: BASE_OUTLINE,
      query: '第二章内容',
      replacement: '第二章大纲',
    })

    expect(result.status).toBe('locked')
    expect(result.next).toBeNull()
  })

  it('delegates current-mode decisions with selection validation', () => {
    const start = BASE_OUTLINE.indexOf('第三章内容')
    const result = applyOutlineReplacement({
      mode: 'current',
      content: BASE_OUTLINE,
      query: '第三章内容',
      replacement: '第三章大纲',
      selectionStart: start,
      selectionEnd: start + '第三章内容'.length,
    })

    expect(result.status).toBe('replaced')
    expect(result.next).toContain('第三章大纲')
  })
})
