import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = path.resolve(process.cwd())
const SCRIPT_NAME = 'verify-reasoning-only-stall-electron.mjs'
const ELECTRON_EXE = process.env.SHENYI_REASONING_STALL_ELECTRON
  ? path.resolve(process.env.SHENYI_REASONING_STALL_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_REASONING_STALL_CDP_PORT || 9364)
const PROFILE = path.join(ROOT, '_data', 'reasoning-only-stall-profile')
const DATA_DIR = path.join(PROFILE, 'documents-data')
const EXPORT_ROOT = path.join(PROFILE, 'run-trace-exports')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-reasoning-only-stall-electron')
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const HEARTBEAT_PATH = path.join(EVIDENCE_ROOT, 'heartbeat.jsonl')
const PROJECT_ID = 'reasoning-only-stall-volume'
const BODY_ABSENT_TIMEOUT_MS = Number(process.env.SHENYI_BODY_ABSENT_TIMEOUT_MS || 15_000)
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_REASONING_STALL_GLOBAL_TIMEOUT_MS || 5 * 60_000)
const DEAD_TIMEOUT_MS = Number(process.env.SHENYI_REASONING_STALL_DEAD_TIMEOUT_MS || 45_000)
const KEEP_PROFILE = process.env.SHENYI_REASONING_STALL_KEEP_PROFILE === '1'

const OUTLINE_TEXT = [
  '# Reasoning-only 卷纲实测大纲',
  '第一卷 风暴起点：旧信、灯塔与南方航线共同推动主角完成第一次远航。',
  '第二卷 雾中港：港口交易、旧盟约与失踪船队让矛盾升级。',
].join('\n')

const VOLUME_JSON = JSON.stringify([{
  name: '第一卷 风暴起点',
  outline: '旧信揭开灯塔秘密，主角在南方航线选择信任同伴，完成第一次远航。',
  summary: '灯塔旧信与风暴航线推动第一卷冲突收束。',
  allocatedWords: 60000,
  readerExpectations: '读者期待看到主角第一次主动承担风险。',
  mainPlotLine: '旧信、灯塔与远航准备',
  unlockMilestone: '灯塔底层的航行图被解锁。',
  forbiddenFinalCards: [],
  contractRisk: 'contract_safe',
}])

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function removeDir(target) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.rmSync(target, { recursive: true, force: true })
      return
    } catch {}
    await sleep(300)
  }
}

function assertFreshRendererBuild() {
  const rendererIndex = path.join(ROOT, 'dist-renderer', 'index.html')
  assert(fs.existsSync(rendererIndex), 'dist-renderer/index.html exists; run npm run build:vue first')
  const indexHtml = fs.readFileSync(rendererIndex, 'utf8')
  const bundleNames = [...indexHtml.matchAll(/assets\/[^"']+\.js/g)].map(match => match[0])
  assert(bundleNames.length > 0, 'renderer index references at least one JS bundle')
  const sourceFiles = []
  const collectSources = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) collectSources(full)
      else if (/\.(ts|vue|js|mjs|css)$/.test(entry.name)) sourceFiles.push(full)
    }
  }
  collectSources(path.join(ROOT, 'src'))
  const newestSourceMs = Math.max(...sourceFiles.map(file => fs.statSync(file).mtimeMs))
  const staleBundles = bundleNames.filter(name =>
    fs.statSync(path.join(ROOT, 'dist-renderer', name)).mtimeMs < newestSourceMs)
  assert.equal(staleBundles.length, 0, `renderer build is stale: ${staleBundles.join(', ')}`)
}

function startElectron() {
  const child = spawn(ELECTRON_EXE, [
    '.',
    `--remote-debugging-port=${CDP_PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${PROFILE}`,
  ], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SHENYI_ALLOW_TEST_ISOLATION: '1',
      SHENYI_DATA_DIR: DATA_DIR,
      SHENYI_TEST_USER_DATA_DIR: path.join(PROFILE, 'app-data'),
      SHENYI_TEST_RUN_TRACE_EXPORT: EXPORT_ROOT,
      SHENYI_BODY_ABSENT_TIMEOUT_MS: String(BODY_ABSENT_TIMEOUT_MS),
    },
    windowsHide: false,
  })
  console.log(`[VISIBLE ELECTRON] pid=${child.pid} bodyAbsentTimeout=${BODY_ABSENT_TIMEOUT_MS}ms`)
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
  child.on('close', (code, signal) => {
    const text = `[ELECTRON CLOSE] code=${code} signal=${signal}\n`
    process.stdout.write(text)
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
    await sleep(500)
  }
  return false
}

