import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9231
const PROFILE = path.join(ROOT, '_data', 'chain-ownership-e2e-profile')
const MOCK_PORT = 59873
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const PROVIDER_ID = 'chain-ownership-e2e-provider'
const MODEL = 'chain-ownership-e2e-model'
const STEP_ONE_MARKER = '链路第一步唯一输出锚点'
const STEP_ONE_OUTPUT = STEP_ONE_MARKER.repeat(80)
const STEP_TWO_OUTPUT = '链路第二步定稿输出完成'

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
  console.log('[PASS] ' + message)
}

const providerRequests = []
const server = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    let body = null
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {}
    providerRequests.push({ url: request.url, body })
    const text = providerRequests.length === 1 ? STEP_ONE_OUTPUT : STEP_TWO_OUTPUT
    // Handle non-streaming requests (tools, JSON mode, etc.)
    if (body?.stream === false) {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({
        id: 'chatcmpl-chain-ownership',
        object: 'chat.completion',
        choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }
      }))
      return
    }
    // Streaming SSE - match depth-v2 format exactly
    const events = [
      { choices: [{ delta: { content: text }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
    ]
    const stream = events.map(e => `data: ${JSON.stringify(e)}`).join('\n\n') + '\n\ndata: [DONE]\n\n'
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
    })
    response.end(stream)
  })
})

let electronProcess = null

