import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = path.resolve(process.cwd())
const SCRIPT_NAME = 'verify-deai-body-electron.mjs'
const ELECTRON_EXE = process.env.SHENYI_DEAI_BODY_ELECTRON
  ? path.resolve(process.env.SHENYI_DEAI_BODY_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_DEAI_BODY_CDP_PORT || 9381)
const PROFILE = path.join(ROOT, '_data', 'deai-body-profile')
const DATA_DIR = path.join(PROFILE, 'documents-data')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-deai-body-electron')
const EVIDENCE_ARCHIVE_ROOT = path.join(ROOT, '_audit', 'verification-deai-body-electron-archive')
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const HEARTBEAT_PATH = path.join(EVIDENCE_ROOT, 'heartbeat.jsonl')
const SKILL_ROOT = path.join(ROOT, '_data', 'deai-body-skills')
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_DEAI_BODY_GLOBAL_TIMEOUT_MS || 8 * 60_000)
const STEP_TIMEOUT_MS = Number(process.env.SHENYI_DEAI_BODY_STEP_TIMEOUT_MS || 150_000)
const STALLED_TIMEOUT_MS = Number(process.env.SHENYI_DEAI_BODY_STALLED_TIMEOUT_MS || 20_000)
const DEAD_TIMEOUT_MS = Number(process.env.SHENYI_DEAI_BODY_DEAD_TIMEOUT_MS || 45_000)
const KEEP_PROFILE = process.env.SHENYI_DEAI_BODY_KEEP_PROFILE === '1'

const PROJECT_ID = 'deai-body-contract-gate'
const VOLUME_ID = 'vol-deai-body-contract'
const CHAPTER_ID = 'ch-deai-body-contract'
const BODY_BREAKPOINT_OWNER_KEYS = [
  `pipeline:${PROJECT_ID}:step-4:chapter-${CHAPTER_ID}`,
  `pipeline:${PROJECT_ID}:step-4`,
  'pipeline:deai-body-contract-gate:step-4',
  'pipeline:deai-body-contract-gate:step-4:chapter-ch-deai-body-contract',
]
const SKILL_IDS = ['DEAI-GATE-S1', 'DEAI-GATE-S2', 'DEAI-GATE-S3']
const DEAI_MARKERS = [
  '【降AI创作约束 - 生成阶段执行】',
  '【降AI创作风格 - 创作执行阶段】',
  '【降AI打磨契约 - 语言收敛阶段】',
]
const DEAI_FINAL_STEP_OFF_MARKER = '终步降AI检测已由 SKILL 声明关闭'
const VOICE_PROFILE_MARKER = '【作者声纹 - 最高风格优先级】'
const VOICE_PROFILE_TEXT = '主角声口：狠、短、少解释'
const S1_CONFLICT_TEMPLATE = [
  '输出本章节的写作骨架，不要输出正文。',
  '短句只用于关键转折；对白不得解释因果；禁止连续三句短句碎片。',
].join('\n')

const STYLE_PROFILE = {
  profileVersion: 2,
  styleTags: '',
  pacingParams: '',
  pacingParamsObj: {
    speed: '均衡',
    tension: 3,
    density: '均衡',
    perspective: '第一人称',
    tone: '暗黑',
  },
  customStyleTags: [],
  aiPacingSnapshot: null,
  locked: true,
  lockedAt: Date.now(),
  source: 'manual',
  positioning: undefined,
  quantitative: undefined,
  voice: { protagonistSpeech: '狠、短、少解释', dialogueTags: '动作带话', subtextDensity: '高' },
  descriptionFocus: undefined,
  sceneTemplates: undefined,
  sentencePatterns: undefined,
  positiveRules: [{ id: 'p1', text: '关键转折使用短句', enabled: true }],
  prohibitions: [{ id: 'b1', text: '禁止连续三句短句碎片', enabled: true }],
  dailyRules: undefined,
}

const VOLUME_OUTLINE = [
  '## 剧情单元 H1-01 雨夜',
  '> 作用域：单元级 H1-01',
  '章节范围：第 1 章',
  '- 雨夜中，林照检查灯塔底层的纸条，并确认风暴信标的三次红色闪烁。',
].join('\n')

const S1_BODY = [
  '林照进入灯塔，发现纸条藏在灯座下。',
  '他听见门外巡逻声，把纸条压进掌心。',
  '他在窗边确认风暴信标闪烁三次，决定天亮前离港。',
].join('\n')

function bodyText(count) {
  return Array.from({ length: count }, (_, index) =>
    `林照把纸条压进灯座，潮声第${index + 1}次盖住他的呼吸。`).join('\n')
}

function metadataEnvelope(body) {
  const filler = Array.from({ length: 240 }, (_, index) =>
    `交接元数据第${index + 1}条：维持灯芯记录的事实锁，不进入正文。`).join('\n')
  return [
    body,
    '【正文交接】',
    filler,
    '【正文交接结束】',
  ].join('\n')
}

