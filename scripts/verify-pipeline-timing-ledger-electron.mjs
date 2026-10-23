import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const ROOT = path.resolve(process.cwd())
const SCRIPT_NAME = 'verify-pipeline-timing-ledger-electron.mjs'
const ELECTRON_EXE = process.env.SHENYI_TIMING_LEDGER_ELECTRON
  ? path.resolve(process.env.SHENYI_TIMING_LEDGER_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_TIMING_LEDGER_CDP_PORT || 9362)
const PROFILE = path.join(ROOT, '_data', 'pipeline-timing-ledger-live-profile')
const DATA_DIR = path.join(PROFILE, 'documents-data')
const EXPORT_ROOT = path.join(ROOT, '_data', 'pipeline-timing-ledger-live-exports')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-pipeline-timing-ledger-live')
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const HEARTBEAT_PATH = path.join(EVIDENCE_ROOT, 'heartbeat.jsonl')
const PROJECT_ID = 'pipeline-timing-ledger-live'
const MODEL = process.env.SHENYI_LIVE_MODEL || 'deepseek-v4-pro'
const BASE_URL = process.env.SHENYI_LIVE_BASE_URL || 'https://openapi.cloud-ai.cn/v1'
const CREDENTIAL_PROFILE = path.join(ROOT, '_data', 'outline-lock-override-live-replay-profile')
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_TIMING_LEDGER_GLOBAL_TIMEOUT_MS || 3 * 60 * 60_000)
const HEARTBEAT_INTERVAL_MS = Number(process.env.SHENYI_TIMING_LEDGER_HEARTBEAT_INTERVAL_MS || 10_000)
const STALLED_TIMEOUT_MS = Number(process.env.SHENYI_TIMING_LEDGER_STALLED_TIMEOUT_MS || 3 * 60_000)
const DEAD_TIMEOUT_MS = Number(process.env.SHENYI_TIMING_LEDGER_DEAD_TIMEOUT_MS || 10 * 60_000)
const WALL_BUDGET_MS = Number(
  process.env.SHENYI_TIMING_LEDGER_WALL_BUDGET_MS
    || process.env.SHENYI_TIMING_LEDGER_STEP_TIMEOUT_MS
    || 2 * 60 * 60_000,
)
const KEEP_PROFILE = process.env.SHENYI_TIMING_LEDGER_KEEP_PROFILE === '1'
const { safeStorage } = require('electron')

const OUTLINE_TEXT = [
  '# 流水线耗时账本真实UI实测大纲',
  '主角在灯塔、旧航道与南方航线之间追踪风暴信标，并完成第一阶段远航。',
  '第一卷 风暴起点：旧信、灯塔与南方航线共同推动第一卷冲突。',
  '第二卷 雾中港：港口交易、旧盟约与失踪船队让矛盾升级，主角必须选择立场。',
  '第三卷 南方航线：航路贯通、家族真相与风暴信标合流，完成第一阶段远航闭环。',
].join('\n')

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

function loadSkillFolder({ root, folder }) {
  const folderPath = path.join(root, folder)
  const definitionPath = path.join(folderPath, 'SKILL.md')
  assert(fs.existsSync(definitionPath), `${folder}: SKILL.md exists`)
  const definition = fs.readFileSync(definitionPath, 'utf8')
  const idMatch = definition.match(/^id:\s*(\S+)/m)
  assert(idMatch, `${folder}: SKILL.md exposes an id`)
  const nameMatch = definition.match(/^name:\s*(.+)$/m)
  const templatePath = path.join(folderPath, 'template.md')
  assert(fs.existsSync(templatePath), `${folder}: template.md exists`)
  const metaPath = path.join(folderPath, 'meta.json')
  const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {}
  const samplesPath = path.join(folderPath, 'samples.txt')
  const samples = fs.existsSync(samplesPath) ? fs.readFileSync(samplesPath, 'utf8') : ''
  const sourceId = idMatch[1]
  return {
    sourceId,
    skill: {
      id: `folder:${sourceId}`,
      sourceId,
      name: nameMatch ? nameMatch[1].trim() : folder,
      template: fs.readFileSync(templatePath, 'utf8'),
      description: 'pipeline timing ledger live skill',
      format: 'folder',
      source: 'external',
      category: 'folder',
      folderPath,
      executionMode: 'chain',
      outputFormat: 'text',
      sourcePath: definitionPath,
      samples,
      validationRules: [],
      splitSize: 1000,
      injectMode: 'system_prefix',
      bindTarget: 'project',
      linkedSkillIds: [],
      customVars: {},
      inputSchema: '',
      outputSchema: '',
      retryPolicy: '',
      intents: ['generate'],
      meta,
    },
  }
}

