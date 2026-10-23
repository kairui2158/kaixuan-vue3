import http from 'node:http'
import { chromium } from 'playwright'

const CDP_URL = 'http://127.0.0.1:9227'
const MOCK_PORT = 59764
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const MOCK_PROVIDER_ID = 'codex-dialogue-foundation-provider'
const PROJECT_ID = 'codex-dialogue-foundation-e2e'

const requests = []
let mode = 'main-edit'
let sawPipelineSettingsPrompt = false

function assert(condition, message) {
  if (!condition) throw new Error(message)
  console.log('[PASS] ' + message)
}

function textCompletion(content) {
  return {
    choices: [{ finish_reason: 'stop', message: { role: 'assistant', content } }]
  }
}

function pipelineCompletion(messages) {
  const text = (messages || []).map(message => message.content || '').join('\n')
  if (text.includes('提取并生成设定项')) {
    sawPipelineSettingsPrompt = true
    return textCompletion(JSON.stringify([
      { name: '灯塔与旧信', category: '设定类', attrsText: '男主确认寄信人身份的核心道具。' }
    ]))
  }
  if (text.includes('请生成') && text.includes('卷的卷纲') && text.includes('allocatedWords')) {
    return textCompletion(JSON.stringify([
      { name: '风暴起点', outline: '北方风暴中男主发现旧信并确认寄信人身份。', summary: '风暴与旧信推动主线。', allocatedWords: 20000 }
    ]))
  }
  if (text.includes('[本卷总章数]')) {
    const chapters = []
    for (let chapter = 1; chapter <= 2; chapter++) {
      chapters.push({
        title: `第${chapter}章 灯塔${chapter}`,
        plot: `男主确认寄信人身份，完成第${chapter}段行程。`
      })
    }
    return textCompletion(JSON.stringify(chapters))
  }
  if (text.includes('[当前章节剧情点]')) {
    return textCompletion('夜风压过山脊，男主确认了寄信人身份。')
  }
  return textCompletion('这是统一底座验证回复，不需要修改编辑器。')
}

