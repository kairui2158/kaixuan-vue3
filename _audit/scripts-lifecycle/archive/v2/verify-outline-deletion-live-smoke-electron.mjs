#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'
import defaultPaths from '../electron/defaultPaths.js'

const ROOT = path.resolve(process.cwd())
const LIVE_PROVIDER_PATH = process.env.SHENYI_OUTLINE_LIVE_PROVIDER_PATH
  ? path.resolve(process.env.SHENYI_OUTLINE_LIVE_PROVIDER_PATH)
  : path.join(defaultPaths.getDataRoot(path.join(os.homedir(), 'Documents')), 'wa_providers.json')
const LIVE_PROVIDER_ID = process.env.SHENYI_OUTLINE_LIVE_PROVIDER_ID || 'prov-1788185503573'
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_OUTLINE_LIVE_SMOKE_CDP_PORT || 9391)
const PROFILE = path.join(ROOT, '_data', 'outline-deletion-live-smoke-profile')
const EXPORT_ROOT = path.join(ROOT, '_audit', 'verification-outline-deletion-live-smoke', 'trace-export')
const EVIDENCE_DIR = path.join(ROOT, '_audit', 'verification-outline-deletion-live-smoke')
const RUN_LOG_PATH = path.join(EVIDENCE_DIR, 'electron-run.log')
const OUTLINE_PATH = path.join(ROOT, '_data', 'outline-deletion-live-smoke-outline.md')
const PROJECT_ID = 'outline-deletion-live-smoke'
const USER_REQUEST = '请删除第二章“雨夜追踪”以及这一章的全部内容，并直接写入大纲。不要只给建议，不要输出整理后的全文。'
const STEP_TIMEOUT_MS = Number(process.env.SHENYI_OUTLINE_LIVE_SMOKE_STEP_TIMEOUT_MS || 900000)
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_OUTLINE_LIVE_SMOKE_GLOBAL_TIMEOUT_MS || 1800000)

const OUTLINE_TEXT = `# 星潮旧港

## 第一章 灯下旧约

林昭把船票压在灯下，纸面上的潮痕像一张缩小的海图。
她说自己明早出发，却没有说要去多久。

## 第二章 雨夜追踪

雨水把码头洗成一面黑镜。
林昭沿着缆绳走向仓库，身后有两个人始终保持着不远不近的距离。
她在拐角处停下，听见他们低声争论一个旧船名。

## 第三章 潮汐之后

天亮时，码头只剩涨潮的声音。
旧船名没有再出现，林昭却记住了那个发音。
`

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
  assert.equal(staleBundles.length, 0,
    `renderer build is stale; rebuild with npm run build:vue. Stale bundles: ${staleBundles.join(', ')}`)
}

function loadDefaultProvider() {
  assert(fs.existsSync(LIVE_PROVIDER_PATH), 'application live provider config exists')
  const config = JSON.parse(fs.readFileSync(LIVE_PROVIDER_PATH, 'utf8'))
  const providers = Array.isArray(config) ? config : config.providers || []
  const provider = providers.find(item => item.id === LIVE_PROVIDER_ID)
  assert(provider, `live provider ${LIVE_PROVIDER_ID} exists in ${LIVE_PROVIDER_PATH}`)
  assert(provider.baseUrl && provider.selectedModel && provider.apiKey,
    'default live provider has baseUrl, selectedModel, and encrypted apiKey')
  return provider
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
  console.log(`[VISIBLE ELECTRON] pid=${child.pid} profile=${PROFILE}`)
  child.stdout.on('data', chunk => fs.appendFileSync(RUN_LOG_PATH, chunk, 'utf8'))
  child.stderr.on('data', chunk => fs.appendFileSync(RUN_LOG_PATH, chunk, 'utf8'))
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

async function seedProject(page, provider) {
  await page.evaluate(async ({ providerSeed, projectId }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        ...providerSeed,
        enabled: true,
      }],
      generateProvider: providerSeed.id,
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: 'Outline Deletion Live Smoke',
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
  }, {
    providerSeed: {
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      models: provider.models,
      selectedModel: provider.selectedModel,
      temperature: provider.temperature,
      maxTokens: provider.maxTokens,
      purpose: provider.purpose,
      providerType: provider.providerType,
      streamMode: provider.streamMode,
    },
    projectId: PROJECT_ID,
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20000 })
  await sleep(1200)
  await closeProjectModal(page)
}

async function outlineContent(page) {
  return page.evaluate(() => window.__pinia?._s?.get('project')?.outlineText || '')
}

async function waitOutlineIdle(page, timeout = STEP_TIMEOUT_MS) {
  await page.waitForFunction(() =>
    Boolean(document.querySelector('#btn-ow-send') && !document.querySelector('#btn-ow-send')?.disabled),
    null, { timeout, polling: 500 })
  await sleep(500)
}

