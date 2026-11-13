import fs from 'node:fs'
import path from 'node:path'

export const STRONG_VERDICTS = ['suspicious', 'likely_ai', 'blocking']
export const NGRAM_FINDINGS = ['deai-repeated-bigram', 'deai-repeated-trigram']

export const DEFAULT_CANDIDATE_CONSTANTS = Object.freeze({
  defaultThresholds: Object.freeze({
    scoreAdvisory: 25,
    scoreSuspicious: 45,
    scoreLikelyAi: 65,
    scoreBlocking: 80,
    sentenceCVAdvisory: 1,
    sentenceCVStrong: 1.1,
    sentenceCVHighNgramBigram: 900,
    sentenceCVHighNgramTrigram: 300,
    sentenceCVHighStyleDrift: 0.2
  }),
  scoreWeights: Object.freeze({ blocking: 12, advisory: 6 }),
  cvContribution: Object.freeze({ base: 28, excessMultiplier: 20, uncorroboratedCap: 18, uncorroboratedMultiplier: 10 })
})

const SPLIT_KEYS = ['scoreSuspicious', 'scoreLikelyAi', 'sentenceCVAdvisory', 'sentenceCVStrong']
const GRID_KEYS = [
  'sentenceCVHighNgramBigram',
  'sentenceCVHighNgramTrigram',
  'sentenceCVHighStyleDrift',
  'cvBaseContribution',
  'cvExcessMultiplier',
  'cvUncorroboratedCap',
  'cvUncorroboratedMultiplier',
  'blockingWeight',
  'advisoryWeight'
]

const THRESHOLD_GRIDS = {
  scoreSuspicious: [40, 45, 50, 55, 60, 65],
  scoreLikelyAi: [60, 65, 70, 75],
  sentenceCVAdvisory: [0.9, 1.0, 1.1, 1.2, 1.3],
  sentenceCVStrong: [1.0, 1.1, 1.2, 1.3, 1.4],
  sentenceCVHighNgramBigram: [300, 600, 900, 1200, 1500],
  sentenceCVHighNgramTrigram: [100, 200, 300, 400, 500],
  sentenceCVHighStyleDrift: [0.1, 0.2, 0.3, 0.4],
  cvBaseContribution: [0, 8, 16, 24, 28, 32, 40],
  cvExcessMultiplier: [0, 5, 10, 15, 20, 25, 30],
  cvUncorroboratedCap: [0, 4, 8, 12, 18, 24],
  cvUncorroboratedMultiplier: [0, 5, 10, 15, 20],
  blockingWeight: [8, 10, 12, 14, 16],
  advisoryWeight: [0, 3, 6, 9, 12]
}

const SEARCH_EVALUATION_LIMIT = 200_000

export function buildSearchSpace({ mode = 'full' } = {}) {
  if (!['full', 'minimal'].includes(mode)) throw new Error(`unknown search mode: ${mode}`)
  const grid = {}
  for (const key of Object.keys(THRESHOLD_GRIDS)) {
    grid[key] = mode === 'full' ? THRESHOLD_GRIDS[key] : [THRESHOLD_GRIDS[key][0], THRESHOLD_GRIDS[key][THRESHOLD_GRIDS[key].length - 1]]
  }
  for (const key of SPLIT_KEYS) {
    grid[key] = [DEFAULT_CANDIDATE_CONSTANTS.defaultThresholds[key]]
  }
  return grid
}

function findingCount(report, findingId) {
  return Number(report.findings.find(finding => finding.id === findingId)?.count ?? 0)
}

export function buildFeatureRow({ report, sample }) {
  const cvFinding = report.findings.find(finding => finding.id === 'deai-sentence-cv-excess')
  return {
    id: sample.id,
    author: sample.author,
    authorVerified: sample.authorVerified ?? true,
    work: sample.work,
    genre: sample.genre,
    provider: sample.provider,
    model: sample.model,
    groupKey: sample.provider && sample.model ? `${sample.provider}/${sample.model}` : undefined,
    bucket: sample.bucket,
    baseScore: report.score,
    currentBlockingCount: report.findings.filter(finding => finding.severity === 'blocking').length,
    currentAdvisoryCount: report.findings.filter(finding => finding.severity === 'advisory').length,
    sentenceLengthCV: report.metrics.sentenceLengthCV,
    styleDriftDelta: report.styleDrift?.firstLastDelta ?? 0,
    repeatedBigramCount: findingCount(report, 'deai-repeated-bigram'),
    repeatedTrigramCount: findingCount(report, 'deai-repeated-trigram'),
    currentCvContribution: cvFinding?.contribution ?? 0
  }
}

