import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = path.resolve(process.cwd())
const SCRIPT_NAME = 'verify-deai-stage-guidance-live.mjs'
const ELECTRON_EXE = process.env.SHENYI_DEAI_LIVE_ELECTRON
  ? path.resolve(process.env.SHENYI_DEAI_LIVE_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_DEAI_LIVE_CDP_PORT || 9387)
const CREDENTIAL_FILE = process.env.SHENYI_DEAI_LIVE_PROVIDER_FILE
  || 'D:/神意助手数据/wa_providers.json'
const PROVIDER_ID = process.env.SHENYI_DEAI_LIVE_PROVIDER_ID || 'prov-1788185503573'
const APP_USER_DATA_DIR = process.env.SHENYI_DEAI_LIVE_APP_USER_DATA
  || 'D:/神意助手数据/_app-user-data'
const KEY_DECRYPT_TIMEOUT_MS = Number(process.env.SHENYI_DEAI_LIVE_KEY_DECRYPT_TIMEOUT_MS || 30_000)
const PROFILE = path.join(ROOT, '_data', 'deai-stage-guidance-live-profile')
const DATA_DIR = path.join(PROFILE, 'documents-data')
const RUN_STAMP = process.env.SHENYI_DEAI_LIVE_EVIDENCE_RUN
  || new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-')
const EXPORT_ROOT = path.join(ROOT, '_data', 'deai-stage-guidance-live-exports', RUN_STAMP)
const EVIDENCE_ROOT = process.env.SHENYI_DEAI_LIVE_EVIDENCE_ROOT
  ? path.resolve(process.env.SHENYI_DEAI_LIVE_EVIDENCE_ROOT)
  : path.join(ROOT, '_audit', 'verification-deai-stage-guidance-live', `run-${RUN_STAMP}`)
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const HEARTBEAT_PATH = path.join(EVIDENCE_ROOT, 'heartbeat.jsonl')
const CHAPTER_COUNT = Number(process.env.SHENYI_DEAI_LIVE_CHAPTERS || 3)
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_DEAI_LIVE_GLOBAL_TIMEOUT_MS || 100 * 60_000)
const CHAPTER_TIMEOUT_MS = Number(process.env.SHENYI_DEAI_LIVE_CHAPTER_TIMEOUT_MS || 30 * 60_000)
const STALLED_TIMEOUT_MS = Number(process.env.SHENYI_DEAI_LIVE_STALLED_TIMEOUT_MS || 60_000)
const DEAD_TIMEOUT_MS = Number(process.env.SHENYI_DEAI_LIVE_DEAD_TIMEOUT_MS || 3 * 60_000)
const KEEP_PROFILE = process.env.SHENYI_DEAI_LIVE_KEEP_PROFILE === '1'
const SOURCE_SKILL_ROOT = 'D:/codex/玄武规划SKILL/凯旋-正文层'
const SKILL_FOLDERS = ['kaixuan-s1', 'kaixuan-s2', 'kaixuan-s3']
const PROJECT_ID = 'deai-stage-guidance-live-observational'

const OUTLINE_TEXT = [
  '# 降AI协同真实供应商观测',
  '',
  '## 卷级常任约束',
  '> 作用域：卷级常任',
  '- POV 固定为周砚；许知微只在灯塔、码头和渔船预约点出现。',
  '- 风暴信标、旧航道沉船名单、南方航线暗礁图和清晨渔船是本卷核心事实链。',
  '- 禁止提前释放：名单私章背后的家族旧案。',
  '',
  '## 剧情单元 H1-01 风暴起点',
  '> 作用域：单元级 H1-01',
  '章节范围：第 1 - 3 章',
  '- H1-01-E1：周砚确认风暴信标的三次红色闪烁，判断风暴窗口比预报提前。',
  '- H1-01-E2：许知微交出旧航道沉船名单，周砚认出末页私章。',
  '- H1-01-E3：两人核对南方航线暗礁图，确认清晨渔船是唯一可用船期。',
  '- H1-01-E4：两人预约清晨渔船并约定接头暗号，章末留下私章来源未明的威胁。',
].join('\n')

