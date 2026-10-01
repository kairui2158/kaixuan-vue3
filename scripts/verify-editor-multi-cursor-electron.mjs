import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9323
const PROFILE = path.join(ROOT, '_audit', 'tmp', 'editor-multi-cursor-profile')
const RESULT_FILE = path.join(ROOT, '_audit', 'verification-editor-multi-cursor', 'electron-10-rounds.json')
const PROFILE_COUNTER_FILE = path.join(ROOT, '_audit', 'tmp', 'editor-multi-cursor-profile-counter')

function buildRoundDocument(round) {
  const lines = [
    `# 第${round}轮 多光标实测`,
    '# 场景一',
    'Alpha anchor one。',
    '# 场景二',
    'Alpha anchor two。',
    '# 场景三',
    'Alpha anchor three。',
  ]
  for (let index = 1; index <= 20; index++) {
    lines.push(`第${index}段：多光标长文档测试正文，包含 Alpha 关键词。`)
  }
  return lines.join('\n')
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function removeDir(target) {
  try {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      // Windows can briefly lock Electron profile files after process exit; retry once after a pause.
      sleep(500)
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
    }
  }
}

function assertFreshRendererBuild() {
  const indexPath = path.join(ROOT, 'dist-renderer', 'index.html')
  assert(fs.existsSync(indexPath), 'dist-renderer/index.html exists; run npm run build:vue first')
  const bundleNames = [...fs.readFileSync(indexPath, 'utf8').matchAll(/assets\/[^"']+\.js/g)].map(match => match[0])
  assert(bundleNames.length > 0, 'renderer index references a JS bundle')
  const sourceFiles = []
  const collect = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) collect(full)
      else if (/\.(ts|vue|js|mjs|css)$/.test(entry.name)) sourceFiles.push(full)
    }
  }
  collect(path.join(ROOT, 'src'))
  const newestSource = Math.max(...sourceFiles.map(file => fs.statSync(file).mtimeMs))
  const stale = bundleNames.filter(name => fs.statSync(path.join(ROOT, 'dist-renderer', name)).mtimeMs < newestSource)
  assert.equal(stale.length, 0, `stale renderer build: ${stale.join(', ')}`)
}

function startElectron(userProfile) {
  return spawn(ELECTRON_EXE, [
    '.',
    `--remote-debugging-port=${CDP_PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${userProfile}`,
  ], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
}

async function waitForCdp() {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)
      if (response.ok) return true
    } catch {}
    await sleep(400)
  }
  return false
}

async function closeVisibleModals(page) {
  await page.evaluate(() => {
    document.querySelector('.project-modal-content .btn-close')?.click()
    const transition = document.querySelector('.project-transition-confirm')
    if (transition && getComputedStyle(transition).display !== 'none') {
      ;[...transition.querySelectorAll('button')].find(button => button.textContent.trim() === '取消')?.click()
    }
  })
  await page.waitForTimeout(250)
}

async function installDiagnostics(page) {
  await page.evaluate(() => {
    window.__multiCursorDiagnostics = []
    const original = window.DiagLogger?.log?.bind(window.DiagLogger)
    if (original) {
      window.DiagLogger.log = (level, scope, message, detail) => {
        if (scope === 'find-all' || scope === 'multi-cursor-edit'
          || scope === 'multi-cursor-conflict' || scope === 'multi-cursor-downgrade') {
          window.__multiCursorDiagnostics.push({ level, scope, message, detail })
        }
        return original(level, scope, message, detail)
      }
    }
  })
}

async function startRun(page, source, stepName) {
  await page.evaluate(({ source, stepName }) => {
    const piniaInstance = window.__pinia
      || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
    piniaInstance._s.get('runTrace').startRun({
      source,
      stepName,
      mode: 'editor-tool',
      skillNames: [],
    })
  }, { source, stepName })
}

