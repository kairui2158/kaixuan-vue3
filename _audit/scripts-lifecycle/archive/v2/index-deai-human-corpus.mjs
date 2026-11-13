#!/usr/bin/env node
// Build the human-negative corpus index from the local book library.
// Read-only against source texts; writes only to the external DEAI corpus.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import process from 'node:process'

const DEFAULT_LIBRARY_ROOT = 'D:/codex/拆文库'
const DEFAULT_CORPUS_ROOT = 'D:/codex/deai-corpus'
const DEFAULT_REPORT_PATH = 'D:/codex/deai-corpus/calibration/reports/human-negative-index.json'
const START = Date.now()

const args = process.argv.slice(2)
const options = {
  libraryRoot: path.resolve(args.find(a => a.startsWith('--library-root='))?.slice(15) || DEFAULT_LIBRARY_ROOT),
  corpusRoot: path.resolve(args.find(a => a.startsWith('--corpus-root='))?.slice(13) || DEFAULT_CORPUS_ROOT),
  reportPath: path.resolve(args.find(a => a.startsWith('--report='))?.slice(9) || DEFAULT_REPORT_PATH),
  dryRun: args.includes('--dry-run')
}

const stats = {
  scannedAuthors: 0,
  works: 0,
  indexedChapters: 0,
  skipped: {},
  duplicates: 0
}
const performanceMarks = { readSourceMs: 0, parseChaptersMs: 0 }
const records = []
const seenIds = new Set()

function log(phase, data = {}) {
  console.log(JSON.stringify({ phase, elapsedMs: Date.now() - START, ...data }))
}

function fail(message, detail) {
  console.error(JSON.stringify({ phase: 'failed', message, detail: detail ? String(detail) : undefined }, null, 2))
  process.exitCode = 1
}

function skip(reason) {
  stats.skipped[reason] = (stats.skipped[reason] || 0) + 1
}

function normalizeId(value) {
  const encoded = encodeURIComponent(String(value || 'unknown').trim().toLowerCase())
  return encoded || 'unknown'
}

function parseCsvLine(line) {
  const output = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') { current += '"'; i += 1 } else quoted = false
      } else current += char
    } else if (char === '"') quoted = true
    else if (char === ',') { output.push(current); current = '' }
    else current += char
  }
  output.push(current)
  return output
}

function extractChapter(lines, startLine, endLine) {
  const start = Math.max(0, Number(startLine) - 1)
  const end = Math.min(lines.length, Number(endLine))
  return lines.slice(start, end).join('\n').trim()
}

function indexWork(authorDir, workDir) {
  const indexPath = path.join(workDir, 'chapter_index.csv')
  const sourcePath = path.join(workDir, '原文', '原文.txt')
  if (!fs.statSync(indexPath, { throwIfNoEntry: false })?.isFile()) {
    skip('work-missing-chapter-index')
    return
  }
  if (!fs.statSync(sourcePath, { throwIfNoEntry: false })?.isFile()) {
    skip('work-missing-source-text')
    return
  }
  const source = fs.readFileSync(sourcePath, 'utf8')
  const readSourceStartedAt = Date.now()
  const sourceHash = crypto.createHash('sha256').update(source, 'utf8').digest('hex')
  const lines = source.split(/\r?\n/)
  performanceMarks.readSourceMs += Date.now() - readSourceStartedAt
  const csv = fs.readFileSync(indexPath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean)
  const headers = parseCsvLine(csv[0])
  const positionOf = name => headers.indexOf(name)
  const col = Object.fromEntries(['chapter', 'title', 'start_line', 'end_line', 'char_count', 'status', 'chapter_sha256', 'source_sha256'].map(name => [name, positionOf(name)]))
  if (Object.values(col).some(index => index < 0)) {
    skip('chapter-index-unexpected-schema')
    return
  }
  stats.works += 1
  const author = path.basename(authorDir)
  const work = path.basename(workDir)
  const parseChaptersStartedAt = Date.now()
  for (const line of csv.slice(1)) {
    const values = parseCsvLine(line)
    if (values[col.status] !== 'ok') {
      skip('chapter-status-not-ok')
      continue
    }
    const endLine = Number(values[col.end_line])
    if (!Number.isInteger(endLine) || endLine < 0 || endLine > lines.length) {
      skip('chapter-line-range-invalid')
      continue
    }
    const chapterNumber = Number(values[col.chapter])
    const title = values[col.title]
    const body = extractChapter(lines, values[col.start_line], endLine)
    const nonWhitespace = body.replace(/\s/g, '').length
    if (nonWhitespace < 1500 || nonWhitespace > 6000) {
      skip('chapter-char-count-out-of-range')
      continue
    }
    const id = crypto.createHash('sha256')
      .update(`${sourceHash}|${values[col.chapter]}|${values[col.start_line]}|${endLine}`)
      .digest('hex')
    if (seenIds.has(id)) {
      stats.duplicates += 1
      continue
    }
    seenIds.add(id)
    const record = {
      id,
      author,
      work,
      chapter: Number.isInteger(chapterNumber) ? chapterNumber : null,
      title,
      charCount: nonWhitespace,
      sourcePath: sourcePath,
      sourceLineRange: [Number(values[col.start_line]), endLine],
      sourceSha256: sourceHash,
      chapterSha256: values[col.chapter_sha256],
      authorization: 'confirmed',
      text: body
    }
    records.push(record)
    stats.indexedChapters += 1
  }
  performanceMarks.parseChaptersMs += Date.now() - parseChaptersStartedAt
}

