import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = path.resolve(process.cwd())
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9284
const MOCK_PORT = 59947
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const PROFILE = path.join(ROOT, '_data', 'agent-sub-agent-profile')
const OUTPUT_FILE = path.join(ROOT, '_audit', 'verification-agent-sub-agent-electron', 'evidence.json')
const PROJECT_ID = 'agent-sub-agent-project'
const OUTLINE_TEXT = ['第一卷 风暴起点', '第一章 男主发现旧信。', '第二章 男主决定南下。'].join('\n')
const OUTLINE_LONG_TEXT = OUTLINE_TEXT
const FINAL_BODY = '外层任务已经完成：子 Agent 已顺序执行，最终正文可写入。'
const SUB_AGENT_BODY = '子任务完成：已确认第一卷钩子并返回结论。'
const GLOBAL_TIMEOUT_MS = 300_000

const AGENT_TOOLS = ['agent.spawn', 'agent.wait', 'agent.cancel']

function sseResponse(response, payload) {
  const message = payload.choices?.[0]?.message || {}
  response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' })
  response.end(`data: ${JSON.stringify({
    id: 'agent-sub-agent-electron',
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
  })}

data: [DONE]

`)
}
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function removeDir(target) {
  if (!fs.existsSync(target)) return
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.rmSync(target, { recursive: true, force: true })
      return
    } catch {}
    await sleep(400)
  }
}

const requests = []
let mode = 'outline'
let capturePage = null

function lastAssistantToolCallName(messages) {
  const assistantMessages = (Array.isArray(messages) ? messages : [])
    .filter(message => message?.role === 'assistant' && Array.isArray(message?.tool_calls))
  const last = assistantMessages.at(-1)
  return last?.tool_calls?.at(-1)?.function?.name || null
}

function lastToolResultName(messages) {
  const toolMessages = (Array.isArray(messages) ? messages : [])
    .filter(message => message?.role === 'tool' && typeof message?.content === 'string')
  const last = toolMessages.at(-1)
  if (!last) return null
  try {
    const payload = JSON.parse(last.content)
    return payload?.data?.task?.status || payload?.data?.status || payload?.status || null
  } catch {
    return null
  }
}

function requestShape(body) {
  const toolNames = (Array.isArray(body?.tools) ? body.tools : [])
    .map(tool => tool?.function?.name || tool?.name)
    .filter(Boolean)
  return {
    isOuter: toolNames.includes('agent.spawn'),
    toolNames,
    lastToolCall: lastAssistantToolCallName(body?.messages),
    lastToolResult: lastToolResultName(body?.messages),
  }
}

const providerServer = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    let body = null
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    const shape = requestShape(body)
    requests.push({ mode, ...shape })
    console.log(`[MOCK] mode=${mode} outer=${shape.isOuter} last=${shape.lastToolCall || '-'} tools=${shape.toolNames.join(',') || '-'}`)
    capturePage?.console?.({
      type: 'warning',
      text: `[VERIFY][MOCK] outer=${shape.isOuter} last=${shape.lastToolCall || '-'} result=${shape.lastToolResult || '-'}`,
    })

    if (!shape.isOuter) {
      sseResponse(response, {
        choices: [{ message: { role: 'assistant', content: SUB_AGENT_BODY }, finish_reason: 'stop' }],
      })
      return
    }

    if (!shape.lastToolCall) {
      sseResponse(response, {
        choices: [{
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: `call-agent-spawn-${requests.length}`,
              type: 'function',
              function: {
                name: 'agent.spawn',
                arguments: JSON.stringify({ taskId: 'sub-agent-1', goal: '检查第一卷钩子' }),
              },
            }],
          },
          finish_reason: 'tool_calls',
        }],
      })
      return
    }

    if (shape.lastToolCall === 'agent.spawn') {
      sseResponse(response, {
        choices: [{
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: `call-agent-wait-${requests.length}`,
              type: 'function',
              function: {
                name: 'agent.wait',
                arguments: JSON.stringify({ taskId: 'sub-agent-1', timeoutMs: 10000 }),
              },
            }],
          },
          finish_reason: 'tool_calls',
        }],
      })
      return
    }

    if (shape.lastToolCall === 'agent.wait' && shape.lastToolResult === 'completed') {
      sseResponse(response, {
        choices: [{ message: { role: 'assistant', content: FINAL_BODY }, finish_reason: 'stop' }],
      })
      return
    }

    sseResponse(response, {
      choices: [{ message: { role: 'assistant', content: FINAL_BODY }, finish_reason: 'stop' }],
    })
  })
})

