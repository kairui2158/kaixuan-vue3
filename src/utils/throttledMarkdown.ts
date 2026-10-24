import { computed, ref, onScopeDispose, watch, type Ref } from 'vue'
import { renderMarkdown } from './markdownService'
import { safeModeActive } from '../services/responsivenessStore'

const STREAMING_RENDER_WINDOW_CHARS = 20000
const SAFE_MODE_RENDER_WINDOW_CHARS = 8000

export function useThrottledMarkdown(source: Ref<string>, intervalMs = 120) {
  const renderWindowChars = computed(() => safeModeActive.value
    ? SAFE_MODE_RENDER_WINDOW_CHARS
    : STREAMING_RENDER_WINDOW_CHARS)
  const shouldRenderWindow = computed(() => (source.value || '').length > renderWindowChars.value)
  const windowedStatus = computed(() => {
    const text = source.value || ''
    if (!shouldRenderWindow.value) return ''
    return `流式渲染保护中：已接收 ${text.length.toLocaleString()} 字，当前渲染最近 ${renderWindowChars.value.toLocaleString()} 字；完成后自动渲染全文。`
  })
  const windowed = computed(() => {
    const text = source.value || ''
    if (!shouldRenderWindow.value) return text
    return text.slice(-renderWindowChars.value)
  })
  const output = ref(renderMarkdown(windowed.value))
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
      output.value = renderMarkdown(windowed.value)
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
    flush,
    windowedStatus
  }
}
