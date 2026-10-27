import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import defaultPaths from '../electron/defaultPaths.js'

const ROOT = path.resolve(process.cwd())
const SCRIPT_NAME = 'verify-owner-breakpoint-closure-electron.mjs'
const ELECTRON_EXE = process.env.SHENYI_OWNER_BREAKPOINT_ELECTRON
  ? path.resolve(process.env.SHENYI_OWNER_BREAKPOINT_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_OWNER_BREAKPOINT_CDP_PORT || 9391)
const PROFILE = path.join(ROOT, '_data', 'owner-breakpoint-closure-profile')
const DATA_DIR = path.join(PROFILE, 'documents-data')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-owner-breakpoint-closure-electron')
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const HEARTBEAT_PATH = path.join(EVIDENCE_ROOT, 'heartbeat.jsonl')
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_OWNER_BREAKPOINT_GLOBAL_TIMEOUT_MS || 6 * 60_000)
const STEP_TIMEOUT_MS = Number(process.env.SHENYI_OWNER_BREAKPOINT_STEP_TIMEOUT_MS || 150_000)
const STALLED_TIMEOUT_MS = Number(process.env.SHENYI_OWNER_BREAKPOINT_STALLED_TIMEOUT_MS || 20_000)
const DEAD_TIMEOUT_MS = Number(process.env.SHENYI_OWNER_BREAKPOINT_DEAD_TIMEOUT_MS || 45_000)
const KEEP_PROFILE = process.env.SHENYI_OWNER_BREAKPOINT_KEEP_PROFILE === '1'

function assertIsolatedStorage() {
  const documentsDir = path.join(process.env.USERPROFILE || process.env.HOME || '', 'Documents')
  const canonicalDataDir = defaultPaths.getDataRoot(documentsDir)
  // The canonical directory may legitimately contain real user checkpoints.
  // This verifier must only reject checkpoints whose owner identity belongs to its synthetic project.
  const breakpointFiles = fs.existsSync(canonicalDataDir)
    ? fs.readdirSync(canonicalDataDir).filter(name =>
      name.startsWith('wa_pipeline_breakpoint_owner_') && name.includes(PROJECT_ID))
    : []
  assert.equal(breakpointFiles.length, 0,
    `test isolation is not clean: canonical storage contains ${breakpointFiles.length} owner breakpoint files`)
}

const PROJECT_ID = 'owner-breakpoint-closure'
const VOLUME_ID = 'volume-owner-breakpoint'
const CHAPTER_ID = 'chapter-owner-breakpoint-1'
const OWNER_KEY = `pipeline:${PROJECT_ID}:step-4`
const SKILL_IDS = ['OWNER-BP-S1', 'OWNER-BP-S2', 'OWNER-BP-S3']

const VOLUME_OUTLINE = [
  '## 卷级常任约束',
  '> 作用域：卷级常任',
  '- 全卷不得提前揭示灯芯真相。',
  '',
  '## 剧情单元 H1-01 雨夜',
  '> 作用域：单元级 H1-01',
  '章节范围：第 1 章',
  '- 雨夜中，主角检查旧灯塔底层的纸条。',
].join('\n')

const S1_BODY = [
  '雨夜第一段：林照进入灯塔，发现纸条藏在灯座下。',
  '他把纸条压在掌心，听见门外传来巡逻声。',
  '他记下纸条日期，开始怀疑灯芯维护记录被人涂改。',
  '他在窗边观察到船队灯光异常，决定继续调查。',
  '他把线索写在袖口，等待雨声掩护下一步行动。',
].join('\n')
const S2_SHORT_BODY = '雨夜短稿。'
const S2_BODY_TEXT = Array.from({ length: 130 }, (_, index) =>
  `林照把纸条放进灯座，潮声第${index + 1}次盖住他的呼吸。`).join('\n')
