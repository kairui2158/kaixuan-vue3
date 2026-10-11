import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createCrashMonitor } from '../src/services/crashMonitor.ts'

const ROOT = path.resolve(process.cwd())
const SCRIPT_NAME = 'verify-single-pass-live-replay.mjs'
const SOURCE_TRACE_ROOT = 'C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-outline-20261009-095906-deep'
const SOURCE_REQUEST = path.join(SOURCE_TRACE_ROOT, 'payloads', '001-request.json')
const CREDENTIAL_PROFILE = path.join(ROOT, '_data', 'outline-lock-override-live-replay-profile')
const CREDENTIAL_FILE = path.join(CREDENTIAL_PROFILE, 'documents-data', 'wa_providers.json')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-single-pass-live-replay')
const SOURCE_SKILL_FOLDER = path.resolve('D:/codex/玄武规划SKILL/L1-大纲层/L1-B-大纲共创主编')
const HOME_VOLUME_ID = 'single-pass-live-home-volume'
const HOME_CHAPTER_ID = 'single-pass-live-home-chapter'
const HOME_TAB_ID = `tab-${HOME_CHAPTER_ID}`
const CASE_FILTER = (process.env.SHENYI_SINGLE_PASS_CASES || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean)
const CDP_PORT = Number(process.env.SHENYI_SINGLE_PASS_CDP_PORT || 9367)
const INACTIVITY_TIMEOUT_MS = Number(process.env.SHENYI_SINGLE_PASS_INACTIVITY_MS || 5 * 60_000)
const MEMORY_SAMPLE_INTERVAL_MS = Number(process.env.SHENYI_SINGLE_PASS_MEMORY_INTERVAL_MS || 5_000)

const CASES = [
  { id: 'outline-no-skill', entry: 'outline', withSkill: false },
  { id: 'outline-with-skill', entry: 'outline', withSkill: true },
  { id: 'home-no-skill', entry: 'home', withSkill: false },
  { id: 'home-with-skill', entry: 'home', withSkill: true },
]
const SELECTED_CASES = CASE_FILTER.length ? CASES.filter(item => CASE_FILTER.includes(item.id)) : CASES
assert(SELECTED_CASES.length > 0, 'at least one live replay case is selected')

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

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function loadLiveCredentials() {
  assert(fs.existsSync(CREDENTIAL_FILE), 'live provider credential file exists')
  const stored = readJson(CREDENTIAL_FILE)
  const provider = (stored?.providers || []).find(item =>
    item?.baseUrl === 'https://openapi.cloud-ai.cn/v1'
    && typeof item?.apiKey === 'string'
    && item.apiKey.startsWith('sk-'))
  assert(provider, 'stored live provider credential is usable')
  return {
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    model: String(provider.selectedModel || provider.models?.[0] || 'deepseek-v4-pro'),
    contextWindowTokens: Number(provider.contextWindowTokens || 1000000),
    maxOutputTokens: Number(provider.maxOutputTokens || 0),
  }
}

function loadSkillFixture() {
  const files = ['SKILL.md', 'template.md', 'meta.json', 'script.js']
  for (const relative of files) {
    assert(fs.existsSync(path.join(SOURCE_SKILL_FOLDER, relative)), `source SKILL file exists: ${relative}`)
  }
  const definition = fs.readFileSync(path.join(SOURCE_SKILL_FOLDER, 'SKILL.md'), 'utf8')
  const idMatch = definition.match(/^id:\s*(\S+)/m)
  assert(idMatch, 'source SKILL id is readable')
  const sourceId = idMatch[1]
  const meta = readJson(path.join(SOURCE_SKILL_FOLDER, 'meta.json'))
  return {
    skillId: `folder:${sourceId}`,
    sourceId,
    skill: {
      id: `folder:${sourceId}`,
      sourceId,
      name: meta.name || 'B-大纲共创主编',
      folderName: 'L1-B-大纲共创主编',
      template: fs.readFileSync(path.join(SOURCE_SKILL_FOLDER, 'template.md'), 'utf8'),
      description: 'B-大纲共创主编（真实 UI 选择）',
      format: 'folder',
      source: 'external',
      category: 'outline',
      executionMode: 'chain',
      outputFormat: 'text',
      sourcePath: path.join(SOURCE_SKILL_FOLDER, 'SKILL.md'),
      folderPath: SOURCE_SKILL_FOLDER,
      validationRules: [],
      splitSize: 1000,
      injectMode: 'system_prefix',
      bindTarget: 'outline-workspace',
      linkedSkillIds: [],
      customVars: {},
      inputSchema: '',
      outputSchema: '',
      retryPolicy: '',
      intents: meta.intents || [],
    },
  }
}

