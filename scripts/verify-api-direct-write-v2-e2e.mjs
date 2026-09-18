import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = process.env.SHENYI_DIRECT_WRITE_ELECTRON
  ? path.resolve(process.env.SHENYI_DIRECT_WRITE_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const INSTALLED_RUN = process.env.SHENYI_DIRECT_WRITE_INSTALLED === '1'
const RUN_SUFFIX = INSTALLED_RUN ? 'installer' : 'source'
const CDP_PORT = Number(process.env.SHENYI_DIRECT_WRITE_CDP_PORT || (INSTALLED_RUN ? 9275 : 9271))
const PROFILE = path.join(ROOT, '_data', `api-direct-write-v2-profile-${RUN_SUFFIX}`)
const EXPORT_ROOT = path.join(ROOT, '_data', `api-direct-write-v2-exports-${RUN_SUFFIX}`)
const LOG_DIR = path.join(PROFILE, 'diag-logs')
const SCREENSHOT_DIR = path.join(ROOT, '_audit', 'verification-api-direct-write-v2', `screenshots-${RUN_SUFFIX}`)
const EVIDENCE_DIR = path.join(ROOT, '_audit', 'verification-api-direct-write-v2')
const MOCK_PORT = 59928
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const PROJECT_ID = 'api-direct-write-v2-e2e'
const PROVIDER_ID = 'api-direct-write-v2-provider'

const BASE_OUTLINE = [
  '第一卷 风暴起点',
  '第二章内容。男主在灯塔下发现旧信。',
  '第三章内容。男主抵达灯塔顶端。',
].join('\n')
const BASE_EDITOR = [
  '夜风压过山脊。',
  '第二章内容。男主在灯塔下发现旧信。',
  '第三章内容。男主抵达灯塔顶端。',
].join('\n')

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function parseTraceDetail(detail) {
  if (!detail) return null
  if (typeof detail === 'object') return detail
  try {
    return JSON.parse(detail)
  } catch {
    return { raw: detail }
  }
}

async function removeDir(target) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.rmSync(target, { recursive: true, force: true })
      return
    } catch {}
    await sleep(500)
  }
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true })
}

function writeEvidence(name, value) {
  const file = path.join(EVIDENCE_DIR, name)
  fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2), 'utf8')
  return file
}

function assertFreshRendererBuild() {
  const rendererIndex = path.join(ROOT, 'dist-renderer', 'index.html')
  assert(fs.existsSync(rendererIndex), 'dist-renderer/index.html exists; run npm run build:vue first')
  const indexHtml = fs.readFileSync(rendererIndex, 'utf8')
  const bundleNames = [...indexHtml.matchAll(/assets\/[^"']+\.js/g)].map(match => match[0])
  assert(bundleNames.length > 0, 'renderer index references at least one JS bundle')
  const sourceRoot = path.join(ROOT, 'src')
  const sourceFiles = []
  const collectSources = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) collectSources(full)
      else if (/\.(ts|vue|js|mjs|css)$/.test(entry.name)) sourceFiles.push(full)
    }
  }
  collectSources(sourceRoot)
  for (const extra of ['index.html', 'package.json', 'package-lock.json', 'vite.config.ts', 'vite.config.mts']) {
    const full = path.join(ROOT, extra)
    if (fs.existsSync(full)) sourceFiles.push(full)
  }
  const newestSourceMs = Math.max(...sourceFiles.map(file => fs.statSync(file).mtimeMs))
  const staleBundles = bundleNames.filter(name => {
    const bundleStat = fs.statSync(path.join(ROOT, 'dist-renderer', name))
    return bundleStat.mtimeMs < newestSourceMs
  })
  assert.equal(
    staleBundles.length,
    0,
    `renderer build is stale; rebuild with npm run build:vue. Stale bundles: ${staleBundles.join(', ')}`,
  )
}

function toolCall(name, input, id) {
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
            name,
            arguments: JSON.stringify(input),
          },
        }],
      },
    }],
  }
}

function textCompletion(content) {
  return {
    choices: [{
      finish_reason: 'stop',
      message: { role: 'assistant', content },
    }],
  }
}

let scenario = 'home-empty-insert'
const requests = []
const scenarioRequests = () => requests.filter(item => item.scenario === scenario)

