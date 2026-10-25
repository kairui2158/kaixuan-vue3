import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const SCRIPT_NAME = 'verify-outline-export-ui-regression.mjs'
const SOURCE_ELECTRON = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const PACKAGED_ELECTRON = path.join(ROOT, 'dist', 'win-unpacked', '神意助手.exe')
const TARGET = process.argv[2] === 'packaged' ? PACKAGED_ELECTRON : SOURCE_ELECTRON
const PROFILE = path.join(ROOT, '_data', `outline-export-ui-${TARGET === PACKAGED_ELECTRON ? 'packaged' : 'source'}-profile`)
const DATA_DIR = path.join(PROFILE, 'documents-data')
const EXPORT_DIR = path.join(PROFILE, 'run-trace-exports')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', `verification-outline-export-ui-${TARGET === PACKAGED_ELECTRON ? 'packaged' : 'source'}`)
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const CDP_PORT = 9436
const PROJECT_ID = 'outline-export-ui-regression'
const PROJECT_KEY = `wa_project_${PROJECT_ID}`

fs.rmSync(EVIDENCE_ROOT, { recursive: true, force: true })
fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function removeDir(target) {
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
}

function assertRendererBuild() {
  if (TARGET !== SOURCE_ELECTRON) return
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
  const child = spawn(TARGET, ['.', `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', `--user-data-dir=${PROFILE}`], {
    cwd: TARGET === SOURCE_ELECTRON ? ROOT : path.dirname(TARGET),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SHENYI_ALLOW_TEST_ISOLATION: '1',
      SHENYI_DATA_DIR: DATA_DIR,
      SHENYI_TEST_USER_DATA_DIR: path.join(PROFILE, 'app-data'),
      SHENYI_TEST_RUN_TRACE_EXPORT: EXPORT_DIR,
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
    await sleep(300)
  }
  return false
}

async function stopElectron(app) {
  if (!app || app.exitCode !== null) return
  const exited = new Promise(resolve => app.once('exit', resolve))
  try { execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
  const timeout = sleep(10_000).then(() => false)
  if (!(await Promise.race([exited.then(() => true), timeout]))) app.kill('SIGKILL')
}

function makeProject() {
  return {
    schemaVersion: 3,
    projectName: 'Outline Export UI Regression',
    outlineText: '第一卷 导出回归\n第一章 鼠标输入\n第二章 运行记录导出',
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
  await sleep(800)
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
  await sleep(300)
}

async function openOutlineWorkspace(page) {
  await page.click('#btn-outline-workspace')
  await page.waitForSelector('#outline-editor', { timeout: 20_000 })
}

async function collectUiState(page) {
  return page.evaluate(() => {
    const input = document.querySelector('#ow-chat-input')
    const send = document.querySelector('#btn-ow-send')
    const rect = input?.getBoundingClientRect()
    const point = rect ? { x: rect.left + Math.min(40, rect.width / 2), y: rect.top + rect.height / 2 } : null
    const stack = point ? document.elementsFromPoint(point.x, point.y).slice(0, 8).map(node => {
      if (!(node instanceof HTMLElement)) return String(node.nodeName)
      const style = getComputedStyle(node)
      return `${node.nodeName.toLowerCase()}#${node.id || ''}.${node.className || ''};pointer-events=${style.pointerEvents};z-index=${style.zIndex};disabled=${node.disabled}`
    }) : []
    const monitor = window.__SHENYI_PERFORMANCE_MONITOR__
    return {
      inputExists: Boolean(input),
      inputDisabled: input instanceof HTMLInputElement ? input.disabled : null,
      sendDisabled: send instanceof HTMLButtonElement ? send.disabled : null,
      inputRect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
      hitStack: stack,
      responsivenessState: monitor?.getSnapshot?.()?.responsivenessState || 'unavailable',
      activeElement: document.activeElement ? `${document.activeElement.nodeName.toLowerCase()}#${document.activeElement.id || ''}` : null,
      safeModeBanner: Boolean(document.querySelector('#app-safe-mode-banner')),
    }
  })
}

async function assertCloneableThroughWindow(page, value, label) {
  return page.evaluate(({ value, label }) => {
    const path = window.__electronLog_hookPostMessageProbe?.(value)
    return { label, path: path === undefined ? null : path }
  }, { value, label })
}

