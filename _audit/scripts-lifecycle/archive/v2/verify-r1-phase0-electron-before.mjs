import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const ROOT = path.resolve(process.cwd())
const SCRIPT_NAME = 'verify-r1-phase0-electron-before.mjs'
const RUN_LABEL = process.env.SHENYI_R1_RUN_LABEL || 'before'
const RUN_EPOCH = process.env.SHENYI_R1_RUN_EPOCH || new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
const BASE_EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-r1-phase0-baseline', `electron-${RUN_LABEL}-${RUN_EPOCH}`)
const CLIENT_TRACE = 'C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-outline-20261004-162304-deep/run-trace.json'
const OUTLINE_PATH = path.resolve('C:/Users/凯瑞/Desktop/测试/《绿潮》大纲总纲.md')
const ELECTRON_EXE = process.env.SHENYI_PHASE7_ELECTRON
  ? path.resolve(process.env.SHENYI_PHASE7_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_R1_CDP_PORT || 9331)
const PROFILE = path.join(ROOT, '_data', 'r1-phase0-baseline-profile')
const EXPORT_ROOT = path.join(ROOT, '_data', 'r1-phase0-baseline-exports')
const EVIDENCE_ROOT = BASE_EVIDENCE_ROOT
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const HEARTBEAT_PATH = path.join(EVIDENCE_ROOT, 'heartbeat.jsonl')
const OBSERVABILITY_PATH = path.join(EVIDENCE_ROOT, 'observability.jsonl')
const MODEL = process.env.SHENYI_LIVE_MODEL || 'deepseek-v4-pro'
const BASE_URL = process.env.SHENYI_LIVE_BASE_URL || 'https://openapi.cloud-ai.cn/v1'
let API_KEY = process.env.SHENYI_LIVE_API_KEY || ''
let pageErrors = 0
let requestFailures = 0
const STEP_TIMEOUT_MS = Number(process.env.SHENYI_R1_STEP_TIMEOUT_MS || 2 * 60 * 60_000)
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_R1_GLOBAL_TIMEOUT_MS || 8 * 60 * 60_000)
const STALLED_TIMEOUT_MS = Number(process.env.SHENYI_R1_STALLED_TIMEOUT_MS || 5 * 60_000)
const DEAD_TIMEOUT_MS = Number(process.env.SHENYI_R1_DEAD_TIMEOUT_MS || 20 * 60_000)
const HEARTBEAT_INTERVAL_MS = Number(process.env.SHENYI_R1_HEARTBEAT_INTERVAL_MS || 15_000)
const KEEP_PROFILE = process.env.SHENYI_R1_KEEP_PROFILE === '1'
const CREDENTIAL_PROFILE_FALLBACKS = [
  path.join(ROOT, '_data', 'long-document-restructure-phase6-profile'),
  path.join(ROOT, '_data', 'outline-deletion-live-replay-profile'),
  path.join(ROOT, '_data', 'long-document-operation-phase7-profile'),
]
const RETIRED_TOOLS = ['agent.spawn', 'agent.wait', 'agent.cancel']
const { safeStorage } = require('electron')

const exportedTrace = JSON.parse(fs.readFileSync(CLIENT_TRACE, 'utf8'))
const clientRun = exportedTrace.run || exportedTrace
const clientTurns = (clientRun.turns || []).map(turn => turn.userRequest).filter(Boolean)
const outlineText = fs.readFileSync(OUTLINE_PATH, 'utf8')
const PROJECT_ID = 'r1-phase0-baseline'

assert.equal(clientRun.source, 'outline', 'client trace source is outline')
assert.equal(clientRun.model, MODEL, `client trace model matches ${MODEL}`)
assert.deepEqual(
  clientTurns,
  [
    '按照Word文档的形式重构大纲，不要缩减内容。',
    '符合我的要求，分叉一允许去重。不用出预览，直接写入',
    '** 为什么会有这个符号',
  ],
  'replay turns are copied from the 2026-10-04 customer trace',
)
assert.equal(outlineText.length, 74841, 'replay document is the customer 74,841-character outline')

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
  const sourceFiles = []
  const collectSources = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) collectSources(full)
      else if (/\.(ts|vue|js|mjs|css)$/.test(entry.name)) sourceFiles.push(full)
    }
  }
  collectSources(path.join(ROOT, 'src'))
  const newestSourceMs = Math.max(...sourceFiles.map(file => fs.statSync(file).mtimeMs))
  const staleBundles = bundleNames.filter(name =>
    fs.statSync(path.join(ROOT, 'dist-renderer', name)).mtimeMs < newestSourceMs)
  assert.equal(staleBundles.length, 0, `renderer build is stale: ${staleBundles.join(', ')}`)
}

