import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = path.resolve(process.cwd())
const SCRIPT_NAME = 'verify-body-failure-topology-electron.mjs'
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_BODY_FAILURE_TOPOLOGY_CDP_PORT || 9382)
const PROFILE = path.join(ROOT, '_data', 'body-failure-topology-profile')
const DATA_DIR = path.join(PROFILE, 'documents-data')
const EXPORT_ROOT = path.join(ROOT, '_data', 'body-failure-topology-exports')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-body-failure-topology')
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const HEARTBEAT_PATH = path.join(EVIDENCE_ROOT, 'heartbeat.jsonl')
const FIXTURE_ROOT = path.join(ROOT, '_audit', 'tmp-body-failure-topology-fixture')
const PROJECT_ID = 'body-failure-topology'
const CHAPTER_ID = 'ch-body-failure-topology'
const VOLUME_ID = 'vol-body-failure-topology'
const OWNER_KEY = `pipeline:${PROJECT_ID}:step-4:chapter-${CHAPTER_ID}`
const OWNER_STORAGE_KEY = `wa_pipeline_breakpoint_owner_${OWNER_KEY}`
const SCENARIO = String(process.env.SCENARIO || '').toLowerCase()
assert(['a', 'b', 'c'].includes(SCENARIO), 'SCENARIO must be one of a|b|c')

const OUTLINE_TEXT = [
  '# 正文失败拓扑验证',
  '周砚确认风暴信标，沿旧航道取得沉船名单，并预约南方航线清晨渔船。',
  '第一卷 风暴起点：信标、名单与南方航线共同推动冲突。',
].join('\n')

const LONG_BODY = Array.from({ length: 90 }, (_, index) => [
  `周砚在灯塔第${index + 1}段刻痕前停住，风暴信标的光压在纸页上。`,
  `他把沉船名单折成方形，确认第${index + 1}次潮声没有打乱航路。`,
  `许知微提醒南方航线要避开旧暗礁，他把暗号压进掌心。`,
].join('')).join('\n')

const SHORT_BODY = '周砚只写下短句，等待上游补齐剧情点。'
const GOOD_META = [
  'FACT_LOCK：人物状态：周砚确认名单并预约渔船；位置：灯塔底层；持有物：沉船名单',
  '事件增量：确认信标、取得名单、预约渔船',
  'narrativeStatus：ready',
].join('\n')

const GOOD_S1 = [
  '场景1：周砚确认信标。',
  '场景2：取得沉船名单。',
  '场景3：预约南方航线渔船。',
  '【正文交接】',
  'FACT_LOCK:人物状态=周砚确认信标并取得名单',
  'FACT_LOCK:位置=灯塔底层',
  'FACT_LOCK:持有物=沉船名单',
  '【正文交接结束】',
].join('\n')

const BAD_S1 = [
  '场景1：周砚确认信标。',
  '场景2：取得沉船名单。',
  '场景3：预约南方航线渔船。',
].join('\n')

function makeGoodEnvelope(metaText = GOOD_META) {
  return JSON.stringify({
    body: LONG_BODY,
    metadata: { extractedMeta: [metaText] },
  })
}

const GOOD_S2 = makeGoodEnvelope()
const GOOD_S3 = makeGoodEnvelope()
const SHORT_ENVELOPE = JSON.stringify({
  body: SHORT_BODY,
  metadata: { extractedMeta: [GOOD_META] },
})