function restoreLiveCredentials() {
  if (process.env.SHENYI_LIVE_API_KEY) return process.env.SHENYI_LIVE_API_KEY
  const providerPath = path.join(CREDENTIAL_PROFILE, 'documents-data', 'wa_providers.json')
  assert(fs.existsSync(providerPath),
    `live provider config exists: ${providerPath}; no new key is entered by this verifier`)
  const stored = JSON.parse(fs.readFileSync(providerPath, 'utf8'))
  const provider = (stored?.providers || []).find(item =>
    item?.baseUrl === BASE_URL
    && typeof item?.apiKey === 'string'
    && (item.apiKey.startsWith('enc:') || item.apiKey.startsWith('sk-')))
  assert(provider, 'stored live provider contains a usable credential')
  const apiKey = provider.apiKey.startsWith('enc:')
    ? safeStorage.decryptString(Buffer.from(provider.apiKey.slice(4), 'base64'))
    : provider.apiKey
  assert(apiKey, 'stored live credential decrypts successfully')
  return apiKey
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
      SHENYI_DATA_DIR: DATA_DIR,
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

async function connectPage(browser) {
  let page = null
  for (let attempt = 0; attempt < 24 && !page; attempt++) {
    page = browser.contexts()[0]?.pages()
      ?.find(item => !item.url().startsWith('devtools://')) || null
    if (!page) await sleep(500)
  }
  assert(page, 'renderer page reachable')
  return page
}

async function closeProjectModal(page) {
  await page.evaluate(() => {
    document.querySelector('.project-modal-content .btn-close')?.click()
  })
  await sleep(400)
}

async function seedApplication(page, apiKey, skills) {
  await page.evaluate(async ({ apiKey, baseUrl, model, projectId, seededSkills, outline }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'pipeline-timing-ledger-live-provider',
        name: 'Pipeline Timing Ledger Live Provider',
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
      generateProvider: 'pipeline-timing-ledger-live-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: '流水线耗时账本真实UI实测',
      outlineText: outline,
      outlineLocked: true,
      outlineLockedText: outline,
      bookWordCount: 12000,
      volumesConfirmed: false,
      chaptersConfirmed: false,
      settingsGenerated: false,
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
    await window.electronAPI.storageWrite('wa_skills', { skills: seededSkills, pipelineSkills: [] })
    await window.electronAPI.storageWrite('wa_pipeline_step_config', {
      agents: { 0: '', 1: '', 2: '', 3: '', 4: '' },
      skills: { 0: [], 1: [], 2: [], 3: [], 4: [] },
      modes: { 0: 'compose', 1: 'compose', 2: 'chain', 3: 'chain', 4: 'chain' },
      skillAgents: {},
    })
    await window.electronAPI.storageWrite('wa_deAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
    await window.electronAPI.storageRemove('wa_pipeline_breakpoint')
  }, {
    apiKey,
    baseUrl: BASE_URL,
    model: MODEL,
    projectId: PROJECT_ID,
    seededSkills: skills,
    outline: OUTLINE_TEXT,
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20_000 })
  await sleep(1500)
  await closeProjectModal(page)
}

async function selectVolumeSkillsThroughUi(page, skills) {
  await page.click('#btn-pipeline')
  await page.waitForSelector('#pipeline-panel', { timeout: 20_000 })
  await page.locator('#pl-steps .pl-step').nth(2).click()
  await page.waitForSelector('#pl-step-3-content', { state: 'visible' })
  await page.selectOption('#pl-s3-mode', 'chain')
  const existingCount = await page.locator('#pl-s3-skills-list .pl-skill-chip').count()
  for (let index = existingCount - 1; index >= 0; index -= 1) {
    await page.locator('#pl-s3-skills-list .pl-skill-chip').nth(index)
      .locator('.pl-chip-close').click()
  }
  for (const skill of skills) {
    await page.selectOption('#pl-s3-skill', skill.id)
    await page.click('#pl-s3-add-skill')
    await page.waitForFunction(({ skillName, expectedCount }) => {
      const chips = [...document.querySelectorAll('#pl-s3-skills-list .pl-skill-chip')]
      return chips.length === expectedCount
        && chips.some(chip => (chip.textContent || '').includes(skillName))
    }, {
      skillName: skill.name,
      expectedCount: skills.indexOf(skill) + 1,
    }, { timeout: 10_000, polling: 250 })
    console.log(`[SKILL UI SELECTED] ${skill.id} (${skill.name})`)
  }
  const selected = await page.evaluate(() =>
    [...document.querySelectorAll('#pl-s3-skills-list .pl-skill-chip')]
      .map(chip => (chip.textContent || '').trim()))
  assert.equal(selected.length, skills.length,
    `all four volume SKILLs are selected through the real dropdown; got ${JSON.stringify(selected)}`)
  await page.locator('#pl-volume-count').fill('3')
  await page.locator('#pl-volume-count').dispatchEvent('change')
  await sleep(400)
}

function currentRunSnapshot(page) {
  return page.evaluate(() => {
    const store = window.__pinia?._s?.get('runTrace')
    const pipeline = window.__pinia?._s?.get('pipeline')
    const project = window.__pinia?._s?.get('project')
    const run = [...(store?.runs || [])]
      .filter(item => item.source === 'pipeline' && item.step === 2)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    return {
      runId: run?.id || null,
      runStatus: run?.status || null,
      events: (run?.events || []).length,
      apiCalls: (run?.apiCalls || []).length,
      runningApiCalls: (run?.apiCalls || []).filter(call => call.status === 'running').length,
      failedApiCalls: (run?.apiCalls || []).filter(call => call.status === 'failed').length,
      lastEventType: (run?.events || []).at(-1)?.type || null,
      progress: pipeline?.activeVolumesRun?.progress ?? null,
      status: pipeline?.activeVolumesRun?.statusText || null,
      pipelineRunStatus: pipeline?.activeVolumesRun?.status || null,
      isGenerating: Boolean(pipeline?.isGenerating),
      volumeCount: (project?.volumes || []).length,
      lastLog: (window.__pinia?._s?.get('executionLog')?.logs || []).at(-1)?.message || null,
    }
  })
}

function startHeartbeat(page, electronPid) {
  let stopped = false
  const timer = setInterval(async () => {
    if (stopped) return
    try {
      const state = await currentRunSnapshot(page)
      state.at = new Date().toISOString()
      state.electronPid = electronPid
      fs.appendFileSync(HEARTBEAT_PATH, `${JSON.stringify(state)}\n`, 'utf8')
    } catch (error) {
      fs.appendFileSync(HEARTBEAT_PATH,
        `${JSON.stringify({ at: new Date().toISOString(), error: String(error?.message || error) })}\n`, 'utf8')
    }
  }, HEARTBEAT_INTERVAL_MS)
  return {
    stop() {
      stopped = true
      clearInterval(timer)
    },
  }
}

async function waitForVolumeCompletion(page) {
  let lastSignature = null
  let lastProgressAt = Date.now()
  let lastSnapshot = null
  const deadline = Date.now() + WALL_BUDGET_MS
  while (Date.now() < deadline) {
    const snapshot = await currentRunSnapshot(page)
    const signature = JSON.stringify(snapshot)
    if (signature !== lastSignature) {
      lastSignature = signature
      lastProgressAt = Date.now()
      lastSnapshot = snapshot
      console.log(`[VOLUME RUN] ${JSON.stringify(snapshot)}`)
    } else if (Date.now() - lastProgressAt >= DEAD_TIMEOUT_MS) {
      throw new Error(`volume generation has no progress for ${DEAD_TIMEOUT_MS}ms: ${JSON.stringify(lastSnapshot)}`)
    } else if (Date.now() - lastProgressAt >= STALLED_TIMEOUT_MS) {
      console.warn(`[STALL WARNING] volume run unchanged for ${Date.now() - lastProgressAt}ms`)
    }
    const stillWorking = snapshot.isGenerating
      || snapshot.status === 'generating'
      || snapshot.runningApiCalls > 0
      || !snapshot.runId
      || snapshot.runStatus === 'running'
    if (stillWorking) {
      await sleep(1000)
      continue
    }
    assert(snapshot.runId, 'volume run trace exists')
    assert(!['running', 'pending'].includes(snapshot.runStatus),
      `volume run reaches a terminal status, got ${snapshot.runStatus}`)
    assert.equal(snapshot.runStatus, 'success',
      `volume run succeeds, got ${snapshot.runStatus}; pipeline status=${snapshot.status}`)
    assert.equal(snapshot.volumeCount, 3, `volume layer generates three volumes, got ${snapshot.volumeCount}`)
    assert.equal(snapshot.runningApiCalls, 0, 'no API call is left running')
    return snapshot
  }
  throw new Error(`volume generation did not finish within ${WALL_BUDGET_MS}ms: ${JSON.stringify(lastSnapshot)}`)
}

async function exportLatestRun(page) {
  const runId = await page.evaluate(() => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])]
      .filter(item => item.source === 'pipeline' && item.step === 2)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    return run?.id || null
  })
  assert(runId, 'volume-layer run trace exists')
  return await page.evaluate(async ({ exportRoot, runId: id }) => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])].find(item => item.id === id)
    const result = await window.electronAPI.runTraceExport({
      schema: 'shenyi.run-trace',
      version: 2,
      run: store.exportRunToJson(run),
      mode: 'deep',
      payloadDirectoryHint: exportRoot,
    })
    return { runId: id, result }
  }, { exportRoot: EXPORT_ROOT, runId })
}