function restoreLiveCredentialsFromPreviousProfile() {
  if (API_KEY && BASE_URL) return
  for (const credentialProfile of CREDENTIAL_PROFILE_FALLBACKS) {
    const providerPath = path.join(credentialProfile, 'documents-data', 'wa_providers.json')
    if (!fs.existsSync(providerPath)) continue
    const stored = JSON.parse(fs.readFileSync(providerPath, 'utf8'))
    const provider = (stored?.providers || []).find(item =>
      item?.baseUrl
      && typeof item?.apiKey === 'string'
      && (item.apiKey.startsWith('enc:') || item.apiKey.startsWith('sk-')))
    if (!provider) continue
    const apiKey = provider.apiKey.startsWith('enc:')
      ? safeStorage.decryptString(Buffer.from(provider.apiKey.slice(4), 'base64'))
      : provider.apiKey
    if (!apiKey) continue
    API_KEY = apiKey
    if (!process.env.SHENYI_LIVE_BASE_URL) process.env.SHENYI_LIVE_BASE_URL = provider.baseUrl
    return
  }
  assert(false, 'live credentials are unavailable from SHENYI_LIVE_* env or previous encrypted profiles')
}

function startElectron() {
  const child = spawn(ELECTRON_EXE, [
    '.',
    `--remote-debugging-port=${CDP_PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${PROFILE}`,
  ], {
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
  console.log(`[VISIBLE ELECTRON] pid=${child.pid} model=${MODEL} baseUrl=${BASE_URL}`)
  child.stdout.on('data', chunk => {
    const text = `[ELECTRON] ${chunk}`
    process.stdout.write(text)
    fs.appendFileSync(RUN_LOG_PATH, text, 'utf8')
  })
  child.stderr.on('data', chunk => {
    const text = `[ELECTRON STDERR] ${chunk}`
    process.stderr.write(text)
    fs.appendFileSync(RUN_LOG_PATH, text, 'utf8')
  })
  child.on('close', (code, signal) => {
    const text = `[ELECTRON CLOSE] code=${code} signal=${signal}\n`
    process.stdout.write(text)
    fs.appendFileSync(RUN_LOG_PATH, text, 'utf8')
  })
  return child
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

function closeElectron(app) {
  if (!app || app.exitCode !== null) return
  try {
    execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {}
}

async function closeProjectModal(page) {
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
  await sleep(400)
}

async function seedApplication(page) {
  await page.evaluate(async ({ apiKey, baseUrl, model, projectId }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'r1-phase0-live-provider',
        name: 'R1 Phase0 Live Provider',
        baseUrl,
        apiKey,
        models: [model],
        selectedModel: model,
        temperature: 0.1,
        maxTokens: 0,
        contextWindowTokens: 0,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
      }],
      generateProvider: 'r1-phase0-live-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: 'R1 Phase0 Baseline',
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
    await window.electronAPI.storageWrite('wa_dAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
    await window.electronAPI.storageWrite('wa_skills', { skills: [] })
    await window.electronAPI.storageWrite('wa_pipeline_step_config', {
      agents: { 0: '' },
      skills: { 0: [] },
      modes: { 0: 'compose' },
      skillAgents: {},
    })
    await window.electronAPI.storageWrite('wa_co_creation_config', {
      agentId: '',
      skillIds: [],
      mode: 'compose',
      skillAgents: {},
    })
  }, { apiKey: API_KEY, baseUrl: BASE_URL, model: MODEL, projectId: PROJECT_ID })

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20_000 })
  await sleep(1200)
  await closeProjectModal(page)
  await page.click('#btn-outline-workspace')
  await page.waitForSelector('#outline-editor', { timeout: 20_000 })
  await page.evaluate(content => {
    window.__pinia?._s?.get('project')?.setOutline(content)
    const editor = document.querySelector('#outline-editor')
    if (editor) {
      editor.value = content
      editor.dispatchEvent(new Event('input', { bubbles: true }))
      editor.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }, outlineText)
  await page.click('#btn-ai-co-create')
  await page.waitForSelector('#ow-chat-input', { timeout: 20_000 })
}

function createStalledMonitor(page) {
  let lastSignature = null
  let lastProgressAt = Date.now()
  let lastSnapshot = null
  async function sample() {
    return page.evaluate(() => {
      const store = window.__pinia?._s?.get('runTrace')
      const run = [...(store?.runs || [])]
        .filter(item => item.source === 'outline')
        .sort((a, b) => b.startedAt - a.startedAt)[0]
      const chat = window.__pinia?._s?.get('project')?.outlineChat
      return {
        turns: (run?.turns || []).length,
        apiCalls: (run?.apiCalls || []).length,
        events: (run?.events || []).length,
        toolCalls: (run?.apiCalls || []).reduce((sum, call) => sum + (call.toolCalls || []).length, 0),
        responseChars: (run?.apiCalls || []).reduce((sum, call) => sum + (call.responseText || '').length, 0),
        assistantChars: (chat || []).filter(item => item?.role === 'assistant').at(-1)?.content?.length || 0,
        sendDisabled: Boolean(document.querySelector('#btn-ow-send')?.disabled),
        lastEventType: (run?.events || []).at(-1)?.type || null,
        currentTurnId: run?.currentTurnId || null,
        runStatus: run?.status || null,
        turnStatuses: (run?.turns || []).map(turn => turn.status),
        apiStatuses: (run?.apiCalls || []).map(call => call.status),
      }
    })
  }
  return {
    async check() {
      const snapshot = await sample()
      const signature = JSON.stringify(snapshot)
      if (signature !== lastSignature) {
        lastSignature = signature
        lastProgressAt = Date.now()
        lastSnapshot = snapshot
        return { state: 'progress', snapshot }
      }
      const quietMs = Date.now() - lastProgressAt
      if (quietMs >= DEAD_TIMEOUT_MS) return { state: 'dead', quietMs, snapshot }
      if (quietMs >= STALLED_TIMEOUT_MS) return { state: 'stalled', quietMs, snapshot }
      return { state: 'quiet', quietMs, snapshot }
    },
    current() {
      return { quietMs: Date.now() - lastProgressAt, snapshot: lastSnapshot }
    },
  }
}

async function captureStalledEvidence(page, status) {
  const lastEvents = await page.evaluate(() => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])]
      .filter(item => item.source === 'outline')
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    return (run?.events || []).slice(-20).map(event => ({
      type: event.type,
      turnId: event.turnId || null,
      label: event.label || null,
    }))
  }).catch(() => [])
  return { status, lastEvents }
}

