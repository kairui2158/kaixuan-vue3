import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = path.resolve(process.cwd())
const SCRIPT_NAME = 'verify-body-repair-ledger-electron.mjs'
const ELECTRON_EXE = process.env.SHENYI_BODY_LEDGER_ELECTRON
  ? path.resolve(process.env.SHENYI_BODY_LEDGER_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_BODY_LEDGER_CDP_PORT || 9371)
const PROFILE = path.join(ROOT, '_data', 'body-repair-ledger-profile')
const DATA_DIR = path.join(PROFILE, 'documents-data')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-body-repair-ledger-electron')
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const HEARTBEAT_PATH = path.join(EVIDENCE_ROOT, 'heartbeat.jsonl')
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_BODY_LEDGER_GLOBAL_TIMEOUT_MS || 5 * 60_000)
const STEP_TIMEOUT_MS = Number(process.env.SHENYI_BODY_LEDGER_STEP_TIMEOUT_MS || 120_000)
const STALLED_TIMEOUT_MS = Number(process.env.SHENYI_BODY_LEDGER_STALLED_TIMEOUT_MS || 20_000)
const DEAD_TIMEOUT_MS = Number(process.env.SHENYI_BODY_LEDGER_DEAD_TIMEOUT_MS || 45_000)
const KEEP_PROFILE = process.env.SHENYI_BODY_LEDGER_KEEP_PROFILE === '1'
const PROJECT_ID = 'body-repair-ledger'
const VOLUME_ID = 'volume-body-repair'
const CHAPTER_ID = 'chapter-body-repair-1'

const VOLUME_OUTLINE = [
  '## 卷级常任约束',
  '> 作用域：卷级常任',
  '- 全卷不得提前揭示灯芯真相。',
  '',
  '## 剧情单元 H1-01 雨夜',
  '> 作用域：单元级 H1-01',
  '章节范围：第 1 章',
  '- 雨夜中，主角检查旧灯塔底层的纸条。',
].join('\n')

const CLEAN_SENTENCE = '雨停在灯塔外。林照把纸条贴在灯芯旁，火光第一次稳定下来，他数着潮声调整呼吸。'
function buildBody(count) {
  return Array.from({ length: count }, (_, index) => `${CLEAN_SENTENCE}第${index + 1}次呼吸结束。`).join('\n')
}
const VALID_BODY = buildBody(60)
const SHORT_BODY = buildBody(8)

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
      const next = queue.length > 0 ? queue.shift() : { body: VALID_BODY, finishReason: 'stop' }
      let wantsStream = false
      try { wantsStream = JSON.parse(bodyText).stream === true } catch {}
      if (wantsStream) {
        const chunks = [
          `data: ${JSON.stringify({ choices: [{ delta: { content: next.body } }] })}\n\n`,
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
        choices: [{ finish_reason: next.finishReason, message: { role: 'assistant', content: next.body } }]
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

async function seedApplication(page, provider) {
  await page.evaluate(async seed => {
    const { baseUrl, projectId, volumeId, chapterId, volumeOutline } = seed
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'body-repair-provider',
        name: 'Body Repair Provider',
        baseUrl,
        apiKey: 'body-repair-local-key',
        models: ['body-repair-model'],
        selectedModel: 'body-repair-model',
        temperature: 0.1,
        maxTokens: 4096,
        contextWindowTokens: 128000,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
      }],
      generateProvider: 'body-repair-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: '正文修复台账实测',
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
        id: volumeId,
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
        [volumeId]: [{
          id: chapterId,
          title: '第1章 纸条',
          index: 0,
          plot: '雨夜中主角检查旧灯塔底层的纸条。',
          summary: '雨夜中主角检查旧灯塔底层的纸条。',
          confirmed: true,
          pipelineGenerated: true,
          unitId: 'H1-01',
        }],
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
      modes: { 0: 'compose', 1: 'compose', 2: 'compose', 3: 'compose', 4: 'compose' },
      skillAgents: {},
    })
    await window.electronAPI.storageWrite('wa_deAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
    await window.electronAPI.storageRemove('wa_pipeline_breakpoint')
  }, {
    baseUrl: `http://127.0.0.1:${provider.port}`,
    projectId: PROJECT_ID,
    volumeId: VOLUME_ID,
    chapterId: CHAPTER_ID,
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
    return {
      at: new Date().toISOString(),
      runId: run?.id || null,
      runStatus: run?.status || null,
      lastEventType: (run?.events || []).at(-1)?.type || null,
      progress: pipeline?.generationProgress ?? null,
      status: pipeline?.generationStatus || null,
      isGenerating: Boolean(pipeline?.isGenerating),
    }
  })
}

