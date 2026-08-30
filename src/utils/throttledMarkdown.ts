import { customRef, onScopeDispose, watch, type Ref } from 'vue'
import { renderMarkdown } from './markdownService'

export function useThrottledMarkdown(source: Ref<string>, intervalMs = 120) {
  let currentSource = source.value || ''
  let currentValue = renderMarkdown(currentSource)
  let pendingSource = currentSource
  let hasPendingSource = false
  let lastPaintAt = 0
  let trailingTimer: number | null = null
  let frameId: number | null = null

  const output = customRef<string>((track, trigger) => ({
    get() {
      track()
      return currentValue
    },
    set(value: string) {
      if (value === currentValue) return
      currentValue = value
      trigger()
    }
  }))

  function cancelPendingPaint() {
    if (trailingTimer !== null) {
      window.clearTimeout(trailingTimer)
      trailingTimer = null
    }
    if (frameId !== null) {
      window.cancelAnimationFrame(frameId)
      frameId = null
    }
  }

  function paint() {
    if (frameId !== null) return
    frameId = window.requestAnimationFrame(() => {
      frameId = null
      if (!hasPendingSource) return
      currentSource = pendingSource
      hasPendingSource = false
      lastPaintAt = performance.now()
      output.value = renderMarkdown(currentSource)
    })
  }

  function schedulePaint() {
    if (trailingTimer !== null) return
    const elapsed = performance.now() - lastPaintAt
    trailingTimer = window.setTimeout(() => {
      trailingTimer = null
      paint()
    }, Math.max(0, intervalMs - elapsed))
  }

  function flush() {
    cancelPendingPaint()
    const nextSource = source.value || ''
    if (nextSource === currentSource && !hasPendingSource) return
    pendingSource = nextSource
    hasPendingSource = true
    paint()
  }

  watch(source, (nextSource: string) => {
    pendingSource = nextSource || ''
    hasPendingSource = true
    if (performance.now() - lastPaintAt >= intervalMs) {
      paint()
    } else {
      schedulePaint()
    }
  }, { immediate: false })

  onScopeDispose(cancelPendingPaint)

  return {
    content: output,
    flush
  }
}
