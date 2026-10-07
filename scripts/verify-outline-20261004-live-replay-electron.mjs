import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const ROOT = process.cwd()
const TRACE_ROOT = path.resolve(process.env.SHENYI_TRACE_ROOT
  || 'C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-outline-20261004-075619-deep')
const OUTLINE_PATH = path.resolve(process.env.SHENYI_OUTLINE_PATH
  || path.join(ROOT, '_data', 'outline-20261004-replay-source.md'))
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9394
const REPLAY_ID = process.env.SHENYI_REPLAY_ID || '20261004'
const EXPORT_ROOT = path.join(ROOT, '_data', `outline-${REPLAY_ID}-live-replay-exports`)
const EVIDENCE_DIR = path.join(ROOT, '_audit', `verification-outline-${REPLAY_ID}-live-replay`)
const PROFILE = path.join(ROOT, '_data', `outline-${REPLAY_ID}-live-replay-profile`)
const PROJECT_ID = process.env.SHENYI_REPLAY_PROJECT_ID || 'outline-20261004-live-replay'
const API_KEY = process.env.SHENYI_LIVE_API_KEY
const BASE_URL = process.env.SHENYI_LIVE_BASE_URL || 'https://openapi.cloud-ai.cn/v1'
const MODEL = process.env.SHENYI_LIVE_MODEL || 'deepseek-v4-pro'
const STEP_TIMEOUT_MS = Number(process.env.SHENYI_LIVE_STEP_TIMEOUT_MS || 60 * 60_000)
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_LIVE_GLOBAL_TIMEOUT_MS || 12 * 60 * 60_000)
const STALLED_TIMEOUT_MS = Number(process.env.SHENYI_LIVE_STALLED_TIMEOUT_MS || 5 * 60_000)
const DEAD_TIMEOUT_MS = Number(process.env.SHENYI_LIVE_DEAD_TIMEOUT_MS || 15 * 60_000)
const KEEP_PROFILE = process.env.SHENYI_LIVE_KEEP_PROFILE === '1'

const clientTrace = JSON.parse(fs.readFileSync(path.join(TRACE_ROOT, 'run-trace.json'), 'utf8'))
const clientOutline = fs.readFileSync(OUTLINE_PATH, 'utf8')
const clientTurns = clientTrace.turns.map(turn => ({
  id: turn.id,
  user: turn.userRequest,
  intent: turn.intent,
  reason: turn.reason,
}))
assert.equal(clientTrace.source, 'outline', 'client trace source is outline')
assert.equal(clientTrace.model, MODEL, `client trace model matches ${MODEL}`)
const EXPECTED_TURN_COUNT = Number(process.env.SHENYI_REPLAY_TURN_COUNT || 6)
assert.equal(clientTurns.length, EXPECTED_TURN_COUNT, `client live replay covers all ${EXPECTED_TURN_COUNT} turns`)
assert.equal(clientOutline.length, 74841, 'live replay uses the customer 74,841-character outline')
const CREDENTIAL_PROFILE_FALLBACKS = [
  path.join(ROOT, '_data', 'long-document-restructure-phase6-credentials'),
  path.join(ROOT, '_data', 'long-document-restructure-phase6-profile'),
  path.join(ROOT, '_data', 'outline-deletion-live-replay-profile'),
]

function restoreLiveCredentialsFromPreviousProfile() {
  if (API_KEY) return
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
      ? require('electron').safeStorage.decryptString(Buffer.from(provider.apiKey.slice(4), 'base64'))
      : provider.apiKey
    if (!apiKey) continue
    process.env.SHENYI_LIVE_API_KEY = apiKey
    if (!process.env.SHENYI_LIVE_BASE_URL) process.env.SHENYI_LIVE_BASE_URL = provider.baseUrl
    return
  }
  assert(false, 'live credentials are not available from SHENYI_LIVE_* env vars or previous encrypted profiles')
}

restoreLiveCredentialsFromPreviousProfile()
assert(process.env.SHENYI_LIVE_API_KEY && process.env.SHENYI_LIVE_API_KEY.length >= 20,
  'SHENYI_LIVE_API_KEY is required')

function countVisibleResponseText(calls) {
  return calls.reduce((sum, call) => sum + countResponseFromApiCall(call), 0)
}

