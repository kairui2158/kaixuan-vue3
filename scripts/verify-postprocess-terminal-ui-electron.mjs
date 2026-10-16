import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9291
const MOCK_PORT = 59893
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const PROFILE = path.join(ROOT, '_data', 'postprocess-terminal-ui-profile')
const SKILL_DIR = path.join(PROFILE, 'skills', 'postprocess-terminal-ui')
const SKILL_ID = 'folder:postprocess-terminal-ui'
const PROVIDER_ID = 'postprocess-terminal-ui-provider'
const MODEL = 'postprocess-terminal-ui-model'
const EVIDENCE_DIR = path.join(ROOT, 'output', 'playwright', 'postprocess-terminal-ui')
const RUN_LOG_PATH = path.join(EVIDENCE_DIR, 'electron-run.log')
const RENDERER_INDEX = path.join(ROOT, 'dist-renderer', 'index.html')
const OUTLINE_OUTPUT = '大纲工作台 postProcess 警告终态真实输出。'
const CHAT_OUTPUT = '主页编辑器 postProcess 警告终态真实输出。'
const VERIFICATION_STARTED_AT = Date.now()

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
  console.log('[PASS] ' + message)
}

function writeRunLog(step, data) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  const body = typeof data === 'string' ? data : JSON.stringify(data)
  fs.appendFileSync(RUN_LOG_PATH, `[${new Date().toISOString()}] ${step} ${body}\n`, 'utf8')
}

function assertFreshProductionRenderer() {
  assert(fs.existsSync(RENDERER_INDEX), 'production renderer exists before Electron launch')
  const bundledFiles = fs.readdirSync(path.join(ROOT, 'dist-renderer', 'assets'), { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
    .map(entry => fs.readFileSync(path.join(ROOT, 'dist-renderer', 'assets', entry.name), 'utf8'))
  assert(bundledFiles.length > 0, 'production renderer bundle exists')
  const allJs = bundledFiles.join('\n')
  assert(
    allJs.includes('postProcess 完成但保留警告'),
    'renderer bundle contains the new postProcess warning label',
  )
  assert(
    !allJs.includes('runStatus:`degraded`,eventReason:`post-process-degraded`')
      && !allJs.includes('post-process-degraded`'),
    'renderer bundle no longer contains the stale warning-to-degraded mapping',
  )
  const sourceOutline = fs.readFileSync(path.join(ROOT, 'src', 'components', 'common', 'OutlineWorkspace.vue'), 'utf8')
  const sourceChat = fs.readFileSync(path.join(ROOT, 'src', 'components', 'chat', 'ChatPanel.vue'), 'utf8')
  assert(
    sourceOutline.includes('postProcess 完成但保留警告') && sourceChat.includes('postProcess 完成但保留警告'),
    'source and renderer both use the postProcess warning label',
  )
}

function writeSkillFolder() {
  fs.mkdirSync(SKILL_DIR, { recursive: true })
  fs.writeFileSync(path.join(SKILL_DIR, 'SKILL.md'), [
    '---',
    'id: postprocess-terminal-ui',
    'name: postProcess 警告终态验证',
    'description: 验证工作台真实 UI 的 success_with_warnings 终态链路',
    '---',
    '',
    '你是 postProcess 警告终态验证技能，只输出当前请求的定稿文本。',
  ].join('\n'), 'utf8')
  fs.writeFileSync(path.join(SKILL_DIR, 'template.md'), '输出一段简短中文定稿文本。', 'utf8')
  fs.writeFileSync(path.join(SKILL_DIR, 'script.js'), [
    "module.exports = {",
    "  postProcess: function (output) {",
    "    return {",
    "      output: output.replace(/。$/, '！'),",
    "      valid: true,",
    "      issues: [{",
    "        code: 'style-note',",
    "        severity: 'non-blocking',",
    "        message: '保留建议：本段仍可通过 postProcess 警告终态在 UI 呈现'",
    "      }]",
    "    }",
    "  }",
    "}",
  ].join('\n'), 'utf8')
}

let providerPhase = 'outline'
const providerRequests = []

const server = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    let body = null
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    const index = providerRequests.length + 1
    providerRequests.push({ phase: providerPhase, index, url: request.url, body })
    writeRunLog('provider-request', { phase: providerPhase, index })
    const output = providerPhase === 'outline' ? OUTLINE_OUTPUT : CHAT_OUTPUT

    if (body?.stream === false) {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({
        id: `chatcmpl-postprocess-terminal-ui-${index}`,
        object: 'chat.completion',
        choices: [{ index: 0, message: { role: 'assistant', content: output }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      }))
      return
    }

    const events = [
      { choices: [{ delta: { content: output }, finish_reason: null }] },
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
    {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, SHENYI_PROVIDER_NET_TRACE: '1' },
    },
  )
  electronProcess.stdout.on('data', data => writeRunLog('electron:stdout', String(data).slice(0, 2000)))
  electronProcess.stderr.on('data', data => writeRunLog('electron:stderr', String(data).slice(0, 2000)))
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

async function closeProjectModal(page) {
  await page.evaluate(() => {
    document.querySelector('.project-modal-content .btn-close')?.click()
  })
  await sleep(300)
}

async function reloadApp(page) {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20000 })
  await sleep(1200)
  await closeProjectModal(page)
}

