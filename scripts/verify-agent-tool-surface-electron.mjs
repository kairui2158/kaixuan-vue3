import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = path.resolve(import.meta.dirname, '..')
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9285
const MOCK_PORT = 59952
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const PROFILE = path.join(ROOT, '_audit', 'tmp', 'agent-tool-surface-profile')
const OUTPUT_FILE = path.join(ROOT, '_audit', 'verification-agent-tool-surface-electron', 'evidence.json')
const PROJECT_ID = 'agent-tool-surface-project'
const OUTLINE_TEXT = ['第一卷 风暴起点', '第一章 男主发现旧信。', '第二章 男主决定南下。'].join('\n')
const FINAL_BODY = '当前工具面已经收敛：计划工具保留，控制类子 Agent 工具不再暴露。'
const GLOBAL_TIMEOUT_MS = 600_000
const RETIRED_TOOLS = ['agent.spawn', 'agent.wait', 'agent.cancel']
const REQUIRED_TOOLS = ['context.remaining', 'agent.plan']
const WRITE_TOOL_CALL = {
  name: 'editor.write',
  input: {
    commands: [{
      operation: 'replace_match',
      target: '第一章 男主发现旧信。',
      content: '第一章 男主发现祖传旧信。',
    }],
    reveal: { mode: 'instant', firstChange: true },
    reason: '验证工具面收敛后的写入链路',
  },
  id: 'agent-tool-surface-write-1',
}

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

const requests = []
let capturePage = null
let writeToolCallPending = true
let diagnosticSince = Date.now()

function toolCallPayload(call) {
  return {
    choices: [{
      index: 0,
      finish_reason: 'tool_calls',
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [{
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.input) },
        }],
      },
    }],
  }
}

function jsonToolCallResponse(response, call) {
  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify({
    id: 'agent-tool-surface-mock',
    object: 'chat.completion',
    ...toolCallPayload(call),
  }))
}

function sseResponse(response, content) {
  response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' })
  response.end(`data: ${JSON.stringify({
    id: 'agent-tool-surface-mock',
    object: 'chat.completion.chunk',
    choices: [{
      index: 0,
      finish_reason: 'stop',
      delta: { role: 'assistant', content },
    }],
  })}\n\ndata: [DONE]\n\n`)
}

function sseToolCallResponse(response, call) {
  const payload = JSON.stringify(call.input)
  const split = 40
  response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' })
  response.write(`data: ${JSON.stringify({
    id: 'agent-tool-surface-mock',
    object: 'chat.completion.chunk',
    choices: [{
      index: 0,
      finish_reason: null,
      delta: {
        role: 'assistant',
        tool_calls: [{
          index: 0,
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: payload.slice(0, split) },
        }],
      },
    }],
  })}\n\n`)
  response.write(`data: ${JSON.stringify({
    id: 'agent-tool-surface-mock',
    object: 'chat.completion.chunk',
    choices: [{
      index: 0,
      finish_reason: null,
      delta: {
        tool_calls: [{
          index: 0,
          function: { arguments: payload.slice(split) },
        }],
      },
    }],
  })}\n\n`)
  response.write(`data: ${JSON.stringify({
    id: 'agent-tool-surface-mock',
    object: 'chat.completion.chunk',
    choices: [{ index: 0, finish_reason: 'tool_calls', delta: {} }],
  })}\n\ndata: [DONE]\n\n`)
  response.end()
}

function sseBodyResponse(response) {
  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify({
    id: 'agent-tool-surface-mock',
    object: 'chat.completion',
    choices: [{
      index: 0,
      finish_reason: 'stop',
      message: { role: 'assistant', content: FINAL_BODY },
    }],
  }))
}

function jsonIntentResponse(response) {
  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify({
    id: 'agent-tool-surface-mock-intent',
    object: 'chat.completion',
    choices: [{
      index: 0,
      finish_reason: 'stop',
      message: {
        role: 'assistant',
        content: '{"intent":"analyze","confidence":0.98,"reason":"请求分析写作状态"}',
      },
    }],
  }))
}

