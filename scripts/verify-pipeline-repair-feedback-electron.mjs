import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createRequire } from 'node:module'
import { bodyWaitTimeoutMs } from '../src/services/repairFeedbackWait.js'

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
const EXPLICIT_STEP_TIMEOUT_MS = process.env.SHENYI_REPAIR_FEEDBACK_STEP_TIMEOUT_MS
  ? Number(process.env.SHENYI_REPAIR_FEEDBACK_STEP_TIMEOUT_MS)
  : undefined
const BASE_STEP_TIMEOUT_MS = 30 * 60_000
const PER_PHYSICAL_CALL_BUDGET_MS = 6 * 60_000
const MAX_STEP_TIMEOUT_MS = 90 * 60_000
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_REPAIR_FEEDBACK_GLOBAL_TIMEOUT_MS || 6 * 60 * 60_000)
const HEARTBEAT_INTERVAL_MS = Number(process.env.SHENYI_REPAIR_FEEDBACK_HEARTBEAT_INTERVAL_MS || 10_000)
const STALLED_TIMEOUT_MS = Number(process.env.SHENYI_REPAIR_FEEDBACK_STALLED_TIMEOUT_MS || 3 * 60_000)
const DEAD_TIMEOUT_MS = Number(process.env.SHENYI_REPAIR_FEEDBACK_DEAD_TIMEOUT_MS || 10 * 60_000)
const KEEP_PROFILE = process.env.SHENYI_REPAIR_FEEDBACK_KEEP_PROFILE === '1'
const { safeStorage } = require('electron')

const ECHO_S2_CANONICAL_PARAGRAPH =
  '周砚把防水袋压在左胸，指腹确认名单折角没有移动。海风从灯塔侧门刮进石缝，他把三次红色闪烁的间隔记进航海日志，又将南方航线的接头暗号写在页脚。手电光在码头东侧扫过时，他屏住呼吸，沿着湿滑石阶退进阴影。'
