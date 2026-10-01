const { ipcMain } = require('electron')
const fs = require('fs')
const fsp = require('fs').promises
const path = require('path')
const crypto = require('crypto')

const SCHEMA_VERSION = 1
const TERMINAL_STATUSES = ['completed', 'stalled', 'needs_user', 'failed', 'canceled']

let dataDir = ''

function setDataDir(dir) {
  dataDir = dir || ''
  if (!dataDir) return
  fs.mkdirSync(path.join(dataDir, 'agent-state', 'tasks'), { recursive: true })
  fs.mkdirSync(path.join(dataDir, 'agent-state', 'checkpoints'), { recursive: true })
  fs.mkdirSync(path.join(dataDir, 'agent-state', 'cancel-tokens'), { recursive: true })
}

function safeId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120) || 'unknown'
}

function taskPath(taskId) {
  return path.join(dataDir, 'agent-state', 'tasks', safeId(taskId) + '.json')
}

function checkpointPath(checkpointId) {
  return path.join(dataDir, 'agent-state', 'checkpoints', safeId(checkpointId) + '.json')
}

function cancelTokenPath(taskId) {
  return path.join(dataDir, 'agent-state', 'cancel-tokens', safeId(taskId) + '.json')
}

function canonicalJson(value) {
  if (value === undefined) return 'null'
  return JSON.stringify(value, Object.keys(sortValue(value)).sort())
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((output, key) => {
      output[key] = sortValue(value[key])
      return output
    }, {})
  }
  return value
}

function contentHash(value) {
  return crypto.createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')
}

async function atomicWriteJson(filePath, data) {
  const tmpPath = filePath + '.' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.tmp'
  const bakPath = filePath + '.bak'
  await fsp.writeFile(tmpPath, JSON.stringify(data), 'utf8')
  try {
    await fsp.access(filePath)
    await fsp.rename(filePath, bakPath)
  } catch (e) { /* no previous file */ }
  try {
    await fsp.rename(tmpPath, filePath)
  } catch (renameError) {
    try {
      await fsp.access(bakPath)
      await fsp.rename(bakPath, filePath)
    } catch (restoreError) { /* nothing to restore */ }
    throw renameError
  }
}

async function readJson(filePath) {
  try {
    const raw = await fsp.readFile(filePath, 'utf8')
    return JSON.parse(raw)
  } catch (error) {
    try {
      const backup = await fsp.readFile(filePath + '.bak', 'utf8')
      const restored = JSON.parse(backup)
      await fsp.writeFile(filePath, backup, 'utf8')
      return restored
    } catch (backupError) {
      return null
    }
  }
}

function normalizeTaskRecord(value) {
  if (!value || typeof value !== 'object') return null
  const taskId = String(value.taskId || '')
  const status = String(value.status || '')
  const updatedAt = Number(value.updatedAt)
  if (!taskId || !status || !Number.isFinite(updatedAt)) return null
  return {
    schemaVersion: Number(value.schemaVersion) || SCHEMA_VERSION,
    taskId,
    status,
    reason: value.reason === undefined ? undefined : String(value.reason),
    snapshot: value.snapshot && typeof value.snapshot === 'object' ? value.snapshot : value,
    updatedAt,
  }
}

async function saveTaskState(payload) {
  if (!dataDir) return { ok: false, reason: 'data_dir_unavailable' }
  const record = normalizeTaskRecord(payload)
  if (!record) return { ok: false, reason: 'invalid_task_state' }
  await atomicWriteJson(taskPath(record.taskId), record)
  return { ok: true, taskId: record.taskId, status: record.status, updatedAt: record.updatedAt }
}

async function listTaskFiles() {
  if (!dataDir) return []
  try {
    return (await fsp.readdir(path.join(dataDir, 'agent-state', 'tasks')))
      .filter(name => name.endsWith('.json'))
      .map(name => path.join(dataDir, 'agent-state', 'tasks', name))
  } catch (error) {
    return []
  }
}