const S2_VALID_BODY = [
  S2_BODY_TEXT,
  '【正文交接】',
  'FACT_LOCK:人物状态=警觉',
  'FACT_LOCK:位置=灯塔底层',
  'FACT_LOCK:关键道具=纸条',
  'NEW_FACT:纸条日期与灯芯维护记录不一致',
  '【正文交接结束】',
].join('\n')
const S3_SHORT_BODY = '终稿短文。'
const S3_BODY_TEXT = Array.from({ length: 130 }, (_, index) =>
  index === 0
    ? `林照将纸条压进灯座，潮声第${index + 1}次盖住他的呼吸。`
    : `林照把纸条放进灯座，潮声第${index + 1}次盖住他的呼吸。`).join('\n')
const S3_POLISHED_BODY = [
  S3_BODY_TEXT,
  '【正文交接】',
  'FACT_LOCK:人物状态=警觉',
  'FACT_LOCK:位置=灯塔底层',
  'FACT_LOCK:关键道具=纸条',
  'NEW_FACT:纸条日期与灯芯维护记录不一致',
  '【正文交接结束】',
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
  const staleBundles = bundleNames.filter(name =>
    fs.statSync(path.join(ROOT, 'dist-renderer', name)).mtimeMs < newestSourceMs)
  assert.equal(staleBundles.length, 0, `renderer build is stale: ${staleBundles.join(', ')}`)
  const manifestPath = path.join(ROOT, 'dist-renderer', 'build-manifest.json')
  assert(fs.existsSync(manifestPath), 'dist-renderer/build-manifest.json exists')
  const diskManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const bundleText = bundleNames.map(name =>
    fs.readFileSync(path.join(ROOT, 'dist-renderer', name), 'utf8')).join('\n')
  const injectedMarker = JSON.stringify(diskManifest)
  assert(bundleText.includes(injectedMarker),
    'renderer bundle contains the same build manifest injected at runtime')
  return diskManifest
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
    },
    windowsHide: false,
  })
  console.log(`[VISIBLE ELECTRON] pid=${child.pid}`)
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
  try { execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
}

async function connectPage(browser) {
  let page = null
  for (let attempt = 0; attempt < 24 && !page; attempt++) {
    page = browser.contexts()[0]?.pages()?.find(item => !item.url().startsWith('devtools://')) || null
    if (!page) await sleep(500)
  }
  assert(page, 'renderer page reachable')
  return page
}

function startProvider() {
  const requests = []
  const queue = []
  const server = http.createServer((request, response) => {
    let bodyText = ''
    request.on('data', chunk => { bodyText += chunk })
    request.on('end', () => {
      requests.push({ at: new Date().toISOString(), bodyText })
      const next = queue.length > 0 ? queue.shift() : { body: S2_VALID_BODY, finishReason: 'stop' }
      let wantsStream = false
      try { wantsStream = JSON.parse(bodyText).stream === true } catch {}
      if (wantsStream) {
        const chunks = [
          `data: ${JSON.stringify({ choices: [{ delta: { content: next.body } }] })}\n\n`,
          `data: ${JSON.stringify({
            choices: [{ delta: {}, finish_reason: next.finishReason }],
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          })}\n\n`,
          'data: [DONE]\n\n',
        ]
        response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' })
        chunks.forEach(chunk => response.write(chunk))
        response.end()
        return
      }
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({
        choices: [{ finish_reason: next.finishReason, message: { role: 'assistant', content: next.body } }]
      }))
    })
  })
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        requests: () => requests.map(item => ({ ...item })),
        enqueue: response => { queue.push(response) },
        close: () => new Promise(done => server.close(() => done())),
      })
    })
  })
}

