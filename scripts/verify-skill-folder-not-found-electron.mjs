import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = path.resolve(process.cwd())
const SCRIPT_NAME = 'verify-skill-folder-not-found-electron.mjs'
const ELECTRON_EXE = process.env.SHENYI_SKILL_FOLDER_ELECTRON
  ? path.resolve(process.env.SHENYI_SKILL_FOLDER_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_SKILL_FOLDER_CDP_PORT || 9376)
const PROFILE = path.join(ROOT, '_data', 'skill-folder-not-found-profile')
const DATA_DIR = path.join(PROFILE, 'documents-data')
const EXPORT_ROOT = path.join(PROFILE, 'run-trace-exports')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-skill-folder-not-found-electron')
const SKILL_ROOT = path.join(PROFILE, 'skills')
const SKILL_DIR = path.join(SKILL_ROOT, 'moved-volume-skill')
const MOVED_SKILL_DIR = path.join(SKILL_ROOT, 'moved-volume-skill-relocated')
const PROJECT_ID = 'skill-folder-not-found-project'
const PROVIDER_ID = 'skill-folder-not-found-provider'
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_SKILL_FOLDER_GLOBAL_TIMEOUT_MS || 3 * 60_000)
const KEEP_PROFILE = process.env.SHENYI_SKILL_FOLDER_KEEP_PROFILE === '1'

const OUTLINE_TEXT = [
  '# folder SKILL 路径失效实测大纲',
  '第一卷 风暴起点：旧信、灯塔与南方航线共同推动主角完成第一次远航。',
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

function writeSkillFolder() {
  fs.mkdirSync(SKILL_DIR, { recursive: true })
  fs.writeFileSync(path.join(SKILL_DIR, 'SKILL.md'), [
    '---',
    'id: moved-volume-skill',
    'name: 已迁移卷纲技能',
    'description: folder SKILL 路径失效实测技能',
    'format: folder',
    '---',
    '',
    '你是卷纲技能，只输出当前步骤定稿产物。'
  ].join('\n'), 'utf8')
  fs.writeFileSync(path.join(SKILL_DIR, 'template.md'), '你必须输出一个 JSON 数组。', 'utf8')
}

function relocateSkillFolder() {
  assert(fs.existsSync(path.join(SKILL_DIR, 'SKILL.md')), 'skill folder exists before relocation')
  fs.renameSync(SKILL_DIR, MOVED_SKILL_DIR)
  assert(!fs.existsSync(SKILL_DIR) && fs.existsSync(MOVED_SKILL_DIR), 'skill folder is relocated')
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
  child.stdout.on('data', chunk => process.stdout.write(`[ELECTRON] ${chunk}`))
  child.stderr.on('data', chunk => process.stderr.write(`[ELECTRON STDERR] ${chunk}`))
  child.on('close', (code, signal) => console.log(`[ELECTRON CLOSE] code=${code} signal=${signal}`))
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

function startProvider() {
  const requests = []
  const server = http.createServer((request, response) => {
    let bodyText = ''
    request.on('data', chunk => { bodyText += chunk })
    request.on('end', () => {
      let body = null
      try { body = JSON.parse(bodyText) } catch {}
      const text = (body?.messages || []).map(message => String(message.content || '')).join('\n')
      const styleAnalysis = text.includes('写作风格和节奏特征')
      requests.push({ at: new Date().toISOString(), url: request.url, bodyText, styleAnalysis })
      if (styleAnalysis) {
        response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' })
        response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '{"styleTags":"实测风格","pacingParams":"实测节奏"}' } }] })}\n\n`)
        response.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`)
        response.write('data: [DONE]\n\n')
        response.end()
        return
      }
      response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ error: { message: 'provider must not be called when folder skill is missing' } }))
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

async function seedApplication(page, providerPort, folderPath) {
  await page.evaluate(async ({ port, folderPath: skillDir }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', 'skill-folder-not-found-project')
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'skill-folder-not-found-provider',
        name: 'Skill Folder Failure Provider',
        baseUrl: `http://127.0.0.1:${port}/v1`,
        apiKey: 'skill-folder-local-key',
        models: ['skill-folder-model'],
        selectedModel: 'skill-folder-model',
        temperature: 0.1,
        maxTokens: 4096,
        contextWindowTokens: 128000,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
      }],
      generateProvider: 'skill-folder-not-found-provider',
    })
    await window.electronAPI.storageWrite('wa_project_skill-folder-not-found-project', {
      schemaVersion: 3,
      projectName: 'folder SKILL 路径失效实测',
      outlineText: '',
      outlineLocked: false,
      outlineLockedText: '',
      bookWordCount: 0,
      volumesConfirmed: false,
      chaptersConfirmed: false,
      settingsGenerated: true,
      settings: [],
      volumes: [],
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
    await window.electronAPI.storageWrite('wa_skills', {
      skills: [{
        id: 'folder:moved-volume-skill',
        sourceId: 'moved-volume-skill',
        name: '已迁移卷纲技能',
        format: 'folder',
        folderPath: skillDir,
        template: '你必须输出一个 JSON 数组。',
        category: 'folder',
        description: 'folder SKILL 路径失效实测技能',
        resourceSummary: { resourceCount: 0, warningCount: 0 },
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
      }],
      pipelineSkills: [],
    })
    await window.electronAPI.storageWrite('wa_pipeline_step_config', {
      agents: { 0: '', 1: '', 2: '', 3: '', 4: '' },
      skills: { 0: [], 1: [], 2: ['folder:moved-volume-skill'], 3: [], 4: [] },
      modes: { 0: 'compose', 1: 'compose', 2: 'chain', 3: 'chain', 4: 'chain' },
      skillAgents: {},
    })
    await window.electronAPI.storageWrite('wa_deAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
    await window.electronAPI.storageRemove('wa_pipeline_breakpoint')
  }, { port: providerPort, folderPath })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20_000 })
  await sleep(1200)
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
  await sleep(300)
}

