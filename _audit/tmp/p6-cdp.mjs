import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
const pages = browser.contexts().flatMap(context => context.pages())
const page = pages[0]
if (!page) throw new Error('NO_PAGE')

const result = { title: await page.title(), url: page.url() }
const memoryEntry = page.locator('#btn-memory').first()
if (await memoryEntry.count()) {
  await memoryEntry.click()
  await page.waitForTimeout(250)
}
result.panel = await page.locator('#memory-panel').count()
result.exportButton = await page.locator('#btn-export-memory').count()
result.importButton = await page.locator('#btn-import-memory').count()
result.characterImportButton = await page.locator('#btn-import-character-card').count()
result.visible = {
  exportButton: result.exportButton ? await page.locator('#btn-export-memory').isVisible() : false,
  importButton: result.importButton ? await page.locator('#btn-import-memory').isVisible() : false,
  characterImportButton: result.characterImportButton ? await page.locator('#btn-import-character-card').isVisible() : false
}
result.memoryText = result.panel ? (await page.locator('#memory-panel').innerText()).slice(0, 500) : ''
console.log(JSON.stringify(result))
await browser.close()
