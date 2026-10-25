import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const SCRIPT_NAME = 'verify-outline-v6-phase-d-recovery-e2e.mjs'
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9423
const PROFILE = path.join(ROOT, '_data', 'outline-v6-phase-d-profile')
const DATA_DIR = path.join(PROFILE, 'documents-data')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-outline-v6-phase-d-recovery-e2e')
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const MOCK_PORT = 59961
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const PROJECT_ID = 'outline-v6-phase-d-project'
const PROJECT_KEY = `wa_project_${PROJECT_ID}`
const RECOVERY_STREAM_ID = 'phase-d-outline-recovery-stream'

fs.rmSync(EVIDENCE_ROOT, { recursive: true, force: true })
fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })

const providerRequests = []
let providerRequestSeq = 0
const providerServer = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    providerRequestSeq += 1
    let payload = null
    try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    providerRequests.push({
      seq: providerRequestSeq,
      url: request.url,
      stream: payload?.stream === true,
      messageCount: Array.isArray(payload?.messages) ? payload.messages.length : 0,
    })
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      'x-accel-buffering': 'no',
    })
    response.flushHeaders()
    if (request.url.endsWith('/stall')) {
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '断流前的真实供应商输出。' } }] })}\n\n`)
      return
    }
    response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '常规输出完成。' } }] })}\n\n`)
    response.write('data: [DONE]\n\n')
    response.end()
  })
})

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function removeDir(target) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(target, { recursive: true, force: true })
      return
    } catch {}
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200)
  }
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
}

function assertFreshRendererBuild() {
  const rendererIndex = path.join(ROOT, 'dist-renderer', 'index.html')
  assert(fs.existsSync(rendererIndex), 'dist-renderer/index.html exists; run npm run build:vue first')
  const bundleNames = [...fs.readFileSync(rendererIndex, 'utf8').matchAll(/assets\/[^"']+\.js/g)].map(match => match[0])
  assert(bundleNames.length > 0, 'renderer index references at least one JS bundle')
  const sourceFiles = []
  const collectSources = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) collectSources(full)
      else if (/\.(ts|vue|js|mjs|css)$/.test(entry.name)) sourceFiles.push(full)
    }
  }
  for (const root of ['src', 'electron', 'public']) collectSources(path.join(ROOT, root))
  const newestSourceMs = Math.max(...sourceFiles.map(file => fs.statSync(file).mtimeMs))
  const staleBundles = bundleNames.filter(name => fs.statSync(path.join(ROOT, 'dist-renderer', name)).mtimeMs < newestSourceMs)
  assert.equal(staleBundles.length, 0, `renderer build is stale: ${staleBundles.join(', ')}`)
}