const SETTINGS_COLLECTION = {
  categories: ['人物'],
  items: {
    人物: [
      {
        id: 'set-live-zhou-yan',
        name: '周砚',
        category: '人物',
        content: '冷静、行动优先、话少但判断快；面对证据先核对再行动，不把猜测说成结论。',
        status: 'locked',
        lockedAt: 1793660000000,
      },
      {
        id: 'set-live-xu-zhiwei',
        name: '许知微',
        category: '人物',
        content: '谨慎、幽默、话痨；习惯用反问和短句催促周砚，但交出关键证据前会先确认风险。',
        status: 'locked',
        lockedAt: 1793660000000,
      },
    ],
  },
}

const STYLE_PROFILE = {
  profileVersion: 1,
  styleTags: '悬疑递增、行为驱动、克制对白、生活噪音、动作优先',
  pacingParams: '速度：中快；张力：4；密度：中高；视角：周砚单视角；语气：冷峻但有生活气',
  pacingParamsObj: {
    speed: '中快',
    tension: 4,
    density: '中高',
    perspective: '周砚单视角',
    tone: '冷峻但有生活气',
  },
  customStyleTags: [],
  aiPacingSnapshot: null,
  locked: true,
  lockedAt: 1793660000000,
  source: 'manual',
}

function chapterPlot(index) {
  const hooks = [
    '章末钩子：信标第三次闪烁后，灯塔外海面出现一道未被预报的暗涌。',
    '章末钩子：名单末页私章与许知微袖口旧印相同，来源未明。',
    '章末钩子：渔船预约单背面出现第二套接头暗号，署名缺失。',
  ]
  return [
    `第${index}章施工输入（来源编号：H1-01-E1；H1-01-E2；H1-01-E3；H1-01-E4）。`,
    'POV：周砚。',
    '空间相对位置：周砚在灯塔底层控制台前，许知微在他右侧两步，信标指示灯在正前方一臂，出口在身后六步；观察半径为控制台灯光可及的三步，暗处只允许听声和转述进入。',
    '目标：确认风暴信标、核对沉船名单与南方航线、预约清晨渔船。',
    '行动：周砚计数三次红色闪烁→接过许知微递来的名单→翻到末页认出私章→两人摊开暗礁图核对航线→到码头预约渔船并约定接头暗号。',
    '阻碍：风暴窗口压缩核对时间；名单私章引发信任风险；暗礁图与预报航线存在偏差；渔船船主只接受清晨出航。',
    '转变：信标确认导致行动从观望转为出航准备；名单到手带来私章疑点；暗礁核对确认唯一航线；渔船预约把风险转化为可执行计划。',
    hooks[Math.min(index - 1, hooks.length - 1)],
  ].join('\n')
}

const CHAPTERS = Array.from({ length: CHAPTER_COUNT }, (_, index) => ({
  id: `ch-deai-live-${index + 1}`,
  unitId: 'H1-01',
  title: `第${index + 1}章 风暴信标`,
  plot: chapterPlot(index + 1),
  summary: [
    '第1章：三次红色闪烁把观望变成出航准备。',
    '第2章：沉船名单末页的私章把合作推进变成信任考验。',
    '第3章：暗礁图与预约单把风暴风险落成清晨行动。',
  ][Math.min(index, 2)],
  confirmed: true,
  pipelineGenerated: true,
  bodyGenerated: false,
}))

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

function copyDirectory(source, target) {
  fs.mkdirSync(target, { recursive: true })
  fs.cpSync(source, target, { recursive: true, force: true })
}

function loadLiveProvider() {
  const stored = readJson(CREDENTIAL_FILE)
  const provider = (stored?.providers || []).find(item => item?.id === PROVIDER_ID)
  assert(provider, `live provider exists: ${PROVIDER_ID}`)
  const baseUrl = String(provider.baseUrl || '').replace(/\/+$/, '')
  const apiKey = String(provider.apiKey || '')
  assert(baseUrl.startsWith('https://'), 'live provider baseUrl is https')
  assert(apiKey.length > 0, 'live provider apiKey exists')
  return {
    id: provider.id,
    name: provider.name,
    baseUrl,
    encryptedApiKey: apiKey.startsWith('enc:') ? apiKey : null,
    model: String(provider.selectedModel || provider.models?.[0] || ''),
    temperature: Number(provider.temperature ?? 0.1),
    maxTokens: Number(provider.maxTokens || 0),
    contextWindowTokens: Number(provider.contextWindowTokens || 0),
    streamMode: provider.streamMode !== false,
  }
}

