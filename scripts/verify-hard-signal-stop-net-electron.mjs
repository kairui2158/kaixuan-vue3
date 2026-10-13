import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = path.resolve(process.cwd())
const SCRIPT_NAME = 'verify-hard-signal-stop-net-electron.mjs'
const ELECTRON_EXE = process.env.SHENYI_HARD_SIGNAL_ELECTRON
  ? path.resolve(process.env.SHENYI_HARD_SIGNAL_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_HARD_SIGNAL_CDP_PORT || 9363)
const PROFILE = path.join(ROOT, '_data', 'hard-signal-stop-net-profile')
const DATA_DIR = path.join(PROFILE, 'documents-data')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-hard-signal-stop-net-electron')
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const HEARTBEAT_PATH = path.join(EVIDENCE_ROOT, 'heartbeat.jsonl')
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_HARD_SIGNAL_GLOBAL_TIMEOUT_MS || 10 * 60_000)
const STEP_TIMEOUT_MS = Number(process.env.SHENYI_HARD_SIGNAL_STEP_TIMEOUT_MS || 120_000)
const STALLED_TIMEOUT_MS = Number(process.env.SHENYI_HARD_SIGNAL_STALLED_TIMEOUT_MS || 20_000)
const DEAD_TIMEOUT_MS = Number(process.env.SHENYI_HARD_SIGNAL_DEAD_TIMEOUT_MS || 45_000)
const KEEP_PROFILE = process.env.SHENYI_HARD_SIGNAL_KEEP_PROFILE === '1'

const VOLUME_OUTLINE = [
  '## 卷级常任约束',
  '> 作用域：卷级常任',
  '- 全卷不得提前揭示灯芯真相。',
  '',
  '## 剧情单元 H1-01 雨夜',
  '> 作用域：单元级 H1-01',
  '章节范围：第 1 - 3 章',
  '- 雨夜中，主角检查旧灯塔底层的纸条。',
  '',
  '## 情绪弧线',
  '> 作用域：卷级常任',
  '| 第1章 | 警觉 |',
  '| 第2章 | 抵抗 |',
].join('\n')

const CLEAN_SENTENCE = '雨停在灯塔外。林照把纸条贴在灯芯旁，火光第一次稳定下来，他数着潮声调整呼吸。'
const CLEAN_BODY = Array.from({ length: 60 }, (_, index) => `${CLEAN_SENTENCE}第${index + 1}次呼吸结束。`).join('\n')
function storageProjectKey(projectId) {
  return `wa_project_${projectId}`.replace(/[^a-zA-Z0-9_-]/g, '_')
}
const REFUSAL_SENTENCE = '抱歉，我无法继续创作这一章。'
const POLLUTED_BODY = [
  `${CLEAN_SENTENCE}第1次呼吸结束。`,
  REFUSAL_SENTENCE,
  ...Array.from({ length: 58 }, (_, index) => `${CLEAN_SENTENCE}第${index + 2}次呼吸结束。`)
].join('\n')
const REPAIRED_BODY = [
  `${CLEAN_SENTENCE}第1次呼吸结束。`,
  ...Array.from({ length: 59 }, (_, index) => `${CLEAN_SENTENCE}第${index + 2}次呼吸结束。`)
].join('\n')
const REPAIR_FINDING_START = POLLUTED_BODY.indexOf(REFUSAL_SENTENCE)
const REPAIR_WINDOW = POLLUTED_BODY.slice(
  Math.max(0, REPAIR_FINDING_START - 600),
  Math.min(POLLUTED_BODY.length, REPAIR_FINDING_START + REFUSAL_SENTENCE.length + 600)
)
const REPAIRED_WINDOW = REPAIR_WINDOW.replace(`${REFUSAL_SENTENCE}\n`, '')

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
    },
    windowsHide: false,
  })
  console.log(`[VISIBLE ELECTRON] pid=${child.pid}`)
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
    page = browser.contexts()[0]?.pages()?.find(item => !item.url().startsWith('devtools://')) || null
    if (!page) await sleep(500)
  }
  assert(page, 'renderer page reachable')
  return page
}

