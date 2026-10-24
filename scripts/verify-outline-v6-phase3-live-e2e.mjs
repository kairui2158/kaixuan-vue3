import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const SCRIPT_NAME = 'verify-outline-v6-phase3-live-e2e.mjs'
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const SOURCE_PROFILE = path.join(ROOT, '_data', 'outline-deletion-live-replay-profile')
const PROFILE = path.join(ROOT, '_data', 'outline-v6-phase3-live-profile')
const DATA_DIR = path.join(PROFILE, 'documents-data')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-outline-v6-phase3-live')
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const CDP_PORT = 9421
const PROJECT_ID = 'outline-v6-phase3-live-project'
const PROJECT_KEY = `wa_project_${PROJECT_ID}`
const SKILL_ID = 'outline-v6-live-long-stream-skill'
const TURN_TIMEOUT_MS = 10 * 60_000
const STALL_TIMEOUT_MS = 3 * 60_000

fs.rmSync(EVIDENCE_ROOT, { recursive: true, force: true })
fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function copyDirectory(from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name)
    const target = path.join(to, entry.name)
    if (entry.isDirectory()) copyDirectory(source, target)
    else fs.copyFileSync(source, target)
  }
}

function removeDir(target) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(target, { recursive: true, force: true })
      return
    } catch {}
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200)
  }
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
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
  for (const root of ['src', 'electron', 'public']) collectSources(path.join(ROOT, root))
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
      SHENYI_DATA_DIR: DATA_DIR,
      SHENYI_TEST_USER_DATA_DIR: path.join(PROFILE, 'app-data'),
    },
    windowsHide: true,
  })
  const redact = text => text
    .replace(/(sk-[A-Za-z0-9_-]{8,})/g, 'sk-***')
    .replace(/("authorization"\s*:\s*")[^"]+/gi, '$1***')
  child.stdout.on('data', chunk => {
    const text = `[ELECTRON] ${redact(String(chunk))}`
    process.stdout.write(text)
    fs.appendFileSync(RUN_LOG_PATH, text, 'utf8')
  })
  child.stderr.on('data', chunk => {
    const text = `[ELECTRON STDERR] ${redact(String(chunk))}`
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
    await sleep(400)
  }
  return false
}

