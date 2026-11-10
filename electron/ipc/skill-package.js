const fs = require('fs')
const path = require('path')
const { app, ipcMain } = require('electron')
const { loadSkillFolder } = require('./skill-loader')

const SKILL_PACKAGE_PROTOCOL = require('../../src/services/skillPackageProtocol.json')
const { validateSkillDeaiMeta } = require('../../dist-renderer/skillDeaiContractValidation.cjs')

const MAX_ENTRIES = 500
const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024
const MANIFEST_NAME = 'skill-package.json'
const SKILL_PACKAGE_SCHEMA = 'shenyi.skill-package/1'

let injectedSkillLibraryRoot = ''

function ok(value) {
  return { ok: true, ...value }
}

function fail(code, message) {
  return { ok: false, code, message }
}

function inspectManifestProtocolBoundary(manifest) {
  const issues = []
  const warnings = []
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { issues, warnings }
  }
  for (const field of SKILL_PACKAGE_PROTOCOL.forbiddenFields) {
    if (manifest[field] !== undefined) {
      issues.push({
        field,
        message: SKILL_PACKAGE_PROTOCOL.messages.forbiddenField.replace('{field}', field)
      })
    }
  }
  if (
    manifest.meta
    && typeof manifest.meta === 'object'
    && !Array.isArray(manifest.meta)
    && manifest.meta.agent !== undefined
  ) {
    warnings.push({
      field: 'meta.agent',
      message: SKILL_PACKAGE_PROTOCOL.messages.deprecatedMetaAgent
    })
  }
  if (
    manifest.meta
    && typeof manifest.meta === 'object'
    && !Array.isArray(manifest.meta)
    && manifest.meta.deai !== undefined
  ) {
    const deaiValidation = validateSkillDeaiMeta(manifest.meta.deai)
    if (!deaiValidation.valid) {
      for (const message of deaiValidation.errors) {
        issues.push({ field: 'meta.deai', message })
      }
    }
    for (const message of deaiValidation.warnings) {
      warnings.push({ field: 'meta.deai', message })
    }
  }
  return { issues, warnings }
}

function safeRelativePath(value) {
  if (typeof value !== 'string' || !value) return ''
  const normalized = value.replace(/\\/g, '/').replace(/^\/+/, '')
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length === 0) return ''
  for (const part of parts) {
    if (part === '.' || part === '..' || part.includes(':') || part.includes('\0')) return ''
  }
  return parts.join('/')
}

function findSkillRoot(entries) {
  const manifestEntries = entries.filter(entry => entry.relativePath.endsWith(MANIFEST_NAME))
  if (manifestEntries.length === 0) {
    const skillEntries = entries.filter(function(entry) {
      return entry.relativePath === 'SKILL.md' || entry.relativePath.endsWith('/SKILL.md')
    })
    let compatibleRoot = ''
    let compatibleLength = Number.MAX_SAFE_INTEGER
    for (const entry of skillEntries) {
      const root = entry.relativePath === 'SKILL.md' ? '' : entry.relativePath.slice(0, -'/SKILL.md'.length)
      if (root.length < compatibleLength) {
        compatibleRoot = root
        compatibleLength = root.length
      }
    }
    return compatibleRoot
  }
  let best = ''
  let bestLength = Number.MAX_SAFE_INTEGER
  for (const entry of manifestEntries) {
    const root = entry.relativePath.slice(0, -MANIFEST_NAME.length).replace(/\/$/, '')
    if (root.length < bestLength) {
      best = root
      bestLength = root.length
    }
  }
  return best
}

function isUnderRoot(relativePath, root) {
  return root ? relativePath.startsWith(root + '/') : true
}

function hasSkillEntry(entries, root) {
  const entryName = root ? root + '/SKILL.md' : 'SKILL.md'
  return entries.some(entry => entry.relativePath === entryName)
}