export function buildFeatureRows(pairs) {
  return pairs.map(pair => buildFeatureRow(pair))
}

function requiredKey(candidate, key) {
  const value = candidate[key]
  if (!Number.isFinite(value)) throw new Error(`candidate parameter is not numeric: ${key}`)
  return value
}

function candidateSignature(candidate) {
  return Object.keys(THRESHOLD_GRIDS)
    .sort()
    .map(key => `${key}=${candidate[key]}`)
    .join('|')
}

function normalizeCandidate(candidate) {
  return Object.fromEntries(Object.keys(THRESHOLD_GRIDS).sort().map(key => [key, candidate[key]]))
}

function compareCandidates(a, b) {
  return b.metrics.objective - a.metrics.objective ||
    a.metrics.constraints.positiveSuspiciousOrHigherRecall - b.metrics.constraints.positiveSuspiciousOrHigherRecall ||
    a.candidate.sentenceCVAdvisory - b.candidate.sentenceCVAdvisory ||
    a.candidate.sentenceCVStrong - b.candidate.sentenceCVStrong ||
    a.candidate.scoreSuspicious - b.candidate.scoreSuspicious ||
    a.candidate.scoreLikelyAi - b.candidate.scoreLikelyAi ||
    GRID_KEYS.map(key => a.candidate[key] - b.candidate[key]).find(value => value !== 0) || 0
}

export function evaluateCandidateRow(row, candidate) {
  const cvAdvisory = requiredKey(candidate, 'sentenceCVAdvisory')
  const cvStrong = requiredKey(candidate, 'sentenceCVStrong')
  const bigramCorroboration = requiredKey(candidate, 'sentenceCVHighNgramBigram')
  const trigramCorroboration = requiredKey(candidate, 'sentenceCVHighNgramTrigram')
  const styleDriftCorroboration = requiredKey(candidate, 'sentenceCVHighStyleDrift')
  const cvBase = requiredKey(candidate, 'cvBaseContribution')
  const cvExcessMultiplier = requiredKey(candidate, 'cvExcessMultiplier')
  const cvUncorroboratedCap = requiredKey(candidate, 'cvUncorroboratedCap')
  const cvUncorroboratedMultiplier = requiredKey(candidate, 'cvUncorroboratedMultiplier')
  const blockingWeight = requiredKey(candidate, 'blockingWeight')
  const advisoryWeight = requiredKey(candidate, 'advisoryWeight')

  const corroboration = row.repeatedBigramCount >= bigramCorroboration ||
    row.repeatedTrigramCount >= trigramCorroboration ||
    row.styleDriftDelta >= styleDriftCorroboration
  const excess = row.sentenceLengthCV - cvStrong
  const cvContribution = excess > 0 && corroboration
    ? cvBase + Math.round(excess * cvExcessMultiplier)
    : row.sentenceLengthCV >= cvAdvisory
      ? Math.min(cvUncorroboratedCap, Math.max(0, Math.round(excess * cvUncorroboratedMultiplier)))
      : 0
  const styleDriftDelta = row.styleDriftDelta > 0 ? Math.round(row.styleDriftDelta * 10) : 0
  const baseScoreWithoutCv = row.currentBlockingCount * blockingWeight + row.currentAdvisoryCount * advisoryWeight + styleDriftDelta
  const score = Math.max(0, Math.min(100, baseScoreWithoutCv + cvContribution))
  const scoreSuspicious = requiredKey(candidate, 'scoreSuspicious')
  const scoreLikelyAi = requiredKey(candidate, 'scoreLikelyAi')
  if (scoreSuspicious > scoreLikelyAi) throw new Error(`candidate thresholds inverted: ${scoreSuspicious} > ${scoreLikelyAi}`)
  return {
    score,
    verdict: score >= scoreLikelyAi ? 'likely_ai' : score >= scoreSuspicious ? 'suspicious' : score >= 25 ? 'advisory' : 'clean'
  }
}