const S2_ACCEPT_OUTPUT = metadataEnvelope(bodyText(140))
const S3_OUTPUT = [
  '林照将纸条压进灯座，潮声第一次完全盖住他的呼吸。',
  ...Array.from({ length: 139 }, (_, index) =>
    `林照把纸条压进灯座，潮声第${index + 2}次盖住他的呼吸。`),
].join('\n')

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function clearBodyBreakpoints(page) {
  const removed = await page.evaluate(keys => Promise.all([
    window.electronAPI.storageRemove('wa_pipeline_breakpoint'),
    ...keys.map(key => window.electronAPI.storageRemove(`wa_pipeline_breakpoint_owner_${key}`)),
  ]), BODY_BREAKPOINT_OWNER_KEYS)
  assert(removed.every(result => result !== false),
    `failed to clear body deai breakpoint storage: ${JSON.stringify(removed)}`)
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

function archivePreviousEvidence() {
  if (!fs.existsSync(EVIDENCE_ROOT)) return null
  fs.mkdirSync(EVIDENCE_ARCHIVE_ROOT, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const target = path.join(EVIDENCE_ARCHIVE_ROOT, timestamp)
  fs.cpSync(EVIDENCE_ROOT, target, { recursive: true })
  fs.rmSync(EVIDENCE_ROOT, { recursive: true, force: true })
  return target
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

  // Lazy-loaded feature chunks (for example DeAiSettings) are not referenced
  // by index.html, so marker checks must scan every emitted JS fragment.
  const assetDir = path.join(ROOT, 'dist-renderer', 'assets')
  const assetText = fs.readdirSync(assetDir)
    .filter(name => name.endsWith('.js'))
    .map(name => fs.readFileSync(path.join(assetDir, name), 'utf8'))
    .join('\n')
  const entryText = bundleNames.map(name =>
    fs.readFileSync(path.join(ROOT, 'dist-renderer', name), 'utf8')).join('\n')
  const bundleText = [entryText, assetText].join('\n')
  for (const eventType of [
    'deai-injection-policy',
    'deai-prompt-variant',
    'deai-contract-warning',
    'deai-conflict-policy',
  ]) {
    assert(bundleText.includes(eventType), `renderer bundle contains ${eventType}`)
  }
  for (const marker of DEAI_MARKERS) {
    assert(bundleText.includes(marker), `renderer bundle contains ${marker}`)
  }
  assert(bundleText.includes(DEAI_FINAL_STEP_OFF_MARKER),
    'renderer bundle contains the final-step shutdown UI marker')
  assert(bundleText.includes('app-default-no-skill-meta'),
    'renderer bundle contains the no-meta source marker')

  const manifestPath = path.join(ROOT, 'dist-renderer', 'build-manifest.json')
  assert(fs.existsSync(manifestPath), 'dist-renderer/build-manifest.json exists')
  const diskManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  assert(bundleText.includes(JSON.stringify(diskManifest)),
    'renderer bundle contains the same build manifest injected at runtime')
  return diskManifest
}

function writeSkills(deaiMeta, options = {}) {
  fs.rmSync(SKILL_ROOT, { recursive: true, force: true })
  const definitions = [
    {
      id: SKILL_IDS[0],
      name: 'S1 骨架',
      folder: 'deai-gate-s1',
      template: options.s1Template || '输出本章节的写作骨架，不要输出正文。',
    },
    { id: SKILL_IDS[1], name: 'S2 生成', folder: 'deai-gate-s2', template: '输出本章节正文。' },
    { id: SKILL_IDS[2], name: 'S3 打磨', folder: 'deai-gate-s3', template: '只打磨表达，不改变内容，输出完整正文。' },
  ]
  for (const definition of definitions) {
    const folderPath = path.join(SKILL_ROOT, definition.folder)
    fs.mkdirSync(folderPath, { recursive: true })
    fs.writeFileSync(path.join(folderPath, 'SKILL.md'), [
      '---',
      'schema: shenyi.skill',
      'version: 1',
      `id: ${definition.id}`,
      `name: ${definition.name}`,
      '---',
      'Created and removed by the Electron deai-contract verifier.',
      '',
    ].join('\n'), 'utf8')
    fs.writeFileSync(path.join(folderPath, 'template.md'), definition.template, 'utf8')
    fs.writeFileSync(path.join(folderPath, 'meta.json'),
      JSON.stringify({ sampleCount: 0, ...(deaiMeta ? { deai: deaiMeta } : {}) }, null, 2), 'utf8')
    fs.writeFileSync(path.join(folderPath, 'script.js'),
      'exports.preProcess = function (payload) { return { input: payload.input } }', 'utf8')
  }
}

function skillRecords() {
  const names = ['S1 骨架', 'S2 生成', 'S3 打磨']
  return SKILL_IDS.map((sourceId, index) => ({
    id: `folder:${sourceId}`,
    sourceId,
    name: names[index],
    description: 'body deai contract Electron verification skill',
    format: 'folder',
    source: 'external',
    category: 'folder',
    folderPath: path.join(SKILL_ROOT, `deai-gate-s${index + 1}`),
    executionMode: 'chain',
    outputFormat: 'text',
    sourcePath: path.join(SKILL_ROOT, `deai-gate-s${index + 1}`, 'SKILL.md'),
    samples: '',
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
  }))
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

let activeProvider = null
let activeBrowser = null
let activePage = null

async function writeFailureEvidence(page, provider) {
  try {
    fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'failure-provider-requests.json'),
      JSON.stringify(provider.requests(), null, 2), 'utf8')
    if (!page) return
    const run = await page.evaluate(({ chapterId }) => {
      const trace = window.__pinia?._s?.get('runTrace')
      return [...(trace?.runs || [])]
        .filter(item => item.source === 'pipeline' && item.step === 4 && item.stepName === '正文层')
        .sort((a, b) => b.startedAt - a.startedAt)[0] || null
    }, { chapterId: CHAPTER_ID }).catch(() => null)
    if (run) {
      fs.writeFileSync(path.join(EVIDENCE_ROOT, 'failure-trace-run.json'),
        JSON.stringify(run, null, 2), 'utf8')
    }
  } catch (evidenceError) {
    console.error('[FAIL EVIDENCE ERROR]', evidenceError)
  }
}

function startProvider() {
  const requests = []
  const queue = []
  const server = http.createServer((request, response) => {
    let bodyText = ''
    request.on('data', chunk => { bodyText += chunk })
    request.on('end', () => {
      const parsed = (() => { try { return JSON.parse(bodyText) } catch { return {} } })()
      const receivedAt = new Date().toISOString()
      requests.push({
        at: receivedAt,
        url: request.url,
        model: parsed.model || null,
        stream: parsed.stream ?? null,
        messages: parsed.messages || [],
      })
      const next = queue.shift()
      assert(next, 'provider queue must be explicitly planned for every physical request')
      requests[requests.length - 1].responsePreview = String(next.body).slice(0, 120)
      requests[requests.length - 1].responseLength = String(next.body).length
      requests[requests.length - 1].queueRemaining = queue.length
      if (parsed.stream === false) {
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({
          choices: [{ message: { content: next.body }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }))
        return
      }
      const chunks = [
        `data: ${JSON.stringify({ choices: [{ delta: { content: next.body } }] })}\n\n`,
        `data: ${JSON.stringify({
          choices: [{ delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        })}\n\n`,
        'data: [DONE]\n\n',
      ]
      response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' })
      chunks.forEach(chunk => response.write(chunk))
      response.end()
    })
  })
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const provider = {
        port: server.address().port,
        requests: () => requests.map(item => ({ ...item })),
        reset: () => {
          requests.length = 0
          queue.length = 0
        },
        enqueue: response => { queue.push(response) },
        close: () => new Promise(done => server.close(() => done())),
      }
      activeProvider = provider
      resolve(provider)
    })
  })
}

