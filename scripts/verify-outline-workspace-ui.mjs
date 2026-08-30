import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
const context = browser.contexts()[0]
if (!context) throw new Error('Electron context not found')
const page = context.pages().find(item => item.url().includes('index.html')) || context.pages()[0]
if (!page) throw new Error('Electron page not found')

function assert(condition, message) {
  if (!condition) throw new Error(message)
  console.log('[PASS] ' + message)
}

await page.evaluate(() => {
  const pipelineClose = document.querySelector('#btn-close-pl')
  if (pipelineClose) pipelineClose.click()
  const outlineClose = document.querySelector('#btn-close-outline-workspace')
  if (outlineClose) outlineClose.click()
})
await page.waitForTimeout(300)

await page.locator('#btn-outline-workspace').click()
await page.waitForSelector('#outline-workspace')
await page.locator('#btn-ai-co-create').click()
await page.waitForSelector('#ow-chat-input')

const overflow = await page.evaluate(() => {
  const root = document.querySelector('#outline-workspace .ow-content')
  if (!root) return [{ id: 'root', message: 'workspace root missing' }]
  const rootRect = root.getBoundingClientRect()
  const selectors = [
    '.ow-toolbar',
    '.ow-config-row',
    '.ow-selected-skills',
    '.ow-editor-panel',
    '.ow-chat',
    '.ow-input-row',
    '.ow-footer'
  ]
  return selectors.flatMap(selector => {
    return [...root.querySelectorAll(selector)].flatMap((element, index) => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      if (style.display === 'none' || style.visibility === 'hidden') return []
      const overflowRight = rect.right - rootRect.right
      const overflowBottom = rect.bottom - rootRect.bottom
      const issues = []
      if (overflowRight > 2) issues.push(`right overflow ${overflowRight.toFixed(2)}px`)
      if (overflowBottom > 2) issues.push(`bottom overflow ${overflowBottom.toFixed(2)}px`)
      return issues.length ? [{ id: `${selector}[${index}]`, message: issues.join(', ') }] : []
    })
  })
})

assert(overflow.length === 0, 'P7: outline workspace fixed panels fit their container' + (overflow.length ? `: ${JSON.stringify(overflow)}` : ''))

const required = ['#outline-editor', '#ow-chat-input', '#btn-ow-send', '#btn-save-outline', '#btn-lock-outline']
for (const selector of required) {
  assert(await page.locator(selector).isVisible(), `P7: required control visible ${selector}`)
}

await page.evaluate(() => {
  document.querySelector('#btn-close-outline-workspace')?.click()
})
await page.waitForTimeout(300)
await browser.close()
console.log('[DONE] Outline workspace UI regression completed')
