#!/usr/bin/env node
// DEAI V2 calibration release gate.
// This gate intentionally fails until corpus depth, recall evidence, and score
// separation are proven. It must not be loosened just to pass a release.

import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')
const corpusRoot = process.env.DEAI_CALIBRATION_CORPUS_ROOT || 'D:/codex/deai-corpus'
const reportPath = process.argv[2] || path.join(
  repoRoot,
  '_audit',
  'verification-deai-calibration',
  `deai-v2-calibration-${new Date().toISOString().slice(0, 10)}.json`
)
const outputPath = path.join(repoRoot, '_audit', 'verification-deai-calibration', `deai-release-gate-${new Date().toISOString().slice(0, 10)}.json`)

const REQUIREMENTS = {
  verifiedAuthorCount: { min: 10, description: 'verified independent human source identities' },
  unverifiedAuthorLabels: { max: 0, description: 'labels from unverified human source identities' },
  genreCount: { min: 7, description: 'genres with sampled calibration coverage' },
  modelGroups: { min: 3, description: 'real provider/model positive groups' },
  minSamplesPerModelGroup: { min: 30, description: 'real positive samples per model group' },
  providerCount: { min: 2, description: 'distinct positive providers' },
  humanSuspiciousOrHigherRate: { max: 0.1, description: 'held-out human suspicious+ false-positive rate' },
  humanBlockingRate: { max: 0.05, description: 'held-out human blocking false-positive rate' },
  worstAuthorSuspiciousOrHigherRate: { max: 0.2, description: 'worst verified source-identity suspicious+ false-positive rate' },
  modelPositiveSuspiciousOrHigherRecall: { min: 0.9, description: 'model-positive suspicious+ recall' },
  modelPositiveNgramRecall: { min: 0.9, description: 'model-positive n-gram finding recall' },
  recallConfidenceIntervalHalfWidth: { max: 0.1, description: '95% recall confidence interval half-width' },
  thresholdCurveDistinctCounts: { min: 3, description: 'distinct sensitivity counts across score points' },
  performanceMs: { max: 300, description: '20k-char detectBody performance in ms' }
}

function fail(message) {
  console.error(`[deai-release-gate] FAIL: ${message}`)
  process.exit(1)
}

function parseJsonl(filePath) {
  if (!fs.statSync(filePath, { throwIfNoEntry: false })?.isFile()) fail(`missing corpus file: ${filePath}`)
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

function wilsonLowerBound(successes, total) {
  if (!total) return 0
  const z = 1.96
  const p = successes / total
  const denominator = 1 + (z * z) / total
  const center = p + (z * z) / (2 * total)
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)
  return (center - margin) / denominator
}

function normalApproximationHalfWidth(successes, total) {
  if (!total) return 1
  const z = 1.96
  const p = successes / total
  return z * Math.sqrt((p * (1 - p)) / total)
}

function check({ key, actual, requirement }) {
  const rule = REQUIREMENTS[key]
  let passed
  if ('min' in rule) passed = actual >= rule.min
  else passed = actual <= rule.max
  const limit = 'min' in rule ? `>= ${rule.min}` : `<= ${rule.max}`
  return {
    key,
    description: rule.description,
    limit,
    actual,
    passed
  }
}