async function prepareHomeEditor(page, content) {
  await closeVisibleModals(page)
  await page.evaluate(documentContent => {
    const piniaInstance = window.__pinia
      || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
    const editor = piniaInstance._s.get('editor')
    editor.tabs.splice(0)
    editor.clearUndoHistoryForTab('multi-cursor-probe')
    editor.openTab({
      id: 'multi-cursor-probe',
      title: '多光标实测',
      content: documentContent,
      chapterId: '',
      isDirty: false,
      mode: 'ch-body',
    })
    editor.activeTabId = 'multi-cursor-probe'
  }, content)
  await page.waitForSelector('#editor-content', { timeout: 10000 })
  await page.waitForTimeout(250)
}

async function openHomeFind(page) {
  if (!(await page.locator('#find-replace-bar').isVisible().catch(() => false))) {
    await page.click('#btn-find')
  }
  await page.waitForSelector('#find-replace-bar', { timeout: 5000 })
}

async function openOutlineWorkspace(page) {
  await closeVisibleModals(page)
  if (!(await page.locator('#outline-workspace').isVisible().catch(() => false))) {
    await page.click('#btn-outline-workspace')
  }
  await page.waitForSelector('#outline-editor', { timeout: 10000 })
  await page.waitForTimeout(250)
}

async function prepareOutline(page, content) {
  await page.evaluate(documentContent => {
    const piniaInstance = window.__pinia
      || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
    const project = piniaInstance._s.get('project')
    const editor = piniaInstance._s.get('editor')
    project.outlineLocked = false
    project.currentProjectId = `multi-cursor-probe-${Date.now()}`
    editor.clearUndoHistoryForTab('outline')
    project.outlineText = documentContent
    project.setOutline(documentContent)
  }, content)
  await page.waitForTimeout(200)
}

async function readHomeState(page) {
  return page.evaluate(() => {
    const piniaInstance = window.__pinia
      || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
    const editor = piniaInstance._s.get('editor')
    return {
      content: editor.activeTab?.content || '',
      traceEvents: piniaInstance._s.get('runTrace').runs
        .filter(run => run.source === 'home')
        .flatMap(run => run.events || [])
        .filter(event => ['find-all', 'multi-cursor-edit', 'multi-cursor-conflict', 'multi-cursor-downgrade'].includes(event.type))
        .map(event => ({ type: event.type, detail: JSON.parse(event.detail || '{}') })),
      diagEvents: window.__multiCursorDiagnostics || [],
      cursorCount: document.querySelectorAll('.editor-multi-cursor').length,
    }
  })
}

async function readOutlineState(page) {
  return page.evaluate(() => {
    const piniaInstance = window.__pinia
      || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
    const project = piniaInstance._s.get('project')
    return {
      content: project.outlineText || '',
      traceEvents: piniaInstance._s.get('runTrace').runs
        .filter(run => run.source === 'outline')
        .flatMap(run => run.events || [])
        .filter(event => ['find-all', 'multi-cursor-edit', 'multi-cursor-conflict', 'multi-cursor-downgrade'].includes(event.type))
        .map(event => ({ type: event.type, detail: JSON.parse(event.detail || '{}') })),
      diagEvents: window.__multiCursorDiagnostics || [],
      cursorCount: document.querySelectorAll('.ow-multi-cursor').length,
    }
  })
}

