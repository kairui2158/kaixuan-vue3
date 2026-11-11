import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const evidenceDir = path.join('_audit', 'verification-chapter-batch-contract-live', 'live-export')
const run = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'run-trace.json'), 'utf8'))
const payloads = {}
for (const name of fs.readdirSync(path.join(evidenceDir, 'payloads'))) {
  payloads[name] = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'payloads', name), 'utf8'))
}

const forbidden = '输出JSON数组，每项含title/plot字段'
const boundary = '输出协议由当前 SKILL 模板决定'
let forbiddenCount = 0
let boundaryCount = 0
for (const [name, payload] of Object.entries(payloads)) {
  const text = JSON.stringify(payload)
  if (text.includes(forbidden)) {
    forbiddenCount++
    console.error('forbidden protocol found in', name)
  }
  if (text.includes(boundary)) boundaryCount++
}

assert.equal(forbiddenCount, 0, 'no conflicting JSON protocol injected into folder-chain requests')
assert.ok(boundaryCount > 0, 'folder-chain boundary note present')
assert.equal(run.schemaVersion, 23, 'trace schema v23')
assert.equal(run.status, 'success', 'run success')
assert.equal(run.step, 3, 'chapter-layer step')
const validated = (run.events || [])
  .filter(event => event.type === 'chapter-batch-validated')
  .map(event => JSON.parse(event.detail || '{}'))
assert.equal(validated.length, 3, 'three validated batches')
assert.deepEqual(validated.map(item => item.requestedCount), [5, 5, 2], 'batch sizes')
validated.forEach(item => assert.equal(item.actualCount, item.requestedCount,
  `batch ${item.expectedStart}-${item.expectedEnd} is quantity-conserved`))
assert.ok((run.events || []).some(event => event.type === 'chapter-batch-attempt'), 'attempt events present')
assert.ok((run.apiCalls || []).every(call => call.status !== 'running'), 'no running calls')
assert.ok((run.turns || []).every(turn => turn.status !== 'running'), 'no running turns')

console.log(JSON.stringify({
  schemaVersion: run.schemaVersion,
  status: run.status,
  step: run.step,
  validatedBatches: validated.length,
  apiCalls: run.apiCalls?.length,
  forbiddenCount,
  boundaryCount,
}, null, 2))
