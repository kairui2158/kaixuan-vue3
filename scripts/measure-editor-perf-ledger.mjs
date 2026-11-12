import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = path.resolve(process.cwd())
const SCRIPT_NAME = 'measure-editor-perf-ledger.mjs'
const ELECTRON_EXE = process.env.SHENYI_EDITOR_PERF_ELECTRON
  ? path.resolve(process.env.SHENYI_EDITOR_PERF_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_EDITOR_PERF_CDP_PORT || 9461)
const PROFILE = path.join(ROOT, '_data', 'editor-perf-ledger-profile')
const DATA_DIR = path.join(PROFILE, 'documents-data')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'EDITOR_PERF_LEDGER_2026-11-12')
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_EDITOR_PERF_GLOBAL_TIMEOUT_MS || 240_000)
const CPU_SAMPLE_INTERVAL_US = Number(process.env.SHENYI_EDITOR_PERF_CPU_SAMPLE_INTERVAL_US || 500)

function generateText(targetChars) {
  const base = '第一卷绿潮线。旧城码头灯塔收到一张纸条，字迹被雨水泡得发涨。\n'
  const body = base.repeat(Math.ceil(targetChars / base.length))
  return body.slice(0, targetChars)
}

function generateMessages(count, contentChars) {
  const content = generateText(contentChars)
  const rows = []
  for (let index = 0; index < count; index += 1) {
    const role = index % 2 === 0 ? 'user' : 'assistant'
    rows.push({
      id: `perf-msg-${index + 1}`,
      role,
      content: index % 2 === 0 ? '请继续推进冲突线。' : content,
      ts: Date.now() + index,
    })
  }
  return rows
}

