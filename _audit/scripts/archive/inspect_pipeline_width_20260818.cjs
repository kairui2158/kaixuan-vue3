const { createRequire } = require('module')
const requireFromProject = createRequire(process.cwd() + '/package.json')
const { chromium } = requireFromProject('playwright')

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
  const page = browser.contexts()[0].pages().find((item) => item.url().startsWith('file:'))
  if (!page) throw new Error('没有发现 Electron 页面')
  const result = await page.evaluate(() => {
    const read = (selector) => {
      const el = document.querySelector(selector)
      if (!el) return null
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return {
        selector,
        x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height),
        boxSizing: s.boxSizing, widthStyle: s.width, maxWidth: s.maxWidth,
        paddingLeft: s.paddingLeft, paddingRight: s.paddingRight,
        marginLeft: s.marginLeft, marginRight: s.marginRight,
        flex: s.flex, minWidth: s.minWidth, overflow: s.overflow,
      }
    }
    return {
      viewport: { width: innerWidth, height: innerHeight },
      content: read('.pl-content'),
      body: read('.pl-body'),
      steps: read('.pl-steps'),
      right: read('.pl-content-right'),
      panel: read('#pl-step-2-content'),
      workspace: read('#pl-settings-workspace'),
      shadowGap: (() => {
        const c = document.querySelector('.pl-content')?.getBoundingClientRect()
        const r = document.querySelector('.pl-content-right')?.getBoundingClientRect()
        const w = document.querySelector('#pl-settings-workspace')?.getBoundingClientRect()
        return c && r && w ? { contentRight: Math.round(c.right - r.right), rightToWorkspace: Math.round(r.right - w.right), workspaceRight: Math.round(c.right - w.right) } : null
      })(),
    }
  })
  console.log(JSON.stringify(result, null, 2))
  await browser.close()
})().catch((error) => { console.error(error.stack || error); process.exit(1) })