function countResponseFromApiCall(call) {
  const physicalResponseChars = (call.physicalCalls || []).reduce((sum, physical) =>
    sum + Math.max((physical.responseText || '').length, (physical.streamText || '').length), 0)
  return Math.max(
    (call.responseText || '').length,
    (call.responseTextPreview || '').length,
    (call.streamText || '').length,
    physicalResponseChars,
  )
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
  const staleBundles = bundleNames.filter(name => fs.statSync(path.join(ROOT, 'dist-renderer', name)).mtimeMs < newestSourceMs)
  assert.equal(staleBundles.length, 0, `renderer build is stale; rebuild with npm run build:vue. Stale bundles: ${staleBundles.join(', ')}`)
}

function startElectron() {
  const child = spawn(ELECTRON_EXE, ['.', `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', `--user-data-dir=${PROFILE}`], {
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
  child.stdout.on('data', chunk => process.stdout.write(`[ELECTRON] ${chunk}`))
  child.stderr.on('data', chunk => process.stderr.write(`[ELECTRON STDERR] ${chunk}`))
  return child
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

async function closeProjectModal(page) {
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
  await sleep(400)
}

async function seedProject(page) {
  await page.evaluate(async ({ baseUrl, model, apiKey, projectId, replayId }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: `outline-${replayId}-live-provider`,
        name: `Outline ${replayId} Live`,
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
      generateProvider: `outline-${replayId}-live-provider`,
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: `Outline ${replayId} Live Replay`,
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
    await window.electronAPI.storageWrite('wa_pipeline_step_config', { agents: { 0: '' }, skills: { 0: [] }, modes: { 0: 'compose' }, skillAgents: {} })
    await window.electronAPI.storageWrite('wa_co_creation_config', { agentId: '', skillIds: [], mode: 'compose', skillAgents: {} })
  }, { baseUrl: BASE_URL, model: MODEL, apiKey: API_KEY, projectId: PROJECT_ID, replayId: REPLAY_ID })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20000 })
  await sleep(1200)
  await closeProjectModal(page)
}

async function importOutline(page) {
  await page.click('#btn-outline-workspace')
  await page.waitForSelector('#outline-editor', { timeout: 15000 })
  assert.equal(await outlineContent(page), '', 'live replay starts with an empty outline')
  await page.click('#btn-import-outline')
  await page.locator('#outline-workspace input[type="file"][accept=".txt,.md,.text,.rtf,.docx"]').first()
    .setInputFiles(OUTLINE_PATH)
  await page.waitForFunction(expected => {
    const text = window.__pinia?._s?.get('project')?.outlineText || ''
    return text.length === expected
  }, clientOutline.length, { timeout: 30000, polling: 250 })
  await sleep(500)
  console.log(`[PASS] real outline imported: ${clientOutline.length} chars`)
}

async function outlineContent(page) {
  return page.evaluate(() => window.__pinia?._s?.get('project')?.outlineText || '')
}

async function waitOutlineIdle(page, timeout = STEP_TIMEOUT_MS) {
  await page.waitForFunction(() => Boolean(document.querySelector('#btn-ow-send') && !document.querySelector('#btn-ow-send')?.disabled), null, { timeout, polling: 500 })
  await sleep(500)
}

async function sampleProgress(page, expectedUserCount) {
  return page.evaluate(expected => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])]
      .filter(item => item.source === 'outline')
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    const chat = window.__pinia?._s?.get('project')?.outlineChat || []
    const target = (run?.turns || [])[expected - 1]
    const calls = (run?.apiCalls || []).filter(call => call.turnId === target?.id)
    return {
      turnStatus: target?.status || null,
      apiCalls: calls.length,
      toolCalls: calls.reduce((sum, call) => sum + (call.toolCalls || []).length, 0),
      responseChars: calls.reduce((sum, call) => {
        const physicalResponseChars = (call.physicalCalls || []).reduce((physicalSum, physical) =>
          physicalSum + Math.max((physical.responseText || '').length, (physical.streamText || '').length), 0)
        return sum + Math.max(
          (call.responseText || '').length,
          (call.responseTextPreview || '').length,
          (call.streamText || '').length,
          physicalResponseChars,
        )
      }, 0),
      physicalCalls: calls.reduce((sum, call) => sum + (call.physicalCalls || []).length, 0),
      events: (run?.events || []).length,
      assistantChars: chat.filter(item => item?.role === 'assistant').at(-1)?.content?.length || 0,
      lastEventType: (run?.events || []).at(-1)?.type || null,
    }
  }, expectedUserCount)
}

async function waitForTurn(page, expectedUserCount, request) {
  let lastSignature = null
  let lastProgressAt = Date.now()
  const deadline = Date.now() + STEP_TIMEOUT_MS
  while (Date.now() < deadline) {
    const snapshot = await sampleProgress(page, expectedUserCount)
    const signature = JSON.stringify(snapshot)
    if (signature !== lastSignature) {
      lastSignature = signature
      lastProgressAt = Date.now()
      console.log(`[PROGRESS] ${JSON.stringify(snapshot)}`)
    }
    const quietMs = Date.now() - lastProgressAt
    assert(quietMs < DEAD_TIMEOUT_MS, `turn ${expectedUserCount} appears dead: ${quietMs}ms without progress: ${signature}`)
    assert(quietMs < STALLED_TIMEOUT_MS || snapshot.turnStatus !== 'running' || snapshot.responseChars > 0, `turn ${expectedUserCount} stalled: ${signature}`)
    if (snapshot.turnStatus && snapshot.turnStatus !== 'running' && snapshot.apiCalls > 0) break
    await sleep(1000)
  }
  await page.waitForFunction(({ count, req }) => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])]
      .filter(item => item.source === 'outline')
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    const target = (run?.turns || [])[count - 1]
    if (!target || target.userRequest !== req || target.status === 'running') return false
    const calls = (run?.apiCalls || []).filter(call => call.turnId === target.id)
    return calls.length > 0 && calls.every(call => call.status !== 'running')
  }, { count: expectedUserCount, req: request }, { timeout: STEP_TIMEOUT_MS, polling: 500 })
  await waitOutlineIdle(page)
}

async function sendTurn(page, turn, index) {
  const before = await outlineContent(page)
  await waitOutlineIdle(page)
  const userCount = await page.evaluate(() =>
    (window.__pinia?._s?.get('project')?.outlineChat || []).filter(item => item?.role === 'user').length
  )
  await page.locator('#ow-chat-input').fill(turn.user)
  await page.locator('#ow-chat-input').evaluate(element => element.dispatchEvent(new Event('change', { bubbles: true })))
  await page.locator('#btn-ow-send').click()
  await page.waitForFunction(expectedCount => {
    const chat = window.__pinia?._s?.get('project')?.outlineChat || []
    return chat.filter(item => item?.role === 'user').length >= expectedCount
  }, userCount + 1, { timeout: STEP_TIMEOUT_MS, polling: 500 })
  await waitForTurn(page, userCount + 1, turn.user)
  const details = await page.evaluate(({ count }) => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])]
      .filter(item => item.source === 'outline')
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    const target = (run?.turns || [])[count - 1]
    const calls = (run?.apiCalls || []).filter(call => call.turnId === target?.id)
    const turnEvents = (run?.events || []).filter(event => event.turnId === target?.id)
    let executionOperation = null
    const policyEvent = turnEvents.find(event => event.type === 'long-document-policy')
    if (policyEvent) {
      try {
        executionOperation = JSON.parse(String(policyEvent.detail || '{}')).operation || null
      } catch {}
    }
    const chat = window.__pinia?._s?.get('project')?.outlineChat || []
    return {
      turnStatus: target?.status || null,
      reason: target?.reason || null,
      intent: target?.intent || null,
      executionOperation,
      actualToolSurface: target?.actualToolSurface || [],
      editTaskBatchesSucceeded: turnEvents.filter(event => event.type === 'edit-task-batch-succeeded').length,
      editTaskCompletionVerified: turnEvents.some(event => event.type === 'edit-task-completion-verified'),
      assistantReply: (chat.filter(item => item.role === 'assistant').at(-1)?.content || '').slice(0, 1000),
      apiCalls: calls.map(call => ({
        status: call.status,
        responseChars: Math.max(
          (call.responseText || '').length,
          (call.responseTextPreview || '').length,
          (call.streamText || '').length,
          (call.physicalCalls || []).reduce((sum, physical) =>
            sum + Math.max((physical.responseText || '').length, (physical.streamText || '').length), 0),
        ),
        responsePreview: (call.responseText || call.responseTextPreview || call.streamText || '').slice(0, 300),
        physicalResponseChars: (call.physicalCalls || []).reduce((sum, physical) =>
          sum + Math.max((physical.responseText || '').length, (physical.streamText || '').length), 0),
      })),
      toolCalls: calls.flatMap(call => (call.toolCalls || []).map(tool => ({
        name: tool.name,
        status: tool.status,
        errorCode: tool.errorCode || null,
      }))),
    }
  }, { count: userCount + 1 })
  const after = await outlineContent(page)
  console.log(`[LIVE TURN ${index}/${clientTurns.length}] ${JSON.stringify({ ...details, contentBefore: before.length, contentAfter: after.length })}`)
  assert.equal(details.turnStatus, 'success', `turn ${index} closes successfully`)
  assert(details.apiCalls.length > 0, `turn ${index} records API calls`)
  const summaryFailureIsAllowed = details.reason === 'edit_task_written_summary_failed'
  assert(
    details.apiCalls.every(call => call.status === 'success' || (summaryFailureIsAllowed && call.status === 'failed')),
    `turn ${index} API calls close successfully unless only the post-write summary failed`,
  )
  assert(details.apiCalls.some(call => call.responseChars > 0), `turn ${index} exposes the model response in trace`)
  assert(details.assistantReply.trim().length > 0, `turn ${index} leaves a visible assistant reply`)
  assert(!details.toolCalls.some(tool => tool.errorCode === 'operation_not_allowed_by_execution_plan'), `turn ${index} must not reject editor.write by execution plan`)
  assert(!/(?:没有|无法|不能|没).{0,8}写入权限|写入权限.{0,8}(?:不存在|已关闭|没有)/.test(details.assistantReply), `turn ${index} must not claim missing write permission`)
  const successfulWrites = details.toolCalls.filter(tool => tool.name === 'editor.write' && tool.status === 'success').length
  if (turn.intent === 'edit') {
    assert.equal(details.intent, 'edit', `turn ${index} keeps the client edit intent`)
    assert(details.executionOperation && details.executionOperation !== 'discussion', `turn ${index} records a writable execution operation`)
    if (index === 2) {
      assert.equal(details.executionOperation, 'restructure_and_cleanup', 'turn 2 continues the compound task as restructure_and_cleanup')
    }
    assert(
      details.actualToolSurface.some(tool => tool.name === 'editor.write'),
      `turn ${index} exposes editor.write on the actual tool surface`,
    )
    assert(
      ['write_task_complete', 'edit_task_written_summary_failed'].includes(details.reason),
      `turn ${index} completes through a write-task terminal, not plain dialogue: ${details.reason}`,
    )
    assert(
      successfulWrites > 0 || details.editTaskBatchesSucceeded > 0,
      `turn ${index} proves completion with editor.write or EditTask batches`,
    )
    assert(
      after !== before || details.editTaskCompletionVerified,
      `turn ${index} changes the editor or passes EditTask completion verification`,
    )
  } else {
    assert.equal(details.intent, 'discuss', `turn ${index} keeps the client discuss intent`)
    assert.equal(details.reason, 'plain_dialogue_complete', `turn ${index} completes as plain dialogue`)
    assert(
      !details.actualToolSurface.some(tool => tool.name === 'editor.write'),
      `turn ${index} remains read-only for discussion`,
    )
    assert.equal(successfulWrites, 0, `turn ${index} must not write during discussion`)
  }
  return {
    index,
    turnId: clientTurns[index - 1]?.id || null,
    before,
    after,
    ...details,
  }
}

async function capture(page, name) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`), fullPage: true })
  console.log(`[PASS] screenshot saved: ${name}.png`)
}

