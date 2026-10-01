export interface LineIndexEntry {
  offset: number
  length: number
  lineStart: number
}

export interface LineIndex {
  lines: LineIndexEntry[]
  contentLength: number
}

export interface LineLayout {
  index: LineIndex
  heights: number[]
  tops: number[]
}

export interface LineWindow {
  startLine: number
  endLine: number
}

export const STREAMED_LINE_INDEX_THRESHOLD = 500_000

export interface RenderWindowInput {
  scrollTop: number
  clientHeight: number
  lineHeight: number
  lineCount: number
  bufferRatio?: number
}

function normalizeLineIndex(lines: LineIndexEntry[], contentLength: number): LineIndex {
  if (lines.length === 0) {
    return { lines: [{ offset: 0, length: 0, lineStart: 0 }], contentLength }
  }
  return { lines, contentLength }
}

export function buildLineIndex(content: string): LineIndex {
  const lines: LineIndexEntry[] = []
  let lineStart = 0
  for (let index = 0; index <= content.length; index++) {
    if (index === content.length || content[index] === '\n') {
      lines.push({
        offset: lineStart,
        length: index - lineStart,
        lineStart,
      })
      lineStart = index + 1
    }
  }
  return normalizeLineIndex(lines, content.length)
}

export function offsetToLineInContent(content: string, offset: number): number {
  if (content.length <= STREAMED_LINE_INDEX_THRESHOLD) {
    return offsetToLine(buildLineIndex(content), offset)
  }

  return countNewlinesBefore(content, offset)
}

export function countNewlinesBefore(content: string, offset: number): number {
  const safeOffset = Math.max(0, Math.min(offset, content.length))
  let count = 0
  for (let index = 0; index < safeOffset; index++) {
    if (content[index] === '\n') count += 1
  }
  return count
}

export function countLinesInContent(content: string): number {
  if (!content) return 1
  let count = 1
  for (let index = 0; index < content.length; index++) {
    if (content[index] === '\n') count += 1
  }
  return count
}

export interface LineIndexCache {
  getIndex(content: string): LineIndex | null
  getLineCount(content: string): number
  invalidate(): void
}

export function createLineIndexCache(): LineIndexCache {
  let cachedContent = ''
  let cachedIndex: LineIndex | null = null
  let cachedLineCount = 0
  let streamed = false

  function load(content: string) {
    if (content === cachedContent && cachedLineCount > 0) return
    if (content === '') {
      streamed = false
      cachedIndex = buildLineIndex(content)
      cachedLineCount = 1
      cachedContent = content
      return
    }
    if (content.length > STREAMED_LINE_INDEX_THRESHOLD) {
      streamed = true
      cachedIndex = null
      cachedLineCount = countLinesInContent(content)
    } else {
      streamed = false
      cachedIndex = buildLineIndex(content)
      cachedLineCount = cachedIndex.lines.length
    }
    cachedContent = content
  }

  return {
    getIndex(content) {
      load(content)
      return streamed ? null : cachedIndex
    },
    getLineCount(content) {
      load(content)
      return cachedLineCount
    },
    invalidate() {
      cachedContent = ''
      cachedIndex = null
      cachedLineCount = 0
      streamed = false
    },
  }
}

export function rebuildLineIndex(
  previous: LineIndex,
  start: number,
  end: number,
  replacement: string
): LineIndex {
  const contentLength = previous.contentLength
  const safeStart = Math.max(0, Math.min(start, contentLength))
  const safeEnd = Math.max(safeStart, Math.min(end, contentLength))
  const delta = replacement.length - (safeEnd - safeStart)
  const nextLength = contentLength + delta
  const firstLine = offsetToLine(previous, safeStart)
  const lastLine = offsetToLine(previous, safeEnd)
  const prefixLength = safeStart - previous.lines[firstLine].offset
  const suffixLength = Math.max(
    0,
    previous.lines[lastLine].offset + previous.lines[lastLine].length - safeEnd
  )
  const nextLines = previous.lines.slice(0, firstLine)

  const localLengths: number[] = []
  let currentLength = prefixLength
  for (const character of replacement) {
    if (character === '\n') {
      localLengths.push(currentLength)
      currentLength = 0
    } else {
      currentLength += 1
    }
  }
  localLengths.push(currentLength + suffixLength)

  let localOffset = previous.lines[firstLine].offset
  for (const length of localLengths) {
    nextLines.push({ offset: localOffset, length, lineStart: localOffset })
    localOffset += length + 1
  }

  for (const line of previous.lines.slice(lastLine + 1)) {
    nextLines.push({
      offset: line.offset + delta,
      length: line.length,
      lineStart: line.lineStart + delta,
    })
  }

  return normalizeLineIndex(nextLines, nextLength)
}

export function offsetToLine(index: LineIndex, offset: number): number {
  const lines = index.lines
  let low = 0
  let high = lines.length - 1
  const safeOffset = Math.max(0, Math.min(offset, index.contentLength))

  while (low < high) {
    const mid = (low + high + 1) >> 1
    if (lines[mid].offset <= safeOffset) low = mid
    else high = mid - 1
  }
  return low
}

export function lineToOffset(index: LineIndex, line: number): number {
  if (!Number.isFinite(line) || line < 0) return 0
  if (line >= index.lines.length) return index.contentLength
  return index.lines[line].offset
}