async function collectTraceDiagnostics(page, since) {
  if (!capturePage) return []
  return page.evaluate(sinceTimestamp => {
    const store = window.__pinia?.state?.value?.runTrace
    const runs = Array.isArray(store?.runs) ? store.runs : []
    return runs
      .filter(item => item.startedAt > sinceTimestamp)
      .map(item => ({
        source: item.source,
        status: item.status,
        reason: item.reason,
        events: (item.events || []).map(event => ({
          type: event.type,
          label: event.label,
          payload: event.payload,
        })),
        toolCalls: (item.apiCalls || []).flatMap(call => (call.toolCalls || []).map(tool => ({
          name: tool.name,
          status: tool.status,
          error: tool.error || null,
          input: tool.input,
        }))),
      }))
  }, since).catch(error => [{ collectionError: String(error) }])
}

const providerServer = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    let body = null
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    const toolNames = (Array.isArray(body?.tools) ? body.tools : [])
      .map(tool => tool?.function?.name || tool?.name)
      .filter(Boolean)
    const messages = Array.isArray(body?.messages) ? body.messages : []
    const systemMessage = messages.find(message => message?.role === 'system')
    const systemContent = typeof systemMessage?.content === 'string' ? systemMessage.content : ''
    const isIntentFallbackRequest = body?.stream === false
      && body?.reasoning_effort === 'none'
      && messages.length === 2
      && systemContent.startsWith('你是小说创作工作台的意图分类器。')
    requests.push({
      url: request.url,
      stream: body?.stream === true,
      messageCount: Array.isArray(body?.messages) ? body.messages.length : 0,
      maxTokens: body?.max_tokens ?? body?.maxTokens ?? null,
      reasoningEffort: body?.reasoning_effort ?? null,
      systemPromptPrefix: systemContent.slice(0, 40),
      intentFallback: isIntentFallbackRequest,
      toolNames,
    })
    console.log(`[MOCK] url=${request.url} kind=${isIntentFallbackRequest ? 'intent-fallback' : 'tool-exchange'} stream=${body?.stream === true} messages=${messages.length} max_tokens=${body?.max_tokens ?? '-'} reasoning=${body?.reasoning_effort ?? '-'} tools=${toolNames.join(',') || '-'}`)
    const shouldReturnWrite = writeToolCallPending && toolNames.includes(WRITE_TOOL_CALL.name)
    if (shouldReturnWrite) writeToolCallPending = false
    if (shouldReturnWrite) {
      if (body?.stream === false) jsonToolCallResponse(response, WRITE_TOOL_CALL)
      else sseToolCallResponse(response, WRITE_TOOL_CALL)
    } else if (isIntentFallbackRequest) {
      jsonIntentResponse(response)
    } else if (body?.stream === false) {
      sseBodyResponse(response)
    } else {
      sseResponse(response, FINAL_BODY)
    }
  })
})

const watchdog = setTimeout(() => {
  console.error(`[TIMEOUT] Agent tool surface Electron verification exceeded ${GLOBAL_TIMEOUT_MS}ms`)
  process.exit(1)
}, GLOBAL_TIMEOUT_MS)
watchdog.unref()

