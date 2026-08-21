const { ipcMain, app, dialog } = require('electron')
const fs = require('fs')
const path = require('path')

var logDir = ''

function setLogDir(dir) {
  logDir = dir
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }
}

// Parse electron-log text line: [{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}
function _parseLogLine(line) {
  var m = line.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\] \[(\w+)\] (.*)$/)
  if (!m) return null
  return { ts: m[1], level: m[2].toLowerCase(), msg: m[3], cat: 'general' }
}

function _readElectronLog() {
  var logFile = path.join(logDir, 'main.log')
  if (!fs.existsSync(logFile)) return []
  var content = fs.readFileSync(logFile, 'utf8')
  var lines = content.split('\n').filter(function(l) { return l.trim().length > 0 })
  var entries = []
  for (var i = 0; i < lines.length; i++) {
    var e = _parseLogLine(lines[i])
    if (e) entries.push(e)
  }
  return entries
}

function _readOldFormatLogs() {
  var entries = []
  try {
    var files = fs.readdirSync(logDir).filter(function(f) { return f.endsWith('.json') || f.endsWith('.jsonl') })
    files.forEach(function(f) {
      var content = fs.readFileSync(path.join(logDir, f), 'utf8')
      var lines = content.split('\n').filter(function(l) { return l.trim().length > 0 })
      lines.forEach(function(l) {
        try { entries.push(JSON.parse(l)) } catch(e) {}
      })
    })
  } catch(e) {}
  return entries
}

function _buildMeta() {
  var meta = {
    appVersion: '',
    os: process.platform + '-' + process.arch,
    electronVersion: process.versions.electron || '',
    nodeVersion: process.versions.node || '',
    exportTime: new Date().toISOString(),
    providers: [],
    errorCount: 0,
    warnCount: 0
  }
  try { meta.appVersion = app.getVersion() } catch(e) {}
  try {
    var userData = app.getPath('userData')
    var storageFile = path.join(userData, 'storage.json')
    if (fs.existsSync(storageFile)) {
      var raw = fs.readFileSync(storageFile, 'utf8')
      var storage = JSON.parse(raw)
      if (storage.providers) {
        meta.providers = storage.providers.map(function(p) {
          return { name: p.name || 'unknown', purpose: p.purpose || 'generate', model: p.model || '', active: !!p.active }
        })
      }
    }
  } catch(e) {}
  return meta
}

function registerDiagHandlers() {
  // diag:refresh: re-read logs from file and return to renderer
  ipcMain.handle('diag:refresh', async function() {
    try {
      var entries = _readElectronLog()
      var oldEntries = _readOldFormatLogs()
      return oldEntries.concat(entries)
    } catch (e) {
      return []
    }
  })

  // diag:write: renderer forwards logs to main for file persistence
  ipcMain.on('diag:write', function(event, entries) {
    try {
      if (!entries || !Array.isArray(entries) || entries.length === 0) { event.returnValue = false; return; }
      var today = new Date().toISOString().slice(0, 10)
      var logFile = path.join(logDir, 'renderer-' + today + '.jsonl')
      var lines = entries.map(function(e) { return JSON.stringify(e) }).join('\n') + '\n'
      fs.appendFileSync(logFile, lines, 'utf8')
      event.returnValue = true
    } catch(e) {
      event.returnValue = false
    }
  })

  ipcMain.handle('diag:read', async function(event, dateStr) {
    try {
      var entries = _readElectronLog()
      var oldEntries = _readOldFormatLogs()
      var all = oldEntries.concat(entries)
      if (dateStr) {
        all = all.filter(function(e) { return (e.ts || '').indexOf(dateStr) === 0 })
      }
      return all
    } catch (e) {
      return []
    }
  })

  ipcMain.handle('diag:export', async function(event, options) {
    try {
      var entries = _readElectronLog()
      var oldEntries = _readOldFormatLogs()
      var all = oldEntries.concat(entries)

      if (options && options.level) {
        all = all.filter(function(e) { return e.level === options.level })
      }
      if (options && options.startDate) {
        all = all.filter(function(e) { return (e.ts || '') >= options.startDate })
      }
      if (options && options.endDate) {
        all = all.filter(function(e) { return (e.ts || '') <= options.endDate })
      }

      var meta = _buildMeta()
      all.forEach(function(e) {
        if (e.level === 'error') meta.errorCount++
        if (e.level === 'warn') meta.warnCount++
      })

      var exportData = { meta: meta, logs: all }
      var jsonStr = JSON.stringify(exportData, null, 2)

      var defaultName = 'diag-log-' + new Date().toISOString().slice(0, 10) + '.json'
      var result = await dialog.showSaveDialog({
        defaultPath: defaultName,
        filters: [{ name: 'JSON', extensions: ['json'] }, { name: 'All Files', extensions: ['*'] }]
      })
      if (result.canceled || !result.filePath) return { success: false, reason: 'canceled' }
      fs.writeFileSync(result.filePath, jsonStr, 'utf8')
      return { success: true, path: result.filePath, count: all.length }
    } catch (e) {
      return { success: false, reason: e.message }
    }
  })

  ipcMain.handle('diag:clear', async function(event) {
    try {
      var files = fs.readdirSync(logDir)
      files.forEach(function(f) {
        if (f.endsWith('.json') || f.endsWith('.log') || f.endsWith('.jsonl')) fs.unlinkSync(path.join(logDir, f))
      })
      return true
    } catch (e) {
      return false
    }
  })
}

module.exports = { registerDiagHandlers, setLogDir }
