import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = path.resolve(process.cwd())
const SCRIPT_NAME = 'verify-body-contract-degraded-electron.mjs'
const ELECTRON_EXE = process.env.SHENYI_BODY_CONTRACT_ELECTRON
  ? path.resolve(process.env.SHENYI_BODY_CONTRACT_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_BODY_CONTRACT_CDP_PORT || 9381)
const PROFILE = path.join(ROOT, '_data', 'body-contract-degraded-profile')
const DATA_DIR = path.join(PROFILE, 'documents-data')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-body-contract-degraded-electron')
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const HEARTBEAT_PATH = path.join(EVIDENCE_ROOT, 'heartbeat.jsonl')
const SKILL_ROOT = path.join(ROOT, '_data', 'body-contract-degraded-skills')
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_BODY_CONTRACT_GLOBAL_TIMEOUT_MS || 8 * 60_000)
const STEP_TIMEOUT_MS = Number(process.env.SHENYI_BODY_CONTRACT_STEP_TIMEOUT_MS || 150_000)
const STALLED_TIMEOUT_MS = Number(process.env.SHENYI_BODY_CONTRACT_STALLED_TIMEOUT_MS || 20_000)
const DEAD_TIMEOUT_MS = Number(process.env.SHENYI_BODY_CONTRACT_DEAD_TIMEOUT_MS || 45_000)
const KEEP_PROFILE = process.env.SHENYI_BODY_CONTRACT_KEEP_PROFILE === '1'

const PROJECT_ID = 'body-contract-degraded-gate'
const VOLUME_ID = 'vol-body-contract-degraded'
const CHAPTER_ID = 'ch-body-contract-degraded'
const TARGET_WORDS = 3500
const MIN_WORDS = Math.round(TARGET_WORDS * 0.6)
const SKILL_IDS = ['BODY-GATE-S1', 'BODY-GATE-S2', 'BODY-GATE-S3']
const UPSTREAM_METADATA_HEADER = '--- 上一步结构化交接 ---'

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

const S2_REJECT_OUTPUT = metadataEnvelope([
  bodyText(82),
  '潮水继续上涨，灯芯记录保持沉默。',
].join('\n'))
const S2_ACCEPT_OUTPUT = metadataEnvelope(bodyText(110))
const S3_OUTPUT = [
  '林照将纸条压进灯座，潮声第一次完全盖住他的呼吸。',
  ...Array.from({ length: 109 }, (_, index) =>
    `林照把纸条压进灯座，潮声第${index + 2}次盖住他的呼吸。`),
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
  const bundleText = bundleNames.map(name =>
    fs.readFileSync(path.join(ROOT, 'dist-renderer', name), 'utf8')).join('\n')
  assert(bundleText.includes('body-step-acceptance'),
    'renderer bundle contains the body-step-acceptance trace event')
  assert(bundleText.includes('__shenyiStepArtifact'),
    'renderer bundle contains the step artifact envelope marker')
  assert(bundleText.includes('degraded_plus_contract_failure'),
    'renderer bundle contains the degraded-plus-contract rejection reason')
  assert(bundleText.includes(UPSTREAM_METADATA_HEADER),
    'renderer bundle contains the structured upstream metadata handoff marker')
  assert(bundleText.includes('totalChars=') && bundleText.includes('[metadata-section]'),
    'renderer bundle contains the controlled metadata summary implementation')
  assert(bundleText.includes('schema_retry'),
    'renderer bundle contains the schema_retry physical phase classification')
  assert(!bundleText.includes("folderStatus===`degraded`&&stepArtifactContext"),
    'renderer bundle does not retain the old unguarded degraded flow text')
  const manifestPath = path.join(ROOT, 'dist-renderer', 'build-manifest.json')
  assert(fs.existsSync(manifestPath), 'dist-renderer/build-manifest.json exists')
  const diskManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  assert(bundleText.includes(JSON.stringify(diskManifest)),
    'renderer bundle contains the same build manifest injected at runtime')
  return diskManifest
}