async function decryptLiveProviderKey(provider) {
  if (!provider.encryptedApiKey) return provider.apiKey
  const helperPath = path.join(ROOT, 'scripts', 'decrypt-provider-key-for-live.mjs')
  const child = spawn(ELECTRON_EXE, [helperPath], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SHENYI_DEAI_LIVE_PROVIDER_FILE: CREDENTIAL_FILE,
      SHENYI_DEAI_LIVE_PROVIDER_ID: PROVIDER_ID,
      SHENYI_DEAI_LIVE_APP_USER_DATA: APP_USER_DATA_DIR,
    },
    windowsHide: true,
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', chunk => { stdout += chunk })
  child.stderr.on('data', chunk => { stderr += chunk })
  const completed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try { child.kill() } catch {}
      reject(new Error(`provider key decryption timed out after ${KEY_DECRYPT_TIMEOUT_MS}ms`))
    }, KEY_DECRYPT_TIMEOUT_MS)
    child.once('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', code => {
      clearTimeout(timer)
      resolve(code)
    })
  })
  const exitCode = await completed
  if (exitCode !== 0) {
    const safeError = stderr.trim().split('\n').slice(-1)[0] || `electron helper exited with ${exitCode}`
    throw new Error(`provider key decryption failed: ${safeError}`)
  }
  let parsed = null
  for (const line of stdout.trim().split('\n').reverse()) {
    try { parsed = JSON.parse(line); break } catch {}
  }
  assert(parsed?.ok === true, 'provider key decryption helper returned ok')
  assert(parsed.providerId === provider.id, 'decrypted provider id matches requested provider')
  assert(parsed.baseUrl === provider.baseUrl, 'decrypted provider baseUrl matches requested provider')
  assert(typeof parsed.apiKey === 'string' && parsed.apiKey && !parsed.apiKey.startsWith('enc:'),
    'decrypted provider apiKey is usable')
  return parsed.apiKey
}

function loadSkillFixtures() {
  return SKILL_FOLDERS.map((folder, index) => {
    const folderPath = path.join(SOURCE_SKILL_ROOT, folder)
    const definitionPath = path.join(folderPath, 'SKILL.md')
    const definition = fs.readFileSync(definitionPath, 'utf8')
    const idMatch = definition.match(/^id:\s*(\S+)/m)
    const nameMatch = definition.match(/^name:\s*(.+)$/m)
    assert(idMatch, `${folder}: SKILL.md exposes an id`)
    const meta = readJson(path.join(folderPath, 'meta.json'))
    for (const required of ['template.md', 'meta.json', 'script.js']) {
      assert(fs.existsSync(path.join(folderPath, required)), `${folder}: ${required} exists`)
    }
    return {
      folder,
      role: index === 1 ? 'generator' : index === 2 ? 'polish' : null,
      skill: {
        id: `folder:${idMatch[1]}`,
        sourceId: idMatch[1],
        name: nameMatch ? nameMatch[1].trim() : folder,
        version: '',
        format: 'folder',
        source: 'external',
        category: 'folder',
        folderPath,
        template: fs.readFileSync(path.join(folderPath, 'template.md'), 'utf8'),
        description: `真实供应商观测 ${folder}`,
        executionMode: 'chain',
        outputFormat: 'text',
        sourcePath: definitionPath,
        validationRules: [],
        splitSize: 1000,
        injectMode: 'system_prefix',
        bindTarget: 'project',
        linkedSkillIds: [],
        customVars: {},
        inputSchema: '',
        outputSchema: '',
        retryPolicy: '',
        meta,
        intents: meta.intents || ['generate'],
        contextPolicy: meta.contextPolicy,
      },
    }
  })
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
  assert.equal(stale.length, 0, `renderer build is stale; rebuild with npm run build:vue. Stale: ${stale.join(', ')}`)
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
  console.log(`[VISIBLE ELECTRON LIVE] pid=${child.pid}`)
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

function closeElectron(child) {
  if (!child || child.exitCode !== null) return
  try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
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

async function seedApplication(page, provider, skills) {
  await page.evaluate(async ({ provider, projectId, seededSkills, outline, chapters, settingsCollection, styleProfile }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: provider.id,
        name: provider.name,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        models: [provider.model],
        selectedModel: provider.model,
        temperature: provider.temperature,
        maxTokens: provider.maxTokens,
        contextWindowTokens: provider.contextWindowTokens,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: provider.streamMode,
      }],
      generateProvider: provider.id,
    })
    const chapterCount = chapters.length
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 4,
      projectName: '降AI协同真实供应商观测',
      outlineText: outline,
      outlineLocked: true,
      outlineLockedText: outline,
      bookWordCount: chapterCount * 2000,
      volumesConfirmed: true,
      pipelineConfig: { volumeCount: 1, volumeWords: chapterCount * 2000, chapterWords: 2000 },
      chaptersConfirmed: true,
      settingsGenerated: true,
      settings: [],
      volumes: [{
        id: 'vol-deai-live',
        name: '风暴起点',
      outline,
      summary: '风暴信标、沉船名单、南方航线暗礁与清晨渔船构成第一卷冲突链。',
        allocatedWords: chapterCount * 2000,
        suggestedWords: chapterCount * 2000,
        wordsPerChapter: 2000,
        chapterCount,
        confirmed: true,
        locked: true,
        isBound: true,
        boundTo: ['pipeline'],
        bodyGenerated: false,
      }],
      chapters: { 'vol-deai-live': chapters },
      settingBindings: {},
      settingsCollection,
      styleProfile,
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
    provider,
    projectId: PROJECT_ID,
    seededSkills: skills.map(item => item.skill),
    outline: OUTLINE_TEXT,
    chapters: CHAPTERS,
    settingsCollection: SETTINGS_COLLECTION,
    styleProfile: STYLE_PROFILE,
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20_000 })
  await sleep(1500)
  await closeProjectModal(page)
}