function readExportedRun(exported) {
  assert(exported.result?.success, `deep run trace export succeeds: ${exported.result?.error || 'unknown error'}`)
  const directory = exported.result.path
  const run = JSON.parse(fs.readFileSync(path.join(directory, 'run-trace.json'), 'utf8'))
  return { directory, run }
}

async function copyFileRobust(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  let lastError = null
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      try {
        fs.copyFileSync(source, destination)
      } catch {
        // Windows CopyFile can reject a transient metadata/ACL error even when
        // the bytes are readable. Fall back to an explicit byte stream copy.
        fs.writeFileSync(destination, fs.readFileSync(source))
      }
      assert.equal(
        fs.statSync(destination).size,
        fs.statSync(source).size,
        `evidence copy preserves file size: ${source}`,
      )
      return
    } catch (error) {
      lastError = error
      await sleep(250)
    }
  }
  throw lastError
}

async function copyExportEvidence(directory, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true })
  await copyFileRobust(path.join(directory, 'run-trace.json'), path.join(targetDir, 'run-trace.json'))
  const payloadRoot = path.join(directory, 'payloads')
  if (!fs.existsSync(payloadRoot)) return
  for (const entry of fs.readdirSync(payloadRoot, { withFileTypes: true })) {
    if (!entry.isFile()) throw new Error(`unexpected payload entry: ${path.join(payloadRoot, entry.name)}`)
    await copyFileRobust(path.join(payloadRoot, entry.name), path.join(targetDir, 'payloads', entry.name))
  }
}

