import fs from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import {
  ADVERSARIAL_INTENT_SAMPLES,
  HOLDOUT_REAL_TRACE_SAMPLES,
  INTENT_FACTORY_ACCRETION_SAMPLES,
  NEGATIVE_INTENT_SAMPLES,
} from '../src/services/chainIntentEvalData.ts'
import {
  createIntentMutationSeeds,
  generateIntentMutations,
} from '../src/services/intentMutationEngine.ts'
import {
  buildIntentTestManuscriptContext,
  INTENT_TEST_MANUSCRIPT_VERSION,
} from '../src/services/intentTestManuscript.ts'
import {
  initIntentRouter,
  routeChainIntentDetailed,
} from '../src/services/chainIntentRouter.ts'

const ROUND = Number(process.env.SHENYI_INTENT_FACTORY_ROUND || 1)
const OUTPUT_PATH = path.join(
  process.cwd(),
  '_audit',
  `intent-adversarial-factory-round-${ROUND}.json`,
)
const MANUSCRIPT_SAMPLE_COUNT = 80

const seedSamples = [
  ...HOLDOUT_REAL_TRACE_SAMPLES,
  ...ADVERSARIAL_INTENT_SAMPLES,
  ...NEGATIVE_INTENT_SAMPLES,
  ...INTENT_FACTORY_ACCRETION_SAMPLES,
]
const seeds = createIntentMutationSeeds(seedSamples)
const mutations = generateIntentMutations(seeds, {
  includeBronze: true,
  maxSamples: 2000,
})
const inputHash = createHash('sha256')
  .update(
    JSON.stringify(
      mutations.map(({ id, input, expectedIntent, trust }) => ({
        id,
        input,
        expectedIntent,
        trust,
      })),
    ),
  )
  .digest('hex')

function classifyFailure(sample, result) {
  const actual =
    result.kind === 'matched' ? result.intent : result.kind
  if (sample.expectedIntent === 'no_match') {
    if (['edit', 'generate'].includes(actual)) return 'writeFalseTrigger'
    if (actual !== 'no_match' && actual !== 'out-of-scope') return 'missedRejection'
    return null
  }
  if (['no_match', 'ambiguous', 'out-of-scope'].includes(actual)) {
    if (
      sample.expectedIntent === 'discuss' &&
      result.fallbackMode !== 'readonly-discuss'
    ) {
      return 'discussBlocked'
    }
    if (sample.expectedIntent === 'discuss') return null
    return 'falseRejection'
  }
  if (actual !== sample.expectedIntent) {
    if (['edit', 'generate'].includes(actual) && !['edit', 'generate'].includes(sample.expectedIntent)) {
      return 'writeFalseTrigger'
    }
    return 'intentMismatch'
  }
  return null
}

await initIntentRouter()

const rows = []
for (const sample of mutations) {
  const result = await routeChainIntentDetailed(sample.input)
  rows.push({
    id: sample.id,
    seedId: sample.seedId,
    mutationType: sample.mutationType,
    mutationRule: sample.mutationRule,
    input: sample.input,
    expected: sample.expectedIntent,
    trust: sample.trust,
    routing: {
      kind: result.kind,
      intent: result.kind === 'matched' ? result.intent : null,
      fallbackMode: 'fallbackMode' in result ? result.fallbackMode : null,
      reason: result.kind === 'no_match' ? result.reason : null,
      decisionLayer: result.diagnostics?.router?.decisionLayer || null,
      embeddingState: result.diagnostics?.router?.embeddingState || null,
    },
    failureType: classifyFailure(sample, result),
  })
}

const silverRows = rows.filter(row => row.trust === 'silver')
const bronzeRows = rows.filter(row => row.trust === 'bronze')
const failureRows = rows.filter(row => row.failureType)

const cluster = new Map()
for (const row of failureRows) {
  const key = `${row.failureType}::${row.mutationType}::${row.routing.kind}::${row.routing.reason || 'none'}`
  if (!cluster.has(key)) cluster.set(key, [])
  cluster.get(key).push(row.id)
}