async function latestRun(page) {
  return page.evaluate(() => {
    const run = [...(window.__pinia?._s?.get('runTrace')?.runs || [])]
      .filter(item => item.source === 'outline')
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    return run ? { id: run.id, status: run.status } : null
  })
}

async function runDetails(page, runId) {
  return page.evaluate(targetRunId => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = (store?.runs || []).find(item => item.id === targetRunId)
    const turns = run?.turns || []
    const turn = turns.at(-1)
    const calls = (run?.apiCalls || []).filter(call => call.turnId === turn?.id)
    const chat = window.__pinia?._s?.get('project')?.outlineChat || []
    return {
      turnStatus: turn?.status || null,
      intent: turn?.intent || null,
      reason: turn?.reason || null,
      assistantReply: (chat.filter(item => item.role === 'assistant').at(-1)?.content || '').slice(0, 800),
      apiStatuses: calls.map(call => call.status),
      apiErrors: calls.map(call => call.error || call.errorCode || null),
      physicalCalls: calls.reduce((sum, call) => sum + (call.physicalCalls || []).length, 0),
      toolCalls: calls.flatMap(call => (call.toolCalls || []).map(tool => ({
        name: tool.name,
        status: tool.status,
        errorCode: tool.errorCode || null,
      }))),
      events: (run?.events || []).map(event => ({
        type: event.type,
        turnId: event.turnId || null,
      })),
    }
  }, runId)
}