function extractOriginalOutline() {
  assert(fs.existsSync(SOURCE_REQUEST), 'customer source request exists')
  const messages = readJson(SOURCE_REQUEST)
  const context = String(messages.find(message =>
    message?.role === 'system'
    && String(message.content || '').includes('[当前焦点全文]'))?.content || '')
  assert(context, 'customer trace contains the full outline ContextPack')
  const start = context.indexOf('[当前焦点全文]')
  const end = context.indexOf('\n\n当前设定（来源=settings')
  assert(start >= 0 && end > start, 'customer outline boundaries are present')
  const outline = context.slice(start + '[当前焦点全文]'.length, end).trim()
  assert(outline.length > 70000, `customer outline is complete: ${outline.length} chars`)
  return outline
}

function assertFreshRendererBuild() {
  const rendererIndex = path.join(ROOT, 'dist-renderer', 'index.html')
  assert(fs.existsSync(rendererIndex), 'dist-renderer/index.html exists; run npm run build:vue first')
  const indexHtml = fs.readFileSync(rendererIndex, 'utf8')
  const bundles = [...indexHtml.matchAll(/assets\/[^"']+\.js/g)].map(match => match[0])
  assert(bundles.length > 0, 'renderer index references a JS bundle')
  const sourceFiles = []
  const collect = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) collect(full)
      else if (/\.(ts|vue|js|mjs|css)$/.test(entry.name)) sourceFiles.push(full)
    }
  }
  collect(path.join(ROOT, 'src'))
  const newestSourceMs = Math.max(...sourceFiles.map(file => fs.statSync(file).mtimeMs))
  const stale = bundles.filter(name => fs.statSync(path.join(ROOT, 'dist-renderer', name)).mtimeMs < newestSourceMs)
  assert.equal(stale.length, 0, `renderer build is stale: ${stale.join(', ')}`)
}

function startElectron(profile, exportRoot, runLogPath) {
  const electronExe = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
  const child = spawn(electronExe, [
    '.',
    '--enable-precise-memory-info',
    `--remote-debugging-port=${CDP_PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${profile}`,
  ], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SHENYI_ALLOW_TEST_ISOLATION: '1',
      SHENYI_DATA_DIR: path.join(profile, 'documents-data'),
      SHENYI_TEST_USER_DATA_DIR: path.join(profile, 'app-data'),
      SHENYI_TEST_RUN_TRACE_EXPORT: exportRoot,
    },
    windowsHide: false,
  })
  console.log(`[VISIBLE ELECTRON] case pid=${child.pid} port=${CDP_PORT}`)
  child.stdout.on('data', chunk => {
    const text = `[ELECTRON] ${chunk}`
    process.stdout.write(text)
    fs.appendFileSync(runLogPath, text, 'utf8')
  })
  child.stderr.on('data', chunk => {
    const text = `[ELECTRON STDERR] ${chunk}`
    process.stderr.write(text)
    fs.appendFileSync(runLogPath, text, 'utf8')
  })
  return child
}

function stopElectron(child) {
  if (!child || child.exitCode !== null) return
  try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
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

async function seedProject(page, testCase, outline, credentials, skillFixture) {
  const projectId = `single-pass-live-${testCase.id}`
  await page.evaluate(async ({ testCase, projectId, outline, credentials, skill, volumeId, chapterId }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'single-pass-live-provider',
        name: 'Single-pass Live Provider',
        baseUrl: credentials.baseUrl,
        apiKey: credentials.apiKey,
        models: [credentials.model],
        selectedModel: credentials.model,
        temperature: 0.1,
        maxTokens: credentials.maxOutputTokens,
        contextWindowTokens: credentials.contextWindowTokens,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
      }],
      generateProvider: 'single-pass-live-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: `Single-pass ${testCase.id}`,
      outlineText: outline,
      outlineLocked: false,
      outlineLockedText: '',
      bookWordCount: 0,
      volumesConfirmed: false,
      pipelineConfig: { volumeCount: 1, volumeWords: 20000, chapterWords: 2000 },
      chaptersConfirmed: false,
      settingsGenerated: true,
      settings: [],
      volumes: [{
        id: volumeId,
        name: '第一卷',
        outline: '',
        summary: '',
        suggestedWords: 0,
        confirmed: true,
        locked: false,
      }],
      chapters: {
        [volumeId]: [{
          id: chapterId,
          title: '一次成型实测文档',
          plot: '',
          wordCount: outline.length,
          confirm: true,
          body: outline,
          bodyGenerated: true,
        }],
      },
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
    await window.electronAPI.storageWrite('wa_skills', { skills: testCase.withSkill ? [skill] : [] })
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
  }, {
    testCase,
    projectId,
    outline,
    credentials,
    skill: skillFixture.skill,
    volumeId: HOME_VOLUME_ID,
    chapterId: HOME_CHAPTER_ID,
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20_000 })
  await sleep(1500)
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
  await sleep(400)
}

