import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const ROOT = path.resolve(process.cwd())
const SCRIPT_NAME = 'verify-pipeline-repair-feedback-electron.mjs'
const ELECTRON_EXE = process.env.SHENYI_REPAIR_FEEDBACK_ELECTRON
  ? path.resolve(process.env.SHENYI_REPAIR_FEEDBACK_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_REPAIR_FEEDBACK_CDP_PORT || 9361)
const PROFILE = path.join(ROOT, '_data', 'pipeline-repair-feedback-live-profile')
const DATA_DIR = path.join(PROFILE, 'documents-data')
const EXPORT_ROOT = path.join(ROOT, '_data', 'pipeline-repair-feedback-live-exports')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-pipeline-repair-feedback-live')
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const HEARTBEAT_PATH = path.join(EVIDENCE_ROOT, 'heartbeat.jsonl')
const LIVE_SKILL_ROOT = path.join(ROOT, '_data', 'repair-feedback-live-skills')
const PROJECT_ID = 'pipeline-repair-feedback-live'
const MODEL = process.env.SHENYI_LIVE_MODEL || 'deepseek-v4-pro'
const BASE_URL = process.env.SHENYI_LIVE_BASE_URL || 'https://openapi.cloud-ai.cn/v1'
const CREDENTIAL_PROFILE = path.join(ROOT, '_data', 'outline-lock-override-live-replay-profile')
const STEP_TIMEOUT_MS = Number(process.env.SHENYI_REPAIR_FEEDBACK_STEP_TIMEOUT_MS || 30 * 60_000)
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_REPAIR_FEEDBACK_GLOBAL_TIMEOUT_MS || 3 * 60 * 60_000)
const HEARTBEAT_INTERVAL_MS = Number(process.env.SHENYI_REPAIR_FEEDBACK_HEARTBEAT_INTERVAL_MS || 10_000)
const STALLED_TIMEOUT_MS = Number(process.env.SHENYI_REPAIR_FEEDBACK_STALLED_TIMEOUT_MS || 3 * 60_000)
const DEAD_TIMEOUT_MS = Number(process.env.SHENYI_REPAIR_FEEDBACK_DEAD_TIMEOUT_MS || 10 * 60_000)
const KEEP_PROFILE = process.env.SHENYI_REPAIR_FEEDBACK_KEEP_PROFILE === '1'
const { safeStorage } = require('electron')

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