function formatMs(value) {
  return `${Math.round(Number(value || 0)).toLocaleString('en-US')}ms`
}

function assertTimingRun(run) {
  assert.equal(run.schemaVersion, 19, `run trace uses schema v19, got ${run.schemaVersion}`)
  assert.equal(run.step, 2, `run is the volume layer, got step ${run.step}`)
  assert.equal(run.status, 'success', `run succeeds, got ${run.status}`)
  assert((run.apiCalls || []).length >= 12,
    `three volumes require at least twelve API calls, got ${(run.apiCalls || []).length}`)
  const physicalCalls = (run.apiCalls || []).flatMap(call => call.physicalCalls || [])
  assert(physicalCalls.length >= (run.apiCalls || []).length,
    `every API call records physical request data, got ${physicalCalls.length}/${(run.apiCalls || []).length}`)
  assert(run.timingLedger, 'run-level timing ledger exists')
  for (const field of [
    'apiCallCount', 'physicalCallCount', 'physicalDurationSumMs',
    'firstTokenSumMs', 'outputSumMs', 'localOverheadSumMs',
    'requestBuildSumMs', 'schemaValidateSumMs', 'retrySumMs', 'postProcessSumMs',
  ]) {
    assert(Number.isFinite(Number(run.timingLedger[field])),
      `run timingLedger.${field} is finite, got ${JSON.stringify(run.timingLedger[field])}`)
  }
  for (const call of run.apiCalls || []) {
    assert(call.timingLedger, `api call ${call.id} records timingLedger`)
    for (const physical of call.physicalCalls || []) {
      assert(Number.isFinite(Number(physical.firstTokenMs)),
        `physical call ${physical.physicalCallId} records firstTokenMs`)
      assert(Number.isFinite(Number(physical.outputMs)),
        `physical call ${physical.physicalCallId} records outputMs`)
    }
  }
}

