const { createRequire } = require('module')
const req = createRequire('D:/codex/novel-workshop-vue3/package.json')
const { chromium } = req('playwright')

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
  const page = browser.contexts().flatMap(context => context.pages())[0]
  if (!page) throw new Error('NO_PAGE')
  const before = await page.locator('button').evaluateAll(elements => elements.map(el => ({ id: el.id, text: el.textContent?.trim() })).filter(item => /记忆/.test(item.text || '')))
  const memoryButton = page.locator('#btn-memory')
  if (!await memoryButton.count()) throw new Error('MEMORY_ENTRY_MISSING')
  const panelAlreadyOpen = await page.locator('#memory-panel').isVisible().catch(() => false)
  if (!panelAlreadyOpen) {
    await memoryButton.click()
    await page.waitForTimeout(300)
  }
  const result = await page.evaluate(() => {
    const panel = document.querySelector('#memory-panel')
    const cards = Array.from(document.querySelectorAll('.character-card')).map(card => ({
      entityId: card.getAttribute('data-entity-id'),
      text: card.textContent?.trim() || '',
      sourceButton: !!Array.from(card.querySelectorAll('button')).find(button => button.textContent?.includes('打开首个来源')),
      exportButton: !!Array.from(card.querySelectorAll('button')).find(button => button.textContent?.includes('导出角色卡')),
      rect: (() => { const r = card.getBoundingClientRect(); return { width: Math.round(r.width), height: Math.round(r.height) } })()
    }))
    return {
      panelVisible: !!panel && getComputedStyle(panel).display !== 'none',
      entityCount: cards.length,
      cards,
      memoryListText: document.querySelector('#mem-list')?.textContent?.trim() || ''
    }
  })
  const sourceButton = page.locator('.character-card').first().getByRole('button', { name: '打开首个来源' })
  if (!await sourceButton.count()) throw new Error('SOURCE_BUTTON_MISSING')
  await sourceButton.click()
  await page.waitForTimeout(300)
  const navigation = await page.evaluate(() => ({
    panelVisible: !!document.querySelector('#memory-panel') && getComputedStyle(document.querySelector('#memory-panel')).display !== 'none',
    editorText: document.querySelector('#editor-content')?.textContent?.trim() || '',
    activeTab: document.querySelector('.editor-tab.active')?.textContent?.trim() || ''
  }))
  await page.screenshot({ path: 'D:/codex/novel-workshop-vue3/_audit/tmp/p8-character-card.png', timeout: 5000 })
  console.log(JSON.stringify({ before, ...result, navigation }, null, 2))
  process.exit(0)
})().catch(error => { console.error(error.stack || error); process.exit(1) })
