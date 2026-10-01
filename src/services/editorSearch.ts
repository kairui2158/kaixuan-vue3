import { computeEditorMatches, type SearchOptions } from './editorReplace'

export type { SearchOptions }

export interface SearchMatch {
  start: number
  end: number
}

export interface SearchHighlightPoint {
  top: number
  left: number
  height: number
}

export interface SearchHighlightRectangle {
  top: number
  left: number
  width: number
  height: number
}

export interface SearchHighlightPlanItem extends SearchHighlightRectangle {
  active: boolean
}

export interface SearchHighlightLineWindow {
  startLine: number
  endLine: number
}

interface HighlightMeasure {
  startPoint: SearchHighlightPoint
}

export interface SearchHighlightInput {
  start: SearchHighlightPoint
  end: SearchHighlightPoint
  viewportWidth: number
}

export function computeSearchMatches(
  content: string,
  query: string,
  options: SearchOptions = {},
): SearchMatch[] {
  return computeEditorMatches(content, query, {
    caseSensitive: true,
    ...options,
  }).matches
}

function isFinitePoint(point: SearchHighlightPoint): boolean {
  return Number.isFinite(point.top)
    && Number.isFinite(point.left)
    && Number.isFinite(point.height)
    && point.height > 0
}

export function buildSearchHighlightRectangles(input: SearchHighlightInput): SearchHighlightRectangle[] {
  const { start, end, viewportWidth } = input
  if (!isFinitePoint(start) || !isFinitePoint(end) || !Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    return []
  }

  if (end.top === start.top) {
    const width = end.left - start.left
    if (!Number.isFinite(width) || width <= 0) {
      return []
    }
    return [{ top: start.top, left: start.left, width, height: start.height }]
  }

  if (end.top < start.top) {
    return []
  }

  const startWidth = viewportWidth - start.left
  if (startWidth <= 0 || end.left <= 0) {
    return []
  }
  return [
    { top: start.top, left: start.left, width: startWidth, height: start.height },
    { top: end.top, left: 0, width: end.left, height: end.height },
  ]
}

export function buildSearchHighlightPlan(input: {
  matches: SearchMatch[]
  activeIndex: number
  measureOffset: (offset: number) => { top: number; left: number; height: number; line?: number }
  viewportWidth: number
  lineWindow?: SearchHighlightLineWindow
  getLine?: (offset: number) => number | undefined
}): SearchHighlightPlanItem[] {
  const { matches, activeIndex, measureOffset, viewportWidth, lineWindow, getLine } = input
  if (!Array.isArray(matches) || matches.length === 0) {
    return []
  }

  const plan: SearchHighlightPlanItem[] = []
  const startCache = new Map<number, HighlightMeasure>()

  const measureVisibleStart = (match: SearchMatch): HighlightMeasure | null => {
    const cached = startCache.get(match.start)
    if (cached) return cached
    if (lineWindow
      && Number.isFinite(lineWindow.startLine)
      && Number.isFinite(lineWindow.endLine)
      && getLine) {
      const line = getLine(match.start)
      if (line === undefined || !Number.isFinite(line)) return null
      if (Math.max(0, line) < lineWindow.startLine || Math.max(0, line) > lineWindow.endLine) return null
    }
    const startPoint = measureOffset(match.start)
    const startLine = startPoint.line
    if (startLine === undefined || !Number.isFinite(startLine)) return null
    if (!lineWindow || !Number.isFinite(lineWindow.startLine) || !Number.isFinite(lineWindow.endLine)) {
      return { startPoint }
    }
    const visible = Math.max(0, startLine)
    if (visible < lineWindow.startLine || visible > lineWindow.endLine) return null
    const result = { startPoint }
    startCache.set(match.start, result)
    return result
  }

  const measureActiveStart = (match: SearchMatch): HighlightMeasure | null => {
    const cached = startCache.get(match.start)
    if (cached) return cached
    const startPoint = measureOffset(match.start)
    if (!Number.isFinite(startPoint.top) || !Number.isFinite(startPoint.left) || !Number.isFinite(startPoint.height)) {
      return null
    }
    const result = { startPoint }
    startCache.set(match.start, result)
    return result
  }

  matches.forEach((match, index) => {
    if (!Number.isFinite(match.start) || !Number.isFinite(match.end) || match.end <= match.start) {
      return
    }
    const isActive = index === activeIndex
    const measured = isActive ? measureActiveStart(match) : measureVisibleStart(match)
    if (!measured) return
    const { startPoint } = measured
    const rectangles = buildSearchHighlightRectangles({
      start: startPoint,
      end: measureOffset(match.end),
      viewportWidth,
    })
    for (const rectangle of rectangles) {
      plan.push({ ...rectangle, active: index === activeIndex })
    }
  })
  return plan
}
