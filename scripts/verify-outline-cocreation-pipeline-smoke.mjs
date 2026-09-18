import http from 'node:http'
import { chromium } from 'playwright'

const CDP_URL = 'http://127.0.0.1:9227'
const MOCK_PORT = 59737
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const MOCK_PROVIDER_ID = 'codex-outline-pipeline-smock'
const TEST_PROJECT_ID = 'codex-outline-pipeline-smoke'
const OUTLINE_TEXT = [
  '第一卷 风暴起点',
  '北方风暴逼近，男主在夜路中发现旧信。',
  '第1章 夜行',
  '男主穿过风暴，遇到持灯人。',
  '第2章 灯塔',
  '男主在灯塔下解读旧信，确认南下的必要。'
].join('\n')

const requests = []
const server = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    let body = null
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    const text = (body?.messages || []).map(message => message.content || '').join('\n')
    let payload
    // Volume requests must be detected before the generic styleTags branch:
    // user folder skills can otherwise hijack this step and return style JSON.
    if (text.includes('请生成') && text.includes('卷的卷纲') && text.includes('allocatedWords')) {
      payload = {
        choices: [{
          finish_reason: 'stop',
          message: { role: 'assistant', content: JSON.stringify([{ name: '风暴起点', outline: '北方风暴中男主发现旧信并南下。', summary: '风暴与旧信推动主线。', allocatedWords: 20000 }]) }
        }]
      }
    } else if (text.includes('返回JSON对象：{styleTags')) {
      payload = {
        choices: [{
          finish_reason: 'stop',
          message: { role: 'assistant', content: '{"styleTags":"冷峻,紧凑","pacingParams":"先慢后快"}' }
        }]
      }
    } else if (text.includes('[已确认大纲]')) {
      payload = {
        choices: [{
          finish_reason: 'stop',
          message: { role: 'assistant', content: JSON.stringify([{ name: '持灯人', category: '设定类', attrsText: '旧信的守护者' }]) }
        }]
      }
    } else if (text.includes('[本卷总章数]')) {
      const startMatch = text.match(/第(\d+)章到第(\d+)章的章节列表/)
      const start = startMatch ? Number(startMatch[1]) : 1
      const end = startMatch ? Number(startMatch[2]) : start + 4
      const chapters = []
      for (let chapter = start; chapter <= end; chapter++) {
        chapters.push({
          title: `第${chapter}章 夜行${chapter}`,
          plot: `男主穿过风暴，遇到持灯人，完成第${chapter}段行程。`
        })
      }
      payload = {
        choices: [{
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: JSON.stringify(chapters)
          }
        }]
      }
    } else if (text.includes('[当前章节剧情点]')) {
      payload = {
        choices: [{
          finish_reason: 'stop',
          message: { role: 'assistant', content: '夜风压过山脊，男主在灯塔下读到旧信的第一行。' }
        }]
      }
    } else {
      payload = {
        choices: [{
          finish_reason: 'stop',
          message: { role: 'assistant', content: '{"styleTags":"冷峻,紧凑","pacingParams":"先慢后快"}' }
        }]
      }
    }

    requests.push({ url: request.url, body, text })
    if (body?.stream === true) {
      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      })
      const streamPayload = {
        id: 'codex-outline-pipeline-smoke',
        object: 'chat.completion.chunk',
        choices: [{
          index: 0,
          finish_reason: payload.choices[0]?.finish_reason,
          delta: {
            role: 'assistant',
            content: payload.choices[0]?.message?.content || ''
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

function pass(message) { console.log('[PASS] ' + message) }
function assert(condition, message) {
  if (!condition) throw new Error(message)
  pass(message)
}

async function waitForCondition(page, predicate, timeout = 30000, interval = 250) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await page.evaluate(predicate)) return
    await page.waitForTimeout(interval)
  }
  throw new Error(`Condition timed out after ${timeout}ms`)
}

const browser = await chromium.connectOverCDP(CDP_URL)
let original = null
try {
  const context = browser.contexts()[0]
  if (!context) throw new Error('Electron context not found')
  const page = context.pages().find(item => !item.url().startsWith('devtools://')) || context.pages()[0]
  if (!page) throw new Error('Electron page not found')

  original = await page.evaluate(async () => ({
    providers: await window.electronAPI.storageRead('wa_providers'),
    lastProjectId: await window.electronAPI.storageRead('wa_lastProjectId'),
    pipelineBreakpoint: await window.electronAPI.storageRead('wa_pipeline_breakpoint'),
    deAiConfig: await window.electronAPI.storageRead('wa_deAiConfig'),
    pipelineStepConfig: await window.electronAPI.storageRead('wa_pipeline_step_config')
  }))

  const projectData = {
    schemaVersion: 3,
    projectName: 'Outline Pipeline Smoke',
    outlineText: OUTLINE_TEXT,
    outlineLocked: false,
    outlineLockedText: '',
    bookWordCount: 0,
    volumesConfirmed: false,
    pipelineConfig: { volumeCount: 1, volumeWords: 20000, chapterWords: 2000 },
    chaptersConfirmed: false,
    settingsGenerated: false,
    settings: [],
    volumes: [],
    chapters: {},
    settingBindings: {},
    settingsCollection: { categories: [], items: {} },
    memories: {},
    memoryBlacklist: [],
    aiNaming: null,
    outlineChat: []
  }
  const mockProviderConfig = {
    providers: [{
      id: MOCK_PROVIDER_ID,
      name: 'Outline Pipeline Smoke Provider',
      baseUrl: MOCK_BASE_URL,
      apiKey: 'codex-smoke-key',
      models: ['codex-smoke-model'],
      selectedModel: 'codex-smoke-model',
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

  await page.evaluate(async ({ project, config }) => {
    await window.electronAPI.storageWrite('wa_project_' + 'codex-outline-pipeline-smoke', project)
    await window.electronAPI.storageWrite('wa_lastProjectId', 'codex-outline-pipeline-smoke')
    await window.electronAPI.storageWrite('wa_providers', config)
    await window.electronAPI.storageRemove('wa_pipeline_breakpoint')
    await window.electronAPI.storageWrite('wa_deAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
    await window.electronAPI.storageWrite('wa_pipeline_step_config', {
      agents: { 0: '', 1: '', 2: '', 3: '', 4: '' },
      skills: { 0: [], 1: [], 2: [], 3: [], 4: [] },
      modes: { 0: 'compose', 1: 'compose', 2: 'chain', 3: 'chain', 4: 'chain' },
      skillAgents: {}
    })
  }, { project: projectData, config: mockProviderConfig })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20000 })
  await page.waitForTimeout(600)

  await page.evaluate(() => {
    const outlineClose = document.querySelector('#btn-close-outline-workspace')
    if (outlineClose) outlineClose.click()
    const pipelineClose = document.querySelector('#btn-close-pl')
    if (pipelineClose) pipelineClose.click()
  })
  await page.locator('#btn-pipeline').click()
  await page.waitForSelector('#pipeline-panel')

  const outlineInput = page.locator('#pl-outline')
  await outlineInput.fill(OUTLINE_TEXT)
  await page.locator('#pl-book-word-count').fill('2')
  await page.locator('#btn-pl-confirm-outline').click()
  await waitForCondition(page, () => document.querySelector('#pl-outline')?.readOnly === true, 10000)
  await page.waitForTimeout(500)

  await page.locator('#pl-steps .pl-step').nth(1).click()
  await page.waitForSelector('#pl-step-2-content', { state: 'visible' })
  await page.locator('#btn-pl-gen-settings').click()
  await waitForCondition(page, () => Array.from(document.querySelectorAll('#pl-bound-settings-list .pl-setting-card')).length > 0, 30000)
  assert(requests.some(item => item.text.includes('[已确认大纲]')), 'settings request receives full confirmed outline')
  await page.locator('#btn-pl-confirm-settings').click()
  await page.waitForTimeout(300)
  await waitForCondition(page, () => {
    const button = document.querySelector('#btn-pl-gen-volumes')
    return Boolean(button && !button.disabled)
  }, 10000)

  await page.locator('#pl-steps .pl-step').nth(2).click()
  await page.waitForSelector('#pl-step-3-content', { state: 'visible' })
  await page.locator('#pl-volume-count').fill('1')
  await page.locator('#pl-volume-count').dispatchEvent('change')
  await page.waitForTimeout(500)
  await page.locator('#btn-pl-gen-volumes').click()
  // Placeholder volume rows exist before generation, so completion must be
  // tied to the generation lifecycle, not to row count.
  await waitForCondition(page, () => {
    const button = document.querySelector('#btn-pl-gen-volumes')
    const row = document.querySelector('#pl-volume-select-0')
    return Boolean(
      button
      && !button.disabled
      && row
      && (row.textContent || '').includes('风暴起点')
    )
  }, 30000)
  const volumeRequest = requests.find(item => item.text.includes('请生成') && item.text.includes('卷的卷纲') && item.text.includes('allocatedWords'))
  assert(Boolean(volumeRequest), 'volume request is issued through pipeline API path')
  assert((volumeRequest?.text || '').includes('第一卷 风暴起点'), 'volume request contains complete outline text')

  await page.locator('#btn-pl-edit-volume-0').click()
  await page.waitForSelector('#pl-volume-editor-0', { state: 'visible' })
  await page.locator('#pl-volume-editor-0 textarea').fill('北方风暴中男主发现旧信并南下。')
  await page.locator('#btn-pl-save-volume-0').click()
  await waitForCondition(page, () => {
    const bind = document.querySelector('#btn-pl-bind-volume-0')
    return Boolean(bind && !bind.disabled)
  }, 10000)
  await page.locator('#btn-pl-bind-volume-0').click()
  await waitForCondition(page, () => {
    const bind = document.querySelector('#btn-pl-bind-volume-0')
    return Boolean(bind && bind.textContent?.includes('解除绑定'))
  }, 10000)

  await page.locator('#pl-steps .pl-step').nth(3).click()
  await page.waitForSelector('#pl-step-4-content', { state: 'visible' })
  await page.locator('#pl-chapter-wordcount').fill('2000')
  await page.locator('#pl-chapter-wordcount').dispatchEvent('change')
  await page.locator('#btn-pl-gen-chapters').click()
  await waitForCondition(page, () => {
    const button = document.querySelector('#btn-pl-gen-chapters')
    const confirm = document.querySelector('#btn-pl-confirm-chapters')
    const tenthRow = document.querySelector('#pl-ch-row-9')
    return Boolean(button && !button.disabled && confirm && !confirm.disabled && tenthRow)
  }, 30000)
  const chapterRequest = requests.find(item => item.text.includes('[本卷总章数]'))
  assert(Boolean(chapterRequest), 'chapter request is issued through pipeline API path')
  assert((chapterRequest?.text || '').includes('风暴起点 - 北方风暴中男主发现旧信并南下。'), 'chapter request contains selected volume outline')
  assert((chapterRequest?.text || '').includes('第1章 夜行'), 'chapter request contains complete upstream outline')
  await page.locator('#btn-pl-confirm-chapters').click()
  await page.waitForTimeout(300)

  await page.locator('#pl-steps .pl-step').nth(4).click()
  await page.waitForSelector('#pl-step-5-content', { state: 'visible' })
  await page.locator('#btn-pl-gen-body').click()
  await waitForCondition(page, () => {
    const result = document.querySelector('#pl-body-result')
    const bodyText = result?.textContent || ''
    const statusTitle = document.querySelector('#status-chapter')?.textContent || ''
    const statusWords = document.querySelector('#status-words')?.textContent || ''
    const completedInEditor = statusTitle.includes('第1章 夜行1') && /^字数: [1-9]/.test(statusWords)
    return bodyText.includes('夜风压过山脊') || completedInEditor
  }, 30000)
  const bodyRequest = requests.find(item => item.text.includes('[当前章节剧情点]'))
  assert(Boolean(bodyRequest), 'body request is issued through pipeline API path')
  assert((bodyRequest?.text || '').includes('夜行'), 'body request contains chapter title')
  assert((bodyRequest?.text || '').includes('男主穿过风暴，遇到持灯人。'), 'body request contains chapter plot')
  assert((bodyRequest?.text || '').includes('风暴起点 - 北方风暴中男主发现旧信并南下。'), 'body request contains volume outline')

  assert(requests.every(item => !item.text.includes('12000') || !item.text.includes('大纲内容过长')), 'context assembly does not inject legacy truncation markers')
  assert(requests.every(item => item.url === '/v1/chat/completions'), 'all requests use OpenAI-compatible endpoint')

  await page.evaluate(async ({ saved }) => {
    await window.electronAPI.storageWrite('wa_providers', saved.providers)
    await window.electronAPI.storageWrite('wa_lastProjectId', saved.lastProjectId)
    if (saved.pipelineBreakpoint === null) {
      await window.electronAPI.storageRemove('wa_pipeline_breakpoint')
    } else {
      await window.electronAPI.storageWrite('wa_pipeline_breakpoint', saved.pipelineBreakpoint)
    }
    if (saved.deAiConfig === null) {
      await window.electronAPI.storageRemove('wa_deAiConfig')
    } else {
      await window.electronAPI.storageWrite('wa_deAiConfig', saved.deAiConfig)
    }
    if (saved.pipelineStepConfig === null) {
      await window.electronAPI.storageRemove('wa_pipeline_step_config')
    } else {
      await window.electronAPI.storageWrite('wa_pipeline_step_config', saved.pipelineStepConfig)
    }
    await window.electronAPI.storageRemove('wa_project_codex-outline-pipeline-smoke')
  }, { saved: original })

  console.log('[DONE] Pipeline smoke verification completed for outline, settings, volume, chapter, and body')
} catch (error) {
  try {
    const context = browser.contexts()[0]
    const page = context.pages().find(item => !item.url().startsWith('devtools://')) || context.pages()[0]
    console.error('[DIAG] requests=' + requests.length)
    for (const item of requests) {
      console.error('[DIAG] ' + item.url + ' stream=' + String(item.body?.stream) + ' text=' + item.text.slice(0, 500).replace(/\s+/g, ' '))
    }
    if (page) {
      const text = await page.evaluate(() => document.body.textContent || '')
      console.error('[DIAG] body=' + text.slice(-3000).replace(/\s+/g, ' '))
    }
    if (page && original) {
      await page.evaluate(async ({ saved }) => {
        await window.electronAPI.storageWrite('wa_providers', saved.providers)
        await window.electronAPI.storageWrite('wa_lastProjectId', saved.lastProjectId)
        if (saved.pipelineBreakpoint === null) {
          await window.electronAPI.storageRemove('wa_pipeline_breakpoint')
        } else {
          await window.electronAPI.storageWrite('wa_pipeline_breakpoint', saved.pipelineBreakpoint)
        }
        if (saved.deAiConfig === null) {
          await window.electronAPI.storageRemove('wa_deAiConfig')
        } else {
          await window.electronAPI.storageWrite('wa_deAiConfig', saved.deAiConfig)
        }
        if (saved.pipelineStepConfig === null) {
          await window.electronAPI.storageRemove('wa_pipeline_step_config')
        } else {
          await window.electronAPI.storageWrite('wa_pipeline_step_config', saved.pipelineStepConfig)
        }
        await window.electronAPI.storageRemove('wa_project_codex-outline-pipeline-smoke')
      }, { saved: original })
    }
  } catch {}
  throw error
} finally {
  try { await browser.close() } catch {}
  server.close()
}
