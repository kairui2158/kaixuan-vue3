const { ipcMain, dialog } = require('electron')
const fs = require('fs')
const path = require('path')

let dataDir = ''

function setDataDir(dir) {
  dataDir = dir || ''
}

function maskSensitive(value) {
  if (typeof value === 'string') {
    return value
      .replace(/(Authorization\s*[:=]\s*Bearer\s+)[^\s"'，。]+/gi, '$1***MASKED***')
      .replace(/(api[_-]?key\s*[:=]\s*)[^\s"'，。]+/gi, '$1***MASKED***')
      .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '***MASKED***')
  }
  if (Array.isArray(value)) return value.map(maskSensitive)
  if (value && typeof value === 'object') {
    var output = {}
    Object.keys(value).forEach(function(key) {
      output[key] = maskSensitive(value[key])
    })
    return output
  }
  return value
}

function safeStepName(name) {
  var text = String(name || 'run')
  return text.replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 24) || 'run'
}

function formatTimestamp(ts) {
  var d = ts ? new Date(ts) : new Date()
  if (isNaN(d.getTime())) d = new Date()
  var pad = function(n) { return String(n).padStart(2, '0') }
  return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds())
}

function registerRunTraceHandlers() {
  ipcMain.handle('runTrace:export', async function(event, payload) {
    try {
      if (!payload || typeof payload !== 'object') return { success: false, reason: '无效的运行记录数据' }
      var run = payload.run || {}
      var exportData = {
        schema: payload.schema || 'shenyi.run-trace',
        version: payload.version || 1,
        exportedAt: new Date().toISOString(),
        run: maskSensitive(run)
      }

      var defaultName = 'run-trace-' + safeStepName(run.stepName) + '-' + formatTimestamp(run.startedAt) + '.json'
      var result = await dialog.showSaveDialog({
        defaultPath: defaultName,
        filters: [{ name: 'JSON', extensions: ['json'] }, { name: 'All Files', extensions: ['*'] }]
      })
      if (result.canceled || !result.filePath) return { success: false, reason: 'canceled' }

      var jsonStr = JSON.stringify(exportData, null, 2)
      await fs.promises.writeFile(result.filePath, jsonStr, 'utf8')

      if (dataDir) {
        var traceDir = path.join(dataDir, 'run-trace')
        await fs.promises.mkdir(traceDir, { recursive: true })
        await fs.promises.writeFile(path.join(traceDir, defaultName), jsonStr, 'utf8')
      }

      return { success: true, path: result.filePath, bytes: Buffer.byteLength(jsonStr, 'utf8') }
    } catch (e) {
      return { success: false, reason: e.message || String(e) }
    }
  })
}

module.exports = { registerRunTraceHandlers, setDataDir }
