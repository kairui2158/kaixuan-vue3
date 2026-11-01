#!/usr/bin/env node
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = path.resolve(process.cwd())
const SCRIPT_NAME = 'verify-run-trace-audit-electron.mjs'
const ELECTRON_EXE = process.env.SHENYI_RUN_TRACE_AUDIT_ELECTRON
  ? path.resolve(process.env.SHENYI_RUN_TRACE_AUDIT_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_RUN_TRACE_AUDIT_CDP_PORT || 9391)
const PROFILE = path.join(ROOT, '_data', 'run-trace-audit-profile')
const DATA_DIR = path.join(PROFILE, 'documents-data')
const EXPORT_ROOT = path.join(PROFILE, 'run-trace-exports')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-run-trace-audit-electron')
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const SKILL_ROOT = path.join(ROOT, '_data', 'run-trace-audit-skills')
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_RUN_TRACE_AUDIT_GLOBAL_TIMEOUT_MS || 4 * 60_000)
const STEP_TIMEOUT_MS = Number(process.env.SHENYI_RUN_TRACE_AUDIT_STEP_TIMEOUT_MS || 150_000)
const STALLED_TIMEOUT_MS = Number(process.env.SHENYI_RUN_TRACE_AUDIT_STALLED_TIMEOUT_MS || 20_000)
const DEAD_TIMEOUT_MS = Number(process.env.SHENYI_RUN_TRACE_AUDIT_DEAD_TIMEOUT_MS || 45_000)
const KEEP_PROFILE = process.env.SHENYI_RUN_TRACE_AUDIT_KEEP_PROFILE === '1'

const PROJECT_ID = 'run-trace-audit-electron'
const VOLUME_ID = 'vol-run-trace-audit'
const CHAPTER_ID = 'ch-run-trace-audit'
const TARGET_WORDS = 3500
const MIN_WORDS = Math.round(TARGET_WORDS * 0.8)
const SKILL_IDS = ['RUN-TRACE-S1', 'RUN-TRACE-S2', 'RUN-TRACE-S3']
const PACKAGE_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version
const NARRATIVE_STATUSES = [
  'declared_ready',
  'declared_not_ready',
  'undeclared',
  'unreadable_because_missing_handoff'
]
const BODY_BREAKPOINT_OWNER_KEYS = [
  `pipeline:${PROJECT_ID}:step-4:chapter-${CHAPTER_ID}`,
  `pipeline:${PROJECT_ID}:step-4`,
]

const VOLUME_OUTLINE = [
  '## 剧情单元 H1-01 灯塔',
  '> 作用域：单元级 H1-01',
  '章节范围：第 1 章',
  '- 林照打开灯塔底舱，取走纸条，确认风暴信标三次红闪，完成一次状态推进。',
].join('\n')

const S1_OUTPUT = [
  '【正文交接】',
  'chapterId：ch-run-trace-audit',
  'POV：林照',
  'NEW_FACT：林照打开底舱并取走纸条',
  'FACT_LOCK：纸条在林照手中；信标确认三次红闪',
  '事件增量：纸条从灯座移动到林照手中',
  '场景1：林照打开底舱门，状态从关闭到打开。',
  '场景2：林照取走灯座下的纸条，纸条从藏匿到携带。',
  '场景3：林照确认信标三次红闪，航线从未知到确认。',
  'narrativeStatus：ready',
  'narrativeReason：三个场景均改变状态',
  'stateChangingScenes：3',
  '【正文交接结束】',
].join('\n')

function bodyText(count) {
  return Array.from({ length: count }, (_, index) =>
    `林照把纸条压进灯座，潮声第${index + 1}次盖住他的呼吸。`).join('\n')
}

const S2_OUTPUT = [
  '【正文交接】',
  'chapterId：ch-run-trace-audit',
  'POV：林照',
  'NEW_FACT：林照取走纸条',
  'FACT_LOCK：纸条在林照手中；信标确认三次红闪',
  '事件增量：纸条从灯座移动到林照手中',
  'narrativeStatus：ready',
  'narrativeReason：状态改变动作达标',
  'stateChangingScenes：3',
  '【正文交接结束】',
  'candidateAttempt：1',
  'candidateResponseHash：fnv1a32_0123abcd',
  bodyText(140),
].join('\n')

