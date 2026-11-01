#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'

const ROOT = path.resolve(process.cwd())
const DEFAULT_TRACE = 'C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-正文层-20261102-011703-deep/run-trace.json'
const TRACE_PATH = path.resolve(process.env.SHENYI_RUN_TRACE_AUDIT_TRACE || DEFAULT_TRACE)
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-run-trace-audit')
const MIN_SCHEMA_VERSION = 20
const NARRATIVE_STATUSES = new Set([
  'declared_ready',
  'declared_not_ready',
  'undeclared',
  'unreadable_because_missing_handoff'
])

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex')
}

function fnv1a32(text) {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.codePointAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a32_${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function parseDetail(event) {
  if (typeof event?.detail !== 'string') return null
  try { return JSON.parse(event.detail) } catch { return null }
}

function payloadText(kind, raw) {
  return raw
}

function verifyFingerprint(run) {
  const fingerprint = run.runtimeFingerprint
  assert.ok(fingerprint, 'runtimeFingerprint exists')
  assert.equal(fingerprint.source, 'vite-manifest', 'runtimeFingerprint.source is vite-manifest')
  const fields = ['commit', 'buildTime', 'appVersion']
  fields.forEach(field => {
    assert.ok(typeof fingerprint[field] === 'string' && fingerprint[field], `runtimeFingerprint.${field} is non-empty`)
  })
  assert.equal(Number(run.schemaVersion), MIN_SCHEMA_VERSION, `run.schemaVersion is ${MIN_SCHEMA_VERSION}`)
  assert.ok(typeof fingerprint.manifestVersion === 'string' && fingerprint.manifestVersion,
    'runtimeFingerprint.manifestVersion is a non-empty build manifest schema')
  assert.equal(Number(run.exportSchemaVersion), MIN_SCHEMA_VERSION,
    'run.exportSchemaVersion matches trace schema')
  return fingerprint
}

function buildPayloadIndex(run, traceDir) {
  const payloadDir = path.join(traceDir, 'payloads')
  assert.ok(fs.existsSync(payloadDir), 'payload directory exists')
  const byId = new Map()
  run.payloads.forEach((entry, index) => {
    assert.ok(entry.id, `payload ${index + 1} has id`)
    assert.ok(!byId.has(entry.id), `${entry.id} is unique`)
    const filePath = path.join(payloadDir, entry.file)
    assert.ok(fs.existsSync(filePath), `${entry.id} file exists: ${entry.file}`)
    const raw = fs.readFileSync(filePath, 'utf8')
    const text = payloadText(entry.kind, raw)
    assert.equal(Buffer.byteLength(text, 'utf8'), entry.bytes, `${entry.id} bytes match ledger`)
    assert.equal(text.length, entry.chars, `${entry.id} chars match ledger`)
    assert.equal(sha256(text), entry.sha256, `${entry.id} sha256 matches ledger`)
    byId.set(entry.id, { entry, text })
  })
  return byId
}

function verifyCandidateAttribution(run, payloads) {
  const findings = []
  for (const call of run.apiCalls || []) {
    const retained = Number(call.retainedCandidateIndex || 0)
    if (retained > 0) {
      assert.ok(Array.isArray(call.candidateLedger) && retained <= call.candidateLedger.length,
        `${call.id} retainedCandidateIndex is within ledger`)
    }
  }
  for (const call of run.apiCalls || []) {
    const retained = Number(call.retainedCandidateIndex || 0)
    if (call.status !== 'degraded' || retained <= 0) continue
    assert.ok(Array.isArray(call.candidateLedger) && call.candidateLedger.length > 0, `${call.id} has candidateLedger`)
    assert.ok(retained <= call.candidateLedger.length, `${call.id} retainedCandidateIndex is within ledger`)
    const retainedEntry = call.candidateLedger[retained - 1]
    assert.equal(retainedEntry.retained, true, `${call.id} retained ledger entry is marked retained`)
    const physical = (call.physicalCalls || []).find(item =>
      fnv1a32(item.responseText || '') === retainedEntry.sourceResponseHash)
    assert.ok(physical, `${call.id} retained candidate points to a physical response`)
    assert.ok(payloads.has(physical.responseTextPayloadRef), `${call.id} retained physical response has payload ref`)
    findings.push({
      callId: call.id,
      retainedCandidateIndex: retained,
      sourceResponseHash: retainedEntry.sourceResponseHash,
      responsePayloadRef: physical.responseTextPayloadRef,
      rawChars: retainedEntry.rawChars
    })
  }
  return findings
}

function verifyEvents(run) {
  const events = run.events || []
  const attempts = events.filter(event => event.type === 'body-artifact-attempt').map(parseDetail)
  assert.ok(attempts.length > 0, 'body-artifact-attempt exists')
  attempts.forEach((attempt, index) => {
    assert.ok(attempt, `body-artifact-attempt ${index + 1} detail is valid JSON`)
    if (attempt.traceAuditFields) {
      assert.ok(typeof attempt.traceAuditFields.repairScope === 'string',
        `attempt ${index + 1} repair audit has repairScope`)
      assert.ok(typeof attempt.traceAuditFields.previousBodySource === 'string',
        `attempt ${index + 1} repair audit has previousBodySource`)
      assert.ok(typeof attempt.traceAuditFields.degradationReason === 'string',
        `attempt ${index + 1} repair audit has degradationReason`)
    }
  })

  if (run.status === 'failed') {
    const terminal = events.filter(event => event.type === 'body-artifact-terminal').map(parseDetail).at(-1)
    assert.ok(terminal, 'failed run has body-artifact-terminal')
    assert.ok(terminal.terminalReason && typeof terminal.terminalReason === 'string', 'terminalReason is non-empty')
    assert.ok(Array.isArray(terminal.decisionPath) && terminal.decisionPath.length > 0, 'decisionPath is non-empty array')
  } else {
    const validated = events.filter(event => event.type === 'body-artifact-validated').map(parseDetail).at(-1)
    assert.ok(validated, 'non-failed body run has body-artifact-validated')
    assert.ok(validated.terminalReason, 'validated terminalReason is non-empty')
    assert.ok(Array.isArray(validated.decisionPath), 'validated decisionPath is an array')
  }

  const narrative = events.filter(event => event.type === 'chapter-narrative-verdict').map(parseDetail)
  assert.ok(narrative.length > 0, 'chapter-narrative-verdict exists')
  narrative.forEach((verdict, index) => {
    assert.ok(verdict, `narrative verdict ${index + 1} detail is valid JSON`)
    assert.ok(NARRATIVE_STATUSES.has(verdict.status), `narrative verdict ${index + 1} status is one of four contract states`)
    if (Number(verdict.sourceCandidateIndex) > 0) {
      assert.match(verdict.sourceResponseHash || '', /^fnv1a32_[0-9a-fA-F]{8}$/,
        `narrative verdict ${index + 1} candidate hash is valid`)
    }
  })
  return {
    attemptCount: attempts.length,
    narrativeStatuses: narrative.map(item => item.status)
  }
}

function verifyResponseIndex(run, payloads) {
  const entries = run.apiResponseIndex || []
  assert.ok(entries.length > 0, 'apiResponseIndex is exported')
  entries.forEach((entry, index) => {
    const responseRef = entry.response?.ref
    assert.ok(responseRef && payloads.has(responseRef), `apiResponseIndex ${index + 1} response ref resolves`)
    const physical = entry.physicalCalls || []
    assert.ok(physical.length > 0, `apiResponseIndex ${index + 1} has physical calls`)
    physical.forEach((item, physicalIndex) => {
      assert.ok(item.response?.ref && payloads.has(item.response?.ref), `apiResponseIndex ${index + 1} physical ${physicalIndex + 1} response ref resolves`)
    })
  })
  return entries.map(entry => ({
    status: entry.status,
    response: entry.response?.ref,
    physicalCount: entry.physicalCalls?.length
  }))
}

function main() {
  assert.ok(fs.existsSync(TRACE_PATH), `trace exists: ${TRACE_PATH}`)
  const trace = JSON.parse(fs.readFileSync(TRACE_PATH, 'utf8'))
  const run = trace.run || trace
  const fingerprint = verifyFingerprint(run)
  const payloads = buildPayloadIndex(run, path.dirname(TRACE_PATH))
  const candidateFindings = verifyCandidateAttribution(run, payloads)
  const eventFindings = verifyEvents(run)
  const responseIndex = verifyResponseIndex(run, payloads)

  fs.rmSync(EVIDENCE_ROOT, { recursive: true, force: true })
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  const report = {
    schema: 'shenyi.run-trace-audit',
    version: 1,
    tracePath: TRACE_PATH,
    traceId: run.id,
    status: run.status,
    runtimeFingerprint: fingerprint,
    payloadCount: payloads.size,
    candidateAttribution: candidateFindings,
    eventAudit: eventFindings,
    responseIndex
  }
  const reportPath = path.join(EVIDENCE_ROOT, 'report.json')
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
  console.log(`[PASS] trace audit: ${run.id}; payloads=${payloads.size}; attempts=${eventFindings.attemptCount}; retained=${candidateFindings.length}`)
  console.log(`[PASS] report: ${path.relative(ROOT, reportPath)}`)
}

try {
  main()
} catch (error) {
  console.error(`[FAIL] ${error.message}`)
  process.exitCode = 1
}
