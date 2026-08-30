import { describe, expect, it } from 'vitest'
import {
  selectCompleteChapters,
  validateChapterExecutionPackage,
  validateChapterNarrative,
  validateVolumeNarrative
} from './narrativeValidation'

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

  it('reports missing fields in a chapter execution package', () => {
    const result = validateChapterExecutionPackage({
      version: 1,
      volume: { id: '', name: '', outline: '' },
      chapter: { id: '', title: '', plot: '' },
      outlineContent: '',
      sourceRefs: []
    })
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      '执行包缺少卷名',
      '执行包缺少章节标题',
      '执行包缺少章节剧情点',
      '执行包缺少全书大纲内容',
      '执行包缺少来源编号'
    ]))
    expect(result.missingCount).toBeGreaterThan(0)
  })

  it('detects numbering gaps in sequence-style source refs', () => {
    const result = validateChapterExecutionPackage(validPackage({ sourceRefs: ['source-01', 'source-03'] }))
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('来源编号断档：「source」组第 2 个编号应为 2，实际为 3')
  })

  it('reports scene count mismatch against the expected scene count', () => {
    const result = validateChapterExecutionPackage(
      validPackage({ scenes: [{ name: '雨夜码头', description: '接头' }] }),
      { expectedSceneCount: 2 }
    )
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('场景数量不一致：执行包含 1 个场景，预期 2 个')
  })

  it('accepts a complete package without false positives', () => {
    const result = validateChapterExecutionPackage(validPackage({}))
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })
})

function validPackage(overrides: Record<string, unknown>) {
  return {
    version: 1,
    projectId: 'p-1',
    volume: { id: 'vol-1', index: 0, name: '第一卷', outline: '主线起步', summary: '主线起步', suggestedWords: 100000 },
    chapter: { id: 'ch-1', index: 0, title: '雨夜', plot: '发现纸条', summary: '发现纸条', wordCount: 3000 },
    outlineContent: '全书大纲……',
    settings: ['世界观 - 灵气复苏'],
    boundSettings: '',
    styleContext: '',
    pacingContext: '',
    memoryContext: '',
    sourceRefs: ['outline:locked', 'volume:vol-1', 'chapter:ch-1'],
    ...overrides
  }
}
