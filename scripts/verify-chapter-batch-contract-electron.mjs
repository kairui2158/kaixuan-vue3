import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const ROOT = path.resolve(process.cwd())
const SCRIPT_NAME = 'verify-chapter-batch-contract-electron.mjs'
const ELECTRON_EXE = process.env.SHENYI_CHAPTER_CONTRACT_ELECTRON
  ? path.resolve(process.env.SHENYI_CHAPTER_CONTRACT_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_CHAPTER_CONTRACT_CDP_PORT || 9345)
const PROFILE = path.join(ROOT, '_data', 'chapter-batch-contract-live-profile')
const DATA_DIR = path.join(PROFILE, 'documents-data')
const EXPORT_ROOT = path.join(ROOT, '_data', 'chapter-batch-contract-live-exports')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-chapter-batch-contract-live')
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const HEARTBEAT_PATH = path.join(EVIDENCE_ROOT, 'heartbeat.jsonl')
const PROJECT_ID = 'chapter-batch-contract-live'
const MODEL = process.env.SHENYI_LIVE_MODEL || 'deepseek-v4-pro'
const BASE_URL = process.env.SHENYI_LIVE_BASE_URL || 'https://openapi.cloud-ai.cn/v1'
const TOTAL_CHAPTERS = 12
const BATCH_SIZE = 5
const SKILL_ROOT = path.resolve('D:/codex/玄武规划SKILL/L4-章节层')
const SKILL_FOLDERS = ['l4-s1', 'l4-s2', 'l4-s3', 'l4-s4']
const CREDENTIAL_PROFILE = path.join(ROOT, '_data', 'outline-lock-override-live-replay-profile')
const STEP_TIMEOUT_MS = Number(process.env.SHENYI_CHAPTER_CONTRACT_STEP_TIMEOUT_MS || 45 * 60_000)
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_CHAPTER_CONTRACT_GLOBAL_TIMEOUT_MS || 3 * 60 * 60_000)
const HEARTBEAT_INTERVAL_MS = Number(process.env.SHENYI_CHAPTER_CONTRACT_HEARTBEAT_INTERVAL_MS || 10_000)
const STALLED_TIMEOUT_MS = Number(process.env.SHENYI_CHAPTER_CONTRACT_STALLED_TIMEOUT_MS || 5 * 60_000)
const DEAD_TIMEOUT_MS = Number(process.env.SHENYI_CHAPTER_CONTRACT_DEAD_TIMEOUT_MS || 15 * 60_000)
const KEEP_PROFILE = process.env.SHENYI_CHAPTER_CONTRACT_KEEP_PROFILE === '1'
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
  collectSources(path.join(ROOT, 'electron'))
  const newestSourceMs = Math.max(...sourceFiles.map(file => fs.statSync(file).mtimeMs))
  const staleBundles = bundleNames.filter(name =>
    fs.statSync(path.join(ROOT, 'dist-renderer', name)).mtimeMs < newestSourceMs)
  assert.equal(staleBundles.length, 0,
    `renderer build is stale; rebuild with npm run build:vue. Stale bundles: ${staleBundles.join(', ')}`)
}