const server = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    let body = null
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    const count = scenarioRequests().length + 1
    const record = { scenario, requestCount: count, tools: (body?.tools || []).map(tool => tool?.function?.name || tool?.name || '').filter(Boolean), body }
    requests.push(record)
    console.log(`[MOCK] ${scenario} #${count}: ${record.tools.join(', ') || '(no tools)'}`)

    let payload = null
    let statusCode = 200
    let rawBody = null

    const compatibilityScenarios = new Set(['compatibility-first-tools', 'compatibility-json-write'])
    if (compatibilityScenarios.has(scenario) && (body?.tools || []).length > 0) {
      statusCode = 400
      rawBody = JSON.stringify({ error: { message: 'tools unsupported by this provider' } })
    } else if (scenario === 'compatibility-first-tools') {
      payload = textCompletion(JSON.stringify({
        tool: 'editor.write',
        commands: [{
          operation: 'append',
          content: '兼容供应商直写第一段。',
          reason: '首次降级直写验证',
        }],
        reveal: { mode: 'stream', firstChange: true },
        reason: '兼容供应商首次直写',
      }))
    } else if (scenario === 'compatibility-json-write') {
      payload = textCompletion(JSON.stringify({
        tool: 'editor.write',
        commands: [{
          operation: 'append',
          content: '兼容供应商直写补充段。',
          reason: '兼容 JSON 协议直写验证',
        }],
        reveal: { mode: 'stream', firstChange: true },
        reason: '兼容供应商直写',
      }))
    } else if (scenario === 'home-empty-insert' && count === 1) {
      payload = toolCall('editor.write', {
        commands: [{ operation: 'insert', content: 'AI 直写第一段：风暴中的旧信。', position: 'cursor', reason: '空编辑器写入验证' }],
        reveal: { mode: 'stream', firstChange: true },
        reason: '空编辑器直写',
      }, 'direct-write-empty')
    } else if (scenario === 'home-replace-rollback' && (count === 1 || count === 3)) {
      payload = toolCall('editor.write', {
        commands: [{ operation: 'replace_match', target: '第二章内容。男主在灯塔下发现旧信。', content: '第二章内容。男主确认了寄信人身份。', reason: '唯一目标替换验证' }],
        reveal: { mode: 'stream', firstChange: true },
        reason: '唯一目标替换',
      }, 'direct-write-replace')
    } else if (scenario === 'home-ambiguous' && count === 1) {
      payload = toolCall('editor.write', {
        commands: [{ operation: 'replace_match', target: '重复目标。', content: '不应写入。', reason: '多命中应拒绝' }],
        reason: '多命中目标验证',
      }, 'direct-write-ambiguous')
    } else if (scenario === 'home-large-instant' && count === 1) {
      payload = toolCall('editor.write', {
        commands: [{ operation: 'append', content: '大文档直写尾部追加。', reason: '大文档直接呈现验证' }],
        reveal: { mode: 'instant', firstChange: true },
        reason: '大文档直写',
      }, 'direct-write-large')
    } else if (scenario === 'home-stream-follow' && count === 1) {
      payload = toolCall('editor.write', {
        commands: [{ operation: 'append', content: '流式呈现跟随验证段。', reason: '流式写入跟随验证' }],
        reveal: { mode: 'stream', firstChange: true },
        reason: '流式呈现',
      }, 'direct-write-stream')
    } else if (scenario === 'home-permission-denied' && count === 1) {
      payload = toolCall('editor.write', {
        commands: [{ operation: 'append', content: '讨论意图不允许写入。', reason: '权限门强制拒绝验证' }],
        reveal: { mode: 'instant', firstChange: true },
        reason: '讨论意图写入',
      }, 'denied-write-discuss')
    } else if (scenario === 'home-permission-denied' && count === 2) {
      payload = textCompletion('已处理当前请求。')
    } else if (scenario === 'home-reveal-discuss' && count === 1) {
      payload = toolCall('editor.reveal', {
        target: { fragment: '第二章内容。男主在灯塔下发现旧信。' },
        focus: 'center',
        reason: '讨论写入位置',
      }, 'direct-reveal-discuss')
    } else if (scenario === 'home-write-limit' && count <= 2) {
      payload = toolCall('editor.write', {
        commands: [{ operation: 'append', content: `第 ${count} 次写入。`, reason: '写入限流验证' }],
        reveal: { mode: 'instant', firstChange: false },
        reason: '写入限流',
      }, `direct-write-limit-${count}`)
    } else if (scenario === 'home-reveal-range' && count === 1) {
      payload = toolCall('editor.reveal', {
        target: { fragment: '第二章内容。男主确认了寄信人身份。' },
        focus: 'center',
        reason: '气泡查看位置',
      }, 'direct-reveal-range')
    } else if (scenario === 'outline-write' && count === 1) {
      payload = toolCall('editor.write', {
        commands: [{ operation: 'replace_match', target: '第二章内容。男主在灯塔下发现旧信。', content: '第二章大纲：男主确认寄信人身份。', reason: '大纲唯一目标直写' }],
        reveal: { mode: 'stream', firstChange: true },
        reason: '大纲直写',
      }, 'outline-direct-write')
    } else if (scenario === 'outline-locked-write' && count === 1) {
      payload = toolCall('editor.write', {
        commands: [{ operation: 'append', content: '锁定态不应写入。', reason: '锁定态写入验证' }],
        reason: '锁定态写入',
      }, 'outline-locked-write')
    } else if (scenario === 'outline-locked-reveal' && count === 1) {
      payload = toolCall('editor.reveal', {
        target: { fragment: '第二章内容。男主在灯塔下发现旧信。' },
        focus: 'center',
        reason: '锁定态定位讨论',
      }, 'outline-locked-reveal')
    } else if (scenario === 'pipeline-settings') {
      const prompt = (body?.messages || []).map(message => message.content || '').join('\n')
      if (prompt.includes('提取并生成设定项')) {
        payload = textCompletion(JSON.stringify([
          { name: '灯塔与旧信', category: '设定类', attrsText: '推动男主确认寄信人身份的核心道具。' },
        ]))
      }
    }

    if (!payload && !rawBody) payload = textCompletion('已处理当前请求。')

    if (rawBody) {
      response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' })
      response.end(rawBody)
      return
    }

    if (body?.stream) {
      response.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })
      const delta = payload.choices?.[0]?.message || {}
      response.write(`data: ${JSON.stringify({
        id: `api-direct-write-${scenario}`,
        object: 'chat.completion.chunk',
        choices: [{
          index: 0,
          finish_reason: payload.choices?.[0]?.finish_reason,
          delta: {
            role: 'assistant',
            content: delta.content || '',
            tool_calls: delta.tool_calls,
          },
        }],
      })}\n\n`)
      response.write('data: [DONE]\n\n')
      response.end()
      return
    }

    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify(payload))
  })
})

function startElectron() {
  const args = INSTALLED_RUN
    ? [`--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', `--user-data-dir=${PROFILE}`]
    : ['.', `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', `--user-data-dir=${PROFILE}`]
  return spawn(ELECTRON_EXE, args, {
    cwd: INSTALLED_RUN ? path.dirname(ELECTRON_EXE) : ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SHENYI_TEST_USER_DATA_DIR: path.join(PROFILE, 'app-data'),
      SHENYI_TEST_RUN_TRACE_EXPORT: EXPORT_ROOT,
      SHENYI_TEST_LOG_DIR: LOG_DIR,
    },
    windowsHide: true,
  })
}

async function waitForCdp() {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)
      if (response.ok) return true
    } catch {}
    await sleep(500)
  }
  return false
}