function summarizeRows(rows, candidate, grouping = 'pooled') {
  const groups = grouping === 'pooled'
    ? { pooled: rows }
    : rows.reduce((acc, row) => {
      const key = row[grouping]
      if (!acc[key]) acc[key] = []
      acc[key].push(row)
      return acc
    }, {})
  const result = {}
  for (const [key, groupRows] of Object.entries(groups)) {
    const decisions = groupRows.map(row => evaluateCandidateRow(row, candidate))
    const strong = decisions.filter(decision => STRONG_VERDICTS.includes(decision.verdict)).length
    const ngram = groupRows.filter(row => row.repeatedBigramCount > 0 || row.repeatedTrigramCount > 0).length
    result[key] = {
      sampleCount: groupRows.length,
      strongCount: strong,
      suspiciousOrHigherRate: Number((strong / (groupRows.length || 1)).toFixed(4)),
      ngramHitRate: Number((ngram / (groupRows.length || 1)).toFixed(4)),
      verdicts: decisions.reduce((acc, decision) => {
        acc[decision.verdict] = (acc[decision.verdict] || 0) + 1
        return acc
      }, {})
    }
  }
  return result
}

function normalApproximationHalfWidth(successes, total) {
  if (!total) return 1
  const z = 1.96
  const p = successes / total
  return Number((z * Math.sqrt((p * (1 - p)) / total)).toFixed(4))
}

export function scoreCandidate(candidate, trainRows, devRows, positiveRows) {
  const train = summarizeRows(trainRows, candidate)
  const dev = summarizeRows(devRows, candidate)
  const positives = summarizeRows(positiveRows, candidate)
  const humanTrain = train.pooled
  const humanDev = dev.pooled
  const pooledPositive = positives.pooled
  const perAuthorTrain = summarizeRows(trainRows, candidate, 'author')
  const trainStrong = humanTrain.strongCount
  const devStrong = humanDev.strongCount
  const positiveStrong = pooledPositive.strongCount
  return {
    objective: Number((pooledPositive.suspiciousOrHigherRate - 1.6 * humanTrain.suspiciousOrHigherRate - 1.6 * humanDev.suspiciousOrHigherRate).toFixed(6)),
    train: humanTrain,
    dev: humanDev,
    positive: pooledPositive,
    positiveByGroup: positives,
    trainByAuthor: perAuthorTrain,
    constraints: {
      trainSuspiciousOrHigherRate: humanTrain.suspiciousOrHigherRate,
      devSuspiciousOrHigherRate: humanDev.suspiciousOrHigherRate,
      positiveSuspiciousOrHigherRecall: pooledPositive.suspiciousOrHigherRate,
      positiveNgramRecall: pooledPositive.ngramHitRate,
      recallCiHalfWidth: normalApproximationHalfWidth(positiveStrong, pooledPositive.sampleCount),
      trainCiHalfWidth: normalApproximationHalfWidth(trainStrong, humanTrain.sampleCount),
      devCiHalfWidth: normalApproximationHalfWidth(devStrong, humanDev.sampleCount)
    },
    gates: {
      trainSuspiciousOrHigherRate: humanTrain.suspiciousOrHigherRate <= 0.25,
      devSuspiciousOrHigherRate: humanDev.suspiciousOrHigherRate <= 0.25,
      positiveSuspiciousOrHigherRecall: pooledPositive.suspiciousOrHigherRate >= 0.9,
      positiveNgramRecall: pooledPositive.ngramHitRate >= 0.9
    }
  }
}

function gridSummary(grid) {
  const combinations = Object.values(grid).reduce((total, values) => total * values.length, 1)
  return { parameterCount: Object.keys(grid).length, combinations }
}

function isValidCandidate(candidate) {
  return candidate.scoreSuspicious <= candidate.scoreLikelyAi &&
    candidate.sentenceCVAdvisory <= candidate.sentenceCVStrong
}

function evaluateCandidate(candidate, trainRows, devRows, positiveRows, evaluated, invalid, seen) {
  if (!isValidCandidate(candidate)) {
    invalid.push({ candidate, reason: 'threshold-inverted' })
    return null
  }
  const signature = candidateSignature(candidate)
  if (seen.has(signature)) return null
  seen.add(signature)
  try {
    const item = { candidate: normalizeCandidate(candidate), metrics: scoreCandidate(candidate, trainRows, devRows, positiveRows) }
    evaluated.push(item)
    return item
  } catch (error) {
    invalid.push({ candidate: normalizeCandidate(candidate), reason: error.message })
    return null
  }
}

function cartesianProduct(entries) {
  if (!entries.length) return [{}]
  const [[key, values], ...rest] = entries
  const restProducts = cartesianProduct(rest)
  return values.flatMap(value => restProducts.map(product => ({ ...product, [key]: value })))
}