const LARGE_OUTLINE_TEXT = generateText(100_000)
const LARGE_TAB_CONTENT = generateText(100_000)
const HOME_SESSION_MESSAGES = generateMessages(500, 1000)
const HOME_SESSIONS = [
  {
    id: 'perf-chat-session',
    title: '性能账本会话',
    tabId: '',
    chapterId: '',
    messages: HOME_SESSION_MESSAGES,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
]
const PROJECT = {
  schemaVersion: 3,
  projectName: '编辑器性能账本项目',
  outlineText: LARGE_OUTLINE_TEXT,
  outlineLocked: false,
  outlineLockedText: '',
  bookWordCount: 100000,
  pipelineConfig: { volumeCount: 1, volumeWords: 20000, chapterWords: 3500 },
  settingsGenerated: true,
  settings: [],
  chapters: {},
  settingBindings: {},
  settingsCollection: { categories: [], items: {} },
  memories: {},
  memoryBlacklist: [],
  outlineChat: generateMessages(400, 200),
  chat: [],
  editorTabs: [],
  volumes: [{ id: 'perf-vol-1', name: '性能卷', outline: '' }],
  chapters: {
    'perf-vol-1': [{
      id: 'perf-chapter-1',
      title: '性能章节',
      plot: '',
      body: LARGE_TAB_CONTENT,
    }],
  },
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function removeDir(target) {
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
}

function assertRendererBuild() {
  const rendererIndex = path.join(ROOT, 'dist-renderer', 'index.html')
  assert(fs.existsSync(rendererIndex), 'dist-renderer/index.html exists; run npm run build:vue first')
  const sourceRoots = ['src', 'electron', 'public']
  const sourceFiles = []
  const collectSources = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) collectSources(full)
      else if (/\.(ts|vue|js|mjs|css)$/.test(entry.name)) sourceFiles.push(full)
    }
  }
  for (const root of sourceRoots) collectSources(path.join(ROOT, root))
  const bundleNames = [...fs.readFileSync(rendererIndex, 'utf8').matchAll(/assets\/[^"']+\.js/g)]
    .map(match => match[0])
  assert(bundleNames.length > 0, 'renderer index references JS bundles')
  const newestSourceMs = Math.max(...sourceFiles.map(file => fs.statSync(file).mtimeMs))
  const staleBundles = bundleNames.filter(name =>
    fs.statSync(path.join(ROOT, 'dist-renderer', name)).mtimeMs < newestSourceMs)
  assert.equal(staleBundles.length, 0,
    `renderer build is stale; run npm run build:vue first. Stale: ${staleBundles.join(', ')}`)
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
    windowsHide: true,
  })
  const redact = text => String(text).replace(/(sk-[A-Za-z0-9_-]{8,})/g, 'sk-***')
  child.stdout.on('data', chunk => {
    const text = `[ELECTRON] ${redact(chunk)}`
    process.stdout.write(text)
    fs.appendFileSync(RUN_LOG_PATH, text, 'utf8')
  })
  child.stderr.on('data', chunk => {
    const text = `[ELECTRON STDERR] ${redact(chunk)}`
    process.stderr.write(text)
    fs.appendFileSync(RUN_LOG_PATH, text, 'utf8')
  })
  child.on('close', code => {
    const text = `[ELECTRON CLOSE] code=${code}\n`
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
    await sleep(300)
  }
  return false
}

async function stopElectron(app) {
  if (!app || app.exitCode !== null) return
  const exited = new Promise(resolve => app.once('exit', resolve))
  try {
    execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {}
  const timeout = sleep(10_000).then(() => false)
  if (!(await Promise.race([exited.then(() => true), timeout]))) app.kill('SIGKILL')
}

async function seedApplication(page) {
  await page.evaluate(async ({ project, projectId, homeSessions }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, project)
    await window.electronAPI.storageWrite('wa_skills', { skills: [], pipelineSkills: [] })
    await window.electronAPI.storageWrite('wa_pipeline_step_config', {
      agents: { 0: '', 1: '', 2: '', 3: '', 4: '' },
      skills: { 0: [], 1: [], 2: [], 3: [], 4: [] },
      modes: { 0: 'compose', 1: 'compose', 2: 'chain', 3: 'chain', 4: 'chain' },
      skillAgents: {},
    })
    await window.electronAPI.storageWrite('wa_co_creation_config', {
      agentId: '',
      skillIds: [],
      mode: 'compose',
      skillAgents: {},
    })
    await window.electronAPI.storageWrite('wa_chat_perf-editor-ledger', homeSessions)
  }, {
    project: PROJECT,
    projectId: 'perf-editor-ledger',
    homeSessions: HOME_SESSIONS,
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 30_000 })
  await page.waitForFunction(projectId =>
    window.__pinia?._s?.get('project')?.currentProjectId === projectId,
  'perf-editor-ledger', { timeout: 30_000, polling: 200 })
}

async function navigateToHome(page) {
  await page.evaluate(() => {
    const closeButton = document.querySelector('#btn-close-outline-workspace')
    if (closeButton instanceof HTMLElement) closeButton.click()
  })
  await page.waitForFunction(() => (window.__getActivePanel?.() ?? '') === '', { timeout: 15_000, polling: 200 })
}

async function navigateToOutline(page) {
  const locator = page.locator('#btn-outline-workspace')
  await locator.waitFor({ state: 'visible', timeout: 20_000 })
  await locator.click({ timeout: 20_000 })
  await page.waitForFunction(() => (window.__getActivePanel?.() ?? '') === 'outline-workspace', { timeout: 20_000, polling: 200 })
  await page.waitForSelector('#outline-editor', { state: 'visible', timeout: 20_000 })
}

async function installPerfObserver(page) {
  return page.evaluate(() => {
    window.__editorPerfObserver?.disconnect?.()
    window.__editorPerfLedger = { longTasks: [], inputEvents: [] }
    try {
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          window.__editorPerfLedger.longTasks.push({
            name: entry.name,
            startTime: entry.startTime,
            duration: entry.duration,
          })
        }
      })
      observer.observe({ entryTypes: ['longtask'] })
      window.__editorPerfObserver = observer
    } catch (error) {
      window.__editorPerfLedger.observerError = String(error)
    }
  })
}

function flattenCpuProfile(profile) {
  return profile?.nodes || []
}

function summarizeCpuProfile(profile) {
  const nodes = flattenCpuProfile(profile)
  const nodeById = new Map(nodes.map(node => [node.id, node]))
  const sampleHits = new Map()
  for (const nodeId of profile?.samples || []) {
    sampleHits.set(nodeId, (sampleHits.get(nodeId) || 0) + 1)
  }
  const hotNodes = nodes
    .map(node => ({
      functionName: node.callFrame.functionName || '(anonymous)',
      url: node.callFrame.url.replace(/^file:\/\/\/?/, ''),
      lineNumber: node.callFrame.lineNumber + 1,
      columnNumber: node.callFrame.columnNumber + 1,
      hitCount: sampleHits.get(node.id) || node.hitCount || 0,
    }))
    .filter(node => node.hitCount > 0)
    .sort((a, b) => b.hitCount - a.hitCount)
    .slice(0, 24)
  return {
    sampleCount: profile?.samples?.length || 0,
    sampleIntervalUs: CPU_SAMPLE_INTERVAL_US,
    hotNodes,
  }
}

