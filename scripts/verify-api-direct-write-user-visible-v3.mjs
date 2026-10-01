import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9289
const MOCK_PORT = 59941
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const PROFILE = path.join(ROOT, '_data', 'api-direct-write-user-visible-v3-profile')
const EXPORT_ROOT = path.join(ROOT, '_data', 'api-direct-write-user-visible-v3-exports')
const EVIDENCE_DIR = path.join(ROOT, '_audit', 'verification-api-direct-write-user-visible-2026-09-23')
const PROJECT_ID = 'api-direct-write-user-visible-v3'
const MANUSCRIPT_PATH = path.join(EVIDENCE_DIR, 'test-manuscript.md')

const SECTION_COUNT = 20
const SECTION_TITLES = [
  '雨落石桥', '渡口的灯', '旧账簿', '青苔与铁锈', '南货铺的钟',
  '退潮线', '纸伞', '沈家的船', '渡河人', '夜市油灯',
  '断桨', '修船匠', '北巷水洼', '鱼汛', '盐仓档案',
  '风眼', '旧堤', '船钉', '灯下信', '雨停之前',
]

const SECTION_BODY_SENTENCES = [
  '雨声敲在伞面上，像有人在很远的地方数着铜钱。',
  '桥洞下停着三条空船，缆绳被水汽浸得发黑。',
  '老周把门板卸下一半，用木棍撑住，站在门口看水位。',
  '米铺的伙计挑着两袋米走过，鞋底踩进水洼又拔出来。',
]

function sectionSentence(sentence, number) {
  return `${sentence}这一句属于第${number}节，用来证明多轮直写不会误伤其他内容。`
}

function buildManuscript() {
  const sections = SECTION_TITLES.map((title, index) => {
    const number = index + 1
    return [
      `## 第${number}节 ${title}`,
      `青石镇的雨从第${number}天开始变密，檐水沿着瓦当连成细线，落在巷口那块被踩得发亮的石板上。`,
      `沈萤把伞收在门后，账簿翻开第${number}页，纸页上还留着上一任渡口管事用朱笔圈出的数字：${number * 17}。`,
      `她抬头看向窗外的运河，货船吃水很深，船工喊号的声音被雨压低，像隔着几层湿布传来。`,
      ...SECTION_BODY_SENTENCES.map(sentence => sectionSentence(sentence, number)),
      `镇上的人说，这样的雨季里旧账最容易翻出来，因为水会把藏在木板缝里的字泡软。`,
      '',
    ].join('\n')
  })
  return `# 青石镇的雨季\n\n${sections.join('\n\n')}`
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
  assert.equal(staleBundles.length, 0, `renderer build is stale: ${staleBundles.join(', ')}`)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function removeDir(target) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.rmSync(target, { recursive: true, force: true })
      return
    } catch {}
    await sleep(300)
  }
}

function completion(content) {
  return {
    choices: [{ finish_reason: 'stop', message: { role: 'assistant', content } }],
  }
}

function toolCall(id, name, input) {
  return {
    choices: [{
      finish_reason: 'tool_calls',
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(input) } }],
      },
    }],
  }
}

const writePayload = (commands, reason) => ({ commands, reveal: { mode: 'instant', firstChange: true }, reason })
const requests = []
let step = ''
let stepRequestCount = 0
let taskIndex = 0
let longDocument = ''

