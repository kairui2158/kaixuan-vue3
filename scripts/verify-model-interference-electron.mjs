import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = path.resolve(import.meta.dirname, '..')
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const MOCK_PORT = 59973
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const PROFILE = path.join(ROOT, '_audit', 'tmp', 'model-interference-profile')
const OUTPUT_FILE = path.join(ROOT, '_audit', 'verification-model-interference-electron', 'evidence.json')
const GLOBAL_TIMEOUT_MS = 300_000
const PROJECT_ID = 'model-interference-project'

let activeApp = null
let activeBrowser = null
let failFastStarted = false
let electronExit = null
let electronSpawnError = null

const apiRequests = []

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

function buildStreamText() {
  const parts = []
  for (let index = 0; index < 36; index++) {
    parts.push(`第${index + 1}段：工具轮实时滚动验证，这一段用于确认模型正文会持续进入对话框，而不是只显示工具调用或等待状态。`)
  }
  return parts.join('\n')
}

const STREAM_TEXT = buildStreamText()
assert(STREAM_TEXT.length > 1000, `stream text must be long enough, got ${STREAM_TEXT.length}`)

let mockPhase = 'text'
let mockScenarioRequests = 0

function setMockPhase(phase) {
  mockPhase = phase
  mockScenarioRequests = 0
}

function sseChunk(text) {
  return `data: ${JSON.stringify({
    id: 'model-interference-mock',
    object: 'chat.completion.chunk',
    choices: [{
      index: 0,
      finish_reason: null,
      delta: { role: 'assistant', content: text },
    }],
  })}\n\n`
}

function writeToolPayload() {
  return JSON.stringify({
    commands: [{
      operation: 'replace_match',
      target: '第一段：旧句。',
      content: '第一段：新句。',
      reason: '模型干扰治理验证：真实工具调用写入',
    }],
    reveal: { mode: 'instant', firstChange: true },
    reason: '模型干扰治理验证：真实工具调用写入',
  })
}

async function streamResponse(response, chunks) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  for (const chunk of chunks) {
    response.write(sseChunk(chunk))
    await sleep(20)
  }
  response.write(`data: ${JSON.stringify({
    id: 'model-interference-mock',
    object: 'chat.completion.chunk',
    choices: [{ index: 0, finish_reason: 'stop', delta: {} }],
  })}\n\n`)
  response.write('data: [DONE]\n\n')
  response.end()
}

async function streamToolResponse(response) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  const payload = writeToolPayload()
  const chunks = [
    { tool_calls: [{ index: 0, id: 'model-interference-write-1', type: 'function', function: { name: 'editor.write', arguments: payload.slice(0, 40) } }] },
    { tool_calls: [{ index: 0, function: { name: 'editor.write', arguments: payload.slice(40) } }] },
  ]
  for (const chunk of chunks) {
    response.write(`data: ${JSON.stringify({
      id: 'model-interference-mock',
      object: 'chat.completion.chunk',
      choices: [{ index: 0, finish_reason: null, delta: { role: 'assistant', content: '', ...chunk } }],
    })}\n\n`)
    await sleep(20)
  }
  response.write(`data: ${JSON.stringify({
    id: 'model-interference-mock',
    object: 'chat.completion.chunk',
    choices: [{ index: 0, finish_reason: 'tool_calls', delta: {} }],
  })}\n\n`)
  response.write('data: [DONE]\n\n')
  response.end()
}

function splitStreamText() {
  const chunks = []
  const pieceLength = 80
  for (let start = 0; start < STREAM_TEXT.length; start += pieceLength) {
    chunks.push(STREAM_TEXT.slice(start, start + pieceLength))
  }
  return chunks
}

