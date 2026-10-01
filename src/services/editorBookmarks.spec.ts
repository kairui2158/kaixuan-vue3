import { describe, expect, it } from 'vitest'
import {
  createBookmark,
  deleteBookmark,
  listBookmarks,
  normalizeBookmarks,
} from './editorBookmarks'

const content = [
  '# 第一卷 北境',
  '少年在雪原行走。',
  '# 第二卷 南方',
  '旧城位于河湾。',
].join('\n')

describe('createBookmark', () => {
  it('creates a bookmark with offset, line, label, and content hash', () => {
    const bookmark = createBookmark('tab-1', content, content.indexOf('少年'), '北境开头')

    expect(bookmark).toMatchObject({
      documentId: 'tab-1',
      offset: content.indexOf('少年'),
      line: 1,
      label: '北境开头',
    })
    expect(bookmark.id).toBeTruthy()
    expect(bookmark.contentHash).toBeTruthy()
  })

  it('rejects invalid document, offset, and label input', () => {
    expect(() => createBookmark('', content, 0, '书签')).toThrow()
    expect(() => createBookmark('tab-1', content, -1, '书签')).toThrow()
    expect(() => createBookmark('tab-1', content, content.length + 1, '书签')).toThrow()
    expect(() => createBookmark('tab-1', content, 0, '')).not.toThrow()
  })
})

describe('listBookmarks', () => {
  it('returns only the requested document, sorted by offset', () => {
    const first = createBookmark('tab-1', content, content.indexOf('旧城'), '南方')
    const second = createBookmark('tab-1', content, content.indexOf('少年'), '北境')
    const other = createBookmark('tab-2', 'other', 0, '')

    expect(listBookmarks([first, second, other], 'tab-1')).toEqual([second, first])
    expect(listBookmarks([first, second, other], 'tab-2')).toEqual([other])
    expect(listBookmarks([first, second, other], 'missing')).toEqual([])
  })
})

describe('deleteBookmark', () => {
  it('deletes by id and keeps unknown ids untouched', () => {
    const first = createBookmark('tab-1', content, 0, '')
    const second = createBookmark('tab-1', content, 5, '')

    expect(deleteBookmark([first, second], first.id)).toEqual([second])
    expect(deleteBookmark([second], 'missing')).toEqual([second])
  })
})

describe('normalizeBookmarks', () => {
  it('drops invalid entries, stale hashes, and clamps offsets', () => {
    const valid = createBookmark('tab-1', content, content.indexOf('旧城'), '南方')
    const stale = { ...valid, contentHash: 'stale' }
    const tooFar = { ...valid, id: 'too-far', offset: 9999 }
    const missingId = { ...valid, id: '' }

    const normalized = normalizeBookmarks([valid, stale, tooFar, missingId, null], content)

    expect(normalized).toHaveLength(2)
    expect(normalized[0]).toMatchObject(valid)
    expect(normalized.find(item => item.id === 'too-far')?.offset).toBe(content.length)
    expect(normalized.find(item => item.id === valid.id)).toBeTruthy()
  })

  it('returns an empty list for empty input', () => {
    expect(normalizeBookmarks([], content)).toEqual([])
    expect(normalizeBookmarks(undefined, '')).toEqual([])
  })
})
