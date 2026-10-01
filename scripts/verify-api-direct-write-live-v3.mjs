import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9291
const PROFILE = path.join(ROOT, '_data', 'api-direct-write-live-v3-profile')
const EXPORT_ROOT = path.join(ROOT, '_data', 'api-direct-write-live-v3-exports')
const EVIDENCE_DIR = path.join(ROOT, '_audit', 'verification-api-direct-write-live-v3')
const PROJECT_ID = 'api-direct-write-live-v3'
const MANUSCRIPT_PATH = path.join(ROOT, '_audit', 'verification-api-direct-write-user-visible-2026-09-23', 'test-manuscript.md')

const API_KEY = process.env.SHENYI_LIVE_API_KEY
const BASE_URL = process.env.SHENYI_LIVE_BASE_URL
const MODEL = process.env.SHENYI_LIVE_MODEL
const LIVE_PROVIDER = String(process.env.SHENYI_LIVE_PROVIDER || 'openai').toLowerCase()
const STEP_TIMEOUT_MS = Number(process.env.SHENYI_LIVE_STEP_TIMEOUT_MS || 300000)
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_LIVE_GLOBAL_TIMEOUT_MS || 2100000)

const PROVIDER_TYPES = {
  openai: 'openai-compatible',
  anthropic: 'anthropic',
  gemini: 'gemini',
  azure: 'azure-openai',
}

const PROVIDER_TYPE = PROVIDER_TYPES[LIVE_PROVIDER]
const AZURE_DEPLOYMENT = process.env.SHENYI_LIVE_DEPLOYMENT
const AZURE_API_VERSION = process.env.SHENYI_LIVE_API_VERSION

if (!API_KEY || !BASE_URL || !MODEL) {
  console.error('Missing SHENYI_LIVE_API_KEY, SHENYI_LIVE_BASE_URL, or SHENYI_LIVE_MODEL')
  process.exit(2)
}

if (!PROVIDER_TYPE) {
  console.error(`Invalid SHENYI_LIVE_PROVIDER: ${LIVE_PROVIDER}. Use openai, anthropic, gemini, or azure.`)
  process.exit(2)
}

if (PROVIDER_TYPE === 'azure-openai' && (!AZURE_DEPLOYMENT || !AZURE_API_VERSION)) {
  console.error('Azure live verification requires SHENYI_LIVE_DEPLOYMENT and SHENYI_LIVE_API_VERSION')
  process.exit(2)
}

const tasks = [
  {
    id: 'live-step1-modify',
    user: '请把第 3 节里“账簿翻开第3页”改成“账簿翻到第三页”。',
    check: text => text.includes('账簿翻到第三页') && !text.includes('账簿翻开第3页'),
  },
  {
    id: 'live-step2-append',
    user: '请在第 7 节结尾新增一句：纸伞骨上的旧漆裂开一道细缝。',
    check: text => text.includes('纸伞骨上的旧漆裂开一道细缝。'),
  },
  {
    id: 'live-step3-delete',
    user: '删除第 11 节里“船工喊号的声音被雨压低”这一句。',
    check: text => {
      const section = text.match(/## 第11节[\s\S]*?(?=\n## |\n*$)/)?.[0] || ''
      return section.length > 0 && !section.includes('船工喊号的声音被雨压低')
    },
  },
  {
    id: 'live-step4-move',
    user: '把第 15 节整节移动到第 5 节前面，并保持节内文字不变。',
    check: text => text.indexOf('## 第15节 盐仓档案') >= 0
      && text.indexOf('## 第15节 盐仓档案') < text.indexOf('## 第5节 南货铺的钟'),
  },
  {
    id: 'live-step5-tidy',
    user: '整理整篇文章：统一小节编号、清除多余空行、按编号重排，并保持所有正文内容不丢失。',
    check: text => !/\n{3,}/.test(text),
  },
  {
    id: 'live-step6-reorder',
    user: '把第 8、9、10 三节按倒序重排，其他内容保持不变。',
    check: text => text.indexOf('## 第10节 夜市油灯') >= 0
      && text.indexOf('## 第10节 夜市油灯') < text.indexOf('## 第9节 渡河人')
      && text.indexOf('## 第9节 渡河人') < text.indexOf('## 第8节 沈家的船'),
  },
]

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
    windowsHide: false,
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

async function setupProject(page, manuscript) {
  await page.evaluate(async ({ baseUrl, model, outline, projectId, providerType, deployment, apiVersion }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'api-direct-write-live-v3-provider',
        name: 'API Direct Write Live V3',
        baseUrl,
        apiKey: window.__shenyiLiveApiKey,
        models: [model],
        selectedModel: model,
        temperature: 0.1,
        maxTokens: 128000,
        purpose: ['generate'],
        providerType,
        deployment,
        apiVersion,
        streamMode: true,
      }],
      generateProvider: 'api-direct-write-live-v3-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: 'API Direct Write Live V3',
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
  }, {
    baseUrl: BASE_URL,
    model: MODEL,
    outline: manuscript,
    projectId: PROJECT_ID,
    providerType: PROVIDER_TYPE,
    deployment: AZURE_DEPLOYMENT,
    apiVersion: AZURE_API_VERSION,
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20000 })
  await sleep(1200)
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
  await sleep(400)
}