const providerServer = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    let body = null
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    const systemMessages = [...(body?.messages || [])].filter(message => message?.role === 'system')
    const requestRecord = {
      url: request.url,
      model: body?.model || null,
      stream: body?.stream === true,
      messageCount: Array.isArray(body?.messages) ? body.messages.length : 0,
      systemText: systemMessages.map(message => String(message.content || '')).join('\n\n'),
      tools: Array.isArray(body?.tools)
        ? body.tools.map(tool => tool?.function?.name || tool?.name || null)
        : [],
    }
    apiRequests.push(requestRecord)
    requestRecord.seq = apiRequests.length
    requestRecord.phase = mockPhase
    requestRecord.scenarioRequestIndex = mockScenarioRequests + 1
    requestRecord.hasAssistantToolResult = (body?.messages || []).some(message =>
      message?.role === 'tool' || Array.isArray(message?.tool_calls))
    mockScenarioRequests += 1
    console.log(`[MOCK] ${request.url} model=${requestRecord.model} stream=${requestRecord.stream} messages=${requestRecord.messageCount}`)

    if (request.url?.includes('/chat/completions')) {
      if (requestRecord.stream) {
        if (mockPhase === 'write-tool-first' && mockScenarioRequests === 1) {
          void streamToolResponse(response)
        } else {
          void streamResponse(response, splitStreamText())
        }
        return
      }
      if (mockPhase === 'write-tool-first' && mockScenarioRequests === 1) {
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({
          id: 'model-interference-mock',
          object: 'chat.completion',
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [{
                id: 'model-interference-write-1',
                type: 'function',
                function: { name: 'editor.write', arguments: writeToolPayload() },
              }],
            },
            finish_reason: 'tool_calls',
          }],
        }))
        return
      }
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({
        id: 'model-interference-mock',
        object: 'chat.completion',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: STREAM_TEXT },
          finish_reason: 'stop',
        }],
      }))
      return
    }
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify({ object: 'list', data: [{ id: 'model-interference-model' }] }))
  })
})

const watchdog = setTimeout(() => {
  void failFast(new Error(`model interference verification exceeded ${GLOBAL_TIMEOUT_MS}ms`))
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

async function closeElectron(app) {
  if (!app || app.exitCode !== null) return
  try { execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
}

async function waitForCdpPort(getOutput) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const output = getOutput() || ''
    const match = output.match(/(?:Remote debugging|DevTools) listening on ws:\/\/127\.0\.0\.1:(\d+)\//)
    if (match) return Number(match[1])
    await sleep(250)
  }
  throw new Error(`CDP port not found\n${String(getOutput() || '').slice(-2000)}`)
}

async function waitForPageReady(page) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      if (await page.evaluate(() => Boolean(window.electronAPI))) return
    } catch {}
    await sleep(200)
  }
  throw new Error('renderer did not expose electronAPI')
}

async function closeVisibleModals(page) {
  await page.evaluate(() => {
    document.querySelector('.project-modal-content .btn-close')?.click()
  })
  await sleep(400)
}

async function seedStorage(page) {
  await page.evaluate(async ({ mockUrl, projectId }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'model-interference-provider',
        name: 'Model Interference Mock',
        baseUrl: mockUrl,
        apiKey: 'mock-key',
        models: ['model-interference-model'],
        selectedModel: 'model-interference-model',
        temperature: 0.1,
        maxTokens: 128000,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
      }],
      generateProvider: 'model-interference-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: '模型干扰治理实测',
      outlineText: '第一段：旧句。\n第二段：验证正文。',
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
    await window.electronAPI.storageWrite('wa_skills', { skills: [] })
    await window.electronAPI.storageWrite('wa_co_creation_config', {
      agentId: '',
      skillIds: [],
      mode: 'compose',
      skillAgents: {},
    })
  }, { mockUrl: MOCK_BASE_URL, projectId: PROJECT_ID })
}

async function prepareEditorTab(page) {
  await page.evaluate(() => {
    const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
    if (!pinia) throw new Error('pinia unavailable')
    const store = pinia._s.get('editor')
    store.tabs.splice(0)
    store.openTab({
      id: 'model-interference-editor',
      title: '模型干扰治理实测',
      content: '第一段：旧句。\n第二段：验证正文。',
      chapterId: '',
      isDirty: false,
      mode: 'ch-body',
    })
    store.activeTabId = 'model-interference-editor'
  })
  await page.waitForSelector('#editor-content', { timeout: 10_000 })
  await sleep(300)
}

