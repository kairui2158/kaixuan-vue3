import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const ROOT = path.resolve(process.cwd())
const SCRIPT_NAME = 'verify-pipeline-artifact-contracts-electron.mjs'
const ELECTRON_EXE = process.env.SHENYI_ARTIFACT_CONTRACT_ELECTRON
  ? path.resolve(process.env.SHENYI_ARTIFACT_CONTRACT_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_ARTIFACT_CONTRACT_CDP_PORT || 9351)
const PROFILE = path.join(ROOT, '_data', 'pipeline-artifact-contract-live-profile')
const DATA_DIR = path.join(PROFILE, 'documents-data')
const EXPORT_ROOT = path.join(ROOT, '_data', 'pipeline-artifact-contract-live-exports')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-pipeline-artifact-contract-live')
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const HEARTBEAT_PATH = path.join(EVIDENCE_ROOT, 'heartbeat.jsonl')
const PROJECT_ID = 'pipeline-artifact-contract-live'
const MODEL = process.env.SHENYI_LIVE_MODEL || 'deepseek-v4-pro'
const BASE_URL = process.env.SHENYI_LIVE_BASE_URL || 'https://openapi.cloud-ai.cn/v1'
const CREDENTIAL_PROFILE = path.join(ROOT, '_data', 'outline-lock-override-live-replay-profile')
const STEP_TIMEOUT_MS = Number(process.env.SHENYI_ARTIFACT_CONTRACT_STEP_TIMEOUT_MS || 8 * 60_000)
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_ARTIFACT_CONTRACT_GLOBAL_TIMEOUT_MS || 90 * 60_000)
const HEARTBEAT_INTERVAL_MS = Number(process.env.SHENYI_ARTIFACT_CONTRACT_HEARTBEAT_INTERVAL_MS || 10_000)
const STALLED_TIMEOUT_MS = Number(process.env.SHENYI_ARTIFACT_CONTRACT_STALLED_TIMEOUT_MS || 2 * 60_000)
const DEAD_TIMEOUT_MS = Number(process.env.SHENYI_ARTIFACT_CONTRACT_DEAD_TIMEOUT_MS || 5 * 60_000)
const KEEP_PROFILE = process.env.SHENYI_ARTIFACT_CONTRACT_KEEP_PROFILE === '1'
const RUN_TRACE_SCHEMA_VERSION = 19
const { safeStorage } = require('electron')

function bodyGeneratorContractSentence(targetWords) {
  const target = Number(targetWords)
  if (!Number.isFinite(target) || target <= 0) return ''
  const min = Math.round(target * 0.8)
  const max = target * 2
  return `请生成本章节正文，目标约${target}字（不低于${min}字，不超过${max}字）。正文本体后必须追加【正文交接】区块。`
}