function closeElectron(app) {
  if (!app || app.exitCode !== null) return
  try { execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
}

async function connectPage(browser) {
  let page = null
  for (let attempt = 0; attempt < 24 && !page; attempt++) {
    page = browser.contexts()[0]?.pages()
      ?.find(item => !item.url().startsWith('devtools://')) || null
    if (!page) await sleep(500)
  }
  assert(page, 'renderer page reachable')
  return page
}

async function installBuildTimeOverride(page) {
  await page.addInitScript(timeoutMs => {
    window.__SHENYI_AI_SERVICE_TEST_OVERRIDES__ = { bodyAbsentTimeoutMs: timeoutMs }
  }, BODY_ABSENT_TIMEOUT_MS)
}

function sse(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`
}

function startProvider() {
  const requests = []
  const server = http.createServer((request, response) => {
    let bodyText = ''
    request.on('data', chunk => { bodyText += chunk })
    request.on('end', () => {
      requests.push({ at: new Date().toISOString(), url: request.url, bodyText })
      let body = {}
      try { body = JSON.parse(bodyText) } catch {}
      assert.equal(body.stream, true, 'generation request uses streaming')
      response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' })
      if (body.reasoning_effort === 'none') {
        response.write(sse({ choices: [{ delta: { content: VOLUME_JSON } }] }))
        response.write(sse({
          choices: [{ delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
        }))
        response.write('data: [DONE]\n\n')
        response.end()
        return
      }

      // Pre-fix behavior: the provider keeps reasoning forever and never sends
      // body content, which used to leave the user with no terminal outcome.
      response.write(sse({ choices: [{ delta: { reasoning_content: '我先整理卷纲结构。' } }] }))
      const reasoningTimer = setInterval(() => {
        if (response.writableEnded) return
        response.write(sse({ choices: [{ delta: { reasoning_content: '仍在整理中。' } }] }))
      }, 2_000)
      response.on('close', () => {
        clearInterval(reasoningTimer)
        if (!response.writableEnded) response.end()
      })
    })
  })
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        requests: () => requests.map(item => ({ ...item })),
        close: () => new Promise(done => server.close(() => done())),
      })
    })
  })
}

async function seedApplication(page, provider) {
  await page.evaluate(async ({ baseUrl, projectId, outline }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'reasoning-only-stall-provider',
        name: 'Reasoning-only Stall Provider',
        baseUrl,
        apiKey: 'reasoning-only-local-key',
        models: ['reasoning-only-model'],
        selectedModel: 'reasoning-only-model',
        temperature: 0.1,
        maxTokens: 4096,
        contextWindowTokens: 128000,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
      }],
      generateProvider: 'reasoning-only-stall-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: 'Reasoning-only 卷纲实测',
      outlineText: outline,
      outlineLocked: true,
      outlineLockedText: outline,
      bookWordCount: 12,
      volumesConfirmed: false,
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
      outlineChat: [],
      chat: [],
      editorTabs: [],
    })
    await window.electronAPI.storageWrite('wa_skills', { skills: [], pipelineSkills: [] })
    await window.electronAPI.storageWrite('wa_pipeline_step_config', {
      agents: { 0: '', 1: '', 2: '', 3: '', 4: '' },
      skills: { 0: [], 1: [], 2: [], 3: [], 4: [] },
      modes: { 0: 'compose', 1: 'compose', 2: 'compose', 3: 'compose', 4: 'compose' },
      skillAgents: {},
    })
    await window.electronAPI.storageWrite('wa_deAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
    await window.electronAPI.storageRemove('wa_pipeline_breakpoint')
  }, {
    baseUrl: `http://127.0.0.1:${provider.port}/v1`,
    projectId: PROJECT_ID,
    outline: OUTLINE_TEXT,
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20_000 })
  await sleep(1200)
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
  await sleep(300)
  await page.evaluate(timeoutMs => {
    window.__SHENYI_AI_SERVICE_TEST_OVERRIDES__ = { bodyAbsentTimeoutMs: timeoutMs }
  }, BODY_ABSENT_TIMEOUT_MS)
}

