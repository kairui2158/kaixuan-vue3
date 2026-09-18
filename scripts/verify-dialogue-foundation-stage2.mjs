import http from 'node:http'
import { chromium } from 'playwright'

const CDP_URL = 'http://127.0.0.1:9227'
const MOCK_PORT = 59753
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const MOCK_PROVIDER_ID = 'codex-dialogue-stage2-provider'
const PROJECT_ID = 'codex-dialogue-stage2-e2e'

function assert(condition, message) {
  if (!condition) throw new Error(message)
  console.log('[PASS] ' + message)
}

const requests = []
let outlineMode = false

function chatCompletion(content) {
  return {
    choices: [{
      finish_reason: 'stop',
      message: { role: 'assistant', content }
    }]
  }
}

function toolCallCompletion() {
  return {
    choices: [{
      finish_reason: 'tool_calls',
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [{
          id: 'codex-dialogue-stage2-call-1',
          type: 'function',
          function: {
            name: 'editor.write',
            arguments: JSON.stringify({
              commands: [{
                operation: 'replace_match',
                target: '第二章内容。男主在灯塔下发现旧信。',
                content: '第二章内容。男主确认寄信人身份。'
              }],
              reason: '统一意图授权验证',
              reveal: { mode: 'instant', firstChange: true }
            })
          }
        }]
      }
    }]
  }
}