async function confirmOutlineThroughUi(page) {
  await page.click('#btn-pipeline')
  await page.waitForSelector('#pipeline-panel', { timeout: 20_000 })
  await page.evaluate(() => window.__pinia?._s?.get('project')?.unlockOutline?.())
  await page.locator('#pl-outline').fill(OUTLINE_TEXT)
  await page.locator('#pl-book-word-count').fill('2')
  await page.locator('#btn-pl-confirm-outline').click()
  await sleep(500)
}

async function runVolumeGenerationThroughUi(page) {
  await page.locator('#pl-steps .pl-step').nth(2).click()
  await page.waitForSelector('#pl-step-3-content', { state: 'visible' })
  await page.locator('#pl-volume-count').fill('1')
  await page.locator('#pl-volume-count').dispatchEvent('change')
  await sleep(300)
  await page.click('#btn-pl-gen-volumes')

  const deadline = Date.now() + 60_000
  let lastSnapshot = null
  while (Date.now() < deadline) {
    lastSnapshot = await page.evaluate(() => {
      const trace = window.__pinia?._s?.get('runTrace')
      const pipeline = window.__pinia?._s?.get('pipeline')
      const run = [...(trace?.runs || [])]
        .filter(item => item.source === 'pipeline' && item.step === 2)
        .sort((a, b) => b.startedAt - a.startedAt)[0]
      return {
        runId: run?.id || null,
        runStatus: run?.status || null,
        apiCallCount: (run?.apiCalls || []).length,
        eventCount: (run?.events || []).length,
        status: pipeline?.activeVolumesRun?.statusText || null,
        isGenerating: Boolean(pipeline?.isGenerating),
        bodyText: (document.body.textContent || ''),
        logText: (document.querySelector('#pl-volume-api-log')?.textContent || ''),
        stepSkillIds: (window.__pinia?._s?.get('skill')?.skills || []).map(skill => ({
          id: skill.id,
          format: skill.format,
          folderPath: skill.folderPath,
        })),
      }
    })
    const buttonEnabled = await page.evaluate(() => {
      const button = document.querySelector('#btn-pl-gen-volumes')
      return Boolean(button && !button.disabled)
    })
    if (lastSnapshot.runId && lastSnapshot.runStatus !== 'running' && buttonEnabled) return lastSnapshot
    await sleep(250)
  }
  throw new Error(`volume generation did not finish: ${JSON.stringify(lastSnapshot)}`)
}

async function exportLatestRun(page) {
  const runId = await page.evaluate(() => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])]
      .filter(item => item.source === 'pipeline' && item.step === 2)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    return run?.id || null
  })
  assert(runId, 'volume-layer run trace exists')
  const exported = await page.evaluate(async ({ exportRoot, runId: id }) => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])].find(item => item.id === id)
    return await window.electronAPI.runTraceExport({
      schema: 'shenyi.run-trace',
      version: 2,
      run: store.exportRunToJson(run),
      mode: 'deep',
      payloadDirectoryHint: exportRoot,
    })
  }, { exportRoot: EXPORT_ROOT, runId })
  assert(exported?.success, `deep run trace export succeeds: ${exported?.error || 'unknown error'}`)
  const run = JSON.parse(fs.readFileSync(path.join(exported.path, 'run-trace.json'), 'utf8'))
  return { runId, directory: exported.path, run }
}