function median(values) {
  if (!values.length) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function seededInitialCandidates(grid) {
  const defaults = DEFAULT_CANDIDATE_CONSTANTS
  const candidates = []
  for (const scoreSuspicious of grid.scoreSuspicious) {
    for (const scoreLikelyAi of grid.scoreLikelyAi) {
      if (scoreSuspicious > scoreLikelyAi) continue
      candidates.push({
        ...Object.fromEntries(Object.entries(grid).map(([key, values]) => [key, median(values)])),
        scoreSuspicious,
        scoreLikelyAi
      })
    }
  }
  candidates.push({
    scoreSuspicious: defaults.defaultThresholds.scoreSuspicious,
    scoreLikelyAi: defaults.defaultThresholds.scoreLikelyAi,
    sentenceCVAdvisory: defaults.defaultThresholds.sentenceCVAdvisory,
    sentenceCVStrong: defaults.defaultThresholds.sentenceCVStrong,
    sentenceCVHighNgramBigram: defaults.defaultThresholds.sentenceCVHighNgramBigram,
    sentenceCVHighNgramTrigram: defaults.defaultThresholds.sentenceCVHighNgramTrigram,
    sentenceCVHighStyleDrift: defaults.defaultThresholds.sentenceCVHighStyleDrift,
    cvBaseContribution: defaults.cvContribution.base,
    cvExcessMultiplier: defaults.cvContribution.excessMultiplier,
    cvUncorroboratedCap: defaults.cvContribution.uncorroboratedCap,
    cvUncorroboratedMultiplier: defaults.cvContribution.uncorroboratedMultiplier,
    blockingWeight: defaults.scoreWeights.blocking,
    advisoryWeight: defaults.scoreWeights.advisory
  })
  return candidates
}

function beamSearch(trainRows, devRows, positiveRows, grid, { beamWidth, rounds }) {
  const evaluated = []
  const invalid = []
  const seen = new Set()
  let beam = []
  for (const candidate of seededInitialCandidates(grid)) {
    const item = evaluateCandidate(candidate, trainRows, devRows, positiveRows, evaluated, invalid, seen)
    if (item) beam.push(item)
  }
  if (!beam.length) throw new Error(`candidate search produced no valid seed candidates (${invalid.length} invalid)`)
  beam.sort(compareCandidates)

  for (let round = 1; round <= rounds; round += 1) {
    const generated = []
    for (const item of beam) {
      for (const key of Object.keys(grid)) {
        for (const value of grid[key]) {
          if (item.candidate[key] === value) continue
          const next = evaluateCandidate(
            { ...item.candidate, [key]: value },
            trainRows,
            devRows,
            positiveRows,
            evaluated,
            invalid,
            seen
          )
          if (next) generated.push(next)
        }
      }
    }
    if (!generated.length) break
    const combined = [...beam, ...generated].sort(compareCandidates)
    beam = combined.slice(0, beamWidth)
  }

  if (evaluated.length > SEARCH_EVALUATION_LIMIT) {
    throw new Error(`candidate search exceeded evaluation limit: ${evaluated.length} > ${SEARCH_EVALUATION_LIMIT}`)
  }
  return { evaluated, invalid, search: { strategy: 'deterministic-beam', beamWidth, rounds, evaluatedCount: evaluated.length } }
}

function exactSearch(trainRows, devRows, positiveRows, grid) {
  const evaluated = []
  const invalid = []
  const seen = new Set()
  for (const candidate of cartesianProduct(Object.entries(grid))) {
    evaluateCandidate(candidate, trainRows, devRows, positiveRows, evaluated, invalid, seen)
  }
  if (!evaluated.length) throw new Error(`candidate search produced no valid candidates (${invalid.length} invalid)`)
  return { evaluated, invalid, search: { strategy: 'exact-enumeration', evaluatedCount: evaluated.length } }
}

export function generateCandidates(trainRows, devRows, positiveRows, {
  searchSpace,
  strategy = 'auto',
  beamWidth = 24,
  rounds = 4
} = {}) {
  if (!Number.isInteger(beamWidth) || beamWidth < 1) throw new Error(`beamWidth must be a positive integer: ${beamWidth}`)
  if (!Number.isInteger(rounds) || rounds < 1) throw new Error(`rounds must be a positive integer: ${rounds}`)
  const grid = searchSpace ?? buildSearchSpace({})
  const summary = gridSummary(grid)
  const effectiveStrategy = strategy === 'auto'
    ? (summary.combinations <= beamWidth * Object.keys(grid).length ? 'exact' : 'beam')
    : strategy
  const { evaluated, invalid, search } = effectiveStrategy === 'exact'
    ? exactSearch(trainRows, devRows, positiveRows, grid)
    : beamSearch(trainRows, devRows, positiveRows, grid, { beamWidth, rounds })

  const trainEligible = evaluated.filter(item => item.metrics.gates.trainSuspiciousOrHigherRate)
  const devEligible = trainEligible.filter(item => item.metrics.gates.devSuspiciousOrHigherRate)
  const recallEligible = devEligible.filter(item =>
    item.metrics.gates.positiveSuspiciousOrHigherRecall &&
    item.metrics.gates.positiveNgramRecall)
  const selectedPool = recallEligible.length ? recallEligible : devEligible.length ? devEligible : trainEligible.length ? trainEligible : evaluated
  const ranked = [...selectedPool].sort(compareCandidates)
  return {
    ...summary,
    search,
    validCount: evaluated.length,
    invalidCount: invalid.length,
    trainEligibleCount: trainEligible.length,
    devEligibleCount: devEligible.length,
    fullyEligibleCount: recallEligible.length,
    selectedPool: recallEligible.length ? 'fullyEligible' : devEligible.length ? 'devEligible' : trainEligible.length ? 'trainEligible' : 'allValid',
    invalid,
    candidates: ranked,
    diagnostics: {
      trainEligible,
      devEligible,
      fullyEligible: recallEligible
    }
  }
}

export function rankHeldOut(candidates, heldOutRows, positiveHeldOutRows) {
  return candidates.map(item => ({
    ...item,
    heldOut: (() => {
      const scored = scoreCandidate(item.candidate, heldOutRows, heldOutRows, positiveHeldOutRows)
      return { human: scored.train, positive: scored.positive, constraints: scored.constraints, objective: scored.objective }
    })()
  }))
}

export function normalApproximationCi(successes, total) {
  if (!total) return { estimate: 0, lower: 0, upper: 0 }
  const estimate = successes / total
  const halfWidth = normalApproximationHalfWidth(successes, total)
  return {
    estimate: Number(estimate.toFixed(4)),
    lower: Number(Math.max(0, estimate - halfWidth).toFixed(4)),
    upper: Number(Math.min(1, estimate + halfWidth).toFixed(4))
  }
}

function makeValueStats(values) {
  if (!values.length) return { count: 0, estimate: 0, lower: 0, upper: 0 }
  return normalApproximationCi(Math.round(values.reduce((a, b) => a + b, 0)), values.length)
}

export function summarizeHeldOut(candidate, rows, positiveRows) {
  if (!candidate) return null
  const decisions = rows.map(row => ({ row, decision: evaluateCandidateRow(row, candidate) }))
  const positiveDecisions = positiveRows.map(row => ({ row, decision: evaluateCandidateRow(row, candidate) }))
  const humanStrong = decisions.filter(({ decision }) => STRONG_VERDICTS.includes(decision.verdict)).length
  const positiveStrong = positiveDecisions.filter(({ decision }) => STRONG_VERDICTS.includes(decision.verdict)).length
  const positiveNgram = positiveDecisions.filter(({ row }) => row.repeatedBigramCount > 0 || row.repeatedTrigramCount > 0).length
  return {
    candidate,
    human: {
      sampleCount: decisions.length,
      strongCount: humanStrong,
      suspiciousOrHigherRate: Number((humanStrong / (decisions.length || 1)).toFixed(4)),
      ci: normalApproximationCi(humanStrong, decisions.length),
      verdicts: decisions.reduce((acc, { decision }) => {
        acc[decision.verdict] = (acc[decision.verdict] || 0) + 1
        return acc
      }, {})
    },
    positive: {
      sampleCount: positiveDecisions.length,
      strongCount: positiveStrong,
      suspiciousOrHigherRecall: Number((positiveStrong / (positiveDecisions.length || 1)).toFixed(4)),
      ngramRecall: Number((positiveNgram / (positiveDecisions.length || 1)).toFixed(4)),
      ci: normalApproximationCi(positiveStrong, positiveDecisions.length),
      byGroup: Object.fromEntries(Object.entries(
        positiveDecisions.reduce((acc, { row, decision }) => {
          const key = row.groupKey || 'unknown'
          if (!acc[key]) acc[key] = []
          acc[key].push(STRONG_VERDICTS.includes(decision.verdict) ? 1 : 0)
          return acc
        }, {})
      ).map(([key, values]) => [key, makeValueStats(values)]))
    }
  }
}

export function writeJsonArtifact(outputPath, value) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
