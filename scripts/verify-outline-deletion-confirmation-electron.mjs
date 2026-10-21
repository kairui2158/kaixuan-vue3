import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const TRACE_ROOT = path.resolve(
  process.env.SHENYI_OUTLINE_TRACE_ROOT
    || path.join(ROOT, '_audit', 'verification-outline-deletion-gate', 'client-turn6-trace'),
)
const ELECTRON_EXE = process.env.SHENYI_OUTLINE_DELETION_ELECTRON
  ? path.resolve(process.env.SHENYI_OUTLINE_DELETION_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9279
const MOCK_PORT = 59937
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const PROFILE = path.join(ROOT, '_data', 'outline-deletion-confirmation-electron-profile')
const SCREENSHOT_DIR = path.join(ROOT, '_audit', 'verification-outline-deletion-gate', 'electron')
const PROJECT_ID = 'outline-deletion-confirmation-electron'
const TEST_OUTLINE_PATH = process.env.SHENYI_OUTLINE_TEST_DOCUMENT
  ? path.resolve(process.env.SHENYI_OUTLINE_TEST_DOCUMENT)
  : 'C:/Users/凯瑞/Desktop/测试/《绿潮》大纲总纲.md'

const runTrace = JSON.parse(fs.readFileSync(path.join(TRACE_ROOT, 'run-trace.json'), 'utf8'))
const clientTurn = runTrace.turns.at(-1)
const clientApiCall = runTrace.apiCalls.find(call => call.turnId === clientTurn.id)
assert.ok(clientTurn, 'client run trace contains the final turn')
assert.ok(clientApiCall, 'client run trace contains the final API call')
assert.equal(clientTurn.userRequest, '把上一轮的决策写入大纲', 'replayed turn is client turn 6')
assert.equal(clientApiCall.toolCalls.length, 41, 'client turn 6 contains all 41 tool calls')

// The trace stores large payloads by reference. Rehydrate the exact tool inputs
// from payload files so the mock emits byte-equivalent tool calls.
function loadPayload(id, kind) {
  const numeric = Number(id.replace('payload-', ''))
  const file = path.join(TRACE_ROOT, 'payloads', `${String(numeric).padStart(3, '0')}-${kind}.json`)
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

const clientToolCalls = clientApiCall.toolCalls.map(tool => ({
  toolCallId: tool.toolCallId,
  name: tool.name,
  status: tool.status,
  errorCode: tool.errorCode || null,
  startedAt: tool.startedAt,
  input: loadPayload(tool.input.__payload.id, 'tool-input'),
  resultPayloadId: tool.result?.__payload?.id || null,
}))

// Client turn 6 was recorded against positional section ids. The outline
// structure contract has since moved to semantic ids, so replay migrates the
// historical ids by their recorded title and expected range. The mapping is
// explicit instead of accepting both id schemes, which would silently keep the
// deprecated protocol alive.
const semanticSectionIdMigration = new Map([
  ['heading-16801', {
    title: '数据板的局限',
    range: { start: 16801, end: 17356 },
    id: 'heading-2-z4sxm8',
  }],
  ['heading-17356', {
    title: '菌膜外套：有限资源的临时通行方案',
    range: { start: 17356, end: 18104 },
    id: 'heading-2-10q4nra',
  }],
  ['heading-18104', {
    title: '菌膜外套与共存补丁的关系',
    range: { start: 18104, end: 22619 },
    id: 'heading-2-28do6r',
  }],
])
for (const tool of clientToolCalls) {
  if (tool.name !== 'editor.read_range') continue
  const input = tool.input
  const migration = typeof input.sectionId === 'string'
    ? semanticSectionIdMigration.get(input.sectionId)
    : null
  if (!migration) continue
  const resultPayloadId = tool.resultPayloadId
  assert.ok(resultPayloadId, `historical read ${tool.toolCallId} references its tool-result payload`)
  const result = loadPayload(resultPayloadId, 'tool-result')
  const section = result?.data?.section
  assert.ok(section, `historical read ${tool.toolCallId} has a tool-result section`)
  assert.equal(section.id, input.sectionId, 'historical read references its recorded positional id')
  assert.equal(section.title, migration.title, 'historical read title anchors the semantic id migration')
  assert.equal(result?.data?.range?.start, migration.range.start, 'historical read range anchors the semantic id migration')
  assert.equal(result?.data?.range?.end, migration.range.end, 'historical read range anchors the semantic id migration')
  input.sectionId = migration.id
}

// Rebuild the exact 21-request conversation shape from physical call
// boundaries. A response's tools execute after it finishes and before the
// next physical request starts. Trace clocks are millisecond-resolution, so
// ties on `endedAt` belong to that response (tool 11 starts at exactly the
// end time of response 7).
function buildPhysicalReplayPlan() {
  const calls = [...clientApiCall.physicalCalls]
  const groups = calls.map((physical, index) => {
    const nextStartedAt = index + 1 < calls.length ? calls[index + 1].startedAt : Infinity
    const tools = clientToolCalls.filter(tool =>
      tool.startedAt > physical.endedAt - 1 && tool.startedAt < nextStartedAt)
    return { physical, tools }
  })
  assert.equal(groups.length, 21, 'client turn 6 replay has 21 physical requests')
  assert.equal(groups.reduce((sum, group) => sum + group.tools.length, 0), 41,
    'physical replay groups contain all 41 recorded tool calls')
  assert.equal(groups[6].tools.length, 1, 'response 7 carries the tied-boundary editor.write call')
  assert.equal(groups.at(-1).physical.finishReason, 'stop', 'final physical request converges without tools')
  return groups
}

const physicalReplayPlan = buildPhysicalReplayPlan()
// The final convergence response is archived as the raw response body itself,
// not JSON. Use the full payload so the replay cannot be silently truncated
// by the trace preview field.
const replayFinalText = fs.readFileSync(
  path.join(TRACE_ROOT, 'payloads', '098-response.json'),
  'utf8',
)
const replayFinalPreview = clientApiCall.physicalCalls.at(-1).responseTextPreview
assert.ok(replayFinalText, 'client trace has the final convergence response text')
assert.ok(
  replayFinalText.startsWith(replayFinalPreview || ''),
  'final response preview is a prefix of the archived full response',
)
assert.ok(
  replayFinalText.length >= (replayFinalPreview || '').length,
  'final response payload is not shorter than the trace preview',
)

const failedWrites = clientToolCalls.filter(tool => tool.name === 'editor.write' && tool.status === 'failed')
const integrityWrites = failedWrites.filter(tool => Array.isArray(tool.input?.commands))
assert.equal(failedWrites.length, 7, 'client turn 6 has seven failed writes')
assert.equal(integrityWrites.length, 4, 'client turn 6 has four integrity_failed batches')
assert.equal(
  failedWrites.filter(tool => !Array.isArray(tool.input?.commands)).length,
  3,
  'client turn 6 has three missing_field writes',
)

const authoritativeWrite = integrityWrites.at(-1)
  const clientCommands = authoritativeWrite.input.commands
  assert.equal(clientCommands.length, 3, 'client deletion batch has three commands')
  assert(clientCommands.every(command => command.operation === 'delete'), 'client commands are all deletes')
const clientHeadingDeletionErrorCodes = new Set([
  'heading_deletion_requires_user_confirmation',
  'integrity_failed',
])
const historicalWriteOnlyLocateCalls = clientToolCalls.filter(tool =>
  tool.name === 'editor.locate'
  && tool.status === 'failed'
  && tool.errorCode === 'write_only_mode')
assert.equal(
  historicalWriteOnlyLocateCalls.length,
  3,
  'client turn 6 records the three historical write_only_mode locate failures',
)

// The prompt snapshot is the exact outline loaded by the customer. It is the
// only legitimate seed for replaying heading-count integrity failures.
const promptSnapshot = JSON.parse(fs.readFileSync(path.join(TRACE_ROOT, 'payloads', '212-prompt.json'), 'utf8'))
const clientOutline = promptSnapshot.variables.find(variable => variable.key === 'outlineContent')?.value
const importedOutline = fs.readFileSync(TEST_OUTLINE_PATH, 'utf8')
assert.equal(clientOutline.length, 74841, 'customer outline is exactly 74,841 characters')
assert.equal((clientOutline.match(/^#{1,6}\s/gm) || []).length, 196, 'customer outline has 196 markdown headings')
assert.equal(importedOutline, clientOutline, 'desktop test document is byte-identical to the customer trace outline snapshot')
assert(clientOutline.includes(clientCommands[0].target), 'customer outline contains the first deletion target')
assert(clientOutline.includes(clientCommands[1].target), 'customer outline contains the second deletion target')
assert(clientOutline.includes(clientCommands[2].target), 'customer outline contains the third deletion target')

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
  const staleBundles = bundleNames.filter(name => fs.statSync(path.join(ROOT, 'dist-renderer', name)).mtimeMs < newestSourceMs)
  assert.equal(staleBundles.length, 0, `renderer build is stale; rebuild with npm run build:vue. Stale bundles: ${staleBundles.join(', ')}`)
}

function textCompletion(content) {
  return {
    choices: [{ finish_reason: 'stop', message: { role: 'assistant', content } }],
  }
}

function toolCallsResponse(calls) {
  return {
    choices: [{
      finish_reason: 'tool_calls',
      message: {
        role: 'assistant',
        content: '',
        tool_calls: calls.map(call => ({
          id: call.toolCallId,
          type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.input) },
        })),
      },
    }],
  }
}

let replayMode = false
let replayCursor = 0
let scenarioCount = 0
const requests = []

function respond(response, body, payload) {
  if (body?.stream) {
    const delta = payload.choices?.[0]?.message || {}
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    response.write(`data: ${JSON.stringify({
      id: `outline-deletion-replay-${scenarioCount}`,
      object: 'chat.completion.chunk',
      choices: [{
        index: 0,
        finish_reason: payload.choices?.[0]?.finish_reason,
        delta: { role: 'assistant', content: delta.content || '', tool_calls: delta.tool_calls },
      }],
    })}\n\n`)
    response.write('data: [DONE]\n\n')
    response.end()
    return
  }
  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

const server = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    let body = null
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    const isIntentClassifier = (body?.messages || []).some(message =>
      message?.role === 'system' && String(message.content || '').includes('意图分类器')
    )
    if (!isIntentClassifier) scenarioCount += 1
    requests.push({ replayMode, requestCount: scenarioCount, isIntentClassifier, body })

    if (isIntentClassifier) {
      respond(response, body, textCompletion('{"intent":"edit","confidence":0.94,"reason":"用户要求写入上一轮决策"}'))
      return
    }

    if (!replayMode) {
      respond(response, body, textCompletion('已处理当前请求。'))
      return
    }

    const group = physicalReplayPlan[replayCursor] || physicalReplayPlan.at(-1)
    const isFinal = replayCursor >= physicalReplayPlan.length - 1
    replayCursor += 1
    console.log(`[REPLAY request ${replayCursor}/21] tools=${group.tools.length} ${group.tools.map(tool => tool.name).join(',') || '(final text)'}`)
    if (isFinal || group.tools.length === 0) {
      respond(response, body, textCompletion(replayFinalText))
      return
    }
    respond(response, body, toolCallsResponse(group.tools))
  })
})

