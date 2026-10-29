#!/usr/bin/env node
// Ingest user-provided raw novel txt files into the DEAI human-negative corpus.
// Read-only against source texts; appends idempotently to the external corpus.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import process from 'node:process'

const START = Date.now()
const DEFAULT_INPUT_DIR = 'C:/Users/凯瑞/Desktop/小说工坊'
const DEFAULT_CORPUS_ROOT = 'D:/codex/deai-corpus'
const CHAPTER_PATTERN = /^第[0-9一二三四五六七八九十百千万零两]+章.*$/
const SAMPLE_PER_WORK = 100
const MIN_CHAPTER_CHARS = 1500
const MAX_CHAPTER_CHARS = 6000
const SEED = 20261029

const args = process.argv.slice(2)
const options = {
  inputDir: path.resolve(args.find(arg => arg.startsWith('--input-dir='))?.slice(12) || DEFAULT_INPUT_DIR),
  corpusRoot: path.resolve(args.find(arg => arg.startsWith('--corpus-root='))?.slice(14) || DEFAULT_CORPUS_ROOT),
  perWork: Number(args.find(arg => arg.startsWith('--per-work='))?.slice(11) || SAMPLE_PER_WORK),
  dryRun: args.includes('--dry-run')
}

const WORK_METADATA = [
  { file: '大奉打更人.txt', work: '大奉打更人', author: '卖报小郎君', authorVerified: true, genre: '玄幻' },
  { file: '黎明之剑.txt', work: '黎明之剑', author: '远瞳', authorVerified: true, genre: '西幻' },
  { file: '全球高武.txt', work: '全球高武', author: '老鹰吃小鸡', authorVerified: true, genre: '都市高武' },
  { file: '全职高手.txt', work: '全职高手', author: '蝴蝶蓝', authorVerified: true, genre: '游戏竞技' },
  { file: '神秘复苏.txt', work: '神秘复苏', author: '佛前献花', authorVerified: true, genre: '悬疑灵异' },
  { file: '圣墟.txt', work: '圣墟', author: '辰东', authorVerified: true, genre: '玄幻' },
  { file: '我有一座冒险屋.txt', work: '我有一座冒险屋', author: '我会修空调', authorVerified: true, genre: '悬疑灵异' },
  { file: '致命偏宠.txt', work: '致命偏宠', author: '未知作者', authorVerified: false, genre: '言情' },
  { file: '最强反套路系统.txt', work: '最强反套路系统', author: '未知作者', authorVerified: false, genre: '都市脑洞' }
]

function log(phase, data = {}) {
  console.log(JSON.stringify({ phase, elapsedMs: Date.now() - START, ...data }))
}

function fail(message) {
  console.error(JSON.stringify({ phase: 'failed', message }, null, 2))
  process.exit(1)
}

function normalizeId(value) {
  return encodeURIComponent(String(value || 'unknown').trim().toLowerCase()) || 'unknown'
}

function decode(buffer, file) {
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buffer), encoding: 'utf-8' }
  } catch (utf8Error) {
    try {
      return { text: new TextDecoder('gb18030').decode(buffer), encoding: 'gb18030' }
    } catch (gb18030Error) {
      fail(`decode failed for ${file}: utf8=${utf8Error.message}; gb18030=${gb18030Error.message}`)
      return null
    }
  }
}