function writeSkills() {
  fs.rmSync(SKILL_ROOT, { recursive: true, force: true })
  const definitions = [
    {
      id: SKILL_IDS[0],
      name: 'S1 骨架',
      folder: 'body-gate-s1',
      template: '输出本章节的写作骨架，不要输出正文。',
      script: 'exports.preProcess = function (payload) { return { input: payload.input } }',
    },
    {
      id: SKILL_IDS[1],
      name: 'S2 生成',
      folder: 'body-gate-s2',
      template: '输出本章节正文。',
      script: [
        'exports.postProcess = function (output) {',
        '  return {',
        "    issues: [{ severity: 'blocking', code: 'intentional-degraded', message: '正文交接缺少NEW_FACT事实锁' }]",
        '  }',
        '}',
      ].join('\n'),
    },
    {
      id: SKILL_IDS[2],
      name: 'S3 打磨',
      folder: 'body-gate-s3',
      template: '只打磨表达，不改变内容，输出完整正文。',
      script: 'exports.preProcess = function (payload) { return { input: payload.input } }',
    },
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
      'Created and removed by the Electron degraded-contract verifier.',
      '',
    ].join('\n'), 'utf8')
    fs.writeFileSync(path.join(folderPath, 'template.md'), definition.template, 'utf8')
    fs.writeFileSync(path.join(folderPath, 'meta.json'), JSON.stringify({ sampleCount: 0 }, null, 2), 'utf8')
    fs.writeFileSync(path.join(folderPath, 'script.js'), definition.script, 'utf8')
  }
}

