import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as responsivenessLedger from './responsivenessLedger.js'

const listeners = new Map()
const ipcMain = {
  handle: vi.fn((channel, handler) => listeners.set(channel, handler)),
}
const send = vi.fn()
const {
  registerResponsivenessHandlers,
} = responsivenessLedger

beforeEach(() => {
  responsivenessLedger.resetResponsivenessLedgerForTests()
  listeners.clear()
  ipcMain.handle.mockClear()
  send.mockClear()
  vi.resetModules()
})

describe('responsiveness ledger', () => {
  it('records window events in a bounded ledger and notifies the renderer', async () => {
    const { attachWindowResponsivenessListeners, getLedgerEvents, registerResponsivenessHandlers } = responsivenessLedger
    const events = []
    const webContents = {
      on: (name, handler) => events.push({ name, handler }),
      send,
    }
    const win = { isDestroyed: () => false, webContents }
    registerResponsivenessHandlers(ipcMain, win)
    attachWindowResponsivenessListeners(win, 7)

    events.find(event => event.name === 'unresponsive')?.handler()
    events.find(event => event.name === 'responsive')?.handler()
    events.find(event => event.name === 'render-process-gone')?.handler(null, { reason: 'crashed', exitCode: 11 })

    const ledger = getLedgerEvents()
    expect(ledger.map(event => event.kind)).toEqual([
      'unresponsive',
      'responsive',
      'render-process-gone',
      'renderer_recovery_scheduled',
    ])
    expect(ledger[2]).toMatchObject({ windowId: 7, detail: { reason: 'crashed', exitCode: 11 } })
    await new Promise(resolve => process.nextTick(resolve))
    expect(send).toHaveBeenCalledWith('app:responsivenessEvent', { kind: 'ledger-updated' })
  })

  it('reloads a crashed renderer from the main process', async () => {
    vi.useFakeTimers()
    const loadFile = vi.fn(() => Promise.resolve())
    const events = []
    const webContents = {
      on: (name, handler) => events.push({ name, handler }),
      loadFile,
    }
    const win = { isDestroyed: () => false, webContents }

    try {
      responsivenessLedger.attachWindowResponsivenessListeners(win, 7)
      events.find(event => event.name === 'render-process-gone')?.handler(null, { reason: 'crashed', exitCode: 11 })

      expect(loadFile).not.toHaveBeenCalled()
      vi.advanceTimersByTime(5_000)
      expect(loadFile).toHaveBeenCalledTimes(1)
      expect(String(loadFile.mock.calls[0][0])).toContain('dist-renderer')
      await vi.waitFor(() => expect(responsivenessLedger.getLedgerEvents().at(-1)).toMatchObject({
        kind: 'renderer_recovery_reloaded',
        windowId: 7,
      }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('records a failed main-process reload instead of silently losing recovery', async () => {
    vi.useFakeTimers()
    const loadFile = vi.fn(() => Promise.reject(new Error('ERR_FILE_NOT_FOUND')))
    const events = []
    const webContents = {
      on: (name, handler) => events.push({ name, handler }),
      loadFile,
    }
    const win = { id: 9, isDestroyed: () => false, webContents }

    try {
      responsivenessLedger.attachWindowResponsivenessListeners(win, 9)
      events.find(event => event.name === 'render-process-gone')?.handler(null, { reason: 'crashed', exitCode: 2 })
      vi.advanceTimersByTime(5_000)
      await Promise.resolve()
      await Promise.resolve()
      expect(responsivenessLedger.getLedgerEvents().at(-1)).toMatchObject({
        kind: 'renderer_recovery_failed',
        windowId: 9,
        detail: { reason: 'ERR_FILE_NOT_FOUND' },
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects reports from another window', async () => {
    const sender = { send }
    registerResponsivenessHandlers(ipcMain, { isDestroyed: () => false, webContents: sender })

    const reportHandler = listeners.get('responsiveness:report')
    const result = await reportHandler({ sender: {} }, { kind: 'renderer_safe_mode' })
    expect(result).toEqual({ ok: false, reason: 'wrong_window' })
  })

  it('keeps recording events when notifying a destroyed frame throws asynchronously', async () => {
    const sender = {
      send,
      isDestroyed: () => false,
    }
    const failingSend = vi.fn(() => { throw new Error('render frame disposed') })
    const failingSender = { send: failingSend, isDestroyed: () => false }
    const first = { isDestroyed: () => false, id: 51, webContents: sender }
    const second = { isDestroyed: () => false, id: 52, webContents: failingSender }
    registerResponsivenessHandlers(ipcMain, first)
    registerResponsivenessHandlers(ipcMain, second)

    responsivenessLedger.record({ kind: 'render-process-gone', windowId: 52 })
    await new Promise(resolve => process.nextTick(resolve))
    expect(failingSend).toHaveBeenCalledTimes(1)

    responsivenessLedger.record({ kind: 'responsive', windowId: 52 })
    await new Promise(resolve => process.nextTick(resolve))
    expect(responsivenessLedger.getLedgerEvents().map(event => event.kind)).toEqual([
      'render-process-gone',
      'responsive',
    ])
  })

  it('lets every registered window read the global ledger and report under its own identity', async () => {
    const firstSender = { send: vi.fn() }
    const secondSender = { send: vi.fn() }
    const first = { isDestroyed: () => false, id: 41, webContents: firstSender }
    const second = { isDestroyed: () => false, id: 42, webContents: secondSender }

    registerResponsivenessHandlers(ipcMain, first)
    registerResponsivenessHandlers(ipcMain, second)
    responsivenessLedger.record({ kind: 'unresponsive', windowId: 42, detail: { reason: 'renderer_unresponsive' } })

    const ledgerHandler = listeners.get('responsiveness:ledger')
    const firstLedger = await ledgerHandler({ sender: firstSender })
    const secondLedger = await ledgerHandler({ sender: secondSender })
    expect(firstLedger).toEqual(secondLedger)
    expect(firstLedger.ok).toBe(true)
    expect(firstLedger.events.at(-1)).toMatchObject({ kind: 'unresponsive', windowId: 42 })

    const reportHandler = listeners.get('responsiveness:report')
    const report = await reportHandler({ sender: secondSender }, { kind: 'renderer_warning' })
    expect(report).toEqual({ ok: true })
    expect(responsivenessLedger.getLedgerEvents().at(-1)).toMatchObject({
      kind: 'renderer_warning',
      windowId: 42,
    })
    await new Promise(resolve => process.nextTick(resolve))
    expect(firstSender.send).toHaveBeenCalledWith('app:responsivenessEvent', { kind: 'ledger-updated' })
    expect(secondSender.send).toHaveBeenCalledWith('app:responsivenessEvent', { kind: 'ledger-updated' })
  })

  it('registers the crash and block test control only for the owning window', async () => {
    const executeJavaScript = vi.fn(() => Promise.resolve())
    const forcefullyCrash = vi.fn()
    const reloadIgnoringCache = vi.fn()
    const ownerSender = { send: vi.fn() }
    const webContents = {
      send: ownerSender.send,
      executeJavaScript,
      forcefullyCrashRenderer: forcefullyCrash,
      reloadIgnoringCache,
    }
    responsivenessLedger.registerResponsivenessTestHandlers(ipcMain, {
      isDestroyed: () => false,
      webContents,
    })

    const testHandler = listeners.get('responsiveness:testControl')
    const rejected = await testHandler({ sender: {} }, { action: 'block', durationMs: 20_000 })
    expect(rejected).toEqual({ ok: false, reason: 'wrong_window' })

    const block = await testHandler({ sender: webContents }, { action: 'block', durationMs: 60_000 })
    expect(block).toEqual({ ok: true, action: 'block', durationMs: 60_000 })
    expect(executeJavaScript).toHaveBeenCalledTimes(1)
    expect(String(executeJavaScript.mock.calls[0][0])).toContain('performance.now()+60000')

    const crash = await testHandler({ sender: webContents }, { action: 'crash' })
    expect(crash).toEqual({ ok: true, action: 'crash' })
    expect(forcefullyCrash).toHaveBeenCalledTimes(1)

    const reload = await testHandler({ sender: webContents }, { action: 'reload' })
    expect(reload).toEqual({ ok: true, action: 'reload' })
    expect(reloadIgnoringCache).toHaveBeenCalledTimes(1)
  })

  it('reloads popup windows that survive a shared renderer crash', async () => {
    vi.useFakeTimers()
    const popupLoadFile = vi.fn(() => Promise.resolve())
    const events = []
    const webContents = {
      on: (name, handler) => events.push({ name, handler }),
      loadFile: popupLoadFile,
    }
    const popup = { id: 88, isDestroyed: () => false, webContents }

    try {
      responsivenessLedger.registerResponsivenessHandlers(ipcMain, popup)
      responsivenessLedger.attachWindowResponsivenessListeners(popup, 7)
      events.find(event => event.name === 'render-process-gone')?.handler(null, { reason: 'crashed', exitCode: 2 })

      vi.advanceTimersByTime(5_000)
      expect(popupLoadFile).toHaveBeenCalledTimes(1)
      await vi.waitFor(() => expect(responsivenessLedger.getLedgerEvents().at(-1)).toMatchObject({
        kind: 'renderer_recovery_reloaded',
        windowId: 7,
      }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps registering nested popup windows as full responsiveness surfaces', () => {
    const nestedEvents = []
    const nestedWebContents = {
      on: (name, handler) => nestedEvents.push({ name, handler }),
      loadFile: vi.fn(),
    }
    const nestedPopup = { id: 99, isDestroyed: () => false, webContents: nestedWebContents }

    responsivenessLedger.registerResponsivenessHandlers(ipcMain, nestedPopup)
    responsivenessLedger.attachWindowResponsivenessListeners(nestedPopup, 88)

    const ledgerHandler = listeners.get('responsiveness:ledger')
    expect(ledgerHandler).toBeTypeOf('function')
    nestedEvents.find(event => event.name === 'render-process-gone')?.handler(null, { reason: 'crashed', exitCode: 2 })
    const nestedLedgerKinds = responsivenessLedger.getLedgerEvents()
      .filter(event => event.windowId === 88)
      .map(event => event.kind)
    expect(nestedLedgerKinds).toEqual(expect.arrayContaining(['render-process-gone', 'renderer_recovery_scheduled']))
    expect(nestedEvents.find(event => event.name === 'unresponsive')?.handler).toBeTypeOf('function')
    expect(nestedEvents.find(event => event.name === 'responsive')?.handler).toBeTypeOf('function')
    expect(responsivenessLedger.getLedgerEvents().at(-1)).toMatchObject({
      kind: 'renderer_recovery_scheduled',
      windowId: 88,
      detail: { reason: 'main_process_recovery' },
    })
  })
})
