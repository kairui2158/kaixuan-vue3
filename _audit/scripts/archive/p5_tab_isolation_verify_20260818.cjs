const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const OUT = path.join(ROOT, '_audit')
const reportPath = path.join(OUT, 'P5_tab_isolation_verify.json')
const shotPath = path.join(OUT, 'P5_tab_isolation_verify.png')

function visible(locator) {
  return locator.count().then(count => count > 0 && locator.first().isVisible())
}

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
  const page = browser.contexts()[0].pages()[0]
  const results = []
  const add = (id, pass, detail) => results.push({ id, pass: !!pass, detail })

  const initial = await page.evaluate(() => ({
    title: document.title,
    project: document.querySelector('#current-project-name')?.innerText || '',
    volumes: document.querySelectorAll('.volume-item').length,
    chapters: document.querySelectorAll('.chapter-item').length
  }))
  add('P5-1', initial.title === '神意助手', JSON.stringify(initial))
  add('P5-2', initial.volumes > 0 && initial.chapters > 0, JSON.stringify(initial))
  if (!(initial.volumes > 0 && initial.chapters > 0)) throw new Error('real project contexts unavailable')

  // Open a real chapter body tab.
  await page.locator('.chapter-item').first().click()
  await page.waitForTimeout(250)
  const bodyBefore = await page.locator('#editor-content').inputValue()
  const bodyTabId = await page.evaluate(() => window.__vueApp?.editorStore?.activeTabId || document.querySelector('.tab.active')?.textContent?.trim() || '')

  // Open a real volume-outline tab through the context menu on the volume.
  await page.locator('.volume-item').first().click({ button: 'right' })
  await page.waitForTimeout(150)
  const viewOutline = page.locator('.ctx-item').filter({ hasText: '查看卷纲' })
  add('P5-3', await visible(viewOutline), 'volume context menu visible')
  if (!(await visible(viewOutline))) throw new Error('volume outline action missing')
  await viewOutline.click()
  await page.waitForTimeout(250)
  const tabsAfterOpen = await page.locator('.chapter-tabs .tab').count()
  const outlineBefore = await page.locator('#editor-content').inputValue()
  add('P5-4', tabsAfterOpen >= 2, 'tabCount=' + tabsAfterOpen)

  // Modify only the active volume-outline tab, then switch back to the chapter tab.
  const marker = 'P5_ISOLATION_MARKER'
  await page.locator('#editor-content').fill(outlineBefore + marker)
  const outlineAfterEdit = await page.locator('#editor-content').inputValue()
  const tabLabels = await page.locator('.chapter-tabs .tab').allTextContents()
  const activeIndex = await page.locator('.chapter-tabs .tab.active').count()
  add('P5-5', outlineAfterEdit.endsWith(marker), JSON.stringify({ outlineAfterEdit, tabLabels, activeIndex }))

  const tab = page.locator('.chapter-tabs .tab')
  await tab.first().click()
  await page.waitForTimeout(150)
  const bodyAfterSwitch = await page.locator('#editor-content').inputValue()
  add('P5-6', bodyAfterSwitch === bodyBefore, JSON.stringify({ bodyBefore, bodyAfterSwitch }))

  // Switch back and confirm the edited outline remained in its own tab.
  await tab.nth(1).click()
  await page.waitForTimeout(150)
  const outlineAfterSwitch = await page.locator('#editor-content').inputValue()
  add('P5-7', outlineAfterSwitch === outlineAfterEdit, JSON.stringify({ outlineAfterEdit, outlineAfterSwitch }))

  const storeState = await page.evaluate(() => ({
    tabs: [...document.querySelectorAll('.chapter-tabs .tab')].map((el, index) => ({ index, text: el.textContent?.trim() })),
    editorText: document.querySelector('#editor-content')?.value || '',
    storageKeys: window.electronAPI.storageList().filter(k => k.includes('chat_')).slice(-10)
  }))
  add('P5-8', storeState.tabs.length >= 2, JSON.stringify(storeState))

  await page.screenshot({ path: shotPath, fullPage: false })
  const report = { name: 'P5 多标签页隔离真实行为验证', passed: results.every(r => r.pass), results, storeState, timestamp: new Date().toISOString() }
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
  console.log(JSON.stringify(report, null, 2))
  await browser.close()
})().catch(error => {
  console.error('P5_ERROR', error.stack || error)
  process.exitCode = 1
})