const tasks = [
  {
    id: 'step1-modify',
    user: '请把第 3 节里“账簿翻开第3页”改成“账簿翻到第三页”。',
    tool: () => toolCall('v3-write-1', 'editor.write', writePayload([{
      operation: 'replace_match',
      target: '账簿翻开第3页',
      content: '账簿翻到第三页',
      reason: '修改第3节指定句子',
    }], '第3节句子修改')),
    final: '第3节那句已经改好。',
  },
  {
    id: 'step2-append',
    user: '请在第 7 节结尾新增一句：纸伞骨上的旧漆裂开一道细缝。',
    tool: () => toolCall('v3-write-2', 'editor.write', writePayload([{
      operation: 'replace_match',
      target: sectionText(longDocument, 7),
      content: `${sectionText(longDocument, 7)}\n纸伞骨上的旧漆裂开一道细缝。`,
      reason: '第7节结尾新增一句',
    }], '第7节新增')),
    final: '第7节结尾已经加上了。',
  },
  {
    id: 'step3-delete',
    user: '删除第 11 节里“船工喊号的声音被雨压低”这一句。',
    tool: () => toolCall('v3-write-3', 'editor.write', writePayload([{
      operation: 'replace_match',
      target: `沈萤把伞收在门后，账簿翻开第11页，纸页上还留着上一任渡口管事用朱笔圈出的数字：187。\n她抬头看向窗外的运河，货船吃水很深，船工喊号的声音被雨压低，像隔着几层湿布传来。`,
      content: '沈萤把伞收在门后，账簿翻开第11页，纸页上还留着上一任渡口管事用朱笔圈出的数字：187。\n她抬头看向窗外的运河，货船吃水很深，像隔着几层湿布传来。',
      reason: '删除第11节指定短语',
    }], '第11节删除')),
    final: '第11节那句里的短语已经删掉。',
  },
  {
    id: 'step4-move',
    user: '把第 15 节整节移动到第 5 节前面，并保持节内文字不变。',
    tool: () => toolCall('v3-write-4', 'editor.write', writePayload([{
      operation: 'replace_match',
      target: longDocument,
      content: moveSection(longDocument, 15, 5),
      reason: '把第15节移动到第5节前',
    }], '第15节移动')),
    final: '第15节已经移动到第5节前面。',
  },
  {
    id: 'step5-tidy',
    user: '整理整篇文章：保留节标题和正文，删除多余空行，每节末尾只留一个空行。',
    tool: () => toolCall('v3-write-5', 'editor.write', writePayload([{
      operation: 'replace_match',
      target: longDocument,
      content: tidyDocument(longDocument),
      reason: '整理编号与空行',
    }], '全篇整理')),
    final: '整篇已经整理完成。',
  },
  {
    id: 'step6-reorder',
    user: '把第 8、9、10 三节按倒序重排，其他内容保持不变。',
    tool: () => toolCall('v3-write-6', 'editor.write', writePayload([{
      operation: 'replace_match',
      target: longDocument,
      content: reorderSections(longDocument, [10, 9, 8]),
      reason: '第8到10节倒序重排',
    }], '局部重排')),
    final: '第8到10节已经倒序排好。',
  },
]

function sectionsOf(text) {
  const lines = text.split('\n')
  const sections = []
  let current = null
  for (const line of lines) {
    if (/^## 第\d+节 /.test(line)) {
      if (current) sections.push(current)
      current = { title: line, lines: [] }
    } else if (current) {
      current.lines.push(line)
    } else if (line.trim()) {
      sections.push({ title: line, lines: [] })
    }
  }
  if (current) sections.push(current)
  return sections
}

function sectionText(text, number) {
  const section = sectionsOf(text)
    .find(item => item.title === `## 第${number}节 ${SECTION_TITLES[number - 1]}`)
  assert(section, `section ${number} found`)
  return [section.title, ...section.lines].join('\n').trimEnd()
}

function moveSection(text, from, before) {
  const sections = sectionsOf(text)
  const fromIndex = sections.findIndex(section => section.title === `## 第${from}节 ${SECTION_TITLES[from - 1]}`)
  const beforeIndex = sections.findIndex(section => section.title === `## 第${before}节 ${SECTION_TITLES[before - 1]}`)
  assert(fromIndex >= 0 && beforeIndex >= 0, `move sections found: from=${fromIndex}, before=${beforeIndex}`)
  const [moved] = sections.splice(fromIndex, 1)
  const insertIndex = sections.findIndex(section => section.title === `## 第${before}节 ${SECTION_TITLES[before - 1]}`)
  sections.splice(insertIndex, 0, moved)
  return sections.map(section => [section.title, ...section.lines].join('\n')).join('\n')
}

