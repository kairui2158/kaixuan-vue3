import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9296
const PROFILE = path.join(ROOT, '_audit', 'tmp', 'editor-search-highlight-profile')
const RESULT_FILE = path.join(ROOT, '_audit', 'verification-editor-search-highlight', 'electron-10-rounds.json')

function buildLongDocument() {
  const lines = []
  for (let volume = 1; volume <= 5; volume++) {
    lines.push(`# 第${volume}卷 搜索高亮实测`)
    for (let section = 1; section <= 5; section++) {
      lines.push(`## 第${volume}-${section}节 搜索高亮`)
      for (let paragraph = 1; paragraph <= 8; paragraph++) {
        lines.push(`第${paragraph}段：搜索高亮实测正文，用于验证第${volume}-${section}-${paragraph}号匹配定位、当前项高亮和关闭清理。`)
      }
    }
  }
  const documentText = lines.join('\n')
  assert(documentText.length >= 5000, `long document >= 5000 chars, got ${documentText.length}`)
  return documentText
}

const originalContent = buildLongDocument()
const searchTerms = Array.from({ length: 10 }, (_, index) => `第${(index % 5) + 1}-`)

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
    store.clearUndoHistoryForTab('editor-search-highlight-probe')
    store.bookmarks = []
    store.openTab({
      id: 'editor-search-highlight-probe',
      title: '搜索高亮实测',
      content,
      chapterId: '',
      isDirty: false,
      mode: 'ch-body',
    })
    store.activeTabId = 'editor-search-highlight-probe'
  }, originalContent)
  await page.waitForSelector('#editor-content', { timeout: 10000 })
  await page.waitForTimeout(300)
}

async function openFind(page) {
  const visible = await page.locator('#find-replace-bar').isVisible().catch(() => false)
  if (!visible) await page.click('#btn-find')
  await page.waitForSelector('#find-replace-bar', { timeout: 5000 })
  await page.waitForTimeout(100)
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

    for (let round = 1; round <= 10; round++) {
      const query = searchTerms[round - 1]
      const matchOffsets = []
      let cursor = originalContent.indexOf(query)
      while (cursor !== -1) {
        matchOffsets.push(cursor)
        cursor = originalContent.indexOf(query, cursor + query.length)
      }
      const expectedMatches = matchOffsets.length
      await openFind(page)
      await page.fill('#find-input', query)
      await page.click('#btn-find-next')
      await page.waitForTimeout(180)

      const before = await page.evaluate(() => ({
        storeContent: (window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia)
          ._s.get('editor').activeTab.content,
        textareaValue: document.querySelector('#editor-content').value,
        highlights: [...document.querySelectorAll('.editor-search-highlight')].map(item => ({
          className: item.className,
          left: item.style.left,
          top: item.style.top,
          width: item.style.width,
          height: item.style.height,
        })),
        findCount: document.querySelector('#find-count')?.textContent || '',
      }))
      assert.equal(before.findCount, `1/${expectedMatches}`, `round ${round}: find count`)
      assert(
        before.highlights.length <= expectedMatches,
        `round ${round}: windowed highlights do not exceed all matches`,
      )
      assert(before.highlights.length > 0, `round ${round}: active match highlight remains measurable`)
      assert.equal(before.highlights.filter(item => item.className.includes('editor-search-highlight-active')).length, 1, `round ${round}: one active highlight`)
      assert.equal(before.storeContent, originalContent, `round ${round}: store content unchanged`)
      assert.equal(before.textareaValue, originalContent, `round ${round}: textarea content unchanged`)
      for (const item of before.highlights) {
        assert(parseFloat(item.left) >= 0, `round ${round}: rectangle left valid`)
        assert(parseFloat(item.top) >= 0, `round ${round}: rectangle top valid`)
        assert(parseFloat(item.width) > 0, `round ${round}: rectangle width valid`)
        assert(parseFloat(item.height) > 0, `round ${round}: rectangle height valid`)
      }

      if (round % 2 === 0) {
        await page.click('#btn-find-close')
        await page.waitForTimeout(120)
        const closed = await page.evaluate(() => ({
          bar: !!document.querySelector('#find-replace-bar'),
          highlights: document.querySelectorAll('.editor-search-highlight').length,
        }))
        assert(!closed.bar, `round ${round}: find bar closed`)
        assert.equal(closed.highlights, 0, `round ${round}: highlights cleared after close`)
      } else {
        await page.fill('#find-input', '')
        await page.waitForTimeout(120)
        assert.equal(await page.evaluate(() => document.querySelectorAll('.editor-search-highlight').length), 0, `round ${round}: highlights cleared for empty query`)
      }

      rounds.push({
        round,
        documentChars: originalContent.length,
        query,
        expectedMatches,
        renderedHighlights: before.highlights.length,
        windowedRendering: true,
        activeHighlights: 1,
        contentUnchanged: true,
        clearedAfterClose: true,
      })
    }

    await openFind(page)
    await page.fill('#find-input', '完全不存在的高亮关键词')
    await page.click('#btn-find-next')
    await page.waitForTimeout(150)
    const noMatch = await page.evaluate(() => ({
      highlights: document.querySelectorAll('.editor-search-highlight').length,
      count: document.querySelector('#find-count')?.textContent || '',
    }))
    assert.equal(noMatch.highlights, 0, 'no-match query renders no highlights')
    assert.equal(noMatch.count, '', 'no-match count hidden')

    await page.click('#btn-find-close')
    await page.waitForTimeout(150)
    assert.equal(await page.evaluate(() => document.querySelectorAll('.editor-search-highlight').length), 0, 'final close clears highlights')

    assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(' | ')}`)
    fs.writeFileSync(RESULT_FILE, JSON.stringify({
      schema: 'shenyi.editor-search-highlight.electron',
      version: 1,
      documentChars: originalContent.length,
      documentRequirement: '>=5000',
      rounds,
      assertions: '10 rounds: total match count, windowed rendering with active-match retention, one active rectangle, rectangle dimensions, store/textarea unchanged, close/empty-query cleanup, no page errors',
      generatedAt: new Date().toISOString(),
    }, null, 2))
    console.log(`PASS: 10/10 search highlight rounds; report=${RESULT_FILE}`)
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
