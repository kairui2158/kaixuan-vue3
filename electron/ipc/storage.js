const { ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')

var dataDir = ''

var legacyDir = ''

function setDataDir(dir) {
  dataDir = dir
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
}

function setLegacyDir(dir) {
  legacyDir = dir
}

function getDataDir() {
  return dataDir
}

function registerStorageHandlers() {
  ipcMain.on('storage:read', function(event, key) {
    try {
      var filePath = path.join(dataDir, key + '.json')
      if (fs.existsSync(filePath)) {
        var content = fs.readFileSync(filePath, 'utf8')
        event.returnValue = JSON.parse(content)
        return
      }
      // Fallback to legacy format (wa_ prefix, raw string)
      if (legacyDir) {
        var safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_')
        var legacyPath = path.join(legacyDir, 'wa_' + safeKey + '.json')
        if (fs.existsSync(legacyPath)) {
          var legacyContent = fs.readFileSync(legacyPath, 'utf8')
          event.returnValue = JSON.parse(legacyContent)
          return
        }
      }
      event.returnValue = null
    } catch (e) {
      event.returnValue = null
    }
  })

  ipcMain.on('storage:write', function(event, key, data) {
    try {
      var filePath = path.join(dataDir, key + '.json')
      fs.writeFileSync(filePath, JSON.stringify(data), 'utf8')
      event.returnValue = true
    } catch (e) {
      event.returnValue = false
    }
  })

  ipcMain.on('storage:remove', function(event, key) {
    try {
      var filePath = path.join(dataDir, key + '.json')
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      event.returnValue = true
    } catch (e) {
      event.returnValue = false
    }
  })

  ipcMain.on('storage:list', function(event) {
    try {
      var files = fs.readdirSync(dataDir)
      var keys = files.filter(function(f) { return f.endsWith('.json') }).map(function(f) { return f.replace('.json', '') })
      // Also include legacy keys (strip wa_ prefix)
      if (legacyDir && fs.existsSync(legacyDir)) {
        var legacyFiles = fs.readdirSync(legacyDir)
        legacyFiles.filter(function(f) { return f.startsWith('wa_') && f.endsWith('.json') }).forEach(function(f) {
          var lk = f.replace('wa_', '').replace('.json', '')
          if (keys.indexOf(lk) === -1) keys.push(lk)
        })
      }
      event.returnValue = keys
    } catch (e) {
      event.returnValue = []
    }
  })

  ipcMain.on('storage:export', function(event, exportPath) {
    try {
      var files = fs.readdirSync(dataDir)
      var data = {}
      files.forEach(function(f) {
        if (f.endsWith('.json')) {
          var key = f.replace('.json', '')
          data[key] = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'))
        }
      })
      fs.writeFileSync(exportPath, JSON.stringify(data, null, 2), 'utf8')
      event.returnValue = true
    } catch (e) {
      event.returnValue = false
    }
  })

  ipcMain.on('storage:import', function(event, importPath) {
    try {
      var content = fs.readFileSync(importPath, 'utf8')
      var data = JSON.parse(content)
      Object.keys(data).forEach(function(key) {
        fs.writeFileSync(path.join(dataDir, key + '.json'), JSON.stringify(data[key]), 'utf8')
      })
      event.returnValue = true
    } catch (e) {
      event.returnValue = false
    }
  })

  ipcMain.on('storage:getDataDir', function(event) {
    event.returnValue = dataDir
  })
}

module.exports = { registerStorageHandlers, setDataDir, getDataDir, setLegacyDir }
