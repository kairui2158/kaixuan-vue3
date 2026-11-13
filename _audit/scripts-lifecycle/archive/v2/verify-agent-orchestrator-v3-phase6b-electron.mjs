import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = path.resolve(process.cwd())
const ELECTRON_EXE = process.env.SHENYI_DIRECT_WRITE_ELECTRON
  ? path.resolve(process.env.SHENYI_DIRECT_WRITE_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9287
const MOCK_PORT = 59946
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const PROFILE = path.join(ROOT, '_data', 'agent-orchestrator-v3-phase6b-profile')
const DATA_DIR = path.join(PROFILE, 'documents-data')
const EXPORT_ROOT = path.join(ROOT, '_data', 'agent-orchestrator-v3-phase6b-exports')
const EVIDENCE_DIR = path.join(ROOT, '_audit', 'verification-agent-orchestrator-v3-phase6b')
const REPORT_FILE = path.join(EVIDENCE_DIR, 'phase6b-report.json')
const PROJECT_ID = 'agent-orchestrator-v3-phase6b'
const GLOBAL_TIMEOUT_MS = 12 * 60_000

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
  const staleBundles = bundleNames.filter(name =>
    fs.statSync(path.join(ROOT, 'dist-renderer', name)).mtimeMs < newestSourceMs)
  assert.equal(staleBundles.length, 0,
    `renderer build is stale; rebuild with npm run build:vue. Stale bundles: ${staleBundles.join(', ')}`)
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

let scenario = null
let scenarioRound = 0
let scenarioRequestCount = 0
let commandQueue = []
let finalText = ''
const requests = []

function setScenario(name, round, commands, answer) {
  scenario = name
  scenarioRound = round
  scenarioRequestCount = 0
  commandQueue = [...commands]
  finalText = answer
}

function respond(response, body, payload) {
  if (body?.stream) {
    const delta = payload.choices?.[0]?.message || {}
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    response.write(`data: ${JSON.stringify({
      id: `phase6b-${scenario}-${scenarioRound}-${scenarioRequestCount}`,
      object: 'chat.completion.chunk',
      choices: [{
        index: 0,
        finish_reason: payload.choices?.[0]?.finish_reason,
        delta: {
          role: 'assistant',
          content: delta.content || '',
          tool_calls: delta.tool_calls,
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

const server = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    let body = null
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    const isIntentClassifier = (body?.messages || []).some(message =>
      message?.role === 'system' && String(message.content || '').includes('意图分类器'))
    const record = {
      scenario,
      round: scenarioRound,
      requestCount: isIntentClassifier ? 0 : scenarioRequestCount + 1,
      isIntentClassifier,
      tools: (body?.tools || []).map(tool => tool?.function?.name || tool?.name || '').filter(Boolean),
      body,
    }
    requests.push(record)
    if (isIntentClassifier) {
      assert.equal(record.tools.length, 0, 'intent classifier request must not carry editor tools')
      respond(response, body, textCompletion(
        scenario === 'read'
          ? '{"intent":"discuss","confidence":0.93,"reason":"读取或讨论大纲状态"}'
          : '{"intent":"edit","confidence":0.94,"reason":"用户明确要求修改大纲"}'))
      return
    }
    scenarioRequestCount += 1
    record.requestCount = scenarioRequestCount
    console.log(`[MOCK] ${scenario} r${scenarioRound} #${scenarioRequestCount}: ${record.tools.join(', ') || '(no tools)'}`)
    if (commandQueue.length > 0) {
      const next = commandQueue.shift()
      respond(response, body, toolCall(next.name, next.input, next.id))
      return
    }
    respond(response, body, textCompletion(finalText))
  })
})