function tidyDocument(text) {
  return text
    .split(/\r?\n/)
    .map(line => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd() + '\n'
}

function reorderSections(text, order) {
  const sections = sectionsOf(text)
  const index = order[0] - 1
  const group = sections.slice(index, index + order.length)
  const reordered = [...group].sort((a, b) => Number(b.title.match(/第(\d+)节/)[1]) - Number(a.title.match(/第(\d+)节/)[1]))
  sections.splice(index, order.length, ...reordered)
  return sections.map(section => [section.title, ...section.lines].join('\n')).join('\n')
}

const server = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    let body = null
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    const isIntentClassifier = (body?.messages || []).some(message =>
      message?.role === 'system' && String(message.content || '').includes('意图分类器'))
    if (!isIntentClassifier) stepRequestCount += 1
    requests.push({ step, stepRequestCount, isIntentClassifier, body })
    if (isIntentClassifier) {
      respond(response, body, completion('{"intent":"edit","confidence":0.92,"reason":"用户明确要求编辑文档"}'))
      return
    }
    const task = tasks.find(item => item.id === step)
    assert(task, `mock server found task for step ${step}`)
    if (stepRequestCount === 1) {
      respond(response, body, task.tool())
      return
    }
    if (stepRequestCount === 2 && task.id === 'step4-move') {
      respond(response, body, completion('{"name":"editor.write","arguments":{"commands":[]}}'))
      return
    }
    respond(response, body, completion(task.final))
  })
})

function respond(response, body, payload) {
  if (body?.stream) {
    const delta = payload.choices?.[0]?.message || {}
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    response.write(`data: ${JSON.stringify({
      id: `api-direct-write-user-visible-v3-${step}-${stepRequestCount}`,
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
      })),
      apiCalls: (run.apiCalls || []).map(call => ({
        id: call.id,
        turnId: call.turnId || null,
        status: call.status,
        finishReason: call.finishReason || null,
        physicalCalls: (call.physicalCalls || []).map(physical => ({
          status: physical.status,
          phase: physical.phase,
          error: physical.error || null,
        })),
        toolCalls: (call.toolCalls || []).map(tool => ({
          toolCallId: tool.toolCallId || null,
          name: tool.name,
          status: tool.status,
          input: tool.input || null,
          error: tool.error || null,
        })),
      })),
      events: (run.events || []).map(event => ({ type: event.type, level: event.level, label: event.label, detail: event.detail })),
    }
  })
}

async function setupProject(page, manuscript) {
  await page.evaluate(async ({ mockUrl, outline, projectId }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'api-direct-write-user-visible-v3-provider',
        name: 'API Direct Write User Visible V3 Mock',
        baseUrl: mockUrl,
        apiKey: 'key',
        models: ['api-direct-write-user-visible-v3-model'],
        selectedModel: 'api-direct-write-user-visible-v3-model',
        temperature: 0.1,
        maxTokens: 4096,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
      }],
      generateProvider: 'api-direct-write-user-visible-v3-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: 'API Direct Write User Visible V3',
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
    await window.electronAPI.storageWrite('wa_skills', { skills: [] })
    await window.electronAPI.storageWrite('wa_co_creation_config', {
      agentId: '',
      skillIds: [],
      mode: 'compose',
      skillAgents: {},
    })
  }, { mockUrl: MOCK_BASE_URL, outline: manuscript, projectId: PROJECT_ID })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20000 })
  await sleep(1200)
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
  await sleep(400)
}

async function openOutline(page) {
  await page.click('#btn-outline-workspace')
  await page.waitForSelector('#outline-editor', { timeout: 15000 })
  await page.locator('#outline-editor').fill(longDocument)
  await sleep(300)
  await page.click('#btn-ai-co-create')
  await page.waitForSelector('#ow-chat-input', { timeout: 15000 })
}

async function waitOutlineIdle(page) {
  await page.waitForFunction(() => Boolean(document.querySelector('#btn-ow-send') && !document.querySelector('#btn-ow-send')?.disabled), null, { timeout: 120000, polling: 250 })
  await sleep(250)
}

async function outlineContent(page) {
  return await page.evaluate(() => window.__pinia?._s?.get('project')?.outlineText || '')
}

async function capture(page, name) {
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`), fullPage: true })
}

