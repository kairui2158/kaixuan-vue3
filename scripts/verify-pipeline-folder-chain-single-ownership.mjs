import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9235
const PROFILE = path.join(ROOT, '_data', 'pipeline-folder-chain-ownership-e2e-profile')
const SKILL_ROOT = path.join(PROFILE, 'skills')
const SKILL_TWO_DIR = path.join(SKILL_ROOT, 'pipeline-folder-s2')
const MOCK_PORT = 59881
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const PROVIDER_ID = 'pipeline-folder-chain-ownership-e2e-provider'
const MODEL = 'pipeline-folder-chain-ownership-e2e-model'
const STEP_ONE_MARKER = '流水线文件夹链路第一步唯一输出锚点'
const STEP_ONE_OUTPUT = JSON.stringify([{ marker: STEP_ONE_MARKER.repeat(80) }])
const OUTLINE_TEXT = [
  '第一卷 风暴起点',
  '北方风暴逼近，男主在夜路中发现旧信。'
].join('\n')

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
  console.log('[PASS] ' + message)
}

function writeSkillFolder() {
  fs.mkdirSync(SKILL_ROOT, { recursive: true })
  fs.mkdirSync(SKILL_TWO_DIR, { recursive: true })
  fs.writeFileSync(path.join(SKILL_TWO_DIR, 'SKILL.md'), [
    '---',
    'id: pipeline-folder-s2',
    'name: 流水线文件夹链路二',
    'description: 验证流水线 folder SKILL 的单一交付通道',
    '---',
    '',
    '你是流水线文件夹链路测试技能二，只输出当前步骤定稿产物。'
  ].join('\n'), 'utf8')
  fs.writeFileSync(path.join(SKILL_TWO_DIR, 'template.md'), '你必须输出一个 JSON 数组。', 'utf8')
}

const providerRequests = []
const server = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    let body = null
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    providerRequests.push({ url: request.url, body })
    let text = JSON.stringify({ styleTags: '冷峻,紧凑', pacingParams: '先慢后快' })
    if (providerRequests.length > 1) {
      if (providerRequests.length === 2) {
        text = STEP_ONE_OUTPUT
      } else {
        text = JSON.stringify([{
          name: '风暴起点',
          outline: '北方风暴中男主发现旧信并南下。',
          summary: '旧信推动第一卷主线。',
          allocatedWords: 20000
        }])
      }
    }
    if (body?.stream === false) {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({
        id: 'chatcmpl-pipeline-folder-chain-ownership',
        object: 'chat.completion',
        choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }
      }))
      return
    }
    const events = [
      { choices: [{ delta: { content: text }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
    ]
    const stream = events.map(event => `data: ${JSON.stringify(event)}`).join('\n\n') + '\n\ndata: [DONE]\n\n'
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
    })
    response.end(stream)
  })
})

let electronProcess = null