async function waitIdle(page, timeout = STEP_TIMEOUT_MS) {
  await page.waitForFunction(() => {
    const button = document.querySelector('#btn-ow-send')
    return Boolean(button && !button.disabled)
  }, { timeout, polling: 500 })
  await sleep(500)
}

async function waitForTurnTerminal(page, monitor, expectedUsers, deadline) {
  while (Date.now() < deadline) {
    const stall = await monitor.check()
    if (stall.state === 'dead') {
      throw Object.assign(
        new Error(`turn is dead after ${Math.round(stall.quietMs / 1000)}s: ${JSON.stringify(await captureStalledEvidence(page, stall))}`),
        { baselineFinding: 'dead_turn' },
      )
    }
    if (stall.state === 'stalled') {
      console.warn(`[STALL WARN] no progress for ${Math.round(stall.quietMs / 1000)}s`)
    }
    const done = await page.evaluate(expected => {
      const store = window.__pinia?._s?.get('runTrace')
      const run = [...(store?.runs || [])]
        .filter(item => item.source === 'outline')
        .sort((a, b) => b.startedAt - a.startedAt)[0]
      if (!run || (run.turns || []).length < expected) return false
      const turn = run.turns[expected - 1]
      if (!turn || turn.status === 'running') return false
      const calls = (run.apiCalls || []).filter(call => call.turnId === turn.id)
      return calls.length > 0 && calls.every(call => call.status !== 'running')
    }, expectedUsers)
    if (done) return
    await sleep(500)
  }
  throw Object.assign(
    new Error(`turn did not reach terminal state within ${STEP_TIMEOUT_MS}ms`),
    { baselineFinding: 'turn_timeout' },
  )
}

