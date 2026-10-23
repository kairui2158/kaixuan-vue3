import { describe, expect, it } from 'vitest'
import { mergeChapterCommit } from './chapterArtifactCommit'

describe('mergeChapterCommit', () => {
  it('keeps chapters persisted by another run during the API call', () => {
    const result = mergeChapterCommit({
      untouchedChapters: [{ id: 'manual-1', title: '手写章' }],
      collected: [
        { id: 'ch-1', title: '第 1 章' },
        { id: 'ch-2', title: '第 2 章' },
      ],
      concurrentChapters: [
        { id: 'manual-1', title: '手写章' },
        { id: 'ch-1', title: '本 run 旧态，不作为合并来源' },
        { id: 'other-run-1', title: '并行 run 新章' },
      ],
    })

    expect(result.map(chapter => chapter.id)).toEqual([
      'manual-1',
      'other-run-1',
      'ch-1',
      'ch-2',
    ])
  })

  it('does not duplicate chapters without an id', () => {
    const result = mergeChapterCommit({
      untouchedChapters: [],
      collected: [{ title: '本批生成章' }],
      concurrentChapters: [{ id: 'other-run-1', title: '并行 run 新章' }],
    })

    expect(result).toHaveLength(2)
    expect(result.some(chapter => !chapter.id)).toBe(true)
  })
})
