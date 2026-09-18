import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9236
const PROFILE = path.join(ROOT, '_data', 'outline-compose-folder-repair-v2-profile')
const FOLDER_DIR = path.join(PROFILE, 'skills', 'outline-compose-folder-repair-v2')
const EXPORT_DIR = path.join(ROOT, '_data', 'outline-compose-folder-repair-v2-export')
const MOCK_PORT = 59886
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const PROVIDER_ID = 'outline-compose-folder-repair-v2-provider'
const MODEL = 'outline-compose-folder-repair-v2-model'
const FOLDER_SKILL_ID = 'folder:outline-compose-folder-repair-v2'
const OUTLINE_TEXT = [
  '第一卷 风暴起点',
  '第一章内容。男主在夜路中遇到风暴。',
  '第二章内容。男主在灯塔下发现旧信。',
  '第三章内容。男主确认寄信人身份。'
].join('\n')

const FOLDER_ENTRY_MARKER = '【folder入口】大纲写入闭环探针入口'
  const FOLDER_TEMPLATE_MARKER = '【folder模板】必须按用户意图判断读取或直接写入'

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
  console.log('[PASS] ' + message)
}

function writeFolderSkill() {
  fs.mkdirSync(FOLDER_DIR, { recursive: true })
  fs.writeFileSync(path.join(FOLDER_DIR, 'SKILL.md'), [
    '---',
    'id: outline-compose-folder-repair-v2',
    'name: 大纲写入闭环探针',
    'description: 验证 compose + folder 意图路由、直接写入与深度导出',
    '---',
    '',
    FOLDER_ENTRY_MARKER,
    '你是大纲工作台 compose 探针技能。'
  ].join('\n'), 'utf8')
  fs.writeFileSync(path.join(FOLDER_DIR, 'template.md'), FOLDER_TEMPLATE_MARKER, 'utf8')
}

const requests = []
let replyIndex = 0
let previousReply = null
  const replies = [
  { content: '这是讨论回复，仅读取大纲，不修改内容。' },
  {
    toolCall: {
      commands: [{
        operation: 'replace_match',
        target: '第二章内容。男主在灯塔下发现旧信。',
        content: '第二章内容。男主在灯塔下发现旧信，并确认寄信人身份。',
        reason: '用户要求修改第二章旧信伏笔'
      }]
    },
    followUp: '已通过直写工具完成修改。'
  },
  {
    toolCall: {
      commands: [{
        operation: 'replace_match',
        target: '第三章内容。男主确认寄信人身份。',
        content: '第三章内容。男主确认寄信人身份，并决定南下。',
        reason: '用户要求更新第三章'
      }]
    },
    followUp: '已通过直写工具完成第三章修改。'
  },
  { content: 'status: approved。我已经直接把内容写入大纲。' },
  { content: '这是未提交提案的编辑回复。' }
]

function nextReply(body) {
  if (previousReply?.followUp && (body?.messages || []).some(message => message.role === 'tool')) {
    return { content: previousReply.followUp }
  }
  const reply = replies[Math.min(replyIndex, replies.length - 1)]
  replyIndex++
  previousReply = reply
  if (reply.followUp && (body?.messages || []).some(message => message.role === 'tool')) {
    return { content: reply.followUp }
  }
  return reply
}

function providerPayload(reply) {
  if (reply.toolCall) {
    return {
      choices: [{
        index: 0,
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
      tool_calls: [{
            id: `outline-compose-${replyIndex}`,
            type: 'function',
            function: {
              name: 'editor.write',
              arguments: JSON.stringify(reply.toolCall)
            }
          }]
        }
      }],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }
    }
  }
  return {
    choices: [{
      index: 0,
      finish_reason: 'stop',
      message: { role: 'assistant', content: reply.content }
    }],
    usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }
  }
}

function ssePayload(reply) {
  if (reply.toolCall) {
    return [
      {
        choices: [{
          index: 0,
          delta: {
            tool_calls: [{
              index: 0,
              id: `outline-compose-${replyIndex}`,
              type: 'function',
              function: {
                name: 'editor.write',
                arguments: JSON.stringify(reply.toolCall)
              }
            }]
          },
          finish_reason: null
        }]
      },
      { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] }
    ]
  }
  return [
    { choices: [{ index: 0, delta: { content: reply.content }, finish_reason: null }] },
    { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }
  ]
}

