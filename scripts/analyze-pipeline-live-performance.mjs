import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-pipeline-parallelism-live-supplier')
const REPORT_PATH = path.join(EVIDENCE_ROOT, 'report.json')
const HEARTBEAT_PATH = path.join(EVIDENCE_ROOT, 'heartbeat.jsonl')
const PROVIDER_REQUESTS_PATH = path.join(EVIDENCE_ROOT, 'provider-requests.json')
const OUTPUT_PATH = path.join(EVIDENCE_ROOT, 'performance-accounting.json')

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

const report = readJson(REPORT_PATH)
const providerEvidence = readJson(PROVIDER_REQUESTS_PATH)
const proxyRequests = providerEvidence.proxyRequests || []
const applicationCalls = providerEvidence.applicationCalls?.calls || []
const heartbeats = fs.readFileSync(HEARTBEAT_PATH, 'utf8')
  .split('\n')
  .filter(line => line.trim())
  .map(line => JSON.parse(line))

const requests = proxyRequests.map(request => {
  // Proxy `at` is the request arrival timestamp; `durationMs` is appended when
  // the upstream response finishes, so the end must be computed forward.
  const startedAt = Date.parse(request.at)
  const durationMs = Number(request.durationMs || 0)
  return {
    kind: request.kind,
    status: request.status,
    failed: Boolean(request.failed),
    startedAt,
    endedAt: startedAt + durationMs,
    durationMs,
  }
})

const layerAliases = new Map([
  ['volumes', 'volumes'],
  ['volume', 'volumes'],
  ['chapters', 'chapters'],
  ['chapter', 'chapters'],
  ['body', 'body'],
])

const callsByRun = new Map()
for (const call of applicationCalls) {
  if (!callsByRun.has(call.pipelineRunId)) callsByRun.set(call.pipelineRunId, [])
  callsByRun.get(call.pipelineRunId).push(call)
}

const assignedRequestIndexes = new Set()
const callAssignments = new Map()
const chronologicalCalls = [...applicationCalls].sort((a, b) => a.startedAt - b.startedAt)
for (const call of chronologicalCalls) {
  const candidates = []
  for (let index = 0; index < requests.length; index += 1) {
    if (assignedRequestIndexes.has(index)) continue
    const request = requests[index]
    if (layerAliases.get(request.kind) !== call.layer) continue
    const overlap = Math.min(call.endedAt, request.endedAt) - Math.max(call.startedAt, request.startedAt)
    // A failed injected probe can have durationMs=0 and merely touch a
    // millisecond-scale application call, so allow overlap === 0.
    if (overlap < 0) continue
    const startsInsideCall = request.startedAt >= call.startedAt && request.startedAt <= call.endedAt
    candidates.push({ index, request, overlap, startsInsideCall })
  }
  // Retry calls can be only a few milliseconds long. Prefer the request that
  // starts inside that call window (for example the injected 401 probe) over
  // the next long streaming request that merely overlaps the retry boundary.
  const pool = candidates.filter(candidate => candidate.startsInsideCall)
  const usable = pool.length > 0 ? pool : candidates
  if (usable.length > 0) {
    const best = usable.reduce((left, right) => {
      const leftRank = left.startsInsideCall ? 1 : 0
      const rightRank = right.startsInsideCall ? 1 : 0
      if (leftRank !== rightRank) return leftRank > rightRank ? left : right
      if (left.startsInsideCall && right.startsInsideCall) {
        return left.request.startedAt <= right.request.startedAt ? left : right
      }
      return left.overlap >= right.overlap ? left : right
    })
    assignedRequestIndexes.add(best.index)
    callAssignments.set(call, best.request)
  }
}