function startElectron() {
  const child = spawn(ELECTRON_EXE, ['.', `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', `--user-data-dir=${PROFILE}`], {
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
  console.log(`[VISIBLE ELECTRON] pid=${child.pid} profile=${PROFILE}`)
  console.log(`[REPLAY SOURCE] ${TRACE_ROOT}`)
  console.log(`[REPLAY OUTLINE] chars=${clientOutline.length} headings=${(clientOutline.match(/^#{1,6}\s/gm) || []).length}`)
  child.stdout.on('data', chunk => process.stdout.write(`[ELECTRON] ${chunk}`))
  child.stderr.on('data', chunk => process.stderr.write(`[ELECTRON STDERR] ${chunk}`))
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

async function closeProjectModal(page) {
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
  await sleep(400)
}

async function seedProject(page) {
    await page.evaluate(async ({ mockUrl, projectId }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'outline-deletion-provider',
        name: 'Outline Deletion Mock',
        baseUrl: mockUrl,
        apiKey: 'key',
        models: ['outline-deletion-model'],
        selectedModel: 'outline-deletion-model',
        temperature: 0.1,
        maxTokens: 4096,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
      }],
      generateProvider: 'outline-deletion-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: 'Outline Deletion Confirmation E2E',
      outlineText: '',
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
    await window.electronAPI.storageWrite('wa_dAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
    await window.electronAPI.storageWrite('wa_skills', { skills: [] })
    await window.electronAPI.storageWrite('wa_co_creation_config', {
      agentId: '',
      skillIds: [],
      mode: 'compose',
      skillAgents: {},
    })
  }, { mockUrl: MOCK_BASE_URL, projectId: PROJECT_ID })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20000 })
  await sleep(1200)
  await closeProjectModal(page)
}

async function waitOutlineIdle(page, timeout = 120000) {
  await page.waitForFunction(() => Boolean(document.querySelector('#btn-ow-send') && !document.querySelector('#btn-ow-send')?.disabled), null, { timeout, polling: 250 })
  await sleep(250)
}

async function sendClientTurn(page) {
  await waitOutlineIdle(page)
  const before = requests.length
  replayCursor = 0
  replayMode = true
  scenarioCount = 0
  await page.locator('#ow-chat-input').fill(clientTurn.userRequest)
  await page.locator('#ow-chat-input').evaluate(element => element.dispatchEvent(new Event('change', { bubbles: true })))
  await page.locator('#btn-ow-send').click()
  await page.waitForSelector('.ow-deletion-confirmation', { timeout: 120000 })
  await waitOutlineIdle(page)
  return requests.slice(before)
}

async function importClientOutline(page) {
  await page.click('#btn-import-outline')
  await page.locator('#outline-workspace input[type="file"][accept=".txt,.md,.text,.rtf,.docx"]').first()
    .setInputFiles(TEST_OUTLINE_PATH)
  await page.waitForFunction(expected => {
    const text = window.__pinia?._s?.get('project')?.outlineText || ''
    return text.length === expected
  }, clientOutline.length, { timeout: 30000, polling: 250 })
  await sleep(500)
}

async function outlineContent(page) {
  return page.evaluate(() => window.__pinia?._s?.get('project')?.outlineText || '')
}

async function latestRun(page) {
  return page.evaluate(() => {
    const run = [...(window.__pinia?._s?.get('runTrace')?.runs || [])]
      .filter(item => item.source === 'outline')
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    if (!run) return null
    return {
      status: run.status,
      turns: (run.turns || []).map(turn => ({
        id: turn.id,
        userRequest: turn.userRequest,
        status: turn.status,
        intent: turn.intent || null,
        reason: turn.reason || null,
      })),
      apiCalls: (run.apiCalls || []).map(call => ({
        id: call.id,
        turnId: call.turnId || null,
        userRequest: call.userRequest || null,
        request: call.request || null,
        status: call.status,
        error: call.error || null,
        errorCode: call.errorCode || null,
        toolCalls: (call.toolCalls || []).map(tool => ({
          toolCallId: tool.toolCallId || null,
          name: tool.name,
          status: tool.status,
          error: tool.error || null,
          errorCode: tool.errorCode || null,
        })),
      })),
      events: (run.events || []).map(event => ({
        turnId: event.turnId || null,
        type: event.type,
        level: event.level,
        label: event.label,
      })),
    }
  })
}

async function capture(page, name) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: true })
  console.log(`[PASS] screenshot saved: ${name}.png`)
}