function writeLiveSkills() {
  fs.rmSync(LIVE_SKILL_ROOT, { recursive: true, force: true })
  fs.mkdirSync(LIVE_SKILL_ROOT, { recursive: true })

  const schemaSkill = {
    id: 'REPAIR-SCHEMA-LIVE',
    name: 'S-Live-SchemaRetry',
    folder: 'repair-schema-live',
    template: [
      '# 职责',
      '',
      '输出一个 JSON 对象，且只包含 body 字段。',
      '不要输出解释、思考过程或 Markdown 代码块。',
      '',
    ].join('\n'),
    schema: {
      type: 'object',
      required: ['body', 'repair_marker'],
      properties: {
        body: { type: 'string', minLength: 20 },
        repair_marker: { type: 'string', enum: ['fixed'] },
      },
      additionalProperties: false,
    },
    script: `exports.preProcess = function (payload) { return { input: payload.input } }`,
  }

  const echoSkill = {
    id: 'REPAIR-ECHO-LIVE',
    name: 'S-Live-EchoRepair',
    folder: 'repair-echo-live',
    template: [
      '# 职责',
      '',
      '逐字复述 input 中【终步回显样例】之后的内容。',
      '不要修改、概括或省略任何字符，也不要输出其他说明。',
      '',
      '',
    ].join('\n'),
    script: [
      'exports.preProcess = function (payload) {',
      "  const value = Object.prototype.toString.call(payload) === '[object String]' ? payload : payload && payload.input",
      "  if (typeof value !== 'string') return {}",
      "  const header = '--- 上一步 SKILL 完整输出 ---'",
      "  const index = value.indexOf(header)",
      "  const echoed = index >= 0 ? value.slice(index + header.length) : value",
      "  return { input: '[终步回显样例]\\n' + echoed.trim() }",
      '}',
    ].join('\n'),
  }

  for (const skill of [schemaSkill, echoSkill]) {
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
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ sampleCount: 0 }, null, 2), 'utf8')
    if (skill.schema) fs.writeFileSync(path.join(dir, 'schema.json'), JSON.stringify(skill.schema, null, 2), 'utf8')
    if (skill.script) fs.writeFileSync(path.join(dir, 'script.js'), skill.script, 'utf8')
  }

  return [schemaSkill, echoSkill]
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
  const metaPath = path.join(folderPath, 'meta.json')
  const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {}
  const sourceId = idMatch[1]
  const samplesPath = path.join(folderPath, 'samples.txt')
  const samples = fs.existsSync(samplesPath) ? fs.readFileSync(samplesPath, 'utf8') : ''
  return {
    sourceId,
    skill: {
      id: `folder:${sourceId}`,
      sourceId,
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
  '# 修复反馈与链路可观测实测大纲',
  '主角在灯塔与旧航道之间确认风暴信标，并沿南方航线推进第一阶段远航。',
  '第一卷 风暴起点：旧信、灯塔与南方航线共同推动第一卷冲突。',
].join('\n')

async function seedApplication(page, apiKey, skills) {
  await page.evaluate(async ({ apiKey, baseUrl, model, projectId, seededSkills, outline }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'pipeline-repair-feedback-live-provider',
        name: 'Pipeline Repair Feedback Live Provider',
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
      generateProvider: 'pipeline-repair-feedback-live-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: '修复反馈真实UI实测',
      outlineText: outline,
      outlineLocked: true,
      outlineLockedText: outline,
      bookWordCount: 1000,
      volumesConfirmed: true,
      pipelineConfig: { volumeCount: 1, volumeWords: 1000, chapterWords: 200 },
      chaptersConfirmed: true,
      settingsGenerated: true,
      settings: [],
      volumes: [{
        id: 'vol-repair-feedback-live',
        name: '风暴起点',
        outline: '主角确认灯塔信标，并沿南方航线推进第一阶段远航。',
        summary: '灯塔信标与南方航线构成第一卷冲突。',
        allocatedWords: 1000,
        suggestedWords: 1000,
        wordsPerChapter: 200,
        chapterCount: 1,
        confirmed: true,
        locked: true,
        isBound: true,
        boundTo: ['pipeline'],
        bodyGenerated: false,
      }],
      chapters: {
        'vol-repair-feedback-live': [{
          id: 'ch-repair-feedback-live',
          title: '灯塔信标',
          plot: '主角确认灯塔信标，收到旧航道的线索，并决定沿南方航线继续调查。',
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
    `all ${skills.length} body SKILLs are selected through #pl-s5-skill; got ${JSON.stringify(selected)}`)
  await page.selectOption('#pl-context-summary select', { index: 0 })
  await page.locator('#pl-context-summary select').nth(1).selectOption({ index: 0 })
}

function currentRunSnapshot(page) {
  return page.evaluate(() => {
    const store = window.__pinia?._s?.get('runTrace')
    const pipeline = window.__pinia?._s?.get('pipeline')
    const project = window.__pinia?._s?.get('project')
    const run = [...(store?.runs || [])]
      .filter(item => item.source === 'pipeline' && item.step === 4)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    return {
      runId: run?.id || null,
      runStatus: run?.status || null,
      events: (run?.events || []).length,
      apiCalls: (run?.apiCalls || []).length,
      runningApiCalls: (run?.apiCalls || []).filter(call => call.status === 'running').length,
      lastEventType: (run?.events || []).at(-1)?.type || null,
      progress: pipeline?.generationProgress ?? null,
      status: pipeline?.generationStatus || null,
      isGenerating: Boolean(pipeline?.isGenerating),
      bodyLength: ((project?.chapters?.['vol-repair-feedback-live'] || [])[0]?.body || '').length,
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
      throw new Error(`body generation has no progress for ${DEAD_TIMEOUT_MS}ms: ${JSON.stringify(lastSnapshot)}`)
    } else if (Date.now() - lastProgressAt >= STALLED_TIMEOUT_MS) {
      console.warn(`[STALL WARNING] body run unchanged for ${Date.now() - lastProgressAt}ms`)
    }
    if (snapshot.isGenerating || snapshot.status === 'generating' || snapshot.runningApiCalls > 0) {
      await sleep(1000)
      continue
    }
    if (snapshot.runStatus === 'failed' || snapshot.status?.startsWith('failed:')) {
      throw new Error(`body generation failed: ${snapshot.status} / ${snapshot.runStatus}`)
    }
    return snapshot
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
  assert(exported.result?.success, `deep run trace export succeeds: ${exported.result?.error || 'unknown error'}`)
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

function parseDetail(detail) {
  if (typeof detail !== 'string') return detail || {}
  try {
    return JSON.parse(detail)
  } catch {
    return {}
  }
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

function findFolderDiagnosticForSkill(folderDiagnostics, sourceId) {
  return folderDiagnostics.find(item =>
    item?.id === sourceId
    || item?.folderPath?.includes(sourceId.toLowerCase())
    || (item?.diagnostics || []).some?.(diagnostic =>
      String(diagnostic?.message || '').includes(sourceId)))
}

function assertBaselineRun({ tracePath, run, payloads }) {
  assert.equal(run.step, 4, 'baseline run is the body layer')
  assert(['success', 'degraded'].includes(run.status),
    `baseline run completes without failure, got ${run.status}`)
  const passInputs = eventsByType(run, 'folder-pass-input').map(event => parseDetail(event.detail))
  assert(passInputs.length >= 3,
    `baseline chain records at least three folder-pass-input events, got ${passInputs.length}`)
  for (const item of passInputs) {
    assert(['original', 'previous'].includes(item.inputMode),
      `folder pass inputMode is physical: ${JSON.stringify(item)}`)
    assert(Number.isFinite(Number(item.userPromptLength)) && Number(item.userPromptLength) > 0,
      `folder pass records physical user prompt length: ${JSON.stringify(item)}`)
    assert(Number.isFinite(Number(item.systemPromptLength)),
      `folder pass records physical system prompt length: ${JSON.stringify(item)}`)
  }

  const slimEvents = eventsByType(run, 'chain-context-slim')
    .map(event => ({ label: event.label, detail: parseDetail(event.detail) }))
  const slimEventsByStep = new Set()
  for (const item of slimEvents) {
    assert.equal(item.detail.measurement, 'upstream_prompt_only',
      `chain-context-slim keeps its upstream-only measurement label: ${JSON.stringify(item)}`)
    assert(item.label, 'chain-context-slim event carries its chain-step label')
    slimEventsByStep.add(item.label)
  }
  assert(slimEventsByStep.size >= 3,
    `every baseline chain step records a context decision, got steps=${slimEventsByStep.size}, events=${slimEvents.length}, labels=${[...slimEventsByStep].join(' | ')}`)

  const echoRepairEvents = eventsByType(run, 'chain-output-echo-repair')
  assert(echoRepairEvents.length <= 1,
    `baseline chain performs at most one genuine echo repair, got ${echoRepairEvents.length}`)
  if (echoRepairEvents.length === 1) {
    const repairTexts = (run.apiCalls || [])
      .flatMap(call => physicalCallsOf(call))
      .map(physical => userText(requestMessagesOf(tracePath, physical.requestMessages)))
    assert(repairTexts.some(text => text.includes('[修复反馈] 上一步输出与本步输出高度重复')),
      'baseline echo repair is backed by a physical retry request carrying concrete feedback')
    assert(!(run.apiCalls || []).some(call => physicalCallsOf(call).length > 3),
      'baseline echo repair does not loop into unlimited retries')
  }
  const payloadValues = Object.values(payloads)
  assert(payloadValues.length > 0, 'baseline deep trace contains physical request payloads')

  for (const call of run.apiCalls || []) {
    const calls = physicalCallsOf(call)
    assert(calls.length > 0, `api call ${call.id} captures at least one physical request`)
    for (const physical of calls) {
      const messages = requestMessagesOf(tracePath, physical.requestMessages)
      assert(messages.length > 0, `physical request ${physical.physicalCallId} exports its messages`)
    }
  }
}

function assertSchemaRetryRun({ tracePath, run }) {
  assert.equal(run.step, 4, 'schema run is the body layer')
  assert(['success', 'degraded'].includes(run.status),
    `schema retry run completes with usable output, got ${run.status}`)
  const schemaFailures = (run.folderDiagnostics || [])
    .filter(item => (item?.diagnostics || []).some?.(diagnostic => diagnostic?.code === 'schema-validation-failed'))
  assert(schemaFailures.length > 0,
    'live schema SKILL actually produced a schema failure before repair')
  assert((run.apiCalls || []).length >= 1, 'schema run records its API call')
  const call = (run.apiCalls || []).find(item =>
    physicalCallsOf(item).length >= 2) || (run.apiCalls || [])[0]
  const calls = physicalCallsOf(call)
  assert(calls.length >= 2,
    `schema failure causes a retry request, got ${calls.length} physical calls`)
  const firstSystem = systemText(requestMessagesOf(tracePath, calls[0].requestMessages))
  const retrySystem = systemText(requestMessagesOf(tracePath, calls[1].requestMessages))
  assert(!firstSystem.includes('上一次输出未通过校验'),
    'first schema request does not contain stale feedback')
  assert(retrySystem.includes('上一次输出未通过校验'),
    'schema retry request contains concrete failure feedback')
  assert(retrySystem.includes('repair_marker'),
    'schema retry feedback names the missing required field')
  assert(retrySystem.length > firstSystem.length,
    'retry request is materially different, not a bare duplicate')
  const passInputs = eventsByType(run, 'folder-pass-input').map(event => parseDetail(event.detail))
  assert(passInputs.some(item => item.isRetry === true),
    'folder-pass-input marks the retry attempt')
}

function assertEchoRepairRun({ tracePath, run }) {
  assert.equal(run.step, 4, 'echo repair run is the body layer')
  assert(['success', 'degraded'].includes(run.status),
    `echo repair run completes with usable output, got ${run.status}`)
  const repairEvents = eventsByType(run, 'chain-output-echo-repair')
  assert.equal(repairEvents.length, 1,
    `terminal echo triggers exactly one repair retry, got ${repairEvents.length}`)
  const repairCalls = (run.apiCalls || [])
    .map(call => ({ call, physical: physicalCallsOf(call) }))
    .filter(item => item.physical.length >= 1)
  assert(repairCalls.length > 0, 'echo repair run captures physical requests')
  const repairTexts = repairCalls
    .flatMap(item => item.physical.map(physical =>
      userText(requestMessagesOf(tracePath, physical.requestMessages))))
    .filter(text => text.includes('[修复反馈] 上一步输出与本步输出高度重复'))
  assert(repairTexts.length >= 1,
    'echo repair retry carries the concrete repair feedback')
  assert(!(run.apiCalls || []).some(call => physicalCallsOf(call).length > 3),
    'echo repair does not loop into unlimited retries')
}

async function archiveRunEvidence({ directory, run, scenario }) {
  const target = path.join(EVIDENCE_ROOT, 'live-export', scenario)
  fs.mkdirSync(target, { recursive: true })
  fs.copyFileSync(path.join(directory, 'run-trace.json'), path.join(target, 'run-trace.json'))
  const payloadRoot = path.join(directory, 'payloads')
  if (fs.existsSync(payloadRoot)) {
    fs.cpSync(payloadRoot, target, { recursive: true })
  }
  return {
    scenario,
    status: run.status,
    runId: run.id,
    exportPath: target,
    apiCallCount: (run.apiCalls || []).length,
    eventTypes: (run.events || []).map(event => event.type),
  }
}

async function runScenario(page, name, skills) {
  console.log(`\n[SCENARIO] ${name}`)
  await selectBodySkillsThroughUi(page, skills.map(item => item.skill))
  await page.click('#btn-pl-gen-body')
  const completion = await waitForBodyCompletion(page)
  assert(!completion.isGenerating, `${name} generation is no longer running`)
  const exported = await exportLatestRun(page)
  const { directory, run, payloads } = readExportedRun(exported)
  const tracePath = path.join(directory, 'run-trace.json')
  const evidence = await archiveRunEvidence({ directory, run, scenario: name })
  await page.screenshot({
    path: path.join(EVIDENCE_ROOT, `${name}-final-state.png`),
    fullPage: false,
  })
  if (name === 'baseline') assertBaselineRun({ tracePath, run, payloads })
  if (name === 'schema-retry') assertSchemaRetryRun({ tracePath, run })
  if (name === 'echo-repair') assertEchoRepairRun({ tracePath, run })
  return evidence
}

function replayScenario(scenario) {
  const tracePath = path.join(EVIDENCE_ROOT, 'live-export', scenario, 'run-trace.json')
  assert(fs.existsSync(tracePath), `archived trace exists: ${tracePath}`)
  const output = fs.readFileSync(
    path.join(EVIDENCE_ROOT, 'live-export', scenario, 'replay-result.txt'),
    'utf8',
  )
  return { tracePath, output }
}

async function archivePreviousEvidence() {
  if (!fs.existsSync(EVIDENCE_ROOT)) return
  const archiveRoot = path.join(path.dirname(EVIDENCE_ROOT), 'verification-pipeline-repair-feedback-live-archive')
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
  writeLiveSkills()

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
  const evidence = []
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

    const bodySkills = ['kaixuan-s1', 'kaixuan-s2', 'kaixuan-s3'].map(folder => loadSkillFolder({
      root: 'D:/codex/玄武规划SKILL/凯旋-正文层',
      folder,
      description: 'body-layer live baseline skill',
    }))
    const schemaSkill = loadSkillFolder({
      root: LIVE_SKILL_ROOT,
      folder: 'repair-schema-live',
      description: 'live schema-retry verification skill',
    })
    const echoSkill = loadSkillFolder({
      root: LIVE_SKILL_ROOT,
      folder: 'repair-echo-live',
      description: 'live echo-repair verification skill',
    })

    await seedApplication(page, apiKey, [
      ...bodySkills,
      schemaSkill.skill,
      echoSkill.skill,
    ].map(item => item.skill || item))

    heartbeat = startHeartbeat(page, electronProcess.pid)

    evidence.push(await runScenario(page, 'baseline', bodySkills))
    evidence.push(await runScenario(page, 'schema-retry', [
      bodySkills[0],
      bodySkills[1],
      schemaSkill,
    ]))
    evidence.push(await runScenario(page, 'echo-repair', [
      bodySkills[0],
      bodySkills[1],
      echoSkill,
    ]))

    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'summary.json'), JSON.stringify({
      schema: 'shenyi.pipeline-repair-feedback.electron-live',
      version: 1,
      generatedAt: new Date().toISOString(),
      script: SCRIPT_NAME,
      model: MODEL,
      baseUrl: BASE_URL,
      projectId: PROJECT_ID,
      scenarios: evidence,
      hardRules: {
        visibleElectron: true,
        realDropdownSelection: '#pl-s5-skill / #pl-s5-add-skill / #pl-s5-skills-list',
        noInjectionImpersonation: true,
        liveCredentialSource: CREDENTIAL_PROFILE,
      },
    }, null, 2), 'utf8')
    await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'final-state.png'), fullPage: false })
    console.log('===== PIPELINE REPAIR FEEDBACK ELECTRON LIVE PASSED =====')
  } finally {
    heartbeat?.stop()
    clearTimeout(watchdog)
    try { if (browser) await browser.close() } catch {}
    closeElectron(electronProcess)
    await sleep(800)
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