async function openEntry(page, testCase, outline) {
  if (testCase.entry === 'outline') {
    await page.click('#btn-outline-workspace')
    await page.waitForSelector('#outline-editor', { timeout: 20_000 })
    await sleep(400)
    await page.click('#btn-ai-co-create')
    await page.waitForSelector('#ow-chat-input', { timeout: 20_000 })
    await sleep(400)
    const content = await page.evaluate(() => window.__pinia?._s?.get('project')?.outlineText || '')
    assert.equal(content, outline, `${testCase.id}: outline starts from the customer document`)
    return
  }
  if (testCase.entry === 'home') {
    await page.waitForSelector('#chapter-tree .chapter-item', { timeout: 20_000 })
    await page.click('#chapter-tree .chapter-item')
  }
  await page.waitForSelector('#user-input', { timeout: 20_000 })
  const state = await page.evaluate(() => {
    const editor = window.__pinia?._s?.get('editor')
    return {
      activeTabId: editor?.activeTab?.id || null,
      content: editor?.activeTab?.content || '',
      tabs: (editor?.tabs || []).map(tab => tab.id),
    }
  })
  assert.equal(state.activeTabId, HOME_TAB_ID, `${testCase.id}: home editor opens the chapter through the real tree path`)
  assert.equal(state.content, outline, `${testCase.id}: home editor starts from the customer document`)
}

async function selectSkillThroughUi(page, testCase, skillFixture) {
  if (!testCase.withSkill) return
  const selector = testCase.entry === 'outline' ? '#ow-skill-select' : '#co-skill-select'
  await page.waitForSelector(selector, { timeout: 20_000 })
  const optionValues = await page.locator(selector).locator('option').evaluateAll(options =>
    options.map(option => option.value).filter(Boolean))
  assert(optionValues.includes(skillFixture.skillId), `${testCase.id}: real dropdown contains the installed SKILL`)
  await page.selectOption(selector, skillFixture.skillId)
  if (testCase.entry === 'outline') {
    await page.waitForSelector('#ow-selected-skills .ow-skill-chip', { timeout: 20_000 })
  } else {
    await page.waitForFunction(expected => {
      const store = window.__pinia?._s?.get('coCreation')
      return (store?.config?.skillIds || []).includes(expected)
    }, skillFixture.skillId, { timeout: 20_000, polling: 250 })
  }
  console.log(`[SKILL UI SELECTED] ${testCase.id}: ${skillFixture.skillId}`)
}

async function currentContent(page, entry) {
  return entry === 'outline'
    ? page.evaluate(() => window.__pinia?._s?.get('project')?.outlineText || '')
    : page.evaluate(() => window.__pinia?._s?.get('editor')?.activeTab?.content || '')
}

async function rendererMemorySnapshot(page, testCase) {
  try {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Performance.enable')
    const metrics = await cdp.send('Performance.getMetrics')
    const get = name => Number((metrics.metrics || []).find(item => item.name === name)?.value ?? -1)
    const snapshot = {
      at: new Date().toISOString(),
      jsHeapUsedBytes: get('JSHeapUsedSize'),
      jsHeapTotalBytes: get('JSHeapTotalSize'),
      jsHeapLimitBytes: get('JSHeapSizeLimit'),
      documents: get('Documents'),
      nodes: get('Nodes'),
    }
    await cdp.detach()
    return snapshot
  } catch (error) {
    return {
      at: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
      caseId: testCase.id,
    }
  }
}