async function selectBodySkillsThroughUi(page, skills) {
  await page.click('#btn-pipeline')
  await page.waitForSelector('#pipeline-panel', { timeout: 20_000 })
  await page.locator('#pl-steps .pl-step').nth(4).click()
  await page.waitForSelector('#pl-step-5-content', { state: 'visible' })
  await page.selectOption('#pl-s5-mode', 'chain')
  const existingCount = await page.locator('#pl-s5-skills-list .pl-skill-chip').count()
  for (let index = existingCount - 1; index >= 0; index -= 1) {
    await page.locator('#pl-s5-skills-list .pl-skill-chip').nth(index)
      .locator('.pl-chip-close').click()
  }
  for (const skill of skills) {
    await page.selectOption('#pl-s5-skill', skill.skill.id)
    await page.click('#pl-s5-add-skill')
    await page.waitForFunction(({ skillId, expectedCount }) => {
      const chips = [...document.querySelectorAll('#pl-s5-skills-list .pl-skill-chip')]
      return chips.length === expectedCount
        && chips.some(chip => (chip.textContent || '').includes(skillId))
    }, {
      skillId: skill.skill.name,
      expectedCount: skills.indexOf(skill) + 1,
    }, { timeout: 10_000, polling: 250 })
    console.log(`[SKILL UI SELECTED] ${skill.skill.id} (${skill.skill.name})`)
  }
  const selected = await page.evaluate(() =>
    [...document.querySelectorAll('#pl-s5-skills-list .pl-skill-chip')]
      .map(chip => (chip.textContent || '').trim()))
  assert.equal(selected.length, skills.length,
    `all real body SKILLs are selected through the real dropdown; got ${JSON.stringify(selected)}`)
}

async function selectBodyChapterThroughUi(page, chapterIndex) {
  await page.locator('#pl-context-summary select').nth(0).waitFor({ state: 'visible', timeout: 20_000 })
  await page.locator('#pl-context-summary select').nth(0).selectOption({ index: 0 })
  await sleep(300)
  const chapterSelect = page.locator('#pl-context-summary select').nth(1)
  await chapterSelect.waitFor({ state: 'visible', timeout: 20_000 })
  await page.waitForFunction(() => {
    const select = document.querySelectorAll('#pl-context-summary select')[1]
    return Boolean(select && select.options.length > 0)
  }, null, { timeout: 20_000 })
  await chapterSelect.selectOption({ index: chapterIndex })
  await sleep(300)
}

function currentRunSnapshot(page) {
  return page.evaluate(() => {
    const store = window.__pinia?._s?.get('runTrace')
    const pipeline = window.__pinia?._s?.get('pipeline')
    const run = [...(store?.runs || [])]
      .filter(item => item.source === 'pipeline' && item.step === 4)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    return {
      runId: run?.id || null,
      runStatus: run?.status || null,
      apiCallCount: (run?.apiCalls || []).length,
      physicalCalls: (run?.apiCalls || []).reduce(
        (total, call) => total + (call?.physicalCalls || []).length, 0),
      runningApiCalls: (run?.apiCalls || []).filter(call => call.status === 'running').length,
      progress: pipeline?.activeBodyRun?.progress ?? null,
      status: pipeline?.activeBodyRun?.statusText || null,
      isGenerating: Boolean(pipeline?.isGenerating),
    }
  })
}

