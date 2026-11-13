import http from 'node:http'
import { chromium } from 'playwright'

const CDP_URL = 'http://127.0.0.1:9227'
const MOCK_PORT = 59733
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const MOCK_PROVIDER_ID = 'codex-stage2-skill-provider'
const PROJECT_ID = 'codex-stage2-e2e'

function assert(condition, message) {
  if (!condition) throw new Error(message)
  console.log('[PASS] ' + message)
}

const requests = []
const toolEvents = []
let replyIndex = 0
const replies = [
  { content: '这是一个讨论回复，不会修改编辑器。' },
  {
    toolCall: {
      commands: [{
        operation: 'replace_match',
        target: '第二章内容。男主在灯塔下发现旧信。',
        content: '第二章内容。男主在灯塔下发现旧信，并确认寄信人身份。'
      }],
      reason: '修改第二章伏笔',
      reveal: { mode: 'instant', firstChange: true }
    }
  },
  { content: '已通过直写工具完成修改。' }
]

const server = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    let body = null
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    requests.push({ url: request.url, body })
    const reply = replies[Math.min(replyIndex, replies.length - 1)] || replies[replies.length - 1]
    replyIndex++

    let payload
    if (reply.toolCall) {
      payload = {
        choices: [{
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [{
              id: `stage2-skill-call-${replyIndex}`,
              type: 'function',
              function: {
                name: 'editor.write',
                arguments: JSON.stringify(reply.toolCall)
              }
            }]
          }
        }]
      }
    } else {
      payload = {
        choices: [{
          finish_reason: 'stop',
          message: { role: 'assistant', content: reply.content }
        }]
      }
    }

    console.log(`[MOCK] request ${requests.length}: ${request.url}`)
    const tools = body?.tools || []
    console.log(`[MOCK] tools: ${tools.map(tool => tool?.function?.name || tool?.name).join(', ') || '(none)'}`)
    const messages = body?.messages || []
    console.log(`[MOCK] messages: ${messages.map(message => `${message.role}:${String(message.content || '').slice(0, 120).replace(/\s+/g, ' ')}`).join(' | ')}`)
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
    page = context.pages().find(item => !item.url().startsWith('devtools://')) || null
    if (!page) throw new Error('Electron page not found')
    page.on('console', message => {
      if (['error', 'warning'].includes(message.type())) {
        console.log(`[PAGE ${message.type().toUpperCase()}] ${message.text()}`)
      }
    })
    page.on('pageerror', error => {
      console.log(`[PAGE ERROR] ${error.message}`)
    })

  original = await page.evaluate(async () => ({
    providers: await window.electronAPI.storageRead('wa_providers'),
    lastProjectId: await window.electronAPI.storageRead('wa_lastProjectId'),
    defaultProject: await window.electronAPI.storageRead('wa_project_default'),
    e2eProject: await window.electronAPI.storageRead('wa_project_codex-stage2-e2e'),
    ctx: await window.electronAPI.storageRead('wa_ctx_codex-stage2-e2e')
    , pipelineConfig: await window.electronAPI.storageRead('wa_pipeline_step_config')
  }))

  const mockProviderConfig = {
    providers: [{
      id: MOCK_PROVIDER_ID,
      name: 'Codex Stage2 Skill Provider',
      baseUrl: MOCK_BASE_URL,
      apiKey: 'codex-stage2-skill-key',
      models: ['codex-stage2-skill-model'],
      selectedModel: 'codex-stage2-skill-model',
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
    await window.electronAPI.storageWrite('wa_lastProjectId', 'codex-stage2-e2e')
    const project = await window.electronAPI.storageRead('wa_project_codex-stage2-e2e')
    if (project) {
      project.outlineChat = []
      await window.electronAPI.storageWrite('wa_project_codex-stage2-e2e', project)
    }
    await window.electronAPI.storageWrite('wa_ctx_codex-stage2-e2e', { version: 1, sessions: [] })
    const pipelineConfig = await window.electronAPI.storageRead('wa_pipeline_step_config') || {}
    pipelineConfig.agents = pipelineConfig.agents || {}
    pipelineConfig.skills = pipelineConfig.skills || {}
    pipelineConfig.modes = pipelineConfig.modes || {}
    pipelineConfig.agents[0] = ''
    pipelineConfig.skills[0] = ['codex-stage2-skill']
    pipelineConfig.modes[0] = 'compose'
    await window.electronAPI.storageWrite('wa_pipeline_step_config', pipelineConfig)
  }, { config: mockProviderConfig })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20000 })

  await page.evaluate(() => {
    document.querySelector('#btn-close-pl')?.click()
    document.querySelector('#btn-close-outline-workspace')?.click()
  })
  await page.waitForTimeout(300)
  await page.locator('#btn-outline-workspace').click()
  await page.waitForSelector('#outline-editor')
  await page.locator('#btn-ai-co-create').click()
  await page.waitForSelector('#ow-chat-input')
  await page.selectOption('#ow-skill-mode', 'chain')
  await page.evaluate(() => {
    window.__codexToolEvents = []
    window.addEventListener('tool-activity', event => {
      window.__codexToolEvents?.push(event.detail)
    })
  })

  const outlineText = [
    '第一卷 风暴起点',
    '第一章内容。男主在夜路中遇到风暴。',
    '第二章内容。男主在灯塔下发现旧信。',
    '第三章内容。男主确认寄信人身份。'
  ].join('\n')
  await page.evaluate(async ({ projectId, text }) => {
    const project = await window.electronAPI.storageRead(`wa_project_${projectId}`)
    if (project) {
      project.outline = text
      project.outlineText = text
      await window.electronAPI.storageWrite(`wa_project_${projectId}`, project)
    }
  }, { projectId: 'codex-stage2-e2e', text: outlineText })
  await page.locator('#outline-editor').fill(outlineText)

  const textSkill = {
    id: 'codex-stage2-skill',
    name: 'Codex Stage2 Skill',
    template: '你是大纲共创测试技能。',
    format: 'text',
    category: 'general',
    executionMode: 'chain',
    outputFormat: 'text',
    validationRules: [],
    splitSize: 1000,
    intents: ['discuss', 'analyze', 'edit', 'generate']
  }
  await page.evaluate(async skill => {
    const raw = await window.electronAPI.storageRead('wa_skills')
    const skills = Array.isArray(raw) ? raw : []
    await window.electronAPI.storageWrite('wa_skills', [
      ...skills.filter(item => item.id !== skill.id && item.id !== 'folder:codex-stage2-skill'),
      skill
    ])
  }, textSkill)
  const editorState = await page.evaluate(() => {
    const input = document.querySelector('#outline-editor')
    return { value: input?.value || '', length: (input?.value || '').length }
  })
  assert(editorState.length > 0, `outline editor has real v-model content (${editorState.length} chars)`)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20000 })
  await page.waitForFunction(skillId => {
    const state = window.__pinia?.state?.value?.skill
    return Boolean(state?.skills?.some(skill => skill?.id === skillId))
  }, 'codex-stage2-skill', { timeout: 10000 })
  assert(true, 'SKILL store has the injected outline skill')
  await page.evaluate(() => {
    document.querySelector('#btn-close-pl')?.click()
    document.querySelector('#btn-close-outline-workspace')?.click()
  })
  await page.waitForTimeout(300)
  await page.locator('#btn-outline-workspace').click()
  await page.waitForSelector('#outline-editor')
  await page.locator('#outline-editor').fill(outlineText)
  const restoredEditorState = await page.evaluate(() => {
    const input = document.querySelector('#outline-editor')
    return { value: input?.value || '', length: (input?.value || '').length }
  })
  assert(restoredEditorState.length > 0, `outline editor is restored after reload (${restoredEditorState.length} chars)`)
  await page.locator('#btn-ai-co-create').click()
  await page.waitForSelector('#ow-chat-input')
  await page.evaluate(() => {
    window.__codexToolEvents = []
    window.addEventListener('tool-activity', event => {
      window.__codexToolEvents?.push(event.detail)
    })
  })

  await page.waitForFunction(() => {
    const chips = document.querySelector('#ow-selected-skills')
    return Boolean(chips && (chips.textContent || '').includes('Codex Stage2 Skill'))
  }, null, { timeout: 10000 })
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('tool-activity', { detail: { type: 'tool_start', toolName: '__binding_test' } }))
  })
  await page.waitForTimeout(200)
  const bindingEvents = await page.evaluate(() => window.__codexToolEvents || [])
  assert(bindingEvents.some(event => event.toolName === '__binding_test'), 'tool activity listener is bound in the page world')

  async function sendAndWait(text, expected) {
    await page.locator('#ow-chat-input').fill(text)
    await page.locator('#btn-ow-send').click()
    await page.waitForFunction(value => (document.body.textContent || '').includes(value), expected, { timeout: 30000 })
    await page.waitForTimeout(400)
  }

  const outlineEditorLocator = page.locator('#outline-editor')

  await sendAndWait('我们讨论一下第二章的伏笔', '这是一个讨论回复，不会修改编辑器。')
  assert(
    (await outlineEditorLocator.inputValue()).includes('第二章内容。男主在灯塔下发现旧信。'),
    'discuss SKILL call does not modify the editor directly'
  )
  const discussRequest = requests[requests.length - 1]
  const discussTools = discussRequest.body?.tools || []
  assert(discussTools.length > 0, 'discuss SKILL call still receives read tools')
  assert(
    discussTools.every(tool => (tool?.function?.name || tool?.name) !== 'editor.write'),
    'discuss SKILL call has no editor.write'
  )

  await sendAndWait('请把第二章旧信内容修改为确认寄信人身份', '已通过直写工具完成修改。')
  const editRequest = requests[requests.length - 1]
  const editTools = editRequest.body?.tools || []
  toolEvents.push(...await page.evaluate(() => window.__codexToolEvents || []))
  assert(
    editTools.some(tool => (tool?.function?.name || tool?.name) === 'editor.write'),
    'edit SKILL call exposes editor.write'
  )
  assert(
    toolEvents.some(event => event.type === 'tool_start' && event.toolName === 'editor.write'),
    'editor.write actually executes through the tool loop'
  )

  const directWriteButton = page.locator('#ow-chat-messages .ow-msg.assistant').last()
    .locator('.ow-msg-actions button', { hasText: '回滚批次' })
  assert(await directWriteButton.count() > 0, 'assistant bubble exposes the direct-write rollback action')
  assert(
    (await outlineEditorLocator.inputValue()).includes('第二章内容。男主在灯塔下发现旧信，并确认寄信人身份。'),
    'edit SKILL call directly writes the outline editor'
  )
  assert(
    toolEvents.some(event => event.type === 'tool_result' && event.toolName === 'editor.write' && event.ok === true),
    'editor.write tool loop finishes successfully'
  )

  await page.keyboard.press('Escape')
  await page.evaluate(async saved => {
    await window.electronAPI.storageWrite('wa_providers', saved.providers)
    await window.electronAPI.storageWrite('wa_lastProjectId', saved.lastProjectId)
    await window.electronAPI.storageWrite('wa_project_default', saved.defaultProject)
    await window.electronAPI.storageWrite('wa_project_codex-stage2-e2e', saved.e2eProject)
    await window.electronAPI.storageWrite('wa_ctx_codex-stage2-e2e', saved.ctx)
    await window.electronAPI.storageWrite('wa_pipeline_step_config', saved.pipelineConfig)
  }, original)
} catch (error) {
  try {
    if (page && original) {
      await page.evaluate(async saved => {
        await window.electronAPI.storageWrite('wa_providers', saved.providers)
        await window.electronAPI.storageWrite('wa_lastProjectId', saved.lastProjectId)
        await window.electronAPI.storageWrite('wa_project_default', saved.defaultProject)
        await window.electronAPI.storageWrite('wa_project_codex-stage2-e2e', saved.e2eProject)
        await window.electronAPI.storageWrite('wa_ctx_codex-stage2-e2e', saved.ctx)
        await window.electronAPI.storageWrite('wa_pipeline_step_config', saved.pipelineConfig)
      }, original)
    }
  } catch {}
  throw error
} finally {
  try { await browser.close() } catch {}
  server.close()
}

console.log('[DONE] Stage 2 SKILL tool parity verification completed')
