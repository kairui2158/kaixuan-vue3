import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const TRACE_ROOT = 'C:/Users/凯瑞/Desktop/SKILL调试文件'
const LEGACY_TRACES = [
  {
    id: 'authority-regression-20261003',
    path: `${TRACE_ROOT}/run-trace-outline-20261003-131806-deep/run-trace.json`,
    expectedSchemaVersion: 11,
    expectedIntent: 'discuss',
    expectedNoPermissionDecision: true,
  },
  {
    id: 'authority-regression-20260926',
    path: `${TRACE_ROOT}/run-trace-outline-20260926-212218-deep/run-trace.json`,
    expectedSchemaVersion: 9,
    expectedIntent: null,
    expectedNoPermissionDecision: true,
  },
]

function readTrace(report) {
  const text = readFileSync(resolve(report.path), 'utf8')
  const trace = JSON.parse(text)
  assert(trace && typeof trace === 'object', `${report.id}: trace root is an object`)
  assert(Array.isArray(trace.turns), `${report.id}: turns array is readable`)
  assert(Array.isArray(trace.apiCalls), `${report.id}: apiCalls array is readable`)
  return trace
}

const reports = []
for (const report of LEGACY_TRACES) {
  const trace = readTrace(report)
  assert.equal(
    trace.schemaVersion,
    report.expectedSchemaVersion,
    `${report.id}: legacy schema version is preserved without rewriting`,
  )

  const turnDecisionCount = trace.turns.filter(turn => turn?.permissionDecision != null).length
  const callDecisionCount = trace.apiCalls.filter(call => call?.permissionDecision != null).length
  const toolPolicyCount = trace.apiCalls
    .flatMap(call => call?.toolCalls || [])
    .filter(tool => tool?.defaultToolPolicy != null || tool?.riskLevel != null)
    .length

  assert.equal(
    turnDecisionCount,
    0,
    `${report.id}: no legacy turn fabricates a v12 permissionDecision`,
  )
  assert.equal(
    callDecisionCount,
    0,
    `${report.id}: no legacy API call fabricates a v12 permissionDecision`,
  )
  assert.equal(
    toolPolicyCount,
    0,
    `${report.id}: no legacy tool call fabricates v12 policy/risk fields`,
  )

  const firstTurn = trace.turns[0]
  if (report.expectedIntent) {
    assert.equal(
      firstTurn?.intent,
      report.expectedIntent,
      `${report.id}: original routed intent remains readable`,
    )
  }
  assert(
    firstTurn?.id && firstTurn?.userRequest !== undefined,
    `${report.id}: legacy turn identity and request remain readable`,
  )
  assert(
    (trace.apiCalls || []).some(call => call?.id),
    `${report.id}: legacy API-call identities remain readable`,
  )

  reports.push({
    id: report.id,
    path: report.path,
    schemaVersion: trace.schemaVersion,
    turns: trace.turns.length,
    apiCalls: trace.apiCalls.length,
    firstTurnIntent: firstTurn?.intent || null,
    legacyPermissionDecisions: turnDecisionCount + callDecisionCount,
    legacyToolPolicyFields: toolPolicyCount,
  })
}

console.log(JSON.stringify({
  schema: 'shenyi.skill-agent-authority.legacy-traces',
  version: 1,
  passed: reports.length,
  reports,
}, null, 2))
console.log('===== SKILL AGENT AUTHORITY LEGACY TRACE COMPATIBILITY PASSED =====')
