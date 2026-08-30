const { ipcMain, app, shell } = require('electron')
const fs = require('fs').promises
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

async function appendCorruptionLog(key, err, restored) {
  try {
    var line = '[' + new Date().toISOString() + '] key=' + key + ' restored=' + (restored ? 'yes' : 'no') + ' error=' + (err && err.message ? err.message : String(err)) + '\n'
    await fs.appendFile(path.join(dataDir, 'storage-corruption.log'), line, 'utf8')
  } catch (e) { /* logging must never break read/write */ }
}

async function migrateOldDataIfNeeded() {
  try {
    var targetDir = getPrimaryDataDir()
    var markerFile = path.join(targetDir, '.migrated')
    try { await fs.access(markerFile); return } catch(e) { /* marker not found */ }
    var candidateDirs = [
      path.join(app.getPath('userData'), 'data'),
      path.join(app.getPath('documents'), '写作助手数据')
    ]
    var copied = 0
    for (var oldDir of candidateDirs) {
      try {
        await fs.access(oldDir)
        var files = await fs.readdir(oldDir)
        for (var f of files) {
          if (!f.endsWith('.json')) continue
          var src = path.join(oldDir, f)
          var dst = path.join(targetDir, f)
          try { await fs.access(dst) } catch(e) {
            await fs.copyFile(src, dst)
            copied++
          }
        }
      } catch(e) { /* dir not accessible */ }
    }
    await fs.writeFile(markerFile, 'migrated-' + copied + '-' + new Date().toISOString(), 'utf8')
  } catch (e) {}
}

function setDataDir(dir) {
  dataDir = dir
  try {
    fs.mkdir(dataDir, { recursive: true })
  } catch(e) {
    const fsSync = require('fs')
    if (!fsSync.existsSync(dataDir)) fsSync.mkdirSync(dataDir, { recursive: true })
  }
}

function setLegacyDir(dir) {
  legacyDir = dir
}

function getDataDir() {
  return dataDir
}

async function openDataDir() {
  try {
    try { await fs.access(dataDir) } catch(e) { await fs.mkdir(dataDir, { recursive: true }) }
    await shell.openPath(dataDir)
    return true
  } catch (e) {
    return false
  }
}

function registerStorageHandlers() {
  ipcMain.handle('storage:read', async function(event, key) {
    try {
      await migrateOldDataIfNeeded()
      var filePath = path.join(dataDir, safeKey(key) + '.json')
      var raw = null
      try {
        await fs.access(filePath)
        raw = await fs.readFile(filePath, 'utf8')
      } catch(e) { /* not found */ }
      if (raw !== null) {
        try {
          return JSON.parse(raw)
        } catch (parseErr) {
          var restoredValue = null
          var restored = false
          try {
            var bakRaw = await fs.readFile(filePath + '.bak', 'utf8')
            restoredValue = JSON.parse(bakRaw)
            await fs.rename(filePath + '.bak', filePath)
            restored = true
          } catch (bakErr) { restored = false }
          await appendCorruptionLog(key, parseErr, restored)
          return restored ? restoredValue : null
        }
      }
      if (legacyDir) {
        var legacyPath = path.join(legacyDir, safeKey(key) + '.json')
        try {
          await fs.access(legacyPath)
          var legacyContent = await fs.readFile(legacyPath, 'utf8')
          return JSON.parse(legacyContent)
        } catch(e) { /* not found */ }
      }
      return null
    } catch (e) {
      return null
    }
  })

  ipcMain.handle('storage:write', async function(event, key, data) {
    var tmpPath = null
    try {
      await migrateOldDataIfNeeded()
      var filePath = path.join(dataDir, safeKey(key) + '.json')
      var bakPath = filePath + '.bak'
      tmpPath = filePath + '.tmp'
      await fs.writeFile(tmpPath, JSON.stringify(data), 'utf8')
      try {
        await fs.access(filePath)
        await fs.rename(filePath, bakPath)
      } catch (e) { /* target absent, nothing to back up */ }
      try {
        await fs.rename(tmpPath, filePath)
      } catch (renameErr) {
        try { await fs.access(bakPath); await fs.rename(bakPath, filePath) } catch (e2) { /* nothing to restore */ }
        throw renameErr
      }
      return true
    } catch (e) {
      if (tmpPath) { try { await fs.unlink(tmpPath) } catch (e2) { /* ignore */ } }
      return false
    }
  })

  ipcMain.handle('storage:corruptionLog', async function() {
    try {
      var raw = await fs.readFile(path.join(dataDir, 'storage-corruption.log'), 'utf8')
      var lines = raw.split('\n').filter(function(l) { return l.trim() })
      return { hasEntries: lines.length > 0, entries: lines.slice(-50) }
    } catch (e) {
      return { hasEntries: false, entries: [] }
    }
  })

  ipcMain.handle('storage:remove', async function(event, key) {
    try {
      await migrateOldDataIfNeeded()
      var filePath = path.join(dataDir, safeKey(key) + '.json')
      try { await fs.unlink(filePath) } catch(e) { /* not found */ }
      if (legacyDir) {
        var legacyPath = path.join(legacyDir, safeKey(key) + '.json')
        try { await fs.unlink(legacyPath) } catch(e) { /* not found */ }
      }
      return true
    } catch (e) {
      return false
    }
  })

  ipcMain.handle('storage:list', async function(event) {
    try {
      await migrateOldDataIfNeeded()
      var files = await fs.readdir(dataDir)
      var keys = files.filter(function(f) { return f.endsWith('.json') }).map(function(f) { return f.replace(/\.json$/, '') })
      if (legacyDir) {
        try {
          var legacyFiles = await fs.readdir(legacyDir)
          legacyFiles.filter(function(f) { return f.endsWith('.json') }).forEach(function(f) {
            var lk = f.replace(/\.json$/, '')
            if (keys.indexOf(lk) === -1) keys.push(lk)
          })
        } catch(e) { /* legacy dir not accessible */ }
      }
      return keys
    } catch (e) {
      return []
    }
  })

  ipcMain.handle('storage:export', async function(event, exportPath) {
    try {
      await migrateOldDataIfNeeded()
      var files = await fs.readdir(dataDir)
      var data = {}
      for (var f of files) {
        if (!f.endsWith('.json')) continue
        var key = f.replace(/\.json$/, '')
        data[key] = JSON.parse(await fs.readFile(path.join(dataDir, f), 'utf8'))
      }
      await fs.writeFile(exportPath, JSON.stringify(data, null, 2), 'utf8')
      return true
    } catch (e) {
      return false
    }
  })

  ipcMain.handle('storage:import', async function(event, importPath) {
    try {
      await migrateOldDataIfNeeded()
      var content = await fs.readFile(importPath, 'utf8')
      var data = JSON.parse(content)
      for (var key of Object.keys(data)) {
        await fs.writeFile(path.join(dataDir, safeKey(key) + '.json'), JSON.stringify(data[key]), 'utf8')
      }
      return true
    } catch (e) {
      return false
    }
  })

  ipcMain.handle('storage:getDataDir', async function(event) {
    await migrateOldDataIfNeeded()
    return dataDir
  })

  ipcMain.handle('storage:openDataDir', async function(event) {
    return await openDataDir()
  })
}

module.exports = { registerStorageHandlers, setDataDir, getDataDir, setLegacyDir }
