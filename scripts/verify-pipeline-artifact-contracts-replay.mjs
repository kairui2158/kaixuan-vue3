#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('Usage: node scripts/verify-pipeline-artifact-contracts-replay.mjs <run-trace.json> [more-traces...]')
  process.exit(2)
}

const STAGES = [
  { stage: 'volume', validated: 'volume-batch-validated', write: '卷纲已写入项目' },
  { stage: 'settings', validated: 'settings-artifact-validated', write: '设定已写入项目' },
  { stage: 'body', validated: 'body-artifact-validated', write: '正文已写入项目' }
]

let anyRejected = false

for (const tracePath of args) {
  const resolved = path.resolve(tracePath)
  let trace
  try {
    trace = JSON.parse(fs.readFileSync(resolved, 'utf8'))
  } catch (error) {
    console.log(`${tracePath}: REJECTED (cannot read JSON: ${error.message})`)
    anyRejected = true
    continue
  }

  const schemaVersion = Number(trace.schemaVersion || 0)
  const events = trace.events || []
  const findings = STAGES.map(({ stage, validated, write }) => {
    const writeEvents = events.filter(event => event.type === 'write' && event.label === write)
    const validatedEvents = events.filter(event => event.type === validated)
    if (validatedEvents.length > 0) return { stage, status: 'validated', count: validatedEvents.length }
    if (writeEvents.length === 0) return { stage, status: 'not_present' }
    if (schemaVersion < 17) {
      return { stage, status: 'legacy_missing_event', schemaVersion }
    }
    return { stage, status: 'missing_validated_event', schemaVersion }
  })

  const relevant = findings.filter(item => item.status !== 'not_present')
  const hasArtifactWrite = relevant.length > 0
  const missingNewRun = findings.some(item => item.status === 'missing_validated_event')
  const legacyMissing = findings.some(item => item.status === 'legacy_missing_event')
  const accepted = hasArtifactWrite && !missingNewRun && !legacyMissing
  if (missingNewRun) anyRejected = true

  console.log(`${path.basename(path.dirname(tracePath))}:`)
  for (const finding of findings) {
    if (finding.status === 'not_present') continue
    const marker = finding.status === 'validated' ? 'PASS' : finding.status === 'legacy_missing_event' ? 'EXPECTED-FAIL' : 'FAIL'
    const suffix = finding.status === 'legacy_missing_event'
      ? ` (schema v${finding.schemaVersion} predates artifact contract events)`
      : finding.status === 'validated'
        ? ` (${finding.count} event)`
        : ` (schema v${finding.schemaVersion} must emit the event)`
    console.log(`  ${finding.stage}: ${marker}${suffix}`)
  }
  if (!hasArtifactWrite) {
    console.log('  RESULT: SKIPPED (no pipeline artifact write events)')
  } else {
    console.log(`  RESULT: ${accepted ? 'ACCEPTED' : 'REJECTED'}`)
  }
}

process.exit(anyRejected ? 1 : 0)
