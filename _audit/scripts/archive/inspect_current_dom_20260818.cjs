const { chromium } = require('playwright')

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
  const pages = browser.contexts().flatMap(context => context.pages())
  for (const [index, page] of pages.entries()) {
    const snapshot = await page.evaluate(() => ({
      title: document.title,
      url: location.href,
      text: document.body.innerText.slice(0, 1800),
      buttons: [...document.querySelectorAll('button')].map(button => ({
        id: button.id,
        text: button.innerText.trim(),
        display: getComputedStyle(button).display,
        disabled: button.disabled
      })).slice(0, 80),
      outlineSelectors: ['#outline-workspace', '#btn-outline-workspace', '#outline-editor', '.ow-textarea', '#btn-save-outline']
        .map(selector => ({ selector, count: document.querySelectorAll(selector).length }))
    }))
    console.log(JSON.stringify({ index, snapshot }, null, 2))
  }
  await browser.close()
})().catch(error => {
  console.error(error.stack || error)
  process.exitCode = 1
})
