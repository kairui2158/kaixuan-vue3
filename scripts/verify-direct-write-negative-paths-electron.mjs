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
const CDP_PORT = 9287
const MOCK_PORT = 59946
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const PROFILE = path.join(ROOT, '_data', 'direct-write-negative-paths-profile')
const EXPORT_ROOT = path.join(ROOT, '_data', 'direct-write-negative-paths-exports')
const EVIDENCE_DIR = path.join(ROOT, '_audit', 'verification-direct-write-negative-paths')
const PROJECT_ID = 'direct-write-negative-paths-project'

const SHORT_OUTLINE = [
  '第一卷 风暴起点',
  '第二章内容。男主在灯塔下发现旧信。',
  '第三章内容。男主抵达灯塔顶端。',
].join('\n')

function buildLongOutline() {
  const sections = ['第一卷 长文档部分写入']
  for (let index = 1; index <= 2200; index++) {
    sections.push(`第${index}节：长文档部分写入终态抽测。男主沿着灯塔石阶检查灯芯，潮水在礁石外反复退去。`)
  }
  return sections.join('\n')
}

const LONG_OUTLINE = buildLongOutline()

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

function diffSummary(before, after) {
  const beforeLines = before.split('\n')
  const afterLines = after.split('\n')
  const changed = []
  for (let index = 0; index < Math.max(beforeLines.length, afterLines.length); index++) {
    if (beforeLines[index] !== afterLines[index]) {
      changed.push({
        line: index + 1,
        before: beforeLines[index] || null,
        after: afterLines[index] || null,
      })
    }
  }
  return {
    beforeChars: before.length,
    afterChars: after.length,
    beforeLines: beforeLines.length,
    afterLines: afterLines.length,
    changedLines: changed.length,
    firstChanges: changed.slice(0, 12),
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
    choices: [{
      finish_reason: 'stop',
      message: { role: 'assistant', content },
    }],
  }
}

function toolCall(name, input, id) {
  return {
    choices: [{
      finish_reason: 'tool_calls',
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [{
          id,
          type: 'function',
          function: { name, arguments: JSON.stringify(input) },
        }],
      },
    }],
  }
}

const writePayload = (commands, reason) => ({
  commands,
  reveal: { mode: 'instant', firstChange: true },
  reason,
})

let scenario = 'idle'
let scenarioTurn = 0
let scenarioCount = 0
const requests = []

function setScenario(name) {
  scenario = name
  scenarioTurn = 0
  scenarioCount = 0
}

function beginTurn() {
  scenarioTurn += 1
  scenarioCount = 0
}

const server = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    let body = null
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    const isIntentClassifier = (body?.messages || []).some(message =>
      message?.role === 'system' && String(message.content || '').includes('意图分类器'))
    if (!isIntentClassifier) scenarioCount += 1
    const record = {
      scenario,
      turn: scenarioTurn,
      requestCount: scenarioCount,
      isIntentClassifier,
      tools: (body?.tools || []).map(tool => tool?.function?.name || tool?.name || '').filter(Boolean),
      body,
    }
    requests.push(record)
    console.log(`[MOCK] ${scenario} turn=${scenarioTurn} request=${scenarioCount} intent=${isIntentClassifier ? 'yes' : 'no'} tools=${record.tools.join(',') || '(none)'}`)

    if (isIntentClassifier) {
      assert.equal(record.tools.length, 0, 'intent classifier request must not carry editor tools')
      respond(response, body, textCompletion('{"intent":"edit","confidence":0.95,"reason":"负路径验证需要保持写入授权"}'))
      return
    }

    if (scenario === 'preview-only') {
      respond(response, body, textCompletion('【修改预览】第二章大纲。男主在灯塔下确认旧信来源。请等待确认后再写入。'))
      return
    }

    if (scenario === 'partial-write') {
      const isOrchestratorRoundStart = !(body?.messages || []).some(message => message?.role === 'tool')
      const writeCount = requests.filter(item =>
        item.scenario === 'partial-write'
        && !item.isIntentClassifier
        && !(item.body?.messages || []).some(message => message?.role === 'tool')).length
      if (isOrchestratorRoundStart && writeCount <= 8) {
        const index = writeCount
        respond(response, body, toolCall('editor.write', writePayload([{
          operation: 'replace_match',
          target: `第${index}节：长文档部分写入终态抽测。男主沿着灯塔石阶检查灯芯，潮水在礁石外反复退去。`,
          content: `第${index}节：长文档部分写入终态抽测。男主沿着灯塔石阶检查灯芯，潮水在礁石外反复上涨。`,
          reason: `部分写入第${index}批`,
        }], `部分写入第${index}批`), `partial-write-${index}`))
        return
      }
      respond(response, body, textCompletion('写入尚未覆盖全部计划批次。'))
      return
    }

    respond(response, body, textCompletion('未定义的负路径场景。'))
  })
})