async function seedApplication(page, provider, options = {}) {
  const readSeedStorage = () => page.evaluate(async projectId => {
    const data = await window.electronAPI.storageRead(`wa_project_${projectId}`)
    return {
      exists: Boolean(data),
      profileVersion: data?.styleProfile?.profileVersion ?? null,
      locked: Boolean(data?.styleProfile?.locked),
      protagonistSpeech: data?.styleProfile?.voice?.protagonistSpeech || null,
      schemaVersion: data?.schemaVersion ?? null,
    }
  }, PROJECT_ID)
  await page.evaluate(async seed => {
    const { baseUrl, projectId, volumeId, chapterId, volumeOutline, skills, styleProfile, deAiConfig } = seed
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'deai-body-contract-provider',
        name: 'DeAI Body Contract Provider',
        baseUrl,
        apiKey: 'local-test-key',
        models: ['deai-body-model'],
        selectedModel: 'deai-body-model',
        temperature: 0.1,
        maxTokens: 8192,
        contextWindowTokens: 128000,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
      }],
      generateProvider: 'deai-body-contract-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: '正文降AI契约真实UI实测',
      outlineText: '全书大纲',
      outlineLocked: true,
      outlineLockedText: '全书大纲',
      bookWordCount: 120000,
      volumesConfirmed: true,
      pipelineConfig: { volumeCount: 1, volumeWords: 200000, chapterWords: 3500 },
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
        wordsPerChapter: 3500,
        confirmed: true,
        locked: true,
        isBound: true,
      }],
      chapters: {
        [volumeId]: [{
          id: chapterId,
          title: '第1章 纸条',
          index: 0,
          plot: '雨夜中主角检查灯塔底层的纸条，并确认风暴信标的三次红色闪烁。',
          summary: '雨夜中的灯塔纸条。',
          confirmed: true,
          pipelineGenerated: true,
          unitId: 'H1-01',
        }],
      },
      settingBindings: {},
      styleProfile,
      settingsCollection: { categories: [], items: {} },
      memories: {},
      memoryBlacklist: [],
      aiNaming: null,
      outlineChat: [],
      chat: [],
      editorTabs: [],
    })
    await window.electronAPI.storageWrite('wa_skills', { skills, pipelineSkills: [], deAiSkills: [] })
    await window.electronAPI.storageWrite('wa_pipeline_step_config', {
      agents: { 0: '', 1: '', 2: '', 3: '', 4: '' },
      skills: { 0: [], 1: [], 2: [], 3: [], 4: [] },
      modes: { 0: 'compose', 1: 'compose', 2: 'compose', 3: 'compose', 4: 'chain' },
      skillAgents: {},
    })
    await window.electronAPI.storageWrite('wa_deAiConfig', {
      hardruleEnabled: false,
      hardRuleMode: 'detect-report',
      ...(deAiConfig || {}),
    })
    await window.electronAPI.storageRemove('wa_pipeline_breakpoint')
  }, {
    baseUrl: `http://127.0.0.1:${provider.port}`,
    projectId: PROJECT_ID,
    volumeId: VOLUME_ID,
    chapterId: CHAPTER_ID,
    volumeOutline: VOLUME_OUTLINE,
    skills: skillRecords(),
    styleProfile: options.styleProfile,
    deAiConfig: options.deAiConfig,
  })
  console.log(`[SEED STORAGE before reload] ${JSON.stringify(await readSeedStorage())}`)
  await page.reload({ waitUntil: 'domcontentloaded' })
  console.log(`[SEED STORAGE after reload] ${JSON.stringify(await readSeedStorage())}`)
  await page.waitForSelector('#app', { timeout: 20_000 })
  await sleep(1200)
  console.log(`[SEED STORAGE after ui ready] ${JSON.stringify(await readSeedStorage())}`)
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
  await sleep(300)
}

