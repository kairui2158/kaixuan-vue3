import { chromium } from 'playwright'

const CDP = 'http://127.0.0.1:9227'
const browser = await chromium.connectOverCDP(CDP)
const page = browser.contexts()[0].pages()[0]

const modalVisible = await page.locator('#exit-confirm-modal').isVisible().catch(() => false)
console.log('exit modal visible:', modalVisible)

if (modalVisible) {
  const directBtn = page.locator('#btn-exit-direct')
  const clickable = await directBtn.isVisible().catch(() => false)
  console.log('direct exit button visible:', clickable)
  if (clickable) {
    await directBtn.click()
    console.log('direct exit clicked')
  }
}

// Give the main process a moment to save and close.
await page.waitForTimeout(1500)
await browser.close()