function startElectron() {
  electronProcess = spawn(
    ELECTRON_EXE,
    ['.', `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', `--user-data-dir=${PROFILE}`],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } },
  )
  electronProcess.stdout.on('data', data => {
    const text = String(data)
    if (/Uncaught|unhandledRejection/i.test(text)) console.log('[ELECTRON:stdout] ' + text.slice(0, 400))
  })
  electronProcess.stderr.on('data', data => {
    const text = String(data)
    if (/Uncaught|unhandledRejection|EADDRINUSE/i.test(text)) console.log('[ELECTRON:stderr] ' + text.slice(0, 400))
  })
}

async function waitForCdp(timeout = 30000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)
      if (response.ok) return true
    } catch {}
    await sleep(500)
  }
  return false
}

function stopElectron() {
  if (!electronProcess?.pid) return
  try {
    execFileSync('taskkill', ['/PID', String(electronProcess.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {}
  electronProcess = null
}

function removeProfile() {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.rmSync(PROFILE, { recursive: true, force: true })
      return
    } catch (error) {
      if (attempt === 4) throw error
      sleep(1000)
    }
  }
}

function requestText(request) {
  return (request?.body?.messages || [])
    .map(message => String(message.content || ''))
    .join('\n')
}

async function main() {
  await new Promise(resolve => server.listen(MOCK_PORT, '127.0.0.1', resolve))
  fs.rmSync(PROFILE, { recursive: true, force: true })
  writeSkillFolder()
  startElectron()
  try {
    assert(await waitForCdp(), 'source Electron CDP reachable')
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    let page = null
    for (let index = 0; index < 24; index++) {
      const pages = browser.contexts()[0]?.pages() || []
      if (pages.length) {
        page = pages[0]
        break
      }
      await sleep(500)
    }
    assert(page, 'renderer page reachable')
    page.on('pageerror', error => console.log('[PAGE ERROR] ' + error.message))
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1500)
    await page.evaluate(() => {
      document.querySelector('.project-modal-content .btn-close')?.click()
    })
    await sleep(500)

    await page.evaluate(async ({ providerConfig, folderSkill, folderPath }) => {
      await window.electronAPI.storageWrite('wa_lastProjectId', 'default')
      await window.electronAPI.storageWrite('wa_providers', providerConfig)
      await window.electronAPI.storageWrite('wa_skills', {
        skills: [
          {
            id: 'pipeline-folder-s1',
            name: '流水线文件夹链路一',
            template: '你是流水线文件夹链路测试技能一，只输出当前步骤定稿产物。',
            format: 'text',
            injectMode: 'system_prefix',
            boundTo: [],
            intents: ['generate'],
          },
          folderSkill,
        ],
        pipelineSkills: [],
      })
      await window.electronAPI.storageWrite('wa_pipeline_step_config', {
        agents: { 0: '', 1: '', 2: '', 3: '', 4: '' },
        skills: { 0: [], 1: [], 2: ['pipeline-folder-s1', folderSkill.id], 3: [], 4: [] },
        modes: { 0: 'compose', 1: 'compose', 2: 'chain', 3: 'chain', 4: 'chain' },
        skillAgents: {},
      })
      await window.electronAPI.storageWrite('wa_deAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
      await window.electronAPI.storageRemove('wa_pipeline_breakpoint')
    }, {
      providerConfig: {
        providers: [{
          id: PROVIDER_ID,
          name: 'Pipeline Folder Chain Ownership Mock',
          baseUrl: MOCK_BASE_URL,
          apiKey: 'pipeline-folder-key',
          models: [MODEL],
          selectedModel: MODEL,
          temperature: 0.1,
          maxTokens: 4096,
          purpose: ['generate'],
          providerType: 'openai-compatible',
          streamMode: true,
        }],
        generateProvider: PROVIDER_ID,
      },
      folderPath: SKILL_TWO_DIR,
      folderSkill: {
        id: 'folder:pipeline-folder-s2',
        sourceId: 'pipeline-folder-s2',
        name: '流水线文件夹链路二',
        format: 'folder',
        folderPath: SKILL_TWO_DIR,
        template: '你必须输出一个 JSON 数组。',
        category: 'folder',
        description: '验证流水线 folder SKILL 的单一交付通道',
        resourceSummary: { resourceCount: 0, warningCount: 0 },
        executionMode: 'chain',
        outputFormat: 'text',
        validationRules: [],
        splitSize: 1000,
        injectMode: 'system_prefix',
        bindTarget: 'project',
        linkedSkillIds: [],
        customVars: {},
        inputSchema: '',
        outputSchema: '',
        retryPolicy: '',
        intents: ['generate'],
      },
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1500)
    await page.evaluate(() => {
      document.querySelector('.project-modal-content .btn-close')?.click()
    })
    await sleep(500)

    await page.click('#btn-pipeline')
    await page.waitForSelector('#pipeline-panel', { timeout: 10000 })
    await page.evaluate(() => {
      const project = window.__pinia?._s?.get('project')
      project?.unlockOutline?.()
    })
    await sleep(300)
    await page.locator('#pl-outline').fill(OUTLINE_TEXT)
    await page.locator('#pl-book-word-count').fill('2')
    await page.locator('#btn-pl-confirm-outline').click()
    await page.waitForTimeout(500)

    await page.locator('#pl-steps .pl-step').nth(2).click()
    await page.waitForSelector('#pl-step-3-content', { state: 'visible' })
    await page.locator('#pl-volume-count').fill('1')
    await page.locator('#pl-volume-count').dispatchEvent('change')
    await page.waitForTimeout(500)
    await page.locator('#btn-pl-gen-volumes').click()

    await page.waitForFunction(() => {
      const button = document.querySelector('#btn-pl-gen-volumes')
      const row = document.querySelector('#pl-volume-select-0')
      return Boolean(
        button && !button.disabled && row && (row.textContent || '').includes('风暴起点')
      )
    }, null, { timeout: 60000, polling: 300 })

    assert(providerRequests.length === 3, `pipeline made ${providerRequests.length} provider calls (1 analysis + 1 text skill + 1 folder skill)`)
    const firstText = requestText(providerRequests[1])
    const folderText = requestText(providerRequests[2])
    assert(!firstText.includes(STEP_ONE_OUTPUT), 'text first request does not preload a previous output')
    assert(folderText.includes(STEP_ONE_MARKER), 'folder request receives the previous text-skill output')
    const occurrenceCount = folderText.split(STEP_ONE_OUTPUT).length - 1
    assert(occurrenceCount === 1, `folder request contains previous output ${occurrenceCount} time(s), expected 1`)
    assert(folderText.includes('你必须输出一个 JSON 数组。'), 'folder request executes its own folder template')
    assert(!folderText.includes('base-template-applied'), 'folder request does not carry pipeline base-template diagnostics')

    console.log('\n===== PIPELINE FOLDER CHAIN SINGLE OWNERSHIP E2E PASSED =====')
  } finally {
    stopElectron()
    server.close()
    await sleep(1000)
    removeProfile()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
