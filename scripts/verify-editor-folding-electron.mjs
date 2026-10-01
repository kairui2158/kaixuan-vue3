import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9293
const PROFILE = path.join(ROOT, '_audit', 'tmp', 'editor-folding-profile')
const RESULT_FILE = path.join(ROOT, '_audit', 'verification-editor-folding', 'electron-10-rounds.json')

function buildLongDocument() {
  const lines = []
  for (let volume = 1; volume <= 5; volume++) {
    lines.push(`# 第${volume}卷 长文档折叠实测`)
    for (let section = 1; section <= 5; section++) {
      lines.push(`## 第${volume}-${section}节 长文档导航`)
      for (let paragraph = 1; paragraph <= 8; paragraph++) {
        lines.push(`第${paragraph}段：长文档折叠实测内容，保持原文字符不变，只验证渲染折叠、定位展开与光标恢复。验证编号为第${volume}-${section}-${paragraph}。`)
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
    store.clearUndoHistoryForTab('editor-folding-probe')
    store.openTab({
      id: 'editor-folding-probe',
      title: '折叠实测',
      content,
      chapterId: '',
      isDirty: false,
      mode: 'ch-body',
    })
    store.activeTabId = 'editor-folding-probe'
  }, originalContent)
  const visibleState = await page.evaluate(() => ({
    bodyText: document.body.innerText.slice(0, 800),
    window: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
    textarea: (() => {
      const element = document.querySelector('#editor-content')
      if (!element) return null
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return {
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        display: style.display,
        visibility: style.visibility,
        disabled: element.disabled,
      }
    })(),
    candidates: [...document.querySelectorAll('.project-modal-content, .project-transition-confirm, #settings-modal, #dashboard-modal, #app > *')]
      .filter(element => getComputedStyle(element).display !== 'none')
      .slice(0, 20)
      .map(element => ({
        id: element.id,
        className: String(element.className).slice(0, 120),
        text: element.textContent?.trim().slice(0, 120),
      })),
    editorPanel: (() => {
      const panel = document.querySelector('#editor-panel')
      if (!panel) return null
      return {
        tag: panel.tagName,
        childCount: panel.children.length,
        textareaCount: panel.querySelectorAll('textarea').length,
        html: panel.outerHTML.slice(0, 1000),
      }
    })(),
    globalTextareaCount: document.querySelectorAll('textarea').length,
    frames: [...document.querySelectorAll('iframe')].map(frame => ({ id: frame.id, src: frame.src })),
  }))
  console.log('[STARTUP STATE]', JSON.stringify(visibleState, null, 2))
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
    if (pageErrors.length) console.log('[PREPARE ERRORS]', JSON.stringify(pageErrors.slice(0, 20), null, 2))
    await page.screenshot({ path: path.join(path.dirname(RESULT_FILE), 'startup.png'), fullPage: true })
    await prepareEditor(page)

    for (let round = 1; round <= 10; round++) {
      const headingOffset = await page.evaluate(() => document.querySelector('#editor-content').value.indexOf('## 第3-2节 长文档导航'))
      assert(headingOffset >= 0, `round ${round}: heading exists`)
      await page.evaluate(offset => {
        const textarea = document.querySelector('#editor-content')
        textarea.focus()
        textarea.setSelectionRange(offset, offset)
      }, headingOffset)
      await page.click('#btn-fold')
      await page.waitForTimeout(120)
      const folded = await page.evaluate(() => ({
        value: document.querySelector('#editor-content').value,
        banner: !!document.querySelector('.editor-fold-banner'),
      }))
      assert(folded.banner, `round ${round}: fold banner visible`)
      assert(folded.value.includes('[已折叠'), `round ${round}: placeholder visible`)
      assert(!folded.value.includes('第1段：长文档折叠实测内容，保持原文字符不变，只验证渲染折叠、定位展开与光标恢复。验证编号为3-2-1。'), `round ${round}: body hidden`)

      const untouched = await page.evaluate(() => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        return pinia._s.get('editor').activeTab.content
      })
      assert.equal(untouched, originalContent, `round ${round}: stored content unchanged`)

      await page.evaluate(() => document.querySelector('#editor-content').focus())
      await page.keyboard.type('x')
      await page.waitForTimeout(150)
      const readonlyFolded = await page.evaluate(() => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        return {
          value: document.querySelector('#editor-content').value,
          banner: !!document.querySelector('.editor-fold-banner'),
          stored: pinia._s.get('editor').activeTab.content,
        }
      })
      assert(!readonlyFolded.banner, `round ${round}: typing leaves read-only fold view`)
      assert.equal(readonlyFolded.value, originalContent, `round ${round}: typed char discarded when leaving fold view`)
      assert.equal(readonlyFolded.stored, originalContent, `round ${round}: typed char never reaches store`)
      const untouchedAfterTyping = await page.evaluate(() => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        return pinia._s.get('editor').activeTab.content
      })
      assert.equal(untouchedAfterTyping, originalContent, `round ${round}: typed char never reaches store`)

      await page.evaluate(() => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        const originalLength = pinia._s.get('editor').activeTab.content.length
        window.dispatchEvent(new CustomEvent('diff-locate', {
          detail: {
            workspace: 'main',
            targetId: 'editor-folding-probe',
            range: { start: originalLength, end: originalLength },
          },
        }))
      })
      await page.waitForTimeout(150)
      const expanded = await page.evaluate(() => ({
        value: document.querySelector('#editor-content').value,
        banner: !!document.querySelector('.editor-fold-banner'),
      }))
      assert(!expanded.banner, `round ${round}: locating unfolds view`)
      assert.equal(expanded.value, originalContent, `round ${round}: original text restored`)

      const selection = await page.evaluate(() => {
        const textarea = document.querySelector('#editor-content')
        return { start: textarea.selectionStart, end: textarea.selectionEnd }
      })
      assert.equal(selection.start, originalContent.length, `round ${round}: cursor mapped to original tail`)
      assert.equal(selection.end, originalContent.length, `round ${round}: selection mapped to original tail`)

      rounds.push({
        round,
        documentChars: originalContent.length,
        foldedChars: folded.value.length,
        restoredChars: expanded.value.length,
      })
    }

    assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(' | ')}`)
    fs.writeFileSync(RESULT_FILE, JSON.stringify({
      schema: 'shenyi.editor-folding.electron',
      version: 1,
      documentChars: originalContent.length,
      documentRequirement: '>=5000',
      readonlyInputGuard: 'typing in folded view exits fold mode and never mutates store',
      rounds,
      assertions: '10 rounds long-document fold/restore/store-integrity/cursor-mapping/readonly-input-guard',
      generatedAt: new Date().toISOString(),
    }, null, 2))
    console.log(`PASS: 10/10 folding rounds; report=${RESULT_FILE}`)
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
