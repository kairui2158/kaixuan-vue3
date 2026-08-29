import { describe, expect, it } from 'vitest'
import { selectCompleteChapters, validateChapterNarrative, validateVolumeNarrative } from './narrativeValidation'

describe('narrative completeness validation', () => {
  it('detects missing and duplicate volume structure', () => {
    const result = validateVolumeNarrative([
      { name: '序章', outline: '建立冲突' },
      { name: '序章', summary: '' }
    ], 3)
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining(['卷数缺口：当前 2 卷，目标 3 卷', '卷名重复：「序章」']))
    expect(result.missingCount).toBe(1)
  })

  it('requires chapter title and plot and rejects duplicate titles', () => {
    const result = validateChapterNarrative([
      { title: '雨夜', plot: '发现纸条' },
      { title: '雨夜', plot: '再次发现线索' },
      { title: '空章', plot: '' }
    ], 3)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('章节标题重复：「雨夜」')
    expect(result.errors).toContain('章节「空章」缺少剧情点概要')
  })

  it('selects only complete, de-duplicated chapters for a supplement batch', () => {
    expect(selectCompleteChapters([
      { title: '一', plot: '事件一' },
      { title: '一', plot: '重复' },
      { title: '二', plot: '' },
      { title: '三', summary: '事件三' }
    ])).toEqual([
      { title: '一', plot: '事件一' },
      { title: '三', summary: '事件三' }
    ])
  })
})
