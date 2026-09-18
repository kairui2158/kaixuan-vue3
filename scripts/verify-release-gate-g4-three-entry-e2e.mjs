import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = process.env.SHENYI_E2E_INSTALLED_EXE
  ? path.resolve(process.env.SHENYI_E2E_INSTALLED_EXE)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9254
const PROFILE = path.join(ROOT, '_data', 'release-gate-g4-three-entry-profile')
const DATA_DIR = path.join(PROFILE, 'app-data')
const SKILL_ROOT = path.join(PROFILE, 'skills')
const SKILL_DIR = path.join(SKILL_ROOT, 'g4-volume-skill')
const EXPORT_ROOT = path.join(PROFILE, 'run-trace-exports')
const MOCK_PORT = 59908
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const PROVIDER_ID = 'release-gate-g4-provider'
const MODEL = 'release-gate-g4-model'
const PROJECT_ID = 'release-gate-g4-project'
const OUTLINE_TEXT = [
  '第一卷 风暴起点',
  '北方风暴逼近，男主在夜路中发现旧信。',
  '第1章 夜行',
  '男主穿过风暴，遇到持灯人。'
].join('\n')
const VOLUME_OUTPUT = JSON.stringify([{
  name: '风暴起点',
  outline: '北方风暴中男主发现旧信并南下。',
  summary: '旧信推动第一卷主线。',
  allocatedWords: 20000
}])

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

let scenario = 'normal'
const providerRequests = []
const requestLog = []

function sse(response, events) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache'
  })
  response.write(events.map(event => `data: ${JSON.stringify(event)}`).join('\n\n') + '\n\n')
  response.write('data: [DONE]\n\n')
  response.end()
}

function jsonResponse(response, payload) {
  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

const providerServer = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    let body = null
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    const text = (body?.messages || []).map(message => String(message.content || '')).join('\n')
    const entry = {
      scenario,
      url: request.url,
      text,
      stream: body?.stream === true,
      toolsCount: Array.isArray(body?.tools) ? body.tools.length : 0
    }
    providerRequests.push(entry)
    requestLog.push(entry)

    if (scenario === 'hold') {
      if (body?.stream === false) {
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        response.write('')
        return
      }
      response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' })
      response.write(': release-gate-g4-hold\n\n')
      return
    }
    if (body?.stream === false) {
      const reasoningOnly = scenario === 'reasoning-empty'
      jsonResponse(response, {
        choices: [{
          message: {
            content: reasoningOnly ? '' : `G4真实UI输出：${scenario}`,
            reasoning_content: reasoningOnly ? 'G4首次只输出思考。'.repeat(10) : ''
          },
          finish_reason: reasoningOnly ? 'length' : 'stop'
        }],
        usage: { completion_tokens: reasoningOnly ? 100 : 12 }
      })
      return
    }
    if (scenario === 'reasoning-empty') {
      sse(response, [
        { choices: [{ delta: { reasoning_content: 'G4首次只输出思考。'.repeat(10) }, finish_reason: null }] },
        { choices: [{ delta: { content: '' }, finish_reason: 'length' }] }
      ])
      return
    }
    if (scenario === 'reasoning-empty-retry') {
      sse(response, [
        { choices: [{ delta: { reasoning_content: 'G4直出重试仍然只输出思考。'.repeat(10) }, finish_reason: null }] },
        { choices: [{ delta: { content: '' }, finish_reason: 'length' }] }
      ])
      return
    }

    const output = text.includes('请生成') && text.includes('卷的卷纲') && text.includes('allocatedWords')
      ? VOLUME_OUTPUT
      : `G4真实UI输出：${scenario}`
    sse(response, [
      { choices: [{ delta: { content: output }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] }
    ])
  })
})

