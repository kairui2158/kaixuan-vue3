import { describe, expect, it } from 'vitest'
import { verifySnippet } from './memoryExtractor'
describe('verifySnippet', () => {
  it('accepts only snippets present in the original content', () => {
    expect(verifySnippet('夜雨落下', '窗外夜雨落下，灯火未灭')).toBe(true)
    expect(verifySnippet('不存在的句子', '窗外夜雨落下')).toBe(false)
    expect(verifySnippet('  ', '正文')).toBe(false)
  })
})
