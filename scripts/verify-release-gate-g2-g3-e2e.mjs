import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9253
const PROFILE = path.join(ROOT, '_data', 'release-gate-g2-g3-profile')
const DATA_DIR = path.join(PROFILE, 'app-data')
const MOCK_PORT = 59907
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const PROVIDER_ID = 'release-gate-mock-provider'
const MODEL = 'release-gate-mock-model'

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

let scenario = 'normal'
const providerRequests = []

function sse(response, events) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
  })
  response.write(events.map(event => `data: ${JSON.stringify(event)}`).join('\n\n') + '\n\n')
  response.write('data: [DONE]\n\n')
  response.end()
}

const providerServer = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    let body = null
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    providerRequests.push(body)

    if (scenario === 'timeout') {
      response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' })
      return
    }
    if (scenario === 'hold') {
      // Hold the physical response open so cancellation exercises the real
      // main-process stream bridge instead of a renderer fetch hook.
      response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' })
      response.write(': release-gate-hold\n\n')
      return
    }
    if (scenario === 'http-failure') {
      response.writeHead(503, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ error: { message: 'provider unavailable' } }))
      return
    }
    if (scenario === 'long-reasoning') {
      const deltaReasoning = '思'.repeat(64)
      const count = 2048
      response.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
      })
      let interval = setInterval(() => {
        const event = {
          choices: [{
            delta: { reasoning_content: deltaReasoning },
            finish_reason: null,
          }],
        }
        response.write(`data: ${JSON.stringify(event)}\n\n`)
      }, 5)
      setTimeout(() => {
        clearInterval(interval)
        response.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'length' }] })}\n\n`)
        response.write('data: [DONE]\n\n')
        response.end()
      }, 5 * count + 500)
      return
    }

    if (scenario === 'reasoning-empty') {
      sse(response, [
        { choices: [{ delta: { reasoning_content: '模型只输出思考。'.repeat(20) }, finish_reason: null }] },
        { choices: [{ delta: { content: '' }, finish_reason: 'length' }] },
      ])
      return
    }
    if (scenario === 'reasoning-empty-retry') {
      sse(response, [
        { choices: [{ delta: { reasoning_content: '重试仍在思考。'.repeat(10) }, finish_reason: null }] },
        { choices: [{ delta: { content: '' }, finish_reason: 'length' }] },
      ])
      return
    }

    sse(response, [
      { choices: [{ delta: { content: '这是可用正文。' }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
    ])
  })
})

let electronProcess = null
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
      SHENYI_TEST_USER_DATA_DIR: DATA_DIR,
    },
    windowsHide: true,
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

async function waitForCdp(timeout = 30000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)
      if (response.ok) return true
    } catch {}
    await sleep(500)
  }
  return false
}

function stopElectron() {
  if (!electronProcess?.pid) return
  try { execFileSync('taskkill', ['/PID', String(electronProcess.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
  electronProcess = null
}

function removeTempDir(dir) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try { fs.rmSync(dir, { recursive: true, force: true }); return } catch {}
  }
  console.warn('[WARN] cleanup failed: ' + dir)
}

async function installRendererProbe(page) {
  await page.evaluate(() => {
    window.__shenyiHeartbeat = {
      running: false,
      last: 0,
      maxGap: 0,
      samples: 0,
    }
    const tick = () => {
      const now = performance.now()
      const state = window.__shenyiHeartbeat
      if (state.running) {
        const gap = now - state.last
        state.maxGap = Math.max(state.maxGap, gap)
        state.samples++
      }
      state.last = now
      window.requestAnimationFrame(tick)
    }
    window.requestAnimationFrame(tick)
  })
}

async function startHeartbeat(page) {
  await page.evaluate(() => {
    window.__shenyiHeartbeat.running = true
    window.__shenyiHeartbeat.maxGap = 0
    window.__shenyiHeartbeat.samples = 0
  })
}

async function stopHeartbeat(page) {
  return page.evaluate(() => {
    const state = window.__shenyiHeartbeat
    state.running = false
    return { maxGap: Math.round(state.maxGap), samples: state.samples }
  })
}

async function latestHomeRun(page) {
  return page.evaluate(() => {
    const run = [...(window.__pinia?.state?.value?.runTrace?.runs || [])]
      .filter(item => item.source === 'home')
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    return run ? {
      id: run.id,
      status: run.status,
      events: (run.events || []).map(event => ({ type: event.type, level: event.level, label: event.label, detail: event.detail })),
      turns: (run.turns || []).map(turn => ({ status: turn.status, error: turn.error })),
      apiCalls: (run.apiCalls || []).map(call => ({
        status: call.status,
        skillName: call.skillName,
        error: call.error,
        physicalCalls: (call.physicalCalls || []).map(physical => ({ phase: physical.phase, status: physical.status, error: physical.error, streamLength: (physical.streamText || '').length, reasoningLength: (physical.reasoningText || '').length })),
      })),
    } : null
  })
}

async function waitNotStreaming(page, timeout = 120000) {
  try {
    await page.waitForFunction(() => {
      const button = document.querySelector('#btn-send')
      return Boolean(button && !button.disabled)
    }, null, { timeout, polling: 250 })
  } catch (error) {
    const run = await latestHomeRun(page).catch(() => null)
    console.log('[WAIT-NOT-STREAMING:DEBUG] ' + JSON.stringify(run))
    throw error
  }
}

async function sendMessage(page, text) {
  await page.fill('#user-input', text)
  await page.click('#btn-send')
}

async function main() {
  await new Promise(resolve => providerServer.listen(MOCK_PORT, '127.0.0.1', resolve))
  fs.rmSync(PROFILE, { recursive: true, force: true })
  fs.mkdirSync(DATA_DIR, { recursive: true })
  startElectron()
  try {
    assert(await waitForCdp(), 'source Electron CDP reachable')
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    let page = null
    for (let index = 0; index < 24; index++) {
      const pages = browser.contexts()[0]?.pages() || []
      if (pages.length) { page = pages[0]; break }
      await sleep(500)
    }
    assert(page, 'renderer page reachable')
    page.on('pageerror', error => console.log('[PAGE ERROR] ' + error.message))
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1500)
    await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
    await sleep(500)

    await page.evaluate(async ({ providerConfig }) => {
      await window.electronAPI.storageWrite('wa_lastProjectId', 'default')
      await window.electronAPI.storageWrite('wa_providers', providerConfig)
      await window.electronAPI.storageWrite('wa_skills', { skills: [], pipelineSkills: [], deAiSkills: [] })
      await window.electronAPI.storageWrite('wa_pipeline_step_config', {
        agents: { 0: '', 1: '', 2: '', 3: '', 4: '' },
        skills: { 0: [], 1: [], 2: [], 3: [], 4: [] },
        modes: { 0: 'compose', 1: 'compose', 2: 'chain', 3: 'chain', 4: 'chain' },
        skillAgents: {},
      })
    }, {
      providerConfig: {
        providers: [{
          id: PROVIDER_ID,
          name: 'Release Gate Mock',
          baseUrl: MOCK_BASE_URL,
          apiKey: 'release-gate-key',
          models: [MODEL],
          selectedModel: MODEL,
          temperature: 0.1,
          maxTokens: 128000,
          purpose: ['generate'],
          providerType: 'openai-compatible',
          streamMode: true,
        }],
        generateProvider: PROVIDER_ID,
      },
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1500)
    await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
    await sleep(500)
    await installRendererProbe(page)

    // G2: long reasoning-only stream, 2048 deltas and about 131k reasoning chars.
    scenario = 'long-reasoning'
    providerRequests.length = 0
    await startHeartbeat(page)
    await sendMessage(page, '长思考压力测试')
    await page.waitForSelector('#chat-generation-status', { timeout: 10000 })
    const longStart = Date.now()
    await waitNotStreaming(page, 30000)
    const heartbeat = await stopHeartbeat(page)
    const longRun = await latestHomeRun(page)
    console.log('[G2:DEBUG] ' + JSON.stringify(longRun))
    console.log('[G2] durationMs=' + (Date.now() - longStart) + ' maxUnresponsiveMs=' + heartbeat.maxGap + ' samples=' + heartbeat.samples)
    assert(heartbeat.maxGap < 500, `G2 UI max unresponsive window is ${heartbeat.maxGap}ms (<500ms)`)
    assert(longRun?.turns?.at(-1)?.status === 'failed', 'G2 long reasoning-only turn should finish failed')
    assert(longRun.events.some(event => event.type === 'generation-invalid'), 'G2 should record generation-invalid')
    assert(longRun.events.some(event => event.type === 'direct-retry-start'), 'G2 should record direct-retry-start')
    assert(longRun.events.some(event => event.type === 'direct-retry-finished'), 'G2 should record direct-retry-finished')
    assert(longRun.apiCalls.some(call => call.error?.includes('思考耗尽输出预算')), 'G2 should expose reasoning exhaustion')
    assert(longRun.apiCalls.some(call => call.physicalCalls.some(physical => physical.reasoningLength > 0)), 'G2 should preserve reasoning in physical trace')
    console.log('[PASS] G2: long reasoning-only stream stays responsive and trace-visible')

    // G3: timeout is visible, retried, and fully traced.
    scenario = 'timeout'
    providerRequests.length = 0
    await page.evaluate(providerId => {
      const providerStore = window.__pinia._s.get('provider')
      const provider = providerStore.providers.find(item => item.id === providerId)
      provider.timeoutMs = 1000
      providerStore.saveProviders()
    }, PROVIDER_ID)
    await sendMessage(page, '超时路径测试')
    await page.waitForSelector('#chat-generation-status', { timeout: 10000 })
    await waitNotStreaming(page, 60000)
    const timeoutRun = await latestHomeRun(page)
    assert(timeoutRun?.status === 'failed', 'G3 timeout run should finish failed')
    assert(timeoutRun.apiCalls.some(call => call.physicalCalls.some(physical => physical.status === 'failed' && physical.error?.includes('请求超时'))), 'G3 timeout should record physical failure')
    assert(timeoutRun.turns.at(-1)?.status === 'failed', 'G3 timeout turn should be failed')
    console.log('[PASS] G3: timeout is visible and fully traced')
    await page.evaluate(providerId => {
      const providerStore = window.__pinia._s.get('provider')
      const provider = providerStore.providers.find(item => item.id === providerId)
      provider.timeoutMs = undefined
      providerStore.saveProviders()
    }, PROVIDER_ID)

    // G3: user cancellation closes the request and trace without waiting for timeout.
    scenario = 'hold'
    providerRequests.length = 0
    await page.evaluate(providerId => {
      const providerStore = window.__pinia._s.get('provider')
      const provider = providerStore.providers.find(item => item.id === providerId)
      provider.timeoutMs = 60000
      providerStore.saveProviders()
    }, PROVIDER_ID)
    await sendMessage(page, '取消路径测试')
    await page.waitForSelector('#chat-generation-status', { timeout: 10000 })
    await page.waitForSelector('#btn-cancel-generation', { timeout: 10000 })
    await page.click('#btn-cancel-generation')
    await waitNotStreaming(page, 10000)
    const cancelRun = await latestHomeRun(page)
    assert(cancelRun?.turns.at(-1)?.status === 'canceled', 'G3 cancellation turn should be canceled')
    assert(cancelRun.apiCalls.every(call => call.status !== 'running'), 'G3 cancellation should close running API calls')
    console.log('[PASS] G3: cancellation is immediate and trace-closed')

    // G3: consecutive provider failures are trace-complete.
    scenario = 'http-failure'
    providerRequests.length = 0
    await sendMessage(page, '连续失败路径测试')
    await page.waitForSelector('#chat-generation-status', { timeout: 10000 })
    await waitNotStreaming(page, 60000)
    const failureRun = await latestHomeRun(page)
    assert(failureRun?.status === 'failed', 'G3 consecutive failure run should finish failed')
    assert(providerRequests.length >= 2, `G3 consecutive failure made ${providerRequests.length} physical requests`)
    assert(failureRun.apiCalls.some(call => call.physicalCalls.some(physical => physical.status === 'failed')), 'G3 consecutive failures should record physical calls')
    console.log('[PASS] G3: consecutive failures are trace-complete')

    // G3: reasoning-empty direct chat retries once, then fails with an explainable message.
    scenario = 'reasoning-empty'
    providerRequests.length = 0
    await sendMessage(page, '空正文路径测试')
    await page.waitForSelector('#chat-generation-status', { timeout: 10000 })
    await page.waitForFunction(() => {
      const text = document.querySelector('#chat-generation-status-text')?.textContent || ''
      return text.includes('直出模式')
    }, null, { timeout: 10000, polling: 200 }).catch(() => {})
    scenario = 'reasoning-empty-retry'
    await waitNotStreaming(page, 60000)
    const emptyRun = await latestHomeRun(page)
    assert(providerRequests.length >= 2, `G3 empty body made ${providerRequests.length} calls (expected >=2)`)
    assert(emptyRun?.status === 'failed', 'G3 empty body run should finish failed')
    assert(emptyRun.events.some(event => event.type === 'generation-invalid'), 'G3 empty body should record generation-invalid')
    assert(emptyRun.events.some(event => event.type === 'direct-retry-start'), 'G3 empty body should record direct-retry-start')
    assert(emptyRun.events.some(event => event.type === 'direct-retry-finished'), 'G3 empty body should record direct-retry-finished')
    assert(emptyRun.apiCalls.some(call => call.error?.includes('思考耗尽输出预算')), 'G3 empty body should explain reasoning exhaustion')
    console.log('[PASS] G3: reasoning-empty direct chat retries once and fails explainably')

    // G4 resource evidence for the same renderer after the pressure run.
    const resourceMetrics = await page.evaluate(async () => {
      if (!performance?.memory) return null
      return { usedJsHeapMb: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) }
    })
    console.log('[RESOURCE] ' + JSON.stringify(resourceMetrics))
    console.log('===== RELEASE GATE G2/G3 E2E PASSED =====')
    await browser.close()
  } finally {
    stopElectron()
    await new Promise(resolve => providerServer.close(resolve))
    await sleep(1000)
    if (process.env.SHENYI_E2E_KEEP_PROFILE !== '1') removeTempDir(PROFILE)
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