function startHeartbeat(page, electronPid) {
  let stopped = false
  const startedAtMs = Date.now()
  const worker = (async () => {
    let written = 0
    try {
      while (!stopped) {
        try {
          const state = { ...(await snapshot(page)), electronPid, frame: written + 1 }
          fs.appendFileSync(HEARTBEAT_PATH, `${JSON.stringify(state)}\n`, 'utf8')
          written += 1
        } catch (error) {
          fs.appendFileSync(HEARTBEAT_PATH,
            `${JSON.stringify({ at: new Date().toISOString(), error: String(error?.message || error), frame: written + 1 })}\n`, 'utf8')
          written += 1
        }
        await sleep(1000)
      }
    } catch {}
    return written
  })()
  return {
    async stop() {
      stopped = true
      return worker
    },
    frameCount() {
      try {
        return fs.readFileSync(HEARTBEAT_PATH, 'utf8').split('\n').filter(Boolean).length
      } catch { return 0 }
    },
    durationMs() {
      return Date.now() - startedAtMs
    },
  }
}

async function uiLockSnapshot(page) {
  return page.evaluate(() => ({
    volumeSelect: Boolean(document.querySelector('#pl-context-summary select')?.disabled),
    chapterSelect: Boolean(document.querySelectorAll('#pl-context-summary select')[1]?.disabled),
    generateButton: Boolean(document.querySelector('#btn-pl-gen-body')?.disabled),
  }))
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
  let lockedDuringRun = null
  const deadline = Date.now() + STEP_TIMEOUT_MS
  while (Date.now() < deadline) {
    const state = await snapshot(page)
    if (state.isGenerating && !lockedDuringRun) {
      lockedDuringRun = await uiLockSnapshot(page)
      console.log(`[LOCKED] ${JSON.stringify(lockedDuringRun)}`)
    }
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
    if (!state.isGenerating && state.runStatus && state.runStatus !== 'running') {
      return { state, lockedDuringRun }
    }
    await sleep(500)
  }
  throw new Error(`body generation did not finish within ${STEP_TIMEOUT_MS}ms: ${JSON.stringify(lastSnapshot)}`)
}

function parseDetail(value) {
  if (typeof value !== 'string') return value || {}
  try { return JSON.parse(value) } catch { return { raw: value } }
}