function loadSkillFolder(folderName) {
  const folder = path.join(SKILL_ROOT, folderName)
  const definitionPath = path.join(folder, 'SKILL.md')
  const definition = fs.readFileSync(definitionPath, 'utf8')
  const idMatch = definition.match(/^id:\s*(\S+)/m)
  assert(idMatch, `${folderName}: SKILL.md exposes an id`)
  const nameMatch = definition.match(/^name:\s*(.+)$/m)
  const templatePath = path.join(folder, 'template.md')
  assert(fs.existsSync(templatePath), `${folderName}: template.md exists`)
  const meta = JSON.parse(fs.readFileSync(path.join(folder, 'meta.json'), 'utf8'))
  const sourceId = idMatch[1]
  return {
    sourceId,
    skill: {
      id: `folder:${sourceId}`,
      sourceId,
      name: nameMatch ? nameMatch[1].trim() : folderName,
      template: fs.readFileSync(templatePath, 'utf8'),
      description: `${folderName} live chapter-layer skill`,
      format: 'folder',
      source: 'external',
      category: 'folder',
      folderPath: folder,
      executionMode: meta.executionMode === 'default' ? 'chain' : (meta.executionMode || 'chain'),
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

function outlineText() {
  const lines = ['# 章节批次契约实测大纲']
  for (let index = 1; index <= 8; index++) {
    lines.push(`第${index}节：男主在灯塔与旧航道之间确认风暴信标，南方航线逐步显形。`)
  }
  lines.push('第一卷 风暴起点：旧信、灯塔与南方航线共同推动第一卷冲突。')
  return lines.join('\n')
}

async function seedApplication(page, apiKey) {
  const skills = SKILL_FOLDERS.map(loadSkillFolder)
  await page.evaluate(async ({ apiKey, baseUrl, model, projectId, skills: seededSkills, outline, totalChapters }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'chapter-contract-live-provider',
        name: 'Chapter Contract Live Provider',
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
      generateProvider: 'chapter-contract-live-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: '章节批次契约真实UI实测',
      outlineText: outline,
      outlineLocked: true,
      outlineLockedText: outline,
      bookWordCount: 12000,
      volumesConfirmed: true,
      pipelineConfig: { volumeCount: 1, volumeWords: 12000, chapterWords: 1000 },
      chaptersConfirmed: false,
      settingsGenerated: true,
      settings: [],
      volumes: [{
        id: 'vol-live-contract',
        name: '风暴起点',
        outline: '男主发现旧信，确认灯塔信标，并沿南方航线推进第一卷冲突。',
        summary: '旧信与灯塔共同锁定风暴起点。',
        allocatedWords: 12000,
        wordsPerChapter: 1000,
        chapterCount: totalChapters,
        confirmed: true,
        isBound: true,
        boundTo: ['pipeline'],
        bodyGenerated: false,
      }],
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
    await window.electronAPI.storageRemove('wa_pipeline_breakpoint')
  }, {
    apiKey,
    baseUrl: BASE_URL,
    model: MODEL,
    projectId: PROJECT_ID,
    skills: skills.map(item => item.skill),
    outline: outlineText(),
    totalChapters: TOTAL_CHAPTERS,
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20_000 })
  await sleep(1500)
  await closeProjectModal(page)
  return skills
}

async function selectChapterSkillsThroughUi(page, skills) {
  await page.click('#btn-pipeline')
  await page.waitForSelector('#pipeline-panel', { timeout: 20_000 })
  await page.locator('#pl-steps .pl-step').nth(3).click()
  await page.waitForSelector('#pl-step-4-content', { state: 'visible' })
  await page.selectOption('#pl-s4-mode', 'chain')
  for (const item of skills) {
    await page.selectOption('#pl-s4-skill', item.skill.id)
    await page.click('#pl-s4-add-skill')
    await page.waitForFunction(skillId => {
      const chips = [...document.querySelectorAll('#pl-s4-skills-list .pl-skill-chip')]
      return chips.some(chip => (chip.textContent || '').includes(skillId)
        || chips.length >= 1)
    }, item.skill.name, { timeout: 10_000, polling: 250 })
    console.log(`[SKILL UI SELECTED] ${item.skill.id} (${item.skill.name})`)
  }
  const selected = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('#pl-s4-skills-list .pl-skill-chip')]
    return chips.map(chip => (chip.textContent || '').trim())
  })
  assert.equal(selected.length, skills.length,
    'all four L4 folder SKILLs are selected through the real chapter-layer dropdown')
  await page.selectOption('#pl-ch-volume-select', { label: '风暴起点' })
  await page.locator('#pl-chapter-wordcount').fill('1000')
  await page.locator('#pl-chapter-wordcount').dispatchEvent('change')
}

