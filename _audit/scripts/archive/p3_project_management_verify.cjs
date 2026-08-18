const { chromium } = require('playwright')
const fs = require('fs')

const ROOT = 'D:/codex/novel-workshop-vue3'
const EVIDENCE = ROOT + '/_audit/P3_project_management_verify.json'
const SCREENSHOT = ROOT + '/_audit/P3_project_management_verify.png'
const PREFIX = 'p3_verify_'

function check(name, pass, detail, results) {
  results.push({ name, pass: !!pass, detail: String(detail || '') })
  console.log((pass ? 'PASS' : 'FAIL') + ' | ' + name + ' | ' + (detail || ''))
  return !!pass
}

async function waitVisible(page, selector, timeout = 10000) {
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
      volumes: project?.volumes || [],
      chapters: project?.chapters || {},
      pipelineStep: pipeline?.currentStep ?? null,
      bodyText: document.body.innerText
    }
  }).catch(() => ({ projectId: null, projectName: '', outlineText: '', volumes: [], chapters: {}, pipelineStep: null, bodyText: '' }))
}

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
  const context = browser.contexts()[0]
  const page = context.pages()[0]
  page.setDefaultTimeout(15000)
  const results = []
  const snapshot = await page.evaluate(() => {
    const api = window.electronAPI
    const keys = (api.storageList?.() || []).filter((key) => key.startsWith('wa_'))
    return Object.fromEntries(keys.map((key) => [key, api.storageRead(key)]))
  })
  let currentId = null
  let createdIds = []
  const dialogs = []
  const onDialog = async dialog => {
    dialogs.push({ type: dialog.type(), message: dialog.message() })
    await dialog.accept()
  }
  page.on('dialog', onDialog)

  try {
    if (!(await page.locator('#chapter-tree').count())) {
      check('章节树存在', false, '未找到 #chapter-tree', results)
      return
    }
    if (await page.locator('.project-transition-confirm').isVisible().catch(() => false)) {
      await page.locator('.project-transition-confirm__actions .btn-primary').click()
      await page.waitForTimeout(200)
    }
    const projectButton = await waitVisible(page, '#btn-open-project')
    await projectButton.click()
    await waitVisible(page, '.project-modal-content')
    check('项目管理弹窗可打开', await page.locator('.project-modal-content').isVisible(), '', results)

    const newButton = page.locator('.new-project-btn')
    await newButton.click()
    await waitVisible(page, '.new-project-form')
    check('新建项目表单可展开', await page.locator('.new-project-form').isVisible(), '', results)

    await page.locator('.new-project-form .form-input').fill(PREFIX + 'A')
    await page.locator('.new-project-form .form-textarea').fill('# A卷\n## A章\nA项目大纲')
    await page.locator('.form-actions .btn-primary').click()
    if (await page.locator('.project-transition-confirm').isVisible().catch(() => false)) {
      await page.locator('.project-transition-confirm__actions .btn-primary').click()
    }
    await page.waitForTimeout(300)
    const first = await readState(page)
    currentId = first.projectId
    if (currentId) createdIds.push(currentId)
    check('新建项目后当前项目切换', first.projectName === PREFIX + 'A', JSON.stringify({ id: first.projectId, name: first.projectName }), results)
    check('新建项目后大纲进入当前状态', first.outlineText.includes('A项目大纲'), first.outlineText.slice(0, 80), results)

    await projectButton.click()
    await waitVisible(page, '.project-modal-content')
    await newButton.click()
    await page.locator('.new-project-form .form-input').fill(PREFIX + 'B')
    await page.locator('.new-project-form .form-textarea').fill('# B卷\n## B章\nB项目大纲')
    await page.locator('.form-actions .btn-primary').click()
    await waitVisible(page, '.project-transition-confirm')
    check('新建前显示保存/删除/取消选择', await page.locator('.project-transition-confirm__actions button').count() === 3, '', results)
    await page.locator('.project-transition-confirm__actions .btn-secondary').click()
    await page.waitForTimeout(200)
    const afterCreateCancel = await readState(page)
    check('新建取消后不继续创建', afterCreateCancel.projectName === PREFIX + 'A' && !afterCreateCancel.outlineText.includes('B项目大纲'), JSON.stringify({ projectName: afterCreateCancel.projectName, outlineText: afterCreateCancel.outlineText }), results)
    await page.locator('.new-project-form .form-input').fill(PREFIX + 'B')
    await page.locator('.new-project-form .form-textarea').fill('# B卷\n## B章\nB项目大纲')
    await page.locator('.form-actions .btn-primary').click()
    await waitVisible(page, '.project-transition-confirm')
    await page.locator('.project-transition-confirm__actions .btn-primary').click()
    await page.waitForTimeout(300)
    const second = await readState(page)
    if (second.projectId) createdIds.push(second.projectId)
    check('新建项目保存后继续', second.projectName === PREFIX + 'B' && second.outlineText.includes('B项目大纲'), JSON.stringify(second), results)
    check('第二项目成为当前项目', second.projectName === PREFIX + 'B', JSON.stringify({ id: second.projectId, name: second.projectName }), results)

    await projectButton.click()
    await waitVisible(page, '.project-modal-content')
    const firstItem = page.locator('.project-item').filter({ hasText: PREFIX + 'A' }).first()
    await firstItem.locator('button').filter({ hasText: '加载' }).click()
    await waitVisible(page, '.project-transition-confirm')
    check('切换前显示保存/删除/取消选择', await page.locator('.project-transition-confirm__actions button').count() === 3, '', results)
    await page.locator('.project-transition-confirm__actions .btn-secondary').click()
    await page.waitForTimeout(200)
    const afterLoadCancel = await readState(page)
    check('切换取消后保持当前项目', afterLoadCancel.projectName === PREFIX + 'B' && afterLoadCancel.outlineText.includes('B项目大纲'), JSON.stringify({ projectName: afterLoadCancel.projectName, outlineText: afterLoadCancel.outlineText }), results)
    await firstItem.locator('button').filter({ hasText: '加载' }).click()
    await waitVisible(page, '.project-transition-confirm')
    await page.locator('.project-transition-confirm__actions .btn-primary').click()
    await page.waitForTimeout(300)
    const loaded = await readState(page)
    check('切换项目保存后继续', loaded.projectName === PREFIX + 'A', JSON.stringify(loaded), results)
    check('加载后当前项目为 A', loaded.projectName === PREFIX + 'A', JSON.stringify({ id: loaded.projectId, name: loaded.projectName }), results)
    check('加载后大纲与项目 A 一致', loaded.outlineText.includes('A项目大纲') && !loaded.outlineText.includes('B项目大纲'), loaded.outlineText.slice(0, 80), results)

    const treeText = await page.locator('#chapter-tree').innerText()
    check('加载后章节树同步项目 A', treeText.includes('A卷') && treeText.includes('A章'), treeText.slice(0, 200), results)

    await page.locator('#btn-tree-gen').click()
    await page.waitForTimeout(300)
    const pipelineText = await page.locator('#pipeline-panel').innerText().catch(() => '')
    check('项目按钮加载后可进入生成流水线', pipelineText.length > 0 || (await page.locator('#pipeline-panel').count()) > 0, pipelineText.slice(0, 160), results)
    check('流水线读取项目 A 大纲', (await page.locator('#pl-outline').inputValue().catch(() => '')) === loaded.outlineText, 'outline=' + (await page.locator('#pl-outline').inputValue().catch(() => '')), results)

    await page.locator('#btn-close-pl').click()
    await page.waitForTimeout(250)
    await page.locator('#btn-open-project').click()
    await waitVisible(page, '.project-modal-content')
    const secondItem = page.locator('.project-item').filter({ hasText: PREFIX + 'B' }).first()
    await secondItem.locator('button').filter({ hasText: '删除' }).click()
    check('删除项目出现确认对话框', dialogs.some(d => d.message.includes('确定删除该项目')), JSON.stringify(dialogs), results)
    await page.waitForTimeout(250)
    check('删除后项目 B 从列表移除', await page.locator('.project-item').filter({ hasText: PREFIX + 'B' }).count() === 0, '', results)

    const report = {
      passed: results.every(r => r.pass),
      results,
      dialogs,
      createdIds,
      timestamp: new Date().toISOString()
    }
    fs.writeFileSync(EVIDENCE, JSON.stringify(report, null, 2), 'utf8')
    const client = await context.newCDPSession(page)
    const shot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.writeFileSync(SCREENSHOT, Buffer.from(shot.data, 'base64'))
  } finally {
    page.off('dialog', onDialog)
    await page.evaluate(({ snapshot, createdIds }) => {
      const api = window.electronAPI
      for (const id of createdIds || []) {
        api.storageRemove('wa_project_' + id)
        api.storageRemove('wa_project-' + id)
      }
      const now = new Set(api.storageList?.() || [])
      for (const key of now) {
        if (key.startsWith('wa_') && !(key in snapshot)) api.storageRemove(key)
      }
      for (const [key, value] of Object.entries(snapshot || {})) {
        api.storageWrite(key, value)
      }
    }, { snapshot, createdIds })
    await page.waitForTimeout(400)
    await browser.close()
  }
  const report = JSON.parse(fs.readFileSync(EVIDENCE, 'utf8'))
  if (!report.passed) process.exit(1)
}

main().catch(error => {
  console.error('ERROR | P3 project management verification | ' + error.stack)
  process.exit(1)
})