function currentContent(page) {
  return page.evaluate(() => window.__pinia?._s?.get('project')?.outlineText || '')
}

async function runTurn(page, request, turnIndex) {
  await waitIdle(page)
  const before = await currentContent(page)
  const userCountBefore = await page.evaluate(() =>
    (window.__pinia?._s?.get('project')?.outlineChat || [])
      .filter(item => item?.role === 'user').length)
  const startedAt = Date.now()

  await page.locator('#ow-chat-input').fill(request)
  await page.locator('#ow-chat-input').evaluate(element =>
    element.dispatchEvent(new Event('change', { bubbles: true })))
  await page.locator('#btn-ow-send').click()

  const monitor = createStalledMonitor(page)
  const deadline = startedAt + STEP_TIMEOUT_MS
  await page.waitForFunction(expected => {
    const chat = window.__pinia?._s?.get('project')?.outlineChat
    return (chat || []).filter(item => item?.role === 'user').length >= expected
  }, userCountBefore + 1, { timeout: 30_000, polling: 250 })
  await waitForTurnTerminal(page, monitor, userCountBefore + 1, deadline)
  await waitIdle(page)

  const after = await currentContent(page)
  const result = await page.evaluate(({ expectedUsers, request, turnIndex, startedAtMs, endedAtMs }) => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])]
      .filter(item => item.source === 'outline')
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    const turn = run?.turns?.[expectedUsers - 1] || null
    const calls = (run?.apiCalls || []).filter(call => call.turnId === turn?.id)
    const physical = calls.flatMap(call => call.physicalCalls || [])
    const chat = window.__pinia?._s?.get('project')?.outlineChat
    const events = (run?.events || []).filter(event => event.turnId === turn?.id)
    return {
      request,
      turnIndex,
      startedAtMs,
      endedAtMs,
      durationMs: endedAtMs - startedAtMs,
      runId: run?.id || null,
      runStatus: run?.status || null,
      turnId: turn?.id || null,
      turnStatus: turn?.status || null,
      turnReason: turn?.reason || null,
      intent: turn?.intent || null,
      actualToolSurface: (turn?.actualToolSurface || []).map(tool => tool.name),
      apiCalls: calls.map(call => ({
        id: call.id,
        status: call.status,
        responseChars: (call.responseText || '').length,
        toolCallCount: (call.toolCalls || []).length,
      })),
      physicalCalls: physical.map(call => ({
        seq: call.seq,
        status: call.status,
        error: call.error || null,
        inputTokens: call.inputTokens ?? null,
        outputTokens: call.outputTokens ?? null,
        durationMs: call.durationMs ?? null,
        finishReason: call.finishReason || null,
      })),
      toolCalls: calls.flatMap(call => (call.toolCalls || []).map(tool => ({
        name: tool.name,
        status: tool.status,
        errorCode: tool.errorCode || null,
      }))),
      longDocumentEvents: events
        .filter(event => [
          'long-document-policy',
          'context-budget-decision',
          'execution-mode-selected',
          'edit-task-batch-planned',
          'edit-task-batch-applied',
          'edit-task-batch-failed',
          'edit-task-batch-succeeded',
          'edit-task-task-finished',
          'edit-task-task-failed',
          'final-draft-mode-selected',
          'final-draft-task-failed',
          'write-coverage-insufficient',
        ].includes(event.type))
        .map(event => ({ type: event.type, detail: parseDetail(event.detail) })),
      eventCount: events.length,
      lastEventTypes: events.slice(-20).map(event => event.type),
      assistantReply: (chat || [])
        .filter(item => item?.role === 'assistant')
        .at(-1)?.content || '',
    }
    function parseDetail(value) {
      try { return JSON.parse(value) } catch { return value }
    }
  }, {
    expectedUsers: userCountBefore + 1,
    request,
    turnIndex,
    startedAtMs: startedAt,
    endedAtMs: Date.now(),
  })

  await page.screenshot({
    path: path.join(EVIDENCE_ROOT, `turn-${turnIndex + 1}-state.png`),
    fullPage: false,
  })
  return { before, after, ...result }
}

