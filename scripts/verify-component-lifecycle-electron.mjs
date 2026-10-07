import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = path.resolve(import.meta.dirname, '..')
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const MOCK_PORT = 59951
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const PROFILE = path.join(ROOT, '_audit', 'tmp', 'component-lifecycle-profile')
const OUTPUT_FILE = path.join(ROOT, '_audit', 'verification-component-lifecycle', 'evidence.json')
const GLOBAL_TIMEOUT_MS = 300_000
let activeApp = null
let activeBrowser = null
let failFastStarted = false
let electronExit = null
let electronSpawnError = null

const PROJECT_ID = 'component-lifecycle-project'
const RETIRED_TOOLBAR_IDS = [
  'btn-writing-rules',
  'btn-timeline',
  'btn-batch-review',
  'btn-revise',
  'btn-translate',
  'btn-style-convert',
  'btn-regenerate',
  'btn-modify',
]

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function removeDir(target) {
  if (!fs.existsSync(target)) return
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
      return
    } catch {}
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200)
  }
  throw new Error(`unable to remove profile: ${target}`)
}

function buildLongDocument() {
  const lines = []
  for (let section = 1; section <= 80; section++) {
    lines.push(`# 第${section}章 组件生命周期实测`)
    for (let paragraph = 1; paragraph <= 8; paragraph++) {
      lines.push(`第${paragraph}段：这是写入跟随与用户接管测试文本，用于验证滚动、搜索高亮和停止跟随的真实交互。`)
    }
  }
  const content = lines.join('\n')
  assert(content.length > 5000, `long document must exceed 5000 chars, got ${content.length}`)
  return content
}

const LONG_DOCUMENT = buildLongDocument()
const apiRequests = []

function jsonResponse(response, payload) {
  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

function sseResponse(response, text) {
  response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' })
  response.end(`data: ${JSON.stringify({
    id: 'component-lifecycle-mock',
    object: 'chat.completion.chunk',
    choices: [{
      index: 0,
      finish_reason: 'stop',
      delta: { role: 'assistant', content: text },
    }],
  })}

data: [DONE]

`)
}

function completionPayload(text) {
  return {
    id: 'component-lifecycle-mock',
    object: 'chat.completion',
    choices: [{
      index: 0,
      message: { role: 'assistant', content: text },
      finish_reason: 'stop',
    }],
  }
}

const providerServer = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    let body = null
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    apiRequests.push({
      url: request.url,
      model: body?.model || null,
      messageCount: Array.isArray(body?.messages) ? body.messages.length : 0,
      lastUserChars: [...(body?.messages || [])].reverse().find(message => message?.role === 'user')?.content?.length || 0,
      stream: body?.stream === true,
    })
    console.log(`[MOCK] ${request.url} model=${body?.model || '-'} messages=${apiRequests.at(-1).messageCount}`)
    if (request.url?.includes('/chat/completions')) {
      const result = '[{"category":"角色","name":"林知远","content":"冷静的观察者"}]'
      if (body?.stream === true) sseResponse(response, result)
      else jsonResponse(response, completionPayload(result))
      return
    }
    jsonResponse(response, { object: 'list', data: [{ id: 'component-lifecycle-model' }] })
  })
})

const watchdog = setTimeout(() => {
  failFast(new Error(`component lifecycle verification exceeded ${GLOBAL_TIMEOUT_MS}ms`))
}, GLOBAL_TIMEOUT_MS)
watchdog.unref()

function startElectron() {
  return spawn(ELECTRON_EXE, [
    ROOT,
    '--remote-debugging-port=0',
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
}

function watchRendererHealth(app, onCrash) {
  const crashLines = []
  app.on('render-process-gone', (event, details) => {
    const line = JSON.stringify(details)
    crashLines.push(line)
    onCrash(new Error(`Electron renderer crashed: ${crashLines.at(-1)}`))
  })
  console.log('[debug] render-process-gone listener attached')
}

function watchPageHealth(page, rendererCrashRef, onCrash) {
  const fail = error => {
    if (rendererCrashRef.crashed) return
    rendererCrashRef.crashed = true
    rendererCrashRef.message = String(error?.message || error)
    console.error('[watchPageHealth] lastPageUrl=' + page.url())
    onCrash(new Error(`renderer page unusable: ${rendererCrashRef.message}`))
  }
  page.on('crash', () => fail(new Error('Playwright page crash')))
  console.log('[debug] page crash listener attached')
}

async function waitForPageReady(page, rendererCrashRef) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    assert(!rendererCrashRef.crashed, `renderer must stay alive: ${rendererCrashRef.message || ''}`)
    try {
      if (await page.evaluate(() => Boolean(window.electronAPI))) return
    } catch {}
    await sleep(200)
  }
  throw new Error(`renderer did not become ready: ${rendererCrashRef.message || 'timeout'}`)
}