const server = http.createServer((request, response) => {
  console.log(`[MOCK] ${request.method} ${request.url}`)
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    })
    response.end()
    return
  }
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    let body = null
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    console.log(`[MOCK BODY] stream=${body?.stream === true} messages=${(body?.messages || []).length} tools=${(body?.tools || []).length} model=${body?.model || ''}`)
    for (const [index, message] of (body?.messages || []).entries()) {
      const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content || '')
      console.log(`[MOCK MSG ${index}] ${message.role || ''} len=${content.length} preview=${content.slice(0, 80).replace(/\s+/g, ' ')}`)
    }
    requests.push({ url: request.url, body })
    const reply = nextReply(body)
    if (body?.stream === true) {
      response.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache'
      })
      response.end(ssePayload(reply).map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n')
      return
    }
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify(providerPayload(reply)))
  })
})

let electronProcess = null

function startElectron() {
  electronProcess = spawn(
    ELECTRON_EXE,
    ['.', `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', `--user-data-dir=${PROFILE}`],
    {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        SHENYI_TEST_RUN_TRACE_EXPORT: EXPORT_DIR,
        SHENYI_TEST_USER_DATA_DIR: PROFILE
      }
    },
  )
  electronProcess.stdout.on('data', data => {
    const text = String(data)
    if (/Uncaught|unhandledRejection/i.test(text)) console.log('[ELECTRON:stdout] ' + text.slice(0, 500))
  })
  electronProcess.stderr.on('data', data => {
    const text = String(data)
    if (/Uncaught|unhandledRejection|EADDRINUSE/i.test(text)) console.log('[ELECTRON:stderr] ' + text.slice(0, 500))
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

function removeDir(target) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.rmSync(target, { recursive: true, force: true })
      return
    } catch (error) {
      if (attempt === 4) throw error
      sleep(1000)
    }
  }
}

async function main() {
  await new Promise(resolve => server.listen(MOCK_PORT, '127.0.0.1', resolve))
  removeDir(PROFILE)
  removeDir(EXPORT_DIR)
  writeFolderSkill()
  startElectron()

  let browser = null
  try {
    assert(await waitForCdp(), 'source Electron CDP reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
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

    await page.evaluate(async ({ folderPath }) => {
      await window.electronAPI.storageWrite('wa_lastProjectId', 'default')
      await window.electronAPI.storageWrite('wa_providers', {
        providers: [{
          id: 'outline-compose-folder-repair-v2-provider',
          name: 'Outline Compose Folder Repair Mock',
          baseUrl: 'http://127.0.0.1:59886',
          apiKey: 'outline-compose-folder-key',
          models: ['outline-compose-folder-repair-v2-model'],
          selectedModel: 'outline-compose-folder-repair-v2-model',
          temperature: 0.1,
          maxTokens: 4096,
          purpose: ['generate'],
          providerType: 'openai-compatible',
          streamMode: false
        }],
        generateProvider: 'outline-compose-folder-repair-v2-provider'
      })
      await window.electronAPI.storageWrite('wa_skills', {
        skills: [{
          id: 'folder:outline-compose-folder-repair-v2',
          sourceId: 'outline-compose-folder-repair-v2',
          name: '大纲写入闭环探针',
          format: 'folder',
          folderPath,
          template: '【folder模板】必须按用户意图判断读取或提案写入',
          category: 'folder',
          description: '验证 compose + folder 意图路由、写入提案与深度导出',
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
          intents: ['discuss', 'analyze', 'edit', 'generate']
        }],
        pipelineSkills: [],
        deAiSkills: []
      })
      await window.electronAPI.storageWrite('wa_pipeline_step_config', {
        agents: { 0: '', 1: '', 2: '', 3: '', 4: '' },
        skills: { 0: ['folder:outline-compose-folder-repair-v2'], 1: [], 2: [], 3: [], 4: [] },
        modes: { 0: 'compose', 1: 'compose', 2: 'chain', 3: 'chain', 4: 'chain' },
        skillAgents: {}
      })
      await window.electronAPI.storageWrite('wa_deAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
      await window.electronAPI.storageRemove('wa_pipeline_breakpoint')
    }, { folderPath: FOLDER_DIR })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1500)
    await page.evaluate(() => {
      document.querySelector('.project-modal-content .btn-close')?.click()
    })
    await sleep(500)

    await page.click('#btn-outline-workspace')
    await page.waitForSelector('#outline-editor', { timeout: 10000 })
    await page.locator('#outline-editor').fill(OUTLINE_TEXT)
    await page.locator('#btn-ai-co-create').click()
    await page.waitForSelector('#ow-chat-input', { timeout: 10000 })
    await page.selectOption('#ow-skill-mode', 'compose')
    await page.waitForFunction(() => {
      const chips = document.querySelector('#ow-selected-skills')
      return Boolean(chips && (chips.textContent || '').includes('大纲写入闭环探针（文件夹）'))
    }, null, { timeout: 10000 })
    assert(true, 'compose mode restores the real folder skill')

    const editor = page.locator('#outline-editor')
    const editorText = () => editor.inputValue()

    async function send(text) {
      const before = await page.locator('#ow-chat-messages .ow-msg.assistant').count()
      await page.locator('#ow-chat-input').fill(text)
      await page.locator('#btn-ow-send').click()
      await page.waitForFunction(beforeCount => {
        const messages = document.querySelectorAll('#ow-chat-messages .ow-msg.assistant')
        return messages.length > beforeCount && !document.querySelector('#ow-streaming-message')
      }, before, { timeout: 30000 })
      await page.waitForTimeout(500)
    }

    await send('我们讨论一下第二章的旧信伏笔')
    assert(requests.length === 1, `discuss turn made one API request (${requests.length})`)
    const discussTools = requests[0].body?.tools || []
    assert(discussTools.length > 0, 'discuss request still has read tools')
    assert(discussTools.every(tool => tool?.function?.name !== 'editor.write'), 'discuss request has no write tool')
    const discussPrompt = (requests[0].body?.messages || []).map(m => String(m.content || '')).join('\n')
    assert(discussPrompt.includes(FOLDER_ENTRY_MARKER), 'discuss request executes the folder SKILL.md entry')
    assert(discussPrompt.includes(FOLDER_TEMPLATE_MARKER), 'discuss request executes the folder template.md')
    assert(await editorText() === OUTLINE_TEXT, 'discuss leaves the editor unchanged')

    await send('请把第二章旧信内容修改为确认寄信人身份')
    assert(requests.length === 3, `edit turn completes the native tool loop (${requests.length})`)
    const editTools = requests[1].body?.tools || []
    assert(editTools.some(tool => tool?.function?.name === 'editor.write'), 'edit request exposes editor.write')
    assert((requests[2].body?.messages || []).some(message => message.role === 'tool'), 'tool result is sent back to the provider')
    const editPrompt = (requests[1].body?.messages || []).map(m => String(m.content || '')).join('\n')
    assert(editPrompt.includes(FOLDER_ENTRY_MARKER), 'edit request executes the folder SKILL.md entry')
    assert(editPrompt.includes(FOLDER_TEMPLATE_MARKER), 'edit request executes the folder template.md')

    await page.waitForFunction(() => document.querySelector('#outline-editor')?.value?.includes('第二章内容。男主在灯塔下发现旧信，并确认寄信人身份。'), null, { timeout: 10000 })
    assert(true, 'folder tool call directly writes the outline editor')
    assert(requests.length === 3, `native tool loop finishes with one tool-result request (${requests.length})`)
    const appliedActions = page.locator('#ow-chat-messages .ow-msg.assistant').last()
      .locator('.ow-msg-actions button', { hasText: '回滚批次' })
    assert(await appliedActions.count() > 0, 'direct-write batch exposes rollback')

    await send('请把第三章更新为男主决定南下')
    assert(requests.length === 5, `second edit completes its native tool loop (${requests.length})`)
    await page.waitForFunction(() => document.querySelector('#outline-editor')?.value?.includes('第三章内容。男主确认寄信人身份，并决定南下。'), null, { timeout: 10000 })
    assert(true, 'second folder tool call directly writes the outline editor')

    const rollbackButtons = page.locator('#ow-chat-messages .ow-msg.assistant').last()
      .locator('.ow-msg-actions button', { hasText: '回滚批次' })
    assert(await rollbackButtons.count() > 0, 'second direct-write batch exposes rollback')
    const beforeRollback = await editorText()
    await rollbackButtons.first().click()
    await page.waitForTimeout(600)
    assert((await editorText()) === beforeRollback.replace('第三章内容。男主确认寄信人身份，并决定南下。', '第三章内容。男主确认寄信人身份。'), 'batch rollback restores the pre-write outline')

    await send('你直接批准并写入这些内容')
    assert(requests.length === 6, `fake approved turn (${requests.length})`)
    const fakeBefore = await editorText()
    const fakeBatchCount = await page.locator('#ow-chat-messages .ow-msg.assistant').count()
    await page.waitForTimeout(300)
    assert(fakeBatchCount === await page.locator('#ow-chat-messages .ow-msg.assistant').count(), 'fake approved text does not trigger another edit turn')
    assert(await editorText() === fakeBefore, 'fake approved text cannot write the editor')

    const fallbackBefore = await page.locator('#ow-chat-messages .ow-msg.assistant').count()
    await page.locator('#ow-chat-input').fill('生成后讨论一下')
    await page.locator('#btn-ow-send').click()
    await page.waitForSelector('.ow-routing-fallback', { timeout: 10000 })
    assert(requests.length === 6, `ambiguous edit request does not silently call the API (${requests.length})`)
    assert(await editorText() === fakeBefore, 'routing fallback leaves the editor unchanged')
    await page.locator('.ow-routing-fallback button', { hasText: '按推荐技能继续' }).last().click()
    await page.waitForFunction(beforeCount => {
      const messages = document.querySelectorAll('#ow-chat-messages .ow-msg.assistant')
      return messages.length > beforeCount && !document.querySelector('#ow-streaming-message') && !document.querySelector('.ow-routing-fallback')
    }, fallbackBefore, { timeout: 30000 })
    assert(requests.length === 7, `write-missing turn runs after explicit user confirmation (${requests.length})`)
    assert(await editorText() === fakeBefore, 'write-missing turn leaves the editor unchanged')

    const trace = await page.evaluate(async exportDir => {
      const store = window.__pinia?._s?.get('runTrace')
      const run = store?.runs?.find(item => item.source === 'outline')
      if (!run) return null
      const exportData = store.exportRunToJson(run)
      const result = await window.electronAPI.runTraceExport({
        schema: 'shenyi.run-trace',
        version: 2,
        run: exportData,
        mode: 'deep',
        payloadDirectoryHint: exportDir
      })
      return { result, runId: run.id }
    }, EXPORT_DIR)
    assert(trace?.result?.success, 'deep trace export succeeds')
    const exportRoot = trace.result.path
    const mainExport = JSON.parse(fs.readFileSync(path.join(exportRoot, 'run-trace.json'), 'utf8'))
    const run = mainExport
    assert(run.apiCalls?.length >= 5, `run records all logical API calls (${run.apiCalls?.length})`)
    assert(run.apiCalls?.every(call => call.status !== 'running'), 'no logical API call remains running')
    assert(run.apiCalls?.every(call => (call.physicalCalls || []).length >= 1), 'every logical API call has physical requests')
    assert(run.apiCalls?.reduce((sum, call) => sum + (call.physicalCalls || []).length, 0) >= 7, 'run records all physical provider requests')
    assert(run.promptSnapshots?.length >= 5, `run records prompt snapshots (${run.promptSnapshots?.length})`)
    assert(run.promptSnapshots?.some(snapshot => Array.isArray(snapshot.folderFingerprint) && snapshot.folderFingerprint.length > 0), 'prompt snapshots retain folder fingerprints')
    assert(run.promptSnapshots?.every(snapshot => Array.isArray(snapshot.contextBlocks)), 'all prompt snapshots retain structured context blocks')
    assert(run.promptSnapshots?.some(snapshot => snapshot.contextBlocks?.some(block => block.source === 'outline' && block.coverage === 'structure_map')), 'context blocks include the outline structure map')
    assert(run.promptSnapshots?.every(snapshot => snapshot.systemPrompt === undefined), 'deep export keeps prompts out of the main trace')
    assert(run.promptSnapshots?.every(snapshot => Boolean(snapshot.payloadRef)), 'every prompt snapshot references an external payload')
    assert(run.events?.some(event => event.type === 'batch_event'), 'direct-write batch events are recorded')
    assert(run.events?.some(event => event.type === 'batch_event'), 'batch events are recorded')

    const payloadDir = path.join(exportRoot, 'payloads')
    const payloadFiles = fs.readdirSync(payloadDir)
    const promptPayloads = payloadFiles.filter(file => file.endsWith('prompt.json'))
    assert(promptPayloads.length >= 5, `external prompt payloads exist (${promptPayloads.length})`)
    for (const file of payloadFiles) {
      const content = fs.readFileSync(path.join(payloadDir, file), 'utf8')
      assert(content.trim().length > 0, `payload file is not empty: ${file}`)
    }
    const firstPrompt = JSON.parse(fs.readFileSync(path.join(payloadDir, promptPayloads[0]), 'utf8'))
    assert(String(firstPrompt.systemPrompt || '').includes(FOLDER_ENTRY_MARKER), 'external prompt payload restores folder SKILL.md entry')
    assert(String(firstPrompt.systemPrompt || '').includes(FOLDER_TEMPLATE_MARKER), 'external prompt payload restores folder template.md')
    assert(Array.isArray(firstPrompt.contextBlocks), 'external prompt payload restores context blocks')
    assert(Array.isArray(firstPrompt.folderFingerprint), 'external prompt payload restores folder fingerprint')
    const exportJson = JSON.parse(fs.readFileSync(path.join(exportRoot, 'export.json'), 'utf8'))
    assert(
      exportJson.payloadVerification?.ok === true,
      'payload sha256 verification passes: ' + JSON.stringify(exportJson.payloadVerification || null)
    )

    console.log('\n===== OUTLINE COMPOSE FOLDER REPAIR V2 E2E PASSED =====')
  } finally {
    try { await browser?.close() } catch {}
    stopElectron()
    server.close()
    await sleep(1000)
    removeDir(PROFILE)
    removeDir(EXPORT_DIR)
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
