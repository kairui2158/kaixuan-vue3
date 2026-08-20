const { createRequire } = require('module')
const req = createRequire('D:/codex/novel-workshop-vue3/package.json')
const { chromium } = req('playwright')

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
  const page = browser.contexts().flatMap(context => context.pages())[0]
  if (!page) throw new Error('NO_PAGE')
  const result = await page.evaluate(() => ({
    pipelineButtons: Array.from(document.querySelectorAll('[id^="btn-pl-"]')).map(el => ({ id: el.id, text: el.textContent?.trim(), disabled: el.hasAttribute('disabled') })),
    visibleSteps: Array.from(document.querySelectorAll('[id^="pl-step-"]')).filter(el => getComputedStyle(el).display !== 'none').map(el => el.id),
    activePanel: document.querySelector('#pipeline-panel') ? getComputedStyle(document.querySelector('#pipeline-panel')).display : 'absent',
    project: (() => { const p = globalThis.__pinia?._s?.get('project'); return { id: p?.currentProjectId, volumes: p?.volumes?.length || 0, chapters: p?.totalChapters || 0 } })()
  }))
  console.log(JSON.stringify(result, null, 2))
  await browser.close()
})().catch(error => { console.error(error.stack || error); process.exitCode = 1 })