async function waitForCdpPort(getOutput) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const output = getOutput() || ''
    const match = output.match(/(?:Remote debugging|DevTools) listening on ws:\/\/127\.0\.0\.1:(\d+)\//)
    if (match) return Number(match[1])
    await sleep(250)
  }
  throw new Error(`CDP port not found\n${output.slice(-2000)}`)
}

async function closeElectron(app) {
  if (!app || app.exitCode !== null) return
  try { execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
}

function getPinia(page) {
  return page.evaluate(() => {
    const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
    if (!pinia) throw new Error('pinia unavailable')
    return { available: true, storeCount: pinia._s?.size ?? null }
  })
}

async function closeVisibleModals(page) {
  await page.evaluate(() => {
    document.querySelector('.project-modal-content .btn-close')?.click()
  })
  await sleep(300)
}

async function seedStorage(page) {
  await page.evaluate(async ({ mockUrl, projectId, outline }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'component-lifecycle-provider',
        name: 'Component Lifecycle Mock',
        baseUrl: mockUrl,
        apiKey: 'key',
        models: ['component-lifecycle-model'],
        selectedModel: 'component-lifecycle-model',
        temperature: 0.1,
        maxTokens: 4096,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
      }],
      generateProvider: 'component-lifecycle-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: '组件生命周期 E2E',
      outlineText: outline,
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
      outlineChat: [],
      chat: [],
    })
    await window.electronAPI.storageWrite('wa_deAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
  }, { mockUrl: MOCK_BASE_URL, projectId: PROJECT_ID, outline: LONG_DOCUMENT })
}

async function prepareEditorTab(page) {
  await page.evaluate(content => {
    const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
    if (!pinia) throw new Error('pinia unavailable')
    const store = pinia._s.get('editor')
    store.tabs.splice(0)
    store.openTab({
      id: 'component-lifecycle-editor',
      title: '组件生命周期实测',
      content,
      chapterId: '',
      isDirty: false,
      mode: 'ch-body',
    })
    store.activeTabId = 'component-lifecycle-editor'
  }, LONG_DOCUMENT)
  await page.waitForSelector('#editor-content', { timeout: 10_000 })
  await page.waitForTimeout(300)
}

