import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const CDP = 'http://127.0.0.1:9227'
const AUDIT = 'D:/codex/novel-workshop-vue3/_audit'
const MARKER = 'DIRECT_EXIT_E2E_MARKER_' + Date.now()

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const browser = await chromium.connectOverCDP(CDP)
const contexts = browser.contexts()
if (!contexts.length) throw new Error('no CDP contexts')
const page = contexts[0].pages().find((p) => /index\.html|神意助手/.test(p.url() || '')) || contexts[0].pages()[0]
if (!page) throw new Error('no usable page')

const result = { steps: [] }
function step(name, ok, detail = '') {
  result.steps.push({ name, ok, detail: String(detail).slice(0, 300) })
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name} ${detail}`)
}

// 1. Read current lastProjectId so we can restore it after the test.
const originalLastProjectId = await page.evaluate(() => {
  try {
    return window.electronAPI?.storageRead('wa_lastProjectId') ?? null
  } catch {
    return null
  }
})
step('read original lastProjectId', !!originalLastProjectId || originalLastProjectId === null, originalLastProjectId)

// 2. Remove lastProjectId so this E2E runs against a brand-new temp project.
await page.evaluate(() => {
  window.electronAPI?.storageRemove('wa_lastProjectId')
})
await page.reload({ waitUntil: 'load' })
await sleep(1200)

const hasPinia = await page.evaluate(() => !!globalThis.__pinia)
step('pinia exposed after reload', hasPinia)

// 3. Prevent autosave from writing before we test direct-exit persistence.
const autoSavePatched = await page.evaluate(() => {
  try {
    const pinia = globalThis.__pinia
    const settings = pinia._s.get('settings')
    if (settings && 'autoSaveInterval' in settings) {
      settings.autoSaveInterval = 86400
      return true
    }
    return false
  } catch {
    return false
  }
})
step('autosave patched to 24h', autoSavePatched)

// 4. Open outline workspace through normal UI.
const outlineOpened = await page.evaluate(() => {
  const btn = document.querySelector('#btn-outline-workspace') || document.querySelector('[data-panel="outline"]')
  return { hasBtn: !!btn, opened: false }
})
if (!outlineOpened.hasBtn) {
  step('sidebar outline button exists', false, 'no #btn-outline-workspace')
} else {
  await page.evaluate(() => {
    const btn = document.querySelector('#btn-outline-workspace')
    btn?.click()
  })
  await sleep(400)
  const opened = await page.evaluate(() => !!document.getElementById('outline-workspace'))
  step('outline workspace opened', opened)
}

const OUTLINE = '# 直接退出保存测试第' + Date.now() + '卷\n## 第一章：直退保存测试\n## 第二章：验证第二点'
const outlineInput = await page.evaluate((text) => {
  const el = document.getElementById('outline-editor')
  if (!el) return { ok: false, err: 'no outline-editor' }
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  setter.call(el, text)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.blur()
  return { ok: true, value: el.value }
}, OUTLINE)
step('outline input set', outlineInput.ok, outlineInput.ok ? `chars=${outlineInput.value.length}` : outlineInput.err)

const locked = await page.evaluate(() => {
  const btn = document.getElementById('btn-lock-outline')
  if (!btn) return { ok: false, err: 'no lock btn' }
  btn.click()
  return { ok: true }
})
step('lock clicked', locked.ok, locked.err || '')
await sleep(1500)

const pipelineOpen = await page.evaluate(() => !!document.getElementById('pipeline-panel'))
step('pipeline opened after lock', pipelineOpen)

await page.evaluate(() => {
  const closeBtn = document.getElementById('btn-close-pl')
  closeBtn?.click()
})
await sleep(500)

const projectId = await page.evaluate(() => {
  try {
    const project = globalThis.__pinia?._s?.get('project')
    return project?.currentProjectId ?? null
  } catch {
    return null
  }
})
step('new temp project id captured', !!projectId, projectId)

// 5. Open first chapter in the sidebar tree.
const chapterClicked = await page.evaluate(() => {
  const ch = document.querySelector('.chapter-item')
  if (!ch) return { ok: false, err: 'no chapter-item' }
  ch.click()
  return { ok: true }
})
step('chapter clicked', chapterClicked.ok, chapterClicked.err || '')
await sleep(600)

const editorReady = await page.evaluate(() => {
  const el = document.getElementById('editor-content')
  return { ready: !!el, disabled: el ? el.disabled : null }
})
step('editor ready', editorReady.ready && !editorReady.disabled, `disabled=${editorReady.disabled}`)

// 6. Type body text, but do NOT save. This proves direct exit persists it.
const bodySet = await page.evaluate((marker) => {
  const el = document.getElementById('editor-content')
  if (!el) return { ok: false, err: 'no editor-content' }
  const content = '这是一段用于验证直接退出保存的内容。\n' + marker
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  setter.call(el, content)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.blur()
  return { ok: true, content, chars: content.length }
}, MARKER)
step('body text set (not saved)', bodySet.ok, bodySet.ok ? `chars=${bodySet.chars}` : bodySet.err)

const bodyInStoreNow = await page.evaluate((marker) => {
  try {
    const project = globalThis.__pinia?._s?.get('project')
    const chapters = project?.chapters || {}
    for (const volId of Object.keys(chapters)) {
      for (const ch of chapters[volId]) {
        if (typeof ch.body === 'string' && ch.body.includes(marker)) {
          return { found: true, chId: ch.id }
        }
      }
    }
    return { found: false }
  } catch {
    return { found: false, err: 'pinia read failed' }
  }
}, MARKER)
step('body NOT written to store before exit', !bodyInStoreNow.found, bodyInStoreNow.found ? 'already saved' : 'confirmed not saved')

result.marker = MARKER
result.projectId = projectId
result.originalLastProjectId = originalLastProjectId
result.stepsOk = result.steps.filter((s) => s.ok).length
result.stepsTotal = result.steps.length

fs.writeFileSync(path.join(AUDIT, 'E2E_SETUP_RESULT.json'), JSON.stringify(result, null, 2), 'utf8')
console.log('SETUP_RESULT=' + JSON.stringify(result))

await browser.close()