function startHeartbeat(page, electronPid) {
  let stopped = false
  const timer = setInterval(async () => {
    if (stopped) return
    try {
      const state = { ...(await currentRunSnapshot(page)), electronPid }
      fs.appendFileSync(HEARTBEAT_PATH, `${JSON.stringify(state)}\n`, 'utf8')
    } catch (error) {
      fs.appendFileSync(HEARTBEAT_PATH,
        `${JSON.stringify({ at: new Date().toISOString(), error: String(error?.message || error) })}\n`, 'utf8')
    }
  }, 1000)
  return { stop() { stopped = true; clearInterval(timer) } }
}

async function waitForBodyCompletion(page) {
  let lastSignature = null
  let lastProgressAt = Date.now()
  let lastSnapshot = null
  const deadline = Date.now() + CHAPTER_TIMEOUT_MS
  while (Date.now() < deadline) {
    const snapshot = await currentRunSnapshot(page)
    const signature = JSON.stringify(snapshot)
    if (signature !== lastSignature) {
      lastSignature = signature
      lastProgressAt = Date.now()
      lastSnapshot = snapshot
      console.log(`[BODY RUN LIVE] ${JSON.stringify(snapshot)}`)
    } else if (Date.now() - lastProgressAt >= DEAD_TIMEOUT_MS) {
      throw new Error(`body generation is dead for ${DEAD_TIMEOUT_MS}ms: ${JSON.stringify(lastSnapshot)}`)
    } else if (Date.now() - lastProgressAt >= STALLED_TIMEOUT_MS) {
      console.warn(`[STALL WARNING LIVE] body run unchanged for ${Date.now() - lastProgressAt}ms`)
    }
    if (snapshot.isGenerating || snapshot.status === 'generating' || snapshot.runningApiCalls > 0) {
      await sleep(1000)
      continue
    }
    if (snapshot.runStatus === 'failed' || snapshot.status?.startsWith('failed:')) {
      return { ...snapshot, terminal: 'failed' }
    }
    if (snapshot.runStatus === 'canceled' || snapshot.status?.startsWith('canceled')) {
      return { ...snapshot, terminal: 'canceled' }
    }
    if (snapshot.runStatus && snapshot.runStatus !== 'running') {
      return { ...snapshot, terminal: snapshot.runStatus }
    }
    await sleep(1000)
  }
  throw new Error(`body generation did not finish within ${CHAPTER_TIMEOUT_MS}ms: ${JSON.stringify(lastSnapshot)}`)
}

async function exportLatestRun(page) {
  const runId = await page.evaluate(() => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])]
      .filter(item => item.source === 'pipeline' && item.step === 4)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    return run?.id || null
  })
  assert(runId, 'body-layer run trace exists')
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
  assert(exported.result?.success,
    `deep run trace export succeeds: ${exported.result?.error || 'unknown error'}`)
  const directory = exported.result.path
  const run = readJson(path.join(directory, 'run-trace.json'))
  return { directory, run }
}

function parseDetail(value) {
  if (typeof value !== 'string') return value || {}
  try { return JSON.parse(value) } catch { return {} }
}

function eventsByType(run, type) {
  return (run.events || []).filter(event => event.type === type)
}

