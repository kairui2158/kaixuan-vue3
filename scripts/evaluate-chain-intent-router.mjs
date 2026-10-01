import {
  classifyChainIntent,
  initIntentRouter,
  routeChainIntent,
} from '../src/services/chainIntentRouter.ts'
import {
  evaluateIntentCorpus,
  INTENT_CORPUS_SAMPLES,
} from '../src/services/chainIntentCorpus.ts'
import {
  SATURATED_INTENT_SAMPLES,
  SATURATED_PHRASE_ENTRIES,
  PHRASE_CORPUS_GROUPS,
} from '../src/services/chainIntentPhraseCorpus.ts'
import {
  ADVERSARIAL_INTENT_SAMPLES,
  HOLDOUT_REAL_TRACE_SAMPLES,
  NEGATIVE_INTENT_SAMPLES,
} from '../src/services/chainIntentEvalData.ts'

function formatFailure(failure) {
  const expected = failure.expectedIntent
  const actual = failure.actualIntent ?? 'unknown'
  return `  [${failure.source || 'unlabeled'}] ${failure.input}\n    expected=${expected} actual=${actual}`
}

function evaluateRouting(samples) {
  const failures = []
  const failureCategories = new Map()
  for (const sample of samples) {
    const result = routeChainIntent(sample.input)
    const actualIntent =
      result.kind === 'matched' ? result.intent : result.kind
    const passed =
      result.kind === 'matched' &&
      result.intent === sample.expectedIntent
    if (!passed) {
      const category =
        result.kind === 'matched'
          ? 'wrong-intent'
          : result.reason || result.kind
      failureCategories.set(
        category,
        (failureCategories.get(category) || 0) + 1,
      )
      failures.push({
        ...sample,
        actualIntent,
        category,
        reason: result.reason,
      })
    }
  }
  return {
    total: samples.length,
    correct: samples.length - failures.length,
    accuracy: samples.length === 0 ? 0 : (samples.length - failures.length) / samples.length,
    failures,
    failureCategories: [...failureCategories.entries()].map(
      ([category, count]) => ({ category, count }),
    ),
  }
}

function evaluateIntentMetrics(samples) {
  const intents = ['analyze', 'edit', 'generate', 'discuss']
  const rows = intents.map((intent) => {
    const expected = samples.filter((sample) => sample.expectedIntent === intent)
    const truePositive = expected.filter((sample) => {
      const result = routeChainIntent(sample.input)
      return result.kind === 'matched' && result.intent === intent
    }).length
    const predicted = samples.filter((sample) => {
      const result = routeChainIntent(sample.input)
      return result.kind === 'matched' && result.intent === intent
    }).length
    const falsePositive = predicted - truePositive
    const falseNegative = expected.length - truePositive
    const precision = predicted === 0 ? 1 : truePositive / predicted
    const recall = expected.length === 0 ? 1 : truePositive / expected.length
    const f1 =
      precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
    return {
      intent,
      expected: expected.length,
      predicted,
      truePositive,
      falsePositive,
      falseNegative,
      precision,
      recall,
      f1,
    }
  })
  return rows
}

const RULE_LAYER_REASONS = new Set([
  'empty-input',
  'router-degraded',
  'explicit-write-directive',
  'status-permission-question',
  'question-marker-only',
  'prohibition-rollback',
  'location-consult',
  'reference-request',
  'contextual-discussion',
])

function decisionLayer(result) {
  if (RULE_LAYER_REASONS.has(result.reason)) return 'L1-rule'
  if (result.reason.startsWith('continuation')) return 'L0-context'
  if (result.reason === 'await-user-contextual-reply') return 'L0-context'
  if (result.reason === 'user-confirmed-recommendation') return 'user-confirmation'
  if (result.reason === 'user-bypassed-routing') return 'user-bypass'
  return 'L2-keyword-tfidf'
}