function respond(response, body, payload) {
  if (body?.stream) {
    const message = payload.choices?.[0]?.message || {}
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    response.write(`data: ${JSON.stringify({
      id: `direct-write-negative-${scenario}-${scenarioTurn}-${scenarioCount}`,
      object: 'chat.completion.chunk',
      choices: [{
        index: 0,
        finish_reason: payload.choices?.[0]?.finish_reason,
        delta: {
          role: 'assistant',
          content: message.content || '',
          tool_calls: message.tool_calls,
        },
      }],
    })}\n\n`)
    response.write('data: [DONE]\n\n')
    response.end()
    return
  }
  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

function startElectron() {
  const child = spawn(ELECTRON_EXE, ['.', `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', `--user-data-dir=${PROFILE}`], {
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

async function setupProject(page, outlineText) {
  await page.evaluate(async ({ mockUrl, outline, projectId }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'direct-write-negative-provider',
        name: 'Direct Write Negative Paths Mock',
        baseUrl: mockUrl,
        apiKey: 'key',
        models: ['direct-write-negative-model-128k'],
        selectedModel: 'direct-write-negative-model-128k',
        temperature: 0.1,
        maxTokens: 512,
        contextWindowTokens: 8000,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
      }],
      generateProvider: 'direct-write-negative-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: 'Direct Write Negative Paths',
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
    await window.electronAPI.storageWrite('wa_deAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
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
  }, { mockUrl: MOCK_BASE_URL, outline: outlineText, projectId: PROJECT_ID })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20000 })
  await sleep(1200)
  await page.evaluate(() => {
    document.querySelector('.project-modal-content .btn-close')?.click()
  })
  await sleep(400)
}

async function openOutline(page) {
  await page.evaluate(() => document.querySelector('#btn-close-outline-workspace')?.click())
  await sleep(200)
  await page.click('#btn-outline-workspace')
  await page.waitForSelector('#outline-editor', { timeout: 15000 })
  await page.locator('#outline-editor').fill(SHORT_OUTLINE)
  await sleep(300)
  await page.click('#btn-ai-co-create')
  await page.waitForSelector('#ow-chat-input', { timeout: 15000 })
}

async function waitOutlineIdle(page, timeout = 90000) {
  await page.waitForFunction(() => Boolean(document.querySelector('#btn-ow-send') && !document.querySelector('#btn-ow-send')?.disabled), null, { timeout, polling: 250 })
  await sleep(250)
}

async function outlineContent(page) {
  return await page.evaluate(() => window.__pinia?._s?.get('project')?.outlineText || '')
}

async function sendOutline(page, text) {
  await waitOutlineIdle(page)
  beginTurn()
  const before = requests.length
  await page.locator('#ow-chat-input').fill(text)
  await page.locator('#ow-chat-input').evaluate(element => element.dispatchEvent(new Event('change', { bubbles: true })))
  await page.locator('#btn-ow-send').click()
  await waitOutlineIdle(page, 150000)
  await sleep(500)
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
      turns: (run.turns || []).map(turn => ({
        id: turn.id,
        status: turn.status,
        reason: turn.reason || null,
        userRequest: turn.userRequest,
        intent: turn.intent || null,
        toolSurface: (turn.actualToolSurface || []).map(tool => ({ name: tool.name, policy: tool.policy })),
      })),
      apiCalls: (run.apiCalls || []).map(call => ({
        id: call.id,
        turnId: call.turnId || null,
        status: call.status,
        error: call.error || null,
        errorCode: call.errorCode || null,
        finishReason: call.finishReason || null,
        actualToolSurface: (call.actualToolSurface || []).map(tool => ({ name: tool.name, policy: tool.policy })),
        toolCalls: (call.toolCalls || []).map(tool => ({
          toolCallId: tool.toolCallId || null,
          name: tool.name,
          status: tool.status,
          input: tool.input || null,
          error: tool.error || null,
          errorCode: tool.errorCode || null,
        })),
      })),
      events: (run.events || []).map(event => ({
        turnId: event.turnId || null,
        type: event.type,
        level: event.level,
        label: event.label,
        detail: event.detail,
        payload: event.payload || null,
      })),
    }
  })
}

async function capture(page, name) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`), fullPage: true })
  console.log(`[PASS] screenshot saved: ${name}.png`)
}

async function waitForRunTerminal(page, timeout = 150000) {
  const deadline = Date.now() + timeout
  let latest = null
  while (Date.now() < deadline) {
    latest = await latestRun(page)
    const terminalTurn = (latest?.turns || []).at(-1)
    const allCallsClosed = (latest?.apiCalls || []).every(call => call.status !== 'running')
    if (terminalTurn && terminalTurn.status !== 'running' && allCallsClosed) return latest
    await sleep(500)
  }
  return latest
}