async function readAllTasks() {
  const files = await listTaskFiles()
  const records = []
  for (const file of files) {
    const record = normalizeTaskRecord(await readJson(file))
    if (record) records.push(record)
  }
  records.sort((a, b) => b.updatedAt - a.updatedAt)
  return records
}

async function getAgentStatus(target) {
  if (target === 'all' || target === undefined || target === null || target === '') {
    return await readAllTasks()
  }
  const record = normalizeTaskRecord(await readJson(taskPath(target)))
  return record || null
}

async function writeCancelToken(taskId, reason) {
  const token = {
    schemaVersion: SCHEMA_VERSION,
    taskId,
    reason: String(reason || 'user_cancel'),
    canceledAt: Date.now(),
  }
  await atomicWriteJson(cancelTokenPath(taskId), token)
  return token
}

async function cancelAgent(taskId, reason) {
  if (!dataDir) return { ok: false, reason: 'data_dir_unavailable' }
  if (!taskId) return { ok: false, reason: 'invalid_task_id' }
  const token = await writeCancelToken(taskId, reason)
  const filePath = taskPath(taskId)
  const existing = normalizeTaskRecord(await readJson(filePath))
  if (existing) {
    const canceled = {
      ...existing,
      status: 'canceled',
      reason: token.reason,
      updatedAt: token.canceledAt,
      snapshot: {
        ...(existing.snapshot && typeof existing.snapshot === 'object' ? existing.snapshot : {}),
        status: 'canceled',
        reason: token.reason,
        updatedAt: token.canceledAt,
      },
    }
    await atomicWriteJson(filePath, canceled)
    return { ok: true, taskId, status: 'canceled', cancelToken: token }
  }
  return { ok: true, taskId, status: 'cancel_token_only', cancelToken: token }
}

async function handleCancelToken(payload) {
  if (!dataDir) return { ok: false, reason: 'data_dir_unavailable' }
  const action = String(payload?.action || 'get')
  const taskId = String(payload?.taskId || '')
  if (!taskId) return { ok: false, reason: 'invalid_task_id' }
  if (action === 'clear') {
    try { await fsp.unlink(cancelTokenPath(taskId)) } catch (e) { /* absent */ }
    return { ok: true, taskId, cleared: true }
  }
  if (action === 'create') {
    const token = await writeCancelToken(taskId, payload?.reason)
    return { ok: true, taskId, cancelToken: token }
  }
  const token = await readJson(cancelTokenPath(taskId))
  return { ok: true, taskId, cancelToken: token || null }
}

async function saveCheckpoint(payload) {
  if (!dataDir) return { ok: false, reason: 'data_dir_unavailable' }
  const checkpointId = String(payload?.checkpointId || '')
  if (!checkpointId) return { ok: false, reason: 'invalid_checkpoint_id' }
  const body = payload?.payload === undefined ? null : payload.payload
  const hash = typeof payload?.contentHash === 'string' && payload.contentHash
    ? payload.contentHash
    : contentHash(body)
  const record = {
    schemaVersion: SCHEMA_VERSION,
    checkpointId,
    taskId: String(payload?.taskId || ''),
    contentHash: hash,
    payload: body,
    savedAt: Number(payload?.savedAt) || Date.now(),
  }
  await atomicWriteJson(checkpointPath(checkpointId), record)
  return { ok: true, checkpointId, taskId: record.taskId, contentHash: hash, savedAt: record.savedAt }
}

async function loadCheckpoint(checkpointId) {
  if (!dataDir) return { ok: false, reason: 'data_dir_unavailable' }
  if (!checkpointId) return { ok: false, reason: 'invalid_checkpoint_id' }
  const record = await readJson(checkpointPath(checkpointId))
  if (!record || typeof record !== 'object' || !record.checkpointId) {
    return { ok: false, reason: 'checkpoint_not_found', checkpointId }
  }
  if (contentHash(record.payload) !== record.contentHash) {
    return { ok: false, reason: 'hash_mismatch', checkpointId, contentHash: record.contentHash }
  }
  return { ok: true, checkpoint: record }
}