function writeSkillFolder() {
  fs.mkdirSync(SKILL_DIR, { recursive: true })
  fs.writeFileSync(path.join(SKILL_DIR, 'SKILL.md'), [
    '---',
    'id: g4-volume-skill',
    'name: G4卷纲文件夹技能',
    'description: G4三入口真实UI验证用 folder skill',
    'format: folder',
    '---',
    '',
    '你是G4卷纲文件夹技能，只输出当前步骤定稿产物。'
  ].join('\n'), 'utf8')
  fs.writeFileSync(path.join(SKILL_DIR, 'template.md'), '你必须输出一个 JSON 数组。', 'utf8')
}

function startElectron() {
  const child = spawn(ELECTRON_EXE, [
    '.',
    `--remote-debugging-port=${CDP_PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${PROFILE}`
  ], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SHENYI_TEST_USER_DATA_DIR: DATA_DIR,
      SHENYI_TEST_RUN_TRACE_EXPORT: EXPORT_ROOT
    },
    windowsHide: true
  })
  child.stdout.on('data', data => {
    const text = String(data)
    if (/Uncaught|unhandledRejection/i.test(text)) console.log('[ELECTRON:stdout] ' + text.slice(0, 500))
  })
  child.stderr.on('data', data => {
    const text = String(data)
    if (/Uncaught|unhandledRejection|EADDRINUSE/i.test(text)) console.log('[ELECTRON:stderr] ' + text.slice(0, 500))
  })
  return child
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

async function latestRun(page, source) {
  return page.evaluate(async sourceName => {
    const run = [...(window.__pinia?.state?.value?.runTrace?.runs || [])]
      .filter(item => item.source === sourceName)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    return run ? {
      id: run.id,
      status: run.status,
      source: run.source,
      stepName: run.stepName,
      mode: run.mode,
      skillNames: run.skillNames,
      events: (run.events || []).map(event => ({ type: event.type, level: event.level, label: event.label })),
      turns: (run.turns || []).map(turn => ({ status: turn.status, error: turn.error })),
      apiCalls: (run.apiCalls || []).map(call => ({
        status: call.status,
        skillName: call.skillName,
        error: call.error,
        streamLength: (call.streamText || '').length,
        reasoningLength: (call.reasoningText || '').length,
        responseLength: (call.responseText || '').length
      }))
    } : null
  }, source)
}

async function waitIdle(page, selector, timeout = 60000) {
  await page.waitForFunction(selectorName => {
    const button = document.querySelector(selectorName)
    return Boolean(button && !button.disabled)
  }, selector, { timeout, polling: 250 })
}

async function exportLatestTrace(page, source) {
  const existingExports = new Set(fs.readdirSync(EXPORT_ROOT))
  await page.click(selectorForRunTraceButton(source))
  await page.waitForSelector('#run-trace-overlay', { timeout: 10000 })
  const runId = await latestRunId(page, source)
  await page.waitForSelector(`#run-trace-panel [data-run-id="${runId}"]`, { timeout: 10000 })
  await page.click(`#run-trace-panel [data-run-id="${runId}"]`)
  await page.click('#run-trace-panel .rt-tabs button:nth-child(4)')
  await page.click('#run-trace-panel .rt-export button.btn-primary')
  const exportPath = await waitForExportDirectory(existingExports, runId)
  assert(exportPath, 'run trace export should return a path')
  await page.click('#run-trace-panel .modal-close')
  return { runId, exportPath }
}

async function waitForExportDirectory(existingExports, runId) {
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) {
    for (const name of fs.readdirSync(EXPORT_ROOT)) {
      if (existingExports.has(name)) continue
      const dir = path.join(EXPORT_ROOT, name)
      const runTraceFile = path.join(dir, 'run-trace.json')
      const exportFile = path.join(dir, 'export.json')
      if (!fs.existsSync(runTraceFile) || !fs.existsSync(exportFile)) continue
      try {
        const json = JSON.parse(fs.readFileSync(runTraceFile, 'utf8'))
        if (json.id === runId) return dir
      } catch {}
    }
    await sleep(200)
  }
  return ''
}

async function latestRunId(page, source) {
  return page.evaluate(async sourceName => {
    const run = [...(window.__pinia?.state?.value?.runTrace?.runs || [])]
      .filter(item => item.source === sourceName)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    return run?.id || ''
  }, source)
}

