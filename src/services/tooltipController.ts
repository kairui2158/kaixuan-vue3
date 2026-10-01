const VIEWPORT_MARGIN = 8
const TOOLTIP_GAP = 8
const MIN_TOOLTIP_WIDTH = 32

function resetPosition(host: HTMLElement) {
  host.classList.remove('tooltip-flipped')
  host.style.removeProperty('--tooltip-max-width')
  host.style.removeProperty('--tooltip-clamp-y')
}

function availableWidth(hostRect: DOMRect, viewportWidth: number, flipped: boolean) {
  const hostEdge = flipped ? hostRect.left : hostRect.right
  const space = flipped
    ? hostEdge - VIEWPORT_MARGIN - TOOLTIP_GAP
    : viewportWidth - VIEWPORT_MARGIN - hostEdge - TOOLTIP_GAP
  return Math.max(MIN_TOOLTIP_WIDTH, Math.floor(space))
}

function clearExitedTarget(event: Event) {
  if (event.target instanceof HTMLElement) resetPosition(event.target)
}

function place(host: HTMLElement) {
  const style = getComputedStyle(host, '::after')
  if (style.content === 'none' || style.display === 'none') {
    resetPosition(host)
    return
  }
  const hostRect = host.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const rawWidth = Number.parseFloat(style.width)
  const width = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : 280
  const rightLeft = hostRect.right + TOOLTIP_GAP
  const leftLeft = hostRect.left - TOOLTIP_GAP - width
  const rightSpace = viewportWidth - VIEWPORT_MARGIN - hostRect.right - TOOLTIP_GAP
  const leftSpace = hostRect.left - VIEWPORT_MARGIN - TOOLTIP_GAP
  const fitsRight = rightLeft + width <= viewportWidth - VIEWPORT_MARGIN
  const fitsLeft = leftLeft >= VIEWPORT_MARGIN
  const flipped = fitsRight ? false : fitsLeft ? true : leftSpace > rightSpace
  const placedLeft = flipped ? leftLeft : rightLeft
  const placedRight = placedLeft + width

  host.classList.toggle('tooltip-flipped', flipped)
  if (placedRight > viewportWidth - VIEWPORT_MARGIN || placedLeft < VIEWPORT_MARGIN) {
    host.style.setProperty('--tooltip-max-width', `${availableWidth(hostRect, viewportWidth, flipped)}px`)
  } else {
    host.style.removeProperty('--tooltip-max-width')
  }

  requestAnimationFrame(() => {
    if (!host.matches(':hover, :focus-visible')) return
    const activeStyle = getComputedStyle(host, '::after')
    const activeHeight = Number.parseFloat(activeStyle.height)
    if (!Number.isFinite(activeHeight)) return
    const activeWidth = Number.parseFloat(activeStyle.width) || 0
    const currentRect = host.getBoundingClientRect()
    const currentViewportWidth = window.innerWidth
    const currentViewportHeight = window.innerHeight
    const activeLeft = flipped
      ? currentRect.left - TOOLTIP_GAP - activeWidth
      : currentRect.right + TOOLTIP_GAP
    if ((flipped && activeLeft < VIEWPORT_MARGIN)
      || (!flipped && activeLeft + activeWidth > currentViewportWidth - VIEWPORT_MARGIN)) {
      host.style.setProperty(
        '--tooltip-max-width',
        `${availableWidth(currentRect, currentViewportWidth, flipped)}px`,
      )
    }
    const activeTop = currentRect.top + currentRect.height / 2 - activeHeight / 2
    const clampY = Math.max(
      VIEWPORT_MARGIN - activeTop,
      Math.min(currentViewportHeight - VIEWPORT_MARGIN - (activeTop + activeHeight), 0),
    )
    host.style.setProperty('--tooltip-clamp-y', `${clampY}px`)
  })
}

function handleEnter(event: Event) {
  if (event.target instanceof HTMLElement) {
    resetPosition(event.target)
    place(event.target)
  }
}

export function initTooltipController() {
  document.addEventListener('mouseenter', handleEnter, { capture: true, passive: true })
  document.addEventListener('focusin', handleEnter, { capture: true, passive: true })
  document.addEventListener('mouseleave', clearExitedTarget, { capture: true, passive: true })
  document.addEventListener('focusout', clearExitedTarget, { capture: true, passive: true })
}