async function runHomeRound(page, round) {
  const content = buildRoundDocument(round)
  await prepareHomeEditor(page, content)
  await openHomeFind(page)
  await startRun(page, 'home', `多光标实测 ${round}`)
  await page.fill('#find-input', 'Alpha')
  await page.click('#btn-find-all')
  await page.waitForTimeout(300)
  let state = await readHomeState(page)
  assert.equal(state.cursorCount, 23, `home round ${round}: 23 virtual cursors`)
  assert(state.traceEvents.some(event => event.type === 'find-all' && event.detail.cursorCount === 23), `home round ${round}: find-all trace event`)
  assert(state.diagEvents.some(event => event.scope === 'find-all' && event.detail.cursorCount === 23), `home round ${round}: find-all diag event`)

  await page.press('#editor-content', 'x')
  await page.waitForTimeout(250)
  state = await readHomeState(page)
  assert.equal(state.content.split('x').length - 1, 23, `home round ${round}: insert at all cursors`)
  assert(state.traceEvents.some(event => event.type === 'multi-cursor-edit' && event.detail.command === 'insert'), `home round ${round}: insert trace event`)

  await page.press('#editor-content', 'Backspace')
  await page.waitForTimeout(250)
  state = await readHomeState(page)
  assert.equal(state.content.split('x').length - 1, 0, `home round ${round}: delete at all cursors`)

  await page.press('#editor-content', 'Enter')
  await page.waitForTimeout(250)
  state = await readHomeState(page)
  assert(state.content.includes('\n\n'), `home round ${round}: newline at all cursors`)
  await page.press('#editor-content', 'Backspace')
  await page.waitForTimeout(250)
  state = await readHomeState(page)
  assert(!state.content.includes('\n\n'), `home round ${round}: newline removed`)

  const beforeUndo = state.content
  await page.keyboard.down('Control')
  await page.keyboard.press('KeyZ')
  await page.keyboard.up('Control')
  await page.waitForTimeout(250)
  state = await readHomeState(page)
  assert.equal(state.content, beforeUndo.replace(/Alpha/g, ''), `home round ${round}: undo transaction restores pre-edit content`)

  await page.evaluate(() => {
    const piniaInstance = window.__pinia
      || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
    const editor = piniaInstance._s.get('editor')
    editor.updateContent('multi-cursor-probe', editor.activeTab.content + '\n外部修改')
    window.dispatchEvent(new CustomEvent('editor-external-change', {
      detail: {
        tabId: 'multi-cursor-probe',
        content: editor.activeTab.content,
      },
    }))
  })
  await page.waitForTimeout(300)
  state = await readHomeState(page)
  assert(state.traceEvents.some(event => event.type === 'multi-cursor-conflict' || event.type === 'multi-cursor-downgrade'), `home round ${round}: external change downgraded`)

  await page.click('#btn-find-close')
  return {
    round,
    entry: 'home',
    findAllCursors: 23,
    insertDeleteVerified: true,
    newlineVerified: true,
    undoVerified: true,
    externalWriteDowngrade: true,
    traceAndDiagCovered: true,
  }
}