async function sendMessageAndObserve(page, text) {
  const requestCountBefore = apiRequests.length
  await page.waitForSelector('#user-input', { timeout: 10_000 })
  await page.locator('#user-input').fill(text)
  await page.locator('#user-input').evaluate(element => element.dispatchEvent(new Event('change', { bubbles: true })))
  await page.click('#btn-send')

  const statusSamples = []
  const messageLengthSamples = []
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    const sample = await page.evaluate(() => {
      const status = document.querySelector('#chat-generation-status')
      const send = document.querySelector('#btn-send')
      const lastMessage = [...document.querySelectorAll('#messages-list .chat-message')].at(-1)
      return {
        statusText: status?.textContent?.trim() || '',
        statusVisible: Boolean(status),
        sendEnabled: Boolean(send && !send.disabled),
        messageText: lastMessage?.textContent?.trim() || '',
      }
    })
    if (sample.statusText && !statusSamples.at(-1)?.text) {
      statusSamples.push({ at: Date.now(), text: sample.statusText })
    }
    if (sample.messageText.length > (messageLengthSamples.at(-1)?.length || 0)) {
      messageLengthSamples.push({ at: Date.now(), length: sample.messageText.length })
    }
    if (sample.sendEnabled && !sample.statusVisible && sample.messageText.length > 1000) break
    await sleep(80)
  }

  await page.waitForSelector('#btn-send', { timeout: 30_000 })
  await page.waitForFunction(() => {
    const send = document.querySelector('#btn-send')
    return Boolean(send && !send.disabled)
  }, null, { timeout: 30_000, polling: 200 })
  await sleep(500)

  return {
    statusSamples,
    messageLengthSamples,
    requestCount: apiRequests.length - requestCountBefore,
  }
}

async function inspectLatestTrace(page, requestText) {
  return await page.evaluate(request => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])]
      .filter(item => item.source === 'home')
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    const turn = [...(run?.turns || [])]
      .filter(item => item.userRequest === request)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    return {
      runId: run?.id || null,
      runStatus: run?.status || null,
      turnStatus: turn?.status || null,
      turnReason: turn?.reason || null,
      turnError: turn?.error || null,
      turnToolCallCount: turn?.toolCallCount ?? 0,
      turnApiCallIds: [...(turn?.apiCallIds || [])],
      intent: turn?.intent || null,
      runStateHistory: (run?.stateHistory || []).map(item => ({
        fromStatus: item.fromStatus,
        toStatus: item.toStatus,
        reason: item.reason || null,
      })),
      apiCalls: (run?.apiCalls || [])
        .filter(call => !turn || call.turnId === turn.id)
        .map(call => ({
          status: call.status,
          textOrigin: call.textOrigin || 'model',
          responseTextLength: String(call.responseText || '').length,
          streamTextLength: String(call.streamText || '').length,
          requestSystemText: (call.requestMessages || [])
            .filter(message => message.role === 'system')
            .map(message => String(message.content || ''))
            .join('\n\n'),
          toolSurface: call.actualToolSurface || [],
          finishReason: call.finishReason || null,
          error: call.error || null,
          physicalCalls: (call.physicalCalls || []).map(physical => ({
            seq: physical.seq,
            phase: physical.phase,
            status: physical.status,
            finishReason: physical.finishReason || null,
            error: physical.error || null,
          })),
          toolCalls: (call.toolCalls || []).map(tool => ({
            name: tool.name,
            status: tool.status,
            errorCode: tool.errorCode || null,
            input: tool.input,
          })),
        })),
      declarationEvents: (run?.events || [])
        .filter(event => event.type === 'dialogue-tool-surface-declaration')
        .map(event => JSON.parse(String(event.detail || '{}'))),
      failureEvents: (run?.events || [])
        .filter(event => event.level === 'warn' || event.level === 'error')
        .map(event => ({
          type: event.type,
          label: event.label,
          detail: String(event.detail || '').slice(0, 500),
        })),
    }
  }, requestText)
}

async function sealChatSessionThroughUi(page) {
  const requestCountBefore = apiRequests.length
  await page.waitForSelector('#btn-reset-conversation', { timeout: 10_000 })
  await page.click('#btn-reset-conversation')
  await page.waitForSelector('[data-modal-id="app-confirm"] button.btn-danger', { timeout: 10_000 })
  await page.click('[data-modal-id="app-confirm"] button.btn-danger')

  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const sealed = await page.evaluate(() => {
      const store = window.__pinia?._s?.get('runTrace')
      const run = [...(store?.runs || [])]
        .filter(item => item.source === 'home')
        .sort((a, b) => b.startedAt - a.startedAt)[0]
      return { runStatus: run?.status || null, notice: document.querySelector('#chat-compatibility-notice')?.textContent || '' }
    })
    if (sealed.runStatus === 'success' && sealed.notice.includes('上下文已重置')) {
      return sealed
    }
    await sleep(100)
  }
  throw new Error(`chat session did not seal through reset UI; requests since reset=${apiRequests.length - requestCountBefore}`)
}