function skillRecords() {
  const names = ['S1 骨架', 'S2 生成', 'S3 打磨']
  return SKILL_IDS.map((sourceId, index) => ({
    id: `folder:${sourceId}`,
    sourceId,
    name: names[index],
    description: 'body contract Electron verification skill',
    format: 'folder',
    source: 'external',
    category: 'folder',
    folderPath: path.join(SKILL_ROOT, `body-gate-s${index + 1}`),
    executionMode: 'chain',
    outputFormat: 'text',
    sourcePath: path.join(SKILL_ROOT, `body-gate-s${index + 1}`, 'SKILL.md'),
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

function startProvider() {
  const requests = []
  const queue = []
  const server = http.createServer((request, response) => {
    let bodyText = ''
    request.on('data', chunk => { bodyText += chunk })
    request.on('end', () => {
      const parsed = (() => { try { return JSON.parse(bodyText) } catch { return {} } })()
      requests.push({
        at: new Date().toISOString(),
        bodyText,
        model: parsed.model || null,
        wantsStream: parsed.stream === true,
        messages: parsed.messages || [],
      })
      const next = queue.length > 0 ? queue.shift() : { body: S2_ACCEPT_OUTPUT, finishReason: 'stop' }
      let wantsStream = parsed.stream === true
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
        reset: () => { requests.length = 0 },
        enqueue: response => { queue.push(response) },
        close: () => new Promise(done => server.close(() => done())),
      })
    })
  })
}

async function seedApplication(page, provider) {
  await page.evaluate(async seed => {
    const { baseUrl, projectId, volumeId, chapterId, volumeOutline, skills } = seed
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'body-contract-degraded-provider',
        name: 'Body Contract Degraded Provider',
        baseUrl,
        apiKey: 'local-test-key',
        models: ['body-contract-model'],
        selectedModel: 'body-contract-model',
        temperature: 0.1,
        maxTokens: 8192,
        contextWindowTokens: 128000,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
      }],
      generateProvider: 'body-contract-degraded-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: '正文契约降级门禁真实UI实测',
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
      settingsCollection: { categories: [], items: {} },
      memories: {},
      memoryBlacklist: [],
      aiNaming: null,
      outlineChat: [],
      chat: [],
      editorTabs: [],
    })
    await window.electronAPI.storageWrite('wa_skills', {
      skills,
      pipelineSkills: [],
      deAiSkills: [],
    })
    await window.electronAPI.storageWrite('wa_pipeline_step_config', {
      agents: { 0: '', 1: '', 2: '', 3: '', 4: '' },
      skills: { 0: [], 1: [], 2: [], 3: [], 4: [] },
      modes: { 0: 'compose', 1: 'compose', 2: 'compose', 3: 'compose', 4: 'chain' },
      skillAgents: {},
    })
    await window.electronAPI.storageWrite('wa_deAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
    await window.electronAPI.storageRemove('wa_pipeline_breakpoint')
  }, {
    baseUrl: `http://127.0.0.1:${provider.port}`,
    projectId: PROJECT_ID,
    volumeId: VOLUME_ID,
    chapterId: CHAPTER_ID,
    volumeOutline: VOLUME_OUTLINE,
    skills: skillRecords(),
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20_000 })
  await sleep(1200)
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
  await sleep(300)
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
    await page.selectOption('#pl-s5-skill', skill.id)
    await page.click('#pl-s5-add-skill')
    await page.waitForFunction(({ skillId, skillName, expectedCount }) => {
      const chips = [...document.querySelectorAll('#pl-s5-skills-list .pl-skill-chip')]
      return chips.length === expectedCount
        && chips.some(chip => (chip.textContent || '').includes(skillId)
          || (chip.textContent || '').includes(skillName))
    }, {
      skillId: skill.id,
      skillName: skill.name,
      expectedCount: skills.indexOf(skill) + 1,
    }, { timeout: 10_000, polling: 250 })
    console.log(`[SKILL UI SELECTED] ${skill.id} (${skill.name})`)
  }
  const selected = await page.evaluate(() =>
    [...document.querySelectorAll('#pl-s5-skills-list .pl-skill-chip')]
      .map(chip => (chip.textContent || '').trim()))
  assert.equal(selected.length, skills.length,
    `all body SKILLs are selected through #pl-s5-skill; got ${JSON.stringify(selected)}`)
  await page.selectOption('#pl-context-summary select', { index: 0 })
  await page.locator('#pl-context-summary select').nth(1).selectOption({ index: 0 })
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
    return {
      at: new Date().toISOString(),
      runId: run?.id || null,
      runStatus: run?.status || null,
      events: (run?.events || []).length,
      apiCalls: (run?.apiCalls || []).length,
      runningApiCalls: (run?.apiCalls || []).filter(call => call.status === 'running').length,
      lastEventType: (run?.events || []).at(-1)?.type || null,
      progress: pipeline?.generationProgress ?? null,
      status: pipeline?.generationStatus || null,
      isGenerating: Boolean(pipeline?.isGenerating),
      bodyLength: String(chapter?.body || '').length,
    }
  }, { chapterId: CHAPTER_ID })
}