const watchdog = setTimeout(() => {
  console.error(`[TIMEOUT] Agent sub-agent Electron verification exceeded ${GLOBAL_TIMEOUT_MS}ms`)
  process.exit(1)
}, GLOBAL_TIMEOUT_MS)
watchdog.unref()

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
  app.kill()
  const deadline = Date.now() + 10_000
  while (app.exitCode === null && Date.now() < deadline) await sleep(200)
  if (app.exitCode === null && process.platform === 'win32') {
    try { execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
  }
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
        id: 'agent-sub-agent-provider',
        name: 'Agent Sub Agent Mock',
        baseUrl: mockUrl,
        apiKey: 'key',
        models: ['agent-sub-agent-model'],
        selectedModel: 'agent-sub-agent-model',
        temperature: 0.1,
        maxTokens: 4096,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: false
      }],
      generateProvider: 'agent-sub-agent-provider'
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: 'Agent Sub Agent E2E',
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
      turns: (run.turns || []).map(turn => ({
        status: turn.status,
        reason: turn.reason,
        userRequest: turn.userRequest,
      })),
      events: run.events.map(event => ({
        type: event.type,
        level: event.level,
        label: event.label,
      })),
      calls: run.apiCalls.map(call => ({
        id: call.id,
        status: call.status,
        responseText: call.responseText || '',
        toolNames: (call.toolCalls || []).map(tool => tool.name),
        physicalCalls: (call.physicalCalls || []).map(physical => ({
          status: physical.status,
          responseText: physical.responseText || '',
          maxTokens: physical.maxTokens,
        })),
      })),
    }
  }, { sourceName: source, sinceTimestamp: since })
}

function verifyWorkspaceResult(label, run, modeRequests, mode) {
  assert(run, `${label}: run trace exists`)
  // Chat runs intentionally stay open so later turns aggregate into one trace.
  // Their closure invariant is therefore turn/call-level, not run-level.
  if (run.sessionKind === 'chat') {
    assert(!run.hasCurrentTurn, `${label}: chat run has no open turn`)
    assert((run.turns || []).length > 0, `${label}: chat run records the completed turn`)
    assert(run.turns.every(turn => turn.status !== 'running'), `${label}: every chat turn is closed`)
    assert(run.turns.some(turn => turn.status === 'success'), `${label}: completed chat turn is successful`)
  } else {
    assert(run.status !== 'running', `${label}: run is not left running`)
  }
  assert(run.calls.length === 1, `${label}: exactly one logical API call is recorded`)
  const call = run.calls[0]
  assert(call.status !== 'running', `${label}: logical call is closed`)
  assert(call.physicalCalls.every(physical => physical.status !== 'running'), `${label}: every physical call is closed`)
  assert(call.responseText.includes(FINAL_BODY), `${label}: final response text reaches trace`)
  assert(AGENT_TOOLS.every(name => call.toolNames.includes(name) || name === 'agent.cancel'), `${label}: spawn/wait recorded`)
  assert(call.toolNames.includes('agent.spawn'), `${label}: agent.spawn recorded`)
  assert(call.toolNames.includes('agent.wait'), `${label}: agent.wait recorded`)
  assert(run.events.some(event => event.type.startsWith('agent-sub-agent-')), `${label}: sub-agent events recorded`)

  const outerRequests = modeRequests.filter(item => item.isOuter)
  const subAgentRequests = modeRequests.filter(item => !item.isOuter)
  assert(outerRequests.length >= 3, `${label}: outer requests include spawn, wait, final`)
  assert(subAgentRequests.length === 1, `${label}: one real sub-agent request`)
  assert(outerRequests.every(item => AGENT_TOOLS.every(name => item.toolNames.includes(name))), `${label}: outer request exposes agent tools`)
  assert(subAgentRequests.every(item => AGENT_TOOLS.every(name => !item.toolNames.includes(name))), `${label}: sub-agent request never exposes agent tools`)
  assert(call.physicalCalls.length >= outerRequests.length + subAgentRequests.length, `${label}: physical calls include sub-agent request`)
}

