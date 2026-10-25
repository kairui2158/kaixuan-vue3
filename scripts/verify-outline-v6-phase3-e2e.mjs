import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const SCRIPT_NAME = 'verify-outline-v6-phase3-e2e.mjs'
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9417
const PROFILE = path.join(ROOT, '_data', 'outline-v6-phase3-profile')
const DATA_DIR = path.join(PROFILE, 'documents-data')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-outline-v6-phase3-e2e')
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const MOCK_PORT = 59948
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const PROJECT_ID = 'outline-v6-phase3-project'
const PROJECT_KEY = `wa_project_${PROJECT_ID}`
const LONG_CHUNK_COUNT = 1200
const BURST_READ_COUNT = 3000

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
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '开始输出' } }] })}\n\n`)
      return
    }
    if (request.url.endsWith('/slow')) {
      let index = 0
      const timer = setInterval(() => {
        if (response.destroyed) {
          clearInterval(timer)
          return
        }
        response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `慢速段${index}。` } }] })}\n\n`)
        index += 1
        if (index >= 20) {
          clearInterval(timer)
          response.write('data: [DONE]\n\n')
          response.end()
        }
      }, 120)
      response.on('close', () => clearInterval(timer))
      return
    }
    if (request.url.endsWith('/burst')) {
      // One SSE event per provider write, sent with a tiny interval. The
      // main-process fetch transport may still coalesce several writes into
      // one physical read, so this fixture produces enough volume to exceed
      // the production ring-buffer bounds deterministically.
      let index = 0
      const timer = setInterval(() => {
        if (response.destroyed) {
          clearInterval(timer)
          return
        }
        response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `爆发段${index}。` } }] })}\n\n`)
        index += 1
        if (index >= BURST_READ_COUNT) {
          clearInterval(timer)
          response.write('data: [DONE]\n\n')
          response.end()
        }
      }, 1)
      response.on('close', () => clearInterval(timer))
      return
    }
    for (let index = 0; index < LONG_CHUNK_COUNT; index += 1) {
      const text = `长流段${index}。`
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`)
    }
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
      // E2E-only timing so the orphan path can be exercised without waiting
      // the production 30s heartbeat timeout in a UI test run.
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
    projectName: 'Outline V6 Phase3 E2E',
    outlineText: '第一卷 风暴起点\n第一章 风暴逼近。\n第二章 男主发现旧信。',
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
        id: 'outline-v6-phase3-provider',
        name: 'Outline V6 Phase3 Stream Mock',
        baseUrl: mockUrl,
        apiKey: 'key',
        models: ['outline-v6-phase3-model'],
        selectedModel: 'outline-v6-phase3-model',
        temperature: 0.1,
        maxTokens: 4096,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
      }],
      generateProvider: 'outline-v6-phase3-provider',
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

async function verifyRealUiLongStream(page) {
  await page.fill('#ow-chat-input', '请基于当前大纲输出一段长流式分析。')
  await page.click('#btn-ow-send')
  await page.waitForFunction(() => {
    const bubbles = Array.from(document.querySelectorAll('#ow-chat-messages .ow-msg-bubble'))
    return bubbles.some(item => (item.textContent || '').includes('长流段10'))
  }, null, { timeout: 30_000 })

  const inputLatency = await page.evaluate(async () => {
    const input = document.querySelector('#ow-chat-input')
    const start = performance.now()
    input.focus()
    document.execCommand('insertText', false, '测')
    await new Promise(resolve => requestAnimationFrame(resolve))
    return { latencyMs: performance.now() - start, disabled: input.disabled, readOnly: input.readOnly }
  })
  assert(inputLatency.disabled === false, 'chat input is not disabled while the provider stream is active')
  assert(inputLatency.readOnly === false, 'chat input is not readonly while the provider stream is active')
  assert(inputLatency.latencyMs < 500, `input remains responsive during streaming: ${inputLatency.latencyMs}ms`)

  await page.waitForFunction(({ longChunkCount }) => {
    const bubbles = Array.from(document.querySelectorAll('#ow-chat-messages .ow-msg-bubble'))
    return bubbles.some(item => (item.textContent || '').includes(`长流段${longChunkCount - 1}`))
  }, { longChunkCount: LONG_CHUNK_COUNT }, { timeout: 30_000 })
  await sleep(1000)

  const registry = await page.evaluate(async () => await window.electronAPI.providerNetRegistry())
  assert(registry.ok === true, 'provider registry is available in the owning window')
  const completed = registry.streams.filter(item => item.status === 'completed')
  assert(completed.length >= 1, `at least one stream reaches completed: ${JSON.stringify(registry.streams.map(item => item.status))}`)
  const uiStream = completed.find(item => item.providerId === 'outline-v6-phase3-provider' && item.projectId === PROJECT_ID)
  assert(uiStream, `the real UI stream is present in the main-process registry: ${JSON.stringify(registry.streams)}`)
  assert(uiStream.bytesReceived > 0, `registry records provider bytes: ${uiStream.bytesReceived}`)
  assert(uiStream.checkpoint.text.includes(`长流段${LONG_CHUNK_COUNT - 1}`), 'checkpoint preserves the deterministic tail')

  const scheduler = await page.evaluate(async () => await window.electronAPI.providerNetSchedulerSnapshot())
  assert(scheduler.ok === true, 'scheduler snapshot IPC is available')
  assert.equal(scheduler.snapshot.activeCountByProvider['outline-v6-phase3-provider'] || 0, 0,
    'scheduler snapshot reflects the completed stream and does not keep it active')
  assert.deepEqual(scheduler.snapshot.waitingCountByProvider, {}, 'main-process snapshot does not invent waiting queues')

  const storeMessages = await page.evaluate(({ tailText }) => ({
    count: window.__pinia?._s?.get('project')?.outlineChat?.length || 0,
    hasAssistant: (window.__pinia?._s?.get('project')?.outlineChat || []).some(message => message.role === 'assistant' && String(message.content || '').includes(tailText)),
  }), { tailText: `长流段${LONG_CHUNK_COUNT - 1}` })
  assert(storeMessages.hasAssistant, 'assistant stream result is present in chat state')
  assert(storeMessages.count >= 2, 'both user and assistant messages are journaled')
  await page.screenshot({ path: path.join(EVIDENCE_ROOT, '01-real-ui-long-stream.png'), fullPage: true })
  return { inputLatency, stream: { bytesReceived: uiStream.bytesReceived, chunkCount: uiStream.chunkCount } }
}