async function startCpuProfiler(page) {
  const session = await page.context().newCDPSession(page)
  await session.send('Profiler.enable')
  await session.send('Profiler.setSamplingInterval', { interval: CPU_SAMPLE_INTERVAL_US })
  await session.send('Profiler.start')
  return session
}

async function typeRepeatedly(page, selector, text, repetitions) {
  const locator = page.locator(selector)
  await locator.focus({ timeout: 20_000 })
  for (let index = 0; index < repetitions; index += 1) {
    await page.keyboard.type(text, { delay: 50 })
    await page.waitForTimeout(30)
  }
}

async function collectAndClearLongTasks(page) {
  return page.evaluate(() => {
    const ledger = window.__editorPerfLedger || { longTasks: [] }
    const rows = ledger.longTasks.slice()
    ledger.longTasks.length = 0
    return rows
  })
}

async function summarize(values) {
  if (!values.length) return { count: 0, p50: 0, p95: 0, max: 0 }
  const sorted = values.slice().sort((a, b) => a - b)
  const pick = ratio => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))]
  return {
    count: values.length,
    p50: pick(0.5),
    p95: pick(0.95),
    max: sorted[sorted.length - 1],
  }
}

async function measureLongTasks(page, label, metadata, action) {
  const before = await collectAndClearLongTasks(page)
  assert.equal(before.length, 0, `${label} ledger not clean before run`)
  const startedAt = Date.now()
  const profiler = await startCpuProfiler(page)
  let profile
  try {
    await action()
  } finally {
    const stopped = await profiler.send('Profiler.stop')
    profile = stopped.profile
    await profiler.detach().catch(() => {})
  }
  const rows = await collectAndClearLongTasks(page)
  const durations = rows.map(row => row.duration)
  return {
    path: label,
    metadata,
    startedAt,
    finishedAt: Date.now(),
    longTaskStats: await summarize(durations),
    longTasks: rows.slice(0, 100),
    cpuProfileSummary: summarizeCpuProfile(profile),
  }
}

