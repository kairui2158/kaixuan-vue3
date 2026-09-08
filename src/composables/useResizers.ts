import { ref, type Ref } from 'vue'

interface PaneConfig {
  selector: string
  storageKey: string
  minPercent: number
  maxPercent: number
  defaultPercent: number
}

interface DragState {
  active: boolean
  target: string | null
  startX: number
  startPercent: number
  rafId: number | null
}

export function useResizers(containerRef: Ref<HTMLElement | null>, panes: PaneConfig[]) {
  const widths = ref<Record<string, number>>({})
  const dragging = ref(false)
  const dragTooltip = ref<{ x: number; y: number; text: string } | null>(null)

  const dragState: DragState = {
    active: false,
    target: null,
    startX: 0,
    startPercent: 0,
    rafId: null,
  }

  // Touch helper: extract clientX from mouse or touch event
  function getClientX(e: MouseEvent | TouchEvent): number {
    if ('touches' in e && e.touches.length > 0) return e.touches[0].clientX
    if ('changedTouches' in e && e.changedTouches.length > 0) return e.changedTouches[0].clientX
    return (e as MouseEvent).clientX
  }

  function getContainerWidth(): number {
    return containerRef.value?.clientWidth ?? window.innerWidth
  }

  function loadSavedWidths() {
    for (const pane of panes) {
      const saved = localStorage.getItem(pane.storageKey)
      if (saved !== null) {
        const val = parseFloat(saved)
        if (!isNaN(val) && val >= pane.minPercent && val <= pane.maxPercent) {
          widths.value[pane.selector] = val
          continue
        }
      }
      widths.value[pane.selector] = pane.defaultPercent
    }
  }

  function applyWidthsToDOM() {
    for (const pane of panes) {
      const el = document.querySelector(pane.selector) as HTMLElement | null
      if (!el) continue
      const pct = widths.value[pane.selector] ?? pane.defaultPercent
      el.style.flex = `0 0 ${pct}%`
      el.style.width = 'auto'
    }
  }

  function saveWidths() {
    for (const pane of panes) {
      const pct = widths.value[pane.selector]
      if (pct !== undefined) localStorage.setItem(pane.storageKey, String(pct))
    }
  }

  function onDragStart(e: MouseEvent | TouchEvent, target: string) {
    e.preventDefault()
    dragState.active = true
    dragState.target = target
    dragState.startX = getClientX(e)
    dragState.startPercent = widths.value[target] ?? 0
    dragging.value = true
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'

    document.addEventListener('mousemove', onDragMove)
    document.addEventListener('mouseup', onDragEnd)
    document.addEventListener('touchmove', onDragMove, { passive: false })
    document.addEventListener('touchend', onDragEnd)
  }

  function onDragMove(e: MouseEvent | TouchEvent) {
    if (!dragState.active || !dragState.target) return
    e.preventDefault()

    const paneConfig = panes.find(p => p.selector === dragState.target)
    if (!paneConfig) return

    const containerWidth = getContainerWidth()
    const diffPx = getClientX(e) - dragState.startX
    const diffPct = (diffPx / containerWidth) * 100

    // For chat panel: dragging right means narrower, so invert
    const isInverse = paneConfig.selector.includes('chat')
    const newPct = isInverse
      ? dragState.startPercent - diffPct
      : dragState.startPercent + diffPct

    const clamped = Math.max(paneConfig.minPercent, Math.min(paneConfig.maxPercent, newPct))
    widths.value[dragState.target] = clamped

    // Update tooltip
    dragTooltip.value = {
      x: getClientX(e),
      y: 50,
      text: `${paneConfig.selector.includes('chapter') ? '章节树' : '对话框'}: ${Math.round(clamped)}%`,
    }

    // RAF throttle DOM write
    if (dragState.rafId !== null) cancelAnimationFrame(dragState.rafId)
    dragState.rafId = requestAnimationFrame(() => {
      applyWidthsToDOM()
      dragState.rafId = null
    })
  }

  function onDragEnd() {
    if (dragState.active) {
      saveWidths()
    }
    dragState.active = false
    dragState.target = null
    dragging.value = false
    dragTooltip.value = null
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    document.removeEventListener('mousemove', onDragMove)
    document.removeEventListener('mouseup', onDragEnd)
    document.removeEventListener('touchmove', onDragMove)
    document.removeEventListener('touchend', onDragEnd)
    if (dragState.rafId !== null) {
      cancelAnimationFrame(dragState.rafId)
      dragState.rafId = null
    }
  }

  function resetWidth(target: string) {
    const paneConfig = panes.find(p => p.selector === target)
    if (!paneConfig) return
    widths.value[target] = paneConfig.defaultPercent
    applyWidthsToDOM()
    saveWidths()
  }

  // Double-tap detection for touch (500ms window, same splitter)
  const splitterTaps: { target: string | null; timeoutId: number | null } = {
    target: null,
    timeoutId: null,
  }

  function onSplitterClick(target: string) {
    if (splitterTaps.target === target) {
      clearTimeout(splitterTaps.timeoutId!)
      splitterTaps.timeoutId = null
      splitterTaps.target = null
      resetWidth(target)
    } else {
      splitterTaps.target = target
      splitterTaps.timeoutId = window.setTimeout(() => { splitterTaps.target = null }, 500)
    }
  }

  function bindSplitters() {
    const splitters = document.querySelectorAll('.resizer-v')
    splitters.forEach(el => {
      const htmlEl = el as HTMLElement
      if (htmlEl.dataset.resizerInit) return
      htmlEl.dataset.resizerInit = '1'
      const targetAttr = htmlEl.getAttribute('data-target')
      if (!targetAttr) return
      const paneConfig = panes.find(p => p.selector.endsWith(targetAttr) || p.selector.includes(targetAttr))
      if (!paneConfig) return
      const targetSelector = paneConfig.selector

      htmlEl.addEventListener('mousedown', (e) => onDragStart(e, targetSelector))
      htmlEl.addEventListener('touchstart', (e) => onDragStart(e, targetSelector), { passive: false })
      htmlEl.addEventListener('dblclick', () => resetWidth(targetSelector))
      htmlEl.addEventListener('click', () => onSplitterClick(targetSelector))
    })
  }

  function init() {
    loadSavedWidths()
    applyWidthsToDOM()
    bindSplitters()
  }

  function rebind() {
    bindSplitters()
    applyWidthsToDOM()
  }

  return {
    widths,
    dragging,
    dragTooltip,
    init,
    rebind,
    resetWidth,
    onDragStart,
    onDragMove,
    onDragEnd,
  }
}
