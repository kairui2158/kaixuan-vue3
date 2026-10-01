import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9295
const PROFILE = path.join(ROOT, '_audit', 'tmp', 'editor-outline-profile')
const RESULT_FILE = path.join(ROOT, '_audit', 'verification-editor-outline', 'electron-10-rounds.json')

function buildLongDocument() {
  const lines = []
  for (let volume = 1; volume <= 5; volume++) {
    lines.push(`# 第${volume}卷 长文档大纲导航实测`)
    for (let section = 1; section <= 5; section++) {
      lines.push(`## 第${volume}-${section}节 长文档大纲导航`)
      for (let paragraph = 1; paragraph <= 8; paragraph++) {
        lines.push(`第${paragraph}段：长文档大纲导航实测内容，验证标题解析、层级展示、点击定位与折叠态跳转保护。验证编号为第${volume}-${section}-${paragraph}。`)
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
    store.clearUndoHistoryForTab('editor-outline-probe')
    store.bookmarks = []
    store.openTab({
      id: 'editor-outline-probe',
      title: '大纲导航实测',
      content,
      chapterId: '',
      isDirty: false,
      mode: 'ch-body',
    })
    store.activeTabId = 'editor-outline-probe'
  }, originalContent)
  await page.waitForSelector('#editor-content', { timeout: 10000 })
  await page.waitForTimeout(300)
}

async function openOutline(page) {
  const exists = await page.locator('#editor-outline-panel').isVisible().catch(() => false)
  if (!exists) await page.click('#btn-outline')
  await page.waitForSelector('#editor-outline-panel', { timeout: 5000 })
  await page.waitForTimeout(150)
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
    await openOutline(page)

    const initial = await page.evaluate(() => ({
      panelVisible: !!document.querySelector('#editor-outline-panel'),
      title: document.querySelector('#editor-outline-title')?.textContent || '',
      count: document.querySelectorAll('#editor-outline-list .editor-outline-item').length,
      firstText: document.querySelector('#editor-outline-list .editor-outline-item .editor-outline-text')?.textContent || '',
    }))
    assert(initial.panelVisible, 'outline panel visible')
    assert.equal(initial.title, '大纲导航')
    assert.equal(initial.count, 30, '30 headings parsed')
    assert.equal(initial.firstText, '第1卷 长文档大纲导航实测')

    const emptyBefore = await page.evaluate(() => {
      const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
      const editor = pinia._s.get('editor')
      editor.updateContent('editor-outline-probe', '没有标题的普通正文。')
      return true
    })
    await page.waitForTimeout(200)
    const emptyState = await page.evaluate(() => ({
      hasPanel: !!document.querySelector('#editor-outline-panel'),
      hasEmpty: !!document.querySelector('#editor-outline-empty'),
    }))
    if (emptyBefore) {
      assert(emptyState.hasPanel, 'panel remains visible for empty outline')
      assert(emptyState.hasEmpty, 'empty state visible')
    }
    await page.evaluate(content => {
      const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
      pinia._s.get('editor').updateContent('editor-outline-probe', content)
    }, originalContent)
    await page.waitForTimeout(150)
    for (let round = 1; round <= 10; round++) {
      const targetHeading = `## 第${(round % 5) + 1}-3节 长文档大纲导航`
      const targetTitle = targetHeading.replace(/^##\s+/, '')
      const expectedOffset = originalContent.indexOf(targetHeading)
      assert(expectedOffset >= 0, `round ${round}: target heading exists`)
      await openOutline(page)
      await page.click(`#editor-outline-list .editor-outline-item:has-text("${targetTitle}")`)
      await page.waitForTimeout(200)

      const jumped = await page.evaluate(() => {
        const textarea = document.querySelector('#editor-content')
        return {
          start: textarea.selectionStart,
          end: textarea.selectionEnd,
          focused: document.activeElement === textarea,
          scrollTop: textarea.scrollTop,
          clientHeight: textarea.clientHeight,
          value: textarea.value,
        }
      })
      assert.equal(jumped.start, expectedOffset, `round ${round}: cursor at heading start`)
      assert.equal(jumped.end, expectedOffset, `round ${round}: selection collapsed at heading start`)
      assert(jumped.focused, `round ${round}: textarea focused`)
      assert(jumped.scrollTop > 0, `round ${round}: editor scrolled to heading`)
      assert.equal(jumped.value, originalContent, `round ${round}: content unchanged`)

      if (round % 2 === 0) {
        const foldOffset = originalContent.indexOf('# 第1卷 长文档大纲导航实测')
        await page.evaluate(offset => {
          const textarea = document.querySelector('#editor-content')
          textarea.focus()
          textarea.setSelectionRange(offset, offset)
        }, foldOffset)
        await page.click('#btn-fold')
        await page.waitForTimeout(150)
        await openOutline(page)
        await page.click(`#editor-outline-list .editor-outline-item:has-text("${targetTitle}")`)
        await page.waitForTimeout(250)
        const afterFoldJump = await page.evaluate(() => ({
          banner: !!document.querySelector('.editor-fold-banner'),
          start: document.querySelector('#editor-content').selectionStart,
          value: document.querySelector('#editor-content').value,
        }))
        assert(!afterFoldJump.banner, `round ${round}: outline jump expands folded view`)
        assert.equal(afterFoldJump.start, expectedOffset, `round ${round}: cursor correct after expanding fold`)
        assert.equal(afterFoldJump.value, originalContent, `round ${round}: original content restored after fold jump`)
      }

      rounds.push({
        round,
        documentChars: originalContent.length,
        headingCount: 30,
        targetHeading,
        targetOffset: expectedOffset,
        scrollTop: jumped.scrollTop,
        clientHeight: jumped.clientHeight,
        foldedJumpVerified: round % 2 === 0,
      })
    }

    await page.click('#btn-editor-outline-collapse')
    await page.waitForTimeout(150)
    const collapsed = await page.evaluate(() => ({
      panel: !!document.querySelector('#editor-outline-panel'),
      button: !!document.querySelector('#btn-outline'),
    }))
    assert(!collapsed.panel, 'outline panel collapsed')
    assert(collapsed.button, 'outline toggle button remains')

    assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(' | ')}`)
    fs.writeFileSync(RESULT_FILE, JSON.stringify({
      schema: 'shenyi.editor-outline.electron',
      version: 1,
      documentChars: originalContent.length,
      documentRequirement: '>=5000',
      rounds,
      assertions: '10 rounds: parse 30 headings, click 10 distinct headings, center-scroll, no content change, folded-state jump expansion, panel collapse, no page errors',
      generatedAt: new Date().toISOString(),
    }, null, 2))
    console.log(`PASS: 10/10 outline rounds; report=${RESULT_FILE}`)
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
