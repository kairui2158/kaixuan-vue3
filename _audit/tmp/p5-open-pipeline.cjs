const { createRequire } = require('module')
const req = createRequire('D:/codex/novel-workshop-vue3/package.json')
const { chromium } = req('playwright')

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
  const page = browser.contexts().flatMap(context => context.pages())[0]
  if (!page) throw new Error('NO_PAGE')
  const before = await page.locator('button').evaluateAll(elements => elements.map(el => ({ id: el.id, text: el.textContent?.trim() })).filter(item => /流水线|生成|pipeline/i.test(item.text || '')))
  console.log('BEFORE=' + JSON.stringify(before))
  const target = page.locator('button').filter({ hasText: /生成流水线|流水线/ }).first()
  if (!await target.count()) throw new Error('PIPELINE_ENTRY_MISSING')
  await target.click()
  console.log('PIPELINE_ENTRY_CLICKED=true')
  await page.waitForTimeout(500)
  const after = await page.evaluate(() => ({
    buttons: Array.from(document.querySelectorAll('[id^="btn-pl-"]')).map(el => ({ id: el.id, text: el.textContent?.trim(), disabled: el.hasAttribute('disabled') })),
    visibleSteps: Array.from(document.querySelectorAll('[id^="pl-step-"]')).filter(el => getComputedStyle(el).display !== 'none').map(el => el.id)
  }))
  console.log('AFTER=' + JSON.stringify(after))
  await browser.close()
})().catch(error => { console.error(error.stack || error); process.exitCode = 1 })
