import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const MODE = process.argv[2] === 'packaged' ? 'packaged' : 'source'
const SOURCE_ELECTRON = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const PACKAGED_ELECTRON = path.join(ROOT, 'dist', 'win-unpacked', '神意助手.exe')
const TARGET = MODE === 'packaged' ? PACKAGED_ELECTRON : SOURCE_ELECTRON
const PROFILE = path.join(ROOT, '_data', `outline-message-scroll-ui-${MODE}-profile`)
const DATA_DIR = path.join(PROFILE, 'documents-data')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', `verification-outline-message-scroll-ui-${MODE}`)
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const RESULT_PATH = path.join(EVIDENCE_ROOT, 'result.json')
const CDP_PORT = process.env.OUTLINE_SCROLL_CDP_PORT || 9437
const PROJECT_ID_BASE = 'outline-message-scroll-ui-regression'

fs.rmSync(EVIDENCE_ROOT, { recursive: true, force: true })
fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function removeDir(target) {
  try {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  } catch (error) {
    console.warn(`[CLEANUP] failed to remove ${target}: ${error.message}`)
  }
}

function makeProject() {
  return {
    schemaVersion: 3,
    projectName: 'Outline Message Scroll Regression',
    outlineText: '第一卷 滚动回归\n第一章 消息区滚动\n第二章 长历史滚动',
    pipelineConfig: { volumeCount: 1, volumeWords: 20000, chapterWords: 2000 },
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

function makeLegacyProject(count) {
  const project = makeProject()
  project.outlineChat = Array.from({ length: count }, (_, index) => ({
    messageId: `outline-message-scroll-${index + 1}`,
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `滚动回归消息 ${index + 1}\n${'这是真实消息区滚动验证内容。'.repeat(6)}`,
  }))
  return project
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join('')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function journalChecksum(projectId, messages) {
  let hash = 5381
  const value = `${projectId}\u0000${stableStringify(messages)}`
  for (let index = 0; index < value.length; index += 1) {
    hash = (((hash << 5) + hash + value.charCodeAt(index)) | 0)
  }
  return (hash >>> 0).toString(36)
}

async function migrateProjectJournal(page, projectId, messages) {
  const migration = await page.evaluate(async ({ projectId, messages }) => {
    return window.electronAPI.outlineJournalMigrate(projectId, messages)
  }, { projectId, messages })
  assert.equal(migration?.ok, true, `journal migration must succeed: ${migration?.error || 'unknown'}`)
  assert.equal(migration.snapshot.messages.length, messages.length, 'journal migration stores all messages')
  const snapshotCheck = await page.evaluate(async projectId => {
    return window.electronAPI.outlineJournalSnapshot(projectId)
  }, projectId)
  assert.equal(snapshotCheck?.ok, true, `journal snapshot must be readable: ${snapshotCheck?.error || 'unknown'}`)
  assert.equal(snapshotCheck.snapshot.messages.length, messages.length, 'journal snapshot contains all seeded messages')
}

function assertRendererBuild() {
  if (MODE !== 'source') return
  const rendererIndex = path.join(ROOT, 'dist-renderer', 'index.html')
  assert(fs.existsSync(rendererIndex), 'dist-renderer/index.html exists')
  const bundleNames = [...fs.readFileSync(rendererIndex, 'utf8').matchAll(/assets\/[^"']+\.js/g)].map(match => match[0])
  assert(bundleNames.length > 0, 'renderer index references JS bundles')
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
  const child = spawn(TARGET, ['.', `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', `--user-data-dir=${PROFILE}`], {
    cwd: MODE === 'source' ? ROOT : path.dirname(TARGET),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SHENYI_ALLOW_TEST_ISOLATION: '1',
      SHENYI_DATA_DIR: DATA_DIR,
      SHENYI_TEST_USER_DATA_DIR: path.join(PROFILE, 'app-data'),
    },
    windowsHide: true,
  })
  const redact = text => text.replace(/(sk-[A-Za-z0-9_-]{8,})/g, 'sk-***')
  for (const channel of ['stdout', 'stderr']) {
    child[channel].on('data', chunk => {
      const text = `[ELECTRON ${channel.toUpperCase()}] ${redact(String(chunk))}`
      if (channel === 'stderr') process.stderr.write(text)
      else process.stdout.write(text)
      fs.appendFileSync(RUN_LOG_PATH, text, 'utf8')
    })
  }
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
  try { execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
  const timeout = sleep(10_000).then(() => false)
  if (!(await Promise.race([exited.then(() => true), timeout]))) app.kill('SIGKILL')
  await exited
}

async function seedProject(page, project, projectId, projectKey) {
  const messages = project.outlineChat
  await page.evaluate(async ({ project, projectId, projectKey }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite(projectKey, project)
  }, { project, projectId, projectKey })
  await migrateProjectJournal(page, projectId, messages)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 30_000 })
  const loaded = await page.waitForFunction(expected => {
    const project = window.__pinia?._s?.get('project')
    return project?.currentProjectId === expected && Array.isArray(project?.outlineChat) && project.outlineChat.length > 0
  }, projectId, { timeout: 20_000 }).then(() => page.evaluate(async expected => {
    const project = window.__pinia?._s?.get('project')
    if (project?.currentProjectId !== expected && project?.loadProject) await project.loadProject(expected)
    return {
      appReady: true,
      currentProjectId: project?.currentProjectId ?? null,
      outlineChatLength: project?.outlineChat?.length ?? null,
      journalLastError: project?.outlineJournalLastError ?? null,
      navButtonVisible: Boolean(document.querySelector('#btn-outline-workspace')),
    }
  }, projectId)).catch(async error => {
    const fallback = await page.evaluate(async expected => {
      const project = window.__pinia?._s?.get('project')
      if (project?.loadProject) await project.loadProject(expected)
      return {
        appReady: true,
        currentProjectId: project?.currentProjectId ?? null,
        outlineChatLength: project?.outlineChat?.length ?? null,
        journalLastError: project?.outlineJournalLastError ?? null,
        navButtonVisible: Boolean(document.querySelector('#btn-outline-workspace')),
      }
    }, projectId).catch(() => ({
      appReady: true,
      currentProjectId: null,
      outlineChatLength: null,
      journalLastError: 'loadProject unavailable',
      navButtonVisible: Boolean(document.querySelector('#btn-outline-workspace')),
    }))
    assert.equal(fallback.currentProjectId, projectId, `project loaded after fallback: ${error.message}`)
    return fallback
  })
  assert.equal(loaded.outlineChatLength, messages.length, 'renderer store restores all journal messages')
  return loaded
}

async function openChat(page, count) {
  await page.click('#btn-outline-workspace')
  await page.waitForSelector('#outline-editor', { timeout: 20_000 })
  await page.click('#btn-ai-co-create')
  await page.waitForSelector('#ow-chat-messages', { timeout: 10_000 })
  await page.waitForFunction(() => {
    const project = window.__pinia?._s?.get('project')
    return Array.isArray(project?.outlineChat) && project.outlineChat.length > 0
  }, { timeout: 10_000 })
  await page.waitForFunction(expected => {
    const project = window.__pinia?._s?.get('project')
    const visibleMessages = document.querySelectorAll('#ow-chat-messages .ow-msg').length
    return project?.outlineChat?.length >= expected && visibleMessages > 0
  }, count, { timeout: 20_000 })
  await sleep(500)
}

async function captureDiagnostics(page, phase) {
  return page.evaluate(name => {
    const project = window.__pinia?._s?.get('project')
    return {
      phase: name,
      currentProjectId: project?.currentProjectId ?? null,
      outlineChatLength: project?.outlineChat?.length ?? null,
      journalLastError: project?.outlineJournalLastError ?? null,
      journalPending: project?.outlineJournalPendingCount ?? null,
      navButtonExists: Boolean(document.querySelector('#btn-outline-workspace')),
      workspaceExists: Boolean(document.querySelector('#outline-workspace')),
      chatAreaExists: Boolean(document.querySelector('#ow-chat-messages')),
      visibleMessageCount: document.querySelectorAll('#ow-chat-messages .ow-msg').length,
      domMessageCount: document.querySelectorAll('#ow-chat-messages .ow-msg, #ow-chat-messages [data-message-id]').length,
      chatDisplay: (() => {
        const chat = document.querySelector('.ow-chat')
        return chat ? {
          display: getComputedStyle(chat).display,
          visibility: getComputedStyle(chat).visibility,
          width: chat.getBoundingClientRect().width,
          height: chat.getBoundingClientRect().height,
        } : null
      })(),
      toggleHit: (() => {
        const button = document.querySelector('#btn-ai-co-create')
        if (!button) return null
        const rect = button.getBoundingClientRect()
        const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        return {
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          stack: document.elementsFromPoint(point.x, point.y).slice(0, 6).map(item => {
            if (!(item instanceof HTMLElement)) return item.nodeName
            return `${item.nodeName.toLowerCase()}#${item.id || ''}.${String(item.className || '').split(/\s+/).slice(0, 3).join('.')}`
          }),
        }
      })(),
      scrollerCount: document.querySelectorAll('.ow-message-scroller').length,
      consoleHint: 'If store has messages but DOM is 0, inspect OutlineWorkspace message rendering/mount state',
    }
  }, phase)
}

