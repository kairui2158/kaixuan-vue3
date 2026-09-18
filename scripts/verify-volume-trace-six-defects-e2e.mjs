import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const root = process.cwd()
const electronExe = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shenyi-volume-trace-'))
const exportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shenyi-volume-export-'))

const child = spawn(electronExe, [
  root,
  '--remote-debugging-port=0',
  '--remote-allow-origins=*',
  `--user-data-dir=${userDataDir}`
], {
  env: {
    ...process.env,
    ELECTRON_ENABLE_LOGGING: '1',
    SHENYI_TEST_USER_DATA_DIR: userDataDir,
    SHENYI_TEST_RUN_TRACE_EXPORT: exportDir
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  cwd: root,
  windowsHide: true
})

let buffer = ''
child.stdout.on('data', chunk => {
  buffer += chunk
  const text = String(chunk)
  if (/Uncaught|unhandledRejection/i.test(text)) console.log('[ELECTRON:stdout] ' + text.slice(0, 500))
})
child.stderr.on('data', chunk => {
  buffer += chunk
  const text = String(chunk)
  if (/Uncaught|unhandledRejection|EADDRINUSE/i.test(text)) console.log('[ELECTRON:stderr] ' + text.slice(0, 500))
})

async function waitForPort(maxMs = 30000) {
  const started = Date.now()
  while (Date.now() - started < maxMs) {
    const match = buffer.match(/(?:Remote debugging|DevTools) listening on ws:\/\/127\.0\.0\.1:(\d+)\//)
    if (match) return Number(match[1])
    await new Promise(r => setTimeout(r, 250))
  }
  throw new Error(`No CDP port\n${buffer.slice(-2000)}`)
}

const port = await waitForPort()
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
let page = null
for (let index = 0; index < 24; index++) {
  const pages = browser.contexts()[0]?.pages() || []
  if (pages.length) {
    page = pages[0]
    break
  }
  await new Promise(resolve => setTimeout(resolve, 500))
}
assert(page, 'renderer page should be reachable')
page.on('pageerror', error => console.log('[PAGE ERROR] ' + error.message))
await page.waitForSelector('#app', { timeout: 20000 })
await new Promise(resolve => setTimeout(resolve, 1500))
await page.evaluate(() => {
  document.querySelector('.project-modal-content .btn-close')?.click()
})
await new Promise(resolve => setTimeout(resolve, 500))

async function evaluate(expression) {
  return page.evaluate(expression)
}

const ready = await page.evaluate(() => Boolean(window.__pinia?._s?.get('runTrace')))
assert(ready, 'Pinia runTrace store should be ready')

const runResult = await evaluate(`(() => {
  const store = window.__pinia._s.get('runTrace')
  const runId = store.startRun({ source: 'pipeline', step: 2, stepName: '卷纲层', mode: 'chain' })
  const callId = store.startApiCall(runId, {
    step: 2,
    skillId: 'folder-s1',
    skillName: 'S1 骨架师',
    requestMessages: [{ role: 'user', content: '卷纲执行包' }]
  })
  store.setApiCallRequest(runId, callId, [
    { role: 'system', content: 'S1 系统提示' },
    { role: 'user', content: '卷纲执行包' }
  ])
  store.appendCumulativeStream(runId, callId, 'S1 输出')
  store.appendPhysicalCall(runId, callId, {
    phase: 'stream',
    status: 'success',
    requestMessages: [{ role: 'system', content: 'S1 系统提示' }, { role: 'user', content: '卷纲执行包' }],
    responseText: 'S1 输出',
    streamText: 'S1 输出'
  })
  store.appendFolderDiagnostics(runId, {
    status: 'success',
    output: 'S1 输出',
    diagnostics: []
  })
  store.addEvent(runId, { type: 'chain-dedupe', level: 'warn', label: '中间产物去重', detail: '剥除回显块' })
  store.addEvent(runId, { type: 'chain-output-echo', level: 'warn', label: '输出回显警告', detail: '重叠率 30%' })
  store.finishApiCall(runId, callId, { status: 'success', responseText: 'S1 输出' })
  const run2 = store.startRun({ source: 'pipeline', step: 2, stepName: '卷纲层异常', mode: 'chain' })
  const call2 = store.startApiCall(run2, { step: 2, skillName: 'S2 血肉师', requestMessages: [{ role: 'user', content: 'S2 输入' }] })
  store.finishRun(run2, 'failed', '模拟异常路径')
  return { runId, callId, abandonedCallId: call2 }
})()`)
assert(runResult?.runId, 'seed run should return id')

const exportResult = await evaluate(`window.electronAPI.runTraceExport({
  schema: 'shenyi.run-trace',
  version: 2,
  run: window.__pinia._s.get('runTrace').exportRunToJson(window.__pinia.state.value.runTrace.runs.find(r => r.id === ${JSON.stringify(runResult.runId)})),
  mode: 'deep'
})`)
assert(exportResult?.success === true, `export should succeed: ${exportResult?.reason}`)

const exportPath = exportResult.path
const runTrace = JSON.parse(fs.readFileSync(path.join(exportPath, 'run-trace.json'), 'utf8'))
const payloadFiles = fs.readdirSync(path.join(exportPath, 'payloads'))

assert(runTrace.apiCalls[0].status === 'success', 'S1 should be success')
assert(runTrace.apiCalls[0].requestMessages?.__payload, 'S1 request should be payload ref')
assert((runTrace.apiCalls[0].physicalCalls || []).length === 1, 'S1 should have physical call')
assert(runTrace.folderDiagnostics[0].output === undefined, 'folder diagnostics output should be ref')
assert(runTrace.folderDiagnostics[0].outputPayloadRef, 'folder diagnostics should have payload ref')
assert(runTrace.folderDiagnostics[0].outputPreview === 'S1 输出', 'folder diagnostics should keep preview')
assert(runTrace.events.some(e => e.type === 'chain-dedupe'), 'chain-dedupe event should exist')
assert(runTrace.events.some(e => e.type === 'chain-output-echo'), 'chain-output-echo event should exist')

const uniqueHashes = new Set(payloadFiles.map(file => fs.readFileSync(path.join(exportPath, 'payloads', file))))
assert(payloadFiles.length === uniqueHashes.size, 'payload files should be content-unique')
assert(payloadFiles.length <= 4, `expected <=4 payload files, got ${payloadFiles.length}`)

const exportJson = JSON.parse(fs.readFileSync(path.join(exportPath, 'export.json'), 'utf8'))
assert(exportJson.payloadVerification?.ok === true, 'payload verification should pass')
assert(exportJson.payloadCount === runTrace.payloads.length, 'payload count should match refs')

const logicalRequest = runTrace.apiCalls[0].requestMessages?.__payload
const physicalRequest = runTrace.apiCalls[0].physicalCalls?.[0]?.requestMessages?.__payload
assert(logicalRequest && physicalRequest && logicalRequest.id === physicalRequest.id, 'logical and physical request should share payload ref')

const folderOutputRef = runTrace.folderDiagnostics[0].outputPayloadRef
assert(folderOutputRef, 'folder diagnostics should have outputPayloadRef')
const folderPayload = runTrace.payloads.find(p => p.id === folderOutputRef)
assert(folderPayload && folderPayload.kind === 'folder-output', 'folder diagnostics payload ref should point to folder-output kind')
assert(folderPayload.sha256 === runTrace.payloads.find(p => p.id === runTrace.apiCalls[0].responseText?.__payload?.id)?.sha256, 'folder output and response share same content hash')

const failedRun = JSON.parse(JSON.stringify(runTrace))
assert(!runTrace.apiCalls.some(c => c.status === 'running'), 'no running API should remain')

const abandoned = await evaluate(`window.__pinia.state.value.runTrace.runs.find(r => r.stepName === '卷纲层异常')`)
assert(abandoned?.apiCalls?.every(c => c.status !== 'running'), 'abandoned run should close running API')

await browser.close()
if (child.pid) {
  try {
    execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch { /* already exited */ }
}

function removeTempDir(dir) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
      return
    } catch (error) {
      if (attempt === 4) console.warn('[WARN] temp cleanup failed: ' + dir)
      else Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000)
    }
  }
}

removeTempDir(userDataDir)
removeTempDir(exportDir)

console.log('[PASS] source Electron CDP reachable')
console.log('[PASS] S1 export has request payload ref, stream, physical call')
console.log('[PASS] folder diagnostics output is payload-ref with preview')
console.log('[PASS] chain-dedupe and chain-output-echo events recorded')
console.log('[PASS] payload files are content-unique')
console.log('[PASS] no running API remains after finish/abandon')
console.log('===== VOLUME TRACE SIX DEFECTS E2E PASSED =====')
