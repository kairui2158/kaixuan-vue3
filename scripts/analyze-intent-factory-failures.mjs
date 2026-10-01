import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const REPORT_PATH = process.argv[2] || path.join(ROOT, '_audit', 'intent-adversarial-factory-round-5.json')
const OUTPUT_PATH = path.join(ROOT, '_audit', 'intent-factory-failure-attribution.json')

const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'))
const failures = report.rows.filter(row => row.trust === 'silver' && row.failureType)

const clusters = new Map()
for (const row of failures) {
  const key = [
    row.failureType,
    row.mutationType,
    row.routing.kind,
    row.routing.reason || 'none',
  ].join('::')
  if (!clusters.has(key)) clusters.set(key, [])
  clusters.get(key).push(row)
}

const output = {
  schema: 'shenyi.intent-factory-failure-attribution',
  version: 1,
  generatedAt: new Date().toISOString(),
  reportPath: path.relative(ROOT, REPORT_PATH),
  silverFailureCount: failures.length,
  clusters: Array.from(clusters.entries())
    .map(([key, rows]) => {
      const [failureType, mutationType, kind, reason] = key.split('::')
      return {
        failureType,
        mutationType,
        kind,
        reason: reason || null,
        count: rows.length,
        sampleIds: rows.map(row => row.id),
        representativeInputs: rows.slice(0, 8).map(row => ({
          id: row.id,
          input: row.input,
          expected: row.expected,
          actual: row.routing.intent || row.routing.kind,
        })),
      }
    })
    .sort((left, right) => right.count - left.count),
  rows: failures.map(row => ({
    id: row.id,
    input: row.input,
    expected: row.expected,
    actual: row.routing.intent || row.routing.kind,
    routingKind: row.routing.kind,
    reason: row.routing.reason,
    mutationType: row.mutationType,
    failureType: row.failureType,
  })),
}

fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8')

console.log(`report: ${path.relative(ROOT, REPORT_PATH)}`)
console.log(`silver failures: ${failures.length}`)
console.log(`clusters: ${output.clusters.length}`)
for (const cluster of output.clusters) {
  console.log(`- ${cluster.count} | ${cluster.failureType} | ${cluster.mutationType} | ${cluster.kind} | ${cluster.reason}`)
  for (const row of cluster.representativeInputs.slice(0, 3)) {
    console.log(`    ${row.input} | expected=${row.expected} actual=${row.actual}`)
  }
}
console.log(`attribution: ${OUTPUT_PATH}`)