function providerConfig(streamMode) {
  return {
    providers: [{
      id: PROVIDER_ID,
      name: 'API Direct Write Mock',
      baseUrl: MOCK_BASE_URL,
      apiKey: 'key',
      models: ['api-direct-write-model'],
      selectedModel: 'api-direct-write-model',
      temperature: 0.1,
      maxTokens: 4096,
      purpose: ['generate'],
      providerType: 'openai-compatible',
      streamMode,
    }],
    generateProvider: PROVIDER_ID,
    verifyProvider: null,
    detectProvider: null,
  }
}

async function setupProject(page, options = {}) {
  await page.evaluate(async ({ projectId, provider, outline, editor }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', provider)
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: 'API Direct Write V2 E2E',
      outlineText: outline,
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
      outlineChat: [],
      chat: [],
      editorTabs: [{
        id: 'direct-write-main-tab',
        title: '第二章 灯塔',
        mode: 'ch-body',
        chapterId: 'direct-write-chapter',
        content: editor,
      }],
    })
    await window.electronAPI.storageWrite('wa_deAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
    const pipelineConfig = await window.electronAPI.storageRead('wa_pipeline_step_config') || {}
    pipelineConfig.skills = pipelineConfig.skills || {}
    pipelineConfig.modes = pipelineConfig.modes || {}
    pipelineConfig.skills[0] = []
    pipelineConfig.modes[0] = 'chain'
    await window.electronAPI.storageWrite('wa_pipeline_step_config', pipelineConfig)
    await window.electronAPI.storageWrite('wa_skills', { skills: [] })
    await window.electronAPI.storageWrite('wa_co_creation_config', {
      agentId: '',
      skillIds: [],
      mode: 'compose',
      skillAgents: {},
    })
  }, {
    projectId: PROJECT_ID,
    provider: providerConfig(options.streamMode ?? false),
    outline: options.outline ?? BASE_OUTLINE,
    editor: options.editor ?? BASE_EDITOR,
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20000 })
  await sleep(1200)
  await page.evaluate(() => {
    document.querySelector('.project-modal-content .btn-close')?.click()
    document.querySelector('#btn-close-pl')?.click()
    document.querySelector('#btn-close-outline-workspace')?.click()
  })
  await sleep(300)
}

async function installObserver(page) {
  await page.evaluate(() => {
    window.__directWriteObserver = {
      diffLocate: [],
      follow: [],
      alerts: [],
    }
    window.addEventListener('diff-locate', event => {
      window.__directWriteObserver.diffLocate.push({ ...event.detail, at: Date.now() })
    })
    window.addEventListener('editor-follow-progress', event => {
      window.__directWriteObserver.follow.push({ ...event.detail, at: Date.now() })
    })
    const observer = new MutationObserver(() => {
      const text = document.body.textContent || ''
      if (text.includes('编辑器内容在批次应用后已有修改')) {
        if (!window.__directWriteObserver.alerts.includes('version_changed')) window.__directWriteObserver.alerts.push('version_changed')
      }
    })
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    window.__directWriteObserverMutation = observer
  })
}

async function observe(page) {
  return await page.evaluate(() => structuredClone(window.__directWriteObserver || { diffLocate: [], follow: [], alerts: [] }))
}

async function resetObserver(page) {
  await page.evaluate(() => {
    if (window.__directWriteObserver) {
      window.__directWriteObserver.diffLocate = []
      window.__directWriteObserver.follow = []
      window.__directWriteObserver.alerts = []
    }
  })
}

async function ensureMainEditor(page, content) {
  await page.evaluate(text => {
    const store = window.__pinia?.state?.value?.editor
    if (!store?.tabs?.length) {
      store.tabs = [{
        id: 'direct-write-main-tab',
        title: '第二章 灯塔',
        mode: 'ch-body',
        chapterId: 'direct-write-chapter',
        content: text,
      }]
    }
    store.activeTabId = store.tabs[0].id
    store.tabs[0].content = text
  }, content)
  await sleep(200)
}

async function waitHomeIdle(page, timeout = 40000) {
  await page.waitForFunction(() => {
    const button = document.querySelector('#btn-send')
    return Boolean(button && !button.disabled)
  }, null, { timeout, polling: 250 })
  await sleep(300)
}

async function sendHome(page, text, waitFor = '已处理当前请求。') {
  await resetObserver(page)
  await page.locator('#user-input').fill(text)
  await page.locator('#btn-send').click()
  try {
    await page.waitForFunction(value => (document.body.textContent || '').includes(value), waitFor, { timeout: 40000, polling: 250 })
  } catch (error) {
    const bodyText = await page.evaluate(() => (document.body.textContent || '').slice(-4000))
    console.error(`[HOME TIMEOUT] waiting for: ${waitFor}\n${bodyText}`)
    throw error
  }
  await waitHomeIdle(page)
}

async function openOutline(page) {
  await page.evaluate(() => document.querySelector('#btn-close-outline-workspace')?.click())
  await sleep(200)
  await page.click('#btn-outline-workspace')
  await page.waitForSelector('#outline-editor', { timeout: 15000 })
  await page.click('#btn-ai-co-create')
  await page.waitForSelector('#ow-chat-input', { timeout: 15000 })
}

async function waitOutlineIdle(page, timeout = 40000) {
  await page.waitForFunction(() => {
    const button = document.querySelector('#btn-ow-send')
    return Boolean(button && !button.disabled)
  }, null, { timeout, polling: 250 })
  await sleep(300)
}

async function sendOutline(page, text, waitFor = '已处理当前请求。') {
  await resetObserver(page)
  await waitOutlineIdle(page)
  await page.locator('#ow-chat-input').fill(text)
  await page.locator('#ow-chat-input').evaluate(element => element.dispatchEvent(new Event('change', { bubbles: true })))
  await page.locator('#btn-ow-send').click()
  try {
    await page.waitForFunction(value => (document.body.textContent || '').includes(value), waitFor, { timeout: 40000, polling: 250 })
  } catch (error) {
    const bodyText = await page.evaluate(() => (document.body.textContent || '').slice(-4000))
    console.error(`[OUTLINE TIMEOUT] waiting for: ${waitFor}\n${bodyText}`)
    throw error
  }
  await waitOutlineIdle(page)
}