function startHeartbeat(page, electronPid) {
  let stopped = false
  const timer = setInterval(async () => {
    if (stopped) return
    try {
      const state = await page.evaluate(() => {
        const store = window.__pinia?._s?.get('runTrace')
        const run = [...(store?.runs || [])]
          .filter(item => item.source === 'outline')
          .sort((a, b) => b.startedAt - a.startedAt)[0]
        const chat = window.__pinia?._s?.get('project')?.outlineChat
        return {
          at: new Date().toISOString(),
          runId: run?.id || null,
          runStatus: run?.status || null,
          turns: (run?.turns || []).length,
          apiCalls: (run?.apiCalls || []).length,
          runningCalls: (run?.apiCalls || []).filter(call => call.status === 'running').length,
          events: (run?.events || []).length,
          toolCalls: (run?.apiCalls || []).reduce((sum, call) => sum + (call.toolCalls || []).length, 0),
          lastEventType: (run?.events || []).at(-1)?.type || null,
          lastAssistantChars: (chat || []).filter(item => item?.role === 'assistant').at(-1)?.content?.length || 0,
          sendDisabled: Boolean(document.querySelector('#btn-ow-send')?.disabled),
        }
      })
      state.electronPid = electronPid
      fs.appendFileSync(HEARTBEAT_PATH, `${JSON.stringify(state)}\n`, 'utf8')
    } catch (error) {
      fs.appendFileSync(HEARTBEAT_PATH, `${JSON.stringify({
        at: new Date().toISOString(),
        heartbeatError: String(error?.message || error),
      })}\n`, 'utf8')
    }
  }, HEARTBEAT_INTERVAL_MS)
  return {
    stop() {
      stopped = true
      clearInterval(timer)
    },
  }
}

async function captureRunBindingSnapshot(page) {
  return page.evaluate(() => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])]
      .filter(item => item.source === 'outline')
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    return {
      runId: run?.id || null,
      runStatus: run?.status || null,
      currentTurnId: run?.currentTurnId || null,
      turns: (run?.turns || []).map(turn => ({
        id: turn.id,
        seq: turn.seq,
        status: turn.status,
        reason: turn.reason || null,
        startedAt: turn.startedAt,
        endedAt: turn.endedAt || null,
      })),
      apiCalls: (run?.apiCalls || []).map(call => ({
        id: call.id,
        seq: call.seq,
        turnId: call.turnId || null,
        status: call.status,
        responseChars: (call.responseText || '').length,
        toolCallCount: (call.toolCalls || []).length,
        physicalCallCount: (call.physicalCalls || []).length,
      })),
      eventCount: (run?.events || []).length,
      lastEventTypes: (run?.events || []).slice(-40).map(event => event.type),
    }
  }).catch(error => ({ captureError: String(error?.message || error) }))
}

function copyPersistedRunTrace() {
  const sourceDir = path.join(PROFILE, 'documents-data', 'run-trace', 'outline')
  if (!fs.existsSync(sourceDir)) return null
  const copied = []
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const runTracePath = path.join(sourceDir, entry.name, 'run-trace.json')
    if (!fs.existsSync(runTracePath)) continue
    const targetDir = path.join(EVIDENCE_ROOT, 'run-trace', entry.name)
    fs.mkdirSync(targetDir, { recursive: true })
    fs.copyFileSync(runTracePath, path.join(targetDir, 'run-trace.json'))
    const payloadDir = path.join(sourceDir, entry.name, 'payloads')
    if (fs.existsSync(payloadDir)) {
      fs.cpSync(payloadDir, path.join(targetDir, 'payloads'), { recursive: true })
    }
    copied.push(entry.name)
  }
  return copied
}

