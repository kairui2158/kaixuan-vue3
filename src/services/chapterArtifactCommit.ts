export interface ChapterLike {
  id?: string
  [key: string]: unknown
}

/**
 * Merges a chapter batch into the volume's current chapter list without
 * discarding chapters persisted by other runs during this batch's API call.
 */
export function mergeChapterCommit(options: {
  untouchedChapters: ChapterLike[]
  collected: ChapterLike[]
  concurrentChapters: ChapterLike[]
}): ChapterLike[] {
  const { untouchedChapters, collected, concurrentChapters } = options
  const localIds = new Set(
    untouchedChapters
      .concat(collected)
      .map(chapter => chapter?.id)
      .filter(Boolean)
  )
  const foreignChapters = concurrentChapters.filter(chapter => {
    const id = chapter?.id
    return id ? !localIds.has(id) : true
  })
  return [...untouchedChapters, ...foreignChapters, ...collected]
}