function currentRunSnapshot(page) {
  return page.evaluate(() => {
    const store = window.__pinia?._s?.get('runTrace')
    const pipeline = window.__pinia?._s?.get('pipeline')
    const project = window.__pinia?._s?.get('project')
    const run = [...(store?.runs || [])]
      .filter(item => item.source === 'pipeline' && item.step === 3)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    return {
      runId: run?.id || null,
      runStatus: run?.status || null,
      events: (run?.events || []).length,
      lastEventType: (run?.events || []).at(-1)?.type || null,
      apiCalls: (run?.apiCalls || []).length,
      runningApiCalls: (run?.apiCalls || []).filter(call => call.status === 'running').length,
      validatedBatches: (run?.events || []).filter(event => event.type === 'chapter-batch-validated').length,
      attemptEvents: (run?.events || []).filter(event => event.type === 'chapter-batch-attempt').length,
      progress: pipeline?.generationProgress ?? null,
      status: pipeline?.generationStatus || null,
      isGenerating: Boolean(pipeline?.isGenerating),
      chapterCount: (project?.chapters?.['vol-live-contract'] || []).length,
      lastLog: (window.__pinia?._s?.get('executionLog')?.logs || []).at(-1)?.message || null,
      callActivity: [...(store?.runs || [])]
        .filter(item => item.source === 'pipeline' && item.step === 3)
        .sort((a, b) => b.startedAt - a.startedAt)[0]
        ?.apiCalls.map(call => ({
          status: call.status,
          durationMs: call.durationMs || null,
          responseChars: String(call.responseText || call.streamText || '').length,
          reasoningChars: String(call.reasoningText || '').length,
          lastStreamActivityAgoMs: call.lastStreamActivityAt ? Date.now() - call.lastStreamActivityAt : null,
          lastExecutionActivityAgoMs: call.lastExecutionActivityAt ? Date.now() - call.lastExecutionActivityAt : null
        })) || [],
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

async function waitForChapterCompletion(page) {
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
    } else if (Date.now() - lastProgressAt >= DEAD_TIMEOUT_MS) {
      throw new Error(`chapter generation has no progress for ${DEAD_TIMEOUT_MS}ms: ${JSON.stringify(lastSnapshot)}`)
    } else if (Date.now() - lastProgressAt >= STALLED_TIMEOUT_MS) {
      console.warn(`[STALL WARNING] no progress for ${Date.now() - lastProgressAt}ms: ${JSON.stringify(lastSnapshot)}`)
    }
    if (!snapshot.isGenerating && snapshot.status !== 'generating'
      && snapshot.chapterCount === TOTAL_CHAPTERS) {
      return snapshot
    }
    if (!snapshot.isGenerating && snapshot.status?.startsWith('failed:')) {
      throw new Error(`chapter generation failed: ${snapshot.status}`)
    }
    await sleep(1000)
  }
  throw new Error(`chapter generation did not finish within ${STEP_TIMEOUT_MS}ms: ${JSON.stringify(lastSnapshot)}`)
}

async function exportLatestRun(page) {
  const runId = await page.evaluate(() => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])]
      .filter(item => item.source === 'pipeline' && item.step === 3)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    return run?.id || null
  })
  assert(runId, 'chapter-layer run trace exists')
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
      const payload = JSON.parse(fs.readFileSync(path.join(payloadRoot, name), 'utf8'))
      payloads[name] = payload
    }
  }
  return { directory, run, payloads }
}

