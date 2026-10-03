import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = path.resolve(process.cwd())
const SCRIPT_NAME = 'verify-live-api-status-electron.mjs'
const ELECTRON_EXE = process.env.SHENYI_LIVE_STATUS_ELECTRON
  ? path.resolve(process.env.SHENYI_LIVE_STATUS_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_LIVE_STATUS_CDP_PORT || 9381)
const PROFILE = path.join(ROOT, '_data', 'live-api-status-electron-profile')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-live-api-status-electron')
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const STREAM_WINDOW_MS = 8000
const POLL_INTERVAL_MS = 200
const INITIAL_STREAM_TEXT = '流'.repeat(32)
const RESUMED_STREAM_TEXT = '继续正文'
const INITIAL_STREAM_LENGTH = INITIAL_STREAM_TEXT.length
const RESUMED_STREAM_LENGTH = INITIAL_STREAM_LENGTH + RESUMED_STREAM_TEXT.length

fs.rmSync(EVIDENCE_ROOT, { recursive: true, force: true })
fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
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
  const staleBundles = bundleNames.filter(name => fs.statSync(path.join(ROOT, 'dist-renderer', name)).mtimeMs < newestSourceMs)
  assert.equal(staleBundles.length, 0, `renderer build is stale; rebuild with npm run build:vue. Stale bundles: ${staleBundles.join(', ')}`)
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
      SHENYI_DATA_DIR: path.join(PROFILE, 'documents-data'),
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
  sleep(1000).catch(() => {})
}

async function closeProjectModal(page) {
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
  await sleep(400)
}

async function prepareRun(page, source) {
  return await page.evaluate(runSource => {
    const store = window.__pinia?._s?.get('runTrace')
    if (!store) throw new Error('runTrace store is not exposed in the renderer')
    const runId = store.startRun({
      source: runSource,
      sessionKind: 'chat',
      mode: 'direct',
      projectId: 'live-api-status-electron',
      projectName: 'Live API Status Electron',
    })
    const turnId = store.startTurn(runId, {
      userRequest: '现场复刻：正文停在 32 字，但工具轮仍在执行',
      mode: 'direct',
    })
    const callId = store.startApiCall(runId, {
      requestMessages: [{ role: 'user', content: '现场复刻：正文停在 32 字，但工具轮仍在执行' }],
      model: 'live-status-probe',
    })
    return { runId, turnId, callId }
  }, source)
}

async function activateOutlineStatus(page) {
  await page.evaluate(() => {
    const hook = window.__shenyiOutlineStatusTestHook
    if (!hook) throw new Error('OutlineWorkspace live status test hook is unavailable')
    hook.set(true, '现场复刻：正在等待 API 返回')
  })
}

async function activateHomeStatus(page) {
  await page.evaluate(() => {
    const chat = window.__pinia?._s?.get('chat')
    if (!chat) throw new Error('chat store is not exposed in the renderer')
    chat.setGenerationState('streaming', '现场复刻：正在等待 API 返回')
  })
}

async function deactivateStatus(page, name) {
  await page.evaluate(caseName => {
    if (caseName === 'home') {
      window.__pinia?._s?.get('chat')?.setGenerationState('idle')
      return
    }
    window.__shenyiOutlineStatusTestHook?.set(false, '')
  }, name)
}

async function readStatus(page, selectors) {
  return await page.evaluate(({ rootSelector, lineSelector }) => {
    const root = document.querySelector(rootSelector)
    const lines = [...document.querySelectorAll(lineSelector)].map(node => node.textContent?.trim() || '')
    return {
      rootVisible: Boolean(root),
      rootText: root?.textContent?.trim() || '',
      lines,
    }
  }, selectors)
}