function selectorForRunTraceButton(source) {
  if (source === 'outline') return '#btn-ow-run-trace'
  if (source === 'pipeline') return '#btn-run-trace'
  return '#btn-editor-run-trace'
}

async function assertExportedRun(runId, expectations, exportPath) {
  assert(runId, 'run id should exist before export')
    assert(fs.existsSync(path.join(exportPath, 'run-trace.json')), 'export should contain run-trace.json')
    assert(fs.existsSync(path.join(exportPath, 'export.json')), 'export should contain export.json')
    const json = JSON.parse(fs.readFileSync(path.join(exportPath, 'run-trace.json'), 'utf8'))
    const payloadsDir = path.join(exportPath, 'payloads')
    assert(json.id === runId, `exported run should be ${runId}, got ${json.id}`)
  assert(json.status === expectations.status, `export status should be ${expectations.status}, got ${json.status}`)
  if (expectations.sessionSnapshot) {
    assert(json.sessionSnapshot === true, 'exported open chat session should be marked as a snapshot')
  } else {
    assert(!json.sessionSnapshot, 'task runs should not be marked as chat snapshots')
  }
  assert(json.source === expectations.source, `export source should be ${expectations.source}, got ${json.source}`)
  assert(json.apiCalls.every(call => call.status !== 'running'), 'exported run should have no running API call')
  const exportJson = JSON.parse(fs.readFileSync(path.join(exportPath, 'export.json'), 'utf8'))
  assert(exportJson.payloadVerification?.ok === true, 'payload verification should pass')
  if (expectations.streamLengthAtLeast) {
    assert(fs.existsSync(payloadsDir), 'stream payload directory should exist')
    const streamPayloads = (json.payloads || []).filter(payload => payload.kind === 'stream')
    assert(streamPayloads.length > 0, 'run trace should register stream payload')
    assert(streamPayloads.some(payload => {
      try {
        return fs.readFileSync(path.join(payloadsDir, payload.file), 'utf8').length >= expectations.streamLengthAtLeast
      } catch {
        return false
      }
    }), `at least one stream payload should be at least ${expectations.streamLengthAtLeast} chars`)
  }
  if (expectations.reasoningLengthAtLeast) {
    assert(fs.existsSync(payloadsDir), 'reasoning payload directory should exist')
    const reasoningPayloads = (json.payloads || []).filter(payload => payload.kind === 'reasoning')
    assert(reasoningPayloads.length > 0, 'run trace should register reasoning payload')
    assert(reasoningPayloads.some(payload => {
      try {
        return fs.readFileSync(path.join(payloadsDir, payload.file), 'utf8').length >= expectations.reasoningLengthAtLeast
      } catch {
        return false
      }
    }), `at least one reasoning payload should be at least ${expectations.reasoningLengthAtLeast} chars`)
  }
  return { path: exportPath, json }
}

