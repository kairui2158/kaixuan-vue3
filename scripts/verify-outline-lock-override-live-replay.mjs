import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const TRACE_ROOT = 'C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-outline-20261009-095906-deep'
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9307
const PROFILE = path.join(ROOT, '_data', 'outline-lock-override-live-replay-profile')
const EXPORT_ROOT = path.join(ROOT, '_data', 'outline-lock-override-live-replay-exports')
const EVIDENCE_DIR = path.join(ROOT, '_audit', 'verification-outline-lock-override-live-replay')
const PROJECT_ID = 'outline-lock-override-live-replay'
const OUTLINE_PATH = path.join(EVIDENCE_DIR, 'original-outline.md')

let API_KEY = process.env.SHENYI_LIVE_API_KEY
let BASE_URL = process.env.SHENYI_LIVE_BASE_URL
let MODEL = process.env.SHENYI_LIVE_MODEL || 'deepseek-v4-pro'

const CREDENTIAL_PROFILE_FALLBACKS = [
  path.join(ROOT, '_data', 'outline-deletion-live-replay-profile'),
  path.join(ROOT, '_data', 'long-document-operation-phase7-profile'),
  path.join(ROOT, '_data', 'long-document-restructure-phase6-profile'),
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
  console.error('Missing live provider credentials')
  process.exit(2)
}

const userTurns = [
  '对大纲进行整理重新排序，重复内容进行合并或清理，标点符合重新梳理。',
  '1，按照你的建议。 2，并入',
  '确认',
  '你按照方案写入',
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

async function setupProject(page, outline) {
  await page.evaluate(apiKey => { window.__shenyiLiveApiKey = apiKey }, API_KEY)
  await page.evaluate(async ({ baseUrl, model, outline, projectId }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'outline-lock-override-live-provider',
        name: 'Outline Lock Override Live Provider',
        baseUrl,
        apiKey: window.__shenyiLiveApiKey,
        models: [model],
        selectedModel: model,
        temperature: 0.1,
        maxTokens: 128000,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
      }],
      generateProvider: 'outline-lock-override-live-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: 'Outline Lock Override Live Replay',
      outlineText: outline,
      outlineLocked: true,
      outlineLockedText: outline,
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
    outline,
    projectId: PROJECT_ID,
  })
  await page.evaluate(() => { delete window.__shenyiLiveApiKey })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20000 })
  await sleep(1200)
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
  await sleep(400)
}

async function openOutline(page) {
  await page.click('#btn-outline-workspace')
  await page.waitForSelector('#outline-editor', { timeout: 15000 })
  await sleep(500)
  await page.click('#btn-ai-co-create')
  await page.waitForSelector('#ow-chat-input', { timeout: 15000 })
  await sleep(500)
}

async function outlineContent(page) {
  return await page.evaluate(() => window.__pinia?._s?.get('project')?.outlineText || '')
}

async function outlineLocked(page) {
  return await page.evaluate(() => Boolean(window.__pinia?._s?.get('project')?.outlineLocked))
}

