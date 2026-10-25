import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const SCRIPT_NAME = 'verify-outline-v6-phase5-combos-e2e.mjs'
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const PROFILE = path.join(ROOT, '_data', 'outline-v6-phase5-combos-profile')
const DATA_DIR = path.join(PROFILE, 'documents-data')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-outline-v6-phase5-combos-e2e')
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const CDP_PORT = 9435
const PROJECT_ID = 'outline-v6-phase5-combos-project'
const PROJECT_KEY = `wa_project_${PROJECT_ID}`
const BLOCK_DURATION_MS = 6_500
const LONG_TEXT = `【组合回归长文】${'安全模式复制内容完整性校验。'.repeat(756)}`

fs.rmSync(EVIDENCE_ROOT, { recursive: true, force: true })
fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })

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
  assert(fs.existsSync(rendererIndex), 'dist-renderer/index.html exists')
  const bundleNames = [...fs.readFileSync(rendererIndex, 'utf8').matchAll(/assets\/[^"']+\.js/g)].map(match => match[0])
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
  const redact = text => text.replace(/(sk-[A-Za-z0-9_-]{8,})/g, 'sk-***')
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

function makeProject() {
  return {
    schemaVersion: 3,
    projectName: 'Outline V6 Phase5 Combos',
    outlineText: '第一卷 组合回归\n第一章 安全模式复制\n第二章 Journal 恢复',
    pipelineConfig: { volumeCount: 1, volumeWords: 20000, chapterWords: 2000 },
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

async function prepareSession(page) {
  await page.evaluate(async ({ project, projectId, projectKey }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite(projectKey, project)
  }, { project: makeProject(), projectId: PROJECT_ID, projectKey: PROJECT_KEY })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 30_000 })
  await sleep(1000)
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
  await sleep(400)
}

async function openOutlineWorkspace(page) {
  await page.click('#btn-outline-workspace')
  await page.waitForSelector('#outline-editor', { timeout: 20_000 })
  await page.click('#btn-ai-co-create')
  await page.waitForSelector('#ow-chat-input', { timeout: 20_000 })
}

function journalSnapshotPath() {
  return path.join(DATA_DIR, `outline-journal_${PROJECT_ID}.json`)
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

assertFreshRendererBuild()
removeDir(PROFILE)
fs.mkdirSync(DATA_DIR, { recursive: true })

let electronApp = null
let browser = null
try {
  electronApp = startElectron()
  assert(await waitForCdp(), 'Electron CDP endpoint became available')
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
  const context = browser.contexts()[0]
  const page = context.pages().find(candidate => candidate.url().includes('index.html')) || context.pages()[0]
  assert(page, 'Electron renderer page is available')
  page.on('pageerror', error => console.log(`[PAGE ERROR] ${error.message}`))
  await page.waitForSelector('#app', { timeout: 30_000 })
  await sleep(1200)
  await prepareSession(page)
  await openOutlineWorkspace(page)

  const copyFixture = await page.evaluate(content => {
    const project = window.__pinia?._s?.get('project')
    if (!project) throw new Error('project store is unavailable')
    project.appendOutlineChat({ role: 'assistant', content })
    const message = project.outlineChat.at(-1)
    return { messageId: String(message.messageId), contentLength: content.length, pendingCount: project.outlineJournalPendingCount }
  }, LONG_TEXT)
  assert(copyFixture.messageId, 'long assistant message gets a stable messageId')

  const blockStartedAt = await page.evaluate(() => performance.now())
  await page.evaluate(duration => {
    window.__SHENYI_PERFORMANCE_MONITOR__.blockForTest = undefined
    const busyUntil = performance.now() + duration
    while (performance.now() < busyUntil) {
      // Deliberate synchronous renderer main-thread block for combo verification.
    }
  }, BLOCK_DURATION_MS)

  await page.waitForFunction(() => {
    const monitor = window.__SHENYI_PERFORMANCE_MONITOR__
    return Boolean(monitor && monitor.getSnapshot().responsivenessState === 'safe_mode')
  }, null, { timeout: 10_000 })

  const copyResult = await page.evaluate(async messageId => {
    const input = document.querySelector('#ow-chat-input')
    const messageNode = document.querySelector(`#ow-chat-messages [data-message-id="${messageId}"]`)
    const button = messageNode?.querySelector('.ow-msg-actions button[data-tooltip="复制"]')
    if (!input) throw new Error('chat input is unavailable')
    if (!button) throw new Error('copy button is unavailable on the long assistant message')

    const inputStart = performance.now()
    input.focus()
    document.execCommand('insertText', false, '安')
    const inputLatencyMs = performance.now() - inputStart

    const clickStart = performance.now()
    button.click()
    let clipboardText = ''
    for (let attempt = 0; attempt < 100; attempt += 1) {
      clipboardText = await window.electronAPI.clipboardRead()
      if (clipboardText.length > 10000) break
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    const copyLatencyMs = performance.now() - clickStart
    const monitor = window.__SHENYI_PERFORMANCE_MONITOR__
    return {
      safeModeVisible: Boolean(document.querySelector('#app-safe-mode-banner')),
      monitorState: monitor.getSnapshot().responsivenessState,
      inputDisabled: input.disabled,
      inputValueLength: input.value.length,
      inputLatencyMs,
      copyLatencyMs,
      clipboardLength: clipboardText.length,
      clipboardHead: clipboardText.slice(0, 40),
      clipboardTail: clipboardText.slice(-40),
      stateAfterCopy: monitor.getSnapshot().responsivenessState,
    }
  }, copyFixture.messageId)

  assert(copyResult.safeModeVisible, 'safe mode banner remains visible during long-copy interaction')
  assert(copyResult.inputDisabled === false, 'input remains enabled in safe mode')
  assert(copyResult.inputValueLength > 0, 'input accepts text in safe mode')
  assert(copyResult.inputLatencyMs < 500, `input latency in safe mode is bounded: ${copyResult.inputLatencyMs}ms`)
  assert.equal(copyResult.clipboardLength, LONG_TEXT.length, 'clipboard preserves the complete 12,000-character message')
  assert.equal(copyResult.clipboardHead, LONG_TEXT.slice(0, 40), 'clipboard head matches source text')
  assert.equal(copyResult.clipboardTail, LONG_TEXT.slice(-40), 'clipboard tail matches source text')
  await page.screenshot({ path: path.join(EVIDENCE_ROOT, '01-safe-mode-long-copy.png'), fullPage: true })

  const journalFixture = await page.evaluate(() => {
    const project = window.__pinia?._s?.get('project')
    project.appendOutlineChat({ role: 'user', content: '渲染冻结期间追加的 journal 组合回归消息。' })
    const message = project.outlineChat.at(-1)
    return {
      messageId: String(message.messageId),
      content: String(message.content),
      uiMessageCount: project.outlineChat.length,
      pendingCount: project.outlineJournalPendingCount,
      lastError: project.outlineJournalLastError,
    }
  })
  assert(journalFixture.pendingCount > 0, 'journal append is queued before the renderer block')

  await page.evaluate(duration => {
    window.__SHENYI_PERFORMANCE_MONITOR__.blockForTest = undefined
    const busyUntil = performance.now() + duration
    while (performance.now() < busyUntil) {
      // Deliberate synchronous renderer main-thread block for journal recovery.
    }
  }, BLOCK_DURATION_MS)

  const journalRecovered = await page.waitForFunction(() => {
    const project = window.__pinia?._s?.get('project')
    return project && project.outlineJournalPendingCount === 0
  }, null, { timeout: 10_000 })
  assert(await journalRecovered.jsonValue(), 'journal queue drains after the renderer recovers')

  const flushResult = await page.evaluate(async () => {
    const project = window.__pinia?._s?.get('project')
    const result = await project.flushOutlineJournal({ immediate: true })
    return {
      result,
      pendingCount: project.outlineJournalPendingCount,
      lastError: project.outlineJournalLastError,
      uiMessageCount: project.outlineChat.length,
      messageIds: project.outlineChat.map(message => String(message.messageId)),
    }
  })
  assert.equal(flushResult.result.ok, true, `journal immediate flush succeeds: ${JSON.stringify(flushResult.result)}`)
  assert.equal(flushResult.pendingCount, 0, 'journal pending queue is empty after recovery')
  assert.equal(flushResult.lastError, null, 'journal error is clear after recovery')
  assert(flushResult.messageIds.includes(journalFixture.messageId), 'journal message keeps its stable messageId through freeze and recovery')

  const snapshotPath = journalSnapshotPath()
  assert(fs.existsSync(snapshotPath), `journal snapshot exists at ${snapshotPath}`)
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
  assert.equal(snapshot.messages.length, flushResult.uiMessageCount, 'journal snapshot count matches the live UI message count')
  const persisted = snapshot.messages.find(message => String(message.messageId) === journalFixture.messageId)
  assert(persisted, 'the message appended before the renderer block is persisted')
  assert.equal(String(persisted.content), journalFixture.content, 'persisted journal content is byte-identical to the UI message')
  await page.screenshot({ path: path.join(EVIDENCE_ROOT, '02-journal-recovery.png'), fullPage: true })

  const report = {
    schema: 'shenyi.outline-v6-phase5-combos-e2e',
    version: 1,
    generatedAt: new Date().toISOString(),
    script: SCRIPT_NAME,
    blockDurationMs: BLOCK_DURATION_MS,
    measuredBlockedMs: await page.evaluate(() => performance.now()) - blockStartedAt,
    copyFixture,
    copyResult,
    journalFixture,
    flushResult: {
      result: flushResult.result,
      pendingCount: flushResult.pendingCount,
      lastError: flushResult.lastError,
      uiMessageCount: flushResult.uiMessageCount,
      snapshotMessageCount: snapshot.messages.length,
    },
    assertions: {
      safeModeLongCopyAvailable: copyResult.clipboardLength === LONG_TEXT.length,
      safeModeInputAvailable: copyResult.inputDisabled === false && copyResult.inputValueLength > 0,
      journalAppendSurvivesRendererFreeze: Boolean(persisted),
      journalAckClearsPending: flushResult.pendingCount === 0,
      journalSnapshotMatchesUi: snapshot.messages.length === flushResult.uiMessageCount,
      journalMessageIdStable: flushResult.messageIds.includes(journalFixture.messageId),
    },
  }
  fs.writeFileSync(path.join(EVIDENCE_ROOT, 'result.json'), JSON.stringify(report, null, 2), 'utf8')
  console.log(JSON.stringify(report, null, 2))
  console.log('[PASS] outline V6 Phase5 combo regressions completed')
} catch (error) {
  writeFailureScene(error)
  throw error
} finally {
  if (browser) await browser.close().catch(() => {})
  await stopElectron(electronApp)
  await sleep(1000)
  removeDir(PROFILE)
}