async function verifyHomeTurn(page, task) {
  setMockPhase(task.mockPhase || 'text')
  const observed = await sendMessageAndObserve(page, task.user)
  assert(observed.requestCount >= 1, `${task.id}: at least one provider request is made`)
  assert(apiRequests.slice(-observed.requestCount).some(request => request.stream), `${task.id}: provider request uses streaming`)

  const streamingRequests = apiRequests.slice(-observed.requestCount).filter(request => request.stream)
  const requestWithDeclaration = streamingRequests.find(request => request.systemText.includes('本轮实际可调用的工具：'))
  assert(requestWithDeclaration, `${task.id}: system prompt carries the tool surface declaration`)
  assert(requestWithDeclaration.systemText.includes(task.expectedDeclaration), `${task.id}: declaration is factual (${task.expectedDeclaration})`)
  assert(!requestWithDeclaration.systemText.includes('禁止声称没有权限'), `${task.id}: old permission prohibition is absent`)
  assert(!requestWithDeclaration.systemText.includes('必须调用 editor.write'), `${task.id}: old mandatory write instruction is absent`)

  assert(observed.messageLengthSamples.length >= 3, `${task.id}: streamed message grows at least three times, got ${observed.messageLengthSamples.length}`)
  assert(observed.statusSamples.length >= 1, `${task.id}: live generation status is visible while streaming`)

  const trace = await inspectLatestTrace(page, task.user)
  if (trace.turnStatus !== 'success') {
    evidence.failureTrace = trace
    evidence.requests = serializeRequests(apiRequests)
    writeEvidenceSnapshot()
  }
  assert(trace.runId, `${task.id}: home run trace exists`)
  assert.equal(trace.runStatus, 'running', `${task.id}: chat run stays aggregated while session is active`)
  assert.equal(trace.turnStatus, 'success', `${task.id}: turn closes successfully`)
  assert(trace.apiCalls.length >= 1, `${task.id}: API call is recorded`)
  assert(trace.apiCalls.every(call => call.status !== 'running'), `${task.id}: API calls close`)
  assert(trace.apiCalls.every(call => call.textOrigin === 'model'), `${task.id}: model response is not mislabeled as application text`)
  assert(trace.apiCalls.some(call => call.responseTextLength >= STREAM_TEXT.length - 100), `${task.id}: response text is retained in trace`)
  assert(trace.apiCalls.some(call => call.requestSystemText.includes(task.expectedDeclaration)), `${task.id}: trace request messages retain the factual declaration`)

  const declaration = trace.declarationEvents.at(-1)
  assert(declaration, `${task.id}: declaration audit event exists`)
  assert.equal(declaration.origin, 'application', `${task.id}: declaration audit marks application origin`)
  assert.equal(declaration.visibleToModel, true, `${task.id}: declaration audit marks model visibility`)
  assert(String(declaration.text || '').includes(task.expectedDeclaration), `${task.id}: declaration audit text is factual`)

  if (task.expectWriteTool) {
    assert(trace.apiCalls.some(call => call.toolSurface.some(tool => tool.name === 'editor.write' && tool.policy === 'write')), `${task.id}: write tool is present in trace`)
    assert(streamingRequests.some(request => request.tools.includes('editor.write')), `${task.id}: write tool is sent to provider`)
  } else {
    assert(trace.apiCalls.every(call => !call.toolSurface.some(tool => tool.policy === 'write')), `${task.id}: read-only turn exposes no write tool`)
    assert(streamingRequests.every(request => !request.tools.includes('editor.write')), `${task.id}: provider request carries no write tool`)
  }

  const finalMessage = await page.evaluate(() => {
    const lastMessage = [...document.querySelectorAll('#messages-list .chat-message')].at(-1)
    return lastMessage?.textContent?.trim() || ''
  })
  assert(finalMessage.includes('工具轮实时滚动验证'), `${task.id}: final model text is visible in chat UI`)
  assert(!finalMessage.includes('editor.read'), `${task.id}: chat UI does not show tool-call noise`)
  assert(!finalMessage.includes('本轮未写入'), `${task.id}: chat UI does not show local fallback text`)

  return {
    id: task.id,
    requestCount: observed.requestCount,
    streamRequests: streamingRequests.length,
    messageGrowthSamples: observed.messageLengthSamples.map(sample => sample.length),
    statusSamples: observed.statusSamples.map(sample => sample.text),
    traceCalls: trace.apiCalls.length,
    textOrigins: trace.apiCalls.map(call => call.textOrigin),
    declarationOrigin: declaration.origin,
    visibleToModel: declaration.visibleToModel,
    toolSurface: trace.apiCalls.at(-1)?.toolSurface || [],
  }
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
  schema: 'shenyi.model-interference.electron',
  version: 1,
  generatedAt: new Date().toISOString(),
  checks: [],
  requests: [],
  verdict: 'fail',
}

