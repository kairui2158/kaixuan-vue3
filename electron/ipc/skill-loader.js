const fs = require('fs')
const path = require('path')
const { ipcMain, shell, utilityProcess } = require('electron')
const log = require('electron-log/main')

const SKILL_ENTRY = 'SKILL.md'
const OPTIONAL_FILES = ['template.md', 'meta.json', 'script.js', 'samples.txt', 'schema.json']
const SCRIPT_REQUEST_TIMEOUT_MS = 5000
const SCRIPT_MAX_LENGTH = 512 * 1024
const workerPath = path.join(__dirname, 'skill-script-worker.js')
const diagnosticsLog = path.join(__dirname, '..', '_data', 'skill-script-worker.log')

let scriptWorker = null
let scriptRequestSeq = 0
const pendingScriptRequests = new Map()

function ensureScriptWorker() {
  if (scriptWorker && !scriptWorker.killed) return scriptWorker
  try {
    scriptWorker = utilityProcess.fork(workerPath, [], {
      serviceName: 'shenyi-skill-script',
      stdio: 'pipe'
    })
    scriptWorker.on('spawn', function() {
      log.info('[skill-script-worker] spawned pid=' + scriptWorker.pid)
    })
    scriptWorker.stderr && scriptWorker.stderr.on('data', function(chunk) {
      log.error('[skill-script-worker] stderr ' + String(chunk).trim())
      try { fs.appendFileSync(diagnosticsLog, String(chunk)) } catch (_) {}
    })
  } catch (forkError) {
    log.error('[skill-script-worker] fork failed', forkError)
    throw forkError
  }
  log.info('[skill-script-worker] fork requested ' + workerPath)
  // Keep the utility process Node-flavored: no Node/Electron APIs are passed into its sandbox.
  scriptWorker.on('message', function(message) {
    const pending = pendingScriptRequests.get(message.id)
    if (!pending) return
    pendingScriptRequests.delete(message.id)
    clearTimeout(pending.timeout)
    if (message.ok) pending.resolve(message.result)
    else pending.reject(Object.assign(new Error(message.message), { code: message.code }))
  })
  scriptWorker.on('exit', function() {
    for (const pending of pendingScriptRequests.values()) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('技能脚本进程已退出'))
    }
    pendingScriptRequests.clear()
    scriptWorker = null
  })
  return scriptWorker
}

function stopScriptWorker() {
  if (!scriptWorker || scriptWorker.killed) return
  scriptWorker.kill()
  scriptWorker = null
}

function executeScriptInWorker(script, payload) {
  const worker = ensureScriptWorker()
  const id = 'skill-script-' + (++scriptRequestSeq)
  return new Promise(function(resolve, reject) {
    const timeout = setTimeout(function() {
      pendingScriptRequests.delete(id)
      stopScriptWorker()
      reject(new Error('技能脚本执行超时'))
    }, SCRIPT_REQUEST_TIMEOUT_MS + 500)
    pendingScriptRequests.set(id, {
      resolve,
      reject,
      timeout
    })
    worker.postMessage({ id, script, payload })
  })
}

function ok(value) {
  return { ok: true, ...value }
}

function fail(code, message) {
  return { ok: false, code, message }
}

