const { chromium } = require('playwright')
const { execSync, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const CWD = process.cwd()
const TMP = path.join(CWD, '_audit', 'tmp')
const SAMPLES = path.join(TMP, 'p2_samples')
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

async function readProjectState(page) {
  return page.evaluate(() => {
    const store = window.__pinia._s.get('project')
    if (!store) return null
    return {
      id: store.currentProjectId,
      name: store.projectName,
      outline: store.outlineText || ''
    }
  })
}

async function readStoredProject(page, id) {
  return page.evaluate((pid) => {
    return window.electronAPI.storageRead('wa_project_' + pid) || null
  }, id)
}

async function importAndCheck(page, file, expected, label) {
  const input = page.locator('.ow-footer input[type="file"]')
  await input.setInputFiles(file)
  await page.waitForTimeout(900)

  const norm = (s) => String(s || '').replace(/\r\n/g, '\n')
  const editorValue = norm(await page.locator('#outline-editor').inputValue())
  const state = await readProjectState(page)
  const stored = state && state.id ? await readStoredProject(page, state.id) : null
  const editorOk = editorValue === expected
  const storeOk = !!state && norm(state.outline) === expected
  const storedOk = !!stored && norm(stored.outlineText) === expected
  const projectNameOk = !!state && typeof state.name === 'string' && state.name.length > 0
  const ok = editorOk && storeOk && storedOk && projectNameOk
  record(
    `${label} editor=${editorOk} store=${storeOk} stored=${storedOk} name=${projectNameOk} => ${ok ? 'PASS' : 'FAIL'}`
  )
  if (!ok) {
    record(
      `${label} DETAIL expected=${JSON.stringify(expected)} editor=${JSON.stringify(editorValue)} store=${JSON.stringify(
        state && state.outline
      )} stored=${JSON.stringify(stored && stored.outlineText)} name=${JSON.stringify(state && state.name)}`
    )
  }
  return { ok, editorValue, state, stored }
}

async function importAndCheckFragments(page, file, fragments, label) {
  const input = page.locator('.ow-footer input[type="file"]')
  await input.setInputFiles(file)
  await page.waitForTimeout(900)

  const norm = (s) => String(s || '').replace(/\r\n/g, '\n')
  const editorValue = norm(await page.locator('#outline-editor').inputValue())
  const state = await readProjectState(page)
  const stored = state && state.id ? await readStoredProject(page, state.id) : null
  const contentOk = fragments.every((f) => editorValue.includes(f))
  const syncOk =
    !!state &&
    norm(state.outline) === editorValue &&
    !!stored &&
    norm(stored.outlineText) === editorValue
  const projectNameOk = !!state && typeof state.name === 'string' && state.name.length > 0
  const ok = contentOk && syncOk && projectNameOk
  record(
    `${label} content=${contentOk} sync=${syncOk} name=${projectNameOk} => ${ok ? 'PASS' : 'FAIL'}`
  )
  if (!ok) {
    record(
      `${label} DETAIL editor=${JSON.stringify(editorValue.slice(0, 300))} store=${JSON.stringify(
        state && (state.outline || '').slice(0, 300)
      )} stored=${JSON.stringify(stored && (stored.outlineText || '').slice(0, 300))}`
    )
  }
  return { ok, editorValue, state, stored }
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
    await page.click('#btn-outline-workspace')
    await page.waitForSelector('#btn-import-outline', { state: 'visible', timeout: 10000 })
    await page.evaluate(() => {
      window.confirm = () => true
      window.__p2alerts = []
      window.alert = (msg) => window.__p2alerts.push(String(msg))
    })
    await page.waitForTimeout(300)
    await shot(page, 'p2_outline_workspace.png')

    const button = page.locator('#btn-import-outline')
    const style = await button.evaluate((el) => {
      const s = getComputedStyle(el)
      return {
        disabled: el.disabled,
        opacity: s.opacity,
        cursor: s.cursor,
        color: s.color,
        bg: s.backgroundColor,
        text: el.textContent.trim()
      }
    })
    const accept = await page
      .locator('.ow-footer input[type="file"]')
      .getAttribute('accept')
    record(
      `btn visible=true style=${JSON.stringify(style)} accept=${JSON.stringify(accept)}`
    )
    results.button = {
      visible: await button.isVisible(),
      ...style,
      accept
    }
    const buttonOk =
      results.button.visible &&
      !results.button.disabled &&
      parseFloat(results.button.opacity) > 0.9 &&
      results.button.cursor === 'pointer' &&
      accept === '.txt,.md,.text,.rtf,.docx' &&
      !/\.doc(?!x)/i.test(results.button.text)
    results.buttonOk = buttonOk
    record('button check => ' + (buttonOk ? 'PASS' : 'FAIL'))
    if (!buttonOk) throw new Error('IMPORT_BUTTON_STATE_FAIL')
    await shot(page, 'p2_button_state.png')

    const cases = [
      ['sample.txt', '星海神意 TXT 导入测试\n第二行内容\n第三行', 'TXT'],
      ['sample.md', '# 星海神意 MD 导入测试\n\n段落一\n\n- 要点1\n- 要点2\n', 'MD'],
      ['sample.rtf', '星海神意 RTF 导入测试\n第二段内容', 'RTF'],
      ['sample_stored.docx', '星海神意 DOCX 导入测试\n第二段内容', 'DOCX_STORED'],
      ['sample_deflate.docx', '星海神意 DOCX 导入测试\n第二段内容', 'DOCX_DEFLATE']
    ]

    for (const [file, expected, label] of cases) {
      const r = await importAndCheck(page, path.join(SAMPLES, file), expected, 'IMPORT ' + label)
      results[label] = r.ok
      await shot(page, `p2_after_${label.toLowerCase()}.png`)
      if (!r.ok) throw new Error('IMPORT_FAIL_' + label)
    }

    const realCases = [
      [
        'real_test_doc.docx',
        ['第一章 测试文档', '这是第二段中文内容，用于测试docx导入是否正常。', '第三段：如果这段文字正常显示，说明docx导入功能正常。'],
        'REAL_DOCX_TEST'
      ],
      [
        'real_work_list.docx',
        ['房嘉玉工作责任清单', '广东药科大学班主任'],
        'REAL_DOCX_WORKLIST'
      ]
    ]
    for (const [file, fragments, label] of realCases) {
      const r = await importAndCheckFragments(page, path.join(SAMPLES, file), fragments, 'IMPORT ' + label)
      results[label] = r.ok
      await shot(page, `p2_after_${label.toLowerCase()}.png`)
      if (!r.ok) throw new Error('IMPORT_FAIL_' + label)
    }

    const alertsBefore = await page.evaluate(() => window.__p2alerts.slice())
    await page.locator('.ow-footer input[type="file"]').setInputFiles(path.join(SAMPLES, 'sample.doc'))
    await page.waitForTimeout(700)
    const alertsAfter = await page.evaluate(() => window.__p2alerts.slice())
    const docAlert = alertsAfter.find((a) => a.includes('.doc 旧版格式不支持'))
    results.docRejected = !!docAlert
    record('DOC reject alert=' + JSON.stringify(alertsAfter.slice(alertsBefore.length)) + ' => ' + (docAlert ? 'PASS' : 'FAIL'))
    if (!docAlert) throw new Error('DOC_REJECT_ALERT_MISSING')
    await shot(page, 'p2_doc_rejected.png')

    const finalState = await readProjectState(page)
    results.finalProject = finalState
    if (finalState && finalState.id) {
      await page.evaluate((pid) => {
        const store = window.__pinia._s.get('project')
        store.deleteProject(pid)
      }, finalState.id)
      record('CLEANUP deleted test project ' + finalState.id)
    }

    results.pass = true
    record('P2 PASS')
  } catch (err) {
    results.pass = false
    results.error = String(err && err.message ? err.message : err)
    record('P2 FAIL: ' + results.error)
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
      path.join(TMP, 'p2_verify_result.json'),
      JSON.stringify(
        {
          phase: 'P2',
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
    record('RESULT_JSON _audit/tmp/p2_verify_result.json')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
