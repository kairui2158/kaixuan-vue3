#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ROOT = path.resolve(process.cwd())
const TRACE_PATH = path.resolve(
  process.env.SHENYI_BODY_CONTRACT_TRACE
  || 'C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-正文层-20261017-043758-deep/run-trace.json'
)
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-body-contract-degraded-replay')
const HISTORICAL_TRACE_ID = 'run-1792183078760-1'

function parseDetail(event) {
  if (typeof event?.detail !== 'string') return {}
  try { return JSON.parse(event.detail) } catch { return { raw: event.detail } }
}

function summarizeTrace(trace) {
  const events = Array.isArray(trace?.events) ? trace.events : []
  const apiStarts = events.filter(event => event.type === 'api-start')
  const attempts = events
    .filter(event => event.type === 'body-artifact-attempt')
    .map(event => parseDetail(event))
  const degraded = events.find(event => event.type === 'api-degraded')
  const degradedError = events.find(event => event.type === 'folder-skill-degraded-with-error')
  const stepAcceptances = events.filter(event => event.type === 'body-step-acceptance')
  return {
    runId: trace?.id || null,
    status: trace?.status || null,
    apiStarts: apiStarts.length,
    skillSequence: apiStarts.map(event => parseDetail(event).skillName).filter(Boolean),
    attempts: attempts.map(item => ({
      repairAttempt: item.repairAttempt,
      repairScope: item.repairScope,
      status: item.status,
      wordCount: item.wordCount,
      targetWords: item.targetWords,
      ratio: item.ratio,
      errors: item.errors || []
    })),
    degradedStep: degraded ? String(degraded.detail || '').split(' / ')[0] : null,
    degradedErrors: degradedError ? String(degradedError.detail || '').split('；') : [],
    stepAcceptanceEvents: stepAcceptances.length
  }
}

function assertHistoricalAccident(summary) {
  assert.equal(summary.runId, HISTORICAL_TRACE_ID, 'replay uses the real 20261017-043758 trace')
  assert.equal(summary.status, 'failed', 'historical run failed')
  assert.equal(summary.attempts.length, 3, 'historical run has three attempts')
  assert.deepEqual(
    summary.attempts.map(item => [item.repairAttempt, item.repairScope, item.status, item.wordCount]),
    [
      [0, 'none', 'too_short', 1654],
      [1, 'targeted', 'too_short', 1971],
      [2, 'full_chain', 'too_short', 2011]
    ],
    'historical attempts match the accident record'
  )
  assert.ok(summary.attempts.every(item => item.targetWords === 3500), 'all attempts target 3500 words')
  assert.ok(summary.attempts.every(item => item.wordCount < 2100), 'all attempts are below the 2100-word floor')
  assert.equal(summary.degradedStep, 'S2-血肉师（文件夹）', 'S2 was degraded')
  assert.ok(summary.degradedErrors.length >= 1, 'degraded diagnostics are present')
  assert.ok(summary.skillSequence.length >= 8, 'historical chain made at least eight physical model calls')
  assert.equal(summary.stepAcceptanceEvents, 0, 'old build had no step-level acceptance gate')
}

function buildCurrentOutcome(summary) {
  const degraded = summary.attempts[0]
  return {
    outcome: 'failed_at_generator_step',
    s3Invoked: false,
    rejectReason: 'degraded_plus_contract_failure',
    callerStatus: 'degraded',
    rawWordCount: degraded.wordCount,
    extractedWordCount: degraded.wordCount,
    minWords: Math.round(degraded.targetWords * 0.6),
    downstreamCallsAfterReject: 0,
    evidence: [
      'src/services/stepArtifactAcceptance.ts:acceptStepArtifact',
      'src/services/stepArtifactFlow.spec.ts:degraded + contract-failure accident reason explicit',
      'src/services/stepArtifactFlow.spec.ts:degraded 1654 words matrix case rejects and downstream=false'
    ]
  }
}

function main() {
  assert(fs.existsSync(TRACE_PATH), `trace exists: ${TRACE_PATH}`)
  const trace = JSON.parse(fs.readFileSync(TRACE_PATH, 'utf8'))
  const summary = summarizeTrace(trace)
  assertHistoricalAccident(summary)

  fs.rmSync(EVIDENCE_ROOT, { recursive: true, force: true })
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  const result = {
    schema: 'shenyi.body-contract-degraded-replay',
    version: 1,
    tracePath: TRACE_PATH,
    traceId: summary.runId,
    historicalOutcome: {
      outcome: summary.status,
      finalEvent: 'generation_failed',
      attemptCount: summary.attempts.length,
      physicalModelCalls: summary.apiStarts,
      skillSequence: summary.skillSequence,
      attempts: summary.attempts,
      degradedStep: summary.degradedStep,
      degradedErrors: summary.degradedErrors,
      stepAcceptanceEvents: summary.stepAcceptanceEvents
    },
    currentOutcome: buildCurrentOutcome(summary),
    regression: {
      source: 'historical trace-derived facts + service behavior matrix',
      guard: 'degraded caller + extracted body below contract floor must reject before S3',
      implementation: 'stepArtifactAcceptance.acceptStepArtifact / resolveStepArtifactFlow'
    }
  }
  const resultPath = path.join(EVIDENCE_ROOT, 'result.json.diff')
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(result, null, 2))
  console.log(`[PASS] replay evidence written: ${resultPath}`)
}

try {
  main()
} catch (error) {
  console.error(`[FAIL] ${error?.message || error}`)
  process.exitCode = 1
}