async function activitySnapshot(page, entry) {
  return await page.evaluate(entryName => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])]
      .filter(item => item.source === entryName)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    const turn = [...(run?.turns || [])].sort((a, b) => b.startedAt - a.startedAt)[0]
    const button = document.querySelector(entryName === 'outline' ? '#btn-ow-send' : '#btn-send')
    return {
      runId: run?.id || null,
      runStatus: run?.status || null,
      turnId: turn?.id || null,
      turnStatus: turn?.status || null,
      sendDisabled: button ? Boolean(button.disabled) : null,
      meaningfulEventSeq: (() => {
        // Periodic liveness diagnostics (heartbeat, throughput, generic run
        // activity) prove the renderer is alive, not that the model is making
        // progress. They must never reset the no-content stall timer.
        const meaningful = (run?.events || []).filter(event => {
          const type = String(event?.type || '')
          return !type.startsWith('physical_call_')
            && !type.startsWith('final-draft-throughput-')
            && type !== 'run-activity'
        })
        return meaningful.reduce((max, item) => Math.max(max, item.seq || 0), 0)
      })(),
      toolArgumentProgress: (() => {
        const active = (run?.apiCalls || []).find(call => call.status === 'running')
        return active?.lastToolArgumentProgress
          ? { ...active.lastToolArgumentProgress, at: active.lastToolArgumentProgressAt || null }
          : null
      })(),
      apiCalls: (run?.apiCalls || []).map(call => ({
        status: call.status,
        finishReason: call.finishReason || null,
        physicalCalls: Array.isArray(call.physicalCalls) ? call.physicalCalls.length : call.physicalCalls,
        toolCalls: (call.toolCalls || []).length,
        streamLength: call.streamText?.length ?? call.responseText?.length ?? 0,
      })),
    }
  }, entry)
}

async function safeActivitySnapshot(page, testCase) {
  try {
    return await activitySnapshot(page, testCase.entry)
  } catch (error) {
    return {
      at: new Date().toISOString(),
      captureError: error instanceof Error ? error.message : String(error),
    }
  }
}

function crashMonitorEvidence(crashMonitor) {
  return {
    crashed: crashMonitor?.crashed ?? null,
    reasons: crashMonitor?.reasons ?? [],
    exitCode: crashMonitor?.exitCode ?? null,
    pageErrors: crashMonitor?.pageErrors ?? [],
  }
}

async function captureTurnFailureEvidence({
  page,
  testCase,
  evidenceDir,
  request,
  error,
  memoryCurve,
  crashMonitor,
  electronRunLogPath,
  before,
  after,
}) {
  const failure = {
    caseId: testCase.id,
    at: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
    request,
    electronRunLog: path.relative(ROOT, electronRunLogPath),
    crashEvidence: crashMonitorEvidence(crashMonitor),
    memoryCurve,
    rendererMemory: memoryCurve.length
      ? {
        samples: memoryCurve.length,
        peakJsHeapUsedBytes: Math.max(...memoryCurve.map(sample => Number(sample.jsHeapUsedBytes ?? -1))),
        peakJsHeapTotalBytes: Math.max(...memoryCurve.map(sample => Number(sample.jsHeapTotalBytes ?? -1))),
        jsHeapLimitBytes: memoryCurve.map(sample => Number(sample.jsHeapLimitBytes ?? -1)).find(value => value >= 0) ?? null,
      }
      : null,
    lastActivitySnapshot: page ? await safeActivitySnapshot(page, testCase) : null,
    turnEvidence: null,
    persistedTrace: null,
    beforeChars: before?.length ?? null,
    afterChars: after?.length ?? null,
  }
  if (page) {
    try {
      failure.turnEvidence = await turnEvidence(page, testCase)
      if (failure.turnEvidence?.runId) {
        failure.persistedTrace = findPersistedRun(
          path.join(ROOT, '_data', `single-pass-live-profile-${testCase.id}`),
          testCase,
          failure.turnEvidence.runId,
        )?.dir || null
      }
    } catch {}
  }
  fs.writeFileSync(path.join(evidenceDir, 'failure-result.json'), JSON.stringify(failure, null, 2), 'utf8')
  return failure
}