function startElectron(dataDir = DATA_DIR) {
  return spawn(ELECTRON_EXE, ['.', `--remote-debugging-port=${CDP_PORT}`,
    '--remote-allow-origins=*', `--user-data-dir=${PROFILE}`], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SHENYI_ALLOW_TEST_ISOLATION: '1',
      SHENYI_DATA_DIR: dataDir,
      SHENYI_TEST_USER_DATA_DIR: path.join(PROFILE, 'app-data'),
      SHENYI_TEST_RUN_TRACE_EXPORT: EXPORT_ROOT,
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

async function connectPage() {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
  const context = browser.contexts()[0]
  let page = null
  for (let attempt = 0; attempt < 24 && !page; attempt++) {
    page = context.pages().find(item => !item.url().startsWith('devtools://')) || null
    if (!page) await sleep(500)
  }
  assert(page, 'renderer page reachable')
  return { browser, page }
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

function killElectronImmediately(app) {
  if (!app || app.exitCode !== null) return
  execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' })
}

async function closeProjectModal(page) {
  await page.evaluate(() => {
    document.querySelector('.project-modal-content .btn-close')?.click()
  })
  await sleep(400)
}

async function setupProject(page) {
  await page.evaluate(async ({ mockUrl, projectId }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'phase6b-provider',
        name: 'Phase 6B Mock Provider',
        baseUrl: mockUrl,
        apiKey: 'key',
        models: ['phase6b-model'],
        selectedModel: 'phase6b-model',
        temperature: 0.1,
        maxTokens: 4096,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
        contextWindowTokens: 1000000,
      }],
      generateProvider: 'phase6b-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: 'Agent Orchestrator Phase 6B 实测',
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
  }, { mockUrl: MOCK_BASE_URL, projectId: PROJECT_ID })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20000 })
  await sleep(1200)
  await closeProjectModal(page)
}

function buildLargeOutline() {
  const sections = ['第一卷 五十万字大纲']
  let chars = sections[0].length
  let index = 1
  while (chars < 500000) {
    const line = `第${index}节：Agent Phase 6B 长文档链路实测。男主沿着灯塔石阶检查灯芯，潮声在礁石外反复退去，旧信的日期被潮气晕开。`
    sections.push(line)
    chars += line.length + 1
    index += 1
  }
  for (let index = 1; index <= 3; index++) {
    const line = `【Phase6B定向删除${index}】`
    sections.push(line)
    chars += line.length + 1
  }
  return { text: sections.join('\n'), lines: index - 1, chars }
}

async function setOutline(page, text) {
  await page.evaluate(async ({ text: outlineText, projectId }) => {
    const project = await window.electronAPI.storageRead(`wa_project_${projectId}`)
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      ...project,
      outlineText,
      outlineLocked: false,
    })
    window.__pinia?._s?.get('project')?.loadProject?.(projectId)
  }, { text, projectId: PROJECT_ID })
  await page.waitForFunction(expected => {
    const value = window.__pinia?._s?.get('project')?.outlineText || ''
    return value.length === expected
  }, text.length, { timeout: 30000, polling: 250 })
}

async function openOutlineWorkspace(page) {
  await page.click('#btn-outline-workspace')
  await page.waitForSelector('#outline-workspace', { timeout: 15000 })
  await page.evaluate(() => document.querySelector('#btn-ai-co-create')?.click())
  await page.waitForSelector('#ow-chat-input', { timeout: 15000 })
  await sleep(500)
}

async function waitOutlineIdle(page, timeout = 120000) {
  await page.waitForFunction(() => Boolean(document.querySelector('#btn-ow-send'))
    && !document.querySelector('#btn-ow-send')?.disabled, null, { timeout, polling: 250 })
  await sleep(250)
}

