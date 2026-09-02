import fs from 'node:fs'
import { chromium } from 'playwright'

const cases = [
  ['l3-main-realops-v3.js', 'l3-main-realops-result-p8.json'],
  ['l3-outline-realops-v3.js', 'l3-outline-realops-result-p8.json'],
  ['l3-main-rollback-context-v4.js', 'l3-main-rollback-context-result-p8.json'],
  ['l3-outline-context-v1.js', 'l3-outline-context-result-p8.json']
]

const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
const context = browser.contexts()[0]
const page = context.pages().find(item => item.url().includes('dist-renderer/index.html')) || context.pages()[0]

const results = []
for (const [sourceFile, resultFile] of cases) {
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
    if (!project || !provider) return false
    // App.vue mounts the last project only after all independent stores load.
    // Entering before this point lets async loads overwrite probe state.
    return project.currentProjectId === 'probe-outline-1788320617602'
      && Array.isArray(provider.providers)
      && provider.providers.length > 0
      && provider.generateProvider === 'prov-1788350418677'
  }, null, { timeout: 30000 })
  await page.waitForTimeout(1500)
  const source = fs.readFileSync(`D:/codex/novel-workshop-vue3/_audit/tmp/${sourceFile}`, 'utf8')
  const value = await page.evaluate(source)
  const output = `D:/codex/novel-workshop-vue3/_audit/tmp/${resultFile}`
  fs.writeFileSync(output, JSON.stringify(value, null, 2) + '\n', 'utf8')
  results.push({
    sourceFile,
    resultFile,
    allStepsOk: value.allStepsOk === true,
    runtimeErrors: value.runtimeErrors || [],
    restored: value.restored !== false,
    steps: (value.steps || []).map(step => ({ name: step.name, ok: step.ok === true }))
  })
}

await browser.close()

const summary = {
  allStepsOk: results.every(item => item.allStepsOk && item.runtimeErrors.length === 0 && item.restored),
  cases: results
}
fs.writeFileSync(
  'D:/codex/novel-workshop-vue3/_audit/tmp/l3-p8-regression-summary.json',
  JSON.stringify(summary, null, 2) + '\n',
  'utf8'
)
console.log(JSON.stringify(summary, null, 2))
if (!summary.allStepsOk) process.exitCode = 1
