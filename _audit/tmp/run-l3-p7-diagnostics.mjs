import fs from 'node:fs'
import { chromium } from 'playwright'

const source = fs.readFileSync('D:/codex/novel-workshop-vue3/_audit/tmp/l3-p7-diagnostics-v1.js', 'utf8')
const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
const context = browser.contexts()[0]
const page = context.pages().find(item => item.url().includes('dist-renderer/index.html')) || context.pages()[0]
const value = await page.evaluate(source)
console.log(JSON.stringify(value, null, 2))
fs.writeFileSync(
  'D:/codex/novel-workshop-vue3/_audit/tmp/l3-p7-diagnostics-result-v3.json',
  JSON.stringify(value, null, 2) + '\n',
  'utf8'
)
await browser.close()