function collectChapterObservation({ chapter, directory, run, page }) {
  const collectEvents = type => eventsByType(run, type).map(event => parseDetail(event.detail))
  const guidance = collectEvents('deai-stage-guidance')
  const calibration = collectEvents('deai-calibration')
  const modelProfile = collectEvents('deai-model-profile')
  const injectionPolicy = collectEvents('deai-injection-policy')
  const guidancePack = collectEvents('deai-guidance-pack')
  const promptVariant = collectEvents('deai-prompt-variant')
  const calls = run.apiCalls || []
  return {
    chapter,
    runId: run.id,
    runStatus: run.status,
    evidenceDirectory: directory,
    provider: calls[0]?.providerId || null,
    providerName: calls[0]?.providerName || null,
    model: calls[0]?.model || null,
    apiCallCount: calls.length,
    physicalCallCount: calls.reduce((total, call) =>
      total + (Array.isArray(call.physicalCalls) ? call.physicalCalls.length : 0), 0),
    retryPhysicalCallCount: calls.reduce((total, call) =>
      total + (Array.isArray(call.physicalCalls)
        ? call.physicalCalls.filter(item =>
          item.phase === 'retry' || item.phase === 'schema_retry').length : 0), 0),
    durationMs: calls.reduce((total, call) => total + (call.durationMs || 0), 0),
    deaiPromptVariants: calls.map(call => call.deaiPromptVariant || null),
    injectionPolicy: injectionPolicy.map(item => ({
      step: item.step,
      skillIndex: item.skillIndex,
      source: item.source,
      variant: item.variant,
      policy: item.policy || {},
      warnings: item.warnings || [],
    })),
    guidancePack: guidancePack.map(item => ({
      step: item.step,
      skillIndex: item.skillIndex,
      variant: item.variant,
      itemCount: item.itemCount,
      guidanceChars: item.guidanceChars,
      totalInjectionChars: item.totalInjectionChars,
      truncated: item.truncated,
      hash: item.hash,
    })),
    promptVariant: promptVariant.map(item => ({
      skillIndex: item.skillIndex,
      variant: item.variant,
      charCount: item.charCount,
    })),
    stageGuidance: guidance.map(item => ({
      findingCount: item.findingCount,
      guidanceChars: item.guidanceChars,
      injected: item.injected,
      hash: item.hash,
      degraded: item.degraded,
      budgetExceeded: item.budgetExceeded,
    })),
    calibration: calibration.map(item => ({
      findingCount: item.findingCount,
      ledgerWritten: item.ledgerWritten,
    })),
    modelProfile: modelProfile.map(item => ({
      released: item.released,
      releaseGate: item.releaseGate,
      eligibleRuleCount: item.eligibleRuleCount,
      injectedRuleCount: item.injectedRuleCount,
      guidanceChars: item.guidanceChars,
    })),
    uiGuidanceLines: page.uiGuidanceLines,
    ...(page.uiGuidanceCollectionError
      ? { uiGuidanceCollectionError: page.uiGuidanceCollectionError } : {}),
  }
}

function buildSummary({ provider, skills, observations, businessStatus, verificationStatus, failure }) {
  return {
    schema: 'shenyi.deai-stage-guidance.live',
    version: 3,
    generatedAt: new Date().toISOString(),
    script: SCRIPT_NAME,
    classification: 'observational',
    businessStatus,
    verificationStatus,
    disclaimer: 'This run observes real-provider wiring and guidance visibility. It does not prove writing-quality improvement and is not a release gate.',
    provider: {
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      model: provider.model,
      streamMode: provider.streamMode,
    },
    skillChain: skills.map(skill => ({
      id: skill.skill.id,
      name: skill.skill.name,
      folder: skill.folder,
    })),
    chapterCount: CHAPTER_COUNT,
    observations,
    ...(failure ? { failure } : {}),
  }
}

function assertObservations(observations) {
  for (const observation of observations) {
    assert.equal(observation.runStatus, 'success',
      `live body generation must succeed: ${JSON.stringify(observation)}`)
    assert(observation.stageGuidance.length > 0,
      `each live run records the S2->S3 diagnosis execution, got ${JSON.stringify(observation)}`)
    for (const guidance of observation.stageGuidance) {
      assert.equal(guidance.degraded, false,
        `S2->S3 diagnosis must not degrade, got ${JSON.stringify(guidance)}`)
      assert.equal(guidance.budgetExceeded, false,
        `S2->S3 diagnosis must stay within its budget, got ${JSON.stringify(guidance)}`)
      assert(guidance.findingCount > 0,
        `S2->S3 diagnosis must carry bounded findings, got ${JSON.stringify(guidance)}`)
      assert.equal(guidance.injected, true,
        `S2->S3 findings must be injected for successful runs, got ${JSON.stringify(guidance)}`)
      assert(guidance.guidanceChars > 0 && guidance.guidanceChars <= 1200,
        `S2->S3 guidance must stay within the 1200-char budget, got ${JSON.stringify(guidance)}`)
    }
    assert(observation.uiGuidanceLines.some(line => /^诊断 · \d+条\/\d+字符$/.test(line)),
      `UI must show the diagnosis line, got ${JSON.stringify(observation.uiGuidanceLines)}`)
    assert(observation.modelProfile.length > 0,
      `each live run records model-profile state, got ${JSON.stringify(observation)}`)
    for (const profile of observation.modelProfile) {
      assert.equal(profile.released, true,
        `eligible model profile must release at calibration threshold, got ${JSON.stringify(profile)}`)
      assert(profile.eligibleRuleCount > 0,
        `released model profile requires eligible rules, got ${JSON.stringify(profile)}`)
      assert(profile.injectedRuleCount > 0 && profile.injectedRuleCount <= 3,
        `released model profile must inject at most three rules, got ${JSON.stringify(profile)}`)
      assert(profile.guidanceChars > 0 && profile.guidanceChars <= 600,
        `released model profile must stay bounded to 600 chars, got ${JSON.stringify(profile)}`)
      assert.equal(profile.releaseGate, null,
        `released model profile must clear its release gate, got ${JSON.stringify(profile)}`)
    }
  }
}

