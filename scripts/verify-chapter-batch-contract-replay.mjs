#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const tracePath = process.argv[2]
if (!tracePath) {
  console.error('Usage: node scripts/verify-chapter-batch-contract-replay.mjs <run-trace.json>')
  process.exit(2)
}

const trace = JSON.parse(fs.readFileSync(path.resolve(tracePath), 'utf8'))
const writeEvents = (trace.events || [])
  .filter(event => event.type === 'write' && event.label === '章节批次已写入')
  .sort((a, b) => a.ts - b.ts)

if (writeEvents.length === 0) {
  console.error('No chapter batch write events found.')
  process.exit(2)
}

const totalChapters = Number(/\/(\d+) 章$/.exec(String(writeEvents[writeEvents.length - 1].detail))?.[1] || 0)
if (!totalChapters) {
  console.error('Unable to determine total chapter count from trace.')
  process.exit(2)
}

let previousEnd = 0
let progressed = true
const findings = []
for (const [index, event] of writeEvents.entries()) {
  const actualCount = Number(/已生成 (\d+)\//.exec(String(event.detail))?.[1] || 0)
  const expectedStart = previousEnd + 1
  const requestedCount = index === 0 ? actualCount : actualCount - previousEnd
  const expectedEnd = expectedStart + requestedCount - 1
  const short = requestedCount > 0 && requestedCount < 5 && actualCount < totalChapters
  const finding = {
    batchIndex: index,
    expectedStart,
    expectedEnd,
    requestedCount,
    actualCount,
    status: short ? 'incomplete' : 'complete'
  }
  findings.push(finding)
  console.log(
    `B${index + 1}: ${finding.status === 'complete' ? 'PASS' : 'FAIL'} ` +
    `expected ${expectedStart}-${expectedEnd} (${requestedCount}), actual total ${actualCount}`
  )
  if (short) {
    console.log(`STOP: batch B${index + 1} cannot advance under the chapter batch contract.`)
    progressed = false
    break
  }
  previousEnd = actualCount
}

if (!progressed) {
  console.log(`RESULT: REJECTED (${findings.filter(item => item.status === 'incomplete').length} short batch at stop point)`)
  process.exit(1)
}

if (previousEnd !== totalChapters) {
  console.log(`RESULT: REJECTED (ledger covers ${previousEnd}/${totalChapters})`)
  process.exit(1)
}

console.log(`RESULT: ACCEPTED (${findings.length} batches, ${previousEnd}/${totalChapters} chapters)`)