async function main() {
  await new Promise(resolve => providerServer.listen(MOCK_PORT, '127.0.0.1', resolve))
  fs.rmSync(PROFILE, { recursive: true, force: true })
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.mkdirSync(EXPORT_ROOT, { recursive: true })
  writeSkillFolder()
  const electronProcess = startElectron()

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
    page.on('console', message => {
      if (message.type() === 'error') console.log('[PAGE CONSOLE ERROR] ' + message.text())
    })
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1500)
    await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
    await sleep(500)

    await page.evaluate(async ({ providerConfig, project, folderSkill }) => {
      await window.electronAPI.storageWrite('wa_lastProjectId', 'release-gate-g4-project')
      await window.electronAPI.storageWrite('wa_providers', providerConfig)
      await window.electronAPI.storageWrite('wa_project_release-gate-g4-project', project)
      await window.electronAPI.storageWrite('wa_skills', { skills: [folderSkill], pipelineSkills: [] })
      await window.electronAPI.storageWrite('wa_pipeline_step_config', {
        agents: { 0: '', 1: '', 2: '', 3: '', 4: '' },
        skills: { 0: [], 1: [], 2: ['folder:g4-volume-skill'], 3: [], 4: [] },
        modes: { 0: 'compose', 1: 'compose', 2: 'chain', 3: 'chain', 4: 'chain' },
        skillAgents: {}
      })
      await window.electronAPI.storageWrite('wa_deAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
      await window.electronAPI.storageRemove('wa_pipeline_breakpoint')
    }, {
      providerConfig: {
        providers: [{
          id: PROVIDER_ID,
          name: 'Release Gate G4 Provider',
          baseUrl: MOCK_BASE_URL,
          apiKey: 'release-gate-g4-key',
          models: [MODEL],
          selectedModel: MODEL,
          temperature: 0.1,
          maxTokens: 128000,
          purpose: ['generate'],
          providerType: 'openai-compatible',
          streamMode: true
        }],
        generateProvider: PROVIDER_ID
      },
      project: {
        schemaVersion: 3,
        projectName: 'Release Gate G4',
        outlineText: OUTLINE_TEXT,
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
      },
      folderSkill: {
        id: 'folder:g4-volume-skill',
        sourceId: 'g4-volume-skill',
        name: 'G4卷纲文件夹技能',
        format: 'folder',
        folderPath: SKILL_DIR,
        template: '你必须输出一个 JSON 数组。',
        category: 'folder',
        description: 'G4三入口真实UI验证用 folder skill',
        resourceSummary: { resourceCount: 0, warningCount: 0 },
        executionMode: 'chain',
        outputFormat: 'text',
        validationRules: [],
        splitSize: 1000,
        injectMode: 'system_prefix',
        bindTarget: 'project',
        linkedSkillIds: [],
        customVars: {},
        inputSchema: '',
        outputSchema: '',
        retryPolicy: '',
        intents: ['generate']
      }
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1500)
    await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
    await sleep(500)

    // 1. Home chat: streaming, cancellation, retry visibility, and export.
    scenario = 'normal'
    await page.fill('#user-input', 'G4主页正常流式')
    await page.click('#btn-send')
    await page.waitForFunction(() => (document.body.textContent || '').includes('G4真实UI输出：normal'), null, { timeout: 30000 })
    await waitIdle(page, '#btn-send')
    const homeRun = await latestRun(page, 'home')
    assert(homeRun?.status === 'running', `home normal chat session should remain open, got ${homeRun?.status}`)
    assert(homeRun?.turns?.at(-1)?.status === 'success', 'home normal turn should succeed')
    assert(homeRun.apiCalls.length > 0, 'home normal run should record API call')
    assert(homeRun.apiCalls.some(call => call.streamLength > 0), 'home normal run should record stream text')
    const homeNormalExport = await exportLatestTrace(page, 'home')
    await assertExportedRun(homeNormalExport.runId, { status: 'success', source: 'home', streamLengthAtLeast: 1, sessionSnapshot: true }, homeNormalExport.exportPath)
    console.log('[PASS] G4 home: normal stream and real export pass')

    scenario = 'hold'
    await page.fill('#user-input', 'G4主页取消路径')
    await page.click('#btn-send')
    await page.waitForSelector('#btn-cancel-generation', { timeout: 10000 })
    await page.click('#btn-cancel-generation')
    await waitIdle(page, '#btn-send', 10000)
    const homeCancelRun = await latestRun(page, 'home')
    assert(homeCancelRun?.turns?.at(-1)?.status === 'canceled', 'home cancellation turn should be canceled')
    assert(homeCancelRun.apiCalls.every(call => call.status !== 'running'), 'home cancellation should close API calls')
    const homeCancelExport = await exportLatestTrace(page, 'home')
    await assertExportedRun(homeCancelExport.runId, { status: 'canceled', source: 'home', sessionSnapshot: true }, homeCancelExport.exportPath)
    console.log('[PASS] G4 home: cancellation and export pass')

    scenario = 'reasoning-empty'
    await page.fill('#user-input', 'G4主页空正文路径')
    await page.click('#btn-send')
    await page.waitForFunction(() => (document.querySelector('#chat-generation-status-text')?.textContent || '').includes('直出模式'), null, { timeout: 10000, polling: 200 }).catch(() => {})
    scenario = 'reasoning-empty-retry'
    await waitIdle(page, '#btn-send', 60000)
    const homeRetryRun = await latestRun(page, 'home')
    assert(homeRetryRun?.status === 'failed', 'home reasoning-empty run should fail')
    assert(homeRetryRun.events.some(event => event.type === 'generation-invalid'), 'home should record generation-invalid')
    assert(homeRetryRun.events.some(event => event.type === 'direct-retry-start'), 'home should record direct-retry-start')
    assert(homeRetryRun.events.some(event => event.type === 'direct-retry-finished'), 'home should record direct-retry-finished')
    assert(homeRetryRun.apiCalls.some(call => call.reasoningLength > 0), 'home should preserve reasoning trace')
    const homeRetryExport = await exportLatestTrace(page, 'home')
    await assertExportedRun(homeRetryExport.runId, { status: 'failed', source: 'home', reasoningLengthAtLeast: 1 }, homeRetryExport.exportPath)
    console.log('[PASS] G4 home: reasoning-empty retry visibility and export pass')

    // 2. Outline workspace: streaming, cancellation, and export.
    scenario = 'normal'
    await page.click('#btn-outline-workspace')
    await page.waitForSelector('#outline-editor', { timeout: 10000 })
    await page.click('#btn-ai-co-create')
    await page.waitForSelector('#ow-chat-input', { timeout: 10000 })
    await page.locator('#outline-editor').fill(OUTLINE_TEXT)
    await page.fill('#ow-chat-input', 'G4大纲工作台正常流式')
    await page.click('#btn-ow-send')
    await page.waitForFunction(() => (document.body.textContent || '').includes('G4真实UI输出：normal'), null, { timeout: 30000 })
    await waitIdle(page, '#btn-ow-send')
    const outlineRun = await latestRun(page, 'outline')
    assert(outlineRun?.status === 'running', `outline normal chat session should remain open, got ${outlineRun?.status}`)
    assert(outlineRun?.turns?.at(-1)?.status === 'success', 'outline normal turn should succeed')
    assert(outlineRun.apiCalls.length > 0, 'outline normal run should record API call')
    console.log('[G4 DEBUG] providerRequests=' + JSON.stringify(providerRequests, null, 2))
    assert(outlineRun.apiCalls.some(call => call.streamLength > 0), 'outline normal run should record stream text')
    const outlineToolStreamRequest = providerRequests.find(request =>
      request.url.includes('/chat/completions') && request.stream && request.toolsCount > 0
    )
    assert(outlineToolStreamRequest, 'outline native-tool turn should use streaming request')
    const outlineNormalExport = await exportLatestTrace(page, 'outline')
    await assertExportedRun(outlineNormalExport.runId, { status: 'success', source: 'outline', streamLengthAtLeast: 1, sessionSnapshot: true }, outlineNormalExport.exportPath)
    console.log('[PASS] G4 outline: normal stream and real export pass')

    scenario = 'hold'
    await page.fill('#ow-chat-input', 'G4大纲工作台取消路径')
    await page.click('#btn-ow-send')
    await page.waitForSelector('#btn-ow-cancel-generation', { timeout: 10000 })
    await page.click('#btn-ow-cancel-generation')
    await waitIdle(page, '#btn-ow-send', 10000)
    const outlineCancelRun = await latestRun(page, 'outline')
    assert(outlineCancelRun?.turns?.at(-1)?.status === 'canceled', 'outline cancellation turn should be canceled')
    assert(outlineCancelRun.apiCalls.every(call => call.status !== 'running'), 'outline cancellation should close API calls')
    const outlineCancelExport = await exportLatestTrace(page, 'outline')
    await assertExportedRun(outlineCancelExport.runId, { status: 'canceled', source: 'outline', sessionSnapshot: true }, outlineCancelExport.exportPath)
    console.log('[PASS] G4 outline: cancellation and export pass')

    // 3. Pipeline volume generation: folder chain, cancellation, and export.
    scenario = 'normal'
    await page.click('#btn-close-outline-workspace')
    await page.waitForTimeout(500)
    await page.click('#btn-pipeline')
    await page.waitForSelector('#pipeline-panel', { timeout: 10000 })
    await page.evaluate(() => {
      const project = window.__pinia?._s?.get('project')
      project?.unlockOutline?.()
    })
    await page.locator('#pl-outline').fill(OUTLINE_TEXT)
    await page.locator('#pl-book-word-count').fill('2')
    await page.locator('#btn-pl-confirm-outline').click()
    await page.waitForTimeout(500)
    await page.locator('#pl-steps .pl-step').nth(2).click()
    await page.waitForSelector('#pl-step-3-content', { state: 'visible' })
    await page.locator('#pl-volume-count').fill('1')
    await page.locator('#pl-volume-count').dispatchEvent('change')
    await page.waitForTimeout(500)
    await page.locator('#btn-pl-gen-volumes').click()
    await page.waitForFunction(() => {
      const button = document.querySelector('#btn-pl-gen-volumes')
      const row = document.querySelector('#pl-volume-select-0')
      return Boolean(button && !button.disabled && row && (row.textContent || '').includes('风暴起点'))
    }, null, { timeout: 60000, polling: 300 })
    const pipelineRun = await latestRun(page, 'pipeline')
    assert(pipelineRun?.status === 'success', `pipeline folder chain run should succeed, got ${pipelineRun?.status}`)
    assert(pipelineRun.apiCalls.length > 0, 'pipeline folder chain should record API call')
    assert(pipelineRun.apiCalls.some(call => call.skillName === 'G4卷纲文件夹技能（文件夹）'), 'pipeline should execute the folder skill by display name')
    assert(pipelineRun.apiCalls.some(call => call.streamLength > 0), 'pipeline folder chain should record stream text')
    const pipelineNormalExport = await exportLatestTrace(page, 'pipeline')
    await assertExportedRun(pipelineNormalExport.runId, { status: 'success', source: 'pipeline', streamLengthAtLeast: 1 }, pipelineNormalExport.exportPath)
    console.log('[PASS] G4 pipeline: folder chain streaming and real export pass')

    scenario = 'hold'
    await page.locator('#btn-pl-gen-volumes').click()
    await page.waitForSelector('#btn-pl-cancel-generation', { timeout: 10000 })
    await page.click('#btn-pl-cancel-generation')
    await page.waitForFunction(() => {
      const button = document.querySelector('#btn-pl-gen-volumes')
      return Boolean(button && !button.disabled)
    }, null, { timeout: 20000, polling: 250 })
    const pipelineCancelRun = await latestRun(page, 'pipeline')
    assert(pipelineCancelRun?.status === 'canceled', `pipeline cancellation run should be canceled, got ${pipelineCancelRun?.status}`)
    assert(pipelineCancelRun.apiCalls.every(call => call.status !== 'running'), 'pipeline cancellation should close API calls')
    const pipelineCancelExport = await exportLatestTrace(page, 'pipeline')
    await assertExportedRun(pipelineCancelExport.runId, { status: 'canceled', source: 'pipeline' }, pipelineCancelExport.exportPath)
    console.log('[PASS] G4 pipeline: cancellation and export pass')

    await browser.close()
    console.log('===== RELEASE GATE G4 THREE-ENTRY E2E PASSED =====')
  } finally {
    try { execFileSync('taskkill', ['/PID', String(electronProcess.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
    providerServer.close()
    await sleep(1000)
    if (process.env.SHENYI_E2E_KEEP_PROFILE !== '1') {
      for (let attempt = 0; attempt < 5; attempt++) {
        try { fs.rmSync(PROFILE, { recursive: true, force: true }); break } catch {}
        await sleep(1000)
      }
    }
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