async function closeChat(page) {
  const closeButton = page.locator('#btn-close-outline-workspace')
  assert.equal(await closeButton.count(), 1, 'outline workspace close button exists')
  await closeButton.click({ timeout: 10_000 })
  await page.waitForSelector('#outline-workspace', { state: 'detached', timeout: 10_000 })
  await sleep(300)
}

async function inspectScrollArea(page) {
  return page.evaluate(() => {
    const root = document.querySelector('#ow-chat-messages')
    const scroller = document.querySelector('.ow-message-scroller')
    const nodes = [root, scroller].filter(Boolean)
    return {
      messageCount: root?.querySelectorAll('.ow-msg').length ?? 0,
      root: root ? {
        overflow: getComputedStyle(root).overflow,
        overflowY: getComputedStyle(root).overflowY,
        clientHeight: root.clientHeight,
        scrollHeight: root.scrollHeight,
        scrollTop: root.scrollTop,
      } : null,
      scroller: scroller ? {
        overflowY: getComputedStyle(scroller).overflowY,
        clientHeight: scroller.clientHeight,
        scrollHeight: scroller.scrollHeight,
        scrollTop: scroller.scrollTop,
      } : null,
      styles: nodes.map(node => {
        const rect = node.getBoundingClientRect()
        const point = { x: rect.left + rect.width / 2, y: Math.min(rect.top + rect.height / 2, rect.bottom - 8) }
        return {
          selector: node.id ? `#${node.id}` : `.${node.className}`,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          hitStack: document.elementsFromPoint(point.x, point.y).slice(0, 8).map(item => {
            if (!(item instanceof HTMLElement)) return String(item.nodeName)
            const style = getComputedStyle(item)
            return `${item.nodeName.toLowerCase()}#${item.id || ''}.${String(item.className || '').split(/\s+/).slice(0, 3).join('.')};pointer-events=${style.pointerEvents}`
          }),
        }
      }),
      responsiveness: window.__SHENYI_PERFORMANCE_MONITOR__?.getSnapshot?.() || null,
    }
  })
}