async function sampleStyleState(page, label) {
  const state = await page.evaluate(() => {
    const project = window.__pinia?._s?.get('project')
    const style = project?.styleProfileEffective
    return {
      currentProjectId: project?.currentProjectId || null,
      projectName: project?.projectName || null,
      profileVersion: style?.profileVersion ?? null,
      locked: Boolean(style?.locked),
      injected: Boolean(style?.injected),
      protagonistSpeech: style?.voice?.protagonistSpeech || null,
    }
  })
  console.log(`[STYLE ${label}] ${JSON.stringify(state)}`)
  return state
}

async function selectBodySkillsThroughUi(page) {
  const skills = skillRecords()
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
    await page.selectOption('#pl-s5-skill', skill.id)
    await page.click('#pl-s5-add-skill')
    await page.waitForFunction(({ skillName, expectedCount }) => {
      const chips = [...document.querySelectorAll('#pl-s5-skills-list .pl-skill-chip')]
      return chips.length === expectedCount
        && chips.some(chip => (chip.textContent || '').includes(skillName))
    }, {
      skillName: skill.name,
      expectedCount: skills.indexOf(skill) + 1,
    }, { timeout: 10_000, polling: 250 })
  }
  await page.selectOption('#pl-context-summary select', { index: 0 })
  await page.locator('#pl-context-summary select').nth(1).selectOption({ index: 0 })
  return skills
}

function currentRunSnapshot(page) {
  return page.evaluate(({ chapterId }) => {
    const trace = window.__pinia?._s?.get('runTrace')
    const pipeline = window.__pinia?._s?.get('pipeline')
    const project = window.__pinia?._s?.get('project')
    const run = [...(trace?.runs || [])]
      .filter(item => item.source === 'pipeline' && item.step === 4 && item.stepName === '正文层')
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    const chapter = Object.values(project?.chapters || {})
      .flat()
      .find(item => item?.id === chapterId)
    const style = project?.styleProfileEffective
    return {
      at: new Date().toISOString(),
      runId: run?.id || null,
      runStatus: run?.status || null,
      events: (run?.events || []).length,
      apiCalls: (run?.apiCalls || []).length,
      lastEventType: (run?.events || []).at(-1)?.type || null,
      hasFinishedEvent: (run?.events || []).some(event => event?.type === 'finished' || event?.type === 'canceled'),
      isGenerating: Boolean(pipeline?.isGenerating),
      bodyLength: String(chapter?.body || '').length,
      styleProfile: {
        currentProjectId: project?.currentProjectId || null,
        profileVersion: style?.profileVersion ?? null,
        locked: Boolean(style?.locked),
        injected: Boolean(style?.injected),
        protagonistSpeech: style?.voice?.protagonistSpeech || null,
      },
    }
  }, { chapterId: CHAPTER_ID })
}

function startHeartbeat(page, electronPid) {
  let stopped = false
  const startedAtMs = Date.now()
  const worker = (async () => {
    let written = 0
    while (!stopped) {
      try {
        fs.appendFileSync(HEARTBEAT_PATH, `${JSON.stringify({
          ...(await currentRunSnapshot(page)),
          electronPid,
          frame: written + 1,
        })}\n`, 'utf8')
      } catch (error) {
        fs.appendFileSync(HEARTBEAT_PATH,
          `${JSON.stringify({ at: new Date().toISOString(), error: String(error?.message || error), frame: written + 1 })}\n`, 'utf8')
      }
      written += 1
      await sleep(1000)
    }
    return written
  })()
  return {
    async stop() {
      stopped = true
      return worker
    },
    frameCount() {
      try { return fs.readFileSync(HEARTBEAT_PATH, 'utf8').split('\n').filter(Boolean).length }
      catch { return 0 }
    },
    durationMs() { return Date.now() - startedAtMs },
  }
}

async function runBodyThroughUi(page) {
  await clearBodyBreakpoints(page)
  const previousClose = page.locator('.pl-gen-bar-close')
  if (await previousClose.count()) {
    await previousClose.first().click()
    await page.waitForSelector('.pl-gen-bar-close', { state: 'detached', timeout: 10_000 })
  }
  if (!await page.locator('#pipeline-panel').count()) {
    await page.click('#btn-pipeline')
    await page.waitForSelector('#pipeline-panel', { timeout: 20_000 })
  }
  await page.locator('#pl-steps .pl-step').nth(4).click()
  await page.waitForSelector('#pl-step-5-content', { state: 'visible', timeout: 20_000 })
  await page.click('#btn-primary-gen-body')
  let lastSignature = null
  let lastProgressAt = Date.now()
  let lastSnapshot = null
  const deadline = Date.now() + STEP_TIMEOUT_MS
  while (Date.now() < deadline) {
    const state = await currentRunSnapshot(page)
    const signature = JSON.stringify(state)
    if (signature !== lastSignature) {
      lastSignature = signature
      lastProgressAt = Date.now()
      lastSnapshot = state
      console.log(`[BODY RUN] ${JSON.stringify(state)}`)
    } else if (Date.now() - lastProgressAt >= DEAD_TIMEOUT_MS) {
      throw new Error(`body generation is dead for ${DEAD_TIMEOUT_MS}ms: ${JSON.stringify(lastSnapshot)}`)
    } else if (Date.now() - lastProgressAt >= STALLED_TIMEOUT_MS) {
      console.warn(`[STALL WARNING] body run unchanged for ${Date.now() - lastProgressAt}ms`)
    }
    if (!state.isGenerating && state.runStatus && state.runStatus !== 'running' && state.hasFinishedEvent) {
      return state
    }
    await sleep(500)
  }
  throw new Error(`body generation did not finish within ${STEP_TIMEOUT_MS}ms: ${JSON.stringify(lastSnapshot)}`)
}

