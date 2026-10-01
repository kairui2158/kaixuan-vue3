import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9247
const PROFILE = path.join(ROOT, '_data', 'product-validity-status-e2e-profile')
const DATA_DIR = path.join(PROFILE, 'app-data')
const EXPORT_DIR = path.join(ROOT, '_data', 'product-validity-status-e2e-export')
const SKILL_DIR = path.join(PROFILE, 'skills', 'product-validity-folder')
const MOCK_PORT = 59892
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const PROVIDER_ID = 'product-validity-e2e-provider'
const MODEL = 'product-validity-e2e-model'
const OUTLINE_TEXT = '第一卷 风暴起点\n北方风暴逼近，主角发现旧信。'

function writeFolderSkill() {
  fs.mkdirSync(SKILL_DIR, { recursive: true })
  fs.writeFileSync(path.join(SKILL_DIR, 'SKILL.md'), [
    '---',
    'id: product-validity-folder',
    'name: 产物有效性验证技能',
    'description: 验证 folder 模板优先级与 postProcess 阻断',
    '---',
    '',
    '入口说明正文。'
  ].join('\n'), 'utf8')
  fs.writeFileSync(path.join(SKILL_DIR, 'template.md'), 'folder自有模板：只输出当前卷名称。', 'utf8')
  fs.writeFileSync(path.join(SKILL_DIR, 'script.js'), [
    'module.exports = {',
    '  postProcess(output) {',
    "    return { output, valid: false, issues: [{ code: 'lost-core-volume', severity: 'blocking', message: '缺少核心卷结构' }] }",
    '  }',
    '}'
  ].join('\n'), 'utf8')
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

const providerRequests = []
let responseScenario = 'reasoning-exhausted'

const server = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    let body = null
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    providerRequests.push(body)

    if (responseScenario === 'reasoning-to-body') {
      const events = [
        { choices: [{ delta: { reasoning_content: '先规划当前卷的结构。' }, finish_reason: null }] },
        { choices: [{ delta: { content: '第一卷 正文可用产物。' }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: 'length' }] }
      ]
      const stream = events.map(event => `data: ${JSON.stringify(event)}`).join('\n\n') + '\n\ndata: [DONE]\n\n'
      response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' })
      response.end(stream)
      return
    }

    const content = responseScenario === 'blocked-issue' ? 'blocked-output' : ''
    const reasoning = responseScenario === 'reasoning-exhausted' ? '模型把输出预算全部耗在思考里。'.repeat(80) : ''
    const events = [
      { choices: [{ delta: { reasoning_content: reasoning }, finish_reason: null }] },
      { choices: [{ delta: { content }, finish_reason: 'length' }] }
    ]
    const stream = events.map(event => `data: ${JSON.stringify(event)}`).join('\n\n') + '\n\ndata: [DONE]\n\n'
    response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' })
    response.end(stream)
  })
})

