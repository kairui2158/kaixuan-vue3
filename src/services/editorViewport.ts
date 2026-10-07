import {
  buildLocalMeasureText,
  computeTextareaLineWindow,
  countNewlinesBefore,
  createLineIndexCache,
  offsetToLine,
} from './editorVirtualization'

export type EditorViewportScrollStrategy = 'start' | 'end' | 'center' | 'nearest'
export type EditorViewportFocus = 'auto' | 'start' | 'end' | 'center'

export interface EditorViewportTarget {
  start: number
  end: number
  focus?: EditorViewportFocus
  highlightMs?: number
}

export interface EditorViewportMeasurement {
  top: number
  left: number
  height: number
  line: number
}

export interface EditorViewportScrollInput {
  top: number
  height: number
  clientHeight: number
  scrollTop: number
  strategy: EditorViewportScrollStrategy
}

export interface EditorViewport {
  measureOffset(offset: number): EditorViewportMeasurement
  getLine(offset: number): number
  getLineHeight(): number
  getLineWindow(bufferRatio?: number): { startLine: number; endLine: number }
  revealTarget(target: EditorViewportTarget): void
  followWriteProgress(start: number, end: number): void
  stopFollow(): void
  dispose(): void
  onViewportScroll(listener: () => void): () => void
}

const MIRROR_STYLE_PROPERTIES = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'lineHeight',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'boxSizing',
  'whiteSpace',
  'wordBreak',
  'overflowWrap',
  'tabSize',
] as const

export function computeViewportScroll(input: EditorViewportScrollInput): number {
  const { top, height, clientHeight, scrollTop, strategy } = input
  const targetBottom = top + height
  if (strategy === 'nearest' && top >= scrollTop && targetBottom <= scrollTop + clientHeight) {
    return scrollTop
  }
  let next = scrollTop
  if (strategy === 'start') next = top
  else if (strategy === 'end') next = targetBottom - clientHeight
  else next = top + height / 2 - clientHeight / 2
  return Math.max(0, next)
}

export function resolveScrollStrategy(focus: EditorViewportFocus): EditorViewportScrollStrategy {
  if (focus === 'start' || focus === 'end' || focus === 'center') return focus
  return 'nearest'
}