async function openOutline(page, manuscript) {
  await page.click('#btn-outline-workspace')
  await page.waitForSelector('#outline-editor', { timeout: 15000 })
  await page.locator('#outline-editor').fill(manuscript)
  await sleep(300)
  await page.click('#btn-ai-co-create')
  await page.waitForSelector('#ow-chat-input', { timeout: 15000 })
}

async function waitOutlineIdle(page, timeout = STEP_TIMEOUT_MS) {
  await page.waitForFunction(() => Boolean(document.querySelector('#btn-ow-send') && !document.querySelector('#btn-ow-send')?.disabled), null, { timeout, polling: 500 })
  await sleep(500)
}

function providerRetryable(step) {
  if (!step) return false
  if (step.contentCheck) return false
  if (step.turnStatus !== 'failed' && step.turnStatus !== 'canceled') return false
  return (step.physicalErrors || []).some(error => (
    /502|503|504|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|network|timeout|供应商服务异常/i.test(String(error || ''))
  ))
}

async function buildStep(task, before, after, record) {
  const writes = (record.apiCalls || []).flatMap(call => call.toolCalls || []).filter(tool => tool.name === 'editor.write')
  const step5ReplaceCommands = task.id === 'live-step5-tidy'
    ? writes.flatMap(tool => Array.isArray((tool.input || {}).commands) ? tool.input.commands : [])
      .filter(command => command?.operation === 'replace_document')
    : []
  const step4MoveCommands = task.id === 'live-step4-move'
    ? writes.flatMap(tool => Array.isArray((tool.input || {}).commands) ? tool.input.commands : [])
      .filter(command => command?.operation === 'move')
    : []
  return {
    id: task.id,
    user: task.user,
    changed: before !== after,
    writeCalls: writes.length,
    moveCommands: step4MoveCommands,
    replaceDocumentCommands: step5ReplaceCommands,
    writeStatuses: writes.map(tool => tool.status),
    finalWriteStatus: writes.at(-1)?.status || null,
    turnStatus: record.turn.status,
    apiCallStatuses: (record.apiCalls || []).map(call => call.status),
    physicalCallCounts: (record.apiCalls || []).map(call => (call.physicalCalls || []).length),
    physicalErrors: (record.apiCalls || []).flatMap(call => (call.physicalCalls || []).map(physical => physical.error || null)),
    contentCheck: task.check(after),
    record,
  }
}

async function outlineContent(page) {
  return await page.evaluate(() => window.__pinia?._s?.get('project')?.outlineText || '')
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

async function currentTurn(page, userRequest) {
  return await page.evaluate(request => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])]
      .filter(item => item.source === 'outline')
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    const turn = [...(run?.turns || [])]
      .filter(item => item.userRequest === request)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    if (!turn) return null
    return {
      runId: run.id,
      turn: {
        id: turn.id,
        status: turn.status,
        startedAt: turn.startedAt,
        userRequest: turn.userRequest,
        intent: turn.intent || null,
        reason: turn.reason || null,
      },
      apiCalls: (run.apiCalls || []).filter(call => call.turnId === turn.id).map(call => ({
        id: call.id,
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
    }
  }, userRequest)
}

