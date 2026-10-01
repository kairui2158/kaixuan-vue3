import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const TRACE_ROOT = path.resolve('C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-outline-20260926-212218-deep')
const OUTLINE_PATH = path.resolve('C:/Users/凯瑞/Desktop/测试/《绿潮》大纲总纲.md')
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9293
const EXPORT_ROOT = path.join(ROOT, '_data', 'outline-deletion-live-replay-exports')
const EVIDENCE_DIR = path.join(ROOT, '_audit', 'verification-outline-deletion-live-replay')
const PROFILE = path.join(ROOT, '_data', 'outline-deletion-live-replay-profile')
const PROJECT_ID = 'outline-deletion-live-replay'
const API_KEY = process.env.SHENYI_LIVE_API_KEY
const BASE_URL = process.env.SHENYI_LIVE_BASE_URL
const MODEL = process.env.SHENYI_LIVE_MODEL || 'deepseek-v4-pro'
const STEP_TIMEOUT_MS = Number(process.env.SHENYI_LIVE_STEP_TIMEOUT_MS || 1800000)
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_LIVE_GLOBAL_TIMEOUT_MS || 7200000)

const clientTrace = JSON.parse(fs.readFileSync(path.join(TRACE_ROOT, 'run-trace.json'), 'utf8'))
const clientOutline = fs.readFileSync(OUTLINE_PATH, 'utf8')
const clientTurns = clientTrace.turns.map(turn => ({
  id: turn.id,
  user: turn.userRequest,
  intent: turn.intent,
  reason: turn.reason,
  toolCalls: (clientTrace.apiCalls.find(call => call.turnId === turn.id)?.toolCalls || []).length,
  physicalCalls: (clientTrace.apiCalls.find(call => call.turnId === turn.id)?.physicalCalls || []).length,
}))
assert.equal(clientTurns.length, 6, 'client live replay covers all six turns')
assert.equal(clientOutline.length, 74841, 'live replay uses the customer 74,841-character outline')

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
  console.log(`[LIVE REPLAY TURNS] ${clientTurns.map(turn => turn.user).join(' | ')}`)
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
  await page.evaluate(async ({ baseUrl, model, apiKey, projectId }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'outline-deletion-live-replay-provider',
        name: 'Outline Deletion Live Replay',
        baseUrl,
        apiKey,
        models: [model],
        selectedModel: model,
        temperature: 0.1,
        maxTokens: 128000,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
      }],
      generateProvider: 'outline-deletion-live-replay-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: 'Outline Deletion Live Replay',
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
    await window.electronAPI.storageWrite('wa_co_creation_config', {
      agentId: '',
      skillIds: [],
      mode: 'compose',
      skillAgents: {},
    })
  }, { baseUrl: BASE_URL, model: MODEL, apiKey: API_KEY, projectId: PROJECT_ID })
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

async function latestRun(page) {
  return page.evaluate(() => {
    const run = [...(window.__pinia?._s?.get('runTrace')?.runs || [])]
      .filter(item => item.source === 'outline')
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    return run ? {
      id: run.id,
      status: run.status,
      turnCount: (run.turns || []).length,
      apiCallCount: (run.apiCalls || []).length,
    } : null
  })
}

async function sendTurn(page, turn) {
  const before = await outlineContent(page)
  await waitOutlineIdle(page)
  const turnUserCount = await page.evaluate(() =>
    (window.__pinia?._s?.get('project')?.outlineChat || []).filter(item => item?.role === 'user').length
  )
  assert(Number.isInteger(turnUserCount), 'outline chat user count is readable before sending')
  await page.locator('#ow-chat-input').fill(turn.user)
  await page.locator('#ow-chat-input').evaluate(element => element.dispatchEvent(new Event('change', { bubbles: true })))
  await page.locator('#btn-ow-send').click()
  await page.waitForFunction(expectedCount => {
    const chat = window.__pinia?._s?.get('project')?.outlineChat || []
    return chat.filter(item => item?.role === 'user').length >= expectedCount
  }, turnUserCount + 1, { timeout: STEP_TIMEOUT_MS, polling: 500 })
  await page.waitForFunction(({ userCount, request }) => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])]
      .filter(item => item.source === 'outline')
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    if (!run || (run.turns || []).length < userCount) return false
    const target = run.turns[userCount - 1]
    if (!target || target.userRequest !== request || target.status === 'running') return false
    const calls = (run.apiCalls || []).filter(call => call.turnId === target.id)
    return calls.length > 0 && calls.every(call => call.status !== 'running')
  }, { userCount: turnUserCount + 1, request: turn.user }, { timeout: STEP_TIMEOUT_MS, polling: 500 })
  await waitOutlineIdle(page)
  const after = await outlineContent(page)
  const run = await latestRun(page)
  const details = await page.evaluate(runId => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = (store?.runs || []).find(item => item.id === runId)
    const userTurnIndexes = []
    ;(run?.turns || []).forEach((item, index) => {
      if (item.userRequest) userTurnIndexes.push(index)
    })
    const replayTurn = userTurnIndexes.at(-1) !== undefined ? run.turns[userTurnIndexes.at(-1)] : null
    const calls = (run?.apiCalls || []).filter(call => call.turnId === replayTurn?.id)
    const chat = window.__pinia?._s?.get('project')?.outlineChat || []
    return {
      turnStatus: replayTurn?.status || null,
      assistantReply: (chat.filter(item => item.role === 'assistant').at(-1)?.content || '').slice(0, 500),
      intent: replayTurn?.intent || null,
      reason: replayTurn?.reason || null,
      apiStatuses: calls.map(call => call.status),
      physicalCalls: calls.reduce((sum, call) => sum + ((call.physicalCalls || []).length), 0),
      toolCalls: calls.flatMap(call => (call.toolCalls || []).map(tool => ({
        name: tool.name,
        status: tool.status,
        errorCode: tool.errorCode || null,
      }))),
    }
  }, run?.id)
  return { before, after, ...details }
}

