import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = path.resolve(process.cwd())
const SCRIPT_NAME = 'verify-deai-stage-guidance-electron.mjs'
const ELECTRON_EXE = process.env.SHENYI_DEAI_STAGE_ELECTRON
  ? path.resolve(process.env.SHENYI_DEAI_STAGE_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_DEAI_STAGE_CDP_PORT || 9381)
const PROFILE = path.join(ROOT, '_data', 'deai-stage-guidance-profile')
const DATA_DIR = path.join(PROFILE, 'documents-data')
const EXPORT_ROOT = path.join(ROOT, '_data', 'deai-stage-guidance-exports')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-deai-stage-guidance-electron')
const SKILL_REPORT_PATH = path.join(EVIDENCE_ROOT, 'deai-skill-report.md')
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const HEARTBEAT_PATH = path.join(EVIDENCE_ROOT, 'heartbeat.jsonl')
const LIVE_SKILL_ROOT = path.join(ROOT, '_data', 'deai-stage-guidance-skills')
const DIAGNOSTIC_PROFILE = path.join(ROOT, '_data', `deai-stage-guidance-diagnostic-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`)
const PROJECT_ID = 'deai-stage-guidance-live'
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_DEAI_STAGE_GLOBAL_TIMEOUT_MS || 5 * 60_000)
const STEP_TIMEOUT_MS = Number(process.env.SHENYI_DEAI_STAGE_STEP_TIMEOUT_MS || 2 * 60_000)
const STALLED_TIMEOUT_MS = Number(process.env.SHENYI_DEAI_STAGE_STALLED_TIMEOUT_MS || 20_000)
const DEAD_TIMEOUT_MS = Number(process.env.SHENYI_DEAI_STAGE_DEAD_TIMEOUT_MS || 60_000)
const KEEP_PROFILE = process.env.SHENYI_DEAI_STAGE_KEEP_PROFILE === '1'

const OUTLINE_TEXT = [
  '# 降AI位置诊断真实链路实测',
  '周砚确认风暴信标与旧航道沉船名单，沿南方航线推进第一阶段远航。',
  '第一卷 风暴起点：灯塔、名单与南方航线共同推动冲突。',
].join('\n')

const S2_BODY = Array.from({ length: 60 }, (_, index) => index % 2 === 0
  ? `周砚深吸一口气，缓缓地转身。风暴信标第三次亮起，他突然意识到沉船名单里的名字指向旧航道。第${index + 1}次信号结束。`
  : `许知微把私章按在名单末页，低声提醒旧航道的暗礁。周砚压低灯芯，记下第${index + 1}段航路变化。`
).join('\n')

const S3_BODY = Array.from({ length: 60 }, (_, index) => index % 2 === 0
  ? `周砚收住呼吸，把名单折进防水袋。风暴信标第三次亮起，旧航道的名字压在他掌心。第${index + 1}次记录结束。`
  : `许知微收起私章，用炭笔圈出暗礁位置。灯芯安静下来，第${index + 1}段航路被写进海图。`
).join('\n')

const BODY_HANDOFF = [
  '【正文交接】',
  '章节：风暴信标',
  'POV：周砚',
  '已完成场景：3',
  '未完成场景：无',
  '来源覆盖状态：全部覆盖',
  '角色状态变化：周砚确认信标并取得沉船名单',
  '章末状态：等待清晨渔船',
  '下一章必须使用：南方航线接头暗号',
  '目标字数：2000',
  '生成下限：1600',
  '场景总数：3',
  '事件增量：确认信标、取得名单、预约渔船',
  'narrativeStatus：ready',
  'narrativeReason：三场场景均推进事实状态',
  'stateChangingScenes：3',
  'FACT_LOCK：人物状态=警觉；位置=灯塔；目标=南方航线',
  'NEW_FACT：沉船名单指向旧航道',
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
  assert.equal(staleBundles.length, 0,
    `renderer build is stale; rebuild with npm run build:vue. Stale bundles: ${staleBundles.join(', ')}`)
}