function mulberry32(seed) {
  let state = seed >>> 0
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function splitChapters(lines, file) {
  const headers = []
  for (let index = 0; index < lines.length; index += 1) {
    if (CHAPTER_PATTERN.test(lines[index].trim())) headers.push(index)
  }
  if (headers.length < 50) fail(`unexpected chapter count for ${file}: ${headers.length}`)

  const chapters = []
  for (let i = 0; i < headers.length; i += 1) {
    const start = headers[i]
    const end = i + 1 < headers.length ? headers[i + 1] : lines.length
    const title = lines[start].trim()
    const body = lines.slice(start + 1, end).join('\n').trim()
    const nonWhitespace = body.replace(/\s/g, '').length
    if (nonWhitespace < MIN_CHAPTER_CHARS || nonWhitespace > MAX_CHAPTER_CHARS) continue
    const chapterNumberMatch = title.match(/^第([0-9一二三四五六七八九十百千万零两]+)章/)
    const chapterNumber = Number(chapterNumberMatch?.[1])
    chapters.push({
      order: chapters.length,
      chapter: Number.isInteger(chapterNumber) ? chapterNumber : null,
      title,
      body,
      charCount: nonWhitespace,
      sourceLineRange: [start + 1, end]
    })
  }
  if (chapters.length < options.perWork) {
    fail(`eligible chapters for ${file} below requested sample: ${chapters.length}`)
  }
  return { headerCount: headers.length, chapters }
}

function sampleDeterministic(chapters, count, work) {
  const random = mulberry32(SEED + work.length * 31)
  const pool = [...chapters]
  const sampled = []
  for (let i = 0; i < count; i += 1) {
    if (!pool.length) break
    const position = Math.floor(random() * pool.length)
    sampled.push(pool.splice(position, 1)[0])
  }
  return sampled
}

function readJsonLines(filePath) {
  const records = new Set()
  if (!fs.statSync(filePath, { throwIfNoEntry: false })?.isFile()) return records
  const source = fs.readFileSync(filePath, 'utf8')
  let line = 0
  for (const item of source.split('\n')) {
    if (!item.trim()) continue
    line += 1
    try {
      records.add(JSON.parse(item).id)
    } catch (error) {
      fail(`invalid existing JSONL at ${filePath}:${line}: ${error.message}`)
    }
  }
  return records
}

function writeOutputs(entries, stats) {
  if (!entries.length) fail('no entries to write')
  const labelPath = path.join(options.corpusRoot, 'labels', 'human-negative.jsonl')
  const existingIds = readJsonLines(labelPath)
  const newEntries = entries.filter(entry => !existingIds.has(entry.id))
  stats.duplicates = entries.length - newEntries.length

  if (!options.dryRun) {
    if (newEntries.length) {
      const labelLines = newEntries.map(entry => JSON.stringify({
        id: entry.id,
        label: 'human-negative',
        labelSource: 'user-provided-raw-txt',
        authorization: entry.authorization,
        author: entry.author,
        authorVerified: entry.authorVerified,
        work: entry.work,
        genre: entry.genre,
        chapter: entry.chapter,
        title: entry.title,
        charCount: entry.charCount,
        sourcePath: entry.sourcePath
      }))
      fs.appendFileSync(labelPath, `${labelLines.join('\n')}\n`, 'utf8')

      const worksRoot = path.join(options.corpusRoot, 'sources', 'human', 'authors')
      for (const entry of newEntries) {
        const workDir = path.join(worksRoot, normalizeId(entry.author), 'works', normalizeId(entry.work))
        fs.mkdirSync(workDir, { recursive: true })
        fs.appendFileSync(path.join(workDir, 'chapters.jsonl'), `${JSON.stringify(entry)}\n`, 'utf8')
      }
    }
  }

  const report = {
    reportVersion: 2,
    generatedAt: new Date().toISOString(),
    inputRoot: options.inputDir,
    corpusRoot: options.corpusRoot,
    rules: {
      chapterHeader: '^第N章 at line start after trim',
      eligibility: `${MIN_CHAPTER_CHARS}-${MAX_CHAPTER_CHARS} non-whitespace chars`,
      samplePerWork: options.perWork,
      seed: SEED,
      sampling: 'deterministic mulberry32 from eligible chapters'
    },
    stats,
    works: entries.reduce((acc, entry) => {
      const key = `${entry.author}/${entry.work}`
      if (!acc[key]) {
        acc[key] = { author: entry.author, authorVerified: entry.authorVerified, work: entry.work, genre: entry.genre, accepted: 0 }
      }
      acc[key].accepted += 1
      return acc
    }, {}),
    records: entries.map(({ body, ...entry }) => entry)
  }
  const reportPath = path.join(options.corpusRoot, 'calibration', 'reports', 'human-negative-raw-novels.json')
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return { newEntries, reportPath }
}

function updateManifest(reportStats) {
  const manifestPath = path.join(options.corpusRoot, 'manifest.json')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  manifest.manifestVersion = 2
  const rawSource = manifest.sources.find(source => source.id === 'user-provided-raw-novels')
  const source = rawSource ?? { id: 'user-provided-raw-novels', type: 'human-negative' }
  source.sourceType = 'user-provided-raw-txt'
  source.scope = 'local-development-calibration'
  source.authorization = 'confirmed'
  source.reportPath = 'calibration/reports/human-negative-raw-novels.json'
  source.authors = reportStats.authors
  source.authorVerified = reportStats.authorVerified
  source.works = reportStats.works
  source.genres = reportStats.genres
  source.chapterCount = reportStats.accepted
  source.sampling = { perWork: options.perWork, seed: SEED }
  if (!rawSource) manifest.sources.push(source)
  manifest.updatedAt = new Date().toISOString()
  manifest.gaps.authorDiversity = `multi-author corpus present (${reportStats.authors.length} author identities); two works still use unverified author placeholders`
  manifest.gaps.genreDiversity = `multi-genre corpus present (${reportStats.genres.length} genres)`
  manifest.gaps.modelDiversity = 'only one provider/model (deepseek-v4-pro); recall conclusions remain model-scoped'
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

try {
  log('start', options)
  if (!fs.statSync(options.inputDir, { throwIfNoEntry: false })?.isDirectory()) fail(`input dir not found: ${options.inputDir}`)
  if (!Number.isInteger(options.perWork) || options.perWork < 50 || options.perWork > 200) fail(`invalid --per-work: ${options.perWork}`)

  const stats = { scannedFiles: 0, accepted: 0, eligibleChapters: 0, headerChapters: 0, skipped: {}, duplicates: 0 }
  const entries = []
  for (const metadata of WORK_METADATA) {
    const filePath = path.join(options.inputDir, metadata.file)
    const stat = fs.statSync(filePath, { throwIfNoEntry: false })
    if (!stat?.isFile()) fail(`missing source file: ${filePath}`)
    stats.scannedFiles += 1
    const decoded = decode(fs.readFileSync(filePath), metadata.file)
    const lines = decoded.text.split(/\r?\n/)
    const { headerCount, chapters } = splitChapters(lines, metadata.file)
    stats.headerChapters += headerCount
    stats.eligibleChapters += chapters.length
    if (chapters.length < options.perWork) fail(`sample pool too small for ${metadata.file}`)
    const sampled = sampleDeterministic(chapters, options.perWork, metadata.work)
    for (const chapter of sampled) {
      const id = crypto.createHash('sha256').update(`${metadata.work}|${chapter.title}|${chapter.charCount}|${chapter.body}`).digest('hex')
      entries.push({
        id,
        author: metadata.author,
        authorVerified: metadata.authorVerified,
        work: metadata.work,
        genre: metadata.genre,
        chapter: chapter.chapter,
        title: chapter.title,
        charCount: chapter.charCount,
        sourcePath: filePath,
        sourceLineRange: chapter.sourceLineRange,
        sourceEncoding: decoded.encoding,
        authorization: 'confirmed',
        text: chapter.body
      })
    }
  }
  stats.accepted = entries.length
  const { newEntries, reportPath } = writeOutputs(entries, stats)
  if (!options.dryRun) {
    updateManifest({
      authors: [...new Set(entries.map(entry => entry.author))],
      authorVerified: entries.every(entry => entry.authorVerified),
      works: [...new Set(entries.map(entry => entry.work))],
      genres: [...new Set(entries.map(entry => entry.genre))],
      accepted: stats.accepted
    })
  }
  log('finished', { ...stats, newEntries: newEntries.length, reportPath, dryRun: options.dryRun })
} catch (error) {
  console.error(JSON.stringify({ phase: 'failed', message: error.message, stack: error.stack }, null, 2))
  process.exitCode = 1
}