function main() {
  if (!fs.statSync(reportPath, { throwIfNoEntry: false })?.isFile()) {
    fail(`missing calibration report: ${reportPath}. Run scripts/calibrate-deai-v2-thresholds.mjs first.`)
  }
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  const humanLabels = parseJsonl(path.join(corpusRoot, 'labels', 'human-negative.jsonl'))
  const modelLabels = parseJsonl(path.join(corpusRoot, 'labels', 'model-positive.jsonl'))

  const verifiedAuthorGroups = new Map()
  let unverifiedAuthorLabels = 0
  for (const label of humanLabels) {
    const verified = label.authorVerified === true || label.author === '踏星'
    if (verified) verifiedAuthorGroups.set(label.author, (verifiedAuthorGroups.get(label.author) || 0) + 1)
    else unverifiedAuthorLabels += 1
  }

  const genreCount = Object.keys(report.humanByGenre || {}).filter(genre => genre !== 'unknown').length
  const modelGroupEntries = Object.entries(report.positives?.model || {})
  const providerCount = new Set(modelGroupEntries.map(([key]) => key.split('/')[0])).size
  const minimumModelGroupSamples = modelGroupEntries.length
    ? Math.min(...modelGroupEntries.map(([, value]) => value.sampleCount))
    : 0

  const suspiciousOrHigherVerdicts = ['suspicious', 'likely_ai', 'blocking']
  const modelPositiveSuspiciousOrHigher = modelGroupEntries.reduce((total, [, group]) =>
    total + suspiciousOrHigherVerdicts.reduce((sum, verdict) => sum + (group.verdicts?.[verdict] || 0), 0), 0)
  const modelPositiveNgramHits = modelGroupEntries.reduce((total, [, group]) =>
    total + Math.round(group.sampleCount * group.ngramHitRate), 0)
  const pooledModelPositiveCount = modelGroupEntries.reduce((total, [, group]) => total + group.sampleCount, 0)
  const recall = pooledModelPositiveCount ? modelPositiveSuspiciousOrHigher / pooledModelPositiveCount : 0
  const ngramRecall = pooledModelPositiveCount ? modelPositiveNgramHits / pooledModelPositiveCount : 0
  const recallHalfWidth = normalApproximationHalfWidth(modelPositiveSuspiciousOrHigher, pooledModelPositiveCount)

  const sensitivityCounts = (report.thresholdSensitivity || []).map(point => point.suspiciousOrHigher)
  const distinctSensitivityCounts = new Set(sensitivityCounts).size
  const verifiedAuthorRates = Object.entries(report.humanByAuthor || {})
    .filter(([author]) => verifiedAuthorGroups.has(author))
    .map(([, value]) => value.suspiciousOrHigherRate)
  const worstAuthorRate = verifiedAuthorRates.length ? Math.max(...verifiedAuthorRates) : 1

  const values = {
    verifiedAuthorCount: verifiedAuthorGroups.size,
    unverifiedAuthorLabels,
    genreCount,
    modelGroups: modelGroupEntries.length,
    minSamplesPerModelGroup: minimumModelGroupSamples,
    providerCount,
    humanSuspiciousOrHigherRate: report.humanHeldOut?.suspiciousOrHigherRate ?? 1,
    humanBlockingRate: report.humanHeldOut?.blockingRate ?? 1,
    worstAuthorSuspiciousOrHigherRate: worstAuthorRate,
    modelPositiveSuspiciousOrHigherRecall: Number(recall.toFixed(4)),
    modelPositiveNgramRecall: Number(ngramRecall.toFixed(4)),
    recallConfidenceIntervalHalfWidth: Number(recallHalfWidth.toFixed(4)),
    thresholdCurveDistinctCounts: distinctSensitivityCounts,
    performanceMs: report.performance?.elapsedMs ?? Number.POSITIVE_INFINITY
  }

  const checks = Object.entries(values).map(([key, actual]) =>
    check({ key, actual, requirement: REQUIREMENTS[key] }))
  const passed = checks.every(item => item.passed)
  const result = {
    generatedAt: new Date().toISOString(),
    reportPath,
    corpusRoot,
    decision: passed ? 'READY_TO_REMOVE_PROVISIONAL' : 'NOT_READY',
    provisionalMustRemain: !passed,
    requirements: REQUIREMENTS,
    checks,
    failedChecks: checks.filter(item => !item.passed).map(item => item.key),
    diagnostics: {
      verifiedAuthors: [...verifiedAuthorGroups.entries()].map(([author, count]) => ({ author, count })),
      modelGroups: modelGroupEntries.map(([key, group]) => ({ key, sampleCount: group.sampleCount })),
      pooledModelPositiveSuspiciousOrHigher: modelPositiveSuspiciousOrHigher,
      pooledModelPositiveCount,
      wilsonLowerBoundForSuspiciousOrHigherRecall: Number(wilsonLowerBound(modelPositiveSuspiciousOrHigher, pooledModelPositiveCount).toFixed(4))
    }
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(result, null, 2))
  console.log(`[deai-release-gate] artifact: ${outputPath}`)
  if (!passed) {
    console.error(`[deai-release-gate] NOT_READY: ${result.failedChecks.join(', ')}`)
    process.exitCode = 1
  }
}

main()