function writeSkills() {
  fs.rmSync(LIVE_SKILL_ROOT, { recursive: true, force: true })
  fs.mkdirSync(LIVE_SKILL_ROOT, { recursive: true })

  const skills = [
    {
      folder: 'deai-stage-s1',
      id: 'DEAI-STAGE-S1',
      name: 'S-Live-DeaiStageS1',
      description: 'live body chain first-step skill',
      role: null,
      template: [
        '# 职责',
        '',
        '只输出骨架，不输出正文。',
        '骨架包含三场场景目标、行动链与状态变化。',
        '',
      ].join('\n'),
      response: `骨架：\n场景1：确认信标。\n场景2：取得名单。\n场景3：预约渔船。\n`,
    },
    {
      folder: 'deai-stage-s2',
      id: 'DEAI-STAGE-S2',
      name: 'S-Live-DeaiStageS2',
      description: 'live body generator skill',
      role: 'generator',
      template: [
        '# 职责',
        '',
        '按上游骨架输出完整正文，并在末尾输出【正文交接】。',
        '正文后另起一行输出【正文交接】区块。',
        '',
      ].join('\n'),
      response: `${S2_BODY}\n${BODY_HANDOFF}\n`,
    },
    {
      folder: 'deai-stage-s3',
      id: 'DEAI-STAGE-S3',
      name: 'S-Live-DeaiStageS3',
      description: 'live body polish skill',
      role: 'polish',
      template: [
        '# 职责',
        '',
        '打磨上游正文，不改变事实、事实账本与事件增量。',
        '保留【正文交接】中的 FACT_LOCK 与 NEW_FACT。',
        '',
      ].join('\n'),
      response: `${S3_BODY}\n${BODY_HANDOFF}\n`,
    },
  ]

  for (const skill of skills) {
    const dir = path.join(LIVE_SKILL_ROOT, skill.folder)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'SKILL.md'), [
      '---',
      'schema: shenyi.skill',
      'version: 1',
      `id: ${skill.id}`,
      `name: ${skill.name}`,
      '---',
      'Live verification skill. Created and removed by the Electron verifier.',
      '',
    ].join('\n'), 'utf8')
    fs.writeFileSync(path.join(dir, 'template.md'), skill.template, 'utf8')
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({
      deai: {
        contractVersion: 2,
        generation: 'on',
        finalStepDetection: 'on',
        conflictPolicy: 'skill-wins',
        guidanceOwnership: 'skill',
        overlaps: [],
      },
      sampleCount: 0,
      ...(skill.role ? { chainHandoff: { role: skill.role, reason: `live verification ${skill.role} step` } } : {}),
    }, null, 2), 'utf8')
    fs.writeFileSync(path.join(dir, 'script.js'),
      `exports.preProcess = function (payload) { return { input: payload.input } }\n`, 'utf8')
  }
  return skills
}

function loadSkillFolder({ root, folder, description }) {
  const folderPath = path.join(root, folder)
  const definitionPath = path.join(folderPath, 'SKILL.md')
  const definition = fs.readFileSync(definitionPath, 'utf8')
  const idMatch = definition.match(/^id:\s*(\S+)/m)
  assert(idMatch, `${folder}: SKILL.md exposes an id`)
  const nameMatch = definition.match(/^name:\s*(.+)$/m)
  const templatePath = path.join(folderPath, 'template.md')
  assert(fs.existsSync(templatePath), `${folder}: template.md exists`)
  return {
    folder,
    sourceId: idMatch[1],
    response: writeSkills.responses?.[folder] || null,
    skill: {
      id: `folder:${idMatch[1]}`,
      sourceId: idMatch[1],
      name: nameMatch ? nameMatch[1].trim() : folder,
      template: fs.readFileSync(templatePath, 'utf8'),
      description,
      format: 'folder',
      source: 'external',
      category: 'folder',
      folderPath,
      executionMode: 'chain',
      outputFormat: 'text',
      sourcePath: definitionPath,
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
    },
  }
}