async function waitUntilIdle(page, testCase, request) {
  let lastSignature = null
  let lastActivityAt = Date.now()
  let nullSnapshotCount = 0
  let lastMemorySampleAt = 0
  const runtime = { memoryCurve: [] }
  while (true) {
    let snapshot = null
    try {
      snapshot = await Promise.race([
        activitySnapshot(page, testCase.entry),
        sleep(5000).then(() => null),
      ])
    } catch {
      snapshot = null
    }
    const signature = JSON.stringify(snapshot)
    if (!snapshot) {
      nullSnapshotCount += 1
      if (nullSnapshotCount >= 3) {
        throw new Error(`${testCase.id}: renderer stopped responding after ${nullSnapshotCount} activity snapshots (likely renderer crash/OOM)`)
      }
      await sleep(1000)
      continue
    }
    nullSnapshotCount = 0
    if (signature !== lastSignature) {
      lastSignature = signature
      lastActivityAt = Date.now()
      console.log(`[WAIT ${testCase.id}] ${new Date().toISOString()} ${signature.slice(0, 400)}`)
    }
    if (Date.now() - lastMemorySampleAt >= MEMORY_SAMPLE_INTERVAL_MS) {
      lastMemorySampleAt = Date.now()
      const sample = await rendererMemorySnapshot(page, testCase)
      runtime.memoryCurve.push(sample)
      console.log(`[MEMORY ${testCase.id}] ${JSON.stringify(sample)}`)
    }
    const terminal = snapshot
      && snapshot.turnStatus
      && snapshot.turnStatus !== 'running'
      && !(snapshot.apiCalls || []).some(call => call.status === 'running')
      && snapshot.sendDisabled === false
    if (terminal) {
      await page.waitForFunction(entryName => {
        const button = document.querySelector(entryName === 'outline' ? '#btn-ow-send' : '#btn-send')
        return Boolean(button && !button.disabled)
      }, testCase.entry, { timeout: 20_000, polling: 250 })
      await sleep(500)
      return { memoryCurve: runtime.memoryCurve }
    }
    if (Date.now() - lastActivityAt >= INACTIVITY_TIMEOUT_MS) {
      const error = new Error(`${testCase.id}: run inactive for ${INACTIVITY_TIMEOUT_MS}ms: ${signature.slice(0, 2000)}`)
      error.memoryCurve = runtime.memoryCurve
      throw error
    }
    await sleep(1000)
  }
}

async function runTurn(page, testCase, turnRuntime, request, evidenceDir) {
  const electronProcess = turnRuntime.electronProcess
  const before = await currentContent(page, testCase.entry)
  fs.writeFileSync(path.join(evidenceDir, 'before.md'), before, 'utf8')
  const inputSelector = testCase.entry === 'outline' ? '#ow-chat-input' : '#user-input'
  const sendSelector = testCase.entry === 'outline' ? '#btn-ow-send' : '#btn-send'
  const crashMonitor = createCrashMonitor()
  const crashEvidence = crashMonitor
  const recordCrash = reason => console.error(`[CRASH DETECTED ${testCase.id}] ${reason}`)
  page.on('pageerror', error => {
    crashMonitor.pageError(error.message)
    console.error(`[PAGE ERROR ${testCase.id}] ${error.message}`)
  })
  page.on('crash', () => {
    crashMonitor.rendererCrashed()
    recordCrash('renderer page crashed')
  })
  page.context().browser()?.on('disconnected', () => {
    crashMonitor.browserDisconnected()
    if (crashMonitor.crashed) recordCrash(crashMonitor.reasons[0])
  })
  const electronExitHandler = code => {
    crashMonitor.electronExit(code)
    if (crashMonitor.crashed) recordCrash(crashMonitor.reasons[0])
  }
  electronProcess.on('exit', electronExitHandler)
  await page.locator(inputSelector).fill(request)
  await page.locator(inputSelector).evaluate(element =>
    element.dispatchEvent(new Event('change', { bubbles: true })))
  await page.locator(sendSelector).click()
  await page.waitForFunction(({ entryName, text }) => {
    const run = [...(window.__pinia?._s?.get('runTrace')?.runs || [])]
      .filter(item => item.source === entryName)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    return [...(run?.turns || [])].some(turn => turn.userRequest === text)
  }, { entryName: testCase.entry, text: request }, { timeout: 20_000, polling: 250 })
  if (crashEvidence.crashed) {
    throw new Error(`${testCase.id}: renderer/electron crashed before the turn started: ${crashEvidence.reasons.join('; ')}`)
  }
  let memoryCurve = []
  try {
    ({ memoryCurve } = await waitUntilIdle(page, testCase, request))
  } catch (error) {
    const partialCurve = error?.memoryCurve || memoryCurve
    const capturedError = await captureTurnFailureEvidence({
      page,
      testCase,
      evidenceDir,
      request,
      error,
      memoryCurve: partialCurve,
      crashMonitor,
      electronRunLogPath: path.join(evidenceDir, 'electron-run.log'),
      before,
    })
    error.failureEvidence = capturedError
    throw error
  }
  if (crashEvidence.crashed) {
    throw new Error(`${testCase.id}: renderer/electron crashed during the turn: ${crashEvidence.reasons.join('; ')}`)
  }
  if (crashEvidence.pageErrors.length > 0) {
    throw new Error(`${testCase.id}: renderer emitted uncaught errors: ${crashEvidence.pageErrors.join(' | ')}`)
  }
  electronProcess.off('exit', electronExitHandler)
  await page.screenshot({ path: path.join(evidenceDir, 'after.png'), fullPage: true })
  const after = await currentContent(page, testCase.entry)
  fs.writeFileSync(path.join(evidenceDir, 'after.md'), after, 'utf8')
  return { before, after, memoryCurve, crashEvidence }
}