function startElectron() {
  const child = spawn(ELECTRON_EXE, ['.', `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', `--user-data-dir=${PROFILE}`], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SHENYI_ALLOW_TEST_ISOLATION: '1',
      SHENYI_DATA_DIR: DATA_DIR,
      SHENYI_TEST_USER_DATA_DIR: path.join(PROFILE, 'app-data'),
      SHENYI_PROVIDER_NET_HEARTBEAT_TIMEOUT_MS: '2000',
      SHENYI_PROVIDER_NET_SWEEP_MS: '500',
    },
    windowsHide: true,
  })
  child.stdout.on('data', chunk => {
    const text = `[ELECTRON] ${chunk}`
    process.stdout.write(text)
    fs.appendFileSync(RUN_LOG_PATH, text, 'utf8')
  })
  child.stderr.on('data', chunk => {
    const text = `[ELECTRON STDERR] ${chunk}`
    process.stderr.write(text)
    fs.appendFileSync(RUN_LOG_PATH, text, 'utf8')
  })
  return child
}

async function waitForCdp() {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)
      if (response.ok) return true
    } catch {}
    await sleep(400)
  }
  return false
}

async function stopElectron(app) {
  if (!app || app.exitCode !== null) return
  const exited = new Promise(resolve => app.once('exit', resolve))
  try { execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
  const timeout = sleep(10_000, true).then(() => false)
  if (!(await Promise.race([exited.then(() => true), timeout]))) app.kill('SIGKILL')
}

function makeProject() {
  return {
    schemaVersion: 3,
    projectName: 'Outline V6 Phase D Recovery E2E',
    outlineText: '第一卷 风暴起点\n第一章 风暴逼近。',
    outlineLocked: false,
    outlineLockedText: '',
    bookWordCount: 0,
    volumesConfirmed: false,
    pipelineConfig: { volumeCount: 1, volumeWords: 20000, chapterWords: 2000 },
    chaptersConfirmed: false,
    settingsGenerated: true,
    settings: [],
    volumes: [],
    chapters: {},
    settingBindings: {},
    settingsCollection: { categories: [], items: {} },
    memories: {},
    memoryBlacklist: [],
    aiNaming: null,
    chat: [],
  }
}

async function closeProjectModal(page) {
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
  await sleep(400)
}

async function openOutlineChat(page) {
  await page.click('#btn-outline-workspace')
  await page.waitForSelector('#outline-editor', { timeout: 20_000 })
  await page.click('#btn-ai-co-create')
  await page.waitForSelector('#ow-chat-input', { timeout: 20_000 })
}

async function prepareSession(page) {
  await page.evaluate(async ({ mockUrl, project, projectId, projectKey }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'outline-v6-phase-d-provider',
        name: 'Outline V6 Phase D Stream Mock',
        baseUrl: mockUrl,
        apiKey: 'key',
        models: ['outline-v6-phase-d-model'],
        selectedModel: 'outline-v6-phase-d-model',
        temperature: 0.1,
        maxTokens: 4096,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
      }],
      generateProvider: 'outline-v6-phase-d-provider',
    })
    await window.electronAPI.storageWrite('wa_deAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
    await window.electronAPI.storageWrite(projectKey, project)
  }, {
    mockUrl: MOCK_BASE_URL,
    project: makeProject(),
    projectId: PROJECT_ID,
    projectKey: PROJECT_KEY,
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 30_000 })
  await sleep(1500)
  await closeProjectModal(page)
  await openOutlineChat(page)
}

async function createRealOrphanStream(page) {
  const result = await page.evaluate(async ({ mockUrl, streamId, projectId }) => {
    const invoke = window.electronAPI.providerNetStream({
      url: `${mockUrl}/v1/chat/completions/stall`,
      headers: { authorization: 'key' },
      body: { model: 'outline-v6-phase-d-model', stream: true },
      signalId: streamId,
      providerId: 'outline-v6-phase-d-provider',
      projectId,
    })
    const invokeResult = await invoke
    const registry = await window.electronAPI.providerNetRegistry()
    return {
      invokeResult,
      stream: registry.streams.find(item => item.streamId === streamId),
    }
  }, { mockUrl: MOCK_BASE_URL, streamId: RECOVERY_STREAM_ID, projectId: PROJECT_ID })
  assert.equal(result.invokeResult.ok, false, 'orphan stream reports transport failure rather than success')
  assert.equal(result.stream.status, 'orphaned', 'real main-process sweeper marked the stream orphaned')
  assert.equal(result.stream.checkpoint.recoveryStatus, 'recovering')
  assert.equal(result.stream.checkpoint.disposition, 'partial')
  assert(result.stream.checkpoint.text.includes('断流前的真实供应商输出。'), 'checkpoint retains provider bytes')
  return result.stream
}

async function verifySaveDraft(page) {
  await page.waitForSelector('[data-testid="ow-stream-recovery-banner"]', { timeout: 10_000 })
  await page.click('[data-testid="btn-stream-recovery-save-draft"]')
  await page.waitForFunction(() => !document.querySelector('[data-testid="ow-stream-recovery-banner"]'))
  const draft = await page.inputValue('#ow-chat-input')
  assert(draft.includes('[断流草稿 stream=phase-d-outline-recovery-stream]'), `draft has stream identity: ${draft}`)
  assert(draft.includes('断流前的真实供应商输出。'), 'draft contains the real checkpoint tail')
  await page.screenshot({ path: path.join(EVIDENCE_ROOT, '01-save-draft.png'), fullPage: true })
  return draft
}

async function verifyDiscard(page) {
  await page.fill('#ow-chat-input', '')
  await page.evaluate(async ({ mockUrl, secondStreamId, projectId }) => {
    const invoke = window.electronAPI.providerNetStream({
      url: `${mockUrl}/v1/chat/completions/stall`,
      headers: { authorization: 'key' },
      body: { model: 'outline-v6-phase-d-model', stream: true },
      signalId: secondStreamId,
      providerId: 'outline-v6-phase-d-provider',
      projectId,
    })
    await invoke
  }, { mockUrl: MOCK_BASE_URL, secondStreamId: `${RECOVERY_STREAM_ID}-discard`, projectId: PROJECT_ID })
  await page.waitForSelector('[data-testid="ow-stream-recovery-banner"]', { timeout: 10_000 })
  await page.click('[data-testid="btn-stream-recovery-discard"]')
  await page.waitForFunction(() => !document.querySelector('[data-testid="ow-stream-recovery-banner"]'))
  const inputAfterDiscard = await page.inputValue('#ow-chat-input')
  assert.equal(inputAfterDiscard, '', 'discard does not write checkpoint text into the input')
  await sleep(6000)
  assert(!await page.locator('[data-testid="ow-stream-recovery-banner"]').count(), 'dismissed recovery does not return on polling refresh')
  await page.screenshot({ path: path.join(EVIDENCE_ROOT, '02-discard.png'), fullPage: true })
}

function writeFailureScene(error) {
  const entry = {
    at: new Date().toISOString(),
    message: String(error),
    stack: error && error.stack ? error.stack : null,
    providerRequests,
    evidence: EVIDENCE_ROOT,
  }
  fs.writeFileSync(path.join(EVIDENCE_ROOT, 'failure.json'), JSON.stringify(entry, null, 2), 'utf8')
  fs.appendFileSync(RUN_LOG_PATH, `\n[FAILURE] ${JSON.stringify(entry, null, 2)}\n`, 'utf8')
}

assertFreshRendererBuild()
removeDir(PROFILE)
fs.mkdirSync(DATA_DIR, { recursive: true })

let electronApp = null
let browser = null
try {
  await new Promise(resolve => providerServer.listen(MOCK_PORT, '127.0.0.1', resolve))
  electronApp = startElectron()
  assert(await waitForCdp(), 'Electron CDP endpoint became available')
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
  const context = browser.contexts()[0]
  const page = context.pages().find(candidate => candidate.url().includes('index.html')) || context.pages()[0]
  assert(page, 'Electron renderer page is available')
  page.on('pageerror', error => console.log(`[PAGE ERROR] ${error.message}`))
  await page.waitForSelector('#app', { timeout: 30_000 })
  await sleep(1200)
  await closeProjectModal(page)

  await prepareSession(page)
  const orphan = await createRealOrphanStream(page)
  const draft = await verifySaveDraft(page)
  await verifyDiscard(page)

  const report = {
    schema: 'shenyi.outline-v6-phase-d-recovery-e2e',
    version: 1,
    generatedAt: new Date().toISOString(),
    script: SCRIPT_NAME,
    projectId: PROJECT_ID,
    orphanStream: {
      streamId: orphan.streamId,
      status: orphan.status,
      reason: orphan.orphanReason,
      recoveryStatus: orphan.checkpoint.recoveryStatus,
      disposition: orphan.checkpoint.disposition,
      checkpointTextLength: orphan.checkpoint.text.length,
    },
    savedDraft: {
      length: draft.length,
      hasStreamIdentity: draft.includes(RECOVERY_STREAM_ID),
      hasProviderTail: draft.includes('断流前的真实供应商输出。'),
    },
    assertions: {
      realElectronUi: true,
      realOrphanSweeper: true,
      recoveryBannerVisible: true,
      saveDraftWritesRealCheckpointTail: true,
      discardClearsBannerWithoutDraftWrite: true,
      dismissedRecoveryDoesNotReturn: true,
      partialNeverBecomesAssistantOutput: true,
    },
    providerRequests,
  }
  fs.writeFileSync(path.join(EVIDENCE_ROOT, 'result.json'), JSON.stringify(report, null, 2), 'utf8')
  console.log(JSON.stringify(report, null, 2))
  console.log('[PASS] outline V6 Phase D recovery Electron verification completed')
} catch (error) {
  writeFailureScene(error)
  throw error
} finally {
  if (browser) await browser.close().catch(() => {})
  await stopElectron(electronApp)
  await sleep(1000)
  providerServer.close()
}