const S3_OUTPUT = bodyText(140)

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
  const diskManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  assert.equal(diskManifest.appVersion, PACKAGE_VERSION,
    `build manifest appVersion is ${PACKAGE_VERSION}, got ${diskManifest.appVersion}`)
  assert.equal(diskManifest.schemaVersion, 1, 'build manifest schemaVersion is 1')
  const bundleText = bundleNames.map(name =>
    fs.readFileSync(path.join(ROOT, 'dist-renderer', name), 'utf8')).join('\n')
  assert(bundleText.includes('body-artifact-terminal'), 'bundle contains the terminal trace event')
  assert(bundleText.includes('body-artifact-validated'), 'bundle contains the validated trace event')
  assert(bundleText.includes('chapter-narrative-verdict'), 'bundle contains the narrative verdict trace event')
  assert(bundleText.includes('retainedCandidateIndex'), 'bundle contains retained candidate attribution')
  return diskManifest
}

function writeSkills() {
  fs.rmSync(SKILL_ROOT, { recursive: true, force: true })
  const definitions = [
    { id: SKILL_IDS[0], name: 'S1 骨架', folder: 'run-trace-s1', template: '输出章节骨架与叙事裁决。' },
    { id: SKILL_IDS[1], name: 'S2 生成', folder: 'run-trace-s2', template: '输出完整正文与【正文交接】。' },
    { id: SKILL_IDS[2], name: 'S3 打磨', folder: 'run-trace-s3', template: '只保留正文并完成打磨。' },
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
      'intents:',
      '  - generate',
      'contextPolicy:',
      '  chatHistory: none',
      '  includeOutline: false',
      '---',
      'Created and removed by the run trace audit Electron verifier.',
      '',
    ].join('\n'), 'utf8')
    fs.writeFileSync(path.join(folderPath, 'template.md'), definition.template, 'utf8')
    fs.writeFileSync(path.join(folderPath, 'meta.json'), JSON.stringify({
      sampleCount: 0,
      intents: ['generate'],
      contextPolicy: { chatHistory: 'none', includeOutline: false },
    }, null, 2), 'utf8')
    fs.writeFileSync(path.join(folderPath, 'script.js'), '', 'utf8')
  }
}

function skillRecords() {
  const names = ['S1 骨架', 'S2 生成', 'S3 打磨']
  return SKILL_IDS.map((sourceId, index) => ({
    id: `folder:${sourceId}`,
    sourceId,
    name: names[index],
    description: 'run trace audit Electron verification skill',
    format: 'folder',
    source: 'external',
    category: 'folder',
    folderPath: path.join(SKILL_ROOT, `run-trace-s${index + 1}`),
    executionMode: 'chain',
    outputFormat: 'text',
    sourcePath: path.join(SKILL_ROOT, `run-trace-s${index + 1}`, 'SKILL.md'),
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
      SHENYI_TEST_RUN_TRACE_EXPORT: EXPORT_ROOT,
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

async function seedApplication(page, provider) {
  await page.evaluate(async seed => {
    const { baseUrl, projectId, volumeId, chapterId, volumeOutline, skills } = seed
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'run-trace-audit-provider',
        name: 'Run Trace Audit Provider',
        baseUrl,
        apiKey: 'local-test-key',
        models: ['run-trace-audit-model'],
        selectedModel: 'run-trace-audit-model',
        temperature: 0.1,
        maxTokens: 8192,
        contextWindowTokens: 128000,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
      }],
      generateProvider: 'run-trace-audit-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: '运行记录审计真实UI实测',
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
        name: '第一卷 灯塔',
        index: 0,
        outline: volumeOutline,
        summary: '灯塔纸条与风暴信标。',
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
          plot: '林照打开灯塔底舱，取走纸条，确认风暴信标三次红闪。',
          summary: '灯塔纸条与风暴信标。',
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
    await page.waitForFunction(({ skillName, expectedCount }) => {
      const chips = [...document.querySelectorAll('#pl-s5-skills-list .pl-skill-chip')]
      return chips.length === expectedCount
        && chips.some(chip => (chip.textContent || '').includes(skillName))
    }, { skillName: skill.name, expectedCount: skills.indexOf(skill) + 1 },
      { timeout: 10_000, polling: 250 })
  }
  const selected = await page.evaluate(() =>
    [...document.querySelectorAll('#pl-s5-skills-list .pl-skill-chip')]
      .map(chip => (chip.textContent || '').trim()))
  assert.equal(selected.length, skills.length,
    `all body SKILLs are selected through #pl-s5-skill; got ${JSON.stringify(selected)}`)
}

async function clearBodyBreakpoints(page) {
  const removed = await page.evaluate(keys => Promise.all([
    window.electronAPI.storageRemove('wa_pipeline_breakpoint'),
    ...keys.map(key => window.electronAPI.storageRemove(`wa_pipeline_breakpoint_owner_${key}`)),
  ]), BODY_BREAKPOINT_OWNER_KEYS)
  assert(removed.every(result => result !== false),
    `failed to clear body breakpoint storage: ${JSON.stringify(removed)}`)
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
      hasFinishedEvent: (run?.events || []).some(event => event?.type === 'finished' || event?.type === 'canceled'),
      isGenerating: Boolean(pipeline?.isGenerating),
      bodyLength: String(chapter?.body || '').length,
    }
  }, { chapterId: CHAPTER_ID })
}

