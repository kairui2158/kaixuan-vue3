import http from 'node:http'
import { chromium } from 'playwright'

const CDP_URL = 'http://127.0.0.1:9227'
const MOCK_PORT = 59732
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const MOCK_PROVIDER_ID = 'codex-stage2-mock-provider'
const PROJECT_ID = 'codex-stage2-e2e'
const OUTLINE_TEXT = [
  '第一卷 风暴起点',
  '第一章内容。男主在夜路中遇到风暴。',
  '第二章重复标记：第一次出现',
  '第二章内容。男主在灯塔下发现旧信。',
  '第二章重复标记：第二次出现'
].join('\n')

function assert(condition, message) {
  if (!condition) throw new Error(message)
  console.log('[PASS] ' + message)
}

function assistantToolCall(id, commands, reason = 'Stage2 partial retry verification') {
  return {
    choices: [{
      finish_reason: 'tool_calls',
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [{
          id,
          type: 'function',
          function: {
          name: 'editor.write',
            arguments: JSON.stringify({ commands, reason })
          }
        }]
      }
    }]
  }
}

const requests = []
const server = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    let body = null
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    const requestRecord = { url: request.url, body }
    requests.push(requestRecord)

    let payload
    if (requests.length === 1) {
      payload = assistantToolCall('stage2-call-partial-failure', [
        {
          operation: 'replace_match',
          target: '第二章内容。男主在灯塔下发现旧信。',
          content: '第二章内容。男主在灯塔下发现旧信，并确认寄信人身份。'
        },
        {
          operation: 'replace_match',
          target: '重复标记',
          content: '这段修复后的第二章伏笔。'
        }
      ], '初次提交：一条唯一命中，一条多匹配')
    } else if (requests.length === 2) {
      payload = assistantToolCall('stage2-call-retry-only', [
        {
          operation: 'replace_match',
          target: '第二章重复标记：第一次出现',
          content: '第二章重复标记：第一次出现，已经修复。'
        }
      ], '只重提失败条目')
    } else {
      payload = {
        choices: [{
          finish_reason: 'stop',
          message: { role: 'assistant', content: '已完成失败条目修正，成功条目保持原提案。' }
        }]
      }
    }

    console.log(`[MOCK] request ${requests.length}: ${request.url}`)
    const wireMessages = requestRecord.body?.messages || []
    for (const [index, message] of wireMessages.entries()) {
      console.log(`[MOCK] message ${index}: role=${message.role} content=${String(message.content || '').slice(0, 220)}`)
    }

    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify(payload))
  })
})

await new Promise(resolve => server.listen(MOCK_PORT, '127.0.0.1', resolve))