async function main() {
  assertFreshRendererBuild()
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
  fs.mkdirSync(EXPORT_ROOT, { recursive: true })
  longDocument = buildManuscript()
  fs.writeFileSync(MANUSCRIPT_PATH, longDocument, 'utf8')
  assert(longDocument.length >= 4500, `manuscript is long enough: ${longDocument.length}`)
  const evidence = {
    generatedAt: new Date().toISOString(),
    manuscriptChars: longDocument.length,
    steps: [],
    passed: true,
  }

  await new Promise(resolve => server.listen(MOCK_PORT, '127.0.0.1', resolve))
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
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1500)
    await setupProject(page, longDocument)
    await openOutline(page)

    for (taskIndex = 0; taskIndex < tasks.length; taskIndex++) {
      const task = tasks[taskIndex]
      step = task.id
      stepRequestCount = 0
      const before = await outlineContent(page)
      longDocument = before
      const plannedTool = task.tool()
      const plannedCommands = JSON.parse(plannedTool.choices[0].message.tool_calls[0].function.arguments).commands
      for (const command of plannedCommands) {
        assert(command.target !== command.content, `${task.id}: planned write must change the document`)
      }
      fs.writeFileSync(path.join(EVIDENCE_DIR, `${task.id}-before.md`), before, 'utf8')
      await waitOutlineIdle(page)
      await page.locator('#ow-chat-input').fill(task.user)
      await page.locator('#ow-chat-input').evaluate(element => element.dispatchEvent(new Event('change', { bubbles: true })))
      await page.locator('#btn-ow-send').click()
      try {
        await page.waitForFunction(value => (document.body.textContent || '').includes(value), task.final, { timeout: 120000, polling: 250 })
      } catch (error) {
        const bodyText = await page.evaluate(() => (document.body.textContent || '').slice(-5000))
        const run = await latestRun(page)
        console.error(`[STEP TIMEOUT] ${task.id}\n[TRACE] ${JSON.stringify(run)}\n${bodyText}`)
        throw error
      }
      await waitOutlineIdle(page)
      const after = await outlineContent(page)
      fs.writeFileSync(path.join(EVIDENCE_DIR, `${task.id}-after.md`), after, 'utf8')
      await capture(page, task.id)
      const stepRequests = requests.filter(item => item.step === task.id && !item.isIntentClassifier)
      const run = await latestRun(page)
      const allRuns = await page.evaluate(() => {
        const store = window.__pinia?._s?.get('runTrace')
        return (store?.runs || []).map(run => ({
          id: run.id,
          turns: (run.turns || []).map(turn => ({
            id: turn.id,
            status: turn.status,
            userRequest: turn.userRequest,
            toolCalls: (turn.toolCalls || []).map(tool => ({
              toolCallId: tool.toolCallId || null,
              name: tool.name,
              status: tool.status,
              input: tool.input || null,
              error: tool.error || null,
            })),
            intent: turn.intent || null,
            reason: turn.reason || null,
          })),
          apiCalls: (run.apiCalls || []).map(call => ({
            id: call.id,
            turnId: call.turnId || null,
            status: call.status,
            finishReason: call.finishReason || null,
            toolCalls: (call.toolCalls || []).map(tool => ({
              toolCallId: tool.toolCallId || null,
              name: tool.name,
              status: tool.status,
              input: tool.input || null,
              error: tool.error || null,
            })),
          })),
        }))
      })
      const matchingRuns = allRuns
        .map(item => ({
          ...item,
          matchingTurn: (item.turns || []).find(turn => turn.userRequest === task.user),
        }))
        .filter(item => item.matchingTurn)
        .sort((a, b) => Number(String(b.matchingTurn.id).match(/(\d+)$/)?.[1] || 0)
          - Number(String(a.matchingTurn.id).match(/(\d+)$/)?.[1] || 0))
      const currentRun = matchingRuns[0]
      const turn = currentRun?.matchingTurn
      const apiCalls = (currentRun?.apiCalls || []).filter(call => call.turnId === turn?.id)
      const apiCallWrites = apiCalls.flatMap(call => call.toolCalls || [])
        .filter(call => call.name === 'editor.write')
      const writes = apiCallWrites.length
        ? apiCallWrites
        : (turn?.toolCalls || []).filter(call => call.name === 'editor.write')
      const stepRecord = {
        id: task.id,
        user: task.user,
        changed: before !== after,
        requestCount: stepRequests.length,
        writeCalls: writes.length,
        writeStatuses: writes.map(call => call.status),
        finishReason: apiCalls.at(-1)?.finishReason || null,
        hasConvergencePseudoCallEvent: (run?.events || []).some(event => event.type === 'tool-convergence-pseudo-call'),
        hasConvergenceCorrectedEvent: (run?.events || []).some(event => event.type === 'tool-convergence-corrected'),
        apiCallStatuses: apiCalls.map(call => call.status),
        toolIterationCeiling: 12,
      }
      console.log(`[DEBUG] ${task.id}: ${JSON.stringify({
        turn,
        apiCalls: apiCalls.map(call => ({
          status: call.status,
          finishReason: call.finishReason,
          tools: call.toolCalls.map(tool => `${tool.name}:${tool.status}`),
        })),
        requests: stepRequests.map(item => ({
          count: item.stepRequestCount,
          tools: (item.body?.tools || []).map(tool => tool?.function?.name || tool?.name || ''),
          user: (item.body?.messages || []).filter(message => message?.role === 'user').map(message => String(message.content || '').slice(0, 160)),
        })),
      })}`)
      evidence.steps.push(stepRecord)
      assert(stepRecord.changed, `${task.id}: editor content changed`)
      assert(writes.length >= 1, `${task.id}: trace records editor.write`)
      stepRecord.writeCalls = writes.length
      stepRecord.writeStatuses = writes.map(call => call.status)
      assert(stepRecord.writeStatuses.every(status => status === 'success'), `${task.id}: editor.write succeeds`)
      assert(stepRecord.apiCallStatuses.every(status => status !== 'running'), `${task.id}: API calls closed`)
      assert(stepRecord.requestCount >= 2, `${task.id}: provider performed tool request and final answer`)
      if (task.id === 'step4-move') {
        assert(stepRecord.hasConvergencePseudoCallEvent, 'step4: pseudo tool call is detected')
        assert(stepRecord.hasConvergenceCorrectedEvent, 'step4: convergence correction succeeds')
        assert(stepRecord.requestCount >= 3, 'step4: pseudo call triggers one correction request')
      }
      console.log(`[PASS] ${task.id}: requests=${stepRecord.requestCount}, writes=${stepRecord.writeCalls}`)
    }

    const finalText = await outlineContent(page)
    assert(finalText.includes('账簿翻到第三页'), 'step1 target survives all later steps')
    assert(finalText.includes('纸伞骨上的旧漆裂开一道细缝。'), 'step2 target survives all later steps')
    const section11Final = sectionText(finalText, 11)
    assert(!section11Final.includes('船工喊号的声音被雨压低'), 'step3 deletion survives all later steps')
    assert(finalText.indexOf('## 第15节 盐仓档案') < finalText.indexOf('## 第5节 南货铺的钟'), 'step4 move survives all later steps')
    assert(!/\n{3,}/.test(finalText), 'step5 tidy leaves no triple blank lines')
    assert(
      finalText.indexOf('## 第10节 夜市油灯') < finalText.indexOf('## 第9节 渡河人')
      && finalText.indexOf('## 第9节 渡河人') < finalText.indexOf('## 第8节 沈家的船'),
      'step6 local reorder survives all later steps',
    )

    const exportResult = await page.evaluate(async ({ exportRoot }) => {
      const store = window.__pinia?._s?.get('runTrace')
      const run = [...(store?.runs || [])]
        .filter(item => item.source === 'outline')
        .sort((a, b) => b.startedAt - a.startedAt)[0]
      return await window.electronAPI.runTraceExport({
        schema: 'shenyi.run-trace',
        version: 2,
        run: store.exportRunToJson(run),
        mode: 'deep',
        payloadDirectoryHint: exportRoot,
      })
    }, { exportRoot: EXPORT_ROOT })
    assert(exportResult?.success, `trace export succeeds: ${exportResult?.reason || ''}`)
    const exportedRun = JSON.parse(fs.readFileSync(path.join(exportResult.path, 'run-trace.json'), 'utf8'))
    assert(exportedRun.apiCalls.every(call => call.status !== 'running'), 'exported trace has no running API call')
    fs.copyFileSync(path.join(exportResult.path, 'run-trace.json'), path.join(EVIDENCE_DIR, 'run-trace.json'))
    evidence.exportPath = path.join(EVIDENCE_DIR, 'run-trace.json')
    evidence.exportedApiCalls = exportedRun.apiCalls.length
    await capture(page, 'final-state')
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'verification-result.json'), JSON.stringify(evidence, null, 2), 'utf8')
    console.log(`===== API DIRECT WRITE USER VISIBLE V3 PASSED (${evidence.manuscriptChars} chars) =====`)
  } finally {
    try { if (browser) await browser.close() } catch {}
    try { execFileSync('taskkill', ['/PID', String(electronProcess.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
    server.close()
    await sleep(800)
    removeDir(PROFILE)
    removeDir(EXPORT_ROOT)
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
