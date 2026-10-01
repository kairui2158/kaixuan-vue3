import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9298
const PROFILE = path.join(ROOT, '_audit', 'tmp', 'editor-virtualization-profile')
const RESULT_FILE = path.join(ROOT, '_audit', 'verification-editor-virtualization', 'electron-10-rounds.json')

function buildDocument() {
  const lines = []
  for (let volume = 1; volume <= 5; volume++) {
    lines.push(`# 第${volume}卷 虚拟化实测`)
    for (let section = 1; section <= 5; section++) {
      lines.push(`## 第${volume}-${section}节 虚拟化`)
      for (let paragraph = 1; paragraph <= 8; paragraph++) {
        lines.push(`第${paragraph}段：虚拟化实测正文，验证滚动重绘、搜索窗口、跳转定位与写入跟随。编号${volume}-${section}-${paragraph}。`)
      }
    }
  }
  const document = lines.join('\n')
  assert(document.length >= 5000, `document >= 5000 chars, got ${document.length}`)
  return document
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
    const store = pinia._s.get('editor')
    store.tabs.splice(0)
    store.bookmarks = []
    store.openTab({
      id: 'editor-virtualization-probe',
      title: '虚拟化实测',
      content,
      chapterId: '',
      isDirty: false,
      mode: 'ch-body',
    })
    store.activeTabId = 'editor-virtualization-probe'
  }, originalContent)
  await page.waitForSelector('#editor-content', { timeout: 10000 })
  await page.waitForTimeout(400)
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
      const targetLine = (round % 5) + 1
      const targetText = `## 第${targetLine}-3节 虚拟化`
      const targetOffset = originalContent.indexOf(targetText)
      assert(targetOffset >= 0, `round ${round}: target heading exists`)

      await page.evaluate(() => {
        const textarea = document.querySelector('#editor-content')
        textarea.scrollTop = 0
        textarea.dispatchEvent(new Event('scroll'))
      })
      await page.waitForTimeout(80)
      await openFind(page)
      await page.fill('#find-input', '虚拟化实测正文')
      await page.click('#btn-find-next')
      await page.waitForTimeout(180)

      const initial = await page.evaluate(() => ({
        highlights: document.querySelectorAll('.editor-search-highlight').length,
        activeHighlights: document.querySelectorAll('.editor-search-highlight-active').length,
        scrollTop: document.querySelector('#editor-content').scrollTop,
        value: document.querySelector('#editor-content').value,
      }))
      assert(initial.highlights > 0, `round ${round}: visible highlight rectangle rendered`)
      assert.equal(initial.activeHighlights, 1, `round ${round}: active highlight retained`)
      assert.equal(initial.value, originalContent, `round ${round}: content unchanged`)

      await page.evaluate(({ offset, ratio }) => {
        const textarea = document.querySelector('#editor-content')
        textarea.focus()
        textarea.setSelectionRange(offset, offset)
        textarea.blur()
        textarea.focus()
        textarea.scrollTop = textarea.scrollHeight * ratio
        textarea.dispatchEvent(new Event('scroll'))
      }, { offset: targetOffset, ratio: round / 20 })
      await page.waitForTimeout(120)

      const scrolled = await page.evaluate(() => ({
        highlights: document.querySelectorAll('.editor-search-highlight').length,
        activeHighlights: document.querySelectorAll('.editor-search-highlight-active').length,
        scrollTop: document.querySelector('#editor-content').scrollTop,
      }))
      assert(scrolled.highlights > 0, `round ${round}: highlights repainted after scroll`)
      assert.equal(scrolled.activeHighlights, 1, `round ${round}: active highlight retained after scroll`)
      assert(scrolled.scrollTop > 0, `round ${round}: editor scrolled`)

      const targetHighlightTop = await page.evaluate(() => {
        const item = document.querySelector('.editor-search-highlight-active')
        return item ? parseFloat(item.style.top) : null
      })
      assert(targetHighlightTop !== null, `round ${round}: active highlight measurable`)
      assert(targetHighlightTop >= 0, `round ${round}: active highlight top valid`)

      rounds.push({
        round,
        documentChars: originalContent.length,
        renderedHighlights: scrolled.highlights,
        activeHighlights: scrolled.activeHighlights,
        scrollTop: scrolled.scrollTop,
        activeHighlightTop: targetHighlightTop,
        contentUnchanged: true,
      })
    }

    assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(' | ')}`)
    fs.writeFileSync(RESULT_FILE, JSON.stringify({
      schema: 'shenyi.editor-virtualization.electron',
      version: 1,
      documentChars: originalContent.length,
      documentRequirement: '>=5000',
      rounds,
      assertions: '10 rounds: scroll-triggered repainting, windowed highlight rendering, active-match retention, unchanged content, no page errors',
      generatedAt: new Date().toISOString(),
    }, null, 2))
    console.log(`PASS: 10/10 virtualization rounds; report=${RESULT_FILE}`)
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