function startProvider() {
  const requests = []
  const queue = []
  const server = http.createServer((request, response) => {
    let bodyText = ''
    request.on('data', chunk => { bodyText += chunk })
    request.on('end', () => {
      requests.push({ at: new Date().toISOString(), url: request.url, bodyText })
      const next = queue.length > 0
        ? queue.shift()
        : { body: CLEAN_BODY, finishReason: 'stop' }
      const responseBody = typeof next.body === 'function' ? next.body(bodyText) : next.body
      let wantsStream = false
      try { wantsStream = JSON.parse(bodyText).stream === true } catch {}
      if (wantsStream) {
        const chunks = [
          `data: ${JSON.stringify({ choices: [{ delta: { content: responseBody } }] })}\n\n`,
          `data: ${JSON.stringify({
            choices: [{ delta: {}, finish_reason: next.finishReason }],
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          })}\n\n`,
          'data: [DONE]\n\n',
        ]
        response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' })
        chunks.forEach(chunk => response.write(chunk))
        response.end()
        return
      }
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({
        choices: [{ finish_reason: next.finishReason, message: { role: 'assistant', content: responseBody } }]
      }))
    })
  })
  return new Promise(resolve => {
      server.listen(0, '127.0.0.1', () => {
        resolve({
          port: server.address().port,
          requests: () => requests.map(item => ({ ...item })),
          enqueue: response => { queue.push(response) },
          close: () => new Promise(done => server.close(() => done())),
        })
      })
  })
}

async function seedApplication(page, provider, projectId) {
  await page.evaluate(async ({ baseUrl, projectId, volumeOutline }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'hard-signal-provider',
        name: 'Hard Signal Provider',
        baseUrl,
        apiKey: 'hard-signal-local-key',
        models: ['hard-signal-model'],
        selectedModel: 'hard-signal-model',
        temperature: 0.1,
        maxTokens: 4096,
        contextWindowTokens: 128000,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: false,
      }],
      generateProvider: 'hard-signal-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: '硬信号Stop网实测',
      outlineText: '全书大纲',
      outlineLocked: true,
      outlineLockedText: '全书大纲',
      bookWordCount: 120000,
      volumesConfirmed: true,
      pipelineConfig: { volumeCount: 1, volumeWords: 200000, chapterWords: 3000 },
      chaptersConfirmed: true,
      settingsGenerated: true,
      settings: [],
      volumes: [{
        id: 'volume-hard-signal',
        name: '第一卷 雨夜',
        index: 0,
        outline: volumeOutline,
        summary: '雨夜中的灯塔纸条。',
        suggestedWords: 200000,
        confirmed: true,
        locked: true,
        isBound: true,
      }],
      chapters: {
        'volume-hard-signal': [{
          id: 'chapter-hard-signal-1',
          title: '第1章 纸条',
          index: 0,
          plot: '雨夜中主角检查旧灯塔底层的纸条。',
          summary: '雨夜中主角检查旧灯塔底层的纸条。',
          confirmed: true,
          pipelineGenerated: true,
          unitId: 'H1-01',
        }]
      },
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
      modes: { 0: 'compose', 1: 'compose', 2: 'chain', 3: 'chain', 4: 'chain' },
      skillAgents: {},
    })
    await window.electronAPI.storageWrite('wa_deAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
    await window.electronAPI.storageRemove('wa_pipeline_breakpoint')
  }, {
    baseUrl: `http://127.0.0.1:${provider.port}`,
    projectId,
    volumeOutline: VOLUME_OUTLINE,
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20_000 })
  await sleep(1200)
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
  await sleep(300)
}

function snapshot(page) {
  return page.evaluate(() => {
    const pipeline = window.__pinia?._s?.get('pipeline')
    const trace = window.__pinia?._s?.get('runTrace')
    const run = [...(trace?.runs || [])]
      .filter(item => item.source === 'pipeline' && item.step === 4 && item.stepName === '正文层')
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    const lastBodyLog = (window.__pinia?._s?.get('executionLog')?.logs || []).at(-1)?.message || null
    return {
      at: new Date().toISOString(),
      runId: run?.id || null,
      runStatus: run?.status || null,
      hardSignalEvents: (run?.events || []).filter(event => event.type === 'hard_signal_scan').length,
      lastEventType: (run?.events || []).at(-1)?.type || null,
      progress: pipeline?.generationProgress ?? null,
      status: pipeline?.generationStatus || null,
      isGenerating: Boolean(pipeline?.isGenerating),
      lastBodyLog,
    }
  })
}

