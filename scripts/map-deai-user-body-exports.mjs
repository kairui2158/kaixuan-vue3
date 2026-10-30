#!/usr/bin/env node
// Map user-exported body text back to harvested model-positive samples.
// Read-only: this script never modifies corpus sources or labels.

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_CORPUS_ROOT = 'D:/codex/deai-corpus'
const DEFAULT_REPORT_PATH = 'D:/codex/deai-corpus/calibration/reports/user-body-export-mapping.json'
const NGRAM_SIZE = 12
const INTERVAL_GAP = 3
const PREVIEW_LENGTH = 120
const START = Date.now()

const args = process.argv.slice(2)
const options = {
  corpusRoot: path.resolve(valueOf('corpus-root') || DEFAULT_CORPUS_ROOT),
  reportPath: path.resolve(valueOf('report') || DEFAULT_REPORT_PATH),
  exports: args.filter(arg => arg.startsWith('--export=')).map(arg => path.resolve(arg.slice('--export='.length)))
}

function valueOf(name) {
  const prefix = `--${name}=`
  return args.find(arg => arg.startsWith(prefix))?.slice(prefix.length)
}

function log(phase, data = {}) {
  console.log(JSON.stringify({ phase, elapsedMs: Date.now() - START, ...data }))
}

function fail(message, detail) {
  console.error(JSON.stringify({ phase: 'failed', message, detail: detail ? String(detail) : undefined }, null, 2))
  process.exitCode = 1
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
}

function bodyOnly(value) {
  const marker = '\u3010\u6b63\u6587\u4ea4\u63a5\u3011'
  const index = String(value || '').indexOf(marker)
  return index === -1 ? String(value || '') : String(value).slice(0, index)
}

function ngrams(value) {
  const result = []
  for (let index = 0; index + NGRAM_SIZE <= value.length; index += 1) {
    result.push(value.slice(index, index + NGRAM_SIZE))
  }
  return result
}

function preview(value, start, end) {
  return value.slice(start, Math.min(end, start + PREVIEW_LENGTH))
}

function intervalsFromIndexes(indexes) {
  const result = []
  let current = null
  for (const index of indexes) {
    if (!current) {
      current = { start: index, end: index }
      continue
    }
    if (index - current.end <= INTERVAL_GAP) current.end = index
    else {
      result.push(current)
      current = { start: index, end: index }
    }
  }
  if (current) result.push(current)
  return result
}

function toIntervalRecord(normalized, interval) {
  const charStart = interval.start
  const charEnd = Math.min(normalized.length, interval.end + NGRAM_SIZE)
  return {
    normalizedStart: charStart,
    normalizedEnd: charEnd,
    normalizedLength: charEnd - charStart,
    preview: preview(normalized, charStart, charEnd)
  }
}

function collectSampleFiles(root) {
  const modelRoot = path.join(root, 'sources', 'model')
  if (!fs.statSync(modelRoot, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`model source root not found: ${modelRoot}`)
  }
  const files = []
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(target)
      else if (entry.isFile() && entry.name === 'samples.jsonl') files.push(target)
    }
  }
  walk(modelRoot)
  return files.sort()
}

function loadSamples(files) {
  const samples = []
  const seenIds = new Set()
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean)
    lines.forEach((line, index) => {
      let record
      try {
        record = JSON.parse(line)
      } catch (error) {
        throw new Error(`invalid JSON in ${file}:${index + 1}: ${error.message}`)
      }
      if (!record.id || typeof record.text !== 'string') {
        throw new Error(`missing id/text in ${file}:${index + 1}`)
      }
      if (seenIds.has(record.id)) throw new Error(`duplicate sample id across corpus: ${record.id}`)
      seenIds.add(record.id)
      const normalized = normalizeText(bodyOnly(record.text))
      samples.push({
        id: record.id,
        provider: record.provider,
        model: record.model,
        generationStep: record.generationStep,
        tracePath: record.tracePath,
        payloadRef: record.payloadRef,
        samplePath: file,
        normalized,
        ngramSet: new Set(ngrams(normalized))
      })
    })
  }
  return { samples, uniqueIdCount: seenIds.size }
}