function createTextareaViewport(options: {
  textarea: HTMLTextAreaElement
  mirror: HTMLDivElement
  highlightLayer?: HTMLDivElement
}): EditorViewport {
  const { textarea, mirror, highlightLayer } = options
  let followEnabled = true
  let cachedLineHeight = 20
  let cachedClientWidth = 0
  let followResumeTimer: ReturnType<typeof setTimeout> | null = null
  let highlightTimer: ReturnType<typeof setTimeout> | null = null
  const lineIndexCache = createLineIndexCache()
  const scrollListeners = new Set<() => void>()
  let pendingProgrammaticScroll = false

  mirror.setAttribute('aria-hidden', 'true')
  mirror.style.position = 'absolute'
  mirror.style.visibility = 'hidden'
  mirror.style.pointerEvents = 'none'
  mirror.style.whiteSpace = 'pre-wrap'
  mirror.style.overflowWrap = 'break-word'

  function syncMirrorStyle() {
    const style = window.getComputedStyle(textarea)
    for (const property of MIRROR_STYLE_PROPERTIES) {
      mirror.style.setProperty(property, style.getPropertyValue(property))
    }
    mirror.style.width = `${textarea.clientWidth}px`
  }

  function measureLocalLineHeight(content: string): number {
    mirror.textContent = content
    const height = mirror.offsetHeight
    mirror.textContent = ''
    return Math.max(1, height || 20)
  }

  function getLineHeight(): number {
    syncMirrorStyle()
    if (cachedClientWidth !== textarea.clientWidth) {
      cachedClientWidth = textarea.clientWidth
      cachedLineHeight = measureLocalLineHeight('测')
    }
    return cachedLineHeight
  }

  function getLineWindow(bufferRatio = 0.25) {
    const value = textarea.value
    return computeTextareaLineWindow({
      textarea,
      lineHeight: getLineHeight(),
      bufferRatio,
      lineCount: lineIndexCache.getLineCount(value),
    })
  }

  function measureOffset(offset: number): EditorViewportMeasurement {
    syncMirrorStyle()
    const content = textarea.value
    const safeOffset = Math.max(0, Math.min(offset, content.length))
    const index = lineIndexCache.getIndex(content)
    const local = buildLocalMeasureText({
      content,
      offset: safeOffset,
      maxCharacters: 240,
      lineIndex: index,
    })
    mirror.textContent = local.line > 0 ? `${'\n'.repeat(local.line)}${local.text}` : local.text
    const textNode = mirror.firstChild
    let top = mirror.offsetTop
    let left = mirror.offsetLeft
    let height = parseFloat(window.getComputedStyle(textarea).lineHeight) || 20
    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
      const range = document.createRange()
      range.selectNodeContents(textNode)
      range.collapse(false)
      const rect = range.getBoundingClientRect()
      const mirrorRect = mirror.getBoundingClientRect()
      if (rect.height > 0) {
        top = rect.top - mirrorRect.top
        left = rect.left - mirrorRect.left
        height = rect.height
      }
    }
    const line = local.line
    if (local.line > 0) {
      top += local.line * getLineHeight()
    }
    mirror.textContent = ''
    return { top, left, height, line }
  }

  function getLine(offset: number): number {
    const content = textarea.value
    const safeOffset = Math.max(0, Math.min(offset, content.length))
    const index = lineIndexCache.getIndex(content)
    return index ? offsetToLine(index, safeOffset) : countNewlinesBefore(content, safeOffset)
  }

  function showHighlight(start: number, end: number, active: boolean, highlightMs?: number) {
    if (!highlightLayer) return
    if (highlightTimer) {
      clearTimeout(highlightTimer)
      highlightTimer = null
    }
    const startRect = measureOffset(start)
    const endRect = measureOffset(Math.max(start, end))
    highlightLayer.className = active
      ? 'editor-viewport-highlight-layer editor-viewport-active-line'
      : 'editor-viewport-highlight-layer editor-viewport-highlight'
    highlightLayer.style.left = `${Math.min(startRect.left, endRect.left)}px`
    highlightLayer.style.top = `${startRect.top}px`
    highlightLayer.style.width = `${Math.max(24, Math.abs(endRect.left - startRect.left) + 8)}px`
    highlightLayer.style.height = `${Math.max(startRect.height, endRect.height)}px`
    if (!active && highlightMs !== 0) {
      highlightTimer = setTimeout(() => {
        highlightLayer!.className = ''
        highlightTimer = null
      }, Math.max(0, Math.min(10000, highlightMs ?? 3000)))
    }
  }

  function scrollToTarget(input: {
    top: number
    height: number
    strategy: EditorViewportScrollStrategy
  }) {
    const nextScrollTop = computeViewportScroll({
      top: input.top,
      height: input.height,
      clientHeight: textarea.clientHeight,
      scrollTop: textarea.scrollTop,
      strategy: input.strategy,
    })
    if (nextScrollTop === textarea.scrollTop) return
    pendingProgrammaticScroll = true
    textarea.scrollTop = nextScrollTop
  }

  function revealTarget(target: EditorViewportTarget) {
    const start = Math.max(0, Number(target.start) || 0)
    const end = Math.max(start, Number(target.end) || start)
    const measurement = measureOffset(start)
    scrollToTarget({
      top: measurement.top,
      height: measurement.height,
      strategy: resolveScrollStrategy(target.focus || 'auto'),
    })
    textarea.setSelectionRange(start, end)
    showHighlight(start, end, false, target.highlightMs)
  }

  function pauseFollowTemporarily() {
    followEnabled = false
    if (followResumeTimer) clearTimeout(followResumeTimer)
    followResumeTimer = setTimeout(() => {
      followEnabled = true
      followResumeTimer = null
    }, 2500)
  }

  function onUserScroll() {
    if (pendingProgrammaticScroll) {
      pendingProgrammaticScroll = false
    } else {
      pauseFollowTemporarily()
    }
    scrollListeners.forEach(listener => listener())
  }

  function onViewportScroll(listener: () => void) {
    scrollListeners.add(listener)
    return () => scrollListeners.delete(listener)
  }

  function onUserInteraction() {
    pauseFollowTemporarily()
  }

  textarea.addEventListener('scroll', onUserScroll)
  textarea.addEventListener('keydown', onUserInteraction)
  textarea.addEventListener('pointerdown', onUserInteraction)

  function followWriteProgress(start: number, end: number) {
    if (!followEnabled) return
    showHighlight(start, end, true)
    const measurement = measureOffset(start)
    scrollToTarget({
      top: measurement.top,
      height: measurement.height,
      strategy: 'nearest',
    })
  }

  function stopFollow() {
    followEnabled = false
    if (followResumeTimer) {
      clearTimeout(followResumeTimer)
      followResumeTimer = null
    }
    if (highlightLayer && highlightLayer.className.includes('editor-viewport-active-line')) {
      highlightLayer.className = ''
    }
  }

  function dispose() {
    stopFollow()
    if (highlightTimer) {
      clearTimeout(highlightTimer)
      highlightTimer = null
    }
    textarea.removeEventListener('scroll', onUserScroll)
    textarea.removeEventListener('keydown', onUserInteraction)
    textarea.removeEventListener('pointerdown', onUserInteraction)
    mirror.remove()
  }

  return {
    measureOffset,
    getLine,
    getLineHeight,
    getLineWindow,
    revealTarget,
    followWriteProgress,
    stopFollow,
    onViewportScroll,
    dispose,
  }
}

export { createTextareaViewport }