function startHeartbeat(page, electronPid) {
  let stopped = false
  const timer = setInterval(async () => {
    if (stopped) return
    try {
      const state = { ...(await snapshot(page)), electronPid }
      fs.appendFileSync(HEARTBEAT_PATH, `${JSON.stringify(state)}\n`, 'utf8')
    } catch (error) {
      fs.appendFileSync(HEARTBEAT_PATH,
        `${JSON.stringify({ at: new Date().toISOString(), error: String(error?.message || error) })}\n`, 'utf8')
    }
  }, 1000)
  return { stop() { stopped = true; clearInterval(timer) } }
}

async function runBodyThroughUi(page) {
  await page.click('#btn-pipeline')
  await page.waitForSelector('#pipeline-panel', { timeout: 10_000 })
  await page.locator('#pl-steps .pl-step').nth(4).click()
  await page.waitForSelector('#pl-step-5-content', { state: 'visible' })
  const volumeSelect = page.locator('#pl-context-summary select').first()
  await volumeSelect.waitFor({ state: 'visible', timeout: 20_000 })
  await volumeSelect.selectOption({ index: 0 })
  await sleep(500)
  const chapterSelect = page.locator('#pl-context-summary select').nth(1)
  await chapterSelect.waitFor({ state: 'visible', timeout: 20_000 })
  await page.waitForFunction(() => {
    const select = document.querySelectorAll('#pl-context-summary select')[1]
    return Boolean(select && select.options.length > 0)
  }, null, { timeout: 20_000 })
  await chapterSelect.selectOption({ index: 0 })
  await page.click('#btn-pl-gen-body')

  let lastSignature = null
  let lastProgressAt = Date.now()
  let lastSnapshot = null
  const deadline = Date.now() + STEP_TIMEOUT_MS
  while (Date.now() < deadline) {
    const state = await snapshot(page)
    const signature = JSON.stringify(state)
    if (signature !== lastSignature) {
      lastSignature = signature
      lastProgressAt = Date.now()
      lastSnapshot = state
      console.log(`[BODY] ${JSON.stringify(state)}`)
    } else if (Date.now() - lastProgressAt >= DEAD_TIMEOUT_MS) {
      throw new Error(`body generation is dead for ${DEAD_TIMEOUT_MS}ms: ${JSON.stringify(lastSnapshot)}`)
    } else if (Date.now() - lastProgressAt >= STALLED_TIMEOUT_MS) {
      console.warn(`[STALL WARNING] body generation unchanged for ${Date.now() - lastProgressAt}ms`)
    }
    if (!state.isGenerating && state.runStatus && state.runStatus !== 'running') return state
    await sleep(500)
  }
  throw new Error(`body generation did not finish within ${STEP_TIMEOUT_MS}ms: ${JSON.stringify(lastSnapshot)}`)
}

function parseDetail(value) {
  if (typeof value !== 'string') return value || {}
  try { return JSON.parse(value) } catch { return { raw: value } }
}

async function currentRun(page) {
  return page.evaluate(() => {
    const trace = window.__pinia?._s?.get('runTrace')
    return [...(trace?.runs || [])]
      .filter(item => item.source === 'pipeline' && item.step === 4 && item.stepName === '正文层')
      .sort((a, b) => b.startedAt - a.startedAt)[0] || null
  })
}

async function currentBody(page) {
  return page.evaluate(() => {
    const project = window.__pinia?._s?.get('project')
    const chapter = project?.chapters?.['volume-hard-signal']?.[0]
    const raw = String(chapter?.body || chapter?.result || '')
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed.body === 'string') return parsed.body
    } catch {}
    return raw
  })
}