function listZipEntries(zipPath) {
  return new Promise(function(resolve) {
    try {
      const yauzl = require('yauzl')
      const entries = []
      let totalBytes = 0
      let failed = null
      let completed = false

      function finish(result) {
        if (completed) return
        completed = true
        resolve(result)
      }

      yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, function(error, zipFile) {
        if (error || !zipFile) {
          finish({ ok: false, code: 'zip-open-failed', message: (error && error.message) || '压缩包无法读取' })
          return
        }

        zipFile.readEntry()
        zipFile.on('entry', function(entry) {
          if (entries.length >= MAX_ENTRIES) {
            failed = fail('zip-too-many-entries', `压缩包条目超过 ${MAX_ENTRIES} 个`)
            zipFile.close()
            finish(failed)
            return
          }
          const relativePath = safeRelativePath(entry.fileName)
          if (!relativePath || relativePath.endsWith('/')) {
            zipFile.readEntry()
            return
          }
          if (entry.uncompressedSize > MAX_UNCOMPRESSED_BYTES) {
            failed = fail('zip-file-too-large', `文件过大：${relativePath}`)
            zipFile.close()
            finish(failed)
            return
          }
          totalBytes += entry.uncompressedSize
          if (totalBytes > MAX_UNCOMPRESSED_BYTES) {
            failed = fail('zip-too-large', '解压总大小超过 50MB')
            zipFile.close()
            finish(failed)
            return
          }
          entries.push({ relativePath, uncompressedSize: entry.uncompressedSize })
          zipFile.readEntry()
        })
        zipFile.on('end', function() {
          if (failed) return
          finish({ ok: true, entries, totalBytes })
        })
        zipFile.on('error', function(error) {
          if (failed) return
          finish(fail('zip-read-failed', error.message || '压缩包读取失败'))
        })
        zipFile.on('close', function() {
          if (!completed && !failed) finish({ ok: true, entries, totalBytes })
        })
      })
    } catch (error) {
      resolve(fail('zip-reader-missing', error.message || '压缩包读取器不可用'))
    }
  })
}

function readZipTextEntries(zipPath, wanted) {
  return readZipEntries(zipPath, wanted).then(function(read) {
    if (!read.ok) return read
    const files = {}
    for (const name of Object.keys(read.files)) {
      files[name] = read.files[name].toString('utf8')
    }
    return ok({ files })
  })
}

function readZipEntries(zipPath, wanted) {
  return new Promise(function(resolve) {
    const wantedSet = new Set(wanted)
    const results = {}
    let completed = false

    function finish() {
      if (completed) return
      completed = true
      resolve(ok({ files: results }))
    }

    try {
      const yauzl = require('yauzl')
      yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, function(error, zipFile) {
        if (error || !zipFile) {
          resolve(fail('zip-open-failed', (error && error.message) || '压缩包无法读取'))
          return
        }

        zipFile.readEntry()
        zipFile.on('entry', function(entry) {
          const relativePath = safeRelativePath(entry.fileName)
          if (!relativePath || relativePath.endsWith('/')) {
            zipFile.readEntry()
            return
          }
          if (!wantedSet.has(relativePath)) {
            zipFile.readEntry()
            return
          }
          zipFile.openReadStream(entry, function(readError, readStream) {
            if (readError || !readStream) {
              zipFile.close()
              resolve(fail('zip-read-failed', `读取失败：${relativePath}`))
              return
            }
            const chunks = []
            let size = 0
            readStream.on('data', function(chunk) {
              size += chunk.length
              if (size > MAX_UNCOMPRESSED_BYTES) {
                readStream.destroy()
                zipFile.close()
                resolve(fail('zip-file-too-large', `文件过大：${relativePath}`))
                return
              }
              chunks.push(chunk)
            })
            readStream.on('end', function() {
              results[relativePath] = Buffer.concat(chunks)
              wantedSet.delete(relativePath)
              if (wantedSet.size === 0) zipFile.close()
              else zipFile.readEntry()
            })
            readStream.on('error', function(streamError) {
              zipFile.close()
              resolve(fail('zip-read-failed', `读取失败：${relativePath}：${streamError.message}`))
            })
          })
        })
        zipFile.on('end', function() {
          finish()
        })
        zipFile.on('close', function() {
          finish()
        })
        zipFile.on('error', function(zipError) {
          finish()
        })
      })
    } catch (error) {
      resolve(fail('zip-reader-missing', error.message || '压缩包读取器不可用'))
    }
  })
}

function isVersionDirectory(name) {
  return /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(name)
}

function safeSkillLibraryId(skillId) {
  return String(skillId || '').replace(/[^A-Za-z0-9_-]/g, '')
}

function setSkillLibraryRoot(value) {
  injectedSkillLibraryRoot = typeof value === 'string' && value ? path.resolve(value) : ''
}

