const fs = require('fs').promises
const path = require('path')

var dataDir = ''
var journals = new Map()
var writeQueues = new Map()
var writeSeq = 0
var testFailureMode = null

function resolveTestFailureResult(operation) {
  if (!testFailureMode || testFailureMode.operation !== operation) return null
  return { ok: false, error: testFailureMode.error }
}

function clearTestFailureMode() {
  testFailureMode = null
  return { ok: true, cleared: true }
}

function applyTestFailureControl(command) {
  if (!command || typeof command !== 'object') return { ok: false, error: 'invalid_test_failure_command' }
  if (command.op === 'clear') return clearTestFailureMode()
  if (command.op !== 'fail') return { ok: false, error: 'unsupported_test_failure_op' }
  if (command.operation !== 'apply' && command.operation !== 'flush') {
    return { ok: false, error: 'unsupported_test_failure_operation' }
  }
  if (typeof command.error !== 'string' || !command.error) {
    return { ok: false, error: 'invalid_test_failure_error' }
  }
  testFailureMode = { operation: command.operation, error: command.error }
  return { ok: true, operation: command.operation, error: command.error }
}

function stableStringify(value) {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']'
  if (value && typeof value === 'object') {
    var entries = Object.entries(value)
      .filter(function(entry) { return entry[1] !== undefined })
      .sort(function(left, right) { return left[0].localeCompare(right[0]) })
    return '{' + entries.map(function(entry) {
      return JSON.stringify(entry[0]) + ':' + stableStringify(entry[1])
    }).join(',') + '}'
  }
  return JSON.stringify(value) === undefined ? 'null' : JSON.stringify(value)
}

function hashStableString(value) {
  var hash = 5381
  for (var index = 0; index < value.length; index += 1) {
    hash = (((hash << 5) + hash + value.charCodeAt(index)) | 0)
  }
  return hash >>> 0
}

function computeChecksum(projectId, messages) {
  return hashStableString(projectId + '\u0000' + stableStringify(messages)).toString(36)
}

function createMessageId(message, index) {
  if (message && typeof message.messageId === 'string' && message.messageId) return message.messageId
  if (message && typeof message.id === 'string' && message.id) return message.id
  return 'outline-msg-' + index.toString(36) + '-' + hashStableString(stableStringify(message)).toString(36)
}

function ensureMessageIds(messages) {
  return (messages || []).map(function(message, index) {
    if (!message || typeof message !== 'object') return message
    return Object.assign({}, message, { messageId: createMessageId(message, index) })
  })
}

function normalizeSnapshot(projectId, messages) {
  var normalized = ensureMessageIds(messages)
  return {
    schema: 'shenyi.outline-journal',
    version: 1,
    projectId: projectId,
    messages: normalized,
    checksum: computeChecksum(projectId, normalized),
    pendingSegments: 0
  }
}

function isValidSnapshot(snapshot) {
  return Boolean(snapshot
    && snapshot.schema === 'shenyi.outline-journal'
    && snapshot.version === 1
    && typeof snapshot.projectId === 'string'
    && Array.isArray(snapshot.messages))
}

function sanitizePatch(patch) {
  var transient = ['routingFallback', 'budgetExhausted', 'outlineBatchDiff', 'outlineDeletionConfirmation']
  var sanitized = Object.assign({}, patch)
  transient.forEach(function(field) {
    if (sanitized[field] === undefined) delete sanitized[field]
  })
  return sanitized
}

function applyCommand(snapshot, command) {
  if (!command || typeof command !== 'object' || typeof command.messageId !== 'string') return snapshot
  var messages = snapshot.messages
  if (command.op === 'append' || command.op === 'migrate') {
    if (messages.some(function(item) { return item && item.messageId === command.messageId })) return snapshot
    return {
      ...snapshot,
      messages: messages.concat([Object.assign({}, command.message, { messageId: command.messageId })]),
    }
  }
  if (command.op === 'replace') {
    var nextMessage = Object.assign({}, command.message, { messageId: command.messageId })
    var index = messages.findIndex(function(item) { return item && item.messageId === command.messageId })
    return {
      ...snapshot,
      messages: index >= 0
        ? messages.slice(0, index).concat([nextMessage]).concat(messages.slice(index + 1))
        : messages.concat([nextMessage]),
    }
  }
  if (command.op === 'patch') {
    var patchIndex = messages.findIndex(function(item) { return item && item.messageId === command.messageId })
    if (patchIndex < 0) return snapshot
    var patched = Object.assign(
      {},
      messages[patchIndex],
      sanitizePatch(command.patch),
      { messageId: command.messageId },
    )
    return {
      ...snapshot,
      messages: messages.slice(0, patchIndex).concat([patched]).concat(messages.slice(patchIndex + 1)),
    }
  }
  if (command.op === 'remove') {
    return {
      ...snapshot,
      messages: messages.filter(function(item) { return !item || item.messageId !== command.messageId }),
    }
  }
  if (command.op === 'clear') return { ...snapshot, messages: [] }
  return snapshot
}

