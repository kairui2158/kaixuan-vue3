#!/usr/bin/env node
// Probe raw novel files before corpus ingestion: encoding, chapter markers, and malformed boundaries.

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const START = Date.now()
const DEFAULT_INPUT_DIR = 'C:/Users/凯瑞/Desktop/小说工坊'

const args = process.argv.slice(2)
const inputDir = path.resolve(args.find(arg => arg.startsWith('--input-dir='))?.slice(12) || DEFAULT_INPUT_DIR)

const CHAPTER_PATTERNS = [
  { id: 'cn-chapter', regex: /^第[0-9一二三四五六七八九十百千万零两]+章.*$/ },
  { id: 'cn-chapter-bracket', regex: /^[【\[]第[0-9一二三四五六七八九十百千万零两]+章[】\]].*$/ },
  { id: 'cn-volume-chapter', regex: /^第[0-9一二三四五六七八九十百千万零两]+卷[^\n]{0,30}第[0-9一二三四五六七八九十百千万零两]+章.*$/ },
  { id: 'arabic-chapter-label', regex: /^[Cc]hapter\s+[0-9]+.*$/ },
  { id: 'numeric-heading', regex: /^[0-9]{1,4}[、.．]\s*\S+.*$/ }
]

function decode(buffer) {
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buffer), encoding: 'utf-8' }
  } catch (utf8Error) {
    try {
      return { text: new TextDecoder('gb18030').decode(buffer), encoding: 'gb18030' }
    } catch (gbError) {
      throw new Error(`decode failed: utf8=${utf8Error.message}; gb18030=${gbError.message}`)
    }
  }
}

function countMatches(lines, regex) {
  const matches = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (regex.test(line)) matches.push({ lineNumber: index + 1, line })
  }
  return matches
}

function summarize(line) {
  return line.length > 80 ? `${line.slice(0, 77)}...` : line
}

function probeFile(filePath) {
  const stat = fs.statSync(filePath, { throwIfNoEntry: false })
  if (!stat?.isFile()) throw new Error(`missing input file: ${filePath}`)
  const buffer = fs.readFileSync(filePath)
  const { text, encoding } = decode(buffer)
  const lines = text.split(/\r?\n/)
  const nonEmptyLines = lines.map((line, index) => ({ lineNumber: index + 1, line })).filter(item => item.line.trim().length > 0)

  const patterns = CHAPTER_PATTERNS.map(pattern => ({
    id: pattern.id,
    count: countMatches(lines, pattern.regex).length,
    first: countMatches(lines, pattern.regex).slice(0, 5)
  }))

  const looseMatches = []
  for (const item of nonEmptyLines) {
    if (/第[0-9一二三四五六七八九十百千万零两]{1,20}章/.test(item.line)) {
      looseMatches.push({ lineNumber: item.lineNumber, line: summarize(item.line.trim()) })
      if (looseMatches.length >= 20) break
    }
  }

  return {
    file: path.basename(filePath),
    bytes: stat.size,
    encoding,
    totalLines: lines.length,
    nonEmptyLines: nonEmptyLines.length,
    head: nonEmptyLines.slice(0, 12).map(item => ({ lineNumber: item.lineNumber, line: summarize(item.line.trim()) })),
    patterns,
    looseChapterLikeLines: looseMatches
  }
}

try {
  const entries = fs.readdirSync(inputDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.txt'))
    .map(entry => path.join(inputDir, entry.name))
    .sort()
  if (!entries.length) throw new Error(`no txt files found under ${inputDir}`)
  const reports = entries.map(probeFile)
  console.log(JSON.stringify({ phase: 'probe-finished', elapsedMs: Date.now() - START, files: reports }, null, 2))
} catch (error) {
  console.error(JSON.stringify({ phase: 'probe-failed', message: error.message, stack: error.stack }, null, 2))
  process.exitCode = 1
}