function skillLibraryBase() {
  return injectedSkillLibraryRoot || path.join(app.getPath('userData'), 'skills')
}

function skillLibraryRoot(skillId) {
  const safeId = safeSkillLibraryId(skillId)
  if (!safeId) return null
  return path.join(skillLibraryBase(), safeId)
}

function compareVersionDirectories(a, b) {
  const pa = String(a).split('-')[0].split('.').map(Number)
  const pb = String(b).split('-')[0].split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pb[i] - pa[i]
  }
  if (a === b) return 0
  // Prerelease versions sort below their release counterpart.
  if (String(a).includes('-') && !String(b).includes('-')) return 1
  if (!String(a).includes('-') && String(b).includes('-')) return -1
  return String(b).localeCompare(String(a))
}

function listVersionDirectories(skillId) {
  const skillRoot = skillLibraryRoot(skillId)
  if (!skillRoot) return fail('invalid-skill-id', '技能 id 非法')
  if (!fs.existsSync(skillRoot)) return []
  return fs.readdirSync(skillRoot).filter(function(name) {
    return isVersionDirectory(name) && fs.statSync(path.join(skillRoot, name)).isDirectory()
  }).sort(compareVersionDirectories)
}

function resolveSkillLibraryVersion(skillId, version) {
  const safeId = safeSkillLibraryId(skillId)
  if (!safeId) return fail('invalid-skill-id', '技能 id 非法')
  const requested = String(version || '').replace(/[^A-Za-z0-9.-]/g, '')
  const versions = listVersionDirectories(safeId)
  if (versions instanceof Array && versions.length === 0) {
    return fail('skill-not-installed', '技能库中没有可用版本')
  }
  if (versions && !Array.isArray(versions) && versions.ok === false) return versions
  const selected = requested && versions.includes(requested)
    ? requested
    : (Array.isArray(versions) ? versions[0] : '')
  if (!selected) return fail('version-not-found', `技能库中没有版本 ${version || 'latest'}`)
  return ok({ skillId: safeId, version: selected, folderPath: path.join(String(skillLibraryRoot(safeId)), selected) })
}

function readPackagePreview(zipPath) {
  return listZipEntries(zipPath).then(function(listed) {
    if (!listed.ok) return listed
    const root = findSkillRoot(listed.entries)
    const rootEntries = root
      ? listed.entries.filter(entry => isUnderRoot(entry.relativePath, root))
      : listed.entries
    const manifestPath = root ? path.posix.join(root, MANIFEST_NAME) : MANIFEST_NAME
    const hasManifest = rootEntries.some(entry => entry.relativePath === manifestPath)
    if (!hasSkillEntry(rootEntries, root)) {
      return fail('skill-md-missing', '压缩包内缺少 SKILL.md 入口文件')
    }
    if (!hasManifest) {
      return ok({
        root,
        manifestPath,
        manifest: null,
        entries: rootEntries.map(function(entry) {
          return {
            path: entry.relativePath.slice(root ? root.length + 1 : 0),
            size: entry.uncompressedSize
          }
        }),
        totalBytes: listed.totalBytes
      })
    }
    return readZipTextEntries(zipPath, [manifestPath]).then(function(read) {
      if (!read.ok) return read
      const manifestText = read.files[manifestPath]
      let manifest = null
      let manifestIssues = []
      const manifestWarnings = []
      try {
        manifest = JSON.parse(manifestText)
        const protocol = inspectManifestProtocolBoundary(manifest)
        manifestIssues = protocol.issues
        manifestWarnings.push(...protocol.warnings)
      } catch (error) {
        return fail('manifest-invalid', 'skill-package.json 不是有效 JSON：' + error.message)
      }
      return ok({
        root,
        manifestPath,
        manifest,
        manifestIssues,
        manifestWarnings,
        entries: rootEntries.map(function(entry) {
          return {
            path: entry.relativePath.slice(root ? root.length + 1 : 0),
            size: entry.uncompressedSize
          }
        }),
        totalBytes: listed.totalBytes
      })
    })
  })
}

