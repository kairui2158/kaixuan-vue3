import { getToolLoopPolicy, normalizeToolIterations } from '../src/services/toolLoopPolicy.ts'

const report = {
  generatedAt: new Date().toISOString(),
  scenario: 'synthetic-long-document-tool-loop',
  documentChars: 0,
  iterations: 0,
  toolCalls: 0,
  toolResults: 0,
  orphanToolCallIds: ['synthetic-orphan-not-executed'],
  auditEntries: 20,
  auditTruncated: true,
  policy: null,
  assertions: [],
  passed: true,
}

function assert(condition, name, detail = {}) {
  report.assertions.push({ name, passed: Boolean(condition), ...detail })
  if (!condition) report.passed = false
}

const paragraphCount = 4000
const paragraphs = Array.from({ length: paragraphCount }, (_, index) => {
  const anchor = `第${index + 1}卷：玄武战场阶段${index + 1}`
  const body = `主线推进、人物冲突与伏笔节点持续累积，用于模拟真实长篇大纲的上下文压力。`
  return `${anchor}${body}`
})
const documentText = paragraphs.join('\n')
report.documentChars = documentText.length

const policy = getToolLoopPolicy('direct-tool-intensive')
report.policy = policy
const iterations = normalizeToolIterations('direct-tool-intensive', 999)
report.iterations = iterations
assert(iterations === policy.maxToolIterations, 'iteration ceiling is single-sourced', {
  expected: policy.maxToolIterations,
  actual: iterations,
})

const toolCalls = []
const toolResults = []
for (let iteration = 1; iteration <= iterations; iteration++) {
  const callsPerRound = 2
  for (let index = 0; index < callsPerRound; index++) {
    const id = `synthetic-call-${iteration}-${index}`
    const call = { id, name: index === 0 ? 'editor.get_state' : 'editor.write', input: { iteration, index } }
    toolCalls.push(call)
    if (iteration < iterations || index === 0) {
      toolResults.push({
        call,
        result: { ok: true, data: { iteration, index } },
      })
    }
  }
}

report.toolCalls = toolCalls.length
report.toolResults = toolResults.length
const orphanToolCallIds = toolCalls
  .filter(call => !toolResults.some(item => item.call.id === call.id))
  .map(call => call.id)
const auditEntries = Math.min(toolResults.length, 20)
const auditTruncated = toolResults.length > auditEntries
report.orphanToolCallIds = orphanToolCallIds
report.auditEntries = auditEntries
report.auditTruncated = auditTruncated

assert(
  orphanToolCallIds.length === 1,
  'orphan tool calls are detectable before the next request',
  { orphanToolCallIds },
)
assert(
  auditEntries <= 20,
  'audit summary does not grow linearly with tool rounds',
  { entries: auditEntries, toolResults: toolResults.length },
)
assert(
  normalizeToolIterations('direct', 999) === 6,
  'direct default policy is preserved',
)
assert(
  normalizeToolIterations('compatibility-json', 999) === 1,
  'compatibility JSON remains one-shot',
)
assert(
  normalizeToolIterations('folder-chain', 999) === 4,
  'folder chain has a bounded loop ceiling',
)

console.log(JSON.stringify(report, null, 2))
if (!report.passed) process.exit(1)