function currentSnapshot(page) {
  return page.evaluate(() => {
    const trace = window.__pinia?._s?.get('runTrace')
    const pipeline = window.__pinia?._s?.get('pipeline')
    const project = window.__pinia?._s?.get('project')
    const run = [...(trace?.runs || [])]
      .filter(item => item.source === 'pipeline' && item.step === 2)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    const physicalCalls = (run?.apiCalls || []).flatMap(call => call.physicalCalls || [])
    return {
      at: new Date().toISOString(),
      runId: run?.id || null,
      runStatus: run?.status || null,
      apiCalls: (run?.apiCalls || []).length,
      physicalCalls: physicalCalls.length,
      lastPhysicalStatus: physicalCalls.at(-1)?.status || null,
      interruptionCodes: physicalCalls.map(item => item.interruptionCode || null),
      retryStrategies: physicalCalls.map(item => item.retryStrategy || null),
      lastEventType: (run?.events || []).at(-1)?.type || null,
      progress: pipeline?.activeVolumesRun?.progress ?? null,
      status: pipeline?.activeVolumesRun?.statusText || null,
      pipelineRunStatus: pipeline?.activeVolumesRun?.status || null,
      isGenerating: Boolean(pipeline?.isGenerating),
      volumeCount: (project?.volumes || []).length,
      lastLog: (window.__pinia?._s?.get('executionLog')?.logs || []).at(-1)?.message || null,
    }
  })
}

function startHeartbeat(page, electronPid) {
  let stopped = false
  const timer = setInterval(async () => {
    if (stopped) return
    try {
      const state = { ...(await currentSnapshot(page)), electronPid }
      fs.appendFileSync(HEARTBEAT_PATH, `${JSON.stringify(state)}\n`, 'utf8')
    } catch (error) {
      fs.appendFileSync(HEARTBEAT_PATH,
        `${JSON.stringify({ at: new Date().toISOString(), error: String(error?.message || error) })}\n`, 'utf8')
    }
  }, 1000)
  return { stop() { stopped = true; clearInterval(timer) } }
}

async function runVolumeGenerationThroughUi(page) {
  await page.click('#btn-pipeline')
  await page.waitForSelector('#pipeline-panel', { timeout: 20_000 })
  await page.locator('#pl-steps .pl-step').nth(2).click()
  await page.waitForSelector('#pl-step-3-content', { state: 'visible' })
  await page.locator('#pl-volume-count').fill('1')
  await page.locator('#pl-volume-count').dispatchEvent('change')
  await sleep(300)
  await page.click('#btn-pl-gen-volumes')

  let lastSignature = null
  let lastProgressAt = Date.now()
  let lastSnapshot = null
  const deadline = Date.now() + GLOBAL_TIMEOUT_MS - 30_000
  while (Date.now() < deadline) {
    const snapshot = await currentSnapshot(page)
    const signature = JSON.stringify(snapshot)
    if (signature !== lastSignature) {
      lastSignature = signature
      lastProgressAt = Date.now()
      lastSnapshot = snapshot
      console.log(`[VOLUME RUN] ${JSON.stringify(snapshot)}`)
    } else if (Date.now() - lastProgressAt >= DEAD_TIMEOUT_MS) {
      throw new Error(`volume generation is dead for ${DEAD_TIMEOUT_MS}ms: ${JSON.stringify(lastSnapshot)}`)
    }
    const stillWorking = !snapshot.runId
      || snapshot.runStatus === 'running'
      || snapshot.status === 'generating'
      || snapshot.isGenerating
    if (!stillWorking) return snapshot
    await sleep(500)
  }
  throw new Error(`volume generation did not finish: ${JSON.stringify(lastSnapshot)}`)
}

