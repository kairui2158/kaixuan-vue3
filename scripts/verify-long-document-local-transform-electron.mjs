import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = process.env.SHENYI_DIRECT_WRITE_ELECTRON
  ? path.resolve(process.env.SHENYI_DIRECT_WRITE_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9296
const MOCK_PORT = 59972
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const PROFILE = path.join(ROOT, '_data', 'long-document-local-transform-profile')
const EXPORT_ROOT = path.join(ROOT, '_data', 'long-document-local-transform-exports')
const EVIDENCE_DIR = path.join(ROOT, '_audit', 'verification-long-document-execution-efficiency')
const PROJECT_ID = 'long-document-local-transform-project'
const STEP5_REQUEST = '整理整篇文章：统一小节编号、清除多余空行、按编号重排，并保持所有正文内容不丢失。'

function buildDocument() {
  const sections = [
    '# 第3节 灯塔旧信',
    '',
    '',
    '男主在塔底发现半页旧信,潮水声压过纸页;',
    '',
    '',
    '# 第1节 风暴起点',
    '',
    '风暴从灯塔外侧开始,男主第一次看见旧信;',
    '',
    '# 第2节 石阶回声',
    '',
    '石阶把脚步声送回男主耳边,旧信日期被潮气晕开;',
  ]
  return sections.join('\n')
}

const DOCUMENT = buildDocument()

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function removeDir(target) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.rmSync(target, { recursive: true, force: true })
      return
    } catch {}
    await sleep(400)
  }
}

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex')
}

function assertFreshRendererBuild() {
  const rendererIndex = path.join(ROOT, 'dist-renderer', 'index.html')
  assert(fs.existsSync(rendererIndex), 'dist-renderer/index.html exists; run npm run build:vue first')
  const indexHtml = fs.readFileSync(rendererIndex, 'utf8')
  const bundleNames = [...indexHtml.matchAll(/assets\/[^"']+\.js/g)].map(match => match[0])
  assert(bundleNames.length > 0, 'renderer index references at least one JS bundle')
  const sourceRoot = path.join(ROOT, 'src')
  const sourceFiles = []
  const collectSources = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) collectSources(full)
      else if (/\.(ts|vue|js|mjs|css)$/.test(entry.name)) sourceFiles.push(full)
    }
  }
  collectSources(sourceRoot)
  const newestSourceMs = Math.max(...sourceFiles.map(file => fs.statSync(file).mtimeMs))
  const staleBundles = bundleNames.filter(name =>
    fs.statSync(path.join(ROOT, 'dist-renderer', name)).mtimeMs < newestSourceMs)
  assert.equal(staleBundles.length, 0,
    `renderer build is stale; rebuild with npm run build:vue. Stale bundles: ${staleBundles.join(', ')}`)
}

const requests = []

const server = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    let body = null
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    requests.push({
      url: request.url,
      tools: (body?.tools || []).map(tool => tool?.function?.name || tool?.name || '').filter(Boolean),
      body,
    })
    response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify({
      error: {
        message: 'local-transform must not send provider requests',
        code: 'unexpected_provider_request',
      },
    }))
  })
})

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
      SHENYI_TEST_RUN_TRACE_EXPORT: EXPORT_ROOT,
    },
    windowsHide: false,
  })
  console.log(`[ELECTRON] pid=${child.pid} visible window, CDP=${CDP_PORT}`)
  return child
}

async function waitForCdp() {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)
      if (response.ok) return true
    } catch {}
    await sleep(500)
  }
  return false
}