function assertPhase4Deduplication(run) {
  const historyMarker = '[已生成卷事实清单]'
  const perCallHistoryCounts = []
  for (const call of run.apiCalls || []) {
    const blocks = call.timingLedger?.repeatedPromptBlocks
    assert(blocks, `api call ${call.id} records repeatedPromptBlocks`)
    const historyCount = Number(blocks[historyMarker] || 0)
    perCallHistoryCounts.push(historyCount)
    assert(historyCount <= 1,
      `api call ${call.id} injects the volume history block at most once, got ${historyCount}`)
    for (const [marker, count] of Object.entries(blocks)) {
      assert(Number.isInteger(count) && count >= 0,
        `api call ${call.id} repeatedPromptBlocks[${marker}] is a non-negative integer, got ${JSON.stringify(count)}`)
    }
  }
  assert(perCallHistoryCounts.length > 0, 'volume run records at least one API call')

  const suppressedEvents = (run.events || [])
    .filter(event => event.type === 'duplicate-history-context-suppressed')
  for (const event of suppressedEvents) {
    const detail = parseEventDetail(event.detail)
    assert.equal(detail.duplicateHistoryContextSuppressed, true,
      'duplicate-history-context-suppressed event carries a true audit flag')
    assert(Number.isFinite(Number(detail.promptLength)) && detail.promptLength > 0,
      `suppressed event records promptLength, got ${JSON.stringify(detail.promptLength)}`)
  }
  assert((run.timingLedger?.repeatedPromptBlocks?.[historyMarker] || 0) <= 1,
    'run-level history block count is at most 1')

  const localOverhead = Number(run.timingLedger?.localOverheadSumMs)
  assert(Number.isFinite(localOverhead) && localOverhead >= 0,
    `run localOverheadSumMs is finite and non-negative, got ${JSON.stringify(localOverhead)}`)
}