async function runBodyThroughUi(page) {
  await clearBodyBreakpoints(page)
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
  return page.evaluate(() => {
    const trace = window.__pinia?._s?.get('runTrace')
    return [...(trace?.runs || [])]
      .filter(item => item.source === 'pipeline' && item.step === 4 && item.stepName === '正文层')
      .sort((a, b) => b.startedAt - a.startedAt)[0] || null
  })
}

function exportRunInBrowser(page, run) {
  return page.evaluate(async runInput => {
    const store = window.__pinia?._s?.get('runTrace')
    const workerModule = await import('/src/services/runTraceExportWorkerService.ts')
    const exportedRun = await workerModule.exportRunTraceJsonInWorker(runInput)
    if (!exportedRun.ok) throw new Error(exportedRun.error || 'worker export failed')
    const result = await window.electronAPI.runTraceExport({
      schema: 'shenyi.run-trace',
      version: 6,
      mode: 'deep',
      exportedAt: new Date().toISOString(),
      run: exportedRun.run
    })
    return result
  }, JSON.parse(JSON.stringify(run)))
}

async function exportRunThroughRunTraceUi(page, run) {
  const uiState = await page.evaluate(() => ({
    activePanel: window.__getActivePanel?.() ?? null,
    pipelinePanelCount: document.querySelectorAll('#pipeline-panel').length,
    pipelineEntryCount: document.querySelectorAll('#btn-pipeline').length,
    runTraceEntryCount: document.querySelectorAll('#btn-run-trace').length,
    visibleModals: [...document.querySelectorAll('[data-modal-id]')].map(node => ({
      id: node.getAttribute('data-modal-id'),
      visible: Boolean((node instanceof HTMLElement) && node.offsetParent !== null)
    })),
  }))
  console.log(`[RUN TRACE UI STATE] ${JSON.stringify(uiState)}`)
  await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'ui-before-run-trace-export.png'), fullPage: false })
  if (uiState.pipelinePanelCount === 0 && uiState.pipelineEntryCount === 1) {
    await page.click('#btn-pipeline')
    await page.waitForSelector('#pipeline-panel', { timeout: 20_000 })
  }
  assert.equal(await page.locator('#btn-run-trace').count(), 1,
    'pipeline RunTrace entry button exists')
  await page.click('#btn-run-trace')
  await page.waitForSelector('#run-trace-panel', { state: 'visible', timeout: 20_000 })
  const runRow = page.locator(`#run-trace-panel .rt-run[data-run-id="${run.id}"]`)
  assert.equal(await runRow.count(), 1, `run trace list has exactly one row for ${run.id}`)
  await runRow.waitFor({ state: 'visible', timeout: 10_000 })
  await runRow.click()
  await page.waitForFunction(runId => {
    const row = document.querySelector(`#run-trace-panel .rt-run[data-run-id="${runId}"]`)
    return Boolean(row?.classList?.contains('active'))
  }, run.id, { timeout: 10_000, polling: 200 })
  await page.click('#run-trace-panel .rt-tabs button:has-text("导出/复制")')
  await page.waitForSelector('#run-trace-panel .rt-export button:has-text("导出深度")', {
    state: 'visible',
    timeout: 10_000
  })
  await page.click('#run-trace-panel .rt-export button:has-text("导出深度")')
  await page.waitForFunction(() => {
    const panel = document.querySelector('#run-trace-panel')
    if (!panel) return false
    return Boolean(
      panel.querySelector('.rt-export-result')?.textContent?.includes('已导出') ||
      panel.querySelector('.rt-export-error')?.textContent
    )
  }, null, { timeout: 30_000, polling: 250 })
  const exportText = await page.locator('#run-trace-panel .rt-export-result, #run-trace-panel .rt-export-error').last().textContent()
  assert(exportText?.includes('已导出'), `deep export succeeds in UI, got ${exportText}`)
  return { success: true, message: exportText }
}