async function capture(page, name) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`), fullPage: true })
  console.log(`[PASS] screenshot saved: ${name}.png`)
}

async function authorizeFinalDeletion(page, before) {
  const confirmation = page.locator('.ow-deletion-confirmation').first()
  await confirmation.waitFor({ state: 'visible', timeout: 10000 })
  const confirmationText = await confirmation.textContent()
  assert(
    confirmationText.includes('授权前原文不会被修改'),
    `deletion confirmation states that the original is unchanged: ${confirmationText}`,
  )
  assert.equal(await outlineContent(page), before, 'outline remains unchanged until user authorization')

  await confirmation.locator('.msg-btn', { hasText: '授权本次删除' }).click()
  await waitOutlineIdle(page)
  await page.waitForFunction(() => !document.querySelector('.ow-deletion-confirmation'), null, {
    timeout: 10000,
    polling: 100,
  })
  const after = await outlineContent(page)
  assert.notEqual(after, before, 'authorized deletion changes the real outline content')
  assert.ok(after.length < before.length, 'authorized deletion reduces outline length')

  const run = await latestRun(page)
  const events = await page.evaluate(runId => {
    const run = (window.__pinia?._s?.get('runTrace')?.runs || []).find(item => item.id === runId)
    return (run?.events || []).map(event => event.type)
  }, run?.id)
  assert(events.includes('outline-deletion-confirmation-granted'), 'trace records user authorization')
  assert(events.includes('outline-deletion-confirmation-consumed'), 'trace records authorization consumption')
  return {
    contentAfter: after.length,
    removedChars: before.length - after.length,
    eventTypes: events,
  }
}

async function main() {
  assert(API_KEY && BASE_URL, 'SHENYI_LIVE_API_KEY and SHENYI_LIVE_BASE_URL are required for real-model replay')
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
    schema: 'shenyi.outline-deletion.live-replay.electron',
    version: 1,
    generatedAt: new Date().toISOString(),
    model: MODEL,
    baseUrl: BASE_URL,
    electronPid: null,
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

    let turnIndex = 0
    for (const clientTurn of clientTurns) {
      turnIndex += 1
      console.log(`[LIVE TURN ${turnIndex}/${clientTurns.length}] ${clientTurn.user}`)
      const result = await sendTurn(page, clientTurn)
      const record = {
        index: turnIndex,
        user: clientTurn.user,
        clientIntent: clientTurn.intent,
        currentIntent: result.intent,
        clientReason: clientTurn.reason,
        currentReason: result.reason,
        turnStatus: result.turnStatus,
        clientToolCalls: clientTurn.toolCalls,
        currentToolCalls: result.toolCalls.length,
        clientPhysicalCalls: clientTurn.physicalCalls,
        currentPhysicalCalls: result.physicalCalls,
        toolCallSummary: result.toolCalls.map(tool => `${tool.name}:${tool.status}${tool.errorCode ? `/${tool.errorCode}` : ''}`),
        contentBefore: result.before.length,
        contentAfter: result.after.length,
        contentChanged: result.before !== result.after,
      }
      evidence.turns.push(record)
      console.log(`[TRACE] ${JSON.stringify(record)}`)
      await capture(page, `turn-${String(turnIndex).padStart(2, '0')}`)
      assert.equal(result.turnStatus, 'success', `turn ${turnIndex} closes successfully`)
      assert(result.apiStatuses.length > 0 && result.apiStatuses.every(status => status === 'success'), `turn ${turnIndex} API calls close successfully`)
      if (turnIndex === clientTurns.length) {
        const confirmation = await page.locator('.ow-deletion-confirmation').count()
        record.deletionConfirmationVisible = confirmation > 0
        console.log(`[TURN 6] deletion confirmation visible=${confirmation > 0}, contentChanged=${record.contentChanged}`)
        const authorization = await authorizeFinalDeletion(page, result.after)
        record.authorization = authorization
        console.log(`[TURN 6 AUTHORIZED] removedChars=${authorization.removedChars}, contentAfter=${authorization.contentAfter}`)
        await capture(page, 'turn-06-authorized')
      }
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
    evidence.exportPath = exportResult.path
    evidence.exportedApiCalls = (JSON.parse(fs.readFileSync(path.join(exportResult.path, 'run-trace.json'), 'utf8')).apiCalls || []).length
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'result.json'), JSON.stringify(evidence, null, 2), 'utf8')
    console.log(`===== OUTLINE DELETION LIVE REPLAY PASSED (${MODEL}) =====`)
    console.log(`[PASS] report saved: ${path.join(EVIDENCE_DIR, 'result.json')}`)
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