function assertNoActiveStreamTimeoutRestart(run) {
  const physicalCalls = (run.apiCalls || []).flatMap(call => call.physicalCalls || [])
  assert(physicalCalls.length > 0, 'volume run records physical requests')
  for (const physical of physicalCalls) {
    // Heartbeat is a running-state progress signal, emitted every 15s while a
    // physical request is in flight. A fast success/failure can legitimately
    // finish before the first interval fires; requiring heartbeat=true on every
    // terminal record turns that normal race into a false verifier failure.
    // A long silent request must still prove the renderer loop stayed alive.
    const durationMs = Number(physical.durationMs || 0)
    assert(physical.heartbeat !== true || physical.status === 'success' || physical.status === 'failed',
      `physical call ${physical.physicalCallId} records heartbeat only after observing it`)
    if (
      physical.status === 'success'
      && durationMs >= 16_000
      && physical.firstTokenMs === undefined
      && physical.lastReasoningAt === undefined
    ) {
      assert.equal(physical.heartbeat, true,
        `silent physical call ${physical.physicalCallId} longer than one heartbeat interval reports heartbeat`)
    }
    if (physical.phase !== 'heartbeat_retry') continue
    assert.equal(physical.status, 'success',
      `heartbeat retry ${physical.physicalCallId} succeeds instead of timing out an active stream, got ${physical.status}`)
    assert(Number.isFinite(Number(physical.firstTokenMs)),
      `heartbeat retry ${physical.physicalCallId} records firstTokenMs`)
  }

  // The pre-fix signature was a failed ~600s physical call with streaming output,
  // followed by a full retry. Neither shape may pass this verifier anymore.
  // Reasoning-only streams are a different, task-layer semantic stall: they are
  // classified explicitly and must be followed by the one-shot thinking-disabled
  // retry rather than a generic timeout retry.
  const timeoutFailures = physicalCalls.filter(physical =>
    physical.status === 'failed'
    && Number(physical.durationMs || 0) >= 590_000
    && physical.interruptionCode !== 'reasoning_only_stalled')
  assert.equal(timeoutFailures.length, 0,
    `no active stream is cut by the 600s total timeout, got ${JSON.stringify(timeoutFailures)}`)

  for (const stalled of physicalCalls.filter(physical =>
    physical.status === 'failed' && physical.interruptionCode === 'reasoning_only_stalled')) {
    assert.equal(stalled.phase, 'normal',
      `reasoning-only stall ${stalled.physicalCallId} occurs on the original request, got ${stalled.phase}`)
    assert(Number.isFinite(Number(stalled.bodyAbsentMs)) && Number(stalled.bodyAbsentMs) >= 590_000,
      `reasoning-only stall ${stalled.physicalCallId} records bodyAbsentMs, got ${stalled.bodyAbsentMs}`)
    assert(stalled.firstContentAt === undefined,
      `reasoning-only stall ${stalled.physicalCallId} never received body content`)
    assert(Number.isFinite(Number(stalled.lastReasoningAt)),
      `reasoning-only stall ${stalled.physicalCallId} records reasoning liveness`)
    // Semantic retries are siblings under the same API call: physical-...-0 is
    // the failed original and physical-...-1 is the retry. Their prefixes are
    // not equal, so matching by physicalCallId would always miss the pair.
    const stalledParent = (run.apiCalls || []).find(call =>
      (call.physicalCalls || []).some(physical => physical === stalled))
    assert(stalledParent,
      `reasoning-only stall ${stalled.physicalCallId} has a parent API call`)
    const retry = (stalledParent.physicalCalls || []).find(physical =>
      physical.seq === 2
      && physical.status === 'success'
      && physical.retryStrategy === 'thinking_disabled')
    assert(retry,
      `reasoning-only stall ${stalled.physicalCallId} is followed by one thinking_disabled retry`)
    assert.equal((stalledParent.physicalCalls || []).filter(physical =>
      physical.seq === 2).length, 1,
      `reasoning-only stall ${stalled.physicalCallId} has exactly one semantic retry`)
  }
}

function parseEventDetail(detail) {
  if (!detail) return {}
  if (typeof detail === 'object') return detail
  try {
    return JSON.parse(String(detail))
  } catch {
    return {}
  }
}