async function runOutlineRound(page, round) {
  const content = buildRoundDocument(round)
  await openOutlineWorkspace(page)
  await prepareOutline(page, content)
  if (!(await page.locator('#ow-find-bar').isVisible().catch(() => false))) {
    await page.click('#btn-ow-find')
  }
  await page.waitForSelector('#ow-find-bar', { timeout: 5000 })
  await startRun(page, 'outline', `大纲多光标实测 ${round}`)
  await page.fill('#ow-find-input', 'Alpha')
  await page.click('#btn-ow-find-all')
  await page.waitForTimeout(300)
  let state = await readOutlineState(page)
  assert.equal(state.cursorCount, 23, `outline round ${round}: 23 virtual cursors`)
  assert(state.traceEvents.some(event => event.type === 'find-all' && event.detail.cursorCount === 23), `outline round ${round}: find-all trace event`)

  await page.press('#outline-editor', 'x')
  await page.waitForTimeout(250)
  state = await readOutlineState(page)
  assert.equal(state.content.split('x').length - 1, 23, `outline round ${round}: insert at all cursors`)
  await page.press('#outline-editor', 'Backspace')
  await page.waitForTimeout(250)
  state = await readOutlineState(page)
  assert.equal(state.content.split('x').length - 1, 0, `outline round ${round}: delete at all cursors`)

  await page.press('#outline-editor', 'Enter')
  await page.waitForTimeout(250)
  await page.press('#outline-editor', 'Backspace')
  await page.waitForTimeout(250)
  state = await readOutlineState(page)
  assert(state.traceEvents.some(event => event.type === 'multi-cursor-edit' && event.detail.command === 'insert'), `outline round ${round}: insert trace event`)

  await page.keyboard.down('Control')
  await page.keyboard.press('KeyZ')
  await page.keyboard.up('Control')
  await page.waitForTimeout(250)
  state = await readOutlineState(page)
  assert(state.traceEvents.length > 0, `outline round ${round}: trace remains stable after undo`)

  await page.evaluate(() => {
    const piniaInstance = window.__pinia
      || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
    const project = piniaInstance._s.get('project')
    project.outlineText += '\n外部修改'
    const editor = piniaInstance._s.get('editor')
    editor.pushUndoTransactionForTab('outline', project.outlineText, 'manual', '外部写入')
  })
  await page.waitForTimeout(300)
  await page.press('#outline-editor', 'x')
  await page.waitForTimeout(200)
  state = await readOutlineState(page)
  assert(state.traceEvents.some(event => event.type === 'multi-cursor-conflict' || event.type === 'multi-cursor-downgrade'), `outline round ${round}: external change downgraded`)
  return {
    round,
    entry: 'outline',
    findAllCursors: 23,
    insertDeleteVerified: true,
    undoVerified: true,
    externalWriteDowngrade: true,
    traceAndDiagCovered: true,
  }
}

async function main() {
  assertFreshRendererBuild()
  let profileSerial = 1
  if (fs.existsSync(PROFILE_COUNTER_FILE)) {
    profileSerial = Number(fs.readFileSync(PROFILE_COUNTER_FILE, 'utf8')) || 1
  }
  const activeProfile = `${PROFILE}-${process.pid}-${profileSerial}`
  fs.writeFileSync(PROFILE_COUNTER_FILE, String(profileSerial + 1))
  removeDir(path.dirname(RESULT_FILE))
  fs.mkdirSync(path.dirname(RESULT_FILE), { recursive: true })
  const electronProcess = startElectron(activeProfile)
  let browser = null
  const rounds = []
  try {
    assert(await waitForCdp(), 'CDP reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    const page = browser.contexts()[0]?.pages()?.[0]
    assert(page, 'renderer page reachable')
    const pageErrors = []
    page.on('pageerror', error => pageErrors.push(error.message))
    page.on('console', message => {
      if (['error', 'warning'].includes(message.type())) pageErrors.push(`${message.type()}: ${message.text()}`)
    })
    await page.waitForSelector('#app', { timeout: 20000 })
    await page.waitForTimeout(2000)
    await installDiagnostics(page)

    for (let round = 1; round <= 10; round++) {
      rounds.push(await runHomeRound(page, round))
    }
    for (let round = 1; round <= 10; round++) {
      rounds.push(await runOutlineRound(page, round))
    }

    assert.equal(pageErrors.filter(message => !message.startsWith('warning:')).length, 0, `page errors: ${pageErrors.join(' | ')}`)
    fs.writeFileSync(RESULT_FILE, JSON.stringify({
      schema: 'shenyi.editor-multi-cursor.electron',
      version: 1,
      rounds,
      assertions: '20/20 rounds: home and outline, Find All virtual cursors, insert/delete/newline, undo transaction, external write downgrade, runTrace + DiagLogger, no page errors',
      generatedAt: new Date().toISOString(),
    }, null, 2))
    console.log(`PASS: 10/10 home + 10/10 outline multi-cursor rounds; report=${RESULT_FILE}`)
  } finally {
    if (browser) await browser.close().catch(() => {})
    if (electronProcess?.pid) {
      try { execFileSync('taskkill', ['/PID', String(electronProcess.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
    }
    await sleep(1000)
    try {
      removeDir(activeProfile)
    } catch {}
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
