const { ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')

var logDir = ''

function setLogDir(dir) {
  logDir = dir
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }
}

function registerDiagHandlers() {
  ipcMain.on('diag:write', function(event, batch) {
    try {
      var today = new Date().toISOString().slice(0, 10)
      var logFile = path.join(logDir, today + '.json')
      var lines = batch.map(function(e) { return JSON.stringify(e) }).join('\n') + '\n'
      fs.appendFileSync(logFile, lines, 'utf8')
      event.returnValue = true
    } catch (e) {
      event.returnValue = false
    }
  })

  ipcMain.on('diag:read', function(event, dateStr) {
    try {
      var target = dateStr || new Date().toISOString().slice(0, 10)
      var logFile = path.join(logDir, target + '.json')
      if (fs.existsSync(logFile)) {
        var content = fs.readFileSync(logFile, 'utf8')
        var lines = content.split('\n').filter(function(l) { return l.trim().length > 0 })
        event.returnValue = lines.map(function(l) { return JSON.parse(l) })
      } else {
        event.returnValue = []
      }
    } catch (e) {
      event.returnValue = []
    }
  })

  ipcMain.on('diag:export', function(event) {
    try {
      var files = fs.readdirSync(logDir).filter(function(f) { return f.endsWith('.json') })
      var allData = []
      files.forEach(function(f) {
        var content = fs.readFileSync(path.join(logDir, f), 'utf8')
        var lines = content.split('\n').filter(function(l) { return l.trim().length > 0 })
        lines.forEach(function(l) { allData.push(JSON.parse(l)) })
      })
      event.returnValue = JSON.stringify(allData, null, 2)
    } catch (e) {
      event.returnValue = '[]'
    }
  })

  ipcMain.on('diag:clear', function(event) {
    try {
      var files = fs.readdirSync(logDir)
      files.forEach(function(f) {
        if (f.endsWith('.json')) fs.unlinkSync(path.join(logDir, f))
      })
      event.returnValue = true
    } catch (e) {
      event.returnValue = false
    }
  })
}

module.exports = { registerDiagHandlers, setLogDir }