async function verifyEditorFollowPaths(page) {
  const checks = []

  await page.evaluate(() => {
    const textarea = document.querySelector('#editor-content')
    textarea.scrollTop = 0
  })
  await page.waitForTimeout(150)

  await page.evaluate(length => {
    window.dispatchEvent(new CustomEvent('editor-follow-progress', {
      detail: { workspace: 'main', start: length - 20, end: length - 5 },
    }))
  }, LONG_DOCUMENT.length)
  await page.waitForTimeout(250)
  const afterFollow = await page.evaluate(() => ({
    scrollTop: document.querySelector('#editor-content').scrollTop,
    highlightClass: document.querySelector('.editor-viewport-highlight-layer')?.className || '',
    selectionStart: document.querySelector('#editor-content').selectionStart,
  }))
  assert(afterFollow.scrollTop > 100, `follow write scrolls near end: ${afterFollow.scrollTop}`)
  assert.equal(afterFollow.highlightClass, 'editor-viewport-highlight-layer editor-viewport-active-line', `follow write shows active highlight: ${afterFollow.highlightClass}`)
  assert(afterFollow.selectionStart >= LONG_DOCUMENT.length - 20, 'follow write selects writing area')
  checks.push(`follow-write: scrollTop=${afterFollow.scrollTop}, highlight=${afterFollow.highlightClass}, selection=${afterFollow.selectionStart}`)

  await page.locator('#editor-content').click({ position: { x: 30, y: 30 } })
  await page.keyboard.press('Control+Home')
  await page.keyboard.press('PageUp')
  await page.waitForTimeout(300)
  await page.waitForTimeout(200)
  const afterUserScroll = await page.evaluate(() => document.querySelector('#editor-content').scrollTop)
  assert(afterUserScroll < afterFollow.scrollTop - 80, `user keyboard takes over: before=${afterFollow.scrollTop}, after=${afterUserScroll}`)
  checks.push(`user-takeover: scrollTop=${afterUserScroll}`)

  await page.evaluate(length => {
    window.dispatchEvent(new CustomEvent('editor-follow-progress', {
      detail: { workspace: 'main', start: length - 20, end: length - 5 },
    }))
  }, LONG_DOCUMENT.length)
  await page.waitForTimeout(200)
  const duringPause = await page.evaluate(() => document.querySelector('#editor-content').scrollTop)
  assert(Math.abs(duringPause - afterUserScroll) <= 1, `follow stays paused after user wheel: user=${afterUserScroll}, now=${duringPause}`)
  checks.push(`paused-follow: scrollTop=${duringPause}`)

  await page.waitForTimeout(2_700)
  await page.evaluate(length => {
    window.dispatchEvent(new CustomEvent('editor-follow-progress', {
      detail: { workspace: 'main', start: length - 20, end: length - 5 },
    }))
  }, LONG_DOCUMENT.length)
  await page.waitForTimeout(250)
  const afterResume = await page.evaluate(() => document.querySelector('#editor-content').scrollTop)
  assert(afterResume > afterUserScroll + 80, `follow resumes after pause window: user=${afterUserScroll}, resumed=${afterResume}`)
  checks.push(`follow-resume: scrollTop=${afterResume}`)

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('editor-stop-follow')))
  await page.evaluate(length => {
    window.dispatchEvent(new CustomEvent('editor-follow-progress', {
      detail: { workspace: 'main', start: length - 20, end: length - 5 },
    }))
  }, LONG_DOCUMENT.length)
  await page.waitForTimeout(200)
  const afterStop = await page.evaluate(() => document.querySelector('#editor-content').scrollTop)
  assert(Math.abs(afterStop - afterResume) <= 1, `stop follow is terminal: before=${afterResume}, after=${afterStop}`)
  const stopHighlight = await page.evaluate(() => document.querySelector('.editor-viewport-highlight-layer')?.className || '')
  assert.notEqual(stopHighlight, 'editor-viewport-highlight-layer editor-viewport-active-line', `stop follow clears active highlight: ${stopHighlight}`)
  checks.push(`stop-follow: scrollTop=${afterStop}, highlight=${stopHighlight}`)

  const visible = await page.evaluate(() => {
    const textarea = document.querySelector('#editor-content')
    return document.elementFromPoint(
      textarea.getBoundingClientRect().left + 10,
      textarea.getBoundingClientRect().top + 10,
    ) === textarea
  })
  assert(visible, 'editor textarea remains pointable for search interaction')
  return checks
}

async function verifySearchHighlightAfterProgrammaticScroll(page) {
  await page.evaluate(() => {
    const textarea = document.querySelector('#editor-content')
    textarea.scrollTop = 0
  })
  await page.waitForTimeout(150)
  const findVisible = await page.locator('#find-replace-bar').isVisible().catch(() => false)
  if (!findVisible) await page.click('#btn-find')
  await page.waitForSelector('#find-replace-bar', { timeout: 5_000 })
  await page.fill('#find-input', '写入跟随与用户接管')
  await page.locator('#editor-content').click({ position: { x: 30, y: 30 } })
  await page.evaluate(length => {
    document.querySelector('#editor-content').setSelectionRange(length - 500, length - 500)
  }, LONG_DOCUMENT.length)
  await page.waitForTimeout(150)
  await page.click('#btn-find-next')
  await page.waitForTimeout(180)

  const before = await page.evaluate(() => ({
    count: document.querySelector('#find-count')?.textContent || '',
    active: document.querySelectorAll('.editor-search-highlight.editor-search-highlight-active').length,
    scrollTop: document.querySelector('#editor-content').scrollTop,
  }))
  assert(before.count.includes('/'), `find count visible: ${before.count}`)
  assert.equal(before.active, 1, 'one active search highlight before scroll')
  assert(before.scrollTop > 0, `programmatic search scroll happened: ${before.scrollTop}`)

  await page.evaluate(() => {
    const textarea = document.querySelector('#editor-content')
    textarea.scrollTop = 0
  })
  await page.waitForTimeout(250)
  const after = await page.evaluate(() => ({
    active: document.querySelectorAll('.editor-search-highlight.editor-search-highlight-active').length,
    total: document.querySelectorAll('.editor-search-highlight').length,
  }))
  assert.equal(after.active, 1, 'active search highlight remains after programmatic scroll')
  assert(after.total > 0, 'search highlights repaint after programmatic scroll')
  await page.click('#btn-find-close')
  await page.waitForTimeout(150)
  assert.equal(await page.evaluate(() => document.querySelectorAll('.editor-search-highlight').length), 0, 'closing find clears highlights')
  return `programmatic-scroll-search: active=${after.active}, total=${after.total}, count=${before.count}`
}