function activeTabContent(page) {
  return page.evaluate(() => {
    const store = window.__pinia?._s?.get('editor')
    const tab = store?.tabs?.find(item => item.id === store.activeTabId) || store?.tabs?.[0]
    return tab?.content || ''
  })
}

function outlineContent(page) {
  return page.evaluate(() => window.__pinia?._s?.get('project')?.outlineText || '')
}

async function setOutlineContent(page, content) {
  await page.evaluate(text => {
    const store = window.__pinia?._s?.get('project')
    if (!store) throw new Error('project store is unavailable')
    store.outlineLocked = false
    store.setOutline(text)
  }, content)
  await sleep(200)
  const actual = await outlineContent(page)
  assert.equal(actual, content, 'outline fixture content is synchronized through the project store')
}

async function setProjectOutlineLocked(page, locked) {
  await page.evaluate(value => {
    const project = window.__pinia?._s?.get('project')
    if (project) project.outlineLocked = value
  }, locked)
  await sleep(200)
}

async function latestRun(page, source) {
  return await page.evaluate(sourceName => {
    const run = [...(window.__pinia?._s?.get('runTrace')?.runs || [])]
      .filter(item => item.source === sourceName)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    if (!run) return null
    return {
      id: run.id,
      status: run.status,
      turns: (run.turns || []).map(turn => ({
        status: turn.status,
        userRequest: turn.userRequest,
        toolSurface: (turn.toolSurface || []).map(tool => ({ name: tool.name, policy: tool.policy })),
        actualToolSurface: (turn.actualToolSurface || []).map(tool => ({ name: tool.name, policy: tool.policy })),
      })),
      apiCalls: (run.apiCalls || []).map(call => ({
        status: call.status,
        responseText: call.responseText || '',
        compatibilityMode: call.compatibilityMode || null,
        toolSurface: (call.toolSurface || []).map(tool => ({ name: tool.name, policy: tool.policy })),
        actualToolSurface: (call.actualToolSurface || []).map(tool => ({ name: tool.name, policy: tool.policy })),
        toolsDowngraded: call.toolsDowngraded || null,
        downgradeReason: call.downgradeReason || null,
        toolCalls: (call.toolCalls || []).map(callItem => ({
          name: callItem.name,
          status: callItem.status,
          error: callItem.error,
          input: callItem.input || null,
        })),
        events: (run.events || [])
          .filter(event => String(event.type || '').startsWith('editor-presentation'))
          .map(event => ({ type: event.type, detail: event.detail })),
      })),
      traceEvents: (run.events || []).map(event => ({
        type: event.type,
        level: event.level,
        label: event.label,
        detail: event.detail,
      })),
    }
  }, source)
}

async function exportLatestRun(page, source) {
  return await page.evaluate(async ({ sourceName, exportRoot }) => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])]
      .filter(item => item.source === sourceName)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    if (!run) return { success: false, reason: 'run not found' }
    return await window.electronAPI.runTraceExport({
      schema: 'shenyi.run-trace',
      version: 2,
      run: store.exportRunToJson(run),
      mode: 'deep',
      payloadDirectoryHint: exportRoot,
    })
  }, { sourceName: source, exportRoot: EXPORT_ROOT })
}

async function readRendererDiag(page) {
  return await page.evaluate(async () => await window.DiagLogger.read())
}

function normalizeDiagEntries(entries) {
  return (entries || []).map(entry => {
    let detail = null
    if (entry.detail) {
      if (typeof entry.detail === 'object') detail = entry.detail
      else {
        try { detail = JSON.parse(entry.detail) } catch { detail = { raw: entry.detail } }
      }
    }
    return { level: entry.level, cat: entry.cat, msg: entry.msg, detail, ts: entry.ts }
  })
}

function diagCategories(entries, category) {
  return (entries || []).filter(entry => entry.cat === category)
}

function requiredDiagCategories() {
  return [
    'ai-service',
    'ai-service/tool-call',
    'ai-service/editor-presentation',
    'ai-service/editor-batch',
  ]
}

function assertDiagCoverage(rendererEntries, mainEntries) {
  assert(Array.isArray(rendererEntries) && rendererEntries.length > 0, 'renderer diagnostics contain entries')
  assert(Array.isArray(mainEntries) && mainEntries.length > 0, 'main-process diagnostics contain entries')

  const requiredCategories = requiredDiagCategories()
  for (const category of requiredCategories) {
    assert(
      diagCategories(rendererEntries, category).length > 0,
      `renderer diagnostics cover ${category}`,
    )
    assert(
      diagCategories(mainEntries, category).length > 0,
      `main-process diagnostics cover ${category}`,
    )
  }

  const toolCalls = diagCategories(rendererEntries, 'ai-service/tool-call')
  assert(toolCalls.some(entry => entry.detail?.toolName === 'editor.write' && entry.level === 'info'), 'diag logs cover successful editor.write')
  assert(toolCalls.some(entry => entry.detail?.toolName === 'editor.write' && entry.level === 'error'), 'diag logs cover rejected editor.write')
  const deniedRenderer = toolCalls.some(entry => entry.detail?.toolName === 'editor.write' && entry.detail?.result?.error?.code === 'permission_denied')
  const deniedMain = diagCategories(mainEntries, 'ai-service/tool-call').some(entry => entry.detail?.toolName === 'editor.write' && entry.detail?.result?.error?.code === 'permission_denied')
  assert(deniedRenderer, 'renderer diag logs cover permission_denied')
  assert(deniedMain, 'main-process diag logs cover permission_denied')
  assert(toolCalls.some(entry => entry.detail?.toolName === 'editor.reveal'), 'diag logs cover editor.reveal')

  const presentations = diagCategories(rendererEntries, 'ai-service/editor-presentation')
  assert(presentations.some(entry => entry.detail?.phase === 'start' && entry.detail?.mode === 'instant'), 'diag logs cover instant presentation start')
  assert(presentations.some(entry => entry.detail?.phase === 'finished' && entry.detail?.mode === 'stream'), 'diag logs cover stream presentation finish')
  assert(presentations.some(entry => entry.detail?.workspace === 'outline' && entry.detail?.phase === 'finished'), 'diag logs cover successful outline presentation')

  const batches = diagCategories(rendererEntries, 'ai-service/editor-batch')
  assert(batches.some(entry => entry.detail?.result === 'applied' && entry.detail?.workspace === 'main'), 'diag logs cover applied main writes')
  assert(batches.some(entry => entry.detail?.result === 'applied' && entry.detail?.workspace === 'outline'), 'diag logs cover applied outline writes')
  assert(batches.some(entry => entry.detail?.result === 'rejected'), 'diag logs cover rejected batches')

  const capabilities = diagCategories(rendererEntries, 'ai-service/tool-capability')
  assert(capabilities.some(entry => entry.detail?.toolCapability === 'json_protocol'), 'diag logs cover json_protocol compatibility')
}

