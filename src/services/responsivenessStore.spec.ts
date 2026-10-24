import { describe, expect, it, vi } from 'vitest'
import {
  installResponsivenessProjection,
  recordRendererResponsivenessEvent,
  responsivenessState,
  setPerformanceMonitorForTests,
} from './responsivenessStore'
import { PerformanceMonitor } from './performanceMonitor'

describe('responsivenessStore', () => {
  it('projects safe mode and reports renderer state to the main process', () => {
    const reports: Array<{ kind: string }> = []
    vi.stubGlobal('window', {
      electronAPI: {
        responsivenessReport: (payload: { kind: string }) => {
          reports.push(payload)
          return Promise.resolve({ ok: true })
        },
      },
    })

    const monitor = new PerformanceMonitor({ now: () => 0 })
    setPerformanceMonitorForTests(monitor)
    installResponsivenessProjection()
    monitor.requestSafeMode('test_freeze')

    expect(responsivenessState.value).toBe('safe_mode')
    expect(reports.at(-1)).toEqual({ kind: 'renderer_safe_mode', detail: undefined })

    monitor.exitSafeMode('user_exit')
    setPerformanceMonitorForTests(null)
  })

  it('records renderer events without crashing when the bridge is unavailable', async () => {
    vi.stubGlobal('window', {})
    expect(() => recordRendererResponsivenessEvent('renderer_warning')).not.toThrow()
    await Promise.resolve()
  })
})