async function setupProject(page) {
  await page.evaluate(async ({ mockUrl, document: documentText, projectId }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'local-transform-guard-provider',
        name: 'Local Transform Guard',
        baseUrl: mockUrl,
        apiKey: 'key',
        models: ['local-transform-guard-model'],
        selectedModel: 'local-transform-guard-model',
        temperature: 0.1,
        maxTokens: 512,
        contextWindowTokens: 1000000,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
      }],
      generateProvider: 'local-transform-guard-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: 'Long Document Local Transform',
      outlineText: documentText,
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
      editorTabs: [{
        id: 'local-transform-main-tab',
        title: '灯塔旧信',
        mode: 'ch-body',
        chapterId: 'local-transform-chapter',
        content: documentText,
      }],
    })
    await window.electronAPI.storageWrite('wa_deAiConfig', {
      hardruleEnabled: false,
      hardRuleMode: 'detect-report',
    })
    const pipelineConfig = await window.electronAPI.storageRead('wa_pipeline_step_config') || {}
    pipelineConfig.skills = pipelineConfig.skills || {}
    pipelineConfig.modes = pipelineConfig.modes || {}
    pipelineConfig.skills[0] = []
    pipelineConfig.modes[0] = 'chain'
    await window.electronAPI.storageWrite('wa_pipeline_step_config', pipelineConfig)
    await window.electronAPI.storageWrite('wa_skills', { skills: [] })
    await window.electronAPI.storageWrite('wa_co_creation_config', {
      agentId: '',
      skillIds: [],
      mode: 'compose',
      skillAgents: {},
    })
  }, { mockUrl: MOCK_BASE_URL, document: DOCUMENT, projectId: PROJECT_ID })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20000 })
  await sleep(1200)
  await page.evaluate(() => {
    document.querySelector('.project-modal-content .btn-close')?.click()
  })
  await sleep(400)
}

async function waitOutlineIdle(page, timeout = 60000) {
  await page.waitForFunction(() =>
    Boolean(document.querySelector('#btn-ow-send') && !document.querySelector('#btn-ow-send')?.disabled),
    null, { timeout, polling: 100 })
}

async function waitHomeIdle(page, timeout = 60000) {
  await page.waitForFunction(() =>
    Boolean(document.querySelector('#btn-send') && !document.querySelector('#btn-send')?.disabled),
    null, { timeout, polling: 100 })
}

async function latestRun(page, source) {
  return await page.evaluate(sourceName => {
    const run = [...(window.__pinia?._s?.get('runTrace')?.runs || [])]
      .filter(item => item.source === sourceName)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    if (!run) return null
    return {
      id: run.id,
      status: run.status,
      turns: (run.turns || []).map(turn => ({
        id: turn.id,
        status: turn.status,
        userRequest: turn.userRequest,
        intent: turn.intent || null,
        reason: turn.reason || null,
      })),
      apiCalls: (run.apiCalls || []).map(call => ({
        id: call.id,
        status: call.status,
        error: call.error || null,
        toolCalls: (call.toolCalls || []).map(tool => ({
          name: tool.name,
          status: tool.status,
        })),
      })),
      events: (run.events || []).map(event => ({
        type: event.type,
        level: event.level,
        label: event.label,
        payload: event.payload || null,
      })),
    }
  }, source)
}

function parseLocalTransformEvent(run) {
  const event = (run?.events || []).find(item => item.type === 'local-transform-executed')
  assert(event, `trace records local-transform-executed; got ${(run?.events || []).map(item => item.type).join(', ') || '(none)'}`)
  const payload = event.payload || JSON.parse(event.detail || '{}')
  assert.equal(payload.execution_mode, 'local-transform', 'event payload records execution_mode')
  assert.equal(payload.outcome, 'completed', 'local transform outcome is completed')
  assert.equal(payload.validation?.ok, true, 'local transform validation passes')
  assert(payload.changedLineCount > 0, 'local transform changes at least one line')
  assert.notEqual(payload.beforeHash, payload.afterHash, 'before and after hashes differ')
  return { event, payload }
}

function assertNoProviderWork(run, requestsForCase) {
  assert.equal((run?.apiCalls || []).length, 0, `run records zero API calls; got ${JSON.stringify(run?.apiCalls || [])}`)
  assert.equal(requestsForCase.length, 0, `zero physical provider requests; got ${requestsForCase.length}`)
  const toolCalls = (run?.apiCalls || []).flatMap(call => call.toolCalls || [])
  assert.equal(toolCalls.length, 0, 'zero tool calls are recorded')
}

