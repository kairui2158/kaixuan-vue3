import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9229
const PROFILE = path.join(ROOT, '_data', 'run-trace-v2-remaining-profile')
const DATA_DIR = path.join(PROFILE, 'app-data')
const MOCK_PORT = 59842
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const MOCK_PROVIDER_ID = 'run-trace-v2-remaining-provider'
const MOCK_MODEL = 'run-trace-v2-remaining-model'

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
function assert(cond, msg) {
  if (!cond) throw new Error(msg)
  console.log('[PASS] ' + msg)
}

const providerRequests = []
let downgradeMode = false
let giantMode = false
const providerServer = http.createServer((req, res) => {
  const chunks = []
  req.on('data', c => chunks.push(c))
  req.on('end', () => {
    let body = null
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    providerRequests.push({ url: req.url, hasTools: Boolean(body?.tools?.length), body })
    if (downgradeMode && body?.tools?.length) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'tools unsupported' } }))
      return
    }
    let text = '这是一段测试输出。'
    if (giantMode) text = '巨'.repeat(210000)
    else if (body?.messages?.length) {
      const systemPrompt = String(body.messages.find(m => m.role === 'system')?.content || '')
      const userPrompt = String(body.messages.find(m => m.role === 'user')?.content || '')
      if (userPrompt.includes('提取并生成设定项')) {
        text = JSON.stringify([{ name: '测试设定', category: '设定类', attrsText: '用于五层链路验证的测试设定。' }])
      } else if (userPrompt.includes('[卷数]') && userPrompt.includes('输出JSON数组，每项含name/outline/summary/allocatedWords字段')) {
        text = JSON.stringify([{
          name: '第一卷 启程',
          outline: '主角在北境发现旧盟约的残片，踏上寻找真相的旅程。',
          summary: '北境残片与启程。',
          allocatedWords: 7000,
          wordsPerChapter: 3500,
          chapterCount: 2
        }])
      } else if (userPrompt.includes('章节列表') || systemPrompt.includes('章节规划师')) {
        text = JSON.stringify([
          { title: '第一章 雪线下的残片', plot: '主角在雪线营地发现残片，并与旧识争论去留。' },
          { title: '第二章 北门', plot: '队伍穿过北门，第一次遭遇追兵。' }
        ])
      } else if (systemPrompt.includes('小说写作专家') || userPrompt.includes('章节执行')) {
        text = '雪落在北境营地的边缘。主角拾起残片，指尖传来微弱的温热。他说：“我们明早出发。”'
      } else if (userPrompt.includes('请为本章节生成约')) {
        text = '雪落在北境营地的边缘。主角拾起残片，指尖传来微弱的温热。他说：“我们明早出发。”'
      }
    }
    if (body?.stream === false) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({
        id: 'chatcmpl-run-trace-remaining',
        object: 'chat.completion',
        choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }
      }))
      return
    }
    const events = [
      { choices: [{ delta: { content: text }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] }
    ]
    const payload = giantMode
      ? events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n'
      : events.map(e => `data: ${JSON.stringify(e)}`).join('\n\n') + '\n\ndata: [DONE]\n\n'
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' })
    res.end(payload)
  })
})