async function waitForConfirmationText(page, expected, timeout = 10000) {
  const deadline = Date.now() + timeout
  let lastText = ''
  while (Date.now() < deadline) {
    lastText = await page.evaluate(() => document.querySelector('.ow-deletion-confirmation')?.textContent || '')
    if (lastText.includes(expected)) return lastText
    await sleep(100)
  }
  throw new Error(`deletion confirmation text not found. expected=${expected}; actual=${lastText || '(none)'}`)
}

async function resetConversation(page) {
  await page.click('#btn-ow-reset-conversation')
  await page.waitForSelector('.app-confirm-overlay', { timeout: 5000 })
  await page.locator('.app-confirm-overlay .btn-danger').click()
  await page.waitForFunction(() => document.querySelectorAll('.app-confirm-overlay').length === 0, null, { timeout: 5000, polling: 100 })
  await sleep(300)
}

function assertReplayedTrace(run) {
  const replayTurn = (run?.turns || []).find(turn => turn.userRequest === clientTurn.userRequest)
  assert.ok(replayTurn, 'new run trace records the replayed client request text')
  const call = (run?.apiCalls || []).find(item =>
    item.turnId === replayTurn.id
    || item.userRequest === clientTurn.userRequest
    || item.request === clientTurn.userRequest
    || (item.toolCalls || []).length === clientToolCalls.length)
  assert.ok(call, 'new run trace records the replayed client turn')
  const toolCalls = call.toolCalls || []
  assert.equal(toolCalls.length, clientToolCalls.length, 'trace records all 41 client tool calls')
  let historicalWriteOnlyLocateNowSuccessful = 0

  for (let index = 0; index < clientToolCalls.length; index++) {
    const expected = clientToolCalls[index]
    const actual = toolCalls[index]
    assert.equal(actual.name, expected.name, `tool ${index + 1}/${clientToolCalls.length} name matches replay`)
    if (
      expected.name === 'editor.locate'
      && expected.status === 'failed'
      && expected.errorCode === 'write_only_mode'
    ) {
      assert.equal(
        actual.status,
        'success',
        `tool ${index + 1}/${clientToolCalls.length} is a historical write_only_mode locate: current product keeps read tools available`,
      )
      historicalWriteOnlyLocateNowSuccessful += 1
      continue
    }
    assert.equal(actual.status, expected.status, `tool ${index + 1}/${clientToolCalls.length} status matches replay`)
    if (expected.status === 'failed') {
      const expectedErrorCode = expected.errorCode === 'integrity_failed' && expected.name === 'editor.write'
        ? clientHeadingDeletionErrorCodes
        : expected.errorCode
      if (expectedErrorCode instanceof Set) {
        assert.ok(
          expectedErrorCode.has(actual.errorCode),
          `tool ${index + 1}/${clientToolCalls.length} is an authorized heading-deletion gate: expected one of ${[...expectedErrorCode].join('/')}, received ${actual.errorCode}`,
        )
      } else {
        assert.equal(actual.errorCode, expectedErrorCode, `tool ${index + 1}/${clientToolCalls.length} error code matches replay`)
      }
    }
  }

  const writeCalls = toolCalls.filter(tool => tool.name === 'editor.write')
  assert.equal(writeCalls.length, 7, 'trace records all seven editor.write attempts')
  assert.equal(writeCalls.filter(tool => tool.errorCode === 'missing_field').length, 3, 'trace records three missing_field writes')
  const gatedHeadingDeletions = writeCalls.filter(tool => clientHeadingDeletionErrorCodes.has(tool.errorCode))
  assert.equal(gatedHeadingDeletions.length, 4, 'trace records four gated heading-deletion batches')
  assert.equal(
    historicalWriteOnlyLocateNowSuccessful,
    historicalWriteOnlyLocateCalls.length,
    'all historical write_only_mode locate calls now execute successfully',
  )
  assert((run?.events || []).some(event => event.turnId === replayTurn.id && event.type === 'outline-deletion-confirmation-requested'), 'trace records the authorization request')
  return { toolCalls, historicalWriteOnlyLocateNowSuccessful }
}

