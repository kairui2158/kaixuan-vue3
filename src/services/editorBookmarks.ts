import { offsetToLineInContent } from './editorVirtualization'
import { hashEditorContent } from './editorTarget'

export interface EditorBookmark {
  id: string
  documentId: string
  offset: number
  line: number
  label: string
  contentHash: string
  createdAt: string
}

function createBookmarkId(documentId: string): string {
  return `bm-${documentId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createBookmark(
  documentId: string,
  content: string,
  offset: number,
  label: string
): EditorBookmark {
  if (!documentId || typeof documentId !== 'string') {
    throw new Error('invalid_document_id')
  }
  const safeOffset = Number(offset)
  if (!Number.isFinite(safeOffset) || safeOffset < 0 || safeOffset > content.length) {
    throw new Error('invalid_offset')
  }
  const safeLabel = typeof label === 'string' ? label.trim() : ''

  return {
    id: createBookmarkId(documentId),
    documentId,
    offset: safeOffset,
    line: offsetToLineInContent(content, safeOffset),
    label: safeLabel,
    contentHash: hashEditorContent(content),
    createdAt: new Date().toISOString(),
  }
}

export function listBookmarks(bookmarks: EditorBookmark[], documentId: string): EditorBookmark[] {
  if (!Array.isArray(bookmarks) || !documentId) return []
  return bookmarks
    .filter(bookmark => bookmark.documentId === documentId)
    .sort((a, b) => a.offset - b.offset || a.createdAt.localeCompare(b.createdAt))
}

export function deleteBookmark(bookmarks: EditorBookmark[], bookmarkId: string): EditorBookmark[] {
  if (!Array.isArray(bookmarks)) return []
  return bookmarks.filter(bookmark => bookmark.id !== bookmarkId)
}

export function normalizeBookmarks(
  bookmarks: unknown,
  content: string
): EditorBookmark[] {
  if (!Array.isArray(bookmarks)) return []
  const contentHash = hashEditorContent(content)
  const result: EditorBookmark[] = []

  for (const entry of bookmarks) {
    if (!entry || typeof entry !== 'object') continue
    const bookmark = entry as Partial<EditorBookmark>
    if (!bookmark.id || !bookmark.documentId) continue
    if (bookmark.contentHash !== contentHash) continue
    const rawOffset = Number(bookmark.offset)
    if (!Number.isFinite(rawOffset)) continue
    const offset = Math.max(0, Math.min(content.length, rawOffset))

    result.push({
      id: bookmark.id,
      documentId: bookmark.documentId,
      offset,
      line: offsetToLineInContent(content, offset),
      label: typeof bookmark.label === 'string' ? bookmark.label : '',
      contentHash,
      createdAt: typeof bookmark.createdAt === 'string' ? bookmark.createdAt : '',
    })
  }

  return result
}