function analyzeTiming(run) {
  const ledger = run.timingLedger
  const total = Math.max(1, Number(ledger.physicalDurationSumMs || 0)
    + Number(ledger.localOverheadSumMs || 0))
  const metrics = [
    { key: 'firstTokenSumMs', label: '模型首 token 等待', value: Number(ledger.firstTokenSumMs || 0), kind: 'conclusion' },
    { key: 'outputSumMs', label: '模型流式输出', value: Number(ledger.outputSumMs || 0), kind: 'conclusion' },
    { key: 'localOverheadSumMs', label: '本地/编排等待候选', value: Number(ledger.localOverheadSumMs || 0), kind: 'lead' },
    { key: 'requestBuildSumMs', label: '请求构建', value: Number(ledger.requestBuildSumMs || 0), kind: 'conclusion' },
    { key: 'schemaValidateSumMs', label: 'schema 校验', value: Number(ledger.schemaValidateSumMs || 0), kind: 'conclusion' },
    { key: 'retrySumMs', label: '重试处理', value: Number(ledger.retrySumMs || 0), kind: 'lead' },
    { key: 'postProcessSumMs', label: '后处理', value: Number(ledger.postProcessSumMs || 0), kind: 'conclusion' },
  ].sort((a, b) => b.value - a.value)
  const top3 = metrics.slice(0, 3)
  const failedCalls = (run.apiCalls || []).filter(call => call.status === 'failed').length
  const lines = [
    '# 流水线耗时账本 Phase 2 真实运行分析',
    '',
    `- Run ID: ${run.id}`,
    `- 状态: ${run.status}`,
    `- API call: ${ledger.apiCallCount}`,
    `- 物理请求: ${ledger.physicalCallCount}（重试 ${ledger.retryPhysicalCallCount}）`,
    `- 失败 API call: ${failedCalls}`,
    '',
    '## Top 3',
    '',
  ]
  top3.forEach((metric, index) => {
    lines.push(`${index + 1}. ${metric.label}: ${formatMs(metric.value)}，占物理耗时+本地候选合计的 ${((metric.value / total) * 100).toFixed(1)}%（口径: ${metric.kind === 'conclusion' ? '结论' : '候选线索'}）`)
  })
  lines.push('', '## 全量指标', '')
  for (const metric of metrics) {
    lines.push(`- ${metric.label} (${metric.key}): ${formatMs(metric.value)} — ${metric.kind === 'conclusion' ? '结论' : '候选线索'}`)
  }
  lines.push('', '## 解释边界', '')
  lines.push('- firstTokenSumMs 与 outputSumMs 是模型侧耗时结论。')
  lines.push('- localOverheadSumMs 是候选线索：物理重试可能被重复计入，且混合编排等待，不能直接当本地浪费结论。')
  lines.push('- retrySumMs 需与 retryPhysicalCallCount 一起读，一次合法修复重试不算空转。')
  lines.push('- 本次数据只描述该 run，不直接推出并发或路由改动。')
  return { top3, metrics, text: lines.join('\n') }
}

async function archivePreviousEvidence() {
  if (!fs.existsSync(EVIDENCE_ROOT)) return
  const archiveRoot = path.join(path.dirname(EVIDENCE_ROOT), 'verification-pipeline-timing-ledger-live-archive')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const target = path.join(archiveRoot, stamp)
  fs.mkdirSync(archiveRoot, { recursive: true })
  fs.cpSync(EVIDENCE_ROOT, target, { recursive: true })
  await removeDir(EVIDENCE_ROOT)
  console.log(`[EVIDENCE] archived previous run to ${target}`)
}