function summarize(turns, runBinding, outcome, error) {
  const allTools = turns.flatMap(turn => turn.toolCalls || [])
  const allPhysical = turns.flatMap(turn => turn.physicalCalls || [])
  return {
    outcome,
    error: error ? String(error?.message || error) : null,
    baselineFinding: error?.baselineFinding || null,
    runBinding,
    sourceOutlineChars: outlineText.length,
    turns: turns.map(turn => ({
      request: turn.request,
      turnStatus: turn.turnStatus,
      intent: turn.intent,
      durationMs: turn.durationMs,
      physicalCallCount: (turn.physicalCalls || []).length,
      toolCallCount: (turn.toolCalls || []).length,
      responseChars: (turn.apiCalls || []).reduce((sum, call) => sum + call.responseChars, 0),
      contentChanged: turn.before !== turn.after,
      actualToolSurface: turn.actualToolSurface,
    })),
    totals: {
      completedTurns: turns.length,
      physicalCalls: allPhysical.length,
      physicalSuccesses: allPhysical.filter(call => call.status === 'success').length,
      inputTokens: allPhysical.reduce((sum, call) => sum + (call.inputTokens || 0), 0),
      outputTokens: allPhysical.reduce((sum, call) => sum + (call.outputTokens || 0), 0),
      toolCalls: allTools.length,
      toolSuccesses: allTools.filter(call => call.status === 'success').length,
      toolFailures: allTools.filter(call => call.status !== 'success'),
      retiredToolsPresent: [...new Set(turns.flatMap(turn => turn.actualToolSurface || []))]
        .filter(name => RETIRED_TOOLS.includes(name)),
    },
  }
}

function appendObservability(record) {
  try {
    fs.appendFileSync(OBSERVABILITY_PATH, `${JSON.stringify(record)}\n`, 'utf8')
  } catch {}
}

function maskErrorText(text) {
  return String(text || '')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '***MASKED***')
    .replace(/(Authorization\s*[:=]\s*Bearer\s+)[^\s"'，。]+/gi, '$1***MASKED***')
}

async function exportRunTraces(page, runId) {
  if (!page || !runId) return null
  return page.evaluate(async ({ exportRoot, wantedRunId }) => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])].find(item => item.id === wantedRunId)
    if (!run) return null
    const exported = await window.electronAPI.runTraceExport({
      schema: 'shenyi.run-trace',
      version: 2,
      run: store.exportRunToJson(run),
      mode: 'deep',
      payloadDirectoryHint: exportRoot,
    })
    return {
      success: Boolean(exported?.success),
      path: exported?.path || null,
      reason: exported?.reason || null,
    }
  }, { exportRoot: EXPORT_ROOT, wantedRunId: runId }).catch(error => ({
    success: false,
    path: null,
    reason: String(error?.message || error),
  }))
}