async function seedApplication(page, provider) {
  await page.evaluate(async seed => {
    const { baseUrl, projectId, volumeId, chapterId, volumeOutline, skillIds, ownerKey, s1Body } = seed
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'owner-breakpoint-provider',
        name: 'Owner Breakpoint Provider',
        baseUrl,
        apiKey: 'owner-breakpoint-local-key',
        models: ['owner-breakpoint-model'],
        selectedModel: 'owner-breakpoint-model',
        temperature: 0.1,
        maxTokens: 4096,
        contextWindowTokens: 128000,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
      }],
      generateProvider: 'owner-breakpoint-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: '断点生命周期实测',
      outlineText: '全书大纲',
      outlineLocked: true,
      outlineLockedText: '全书大纲',
      bookWordCount: 120000,
      volumesConfirmed: true,
      pipelineConfig: { volumeCount: 1, volumeWords: 200000, chapterWords: 3000 },
      chaptersConfirmed: true,
      settingsGenerated: true,
      settings: [],
      volumes: [{
        id: volumeId,
        name: '第一卷 雨夜',
        index: 0,
        outline: volumeOutline,
        summary: '雨夜中的灯塔纸条。',
        suggestedWords: 200000,
        confirmed: true,
        locked: true,
        isBound: true,
      }],
      chapters: {
        [volumeId]: [{
          id: chapterId,
          title: '第1章 纸条',
          index: 0,
          plot: '雨夜中主角检查旧灯塔底层的纸条。',
          summary: '雨夜中主角检查旧灯塔底层的纸条。',
          confirmed: true,
          pipelineGenerated: true,
          unitId: 'H1-01',
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
    await window.electronAPI.storageWrite('wa_skills', {
      skills: [
        {
          id: skillIds[0],
          name: 'S1 分析',
          format: 'text',
          template: '输出本步骤分析产物，不要解释。',
          category: 'pipeline',
          executionMode: 'chain',
          outputFormat: 'text',
          validationRules: [],
          splitSize: 1000,
          injectMode: 'system_prefix',
          bindTarget: 'project',
          linkedSkillIds: [],
          customVars: {},
          intents: ['generate'],
        },
        {
          id: skillIds[1],
          name: 'S2 生成',
          format: 'text',
          template: '输出本步骤生成正文，不要解释。',
          category: 'pipeline',
          executionMode: 'chain',
          outputFormat: 'text',
          validationRules: [],
          splitSize: 1000,
          injectMode: 'system_prefix',
          bindTarget: 'project',
          linkedSkillIds: [],
          customVars: {},
          intents: ['generate'],
        },
        {
          id: skillIds[2],
          name: 'S3 打磨',
          format: 'text',
          template: '输出打磨后的完整正文，不要解释。',
          category: 'pipeline',
          executionMode: 'chain',
          outputFormat: 'text',
          validationRules: [],
          splitSize: 1000,
          injectMode: 'system_prefix',
          bindTarget: 'project',
          linkedSkillIds: [],
          customVars: {},
          intents: ['generate'],
        },
      ],
      pipelineSkills: skillIds,
      deAiSkills: [],
    })
    await window.electronAPI.storageWrite('wa_pipeline_step_config', {
      agents: { 0: '', 1: '', 2: '', 3: '', 4: '' },
      skills: { 0: [], 1: [], 2: [], 3: [], 4: skillIds },
      modes: { 0: 'compose', 1: 'compose', 2: 'compose', 3: 'compose', 4: 'chain' },
      skillAgents: {},
    })
    await window.electronAPI.storageWrite('wa_deAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
    await window.electronAPI.storageRemove('wa_pipeline_breakpoint')
    await window.electronAPI.storageWrite(`wa_pipeline_breakpoint_owner_${ownerKey}:chapter-${chapterId}`, {
      kind: 'chain',
      status: 'completed',
      step: 4,
      projectId,
      ownerKey: `${ownerKey}:chapter-${chapterId}`,
      skillIndex: 2,
      skillId: skillIds[2],
      skillSequence: skillIds,
      lastSuccessChainIndex: 2,
      lastOutput: '旧正文：这不该被回放。',
      stepOutputs: [
        { skillIndex: 0, skillId: skillIds[0], output: s1Body },
      ],
      inputPrompt: '旧 prompt',
      agentId: '',
      retryCount: 0,
      updatedAt: new Date().toISOString(),
    })
  }, {
    baseUrl: `http://127.0.0.1:${provider.port}`,
    projectId: PROJECT_ID,
    volumeId: VOLUME_ID,
    chapterId: CHAPTER_ID,
    volumeOutline: VOLUME_OUTLINE,
    skillIds: SKILL_IDS,
    ownerKey: OWNER_KEY,
    s1Body: S1_BODY,
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20_000 })
  await sleep(1200)
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
  await sleep(300)
}

function snapshot(page) {
  return page.evaluate(() => {
    const pipeline = window.__pinia?._s?.get('pipeline')
    const trace = window.__pinia?._s?.get('runTrace')
    const run = [...(trace?.runs || [])]
      .filter(item => item.source === 'pipeline' && item.step === 4 && item.stepName === '正文层')
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    return {
      at: new Date().toISOString(),
      runId: run?.id || null,
      runStatus: run?.status || null,
      lastEventType: (run?.events || []).at(-1)?.type || null,
      progress: pipeline?.activeBodyRun?.progress ?? null,
      status: pipeline?.activeBodyRun?.statusText || null,
      pipelineRunStatus: pipeline?.activeBodyRun?.status || null,
      isGenerating: Boolean(pipeline?.isGenerating),
    }
  })
}

function startHeartbeat(page, electronPid) {
  let stopped = false
  const startedAtMs = Date.now()
  const worker = (async () => {
    let written = 0
    try {
      while (!stopped) {
        try {
          const state = { ...(await snapshot(page)), electronPid, frame: written + 1 }
          fs.appendFileSync(HEARTBEAT_PATH, `${JSON.stringify(state)}\n`, 'utf8')
          written += 1
        } catch (error) {
          fs.appendFileSync(HEARTBEAT_PATH,
            `${JSON.stringify({ at: new Date().toISOString(), error: String(error?.message || error), frame: written + 1 })}\n`, 'utf8')
          written += 1
        }
        await sleep(1000)
      }
    } catch {}
    return written
  })()
  return {
    async stop() {
      stopped = true
      return worker
    },
    frameCount() {
      try {
        return fs.readFileSync(HEARTBEAT_PATH, 'utf8').split('\n').filter(Boolean).length
      } catch { return 0 }
    },
    durationMs() {
      return Date.now() - startedAtMs
    },
  }
}

async function runBodyThroughUi(page) {
  await page.click('#btn-pipeline')
  await page.waitForSelector('#pipeline-panel', { timeout: 10_000 })
  await page.locator('#pl-steps .pl-step').nth(4).click()
  await page.waitForSelector('#pl-step-5-content', { state: 'visible' })
  const volumeSelect = page.locator('#pl-context-summary select').first()
  await volumeSelect.waitFor({ state: 'visible', timeout: 20_000 })
  await volumeSelect.selectOption({ index: 0 })
  await sleep(500)
  const chapterSelect = page.locator('#pl-context-summary select').nth(1)
  await chapterSelect.waitFor({ state: 'visible', timeout: 20_000 })
  await page.waitForFunction(() => {
    const select = document.querySelectorAll('#pl-context-summary select')[1]
    return Boolean(select && select.options.length > 0)
  }, null, { timeout: 20_000 })
  await chapterSelect.selectOption({ index: 0 })
  await page.click('#btn-primary-gen-body')

  let lastSignature = null
  let lastProgressAt = Date.now()
  let lastSnapshot = null
  const deadline = Date.now() + STEP_TIMEOUT_MS
  while (Date.now() < deadline) {
    const state = await snapshot(page)
    const signature = JSON.stringify(state)
    if (signature !== lastSignature) {
      lastSignature = signature
      lastProgressAt = Date.now()
      lastSnapshot = state
      console.log(`[BODY] ${JSON.stringify(state)}`)
    } else if (Date.now() - lastProgressAt >= DEAD_TIMEOUT_MS) {
      throw new Error(`body generation is dead for ${DEAD_TIMEOUT_MS}ms: ${JSON.stringify(lastSnapshot)}`)
    } else if (Date.now() - lastProgressAt >= STALLED_TIMEOUT_MS) {
      console.warn(`[STALL WARNING] body generation unchanged for ${Date.now() - lastProgressAt}ms`)
    }
    if (!state.isGenerating && state.runStatus && state.runStatus !== 'running') {
      return state
    }
    await sleep(500)
  }
  throw new Error(`body generation did not finish within ${STEP_TIMEOUT_MS}ms: ${JSON.stringify(lastSnapshot)}`)
}

function parseDetail(value) {
  if (typeof value !== 'string') return value || {}
  try { return JSON.parse(value) } catch { return { raw: value } }
}

async function currentRun(page) {
  return page.evaluate(({ chapterId }) => {
    const trace = window.__pinia?._s?.get('runTrace')
    const run = [...(trace?.runs || [])]
      .filter(item => item.source === 'pipeline' && item.step === 4 && item.stepName === '正文层')
      .sort((a, b) => b.startedAt - a.startedAt)[0] || null
    const project = window.__pinia?._s?.get('project')
    const chapter = Object.values(project?.chapters || {})
      .flat()
      .find(item => item?.id === chapterId)
    return { run, body: String(chapter?.body || '') }
  }, { chapterId: CHAPTER_ID })
}

async function main() {
  const diskManifest = assertFreshRendererBuild()
  assertIsolatedStorage()
  fs.rmSync(EVIDENCE_ROOT, { recursive: true, force: true })
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })

  const watchdog = setTimeout(() => {
    console.error(`[FAIL] global timeout after ${GLOBAL_TIMEOUT_MS}ms`)
    process.exit(1)
  }, GLOBAL_TIMEOUT_MS)
  watchdog.unref()

  const provider = await startProvider()
  const electronProcess = startElectron()
  let browser = null
  let page = null
  let heartbeat = null
  try {
    assert(await waitForCdp(), 'CDP reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    page = await connectPage(browser)
    page.on('pageerror', error => console.error(`[PAGE ERROR] ${error.message}`))
    page.on('crash', () => console.error('[PAGE CRASH] renderer process crashed'))
    page.on('console', message => {
      if (message.type() === 'error') console.error(`[PAGE ERROR] ${String(message.text()).slice(0, 600)}`)
    })
    await page.waitForSelector('#app', { timeout: 20_000 })
    await sleep(1500)
    await seedApplication(page, provider)

    // First chain must complete so the final artifact validator can produce
    // too_short. Targeted repair then starts at S2 and reuses persisted S1.
    provider.enqueue({ body: S1_BODY, finishReason: 'stop' })
    provider.enqueue({ body: S2_VALID_BODY, finishReason: 'stop' })
    provider.enqueue({ body: S3_SHORT_BODY, finishReason: 'stop' })
    provider.enqueue({ body: S2_VALID_BODY, finishReason: 'stop' })
    provider.enqueue({ body: S3_POLISHED_BODY, finishReason: 'stop' })

    heartbeat = startHeartbeat(page, electronProcess.pid)
    const state = await runBodyThroughUi(page)
    const { run, body } = await currentRun(page)
    const events = run?.events || []
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'trace-run.json'),
      JSON.stringify(run, null, 2), 'utf8')
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'provider-requests.json'),
      JSON.stringify(provider.requests(), null, 2), 'utf8')
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'final-body.txt'), body, 'utf8')

    assert(events.some(event => event.type === 'chain-completed-checkpoint-rejected'),
      'completed owner checkpoint is explicitly rejected in trace')
    assert(!events.some(event => event.type === 'body-targeted-repair-artifact-missing'),
      'targeted repair finds the persisted S1 artifact and does not downgrade to a full chain')
    const firstChainStepCount = events.filter(event =>
      event.type === 'chain-step' && event.label === '链式步骤 1/3').length
    assert.equal(firstChainStepCount, 1,
      `the first fresh chain runs S1 exactly once, got ${firstChainStepCount}`)
    assert.equal(state.runStatus, 'success', `targeted repair completes the run, got ${state.runStatus}`)
    assert.equal(state.isGenerating, false, 'generation lock is released')
    assert(!body.includes('这不该被回放'), 'stale completed breakpoint output is not persisted')
    assert(body.includes('潮声第100次'), 'the repaired polished body is persisted')

    const attemptEvents = events.filter(event => event.type === 'body-artifact-attempt')
    assert.equal(attemptEvents.length, 2,
      `one fresh-chain attempt and one targeted repair attempt are recorded, got ${attemptEvents.length}`)
    const attemptLedger = attemptEvents.map(event => {
      const detail = parseDetail(event.detail)
      return {
        repairAttempt: detail.repairAttempt,
        repairScope: detail.repairScope,
        status: detail.status,
        wordCount: detail.wordCount,
        requestCount: detail.requestFingerprint?.physicalRequests
      }
    })
    assert.deepEqual(attemptLedger, [
      { repairAttempt: 0, repairScope: 'none', status: 'too_short', wordCount: 4, requestCount: 3 },
      { repairAttempt: 1, repairScope: 'targeted', status: 'complete', wordCount: 2600, requestCount: 2 }
    ], `body attempt ledger must prove one failed fresh chain and one targeted repair: ${JSON.stringify(attemptLedger)}`)

    const runtimeFingerprint = run?.runtimeFingerprint
    assert.deepEqual(runtimeFingerprint, {
      source: 'vite-manifest',
      manifestVersion: String(diskManifest.schemaVersion),
      commit: diskManifest.commit,
      buildTime: diskManifest.buildTime
    }, 'trace runtime fingerprint matches the disk build manifest')

    assert(!events.some(event => event.type.includes('echo') && event.level === 'warn'),
      'final polish overlap is exempt from echo repair warnings')

    const requestCount = provider.requests().length
    assert.equal(requestCount, 5,
      `fresh chain uses 3 requests and targeted repair uses 2, got ${requestCount}`)
    const targetedGeneratorRequest = JSON.parse(provider.requests()[3].bodyText)
    const targetedGeneratorPrompt = targetedGeneratorRequest.messages
      .find(message => message.role === 'user')?.content || ''
    assert(targetedGeneratorPrompt.includes(S1_BODY),
      'the targeted generator request reuses the persisted S1 artifact')

    const heartbeatFrames = heartbeat.frameCount()
    const heartbeatDuration = heartbeat.durationMs()
    assert(Number.isFinite(heartbeatDuration), 'heartbeat duration is recorded')
    assert(heartbeatFrames >= 1, `heartbeat records the run, got ${heartbeatFrames} frames`)
    assert(heartbeatFrames >= Math.max(1, Math.floor(heartbeatDuration / 1200)),
      `heartbeat cadence is continuous for ${heartbeatDuration}ms, got ${heartbeatFrames} frames`)

    await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'success.png'), fullPage: false })
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'report.json'), JSON.stringify({
      schema: 'shenyi.owner-breakpoint-closure.electron',
      version: 1,
      generatedAt: new Date().toISOString(),
      script: SCRIPT_NAME,
      runId: state.runId,
      status: state.runStatus,
      requestCount,
      targetedRequestCount: 2,
      completedCheckpointRejected: true,
      targetedGeneratorStep: true,
      persistedS1ArtifactReused: true,
      bodyAttemptLedger: attemptLedger,
      runtimeFingerprint,
      generationStepFingerprint: {
        physicalRequests: requestCount,
      },
      heartbeatFrames,
      heartbeatDurationMs: heartbeatDuration,
    }, null, 2), 'utf8')
    console.log('===== OWNER BREAKPOINT CLOSURE ELECTRON PASSED =====')
  } finally {
    heartbeat?.stop()
    closeElectron(electronProcess)
    try { await browser?.close() } catch {}
    await provider.close()
    clearTimeout(watchdog)
    if (!KEEP_PROFILE) {
      await removeDir(PROFILE)
    }
  }
}

main().catch(error => {
  console.error('[FAIL]', error)
  process.exitCode = 1
})