async function sendOutline(page, text, waitFor) {
  await waitOutlineIdle(page)
  const before = requests.length
  await page.locator('#ow-chat-input').fill(text)
  await page.locator('#ow-chat-input').evaluate(element =>
    element.dispatchEvent(new Event('change', { bubbles: true })))
  await page.locator('#btn-ow-send').click()
  try {
    await page.waitForFunction(value => (document.body.textContent || '').includes(value),
      waitFor, { timeout: 120000, polling: 250 })
  } catch (error) {
    const bodyText = await page.evaluate(() => (document.body.textContent || '').slice(-5000))
    console.error(`[OUTLINE TIMEOUT] ${scenario} r${scenarioRound}: ${text}`)
    console.error(`[REQUESTS] ${requests.slice(before)
      .map(item => `${item.scenario}r${item.round}#${item.requestCount}${item.isIntentClassifier ? 'C' : ''}`)
      .join(', ')}`)
    console.error(bodyText)
    throw error
  }
  await waitOutlineIdle(page)
  return requests.slice(before)
}

async function outlineContent(page) {
  return page.evaluate(() => window.__pinia?._s?.get('project')?.outlineText || '')
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
        userRequest: turn.userRequest,
        intent: turn.intent || null,
        reason: turn.reason || null,
        toolSurface: (turn.actualToolSurface || []).map(tool => ({ name: tool.name, policy: tool.policy })),
      })),
      apiCalls: (run.apiCalls || []).map(call => ({
        id: call.id,
        turnId: call.turnId || null,
        status: call.status,
        error: call.error || null,
        errorCode: call.errorCode || null,
        finishReason: call.finishReason || null,
        providerContextWindowTokens: call.providerContextWindowTokens ?? null,
        actualToolSurface: (call.actualToolSurface || []).map(tool => ({ name: tool.name, policy: tool.policy })),
        toolCalls: (call.toolCalls || []).map(tool => ({
          toolCallId: tool.toolCallId || null,
          name: tool.name,
          status: tool.status,
          error: tool.error || null,
          errorCode: tool.errorCode || null,
        })),
        physicalCallCount: (call.physicalCalls || []).length,
      })),
      events: (run.events || []).map(event => ({
        turnId: event.turnId || null,
        type: event.type,
        level: event.level,
        label: event.label,
        detail: event.detail,
      })),
    }
  })
}

async function capture(page, name) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`), fullPage: false })
  console.log(`[SHOT] ${name}.png`)
}

function assertWriteRequest(record, label) {
  assert(record?.tools.includes('editor.write'), `${label}: provider request carries editor.write`)
  const prompt = (record?.body?.messages || [])
    .filter(message => message?.role === 'system')
    .map(message => String(message.content || ''))
    .join('\n')
  assert(!prompt.includes('本轮未开放写入工具'), `${label}: system prompt must not deny write permission`)
  assert(!prompt.includes('本轮未开放 editor.write'), `${label}: system prompt must not close editor.write`)
}

async function exportAllRuns(page) {
  return await page.evaluate(async exportRoot => {
    const store = window.__pinia?._s?.get('runTrace')
    const runs = [...(store?.runs || [])]
      .filter(item => item.source === 'outline')
      .sort((a, b) => a.startedAt - b.startedAt)
    const results = []
    for (const [index, run] of runs.entries()) {
      const exported = await window.electronAPI.runTraceExport({
        schema: 'shenyi.run-trace',
        version: 2,
        run: store.exportRunToJson(run),
        mode: 'deep',
        payloadDirectoryHint: exportRoot,
      })
      results.push({ index, runId: run.id, success: Boolean(exported?.success), path: exported?.path || null })
    }
    return results
  }, EXPORT_ROOT)
}

