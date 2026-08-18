const { chromium } = require('playwright')

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
  const page = browser.contexts()[0].pages()[0]
  const tabs = page.locator('.chapter-tabs .tab')
  if (await tabs.count() > 1) {
    await tabs.nth(1).click()
    await page.waitForTimeout(100)
    await page.locator('#editor-content').fill('')
    await page.locator('.tab-close').nth(1).click()
    await page.waitForTimeout(200)
  }
  const state = await page.evaluate(() => ({
    tabs: document.querySelectorAll('.chapter-tabs .tab').length,
    text: document.querySelector('#editor-content')?.value || '',
    marker: document.body.innerText.includes('P5_ISOLATION_MARKER')
  }))
  console.log(JSON.stringify(state))
  await browser.close()
})().catch(error => { console.error(error.stack || error); process.exitCode = 1 })
