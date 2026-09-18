import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn, execFileSync } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9228
const PROFILE = path.join(ROOT, '_data', 'run-trace-v2-e2e-profile')
const EXPORT_BASE = path.join(ROOT, '_data', 'run-trace-v2-exports')
const MOCK_PORT = 59841
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const MOCK_PROVIDER_ID = 'codex-run-trace-v2-mock-provider'
const DATA_DIR = path.join(PROFILE, 'app-data')
const KEEP_E2E_PROFILE = process.env.SHENYI_E2E_KEEP_PROFILE === '1'

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

function assert(condition, message) {
  if (!condition) throw new Error(message)
  console.log('[PASS] ' + message)
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex')
}

const providerRequests = []
const providerServer = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    let body = null
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    providerRequests.push({ url: request.url, body })
    // The continuation service always requests an SSE stream, so the mock
    // must speak the OpenAI streaming protocol instead of a JSON response.
    const text = '这是被长度截断的第一段回复，这是续生成补全的第二段回复。'
    const events = [
      { choices: [{ delta: { content: text }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] }
    ]
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache'
    })
    response.end(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n')
  })
})

let electronProcess = null
let browser = null

function startElectron() {
  electronProcess = spawn(ELECTRON_EXE, [
    '.',
    `--remote-debugging-port=${CDP_PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${PROFILE}`,
  ], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SHENYI_TEST_RUN_TRACE_EXPORT: EXPORT_BASE,
      SHENYI_TEST_USER_DATA_DIR: DATA_DIR,
    },
  })
  electronProcess.stdout.on('data', data => {
    const text = String(data)
    if (/Uncaught|unhandledRejection/i.test(text)) console.log('[ELECTRON:stdout] ' + text.slice(0, 500))
  })
  electronProcess.stderr.on('data', data => {
    const text = String(data)
    if (/Uncaught|unhandledRejection|EADDRINUSE/i.test(text)) console.log('[ELECTRON:stderr] ' + text.slice(0, 500))
  })
}

async function waitForCdp(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)
      if (response.ok) return true
    } catch { /* retry */ }
    await sleep(500)
  }
  return false
}