async function buildRoundPlans(outline) {
  const firstLine = outline.text.split('\n')[1]
  const secondLine = outline.text.split('\n')[2]
  const rounds = []
  for (let index = 1; index <= 3; index++) {
    rounds.push({
      scenario: 'read',
      round: index,
      userText: `第 ${index} 轮读取：先看文档结构，再读取第一节，最后告诉我文档状态。`,
      commands: [
        {
          name: 'editor.document_map',
          id: `read-map-${index}`,
          input: { limit: 10 },
        },
        {
          name: 'editor.read_range',
          id: `read-range-${index}`,
          input: { sectionId: 'section-1' },
        },
      ],
      finalText: `第 ${index} 轮读取完成：文档结构完整，第一节状态正常。`,
      verify: ({ roundRequests, run }) => {
        const nonIntent = roundRequests.filter(item => !item.isIntentClassifier)
        assert(nonIntent.length >= 3, `read r${index}: document map, read range, final answer are physical requests`)
        assert(nonIntent[0].tools.includes('editor.document_map'), `read r${index}: document map surface`)
        assert(nonIntent[0].tools.includes('editor.read_range'), `read r${index}: read range surface`)
        const turn = (run?.turns || []).find(item => item.userRequest.includes(`第 ${index} 轮读取`))
        assert(turn, `read r${index}: trace records turn`)
        assert.equal(turn?.intent, 'discuss', `read r${index}: read intent is discuss`)
        const calls = (run?.apiCalls || []).filter(call => call.turnId === turn?.id)
        assert(calls.length > 0, `read r${index}: trace records API calls`)
        for (const call of calls) assert.notEqual(call.status, 'running', `read r${index}: API call closed`)
        const reads = calls.flatMap(call => call.toolCalls || [])
          .filter(tool => tool.name === 'editor.document_map' || tool.name === 'editor.read_range')
        assert.equal(reads.length, 2, `read r${index}: two read tool calls recorded`)
        for (const tool of reads) assert.equal(tool.status, 'success', `read r${index}: read tool succeeds`)
        const writes = calls.flatMap(call => call.toolCalls || []).filter(tool => tool.name === 'editor.write')
        assert.equal(writes.length, 0, `read r${index}: no editor.write executed`)
      },
    })
  }

  for (let index = 1; index <= 3; index++) {
    const marker = `【Phase6B定向修改${index}】`
    rounds.push({
      scenario: 'modify',
      round: index,
      userText: `第 ${index} 轮定向修改：把第一节末尾追加一句${marker}。`,
      commands: [
        {
          name: 'editor.write',
          id: `modify-write-${index}`,
          input: writePayload([{
            operation: 'replace_match',
            target: firstLine,
            content: `${firstLine}${marker}`,
            reason: `第 ${index} 轮定向修改`,
          }], `第 ${index} 轮定向修改`),
        },
      ],
      finalText: `第 ${index} 轮定向修改完成。`,
      verify: ({ before, after, roundRequests, run }) => {
        assert.equal(after, before.replace(firstLine, `${firstLine}${marker}`),
          `modify r${index}: exact first-section append`)
        const nonIntent = roundRequests.filter(item => !item.isIntentClassifier)
        assert(nonIntent.length >= 2, `modify r${index}: write and final answer requests`)
        assertWriteRequest(nonIntent[0], `modify r${index}`)
        assert(nonIntent[0].tools.includes('editor.document_map'), `modify r${index}: long-document map surface`)
        assert(nonIntent[0].tools.includes('editor.read_range'), `modify r${index}: long-document read surface`)
        const turn = (run?.turns || []).find(item => item.userRequest.includes(`第 ${index} 轮定向修改`))
        assert(turn, `modify r${index}: trace records turn`)
        assert.equal(turn?.intent, 'edit', `modify r${index}: intent is edit`)
        const events = (run?.events || []).filter(event => event.turnId === turn?.id)
        assert(events.some(event => event.type === 'long-document-policy'), `modify r${index}: policy event`)
        assert(events.length > 0, `modify r${index}: lifecycle events recorded`)
        const calls = (run?.apiCalls || []).filter(call => call.turnId === turn?.id)
        for (const call of calls) {
          assert(call.actualToolSurface.some(tool => tool.name === 'editor.write' && tool.policy === 'write'),
            `modify r${index}: API call records write surface`)
          assert.notEqual(call.status, 'running', `modify r${index}: API call closed`)
          assert.equal(call.providerContextWindowTokens, 1000000,
            `modify r${index}: trace records 1M provider window`)
        }
        const writes = calls.flatMap(call => call.toolCalls || []).filter(tool => tool.name === 'editor.write')
        assert.equal(writes.length, 1, `modify r${index}: one editor.write recorded`)
        assert.equal(writes[0]?.status, 'success', `modify r${index}: editor.write succeeds`)
      },
    })
  }

  for (let index = 1; index <= 3; index++) {
    const marker = `【Phase6B定向删除${index}】`
    rounds.push({
      scenario: 'delete',
      round: index,
      userText: `第 ${index} 轮定向删除：删除第一节末尾的标记句。`,
      commands: [
        {
          name: 'editor.write',
          id: `delete-write-${index}`,
          input: writePayload([{
            operation: 'delete',
            target: marker,
            reason: `第 ${index} 轮定向删除`,
          }], `第 ${index} 轮定向删除`),
        },
      ],
      finalText: `第 ${index} 轮定向删除完成。`,
      verify: ({ before, after, roundRequests, run }) => {
        assert.equal(after, before.replace(marker, ''), `delete r${index}: exact delete`)
        const nonIntent = roundRequests.filter(item => !item.isIntentClassifier)
        assert(nonIntent.length >= 2, `delete r${index}: write and final answer requests`)
        assertWriteRequest(nonIntent[0], `delete r${index}`)
        const turn = (run?.turns || []).find(item => item.userRequest.includes(`第 ${index} 轮定向删除`))
        assert(turn, `delete r${index}: trace records turn`)
        const events = (run?.events || []).filter(event => event.turnId === turn?.id)
        assert(events.some(event => event.type === 'long-document-policy'), `delete r${index}: policy event`)
        assert(events.some(event => event.type === 'edit-task-task-finished'), `delete r${index}: task finished event`)
        const calls = (run?.apiCalls || []).filter(call => call.turnId === turn?.id)
        const writes = calls.flatMap(call => call.toolCalls || []).filter(tool => tool.name === 'editor.write')
        assert.equal(writes.length, 1, `delete r${index}: one editor.write recorded`)
        assert.equal(writes[0]?.status, 'success', `delete r${index}: editor.write succeeds`)
        for (const call of calls) assert.notEqual(call.status, 'running', `delete r${index}: API call closed`)
      },
    })
  }

  for (let index = 1; index <= 3; index++) {
    const marker = `【Phase6B重排标记${index}】`
    rounds.push({
      scenario: 'restructure',
      round: index,
      userText: `第 ${index} 轮全文重排：整理整篇大纲，统一编号，并把标记句写入第二节。`,
      commands: [
        {
          name: 'editor.write',
          id: `restructure-write-${index}`,
          input: writePayload([{
            operation: 'replace_match',
            target: secondLine,
            content: `${secondLine}${marker}`,
            reason: `第 ${index} 轮重排批次`,
          }], `第 ${index} 轮全文重排批次`),
        },
      ],
      finalText: `第 ${index} 轮全文重排批次完成。`,
      verify: ({ before, after, roundRequests, run }) => {
        assert.equal(after, before.replace(secondLine, `${secondLine}${marker}`),
          `restructure r${index}: exact second-section append`)
        const nonIntent = roundRequests.filter(item => !item.isIntentClassifier)
        assertWriteRequest(nonIntent[0], `restructure r${index}`)
        assert(!nonIntent[0].tools.includes('context.remaining') || nonIntent[0].tools.includes('editor.write'),
          `restructure r${index}: agent tools coexist with editor tools`)
        const turn = (run?.turns || []).find(item => item.userRequest.includes(`第 ${index} 轮全文重排`))
        assert(turn, `restructure r${index}: trace records turn`)
        const events = (run?.events || []).filter(event => event.turnId === turn?.id)
        assert(events.some(event => event.type === 'long-document-policy'), `restructure r${index}: policy event`)
        assert(events.some(event => event.type === 'edit-task-task-finished'), `restructure r${index}: task finished event`)
        const calls = (run?.apiCalls || []).filter(call => call.turnId === turn?.id)
        for (const call of calls) assert.notEqual(call.status, 'running', `restructure r${index}: API call closed`)
      },
    })
  }

  for (let index = 1; index <= 3; index++) {
    const marker = `【Phase6B标点标记${index}】`
    rounds.push({
      scenario: 'punctuation',
      round: index,
      userText: `第 ${index} 轮全文标点整理：统一整篇标点，并把标记句写入第二节。`,
      commands: [
        {
          name: 'editor.write',
          id: `punctuation-write-${index}`,
          input: writePayload([{
            operation: 'replace_match',
            target: secondLine,
            content: `${secondLine}${marker}`,
            reason: `第 ${index} 轮标点批次`,
          }], `第 ${index} 轮全文标点批次`),
        },
      ],
      finalText: `第 ${index} 轮全文标点批次完成。`,
      verify: ({ before, after, roundRequests, run }) => {
        assert.equal(after, before.replace(secondLine, `${secondLine}${marker}`),
          `punctuation r${index}: exact second-section append`)
        const nonIntent = roundRequests.filter(item => !item.isIntentClassifier)
        assertWriteRequest(nonIntent[0], `punctuation r${index}`)
        const turn = (run?.turns || []).find(item => item.userRequest.includes(`第 ${index} 轮全文标点整理`))
        assert(turn, `punctuation r${index}: trace records turn`)
        const events = (run?.events || []).filter(event => event.turnId === turn?.id)
        assert(events.some(event => event.type === 'long-document-policy'), `punctuation r${index}: policy event`)
        assert(events.some(event => event.type === 'edit-task-task-finished'), `punctuation r${index}: task finished event`)
        const calls = (run?.apiCalls || []).filter(call => call.turnId === turn?.id)
        for (const call of calls) assert.notEqual(call.status, 'running', `punctuation r${index}: API call closed`)
      },
    })
  }
  return rounds
}

