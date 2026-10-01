import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9269
const MOCK_PORT = 59943
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const PROFILE = path.join(ROOT, '_data', 'api-live-status-profile')
const EXPORT_ROOT = path.join(ROOT, '_data', 'api-live-status-exports')
const SCREENSHOT_ROOT = path.join(ROOT, '_data', 'api-live-status-screenshots')
const PROJECT_ID = 'api-live-status-project'
const OUTLINE_TEXT = ['第一卷 风暴起点', '北方风暴逼近，男主发现旧信。', '第二章 男主决定南下。', '第三章 男主抵达灯塔。'].join('\n')
const BODY_TEXT = '这是第一段实时流式输出。这是第二段实时流式输出。这是第三段实时流式输出。'
const TOOL_NAME = 'editor.get_state'
const GLOBAL_TIMEOUT_MS = 240000

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

const providerRequests = []
let scenario = 'plain-stream'
let toolFirstRequests = 0

const providerServer = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', async () => {
    let body = null
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    providerRequests.push({
      scenario,
      stream: body?.stream,
      toolNames: Array.isArray(body?.tools) ? body.tools.map(tool => tool?.function?.name || tool?.name).filter(Boolean) : []
    })
    console.log(`[MOCK] request=${providerRequests.length} scenario=${scenario} stream=${Boolean(body?.stream)} tools=${providerRequests.at(-1).toolNames.join(',') || '-'}`)

    if (!body?.stream) {
      const isFirstToolRound = scenario === 'tool-first' && toolFirstRequests === 1
      const payload = isFirstToolRound
        ? { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'call-live-status-1', type: 'function', function: { name: TOOL_NAME, arguments: '{}' } }] }, finish_reason: 'tool_calls' }] }
        : { choices: [{ message: { role: 'assistant', content: BODY_TEXT }, finish_reason: 'stop' }] }
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' })
      response.end(JSON.stringify(payload))
      return
    }

    response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' })
    if (scenario === 'plain-stream') {
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant' }, finish_reason: null }] })}\n\n`)
      await sleep(120)
      for (let index = 0; index < BODY_TEXT.length; index += 6) {
        response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: BODY_TEXT.slice(index, index + 6) }, finish_reason: null }] })}\n\n`)
        await sleep(80)
      }
      await sleep(80)
      response.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`)
      response.end()
      return
    }

    if (scenario === 'tool-first') {
      toolFirstRequests += 1
      if (toolFirstRequests === 1) {
        await sleep(120)
        response.write(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-live-status-1', type: 'function', function: { name: TOOL_NAME, arguments: '{}' } }] }, finish_reason: null }] })}\n\n`)
        response.write('data: [DONE]\n\n')
        response.end()
        return
      }

      await sleep(120)
      for (let index = 0; index < BODY_TEXT.length; index += 6) {
        response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: BODY_TEXT.slice(index, index + 6) }, finish_reason: null }] })}\n\n`)
        await sleep(80)
      }
      await sleep(80)
      response.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`)
      response.end()
      return
    }

    response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: BODY_TEXT }, finish_reason: null }] })}\n\n`)
    response.write('data: [DONE]\n\n')
    response.end()
  })
})

const watchdog = setTimeout(() => {
  console.error(`[TIMEOUT] API live status Electron E2E exceeded ${GLOBAL_TIMEOUT_MS}ms (scenario=${scenario})`)
  process.exit(1)
}, GLOBAL_TIMEOUT_MS)
watchdog.unref()

function stage(message) {
  console.log(`[STAGE] ${scenario}: ${message}`)
}

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

async function closeProjectModal(page) {
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
  await sleep(400)
}

async function seedStorage(page) {
  await page.evaluate(async ({ mockUrl, outline, projectId }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'api-live-status-provider',
        name: 'API Live Status Mock',
        baseUrl: mockUrl,
        apiKey: 'key',
        models: ['api-live-status-model'],
        selectedModel: 'api-live-status-model',
        temperature: 0.1,
        maxTokens: 4096,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true
      }],
      generateProvider: 'api-live-status-provider'
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: 'API Live Status E2E',
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
      chat: []
    })
    await window.electronAPI.storageWrite('wa_deAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
  }, { mockUrl: MOCK_BASE_URL, outline: OUTLINE_TEXT, projectId: PROJECT_ID })
}

async function captureOutlineStatus(page, bucket) {
  const lines = await page.locator('#ow-streaming-message .ow-streaming-status .ow-live-status-line').allTextContents()
  if (lines.length) bucket.push(lines)
  return lines
}

async function captureHomeStatus(page, bucket) {
  const lines = await page.locator('#chat-generation-status .chat-live-status-line').allTextContents()
  if (lines.length) bucket.push(lines)
  return lines
}

function assertProgression(samples, label) {
  const flat = samples.flat()
  assert(flat.some(line => line.includes('正在连接 API') || line.includes('正在准备请求') || line.includes('正在接收') || line.includes('正在生成') || line.includes('已收到内容')), `${label}: active phase visible`)
  const streamLines = flat.filter(line => line.includes('流式接收中'))
  assert(streamLines.length > 0, `${label}: streaming line visible`)
  const counts = streamLines.map(line => Number(line.match(/已接收 (\d+) 字/)?.[1] || 0))
  assert(Math.max(...counts) > 0, `${label}: stream count is positive`)
  assert(new Set(counts).size > 1 || counts.length === 1, `${label}: stream count observed`)
}

async function waitOutlineIdle(page, timeout = 30000) {
  let heartbeatBusy = false
  const heartbeat = setInterval(() => {
    if (heartbeatBusy) return
    heartbeatBusy = true
    Promise.race([
      page.evaluate(() => Date.now()),
      sleep(2000).then(() => null)
    ]).then(rendererNow => {
      console.log(`[HEARTBEAT] outline idle renderer=${rendererNow === null ? 'unresponsive' : 'responsive'}`)
    }).catch(error => {
      console.log(`[HEARTBEAT] outline idle renderer=error:${String(error).slice(0, 180)}`)
    }).finally(() => {
      heartbeatBusy = false
    })
  }, 5000)
  try {
    await page.waitForFunction(() => Boolean(document.querySelector('#btn-ow-send') && !document.querySelector('#btn-ow-send')?.disabled), null, { timeout, polling: 200 })
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      sendDisabled: document.querySelector('#btn-ow-send')?.disabled,
      streamingVisible: Boolean(document.querySelector('#ow-streaming-message')),
      messageCount: document.querySelectorAll('#ow-chat-messages .ow-msg').length,
      lastMessage: Array.from(document.querySelectorAll('#ow-chat-messages .ow-msg')).at(-1)?.textContent?.slice(0, 500),
      piniaRunTrace: window.__pinia?.state?.value?.runTrace?.runs?.filter(run => run.source === 'outline').map(run => ({
        status: run.status,
        calls: run.apiCalls?.map(call => ({ status: call.status, responseLength: (call.responseText || '').length, physicalCount: call.physicalCalls?.length }))
      }))
    })).catch(diagnosticError => ({ diagnosticError: String(diagnosticError) }))
    console.error('[DEBUG] outline idle diagnostics=' + JSON.stringify(diagnostics))
    throw error
  } finally {
    clearInterval(heartbeat)
  }
}

async function waitHomeIdle(page, timeout = 30000) {
  await page.waitForFunction(() => Boolean(document.querySelector('#btn-send') && !document.querySelector('#btn-send')?.disabled), null, { timeout, polling: 200 })
}

async function resetOutlineConversation(page) {
  await page.click('#btn-ow-reset-conversation')
  await page.waitForSelector('.app-confirm-overlay', { timeout: 5000 })
  await page.locator('.app-confirm-overlay .btn-danger').click()
  await page.waitForFunction(() => document.querySelectorAll('.app-confirm-overlay').length === 0, null, { timeout: 5000, polling: 100 })
  await page.waitForFunction(() => {
    const messages = document.querySelectorAll('#ow-chat-messages .ow-msg')
    const notice = document.querySelector('#ow-compatibility-notice')?.textContent || ''
    return messages.length === 0 || notice.includes('上下文已重置')
  }, null, { timeout: 5000, polling: 100 })
}

async function readLatestRun(page, source) {
  return page.evaluate(sourceName => {
    const state = window.__pinia?.state?.value || {}
    const store = state.runTrace
    const runs = Array.isArray(store?.runs) ? store.runs : []
    const run = runs.filter(item => item.source === sourceName).sort((a, b) => b.startedAt - a.startedAt)[0]
    return {
      run: run ? {
        status: run.status,
        calls: run.apiCalls.map(call => ({
          status: call.status,
          streamLength: (call.streamText || '').length,
          responseLength: (call.responseText || '').length,
          physicalCount: (call.physicalCalls || []).length,
          toolNames: (call.toolCalls || []).map(tool => tool.name)
        }))
      } : null,
      stateKeys: Object.keys(state),
      runSources: runs.map(item => item.source)
    }
  }, source)
}

async function main() {
  stage('starting mock provider')
  await new Promise(resolve => providerServer.listen(MOCK_PORT, '127.0.0.1', resolve))
  removeDir(PROFILE)
  removeDir(EXPORT_ROOT)
  removeDir(SCREENSHOT_ROOT)
  fs.mkdirSync(SCREENSHOT_ROOT, { recursive: true })
  const electronProcess = startElectron()
  let browser = null
  try {
    stage('waiting for Electron CDP')
    assert(await waitForCdp(), 'CDP reachable')
    stage('connecting to renderer')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    let page = null
    for (let index = 0; index < 24 && !page; index++) {
      page = browser.contexts()[0]?.pages()?.[0] || null
      if (!page) await sleep(500)
    }
    assert(page, 'renderer page reachable')
    page.on('pageerror', error => console.log('[PAGE ERROR] ' + error.message))
    page.on('crash', () => console.error('[PAGE CRASH] renderer process crashed'))
    page.on('close', () => console.error('[PAGE CLOSE] renderer page closed'))
    page.on('requestfailed', request => console.log(`[REQUEST FAILED] ${request.url()} ${request.failure()?.errorText || ''}`))
    page.on('console', message => {
      if (message.type() === 'error' || message.type() === 'warning') console.log(`[PAGE CONSOLE ${message.type().toUpperCase()}] ${message.text().slice(0, 500)}`)
    })
    browser.on('disconnected', () => console.error('[BROWSER DISCONNECTED] CDP connection lost'))
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1200)
    await closeProjectModal(page)
    await seedStorage(page)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1200)
    await closeProjectModal(page)

    // Outline workspace: plain stream.
    stage('opening outline workspace')
    await page.click('#btn-outline-workspace')
    await page.waitForSelector('#outline-editor', { timeout: 10000 })
    await page.locator('#outline-editor').fill(OUTLINE_TEXT)
    stage('opening outline co-creation panel')
    await page.click('#btn-ai-co-create')
    await page.waitForSelector('#ow-chat-input', { timeout: 10000 })
    scenario = 'plain-stream'
    const outlineSamples = []
    await page.fill('#ow-chat-input', '请分析当前大纲')
    await page.click('#btn-ow-send')
    await page.waitForSelector('#ow-streaming-message', { timeout: 10000 })
    for (let index = 0; index < 30; index++) {
      await captureOutlineStatus(page, outlineSamples)
      await page.screenshot({ path: path.join(SCREENSHOT_ROOT, `outline-${String(index).padStart(2, '0')}.png`) })
      await sleep(60)
    }
    await waitOutlineIdle(page)
    console.log('[DEBUG] outline samples=' + JSON.stringify(outlineSamples))
    assertProgression(outlineSamples, 'outline plain')
    const outlineTrace = await readLatestRun(page, 'outline')
    const outlineRun = outlineTrace.run
    if (!outlineRun) console.log('[DEBUG] outline trace store=' + JSON.stringify(outlineTrace))
    assert(outlineRun?.calls?.length > 0, 'outline api call exists')
    assert(outlineRun.calls.every(call => call.status !== 'running'), 'outline api calls close')
    assert(outlineRun.calls.some(call => call.streamLength === BODY_TEXT.length), 'outline stream length matches body')
    console.log('[PASS] outline plain stream live status')

    // Outline workspace: tool first, then answer.
    scenario = 'tool-first'
    stage('resetting outline conversation')
    await resetOutlineConversation(page)
    const toolSamples = []
    stage('sending tool-first prompt')
    await page.fill('#ow-chat-input', '请读取当前大纲编辑器内容后回答第一卷的钩子')
    await page.click('#btn-ow-send')
    stage('waiting for streaming message')
    await page.waitForSelector('#ow-streaming-message', { timeout: 10000 })
    let lastDebugStage = 0
    let wholeUiChecked = false
    for (let index = 0; index < 45; index++) {
      await captureOutlineStatus(page, toolSamples)
      const snapshot = await page.evaluate(() => ({
        sendDisabled: Boolean(document.querySelector('#btn-ow-send')?.disabled),
        toolNodes: Array.from(document.querySelectorAll('.ow-tool-stream, .chat-tool-stream, .ow-tool-stream-item, .chat-tool-stream-item')).length,
        visibleText: document.querySelector('#ow-chat-messages')?.textContent || '',
        streamingVisible: Boolean(document.querySelector('#ow-streaming-message'))
      }))
      if (!wholeUiChecked && snapshot.visibleText.includes(TOOL_NAME)) {
        wholeUiChecked = true
        console.error('[FAIL-EARLY] tool identity leaked into outline chat UI')
        const leakNodes = await page.evaluate((toolName) => {
          const container = document.querySelector('#ow-chat-messages')
          if (!container) return []
          return Array.from(container.querySelectorAll('*'))
            .filter(node => node.children.length === 0 && (node.textContent || '').includes(toolName))
            .slice(0, 12)
            .map(node => ({
              tag: node.tagName,
              className: node.className,
              text: (node.textContent || '').slice(0, 300),
              html: node.outerHTML.slice(0, 1000)
            }))
        }, TOOL_NAME)
        console.error('[FAIL-EARLY] leak nodes=' + JSON.stringify(leakNodes, null, 2))
        await page.screenshot({ path: path.join(SCREENSHOT_ROOT, 'outline-tool-leak.png') })
      }
      if (!snapshot.sendDisabled && providerRequests.length >= 7) break
      if (index % 10 === 0) stage(`tool sampling ${index}/45 requests=${providerRequests.length} wholeUiChecked=${wholeUiChecked}`)
      if (Date.now() - lastDebugStage >= 10000) {
        lastDebugStage = Date.now()
        stage(`tool loop alive index=${index} sendDisabled=${snapshot.sendDisabled} streaming=${snapshot.streamingVisible} requests=${providerRequests.length}`)
      }
      await sleep(60)
    }
    stage(`waiting outline idle requests=${providerRequests.length}`)
    await waitOutlineIdle(page, 50000)
    const wholeUiText = await page.evaluate(() => document.querySelector('#ow-chat-messages')?.textContent || '')
    assert(!wholeUiText.includes(TOOL_NAME), 'outline chat UI never shows tool identity')
    assert(await page.evaluate(() => !document.querySelector('.ow-tool-stream') && !document.querySelector('.chat-tool-stream')), 'outline chat UI has no tool stream nodes')
    await page.screenshot({ path: path.join(SCREENSHOT_ROOT, 'outline-tool-idle.png') })
    const toolTrace = await readLatestRun(page, 'outline')
    const toolRun = toolTrace.run
    const toolLogicalCall = toolRun?.calls?.[0]
    assert(toolRun?.calls?.length === 1, 'outline direct chat records one logical API call')
    assert(toolLogicalCall?.physicalCount >= 2, 'outline tool run should contain both physical requests')
    assert(toolLogicalCall?.toolNames?.includes(TOOL_NAME), 'outline tool run should record native tool execution')
    assert(toolLogicalCall?.streamLength === BODY_TEXT.length, 'outline tool run final stream length matches body')
    assert(toolRun.calls.every(call => call.status !== 'running'), 'outline tool run api calls close')
    const toolStatusText = toolSamples.flat().join('\n')
    assert(!toolStatusText.includes(TOOL_NAME), 'outline status excludes tool identity')
    assert(!toolStatusText.includes('正在执行工具'), 'outline status excludes tool execution phrase')
    assert(!toolStatusText.includes('工具返回：'), 'outline status excludes tool result phrase')
    console.log('[PASS] outline tool phase keeps tool identity out of status bar')

    // Home chat.
    scenario = 'plain-stream'
    stage('closing outline workspace')
    await page.click('#btn-close-outline-workspace')
    await page.waitForSelector('#outline-workspace', { state: 'detached', timeout: 10000 })
    await page.waitForSelector('#user-input', { timeout: 10000 })
    const homeSamples = []
    await page.fill('#user-input', '请输出一段测试文本')
    await page.click('#btn-send')
    await page.waitForSelector('#chat-generation-status', { timeout: 10000 })
    for (let index = 0; index < 30; index++) {
      await captureHomeStatus(page, homeSamples)
      await page.screenshot({ path: path.join(SCREENSHOT_ROOT, `home-${String(index).padStart(2, '0')}.png`) })
      await sleep(60)
    }
    await waitHomeIdle(page)
    assertProgression(homeSamples, 'home plain')
    const homeTrace = await readLatestRun(page, 'home')
    const homeRun = homeTrace.run
    if (!homeRun) console.log('[DEBUG] home trace store=' + JSON.stringify(homeTrace))
    assert(homeRun?.calls?.length > 0, 'home api call exists')
    assert(homeRun.calls.every(call => call.status !== 'running'), 'home api calls close')
    assert(homeRun.calls.some(call => call.streamLength === BODY_TEXT.length), 'home stream length matches body')
    console.log('[PASS] home plain stream live status')

    await browser.close()
    browser = null
    clearTimeout(watchdog)
    console.log('===== API LIVE STATUS ELECTRON E2E PASSED =====')
  } finally {
    try { if (browser) await browser.close() } catch {}
    try { execFileSync('taskkill', ['/PID', String(electronProcess.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
    providerServer.close()
    await sleep(800)
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