function assertPass(message) {
  console.log(`[PASS] ${message}`)
}

async function capture(page, name) {
  const file = path.join(SCREENSHOT_DIR, `${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  assertPass(`screenshot saved: ${name}.png`)
  return file
}

async function main() {
  if (!INSTALLED_RUN) assertFreshRendererBuild()
  await new Promise(resolve => server.listen(MOCK_PORT, '127.0.0.1', resolve))
  removeDir(PROFILE)
  removeDir(EXPORT_ROOT)
  ensureDir(path.join(PROFILE, 'app-data'))
  ensureDir(EXPORT_ROOT)
  ensureDir(SCREENSHOT_DIR)

  const electronProcess = startElectron()
  let browser = null
  let page = null
  try {
    assert(await waitForCdp(), 'CDP reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    for (let attempt = 0; attempt < 24 && !page; attempt++) {
      page = browser.contexts()[0]?.pages()?.[0] || null
      if (!page) await sleep(500)
    }
    assert(page, 'renderer page reachable')
    page.on('pageerror', error => console.log(`[PAGE ERROR] ${error.message}`))
    page.on('console', message => {
      if (message.type() === 'error') console.log(`[PAGE CONSOLE ERROR] ${message.text()}`)
    })
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1500)
    await setupProject(page)
    await installObserver(page)

    // 1. Empty editor + insert: direct write succeeds and reveals first change.
    await ensureMainEditor(page, '')
    scenario = 'home-empty-insert'
    await sendHome(page, '请把风暴开场写入编辑器', '已写入编辑器：1 条')
    const emptyContent = await activeTabContent(page)
    assert.equal(emptyContent, 'AI 直写第一段：风暴中的旧信。', 'empty editor insert writes exactly once')
    const emptyObserver = await observe(page)
    writeEvidence('debug-empty-observer.json', emptyObserver)
    assert(emptyObserver.diffLocate.length >= 1, 'empty insert reveals first change')
    assert(await page.locator('.chat-edit-command .chat-direct-write-badge').count() > 0, 'direct write badge is visible')
    await capture(page, '01-home-empty-insert')

    // 2. Unique replace target: write succeeds, then rollback restores content.
    await ensureMainEditor(page, BASE_EDITOR)
    scenario = 'home-replace-rollback'
    await sendHome(page, '请修改第二章内容', '已写入编辑器：1 条')
    let replaced = await activeTabContent(page)
    assert(replaced.includes('男主确认了寄信人身份'), 'unique replace target is written')
    const rollbackButton = page.locator('.chat-edit-command button', { hasText: '回滚此批次' }).last()
    await rollbackButton.click()
    await page.waitForFunction(() => {
      const store = window.__pinia?._s?.get('editor')
      const tab = store?.tabs?.find(item => item.id === store.activeTabId) || store?.tabs?.[0]
      return (tab?.content || '').includes('男主在灯塔下发现旧信')
    }, null, { timeout: 10000 })
    assert.equal(await activeTabContent(page), BASE_EDITOR, 'rollback restores exact original content')
    await capture(page, '02-home-replace-rollback')

    // 3. Ambiguous target: write is rejected and text is unchanged.
    await ensureMainEditor(page, '重复目标。\n中间内容。\n重复目标。')
    scenario = 'home-ambiguous'
    await sendHome(page, '请替换重复目标', '已处理当前请求。')
    const ambiguousContent = await activeTabContent(page)
    assert(ambiguousContent.includes('重复目标。') && !ambiguousContent.includes('不应写入。'), 'ambiguous target does not change editor')
    const ambiguousRun = await latestRun(page, 'home')
    const ambiguousWrites = (ambiguousRun?.apiCalls || []).flatMap(call => call.toolCalls || []).filter(call => call.name === 'editor.write')
    const ambiguousWrite = ambiguousWrites.at(-1)
    assert.equal(ambiguousWrite?.status, 'failed', 'ambiguous write is recorded as failed')
    assert(
      String(ambiguousWrite?.error || '').includes('目标片段出现多次'),
      `ambiguous error explains the fix: ${ambiguousWrite?.error}`,
    )
    await capture(page, '03-home-ambiguous-target')

    // 4. User modification blocks rollback.
    await ensureMainEditor(page, BASE_EDITOR)
    scenario = 'home-replace-rollback'
    await sendHome(page, '请再次修改第二章内容', '已写入编辑器：1 条')
    await page.evaluate(() => {
      const store = window.__pinia?._s?.get('editor')
      store.activeTab.content += '\n用户手动补充。'
    })
    await sleep(200)
    await page.locator('.chat-edit-command button', { hasText: '回滚此批次' }).last().click()
    try {
      await page.waitForFunction(() => {
        const message = document.querySelector('.app-confirm-message')?.textContent || ''
        return message.includes('编辑器内容在批次应用后已有修改')
      }, null, { timeout: 10000 })
    } catch (error) {
      console.log(await page.evaluate(() => ({
        confirmText: document.querySelector('.app-confirm-message')?.textContent || null,
        confirmVisible: Boolean(document.querySelector('.app-confirm-overlay')),
        bodyHasAlert: (document.body.textContent || '').includes('编辑器内容在批次应用后已有修改'),
        rollbackButtons: [...document.querySelectorAll('.chat-edit-command button')].map(item => item.textContent),
      })))
      throw error
    }
    await page.locator('.app-confirm-overlay .btn-primary').click()
    await page.waitForSelector('.app-confirm-overlay', { state: 'detached', timeout: 10000 })
    const modifiedContent = await activeTabContent(page)
    assert(modifiedContent.includes('用户手动补充。') && modifiedContent.includes('男主确认了寄信人身份'), 'user edit blocks automatic rollback')
    await capture(page, '04-home-rollback-blocked')

    // 5. Large document uses instant reveal without streaming animation.
    const largeContent = `${BASE_EDITOR}\n${Array.from({ length: 3005 }, (_, index) => `大文档第 ${index + 1} 行。`).join('\n')}`
    await ensureMainEditor(page, largeContent)
    scenario = 'home-large-instant'
    await sendHome(page, '请在大文档尾部追加内容', '已写入编辑器：1 条')
    assert((await activeTabContent(page)).endsWith('大文档直写尾部追加。'), 'large document receives the final write')
    const largeObserver = await observe(page)
    assert.equal(largeObserver.follow.length, 0, 'large document skips streaming follow frames')
    assert(largeObserver.diffLocate.length >= 1, 'large document still reveals first change')
    await capture(page, '05-home-large-instant')

    // 6. Stream presentation emits follow progress and ends at final content.
    await ensureMainEditor(page, BASE_EDITOR)
    scenario = 'home-stream-follow'
    await sendHome(page, '请流式追加一段内容', '已写入编辑器：1 条')
    assert((await activeTabContent(page)).endsWith('流式呈现跟随验证段。'), 'stream write reaches final content')
    const streamObserver = await observe(page)
    assert(streamObserver.follow.length > 0, 'stream write emits editor-follow-progress')
    const homeStreamRun = await latestRun(page, 'home')
    assert(
      (homeStreamRun?.apiCalls || []).some(call => (call.events || []).some(event => event.type === 'editor-presentation-finished')),
      'home run trace records editor-presentation-finished',
    )
    await capture(page, '06-home-stream-follow')

    // 7. Discuss intent uses reveal without writing.
    await ensureMainEditor(page, BASE_EDITOR)
    scenario = 'home-reveal-discuss'
    await sendHome(page, '这段设定应该写在哪里？请帮我定位', '已处理当前请求。')
    const discussContent = await activeTabContent(page)
    assert.equal(discussContent, BASE_EDITOR, 'discuss reveal leaves editor unchanged')
    const discussObserver = await observe(page)
    assert(discussObserver.diffLocate.some(item => (BASE_EDITOR.slice(item.range?.start || 0, item.range?.end || 0) || '').includes('第二章内容')), 'discuss reveal points to the discussed fragment')
    const discussRun = await latestRun(page, 'home')
    const discussReveals = (discussRun?.apiCalls || []).flatMap(call => call.toolCalls || []).filter(call => call.name === 'editor.reveal')
    const discussReveal = discussReveals.at(-1)
    assert.equal(discussReveal?.status, 'success', 'discuss reveal succeeds in trace')
    await capture(page, '07-home-discuss-reveal')

    // 7a. A provider or model that attempts editor.write under discuss intent
    // must be stopped by the service-level permission gate, not by UI luck.
    await ensureMainEditor(page, BASE_EDITOR)
    scenario = 'home-permission-denied'
    await sendHome(page, '这段设定应该写在哪里？请帮我定位', '已处理当前请求。')
    const permissionContent = await activeTabContent(page)
    assert.equal(permissionContent, BASE_EDITOR, 'permission gate leaves editor unchanged')
    const permissionRun = await latestRun(page, 'home')
    const permissionWrites = (permissionRun?.apiCalls || []).flatMap(call => call.toolCalls || []).filter(call => call.name === 'editor.write')
    const deniedWrite = permissionWrites.at(-1)
    assert.equal(deniedWrite?.status, 'failed', 'forced discuss write is rejected')
    assert(
      String(deniedWrite?.error || '').includes('不允许编辑器写入'),
      `permission denial is user readable: ${deniedWrite?.error}`,
    )
    assert(
      (permissionRun?.traceEvents || []).some(event => event.type === 'tool-permission-denied' && event.level === 'error'),
      'run trace records tool-permission-denied',
    )
    await capture(page, '07a-home-permission-denied')

    // 8. Write limit returns a structured result and prevents a second write.
    await ensureMainEditor(page, BASE_EDITOR)
    scenario = 'home-write-limit'
    await sendHome(page, '请连续追加两次内容', '已处理当前请求。')
    const limitContent = await activeTabContent(page)
    assert(limitContent.includes('第 1 次写入。') && !limitContent.includes('第 2 次写入。'), 'only the first write is applied')
    const limitRun = await latestRun(page, 'home')
    const homeTurnSurface = (limitRun?.turns || []).flatMap(turn => turn.actualToolSurface || []).map(tool => tool.name)
    const homeCallSurface = (limitRun?.apiCalls || []).flatMap(call => call.actualToolSurface || []).map(tool => tool.name)
    assert(
      homeTurnSurface.includes('editor.write'),
      'home run trace records the actual editor.write tool surface',
    )
    assert(
      homeCallSurface.includes('editor.write'),
      'home API trace records the actual editor.write tool surface',
    )
    assert.equal(
      [...new Set(homeTurnSurface)].sort().join('|'),
      [...new Set(homeCallSurface)].sort().join('|'),
      'home turn and API traces share one actual tool surface',
    )
    const homeEventSurface = (limitRun?.traceEvents || [])
      .filter(event => event.type === 'api-start')
      .flatMap(event => parseTraceDetail(event.detail)?.actualToolSurface || [])
      .map(tool => tool.name)
    assert(
      homeEventSurface.includes('editor.write'),
      'home run trace event records the actual editor.write tool surface',
    )
    assert.equal(
      [...new Set(homeEventSurface)].sort().join('|'),
      [...new Set(homeCallSurface)].sort().join('|'),
      'home API event and API call traces share one actual tool surface',
    )
    const limitCalls = (limitRun?.apiCalls || []).flatMap(call => call.toolCalls || []).filter(call => call.name === 'editor.write')
    const limitFirstWrite = limitCalls.find(call => String(call.input?.commands?.[0]?.content || '').includes('第 1 次写入'))
    const limitSecondWrite = limitCalls.find(call => String(call.input?.commands?.[0]?.content || '').includes('第 2 次写入'))
    const limitAttempt = limitSecondWrite || limitCalls.find(call => call.callId && call.callId !== limitFirstWrite?.callId)
    assert.equal(limitAttempt?.status, 'failed', 'second write is rejected')
    assert.equal(limitAttempt?.error, '本次任务只允许 1 次编辑器写入，请基于已写入结果直接结束请求', 'write limit error is user readable')
    await capture(page, '08-home-write-limit')

    // 9. Outline direct write succeeds when unlocked.
    scenario = 'outline-write'
    await openOutline(page)
    await page.locator('#outline-editor').fill(BASE_OUTLINE)
    await sleep(300)
    await sendOutline(page, '请修改第二章大纲', '已直接写入大纲')
    const outlineWritten = await outlineContent(page)
    assert(outlineWritten.includes('第二章大纲：男主确认寄信人身份。'), 'outline direct write applies unique replace')
    const outlineWriteRequests = requests.filter(item => item.scenario === 'outline-write')
    assert(
      outlineWriteRequests.at(-1)?.tools.includes('editor.write'),
      'outline write HTTP request really carries editor.write',
    )
    const outlineWriteRun = await latestRun(page, 'outline')
    const outlineTurnSurface = (outlineWriteRun?.turns || []).flatMap(turn => turn.actualToolSurface || []).map(tool => tool.name)
    const outlineCallSurface = (outlineWriteRun?.apiCalls || []).flatMap(call => call.actualToolSurface || []).map(tool => tool.name)
    assert(
      outlineTurnSurface.includes('editor.write'),
      'outline run trace records the actual editor.write tool surface',
    )
    assert(
      outlineCallSurface.includes('editor.write'),
      'outline API trace records the actual editor.write tool surface',
    )
    assert.equal(
      [...new Set(outlineTurnSurface)].sort().join('|'),
      [...new Set(outlineCallSurface)].sort().join('|'),
      'outline turn and API traces share one actual tool surface',
    )
    const outlineEventSurface = (outlineWriteRun?.traceEvents || [])
      .filter(event => event.type === 'api-start')
      .flatMap(event => parseTraceDetail(event.detail)?.actualToolSurface || [])
      .map(tool => tool.name)
    assert(
      outlineEventSurface.includes('editor.write'),
      'outline run trace event records the actual editor.write tool surface',
    )
    assert.equal(
      [...new Set(outlineEventSurface)].sort().join('|'),
      [...new Set(outlineCallSurface)].sort().join('|'),
      'outline API event and API call traces share one actual tool surface',
    )
    await capture(page, '09-outline-direct-write')

    // 10. Locked outline rejects write but keeps reveal available.
    await setOutlineContent(page, BASE_OUTLINE)
    await setProjectOutlineLocked(page, true)
    scenario = 'outline-locked-write'
    await sendOutline(page, '请继续写入大纲', '已处理当前请求。')
    const lockedAfterWrite = await outlineContent(page)
    assert(!lockedAfterWrite.includes('锁定态不应写入。'), 'locked outline rejects editor.write')
    const lockedWriteRun = await latestRun(page, 'outline')
    const lockedWrite = (lockedWriteRun?.apiCalls || [])
      .flatMap(call => call.toolCalls || [])
      .filter(call => call.name === 'editor.write')
      .at(-1)
    assert.equal(lockedWrite?.status, 'failed', `locked editor.write is recorded as failed: ${lockedWrite?.error}`)
    assert(
      String(lockedWrite?.error || '').includes('锁定') || String(lockedWrite?.error || '').includes('locked'),
      'locked editor.write failure explains the lock reason',
    )
    scenario = 'outline-locked-reveal'
    await sendOutline(page, '请定位第二章大纲', '已处理当前请求。')
    const lockedObserver = await observe(page)
    assert(lockedObserver.diffLocate.length >= 1, 'locked outline still supports reveal')
    const lockedRun = await latestRun(page, 'outline')
    const lockedReveal = (lockedRun?.apiCalls || [])
      .flatMap(call => call.toolCalls || [])
      .filter(call => call.name === 'editor.reveal')
      .at(-1)
    assert.equal(lockedReveal?.status, 'success', `locked reveal is recorded as success: ${lockedReveal?.error}`)
    await setProjectOutlineLocked(page, false)
    await capture(page, '10-outline-locked-reveal')

    // 11. Pipeline tool surface never contains interactive write tools.
    await page.evaluate(() => document.querySelector('#btn-close-outline-workspace')?.click())
    await sleep(300)
    scenario = 'pipeline-settings'
    await page.click('#btn-pipeline')
    await page.waitForSelector('#pipeline-panel', { timeout: 15000 })
    const pipelineBefore = requests.filter(item => item.scenario === 'pipeline-settings').length
    await page.evaluate(() => {
      const store = window.__pinia?._s?.get('pipeline')
      if (store) {
        store.currentStep = 0
        store.isGenerating = false
      }
    })
    await page.locator('#pl-book-word-count').fill('10')
    await page.locator('#pl-book-word-count').evaluate(element => element.dispatchEvent(new Event('change', { bubbles: true })))
    assert.equal(await page.locator('#btn-pl-confirm-outline').isDisabled(), false, 'pipeline confirm button is enabled by fixture word count')
    await page.locator('#btn-pl-confirm-outline').click()
    await page.waitForFunction(() => window.__pinia?._s?.get('pipeline')?.isGenerating === false, null, { timeout: 30000, polling: 250 })
    await page.waitForTimeout(1000)
    const pipelineRequests = requests.filter(item => item.scenario === 'pipeline-settings')
    assert(pipelineRequests.length > pipelineBefore, 'pipeline reaches the provider')
    assert(
      pipelineRequests.every(item => !item.tools.includes('editor.write') && !item.tools.includes('editor.reveal')),
      'pipeline requests expose no editor.write or editor.reveal',
    )
    await capture(page, '11-pipeline-tool-surface')

    // 12. Compatibility provider: HTTP tools rejection downgrades to JSON protocol write.
    await page.evaluate(() => document.querySelector('#btn-close-pl')?.click())
    await sleep(300)
    scenario = 'compatibility-first-tools'
    await ensureMainEditor(page, BASE_EDITOR)
    await sendHome(page, '请用兼容供应商直写', '兼容模式直写：本次编辑器写入已执行，但模型定位可靠性较低')
    scenario = 'compatibility-json-write'
    await sendHome(page, '请继续用兼容供应商直写补充段', '已写入编辑器：1 条')
    const compatibilityContent = await activeTabContent(page)
    assert(compatibilityContent.includes('兼容供应商直写补充段。'), 'compatibility JSON protocol writes editor')
    const compatibilityRequests = requests.filter(item => item.scenario === 'compatibility-first-tools')
    assert(compatibilityRequests.length > 0 && compatibilityRequests[0].tools.includes('editor.write'), 'first compatibility request sends native tools')
    assert(compatibilityRequests.length > 1 && compatibilityRequests[1].tools.length === 0, 'downgrade retry sends no tools')
    const compatibilityRun = await latestRun(page, 'home')
    assert(
      (compatibilityRun?.apiCalls || []).some(call => call.downgradeReason === 'compatibility_write'),
      'run trace marks compatibility_write',
    )
    await capture(page, '12-compatibility-json-write')

    // 13. Deep run trace export preserves write, reveal and presentation evidence.
    const exportResult = await exportLatestRun(page, 'home')
    assert(exportResult?.success, `trace export succeeds: ${exportResult?.reason || ''}`)
    const exported = JSON.parse(fs.readFileSync(path.join(exportResult.path, 'run-trace.json'), 'utf8'))
    const exportedPresentationEvents = exported.events?.filter(event => String(event.type || '').startsWith('editor-presentation')) || []
    assert(exportedPresentationEvents.length > 0, 'exported trace contains presentation events')
    writeEvidence('run-trace-export.json', exported)
    assertPass('exported run trace contains write/reveal/presentation evidence')
    await page.locator('#btn-editor-run-trace').click()
    await page.locator('#run-trace-panel').waitFor({ state: 'visible', timeout: 10000 })
    await capture(page, '13-run-trace-export')
    await page.locator('#run-trace-panel .modal-close').click()
    await page.locator('#run-trace-panel').waitFor({ state: 'hidden', timeout: 10000 })

    // 14. Diagnostics coverage: renderer and main process must both persist
    // the new direct-write events for SKILL debugging.
    const rendererDiag = await readRendererDiag(page)
    const mainDiag = await page.evaluate(async () => await window.electronAPI.diagRead())
    assertDiagCoverage(normalizeDiagEntries(rendererDiag), normalizeDiagEntries(mainDiag))
    const rendererNormalized = normalizeDiagEntries(rendererDiag)
    const mainNormalized = normalizeDiagEntries(mainDiag)
    const missingInMain = rendererNormalized
      .filter(entry => ['ai-service', 'ai-service/tool-call', 'ai-service/tool-capability', 'ai-service/editor-presentation', 'ai-service/editor-batch'].includes(entry.cat))
      .filter(entry => !mainNormalized.some(mainEntry => mainEntry.cat === entry.cat && mainEntry.msg === entry.msg))
    assert.equal(missingInMain.length, 0, 'all renderer direct-write diagnostics reach main-process storage')
    writeEvidence('diag-coverage.json', {
      passed: true,
      rendererCount: rendererNormalized.length,
      mainCount: mainNormalized.length,
      rendererCategories: Object.fromEntries(
        requiredDiagCategories().map(category => [category, diagCategories(rendererNormalized, category).length]),
      ),
      mainCategories: Object.fromEntries(
        requiredDiagCategories().map(category => [category, diagCategories(mainNormalized, category).length]),
      ),
      missingInMain: missingInMain.map(entry => ({ cat: entry.cat, msg: entry.msg })),
    })
    assertPass('diagnostic coverage evidence written')
    await page.locator('#btn-editor-run-trace').click()
    await page.locator('#run-trace-panel').waitFor({ state: 'visible', timeout: 10000 })
    await page.locator('#run-trace-panel .rt-tabs button').nth(1).click()
    await capture(page, '14-diagnostics-coverage')
    await page.locator('#run-trace-panel .modal-close').click()
    await page.locator('#run-trace-panel').waitFor({ state: 'hidden', timeout: 10000 })

    writeEvidence('e2e-mock-requests.json', requests.map(({ scenario: itemScenario, requestCount, tools }) => ({ scenario: itemScenario, requestCount, tools })))
    writeEvidence('e2e-result.json', {
      passed: true,
      scenarios: 15,
      mode: RUN_SUFFIX,
      screenshots: fs.readdirSync(SCREENSHOT_DIR).filter(file => file.endsWith('.png')),
      exportPath: exportResult.path,
    })
    console.log('===== API DIRECT WRITE V2 E2E PASSED =====')
  } finally {
    try { if (browser) await browser.close() } catch {}
    try { execFileSync('taskkill', ['/PID', String(electronProcess.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
    server.close()
    await sleep(1000)
    removeDir(PROFILE)
    removeDir(EXPORT_ROOT)
    console.log('[CLEANUP] profile and temporary exports removed')
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
