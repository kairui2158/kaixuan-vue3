#!/usr/bin/env node
// Analyze DEAI V2 finding/score separation on the real calibration corpus.
// This is a calibration instrument, not a runtime behavior change.

import fs from 'node:fs'
import path from 'node:path'
import { DeAiProcessor } from '../src/services/de-ai.js'

const corpusRoot = process.env.DEAI_CALIBRATION_CORPUS_ROOT || 'D:/codex/deai-corpus'
const humanLabelPath = path.join(corpusRoot, 'labels', 'human-negative.jsonl')
const humanSourceRoot = path.join(corpusRoot, 'sources', 'human', 'authors')
const modelLabelPath = path.join(corpusRoot, 'labels', 'model-positive.jsonl')
const modelSourceRoot = path.join(corpusRoot, 'sources', 'model')

function fail(message) {
  console.error(`[analyze-deai-v2-scoring] FAIL: ${message}`)
  process.exit(1)
}

function parseJsonl(filePath) {
  if (!fs.statSync(filePath, { throwIfNoEntry: false })?.isFile()) fail(`missing file: ${filePath}`)
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(line => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line)
      } catch (error) {
        fail(`invalid JSONL ${filePath}:${index + 1}: ${error.message}`)
      }
    })
}

function sourcePathFor(record, kind) {
  const author = encodeURIComponent(String(record.author || 'unknown').trim().toLowerCase())
  const work = encodeURIComponent(String(record.work || 'unknown').trim().toLowerCase())
  if (kind === 'human') return path.join(humanSourceRoot, author, 'works', work, 'chapters.jsonl')
  return path.join(modelSourceRoot, record.provider, record.model, 'samples.jsonl')
}

function indexJsonlBy(filePath, keyOf) {
  const index = new Map()
  for (const record of parseJsonl(filePath)) index.set(keyOf(record), record)
  return index
}

function loadHumanSamples() {
  const labels = parseJsonl(humanLabelPath)
  const indexes = new Map()
  const samples = []
  for (const label of labels) {
    const filePath = sourcePathFor(label, 'human')
    if (!indexes.has(filePath)) {
      if (!fs.statSync(filePath, { throwIfNoEntry: false })?.isFile()) fail(`missing human source: ${filePath}`)
      indexes.set(filePath, indexJsonlBy(filePath, record => record.id))
    }
    const source = indexes.get(filePath).get(label.id)
    if (!source) fail(`human source id not found: ${label.id}`)
    samples.push({
      id: label.id,
      author: label.author,
      genre: label.genre || 'unknown',
      text: source.text
    })
  }
  return samples
}