const runs = [...callsByRun.entries()].map(([runId, calls]) => {
  const sortedCalls = [...calls].sort((a, b) => a.startedAt - b.startedAt)
  const layer = sortedCalls[0].layer
  const callsWithAccounting = sortedCalls.map(call => {
    const request = callAssignments.get(call)
    const supplierWaitMs = request ? request.durationMs : 0
    return {
      traceRunId: call.traceRunId,
      status: call.status,
      startedAt: call.startedAt,
      endedAt: call.endedAt,
      wallMs: call.durationMs,
      supplierWaitMs,
      localOverheadMs: Math.max(0, call.durationMs - supplierWaitMs),
      physicalRequestCount: request ? 1 : 0,
      requestStatus: request?.status ?? null,
      requestFailure: request?.failed ? request.failure ?? 'unknown' : null,
      error: call.error,
    }
  })
  const firstSeenAt = sortedCalls[0].startedAt
  const lastSeenAt = Math.max(...sortedCalls.map(call => call.endedAt))
  const wallMs = lastSeenAt - firstSeenAt
  const supplierWaitMs = callsWithAccounting.reduce((sum, call) => sum + call.supplierWaitMs, 0)
  const callWallMs = callsWithAccounting.reduce((sum, call) => sum + call.wallMs, 0)
  return {
    runId,
    layer,
    firstSeenAt,
    lastSeenAt,
    status: sortedCalls[sortedCalls.length - 1].status,
    wallMs,
    supplierWaitMs,
    localOverheadMs: callsWithAccounting.reduce((sum, call) => sum + call.localOverheadMs, 0),
    activeWallMs: callWallMs,
    queueOrGapMs: Math.max(0, wallMs - callWallMs),
    physicalRequestCount: callsWithAccounting.reduce((sum, call) => sum + call.physicalRequestCount, 0),
    applicationCallCount: callsWithAccounting.length,
    calls: callsWithAccounting,
  }
}).sort((a, b) => a.firstSeenAt - b.firstSeenAt)

const unassignedRequests = requests
  .map((request, index) => ({ request, index }))
  .filter(({ index }) => !assignedRequestIndexes.has(index))
if (unassignedRequests.length > 0) {
  throw new Error(`Unassigned provider requests: ${unassignedRequests.map(item => `${item.request.kind}@${item.request.startedAt}`).join(', ')}`)
}

const performance = report.performance || {}
const summary = {
  generatedAt: new Date().toISOString(),
  source: {
    report: path.relative(ROOT, REPORT_PATH),
    heartbeat: path.relative(ROOT, HEARTBEAT_PATH),
    providerRequests: path.relative(ROOT, PROVIDER_REQUESTS_PATH),
  },
  uiGate: {
    freezeCount: performance.freezeCount,
    slowClickFeedbackCount: performance.slowClickFeedbackCount,
    longTaskCount: performance.longTaskCount,
    clickFeedbackCount: performance.clickFeedbackCount,
    clickFeedbackBudgetMs: performance.thresholds?.clickFeedbackBudgetMs,
    responsivenessState: performance.responsivenessState,
    withinBudget: performance.withinBudget,
  },
  totals: {
    runCount: runs.length,
    wallMs: runs.reduce((sum, run) => sum + run.wallMs, 0),
    activeWallMs: runs.reduce((sum, run) => sum + run.activeWallMs, 0),
    queueOrGapMs: runs.reduce((sum, run) => sum + run.queueOrGapMs, 0),
    supplierWaitMs: runs.reduce((sum, run) => sum + run.supplierWaitMs, 0),
    localOverheadMs: runs.reduce((sum, run) => sum + run.localOverheadMs, 0),
    applicationCallCount: runs.reduce((sum, run) => sum + run.applicationCallCount, 0),
    physicalRequestCount: requests.length,
  },
  runs,
  accounting: {
    allProviderRequestsAssigned: unassignedRequests.length === 0,
  },
  verdict: unassignedRequests.length === 0
    && performance.freezeCount === 0
    && performance.slowClickFeedbackCount === 0
    && performance.longTaskCount === 0
    && performance.withinBudget === true
    ? 'PASS'
    : 'FAIL',
}

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(summary, null, 2), 'utf8')
console.log(JSON.stringify({
  outputPath: path.relative(ROOT, OUTPUT_PATH),
  verdict: summary.verdict,
  uiGate: summary.uiGate,
  totals: summary.totals,
  maxLocalOverheadMs: Math.max(...runs.map(run => run.localOverheadMs)),
}, null, 2))
if (summary.verdict !== 'PASS') process.exit(1)