function writeSummary(summary) {
  fs.writeFileSync(path.join(EVIDENCE_ROOT, 'summary.json'),
    JSON.stringify(summary, null, 2), 'utf8')
}

function persistChapterEvidence({ chapter, directory, run, page }) {
  const evidenceDirectory = path.join(EVIDENCE_ROOT, `chapter-${chapter}-deep-trace`)
  copyDirectory(directory, evidenceDirectory)
  const observation = collectChapterObservation({
    chapter,
    directory: evidenceDirectory,
    run,
    page,
  })
  fs.writeFileSync(path.join(EVIDENCE_ROOT, `chapter-${chapter}-observation.json`),
    JSON.stringify(observation, null, 2), 'utf8')
  return observation
}

async function collectUiGuidanceLines(page) {
  const panelOpen = await page.evaluate(() => {
    const panel = document.querySelector('#pipeline-panel')
    return !!panel && !panel.classList.contains('hidden') && getComputedStyle(panel).display !== 'none'
  })
  if (panelOpen) {
    await page.evaluate(() => {
      document.querySelector('#pipeline-panel #btn-close-pl')?.click()
    })
    await sleep(500)
    await page.click('#btn-pipeline')
  } else {
    await page.click('#btn-pipeline')
  }
  await page.locator('#pl-steps .pl-step').nth(4).click()
  await page.waitForSelector('#pl-step-5-content', { state: 'visible', timeout: 20_000 })
  await sleep(500)
  return await page.locator('#pl-deai-guidance-feedback .pl-deai-guidance-feedback-line').allTextContents()
}

