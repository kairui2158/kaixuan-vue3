#!/usr/bin/env node
// DEAI V2 multi-author calibration on the external human/model corpus.
// Read-only against the corpus; writes only the JSON evidence artifact.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { DeAiProcessor } from '../src/services/de-ai.js'

const repoRoot = path.resolve(import.meta.dirname, '..')
const corpusRoot = 'D:/codex/deai-corpus'
const humanLabelPath = path.join(corpusRoot, 'labels', 'human-negative.jsonl')
const humanSourceRoot = path.join(corpusRoot, 'sources', 'human', 'authors')
const modelLabelPath = path.join(corpusRoot, 'labels', 'model-positive.jsonl')
const modelSourceRoot = path.join(corpusRoot, 'sources', 'model')
const outputDir = path.join(repoRoot, '_audit', 'verification-deai-calibration')

const today = new Date().toISOString().slice(0, 10)
const CLI = {
  sampleCount: Number(process.env.DEAI_CALIBRATION_SAMPLE_COUNT || 700),
  seed: Number(process.env.DEAI_CALIBRATION_SEED || 20261029)
}

function log(phase, data = {}) {
  console.log(JSON.stringify({ phase, ...data }))
}

function fail(message) {
  console.error(`[calibrate-deai-v2] FAIL: ${message}`)
  process.exit(1)
}

function assertFile(filePath) {
  const stat = fs.statSync(filePath, { throwIfNoEntry: false })
  if (!stat?.isFile()) fail(`missing corpus file: ${filePath}`)
  return stat
}