async function archiveLiveEvidence({ directory, payloads, exported }) {
  const evidenceDir = path.join(EVIDENCE_ROOT, 'live-export')
  await removeDir(evidenceDir)
  fs.mkdirSync(evidenceDir, { recursive: true })
  fs.copyFileSync(path.join(directory, 'run-trace.json'), path.join(evidenceDir, 'run-trace.json'))
  const matchedPayloads = []
  for (const [name, payload] of Object.entries(payloads)) {
    const prompt = collectPayloadStrings(payload)
      .find(text => text.includes('[已生成章节标题清单]'))
    if (!prompt) continue
    if (!prompt.includes('生成第6章到第10章') && !prompt.includes('生成第11章到第12章')) continue
    const output = {
      sourceFile: name,
      runId: exported.runId,
      historyBlock: prompt.match(/\[已生成章节标题清单\][\s\S]*?(?=\[上一章事实\]|$)/)?.[0] || '',
      lastChapterBlock: prompt.match(/\[上一章事实\][\s\S]*$/)?.[0] || ''
    }
    const target = path.join(evidenceDir, name.replace(/\.json$/, '.history.json'))
    fs.writeFileSync(target, JSON.stringify(output, null, 2), 'utf8')
    matchedPayloads.push(path.basename(target))
  }
  assert(matchedPayloads.length >= 2,
    `both history-bearing batch payloads are archived, got ${matchedPayloads.length}`)
  fs.writeFileSync(path.join(evidenceDir, 'README.md'),
    `# Chapter batch contract live evidence\n\nArchived from ${directory}\n\n- run-trace.json: full deep trace\n- *.history.json: request-level history blocks for B2/B3\n`, 'utf8')
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

function assertExportedRun({ run, payloads }) {
  assert.equal(run.schemaVersion, 19, 'exported run uses the current runTrace schema v19')
  assert.equal(run.status, 'success', 'chapter-layer run ends in success')
  assert.equal(run.step, 3, 'run is the chapter-layer pipeline run')
  const validated = (run.events || []).filter(event => event.type === 'chapter-batch-validated')
  assert.equal(validated.length, 3, `three batches are validated, got ${validated.length}`)
  const parsedValidated = validated.map(event => JSON.parse(event.detail || '{}'))
  assert.deepEqual(
    parsedValidated.map(item => item.requestedCount),
    [BATCH_SIZE, BATCH_SIZE, 2],
    'batch contracts cover 1-5, 6-10, and 11-12',
  )
  for (const item of parsedValidated) {
    assert.equal(item.actualCount, item.requestedCount,
      `batch ${item.expectedStart}-${item.expectedEnd} is quantity-conserved`)
  }
  assert((run.events || []).some(event => event.type === 'chapter-batch-attempt'),
    'batch attempt events are recorded')
  assert((run.apiCalls || []).every(call => call.status !== 'running'),
    'no API call is left running')
  assert((run.turns || []).every(turn => turn.status !== 'running'),
    'no turn is left running')

  const requestStrings = Object.values(payloads)
    .flatMap(payload => collectPayloadStrings(payload))
  const secondBatchPrompt = requestStrings.find(text =>
    text.includes('[已生成章节标题清单]')
    && text.includes('生成第6章到第10章'))
  const thirdBatchPrompt = requestStrings.find(text =>
    text.includes('[已生成章节标题清单]')
    && text.includes('生成第11章到第12章'))
  assert(secondBatchPrompt, 'second batch request contains the generated-title ledger')
  assert(thirdBatchPrompt, 'third batch request contains the generated-title ledger')
  for (const [name, prompt] of [['second', secondBatchPrompt], ['third', thirdBatchPrompt]]) {
    const historyBlock = prompt.match(/\[已生成章节标题清单\][\s\S]*?(?=\[上一章事实\]|$)/)
    assert(historyBlock, `${name} batch request exposes the history ledger block`)
    assert(!historyBlock[0].includes('未提供/待补信息'),
      `${name} batch history ledger no longer uses the old missing-history wording`)
    assert(historyBlock[0].includes('第1章《'),
      `${name} batch history ledger contains the first generated chapter title`)
  }

  assert(run.step === 3, 'run keeps the chapter-layer step identity')

  const parseEventDetail = event => {
    try { return JSON.parse(String(event.detail || '{}')) } catch { return {} }
  }
  const countArbitration = (run.events || []).find(event => event.type === 'chapter-count-arbitration')
  assert(countArbitration, 'chapter-count arbitration decision is present in the live trace')
  const countContract = parseEventDetail(countArbitration)
  assert.equal(countContract.totalChapters, TOTAL_CHAPTERS,
    `chapter count uses one contract source, got total=${countContract.totalChapters}`)
  assert(['volume_outline_declared', 'configured_chapter_count', 'word_estimate']
    .includes(countContract.source), `chapter count source is valid: ${countContract.source}`)
  assert.equal(countContract.wordEstimatedCount, TOTAL_CHAPTERS,
    'word estimate agrees with the contract count in this seeded scenario')
  assert(!countContract.conflict,
    `seeded chapter count has no conflict, got: ${countContract.message}`)
  assert.equal(countContract.source, 'configured_chapter_count',
    `seeded scenario prefers the configured chapter count, got ${countContract.source}`)
  assert(!((run.events || []).some(event => event.type === 'chapter-count-arbitration-failed')),
    'chapter count arbitration does not fail during the live run')

  const slimDecisions = (run.events || [])
    .filter(event => event.type === 'chain-context-slim')
    .map(event => parseEventDetail(event))
  const nonPrimarySlim = slimDecisions.filter(item => item.isPrimaryConsumer === false)
  assert(nonPrimarySlim.length > 0, 'non-primary chain hops emit context-slim decisions')
  for (const decision of nonPrimarySlim) {
    if (decision.reason === 'scaffold_not_smaller') {
      assert.equal(decision.finalPromptLength, decision.originalPromptLength,
        `non-primary hop keeps the original prompt when the scaffold is larger (${decision.originalPromptLength} -> ${decision.scaffoldCandidateLength})`)
      assert(Number.isFinite(decision.scaffoldCandidateLength) &&
        decision.scaffoldCandidateLength > decision.originalPromptLength,
        `scaffold_not_smaller records the real rejected candidate length, got ${decision.scaffoldCandidateLength}`)
      assert(decision.outlineOriginalLength > 0,
        `non-primary hop locates the bounded outline block, got ${decision.outlineOriginalLength}`)
      assert(decision.requiresFullUpstream === true,
        'L4 folder skills keep their full-upstream declaration in trace')
      continue
    }
    assert(!['primary_consumer', 'outline_block_absent', 'declared_full_context_no_outline']
      .includes(decision.reason),
      `non-primary hop cannot bypass outline slimming, reason=${decision.reason}`)
    assert(decision.originalPromptLength > decision.finalPromptLength,
      `non-primary hop prompt shrinks: ${decision.originalPromptLength} -> ${decision.finalPromptLength}`)
    assert(decision.outlineOriginalLength > 0,
      `non-primary hop locates the bounded outline block, got ${decision.outlineOriginalLength}`)
    assert(decision.requiresFullUpstream === true,
      'L4 folder skills keep their full-upstream declaration in trace')
    assert(['declared_full_context_slimmed', 'slimmed'].includes(decision.reason),
      `non-primary hop uses the new contract reason, got ${decision.reason}`)
  }
  const perStepRequestChars = requestCharsByStep(run)
  assert.equal(perStepRequestChars.length, SKILL_FOLDERS.length,
    `chapter chain contains four step requests, got ${perStepRequestChars.length}`)
  assert(perStepRequestChars[0] > perStepRequestChars[1],
    `primary hop keeps the largest prompt (${perStepRequestChars[0]}), later hop is slimmer (${perStepRequestChars[1]})`)
  assert(perStepRequestChars[1] > 20_000,
    `second hop keeps batch/history/upstream assets after outline slimming, got ${perStepRequestChars[1]}`)

  const modelFallbacks = (run.events || []).filter(event => event.type === 'agent-model-fallback')
  assert(modelFallbacks.length > 0,
    'empty agent model fallback is explicitly traced on the chapter-layer chain')
  for (const event of modelFallbacks) {
    const detail = parseEventDetail(event)
    assert.equal(detail.step, 3, `fallback event belongs to the chapter layer, got ${detail.step}`)
    assert.equal(detail.fallbackModel, MODEL, `fallback model is the configured live model: ${detail.fallbackModel}`)
    assert.equal(detail.fallbackSource, 'provider.selectedModel', `fallback source is explicit: ${detail.fallbackSource}`)
  }

  const payloadRefs = run.payloads || []
  assert(payloadRefs.length > 0, 'deep export declares payload refs')
  for (const ref of payloadRefs) {
    assert.ok(ref.artifactRole === 'final' || ref.artifactRole === 'intermediate',
      `payload ${ref.id || ref.file} exposes artifactRole, got ${ref.artifactRole}`)
    assert(Number(ref.chars) > 0, `payload ${ref.id || ref.file} exposes a positive char count`)
  }
  const requestRefs = payloadRefs.filter(ref => ref.kind === 'request')
  assert(requestRefs.some(ref => ref.artifactRole === 'final'),
    'at least one request payload is marked final')
  assert(requestRefs.some(ref => ref.artifactRole === 'intermediate'),
    'intermediate request payloads are retained with role markers')
  const stepRequestRoleMap = requestRefs
    .filter(ref => ref.artifactRole === 'intermediate')
    .map(ref => path.basename(ref.file || ''))
  assert(stepRequestRoleMap.length > 0, 'intermediate request refs are exported')
}

function requestCharsByStep(run) {
  const chains = []
  const queue = [...(run.apiCalls || [])]
  while (queue.length > 0) {
    const call = queue.shift()
    const userText = (call.requestMessages || [])
      .filter(message => message.role === 'user')
      .map(message => String(message.content || ''))
      .join('\n')
    const systemText = (call.requestMessages || [])
      .filter(message => message.role === 'system')
      .map(message => String(message.content || ''))
      .join('\n')
    const chainMarker = userText.match(/chain step\s*([0-9]+)\s*\/\s*([0-9]+)/i)
      || systemText.match(/chain step\s*([0-9]+)\s*\/\s*([0-9]+)/i)
    if (chainMarker) {
      const index = Number(chainMarker[1]) - 1
      chains[index] = Math.max(chains[index] || 0, userText.length)
    }
    for (const physical of call.physicalCalls || []) {
      const physicalText = (physical.requestMessages || [])
        .filter(message => message.role === 'user')
        .map(message => String(message.content || ''))
        .join('\n')
      const physicalMarker = physicalText.match(/chain step\s*([0-9]+)\s*\/\s*([0-9]+)/i)
      if (physicalMarker) {
        const index = Number(physicalMarker[1]) - 1
        chains[index] = Math.max(chains[index] || 0, physicalText.length)
      }
    }
  }
  return chains
}

async function captureEvidence(page, exported, exportedRun, completionSnapshot) {
  await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'final-state.png'), fullPage: false })
  fs.writeFileSync(path.join(EVIDENCE_ROOT, 'summary.json'), JSON.stringify({
    schema: 'shenyi.chapter-batch-contract.electron-live',
    version: 1,
    generatedAt: new Date().toISOString(),
    script: SCRIPT_NAME,
    model: MODEL,
    baseUrl: BASE_URL,
    projectId: PROJECT_ID,
    totalChapters: TOTAL_CHAPTERS,
    expectedBatches: [
      { start: 1, end: 5, requestedCount: 5 },
      { start: 6, end: 10, requestedCount: 5 },
      { start: 11, end: 12, requestedCount: 2 },
    ],
    exportPath: exported.result.path,
    runId: exported.runId,
    status: exportedRun.status,
    chapterCount: completionSnapshot.chapterCount,
    validatedBatches: (exportedRun.events || [])
      .filter(event => event.type === 'chapter-batch-validated')
      .map(event => JSON.parse(event.detail || '{}')),
    apiCalls: (exportedRun.apiCalls || []).map(call => ({
      id: call.id,
      status: call.status,
      toolCallCount: (call.toolCalls || []).length,
    })),
  }, null, 2), 'utf8')
}