async function waitForStatus(page, selectors, predicate, label, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  let latest = null
  while (Date.now() < deadline) {
    latest = await readStatus(page, selectors)
    if (predicate(latest)) return latest
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error(`Timed out waiting for ${label}; last status=${JSON.stringify(latest)}`)
}

async function runCase({ page, name, source, activate, selectors, screenshotName }) {
  await activate()
  const handles = await prepareRun(page, source)
  const initialStatus = await page.evaluate(({ runId, callId, selectors, streamText }) => {
    const store = window.__pinia?._s?.get('runTrace')
    store.appendStream(runId, callId, streamText)
    store.appendPhysicalCall(runId, callId, {
      phase: 'tool_iteration',
      status: 'running',
      requestMessages: [{ role: 'user', content: 'tool round' }],
    })
    const lines = [...document.querySelectorAll(selectors.lineSelector)].map(node => node.textContent?.trim() || '')
    return {
      rootVisible: Boolean(document.querySelector(selectors.rootSelector)),
      lines,
      lastStreamActivityAt: store.getRun(runId)?.apiCalls.find(call => call.id === callId)?.lastStreamActivityAt,
      streamLength: store.getRun(runId)?.apiCalls.find(call => call.id === callId)?.streamText.length,
    }
  }, { runId: handles.runId, callId: handles.callId, selectors, streamText: INITIAL_STREAM_TEXT })

  const streaming = await readStatus(page, selectors)
  assert(
    streaming.lines.some(line => line === `流式接收中 · 已接收 ${INITIAL_STREAM_LENGTH} 字`),
    `${name}: live stream count must appear while a body delta just arrived; initial=${JSON.stringify(initialStatus)}, observed=${JSON.stringify(streaming)}`,
  )
  const streamingLineBeforeStale = await waitForStatus(
    page,
    selectors,
    status => status.lines.some(line => line === `流式接收中 · 已接收 ${INITIAL_STREAM_LENGTH} 字`),
    `${name}: streaming line should stay visible during the active body window (${JSON.stringify(initialStatus)})`,
  )

  assert(
    !streaming.lines.some(line => /editor\.write|outline\.read|tool/i.test(line)),
    `${name}: status surface must not expose tool identities`,
  )

  const staleDeadline = Date.now() + STREAM_WINDOW_MS + 4_000
  let toolRoundStatus = null
  while (Date.now() < staleDeadline) {
    await sleep(500)
    await page.evaluate(({ source: runSource, runId, callId }) => {
      const store = window.__pinia?._s?.get('runTrace')
      store.appendToolCall(runId, callId, {
        name: 'editor.write',
        input: { commands: [] },
        status: 'success',
        startedAt: Date.now(),
        endedAt: Date.now(),
      })
    }, { source, runId: handles.runId, callId: handles.callId })
    toolRoundStatus = await readStatus(page, selectors)
    if (toolRoundStatus.lines.some(line => line.includes('正在执行编辑任务，等待正文输出'))) break
  }
  assert(
    toolRoundStatus?.lines.some(line => line.includes('正在执行编辑任务，等待正文输出')),
    `${name}: stale 32-char stream must not keep claiming streaming; got ${JSON.stringify(toolRoundStatus)}`,
  )
  assert(
    !toolRoundStatus.lines.some(line => line.includes('流式接收中')),
    `${name}: stale stream line must disappear after the activity window`,
  )

  await page.evaluate(({ runId, callId, streamText }) => {
    const store = window.__pinia?._s?.get('runTrace')
    store.appendStream(runId, callId, streamText)
  }, { runId: handles.runId, callId: handles.callId, streamText: RESUMED_STREAM_TEXT })
  const resumed = await waitForStatus(
    page,
    selectors,
    status => status.lines.some(line => line === `流式接收中 · 已接收 ${RESUMED_STREAM_LENGTH} 字`),
    `${name}: resumed streaming state`,
  )

  await page.evaluate(({ runId, callId, responseText }) => {
    const store = window.__pinia?._s?.get('runTrace')
    store.finishApiCall(runId, callId, {
      status: 'success',
      responseText: responseText,
    })
  }, { runId: handles.runId, callId: handles.callId, responseText: INITIAL_STREAM_TEXT + RESUMED_STREAM_TEXT })
  await page.evaluate(({ runId, turnId }) => {
    const store = window.__pinia?._s?.get('runTrace')
    store.finishTurn(runId, turnId, 'success')
  }, { runId: handles.runId, turnId: handles.turnId })
  await deactivateStatus(page, name)
  await sleep(300)

  await page.screenshot({ path: path.join(EVIDENCE_ROOT, screenshotName), fullPage: true })
  const finalStatus = await readStatus(page, selectors)
  return {
    name,
    source,
    streamingLines: streaming.lines,
    toolRoundLines: toolRoundStatus.lines,
    resumedLines: resumed.lines,
    finalLines: finalStatus.lines,
  }
}

assertFreshRendererBuild()

let electronApp = null
let browser = null
try {
  electronApp = startElectron()
  assert(await waitForCdp(), 'Electron CDP endpoint became available')
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
  const context = browser.contexts()[0]
  const page = context.pages().find(candidate => candidate.url().includes('index.html')) || context.pages()[0]
  assert(page, 'Electron renderer page is available')
  await page.waitForSelector('#app', { timeout: 30_000 })
  await sleep(1200)
  await closeProjectModal(page)

  const homeCase = await runCase({
    page,
    name: 'home',
    source: 'home',
    activate: () => activateHomeStatus(page),
    selectors: { rootSelector: '#chat-generation-status', lineSelector: '.chat-live-status-line' },
    screenshotName: 'home-live-status.png',
  })

  await page.click('#btn-outline-workspace')
  await page.waitForSelector('#outline-editor', { timeout: 20_000 })
  await page.click('#btn-ai-co-create')
  await page.waitForSelector('#ow-chat-input', { timeout: 20_000 })
  const outlineCase = await runCase({
    page,
    name: 'outline',
    source: 'outline',
    activate: () => activateOutlineStatus(page),
    selectors: { rootSelector: '#ow-streaming-message', lineSelector: '.ow-live-status-line' },
    screenshotName: 'outline-live-status.png',
  })

  const report = {
    schema: 'shenyi.live-api-status-electron',
    version: 1,
    generatedAt: new Date().toISOString(),
    script: SCRIPT_NAME,
    streamActivityWindowMs: STREAM_WINDOW_MS,
    cases: [homeCase, outlineCase],
    assertions: {
      staleThirtyTwoCharStreamNotPresentedAsStreaming: true,
      toolRoundShowsWaitingForBodyWithoutToolIdentity: true,
      resumedBodyDeltaRestoresStreamingCount: true,
      statusSurfaceExcludesToolNames: true,
    },
  }
  fs.writeFileSync(path.join(EVIDENCE_ROOT, 'result.json'), JSON.stringify(report, null, 2), 'utf8')
  console.log(JSON.stringify(report, null, 2))
  console.log('[PASS] live API status Electron verification completed')
} finally {
  if (browser) await browser.close().catch(() => {})
  closeElectron(electronApp)
  await sleep(1000)
  try { fs.rmSync(PROFILE, { recursive: true, force: true }) } catch {}
}
