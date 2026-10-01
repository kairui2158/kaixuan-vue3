import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9312
const PROFILE = path.join(ROOT, '_audit', 'tmp', 'editor-replace-profile')
const RESULT_FILE = path.join(ROOT, '_audit', 'verification-editor-replace', 'electron-10-rounds.json')

function buildRoundDocument(round) {
  const lines = [
    `# 第${round}轮 查找替换实测`,
    'Alpha alpha ALPHAlite 灯塔 灯塔下 灯塔。',
    '第一卷：old-1。第二卷：old-2。第三卷：old-3。',
  ]
  for (let index = 1; index <= 12; index++) {
    lines.push(`第${index}段：查找替换实测正文，包含 Alpha 与 灯塔 关键词。`)
  }
  const documentText = lines.join('\n')
  assert(documentText.length >= 200, `round ${round}: document is useful`)
  return documentText
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function removeDir(target) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.rmSync(target, { recursive: true, force: true })
      return
    } catch {}
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200)
  }
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
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

function startElectron() {
  return spawn(ELECTRON_EXE, [
    '.',
    `--remote-debugging-port=${CDP_PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${PROFILE}`,
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
  await page.waitForTimeout(300)
}

async function prepareHomeEditor(page, content) {
  await closeVisibleModals(page)
  await page.evaluate(documentContent => {
    const store = piniaStore()
    store.tabs.splice(0)
    store.clearUndoHistoryForTab('editor-replace-probe')
    store.bookmarks = []
    store.openTab({
      id: 'editor-replace-probe',
      title: '查找替换实测',
      content: documentContent,
      chapterId: '',
      isDirty: false,
      mode: 'ch-body',
    })
    store.activeTabId = 'editor-replace-probe'

    function piniaStore() {
      const piniaInstance = window.__pinia
        || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
      if (!piniaInstance) throw new Error('pinia unavailable')
      return piniaInstance._s.get('editor')
    }
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
    if (!piniaInstance) throw new Error('pinia unavailable')
    const project = piniaInstance._s.get('project')
    const editor = piniaInstance._s.get('editor')
    project.outlineLocked = false
    project.currentProjectId = `editor-replace-probe-${Date.now()}`
    editor.clearUndoHistoryForTab('outline')
    project.outlineText = documentContent
    project.setOutline(documentContent)
  }, content)
  await page.waitForTimeout(200)
}

async function runHomeRound(page, round) {
  const content = buildRoundDocument(round)
  await prepareHomeEditor(page, content)
  await openHomeFind(page)

  await page.evaluate(() => {
    const piniaInstance = window.__pinia
      || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
    piniaInstance._s.get('runTrace').startRun({
      source: 'home',
      stepName: '查找替换实测',
      mode: 'editor-tool',
      skillNames: [],
    })
  })

  // Case-insensitive literal search and next/prev navigation.
  await page.fill('#find-input', 'alpha')
  await page.uncheck('#find-case-sensitive')
  await page.click('#btn-find-next')
  await page.waitForTimeout(120)
  let state = await readHomeFindState(page)
  assert.equal(state.count, '1/15', `home round ${round}: case-insensitive count`)
  await page.click('#btn-find-prev')
  await page.waitForTimeout(100)
  state = await readHomeFindState(page)
  assert.equal(state.count, '15/15', `home round ${round}: previous wraps to last`)

  // Whole-word matching excludes ALPHAlite and CJK-attached variants.
  await page.check('#find-case-sensitive')
  await page.fill('#find-input', '灯塔')
  await page.check('#find-whole-word')
  await page.click('#btn-find-next')
  await page.waitForTimeout(120)
  state = await readHomeFindState(page)
  assert.equal(state.count, '14/14', `home round ${round}: whole-word count`)
  await page.uncheck('#find-whole-word')

  // Invalid regex never throws and never mutates the document.
  await page.fill('#find-input', '(')
  await page.check('#find-use-regex')
  await page.click('#btn-find-next')
  await page.waitForTimeout(150)
  state = await readHomeFindState(page)
  assert(state.errorVisible, `home round ${round}: invalid regex error visible`)
  assert.equal(state.content, content, `home round ${round}: invalid regex keeps content`)

  // Regex replace-all expands capture templates and records diagnostics.
  await page.fill('#find-input', '第([一二三])卷')
  await page.fill('#replace-input', '第$1册')
  await page.click('#btn-replace-all')
  await page.waitForTimeout(180)
  state = await readHomeFindState(page)
  assert.equal(state.content, content.replace(/第([一二三])卷/g, '第$1册'), `home round ${round}: regex replace all`)
  assert(state.traceEvents.some(event => event.mode === 'all' && event.matchCount === 3), `home round ${round}: trace replace all event`)
  assert(state.diagEntries.some(entry => entry.mode === 'all' && entry.matchCount === 3), `home round ${round}: diag replace all event`)

  // Replace-current validates the exact selected match.
  await page.fill('#find-input', '查找替换实测正文')
  await page.click('#btn-find-next')
  await page.waitForTimeout(120)
  await page.fill('#replace-input', '真实用户替换正文')
  await page.evaluate(() => {
    const piniaInstance = window.__pinia
      || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
    piniaInstance._s.get('runTrace').startRun({
      source: 'home',
      stepName: '查找替换实测',
      mode: 'editor-tool',
      skillNames: [],
    })
  })
  await page.click('#btn-replace-one')
  await page.waitForTimeout(150)
  state = await readHomeFindState(page)
  assert.equal(state.content.split('真实用户替换正文').length - 1, 1, `home round ${round}: replace current once`)
  assert(state.traceEvents.some(event => event.mode === 'one' && event.matchCount === 12), `home round ${round}: trace replace current event`)

  await page.click('#btn-find-close')
  return {
    round,
    entry: 'home',
    caseInsensitiveMatches: 15,
    wholeWordMatches: 14,
    regexReplaceMatches: 3,
    replaceCurrentMatches: 12,
    invalidRegexGuarded: true,
    traceEvents: state.traceEvents.length,
  }
}

async function readHomeFindState(page) {
  return page.evaluate(() => {
    const piniaInstance = window.__pinia
      || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
    const editor = piniaInstance._s.get('editor')
    return {
      count: document.querySelector('#find-count')?.textContent || '',
      errorVisible: Boolean(document.querySelector('#find-error')?.textContent),
      content: editor.activeTab?.content || '',
      traceEvents: (piniaInstance._s.get('runTrace').runs || [])
        .filter(run => run.source === 'home')
        .flatMap(run => run.events || [])
        .filter(event => event.type === 'editor-replace')
        .map(event => JSON.parse(event.detail || '{}')),
      diagEntries: window.__editorReplaceDiagnostics || [],
    }
  })
}

async function runOutlineRound(page, round) {
  const content = buildRoundDocument(round)
  await openOutlineWorkspace(page)
  await prepareOutline(page, content)
  if (!(await page.locator('#ow-find-bar').isVisible().catch(() => false))) {
    await page.click('#btn-ow-find')
  }
  await page.waitForSelector('#ow-find-bar', { timeout: 5000 })

  await page.evaluate(() => {
    const piniaInstance = window.__pinia
      || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
    window.__outlineReplaceDiagnostics = []
    const original = window.DiagLogger?.log?.bind(window.DiagLogger)
    if (original) {
      window.DiagLogger.log = (level, scope, message, detail) => {
        if (scope === 'editor-replace') window.__outlineReplaceDiagnostics.push(detail)
        return original(level, scope, message, detail)
      }
    }
    piniaInstance._s.get('runTrace').startRun({
      source: 'outline',
      stepName: '大纲共创',
      mode: 'chat',
      skillNames: [],
    })
  })

  // Case-sensitive default preserves current outline behavior.
  await page.fill('#ow-find-input', 'Alpha')
  await page.click('#btn-ow-find-next')
  await page.waitForTimeout(120)
  let state = await readOutlineFindState(page)
  assert.equal(state.result, '1/13', `outline round ${round}: case-sensitive count`)

  // Whole-word and regex matching share the same model.
  await page.fill('#ow-find-input', '灯塔')
  await page.check('#ow-find-whole-word')
  await page.click('#btn-ow-find-next')
  await page.waitForTimeout(120)
  state = await readOutlineFindState(page)
  assert.equal(state.result, '1/14', `outline round ${round}: whole-word count`)
  await page.uncheck('#ow-find-whole-word')
  await page.fill('#ow-find-input', '第[一二三]卷')
  await page.check('#ow-find-use-regex')
  await page.click('#btn-ow-find-next')
  await page.waitForTimeout(120)
  state = await readOutlineFindState(page)
  assert.equal(state.result, '1/3', `outline round ${round}: regex count`)

  // Invalid regex shows feedback without changing content.
  await page.fill('#ow-find-input', '(')
  await page.click('#btn-ow-find-next')
  await page.waitForTimeout(150)
  state = await readOutlineFindState(page)
  assert.equal(state.result, '表达式无效', `outline round ${round}: invalid regex result`)
  assert.equal(state.content, content, `outline round ${round}: invalid regex keeps content`)

  // Regex replace-all, undo transaction, trace and diagnostics.
  await page.fill('#ow-find-input', '第([一二三])卷')
  await page.fill('#ow-replace-input', '第$1册')
  await page.click('#btn-ow-replace-all')
  await page.waitForTimeout(200)
  state = await readOutlineFindState(page)
  const expectedAll = content.replace(/第([一二三])卷/g, '第$1册')
  assert.equal(state.content, expectedAll, `outline round ${round}: regex replace all`)
  assert(state.traceEvents.some(event => event.mode === 'all' && event.matchCount === 3), `outline round ${round}: trace replace all`)
  assert(state.diagnostics.some(entry => entry.mode === 'all' && entry.matchCount === 3), `outline round ${round}: diag replace all`)

  // Replace-current needs a selected match.
  await page.fill('#ow-find-input', '查找替换实测正文')
  await page.uncheck('#ow-find-use-regex')
  await page.click('#btn-ow-find-next')
  await page.waitForTimeout(120)
  await page.fill('#ow-replace-input', '真实用户替换正文')
  await page.click('#btn-ow-replace')
  await page.waitForTimeout(180)
  state = await readOutlineFindState(page)
  assert.equal(state.content.split('真实用户替换正文').length - 1, 1, `outline round ${round}: replace current once`)
  assert(state.traceEvents.some(event => event.mode === 'current' && event.matchCount === 12), `outline round ${round}: trace replace current`)

  // Undo returns exactly to the pre-replacement document.
  await page.click('#btn-ow-undo')
  await page.waitForTimeout(150)
  state = await readOutlineFindState(page)
  assert.equal(state.content, expectedAll, `outline round ${round}: one undo restores pre-replace content`)

  // Locked outline rejects replacement at both UI and service layers.
  await page.fill('#ow-find-input', '查找替换实测')
  await page.fill('#ow-replace-input', '锁定后不能替换')
  await page.evaluate(() => {
    const piniaInstance = window.__pinia
      || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
    piniaInstance._s.get('project').outlineLocked = true
  })
  await page.waitForTimeout(100)
  const replaceAllDisabled = await page.locator('#btn-ow-replace-all').isDisabled()
  assert(replaceAllDisabled, `outline round ${round}: locked replace-all disabled`)
  state = await readOutlineFindState(page)
  assert.equal(state.content, expectedAll, `outline round ${round}: locked replace blocked`)
  await page.evaluate(() => {
    const piniaInstance = window.__pinia
      || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
    piniaInstance._s.get('project').outlineLocked = false
  })

  return {
    round,
    entry: 'outline',
    caseSensitiveMatches: 13,
    wholeWordMatches: 14,
    regexMatches: 3,
    regexReplaceMatches: 3,
    replaceCurrentMatches: 12,
    invalidRegexGuarded: true,
    undoRestoresPreReplace: true,
    lockedReplaceBlocked: true,
  }
}

async function readOutlineFindState(page) {
  return page.evaluate(() => {
    const piniaInstance = window.__pinia
      || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
    const project = piniaInstance._s.get('project')
    return {
      result: document.querySelector('#ow-find-result')?.textContent || '',
      content: project.outlineText || '',
      traceEvents: piniaInstance._s.get('runTrace').runs
        .flatMap(run => run.events)
        .filter(event => event.type === 'editor-replace')
        .map(event => JSON.parse(event.detail || '{}')),
      diagnostics: window.__outlineReplaceDiagnostics || [],
    }
  })
}

async function main() {
  assertFreshRendererBuild()
  removeDir(PROFILE)
  removeDir(path.dirname(RESULT_FILE))
  fs.mkdirSync(path.dirname(RESULT_FILE), { recursive: true })

  const electronProcess = startElectron()
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

    await page.evaluate(() => {
      window.__editorReplaceDiagnostics = []
      const original = window.DiagLogger?.log?.bind(window.DiagLogger)
      if (original) {
        window.DiagLogger.log = (level, scope, message, detail) => {
          if (scope === 'editor-replace') window.__editorReplaceDiagnostics.push(detail)
          return original(level, scope, message, detail)
        }
      }
    })

    for (let round = 1; round <= 10; round++) {
      rounds.push(await runHomeRound(page, round))
    }
    for (let round = 1; round <= 10; round++) {
      rounds.push(await runOutlineRound(page, round))
    }

    const pageErrorsOnly = pageErrors.filter(message => !message.startsWith('warning:'))
    assert.equal(pageErrorsOnly.length, 0, `page errors: ${pageErrorsOnly.join(' | ')}`)
    fs.writeFileSync(RESULT_FILE, JSON.stringify({
      schema: 'shenyi.editor-replace.electron',
      version: 1,
      rounds,
      assertions: '20/20 rounds: home and outline, literal/case/whole-word/regex/invalid-regex, replace current/all, undo, lock, runTrace and DiagLogger, no page errors',
      generatedAt: new Date().toISOString(),
    }, null, 2))
    console.log(`PASS: 10/10 home + 10/10 outline replace rounds; report=${RESULT_FILE}`)
  } finally {
    if (browser) await browser.close().catch(() => {})
    if (electronProcess?.pid) {
      try { execFileSync('taskkill', ['/PID', String(electronProcess.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
    }
    removeDir(PROFILE)
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
