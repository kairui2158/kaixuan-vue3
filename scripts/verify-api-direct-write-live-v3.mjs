import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { safeStorage } = require('electron')

const ROOT = process.cwd()
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9291
const PROFILE = path.join(ROOT, '_data', 'api-direct-write-live-v3-profile')
const EXPORT_ROOT = path.join(ROOT, '_data', 'api-direct-write-live-v3-exports')
const EVIDENCE_DIR = path.join(ROOT, '_audit', 'verification-api-direct-write-live-v3')
const PROJECT_ID = 'api-direct-write-live-v3'
const MANUSCRIPT_PATH = path.join(ROOT, '_audit', 'verification-api-direct-write-user-visible-2026-09-23', 'test-manuscript.md')

let API_KEY = process.env.SHENYI_LIVE_API_KEY
let BASE_URL = process.env.SHENYI_LIVE_BASE_URL
let MODEL = process.env.SHENYI_LIVE_MODEL || 'deepseek-v4-pro'
const LIVE_PROVIDER = String(process.env.SHENYI_LIVE_PROVIDER || 'openai').toLowerCase()
// Fixed time budgets misclassify live long-document turns as stalls. Defaults are
// disabled; the waiter below terminates on run terminal state or true inactivity.
const STEP_TIMEOUT_MS = Number(process.env.SHENYI_LIVE_STEP_TIMEOUT_MS || 0)
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_LIVE_GLOBAL_TIMEOUT_MS || 0)
const INACTIVITY_TIMEOUT_MS = Number(process.env.SHENYI_LIVE_INACTIVITY_TIMEOUT_MS || 15 * 60_000)

const CREDENTIAL_PROFILE_FALLBACKS = [
  path.join(ROOT, '_data', 'api-direct-write-live-v3-credentials'),
  path.join(ROOT, '_data', 'long-document-restructure-phase6-credentials'),
  path.join(ROOT, '_data', 'long-document-restructure-phase6-profile'),
  path.join(ROOT, '_data', 'long-document-operation-phase7-profile'),
  path.join(ROOT, '_data', 'outline-deletion-live-replay-profile'),
]

function restoreLiveCredentialsFromPreviousProfile() {
  for (const credentialProfile of CREDENTIAL_PROFILE_FALLBACKS) {
    const providerPath = path.join(credentialProfile, 'documents-data', 'wa_providers.json')
    if (!fs.existsSync(providerPath)) continue
    const stored = JSON.parse(fs.readFileSync(providerPath, 'utf8'))
    const provider = (stored?.providers || []).find(item =>
      item?.baseUrl === 'https://openapi.cloud-ai.cn/v1'
      && typeof item?.apiKey === 'string'
      && item.apiKey.startsWith('sk-'))
    if (!provider) continue
    process.env.SHENYI_LIVE_API_KEY = provider.apiKey
    process.env.SHENYI_LIVE_BASE_URL = provider.baseUrl
    const candidateModel = String(provider.selectedModel || provider.models?.[0] || '')
    if (candidateModel) process.env.SHENYI_LIVE_MODEL = candidateModel
    return
  }
}

if (!API_KEY || !BASE_URL) restoreLiveCredentialsFromPreviousProfile()
API_KEY = process.env.SHENYI_LIVE_API_KEY || API_KEY
BASE_URL = process.env.SHENYI_LIVE_BASE_URL || BASE_URL
MODEL = process.env.SHENYI_LIVE_MODEL || MODEL

if (!API_KEY || !BASE_URL) {
  console.error('Missing SHENYI_LIVE_API_KEY or SHENYI_LIVE_BASE_URL')
  process.exit(2)
}

const PROVIDER_TYPES = {
  openai: 'openai-compatible',
  anthropic: 'anthropic',
  gemini: 'gemini',
  azure: 'azure-openai',
}

