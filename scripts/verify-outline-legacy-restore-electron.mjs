import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = path.resolve(process.cwd())
const SCRIPT_NAME = 'verify-outline-legacy-restore-electron.mjs'
const ELECTRON_EXE = process.env.SHENYI_LEGACY_RESTORE_ELECTRON
  ? path.resolve(process.env.SHENYI_LEGACY_RESTORE_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_LEGACY_RESTORE_CDP_PORT || 9451)
const SOURCE_PROJECT_ID = 'proj-1790355606249'
const PROJECT_ID = 'legacy-restore-e2e'
const PROFILE = path.join(ROOT, '_data', 'outline-legacy-restore-profile')
const DATA_DIR = path.join(PROFILE, 'documents-data')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-outline-legacy-restore-electron')
const EVIDENCE_ARCHIVE_ROOT = `${EVIDENCE_ROOT}-archive`
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_LEGACY_RESTORE_GLOBAL_TIMEOUT_MS || 180_000)

const LEGACY_MESSAGES = [
  { role: 'user', content: '恢复第一条：请根据第一卷大纲继续讨论。' },
  { role: 'assistant', content: '已围绕第一卷主线给出冲突建议。' },
  { role: 'user', content: '恢复第三条：补充人物王芳的行动线。' },
  { role: 'assistant', content: '已把王芳的行动线并入第一卷冲突。' },
]
const CURRENT_MESSAGES = [
  { messageId: 'm-current-1', role: 'user', content: '清空后的新对话' },
]
const PROJECT = {
  schemaVersion: 3,
  projectName: '《绿潮》大纲总纲',
  outlineText: '# 第一卷 绿潮\n\n第一章 灯塔纸条。',
  outlineLocked: true,
  outlineLockedText: '# 第一卷 绿潮\n\n第一章 灯塔纸条。',
  bookWordCount: 120000,
  pipelineConfig: { volumeCount: 1, volumeWords: 20000, chapterWords: 3500 },
  settingsGenerated: true,
  settings: [],
  volumes: [],
  chapters: {},
  settingBindings: {},
  settingsCollection: { categories: [], items: {} },
  memories: {},
  memoryBlacklist: [],
  aiNaming: null,
  outlineChat: CURRENT_MESSAGES,
  chat: [],
  editorTabs: [],
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function removeDir(target) {
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
}

function archiveExistingEvidence() {
  if (!fs.existsSync(EVIDENCE_ROOT)) return
  if (fs.readdirSync(EVIDENCE_ROOT, { recursive: true }).length === 0) {
    removeDir(EVIDENCE_ROOT)
    return
  }
  fs.mkdirSync(EVIDENCE_ARCHIVE_ROOT, { recursive: true })
  const archive = path.join(EVIDENCE_ARCHIVE_ROOT, new Date().toISOString().replace(/[:.]/g, '-'))
  fs.cpSync(EVIDENCE_ROOT, archive, { recursive: true })
  removeDir(EVIDENCE_ROOT)
  console.log(`[EVIDENCE] archived previous run to ${archive}`)
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

async function assertRealClick(page, selector, label) {
  const locator = page.locator(selector)
  await locator.waitFor({ state: 'visible', timeout: 20_000 })
  const box = await locator.boundingBox()
  assert(box && box.width > 0 && box.height > 0, `${label} has a real clickable box`)
  const hit = await page.evaluate(({ x, y }) => {
    const node = document.elementFromPoint(x, y)
    return node ? `${node.nodeName.toLowerCase()}#${node.id || ''}.${String(node.className || '')}` : null
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
  assert(hit, `${label} is not covered at its center`)
  await locator.click({ timeout: 20_000 })
}

async function seedApplication(page) {
  await page.evaluate(async ({ project, projectId }) => {
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
  }, { project: PROJECT, projectId: PROJECT_ID })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 30_000 })
  await waitForStoreProject(page)
  try {
    await waitForStoreChatProject(page)
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      chatPanelExists: Boolean(document.querySelector('#chat-panel')),
      chatInputExists: Boolean(document.querySelector('#user-input')),
      chatCurrentProjectId: window.__pinia?._s?.get('chat')?.currentProjectId || null,
      chatSessionsLength: window.__pinia?._s?.get('chat')?.sessions?.length ?? null,
      chatActiveSessionId: window.__pinia?._s?.get('chat')?.activeSessionId || null,
      projectStoreId: window.__pinia?._s?.get('project')?.currentProjectId || null,
      piniaStoreIds: [...(window.__pinia?._s?.keys?.() || [])],
    }))
    const message = `chat store did not bind to project\n[DIAGNOSTIC] chat=${JSON.stringify(diagnostics)}`
    assert.fail(message)
  }
  await assertActivePanel(page, '')
  // ProjectModal is not mounted on startup. The legacy selector was a no-op and
  // must not be treated as a startup gate.
  const projectModalVisible = await page.evaluate(() => {
    const overlay = document.querySelector('[data-modal-id="project-modal"]')
    return Boolean(overlay && !overlay.classList.contains('modal-hidden'))
  })
  assert.equal(projectModalVisible, false, 'project modal must not block startup navigation')
  await assertRealClick(page, '#btn-outline-workspace', 'outline workspace entry button')
  await assertActivePanel(page, 'outline-workspace')
}

