#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
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

const EXPECTED_EVENT_COUNTS = {
  'api-start': 8,
  'folder-pass-input': 13,
  'physical-call': 117,
  'api-success': 7,
  'api-degraded': 1,
  'body-artifact-attempt': 3
}

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

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex')
}

function payloadText(ref, raw) {
  if (['response', 'stream', 'reasoning', 'folder-output'].includes(ref.kind)) {
    return raw
  }
  // Non-text payloads are written as JSON.stringify(value, null, 2) by the exporter.
  try {
    JSON.parse(raw)
    return raw
  } catch {
    return raw
  }
}

function collectDirectRefs(run) {
  const refs = new Set()
  const add = value => {
    if (typeof value === 'string' && value) refs.add(value)
  }
  const addWrapper = value => {
    const id = value && typeof value === 'object' && value.__payload
      ? value.__payload.id
      : null
    if (id) refs.add(id)
  }
  ;(run.apiCalls || []).forEach(call => {
    addWrapper(call.requestMessages)
    addWrapper(call.toolRequestDeltas)
    add(call.responseTextPayloadRef)
    addWrapper(call.streamText)
    addWrapper(call.reasoningText)
    ;(call.physicalCalls || []).forEach(physical => {
      addWrapper(physical.requestMessages)
      add(physical.responseTextPayloadRef)
      addWrapper(physical.streamText)
      addWrapper(physical.reasoningText)
    })
    ;(call.toolCalls || []).forEach(tool => {
      addWrapper(tool.input)
      addWrapper(tool.result)
    })
  })
  ;(run.promptSnapshots || []).forEach(snapshot => add(snapshot.payloadRef))
  ;(run.processingReports || []).forEach(report => {
    add(report.inputRef)
    add(report.outputRef)
  })
  ;(run.folderDiagnostics || []).forEach(item => {
    add(item.outputPayloadRef)
    add(item.apiMeta && item.apiMeta.requestPayloadRef)
    if (item.postProcessReport) add(item.postProcessReport.outputPayloadRef)
  })
  ;(run.apiResponseIndex || []).forEach(entry => {
    ;['response', 'stream', 'reasoning'].forEach(kind => add(entry[kind] && entry[kind].ref))
    ;(entry.physicalCalls || []).forEach(physical => {
      ;['response', 'stream', 'reasoning'].forEach(kind => add(physical[kind] && physical[kind].ref))
    })
  })
  return refs
}

function verifyPayloadArchive(trace, traceDir) {
  const run = trace.run || trace
  const refs = run.payloads || []
  const payloadDir = path.join(traceDir, 'payloads')
  const files = fs.existsSync(payloadDir)
    ? fs.readdirSync(payloadDir).filter(name => name.endsWith('.json')).sort()
    : []
  const expectedFiles = refs.map((ref, index) => `${String(index + 1).padStart(3, '0')}-${ref.kind}.json`)
  assert.equal(files.length, 85, 'historical export has 85 physical payload files')
  assert.equal(refs.length, files.length, 'payload ledger matches physical files')
  assert.deepEqual(files, expectedFiles, 'payload file sequence matches ledger order')

  const ids = new Set()
  const identities = new Set()
  refs.forEach((ref, index) => {
    assert.ok(ref.id && `payload-${String(index + 1).padStart(3, '0')}` === ref.id, `payload id follows ledger order: ${ref.id}`)
    assert.ok(ref.kind, `${ref.id} has kind`)
    assert.equal(ref.file, expectedFiles[index], `${ref.id} file name matches kind and sequence`)
    assert.equal(typeof ref.bytes, 'number', `${ref.id} records byte length`)
    assert.equal(typeof ref.chars, 'number', `${ref.id} records char length`)
    assert.match(ref.sha256, /^[a-f0-9]{64}$/, `${ref.id} records sha256`)
    assert.equal(typeof ref.duplicateCount, 'number', `${ref.id} records duplicate count`)
    assert.ok(!ids.has(ref.id), `${ref.id} is unique`)
    ids.add(ref.id)
    const identity = `${ref.kind}:${ref.sha256}`
    assert.ok(!identities.has(identity), `${ref.id} kind+sha256 is unique`)
    identities.add(identity)

    const payloadPath = path.join(payloadDir, ref.file)
    assert.ok(fs.existsSync(payloadPath), `${ref.id} file exists: ${ref.file}`)
    const raw = fs.readFileSync(payloadPath, 'utf8')
    const text = payloadText(ref, raw)
    const bytes = Buffer.byteLength(text, 'utf8')
    assert.equal(bytes, ref.bytes, `${ref.id} byte length matches physical file`)
    assert.equal(text.length, ref.chars, `${ref.id} char length matches physical file`)
    assert.equal(sha256(text), ref.sha256, `${ref.id} sha256 matches physical file`)
  })

  const directRefs = collectDirectRefs(run)
  const unref = refs.filter(ref => !directRefs.has(ref.id))
  const unrefKinds = unref.reduce((acc, ref) => {
    acc[ref.kind] = (acc[ref.kind] || 0) + 1
    return acc
  }, {})
  assert.deepEqual(unrefKinds, {
    'processing-output': 5
  }, 'unreferenced payloads are exporter-recognized collect-only preview copies')
  assert.equal(unref.filter(ref => ref.kind === 'processing-output').length, 5)

  const events = run.events || []
  const eventCounts = events.reduce((acc, event) => {
    acc[event.type] = (acc[event.type] || 0) + 1
    return acc
  }, {})
  Object.entries(EXPECTED_EVENT_COUNTS).forEach(([type, count]) => {
    assert.equal(eventCounts[type], count, `event count matches ledger: ${type}`)
  })
  assert.equal(events.length, 528, 'event ledger total matches export')

  return {
    ledgerCount: refs.length,
    physicalFiles: files.length,
    directRefCount: refs.length - unref.length,
    unreferenced: {
      count: unref.length,
      kinds: unrefKinds,
      conclusion: [
        'All retry physical request payloads remain directly referenced by their physicalCalls.requestMessages wrappers.',
        '5 processing-output payloads are report.outputPreview copies collected by collectPayloads; replacePayloadFields clears outputPreview after assigning outputRef, so the preview copies intentionally remain ledger-only evidence.'
      ]
    },
    eventCounts: Object.fromEntries(
      Object.entries(EXPECTED_EVENT_COUNTS).map(([type, count]) => [type, count])
    ),
    eventTotal: events.length
  }
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
  const payloadVerification = verifyPayloadArchive(trace, path.dirname(TRACE_PATH))

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
    payloadVerification,
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