async function main() {
  assertFreshRendererBuild()
  await archivePreviousEvidence()
  await removeDir(PROFILE)
  await removeDir(EXPORT_ROOT)
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
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

    const skills = await seedApplication(page, apiKey)
    await selectChapterSkillsThroughUi(page, skills)
    heartbeat = startHeartbeat(page, electronProcess.pid)
    await page.click('#btn-pl-autogen-chapters')
    const onTimeout = setTimeout(() => {
      exportRunningTraceForTimeout(page).then(exported => {
        console.log(`[TIMEOUT TRACE] exported incomplete live trace to ${exported.result?.path}`)
      }).catch(error => {
        console.error(`[TIMEOUT TRACE] export failed: ${error?.message || error}`)
      })
    }, STEP_TIMEOUT_MS - 30_000)
    onTimeout.unref()
    const completion = await waitForChapterCompletion(page)
    clearTimeout(onTimeout)
    assert.equal(completion.chapterCount, TOTAL_CHAPTERS, 'project contains 12 generated chapters')
    assert.equal(completion.validatedBatches, 3, 'three chapter batches are validated in the live UI trace')
    assert(!completion.isGenerating, 'generation is no longer running')

    const exported = await exportLatestRun(page)
    const { run, payloads } = readExportedRun(exported)
    await archiveLiveEvidence({ directory: exported.result.path, payloads, exported })
    await captureEvidence(page, exported, run, completion)
    assertExportedRun({ run, payloads })
    console.log(`[EXPORT] ${exported.result.path}`)
    console.log('===== CHAPTER BATCH CONTRACT ELECTRON LIVE PASSED =====')
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

async function exportRunningTraceForTimeout(page) {
  const exported = await exportLatestRun(page)
  const directory = exported.result?.path
  if (directory) {
    fs.cpSync(directory, path.join(EVIDENCE_ROOT, 'timeout-trace'), { recursive: true })
  }
  return exported
}

async function archivePreviousEvidence() {
  if (!fs.existsSync(EVIDENCE_ROOT)) return
  const archiveRoot = path.join(path.dirname(EVIDENCE_ROOT), 'verification-chapter-batch-contract-live-archive')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const target = path.join(archiveRoot, stamp)
  fs.mkdirSync(archiveRoot, { recursive: true })
  fs.cpSync(EVIDENCE_ROOT, target, { recursive: true })
  await removeDir(EVIDENCE_ROOT)
  console.log(`[EVIDENCE] archived previous run to ${target}`)
}
}

main().catch(error => {
  console.error('[FAIL]', error)
  process.exitCode = 1
})