const manuscriptCandidates = [
  ...silverRows.slice(0, MANUSCRIPT_SAMPLE_COUNT / 2),
  ...failureRows.slice(0, MANUSCRIPT_SAMPLE_COUNT / 2),
].slice(0, MANUSCRIPT_SAMPLE_COUNT)

const manuscriptRows = []
for (const row of manuscriptCandidates) {
  const bare = await routeChainIntentDetailed(row.input)
  const withContext = await routeChainIntentDetailed(
    row.input,
    {
      workspace: 'outline-workbench',
      recentHistory: [
        { role: 'system', content: buildIntentTestManuscriptContext('') },
      ],
    },
  )
  const bareKind = bare.kind === 'matched' ? bare.intent : bare.kind
  const contextKind = withContext.kind === 'matched' ? withContext.intent : withContext.kind
  manuscriptRows.push({
    id: row.id,
    input: row.input,
    expected: row.expected,
    trust: row.trust,
    bareResult: bareKind,
    contextResult: contextKind,
    consistent: bareKind === contextKind,
    contextRouting: {
      kind: withContext.kind,
      intent: withContext.kind === 'matched' ? withContext.intent : null,
      reason: withContext.kind === 'no_match' ? withContext.reason : null,
      decisionLayer: withContext.diagnostics?.router?.decisionLayer || null,
      embeddingState: withContext.diagnostics?.router?.embeddingState || null,
    },
  })
}

const counts = collection => {
  const output = {
    total: collection.length,
    writeFalseTriggers: 0,
    falseRejections: 0,
    missedRejections: 0,
    discussBlocked: 0,
    intentMismatches: 0,
  }
  for (const row of collection) {
    if (row.failureType === 'writeFalseTrigger') output.writeFalseTriggers += 1
    if (row.failureType === 'falseRejection') output.falseRejections += 1
    if (row.failureType === 'missedRejection') output.missedRejections += 1
    if (row.failureType === 'discussBlocked') output.discussBlocked += 1
    if (row.failureType === 'intentMismatch') output.intentMismatches += 1
  }
  return output
}

const consistentCount = manuscriptRows.filter(row => row.consistent).length
const report = {
  schema: 'shenyi.intent-adversarial-factory-report',
  version: 1,
  round: ROUND,
  generatedAt: new Date().toISOString(),
  corpus: {
    seedCount: seeds.length,
    silverCount: silverRows.length,
    bronzeCount: bronzeRows.length,
    maxSamples: 2000,
    inputHash,
  },
  manuscript: {
    version: INTENT_TEST_MANUSCRIPT_VERSION,
    sampleCount: manuscriptRows.length,
    consistency: consistentCount / (manuscriptRows.length || 1),
    inconsistentRows: manuscriptRows.filter(row => !row.consistent).slice(0, 40),
  },
  metrics: {
    silver: counts(silverRows),
    bronze: counts(bronzeRows),
    all: counts(rows),
  },
  clusters: Array.from(cluster.entries()).map(([key, ids]) => {
    const [failureType, mutationType, kind, reason] = key.split('::')
    return { failureType, mutationType, kind, reason: reason || null, count: ids.length, ids: ids.slice(0, 20) }
  }).sort((left, right) => right.count - left.count),
  failureRows: failureRows.slice(0, 200),
  rows: rows.map(row => ({
    id: row.id,
    mutationType: row.mutationType,
    expected: row.expected,
    trust: row.trust,
    routing: row.routing,
    failureType: row.failureType,
    input: row.input,
  })),
}

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

console.log(`round=${ROUND} seeds=${seeds.length} silver=${silverRows.length} bronze=${bronzeRows.length}`)
console.log(`silver metrics: ${JSON.stringify(report.metrics.silver)}`)
console.log(`bronze metrics: ${JSON.stringify(report.metrics.bronze)}`)
console.log(`manuscript consistency: ${(report.manuscript.consistency * 100).toFixed(2)}% (${consistentCount}/${manuscriptRows.length})`)
console.log(`clusters: ${report.clusters.length}`)
console.log(`report: ${OUTPUT_PATH}`)