function startElectron() {
  electronProcess = spawn(
    ELECTRON_EXE,
    ['.', `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', `--user-data-dir=${PROFILE}`],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } },
  )
  electronProcess.stdout.on('data', data => {
    const text = String(data)
    if (/Uncaught|unhandledRejection/i.test(text)) console.log('[ELECTRON:stdout] ' + text.slice(0, 400))
  })
  electronProcess.stderr.on('data', data => {
    const text = String(data)
    if (/Uncaught|unhandledRejection|EADDRINUSE/i.test(text)) console.log('[ELECTRON:stderr] ' + text.slice(0, 400))
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
  try {
    execFileSync('taskkill', ['/PID', String(electronProcess.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {}
  electronProcess = null
}

function removeProfile() {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.rmSync(PROFILE, { recursive: true, force: true })
      return
    } catch (error) {
      if (attempt === 4) throw error
      sleep(1000)
    }
  }
}

function requestText(request) {
  return (request?.body?.messages || [])
    .map(message => String(message.content || ''))
    .join('\n')
}

async function main() {
  await new Promise(resolve => server.listen(MOCK_PORT, '127.0.0.1', resolve))
  fs.rmSync(PROFILE, { recursive: true, force: true })
  startElectron()
  try {
    assert(await waitForCdp(), 'source Electron CDP reachable')
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    let page = null
    for (let index = 0; index < 24; index++) {
      const pages = browser.contexts()[0]?.pages() || []
      if (pages.length) {
        page = pages[0]
        break
      }
      await sleep(500)
    }
    assert(page, 'renderer page reachable')
    page.on('pageerror', error => console.log('[PAGE ERROR] ' + error.message))
    page.on('console', message => {
      if (['error', 'warning'].includes(message.type())) console.log(`[PAGE ${message.type().toUpperCase()}] ${message.text()}`)
    })
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1500)
    await page.evaluate(() => {
      document.querySelector('.project-modal-content .btn-close')?.click()
    })
    await sleep(500)
    await page.evaluate(async () => {
      const projectStore = window.__pinia._s.get('project')
      projectStore.outlineChat = []
      await window.__pinia._s.get('__conversationContextService')?.clearSession?.({
        projectId: String(projectStore.currentProjectId || 'default'),
        workspace: 'outline',
        purpose: 'generate',
      })
      await projectStore.saveProject()
    })

    await page.evaluate(async ({ providerConfig }) => {
      await window.electronAPI.storageRemove('wa_project_default')
      await window.electronAPI.storageRemove('wa_project-default')
      await window.electronAPI.storageRemove('wa_ctx_default')
      await window.electronAPI.storageRemove('wa_ctx_undefined')
      await window.electronAPI.storageRemove('wa_ctx-default')
      await window.electronAPI.storageWrite('wa_lastProjectId', 'default')
      await window.electronAPI.storageRemove('wa_ctx_default')
      await window.electronAPI.storageRemove('wa_ctx-default')
      await window.electronAPI.storageWrite('wa_providers', providerConfig)
      await window.electronAPI.storageWrite('wa_skills', {
        skills: [
          {
            id: 'chain-ownership-s1',
            name: '链路测试一',
            template: '你是链路测试技能一，只输出当前步骤定稿产物。',
            format: 'text',
            injectMode: 'system_prefix',
            boundTo: ['outline'],
            intents: ['generate'],
          },
          {
            id: 'chain-ownership-s2',
            name: '链路测试二',
            template: '你是链路测试技能二，只输出当前步骤定稿产物。',
            format: 'text',
            injectMode: 'system_prefix',
            boundTo: ['outline'],
            intents: ['generate'],
          },
        ],
        pipelineSkills: [],
      })
      await window.electronAPI.storageWrite('wa_pipeline_step_config', {
        agents: { 0: '' },
        skills: { 0: ['chain-ownership-s1', 'chain-ownership-s2'] },
        modes: { 0: 'chain' },
        skillAgents: {},
      })
    }, {
      providerConfig: {
        providers: [{
          id: PROVIDER_ID,
          name: 'Chain Ownership Mock',
          baseUrl: MOCK_BASE_URL,
          apiKey: 'chain-ownership-key',
          models: [MODEL],
          selectedModel: MODEL,
          temperature: 0.1,
          maxTokens: 4096,
          purpose: ['generate'],
          providerType: 'openai-compatible',
          streamMode: true,
        }],
        generateProvider: PROVIDER_ID,
      },
    })
    await sleep(500)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1500)
    await page.evaluate(() => {
      document.querySelector('.project-modal-content .btn-close')?.click()
    })
    await sleep(500)

    const skillState = await page.evaluate(() => {
      const skillStore = window.__pinia?._s?.get('skill')
      return (skillStore?.skills || []).map(skill => skill.id)
    })
    assert(skillState.includes('chain-ownership-s1') && skillState.includes('chain-ownership-s2'), 'two chain skills loaded in real store')

    await page.click('#btn-outline-workspace')
    await page.waitForSelector('#outline-editor', { timeout: 10000 })
    await page.evaluate(() => {
      window.__pinia?._s?.get('runTrace')?.abandonRunningRun?.('outline')
    })
    await page.click('#btn-ai-co-create')
    await page.waitForSelector('#ow-chat-input', { timeout: 10000 })
    await page.selectOption('#ow-skill-mode', 'chain')
    await page.fill('#ow-chat-input', '请生成链路测试内容')
    await page.click('#btn-ow-send')

    await page.waitForFunction(() => {
      const messages = window.__pinia?.state?.value?.project?.outlineChat || []
      const last = messages.filter(message => message.role === 'assistant').at(-1)
      return Boolean(last && String(last.content || '').includes('链路第二步定稿输出完成'))
    }, null, { timeout: 60000, polling: 300 }).catch(async error => {
      const debug = await page.evaluate(() => {
        const state = window.__pinia?.state?.value || {}
        const run = (state.runTrace?.runs || []).filter(item => item.source === 'outline').at(-1)
        return {
          outlineChat: (state.project?.outlineChat || []).map(message => ({
            role: message.role,
            status: message.status,
            contentPreview: String(message.content || '').slice(0, 120),
            routingFallback: message.routingFallback || null,
            budgetExhausted: message.budgetExhausted || null,
          })),
          run: run ? {
            status: run.status,
            mode: run.mode,
            apiCalls: run.apiCalls?.map(call => ({ skillName: call.skillName, status: call.status })),
            events: (run.events || []).map(event => ({ type: event.type, level: event.level, label: event.label, detail: event.detail })),
          } : null,
          sendDisabled: document.querySelector('#btn-ow-send')?.disabled ?? null,
        }
      })
      console.log('[TIMEOUT_DEBUG] providerRequests=' + providerRequests.length)
      console.log('[TIMEOUT_DEBUG] ' + JSON.stringify(debug, null, 2).slice(0, 12000))
      throw error
    })
    assert(providerRequests.length === 2, `real UI chain made ${providerRequests.length} provider calls`)

    const firstText = requestText(providerRequests[0])
    const secondText = requestText(providerRequests[1])
    assert(!firstText.includes(STEP_ONE_OUTPUT), 'first request does not preload a previous output')
    assert(secondText.includes(STEP_ONE_MARKER), 'second request receives the previous step output')
    const occurrenceCount = secondText.split(STEP_ONE_OUTPUT).length - 1
    assert(occurrenceCount === 1, `second request contains previous output ${occurrenceCount} time(s), expected 1`)

    await page.waitForFunction(() => {
      const button = document.querySelector('#btn-ow-send')
      return Boolean(button && !button.disabled)
    }, null, { timeout: 30000, polling: 300 })

    const trace = await page.evaluate(() => {
      const state = window.__pinia?.state?.value?.runTrace
      const run = (state?.runs || []).filter(item => item.source === 'outline').at(-1)
      return {
        found: Boolean(run),
        apiCalls: run?.apiCalls?.length || 0,
        physicalCalls: run?.apiCalls?.reduce((total, call) => total + (call.physicalCalls?.length || 0), 0) || 0,
      }
    })
    assert(trace.found, 'outline run trace exists')
    assert(trace.apiCalls === 2, `run trace records ${trace.apiCalls} API calls`)
    assert(trace.physicalCalls === 2, `run trace records ${trace.physicalCalls} physical calls`)

    console.log('\n===== CHAIN SINGLE OWNERSHIP E2E PASSED =====')
  } finally {
    stopElectron()
    server.close()
    await sleep(1000)
    removeProfile()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