function startHeartbeat(page, electronPid) {
  let stopped = false
  const startedAtMs = Date.now()
  const worker = (async () => {
    let written = 0
    try {
      while (!stopped) {
        try {
          const state = { ...(await currentRunSnapshot(page)), electronPid, frame: written + 1 }
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
  await page.click('#btn-pl-gen-body')
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
    if (!state.isGenerating && state.runStatus && state.runStatus !== 'running') {
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
  if (!message) return ''
  if (typeof message.content === 'string') return message.content
  if (Array.isArray(message.content)) return message.content.map(part => part?.text || '').join('\n')
  return ''
}

function userText(messages) {
  return (messages || []).filter(item => item?.role === 'user').map(messageText).join('\n')
}

function assertS2SchemaRetryLedger(run, expectedTotalPhysicalCalls) {
  const physicalCalls = (run.apiCalls || []).flatMap(call => call.physicalCalls || [])
  assert.equal(physicalCalls.length, expectedTotalPhysicalCalls,
    `run records the expected physical lifecycle, got ${physicalCalls.length}/${expectedTotalPhysicalCalls}`)
  assert.deepEqual(physicalCalls.map(call => call.phase),
    expectedTotalPhysicalCalls === 4
      ? ['normal', 'normal', 'schema_retry', 'schema_retry']
      : ['normal', 'normal', 'schema_retry', 'schema_retry', 'normal'],
    `S2 physical retries are classified as schema_retry, got ${JSON.stringify(physicalCalls.map(call => call.phase))}`)
  assert.equal(physicalCalls.filter(call => call.phase !== 'normal').length + 1,
    3, 'S2 contributes three physical requests (one initial + two schema retries)')
  assert(!physicalCalls.some(call => call.phase === 'heartbeat_retry'),
    'S2 schema retries are not misclassified as heartbeat retries')
}

function assertTimingLedgers(run) {
  const physicalCalls = (run.apiCalls || []).flatMap(call => call.physicalCalls || [])
  const firstTokenSumMs = physicalCalls.reduce((sum, call) => sum + (Number(call.firstTokenMs) || 0), 0)
  const outputSumMs = physicalCalls.reduce((sum, call) => sum + (Number(call.outputMs) || 0), 0)
  const retryPhases = ['retry', 'schema_retry', 'direct_retry', 'heartbeat_retry']
  const retryCount = physicalCalls.filter(call => retryPhases.includes(call.phase)).length
  assert(run.timingLedger, 'run timing ledger exists after finish')
  assert(run.stepTimingLedger, 'step timing ledger exists after finish')
  assert.equal(run.timingLedger.physicalCallCount, physicalCalls.length,
    'run ledger counts every physical request')
  assert.equal(run.stepTimingLedger.physicalCallCount, physicalCalls.length,
    'step ledger counts every physical request')
  assert.equal(run.timingLedger.retryPhysicalCallCount, retryCount,
    `run ledger counts retry physical calls, got ${run.timingLedger.retryPhysicalCallCount}/${retryCount}`)
  assert.equal(run.stepTimingLedger.retryCallCount, retryCount,
    `step ledger counts retry physical calls, got ${run.stepTimingLedger.retryCallCount}/${retryCount}`)
  assert.equal(run.stepTimingLedger.continuationCallCount,
    physicalCalls.filter(call => call.phase === 'continuation').length,
    'step ledger counts continuation calls independently')
  assert.equal(run.timingLedger.firstTokenSumMs, firstTokenSumMs,
    `run firstTokenSumMs matches the physical-call sum, got ${run.timingLedger.firstTokenSumMs}/${firstTokenSumMs}`)
  assert.equal(run.stepTimingLedger.firstTokenSumMs, firstTokenSumMs,
    `step firstTokenSumMs matches the physical-call sum, got ${run.stepTimingLedger.firstTokenSumMs}/${firstTokenSumMs}`)
  assert.equal(run.timingLedger.outputSumMs, outputSumMs,
    `run outputSumMs matches the physical-call sum, got ${run.timingLedger.outputSumMs}/${outputSumMs}`)
  assert.equal(run.stepTimingLedger.outputSumMs, outputSumMs,
    `step outputSumMs matches the physical-call sum, got ${run.stepTimingLedger.outputSumMs}/${outputSumMs}`)
}

function assertRequestDoesNotContain(messages, fragment, label) {
  const text = userText(messages)
  assert(!text.includes(fragment), `${label} must not contain ${fragment}; got request tail: ${text.slice(-500)}`)
}

async function archiveEvidence(name, run, providerRequests, heartbeat, screenshots) {
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
    heartbeatFrames: heartbeat,
    screenshots,
  }, null, 2), 'utf8')
}

async function runRejectScenario(page, provider) {
  console.log('\n[SCENARIO A] degraded + extracted body 1654 words must reject before S3')
  provider.reset()
  provider.enqueue({ body: S1_BODY, finishReason: 'stop' })
  for (let attempt = 0; attempt < 3; attempt += 1) {
    provider.enqueue({ body: S2_REJECT_OUTPUT, finishReason: 'stop' })
  }

  const state = await runBodyThroughUi(page)
  const { run, body } = await currentRun(page)
  const requests = provider.requests()
  const acceptanceEvents = eventsByType(run, 'body-step-acceptance')
  const rejectedEvents = eventsByType(run, 'body-generator-step-rejected')
  const attemptEvents = eventsByType(run, 'body-artifact-attempt')
  const degradedEvents = eventsByType(run, 'folder-skill-degraded-with-error')

  assert.equal(state.runStatus, 'failed', `scenario A run fails, got ${state.runStatus}`)
  assert.equal(state.isGenerating, false, 'scenario A releases the generation lock')
  assert.equal(acceptanceEvents.length, 1,
    `scenario A records one generator acceptance decision, got ${acceptanceEvents.length}`)
  const acceptance = parseDetail(acceptanceEvents[0].detail)
  assert.equal(acceptance.stepIndex, 1, 'scenario A acceptance belongs to S2')
  assert.equal(acceptance.callerStatus, 'degraded', 'scenario A records degraded caller status')
  assert.equal(acceptance.decision, 'reject', 'scenario A rejects the artifact')
  assert.equal(acceptance.reason, 'contract_failed', 'scenario A rejects on the extracted-face contract')
  assert.equal(acceptance.extractedWordCount, 1654, 'scenario A measures the extracted face')
  assert.ok(acceptance.rawWordCount > acceptance.extractedWordCount + 1000,
    `scenario A proves the raw face was materially longer: ${JSON.stringify(acceptance)}`)
  assert.equal(acceptance.contract.minWords, MIN_WORDS, 'scenario A carries the unchanged contract threshold')
  assert.ok(acceptance.degradedErrors.some(item => item.includes('NEW_FACT')),
    `scenario A retains degraded diagnostics: ${JSON.stringify(acceptance.degradedErrors)}`)
  assert.ok(acceptance.contractErrors.some(item => item.includes('1654') && item.includes(String(MIN_WORDS))),
    `scenario A carries the concrete contract error: ${JSON.stringify(acceptance.contractErrors)}`)

  assert.equal(rejectedEvents.length, 1, `scenario A records the downstream rejection event once, got ${rejectedEvents.length}`)
  const rejection = parseDetail(rejectedEvents[0].detail)
  assert.equal(rejection.reason, 'degraded_plus_contract_failure',
    'scenario A names degraded-plus-contract as the failure reason')
  assert.equal(attemptEvents.length, 1,
    `scenario A records one attempt and does not start repair retries, got ${attemptEvents.length}`)
  const attempt = parseDetail(attemptEvents[0].detail)
  assert.equal(attempt.status, 'error', 'scenario A attempt is terminal at the generator gate')
  assert.deepEqual(attempt.stepAcceptanceDecisions, [{
    stepIndex: 1,
    callerStatus: 'degraded',
    decision: 'reject',
    reason: 'contract_failed',
    rawWordCount: acceptance.rawWordCount,
    extractedWordCount: 1654,
    errors: acceptance.degradedErrors.concat(acceptance.contractErrors),
  }], `scenario A attempt ledger matches the step decision: ${JSON.stringify(attempt.stepAcceptanceDecisions)}`)
  assert.deepEqual(attempt.degradedSteps, [{
    stepIndex: 1,
    errors: acceptance.degradedErrors.concat(acceptance.contractErrors),
  }], 'scenario A attempt ledger retains the degraded step')
  assert(attempt.rawVsExtractedDelta > 1000, 'scenario A attempt ledger quantifies the raw/extracted delta')
  assert(attempt.generatorStepIndex === 1, 'scenario A identifies S2 as the generator')
  assert(degradedEvents.length >= 1, 'scenario A shows a visible degraded warning in trace')

  assert.equal(requests.length, 4,
    `scenario A uses S1 once and S2 three times, got ${requests.length}`)
  assertS2SchemaRetryLedger(run, 4)
  assertTimingLedgers(run)
  assertRequestDoesNotContain(requests[0].messages, '目标约3500字', 'S1 request')
  for (const request of requests.slice(1)) {
    assert(userText(request.messages).includes('目标约3500字'),
      'every S2 physical request carries the generator word contract')
  }
  assert(!body.trim(), 'scenario A does not persist the rejected artifact')
  await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'scenario-a-rejected.png'), fullPage: false })
  await archiveEvidence('scenario-a-reject', run, requests, 1, ['scenario-a-rejected.png'])
  return { state, run, requests }
}