function evaluateV6Dataset(name, samples) {
  const rows = samples.map(sample => {
    const result = routeChainIntent(sample.input)
    const actual =
      result.kind === 'matched'
        ? result.intent
        : result.kind
    const passed = actual === sample.expected
    return {
      dataset: name,
      input: sample.input,
      expected: sample.expected,
      actual,
      passed,
      source: sample.source,
      note: sample.note || null,
      reason: result.reason,
      confidence: result.confidence,
      layer: decisionLayer(result),
      fallbackMode: result.fallbackMode || null,
      candidates: result.candidates || null,
    }
  })
  const failures = rows.filter(row => !row.passed)
  const byLayer = new Map()
  const byReason = new Map()
  const bySource = new Map()
  for (const row of rows) {
    byLayer.set(row.layer, (byLayer.get(row.layer) || 0) + 1)
    if (!row.passed) {
      byReason.set(row.reason, (byReason.get(row.reason) || 0) + 1)
      bySource.set(row.source, (bySource.get(row.source) || 0) + 1)
    }
  }
  return {
    dataset: name,
    total: rows.length,
    correct: rows.length - failures.length,
    accuracy: rows.length === 0 ? 0 : (rows.length - failures.length) / rows.length,
    layerDistribution: [...byLayer.entries()].map(([layer, count]) => ({ layer, count })),
    failureReasons: [...byReason.entries()].map(([reason, count]) => ({ reason, count })),
    failureSources: [...bySource.entries()].map(([source, count]) => ({ source, count })),
    failures,
    rows,
  }
}

function riskyWriteFalsePositive(row) {
  return !row.passed && (row.actual === 'edit' || row.actual === 'generate')
}

function summarizeV6(datasets) {
  const allRows = datasets.flatMap(dataset => dataset.rows)
  const negativeRows = allRows.filter(row => row.dataset === 'negative-intent')
  const noMatchCorrect = negativeRows.filter(row => row.passed).length
  const writeFalseTriggers = allRows.filter(riskyWriteFalsePositive)
  const discussRows = allRows.filter(row => row.expected === 'discuss')
  const discussBlocked = discussRows.filter(
    row => !row.passed && (row.actual === 'no_match' || row.actual === 'ambiguous'),
  )
  return {
    generatedAt: new Date().toISOString(),
    routerVersion: 'v5-production-baseline',
    phase: 'intent-routing-v6-phase1',
    datasets: datasets.map(dataset => ({
      dataset: dataset.dataset,
      total: dataset.total,
      correct: dataset.correct,
      accuracy: Number(dataset.accuracy.toFixed(4)),
      layerDistribution: dataset.layerDistribution,
      failureReasons: dataset.failureReasons,
      failureSources: dataset.failureSources,
      failures: dataset.failures.map(failure => ({
        input: failure.input,
        expected: failure.expected,
        actual: failure.actual,
        source: failure.source,
        reason: failure.reason,
        confidence: Number(failure.confidence.toFixed(4)),
        layer: failure.layer,
        note: failure.note,
      })),
    })),
    metrics: {
      totalSamples: allRows.length,
      totalCorrect: allRows.filter(row => row.passed).length,
      negativeRejection: {
        total: negativeRows.length,
        rejected: noMatchCorrect,
        rate: negativeRows.length === 0 ? 0 : noMatchCorrect / negativeRows.length,
      },
      writeFalseTriggers: {
        count: writeFalseTriggers.length,
        samples: writeFalseTriggers.map(row => ({
          dataset: row.dataset,
          input: row.input,
          expected: row.expected,
          actual: row.actual,
          reason: row.reason,
        })),
      },
      discussBlocked: {
        total: discussRows.length,
        blocked: discussBlocked.length,
        samples: discussBlocked.map(row => ({
          dataset: row.dataset,
          input: row.input,
          actual: row.actual,
          reason: row.reason,
        })),
      },
    },
  }
}

await initIntentRouter()

const classification = evaluateIntentCorpus(
  input => classifyChainIntent(input).intent,
  INTENT_CORPUS_SAMPLES,
)
const routing = evaluateRouting(INTENT_CORPUS_SAMPLES)
const saturatedClassification = evaluateIntentCorpus(
  input => classifyChainIntent(input).intent,
  SATURATED_INTENT_SAMPLES,
)
const saturatedRouting = evaluateRouting(SATURATED_INTENT_SAMPLES)
const intentMetrics = evaluateIntentMetrics([
  ...INTENT_CORPUS_SAMPLES,
  ...SATURATED_INTENT_SAMPLES,
])