async function verifyRingBufferBound(page) {
  const burst = await page.evaluate(async ({ mockUrl }) => {
    let chunkCount = 0
    let bytes = 0
    const off = window.electronAPI.onProviderNetStreamFrame(payload => {
      if (payload.streamId !== 'phase3-burst-stream' || payload.transportEvent !== 'chunk') return
      chunkCount += 1
      bytes += (payload.text || '').length
    })
    const invoke = window.electronAPI.providerNetStream({
      url: `${mockUrl}/v1/chat/completions/burst`,
      headers: { authorization: 'key' },
      body: { model: 'outline-v6-phase3-model', stream: true },
      signalId: 'phase3-burst-stream',
      providerId: 'outline-v6-phase3-provider',
      projectId: 'phase3-window-project',
      slowStreamTolerant: true,
    })
    const heartbeat = setInterval(() => window.electronAPI.providerNetHeartbeat('phase3-burst-stream').catch(() => {}), 500)
    try {
      const invokeResult = await invoke
      await new Promise(resolve => setTimeout(resolve, 500))
      const registry = await window.electronAPI.providerNetRegistry()
      return {
        invokeResult,
        chunkCount,
        bytes,
        stream: registry.streams.find(item => item.streamId === 'phase3-burst-stream'),
      }
    } finally {
      clearInterval(heartbeat)
      off()
    }
  }, { mockUrl: MOCK_BASE_URL })

  assert.equal(burst.invokeResult.ok, true, 'burst stream completes through the real main-process transport')
  assert(burst.chunkCount >= 1024, `renderer receives every transported chunk: ${burst.chunkCount}`)
  const stream = burst.stream
  assert.equal(stream.status, 'completed', 'burst stream registry entry reaches completed')
  assert.equal(stream.backpressure, true, 'ring buffer enters backpressure beyond its production chunk bound')
  assert(stream.checkpoint.text.includes(`爆发段${BURST_READ_COUNT - 1}`), 'checkpoint preserves the tail after backpressure')
  assert(!stream.checkpoint.text.includes('爆发段0。'), 'checkpoint is bounded and does not retain the whole burst')
  return {
    transportedChunkCount: stream.chunkCount,
    rendererChunkCount: burst.chunkCount,
    bytesReceived: stream.bytesReceived,
    backpressure: stream.backpressure,
    checkpointLength: stream.checkpoint.text.length,
  }
}

