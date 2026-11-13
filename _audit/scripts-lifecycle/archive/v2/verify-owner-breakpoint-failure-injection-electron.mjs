import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = path.resolve(process.cwd())
const SCRIPT_NAME = 'verify-owner-breakpoint-failure-injection-electron.mjs'
const ELECTRON_EXE = process.env.SHENYI_OWNER_BREAKPOINT_FAILURE_ELECTRON
  ? path.resolve(process.env.SHENYI_OWNER_BREAKPOINT_FAILURE_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_OWNER_BREAKPOINT_FAILURE_CDP_PORT || 9393)
const PROFILE = path.join(ROOT, '_data', 'owner-breakpoint-failure-profile')
const DATA_DIR = path.join(PROFILE, 'documents-data')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-owner-breakpoint-failure-injection-electron')
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const HEARTBEAT_PATH = path.join(EVIDENCE_ROOT, 'heartbeat.jsonl')
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_OWNER_BREAKPOINT_FAILURE_GLOBAL_TIMEOUT_MS || 8 * 60_000)
const STEP_TIMEOUT_MS = Number(process.env.SHENYI_OWNER_BREAKPOINT_FAILURE_STEP_TIMEOUT_MS || 150_000)
const STALLED_TIMEOUT_MS = Number(process.env.SHENYI_OWNER_BREAKPOINT_FAILURE_STALLED_TIMEOUT_MS || 20_000)
const DEAD_TIMEOUT_MS = Number(process.env.SHENYI_OWNER_BREAKPOINT_FAILURE_DEAD_TIMEOUT_MS || 45_000)
const KEEP_PROFILE = process.env.SHENYI_OWNER_BREAKPOINT_FAILURE_KEEP_PROFILE === '1'

const PROJECT_ID = 'owner-breakpoint-failure'
const LEGACY_PROJECT_ID = `p${PROJECT_ID}`
const VOLUME_ID = 'volume-owner-breakpoint-failure'
const CHAPTER_ID = 'chapter-owner-breakpoint-failure-1'
const SHARED_KEY = 'wa_pipeline_breakpoint'
const SKILL_IDS = ['OWNER-BP-FAIL-S1', 'OWNER-BP-FAIL-S2', 'OWNER-BP-FAIL-S3']

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

const S1_BODY = 'S1 分析：主角在雨夜检查灯塔纸条，发现维护记录疑点。'
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
}