const browser = await chromium.connectOverCDP(CDP_URL)
let page
let original
try {
  const context = browser.contexts()[0]
  if (!context) throw new Error('Electron context not found')
  page = context.pages().find(item => !item.url().startsWith('devtools://')) || null
  if (!page) throw new Error('Electron page not found')

  original = await page.evaluate(async () => ({
    providers: await window.electronAPI.storageRead('wa_providers'),
    lastProjectId: await window.electronAPI.storageRead('wa_lastProjectId'),
    defaultProject: await window.electronAPI.storageRead('wa_project_default'),
    e2eProject: await window.electronAPI.storageRead('wa_project_codex-stage2-e2e')
  }))

  const mockProviderConfig = {
    providers: [{
      id: MOCK_PROVIDER_ID,
      name: 'Codex Stage2 Mock Provider',
      baseUrl: MOCK_BASE_URL,
      apiKey: 'codex-stage2-mock-key',
      models: ['codex-stage2-mock-model'],
      selectedModel: 'codex-stage2-mock-model',
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
  await page.evaluate(async ({ config, fixture }) => {
    await window.electronAPI.storageWrite('wa_providers', config)
    await window.electronAPI.storageWrite('wa_lastProjectId', 'codex-stage2-e2e')
    const project = await window.electronAPI.storageRead('wa_project_codex-stage2-e2e')
    if (project) {
      project.outlineChat = []
      project.outline = fixture.outlineText
      project.outlineText = fixture.outlineText
      await window.electronAPI.storageWrite('wa_project_codex-stage2-e2e', project)
    }
    await window.electronAPI.storageWrite('wa_ctx_codex-stage2-e2e', { version: 1, sessions: [] })
  }, { config: mockProviderConfig, fixture: { outlineText: OUTLINE_TEXT } })
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

  await page.locator('#outline-editor').fill(OUTLINE_TEXT)
  await page.waitForTimeout(600)
  await page.locator('#ow-chat-input').fill('请修改第二章，其中一条 target 会多匹配，然后只修正失败条目')

  await page.locator('#btn-ow-send').click()
  await page.waitForFunction(() => {
    const text = document.body.textContent || ''
    return text.includes('已完成失败条目修正，成功条目保持原提案。')
  }, null, { timeout: 30000 })
  await page.waitForTimeout(500)

  assert(requests.length >= 3, `mock provider received ${requests.length} calls`)
  assert(requests[0].url === '/v1/chat/completions', `first request endpoint is ${requests[0].url}`)

  const writeTools = requests[0].body?.tools || []
  assert(
    writeTools.some(tool => (tool?.function?.name || tool?.name) === 'editor.write'),
    'editor.write appears in provider tool schema'
  )

  const retryMessages = requests[1].body?.messages || []
  const diagnosticsMessage = retryMessages.find(message =>
    message.role === 'tool' &&
    (message.content || '').includes('1 条失败') &&
    (message.content || '').includes('ambiguous_target')
  )
  assert(Boolean(diagnosticsMessage), 'partial failure diagnostics are returned to provider')
  assert(
    (diagnosticsMessage?.content || '').includes('第 2 条'),
    'diagnostics identifies the failed command index'
  )
  assert(
    (diagnosticsMessage?.content || '').includes('keepIndexes'),
    'diagnostics includes succeeded command indexes for retry'
  )

  const secondToolCall = requests[2].body?.messages?.filter(message => message.role === 'assistant').at(-1)?.tool_calls?.[0]
  assert(Boolean(secondToolCall), 'second request contains assistant tool call')
  const secondArguments = JSON.parse(secondToolCall?.function?.arguments || '{}')
  assert(secondArguments.commands?.length === 1, 'second proposal contains only the failed command')
  assert(
    secondArguments.commands?.[0]?.target === '第二章重复标记：第一次出现',
    'second proposal replaces only the failed target'
  )

  const directWriteActions = page.locator('#ow-chat-messages .ow-msg.assistant').last()
    .locator('.ow-msg-actions button', { hasText: '回滚批次' })
  assert(await directWriteActions.count() > 0, 'assistant bubble exposes the direct-write rollback action')

  const toolToggle = page.locator('.ow-tool-stream-toggle').first()
  assert(await toolToggle.count() > 0, 'assistant bubble exposes tool process stream')
  await toolToggle.click()
  await page.waitForSelector('.ow-tool-stream-item.tool_error')
  const errorStreamLocator = page.locator('#ow-chat-messages .ow-msg.assistant').last()
    .locator('.ow-tool-stream-item.tool_error')
  const errorStreamText = await errorStreamLocator.textContent()
  assert(
    (errorStreamText || '').includes('1 条命令需要修正'),
    'tool stream shows one command needs repair'
  )

  const finalOutlineText = await page.locator('#outline-editor').inputValue()
  assert(
    finalOutlineText.includes('第二章内容。男主在灯塔下发现旧信，并确认寄信人身份。'),
    'first successful write remains applied after repair'
  )
  assert(
    finalOutlineText.includes('第二章重复标记：第一次出现，已经修复。'),
    'retry write applies only the failed command'
  )

  await page.evaluate(async ({ saved }) => {
    await window.electronAPI.storageWrite('wa_providers', saved.providers)
    await window.electronAPI.storageWrite('wa_lastProjectId', saved.lastProjectId)
    await window.electronAPI.storageWrite('wa_project_default', saved.defaultProject)
    await window.electronAPI.storageWrite('wa_project_codex-stage2-e2e', saved.e2eProject)
  }, { saved: original })
} catch (error) {
  try {
    if (page && original) {
      await page.evaluate(async ({ saved }) => {
        await window.electronAPI.storageWrite('wa_providers', saved.providers)
        await window.electronAPI.storageWrite('wa_lastProjectId', saved.lastProjectId)
        await window.electronAPI.storageWrite('wa_project_default', saved.defaultProject)
        await window.electronAPI.storageWrite('wa_project_codex-stage2-e2e', saved.e2eProject)
      }, { saved: original })
    }
  } catch {}
  throw error
} finally {
  try { await browser.close() } catch {}
  server.close()
}

console.log('[DONE] Stage 2 write diagnostics and partial retry verification completed')