async function turnEvidence(page, testCase) {
  return await page.evaluate(entryName => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])]
      .filter(item => item.source === entryName)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    const turn = [...(run?.turns || [])].sort((a, b) => b.startedAt - a.startedAt)[0]
    const calls = (run?.apiCalls || []).filter(call => call.turnId === turn?.id)
    return {
      runId: run?.id || null,
      turnId: turn?.id || null,
      turnStatus: turn?.status || null,
      turnReason: turn?.reason || null,
      userRequest: turn?.userRequest || null,
      intent: turn?.intent || null,
      turnPermissionDecision: turn?.permissionDecision || null,
      events: (run?.events || [])
        .filter(event => event.turnId === turn?.id)
        .map(event => ({ type: event.type, detail: event.detail })),
      apiCalls: calls.map(call => ({
        status: call.status,
        intent: call.intent || null,
        permissionDecision: call.permissionDecision || null,
        actualToolSurface: call.actualToolSurface || [],
        finishReason: call.finishReason || null,
        durationMs: call.durationMs,
        physicalCalls: Array.isArray(call.physicalCalls) ? call.physicalCalls.length : call.physicalCalls,
        physicalCallDetails: (call.physicalCalls || []).map(physical => ({
          status: physical.status,
          inputTokens: physical.usage?.inputTokens ?? physical.inputTokens ?? null,
          outputTokens: physical.usage?.outputTokens ?? physical.outputTokens ?? null,
        })),
        toolCalls: (call.toolCalls || []).map(tool => ({
          name: tool.name,
          status: tool.status,
          input: tool.input,
          error: tool.error || null,
        })),
      })),
    }
  }, testCase.entry)
}

function findPersistedRun(profile, entry, runId) {
  const root = path.join(profile, 'documents-data', 'run-trace', entry)
  if (!fs.existsSync(root)) return null
  const dirs = fs.readdirSync(root, { withFileTypes: true })
    .filter(item => item.isDirectory())
    .map(item => path.join(root, item.name))
  for (const dir of dirs) {
    const file = path.join(dir, 'run-trace.json')
    if (!fs.existsSync(file)) continue
    try {
      if (readJson(file)?.id === runId) return { dir, file }
    } catch {}
  }
  return null
}

async function persistedRun(profile, testCase, runId) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const match = findPersistedRun(profile, testCase.entry, runId)
    if (match) return match
    await sleep(500)
  }
  assert(false, `${testCase.id}: run trace persists within 20s`)
}

function payloadFiles(dir) {
  const payloadRoot = path.join(dir, 'payloads')
  if (!fs.existsSync(payloadRoot)) return []
  return fs.readdirSync(payloadRoot)
    .filter(name => name.endsWith('-request.json'))
    .map(name => path.join(payloadRoot, name))
}