async function waitForStoreProject(page) {
  await page.waitForFunction(projectId =>
    window.__pinia?._s?.get('project')?.currentProjectId === projectId,
  PROJECT_ID, { timeout: 30_000, polling: 200 })
}

async function waitForStoreChatProject(page) {
  await page.waitForFunction(projectId =>
    window.__pinia?._s?.get('chat')?.currentProjectId === projectId,
  PROJECT_ID, { timeout: 30_000, polling: 200 })
}

async function assertActivePanel(page, expected) {
  const actual = await page.evaluate(() => window.__getActivePanel?.() ?? null)
  assert.equal(actual, expected, `activePanel must stay ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

async function waitForLegacyCandidate(page, expectedMessageCount) {
  await page.waitForFunction(expected => {
    const candidate = window.__pinia?._s?.get('project')?.outlineLegacyJournalCandidate
    return candidate?.messageCount === expected
  }, expectedMessageCount, { timeout: 30_000, polling: 200 })
}

async function collectState(page) {
  return page.evaluate(() => ({
    currentProjectId: window.__pinia?._s?.get('project')?.currentProjectId || null,
    candidate: window.__pinia?._s?.get('project')?.outlineLegacyJournalCandidate || null,
    outlineChat: window.__pinia?._s?.get('project')?.outlineChat || [],
    chatSessions: window.__pinia?._s?.get('chat')?.sessions || [],
    restoreButtonExists: Boolean(document.querySelector('#btn-ow-restore-legacy-chat')),
    restoreButtonDisabled: Boolean(document.querySelector('#btn-ow-restore-legacy-chat')?.disabled),
    chatInputInteractive: Boolean(document.querySelector('#ow-chat-input')),
  }))
}

function writeLegacyCopy(dataDir) {
  const source = path.resolve('D:/神意助手数据', `outline-journal_${SOURCE_PROJECT_ID}.json.legacy-bak`)
  const target = path.join(dataDir, `outline-journal_${PROJECT_ID}.json.legacy-bak`)
  const sourceMessages = JSON.parse(fs.readFileSync(source, 'utf8'))
  assert(Array.isArray(sourceMessages), 'source legacy backup contains a message array')
  fs.writeFileSync(target, JSON.stringify(sourceMessages, null, 2), 'utf8')
  return { source, target, sourceMessageCount: sourceMessages.length }
}

function currentSnapshot(dataDir) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, `outline-journal_${PROJECT_ID}.json`), 'utf8'))
}

async function captureButtonDiagnostics(page) {
  return page.evaluate(() => {
    const button = document.querySelector('#btn-ow-restore-legacy-chat')
    if (!button) return { attached: false }
    const rect = button.getBoundingClientRect()
    const style = getComputedStyle(button)
    const ancestors = []
    let node = button.parentElement
    while (node && node !== document.body) {
      const ancestorStyle = getComputedStyle(node)
      const ancestorRect = node.getBoundingClientRect()
      ancestors.push({
        selector: `${node.nodeName.toLowerCase()}${node.id ? `#${node.id}` : ''}.${String(node.className || '').trim().replace(/\s+/g, '.')}`,
        display: ancestorStyle.display,
        visibility: ancestorStyle.visibility,
        opacity: ancestorStyle.opacity,
        rect: { x: ancestorRect.x, y: ancestorRect.y, width: ancestorRect.width, height: ancestorRect.height },
      })
      node = node.parentElement
    }
    const centerX = rect.x + rect.width / 2
    const centerY = rect.y + rect.height / 2
    const hitNode = document.elementFromPoint(centerX, centerY)
    return {
      attached: true,
      disabled: button.disabled,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      pointerEvents: style.pointerEvents,
      visibleByStyle: style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0,
      visibleByBox: rect.width > 0 && rect.height > 0,
      hit: hitNode ? `${hitNode.nodeName.toLowerCase()}#${hitNode.id || ''}.${String(hitNode.className || '')}` : null,
      hitIsButtonOrChild: Boolean(hitNode && (hitNode === button || button.contains(hitNode))),
      ancestors,
    }
  })
}

