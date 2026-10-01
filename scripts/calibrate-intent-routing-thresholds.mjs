import fs from 'node:fs'
import path from 'node:path'
import { embedTexts } from '../electron/ipc/intentEmbedding.js'
import {
  ADVERSARIAL_INTENT_SAMPLES,
  CHAIN_INTENT_EVAL_SPLITS,
  HOLDOUT_REAL_TRACE_SAMPLES,
  NEGATIVE_INTENT_SAMPLES,
} from '../src/services/chainIntentEvalData.ts'
import {
  INTENT_EXAMPLES,
  initIntentRouter,
  routeChainIntent,
} from '../src/services/chainIntentRouter.ts'
import { findSaturatedPhrases } from '../src/services/chainIntentPhraseCorpus.ts'

const WORKSPACE_SCOPE_CATEGORIES = [
  'outlineDomainTerms',
  'settingDomainTerms',
  'volumeDomainTerms',
  'chapterDomainTerms',
  'editorDomainTerms',
]

function isWorkspaceScoped(input) {
  return findSaturatedPhrases(input || '', WORKSPACE_SCOPE_CATEGORIES).length > 0
}

const OUTPUT_PATH = path.join(
  process.cwd(),
  '_audit',
  'intent-routing-v6-phase6-calibration.json',
)

const REAL_CORPUS_PACKAGE_PATH = process.env.SHENYI_INTENT_CORPUS_PACKAGE || ''
const SHADOW_CORPUS_PATH = process.env.SHENYI_INTENT_SHADOW_CORPUS || ''

function loadRealCorpusCandidates() {
  if (!REAL_CORPUS_PACKAGE_PATH) {
    return { samples: [], source: 'built-in' }
  }
  const raw = JSON.parse(fs.readFileSync(path.resolve(REAL_CORPUS_PACKAGE_PATH), 'utf8'))
  if (raw?.schema !== 'shenyi.intent-corpus-package') {
    throw new Error('real corpus package schema mismatch')
  }
  if (raw?.scope !== 'project') {
    throw new Error('real corpus package must be project-scoped')
  }
  const confirmed = (raw.samples || []).filter(sample => sample?.annotation === 'confirmed')
  return {
    samples: confirmed.map(sample => ({
      input: String(sample.requestText || ''),
      expected: sample?.routing?.kind === 'matched' ? sample.routing.intent : 'no_match',
      source: 'confirmed-real-corpus',
    })),
    source: REAL_CORPUS_PACKAGE_PATH,
  }
}

function loadShadowCorpus() {
  if (!SHADOW_CORPUS_PATH) return []
  const raw = JSON.parse(fs.readFileSync(path.resolve(SHADOW_CORPUS_PATH), 'utf8'))
  if (raw?.schema !== 'shenyi.shadow-intent-corpus') {
    throw new Error('shadow corpus schema mismatch')
  }
  return raw.samples || []
}

function cosine(left, right) {
  let dot = 0
  for (let index = 0; index < left.length; index += 1) dot += left[index] * right[index]
  return dot
}

async function embedInBatches(texts) {
  const batches = []
  for (let start = 0; start < texts.length; start += 16) {
    batches.push(texts.slice(start, start + 16))
  }
  const outputs = []
  for (const batch of batches) {
    outputs.push(...(await embedTexts(batch)).vectors)
  }
  return outputs
}

const realCorpus = loadRealCorpusCandidates()
const shadowSamples = loadShadowCorpus()
const allSamples = [
  ...HOLDOUT_REAL_TRACE_SAMPLES,
  ...ADVERSARIAL_INTENT_SAMPLES,
  ...NEGATIVE_INTENT_SAMPLES,
  ...realCorpus.samples,
]
if (shadowSamples.some(sample => allSamples.some(existing => existing.input === sample.text))) {
  throw new Error('shadow corpus leakage into calibration samples')
}
const splitForInput = new Map()
for (const [split, samples] of Object.entries(CHAIN_INTENT_EVAL_SPLITS)) {
  for (const sample of samples) splitForInput.set(sample.input, split)
}

await initIntentRouter()
const syncResults = allSamples.map(sample => routeChainIntent(sample.input || ''))
const needsEmbedding = syncResults.map(result =>
  result.kind === 'no_match' &&
  (result.reason === 'low-confidence' || result.reason === 'no-keyword-overlap'),
)
const embeddingSampleIndexes = allSamples
  .map((_, index) => index)
  .filter(index => needsEmbedding[index])
console.log(`sync routing: embedding candidates ${embeddingSampleIndexes.length}/${allSamples.length}`)

const intents = Object.keys(INTENT_EXAMPLES)
const exampleTexts = intents.flatMap(intent => INTENT_EXAMPLES[intent])
console.log(`embedding intent examples: ${exampleTexts.length}`)
const exampleVectorList = await embedInBatches(exampleTexts)
const intentVectors = {}
let cursor = 0
for (const intent of intents) {
  intentVectors[intent] = exampleVectorList.slice(cursor, cursor + INTENT_EXAMPLES[intent].length)
  cursor += INTENT_EXAMPLES[intent].length
}