async function outlineRunActivity(page) {
  return await page.evaluate(() => {
    const run = [...(window.__pinia?._s?.get('runTrace')?.runs || [])]
      .filter(item => item.source === 'outline')
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    if (!run) return null
    const turn = [...(run.turns || [])].sort((a, b) => b.startedAt - a.startedAt)[0]
    const sendButton = document.querySelector('#btn-ow-send')
    return {
      runId: run.id,
      runStatus: run.status,
      turnId: turn?.id || null,
      turnStatus: turn?.status || null,
      sendDisabled: sendButton ? Boolean(sendButton.disabled) : null,
      apiCalls: (run.apiCalls || []).map(call => ({
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

function runReachedTerminal(snapshot) {
  if (!snapshot) return true
  if (snapshot.turnStatus === 'running') return false
  if ((snapshot.apiCalls || []).some(call => call.status === 'running')) return false
  return snapshot.sendDisabled !== true
}

async function waitOutlineIdle(page, inactivityTimeoutMs = 15 * 60_000) {
  let lastSignature = null
  let lastActivityAt = Date.now()
  while (true) {
    let snapshot = null
    try {
      snapshot = await Promise.race([
        outlineRunActivity(page),
        sleep(5000).then(() => null),
      ])
    } catch {
      snapshot = null
    }
    const signature = JSON.stringify(snapshot)
    if (signature !== lastSignature) {
      lastSignature = signature
      lastActivityAt = Date.now()
      console.log(`[WAIT] ${new Date().toISOString()} ${signature.slice(0, 500)}`)
    }
    if (runReachedTerminal(snapshot)) {
      await page.waitForFunction(() => {
        const sendButton = document.querySelector('#btn-ow-send')
        return Boolean(sendButton && !sendButton.disabled)
      }, null, { timeout: 20000, polling: 250 })
      await sleep(500)
      return
    }
    if (Date.now() - lastActivityAt >= inactivityTimeoutMs) {
      throw new Error(`outline run inactive for ${inactivityTimeoutMs}ms: ${signature.slice(0, 2000)}`)
    }
    // The next click does not always create a new turn immediately; guard
    // against asserting against the previous terminal turn.
    if (snapshot && snapshot.turnStatus !== 'running') {
      await sleep(1000)
    }
    await sleep(1000)
  }
}

async function capture(page, name) {
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`), fullPage: true })
}

async function persistedRun(page, runId) {
  const traceRoot = path.join(PROFILE, 'documents-data', 'run-trace', 'outline')
  const readMatch = () => {
    const traceDirs = fs.existsSync(traceRoot)
      ? fs.readdirSync(traceRoot, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => path.join(traceRoot, entry.name))
        .filter(dir => fs.existsSync(path.join(dir, 'run-trace.json')))
      : []
    return traceDirs
      .map(dir => ({ dir, trace: JSON.parse(fs.readFileSync(path.join(dir, 'run-trace.json'), 'utf8')) }))
      .find(({ trace }) => trace.id === runId)
  }
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const match = readMatch()
    if (match) return match
    await sleep(500)
  }
  assert(false, `run trace is persisted for ${runId} within 15s after turn completion`)
}

async function runSnapshot(page) {
  return await page.evaluate(() => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])]
      .filter(item => item.source === 'outline')
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    return {
      id: run?.id || null,
      turns: (run?.turns || []).map(turn => ({
        id: turn.id,
        seq: turn.seq,
        status: turn.status,
        userRequest: turn.userRequest,
        intent: turn.intent || null,
        reason: turn.reason || null,
        permissionDecision: turn.permissionDecision || null,
        toolCallCount: turn.toolCallCount || 0,
      })),
      apiCalls: (run?.apiCalls || []).map(call => ({
        id: call.id,
        turnId: call.turnId,
        status: call.status,
        intent: call.intent,
        permissionDecision: call.permissionDecision,
        actualToolSurface: call.actualToolSurface,
        finishReason: call.finishReason,
        durationMs: call.durationMs,
        physicalCalls: (call.physicalCalls || []).length,
        toolCalls: (call.toolCalls || []).map(tool => ({
          toolCallId: tool.toolCallId,
          name: tool.name,
          status: tool.status,
          input: tool.input,
          error: tool.error,
        })),
      })),
    }
  })
}

function extractOriginalOutline() {
  const requestPath = path.join(TRACE_ROOT, 'payloads', '001-request.json')
  const messages = JSON.parse(fs.readFileSync(requestPath, 'utf8'))
  const context = String(messages.find(message => message.role === 'system' && String(message.content || '').includes('[当前焦点全文]'))?.content || '')
  assert(context, 'customer trace contains the original outline ContextPack')
  const start = context.indexOf('[当前焦点全文]')
  const end = context.indexOf('\n\n当前设定（来源=settings')
  assert(start >= 0 && end > start, 'original outline boundaries are present')
  const outline = context.slice(start + '[当前焦点全文]'.length, end).trim()
  assert(outline.length > 70000, `original outline is complete: ${outline.length} chars`)
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  fs.writeFileSync(OUTLINE_PATH, outline, 'utf8')
  return outline
}

function summarizeRun(run) {
  return {
    runId: run.id,
    turns: run.turns,
    apiCalls: run.apiCalls.map(call => ({
      id: call.id,
      turnId: call.turnId,
      status: call.status,
      intent: call.intent,
      permissionDecision: call.permissionDecision,
      actualToolSurface: call.actualToolSurface,
      finishReason: call.finishReason,
      durationMs: call.durationMs,
      physicalCalls: call.physicalCalls,
      toolCalls: call.toolCalls.map(tool => ({
        name: tool.name,
        status: tool.status,
        error: tool.error,
        input: tool.input,
      })),
    })),
  }
}

function physicalCallCount(call) {
  const value = call?.physicalCalls
  if (typeof value === 'number') return value
  return Array.isArray(value) ? value.length : 0
}

async function main() {
  assertFreshRendererBuild()
  removeDir(PROFILE)
  removeDir(EXPORT_ROOT)
  removeDir(EVIDENCE_DIR)
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
  fs.mkdirSync(EXPORT_ROOT, { recursive: true })

  const outline = extractOriginalOutline()
  const evidence = {
    generatedAt: new Date().toISOString(),
    provider: { baseUrl: BASE_URL, model: MODEL, streamMode: true },
    sourceTrace: path.join(TRACE_ROOT, 'run-trace.json'),
    outlineChars: outline.length,
    turns: [],
    passed: true,
  }

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
    await setupProject(page, outline)
    await openOutline(page)
    assert(await outlineLocked(page), 'outline starts in the customer-observed locked state')
    assert.equal(await outlineContent(page), outline, 'locked outline content matches the customer trace')
    await capture(page, '00-locked-outline-before-replay')

    for (const [index, request] of userTurns.entries()) {
      const before = await outlineContent(page)
      fs.writeFileSync(path.join(EVIDENCE_DIR, `turn-${index + 1}-before.md`), before, 'utf8')
      console.log(`[TURN ${index + 1}] ${request}`)
      await page.locator('#ow-chat-input').fill(request)
      await page.locator('#ow-chat-input').evaluate(element => element.dispatchEvent(new Event('change', { bubbles: true })))
      await page.locator('#btn-ow-send').click()
      await page.waitForFunction(expected => {
        const store = window.__pinia?._s?.get('runTrace')
        const run = [...(store?.runs || [])]
          .filter(item => item.source === 'outline')
          .sort((a, b) => b.startedAt - a.startedAt)[0]
        return run?.turns?.at(-1)?.userRequest === expected
      }, request, { timeout: 20_000, polling: 250 })
      await waitOutlineIdle(page)
      const after = await outlineContent(page)
      fs.writeFileSync(path.join(EVIDENCE_DIR, `turn-${index + 1}-after.md`), after, 'utf8')
      await capture(page, `turn-${index + 1}-after`)
      const run = await runSnapshot(page)
      const persisted = await persistedRun(page, run.id)
      const summary = summarizeRun(run)
      fs.writeFileSync(path.join(EVIDENCE_DIR, `turn-${index + 1}-summary.json`), JSON.stringify(summary, null, 2), 'utf8')
      const turn = run.turns.at(-1)
      assert.equal(turn.userRequest, request, `turn ${index + 1} records the customer request`)
      assert.notEqual(turn.status, 'running', `turn ${index + 1} reaches a terminal state`)
      const call = (run.apiCalls || []).filter(item => item.turnId === turn.id).at(-1)
      if (call) {
        assert.notEqual(call.status, 'running', `turn ${index + 1} API call closes`)
      }
      console.log(`[TRACE] turn=${index + 1} status=${turn.status} reason=${turn.reason} calls=${(run.apiCalls || []).filter(item => item.turnId === turn.id).length}`)
      evidence.turns.push({
        request,
        turnId: turn.id,
        turnStatus: turn.status,
        reason: turn.reason,
        changed: before !== after,
        persistedTrace: persisted.dir,
      })
    }

    const run = await runSnapshot(page)
    const persisted = await persistedRun(page, run.id)
    fs.copyFileSync(path.join(persisted.dir, 'run-trace.json'), path.join(EVIDENCE_DIR, 'run-trace.json'))
    const finalOutline = await outlineContent(page)
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'final-outline.md'), finalOutline, 'utf8')

    const finalTurn = run.turns.at(-1)
    const finalCall = (run.apiCalls || []).filter(item => item.turnId === finalTurn.id).at(-1)
    assert(finalCall, 'final customer turn has an API call')
    const summaryFailedButWritten =
      finalTurn.status === 'success' && finalTurn.reason === 'edit_task_written_summary_failed'
    assert(
      finalTurn.status === 'success',
      finalCall.status === 'failed' && summaryFailedButWritten
        ? 'final explicit write turn succeeds with summary-only failure semantics'
        : 'final explicit write turn succeeds',
    )
    assert(
      finalCall.status === 'success' || summaryFailedButWritten,
      'final write API call succeeds or is a verified write with summary-only failure',
    )
    assert.notEqual(finalOutline, outline, 'locked outline was physically rewritten')
    assert(finalCall.permissionDecision?.decision === 'write-authorized', 'final turn remains write-authorized by the single source')
    const writeTools = (finalCall.toolCalls || []).filter(tool => tool.name === 'editor.write')
    assert(writeTools.length >= 1, 'final turn calls editor.write through the real tool surface')
    const successfulWrites = writeTools.filter(tool => tool.status === 'success')
    assert(successfulWrites.length >= 1, 'final turn has at least one successful editor.write')
    const permissionFailures = writeTools.filter(tool => {
      const code = tool.error?.code || ''
      const message = tool.error?.message || ''
      return code === 'locked'
        || code === 'unauthorized'
        || code === 'forbidden'
        || code === 'permission_denied'
        || /写入权限|没有权限|permission|locked/i.test(message)
    })
    assert(
      permissionFailures.length === 0,
      `no final editor.write fails on permission or lock: ${JSON.stringify(permissionFailures)}`,
    )
    const lockedWriteFailures = (run.apiCalls || [])
      .flatMap(call => call.toolCalls || [])
      .filter(tool => tool.name === 'editor.write' && tool.error?.code === 'locked')
    assert.equal(lockedWriteFailures.length, 0, 'no write is rejected by the stale outline-lock gate')
    const finalPhysicalCallCount = physicalCallCount(finalCall)
    assert(
      finalPhysicalCallCount < 15,
      `final turn does not repeat the 15-request failure shape: ${finalPhysicalCallCount}`,
    )
    assert((finalTurn.reason || '') !== 'hard_deadline', 'final turn is not killed by the 300-second deadline')
    assert(await outlineLocked(page), 'outline remains locked after API direct write')

    evidence.finalTurn = {
      physicalCalls: finalPhysicalCallCount,
      writeCalls: writeTools.length,
      successfulWriteCalls: successfulWrites.length,
      durationMs: finalCall.durationMs,
      finalOutlineChars: finalOutline.length,
    }
    await capture(page, 'final-state')
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'verification-result.json'), JSON.stringify(evidence, null, 2), 'utf8')
    console.log(`===== OUTLINE LOCK OVERRIDE LIVE REPLAY PASSED (${finalOutline.length} chars) =====`)
  } finally {
    try { if (browser) await browser.close() } catch {}
    try { execFileSync('taskkill', ['/PID', String(electronProcess.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
    await sleep(800)
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
