import { computed, onScopeDispose, ref, type Ref } from 'vue'
import { appPerformanceMonitor, type ResponsivenessState } from './performanceMonitor'

export const responsivenessState: Ref<ResponsivenessState> = ref('normal')
export const safeModeActive = computed(() => responsivenessState.value === 'safe_mode')
export const responsivenessLastEvent = ref<string | null>(null)
export const mainProcessResponsivenessEvents = ref<Array<{ at: number; kind: string; windowId: number | null }>>([])

let projectionInstalled = false
let bridgeInstalled = false
let lastMainProcessEventAt = 0
let activeMonitor = appPerformanceMonitor

function parseWindowId(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) ? parsed : null
}

export function recordRendererResponsivenessEvent(kind: string, detail?: unknown): void {
  const api = (window as unknown as {
    electronAPI?: {
      responsivenessReport?: (payload: { kind: string; detail?: unknown }) => Promise<unknown>
    }
  }).electronAPI
  responsivenessLastEvent.value = kind
  void api?.responsivenessReport?.({ kind, detail }).catch(() => undefined)
}

function refreshMainProcessLedger(): void {
  const api = (window as unknown as {
    electronAPI?: {
      responsivenessLedger?: () => Promise<{ ok: boolean; events?: unknown[] }>
    }
  }).electronAPI
  void api?.responsivenessLedger?.().then(result => {
    if (!result?.ok || !Array.isArray(result.events)) return
    const latestAt = result.events.reduce((max: number, event) => {
      const at = Number((event as { at?: unknown })?.at)
      return Number.isFinite(at) ? Math.max(max, at) : max
    }, 0)
    if (latestAt === lastMainProcessEventAt) return
    lastMainProcessEventAt = latestAt
    mainProcessResponsivenessEvents.value = result.events.map(event => {
      const entry = event as { at?: unknown; kind?: unknown; windowId?: unknown }
      return {
        at: Number(entry.at) || 0,
        kind: String(entry.kind || 'unknown'),
        windowId: parseWindowId(entry.windowId),
      }
    })
  }).catch(() => undefined)
}

export function installResponsivenessProjection(): void {
  if (projectionInstalled) return
  projectionInstalled = true
  responsivenessState.value = activeMonitor.responsivenessState
  activeMonitor.subscribe(() => {
    responsivenessState.value = activeMonitor.responsivenessState
    if (activeMonitor.responsivenessState !== 'normal') {
      recordRendererResponsivenessEvent(`renderer_${activeMonitor.responsivenessState}`)
    }
  })
}

export function setPerformanceMonitorForTests(monitor: typeof appPerformanceMonitor | null): void {
  activeMonitor = monitor || appPerformanceMonitor
  projectionInstalled = false
}

export function installResponsivenessBridge(): void {
  if (bridgeInstalled) return
  bridgeInstalled = true
  const api = (window as unknown as {
    electronAPI?: {
      onResponsivenessEvent?: (callback: (detail: unknown) => void) => () => void
    }
  }).electronAPI
  refreshMainProcessLedger()
  const unsubscribe = api?.onResponsivenessEvent?.(() => refreshMainProcessLedger())
  if (unsubscribe) onScopeDispose(unsubscribe)
}
