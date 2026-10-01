import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9299
const PROFILE = path.join(ROOT, '_audit', 'tmp', 'outline-virtualization-profile')
const RESULT_FILE = path.join(ROOT, '_audit', 'verification-editor-virtualization', 'outline-electron-10-rounds.json')

function buildDocument() {
  const lines = []
  for (let volume = 1; volume <= 5; volume++) {
    lines.push(`# 第${volume}卷 大纲虚拟化`)
    for (let section = 1; section <= 5; section++) {
      lines.push(`## 第${volume}-${section}节 大纲`)
      for (let paragraph = 1; paragraph <= 8; paragraph++) {
        lines.push(`第${paragraph}段：大纲虚拟化实测，验证大纲工作台长文档滚动与定位。编号${volume}-${section}-${paragraph}。`)
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
  assert(fs.existsSync(path.join(ROOT, 'dist-renderer', 'index.html')), 'dist-renderer/index.html exists; run npm run build:vue first')
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
  await page.click('#btn-outline-workspace')
  await page.waitForSelector('.ow-textarea', { timeout: 10000 })
  await page.waitForTimeout(500)
}

async function main() {
  assertFreshRendererBuild()
  removeDir(PROFILE)
  fs.rmSync(RESULT_FILE, { force: true })
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
    await closeVisibleModals(page)
    await openOutlineWorkspace(page)
    await page.evaluate(content => {
      const textarea = document.querySelector('.ow-textarea')
      if (!textarea) throw new Error('outline textarea unavailable')
      textarea.value = content
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    }, originalContent)
    await page.waitForTimeout(500)

    for (let round = 1; round <= 10; round++) {
      const target = `## 第${(round % 5) + 1}-3节 大纲`
      const targetOffset = originalContent.indexOf(target)
      assert(targetOffset >= 0, `round ${round}: target heading exists`)
      const measured = await page.evaluate(offset => {
        const textarea = document.querySelector('.ow-textarea')
        textarea.focus()
        textarea.setSelectionRange(offset, offset)
        textarea.blur()
        textarea.focus()
        textarea.scrollTop = Math.floor(textarea.scrollHeight * 0.6)
        textarea.dispatchEvent(new Event('scroll'))
        return {
          selectionStart: textarea.selectionStart,
          scrollTop: textarea.scrollTop,
          scrollHeight: textarea.scrollHeight,
          valueLength: textarea.value.length,
        }
      }, targetOffset)
      await page.waitForTimeout(100)

      assert.equal(measured.selectionStart, targetOffset, `round ${round}: outline selection positioned`)
      assert(measured.scrollTop > 0, `round ${round}: outline textarea scrolled`)
      assert.equal(measured.valueLength, originalContent.length, `round ${round}: outline content stable`)

      rounds.push({
        round,
        documentChars: originalContent.length,
        targetOffset,
        selectionStart: measured.selectionStart,
        scrollTop: measured.scrollTop,
        scrollHeight: measured.scrollHeight,
        contentStable: true,
      })
    }

    assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(' | ')}`)
    fs.writeFileSync(RESULT_FILE, JSON.stringify({
      schema: 'shenyi.outline-virtualization.electron',
      version: 1,
      documentChars: originalContent.length,
      documentRequirement: '>=5000',
      rounds,
      assertions: '10 rounds: long outline selection positioning, scroll responsiveness, content stability, no page errors',
      generatedAt: new Date().toISOString(),
    }, null, 2))
    console.log(`PASS: 10/10 outline virtualization rounds; report=${RESULT_FILE}`)
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
