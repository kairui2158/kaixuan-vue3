import { createRequire } from 'node:module'

const require = createRequire('D:/codex/novel-workshop-vue3/package.json')
const { chromium } = require('playwright')
const { spawn } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')

const ROOT = 'D:/codex/novel-workshop-vue3'
const EXE = path.join(ROOT, 'node_modules/electron/dist/electron.exe')
const PORT = 9341
const PROFILE = path.join(ROOT, '_data/app-confirm-layering-profile')
const CONFIRM_INPUT = '层级回归探针消息'

fs.rmSync(PROFILE, { recursive: true, force: true })
fs.mkdirSync(PROFILE, { recursive: true })

let electron
let browser

function assertCondition(condition, message, details = null) {
  if (!condition) {
    throw new Error(message + (details ? ' | ' + JSON.stringify(details) : ''))
  }
}

async function getPinia(page, storeId) {
  return await page.evaluate(async (id) => {
    const store = window.__pinia?._s?.get(id)
    if (!store) return null
    return JSON.parse(JSON.stringify({ id, state: store.$state }))
  }, storeId)
}

async function readStorage(page, key) {
  return await page.evaluate(async (storageKey) => {
    const value = await window.electronAPI.storageRead(storageKey)
    return value === undefined ? null : JSON.parse(JSON.stringify(value))
  }, key)
}

async function clickConfirmButton(page, selector) {
  await page.locator(selector).click({ force: false })
  await page.waitForTimeout(400)
}

