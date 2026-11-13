import http from 'node:http'
import path from 'node:path'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = process.env.SHENYI_DIRECT_WRITE_ELECTRON
  ? path.resolve(process.env.SHENYI_DIRECT_WRITE_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9287
const MOCK_PORT = 59937
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const PROFILE = path.join(ROOT, '_data', 'diagnose-million-edit-task-profile')
const PROJECT_ID = 'diagnose-million-edit-task-project'

const MILLION_OUTLINE_LINE = '第{n}节：百万字大纲压测。男主沿着灯塔石阶检查灯芯，潮声在礁石外反复退去，旧信的日期被潮气晕开。'

function millionLine(index) {
  return MILLION_OUTLINE_LINE.replace('{n}', String(index))
}

function buildMillionOutline() {
  const sections = [
    '第一卷 百万字大纲',
    '一、主线进度',
    '二、人物关系',
    '三、世界观设定',
    '四、伏笔回收',
  ]
  for (let index = 1; index <= 20000; index++) {
    sections.push(millionLine(index))
  }
  return sections.join('\n')
}

function textCompletion(content) {
  return {
    id: `diagnose-million-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    object: 'chat.completion',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
  }
}

function toolCall(name, args, id) {
  return {
    id: `diagnose-million-${id}`,
    object: 'chat.completion',
    choices: [{
      index: 0,
      message: { role: 'assistant', content: '', tool_calls: [{ id: `call-${id}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] },
      finish_reason: 'tool_calls',
    }],
  }
}

const writePayload = (commands, reason) => ({ commands, reveal: { mode: 'instant', firstChange: true }, reason })

const requests = []
let physicalStep = 0
let turnIndex = 0
let turnPhysicalStep = 0
const startedAtMs = Date.now()

function respond(response, body, payload) {
  if (body?.stream) {
    const delta = payload.choices?.[0]?.message || {}
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    response.write(`data: ${JSON.stringify({
      id: payload.id,
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
      message?.role === 'system' && String(message.content || '').includes('意图分类器'))
    physicalStep += 1
    turnPhysicalStep += 1
    requests.push({
      atMs: Date.now() - startedAtMs,
      turnIndex,
      physicalStep,
      isIntentClassifier,
      messageCount: body?.messages?.length ?? 0,
      messageChars: (body?.messages || []).reduce((total, message) => total + String(message?.content || '').length, 0),
      tools: body?.tools?.map(tool => tool.function?.name) || [],
    })

    if (isIntentClassifier) {
      respond(response, body, textCompletion('{"intent":"edit","confidence":0.95,"reason":"按用户请求语义分类"}'))
      return
    }

    if (turnIndex === 1) {
      if (turnPhysicalStep <= 2) {
        respond(response, body, toolCall('editor.write', writePayload([{
          operation: 'replace_document',
          content: '整篇替换必须被拒绝。',
          reason: '负向测试',
        }], '1M 整篇替换'), `forbidden-${physicalStep}`))
        return
      }
      respond(response, body, textCompletion('整篇替换已被应用拒绝。'))
      return
    }

    if (turnIndex === 2) {
      if (turnPhysicalStep <= 4) {
        respond(response, body, toolCall('editor.document_map', { offset: 19980, limit: 30 }, `map-${physicalStep}`))
        return
      }
      if (turnPhysicalStep === 5) {
        respond(response, body, toolCall('editor.read_range', { sectionId: 'section-1', maxChars: 12000 }, `read-first-${physicalStep}`))
        return
      }
      if (turnPhysicalStep === 6) {
        respond(response, body, toolCall('editor.read_range', { sectionId: 'section-20000', maxChars: 12000 }, `read-last-${physicalStep}`))
        return
      }
      respond(response, body, textCompletion('已读取百万字大纲首尾。'))
      return
    }

    if (turnIndex === 3) {
      if (turnPhysicalStep <= 2) {
        const isFirst = turnPhysicalStep === 1
        const index = isFirst ? 1 : 20000
      respond(response, body, toolCall('editor.write', writePayload([{
          operation: 'replace_match',
          target: millionLine(index),
          content: `${millionLine(index)}【已复核】`,
          reason: isFirst ? '第一批' : '最后一批',
        }], isFirst ? '第一批' : '最后一批'), `write-${index}-${physicalStep}`))
        return
      }
      respond(response, body, textCompletion('百万字大纲两批修改完成。'))
      return
    }

    respond(response, body, textCompletion('已处理当前请求。'))
  })
})

function removeDir(target) {
  fs.rmSync(target, { recursive: true, force: true })
}

function prepareProfile() {
  removeDir(PROFILE)
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
  fs.mkdirSync(path.join(PROFILE, 'documents-data'), { recursive: true })
}

function startElectron() {
  return spawn(ELECTRON_EXE, ['.', `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', `--user-data-dir=${PROFILE}`], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SHENYI_DATA_DIR: path.join(PROFILE, 'documents-data'),
      SHENYI_TEST_USER_DATA_DIR: path.join(PROFILE, 'app-data'),
      SHENYI_ALLOW_TEST_ISOLATION: '1',
    },
    windowsHide: true,
  })
}