function startElectron() {
  return spawn(ELECTRON_EXE, [
    ROOT,
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

async function closeElectron(app) {
  if (!app || app.exitCode !== null) return
  try { execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
}

async function closeVisibleModals(page) {
  await page.evaluate(() => {
    document.querySelector('.project-modal-content .btn-close')?.click()
  })
  await sleep(300)
}

async function seedStorage(page) {
  await page.evaluate(async ({ mockUrl, outline, projectId }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'agent-tool-surface-provider',
        name: 'Agent Tool Surface Mock',
        baseUrl: mockUrl,
        apiKey: 'key',
        models: ['agent-tool-surface-model'],
        selectedModel: 'agent-tool-surface-model',
        temperature: 0.1,
        maxTokens: 4096,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
      }],
      generateProvider: 'agent-tool-surface-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: 'Agent Tool Surface E2E',
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
  }, { mockUrl: MOCK_BASE_URL, outline: OUTLINE_TEXT, projectId: PROJECT_ID })
}

async function prepareOutlineEditor(page) {
  await page.click('#btn-outline-workspace')
  await page.waitForSelector('#outline-editor', { timeout: 10_000 })
  // The seeded project already owns the outline. Focus/blur proves the real
  // textarea is present; we do not overwrite business state here.
  await page.focus('#outline-editor')
  await page.evaluate(() => document.activeElement?.blur?.())
  const contentLength = await page.evaluate(() =>
    window.__pinia?.state?.value?.project?.outlineText?.length ?? -1)
  assert.equal(contentLength, OUTLINE_TEXT.length, 'seeded outline is loaded into store')
}

async function readLatestRun(page, source, since) {
  return page.evaluate(({ sourceName, sinceTimestamp }) => {
    const store = window.__pinia?.state?.value?.runTrace
    const runs = Array.isArray(store?.runs) ? store.runs : []
    const run = runs
      .filter(item => item.source === sourceName && item.startedAt > sinceTimestamp)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    if (!run) return null
    return {
      status: run.status,
      sessionKind: run.sessionKind,
      hasCurrentTurn: Boolean(run.currentTurnId),
      turns: (run.turns || []).map(turn => ({ status: turn.status })),
      calls: run.apiCalls.map(call => ({
        status: call.status,
        responseText: call.responseText || '',
        toolSurface: call.toolSurface || [],
        actualToolSurface: call.actualToolSurface || [],
        physicalCalls: call.physicalCalls.map(physical => ({ status: physical.status })),
      })),
    }
  }, { sourceName: source, sinceTimestamp: since })
}

function verifyScenario(label, run, scenarioRequests) {
  assert(run, `${label}: run trace exists`)
  if (run.sessionKind === 'chat') {
    assert(!run.hasCurrentTurn, `${label}: chat run has no open turn`)
    assert((run.turns || []).some(turn => turn.status === 'success'), `${label}: chat turn succeeds`)
  } else {
    assert.equal(run.status, 'success', `${label}: run succeeds`)
  }
  assert(run.calls.length >= 1, `${label}: logical API call exists`)
  const call = run.calls[0]
  assert(call.status !== 'running', `${label}: logical call closes`)
  assert(call.physicalCalls.every(physical => physical.status !== 'running'), `${label}: physical call closes`)
  assert(call.responseText.includes(FINAL_BODY), `${label}: response reaches trace`)
  const traceNames = call.actualToolSurface.map(tool => tool.name)
  for (const name of RETIRED_TOOLS) {
    assert(!traceNames.includes(name), `${label}: trace tool surface excludes ${name}`)
  }
  for (const name of REQUIRED_TOOLS) {
    assert(traceNames.includes(name), `${label}: trace tool surface includes ${name}`)
  }
  const toolExchangeRequests = scenarioRequests.filter(request => !request.intentFallback)
  const intentFallbackRequests = scenarioRequests.filter(request => request.intentFallback)
  for (const request of intentFallbackRequests) {
    assert.deepEqual(request.toolNames, [], `${label}: intent fallback request carries no tools`)
  }
  assert(toolExchangeRequests.length >= 1, `${label}: tool exchange request exists`)
  for (const request of toolExchangeRequests) {
    for (const name of RETIRED_TOOLS) {
      assert(!request.toolNames.includes(name), `${label}: provider request excludes ${name}`)
    }
    for (const name of REQUIRED_TOOLS) {
      assert(request.toolNames.includes(name), `${label}: provider request includes ${name}`)
    }
  }
}

async function waitForSendEnabled(page, selector) {
  await page.waitForFunction(selectorName => {
    const button = document.querySelector(selectorName)
    return Boolean(button && !button.disabled)
  }, selector, { timeout: 120_000, polling: 200 })
}

async function waitForWriteExecuted(page, since) {
  await page.waitForFunction(({ sourceName, sinceTimestamp }) => {
    const store = window.__pinia?.state?.value?.runTrace
    const runs = Array.isArray(store?.runs) ? store.runs : []
    return runs
      .filter(item => item.source === sourceName && item.startedAt > sinceTimestamp)
      .some(item => (item.apiCalls || []).some(call =>
        (call.toolCalls || []).some(tool => tool.name === 'editor.write' && tool.status === 'success')))
  }, { sourceName: 'outline', sinceTimestamp: since }, { timeout: 120_000, polling: 200 })
}

async function runOutlineScenario(page) {
  const startedAt = Date.now()
  diagnosticSince = startedAt
  const requestStart = requests.length
  await prepareOutlineEditor(page)
  await page.click('#btn-ai-co-create')
  await page.waitForSelector('#ow-chat-input', { timeout: 10_000 })
  await page.fill('#ow-chat-input', '请修改第一章：把“旧信”改成“祖传旧信”，只保留这一处修改')
  await page.evaluate(() => document.activeElement?.blur?.())
  await sleep(300)
  await page.click('#btn-ow-send')
  await waitForWriteExecuted(page, startedAt)
  await page.waitForFunction(body => {
    const container = document.querySelector('#ow-chat-messages')
    return Boolean(container && container.textContent && container.textContent.includes(body))
  }, FINAL_BODY, { timeout: 120_000, polling: 200 })
  const run = await readLatestRun(page, 'outline', startedAt)
  verifyScenario('outline', run, requests.slice(requestStart))
  await page.click('#btn-close-outline-workspace')
  await page.waitForSelector('#outline-workspace', { state: 'detached', timeout: 10_000 })
}

async function runHomeScenario(page) {
  const startedAt = Date.now()
  diagnosticSince = startedAt
  const requestStart = requests.length
  await page.waitForSelector('#user-input', { timeout: 10_000 })
  await page.fill('#user-input', '请分析当前写作状态并给出下一步计划')
  await page.evaluate(() => document.activeElement?.blur?.())
  await sleep(300)
  await page.click('#btn-send')
  await waitForSendEnabled(page, '#btn-send')
  const visibleText = await page.evaluate(() => document.querySelector('#messages-list')?.textContent || '')
  assert(visibleText.includes(FINAL_BODY), 'home UI shows final body')
  const run = await readLatestRun(page, 'home', startedAt)
  verifyScenario('home', run, requests.slice(requestStart))
}

const evidence = {
  schema: 'shenyi.agent-tool-surface.electron',
  version: 1,
  generatedAt: new Date().toISOString(),
  checks: [],
  requests: [],
  verdict: 'fail',
}

async function failFast(error) {
  evidence.error = String(error?.stack || error)
  console.error('===== AGENT TOOL SURFACE ELECTRON VERIFICATION FAILED =====')
  console.error(evidence.error)
  process.exitCode = 1
}

async function main() {
  assertFreshRendererBuild()
  removeDir(PROFILE)
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true })
  await new Promise(resolve => providerServer.listen(MOCK_PORT, '127.0.0.1', resolve))

  let app = null
  let browser = null
  try {
    console.log('[stage] launch Electron')
    app = startElectron()
    app.stdout?.on('data', chunk => process.stdout.write(`[app:stdout] ${chunk}`))
    app.stderr?.on('data', chunk => process.stderr.write(`[app:stderr] ${chunk}`))
    assert(await waitForCdp(), 'CDP reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    const context = browser.contexts()[0]
    const page = context.pages().at(-1) || await context.newPage()
    capturePage = page
    page.on('console', message => {
      if (message.type() === 'warning') console.log(`[page:warn] ${message.text()}`)
    })
    const pageErrors = []
    page.on('pageerror', error => pageErrors.push(error.message))
    page.on('console', message => {
      if (message.type() === 'error') pageErrors.push(`console: ${message.text()}`)
    })

    await page.waitForFunction(() => Boolean(window.electronAPI), null, { timeout: 30_000, polling: 200 })
    await page.waitForSelector('#app', { timeout: 20_000 })
    await sleep(1_000)
    await closeVisibleModals(page)
    await seedStorage(page)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#app', { timeout: 20_000 })
    await sleep(1_000)
    await closeVisibleModals(page)

    console.log('[stage] outline workspace')
    await runOutlineScenario(page)
    evidence.checks.push('outline: provider request and trace exclude agent.spawn/wait/cancel, include context.remaining/agent.plan; run closes')

    console.log('[stage] home editor')
    await runHomeScenario(page)
    evidence.checks.push('home: provider request and trace exclude agent.spawn/wait/cancel, include context.remaining/agent.plan; run closes')

    assert.deepEqual(pageErrors, [], `renderer errors: ${pageErrors.join(' | ')}`)
    evidence.requests = requests.map(request => ({ ...request }))
    evidence.verdict = 'pass'
    console.log('===== AGENT TOOL SURFACE ELECTRON VERIFICATION PASSED =====')
  } catch (error) {
    await failFast(error)
    evidence.diagnostics = await collectTraceDiagnostics(capturePage, diagnosticSince)
  } finally {
    try { if (browser) await browser.close() } catch {}
    await closeElectron(app)
    await new Promise(resolve => providerServer.close(resolve))
    removeDir(PROFILE)
    fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
    console.log(`[evidence] ${path.relative(ROOT, OUTPUT_FILE)}`)
  }
}

main().catch(async error => {
  await failFast(error)
})