function assertSinglePassCase(testCase, evidence, persisted, outline) {
  const label = testCase.id
  assert.equal(evidence.turnStatus, 'success', `${label}: turn reaches success`)
  assert.notEqual(evidence.after, evidence.before, `${label}: document physically changes`)
  assert.equal(evidence.turnReason, 'final_draft_complete', `${label}: turn reaches the final-draft completion state`)
  assert(
    evidence.events.some(event =>
      event.type === 'final-draft-mode-selected' || event.type === 'final-draft-created'),
    `${label}: run selects the whole-document final-draft mode`,
  )
  assert(
    evidence.events.some(event => event.type === 'final-draft-draft-deduplicated'),
    `${label}: authorized duplicate cleanup executes before the app-owned write`,
  )
  assert(
    evidence.events.some(event => event.type === 'final-draft-write-succeeded'),
    `${label}: app-owned whole-document write succeeds`,
  )
  assert(evidence.apiCalls.length > 0, `${label}: API call is recorded`)
  const toolCalls = evidence.apiCalls.flatMap(call => call.toolCalls || [])
  assert.equal(toolCalls.length, 0, `${label}: no model tool calls execute in single-pass prose mode`)
  const physicalCalls = evidence.apiCalls.reduce((sum, call) =>
    sum + (typeof call.physicalCalls === 'number' ? call.physicalCalls : 0), 0)
  assert(physicalCalls >= 1 && physicalCalls <= 4, `${label}: physical requests stay in the single-pass safety net (${physicalCalls})`)
  assert(
    evidence.apiCalls.every(call => (call.actualToolSurface || [])
      .length === 0),
    `${label}: model tool surface stays empty in single-pass prose mode`,
  )
  const files = payloadFiles(persisted.dir)
  assert(files.length > 0, `${label}: persisted request payloads exist`)
  const outlineSamples = [0, 0.25, 0.5, 0.75, 1].map(ratio => {
    const start = Math.max(0, Math.min(outline.length - 300, Math.floor(outline.length * ratio)))
    return outline.slice(start, start + 300)
  })
  const requestCarriesFullDocument = file => {
    const request = JSON.parse(fs.readFileSync(file, 'utf8'))
    const messages = Array.isArray(request?.messages)
      ? request.messages
      : Array.isArray(request)
        ? request
        : []
    return messages.some(message => {
      const content = message?.content
      const text = typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content.map(part => typeof part?.text === 'string' ? part.text : '').join('')
          : ''
      return text.length >= outline.length
        && outlineSamples.every(sample => text.includes(sample))
    })
  }
  const fullContextRequests = files.filter(requestCarriesFullDocument)
  assert(fullContextRequests.length > 0, `${label}: at least one provider request carries the injected full document`)
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
    assert(!text.includes('需要细节时必须先读取节点内容'), `${label}: old read guidance is absent`)
    assert(!text.includes('禁止使用 replace_document'), `${label}: old replace_document prohibition is absent`)
  }
}