async function main() {
  assertFreshRendererBuild()
  removeDir(PROFILE)
  removeDir(EXPORT_ROOT)
  removeDir(EVIDENCE_ROOT)
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  restoreLiveCredentialsFromPreviousProfile()

  const report = {
    schema: `shenyi.r1.phase0.electron-${RUN_LABEL}`,
    version: 1,
    generatedAt: new Date().toISOString(),
    script: SCRIPT_NAME,
    model: MODEL,
    baseUrl: BASE_URL,
    sourceTrace: CLIENT_TRACE,
    sourceOutlineChars: outlineText.length,
    clientTurns,
    turns: [],
    outcome: null,
  }

  const watchdog = setTimeout(() => {
    console.error(`[FAIL] global timeout after ${GLOBAL_TIMEOUT_MS}ms`)
    process.exit(1)
  }, GLOBAL_TIMEOUT_MS)
  const electronProcess = startElectron()
  let browser = null
  let heartbeat = null
  let finalError = null
  try {
    assert(await waitForCdp(), 'CDP reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    let page = null
    for (let attempt = 0; attempt < 24 && !page; attempt++) {
      page = browser.contexts()[0]?.pages()?.find(item => !item.url().startsWith('devtools://')) || null
      if (!page) await sleep(500)
    }
    assert(page, 'renderer page reachable')
    page.on('pageerror', error => {
      pageErrors += 1
      appendObservability({
        kind: 'page-error',
        at: new Date().toISOString(),
        message: maskErrorText(error.message),
        stack: maskErrorText(error.stack || ''),
      })
      console.error(`[PAGE ERROR] ${error.message}`)
    })
    page.on('crash', () => {
      pageErrors += 1
      appendObservability({ kind: 'page-crash', at: new Date().toISOString() })
      console.error('[PAGE CRASH] renderer process crashed')
    })
    page.on('close', () => fs.appendFileSync(RUN_LOG_PATH, '[PAGE CLOSE] renderer page closed\n', 'utf8'))
    browser.on('disconnected', () => fs.appendFileSync(RUN_LOG_PATH, '[BROWSER DISCONNECTED] CDP connection lost\n', 'utf8'))
    page.on('console', message => {
      if (message.type() !== 'error') return
      pageErrors += 1
      appendObservability({
        kind: 'console-error',
        at: new Date().toISOString(),
        text: maskErrorText(String(message.text()).slice(0, 4000)),
      })
      console.error(`[PAGE ERROR] ${String(message.text()).slice(0, 600)}`)
    })
    page.on('requestfailed', request => {
      requestFailures += 1
      appendObservability({
        kind: 'request-failed',
        at: new Date().toISOString(),
        url: request.url(),
        method: request.method(),
        failure: maskErrorText(request.failure()?.errorText || ''),
      })
    })
    await page.waitForSelector('#app', { timeout: 20_000 })
    await sleep(1500)

    await seedApplication(page)
    heartbeat = startHeartbeat(page, electronProcess.pid)
    for (const [turnIndex, request] of clientTurns.entries()) {
      console.log(`[TURN START] ${turnIndex + 1}/${clientTurns.length}: ${request}`)
      const turn = await runTurn(page, request, turnIndex)
      report.turns.push(turn)
      console.log(`[TURN END] status=${turn.turnStatus} physical=${turn.physicalCalls.length} tools=${turn.toolCalls.length} durationMs=${turn.durationMs}`)
    }
    report.outcome = 'completed'
  } catch (error) {
    finalError = error
    report.outcome = error?.baselineFinding || 'operation_failed'
    console.error('[BASELINE FAILURE]', error)
  } finally {
    heartbeat?.stop()
    clearTimeout(watchdog)
    let page = null
    try {
      page = browser?.contexts?.()[0]?.pages?.().find(item => !item.url().startsWith('devtools://')) || null
    } catch {}
    let runBinding = null
    let runTraceExport = null
    if (page) {
      runBinding = await captureRunBindingSnapshot(page)
      runTraceExport = await exportRunTraces(page, runBinding?.runId || null)
      try {
        await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'final-state.png'), fullPage: false })
      } catch {}
    }
    const copiedRuns = copyPersistedRunTrace()
    const summary = summarize(report.turns, runBinding, report.outcome, finalError)
    summary.copiedRunTraces = copiedRuns
    summary.runTraceExport = runTraceExport
    summary.observability = {
      logPath: OBSERVABILITY_PATH,
      pageErrors,
      requestFailures,
    }
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8')
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'turns.json'), JSON.stringify(report, null, 2), 'utf8')
    try { if (browser) await browser.close() } catch {}
    closeElectron(electronProcess)
    await sleep(800)
    if (!KEEP_PROFILE) await removeDir(PROFILE)
  }

  console.log('[SUMMARY]')
  console.log(JSON.stringify({
    outcome: report.outcome,
    completedTurns: report.turns.length,
    physicalCalls: report.turns.flatMap(turn => turn.physicalCalls || []).length,
    toolCalls: report.turns.flatMap(turn => turn.toolCalls || []).length,
  }, null, 2))
  if (finalError) process.exitCode = 1
}

main().catch(error => {
  console.error('[FAIL]', error)
  process.exitCode = 1
})