async function capture(page, name) {
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`), fullPage: true })
  console.log(`[PASS] screenshot saved: ${name}.png`)
}

async function sendLiveTurn(page) {
  await waitOutlineIdle(page)
  const userCountBefore = await page.evaluate(() =>
    (window.__pinia?._s?.get('project')?.outlineChat || []).filter(item => item?.role === 'user').length)
  await page.locator('#ow-chat-input').fill(USER_REQUEST)
  await page.locator('#ow-chat-input').evaluate(element =>
    element.dispatchEvent(new Event('change', { bubbles: true })))
  await page.locator('#btn-ow-send').click()
  await page.waitForFunction(expectedCount => {
    const chat = window.__pinia?._s?.get('project')?.outlineChat || []
    return chat.filter(item => item?.role === 'user').length >= expectedCount
  }, userCountBefore + 1, { timeout: STEP_TIMEOUT_MS, polling: 500 })

  const deadline = Date.now() + STEP_TIMEOUT_MS
  let lastDetails = null
  while (Date.now() < deadline) {
    const confirmationCount = await page.locator('.ow-deletion-confirmation').count()
    const run = await latestRun(page)
    if (run) lastDetails = await runDetails(page, run.id)
    if (confirmationCount > 0) return { confirmationVisible: true, details: lastDetails }
    if (lastDetails?.turnStatus && lastDetails.turnStatus !== 'running'
      && lastDetails.apiStatuses.length > 0
      && lastDetails.apiStatuses.every(status => status !== 'running')) {
      return { confirmationVisible: false, details: lastDetails }
    }
    await sleep(1000)
  }
  throw new Error(`live deletion turn did not reach confirmation or terminal state: ${JSON.stringify(lastDetails)}`)
}

async function main() {
  const provider = loadDefaultProvider()
  assertFreshRendererBuild()

  removeDir(PROFILE)
  removeDir(EXPORT_ROOT)
  removeDir(EVIDENCE_DIR)
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  fs.mkdirSync(EXPORT_ROOT, { recursive: true })
  fs.writeFileSync(OUTLINE_PATH, OUTLINE_TEXT, 'utf8')

  const watchdog = setTimeout(() => {
    console.error(`[FAIL] global timeout after ${GLOBAL_TIMEOUT_MS}ms`)
    process.exit(1)
  }, GLOBAL_TIMEOUT_MS)

  const electronProcess = startElectron()
  let browser = null
  const result = {
    schema: 'shenyi.outline-deletion.live-smoke.electron',
    version: 1,
    generatedAt: new Date().toISOString(),
    provider: {
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      selectedModel: provider.selectedModel,
      streamMode: provider.streamMode,
      apiKey: '***MASKED***',
    },
    userRequest: USER_REQUEST,
    outlineChars: OUTLINE_TEXT.length,
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
    page.on('console', message => {
      if (message.type() === 'error') console.log(`[PAGE CONSOLE ERROR] ${message.text().slice(0, 500)}`)
    })
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1500)
    await seedProject(page, provider)

    await page.click('#btn-outline-workspace')
    await page.waitForSelector('#outline-editor', { timeout: 15000 })
    assert.equal(await outlineContent(page), '', 'smoke project starts with an empty outline')
    await page.click('#btn-import-outline')
    await page.locator('#outline-workspace input[type="file"][accept=".txt,.md,.text,.rtf,.docx"]').first()
      .setInputFiles(OUTLINE_PATH)
    await page.waitForFunction(expected => {
      const text = window.__pinia?._s?.get('project')?.outlineText || ''
      return text === expected
    }, OUTLINE_TEXT, { timeout: 30000, polling: 250 })
    console.log(`[PASS] synthetic outline imported through real file input: ${OUTLINE_TEXT.length} chars`)

    await page.click('#btn-ai-co-create')
    await page.waitForSelector('#ow-chat-input', { timeout: 15000 })
    const before = await outlineContent(page)
    const live = await sendLiveTurn(page)
    result.beforeAuthorization = {
      confirmationVisible: live.confirmationVisible,
      turnStatus: live.details?.turnStatus || null,
      intent: live.details?.intent || null,
      physicalCalls: live.details?.physicalCalls || 0,
      toolCalls: live.details?.toolCalls || [],
      apiStatuses: live.details?.apiStatuses || [],
      assistantReply: live.details?.assistantReply || '',
      contentUnchanged: before === OUTLINE_TEXT,
    }
    assert(live.confirmationVisible, `live provider path reaches the deletion authorization gate: ${JSON.stringify(live.details)}`)
    assert.equal(before, OUTLINE_TEXT, 'outline is unchanged before user authorization')
    const run = await latestRun(page)
    const requested = (live.details?.events || []).some(event =>
      event.type === 'outline-deletion-confirmation-requested')
    assert(requested, 'trace records the deletion authorization request')
    await capture(page, '01-live-deletion-authorization-gate')

    const confirmation = page.locator('.ow-deletion-confirmation').first()
    const confirmationText = await confirmation.textContent()
    assert(confirmationText.includes('授权前原文不会被修改'),
      `confirmation states the original remains unchanged: ${confirmationText}`)
    await confirmation.locator('.msg-btn', { hasText: '授权本次删除' }).click()
    await waitOutlineIdle(page)
    await page.waitForFunction(() => !document.querySelector('.ow-deletion-confirmation'), null, {
      timeout: 10000,
      polling: 100,
    })
    const after = await outlineContent(page)
    assert.notEqual(after, before, 'authorized deletion changes the outline')
    assert(!after.includes('## 第二章 雨夜追踪'), 'target heading is deleted after authorization')
    assert(!after.includes('雨水把码头洗成一面黑镜。'), 'target chapter body is deleted after authorization')
    assert(after.includes('## 第一章 灯下旧约'), 'first chapter is preserved')
    assert(after.includes('## 第三章 潮汐之后'), 'third chapter is preserved')

    const finalRun = await latestRun(page)
    const details = await runDetails(page, finalRun.id)
    const eventTypes = details.events.map(event => event.type)
    assert(eventTypes.includes('outline-deletion-confirmation-granted'), 'trace records user authorization')
    const consumedEvent = details.events.find(event =>
      event.type === 'outline-deletion-confirmation-consumed')
    assert(consumedEvent, `trace records authorization consumption: ${JSON.stringify(details.events)}`)

    result.afterAuthorization = {
      contentAfter: after,
      removedChars: before.length - after.length,
      turnStatus: details.turnStatus,
      intent: details.intent,
      physicalCalls: details.physicalCalls,
      toolCalls: details.toolCalls,
      eventTypes,
      authorizedExecutionChannel: 'authorized-replay',
      consumedEventCount: eventTypes.filter(type =>
        type === 'outline-deletion-confirmation-consumed').length,
    }
    await capture(page, '02-live-deletion-authorized-write')

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
    }, { exportRoot: EXPORT_ROOT, runId: finalRun.id })
    assert(exportResult?.success, `trace export succeeds: ${exportResult?.reason || ''}`)
    result.traceExportPath = exportResult.path
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'result.json'), JSON.stringify(result, null, 2), 'utf8')
    console.log('[PASS] live provider smoke completed: authorized replay consumed and document changed')
    console.log(`[PASS] report saved: ${path.join(EVIDENCE_DIR, 'result.json')}`)
    console.log(`[PASS] trace saved: ${exportResult.path}`)
  } finally {
    clearTimeout(watchdog)
    try { if (browser) await browser.close() } catch {}
    try {
      execFileSync('taskkill', ['/PID', String(electronProcess.pid), '/T', '/F'], { stdio: 'ignore' })
    } catch {}
    await sleep(800)
    await removeDir(PROFILE)
    fs.rmSync(OUTLINE_PATH, { force: true })
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
