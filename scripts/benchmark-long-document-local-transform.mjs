import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const ROOT = path.resolve(process.cwd())
const EVIDENCE_DIR = path.join(ROOT, '_audit', 'verification-long-document-execution-efficiency')
const EVIDENCE_PATH = path.join(EVIDENCE_DIR, 'local-transform-performance.json')
const SERVICE_PATH = path.join(ROOT, 'src', 'services', 'documentTransformService.ts')
const REAL_MANUSCRIPT_PATH = path.join(
  ROOT,
  '_audit',
  'verification-api-direct-write-user-visible-2026-09-23',
  'test-manuscript.md',
)
const CLEANUP_OPERATIONS = [
  'normalize_punctuation',
  'normalize_blank_lines',
  'normalize_numbering',
]

function makeDocument(sectionCount, bodyLength) {
  return Array.from({ length: sectionCount }, (_, index) => {
    const heading = index === 0 ? '# 第1节 起点' : `# 第${index + 1}节 节点${index + 1}`
    return `${heading}\n\n\n${'雨'.repeat(bodyLength)},继续;\n`
  }).join('\n')
}

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex')
}

async function loadService() {
  const server = await createServer({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.config.mts'),
    mode: 'production',
    server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true },
  })
  try {
    return {
      service: await server.ssrLoadModule('/src/services/documentTransformService.ts'),
      close: async () => server.close(),
    }
  } catch (error) {
    await server.close()
    throw error
  }
}

assert(fs.existsSync(SERVICE_PATH), 'documentTransformService source exists')
assert(fs.existsSync(REAL_MANUSCRIPT_PATH), 'step5 real manuscript evidence exists')
fs.mkdirSync(EVIDENCE_DIR, { recursive: true })

const { service, close } = await loadService()
const { transformDocument } = service
assert.equal(typeof transformDocument, 'function', 'production transformDocument is callable')

const realManuscript = fs.readFileSync(REAL_MANUSCRIPT_PATH, 'utf8')
const oneMillionDocument = makeDocument(2000, 495)
const cases = [
  {
    id: 'step5-real-7.6k',
    source: REAL_MANUSCRIPT_PATH,
    document: realManuscript,
    // The preserved manuscript is 7,602 chars; the live trace snapshot was
    // 7,607 chars because the editor had accumulated five newline characters.
    expectedMinimumChars: 7000,
    expectedMaximumChars: 8000,
    sourceNote: 'Preserved step5 manuscript; trace snapshot differed by 5 newline characters.',
    durationBudgetMs: 1000,
  },
  {
    id: 'synthetic-1m',
    source: SERVICE_PATH,
    document: oneMillionDocument,
    expectedMinimumChars: 1_000_000,
    durationBudgetMs: 3000,
  },
]

const results = []
for (const testCase of cases) {
  const result = transformDocument({
    content: testCase.document,
    operations: CLEANUP_OPERATIONS,
  })

  assert.equal(result.outcome, 'completed', `${testCase.id} completes locally`)
  assert.equal(result.validation.ok, true, `${testCase.id} validation passes`)
  assert.deepEqual(result.operations, CLEANUP_OPERATIONS, `${testCase.id} operation set matches request`)
  assert.notEqual(result.content, testCase.document, `${testCase.id} changes the document`)
  assert(result.durationMs < testCase.durationBudgetMs,
    `${testCase.id} duration ${result.durationMs}ms is below ${testCase.durationBudgetMs}ms`)

  if (testCase.expectedMinimumChars) {
    assert(testCase.document.length >= testCase.expectedMinimumChars,
      `${testCase.id} input reaches its minimum size`)
  }
  if (testCase.expectedMaximumChars) {
    assert(testCase.document.length <= testCase.expectedMaximumChars,
      `${testCase.id} input stays within its maximum size`)
  }

  results.push({
    id: testCase.id,
    inputChars: testCase.document.length,
    outputChars: result.content.length,
    changedLineCount: result.changedLineCount,
    durationMs: Number(result.durationMs.toFixed(3)),
    durationBudgetMs: testCase.durationBudgetMs,
    operations: result.operations,
    validation: result.validation,
    sourceNote: testCase.sourceNote || null,
    sourceHash: sha256(testCase.document),
  })
}

const evidence = {
  schema: 'shenyi.long-document-local-transform-performance',
  generatedAt: new Date().toISOString(),
  nodeVersion: process.version,
  runner: 'vite:ssrLoadModule:production-source',
  service: {
    path: SERVICE_PATH,
    sha256: sha256(fs.readFileSync(SERVICE_PATH, 'utf8')),
  },
  cases: results,
}
fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2), 'utf8')

console.log(JSON.stringify({
  evidencePath: EVIDENCE_PATH,
  cases: results.map(item => ({
    id: item.id,
    inputChars: item.inputChars,
    durationMs: item.durationMs,
    durationBudgetMs: item.durationBudgetMs,
    validationOk: true,
  })),
}, null, 2))

await close()
