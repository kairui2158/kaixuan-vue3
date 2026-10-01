const { ipcMain, dialog, shell } = require('electron')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

let dataDir = ''
const traceWriteLocks = new Map()

function setDataDir(dir) {
  dataDir = dir || ''
}

function maskSensitive(value) {
  if (typeof value === 'string') {
    return value
      .replace(/(Authorization\s*[:=]\s*Bearer\s+)[^\s"'，。]+/gi, '$1***MASKED***')
      .replace(/(Authorization\s*[:=]\s*)[^\s"'，。]+/gi, '$1***MASKED***')
      .replace(/((?:x-)?api[_-]?key\s*[:=]\s*)[^\s"'，。]+/gi, '$1***MASKED***')
      .replace(/(Cookie\s*[:=]\s*)[^\r\n]+/gi, '$1***MASKED***')
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
  if (typeof value === 'function') return undefined
  if (typeof value === 'symbol') return String(value)
  if (typeof value === 'bigint') return value.toString()
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

function traceDir(source) {
  if (!dataDir) return null
  var sourceName = ['outline', 'home', 'eval', 'infra'].indexOf(source) >= 0 ? source : 'pipeline'
  return path.join(dataDir, 'run-trace', sourceName)
}

function buildTraceFileName(run, mode) {
  var suffix = mode ? '-' + mode : ''
  if (run.sessionKind === 'chat') {
    var sourceName = ['outline', 'home', 'eval', 'infra'].indexOf(run.source) >= 0 ? run.source : 'pipeline'
    return 'run-trace-' + sourceName + '-' + formatTimestamp(run.startedAt) + suffix + '.json'
  }
  return 'run-trace-' + safeStepName(run.stepName) + '-' + formatTimestamp(run.startedAt) + suffix + '.json'
}

function buildTraceDirName(run) {
  return buildTraceFileName(run).replace(/\.json$/, '')
}

function uniqueExportDestination(filePath) {
  var destination = filePath.toLowerCase().endsWith('.json') ? filePath.slice(0, -5) : filePath
  if (!fs.existsSync(destination)) return destination
  var index = 2
  while (fs.existsSync(destination + '-' + index)) index++
  return destination + '-' + index
}

function uniqueExportFile(filePath) {
  if (!fs.existsSync(filePath)) return filePath
  var parsed = path.parse(filePath)
  var index = 2
  var destination
  do {
    destination = path.join(parsed.dir, parsed.name + '-' + index + parsed.ext)
    index++
  } while (fs.existsSync(destination))
  return destination
}

function payloadFileName(index, kind) {
  return String(index + 1).padStart(3, '0') + '-' + kind + '.json'
}

function requestMessagesPreview(messages) {
  if (!Array.isArray(messages)) return []
  return messages.map(function(message) {
    var content = String(message && message.content || '')
    return {
      role: String(message && message.role || ''),
      content: content.slice(0, 500),
      length: content.length
    }
  })
}

function requestMessagesPreviewSource(messages) {
  return (messages || []).map(function(message) {
    return {
      role: String(message && message.role || ''),
      content: String(message && message.content || '')
    }
  })
}

function responsePreview(value) {
  if (typeof value !== 'string' || !value) return ''
  return value.slice(0, 500)
}

// Exported traces may already contain the legacy inlined payload wrapper.
// Unwrap it before rebuilding payloads so re-export cannot duplicate content.
function legacyPayloadValue(value) {
  if (!value || typeof value !== 'object' || !value.__payload) return undefined
  var payload = value.__payload
  return typeof payload.value === 'string' ? payload.value : undefined
}

function normalizeLegacyPayloads(run) {
  var output = JSON.parse(JSON.stringify(run))
  ;(output.apiCalls || []).forEach(function(call) {
    var logicalResponse = legacyPayloadValue(call.responseText)
    if (logicalResponse !== undefined) {
      call.legacyPayloadKind = call.responseText && call.responseText.__payload && call.responseText.__payload.kind
      call.responseText = logicalResponse
    }
    ;(call.physicalCalls || []).forEach(function(physical) {
      var physicalResponse = legacyPayloadValue(physical.responseText)
      if (physicalResponse !== undefined) {
        physical.legacyPayloadKind = physical.responseText && physical.responseText.__payload && physical.responseText.__payload.kind
        physical.responseText = physicalResponse
      }
    })
  })
  return output
}

function payloadContent(kind, value) {
  if (kind === 'prompt' && value && typeof value === 'object') return promptIdentityContent(value)
  return value
}

function promptIdentityContent(prompt) {
  if (!prompt || typeof prompt !== 'object') return prompt
  var content = JSON.parse(JSON.stringify(prompt))
  delete content.id
  delete content.builtAt
  delete content.apiCallId
  delete content.turnId
  delete content.payloadRef
  return content
}

function collectPayloads(run) {
  var payloads = []
  var add = function(kind, value) {
    if (value === undefined || value === null || value === '') return
    payloads.push({ kind: kind, value: value })
  }
  ;(run.apiCalls || []).forEach(function(call) {
    add('request', call.requestMessages)
    add('tool-delta', call.toolRequestDeltas)
    add('response', call.responseText)
    add('stream', call.streamText)
    add('reasoning', call.reasoningText)
    ;(call.physicalCalls || []).forEach(function(physical) {
      add('request', physical.requestMessages)
      add('response', physical.responseText)
      add('stream', physical.streamText)
      add('reasoning', physical.reasoningText)
    })
    ;(call.toolCalls || []).forEach(function(tool) {
      add('tool-input', tool.input)
      add('tool-result', tool.result)
    })
  })
  ;(run.promptSnapshots || []).forEach(function(snapshot) {
    add('prompt', snapshot)
  })
  ;(run.processingReports || []).forEach(function(report) {
    add('processing-input', report.inputPreview)
    add('processing-output', report.outputPreview)
    if (report && report.output) add('processing-output', report.output)
  })
  ;(run.folderDiagnostics || []).forEach(function(item) {
    add('folder-output', item && item.output)
    if (item && item.apiMeta) add('request', item.apiMeta.requestMessages)
    if (item && item.postProcessReport && item.postProcessReport.output) {
      add('processing-output', item.postProcessReport.output)
    }
  })
  ;(run.events || []).forEach(function(event) {
    if (event && event.payload !== undefined) add('agent-event', event.payload)
  })
  return payloads
}

function payloadIdentity(kind, value) {
  var content = kind === 'prompt' ? promptIdentityContent(value) : payloadContent(kind, value)
  var text = typeof content === 'string' ? content : JSON.stringify(content, null, 2)
  if (text === undefined) text = ''
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex')
}

function deduplicatePayloads(payloads) {
  var byIdentity = new Map()
  var unique = []
  payloads.forEach(function(item) {
    var identity = item.kind + ':' + payloadIdentity(item.kind, item.value)
    var existing = byIdentity.get(identity)
    if (existing) {
      existing.duplicateCount += 1
      item.duplicateOf = existing.id
      return
    }
    item.id = 'payload-' + String(unique.length + 1).padStart(3, '0')
    item.identity = identity
    item.duplicateCount = 1
    unique.push(item)
    byIdentity.set(identity, item)
  })
  return { unique: unique, byIdentity: byIdentity }
}

function replacePayloadFields(run, byIdentity) {
  var output = JSON.parse(JSON.stringify(run))
  var resolve = function(kind, value) {
    if (value === undefined || value === null || value === '') return undefined
    var item = byIdentity.get(kind + ':' + payloadIdentity(kind, value))
    if (!item) return undefined
    return item.duplicateOf
      ? { __payload: { id: item.duplicateOf, duplicateOf: item.id } }
      : { __payload: { id: item.id } }
  }
  ;(output.apiCalls || []).forEach(function(call) {
    call.requestMessages = resolve('request', call.requestMessages)
    call.toolRequestDeltas = resolve('tool-delta', call.toolRequestDeltas)
    if (typeof call.responseText === 'string' && call.responseText) {
      var responseItem = byIdentity.get('response:' + payloadIdentity('response', call.responseText))
      call.responseTextPayloadRef = responseItem ? (responseItem.duplicateOf || responseItem.id) : undefined
      call.responseTextPreview = responsePreview(call.responseText)
      call.responseText = undefined
    }
    call.streamText = resolve('stream', call.streamText)
    call.reasoningText = resolve('reasoning', call.reasoningText)
    ;(call.physicalCalls || []).forEach(function(physical) {
      physical.requestMessages = resolve('request', physical.requestMessages)
      if (typeof physical.responseText === 'string' && physical.responseText) {
        var physicalResponseItem = byIdentity.get('response:' + payloadIdentity('response', physical.responseText))
        physical.responseTextPayloadRef = physicalResponseItem ? (physicalResponseItem.duplicateOf || physicalResponseItem.id) : undefined
        physical.responseTextPreview = responsePreview(physical.responseText)
        physical.responseText = undefined
      }
      physical.streamText = resolve('stream', physical.streamText)
      physical.reasoningText = resolve('reasoning', physical.reasoningText)
    })
    ;(call.toolCalls || []).forEach(function(tool) {
      tool.input = resolve('tool-input', tool.input)
      tool.result = resolve('tool-result', tool.result)
    })
  })
  ;(output.promptSnapshots || []).forEach(function(snapshot) {
    var item = byIdentity.get('prompt:' + payloadIdentity('prompt', snapshot))
    if (item) snapshot.payloadRef = item.duplicateOf || item.id
    snapshot.systemPrompt = undefined
    snapshot.userPrompt = undefined
    snapshot.finalMessages = undefined
  })
  ;(output.processingReports || []).forEach(function(report) {
    var inputItem = byIdentity.get('processing-input:' + payloadIdentity('processing-input', report.inputPreview))
    var outputItem = byIdentity.get('processing-output:' + payloadIdentity('processing-output', report.outputPreview))
    var reportOutputItem = report.output ? byIdentity.get('processing-output:' + payloadIdentity('processing-output', report.output)) : undefined
    report.inputRef = inputItem ? (inputItem.duplicateOf || inputItem.id) : undefined
    report.outputRef = reportOutputItem ? (reportOutputItem.duplicateOf || reportOutputItem.id) : (outputItem ? (outputItem.duplicateOf || outputItem.id) : undefined)
    if (reportOutputItem && typeof report.output === 'string') {
      report.outputLength = report.output.length
      report.outputPreview = report.output.slice(0, 500)
      report.output = undefined
    }
    report.inputPreview = undefined
    report.outputPreview = undefined
  })
  ;(output.folderDiagnostics || []).forEach(function(item) {
    var outputItem = item && byIdentity.get('folder-output:' + payloadIdentity('folder-output', item.output))
    if (item && typeof item.output === 'string' && outputItem) {
      item.outputPayloadRef = outputItem.duplicateOf || outputItem.id
      item.outputLength = item.output.length
      item.outputPreview = item.output.slice(0, 500)
      item.output = undefined
    }
    if (item && item.apiMeta && Array.isArray(item.apiMeta.requestMessages)) {
      var requestSource = requestMessagesPreviewSource(item.apiMeta.requestMessages)
      var requestItem = byIdentity.get('request:' + payloadIdentity('request', requestSource))
      if (requestItem) {
        item.apiMeta.requestPayloadRef = requestItem.duplicateOf || requestItem.id
      }
      item.apiMeta.requestMessages = requestMessagesPreview(requestSource)
    }
    if (item && item.postProcessReport && typeof item.postProcessReport.output === 'string') {
      var reportOutputItem = byIdentity.get('processing-output:' + payloadIdentity('processing-output', item.postProcessReport.output))
      if (reportOutputItem) {
        item.postProcessReport.outputPayloadRef = reportOutputItem.duplicateOf || reportOutputItem.id
        item.postProcessReport.outputLength = item.postProcessReport.output.length
        item.postProcessReport.outputPreview = item.postProcessReport.output.slice(0, 500)
        item.postProcessReport.output = undefined
      }
    }
  })
  ;(output.events || []).forEach(function(event) {
    if (event && event.payload !== undefined) {
      var agentItem = byIdentity.get('agent-event:' + payloadIdentity('agent-event', event.payload))
      if (agentItem) {
        event.payloadRefs = [agentItem.duplicateOf || agentItem.id]
      }
      event.payload = undefined
    }
  })
  return output
}

function lightenRun(run) {
  var output = JSON.parse(JSON.stringify(run))
  ;(output.apiCalls || []).forEach(function(call) {
    call.requestMessages = []
    call.responseText = ''
    call.streamText = ''
    ;(call.physicalCalls || []).forEach(function(physical) {
      physical.requestMessages = []
      physical.responseText = ''
      physical.streamText = ''
    })
    ;(call.toolCalls || []).forEach(function(tool) {
      tool.input = undefined
      tool.result = undefined
    })
  })
  ;(output.promptSnapshots || []).forEach(function(snapshot) {
    snapshot.systemPrompt = undefined
    snapshot.userPrompt = undefined
    snapshot.finalMessages = []
  })
  ;(output.processingReports || []).forEach(function(report) {
    report.inputPreview = undefined
    report.outputPreview = undefined
  })
  return output
}

function buildRunWithPayloadRefs(run) {
  var normalizedRun = normalizeLegacyPayloads(run)
  var payloads = collectPayloads(normalizedRun)
  var deduplicated = deduplicatePayloads(payloads)
  var refs = deduplicated.unique.map(function(item, index) {
    var content = payloadContent(item.kind, item.value)
    var text = typeof content === 'string' ? content : JSON.stringify(content, null, 2)
    var buf = Buffer.from(text, 'utf8')
    return {
      id: item.id,
      kind: item.kind,
      file: payloadFileName(index, item.kind),
      bytes: buf.length,
      chars: text.length,
      sha256: payloadIdentity(item.kind, item.value),
      duplicateCount: item.duplicateCount,
      createdAt: Date.now()
    }
  })
  var builtRun = replacePayloadFields(normalizedRun, deduplicated.byIdentity)
  builtRun.payloads = refs
  return {
    run: builtRun,
    payloads: deduplicated.unique.map(function(item) {
      return { kind: item.kind, value: payloadContent(item.kind, item.value), duplicateCount: item.duplicateCount }
    }),
    refs: refs
  }
}

function payloadIntegrityWarnings(run) {
  var warnings = []
  ;((run && run.payloads) || []).forEach(function(ref) {
    if (!ref || !ref.file || !ref.sha256) warnings.push('payload-' + ((ref && ref.id) || 'unknown') + ' 引用不完整')
  })
  return warnings
}

async function writeRunDirectory(dir, run, options) {
  options = options || {}
  await fs.promises.mkdir(path.join(dir, 'payloads'), { recursive: true })
  var built = buildRunWithPayloadRefs(run)
  var payloadWrites = built.payloads.map(function(item, index) {
    var content = payloadContent(item.kind, item.value)
    return fs.promises.writeFile(
      path.join(dir, 'payloads', built.refs[index].file),
      typeof content === 'string' ? content : JSON.stringify(content, null, 2),
      'utf8'
    )
  })
  await Promise.all(payloadWrites)
  var mainRun = options.light ? lightenRun(built.run) : built.run
  if (options.rawHttp) mainRun.rawHttp = maskSensitive(options.rawHttp)
  mainRun.payloadIntegrityWarnings = payloadIntegrityWarnings(mainRun)
  var jsonStr = JSON.stringify(maskSensitive(mainRun), null, 2)
  var tempPath = path.join(dir, 'run-trace.json.tmp')
  await fs.promises.writeFile(tempPath, jsonStr, 'utf8')
  await fs.promises.rename(tempPath, path.join(dir, 'run-trace.json'))
  return {
    success: true,
    path: path.join(dir, 'run-trace.json'),
    dirName: path.basename(dir),
    bytes: Buffer.byteLength(jsonStr, 'utf8'),
    payloadCount: built.refs.length
  }
}

async function removeRunDirectory(source, dirName) {
  if (!dataDir || !dirName || !/^[^\\/]+$/.test(dirName)) return { success: false, reason: '无效目录' }
  var sourceName = ['outline', 'home', 'eval', 'infra'].indexOf(source) >= 0 ? source : 'pipeline'
  var target = path.join(dataDir, 'run-trace', sourceName, dirName)
  if (target.indexOf(path.join(dataDir, 'run-trace', sourceName)) !== 0) return { success: false, reason: '非法目录' }
  await fs.promises.rm(target, { recursive: true, force: true })
  return { success: true, path: target }
}

async function verifyPayloadFiles(dir, run) {
  var refs = (run && run.payloads) || []
  var missing = []
  var hashMismatch = []
  for (var i = 0; i < refs.length; i++) {
    var ref = refs[i]
    var file = path.join(dir, 'payloads', ref.file)
    try {
      var buf = await fs.promises.readFile(file)
      var hash = crypto.createHash('sha256').update(buf).digest('hex')
      if (hash !== ref.sha256) hashMismatch.push(ref.id)
    } catch (readError) {
      missing.push(ref.id)
    }
  }
  return {
    total: refs.length,
    missing: missing,
    hashMismatch: hashMismatch,
    ok: missing.length === 0 && hashMismatch.length === 0
  }
}

async function saveTraceFile(source, run) {
  if (!dataDir) return { success: false, reason: '数据目录未初始化' }
  var dir = traceDir(source)
  if (!dir) return { success: false, reason: '数据目录未初始化' }
  var runDir = path.join(dir, buildTraceDirName(run))
  var previous = traceWriteLocks.get(runDir) || Promise.resolve()
  var write = previous.catch(function() {}).then(async function() {
    await fs.promises.rm(runDir, { recursive: true, force: true })
    return await writeRunDirectory(runDir, run, {})
  })
  traceWriteLocks.set(runDir, write)
  try {
    return await write
  } finally {
    if (traceWriteLocks.get(runDir) === write) traceWriteLocks.delete(runDir)
  }
}

function registerRunTraceHandlers() {
  ipcMain.on('runTrace:stateIntegrity', function(event, report) {
    if (!report || typeof report !== 'object') return
    if (report.healthy) return
    try {
      require('electron-log/main').warn('run-trace-state-integrity: ' + JSON.stringify(maskSensitive(report)))
    } catch (e) {}
  })

  ipcMain.handle('runTrace:export', async function(event, payload) {
    try {
      if (!payload || typeof payload !== 'object') return { success: false, reason: '无效的运行记录数据' }
      if (payload.schema === 'shenyi.run-trace-diff') {
        var diffExport = payload.diff
        var diffName = 'run-trace-diff-' + formatTimestamp(Date.now()) + '.json'
        var diffResult
        if (process.env.SHENYI_TEST_RUN_TRACE_EXPORT) {
          diffResult = { canceled: false, filePath: path.join(process.env.SHENYI_TEST_RUN_TRACE_EXPORT, diffName) }
        } else {
          diffResult = await dialog.showSaveDialog({
            defaultPath: diffName,
            filters: [{ name: 'JSON', extensions: ['json'] }, { name: 'All Files', extensions: ['*'] }]
          })
        }
        if (diffResult.canceled || !diffResult.filePath) return { success: false, reason: 'canceled' }
        var diffDestination = uniqueExportFile(diffResult.filePath)
        var safeDiff = JSON.parse(JSON.stringify(diffExport || {}))
        await fs.promises.writeFile(diffDestination, JSON.stringify({
          schema: payload.schema,
          version: payload.version || 1,
          exportedAt: payload.exportedAt || new Date().toISOString(),
          diff: maskSensitive(safeDiff)
        }, null, 2), 'utf8')
        var diffStats = await fs.promises.stat(diffDestination)
        return { success: true, path: diffDestination, bytes: diffStats.size, mode: 'diff' }
      }
      var mode = payload.mode === 'light' || payload.mode === 'deep' ? payload.mode : 'standard'
      var run = payload.run || {}
      var exportData = {
        schema: payload.schema || 'shenyi.run-trace',
        version: payload.version || 1,
        exportedAt: new Date().toISOString(),
        run: {},
        exportMode: mode,
        payloadDirectoryHint: payload.payloadDirectoryHint || ''
      }

      var defaultName = buildTraceFileName(run, mode)
      var result
      if (process.env.SHENYI_TEST_RUN_TRACE_EXPORT) {
        result = { canceled: false, filePath: path.join(process.env.SHENYI_TEST_RUN_TRACE_EXPORT, defaultName) }
      } else {
        result = await dialog.showSaveDialog({
          defaultPath: defaultName,
          filters: [{ name: 'JSON', extensions: ['json'] }, { name: 'All Files', extensions: ['*'] }]
        })
      }
      if (result.canceled || !result.filePath) return { success: false, reason: 'canceled' }

      var destination = uniqueExportDestination(result.filePath)
      await fs.promises.mkdir(destination, { recursive: true })
      var written
      try {
        written = await writeRunDirectory(destination, run, {
        light: mode === 'light',
        rawHttp: mode === 'deep' ? payload.rawHttp : undefined
      })
      } catch (writeError) {
        await fs.promises.rm(destination, { recursive: true, force: true })
        throw writeError
      }
      if (written.payloadCount === 0) await fs.promises.rmdir(path.join(destination, 'payloads'))
      exportData.run = JSON.parse(await fs.promises.readFile(path.join(destination, 'run-trace.json'), 'utf8'))
      exportData.payloadDirectory = 'payloads'
      exportData.payloadCount = written.payloadCount
      var verification = await verifyPayloadFiles(destination, exportData.run)
      exportData.payloadVerification = verification
      var outputJson = JSON.stringify(exportData, null, 2)
      await fs.promises.writeFile(path.join(destination, 'export.json'), outputJson, 'utf8')

      return { success: true, path: destination, bytes: written.bytes, payloadCount: written.payloadCount, mode: mode }
    } catch (e) {
      return { success: false, reason: e.message || String(e) }
    }
  })

  ipcMain.handle('runTrace:save', async function(event, payload) {
    try {
      if (!payload || typeof payload !== 'object') return { success: false, reason: '无效的运行记录数据' }
      var run = payload.run || {}
      var source = ['outline', 'home', 'eval', 'infra'].indexOf(run.source) >= 0 ? run.source : 'pipeline'
      var saved = await saveTraceFile(source, run)
      if (!saved.success) return saved
      return {
        success: true,
        path: saved.path,
        dirName: saved.dirName,
        bytes: saved.bytes,
        schema: payload.schema || 'shenyi.run-trace',
        version: payload.version || 1
      }
    } catch (e) {
      return { success: false, reason: e.message || String(e) }
    }
  })

  ipcMain.handle('runTrace:remove', async function(event, payload) {
    try {
      if (!payload || typeof payload !== 'object') return { success: false, reason: '无效的删除请求' }
      return await removeRunDirectory(payload.source, payload.dirName)
    } catch (e) {
      return { success: false, reason: e.message || String(e) }
    }
  })

  ipcMain.handle('runTrace:openFolder', async function(event, source) {
    try {
      var dir = traceDir(source)
      if (!dir) return { success: false, reason: '数据目录未初始化' }
      await fs.promises.mkdir(dir, { recursive: true })
      var result = await shell.openPath(dir)
      if (result) return { success: false, reason: result }
      return { success: true, path: dir }
    } catch (e) {
      return { success: false, reason: e.message || String(e) }
    }
  })
}

module.exports = {
  registerRunTraceHandlers,
  setDataDir,
  buildRunWithPayloadRefs,
  deduplicatePayloads,
  uniqueExportFile
}
