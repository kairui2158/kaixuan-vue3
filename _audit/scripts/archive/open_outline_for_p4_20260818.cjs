const { chromium } = require('playwright')

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
  const page = browser.contexts()[0].pages()[0]
  const closePipeline = page.locator('#btn-close-pl')
  if (await closePipeline.count() && await closePipeline.isVisible()) {
    await closePipeline.click()
    await page.waitForTimeout(300)
  }
  const opener = page.locator('#btn-outline-workspace')
  if (!(await opener.count())) throw new Error('outline opener missing')
  await opener.click()
  await page.waitForTimeout(500)
  const state = await page.evaluate(() => ({
    title: document.title,
    outline: document.querySelectorAll('#outline-workspace').length,
    editor: document.querySelectorAll('#outline-editor, .ow-textarea').length,
    save: document.querySelectorAll('#btn-save-outline').length,
    text: document.body.innerText.slice(-600)
  }))
  console.log(JSON.stringify(state, null, 2))
  await page.screenshot({ path: 'D:/codex/novel-workshop-vue3/_audit/P4_outline_open.png' })
  await browser.close()
})().catch(error => {
  console.error(error.stack || error)
  process.exitCode = 1
})