const server = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    let body = null
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    requests.push({ url: request.url, body })

    let payload
    if (requests.length === 1) {
      payload = toolCallCompletion()
    } else {
      payload = chatCompletion('这是讨论回复，不需要修改编辑器。')
    }

    console.log(`[MOCK] request ${requests.length}: ${request.url}`)
    console.log(`[MOCK] tools: ${(body?.tools || []).map(tool => tool?.function?.name || tool?.name).join(', ') || '(none)'}`)
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
  page = context.pages().find(item => !item.url().startsWith('devtools://')) || context.pages()[0]
  if (!page) throw new Error('Electron page not found')
  page.on('pageerror', error => console.log(`[PAGE ERROR] ${error.message}`))
  page.on('console', message => {
    if (message.type() === 'error') console.log(`[PAGE CONSOLE ERROR] ${message.text()}`)
  })
  page.on('requestfailed', request => {
    if (request.url().includes('127.0.0.1')) {
      console.log(`[REQUEST FAILED] ${request.url()} ${request.failure()?.errorText}`)
    }
  })

  original = await page.evaluate(async () => ({
    providers: await window.electronAPI.storageRead('wa_providers'),
    lastProjectId: await window.electronAPI.storageRead('wa_lastProjectId'),
    defaultProject: await window.electronAPI.storageRead('wa_project_default'),
    e2eProject: await window.electronAPI.storageRead('wa_project_codex-dialogue-stage2-e2e'),
    homeChat: await window.electronAPI.storageRead('wa_chat_codex-dialogue-stage2-e2e')
  }))

  await page.evaluate(async () => {
    await window.electronAPI.storageWrite('wa_lastProjectId', 'codex-dialogue-stage2-e2e')
    const project = await window.electronAPI.storageRead('wa_project_codex-dialogue-stage2-e2e')
      || { projectName: 'Codex Dialogue Stage2 E2E', editorTabs: [] }
    project.chat = []
    project.editorTabs = []
    await window.electronAPI.storageWrite('wa_project_codex-dialogue-stage2-e2e', project)
  })

  await page.evaluate(async ({ config }) => {
    await window.electronAPI.storageWrite('wa_providers', config)
  }, {
    config: {
      providers: [{
        id: MOCK_PROVIDER_ID,
        name: 'Codex Dialogue Stage2 Mock Provider',
        baseUrl: MOCK_BASE_URL,
        apiKey: 'codex-dialogue-stage2-key',
        models: ['codex-dialogue-stage2-model'],
        selectedModel: 'codex-dialogue-stage2-model',
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
  })

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20000 })
  await page.evaluate(async () => {
    const projectStore = window.__pinia?.state?.value?.project
    await new Promise(resolve => {
      if (projectStore?.currentProjectId === 'codex-dialogue-stage2-e2e') return resolve()
      const stop = setInterval(() => {
        if (projectStore?.currentProjectId === 'codex-dialogue-stage2-e2e') {
          clearInterval(stop)
          resolve()
        }
      }, 100)
      setTimeout(() => {
        clearInterval(stop)
        resolve()
      }, 5000)
    })
  })

  await page.evaluate(() => {
    document.querySelector('#btn-close-pl')?.click()
    document.querySelector('#btn-close-outline-workspace')?.click()
  })
  await page.waitForTimeout(500)

  // Ensure the main editor has a real active tab, otherwise tools are intentionally disabled.
  await page.evaluate(() => {
    const store = window.__pinia?.state?.value?.editor
    if (!store?.tabs?.length) {
      store.tabs = [{
        id: 'codex-dialogue-stage2-tab',
        title: '第二章 灯塔',
        mode: 'ch-body',
        chapterId: 'codex-dialogue-stage2-chapter',
        content: '第二章内容。男主在灯塔下发现旧信。'
      }]
      store.activeTabId = store.tabs[0].id
    }
    const activeTab = store.tabs.find(tab => tab.id === store.activeTabId) || store.tabs[0]
    store.activeTabId = activeTab.id
    activeTab.content = '第二章内容。男主在灯塔下发现旧信。'
  })
  await page.waitForTimeout(500)

  async function sendAndWait(text, expected) {
    await page.locator('#user-input').fill(text)
    await page.locator('#btn-send').click()
    await page.waitForFunction(value => (document.body.textContent || '').includes(value), expected, { timeout: 30000 })
    await page.waitForTimeout(600)
  }

  // First: edit intent must expose and execute editor.write.
  await sendAndWait('请把第二章旧信内容修改为确认寄信人身份', '已写入编辑器：1 条')
  assert(requests.length >= 1, 'edit request reaches the mock provider')
  const editTools = requests[0].body?.tools || []
  assert(editTools.some(tool => tool?.function?.name === 'editor.write'), 'edit intent exposes editor.write')
  assert(
    await page.locator('#chat-messages .message.assistant, #messages-list .message.assistant, #messages-list .assistant').count() > 0,
    'assistant bubble exists after edit intent'
  )

  // Direct write is the only edit execution path.
  const editorAfterEdit = await page.evaluate(() => {
    const editor = window.__pinia?.state?.value?.editor
    const activeTab = editor?.tabs?.find(tab => tab.id === editor?.activeTabId)
    return activeTab?.content || ''
  })
  assert(
    editorAfterEdit.includes('第二章内容。男主确认寄信人身份。'),
    'edit intent directly writes the editor'
  )

  const closeDiff = page.locator('#btn-close-diff')
  if (await closeDiff.count() && await closeDiff.isVisible()) {
    await closeDiff.click()
  } else {
    await page.keyboard.press('Escape')
  }
  await page.waitForTimeout(600)

  // Second: discussion intent stays read-only.
  await sendAndWait('我们讨论一下第二章的伏笔', '这是讨论回复，不需要修改编辑器。')
  const discussRequest = requests[requests.length - 1]
  assert(requests.length >= 2, 'discuss request reaches the mock provider')
  const discussTools = discussRequest.body?.tools || []
  assert(discussTools.length > 0, 'discuss request still receives read tools')
  assert(
    discussTools.every(tool => tool?.function?.name !== 'editor.write'),
    'discuss request has no editor.write'
  )

  const finalEditor = await page.evaluate(() => {
    const editor = window.__pinia?.state?.value?.editor
    const activeTab = editor?.tabs?.find(tab => tab.id === editor?.activeTabId)
    return activeTab?.content || ''
  })
  assert(finalEditor.includes('第二章内容。男主确认寄信人身份。'), 'discussion leaves the direct-write result unchanged')

  await page.evaluate(async saved => {
    await window.electronAPI.storageWrite('wa_providers', saved.providers)
    await window.electronAPI.storageWrite('wa_lastProjectId', saved.lastProjectId)
    await window.electronAPI.storageWrite('wa_project_default', saved.defaultProject)
    await window.electronAPI.storageWrite('wa_project_codex-dialogue-stage2-e2e', saved.e2eProject)
  }, original)
} catch (error) {
  try {
    if (page && original) {
      await page.evaluate(async saved => {
        await window.electronAPI.storageWrite('wa_providers', saved.providers)
        await window.electronAPI.storageWrite('wa_lastProjectId', saved.lastProjectId)
        await window.electronAPI.storageWrite('wa_project_default', saved.defaultProject)
        await window.electronAPI.storageWrite('wa_project_codex-dialogue-stage2-e2e', saved.e2eProject)
      }, original)
    }
  } catch {}
  throw error
} finally {
  try { await browser.close() } catch {}
}

console.log('[DONE] API dialogue foundation stage 2 main-workspace verification completed')

