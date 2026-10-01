import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9297
const PROFILE = path.join(ROOT, '_audit', 'tmp', 'editor-long-document-benchmark-profile')
const RESULT_FILE = path.join(ROOT, '_audit', 'verification-editor-long-document', 'long-document-benchmark.json')

function buildLongDocument() {
  const lines = []
  const targetChars = 500_000
  const paragraph = '长文档基准段落。它用于验证滚动、跳转、搜索与写入跟随是否在超长输入下保持响应；第%d段。'
  let chars = 0
  let line = 1
  while (chars < targetChars) {
    if (line % 20 === 1) {
      lines.push(`# 基准标题 ${line}`)
      chars += `# 基准标题 ${line}`.length + 1
    }
    if (line === 7999) {
      lines.push('唯一基准标记7999')
      chars += '唯一基准标记7999'.length + 1
    }
    const text = paragraph.replace('%d', String(line))
    lines.push(text)
    chars += text.length + 1
    line += 1
  }
  const document = lines.join('\n')
  assert(document.length >= 500_000, `document >= 500000 chars, got ${document.length}`)
  return document
}

const content = buildLongDocument()

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

async function prepareEditor(page) {
  await page.evaluate(content => {
    const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
    const store = pinia._s.get('editor')
    store.tabs.splice(0)
    store.bookmarks = []
    store.openTab({
      id: 'editor-long-document-benchmark',
      title: '长文档基准',
      content,
      chapterId: '',
      isDirty: false,
      mode: 'ch-body',
    })
    store.activeTabId = 'editor-long-document-benchmark'
  }, content)
  await page.waitForSelector('#editor-content', { timeout: 20000 })
  await page.waitForTimeout(1200)
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

async function measureAction(page, name, action) {
  const started = performance.now()
  await action()
  await page.waitForTimeout(80)
  return { name, ms: Math.round(performance.now() - started) }
}

async function main() {
  assertFreshRendererBuild()
  removeDir(PROFILE)
  removeDir(path.dirname(RESULT_FILE))
  fs.mkdirSync(path.dirname(RESULT_FILE), { recursive: true })

  const electronProcess = startElectron()
  let browser = null
  try {
    assert(await waitForCdp(), 'CDP reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    const page = browser.contexts()[0]?.pages()?.[0]
    assert(page, 'renderer page reachable')
    await page.waitForSelector('#app', { timeout: 30000 })
    await page.waitForTimeout(2000)
    await closeVisibleModals(page)
    await prepareEditor(page)

    const actions = []
    actions.push(await measureAction(page, 'scroll', async () => {
      await page.evaluate(() => {
        const textarea = document.querySelector('#editor-content')
        textarea.scrollTop = textarea.scrollHeight * 0.5
        textarea.dispatchEvent(new Event('scroll'))
      })
    }))
    actions.push(await measureAction(page, 'jump', async () => {
      const offset = Math.floor(content.length * 0.75)
      await page.evaluate(offset => {
        const textarea = document.querySelector('#editor-content')
        textarea.focus()
        textarea.setSelectionRange(offset, offset)
        textarea.blur()
        textarea.focus()
      }, offset)
    }))
    actions.push(await measureAction(page, 'search', async () => {
      await page.click('#btn-find')
      await page.evaluate(() => {
        const pinia = window.__pinia || document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
        const store = pinia._s.get('editor')
        store.findQuery = '唯一基准标记7999'
      })
      await page.waitForTimeout(120)
      await page.evaluate(() => {
        document.querySelector('#btn-find-next')?.click()
      })
      await page.waitForTimeout(200)
    }))
    actions.push(await measureAction(page, 'write-follow', async () => {
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('editor-follow-progress', {
          detail: {
            workspace: 'main',
            targetId: 'editor-long-document-benchmark',
            start: document.querySelector('#editor-content').value.length - 20,
            end: document.querySelector('#editor-content').value.length,
          },
        }))
      })
    }))

    const result = await page.evaluate(() => ({
      valueLength: document.querySelector('#editor-content').value.length,
      highlightCount: document.querySelectorAll('.editor-search-highlight').length,
      activeHighlightCount: document.querySelectorAll('.editor-search-highlight-active').length,
      scrollTop: document.querySelector('#editor-content').scrollTop,
    }))
    assert.equal(result.valueLength, content.length, 'document fully loaded')
    assert(result.highlightCount > 0, 'windowed search highlights rendered')
    assert.equal(result.activeHighlightCount, 1, 'one active search highlight')
    assert(result.scrollTop >= 0, 'scroll position valid')

    const worst = Math.max(...actions.map(action => action.ms))
    fs.writeFileSync(RESULT_FILE, JSON.stringify({
      schema: 'shenyi.editor-long-document-benchmark',
      version: 1,
      documentChars: content.length,
      actions,
      worstActionMs: worst,
      result,
      generatedAt: new Date().toISOString(),
    }, null, 2))
    console.log(`PASS: benchmark document=${content.length} chars; worstActionMs=${worst}; report=${RESULT_FILE}`)
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