function systemPromptOf(record) {
  return (record?.body?.messages || [])
    .filter(message => message?.role === 'system')
    .map(message => String(message.content || ''))
    .join('\n')
}

async function exportLatestRun(page) {
  const result = await page.evaluate(async ({ exportRoot }) => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])]
      .filter(item => item.source === 'outline')
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    if (!run) return { success: false, reason: 'run not found' }
    return await window.electronAPI.runTraceExport({
      schema: 'shenyi.run-trace',
      version: 2,
      run: store.exportRunToJson(run),
      mode: 'deep',
      payloadDirectoryHint: exportRoot,
    })
  }, { exportRoot: EXPORT_ROOT })
  assert(result?.success, `deep run trace export succeeds: ${result?.reason || ''}`)
  assert(fs.existsSync(result.path), 'export path exists')
  const sourcePath = path.join(result.path, 'run-trace.json')
  assert(fs.existsSync(sourcePath), 'exported run-trace.json exists')
  fs.copyFileSync(sourcePath, path.join(EVIDENCE_DIR, 'run-trace.json'))
  return JSON.parse(fs.readFileSync(sourcePath, 'utf8'))
}

async function main() {
  assertFreshRendererBuild()
  await new Promise(resolve => server.listen(MOCK_PORT, '127.0.0.1', resolve))
  removeDir(PROFILE)
  removeDir(EXPORT_ROOT)
  removeDir(EVIDENCE_DIR)
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
  fs.mkdirSync(EXPORT_ROOT, { recursive: true })
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })

  const electronProcess = startElectron()
  let browser = null
  const report = {
    schema: 'shenyi.direct-write-negative-paths-electron',
    version: 1,
    generatedAt: new Date().toISOString(),
    liveApi: process.env.SHENYI_LIVE_API_KEY ? 'configured' : 'untested',
    scenarios: {},
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

    await setupProject(page, SHORT_OUTLINE)
    await openOutline(page)
    setScenario('preview-only')
    const previewBefore = await outlineContent(page)
    const previewBeforeHash = sha256(previewBefore)
    await sendOutline(page, '请把第二章大纲修改为：男主确认旧信来源。')
    const previewRun = await waitForRunTerminal(page)
    const previewAfter = await outlineContent(page)
    const previewTurn = (previewRun?.turns || []).at(-1)
    assert.equal(previewTurn?.status, 'failed', `preview-only turn is failed; got ${previewTurn?.status}`)
    assert.equal(previewTurn?.reason, 'write_not_executed', `preview-only reason is write_not_executed; got ${previewTurn?.reason}`)
    assert.equal(previewRun?.events.filter(event => event.type === 'agent-no_progress').length >= 3, true, 'trace records repeated agent-no_progress events')
    assert(
      (previewRun?.events || []).some(event => event.type === 'agent-no_progress' && event.payload?.reason === 'legacy_preview_response'),
      'trace records legacy_preview_response payload',
    )
    const previewWrites = (previewRun?.apiCalls || []).flatMap(call => call.toolCalls || []).filter(call => call.name === 'editor.write')
    assert.equal(previewWrites.length, 0, 'preview-only turn performs no editor.write tool call')
    assert.equal(sha256(previewAfter), previewBeforeHash, 'preview-only response does not mutate editor content')
    const previewRequests = requests.filter(item => item.scenario === 'preview-only' && !item.isIntentClassifier)
    assert(previewRequests.length >= 3, `preview-only performs at least three physical requests; got ${previewRequests.length}`)
    assert(previewRequests.every(item => item.tools.includes('editor.write')), 'preview-only keeps editor.write in the authorized tool surface')
    const previewPrompt = systemPromptOf(previewRequests[0])
    assert(previewPrompt.includes('editor.write'), 'preview-only provider prompt declares editor.write protocol')
    await capture(page, '01-outline-preview-only-rejected')
    report.scenarios.previewOnlyRejection = {
      request: '请把第二章大纲修改为：男主确认旧信来源。',
      physicalRequests: previewRequests.length,
      turnStatus: previewTurn?.status,
      turnReason: previewTurn?.reason,
      agentEvents: (previewRun?.events || []).filter(event => event.type.startsWith('agent-')).map(event => ({
        type: event.type,
        reason: event.payload?.reason || null,
        detail: event.detail,
      })),
      contentChanged: false,
      beforeSha256: previewBeforeHash,
      afterSha256: sha256(previewAfter),
      editorWriteCalls: previewWrites.length,
      liveApi: 'untested (mock Electron path)',
    }

    await setupProject(page, LONG_OUTLINE)
    await openOutline(page)
    await page.evaluate(text => {
      const store = window.__pinia?._s?.get('project')
      store.outlineText = text
    }, LONG_OUTLINE)
    await sleep(500)
    setScenario('partial-write')
    const partialBefore = await outlineContent(page)
    const partialBeforeHash = sha256(partialBefore)
    await sendOutline(page, '请整理全文标点符号')
    const partialRun = await waitForRunTerminal(page)
    const partialAfter = await outlineContent(page)
    const partialTurn = (partialRun?.turns || []).at(-1)
    fs.writeFileSync(
      path.join(EVIDENCE_DIR, 'partial-write-diagnostics.json'),
      JSON.stringify({
        turn: partialTurn,
        apiCalls: partialRun?.apiCalls,
        events: (partialRun?.events || []).filter(event => event.type.startsWith('agent-')),
        editorContentHash: sha256(partialAfter),
        editorContentTail: partialAfter.slice(-400),
        physicalRequests: requests.filter(item => item.scenario === 'partial-write' && !item.isIntentClassifier).map(item => ({
          turn: item.turn,
          requestCount: item.requestCount,
          assistantToolCalls: (item.body?.messages || []).filter(message => message?.role === 'assistant').at(-1)?.tool_calls?.map(call => ({ id: call.id, name: call.function?.name, arguments: call.function?.arguments })) || [],
          lastRole: (item.body?.messages || []).at(-1)?.role || null,
        })),
      }, null, 2),
      'utf8',
    )
    assert.notEqual(partialTurn?.status, 'running', 'partial-write turn leaves the running state')
    assert(
      partialTurn?.status === 'partially_applied' || partialTurn?.reason === 'stalled/physical_request_limit',
      `partial-write terminal reflects incomplete coverage; got status=${partialTurn?.status}, reason=${partialTurn?.reason}`,
    )
    assert(
      (partialRun?.events || []).some(event => event.type === 'agent-physical_request_limit'),
      'trace records agent-physical_request_limit',
    )
    const partialWrites = (partialRun?.apiCalls || []).flatMap(call => call.toolCalls || []).filter(call => call.name === 'editor.write' && call.status === 'success')
    assert.equal(partialWrites.length, 8, `partial-write records eight successful writes; got ${partialWrites.length}`)
    assert(partialWrites.length < 2192, 'successful writes are fewer than planned document sections')
    assert.notEqual(sha256(partialAfter), partialBeforeHash, 'partial-write changes the editor')
    assert(partialAfter.includes('潮水在礁石外反复上涨。'), 'partial-write applies the successful batch')
    assert(!partialAfter.endsWith('潮水在礁石外反复上涨。'), 'partial-write does not fabricate full-document completion')
    await capture(page, '02-outline-partial-write-terminal')
    report.scenarios.partialWriteTerminal = {
      request: '请整理全文标点符号',
      documentChars: LONG_OUTLINE.length,
      documentSections: 2200,
      successfulEditorWriteCalls: partialWrites.length,
      turnStatus: partialTurn?.status,
      turnReason: partialTurn?.reason,
      agentEvents: (partialRun?.events || []).filter(event => event.type.startsWith('agent-')).map(event => ({
        type: event.type,
        reason: event.payload?.reason || null,
        detail: event.detail,
      })),
      diff: diffSummary(partialBefore, partialAfter),
      beforeSha256: partialBeforeHash,
      afterSha256: sha256(partialAfter),
      liveApi: 'untested (mock Electron path)',
    }

    const exportedRun = await exportLatestRun(page)
    assert.equal(exportedRun.id, partialRun?.id, 'exported run matches the partial-write run')
    assert(exportedRun.apiCalls.every(call => call.status !== 'running'), 'exported run has no running API call')
    const exportedEvents = exportedRun.events || []
    assert(exportedEvents.some(event => event.type === 'agent-physical_request_limit'), 'exported trace preserves physical request limit event')
    await capture(page, '03-deep-run-trace-export')
    report.export = {
      runId: exportedRun.id,
      apiCalls: exportedRun.apiCalls?.length || 0,
      events: exportedEvents.length,
      hasRunningApiCall: exportedRun.apiCalls?.some(call => call.status === 'running') || false,
    }

    fs.writeFileSync(path.join(EVIDENCE_DIR, 'result.json'), JSON.stringify(report, null, 2), 'utf8')
    console.log(`[PASS] evidence saved: ${path.join(EVIDENCE_DIR, 'result.json')}`)
    console.log('===== DIRECT WRITE NEGATIVE PATHS ELECTRON E2E PASSED =====')
  } finally {
    try { if (browser) await browser.close() } catch {}
    try { execFileSync('taskkill', ['/PID', String(electronProcess.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
    server.close()
    await sleep(800)
    removeDir(PROFILE)
    removeDir(EXPORT_ROOT)
    console.log('[CLEANUP] negative-path profile and temporary exports removed')
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