async function assertOutlineChatInteractive(page) {
  const input = page.locator('#ow-chat-input')
  await input.waitFor({ state: 'visible', timeout: 10_000 })
  const box = await input.boundingBox()
  assert(box, 'outline chat input has a bounding box')
  assert(box.width > 0 && box.height > 0, `outline chat input is visible with non-zero size: ${JSON.stringify(box)}`)
  await input.click({ timeout: 10_000 })
  await page.keyboard.type('真实鼠标输入回归')
  return page.evaluate(() => ({
    value: document.querySelector('#ow-chat-input')?.value || '',
    activeElement: document.activeElement ? `${document.activeElement.nodeName.toLowerCase()}#${document.activeElement.id || ''}` : '',
  }))
}

async function seedOutlineRun(page) {
  return page.evaluate(() => {
    const runTraceStore = window.__pinia?._s?.get('runTrace')
    if (!runTraceStore) throw new Error('runTrace store is unavailable')
    const runId = runTraceStore.startRun({
      source: 'outline',
      stepName: '导出回归',
      mode: 'api-direct-write',
      skillNames: [],
      providerName: 'test-provider',
      projectId: 'outline-export-ui-regression',
      projectName: 'Outline Export UI Regression',
      userRequest: '真实导出按钮回归验证',
    })
    runTraceStore.addEvent(runId, {
      type: 'export-ui-regression-event',
      level: 'info',
      label: '导出按钮回归种子事件',
      detail: 'seeded for real UI export click',
    })
    runTraceStore.finishRun(runId, 'success')
    const run = runTraceStore.getRun(runId)
    const diagnostics = []
    const visit = (value, path) => {
      if (value === null || typeof value !== 'object') return
      if (value instanceof Window) {
        diagnostics.push(`${path}: window`)
        return
      }
      if (typeof value === 'function') {
        diagnostics.push(`${path}: function`)
        return
      }
      if (Array.isArray(value)) {
        value.forEach((item, index) => visit(item, `${path}[${index}]`))
        return
      }
      if (value instanceof Map || value instanceof Set) {
        diagnostics.push(`${path}: ${value.constructor.name}`)
        return
      }
      for (const [key, item] of Object.entries(value)) visit(item, `${path}.${key}`)
    }
    visit(run, 'run')
    return { runId, diagnostics }
  })
}

