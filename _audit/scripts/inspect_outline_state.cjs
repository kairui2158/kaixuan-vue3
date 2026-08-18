const { chromium } = require('playwright')
;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
  const page = browser.contexts()[0].pages()[0]
  console.log(await page.evaluate(() => ({
    url: location.href,
    visible: !!document.querySelector('#outline-workspace'),
    keys: window.electronAPI.storageList().filter(k => /^wa_project[-_]/.test(k)).map(k => ({ key: k, data: window.electronAPI.storageRead(k) })),
    vue: Object.keys(document.querySelector('#outline-workspace') || {}).filter(k => k.startsWith('__vue')).slice(0, 5)
  })))
  await browser.close()
})().catch(e => { console.error(e); process.exit(1) })