async function runCase(testCase, outline, credentials, skillFixture) {
  const evidenceDir = path.join(EVIDENCE_ROOT, testCase.id)
  const profile = path.join(ROOT, '_data', `single-pass-live-profile-${testCase.id}`)
  const exportRoot = path.join(ROOT, '_data', `single-pass-live-exports-${testCase.id}`)
  const runLogPath = path.join(evidenceDir, 'electron-run.log')
  await removeDir(evidenceDir)
  await removeDir(profile)
  await removeDir(exportRoot)
  fs.mkdirSync(evidenceDir, { recursive: true })
  fs.mkdirSync(path.join(profile, 'app-data'), { recursive: true })
  fs.mkdirSync(exportRoot, { recursive: true })

  const request = '请对全文做一次完整整理重排：按叙事逻辑重新排序，合并或删除重复项，统一中文标点和标题层级，按Word文档格式整理。'
  const electronProcess = startElectron(profile, exportRoot, runLogPath)
  const turnRuntime = { electronProcess }
  const result = { caseId: testCase.id, entry: testCase.entry, withSkill: testCase.withSkill, request }
  let browser = null
  let page = null
  let memoryCurve = []
  let crashEvidence = null
  let before = null
  let after = null
  try {
    assert(await waitForCdp(), `${testCase.id}: CDP reachable`)
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    for (let attempt = 0; attempt < 24 && !page; attempt++) {
      page = browser.contexts()[0]?.pages()?.[0] || null
      if (!page) await sleep(500)
    }
    assert(page, `${testCase.id}: renderer page reachable`)
    page.on('pageerror', error => console.log(`[PAGE ERROR ${testCase.id}] ${error.message}`))
    await page.waitForSelector('#app', { timeout: 20_000 })
    await sleep(1500)
    await seedProject(page, testCase, outline, credentials, skillFixture)
    await openEntry(page, testCase, outline)
    await selectSkillThroughUi(page, testCase, skillFixture)
    await page.screenshot({ path: path.join(evidenceDir, 'before.png'), fullPage: true })
    ;({ before, after, memoryCurve, crashEvidence } = await runTurn(page, testCase, turnRuntime, request, evidenceDir))
    const crashMonitor = crashEvidence
    const evidence = await turnEvidence(page, testCase)
    const persisted = await persistedRun(profile, testCase, evidence.runId)
    fs.cpSync(persisted.dir, path.join(evidenceDir, 'run-trace'), { recursive: true })
    assertSinglePassCase(testCase, { ...evidence, before, after }, persisted, outline)
    result.runId = evidence.runId
    result.turnId = evidence.turnId
    result.turnStatus = evidence.turnStatus
    result.intent = evidence.intent
    result.turnReason = evidence.turnReason
    result.physicalCalls = evidence.apiCalls.reduce((sum, call) =>
      sum + (typeof call.physicalCalls === 'number' ? call.physicalCalls : 0), 0)
    result.toolCalls = evidence.apiCalls.flatMap(call => (call.toolCalls || []).map(tool => tool.name))
    result.finishReasons = evidence.apiCalls.map(call => call.finishReason)
    result.beforeChars = before.length
    result.afterChars = after.length
    result.durationMs = evidence.apiCalls.reduce((sum, call) => sum + (call.durationMs || 0), 0)
    result.rendererMemory = {
      samples: memoryCurve.length,
      peakJsHeapUsedBytes: Math.max(...memoryCurve.map(sample => Number(sample.jsHeapUsedBytes ?? -1))),
      peakJsHeapTotalBytes: Math.max(...memoryCurve.map(sample => Number(sample.jsHeapTotalBytes ?? -1))),
      jsHeapLimitBytes: memoryCurve.map(sample => Number(sample.jsHeapLimitBytes ?? -1)).find(value => value >= 0) ?? null,
      crashed: crashEvidence.crashed,
      crashReasons: crashEvidence.reasons,
      pageErrors: crashEvidence.pageErrors,
    }
    // Freeze the case evidence before intentional teardown; browser.close()
    // and process termination must never retroactively mark a passed case as
    // crashed in renderer-memory.json or verification-result.json.
    const frozenCrashEvidence = {
      crashed: crashEvidence.crashed,
      reasons: crashEvidence.reasons,
      exitCode: crashEvidence.exitCode,
      pageErrors: crashEvidence.pageErrors,
    }
    fs.writeFileSync(path.join(evidenceDir, 'renderer-memory.json'), JSON.stringify({ curve: memoryCurve, crashEvidence: frozenCrashEvidence }, null, 2), 'utf8')
    result.persistedTrace = path.relative(ROOT, path.join(evidenceDir, 'run-trace'))
    fs.writeFileSync(path.join(evidenceDir, 'turn-evidence.json'), JSON.stringify(evidence, null, 2), 'utf8')
    fs.writeFileSync(path.join(evidenceDir, 'case-result.json'), JSON.stringify(result, null, 2), 'utf8')
    if (fs.existsSync(path.join(evidenceDir, 'failure-result.json'))) {
      fs.rmSync(path.join(evidenceDir, 'failure-result.json'), { force: true })
    }
    turnRuntime.crashMonitor = crashMonitor
    console.log(`[CASE PASS] ${JSON.stringify(result)}`)
    return result
  } catch (error) {
    await captureTurnFailureEvidence({
      page,
      testCase,
      evidenceDir,
      request,
      error,
      memoryCurve,
      crashMonitor: crashEvidence || turnRuntime.crashMonitor,
      electronRunLogPath: runLogPath,
      before,
      after,
    })
    throw error
  } finally {
    turnRuntime.crashMonitor?.beginTeardown()
    try { if (browser) await browser.close() } catch {}
    stopElectron(electronProcess)
    await sleep(1000)
  }
}

async function main() {
  assertFreshRendererBuild()
  const credentials = loadLiveCredentials()
  const skillFixture = loadSkillFixture()
  const outline = extractOriginalOutline()
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  fs.writeFileSync(path.join(EVIDENCE_ROOT, 'original-outline.md'), outline, 'utf8')
  const summary = {
    script: SCRIPT_NAME,
    generatedAt: new Date().toISOString(),
    provider: { baseUrl: credentials.baseUrl, model: credentials.model },
    sourceTrace: path.join(SOURCE_TRACE_ROOT, 'run-trace.json'),
    outlineChars: outline.length,
    cases: [],
  }
  if (fs.existsSync(path.join(EVIDENCE_ROOT, 'verification-result.json'))) {
    try {
      const previous = readJson(path.join(EVIDENCE_ROOT, 'verification-result.json'))
      const previousCases = Array.isArray(previous?.cases) ? previous.cases : []
      summary.cases.push(...previousCases.filter(item => !SELECTED_CASES.some(testCase => testCase.id === item?.caseId)))
    } catch {}
  }
  for (const testCase of SELECTED_CASES) {
    summary.cases.push(await runCase(testCase, outline, credentials, skillFixture))
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'verification-result.json'), JSON.stringify(summary, null, 2), 'utf8')
  }
  fs.writeFileSync(path.join(EVIDENCE_ROOT, 'verification-result.json'), JSON.stringify(summary, null, 2), 'utf8')
  console.log(`===== SINGLE-PASS LIVE REPLAY PASSED (${SELECTED_CASES.map(item => item.id).join(', ')}) =====`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