async function runMatrix(page, rounds) {
  const evidence = []
  for (const round of rounds) {
    setScenario(round.scenario, round.round, round.commands, round.finalText)
    const before = await outlineContent(page)
    const roundRequests = await sendOutline(page, round.userText, round.finalText)
    const after = await outlineContent(page)
    const run = await latestRun(page)
    round.verify({ before, after, roundRequests, run })
    const turn = (run?.turns || []).find(item => item.userRequest === round.userRequest)
      || (run?.turns || []).find(item => item.userRequest.includes(round.userText.slice(0, 12)))
    const calls = (run?.apiCalls || []).filter(call => call.turnId === turn?.id)
    assert((run?.events || []).some(event => event.type.startsWith('agent-')),
      `${round.scenario} r${round.round}: agent runtime events recorded`)
    evidence.push({
      scenario: round.scenario,
      round: round.round,
      userText: round.userText,
      beforeChars: before.length,
      afterChars: after.length,
      physicalRequests: roundRequests.filter(item => !item.isIntentClassifier).length,
      intent: turn?.intent || null,
      eventTypes: (run?.events || [])
        .filter(event => event.turnId === turn?.id)
        .map(event => event.type),
      apiCalls: calls.length,
      closedCalls: calls.filter(call => call.status !== 'running').length,
      agentEvents: (run?.events || [])
        .filter(event => event.turnId === turn?.id && event.type.startsWith('agent-')).length,
      runId: run?.id || null,
    })
    await capture(page, `${round.scenario}-${round.round}`)
    console.log(`[TRACE EVENTS ${round.scenario} r${round.round}]`,
      JSON.stringify([...new Set((run?.events || [])
        .filter(event => event.turnId === turn?.id)
        .map(event => event.type))]))
    console.log(`[PASS] ${round.scenario} r${round.round}`)
  }
  return evidence
}

