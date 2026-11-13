import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9238
const PROFILE = path.join(ROOT, '_data', 'chain-handoff-execution-v2-profile')
const SKILL_ROOT = path.join(PROFILE, 'skills')
const S2_FOLDER = path.join(SKILL_ROOT, 'chain-handoff-s2')
const S3_FOLDER = path.join(SKILL_ROOT, 'chain-handoff-s3')
const S4_FOLDER = path.join(SKILL_ROOT, 'chain-handoff-s4')
const MOCK_PORT = 59886
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const PROVIDER_ID = 'chain-handoff-execution-v2-provider'
const MODEL = 'chain-handoff-execution-v2-model'
const OUTLINE_TEXT = '第一卷 风暴起点\n男主在夜路中发现旧信。'

const S1_OUTPUT = JSON.stringify({
  facts: '第一卷共 9 章',
  constraints: '不得新增主角',
  unused: '这个字段不应进入 S3'
})
const S2_OUTPUT = [
  '## facts',
  '第一卷共 9 章',
  '',
  '## constraints',
  '不得新增主角',
  '',
  '## unused',
  '这个字段不应进入 S3',
].join('\n')
const S3_INVALID_OUTPUT = '这不是合法 JSON。'
const S3_OUTPUT = JSON.stringify([{ name: '风暴终点', outline: '旧信真相揭开。', summary: '主线收束。', allocatedWords: 20000 }])
const TEXT_STRUCTURED_OUTPUT = JSON.stringify({
  facts: '第一卷共 9 章',
  constraints: '不得新增主角',
  unused: 'text 变量通道不应收到这个字段'
})
const TEXT_FINAL_OUTPUT = JSON.stringify([{ name: '文本链终点', outline: '变量通道闭环。', summary: '文本链完成。', allocatedWords: 20000 }])

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
  console.log('[PASS] ' + message)
}

function writeSkillFolder(dir, id, name, template, meta) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), [
    '---',
    `id: ${id}`,
    `name: ${name}`,
    'description: chain handoff execution v2 e2e skill',
    '---',
    '',
    template,
  ].join('\n'), 'utf8')
  fs.writeFileSync(path.join(dir, 'template.md'), template, 'utf8')
  if (meta) fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8')
}