async function currentRun(page) {
  return page.evaluate(({ chapterId }) => {
    const trace = window.__pinia?._s?.get('runTrace')
    const project = window.__pinia?._s?.get('project')
    const run = [...(trace?.runs || [])]
      .filter(item => item.source === 'pipeline' && item.step === 4 && item.stepName === '正文层')
      .sort((a, b) => b.startedAt - a.startedAt)[0] || null
    const chapter = Object.values(project?.chapters || {})
      .flat()
      .find(item => item?.id === chapterId)
    return { run, body: String(chapter?.body || '') }
  }, { chapterId: CHAPTER_ID })
}

function parseDetail(value) {
  if (typeof value !== 'string') return value || {}
  try { return JSON.parse(value) } catch { return { raw: value } }
}

function eventsByType(run, type) {
  return (run.events || []).filter(event => event.type === type)
}

function messageText(message) {
  if (typeof message.content === 'string') return message.content
  if (Array.isArray(message.content)) return message.content.map(part => part?.text || '').join('\n')
  return ''
}

function systemText(messages) {
  return (messages || []).filter(item => item?.role === 'system').map(messageText).join('\n')
}

async function archiveEvidence(name, run, providerRequests, heartbeatFrames, screenshots) {
  const scenarioDir = path.join(EVIDENCE_ROOT, name)
  fs.mkdirSync(scenarioDir, { recursive: true })
  fs.writeFileSync(path.join(scenarioDir, 'trace-run.json'), JSON.stringify(run, null, 2), 'utf8')
  fs.writeFileSync(path.join(scenarioDir, 'provider-requests.json'), JSON.stringify(providerRequests, null, 2), 'utf8')
  fs.writeFileSync(path.join(scenarioDir, 'heartbeat.jsonl'), fs.existsSync(HEARTBEAT_PATH)
    ? fs.readFileSync(HEARTBEAT_PATH, 'utf8')
    : '', 'utf8')
  fs.writeFileSync(path.join(scenarioDir, 'report.json'), JSON.stringify({
    scenario: name,
    runId: run?.id || null,
    runStatus: run?.status || null,
    requestCount: providerRequests.length,
    heartbeatFrames,
    screenshots,
  }, null, 2), 'utf8')
}

function assertPolicyEvents(run, expected) {
  const policies = eventsByType(run, 'deai-injection-policy').map(event => parseDetail(event.detail))
  assert.equal(policies.length, 3,
    `three chain steps record injection policy, got ${JSON.stringify(policies)}`)
  policies.forEach((policy, index) => {
    assert.equal(policy.step, 4, `policy ${index} belongs to body step 4`)
    assert.equal(policy.skillIndex, index, `policy ${index} records chain index`)
    assert.equal(policy.totalSkillCount, 3, `policy ${index} records chain count`)
    assert.equal(policy.source, expected.source, `policy ${index} source`)
    assert.equal(policy.variant, expected.variants[index], `policy ${index} variant`)
    assert.deepEqual(policy.policy, expected.policy, `policy ${index} normalized contract`)
  })
  return policies
}

function assertVoiceProfileProjection(run, requests) {
  const voiceEvents = eventsByType(run, 'deai-voice-profile')
  assert.equal(voiceEvents.length, 3,
    `each chain step records the same voice projection, got ${voiceEvents.length}`)
  const profiles = voiceEvents.map(event => parseDetail(event.detail))
  const signature = JSON.stringify(profiles[0])
  profiles.forEach((profile, index) => {
    assert.equal(JSON.stringify(profile), signature,
      `voice profile ${index} differs from step 0`)
    assert.equal(profile.profileVersion, 2, 'voice profile records version v2')
    assert.equal(profile.injectedChars > 0, true, 'voice profile records injected chars')
  })
  requests.forEach((request, index) => {
    const system = systemText(request.messages)
    assert(system.includes(VOICE_PROFILE_MARKER),
      `physical request ${index + 1} carries the author voice profile; tail=${system.slice(-500)}`)
    assert(system.includes(VOICE_PROFILE_TEXT),
      `physical request ${index + 1} carries the locked voice text`)
  })
}

async function openDeaiSettingsThroughUi(page) {
  await page.click('#btn-settings')
  await page.waitForSelector('#settings-modal', { timeout: 20_000 })
  await page.click('#tab-deai')
  await page.waitForSelector('#deai-progress-modal', { timeout: 20_000 })
}

async function closeSettingsThroughUi(page) {
  await page.click('#btn-close-settings')
  await page.waitForSelector('#settings-modal', { state: 'hidden', timeout: 10_000 })
}

async function prepareScenario(page, provider, deaiMeta, options = {}) {
  writeSkills(deaiMeta, options)
  provider.reset()
  await seedApplication(page, provider, {
    ...options,
    styleProfile: options.styleProfile ?? STYLE_PROFILE,
  })
  await selectBodySkillsThroughUi(page)
  provider.reset()
  provider.enqueue({ body: S1_BODY })
  provider.enqueue({ body: S2_ACCEPT_OUTPUT })
  provider.enqueue({ body: S3_OUTPUT })
  if (options.extraResponses) {
    options.extraResponses.forEach(response => provider.enqueue(response))
  }
}

