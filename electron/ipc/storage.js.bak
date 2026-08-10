const { ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')

var dataDir = ''

function setDataDir(dir) {
  dataDir = dir
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
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
      } else {
        event.returnValue = null
      }
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

module.exports = { registerStorageHandlers, setDataDir, getDataDir }