const ECHO_S2_CANONICAL_BODY = Array.from({ length: 20 }, (_, index) =>
  `${ECHO_S2_CANONICAL_PARAGRAPH}（第${index + 1}段。）`
).join('\n\n')

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
      '逐字复述 input 中【终步回显样例】标记之后、【终步重试协议】标记之前的全部内容。',
      '保留【终步重试协议】要求，但输出内容只包含上述正文，不要修改、概括或省略任何正文字符。',
      '',
      '',
    ].join('\n'),
    script: [
      'exports.preProcess = function (payload) {',
      "  const value = Object.prototype.toString.call(payload) === '[object String]' ? payload : payload && payload.input",
      "  if (typeof value !== 'string') return {}",
      "  const header = '--- 上一步 SKILL 完整输出 ---'",
      "  const index = value.indexOf(header)",
      "  const rawEchoed = index >= 0 ? value.slice(index + header.length) : value",
      "  const appFeedback = value.slice(Math.max(0, value.lastIndexOf('【终步重试协议】')))",
      "  const feedbackIndex = rawEchoed.indexOf('【终步重试协议】')",
      "  const echoed = feedbackIndex >= 0 ? rawEchoed.slice(0, feedbackIndex) : rawEchoed",
      "  const ledgerMarker = echoed.indexOf('--- 上一步结构化交接')",
      "  const body = ledgerMarker >= 0 ? echoed.slice(0, ledgerMarker) : echoed",
      "  const keepFeedback = value.includes('终步回显校验失败') && appFeedback.includes('终步回显校验失败')",
      "  return { input: '[终步回显样例]\\n' + body.trim() + (keepFeedback ? '\\n\\n' + appFeedback : '') }",
      '}',
    ].join('\n'),
  }

  // The production kaixuan-s2 is intentionally prompt-driven and can omit its
  // handoff on this deliberately small fixture input. That omission is a valid
  // degraded outcome, but it prevents the terminal echo-repair path from being
  // exercised. This dedicated S2 fixture keeps a real live model call while
  // guaranteeing the generator ledger required by the app's terminal gate.
  const echoS2Skill = {
    id: 'REPAIR-ECHO-S2-LIVE',
    name: 'S-Live-EchoRepairGenerator',
    folder: 'repair-echo-s2-live',
    template: [
      '# 职责',
      '',
      '将系统提示内【定稿正文样本】逐字复制为输出正文。',
      '不得改写、概括、增删、替换或重新创作正文内容，也不得输出任何解释。',
      '正文输出完成后另起一行输出【正文交接】区块。',
      '正文结束后必须另起一行输出【正文交接】区块，并包含下列字段：',
      '章节、POV、已完成场景、未完成场景、来源覆盖状态、角色状态变化、章末状态、下一章必须使用、目标字数、生成下限、场景总数、FACT_LOCK、NEW_FACT。',
      '【正文交接】中固定写：目标字数：2000；生成下限：1600。字数指令以这两行为准，正文本身按 2400-2800 字施工。',
      `【定稿正文样本】\n${ECHO_S2_CANONICAL_BODY}`,
      '',
    ].join('\n'),
    script: [
      'exports.postProcess = function (payload) {',
      "  const output = typeof payload === 'string' ? payload : (payload && (payload.output || payload.text)) || ''",
      "  if (!output.trim()) return { output, valid: false, errors: ['输出为空'] }",
      "  const marker = '【正文交接】'",
      "  let normalized = output",
      "  const first = output.indexOf(marker)",
      "  if (first >= 0) normalized = output.slice(0, first + marker.length)",
      "    + output.slice(first + marker.length).split(marker).join('\\n' + marker)",
      "  if (!normalized.includes(marker)) normalized = normalized.trimEnd() + '\\n' + [",
      "    marker,",
      "    '章节：灯塔信标',",
      "    'POV：周砚',",
      "    '已完成场景：3',",
      "    '未完成场景：无',",
      "    '来源覆盖状态：全部覆盖',",
      "    '角色状态变化：周砚确认信标并取得沉船名单',",
      "    '章末状态：等待清晨渔船',",
      "    '下一章必须使用：南方航线接头暗号',",
      "    '目标字数：2000',",
      "    '生成下限：1600',",
      "    '场景总数：3',",
      "    'FACT_LOCK：人物状态=警觉；位置=灯塔；目标=南方航线',",
      "    'NEW_FACT：无',",
      "  ].join('\\n')",
      "  const candidate = normalized.slice(0, normalized.indexOf(marker) >= 0 ? normalized.indexOf(marker) : undefined)",
      "  const canonical = " + JSON.stringify(ECHO_S2_CANONICAL_BODY),
      "  const repaired = candidate.includes(canonical.slice(0, 60))",
      "    ? candidate.replace(candidate.slice(candidate.indexOf(canonical.slice(0, 60))), canonical)",
      "    : canonical",
      "  normalized = repaired + '\\n' + normalized.slice(normalized.indexOf(marker) >= 0 ? normalized.indexOf(marker) : 0)",
      "  return { output: normalized, valid: true }",
      '}',
    ].join('\n'),
  }

  for (const skill of [schemaSkill, echoSkill, echoS2Skill]) {
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
    if (skill.id === 'REPAIR-ECHO-S2-LIVE') {
      fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({
        sampleCount: 0,
        chainHandoff: {
          requiresFullUpstreamContext: true,
          reason: 'Echo verification generator needs full upstream text to produce a stable ledger.',
        },
      }, null, 2), 'utf8')
    }
  }

  return [schemaSkill, echoSkill, echoS2Skill]
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
      pipelineConfig: { volumeCount: 1, volumeWords: 2000, chapterWords: 2000 },
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
        wordsPerChapter: 2000,
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
          plot: '周砚以第一人称视角站在灯塔底层，确认风暴信标的三次红色闪烁；他收到旧航道沉船名单，认出领航员许知微的私章。为了不惊动港务巡查，他把名单折进防水袋，从灯塔侧门绕到南码头，沿南方航线预约一艘清晨渔船，并在离港前把信标规律写进航海日志，留下一条给许知微的接头暗号。',
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
    const apiCalls = run?.apiCalls || []
    const latestPhysical = apiCalls
      .flatMap(call => (call?.physicalCalls || []).map(physical => ({ call, physical })))
      .at(-1)
    return {
      runId: run?.id || null,
      runStatus: run?.status || null,
      events: (run?.events || []).length,
      totalEvents: run?.eventLedger?.totalEvents ?? (run?.events || []).length,
      droppedInfoEvents: run?.eventLedger?.droppedInfoEvents ?? 0,
      apiCalls: (run?.apiCalls || []).length,
      physicalCalls: apiCalls.reduce((total, call) => total + (call?.physicalCalls || []).length, 0),
      runningApiCalls: apiCalls.filter(call => call.status === 'running').length,
      latestPhysicalStatus: latestPhysical?.physical?.status || null,
      latestStreamChars: latestPhysical?.physical?.streamText?.length ?? 0,
      latestReasoningChars: latestPhysical?.physical?.reasoningText?.length ?? 0,
      latestPhysicalEndedAt: latestPhysical?.physical?.endedAt ?? 0,
      lastStreamActivityAt: Math.max(0, ...apiCalls.map(call => call?.lastStreamActivityAt || 0)),
      lastExecutionActivityAt: Math.max(0, ...apiCalls.map(call => call?.lastExecutionActivityAt || 0)),
      lastEventType: (run?.events || []).at(-1)?.type || null,
      progress: pipeline?.activeBodyRun?.progress ?? null,
      status: pipeline?.activeBodyRun?.statusText || null,
      pipelineRunStatus: pipeline?.activeBodyRun?.status || null,
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
  const startedAt = Date.now()
  let observedPhysicalCalls = 0
  let deadline = startedAt + bodyWaitTimeoutMs({
    baseTimeoutMs: BASE_STEP_TIMEOUT_MS,
    observedPhysicalCalls,
    perPhysicalCallBudgetMs: PER_PHYSICAL_CALL_BUDGET_MS,
    maxTimeoutMs: MAX_STEP_TIMEOUT_MS,
    explicitTimeoutMs: EXPLICIT_STEP_TIMEOUT_MS,
  })
  while (Date.now() < deadline) {
    const snapshot = await currentRunSnapshot(page)
    observedPhysicalCalls = Math.max(observedPhysicalCalls, snapshot.physicalCalls)
    deadline = startedAt + bodyWaitTimeoutMs({
      baseTimeoutMs: BASE_STEP_TIMEOUT_MS,
      observedPhysicalCalls,
      perPhysicalCallBudgetMs: PER_PHYSICAL_CALL_BUDGET_MS,
      maxTimeoutMs: MAX_STEP_TIMEOUT_MS,
      explicitTimeoutMs: EXPLICIT_STEP_TIMEOUT_MS,
    })
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
    if (snapshot.runStatus === 'canceled' || snapshot.pipelineRunStatus === 'canceled') {
      throw new Error(`body generation was canceled: ${snapshot.status} / ${snapshot.runStatus}`)
    }
    return snapshot
  }
  throw new Error(`body generation did not finish within ${deadline - startedAt}ms after ${observedPhysicalCalls} physical calls: ${JSON.stringify(lastSnapshot)}`)
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

function assertDeaiVariants(run) {
  const variantEvents = eventsByType(run, 'deai-prompt-variant')
    .map(event => parseDetail(event.detail))
  assert(variantEvents.length > 0,
    'run records at least one deai-prompt-variant event')
  const expected = new Set(variantEvents.map(event => event.variant))
  const actual = new Set((run.apiCalls || [])
    .map(call => call.deaiPromptVariant)
    .filter(Boolean))
  for (const variant of expected) {
    assert(actual.has(variant),
      `deai prompt variant is persisted on api calls: expected ${variant}, got ${[...actual].join(', ') || 'none'}`)
  }
  for (const call of run.apiCalls || []) {
    if (!call.deaiPromptVariant) continue
    assert(variantEvents.some(event => event.variant === call.deaiPromptVariant),
      `api call ${call.id} variant ${call.deaiPromptVariant} has a matching deai-prompt-variant event`)
  }
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
    assert(repairTexts.some(text => text.includes('【终步重试协议】') && text.includes('终步回显校验失败')),
      'baseline echo repair is backed by a physical retry request carrying concrete feedback')
    assert(!(run.apiCalls || []).some(call => physicalCallsOf(call).length > 3),
      'baseline echo repair does not loop into unlimited retries')
  }
  const payloadValues = Object.values(payloads)
  assert(payloadValues.length > 0, 'baseline deep trace contains physical request payloads')
  assertDeaiVariants(run)

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
  assert((run.apiCalls || []).length >= 1, 'schema run records its API call')
  const schemaFailures = (run.folderDiagnostics || [])
    .filter(item => (item?.diagnostics || []).some?.(diagnostic => diagnostic?.code === 'schema-validation-failed'))
  assert(schemaFailures.length > 0,
    'live schema SKILL actually produced a schema failure before repair')
  const schemaFailureIndex = (run.folderDiagnostics || [])
    .findIndex(item => item === schemaFailures[0])
  const schemaFailureSkillId = schemaFailureIndex >= 0
    ? (run.apiCalls || [])[schemaFailureIndex]?.skillId
    : undefined
  const call = schemaFailureSkillId
    ? (run.apiCalls || []).find(item => item.skillId === schemaFailureSkillId)
    : (run.apiCalls || []).find(item => physicalCallsOf(item).length >= 2)
  assert(call,
    'schema retry verification finds the API call that owns the schema failure')
  const calls = physicalCallsOf(call)
  assert(calls.length >= 2,
    `schema failure causes a retry request, got ${calls.length} physical calls`)
  const firstSystem = systemText(requestMessagesOf(tracePath, calls[0].requestMessages))
  const retrySystem = systemText(requestMessagesOf(tracePath, calls[1].requestMessages))
  assert(!firstSystem.includes('【终步重试协议】'),
    'first schema request does not contain retry feedback')
  assert(retrySystem.includes('【终步重试协议】'),
    'schema retry request carries the structured retry feedback contract')
  assert(retrySystem.includes('$.repair_marker 缺少必填字段'),
    'schema retry feedback names the missing required field with a JSON pointer')
  assert(retrySystem.includes('四、上游权威锚点'),
    'schema retry feedback carries bounded upstream anchors for repair')
  assert(retrySystem.includes('不携带候选输出全文'),
    'schema retry feedback explicitly suppresses the full failed candidate')
  assert(!retrySystem.includes('--- 上一步 SKILL 完整输出 ---'),
    'schema retry feedback does not confuse the upstream block with the failed candidate')
  assert(retrySystem.length > firstSystem.length,
    'retry request is materially different, not a bare duplicate')
  const passInputs = eventsByType(run, 'folder-pass-input').map(event => parseDetail(event.detail))
  assert(passInputs.some(item => item.isRetry === true),
    'folder-pass-input marks the retry attempt')
  assertDeaiVariants(run)
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
    .filter(text => text.includes('【终步重试协议】') && text.includes('终步回显校验失败'))
  assert(repairTexts.length >= 1,
    'echo repair retry carries the concrete repair feedback')
  assert(!(run.apiCalls || []).some(call => physicalCallsOf(call).length > 3),
    'echo repair does not loop into unlimited retries')
  assertDeaiVariants(run)
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
  await page.click('#btn-primary-gen-body')
  let completion
  try {
    completion = await waitForBodyCompletion(page)
  } catch (error) {
    // A failed live run still owns request payloads and diagnostic events; export
    // them before the process exits so the failure is diagnosable from evidence.
    console.error(`[FAIL EXPORT] ${name} failed, exporting failure evidence: ${error?.message || error}`)
    try {
      const failedExport = await exportLatestRun(page)
      const { directory, run } = readExportedRun(failedExport)
      await archiveRunEvidence({ directory, run, scenario: `${name}-failed` })
      console.error(`[FAIL EXPORT] failure trace archived: ${path.join(EVIDENCE_ROOT, 'live-export', `${name}-failed`)}`)
    } catch (exportError) {
      console.error(`[FAIL EXPORT] trace export failed: ${exportError?.message || exportError}`)
    }
    await page.screenshot({
      path: path.join(EVIDENCE_ROOT, `${name}-failure-state.png`),
      fullPage: false,
    }).catch(() => {})
    throw error
  }
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
  const onlyScenario = process.env.SCENARIO ? process.env.SCENARIO.trim().toLowerCase() : ''
  assert(['', 'baseline', 'schema-retry', 'echo-repair'].includes(onlyScenario),
    `SCENARIO must be empty, baseline, schema-retry, or echo-repair; got ${JSON.stringify(onlyScenario)}`)
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
    const echoS2Skill = loadSkillFolder({
      root: LIVE_SKILL_ROOT,
      folder: 'repair-echo-s2-live',
      description: 'live echo-repair generator verification skill',
    })

    await seedApplication(page, apiKey, [
      ...bodySkills,
      schemaSkill.skill,
      echoSkill.skill,
      echoS2Skill.skill,
    ].map(item => item.skill || item))

    heartbeat = startHeartbeat(page, electronProcess.pid)

    if (!onlyScenario || onlyScenario === 'baseline') {
      evidence.push(await runScenario(page, 'baseline', bodySkills))
    }
    if (!onlyScenario || onlyScenario === 'schema-retry') {
      evidence.push(await runScenario(page, 'schema-retry', [
        bodySkills[0],
        bodySkills[1],
        schemaSkill,
      ]))
    }
    if (!onlyScenario || onlyScenario === 'echo-repair') {
      evidence.push(await runScenario(page, 'echo-repair', [
        bodySkills[0],
        echoS2Skill,
        echoSkill,
      ]))
    }

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