function readExportedRun(exportDir) {
  const runTraceJson = path.join(exportDir, 'run-trace.json')
  assert(fs.existsSync(runTraceJson), `exported run trace exists: ${runTraceJson}`)
  const parsed = JSON.parse(fs.readFileSync(runTraceJson, 'utf8'))
  return parsed?.run || parsed
}

function assertLiveRun(run) {
  assert.equal(run.status, 'success', `run succeeds, got ${run.status}`)
  assert.equal(run.runtimeFingerprint?.source, 'vite-manifest', 'runtime fingerprint source is vite-manifest')
  assert.equal(String(run.runtimeFingerprint?.manifestVersion), '1', 'runtime manifestVersion is 1')
  assert.equal(run.runtimeFingerprint?.appVersion, PACKAGE_VERSION,
    'runtime appVersion matches package version')
  const calls = run.apiCalls || []
  assert.equal(calls.length, 3, `run records S1/S2/S3 calls, got ${calls.length}`)
  const s2Call = calls[1]
  assert.equal(s2Call.status, 'success', `S2 call succeeds, got ${s2Call.status}`)
  assert.ok(Number(s2Call.retainedCandidateIndex) > 0, 'S2 records retainedCandidateIndex')
  assert.equal(s2Call.responseText, S2_OUTPUT,
    'S2 aggregate response equals the retained candidate output')
  const attempts = (run.events || []).filter(event => event.type === 'body-artifact-attempt')
  assert.equal(attempts.length, 1, `one body artifact attempt is recorded, got ${attempts.length}`)
  const attempt = JSON.parse(attempts[0].detail || '{}')
  assert.equal(attempt.status, 'complete', 'body artifact attempt is complete')
  const terminal = (run.events || []).filter(event => event.type === 'body-artifact-validated').at(-1)
  assert(terminal, 'body-artifact-validated exists')
  const terminalDetail = JSON.parse(terminal.detail || '{}')
  assert.equal(terminalDetail.terminalReason, 'contract_valid', 'terminal reason is contract_valid')
  assert.ok(Array.isArray(terminalDetail.decisionPath), 'decisionPath is exported')
  const narrative = (run.events || []).filter(event => event.type === 'chapter-narrative-verdict')
  assert(narrative.length > 0, 'chapter narrative verdict is emitted')
  const generatorNarrative = narrative
    .map(event => JSON.parse(event.detail || '{}'))
    .find(detail => Number(detail.sourceCandidateIndex) > 0)
  assert(generatorNarrative, 'generator narrative verdict carries candidate attribution')
  assert.equal(Number(generatorNarrative.sourceCandidateIndex), Number(s2Call.retainedCandidateIndex),
    'narrative verdict attribution matches S2 retained candidate')
  assert.match(generatorNarrative.sourceResponseHash || '', /^fnv1a32_[0-9a-fA-F]{8}$/,
    'narrative verdict sourceResponseHash is valid')
  for (const event of narrative) {
    const detail = JSON.parse(event.detail || '{}')
    assert(NARRATIVE_STATUSES.includes(detail.status),
      `narrative status uses the four-state contract, got ${detail.status}`)
  }
  assert((run.events || []).some(event => event.type === 'body-artifact-attempt'), 'attempt event exists')
}

function findExportedRunDirectory(expectedRunId) {
  const entries = fs.readdirSync(EXPORT_ROOT, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith('run-trace-'))
    .map(entry => path.join(EXPORT_ROOT, entry.name))
  assert(entries.length > 0, 'deep export directory exists')
  const sorted = entries.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
  const matched = sorted.find(entry => {
    const runTraceJson = path.join(entry, 'run-trace.json')
    if (!fs.existsSync(runTraceJson)) return false
    try {
      return readExportedRun(entry).id === expectedRunId
    } catch {
      return false
    }
  })
  assert(matched, `deep export contains the current run id: ${expectedRunId}`)
  const exportJson = path.join(matched, 'export.json')
  const runTraceJson = path.join(matched, 'run-trace.json')
  assert(fs.existsSync(exportJson), 'deep export has export.json')
  assert(fs.existsSync(runTraceJson), 'deep export has run-trace.json')
  const exportedRun = readExportedRun(matched)
  assert.equal(exportedRun.id, expectedRunId,
    `exported trace belongs to the current run, got ${exportedRun.id}`)
  assert.equal(exportedRun.status, 'success',
    `exported trace is the current success run, got ${exportedRun.status}`)
  assert.equal(Number(exportedRun.exportSchemaVersion), 20,
    'exported trace carries exportSchemaVersion=20')
  return matched
}