async function stopElectron(app) {
  if (!app || app.exitCode !== null) return
  const exited = new Promise(resolve => app.once('exit', resolve))
  try { execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
  const timeout = sleep(10_000, true).then(() => false)
  if (!(await Promise.race([exited.then(() => true), timeout]))) app.kill('SIGKILL')
}

function makeProject() {
  return {
    schemaVersion: 3,
    projectName: 'Outline V6 Phase3 Live',
    outlineText: ['第一卷 风暴起点', '第一章 北方风暴逼近。', '第二章 男主发现旧信。', '第三章 男主决定南下。'].join('\n'),
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
    chat: [],
  }
}

async function closeProjectModal(page) {
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
  await sleep(400)
}

async function openOutlineChat(page) {
  await page.click('#btn-outline-workspace')
  await page.waitForSelector('#outline-editor', { timeout: 20_000 })
  await page.click('#btn-ai-co-create')
  await page.waitForSelector('#ow-chat-input', { timeout: 20_000 })
}

async function prepareSession(page) {
  const providerConfig = JSON.parse(fs.readFileSync(path.join(SOURCE_PROFILE, 'documents-data', 'wa_providers.json'), 'utf8'))
  const provider = providerConfig.providers?.find(item => item.id === providerConfig.generateProvider)
  assert(provider, 'the shared live profile has the configured default provider')
  await page.evaluate(async ({ providerConfig, project, projectId, projectKey, skillId }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', providerConfig)
    await window.electronAPI.storageWrite('wa_skills', {
      skills: [{
        id: skillId,
        name: 'V6长流真实验证技能',
        format: 'text',
        template: '你是大纲工作台长流验证技能。请持续输出清晰的分析内容，不要调用任何工具。',
        category: 'general',
        description: 'V6.3 Phase 3 真实供应商长流验证用文本技能',
        executionMode: 'direct',
        outputFormat: 'text',
        validationRules: [],
        splitSize: 1000,
        injectMode: 'system_prefix',
        intents: ['generate', 'edit'],
        createdAt: '2026-10-24T00:00:00.000Z',
        updatedAt: '2026-10-24T00:00:00.000Z',
      }],
      pipelineSkills: [],
      deAiSkills: [],
    })
    await window.electronAPI.storageWrite(projectKey, project)
    await window.electronAPI.storageWrite('wa_deAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
  }, {
    providerConfig,
    project: makeProject(),
    projectId: PROJECT_ID,
    projectKey: PROJECT_KEY,
    skillId: SKILL_ID,
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 30_000 })
  await sleep(1500)
  await closeProjectModal(page)
  await openOutlineChat(page)
}

async function selectSkillByDropdown(page) {
  const skillValue = await page.locator('#ow-skill-select option').filter({ hasText: 'V6长流真实验证技能' }).getAttribute('value')
  assert(skillValue, 'live SKILL appears in the real dropdown')
  await page.selectOption('#ow-skill-select', skillValue)
  await page.waitForSelector('#ow-selected-skills .ow-skill-chip', { timeout: 10_000 })
}

async function snapshot(page) {
  return await page.evaluate(() => {
    const runs = window.__pinia?.state?.value?.runTrace?.runs || []
    const outlineRuns = runs.filter(run => run.source === 'outline')
    const latest = [...outlineRuns].sort((a, b) => b.startedAt - a.startedAt)[0] || null
    const chat = window.__pinia?._s?.get('project')?.outlineChat || []
    return {
      activeRunCount: outlineRuns.filter(run => run.status === 'running').length,
      latestRunStatus: latest?.status || null,
      latestRunEvents: (latest?.events || []).map(event => ({ type: event.type, detail: event.detail })).filter(Boolean),
      chatCount: chat.length,
      latestAssistantLength: Math.max(0, ...chat.filter(message => message.role === 'assistant').map(message => String(message.content || '').length)),
      awaitingUserBanner: Boolean(document.querySelector('#ow-awaiting-user-banner')),
      inputDisabled: Boolean(document.querySelector('#ow-chat-input')?.disabled),
      sendDisabled: Boolean(document.querySelector('#btn-ow-send')?.disabled),
    }
  })
}

async function waitForTurnCompletion(page) {
  const deadline = Date.now() + TURN_TIMEOUT_MS
  let latest = null
  let stallStart = null
  let lastProgress = null
  while (Date.now() < deadline) {
    latest = await snapshot(page)
    const progress = `${latest.latestAssistantLength}:${latest.chatCount}:${latest.latestRunEvents.length}`
    if (progress !== lastProgress) {
      lastProgress = progress
      stallStart = Date.now()
    } else if (!stallStart) {
      stallStart = Date.now()
    }
    const turnFinished = latest.latestRunEvents.some(event => event.type === 'turn-finished')
    const apiSucceeded = latest.latestRunEvents.some(event => event.type === 'api-success')
    if (turnFinished && apiSucceeded && latest.latestAssistantLength > 500) return latest
    if (stallStart && Date.now() - stallStart > STALL_TIMEOUT_MS) {
      throw new Error(`live stream stalled for 3 minutes; snapshot=${JSON.stringify(latest, null, 2)}`)
    }
    await sleep(1000)
  }
  throw new Error(`live turn did not finish in ${TURN_TIMEOUT_MS}ms; snapshot=${JSON.stringify(latest, null, 2)}`)
}

function writeFailureScene(error) {
  const entry = {
    at: new Date().toISOString(),
    message: String(error),
    stack: error && error.stack ? error.stack : null,
    evidence: EVIDENCE_ROOT,
  }
  fs.writeFileSync(path.join(EVIDENCE_ROOT, 'failure.json'), JSON.stringify(entry, null, 2), 'utf8')
  fs.appendFileSync(RUN_LOG_PATH, `\n[FAILURE] ${JSON.stringify(entry, null, 2)}\n`, 'utf8')
}

assertFreshRendererBuild()
removeDir(PROFILE)
copyDirectory(path.join(SOURCE_PROFILE, 'documents-data'), DATA_DIR)

let electronApp = null
let browser = null
try {
  electronApp = startElectron()
  assert(await waitForCdp(), 'Electron CDP endpoint became available')
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
  const context = browser.contexts()[0]
  const page = context.pages().find(candidate => candidate.url().includes('index.html')) || context.pages()[0]
  assert(page, 'Electron renderer page is available')
  page.on('pageerror', error => console.log(`[PAGE ERROR] ${error.message}`))
  await page.waitForSelector('#app', { timeout: 30_000 })
  await sleep(1200)
  await closeProjectModal(page)

  await prepareSession(page)
  await selectSkillByDropdown(page)

  await page.fill('#ow-chat-input', '请基于当前大纲做一次连续、完整的长流式分析，输出不少于1200字，不要调用任何工具。')
  await page.click('#btn-ow-send')

  let midStream = null
  const midStreamDeadline = Date.now() + 120_000
  while (Date.now() < midStreamDeadline) {
    const current = await snapshot(page)
    if (current.activeRunCount === 1 || current.latestAssistantLength > 0) {
      const inputLatency = await page.evaluate(async () => {
        const input = document.querySelector('#ow-chat-input')
        const start = performance.now()
        input.focus()
        document.execCommand('insertText', false, '测')
        await new Promise(resolve => requestAnimationFrame(resolve))
        return { latencyMs: performance.now() - start, disabled: input.disabled, readOnly: input.readOnly }
      })
      assert.equal(inputLatency.disabled, false, 'chat input is not disabled during live streaming')
      assert.equal(inputLatency.readOnly, false, 'chat input is not readonly during live streaming')
      assert(inputLatency.latencyMs < 500, `input remains responsive during live streaming: ${inputLatency.latencyMs}ms`)
      midStream = { snapshot: current, inputLatency }
      break
    }
    await sleep(300)
  }
  assert(midStream, 'the live provider turn entered an active stream state')

  const completed = await waitForTurnCompletion(page)
  assert(completed.latestRunEvents.some(event => event.type === 'api-success'), 'live physical API call succeeds')
  assert(completed.latestAssistantLength >= 500, `live assistant output is substantial: ${completed.latestAssistantLength}`)
  assert(completed.latestRunEvents.some(event => event.type === 'turn-finished'), 'live turn reaches a terminal user-facing state')
  assert(completed.latestRunEvents.some(event => event.type === 'agent-skill-guidance-injected'), 'selected SKILL guidance is injected into the live request')
  assert(completed.latestRunEvents.some(event => event.type === 'physical-call' || event.type === 'api-start'), 'physical API call is traced')
  assert.equal(completed.inputDisabled, false, 'awaiting-user terminal state keeps the input editable')
  assert.equal(completed.sendDisabled, false, 'awaiting-user terminal state keeps the send button usable')
  if (completed.latestRunEvents.some(event => String(event.detail || '').includes('agent_needs_user'))) {
    assert(completed.awaitingUserBanner, 'agent_needs_user shows the persistent awaiting banner')
  }

  const registry = await page.evaluate(async () => await window.electronAPI.providerNetRegistry())
  assert(registry.ok === true, 'provider registry is available')
  const liveStream = registry.streams.find(item => item.projectId === PROJECT_ID && item.status === 'completed')
  assert(liveStream, `a completed live stream is recorded: ${JSON.stringify(registry.streams.map(item => ({ id: item.streamId, status: item.status, projectId: item.projectId })))}`)
  assert(liveStream.bytesReceived > 0, 'live stream records provider bytes')
  assert(liveStream.chunkCount > 1, 'live stream records multiple transport chunks')

  await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'live-long-stream.png'), fullPage: true })
  const report = {
    schema: 'shenyi.outline-v6-phase3-live-e2e',
    version: 1,
    generatedAt: new Date().toISOString(),
    script: SCRIPT_NAME,
    projectId: PROJECT_ID,
    skill: { id: SKILL_ID, selectedThrough: '#ow-skill-select' },
    provider: { id: liveStream.providerId, baseUrl: 'live-profile', keyReported: false },
    midStream,
    completed,
    stream: {
      bytesReceived: liveStream.bytesReceived,
      chunkCount: liveStream.chunkCount,
      status: liveStream.status,
    },
    assertions: {
      realUiSendAndSkillDropdown: true,
      inputResponsiveDuringLiveStream: true,
      liveProviderTurnCompleted: true,
      skillGuidanceInjected: true,
      physicalCallTraced: true,
      registryRecordsLiveStream: true,
      awaitingUserRemainsNonBlocking: true,
      keyNeverLogged: true,
    },
  }
  fs.writeFileSync(path.join(EVIDENCE_ROOT, 'result.json'), JSON.stringify(report, null, 2), 'utf8')
  console.log(JSON.stringify(report, null, 2))
  console.log('[PASS] outline V6 Phase3 live provider verification completed')
} catch (error) {
  writeFailureScene(error)
  throw error
} finally {
  if (browser) await browser.close().catch(() => {})
  await stopElectron(electronApp)
  await sleep(1000)
  removeDir(PROFILE)
}
