// Bounded main-process ledger for renderer responsiveness events.
const MAX_EVENTS = 500

const events = []
const subscribers = new Set()
const registeredWindows = new Set()
const windowSubscribers = new Map()
const scheduledRendererRecoveries = new Set()
let ipcHandlersRegistered = false

function notifySubscribers() {
  // Electron reports "send to a disposed frame" through webContents.error,
  // not through a JS exception. Keep recording and notification on separate
  // turns so a dying renderer can never prevent ledger persistence.
  process.nextTick(function() {
    for (const send of Array.from(subscribers)) {
      try {
        send('app:responsivenessEvent')
      } catch (_error) {
        subscribers.delete(send)
      }
    }
  })
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
    scheduleRendererRecovery(win, windowId)
  })
}

function scheduleRendererRecovery(win, windowId) {
  // A crashed renderer cannot drive its own recovery. The main process owns
  // the BrowserWindow and reloads the same surface instead of inventing a
  // second ownership protocol.
  function logRecovery(stage, extra) {
    var detail = extra ? ' ' + extra : ''
    console.log('[RESPONSIVENESS] recovery browserWindowId=' + win.id + ' windowId=' + windowId + ' stage=' + stage + detail)
  }
  const recoveryKey = win.id
  if (scheduledRendererRecoveries.has(recoveryKey)) return
  scheduledRendererRecoveries.add(recoveryKey)
  logRecovery('scheduled')
  record({ kind: 'renderer_recovery_scheduled', windowId, detail: { reason: 'main_process_recovery' } })
  setTimeout(function() {
    scheduledRendererRecoveries.delete(recoveryKey)
    if (!win || win.isDestroyed() || !win.webContents) {
      logRecovery('skipped', 'window_destroyed')
      record({ kind: 'renderer_recovery_skipped', windowId, detail: { reason: 'window_destroyed' } })
      return
    }
    try {
      const indexFile = require('path').join(__dirname, '..', '..', 'dist-renderer', 'index.html')
      const url = require('url').pathToFileURL(indexFile).href
      logRecovery('loading', 'target=' + indexFile)
      const load = win.webContents.loadFile
        ? win.webContents.loadFile(indexFile)
        : win.webContents.loadURL(url)
      if (load && typeof load.then === 'function') {
        load.then(function() {
          logRecovery('reloaded')
          record({ kind: 'renderer_recovery_reloaded', windowId, detail: { reason: 'main_process_recovery' } })
        }, function(error) {
          logRecovery('failed', 'error=' + String(error && error.message || error))
          record({ kind: 'renderer_recovery_failed', windowId, detail: { reason: String(error && error.message || error) } })
        })
      } else {
        logRecovery('reloaded')
        record({ kind: 'renderer_recovery_reloaded', windowId, detail: { reason: 'main_process_recovery' } })
      }
    } catch (error) {
      logRecovery('failed', 'error=' + String(error && error.message || error))
      record({ kind: 'renderer_recovery_failed', windowId, detail: { reason: String(error && error.message || error) } })
    }
  }, 5_000)
}

function subscribeWindow(win, send) {
  const entry = { send }
  windowSubscribers.set(win.id, entry)
  subscribers.add(entry.send)
  if (typeof win.once === 'function') {
    win.once('closed', function() {
      subscribers.delete(entry.send)
      windowSubscribers.delete(win.id)
    })
  }
}

function registerResponsivenessHandlers(ipcMain, win) {
  if (!win || !win.webContents) return
  const windowId = win.id
  const registration = { win, windowId }
  registeredWindows.add(registration)
  if (!ipcHandlersRegistered) {
    ipcHandlersRegistered = true
    // The ledger is a main-process global: every registered window can read it.
    ipcMain.handle('responsiveness:ledger', function() {
      return { ok: true, events: events.slice() }
    })
    ipcMain.handle('responsiveness:report', function(event, payload) {
      const owner = Array.from(registeredWindows).find(function(item) {
        return !item.win.isDestroyed() && item.win.webContents === event.sender
      })
      if (!owner) return { ok: false, reason: 'wrong_window' }
      if (!payload || typeof payload !== 'object') return { ok: false, reason: 'invalid_payload' }
      record({
        kind: String(payload.kind || 'renderer_report'),
        windowId: owner.windowId,
        detail: payload.detail || null,
      })
      return { ok: true }
    })
  }
  subscribeWindow(win, function(channel) {
    if (win.isDestroyed()) return
    const contents = win.webContents
    if (!contents || (typeof contents.isDestroyed === 'function' && contents.isDestroyed())) return
    win.webContents.send(channel, { kind: 'ledger-updated' })
  })
}

function registerResponsivenessTestHandlers(ipcMain, win) {
  if (!win || !win.webContents) return
  const sender = win.webContents
    ipcMain.handle('responsiveness:testControl', function(event, payload) {
      if (!payload || typeof payload !== 'object') return { ok: false, reason: 'invalid_payload' }
      if (event.sender !== sender && payload.action !== 'reload') return { ok: false, reason: 'wrong_window' }
      if (event.sender !== sender) {
        var owner = Array.from(registeredWindows).find(function(item) {
          return item.win && !item.win.isDestroyed() && item.win.webContents === sender
        })
        if (!owner) return { ok: false, reason: 'wrong_window' }
      }
    if (payload.action === 'block') {
      const durationMs = Math.min(Math.max(Number(payload.durationMs) || 20_000, 1_000), 60_000)
      win.webContents
        .executeJavaScript(`(function(){var until=performance.now()+${durationMs};while(performance.now()<until){}})()`, false)
        .catch(function() {})
      return { ok: true, action: 'block', durationMs }
    }
    if (payload.action === 'crash') {
      win.webContents.forcefullyCrashRenderer()
      return { ok: true, action: 'crash' }
    }
    if (payload.action === 'reload') {
      win.webContents.reloadIgnoringCache()
      return { ok: true, action: 'reload' }
    }
    return { ok: false, reason: 'unknown_action' }
  })
}

function getLedgerEvents() {
  return events.slice()
}

function resetResponsivenessLedgerForTests() {
  events.length = 0
  subscribers.clear()
  registeredWindows.clear()
  windowSubscribers.clear()
  ipcHandlersRegistered = false
  scheduledRendererRecoveries.clear()
}

module.exports = {
  attachWindowResponsivenessListeners,
  registerResponsivenessHandlers,
  registerResponsivenessTestHandlers,
  record,
  getLedgerEvents,
  resetResponsivenessLedgerForTests,
}