async function waitForCdp() {
  for (let index = 0; index < 80; index++) {
    try {
      const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)
      if (response.ok) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('Electron CDP did not start')
}

async function waitOutlineTurnFinished(page, expectedRequest, timeout = 180000) {
  await page.waitForFunction(requestText => {
    const store = window.__pinia?._s?.get('runTrace')
    const runs = [...(store?.runs || [])].filter(item => item.source === 'outline')
    const run = runs.sort((a, b) => b.startedAt - a.startedAt)[0]
    const turn = (run?.turns || []).find(item => item.userRequest === requestText)
    return Boolean(turn && turn.status !== 'running')
  }, expectedRequest, { timeout, polling: 250 })
  await new Promise(resolve => setTimeout(resolve, 500))
}

async function send(page, text) {
  turnIndex += 1
  turnPhysicalStep = 0
  console.log(`[DIAGNOSTIC] sending turn ${turnIndex}: ${text}`)
  await page.locator('#ow-chat-input').fill(text)
  await page.locator('#ow-chat-input').evaluate(element => element.dispatchEvent(new Event('change', { bubbles: true })))
  await page.locator('#btn-ow-send').click()
  await waitOutlineTurnFinished(page, text)
  const visibleText = await page.evaluate(() => (document.body.innerText || '').slice(-1200))
  console.log(`[DIAGNOSTIC] after turn ${turnIndex}: ${visibleText.replace(/\s+/g, ' ').slice(-500)}`)
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
        toolCallCount: turn.toolCallCount ?? 0,
        apiCallIds: turn.apiCallIds || [],
      })),
      apiCalls: (run.apiCalls || []).map(call => ({
        id: call.id,
        turnId: call.turnId || null,
        status: call.status,
        toolCalls: (call.toolCalls || []).map(tool => ({
          name: tool.name,
          status: tool.status,
          input: tool.input,
          errorCode: tool.errorCode || null,
        })),
      })),
      events: (run.events || []).map(event => ({
        turnId: event.turnId || null,
        type: event.type,
        detail: event.detail,
      })),
    }
  })
}

function summarizeRun(run, expectedRequest) {
  const turn = (run?.turns || []).find(item => item.userRequest === expectedRequest)
  const calls = (run?.apiCalls || []).map(call => ({
    id: call.id,
    turnId: call.turnId,
    status: call.status,
    tools: (call.toolCalls || []).map(tool => `${tool.name}:${tool.status}:${tool.errorCode || 'ok'}`),
  }))
  return { turn, calls, events: (run?.events || []).map(event => `${event.type}@${event.turnId || 'none'}`) }
}