async function exportLatestRun(page) {
  const runId = await page.evaluate(() => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])]
      .filter(item => item.source === 'pipeline' && item.step === 2)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    return run?.id || null
  })
  assert(runId, 'volume-layer run trace exists')
  const exported = await page.evaluate(async ({ exportRoot, runId: id }) => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])].find(item => item.id === id)
    return await window.electronAPI.runTraceExport({
      schema: 'shenyi.run-trace',
      version: 2,
      run: store.exportRunToJson(run),
      mode: 'deep',
      payloadDirectoryHint: exportRoot,
    })
  }, { exportRoot: EXPORT_ROOT, runId })
  assert(exported?.success, `deep run trace export succeeds: ${exported?.error || 'unknown error'}`)
  const directory = exported.path
  const run = JSON.parse(fs.readFileSync(path.join(directory, 'run-trace.json'), 'utf8'))
  return { runId, directory, run }
}

function copyFileRobust(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  try {
    fs.copyFileSync(source, destination)
  } catch {
    fs.writeFileSync(destination, fs.readFileSync(source))
  }
  assert.equal(fs.statSync(destination).size, fs.statSync(source).size,
    `evidence copy preserves file size: ${source}`)
}

function copyExportEvidence(directory, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true })
  copyFileRobust(path.join(directory, 'run-trace.json'), path.join(targetDir, 'run-trace.json'))
  const payloadRoot = path.join(directory, 'payloads')
  if (!fs.existsSync(payloadRoot)) return
  for (const entry of fs.readdirSync(payloadRoot, { withFileTypes: true })) {
    if (!entry.isFile()) throw new Error(`unexpected payload entry: ${path.join(payloadRoot, entry.name)}`)
    copyFileRobust(path.join(payloadRoot, entry.name), path.join(targetDir, 'payloads', entry.name))
  }
}

function parseRequestBody(item) {
  try { return JSON.parse(item.bodyText) } catch { return {} }
}

function assertRequests(requests) {
  assert.equal(requests.length, 2,
    `reasoning-only stall makes exactly one semantic retry, got ${requests.length}`)
  const first = parseRequestBody(requests[0])
  const second = parseRequestBody(requests[1])
  assert.equal(first.reasoning_effort, undefined, 'first request does not disable reasoning')
  assert.equal(second.reasoning_effort, 'none', 'semantic retry disables reasoning')
  assert.equal(second.stream, true, 'semantic retry keeps streaming enabled')
}

function resolvePayloadText(directory, run, value) {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object' || !value.__payload) return ''
  const ref = (run.payloads || []).find(item => item.id === value.__payload.id)
  assert(ref?.file, `exported run references payload ${value.__payload.id}, but no payload ref exists`)
  assert.equal(path.basename(ref.file), ref.file, 'payload ref must be a single safe file name')
  return fs.readFileSync(path.join(directory, 'payloads', ref.file), 'utf8')
}

function assertRun(run, directory) {
  assert.equal(run.step, 2, `run is the volume layer, got step ${run.step}`)
  assert.equal(run.status, 'success', `run succeeds after semantic retry, got ${run.status}`)
  assert.equal((run.apiCalls || []).length, 1, 'retry stays inside the same API call')
  const physicalCalls = (run.apiCalls || []).flatMap(call => call.physicalCalls || [])
  assert.equal(physicalCalls.length, 2, `run records two physical requests, got ${physicalCalls.length}`)
  const [failed, succeeded] = physicalCalls
  assert.equal(failed.status, 'failed', 'reasoning-only stream is terminal-failed, not silently successful')
  assert.equal(failed.interruptionCode, 'reasoning_only_stalled',
    `failed physical call is classified as reasoning_only_stalled, got ${failed.interruptionCode}`)
  assert(Number.isFinite(Number(failed.bodyAbsentMs)) && Number(failed.bodyAbsentMs) >= BODY_ABSENT_TIMEOUT_MS - 1_000,
    `failed call records bodyAbsentMs, got ${failed.bodyAbsentMs}`)
  assert.equal(failed.firstContentAt, undefined, 'failed reasoning-only stream never receives body content')
  assert(Number.isFinite(Number(failed.lastReasoningAt)), 'failed call records lastReasoningAt')
  assert.equal(succeeded.status, 'success', 'semantic retry succeeds')
  assert.equal(succeeded.interruptionCode, undefined, 'successful retry has no interruption code')
  assert.equal(succeeded.retryStrategy, 'thinking_disabled',
    `successful retry records thinking_disabled, got ${succeeded.retryStrategy}`)
  assert(Number.isFinite(Number(succeeded.firstContentAt)), 'successful retry records firstContentAt')
  assert(Number.isFinite(Number(succeeded.lastContentAt)), 'successful retry records lastContentAt')
  const successText = [succeeded.responseText, succeeded.streamText]
    .map(value => resolvePayloadText(directory, run, value))
    .filter(value => value)
    .join('\n')
  assert(successText.includes('第一卷 风暴起点'),
    'successful retry carries the volume JSON body')
}