console.log(`chain intent corpus samples: ${INTENT_CORPUS_SAMPLES.length}`)
console.log(
  `saturated corpus samples: ${SATURATED_INTENT_SAMPLES.length}; phrases: ${SATURATED_PHRASE_ENTRIES.length}; groups: ${PHRASE_CORPUS_GROUPS.length}`,
)
console.log(
  `classification: ${classification.correct}/${classification.total} (${classification.accuracy.toFixed(4)})`,
)
for (const failure of classification.failures) {
  console.log(formatFailure(failure))
}
for (const failure of saturatedClassification.failures) {
  console.log(formatFailure(failure))
}
console.log(
  `routing: ${routing.correct}/${routing.total} (${routing.accuracy.toFixed(4)})`,
)
console.log(
  `routing failure categories: ${JSON.stringify(routing.failureCategories)}`,
)
for (const failure of routing.failures) {
  console.log(
    `  [${failure.source || 'unlabeled'}] ${failure.input}\n    expected=${failure.expectedIntent} actual=${failure.actualIntent} reason=${failure.reason}`,
  )
}
for (const failure of saturatedRouting.failures) {
  console.log(
    `  [${failure.groupName || 'unlabeled'}] ${failure.input}\n    expected=${failure.expectedIntent} actual=${failure.actualIntent} reason=${failure.reason}`,
  )
}
console.log(
  `saturated routing failure categories: ${JSON.stringify(saturatedRouting.failureCategories)}`,
)
console.log('routing precision/recall calibration:')
for (const row of intentMetrics) {
  console.log(
    `  ${row.intent}: expected=${row.expected} predicted=${row.predicted} tp=${row.truePositive} fp=${row.falsePositive} fn=${row.falseNegative} precision=${row.precision.toFixed(4)} recall=${row.recall.toFixed(4)} f1=${row.f1.toFixed(4)}`,
  )
}

const passed =
  classification.accuracy === 1 &&
  routing.accuracy === 1 &&
  saturatedClassification.accuracy === 1 &&
  saturatedRouting.accuracy === 1
if (!passed) process.exitCode = 1

const v6Datasets = [
  evaluateV6Dataset('holdout-real-trace', HOLDOUT_REAL_TRACE_SAMPLES),
  evaluateV6Dataset('adversarial-intent', ADVERSARIAL_INTENT_SAMPLES),
  evaluateV6Dataset('negative-intent', NEGATIVE_INTENT_SAMPLES),
]
const v6Summary = summarizeV6(v6Datasets)

console.log('intent routing v6 phase 1 baseline:')
for (const dataset of v6Summary.datasets) {
  console.log(
    `  ${dataset.dataset}: ${dataset.correct}/${dataset.total} (${dataset.accuracy.toFixed(4)}) layers=${JSON.stringify(dataset.layerDistribution)} failures=${JSON.stringify(dataset.failureReasons)}`,
  )
  for (const failure of dataset.failures) {
    console.log(
      `    [${failure.source}] ${failure.input}\n      expected=${failure.expected} actual=${failure.actual} reason=${failure.reason} layer=${failure.layer}`,
    )
  }
}
console.log(
  `  negative rejection: ${v6Summary.metrics.negativeRejection.rejected}/${v6Summary.metrics.negativeRejection.total} (${v6Summary.metrics.negativeRejection.rate.toFixed(4)})`,
)
console.log(
  `  write false triggers: ${v6Summary.metrics.writeFalseTriggers.count}`,
)
for (const trigger of v6Summary.metrics.writeFalseTriggers.samples) {
  console.log(
    `    [${trigger.dataset}] ${trigger.input} expected=${trigger.expected} actual=${trigger.actual} reason=${trigger.reason}`,
  )
}
console.log(
  `  discuss blocked: ${v6Summary.metrics.discussBlocked.blocked}/${v6Summary.metrics.discussBlocked.total}`,
)

if (process.argv.includes('--phase1-baseline')) {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const outputPath = path.join(process.cwd(), '_audit', 'intent-routing-v6-phase1-baseline.json')
  fs.writeFileSync(outputPath, `${JSON.stringify(v6Summary, null, 2)}\n`, 'utf8')
  console.log(`  baseline written: ${outputPath}`)
}