async function attachTurnPayloads(page, record) {
  if (!record) return null
  const traceRoot = path.join(PROFILE, 'app-data', 'run-trace', 'outline')
  const traceDirs = fs.existsSync(traceRoot)
    ? fs.readdirSync(traceRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(traceRoot, entry.name))
      .filter(dir => fs.existsSync(path.join(dir, 'run-trace.json')))
    : []
  const matchingTrace = traceDirs
    .map(dir => ({ dir, trace: JSON.parse(fs.readFileSync(path.join(dir, 'run-trace.json'), 'utf8')) }))
    .find(({ trace }) => trace.id === record.runId)
  assert(matchingTrace, `run trace is persisted for ${record.runId}`)
  const persistedTurn = (matchingTrace.trace.turns || []).find(turn => turn.id === record.turn.id)
  const persistedCalls = (matchingTrace.trace.apiCalls || []).filter(call => call.turnId === record.turn.id)
  if (persistedTurn) {
    record.turn = { ...record.turn, ...persistedTurn }
  }
  record.apiCalls = persistedCalls.map(persisted => {
    const live = (record.apiCalls || []).find(call => call.id === persisted.id)
    return { ...live, ...persisted }
  })
  const payloadDir = path.join(matchingTrace.dir, 'payloads')
  const byId = new Map()
  for (const payload of matchingTrace.trace.payloads || []) {
    if (payload?.id && payload?.file) byId.set(payload.id, path.join(payloadDir, payload.file))
  }
  for (const call of record.apiCalls || []) {
    for (const tool of call.toolCalls || []) {
      const payloadId = tool.input?.__payload?.id
      if (!payloadId) continue
      const payloadFile = byId.get(payloadId)
      assert(payloadFile, `payload ${payloadId} is recorded for tool ${tool.name}`)
      tool.input = JSON.parse(fs.readFileSync(payloadFile, 'utf8'))
    }
  }
  return record
}

