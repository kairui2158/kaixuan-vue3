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
  revealTarget(target: EditorViewportTarget): void
  followWriteProgress(start: number, end: number): void
  stopFollow(): void
  dispose(): void
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
  let followResumeTimer: ReturnType<typeof setTimeout> | null = null
  let highlightTimer: ReturnType<typeof setTimeout> | null = null

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

  function measureOffset(offset: number): EditorViewportMeasurement {
    syncMirrorStyle()
    const safeOffset = Math.max(0, Math.min(offset, textarea.value.length))
    mirror.textContent = textarea.value.slice(0, safeOffset)
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
    const line = textarea.value.slice(0, safeOffset).split('\n').length
    mirror.textContent = ''
    return { top, left, height, line }
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
      ? 'editor-viewport-active-line'
      : 'editor-viewport-highlight'
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

  function revealTarget(target: EditorViewportTarget) {
    const start = Math.max(0, Number(target.start) || 0)
    const end = Math.max(start, Number(target.end) || start)
    const measurement = measureOffset(start)
    textarea.scrollTop = computeViewportScroll({
      top: measurement.top,
      height: measurement.height,
      clientHeight: textarea.clientHeight,
      scrollTop: textarea.scrollTop,
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
    pauseFollowTemporarily()
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
    textarea.scrollTop = computeViewportScroll({
      top: measurement.top,
      height: measurement.height,
      clientHeight: textarea.clientHeight,
      scrollTop: textarea.scrollTop,
      strategy: 'nearest',
    })
  }

  function stopFollow() {
    followEnabled = false
    if (followResumeTimer) {
      clearTimeout(followResumeTimer)
      followResumeTimer = null
    }
    if (highlightLayer && highlightLayer.className === 'editor-viewport-active-line') {
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
    revealTarget,
    followWriteProgress,
    stopFollow,
    dispose,
  }
}

export { createTextareaViewport }