function enqueueWrite(projectId, task) {
  var prev = writeQueues.get(projectId) || Promise.resolve()
  var next = prev.then(task, task)
  writeQueues.set(projectId, next.catch(function() { /* keep queue alive */ }))
  return next
}

function journalPaths(projectId) {
  var safeProjectId = String(projectId || '').replace(/[^a-zA-Z0-9_-]/g, '_')
  var snapshotPath = path.join(dataDir, 'outline-journal_' + safeProjectId + '.json')
  return { snapshotPath: snapshotPath, segmentPath: snapshotPath + '.segments' }
}

async function readSnapshotFile(snapshotPath) {
  try {
    return JSON.parse(await fs.readFile(snapshotPath, 'utf8'))
  } catch (e) {
    return null
  }
}

async function readLegacyBackupMessages(projectId) {
  try {
    var messages = JSON.parse(await fs.readFile(journalPaths(projectId).snapshotPath + '.legacy-bak', 'utf8'))
    if (!Array.isArray(messages)) return null
    return messages
  } catch (e) {
    return null
  }
}

async function atomicWriteFile(filePath, content) {
  var tmpPath = filePath + '.' + Date.now() + '-' + (++writeSeq).toString(36) + '.tmp'
  try {
    await fs.writeFile(tmpPath, content, 'utf8')
    await fs.rename(tmpPath, filePath)
    return true
  } catch (e) {
    try { await fs.unlink(tmpPath) } catch (ignored) { /* temp file may not exist */ }
    throw e
  }
}

async function loadJournal(projectId) {
  if (journals.has(projectId)) return journals.get(projectId)
  var paths = journalPaths(projectId)
  var snapshot = await readSnapshotFile(paths.snapshotPath)
  if (!isValidSnapshot(snapshot)) snapshot = null
  if (snapshot) {
    snapshot.messages = ensureMessageIds(snapshot.messages)
    if (snapshot.checksum !== computeChecksum(snapshot.projectId, snapshot.messages)) snapshot = null
  }
  if (!snapshot) snapshot = normalizeSnapshot(projectId, [])
  var state = { snapshot: snapshot, segmentCount: Number(snapshot.pendingSegments) || 0 }
  journals.set(projectId, state)
  return state
}

async function appendSegment(projectId, command) {
  var state = await loadJournal(projectId)
  var line = JSON.stringify(command) + '\n'
  await fs.appendFile(journalPaths(projectId).segmentPath, line, 'utf8')
  state.segmentCount += 1
  state.snapshot.pendingSegments = state.segmentCount
}

async function rebuildSnapshot(projectId) {
  var state = await loadJournal(projectId)
  var commands = []
  try {
    var raw = await fs.readFile(journalPaths(projectId).segmentPath, 'utf8')
    raw.split('\n').forEach(function(line) {
      if (!line.trim()) return
      try { commands.push(JSON.parse(line)) } catch (parseError) { /* skip malformed segment */ }
    })
  } catch (missingSegment) { /* no segments to replay */ }
  var snapshot = state.snapshot
  commands.forEach(function(command) { snapshot = applyCommand(snapshot, command) })
  snapshot = {
    ...snapshot,
    messages: ensureMessageIds(snapshot.messages),
    pendingSegments: 0
  }
  snapshot.checksum = computeChecksum(projectId, snapshot.messages)
  return snapshot
}

