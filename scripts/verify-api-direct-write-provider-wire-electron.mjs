import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = path.resolve(import.meta.dirname, '..')
const ELECTRON_EXE = process.env.SHENYI_DIRECT_WRITE_ELECTRON
  ? path.resolve(process.env.SHENYI_DIRECT_WRITE_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9283
const MOCK_PORT = 59937
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const PROFILE = path.join(ROOT, '_data', 'provider-wire-electron-profile')
const REPORT_DIR = path.join(ROOT, '_audit', 'verification-api-direct-write-electron')
const REPORT_PATH = path.join(REPORT_DIR, 'provider-wire-matrix.json')
const PROJECT_ID = 'provider-wire-electron-project'

const OUTLINE = [
  '第一卷 灯塔旧信',
  '第二章：男主抵达灯塔，发现旧信。',
  '第三章：男主确认旧信来源。',
].join('\n')

const PROVIDERS = [
  {
    id: 'wire-openai',
    type: 'openai-compatible',
    baseUrl: MOCK_BASE_URL,
    expectedHeader: { name: 'authorization', value: 'Bearer provider-wire-key' },
    expectedToolCallId: 'wire-openai-tool-1',
    expectedFinishReason: 'stop',
    expectedToolLoopFinishReason: 'tool_calls',
    expectedUsage: { inputTokens: 111, outputTokens: 22, totalTokens: 133 },
  },
  {
    id: 'wire-anthropic',
    type: 'anthropic',
    baseUrl: MOCK_BASE_URL,
    expectedHeader: { name: 'x-api-key', value: 'provider-wire-key' },
    expectedToolCallId: 'toolu_provider_wire_1',
    expectedFinishReason: 'stop',
    expectedToolLoopFinishReason: 'tool_calls',
    expectedUsage: { inputTokens: 222, outputTokens: 33, totalTokens: 255 },
  },
  {
    id: 'wire-gemini',
    type: 'gemini',
    baseUrl: MOCK_BASE_URL,
    expectedHeader: { name: 'x-goog-api-key', value: 'provider-wire-key' },
    // Gemini has no native tool-call id. The app decodes the wire name to the
    // logical tool name for trace, then re-encodes it for functionResponse.
    expectedToolCallId: 'editor.write',
    expectedFinishReason: 'stop',
    // Gemini marks functionCall responses with STOP, unlike OpenAI tool_calls.
    expectedToolLoopFinishReason: 'stop',
    expectedUsage: { inputTokens: 333, outputTokens: 44, totalTokens: 377 },
  },
  {
    id: 'wire-azure',
    type: 'azure-openai',
    baseUrl: MOCK_BASE_URL,
    deployment: 'provider-wire-deployment',
    apiVersion: '2024-02-01',
    expectedHeader: { name: 'api-key', value: 'provider-wire-key' },
    expectedToolCallId: 'wire-azure-tool-1',
    expectedFinishReason: 'stop',
    expectedToolLoopFinishReason: 'tool_calls',
    expectedUsage: { inputTokens: 444, outputTokens: 55, totalTokens: 499 },
  },
]

const requests = []
let activeProvider = null
let scenarioCount = 0

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function assertFreshRendererBuild() {
  const rendererIndex = path.join(ROOT, 'dist-renderer', 'index.html')
  assert(fs.existsSync(rendererIndex), 'dist-renderer/index.html exists; run npm run build:vue first')
  const sourceRoot = path.join(ROOT, 'src')
  const sourceFiles = []
  const collect = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) collect(full)
      else if (/\.(ts|vue|js|mjs|css)$/.test(entry.name)) sourceFiles.push(full)
    }
  }
  collect(sourceRoot)
  const newestSourceMs = Math.max(...sourceFiles.map(file => fs.statSync(file).mtimeMs))
  const indexHtml = fs.readFileSync(rendererIndex, 'utf8')
  const bundles = [...indexHtml.matchAll(/assets\/[^"']+\.js/g)].map(match => match[0])
  assert(bundles.length > 0, 'renderer index references at least one JS bundle')
  const stale = bundles.filter(name => fs.statSync(path.join(ROOT, 'dist-renderer', name)).mtimeMs < newestSourceMs)
  assert.equal(stale.length, 0, `renderer build is stale: ${stale.join(', ')}`)
}

function writePayload() {
  return {
    commands: [{
      operation: 'replace_match',
      target: '第二章：男主抵达灯塔，发现旧信。',
      content: '第二章：男主抵达灯塔，确认旧信来源。',
      reason: '供应商矩阵直写',
    }],
    reveal: { mode: 'instant', firstChange: true },
    reason: '供应商矩阵直写',
  }
}

function openAiUsage(input, output) {
  return { prompt_tokens: input, completion_tokens: output, total_tokens: input + output }
}

function sse(events) {
  return events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n'
}

function openAiToolSse({ id, usage }) {
  const payload = JSON.stringify(writePayload())
  return sse([
    { choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id, type: 'function', function: { name: 'editor.write', arguments: '' } }] } }] },
    { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { name: 'editor.write', arguments: payload.slice(0, 20) } }] } }] },
    { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { name: 'editor.write', arguments: payload.slice(20) } }] } }] },
    { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage },
  ])
}