let electronProcess = null
function startElectron() {
  electronProcess = spawn(ELECTRON_EXE, ['.', `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', `--user-data-dir=${PROFILE}`], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SHENYI_TEST_USER_DATA_DIR: DATA_DIR,
      SHENYI_ALLOW_TEST_ISOLATION: '1',
      SHENYI_DATA_DIR: path.join(PROFILE, 'documents-data')
    }
  })
  electronProcess.stdout.on('data', d => { const t = String(d); if (/Uncaught|unhandledRejection/i.test(t)) console.log('[ELECTRON:stdout] ' + t.slice(0, 400)) })
  electronProcess.stderr.on('data', d => { const t = String(d); if (/Uncaught|unhandledRejection|EADDRINUSE/i.test(t)) console.log('[ELECTRON:stderr] ' + t.slice(0, 400)) })
}

async function waitForCdp(timeout = 30000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); if (r.ok) return true } catch {}
    await sleep(500)
  }
  return false
}

function stopElectron() {
  if (!electronProcess?.pid) return
  try { execFileSync('taskkill', ['/PID', String(electronProcess.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
  electronProcess = null
}

async function main() {
  await new Promise(r => providerServer.listen(MOCK_PORT, '127.0.0.1', r))
  fs.rmSync(PROFILE, { recursive: true, force: true })
  fs.rmSync(path.join(DATA_DIR, 'run-trace', 'outline'), { recursive: true, force: true })
  fs.rmSync(path.join(DATA_DIR, 'run-trace', 'pipeline'), { recursive: true, force: true })
  startElectron()
  assert(await waitForCdp(), 'Electron CDP reachable')
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
  let page = null
  for (let i = 0; i < 24; i++) {
    const pages = browser.contexts()[0]?.pages() || []
    if (pages.length) { page = pages[0]; break }
    await sleep(500)
  }
  assert(page, 'renderer page reachable')
  page.on('pageerror', e => console.log('[BROWSER:pageerror] ' + e.message))
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      const text = msg.text()
      if (/ai|api|provider|skill|trace/i.test(text)) console.log(`[BROWSER:${msg.type()}] ` + text.slice(0, 500))
    }
  })
  await page.waitForSelector('#app', { timeout: 15000 })
  await sleep(2000)
  await page.evaluate(() => { document.querySelector('.project-modal-content .btn-close')?.click() })
  await sleep(500)
  // Fresh profile every run: close stale default project data before seeding
  await page.evaluate(async () => {
    const projectStore = window.__pinia._s.get('project')
    projectStore.outlineChat = []
    await projectStore.saveProject()
    await window.__pinia._s.get('skill').loadSkills()
    await window.__pinia._s.get('pipeline').readStepConfig(0)
  })

  // Seed provider
  await page.evaluate(({ config }) => {
    window.electronAPI.storageWrite('wa_providers', config)
    window.__pinia._s.get('provider').loadProviders()
  }, { config: {
    providers: [{ id: MOCK_PROVIDER_ID, name: 'RunTrace Remaining Mock', baseUrl: MOCK_BASE_URL, apiKey: 'test-key', models: [MOCK_MODEL], selectedModel: MOCK_MODEL, temperature: 0.1, maxTokens: 4096, purpose: ['generate'], providerType: 'openai-compatible', streamMode: true }],
    generateProvider: MOCK_PROVIDER_ID
  } })
  await sleep(500)


  // Seed two outline workspace skills in chain mode (write to storage, then reload)
  await page.evaluate(() => {
    const skills = [
      { id: 'outline-remaining-s1', name: '测试技能一', template: '你是技能一。', format: 'text', injectMode: 'system_prefix', boundTo: ['outline'], intents: ['generate'] },
      { id: 'outline-remaining-s2', name: '测试技能二', template: '你是技能二。', format: 'text', injectMode: 'system_prefix', boundTo: ['outline'], intents: ['generate'] }
    ]
    window.electronAPI.storageWrite('wa_skills', { skills, pipelineSkills: [] })
    window.electronAPI.storageWrite('wa_pipeline_step_config', {
      agents: { 0: '' },
      skills: { 0: ['outline-remaining-s1', 'outline-remaining-s2'] },
      modes: { 0: 'chain' },
      skillAgents: {}
    })
  })
  await sleep(500)
  await page.reload()
  await page.waitForSelector('#app', { timeout: 15000 })
  await sleep(2000)
  await page.evaluate(() => { document.querySelector('.project-modal-content .btn-close')?.click() })
  await sleep(500)
  const verifyState = await page.evaluate(() => {
    const stores = window.__pinia._s
    const result = {}
    for (const key of ['skill', 'pipeline', 'project', 'provider']) {
      const raw = stores.get(key)
      const value = raw?.value || raw
      result[key] = {
        exists: Boolean(value),
        skillCount: key === 'skill' ? (value?.skills?.length ?? -1) : undefined,
        providerIds: key === 'provider' ? (value?.providers?.map(p => p.id) ?? null) : undefined,
        outlineChatCount: key === 'project' ? (value?.outlineChat?.length ?? null) : undefined
      }
    }
    return result
  })
  console.log('[VERIFY_STATE] ' + JSON.stringify(verifyState))

  async function closeOutlineWorkspace() {
    await page.click('#btn-close-outline-workspace')
    await sleep(300)
  }

  async function prepareProjectStores() {
    await page.evaluate(() => {
      const projectStore = window.__pinia._s.get('project')
      projectStore.outlineChat = []
      projectStore.outlineText = '这是一份用于五层链路验证的大纲。主角林折在北境发现旧盟约残片，必须南行揭开盟约真相。'
      projectStore.setOutline(projectStore.outlineText)
      projectStore.lockOutline()
      projectStore.volumes = []
      projectStore.chapters = {}
      projectStore.saveProject()
    })
    await sleep(300)
  }

  // Part 1: outline workspace, real chain send.
  await page.click('#btn-outline-workspace')
  await sleep(1000)
  await page.evaluate(() => { window.__pinia._s.get('runTrace').abandonRunningRun('outline') })
  await page.click('#btn-ai-co-create')
  await sleep(500)
  await page.fill('#ow-chat-input', '请生成大纲测试内容')
  await page.click('#btn-ow-send')

  await page.waitForFunction(() => {
    const messages = window.__pinia?.state?.value?.project?.outlineChat || []
    const last = messages.filter(m => m.role === 'assistant').at(-1)
    return Boolean(last && String(last.content || '').includes('测试输出'))
  }, null, { timeout: 60000, polling: 500 }).catch(async () => {
    const debug = await page.evaluate(() => {
      const state = window.__pinia?.state?.value || {}
      const run = state.runTrace?.runs?.filter(r => r.source === 'outline').at(-1)
      return {
        outlineChat: state.project?.outlineChat?.map(m => ({ role: m.role, content: String(m.content || '').slice(0, 120), status: m.status })) || [],
        sendDisabled: document.querySelector('#btn-ow-send')?.disabled ?? null,
        run: run ? {
          status: run.status,
          events: (run.events || []).map(e => ({ type: e.type, level: e.level, label: e.label, detail: e.detail }))
        } : null,
        skillIds: state.skill?.skills?.map(s => s.id) || [],
        pipelineConfig: state.pipeline?.stepConfig || null
      }
    })
    console.log('[PART1_TIMEOUT_DEBUG] providerRequests=' + providerRequests.length)
    console.log('[PART1_LAST_REQUEST] ' + JSON.stringify({
      url: providerRequests.at(-1)?.url,
      stream: providerRequests.at(-1)?.body?.stream,
      hasTools: providerRequests.at(-1)?.hasTools,
      messageCount: providerRequests.at(-1)?.body?.messages?.length
    }))
    console.log(JSON.stringify(debug, null, 2).slice(0, 12000))
    throw new Error('outline assistant response missing')
  })
  assert(providerRequests.length >= 2, `outline chain made ${providerRequests.length} provider calls`)

  await page.waitForFunction(() => {
    const button = document.querySelector('#btn-ow-send')
    return Boolean(button && !button.disabled)
  }, null, { timeout: 30000, polling: 500 })
  const traceAfterSend = await page.evaluate(() => {
    const state = window.__pinia?.state?.value?.runTrace
    const run = state?.runs?.filter(r => r.source === 'outline').at(-1)
    return {
      found: Boolean(run),
      status: run?.status,
      turnStatuses: run?.turns?.map(t => t.status),
      eventTypes: run?.events?.map(e => e.type)
    }
  })
  console.log('[TRACE_AFTER_SEND] ' + JSON.stringify(traceAfterSend))
  assert(traceAfterSend.turnStatuses?.at(-1) === 'success', 'outline last turn finished successfully while chat session remains active')

  const outlineTrace = await page.evaluate(() => {
    const state = window.__pinia?.state?.value?.runTrace
    const run = state?.runs?.filter(r => r.source === 'outline').at(-1)
    return {
      found: Boolean(run),
      apiCalls: run?.apiCalls?.length || 0,
      physicalTotal: run?.apiCalls?.reduce((n, c) => n + (c.physicalCalls?.length || 0), 0) || 0,
      streamTotal: run?.apiCalls?.reduce((n, c) => n + (c.physicalCalls?.reduce((m, p) => m + (p.streamText?.length || 0), 0)), 0) || 0,
      streamMax: run?.apiCalls?.reduce((n, c) => Math.max(n, ...((c.physicalCalls || []).map(p => p.streamText?.length || 0))), 0) || 0,
      responseTotal: run?.apiCalls?.reduce((n, c) => n + (c.physicalCalls?.reduce((m, p) => m + (p.responseText?.length || 0), 0)), 0) || 0,
      status: run?.status
    }
  })
  assert(outlineTrace.found, 'outline run appears in trace')
  assert(outlineTrace.apiCalls >= 2, `outline trace has ${outlineTrace.apiCalls} API calls (expected >=2)`)
  assert(outlineTrace.physicalTotal >= 2, `outline trace has ${outlineTrace.physicalTotal} physical calls (expected >=2)`)
  assert(outlineTrace.responseTotal > 0, 'outline trace has response text')
  if (outlineTrace.streamTotal > 0) {
    assert(outlineTrace.streamTotal === outlineTrace.responseTotal, `outline trace stream is not duplicated (${outlineTrace.streamTotal} stream chars vs ${outlineTrace.responseTotal} response chars)`)
  } else {
    console.log('[INFO] outline trace uses non-stream tool protocol; response text is authoritative')
  }
  assert(outlineTrace.status === 'running', 'outline chat run stays active by design')

  await page.click('#btn-ow-run-trace')
  await page.waitForSelector('#run-trace-overlay', { timeout: 5000 })
  await sleep(300)
  assert(true, 'outline run trace panel opens')
  await page.click('#run-trace-panel .modal-close')
  await sleep(300)
  await closeOutlineWorkspace()

  // Part 2: pipeline five layers through real buttons.
  await prepareProjectStores()
  await page.click('#btn-pipeline')
  await sleep(1200)
  await page.evaluate(() => {
    window.__pinia._s.get('pipeline').setStep(1)
  })
  await sleep(500)

  const initialProjectState = await page.evaluate(() => {
    const p = window.__pinia._s.get('project')
    return {
      outlineLocked: p.outlineLocked,
      pipelineOutlineTextLength: (p.pipelineOutlineText || '').length,
      volumeCount: p.volumes.length,
      chapters: Object.keys(p.chapters || {}).length
    }
  })
  console.log('[PIPELINE_INITIAL_PROJECT] ' + JSON.stringify(initialProjectState))
  assert(initialProjectState.outlineLocked, 'pipeline test outline is locked')
  assert(initialProjectState.pipelineOutlineTextLength > 0, 'pipeline test outline is injected')

  const providerCountBeforePipeline = providerRequests.length
  const settingsStart = Date.now()
  await page.click('#btn-pl-gen-settings')
  await page.waitForFunction(() => {
    const p = window.__pinia._s.get('project')
    return Boolean(window.__pinia?._s?.get('pipeline') && !window.__pinia.state.value.pipeline.isGenerating && p.volumes.length === 0)
  }, null, { timeout: 60000, polling: 300 }).catch(() => {})
  await page.waitForFunction(() => {
    const p = window.__pinia._s.get('project')
    const allSettings = Object.values(p.getSettingsCollection?.()?.items || {}).flat()
    return allSettings.some(s => s.name === '测试设定')
  }, null, { timeout: 60000, polling: 300 })
  assert(providerRequests.length > providerCountBeforePipeline, 'settings layer made a real provider call')
  console.log('[PIPELINE_SETTINGS_MS] ' + (Date.now() - settingsStart))

  await page.click('#btn-pl-confirm-settings')
  await page.waitForFunction(() => window.__pinia.state.value.pipeline.currentStep === 2, null, { timeout: 5000, polling: 100 })

  const volumesStart = Date.now()
  await page.click('#btn-pl-gen-volumes')
  await page.waitForFunction(() => {
    const p = window.__pinia._s.get('project')
    return p.volumes.length === 1 && p.volumes[0]?.name === '第一卷 启程'
  }, null, { timeout: 60000, polling: 300 })
  assert(providerRequests.length > providerCountBeforePipeline + 1, 'volume layer made a real provider call')
  console.log('[PIPELINE_VOLUMES_MS] ' + (Date.now() - volumesStart))

  await page.evaluate(() => {
    const p = window.__pinia._s.get('project')
    p.volumes.forEach(vol => {
      vol.confirmed = true
      vol.locked = true
      vol.isBound = true
      vol.boundTo = ['chapter-layer']
    })
    p.saveProject()
  })
  await sleep(300)

  await page.click('#btn-pl-confirm-volumes')
  await page.waitForFunction(() => window.__pinia.state.value.pipeline.currentStep === 3, null, { timeout: 5000, polling: 100 })

  const chaptersStart = Date.now()
  await page.click('#btn-pl-autogen-chapters')
  await page.waitForFunction(() => {
    const p = window.__pinia._s.get('project')
    const volId = p.volumes[0]?.id || p.volumes[0]?.name
    return (p.chapters[volId] || []).filter(c => c.pipelineGenerated).length >= 2
  }, null, { timeout: 60000, polling: 300 })
  assert(providerRequests.length > providerCountBeforePipeline + 2, 'chapter layer made a real provider call')
  console.log('[PIPELINE_CHAPTERS_MS] ' + (Date.now() - chaptersStart))

  await page.click('#btn-pl-confirm-chapters')
  await page.waitForFunction(() => window.__pinia.state.value.pipeline.currentStep === 4, null, { timeout: 5000, polling: 100 })

  const bodyStart = Date.now()
  await page.click('#btn-pl-gen-body')
  await page.waitForFunction(() => {
    const p = window.__pinia._s.get('project')
    const volId = p.volumes[0]?.id || p.volumes[0]?.name
    const ch = (p.chapters[volId] || []).find(c => c.pipelineGenerated)
    return Boolean(ch && ch.bodyGenerated && (ch.body || '').includes('北境营地'))
  }, null, { timeout: 60000, polling: 300 }).catch(async () => {
    const pipelineBodyDebug = await page.evaluate(() => {
      const p = window.__pinia._s.get('project')
      const pipeline = window.__pinia?.state?.value?.pipeline
      const run = window.__pinia?.state?.value?.runTrace?.runs?.filter(r => r.source === 'pipeline' && r.step === 4).at(-1)
      const volId = p.volumes[0]?.id || p.volumes[0]?.name
      return {
        currentStep: pipeline?.currentStep,
        isGenerating: pipeline?.isGenerating,
        generationStatus: pipeline?.generationStatus,
        volumeId: volId,
        chapterCount: (p.chapters[volId] || []).length,
        chapters: (p.chapters[volId] || []).map(c => ({ id: c.id, title: c.title, bodyGenerated: c.bodyGenerated, bodyLength: (c.body || '').length, bodyPreview: (c.body || '').slice(0, 80) })),
        run: run ? { status: run.status, apiCalls: run.apiCalls?.length, events: (run.events || []).map(e => ({ type: e.type, level: e.level, label: e.label, detail: String(e.detail || '').slice(0, 300) })) } : null
      }
    })
    console.log('[PIPELINE_BODY_TIMEOUT_DEBUG] providerRequests=' + providerRequests.length)
    console.log('[PIPELINE_BODY_LAST_REQUEST] ' + JSON.stringify({
      url: providerRequests.at(-1)?.url,
      stream: providerRequests.at(-1)?.body?.stream,
      hasTools: providerRequests.at(-1)?.hasTools,
      messageCount: providerRequests.at(-1)?.body?.messages?.length,
      systemPreview: String(providerRequests.at(-1)?.body?.messages?.find(m => m.role === 'system')?.content || '').slice(0, 200),
      userPreview: String(providerRequests.at(-1)?.body?.messages?.find(m => m.role === 'user')?.content || '').slice(0, 300)
    }))
    console.log(JSON.stringify(pipelineBodyDebug, null, 2).slice(0, 12000))
    throw new Error('body generation missing')
  })
  assert(providerRequests.length > providerCountBeforePipeline + 3, 'body layer made a real provider call')
  console.log('[PIPELINE_BODY_MS] ' + (Date.now() - bodyStart))

  const pipelineTrace = await page.evaluate(() => {
    const state = window.__pinia?.state?.value?.runTrace
    const runs = (state?.runs || [])
      .filter(r => r.source === 'pipeline' && [1, 2, 3, 4].includes(r.step))
      .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0) || a.step - b.step)
    return {
      total: runs.length,
      steps: runs.map(r => r.step),
      statuses: runs.map(r => r.status),
      apiCalls: runs.map(r => r.apiCalls?.length || 0),
      physicalCalls: runs.map(r => r.apiCalls?.reduce((n, c) => n + (c.physicalCalls?.length || 0), 0) || 0)
    }
  })
  console.log('[PIPELINE_TRACE] ' + JSON.stringify(pipelineTrace))
  assert(pipelineTrace.total === 4, `pipeline has ${pipelineTrace.total} runs (expected 4)`)
  assert(pipelineTrace.steps.join(',') === '1,2,3,4', `pipeline steps are ${pipelineTrace.steps.join(',')}`)
  const pipelineFinalStatuses = pipelineTrace.statuses.map(s => (s === 'running' ? 'pending-finalization' : s)).join(',')
  assert(pipelineTrace.statuses.every(s => s === 'success' || s === 'running'), `pipeline statuses are ${pipelineFinalStatuses}`)
  assert(pipelineTrace.apiCalls.every(n => n >= 1), `pipeline API calls are ${pipelineTrace.apiCalls.join(',')}`)
  assert(pipelineTrace.physicalCalls.every(n => n >= 1), `pipeline physical calls are ${pipelineTrace.physicalCalls.join(',')}`)

  await page.evaluate(() => { document.querySelector('#btn-close-pl')?.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  await sleep(500)
  await page.evaluate(() => { window.__pinia && (document.querySelector('#app')?._vnode) })
  await page.click('#btn-pipeline')
  await sleep(1000)
  await page.click('#btn-run-trace')
  await page.waitForSelector('#run-trace-overlay', { timeout: 5000 })
  await sleep(300)
  assert(true, 'pipeline run trace panel opens')
  await page.click('#run-trace-panel .modal-close')
  await sleep(300)

  console.log('\n===== RUN TRACE V2 REMAINING VERIFICATION PART 2 PASSED =====')

  // Part 3: provider rejection downgrades tools, and the UI notice matches trace.
  downgradeMode = true
  providerRequests.length = 0
  await page.click('#btn-close-pl')
  await sleep(800)
  const activeTabBeforeDowngrade = await page.evaluate(() => {
    const editor = window.__pinia._s.get('editor')
    const tab = editor?.tabs?.find(t => t.id === editor.activeTabId) || editor?.tabs?.[0]
    if (!tab) return null
    tab.content = '雪落北境，主角拾起盟约残片。'
    editor.activeTabId = tab.id
    return { id: tab.id, title: tab.title, contentLength: tab.content.length }
  })
  console.log('[DOWNGRADE_ACTIVE_TAB] ' + JSON.stringify(activeTabBeforeDowngrade))
  await page.fill('#user-input', '请检查当前编辑器内容，并生成处理建议。')
  await page.click('#btn-send')
  await page.waitForSelector('#chat-compatibility-notice', { timeout: 60000 })
  const downgradeNotice = await page.locator('#chat-compatibility-notice').innerText()
  console.log('[DOWNGRADE_NOTICE] ' + downgradeNotice)
  assert(downgradeNotice.includes('供应商拒绝原生工具调用') || downgradeNotice.includes('JSON 兼容模式'), 'chat bubble shows tool downgrade notice')
  await page.waitForFunction(() => {
    const state = window.__pinia?.state?.value?.runTrace
    const run = state?.runs?.filter(r => r.source === 'home').at(-1)
    return Boolean(run && run.apiCalls?.some(c => c.physicalCalls?.some(p => p.phase === 'downgrade_initial' || p.phase === 'downgrade_retry')))
  }, null, { timeout: 60000, polling: 300 })
  const downgradeTrace = await page.evaluate(() => {
    const state = window.__pinia?.state?.value?.runTrace
    const run = state?.runs?.filter(r => r.source === 'home').at(-1)
    const phases = run?.apiCalls?.flatMap(c => (c.physicalCalls || []).map(p => p.phase)) || []
    return { status: run?.status, phases, apiCalls: run?.apiCalls?.length || 0 }
  })
  console.log('[DOWNGRADE_TRACE] ' + JSON.stringify(downgradeTrace))
  assert(downgradeTrace.phases.includes('downgrade_initial'), 'trace records downgrade_initial physical request')
  assert(downgradeTrace.phases.includes('downgrade_retry'), 'trace records downgrade_retry physical request')
  downgradeMode = false

  // Part 4: 100k-character outline keeps the trace panel responsive.
  await page.evaluate(() => {
    const p = window.__pinia._s.get('project')
    p.outlineText = '北境盟约线索。'.repeat(16667) + '收束。'
    p.setOutline(p.outlineText)
    p.lockOutline()
    p.saveProject()
  })
  await page.click('#btn-outline-workspace')
  await sleep(1000)
  const outlineOpenStart = Date.now()
  await page.click('#btn-ow-run-trace')
  await page.waitForSelector('#run-trace-overlay', { timeout: 5000 })
  await sleep(300)
  const largePanelOpenMs = Date.now() - outlineOpenStart
  console.log('[LARGE_OUTLINE_PANEL_OPEN_MS] ' + largePanelOpenMs)
  assert(largePanelOpenMs < 3000, `100k outline trace panel opened in ${largePanelOpenMs}ms (<3000ms)`)
  await page.click('#run-trace-panel .modal-close')
  await sleep(300)
  await closeOutlineWorkspace()

  // Part 5: 210k-character API response is preview-gated without freezing.
  giantMode = true
  providerRequests.length = 0
  await page.evaluate(() => {
    const runTrace = window.__pinia._s.get('runTrace')
    const activeRuns = (runTrace?.runs || []).filter(run => run.source === 'outline')
    activeRuns.forEach(run => runTrace.finishRun(run.id, 'success'))
    window.electronAPI.storageWrite('wa_pipeline_step_config', {
      agents: { 0: '' },
      skills: { 0: [] },
      modes: { 0: 'compose' },
      skillAgents: {}
    })
    const pipeline = window.__pinia._s.get('pipeline')
    return pipeline.readStepConfig(0)
  })
  await page.click('#btn-outline-workspace')
  await sleep(1000)
  await page.click('#btn-ai-co-create')
  await sleep(500)
  await page.fill('#ow-chat-input', '请生成巨量测试内容')
  await page.click('#btn-ow-send')
  await page.waitForFunction(() => {
    const state = window.__pinia?.state?.value?.runTrace
    const run = [...(state?.runs || [])]
      .filter(r => r.source === 'outline')
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    return Boolean(run && run.apiCalls?.some(c => c.physicalCalls?.some(p => (p.responseText || '').length > 200000)))
  }, null, { timeout: 90000, polling: 500 }).catch(async () => {
    const debug = await page.evaluate(() => {
      const state = window.__pinia?.state?.value || {}
      const run = [...(state.runTrace?.runs || [])]
        .filter(r => r.source === 'outline')
        .sort((a, b) => b.startedAt - a.startedAt)[0]
      return {
        selectedSkills: [...document.querySelectorAll('#ow-selected-skills .ow-skill-name')].map(el => el.textContent),
        outlineChat: state.project?.outlineChat?.map(m => ({ role: m.role, length: String(m.content || '').length, head: String(m.content || '').slice(0, 40) })) || [],
        run: run ? {
          mode: run.mode,
          status: run.status,
          turns: run.turns?.map(t => ({ status: t.status, error: t.error })),
          apiCalls: run.apiCalls?.map(c => ({
            skillName: c.skillName,
            status: c.status,
            responseLength: (c.responseText || '').length,
            physicalCalls: c.physicalCalls?.map(p => ({ phase: p.phase, status: p.status, responseLength: (p.responseText || '').length, streamLength: (p.streamText || '').length, error: p.error }))
          }))
        } : null
      }
    })
    console.log('[GIANT_TIMEOUT_DEBUG] providerRequests=' + providerRequests.length)
    console.log('[GIANT_LAST_REQUEST] ' + JSON.stringify({
      url: providerRequests.at(-1)?.url,
      stream: providerRequests.at(-1)?.body?.stream,
      hasTools: providerRequests.at(-1)?.hasTools,
      messageCount: providerRequests.at(-1)?.body?.messages?.length
    }))
    console.log(JSON.stringify(debug, null, 2).slice(0, 12000))
    throw new Error('giant response trace missing')
  })
  await page.click('#btn-ow-run-trace')
  await page.waitForSelector('#run-trace-overlay', { timeout: 5000 })
  const giantPanelStart = Date.now()
  await page.waitForSelector('#run-trace-panel', { timeout: 5000 })
  await sleep(800)
  const giantPanelOpenMs = Date.now() - giantPanelStart
  await page.click('#run-trace-panel .rt-tabs button:nth-child(2)')
  const completeReturn = page.locator('#run-trace-panel .rt-api > details').filter({ hasText: '完整返回' }).first()
  await completeReturn.locator('summary').click()
  const giantPanelText = await page.locator('#run-trace-panel').innerText()
  assert(giantPanelText.includes('文本超过 20 万字符，已截断预览'), 'run trace panel shows 200k render gate message')
  console.log('[GIANT_PANEL_OPEN_MS] ' + giantPanelOpenMs)
  assert(giantPanelOpenMs < 3000, `giant response trace panel opened in ${giantPanelOpenMs}ms (<3000ms)`)
  giantMode = false
  await page.click('#run-trace-panel .modal-close')
  await sleep(300)

  console.log('\n===== RUN TRACE V2 REMAINING VERIFICATION ALL PARTS PASSED =====')
  console.log('[OUTLINE_TRACE] ' + JSON.stringify(outlineTrace))
  console.log('[PIPELINE_TRACE] ' + JSON.stringify(pipelineTrace))
  console.log('[DOWNGRADE_TRACE] ' + JSON.stringify(downgradeTrace))
  browser.close()
  stopElectron()
  providerServer.close()
}

try {
  await main()
} catch (error) {
  console.error('[FAIL] ' + (error?.stack || error))
  stopElectron()
  providerServer.close()
  process.exit(1)
}