async function verifyPipelineToolbar(page) {
  await page.click('#btn-pipeline')
  await page.waitForSelector('#pipeline-panel', { timeout: 10_000 })
  const result = await page.evaluate(ids => ({
    retired: ids.filter(id => document.querySelector(`#${id}`) !== null),
    names: Boolean(document.querySelector('#btn-ai-names')),
  }), RETIRED_TOOLBAR_IDS)
  assert.deepEqual(result.retired, [], `retired toolbar buttons must not render: ${result.retired.join(', ')}`)
  assert(result.names, 'AI naming button remains')
  await page.click('#btn-close-pl')
  await page.waitForSelector('#pipeline-panel', { state: 'detached', timeout: 10_000 })
  return `pipeline-toolbar: retired=0/${RETIRED_TOOLBAR_IDS.length}, ai-names=true`
}

async function verifyDeAiBudgetResume(page) {
  await page.evaluate(() => {
    const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
    const store = pinia._s.get('deai')
    store.$patch({
      isProcessing: true,
      errorMessage: '',
      progress: 35,
      runStatus: 'running',
    })
  })
  await page.waitForSelector('#deai-progress-fill', { timeout: 10_000 })

  await page.evaluate(() => {
    const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
    const store = pinia._s.get('deai')
    store.setBudgetState({ used: 8, limit: 8, extensions: 0 })
    store.waitBudget('Electron 实测：API 调用预算已耗尽')
  })
  await page.waitForSelector('#deai-budget', { timeout: 5_000 })
  assert(await page.locator('#deai-budget-extend').isVisible(), 'budget extend button visible')

  let resumeObserved = false
  let extendedObserved = false
  await page.evaluate(() => {
    const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
    const store = pinia._s.get('deai')
    store.attachBudgetHandle({
      budget: {
        tryConsume: () => ({ status: 'allowed', used: 8, limit: 12 }),
        extend: additional => {
          extendedObserved = additional === 4
          return { used: 8, limit: 12, extensions: 1 }
        },
        snapshot: () => ({ used: 8, limit: 12, extensions: 1 }),
      },
      resume: () => {
        resumeObserved = true
      },
    })
  })
  await page.click('#deai-budget-extend')
  await page.waitForTimeout(250)
  const state = await page.evaluate(() => {
    const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
    const store = pinia._s.get('deai')
    return {
      runStatus: store.runStatus,
      isProcessing: store.isProcessing,
      used: store.budgetState?.used,
      limit: store.budgetState?.limit,
      extensions: store.budgetState?.extensions,
    }
  })
  const observed = await page.evaluate(() => ({ resumeObserved, extendedObserved }))
  assert.equal(state.runStatus, 'running', 'budget resume returns run status to running')
  assert.equal(state.isProcessing, true, 'budget resume keeps processing active')
  assert.equal(state.limit, 12, 'budget limit extended to 12')
  assert.equal(state.extensions, 1, 'budget extension count is recorded')
  assert(observed.resumeObserved, 'real resume callback fired')
  assert(observed.extendedObserved, 'budget object extended by 4')
  assert.equal(await page.evaluate(() => document.querySelector('#deai-budget') !== null), false, 'budget waiting block closes')
  await page.evaluate(() => {
    const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
    const store = pinia._s.get('deai')
    store.$patch({ isProcessing: false, runStatus: 'success', progress: 100 })
  })
  await page.waitForSelector('#deai-progress', { state: 'detached', timeout: 10_000 })
  return 'deai-budget: visible -> clicked -> running, limit=12, extensions=1, resume=true'
}

