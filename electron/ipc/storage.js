const { ipcMain, app, shell } = require('electron')
const fs = require('fs').promises
const path = require('path')
const os = require('os')

var dataDir = ''
var legacyDir = ''
var writeQueues = new Map()

function isConfiguredRemoveFailure(key) {
  return Boolean(key) && process.env.SHENYI_TEST_STORAGE_REMOVE_FAILURE_KEY === key
}

function getPrimaryDataDir() {
  return path.join(os.homedir(), 'Documents', '神意助手数据')
}

function safeKey(key) {
  return key.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function enqueueWrite(key, task) {
  var prev = writeQueues.get(key) || Promise.resolve()
  var next = prev.then(task, task)
  writeQueues.set(key, next.catch(function() { /* keep chain alive */ }))
  return next
}

async function appendCorruptionLog(key, err, restored) {
  try {
    var line = '[' + new Date().toISOString() + '] key=' + key + ' restored=' + (restored ? 'yes' : 'no') + ' error=' + (err && err.message ? err.message : String(err)) + '\n'
    var logPath = path.join(dataDir, 'storage-corruption.log')
    await fs.appendFile(logPath, line, 'utf8')
    // Rotate: keep only last 50 lines to prevent unbounded growth and stale re-reporting
    try {
      var raw = await fs.readFile(logPath, 'utf8')
      var lines = raw.split('\n').filter(function(l) { return l.trim() })
      if (lines.length > 50) {
        await fs.writeFile(logPath, lines.slice(-50).join('\n') + '\n', 'utf8')
      }
    } catch (rotateErr) { /* rotation must never break logging */ }
  } catch (e) { /* logging must never break read/write */ }
}

async function readJsonOrNull(filePath) {
  var raw = null
  try {
    raw = await fs.readFile(filePath, 'utf8')
  } catch (readErr) {
    return { missing: true, value: null }
  }
  try {
    return { missing: false, value: JSON.parse(raw) }
  } catch (parseErr) {
    return { missing: false, value: null, parseError: parseErr }
  }
}

// atomicWriteJson crashes between "json -> bak" and "tmp -> json" leave a
// state where the primary file is absent but the last committed value is in
// .bak. Recovery-time reads must use it instead of reporting a missing key.
async function recoverBakIfPrimaryMissing(filePath) {
  try {
    await fs.access(filePath)
    return false
  } catch (missingPrimary) {
    var bak = await readJsonOrNull(filePath + '.bak')
    if (bak.missing || bak.value === null) return false
    await fs.rename(filePath + '.bak', filePath)
    return true
  }
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
            // Validate JSON before copying to avoid migrating corrupt files
            try {
              var rawContent = await fs.readFile(src, 'utf8')
              JSON.parse(rawContent)
              await fs.writeFile(dst, rawContent, 'utf8')
              copied++
            } catch (validateErr) { /* skip corrupt file */ }
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

async function atomicWriteJson(key, data) {
  var tmpPath = null
  try {
    await migrateOldDataIfNeeded()
    var filePath = path.join(dataDir, safeKey(key) + '.json')
    var bakPath = filePath + '.bak'
    tmpPath = filePath + '.' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.tmp'
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
    throw e
  }
}

function registerStorageHandlers(targetIpc) {
  var ipc = targetIpc || ipcMain
  ipc.handle('storage:read', async function(event, key) {
    try {
      await migrateOldDataIfNeeded()
      var filePath = path.join(dataDir, safeKey(key) + '.json')
      var recoveredFromMissingPrimary = await recoverBakIfPrimaryMissing(filePath)
      var primary = await readJsonOrNull(filePath)
      if (!primary.missing && primary.value === null) {
        var bak = await readJsonOrNull(filePath + '.bak')
        var restoredValue = bak.missing ? null : bak.value
        var restored = restoredValue !== null
        if (restored) {
          await fs.rename(filePath + '.bak', filePath)
        }
        await appendCorruptionLog(key, primary.parseError, restored)
        return restoredValue
      }
      if (!primary.missing || recoveredFromMissingPrimary) return primary.value
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

  ipc.handle('storage:write', async function(event, key, data) {
    return enqueueWrite(key, async function() {
      try {
        await atomicWriteJson(key, data)
        return true
      } catch (e) {
        return false
      }
    })
  })

  ipc.handle('storage:corruptionLog', async function() {
    try {
      var raw = await fs.readFile(path.join(dataDir, 'storage-corruption.log'), 'utf8')
      var lines = raw.split('\n').filter(function(l) { return l.trim() })
      return { hasEntries: lines.length > 0, entries: lines.slice(-50) }
    } catch (e) {
      return { hasEntries: false, entries: [] }
    }
  })

  ipc.handle('storage:remove', async function(event, key) {
    try {
      if (isConfiguredRemoveFailure(key)) {
        return false
      }
      await migrateOldDataIfNeeded()
      var filePath = path.join(dataDir, safeKey(key) + '.json')
      try { await fs.unlink(filePath) } catch(e) { /* not found */ }
      try { await fs.unlink(filePath + '.bak') } catch(e) { /* not found */ }
      if (legacyDir) {
        var legacyPath = path.join(legacyDir, safeKey(key) + '.json')
        try { await fs.unlink(legacyPath) } catch(e) { /* not found */ }
      }
      return true
    } catch (e) {
      return false
    }
  })

  ipc.handle('storage:list', async function(event) {
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

  ipc.handle('storage:export', async function(event, exportPath) {
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

  ipc.handle('storage:import', async function(event, importPath) {
    try {
      await migrateOldDataIfNeeded()
      var content = await fs.readFile(importPath, 'utf8')
      var data = JSON.parse(content)
      for (var key of Object.keys(data)) {
        await enqueueWrite(key, function() {
          return atomicWriteJson(key, data[key])
        })
      }
      return true
    } catch (e) {
      return false
    }
  })

  ipc.handle('storage:getDataDir', async function(event) {
    await migrateOldDataIfNeeded()
    return dataDir
  })

  ipc.handle('storage:openDataDir', async function(event) {
    return await openDataDir()
  })
}

module.exports = { registerStorageHandlers, setDataDir, getDataDir, setLegacyDir }
