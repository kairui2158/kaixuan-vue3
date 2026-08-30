import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
const page = browser.contexts()[0].pages().find(item => item.url().includes('index.html'))
console.log('url:', page.url())
console.log('title:', await page.title())
console.log('overlays:', await page.evaluate(() => {
  return [...document.querySelectorAll('.modal-overlay, .ow-overlay, #pipeline-panel')].map(item => ({
    className: item.className,
    id: item.id,
    visible: getComputedStyle(item).display !== 'none' && getComputedStyle(item).visibility !== 'hidden',
    text: item.textContent.slice(0, 300)
  }))
}))
await page.screenshot({ path: 'debug-outline-state.png', fullPage: true })
await browser.close()