const providerRequests = []
const server = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    let body = null
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    providerRequests.push({ url: request.url, body })
    const index = providerRequests.length
    let text = JSON.stringify({ styleTags: '冷峻', pacingParams: '先慢后快' })
    if (index === 2) text = S1_OUTPUT
    else if (index === 3) text = TEXT_STRUCTURED_OUTPUT
    else if (index === 4) text = TEXT_FINAL_OUTPUT
    else if (index === 5) text = S2_OUTPUT
    else if (index === 6) text = S3_INVALID_OUTPUT
    else if (index === 7) text = S3_OUTPUT
    else text = JSON.stringify([{ name: '风暴终点', outline: '旧信真相揭开。', summary: '主线收束。', allocatedWords: 20000 }])
    if (body?.stream === false) {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({
        id: 'chatcmpl-chain-handoff-v2',
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
    response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' })
    response.end(events.map(event => `data: ${JSON.stringify(event)}`).join('\n\n') + '\n\ndata: [DONE]\n\n')
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
  try { execFileSync('taskkill', ['/PID', String(electronProcess.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
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
  return (request?.body?.messages || []).map(message => String(message.content || '')).join('\n')
}

async function main() {
  await new Promise(resolve => server.listen(MOCK_PORT, '127.0.0.1', resolve))
  fs.rmSync(PROFILE, { recursive: true, force: true })
  writeSkillFolder(S2_FOLDER, 'chain-handoff-s2', 'Handoff 全文消费', '你必须输出一个 JSON 数组。')
  writeSkillFolder(S3_FOLDER, 'chain-handoff-s3', 'Handoff 结构化消费', '你必须输出一个 JSON 数组。', {
    chainHandoff: { previousOutput: 'structured', requires: ['facts', 'constraints'] }
  })
  writeSkillFolder(S4_FOLDER, 'chain-handoff-s4', 'Handoff 缺字段回退', '你必须输出一个 JSON 数组。', {
    chainHandoff: { previousOutput: 'structured', requires: ['facts', 'not_declared'] }
  })
  startElectron()
  try {
    assert(await waitForCdp(), 'source Electron CDP reachable')
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    let page = null
    for (let index = 0; index < 24; index++) {
      const pages = browser.contexts()[0]?.pages() || []
      if (pages.length) { page = pages[0]; break }
      await sleep(500)
    }
    assert(page, 'renderer page reachable')
    page.on('pageerror', error => console.log('[PAGE ERROR] ' + error.message))
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1500)
    await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
    await sleep(500)

    await page.evaluate(async ({ providerConfig, s2Skill, s3Skill, s4Skill }) => {
      await window.electronAPI.storageWrite('wa_lastProjectId', 'default')
      await window.electronAPI.storageWrite('wa_providers', providerConfig)
      await window.electronAPI.storageWrite('wa_skills', {
        skills: [{
          id: 'chain-handoff-s1',
          name: 'Handoff 源技能',
          template: '你必须输出一个 JSON object。',
          format: 'text',
          injectMode: 'system_prefix',
          boundTo: [],
          intents: ['generate'],
        }, {
          id: 'chain-handoff-text-structured',
          name: 'Handoff 文本结构化变量',
          template: '结构化上一步输出：{{previousOutput}}',
          meta: { chainHandoff: { previousOutput: 'structured', requires: ['facts', 'constraints'] } },
          format: 'text',
          injectMode: 'system_prefix',
          outputFormat: 'json',
          boundTo: [],
          intents: ['generate'],
        }, {
          id: 'chain-handoff-text-final',
          name: 'Handoff 文本变量终点',
          template: '上一步输出：{{previousSkillOutput}}',
          format: 'text',
          injectMode: 'system_prefix',
          outputFormat: 'text',
          boundTo: [],
          intents: ['generate'],
        }, s2Skill, s3Skill, s4Skill],
        pipelineSkills: [],
      })
      await window.electronAPI.storageWrite('wa_pipeline_step_config', {
        agents: { 0: '', 1: '', 2: '', 3: '', 4: '' },
        skills: { 0: [], 1: [], 2: ['chain-handoff-s1', 'chain-handoff-text-structured', 'chain-handoff-text-final', 'folder:chain-handoff-s2', 'folder:chain-handoff-s3', 'folder:chain-handoff-s4'], 3: [], 4: [] },
        modes: { 0: 'compose', 1: 'compose', 2: 'chain', 3: 'chain', 4: 'chain' },
        skillAgents: {},
      })
      await window.electronAPI.storageWrite('wa_deAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
      await window.electronAPI.storageRemove('wa_pipeline_breakpoint')
    }, {
      providerConfig: {
        providers: [{
          id: PROVIDER_ID,
          name: 'Chain Handoff V2 Mock',
          baseUrl: MOCK_BASE_URL,
          apiKey: 'chain-handoff-key',
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
      s2Skill: {
        id: 'folder:chain-handoff-s2',
        sourceId: 'chain-handoff-s2',
        name: 'Handoff 全文消费',
        format: 'folder',
        folderPath: S2_FOLDER,
        template: '你必须输出一个 JSON 数组。',
        category: 'folder',
        description: 'chain handoff e2e',
        resourceSummary: { resourceCount: 0, warningCount: 0 },
        executionMode: 'chain',
        outputFormat: 'json',
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
      s3Skill: {
        id: 'folder:chain-handoff-s3',
        sourceId: 'chain-handoff-s3',
        name: 'Handoff 结构化消费',
        format: 'folder',
        folderPath: S3_FOLDER,
        template: '你必须输出一个 JSON 数组。',
        category: 'folder',
        description: 'chain handoff e2e',
        resourceSummary: { resourceCount: 0, warningCount: 0 },
        executionMode: 'chain',
        outputFormat: 'json',
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
      s4Skill: {
        id: 'folder:chain-handoff-s4',
        sourceId: 'chain-handoff-s4',
        name: 'Handoff 缺字段回退',
        format: 'folder',
        folderPath: S4_FOLDER,
        template: '你必须输出一个 JSON 数组。',
        category: 'folder',
        description: 'chain handoff e2e',
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
    await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
    await sleep(500)

    await page.click('#btn-pipeline')
    await page.waitForSelector('#pipeline-panel', { timeout: 10000 })
    await page.evaluate(() => window.__pinia?._s?.get('project')?.unlockOutline?.())
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
      const busy = Boolean(document.querySelector('.generation-progress:not([style*="display: none"])'))
      return Boolean(button && !button.disabled && !busy)
    }, null, { timeout: 60000, polling: 300 })

    assert(providerRequests.length >= 3, `pipeline reached the chain (requests=${providerRequests.length})`)
    {
      const debug = await page.evaluate(() => {
        const store = window.__pinia?._s?.get('runTrace')
        const run = store?.runs?.[0]
        return {
          events: (run?.events || []).map(event => `${event.type}:${event.detail}`),
          calls: (run?.apiCalls || []).map(call => `${call.skillName}:${call.status}:${call.error || ''}`),
        }
      })
      console.log(JSON.stringify(debug, null, 2))
    }

    assert(providerRequests.length === 8, `pipeline made ${providerRequests.length} calls (1 analysis + 6 chain steps + 1 escalation retry)`)
    const textStructuredRequest = requestText(providerRequests[2])
    const textFinalRequest = requestText(providerRequests[3])
    const s2Request = requestText(providerRequests[4])
    const s3Request = requestText(providerRequests[5])
    const s3RetryRequest = requestText(providerRequests[6])
    const s4Request = requestText(providerRequests[7])
    assert(s2Request.includes(TEXT_FINAL_OUTPUT), 'folder S2 receives the immediately previous full text by default')
    assert(s2Request.split(TEXT_FINAL_OUTPUT).length - 1 === 1, 'folder S2 receives the previous full text exactly once')
    assert(!s2Request.includes(S1_OUTPUT), 'folder S2 does not receive older chain outputs (snowball prevention)')
    assert(!s2Request.includes(TEXT_STRUCTURED_OUTPUT), 'folder S2 does not receive outputs from two steps ago (snowball prevention)')
    assert(textStructuredRequest.includes('## facts\n第一卷共 9 章'), 'text SKILL receives the structured previousOutput via template variable')
    assert(textStructuredRequest.includes('## constraints\n不得新增主角'), 'text SKILL receives declared constraints via template variable')
    assert(!textStructuredRequest.includes('unused'), 'text SKILL structured delivery excludes undeclared fields')
    assert(!textStructuredRequest.includes(S1_OUTPUT), 'text SKILL does not bypass handoff delivery with the raw full text')
    assert(textFinalRequest.includes(TEXT_STRUCTURED_OUTPUT), 'text SKILL final step receives the previous step through the previousSkillOutput alias')
    assert(textFinalRequest.split(TEXT_STRUCTURED_OUTPUT).length - 1 === 1, 'previousSkillOutput alias delivers the previous output exactly once')
    assert(s3Request.includes('## facts\n第一卷共 9 章'), 'S3 receives the declared facts field')
    assert(s3Request.includes('## constraints\n不得新增主角'), 'S3 receives the declared constraints field')
    assert(!s3Request.includes('unused'), 'S3 structured delivery excludes undeclared fields')
    assert(!s3Request.includes(S2_OUTPUT), 'S3 consumes the structured S2 contract fields, not the raw output')
    assert(s3RetryRequest.includes(S2_OUTPUT), 'S3 escalation retry receives the S2 full text')
    assert(s3RetryRequest.split(S2_OUTPUT).length - 1 === 1, 'S3 escalation retry receives S2 full text once')
    assert(s4Request.includes(S3_OUTPUT), 'S4 falls back to full text after structured contract miss')

    const trace = await page.evaluate(() => {
      const store = window.__pinia?._s?.get('runTrace')
      return store?.runs?.[0] || null
    })
    assert(trace, 'run trace exists')
    const eventTypes = trace.events.map(event => event.type)
    assert(eventTypes.includes('chain-handoff-delivery'), 'trace records handoff delivery decisions')
    const textDeliveryEvent = trace.events.find(event => event.type === 'chain-handoff-delivery' && String(event.detail || '').includes('"delivery":"structured_summary"'))
    assert(textDeliveryEvent, 'trace records the text SKILL structured delivery decision')
    assert(eventTypes.includes('chain-handoff-contract-miss'), 'trace records structured contract miss')
    assert(eventTypes.includes('chain-handoff-escalation'), 'trace records escalation to full text retry')
    const handoffReports = (trace.processingReports || []).filter(report => report.processor === 'chain-handoff')
    assert(handoffReports.length === 5, `trace archives ${handoffReports.length} handoff full-text reports`)
    assert(handoffReports.some(report => report.output === S1_OUTPUT), 'S1 full output is archived in trace')
    assert(handoffReports.some(report => report.output === TEXT_STRUCTURED_OUTPUT), 'text structured output is archived in trace')
    assert(handoffReports.some(report => report.output === TEXT_FINAL_OUTPUT), 'text final output is archived in trace')
    assert(handoffReports.some(report => report.output === S2_OUTPUT), 'S2 full output is archived in trace')
    assert(handoffReports.some(report => report.output === S3_OUTPUT), 'S3 full output is archived in trace')

    console.log('\n===== CHAIN HANDOFF EXECUTION V2 E2E PASSED =====')
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
