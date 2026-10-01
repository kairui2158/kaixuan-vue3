import fs from 'node:fs'
import path from 'node:path'
import { auditIntentFactoryStop } from '../src/services/intentFactoryStopAudit.ts'

const ROOT = process.cwd()
const LEDGER_PATH = path.join(ROOT, '_audit', 'intent-factory-convergence-ledger.json')
const OUTPUT_PATH = path.join(ROOT, '_audit', 'intent-factory-stop-audit.json')

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

const ledger = readJson(LEDGER_PATH)
const reportPath = path.join(ROOT, ledger.latestReportPath)
const report = readJson(reportPath)
const result = auditIntentFactoryStop({
  report: {
    round: report.round,
    metrics: { silver: report.metrics.silver },
    manuscript: { consistency: report.manuscript.consistency },
    rows: report.rows.map(row => ({
      id: row.id,
      trust: row.trust,
      failureType: row.failureType,
    })),
  },
  ledger,
})

const output = {
  schema: 'shenyi.intent-factory-stop-audit',
  version: 1,
  generatedAt: new Date().toISOString(),
  reportPath: path.relative(ROOT, reportPath),
  ledgerPath: path.relative(ROOT, LEDGER_PATH),
  result,
}

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8')

for (const gate of result.gates) {
  console.log(`[${gate.id}] ${gate.name}: ${gate.passed ? 'PASS' : 'FAIL'}`)
  for (const detail of gate.details) console.log(`  - ${detail}`)
}
console.log(`remaining Silver failures: ${result.remainingFailureCount}`)
console.log(`unqualified failures: ${result.unqualifiedFailureIds.length}`)
console.log(`verdict: ${result.verdict}`)
console.log(`packaging: ${result.packagingAllowed ? 'convergence allowed' : 'intermediate only'}`)
console.log(`evidence: ${OUTPUT_PATH}`)

process.exitCode = result.verdict === 'PASS' ? 0 : 1