async function assertCleanRun(result) {
  assert.equal(result.state.runStatus, 'success', `clean run succeeds, got ${result.state.runStatus}`)
  assert.equal(result.run.events.filter(event => event.type === 'hard_signal_scan').length, 1,
    'clean run records exactly one passing hard_signal_scan')
  const scan = parseDetail(result.run.events.find(event => event.type === 'hard_signal_scan').detail)
  assert.equal(scan.status, 'pass', 'clean scan passes')
  assert.equal(scan.detected, false, 'clean scan has no findings')
  assert.equal(result.body.includes(CLEAN_BODY), true, 'clean body is persisted')
  assert.equal(result.requests.length, 1, 'clean run makes exactly one physical provider request')
}

async function assertRepairRun(result) {
  assert.equal(result.state.runStatus, 'success', `repaired run succeeds, got ${result.state.runStatus}`)
  const events = result.run.events.filter(event => event.type === 'hard_signal_scan')
  assert.equal(events.length, 2, `repaired run records scan + repair rescan, got ${events.length}`)
  const firstScan = parseDetail(events[0].detail)
  assert.equal(firstScan.detected, true, 'polluted body is detected')
  assert.equal(firstScan.counts.refusal, 1, 'refusal finding is counted')
  const repairedScan = parseDetail(events[1].detail)
  assert.equal(repairedScan.detected, false, 'repair rescan passes')
  assert.equal(result.body.includes(REFUSAL_SENTENCE), false, 'refusal sentence is removed')
  assert(result.body.includes(CLEAN_SENTENCE), 'clean prose remains after repair')
  assert.equal(result.requests.length, 2, 'repair uses one additional provider request')
  const repairRequest = JSON.parse(result.requests[1].bodyText)
  const repairPrompt = repairRequest.messages.find(message => message.role === 'user')?.content || ''
  assert(repairPrompt.length < result.body.length, 'repair prompt carries a local window, not the full body')
  assert(repairPrompt.includes(REFUSAL_SENTENCE), 'repair prompt contains the polluted evidence')
  assert.equal(repairPrompt.includes(result.body.slice(-500)), false, 'repair prompt does not contain the body tail')
}

async function assertUnresolvedRun(result) {
  assert.equal(result.state.runStatus, 'degraded',
    `provider truncation reaches degraded terminal, got ${result.state.runStatus}`)
  const events = result.run.events.filter(event => event.type === 'hard_signal_scan')
  assert(events.length >= 2, 'unresolved run records the provider scan and the terminal event')
  const terminal = parseDetail(events.at(-1).detail)
  assert.equal(terminal.status, 'hard_signal_unresolved', 'terminal status is hard_signal_unresolved')
  assert.equal(terminal.counts.truncated, 1, 'provider truncation remains counted')
  assert.equal(result.requests.length, 1, 'provider-level truncation never triggers a local repair request')
  assert(result.body.includes(CLEAN_BODY), 'provider text is still persisted for user recovery')
}

