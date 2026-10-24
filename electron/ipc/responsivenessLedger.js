// Bounded main-process ledger for renderer responsiveness events.
const MAX_EVENTS = 500

const events = []
const subscribers = new Set()

function notifySubscribers() {
  for (const send of subscribers) {
    try {
      send('app:responsivenessEvent')
    } catch (_error) {
      // The window may already be destroyed during renderer-process-gone.
    }
  }
}

function record(event) {
  const entry = {
    at: Date.now(),
    kind: event.kind,
    windowId: event.windowId || null,
    detail: event.detail || null,
  }
  events.push(entry)
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS)
  notifySubscribers()
  return entry
}

function attachWindowResponsivenessListeners(win, windowId) {
  if (!win || !win.webContents) return
  win.webContents.on('unresponsive', function() {
    record({ kind: 'unresponsive', windowId, detail: { reason: 'renderer_unresponsive' } })
  })
  win.webContents.on('responsive', function() {
    record({ kind: 'responsive', windowId, detail: { reason: 'renderer_responsive' } })
  })
  win.webContents.on('render-process-gone', function(_event, details) {
    record({
      kind: 'render-process-gone',
      windowId,
      detail: { reason: details && details.reason, exitCode: details && details.exitCode },
    })
  })
}

function registerResponsivenessHandlers(ipcMain, win) {
  if (!win || !win.webContents) return
  const sender = win.webContents
  const ownerWindowId = win.id
  ipcMain.handle('responsiveness:ledger', function(event) {
    if (event.sender !== sender) return { ok: false, reason: 'wrong_window' }
    return { ok: true, events: events.slice() }
  })
  ipcMain.handle('responsiveness:report', function(event, payload) {
    if (event.sender !== sender) return { ok: false, reason: 'wrong_window' }
    if (!payload || typeof payload !== 'object') return { ok: false, reason: 'invalid_payload' }
    record({
      kind: String(payload.kind || 'renderer_report'),
      windowId: ownerWindowId,
      detail: payload.detail || null,
    })
    return { ok: true }
  })
  subscribers.add(function(channel) {
    if (!win.isDestroyed()) win.webContents.send(channel, { kind: 'ledger-updated' })
  })
}

function getLedgerEvents() {
  return events.slice()
}

module.exports = {
  attachWindowResponsivenessListeners,
  registerResponsivenessHandlers,
  record,
  getLedgerEvents,
}
