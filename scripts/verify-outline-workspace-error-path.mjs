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

const original = await page.evaluate(async () => {
  const providerStore = globalThis.__pinia?._s.get('provider')
  const lastProjectId = await window.electronAPI.storageRead('wa_lastProjectId')
  return {
    generateProvider: providerStore?.generateProvider || '',
    lastProjectId: lastProjectId && lastProjectId.value
  }
})

const tempId = `codex-outline-error-${Date.now()}`
try {
  await page.evaluate(async ({ tempId, original }) => {
    const projectStore = globalThis.__pinia._s.get('project')
    const providerStore = globalThis.__pinia._s.get('provider')
    await window.electronAPI.storageWrite('wa_project_' + tempId, {
      projectName: 'Codex Outline Error Temp',
      outlineText: '第一卷 临时验证\n这里是错误路径验证内容。',
      outlineChat: []
    })
    await window.electronAPI.storageWrite('wa_lastProjectId', tempId)
    providerStore.generateProvider = ''
    await projectStore.loadProject(tempId)
  }, { tempId, original })

  await page.evaluate(() => {
    const pipelineClose = document.querySelector('#btn-close-pl')
    if (pipelineClose) pipelineClose.click()
    const outlineClose = document.querySelector('#btn-close-outline-workspace')
    if (outlineClose) outlineClose.click()
  })
  await page.waitForTimeout(300)

  await page.locator('#btn-outline-workspace').click()
  await page.waitForSelector('#btn-ai-co-create')
  await page.locator('#btn-ai-co-create').click()
  await page.waitForSelector('#ow-chat-input')
  await page.locator('#ow-chat-input').fill('请补充一段大纲细节')
  await page.locator('#btn-ow-send').click()
  await page.waitForTimeout(500)

  const chat = await page.evaluate(() => {
    return [...document.querySelectorAll('#ow-chat-messages .ow-msg.assistant')].map(item => item.textContent || '')
  })
  assert(chat.some(text => text.includes('请先配置API供应商')), 'P7: missing generate provider shows a clear setup error')

  await page.evaluate(() => {
    document.querySelector('#btn-close-outline-workspace')?.click()
  })
  await page.waitForTimeout(300)
} finally {
  await page.evaluate(async ({ tempId, original }) => {
    const providerStore = globalThis.__pinia?._s.get('provider')
    if (providerStore) providerStore.generateProvider = original.generateProvider
    await window.electronAPI.storageRemove('wa_project_' + tempId)
    if (original.lastProjectId) await window.electronAPI.storageWrite('wa_lastProjectId', original.lastProjectId)
  }, { tempId, original })
  await browser.close()
}

console.log('[DONE] Outline workspace error path regression completed')
