const { ipcMain, app, shell } = require('electron')
const fs = require('fs')
const path = require('path')
const os = require('os')

var dataDir = ''
var legacyDir = ''

function getPrimaryDataDir() {
  return path.join(os.homedir(), 'Documents', '神意助手数据')
}

function safeKey(key) {
  return key.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function migrateOldDataIfNeeded() {
  try {
    var targetDir = getPrimaryDataDir()
    var markerFile = path.join(targetDir, '.migrated')
    if (fs.existsSync(markerFile)) return
    var candidateDirs = [
      path.join(app.getPath('userData'), 'data'),
      path.join(app.getPath('documents'), '写作助手数据')
    ]
    var copied = 0
    candidateDirs.forEach(function(oldDir) {
      if (!fs.existsSync(oldDir)) return
      var files = fs.readdirSync(oldDir)
      files.forEach(function(f) {
        if (!f.endsWith('.json')) return
        var src = path.join(oldDir, f)
        var dst = path.join(targetDir, f)
        if (!fs.existsSync(dst)) {
          fs.copyFileSync(src, dst)
          copied++
        }
      })
    })
    fs.writeFileSync(markerFile, 'migrated-' + copied + '-' + new Date().toISOString(), 'utf8')
  } catch (e) {}
}

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

function openDataDir() {
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
    shell.openPath(dataDir)
    return true
  } catch (e) {
    return false
  }
}

function registerStorageHandlers() {
  ipcMain.on('storage:read', function(event, key) {
    try {
      migrateOldDataIfNeeded()
      var filePath = path.join(dataDir, safeKey(key) + '.json')
      if (fs.existsSync(filePath)) {
        var content = fs.readFileSync(filePath, 'utf8')
        event.returnValue = JSON.parse(content)
        return
      }
      if (legacyDir) {
        var legacyPath = path.join(legacyDir, safeKey(key) + '.json')
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
      migrateOldDataIfNeeded()
      var filePath = path.join(dataDir, safeKey(key) + '.json')
      fs.writeFileSync(filePath, JSON.stringify(data), 'utf8')
      event.returnValue = true
    } catch (e) {
      event.returnValue = false
    }
  })

  ipcMain.on('storage:remove', function(event, key) {
    try {
      migrateOldDataIfNeeded()
      var filePath = path.join(dataDir, safeKey(key) + '.json')
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      event.returnValue = true
    } catch (e) {
      event.returnValue = false
    }
  })

  ipcMain.on('storage:list', function(event) {
    try {
      migrateOldDataIfNeeded()
      var files = fs.readdirSync(dataDir)
      var keys = files.filter(function(f) { return f.endsWith('.json') }).map(function(f) { return f.replace(/\.json$/, '') })
      if (legacyDir && fs.existsSync(legacyDir)) {
        var legacyFiles = fs.readdirSync(legacyDir)
        legacyFiles.filter(function(f) { return f.endsWith('.json') }).forEach(function(f) {
          var lk = f.replace(/\.json$/, '')
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
      migrateOldDataIfNeeded()
      var files = fs.readdirSync(dataDir)
      var data = {}
      files.forEach(function(f) {
        if (f.endsWith('.json')) {
          var key = f.replace(/\.json$/, '')
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
      migrateOldDataIfNeeded()
      var content = fs.readFileSync(importPath, 'utf8')
      var data = JSON.parse(content)
      Object.keys(data).forEach(function(key) {
        fs.writeFileSync(path.join(dataDir, safeKey(key) + '.json'), JSON.stringify(data[key]), 'utf8')
      })
      event.returnValue = true
    } catch (e) {
      event.returnValue = false
    }
  })

  ipcMain.on('storage:getDataDir', function(event) {
    migrateOldDataIfNeeded()
    event.returnValue = dataDir
  })

  ipcMain.on('storage:openDataDir', function(event) {
    event.returnValue = openDataDir()
  })
}

module.exports = { registerStorageHandlers, setDataDir, getDataDir, setLegacyDir }