const PROVIDER_TYPE = PROVIDER_TYPES[LIVE_PROVIDER]
const AZURE_DEPLOYMENT = process.env.SHENYI_LIVE_DEPLOYMENT
const AZURE_API_VERSION = process.env.SHENYI_LIVE_API_VERSION

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
    check: text => {
      const headings = [...text.matchAll(/^## 第(\d+)节\s+/gm)].map(match => Number(match[1]))
      return !/\n{3,}/.test(text)
        && headings.length >= 15
        && headings.every((number, index) => number === index + 1)
      && text.includes('这一句属于第1节，用来证明多轮直写不会误伤其他内容。')
      && text.includes('这一句属于第15节，用来证明多轮直写不会误伤其他内容。')
    },
    executionMode: 'local-transform',
  },
  {
    id: 'live-step6-reorder',
    user: '把第 8、9、10 三节按倒序重排，其他内容保持不变。',
    check: text => {
      const headings = [...text.matchAll(/^## 第(\d+)节\s+.+$/gm)]
      const sections = new Map()
      for (let index = 0; index < headings.length; index += 1) {
        const match = headings[index]
        const body = text.slice(
          match.index + match[0].length,
          index + 1 < headings.length ? headings[index + 1].index : text.length,
        )
        sections.set(Number(match[1]), body)
      }
      // Heading order alone can pass while a move has split a heading from its
      // body. Bind each affected section to its unique body marker as well.
      const sectionOrder = headings.map(match => Number(match[1]))
      const affectedOrder = [10, 9, 8]
      const affectedBodies = {
        8: ['账簿翻开第7页', '纸伞骨上的旧漆裂开一道细缝。'],
        9: ['账簿翻开第8页'],
        10: ['账簿翻开第9页'],
      }
      return headings.length === 20
        && sectionOrder.indexOf(10) < sectionOrder.indexOf(9)
        && sectionOrder.indexOf(9) < sectionOrder.indexOf(8)
        && affectedOrder.every(section => {
          const body = sections.get(section) || ''
          return body.trim().length > 0
            && affectedBodies[section].every(marker => body.includes(marker))
        })
        && !(sections.get(7) || '').includes('纸伞骨上的旧漆裂开一道细缝。')
        && [...sections.values()].every(body => body.trim().length > 0)
    },
  },
]

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function safeJsonParse(value) {
  if (typeof value !== 'string' || value.length === 0) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
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

async function outlineRunActivity(page) {
  return await page.evaluate(() => {
    const run = [...(window.__pinia?._s?.get('runTrace')?.runs || [])]
      .filter(item => item.source === 'outline')
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    if (!run) return null
    const turn = [...(run.turns || [])].sort((a, b) => b.startedAt - a.startedAt)[0]
    const calls = (run.apiCalls || [])
    const sendButton = document.querySelector('#btn-ow-send')
    return {
      runId: run.id,
      runStatus: run.status,
      turnId: turn?.id || null,
      turnStatus: turn?.status || null,
      sendDisabled: sendButton ? Boolean(sendButton.disabled) : null,
      events: (run.events || []).length,
      apiCalls: calls.map(call => ({
        status: call.status,
        physicalCalls: (call.physicalCalls || []).map(physical => physical.status),
        toolCalls: (call.toolCalls || []).length,
        streamLength: call.streamText?.length ?? 0,
        lastStreamActivityAt: call.lastStreamActivityAt ?? null,
        lastExecutionActivityAt: call.lastExecutionActivityAt ?? null,
      })),
    }
  })
}

function activitySignature(snapshot) {
  if (!snapshot) return 'no-run'
  return JSON.stringify(snapshot)
}

function runReachedTerminal(snapshot) {
  if (!snapshot) return true
  if (snapshot.turnStatus === 'running') return false
  if ((snapshot.apiCalls || []).some(call => call.status === 'running')) return false
  return snapshot.sendDisabled === false
}

async function waitOutlineIdle(page, timeout = STEP_TIMEOUT_MS) {
  const hardDeadline = timeout > 0 ? Date.now() + timeout : Number.POSITIVE_INFINITY
  let lastSignature = null
  let lastActivityAt = Date.now()
  while (Date.now() < hardDeadline) {
    let snapshot = null
    try {
      snapshot = await Promise.race([
        outlineRunActivity(page),
        sleep(5000).then(() => null),
      ])
    } catch {
      snapshot = null
    }
    const signature = activitySignature(snapshot)
    if (signature !== lastSignature) {
      lastSignature = signature
      lastActivityAt = Date.now()
    }
    if (runReachedTerminal(snapshot)) {
      await page.waitForFunction(() => Boolean(document.querySelector('#btn-ow-send') && !document.querySelector('#btn-ow-send')?.disabled), null, { timeout: 20000, polling: 250 })
      await sleep(500)
      return
    }
    if (Date.now() - lastActivityAt >= INACTIVITY_TIMEOUT_MS) {
      throw new Error(`outline run inactive for ${INACTIVITY_TIMEOUT_MS}ms: ${signature.slice(0, 2000)}`)
    }
    await sleep(1000)
  }
  throw new Error(`outline run exceeded fixed wait limit ${timeout}ms`)
}

function providerRetryable(step) {
  if (!step) return false
  if (step.contentCheck) return false
  if (step.turnStatus === 'failed' || step.turnStatus === 'canceled') {
    return (step.physicalErrors || []).some(error => (
      /502|503|504|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|network|timeout|供应商服务异常/i.test(String(error || ''))
    ))
  }
  return step.writeCalls > 0
    && step.finalWriteStatus !== 'success'
    && !step.contentCheck
    && (step.replaceDocumentCommands.length > 0 || step.reorderCommands.length > 0 || step.normalizeCommands.length > 0 || step.moveCommands.length > 0)
}

async function buildStep(task, before, after, record) {
  const writes = (record.apiCalls || []).flatMap(call => call.toolCalls || []).filter(tool => tool.name === 'editor.write')
  const step5Commands = task.id === 'live-step5-tidy'
    ? writes.flatMap(tool => Array.isArray((tool.input || {}).commands) ? tool.input.commands : [])
    : []
  const step5ReplaceCommands = step5Commands.filter(command => command?.operation === 'replace_document')
  const step5ReorderCommands = step5Commands.filter(command => command?.operation === 'reorder_sections')
  const step5NormalizeCommands = step5Commands.filter(command => ['replace_match', 'rewrite'].includes(command?.operation))
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
    reorderCommands: step5ReorderCommands,
    normalizeCommands: step5NormalizeCommands,
    writeStatuses: writes.map(tool => tool.status),
    finalWriteStatus: writes.at(-1)?.status || null,
    turnStatus: record.turn.status,
    apiCallStatuses: (record.apiCalls || []).map(call => call.status),
    physicalCallCounts: (record.apiCalls || []).map(call => (call.physicalCalls || []).length),
    physicalErrors: (record.apiCalls || []).flatMap(call => (call.physicalCalls || []).map(physical => physical.error || null)),
    contentCheck: task.check(after),
    localTransformEvents: task.executionMode === 'local-transform'
      ? (record.events || []).filter(event => event.type === 'local-transform-executed' && event.turnId === record.turn.id)
      : [],
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
      .filter(item => item.userRequest === request || String(item.userRequest || '').endsWith(`：${request}。`))
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
      events: (run.events || []).filter(event => event.turnId === turn.id).map(event => ({
        type: event.type,
        level: event.level || null,
        label: event.label || null,
        detail: event.detail || null,
        payload: event.payload || null,
      })),
    }
  }, userRequest)
}