async function runAcceptScenario(page, provider) {
  console.log('\n[SCENARIO B] degraded + extracted body 2200 words accepts, extracts, then runs S3')
  provider.reset()
  provider.enqueue({ body: S1_BODY, finishReason: 'stop' })
  for (let attempt = 0; attempt < 3; attempt += 1) {
    provider.enqueue({ body: S2_ACCEPT_OUTPUT, finishReason: 'stop' })
  }
  provider.enqueue({ body: S3_OUTPUT, finishReason: 'stop' })

  const state = await runBodyThroughUi(page)
  const { run, body } = await currentRun(page)
  const requests = provider.requests()
  const acceptanceEvents = eventsByType(run, 'body-step-acceptance')
  const rejectedEvents = eventsByType(run, 'body-generator-step-rejected')
  const attemptEvents = eventsByType(run, 'body-artifact-attempt')
  const degradedEvents = eventsByType(run, 'folder-skill-degraded-with-error')

  assert.equal(state.runStatus, 'success', `scenario B completes, got ${state.runStatus}`)
  assert.equal(state.isGenerating, false, 'scenario B releases the generation lock')
  assert.equal(acceptanceEvents.length, 1,
    `scenario B records one generator acceptance decision, got ${acceptanceEvents.length}`)
  const acceptance = parseDetail(acceptanceEvents[0].detail)
  assert.equal(acceptance.callerStatus, 'degraded', 'scenario B preserves the degraded warning')
  assert.equal(acceptance.decision, 'accept', 'scenario B accepts a contract-valid degraded artifact')
  assert.equal(acceptance.reason, 'contract_valid', 'scenario B accepts because the extracted face is valid')
  assert.equal(acceptance.extractedWordCount, 2200, 'scenario B measures the extracted face')
  assert.ok(acceptance.metadataDelta > 1000, 'scenario B quantifies removed handoff metadata')
  assert.ok(acceptance.degradedErrors.length > 0, 'scenario B retains the degraded diagnostics')
  assert.equal(rejectedEvents.length, 0, 'scenario B does not emit a rejection event')
  assert.equal(degradedEvents.length >= 1, true, 'scenario B emits the degraded warning')
  assert.equal(attemptEvents.length, 1, 'scenario B records one successful attempt')
  const attempt = parseDetail(attemptEvents[0].detail)
  assert.equal(attempt.status, 'complete', 'scenario B attempt is complete')
  assert.equal(attempt.generatorStepIndex, 1, 'scenario B identifies S2 as the generator')
  assert.equal(attempt.rawVsExtractedDelta > 1000, true, 'scenario B attempt ledger records metadata delta')

  assert.equal(requests.length, 5,
    `scenario B uses S1 once, S2 three times, S3 once, got ${requests.length}`)
  assertS2SchemaRetryLedger(run, 5)
  const s3Request = requests[4]
  const s3Prompt = userText(s3Request.messages)
  assert(s3Prompt.includes(UPSTREAM_METADATA_HEADER),
    'S3 request receives the structured upstream metadata handoff')
  assert(s3Prompt.includes('extractedMeta: count='),
    'S3 structured handoff summarizes the extracted metadata envelope')
  assertRequestDoesNotContain(s3Request.messages, '【正文交接】', 'S3 request')
  assert(s3Prompt.includes(bodyText(110).split('\n')[0]),
    'S3 request receives the extracted body, not the raw degraded output')
  assert(!s3Prompt.includes('目标约3500字'), 'S3 request does not carry the generator word contract')
  assert(!body.includes('【正文交接】'), 'scenario B persists extracted prose only')
  assert(body.includes('潮声第110次'), 'scenario B persists the polished body')
  await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'scenario-b-success.png'), fullPage: false })
  await archiveEvidence('scenario-b-accept', run, requests, 1, ['scenario-b-success.png'])
  return { state, run, requests }
}