async function runDefaultScenario(page, provider, heartbeat) {
  console.log('\n[SCENARIO 1] no meta declaration keeps app-default three-variant injection')
  await prepareScenario(page, provider, null)
  await sampleStyleState(page, 'after-seed')
  await sampleStyleState(page, 'after-skill-selection')
  const state = await runBodyThroughUi(page)
  const { run } = await currentRun(page)
  const requests = provider.requests()
  assert.equal(state.runStatus, 'success', `default scenario succeeds, got ${state.runStatus}`)
  assert.equal(state.isGenerating, false, 'default scenario releases the generation lock')
  assert.equal(requests.length, 3,
    `default scenario uses exactly one physical request per chain step, got ${requests.length}`)

  assertPolicyEvents(run, {
    source: 'app-default-no-skill-meta',
    variants: ['methodology', 'creative', 'polish'],
    policy: { contractVersion: 1, generation: 'on', finalStepDetection: 'on', conflictPolicy: 'report' },
  })
  const variantEvents = eventsByType(run, 'deai-prompt-variant').map(event => parseDetail(event.detail))
  assert.deepEqual(variantEvents.map(item => item.variant), ['methodology', 'creative', 'polish'],
    `default scenario records one prompt variant event per injected step: ${JSON.stringify(variantEvents)}`)
  assert.equal(eventsByType(run, 'deai-contract-warning').length, 0,
    'default scenario has no contract warning')

  DEAI_MARKERS.forEach((marker, index) => {
    const system = systemText(requests[index].messages)
    assert(system.includes(marker),
      `physical request ${index + 1} carries its deai system suffix; tail=${system.slice(-300)}`)
  })
  assert.deepEqual((run.apiCalls || []).map(call => call.deaiPromptVariant),
    ['methodology', 'creative', 'polish'],
    `apiCalls persist deaiPromptVariant: ${JSON.stringify((run.apiCalls || []).map(call => call.deaiPromptVariant))}`)
  assertVoiceProfileProjection(run, requests)

  const screenshot = path.join(EVIDENCE_ROOT, 'scenario-1-default.png')
  await page.screenshot({ path: screenshot, fullPage: false })
  await archiveEvidence('scenario-1-default', run, requests, heartbeat.frameCount(), ['scenario-1-default.png'])
  return { state, run, requests }
}

async function runFinalStepOffScenario(page, provider, heartbeat) {
  console.log('\n[SCENARIO 4] SKILL closes final-step detection while user deep-fix remains active')
  await prepareScenario(page, provider, {
    contractVersion: 1,
    generation: 'on',
    finalStepDetection: 'off',
    conflictPolicy: 'report',
  }, {
    deAiConfig: { hardruleEnabled: true, hardRuleMode: 'deep-fix' },
    extraResponses: [{ body: S3_OUTPUT }],
  })
  const state = await runBodyThroughUi(page)
  const { run } = await currentRun(page)
  const requests = provider.requests()
  assert.equal(state.runStatus, 'success', `final-step-off scenario succeeds, got ${state.runStatus}`)
  assert.equal(requests.length, 4,
    `chain uses three requests and deep-fix may add one, got ${requests.length}`)

  const policies = eventsByType(run, 'deai-injection-policy').map(event => parseDetail(event.detail))
  assert.equal(policies.length, 3, 'all three chain steps record the shutdown policy')
  policies.forEach(policy => {
    assert.equal(policy.policy.finalStepDetection, 'off', 'contract keeps finalStepDetection off')
  })
  assert.equal(eventsByType(run, 'deai-change-rate').length, 1,
    'user deep-fix still records its own change-rate gate')

  await openDeaiSettingsThroughUi(page)
  const declaration = page.locator('#deai-skill-final-step-detection')
  await declaration.waitFor({ state: 'visible', timeout: 10_000 })
  const declarationText = await declaration.textContent()
  assert(declarationText?.includes(DEAI_FINAL_STEP_OFF_MARKER),
    `settings declaration is visible without a detect report: ${declarationText}`)
  assert(declarationText?.includes('深度修复'),
    `settings declaration shows the independent user mode: ${declarationText}`)
  const screenshot = path.join(EVIDENCE_ROOT, 'scenario-4-final-step-off-settings.png')
  await page.screenshot({ path: screenshot, fullPage: false })
  await closeSettingsThroughUi(page)

  await archiveEvidence('scenario-4-final-step-off', run, requests, heartbeat.frameCount(), [
    'scenario-4-final-step-off-settings.png',
  ])
  return { state, run, requests }
}

async function runSkillWinsScenario(page, provider, heartbeat) {
  console.log('\n[SCENARIO 5] skill-wins removes the overlapping app projection for S1')
  await prepareScenario(page, provider, {
    contractVersion: 1,
    generation: 'on',
    finalStepDetection: 'on',
    conflictPolicy: 'skill-wins',
  }, { s1Template: S1_CONFLICT_TEMPLATE })
  const state = await runBodyThroughUi(page)
  const { run } = await currentRun(page)
  const requests = provider.requests()
  assert.equal(state.runStatus, 'success', `skill-wins scenario succeeds, got ${state.runStatus}`)
  assert.equal(requests.length, 3,
    `skill-wins keeps three physical requests, got ${requests.length}`)

  const conflicts = eventsByType(run, 'deai-conflict-policy').map(event => parseDetail(event.detail))
  assert.equal(conflicts.length, 1, 'only the overlapping S1 step records a conflict decision')
  assert.equal(conflicts[0].skillId, 'folder:DEAI-GATE-S1', 'conflict decision names the S1 skill')
  assert.equal(conflicts[0].action, 'skill-wins', 'projection is removed only on overlap')
  assert.deepEqual(conflicts[0].overlaps, ['短句', '碎片', '对白'], 'overlap detection is deterministic')
  const s1System = systemText(requests[0].messages)
  assert(!s1System.includes(DEAI_MARKERS[0]),
    `skill-wins removes the S1 app projection; tail=${s1System.slice(-300)}`)
  ;[requests[1], requests[2]].forEach((request, offset) => {
    const system = systemText(request.messages)
    assert(system.includes(DEAI_MARKERS[offset + 1]),
      `non-overlapping step ${offset + 2} keeps its app projection`)
  })

  const screenshot = path.join(EVIDENCE_ROOT, 'scenario-5-skill-wins.png')
  await page.screenshot({ path: screenshot, fullPage: false })
  await archiveEvidence('scenario-5-skill-wins', run, requests, heartbeat.frameCount(), [
    'scenario-5-skill-wins.png',
  ])
  return { state, run, requests }
}

