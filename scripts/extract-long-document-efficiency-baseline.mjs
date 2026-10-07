import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const TRACE_PATH = path.join(
  ROOT,
  '_data/api-direct-write-live-v3-profile/documents-data/run-trace/outline',
  'run-trace-outline-20261007-185019/run-trace.json',
)
const OUTPUT_PATH = path.join(
  ROOT,
  '_audit/verification-long-document-execution-efficiency/baseline-step5.json',
)

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function numberOrZero(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const trace = readJson(TRACE_PATH)
const calls = Array.isArray(trace.apiCalls) ? trace.apiCalls : []
const turns = Array.isArray(trace.turns) ? trace.turns : []
const target = calls.find(call => {
  const turn = turns.find(item => item.id === call.turnId)
  return String(turn?.userRequest || '').includes('整理整篇文章')
}) || calls.at(-1)
if (!target) throw new Error('step5 API call not found in baseline trace')
const targetTurn = turns.find(item => item.id === target.turnId)

const physicalCalls = Array.isArray(target.physicalCalls) ? target.physicalCalls : []
const toolCalls = Array.isArray(target.toolCalls) ? target.toolCalls : []
const lastPhysicalCall = physicalCalls.at(-1)
const inputTokens = physicalCalls
  .map(call => numberOrZero(call.usage?.inputTokens ?? call.usage?.promptTokens
    ?? call.usage?.input_tokens ?? call.usage?.prompt_tokens))
  .filter(value => value > 0)
const durations = physicalCalls
  .map(call => numberOrZero(call.durationMs))
  .filter(value => value > 0)

const baseline = {
  generatedAt: new Date().toISOString(),
  sourceTrace: path.relative(ROOT, TRACE_PATH),
  callId: target.id || null,
  requestText: targetTurn?.userRequest || null,
  documentChars: numberOrZero(targetTurn?.toolCalls?.[0]?.result?.data?.contentLength),
  physicalRequests: physicalCalls.length,
  toolCalls: toolCalls.length,
  editorWriteCalls: toolCalls.filter(call => String(call.name || '').startsWith('editor.write')).length,
  readToolCalls: toolCalls.filter(call => String(call.name || '') !== 'editor.write').length,
  cumulativeRequestDurationMs: durations.reduce((sum, value) => sum + value, 0),
  longestRequestDurationMs: durations.length ? Math.max(...durations) : 0,
  inputTokenFirst: inputTokens[0] ?? 0,
  inputTokenLast: inputTokens.at(-1) ?? 0,
  providerContextWindowTokens: numberOrZero(lastPhysicalCall?.providerContextWindowTokens),
  modelContextWindowTokens: numberOrZero(lastPhysicalCall?.modelCapability?.contextWindowTokens),
  modelContextWindowSource: lastPhysicalCall?.modelCapability?.contextWindowSource || null,
  contextBudgetDecision: lastPhysicalCall?.contextBudgetDecision || null,
  statusAtCapture: target.status || trace.status || null,
}

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(baseline, null, 2))
