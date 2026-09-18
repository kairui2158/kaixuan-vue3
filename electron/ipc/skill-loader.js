const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { ipcMain, shell, utilityProcess } = require('electron')
const log = require('electron-log/main')

const SKILL_ENTRY = 'SKILL.md'
const OPTIONAL_FILES = ['template.md', 'meta.json', 'script.js', 'samples.txt', 'schema.json']
const MANIFEST_FILE = 'skill.json'
const EVALS_FILE = 'evals.json'
const RESOURCE_MAX_DEPTH = 6
const RESOURCE_MAX_FILES = 2000
const RESOURCE_MAX_FILE_SIZE = 2 * 1024 * 1024
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

function buildFileFingerprint(fullPath) {
  try {
    const stat = fs.statSync(fullPath)
    if (!stat.isFile()) return null
    return {
      file: path.basename(fullPath),
      hash: crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex'),
      mtime: Math.round(stat.mtimeMs),
      bytes: stat.size
    }
  } catch (_) {
    return null
  }
}

function addWarning(warnings, code, message) {
  warnings.push({ code, message })
}

function collectResourceFiles(directory, warnings) {
  const resources = []
  const knownFiles = new Set([SKILL_ENTRY, ...OPTIONAL_FILES, MANIFEST_FILE, EVALS_FILE])
  const queue = [{ directory, relativePath: '', depth: 0 }]

  while (queue.length > 0 && resources.length < RESOURCE_MAX_FILES) {
    const current = queue.shift()
    let entries = []
    try {
      entries = fs.readdirSync(current.directory, { withFileTypes: true })
    } catch (e) {
      addWarning(warnings, 'resource-dir-read-failed', `无法读取 ${current.relativePath || '.'}：${e.message}`)
      continue
    }

    for (const entry of entries) {
      const relativePath = current.relativePath ? `${current.relativePath}/${entry.name}` : entry.name
      const fullPath = path.join(current.directory, entry.name)
      if (entry.name.startsWith('.')) continue
      if (entry.isDirectory()) {
        if (current.depth + 1 >= RESOURCE_MAX_DEPTH) {
          addWarning(warnings, 'resource-depth-exceeded', `跳过超过 6 层的目录：${relativePath}`)
          continue
        }
        queue.push({ directory: fullPath, relativePath, depth: current.depth + 1 })
        continue
      }
      if (!entry.isFile()) continue
      if (current.relativePath === '' && knownFiles.has(entry.name)) continue
      if (resources.length >= RESOURCE_MAX_FILES) {
        addWarning(warnings, 'resource-count-exceeded', `资源文件超过 2000 个，剩余文件未读取`)
        break
      }

      let stat = null
      try { stat = fs.statSync(fullPath) } catch (e) {
        addWarning(warnings, 'resource-stat-failed', `无法读取 ${relativePath}：${e.message}`)
        continue
      }
      if (stat.size > RESOURCE_MAX_FILE_SIZE) {
        addWarning(warnings, 'resource-too-large', `跳过超过 2MB 的资源文件：${relativePath}`)
        continue
      }
      const result = readText(fullPath)
      if (!result.ok) {
        addWarning(warnings, 'resource-read-failed', `无法读取 ${relativePath}：${result.message}`)
        continue
      }
      resources.push({ path: relativePath, content: result.content })
    }
  }

  return resources.sort((a, b) => a.path.localeCompare(b.path))
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
  const warnings = []
  const skillBody = (markdown && markdown.body) || ''

  let manifest = null
  const manifestResult = readText(path.join(directory, MANIFEST_FILE))
  if (manifestResult.ok) {
    try {
      manifest = JSON.parse(manifestResult.content)
      if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
        addWarning(warnings, 'manifest-invalid', 'skill.json 必须是 JSON 对象，已忽略该文件')
        manifest = null
      }
    } catch (e) {
      addWarning(warnings, 'manifest-invalid', 'skill.json 不是有效 JSON，已忽略该文件：' + e.message)
      manifest = null
    }
  }

  const id = manifest && typeof manifest.id === 'string' && manifest.id.trim()
    ? manifest.id.trim()
    : (markdown && markdown.id ? markdown.id : path.basename(directory))
  const name = manifest && typeof manifest.name === 'string' && manifest.name.trim()
      ? manifest.name.trim()
      : (markdown && markdown.name ? markdown.name : id)
  if (manifest) {
    if (markdown && markdown.id && manifest.id !== undefined && String(manifest.id) !== markdown.id) {
      addWarning(warnings, 'manifest-id-conflict', `skill.json 显式声明 id=${manifest.id}，已优先于 SKILL.md 的 id=${markdown.id}`)
    }
    if (markdown && markdown.name && manifest.name !== undefined && String(manifest.name) !== markdown.name) {
      addWarning(warnings, 'manifest-name-conflict', `skill.json 显式声明 name=${manifest.name}，已优先于 SKILL.md 的 name=${markdown.name}`)
    }
  }

  const templatePath = path.join(directory, 'template.md')
  const template = readText(templatePath)
  if (!template.ok) {
    addWarning(warnings, 'template-fallback-skill-md', '缺少 template.md，已回退使用 SKILL.md 正文')
  }

  const files = { template: template.ok ? template.content : skillBody }
  for (const fileName of OPTIONAL_FILES) {
    if (fileName === 'template.md') continue
    const result = readText(path.join(directory, fileName))
    if (result.ok) files[fileName.replace(/\.[^.]+$/, '')] = result.content
  }

  let meta = {}
  if (files.meta) {
    try { meta = JSON.parse(files.meta) }
    catch (e) {
      meta = {}
      addWarning(warnings, 'meta-invalid', 'meta.json 不是有效 JSON，已忽略该文件：' + e.message)
    }
  }

  let schema = null
  if (files.schema) {
    try { schema = JSON.parse(files.schema) }
    catch (e) {
      schema = null
      addWarning(warnings, 'schema-invalid', 'schema.json 不是有效 JSON，已忽略该文件：' + e.message)
    }
  }

  let evals = null
  const evalsResult = readText(path.join(directory, EVALS_FILE))
  if (evalsResult.ok) {
    try {
      evals = JSON.parse(evalsResult.content)
      if (!evals || typeof evals !== 'object' || Array.isArray(evals)) {
        addWarning(warnings, 'evals-invalid', 'evals.json 必须是 JSON 对象，已忽略该文件')
        evals = null
      }
    } catch (e) {
      addWarning(warnings, 'evals-invalid', 'evals.json 不是有效 JSON，已忽略该文件：' + e.message)
      evals = null
    }
  }

  const resources = collectResourceFiles(directory, warnings)
  const fingerprint = [SKILL_ENTRY, ...OPTIONAL_FILES, MANIFEST_FILE, EVALS_FILE]
    .map(fileName => buildFileFingerprint(path.join(directory, fileName)))
    .filter(Boolean)

  return ok({
    folderPath: directory,
    skill: {
      id,
      name,
      description: (markdown && markdown.description) || '',
      body: skillBody,
      template: files.template,
      meta,
      script: files.script || '',
      samples: files.samples || '',
      schema,
      evals,
      manifest,
      resources,
      fingerprint,
      warnings
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