async function runCase(provider, { projectId, responses }) {
  const electronProcess = startElectron()
  let browser = null
  try {
    assert(await waitForCdp(), 'CDP reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    const page = await connectPage(browser)
    page.on('pageerror', error => console.error(`[PAGE ERROR] ${error.message}`))
    page.on('crash', () => console.error('[PAGE CRASH] renderer process crashed'))
    page.on('console', message => {
      if (message.type() === 'error') console.error(`[PAGE ERROR] ${String(message.text()).slice(0, 600)}`)
    })
    await page.waitForSelector('#app', { timeout: 20_000 })
    await sleep(1500)
    await seedApplication(page, provider, projectId)
    const startRequestIndex = provider.requests().length
    for (const response of responses) provider.enqueue(response)
    const heartbeat = startHeartbeat(page, electronProcess.pid)
    try {
      const state = await runBodyThroughUi(page)
      const run = await currentRun(page)
      const body = await currentBody(page)
      return {
        page,
        browser,
        electronProcess,
        state,
        run,
        body,
        requests: provider.requests().slice(startRequestIndex),
      }
    } finally {
      heartbeat.stop()
    }
  } catch (error) {
    closeElectron(electronProcess)
    try { await browser?.close() } catch {}
    throw error
  }
}

async function main() {
  assertFreshRendererBuild()
  fs.rmSync(EVIDENCE_ROOT, { recursive: true, force: true })
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })

  const watchdog = setTimeout(() => {
    console.error(`[FAIL] global timeout after ${GLOBAL_TIMEOUT_MS}ms`)
    process.exit(1)
  }, GLOBAL_TIMEOUT_MS)
  watchdog.unref()

  const provider = await startProvider()
  const report = {
    schema: 'shenyi.hard-signal-stop-net.electron',
    version: 1,
    generatedAt: new Date().toISOString(),
    script: SCRIPT_NAME,
    cases: [],
  }

  try {
    const clean = await runCase(provider, {
      projectId: 'hard-signal-clean',
      responses: [{ body: CLEAN_BODY, finishReason: 'stop' }],
    })
    try {
      await assertCleanRun(clean)
      report.cases.push({
        case: 'clean_body_passes_without_repair',
        runId: clean.state.runId,
        status: clean.state.runStatus,
        scanEvents: clean.run.events.filter(event => event.type === 'hard_signal_scan').length,
        requestCount: clean.requests.length,
      })
      await clean.page.screenshot({ path: path.join(EVIDENCE_ROOT, 'clean-final.png'), fullPage: false })
    } finally {
      closeElectron(clean.electronProcess)
      await clean.browser.close()
    }

    const repair = await runCase(provider, {
      projectId: 'hard-signal-repair',
      responses: [
        { body: POLLUTED_BODY, finishReason: 'stop' },
        { body: () => REPAIRED_WINDOW, finishReason: 'stop' },
      ],
    })
    try {
      await assertRepairRun(repair)
      report.cases.push({
        case: 'polluted_body_repairs_once_and_rescans_clean',
        runId: repair.state.runId,
        status: repair.state.runStatus,
        scanEvents: repair.run.events.filter(event => event.type === 'hard_signal_scan').length,
        requestCount: repair.requests.length,
      })
      await repair.page.screenshot({ path: path.join(EVIDENCE_ROOT, 'repair-final.png'), fullPage: false })
    } finally {
      closeElectron(repair.electronProcess)
      await repair.browser.close()
    }

    const unresolved = await runCase(provider, {
      projectId: 'hard-signal-provider-truncation',
      responses: [{ body: CLEAN_BODY, finishReason: 'length' }],
    })
    try {
      await assertUnresolvedRun(unresolved)
      report.cases.push({
        case: 'provider_truncation_never_locally_repaired',
        runId: unresolved.state.runId,
        status: unresolved.state.runStatus,
        scanEvents: unresolved.run.events.filter(event => event.type === 'hard_signal_scan').length,
        requestCount: unresolved.requests.length,
      })
      await unresolved.page.screenshot({ path: path.join(EVIDENCE_ROOT, 'unresolved-final.png'), fullPage: false })
    } finally {
      closeElectron(unresolved.electronProcess)
      await unresolved.browser.close()
    }

    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'provider-requests.json'),
      JSON.stringify(provider.requests(), null, 2), 'utf8')
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'report.json'), JSON.stringify(report, null, 2), 'utf8')
    const persistedBodies = {}
    for (const entry of report.cases) {
      const projectId = entry.case === 'clean_body_passes_without_repair'
        ? 'hard-signal-clean'
        : entry.case === 'polluted_body_repairs_once_and_rescans_clean'
          ? 'hard-signal-repair'
          : 'hard-signal-provider-truncation'
      const file = path.join(DATA_DIR, `wa_project_${storageProjectKey(projectId)}.json`)
      persistedBodies[entry.case] = fs.existsSync(file)
        ? JSON.parse(fs.readFileSync(file, 'utf8')).chapters?.['volume-hard-signal']?.[0]?.body || ''
        : ''
    }
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'persisted-bodies.json'),
      JSON.stringify(persistedBodies, null, 2), 'utf8')
    console.log('===== HARD SIGNAL STOP NET ELECTRON PASSED =====')
  } finally {
    await provider.close()
    clearTimeout(watchdog)
    if (!KEEP_PROFILE) {
      await removeDir(PROFILE)
    }
  }
}

main().catch(error => {
  console.error('[FAIL]', error)
  process.exitCode = 1
})