function startElectron(injectRemoveKey) {
  const extraEnv = {}
  if (injectRemoveKey) {
    extraEnv.SHENYI_TEST_STORAGE_REMOVE_FAILURE_KEY = injectRemoveKey
  }
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
      ...extraEnv,
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

async function seedApplication(page, provider, scenario, ownerKey) {
  const skills = scenario.name === 'v7'
    ? [
      {
        id: SKILL_IDS[0],
        name: 'S1',
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
        meta: { chainHandoff: { role: 'analysis' } },
        intents: ['generate'],
      },
      {
        id: 'folder:owner-bp-degraded',
        sourceId: 'owner-bp-degraded',
        name: '降级输出实测',
        format: 'folder',
        folderPath: scenario.folderPath,
        template: '必须输出 JSON。',
        category: 'folder',
        description: 'degraded 输出行为实测',
        executionMode: 'chain',
        outputFormat: 'text',
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
      },
    ]
    : SKILL_IDS.map((skillId, index) => ({
        id: skillId,
        name: `S${index + 1}`,
        format: 'text',
        template: index === 0
          ? '输出本步骤分析产物，不要解释。'
          : index === 1
            ? '输出本步骤生成正文，不要解释。'
            : '输出打磨后的完整正文，不要解释。',
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
      }))
  const pipelineSkills = scenario.name === 'v7'
    ? [SKILL_IDS[0], 'folder:owner-bp-degraded']
    : SKILL_IDS

  await page.evaluate(async seed => {
    const { baseUrl, legacyProjectId, volumeId, chapterId, volumeOutline, skills, pipelineSkills, ownerKey,
      sharedBreakpoint, ownerBreakpoint } = seed
    await window.electronAPI.storageWrite('wa_lastProjectId', legacyProjectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'owner-breakpoint-failure-provider',
        name: 'Owner Breakpoint Failure Provider',
        baseUrl,
        apiKey: 'owner-breakpoint-failure-local-key',
        models: ['owner-breakpoint-failure-model'],
        selectedModel: 'owner-breakpoint-failure-model',
        temperature: 0.1,
        maxTokens: 4096,
        contextWindowTokens: 128000,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
      }],
      generateProvider: 'owner-breakpoint-failure-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${legacyProjectId}`, {
      schemaVersion: 3,
      projectName: '断点故障注入实测',
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
    await window.electronAPI.storageWrite('wa_skills', { skills, pipelineSkills })
    await window.electronAPI.storageWrite('wa_pipeline_step_config', {
      agents: { 0: '', 1: '', 2: '', 3: '', 4: '' },
      skills: { 0: [], 1: [], 2: [], 3: [], 4: pipelineSkills },
      modes: { 0: 'compose', 1: 'compose', 2: 'compose', 3: 'compose', 4: 'chain' },
      skillAgents: {},
    })
    await window.electronAPI.storageWrite('wa_deAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
    await window.electronAPI.storageRemove('wa_pipeline_breakpoint')
    await window.electronAPI.storageRemove(`wa_pipeline_breakpoint_owner_${ownerKey}`)
    if (sharedBreakpoint) {
      await window.electronAPI.storageWrite('wa_pipeline_breakpoint', sharedBreakpoint)
    }
    if (ownerBreakpoint) {
      await window.electronAPI.storageWrite(`wa_pipeline_breakpoint_owner_${ownerKey}`, ownerBreakpoint)
    }
  }, {
    baseUrl: `http://127.0.0.1:${provider.port}`,
    projectId: LEGACY_PROJECT_ID,
    volumeId: VOLUME_ID,
    chapterId: CHAPTER_ID,
    volumeOutline: VOLUME_OUTLINE,
    skills,
    pipelineSkills,
    ownerKey,
    legacyProjectId: LEGACY_PROJECT_ID,
    sharedBreakpoint: scenario.name === 'v10' ? {
      kind: 'chapters',
      volumeIndex: 0,
      chapterIndex: 0,
      total: 1,
      projectId: PROJECT_ID,
      updatedAt: new Date().toISOString(),
    } : null,
    ownerBreakpoint: null,
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
    const skill = window.__pinia?._s?.get('skill')
    const pipelineConfig = window.__pinia?._s?.get('pipeline')
    const pipelinePanel = document.querySelector('#pipeline-panel')
    const trace = window.__pinia?._s?.get('runTrace')
    const run = [...(trace?.runs || [])]
      .filter(item => item.source === 'pipeline' && item.step === 4 && item.stepName === '正文层')
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    return {
      at: new Date().toISOString(),
      runId: run?.id || null,
      runStatus: run?.status || null,
      lastEventType: (run?.events || []).at(-1)?.type || null,
      eventCount: (run?.events || []).length,
      apiCallCount: (run?.apiCalls || []).length,
      progress: pipeline?.activeBodyRun?.progress ?? null,
      status: pipeline?.activeBodyRun?.statusText || null,
      pipelineRunStatus: pipeline?.activeBodyRun?.status || null,
      isGenerating: Boolean(pipeline?.isGenerating),
      skillIds: (skill?.skills || []).map(item => item.id),
      pipelineSkills: skill?.pipelineSkills || null,
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
  const panelAlreadyOpen = await page.locator('#pipeline-panel').isVisible()
  if (!panelAlreadyOpen) await page.click('#btn-pipeline')
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

async function openBodyWorkspace(page) {
  await page.click('#btn-pipeline')
  await page.waitForSelector('#pipeline-panel', { timeout: 10_000 })
  await page.locator('#pl-steps .pl-step').nth(4).click()
  await page.waitForSelector('#pl-step-5-content', { state: 'visible' })
  await sleep(300)
}

async function configureBodySkillsThroughUi(page, skillIds) {
  const existingChips = page.locator('#pl-s5-skills-list .pl-skill-chip')
  while (await existingChips.count()) {
    await existingChips.first().locator('.pl-chip-close').click()
    await sleep(150)
  }
  const select = page.locator('#pl-s5-skill')
  for (const skillId of skillIds) {
    const chipCount = await existingChips.count()
    await select.selectOption(skillId)
    await page.locator('#pl-s5-add-skill').click()
    // Chips render displaySkillName, not raw skill IDs; validate the real UI state.
    await page.waitForFunction(({ expectedCount }) =>
      document.querySelectorAll('#pl-s5-skills-list .pl-skill-chip').length >= expectedCount,
    { expectedCount: chipCount + 1 }, { timeout: 10_000 })
    const chipText = await existingChips.nth(chipCount).textContent()
    const expectedName = await page.evaluate(expectedId => {
      const skill = window.__pinia?._s?.get('skill')?.skills?.find(item => item?.id === expectedId)
      return skill ? (skill.format === 'folder' ? `${skill.name}（文件夹）` : `${skill.name}（文本）`) : null
    }, skillId)
    assert(expectedName && chipText.includes(expectedName),
      `skill chip for ${skillId} should render ${expectedName}, got ${chipText}`)
  }
  await sleep(300)
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

async function storageRead(page, key) {
  return page.evaluate(async storageKey => window.electronAPI.storageRead(storageKey), key)
}

function writeDegradedSkillFolder(folderPath) {
  fs.mkdirSync(folderPath, { recursive: true })
  fs.writeFileSync(path.join(folderPath, 'SKILL.md'), [
    '---',
    'id: owner-bp-degraded',
    'name: 降级输出实测',
    'description: folder SKILL degraded 行为实测',
    'format: folder',
    '---',
    '',
    '你是正文生成技能，只输出 JSON。',
  ].join('\n'), 'utf8')
  fs.writeFileSync(path.join(folderPath, 'template.md'),
    '输出 JSON：{"body":"..."}。', 'utf8')
  fs.writeFileSync(path.join(folderPath, 'meta.json'),
    JSON.stringify({ chainHandoff: { role: 'generator' } }, null, 2), 'utf8')
  // schema.json must be syntactically valid: the loader ignores malformed
  // JSON. A valid schema that the response cannot satisfy drives three real
  // physical requests before the executor returns degraded-with-output.
  fs.writeFileSync(path.join(folderPath, 'schema.json'), JSON.stringify({
    type: 'object',
    required: ['body', 'requiredMissingField'],
    properties: {
      body: { type: 'string', minLength: 1800 },
      requiredMissingField: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  }, null, 2), 'utf8')
}

function parseDetail(value) {
  if (typeof value !== 'string') return value || {}
  try { return JSON.parse(value) } catch { return { raw: value } }
}

async function runScenario(provider, scenario) {
  const scenarioOwnerKey = `pipeline:${LEGACY_PROJECT_ID}:step-4:chapter-${CHAPTER_ID}`
  const scenarioOwnerStorageKey = `wa_pipeline_breakpoint_owner_${scenarioOwnerKey}`
  const injectRemoveKey = scenario.name === 'v6' ? scenarioOwnerStorageKey : null
    const electronProcess = startElectron(injectRemoveKey)
    let browser = null
    let page = null
  let heartbeat = null
  const requestsBefore = provider.requests().length
  pageErrors = []
  try {
    assert(await waitForCdp(), 'CDP reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    page = await connectPage(browser)
    page.on('pageerror', error => {
      pageErrors.push(error.message)
      console.error(`[PAGE ERROR] ${error.message}`)
    })
    page.on('crash', () => console.error('[PAGE CRASH] renderer process crashed'))
    page.on('console', message => {
      if (message.type() === 'error') console.error(`[PAGE ERROR] ${String(message.text()).slice(0, 600)}`)
    })
    await page.waitForSelector('#app', { timeout: 20_000 })
    await sleep(1500)
    await seedApplication(page, provider, scenario, scenarioOwnerKey)
    await page.waitForFunction(expectedId => {
      const project = window.__pinia?._s?.get('project')
      return project?.currentProjectId === expectedId
    }, LEGACY_PROJECT_ID, { timeout: 20_000 })

    if (scenario.name === 'v6') {
      provider.enqueue({ body: S1_BODY, finishReason: 'stop' })
      provider.enqueue({ body: S2_VALID_BODY, finishReason: 'stop' })
      provider.enqueue({ body: S3_POLISHED_BODY, finishReason: 'stop' })
    } else if (scenario.name === 'v10') {
      provider.enqueue({ body: S1_BODY, finishReason: 'stop' })
      provider.enqueue({ body: S2_VALID_BODY, finishReason: 'stop' })
      provider.enqueue({ body: S3_POLISHED_BODY, finishReason: 'stop' })
    } else if (scenario.name === 'v7') {
      await openBodyWorkspace(page)
      await configureBodySkillsThroughUi(page, [SKILL_IDS[0], 'folder:owner-bp-degraded'])
      provider.enqueue({ body: S1_BODY, finishReason: 'stop' })
      const degradedBody = JSON.stringify({ body: 'degraded but usable short body' })
      provider.enqueue({ body: degradedBody, finishReason: 'stop' })
      provider.enqueue({ body: degradedBody, finishReason: 'stop' })
      provider.enqueue({ body: degradedBody, finishReason: 'stop' })
    }

    heartbeat = startHeartbeat(page, electronProcess.pid)
    const state = await runBodyThroughUi(page)
    const { run, body } = await currentRun(page)
    const events = run?.events || []
    console.log(`[SEED AUDIT] ${JSON.stringify({
      scenario: scenario.name,
      skillIds: state.skillIds,
      pipelineSkills: state.pipelineSkills,
      chainStepEvents: events.filter(event => event.type === 'chain-step').map(event => event.detail),
    })}`)
    const scenarioRequests = provider.requests().slice(requestsBefore)
    const result = {
      scenario,
      state,
      run,
      body,
      events,
      requests: scenarioRequests,
      heartbeatFrames: heartbeat.frameCount(),
      heartbeat: { durationMs: heartbeat.durationMs() },
      injectedRemoveKey: injectRemoveKey,
    }

    assert(result.heartbeatFrames >= 1,
      `${scenario.name} heartbeat records the run, got ${result.heartbeatFrames} frames`)
    const heartbeatDuration = result.heartbeat.durationMs
    assert(Number.isFinite(heartbeatDuration), `${scenario.name} heartbeat duration is recorded`)
    assert(result.heartbeatFrames >= Math.max(1, Math.floor(heartbeatDuration / 1200)),
      `${scenario.name} heartbeat cadence is continuous for ${heartbeatDuration}ms, got ${result.heartbeatFrames} frames`)
    assert.equal(state.isGenerating, false, `${scenario.name} generation lock is released`)

    if (scenario.name === 'v6') {
      const event = events.find(item => item.type === 'chain-breakpoint-clear-failed')
      assert(event, 'V6 records chain-breakpoint-clear-failed')
      assert.equal(event.level, 'error', 'V6 clear failure is error-level')
      assert.equal(result.injectedRemoveKey, scenarioOwnerStorageKey,
        'V6 failure injection targets the owner slot through the main-process storage bridge')
      assert.equal(state.runStatus, 'failed', `V6 run fails instead of claiming success, got ${state.runStatus}`)
      const persistedOwner = await storageRead(page, scenarioOwnerStorageKey)
      assert(persistedOwner, 'V6 keeps the owner checkpoint when removal fails')
      assert(scenarioRequests.length >= 3,
        `V6 completes the chain before clear failure, got ${scenarioRequests.length} requests`)
      assert(!body.includes('这不该被回放'),
        `V6 does not persist a replayed stale body, got body length ${body.length}`)
    }

    if (scenario.name === 'v10') {
      assert.equal(state.runStatus, 'success', `V10 chain succeeds, got ${state.runStatus}`)
      const ownerAfterChain = await storageRead(page, scenarioOwnerStorageKey)
      assert.equal(ownerAfterChain, null, 'V10 chain success clears the owner slot')
      const sharedAfterChain = await storageRead(page, SHARED_KEY)
      assert(sharedAfterChain?.kind === 'chapters',
        `V10 shared chapter slot survives owner cleanup, got ${JSON.stringify(sharedAfterChain)}`)
      await page.evaluate(async () => {
        await window.__pinia?._s?.get('pipeline')?.clearBreakpoint?.()
      })
      const sharedAfterClear = await storageRead(page, SHARED_KEY)
      assert.equal(sharedAfterClear, null, 'V10 explicit shared clear removes the shared slot')
      const ownerAfterSharedClear = await storageRead(page, scenarioOwnerStorageKey)
      assert.equal(ownerAfterSharedClear, null, 'V10 shared clear does not recreate the owner slot')
    }

    if (scenario.name === 'v7') {
      const event = events.find(item => item.type === 'folder-skill-degraded-with-error')
      assert(event, 'V7 records folder-skill-degraded-with-error')
      assert.equal(event.level, 'warn', 'V7 degraded-with-error is a warning event')
      assert.equal(state.runStatus, 'failed',
        `V7 degraded body must still fail the generation contract, got ${state.runStatus}`)
      assert.equal(scenarioRequests.length, 4,
        `V7 runs S1 plus three schema-failed folder attempts before contract termination, got ${scenarioRequests.length}`)
      const rejectedEvent = events.find(item => item.type === 'body-generator-step-rejected')
      assert(rejectedEvent, 'V7 records the degraded generator rejection')
      assert.equal(parseDetail(rejectedEvent.detail).reason, 'degraded_plus_contract_failure',
        `V7 labels the failure as degraded_plus_contract_failure, got ${rejectedEvent.detail}`)
      assert(!body.includes('degraded but usable short body'),
        'V7 degraded raw output is not persisted as chapter body')
    }

    return result
  } finally {
    await heartbeat?.stop()
    closeElectron(electronProcess)
    try { await browser?.close() } catch {}
    await sleep(800)
  }
}

let pageErrors = []

async function main() {
  assertFreshRendererBuild()
  fs.rmSync(EVIDENCE_ROOT, { recursive: true, force: true })
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  fs.rmSync(PROFILE, { recursive: true, force: true })
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
  const degradedSkillPath = path.join(PROFILE, 'skills', 'owner-bp-degraded')
  writeDegradedSkillFolder(degradedSkillPath)

  const provider = await startProvider()
  const watchdog = setTimeout(() => {
    console.error(`[FAIL] global timeout after ${GLOBAL_TIMEOUT_MS}ms`)
    process.exit(1)
  }, GLOBAL_TIMEOUT_MS)
  watchdog.unref()

  const scenarios = [
    { name: 'v6', folderPath: null },
    { name: 'v10', folderPath: null },
    { name: 'v7', folderPath: degradedSkillPath },
  ]
  const results = []
  try {
    for (const scenario of scenarios) {
      console.log(`===== SCENARIO ${scenario.name.toUpperCase()} START =====`)
      const result = await runScenario(provider, scenario)
      results.push(result)
      const scenarioRoot = path.join(EVIDENCE_ROOT, scenario.name)
      fs.mkdirSync(scenarioRoot, { recursive: true })
      fs.writeFileSync(path.join(scenarioRoot, 'trace-run.json'), JSON.stringify(result.run, null, 2), 'utf8')
      fs.writeFileSync(path.join(scenarioRoot, 'provider-requests.json'),
        JSON.stringify(result.requests, null, 2), 'utf8')
      fs.writeFileSync(path.join(scenarioRoot, 'body.txt'), result.body, 'utf8')
      fs.writeFileSync(path.join(scenarioRoot, 'snapshot.json'), JSON.stringify(result.state, null, 2), 'utf8')
      fs.appendFileSync(HEARTBEAT_PATH,
        `${JSON.stringify({ scenario: scenario.name, frames: result.heartbeatFrames, boundary: true })}\n`, 'utf8')
      console.log(`===== SCENARIO ${scenario.name.toUpperCase()} PASSED =====`)
    }

    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'provider-requests.json'),
      JSON.stringify(provider.requests(), null, 2), 'utf8')
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'report.json'), JSON.stringify({
      schema: 'shenyi.owner-breakpoint-failure-injection.electron',
      version: 1,
      generatedAt: new Date().toISOString(),
      script: SCRIPT_NAME,
      scenarios: results.map(result => ({
        scenario: result.scenario,
        runId: result.state.runId,
        status: result.state.runStatus,
        requestCount: result.requests.length,
        heartbeatFrames: result.heartbeatFrames,
        eventTypes: result.events.map(event => event.type),
      })),
      hardRules: {
        visibleElectron: true,
        realUiOperation: '#btn-pipeline / #pl-steps .pl-step:nth(5) / #pl-context-summary selects / #btn-primary-gen-body',
        storageFailureInjectionOnly: true,
        noSkillInjection: true,
        localMockProvider: true,
        continuousHeartbeat: true,
      },
    }, null, 2), 'utf8')
    console.log('===== OWNER BREAKPOINT FAILURE INJECTION ELECTRON PASSED =====')
  } catch (error) {
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'failure.json'), JSON.stringify({
      message: error instanceof Error ? error.message : String(error),
      stack: error?.stack,
      pageErrors,
      scenarios: results.map(result => ({
        scenario: result.scenario,
        run: result.run,
        events: result.events,
        requests: result.requests,
      })),
    }, null, 2), 'utf8')
    throw error
  } finally {
    clearTimeout(watchdog)
    await provider.close()
    if (!KEEP_PROFILE) await removeDir(PROFILE)
  }
}

main().catch(error => {
  console.error('[FAIL]', error)
  process.exitCode = 1
})