async function compactJournal(projectId) {
  var state = await loadJournal(projectId)
  var snapshot = await rebuildSnapshot(projectId)
  var paths = journalPaths(projectId)
  var compacted = JSON.stringify(snapshot)
  await atomicWriteFile(paths.snapshotPath, compacted)
  try { await fs.unlink(paths.segmentPath) } catch (missingSegments) { /* no segments */ }
  state.snapshot = snapshot
  state.segmentCount = 0
  return snapshot
}

async function applyCommands(projectId, commands, options) {
  if (!Array.isArray(commands) || commands.length > 1000) {
    throw new Error('invalid_outline_journal_commands')
  }
  var state = await loadJournal(projectId)
  var applied = []
  for (var command of commands) {
    if (!command || typeof command !== 'object' || typeof command.messageId !== 'string') {
      throw new Error('invalid_outline_journal_command')
    }
    await appendSegment(projectId, command)
    state.snapshot = applyCommand(state.snapshot, command)
    applied.push(command.messageId)
  }
  if (options && options.immediate) await compactJournal(projectId)
  else if (state.segmentCount >= 256) await compactJournal(projectId)
  return {
    ok: true,
    applied: applied,
    segmentCount: state.segmentCount,
    checksum: state.snapshot.checksum
  }
}

async function applyCommandsWithTestIsolation(projectId, commands, options) {
  var injectedFailure = resolveTestFailureResult('apply')
  if (injectedFailure) return injectedFailure
  return applyCommands(projectId, commands, options)
}

async function readJournal(projectId) {
  var state = await loadJournal(projectId)
  if (state.segmentCount > 0) {
    var compacted = await compactJournal(projectId)
    return { ok: true, snapshot: compacted }
  }
  return { ok: true, snapshot: state.snapshot }
}

async function migrateLegacyMessages(projectId, messages) {
  if (!Array.isArray(messages)) throw new Error('invalid_outline_journal_messages')
  var state = await loadJournal(projectId)
  if (state.snapshot.messages.length > 0 || state.segmentCount > 0) {
    return {
      ok: true,
      migrated: 0,
      snapshot: state.snapshot,
      skipped: 'journal_not_empty'
    }
  }
  var snapshot = normalizeSnapshot(projectId, messages)
  var paths = journalPaths(projectId)
  try {
    await fs.access(paths.snapshotPath + '.legacy-bak')
  } catch (missingBackup) {
    await atomicWriteFile(paths.snapshotPath + '.legacy-bak', JSON.stringify(messages))
  }
  await atomicWriteFile(paths.snapshotPath, JSON.stringify(snapshot))
  state.snapshot = snapshot
  state.segmentCount = 0
  return { ok: true, migrated: snapshot.messages.length, snapshot: snapshot }
}

async function listLegacyCandidates(projectId) {
  var messages = await readLegacyBackupMessages(projectId)
  if (!messages || messages.length === 0) return { ok: true, candidates: [] }
  return {
    ok: true,
    candidates: [{ source: 'legacy-bak', projectId: projectId, messageCount: messages.length }],
  }
}

async function restoreLegacyBackup(projectId) {
  var messages = await readLegacyBackupMessages(projectId)
  if (!messages) return { ok: false, error: 'legacy_backup_missing' }
  var snapshot = normalizeSnapshot(projectId, messages)
  var state = await loadJournal(projectId)
  var paths = journalPaths(projectId)
  await atomicWriteFile(paths.snapshotPath, JSON.stringify(snapshot))
  try { await fs.unlink(paths.segmentPath) } catch (missingSegments) { /* segments are not required */ }
  state.snapshot = snapshot
  state.segmentCount = 0
  return { ok: true, snapshot: snapshot, backupRetained: true }
}

async function restoreSnapshot(projectId, candidate) {
  if (!isValidSnapshot(candidate)) throw new Error('invalid_outline_journal_snapshot')
  var normalized = normalizeSnapshot(projectId, candidate.messages)
  if (candidate.projectId !== projectId) throw new Error('project_mismatch')
  if (candidate.checksum !== normalized.checksum) throw new Error('checksum_mismatch')
  var state = await loadJournal(projectId)
  var paths = journalPaths(projectId)
  await atomicWriteFile(paths.snapshotPath, JSON.stringify(normalized))
  try { await fs.unlink(paths.segmentPath) } catch (missingSegments) { /* segments are not required */ }
  state.snapshot = normalized
  state.segmentCount = 0
  return { ok: true, snapshot: normalized }
}

