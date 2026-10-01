import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9257
const PROFILE = path.join(ROOT, '_data', 'outline-silent-wait-fix-profile')
const EXPORT_ROOT = path.join(ROOT, '_data', 'outline-silent-wait-fix-exports')
const LOG_ROOT = path.join(ROOT, '_data', 'outline-silent-wait-fix-logs')
const MOCK_PORT = 59917
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const OUTLINE_TEXT = ['第一卷 风暴起点', '北方风暴逼近，男主发现旧信。', '第二章 男主决定南下。', '第三章 男主抵达灯塔。'].join('\n')

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function removeDir(target) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.rmSync(target, { recursive: true, force: true })
      return
    } catch {}
    await sleep(500)
  }
}

let scenario = 'tool-then-answer'
let holdStartedAt = 0
const providerRequests = []
const providerServer = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    let body = null
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    providerRequests.push({
      scenario,
      url: request.url,
      stream: body?.stream,
      toolsCount: Array.isArray(body?.tools) ? body.tools.length : 0,
      toolNames: Array.isArray(body?.tools)
        ? body.tools.map(tool => tool?.function?.name || tool?.name || tool?.type).filter(Boolean)
        : [],
      messageCount: Array.isArray(body?.messages) ? body.messages.length : 0,
      messageRoles: Array.isArray(body?.messages) ? body.messages.map(message => message.role) : [],
      toolRoles: Array.isArray(body?.messages) ? body.messages.filter(message => message.role === 'tool').length : 0
    })
    if (scenario === 'hold' || scenario === 'user-cancel-hold') {
      holdStartedAt = Date.now()
      response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' })
      response.write(': hold\n\n')
      return
    }
    if (body?.stream !== true) {
      const convergenceRequest = body?.messages?.some?.(message =>
        message?.role === 'system' && String(message?.content || '').includes('停止调用任何工具'))
      const wantsToolCall = !convergenceRequest && (scenario === 'tool-loop-limit' || providerRequests.length === 1)
      const choice = wantsToolCall
        ? {
            message: {
              tool_calls: [{
                id: `call-${providerRequests.length}`,
                type: 'function',
                function: { name: 'editor.get_state', arguments: '{}' }
              }]
            },
            finish_reason: 'tool_calls'
          }
        : {
            message: { content: scenario === 'tool-loop-limit' ? '基于已有工具结果的收敛回答' : '工具检查完成。' },
            finish_reason: 'stop'
          }
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ choices: [choice] }))
      return
    }
    response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' })
    const convergenceStreamRequest = Boolean(body?.stream) && !(Array.isArray(body?.tools) && body.tools.length > 0)
    if (convergenceStreamRequest) {
      const convergenceText = scenario === 'tool-loop-limit' ? '基于已有工具结果的收敛回答' : '工具检查完成。'
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: convergenceText }, finish_reason: null }] })}\n\n`)
      response.write('data: [DONE]\n\n')
      response.end()
      return
    }
    if (scenario === 'tool-loop-limit' || providerRequests.length === 1) {
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: `call-${providerRequests.length}`, type: 'function', function: { name: 'editor.get_state', arguments: '{}' } }] }, finish_reason: null }] })}\n\n`)
    } else {
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '工具检查完成。' }, finish_reason: null }] })}\n\n`)
    }
    response.write('data: [DONE]\n\n')
    response.end()
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
      SHENYI_TEST_RUN_TRACE_EXPORT: EXPORT_ROOT,
      SHENYI_TEST_LOG_DIR: LOG_ROOT,
    },
    windowsHide: true
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

function latestRun(page, source) {
  return page.evaluate(sourceName => {
    const run = [...(window.__pinia?.state?.value?.runTrace?.runs || [])].filter(item => item.source === sourceName).sort((a, b) => b.startedAt - a.startedAt)[0]
    if (!run) return null
    return {
      id: run.id,
      status: run.status,
      turns: (run.turns || []).map(turn => ({ status: turn.status, error: turn.error })),
      turnReasons: (run.turns || []).map(turn => turn.reason),
      apiCalls: (run.apiCalls || []).map(call => ({
        status: call.status,
        streamLength: (call.streamText || '').length,
        responseLength: (call.responseText || '').length,
        physicalCount: (call.physicalCalls || []).length,
        physicalPhases: (call.physicalCalls || []).map(physical => physical.phase),
        integrity: call.integrity || null,
        finishReason: call.finishReason
      }))
    }
  }, source)
}

async function latestRunId(page, source) {
  return page.evaluate(sourceName => [...(window.__pinia?.state?.value?.runTrace?.runs || [])].filter(item => item.source === sourceName).sort((a, b) => b.startedAt - a.startedAt)[0]?.id || '', source)
}

async function exportLatestTrace(page, source) {
  const runId = await latestRunId(page, source)
  assert(runId, 'run id exists')
  const result = await page.evaluate(async ({ sourceName, runId: expectedRunId, exportRoot }) => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])].filter(item => item.source === sourceName).sort((a, b) => b.startedAt - a.startedAt)[0]
    if (!run || run.id !== expectedRunId) return { success: false, reason: 'run not found' }
    return await window.electronAPI.runTraceExport({
      schema: 'shenyi.run-trace',
      version: 2,
      run: store.exportRunToJson(run),
      mode: 'deep',
      payloadDirectoryHint: exportRoot
    })
  }, { sourceName: source, runId, exportRoot: EXPORT_ROOT })
  assert(result?.success, `trace export succeeds: ${result?.reason || ''}`)
  assert(fs.existsSync(result.path), 'trace export path exists')
  return { runId, exportPath: result.path }
}

  function assertExportedRun(runId, expectedStatus, exportPath) {
  const json = JSON.parse(fs.readFileSync(path.join(exportPath, 'run-trace.json'), 'utf8'))
  const exportJson = JSON.parse(fs.readFileSync(path.join(exportPath, 'export.json'), 'utf8'))
  const payloadDir = path.join(exportPath, 'payloads')
  const payloadFiles = fs.existsSync(payloadDir) ? fs.readdirSync(payloadDir) : []
  assert.equal(json.id, runId)
  assert.equal(json.status, 'running')
  assert.equal(json.sessionSnapshot, true)
  assert(json.apiCalls.every(call => call.status !== 'running'), 'no running api call')
  assert.equal(exportJson.payloadVerification?.ok, true, 'payload verification passes')
  assert.equal(exportJson.payloadCount, payloadFiles.length, 'payload count matches files')
  for (const file of payloadFiles) assert(fs.readFileSync(path.join(payloadDir, file), 'utf8').trim().length > 0, `payload not empty: ${file}`)
  assert(json.apiCalls.every(call => !call.integrity || call.integrity.physicalMissing || call.integrity.physicalSkipped), 'integrity markers are internally consistent')
    assert(json.apiCalls.some(call => call.finishReason === 'tool_converged' || call.finishReason === 'tool_converged_local'), 'tool convergence survives export')
  return json
}

async function waitIdle(page, timeout = 40000) {
  await page.waitForFunction(() => Boolean(document.querySelector('#btn-ow-send') && !document.querySelector('#btn-ow-send')?.disabled), null, { timeout, polling: 250 })
}

async function getLatestRunSnapshot(page, source) {
  return page.evaluate(sourceName => {
    const run = [...(window.__pinia?.state?.value?.runTrace?.runs || [])].filter(item => item.source === sourceName).sort((a, b) => b.startedAt - a.startedAt)[0]
    if (!run) return null
    return {
      id: run.id,
      status: run.status,
      error: run.error,
      turns: (run.turns || []).map(turn => ({ status: turn.status, error: turn.error, reason: turn.reason })),
      apiCalls: (run.apiCalls || []).map(call => ({
        status: call.status,
        finishReason: call.finishReason,
        error: call.error,
        physicalCalls: (call.physicalCalls || []).map(physical => ({ status: physical.status, phase: physical.phase }))
      })),
      events: (run.events || []).map(event => ({ type: event.type, label: event.label, detail: event.detail }))
    }
  }, source)
}

async function dumpFailureScene(page, phase) {
  const scene = await page.evaluate(() => ({
    status: document.querySelector('.ow-generation-status')?.textContent || document.querySelector('[class*=generation]')?.textContent || '',
    chatText: document.querySelector('#ow-chat-messages')?.textContent || '',
    streamingText: document.querySelector('#ow-streaming-message')?.textContent || '',
    sendDisabled: document.querySelector('#btn-ow-send')?.disabled,
    runTrace: [...(window.__pinia?.state?.value?.runTrace?.runs || [])].slice(-2).map(run => ({
      id: run.id,
      source: run.source,
      status: run.status,
      turns: (run.turns || []).map(turn => ({ status: turn.status, error: turn.error })),
      apiCalls: (run.apiCalls || []).map(call => ({
        status: call.status,
        finishReason: call.finishReason,
        toolSurface: call.toolSurface,
        actualToolSurface: call.actualToolSurface,
        physicalCalls: (call.physicalCalls || []).map(physical => ({
          status: physical.status,
          phase: physical.phase,
          attempt: physical.attempt,
          error: physical.error
        }))
      }))
    }))
  })).catch(error => ({ evaluateError: String(error) }))
  console.log(`[DEBUG ${phase}] providerRequests=${JSON.stringify(providerRequests, null, 2)}`)
  console.log(`[DEBUG ${phase}] scene=${JSON.stringify(scene, null, 2)}`)
}

async function main() {
  await new Promise(resolve => providerServer.listen(MOCK_PORT, '127.0.0.1', resolve))
  removeDir(PROFILE)
  removeDir(EXPORT_ROOT)
  removeDir(LOG_ROOT)
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
  fs.mkdirSync(EXPORT_ROOT, { recursive: true })
  fs.mkdirSync(LOG_ROOT, { recursive: true })
  const electronProcess = startElectron()
  let browser = null
  try {
    assert(await waitForCdp(), 'CDP reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    let page = null
    for (let i = 0; i < 24 && !page; i++) {
      page = browser.contexts()[0]?.pages()?.[0] || null
      if (!page) await sleep(500)
    }
    assert(page, 'renderer page reachable')
    page.on('pageerror', error => console.log('[PAGE ERROR] ' + error.message))
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1500)
    await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
    await sleep(500)
    await page.evaluate(async ({ mockUrl, outline }) => {
      await window.electronAPI.storageWrite('wa_lastProjectId', 'outline-silent-wait-project')
      await window.electronAPI.storageWrite('wa_providers', { providers: [{ id: 'outline-silent-wait-provider', name: 'Outline Silent Wait Mock', baseUrl: mockUrl, apiKey: 'key', models: ['outline-silent-wait-model'], selectedModel: 'outline-silent-wait-model', temperature: 0.1, maxTokens: 4096, purpose: ['generate'], providerType: 'openai-compatible', streamMode: true }], generateProvider: 'outline-silent-wait-provider' })
      await window.electronAPI.storageWrite('wa_project_outline-silent-wait-project', { schemaVersion: 3, projectName: 'Outline Silent Wait Fix', outlineText: outline, outlineLocked: false, outlineLockedText: '', bookWordCount: 0, volumesConfirmed: false, pipelineConfig: { volumeCount: 1, volumeWords: 20000, chapterWords: 2000 }, chaptersConfirmed: false, settingsGenerated: true, settings: [], volumes: [], chapters: {}, settingBindings: {}, settingsCollection: { categories: [], items: {} }, memories: {}, memoryBlacklist: [], aiNaming: null, outlineChat: [], chat: [] })
      await window.electronAPI.storageWrite('wa_deAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
    }, { mockUrl: MOCK_BASE_URL, outline: OUTLINE_TEXT })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1500)
    await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
    await sleep(500)

    await page.click('#btn-outline-workspace')
    await page.waitForSelector('#outline-editor', { timeout: 10000 })
    await page.locator('#outline-editor').fill(OUTLINE_TEXT)
    await page.click('#btn-ai-co-create')
    await page.waitForSelector('#ow-chat-input', { timeout: 10000 })
    await page.evaluate(() => {
      window.__SHENYI_TOOL_RUN_TEST_OVERRIDES__ = { idleTimeoutMs: 2000, hardDeadlineMs: 20000 }
      window.__SHENYI_TOOL_RUN_DIAG_EVENTS__ = []
      window.DiagLogger.subscribe((entry) => {
        if (entry.cat === 'outline/tool-run-supervisor') {
          window.__SHENYI_TOOL_RUN_DIAG_EVENTS__.push(entry)
        }
      })
    })

    scenario = 'tool-then-answer'
    await page.fill('#ow-chat-input', '请检查当前大纲')
    await page.click('#btn-ow-send')
    await page.waitForFunction(() => (document.body.textContent || '').includes('工具检查完成。'), null, { timeout: 30000 })
    await waitIdle(page)
    const toolRun = await latestRun(page, 'outline')
    assert.equal(toolRun?.turns?.at(-1)?.status, 'success', 'tool answer turn succeeds')
    assert(toolRun.apiCalls.some(call => call.streamLength > 0 || call.responseLength > 0), 'api response recorded')
    const toolBubbleText = String(await page.evaluate(() => document.querySelector('#ow-chat-messages')?.textContent || ''))
    assert(!toolBubbleText.includes('editor.get_state') && !toolBubbleText.includes('editor.write'), 'assistant retains no tool identity')
    console.log('[PASS] tool activity is visible in the outline bubble')

    scenario = 'tool-loop-limit'
    await page.fill('#ow-chat-input', '请持续检查当前大纲')
    await page.click('#btn-ow-send')
    try {
      await page.waitForFunction(() => (document.body.textContent || '').includes('基于已有工具结果的收敛回答'), null, { timeout: 60000, polling: 250 })
    } catch (error) {
      const scene = await page.evaluate(() => ({
        body: (document.body.textContent || '').slice(0, 3000),
        streaming: Boolean(document.querySelector('#ow-streaming-message')),
        status: document.querySelector('#chat-generation-status')?.textContent || '',
        latestRun: (() => {
          const run = [...(window.__pinia?.state?.value?.runTrace?.runs || [])].filter(item => item.source === 'outline').sort((a, b) => b.startedAt - a.startedAt)[0]
          return run ? {
            status: run.status,
            events: (run.events || []).slice(-12).map(event => ({ type: event.type, label: event.label, detail: String(event.detail || '').slice(0, 300) })),
            apiCalls: (run.apiCalls || []).slice(-3).map(call => ({ status: call.status, finishReason: call.finishReason, error: call.error, physicalCount: call.physicalCount, physicalPhases: call.physicalPhases }))
          } : null
        })()
      }))
      console.error('[DEBUG] loop-limit scene=' + JSON.stringify(scene, null, 2))
      console.error('[DEBUG] providerRequests=' + JSON.stringify(providerRequests.slice(-5), null, 2))
      throw error
    }
    await waitIdle(page, 60000)
    const loopRun = await latestRun(page, 'outline')
    assert.equal(loopRun?.turns?.at(-1)?.status, 'success', 'converged tool loop succeeds')
    assert(loopRun.apiCalls.some(call => call.finishReason === 'tool_converged' || call.finishReason === 'tool_converged_local'), 'trace records tool_converged')
    assert(loopRun.apiCalls.some(call => (call.physicalPhases || []).includes('tool_convergence')), 'trace records tool_convergence physical request')
    assert(providerRequests.some(request => request.toolNames.length === 0), 'convergence request has no tools')
    assert(providerRequests.some(request => request.messageRoles.includes('system')), 'convergence request carries the stop-tools instruction')
    const loopBubbleText = String(await page.evaluate(() => document.querySelector('#ow-chat-messages')?.textContent || ''))
    assert(!loopBubbleText.includes('editor.get_state') && !loopBubbleText.includes('editor.write'), 'loop warning survives without tool identity')
    console.log('[PASS] zero-text tool loop converges into a final answer')

    scenario = 'hold'
    const holdRequestStarted = Date.now()
    const turnCountBeforeHold = await page.evaluate(sourceName => {
      const run = [...(window.__pinia?.state?.value?.runTrace?.runs || [])].filter(item => item.source === sourceName).sort((a, b) => b.startedAt - a.startedAt)[0]
      return (run?.turns || []).length
    }, 'outline')
    let runningPhysicalSeenAt = 0
    await page.fill('#ow-chat-input', '请取消这次生成')
    await page.click('#btn-ow-send')
    await page.waitForFunction(() => {
      const runs = window.__pinia?.state?.value?.runTrace?.runs || []
      return runs.some(run => run.apiCalls.some(call => (call.physicalCalls || []).some(physical => physical.status === 'running')))
    }, null, { timeout: 2000, polling: 50 })
    runningPhysicalSeenAt = Date.now()
    assert(runningPhysicalSeenAt - holdRequestStarted <= 2000, `running physical call appears within 2s (${runningPhysicalSeenAt - holdRequestStarted}ms)`)
    await page.waitForFunction(({ sourceName, expectedTurnCount }) => {
      const run = [...(window.__pinia?.state?.value?.runTrace?.runs || [])].filter(item => item.source === sourceName).sort((a, b) => b.startedAt - a.startedAt)[0]
      const turns = run?.turns || []
      return turns.length > expectedTurnCount && turns[turns.length - 1].status !== 'running'
    }, { sourceName: 'outline', expectedTurnCount: turnCountBeforeHold }, { timeout: 8000, polling: 100 })
    const supervisorRun = await getLatestRunSnapshot(page, 'outline')
    assert.equal(supervisorRun?.turns?.at(-1)?.status, 'failed', 'supervisor timeout fails the turn')
    assert(['stuck_timeout', 'hard_deadline', 'repeated_tool_error'].includes(supervisorRun?.turns?.at(-1)?.reason || ''), `supervisor reason is classified: ${supervisorRun?.turns?.at(-1)?.reason}`)
    assert(supervisorRun.apiCalls.every(call => call.status !== 'running'), 'supervisor timeout closes api calls')
    assert(supervisorRun.apiCalls.every(call => (call.physicalCalls || []).every(physical => physical.status !== 'running')), 'supervisor timeout closes physical calls')
    assert(supervisorRun.events.some(event => event.type === 'state-stuck-aborted'), 'state-stuck-aborted event is recorded')
    const supervisorDiagEvents = await page.evaluate(() => window.__SHENYI_TOOL_RUN_DIAG_EVENTS__ || [])
    assert(supervisorDiagEvents.length > 0, 'supervisor event reaches the diagnostics log')
    assert(supervisorDiagEvents.some(entry => entry.level === 'warn' && entry.msg.includes('无进展')), 'supervisor diagnostics warn explains the abort')
    const diagLogFile = path.join(LOG_ROOT, `renderer-${new Date().toISOString().slice(0, 10)}.jsonl`)
    const diagLines = fs.readFileSync(diagLogFile, 'utf8').split('\n').filter(line => line.trim())
    assert(diagLines.some(line => JSON.parse(line).cat === 'outline/tool-run-supervisor'), 'supervisor event is persisted to the diagnostics file')
    console.log('[PASS] hold request is visible and aborted by the request-level supervisor')

    scenario = 'user-cancel'
    const turnCountBeforeUserCancel = await page.evaluate(sourceName => {
      const run = [...(window.__pinia?.state?.value?.runTrace?.runs || [])].filter(item => item.source === sourceName).sort((a, b) => b.startedAt - a.startedAt)[0]
      return (run?.turns || []).length
    }, 'outline')
    scenario = 'user-cancel-hold'
    await page.fill('#ow-chat-input', '生成新的第三章内容并写入大纲')
    await page.click('#btn-ow-send')
    await page.waitForFunction(() => {
      const runs = window.__pinia?.state?.value?.runTrace?.runs || []
      return runs.some(run => run.apiCalls.some(call => (call.physicalCalls || []).some(physical => physical.status === 'running')))
    }, null, { timeout: 5000, polling: 50 })
    await page.waitForSelector('#btn-ow-cancel-generation', { timeout: 10000 })
    await page.click('#btn-ow-cancel-generation')
    await page.waitForFunction(({ sourceName, expectedTurnCount }) => {
      const run = [...(window.__pinia?.state?.value?.runTrace?.runs || [])].filter(item => item.source === sourceName).sort((a, b) => b.startedAt - a.startedAt)[0]
      const turns = run?.turns || []
      return turns.length > expectedTurnCount && turns[turns.length - 1].status === 'canceled'
    }, { sourceName: 'outline', expectedTurnCount: turnCountBeforeUserCancel }, { timeout: 10000, polling: 100 })
    await waitIdle(page, 10000)
    const cancelRun = await latestRun(page, 'outline')
    assert.equal(cancelRun?.turns?.at(-1)?.status, 'canceled', 'cancel turn is canceled')
    assert.equal(cancelRun?.turnReasons?.at(-1), 'user_cancel', 'cancel reason is recorded')
    assert(cancelRun.apiCalls.every(call => call.status !== 'running'), 'cancel closes api calls')
    assert(cancelRun.apiCalls.every(call => (call.physicalCalls || []).every(physical => physical.status !== 'running')), 'cancel closes physical calls')
    console.log('[PASS] cancellation preserves the canceled status')

    const exportCheck = await exportLatestTrace(page, 'outline')
    assertExportedRun(exportCheck.runId, 'session-running', exportCheck.exportPath)
    console.log('[PASS] trace export reconciles payload files and integrity markers')

    await browser.close()
    browser = null
    console.log('===== OUTLINE SILENT WAIT FIX E2E PASSED =====')
  } finally {
    try { if (browser) await browser.close() } catch {}
    try { execFileSync('taskkill', ['/PID', String(electronProcess.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
    providerServer.close()
    await sleep(1000)
    removeDir(PROFILE)
    removeDir(EXPORT_ROOT)
    removeDir(LOG_ROOT)
    console.log('[CLEANUP] profile and exports removed')
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