async function runCompactionCrashRecovery() {
  const smallProfile = path.join(ROOT, '_data', 'agent-orchestrator-v3-phase6b-compaction-profile')
  const smallDataDir = path.join(smallProfile, 'documents-data')
  await removeDir(smallProfile)
  fs.mkdirSync(smallDataDir, { recursive: true })
  const app = startElectron(smallDataDir)
  let browser = null
  let page = null
  try {
    assert(await waitForCdp(), 'compaction run: CDP reachable')
    ;({ browser, page } = await connectPage())
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1500)
    await page.evaluate(async () => {
      await window.electronAPI.storageWrite('wa_lastProjectId', 'compaction-recovery-project')
      await window.electronAPI.storageWrite('wa_providers', {
        providers: [{
          id: 'compaction-provider',
          name: 'Compaction Mock',
          baseUrl: 'http://127.0.0.1:59946/v1',
          apiKey: 'key',
          models: ['compaction-model'],
          selectedModel: 'compaction-model',
          temperature: 0.1,
          maxTokens: 4096,
          purpose: ['generate'],
          providerType: 'openai-compatible',
        streamMode: true,
        contextWindowTokens: 1000,
        }],
        generateProvider: 'compaction-provider',
      })
      await window.electronAPI.storageWrite(`wa_project_compaction-recovery-project`, {
        schemaVersion: 3,
        projectName: 'Compaction Recovery 实测',
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
      const pipelineConfig = await window.electronAPI.storageRead('wa_pipeline_step_config') || {}
      pipelineConfig.skills = pipelineConfig.skills || {}
      pipelineConfig.modes = pipelineConfig.modes || {}
      pipelineConfig.skillAgents = pipelineConfig.skillAgents || {}
      pipelineConfig.agents = pipelineConfig.agents || {}
      pipelineConfig.skills[0] = []
      pipelineConfig.modes[0] = 'compose'
      await window.electronAPI.storageWrite('wa_pipeline_step_config', pipelineConfig)
      await window.electronAPI.storageWrite('wa_skills', { skills: [] })
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#app', { timeout: 20000 })
    await closeProjectModal(page)
    await openOutlineWorkspace(page)
    setScenario('compaction', 1, [], '压缩实测完成。')
    for (let turnIndex = 0; turnIndex < 6; turnIndex++) {
      await waitOutlineIdle(page)
      await page.locator('#ow-chat-input').fill(`压缩轮次 ${turnIndex + 1}：${'上下文压缩链路实测。'.repeat(80)}`)
      await page.locator('#btn-ow-send').click()
      await page.waitForFunction(value => (document.body.textContent || '').includes(value),
        '压缩实测完成。', { timeout: 30000, polling: 250 })
    }
    const checkpointFiles = fs.readdirSync(smallDataDir)
      .filter(name => name.startsWith('wa_ctxcp_') && name.endsWith('.json'))
    assert(checkpointFiles.length > 0, 'compaction checkpoint file exists')
    killElectronImmediately(app)
    await browser.close().catch(() => {})
    browser = null
    await sleep(1000)

    const relaunched = startElectron(smallDataDir)
    assert(await waitForCdp(), 'recovery run: CDP reachable')
    ;({ browser, page } = await connectPage())
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1500)
    await closeProjectModal(page)
    const checkpointState = await page.evaluate(async () => {
      return await window.electronAPI.storageRead('wa_ctxcp_compaction-recovery-project_outline__generate__default')
    })
    const recoveryEvidenceDir = path.join(ROOT, '_data', 'agent-orchestrator-v3-phase6b-recovery-evidence')
    await removeDir(recoveryEvidenceDir)
    fs.mkdirSync(recoveryEvidenceDir, { recursive: true })
    fs.cpSync(smallDataDir, recoveryEvidenceDir, { recursive: true })
    fs.writeFileSync(path.join(recoveryEvidenceDir, 'storage-read-result.json'),
      JSON.stringify({ checkpointState, files: fs.readdirSync(smallDataDir) }, null, 2))
    assert(checkpointState, 'checkpoint survives forced restart')
    assert.notEqual(checkpointState.status, 'hash_mismatch',
      `checkpoint recovery state is legal: ${checkpointState.status}`)
    await closeElectron(relaunched)
    return {
      checkpointFile: checkpointFiles[0],
      recoveredStatus: checkpointState.status,
      checkpointId: checkpointState.checkpointId,
    }
  } finally {
    try { if (browser) await browser.close() } catch {}
    await closeElectron(app)
    await removeDir(smallProfile)
  }
}

const watchdog = setTimeout(() => {
  console.error(`[TIMEOUT] Phase 6B Electron verification exceeded ${GLOBAL_TIMEOUT_MS}ms`)
  process.exit(1)
}, GLOBAL_TIMEOUT_MS)
watchdog.unref()

const report = {
  schema: 'shenyi.agent-orchestrator-v3-phase6b-electron',
  version: 1,
  generatedAt: new Date().toISOString(),
  checks: [],
}

try {
  assertFreshRendererBuild()
  const outline = buildLargeOutline()
  assert(outline.chars >= 500000, `outline reaches 500k chars: ${outline.chars}`)
  const rounds = await buildRoundPlans(outline)
  assert.equal(rounds.length, 15, 'five task classes x three rounds')

  await new Promise(resolve => server.listen(MOCK_PORT, '127.0.0.1', resolve))
  await removeDir(PROFILE)
  await removeDir(EXPORT_ROOT)
  await removeDir(EVIDENCE_DIR)
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
  fs.mkdirSync(EXPORT_ROOT, { recursive: true })
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })

  let app = startElectron()
  let browser = null
  let page = null
  try {
    assert(await waitForCdp(), 'CDP reachable')
    ;({ browser, page } = await connectPage())
    page.on('pageerror', error => console.log(`[PAGE ERROR] ${error.message}`))
    page.on('console', message => {
      if (message.type() === 'error') console.log(`[PAGE CONSOLE ERROR] ${message.text()}`)
    })
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1500)
    await setupProject(page)
    await openOutlineWorkspace(page)
    await setOutline(page, outline.text)
    await capture(page, '00-visible-electron-window')

    const matrixEvidence = await runMatrix(page, rounds)
    report.matrix = matrixEvidence
    report.outline = {
      chars: outline.chars,
      lines: outline.lines,
      sha256: crypto.createHash('sha256').update(outline.text, 'utf8').digest('hex'),
    }

    const exports = await exportAllRuns(page)
    assert(exports.length >= 1, 'outline run exported')
    let exportedTurns = 0
    let exportedApiCalls = 0
    let exportedPhysicalCalls = 0
    let exportedAgentEvents = 0
    for (const item of exports) {
      assert(item.success, `run export succeeds: ${item.runId}`)
      assert(fs.existsSync(item.path), `export path exists: ${item.path}`)
      const exportedRun = JSON.parse(fs.readFileSync(path.join(item.path, 'run-trace.json'), 'utf8'))
      exportedTurns += (exportedRun.turns || []).length
      exportedApiCalls += (exportedRun.apiCalls || []).length
      exportedPhysicalCalls += (exportedRun.apiCalls || [])
        .reduce((count, call) => count + (call.physicalCalls || []).length, 0)
      exportedAgentEvents += (exportedRun.events || [])
        .filter(event => String(event.type || '').startsWith('agent-')).length
      assert((exportedRun.apiCalls || []).every(call => call.status !== 'running'),
        `exported run has no running API call: ${item.runId}`)
      assert((exportedRun.turns || []).every(turn => turn.status !== 'running'),
        `exported run has no running turn: ${item.runId}`)
    }
    assert.equal(exportedTurns, 15, 'all 15 turns exported')
    assert.equal(exportedApiCalls, 15, 'one logical API call per turn exported')
    assert(exportedPhysicalCalls >= 33, `physical calls include tool + final requests: ${exportedPhysicalCalls}`)
    assert(exportedAgentEvents >= 15, `agent events exported: ${exportedAgentEvents}`)
    report.export = {
      runs: exports.length,
      turns: exportedTurns,
      apiCalls: exportedApiCalls,
      physicalCalls: exportedPhysicalCalls,
      agentEvents: exportedAgentEvents,
    }

    await browser.close()
    browser = null
    page = null
    await closeElectron(app)
    app = null
  } finally {
    try { if (browser) await browser.close() } catch {}
    await closeElectron(app)
  }

  report.compactionCrashRecovery = await runCompactionCrashRecovery()
  report.live = process.env.SHENYI_LIVE_API_KEY && process.env.SHENYI_LIVE_BASE_URL && process.env.SHENYI_LIVE_MODEL
    ? 'available'
    : 'untested-no-live-credentials'
  report.checks = [
    'visible Electron window launched (windowsHide:false)',
    '500k outline loaded through isolated storage',
    'read x3 with document_map/read_range and zero executed writes',
    'targeted modify x3 with exact content assertions',
    'targeted delete x3 with exact content assertions',
    'whole-document restructure x3 routed through EditTask',
    'punctuation cleanup x3 routed through EditTask',
    '1M provider window recorded in trace',
    'agent runtime events recorded in UI trace and deep export',
    'deep run trace exported and closed with no running state',
    'forced crash after compaction checkpoint recovers without hash_mismatch',
  ]
  report.verdict = 'pass'
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), 'utf8')
  console.log('===== AGENT ORCHESTRATOR V3 PHASE 6B VISIBLE ELECTRON VERIFICATION PASSED =====')
  console.log(`[EVIDENCE] ${path.relative(ROOT, REPORT_FILE)}`)
} catch (error) {
  report.verdict = 'fail'
  report.error = String(error?.stack || error)
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), 'utf8')
  console.error('===== AGENT ORCHESTRATOR V3 PHASE 6B VISIBLE ELECTRON VERIFICATION FAILED =====')
  console.error(report.error)
} finally {
  server.close()
  await removeDir(PROFILE)
  await removeDir(EXPORT_ROOT)
}

if (report.verdict !== 'pass') process.exit(1)

