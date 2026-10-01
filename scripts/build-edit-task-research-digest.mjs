import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { basename } from 'node:path'

const LEDGERS = [
  '_audit/RESEARCH_2026-09-22_EDIT_TASK_MATURITY_SOURCES.json',
  '_audit/RESEARCH_2026-09-22_EDIT_TASK_MATURITY_GAPS.json',
]

const THEMES = {
  'confirmation-and-permission': /(confirm|approval|approve|permission|allowlist|deny|reject|decline|safety|policy)/i,
  'task-state-and-resume': /(interrupt|resume|checkpoint|task_state|TaskState|pending|running|failed|cancelled|canceled|retry|timeout|recover|durable)/i,
  'edit-protocol-and-anchoring': /(target_not_found|not found|unique|anchor|replace_match|str_replace|originalText|oldString|newString|hash|checksum|version|revision|diff|patch|apply_patch)/i,
  'batch-and-partial-failure': /(batch|partial|partially|progress|checkpoint|failure|fallback|compensat|rollback|undo)/i,
  'session-and-observability': /(trace|span|event|history|conversation|session|ledger|trajectory|telemetry|logger)/i,
  'long-context-and-retrieval': /(context|retriev|embedding|index|structure|excerpt|chunk|selection|position|range|read_range)/i,
}

const entries = []
for (const ledger of LEDGERS) {
  if (!existsSync(ledger)) continue
  for (const repo of JSON.parse(readFileSync(ledger, 'utf8'))) {
    for (const file of repo.files || []) {
      if (!file.cache || !existsSync(file.cache)) continue
      entries.push({ repo: repo.repo, path: file.path, cache: file.cache })
    }
  }
}

const out = []
out.push('# EditTask maturity research digest')
out.push('')
out.push('Generated from source files cached in `_audit/research-cache/edit-task-maturity-2026-09-22`.')
out.push('')

for (const [theme, pattern] of Object.entries(THEMES)) {
  out.push(`## ${theme}`)
  out.push('')
  const seen = new Set()
  for (const entry of entries) {
    const key = `${entry.repo}:${entry.path}`
    if (seen.has(key)) continue
    const lines = readFileSync(entry.cache, 'utf8').split(/\r?\n/)
    const hits = []
    for (let i = 0; i < lines.length && hits.length < 14; i++) {
      if (!pattern.test(lines[i])) continue
      const start = Math.max(0, i - 2)
      const end = Math.min(lines.length - 1, i + 4)
      hits.push(`- \`${basename(entry.path)}:${i + 1}\`\n${lines.slice(start, end + 1).map(line => `  > ${line}`).join('\n')}`)
      i = end
    }
    if (!hits.length) continue
    seen.add(key)
    out.push(`### ${key}`)
    out.push('')
    out.push(...hits)
    out.push('')
  }
}

writeFileSync('_audit/RESEARCH_2026-09-22_EDIT_TASK_MATURITY_DIGEST.md', out.join('\n'), 'utf8')
console.log(`[done] digest entries=${entries.length} lines=${out.length}`)
