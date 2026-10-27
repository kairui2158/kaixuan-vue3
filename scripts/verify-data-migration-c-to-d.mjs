import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const pairs = [
  {
    source: 'C:/Users/凯瑞/Documents/神意助手数据',
    target: 'D:/神意助手数据',
  },
  {
    source: 'C:/Users/凯瑞/Documents/写作助手数据',
    target: 'D:/神意助手数据/_legacy',
  },
  {
    source: 'C:/Users/凯瑞/AppData/Roaming/shenyi-assistant',
    target: 'D:/神意助手数据/_app-user-data',
  },
]

// The migration contract protects durable business data. Runtime files are
// allowed to differ after the D-drive application has already run.
const mutableRelative = new Set([
  '.migrated',
  'storage-corruption.log',
])
const mutableTargetPrefixes = [
  '_app-data/',
  '_app-logs/',
]
const mutableUserDataRelative = new Set([
  'Code Cache/js/index-dir/the-real-index',
  'DawnGraphiteCache/data_1',
  'DawnGraphiteCache/index',
  'DawnWebGPUCache/data_1',
  'DawnWebGPUCache/index',
  'GPUCache/data_1',
  'GPUCache/index',
  'Local Storage/leveldb/000004.log',
  'Local Storage/leveldb/LOG',
  'Local Storage/leveldb/LOG.old',
  'logs/main.log',
  'logs/renderer-2026-10-27.jsonl',
  'window-state-1.json',
])

function isMutable(pair, relative, side) {
  if (pair.target.endsWith('_app-user-data')) {
    return side === 'target' || mutableUserDataRelative.has(relative)
  }
  if (side === 'target') return mutableTargetPrefixes.some(prefix => relative.startsWith(prefix))
  return mutableRelative.has(relative)
}

function walk(root, relative = '', output = new Map()) {
  const absolute = path.join(root, relative)
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const childRelative = relative ? `${relative}/${entry.name}` : entry.name
    if (entry.isDirectory()) walk(root, childRelative, output)
    else if (entry.isFile()) output.set(childRelative, fs.statSync(path.join(root, childRelative)).size)
  }
  return output
}

function directoryExists(root) {
  try {
    return fs.statSync(root).isDirectory()
  } catch (e) {
    return false
  }
}

function hashFile(filePath) {
  const hash = createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

const reports = []
for (const pair of pairs) {
  if (!directoryExists(pair.source)) {
    const targetFiles = walk(pair.target)
    reports.push({
      source: pair.source,
      target: pair.target,
      sourceExists: false,
      targetFiles: targetFiles.size,
      differences: [],
      extra: [],
    })
    continue
  }
  const sourceFiles = walk(pair.source)
  const targetFiles = walk(pair.target)
  const differences = []
  for (const relative of sourceFiles.keys()) {
    const sourcePath = path.join(pair.source, relative)
    const targetPath = path.join(pair.target, relative)
    if (!fs.existsSync(targetPath)) {
      if (isMutable(pair, relative, 'source')) continue
      differences.push({ relative, reason: 'missing_in_target' })
      continue
    }
    if (isMutable(pair, relative, 'source')) continue
    const sourceHash = hashFile(sourcePath)
    const targetHash = hashFile(targetPath)
    if (sourceHash !== targetHash) {
      differences.push({
        relative,
        reason: 'hash_mismatch',
        source: sourceHash,
        target: targetHash,
      })
    }
  }
  const extra = [...targetFiles.keys()]
    .filter(relative => !sourceFiles.has(relative))
    .filter(relative => !isMutable(pair, relative, 'target'))
    .map(relative => ({ relative, reason: 'extra_in_target' }))
  reports.push({
    source: pair.source,
    target: pair.target,
    sourceFiles: sourceFiles.size,
    targetFiles: targetFiles.size,
    differences,
    extra,
  })
}

const result = {
  ok: reports.every(report => report.sourceExists === false
    ? report.targetFiles > 0
    : report.differences.length === 0),
  reports: reports.map(report => ({
    ...report,
    differences: report.differences.slice(0, 50),
    differencesCount: report.differences.length,
    extra: report.extra.slice(0, 50),
    extraCount: report.extra.length,
  })),
}
console.log(JSON.stringify(result, null, 2))
process.exitCode = result.ok ? 0 : 1