async function latestRun(page) {
  return page.evaluate(() => {
    const run = [...(window.__pinia?._s?.get('runTrace')?.runs || [])]
      .filter(item => item.source === 'outline')
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    return run ? { id: run.id, status: run.status } : null
  })
}

async function main() {
  assertFreshRendererBuild()
  removeDir(PROFILE)
  removeDir(EXPORT_ROOT)
  removeDir(EVIDENCE_DIR)
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })

  const watchdog = setTimeout(() => {
    console.error(`[FAIL] global timeout after ${GLOBAL_TIMEOUT_MS}ms`)
    process.exit(1)
  }, GLOBAL_TIMEOUT_MS)

  const electronProcess = startElectron()
  let browser = null
  const evidence = {
    schema: `shenyi.outline-${REPLAY_ID}.live-replay.electron`,
    version: 1,
    generatedAt: new Date().toISOString(),
    model: MODEL,
    baseUrl: BASE_URL,
    electronPid: electronProcess.pid,
    outlineChars: clientOutline.length,
    turns: [],
  }
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
    page.on('crash', () => console.error('[PAGE CRASH] renderer process crashed'))
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1500)
    await seedProject(page)
    await importOutline(page)
    await page.click('#btn-ai-co-create')
    await page.waitForSelector('#ow-chat-input', { timeout: 15000 })

    let previousAfter = clientOutline
    let index = 0
    for (const turn of clientTurns) {
      index += 1
      const result = await sendTurn(page, turn, index)
      evidence.turns.push({
        index,
        turnId: result.turnId,
        user: turn.user,
        clientIntent: turn.intent,
        currentIntent: result.intent,
        executionOperation: result.executionOperation,
        turnStatus: result.turnStatus,
        reason: result.reason,
        responseChars: result.apiCalls.reduce((sum, call) => sum + call.responseChars, 0),
        toolCallSummary: result.toolCalls.map(tool => `${tool.name}:${tool.status}${tool.errorCode ? `/${tool.errorCode}` : ''}`),
        editTaskBatchesSucceeded: result.editTaskBatchesSucceeded,
        editTaskCompletionVerified: result.editTaskCompletionVerified,
        contentBefore: result.before.length,
        contentAfter: result.after.length,
      })
      previousAfter = result.after
      await capture(page, `turn-${String(index).padStart(2, '0')}`)
    }

    const finalWrite = evidence.turns.flatMap(turn => turn.toolCallSummary)
      .filter(summary => summary.startsWith('editor.write:success')).length
    assert(finalWrite >= 1, 'live replay performs at least one successful editor.write')
    assert(previousAfter !== clientOutline, 'live replay changes the real outline editor')
    assert(previousAfter.length >= clientOutline.length * 0.95, `live replay must not shrink the outline: before=${clientOutline.length}, after=${previousAfter.length}`)

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
    const exportDir = exportResult.path
    const exportedTracePath = path.join(exportDir, 'run-trace.json')
    const exportedTrace = JSON.parse(fs.readFileSync(exportedTracePath, 'utf8'))
    assert.equal(exportedTrace.schemaVersion, 15, 'live replay export uses schema v15')
    const exportedData = JSON.parse(fs.readFileSync(path.join(exportDir, 'export.json'), 'utf8'))
    assert.equal(exportedData.apiResponseIndexVerification?.ok, true,
      `exported apiResponseIndex passes ref verification: ${JSON.stringify(exportedData.apiResponseIndexVerification)}`)
    assert(Array.isArray(exportedTrace.apiResponseIndex) && exportedTrace.apiResponseIndex.length > 0,
      'live replay export contains apiResponseIndex')
    const indexedResponses = exportedTrace.apiResponseIndex.filter(entry => entry.response)
    assert(indexedResponses.length > 0, 'live replay export indexes API responses')
    assert.equal(
      indexedResponses.length,
      exportedTrace.apiResponseIndex.length,
      'every API call in the live replay export has an indexed response',
    )
    const exportedTurnIds = new Set((exportedTrace.turns || []).map(turn => turn.id))
    const indexedTurnIds = new Set(indexedResponses.map(entry => entry.turnId))
    assert(exportedTurnIds.size > 0, 'exported trace contains turn ids')
    for (const turnId of exportedTurnIds) {
      assert(
        indexedTurnIds.has(turnId),
        `exported apiResponseIndex covers every exported turn: missing ${turnId}`,
      )
    }
    assert(
      indexedResponses.length >= evidence.turns.filter(turn => turn.editTaskBatchesSucceeded > 0
        || turn.toolCallSummary.some(summary => summary.startsWith('editor.write:success'))).length,
      'exported apiResponseIndex covers at least every write turn',
    )
    for (const entry of indexedResponses) {
      const payloadPath = path.join(exportDir, 'payloads', entry.response.file)
      assert(fs.existsSync(payloadPath), `indexed response payload exists: ${entry.response.file}`)
      const payloadText = fs.readFileSync(payloadPath, 'utf8')
      const digest = crypto.createHash('sha256').update(payloadText, 'utf8').digest('hex')
      assert.equal(digest, entry.response.sha256, `indexed response payload hash matches: ${entry.response.file}`)
      assert(payloadText.length === entry.response.chars, `indexed response payload length matches: ${entry.response.file}`)
    }
    evidence.indexedResponseCount = indexedResponses.length
    evidence.indexedResponseChars = indexedResponses.reduce((sum, entry) => sum + entry.response.chars, 0)
    console.log(`[PASS] exported apiResponseIndex: ${indexedResponses.length} responses, ${evidence.indexedResponseChars} chars`)
    evidence.exportPath = exportedTracePath
    evidence.finalWriteCount = finalWrite
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'result.json'), JSON.stringify(evidence, null, 2), 'utf8')
    console.log(`===== OUTLINE 20261004 LIVE REPLAY PASSED (${MODEL}) =====`)
    console.log(`[PASS] report saved: ${path.join(EVIDENCE_DIR, 'result.json')}`)
  } finally {
    clearTimeout(watchdog)
    try { if (browser) await browser.close() } catch {}
    try { execFileSync('taskkill', ['/PID', String(electronProcess.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
    await sleep(800)
    if (!KEEP_PROFILE) removeDir(PROFILE)
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