const SKILL_SOURCES = [
  { layer: 'settings', root: 'D:/codex/玄武规划SKILL/L2-设定层', folder: 'l2-s1' },
  { layer: 'volume', root: 'D:/codex/玄武规划SKILL/L3-卷纲层', folder: 'l3-s1' },
  { layer: 'volume', root: 'D:/codex/玄武规划SKILL/L3-卷纲层', folder: 'l3-s2' },
  { layer: 'volume', root: 'D:/codex/玄武规划SKILL/L3-卷纲层', folder: 'l3-s3' },
  { layer: 'volume', root: 'D:/codex/玄武规划SKILL/L3-卷纲层', folder: 'l3-s4' },
  { layer: 'body', root: 'D:/codex/玄武规划SKILL/凯旋-正文层', folder: 'kaixuan-s1' },
  { layer: 'body', root: 'D:/codex/玄武规划SKILL/凯旋-正文层', folder: 'kaixuan-s2' },
  { layer: 'body', root: 'D:/codex/玄武规划SKILL/凯旋-正文层', folder: 'kaixuan-s3' },
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

function loadSkillFolder({ root, folder, layer }) {
  const folderPath = path.join(root, folder)
  const definitionPath = path.join(folderPath, 'SKILL.md')
  const definition = fs.readFileSync(definitionPath, 'utf8')
  const idMatch = definition.match(/^id:\s*(\S+)/m)
  assert(idMatch, `${layer} ${folder}: SKILL.md exposes an id`)
  const nameMatch = definition.match(/^name:\s*(.+)$/m)
  const templatePath = path.join(folderPath, 'template.md')
  assert(fs.existsSync(templatePath), `${layer} ${folder}: template.md exists`)
  const meta = JSON.parse(fs.readFileSync(path.join(folderPath, 'meta.json'), 'utf8'))
  const sourceId = idMatch[1]
  const samplesPath = path.join(folderPath, 'samples.txt')
  const samples = fs.existsSync(samplesPath) ? fs.readFileSync(samplesPath, 'utf8') : ''
  return {
    layer,
    sourceId,
    skill: {
      id: `folder:${sourceId}`,
      sourceId,
      name: nameMatch ? nameMatch[1].trim() : folder,
      template: fs.readFileSync(templatePath, 'utf8'),
      description: `${layer} live artifact-contract skill`,
      format: 'folder',
      source: 'external',
      category: 'folder',
      folderPath,
      executionMode: meta.executionMode === 'default' ? 'chain' : (meta.executionMode || 'chain'),
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
      intents: meta.intents || ['generate'],
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

const OUTLINE_TEXT = [
  '# 流水线产物契约统一实测大纲',
  '全书围绕灯塔、旧航道和南方航线展开，主角在风暴纪元中逐步揭示家族信物的真相。',
  '第一卷 风暴起点：旧信、灯塔与南方航线共同推动第一卷冲突，主角完成第一次远航。',
  '第二卷 雾中港：港口交易、旧盟约与失踪船队让矛盾升级，主角必须选择立场。',
  '第三卷 南方航线：航路贯通、家族真相与风暴信标合流，完成第一阶段的远航闭环。',
].join('\n')

async function seedApplication(page, apiKey, skills) {
  await page.evaluate(async ({ apiKey, baseUrl, model, projectId, seededSkills, outline }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'pipeline-artifact-live-provider',
        name: 'Pipeline Artifact Live Provider',
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
      generateProvider: 'pipeline-artifact-live-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: '流水线产物契约统一真实UI实测',
      outlineText: outline,
      outlineLocked: false,
      outlineLockedText: '',
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
    await window.electronAPI.storageWrite('wa_appSettings', {
      fontSize: 14,
      uiFontSize: 14,
      editorFont: 'lxgw-wenkai',
      chatInputMode: 'enter-send',
      autoSaveInterval: 30,
      maxTabs: 20,
      cdpPort: 9223,
      memoryExtractionTimeoutSeconds: 300,
      autoExtractMemory: true,
      githubToken: ''
    })
    await window.electronAPI.storageRemove('wa_pipeline_breakpoint')
  }, {
    apiKey,
    baseUrl: BASE_URL,
    model: MODEL,
    projectId: PROJECT_ID,
    seededSkills: skills.map(item => item.skill),
    outline: OUTLINE_TEXT,
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20_000 })
  await sleep(1500)
  await closeProjectModal(page)
}

async function selectSkillsThroughUi(page, { stepIndex, selectId, addId, listId, skills, modeSelectId }) {
  await page.locator('#pl-steps .pl-step').nth(stepIndex).click()
  await page.waitForSelector(`#pl-step-${stepIndex + 1}-content`, { state: 'visible' })
  await page.selectOption(modeSelectId, 'chain')
  const existingCount = await page.locator(`${listId} .pl-skill-chip`).count()
  for (let index = existingCount - 1; index >= 0; index -= 1) {
    await page.locator(`${listId} .pl-skill-chip`).nth(index)
      .locator('.pl-chip-close').click()
  }
  for (const skill of skills) {
    await page.selectOption(selectId, skill.id)
    await page.click(addId)
    await page.waitForFunction(({ targetListId, skillName, expectedCount }) => {
      const chips = [...document.querySelectorAll(`${targetListId} .pl-skill-chip`)]
      return chips.length === expectedCount
        && chips.some(chip => (chip.textContent || '').includes(skillName))
    }, {
      targetListId: listId,
      skillName: skill.name,
      expectedCount: skills.indexOf(skill) + 1,
    }, { timeout: 10_000, polling: 250 })
  }
  const selected = await page.evaluate(targetListId =>
    [...document.querySelectorAll(`${targetListId} .pl-skill-chip`)]
      .map(chip => (chip.textContent || '').trim()), listId)
  assert.equal(selected.length, skills.length,
    `${skills.length} SKILL(s) are selected through the real ${listId} dropdown`)
  for (const [index, skill] of skills.entries()) {
    assert(selected[index].includes(skill.name),
      `${skill.name} is selected in order through ${listId}; got ${JSON.stringify(selected)}`)
    console.log(`[SKILL UI SELECTED] ${skill.id} (${skill.name}) in ${listId}`)
  }
}

function currentRunSnapshot(page, expectedStep) {
  return page.evaluate(stepNumber => {
    const store = window.__pinia?._s?.get('runTrace')
    const pipeline = window.__pinia?._s?.get('pipeline')
    const project = window.__pinia?._s?.get('project')
    const layerByStep = { 0: 'outline', 1: 'settings', 2: 'volumes', 3: 'chapters', 4: 'body' }
    const activeLayerRun = stepNumber === 1
      ? pipeline?.activeSettingsRun
      : stepNumber === 2
        ? pipeline?.activeVolumesRun
        : stepNumber === 3
          ? pipeline?.activeChaptersRun
          : stepNumber === 4
            ? pipeline?.activeBodyRun
            : null
    const run = [...(store?.runs || [])]
      .filter(item => item.source === 'pipeline' && item.step === stepNumber)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    const events = run?.events || []
    // Transport heartbeats prove the socket is alive, not that the task is
    // progressing. Mirror toolRunSupervisor.physicalCallReportsProgress: only
    // stream/reasoning/tool content or a state change may reset idle timers.
    const meaningfulEvents = events.filter(event => {
      if (event.type !== 'run-activity') return true
      return event?.payload?.source !== 'physical_call_heartbeat'
    })
    const progressEvents = meaningfulEvents.filter(event => {
      if (event.type === 'run-activity') {
        return event?.payload?.source !== 'physical_call_running'
      }
      return event.type === 'stream-delta'
        || event.type === 'physical-call'
        || event.type === 'chain-step'
        || event.type === 'state-transition'
        || event.type === 'api-start'
        || event.type === 'api-success'
        || event.type === 'volume-batch-attempt'
        || event.type === 'volume-batch-validated'
        || event.type === 'write'
        || event.type === 'finished'
    })
    const apiCalls = run?.apiCalls || []
    const physicalProgress = apiCalls.some(call => {
      if (call.status === 'success' || call.status === 'failed' || call.status === 'canceled') return true
      return Boolean(
        (call.physicalCalls || []).some(physical =>
          physical.status === 'success'
          || physical.status === 'failed'
          || physical.status === 'canceled'
          || (physical.status === 'running' && Boolean(
            physical.streamText
            || physical.reasoningText
            || physical.responseText
          ))
        )
      )
    })
    const eventProgressAt = Math.max(
      0,
      ...meaningfulEvents.map(event => Number(event?.ts) || 0),
      ...apiCalls.map(call => Number(call?.lastStreamActivityAt) || 0),
      ...apiCalls.map(call => Number(call?.lastToolArgumentProgressAt) || 0),
      ...apiCalls.map(call => Number(call?.lastExecutionActivityAt) || 0),
    )
    return {
      runId: run?.id || null,
      runStatus: run?.status || null,
      events: meaningfulEvents.length,
      lastEventType: meaningfulEvents.at(-1)?.type || null,
      progressEvents: progressEvents.length,
      lastProgressEventType: progressEvents.at(-1)?.type || null,
      physicalProgress,
      lastProgressAtMs: eventProgressAt || null,
      apiCalls: apiCalls.length,
      runningApiCalls: apiCalls.filter(call => call.status === 'running').length,
      progress: activeLayerRun?.progress ?? null,
      status: activeLayerRun?.statusText || null,
      pipelineRunStatus: activeLayerRun?.status || null,
      isGenerating: Boolean(pipeline?.isGenerating),
      settingsGenerated: Boolean(project?.settingsGenerated),
      volumeCount: (project?.volumes || []).length,
      chapterCount: Object.keys(project?.chapters || {}).reduce((total, key) =>
        total + ((project?.chapters?.[key] || []).length), 0),
      lastLog: (window.__pinia?._s?.get('executionLog')?.logs || []).at(-1)?.message || null,
    }
  }, expectedStep)
}

function startHeartbeat(page, electronPid) {
  let stopped = false
  const timer = setInterval(async () => {
    if (stopped) return
    try {
      const settings = await currentRunSnapshot(page, 1)
      const volume = await currentRunSnapshot(page, 2)
      const body = await currentRunSnapshot(page, 4)
      const outline = await currentRunSnapshot(page, 0)
      const chapter = await currentRunSnapshot(page, 3)
      const memory = await page.evaluate(() => ({
        previewVisible: Boolean(document.querySelector('[data-modal-id="pl-memory-preview"]')),
        previewLoading: Boolean(globalThis.__pipelinePanelState?.memoryPreviewLoading),
        previewSaving: Boolean(globalThis.__pipelinePanelState?.memoryPreviewSaving),
      })).catch(() => ({}))
      const state = {
        at: new Date().toISOString(),
        electronPid,
        outline,
        settings,
        volume,
        chapter,
        body,
        memory,
      }
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

async function waitForLayerCompletion(page, {
  step,
  isFinished,
  isFailed,
  describeState,
  timeoutMs = STEP_TIMEOUT_MS,
}) {
  let lastSignature = null
  let lastProgressAt = Date.now()
  let lastSnapshot = null
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const snapshot = await currentRunSnapshot(page, step)
    const progressSignature = JSON.stringify({
      runId: snapshot.runId,
      runStatus: snapshot.runStatus,
      events: snapshot.events,
      lastEventType: snapshot.lastEventType,
      progressEvents: snapshot.progressEvents,
      lastProgressEventType: snapshot.lastProgressEventType,
      physicalProgress: snapshot.physicalProgress,
      lastProgressAtMs: snapshot.lastProgressAtMs,
      apiCalls: snapshot.apiCalls,
      runningApiCalls: snapshot.runningApiCalls,
      progress: snapshot.progress,
      status: snapshot.status,
      isGenerating: snapshot.isGenerating,
      settingsGenerated: snapshot.settingsGenerated,
      volumeCount: snapshot.volumeCount,
      chapterCount: snapshot.chapterCount,
      lastLog: snapshot.lastLog,
    })
    if (progressSignature !== lastSignature) {
      lastSignature = progressSignature
      lastProgressAt = Date.now()
      lastSnapshot = snapshot
      console.log(`[STEP ${step}] ${JSON.stringify(snapshot)}`)
    } else if (Date.now() - lastProgressAt >= DEAD_TIMEOUT_MS) {
      throw new Error(`step ${step} has no progress for ${DEAD_TIMEOUT_MS}ms: ${JSON.stringify(lastSnapshot)}`)
    } else if (Date.now() - lastProgressAt >= STALLED_TIMEOUT_MS) {
      console.warn(`[STALL WARNING] step ${step} unchanged for ${Date.now() - lastProgressAt}ms`)
    }
    if (isFailed(snapshot)) {
      throw new Error(`step ${step} failed: ${JSON.stringify(snapshot)}`)
    }
    if (!snapshot.isGenerating && snapshot.status !== 'generating' && isFinished(snapshot)) {
      return snapshot
    }
    await sleep(1000)
  }
  throw new Error(`step ${step} did not finish within ${timeoutMs}ms: ${describeState ? describeState() : JSON.stringify(lastSnapshot)}`)
}

async function confirmSettingsThroughUi(page) {
  await page.click('#btn-pl-confirm-settings')
  await sleep(600)
}

async function confirmOutlineThroughUi(page) {
  await page.locator('#pl-steps .pl-step').nth(0).click()
  await page.waitForSelector('#pl-step-1-content', { state: 'visible' })
  await page.click('#btn-pl-confirm-outline')
  const snapshot = await waitForLayerCompletion(page, {
    step: 0,
    isFinished: state => state.runStatus === 'success' || state.runStatus === 'degraded',
    isFailed: state => state.status?.startsWith('failed:'),
  })
  assert(snapshot.runStatus === 'success' || snapshot.runStatus === 'degraded',
    `outline style analysis reaches a terminal state, got ${snapshot.runStatus}`)
  return snapshot
}

async function confirmVolumesThroughUi(page) {
  if (!(await page.locator('#btn-pl-bind-volume-0').isVisible())) {
    await page.locator('#pl-steps .pl-step').nth(2).click()
    await page.waitForSelector('#pl-step-3-content', { state: 'visible' })
  }
  const count = await page.locator('#pl-s3-skills-list .pl-skill-chip').count()
  assert.equal(count, 4, 'all four volume SKILL chips remain selected before confirming')
  const volumeCount = await page.evaluate(() =>
    (window.__pinia?._s?.get('project')?.volumes || []).length)
  assert.equal(volumeCount, 3, 'three volumes exist before manual confirmation')
  for (let index = 0; index < volumeCount; index++) {
    const before = await page.evaluate(({ i }) => {
      const volume = window.__pinia?._s?.get('project')?.volumes?.[i]
      return { confirmed: Boolean(volume?.confirmed), bound: Boolean(volume?.isBound) }
    }, { i: index })
    if (!before.confirmed) {
      await page.click(`#btn-pl-edit-volume-${index}`)
      await page.waitForSelector(`#pl-volume-editor-${index}`, { state: 'visible' })
      await page.click(`#btn-pl-save-volume-${index}`)
      await page.waitForFunction(({ i }) => {
        const volume = window.__pinia?._s?.get('project')?.volumes?.[i]
        return Boolean(volume?.confirmed && volume?.locked)
      }, { i: index }, { timeout: 10_000, polling: 100 })
    }
    if (!before.bound) {
      await page.click(`#btn-pl-bind-volume-${index}`)
      await page.waitForFunction(({ i }) =>
        window.__pinia?._s?.get('project')?.volumes?.[i]?.isBound === true,
        { i: index }, { timeout: 10_000, polling: 100 })
    }
  }
  await page.click('#btn-pl-confirm-volumes')
  await page.waitForFunction(() =>
    window.__pinia?._s?.get('project')?.volumesConfirmed === true, undefined,
    { timeout: 10_000, polling: 100 })
  const boundVolumeCount = await page.evaluate(() =>
    (window.__pinia?._s?.get('project')?.volumes || []).filter(volume => volume?.isBound).length)
  assert.equal(boundVolumeCount, volumeCount, 'all volumes are bound to the chapter layer')
}

async function inspectResumableProfile(page, expectedSkillIds, expectedBodySkillIds) {
  const storedSkillState = await page.evaluate(() =>
    window.electronAPI.storageRead('wa_skills'))
  const storedStepConfig = await page.evaluate(() =>
    window.electronAPI.storageRead('wa_pipeline_step_config'))
  return await page.evaluate(({ projectId, expectedSkillIds, expectedBodySkillIds, skillState, stepConfig }) => {
    const normalizeText = value => (typeof value === 'string' ? value.trim() : String(value || '').trim())
    const normalizeWords = value => {
      const num = Number(value)
      if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) return null
      return num
    }
    const project = window.__pinia?._s?.get('project')
    const rawProject = window.electronAPI
      ? { outlineLocked: project?.outlineLocked, volumes: project?.volumes, volumesConfirmed: project?.volumesConfirmed }
      : null
    if (!rawProject || project?.currentProjectId !== projectId) {
      return { resumable: false, reason: 'projectId mismatch' }
    }
    if (!project?.outlineLocked || !normalizeText(project?.outlineLockedText)) {
      return { resumable: false, reason: 'outline is not locked' }
    }
    if (!project?.volumesConfirmed) {
      return { resumable: false, reason: 'volumes are not confirmed' }
    }
    const volumes = Array.isArray(project?.volumes) ? project.volumes : []
    if (volumes.length !== 3) {
      return { resumable: false, reason: `volume count is ${volumes.length}, expected 3` }
    }
    const names = new Set()
    for (const [index, volume] of volumes.entries()) {
      const name = normalizeText(volume?.name)
      const outline = normalizeText(volume?.outline) || normalizeText(volume?.summary)
      if (!name) return { resumable: false, reason: `volume ${index + 1} has no name` }
      if (names.has(name)) return { resumable: false, reason: `duplicate volume name: ${name}` }
      names.add(name)
      if (!outline) return { resumable: false, reason: `volume ${name} has no outline` }
      if (normalizeWords(volume?.allocatedWords ?? volume?.suggestedWords) === null) {
        return { resumable: false, reason: `volume ${name} has invalid allocated words` }
      }
    }

    const availableIds = new Set((skillState?.skills || []).map(skill => skill?.id).filter(Boolean))
    for (const skillId of expectedSkillIds) {
      if (!availableIds.has(skillId)) {
        return { resumable: false, reason: `required SKILL is unavailable: ${skillId}` }
      }
    }
    const volumeSkillIds = stepConfig?.skills?.[2]
    if (!Array.isArray(volumeSkillIds) || volumeSkillIds.length !== expectedSkillIds.length
      || !expectedSkillIds.every(skillId => volumeSkillIds.includes(skillId))) {
      return { resumable: false, reason: 'volume step SKILL bindings are incomplete' }
    }
    const bodySkillIds = stepConfig?.skills?.[4]
    if (!Array.isArray(bodySkillIds) || bodySkillIds.length !== expectedBodySkillIds.length
      || !expectedBodySkillIds.every(skillId => bodySkillIds.includes(skillId))) {
      return { resumable: false, reason: 'body step SKILL bindings are incomplete' }
    }
    return { resumable: true, reason: 'three confirmed volumes with complete SKILL bindings' }
  }, {
    projectId: PROJECT_ID,
    expectedSkillIds,
    expectedBodySkillIds,
    skillState: storedSkillState,
    stepConfig: storedStepConfig,
  })
}

async function openPipelineWithResume(page, apiKey, skills) {
  const expectedSkillIds = skills
    .filter(item => item.layer === 'volume')
    .map(item => item.skill.id)
  const expectedBodySkillIds = skills
    .filter(item => item.layer === 'body')
    .map(item => item.skill.id)
  const inspection = await inspectResumableProfile(page, expectedSkillIds, expectedBodySkillIds)
  if (!inspection.resumable) {
    console.log(`[FRESH SEED] ${inspection.reason}; running complete upstream live generation`)
    await seedApplication(page, apiKey, skills)
  } else {
    console.log(`[RESUME] ${inspection.reason}; skipping upstream live generation`)
  }
  await page.click('#btn-pipeline')
  await page.waitForSelector('#pipeline-panel', { timeout: 20_000 })
  if (inspection.resumable) await inspectTraceRestored(page)
  return { shouldGenerateUpstream: !inspection.resumable }
}

async function generateChapterThroughUi(page) {
  await page.locator('#pl-steps .pl-step').nth(3).click()
  await page.waitForSelector('#pl-step-4-content', { state: 'visible' })
  await page.selectOption('#pl-ch-volume-select', { index: 0 })
  await page.locator('#pl-chapter-wordcount').fill('1200')
  await page.locator('#pl-chapter-wordcount').dispatchEvent('change')
  await sleep(400)
  await page.click('#btn-pl-autogen-chapters')
  const snapshot = await waitForLayerCompletion(page, {
    step: 3,
    isFinished: state => state.runStatus === 'success' && state.chapterCount > 0,
    isFailed: state => state.status?.startsWith('failed:'),
  })
  assert(snapshot.chapterCount > 0, 'selected volume contains generated chapters')
  await page.click('#btn-pl-confirm-chapters')
  await sleep(600)
}

async function inspectChapterResumeState(page) {
  return await page.evaluate(() => {
    const project = window.__pinia?._s?.get('project')
    const volume = project?.volumes?.[0]
    const volumeId = volume?.id || volume?.name
    const chapters = volumeId ? (project?.chapters?.[volumeId] || []) : []
    return {
      generated: chapters.some(chapter => chapter?.pipelineGenerated === true),
      chapterCount: chapters.filter(chapter => chapter?.pipelineGenerated === true).length,
      confirmed: chapters.every(chapter => chapter?.confirmed === true) && chapters.length > 0,
    }
  })
}

async function inspectTraceRestored(page) {
  const restored = await page.evaluate(() => Boolean(window.__pinia?._s?.get('runTrace')?.runs?.length))
  assert(restored, 'runTrace store is available after startup')
  await page.waitForFunction(() => {
    const runs = window.__pinia?._s?.get('runTrace')?.runs || []
    return runs.some(run => run.source === 'pipeline' && run.status !== 'running' && run.status !== 'blocked')
  }, undefined, { timeout: 20_000, polling: 500 })
}

async function inspectBodyResumeState(page) {
  return await page.evaluate(() => {
    const state = globalThis.__pipelinePanelState
    const selectedChapter = state?.currentBodyChapter || null
    return {
      generated: Boolean(selectedChapter?.bodyGenerated && selectedChapter?.body),
      bodyLength: String(selectedChapter?.body || '').length,
    }
  })
}

async function generateBodyThroughUi(page) {
  await page.locator('#pl-steps .pl-step').nth(4).click()
  await page.waitForSelector('#pl-step-5-content', { state: 'visible' })
  const volumeSelect = page.locator('#pl-context-summary select').first()
  await volumeSelect.selectOption({ index: 0 })
  await page.locator('#pl-context-summary select').nth(1).selectOption({ index: 0 })
  await sleep(400)
  await page.click('#btn-primary-gen-body')
  return await waitForLayerCompletion(page, {
    step: 4,
    // The live body chain runs three real API steps (S1/S2/S3), and S2 may
    // also include schema retries. Stall/death monitors stay at 2/5 minutes.
    isFinished: state => state.runStatus === 'success',
    isFailed: state => state.status?.startsWith('failed:'),
    timeoutMs: STEP_TIMEOUT_MS * 3,
  })
}

async function ensurePipelineBodyVisible(page) {
  if (await page.locator('#btn-pl-confirm-body').count()) return

  // Confirming body output opens the home editor by product design, unmounting
  // this panel. Return through the real navigation path instead of bypassing it.
  await page.click('#btn-pipeline')
  await page.waitForSelector('#pipeline-panel', { timeout: 20_000 })
  await page.locator('#pl-steps .pl-step').nth(4).click()
  await page.waitForSelector('#pl-step-5-content', { state: 'visible' })
  const volumeSelect = page.locator('#pl-context-summary select').first()
  if (await volumeSelect.count()) {
    await volumeSelect.selectOption({ index: 0 })
    await page.locator('#pl-context-summary select').nth(1).selectOption({ index: 0 })
  }
  await page.waitForFunction(() => {
    const button = document.querySelector('#btn-pl-confirm-body')
    return Boolean(button && !button.disabled)
  }, undefined, { timeout: 20_000, polling: 250 })
}

async function confirmBodyAndMemoryThroughUi(page) {
  await ensurePipelineBodyVisible(page)
  const autoExtractMemory = await page.evaluate(() => {
    const settings = window.__pinia?._s?.get('settings')
    return Boolean(settings?.autoExtractMemory)
  })
  assert(autoExtractMemory,
    'memory extraction is enabled; otherwise this verifier would silently sample only five layers')

  await page.waitForFunction(() => {
    const button = document.querySelector('#btn-pl-confirm-body')
    return Boolean(button && !button.disabled)
  }, undefined, { timeout: STEP_TIMEOUT_MS, polling: 500 })
  await page.click('#btn-pl-confirm-body')

  await page.waitForSelector('[data-modal-id="pl-memory-preview"]', { timeout: STEP_TIMEOUT_MS })
  await page.waitForFunction(() => {
    const state = globalThis.__pipelinePanelState
    if (!state) return false
    if (state.memoryPreviewLoading) return false
    if (state.memoryPreviewSaving) return false
    // The extraction API can legitimately return "no changes"; that is a
    // terminal state only when the empty-state or error UI has rendered.
    if (state.memoryPreviewError) return true
    return document
      .querySelector('[data-modal-id="pl-memory-preview"] .pl-memory-change-list, [data-modal-id="pl-memory-preview"] .empty-state, [data-modal-id="pl-memory-preview"] .pl-memory-preview-error')
      !== null
  }, undefined, { timeout: STEP_TIMEOUT_MS, polling: 1000 })
  const memoryState = await page.evaluate(() => {
    const state = globalThis.__pipelinePanelState
    return {
      error: state?.memoryPreviewError || '',
      changes: (state?.memoryPreviewChanges || []).length,
      stepCompleted: Boolean(state?.steps?.[4]?.completed),
    }
  })
  assert(!memoryState.error, `memory extraction completes without error: ${memoryState.error}`)
  await page.screenshot({
    path: path.join(EVIDENCE_ROOT, 'memory-preview.png'),
    fullPage: false,
  })
  if (await page.locator('[data-modal-id="pl-memory-preview"] .pl-memory-preview-footer .btn-primary').isVisible()) {
    await page.click('[data-modal-id="pl-memory-preview"] .pl-memory-preview-footer .btn-primary')
    await page.waitForSelector('[data-modal-id="pl-memory-preview"]', { state: 'detached' })
  }
  return memoryState
}

async function exportLatestRun(page, step) {
  const exported = await page.evaluate(async ({ exportRoot, step: stepNumber }) => {
    const store = window.__pinia?._s?.get('runTrace')
    const stepNames = {
      0: '大纲风格分析',
      1: '设定层',
      2: '卷纲层',
      3: '章节层',
      4: '正文层',
    }
    // A resumed session can append a zero-API terminal marker run. Contract
    // evidence must come from the run that actually contains API activity.
    const run = [...(store?.runs || [])]
      .filter(item => item.source === 'pipeline'
        && item.step === stepNumber
        && item.stepName === stepNames[stepNumber]
        && (item.apiCalls || []).length > 0)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    if (!run) return null
    const result = await window.electronAPI.runTraceExport({
      schema: 'shenyi.run-trace',
      version: 2,
      run: store.exportRunToJson(run),
      mode: 'deep',
      payloadDirectoryHint: exportRoot,
    })
    return { runId: run.id, result }
  }, { exportRoot: EXPORT_ROOT, step })
  assert(exported, `pipeline step ${step} run trace exists`)
  return exported
}

async function exportFailureEvidence(page) {
  const failureLogPath = path.join(EVIDENCE_ROOT, 'failure-export.log')
  try {
    const exported = await page.evaluate(async ({ exportRoot }) => {
      const store = window.__pinia?._s?.get('runTrace')
      const run = [...(store?.runs || [])]
        .filter(item => item.source === 'pipeline' && (item.apiCalls || []).length > 0)
        .sort((a, b) => b.startedAt - a.startedAt)[0]
      if (!run) return null
      const result = await window.electronAPI.runTraceExport({
        schema: 'shenyi.run-trace',
        version: 2,
        run: store.exportRunToJson(run),
        mode: 'deep',
        payloadDirectoryHint: exportRoot,
      })
      return {
        runId: run.id,
        step: run.step,
        stepName: run.stepName,
        status: run.status,
        apiCalls: (run.apiCalls || []).length,
        result,
      }
    }, { exportRoot: EXPORT_ROOT })
    if (!exported) {
      fs.writeFileSync(failureLogPath, 'no pipeline run with API activity was available for failure export\n', 'utf8')
      return
    }
    if (!exported.result?.success) {
      fs.writeFileSync(failureLogPath,
        `deep export failed: ${exported.result?.error || exported.result?.reason || 'unknown error'}\n`, 'utf8')
      return
    }
    const exportedRun = JSON.parse(fs.readFileSync(path.join(exported.result.path, 'run-trace.json'), 'utf8'))
    const safeName = String(exported.stepName || `step-${exported.step}`).replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 48)
    const target = path.join(EVIDENCE_ROOT, 'failure-live-export', safeName)
    fs.mkdirSync(target, { recursive: true })
    fs.cpSync(exported.result.path, target, { recursive: true })
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'failure-live-export', 'summary.json'), JSON.stringify({
      exportedAt: new Date().toISOString(),
      runId: exported.runId,
      step: exported.step,
      stepName: exported.stepName,
      status: exported.status,
      apiCalls: exported.apiCalls,
      sourceDirectory: exported.result.path,
      evidenceDirectory: target,
      eventTypes: [...new Set((exportedRun.events || []).map(event => event.type))],
    }, null, 2), 'utf8')
    console.log(`[FAILURE EVIDENCE] exported run ${exported.runId} to ${target}`)
  } catch (error) {
    fs.writeFileSync(failureLogPath,
      `failure export crashed: ${error?.stack || error?.message || String(error)}\n`, 'utf8')
    console.error('[FAILURE EVIDENCE] export failed:', error)
  }
}

function readExportedRun(exported) {
  assert(exported.result?.success, `deep run trace export succeeds: ${exported.result?.error || 'unknown error'}`)
  const directory = exported.result.path
  const run = JSON.parse(fs.readFileSync(path.join(directory, 'run-trace.json'), 'utf8'))
  const payloads = {}
  const payloadRoot = path.join(directory, 'payloads')
  if (fs.existsSync(payloadRoot)) {
    for (const name of fs.readdirSync(payloadRoot)) {
      if (!name.endsWith('-request.json')) continue
      const payload = JSON.parse(fs.readFileSync(path.join(payloadRoot, name), 'utf8'))
      payloads[name] = payload
    }
  }
  return { directory, run, payloads }
}

function parseEvents(run, type) {
  return (run.events || [])
    .filter(event => event.type === type)
    .map(event => JSON.parse(event.detail || '{}'))
}

function collectPayloadStrings(value, output = []) {
  if (typeof value === 'string') {
    output.push(value)
  } else if (Array.isArray(value)) {
    for (const item of value) collectPayloadStrings(item, output)
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectPayloadStrings(item, output)
  }
  return output
}

function assertSettingsRun({ run, payloads }) {
  assert.equal(run.schemaVersion, RUN_TRACE_SCHEMA_VERSION,
    `settings run uses runTrace schema v${RUN_TRACE_SCHEMA_VERSION}`)
  assert.equal(run.status, 'success', 'settings run succeeds')
  assert.equal(run.step, 1, 'settings run belongs to step 1')
  const validated = parseEvents(run, 'settings-artifact-validated')
  assert.equal(validated.length, 1, `one settings validation event exists, got ${validated.length}`)
  assert(validated[0].acceptedCount > 0, 'settings validation accepts at least one item')
  const attempt = parseEvents(run, 'settings-artifact-attempt')
  assert(attempt.length >= 1, 'settings attempt evidence is recorded')
  const prompt = Object.values(payloads)
    .flatMap(payload => collectPayloadStrings(payload))
    .find(text => text.includes('请基于这份已确认的大纲'))
  assert(prompt, 'settings request contains the artifact prompt')
  assertStepTimingLedger(run, 'settings')
}

function assertVolumeRun({ run, payloads }) {
  assert.equal(run.schemaVersion, RUN_TRACE_SCHEMA_VERSION,
    `volume run uses runTrace schema v${RUN_TRACE_SCHEMA_VERSION}`)
  assert.equal(run.status, 'success', 'volume run succeeds')
  assert.equal(run.step, 2, 'volume run belongs to step 2')
  const validated = parseEvents(run, 'volume-batch-validated')
  assert.equal(validated.length, 1, `one volume validation event exists, got ${validated.length}`)
  assert.equal(validated[0].mode, 'auto', 'volume validation records auto mode')
  assert.equal(validated[0].expectedCount, 3, 'volume contract expected three missing volumes')
  assert.equal(validated[0].actualCount, 3, 'volume contract accepted three volumes')
  assert.equal(validated[0].status, 'complete', 'volume batch is complete')
  const prompts = Object.values(payloads)
    .flatMap(payload => collectPayloadStrings(payload))
  assert(prompts.some(text => text.includes('[已生成卷事实清单]')),
    'volume request includes the generated-volume history facts ledger')
  const plannedVolumeFact = prompts.find(text =>
    text.includes('全书卷数：3')
    || text.includes('[卷数]\n3')
    || text.includes('全书计划到第3卷')
    || text.includes('生成3卷的卷纲'))
  assert(plannedVolumeFact,
    'volume requests carry the three-volume plan as a semantic fact, not one fixed sentence')
  for (let volume = 1; volume <= 3; volume++) {
    assert(prompts.some(text => text.includes(`本次只生成第${volume}卷`)
      || text.includes(`生成边界：只生成第${volume}卷`)),
      `volume requests carry a single-volume boundary for volume ${volume}`)
  }

  const chainSteps = (run.events || []).filter(event => event.type === 'chain-step')
  assert(chainSteps.length >= 12,
    `three volumes require at least twelve chain steps, got ${chainSteps.length}`)
  for (let step = 1; step <= 4; step++) {
    const count = chainSteps.filter(event => (event.label || '').includes(`链式步骤 ${step}/4`)).length
    assert(count >= 3,
      `every generated volume must execute chain step ${step}/4 at least once; got ${count}`)
  }
  assert(!(run.events || []).some(event => event.type === 'chain-handoff-resume'),
    'a clean successful volume run must not resume a stale breakpoint handoff')
  assert((run.apiCalls || []).length >= 12,
    `three complete S1-S4 chains require at least twelve API calls, got ${(run.apiCalls || []).length}`)
  assertStepTimingLedger(run, 'volume')
}

function assertBodyRun({ run, payloads }) {
  assert.equal(run.schemaVersion, RUN_TRACE_SCHEMA_VERSION,
    `body run uses runTrace schema v${RUN_TRACE_SCHEMA_VERSION}`)
  assert.equal(run.status, 'success', 'body run succeeds')
  assert.equal(run.step, 4, 'body run belongs to step 4')
  const validated = parseEvents(run, 'body-artifact-validated')
  assert.equal(validated.length, 1, `one body validation event exists, got ${validated.length}`)
  const targetWords = Number(validated[0].targetWords)
  assert(Number.isFinite(targetWords) && targetWords > 0,
    `body validation records a usable target-word contract, got ${validated[0].targetWords}`)
  const expectedBodyMinWords = Math.round(targetWords * 0.8)
  assert(validated[0].wordCount >= expectedBodyMinWords,
    `body word count passes the 80% lower bound, got ${validated[0].wordCount}`)
  assert(validated[0].wordCount <= 2400, `body word count passes the 200% upper bound, got ${validated[0].wordCount}`)
  assert(validated[0].ratio >= 0.8, `body ratio passes the lower bound, got ${validated[0].ratio}`)
  assert.equal(validated[0].status, 'complete', 'body artifact is complete')
  assert(parseEvents(run, 'body-artifact-attempt').length >= 1,
    'body attempt evidence is recorded')
  const targetContract = bodyGeneratorContractSentence(targetWords)
  const prompt = Object.values(payloads)
    .flatMap(payload => collectPayloadStrings(payload))
    .find(text => text.includes(targetContract))
  assert(prompt, `body request contains the target-word contract: ${targetContract}`)

  const finalStepLedgerPrompt = Object.values(payloads)
    .flatMap(payload => collectPayloadStrings(payload))
    .find(text => text.includes('--- 上一步结构化交接（终步账本） ---'))
  assert(finalStepLedgerPrompt, 'body final step request carries the controlled final-step ledger')
  assert(finalStepLedgerPrompt.includes('FACT_LOCK'), 'final-step ledger retains FACT_LOCK')
  assert(!finalStepLedgerPrompt.includes('【正文交接】'),
    'final-step ledger normalizes the legacy body handoff marker')

  const finalStepMetadataEvents = parseEvents(run, 'body-final-step-metadata')
  assert(finalStepMetadataEvents.length >= 1,
    `body run records final-step metadata flow, got ${finalStepMetadataEvents.length}`)
  assert(finalStepMetadataEvents.every(event => event.decision === 'pass'
    || event.decision === 'backfilled'),
    `final-step metadata decision is pass/backfilled, got ${finalStepMetadataEvents.map(event => event.decision).join(',')}`)
  const consumedMetadata = finalStepMetadataEvents.map(event =>
    event.consumedMetadata || event.downstreamMetadata || event.metadata)
    .filter(value => value)
  assert(consumedMetadata.length === finalStepMetadataEvents.length,
    'every final-step metadata event records the consumed downstream metadata')
  for (const metadata of consumedMetadata) {
    const text = JSON.stringify(metadata)
    assert(!text.includes('无法核对'),
      'consumed final metadata must not retain the historical un-verifiable ledger')
  }

  const finalStepTexts = Object.values(payloads)
    .flatMap(payload => collectPayloadStrings(payload))
    .filter(text => text.includes('【终步重试协议】'))
  if (finalStepTexts.length > 0) {
    for (const text of finalStepTexts) {
      assert(text.match(/【终步重试协议】/g).length === 1,
        'a final-step retry request contains exactly one feedback block')
      assert(!text.includes('必须以它为基底'),
        'final-step retry must not use the legacy candidate-as-base protocol')
      assert(!text.includes('<<<上一版候选输出开始>>>'),
        'final-step retry must not carry the previous S3 candidate')
    }
    assert(parseEvents(run, 'final-step-feedback-composed').length > 0,
      'final-step retry records feedback composition evidence')
  }

  assertStepTimingLedger(run, 'body')
}

function assertNoOpenApiCalls(run) {
  assert((run.apiCalls || []).every(call => call.status !== 'running'),
    'no API call is left running')
  assert((run.turns || []).every(turn => turn.status !== 'running'),
    'no turn is left running')
}

function assertStepTimingLedger(run, layer) {
  assert.equal(run.schemaVersion, RUN_TRACE_SCHEMA_VERSION,
    `${layer} run uses runTrace schema v${RUN_TRACE_SCHEMA_VERSION}`)
  const ledger = run.stepTimingLedger
  assert(ledger, `${layer} run exports stepTimingLedger`)
  assert(Number.isFinite(Number(ledger.apiCallCount)) && Number(ledger.apiCallCount) >= 1,
    `${layer} ledger records at least one API call`)
  assert(Number.isFinite(Number(ledger.physicalCallCount)) && Number(ledger.physicalCallCount) >= 1,
    `${layer} ledger records at least one physical request`)
  for (const key of [
    'promptBuildMs', 'contextLoadMs', 'firstTokenSumMs', 'outputSumMs',
    'postProcessSumMs', 'validationSumMs', 'persistenceSumMs', 'physicalDurationSumMs',
  ]) {
    // Optional phase fields may be undefined when a layer has no matching phase,
    // but any recorded value must remain a finite non-negative duration.
    if (ledger[key] === undefined) continue
    assert(Number.isFinite(ledger[key]) && ledger[key] >= 0,
      `${layer} ledger ${key} is non-negative and finite`)
  }
  assert(!ledger.contextChars || Number(ledger.contextChars) >= 0,
    `${layer} contextChars is non-negative`)
  assert(!ledger.outputChars || Number(ledger.outputChars) >= 0,
    `${layer} outputChars is non-negative`)
}

function assertOutlineAnalysisRun({ run }) {
  assert.equal(run.step, 0, 'outline analysis run belongs to step 0')
  assert(run.status === 'success' || run.status === 'degraded',
    `outline analysis reaches a terminal status, got ${run.status}`)
  assertStepTimingLedger(run, 'outline-analysis')
}

function assertChapterRun({ run }) {
  assert.equal(run.step, 3, 'chapter run belongs to step 3')
  assert.equal(run.status, 'success', 'chapter run succeeds')
  assertStepTimingLedger(run, 'chapter')
  assert((run.apiCalls || []).length >= 1, 'chapter run records at least one API call')
  assert((run.apiCalls || []).every(call => call.status !== 'running'),
    'chapter run leaves no running API call')
}

function assertMemoryRun({ run }) {
  assert.equal(run.step, 4, 'memory extraction run is recorded under step 4')
  assert(run.stepName === '记忆抽取', `memory run has the expected step name, got ${run.stepName}`)
  assert.equal(run.status, 'success', 'memory extraction run succeeds')
  assertStepTimingLedger(run, 'memory-extraction')
  assert((run.apiCalls || []).length >= 1, 'memory extraction records at least one API call')
  const physicalCalls = (run.apiCalls || []).flatMap(call => call.physicalCalls || [])
  assert(physicalCalls.length >= 1, 'memory extraction records at least one physical request')
  assert((run.apiCalls || []).every(call => call.status !== 'running'),
    'memory extraction leaves no running API call')
}

function formatMs(value) {
  const ms = Number(value || 0)
  if (ms >= 3_600_000) return `${(ms / 3_600_000).toFixed(2)}h`
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(2)}m`
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(2)}s`
  return `${ms.toFixed(0)}ms`
}

function buildTimingAnalysis(runs) {
  const layers = runs.map(({ layer, run }) => {
    const ledger = run.stepTimingLedger || {}
    return {
      layer,
      runId: run.id,
      status: run.status,
      durationMs: run.durationMs,
      apiCallCount: ledger.apiCallCount,
      physicalCallCount: ledger.physicalCallCount,
      retryCallCount: ledger.retryCallCount,
      schemaRetryCallCount: ledger.schemaRetryCallCount,
      firstTokenSumMs: ledger.firstTokenSumMs,
      outputSumMs: ledger.outputSumMs,
      promptBuildMs: ledger.promptBuildMs,
      contextLoadMs: ledger.contextLoadMs,
      postProcessSumMs: ledger.postProcessSumMs,
      validationSumMs: ledger.validationSumMs,
      persistenceSumMs: ledger.persistenceSumMs,
      stepBoundaryGapMs: ledger.stepBoundaryGapMs,
      contextChars: ledger.contextChars,
      outputChars: ledger.outputChars,
      repeatedPromptBlocks: ledger.repeatedPromptBlocks,
    }
  })
  const lines = [
    '# Phase 5B 全层真实采样耗时结构',
    '',
    `- 生成时间: ${new Date().toISOString()}`,
    `- 模型: ${MODEL}`,
    `- 供应商: ${BASE_URL}`,
    '',
    '## 层级汇总',
    '',
    '| 层 | 状态 | 总耗时 | API call | 物理请求 | 重试 | 首 token | 流式输出 | 本地校验 | 持久化 | 层间 gap |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  ]
  for (const row of layers) {
    lines.push([
      row.layer,
      row.status,
      formatMs(row.durationMs),
      row.apiCallCount,
      row.physicalCallCount,
      Number(row.retryCallCount || 0) + Number(row.schemaRetryCallCount || 0),
      formatMs(row.firstTokenSumMs),
      formatMs(row.outputSumMs),
      formatMs(row.validationSumMs),
      formatMs(row.persistenceSumMs),
      formatMs(row.stepBoundaryGapMs),
    ].join(' | '))
  }
  lines.push('', '## 上下文与输出', '',
    '| 层 | contextChars | outputChars | repeatedPromptBlocks |', '|---|---:|---:|---|')
  for (const row of layers) {
    lines.push([row.layer, row.contextChars || 0, row.outputChars || 0,
      JSON.stringify(row.repeatedPromptBlocks || {})].join(' | '))
  }
  lines.push('', '## 归因边界', '',
    '- firstTokenSumMs/outputSumMs 是模型侧结论。')
  lines.push('- promptBuild/contextLoad/validation/persistence 是本地耗时结论。')
  lines.push('- stepBoundaryGapMs 只表示同 scope 两次 run 之间的间隔，不能自动等同用户等待。')
  lines.push('- 本文件只记录本批采样，不直接推出并发或路由改动。')
  return { layers, text: lines.join('\n') }
}

async function captureEvidence(page, evidence) {
  await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'final-state.png'), fullPage: false })
  fs.writeFileSync(path.join(EVIDENCE_ROOT, 'summary.json'), JSON.stringify({
    schema: 'shenyi.pipeline-artifact-contract.electron-live',
    version: 1,
    generatedAt: new Date().toISOString(),
    script: SCRIPT_NAME,
    model: MODEL,
    baseUrl: BASE_URL,
    projectId: PROJECT_ID,
    layers: evidence,
  }, null, 2), 'utf8')
}

