import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  DEFAULT_CANDIDATE_CONSTANTS,
  buildFeatureRow,
  buildSearchSpace,
  evaluateCandidateRow,
  generateCandidates,
  rankHeldOut,
  summarizeHeldOut,
  writeJsonArtifact
} from '../lib/deai-v2-candidates.mjs'
import { DeAiProcessor } from '../../src/services/de-ai.js'

const cases = []
function test(name, fn) {
  cases.push({ name, fn })
}

function candidate(overrides = {}) {
  return {
    scoreSuspicious: 45,
    scoreLikelyAi: 65,
    sentenceCVAdvisory: 1,
    sentenceCVStrong: 1.1,
    sentenceCVHighNgramBigram: 900,
    sentenceCVHighNgramTrigram: 300,
    sentenceCVHighStyleDrift: 0.2,
    cvBaseContribution: 28,
    cvExcessMultiplier: 20,
    cvUncorroboratedCap: 18,
    cvUncorroboratedMultiplier: 10,
    blockingWeight: 12,
    advisoryWeight: 6,
    ...overrides
  }
}

function row(overrides = {}) {
  return {
    id: 'row',
    author: 'author',
    work: 'work',
    genre: 'genre',
    bucket: 'train',
    baseScore: 0,
    sentenceLengthCV: 1.5,
    styleDriftDelta: 0,
    repeatedBigramCount: 0,
    repeatedTrigramCount: 0,
    currentCvContribution: 0,
    currentBlockingCount: 0,
    currentAdvisoryCount: 0,
    ...overrides
  }
}

test('default candidate reproduces runtime CV contribution', () => {
  const unchanged = evaluateCandidateRow(row({
    sentenceLengthCV: 1.5,
    repeatedBigramCount: 900,
    currentCvContribution: 36
  }), candidate())
  assert.equal(unchanged.score, 36)
  assert.equal(unchanged.verdict, 'advisory')
  const isolated = evaluateCandidateRow(row({
    sentenceLengthCV: 1.5,
    repeatedBigramCount: 900,
    currentCvContribution: 0
  }), candidate())
  assert.equal(isolated.score, 36)
  assert.equal(isolated.verdict, 'advisory')
})

test('default candidate reproduces runtime base score', () => {
  const input = [
    '他忽然停住，肩膀绷紧，呼吸停滞，所有人的目光都压过来。',
    '短。',
    '短。',
    '短。',
    '短。',
    '短。',
    '短。'
  ].join('\n')
  const report = DeAiProcessor.detectBody(input)
  const feature = buildFeatureRow({ report, sample: { id: 'sample', bucket: 'dev' } })
  const decision = evaluateCandidateRow(feature, candidate())
  assert.equal(decision.score, report.score)
})

test('uncorroborated high CV is capped and can be disabled', () => {
  const active = evaluateCandidateRow(row({ sentenceLengthCV: 2, currentCvContribution: 0 }), candidate())
  assert.equal(active.score, 9)
  const disabled = evaluateCandidateRow(row({ sentenceLengthCV: 2 }), candidate({
    cvUncorroboratedCap: 0,
    cvUncorroboratedMultiplier: 0
  }))
  assert.equal(disabled.score, 0)
})

test('inverted candidate thresholds are rejected', () => {
  assert.throws(() => evaluateCandidateRow(row(), candidate({ scoreSuspicious: 70, scoreLikelyAi: 65 })), /inverted/)
})

test('minimal search keeps split thresholds fixed', () => {
  const grid = buildSearchSpace({ mode: 'minimal' })
  assert.deepEqual(grid.scoreSuspicious, [45])
  assert.deepEqual(grid.sentenceCVStrong, [1.1])
  assert.equal(Object.values(grid).reduce((total, values) => total * values.length, 1), 512)
})

test('candidate generation reports eligibility stages', () => {
  const trainRows = [row({ id: 'h1', baseScore: 20, sentenceLengthCV: 0.5 })]
  const devRows = [row({ id: 'h2', baseScore: 20, sentenceLengthCV: 0.5, bucket: 'dev' })]
  const positiveRows = [row({ id: 'p1', baseScore: 20, sentenceLengthCV: 2, repeatedBigramCount: 900, bucket: 'dev' })]
  const result = generateCandidates(trainRows, devRows, positiveRows, {
    searchSpace: {
      scoreSuspicious: [45],
      scoreLikelyAi: [65],
      sentenceCVAdvisory: [1],
      sentenceCVStrong: [1.1],
      sentenceCVHighNgramBigram: [900],
      sentenceCVHighNgramTrigram: [300],
      sentenceCVHighStyleDrift: [0.2],
      cvBaseContribution: [28, 32],
      cvExcessMultiplier: [20],
      cvUncorroboratedCap: [18],
      cvUncorroboratedMultiplier: [10],
      blockingWeight: [12],
      advisoryWeight: [6]
    }
  })
  assert.equal(result.validCount, 2)
  assert.equal(result.fullyEligibleCount, 2)
  assert.deepEqual(result.candidates.map(item => item.candidate.cvBaseContribution).sort((a, b) => a - b), [28, 32])
})