async function main() {
  assertFreshRendererBuild()
  const provider = loadLiveProvider()
  provider.apiKey = await decryptLiveProviderKey(provider)
  delete provider.encryptedApiKey
  const skills = loadSkillFixtures()
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  await removeDir(PROFILE)
  await removeDir(EXPORT_ROOT)
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })

  const electronProcess = startElectron()
  let browser = null
  let heartbeat = null
  const observations = []
  let currentChapter = null
  let runFailed = false
  let watchdog = null
  try {
    assert(await waitForCdp(), 'CDP reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    const page = await connectPage(browser)
    page.on('pageerror', error => console.error(`[PAGE ERROR] ${error.message}`))
    page.on('crash', () => console.error('[PAGE CRASH] renderer process crashed'))
    await page.waitForSelector('#app', { timeout: 20_000 })
    await sleep(1500)
    await seedApplication(page, provider, skills)
    await selectBodySkillsThroughUi(page, skills)
    heartbeat = startHeartbeat(page, electronProcess.pid)
    watchdog = setTimeout(async () => {
      const error = new Error(`global timeout after ${GLOBAL_TIMEOUT_MS}ms`)
      console.error(`[FAIL LIVE] ${error.message}`)
      runFailed = true
      try {
        await preserveFailureEvidence(page, currentChapter || 0, error)
      } catch (evidenceError) {
        console.error(`[FAIL EVIDENCE] global timeout evidence export failed: ${String(evidenceError?.message || evidenceError)}`)
      }
      heartbeat?.stop()
      try { await browser?.close() } catch {}
      closeElectron(electronProcess)
      process.exit(1)
    }, GLOBAL_TIMEOUT_MS)
    watchdog.unref()

    for (let index = 0; index < CHAPTER_COUNT; index += 1) {
      currentChapter = index + 1
      console.log(`[CHAPTER LIVE] start ${index + 1}/${CHAPTER_COUNT}`)
      try {
        await selectBodyChapterThroughUi(page, index)
        await page.click('#btn-primary-gen-body')
        const completion = await waitForBodyCompletion(page)
        console.log(`[CHAPTER LIVE] terminal ${index + 1}/${CHAPTER_COUNT}: ${completion.terminal}`)
        assert.equal(completion.terminal, 'success',
          `body generation terminal state must be success: ${JSON.stringify(completion)}`)
        const exported = await exportLatestRun(page)
        const { directory, run } = readExportedRun(exported)
        const uiGuidanceLines = await collectUiGuidanceLines(page)
        observations.push(persistChapterEvidence({
          chapter: index + 1,
          directory,
          run,
          page: { uiGuidanceLines },
        }))
        writeSummary(buildSummary({
          provider,
          skills,
          observations,
          businessStatus: 'running',
          verificationStatus: 'running',
        }))
      } catch (error) {
        runFailed = true
        const failure = await preserveFailureEvidence(page, index + 1, error)
        writeSummary(buildSummary({
          provider,
          skills,
          observations,
          businessStatus: 'failed',
          verificationStatus: failure.evidenceExportError || failure.uiGuidanceCollectionError
            ? 'failed'
            : 'completed',
          failure,
        }))
        throw error
      }
    }

    assertObservations(observations)
    writeSummary(buildSummary({
      provider,
      skills,
      observations,
      businessStatus: 'success',
      verificationStatus: 'completed',
    }))
    console.log('===== DEAI STAGE GUIDANCE LIVE OBSERVATION COMPLETED =====')
  } finally {
    heartbeat?.stop()
    clearTimeout(watchdog)
    try { await browser?.close() } catch {}
    closeElectron(electronProcess)
    await sleep(800)
    clearTimeout(watchdog)
    if (!KEEP_PROFILE) {
      await removeDir(PROFILE)
      if (!runFailed) await removeDir(EXPORT_ROOT)
    }
  }
}

async function preserveFailureEvidence(page, chapter, error) {
  const failure = {
    at: new Date().toISOString(),
    chapter,
    error: String(error?.message || error),
    chapterTimeoutMs: CHAPTER_TIMEOUT_MS,
    globalTimeoutMs: GLOBAL_TIMEOUT_MS,
  }
  fs.writeFileSync(path.join(EVIDENCE_ROOT, `chapter-${chapter}-failure.json`),
    JSON.stringify(failure, null, 2), 'utf8')
  let uiGuidanceLines = null
  let uiGuidanceCollectionError = null
  try {
    uiGuidanceLines = await collectUiGuidanceLines(page)
  } catch (uiError) {
    uiGuidanceCollectionError = String(uiError?.message || uiError)
    console.warn(`[FAIL EVIDENCE] chapter ${chapter} UI guidance collection failed: ${uiGuidanceCollectionError}`)
  }
  try {
    const snapshot = await currentRunSnapshot(page)
    fs.writeFileSync(path.join(EVIDENCE_ROOT, `chapter-${chapter}-last-snapshot.json`),
      JSON.stringify(snapshot, null, 2), 'utf8')
  } catch (snapshotError) {
    console.warn(`[FAIL EVIDENCE] chapter ${chapter} run snapshot persistence failed: ${String(snapshotError?.message || snapshotError)}`)
  }
  try {
    const exported = await exportLatestRun(page)
    const { directory, run } = readExportedRun(exported)
    persistChapterEvidence({
      chapter,
      directory,
      run,
      page: {
        uiGuidanceLines: uiGuidanceLines || [],
        ...(uiGuidanceCollectionError ? { uiGuidanceCollectionError } : {}),
      },
    })
    return {
      ...failure,
      evidenceDirectory: path.join(EVIDENCE_ROOT, `chapter-${chapter}-deep-trace`),
      ...(uiGuidanceCollectionError ? { uiGuidanceCollectionError } : {}),
    }
  } catch (exportError) {
    console.warn(`[FAIL EVIDENCE] chapter ${chapter} trace export failed: ${String(exportError?.message || exportError)}`)
    return {
      ...failure,
      evidenceExportError: String(exportError?.message || exportError),
      ...(uiGuidanceCollectionError ? { uiGuidanceCollectionError } : {}),
    }
  }
}

main().catch(error => {
  console.error('[FAIL LIVE]', error)
  process.exitCode = 1
})
