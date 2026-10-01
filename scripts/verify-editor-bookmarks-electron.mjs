import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9294
const PROFILE = path.join(ROOT, '_audit', 'tmp', 'editor-bookmarks-profile')
const RESULT_FILE = path.join(ROOT, '_audit', 'verification-editor-bookmarks', 'electron-10-rounds.json')

function buildLongDocument() {
  const lines = []
  for (let volume = 1; volume <= 5; volume++) {
    lines.push(`# 第${volume}卷 长文档书签实测`)
    for (let section = 1; section <= 5; section++) {
      lines.push(`## 第${volume}-${section}节 长文档导航`)
      for (let paragraph = 1; paragraph <= 8; paragraph++) {
        lines.push(`第${paragraph}段：长文档书签实测内容，验证添加、切换页签、跳转、删除与内容变更后的书签状态。验证编号为第${volume}-${section}-${paragraph}。`)
      }
    }
  }
  const document = lines.join('\n')
  assert(document.length >= 5000, `long document >= 5000 chars, got ${document.length}`)
  return document
}

const originalContent = buildLongDocument()

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
    store.clearUndoHistoryForTab('editor-bookmarks-probe')
    store.clearUndoHistoryForTab('editor-bookmarks-other')
    store.bookmarks = []
    store.openTab({
      id: 'editor-bookmarks-probe',
      title: '书签实测',
      content,
      chapterId: '',
      isDirty: false,
      mode: 'ch-body',
    })
    store.openTab({
      id: 'editor-bookmarks-other',
      title: '切换页签',
      content: '其他页签内容',
      chapterId: 'editor-bookmarks-other-chapter',
      isDirty: false,
      mode: 'ch-body',
    })
    store.activeTabId = 'editor-bookmarks-probe'
  }, originalContent)
  await page.waitForSelector('#editor-content', { timeout: 10000 })
  await page.waitForTimeout(300)
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
    await prepareEditor(page)

    for (let round = 1; round <= 10; round++) {
      const targetHeading = `## 第${(round % 5) + 1}-2节 长文档导航`
      const headingOffset = await page.evaluate(heading => {
        return document.querySelector('#editor-content').value.indexOf(heading)
      }, targetHeading)
      assert(headingOffset >= 0, `round ${round}: heading exists`)

      await page.evaluate(offset => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        const editor = pinia._s.get('editor')
        editor.bookmarks = []
        pinia._s.get('project').setEditorBookmarks([])
        const textarea = document.querySelector('#editor-content')
        textarea.focus()
        textarea.setSelectionRange(offset, offset)
      }, headingOffset)
      const isBarOpen = await page.evaluate(() => !!document.querySelector('#editor-bookmark-bar'))
      if (!isBarOpen) await page.click('#btn-bookmark')
      await page.waitForTimeout(100)
      const barVisible = await page.locator('#editor-bookmark-bar').isVisible().catch(() => false)
      assert(barVisible, `round ${round}: bookmark bar visible`)
      const addButtonVisible = await page.locator('#btn-bookmark-add').isVisible().catch(() => false)
      assert(addButtonVisible, `round ${round}: add button visible`)
      await page.click('#btn-bookmark-add')
      await page.waitForTimeout(200)

      const added = await page.evaluate(documentId => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        const editor = pinia._s.get('editor')
        const project = pinia._s.get('project')
        return {
          editorCount: editor.listBookmarks(documentId).length,
          projectCount: project.editorBookmarks.length,
          itemText: document.querySelector('#bookmark-list .bookmark-item')?.textContent || '',
        }
      }, 'editor-bookmarks-probe')
      assert.equal(added.editorCount, 1, `round ${round}: editor bookmark added`)
      assert.equal(added.projectCount, 1, `round ${round}: project bookmark synced`)
      assert(added.itemText.includes('第'), `round ${round}: bookmark item visible`)

      const switched = await page.evaluate(documentId => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        const editor = pinia._s.get('editor')
        editor.activeTabId = 'editor-bookmarks-other'
        return {
          activeId: editor.activeTabId,
          otherCount: editor.listBookmarks('editor-bookmarks-other').length,
          probeCount: editor.listBookmarks(documentId).length,
          emptyVisible: !!document.querySelector('#bookmark-empty'),
          itemCount: document.querySelectorAll('.bookmark-item').length,
        }
      }, 'editor-bookmarks-probe')
      assert.equal(switched.activeId, 'editor-bookmarks-other', `round ${round}: tab switched`)
      assert.equal(switched.otherCount, 0, `round ${round}: other tab has no bookmark`)
      assert.equal(switched.probeCount, 1, `round ${round}: probe bookmark retained`)

      await page.evaluate(() => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        pinia._s.get('editor').activeTabId = 'editor-bookmarks-probe'
      })
      await page.waitForTimeout(100)
      await page.click('#bookmark-list .bookmark-item .bookmark-label')
      await page.waitForTimeout(200)
      const jumped = await page.evaluate(() => {
        const textarea = document.querySelector('#editor-content')
        return {
          start: textarea.selectionStart,
          end: textarea.selectionEnd,
          focused: document.activeElement === textarea,
        }
      })
      assert.equal(jumped.start, headingOffset, `round ${round}: cursor jumps to bookmark offset`)
      assert.equal(jumped.end, headingOffset, `round ${round}: selection end jumps to bookmark offset`)
      assert(jumped.focused, `round ${round}: textarea focused after jump`)

      const beforeHash = await page.evaluate(documentId => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        return pinia._s.get('editor').listBookmarks(documentId)[0]?.contentHash || ''
      }, 'editor-bookmarks-probe')
      await page.evaluate(documentId => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        const editor = pinia._s.get('editor')
        editor.updateContent(documentId, editor.activeTab.content + '\n追加内容，用于验证书签 hash 更新。')
      }, 'editor-bookmarks-probe')
      await page.waitForTimeout(150)
      const afterAppend = await page.evaluate(documentId => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        return pinia._s.get('editor').listBookmarks(documentId)[0]
      }, 'editor-bookmarks-probe')
      assert(afterAppend, `round ${round}: bookmark survives append`)
      assert.notEqual(afterAppend.contentHash, beforeHash, `round ${round}: content hash refreshed`)

      await page.evaluate(documentId => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        const editor = pinia._s.get('editor')
        editor.updateContent(documentId, editor.activeTab.content.slice(0, 10))
      }, 'editor-bookmarks-probe')
      await page.waitForTimeout(150)
      const afterTruncate = await page.evaluate(documentId => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        return pinia._s.get('editor').listBookmarks(documentId).length
      }, 'editor-bookmarks-probe')
      assert.equal(afterTruncate, 0, `round ${round}: out-of-range bookmark dropped`)

      await page.evaluate(content => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        const editor = pinia._s.get('editor')
        editor.updateContent('editor-bookmarks-probe', content)
        editor.bookmarks = []
        pinia._s.get('project').setEditorBookmarks([])
      }, originalContent)
      await page.click('#btn-bookmark-add')
      await page.waitForTimeout(200)
      await page.click('#bookmark-list .bookmark-item .bookmark-remove')
      await page.waitForTimeout(200)
      const afterDelete = await page.evaluate(() => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        return {
          editorCount: pinia._s.get('editor').bookmarks.length,
          projectCount: pinia._s.get('project').editorBookmarks.length,
          emptyVisible: !!document.querySelector('#bookmark-empty'),
        }
      })
      assert.equal(afterDelete.editorCount, 0, `round ${round}: editor bookmark deleted`)
      assert.equal(afterDelete.projectCount, 0, `round ${round}: project bookmark deletion synced`)
      assert(afterDelete.emptyVisible, `round ${round}: empty state after delete`)

      rounds.push({
        round,
        documentChars: originalContent.length,
        bookmarkOffset: headingOffset,
        tabSwitchVerified: true,
        jumpVerified: true,
        hashRefreshVerified: true,
        outOfRangeDropped: true,
        deleteSynced: true,
      })
    }

    for (let round = 1; round <= 10; round++) {
      await prepareEditor(page)
      await page.evaluate(() => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        const editor = pinia._s.get('editor')
        editor.pushUndoState('editor-bookmarks-probe', '旧检查点')
        editor.pushUndoState('editor-bookmarks-other', '旧检查点')
        editor.addBookmark('editor-bookmarks-probe', editor.tabs[0].content, 0, '旧项目书签')
      })
      await page.waitForTimeout(150)

      const before = await page.evaluate(() => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        const editor = pinia._s.get('editor')
        return {
          tabs: editor.tabs.length,
          bookmarks: editor.bookmarks.length,
          undoProbe: editor.listUndoTransactionsForTab('editor-bookmarks-probe').length,
          undoOther: editor.listUndoTransactionsForTab('editor-bookmarks-other').length,
        }
      })
      assert.equal(before.tabs, 2, `switch round ${round}: old tabs present`)
      assert.equal(before.bookmarks, 1, `switch round ${round}: old bookmark present`)
      assert.equal(before.undoProbe, 1, `switch round ${round}: probe undo transaction present`)
      assert.equal(before.undoOther, 1, `switch round ${round}: other undo transaction present`)

      await page.evaluate(() => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        pinia._s.get('project').loadProject('editor-switch-target')
      })
      await page.waitForTimeout(300)

      const after = await page.evaluate(() => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        const editor = pinia._s.get('editor')
        const project = pinia._s.get('project')
        return {
          tabs: editor.tabs.length,
          activeTabId: editor.activeTabId,
          bookmarks: editor.bookmarks.length,
          undoProbe: editor.listUndoTransactionsForTab('editor-bookmarks-probe').length,
          undoOther: editor.listUndoTransactionsForTab('editor-bookmarks-other').length,
          canUndoProbe: editor.canUndoTab('editor-bookmarks-probe'),
          canRedoProbe: editor.canRedoTab('editor-bookmarks-probe'),
          projectBookmarks: project.editorBookmarks.length,
          projectId: project.currentProjectId,
        }
      })
      assert.equal(after.tabs, 0, `switch round ${round}: tabs reset`)
      assert.equal(after.activeTabId, null, `switch round ${round}: active tab reset`)
      assert.equal(after.bookmarks, 0, `switch round ${round}: editor bookmarks reset`)
      assert.equal(after.undoProbe, 0, `switch round ${round}: probe undo history reset`)
      assert.equal(after.undoOther, 0, `switch round ${round}: other undo history reset`)
      assert.equal(after.canUndoProbe, false, `switch round ${round}: undo state reset`)
      assert.equal(after.canRedoProbe, false, `switch round ${round}: redo state reset`)
      assert.equal(after.projectBookmarks, 0, `switch round ${round}: project bookmarks reset`)
      assert.equal(after.projectId, 'editor-switch-target', `switch round ${round}: target project active`)

      rounds.push({
        round,
        type: 'project-switch',
        projectSwitchIsolationVerified: true,
        tabsBefore: before.tabs,
        bookmarksBefore: before.bookmarks,
        undoTransactionsBefore: before.undoProbe + before.undoOther,
      })
    }

    assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(' | ')}`)
    fs.writeFileSync(RESULT_FILE, JSON.stringify({
      schema: 'shenyi.editor-bookmarks.electron',
      version: 1,
      documentChars: originalContent.length,
      documentRequirement: '>=5000',
      rounds,
      assertions: '20 rounds: add/sync/tab-switch/jump/hash-refresh/out-of-range-drop/delete/no-page-error + project-switch isolation',
      generatedAt: new Date().toISOString(),
    }, null, 2))
    console.log(`PASS: 10/10 bookmark rounds + 10/10 project-switch rounds; report=${RESULT_FILE}`)
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