const QUEUES = {
  a: ['[NOT-READY] 剧情点缺少完成判定。', GOOD_S1, GOOD_S2, GOOD_S3],
  b: [BAD_S1, BAD_S1, BAD_S1, BAD_S1, BAD_S1, BAD_S1],
  c: [GOOD_S1, SHORT_ENVELOPE, SHORT_ENVELOPE, SHORT_ENVELOPE, GOOD_S2, GOOD_S3],
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function removeDir(target) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
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
      if (entry.isDirectory()) collectSources(path.join(dir, entry.name))
      else if (/\.(ts|vue|js|mjs|css)$/.test(entry.name)) sourceFiles.push(path.join(dir, entry.name))
    }
  }
  collectSources(path.join(ROOT, 'src'))
  const newestSourceMs = Math.max(...sourceFiles.map(file => fs.statSync(file).mtimeMs))
  const staleBundles = bundleNames.filter(name =>
    fs.statSync(path.join(ROOT, 'dist-renderer', name)).mtimeMs < newestSourceMs)
  assert.equal(staleBundles.length, 0,
    `renderer build is stale; rebuild with npm run build:vue. Stale bundles: ${staleBundles.join(', ')}`)
}

function writeRunLog(step, value) {
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  const body = typeof value === 'string' ? value : JSON.stringify(value)
  fs.appendFileSync(RUN_LOG_PATH, `[${new Date().toISOString()}] ${step} ${body}\n`, 'utf8')
}

