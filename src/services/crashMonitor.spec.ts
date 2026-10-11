import { describe, expect, it } from 'vitest'
import { createCrashMonitor } from './crashMonitor'

describe('crashMonitor', () => {
  it('records real renderer crashes', () => {
    const monitor = createCrashMonitor()
    monitor.rendererCrashed()
    expect(monitor.crashed).toBe(true)
    expect(monitor.reasons).toEqual(['renderer page crashed'])
  })

  it('does not record intentional teardown disconnects as crashes', () => {
    const monitor = createCrashMonitor()
    monitor.beginTeardown()
    monitor.browserDisconnected()
    monitor.electronExit(0)
    expect(monitor.crashed).toBe(false)
    expect(monitor.reasons).toEqual([])
    expect(monitor.exitCode).toBe(0)
  })

  it('records a disconnect that happens before teardown starts', () => {
    const monitor = createCrashMonitor()
    monitor.browserDisconnected()
    monitor.beginTeardown()
    expect(monitor.crashed).toBe(true)
    expect(monitor.reasons).toEqual(['Electron browser disconnected'])
  })

  it('keeps page errors separate from crash reasons', () => {
    const monitor = createCrashMonitor()
    monitor.pageError('TypeError in renderer')
    expect(monitor.crashed).toBe(false)
    expect(monitor.pageErrors).toEqual(['TypeError in renderer'])
  })
})