async function verifyOutlineWorkspace() {
  requests.length = 0
  outlineMode = true
  const browser = await chromium.connectOverCDP(CDP_URL)
  let page
  let original
  try {
    const context = browser.contexts()[0]
    page = context.pages().find(item => !item.url().startsWith('devtools://')) || context.pages()[0]
    if (!page) throw new Error('Electron page not found')
    page.on('pageerror', error => console.log(`[PAGE ERROR] ${error.message}`))
    page.on('console', message => {
      if (message.type() === 'error') {
        console.log(`[PAGE CONSOLE ERROR] ${message.text()}`)
      }
    })

    original = await page.evaluate(async () => ({
      providers: await window.electronAPI.storageRead('wa_providers'),
      lastProjectId: await window.electronAPI.storageRead('wa_lastProjectId'),
      defaultProject: await window.electronAPI.storageRead('wa_project_default'),
      e2eProject: await window.electronAPI.storageRead('wa_project_codex-dialogue-stage2-e2e'),
      pipelineConfig: await window.electronAPI.storageRead('wa_pipeline_step_config'),
      skills: await window.electronAPI.storageRead('wa_skills')
    }))

    await page.evaluate(async () => {
      await window.electronAPI.storageWrite('wa_lastProjectId', 'codex-dialogue-stage2-e2e')
      const project = await window.electronAPI.storageRead('wa_project_codex-dialogue-stage2-e2e')
        || await window.electronAPI.storageRead('wa_project_project_codex-dialogue-stage2-e2e')
        || { projectName: 'Codex Dialogue Stage2 E2E', editorTabs: [] }
      project.outlineText = '第一卷 风暴起点\n第二章内容。男主在灯塔下发现旧信。'
      project.outlineChat = []
      project.chat = []
      project.editorTabs = []
      await window.electronAPI.storageWrite('wa_project_codex-dialogue-stage2-e2e', project)
      const pipelineConfig = await window.electronAPI.storageRead('wa_pipeline_step_config') || {}
      pipelineConfig.skills = pipelineConfig.skills || {}
      pipelineConfig.modes = pipelineConfig.modes || {}
      pipelineConfig.skills[0] = []
      pipelineConfig.modes[0] = 'chain'
      await window.electronAPI.storageWrite('wa_pipeline_step_config', pipelineConfig)
      await window.electronAPI.storageWrite('wa_skills', { skills: [] })
    })

    await page.evaluate(async ({ config }) => {
      await window.electronAPI.storageWrite('wa_providers', config)
    }, {
      config: {
        providers: [{
          id: MOCK_PROVIDER_ID,
          name: 'Codex Dialogue Stage2 Mock Provider',
          baseUrl: MOCK_BASE_URL,
          apiKey: 'codex-dialogue-stage2-key',
          models: ['codex-dialogue-stage2-model'],
          selectedModel: 'codex-dialogue-stage2-model',
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
    })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#app', { timeout: 20000 })
    const outlineRuntimeState = await page.evaluate(() => {
      const provider = window.__pinia?.state?.value?.provider
      const pipeline = window.__pinia?.state?.value?.pipeline
      const skill = window.__pinia?.state?.value?.skill
      return {
        providers: provider?.providers?.map(item => ({ id: item.id, baseUrl: item.baseUrl })),
        generateProvider: provider?.generateProvider,
        stepConfig: pipeline?.stepConfig || pipeline?.config || null,
        skills: (skill?.skills || []).map(item => ({
          id: item.id,
          name: item.name,
          format: item.format,
          folderPath: item.folderPath,
          templateLength: typeof item.template === 'string' ? item.template.length : 0
        }))
      }
    })
    console.log('[DEBUG] outline runtime state after reload:', JSON.stringify(outlineRuntimeState))
    await page.evaluate(() => {
      document.querySelector('#btn-close-pl')?.click()
      document.querySelector('#btn-close-outline-workspace')?.click()
    })
    await page.waitForTimeout(500)
    await page.locator('#btn-outline-workspace').click()
    await page.waitForSelector('#outline-editor', { timeout: 20000 })
    await page.locator('#btn-ai-co-create').click()
    await page.waitForSelector('#ow-chat-input', { timeout: 20000 })
    await page.waitForTimeout(1000)
    console.log('[DEBUG] chat input visible after toggle:', await page.locator('#ow-chat-input').isVisible())
    console.log('[DEBUG] page url:', page.url())
    console.log('[DEBUG] selected skill chips:', await page.locator('#ow-selected-skills .ow-skill-chip').count())
    console.log('[DEBUG] skill mode value:', await page.locator('#ow-skill-mode').inputValue().catch(() => '(missing)'))

    const outlineText = '第一卷 风暴起点\n第二章内容。男主在灯塔下发现旧信。'
    await page.locator('#outline-editor').fill(outlineText)
    await page.waitForTimeout(600)

    async function sendAndWait(text, expected) {
      console.log('[DEBUG] sendAndWait: filling input')
      await page.locator('#ow-chat-input').fill(text)
      console.log('[DEBUG] sendAndWait: clicking send')
      await page.locator('#btn-ow-send').click()
      console.log('[DEBUG] sendAndWait: waiting for response')
      await page.waitForFunction(value => (document.body.textContent || '').includes(value), expected, { timeout: 30000 })
      await page.waitForTimeout(600)
    }

    await sendAndWait('请把第二章旧信内容修改为确认寄信人身份', '[OK] API 已直接写入大纲')
    assert(requests.length >= 1, 'outline edit request reaches the mock provider')
    const editTools = requests[0].body?.tools || []
    assert(
      editTools.some(tool => tool?.function?.name === 'editor.write'),
      'outline edit intent exposes editor.write'
    )
    const outlineAfterEdit = await page.locator('#outline-editor').inputValue()
    assert(
      outlineAfterEdit.includes('第二章内容。男主确认寄信人身份。'),
      'outline edit intent directly writes the editor'
    )

    await sendAndWait('我们讨论一下第二章的伏笔', '这是讨论回复，不需要修改编辑器。')
    const discussRequest = requests[requests.length - 1]
    assert(requests.length >= 2, 'outline discuss request reaches the mock provider')
    const discussTools = discussRequest.body?.tools || []
    assert(discussTools.length > 0, 'outline discuss request still receives read tools')
    assert(
      discussTools.some(tool => tool?.function?.name === 'outline.read_range')
        && discussTools.some(tool => tool?.function?.name === 'editor.global_search'),
      'outline discuss tools include outline and editor read tools'
    )
    assert(
      discussTools.every(tool => tool?.function?.name !== 'editor.write'),
      'outline discuss request has no editor.write'
    )

    const finalOutline = await page.locator('#outline-editor').inputValue()
    assert(finalOutline.includes('第二章内容。男主确认寄信人身份。'), 'outline discussion leaves the direct-write result unchanged')

    await page.evaluate(async saved => {
      await window.electronAPI.storageWrite('wa_providers', saved.providers)
      await window.electronAPI.storageWrite('wa_lastProjectId', saved.lastProjectId)
      await window.electronAPI.storageWrite('wa_project_default', saved.defaultProject)
      await window.electronAPI.storageWrite('wa_project_codex-dialogue-stage2-e2e', saved.e2eProject)
      await window.electronAPI.storageWrite('wa_pipeline_step_config', saved.pipelineConfig)
      await window.electronAPI.storageWrite('wa_skills', saved.skills)
    }, original)
  } catch (error) {
    try {
      if (page) {
        console.log('[DEBUG] outline input count:', await page.locator('#ow-chat-input').count())
        console.log('[DEBUG] outline input value:', await page.locator('#ow-chat-input').inputValue().catch(() => '(none)'))
        console.log('[DEBUG] outline send count:', await page.locator('#btn-ow-send').count())
        console.log('[DEBUG] outline send disabled:', await page.locator('#btn-ow-send').isDisabled().catch(() => '(unknown)'))
        console.log('[DEBUG] body text:', (await page.locator('body').textContent()).slice(0, 1000))
      }
    } catch {}
    try {
      if (page && original) {
        await page.evaluate(async saved => {
          await window.electronAPI.storageWrite('wa_providers', saved.providers)
          await window.electronAPI.storageWrite('wa_lastProjectId', saved.lastProjectId)
          await window.electronAPI.storageWrite('wa_project_default', saved.defaultProject)
          await window.electronAPI.storageWrite('wa_project_codex-dialogue-stage2-e2e', saved.e2eProject)
          await window.electronAPI.storageWrite('wa_pipeline_step_config', saved.pipelineConfig)
          await window.electronAPI.storageWrite('wa_skills', saved.skills)
        }, original)
      }
    } catch {}
    throw error
  } finally {
    try { await browser.close() } catch {}
  }
}

await verifyOutlineWorkspace()

server.close()

console.log('[DONE] API dialogue foundation stage 2 outline-workspace verification completed')