function loadFixtureSkill(folder, description) {
  const folderPath = path.join(FIXTURE_ROOT, folder)
  const definitionPath = path.join(folderPath, 'SKILL.md')
  const definition = fs.readFileSync(definitionPath, 'utf8')
  const idMatch = definition.match(/^id:\s*(\S+)/m)
  const nameMatch = definition.match(/^name:\s*(.+)$/m)
  assert(idMatch, `${folder}: SKILL.md exposes an id`)
  const templatePath = path.join(folderPath, 'template.md')
  const template = fs.readFileSync(templatePath, 'utf8')
  assert(!template.includes('{{'), `${folder}: fixture template has no unresolved placeholder`)
  return {
    folder,
    folderPath,
    skill: {
      id: `folder:${idMatch[1]}`,
      sourceId: idMatch[1],
      name: nameMatch ? nameMatch[1].trim() : folder,
      template,
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

function startProvider(queue) {
  const requests = []
  let cursor = 0
  const server = http.createServer((request, response) => {
    let bodyText = ''
    request.on('data', chunk => { bodyText += chunk })
    request.on('end', () => {
      let parsedBody = {}
      try { parsedBody = JSON.parse(bodyText) } catch {}
      requests.push({ at: new Date().toISOString(), url: request.url, bodyText })
      const responseBody = queue[cursor]
      cursor += 1
      if (responseBody === undefined) {
        response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({ error: { message: 'mock response queue exhausted' } }))
        return
      }
      if (parsedBody.stream === true) {
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
        choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: responseBody } }],
      }))
    })
  })
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        requests: () => requests.map(item => ({ ...item })),
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
    },
    windowsHide: false,
  })
  writeRunLog('electron-start', { pid: child.pid, scenario: SCENARIO })
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
  for (let attempt = 0; attempt < 24 && !page; attempt += 1) {
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
  await page.evaluate(async ({ baseUrl, projectId, chapterId, volumeId, ownerStorageKey, seededSkills, outline }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'body-failure-topology-provider',
        name: 'Body Failure Topology Provider',
        baseUrl,
        apiKey: 'body-failure-topology-key',
        models: ['topology-model'],
        selectedModel: 'topology-model',
        temperature: 0.1,
        maxTokens: 8192,
        contextWindowTokens: 128000,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
      }],
      generateProvider: 'body-failure-topology-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: '正文失败拓扑验证',
      outlineText: outline,
      outlineLocked: true,
      outlineLockedText: outline,
      bookWordCount: 1000,
      volumesConfirmed: true,
      pipelineConfig: { volumeCount: 1, volumeWords: 3500, chapterWords: 3500 },
      chaptersConfirmed: true,
      settingsGenerated: true,
      settings: [],
      volumes: [{
        id: volumeId,
        name: '风暴起点',
        outline: '周砚确认风暴信标，并沿南方航线推进第一阶段远航。',
        summary: '灯塔信标与南方航线构成第一卷冲突。',
        allocatedWords: 3500,
        suggestedWords: 3500,
        wordsPerChapter: 3500,
        chapterCount: 1,
        confirmed: true,
        locked: true,
        isBound: true,
        boundTo: ['pipeline'],
        bodyGenerated: false,
      }],
      chapters: {
        [volumeId]: [{
          id: chapterId,
          title: '风暴信标',
          plot: '周砚在灯塔底层确认风暴信标；他收到旧航道沉船名单，认出领航员许知微的私章，并把名单折进防水袋，预约清晨渔船沿南方航线南下。',
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
    await window.electronAPI.storageWrite('wa_deAiConfig', {
      hardruleEnabled: false,
      hardRuleMode: 'detect-report',
    })
    await window.electronAPI.storageRemove('wa_pipeline_breakpoint')
    await window.electronAPI.storageRemove(ownerStorageKey)
  }, {
    baseUrl: `http://127.0.0.1:${provider.port}`,
    projectId: PROJECT_ID,
    chapterId: CHAPTER_ID,
    volumeId: VOLUME_ID,
    ownerStorageKey: OWNER_STORAGE_KEY,
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
    const expectedCount = skills.indexOf(skill) + 1
    await page.waitForFunction(({ skillId, skillName, expectedCount: count }) => {
      const chips = [...document.querySelectorAll('#pl-s5-skills-list .pl-skill-chip')]
      return chips.length === count && chips.some(chip =>
        (chip.textContent || '').includes(skillId) || (chip.textContent || '').includes(skillName))
    }, { skillId: skill.skill.id, skillName: skill.skill.name, expectedCount }, {
      timeout: 10_000,
      polling: 250,
    })
    writeRunLog('skill-ui-selected', { id: skill.skill.id, name: skill.skill.name })
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
  const stepTimeoutMs = Number(process.env.SHENYI_BODY_FAILURE_TOPOLOGY_STEP_TIMEOUT_MS || 120_000)
  const stalledTimeoutMs = Number(process.env.SHENYI_BODY_FAILURE_TOPOLOGY_STALLED_TIMEOUT_MS || 20_000)
  const deadTimeoutMs = Number(process.env.SHENYI_BODY_FAILURE_TOPOLOGY_DEAD_TIMEOUT_MS || 45_000)
  let lastSignature = null
  let lastProgressAt = Date.now()
  let lastSnapshot = null
  const deadline = Date.now() + stepTimeoutMs
  while (Date.now() < deadline) {
    const snapshot = await currentRunSnapshot(page)
    const signature = JSON.stringify(snapshot)
    if (signature !== lastSignature) {
      lastSignature = signature
      lastProgressAt = Date.now()
      lastSnapshot = snapshot
      console.log(`[BODY RUN] ${JSON.stringify(snapshot)}`)
    } else if (Date.now() - lastProgressAt >= deadTimeoutMs) {
      throw new Error(`body generation is dead for ${deadTimeoutMs}ms: ${JSON.stringify(lastSnapshot)}`)
    } else if (Date.now() - lastProgressAt >= stalledTimeoutMs) {
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
  throw new Error(`body generation did not finish within ${stepTimeoutMs}ms: ${JSON.stringify(lastSnapshot)}`)
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
  return { directory, run }
}

function parseDetail(value) {
  if (typeof value !== 'string') return value || {}
  try { return JSON.parse(value) } catch { return {} }
}

function eventsByType(run, type) {
  return (run.events || []).filter(event => event.type === type)
}

function physicalCallCount(run) {
  return (run.apiCalls || []).reduce((total, call) => total + (call?.physicalCalls || []).length, 0)
}

async function readOwnerBreakpoint(page) {
  return page.evaluate(async ({ storageKey }) => {
    const value = await window.electronAPI.storageRead(storageKey)
    return value && typeof value === 'object' ? value : null
  }, { storageKey: OWNER_STORAGE_KEY })
}

function assertScenarioRun({ run, breakpoint, requests }) {
  const terminal = eventsByType(run, 'body-artifact-terminal')
  const recovered = eventsByType(run, 'body-artifact-recovered')
  const upstreamRejected = eventsByType(run, 'body-targeted-repair-upstream-rejected')
  const attempted = eventsByType(run, 'body-artifact-attempt')

  if (SCENARIO === 'a') {
    assert.equal(run.status, 'success_with_warnings',
      `scenario a recovers through targeted repair; got ${run.status}`)
    assert.equal(attempted.length, 2, `scenario a makes two artifact attempts; got ${attempted.length}`)
    assert.equal(physicalCallCount(run), 4, `scenario a makes 4 physical requests; got ${physicalCallCount(run)}`)
    assert.equal(upstreamRejected.length, 1,
      `scenario a rejects the failed S1 source before targeted reuse; got ${upstreamRejected.length}`)
    assert.equal(recovered.length, 1, `scenario a records recovery; got ${recovered.length}`)
    const recoveryDetail = parseDetail(recovered[0].detail)
    assert.equal(recoveryDetail.recoveryKind, 'recovered_from_failed',
      `scenario a labels failed recovery; got ${recoveryDetail.recoveryKind}`)
    assert.equal(terminal.length, 0, 'scenario a has no terminal failure event')
    assert.equal(breakpoint, null,
      `scenario a must clear the completed chain checkpoint after final acceptance; got ${JSON.stringify(breakpoint)}`)
    const validated = eventsByType(run, 'body-artifact-validated')
    const written = eventsByType(run, 'write')
    assert.equal(validated.length, 1, `scenario a records final artifact acceptance; got ${validated.length}`)
    assert.equal(written.length, 1, `scenario a persists the recovered body; got ${written.length}`)
  }

  if (SCENARIO === 'b') {
    assert.equal(run.status, 'failed', `scenario b fails after repair exhaustion; got ${run.status}`)
    assert.equal(attempted.length, 2, `scenario b makes two artifact attempts; got ${attempted.length}`)
    assert.equal(physicalCallCount(run), 6, `scenario b makes 6 physical requests; got ${physicalCallCount(run)}`)
    assert.equal(terminal.length, 1, `scenario b emits a terminal failure; got ${terminal.length}`)
    const terminalDetail = parseDetail(terminal[0].detail)
    assert.equal(terminalDetail.terminalReason, 'repair_exhausted',
      `scenario b terminates as repair_exhausted; got ${terminalDetail.terminalReason}`)
    assert.equal(breakpoint, null,
      `scenario b must not write a false-success or failure checkpoint; got ${JSON.stringify(breakpoint)}`)
  }

  if (SCENARIO === 'c') {
    assert.equal(run.status, 'success_with_warnings',
      `scenario c recovers after three short envelopes; got ${run.status}`)
    assert.equal(attempted.length, 2, `scenario c makes two artifact attempts; got ${attempted.length}`)
    assert.equal(physicalCallCount(run), 6, `scenario c makes 6 physical requests; got ${physicalCallCount(run)}`)
    assert.equal(upstreamRejected.length, 0,
      `scenario c does not reject a valid upstream artifact; got ${upstreamRejected.length}`)
    assert.equal(recovered.length, 1, `scenario c records recovery; got ${recovered.length}`)
    const recoveryDetail = parseDetail(recovered[0].detail)
    assert.equal(recoveryDetail.recoveryKind, 'recovered_from_failed',
      `scenario c labels failed recovery; got ${recoveryDetail.recoveryKind}`)
    assert.equal(breakpoint, null,
      `scenario c must clear the completed chain checkpoint after final acceptance; got ${JSON.stringify(breakpoint)}`)
    const validated = eventsByType(run, 'body-artifact-validated')
    const written = eventsByType(run, 'write')
    assert.equal(validated.length, 1, `scenario c records final artifact acceptance; got ${validated.length}`)
    assert.equal(written.length, 1, `scenario c persists the recovered body; got ${written.length}`)
  }

  assert.equal((run.apiCalls || []).length >= 1, true, 'trace records at least one logical call')
  assert(requests.length === physicalCallCount(run),
    `provider request count matches traced physical calls; requests=${requests.length}, trace=${physicalCallCount(run)}`)
}

async function runScenario(provider) {
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
    const skills = ['fixture-s1', 'fixture-s2', 'fixture-s3'].map((folder, index) =>
      loadFixtureSkill(folder, `body failure topology fixture ${index + 1}`))
    await seedApplication(page, provider, skills)
    await selectBodySkillsThroughUi(page, skills)
    const startRequestIndex = provider.requests().length
    heartbeat = startHeartbeat(page, electronProcess.pid)
    await page.click('#btn-primary-gen-body')
    const completion = await waitForBodyCompletion(page)
    assert(completion.terminal === 'success_with_warnings' || completion.terminal === 'failed',
      `body reaches a mapped terminal state, got ${completion.terminal}`)
    const exported = await exportLatestRun(page)
    const { directory, run } = readExportedRun(exported)
    const breakpoint = await readOwnerBreakpoint(page)
    return {
      directory,
      run,
      breakpoint,
      requests: provider.requests().slice(startRequestIndex),
    }
  } finally {
    heartbeat?.stop()
    try { await browser?.close() } catch {}
    closeElectron(electronProcess)
    await sleep(800)
  }
}

async function main() {
  assertFreshRendererBuild()
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  fs.writeFileSync(path.join(EVIDENCE_ROOT, 'run.log'), `scenario=${SCENARIO}\n`, 'utf8')
  await removeDir(PROFILE)
  await removeDir(EXPORT_ROOT)
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })

  const globalTimeoutMs = Number(process.env.SHENYI_BODY_FAILURE_TOPOLOGY_GLOBAL_TIMEOUT_MS || 5 * 60_000)
  const watchdog = setTimeout(() => {
    console.error(`[FAIL] global timeout after ${globalTimeoutMs}ms`)
    process.exit(1)
  }, globalTimeoutMs)
  watchdog.unref()

  const provider = await startProvider(QUEUES[SCENARIO])
  let result = null
  try {
    result = await runScenario(provider)
    assertScenarioRun(result)
    writeRunLog('scenario-passed', {
      scenario: SCENARIO,
      runId: result.run.id,
      runStatus: result.run.status,
      physicalRequests: result.requests.length,
      breakpointStatus: result.breakpoint?.status || null,
    })
    fs.writeFileSync(path.join(EVIDENCE_ROOT, `summary-${SCENARIO}.json`), JSON.stringify({
      schema: 'shenyi.body-failure-topology.electron',
      version: 1,
      scenario: SCENARIO,
      generatedAt: new Date().toISOString(),
      script: SCRIPT_NAME,
      projectId: PROJECT_ID,
      ownerKey: OWNER_KEY,
      runId: result.run.id,
      runStatus: result.run.status,
      physicalRequests: result.requests.length,
      breakpointStatus: result.breakpoint?.status || null,
      evidenceDirectory: result.directory,
    }, null, 2), 'utf8')
    console.log(`===== BODY FAILURE TOPOLOGY SCENARIO ${SCENARIO.toUpperCase()} PASSED =====`)
  } finally {
    if (result) {
      fs.copyFileSync(path.join(result.directory, 'run-trace.json'),
        path.join(EVIDENCE_ROOT, `run-trace-${SCENARIO}.json`))
    }
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'provider-requests.json'),
      JSON.stringify(provider.requests(), null, 2), 'utf8')
    await provider.close()
    clearTimeout(watchdog)
    if (process.env.SHENYI_BODY_FAILURE_TOPOLOGY_KEEP_PROFILE !== '1') {
      await removeDir(PROFILE)
      await removeDir(EXPORT_ROOT)
    }
  }
}

main().catch(error => {
  console.error('[FAIL]', error)
  process.exitCode = 1
})