function stopElectron() {
  if (!electronProcess?.pid) return
  try {
    execFileSync('taskkill', ['/PID', String(electronProcess.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch { /* already exited */ }
  electronProcess = null
}

async function cleanup() {
  try { await browser?.close() } catch { /* already closed */ }
  stopElectron()
  await new Promise(resolve => providerServer.close(() => resolve()))
  if (KEEP_E2E_PROFILE) {
    console.log(`[CLEANUP] profile retained: ${PROFILE}`)
    return
  }
  // On Windows, Electron child processes can briefly hold profile handles
  // after taskkill. Retry briefly so observability cleanup cannot turn a
  // passing verification into a false failure.
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      fs.rmSync(PROFILE, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
      fs.rmSync(EXPORT_BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
      break
    } catch (error) {
      if (attempt === 5) throw error
      await sleep(500)
    }
  }
  assert(!fs.existsSync(PROFILE), 'E2E profile is cleaned up')
  assert(!fs.existsSync(EXPORT_BASE), 'E2E export directory is cleaned up')
}

function verifyExportDirectory(dir, mode) {
  const runTracePath = path.join(dir, 'run-trace.json')
  assert(fs.existsSync(runTracePath), `${mode}: run-trace.json exists`)

  const runTrace = JSON.parse(fs.readFileSync(runTracePath, 'utf8'))
  assert(runTrace.schema_version === undefined || typeof runTrace === 'object', `${mode}: run-trace.json is valid JSON`)
  assert(Array.isArray(runTrace.payloads), `${mode}: payloads array exists in run-trace`)

  const payloadsDir = path.join(dir, 'payloads')
  const hasPayloads = fs.existsSync(payloadsDir)
  assert(hasPayloads || runTrace.payloads.length === 0, `${mode}: payloads directory consistency`)

  if (hasPayloads) {
    for (const ref of runTrace.payloads) {
      const payloadPath = path.join(payloadsDir, ref.file)
      assert(fs.existsSync(payloadPath), `${mode}: payload file ${ref.file} exists`)
      const content = fs.readFileSync(payloadPath)
      const hash = crypto.createHash('sha256').update(content).digest('hex')
      assert(hash === ref.sha256, `${mode}: payload ${ref.file} sha256 matches`)
    }
  }

  const raw = fs.readFileSync(runTracePath, 'utf8')
  assert(!raw.includes('sk-12345678abcdefg'), `${mode}: API key not leaked in run-trace.json`)
  assert(!raw.includes('Bearer sk-'), `${mode}: Bearer token not leaked in run-trace.json`)

  const exportJsonPath = path.join(dir, 'export.json')
  assert(fs.existsSync(exportJsonPath), `${mode}: export.json exists`)
  const exportJson = JSON.parse(fs.readFileSync(exportJsonPath, 'utf8'))
  assert(exportJson.exportMode === mode, `${mode}: export.json exportMode is ${mode}`)
  assert(exportJson.payloadVerification?.ok === true, `${mode}: payloadVerification ok`)
  assert(exportJson.payloadCount === runTrace.payloads.length, `${mode}: payloadCount matches refs`)

  if (mode === 'light') {
    const isEmptyInline = value => value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
    assert(runTrace.apiCalls.every(call => isEmptyInline(call.requestMessages) && isEmptyInline(call.responseText)), `${mode}: light mode strips inline fields`)
  }

  return runTrace
}

async function main() {
  await new Promise(resolve => providerServer.listen(MOCK_PORT, '127.0.0.1', resolve))
  fs.rmSync(PROFILE, { recursive: true, force: true })
  fs.rmSync(EXPORT_BASE, { recursive: true, force: true })
  fs.rmSync(path.join(DATA_DIR, 'run-trace', 'home'), { recursive: true, force: true })
  fs.mkdirSync(EXPORT_BASE, { recursive: true })

  startElectron()
  const cdpOk = await waitForCdp()
  assert(cdpOk, 'Electron CDP endpoint is reachable')

  browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
  let page = null
  for (let i = 0; i < 24; i++) {
    const pages = browser.contexts()[0]?.pages() || []
    if (pages.length) { page = pages[0]; break }
    await sleep(500)
  }
  assert(page, 'Electron renderer page is reachable')

  page.on('pageerror', error => console.log('[BROWSER:pageerror] ' + error.message))
  page.on('console', message => {
    if (message.type() === 'error') {
      const text = message.text()
      if (/AI call|API 调用|续生成|continuation|provider/i.test(text)) {
        console.log('[BROWSER:console] ' + text.slice(0, 1000))
      }
    }
  })
  await page.waitForSelector('#app', { timeout: 15000 })
  await sleep(2000)

  await page.evaluate(async () => {
    const close = document.querySelector('.project-modal-content .btn-close')
    if (close) close.click()
  })
  await sleep(500)

  const seedResult = await page.evaluate(() => {
    const raw = window.__pinia?._s?.get?.('runTrace')
    const store = raw?.value || raw
    if (!store) return {
      ok: false,
      reason: 'runTrace store not found',
      keys: Object.keys(window.__pinia || {}),
      storeKeys: raw ? Object.keys(raw) : []
    }
    return {
      ok: true,
      hasStartRun: typeof store.startRun === 'function',
      hasStartApiCall: typeof store.startApiCall === 'function',
      hasAppendPhysicalCall: typeof store.appendPhysicalCall === 'function',
      hasAppendToolCall: typeof store.appendToolCall === 'function',
      hasPromptSnapshot: typeof store.attachPromptSnapshot === 'function',
      hasProcessingReport: typeof store.attachProcessingReport === 'function',
      hasContextCompacted: typeof store.markContextCompacted === 'function',
      rawType: Object.prototype.toString.call(raw)
    }
  })
  assert(seedResult.ok, 'Pinia runTrace store is accessible')
  assert(seedResult.hasStartRun, 'runTrace store exposes startRun')
  assert(seedResult.hasStartApiCall, 'runTrace store exposes startApiCall')
  assert(seedResult.hasAppendPhysicalCall, 'runTrace store exposes appendPhysicalCall')
  assert(seedResult.hasAppendToolCall, 'runTrace store exposes appendToolCall')
  assert(seedResult.hasPromptSnapshot, 'runTrace store exposes attachPromptSnapshot')
  assert(seedResult.hasProcessingReport, 'runTrace store exposes attachProcessingReport')
  assert(seedResult.hasContextCompacted, 'runTrace store exposes markContextCompacted')

  const runId = await page.evaluate(() => {
    const state = window.__pinia.state.value.runTrace
    const rawStore = window.__pinia._s.get('runTrace')
    const store = rawStore?.value || rawStore
    store.clearRuns()
    const id = store.startRun({
      source: 'home',
      stepName: '主页共创',
      mode: 'chat',
      sessionKind: 'chat',
      projectId: 'run-trace-v2-e2e',
      projectName: 'RunTrace V2 E2E',
      providerId: 'mock-provider',
      providerName: 'Mock Provider',
      model: 'mock-model',
      skillNames: ['测试技能'],
      skillMode: 'chat',
      target: { type: 'main', id: 'main', name: '主页编辑器' },
      context: { turns: 1, contextStrategy: 'chat' }
    })
    const turnId = store.startTurn(id, { userRequest: '请写一段带密钥的测试内容', skillNames: ['测试技能'], mode: 'chat' })
    const callId = store.startApiCall(id, {
      source: 'home',
      skillName: '测试技能',
      model: 'mock-model',
      requestMessages: [
        { role: 'system', content: 'Authorization: Bearer sk-12345678abcdefg' },
        { role: 'user', content: '用户请求测试' }
      ]
    })
    store.appendPhysicalCall(id, callId, {
      phase: 'normal',
      status: 'success',
      requestMessages: [{ role: 'user', content: '物理请求测试' }],
      responseText: '物理返回测试',
      durationMs: 100
    })
    store.appendToolCall(id, callId, {
      name: 'editor.get_state',
      input: { targetId: 'main' },
      result: { ok: true },
      status: 'success',
      durationMs: 15
    })
    store.finishApiCall(id, callId, {
      status: 'success',
      responseText: '这是最终返回内容，用于测试 payload 外置。api_key=sk-12345678abcdefg',
      finishReason: 'stop',
      usage: { input_tokens: 100, output_tokens: 50 },
      durationMs: 200
    })
    store.attachPromptSnapshot(id, {
      apiCallId: callId,
      turnId,
      skillId: 'test-skill',
      skillName: '测试技能',
      finalMessages: [{ role: 'system', content: '系统提示词' }, { role: 'user', content: '用户消息' }],
      variables: [{ key: 'chapterTitle', source: 'pipeline', chars: 10, value: '第一章' }]
    })
    store.attachProcessingReport(id, {
      apiCallId: callId,
      turnId,
      stage: 'post',
      processor: 'hard-rules',
      status: 'warning',
      inputPreview: '处理前文本',
      outputPreview: '处理后文本',
      ruleHits: [{ rule: 'AI味规则', count: 2 }],
      issues: [{ level: 'warning', code: 'rule-hit', message: '命中规则', blocking: false }],
      startedAt: Date.now() - 50,
      endedAt: Date.now(),
      durationMs: 50
    })
    store.finishTurn(id, turnId, 'success')
    store.finishRun(id, 'success')
    return id
  })
  assert(typeof runId === 'string' && runId.length > 0, 'Synthetic run trace is created in Pinia store')

  await sleep(1000)

  // Real renderer concurrency gate: an external canceler and the trace
  // wrapper race to finish the same run. The canceled terminal state must
  // win, and the late success must only produce a diagnostic conflict event.
  const conflictResult = await page.evaluate(() => {
    const pinia = window.__pinia
    const rawStore = pinia._s.get('runTrace')
    const store = rawStore?.value || rawStore
    if (!store) return { ok: false, reason: 'runTrace store not found' }
    const runId = store.startRun({
      step: 2,
      stepName: '并发收尾冲突',
      mode: 'single',
      skillNames: ['conflict-probe']
    })
    store.finishRun(runId, 'canceled', '真实用户取消')
    store.finishRun(runId, 'success')
    const run = store.getRun(runId)
    return {
      ok: run?.status === 'canceled' &&
        run?.events?.some(event => event.type === 'status-conflict-ignored'),
      status: run?.status,
      hasConflict: run?.events?.some(event => event.type === 'status-conflict-ignored') || false
    }
  })
  assert(conflictResult.ok, `并发收尾冲突保护生效（status=${conflictResult.status}, conflictEvent=${conflictResult.hasConflict}）`)

  // Real provider round-trip: create a length-truncated assistant message,
  // then click the rendered "续生成" action. This verifies that continuation
  // physical calls are recorded through the production aiService path.
  const continuationVerified = await page.evaluate(async () => {
    const state = window.__pinia?.state?.value?.chat
    const rawStore = window.__pinia._s.get('chat')
    const store = rawStore?.value || rawStore
    if (!state || !store) return { ok: false, reason: 'chat store not found' }
    const originalProviders = await window.electronAPI.storageRead('wa_providers')
    const session = store.ensureSession(
      'codex-run-trace-v2',
      'run-trace-v2',
      'RunTrace V2 E2E'
    )
    const projectId = state.currentProjectId || 'default'
    // ChatPanel renders the session bound to editorStore.activeTab, and the
    // binding watcher only fires when that tab object changes. Force a fresh
    // active tab so ensureSession/bindCurrentContext run synchronously here.
    const editorRaw = window.__pinia._s.get('editor')
    const editorStore = editorRaw?.value || editorRaw
    const editorState = window.__pinia?.state?.value?.editor
    const testTab = { id: 'codex-run-trace-v2-tab', title: 'RunTrace V2 E2E', content: 'RunTrace V2 E2E', chapterId: 'run-trace-v2', isDirty: false, mode: 'ch-body' }
    const existingTabIndex = editorState.tabs.findIndex(tab => tab.id === testTab.id)
    if (existingTabIndex >= 0) {
      editorState.tabs.splice(existingTabIndex, 1, { ...editorState.tabs[existingTabIndex], ...testTab })
    } else {
      editorState.tabs.push(testTab)
    }
    editorStore.openTab(testTab)
    await new Promise(resolve => requestAnimationFrame(() => resolve()))
    const activeTabId = testTab.id
    session.messages = session.messages.filter(message => !message.id?.startsWith('codex-run-trace-v2-'))
    session.messages.push({ id: 'codex-run-trace-v2-user', role: 'user', content: '请生成会被截断的测试回复', tabId: activeTabId, ts: Date.now() })
    session.messages.push({
      id: 'codex-run-trace-v2-assistant',
      role: 'assistant',
      content: '这是被长度截断的第一段回复',
      tabId: activeTabId,
      ts: Date.now()
    })
    state.activeSessionId = session.id
    const continuationSnapshot = {
      requestId: 'codex-run-trace-v2-continuation',
      projectId,
      workspace: 'main',
      purpose: 'generate',
      providerId: 'codex-run-trace-v2-mock-provider',
      model: 'codex-run-trace-v2-mock-model',
      skillIds: [],
      agentIds: [],
      mode: 'single',
      originalMessages: [{ role: 'user', content: '请生成会被截断的测试回复' }],
      accumulatedText: '这是被长度截断的第一段回复',
      continuationCount: 0,
      status: 'possibly_truncated',
      finishReason: 'length',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    store.updateMessageContinuation('codex-run-trace-v2-assistant', continuationSnapshot, session.id)
    return {
      ok: session.messages.some(message => message.id === 'codex-run-trace-v2-assistant'),
      sessionId: session.id,
      originalProviders,
      projectId,
      snapshot: continuationSnapshot
    }
  })
  assert(continuationVerified.ok, 'Continuation snapshot is attached to an assistant message')

  await page.evaluate(({ config }) => {
    return (async () => {
      await window.electronAPI.storageWrite('wa_providers', config)
      await window.__pinia._s.get('provider').loadProviders()
    })()
  }, { config: {
    providers: [{
      id: MOCK_PROVIDER_ID,
      name: 'RunTrace V2 Mock Provider',
      baseUrl: MOCK_BASE_URL,
      apiKey: 'codex-run-trace-v2-mock-key',
      models: ['codex-run-trace-v2-mock-model'],
      selectedModel: 'codex-run-trace-v2-mock-model',
      temperature: 0.1,
      maxTokens: 4096,
      purpose: ['generate'],
      providerType: 'openai-compatible',
      streamMode: false
    }],
    generateProvider: MOCK_PROVIDER_ID,
    verifyProvider: null,
    detectProvider: null
  } })

  await page.click('.chat-message.assistant .continuation-btn')
  const continuationProbe = await page.evaluate(() => ({
    buttonCount: document.querySelectorAll('.chat-message.assistant .continuation-btn').length,
    generationStatus: window.__pinia?.state?.value?.chat?.generationStatus,
    activeSessionId: window.__pinia?.state?.value?.chat?.activeSessionId,
    activeTabId: window.__pinia?.state?.value?.editor?.activeTabId,
    lastMessage: window.__pinia?.state?.value?.chat?.activeSession?.messages?.at(-1) || null,
    continueRuns: window.__pinia?.state?.value?.runTrace?.runs?.filter(run => run.mode === 'continue').length
  }))
  console.log('[DEBUG:probe] ' + JSON.stringify(continuationProbe, null, 2))
  await sleep(300)
  const continuationProbeAfter = await page.evaluate(() => ({
    generationStatus: window.__pinia?.state?.value?.chat?.generationStatus,
    activeSessionId: window.__pinia?.state?.value?.chat?.activeSessionId,
    assistantMessages: (window.__pinia?.state?.value?.chat?.sessions
      ?.find(session => session.id === window.__pinia?.state?.value?.chat?.activeSessionId)
      ?.messages || []).filter(message => message.role === 'assistant')
      .map(message => ({ id: message.id, content: message.content, hasContinuation: Boolean(message.continuation) })),
    continueRunCount: window.__pinia?.state?.value?.runTrace?.runs?.filter(run => run.mode === 'continue').length
  }))
  console.log('[DEBUG:probe-after] ' + JSON.stringify(continuationProbeAfter, null, 2))
  assert(continuationProbe.buttonCount > 0, 'Continuation button is rendered after session binding')
  assert(continuationProbe.activeSessionId === continuationVerified.sessionId, 'Chat store keeps the bound test session active')
  await page.waitForFunction(() => {
    const chatState = window.__pinia?.state?.value?.chat
    const message = chatState?.sessions
      ?.find(session => session.id === chatState.activeSessionId)
      ?.messages
      ?.filter(item => item.role === 'assistant')
      .at(-1)
    return Boolean(message && message.content?.includes('续生成补全的第二段回复'))
  }, null, { timeout: 30000, polling: 250 })
  assert(providerRequests.length >= 1, `Continuation reaches mock provider (${providerRequests.length} calls)`)

  const continuationTrace = await page.evaluate(() => {
    const state = window.__pinia?.state?.value?.runTrace
    const run = state?.runs?.find(item => item.mode === 'continue')
    return {
      found: Boolean(run),
      apiCalls: run?.apiCalls?.length || 0,
      physicalCalls: run?.apiCalls?.[0]?.physicalCalls?.length || 0,
      responseText: run?.apiCalls?.[0]?.responseText || '',
      streamText: run?.apiCalls?.[0]?.streamText || '',
      physicalStreamText: run?.apiCalls?.[0]?.physicalCalls?.[0]?.streamText || '',
      callStatus: run?.apiCalls?.[0]?.status || ''
    }
  })
  assert(continuationTrace.found, 'Continuation run appears in run trace')
  assert(continuationTrace.apiCalls === 1, 'Continuation run records one API call')
  assert(continuationTrace.physicalCalls === 1, 'Continuation run records the physical provider call')
  assert(continuationTrace.responseText.includes('续生成补全的第二段回复'), 'Continuation run records the merged response')
  assert(continuationTrace.streamText.includes('续生成补全的第二段回复') || continuationTrace.physicalStreamText.includes('续生成补全的第二段回复'), 'Continuation run records the streamed delta')

  await page.evaluate(({ config }) => {
    window.electronAPI.storageWrite('wa_providers', config)
  }, { config: continuationVerified.originalProviders })

  await page.click('#btn-editor-run-trace')
  await page.waitForSelector('#run-trace-overlay', { timeout: 5000 })
  assert(true, 'RunTracePanel opens from home editor button')

  await page.waitForSelector('.rt-run', { timeout: 5000 })
  assert(true, 'Run list shows the synthetic run')

  await page.click('.rt-tabs button:nth-child(2)')
  await sleep(300)
  assert(await page.locator('.rt-api').count() > 0, 'API tab renders API call cards')
  const syntheticRunId = await page.evaluate(() => window.__pinia.state.value.runTrace.runs.find(run => run.projectId === 'run-trace-v2-e2e' && run.skillNames?.includes('测试技能'))?.id || '')
  await page.locator(`.rt-run[data-run-id="${syntheticRunId}"]`).click()
  await page.click('.rt-tabs button:nth-child(2)')
  await sleep(300)

  const hasPromptSnapshot = await page.locator('details:has-text("提示词快照")').count()
  assert(hasPromptSnapshot > 0, 'API tab shows prompt snapshot section')
  const hasProcessingReport = await page.locator('details:has-text("处理报告")').count()
  assert(hasProcessingReport > 0, 'API tab shows processing report section')

  await page.click('.rt-tabs button:nth-child(3)')
  await sleep(300)
  const hasToolSummary = await page.locator('.rt-tool-summary').count()
  assert(hasToolSummary > 0, 'Skill tab shows tool summary')

  await page.click('.rt-tabs button:nth-child(1)')
  await sleep(300)
  await page.selectOption('.rt-inline-filters select >> nth=0', 'error')
  await sleep(300)
  const errorEvents = await page.locator('.rt-event.is-error').count()
  const infoEvents = await page.locator('.rt-event.is-info').count()
  assert(errorEvents >= 0 && infoEvents === 0, 'Timeline level filter hides info events')
  await page.selectOption('.rt-inline-filters select >> nth=0', 'all')
  await sleep(300)

  await page.click('.rt-tabs button:nth-child(4)')
  await sleep(300)
  assert(await page.locator('button:has-text("导出标准 JSON")').count() === 1, 'Export tab shows standard export button')
  assert(await page.locator('button:has-text("导出轻量")').count() === 1, 'Export tab shows light export button')
  assert(await page.locator('button:has-text("导出深度")').count() === 1, 'Export tab shows deep export button')

  const exportDirs = {}
  for (const mode of ['standard', 'light', 'deep']) {
    await page.click(`button:has-text("${mode === 'standard' ? '导出标准 JSON' : mode === 'light' ? '导出轻量' : '导出深度'}")`)
    await sleep(2000)
  }

  const entries = fs.readdirSync(EXPORT_BASE).filter(name => name.endsWith('') || name.includes('run-trace'))
  assert(entries.length >= 3, `Export base contains 3+ export directories (got ${entries.length})`)

  for (const name of entries) {
    const dir = path.join(EXPORT_BASE, name)
    if (!fs.statSync(dir).isDirectory()) continue
    const exportJsonPath = path.join(dir, 'export.json')
    if (!fs.existsSync(exportJsonPath)) continue
    const exportJson = JSON.parse(fs.readFileSync(exportJsonPath, 'utf8'))
    exportDirs[exportJson.exportMode] = dir
  }

  for (const mode of ['standard', 'light', 'deep']) {
    assert(exportDirs[mode], `${mode} export directory exists`)
    const runTrace = verifyExportDirectory(exportDirs[mode], mode)
    assert(runTrace.apiCalls.length === 1, `${mode}: has 1 API call`)
    assert(runTrace.promptSnapshots?.length === 1, `${mode}: has 1 prompt snapshot`)
    assert(runTrace.processingReports?.length === 1, `${mode}: has 1 processing report`)
    assert(runTrace.payloads.length > 0, `${mode}: has payload references`)
  }

  const lightRun = verifyExportDirectory(exportDirs.light, 'light')
  const standardRun = verifyExportDirectory(exportDirs.standard, 'standard')
  const isEmptyInline = value => value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
  assert(isEmptyInline(lightRun.apiCalls[0].requestMessages), 'light mode does not inline request messages')
  const standardRequestRef = standardRun.apiCalls[0].requestMessages?.__payload
  assert(Boolean(standardRequestRef), 'standard mode replaces inline request with payload ref object')
  assert(standardRun.payloads.some(ref => ref.id === standardRequestRef.id), 'standard request payload ref matches payloads manifest')

  const savedDir = path.join(DATA_DIR, 'run-trace', 'home')
  assert(fs.existsSync(savedDir), 'Auto-save run directory exists')
  const savedDirs = fs.readdirSync(savedDir).filter(name => fs.statSync(path.join(savedDir, name)).isDirectory())
  assert(savedDirs.length >= 1, 'Auto-save created at least one run directory')
  const savedRunTrace = JSON.parse(fs.readFileSync(path.join(savedDir, savedDirs[0], 'run-trace.json'), 'utf8'))
  assert(savedRunTrace.apiCalls.length === 1, 'Auto-saved run trace has complete data')

  await page.click('#run-trace-panel .modal-close')
  await sleep(500)

  // Rolling cleanup: the 20-run window must remove the oldest on-disk run
  // directory when it is evicted from the Pinia store.
  const firstRunDir = await page.evaluate(async () => {
    const rawStore = window.__pinia._s.get('runTrace')
    const store = rawStore?.value || rawStore
    const id = store.startRun({
      source: 'home',
      stepName: '滚动清理验证',
      mode: 'chat',
      sessionKind: 'chat',
      projectId: 'run-trace-v2-e2e',
      projectName: 'RunTrace V2 E2E'
    })
    await new Promise(resolve => setTimeout(resolve, 500))
    const run = window.__pinia.state.value.runTrace.runs.find(item => item.id === id)
    const rawRun = run ? JSON.parse(JSON.stringify(run)) : null
    if (rawRun) rawRun.dirName = ''
    const saved = rawRun && await window.electronAPI.runTraceSave({
      schema: 'shenyi.run-trace',
      version: 4,
      run: rawRun
    })
    if (saved?.success && saved.dirName) {
      window.__savedRunDirs = window.__savedRunDirs || {}
      window.__savedRunDirs[id] = saved.dirName
      const savedRun = window.__pinia.state.value.runTrace.runs.find(item => item.id === id)
      if (savedRun) savedRun.dirName = saved.dirName
    }
    return saved?.dirName || ''
  })
  assert(firstRunDir.length > 0, 'Rolling cleanup seed run has a disk directory')

  const rollingResult = await page.evaluate(async () => {
    const rawStore = window.__pinia._s.get('runTrace')
    const store = rawStore?.value || rawStore
    const seedId = Object.keys(window.__savedRunDirs || {})[0]
    const seedBeforePressure = store.getRun(seedId)
    const stateBeforePressure = window.__pinia.state.value.runTrace
    const pressureStart = {
      maxRuns: store.maxRuns,
      runCount: stateBeforePressure.runs.length,
      seedIndex: stateBeforePressure.runs.findIndex(run => run.id === seedId)
    }
    for (let i = 0; i < store.maxRuns; i++) {
      store.startRun({
        source: 'home',
        stepName: `滚动压测 ${i + 1}`,
        mode: 'chat',
        sessionKind: 'chat',
        projectId: 'run-trace-v2-e2e',
        projectName: 'RunTrace V2 E2E'
      })
    }
    await new Promise(resolve => setTimeout(resolve, 100))
    store.startRun({
      source: 'home',
      stepName: '滚动压测补充',
      mode: 'chat',
      sessionKind: 'chat',
      projectId: 'run-trace-v2-e2e',
      projectName: 'RunTrace V2 E2E'
    })
    const state = window.__pinia.state.value.runTrace
    return {
      seedStillInStore: Boolean(seedId) && state.runs.some(run => run.id === seedId)
      , seedDirName: window.__savedRunDirs?.[seedId] || ''
      , seedDirNameInStore: seedBeforePressure?.dirName || ''
      , pressureStart
      , pressureEnd: { runCount: state.runs.length, seedIndex: state.runs.findIndex(run => run.id === seedId) }
    }
  })
  assert(rollingResult.seedStillInStore === false, 'Rolling cleanup evicts the seed run from the Pinia window')
  await sleep(2000)
  assert(!fs.existsSync(path.join(DATA_DIR, 'run-trace', 'home', firstRunDir)), 'Rolled-out run directory is deleted from disk')

  // Context reset must be visible in the trace, not only in the chat bubble.
  const contextResetRunId = await page.evaluate(() => {
    const state = window.__pinia.state.value.runTrace
    const rawStore = window.__pinia._s.get('runTrace')
    const store = rawStore?.value || rawStore
    const id = store.startRun({
      source: 'home',
      stepName: '上下文压缩验证',
      mode: 'chat',
      sessionKind: 'chat',
      projectId: 'run-trace-v2-e2e',
      projectName: 'RunTrace V2 E2E'
    })
    store.markContextCompacted(id, 'CDP 验证：上下文已压缩')
    return id
  })
  const contextEvent = await page.evaluate(runId => {
    const run = window.__pinia.state.value.runTrace.runs.find(item => item.id === runId)
    return run?.events?.find(event => event.type === 'context-compacted') || null
  }, contextResetRunId)
  assert(Boolean(contextEvent), 'Context compaction is recorded as a trace event')
  assert(contextEvent?.detail === 'CDP 验证：上下文已压缩', 'Context compaction event keeps user-visible detail')

  console.log('\n===== RUN TRACE V2 E2E VERIFICATION PASSED =====')
}

try {
  await main()
} catch (error) {
  console.error('[FAIL] ' + error.message)
  console.error(error.stack)
  process.exitCode = 1
} finally {
  await cleanup()
}

if (process.exitCode) {
  process.exit(1)
}
