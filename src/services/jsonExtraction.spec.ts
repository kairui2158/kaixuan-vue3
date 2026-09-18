import { describe, expect, it } from 'vitest'
import {
  dedupeJsonCandidates,
  extractJsonArray,
  extractJsonCandidates,
  extractJsonObject,
  extractJsonValue,
  repairJsonText,
} from './jsonExtraction'

describe('jsonExtraction', () => {
  it('parses a bare JSON object', () => {
    expect(extractJsonObject('{"style":"热血"}')).toEqual({ style: '热血' })
  })

  it('parses JSON inside a markdown fence', () => {
    expect(extractJsonArray('```json\n[{"name":"第一卷"}]\n```')).toEqual([{ name: '第一卷' }])
  })

  it('does not join two arrays with explanation text between them', () => {
    const text = '先看这个 [1,2]，再排除这个 [3,4]。'
    expect(extractJsonArray(text)).toEqual([1, 2])
  })

  it('ignores brackets inside JSON strings', () => {
    expect(extractJsonObject('说明 {not json} {"text":"数组是[1,2]"}')).toEqual({
      text: '数组是[1,2]',
    })
  })

  it('returns an empty array when no valid array exists', () => {
    expect(extractJsonArray('这不是 JSON：[broken')).toEqual([])
  })

  it('returns the first value for generic repair', () => {
    expect(repairJsonText('```json\n{"rules":[]}\n```')).toEqual({ rules: [] })
    expect(extractJsonValue('no json')).toBeNull()
  })

  it('deduplicates candidates by source range', () => {
    const candidates = extractJsonCandidates('```json\n{"a":1}\n```')
    expect(candidates.length).toBeGreaterThan(1)
    expect(dedupeJsonCandidates(candidates)).toHaveLength(1)
  })
})