function loadModelSamples() {
  const labels = parseJsonl(modelLabelPath)
  const indexes = new Map()
  const samples = []
  for (const label of labels) {
    const filePath = sourcePathFor(label, 'model')
    if (!indexes.has(filePath)) {
      if (!fs.statSync(filePath, { throwIfNoEntry: false })?.isFile()) fail(`missing model source: ${filePath}`)
      indexes.set(filePath, indexJsonlBy(filePath, record => record.id))
    }
    const source = indexes.get(filePath).get(label.id)
    if (!source) fail(`model source id not found: ${label.id}`)
    samples.push({
      id: label.id,
      group: `${label.provider}/${label.model}`,
      text: source.text
    })
  }
  return samples
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

function stratifiedSample(samples, perGroup, groupOf, random) {
  const groups = new Map()
  for (const sample of samples) {
    const key = groupOf(sample)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(sample)
  }
  const pool = []
  for (const groupSamples of groups.values()) {
    const shuffled = [...groupSamples]
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    pool.push(...shuffled.slice(0, perGroup))
  }
  return pool
}

function quantile(values, q) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * q
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

function stats(values) {
  return {
    count: values.length,
    mean: Number((values.reduce((a, b) => a + b, 0) / (values.length || 1)).toFixed(3)),
    min: values.length ? Math.min(...values) : 0,
    p50: Number(quantile(values, 0.5).toFixed(3)),
    p90: Number(quantile(values, 0.9).toFixed(3)),
    p95: Number(quantile(values, 0.95).toFixed(3)),
    max: values.length ? Math.max(...values) : 0
  }
}

function summarizeScoringCandidates(humanTrain, humanHeldOut, modelPositive) {
  const reportRows = reports => reports.map(({ report }) => ({
    verdict: report.verdict,
    score: report.score,
    cv: report.metrics.sentenceLengthCV,
    styleDrift: report.styleDrift?.firstLastDelta ?? 0,
    bigram: report.findings.find(item => item.id === 'deai-repeated-bigram')?.count ?? 0,
    trigram: report.findings.find(item => item.id === 'deai-repeated-trigram')?.count ?? 0
  }))

  const candidates = {
    legacy: row => row.score,
    cvThreshold100: row => (row.cv >= 1 ? 100 : row.score),
    cvThreshold130: row => (row.cv >= 1.3 ? 100 : row.score),
    cvSignal: row => Math.round(Math.min(100, row.score + Math.max(0, Math.round((row.cv - 1) * 40)))),
    cvNgramCombo: row => Math.round(Math.min(100, row.score + Math.max(0, Math.round((row.cv - 1) * 35)) + Math.min(20, Math.floor(row.bigram / 1000) * 5))),
    cvGuardedSignal: row => {
      const cvExcess = row.cv - 1.1
      if (cvExcess <= 0) return row.score
      const highNgram = row.bigram >= 900 || row.trigram >= 300
      const styleDrift = row.styleDrift >= 0.2
      if (!highNgram && !styleDrift) return Math.round(Math.min(100, row.score + Math.round(cvExcess * 10)))
      return Math.round(Math.min(100, row.score + 28 + Math.round(cvExcess * 20)))
    }
  }

  const suspiciousOrHigher = score => score >= 45
  const evaluate = (rows, scoreOf) => {
    const suspicious = rows.filter(row => suspiciousOrHigher(scoreOf(row))).length
    const cvHigh = rows.filter(row => row.cv >= 1).length
    return {
      sampleCount: rows.length,
      suspiciousOrHigher: Number((suspicious / rows.length).toFixed(4)),
      cvAtLeastOne: Number((cvHigh / rows.length).toFixed(4))
    }
  }

  const splitRows = {
    humanTrain: reportRows(humanTrain),
    humanHeldOut: reportRows(humanHeldOut),
    modelPositive: reportRows(modelPositive)
  }

  return Object.fromEntries(Object.entries(candidates).map(([name, scoreOf]) => [
    name,
    {
      humanTrain: evaluate(splitRows.humanTrain, scoreOf),
      humanHeldOut: evaluate(splitRows.humanHeldOut, scoreOf),
      modelPositive: evaluate(splitRows.modelPositive, scoreOf)
    }
  ]))
}

function reportsFor(samples) {
  return samples.map(sample => {
    try {
      return { ...sample, report: DeAiProcessor.detectBody(sample.text, {}) }
    } catch (error) {
      fail(`detectBody failed for ${sample.id}: ${error?.message || error}`)
    }
  })
}

function summarize(reports) {
  const byFinding = new Map()
  for (const { report } of reports) {
    for (const finding of report.findings) {
      if (!byFinding.has(finding.id)) byFinding.set(finding.id, { count: 0, severity: {}, scores: [] })
      const entry = byFinding.get(finding.id)
      entry.count += 1
      entry.severity[finding.severity] = (entry.severity[finding.severity] || 0) + 1
      entry.scores.push(report.score)
    }
  }
  return {
    sampleCount: reports.length,
    score: stats(reports.map(({ report }) => report.score)),
    verdicts: reports.reduce((acc, { report }) => {
      acc[report.verdict] = (acc[report.verdict] || 0) + 1
      return acc
    }, {}),
    findings: Object.fromEntries([...byFinding.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, entry]) => [
      id,
      {
        sampleRate: Number((entry.count / reports.length).toFixed(4)),
        severity: entry.severity,
        scoreWhenPresent: stats(entry.scores)
      }
    ]))
  }
}

