import fs from 'node:fs'
import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
const context = browser.contexts()[0]
const page = context.pages().find(item => item.url().includes('dist-renderer/index.html')) || context.pages()[0]

await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => {
  const app = document.querySelector('#app')
  return Boolean(app?.__vue_app__)
}, null, { timeout: 20000 })
await page.waitForFunction(() => {
  const app = document.querySelector('#app')
  const stores = app?.__vue_app__?.config?.globalProperties?.$pinia?._s
  const project = stores?.get('project')
  const provider = stores?.get('provider')
  return Boolean(project && provider)
    && project.currentProjectId === 'probe-outline-1788320617602'
    && Array.isArray(provider.providers)
    && provider.providers.length > 0
}, null, { timeout: 30000 })
await page.waitForTimeout(1500)

const source = fs.readFileSync('D:/codex/novel-workshop-vue3/_audit/tmp/l3-provider-matrix-v1.js', 'utf8')
const value = await page.evaluate(source)
fs.writeFileSync(
  'D:/codex/novel-workshop-vue3/_audit/tmp/l3-provider-matrix-result-v1.json',
  JSON.stringify(value, null, 2) + '\n',
  'utf8'
)
await browser.close()

const summary = {
  allStepsOk: value.allStepsOk === true,
  runtimeErrors: value.runtimeErrors || [],
  restored: value.restored !== false,
  steps: (value.steps || []).map(step => ({
    name: step.name,
    ok: step.ok === true,
    requestCount: step.requestCount
  }))
}
console.log(JSON.stringify(summary, null, 2))
if (!summary.allStepsOk) process.exitCode = 1
