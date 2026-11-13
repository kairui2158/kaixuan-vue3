import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const SCRIPT_NAME = 'verify-outline-v6-main-ledger-e2e.mjs'
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const PROFILE = path.join(ROOT, '_data', 'outline-v6-main-ledger-profile')
const DATA_DIR = path.join(PROFILE, 'documents-data')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-outline-v6-main-ledger-e2e')
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const CDP_PORT = 9433
const BLOCK_DURATION_MS = Number(process.env.OUTLINE_BLOCK_DURATION_MS || 40_000)
const BLOCK_SETTLE_MS = BLOCK_DURATION_MS + 5_000
const CRASH_RECOVERY_TIMEOUT_MS = 60_000
const TOTAL_TIMEOUT_MS = 300_000

const totalDeadline = Date.now() + TOTAL_TIMEOUT_MS
let timedOut = false
let electronApp = null
let browser = null
let recoveryReloadedAt = 0

const totalTimeoutTimer = setTimeout(() => {
  timedOut = true
  writeFailureScene(new Error(`verification total timeout after ${TOTAL_TIMEOUT_MS}ms`))
  process.exitCode = 1
  forceStop().finally(() => process.exit(1))
}, TOTAL_TIMEOUT_MS)
totalTimeoutTimer.unref?.()

archiveEvidenceRoot()

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function logStage(stage) {
  assertTimeBudget(stage)
  const line = `[STAGE] ${stage} (${new Date().toISOString()})`
  console.log(line)
  fs.appendFileSync(RUN_LOG_PATH, `${line}\n`, 'utf8')
}

function assertTimeBudget(stage) {
  if (timedOut || Date.now() >= totalDeadline) {
    throw new Error(`stage timeout reached before ${stage}: deadline ${new Date(totalDeadline).toISOString()}`)
  }
}

async function withTimeout(operation, timeoutMs, label) {
  let timer = null
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
        timer.unref?.()
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function archiveEvidenceRoot() {
  if (!fs.existsSync(EVIDENCE_ROOT)) {
    fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
    return
  }
  const evidenceName = path.basename(EVIDENCE_ROOT)
  const archivedRoot = path.join(path.dirname(EVIDENCE_ROOT), `${evidenceName}-archived-${new Date().toISOString().replace(/[:.]/g, '-')}`)
  fs.renameSync(EVIDENCE_ROOT, archivedRoot)
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  fs.appendFileSync(path.join(EVIDENCE_ROOT, 'previous-evidence-archive.txt'), `${archivedRoot}\n`, 'utf8')
}

function removeDir(target) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(target, { recursive: true, force: true })
      return
    } catch (error) {
      logStage(`recovery probe failed: ${error && error.stack ? error.stack : String(error)}`)
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200)
  }
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
}

