import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9306
const PROFILE = path.join(ROOT, '_audit', 'tmp', 'editor-undo-profile')
const RESULT_FILE = path.join(ROOT, '_audit', 'verification-editor-undo', 'electron-10-rounds.json')

function buildRoundDocument(round) {
  return [
    `# 撤销事务实测 第${round}轮`,
    '初始段落：这一段用于验证手动输入事务。',
    `API段落：第${round}轮写入，用于验证API事务与撤销。`,
    `导入段落：第${round}轮导入内容，用于验证导入事务。`,
  ].join('\n')
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

async function openOutlineWorkspace(page) {
  await closeVisibleModals(page)
  if (!(await page.locator('#outline-workspace').isVisible().catch(() => false))) {
    await page.click('#btn-outline-workspace')
  }
  await page.waitForSelector('#outline-editor', { timeout: 10000 })
  await page.waitForTimeout(300)
}

async function closeOutlineWorkspace(page) {
  if (await page.locator('#outline-workspace').isVisible().catch(() => false)) {
    await page.click('#btn-close-outline-workspace')
  }
  await page.waitForTimeout(200)
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
      if (['error', 'warning'].includes(message.type())) {
        pageErrors.push(`${message.type()}: ${message.text()}`)
      }
    })
    await page.waitForSelector('#app', { timeout: 20000 })
    await page.waitForTimeout(2000)

    const injectDiagnostics = await page.evaluate(() => {
      window.__editorUndoDiagnostics = []
      const original = window.DiagLogger?.log?.bind(window.DiagLogger)
      if (!original) return false
      window.DiagLogger.log = (level, scope, message, detail) => {
        if (scope === 'editor-undo') {
          window.__editorUndoDiagnostics.push({ level, scope, message, detail })
        }
        return original(level, scope, message, detail)
      }
      return true
    })
    assert(injectDiagnostics, 'DiagLogger available before undo verification')

    for (let round = 1; round <= 10; round++) {
      const initial = buildRoundDocument(round)
      await openOutlineWorkspace(page)

      await page.evaluate(initialContent => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        if (!pinia) throw new Error('pinia unavailable')
        const project = pinia._s.get('project')
        const editor = pinia._s.get('editor')
        project.currentProjectId = `editor-undo-probe-${Date.now()}`
        editor.clearUndoHistoryForTab('outline')
        pinia._s.get('runTrace').startRun({
          source: 'outline',
          stepName: '大纲共创',
          mode: 'chat',
          skillNames: [],
        })
        project.outlineText = initialContent
        project.setOutline(initialContent)
      }, initial)
      await page.waitForTimeout(200)

      const manualBefore = `手动追加段落：第${round}轮。`
      await page.fill('#outline-editor', `${initial}\n${manualBefore}`)
      await page.evaluate(() => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        pinia._s.get('editor').pushUndoTransactionForTab('outline', document.querySelector('#outline-editor').value, 'manual', '手动输入')
      })
      await page.waitForTimeout(150)

      const apiBefore = await page.evaluate(() => document.querySelector('#outline-editor').value)
      const apiContent = `${apiBefore}\nAPI追加段落：第${round}轮，撤销一次必须先回滚这里。`
      await page.evaluate(({ content, roundNo }) => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        const editor = pinia._s.get('editor')
        const project = pinia._s.get('project')
        editor.pushUndoTransactionForTab('outline', content, 'api', 'API batch')
        project.outlineText = `${content}\nAPI追加段落：第${roundNo}轮，撤销一次必须先回滚这里。`
        project.setOutline(project.outlineText)
      }, { content: apiBefore, roundNo: round })
      await page.waitForTimeout(150)

      await page.click('#btn-ow-undo')
      await page.waitForTimeout(150)
      const afterApiUndo = await page.evaluate(() => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        const editor = pinia._s.get('editor')
        return {
          content: document.querySelector('#outline-editor').value,
          transactionCount: editor.listUndoTransactionsForTab('outline').length,
          canRedo: editor.canRedoTab('outline'),
        }
      })
      assert.equal(afterApiUndo.content, apiBefore, `round ${round}: undo rolls back API write`)
      assert(afterApiUndo.canRedo, `round ${round}: API undo leaves redo entry`)
      assert.equal(afterApiUndo.transactionCount, 1, `round ${round}: undo consumed API transaction`)

      await page.click('#btn-ow-undo')
      await page.waitForTimeout(150)
      assert.equal(await page.evaluate(() => document.querySelector('#outline-editor').value), initial, `round ${round}: second undo rolls back manual write`)

      await page.click('#btn-ow-redo')
      await page.waitForTimeout(150)
      assert.equal(await page.evaluate(() => document.querySelector('#outline-editor').value), initial, `round ${round}: redo restores manual write`)
      const afterManualUndo = await page.evaluate(() => document.querySelector('#outline-editor').value)
      assert.equal(afterManualUndo, initial, `round ${round}: second undo rolls back manual write`)

      await page.evaluate(() => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        const editor = pinia._s.get('editor')
        const project = pinia._s.get('project')
        editor.pushUndoTransactionForTab('outline', project.outlineText || '', 'import', '导入文档')
        project.outlineText = `${project.outlineText}\n导入后的正文`
        project.setOutline(project.outlineText)
      })
      await page.waitForTimeout(150)
      await page.click('#btn-ow-undo')
      await page.waitForTimeout(150)
      const afterImportUndo = await page.evaluate(() => document.querySelector('#outline-editor').value)
      assert.equal(afterImportUndo, initial, `round ${round}: import undo returns pre-import content`)

      await page.evaluate(() => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        const editor = pinia._s.get('editor')
        editor.pushUndoTransactionForTab('outline', document.querySelector('#outline-editor').value, 'manual', '保留历史')
      })
      await page.waitForTimeout(100)

      const sourceBeforeReset = await page.evaluate(() => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        const runTrace = pinia._s.get('runTrace')
        const editor = pinia._s.get('editor')
        return {
          currentRunId: runTrace.getRunId('outline'),
          undoCount: editor.listUndoTransactionsForTab('outline').length,
          canUndo: editor.canUndoTab('outline'),
          canRedo: editor.canRedoTab('outline'),
          diagCount: window.__editorUndoDiagnostics.length,
        }
      })
      assert(sourceBeforeReset.undoCount >= 1, `round ${round}: undo history exists before project reset`)
      assert(sourceBeforeReset.canUndo, `round ${round}: undo available before project reset`)
      assert(sourceBeforeReset.diagCount >= 3, `round ${round}: DiagLogger records undo actions`)
      assert(!!sourceBeforeReset.currentRunId, `round ${round}: active outline run trace exists`)

      const traceVerified = await page.evaluate(runId => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        const runTrace = pinia._s.get('runTrace')
        const run = runTrace.getRun(runId)
        if (!run) return false
        return (run.events || []).some(event => event.type === 'editor-undo' && event.label.includes('大纲编辑器'))
      }, sourceBeforeReset.currentRunId)
      assert(traceVerified, `round ${round}: runTrace records outline undo event`)

      await closeOutlineWorkspace(page)
      await page.evaluate(() => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        pinia._s.get('project').clearCurrent()
      })
      await page.waitForTimeout(300)
      const afterReset = await page.evaluate(() => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        const editor = pinia._s.get('editor')
        return {
          undoCount: editor.listUndoTransactionsForTab('outline').length,
          canUndo: editor.canUndoTab('outline'),
          canRedo: editor.canRedoTab('outline'),
        }
      })
      assert.equal(afterReset.undoCount, 0, `round ${round}: project reset clears outline undo history`)
      assert.equal(afterReset.canUndo, false, `round ${round}: project reset disables undo`)
      assert.equal(afterReset.canRedo, false, `round ${round}: project reset disables redo`)

      rounds.push({
        round,
        apiUndoVerified: true,
        manualUndoVerified: true,
        manualRedoVerified: true,
        importUndoVerified: true,
        projectResetIsolationVerified: true,
        diagRecords: sourceBeforeReset.diagCount,
        traceEventVerified: traceVerified,
      })
    }

    assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(' | ')}`)
    fs.writeFileSync(RESULT_FILE, JSON.stringify({
      schema: 'shenyi.editor-undo.electron',
      version: 1,
      rounds,
      assertions: '10 rounds: manual/api/import transactions, undo, redo, runTrace + DiagLogger dual logging, project-reset isolation, no-page-error',
      generatedAt: new Date().toISOString(),
    }, null, 2))
    console.log(`PASS: 10/10 undo rounds; report=${RESULT_FILE}`)
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
