import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const SCRIPT_NAME = 'verify-outline-input-gate-e2e.mjs'
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9397
const PROFILE = path.join(ROOT, '_data', 'outline-input-gate-profile')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-outline-input-gate-e2e')
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const MOCK_PORT = 59939
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const SKILL_ID = 'outline-input-gate-skill'
const PROJECT_ID = 'outline-input-gate-project'
const OUTLINE_TEXT = ['第一卷 风暴起点', '第一章 北方风暴逼近。', '第二章 男主发现旧信。', '第三章 男主决定南下。'].join('\n')
const AWAIT_INPUT = '生成后讨论一下'
const RESUME_INPUT = '继续执行生成，并输出结果'

fs.rmSync(EVIDENCE_ROOT, { recursive: true, force: true })
fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })

const providerRequests = []
const providerServer = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    let body = null
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    providerRequests.push({
      url: request.url,
      messageCount: Array.isArray(body?.messages) ? body.messages.length : 0,
      messageRoles: Array.isArray(body?.messages) ? body.messages.map(message => message.role) : [],
      containsAwaitInput: Boolean(body?.messages?.some?.(message => String(message?.content || '').includes(AWAIT_INPUT))),
      containsResumeInput: Boolean(body?.messages?.some?.(message => String(message?.content || '').includes(RESUME_INPUT))),
      isIntentClassifierRequest: Boolean(body?.messages?.some?.(message => String(message?.content || '').includes('意图分类器'))),
    })
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify({
      choices: [{ message: { content: '已根据你的确认继续当前大纲任务。' }, finish_reason: 'stop' }]
    }))
  })
})

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function assertFreshRendererBuild() {
  const rendererIndex = path.join(ROOT, 'dist-renderer', 'index.html')
  assert(fs.existsSync(rendererIndex), 'dist-renderer/index.html exists; run npm run build:vue first')
  const bundleNames = [...fs.readFileSync(rendererIndex, 'utf8').matchAll(/assets\/[^"']+\.js/g)].map(match => match[0])
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
  const staleBundles = bundleNames.filter(name => fs.statSync(path.join(ROOT, 'dist-renderer', name)).mtimeMs < newestSourceMs)
  assert.equal(staleBundles.length, 0, `renderer build is stale: ${staleBundles.join(', ')}`)
}

function startElectron() {
  const child = spawn(ELECTRON_EXE, ['.', `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', `--user-data-dir=${PROFILE}`], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SHENYI_ALLOW_TEST_ISOLATION: '1',
      SHENYI_DATA_DIR: path.join(PROFILE, 'documents-data'),
      SHENYI_TEST_USER_DATA_DIR: path.join(PROFILE, 'app-data'),
    },
    windowsHide: true,
  })
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

async function closeProjectModal(page) {
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
  await sleep(400)
}

function makeTextSkill() {
  return {
    id: SKILL_ID,
    name: '输入门控验证技能',
    format: 'text',
    template: '你是大纲门控验证技能。',
    category: 'general',
    description: 'Phase 1 InputGate 验证用文本技能',
    executionMode: 'chain',
    outputFormat: 'text',
    validationRules: [],
    splitSize: 1000,
    injectMode: 'system_prefix',
    intents: ['generate', 'edit'],
    createdAt: '2026-10-24T00:00:00.000Z',
    updatedAt: '2026-10-24T00:00:00.000Z',
  }
}

function makeProject() {
  return {
    schemaVersion: 3,
    projectName: 'Outline Input Gate E2E',
    outlineText: OUTLINE_TEXT,
    outlineLocked: false,
    outlineLockedText: '',
    bookWordCount: 0,
    volumesConfirmed: false,
    pipelineConfig: { volumeCount: 1, volumeWords: 20000, chapterWords: 2000 },
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
  }
}

async function snapshotGate(page) {
  return await page.evaluate(() => {
    const runs = window.__pinia?.state?.value?.runTrace?.runs || []
    const outlineRuns = runs.filter(run => run.source === 'outline')
    const activeRuns = outlineRuns.filter(run => run.status === 'running')
    const latest = [...outlineRuns].sort((a, b) => b.startedAt - a.startedAt)[0] || null
    return {
      bannerVisible: Boolean(document.querySelector('#ow-awaiting-user-banner')),
      bannerText: document.querySelector('#ow-awaiting-user-banner')?.textContent?.trim() || '',
      sendDisabled: Boolean(document.querySelector('#btn-ow-send')?.disabled),
      inputDisabled: Boolean(document.querySelector('#ow-chat-input')?.disabled),
      inputValue: document.querySelector('#ow-chat-input')?.value || '',
      activeRunCount: activeRuns.length,
      latestRunId: latest?.id || null,
      latestRunStatus: latest?.status || null,
      latestRunTurnCount: (latest?.turns || []).length,
      latestRunEvents: (latest?.events || []).map(event => ({ type: event.type, detail: event.detail })).filter(Boolean),
    }
  })
}

async function waitForGate(page, predicate, label, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  let latest = null
  while (Date.now() < deadline) {
    latest = await snapshotGate(page)
    if (predicate(latest)) return latest
    await sleep(200)
  }
  throw new Error(`Timed out waiting for ${label}; snapshot=${JSON.stringify(latest, null, 2)}`)
}

function dumpFailureScene(snapshot, phase) {
  console.error(`[DEBUG ${phase}] snapshot=${JSON.stringify(snapshot, null, 2)}`)
  console.error(`[DEBUG ${phase}] providerRequests=${JSON.stringify(providerRequests, null, 2)}`)
}

assertFreshRendererBuild()

let electronApp = null
let browser = null
try {
  await new Promise(resolve => providerServer.listen(MOCK_PORT, '127.0.0.1', resolve))
  electronApp = startElectron()
  assert(await waitForCdp(), 'Electron CDP endpoint became available')
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
  const context = browser.contexts()[0]
  const page = context.pages().find(candidate => candidate.url().includes('index.html')) || context.pages()[0]
  assert(page, 'Electron renderer page is available')
  page.on('pageerror', error => console.log('[PAGE ERROR] ' + error.message))
  await page.waitForSelector('#app', { timeout: 30_000 })
  await sleep(1200)
  await closeProjectModal(page)

  await page.evaluate(async ({ mockUrl, skill, project, projectId }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'outline-input-gate-provider',
        name: 'Outline Input Gate Mock',
        baseUrl: mockUrl,
        apiKey: 'key',
        models: ['outline-input-gate-model'],
        selectedModel: 'outline-input-gate-model',
        temperature: 0.1,
        maxTokens: 4096,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: false,
      }],
      generateProvider: 'outline-input-gate-provider',
    })
    await window.electronAPI.storageWrite('wa_skills', { skills: [skill], pipelineSkills: [], deAiSkills: [] })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, project)
    await window.electronAPI.storageWrite('wa_deAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
  }, { mockUrl: MOCK_BASE_URL, skill: makeTextSkill(), project: makeProject(), projectId: PROJECT_ID })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 30_000 })
  await sleep(1200)
  await closeProjectModal(page)

  await page.click('#btn-outline-workspace')
  await page.waitForSelector('#outline-editor', { timeout: 20_000 })
  await page.click('#btn-ai-co-create')
  await page.waitForSelector('#ow-chat-input', { timeout: 20_000 })

  const skillValue = await page.locator('#ow-skill-select option').filter({ hasText: '输入门控验证技能' }).getAttribute('value')
  assert(skillValue, 'prepared skill appears in the real SKILL dropdown')
  await page.selectOption('#ow-skill-select', skillValue)
  await page.waitForSelector('#ow-selected-skills .ow-skill-chip', { timeout: 10_000 })
  await page.selectOption('#ow-skill-mode', 'chain')

  const idleGate = await snapshotGate(page)
  assert.equal(idleGate.bannerVisible, false, 'idle state has no awaiting banner')
  assert.equal(idleGate.sendDisabled, false, 'idle send button is usable')
  assert.equal(idleGate.activeRunCount, 0, 'no active run before the first send')

  await page.fill('#ow-chat-input', AWAIT_INPUT)
  await page.click('#btn-ow-send')
  let awaitingGate
  try {
    awaitingGate = await waitForGate(page, snapshot =>
      snapshot.bannerVisible
      && snapshot.activeRunCount === 1
      && snapshot.latestRunStatus === 'running'
      && snapshot.latestRunEvents.some(event => event.type === 'input-gate-decision' && event.detail.includes('mode=new_run')),
    'awaiting-user state with one active run', 30_000)
  } catch (error) {
    dumpFailureScene(await snapshotGate(page), 'awaiting-state')
    throw error
  }
  assert(awaitingGate.sendDisabled === false, 'awaiting user keeps send enabled')
  assert(awaitingGate.inputDisabled === false, 'awaiting user keeps input editable')
  assert(awaitingGate.bannerText.includes('等待你的回复'), `awaiting banner explains resume semantics: ${awaitingGate.bannerText}`)
  assert(
    awaitingGate.latestRunEvents.some(event => event.type === 'routing-fallback'),
    'routing fallback event is recorded in trace',
  )
  assert(
    providerRequests.length > 0
    && providerRequests.every(request => request.isIntentClassifierRequest),
    'awaiting-user state may only issue read-only intent-classifier requests',
  )
  assert(
    !providerRequests.some(request => request.containsAwaitInput && !request.isIntentClassifierRequest),
    'awaiting-user state does not issue a generation request',
  )

  await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'awaiting-user-banner.png'), fullPage: true })

  await page.fill('#ow-chat-input', RESUME_INPUT)
  await page.click('#btn-ow-send')
  let completedGate
  try {
    completedGate = await waitForGate(page, snapshot =>
      snapshot.bannerVisible === false
      && snapshot.latestRunStatus === 'running'
      && snapshot.latestRunTurnCount >= 2
      && snapshot.latestRunEvents.some(event => event.type === 'session-active' && event.detail.includes('第 2 轮'))
      && snapshot.latestRunEvents.some(event => event.type === 'skill-run-complete'),
    'same-run chat session remains active after resume completion', 60_000)
  } catch (error) {
    dumpFailureScene(await snapshotGate(page), 'resume-completion')
    throw error
  }
  assert(
    completedGate.activeRunCount === 1
    && completedGate.latestRunEvents.some(event => event.type === 'session-active' && event.detail.includes('第 2 轮')),
    'chat run stays open as one active session after the resumed turn',
  )
  assert(
    completedGate.latestRunEvents.some(event => event.type === 'skill-run-complete'),
    'resumed generation completes inside the same run',
  )
  assert(
    completedGate.latestRunEvents.some(event => event.type === 'input-gate-decision' && event.detail.includes('mode=resume_run')),
    'resume send is recorded through the input gate',
  )
  assert(
    completedGate.latestRunEvents.some(event => event.type === 'routing-result' && event.detail.includes('fallback=await-user')),
    'await-user routing fallback is recorded in trace',
  )
  assert(
    providerRequests.some(request => request.containsResumeInput && !request.isIntentClassifierRequest),
    'resume request reaches the provider as a generation request',
  )
  assert((await page.evaluate(() => window.__pinia?.state?.value?.runTrace?.runs || [])).filter(run => run.source === 'outline').length >= 1, 'outline run trace is available')

  await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'after-resume.png'), fullPage: true })

  const report = {
    schema: 'shenyi.outline-input-gate-e2e',
    version: 1,
    generatedAt: new Date().toISOString(),
    script: SCRIPT_NAME,
    skill: { id: SKILL_ID, selectedThrough: '#ow-skill-select' },
    triggerInput: AWAIT_INPUT,
    resumeInput: RESUME_INPUT,
    awaiting: awaitingGate,
    completed: completedGate,
    providerRequests,
    assertions: {
      awaitingBannerVisible: true,
      inputAndSendRemainUsable: true,
      noSecondActiveRun: true,
      resumeUsesSameRun: true,
      inputGateDecisionTraced: true,
      skillSelectedByRealDropdown: true,
      noPhysicalApiCallWhileAwaiting: true,
    },
  }
  fs.writeFileSync(path.join(EVIDENCE_ROOT, 'result.json'), JSON.stringify(report, null, 2), 'utf8')
  console.log(JSON.stringify(report, null, 2))
  console.log('[PASS] outline InputGate Electron verification completed')
} finally {
  if (browser) await browser.close().catch(() => {})
  closeElectron(electronApp)
  await sleep(1000)
  providerServer.close()
  try { fs.rmSync(PROFILE, { recursive: true, force: true }) } catch {}
}