export function computeRenderWindow(input: RenderWindowInput): LineWindow {
  const {
    scrollTop,
    clientHeight,
    lineHeight,
    lineCount,
    bufferRatio = 0.25,
  } = input
  if (!Number.isFinite(lineCount) || lineCount <= 0) return { startLine: 0, endLine: 0 }
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
    return { startLine: 0, endLine: lineCount - 1 }
  }

  const safeScrollTop = Math.max(0, Number.isFinite(scrollTop) ? scrollTop : 0)
  const safeClientHeight = Math.max(0, Number.isFinite(clientHeight) ? clientHeight : 0)
  const visibleLines = Math.ceil(safeClientHeight / lineHeight)
  const buffer = Math.max(1, Math.round(visibleLines * Math.max(0, bufferRatio)))
  const firstVisible = Math.floor(safeScrollTop / lineHeight)
  const startLine = Math.max(0, firstVisible - buffer)
  const endLine = Math.min(lineCount - 1, firstVisible + visibleLines + buffer)
  return { startLine, endLine }
}

function rebuildTops(heights: number[]): number[] {
  const tops: number[] = new Array(heights.length)
  let top = 0
  for (let index = 0; index < heights.length; index++) {
    tops[index] = top
    top += heights[index]
  }
  return tops
}

export function buildLineLayout(
  content: string,
  measureLine: (lineText: string, line: number) => number
): LineLayout {
  const index = buildLineIndex(content)
  const heights = index.lines.map(line => {
    const height = measureLine(content.slice(line.offset, line.offset + line.length), line.offset)
    return Math.max(1, Number.isFinite(height) ? height : 20)
  })
  return { index, heights, tops: rebuildTops(heights) }
}

export function updateLineLayout(
  previous: LineLayout,
  start: number,
  end: number,
  replacement: string,
  measureLine: (lineText: string, line: number) => number
): LineLayout {
  const index = rebuildLineIndex(previous.index, start, end, replacement)
  const firstLine = offsetToLine(previous.index, start)
  const lastLine = offsetToLine(previous.index, end)
  const startColumn = start - previous.index.lines[firstLine].offset
  const lastLineEntry = previous.index.lines[Math.min(lastLine, previous.index.lines.length - 1)]
  const prefixLength = Math.max(0, startColumn)
  const nextHeights = previous.heights.slice(0, firstLine)
  const replacementLines = replacement.split('\n')
  const lastReplacementLine = replacementLines.at(-1) ?? ''
  const suffixLength = Math.max(
    0,
    lastLineEntry.offset + lastLineEntry.length - Math.max(start, end === start ? end + 1 : end)
  )

  if (prefixLength > 0 && replacementLines.length > 0) {
    const firstText = `${'字'.repeat(prefixLength)}${replacementLines[0]}`
    nextHeights.push(Math.max(1, measureLine(firstText, 0) || 20))
  }

  for (const line of replacementLines.slice(1, -1)) {
    nextHeights.push(Math.max(1, measureLine(line, 0) || 20))
  }

  nextHeights.push(Math.max(
    1,
    measureLine(`${replacementLines.length > 1 ? replacementLines.at(-1) : lastReplacementLine}${'字'.repeat(suffixLength)}`, 0) || 20
  ))
  nextHeights.push(...previous.heights.slice(lastLine + 1))

  return {
    index,
    heights: nextHeights,
    tops: rebuildTops(nextHeights),
  }
}

export interface LocalMeasureTextInput {
  content: string
  offset: number
  maxCharacters?: number
  lineIndex?: LineIndex | null
}

export interface LocalMeasureTextResult {
  text: string
  column: number
  line: number
  measured: number
}

export function buildLocalMeasureText(input: LocalMeasureTextInput): LocalMeasureTextResult {
  const { content, offset, lineIndex } = input
  const maxCharacters = Math.max(8, Math.floor(input.maxCharacters ?? 240))
  const safeOffset = Math.max(0, Math.min(offset, content.length))
  let line = 0
  let lineStart = 0
  if (lineIndex) {
    line = offsetToLine(lineIndex, safeOffset)
    lineStart = lineIndex.lines[line].offset
  } else {
    line = countNewlinesBefore(content, safeOffset)
    let candidate = safeOffset
    const lookbackLimit = Math.max(0, safeOffset - maxCharacters - 1)
    while (candidate > lookbackLimit && content[candidate - 1] !== '\n') {
      candidate -= 1
    }
    lineStart = candidate
  }
  const column = safeOffset - lineStart

  if (column <= maxCharacters) {
    const text = content.slice(lineStart, safeOffset)
    return {
      text: text.length > 0 ? text : '\n',
      column,
      line,
      measured: text.length,
    }
  }

  const prefixLength = Math.floor(maxCharacters / 2)
  const suffixStart = safeOffset - prefixLength
  const text = content.slice(suffixStart, safeOffset) + '\n'
  return { text, column: prefixLength, line, measured: text.length }
}

export function computeTextareaLineWindow(input: {
  textarea: { scrollTop: number; clientHeight: number; value: string }
  lineHeight: number
  bufferRatio?: number
  lineCount?: number
}): LineWindow {
  return computeRenderWindow({
    scrollTop: input.textarea.scrollTop,
    clientHeight: input.textarea.clientHeight,
    lineHeight: input.lineHeight,
    lineCount: input.lineCount ?? countLinesInContent(input.textarea.value),
    bufferRatio: input.bufferRatio,
  })
}
