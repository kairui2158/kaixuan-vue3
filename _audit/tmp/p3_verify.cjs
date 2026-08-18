const { chromium } = require('playwright')
const { execSync, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const CWD = process.cwd()
const TMP = path.join(CWD, '_audit', 'tmp')
const BAT = path.join(CWD, 'start-electron.bat')
const CDP_URL = 'http://127.0.0.1:9227'
const log = []

function record(line) {
  const ts = new Date().toISOString().slice(11, 19)
  log.push(`[${ts}] ${line}`)
  console.log(line)
}

function killElectron() {
  try {
    execSync('taskkill /f /im electron.exe', { stdio: 'ignore', windowsHide: true })
    record('KILL electron.exe')
  } catch {
    record('KILL: no electron.exe process')
  }
}

function launchApp() {
  const child = spawn(
    'cmd.exe',
    ['/c', 'start', '', '/min', BAT],
    { cwd: CWD, detached: true, stdio: 'ignore', windowsHide: true }
  )
  child.unref()
  record('LAUNCH start-electron.bat (detached, minimized)')
}

async function waitCdp(ms = 45000) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    try {
      const res = await fetch('http://127.0.0.1:9227/json/list')
      if (res.ok) return true
    } catch {}
    await new Promise((r) => setTimeout(r, 700))
  }
  return false
}

async function getMainPage(browser) {
  const deadline = Date.now() + 25000
  while (Date.now() < deadline) {
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        const u = p.url() || ''
        if (u.includes('index.html') || u.startsWith('file:')) return p
      }
    }
    await new Promise((r) => setTimeout(r, 600))
  }
  const ctx = browser.contexts()[0]
  if (!ctx) throw new Error('NO_CDP_PAGE_CONTEXT')
  return ctx.pages()[0] || null
}

async function shot(page, name) {
  const file = path.join(TMP, name)
  await page.screenshot({ path: file })
  record(`SHOT ${name}`)
  return file
}

async function chatState(page) {
  return page.evaluate(() => {
    const ps = window.__pinia._s.get('project')
    if (!ps) return null
    return {
      id: ps.currentProjectId,
      outline: ps.outlineText || '',
      chat: (ps.outlineChat || []).map((m) => ({ role: m.role, content: m.content }))
    }
  })
}

async function readStoredProject(page, id) {
  return page.evaluate((pid) => {
    return window.electronAPI.storageRead('wa_project_' + pid) || null
  }, id)
}

function trackApi(page) {
  const calls = []
  page.on('request', (req) => {
    const url = req.url() || ''
    if (url.includes('/chat/completions')) {
      calls.push({ url, ts: Date.now(), status: null })
    }
  })
  page.on('response', (res) => {
    const url = res.url() || ''
    if (url.includes('/chat/completions')) {
      const last = calls[calls.length - 1]
      if (last && last.url === url) last.status = res.status()
    }
  })
  return calls
}

async function waitForAssistantChat(page, minCount, timeoutMs = 150000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const st = await chatState(page)
    const assistant = (st.chat || []).filter((m) => m.role === 'assistant')
    if (assistant.length >= minCount) return st
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error('ASSISTANT_TIMEOUT')
}