async function exportRunByPredicate(page, target) {
  const exported = await page.evaluate(async ({ exportRoot, filter }) => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])]
      .sort((a, b) => b.startedAt - a.startedAt)
      .find(run => run.source === 'pipeline'
        && run.step === filter.step
        && run.stepName === filter.stepName) || null
    if (!run) return null
    const result = await window.electronAPI.runTraceExport({
      schema: 'shenyi.run-trace',
      version: 2,
      run: store.exportRunToJson(run),
      mode: 'deep',
      payloadDirectoryHint: exportRoot,
    })
    return { runId: run.id, result }
  }, { exportRoot: EXPORT_ROOT, filter: target })
  assert(exported,
    `target run trace exists (step=${target.step}, stepName=${target.stepName})`)
  return exported
}

async function archiveLiveExport({ directory, run, targetDir }) {
  fs.mkdirSync(targetDir, { recursive: true })
  fs.copyFileSync(path.join(directory, 'run-trace.json'), path.join(targetDir, 'run-trace.json'))
  const payloadRoot = path.join(directory, 'payloads')
  if (fs.existsSync(payloadRoot)) {
    fs.cpSync(payloadRoot, targetDir, { recursive: true })
  }
  return {
    layer: run.step,
    status: run.status,
    exportPath: targetDir,
    events: (run.events || []).map(event => event.type),
  }
}