async function listCheckpoints() {
  if (!dataDir) return []
  try {
    const files = (await fsp.readdir(path.join(dataDir, 'agent-state', 'checkpoints')))
      .filter(name => name.endsWith('.json'))
      .map(name => path.join(dataDir, 'agent-state', 'checkpoints', name))
    const records = []
    for (const file of files) {
      const record = await readJson(file)
      if (record && record.checkpointId) {
        records.push({
          checkpointId: record.checkpointId,
          taskId: record.taskId,
          contentHash: record.contentHash,
          savedAt: record.savedAt,
        })
      }
    }
    records.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
    return records
  } catch (error) {
    return []
  }
}

async function recoverAgents() {
  if (!dataDir) return { ok: false, reason: 'data_dir_unavailable' }
  const tasks = await readAllTasks()
  const checkpoints = await listCheckpoints()
  const recovered = []
  for (const task of tasks) {
    let nextTask = task
    if (!TERMINAL_STATUSES.includes(task.status)) {
      nextTask = {
        ...task,
        status: 'needs_user',
        reason: 'main_process_restarted',
        updatedAt: Date.now(),
        snapshot: {
          ...(task.snapshot && typeof task.snapshot === 'object' ? task.snapshot : {}),
          status: 'needs_user',
          reason: 'main_process_restarted',
          updatedAt: Date.now(),
        },
      }
      await atomicWriteJson(taskPath(task.taskId), nextTask)
    }
    const checkpoint = checkpoints.find(item => item.taskId === task.taskId) || null
    const cancelToken = await readJson(cancelTokenPath(task.taskId))
    recovered.push({ task: nextTask, checkpoint, cancelToken: cancelToken || null })
  }
  return { ok: true, recovered }
}

function registerAgentStateHandlers() {
  ipcMain.handle('agent:state:save', async function(event, payload) {
    try {
      return await saveTaskState(payload)
    } catch (error) {
      return { ok: false, reason: 'write_failed', error: String(error?.message || error) }
    }
  })
  ipcMain.handle('agent:status', async function(event, target) {
    try {
      return await getAgentStatus(target)
    } catch (error) {
      return []
    }
  })
  ipcMain.handle('agent:cancel', async function(event, taskId, reason) {
    try {
      return await cancelAgent(taskId, reason)
    } catch (error) {
      return { ok: false, reason: 'write_failed', error: String(error?.message || error) }
    }
  })
  ipcMain.handle('agent:cancel-token', async function(event, payload) {
    try {
      return await handleCancelToken(payload || {})
    } catch (error) {
      return { ok: false, reason: 'write_failed', error: String(error?.message || error) }
    }
  })
  ipcMain.handle('agent:checkpoint:save', async function(event, payload) {
    try {
      return await saveCheckpoint(payload)
    } catch (error) {
      return { ok: false, reason: 'write_failed', error: String(error?.message || error) }
    }
  })
  ipcMain.handle('agent:checkpoint:load', async function(event, checkpointId) {
    try {
      return await loadCheckpoint(checkpointId)
    } catch (error) {
      return { ok: false, reason: 'read_failed', error: String(error?.message || error) }
    }
  })
  ipcMain.handle('agent:checkpoint:list', async function() {
    try {
      return await listCheckpoints()
    } catch (error) {
      return []
    }
  })
  ipcMain.handle('agent:recover', async function() {
    try {
      return await recoverAgents()
    } catch (error) {
      return { ok: false, reason: 'recover_failed', error: String(error?.message || error) }
    }
  })
}

module.exports = { registerAgentStateHandlers, setDataDir }