async function runAppWinsScenario(page, provider, heartbeat) {
  console.log('\n[SCENARIO 6] app-wins keeps the projection and reports the overlap as a warning')
  await prepareScenario(page, provider, {
    contractVersion: 1,
    generation: 'on',
    finalStepDetection: 'on',
    conflictPolicy: 'app-wins',
  }, { s1Template: S1_CONFLICT_TEMPLATE })
  const state = await runBodyThroughUi(page)
  const { run } = await currentRun(page)
  const requests = provider.requests()
  assert.equal(state.runStatus, 'success', `app-wins scenario succeeds, got ${state.runStatus}`)
  assert.equal(requests.length, 3,
    `app-wins keeps three physical requests, got ${requests.length}`)

  const conflicts = eventsByType(run, 'deai-conflict-policy').map(event => parseDetail(event.detail))
  assert.equal(conflicts.length, 1, 'only the overlapping S1 step records the app-wins decision')
  assert.equal(conflicts[0].skillId, 'folder:DEAI-GATE-S1', 'app-wins decision names the S1 skill')
  assert.equal(conflicts[0].action, 'app-wins', 'app projection wins')
  assert.deepEqual(conflicts[0].overlaps, ['短句', '碎片', '对白'], 'overlap stays observable')
  assert.equal(eventsByType(run, 'deai-conflict-policy').filter(event => event.level === 'warn').length, 1,
    'app-wins is a warning, not silent routing')
  requests.forEach((request, index) => {
    const system = systemText(request.messages)
    const marker = DEAI_MARKERS[index]
    assert(system.includes(marker),
      `app-wins physical request ${index + 1} keeps its deai suffix; tail=${system.slice(-300)}`)
  })

  const screenshot = path.join(EVIDENCE_ROOT, 'scenario-6-app-wins.png')
  await page.screenshot({ path: screenshot, fullPage: false })
  await archiveEvidence('scenario-6-app-wins', run, requests, heartbeat.frameCount(), [
    'scenario-6-app-wins.png',
  ])
  return { state, run, requests }
}

async function runDisabledScenario(page, provider, heartbeat) {
  console.log('\n[SCENARIO 2] generation off disables every generation prompt without hiding the policy')
  await prepareScenario(page, provider, { contractVersion: 1, generation: 'off' })
  const state = await runBodyThroughUi(page)
  const { run } = await currentRun(page)
  const requests = provider.requests()
  assert.equal(state.runStatus, 'success', `disabled scenario succeeds, got ${state.runStatus}`)
  assert.equal(requests.length, 3,
    `disabled scenario still uses three physical requests, got ${requests.length}`)

  assertPolicyEvents(run, {
    source: 'skill-disabled',
    variants: ['off', 'off', 'off'],
    policy: { contractVersion: 1, generation: 'off', finalStepDetection: 'on', conflictPolicy: 'report' },
  })
  assert.equal(eventsByType(run, 'deai-prompt-variant').length, 0,
    'disabled scenario emits zero prompt-variant events')
  assert.equal(eventsByType(run, 'deai-contract-warning').length, 0,
    'disabled declaration is valid and must not emit warnings')
  requests.forEach((request, index) => {
    const system = systemText(request.messages)
    DEAI_MARKERS.forEach(marker => {
      assert(!system.includes(marker),
        `physical request ${index + 1} must not carry ${marker}; tail=${system.slice(-300)}`)
    })
  })
  assert.deepEqual((run.apiCalls || []).map(call => call.deaiPromptVariant ?? null),
    [null, null, null],
    `disabled scenario leaves apiCall deaiPromptVariant undefined: ${JSON.stringify((run.apiCalls || []).map(call => call.deaiPromptVariant))}`)

  const screenshot = path.join(EVIDENCE_ROOT, 'scenario-2-disabled.png')
  await page.screenshot({ path: screenshot, fullPage: false })
  await archiveEvidence('scenario-2-disabled', run, requests, heartbeat.frameCount(), ['scenario-2-disabled.png'])
  return { state, run, requests }
}

async function runInvalidScenario(page, provider, heartbeat) {
  console.log('\n[SCENARIO 3] invalid declaration falls back visibly without blocking the run')
  await prepareScenario(page, provider, { contractVersion: 99, generation: 'sometimes' })
  const state = await runBodyThroughUi(page)
  const { run } = await currentRun(page)
  const requests = provider.requests()
  assert.equal(state.runStatus, 'success', `invalid scenario succeeds, got ${state.runStatus}`)
  assert.equal(requests.length, 3,
    `invalid scenario still uses three physical requests, got ${requests.length}`)

  assertPolicyEvents(run, {
    source: 'skill-declared',
    variants: ['methodology', 'creative', 'polish'],
    policy: { contractVersion: 1, generation: 'on', finalStepDetection: 'on', conflictPolicy: 'report' },
  })
  const warnings = eventsByType(run, 'deai-contract-warning').map(event => parseDetail(event.detail))
  assert.equal(warnings.length, 6,
    `each of three steps emits two field warnings, got ${JSON.stringify(warnings)}`)
  warnings.forEach(warning => {
    assert(warning.errors.some(error => String(error).includes('contractVersion 仅支持 1')),
      `warning records the invalid contractVersion: ${JSON.stringify(warning)}`)
    assert(warning.errors.some(error => String(error).includes('generation 必须是')),
      `warning records the invalid generation value: ${JSON.stringify(warning)}`)
    assert.equal(warning.declaredMeta.contractVersion, 99, 'warning retains the declared version')
    assert.equal(warning.declaredMeta.generation, 'sometimes', 'warning retains the declared generation')
  })
  assert.deepEqual(eventsByType(run, 'deai-prompt-variant').map(event => parseDetail(event.detail).variant),
    ['methodology', 'creative', 'polish'], 'fallback keeps prompt variants observable')
  DEAI_MARKERS.forEach((marker, index) => {
    assert(systemText(requests[index].messages).includes(marker),
      `fallback physical request ${index + 1} still carries its deai suffix`)
  })

  const screenshot = path.join(EVIDENCE_ROOT, 'scenario-3-invalid.png')
  await page.screenshot({ path: screenshot, fullPage: false })
  await archiveEvidence('scenario-3-invalid', run, requests, heartbeat.frameCount(), ['scenario-3-invalid.png'])
  return { state, run, requests }
}