async function attachTurnPayloads(page, record) {
  if (!record) return null
  const traceRoot = path.join(PROFILE, 'documents-data', 'run-trace', 'outline')
  let matchingTrace = null
  const tracePersistDeadline = Date.now() + 30000
  while (!matchingTrace && Date.now() < tracePersistDeadline) {
    const traceDirs = fs.existsSync(traceRoot)
      ? fs.readdirSync(traceRoot, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => path.join(traceRoot, entry.name))
        .filter(dir => fs.existsSync(path.join(dir, 'run-trace.json')))
      : []
    matchingTrace = traceDirs
      .map(dir => ({ dir, trace: JSON.parse(fs.readFileSync(path.join(dir, 'run-trace.json'), 'utf8')) }))
      .find(({ trace }) => trace.id === record.runId)
    if (!matchingTrace) await sleep(500)
  }
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
  const persistedEvents = (matchingTrace.trace.events || [])
    .filter(event => event.turnId === record.turn.id)
    .map(event => ({
      turnId: event.turnId || null,
      type: event.type,
      level: event.level || null,
      label: event.label || null,
      detail: event.detail || null,
      payload: event.payload || null,
    }))
  record.events = persistedEvents
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
  const watchdog = GLOBAL_TIMEOUT_MS > 0
    ? setTimeout(() => {
        console.error(`[TIMEOUT] live verification exceeded ${GLOBAL_TIMEOUT_MS}ms`)
        process.exit(1)
      }, GLOBAL_TIMEOUT_MS)
    : null
  if (watchdog) watchdog.unref()
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
      const maxAttempts = task.id === 'live-step5-tidy' ? 3 : 2
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const before = await outlineContent(page)
        const attemptId = `${task.id}-attempt-${attempt}`
        fs.writeFileSync(path.join(EVIDENCE_DIR, `${attemptId}-before.md`), before, 'utf8')
        await waitOutlineIdle(page)
        const instruction = attempt === 1
          ? task.user
          : `继续上一轮任务，仍然遵守原始要求：${task.user}。上一轮工具返回失败时，禁止重复同样命令；改用当前执行计划允许的受限命令完成剩余部分。`
        await page.locator('#ow-chat-input').fill(instruction)
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
      if (task.executionMode === 'local-transform') {
        const localTransformEvent = step.localTransformEvents.find(event => event.type === 'local-transform-executed')
        assert(localTransformEvent, `${task.id}: local transform is recorded in trace`)
        const payload = localTransformEvent.payload || safeJsonParse(localTransformEvent.detail)
        assert.equal(payload?.execution_mode, 'local-transform', `${task.id}: trace reports local-transform mode`)
        assert.equal(payload?.outcome, 'completed', `${task.id}: local transform completes`)
        assert.equal(payload?.validation?.ok, true, `${task.id}: local transform passes integrity validation`)
        assert.equal(record.turn.reason, 'local_transform_complete', `${task.id}: turn closes with local_transform_complete`)
        assert.equal(record.apiCalls.length, 0, `${task.id}: local transform does not call the provider`)
        assert.equal(step.replaceDocumentCommands.length, 0, `${task.id}: long-document tidy must not use replace_document`)
      } else if (task.id === 'live-step5-tidy') {
        assert.equal(step.replaceDocumentCommands.length, 0, `${task.id}: long-document tidy must not use replace_document`)
        assert(step.reorderCommands.length + step.normalizeCommands.length >= 2, `${task.id}: tidy uses structural and normalize commands`)
        assert(step.reorderCommands.every(command => Array.isArray(command?.order) && command.order.length >= 15), `${task.id}: reorder command carries the full top-level order`)
        assert(step.normalizeCommands.every(command => String(command?.target || '').length > 0), `${task.id}: normalize commands carry explicit targets`)
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
      if (task.executionMode === 'local-transform') {
        assert.equal(writes.length, 0, `${task.id}: local transform does not route through editor.write`)
        assert.equal(step.finalWriteStatus, null, `${task.id}: local transform has no tool write status`)
      } else {
        assert(writes.length >= 1, `${task.id}: trace records editor.write`)
        assert(step.finalWriteStatus === 'success', `${task.id}: final editor.write succeeds`)
      }
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
    if (watchdog) clearTimeout(watchdog)
    try { if (browser) await browser.close() } catch {}
    try { execFileSync('taskkill', ['/PID', String(electronProcess.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
    await sleep(800)
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
