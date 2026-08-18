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
      const res = await fetch(CDP_URL.replace('9227', '9227/json/list'))
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

async function storageBadKeys(page) {
  return page.evaluate(() => {
    const keys = window.electronAPI.storageList() || []
    return keys.filter((k) => {
      return (
        k.startsWith('wa_project') ||
        k === 'wa_projects' ||
        k === 'wa_lastProjectId' ||
        k.startsWith('project_') ||
        k.startsWith('project-')
      )
    })
  })
}

async function openProjectModal(page) {
  await page.click('#btn-open-project')
  await page.waitForSelector('.project-modal-content', { state: 'visible', timeout: 10000 })
  await page.evaluate(() => {
    window.confirm = () => true
    window.alert = (msg) => console.log('ALERT:' + msg)
  })
}

async function deleteAllProjects(page) {
  let deleted = 0
  while (true) {
    const count = await page.locator('.project-modal-content .project-item').count()
    if (count === 0) break
    await page.locator('.project-modal-content .project-item-actions .btn-danger').first().click()
    await page.waitForTimeout(400)
    deleted += 1
  }
  record(`DELETE_ALL count=${deleted}`)
  await page.waitForSelector('.project-modal-content .empty-hint', { state: 'visible', timeout: 10000 })
}

async function assertEmpty(page, label) {
  const itemCount = await page.locator('.project-modal-content .project-item').count()
  const emptyVisible = await page.locator('.project-modal-content .empty-hint').isVisible()
  const badKeys = await storageBadKeys(page)
  const ok = itemCount === 0 && emptyVisible && badKeys.length === 0
  record(
    `${label} items=${itemCount} empty=${emptyVisible} badKeys=${JSON.stringify(badKeys)} => ${ok ? 'PASS' : 'FAIL'}`
  )
  return ok
}

async function createProject(page, name, outline) {
  await page.click('.project-modal-content .new-project-btn')
  await page.waitForSelector('.project-modal-content .new-project-form', { state: 'visible', timeout: 8000 })
  await page.fill('.project-modal-content .form-input', name)
  await page.fill('.project-modal-content .form-textarea', outline)
  await page.click('.project-modal-content .form-actions .btn-primary')
  await page.waitForTimeout(500)
  const transitionVisible = await page
    .locator('.project-modal-content .project-transition-confirm')
    .isVisible()
    .catch(() => false)
  if (transitionVisible) {
    await page.click('.project-modal-content .project-transition-confirm__actions .btn-danger')
    record('CREATE handled transition: 删除并继续')
  }
  await page.waitForTimeout(800)
}

async function main() {
  const results = {}
  let browser = null
  try {
    execSync('node _audit/tmp/data_backup.cjs backup', {
      cwd: CWD,
      stdio: 'pipe',
      windowsHide: true
    })
    record('BACKUP fresh backup done')

    killElectron()
    await new Promise((r) => setTimeout(r, 1200))
    launchApp()
    if (!(await waitCdp())) throw new Error('CDP_TIMEOUT_AFTER_LAUNCH')
    browser = await chromium.connectOverCDP(CDP_URL)
    const page = await getMainPage(browser)
    if (!page) throw new Error('NO_MAIN_PAGE')
    record('CDP_CONNECTED target=' + page.url())

    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('#btn-open-project', { state: 'visible', timeout: 15000 })
    await openProjectModal(page)
    await shot(page, 'p1_modal_initial.png')
    results.initial = await page.evaluate(() => ({
      items: document.querySelectorAll('.project-modal-content .project-item').length,
      empty:
        !!document.querySelector('.project-modal-content .empty-hint') ||
        document.querySelectorAll('.project-modal-content .project-item').length === 0
    }))

    await deleteAllProjects(page)
    results.empty = await assertEmpty(page, 'STEP delete-all')
    if (!results.empty) throw new Error('DELETE_ALL_FAIL')
    await shot(page, 'p1_after_delete_all.png')

    await createProject(page, 'P1验证项目', '2026-08-19 P1 项目删除闭环验证大纲\n第二行')
    await page.waitForSelector('#current-project-name', { state: 'visible', timeout: 8000 })
    await openProjectModal(page)
    results.created = await page.evaluate(() => ({
      count: document.querySelectorAll('.project-modal-content .project-item').length,
      name: document.querySelector('.project-modal-content .project-item-name')?.textContent || ''
    }))
    record('STEP create => ' + JSON.stringify(results.created))
    await shot(page, 'p1_created.png')
    if (results.created.count !== 1 || results.created.name !== 'P1验证项目') {
      throw new Error('CREATE_FAIL')
    }

    await deleteAllProjects(page)
    results.deleted = await assertEmpty(page, 'STEP delete-created')
    await shot(page, 'p1_deleted.png')
    if (!results.deleted) throw new Error('DELETE_CREATED_FAIL')

    record('RESTART app for ghost check')
    killElectron()
    await new Promise((r) => setTimeout(r, 1200))
    launchApp()
    if (!(await waitCdp())) throw new Error('CDP_TIMEOUT_AFTER_RESTART')
    if (browser) await browser.close().catch(() => {})
    browser = await chromium.connectOverCDP(CDP_URL)
    const page2 = await getMainPage(browser)
    await page2.waitForLoadState('domcontentloaded')
    await page2.waitForSelector('#btn-open-project', { state: 'visible', timeout: 15000 })
    await openProjectModal(page2)
    results.restart = await assertEmpty(page2, 'STEP restart-ghost')
    await shot(page2, 'p1_after_restart.png')
    if (!results.restart) throw new Error('RESTART_GHOST_FAIL')

    results.pass = true
    record('P1 PASS')
  } catch (err) {
    results.pass = false
    results.error = String(err && err.message ? err.message : err)
    record('P1 FAIL: ' + results.error)
  } finally {
    if (browser) await browser.close().catch(() => {})
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
      path.join(TMP, 'p1_verify_result.json'),
      JSON.stringify(
        {
          phase: 'P1',
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
    record('RESULT_JSON _audit/tmp/p1_verify_result.json')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