async function capture(page, name) {
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`), fullPage: true })
}

async function main() {
  assertFreshRendererBuild()
  removeDir(EVIDENCE_DIR)
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
  fs.mkdirSync(EXPORT_ROOT, { recursive: true })
  removeDir(PROFILE)
  removeDir(EXPORT_ROOT)
  const manuscript = fs.readFileSync(MANUSCRIPT_PATH, 'utf8')
  assert(manuscript.length >= 4500, `manuscript is long enough: ${manuscript.length}`)

  const evidence = {
    generatedAt: new Date().toISOString(),
    provider: {
      liveProvider: LIVE_PROVIDER,
      providerType: PROVIDER_TYPE,
      baseUrl: BASE_URL,
      model: MODEL,
      streamMode: true,
    },
    manuscriptChars: manuscript.length,
    steps: [],
    passed: true,
  }

  const electronProcess = startElectron()
  let browser = null
  const watchdog = setTimeout(() => {
    console.error(`[TIMEOUT] live verification exceeded ${GLOBAL_TIMEOUT_MS}ms`)
    process.exit(1)
  }, GLOBAL_TIMEOUT_MS)
  watchdog.unref()
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
    await page.evaluate(apiKey => { window.__shenyiLiveApiKey = apiKey }, API_KEY)
    await setupProject(page, manuscript)
    await page.evaluate(() => { delete window.__shenyiLiveApiKey })
    await openOutline(page, manuscript)

    for (const task of tasks) {
      const stepResults = []
      let step = null
      for (let attempt = 1; attempt <= 2; attempt++) {
        const before = await outlineContent(page)
        const attemptId = `${task.id}-attempt-${attempt}`
        fs.writeFileSync(path.join(EVIDENCE_DIR, `${attemptId}-before.md`), before, 'utf8')
        await waitOutlineIdle(page)
        await page.locator('#ow-chat-input').fill(task.user)
        await page.locator('#ow-chat-input').evaluate(element => element.dispatchEvent(new Event('change', { bubbles: true })))
        await page.locator('#btn-ow-send').click()
        await waitOutlineIdle(page)
        const after = await outlineContent(page)
        fs.writeFileSync(path.join(EVIDENCE_DIR, `${attemptId}-after.md`), after, 'utf8')
        await capture(page, attemptId)
        const record = await attachTurnPayloads(page, await currentTurn(page, task.user))
        assert(record, `${attemptId}: run trace records the turn`)
        step = await buildStep(task, before, after, record)
        stepResults.push(step)
        console.log(`[TRACE] ${attemptId}: run=${record?.runId || 'none'} turn=${record?.turn?.id || 'none'} calls=${record?.apiCalls?.length || 0} tools=${JSON.stringify((record?.apiCalls || []).flatMap(call => (call.toolCalls || []).map(tool => tool.name)))} writes=${step.writeCalls}`)
        if (step.contentCheck && step.changed) break
        const retryable = providerRetryable(step)
        console.log(`[${retryable ? 'RETRY' : 'FAIL'}] ${attemptId}: turn=${step.turnStatus}, writes=${step.writeCalls}, errors=${JSON.stringify(step.physicalErrors)}`)
        assert(retryable, `${attemptId}: requested content change is present`)
      }

      const record = step.record
      const writes = record
        ? (record.apiCalls || []).flatMap(call => call.toolCalls || []).filter(tool => tool.name === 'editor.write')
        : []
      if (task.id === 'live-step5-tidy') {
        assert(step.replaceDocumentCommands.length === 1, `${task.id}: editor.write uses exactly one replace_document command`)
        assert(String(step.replaceDocumentCommands[0]?.content || '').length >= 4500, `${task.id}: replace_document carries the full document`)
      }
      if (task.id === 'live-step4-move') {
        assert(step.moveCommands.length >= 1, `${task.id}: editor.write uses move operation`)
        assert(step.moveCommands.every(command => (
          String(command.target || '').includes('第15节')
          && String(command.destination || '').includes('第5节')
          && command.destinationPosition === 'before'
        )), `${task.id}: move command carries the full section target and explicit before destination`)
      }
      evidence.steps.push({ ...step, record: undefined, attempts: stepResults.map(({ record: _record, ...rest }) => rest) })
      assert(step.changed, `${task.id}: editor content changed`)
      assert(step.contentCheck, `${task.id}: requested content change is present`)
      assert(writes.length >= 1, `${task.id}: trace records editor.write`)
      assert(step.finalWriteStatus === 'success', `${task.id}: final editor.write succeeds`)
      assert(step.turnStatus === 'success', `${task.id}: turn closes successfully`)
      assert(step.apiCallStatuses.every(status => status !== 'running'), `${task.id}: API calls close`)
      console.log(`[PASS] ${task.id}: writes=${writes.length}, physical=${step.physicalCallCounts.join(',')}`)
    }

    const run = await latestRun(page)
    const exportResult = await page.evaluate(async ({ exportRoot, runId }) => {
      const store = window.__pinia?._s?.get('runTrace')
      const run = (store?.runs || []).find(item => item.id === runId)
      return await window.electronAPI.runTraceExport({
        schema: 'shenyi.run-trace',
        version: 2,
        run: store.exportRunToJson(run),
        mode: 'deep',
        payloadDirectoryHint: exportRoot,
      })
    }, { exportRoot: EXPORT_ROOT, runId: run.id })
    assert(exportResult?.success, `trace export succeeds: ${exportResult?.reason || ''}`)
    const exportedRun = JSON.parse(fs.readFileSync(path.join(exportResult.path, 'run-trace.json'), 'utf8'))
    assert(exportedRun.apiCalls.every(call => call.status !== 'running'), 'exported trace has no running API call')
    fs.copyFileSync(path.join(exportResult.path, 'run-trace.json'), path.join(EVIDENCE_DIR, 'run-trace.json'))
    evidence.exportPath = path.join(EVIDENCE_DIR, 'run-trace.json')
    evidence.exportedApiCalls = exportedRun.apiCalls.length
    await capture(page, 'final-state')
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'verification-result.json'), JSON.stringify(evidence, null, 2), 'utf8')
    console.log(`===== API DIRECT WRITE LIVE V3 PASSED (${evidence.manuscriptChars} chars) =====`)
  } finally {
    clearTimeout(watchdog)
    try { if (browser) await browser.close() } catch {}
    try { execFileSync('taskkill', ['/PID', String(electronProcess.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
    await sleep(800)
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
