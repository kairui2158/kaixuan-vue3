export interface FoldRange {
  id: string
  title: string
  level: number
  startLine: number
  endLine: number
  startOffset: number
  endOffset: number
}

export interface FoldedDocument {
  content: string
  collapsedRanges: FoldRange[]
  toOriginalOffset(renderedOffset: number): number
  fromOriginalOffset(originalOffset: number): number
  isOriginalRangeVisible(start: number, end: number): boolean
}

interface HeadingLine {
  level: number
  title: string
  line: number
  startOffset: number
}

const HEADING_PATTERN = /^(#{1,6})[ \t]+(.+?)[ \t]*$/

interface HeadingCandidates {
  headings: { level: number; title: string; line: number; startOffset: number }[]
  lineOffsets: number[]
  lineEndOffsets: number[]
  lineCount: number
}

function collectHeadings(content: string): HeadingCandidates {
  const headings: HeadingCandidates['headings'] = []
  const lineOffsets: number[] = [0]
  let line = 0
  let lineStart = 0
  let match: RegExpExecArray | null

  // Single-pass heading scan keeps folding O(n) without materializing all lines.
  for (let index = 0; index <= content.length; index++) {
    if (index === content.length || content[index] === '\n') {
      const lineText = content.slice(lineStart, index)
      match = HEADING_PATTERN.exec(lineText)
      if (match) {
        headings.push({
          level: match[1].length,
          title: match[2].trim(),
          line,
          startOffset: lineStart,
        })
      }
      if (index < content.length) {
        lineOffsets.push(index + 1)
        line += 1
        lineStart = index + 1
      }
    }
  }

  const lineEndOffsets = lineOffsets.map(offset => {
    const nextNewline = content.indexOf('\n', offset)
    return nextNewline === -1 ? content.length : nextNewline
  })
  return { headings, lineOffsets, lineEndOffsets, lineCount: lineOffsets.length }
}

export function computeFoldRanges(content: string): FoldRange[] {
  if (!content) return []
  const { headings, lineOffsets, lineEndOffsets, lineCount } = collectHeadings(content)

  return headings.map((heading, index) => {
    // A heading owns until the next same-or-higher level heading; the last
    // heading owns the remainder of the document.
    const nextSibling = headings.find(item => item.line > heading.line && item.level <= heading.level)
    const endLine = nextSibling ? nextSibling.line - 1 : lineCount - 1

    return {
      id: `fold-${heading.line}-${heading.level}`,
      title: heading.title,
      level: heading.level,
      startLine: heading.line,
      endLine,
      startOffset: heading.startOffset,
      endOffset: endLine < lineEndOffsets.length ? lineEndOffsets[endLine] : content.length,
    }
  })
}

export function applyFold(content: string, collapsedIds: string[]): FoldedDocument {
  if (!content || collapsedIds.length === 0) {
    return {
      content,
      collapsedRanges: [],
      toOriginalOffset: offset => Math.max(0, Math.min(offset, content.length)),
      fromOriginalOffset: offset => Math.max(0, Math.min(offset, content.length)),
      isOriginalRangeVisible: () => true,
    }
  }

  const ranges = computeFoldRanges(content)
  const wanted = new Set(collapsedIds)
  // Collapse the outermost requested range only. Nested ranges disappear with
  // their parent, which keeps placeholders stable and prevents double hiding.
  const requested = ranges.filter(range => wanted.has(range.id))
  if (requested.length === 0) {
    return {
      content,
      collapsedRanges: [],
      toOriginalOffset: offset => Math.max(0, Math.min(offset, content.length)),
      fromOriginalOffset: offset => Math.max(0, Math.min(offset, content.length)),
      isOriginalRangeVisible: () => true,
    }
  }

  let outermost = requested[0]
  for (const range of requested.slice(1)) {
    if (range.startOffset < outermost.startOffset || range.endOffset > outermost.endOffset) {
      if (range.startOffset >= outermost.startOffset && range.endOffset <= outermost.endOffset) continue
      if (range.startOffset < outermost.startOffset) outermost = range
    }
  }
  const collapsed = [outermost]

  const hiddenCount = content
    .slice(outermost.startOffset, outermost.endOffset)
    .split('\n')
    .length - 1
  const placeholder = `[已折叠 ${hiddenCount} 行]`
  const headingEnd = content.indexOf('\n', outermost.startOffset)
  const sectionStart = headingEnd === -1 ? content.length : headingEnd + 1

  if (sectionStart >= outermost.endOffset) {
    return {
      content,
      collapsedRanges: [],
      toOriginalOffset: offset => Math.max(0, Math.min(offset, content.length)),
      fromOriginalOffset: offset => Math.max(0, Math.min(offset, content.length)),
      isOriginalRangeVisible: () => true,
    }
  }

  const rendered = content.slice(0, sectionStart) + placeholder + '\n' + content.slice(outermost.endOffset)
  const placeholderOffset = sectionStart

  return {
    content: rendered,
    collapsedRanges: collapsed,
    toOriginalOffset: offset => {
      const safeOffset = Math.max(0, Math.min(offset, rendered.length))
      if (safeOffset < placeholderOffset) return safeOffset
      if (safeOffset <= placeholderOffset + placeholder.length) return outermost.startOffset
      return Math.min(content.length, outermost.endOffset + safeOffset - (placeholderOffset + placeholder.length + 1))
    },
    fromOriginalOffset: offset => {
      const safeOffset = Math.max(0, Math.min(offset, content.length))
      if (safeOffset < sectionStart) return safeOffset
      if (safeOffset < outermost.endOffset) return placeholderOffset
      return placeholderOffset + placeholder.length + 1 + safeOffset - outermost.endOffset
    },
    isOriginalRangeVisible: (start, end) => {
      const safeStart = Math.max(0, Math.min(start, content.length))
      const safeEnd = Math.max(safeStart, Math.min(end, content.length))
      return safeEnd <= sectionStart || safeStart >= outermost.endOffset
    },
  }
}

export function toggleFold(collapsedIds: string[], ranges: FoldRange[], line: number): string[] {
  const target = ranges.find(range => range.startLine === line)
  if (!target) return [...collapsedIds]
  return collapsedIds.includes(target.id)
    ? collapsedIds.filter(id => id !== target.id)
    : [...collapsedIds, target.id]
}

export function toggleFoldForSelection(
  collapsedIds: string[],
  ranges: FoldRange[],
  selectionStart: number,
  selectionEnd: number,
): string[] {
  if (ranges.length === 0) return [...collapsedIds]
  if (selectionStart < 0 || selectionEnd < selectionStart) return [...collapsedIds]
  const start = selectionStart
  const end = selectionEnd
  const target = [...ranges]
    .sort((left, right) => (right.startOffset - right.endOffset) - (left.startOffset - left.endOffset))
    .find(range => start >= range.startOffset && end <= range.endOffset + 1)
  if (!target) return [...collapsedIds]
  return collapsedIds.includes(target.id)
    ? collapsedIds.filter(id => id !== target.id)
    : [...collapsedIds, target.id]
}