function findingValueStats(reports) {
  const byFinding = new Map()
  for (const { report } of reports) {
    for (const finding of report.findings) {
      if (!byFinding.has(finding.id)) byFinding.set(finding.id, new Map())
      const entry = byFinding.get(finding.id)
      if (!entry.has('count')) entry.set('count', [])
      if (!entry.has('perKilo')) entry.set('perKilo', [])
      entry.get('count').push(finding.count)
      entry.get('perKilo').push(finding.perKilo)
    }
  }
  return Object.fromEntries([...byFinding.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, values]) => [
    id,
    Object.fromEntries([...values.entries()].map(([field, list]) => [field, stats(list)]))
  ]))
}

function main() {
  const random = mulberry32(20261029)
  const human = stratifiedSample(loadHumanSamples(), 100, sample => sample.author, random)
  const heldOutTarget = Math.floor(human.length * 0.2)
  const heldOutIds = new Set(human.slice(0, heldOutTarget).map(sample => sample.id))
  const train = human.filter(sample => !heldOutIds.has(sample.id))
  const heldOut = human.filter(sample => heldOutIds.has(sample.id))
  const model = loadModelSamples()
  const humanTrainReports = reportsFor(train)
  const humanHeldOutReports = reportsFor(heldOut)
  const modelPositiveReports = reportsFor(model)
  const result = {
    generatedAt: new Date().toISOString(),
    split: { train: train.length, heldOut: heldOut.length, modelPositive: model.length },
    humanTrain: summarize(humanTrainReports),
    humanHeldOut: summarize(humanHeldOutReports),
    humanHeldOutFindingValues: findingValueStats(humanHeldOutReports),
    modelPositive: summarize(modelPositiveReports),
    modelPositiveFindingValues: findingValueStats(modelPositiveReports),
    metricStats: {
      humanHeldOut: stats(humanHeldOutReports.map(({ report }) => report.metrics.sentenceLengthCV)),
      modelPositive: stats(modelPositiveReports.map(({ report }) => report.metrics.sentenceLengthCV))
    },
    scoringCandidates: summarizeScoringCandidates(humanTrainReports, humanHeldOutReports, modelPositiveReports)
  }
  if (process.env.DEAI_SCORING_DEBUG === '1') {
    const row = ({ id, report }) => ({
      id,
      verdict: report.verdict,
      score: report.score,
      cv: report.metrics.sentenceLengthCV,
      blocking: report.findings.filter(item => item.severity === 'blocking').length,
      advisory: report.findings.filter(item => item.severity === 'advisory').length,
      styleDrift: report.styleDrift?.firstLastDelta ?? 0,
      bigram: report.findings.find(item => item.id === 'deai-repeated-bigram')?.count ?? 0,
      trigram: report.findings.find(item => item.id === 'deai-repeated-trigram')?.count ?? 0,
      freqPerKilo: report.findings.find(item => item.id === 'deai-freq-words')?.perKilo ?? 0,
      phrasePerKilo: report.findings.find(item => item.id === 'deai-banned-phrase')?.perKilo ?? 0,
      vocabPerKilo: report.findings.find(item => item.id === 'deai-banned-vocab')?.perKilo ?? 0
    })
    result.debugRows = {
      humanHeldOut: heldOut.map(sample => row(reportsFor([sample])[0])),
      modelPositive: model.map(sample => row(reportsFor([sample])[0])),
      humanTrain: train.map(sample => row(reportsFor([sample])[0]))
    }
  }
  console.log(JSON.stringify(result, null, 2))
}

main()