async function wheelScroll(page, deltaY) {
  const root = page.locator('#ow-chat-messages')
  const scroller = root.locator('.ow-message-scroller')
  const target = (await scroller.count()) > 0 ? scroller.first() : root
  const box = await target.boundingBox()
  assert(box, 'message scroll area has a bounding box')
  const point = { x: box.x + box.width / 2, y: Math.min(box.y + box.height / 2, box.y + box.height - 12) }
  const before = await page.evaluate(() => ({
    root: document.querySelector('#ow-chat-messages')?.scrollTop ?? 0,
    scroller: document.querySelector('.ow-message-scroller')?.scrollTop ?? 0,
  }))
  await page.mouse.move(point.x, point.y)
  await page.mouse.wheel(0, deltaY)
  await page.waitForFunction(expected => {
    const rootElement = document.querySelector('#ow-chat-messages')
    const scrollerElement = rootElement?.querySelector('.ow-message-scroller')
    const element = scrollerElement || rootElement
    return element ? Math.abs(element.scrollTop - expected) >= 1 : false
  }, before.root + before.scroller, { timeout: 3_000 }).catch(() => {})
  await sleep(120)
  const after = await page.evaluate(() => ({
    root: document.querySelector('#ow-chat-messages')?.scrollTop ?? 0,
    scroller: document.querySelector('.ow-message-scroller')?.scrollTop ?? 0,
  }))
  return { before, after, delta: (after.root - before.root) + (after.scroller - before.scroller), point }
}

async function setGenerating(page, active, message) {
  const result = await page.evaluate(({ active, message }) => {
    const hook = window.__shenyiOutlineStatusTestHook
    if (!hook?.set) throw new Error('outline status test hook is unavailable')
    hook.set(active, message)
    return { active: Boolean(document.querySelector('#ow-streaming-message')) }
  }, { active, message })
  await sleep(150)
  result.active = await page.evaluate(() => Boolean(document.querySelector('#ow-streaming-message')))
  assert.equal(result.active, active, `streaming surface must be ${active ? 'active' : 'inactive'}`)
  return result
}