async function raiseVisibleToolIterationLimit(page) {
  // The customer's provider emitted 21 physical requests in one turn. The
  // current iteration capacity is derived from the execution-plan budget, so
  // the replay must not inject a global production escape hatch.
  const rendererReady = await page.evaluate(() => Boolean(window.__pinia?._s?.get('runTrace')))
  assert(rendererReady, 'renderer is ready for derived-budget replay verification')
}

async function logLatestApiCalls(page) {
  const calls = await page.evaluate(() => {
    const run = [...(window.__pinia?._s?.get('runTrace')?.runs || [])]
      .filter(item => item.source === 'outline')
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    return (run?.apiCalls || []).map(call => ({
      id: call.id,
      turnId: call.turnId || null,
      userRequest: call.userRequest || null,
      request: call.request || null,
      toolCallCount: (call.toolCalls || []).length,
    }))
  })
  console.log('[TRACE API CALLS]', JSON.stringify(calls, null, 2))
}

async function main() {
  assertFreshRendererBuild()
  await new Promise(resolve => server.listen(MOCK_PORT, '127.0.0.1', resolve))
  removeDir(PROFILE)
  removeDir(SCREENSHOT_DIR)
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

  const electronProcess = startElectron()
  let browser = null
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
    page.on('crash', () => console.error('[PAGE CRASH] renderer process crashed'))
    page.on('console', message => {
      if (message.type() === 'error') console.log(`[PAGE CONSOLE ERROR] ${message.text().slice(0, 500)}`)
    })
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1500)
  await seedProject(page)
  await page.click('#btn-outline-workspace')
  await page.waitForSelector('#outline-editor', { timeout: 15000 })
    assert.equal(await outlineContent(page), '', 'project starts with an empty outline before real file import')
    await importClientOutline(page)
    assert.equal(await outlineContent(page), clientOutline, 'desktop test document is imported exactly through the real file input')
    await page.click('#btn-ai-co-create')
    await page.waitForSelector('#ow-chat-input', { timeout: 15000 })
    await raiseVisibleToolIterationLimit(page)

    const beforeApprove = await outlineContent(page)
    assert.equal(beforeApprove.length, clientOutline.length, 'outline is unchanged before replay')
    await sendClientTurn(page)
    const confirmationText = await waitForConfirmationText(page, 'API 请求删除大纲标题，等待你授权')
    assert.ok(confirmationText.includes('授权前原文不会被修改'), 'confirmation bubble states that the original is unchanged')
    assert.equal(await outlineContent(page), beforeApprove, 'authorization gate does not modify the outline')

    let run = await latestRun(page)
    await logLatestApiCalls(page)
    const replayResult = assertReplayedTrace(run)
    const replayedToolCalls = replayResult.toolCalls
    const historicalWriteOnlyLocateNowSuccessful = replayResult.historicalWriteOnlyLocateNowSuccessful
    assert.equal(
      replayedToolCalls.filter(tool => tool.status === 'failed').length,
      11,
      'trace records the eleven failures that remain in the current product',
    )
    await capture(page, '01-client-turn6-full-replay-authorization-gate')

    await page.locator('.ow-deletion-confirmation .msg-btn', { hasText: '授权本次删除' }).first().click()
    await waitOutlineIdle(page)
    await page.waitForFunction(() => !document.querySelector('.ow-deletion-confirmation'), null, { timeout: 10000, polling: 100 })
    const approvedContent = await outlineContent(page)
    assert(!approvedContent.includes('## 数据板的局限'), 'authorized deletion removes the first client section')
    assert(!approvedContent.includes('## 菌膜外套：有限资源的临时通行方案'), 'authorized deletion removes the second client section')
    assert(approvedContent.includes('## 菌膜外套与共存补丁的关系'), 'third heading is preserved')
    assert(approvedContent.includes('在大裂谷走廊，铁壁要塞的巨墙挡住了变异体潮。'), 'third section independent body is preserved')
    const expectedRemoved = clientCommands.reduce((sum, command) => sum + command.target.length, 0)
    assert.equal(approvedContent.length, beforeApprove.length - expectedRemoved, 'only the authorized command targets are deleted')
    run = await latestRun(page)
    const eventTypes = (run?.events || []).map(event => event.type)
    assert(eventTypes.includes('outline-deletion-confirmation-granted'), 'trace records user authorization')
    assert(eventTypes.includes('outline-deletion-confirmation-consumed'), 'trace records authorization consumption')
    await capture(page, '02-client-turn6-authorized-deletion')

    await resetConversation(page)
    await page.evaluate(outline => {
      const store = window.__pinia?._s?.get('project')
      if (store) store.outlineText = outline
    }, clientOutline)
    await waitOutlineIdle(page)
    await sendClientTurn(page)
    await page.locator('.ow-deletion-confirmation').first().waitFor({ state: 'visible', timeout: 10000 })
    const beforeReject = await outlineContent(page)
    await page.locator('.ow-deletion-confirmation .msg-btn', { hasText: '拒绝并保留原文' }).first().click()
    await waitOutlineIdle(page)
    await page.waitForFunction(() => !document.querySelector('.ow-deletion-confirmation'), null, { timeout: 10000, polling: 100 })
    assert.equal(await outlineContent(page), beforeReject, 'rejection preserves the original outline')
    run = await latestRun(page)
    assert((run?.events || []).some(event => event.type === 'outline-deletion-confirmation-dismissed'), 'trace records rejection')
    await capture(page, '03-client-turn6-rejected-deletion')