async function getTraceEvidence(page, source) {
  return await page.evaluate(([sourceName, startedAt]) => {
    const store = window.__pinia?._s?.get('runTrace')
    const runs = (store?.runs || []).filter(run =>
      run.source === sourceName && run.sessionKind === 'chat' && run.startedAt >= startedAt)
    const run = runs.at(-1) || null
    if (!run) return { run: null, turn: null, event: null, finishedEvent: null }
    const turn = (run.turns || []).at(-1) || null
    const event = (run.events || []).filter(item => item.type === 'post-process-warning').at(-1) || null
    const finishedEvent = (run.events || []).filter(item => item.type === 'turn-finished').at(-1) || null
    return { run, turn, event, finishedEvent }
  }, [source, VERIFICATION_STARTED_AT])
}

async function waitForPostProcessTurn(page, source, timeout = 90000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const evidence = await getTraceEvidence(page, source)
    if (evidence.turn?.status === 'success_with_warnings' && evidence.event) return evidence
    await sleep(300)
  }
  const evidence = await getTraceEvidence(page, source)
  fs.writeFileSync(
    path.join(EVIDENCE_DIR, `${source}-timeout-evidence.json`),
    JSON.stringify(evidence, null, 2),
    'utf8',
  )
  throw new Error(`timeout waiting for ${source} postProcess terminal evidence: ${JSON.stringify(evidence).slice(0, 8000)}`)
}

async function assertUiEvidence(page, source, name) {
  const evidence = await waitForPostProcessTurn(page, source)
  assert(evidence.event?.type === 'post-process-warning', `${name}: trace emits post-process-warning`)
  assert(evidence.event?.level === 'warn', `${name}: warning event level is warn (actual=${evidence.event?.level})`)
  assert(
    String(evidence.event?.label || '').includes('postProcess 完成但保留警告'),
    `${name}: user-facing event label is postProcess 完成但保留警告 (actual=${evidence.event?.label})`,
  )
  assert(evidence.turn?.status === 'success_with_warnings', `${name}: turn terminal status is success_with_warnings (actual=${evidence.turn?.status})`)
  assert(
    evidence.finishedEvent?.level === 'warn' && String(evidence.finishedEvent?.label || '').includes('完成（带警告）'),
    `${name}: turn-finished label is 完成且带警告 (actual=${evidence.finishedEvent?.label})`,
  )
  writeRunLog(`${source}-evidence`, {
    runId: evidence.run?.id,
    turnId: evidence.turn?.id,
    turnStatus: evidence.turn?.status,
    event: evidence.event,
    finishedEvent: evidence.finishedEvent,
  })
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `${source}-success-with-warnings.png`), fullPage: true })
  return evidence
}