async function main() {
  const results = {}
  let browser = null
  let testProjectId = null
  try {
    execSync('node _audit/tmp/data_backup.cjs backup', {
      cwd: CWD,
      stdio: 'pipe',
      windowsHide: true
    })
    record('BACKUP done')

    killElectron()
    await new Promise((r) => setTimeout(r, 1200))
    launchApp()
    if (!(await waitCdp())) throw new Error('CDP_TIMEOUT_AFTER_LAUNCH')
    browser = await chromium.connectOverCDP(CDP_URL)
    const page = await getMainPage(browser)
    if (!page) throw new Error('NO_MAIN_PAGE')
    record('CDP_CONNECTED target=' + page.url())
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('#btn-outline-workspace', { state: 'visible', timeout: 15000 })

    const provider = await page.evaluate(() => {
      const s = window.__pinia._s.get('provider')
      const p = s && s.activeGenerateProvider
      return {
        name: p && p.name,
        baseUrl: p && p.baseUrl,
        selectedModel: p && p.selectedModel,
        hasKey: !!(p && p.apiKey)
      }
    })
    results.provider = provider
    record('PROVIDER ' + JSON.stringify(provider))
    if (!provider || !provider.hasKey || !provider.baseUrl) {
      throw new Error('PROVIDER_MISSING')
    }

    await page.click('#btn-outline-workspace')
    await page.waitForSelector('#btn-ai-co-create', { state: 'visible', timeout: 10000 })
    await page.click('#btn-ai-co-create')
    await page.waitForSelector('#ow-chat-messages', { state: 'visible', timeout: 10000 })
    await page.waitForSelector('#ow-chat-input', { state: 'visible', timeout: 10000 })
    await shot(page, 'p3_outline_ai_create.png')

    testProjectId = await page.evaluate(() => {
      const ps = window.__pinia._s.get('project')
      const id = 'proj-p3-' + Date.now()
      ps.currentProjectId = id
      ps.projectName = 'P3验证项目'
      ps.outlineText = '待插入前缀'
      ps.outlineChat.splice(0)
      ps.setOutline('待插入前缀')
      ps.saveProject()
      return id
    })
    record('TEMP_PROJECT ' + testProjectId)

    const apiCalls = trackApi(page)
    await page.locator('#ow-chat-input').fill('只回复OK，不要任何其他文字')
    results.sendBefore = await chatState(page)
    await page.click('#btn-ow-send')
    const stReply = await waitForAssistantChat(page, 1)
    const replyContent = (stReply.chat || []).filter((m) => m.role === 'assistant').pop().content
    results.reply = replyContent
    results.apiCalls = apiCalls
    record('API_CALLS ' + JSON.stringify(apiCalls.map((c) => ({ url: c.url, status: c.status }))))
    record('REPLY ' + JSON.stringify(replyContent))
    if (String(replyContent || '').trim() !== 'OK') {
      throw new Error('REPLY_NOT_OK expected=OK actual=' + replyContent)
    }
    await shot(page, 'p3_chat_reply.png')

    await page.evaluate(() => {
      window.__copied = ''
      navigator.clipboard.writeText = async (t) => { window.__copied = t }
    })
    await page.locator('.ow-msg.assistant .msg-btn[title="复制"]').last().click()
    await page.waitForTimeout(200)
    const copied = await page.evaluate(() => window.__copied)
    results.copy = copied
    record('COPY ' + JSON.stringify(copied) + ' => ' + (copied === 'OK' ? 'PASS' : 'FAIL'))
    if (copied !== 'OK') throw new Error('COPY_FAIL')

    await page.locator('.ow-msg.assistant .msg-btn[title="替换整个大纲"]').last().click()
    await page.waitForTimeout(300)
    const afterReplace = await chatState(page)
    results.afterReplace = { outline: afterReplace.outline, chatLen: afterReplace.chat.length }
    record('REPLACE outline=' + JSON.stringify(afterReplace.outline) + ' => ' + (afterReplace.outline === 'OK' ? 'PASS' : 'FAIL'))
    if (afterReplace.outline !== 'OK') throw new Error('REPLACE_FAIL')

    await page.evaluate((text) => {
      const ps = window.__pinia._s.get('project')
      ps.outlineText = text
      ps.setOutline(text)
    }, 'prefix')
    await page.waitForTimeout(300)
    await page.evaluate(() => {
      const ta = document.querySelector('#outline-editor')
      if (ta) {
        ta.focus()
        ta.setSelectionRange(2, 2)
      }
    })
    await page.waitForTimeout(100)
    await page.locator('.ow-msg.assistant .msg-btn[title="插入到光标处"]').last().click()
    await page.waitForTimeout(300)
    const afterInsert = await chatState(page)
    results.afterInsert = afterInsert.outline
    record('INSERT outline=' + JSON.stringify(afterInsert.outline) + ' => ' + (afterInsert.outline === 'prOKefix' ? 'PASS' : 'FAIL'))
    if (afterInsert.outline !== 'prOKefix') throw new Error('INSERT_FAIL')

    const callsBeforeRegen = apiCalls.length
    await page.locator('.ow-msg.assistant .msg-btn[title="重新生成该回复"]').last().click()
    const startRegen = Date.now()
    while (Date.now() - startRegen < 150000) {
      await new Promise((r) => setTimeout(r, 800))
      const st = await chatState(page)
      const assistant = (st.chat || []).filter((m) => m.role === 'assistant')
      if (apiCalls.length > callsBeforeRegen && assistant.length === 1 && String(assistant[0].content || '').trim() === 'OK') {
        results.afterRegen = st
        break
      }
    }
    if (!results.afterRegen) throw new Error('REGENERATE_TIMEOUT')
    record('REGENERATE ok chatLen=' + results.afterRegen.chat.length + ' calls=' + apiCalls.length)
    await shot(page, 'p3_chat_regenerate.png')

    const stored = await readStoredProject(page, testProjectId)
    const storeChat = results.afterRegen.chat
    const storedChat = (stored && stored.outlineChat) || []
    results.persist = {
      storeLen: storeChat.length,
      storedLen: storedChat.length,
      lastStore: storeChat[storeChat.length - 1],
      lastStored: storedChat[storedChat.length - 1]
    }
    const persistOk =
      storeChat.length === storedChat.length &&
      storeChat.length === 2 &&
      String(storedChat[storedChat.length - 1].content || '').trim() === 'OK'
    record('PERSIST storeLen=' + storeChat.length + ' storedLen=' + storedChat.length + ' => ' + (persistOk ? 'PASS' : 'FAIL'))
    if (!persistOk) throw new Error('PERSIST_FAIL')
    await shot(page, 'p3_chat_final.png')

    await page.evaluate((pid) => {
      const ps = window.__pinia._s.get('project')
      if (ps && ps.deleteProject) ps.deleteProject(pid)
    }, testProjectId)
    testProjectId = null
    record('CLEANUP deleted test project')

    results.pass = true
    record('P3 PASS')
  } catch (err) {
    results.pass = false
    results.error = String(err && err.message ? err.message : err)
    record('P3 FAIL: ' + results.error)
  } finally {
    if (browser) await browser.close().catch(() => {})
    if (testProjectId) {
      try {
        const b2 = await chromium.connectOverCDP(CDP_URL).catch(() => null)
        if (b2) {
          const p = await getMainPage(b2)
          if (p) await p.evaluate((pid) => {
            const ps = window.__pinia._s.get('project')
            if (ps && ps.deleteProject) ps.deleteProject(pid)
          }, testProjectId).catch(() => {})
          await b2.close().catch(() => {})
        }
      } catch {}
    }
    try {
      execSync('node _audit/tmp/data_backup.cjs restore', {
        cwd: CWD,
        stdio: 'pipe',
        windowsHide: true
      })
      record('RESTORE user data after test')
    } catch (err) {
      record('RESTORE FAIL: ' + String(err))
    }
    killElectron()
    fs.writeFileSync(
      path.join(TMP, 'p3_verify_result.json'),
      JSON.stringify(
        {
          phase: 'P3',
          timestamp: new Date().toISOString(),
          pass: results.pass,
          results,
          log
        },
        null,
        2
      ),
      'utf8'
    )
    record('RESULT_JSON _audit/tmp/p3_verify_result.json')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