function mapExport(exportPath, samples) {
  if (!fs.statSync(exportPath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`export file not found: ${exportPath}`)
  }
  const raw = fs.readFileSync(exportPath, 'utf8')
  const normalized = normalizeText(bodyOnly(raw))
  const exportNgrams = ngrams(normalized)
  const exportSet = new Set(exportNgrams)
  const ngramOwners = new Map()
  const sampleStats = samples.map(sample => {
    let exportMatched = 0
    let sampleMatched = 0
    const matchedIndexes = []
    exportNgrams.forEach((ngram, index) => {
      if (sample.ngramSet.has(ngram)) {
        exportMatched += 1
        matchedIndexes.push(index)
      }
    })
    for (const ngram of sample.ngramSet) {
      if (exportSet.has(ngram)) sampleMatched += 1
    }
    for (const ngram of sample.ngramSet) {
      if (!ngramOwners.has(ngram)) ngramOwners.set(ngram, [])
      ngramOwners.get(ngram).push(sample.id)
    }
    return {
      sampleId: sample.id,
      provider: sample.provider,
      model: sample.model,
      generationStep: sample.generationStep,
      tracePath: sample.tracePath,
      payloadRef: sample.payloadRef,
      exportNgramMatches: exportMatched,
      exportCoverage: exportNgrams.length ? exportMatched / exportNgrams.length : 0,
      sampleNgramCount: sample.ngramSet.size,
      sampleCoverage: sample.ngramSet.size ? sampleMatched / sample.ngramSet.size : 0,
      matchedIntervals: intervalsFromIndexes(matchedIndexes).map(interval => toIntervalRecord(normalized, interval))
    }
  })

  const unmatchedIndexes = []
  exportNgrams.forEach((ngram, index) => {
    if (!ngramOwners.has(ngram)) unmatchedIndexes.push(index)
  })
  const matchedCount = exportNgrams.length - unmatchedIndexes.length
  const ranked = sampleStats
    .filter(item => item.exportNgramMatches > 0)
    .sort((a, b) => b.exportNgramMatches - a.exportNgramMatches || a.sampleId.localeCompare(b.sampleId))

  return {
    exportPath,
    rawCharCount: raw.length,
    normalizedCharCount: normalized.length,
    ngramCount: exportNgrams.length,
    matchedNgramCount: matchedCount,
    unmatchedNgramCount: unmatchedIndexes.length,
    coverage: exportNgrams.length ? matchedCount / exportNgrams.length : 0,
    matchedSamples: ranked,
    unmatchedIntervals: intervalsFromIndexes(unmatchedIndexes).map(interval => toIntervalRecord(normalized, interval))
  }
}

try {
  log('start', { ...options, exportCount: options.exports.length })
  if (!options.exports.length) throw new Error('at least one --export=<file> is required')
  const files = collectSampleFiles(options.corpusRoot)
  const { samples, uniqueIdCount } = loadSamples(files)
  if (!samples.length) throw new Error(`no model-positive samples found under ${options.corpusRoot}`)

  const exports = options.exports.map(exportPath => mapExport(exportPath, samples))
  const report = {
    reportVersion: 1,
    generatedAt: new Date().toISOString(),
    corpusRoot: options.corpusRoot,
    method: {
      normalization: 'NFKC, remove whitespace, normalize curly quotes',
      bodyOnly: true,
      ngramSize: NGRAM_SIZE,
      intervalGap: INTERVAL_GAP
    },
    sampleFiles: files,
    sampleCount: samples.length,
    uniqueSampleIdCount: uniqueIdCount,
    exports
  }
  fs.mkdirSync(path.dirname(options.reportPath), { recursive: true })
  fs.writeFileSync(options.reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  log('finished', {
    sampleCount: samples.length,
    exportCount: exports.length,
    coverages: exports.map(item => ({
      export: path.basename(item.exportPath),
      coverage: Number(item.coverage.toFixed(4)),
      matchedSamples: item.matchedSamples.length,
      unmatchedIntervals: item.unmatchedIntervals.length
    })),
    reportPath: options.reportPath
  })
} catch (error) {
  fail(error.message, error.stack)
} finally {
  if (process.exitCode) log('failed')
}