function copyZipToSkillLibrary(zipPath, skillId, version) {
  const safeId = safeSkillLibraryId(skillId)
  const safeVersion = String(version || '').replace(/[^A-Za-z0-9.-]/g, '')
  if (!safeId || !safeVersion) return Promise.resolve(fail('invalid-install-target', '技能 id 或版本非法'))

  return listZipEntries(zipPath).then(function(listed) {
    if (!listed.ok) return listed
    const root = findSkillRoot(listed.entries)
    const rootEntries = root
      ? listed.entries.filter(entry => isUnderRoot(entry.relativePath, root))
      : listed.entries
    if (!hasSkillEntry(rootEntries, root)) {
      return fail('skill-md-missing', '压缩包内缺少 SKILL.md 入口文件')
    }
    const wanted = rootEntries.map(function(entry) {
      return entry.relativePath
    })
    return readZipEntries(zipPath, wanted).then(function(read) {
      if (!read.ok) return read
      const libraryRoot = skillLibraryBase()
      const skillParent = path.join(libraryRoot, safeId)
      const installRoot = path.join(skillParent, safeVersion)
      if (!installRoot.startsWith(skillParent)) {
        return fail('invalid-install-target', '安装路径非法')
      }
      const tempRoot = path.join(
        skillParent,
        '.' + safeVersion + '.tmp-' + process.pid + '-' + Date.now()
      )
      let backupRoot = null
      try {
        fs.mkdirSync(tempRoot, { recursive: true })
        for (const rawPath of wanted) {
          const content = read.files[rawPath]
          if (content === undefined) continue
          const relative = safeRelativePath(rawPath.slice(root ? root.length + 1 : 0))
          if (!relative) continue
          const target = path.join(tempRoot, relative)
          if (!target.startsWith(tempRoot)) continue
          fs.mkdirSync(path.dirname(target), { recursive: true })
          fs.writeFileSync(target, content)
        }
        const loaded = loadSkillFolder(tempRoot)
        if (!loaded.ok) return loaded
        if (fs.existsSync(installRoot)) {
          backupRoot = tempRoot + '.backup-' + process.pid + '-' + Date.now()
          fs.renameSync(installRoot, backupRoot)
        }
        try {
          fs.renameSync(tempRoot, installRoot)
        } catch (swapError) {
          if (backupRoot && fs.existsSync(backupRoot) && !fs.existsSync(installRoot)) {
            fs.renameSync(backupRoot, installRoot)
          }
          throw swapError
        }
        if (backupRoot && fs.existsSync(backupRoot)) {
          fs.rmSync(backupRoot, { recursive: true, force: true })
        }
        return ok({ installedPath: installRoot, skill: loaded.skill })
      } catch (installError) {
        return fail('install-failed', installError.message || '技能包安装失败')
      } finally {
        if (fs.existsSync(tempRoot)) {
          fs.rmSync(tempRoot, { recursive: true, force: true })
        }
      }
    })
  })
}

function openSkillPackage() {
  return Promise.resolve(null)
}

function listInstalledVersions(skillId) {
  const versions = listVersionDirectories(skillId)
  if (versions && !Array.isArray(versions) && versions.ok === false) return versions
  if (!Array.isArray(versions)) return ok({ versions: [] })
  return ok({ versions })
}

function createZipBuffer(files) {
  const chunks = []
  const entries = Object.keys(files)
  for (const name of entries) {
    const content = Buffer.isBuffer(files[name]) ? files[name] : Buffer.from(String(files[name] ?? ''), 'utf8')
    const nameBuffer = Buffer.from(name, 'utf8')
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    // General-purpose bit 11 marks UTF-8 file names, required for Chinese entry names.
    local.writeUInt16LE(0x0800, 6)
    // Stored entries (method 0) keep resources byte-identical; the former
    // method-8 marker forced readers to deflate already-uncompressed bytes.
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(0, 14)
    local.writeUInt32LE(content.length, 18)
    local.writeUInt32LE(content.length, 22)
    local.writeUInt16LE(nameBuffer.length, 26)
    local.writeUInt16LE(0, 28)
    chunks.push(local, nameBuffer, content)
  }

  const centralChunks = []
  let offset = 0
  entries.forEach(function(name, index) {
    const content = Buffer.isBuffer(files[name]) ? files[name] : Buffer.from(String(files[name] ?? ''), 'utf8')
    const nameBuffer = Buffer.from(name, 'utf8')
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0, 14)
    // General-purpose bit 11 marks UTF-8 file names, required for Chinese entry names.
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt32LE(0, 16)
    central.writeUInt32LE(content.length, 20)
    central.writeUInt32LE(content.length, 24)
    central.writeUInt16LE(nameBuffer.length, 28)
    central.writeUInt32LE(offset, 42)
    centralChunks.push(central, nameBuffer)
    offset += 30 + nameBuffer.length + content.length
  })

  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(offset, 12)
  end.writeUInt32LE(chunks.reduce(function(total, chunk) { return total + chunk.length }, 0), 16)
  chunks.push(...centralChunks, end)
  return Buffer.concat(chunks)
}

