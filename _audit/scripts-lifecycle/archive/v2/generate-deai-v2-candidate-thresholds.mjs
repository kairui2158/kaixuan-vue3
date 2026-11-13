#!/usr/bin/env node
// Generate interpretable DEAI V2 candidate parameter proposals.
// This is a research instrument: it never mutates runtime thresholds or the corpus.

import path from 'node:path'
import { DeAiProcessor } from '../src/services/de-ai.js'
import {
  countWorks,
  deterministicModelSplit,
  deterministicWorkSplit,
  groupBy,
  loadHumanSamples,
  loadModelSamples
} from './lib/deai-calibration-corpus.mjs'
import {
  buildFeatureRows,
  buildSearchSpace,
  generateCandidates,
  rankHeldOut,
  summarizeHeldOut,
  writeJsonArtifact,
  DEFAULT_CANDIDATE_CONSTANTS
} from './lib/deai-v2-candidates.mjs'

const repoRoot = path.resolve(import.meta.dirname, '..')
const corpusRoot = process.env.DEAI_CALIBRATION_CORPUS_ROOT || 'D:/codex/deai-corpus'
const outputDir = path.join(repoRoot, '_audit', 'verification-deai-calibration')
const searchMode = process.env.DEAI_CANDIDATE_SEARCH_MODE || 'full'
const candidateLimit = Number(process.env.DEAI_CANDIDATE_LIMIT || 25)
const holdoutLimit = Number(process.env.DEAI_CANDIDATE_HOLDOUT_LIMIT || 5)
const beamWidth = Number(process.env.DEAI_CANDIDATE_BEAM_WIDTH || 24)
const searchRounds = Number(process.env.DEAI_CANDIDATE_SEARCH_ROUNDS || 4)

function fail(message) {
  console.error(`[generate-deai-v2-candidates] FAIL: ${message}`)
  process.exit(1)
}

function info(message) {
  console.error(`[generate-deai-v2-candidates] ${message}`)
}

function reportsFor(samples) {
  return samples.map(sample => {
    try {
      return { sample, report: DeAiProcessor.detectBody(sample.text, {}) }
    } catch (error) {
      return fail(`detectBody failed for ${sample.id}: ${error?.message || error}`)
    }
  })
}

function markBucket(samples, bucket) {
  for (const sample of samples) sample.bucket = bucket
}

function compareCandidate(candidate) {
  const defaults = DEFAULT_CANDIDATE_CONSTANTS.defaultThresholds
  const changes = []
  for (const key of ['scoreSuspicious', 'scoreLikelyAi', 'sentenceCVAdvisory', 'sentenceCVStrong']) {
    if (candidate[key] !== defaults[key]) changes.push({ parameter: key, from: defaults[key], to: candidate[key] })
  }
  const mapping = {
    sentenceCVHighNgramBigram: 'sentenceCVHighNgramBigram',
    sentenceCVHighNgramTrigram: 'sentenceCVHighNgramTrigram',
    sentenceCVHighStyleDrift: 'sentenceCVHighStyleDrift'
  }
  for (const [candidateKey, defaultKey] of Object.entries(mapping)) {
    if (candidate[candidateKey] !== defaults[defaultKey]) {
      changes.push({ parameter: candidateKey, from: defaults[defaultKey], to: candidate[candidateKey] })
    }
  }
  const scoreWeights = DEFAULT_CANDIDATE_CONSTANTS.scoreWeights
  for (const key of ['blocking', 'advisory']) {
    const candidateKey = `${key}Weight`
    if (candidate[candidateKey] !== scoreWeights[key]) {
      changes.push({ parameter: candidateKey, from: scoreWeights[key], to: candidate[candidateKey] })
    }
  }
  const cv = DEFAULT_CANDIDATE_CONSTANTS.cvContribution
  const cvMapping = {
    cvBaseContribution: 'base',
    cvExcessMultiplier: 'excessMultiplier',
    cvUncorroboratedCap: 'uncorroboratedCap',
    cvUncorroboratedMultiplier: 'uncorroboratedMultiplier'
  }
  for (const [candidateKey, defaultKey] of Object.entries(cvMapping)) {
    if (candidate[candidateKey] !== cv[defaultKey]) {
      changes.push({ parameter: candidateKey, from: cv[defaultKey], to: candidate[candidateKey] })
    }
  }
  return changes
}