function serializeRequests(requests) {
  return requests.map(request => ({
    seq: request.seq,
    phase: request.phase,
    scenarioRequestIndex: request.scenarioRequestIndex,
    model: request.model,
    stream: request.stream,
    messageCount: request.messageCount,
    toolCount: request.tools.length,
    toolNames: request.tools,
    declarationPresent: request.systemText.includes('本轮实际可调用的工具：'),
    writeToolPresent: request.tools.includes('editor.write'),
    hasAssistantToolResult: request.hasAssistantToolResult,
  }))
}

function writeEvidenceSnapshot() {
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true })
  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
}

async function failFast(error) {
  if (failFastStarted) return
  failFastStarted = true
  evidence.error = String(error?.stack || error)
  evidence.requests = serializeRequests(apiRequests)
  console.error('===== MODEL INTERFERENCE ELECTRON VERIFICATION FAILED =====')
  console.error(evidence.error)
  try {
    if (activeBrowser) await activeBrowser.close().catch(() => {})
    await closeElectron(activeApp)
    removeDir(PROFILE)
  } finally {
    writeEvidenceSnapshot()
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
  try {
    console.log('[stage] launch visible Electron')
    app = startElectron()
    activeApp = app
    let processOutput = ''
    app.stdout?.on('data', chunk => { processOutput += String(chunk) })
    app.stderr?.on('data', chunk => { processOutput += String(chunk) })
    app.on('error', error => { electronSpawnError = error })
    app.on('exit', (code, signal) => { electronExit = { code, signal } })
    const cdpPort = await waitForCdpPort(() => `spawnError=${electronSpawnError ? String(electronSpawnError.stack || electronSpawnError) : 'none'}; exit=${electronExit ? JSON.stringify(electronExit) : 'none'}; output=${processOutput}`)
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`)
    activeBrowser = browser
    const page = browser.contexts()[0]?.pages()?.at(-1) || await browser.contexts()[0].newPage()
    const pageErrors = []
    page.on('pageerror', error => pageErrors.push(error.message))
    page.on('console', message => {
      if (['error', 'warning'].includes(message.type())) pageErrors.push(`${message.type()}: ${message.text()}`)
    })

    await waitForPageReady(page)
    await page.waitForSelector('#app', { timeout: 20_000 })
    await sleep(1000)
    await closeVisibleModals(page)
    await seedStorage(page)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#app', { timeout: 20_000 })
    await sleep(1000)
    await closeVisibleModals(page)
    await prepareEditorTab(page)

    console.log('[stage] edit-intent tool round')
    evidence.checks.push(await verifyHomeTurn(page, {
      id: 'edit-intent',
      user: '请把当前编辑器第一段里的“旧句”改成“新句”，并直接写入编辑器。',
      expectedDeclaration: '本轮工具面包含 editor.write(write)。',
      expectWriteTool: true,
      mockPhase: 'write-tool-first',
    }))

    console.log('[stage] discuss-intent read-only round')
    evidence.checks.push(await verifyHomeTurn(page, {
      id: 'discuss-intent',
      user: '请分析当前文章的结构和叙事节奏，只讨论，不修改内容。',
      expectedDeclaration: '本轮工具面未包含 editor.write。',
      expectWriteTool: false,
      mockPhase: 'text',
    }))

    console.log('[stage] seal chat session through real reset UI')
    const sealedSession = await sealChatSessionThroughUi(page)
    assert.equal(sealedSession.runStatus, 'success', 'chat run closes successfully after real reset')
    evidence.checks.push({
      id: 'chat-session-seal',
      runStatus: sealedSession.runStatus,
      notice: sealedSession.notice,
    })

    assert.deepEqual(pageErrors, [], `renderer errors: ${pageErrors.join(' | ')}`)
    evidence.requests = serializeRequests(apiRequests)
    evidence.verdict = 'pass'
    console.log('===== MODEL INTERFERENCE ELECTRON VERIFICATION PASSED =====')
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