class RawCdpConnection {
  constructor(socket) {
    this.socket = socket
    this.nextId = 1
    this.pending = new Map()
    this.eventWaiters = []
    socket.addEventListener('message', event => {
      const message = JSON.parse(typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString('utf8'))
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id)
        this.pending.delete(message.id)
        if (message.error) reject(new Error(`${message.error.message || 'CDP command failed'}`))
        else resolve(message.result)
        return
      }
      this.eventWaiters = this.eventWaiters.filter(waiter => {
        if (message.method !== waiter.method) return true
        waiter.resolve(message.params)
        return false
      })
    })
    socket.addEventListener('close', () => {
      for (const { reject } of this.pending.values()) reject(new Error('CDP socket closed'))
      this.pending.clear()
      for (const waiter of this.eventWaiters) waiter.reject(new Error('CDP socket closed'))
      this.eventWaiters = []
    })
  }

  static async connect(webSocketDebuggerUrl) {
    const socket = new WebSocket(webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener('error', () => reject(new Error(`failed to open CDP socket: ${webSocketDebuggerUrl}`)), { once: true })
    })
    return new RawCdpConnection(socket)
  }

  send(method, params = {}) {
    const id = this.nextId
    this.nextId += 1
    const result = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
    this.socket.send(JSON.stringify({ id, method, params }))
    return result
  }

  waitForEvent(method) {
    return new Promise((resolve, reject) => this.eventWaiters.push({ method, resolve, reject }))
  }

  close() {
    try { this.socket.close() } catch {}
  }

  static async openWithTimeout(webSocketDebuggerUrl, timeoutMs, label) {
    let timer = null
    try {
      return await Promise.race([
        RawCdpConnection.connect(webSocketDebuggerUrl),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${label} open timed out after ${timeoutMs}ms`)), timeoutMs)
          timer.unref?.()
        }),
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
}

async function listCdpPageTargets() {
  const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)
  const targets = await response.json()
  return targets.filter(target => target.type === 'page' && String(target.url || '').includes('index.html'))
}

async function readLedgerFromLiveTargets() {
  let targets = []
  try {
    targets = await withTimeout(listCdpPageTargets, 8_000, 'listing CDP page targets')
  } finally {
    fs.writeFileSync(
      path.join(EVIDENCE_ROOT, `cdp-targets-${Date.now()}.json`),
      JSON.stringify({ at: new Date().toISOString(), targets }, null, 2),
      'utf8',
    )
  }
  assert(targets.length > 0, 'a live page target exists')
  const targetErrors = []
  // The main-process recovery log proves which BrowserWindow was reloaded.
  // CDP target ids are opaque; probe every target and let the live one answer.
  fs.writeFileSync(
    path.join(EVIDENCE_ROOT, `recovery-observer-${Date.now()}.json`),
    JSON.stringify({ at: new Date().toISOString(), recoveryReloadedAt, targets }, null, 2),
    'utf8',
  )
  for (const target of targets) {
    let connection = null
    try {
      connection = await RawCdpConnection.openWithTimeout(target.webSocketDebuggerUrl, 3_000, `page target ${target.id}`)
      const ledger = await withTimeout(() => waitForLedgerOverCdp(connection, 4_000), 5_000, `reading ledger from page target ${target.id}`)
      if (ledger) return ledger
      targetErrors.push(`${target.id}: ledger unavailable`)
    } catch (error) {
      targetErrors.push(`${target.id}: ${error && error.message ? error.message : String(error)}`)
    } finally {
      if (connection) connection.close()
    }
  }
  assert(false, `no reloaded page target can read the ledger (${targetErrors.join('; ')})`)
}

async function readLedgerOverCdp(client) {
  const evaluation = await client.send('Runtime.evaluate', {
    expression: 'window.electronAPI ? window.electronAPI.responsivenessLedger() : Promise.resolve(null)',
    awaitPromise: true,
    returnByValue: true,
  })
  if (evaluation && evaluation.exceptionDetails) {
    throw new Error(`ledger evaluation failed: ${JSON.stringify(evaluation.exceptionDetails)}`)
  }
  const value = evaluation && evaluation.result && evaluation.result.value
  return value && value.ok ? value : null
}

async function readTargetDiagnosticsOverCdp(client) {
  const evaluation = await client.send('Runtime.evaluate', {
    expression: `(() => ({
      href: location.href,
      readyState: document.readyState,
      appRoot: Boolean(document.querySelector('#app')),
      electronApiType: typeof window.electronAPI,
      ledgerMethodType: window.electronAPI ? typeof window.electronAPI.responsivenessLedger : 'missing'
    }))()`,
    returnByValue: true,
  })
  return evaluation && evaluation.result && evaluation.result.value
}

async function waitForLedgerOverCdp(client, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastValue = null
  while (Date.now() < deadline) {
    try {
      lastValue = await readLedgerOverCdp(client)
      if (lastValue) return lastValue
      const diagnostics = await readTargetDiagnosticsOverCdp(client)
      logStage(`ledger probe state: ${JSON.stringify(diagnostics)}`)
    } catch (error) {
      logStage(`ledger probe retry: ${error && error.message ? error.message : String(error)}`)
    }
    await sleep(500)
  }
  return lastValue
}

function assertFreshRendererBuild() {
  const rendererIndex = path.join(ROOT, 'dist-renderer', 'index.html')
  assert(fs.existsSync(rendererIndex), 'dist-renderer/index.html exists')
  const bundleNames = [...fs.readFileSync(rendererIndex, 'utf8').matchAll(/assets\/[^'"]+\.js/g)].map(match => match[0])
  assert(bundleNames.length > 0, 'renderer index references JS bundles')
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
    },
    windowsHide: true,
  })
  const captureElectronOutput = stream => {
    stream.on('data', chunk => {
      const recovery = String(chunk).match(/\[RESPONSIVENESS\] recovery browserWindowId=(\d+).*stage=reloaded/)
      if (recovery) recoveryReloadedAt = Date.now()
    })
  }
  const redact = text => text.replace(/(sk-[A-Za-z0-9_-]{8,})/g, 'sk-***')
  captureElectronOutput(child.stdout)
  captureElectronOutput(child.stderr)
  child.stdout.on('data', chunk => {
    const text = `[ELECTRON] ${redact(String(chunk))}`
    process.stdout.write(text)
    fs.appendFileSync(RUN_LOG_PATH, text, 'utf8')
  })
  child.stderr.on('data', chunk => {
    const text = `[ELECTRON STDERR] ${redact(String(chunk))}`
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

function writeFailureScene(error) {
  const entry = {
    at: new Date().toISOString(),
    message: String(error),
    stack: error && error.stack ? error.stack : null,
    evidence: EVIDENCE_ROOT,
  }
  fs.writeFileSync(path.join(EVIDENCE_ROOT, 'failure.json'), JSON.stringify(entry, null, 2), 'utf8')
  fs.appendFileSync(RUN_LOG_PATH, `\n[FAILURE] ${JSON.stringify(entry, null, 2)}\n`, 'utf8')
}

async function forceStop() {
  if (browser) await browser.close().catch(() => {})
  await stopElectron(electronApp)
}

logStage('renderer build freshness check')
assertFreshRendererBuild()
logStage('clean isolated profile')
removeDir(PROFILE)
fs.mkdirSync(DATA_DIR, { recursive: true })

try {
  logStage('start Electron and connect CDP')
  electronApp = startElectron()
  assert(await withTimeout(waitForCdp, 35_000, 'waiting for Electron CDP endpoint'), 'Electron CDP endpoint became available')
  browser = await withTimeout(() => chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`), 10_000, 'connecting Playwright over CDP')
  const context = browser.contexts()[0]
  const page = context.pages().find(candidate => candidate.url().includes('index.html')) || context.pages()[0]
  assert(page, 'Electron renderer page is available')
  const client = await context.newCDPSession(page)
  await withTimeout(() => page.waitForSelector('#app', { timeout: 30_000 }), 35_000, 'waiting for first window app root')
  await sleep(1200)
  await withTimeout(() => page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click()), 8_000, 'closing first window modal')
  await sleep(500)

  const initialLedger = await withTimeout(
    () => page.evaluate(async () => await window.electronAPI.responsivenessLedger()),
    8_000,
    'reading first window ledger',
  )
  assert.equal(initialLedger.ok, true, 'first window can read the global ledger')

  // Event listeners must be attached synchronously; window.open can emit the
  // popup before a microtask-deferred listener is registered.
  const popupPromise = page.waitForEvent('popup', { timeout: 10_000 })
  await withTimeout(() => page.evaluate(() => { window.open('index.html', '_blank', 'width=780,height=620') }), 8_000, 'opening second window')
  const secondPage = await withTimeout(() => popupPromise, 15_000, 'waiting for second window')
  await withTimeout(() => secondPage.waitForSelector('#app', { timeout: 20_000 }), 25_000, 'waiting for second window app root')
  await sleep(700)
  const secondLedger = await withTimeout(
    () => secondPage.evaluate(async () => await window.electronAPI.responsivenessLedger()),
    8_000,
    'reading second window ledger',
  )
  assert.equal(secondLedger.ok, true, 'second window can read the global ledger after the multi-window fix')

  logStage('observe real renderer block')
  // Trigger a real Chromium renderer block from the main process. The first
  // window owns the test control; the second window remains responsive and
  // reads the globally shared main-process ledger.
  await withTimeout(
    () => page.evaluate(durationMs => {
      // Return before the real product IPC starts. Both windows can share one
      // renderer process, so the block would otherwise stall this CDP call too.
      setTimeout(() => {
        void window.electronAPI.responsivenessTestControl({ action: 'block', durationMs })
      }, 0)
      return true
    }, BLOCK_DURATION_MS),
    8_000,
    'triggering renderer block',
  )

  const blockStartedAt = Date.now()
  // Chromium may host both windows in one renderer process, so no renderer
  // page can act as a live observer during the block. Let the block finish,
  // then prove from the recovered renderer that the main ledger captured it.
  await sleep(Math.max(0, blockStartedAt + BLOCK_SETTLE_MS - Date.now()))
  const postBlockLedger = await withTimeout(
    () => secondPage.evaluate(async () => await window.electronAPI.responsivenessLedger()),
    12_000,
    'reading ledger after renderer block recovers',
  )
  const eventsAfterBlock = postBlockLedger.events
  assert(
    eventsAfterBlock.some(event => event.kind === 'unresponsive' || event.kind === 'renderer_warning' || event.kind === 'renderer_safe_mode'),
    `main ledger observed the real renderer block: ${JSON.stringify(eventsAfterBlock)}`,
  )

  // Crash the first renderer through Electron's real API. The renderer-side
  // call never resolves, so it must be sent without awaiting its result.
  logStage('trigger real render-process crash')
  const crashTargets = await withTimeout(listCdpPageTargets, 8_000, 'listing targets before crash')
  assert(crashTargets.length > 1, 'both window targets are listed before the crash')
  await withTimeout(() => client.send('Page.enable'), 5_000, 'enabling CDP page domain')
  await withTimeout(() => client.send('Runtime.evaluate', {
    expression: 'window.electronAPI.responsivenessTestControl({ action: "crash" })',
    awaitPromise: false,
  }), 5_000, 'triggering renderer crash')
  // After forcefullyCrashRenderer(), every renderer-side DevTools agent dies.
  // Recovery must be main-process owned: the product reloads the same
  // BrowserWindow after the crash, and only the reloaded surface can read the
  // ledger again.
  logStage('wait for main-process crash recovery')
  let recoveredPageLedger = null
  const recoveryReadDeadline = Date.now() + CRASH_RECOVERY_TIMEOUT_MS
  const hasRecoveryReloadEvent = ledger => ledger.events.some(event => event.kind === 'renderer_recovery_reloaded')
  while (Date.now() < recoveryReadDeadline && !recoveredPageLedger) {
    try {
      const candidate = await withTimeout(() => readLedgerFromLiveTargets(), 15_000, 'reading recovered window ledger')
      if (candidate && hasRecoveryReloadEvent(candidate)) {
        recoveredPageLedger = candidate
      } else {
        logStage('waiting for renderer_recovery_reloaded event in main ledger')
        await sleep(1_000)
      }
    } catch (error) {
      logStage(`waiting for main-process reload: ${error && error.message ? error.message : String(error)}`)
      await sleep(1_000)
    }
  }
  assert(recoveredPageLedger, 'the main process reloads the crashed window and the recovered surface can read the global ledger')
  assert(
    recoveredPageLedger.events.some(event => event.kind === 'renderer_recovery_reloaded'),
    `main ledger records the main-process reload: ${JSON.stringify(recoveredPageLedger.events)}`,
  )
  let eventsAfterCrash = eventsAfterBlock.slice()
  for (const event of recoveredPageLedger.events) {
    if (!eventsAfterCrash.some(item => item.at === event.at && item.kind === event.kind)) {
      eventsAfterCrash.push(event)
    }
  }

  logStage('open a fresh window after crash')
  const recoveryTargets = await withTimeout(listCdpPageTargets, 8_000, 'listing targets for recovery window action')
  assert(recoveryTargets.length > 0, 'a live target exists for opening a recovery window')
  const targetIdsBeforeFreshWindow = new Set(recoveryTargets.map(target => target.id))
  const recoveryConnection = await withTimeout(() => RawCdpConnection.connect(recoveryTargets[0].webSocketDebuggerUrl), 8_000, 'connecting to recovered window for new-window action')
  try {
    await withTimeout(() => recoveryConnection.send('Runtime.evaluate', {
      expression: 'window.open("index.html", "_blank", "width=760,height=600") ? true : false',
      awaitPromise: false,
      returnByValue: true,
    }), 8_000, 'opening recovery window through CDP')
  } finally {
    recoveryConnection.close()
  }
  let recoveredLedger = null
  let freshWindowId = null
  const recoveryDeadline = Date.now() + 25_000
  while (Date.now() < recoveryDeadline && !recoveredLedger) {
    try {
      const currentTargets = await withTimeout(listCdpPageTargets, 8_000, 'listing targets after opening a fresh window')
      const freshTargets = currentTargets.filter(target => !targetIdsBeforeFreshWindow.has(target.id))
      if (freshTargets.length === 0) {
        logStage('waiting for the fresh CDP target to appear')
      }
      for (const target of freshTargets) {
        let freshConnection = null
        try {
          freshConnection = await withTimeout(() => RawCdpConnection.connect(target.webSocketDebuggerUrl), 4_000, `connecting to fresh target ${target.id}`)
          const evaluation = await withTimeout(() => readLedgerOverCdp(freshConnection), 6_000, `reading ledger from fresh target ${target.id}`)
          if (evaluation && evaluation.ok) {
            recoveredLedger = evaluation
            freshWindowId = target.id
            await withTimeout(() => freshConnection.send('Page.enable'), 4_000, 'enabling fresh target page domain')
            const screenshot = await withTimeout(() => freshConnection.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }), 20_000, 'capturing fresh window screenshot')
            fs.writeFileSync(path.join(EVIDENCE_ROOT, 'recovery-window.png'), Buffer.from(screenshot.data, 'base64'))
            break
          }
        } catch (error) {
          logStage(`fresh ledger probe: ${error && error.message ? error.message : String(error)}`)
        } finally {
          if (freshConnection) freshConnection.close()
        }
      }
    } catch (error) {
      logStage(`fresh target scan failed: ${error && error.message ? error.message : String(error)}`)
    }
    if (!recoveredLedger) await sleep(1_000)
  }
  assert(recoveredLedger, 'a new window can read the ledger after the renderer crash')
  assert(freshWindowId, 'a fresh CDP target is identified after the renderer crash')

  const kinds = eventsAfterCrash.map(event => ({ kind: event.kind, windowId: event.windowId, at: event.at }))
  assert(
    kinds.some(event => event.kind === 'unresponsive' || event.kind === 'renderer_warning' || event.kind === 'renderer_safe_mode'),
    `main ledger observed the real renderer block: ${JSON.stringify(kinds)}`,
  )
  assert(
    kinds.some(event => event.kind === 'render-process-gone'),
    `main ledger received a real render-process-gone event: ${JSON.stringify(kinds)}`,
  )
  const gone = eventsAfterCrash.find(event => event.kind === 'render-process-gone')
  assert(gone.windowId === 1 || gone.windowId === 2, `render-process-gone has a window identity: ${JSON.stringify(gone)}`)

  assert.equal(recoveredLedger.ok, true, 'a new window can read the ledger after the renderer crash')
  const recoveryLedgerEvents = recoveredLedger.events.map(event => ({
    kind: event.kind,
    windowId: event.windowId,
    at: event.at,
  }))
  assert(
    recoveryLedgerEvents.some(event => event.kind === 'render-process-gone'),
    `the new window also observes the crash in the main ledger: ${JSON.stringify(recoveryLedgerEvents)}`,
  )
  const report = {
    schema: 'shenyi.outline-v6-main-ledger-e2e',
    version: 1,
    generatedAt: new Date().toISOString(),
    script: SCRIPT_NAME,
    blockDurationMs: BLOCK_DURATION_MS,
    firstWindowLedgerOk: initialLedger.ok,
    secondWindowLedgerOk: secondLedger.ok,
    crashedWindowRecovered: recoveredPageLedger.ok,
    events: kinds,
    assertions: {
      everyRegisteredWindowCanReadLedger: initialLedger.ok && secondLedger.ok,
      realBlockObserved: kinds.some(event => event.kind === 'unresponsive' || event.kind === 'renderer_warning' || event.kind === 'renderer_safe_mode'),
      nativeUnresponsiveCaptured: kinds.some(event => event.kind === 'unresponsive'),
      nativeResponsiveCaptured: kinds.some(event => event.kind === 'responsive'),
      realRenderProcessGoneCaptured: true,
      mainProcessReloadCaptured: kinds.some(event => event.kind === 'renderer_recovery_reloaded'),
      crashedWindowLedgerReadableAfterReload: recoveredPageLedger.ok,
      newWindowLedgerReadableAfterCrash: recoveredLedger.ok,
    },
  }
  fs.writeFileSync(path.join(EVIDENCE_ROOT, 'result.json'), JSON.stringify(report, null, 2), 'utf8')
  console.log(JSON.stringify(report, null, 2))
  console.log('[PASS] outline V6 main-process responsiveness ledger verification completed')
} catch (error) {
  writeFailureScene(error)
  throw error
} finally {
  clearTimeout(totalTimeoutTimer)
  logStage('cleanup')
  if (browser) await browser.close().catch(() => {})
  await stopElectron(electronApp)
  await sleep(1000)
  removeDir(PROFILE)
}