async function main() {
  const diskManifest = assertFreshRendererBuild()
  fs.rmSync(EVIDENCE_ROOT, { recursive: true, force: true })
  fs.rmSync(EXPORT_ROOT, { recursive: true, force: true })
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  fs.mkdirSync(EXPORT_ROOT, { recursive: true })
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
  writeSkills()

  const watchdog = setTimeout(() => {
    console.error(`[FAIL] global timeout after ${GLOBAL_TIMEOUT_MS}ms`)
    process.exit(1)
  }, GLOBAL_TIMEOUT_MS)
  watchdog.unref()

  const provider = await startProvider()
  provider.queue.push({ body: S1_OUTPUT, finishReason: 'stop' })
  for (let attempt = 0; attempt < 3; attempt += 1) {
    provider.queue.push({ body: S2_OUTPUT, finishReason: 'stop' })
  }
  provider.queue.push({ body: S3_OUTPUT, finishReason: 'stop' })
  const electronProcess = startElectron()
  let browser = null
  try {
    assert(await waitForCdp(), 'CDP reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    const page = await connectPage(browser)
    page.on('pageerror', error => console.error(`[PAGE ERROR] ${error.message}`))
    page.on('console', message => {
      if (['error', 'warning'].includes(message.type())) {
        console.log(`[PAGE ${message.type().toUpperCase()}] ${message.text()}`)
      }
    })
    page.on('crash', () => console.error('[PAGE CRASH] renderer process crashed'))
    await page.waitForSelector('#app', { timeout: 20_000 })
    await sleep(1500)
    await seedApplication(page, provider)
    const skills = skillRecords()
    await selectBodySkillsThroughUi(page, skills)
    await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'ui-skill-selection.png'), fullPage: false })

    await runBodyThroughUi(page)
    const run = await currentRun(page)
    assertLiveRun(run)
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'trace-run.json'), JSON.stringify(run, null, 2), 'utf8')

    const exported = await exportRunThroughRunTraceUi(page, run)
    assert(exported?.success, `deep export succeeds: ${JSON.stringify(exported)}`)
    const exportedDir = findExportedRunDirectory(run.id)
    fs.cpSync(exportedDir, path.join(EVIDENCE_ROOT, 'exported-trace'), { recursive: true })
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'report.json'), JSON.stringify({
      schema: 'shenyi.run-trace-audit.electron',
      version: 1,
      script: SCRIPT_NAME,
      generatedAt: new Date().toISOString(),
      runtimeFingerprint: {
        source: 'vite-manifest',
        manifestVersion: String(diskManifest.schemaVersion),
        commit: diskManifest.commit,
        buildTime: diskManifest.buildTime,
        appVersion: diskManifest.appVersion,
      },
      exported,
      assertions: [
        'trace export schemaVersion=20',
        'deep export run.id matches the live current run',
        'runtimeFingerprint four fields',
        'S2 retainedCandidateIndex>0',
        'aggregate response=retained candidate',
      'chapter-narrative-verdict candidate attribution',
        'body-artifact-validated terminalReason=contract_valid',
        'chapter-narrative-verdict four-state contract',
        'deep export payloads closed',
      ],
    }, null, 2), 'utf8')

    console.log('===== RUN TRACE AUDIT ELECTRON PASSED =====')
  } finally {
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

function startProvider() {
  const queue = []
  const server = http.createServer((request, response) => {
    let bodyText = ''
    request.on('data', chunk => { bodyText += chunk })
    request.on('end', () => {
      const parsed = (() => { try { return JSON.parse(bodyText) } catch { return {} } })()
      const next = queue.length > 0 ? queue.shift() : { body: S2_OUTPUT, finishReason: 'stop' }
      const wantsStream = parsed.stream === true
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
      queue,
      close: () => new Promise(done => server.close(() => done())),
    })
  })
  })
}