function openAiTextSse({ text, usage, finishReason = 'stop' }) {
  return sse([
    { choices: [{ index: 0, delta: { role: 'assistant', content: text } }] },
    { choices: [{ index: 0, delta: {}, finish_reason: finishReason }], usage },
  ])
}

function anthropicToolSse({ id, usage }) {
  const payload = JSON.stringify(writePayload())
  return sse([
    { type: 'message_start', message: { usage: { input_tokens: usage.inputTokens } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id, name: 'editor.write', input: {} } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: payload.slice(0, 15) } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: payload.slice(15) } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: usage.outputTokens } },
  ])
}

function anthropicTextSse({ text, usage }) {
  return sse([
    { type: 'message_start', message: { usage: { input_tokens: usage.inputTokens } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: usage.outputTokens } },
  ])
}

function geminiToolSse({ usage }) {
  return sse([
    { candidates: [{ content: { parts: [{ functionCall: { name: 'editor.write', args: writePayload() } }] }, finishReason: 'STOP' }], usageMetadata: usage },
  ])
}

function geminiTextSse({ text, usage }) {
  return sse([
    { candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }], usageMetadata: usage },
  ])
}

const server = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    let body = null
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    const type = activeProvider?.type
    scenarioCount += 1
    const record = {
      providerId: activeProvider?.id,
      providerType: type,
      url: request.url,
      headers: request.headers,
      phase: scenarioCount,
      tools: type === 'gemini'
        ? (body?.tools?.[0]?.functionDeclarations || []).map(tool => tool?.name).filter(Boolean)
        : type === 'anthropic'
          ? (body?.tools || []).map(tool => tool?.name).filter(Boolean)
          : (body?.tools || []).map(tool => tool?.function?.name).filter(Boolean),
      body,
    }
    requests.push(record)

    assert(activeProvider, 'mock server must have an active provider')
    assert.equal(
      request.headers[activeProvider.expectedHeader.name],
      activeProvider.expectedHeader.value,
      `${activeProvider.id}: chat request carries provider credential`
    )
    const expectedToolName = type === 'gemini' ? 'editor_write' : 'editor.write'
    assert(record.tools.includes(expectedToolName), `${activeProvider.id}: chat request carries editor.write`)

    let payload = ''
    if (type === 'openai-compatible' || type === 'azure-openai') {
      payload = scenarioCount === 1
        ? openAiToolSse({ id: activeProvider.expectedToolCallId, usage: openAiUsage(activeProvider.expectedUsage.inputTokens, activeProvider.expectedUsage.outputTokens) })
        : openAiTextSse({ text: '已完成供应商矩阵直写。', usage: openAiUsage(activeProvider.expectedUsage.inputTokens + 1, activeProvider.expectedUsage.outputTokens + 1) })
    } else if (type === 'anthropic') {
      payload = scenarioCount === 1
        ? anthropicToolSse({ id: activeProvider.expectedToolCallId, usage: { inputTokens: activeProvider.expectedUsage.inputTokens, outputTokens: activeProvider.expectedUsage.outputTokens } })
        : anthropicTextSse({ text: '已完成供应商矩阵直写。', usage: { inputTokens: activeProvider.expectedUsage.inputTokens + 1, outputTokens: activeProvider.expectedUsage.outputTokens + 1 } })
    } else if (type === 'gemini') {
      const usage = { promptTokenCount: activeProvider.expectedUsage.inputTokens, candidatesTokenCount: activeProvider.expectedUsage.outputTokens, totalTokenCount: activeProvider.expectedUsage.totalTokens }
      payload = scenarioCount === 1
        ? geminiToolSse({ usage })
        : geminiTextSse({ text: '已完成供应商矩阵直写。', usage: { ...usage, promptTokenCount: usage.promptTokenCount + 1, candidatesTokenCount: usage.candidatesTokenCount + 1, totalTokenCount: usage.totalTokenCount + 2 } })
    } else {
      throw new Error(`unsupported provider type: ${type}`)
    }

    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    response.end(payload)
  })
})

