import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = path.resolve(process.cwd())
const SCRIPT_NAME = 'verify-outline-context-scope-electron.mjs'
const ELECTRON_EXE = process.env.SHENYI_CONTEXT_SCOPE_ELECTRON
  ? path.resolve(process.env.SHENYI_CONTEXT_SCOPE_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_CONTEXT_SCOPE_CDP_PORT || 9362)
const PROFILE = path.join(ROOT, '_data', 'outline-context-scope-profile')
const DATA_DIR = path.join(PROFILE, 'documents-data')
const EXPORT_ROOT = path.join(PROFILE, 'run-trace-exports')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-outline-context-scope-electron')
const EVIDENCE_ARCHIVE_ROOT = path.join(ROOT, '_audit', 'verification-outline-context-scope-electron-archive')
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const HEARTBEAT_PATH = path.join(EVIDENCE_ROOT, 'heartbeat.jsonl')
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_CONTEXT_SCOPE_GLOBAL_TIMEOUT_MS || 10 * 60_000)
const STEP_TIMEOUT_MS = Number(process.env.SHENYI_CONTEXT_SCOPE_STEP_TIMEOUT_MS || 90_000)
const STALLED_TIMEOUT_MS = Number(process.env.SHENYI_CONTEXT_SCOPE_STALLED_TIMEOUT_MS || 20_000)
const DEAD_TIMEOUT_MS = Number(process.env.SHENYI_CONTEXT_SCOPE_DEAD_TIMEOUT_MS || 45_000)
const HEARTBEAT_INTERVAL_MS = Number(process.env.SHENYI_CONTEXT_SCOPE_HEARTBEAT_INTERVAL_MS || 1000)
const KEEP_PROFILE = process.env.SHENYI_CONTEXT_SCOPE_KEEP_PROFILE === '1'

const VOLUME_OUTLINE = [
  '## 卷级常任约束',
  '> 作用域：卷级常任',
  '- 全卷不得提前揭示灯芯真相。',
  '',
  '## 剧情单元 D1-03 雨夜',
  '> 作用域：单元级 D1-03',
  '章节范围：第 12 - 14 章',
  '- 雨夜中，主角发现旧灯塔底层的纸条。',
  '',
  '## 剧情单元 D1-04 黎明',
  '> 作用域：单元级 D1-04',
  '章节范围：第 15 - 17 章',
  '- 黎明后，主角离开旧城，寻找南方航线。',
  '',
  '## 情绪弧线',
  '> 作用域：卷级常任',
  '| 第12章 | 惊愕 |',
  '| 第13章 | 反抗 |',
  '| 第15章 | 平静 |'
].join('\n')

const LEGACY_OUTLINE = '旧项目卷纲\n没有段位声明，也没有二级标题。'
const SCOPED_MISSING_UNIT_OUTLINE = [
  '## 卷级常任约束',
  '> 作用域：卷级常任',
  '- 全卷不得提前揭示灯芯真相。',
  '',
  '## 剧情单元 D1-04 黎明',
  '> 作用域：单元级 D1-04',
  '章节范围：第 15 - 17 章',
  '- 黎明后，主角离开旧城。'
].join('\n')
const BODY_SENTENCE = '雨停在灯塔外。林照把纸条贴在灯芯旁，火光第一次稳定下来。'
const BODY_TEXT = Array.from({ length: 120 }, () => BODY_SENTENCE).join('')
const BODY_RESPONSE = JSON.stringify({ body: BODY_TEXT })

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
  assert.equal(staleBundles.length, 0,
    `renderer build is stale: ${staleBundles.join(', ')}`)
}