function assertRun(run, snapshot, requests, relocatedAtMs) {
  const visibleText = snapshot.bodyText || ''
  assert.equal(run.step, 2, `run is the volume layer, got step ${run.step}`)
  assert.equal(run.status, 'failed', `missing folder skill fails the run, got ${run.status}`)
  assert.equal((run.apiCalls || []).length, 0,
    `no misleading api-start is recorded before skill load, got ${(run.apiCalls || []).length}`)
  const physicalCalls = (run.apiCalls || []).flatMap(call => call.physicalCalls || [])
  assert.equal(physicalCalls.length, 0, 'no physical provider request is recorded')
  const generationRequests = requests.filter(item => !item.styleAnalysis)
  assert.equal(generationRequests.length, 0,
    `local mock provider receives no generation request, got ${JSON.stringify(generationRequests)}`)
  const postRelocationRequests = requests.filter(item => new Date(item.at).getTime() >= relocatedAtMs)
  assert.equal(postRelocationRequests.length, 0,
    `provider receives no request after folder relocation, got ${JSON.stringify(postRelocationRequests)}`)
  const event = (run.events || []).find(item => item.type === 'skill-load-failed')
  assert(event, 'run trace records skill-load-failed event')
  assert.equal(event.level, 'error', 'skill-load-failed is an error-level event')
  const detail = typeof event.detail === 'string' ? event.detail : JSON.stringify(event.detail || {})
  assert(detail.includes('已迁移卷纲技能'), `event identifies skill name, got ${detail}`)
  assert(detail.includes('folder-not-found'), `event identifies folder-not-found, got ${detail}`)
  assert(detail.includes('D:'), `event identifies bound path, got ${detail}`)
  assert(detail.includes('请到技能设置中重新选择该技能的文件夹'),
    `event includes repair action, got ${detail}`)
  assert(visibleText.includes('failed: 技能：已迁移卷纲技能'),
    `progress bar surfaces preflight failure, got ${visibleText}`)
  assert(visibleText.includes('folder-not-found SKILL 文件夹不存在或不是目录'),
    `progress bar identifies folder-not-found, got ${visibleText}`)
  assert(visibleText.includes('请到技能设置中重新选择该技能的文件夹'),
    `progress bar includes repair action, got ${visibleText}`)
}

async function main() {
  assertFreshRendererBuild()
  fs.rmSync(EVIDENCE_ROOT, { recursive: true, force: true })
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  fs.rmSync(PROFILE, { recursive: true, force: true })
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
  writeSkillFolder()

  const provider = await startProvider()
  const electronProcess = startElectron()
  let browser = null
  const watchdog = setTimeout(() => {
    try { if (browser) browser.close() } catch {}
    closeElectron(electronProcess)
    provider.close()
    console.error(`[FAIL] global timeout after ${GLOBAL_TIMEOUT_MS}ms`)
    process.exit(1)
  }, GLOBAL_TIMEOUT_MS)
  watchdog.unref()

  try {
    assert(await waitForCdp(), 'CDP reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    const page = await connectPage(browser)
    page.on('pageerror', error => console.error(`[PAGE ERROR] ${error.message}`))
    page.on('console', message => {
      if (message.type() === 'error') console.error(`[PAGE ERROR] ${String(message.text()).slice(0, 600)}`)
    })
    await page.waitForSelector('#app', { timeout: 20_000 })
    await sleep(1200)
    await seedApplication(page, provider.port, SKILL_DIR)
    await confirmOutlineThroughUi(page)

    relocateSkillFolder()
    const relocatedAtMs = Date.now()
    const completion = await runVolumeGenerationThroughUi(page)
    const requests = provider.requests()
    const exported = await exportLatestRun(page)
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'provider-requests.json'),
      JSON.stringify(requests, null, 2), 'utf8')
    assertRun(exported.run, completion, requests, relocatedAtMs)

    fs.copyFileSync(path.join(exported.directory, 'run-trace.json'),
      path.join(EVIDENCE_ROOT, 'run-trace.json'))
    await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'failure-state.png'), fullPage: false })
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'report.json'), JSON.stringify({
      schema: 'shenyi.skill-folder-not-found.electron',
      version: 1,
      generatedAt: new Date().toISOString(),
      script: SCRIPT_NAME,
      projectId: PROJECT_ID,
      runId: exported.runId,
      runStatus: exported.run.status,
      apiCallCount: (exported.run.apiCalls || []).length,
      physicalCallCount: (exported.run.apiCalls || []).flatMap(call => call.physicalCalls || []).length,
      providerRequestCount: requests.length,
      styleAnalysisRequestCount: requests.filter(item => item.styleAnalysis).length,
      generationRequestCount: requests.filter(item => !item.styleAnalysis).length,
      postRelocationRequestCount: requests.filter(item => new Date(item.at).getTime() >= relocatedAtMs).length,
    skillLoadFailedEvent: (exported.run.events || []).find(item => item.type === 'skill-load-failed') || null,
      visibleFailureText: completion.bodyText || '',
      debugStepSkills: completion.stepSkillIds,
      debugLogText: completion.logText,
      boundFolderPath: SKILL_DIR,
      relocatedFolderPath: MOVED_SKILL_DIR,
      hardRules: {
        visibleElectron: true,
        realFolderRelocation: true,
        realUiOperation: '#btn-pipeline / #pl-outline / #btn-pl-confirm-outline / #pl-steps .pl-step:nth(2) / #pl-volume-count / #btn-pl-gen-volumes',
        noSkillInjection: true,
        localMockProvider: true,
      },
    }, null, 2), 'utf8')

    console.log('===== SKILL FOLDER NOT FOUND ELECTRON PASSED =====')
  } finally {
    clearTimeout(watchdog)
    try { if (browser) await browser.close() } catch {}
    closeElectron(electronProcess)
    await sleep(800)
    await provider.close()
    if (!KEEP_PROFILE) await removeDir(PROFILE)
  }
}

main().catch(error => {
  console.error('[FAIL]', error)
  process.exitCode = 1
})