async function main() {
  const diskManifest = assertFreshRendererBuild()
  const archivedEvidence = archivePreviousEvidence()
  if (archivedEvidence) console.log(`[EVIDENCE ARCHIVED] ${archivedEvidence}`)
  fs.rmSync(HEARTBEAT_PATH, { force: true })
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
  writeSkills(null)

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
    activeBrowser = () => browser
    activePage = () => page
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
    await seedApplication(page, provider, {})
    heartbeat = startHeartbeat(page, electronProcess.pid)
    await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'ui-seeded.png'), fullPage: false })

    const scenario1 = await runDefaultScenario(page, provider, heartbeat)
    const scenario2 = await runDisabledScenario(page, provider, heartbeat)
    const scenario3 = await runInvalidScenario(page, provider, heartbeat)
    const scenario4 = await runFinalStepOffScenario(page, provider, heartbeat)
    const scenario5 = await runSkillWinsScenario(page, provider, heartbeat)
    const scenario6 = await runAppWinsScenario(page, provider, heartbeat)

    const heartbeatFrames = heartbeat.frameCount()
    const heartbeatDuration = heartbeat.durationMs()
    assert(heartbeatFrames >= 1, `heartbeat records the run, got ${heartbeatFrames} frames`)
    assert(heartbeatFrames >= Math.max(1, Math.floor(heartbeatDuration / 1200)),
      `heartbeat cadence is continuous for ${heartbeatDuration}ms, got ${heartbeatFrames} frames`)

    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'report.json'), JSON.stringify({
      schema: 'shenyi.deai-body.electron',
      version: 1,
      generatedAt: new Date().toISOString(),
      script: SCRIPT_NAME,
      runtimeFingerprint: {
        source: 'vite-manifest',
        manifestVersion: String(diskManifest.schemaVersion),
        commit: diskManifest.commit,
        buildTime: diskManifest.buildTime,
      },
      hardRules: {
        visibleElectron: true,
        realDropdownSelection: '#pl-s5-skill / #pl-s5-add-skill / #pl-s5-skills-list',
        physicalProviderRequests: true,
        apiCallAndPhysicalRequestSameSource: true,
      },
      scenarios: {
        'default-no-meta': {
          status: scenario1.state.runStatus,
          runId: scenario1.run?.id,
          requestCount: scenario1.requests.length,
          source: 'app-default-no-skill-meta',
          variants: ['methodology', 'creative', 'polish'],
        },
        'skill-disabled': {
          status: scenario2.state.runStatus,
          runId: scenario2.run?.id,
          requestCount: scenario2.requests.length,
          source: 'skill-disabled',
          variants: ['off', 'off', 'off'],
          promptVariantEvents: 0,
        },
        'invalid-fallback': {
          status: scenario3.state.runStatus,
          runId: scenario3.run?.id,
          requestCount: scenario3.requests.length,
          source: 'skill-declared',
          variants: ['methodology', 'creative', 'polish'],
          warningEvents: 6,
        },
        'final-step-off-deep-fix': {
          status: scenario4.state.runStatus,
          runId: scenario4.run?.id,
          requestCount: scenario4.requests.length,
          finalStepDetection: 'off',
          userHardRuleMode: 'deep-fix',
          settingsUiDualState: true,
        },
        'conflict-skill-wins': {
          status: scenario5.state.runStatus,
          runId: scenario5.run?.id,
          requestCount: scenario5.requests.length,
          conflictPolicy: 'skill-wins',
          s1ProjectionRemoved: true,
          conflictEvents: 1,
        },
        'conflict-app-wins': {
          status: scenario6.state.runStatus,
          runId: scenario6.run?.id,
          requestCount: scenario6.requests.length,
          conflictPolicy: 'app-wins',
          projectionKept: true,
          warningEvents: 1,
        },
      },
      heartbeatFrames,
      heartbeatDurationMs: heartbeatDuration,
    }, null, 2), 'utf8')
    console.log('===== DEAI BODY CONTRACT ELECTRON PASSED =====')
  } catch (error) {
    await writeFailureEvidence(page, provider)
    throw error
  } finally {
    await heartbeat?.stop()
    closeElectron(electronProcess)
    try { await browser?.close() } catch {}
    await provider.close()
    clearTimeout(watchdog)
    if (!KEEP_PROFILE) {
      await removeDir(PROFILE)
      await removeDir(SKILL_ROOT)
    }
  }
}

main().catch(async error => {
  console.error('[FAIL]', error)
  process.exitCode = 1
})