async function currentRun(page) {
  return page.evaluate(({ chapterId }) => {
    const trace = window.__pinia?._s?.get('runTrace')
    const run = [...(trace?.runs || [])]
      .filter(item => item.source === 'pipeline' && item.step === 4 && item.stepName === '正文层')
      .sort((a, b) => b.startedAt - a.startedAt)[0] || null
    const project = window.__pinia?._s?.get('project')
    const chapter = Object.values(project?.chapters || {})
      .flat()
      .find(item => item?.id === chapterId)
    return { run, body: String(chapter?.body || '') }
  }, { chapterId: CHAPTER_ID })
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
  const electronProcess = startElectron()
  let browser = null
  let page = null
  let heartbeat = null
  try {
    assert(await waitForCdp(), 'CDP reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    page = await connectPage(browser)
    page.on('pageerror', error => console.error(`[PAGE ERROR] ${error.message}`))
    page.on('crash', () => console.error('[PAGE CRASH] renderer process crashed'))
    page.on('console', message => {
      if (message.type() === 'error') console.error(`[PAGE ERROR] ${String(message.text()).slice(0, 600)}`)
    })
    await page.waitForSelector('#app', { timeout: 20_000 })
    await sleep(1500)
    await seedApplication(page, provider)
    provider.enqueue({ body: SHORT_BODY, finishReason: 'stop' })
    provider.enqueue({ body: VALID_BODY, finishReason: 'stop' })
    heartbeat = startHeartbeat(page, electronProcess.pid)
    const { state, lockedDuringRun } = await runBodyThroughUi(page)
    const { run, body } = await currentRun(page)

    assert.equal(state.runStatus, 'success', `run succeeds, got ${state.runStatus}`)
    assert.equal(state.isGenerating, false, 'generation lock is released')
    assert(lockedDuringRun, 'UI lock state was captured while generating')
    assert.equal(lockedDuringRun.volumeSelect, true, 'volume selector is locked while generating')
    assert.equal(lockedDuringRun.chapterSelect, true, 'chapter selector is locked while generating')
    assert.equal(lockedDuringRun.generateButton, true, 'generate button is locked while generating')
    const attempts = (run?.events || [])
      .filter(event => event.type === 'body-artifact-attempt')
      .map(event => parseDetail(event.detail))
    assert.equal(attempts.length, 2, `attempt ledger records initial + targeted repair, got ${attempts.length}`)
    assert.equal(attempts[0].repairScope, 'none', 'first attempt has no repair scope')
    assert.equal(attempts[0].status, 'too_short', 'short first attempt is classified')
    assert.equal(attempts[1].repairScope, 'targeted', 'second attempt is targeted repair')
    assert.equal(attempts[1].status, 'complete', 'targeted repair completes')
    assert.ok(attempts[1].bodyPreview.length <= 200, 'trace stores a bounded preview, not the full body')

    assert.equal(provider.requests().length, 2, 'targeted repair makes exactly one additional request')
    const heartbeatFrames = heartbeat.frameCount()
    const heartbeatDuration = heartbeat.durationMs()
    assert(Number.isFinite(heartbeatDuration), 'heartbeat duration is recorded')
    assert(heartbeatFrames >= 1, `heartbeat records the run, got ${heartbeatFrames} frames`)
    assert(heartbeatFrames >= Math.max(1, Math.floor(heartbeatDuration / 1200)),
      `heartbeat cadence is continuous for ${heartbeatDuration}ms, got ${heartbeatFrames} frames`)
    const repairRequest = JSON.parse(provider.requests()[1].bodyText)
    const repairPrompt = repairRequest.messages.find(message => message.role === 'user')?.content || ''
    assert(repairPrompt.includes('【上一版正文】'), 'targeted repair carries the previous body')
    assert(repairPrompt.includes(SHORT_BODY), 'targeted repair prompt contains the failed body')
    assert(repairPrompt.includes('目标字数：3000'), 'targeted repair carries the target word count')

    const lockedSnapshot = await page.evaluate(() => ({
      volumeSelect: Boolean(document.querySelector('#pl-context-summary select')?.disabled),
      chapterSelect: Boolean(document.querySelectorAll('#pl-context-summary select')[1]?.disabled),
      generateButton: Boolean(document.querySelector('#btn-pl-gen-body')?.disabled),
    }))
    assert.equal(lockedSnapshot.volumeSelect, false, 'volume selector unlocks after generation')
    assert.equal(lockedSnapshot.chapterSelect, false, 'chapter selector unlocks after generation')
    assert.equal(lockedSnapshot.generateButton, false, 'generate button unlocks after generation')
    assert(body.includes(VALID_BODY), 'final valid body is persisted to the chapter')

    await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'final.png'), fullPage: false })
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'provider-requests.json'),
      JSON.stringify(provider.requests(), null, 2), 'utf8')
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'trace-run.json'),
      JSON.stringify(run, null, 2), 'utf8')
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'report.json'), JSON.stringify({
      schema: 'shenyi.body-repair-ledger.electron',
      version: 1,
      generatedAt: new Date().toISOString(),
      script: SCRIPT_NAME,
      runId: state.runId,
      status: state.runStatus,
      attempts: attempts.map(attempt => ({
        attemptId: attempt.attemptId,
        repairScope: attempt.repairScope,
        status: attempt.status,
        wordCount: attempt.wordCount,
      })),
      requestCount: provider.requests().length,
      heartbeatFrames,
      heartbeatDurationMs: heartbeatDuration,
      uiLocks: {
        duringGeneration: lockedDuringRun,
        afterGeneration: lockedSnapshot,
      },
    }, null, 2), 'utf8')
    console.log('===== BODY REPAIR LEDGER ELECTRON PASSED =====')
  } finally {
    heartbeat?.stop()
    closeElectron(electronProcess)
    try { await browser?.close() } catch {}
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