async function main() {
  assertFreshRendererBuild()
  await archivePreviousEvidence()
  await removeDir(PROFILE)
  await removeDir(EXPORT_ROOT)
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })

  const apiKey = restoreLiveCredentials()
  assert(apiKey, 'live API credential is available without entering a new key')

  const watchdog = setTimeout(() => {
    console.error(`[FAIL] global timeout after ${GLOBAL_TIMEOUT_MS}ms`)
    process.exit(1)
  }, GLOBAL_TIMEOUT_MS)
  watchdog.unref()

  const electronProcess = startElectron()
  let browser = null
  let heartbeat = null
  try {
    assert(await waitForCdp(), 'CDP reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    const page = await connectPage(browser)
    page.on('pageerror', error => console.error(`[PAGE ERROR] ${error.message}`))
    page.on('crash', () => console.error('[PAGE CRASH] renderer process crashed'))
    page.on('console', message => {
      if (message.type() === 'error') {
        console.error(`[PAGE ERROR] ${String(message.text()).slice(0, 600)}`)
      }
    })
    await page.waitForSelector('#app', { timeout: 20_000 })
    await sleep(1500)

    const volumeSkills = ['l3-s1', 'l3-s2', 'l3-s3', 'l3-s4'].map(folder => loadSkillFolder({
      root: 'D:/codex/玄武规划SKILL/L3-卷纲层',
      folder,
    }))
    await seedApplication(page, apiKey, volumeSkills.map(item => item.skill))
    heartbeat = startHeartbeat(page, electronProcess.pid)

    await selectVolumeSkillsThroughUi(page, volumeSkills.map(item => item.skill))
    await page.click('#btn-pl-gen-volumes')
    let completion = null
    try {
      completion = await waitForVolumeCompletion(page)
    } finally {
      // Preserve evidence before assertions can terminate and clean the profile.
      const failureExport = await exportLatestRun(page)
      const { directory, run } = readExportedRun(failureExport)
      const failureDir = path.join(EVIDENCE_ROOT, 'live-export', 'volume')
      await copyExportEvidence(directory, failureDir)
      fs.writeFileSync(path.join(EVIDENCE_ROOT, 'terminal-status.json'), JSON.stringify({
        schema: 'shenyi.pipeline-timing-ledger.terminal-status',
        version: 1,
        generatedAt: new Date().toISOString(),
        runId: run.id,
        runStatus: run.status,
        completionSnapshot: completion,
        apiCalls: (run.apiCalls || []).map(call => ({
          id: call.id,
          skillName: call.skillName,
          status: call.status,
          finishReason: call.finishReason,
          degradedReason: call.degradedReason || null,
          physicalCallCount: (call.physicalCalls || []).length
        })),
        folderDiagnostics: run.folderDiagnostics || []
      }, null, 2), 'utf8')
      await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'terminal-state.png'), fullPage: false })
    }
    assert.equal(completion.runStatus, 'success', 'volume run finishes successfully')

    const exported = await exportLatestRun(page)
    const { directory, run } = readExportedRun(exported)
    assertTimingRun(run)
    assertPhase4Deduplication(run)
    assertNoActiveStreamTimeoutRestart(run)
    const analysis = analyzeTiming(run)

    const targetDir = path.join(EVIDENCE_ROOT, 'live-export', 'volume')
    await copyExportEvidence(directory, targetDir)
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'timing-analysis.md'), analysis.text, 'utf8')
    await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'final-state.png'), fullPage: false })
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'summary.json'), JSON.stringify({
      schema: 'shenyi.pipeline-timing-ledger.electron-live',
      version: 1,
      generatedAt: new Date().toISOString(),
      script: SCRIPT_NAME,
      model: MODEL,
      baseUrl: BASE_URL,
      projectId: PROJECT_ID,
      runId: run.id,
      runStatus: run.status,
      apiCallCount: run.timingLedger.apiCallCount,
      physicalCallCount: run.timingLedger.physicalCallCount,
      retryPhysicalCallCount: run.timingLedger.retryPhysicalCallCount,
      top3: analysis.top3,
      hardRules: {
        visibleElectron: true,
        realDropdownSelection: '#pl-s3-skill / #pl-s3-add-skill / #pl-s3-skills-list',
        noInjectionImpersonation: true,
        liveCredentialSource: CREDENTIAL_PROFILE,
      },
    }, null, 2), 'utf8')

    console.log('\n===== TIMING TOP 3 =====')
    for (const metric of analysis.top3) {
      console.log(`${metric.label}: ${formatMs(metric.value)} (${metric.key}, ${metric.kind})`)
    }
    console.log('===== PIPELINE TIMING LEDGER ELECTRON LIVE PASSED =====')
  } finally {
    heartbeat?.stop()
    clearTimeout(watchdog)
    try { if (browser) await browser.close() } catch {}
    closeElectron(electronProcess)
    await sleep(800)
    if (!KEEP_PROFILE) {
      await removeDir(PROFILE)
      await removeDir(EXPORT_ROOT)
    }
  }
}

main().catch(error => {
  console.error('[FAIL]', error)
  process.exitCode = 1
})
