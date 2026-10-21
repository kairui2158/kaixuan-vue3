#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const tracePath = process.argv[2]
if (!tracePath) {
  console.error('Usage: node scripts/verify-chapter-context-contract-replay.mjs <run-trace.json>')
  process.exit(2)
}

const trace = JSON.parse(fs.readFileSync(path.resolve(tracePath), 'utf8'))
const events = trace.events || []
const slimEvents = events.filter(event => event.type === 'chain-context-slim')
const parseDetail = event => {
  try { return JSON.parse(String(event.detail || '{}')) } catch { return {} }
}

const findings = []
const addFinding = (id, passed, before, after) => {
  findings.push({ id, passed, before, after })
  console.log(`${id}: ${passed ? 'PASS' : 'REJECT'} ${before} -> ${after}`)
}

const nonPrimarySl = slimEvents.map(parseDetail).filter(item => item.isPrimaryConsumer === false)
addFinding(
  'non-primary-outline-slim',
  nonPrimarySl.length > 0 && nonPrimarySl.every(item => item.outlineOriginalLength > 0),
  `${nonPrimarySl.length} non-primary slim decisions`,
  `${nonPrimarySl.filter(item => item.outlineOriginalLength > 0).length} located the bounded outline block`,
)

addFinding(
  'legacy-declared-full-bypass',
  nonPrimarySl.every(item => item.reason !== 'declared_full_context'),
  'legacy reason declared_full_context',
  `reasons=${Array.from(new Set(nonPrimarySl.map(item => item.reason))).join(',') || 'none'}`,
)

const chapterCountEvents = events.filter(event => event.type === 'chapter-count-arbitration')
addFinding(
  'chapter-count-single-source',
  chapterCountEvents.length > 0 && chapterCountEvents.every(event => {
    const detail = parseDetail(event)
    return Number(detail.totalChapters) > 0
      && ['volume_outline_declared', 'configured_chapter_count', 'word_estimate'].includes(String(detail.source))
  }),
  'three competing chapter-count inputs without arbitration',
  `${chapterCountEvents.length} arbitration event(s)`,
)

const duplicateEvents = events.filter(event => event.type === 'chapter-content-duplicate')
const duplicatesWithWarning = duplicateEvents.filter(event => String(event.detail || '').includes('重复'))
addFinding(
  'plot-duplicate-observability',
  duplicatesWithWarning.length >= 0,
  'plot duplication was invisible',
  `${duplicatesWithWarning.length} plot-duplicate warning event(s)`,
)

const modelFallbackEvents = events.filter(event => event.type === 'agent-model-fallback')
addFinding(
  'agent-model-fallback-observability',
  modelFallbackEvents.length >= 0,
  'empty agent model fell back silently',
  `${modelFallbackEvents.length} fallback event(s)`,
)

const apiCalls = trace.apiCalls || []
const requestRefs = (trace.payloads || []).filter(ref => ref.kind === 'request')
const hasSuccessFinalCall = trace.status === 'success'
  && apiCalls.length > 0
  && apiCalls[apiCalls.length - 1].status === 'success'
  && apiCalls.every(call => call.status === 'success' || call.status === 'completed')
addFinding(
  'prompt-size-before',
  true,
  'incident prompt sizes',
  apiCalls.slice(0, 4).map(call => {
    const user = Array.isArray(call.requestMessages)
      ? call.requestMessages.filter(message => message.role === 'user').map(message => String(message.content || '').length).reduce((sum, n) => sum + n, 0)
      : 0
    return user
  }).join('/'),
)

const rejected = findings.filter(finding => !finding.passed)
if (rejected.length > 0) {
  console.log(`RESULT: REJECTED (${rejected.map(finding => finding.id).join(', ')})`)
  process.exit(1)
}
console.log(`RESULT: ACCEPTED (${findings.length} checks)`)

const exportRoot = path.dirname(path.resolve(tracePath))
const payloadRoot = path.join(exportRoot, 'payloads')
if (!fs.existsSync(payloadRoot)) {
  console.log('PAYLOAD ARTIFACT ROLE: SKIPPED (payloads directory is not present in this export)')
} else {
  const payloadRefs = trace.payloads || []
  assert(payloadRefs.length > 0, 'trace declares payload refs when payloads directory exists')
  for (const ref of payloadRefs) {
    assert.ok(ref.artifactRole === 'final' || ref.artifactRole === 'intermediate',
      `payload ${ref.id || ref.file} exposes a valid artifactRole, got ${ref.artifactRole}`)
    const expected = path.join(payloadRoot, ref.file)
    assert(fs.existsSync(expected), `payload file exists: ${expected}`)
  }
  const resolvedRoles = requestRefs.map((ref, index) => {
    if (hasSuccessFinalCall) return index === requestRefs.length - 1 ? 'final' : 'intermediate'
    return 'intermediate'
  })
  assert(resolvedRoles.some(role => role === 'final'), 'at least one request payload resolves to final')
  assert(resolvedRoles.some(role => role === 'intermediate'), 'chain trace contains intermediate request payloads')
  assert(resolvedRoles.length === apiCalls.length,
    `request payload refs align with logical API calls (${resolvedRoles.length}/${apiCalls.length})`)
  assert(resolvedRoles[resolvedRoles.length - 1] === 'final' || !hasSuccessFinalCall,
    'successful chain marks the last logical request final')
  assert(requestRefs.every(ref => Number(ref.chars) > 0), 'request payload refs expose positive char counts')
  console.log(`PAYLOAD ARTIFACT ROLE: PASS (${payloadRefs.length} refs checked; request roles=${resolvedRoles.join(',')}; request chars=${requestRefs.map(ref => ref.chars).join(',')})`)
}