try {
  electron = spawn(EXE, ['.', `--remote-debugging-port=${PORT}`, '--remote-allow-origins=*', `--user-data-dir=${PROFILE}`], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'development',
      SHENYI_TEST_USER_DATA_DIR: PROFILE,
      SHENYI_ALLOW_TEST_ISOLATION: '1',
      SHENYI_DATA_DIR: path.join(PROFILE, 'documents-data')
    }
  })

  let version = null
  for (let i = 0; i < 80 && !version; i++) {
    await new Promise(resolve => setTimeout(resolve, 250))
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      if (response.ok) version = await response.json()
    } catch {}
  }
  assertCondition(version, 'Electron CDP not ready')

  browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`)
  const page = browser.contexts()[0].pages()[0] || await browser.contexts()[0].newPage()
  await page.waitForSelector('#app', { timeout: 20000 })
  await page.waitForTimeout(1500)
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
  await page.waitForTimeout(500)

  const initialProject = await getPinia(page, 'project')
  assertCondition(initialProject, 'project store missing')

  await page.click('#btn-outline-workspace')
  await page.waitForSelector('#outline-editor', { timeout: 10000 })
  await page.locator('#btn-ai-co-create').click()
  await page.waitForSelector('#ow-chat-input', { timeout: 10000 })

  await page.locator('#ow-chat-input').fill(CONFIRM_INPUT)
  await page.evaluate(() => {
    const project = window.__pinia?._s?.get('project')
    assertTestProject(project)
    function assertTestProject(target) {
      if (!target) throw new Error('project store missing before UI message injection')
      target.outlineChat = [{ role: 'user', content: '层级回归探针消息' }]
    }
  })
  await page.waitForTimeout(300)

  await page.click('#btn-ow-reset-conversation')
  await page.waitForTimeout(500)

  const layering = await page.evaluate(() => {
    const overlay = document.querySelector('.app-confirm-overlay')
    const button = document.querySelector('#btn-ow-reset-conversation')
    const outline = document.querySelector('#outline-workspace')
    const confirmButton = overlay?.querySelector('.btn-danger')
    const zIndex = element => element ? Number(getComputedStyle(element).zIndex) : null
    let hit = null
    if (confirmButton) {
      const rect = confirmButton.getBoundingClientRect()
      hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    }
    return {
      overlayExists: Boolean(overlay),
      overlayZ: zIndex(overlay),
      outlineZ: zIndex(outline),
      hitTag: hit?.tagName,
      hitId: hit?.id,
      hitClass: String(hit?.className || ''),
      confirmText: confirmButton?.textContent?.trim(),
      buttonDisabled: Boolean(button?.disabled),
      confirmCount: document.querySelectorAll('.app-confirm-overlay').length
    }
  })

  assertCondition(layering.overlayExists, 'outline reset confirm modal missing', layering)
  assertCondition(layering.overlayZ === 9000, 'outline reset confirm z-index must be 9000', layering)
  assertCondition(layering.outlineZ >= 3000, 'outline workspace must stay in modal queue range', layering)
  assertCondition(layering.confirmCount === 1, 'duplicate confirm overlays detected', layering)
  assertCondition(layering.confirmText === '清空', 'confirm button text mismatch', layering)
  assertCondition(layering.hitClass.includes('btn-danger'), 'confirm button is not hit at its center', layering)
  console.log('[PASS] outline reset confirm is above workspace and clickable', layering)

  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  const afterEscape = await page.evaluate(() => ({
    confirmCount: document.querySelectorAll('.app-confirm-overlay').length,
    outlineExists: Boolean(document.querySelector('#outline-workspace')),
    outlineVisible: Boolean(document.querySelector('#outline-editor'))
  }))
  assertCondition(afterEscape.confirmCount === 0, 'confirm modal should close on Escape', afterEscape)
  assertCondition(afterEscape.outlineExists && afterEscape.outlineVisible, 'outline workspace should stay open after confirm Escape', afterEscape)
  console.log('[PASS] confirm Escape closes only the confirm layer', afterEscape)

  await page.click('#btn-ow-reset-conversation')
  await page.waitForSelector('.app-confirm-overlay', { timeout: 5000 })
  await clickConfirmButton(page, '.app-confirm-overlay .btn-danger')

  const afterOutlineReset = await page.evaluate(() => ({
    messageCount: document.querySelectorAll('#ow-chat-messages .ow-msg').length,
    noticeText: document.querySelector('#ow-compatibility-notice')?.textContent?.trim() || '',
    workspaceExists: Boolean(document.querySelector('#outline-workspace')),
    confirmCount: document.querySelectorAll('.app-confirm-overlay').length
  }))
  assertCondition(afterOutlineReset.workspaceExists, 'outline workspace disappeared after reset', afterOutlineReset)
  assertCondition(afterOutlineReset.confirmCount === 0, 'confirm modal remains after accepting reset', afterOutlineReset)
  assertCondition(afterOutlineReset.messageCount === 1, 'reset should keep only compatibility notice in DOM count', afterOutlineReset)
  assertCondition(afterOutlineReset.noticeText.includes('上下文已重置'), 'reset notice missing', afterOutlineReset)

  const outlineProjectState = await getPinia(page, 'project')
  assertCondition(Array.isArray(outlineProjectState?.state?.outlineChat), 'outlineChat state missing', outlineProjectState)
  assertCondition(outlineProjectState.state.outlineChat.length === 0, 'outlineChat must be cleared in store', outlineProjectState.state)
  const outlineProjectId = String(outlineProjectState.state.currentProjectId || 'default')
  const outlineContext = await readStorage(page, `wa_ctx_${outlineProjectId}`)
  const outlineSession = outlineContext?.sessions?.find?.(session =>
    session?.scope?.projectId === outlineProjectId &&
    session?.scope?.workspace === 'outline' &&
    session?.scope?.purpose === 'generate'
  )
  assertCondition(!outlineSession || !Array.isArray(outlineSession.messages) || outlineSession.messages.length === 0, 'outline context session must be cleared', outlineSession)
  console.log('[PASS] outline reset clears UI and scoped context', {
    projectId: outlineProjectId,
    outlineChatLength: outlineProjectState.state.outlineChat.length,
    sessionMessages: outlineSession?.messages?.length ?? 0
  })

  await page.locator('#btn-close-outline-workspace').click()
  await page.waitForTimeout(600)
  assertCondition(await page.locator('#outline-workspace').count() === 0, 'outline workspace did not close before home reset test')

  const homeBefore = await page.evaluate(() => {
    const chat = window.__pinia?._s?.get('chat')
    if (!chat) throw new Error('chat store missing before home reset')
    chat.ensureSession('', '', '确认框层级回归', 'default')
    const session = chat.activeSession
    if (!session) throw new Error('active chat session missing before home reset')
    session.messages = [{ id: 'msg_confirm_layering_probe', role: 'user', content: '层级回归探针消息', ts: Date.now() }]
    return {
      messagesLength: chat.activeMessages.length,
      activeSessionId: session.id,
      sessionCount: chat.sessions.length
    }
  })
  assertCondition(homeBefore.messagesLength === 1, 'home chat injection failed', homeBefore)
  await page.click('#btn-reset-conversation')
  await page.waitForTimeout(500)

  const homeLayering = await page.evaluate(() => {
    const overlay = document.querySelector('.app-confirm-overlay')
    const confirmButton = overlay?.querySelector('.btn-danger')
    let hit = null
    if (confirmButton) {
      const rect = confirmButton.getBoundingClientRect()
      hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    }
    return {
      overlayExists: Boolean(overlay),
      overlayZ: overlay ? Number(getComputedStyle(overlay).zIndex) : null,
      hitClass: String(hit?.className || '')
    }
  })
  assertCondition(homeLayering.overlayExists, 'home reset confirm modal missing', homeLayering)
  assertCondition(homeLayering.overlayZ === 9000, 'home reset confirm z-index must be 9000', homeLayering)
  assertCondition(homeLayering.hitClass.includes('btn-danger'), 'home confirm button is not hit at its center', homeLayering)
  await clickConfirmButton(page, '.app-confirm-overlay .btn-danger')

  const homeAfter = await page.evaluate(() => {
    const chat = window.__pinia?._s?.get('chat')
    return {
      messagesLength: chat?.activeMessages?.length ?? null,
      inputText: document.querySelector('#user-input')?.value || ''
    }
  })
  const projectAfterHomeReset = await getPinia(page, 'project')
  const homeProjectId = String(projectAfterHomeReset?.state?.currentProjectId || 'default')
  const homeContext = await readStorage(page, `wa_ctx_${homeProjectId}`)
  const homeSession = homeContext?.sessions?.find?.(session =>
    session?.scope?.projectId === homeProjectId &&
    session?.scope?.workspace === 'main' &&
    session?.scope?.purpose === 'generate'
  )
  assertCondition(homeAfter.messagesLength === 0, 'home UI messages must be cleared', homeAfter)
  assertCondition(homeAfter.inputText === '', 'home input must be cleared', homeAfter)
  assertCondition(!homeSession || !Array.isArray(homeSession.messages) || homeSession.messages.length === 0, 'home context session must be cleared', homeSession)
  console.log('[PASS] home reset clears UI and scoped context', {
    projectId: homeProjectId,
    messagesLength: homeAfter.messagesLength,
    sessionMessages: homeSession?.messages?.length ?? 0
  })

  console.log('[PASS] app confirm layering regression complete')
} finally {
  if (browser) await browser.close().catch(() => {})
  if (electron && !electron.killed) electron.kill()
  // Windows can keep profile handles open briefly after Electron exits.
  let cleanupCode = ''
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 200))
    try {
      fs.rmSync(PROFILE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
      break
    } catch (error) {
      if (['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(error?.code)) cleanupCode = error.code
      else throw error
    }
  }
  if (cleanupCode) {
    const stale = `${PROFILE}-stale-${Date.now()}`
    try {
      fs.renameSync(PROFILE, stale)
      fs.rmSync(stale, { recursive: true, force: true })
      cleanupCode = ''
    } catch {
      console.warn(`profile cleanup retained after retries: ${cleanupCode}`)
    }
  }
  console.log('profile removed=' + !fs.existsSync(PROFILE))
}

process.exit(0)
