import fs from 'node:fs'
import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
const context = browser.contexts()[0]
const page = context.pages().find(item => item.url().includes('dist-renderer/index.html')) || context.pages()[0]

const snapshot = await page.evaluate(async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
  const app = document.querySelector('#app')
  const stores = app?.__vue_app__?.config.globalProperties?.$pinia?._s
  if (!stores) return { ok: false, reason: 'stores unavailable' }
  const project = stores.get('project')
  const provider = stores.get('provider')
  const chat = stores.get('chat')
  const editor = stores.get('editor')
  await sleep(500)
  return {
    ok: true,
    projectId: project?.currentProjectId,
    projectName: project?.currentProject?.name,
    generateProvider: provider?.generateProvider,
    providerCount: provider?.providers?.length,
    activeSessionId: chat?.activeSession?.id,
    activeMessageCount: chat?.activeMessages?.length,
    activeTabId: editor?.activeTabId,
    tabCount: editor?.tabs?.length,
    outlineLength: project?.outlineText?.length || 0,
    outlineLocked: project?.outlineLocked
  }
})

const output = 'D:/codex/novel-workshop-vue3/_audit/tmp/l3-p8-render-diagnostic.json'
fs.writeFileSync(output, JSON.stringify(snapshot, null, 2) + '\n', 'utf8')
console.log(JSON.stringify(snapshot, null, 2))
await browser.close()
