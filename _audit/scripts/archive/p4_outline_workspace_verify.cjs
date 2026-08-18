const { chromium } = require('playwright')
const fs = require('fs')

const ROOT = 'D:/codex/novel-workshop-vue3'
const EVIDENCE = ROOT + '/_audit/P4_outline_workspace_verify.json'
const SCREENSHOT = ROOT + '/_audit/P4_outline_workspace_verify.png'
const TEMP_FILE = ROOT + '/_audit/.p4_outline_saved.md'

function check(name, pass, detail, results) {
  results.push({ name, pass: !!pass, detail: String(detail || '') })
  console.log((pass ? 'PASS' : 'FAIL') + ' | ' + name + ' | ' + (detail || ''))
}

async function waitVisible(page, selector, timeout = 15000) {
  const locator = page.locator(selector)
  await locator.waitFor({ state: 'visible', timeout })
  return locator
}

async function readState(page) {
  return page.evaluate(() => {
    const project = window.__pinia?.state?.value?.project
    const pipeline = window.__pinia?.state?.value?.pipeline
    return {
      projectId: project?.currentProjectId || null,
      projectName: project?.projectName || '',
      outlineText: project?.outlineText || '',
      outlineLocked: !!project?.outlineLocked,
      volumes: project?.volumes || [],
      pipelineStep: pipeline?.currentStep ?? null,
      bodyText: document.body.innerText
    }
  })
}

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
  const context = browser.contexts()[0]
  const page = context.pages()[0]
  page.setDefaultTimeout(15000)
  const results = []
  const snapshot = await page.evaluate(() => {
    const api = window.electronAPI
    const keys = (api.storageList?.() || []).filter(key => key.startsWith('wa_'))
    return Object.fromEntries(keys.map(key => [key, api.storageRead(key)]))
  })
  const tempId = 'p4_verify_' + Date.now()
  let report = null

  try {
    await page.evaluate(({ tempId }) => {
      const api = window.electronAPI
      const outline = '# P4验证卷\n\n## P4验证章\n\n用户编辑后的大纲内容。'
      api.storageWrite('wa_project_' + tempId, {
        projectName: 'P4验证项目',
        outlineText: outline,
        outlineLocked: false,
        volumes: [],
        chapters: {},
        settings: [],
        settingsCollection: { categories: [], items: {} },
        memories: { categories: ['情节', '人物', '世界观', '伏笔'], items: [] }
      })
      api.storageWrite('wa_lastProjectId', tempId)
    }, { tempId })
    await page.reload()
    await page.waitForTimeout(800)

    if (await page.locator('.project-transition-confirm').isVisible().catch(() => false)) {
      await page.locator('.project-transition-confirm__actions .btn-primary').click()
      await page.waitForTimeout(200)
    }

    const openButton = page.locator('#btn-open-outline, #btn-outline-workspace, [data-action="outline"]')
    if (await openButton.count()) await openButton.first().click()
    else await page.locator('#btn-tree-outline, #btn-open-outline-workspace').first().click().catch(() => {})
    await waitVisible(page, '#outline-workspace')
    check('大纲工作台可打开', await page.locator('#outline-workspace').isVisible(), '', results)

    const editor = page.locator('#outline-editor')
    const initial = await editor.inputValue()
    check('大纲编辑器初始载入项目内容', initial.includes('P4验证卷') && initial.includes('P4验证章'), initial.slice(0, 120), results)

    const edited = initial + '\n\n用户手工编辑：新增冲突场景和伏笔回收。'
    await editor.fill(edited)
    await page.waitForTimeout(550)
    check('大纲编辑器可自由编辑', (await editor.inputValue()) === edited, 'length=' + (await editor.inputValue()).length, results)

    // Test save via direct IPC call (bypass native dialog)
    const writeOk = await page.evaluate(({ path, content }) => {
      return window.electronAPI.dialogWriteFile(path, content)
    }, { path: TEMP_FILE, content: edited })
    const savedFile = fs.existsSync(TEMP_FILE) ? fs.readFileSync(TEMP_FILE, 'utf8') : ''
    check('保存大纲到本地文件（直接IPC）', writeOk && savedFile === edited, JSON.stringify({ writeOk, exists: fs.existsSync(TEMP_FILE), length: savedFile.length }), results)

    // Verify save button exists and is clickable
    const saveBtn = page.locator('#btn-save-outline')
    check('保存大纲按钮可点击', await saveBtn.isVisible() && await saveBtn.isEnabled(), await saveBtn.getAttribute('class') || '', results)

    // Test lock button
    await page.locator('#btn-lock-outline').click()
    await page.waitForTimeout(600)
    const locked = await readState(page)
    check('确认大纲后项目状态锁定', locked.outlineLocked && locked.outlineText === edited, JSON.stringify({ locked: locked.outlineLocked, length: locked.outlineText.length }), results)
    check('锁定后自动进入生成流水线', (await page.locator('#pipeline-panel').count()) > 0 || locked.bodyText.includes('生成流水线'), locked.bodyText.slice(0, 220), results)
    const pipelineOutline = await page.locator('#pl-outline').inputValue().catch(() => '')
    check('生成流水线读取锁定后的同一份大纲', pipelineOutline === edited, 'length=' + pipelineOutline.length, results)

    // Reload persistence
    await page.reload()
    await page.waitForTimeout(800)
    const restored = await readState(page)
    check('重载后锁定状态和大纲持久化', restored.outlineLocked && restored.outlineText === edited, JSON.stringify({ locked: restored.outlineLocked, length: restored.outlineText.length }), results)

    report = { name: 'P4 大纲工作台闭环', passed: results.every(item => item.pass), results, tempId, tempFile: TEMP_FILE, timestamp: new Date().toISOString() }
    fs.writeFileSync(EVIDENCE, JSON.stringify(report, null, 2), 'utf8')
    const client = await context.newCDPSession(page)
    const shot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.writeFileSync(SCREENSHOT, Buffer.from(shot.data, 'base64'))
  } finally {
    await page.evaluate(({ snapshot, tempId }) => {
      const api = window.electronAPI
      api.storageRemove('wa_project_' + tempId)
      api.storageRemove('wa_project-' + tempId)
      const now = new Set(api.storageList?.() || [])
      for (const key of now) if (key.startsWith('wa_') && !(key in snapshot)) api.storageRemove(key)
      for (const [key, value] of Object.entries(snapshot || {})) api.storageWrite(key, value)
    }, { snapshot, tempId }).catch(() => {})
    await page.waitForTimeout(250).catch(() => {})
    if (fs.existsSync(TEMP_FILE)) fs.unlinkSync(TEMP_FILE)
    await browser.close()
  }
  if (!report?.passed) process.exit(1)
}

main().catch(error => {
  console.error('ERROR | P4 outline workspace verification | ' + error.stack)
  process.exit(1)
})
