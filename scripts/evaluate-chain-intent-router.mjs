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

const passed =
  classification.accuracy === 1 &&
  routing.accuracy === 1 &&
  saturatedClassification.accuracy === 1 &&
  saturatedRouting.accuracy === 1
if (!passed) process.exitCode = 1