const sampleTexts = embeddingSampleIndexes.map(index => allSamples[index].input || '')
console.log(`embedding evaluation samples: ${sampleTexts.length}`)
const sampleVectors = await embedInBatches(sampleTexts)
const ambiguityThresholdCandidates = {
  analyze: [0.06, 0.08, 0.10],
  edit: [0.08, 0.12, 0.16],
  generate: [0.08, 0.12, 0.16],
  discuss: [0.06, 0.08, 0.10],
}
const oosThresholdCandidates = [0.24, 0.26, 0.28, 0.30]
const scoredSamples = allSamples.map((sample, index) => ({
  ...sample,
  scores: needsEmbedding[index]
    ? Object.fromEntries(
        intents.map(intent => {
          const vector = sampleVectors[embeddingSampleIndexes.indexOf(index)]
          return [
            intent,
            {
              centroid:
                intentVectors[intent].reduce((sum, example) => sum + cosine(vector, example), 0) /
                (intentVectors[intent].length || 1),
              max: intentVectors[intent].reduce(
                (best, example) => Math.max(best, cosine(vector, example)),
                0,
              ),
            },
          ]
        }),
      )
    : null,
}))

const grid = []
const thresholdCandidates = {
  analyze: [0.30, 0.34, 0.36, 0.38, 0.40, 0.42, 0.44],
  edit: [0.34, 0.38, 0.40, 0.42, 0.44, 0.46, 0.48],
  generate: [0.34, 0.38, 0.40, 0.42, 0.44, 0.46, 0.48],
  discuss: [0.30, 0.34, 0.36, 0.38, 0.40, 0.42, 0.44],
}
for (const strategy of ['centroid', 'max']) {
  for (const oosThreshold of oosThresholdCandidates) {
    for (const analyze of thresholdCandidates.analyze) {
      for (const edit of thresholdCandidates.edit) {
        for (const generate of thresholdCandidates.generate) {
          for (const discuss of thresholdCandidates.discuss) {
            for (const ambiguityAnalyze of ambiguityThresholdCandidates.analyze) {
              for (const ambiguityEdit of ambiguityThresholdCandidates.edit) {
                for (const ambiguityGenerate of ambiguityThresholdCandidates.generate) {
                  for (const ambiguityDiscuss of ambiguityThresholdCandidates.discuss) {
            const thresholds = { analyze, edit, generate, discuss }
            const ambiguityThresholds = {
              analyze: ambiguityAnalyze,
              edit: ambiguityEdit,
              generate: ambiguityGenerate,
              discuss: ambiguityDiscuss,
            }
            const rows = scoredSamples.map((sample, index) => {
            const sync = syncResults[index]
            if (sync.kind === 'matched') return sync.intent
            if (sync.kind === 'ambiguous') return 'ambiguous'
          if (!sample.scores) return 'no_match'
          if (!isWorkspaceScoped(sample.input)) return 'no_match'
            const strategyScores = Object.fromEntries(
              Object.entries(sample.scores).map(([intent, score]) => [intent, score[strategy]]),
            )
            const ranked = Object.entries(strategyScores)
              .sort((left, right) => right[1] - left[1])
            const best = ranked[0]
            const second = ranked[1]
            if (best[1] < oosThreshold) return 'out-of-scope'
            if (best[1] < thresholds[best[0]]) return 'no_match'
            if (second && best[1] - second[1] < ambiguityThresholds[best[0]]) return 'ambiguous'
            return best[0]
          })
            const actual = (sample, index) => rows[index]
            const computeMetrics = samples => {
              const indexOfSample = sample => scoredSamples.indexOf(sample)
              const predicted = sample => actual(sample, indexOfSample(sample))
              return {
                total: samples.length,
                correct: samples.filter(sample => predicted(sample) === sample.expected).length,
                writeFalseTriggers: samples.filter(sample =>
                  ['edit', 'generate'].includes(predicted(sample)) &&
                  !['edit', 'generate'].includes(sample.expected),
                ).length,
                falseRejections: samples.filter(sample =>
                  sample.expected !== 'no_match' &&
                  ['no_match', 'ambiguous', 'out-of-scope'].includes(predicted(sample)),
                ).length,
                missedRejections: samples.filter(sample =>
                  sample.expected === 'no_match' &&
                  !['out-of-scope', 'no_match'].includes(predicted(sample)),
                ).length,
                discussBlocked: samples.filter(sample =>
                  sample.expected === 'discuss' &&
                  ['no_match', 'ambiguous', 'out-of-scope'].includes(predicted(sample)),
                ).length,
              }
            }
            const metrics = ['train', 'dev', 'test'].map(split => ({
              split,
              ...computeMetrics(scoredSamples.filter(sample => splitForInput.get(sample.input) === split)),
            }))
            const devMetrics = metrics.find(item => item.split === 'dev')
            grid.push({
              strategy,
              thresholds,
              ambiguityThresholds,
              oosThreshold,
              metrics,
              correct: devMetrics.correct,
              total: devMetrics.total,
              accuracy: devMetrics.correct / (devMetrics.total || 1),
              writeFalseTriggers: devMetrics.writeFalseTriggers,
              falseRejections: devMetrics.falseRejections,
              missedRejections: devMetrics.missedRejections,
              discussBlocked: devMetrics.discussBlocked,
            })
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

const valid = grid
  .filter(item => item.writeFalseTriggers === 0)
  .filter(item => item.missedRejections === 0)
  .sort((left, right) => {
    if (right.accuracy !== left.accuracy) return right.accuracy - left.accuracy
    if (left.falseRejections !== right.falseRejections) return left.falseRejections - right.falseRejections
    if (left.discussBlocked !== right.discussBlocked) return left.discussBlocked - right.discussBlocked
    if (left.missedRejections !== right.missedRejections) return left.missedRejections - right.missedRejections
    return right.correct - left.correct
  })

if (!valid.length) {
  const debug = grid
    .filter(item =>
      item.strategy === 'centroid' &&
      JSON.stringify(item.thresholds) === JSON.stringify({ analyze: 0.30, edit: 0.34, generate: 0.34, discuss: 0.30 }),
    )
    .slice(0, 1)
  console.error('debug candidate', JSON.stringify(debug[0]))
  const debugRows = scoredSamples.map((sample, index) => {
    const sync = syncResults[index]
    if (sync.kind === 'matched') return { input: sample.input, actual: sync.intent, expected: sample.expected, layer: 'sync' }
    if (sync.kind === 'ambiguous') return { input: sample.input, actual: 'ambiguous', expected: sample.expected, layer: 'sync' }
    if (!sample.scores) return { input: sample.input, actual: 'no_match', expected: sample.expected, layer: 'sync-no-match' }
    if (!isWorkspaceScoped(sample.input)) return { input: sample.input, actual: 'no_match', expected: sample.expected, layer: 'scope' }
    const scores = Object.fromEntries(Object.entries(sample.scores).map(([intent, score]) => [intent, Number(score.centroid.toFixed(4))]))
    const ranked = Object.entries(scores).sort((left, right) => right[1] - left[1])
    return { input: sample.input, actual: ranked[0][0], expected: sample.expected, layer: 'embedding', scores }
  }).filter(row =>
    (row.actual === 'edit' || row.actual === 'generate') &&
    row.expected !== 'edit' && row.expected !== 'generate',
  )
  console.error('write false triggers', JSON.stringify(debugRows, null, 2))
}

if (!valid.length) {
  const relaxed = [...grid].sort((left, right) => {
    if (left.writeFalseTriggers !== right.writeFalseTriggers) return left.writeFalseTriggers - right.writeFalseTriggers
    if (right.accuracy !== left.accuracy) return right.accuracy - left.accuracy
    return right.discussBlocked - left.discussBlocked
  })
  console.error(`no zero-write-false-trigger combination; best relaxed result=${JSON.stringify(relaxed[0])}`)
  throw new Error('No threshold combination achieves zero write false triggers')
}

const evidence = {
  schema: 'intent-routing-v6-phase6-calibration',
  generatedAt: new Date().toISOString(),
  model: 'Xenova/bge-small-zh-v1.5',
  sampleCount: scoredSamples.length,
  exampleCount: exampleTexts.length,
  realCorpus: {
    source: realCorpus.source,
    confirmedCount: realCorpus.samples.length,
  },
  shadowCorpus: {
    count: shadowSamples.length,
    role: 'diagnostic-only-not-calibrated',
  },
  selectionPolicy:
    'sync rule/keyword routing first; embedding only for low-confidence/no-keyword-overlap; per-intent risk margins; OOS threshold; thresholds selected on dev only; write false triggers and missed rejections must be 0; then accuracy, fewest false rejections, fewest discuss blocked',
  baseline: {
    strategy: 'centroid',
    thresholds: { analyze: 0.30, edit: 0.34, generate: 0.34, discuss: 0.30 },
    ambiguityThresholds: { analyze: 0.08, edit: 0.12, generate: 0.12, discuss: 0.08 },
    oosThreshold: 0.28,
  },
  best: valid.slice(0, 10),
  scoredSamples: scoredSamples.map((sample, index) => ({
      input: sample.input,
      expected: sample.expected,
      source: sample.source,
      split: splitForInput.get(sample.input) || 'adversarial-negative',
      sync: {
        kind: syncResults[index].kind,
        intent: syncResults[index].kind === 'matched' ? syncResults[index].intent : null,
        reason: syncResults[index].reason,
      },
      scores: sample.scores
        ? Object.fromEntries(
            Object.entries(sample.scores).map(([intent, score]) => [
              intent,
              {
                centroid: Number(score.centroid.toFixed(6)),
                max: Number(score.max.toFixed(6)),
              },
            ]),
          )
        : null,
    })),
}

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
console.log(`best strategy=${valid[0].strategy} thresholds: ${JSON.stringify(valid[0].thresholds)}`)
console.log(`dev accuracy: ${valid[0].correct}/${valid[0].total}; writeFalseTriggers=${valid[0].writeFalseTriggers}; discussBlocked=${valid[0].discussBlocked}`)
console.log(`split metrics: ${JSON.stringify(valid[0].metrics)}`)
console.log(`evidence: ${OUTPUT_PATH}`)