test('held-out is evaluated once and does not mutate ranking candidates', () => {
  const trainRows = [row({ id: 'h1', baseScore: 20, sentenceLengthCV: 0.5 })]
  const devRows = [row({ id: 'h2', baseScore: 20, sentenceLengthCV: 0.5, bucket: 'dev' })]
  const positiveRows = [row({ id: 'p1', baseScore: 20, sentenceLengthCV: 2, repeatedBigramCount: 900 })]
  const generated = generateCandidates(trainRows, devRows, positiveRows, {
    searchSpace: {
      scoreSuspicious: [45],
      scoreLikelyAi: [65],
      sentenceCVAdvisory: [1],
      sentenceCVStrong: [1.1],
      sentenceCVHighNgramBigram: [900],
      sentenceCVHighNgramTrigram: [300],
      sentenceCVHighStyleDrift: [0.2],
      cvBaseContribution: [28],
      cvExcessMultiplier: [20],
      cvUncorroboratedCap: [18],
      cvUncorroboratedMultiplier: [10],
      blockingWeight: [12],
      advisoryWeight: [6]
    }
  })
  const heldOutRows = [row({ id: 'h3', baseScore: 20, sentenceLengthCV: 0.5, bucket: 'heldOut' })]
  const positiveHeldOutRows = [row({ id: 'p2', baseScore: 20, sentenceLengthCV: 2, repeatedBigramCount: 900 })]
  const ranked = rankHeldOut(generated.candidates, heldOutRows, positiveHeldOutRows)
  const summary = summarizeHeldOut(ranked[0].candidate, heldOutRows, positiveHeldOutRows)
  const reviewed = summarizeHeldOut(ranked[0].candidate, heldOutRows, positiveHeldOutRows)
  assert.equal(summary.human.suspiciousOrHigherRate, 0)
  assert.equal(summary.positive.suspiciousOrHigherRecall, 1)
  assert.equal(reviewed.candidate, ranked[0].candidate)
  assert.equal(summary.positive.suspiciousOrHigherRecall, reviewed.positive.suspiciousOrHigherRecall)
  assert.equal(generated.candidates[0].metrics.positive.suspiciousOrHigherRate, 1)
})

test('beam search stays bounded, deterministic, and reports its true scope', () => {
  const trainRows = [
    row({ id: 'h1', baseScore: 10, sentenceLengthCV: 0.4, currentBlockingCount: 0, currentAdvisoryCount: 0 }),
    row({ id: 'h2', baseScore: 20, sentenceLengthCV: 0.5, currentBlockingCount: 0, currentAdvisoryCount: 1 })
  ]
  const devRows = [
    row({ id: 'h3', baseScore: 10, sentenceLengthCV: 0.4, currentBlockingCount: 0, currentAdvisoryCount: 0, bucket: 'dev' })
  ]
  const positiveRows = [
    row({ id: 'p1', baseScore: 20, sentenceLengthCV: 2, repeatedBigramCount: 900, bucket: 'dev' })
  ]
  const options = { searchSpace: buildSearchSpace({ mode: 'full' }), beamWidth: 8, rounds: 3 }
  const first = generateCandidates(trainRows, devRows, positiveRows, options)
  const second = generateCandidates(trainRows, devRows, positiveRows, options)
  assert.equal(first.search.strategy, 'deterministic-beam')
  assert.equal(first.search.evaluatedCount, second.search.evaluatedCount)
  assert.equal(first.validCount, second.validCount)
  assert.ok(first.search.evaluatedCount < first.combinations)
  assert.ok(first.search.evaluatedCount <= 200_000)
  assert.deepEqual(first.candidates.map(item => item.candidate), second.candidates.map(item => item.candidate))
})

test('feature rows preserve detector findings and defaults are frozen', () => {
  const input = [
    '他忽然停住，肩膀绷紧，呼吸停滞，所有人的目光都压过来。',
    '短。',
    '短。',
    '短。',
    '短。',
    '短。',
    '短。'
  ].join('\n')
  const report = DeAiProcessor.detectBody(input)
  const feature = buildFeatureRow({ report, sample: { id: 'sample', bucket: 'dev' } })
  assert.equal(feature.sentenceLengthCV, report.metrics.sentenceLengthCV)
  assert.equal(feature.currentCvContribution, report.findings.find(item => item.id === 'deai-sentence-cv-excess')?.contribution ?? 0)
  assert.equal(DEFAULT_CANDIDATE_CONSTANTS.defaultThresholds.scoreSuspicious, 45)
})

test('artifact writer creates parent directories and JSON output', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deai-candidates-'))
  const outputPath = path.join(directory, 'nested', 'result.json')
  writeJsonArtifact(outputPath, { ok: true })
  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, 'utf8')), { ok: true })
  fs.rmSync(directory, { recursive: true, force: true })
  assert.equal(fs.existsSync(outputPath), false)
})

let failed = 0
for (const item of cases) {
  try {
    item.fn()
    console.log(`PASS ${item.name}`)
  } catch (error) {
    failed += 1
    console.error(`FAIL ${item.name}`)
    console.error(error)
  }
}

if (failed > 0) {
  console.error(`${failed} test(s) failed`)
  process.exit(1)
}
console.log(`${cases.length} tests passed`)