async function main() {
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  fs.writeFileSync(RUN_LOG_PATH, '', 'utf8')
  assertRendererBuild()
  removeDir(PROFILE)
  fs.mkdirSync(DATA_DIR, { recursive: true })

  const app = startElectron()
  const overallDeadline = Date.now() + GLOBAL_TIMEOUT_MS
  const results = []
  try {
    assert(await waitForCdp(), 'Electron CDP endpoint ready')
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    const context = browser.contexts()[0]
    assert(context, 'Electron browser context available')
    let page = context.pages()[0]
    if (!page) page = await context.newPage()
    await page.waitForSelector('#app', { timeout: 30_000 })
    await seedApplication(page)

    // Path 1/2: outline editor typing.
    await navigateToOutline(page)
    await installPerfObserver(page)
    results.push(await measureLongTasks(page, 'outline-typing-100k', {
      contentChars: LARGE_OUTLINE_TEXT.length,
      keystrokes: 30,
      findPanel: false,
    }, async () => {
      await typeRepeatedly(page, '#outline-editor', '测', 30)
    }))

    // Open the find panel and type into the document again.
    results.push(await measureLongTasks(page, 'outline-typing-100k-find-open', {
      contentChars: LARGE_OUTLINE_TEXT.length,
      keystrokes: 30,
      findPanel: true,
    }, async () => {
      const findToggle = page.locator('#btn-ow-find')
      if (await findToggle.count()) {
        await findToggle.click({ timeout: 10_000 })
      }
      await typeRepeatedly(page, '#outline-editor', '测', 30)
    }))

    // Path 3: home editor typing through the real chapter -> editor wiring.
    await navigateToHome(page)
    const chapterItem = page.locator('.chapter-item').first()
    await chapterItem.waitFor({ state: 'visible', timeout: 20_000 })
    await chapterItem.click({ timeout: 20_000 })
    await page.waitForFunction(() => {
      const editor = window.__pinia?._s?.get('editor')
      return Boolean(editor?.activeTab?.id === 'tab-perf-chapter-1' &&
        editor.activeTab.content.length === 100_000)
    }, null, { timeout: 30_000, polling: 200 })
    await page.waitForFunction(async () => {
      const chat = window.__pinia?._s?.get('chat')
      if (!chat) return false
      return Boolean(chat.__isSessionsLoadedForProject?.('perf-editor-ledger') && chat.activeSessionId)
    }, null, { timeout: 30_000, polling: 200 })
    await installPerfObserver(page)
    results.push(await measureLongTasks(page, 'home-typing-100k', {
      contentChars: LARGE_TAB_CONTENT.length,
      keystrokes: 30,
    }, async () => {
      await typeRepeatedly(page, '#editor-content', '测', 30)
    }))

    // Reinstate the dense message session after measuring clean editor typing.
    await page.evaluate(async sessions => {
      const chat = window.__pinia?._s?.get('chat')
      if (!chat) throw new Error('chat store unavailable')
      await window.electronAPI.storageWrite('wa_chat_perf-editor-ledger', sessions)
      await chat.loadSessions('perf-editor-ledger')
      chat.activeSessionId = sessions[0].id
      if (chat.activeMessages.length !== 500) throw new Error('dense chat session failed to load')
    }, HOME_SESSIONS)
    await installPerfObserver(page)
    results.push(await measureLongTasks(page, 'home-typing-dense-messages', {
      contentChars: LARGE_TAB_CONTENT.length,
      keystrokes: 30,
      messageCount: HOME_SESSION_MESSAGES.length,
    }, async () => {
      await typeRepeatedly(page, '#editor-content', '测', 30)
    }))

    // Path 4: chat sessions persistence with 500 messages.
    results.push(await measureLongTasks(page, 'chat-sessions-persist-500', {
      messageCount: HOME_SESSION_MESSAGES.length,
      persistedMessages: HOME_SESSION_MESSAGES.length,
    }, async () => {
      await page.evaluate(async () => {
        const chat = window.__pinia?._s?.get('chat')
        if (!chat) throw new Error('chat store unavailable')
        await chat.saveSessions('perf-editor-ledger')
      })
    }))

    // Path 5: project auto-save with a 100k outline.
    results.push(await measureLongTasks(page, 'project-save-100k', {
      outlineChars: LARGE_OUTLINE_TEXT.length,
    }, async () => {
      await page.evaluate(async () => {
        const project = window.__pinia?._s?.get('project')
        if (!project) throw new Error('project store unavailable')
        await project.saveProject()
      })
    }))

    // Path 6: message panel DOM density.
    results.push(await measureLongTasks(page, 'home-message-panel-density', {
      messageCount: HOME_SESSION_MESSAGES.length,
    }, async () => {
      await page.waitForSelector('.chat-message', { timeout: 20_000 })
      const nodeCount = await page.evaluate(() => document.querySelectorAll('.chat-message').length)
      assert.equal(nodeCount, HOME_SESSION_MESSAGES.length,
        `home message panel renders all messages without virtualization; got ${nodeCount}`)
    }))

    const payload = {
      script: SCRIPT_NAME,
      capturedAt: new Date().toISOString(),
      environment: {
        electron: process.env.SHENYI_EDITOR_PERF_ELECTRON || 'bundled',
        cdpPort: CDP_PORT,
        profile: PROFILE,
      },
      fixtures: {
        outlineChars: LARGE_OUTLINE_TEXT.length,
        homeTabChars: LARGE_TAB_CONTENT.length,
        homeMessages: HOME_SESSION_MESSAGES.length,
        outlineMessages: PROJECT.outlineChat.length,
      },
      results,
    }
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'ledger.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    console.log(`[LEDGER] ${JSON.stringify(payload.fixtures)}`)
    for (const row of results) {
      console.log(`[LEDGER] path=${row.path} longTasks=${JSON.stringify(row.longTaskStats)}`)
    }
    console.log(`[LEDGER] evidence=${path.join(EVIDENCE_ROOT, 'ledger.json')}`)
  } finally {
    await stopElectron(app)
  }
}


main().catch(error => {
  console.error(`[LEDGER FAIL] ${error?.stack || error?.message || error}`)
  process.exitCode = 1
})
