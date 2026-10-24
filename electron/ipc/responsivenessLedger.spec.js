import { describe, expect, it, vi } from 'vitest'
import * as responsivenessLedger from './responsivenessLedger.js'

const listeners = new Map()
const ipcMain = {
  handle: vi.fn((channel, handler) => listeners.set(channel, handler)),
}
const send = vi.fn()

describe('responsiveness ledger', () => {
  it('records window events in a bounded ledger and notifies the renderer', () => {
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
    expect(ledger.map(event => event.kind)).toEqual(['unresponsive', 'responsive', 'render-process-gone'])
    expect(ledger[2]).toMatchObject({ windowId: 7, detail: { reason: 'crashed', exitCode: 11 } })
    expect(send).toHaveBeenCalledWith('app:responsivenessEvent', { kind: 'ledger-updated' })
  })

  it('rejects reports from another window', async () => {
    const { registerResponsivenessHandlers } = responsivenessLedger
    const sender = { send }
    registerResponsivenessHandlers(ipcMain, { isDestroyed: () => false, webContents: sender })

    const reportHandler = listeners.get('responsiveness:report')
    const result = await reportHandler({ sender: {} }, { kind: 'renderer_safe_mode' })
    expect(result).toEqual({ ok: false, reason: 'wrong_window' })
  })
})
