import { ref, onScopeDispose, watch, type Ref } from 'vue'
import { renderMarkdown } from './markdownService'

export function useThrottledMarkdown(source: Ref<string>, intervalMs = 120) {
  const output = ref(renderMarkdown(source.value || ''))
  let lastPaintAt = 0
  let trailingTimer: number | null = null
  let frameId: number | null = null

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
      lastPaintAt = performance.now()
      output.value = renderMarkdown(source.value || '')
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
    output.value = renderMarkdown(source.value || '')
    lastPaintAt = performance.now()
  }

  watch(source, () => {
    if (performance.now() - lastPaintAt >= intervalMs) {
      paint()
    } else {
      schedulePaint()
    }
  }, { immediate: true })

  onScopeDispose(cancelPendingPaint)

  return {
    content: output,
    flush
  }
}
