import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9301
const PROFILE = path.join(ROOT, '_audit', 'tmp', 'editor-selection-restore-profile')
const RESULT_FILE = path.join(ROOT, '_audit', 'verification-editor-selection-restore', 'electron-10-rounds.json')

function buildDocument() {
  const lines = ['# 选区保持实测']
  for (let volume = 1; volume <= 3; volume++) {
    lines.push(`# 第${volume}卷`)
    lines.push(`第${volume}卷开头锚点。`)
    for (let section = 1; section <= 3; section++) {
      lines.push(`## 第${volume}-${section}节`)
      for (let paragraph = 1; paragraph <= 18; paragraph++) {
        lines.push(`第${paragraph}段：第${volume}-${section}节选区保持正文，用于验证外部写入后的选区恢复。`)
      }
    }
    lines.push(`第${volume}卷结尾锚点。`)
  }
  const text = lines.join('\n')
  assert(text.length >= 5000, `document >= 5000 chars, got ${text.length}`)
  return text
}

const originalContent = buildDocument()

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

async function prepareEditor(page) {
  await closeVisibleModals(page)
  await page.evaluate(content => {
    const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
    if (!pinia) throw new Error('pinia unavailable')
    const store = pinia._s.get('editor')
    store.tabs.splice(0)
    store.clearUndoHistoryForTab('selection-restore-probe')
    store.clearUndoHistoryForTab('selection-restore-second')
    store.bookmarks = []
    store.openTab({
      id: 'selection-restore-probe',
      title: '选区保持实测',
      content,
      chapterId: 'selection-restore-probe',
      isDirty: false,
      mode: 'ch-body',
    })
    store.openTab({
      id: 'selection-restore-second',
      title: '第二页签',
      content: '第二页签内容。',
      chapterId: 'selection-restore-second',
      isDirty: false,
      mode: 'ch-body',
    })
    store.activeTabId = 'selection-restore-probe'
  }, originalContent)
  await page.waitForSelector('#editor-content', { timeout: 10000 })
  await page.waitForTimeout(300)
}

async function setSelection(page, token, length) {
  const result = await page.evaluate(({ token, length }) => {
    const textarea = document.querySelector('#editor-content')
    const start = textarea.value.indexOf(token)
    if (start < 0) throw new Error(`selection token not found: ${token}`)
    textarea.focus()
    textarea.setSelectionRange(start, start + length)
    textarea.dispatchEvent(new Event('select'))
    return { start, end: start + length }
  }, { token, length })
  await page.waitForTimeout(100)
  return result
}

async function dispatchExternalWrite(page, nextContent) {
  await page.evaluate(nextContent => {
    const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
    const store = pinia._s.get('editor')
    store.updateContent('selection-restore-probe', nextContent)
    window.dispatchEvent(new CustomEvent('editor-external-change', {
      detail: { tabId: 'selection-restore-probe', content: nextContent },
    }))
  }, nextContent)
  await page.waitForTimeout(160)
}