const electron = startElectron()
const appProcess = electron
let browser = null
try {
  await new Promise((resolve, reject) => server.listen(MOCK_PORT, '127.0.0.1', error => (error ? reject(error) : resolve())))
  prepareProfile()
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('electron startup timeout')), 30000)
    electron.once('exit', code => {
      clearTimeout(timer)
      reject(new Error(`electron exited early: ${code}`))
    })
    waitForCdp().then(() => {
      clearTimeout(timer)
      resolve()
    }).catch(reject)
  })
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
  let page = null
  for (let attempt = 0; attempt < 30 && !page; attempt++) {
    page = browser.contexts()[0]?.pages()?.[0] || null
    if (!page) await new Promise(resolve => setTimeout(resolve, 250))
  }
  assert(page, 'renderer page reachable')
  page.on('pageerror', error => console.error('[PAGE ERROR]', error))
  page.on('console', message => {
    if (message.type() === 'error') console.error('[CONSOLE ERROR]', message.text())
  })

  await page.goto(`file://${path.join(ROOT, 'dist-renderer', 'index.html')}`)
  await page.waitForSelector('#app', { timeout: 30000 })
  await page.evaluate(async ({ mockUrl, projectId }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'diagnose-provider',
        name: '诊断供应商',
        baseUrl: mockUrl,
        apiKey: 'diagnose',
        models: ['diagnose-model'],
        selectedModel: 'diagnose-model',
        temperature: 0.1,
        maxTokens: 4096,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
      }],
      generateProvider: 'diagnose-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: '诊断项目',
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
    })
    const pipelineConfig = await window.electronAPI.storageRead('wa_pipeline_step_config') || {}
    pipelineConfig.skills = pipelineConfig.skills || {}
    pipelineConfig.modes = pipelineConfig.modes || {}
    pipelineConfig.skills[0] = []
    pipelineConfig.modes[0] = 'chain'
    await window.electronAPI.storageWrite('wa_pipeline_step_config', pipelineConfig)
    await window.electronAPI.storageWrite('wa_skills', { skills: [] })
    await window.electronAPI.storageWrite('wa_co_creation_config', { agentId: '', skillIds: [], mode: 'compose', skillAgents: {} })
  }, { mockUrl: MOCK_BASE_URL, projectId: PROJECT_ID })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 30000 })
  await new Promise(resolve => setTimeout(resolve, 1200))
  await page.evaluate(() => {
    document.querySelector('.project-modal-content .btn-close')?.click()
  })
  await new Promise(resolve => setTimeout(resolve, 400))
  await page.click('#btn-outline-workspace')
  await page.waitForSelector('#outline-editor', { timeout: 30000 })
  await page.waitForSelector('#btn-ai-co-create', { timeout: 30000 })
  await page.click('#btn-ai-co-create')
  await page.waitForSelector('#ow-chat-input', { timeout: 30000 })

  const millionOutline = buildMillionOutline()
  await page.evaluate(text => {
    const store = window.__pinia?._s?.get('project')
    if (!store) throw new Error('project store not found')
    store.outlineText = text
  }, millionOutline)
  await new Promise(resolve => setTimeout(resolve, 500))

  await send(page, '请把整篇大纲重新整理排序')
  const forbiddenSummary = summarizeRun(await latestRun(page), '请把整篇大纲重新整理排序')
  if (!forbiddenSummary.turn) {
    console.error('[DIAGNOSTIC REQUESTS]', JSON.stringify(requests, null, 2))
    console.error('[DIAGNOSTIC RUN]', JSON.stringify(await latestRun(page), null, 2))
  }
  assert(forbiddenSummary.turn, 'forbidden turn exists')
  console.log('[MILLION DIAGNOSTIC] forbidden summary')
  console.log(JSON.stringify(forbiddenSummary, null, 2))
  assert(forbiddenSummary.turn, 'forbidden turn exists')
  assert.notEqual(forbiddenSummary.turn.status, 'running', 'forbidden turn is not running')

  await send(page, '请先读取第20000节附近的地图，再读取首尾两节')
  const mapSummary = summarizeRun(await latestRun(page), '请先读取第20000节附近的地图，再读取首尾两节')
  assert(mapSummary.turn, 'map turn exists')

  await send(page, '请分两批修改首尾两节，并在句尾追加已复核')
  const writeRun = await latestRun(page)
  const writeSummary = summarizeRun(writeRun, '请分两批修改首尾两节，并在句尾追加已复核')
  const content = await page.evaluate(() => window.__pinia?._s?.get('project')?.outlineText || '')
  assert(content.includes(`${millionLine(1)}【已复核】`), 'first write applied')
  assert(content.includes(`${millionLine(20000)}【已复核】`), 'last write applied')

  console.log('[MILLION DIAGNOSTIC] requests')
  for (const request of requests) {
    console.log(JSON.stringify(request))
  }
  console.log('[MILLION DIAGNOSTIC] run')
  console.log(JSON.stringify(writeSummary, null, 2))

  const millionWrites = (writeRun?.apiCalls || [])
    .filter(call => call.turnId === writeSummary.turn?.id)
    .flatMap(call => call.toolCalls || [])
    .filter(tool => tool.name === 'editor.write')
  if (millionWrites.length !== 2) {
    throw new Error(`expected 2 editor.write tool calls on million turn, got ${millionWrites.length}; diagnostic JSON above`)
  }
  console.log('[MILLION DIAGNOSTIC] PASS')
} finally {
  if (browser) await browser.close().catch(() => {})
  server.close()
  appProcess.kill()
  await new Promise(resolve => setTimeout(resolve, 1000))
}