async function main() {
  assertFreshRendererBuild()
  fs.rmSync(EVIDENCE_ROOT, { recursive: true, force: true })
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })

  const provider = await startProvider()
  const electronProcess = startElectron()
  let browser = null
  let heartbeat = null
  const watchdog = setTimeout(() => {
    heartbeat?.stop()
    try { if (browser) browser.close() } catch {}
    closeElectron(electronProcess)
    provider.close()
    console.error(`[FAIL] global timeout after ${GLOBAL_TIMEOUT_MS}ms`)
    process.exit(1)
  }, GLOBAL_TIMEOUT_MS)
  watchdog.unref()
  try {
    assert(await waitForCdp(), 'CDP reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    const page = await connectPage(browser)
    page.on('pageerror', error => console.error(`[PAGE ERROR] ${error.message}`))
    page.on('crash', () => console.error('[PAGE CRASH] renderer process crashed'))
    page.on('console', message => {
      if (message.type() === 'error') console.error(`[PAGE ERROR] ${String(message.text()).slice(0, 600)}`)
    })
    await installBuildTimeOverride(page)
    await page.waitForSelector('#app', { timeout: 20_000 })
    await sleep(1200)
    await seedApplication(page, provider)
    heartbeat = startHeartbeat(page, electronProcess.pid)

    const completion = await runVolumeGenerationThroughUi(page)
    const requests = provider.requests()
    const exported = await exportLatestRun(page)
    assertRequests(requests)
    assertRun(exported.run, exported.directory)

    const volumes = await page.evaluate(() =>
      (window.__pinia?._s?.get('project')?.volumes || []))
    assert.equal(volumes.length, 1, `one volume is persisted, got ${volumes.length}`)
    assert.equal(volumes[0]?.name, '第一卷 风暴起点', 'persisted volume has the expected name')

    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'provider-requests.json'),
      JSON.stringify(requests, null, 2), 'utf8')
    copyExportEvidence(exported.directory, path.join(EVIDENCE_ROOT, 'run-trace'))
    await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'final-state.png'), fullPage: false })
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'report.json'), JSON.stringify({
      schema: 'shenyi.reasoning-only-stall.electron',
      version: 1,
      generatedAt: new Date().toISOString(),
      script: SCRIPT_NAME,
      projectId: PROJECT_ID,
      runId: exported.runId,
      runStatus: exported.run.status,
      physicalCallCount: (exported.run.apiCalls || []).flatMap(call => call.physicalCalls || []).length,
      interruptionCode: 'reasoning_only_stalled',
      retryStrategy: 'thinking_disabled',
      persistedVolumeCount: volumes.length,
      bodyAbsentTimeoutMs: BODY_ABSENT_TIMEOUT_MS,
      completionSnapshot: completion,
      hardRules: {
        visibleElectron: true,
        realUiOperation: '#btn-pipeline / #pl-steps .pl-step:nth(2) / #pl-volume-count / #btn-pl-gen-volumes',
        noSkillInjection: true,
        localMockProvider: true,
      },
    }, null, 2), 'utf8')

    console.log('===== REASONING ONLY STALL ELECTRON PASSED =====')
  } finally {
    heartbeat?.stop()
    clearTimeout(watchdog)
    try { if (browser) await browser.close() } catch {}
    closeElectron(electronProcess)
    await sleep(800)
    await provider.close()
    if (!KEEP_PROFILE) {
      await removeDir(PROFILE)
    }
  }
}

main().catch(error => {
  console.error('[FAIL]', error)
  process.exitCode = 1
})