async function runScenario() {
  removeDir(PROFILE)
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
  archiveExistingEvidence()
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  const backup = writeLegacyCopy(DATA_DIR)
  let electronApp = null
  let browser = null
  const consoleMessages = []
  const pageErrors = []
  try {
    electronApp = startElectron()
    assert(await waitForCdp(), 'Electron CDP endpoint became available')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    const context = browser.contexts()[0]
    const page = context.pages().find(candidate => candidate.url().includes('index.html')) || context.pages()[0]
    assert(page, 'renderer page is available')
    page.on('console', message => consoleMessages.push(`[${message.type()}] ${message.text()}`))
    page.on('pageerror', error => pageErrors.push(error.message))
    await page.waitForSelector('#app', { timeout: 30_000 })
    await seedApplication(page)

    const candidates = await page.evaluate(projectId =>
      window.electronAPI.outlineJournalLegacyCandidates(projectId), PROJECT_ID)
    assert.equal(candidates.ok, true, 'legacy candidate IPC returns ok')
    assert.equal(candidates.candidates?.length, 1, 'legacy candidate IPC exposes one candidate')
    assert.equal(candidates.candidates[0].messageCount, backup.sourceMessageCount,
      'copied candidate preserves the real D-drive backup message count')
    assert.equal(candidates.candidates[0].projectId, PROJECT_ID, 'candidate belongs to the isolated project')

    await page.waitForSelector('#outline-editor', { timeout: 20_000 })
    await assertActivePanel(page, 'outline-workspace')
    await assertRealClick(page, '#btn-ai-co-create', 'AI co-create toggle')
    await assertActivePanel(page, 'outline-workspace')
    await page.waitForSelector('#ow-chat-input', { timeout: 20_000 })
    await waitForLegacyCandidate(page, backup.sourceMessageCount).catch(async error => {
      const state = await collectState(page)
      const snapshot = await captureButtonDiagnostics(page)
      await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'restore-button-not-attached.png'), fullPage: true })
      error.message = `${error.message}\n[DIAGNOSTIC] state=${JSON.stringify(state)}\n[DIAGNOSTIC] button=${JSON.stringify(snapshot)}`
      throw error
    })
    await assertActivePanel(page, 'outline-workspace')
    await page.waitForSelector('#btn-ow-restore-legacy-chat', { state: 'visible', timeout: 20_000 })
    const buttonDiagnostics = await captureButtonDiagnostics(page)
    if (!buttonDiagnostics.attached) {
      const state = await collectState(page)
      await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'restore-button-not-attached.png'), fullPage: true })
      assert.fail(`restore button is attached\n[DIAGNOSTIC] state=${JSON.stringify(state)}\n[DIAGNOSTIC] button=${JSON.stringify(buttonDiagnostics)}`)
    }
    assert.equal(buttonDiagnostics.attached, true, 'restore button is attached')
    assert.equal(buttonDiagnostics.visibleByStyle, true, 'restore button is not hidden by CSS')
    assert.equal(buttonDiagnostics.visibleByBox, true, 'restore button has a non-zero visible box')

    const before = await collectState(page)
    assert.equal(before.currentProjectId, PROJECT_ID, 'outline workspace uses the seeded project')
    assert.equal(before.candidate?.messageCount, backup.sourceMessageCount, 'UI store sees the real candidate count')
    assert.equal(before.outlineChat.length, CURRENT_MESSAGES.length, 'current journal starts with 1 new message')
    assert(before.restoreButtonExists, 'restore button appears after migration backup detection')
    assert(!before.restoreButtonDisabled, 'restore button is enabled outside generation')
    assert(before.chatInputInteractive, 'chat input is present in the outline workspace')

    await assertRealClick(page, '#btn-ow-restore-legacy-chat', 'restore legacy chat button')
    await page.waitForSelector('.app-confirm-overlay', { timeout: 20_000 })
    await assertRealClick(page, '.app-confirm-overlay .btn-danger', 'restore confirmation button')
    await page.waitForFunction(() => {
      const store = window.__pinia?._s?.get('project')
      return Array.isArray(store?.outlineChat) && store.outlineChat.length > 1
    }, null, { timeout: 20_000, polling: 200 })
    await sleep(500)

    const after = await collectState(page)
    assert.equal(after.outlineChat.length, backup.sourceMessageCount,
      'restore puts every real backup message back into the outline chat')
    assert.equal(after.candidate, null, 'candidate clears after a successful restore')
    assert(!after.restoreButtonExists, 'restore button disappears after restore')
    const snapshot = currentSnapshot(DATA_DIR)
    assert.equal(snapshot.messages.length, backup.sourceMessageCount, 'journal snapshot persists restored messages')
    assert.equal(snapshot.projectId, PROJECT_ID, 'restored snapshot belongs to the isolated project')
    assert(fs.existsSync(backup.target), 'the migration backup file itself remains untouched')

    await assertRealClick(page, '#ow-chat-input', 'outline chat input after restore')
    await page.keyboard.type('恢复后继续讨论第一卷')
    const typed = await page.evaluate(() => document.querySelector('#ow-chat-input')?.value || '')
    assert.equal(typed, '恢复后继续讨论第一卷', 'chat input remains interactively writable after restore')

    const chatBuckets = await page.evaluate(async () => {
      const keys = await window.electronAPI.storageList()
      return keys.filter(key => key.startsWith('wa_chat_')).sort()
    })
    assert(chatBuckets.some(key => key === `wa_chat_${PROJECT_ID}`),
      'the target project chat bucket exists after startup')
    const unrelatedBuckets = chatBuckets.filter(key =>
      key !== `wa_chat_${PROJECT_ID}` && key !== 'wa_chat_default')
    assert.equal(unrelatedBuckets.length, 0,
      `startup does not cross-write another chat project bucket: ${unrelatedBuckets.join(',')}`)
    const chatProjectId = await page.evaluate(() =>
      window.__pinia?._s?.get('chat')?.currentProjectId || null)
    assert.equal(chatProjectId, PROJECT_ID, 'main chat store is bound to the restored project')
    assert(fs.existsSync(backup.source), 'real D-drive backup source still exists')

    const runLog = fs.readFileSync(RUN_LOG_PATH, 'utf8')
    assert(runLog.includes(`dataDir=${DATA_DIR}`), 'Electron used the isolated D-drive-shaped data directory')
    assert(!/storage.*(corrupt|corruption|损坏)/i.test(runLog), 'no storage corruption warning is emitted')
    assert.equal(pageErrors.length, 0, `renderer has no page errors: ${pageErrors.join('; ')}`)

    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'result.json'), JSON.stringify({
      sourceBackup: backup.source,
      sourceMessageCount: backup.sourceMessageCount,
      isolatedBackup: backup.target,
      before,
      after,
      snapshotMessageCount: snapshot.messages.length,
      chatBuckets,
      consoleMessages: consoleMessages.filter(message => /error|failed|restore|legacy/i.test(message)).slice(-30),
      pageErrors,
    }, null, 2), 'utf8')
    console.log(`PASS ${SCRIPT_NAME}: backupMessages=${backup.sourceMessageCount}; restoredMessages=${after.outlineChat.length}; backupRetained=true; chatBuckets=${chatBuckets.join(',')}`)
  } finally {
    await stopElectron(electronApp)
    if (browser) await browser.close().catch(() => undefined)
    removeDir(PROFILE)
  }
}

const watchdog = setTimeout(() => {
  console.error(`[FAIL] global timeout after ${GLOBAL_TIMEOUT_MS}ms`)
  process.exit(1)
}, GLOBAL_TIMEOUT_MS)
watchdog.unref()

assert(fs.existsSync(ELECTRON_EXE), `target executable exists: ${ELECTRON_EXE}`)
assertRendererBuild()
await runScenario()