let electronProcess = null
function startElectron() {
  electronProcess = spawn(ELECTRON_EXE, [
    '.',
    `--remote-debugging-port=${CDP_PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${PROFILE}`
  ], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SHENYI_TEST_USER_DATA_DIR: DATA_DIR,
      SHENYI_ALLOW_TEST_ISOLATION: '1',
      SHENYI_DATA_DIR: path.join(PROFILE, 'documents-data'),
      SHENYI_TEST_RUN_TRACE_EXPORT: EXPORT_DIR
    },
    windowsHide: true
  })
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
  try { execFileSync('taskkill', ['/PID', String(electronProcess.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
  electronProcess = null
}

function removeTempDir(dir) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try { fs.rmSync(dir, { recursive: true, force: true }); return } catch {}
  }
  console.warn('[WARN] temp cleanup failed: ' + dir)
}

async function exportRun(runId, suffix) {
  const result = await page.evaluate(async ({ id, suffix }) => {
    const store = window.__pinia._s.get('runTrace')
    const run = window.__pinia.state.value.runTrace.runs.find(item => item.id === id)
    const payload = {
      schema: 'shenyi.run-trace',
      version: 2,
      run: JSON.parse(JSON.stringify(store.exportRunToJson(run))),
      mode: 'deep'
    }
    payload.run.id = `${payload.run.id}-${suffix.label}`
    payload.run.startedAt = 1789999999000 + suffix.offset * 1000
    payload.run.sessionKind = 'task'
    payload.run.stepName = '卷纲层'
    return window.electronAPI.runTraceExport(payload)
  }, { id: runId, suffix })
  assert(result?.success === true, `run export should succeed: ${result?.reason}`)
  console.log('[DEBUG] export path: ' + result?.path)
  const runTrace = JSON.parse(fs.readFileSync(path.join(result.path, 'run-trace.json'), 'utf8'))
  const payload = (ref) => {
    const id = ref?.__payload?.duplicateOf || ref?.__payload?.id
    if (id && ref?.__payload?.value !== undefined) return ref.__payload.value
    if (!id) return null
    const file = fs.readdirSync(path.join(result.path, 'payloads'))
      .find(name => name.endsWith('.json') && fs.readFileSync(path.join(result.path, 'payloads', name), 'utf8').includes(`"id": "${id}"`))
    return file ? JSON.parse(fs.readFileSync(path.join(result.path, 'payloads', file), 'utf8')) : null
  }
  runTrace.apiCalls?.forEach(call => {
    call.requestMessages = payload(call.requestMessages) || call.requestMessages
    call.responseText = payload(call.responseText) || call.responseText
    call.streamText = payload(call.streamText) || call.streamText
    call.reasoningText = payload(call.reasoningText) || call.reasoningText
    call.physicalCalls?.forEach(physical => {
      physical.requestMessages = payload(physical.requestMessages) || physical.requestMessages
      physical.responseText = payload(physical.responseText) || physical.responseText
      physical.streamText = payload(physical.streamText) || physical.streamText
      physical.reasoningText = payload(physical.reasoningText) || physical.reasoningText
    })
  })
  return runTrace
}

let page = null

async function main() {
  await new Promise(resolve => server.listen(MOCK_PORT, '127.0.0.1', resolve))
  fs.rmSync(PROFILE, { recursive: true, force: true })
  fs.rmSync(EXPORT_DIR, { recursive: true, force: true })
  fs.mkdirSync(EXPORT_DIR, { recursive: true })
  writeFolderSkill()
  startElectron()
  try {
    assert(await waitForCdp(), 'source Electron CDP reachable')
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    for (let index = 0; index < 24; index++) {
      const pages = browser.contexts()[0]?.pages() || []
      if (pages.length) { page = pages[0]; break }
      await sleep(500)
    }
    assert(page, 'renderer page reachable')
  page.on('pageerror', error => console.log('[PAGE ERROR] ' + error.message))
  page.on('console', message => {
    if (message.type() === 'log' || message.type() === 'error' || message.type() === 'warning') {
      const text = message.text()
      if (text.includes('productValidity') || text.includes('matching runs') || text.includes('volume generation state')) {
        console.log('[BROWSER] ' + text.slice(0, 6000))
      }
    }
  })
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1500)
    await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
    await sleep(500)

    await page.evaluate(async ({ providerConfig }) => {
      await window.electronAPI.storageWrite('wa_lastProjectId', 'default')
      await window.electronAPI.storageWrite('wa_providers', providerConfig)
      await window.electronAPI.storageWrite('wa_pipeline_step_config', {
        agents: { 0: '', 1: '', 2: '', 3: '', 4: '' },
        skills: { 0: [], 1: [], 2: [], 3: [], 4: [] },
        modes: { 0: 'compose', 1: 'compose', 2: 'compose', 3: 'chain', 4: 'chain' },
        skillAgents: {}
      })
    }, {
      providerConfig: {
        providers: [{
          id: PROVIDER_ID,
          name: 'Product Validity Mock',
          baseUrl: MOCK_BASE_URL,
          apiKey: 'validity-key',
          models: [MODEL],
          selectedModel: MODEL,
          temperature: 0.1,
          maxTokens: 4096,
          purpose: ['generate'],
          providerType: 'openai-compatible',
          streamMode: true
        }],
        generateProvider: PROVIDER_ID
      }
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1500)
    await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
    await sleep(500)

    // Scenario A: reasoning exhausts output budget, direct API gate must fail.
    const directRunId = await page.evaluate(async () => {
      const store = window.__pinia._s.get('runTrace')
      const runId = store.startRun({ source: 'pipeline', step: 2, stepName: '卷纲层', mode: 'direct' })
      const callId = store.startApiCall(runId, {
        step: 2,
        skillName: '直接 API',
        requestMessages: [{ role: 'user', content: '直接产物验证' }]
      })
      const response = await fetch('http://127.0.0.1:59892/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stream: true, messages: [{ role: 'user', content: '直接产物验证' }] })
      }).then(result => result.text())
      const result = {
        text: response.includes('content\":\"') ? 'first-volume' : '',
        reasoning: '模型把输出预算全部耗在思考里。',
        finishReason: 'length'
      }
      store.finishApiCall(runId, callId, {
        status: 'failed',
        responseText: result.text,
        finishReason: result.finishReason,
        error: '模型思考耗尽输出预算，未生成正文'
      })
      store.finishRun(runId, 'failed', '模型思考耗尽输出预算，未生成正文')
      return runId
    })
    let exported = await exportRun(directRunId, { label: 'a', offset: 1 })
    assert(exported.status === 'failed', 'scenario A run should be failed')
    assert(exported.apiCalls[0].status === 'failed', 'scenario A API should be failed')
    assert(exported.error?.includes('思考耗尽输出预算'), 'scenario A error should explain reasoning exhaustion')
    console.log('[PASS] A: reasoning exhaustion is failed with an explainable error')

    // Scenario B: reasoning then body plus length -> truncated/degraded trace state.
    responseScenario = 'reasoning-to-body'
    const streamRunId = await page.evaluate(async () => {
      const store = window.__pinia._s.get('runTrace')
      const runId = store.startRun({ source: 'pipeline', step: 2, stepName: '卷纲层', mode: 'stream' })
      const callId = store.startApiCall(runId, {
        step: 2,
        skillName: '流式 API',
        requestMessages: [{ role: 'user', content: '流式产物验证' }]
      })
      store.appendReasoning(runId, callId, '先规划当前卷的结构。')
      store.appendCumulativeStream(runId, callId, '第一卷 正文可用产物。')
      store.appendCumulativeStream(runId, callId, '第一卷 正文可用产物。完整收束。')
      store.finishApiCall(runId, callId, {
        status: 'degraded',
        responseText: '第一卷 正文可用产物。完整收束。',
        finishReason: 'length',
        error: '输出被截断，已自动续写合并；如仍不完整，请减少单步任务量或提高 maxTokens'
      })
      store.finishRun(runId, 'degraded', '输出被截断，已自动续写合并')
      return runId
    })
    exported = await exportRun(streamRunId, { label: 'b', offset: 2 })
    assert(exported.status === 'degraded', 'scenario B run should be degraded')
    assert(exported.apiCalls[0].status === 'degraded', 'scenario B API should be degraded')
    assert(exported.apiCalls[0].reasoningText === '先规划当前卷的结构。', 'scenario B reasoning should be recorded')
    assert(String(exported.apiCalls[0].streamText || '').includes('正文可用产物。完整收束。'), 'scenario B body stream should be recorded')
    assert(exported.events.some(event => event.type === 'api-degraded'), 'scenario B should record api-degraded event')
    console.log('[PASS] B: truncated output with body is degraded and trace-visible')

    // Scenario C/D: real pipeline folder execution.
    responseScenario = 'reasoning-to-body'
    await page.evaluate(async ({ folderSkill }) => {
      await window.electronAPI.storageWrite('wa_skills', { skills: [folderSkill], pipelineSkills: [], deAiSkills: [] })
      await window.electronAPI.storageWrite('wa_pipeline_step_config', {
        agents: { 0: '', 1: '', 2: '', 3: '', 4: '' },
        skills: { 0: [], 1: [], 2: [folderSkill.id], 3: [], 4: [] },
        modes: { 0: 'compose', 1: 'compose', 2: 'chain', 3: 'chain', 4: 'chain' },
        skillAgents: {}
      })
      await window.electronAPI.storageWrite('wa_deAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
      await window.electronAPI.storageRemove('wa_pipeline_breakpoint')
    }, {
      folderSkill: {
        id: 'folder:product-validity-folder',
        sourceId: 'product-validity-folder',
        name: '产物有效性验证技能',
        format: 'folder',
        folderPath: SKILL_DIR,
        template: 'compose合并模板',
        category: 'folder',
        description: '验证 folder 模板优先级与 postProcess 阻断',
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
        intents: ['generate']
      }
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1500)
    await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
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
    await sleep(500)
    await page.locator('#pl-steps .pl-step').nth(2).click()
    await page.waitForSelector('#pl-step-3-content', { state: 'visible' })
    await page.locator('#pl-volume-count').fill('1')
    await page.locator('#pl-volume-count').dispatchEvent('change')
    await sleep(500)
    await page.locator('#btn-pl-gen-volumes').click()

    console.log('[DEBUG] step state after click: ' + JSON.stringify(await page.evaluate(async () => {
      const storage = await window.electronAPI.storageRead('wa_pipeline_step_config')
      const skillStore = window.__pinia._s.get('skill')
      return {
        storage,
        skills: (skillStore?.skills || []).map(skill => ({ id: skill.id, name: skill.name, format: skill.format, folderPath: skill.folderPath }))
      }
    })))

    await page.waitForFunction(() => {
      const button = document.querySelector('#btn-pl-gen-volumes')
      if (button?.disabled) {
        const runs = window.__pinia.state.value.runTrace.runs
        const latest = runs[runs.length - 1]
        if (!window.__productValidityDebug) {
          window.__productValidityDebug = true
          console.log('[DEBUG] volume generation state:', JSON.stringify({
            runs: runs.map(run => ({
              id: run.id,
              status: run.status,
              calls: run.apiCalls.map(call => ({ name: call.skillName, status: call.status, error: call.error }))
            })),
            latestEvents: latest?.events?.slice(-12).map(event => ({ type: event.type, label: event.label, detail: event.detail }))
          }))
        }
      }
      return Boolean(button && !button.disabled)
    }, null, { timeout: 60000, polling: 300 })

    const folderRunId = await page.waitForFunction(() => {
      const runs = window.__pinia.state.value.runTrace.runs
      const isProductValidityCall = call => String(call.skillName || '').includes('产物有效性验证技能')
      const found = runs.filter(item => item.apiCalls.some(isProductValidityCall))
      const run = [...runs].reverse().find(item =>
        item.apiCalls.some(isProductValidityCall)
      )
      console.log('[DEBUG] matching runs:', JSON.stringify(found.map(item => ({
        id: item.id,
        status: item.status,
        calls: item.apiCalls.map(call => ({ name: call.skillName, status: call.status }))
      }))))
      return run?.status !== 'running' ? run?.id : false
    }, null, { timeout: 60000, polling: 300 })

    exported = await exportRun(folderRunId, { label: 'c', offset: 3 })
    assert(exported.status === 'failed', 'scenario C/D run should be failed')
    const folderCall = exported.apiCalls.find(call => String(call.skillName || '').includes('产物有效性验证技能'))
    assert(folderCall?.status === 'failed', 'scenario C/D API should be failed')
    assert(folderCall?.error?.includes('缺少核心卷结构'), 'scenario D should expose the blocking postProcess issue')
    assert(Array.isArray(exported.folderDiagnostics), 'scenario C/D should record folder diagnostics')
    const diagnosticsJson = JSON.stringify(exported.folderDiagnostics)
    assert(diagnosticsJson.includes('folder-template-priority'), 'scenario C should prioritize folder template')
    assert(!diagnosticsJson.includes('base-template-applied'), 'scenario C should not record the legacy base-template diagnostic')
    assert(diagnosticsJson.includes('post-process-issue:lost-core-volume'), 'scenario D should record the blocking postProcess diagnostic')
    const folderRequest = providerRequests
      .map(request => (request?.messages || []).map(message => String(message.content || '')).join('\n'))
      .find(text => text.includes('folder自有模板'))
    assert(folderRequest, 'scenario C request should carry the folder template')
    assert(!folderRequest?.includes('compose合并模板'), 'scenario C request should not carry the compose template')
    console.log('[PASS] C/D: folder template priority and blocking postProcess are trace-consistent')

    console.log('===== PRODUCT VALIDITY AND STATUS E2E PASSED =====')
  } finally {
    stopElectron()
    await new Promise(resolve => server.close(resolve))
    await sleep(1000)
    if (process.env.SHENYI_E2E_KEEP_PROFILE !== '1') removeTempDir(PROFILE)
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
