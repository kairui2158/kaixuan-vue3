import fs from 'node:fs'
import path from 'node:path'

const corpus = 'D:/codex/deai-corpus'
const labelPath = path.join(corpus, 'labels/human-negative.jsonl')
const oldAuthorRoot = path.join(corpus, 'sources/human/authors/%E6%9C%AA%E7%9F%A5%E4%BD%9C%E8%80%85/works')
const anonymousEntries = [
  { work: '致命偏宠', authorDir: '作者a', author: '作者A' },
  { work: '最强反套路系统', authorDir: '作者b', author: '作者B' }
]

function readJsonl(filePath) {
  return fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/).map(line => JSON.parse(line))
}

function writeJsonl(filePath, records) {
  fs.writeFileSync(filePath, records.map(record => JSON.stringify(record)).join('\n') + '\n')
}

const originalLabels = readJsonl(labelPath)
if (originalLabels.length !== 6494) {
  throw new Error(`unexpected label count: ${originalLabels.length}`)
}

const replacementByWork = new Map(anonymousEntries.map(entry => [entry.work, entry]))
const updatedLabels = originalLabels.map(record => {
  const entry = replacementByWork.get(record.work)
  if (!entry) return record
  if (record.author !== '未知作者' || record.authorVerified !== false) {
    throw new Error(`unexpected source identity for ${record.work}: ${record.author}/${record.authorVerified}`)
  }
  return {
    ...record,
    author: entry.author,
    authorIdentity: 'anonymous-user-designated',
    authorVerified: true
  }
})

for (const entry of anonymousEntries) {
  const oldFile = path.join(oldAuthorRoot, encodeURIComponent(entry.work), 'chapters.jsonl')
  const newFile = path.join(
    corpus,
    'sources/human/authors',
    encodeURIComponent(entry.authorDir),
    'works',
    encodeURIComponent(entry.work),
    'chapters.jsonl'
  )
  const sourceRecords = readJsonl(oldFile)
  if (sourceRecords.length !== 100) {
    throw new Error(`unexpected source count for ${entry.work}: ${sourceRecords.length}`)
  }

  const updatedSource = sourceRecords.map(record => {
    if (record.author !== '未知作者' || record.authorVerified !== false || record.work !== entry.work) {
      throw new Error(`source identity mismatch: ${record.author}/${record.authorVerified}/${record.work}`)
    }
    return {
      ...record,
      author: entry.author,
      authorIdentity: 'anonymous-user-designated',
      authorVerified: true
    }
  })

  fs.mkdirSync(path.dirname(newFile), { recursive: true })
  writeJsonl(newFile, updatedSource)

  const labelIds = new Set(updatedLabels.filter(record => record.work === entry.work).map(record => record.id))
  const sourceIds = new Set(updatedSource.map(record => record.id))
  if (labelIds.size !== 100 || sourceIds.size !== 100) {
    throw new Error(`count mismatch for ${entry.work}: labels=${labelIds.size}, source=${sourceIds.size}`)
  }
  for (const id of labelIds) {
    if (!sourceIds.has(id)) throw new Error(`missing source id for ${entry.work}: ${id}`)
  }
}

writeJsonl(labelPath, updatedLabels)
fs.rmSync(path.join(corpus, 'sources/human/authors/%E6%9C%AA%E7%9F%A5%E4%BD%9C%E8%80%85'), {
  recursive: true,
  force: true
})

const manifestPath = path.join(corpus, 'manifest.json')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const source = manifest.sources.find(item => item.id === 'user-provided-raw-novels')
if (!source) throw new Error('manifest source not found: user-provided-raw-novels')

source.authors = [...new Set([...source.authors.filter(author => author !== '未知作者'), '作者A', '作者B'])]
source.authorVerified = true
source.authorIdentity = 'two user-designated anonymous identities (作者A, 作者B); identities are stable corpus IDs, not real-name verification claims'
manifest.gaps.authorDiversity = '10 independent corpus author identities (8 real-name plus 2 user-designated anonymous identities); anonymous identities are stable source IDs, not real-name verification claims'
manifest.updatedAt = '2026-10-30T00:00:00+08:00'
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

console.log('migration complete', {
  labels: updatedLabels.length,
  replaced: updatedLabels.filter(record => record.authorIdentity === 'anonymous-user-designated').length,
  works: anonymousEntries.map(entry => entry.work),
  manifestAuthors: source.authors
})