async function archivePreviousEvidence() {
  if (!fs.existsSync(EVIDENCE_ROOT)) return
  const archiveRoot = path.join(path.dirname(EVIDENCE_ROOT), 'verification-pipeline-artifact-contract-live-archive')
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
  await removeDir(EXPORT_ROOT)
  if (!fs.existsSync(path.join(PROFILE, 'app-data'))) {
    fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
  }
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
  let livePage = null
  const evidence = []
  try {
    assert(await waitForCdp(), 'CDP reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    const page = await connectPage(browser)
    livePage = page
    page.on('pageerror', error => console.error(`[PAGE ERROR] ${error.message}`))
    page.on('crash', () => console.error('[PAGE CRASH] renderer process crashed'))
    page.on('console', message => {
      if (message.type() === 'error') {
        console.error(`[PAGE ERROR] ${String(message.text()).slice(0, 600)}`)
      }
    })
    await page.waitForSelector('#app', { timeout: 20_000 })
    await sleep(1500)

    const settingsSkill = loadSkillFolder(SKILL_SOURCES[0])
    const volumeSkills = SKILL_SOURCES
      .filter(source => source.layer === 'volume')
      .map(source => loadSkillFolder(source))
    const bodySkills = SKILL_SOURCES
      .filter(source => source.layer === 'body')
      .map(source => loadSkillFolder(source))
    const { shouldGenerateUpstream } = await openPipelineWithResume(
      page,
      apiKey,
      [settingsSkill, ...volumeSkills, ...bodySkills],
    )

    heartbeat = startHeartbeat(page, electronProcess.pid)
    const layerRuns = []

    if (shouldGenerateUpstream) {
      await confirmOutlineThroughUi(page)
      const outlineExport = await exportLatestRun(page, 0)
      const outlineRun = readExportedRun(outlineExport)
      assertOutlineAnalysisRun(outlineRun)
      assertNoOpenApiCalls(outlineRun.run)
      layerRuns.push({ layer: 'Step 0 大纲风格分析', run: outlineRun.run })
      evidence.push(await archiveLiveExport({
        directory: outlineRun.directory,
        run: outlineRun.run,
        targetDir: path.join(EVIDENCE_ROOT, 'live-export', 'outline-analysis'),
      }))

      await selectSkillsThroughUi(page, {
        stepIndex: 1,
        selectId: '#pl-s2-skill',
        addId: '#pl-s2-add-skill',
        listId: '#pl-s2-skills-list',
        modeSelectId: '#pl-s2-mode',
        skills: [settingsSkill.skill],
      })
      await page.click('#btn-pl-gen-settings')
      const settingsCompletion = await waitForLayerCompletion(page, {
        step: 1,
        isFinished: state => state.runStatus === 'success',
        isFailed: state => state.status?.startsWith('failed:'),
      })
      assert.equal(settingsCompletion.runStatus, 'success', 'settings run trace finishes successfully')
      const settingsExport = await exportLatestRun(page, 1)
      const settingsRun = readExportedRun(settingsExport)
      assertSettingsRun(settingsRun)
      assertNoOpenApiCalls(settingsRun.run)
      layerRuns.push({ layer: 'Step 1 设定层', run: settingsRun.run })
      evidence.push(await archiveLiveExport({
        directory: settingsRun.directory,
        run: settingsRun.run,
        targetDir: path.join(EVIDENCE_ROOT, 'live-export', 'settings'),
      }))
      await confirmSettingsThroughUi(page)

      await selectSkillsThroughUi(page, {
        stepIndex: 2,
        selectId: '#pl-s3-skill',
        addId: '#pl-s3-add-skill',
        listId: '#pl-s3-skills-list',
        modeSelectId: '#pl-s3-mode',
        skills: volumeSkills.map(item => item.skill),
      })
      await page.locator('#pl-volume-count').fill('3')
      await page.locator('#pl-volume-count').dispatchEvent('change')
      await sleep(400)
      await page.click('#btn-pl-gen-volumes')
      const volumeCompletion = await waitForLayerCompletion(page, {
        step: 2,
        isFinished: state => state.runStatus === 'success',
        isFailed: state => state.status?.startsWith('failed:'),
        // Live runs measure 15-20 minutes per four-step volume chain, and three
        // volumes are generated sequentially. The 2-minute stall and 5-minute
        // dead-call monitors still guard against a genuinely stuck run, so this
        // budget only removes the structural false timeout.
        timeoutMs: STEP_TIMEOUT_MS * 9,
      })
      assert.equal(volumeCompletion.volumeCount, 3, 'volume layer contains exactly three volumes')
      const volumeExport = await exportLatestRun(page, 2)
      const volumeRun = readExportedRun(volumeExport)
      assertVolumeRun(volumeRun)
      assertNoOpenApiCalls(volumeRun.run)
      layerRuns.push({ layer: 'Step 2 卷纲层', run: volumeRun.run })
      evidence.push(await archiveLiveExport({
        directory: volumeRun.directory,
        run: volumeRun.run,
        targetDir: path.join(EVIDENCE_ROOT, 'live-export', 'volume'),
      }))
    } else {
      console.log('[RESUME] upstream layers already generated; exporting restored persisted traces')
      const outlineExport = await exportLatestRun(page, 0)
      const outlineRun = readExportedRun(outlineExport)
      assertOutlineAnalysisRun(outlineRun)
      assertNoOpenApiCalls(outlineRun.run)
      layerRuns.push({ layer: 'Step 0 大纲风格分析', run: outlineRun.run })
      evidence.push(await archiveLiveExport({
        directory: outlineRun.directory,
        run: outlineRun.run,
        targetDir: path.join(EVIDENCE_ROOT, 'live-export', 'outline-analysis'),
      }))

      const settingsExport = await exportLatestRun(page, 1)
      const settingsRun = readExportedRun(settingsExport)
      assertSettingsRun(settingsRun)
      assertNoOpenApiCalls(settingsRun.run)
      layerRuns.push({ layer: 'Step 1 设定层', run: settingsRun.run })
      evidence.push(await archiveLiveExport({
        directory: settingsRun.directory,
        run: settingsRun.run,
        targetDir: path.join(EVIDENCE_ROOT, 'live-export', 'settings'),
      }))

      const volumeExport = await exportLatestRun(page, 2)
      const volumeRun = readExportedRun(volumeExport)
      assertVolumeRun(volumeRun)
      assertNoOpenApiCalls(volumeRun.run)
      layerRuns.push({ layer: 'Step 2 卷纲层', run: volumeRun.run })
      evidence.push(await archiveLiveExport({
        directory: volumeRun.directory,
        run: volumeRun.run,
        targetDir: path.join(EVIDENCE_ROOT, 'live-export', 'volume'),
      }))
    }
    await confirmVolumesThroughUi(page)

    const chapterResume = await inspectChapterResumeState(page)
    if (chapterResume.generated && chapterResume.confirmed) {
      console.log(`[RESUME] chapter layer already generated (${chapterResume.chapterCount} chapters); skipping regeneration`)
    } else {
      await generateChapterThroughUi(page)
    }
    const chapterExport = await exportLatestRun(page, 3)
    const chapterRun = readExportedRun(chapterExport)
    assertChapterRun(chapterRun)
    assertNoOpenApiCalls(chapterRun.run)
    layerRuns.push({ layer: 'Step 3 章节层', run: chapterRun.run })
    evidence.push(await archiveLiveExport({
      directory: chapterRun.directory,
      run: chapterRun.run,
      targetDir: path.join(EVIDENCE_ROOT, 'live-export', 'chapter'),
    }))

    await selectSkillsThroughUi(page, {
      stepIndex: 4,
      selectId: '#pl-s5-skill',
      addId: '#pl-s5-add-skill',
      listId: '#pl-s5-skills-list',
      modeSelectId: '#pl-s5-mode',
      skills: bodySkills.map(item => item.skill),
    })
    const bodyResume = await inspectBodyResumeState(page)
    let bodyCompletion
    if (bodyResume.generated) {
      console.log(`[RESUME] body layer already generated (${bodyResume.bodyLength} chars); skipping regeneration`)
      await page.locator('#pl-steps .pl-step').nth(4).click()
      await page.waitForSelector('#pl-step-5-content', { state: 'visible' })
      const volumeSelect = page.locator('#pl-context-summary select').first()
      await volumeSelect.selectOption({ index: 0 })
      await page.locator('#pl-context-summary select').nth(1).selectOption({ index: 0 })
      await sleep(400)
      bodyCompletion = await page.evaluate(() => {
        const run = [...(window.__pinia?._s?.get('runTrace')?.runs || [])]
          .filter(item => item.source === 'pipeline'
            && item.step === 4
            && item.stepName === '正文层'
            && item.status !== 'running'
            && item.status !== 'blocked')
          .sort((a, b) => b.startedAt - a.startedAt)[0]
        return { runId: run?.id || null, runStatus: run?.status || null }
      })
      assert.equal(bodyCompletion.runStatus, 'success',
        'persisted body run is a terminal success without regenerating an already generated body')
    } else {
      bodyCompletion = await generateBodyThroughUi(page)
      assert.equal(bodyCompletion.runStatus, 'success', 'body layer run finishes successfully')
    }
    const bodyExport = await exportLatestRun(page, 4)
    const bodyRun = readExportedRun(bodyExport)
    assertBodyRun(bodyRun)
    assertNoOpenApiCalls(bodyRun.run)
    layerRuns.push({ layer: 'Step 4 正文层', run: bodyRun.run })
    evidence.push(await archiveLiveExport({
      directory: bodyRun.directory,
      run: bodyRun.run,
      targetDir: path.join(EVIDENCE_ROOT, 'live-export', 'body'),
    }))

    const memoryCompletion = await confirmBodyAndMemoryThroughUi(page)
    assert(!memoryCompletion.error, 'memory extraction completes without preview error')
    const memoryExport = await exportRunByPredicate(page, { step: 4, stepName: '记忆抽取' })
    const memoryRun = readExportedRun(memoryExport)
    assertMemoryRun(memoryRun)
    assertNoOpenApiCalls(memoryRun.run)
    layerRuns.push({ layer: '记忆抽取', run: memoryRun.run })

    evidence.push(await archiveLiveExport({
      directory: memoryRun.directory,
      run: memoryRun.run,
      targetDir: path.join(EVIDENCE_ROOT, 'live-export', 'memory-extraction'),
    }))

    assert.equal(layerRuns.length, 6,
      'Phase 5B must sample all six pipeline layers; partial sampling is not a pass')
    assert.equal(new Set(layerRuns.map(item => item.layer)).size, 6,
      'Phase 5B samples six distinct layers; duplicate layers are not a pass')

    const timing = buildTimingAnalysis(layerRuns)
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'timing-analysis.md'), timing.text, 'utf8')
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'timing-analysis.json'), JSON.stringify(timing.layers, null, 2), 'utf8')

    await captureEvidence(page, evidence)
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'phase5b-summary.json'), JSON.stringify({
      schema: 'shenyi.pipeline-artifact-contract.phase5b',
      version: 1,
      generatedAt: new Date().toISOString(),
      script: SCRIPT_NAME,
      model: MODEL,
      baseUrl: BASE_URL,
      layers: timing.layers,
      memory: memoryCompletion,
    }, null, 2), 'utf8')
    console.log('===== PIPELINE ARTIFACT CONTRACT ELECTRON LIVE PASSED =====')
  } catch (error) {
    // Timeout/failure evidence must survive before the finally block closes the
    // renderer and removes the isolated profile. Otherwise the only remaining
    // signal is the heartbeat, and slow-stream root cause analysis loses the
    // physical request bodies and stream events.
    if (livePage) await exportFailureEvidence(livePage)
    throw error
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