async function verifyWindowIsolation(page) {
  const slowStream = await page.evaluate(async ({ mockUrl }) => {
    const invoke = window.electronAPI.providerNetStream({
      url: `${mockUrl}/v1/chat/completions/slow`,
      headers: { authorization: 'key' },
      body: { model: 'outline-v6-phase3-model', stream: true },
      signalId: 'phase3-window-owned-stream',
      providerId: 'outline-v6-phase3-provider',
      projectId: 'phase3-window-project',
    })
    const heartbeat = setInterval(() => window.electronAPI.providerNetHeartbeat('phase3-window-owned-stream').catch(() => {}), 500)
    const invokeResult = await invoke
    clearInterval(heartbeat)
    return { invokeResult }
  }, { mockUrl: MOCK_BASE_URL })
  await sleep(300)

  const popupPromise = page.waitForEvent('popup', { timeout: 10_000 })
  await page.evaluate(() => { window.open('index.html', '_blank', 'width=780,height=620') })
  const secondPage = await popupPromise
  await secondPage.waitForSelector('#app', { timeout: 20_000 })
  await sleep(500)
  const secondWindowView = await secondPage.evaluate(async () => ({
    registry: await window.electronAPI.providerNetRegistry(),
    scheduler: await window.electronAPI.providerNetSchedulerSnapshot(),
    heartbeat: await window.electronAPI.providerNetHeartbeat('phase3-window-owned-stream'),
  }))
  assert.deepEqual(secondWindowView.registry.streams, [], 'second window cannot see the first window stream')
  assert.deepEqual(secondWindowView.scheduler.snapshot.activeCountByProvider, {}, 'second window scheduler projection is isolated')
  assert.deepEqual(secondWindowView.heartbeat, { ok: false, error: 'stream_not_found' }, 'second window cannot heartbeat or take over the stream')
  await secondPage.close()

  const owned = await page.evaluate(async () => await window.electronAPI.providerNetRegistry())
  assert(owned.streams.some(item => item.streamId === 'phase3-window-owned-stream'), 'owning window still sees its stream')
  const result = slowStream.invokeResult
  assert(result && typeof result.ok === 'boolean', `owning window receives a settled IPC result: ${JSON.stringify(result)}`)
  assert.equal(result.ok, true, 'owning window stream completes after the read-only second window closes')
  const postStreamRegistry = await page.evaluate(async () => await window.electronAPI.providerNetRegistry())
  const postStream = postStreamRegistry.streams.find(item => item.streamId === 'phase3-window-owned-stream')
  assert(postStream && postStream.status === 'completed', `owning window stream reaches completed: ${JSON.stringify(postStream)}`)
  await page.screenshot({ path: path.join(EVIDENCE_ROOT, '02-window-isolation.png'), fullPage: true })
  return { secondWindowSeesStream: false, secondWindowCanHeartbeat: false, ownerCompleted: result.ok }
}

async function verifyOrphanRecoveryCheckpoint(page) {
  const result = await page.evaluate(async ({ mockUrl }) => {
    const invoke = window.electronAPI.providerNetStream({
      url: `${mockUrl}/v1/chat/completions/stall`,
      headers: { authorization: 'key' },
      body: { model: 'outline-v6-phase3-model', stream: true },
      signalId: 'phase3-orphan-stream',
      providerId: 'outline-v6-phase3-provider',
      projectId: 'phase3-window-project',
    })
    // Deliberately no heartbeat: this models a renderer that lost its event loop.
    const invokeResult = await invoke
    const registry = await window.electronAPI.providerNetRegistry()
    return { invokeResult, stream: registry.streams.find(item => item.streamId === 'phase3-orphan-stream') }
  }, { mockUrl: MOCK_BASE_URL })

  assert.equal(result.invokeResult.ok, false, 'orphan stream does not report success')
  assert.equal(result.invokeResult.kind, 'network', 'orphan stream is surfaced as a transport failure')
  assert.equal(result.invokeResult.message, '渲染窗口心跳丢失，流已进入恢复检查点')
  assert.equal(result.stream.status, 'orphaned')
  assert.equal(result.stream.orphanReason, 'heartbeat_timeout')
  assert.equal(result.stream.checkpoint.recoveryStatus, 'recovering')
  assert.equal(result.stream.checkpoint.disposition, 'partial')
  assert(result.stream.checkpoint.text.includes('开始输出'), 'checkpoint preserves the already received provider bytes')
  await page.screenshot({ path: path.join(EVIDENCE_ROOT, '03-orphan-recovery-checkpoint.png'), fullPage: true })
  return {
    status: result.stream.status,
    reason: result.stream.orphanReason,
    recoveryStatus: result.stream.checkpoint.recoveryStatus,
    disposition: result.stream.checkpoint.disposition,
  }
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
  const longStream = await verifyRealUiLongStream(page)
  const ringBuffer = await verifyRingBufferBound(page)
  const isolation = await verifyWindowIsolation(page)
  const orphan = await verifyOrphanRecoveryCheckpoint(page)

  const report = {
    schema: 'shenyi.outline-v6-phase3-e2e',
    version: 1,
    generatedAt: new Date().toISOString(),
    script: SCRIPT_NAME,
    projectId: PROJECT_ID,
    realUiLongStream: longStream,
    ringBuffer: ringBuffer,
    windowIsolation: isolation,
    orphanRecovery: orphan,
    providerRequests,
    assertions: {
      realUiSendAndStream: true,
      inputResponsiveDuringStream: true,
      registryHasProviderAndProjectIdentity: true,
      ringBufferBoundedBackpressure: true,
      schedulerSnapshotWindowIsolated: true,
      secondWindowReadOnly: true,
      heartbeatLossCreatesRecoveringPartialCheckpoint: true,
      orphanDoesNotImpersonateSuccess: true,
    },
  }
  fs.writeFileSync(path.join(EVIDENCE_ROOT, 'result.json'), JSON.stringify(report, null, 2), 'utf8')
  console.log(JSON.stringify(report, null, 2))
  console.log('[PASS] outline V6 Phase3 Electron verification completed')
} catch (error) {
  writeFailureScene(error)
  throw error
} finally {
  if (browser) await browser.close().catch(() => {})
  await stopElectron(electronApp)
  await sleep(1000)
  providerServer.close()
  removeDir(PROFILE)
}