function startElectron() {
  return spawn(ELECTRON_EXE, ['.', `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', `--user-data-dir=${PROFILE}`], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SHENYI_ALLOW_TEST_ISOLATION: '1',
      SHENYI_DATA_DIR: path.join(PROFILE, 'documents-data'),
      SHENYI_TEST_USER_DATA_DIR: path.join(PROFILE, 'app-data'),
    },
    windowsHide: true,
  })
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

async function removeDir(target) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.rmSync(target, { recursive: true, force: true })
      return
    } catch {}
    await sleep(400)
  }
}

async function closeProjectModal(page) {
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
  await sleep(400)
}

async function configureProvider(page, provider) {
  await page.evaluate(async ({ providerId, providerType, baseUrl, deployment, apiVersion }) => {
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: providerId,
        name: `Provider Wire ${providerType}`,
        baseUrl,
        apiKey: 'provider-wire-key',
        models: ['provider-wire-model'],
        selectedModel: 'provider-wire-model',
        temperature: 0.1,
        maxTokens: 4096,
        contextWindowTokens: 1000000,
        purpose: ['generate'],
        providerType,
        deployment,
        apiVersion,
        endpointMode: 'base',
        streamMode: true,
      }],
      generateProvider: providerId,
    })
  }, { providerId: provider.id, providerType: provider.type, baseUrl: provider.baseUrl, deployment: provider.deployment, apiVersion: provider.apiVersion })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20000 })
  await sleep(1000)
  await closeProjectModal(page)
}

async function openOutline(page) {
  await page.click('#btn-outline-workspace')
  await page.waitForSelector('#outline-editor', { timeout: 15000 })
  await page.locator('#outline-editor').fill(OUTLINE)
  await sleep(300)
  await page.click('#btn-ai-co-create')
  await page.waitForSelector('#ow-chat-input', { timeout: 15000 })
  await page.waitForFunction(() => Boolean(document.querySelector('#btn-ow-send') && !document.querySelector('#btn-ow-send')?.disabled), null, { timeout: 30000, polling: 250 })
}

async function closeOutline(page) {
  await page.evaluate(() => document.querySelector('#btn-close-outline-workspace')?.click())
  await sleep(300)
}

async function sendWriteRequest(page) {
  const before = requests.length
  scenarioCount = 0
  await page.locator('#ow-chat-input').fill('把第二章里的“发现旧信”改成“确认旧信来源”。')
  await page.locator('#ow-chat-input').evaluate(element => element.dispatchEvent(new Event('change', { bubbles: true })))
  await page.locator('#btn-ow-send').click()
  await page.waitForFunction(() => Boolean(document.querySelector('#btn-ow-send') && !document.querySelector('#btn-ow-send')?.disabled), null, { timeout: 60000, polling: 250 })
  await page.waitForFunction(() => (document.body.textContent || '').includes('已完成供应商矩阵直写'), null, { timeout: 30000, polling: 250 })
  await sleep(400)
  return requests.slice(before)
}

async function latestRun(page) {
  return await page.evaluate(() => {
    const run = [...(window.__pinia?._s?.get('runTrace')?.runs || [])]
      .filter(item => item.source === 'outline')
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    if (!run) return null
    return {
      id: run.id,
      status: run.status,
      turns: (run.turns || []).map(turn => ({ id: turn.id, intent: turn.intent || null, status: turn.status })),
      apiCalls: (run.apiCalls || []).map(call => ({
        id: call.id,
        turnId: call.turnId || null,
        status: call.status,
        finishReason: call.finishReason || null,
        usageUnavailable: call.usageUnavailable ?? null,
        usage: call.usage || null,
        actualToolSurface: (call.actualToolSurface || []).map(tool => ({ name: tool.name, policy: tool.policy })),
        physicalCalls: (call.physicalCalls || []).map(physical => ({
          phase: physical.phase,
          status: physical.status,
          finishReason: physical.finishReason || null,
          usage: physical.usage || null,
          usageUnavailable: physical.usageUnavailable ?? null,
        })),
        toolCalls: (call.toolCalls || []).map(tool => ({
          toolCallId: tool.toolCallId || null,
          name: tool.name,
          status: tool.status,
        })),
      })),
      events: (run.events || []).map(event => ({ type: event.type, level: event.level, label: event.label })),
    }
  })
}

async function waitForRunSuccess(page, timeout = 30000) {
  await page.waitForFunction(() => {
    const run = [...(window.__pinia?._s?.get('runTrace')?.runs || [])]
      .filter(item => item.source === 'outline')
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    if (!run) return false
    const callsClosed = (run.apiCalls || []).every(call => call.status !== 'running')
    const latestTurn = (run.turns || []).at(-1)
    const turnClosed = latestTurn && latestTurn.status !== 'running'
    const turnFinished = (run.events || []).some(event => event.type === 'turn-finished' || event.type === 'turn-canceled')
    return callsClosed && turnClosed && turnFinished
  }, null, { timeout, polling: 250 })
}

function assertProviderResult(provider, run, providerRequests) {
  assert.notEqual(run?.status, 'failed', `${provider.id}: run is not failed`)
  assert(providerRequests.length >= 2, `${provider.id}: tool call and convergence requests are recorded`)
  const call = run?.apiCalls?.[0]
  assert(call, `${provider.id}: run trace records API call`)
  assert.notEqual(call.status, 'running', `${provider.id}: API call is closed`)
  assert((call.actualToolSurface || []).some(tool => tool.name === 'editor.write' && tool.policy === 'write'), `${provider.id}: trace records write tool surface`)
  assert.equal(call.finishReason, provider.expectedFinishReason, `${provider.id}: finishReason is normalized`)
  const expectedFinalUsage = {
    inputTokens: provider.expectedUsage.inputTokens + 1,
    outputTokens: provider.expectedUsage.outputTokens + 1,
    totalTokens: provider.expectedUsage.totalTokens + 2,
  }
  assert.deepEqual(call.usage, expectedFinalUsage, `${provider.id}: normalized final-round usage is recorded`)
  assert.equal(call.usageUnavailable, false, `${provider.id}: usage unavailable is false`)
  const toolCall = (call.toolCalls || []).find(tool => tool.name === 'editor.write')
  assert(toolCall, `${provider.id}: trace records editor.write tool call`)
  assert.equal(toolCall.toolCallId, provider.expectedToolCallId, `${provider.id}: toolCallId is normalized`)
  assert.equal(toolCall.status, 'success', `${provider.id}: tool call succeeds`)
  assert((call.physicalCalls || []).length >= 2, `${provider.id}: physical calls are recorded`)
  assert.equal(
    (call.physicalCalls || [])[0]?.finishReason,
    provider.expectedToolLoopFinishReason,
    `${provider.id}: first physical call records native tool-loop finish reason`
  )
  const physicalUsages = (call.physicalCalls || []).map(physical => physical.usage)
  assert(physicalUsages.some(usage => usage?.totalTokens === provider.expectedUsage.totalTokens), `${provider.id}: first physical usage is preserved`)
  assert(physicalUsages.some(usage => usage?.totalTokens === provider.expectedUsage.totalTokens + 2), `${provider.id}: convergence usage is normalized`)
}

async function capture(page, provider) {
  fs.mkdirSync(REPORT_DIR, { recursive: true })
  await page.screenshot({ path: path.join(REPORT_DIR, `provider-wire-${provider.id}.png`), fullPage: true })
}

async function main() {
  assertFreshRendererBuild()
  await new Promise(resolve => server.listen(MOCK_PORT, '127.0.0.1', resolve))
  removeDir(PROFILE)
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })

  const electronProcess = startElectron()
  let browser = null
  const results = []
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
      if (message.type() === 'error') console.log(`[CONSOLE ERROR] ${message.text()}`)
    })
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1000)

    for (const provider of PROVIDERS) {
      activeProvider = provider
      scenarioCount = 0
      await configureProvider(page, provider)
      await page.evaluate(async ({ outline, projectId, projectName }) => {
        await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
        await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
          schemaVersion: 3,
          projectName,
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
          editorTabs: [],
        })
        await window.electronAPI.storageWrite('wa_skills', { skills: [] })
        await window.electronAPI.storageWrite('wa_co_creation_config', {
          agentId: '',
          skillIds: [],
          mode: 'compose',
          skillAgents: {},
        })
      }, { outline: OUTLINE, projectId: PROJECT_ID, projectName: `Provider Wire ${provider.id}` })
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForSelector('#app', { timeout: 20000 })
      await sleep(1000)
      await closeProjectModal(page)
      await openOutline(page)
      const providerRequests = await sendWriteRequest(page)
      const run = await latestRun(page)
      console.log(`[TRACE] ${provider.id}: ${JSON.stringify(run)}`)
      console.log(`[REQUESTS] ${provider.id}: ${JSON.stringify(providerRequests.map(item => ({ phase: item.phase, url: item.url, tools: item.tools })))}`)
      await waitForRunSuccess(page)
      assertProviderResult(provider, run, providerRequests)
      const content = await page.evaluate(() => window.__pinia?._s?.get('project')?.outlineText || '')
      assert(content.includes('第二章：男主抵达灯塔，确认旧信来源。'), `${provider.id}: editor.write changes outline content`)
      assert(!content.includes('第二章：男主抵达灯塔，发现旧信。'), `${provider.id}: old target is replaced`)
      await capture(page, provider)
      results.push({
        providerId: provider.id,
        providerType: provider.type,
        layer: 'mock',
        status: 'pass',
        requestCount: providerRequests.length,
        expectedHeader: provider.expectedHeader.name,
        traceApiCallId: run?.apiCalls?.[0]?.id || null,
        finishReason: run?.apiCalls?.[0]?.finishReason || null,
        usage: run?.apiCalls?.[0]?.usage || null,
        toolCallId: run?.apiCalls?.[0]?.toolCalls?.[0]?.toolCallId || null,
      })
      console.log(`[PASS] ${provider.id}: wire, trace, and direct write validated`)
      await closeOutline(page)
    }

    const report = {
      schema: 'shenyi.api-direct-write-provider-wire-electron-matrix',
      version: 1,
      generatedAt: new Date().toISOString(),
      layer: 'mock',
      assertionContract: {
        authHeaders: true,
        nativeToolLoop: true,
        toolResultWire: true,
        textCompletion: true,
        traceUsage: true,
        traceFinishReason: true,
        traceToolCallId: true,
        outlineDirectWrite: true,
      },
      providers: results,
    }
    fs.mkdirSync(REPORT_DIR, { recursive: true })
    fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    console.log(`provider wire matrix report: ${path.relative(ROOT, REPORT_PATH)}`)
    console.log(JSON.stringify(report, null, 2))
  } finally {
    if (browser) await browser.close().catch(() => {})
    try { execFileSync('taskkill', ['/PID', String(electronProcess.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
    server.close()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
