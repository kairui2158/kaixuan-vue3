import http from 'node:http'
import { chromium } from 'playwright'

const CDP_URL = 'http://127.0.0.1:9227'
const MOCK_PORT = 59731
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const MOCK_PROVIDER_ID = 'codex-stage1-mock-provider'

function assert(condition, message) {
  if (!condition) throw new Error(message)
  console.log('[PASS] ' + message)
}

const requests = []
const server = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    let body = null
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    requests.push({ url: request.url, body })

    let payload
    if (requests.length === 1) {
      payload = {
        choices: [{
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [{
              id: 'stage1-call-structure',
              type: 'function',
              function: { name: 'outline.get_structure', arguments: '{}' }
            }]
          }
        }]
      }
    } else if (requests.length === 2) {
      payload = {
        choices: [{
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [{
              id: 'stage1-call-read',
              type: 'function',
              function: { name: 'outline.read_range', arguments: JSON.stringify({ nodeId: 'chapter-1' }) }
            }]
          }
        }]
      }
    } else {
      payload = {
        choices: [{
          finish_reason: 'stop',
          message: { role: 'assistant', content: '已读取第一章局部全文。' }
        }]
      }
    }

    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify(payload))
  })
})

await new Promise(resolve => server.listen(MOCK_PORT, '127.0.0.1', resolve))

const browser = await chromium.connectOverCDP(CDP_URL)
try {
  const context = browser.contexts()[0]
  if (!context) throw new Error('Electron context not found')
  const page = context.pages().find(item => !item.url().startsWith('devtools://')) || context.pages()[0]
  if (!page) throw new Error('Electron page not found')

  const original = await page.evaluate(async () => ({
    providers: await window.electronAPI.storageRead('wa_providers'),
    lastProjectId: await window.electronAPI.storageRead('wa_lastProjectId'),
    defaultProject: await window.electronAPI.storageRead('wa_project_default')
  }))

  const mockProviderConfig = {
    providers: [{
      id: MOCK_PROVIDER_ID,
      name: 'Codex Stage1 Mock Provider',
      baseUrl: MOCK_BASE_URL,
      apiKey: 'codex-stage1-mock-key',
      models: ['codex-stage1-mock-model'],
      selectedModel: 'codex-stage1-mock-model',
      temperature: 0.1,
      maxTokens: 4096,
      purpose: ['generate'],
      providerType: 'openai-compatible',
      streamMode: false
    }],
    generateProvider: MOCK_PROVIDER_ID,
    verifyProvider: null,
    detectProvider: null
  }
  await page.evaluate(async ({ config }) => {
    await window.electronAPI.storageWrite('wa_providers', config)
    await window.electronAPI.storageWrite('wa_lastProjectId', 'codex-stage1-e2e')
  }, { config: mockProviderConfig })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20000 })

  await page.evaluate(() => {
    const pipelineClose = document.querySelector('#btn-close-pl')
    if (pipelineClose) pipelineClose.click()
    const outlineClose = document.querySelector('#btn-close-outline-workspace')
    if (outlineClose) outlineClose.click()
  })
  await page.waitForTimeout(300)
  await page.locator('#btn-outline-workspace').click()
  await page.waitForSelector('#outline-editor')
  await page.locator('#btn-ai-co-create').click()
  await page.waitForSelector('#ow-chat-input')

  await page.evaluate(() => {
    const outlineText = [
      '第一卷 风暴起点',
      '第一卷内容。主线围绕北方风暴展开。',
      '第1章 夜行',
      '第一章内容。男主在夜路中遇到风暴。',
      '第2章 灯塔',
      '第二章内容。男主在灯塔下发现旧信。',
      '第二卷 潮汐',
      '第二卷内容。商队南下，风暴记忆成为伏笔。'
    ].join('\n')
    const input = document.querySelector('#outline-editor')
    if (!input) throw new Error('outline editor not found')
    input.value = outlineText
    input.dispatchEvent(new Event('input', { bubbles: true }))
    const chatInput = document.querySelector('#ow-chat-input')
    if (!chatInput) throw new Error('outline chat input not found')
    chatInput.value = '请先读取结构地图，再读取第一章局部全文'
    chatInput.dispatchEvent(new Event('input', { bubbles: true }))
  })

  await page.locator('#btn-ow-send').click()
  await page.waitForFunction(() => {
    const sendButton = document.querySelector('#btn-ow-send')
    const text = document.body.textContent || ''
    return Boolean(sendButton) && text.includes('已读取第一章局部全文')
  }, null, { timeout: 30000 })

  assert(requests.length >= 3, `mock provider received ${requests.length} calls`)
  assert(requests[0].url === '/v1/chat/completions', `first request endpoint is ${requests[0].url}`)

  const firstTools = requests[0].body?.tools || []
  const toolNames = firstTools.map(tool => tool?.function?.name || tool?.name)
  for (const name of [
    'outline.get_structure',
    'outline.read_range',
    'outline.search',
    'outline.get_summary',
    'editor.multi_get_state',
    'editor.global_search',
    'editor.workspace_summary'
  ]) {
    assert(toolNames.includes(name), `${name} appears in provider tool schema`)
  }

  const secondMessages = requests[1].body?.messages || []
  const structureResult = secondMessages.find(message =>
    message.role === 'tool' && (message.content || '').includes('大纲结构地图')
  )
  assert(Boolean(structureResult), 'outline.get_structure result is sent back to provider')
  assert((structureResult?.content || '').includes('第1章 夜行'), 'structure result contains chapter node')

  const thirdMessages = requests[2].body?.messages || []
  const readResult = thirdMessages.find(message =>
    message.role === 'tool' && (message.content || '').includes('第一章内容')
  )
  assert(Boolean(readResult), 'outline.read_range result is sent back to provider')
  assert((readResult?.content || '').includes('男主在夜路中遇到风暴'), 'read_range returns local full text')

  const assistantText = await page.evaluate(() => document.body.textContent || '')
  assert(assistantText.includes('已读取第一章局部全文'), 'assistant bubble shows completed response')

  await page.evaluate(async ({ saved }) => {
    await window.electronAPI.storageWrite('wa_providers', saved.providers)
    await window.electronAPI.storageWrite('wa_lastProjectId', saved.lastProjectId)
    await window.electronAPI.storageWrite('wa_project_default', saved.defaultProject)
  }, { saved: original })
} catch (error) {
  try {
    const context = browser.contexts()[0]
    const page = context.pages().find(item => !item.url().startsWith('devtools://')) || context.pages()[0]
    if (page) {
      await page.evaluate(async ({ saved }) => {
        await window.electronAPI.storageWrite('wa_providers', saved.providers)
        await window.electronAPI.storageWrite('wa_lastProjectId', saved.lastProjectId)
        await window.electronAPI.storageWrite('wa_project_default', saved.defaultProject)
      }, { saved: original })
    }
  } catch {}
  throw error
} finally {
  try { await browser.close() } catch {}
  server.close()
}

console.log('[DONE] Stage 1 outline tool surface verification completed')