const summary = {
      schema: 'shenyi.outline-deletion-confirmation.electron.full-replay',
      version: 2,
      generatedAt: new Date().toISOString(),
      electronPid: electronProcess.pid,
      traceRoot: TRACE_ROOT,
      testDocumentPath: TEST_OUTLINE_PATH,
      replayedTurnId: clientTurn.id,
      physicalRequests: physicalReplayPlan.length,
      userRequest: clientTurn.userRequest,
      outlineChars: clientOutline.length,
      outlineHeadings: (clientOutline.match(/^#{1,6}\s/gm) || []).length,
      replayedToolCalls: clientToolCalls.length,
      failedToolCalls: replayedToolCalls.filter(tool => tool.status === 'failed').length,
      historicalWriteOnlyLocateFailures: historicalWriteOnlyLocateCalls.length,
      historicalWriteOnlyLocateNowSuccessful,
      editorWriteAttempts: 7,
      missingFieldWrites: 3,
      gatedHeadingDeletionWrites: 4,
      authorizedDeletedChars: beforeApprove.length - approvedContent.length,
      rejectedContentLength: beforeReject.length,
      screenshots: [
        '01-client-turn6-full-replay-authorization-gate.png',
        '02-client-turn6-authorized-deletion.png',
        '03-client-turn6-rejected-deletion.png',
      ],
    }
    const reportPath = path.join(SCREENSHOT_DIR, 'result.json')
    fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2))
    console.log(`[PASS] full client trace replay completed: ${summary.replayedToolCalls} tool calls`)
    console.log(`[PASS] report saved: ${reportPath}`)
  } finally {
    replayMode = false
    await removeDir(PROFILE)
    console.log('[CLEANUP] removed verification profile')
    if (browser) await browser.close().catch(() => undefined)
    if (electronProcess && !electronProcess.killed) {
      electronProcess.kill()
      await sleep(500)
    }
    server.close()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