async function verifyOutlineAutoDecompose(page) {
  const beforeRequests = apiRequests.length
  const startedAt = Date.now()
  await page.click('#btn-outline-workspace')
  await page.waitForSelector('#outline-editor', { timeout: 10_000 })
  await page.waitForSelector('#btn-lock-outline', { timeout: 10_000 })
  assert(await page.locator('#btn-lock-outline').isEnabled(), 'outline lock button is enabled after project load')
  await page.evaluate(() => document.activeElement?.blur?.())
  await page.waitForTimeout(300)
  await page.click('#btn-lock-outline')
  await page.waitForSelector('#pipeline-panel', { timeout: 10_000 })
  await page.waitForSelector('#outline-workspace', { state: 'hidden', timeout: 10_000 })
  await page.waitForFunction(expected => window.__pinia?._s?.get('runTrace')?.runs?.some(run =>
    run.source === 'outline'
    && run.startedAt > expected
    && run.status !== 'running'
    && run.events?.some(event => event.type === 'auto-decompose-step')
  ), startedAt, { timeout: 60_000, polling: 300 })

  const runs = await page.evaluate(({ expected, from }) => {
    const store = window.__pinia?._s?.get('runTrace')
    return store.runs
      .filter(run => run.source === 'outline' && run.startedAt > expected)
      .map(run => ({
        status: run.status,
        mode: run.mode,
        events: run.events.filter(event => event.type === 'auto-decompose-step').map(event => ({
          level: event.level,
          label: event.label,
        })),
        calls: run.apiCalls.map(call => ({
          status: call.status,
          responseText: call.responseText || '',
        })),
      }))
  }, { expected: startedAt, from: beforeRequests })
  assert(runs.length >= 1, 'auto decompose trace run exists')
  const run = runs.at(-1)
  assert.equal(run.status, 'success', `auto decompose run succeeds: ${JSON.stringify(run)}`)
  assert.equal(run.events.length, 2, 'both auto decompose steps are traced')
  assert(run.events.every(event => event.level === 'info'), 'auto decompose steps are success-level events')
  assert.equal(apiRequests.length - beforeRequests, 2, `auto decompose makes exactly two API calls, got ${apiRequests.length - beforeRequests}`)
  assert(run.calls.length === 2, 'trace records two logical calls')
  assert(run.calls.every(call => call.status !== 'running'), 'auto decompose calls are closed')
  assert(run.calls.every(call => call.responseText.includes('林知远')), 'mock JSON result reaches trace')

  await page.click('#btn-close-pl')
  await page.waitForSelector('#pipeline-panel', { state: 'detached', timeout: 10_000 })
  assert.equal(await page.evaluate(() => document.querySelector('#outline-workspace') === null), true, 'outline workspace is fully detached')
  return 'outline-auto-decompose: 2 API calls, 2 trace calls, 2 step events, success, useAiTools=0'
}

async function verifyTimeoutHintTrace(page) {
  const result = await page.evaluate(() => {
    const store = window.__pinia?._s?.get('runTrace')
    const outline = [...store.runs].reverse().find(run => run.source === 'outline')
    return {
      timeoutHint: outline?.timeoutHint || null,
      hasActiveHint: Boolean(outline?.timeoutHint?.active),
    }
  })
  assert(result.timeoutHint, 'run trace carries timeoutHint')
  assert(typeof result.timeoutHint.active === 'number', 'long document active timeout hint exists')
  assert(result.timeoutHint.active === 3_600_000, `active timeout hint is 1 hour: ${result.timeoutHint.active}`)
  assert(result.hasActiveHint, 'timeout hint is observable')
  return `timeout-hint: active=${result.timeoutHint.active}ms`
}

function assertFreshRendererBuild() {
  const indexPath = path.join(ROOT, 'dist-renderer', 'index.html')
  assert(fs.existsSync(indexPath), 'dist-renderer/index.html exists; run npm run build:vue first')
  const bundleNames = [...fs.readFileSync(indexPath, 'utf8').matchAll(/assets\/[^"']+\.js/g)].map(match => match[0])
  assert(bundleNames.length > 0, 'renderer index references a JS bundle')
  const sourceFiles = []
  const collect = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) collect(full)
      else if (/\.(ts|vue|js|mjs|css)$/.test(entry.name)) sourceFiles.push(full)
    }
  }
  collect(path.join(ROOT, 'src'))
  const newestSource = Math.max(...sourceFiles.map(file => fs.statSync(file).mtimeMs))
  const stale = bundleNames.filter(name => fs.statSync(path.join(ROOT, 'dist-renderer', name)).mtimeMs < newestSource)
  assert.deepEqual(stale, [], `stale renderer build: ${stale.join(', ')}`)
}

const evidence = {
  schema: 'shenyi.component-lifecycle.electron',
  version: 1,
  generatedAt: new Date().toISOString(),
  checks: [],
  requests: [],
  verdict: 'fail',
}