function archivePreviousEvidence() {
  if (!fs.existsSync(EVIDENCE_ROOT)) return null
  fs.mkdirSync(EVIDENCE_ARCHIVE_ROOT, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const target = path.join(EVIDENCE_ARCHIVE_ROOT, timestamp)
  fs.cpSync(EVIDENCE_ROOT, target, { recursive: true })
  fs.rmSync(EVIDENCE_ROOT, { recursive: true, force: true })
  return target
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
  const server = http.createServer((request, response) => {
    let bodyText = ''
    request.on('data', chunk => { bodyText += chunk })
    request.on('end', () => {
      requests.push({ at: new Date().toISOString(), url: request.url, bodyText })
      let wantsStream = false
      try {
        wantsStream = JSON.parse(bodyText).stream === true
      } catch {}
      if (wantsStream) {
        const chunks = [
          `data: ${JSON.stringify({ choices: [{ delta: { content: BODY_RESPONSE } }] })}\n\n`,
          `data: ${JSON.stringify({
            choices: [{ delta: {}, finish_reason: 'stop' }],
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
        choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: BODY_RESPONSE } }]
      }))
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

async function seedApplication(page, provider, { projectId, outline, unitId, plot }) {
  await page.evaluate(async ({ baseUrl, projectId, outline, unitId, plot }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'context-scope-provider',
        name: 'Context Scope Provider',
        baseUrl,
        apiKey: 'context-scope-local-key',
        models: ['context-scope-model'],
        selectedModel: 'context-scope-model',
        temperature: 0.1,
        maxTokens: 4096,
        contextWindowTokens: 128000,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: false,
      }],
      generateProvider: 'context-scope-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: '作用域上下文闭包实测',
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
        id: 'volume-context',
        name: '第一卷 雨夜',
        index: 0,
        outline,
        summary: outline,
        suggestedWords: 200000,
        confirmed: true,
        locked: true,
        isBound: true,
      }],
        chapters: {
        'volume-context': [{
          id: 'chapter-context-12',
          title: '第12章 纸条',
          index: 0,
          plot,
          summary: plot,
          confirmed: true,
          pipelineGenerated: true,
          unitId,
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
    endpointMode: 'base',
    chatPath: '/v1/chat/completions',
    projectId,
    outline,
    unitId,
    plot,
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20_000 })
  await sleep(1200)
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
  await sleep(300)
}

function snapshot(page, startedAfter = 0) {
  return page.evaluate(startedAfter => {
    const pipeline = window.__pinia?._s?.get('pipeline')
    const trace = window.__pinia?._s?.get('runTrace')
    const run = [...(trace?.runs || [])]
      .filter(item => item.source === 'pipeline' && item.step === 4 && item.stepName === '正文层')
      .filter(item => !startedAfter || item.startedAt >= startedAfter)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    const lastBodyLog = (window.__pinia?._s?.get('executionLog')?.logs || []).at(-1)?.message || null
    return {
      at: new Date().toISOString(),
      runId: run?.id || null,
      runStatus: run?.status || null,
      eventCount: (run?.events || []).length,
      lastEventType: (run?.events || []).at(-1)?.type || null,
      progress: pipeline?.activeBodyRun?.progress ?? null,
      status: pipeline?.activeBodyRun?.statusText || null,
      pipelineRunStatus: pipeline?.activeBodyRun?.status || null,
      isGenerating: Boolean(pipeline?.isGenerating),
      lastBodyLog,
      runError: run?.error || null,
    }
  }, startedAfter)
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
  }, HEARTBEAT_INTERVAL_MS)
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
  const startedAfter = Date.now()
  await page.click('#btn-primary-gen-body')

  let lastSignature = null
  let lastProgressAt = Date.now()
  let lastSnapshot = null
  const deadline = Date.now() + STEP_TIMEOUT_MS
  while (Date.now() < deadline) {
    const state = await snapshot(page, startedAfter)
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
      return { state, startedAfter }
    }
    await sleep(500)
  }
  throw new Error(`body generation did not finish within ${STEP_TIMEOUT_MS}ms: ${JSON.stringify(lastSnapshot)}`)
}

function parseDetail(value) {
  if (typeof value !== 'string') return value || {}
  try { return JSON.parse(value) } catch { return { raw: value } }
}

async function contextScopeEvents(page, startedAfter) {
  return page.evaluate(({ startedAfter, parse }) => {
    const trace = window.__pinia?._s?.get('runTrace')
    const run = [...(trace?.runs || [])]
      .filter(item => item.source === 'pipeline' && item.step === 4 && item.stepName === '正文层')
      .filter(item => !startedAfter || item.startedAt >= startedAfter)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    return (run?.events || [])
      .filter(event => event.type === 'context_scope')
      .map(event => parse(event.detail))
    function parse(value) {
      if (typeof value !== 'string') return value || {}
      try { return JSON.parse(value) } catch { return { raw: value } }
    }
  }, { startedAfter, parse: null })
}

async function exportLatestBodyRun(page, startedAfter) {
  return page.evaluate(async ({ exportRoot, startedAfter }) => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])]
      .filter(item => item.source === 'pipeline' && item.step === 4 && item.stepName === '正文层')
      .filter(item => !startedAfter || item.startedAt >= startedAfter)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    if (!run) return null
    const result = await window.electronAPI.runTraceExport({
      schema: 'shenyi.run-trace',
      version: 2,
      run: store.exportRunToJson(run),
      mode: 'deep',
      payloadDirectoryHint: exportRoot,
    })
    return { runId: run.id, result }
  }, { exportRoot: EXPORT_ROOT, startedAfter })
}

function readExportedRun(exported) {
  assert.equal(exported?.result?.success, true, 'body run trace export succeeds')
  assert(exported?.result?.path, 'body run trace export returns a path')
  const directory = exported.result.path
  const run = JSON.parse(fs.readFileSync(path.join(directory, 'run-trace.json'), 'utf8'))
  return { directory, run }
}

async function runCase(provider, { projectId, outline, unitId, plot, expected }) {
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
    await seedApplication(page, provider, { projectId, outline, unitId, plot })
    const heartbeat = startHeartbeat(page, electronProcess.pid)
    try {
      const { state, startedAfter } = await runBodyThroughUi(page)
      const events = await contextScopeEvents(page, startedAfter)
      const exported = await exportLatestBodyRun(page, startedAfter)
      const { run, directory } = exported ? readExportedRun(exported) : { run: null, directory: null }
      return {
        page,
        browser,
        electronProcess,
        state,
        events,
        exportedRun: run,
        exportDirectory: directory,
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

async function assertPositiveRun(result) {
  assert.equal(result.state.runStatus, 'success', `body run succeeds, got ${result.state.runStatus}`)
  assert(result.events.length === 1, 'body run records one context_scope event')
  const detail = result.events[0]
  assert.equal(detail.mode, 'unit_closure', 'context scope uses the unit closure mode')
  assert.equal(detail.unitId, 'D1-03', 'context scope records the explicit unit id')
  assert(detail.closureBytes > 0, 'context scope records a non-empty closure')
  assert(detail.closureBytes <= detail.maxBytes, 'closure stays inside its byte budget')
  assert(!detail.trimmed.includes('剧情单元 D1-03 雨夜'), 'current unit is not trimmed')
  assert(!detail.warnings.some(warning => warning.includes('黎明')), 'other units do not leak into warnings')
  const bodyText = result.page.evaluate(() => {
    const project = window.__pinia?._s?.get('project')
    const chapter = project?.chapters?.['volume-context']?.[0]
    return chapter?.body || chapter?.result || ''
  })
  assert((await bodyText).includes(BODY_TEXT), 'generated body is persisted to the chapter')
  assert(result.exportedRun?.events?.some(event => event.type === 'context_scope'),
    'exported run trace keeps the context_scope event')
}

function assertMissingUnitFailure(result) {
  assert.equal(result.state.runStatus, 'failed', 'scoped outline with missing unit fails explicitly')
  const failureText = `${result.state.status || ''} ${result.state.runError || ''}`
  assert(failureText.includes('正文上下文闭包构建失败'),
    `failure names the closure error, got ${JSON.stringify(result.state)}`)
  assert(failureText.includes('unit_not_found'),
    `failure contains the unit_not_found error code, got ${JSON.stringify(result.state)}`)
  assert(result.state.isGenerating === false, 'failed run does not stay in generating state')
  assert.equal(result.events.length, 0, 'failed run does not emit a fake context_scope event')
  assert(result.exportedRun === null || result.exportedRun.status === 'failed',
    'failed run trace is exported as failed')
}

async function assertLegacyFallbackRun(result) {
  assert.equal(result.state.runStatus, 'success', `legacy body run succeeds, got ${result.state.runStatus}`)
  assert(result.events.length === 1, 'legacy body run records one context_scope event')
  const detail = result.events[0]
  assert.equal(detail.mode, 'legacy_outline_no_scope', 'legacy run uses the explicit fallback mode')
  assert.equal(detail.degradedReason, 'legacy_outline_no_scope', 'legacy run records the fallback reason')
  assert(detail.closureBytes > 0, 'legacy fallback closure is non-empty')
  assert(detail.closureBytes <= detail.maxBytes, 'legacy fallback stays inside its byte budget')
  const bodyText = await result.page.evaluate(() => {
    const project = window.__pinia?._s?.get('project')
    const chapter = project?.chapters?.['volume-context']?.[0]
    return chapter?.body || chapter?.result || ''
  })
  assert(bodyText.includes(BODY_TEXT), 'legacy fallback body is persisted to the chapter')
  assert(result.exportedRun?.events?.some(event => event.type === 'context_scope'),
    'legacy exported run trace keeps the context_scope event')
}

async function main() {
  assertFreshRendererBuild()
  const archivedEvidence = archivePreviousEvidence()
  if (archivedEvidence) console.log(`[EVIDENCE ARCHIVED] ${archivedEvidence}`)
  fs.rmSync(EVIDENCE_ROOT, { recursive: true, force: true })
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
  fs.mkdirSync(EXPORT_ROOT, { recursive: true })

  const watchdog = setTimeout(() => {
    console.error(`[FAIL] global timeout after ${GLOBAL_TIMEOUT_MS}ms`)
    process.exit(1)
  }, GLOBAL_TIMEOUT_MS)
  watchdog.unref()

  const provider = await startProvider()
  const report = {
    schema: 'shenyi.outline-context-scope.electron',
    version: 1,
    generatedAt: new Date().toISOString(),
    script: SCRIPT_NAME,
    cases: [],
  }

  try {
    const positive = await runCase(provider, {
      projectId: 'context-scope-positive',
      outline: VOLUME_OUTLINE,
      unitId: 'D1-03',
      plot: '雨夜中发现旧灯塔底层的纸条。',
    })
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'provider-requests.json'),
      JSON.stringify(provider.requests(), null, 2), 'utf8')
    try {
      await assertPositiveRun(positive)
      report.cases.push({
        case: 'unit_closure_real_ui',
        runId: positive.state.runId,
        status: positive.state.runStatus,
        contextScope: positive.events[0],
        requestCount: provider.requests().length,
      })
      fs.copyFileSync(
        path.join(positive.exportDirectory, 'run-trace.json'),
        path.join(EVIDENCE_ROOT, 'positive-run-trace.json'),
      )
      await positive.page.screenshot({ path: path.join(EVIDENCE_ROOT, 'positive-final.png'), fullPage: false })
    } finally {
      closeElectron(positive.electronProcess)
      await positive.browser.close()
    }

    const legacy = await runCase(provider, {
      projectId: 'context-scope-legacy-fallback',
      outline: LEGACY_OUTLINE,
      unitId: 'D1-03',
      plot: '旧项目剧情点，没有作用域声明。',
    })
    try {
      await assertLegacyFallbackRun(legacy)
      report.cases.push({
        case: 'legacy_outline_records_explicit_fallback',
        runId: legacy.state.runId,
        status: legacy.state.runStatus,
        contextScope: legacy.events[0],
        requestCount: provider.requests().length,
      })
      if (legacy.exportDirectory) {
        fs.copyFileSync(
          path.join(legacy.exportDirectory, 'run-trace.json'),
          path.join(EVIDENCE_ROOT, 'legacy-run-trace.json'),
        )
      }
      await legacy.page.screenshot({ path: path.join(EVIDENCE_ROOT, 'legacy-final.png'), fullPage: false })
    } finally {
      closeElectron(legacy.electronProcess)
      await legacy.browser.close()
    }

    const negative = await runCase(provider, {
      projectId: 'context-scope-missing-unit-negative',
      outline: SCOPED_MISSING_UNIT_OUTLINE,
      unitId: 'D1-03',
      plot: '剧情点指向的单元不存在。',
    })
    try {
      assertMissingUnitFailure(negative)
      report.cases.push({
        case: 'scoped_missing_unit_fails_without_silent_fallback',
        runId: negative.state.runId,
        status: negative.state.runStatus,
        failure: negative.state.runError,
        requestCount: provider.requests().length,
      })
      if (negative.exportDirectory) {
        fs.copyFileSync(
          path.join(negative.exportDirectory, 'run-trace.json'),
          path.join(EVIDENCE_ROOT, 'negative-run-trace.json'),
        )
      }
      await negative.page.screenshot({ path: path.join(EVIDENCE_ROOT, 'negative-final.png'), fullPage: false })
    } finally {
      closeElectron(negative.electronProcess)
      await negative.browser.close()
    }

    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'report.json'), JSON.stringify(report, null, 2), 'utf8')
    console.log('===== OUTLINE CONTEXT SCOPE ELECTRON PASSED =====')
  } finally {
    await provider.close()
    clearTimeout(watchdog)
    if (!KEEP_PROFILE) {
      await removeDir(PROFILE)
      await removeDir(EXPORT_ROOT)
    }
  }
}

main().catch(error => {
  console.error('[FAIL]', error)
  process.exitCode = 1
})