function summarizeSplit(rows, positiveRows) {
  return {
    humanCount: rows.length,
    positiveCount: positiveRows.length
  }
}

function main() {
  if (!['full', 'minimal'].includes(searchMode)) fail(`unsupported search mode: ${searchMode}`)
  const seed = Number(process.env.DEAI_CALIBRATION_SEED || 20261029)
  const sampleCount = Number(process.env.DEAI_CALIBRATION_SAMPLE_COUNT || 1000)
  const humanSamples = loadHumanSamples(corpusRoot, 'generate-deai-v2-candidates')
  const modelSamples = loadModelSamples(corpusRoot, 'generate-deai-v2-candidates')
  const perWork = Math.min(100, Math.max(7, Math.floor((sampleCount || 1000) / countWorks(humanSamples))))
  const humanSplit = deterministicWorkSplit(humanSamples, { perWork, seed }, 'generate-deai-v2-candidates')
  const modelSplit = deterministicModelSplit(modelSamples, { seed }, 'generate-deai-v2-candidates')
  markBucket(humanSplit.train, 'train')
  markBucket(humanSplit.dev, 'dev')
  markBucket(humanSplit.heldOut, 'heldOut')
  markBucket(modelSplit.train, 'train')
  markBucket(modelSplit.dev, 'dev')
  markBucket(modelSplit.heldOut, 'heldOut')

  const humanTrainPairs = reportsFor(humanSplit.train)
  const humanDevPairs = reportsFor(humanSplit.dev)
  const humanHeldOutPairs = reportsFor(humanSplit.heldOut)
  const modelTrainPairs = reportsFor(modelSplit.train)
  const modelDevPairs = reportsFor(modelSplit.dev)
  const modelHeldOutPairs = reportsFor(modelSplit.heldOut)

  const trainRows = buildFeatureRows(humanTrainPairs)
  const devRows = buildFeatureRows(humanDevPairs)
  const heldOutRows = buildFeatureRows(humanHeldOutPairs)
  const positiveTrainRows = buildFeatureRows(modelTrainPairs)
  const positiveDevRows = buildFeatureRows(modelDevPairs)
  const positiveHeldOutRows = buildFeatureRows(modelHeldOutPairs)

  const searchSpace = buildSearchSpace({ mode: searchMode })
  const generated = generateCandidates(trainRows, devRows, positiveDevRows, {
    searchSpace,
    strategy: searchMode === 'minimal' ? 'exact' : 'beam',
    beamWidth,
    rounds: searchRounds
  })
  const top = generated.candidates.slice(0, candidateLimit)
  if (!top.length) fail('candidate search returned no ranked candidate')
  const recommended = {
    candidate: top[0].candidate,
    metrics: top[0].metrics
  }
  const heldOutRanked = rankHeldOut(top, heldOutRows, positiveHeldOutRows)
  const recommendedHeldOut = heldOutRanked.find(item => item.candidate === recommended.candidate)
  if (!recommendedHeldOut) fail('recommended candidate is missing from held-out review')
  recommended.heldOut = recommendedHeldOut.heldOut
  const heldOutSummary = summarizeHeldOut(recommended.candidate, heldOutRows, positiveHeldOutRows)

  const proposal = {
    recommendedCandidate: recommended.candidate,
    changesFromRuntimeDefaults: compareCandidate(recommended.candidate),
    selection: {
      trainSuspiciousOrHigherRate: recommended.metrics.train.suspiciousOrHigherRate,
      devSuspiciousOrHigherRate: recommended.metrics.dev.suspiciousOrHigherRate,
      devPositiveSuspiciousOrHigherRecall: recommended.metrics.positive.suspiciousOrHigherRate,
      devPositiveNgramRecall: recommended.metrics.positive.ngramHitRate,
      positiveDevByGroup: recommended.metrics.positiveByGroup,
      heldOutHumanSuspiciousOrHigherRate: recommended.heldOut.human.suspiciousOrHigherRate,
      heldOutPositiveSuspiciousOrHigherRecall: recommended.heldOut.positive.suspiciousOrHigherRecall,
      heldOutPositiveNgramRecall: recommended.heldOut.positive.ngramRecall,
      heldOutPositiveCi: recommended.heldOut.positive.ci,
      heldOutPositiveByGroup: recommended.heldOut.positive.byGroup
    },
    reviewDecision: 'needs-human-review',
    constraints: {
      runtimeMutationAllowed: false,
      provisionalRemovalAllowed: false,
      corpusMutationAllowed: false
    },
    evidence: {
      positiveSplit: {
        train: summarizeSplit(trainRows, positiveTrainRows),
        dev: summarizeSplit(devRows, positiveDevRows),
        heldOut: summarizeSplit(heldOutRows, positiveHeldOutRows)
      },
      groupCounts: Object.entries(groupBy(modelSamples, sample => `${sample.provider}/${sample.model}`))
        .map(([key, samples]) => ({ key, sampleCount: samples.length }))
    }
  }

  const result = {
    generatedAt: new Date().toISOString(),
    schemaVersion: 1,
    corpusRoot,
    search: {
      mode: searchMode,
      parameterCount: generated.parameterCount,
      combinations: generated.combinations,
      strategy: generated.search.strategy,
      beamWidth: generated.search.beamWidth ?? null,
      rounds: generated.search.rounds ?? null,
      evaluatedCount: generated.search.evaluatedCount,
      exhaustive: generated.search.strategy === 'exact-enumeration',
      validCount: generated.validCount,
      invalidCount: generated.invalidCount,
      trainEligibleCount: generated.trainEligibleCount,
      devEligibleCount: generated.devEligibleCount,
      fullyEligibleCount: generated.fullyEligibleCount,
      selectedPool: generated.selectedPool
    },
    corpus: {
      humanLabels: humanSamples.length,
      humanTrain: trainRows.length,
      humanDev: devRows.length,
      humanHeldOut: heldOutRows.length,
      modelPositives: modelSamples.length,
      modelTrain: positiveTrainRows.length,
      modelDev: positiveDevRows.length,
      modelHeldOut: positiveHeldOutRows.length,
      seed,
      perWork,
      worksByBucket: humanSplit.worksByBucket,
      splitUnit: 'author/work for human; provider/model for positives',
      eligibility: '1500-6000 non-whitespace chars for human labels'
    },
    proposal,
    heldOutSummary,
    rankedCandidates: heldOutRanked.slice(0, holdoutLimit).map(item => ({
      candidate: item.candidate,
      train: item.metrics.train,
      dev: item.metrics.dev,
      positiveDev: item.metrics.positive,
      heldOutHuman: item.heldOut.human,
      heldOutPositive: item.heldOut.positive
    })),
    methodology: {
      detector: 'src/services/de-ai.js DeAiProcessor.detectBody (current runtime, unmodified)',
      candidateEvaluator: 'interpretable score-threshold and sentence-CV family',
      selection: 'train false-positive gate -> dev false-positive and recall gates -> objective ranking',
      objective: 'positive suspicious+ recall - 1.6 * human train suspicious+ rate - 1.6 * human dev suspicious+ rate',
      heldOutPolicy: 'held-out is evaluated once after train/dev selection and never used for search or recommendation',
      confidenceIntervalPolicy: 'CI half-width is reported as evidence at candidate-generation depth; the authoritative release gate still enforces CI thresholds',
      limits: [
        'Model positives are split by provider/model because sample depth is insufficient for work-level positive splits.',
        'Candidate proposals cannot loosen the existing release gate; they are evidence for review only.',
        'The current corpus has fewer than 30 samples in some model groups, so model-group release gates remain authoritative.',
        'Full mode uses deterministic beam search; it is not exhaustive over the complete Cartesian space.'
      ]
    }
  }

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  const outputPath = path.join(outputDir, `deai-v2-candidate-thresholds-${stamp}.json`)
  writeJsonArtifact(outputPath, result)
  info(`searchMode=${searchMode} strategy=${generated.search.strategy} combinations=${generated.combinations} evaluated=${generated.search.evaluatedCount} valid=${generated.validCount} fullyEligible=${generated.fullyEligibleCount}`)
  info(`selected trainFPR=${recommended.metrics.train.suspiciousOrHigherRate} devFPR=${recommended.metrics.dev.suspiciousOrHigherRate} devRecall=${recommended.metrics.positive.suspiciousOrHigherRate}`)
  info(`heldOut humanFPR=${recommended.heldOut.human.suspiciousOrHigherRate} positiveRecall=${heldOutSummary?.positive.suspiciousOrHigherRecall ?? 'n/a'} ngramRecall=${heldOutSummary?.positive.ngramRecall ?? 'n/a'}`)
  info(`artifact: ${outputPath}`)
}

main()