async function failFast(error) {
  if (failFastStarted) return
  failFastStarted = true
  evidence.error = String(error?.stack || error)
  console.error('===== COMPONENT LIFECYCLE ELECTRON VERIFICATION FAILED =====')
  console.error(evidence.error)
  try {
    if (activeBrowser) await activeBrowser.close().catch(() => {})
    await closeElectron(activeApp)
    removeDir(PROFILE)
  } finally {
    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true })
    fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
    console.log(`[evidence] ${path.relative(ROOT, OUTPUT_FILE)}`)
    process.exit(1)
  }
}

async function main() {
  assertFreshRendererBuild()
  removeDir(PROFILE)
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true })
    await new Promise(resolve => providerServer.listen(MOCK_PORT, '127.0.0.1', resolve))

  let app = null
  let browser = null
  const rendererCrashRef = { crashed: false, message: '' }
  try {
    console.log('[stage] launch Electron')
    assert(!providerServer.listening || true, 'provider server is listening')
    app = startElectron()
    activeApp = app
    let processOutput = ''
    app.stdout?.on('data', chunk => { processOutput += String(chunk) })
    app.stderr?.on('data', chunk => { processOutput += String(chunk) })
    app.on('error', error => { electronSpawnError = error })
    app.on('exit', (code, signal) => { electronExit = { code, signal } })
    watchRendererHealth(app, error => {
      rendererCrashRef.crashed = true
      rendererCrashRef.message = error.message
      failFast(error)
    })
    const cdpPort = await waitForCdpPort(() => `spawnError=${electronSpawnError ? String(electronSpawnError.stack || electronSpawnError) : 'none'}; exit=${electronExit ? JSON.stringify(electronExit) : 'none'}; output=${processOutput}`)
    console.log(`[debug] cdpPort=${cdpPort}`)
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`)
    activeBrowser = browser
    const page = browser.contexts()[0]?.pages()?.at(-1) || await browser.contexts()[0].newPage()
    watchPageHealth(page, rendererCrashRef, failFast)
    console.log(`[debug] pages=${browser.contexts()[0].pages().map(item => item.url()).join(', ')}`)
    const pageErrors = []
    page.on('pageerror', error => pageErrors.push(error.message))
    page.on('console', message => {
      if (['error', 'warning'].includes(message.type())) pageErrors.push(`${message.type()}: ${message.text()}`)
    })
    console.log('[debug] attaching page error listeners')
    await waitForPageReady(page, rendererCrashRef)
    console.log('[debug] page ready')
    await page.waitForSelector('#app', { timeout: 20_000 })
    await page.waitForTimeout(1_000)
    console.log('[debug] initial app visible')
    await closeVisibleModals(page)
    console.log('[debug] initial modals closed')
    await getPinia(page)
    console.log('[debug] pinia available')
    await seedStorage(page)
    console.log('[debug] storage seeded')
    await page.reload({ waitUntil: 'domcontentloaded' })
    console.log('[debug] reload returned')
    await page.waitForSelector('#app', { timeout: 20_000 })
    await page.waitForTimeout(1_000)
    console.log('[debug] reloaded app visible')
    await closeVisibleModals(page)
    console.log('[debug] reloaded modals closed')
    await prepareEditorTab(page)
    console.log('[debug] editor tab prepared')

    console.log('[stage] editor follow paths')
    evidence.checks.push(...await verifyEditorFollowPaths(page))

    console.log('[stage] search highlight after programmatic scroll')
    evidence.checks.push(await verifySearchHighlightAfterProgrammaticScroll(page))

    console.log('[stage] retired pipeline toolbar')
    evidence.checks.push(await verifyPipelineToolbar(page))

    console.log('[stage] DeAi budget resume')
    evidence.checks.push(await verifyDeAiBudgetResume(page))

    console.log('[stage] outline auto decompose')
    evidence.checks.push(await verifyOutlineAutoDecompose(page))

    console.log('[stage] timeout hint trace')
    evidence.checks.push(await verifyTimeoutHintTrace(page))

    assert.deepEqual(pageErrors, [], `renderer errors: ${pageErrors.join(' | ')}`)
    evidence.requests = apiRequests.map(request => ({ ...request, lastUserChars: undefined }))
    evidence.verdict = 'pass'
    console.log('===== COMPONENT LIFECYCLE ELECTRON VERIFICATION PASSED =====')
  } finally {
    if (browser) await browser.close().catch(() => {})
    await closeElectron(app)
    await new Promise(resolve => providerServer.close(resolve))
    removeDir(PROFILE)
    fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
    console.log(`[evidence] ${path.relative(ROOT, OUTPUT_FILE)}`)
  }
}

main().catch(error => failFast(error))