function assertTransformedDocument(after) {
  const lines = after.split('\n')
  assert.equal(lines[0], '# 第1节 风暴起点', 'sections are reordered by number')
  assert(lines.includes('# 第2节 石阶回声'), 'second section heading exists')
  assert(lines.includes('# 第3节 灯塔旧信'), 'third section heading exists')
  assert(!/\n{3,}/.test(after), 'no triple blank lines remain')
  assert(after.includes('男主在塔底发现半页旧信,潮水声压过纸页;'),
    'punctuation is unchanged because the request does not mention punctuation')
  assert(after.includes('风暴从灯塔外侧开始,男主第一次看见旧信;'), 'all section bodies are preserved')
  assert(after.includes('石阶把脚步声送回男主耳边,旧信日期被潮气晕开;'), 'last section body is preserved')
}

async function capture(page, name) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`), fullPage: true })
  console.log(`[PASS] screenshot saved: ${name}.png`)
}

async function exportRun(page, source, name) {
  const result = await page.evaluate(async ({ sourceName, exportRoot }) => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])]
      .filter(item => item.source === sourceName)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    if (!run) return { success: false, reason: 'run not found' }
    return await window.electronAPI.runTraceExport({
      schema: 'shenyi.run-trace',
      version: 2,
      run: store.exportRunToJson(run),
      mode: 'deep',
      payloadDirectoryHint: exportRoot,
    })
  }, { sourceName: source, exportRoot: EXPORT_ROOT })
  assert(result?.success, `${name} deep run trace export succeeds: ${result?.reason || ''}`)
  assert(fs.existsSync(result.path), `${name} export directory exists`)
  const sourcePath = path.join(result.path, 'run-trace.json')
  assert(fs.existsSync(sourcePath), `${name} exported run-trace.json exists`)
  const destination = path.join(EVIDENCE_DIR, `${name}-run-trace.json`)
  fs.copyFileSync(sourcePath, destination)
  const exportedRun = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))
  assert.equal(exportedRun.id, (await latestRun(page, source)).id, `${name} export matches latest run`)
  assert((exportedRun.apiCalls || []).every(call => call.status !== 'running'), `${name} export has no running API call`)
  assert((exportedRun.events || []).some(event => event.type === 'local-transform-executed'),
    `${name} exported trace records local-transform-executed`)
  return { path: destination, run: exportedRun }
}

async function runOutlineCase(page) {
  await page.evaluate(() => document.querySelector('#btn-close-outline-workspace')?.click())
  await sleep(300)
  await page.click('#btn-outline-workspace')
  await page.waitForSelector('#outline-editor', { timeout: 15000 })
  await page.locator('#outline-editor').fill(DOCUMENT)
  await sleep(300)
  await page.click('#btn-ai-co-create')
  await page.waitForSelector('#ow-chat-input', { timeout: 15000 })
  await waitOutlineIdle(page)

  const before = await page.evaluate(() =>
    window.__pinia?._s?.get('project')?.outlineText || '')
  const requestStart = requests.length
  const startedAt = Date.now()
  await page.locator('#ow-chat-input').fill(STEP5_REQUEST)
  await page.locator('#ow-chat-input').evaluate(element =>
    element.dispatchEvent(new Event('change', { bubbles: true })))
  await page.locator('#btn-ow-send').click()
  await page.waitForFunction(() => {
    const button = document.querySelector('#btn-ow-send')
    return Boolean(button && !button.disabled && !document.querySelector('#ow-streaming-message'))
  }, null, { timeout: 10000, polling: 50 })
  const elapsedMs = Date.now() - startedAt
  const after = await page.evaluate(() =>
    window.__pinia?._s?.get('project')?.outlineText || '')
  const requestsForCase = requests.slice(requestStart)

  assert.notEqual(after, before, 'outline content actually changes')
  assertTransformedDocument(after)
  assert(elapsedMs < 1000, `outline UI returns in under 1000ms; got ${elapsedMs}ms`)
  const run = await latestRun(page, 'outline')
  assert.equal(run?.status, 'running', 'outline chat run remains open for the next turn')
  const terminalTurn = (run?.turns || []).at(-1)
  assert.equal(terminalTurn?.status, 'success', 'outline turn is closed as success')
  assert.equal(terminalTurn?.reason, 'local_transform_complete', 'outline turn reason is local_transform_complete')
  assert.equal(terminalTurn?.userRequest, STEP5_REQUEST, 'outline turn records the step5 request verbatim')
  const { payload } = parseLocalTransformEvent(run)
  assertNoProviderWork(run, requestsForCase)
  assert.deepEqual(payload.operations, [
    'reorder_sections',
    'normalize_blank_lines',
    'normalize_numbering',
  ], 'outline operations match the step5 request')
  await capture(page, '01-outline-local-transform-step5')
  const exportResult = await exportRun(page, 'outline', 'outline-local-transform-step5')

  return {
    entry: 'outline-workbench',
    elapsedMs,
    beforeChars: before.length,
    afterChars: after.length,
    beforeHash: sha256(before),
    afterHash: sha256(after),
    changedLineCount: payload.changedLineCount,
    operations: payload.operations,
    durationMs: payload.durationMs,
    providerRequests: requestsForCase.length,
    apiCalls: (run?.apiCalls || []).length,
    toolCalls: (run?.apiCalls || []).flatMap(call => call.toolCalls || []).length,
    exportPath: exportResult.path,
  }
}

async function runHomeCase(page) {
  await page.evaluate(() => document.querySelector('#btn-close-outline-workspace')?.click())
  await sleep(300)
  await page.waitForSelector('#user-input', { timeout: 15000 })
  await page.evaluate(documentText => {
    const store = window.__pinia?._s?.get('editor')
    store.tabs = [{
      id: 'local-transform-main-tab',
      title: '灯塔旧信',
      mode: 'ch-body',
      chapterId: 'local-transform-chapter',
      content: documentText,
    }]
    store.activeTabId = 'local-transform-main-tab'
    const textarea = document.querySelector('#editor-content')
    if (textarea) {
      textarea.value = documentText
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }, DOCUMENT)
  await waitHomeIdle(page)

  const before = await page.evaluate(() => {
    const store = window.__pinia?._s?.get('editor')
    const tab = store?.tabs?.find(item => item.id === store.activeTabId) || store?.tabs?.[0]
    return tab?.content || ''
  })
  const requestStart = requests.length
  const startedAt = Date.now()
  await page.locator('#user-input').fill(STEP5_REQUEST)
  await page.locator('#btn-send').click()
  await page.waitForFunction(() => {
    const button = document.querySelector('#btn-send')
    return Boolean(button && !button.disabled)
  }, null, { timeout: 10000, polling: 50 })
  const elapsedMs = Date.now() - startedAt
  const after = await page.evaluate(() => {
    const store = window.__pinia?._s?.get('editor')
    const tab = store?.tabs?.find(item => item.id === store.activeTabId) || store?.tabs?.[0]
    return tab?.content || ''
  })
  const requestsForCase = requests.slice(requestStart)

  assert.notEqual(after, before, 'home editor content actually changes')
  assertTransformedDocument(after)
  assert(elapsedMs < 1000, `home UI returns in under 1000ms; got ${elapsedMs}ms`)
  const run = await latestRun(page, 'home')
  assert.equal(run?.status, 'running', 'home chat run remains open for the next turn')
  const terminalTurn = (run?.turns || []).at(-1)
  assert.equal(terminalTurn?.status, 'success', 'home turn is closed as success')
  assert.equal(terminalTurn?.reason, 'local_transform_complete', 'home turn reason is local_transform_complete')
  assert.equal(terminalTurn?.userRequest, STEP5_REQUEST, 'home turn records the step5 request verbatim')
  const { payload } = parseLocalTransformEvent(run)
  assertNoProviderWork(run, requestsForCase)
  assert.deepEqual(payload.operations, [
    'reorder_sections',
    'normalize_blank_lines',
    'normalize_numbering',
  ], 'home operations match the step5 request')
  await capture(page, '02-home-local-transform-step5')
  const exportResult = await exportRun(page, 'home', 'home-local-transform-step5')

  return {
    entry: 'home-editor',
    elapsedMs,
    beforeChars: before.length,
    afterChars: after.length,
    beforeHash: sha256(before),
    afterHash: sha256(after),
    changedLineCount: payload.changedLineCount,
    operations: payload.operations,
    durationMs: payload.durationMs,
    providerRequests: requestsForCase.length,
    apiCalls: (run?.apiCalls || []).length,
    toolCalls: (run?.apiCalls || []).flatMap(call => call.toolCalls || []).length,
    exportPath: exportResult.path,
  }
}

async function main() {
  assertFreshRendererBuild()
  await new Promise(resolve => server.listen(MOCK_PORT, '127.0.0.1', resolve))
  removeDir(PROFILE)
  removeDir(EXPORT_ROOT)
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
  fs.mkdirSync(EXPORT_ROOT, { recursive: true })
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })

  const electronProcess = startElectron()
  let browser = null
  const report = {
    schema: 'shenyi.long-document-local-transform-electron',
    version: 1,
    generatedAt: new Date().toISOString(),
    electron: {
      pid: electronProcess.pid,
      visible: true,
      cdpPort: CDP_PORT,
    },
    request: STEP5_REQUEST,
    document: {
      chars: DOCUMENT.length,
      sha256: sha256(DOCUMENT),
    },
    cases: [],
  }

  try {
    assert(await waitForCdp(), 'CDP reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    let page = null
    for (let attempt = 0; attempt < 24 && !page; attempt++) {
      page = browser.contexts()[0]?.pages()?.[0] || null
      if (!page) await sleep(500)
    }
    assert(page, 'renderer page reachable')
    page.on('pageerror', error => console.log(`[PAGE ERROR] ${error.message}`))
    page.on('console', message => {
      if (message.type() === 'error') console.log(`[PAGE CONSOLE ERROR] ${message.text()}`)
    })
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1500)

    await setupProject(page)
    report.cases.push(await runOutlineCase(page))
    report.cases.push(await runHomeCase(page))

    assert.equal(requests.length, 0, 'entire visible UI run sends zero provider requests')
    report.assertions = {
      zeroProviderRequests: true,
      zeroApiCalls: report.cases.every(item => item.apiCalls === 0),
      zeroToolCalls: report.cases.every(item => item.toolCalls === 0),
      bothEntriesTransformed: report.cases.length === 2,
      bothEntriesUnder1000Ms: report.cases.every(item => item.elapsedMs < 1000),
      bothTracesDeepExported: report.cases.every(item => Boolean(item.exportPath)),
    }
    const evidencePath = path.join(EVIDENCE_DIR, 'local-transform-electron.json')
    fs.writeFileSync(evidencePath, JSON.stringify(report, null, 2), 'utf8')
    console.log(JSON.stringify({ evidencePath, report }, null, 2))
    console.log('===== LONG DOCUMENT LOCAL TRANSFORM ELECTRON E2E PASSED =====')
  } finally {
    try { if (browser) await browser.close() } catch {}
    try { execFileSync('taskkill', ['/PID', String(electronProcess.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
    server.close()
    await sleep(800)
    removeDir(PROFILE)
    removeDir(EXPORT_ROOT)
    console.log('[CLEANUP] local-transform profile and temporary exports removed')
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