async function runOutlineScenario(page) {
  const startedAt = Date.now()
  const requestStart = requests.length
  await page.click('#btn-outline-workspace')
  await page.waitForSelector('#outline-editor', { timeout: 10_000 })
  await page.evaluate(text => {
    const editor = document.querySelector('#outline-editor')
    if (!editor) throw new Error('outline editor not found')
    editor.value = text
    editor.dispatchEvent(new Event('input', { bubbles: true }))
    editor.dispatchEvent(new Event('change', { bubbles: true }))
  }, OUTLINE_LONG_TEXT)
  await sleep(300)
  await page.evaluate(() => document.activeElement?.blur?.())
  await sleep(300)
  await page.click('#btn-ai-co-create')
  await page.waitForSelector('#ow-chat-input', { timeout: 10_000 })
  await page.fill('#ow-chat-input', '请安排一个子任务检查第一卷钩子，然后告诉我结论')
  await page.evaluate(() => document.activeElement?.blur?.())
  await sleep(300)
  await page.click('#btn-ow-send')
  await page.waitForFunction(() => {
    const button = document.querySelector('#btn-ow-send')
    return Boolean(button && !button.disabled)
  }, null, { timeout: 60_000, polling: 200 })
  const visibleText = await page.evaluate(() => document.querySelector('#ow-chat-messages')?.textContent || '')
  assert(visibleText.includes(FINAL_BODY), 'outline UI shows final body')
  for (const toolName of AGENT_TOOLS) {
    assert(!visibleText.includes(toolName), `outline UI does not leak ${toolName}`)
  }
  const run = await readLatestRun(page, 'outline', startedAt)
  verifyWorkspaceResult('outline', run, requests.slice(requestStart), 'outline')
  await page.click('#btn-close-outline-workspace')
  await page.waitForSelector('#outline-workspace', { state: 'detached', timeout: 10_000 })
}

async function runHomeScenario(page) {
  const startedAt = Date.now()
  const requestStart = requests.length
  await page.waitForSelector('#user-input', { timeout: 10_000 })
  await page.fill('#user-input', '请安排一个子任务检查第一卷钩子，然后告诉我结论')
  await page.evaluate(() => document.activeElement?.blur?.())
  await sleep(300)
  await page.click('#btn-send')
  await page.waitForFunction(() => {
    const button = document.querySelector('#btn-send')
    return Boolean(button && !button.disabled)
  }, null, { timeout: 60_000, polling: 200 })
  const visibleText = await page.evaluate(() => document.querySelector('#messages-list')?.textContent || '')
  assert(visibleText.includes(FINAL_BODY), 'home UI shows final body')
  for (const toolName of AGENT_TOOLS) {
    assert(!visibleText.includes(toolName), `home UI does not leak ${toolName}`)
  }
  const run = await readLatestRun(page, 'home', startedAt)
  verifyWorkspaceResult('home', run, requests.slice(requestStart), 'home')
}

const evidence = {
  schemaVersion: 'agent-sub-agent-electron-v1',
  generatedAt: new Date().toISOString(),
  checks: [],
  verdict: 'fail',
}

await removeDir(PROFILE)
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
  await page.waitForFunction(() => Boolean(window.electronAPI), null, { timeout: 30_000, polling: 200 })
  await page.waitForSelector('#app', { timeout: 20_000 })
  await sleep(1_000)
  await closeProjectModal(page)
  await seedStorage(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20_000 })
  await sleep(1_000)
  await closeProjectModal(page)

  console.log('[stage] outline workspace')
  mode = 'outline'
  await runOutlineScenario(page)
  evidence.checks.push('outline: outer agent tools exposed, sub-agent tools hidden, trace closed, final body visible')

  console.log('[stage] home editor')
  mode = 'home'
  await runHomeScenario(page)
  evidence.checks.push('home: outer agent tools exposed, sub-agent tools hidden, trace closed, final body visible')

  evidence.requests = requests.map(request => ({
    mode: request.mode,
    isOuter: request.isOuter,
    lastToolCall: request.lastToolCall,
    toolNames: request.toolNames,
  }))
  evidence.verdict = 'pass'
  console.log('===== AGENT SUB-AGENT ELECTRON VERIFICATION PASSED =====')
} catch (error) {
  evidence.error = String(error?.stack || error)
  console.error('===== AGENT SUB-AGENT ELECTRON VERIFICATION FAILED =====')
  console.error(evidence.error)
} finally {
  try { if (browser) await browser.close() } catch {}
  await closeElectron(app)
  await new Promise(resolve => providerServer.close(resolve))
  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  console.log(`[evidence] ${path.relative(ROOT, OUTPUT_FILE)}`)
}

if (evidence.verdict !== 'pass') process.exit(1)