function readSelection(page) {
  return page.evaluate(async () => {
    const textarea = document.querySelector('#editor-content')
    const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
    return {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
      value: textarea.value,
      activeTabId: pinia._s.get('editor').activeTabId,
      traceEvents: pinia._s.get('runTrace').runs
        .flatMap(run => run.events)
        .filter(event => event.type === 'selection-restore')
        .map(event => ({ mode: event.selectionRestoreMode, detail: JSON.parse(event.detail || '{}') })),
      diagEntries: (await (window.DiagLogger ? window.DiagLogger.read('') : []))
        .filter(entry => entry.cat === 'editor-selection')
        .map(entry => {
          try { return { level: entry.level, detail: JSON.parse(entry.detail || '{}') } }
          catch { return { level: entry.level, detail: {} } }
        }),
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
    await prepareEditor(page)
    await page.evaluate(() => {
      const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
      const runTrace = pinia._s.get('runTrace')
      runTrace.startRun({
        source: 'home',
        stepName: '选区保持实测',
        mode: 'editor-tool',
        projectId: 'selection-restore-e2e',
        projectName: '选区保持实测',
        sessionKind: 'task',
      })
    })

    for (let round = 1; round <= 10; round++) {
      // API writes after the selection: selection stays at the same offsets.
      await page.evaluate(content => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        pinia._s.get('editor').updateContent('selection-restore-probe', content)
      }, originalContent)
      await page.waitForTimeout(150)
      const selected = await setSelection(page, '第1卷开头锚点', 4)
      const afterWriteContent = originalContent.replace('第3-3节选区保持正文，用于验证外部写入后的选区恢复。', '第3-3节末尾追加了一段外部写入。')
      await dispatchExternalWrite(page, afterWriteContent)
      const afterWrite = await readSelection(page)
      assert.equal(afterWrite.start, selected.start, `round ${round}: write-after keeps start`)
      assert.equal(afterWrite.end, selected.end, `round ${round}: write-after keeps end`)
      assert.equal(afterWrite.traceEvents.at(-1)?.mode, 'auto', `round ${round}: write-after trace mode`)
      assert.equal(afterWrite.traceEvents.at(-1)?.detail.reason, 'write-after-selection', `round ${round}: write-after trace reason`)
      assert.equal(afterWrite.diagEntries.at(-1)?.detail.reason, 'write-after-selection', `round ${round}: write-after diag reason`)

      // The user changes the selection between two API writes. The restore
      // baseline must follow the latest user selection, not the first one.
      const reselected = await setSelection(page, '第3-3节末尾追加', 4)
      const expanded = afterWriteContent.replace('第1卷开头锚点。', '卷首说明。\n第1卷开头锚点。')
      await dispatchExternalWrite(page, expanded)
      const shifted = await readSelection(page)
      const delta = '卷首说明。\n'.length
      assert.equal(shifted.start, reselected.start + delta, `round ${round}: write-before shifts latest selection start`)
      assert.equal(shifted.end, reselected.end + delta, `round ${round}: write-before shifts latest selection end`)
      assert.equal(shifted.traceEvents.at(-1)?.mode, 'auto', `round ${round}: write-before trace mode`)
      assert.equal(shifted.traceEvents.at(-1)?.detail.reason, 'write-before-selection', `round ${round}: write-before trace reason`)

      // API writes over the selection: explicit reset and warning evidence.
      const resetContent = expanded.replace('第3-3节末尾追加了一段外部写入。', '完全不同的末尾。')
      await dispatchExternalWrite(page, resetContent)
      const reset = await readSelection(page)
      assert.equal(reset.start, 0, `round ${round}: overlapping write resets start`)
      assert.equal(reset.end, 0, `round ${round}: overlapping write resets end`)
      assert.equal(reset.traceEvents.at(-1)?.mode, 'reset', `round ${round}: overlap trace mode`)
      assert.equal(reset.traceEvents.at(-1)?.detail.reason, 'write-overlaps-selection', `round ${round}: overlap trace reason`)
      assert.equal(reset.diagEntries.at(-1)?.detail.reason, 'write-overlaps-selection', `round ${round}: overlap diag reason`)

      // Folding hides a selected range: reset now, restore after unfold.
      await page.evaluate(content => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        pinia._s.get('editor').updateContent('selection-restore-probe', content)
      }, originalContent)
      await page.waitForTimeout(150)
      const hiddenSelection = await setSelection(page, '第1-1节选区保持正文', 6)
      // A real user keeps the selection in the section body and asks the
      // editor to fold the heading that owns that selection.
      await page.click('#btn-fold')
      await page.waitForTimeout(200)
      const foldedHidden = await readSelection(page)
      assert.equal(foldedHidden.start, 0, `round ${round}: folded hidden selection reset`)
      assert.equal(foldedHidden.traceEvents.at(-1)?.detail.reason, 'fold-hides-selection', `round ${round}: hidden fold reason`)
      await page.click('#btn-fold-expand')
      await page.waitForTimeout(200)
      const unfolded = await readSelection(page)
      assert.equal(unfolded.start, hiddenSelection.start, `round ${round}: unfold restores hidden start`)
      assert.equal(unfolded.end, hiddenSelection.end, `round ${round}: unfold restores hidden end`)
      assert.equal(unfolded.traceEvents.at(-1)?.mode, 'auto', `round ${round}: unfold trace mode`)
      assert.equal(unfolded.traceEvents.at(-1)?.detail.reason, 'unfold-restores-selection', `round ${round}: unfold reason`)

      // Switching tabs explicitly resets the selection on the target tab.
      try {
        await page.click('.chapter-tabs .tab:has-text("第二页签")', { timeout: 5000 })
      } catch (error) {
        const state = await page.evaluate(() => ({
          chapterTabsText: document.querySelector('.chapter-tabs')?.textContent || null,
          tabCount: document.querySelectorAll('.chapter-tabs .tab').length,
          storeTabs: (window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia)
            ?._s.get('editor').tabs.map(tab => tab.title),
          bodyText: document.body.innerText.slice(0, 500),
        }))
        throw new Error(`round ${round}: second tab unreachable: ${JSON.stringify(state)}; ${error.message}`)
      }
      await page.waitForTimeout(200)
      const switched = await readSelection(page)
      assert.equal(switched.activeTabId, 'selection-restore-second', `round ${round}: tab switched`)
      assert.equal(switched.start, 0, `round ${round}: tab switch resets start`)
      assert.equal(switched.end, 0, `round ${round}: tab switch resets end`)
      assert.equal(switched.traceEvents.at(-1)?.mode, 'reset', `round ${round}: tab trace mode`)
      assert.equal(switched.traceEvents.at(-1)?.detail.reason, 'tab-switch', `round ${round}: tab trace reason`)

      // Return to the probe tab for the next round.
      await page.click('.chapter-tabs .tab:has-text("选区保持实测")')
      await page.waitForTimeout(200)

      rounds.push({
        round,
        documentChars: originalContent.length,
        writeAfterKeep: true,
        writeBeforeShift: delta,
        overlapReset: true,
        foldedHiddenReset: true,
        unfoldRestore: hiddenSelection,
        tabSwitchReset: true,
        traceCount: switched.traceEvents.length,
        diagCount: switched.diagEntries.length,
      })
    }

    const pageErrorsOnly = pageErrors.filter(message => !message.startsWith('warning:'))
    assert.equal(pageErrorsOnly.length, 0, `page errors: ${pageErrorsOnly.join(' | ')}`)
    fs.writeFileSync(RESULT_FILE, JSON.stringify({
      schema: 'shenyi.editor-selection-restore.electron',
      version: 1,
      documentChars: originalContent.length,
      rounds,
      assertions: '10 rounds: external write keep/shift/reset, fold hide/reset and unfold restore, tab switch reset, runTrace selectionRestoreMode + DiagLogger editor-selection coverage, no page errors',
      generatedAt: new Date().toISOString(),
    }, null, 2))
    console.log(`PASS: 10/10 selection restore rounds; report=${RESULT_FILE}`)
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