async function runScenario() {
  removeDir(PROFILE)
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.mkdirSync(EXPORT_DIR, { recursive: true })
  let electronApp = null
  let browser = null
  const consoleMessages = []
  const pageErrors = []
  try {
    electronApp = startElectron()
    assert(await waitForCdp(), 'Electron CDP endpoint became available')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    const context = browser.contexts()[0]
    const page = context.pages().find(candidate => candidate.url().includes('index.html')) || context.pages()[0]
    assert(page, 'Electron renderer page is available')
    page.on('console', message => consoleMessages.push(`[${message.type()}] ${message.text()}`))
    page.on('pageerror', error => pageErrors.push(error.message))
    await page.waitForSelector('#app', { timeout: 30_000 })
    await sleep(800)
    await prepareSession(page)
    await openOutlineWorkspace(page)

    const beforeChat = await collectUiState(page)
    assert(beforeChat.inputExists, 'outline chat input exists before opening AI co-create')
    await page.click('#btn-ai-co-create')
    const inputState = await assertOutlineChatInteractive(page)
    const clickProbe = await collectUiState(page)
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'input-failure.json'), JSON.stringify({ beforeChat, clickProbe, inputState }, null, 2), 'utf8')
    assert.equal(inputState.value, '真实鼠标输入回归', 'real mouse click and typing enter outline chat input')
    assert.equal(inputState.activeElement, 'textarea#ow-chat-input', 'outline chat input retains focus after real mouse interaction')
    const afterChat = await collectUiState(page)
    assert.equal(afterChat.responsivenessState, 'normal', 'outline page is not in safe mode')
    assert.equal(afterChat.safeModeBanner, false, 'safe mode banner is not covering the outline page')

    const seededRun = await seedOutlineRun(page)
    assert(seededRun.runId, 'outline run trace is seeded for real export click')
    assert.deepEqual(seededRun.diagnostics, [], `seeded run is worker-cloneable: ${seededRun.diagnostics.join('; ')}`)
    const cloneProbe = await page.evaluate(run => structuredClone(run), await page.evaluate(runId => window.__pinia?._s?.get('runTrace').getRun(runId), seededRun.runId))
    assert(cloneProbe && cloneProbe.id === seededRun.runId, 'seeded run passes structuredClone before button click')
    const proxyProbe = await page.evaluate(run => {
      const seen = new WeakSet()
      const inspect = (value, path) => {
        if (value === null || typeof value !== 'object') return null
        if (seen.has(value)) return null
        seen.add(value)
        if (value instanceof Window) return `${path}:window`
        const names = Object.getOwnPropertyNames(value)
        const descriptors = Object.getOwnPropertyDescriptors(value)
        if (!Array.isArray(value) && (!('length' in descriptors) || !(value instanceof Array))) {
          if (names.includes('__v_skip') || names.includes('__v_isRef') || names.includes('dep') || names.includes('_rawValue')) return `${path}:vue-proxy-field`
        }
        for (const key of names) {
          let item
          try { item = value[key] } catch { continue }
          const hit = inspect(item, `${path}.${key}`)
          if (hit) return hit
        }
        return null
      }
      return inspect(run, 'run')
    }, cloneProbe)
    assert.equal(proxyProbe, null, `post-clone run has no live proxy field: ${proxyProbe}`)
    const selectedRunProbe = await page.evaluate(() => {
      const store = window.__pinia?._s?.get('runTrace')
      const rawCandidates = new Map()
      const inspect = (value, path) => {
        if (!value || typeof value !== 'object') return null
        const raw = value.__v_raw
        if (raw) return `${path}:__v_raw`
        if (rawCandidates.has(value)) return null
        rawCandidates.set(value, path)
        for (const key of Object.getOwnPropertyNames(value)) {
          let item
          try { item = value[key] } catch { continue }
          const hit = inspect(item, `${path}.${key}`)
          if (hit) return hit
        }
        return null
      }
      return {
        storeHasRunsProxy: inspect(store?.runs, 'store.runs'),
        selectedRunSource: (() => {
          const panel = document.querySelector('#run-trace-panel')
          if (!panel) return 'panel-not-open'
          const state = panel.__vueParentComponent?.ctx
          return state ? inspect(state, 'panel.ctx') : 'ctx-unavailable'
        })(),
      }
    })
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'vue-proxy-probe.json'), JSON.stringify(selectedRunProbe, null, 2), 'utf8')
    await page.click('#btn-ow-run-trace')
    await page.waitForSelector('#run-trace-overlay', { timeout: 10_000 })
    await page.click('#run-trace-overlay .rt-tabs button:nth-child(4)')
    const exportButton = page.locator('#run-trace-overlay .rt-export button').first()
    await exportButton.click({ timeout: 10_000 })
    await sleep(500)
    const exportedFiles = fs.readdirSync(EXPORT_DIR)
    const exportEvidence = {
      target: TARGET,
      beforeChat,
      afterChat,
      inputState,
      seededRun,
      exportButtonText: await page.evaluate(() => document.querySelector('#run-trace-overlay .rt-export button')?.textContent || ''),
      exportedFiles,
      consoleMessages: consoleMessages.filter(message => /worker|export|导出|error|failed/i.test(message)).slice(-30),
      pageErrors,
    }
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'result.json'), JSON.stringify(exportEvidence, null, 2), 'utf8')
    assert(exportedFiles.length > 0, `run trace export produced files in ${EXPORT_DIR}`)
    const exportDirectory = fs.statSync(path.join(EXPORT_DIR, exportedFiles[0]))
    assert(exportDirectory.isDirectory(), 'run trace export result is a directory')
    assert(fs.existsSync(path.join(EXPORT_DIR, exportedFiles[0], 'export.json')), 'export.json exists in exported run directory')
    assert.equal(pageErrors.length, 0, `renderer has no page errors: ${pageErrors.join('; ')}`)
    assert(!consoleMessages.some(message => message.includes('导出 Worker 不可用') || message.includes('run trace export worker')), `no export worker warnings: ${consoleMessages.join('; ')}`)
    console.log(`PASS ${SCRIPT_NAME}: target=${TARGET}; input=${inputState.value}; exportFiles=${exportedFiles.join(',')}`)
  } finally {
    await stopElectron(electronApp)
    if (browser) await browser.close().catch(() => undefined)
  }
}

assert(fs.existsSync(TARGET), `target executable exists: ${TARGET}`)
assertRendererBuild()
await runScenario()