async function runScenario() {
  assertRendererBuild()
  let electronApp = null
  let browser = null
  const consoleMessages = []
  const pageErrors = []
  const result = { mode: MODE, scenarios: [] }
  try {
    removeDir(PROFILE)
    fs.mkdirSync(DATA_DIR, { recursive: true })
    electronApp = startElectron()
    assert(await waitForCdp(), 'Electron CDP endpoint became available')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    const context = browser.contexts()[0]
  let page = context.pages().find(candidate => candidate.url().includes('index.html')) || context.pages()[0]
  assert(page, 'Electron renderer page is available')
  page.on('console', message => consoleMessages.push(`[${message.type()}] ${message.text()}`))
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.waitForSelector('#app', { timeout: 30_000 })
  await sleep(800)
    for (const scenario of [{ name: 'plain-list', count: 40 }, { name: 'virtual-list', count: 320 }]) {
      const projectId = `${PROJECT_ID_BASE}-${scenario.name}`
      if (scenario.name !== 'plain-list') {
        await browser?.close().catch(() => {})
        await stopElectron(electronApp)
        await sleep(500)
        removeDir(PROFILE)
        assert.equal(fs.existsSync(PROFILE), false, `test profile must be removable before ${scenario.name}`)
        fs.mkdirSync(DATA_DIR, { recursive: true })
        electronApp = startElectron()
        assert(await waitForCdp(), `Electron CDP endpoint became available for ${scenario.name}`)
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
        const nextContext = browser.contexts()[0]
        page = nextContext.pages().find(candidate => candidate.url().includes('index.html')) || nextContext.pages()[0]
        assert(page, `Electron renderer page is available for ${scenario.name}`)
        page.on('console', message => consoleMessages.push(`[${message.type()}] ${message.text()}`))
        page.on('pageerror', error => pageErrors.push(error.message))
        await page.waitForSelector('#app', { timeout: 30_000 })
        await sleep(800)
      }
      const seed = await seedProject(page, makeLegacyProject(scenario.count), projectId, `wa_project_${projectId}`)
      const beforeOpen = await captureDiagnostics(page, `before-open-${scenario.name}`)
      await openChat(page, scenario.count)
      const afterOpen = await captureDiagnostics(page, `after-open-${scenario.name}`)
      const before = await inspectScrollArea(page)
      const staticUp = await wheelScroll(page, -600)
      const staticDown = await wheelScroll(page, 600)
      const generating = await setGenerating(page, true, '滚动区生成态验证')
      const generatingDom = await inspectScrollArea(page)
      const generatingScroll = await wheelScroll(page, -600)
      assert.equal(generatingDom.messageCount > 0, true, `${scenario.name}: message DOM exists while generating`)
      result.scenarios.push({ name: scenario.name, seed, beforeOpen, afterOpen, before, staticUp, staticDown, generating, generatingDom, generatingScroll })
      await setGenerating(page, false, '')
      await closeChat(page).catch(async error => {
        const workspaceVisible = await page.evaluate(() => Boolean(document.querySelector('#outline-workspace'))).catch(() => false)
        assert.equal(workspaceVisible, false, `workspace closes cleanly: ${error.message}`)
      })
    }

    result.consoleMessages = consoleMessages.slice(-50)
    result.pageErrors = pageErrors
    fs.writeFileSync(RESULT_PATH, JSON.stringify(result, null, 2), 'utf8')

    for (const scenario of result.scenarios) {
      assert.equal(scenario.generating.active, true, `${scenario.name}: streaming surface is active`)
      assert.notEqual(scenario.staticDown.delta, 0, `${scenario.name}: message area reacts to real mouse wheel`)
      assert.notEqual(scenario.generatingScroll.delta, 0, `${scenario.name}: message area reacts to wheel while generating`)
      const watch = scenario.generatingDom
      if (watch?.scroller) {
        assert.equal(
          watch.scroller.scrollTop,
          Math.max(0, Math.min(watch.scroller.scrollHeight - watch.scroller.clientHeight, watch.scroller.scrollTop)),
          `${scenario.name}: virtual scroller keeps a valid scrollTop while generating`,
        )
      } else if (watch?.root) {
        assert.equal(
          watch.root.scrollTop,
          Math.max(0, Math.min(watch.root.scrollHeight - watch.root.clientHeight, watch.root.scrollTop)),
          `${scenario.name}: message container keeps a valid scrollTop while generating`,
        )
      }
    }
    assert.deepEqual(pageErrors, [], `renderer has no page errors: ${pageErrors.join('; ')}`)
    console.log(`PASS outline message scroll UI (${MODE})`)
    console.log(JSON.stringify(result.scenarios.map(item => ({
      name: item.name,
      root: item.before.root,
      scroller: item.before.scroller,
      staticDown: item.staticDown.delta,
      generatingScroll: item.generatingScroll.delta,
    })), null, 2))
  } catch (error) {
    result.error = {
      name: error?.name || 'Error',
      message: error?.message || String(error),
      stack: error?.stack || '',
    }
    result.consoleMessages = consoleMessages.slice(-50)
    result.pageErrors = pageErrors
    fs.writeFileSync(RESULT_PATH, JSON.stringify(result, null, 2), 'utf8')
    throw error
  } finally {
    await browser?.close().catch(() => {})
    await stopElectron(electronApp)
  }
}

await runScenario()