function writeOutputs() {
  const report = {
    reportVersion: 1,
    generatedAt: new Date().toISOString(),
    libraryRoot: options.libraryRoot,
    corpusRoot: options.corpusRoot,
    stats,
    authors: [...new Set(records.map(r => r.author))],
    works: [...new Set(records.map(r => `${r.author}/${r.work}`))],
    records: records.map(({ text, ...record }) => record)
  }
  fs.mkdirSync(path.dirname(options.reportPath), { recursive: true })
  fs.writeFileSync(options.reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  const labelPath = path.join(options.corpusRoot, 'labels', 'human-negative.jsonl')
  fs.mkdirSync(path.dirname(labelPath), { recursive: true })
  const labelLines = records.map(({ text, ...record }) => JSON.stringify({
    id: record.id,
    label: 'human-negative',
    labelSource: 'local-library-index',
    authorization: record.authorization,
    author: record.author,
    work: record.work,
    chapter: record.chapter,
    title: record.title,
    charCount: record.charCount,
    sourcePath: record.sourcePath
  }))
  fs.writeFileSync(labelPath, `${labelLines.join('\n')}${labelLines.length ? '\n' : ''}`, 'utf8')

  if (!options.dryRun) {
    const worksDir = path.join(options.corpusRoot, 'sources', 'human', 'authors')
    for (const record of records) {
      const workDir = path.join(worksDir, normalizeId(record.author), 'works', normalizeId(record.work))
      fs.mkdirSync(workDir, { recursive: true })
      fs.appendFileSync(path.join(workDir, 'chapters.jsonl'), `${JSON.stringify(record)}\n`, 'utf8')
    }
  }
}

try {
  log('start', options)
  if (!fs.statSync(options.libraryRoot, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`library root not found: ${options.libraryRoot}`)
  }
  const authorDirs = fs.readdirSync(options.libraryRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('_') && !entry.name.startsWith('.'))
    .map(entry => path.join(options.libraryRoot, entry.name))
    .sort()
  for (const authorDir of authorDirs) {
    stats.scannedAuthors += 1
    const candidateWorkDirs = [authorDir]
    const benchmarkRoot = path.join(authorDir, '.novel', 'benchmarks', path.basename(authorDir))
    const nestedWorkDirs = fs.statSync(benchmarkRoot, { throwIfNoEntry: false })?.isDirectory()
      ? fs.readdirSync(benchmarkRoot, { withFileTypes: true })
          .filter(entry => entry.isDirectory())
          .map(entry => path.join(benchmarkRoot, entry.name))
          .filter(workDir => fs.statSync(path.join(workDir, 'chapter_index.csv'), { throwIfNoEntry: false })?.isFile())
          .sort()
      : []
    for (const workDir of [...candidateWorkDirs, ...nestedWorkDirs]) indexWork(authorDir, workDir)
  }
  if (!options.dryRun) writeOutputs()
  log('finished', { ...stats, performanceMarks })
} catch (error) {
  fail(error.message, error.stack)
} finally {
  if (process.exitCode) log('failed')
}