function collectSkillDirectoryFiles(folderPath) {
  const files = {}
  const queue = [{ directory: folderPath, relativePath: '' }]
  while (queue.length > 0) {
    const current = queue.shift()
    for (const entry of fs.readdirSync(current.directory)) {
      if (entry.startsWith('.')) continue
      const fullPath = path.join(current.directory, entry)
      const stat = fs.statSync(fullPath)
      if (stat.isDirectory()) {
        const relativePath = current.relativePath ? `${current.relativePath}/${entry}` : entry
        if (safeRelativePath(relativePath)) {
          queue.push({ directory: fullPath, relativePath })
        }
        continue
      }
      if (!stat.isFile()) continue
      const relativePath = current.relativePath ? `${current.relativePath}/${entry}` : entry
      if (!safeRelativePath(relativePath)) continue
      files[relativePath] = fs.readFileSync(fullPath)
    }
  }
  return files
}

function exportSkillPackage(skillId, targetPath, version) {
  const resolved = resolveSkillLibraryVersion(skillId, version)
  if (!resolved.ok) return resolved
  try {
    const files = collectSkillDirectoryFiles(resolved.folderPath)
    const manifest = {
      schema: SKILL_PACKAGE_SCHEMA,
      id: resolved.skillId,
      version: resolved.version,
      exportedAt: new Date().toISOString()
    }
    files['skill-package.json'] = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8')
    fs.writeFileSync(targetPath, createZipBuffer(files))
    return ok({ path: targetPath, version: resolved.version, fileCount: Object.keys(files).length })
  } catch (error) {
    return fail('export-failed', error.message || '技能包导出失败')
  }
}

function loadSkillFolderFromLibrary(skillId, version) {
  const resolved = resolveSkillLibraryVersion(skillId, version)
  if (!resolved.ok) return resolved
  return loadSkillFolder(resolved.folderPath)
}

function registerSkillPackageHandlers(dialog) {
  ipcMain.handle('skillPackage:preview', function(event, zipPath) {
    if (typeof zipPath !== 'string' || !zipPath.toLowerCase().endsWith('.zip')) {
      return fail('invalid-zip-path', '请选择 .zip 技能包')
    }
    if (!fs.existsSync(zipPath)) return fail('zip-not-found', '压缩包不存在')
    return readPackagePreview(zipPath)
  })

  ipcMain.handle('skillPackage:install', function(event, zipPath, skillId, version) {
    if (typeof zipPath !== 'string' || !zipPath.toLowerCase().endsWith('.zip')) {
      return fail('invalid-zip-path', '请选择 .zip 技能包')
    }
    if (!fs.existsSync(zipPath)) return fail('zip-not-found', '压缩包不存在')
    return copyZipToSkillLibrary(zipPath, skillId, version)
  })

  ipcMain.handle('skillPackage:listVersions', function(event, skillId) {
    return listInstalledVersions(skillId)
  })

  ipcMain.handle('skillPackage:resolveVersion', function(event, skillId, version) {
    return resolveSkillLibraryVersion(skillId, version)
  })

  ipcMain.handle('skillPackage:export', function(event, skillId, targetPath, version) {
    if (typeof targetPath !== 'string' || !targetPath.toLowerCase().endsWith('.zip')) {
      return fail('invalid-export-path', '请选择 .zip 导出路径')
    }
    return exportSkillPackage(skillId, targetPath, version)
  })

  ipcMain.handle('skillPackage:openDialog', async function() {
    const result = await dialog.showOpenDialog({
      title: '选择技能包',
      properties: ['openFile'],
      filters: [{ name: '技能压缩包', extensions: ['zip'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}

module.exports = {
  registerSkillPackageHandlers,
  setSkillLibraryRoot,
  createZipBuffer,
  listZipEntries,
  findSkillRoot,
  safeRelativePath,
  readPackagePreview,
  copyZipToSkillLibrary,
  listInstalledVersions,
  exportSkillPackage,
  resolveSkillLibraryVersion
}