function parseSkillMarkdown(content) {
  if (typeof content !== 'string' || !content.trim()) return null
  const normalized = content.replace(/\r\n/g, '\n')
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!match) return { body: normalized }

  const front = {}
  for (const line of match[1].split('\n')) {
    const item = line.match(/^([A-Za-z0-9_-]+):\s*([\s\S]*)$/)
    if (item) front[item[1]] = item[2].trim().replace(/^["']|["']$/g, '')
    else {
      const nested = line.match(/^\s+([A-Za-z0-9_-]+):\s*([\s\S]*)$/)
      if (nested) front[nested[1]] = nested[2].trim().replace(/^["']|["']$/g, '')
    }
  }
  front.body = normalized.slice(match[0].length).trim()
  return front
}

function readText(filePath) {
  try {
    return { ok: true, content: fs.readFileSync(filePath, 'utf8') }
  } catch (e) {
    return { ok: false, message: e.message }
  }
}

function resolveExistingDirectory(inputPath) {
  if (typeof inputPath !== 'string' || !inputPath.trim()) return null
  const resolved = path.resolve(inputPath)
  let stat = null
  try { stat = fs.statSync(resolved) } catch (_) {}
  if (!stat || !stat.isDirectory()) return null
  return resolved
}

function loadSkillFolder(folderPath) {
  const directory = resolveExistingDirectory(folderPath)
  if (!directory) return fail('folder-not-found', 'SKILL 文件夹不存在或不是目录')

  const entryPath = path.join(directory, SKILL_ENTRY)
  const entry = readText(entryPath)
  if (!entry.ok) return fail('skill-md-missing', '缺少 SKILL.md')

  const markdown = parseSkillMarkdown(entry.content)
  const id = markdown && markdown.id ? markdown.id : path.basename(directory)
  const name = markdown && markdown.name ? markdown.name : id

  const templatePath = path.join(directory, 'template.md')
  const template = readText(templatePath)
  if (!template.ok) return fail('template-missing', '缺少 template.md')

  const files = { template: template.content }
  for (const fileName of OPTIONAL_FILES) {
    if (fileName === 'template.md') continue
    const result = readText(path.join(directory, fileName))
    if (result.ok) files[fileName.replace(/\.[^.]+$/, '')] = result.content
  }

  let meta = {}
  if (files.meta) {
    try { meta = JSON.parse(files.meta) }
    catch (e) { return fail('meta-invalid', 'meta.json 不是有效 JSON：' + e.message) }
  }

  let schema = null
  if (files.schema) {
    try { schema = JSON.parse(files.schema) }
    catch (e) { return fail('schema-invalid', 'schema.json 不是有效 JSON：' + e.message) }
  }

  return ok({
    folderPath: directory,
    skill: {
      id,
      name,
      description: (markdown && markdown.description) || '',
      template: files.template,
      meta,
      script: files.script || '',
      samples: files.samples || '',
      schema
    }
  })
}

function listSkillFolders(rootPath) {
  const root = resolveExistingDirectory(rootPath)
  if (!root) return fail('root-not-found', '技能根目录不存在')

  const folders = []
  try {
    for (const name of fs.readdirSync(root)) {
      const directory = path.join(root, name)
      let stat = null
      try { stat = fs.statSync(directory) } catch (_) {}
      if (!stat || !stat.isDirectory()) continue
      if (!fs.existsSync(path.join(directory, SKILL_ENTRY))) continue
      folders.push({ name, folderPath: directory })
    }
  } catch (e) {
    return fail('root-read-failed', e.message)
  }
  return ok({ folders })
}

async function executeSkillScript(script, payload) {
  if (typeof script !== 'string' || !script.trim()) {
    return fail('script-empty', '脚本为空')
  }
  if (script.length > SCRIPT_MAX_LENGTH) {
    return fail('script-too-large', '脚本超过 512KB 限制')
  }

  try {
    const result = await executeScriptInWorker(script, payload)
    return ok(result)
  } catch (e) {
    return fail(e && e.code ? e.code : 'script-failed', e.message)
  }
}

function registerSkillLoaderHandlers() {
  ipcMain.handle('skill:loadFolder', function(event, folderPath) {
    return loadSkillFolder(folderPath)
  })
  ipcMain.handle('skill:listFolders', function(event, rootPath) {
    return listSkillFolders(rootPath)
  })
  ipcMain.handle('skill:executeScript', async function(event, script, payload) {
    return await executeSkillScript(script, payload)
  })
  ipcMain.handle('skill:openFolder', async function(event, folderPath) {
    const directory = resolveExistingDirectory(folderPath)
    if (!directory) return fail('folder-not-found', 'SKILL 文件夹不存在或不是目录')
    try {
      const errorMessage = await shell.openPath(directory)
      if (errorMessage) return fail('open-failed', '打开文件夹失败：' + errorMessage)
      return ok({ folderPath: directory })
    } catch (e) {
      return fail('open-failed', '打开文件夹失败：' + (e && e.message ? e.message : String(e)))
    }
  })
}

module.exports = {
  loadSkillFolder,
  listSkillFolders,
  executeSkillScript,
  registerSkillLoaderHandlers
}