async function main() {
  const diskManifest = assertFreshRendererBuild()
  fs.rmSync(EVIDENCE_ROOT, { recursive: true, force: true })
  fs.rmSync(HEARTBEAT_PATH, { force: true })
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
  writeSkills()

  const watchdog = setTimeout(() => {
    console.error(`[FAIL] global timeout after ${GLOBAL_TIMEOUT_MS}ms`)
    process.exit(1)
  }, GLOBAL_TIMEOUT_MS)
  watchdog.unref()

  const provider = await startProvider()
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
      if (message.type() === 'error') console.error(`[PAGE ERROR] ${String(message.text()).slice(0, 600)}`)
    })
    await page.waitForSelector('#app', { timeout: 20_000 })
    await sleep(1500)
    await seedApplication(page, provider)
    heartbeat = startHeartbeat(page, electronProcess.pid)

    const skills = skillRecords()
    await selectBodySkillsThroughUi(page, skills)
    const selectedSkills = await page.evaluate(() =>
      [...document.querySelectorAll('#pl-s5-skills-list .pl-skill-chip')]
        .map(chip => (chip.textContent || '').trim()))
    assert.equal(selectedSkills.length, 3, `UI selected all three skills: ${JSON.stringify(selectedSkills)}`)
    await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'ui-skill-selection.png'), fullPage: false })

    const scenarioA = await runRejectScenario(page, provider)
    const scenarioB = await runAcceptScenario(page, provider)
    const heartbeatFrames = heartbeat.frameCount()
    const heartbeatDuration = heartbeat.durationMs()
    assert(heartbeatFrames >= 1, `heartbeat records the run, got ${heartbeatFrames} frames`)
    assert(heartbeatFrames >= Math.max(1, Math.floor(heartbeatDuration / 1200)),
      `heartbeat cadence is continuous for ${heartbeatDuration}ms, got ${heartbeatFrames} frames`)

    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'report.json'), JSON.stringify({
      schema: 'shenyi.body-contract-degraded.electron',
      version: 1,
      generatedAt: new Date().toISOString(),
      script: SCRIPT_NAME,
      projectId: PROJECT_ID,
      chapterId: CHAPTER_ID,
      targetWords: TARGET_WORDS,
      runtimeFingerprint: {
        source: 'vite-manifest',
        manifestVersion: String(diskManifest.schemaVersion),
        commit: diskManifest.commit,
        buildTime: diskManifest.buildTime,
      },
      hardRules: {
        visibleElectron: true,
        realDropdownSelection: '#pl-s5-skill / #pl-s5-add-skill / #pl-s5-skills-list',
        noInjectionImpersonation: true,
        physicalRequestSequenceAsserted: true,
      },
      scenarios: {
        'reject-before-s3': {
          status: scenarioA.state.runStatus,
          runId: scenarioA.run?.id,
          requestCount: scenarioA.requests.length,
          extractedWordCount: 1654,
          rejectReason: 'degraded_plus_contract_failure',
        },
        'accept-and-extract': {
          status: scenarioB.state.runStatus,
          runId: scenarioB.run?.id,
          requestCount: scenarioB.requests.length,
          extractedWordCount: 2200,
      s3ReceivesExtractedFace: true,
      s3ReceivesStructuredHandoff: true,
      s2SchemaRetryPhases: 2,
      timingLedgerConsistency: 'call/run/step same-source sums',
        },
      },
      heartbeatFrames,
      heartbeatDurationMs: heartbeatDuration,
    }, null, 2), 'utf8')
    console.log('===== BODY CONTRACT DEGRADED GATE ELECTRON PASSED =====')
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

main().catch(error => {
  console.error('[FAIL]', error)
  process.exitCode = 1
})