function startProvider() {
  const requests = []
  const queue = []
  const server = http.createServer((request, response) => {
    let bodyText = ''
    request.on('data', chunk => { bodyText += chunk })
    request.on('end', () => {
      requests.push({ at: new Date().toISOString(), url: request.url, bodyText })
      const next = queue.length > 0 ? queue.shift() : null
      const responseBody = typeof next?.body === 'function' ? next.body(bodyText) : next?.body
      if (responseBody === undefined) {
        response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({ error: { message: 'mock response queue exhausted' } }))
        return
      }
      let wantsStream = false
      try { wantsStream = JSON.parse(bodyText).stream === true } catch {}
      if (wantsStream) {
        const chunks = [
          `data: ${JSON.stringify({ choices: [{ delta: { content: responseBody } }] })}\n\n`,
          `data: ${JSON.stringify({
            choices: [{ delta: {}, finish_reason: 'stop' }],
            usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 },
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
        choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: responseBody } }]
      }))
    })
  })
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        requests: () => requests.map(item => ({ ...item })),
        enqueue: body => { queue.push({ body }) },
        close: () => new Promise(done => server.close(() => done())),
      })
    })
  })
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
      SHENYI_TEST_EXPORT_PATH: SKILL_REPORT_PATH,
      SHENYI_TEST_EXPORT_DELAY_MS: '400',
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
  try { execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
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

async function diagnoseSkillSelection(page, { skills }) {
  const state = await page.evaluate(({ expectedSkillIds }) => {
    const skillStore = window.__pinia?._s?.get('skill')
    const options = [...document.querySelectorAll('#pl-s5-skill option')].map(option => ({
      value: option.value,
      text: (option.textContent || '').trim(),
      disabled: option.disabled,
      selected: option.selected,
    }))
    const chips = [...document.querySelectorAll('#pl-s5-skills-list .pl-skill-chip')]
      .map(chip => (chip.textContent || '').trim())
    const addButton = document.querySelector('#pl-s5-add-skill')
    return {
      expectedSkillIds,
      storeSkillIds: (skillStore?.skills || []).map(skill => `${skill.id} / ${skill.name} / ${skill.format}`),
      options,
      chips,
      addButton: addButton ? {
        disabled: addButton.disabled,
        visible: Boolean(addButton.offsetParent),
      } : null,
      currentStep: window.__pinia?._s?.get('pipeline')?.currentStep ?? null,
    }
  }, { expectedSkillIds: skills.map(skill => skill.skill.id) })
  fs.writeFileSync(path.join(EVIDENCE_ROOT, 'skill-selection-diagnostic.json'),
    JSON.stringify(state, null, 2), 'utf8')
  console.log('[SKILL SELECTION DIAGNOSTIC]', JSON.stringify(state))
}

async function seedApplication(page, provider, skills) {
  await page.evaluate(async ({ baseUrl, projectId, seededSkills, outline }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'deai-stage-guidance-provider',
        name: 'Deai Stage Guidance Provider',
        baseUrl,
        apiKey: 'deai-stage-local-key',
        models: ['deai-stage-model'],
        selectedModel: 'deai-stage-model',
        temperature: 0.1,
        maxTokens: 4096,
        contextWindowTokens: 128000,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
      }],
      generateProvider: 'deai-stage-guidance-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: '降AI位置诊断真实链路',
      outlineText: outline,
      outlineLocked: true,
      outlineLockedText: outline,
      bookWordCount: 1000,
      volumesConfirmed: true,
      pipelineConfig: { volumeCount: 1, volumeWords: 2000, chapterWords: 2000 },
      chaptersConfirmed: true,
      settingsGenerated: true,
      settings: [],
      volumes: [{
        id: 'vol-deai-stage',
        name: '风暴起点',
        outline: '周砚确认风暴信标，并沿南方航线推进第一阶段远航。',
        summary: '灯塔信标与南方航线构成第一卷冲突。',
        allocatedWords: 1000,
        suggestedWords: 1000,
        wordsPerChapter: 2000,
        chapterCount: 1,
        confirmed: true,
        locked: true,
        isBound: true,
        boundTo: ['pipeline'],
        bodyGenerated: false,
      }],
      chapters: {
        'vol-deai-stage': [{
          id: 'ch-deai-stage',
          title: '风暴信标',
          plot: '周砚在灯塔底层确认风暴信标的三次红色闪烁；他收到旧航道沉船名单，认出领航员许知微的私章，并把名单折进防水袋，预约清晨渔船沿南方航线南下。',
          summary: '灯塔信标与旧航道线索推动主角南下。',
          confirmed: true,
          pipelineGenerated: true,
          bodyGenerated: false,
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
    await window.electronAPI.storageWrite('wa_skills', { skills: seededSkills, pipelineSkills: [] })
    await window.electronAPI.storageWrite('wa_pipeline_step_config', {
      agents: { 0: '', 1: '', 2: '', 3: '', 4: '' },
      skills: { 0: [], 1: [], 2: [], 3: [], 4: [] },
      modes: { 0: 'compose', 1: 'compose', 2: 'chain', 3: 'chain', 4: 'chain' },
      skillAgents: {},
    })
    await window.electronAPI.storageWrite('wa_deAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
    await window.electronAPI.storageWrite('wa_deai_calibration_ledger', {
      version: 1,
      entries: [
        {
          provider: 'deai-stage-guidance-provider',
          model: 'deai-stage-model',
          ruleId: 'deai-e2e-stable-rule',
          sampleCount: 6,
          updatedAt: 0,
        },
        {
          provider: 'deai-stage-guidance-provider',
          model: 'deai-stage-model',
          ruleId: 'deai-e2e-immature-rule',
          sampleCount: 1,
          updatedAt: 0,
        },
      ],
    })
    await window.electronAPI.storageRemove('wa_pipeline_breakpoint')
  }, {
    baseUrl: `http://127.0.0.1:${provider.port}`,
    projectId: PROJECT_ID,
    seededSkills: skills.map(item => item.skill),
    outline: OUTLINE_TEXT,
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
    let added = false
    try {
      await page.waitForFunction(({ skillName, expectedCount }) => {
        const chips = [...document.querySelectorAll('#pl-s5-skills-list .pl-skill-chip')]
        return chips.length === expectedCount
          && chips.some(chip => (chip.textContent || '').includes(skillName))
      }, {
        skillName: skill.skill.name,
        expectedCount: skills.indexOf(skill) + 1,
      }, { timeout: 1500, polling: 100 })
      added = true
    } catch {}
    if (!added) {
      await diagnoseSkillSelection(page, { skills })
      throw new Error(`failed to add body skill through real UI: ${skill.skill.id} (${skill.skill.name})`)
    }
    await page.waitForFunction(({ skillId, skillName, expectedCount }) => {
      const chips = [...document.querySelectorAll('#pl-s5-skills-list .pl-skill-chip')]
      return chips.length === expectedCount
        && chips.some(chip => (chip.textContent || '').includes(skillId)
          || (chip.textContent || '').includes(skillName))
    }, {
      skillId: skill.skill.id,
      skillName: skill.skill.name,
      expectedCount: skills.indexOf(skill) + 1,
    }, { timeout: 10_000, polling: 250 })
    await page.waitForFunction(({ skillName, expectedCount }) => {
      const chips = [...document.querySelectorAll('#pl-s5-skills-list .pl-skill-chip')]
      return chips.length === expectedCount
        && chips.some(chip => (chip.textContent || '').includes(skillName))
    }, {
      skillName: skill.skill.name,
      expectedCount: skills.indexOf(skill) + 1,
    }, { timeout: 10_000, polling: 250 })
    console.log(`[SKILL UI SELECTED] ${skill.skill.id} (${skill.skill.name})`)
  }
  const selected = await page.evaluate(() =>
    [...document.querySelectorAll('#pl-s5-skills-list .pl-skill-chip')]
      .map(chip => (chip.textContent || '').trim()))
  assert.equal(selected.length, skills.length,
    `all body SKILLs are selected through the real dropdown; got ${JSON.stringify(selected)}`)
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
      eventTypes: (run?.events || []).map(event => event.type),
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
  const deadline = Date.now() + STEP_TIMEOUT_MS
  while (Date.now() < deadline) {
    const snapshot = await currentRunSnapshot(page)
    const signature = JSON.stringify(snapshot)
    if (signature !== lastSignature) {
      lastSignature = signature
      lastProgressAt = Date.now()
      lastSnapshot = snapshot
      console.log(`[BODY RUN] ${JSON.stringify(snapshot)}`)
    } else if (Date.now() - lastProgressAt >= DEAD_TIMEOUT_MS) {
      throw new Error(`body generation is dead for ${DEAD_TIMEOUT_MS}ms: ${JSON.stringify(lastSnapshot)}`)
    } else if (Date.now() - lastProgressAt >= STALLED_TIMEOUT_MS) {
      console.warn(`[STALL WARNING] body run unchanged for ${Date.now() - lastProgressAt}ms`)
    }
    if (snapshot.isGenerating || snapshot.status === 'generating' || snapshot.runningApiCalls > 0) {
      await sleep(500)
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
    await sleep(500)
  }
  throw new Error(`body generation did not finish within ${STEP_TIMEOUT_MS}ms: ${JSON.stringify(lastSnapshot)}`)
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
  const run = JSON.parse(fs.readFileSync(path.join(directory, 'run-trace.json'), 'utf8'))
  const payloads = {}
  const payloadRoot = path.join(directory, 'payloads')
  if (fs.existsSync(payloadRoot)) {
    for (const name of fs.readdirSync(payloadRoot)) {
      if (!name.endsWith('-request.json')) continue
      payloads[name] = JSON.parse(fs.readFileSync(path.join(payloadRoot, name), 'utf8'))
    }
  }
  return { directory, run, payloads }
}

function parseDetail(value) {
  if (typeof value !== 'string') return value || {}
  try { return JSON.parse(value) } catch { return {} }
}

function eventsByType(run, type) {
  return (run.events || []).filter(event => event.type === type)
}

function physicalCallsOf(call) {
  return Array.isArray(call?.physicalCalls) ? call.physicalCalls : []
}

function requestMessagesOf(tracePath, requestMessages) {
  const ref = requestMessages?.__payload?.id
  if (!ref) return Array.isArray(requestMessages) ? requestMessages : requestMessages?.messages || []
  const number = ref.replace(/^payload-/, '')
  const file = path.join(path.dirname(tracePath), 'payloads', `${number}-request.json`)
  assert(fs.existsSync(file), `exported request payload exists: ${file}`)
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  return Array.isArray(parsed) ? parsed : parsed?.messages || []
}

function messageText(message) {
  if (!message) return ''
  if (typeof message.content === 'string') return message.content
  if (Array.isArray(message.content)) return message.content.map(part => part?.text || '').join('\n')
  return ''
}

function userText(messages) {
  return messages.filter(item => item?.role === 'user').map(messageText).join('\n')
}

function systemText(messages) {
  return messages.filter(item => item?.role === 'system').map(messageText).join('\n')
}

function assertStageGuidanceRun({ tracePath, run, payloads, requests }) {
  assert.equal(run.step, 4, 'run is the body layer')
  assert.equal(run.status, 'success', `run succeeds with guidance injected, got ${run.status}`)
  assert.equal((run.apiCalls || []).length, 3, 'three chain skills make three logical API calls')
  assert.equal(requests.length, 3, 'three physical provider requests are made')

  const guidanceEvents = eventsByType(run, 'deai-stage-guidance')
  assert.equal(guidanceEvents.length, 1,
    `exactly one S2->S3 diagnosis event is retained, got ${guidanceEvents.length}`)
  const guidance = parseDetail(guidanceEvents[0].detail)
  assert.equal(guidance.step, 4)
  assert.equal(guidance.sourceSkillIndex, 1)
  assert.equal(guidance.targetSkillIndex, 2)
  assert.equal(guidance.totalSkillCount, 3)
  assert.equal(guidance.target, 'next_step_user_prompt')
  assert(guidance.findingCount > 0, 'S2 body triggers local deai findings')
  assert(guidance.guidanceChars > 0 && guidance.guidanceChars <= 1200,
    `guidance stays within the 1200-char budget, got ${guidance.guidanceChars}`)
  assert(/^deai-stage-v1:[0-9a-f]{16}$/.test(guidance.hash), 'guidance hash uses the stable format')
  assert.equal(guidance.degraded, false, 'diagnosis does not degrade')
  assert.equal(guidance.budgetExceeded, false, 'diagnosis stays within its construction budget')
  assert(JSON.stringify(guidance).length < 800,
    `trace event carries only bounded structured fields, got ${JSON.stringify(guidance).length}`)

  const generatorAcceptance = eventsByType(run, 'body-step-acceptance')
    .map(event => parseDetail(event.detail))
  assert.equal(generatorAcceptance.length, 1,
    `only the generator step enters contract acceptance, got ${generatorAcceptance.length}`)
  assert.equal(generatorAcceptance[0].decision, 'accept')
  assert.equal(generatorAcceptance[0].reason, 'contract_valid')
  assert(generatorAcceptance[0].extractedWordCount >= 1600,
    `generator extracted body passes the 80% length gate, got ${generatorAcceptance[0].extractedWordCount}`)

  const calls = run.apiCalls || []
  const thirdMessages = physicalCallsOf(calls[2]).map(physical =>
    requestMessagesOf(tracePath, physical.requestMessages)).at(-1) || []
  const thirdUser = userText(thirdMessages)
  assert(thirdUser.includes('【S2诊断情报（有界，不改稿）】'),
    'S3 physical user prompt carries the bounded diagnosis block')
  assert(thirdUser.includes('位置 '), 'S3 prompt carries position information')
  const originalS2Paragraphs = S2_BODY.split('\n')
  const diagnosisHeader = '【S2诊断情报（有界，不改稿）】'
  const diagnosisStart = thirdUser.indexOf(diagnosisHeader)
  const chainHandoffStart = thirdUser.indexOf('--- 上一步 SKILL 完整输出 ---')
  assert(diagnosisStart >= 0 && chainHandoffStart >= 0 && diagnosisStart > chainHandoffStart,
    'bounded diagnosis is appended after the normal chain handoff block')
  const diagnosisBlock = thirdUser.slice(diagnosisStart)
  const leakedS2Paragraphs = originalS2Paragraphs.filter(paragraph =>
    paragraph.length > 0 && diagnosisBlock.includes(paragraph))
  assert.equal(leakedS2Paragraphs.length, 0,
    `diagnosis block does not carry S2 candidate paragraphs, leaked ${leakedS2Paragraphs.length}`)
  assert(diagnosisBlock.length <= 1200,
    `diagnosis block stays within the injection budget, got ${diagnosisBlock.length}`)

  const firstUser = userText(physicalCallsOf(calls[0]).map(physical =>
    requestMessagesOf(tracePath, physical.requestMessages)).at(-1) || [])
  const secondUser = userText(physicalCallsOf(calls[1]).map(physical =>
    requestMessagesOf(tracePath, physical.requestMessages)).at(-1) || [])
  assert(!firstUser.includes('【S2诊断情报（有界，不改稿）】'),
    'S1 request is made before diagnosis exists')
  assert(!secondUser.includes('【S2诊断情报（有界，不改稿）】'),
    'S2 request does not consume its own diagnosis')

  assert.equal(eventsByType(run, 'body-generator-step-rejected').length, 0,
    'diagnosis never rejects the generator step')
  assert((run.apiCalls || []).every(call => physicalCallsOf(call).length === 1),
    'diagnosis never triggers an extra retry request')

  const payloadsCount = Object.keys(payloads).length
  assert(payloadsCount >= 3,
    `deep trace exports all physical request payloads, got ${payloadsCount}`)
  const terminalCall = (run.apiCalls || []).at(-1)
  const persisted = String(terminalCall?.responseTextPreview || '')
  assert(persisted.includes('旧航道的名字压在他掌心'),
    'S3 polished body is the terminal persisted artifact')

  const policyEvents = eventsByType(run, 'deai-injection-policy')
  assert(policyEvents.length >= 6,
    `skill ownership emits both generic and explicit policy events, got ${policyEvents.length}`)
  for (const event of policyEvents) {
    const detail = parseDetail(event.detail)
    const ownership = detail.policy?.guidanceOwnership || detail.ownership
    assert.equal(ownership, 'skill',
      `body-layer deai ownership is skill-owned in every policy event, got ${JSON.stringify(detail)}`)
  }
  assert.equal(eventsByType(run, 'deai-guidance-pack').length, 0,
    'skill ownership keeps the methodology guidance pack at zero')
  const methodologyProbe = '【降AI方法指导'
  const modelProfileProbe = '【模型事实情报】'
  for (const call of run.apiCalls || []) {
    for (const physical of physicalCallsOf(call)) {
      const messages = requestMessagesOf(tracePath, physical.requestMessages)
      const text = [systemText(messages), userText(messages)].join('\n')
      assert(!text.includes(methodologyProbe),
        'skill ownership injects no application methodology text')
      assert(text.includes(modelProfileProbe),
        'released model profile injects bounded model facts')
    }
  }
  assert.deepEqual((run.apiCalls || []).map(call => call.deaiPromptVariant),
    ['methodology', 'creative', 'polish'],
    `logical API calls expose the three skill-owned variants, got ${JSON.stringify((run.apiCalls || []).map(call => call.deaiPromptVariant))}`)

  const profileEvents = eventsByType(run, 'deai-model-profile')
  assert.equal(profileEvents.length, 3,
    `every body chain step emits a model-profile observation, got ${profileEvents.length}`)
  for (const event of profileEvents) {
    const detail = parseDetail(event.detail)
    assert.equal(detail.provider, 'deai-stage-guidance-provider')
    assert.equal(detail.model, 'deai-stage-model')
    assert(detail.eligibleRuleCount >= 1, `the mature seeded rule is eligible, got ${JSON.stringify(detail)}`)
    assert.equal(detail.released, true,
      `eligible model profile releases at the calibration threshold, got ${JSON.stringify(detail)}`)
    assert.equal(detail.releaseGate, null,
      `released model profile clears the blocking release gate, got ${JSON.stringify(detail)}`)
    assert(detail.injectedRuleCount > 0 && detail.injectedRuleCount <= 3,
      `released model profile injects at most three rules, got ${JSON.stringify(detail)}`)
  }

  const calibrationEvents = eventsByType(run, 'deai-calibration')
  assert.equal(calibrationEvents.length, 1,
    `one final calibration event is emitted, got ${calibrationEvents.length}`)
  const calibration = parseDetail(calibrationEvents[0].detail)
  assert.equal(calibration.provider, 'deai-stage-guidance-provider')
  assert.equal(calibration.model, 'deai-stage-model')
  assert.equal(calibration.ledgerWritten, true, 'final findings are persisted to the calibration ledger')
  assert(calibration.findingCount > 0, 'final diagnosis reports at least one finding')
}

async function runCase(provider) {
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

    const skills = ['deai-stage-s1', 'deai-stage-s2', 'deai-stage-s3'].map(folder =>
      loadSkillFolder({
        root: LIVE_SKILL_ROOT,
        folder,
        description: `live body deai-stage guidance ${folder}`,
      }))
    await seedApplication(page, provider, skills)

    for (const skill of skills) provider.enqueue(skill.response)
    await selectBodySkillsThroughUi(page, skills)
    const startRequestIndex = provider.requests().length
    heartbeat = startHeartbeat(page, electronProcess.pid)
    await page.click('#btn-primary-gen-body')
    const completion = await waitForBodyCompletion(page)
    assert.equal(completion.terminal, 'success',
      `body run reaches success through the real UI, got ${completion.terminal}`)
    const exported = await exportLatestRun(page)
    const { directory, run, payloads } = readExportedRun(exported)
    await assertSkillTakeoverUiAndArtifacts(page)
    return {
      run,
      payloads,
      directory,
      requests: provider.requests().slice(startRequestIndex),
    }
  } finally {
    heartbeat?.stop()
    try { await browser?.close() } catch {}
    closeElectron(electronProcess)
    await sleep(800)
  }
}

async function assertSkillTakeoverUiAndArtifacts(page) {
  await page.click('#btn-pipeline')
  await page.waitForSelector('#pipeline-panel', { timeout: STEP_TIMEOUT_MS })
  await page.locator('#pl-steps .pl-step').nth(4).click()
  await page.waitForSelector('#pl-step-5-content', { state: 'visible', timeout: STEP_TIMEOUT_MS })
  await page.waitForTimeout(500)
  await page.waitForSelector('#btn-pl-deai-skill-report:not([disabled])', { timeout: STEP_TIMEOUT_MS })
  const uiLines = await page.locator('#pl-deai-guidance-feedback .pl-deai-guidance-feedback-line').allTextContents()
  assert.equal(uiLines.length, 3,
    `the real UI projects exactly methodology/diagnosis/calibration lines, got ${JSON.stringify(uiLines)}`)
  assert.equal(uiLines[0], '方法论 · SKILL接管 · 0条/0字符',
    `skill ownership is visible in the UI with zero application methodology, got ${uiLines[0]}`)
  assert(!uiLines[1].includes('未观测'),
    `the bounded diagnosis line is visible in the real UI, got ${uiLines[1]}`)
  assert(uiLines[2].includes('已落账'),
    `the calibration line shows the ledger write in the real UI, got ${uiLines[2]}`)

  const ledger = await page.evaluate(async () => {
    const raw = await window.electronAPI.storageRead('wa_deai_calibration_ledger')
    return raw && typeof raw === 'object' ? raw : null
  })
  assert(ledger && Array.isArray(ledger.entries),
    `the calibration ledger is readable through the real storage API, got ${JSON.stringify(ledger)}`)
  const stableRule = ledger.entries.find(entry => entry.ruleId === 'deai-e2e-stable-rule')
  const immatureRule = ledger.entries.find(entry => entry.ruleId === 'deai-e2e-immature-rule')
  const finalFindingRules = ledger.entries.filter(entry =>
    entry.ruleId !== 'deai-e2e-stable-rule' && entry.ruleId !== 'deai-e2e-immature-rule')
  assert(stableRule && stableRule.sampleCount === 6,
    `the mature seeded rule remains stable at 6 samples, got ${JSON.stringify(stableRule)}`)
  assert(immatureRule && immatureRule.sampleCount === 1,
    `the immature seeded rule remains below the profile threshold, got ${JSON.stringify(immatureRule)}`)
  assert(finalFindingRules.length > 0 && finalFindingRules.every(entry => entry.sampleCount >= 1),
    `final findings add new calibration entries, got ${JSON.stringify(finalFindingRules)}`)

  await page.fill('#pl-deai-false-positive-input', 'deai-short-sentence：S3 合法打磨被误报')
  await page.click('#btn-pl-deai-false-positive')
  await page.waitForFunction(() =>
    document.querySelector('#pl-deai-false-positive-input')?.value === '', null, { timeout: STEP_TIMEOUT_MS })
  await page.waitForSelector('#btn-pl-deai-false-positive[disabled]', { timeout: STEP_TIMEOUT_MS })

  await page.click('#btn-pl-deai-skill-report')
  await page.waitForFunction(() => document
    .querySelector('#btn-pl-deai-skill-report')?.hasAttribute('disabled') === true, null, { timeout: STEP_TIMEOUT_MS })
  await sleep(500)
  assert(fs.existsSync(SKILL_REPORT_PATH), 'the real report click writes the SKILL report to disk')
  const report = fs.readFileSync(SKILL_REPORT_PATH, 'utf8')
  assert(report.includes('# 正文层降AI协同 SKILL 迭代报告'),
    `the exported report has the expected title, got ${report.slice(0, 120)}`)
  assert(report.includes('- 方法论：SKILL接管，0条/0字符'),
    `the exported report states skill ownership with zero application injection, got ${report.slice(0, 600)}`)
  assert(report.includes('- S2诊断：3条'),
    `the exported report keeps the S2 diagnosis count instead of the S3 cleanup result, got ${report.slice(0, 800)}`)
  assert(report.includes('- 变体: methodology, creative, polish'),
    `the exported report derives variants from persisted API calls, got ${report.slice(0, 800)}`)
  assert(report.includes('## 误伤候选\n\n- deai-short-sentence：S3 合法打磨被误报'),
    `the exported report carries the mouse-registered false positive, got ${report.slice(0, 1000)}`)
  assert(report.includes('provider/model: deai-stage-guidance-provider / deai-stage-model'),
    `the exported report carries the provider/model identity, got ${report.slice(0, 600)}`)
  assert(!report.includes('【降AI方法指导'),
    'the exported report does not inject application methodology text')
}

async function main() {
  assertFreshRendererBuild()
  fs.rmSync(EVIDENCE_ROOT, { recursive: true, force: true })
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  await removeDir(PROFILE)
  await removeDir(EXPORT_ROOT)
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
  const skillResponses = writeSkills()
  writeSkills.responses = Object.fromEntries(skillResponses.map(skill => [skill.folder, skill.response]))

  const watchdog = setTimeout(() => {
    console.error(`[FAIL] global timeout after ${GLOBAL_TIMEOUT_MS}ms`)
    process.exit(1)
  }, GLOBAL_TIMEOUT_MS)
  watchdog.unref()

  const provider = await startProvider()
  let result = null
  try {
    result = await runCase(provider)
    assertStageGuidanceRun({
      tracePath: path.join(result.directory, 'run-trace.json'),
      run: result.run,
      payloads: result.payloads,
      requests: result.requests,
    })

    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'summary.json'), JSON.stringify({
      schema: 'shenyi.deai-stage-guidance.electron',
      version: 1,
      generatedAt: new Date().toISOString(),
      script: SCRIPT_NAME,
      projectId: PROJECT_ID,
      runId: result.run.id,
      runStatus: result.run.status,
      requestCount: result.requests.length,
      evidenceDirectory: result.directory,
      hardRules: {
        visibleElectron: true,
        realUiSkillSelection: '#pl-s5-skill / #pl-s5-add-skill / #pl-s5-skills-list',
        realBodyButtonClick: '#btn-primary-gen-body',
        deepTraceExport: true,
        physicalRequestAssertion: true,
      },
    }, null, 2), 'utf8')
    console.log('===== DEAI STAGE GUIDANCE ELECTRON PASSED =====')
  } finally {
    if (result) {
      fs.copyFileSync(path.join(result.directory, 'run-trace.json'),
        path.join(EVIDENCE_ROOT, 'run-trace.json'))
      const payloadRoot = path.join(result.directory, 'payloads')
      if (fs.existsSync(payloadRoot)) {
        fs.cpSync(payloadRoot, EVIDENCE_ROOT, { recursive: true })
      }
    }
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'provider-requests.json'),
      JSON.stringify(provider.requests(), null, 2), 'utf8')
    await provider.close()
    clearTimeout(watchdog)
    if (!KEEP_PROFILE) {
      await removeDir(PROFILE)
      await removeDir(EXPORT_ROOT)
      await removeDir(LIVE_SKILL_ROOT)
    }
  }
}

main().catch(error => {
  console.error('[FAIL]', error)
  process.exitCode = 1
})