async function main() {
  fs.rmSync(EVIDENCE_DIR, { recursive: true, force: true })
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  fs.rmSync(PROFILE, { recursive: true, force: true })
  writeSkillFolder()
  assertFreshProductionRenderer()
  await new Promise(resolve => server.listen(MOCK_PORT, '127.0.0.1', resolve))
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
    page.on('pageerror', error => writeRunLog('page-error', error.message))
    page.on('console', message => {
      if (['error', 'warning'].includes(message.type())) {
        writeRunLog('page-console', `${message.type()}: ${message.text()}`)
      }
    })
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1500)
    await closeProjectModal(page)

    await page.evaluate(async ({ providerConfig, skill, coCreationConfig }) => {
      await window.electronAPI.storageWrite('wa_lastProjectId', 'default')
      await window.electronAPI.storageWrite('wa_providers', providerConfig)
      await window.electronAPI.storageWrite('wa_skills', { skills: [skill], pipelineSkills: [] })
      await window.electronAPI.storageWrite('wa_pipeline_step_config', {
        agents: { 0: '', 1: '', 2: '', 3: '', 4: '' },
        skills: { 0: ['folder:postprocess-terminal-ui'], 1: [], 2: [], 3: [], 4: [] },
        modes: { 0: 'chain', 1: 'compose', 2: 'chain', 3: 'chain', 4: 'chain' },
        skillAgents: {},
      })
      await window.electronAPI.storageWrite('wa_co_creation_config', coCreationConfig)
      await window.electronAPI.storageWrite('wa_deAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
      await window.electronAPI.storageRemove('wa_pipeline_breakpoint')
    }, {
      providerConfig: {
        providers: [{
          id: PROVIDER_ID,
          name: 'PostProcess Terminal UI Mock',
          baseUrl: MOCK_BASE_URL,
          apiKey: 'postprocess-terminal-ui-key',
          models: [MODEL],
          selectedModel: MODEL,
          temperature: 0.1,
          maxTokens: 4096,
          purpose: ['generate'],
          providerType: 'openai-compatible',
          streamMode: false,
        }],
        generateProvider: PROVIDER_ID,
      },
      skill: {
        id: SKILL_ID,
        sourceId: 'postprocess-terminal-ui',
        name: 'postProcess 警告终态验证',
        format: 'folder',
        folderPath: SKILL_DIR,
        template: '输出一段简短中文定稿文本。',
        category: 'folder',
        description: '验证工作台真实 UI 的 success_with_warnings 终态链路',
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
      coCreationConfig: {
        agentId: '',
        skillIds: [SKILL_ID],
        mode: 'chain',
        skillAgents: {},
      },
    })
    await reloadApp(page)

    providerPhase = 'outline'
    const outlineRequestCountBefore = providerRequests.length
    await page.click('#btn-outline-workspace')
    await page.waitForSelector('#outline-workspace', { timeout: 10000 })
    await page.click('#btn-ai-co-create')
    await page.locator('#ow-chat-input').waitFor({ state: 'visible', timeout: 10000 })
    await page.waitForFunction(() => {
      const button = document.querySelector('#btn-ow-send')
      return Boolean(button && !button.disabled)
    }, null, { timeout: 10000, polling: 250 })
    await page.locator('#ow-chat-input').fill('生成一段大纲 postProcess 警告终态验证文本')
    await page.locator('#ow-chat-input').evaluate(element => element.dispatchEvent(new Event('change', { bubbles: true })))
    await page.locator('#btn-ow-send').click()
    await assertUiEvidence(page, 'outline', 'outline workspace')
    assert(providerRequests.length > outlineRequestCountBefore, `outline workspace made a real provider request (${providerRequests.length - outlineRequestCountBefore})`)
    await page.click('#btn-close-outline-workspace')
    await sleep(500)

    providerPhase = 'home'
    const homeRequestCountBefore = providerRequests.length
    await page.locator('#user-input').waitFor({ state: 'visible', timeout: 10000 })
    await page.locator('#user-input').fill('生成一段主页 postProcess 警告终态验证文本')
    await page.locator('#user-input').evaluate(element => element.dispatchEvent(new Event('change', { bubbles: true })))
    await page.locator('#btn-send').click()
    await assertUiEvidence(page, 'home', 'home editor')
    assert(providerRequests.length > homeRequestCountBefore, `home editor made a real provider request (${providerRequests.length - homeRequestCountBefore})`)

    assert(providerRequests.length >= 2, `verification made real provider requests (${providerRequests.length})`)
    console.log('\n===== POSTPROCESS TERMINAL UI E2E PASSED =====')
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