function toolCallCompletion() {
  return {
    choices: [{
      finish_reason: 'tool_calls',
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [{
          id: 'foundation-edit-call-1',
          type: 'function',
          function: {
            name: 'editor.write',
            arguments: JSON.stringify({
              commands: [{
                operation: 'replace_match',
                target: '第二章内容。男主在灯塔下发现旧信。',
                content: '第二章内容。男主确认寄信人身份。'
              }],
              reason: '统一底座真实 UI 验证',
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
    const isPipelineSettings = (body?.messages || []).some(message => (message.content || '').includes('提取并生成设定项'))
    requests.push({ mode, url: request.url, body })

    const requestIndexForMode = requests.filter(item => item.mode === mode).length
    const isStream = body?.stream === true
    const payload = mode.endsWith('-edit') && requestIndexForMode === 1
      ? toolCallCompletion()
      : isPipelineSettings
        ? pipelineCompletion(body?.messages)
        : textCompletion('这是统一底座验证回复，不需要修改编辑器。')

    console.log(`[MOCK] mode=${mode} request=${requests.length}: ${request.url}`)
    if (isStream) {
      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      })
      const streamPayload = {
        id: 'codex-dialogue-foundation-stream',
        object: 'chat.completion.chunk',
        choices: [{
          index: 0,
          finish_reason: payload.choices?.[0]?.finish_reason,
          delta: {
            role: 'assistant',
            content: payload.choices?.[0]?.message?.content || ''
          }
        }]
      }
      response.write(`data: ${JSON.stringify(streamPayload)}\n\n`)
      response.write('data: [DONE]\n\n')
      response.end()
      return
    }
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify(payload))
  })
})

await new Promise(resolve => server.listen(MOCK_PORT, '127.0.0.1', resolve))

const browser = await chromium.connectOverCDP(CDP_URL)
let page
let original

function mockProviderConfig() {
  return {
    providers: [{
      id: MOCK_PROVIDER_ID,
      name: 'Codex Dialogue Foundation Provider',
      baseUrl: MOCK_BASE_URL,
      apiKey: 'codex-dialogue-foundation-key',
      models: ['codex-dialogue-foundation-model'],
      selectedModel: 'codex-dialogue-foundation-model',
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
}

async function backup() {
  return await page.evaluate(async projectId => ({
    providers: await window.electronAPI.storageRead('wa_providers'),
    lastProjectId: await window.electronAPI.storageRead('wa_lastProjectId'),
    defaultProject: await window.electronAPI.storageRead('wa_project_default'),
    e2eProject: await window.electronAPI.storageRead(`wa_project_${projectId}`),
    pipelineConfig: await window.electronAPI.storageRead('wa_pipeline_step_config'),
    skills: await window.electronAPI.storageRead('wa_skills'),
    homeChat: await window.electronAPI.storageRead(`wa_chat_${projectId}`),
    context: await window.electronAPI.storageRead(`wa_ctx_${projectId}`)
  }), PROJECT_ID)
}

async function restore(saved) {
  await page.evaluate(async ({ saved, projectId }) => {
    await window.electronAPI.storageWrite('wa_providers', saved.providers)
    await window.electronAPI.storageWrite('wa_lastProjectId', saved.lastProjectId)
    await window.electronAPI.storageWrite('wa_project_default', saved.defaultProject)
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, saved.e2eProject)
    await window.electronAPI.storageWrite('wa_pipeline_step_config', saved.pipelineConfig)
    await window.electronAPI.storageWrite('wa_skills', saved.skills)
    await window.electronAPI.storageWrite(`wa_chat_${projectId}`, saved.homeChat)
    await window.electronAPI.storageWrite(`wa_ctx_${projectId}`, saved.context)
  }, { saved, PROJECT_ID })
}

async function resetApp() {
  await page.evaluate(async ({ projectId, config }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    const project = await window.electronAPI.storageRead(`wa_project_${projectId}`)
      || { projectName: 'Codex Dialogue Foundation E2E', editorTabs: [] }
    project.chat = []
    project.outlineChat = []
    project.editorTabs = []
    project.outlineText = '第一卷 风暴起点\n第二章内容。男主在灯塔下发现旧信。'
    project.bookWordCount = 0
    project.outlineLocked = false
    project.volumesConfirmed = false
    project.chaptersConfirmed = false
    project.settingsGenerated = false
    project.settings = []
    project.volumes = []
    project.chapters = {}
    project.settingBindings = {}
    project.settingsCollection = { categories: [], items: {} }
    project.memories = {}
    project.pipelineConfig = { volumeCount: 1, volumeWords: 20000, chapterWords: 2000 }
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, project)
    const pipelineConfig = await window.electronAPI.storageRead('wa_pipeline_step_config') || {}
    pipelineConfig.skills = pipelineConfig.skills || {}
    pipelineConfig.modes = pipelineConfig.modes || {}
    pipelineConfig.skills[0] = []
    pipelineConfig.modes[0] = 'chain'
    await window.electronAPI.storageWrite('wa_pipeline_step_config', pipelineConfig)
    await window.electronAPI.storageWrite('wa_skills', { skills: [] })
    await window.electronAPI.storageWrite('wa_providers', config)
    await window.electronAPI.storageWrite('wa_deAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
  }, { projectId: PROJECT_ID, config: mockProviderConfig() })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20000 })
  await page.waitForTimeout(1000)
}

function requestIn(modeName) {
  const found = requests.filter(item => item.mode === modeName)
  if (!found.length) {
    console.log(`[DIAG] request modes: ${requests.map(item => item.mode).join(', ')}`)
    throw new Error(`No request captured for mode ${modeName}`)
  }
  return found[0]
}

async function waitForRequest(modeName, timeout = 15000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeout) {
    const found = requests.filter(item => item.mode === modeName)
    if (found.length) return found[0]
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  console.log(`[DIAG] request modes: ${requests.map(item => item.mode).join(', ')}`)
  throw new Error(`No request captured for mode ${modeName}`)
}

try {
  const context = browser.contexts()[0]
  if (!context) throw new Error('Electron context not found')
  page = context.pages().find(item => !item.url().startsWith('devtools://')) || context.pages()[0]
  if (!page) throw new Error('Electron page not found')
  page.on('pageerror', error => console.log(`[PAGE ERROR] ${error.message}`))
  page.on('console', message => {
    if (message.type() === 'error') console.log(`[PAGE CONSOLE ERROR] ${message.text()}`)
  })

  original = await backup()
  await resetApp()

  // 1. Main workspace: edit intent directly writes through the native tool.
  mode = 'main-edit'
  await page.evaluate(() => {
    document.querySelector('#btn-close-pl')?.click()
    document.querySelector('#btn-close-outline-workspace')?.click()
  })
  await page.evaluate(() => {
    const store = window.__pinia?.state?.value?.editor
    if (!store?.tabs?.length) {
      store.tabs = [{
        id: 'foundation-main-tab',
        title: '第二章 灯塔',
        mode: 'ch-body',
        chapterId: 'foundation-chapter',
        content: '第二章内容。男主在灯塔下发现旧信。'
      }]
      store.activeTabId = store.tabs[0].id
    }
    const activeTab = store.tabs.find(tab => tab.id === store.activeTabId) || store.tabs[0]
    store.activeTabId = activeTab.id
    activeTab.content = '第二章内容。男主在灯塔下发现旧信。'
  })
  await page.waitForTimeout(500)
  await page.locator('#user-input').fill('请把第二章旧信内容修改为确认寄信人身份')
  await page.locator('#btn-send').click()
  await page.waitForFunction(() => (document.body.textContent || '').includes('已写入编辑器：1 条'), null, { timeout: 30000 })
  await page.waitForTimeout(600)
  const mainEditRequest = await waitForRequest('main-edit')
  assert((mainEditRequest.body?.tools || []).some(tool => tool?.function?.name === 'editor.write'), 'main edit request exposes editor.write')
  assert(
    (mainEditRequest.body?.messages || []).some(message => (message.content || '').includes('第二章内容。男主在灯塔下发现旧信。')),
    'main edit request contains editor content as primary context'
  )
  const editorAfterWrite = await page.evaluate(() => {
    const editor = window.__pinia?.state?.value?.editor
    const activeTab = editor?.tabs?.find(tab => tab.id === editor?.activeTabId)
    return activeTab?.content || ''
  })
  assert(editorAfterWrite.includes('第二章内容。男主确认寄信人身份。'), 'main edit directly writes the editor')

  // 2. Main workspace: discussion stays read-only.
  mode = 'main-discuss'
  const closeDiff = page.locator('#btn-close-diff')
  if (await closeDiff.count() && await closeDiff.isVisible()) {
    await closeDiff.click()
  } else {
    await page.keyboard.press('Escape')
  }
  await page.waitForTimeout(600)
  await page.locator('#user-input').fill('我们讨论一下第二章的伏笔')
  await page.locator('#btn-send').click()
  await page.waitForFunction(() => (document.body.textContent || '').includes('这是统一底座验证回复'), null, { timeout: 30000 })
  const mainDiscussRequest = await waitForRequest('main-discuss')
  assert((mainDiscussRequest.body?.tools || []).length > 0, 'main discuss request still receives read tools')
  assert(
    (mainDiscussRequest.body?.tools || []).every(tool => tool?.function?.name !== 'editor.write'),
    'main discuss request has no editor.write'
  )

  // 3. Outline workspace: discuss is read-only; edit intent directly writes.
  mode = 'outline-edit'
  await page.evaluate(() => {
    document.querySelector('#btn-close-pl')?.click()
    document.querySelector('#btn-close-outline-workspace')?.click()
  })
  await page.waitForTimeout(500)
  await page.locator('#btn-outline-workspace').click()
  await page.waitForSelector('#outline-editor', { timeout: 20000 })
  await page.locator('#btn-ai-co-create').click()
  await page.waitForSelector('#ow-chat-input', { timeout: 20000 })
  await page.locator('#outline-editor').fill('第一卷 风暴起点\n第二章内容。男主在灯塔下发现旧信。')
  await page.locator('#ow-chat-input').fill('请把第二章旧信内容修改为确认寄信人身份')
  await page.locator('#btn-ow-send').click()
  await page.waitForFunction(() => (document.body.textContent || '').includes('[OK] API 已直接写入大纲'), null, { timeout: 30000 })
  const outlineEditRequest = await waitForRequest('outline-edit')
  assert(
    (outlineEditRequest.body?.tools || []).some(tool => tool?.function?.name === 'editor.write'),
    'outline edit request exposes editor.write'
  )
  assert(
    (await page.locator('#outline-editor').inputValue()).includes('第二章内容。男主确认寄信人身份。'),
    'outline edit directly writes the editor'
  )

  mode = 'outline-discuss'
  await page.locator('#ow-chat-input').fill('我们讨论一下第二章的伏笔')
  await page.locator('#btn-ow-send').click()
  await page.waitForFunction(() => (document.body.textContent || '').includes('这是统一底座验证回复'), null, { timeout: 30000 })
  const outlineDiscussRequest = await waitForRequest('outline-discuss')
  assert(
    (outlineDiscussRequest.body?.tools || []).some(tool => tool?.function?.name === 'outline.read_range')
      && (outlineDiscussRequest.body?.tools || []).some(tool => tool?.function?.name === 'editor.global_search'),
    'outline discuss request includes read tools'
  )
  assert(
    (outlineDiscussRequest.body?.tools || []).every(tool => tool?.function?.name !== 'editor.write'),
    'outline discuss request has no editor.write'
  )

  // 4. Pipeline: five-layer smoke uses the same provider path and never injects interactive dialogue tools.
  mode = 'pipeline'
  await page.evaluate(() => {
    document.querySelector('#btn-close-outline-workspace')?.click()
  })
  await page.waitForTimeout(500)
  await page.locator('#btn-pipeline').click()
  await page.waitForSelector('#pipeline-panel', { timeout: 20000 })
  const outlineInput = page.locator('#pl-outline')
  await outlineInput.fill('第一卷 风暴起点\n第二章内容。男主在灯塔下发现旧信。')
  await page.locator('#pl-book-word-count').fill('2')
  const pipelineRequestCountBefore = requests.filter(item => item.mode === 'pipeline').length
  await page.evaluate(() => {
    const store = window.__pinia?.state?.value?.pipeline
    if (store) {
      store.currentStep = 0
      store.isGenerating = false
    }
  })
  await page.locator('#btn-pl-confirm-outline').click()
  await page.waitForFunction(() => document.querySelector('#pl-outline')?.readOnly === true, null, { timeout: 30000 })
  await page.waitForSelector('#btn-pl-gen-settings', { timeout: 10000 })
  await page.waitForTimeout(500)
  await page.locator('#btn-pl-gen-settings').click()
  // Wait for the generation cycle to finish (isGenerating goes true then false).
  await page.waitForFunction(() => window.__pinia?.state?.value?.pipeline?.isGenerating === true, null, { timeout: 10000 }).catch(() => {})
  await page.waitForFunction(() => window.__pinia?.state?.value?.pipeline?.isGenerating === false, null, { timeout: 30000 })
  await page.waitForTimeout(2000)
  const settingsResult = await page.evaluate(() => {
    const project = window.__pinia?.state?.value?.project
    const sc = project?.settingsCollection || { categories: [], items: {} }
    let totalSettings = 0
    for (const cat of sc.categories) {
      totalSettings += (sc.items[cat] || []).length
    }
    return {
      totalSettings,
      settingsGenerated: project?.settingsGenerated,
      pipelineRunStatus: window.__pinia?.state?.value?.pipeline?.activeSettingsRun?.status || null,
      bodyText: (document.body.textContent || '').slice(-1000)
    }
  })
  assert(
    settingsResult.totalSettings > 0,
    `pipeline settings generation completes with expected result (settings=${settingsResult.totalSettings}, status=${settingsResult.pipelineRunStatus})`
  )
  await page.waitForTimeout(600)
  const pipelineRequests = requests.filter(item => item.mode === 'pipeline')
  assert(pipelineRequests.length > pipelineRequestCountBefore, 'pipeline generation reaches the provider')
  assert(
    pipelineRequests.every(request => (request.body?.tools || []).every(tool =>
      tool?.function?.name !== 'editor.write'
      && tool?.function?.name !== 'editor.get_state'
      && tool?.function?.name !== 'outline.read_range'
    )),
    'pipeline requests contain no interactive dialogue tools'
  )
  assert(
    pipelineRequests.some(request => (request.body?.messages || []).some(message => (message.content || '').includes('风暴起点'))),
    'pipeline request keeps upstream outline injection'
  )

  await restore(original)
  console.log('[DONE] API dialogue foundation real UI verification completed')
} catch (error) {
  try {
    if (page && original) await restore(original)
  } catch {}
  throw error
} finally {
  try { await browser.close() } catch {}
  server.close()
}