function parseJsonl(filePath) {
  assertFile(filePath)
  const output = []
  const lines = fs.readFileSync(filePath, 'utf8').split('\n')
  lines.forEach((line, index) => {
    if (!line.trim()) return
    try {
      output.push(JSON.parse(line))
    } catch (error) {
      fail(`invalid JSONL ${filePath}:${index + 1}: ${error.message}`)
    }
  })
  return output
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

function stableId(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function loadCorpus() {
  const labels = parseJsonl(humanLabelPath)
  const sourceByLabelId = new Map()
  const missingSources = []
  for (const label of labels) {
    const filePath = sourcePathFor(label, 'human')
    if (!sourceByLabelId.has(filePath)) {
      if (!fs.statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
        missingSources.push({ id: label.id, author: label.author, work: label.work, path: filePath })
        continue
      }
      sourceByLabelId.set(filePath, indexJsonlBy(filePath, record => record.id))
    }
    const source = sourceByLabelId.get(filePath)?.get(label.id)
    if (!source) {
      missingSources.push({ id: label.id, author: label.author, work: label.work, path: filePath, reason: 'id-not-found' })
      continue
    }
  }
  if (missingSources.length) fail(`missing human source records: ${JSON.stringify(missingSources.slice(0, 5))}`)
  const samples = labels.map(label => {
    const filePath = sourcePathFor(label, 'human')
    const source = sourceByLabelId.get(filePath).get(label.id)
    return {
      id: label.id,
      author: label.author,
      authorVerified: label.authorVerified ?? true,
      work: label.work,
      genre: label.genre || 'unknown',
      chapter: label.chapter,
      title: label.title,
      charCount: label.charCount,
      text: source.text
    }
  })
  return samples
}

function loadModelPositives() {
  const labels = parseJsonl(modelLabelPath)
  const byProviderModel = new Map()
  const missing = []
  for (const label of labels) {
    const filePath = sourcePathFor(label, 'model')
    if (!byProviderModel.has(filePath)) {
      if (!fs.statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
        missing.push({ id: label.id, path: filePath })
        continue
      }
      byProviderModel.set(filePath, indexJsonlBy(filePath, record => record.id))
    }
    if (!byProviderModel.get(filePath)?.has(label.id)) missing.push({ id: label.id, path: filePath, reason: 'id-not-found' })
  }
  if (missing.length) fail(`missing model source records: ${JSON.stringify(missing.slice(0, 5))}`)
  return labels.map(label => {
    const filePath = sourcePathFor(label, 'model')
    const source = byProviderModel.get(filePath).get(label.id)
    return {
      id: label.id,
      provider: label.provider,
      model: label.model,
      generationStep: label.generationStep,
      charCount: label.charCount,
      text: source.text
    }
  })
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

const chapterHeader = /^第[一二三四五六七八九十百千万零两0-9]+章[^\n]*$/gm

function splitHeldOut(samples, seed) {
  const random = mulberry32(seed)
  const pool = [...samples]
  const heldOut = []
  const target = Math.max(1, Math.floor(samples.length * 0.2))
  for (let i = 0; i < target; i += 1) {
    const position = Math.floor(random() * pool.length)
    heldOut.push(pool.splice(position, 1)[0])
  }
  return { train: pool, heldOut }
}

function stratifiedSample(samples, perGroup, groupOf, random) {
  const groups = groupBy(samples, groupOf)
  const pool = []
  for (const [key, groupSamples] of Object.entries(groups)) {
    const shuffled = [...groupSamples]
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    pool.push(...shuffled.slice(0, perGroup))
  }
  return { pool, groupKeys: Object.keys(groups) }
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

function makeValueStats(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return {
    count: values.length,
    mean: values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(3)) : 0,
    min: values.length ? sorted[0] : 0,
    p50: Number(quantile(values, 0.5).toFixed(3)),
    p90: Number(quantile(values, 0.9).toFixed(3)),
    p95: Number(quantile(values, 0.95).toFixed(3)),
    p99: Number(quantile(values, 0.99).toFixed(3)),
    max: values.length ? sorted[sorted.length - 1] : 0
  }
}

function collectReports(chapters) {
  const reports = []
  const failures = []
  for (const chapter of chapters) {
    try {
      const report = DeAiProcessor.detectBody(chapter.body, {})
      reports.push({ title: chapter.title, report })
    } catch (error) {
      failures.push({ title: chapter.title, message: error?.message || String(error) })
    }
  }
  if (failures.length) fail(`detector failures: ${JSON.stringify(failures.slice(0, 3))}`)
  return reports
}

function findingId(report, id) {
  return report.findings.find(finding => finding.id === id)
}

function summarizeHuman(reports) {
  const verdicts = {}
  const findingCounts = {}
  const thresholds = reports.map(({ report }) => report)
  const metrics = {
    scores: reports.map(({ report }) => report.score),
    effectiveChars: reports.map(({ report }) => report.effectiveChars),
    dialogueChars: reports.map(({ report }) => report.dialogueChars),
    narrationHedging: reports.map(({ report }) => Number(findingId(report, 'deai-narration-hedging')?.perKilo ?? 0)),
    dialogueHedging: reports.map(({ report }) => Number(findingId(report, 'deai-dialogue-hedging')?.perKilo ?? 0)),
    repeatedBigramMax: reports.map(({ report }) => Number(findingId(report, 'deai-repeated-bigram')?.count ?? 0)),
    repeatedTrigramMax: reports.map(({ report }) => Number(findingId(report, 'deai-repeated-trigram')?.count ?? 0))
  }

  for (const { report } of reports) {
    verdicts[report.verdict] = (verdicts[report.verdict] || 0) + 1
    for (const finding of report.findings) {
      findingCounts[finding.id] = (findingCounts[finding.id] || 0) + 1
    }
  }

  const dialogueEligible = reports.filter(({ report }) => report.dialogueChars >= 80)
  const dialogueHedgingHit = dialogueEligible.filter(({ report }) => findingId(report, 'deai-dialogue-hedging'))
  const eligibleCount = reports.length

  return {
    sampleCount: eligibleCount,
    verdicts,
    findingCounts,
    valueStats: Object.fromEntries(Object.entries(metrics).map(([name, values]) => [name, makeValueStats(values)])),
    gates: {
      dialogueHedgingFalsePositiveRate: Number((dialogueHedgingHit.length / dialogueEligible.length).toFixed(4)),
      dialogueHedgingEligibleCount: dialogueEligible.length,
      blockingRate: Number(
        (reports.filter(({ report }) => report.verdict === 'blocking').length / eligibleCount).toFixed(4)
      ),
      blockingFindingRate: Number(
        (reports.filter(({ report }) => report.findings.some(f => f.severity === 'blocking')).length / eligibleCount).toFixed(4)
      ),
      suspiciousOrHigherRate: Number(
        (reports.filter(({ report }) => ['suspicious', 'likely_ai', 'blocking'].includes(report.verdict)).length / eligibleCount).toFixed(4)
      )
    },
    blockedFindingCounts: reports.reduce((acc, { report }) => {
      for (const finding of report.findings) {
        if (finding.severity === 'blocking') {
          acc[finding.id] = (acc[finding.id] || 0) + 1
        }
      }
      return acc
    }, {}),
    thresholdFields: Object.fromEntries(
      ['aiFreqWord', 'bannedVocab', 'cliche', 'connector', 'narrationHedging', 'dialogueHedging', 'repeatedBigramMax', 'repeatedTrigramMax']
        .map(name => [name, thresholds.find(report => report.thresholds.some(item => item.name === name))?.thresholds.find(item => item.name === name) ?? null])
    )
  }
}

function makeAiPositive(chapter) {
  // Controlled AI-style transformation: repeated sentence skeletons and hedging stacks.
  // This is a deliberately synthetic positive, not a claim about any real model output.
  const sentences = chapter.body
    .split(/(?<=[。！？!?])/)
    .map(sentence => sentence.trim())
    .filter(Boolean)
  const skeletonA = '他缓缓地深吸一口气，似乎意识到某种不可避免的变化。'
  const skeletonB = '与此同时，显而易见的是，一股难以言喻的张力弥漫开来。'
  const output = []
  for (let i = 0; i < sentences.length; i += 1) {
    if (i % 6 === 0) output.push(skeletonA)
    if (i % 6 === 3) output.push(skeletonB)
    output.push(sentences[i])
  }
  return output.join('')
}

function makeAiPositiveNoNgram(chapter) {
  // Positive variant without verbatim n-gram repetition. It targets the broader
  // lexical/gate rules so n-gram specificity is measured independently.
  const sentences = chapter.body
    .split(/(?<=[。！？!?])/)
    .map(sentence => sentence.trim())
    .filter(Boolean)
  return sentences.map((sentence, index) => {
    if (index % 4 === 0) return `或许，${sentence.replace(/^./, c => c)}`
    if (index % 4 === 1) return `显然，${sentence}`
    if (index % 4 === 2) return `似乎，${sentence}`
    return `确实，${sentence}`
  }).join('')
}

function summarizePositive(pairs) {
  const ngramHits = pairs.filter(({ report }) =>
    report.findings.some(f => f.id === 'deai-repeated-bigram' || f.id === 'deai-repeated-trigram')
  ).length
  const anyHit = pairs.filter(({ report }) => report.findings.length > 0).length
  return {
    sampleCount: pairs.length,
    ngramHitRate: Number((ngramHits / pairs.length).toFixed(4)),
    anyFindingHitRate: Number((anyHit / pairs.length).toFixed(4)),
    verdicts: pairs.reduce((acc, { report }) => {
      acc[report.verdict] = (acc[report.verdict] || 0) + 1
      return acc
    }, {})
  }
}

function groupBy(samples, keyOf) {
  return samples.reduce((acc, sample) => {
    const key = keyOf(sample)
    if (!acc[key]) acc[key] = []
    acc[key].push(sample)
    return acc
  }, {})
}

function reportLayer(samples) {
  const reports = collectReports(samples.map(sample => ({ title: sample.title ?? sample.id, body: sample.text })))
  const summary = summarizeHuman(reports.map(({ title, report }) => ({
    title,
    report
  })))
  return {
    sampleCount: summary.sampleCount,
    verdicts: summary.verdicts,
    suspiciousOrHigherRate: summary.gates.suspiciousOrHigherRate,
    blockingRate: summary.gates.blockingRate,
    blockingFindingRate: summary.gates.blockingFindingRate,
    findingCounts: summary.findingCounts
  }
}

function summarizeModelPositives(samples) {
  const reports = collectReports(samples.map(sample => ({ title: `${sample.provider}/${sample.model}/${sample.id}`, body: sample.text })))
  return summarizePositive(reports.map(({ title, report }) => ({ title, report })))
}

function thresholdSensitivity(samples) {
  const reports = collectReports(samples.map(sample => ({ title: sample.id, body: sample.text })))
  const points = [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7]
  return points.map(point => ({
    scorePoint: point,
    suspiciousOrHigher: reports.filter(({ report }) => report.score / 100 >= point).length
  }))
}

function measurePerformance(chapters) {
  const compact = chapters
    .slice(0, 20)
    .map(chapter => chapter.text.replace(/\s+/g, ''))
    .join('')
  if (compact.length < 20_000) fail(`performance corpus too short: ${compact.length}`)
  const text = compact.slice(0, 20_000)
  const startedAt = performance.now()
  const report = DeAiProcessor.detectBody(text, {})
  const elapsed = performance.now() - startedAt
  return {
    textChars: text.length,
    reportEffectiveChars: report.effectiveChars,
    reportDialogueChars: report.dialogueChars,
    elapsedMs: Number(elapsed.toFixed(2))
  }
}

function main() {
  const humanSamples = loadCorpus()
  const modelSamples = loadModelPositives()
  const random = mulberry32(CLI.seed)
  const { pool: sampled, groupKeys: authorKeys } = stratifiedSample(humanSamples, 100, sample => sample.author, random)
  if (authorKeys.length < 5) fail(`author groups below minimum: ${authorKeys.length}`)
  if (sampled.length < 500) fail(`stratified human sample below minimum: ${sampled.length}`)
  const { train, heldOut } = splitHeldOut(sampled, CLI.seed + 1)
  const positiveRandom = mulberry32(CLI.seed + 2)
  const sampledPositive = stratifiedSample(sampled, 9, sample => sample.author, positiveRandom).pool
  const positiveRepeated = collectReports(sampledPositive.slice(0, Math.floor(sampledPositive.length / 2)).map(chapter => ({
    title: `[synthetic-ai/repeated] ${chapter.title ?? chapter.id}`,
    body: makeAiPositive({ body: chapter.text })
  })))
  const positiveLexical = collectReports(sampledPositive.slice(Math.floor(sampledPositive.length / 2)).map(chapter => ({
    title: `[synthetic-ai/lexical] ${chapter.title ?? chapter.id}`,
    body: makeAiPositiveNoNgram({ body: chapter.text })
  })))
  const modelPositiveByModel = groupBy(modelSamples, sample => `${sample.provider}/${sample.model}`)
  const modelGroupEntries = Object.entries(modelPositiveByModel)
    .map(([key, samples]) => ({ key, sampleCount: samples.length }))
  const humanByAuthor = groupBy(sampled, sample => sample.author)
  const humanByGenre = groupBy(sampled, sample => sample.genre)

  const result = {
    generatedAt: new Date().toISOString(),
    corpus: {
      corpusRoot,
      humanLabels: parseJsonl(humanLabelPath).length,
      humanSampled: sampled.length,
      humanTrain: train.length,
      humanHeldOut: heldOut.length,
      modelPositiveSamples: modelSamples.length,
      seed: CLI.seed,
      eligibility: '1500-6000 non-whitespace chars'
    },
    human: summarizeHuman(collectReports(train.map(sample => ({ title: sample.title ?? sample.id, body: sample.text })))),
    humanHeldOut: reportLayer(heldOut),
    humanByAuthor: Object.fromEntries(Object.entries(humanByAuthor).map(([author, samples]) => [author, reportLayer(samples)])),
    humanByGenre: Object.fromEntries(Object.entries(humanByGenre).map(([genre, samples]) => [genre, reportLayer(samples)])),
    positives: {
      model: Object.fromEntries(Object.entries(modelPositiveByModel).map(([key, samples]) => [key, summarizeModelPositives(samples)])),
      repeatedSkeleton: summarizePositive(positiveRepeated),
      lexicalHedging: summarizePositive(positiveLexical)
    },
    thresholdSensitivity: thresholdSensitivity(heldOut),
    performance: measurePerformance(sampled),
    provenance: {
      modelGroups: modelGroupEntries,
      note: `Multi-author human-negative corpus plus ${modelSamples.length} real model positives across ${modelGroupEntries.length} provider/model group(s): ${modelGroupEntries.map(group => `${group.key}:${group.sampleCount}`).join(', ')}. Conclusions stay model-scoped.`
    }
  }

  fs.mkdirSync(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, `deai-v2-calibration-${new Date().toISOString().slice(0, 10)}.json`)
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  console.error(`[calibrate-deai-v2] sampleCount=${result.corpus.humanSampled} heldOut=${result.corpus.humanHeldOut} modelPositive=${result.corpus.modelPositiveSamples}`)
  console.error(`[calibrate-deai-v2] artifact: ${outputPath}`)
}

main()
