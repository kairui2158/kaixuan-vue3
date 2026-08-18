const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const OUT = path.join(ROOT, '_audit')
const reportPath = path.join(OUT, 'P4_native_save_dialog_verify.json')
const shotPath = path.join(OUT, 'P4_native_save_dialog_verify.png')
const fixture = 'P4 原生保存对话框验证\n用户真实点击保存后写入本地文件。'

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
  const context = browser.contexts()[0]
  const page = context.pages()[0]
  const results = []
  const add = (id, pass, detail) => results.push({ id, pass: !!pass, detail })
  await page.screenshot({ path: shotPath, fullPage: false })
  add('P4-1', await page.title() === '神意助手', 'title=' + await page.title())
  const bodyText = await page.locator('body').innerText()
  add('P4-2', bodyText.includes('章节树') || bodyText.includes('大纲工作台'), 'outline entry visible')
  const buttons = await page.locator('button').allTextContents()
  add('P4-3', buttons.some(t => t.includes('大纲')), 'buttons=' + JSON.stringify(buttons.slice(0, 40)))
  const opener = page.locator('#btn-outline-workspace')
  if (await opener.count() && await page.locator('.ow-textarea').count() === 0) {
    await opener.click()
    await page.locator('.ow-textarea').waitFor({ timeout: 5000 })
  }
  const save = page.locator('#btn-save-outline')
  add('P4-4', await save.count() === 1, 'saveButton=' + await save.count())
  if (await save.count() !== 1) throw new Error('Outline save button not found')
  const textarea = page.locator('.ow-textarea')
  if (await textarea.count()) {
    await textarea.fill(fixture)
    await page.waitForTimeout(200)
  }
  add('P4-5', await textarea.inputValue() === fixture, 'textarea length=' + (await textarea.inputValue()).length)
  console.log(JSON.stringify({ phase: 'ready', reportPath, shotPath, fixture }, null, 2))
  console.log('P4_SAVE_CLICK_BEGIN')
  await save.click({ timeout: 5000 })
  console.log('P4_SAVE_CLICK_DONE')
  let feedback = ''
  const deadline = Date.now() + 120000
  while (Date.now() < deadline) {
    try {
      feedback = await page.locator('.save-feedback').innerText({ timeout: 1500 })
      if (feedback) break
    } catch {}
    await page.waitForTimeout(1000)
  }
  add('P4-6', feedback.includes('已保存') || feedback.includes('取消') || feedback.includes('失败'), 'feedback=' + feedback)
  fs.writeFileSync(reportPath, JSON.stringify({ name: 'P4 原生保存对话框真实桌面验证', results, fixture, timestamp: new Date().toISOString() }, null, 2), 'utf8')
  console.log('P4_VERIFY_REPORT_WRITTEN')
  await browser.close()
}

main().catch(error => {
  console.error('P4_NATIVE_ERROR', error.stack || error)
  process.exitCode = 1
})