async function flushJournal(projectId) {
  var state = await loadJournal(projectId)
  if (state.segmentCount === 0) return { ok: true, segmentCount: 0, checksum: state.snapshot.checksum }
  var snapshot = await compactJournal(projectId)
  return { ok: true, segmentCount: 0, checksum: snapshot.checksum }
}

async function flushJournalWithTestIsolation(projectId) {
  var injectedFailure = resolveTestFailureResult('flush')
  if (injectedFailure) return injectedFailure
  return flushJournal(projectId)
}

async function flushAllJournals() {
  if (!dataDir) return { ok: true, projects: [] }
  var files = await fs.readdir(dataDir)
  var projectIds = files
    .filter(function(fileName) {
      return fileName.startsWith('outline-journal_') && fileName.endsWith('.json.segments')
    })
    .map(function(fileName) {
      return fileName.slice('outline-journal_'.length, -'.json.segments'.length)
    })
  var results = []
  for (var i = 0; i < projectIds.length; i += 1) {
    var projectId = projectIds[i]
    // journalPaths() sanitizes project ids. A segments file created with unsafe
    // characters is not ours and must not be replayed through a mismatched path.
    if (journalPaths(projectId).segmentPath !== path.join(dataDir, 'outline-journal_' + projectId + '.json.segments')) continue
    results.push({
      projectId: projectId,
      result: await flushJournal(projectId),
    })
  }
  return { ok: true, projects: results }
}

function setDataDir(dir) {
  dataDir = dir || ''
  journals = new Map()
  writeQueues = new Map()
}

function registerOutlineJournalHandlers(targetIpc, options) {
  var ipc = targetIpc
  ipc.handle('outlineJournal:apply', function(event, projectId, commands, options) {
    return enqueueWrite(projectId, function() {
      return applyCommandsWithTestIsolation(projectId, commands, options)
    }).catch(function(e) {
      return { ok: false, error: e && e.message ? e.message : String(e) }
    })
  })
  ipc.handle('outlineJournal:snapshot', function(event, projectId) {
    return enqueueWrite(projectId, function() {
      return readJournal(projectId)
    }).catch(function(e) {
      return { ok: false, error: e && e.message ? e.message : String(e) }
    })
  })
  ipc.handle('outlineJournal:migrate', function(event, projectId, messages) {
    return enqueueWrite(projectId, function() {
      return migrateLegacyMessages(projectId, messages)
    }).catch(function(e) {
      return { ok: false, error: e && e.message ? e.message : String(e) }
    })
  })
  ipc.handle('outlineJournal:flush', function(event, projectId) {
    return enqueueWrite(projectId, function() {
      return flushJournalWithTestIsolation(projectId)
    }).catch(function(e) {
      return { ok: false, error: e && e.message ? e.message : String(e) }
    })
  })
  ipc.handle('outlineJournal:flushAll', function() {
    return enqueueWrite('__journal_flush_all__', function() {
      return flushAllJournals()
    }).catch(function(e) {
      return { ok: false, error: e && e.message ? e.message : String(e) }
    })
  })
  ipc.handle('outlineJournal:restore', function(event, projectId, snapshot) {
    return enqueueWrite(projectId, function() {
      return restoreSnapshot(projectId, snapshot)
    }).catch(function(e) {
      return { ok: false, error: e && e.message ? e.message : String(e) }
    })
  })
  ipc.handle('outlineJournal:legacyCandidates', function(event, projectId) {
    return listLegacyCandidates(projectId).catch(function(e) {
      return { ok: false, error: e && e.message ? e.message : String(e) }
    })
  })
  ipc.handle('outlineJournal:restoreLegacy', function(event, projectId) {
    return enqueueWrite(projectId, function() {
      return restoreLegacyBackup(projectId)
    }).catch(function(e) {
      return { ok: false, error: e && e.message ? e.message : String(e) }
    })
  })
  if (options && options.testIsolationEnabled) {
    ipc.handle('outlineJournal:testFailureControl', function(event, command) {
      return applyTestFailureControl(command)
    })
  }
}

module.exports = {
  registerOutlineJournalHandlers,
  setDataDir,
  __internals: { applyCommand, computeChecksum, normalizeSnapshot, validateSnapshot: isValidSnapshot }
}
